// POST /api/webhook — Stripe webhook for payment confirmation
// Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET env vars.
// Optional: RESEND_API_KEY + RESEND_FROM + OWNER_EMAIL for transactional email.
//
// Correctness requirements handled here:
//  1. RAW BODY — Stripe signs the exact request bytes. Vercel's default parser
//     would turn the body into an object; re-stringifying it does NOT reproduce
//     the signed bytes and breaks (or masks) signature verification. We disable
//     the body parser (config below) and read the raw stream ourselves.
//  2. IDEMPOTENCY — Stripe delivers each event at-least-once. We claim each
//     event.id in Firestore before processing so a redelivery is acknowledged
//     without re-sending confirmation emails.
//  3. COVERAGE (A2) — the site has TWO payment flows. Stripe Checkout emits
//     checkout.session.completed ; Stripe Elements (create-payment-intent)
//     emits payment_intent.succeeded and NEVER a session event. Both are
//     handled. The PI handler only processes intents WE created directly
//     (metadata.source === 'pirates-tools') : the PaymentIntent under a
//     Checkout Session does not carry our metadata, so a card payment via
//     Checkout can never trigger a double email.
//  4. SERVER TRACE (A2) — every processed payment is journaled in the
//     Firestore `payments/{stripeId}` collection. Even if no client-side
//     order document ever appears (tab closed, Firestore client offline),
//     the money always leaves a server-side trace.
//  5. TAX CHECK (A1, détectif) — the charged tax territory comes from client
//     declaration. We compare it against the postal code of the real address
//     Stripe collected (shipping for Checkout, card billing for Elements) and
//     flag any mismatch in the payments journal + owner email so the order is
//     verified BEFORE shipping.

'use strict';

var getFirebase = require('./_lib/firebase').getFirebase;
var paiementSocle = require('./_lib/paiement');   // couture : fournisseur actif
var stripeMeta = require('./_lib/stripe-meta');
var postal = require('./_lib/postal');
var pricing = require('./_lib/pricing');
var catalog = require('./_lib/catalog');
var invoiceLib = require('./_lib/invoice');
var coursesLib = require('./_lib/courses');

// Identité vendeur (config/invoice) pour la facture ; défauts si absente.
async function loadSeller(fb) {
  var seller = Object.assign({}, invoiceLib.DEFAULT_SELLER);
  try {
    if (fb.db) {
      var doc = await fb.db.collection('config').doc('invoice').get();
      if (doc.exists) seller = Object.assign(seller, doc.data());
    }
  } catch (e) { /* défauts */ }
  return seller;
}

// Read the raw request body as a Buffer (parser is disabled — see config).
async function readRawBody(req) {
  var chunks = [];
  for await (var chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ⚠️ COUTURE PAIEMENT (31/07/2026) — la signature n'est plus vérifiée par un
  // appel direct au SDK Stripe mais par le fournisseur actif. Voir
  // api/_lib/paiement/index.js et docs/PLAN-REVOLUT.md.
  var paiement = paiementSocle.fournisseur();
  if (!paiement.estConfigure()) {
    return res.status(503).json({ ok: false, error: 'Webhook paiement non configuré (' + paiement.nom() + ')' });
  }

  try {
    // ── 1) Vérifier la signature sur le corps BRUT ──
    // ⛔ `readRawBody` est ce qui rend cette vérification possible : le
    // bodyParser est désactivé (voir `config` en bas de fichier). Un corps
    // parsé puis re-sérialisé produit des octets DIFFÉRENTS — prouvé sur six
    // formes de JSON — et invaliderait la signature chez Stripe comme chez
    // Revolut. Cette ligne ne se « simplifie » jamais.
    var rawBody = await readRawBody(req);
    var verif = paiement.verifierSignature(rawBody, req.headers || {});
    if (!verif || !verif.ok) {
      console.error('[webhook] Signature refusée:', (verif && verif.erreur) || 'raison inconnue');
      /* ⛔ UN REFUS DE SIGNATURE NE LAISSAIT AUCUNE TRACE VISIBLE (01/08/2026).
         Il partait dans les journaux Vercel, que l'exploitant ne lit pas. Or
         c'est le point le PLUS fragile de la migration : algorithme, fenêtre de
         rejeu, secret mal collé. En cas d'échec, le fournisseur réessaie
         quelques fois puis abandonne — et la vente n'est enregistrée nulle
         part, sans que personne ne l'apprenne avant la réconciliation.
         On pose donc une trace lisible depuis l'administration. */
      await noterSante(paiement.nom(), {
        refus: true,
        motif: String((verif && verif.erreur) || 'raison inconnue').slice(0, 200)
      });
      return res.status(400).json({ ok: false, error: 'Invalid signature' });
    }
    await noterSante(paiement.nom(), { refus: false, genre: verif.genre || 'inconnu' });
    var event = verif.evenement;
    /* Clé d'idempotence FOURNIE par le fournisseur, plus lue en dur.
       Stripe donne un identifiant d'événement unique ; Revolut n'en fournit
       AUCUN et devra la dériver de `event + order_id`. En passant par le
       contrat, le jour de la bascule ne demande pas de retoucher ce fichier. */
    var cleEvenement = verif.cle;

    // ── 2) Idempotence : machine à états sur stripe_events/{event.id} ──
    // États : 'processing' (en vol) → 'done' (succès) / 'failed' (RETRYABLE).
    // AVANT : le claim était posé puis jamais relâché — si un effet critique
    // (journal payments/, mise à jour de commande) échouait, on répondait 200 et
    // la re-livraison Stripe tombait sur « duplicate » → l'événement était
    // PERDU pour toujours (commande bloquée 'pending', pas d'email, pas de
    // trace). Désormais : échec → claim 'failed' + 500 → Stripe RE-LIVRE (sa
    // re-livraison est notre mécanisme de retry, backoff ~3 jours) et la
    // reprise est autorisée. Les effets sont idempotents (set merge, update,
    // n° de facture réutilisé, emails dédupliqués via emailsSent).
    var fb = getFirebase();
    var claimRef = null;
    var claimPrev = null; // claim repris (failed/stale) — porte emailsSent
    if (fb.db) {
      claimRef = fb.db.collection('stripe_events').doc(cleEvenement);
      var claimed = false;
      try {
        /* create() est atomique : échoue si le doc existe déjà.
           ⛔ `verif.type` et NON `event.type` : le nom de l'événement est un
           champ du CONTRAT, pas de la charge utile. Chez Stripe les deux
           coïncident ; chez Revolut la charge utile est `{ event, order_id }`
           et `event.type` vaut `undefined` — que le SDK Admin Firestore REFUSE
           d'écrire. L'exception tombait alors dans le `catch (dupErr)`
           juste en dessous, qui l'avalait : le claim finissait posé par le
           `set` de reprise, l'idempotence tenait PAR ACCIDENT, et le type de
           l'événement disparaissait de la piste d'audit. */
        await claimRef.create({
          type: verif.type || null,
          status: 'processing',
          attempts: 1,
          receivedAt: fb.admin.firestore.FieldValue.serverTimestamp()
        });
        claimed = true;
      } catch (dupErr) { /* déjà claimé → arbitrage ci-dessous */ }
      if (!claimed) {
        var prevSnap = await claimRef.get();
        var prev = prevSnap.exists ? (prevSnap.data() || {}) : {};
        var prevMs = prev.receivedAt && prev.receivedAt.toMillis ? prev.receivedAt.toMillis() : null;
        var decision = claimDecision({ status: prev.status, receivedAtMs: prevMs }, Date.now());
        if (decision === 'skip') {
          console.log('[webhook] Duplicate event ignored:', cleEvenement, '(status ' + (prev.status || '?') + ')');
          return res.status(200).json({ ok: true, received: true, duplicate: true });
        }
        // Reprise (failed, ou processing figé > CLAIM_STALE_MS = run tué).
        claimPrev = prev;
        await claimRef.set({
          status: 'processing',
          attempts: (prev.attempts || 0) + 1,
          receivedAt: fb.admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log('[webhook] Retrying event:', cleEvenement, '(attempt ' + ((prev.attempts || 0) + 1) + ')');
      }
    } else {
      console.warn('[webhook] Firestore not configured — idempotency disabled for', cleEvenement);
    }

    // ── 3) Process the event ──
    // ctx.emailsSent : une reprise ne renvoie JAMAIS les emails déjà partis.
    var ctx = { claimRef: claimRef, emailsSent: !!(claimPrev && claimPrev.emailsSent) };
    try {
      /* ⚠️ AIGUILLAGE PAR GENRE, plus par nom d'événement (31/07/2026).
         Les noms appartiennent au fournisseur (`payment_intent.succeeded` chez
         Stripe, `ORDER_COMPLETED` chez Revolut) ; le GENRE est commun, et c'est
         lui qui porte la décision.

         ⛔⛔ La distinction qui coûte de l'argent : 'tentative_ratee' n'est PAS
         'abandonne'. Chez Revolut, ORDER_PAYMENT_DECLINED signale l'échec d'UNE
         tentative — le client peut réessayer sur le MÊME ordre. Enterrer la
         commande à ce moment-là tuerait une vente en train d'être sauvée. */
      /* ⚠️ DEUX FORMES DE CHARGE UTILE, UNE SEULE LOGIQUE MÉTIER.
         Stripe livre l'objet complet dans l'événement (`event.data.object`).
         Revolut n'envoie QUE `{ event, order_id }` : il faut RELIRE la commande
         chez lui, puis la présenter sous la même forme au handler.
         `objetPaiement` fait exactement cette bascule, et rien d'autre : la
         facture, le journal, le contrôle fiscal et les e-mails restent écrits
         une seule fois, pour les deux fournisseurs. */
      /* ⚠️ La relecture est faite DANS le cas qui en a besoin, pas avant.
         Deux genres seulement exploitent l'objet ; les autres n'ont aucun effet
         et ne justifient pas un aller-retour réseau chez le fournisseur. */
      var objet;
      switch (verif.genre) {
        case paiementSocle.GENRE_ACQUIS:
          // Le SEUL genre qui déclenche des effets : journal, facture, emails.
          objet = await objetPaiement(paiement, event, verif);
          if (!objet) { console.log('[webhook] Charge utile inexploitable, aucun effet:', cleEvenement); break; }
          /* ⛔ `verif.type`, pas `event.type` — même raison qu'au claim : le nom
             de l'événement appartient au contrat. Revolut n'émet jamais ce nom,
             son chemin part donc toujours dans `handleIntentSucceeded`. */
          if (verif.type === 'checkout.session.completed') {
            await handleSessionCompleted(paiement, fb, objet, ctx);
          } else {
            await handleIntentSucceeded(paiement, fb, objet, ctx);
          }
          break;

        case 'tentative_ratee':
          // ⛔ On journalise, on n'enterre RIEN : la commande reste vivante.
          objet = await objetPaiement(paiement, event, verif);
          if (!objet) { console.log('[webhook] Charge utile inexploitable, aucun effet:', cleEvenement); break; }
          await handleIntentFailed(fb, objet);
          break;

        case 'autorise':
          // Argent RÉSERVÉ, pas encaissé. Trace utile, aucun effet.
          console.log('[webhook] Autorisé (réversible), aucun effet:', cleEvenement);
          break;

        case 'abandonne':
          console.log('[webhook] Commande abandonnée (annulée ou expirée):', cleEvenement);
          break;

        default:
          // ⛔ Genre inconnu : journalisé et IGNORÉ, jamais traité en succès.
          console.log('[webhook] Événement non traité:', verif.type, '(genre ' + verif.genre + ')');
      }
    } catch (procErr) {
      console.error('[webhook] Traitement en echec (le fournisseur re-livrera):', cleEvenement, procErr.message);
      if (claimRef) {
        try {
          await claimRef.set({
            status: 'failed',
            lastError: String(procErr.message || procErr).slice(0, 300),
            failedAt: fb.admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (_) { /* claim resté 'processing' → repris après CLAIM_STALE_MS */ }
      }
      return res.status(500).json({ ok: false, error: 'Webhook processing failed' });
    }

    if (claimRef) {
      try {
        await claimRef.set({
          status: 'done',
          doneAt: fb.admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (_) { /* au pire : reprise après stale, effets idempotents */ }
    }
    return res.status(200).json({ ok: true, received: true });
  } catch (err) {
    console.error('[webhook] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'Webhook processing failed' });
  }
}

/* ── TÉMOIN DE SANTÉ DU WEBHOOK ──────────────────────────────────────────
   Répond à UNE question que rien ne permettait de poser : « le fournisseur
   nous parle-t-il, et sa signature est-elle acceptée ? »

   ⛔ BEST-EFFORT ABSOLU. Ce témoin ne doit JAMAIS faire échouer un webhook :
   il vaut mieux un paiement traité sans trace de diagnostic qu'un paiement
   perdu parce que le diagnostic a planté. D'où le try/catch total.

   ⛔ AUCUNE DONNÉE PERSONNELLE (règle J3, audit p6) : ni e-mail, ni nom, ni
   adresse, ni même l'identifiant de commande. Des horodatages, des compteurs,
   un genre d'événement et un motif de refus technique — rien d'autre. Ce
   document s'affiche à l'écran et se copie dans des captures. */
async function noterSante(fournisseur, info) {
  try {
    var fb = getFirebase();
    if (!fb.db) return;
    var inc = fb.admin.firestore.FieldValue.increment(1);
    var patch = {
      fournisseur: String(fournisseur || '?'),
      recus: inc,
      dernierRecuMs: Date.now()
    };
    if (info && info.refus) {
      patch.refuses = inc;
      patch.dernierRefusMs = Date.now();
      patch.dernierRefusMotif = String(info.motif || '').slice(0, 200);
    } else {
      patch.acceptes = inc;
      patch.dernierAccepteMs = Date.now();
      patch.dernierGenre = String((info && info.genre) || 'inconnu');
    }
    await fb.db.collection('config').doc('webhook_sante').set(patch, { merge: true });
  } catch (_) { /* le diagnostic ne casse jamais l'encaissement */ }
}

// Décision de reprise d'un claim existant (PURE — testée par check-webhook-claim).
// 'skip'  : déjà traité (done) ou traitement concurrent récent (processing frais).
// 'retry' : échec précédent (failed), run tué (processing plus vieux que
//           CLAIM_STALE_MS), ou état inconnu/corrompu (les effets sont idempotents).
var CLAIM_STALE_MS = 10 * 60 * 1000;
function claimDecision(existing, nowMs) {
  var c = existing || {};
  if (c.status === 'done') return 'skip';
  if (c.status === 'failed') return 'retry';
  if (c.status === 'processing') {
    var age = (typeof c.receivedAtMs === 'number') ? (nowMs - c.receivedAtMs) : Infinity;
    return age > CLAIM_STALE_MS ? 'retry' : 'skip';
  }
  return 'retry';
}

// Disable Vercel's automatic body parsing so we receive the raw bytes Stripe
// signed (required for constructEvent). CommonJS equivalent of
// `export const config = { api: { bodyParser: false } }`.
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
/* Exposé pour la PREUVE, pas pour l'usage. `objetPaiement` porte la seule règle
   que rien d'autre ne peut vérifier de l'extérieur : la garde d'état ne doit
   valoir que sur le genre qui encaisse. Une regex sur le source dirait
   seulement à quoi le code ressemble ; ceci dit ce qu'il FAIT.
   Vérifié par scripts/check-paiement.js. */
module.exports._objetPaiement = objetPaiement;
/* Exposé pour la PREUVE : `noterSante` doit AVALER toute panne Firestore.
   Une lecture de source ne suffit pas — `catch (_) { throw _; }` a l'air
   correct et relance quand même (démasqué par sabotage le 01/08/2026). Le
   contrôle lui fait donc réellement exploser Firestore et vérifie qu'elle
   ne propage rien. */
module.exports._noterSante = noterSante;

// ════════════════════════════════════════════════════════════════
// Event handlers
// ════════════════════════════════════════════════════════════════

/* ── LA BASCULE ENTRE LES DEUX FORMES DE CHARGE UTILE ────────────────────────
   Stripe met tout l'objet dans l'événement. Revolut n'envoie que
   `{ event, order_id }` — il faut aller relire la commande.

   Cette fonction rend TOUJOURS un objet de forme « PaymentIntent », parce que
   c'est ce que les handlers savent lire. Ce n'est pas de la nostalgie de
   Stripe : c'est le refus de dupliquer la facture, le journal, le contrôle
   fiscal et les e-mails en deux versions qui divergeraient au premier
   correctif appliqué à une seule.

   ⛔ LA GARDE D'ÉTAT NE VAUT QUE POUR LE GENRE QUI ENCAISSE. Un ordre
   `authorised` — donc réversible — ne doit jamais produire de commande : les
   fonds peuvent repartir chez le client. Mais une TENTATIVE RATÉE laisse
   l'ordre en `pending` (le client peut réessayer dessus) : exiger l'état acquis
   là aussi renverrait `null` et l'échec ne serait JAMAIS journalisé chez
   Revolut, alors qu'il l'est chez Stripe. Deux fournisseurs, deux niveaux de
   traçabilité — exactement ce que la couture existe pour empêcher.

   ⚠️ La commission n'est demandée que sur le chemin encaissé : c'est un
   aller-retour réseau de plus, et une tentative ratée n'en a aucune. La lecture
   normalisée est attachée sous `_dejaLu` pour que le handler ne relise pas. */
async function objetPaiement(paiement, event, verif) {
  // Stripe : l'objet est déjà là, rien à faire.
  if (event && event.data && event.data.object) return event.data.object;

  var idOrdre = event && event.order_id;
  if (!idOrdre) return null;

  var encaisse = !!verif && verif.genre === paiementSocle.GENRE_ACQUIS;

  var p;
  try {
    p = await paiement.lirePaiement(idOrdre, { avecCommission: encaisse });
  } catch (e) {
    // ⛔ On LAISSE remonter : un échec de lecture doit faire échouer le webhook
    // (claim 'failed' + 500) pour que le fournisseur re-livre. Rendre `null`
    // ici acquitterait un paiement qu'on n'a pas su traiter.
    throw new Error('Commande ' + idOrdre + ' illisible : ' + e.message);
  }

  if (!p) return null;
  if (encaisse && p.etat !== paiementSocle.ETAT_ACQUIS) {
    /* Le fournisseur annonce un encaissement, la commande dit autre chose : on
       croit la COMMANDE, jamais l'annonce. Aucun effet, et une trace pour
       comprendre (l'état brut n'est pas une donnée personnelle). */
    console.log('[webhook] Ordre', idOrdre, 'annoncé encaissé mais état « '
      + p.etatBrut + ' » — aucun effet.');
    return null;
  }

  return {
    id: p.id,
    amount: p.montantCents,
    currency: (p.devise || 'EUR').toLowerCase(),
    metadata: p.metadata || {},
    receipt_email: p.email || null,
    shipping: p.adresse ? {
      name: p.nom || '',
      address: {
        line1: p.adresse.ligne1 || '',
        city: p.adresse.ville || '',
        postal_code: p.adresse.codePostal || '',
        country: p.adresse.pays || 'FR'
      }
    } : null,
    /* Motif d'échec : Revolut ne renvoie AUCUN message exploitable sur l'ordre.
       On journalise donc ce qu'on sait réellement — l'état brut, tel qu'il l'a
       dit — plutôt qu'une phrase inventée qui aurait l'air d'un diagnostic.
       Nul sur le chemin encaissé : il n'y a pas d'échec à raconter. */
    last_payment_error: encaisse ? null
      : { message: 'Revolut : état « ' + (p.etatBrut || 'inconnu') + ' » après tentative refusée' },
    /* ⚠️ La lecture normalisée est ATTACHÉE, pas jetée. Le handler la
       réutilise au lieu de relire la commande — un aller-retour réseau de
       moins par paiement, et surtout AUCUN risque que les deux lectures
       divergent (état changé entre les deux, commission apparue entre-temps). */
    _dejaLu: p
  };
}

// Marque les emails comme envoyés sur le claim (dédup en cas de reprise).
// Best-effort : au pire une reprise renverra l'email (préférable à aucun).
async function markEmailsSent(ctx) {
  if (!ctx || !ctx.claimRef) return;
  try { await ctx.claimRef.set({ emailsSent: true }, { merge: true }); } catch (_) {}
}

// ── Stripe Checkout (redirect) : checkout.session.completed ──
async function handleSessionCompleted(paiement, fb, sessionLite, ctx) {
  console.log('[webhook] Payment confirmed (session):', sessionLite.id, 'Amount:', sessionLite.amount_total);

  // Session complète (lignes + coordonnées client) pour l'email.
  // ⚠️ `lireSession` est propre au flux Checkout et n'appartient pas au contrat
  // commun : on teste sa présence. Chez Revolut, page hébergée et widget
  // partagent le même objet `order` — ce chemin disparaîtra à ce moment-là.
  var fullSession = sessionLite;
  if (typeof paiement.lireSession === 'function') {
    try {
      fullSession = await paiement.lireSession(sessionLite.id);
    } catch (retrieveErr) {
      console.error('[webhook] Session illisible:', retrieveErr.message);
    }
  }

  // A1 — contrôle fiscal détectif : adresse de LIVRAISON (collectée par
  // shipping_address_collection) prioritaire, sinon adresse de facturation.
  var declaredTerritory = (fullSession.metadata && fullSession.metadata.territory) || null;
  var shipAddr = (fullSession.shipping_details && fullSession.shipping_details.address)
    || (fullSession.customer_details && fullSession.customer_details.address) || null;
  var tax = taxCheck(declaredTerritory, shipAddr);

  var sessionUid = (fullSession.metadata && fullSession.metadata.uid) || null;

  // A2 — journal serveur : la trace existe même sans document client.
  await logPayment(fb, fullSession.id, {
    kind: 'checkout_session',
    status: 'succeeded',
    amountCents: fullSession.amount_total != null ? fullSession.amount_total : null,
    currency: (fullSession.currency || 'eur').toUpperCase(),
    customerEmail: (fullSession.customer_details && fullSession.customer_details.email) || fullSession.customer_email || null,
    paymentIntentId: typeof fullSession.payment_intent === 'string' ? fullSession.payment_intent : null,
    uid: sessionUid,
    territoryDeclared: declaredTerritory,
    territoryFromAddress: tax.expectedTerritory,
    postalCode: tax.postalCode,
    taxMismatch: tax.mismatch
  });

  // Mark the matching Firestore order as paid (idempotent update).
  // Le champ stripeSessionId est écrit par le client sur /merci (étape A5).
  await updateOrderWhere(fb, sessionUid, 'stripeSessionId', fullSession.id, {
    status: 'paid',
    stripePaymentIntent: typeof fullSession.payment_intent === 'string' ? fullSession.payment_intent : null
  });

  // Emails de confirmation — RETRYABLE : un échec Resend fait échouer le hook
  // (claim 'failed' + 500) → Stripe re-livre et l'email finit par partir.
  // Dédup : une reprise dont les emails sont déjà partis (emailsSent sur le
  // claim) ne renvoie rien. Les effets critiques ci-dessus sont idempotents.
  if (!ctx || !ctx.emailsSent) {
    await sendOrderEmails(modelFromSession(fullSession, tax));
    await markEmailsSent(ctx);
  }
}

// ── Stripe Elements : payment_intent.succeeded ──
async function handleIntentSucceeded(paiement, fb, pi, ctx) {
  // Ne traiter QUE les PaymentIntents créés par create-payment-intent.js.
  // Le PI créé en interne par une Checkout Session ne porte pas notre metadata
  // → il est ignoré ici et traité via checkout.session.completed (pas de
  // double email, déterministe).
  if (!pi.metadata || pi.metadata.source !== 'pirates-tools') {
    console.log('[webhook] payment_intent.succeeded ignored (not ours):', pi.id);
    return;
  }
  /* ⛔ COMMANDE DE DIAGNOSTIC — `api/admin.js ?type=revolut-commande-test` crée
     un ordre à 30 € qui porte `source: pirates-tools` (il doit le porter : c'est
     ce qui prouve que la chaîne complète fonctionne). Sans cette exclusion, son
     webhook produirait une écriture comptable, un numéro de facture consommé et
     des emails de confirmation pour une vente qui n'existe pas. La marque
     `test` est posée par le diagnostic et par lui seul ; aucun paiement client
     ne peut la porter (create-payment-intent.js ne l'écrit nulle part). */
  if (pi.metadata.test) {
    console.log('[webhook] ignoré : commande de diagnostic (metadata.test):', pi.id);
    return;
  }
  console.log('[webhook] Payment confirmed (intent):', pi.id, 'Amount:', pi.amount);

  /* ⚠️ COUTURE — un seul appel remplace les deux (charge + balance transaction).
     `avecCommission: true` déclenche la lecture de la commission RÉELLE : c'est
     ce qui rend la comptabilité « 100 % réelle », et c'est aussi ce qui coûte
     un aller-retour réseau de plus. On ne le demande donc QUE sur ce chemin,
     celui d'un paiement effectivement encaissé.

     ⚠️ `_dejaLu` : chez Revolut, la commande vient d'être relue par
     `objetPaiement` (sa charge utile ne contient que l'identifiant). On
     réutilise cette lecture au lieu d'en refaire une — un aller-retour de
     moins, et zéro risque que les deux lectures divergent. */
  var normalise = pi._dejaLu || await paiement.lirePaiement(pi.id, { avecCommission: true });
  var billing = {
    email: normalise.email,
    name: normalise.nom,
    address: normalise.adresse ? {
      line1: normalise.adresse.ligne1, city: normalise.adresse.ville,
      postal_code: normalise.adresse.codePostal, country: normalise.adresse.pays
    } : null
  };
  var declaredTerritory = pi.metadata.territory || null;
  // Adresse de LIVRAISON attachée au PI (formulaire adresse de la modale) en
  // priorité ; repli facturation carte (anciens paiements sans adresse).
  var piShipAddr = (pi.shipping && pi.shipping.address) || null;
  var tax = taxCheck(declaredTerritory, piShipAddr || billing.address || null);

  // Reconstruit les lignes depuis la metadata (source serveur : catalogue +
  // moteur de prix). Contrôle d'intégrité : la somme doit valoir pi.amount —
  // sinon (prix catalogue modifié entre-temps, metadata absente) on dégrade
  // sur une ligne unique au montant réellement débité, jamais un faux détail.
  var rebuilt = await rebuildLines(pi, declaredTerritory);

  var customerEmail = pi.receipt_email || billing.email || null;
  var piUid = pi.metadata.uid || null;

  /* Commission RÉELLE (compta), déjà lue par la couture ci-dessus.
     ⛔ Reste `null` si la lecture a échoué — JAMAIS 0, et jamais une
     estimation : un zéro se confondrait avec une commission réellement nulle
     dans le compte de résultat, et une estimation aurait l'air d'un vrai
     chiffre. Le nom du champ garde son préfixe historique tant que la
     collection `payments` n'est pas migrée (étape 7). */
  var stripeFeeCents = normalise.commissionCents;

  // Facture : numéro séquentiel + snapshot des lignes et de l'identité client.
  // Idempotent en reprise : le numéro déjà attribué à CE paiement est réutilisé.
  var invoiceNumber = await assignInvoiceNumber(fb, Date.now(), pi.id);
  var custName = (pi.shipping && pi.shipping.name) || billing.name || '';
  var custAddr = formatAddr(piShipAddr || billing.address || null);

  await logPayment(fb, pi.id, {
    kind: 'payment_intent',
    status: 'succeeded',
    amountCents: pi.amount != null ? pi.amount : null,
    currency: (pi.currency || 'eur').toUpperCase(),
    customerEmail: customerEmail,
    customerName: custName,
    customerAddress: custAddr,
    paymentIntentId: pi.id,
    uid: piUid,
    territoryDeclared: declaredTerritory,
    territoryFromAddress: tax.expectedTerritory,
    postalCode: tax.postalCode,
    taxMismatch: tax.mismatch,
    linesRebuilt: rebuilt.ok,
    // Compta 100 % réel : coût d'achat snapshoté + commission Stripe réelle.
    cogsHtCents: (rebuilt.cogsHtCents != null ? rebuilt.cogsHtCents : null),
    stripeFeeCents: stripeFeeCents,
    // Facture : détail des lignes + numéro + date, pour générer la facture conforme.
    linesDetail: (rebuilt.lines || []).map(function (l) { return { name: l.name, qty: l.qty, unitCents: l.unitCents, brand: l.brand || '' }; }),
    invoiceNumber: invoiceNumber,
    invoiceDateMs: Date.now()
  });

  // Le client écrit sa commande avec paymentIntentId sur /merci (A5). Selon la
  // course client/webhook le doc peut ne pas encore exister — le journal
  // payments/ ci-dessus reste la trace autoritaire dans tous les cas.
  await updateOrderWhere(fb, piUid, 'paymentIntentId', pi.id, {
    status: 'paid',
    confirmedByWebhook: true
  });

  // Course de livraison quincaillerie payée : créer la course (doc id = pi.id,
  // idempotent avec le repli client /merci) + alerter les livreurs. Les frais
  // livreur restent GELÉS (escrow) jusqu'à confirmation de réception.
  if (pi.metadata.courseZone && fb.db) {
    try {
      var cc = await coursesLib.createFromIntent(fb.db, pi);
      if (cc.created) {
        await coursesLib.alertNewCourse(cc.course, cc.id, fb.db);
        await coursesLib.confirmToClient(cc.course, cc.id);
      }
    } catch (courseErr) {
      console.error('[webhook] course create failed:', courseErr.message);
    }
  }

  // Emails — RETRYABLE (voir handleSessionCompleted) + dédup emailsSent.
  // Le bloc facture de l'email reste best-effort : un email sans bloc facture
  // vaut mieux qu'un email bloqué (le n° et le détail vivent dans payments/).
  if (!ctx || !ctx.emailsSent) {
    var emailModel = modelFromIntent(pi, custName, rebuilt, tax, customerEmail);
    try {
      var seller = await loadSeller(fb);
      var inv = invoiceLib.buildInvoice({
        invoiceNumber: invoiceNumber, invoiceDateMs: Date.now(), amountCents: pi.amount,
        territoryDeclared: declaredTerritory, customerEmail: customerEmail, customerName: custName,
        customerAddress: custAddr, linesDetail: (rebuilt.lines || []).map(function (l) { return { name: l.name, qty: l.qty, unitCents: l.unitCents, brand: l.brand || '' }; })
      }, seller);
      emailModel.invoice = { number: inv.number, seller: seller, totalHt: inv.totalHt, totalTva: inv.totalTva, franchise: inv.franchise, tvaRate: inv.tvaRate };
    } catch (invErr) { console.error('[webhook] email invoice build failed:', invErr.message); }
    await sendOrderEmails(emailModel);
    await markEmailsSent(ctx);
  }
}

// ── Stripe Elements : payment_intent.payment_failed ──
async function handleIntentFailed(fb, pi) {
  if (!pi.metadata || pi.metadata.source !== 'pirates-tools') return;
  // Même exclusion qu'au succès : la commande de diagnostic ne pollue pas le
  // journal des paiements, pas même en échec.
  if (pi.metadata.test) return;
  var lastErr = (pi.last_payment_error && pi.last_payment_error.message) || null;
  console.log('[webhook] Payment failed (intent):', pi.id, lastErr || '');
  await logPayment(fb, pi.id, {
    kind: 'payment_intent',
    status: 'failed',
    amountCents: pi.amount != null ? pi.amount : null,
    currency: (pi.currency || 'eur').toUpperCase(),
    customerEmail: pi.receipt_email || null,
    paymentIntentId: pi.id,
    uid: (pi.metadata && pi.metadata.uid) || null,
    territoryDeclared: (pi.metadata && pi.metadata.territory) || null,
    failureMessage: lastErr
  });
}

// ════════════════════════════════════════════════════════════════
// Shared helpers
// ════════════════════════════════════════════════════════════════

// A1 — compare le territoire déclaré au territoire dérivé du code postal réel.
// mismatch === true SEULEMENT si on a un code postal exploitable ET qu'il
// contredit la déclaration (une adresse absente/hors-DOM donne expected=null :
// signalé comme « invérifiable », pas comme fraude).
function taxCheck(declaredTerritory, address) {
  var pc = postal.postalFromStripeAddress(address);
  var expected = pc ? postal.territoryFromPostal(pc) : null;
  return {
    postalCode: pc,
    expectedTerritory: expected,
    mismatch: !!(expected && declaredTerritory && expected !== declaredTerritory)
  };
}

// Numéro de facture séquentiel, sans trou (compteur transactionnel Firestore).
// Format Fyyyy-NNNN. IDEMPOTENT par paiement : si payments/{stripeId} porte
// déjà un invoiceNumber (reprise après échec partiel), on le RÉUTILISE au lieu
// d'en consommer un nouveau (sinon chaque re-livraison créait un trou dans la
// séquence = non-conformité facturation). Échec du compteur = CRITIQUE (throw)
// → claim 'failed' + 500 → Stripe re-livre, le numéro finit par être attribué.
async function assignInvoiceNumber(fb, dateMs, stripeId) {
  if (!fb.db) return null;
  if (stripeId) {
    try {
      var prevPay = await fb.db.collection('payments').doc(String(stripeId)).get();
      var prevNum = prevPay.exists && (prevPay.data() || {}).invoiceNumber;
      if (prevNum) return prevNum;
    } catch (_) { /* lecture best-effort, la transaction reste la référence */ }
  }
  var year = new Date(dateMs || Date.now()).getUTCFullYear();
  var ref = fb.db.collection('config').doc('invoiceCounter');
  var num = await fb.db.runTransaction(async function (t) {
    var snap = await t.get(ref);
    var data = snap.exists ? (snap.data() || {}) : {};
    var seq = (data['seq_' + year] || 0) + 1;
    var patch = {}; patch['seq_' + year] = seq;
    t.set(ref, patch, { merge: true });
    return seq;
  });
  return 'F' + year + '-' + ('0000' + num).slice(-4);
}

function formatAddr(a) {
  if (!a) return '';
  return [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country]
    .filter(Boolean).join(', ');
}

// A2 — journal Firestore payments/{stripeId} = LA trace comptable autoritaire
// (P&L, factures, fidélité s'appuient dessus). CRITIQUE : un échec JETTE →
// claim 'failed' + 500 → Stripe re-livre (set merge = idempotent en reprise).
// L'ancien comportement « best-effort » pouvait perdre la trace pour toujours.
async function logPayment(fb, stripeId, data) {
  if (!fb.db) return;
  await fb.db.collection('payments').doc(String(stripeId)).set(
    Object.assign({}, data, {
      recordedAt: fb.admin.firestore.FieldValue.serverTimestamp()
    }),
    { merge: true }
  );
  console.log('[webhook] Payment journaled:', stripeId, data.status, data.taxMismatch ? '⚠ TAX MISMATCH' : '');
}

// Met à jour la commande client correspondante.
// Chemin PRIVILÉGIÉ : users/{uid}/orders (uid depuis la metadata Stripe) —
// requête de collection simple couverte par les index AUTOMATIQUES Firestore,
// aucun index à créer. REPLI (uid absent — anciens paiements) : collectionGroup,
// qui exige un index collection-group sur le champ interrogé (défini dans
// firestore.indexes.json ; sans lui Firestore log FAILED_PRECONDITION avec
// l'URL de création en 1 clic).
async function updateOrderWhere(fb, uid, field, value, patch) {
  if (!fb.db || !value) return;
  try {
    var query = uid
      ? fb.db.collection('users').doc(uid).collection('orders').where(field, '==', value)
      : fb.db.collectionGroup('orders').where(field, '==', value);
    var snap = await query.limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update(Object.assign({}, patch, {
        paidAt: fb.admin.firestore.FieldValue.serverTimestamp()
      }));
      console.log('[webhook] Order updated via', (uid ? 'users/' + uid + '/orders.' : 'collectionGroup.') + field, ':', snap.docs[0].id);
    } else {
      // Pas une erreur : le doc client peut légitimement ne pas (encore)
      // exister (course /merci ↔ webhook). Le journal payments/ fait foi.
      console.log('[webhook] No order matches', field, '=', value, uid ? '(uid ' + uid + ')' : '(sans uid)', '— client doc absent ou pas encore écrit');
    }
  } catch (fbErr) {
    // Index collection-group manquant (FAILED_PRECONDITION, code 9) = erreur
    // STRUCTURELLE : re-livrer ne la réparera jamais (il faut déployer
    // firestore.indexes.json) → loguée, non bloquante, comme avant.
    if (fbErr.code === 9 || /FAILED_PRECONDITION/i.test(String(fbErr.message))) {
      console.error('[webhook] Order update skipped (index manquant — déployer firestore.indexes.json):', fbErr.message);
      return;
    }
    // CRITIQUE (hoquet transitoire) : avant, l'échec était avalé et la commande
    // restait 'pending' pour toujours. throw → claim 'failed' + 500 → retry.
    console.error('[webhook] Firestore order update failed (' + field + '):', fbErr.message);
    throw fbErr;
  }
}

// Reconstruit les lignes {name, qty, unitCents, subCents} d'un PaymentIntent
// depuis metadata items_* + catalogue + moteur de prix. { ok, lines }
async function rebuildLines(pi, territory) {
  var fallback = {
    ok: false,
    lines: [{
      name: (pi.description || 'Commande Pirates Tools').substring(0, 200),
      qty: 1,
      unitCents: pi.amount != null ? pi.amount : null,
      subCents: pi.amount != null ? pi.amount : null
    }]
  };
  var metaItems = stripeMeta.readItems(pi.metadata);
  if (!metaItems || !metaItems.length) return fallback;
  try {
    var products = await catalog.loadCatalog();
    var lines = [];
    var sum = 0;
    var cogsHtCents = 0;   // coût d'achat RÉEL des marchandises vendues (compta)
    for (var i = 0; i < metaItems.length; i++) {
      var product = catalog.findByKey(products, metaItems[i].k);
      if (!product) return fallback;
      var qty = parseInt(metaItems[i].q, 10) || 1;
      // Option coffret TSTAK : même surcoût SERVEUR qu'à la création du paiement.
      var coffret = (metaItems[i].c === 1 || metaItems[i].c === '1') && pricing.coffretEligible(product);
      var unit = pricing.unitCents(product, territory || pricing.DEFAULT_TERRITORY)
        + (coffret ? pricing.coffretSurchargeCents(product) : 0);
      sum += unit * qty;
      cogsHtCents += Math.round(productCostHt(product) * 100) * qty;
      lines.push({ name: (product.title || 'Produit') + (coffret ? ' + coffret TSTAK' : ''), qty: qty, unitCents: unit, subCents: unit * qty, brand: product.brand || '' });
    }
    // Remise fidélité serveur (create-payment-intent) : pi.amount = brut −
    // remise. On la matérialise en ligne négative pour que le détail somme
    // exactement au montant débité.
    var discountCents = parseInt((pi.metadata && pi.metadata.loyaltyDiscountCents) || '0', 10);
    if (isFinite(discountCents) && discountCents > 0) {
      var pct = (pi.metadata && pi.metadata.loyaltyPct) || '';
      lines.push({
        name: 'Remise fidélité' + (pct ? ' −' + pct + ' %' : ''),
        qty: 1,
        unitCents: -discountCents,
        subCents: -discountCents
      });
      sum -= discountCents;
    }
    // Frais de livraison chantier (course quincaillerie) : ligne dédiée —
    // reversés à 100 % au livreur, hors remise fidélité. Sans elle, la somme
    // ne vaudrait plus pi.amount et l'intégrité dégraderait à tort.
    var courseFeeCents = parseInt((pi.metadata && pi.metadata.courseFeeCents) || '0', 10);
    if (isFinite(courseFeeCents) && courseFeeCents > 0) {
      lines.push({
        name: 'Livraison sur chantier — zone ' + ((pi.metadata && pi.metadata.courseZone) || '?') + ' (reversée intégralement au livreur)',
        qty: 1,
        unitCents: courseFeeCents,
        subCents: courseFeeCents
      });
      sum += courseFeeCents;
    }
    // Intégrité : le détail reconstruit doit valoir exactement le montant
    // débité. Un prix catalogue modifié entre paiement et webhook → dégradation
    // (jamais un email dont le détail ne somme pas au total).
    if (pi.amount != null && sum !== pi.amount) {
      console.warn('[webhook] Rebuilt lines drift:', sum, '≠', pi.amount, '— fallback single line');
      return fallback;
    }
    return { ok: true, lines: lines, cogsHtCents: cogsHtCents };
  } catch (e) {
    console.error('[webhook] rebuildLines failed:', e.message);
    return fallback;
  }
}

// Coût d'achat HT RÉEL d'un produit (compta). Priorité au coût fournisseur
// enregistré par le traqueur (priceSrcTTC ÷ 1,20). Sinon on remonte depuis le
// prix de vente HT et le markup appliqué (priceMarkup), ou à défaut ×1,15.
function productCostHt(product) {
  if (product && typeof product.priceSrcTTC === 'number' && product.priceSrcTTC > 0) {
    return product.priceSrcTTC / 1.20;
  }
  var ph = (product && typeof product.price_ht === 'number') ? product.price_ht : 0;
  if (product && typeof product.priceMarkup === 'number' && product.priceMarkup > 0) {
    return ph / (1 + product.priceMarkup);
  }
  return ph > 0 ? ph / 1.15 : 0;
}

// ── Normalisation : les deux flux produisent le même modèle d'email ──

function modelFromSession(session, tax) {
  var currency = (session.currency || 'eur').toUpperCase();
  var lineItems = (session.line_items && session.line_items.data) || [];
  return {
    orderRef: (session.id || '').slice(-8).toUpperCase(),
    totalCents: session.amount_total != null ? session.amount_total : null,
    currency: currency,
    customerEmail: (session.customer_details && session.customer_details.email) || session.customer_email || '',
    customerName: (session.customer_details && session.customer_details.name) || '',
    lines: lineItems.map(function (li) {
      return {
        name: (li.description) || (li.price && li.price.product && li.price.product.name) || 'Produit',
        qty: li.quantity || 1,
        unitCents: li.price ? li.price.unit_amount : null,
        subCents: li.amount_total != null ? li.amount_total : null
      };
    }),
    ownerWarnings: buildTaxWarnings(tax, session.metadata && session.metadata.territory)
  };
}

/* ⚠️ Signature changee le 31/07/2026 (couture) : ce modele recevait l'objet
   `charge` de Stripe UNIQUEMENT pour en extraire le nom du porteur. La couche
   paiement le fournit deja, normalise — on passe donc le nom, pas un objet
   propre a un fournisseur. */
function modelFromIntent(pi, nomClient, rebuilt, tax, customerEmail) {
  return {
    orderRef: (pi.id || '').slice(-8).toUpperCase(),
    totalCents: pi.amount != null ? pi.amount : null,
    currency: (pi.currency || 'eur').toUpperCase(),
    customerEmail: customerEmail || '',
    customerName: nomClient || '',
    lines: rebuilt.lines,
    ownerWarnings: buildTaxWarnings(tax, pi.metadata && pi.metadata.territory)
      .concat(rebuilt.ok ? [] : ['Détail des lignes indisponible — le total débité fait foi.'])
  };
}

// Messages d'alerte destinés à l'email OWNER uniquement (texte brut, échappé
// à l'insertion).
function buildTaxWarnings(tax, declaredTerritory) {
  if (!tax) return [];
  var declared = pricing.getTerritory(declaredTerritory || '');
  var declaredLabel = declared ? (declared.name + ' (' + declared.code + ')') : String(declaredTerritory || 'inconnu');
  if (tax.mismatch) {
    var real = pricing.getTerritory(tax.expectedTerritory);
    return ['TAXE À VÉRIFIER AVANT EXPÉDITION : territoire facturé ' + declaredLabel
      + ' mais adresse réelle en ' + (real ? real.name + ' (' + real.code + ')' : tax.expectedTerritory)
      + ' — code postal ' + tax.postalCode + '. Le montant encaissé peut être erroné (octroi/TVA).'];
  }
  if (!tax.postalCode) {
    return ['Adresse sans code postal exploitable — territoire fiscal ' + declaredLabel + ' non vérifié.'];
  }
  if (!tax.expectedTerritory) {
    return ['Code postal ' + tax.postalCode + ' hors DOM desservis — territoire fiscal ' + declaredLabel + ' non vérifié.'];
  }
  return [];
}

// ── Resend transactional email (HTTP, no SDK) ──────────────────
async function sendOrderEmails(model) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Pirates Tools <onboarding@resend.dev>';
  const ownerEmail = process.env.OWNER_EMAIL || '';

  if (!apiKey) {
    console.log('[webhook] RESEND_API_KEY not set — skipping email');
    return;
  }

  const currency = model.currency || 'EUR';
  const totalStr = formatAmount(model.totalCents, currency);

  const itemsHtml = (model.lines || []).map(function (li) {
    const unit = li.unitCents != null ? formatAmount(li.unitCents, currency) : '—';
    const sub = li.subCents != null ? formatAmount(li.subCents, currency) : '—';
    return '<tr>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee">' + escape(li.name) + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">' + (li.qty || 1) + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">' + unit + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">' + sub + '</td>'
      + '</tr>';
  }).join('');

  const orderRef = model.orderRef || '';

  const warningsHtml = (model.ownerWarnings || []).map(function (w) {
    return '<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);border-radius:10px;padding:12px 14px;margin:0 0 14px">'
      + '<p style="margin:0;color:#fca5a5;font-size:13px;font-weight:700">⚠ ' + escape(w) + '</p>'
      + '</div>';
  }).join('');

  // Bloc facture (identité vendeur + n° + HT/TVA + mentions) pour l'email client.
  const invData = model.invoice;
  const invoiceBlock = invData ? (function () {
    const s = invData.seller || {};
    return '<div style="margin-top:20px;padding:16px;background:#0a0f14;border:1px solid rgba(139,92,246,.25);border-radius:12px;font-size:12px;color:#9aa4b2">'
      + '<p style="margin:0 0 6px;color:#fff;font-weight:700">Facture n° ' + escape(invData.number) + '</p>'
      + '<p style="margin:0">Total HT : ' + formatAmount(Math.round(invData.totalHt * 100), currency)
      + (invData.franchise ? '' : ' &middot; TVA (' + (Math.round(invData.tvaRate * 1000) / 10) + ' %) : ' + formatAmount(Math.round(invData.totalTva * 100), currency))
      + ' &middot; Total TTC : ' + totalStr + '</p>'
      + (invData.franchise ? '<p style="margin:6px 0 0">TVA non applicable, art. 293 B du CGI.</p>' : '')
      + '<p style="margin:8px 0 0;font-size:11px">' + escape(s.raisonSociale || '') + (s.siret ? ' &middot; SIRET ' + escape(s.siret) : '') + (s.adresse ? ' &middot; ' + escape(s.adresse) : '') + '</p>'
      + '<p style="margin:4px 0 0;font-size:11px">Garantie légale de conformité (2 ans) et garantie des vices cachés. Droit de rétractation : 14 jours (voir CGV).</p>'
      + '</div>';
  })() : '';

  const baseHtml = function (title, intro, includeWarnings) {
    return '<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#0a0f14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf5">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f14;padding:32px 0">'
      + '<tr><td align="center">'
      + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#0f1720;border:1px solid rgba(139,92,246,.3);border-radius:16px;overflow:hidden;max-width:600px">'
      + '<tr><td style="background:linear-gradient(135deg,#8B5CF6,#6d28d9);padding:28px 32px;text-align:center">'
      + '<h1 style="margin:0;font-size:24px;color:#fff;letter-spacing:.5px">PIRATES TOOLS</h1>'
      + '<p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">Outillage professionnel</p>'
      + '</td></tr>'
      + '<tr><td style="padding:32px">'
      + (includeWarnings ? warningsHtml : '')
      + '<h2 style="margin:0 0 8px;font-size:20px;color:#fff">' + escape(title) + '</h2>'
      + '<p style="margin:0 0 20px;color:#9aa4b2;font-size:14px;line-height:1.6">' + intro + '</p>'
      + '<div style="background:#0a0f14;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin:16px 0">'
      + '<p style="margin:0;color:#9aa4b2;font-size:12px;text-transform:uppercase;letter-spacing:.06em">Référence commande</p>'
      + '<p style="margin:4px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:16px;color:#8B5CF6;font-weight:700">#' + escape(orderRef) + '</p>'
      + '</div>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;background:#0a0f14;border-radius:12px;overflow:hidden">'
      + '<thead><tr style="background:rgba(139,92,246,.1)">'
      + '<th align="left" style="padding:10px 12px;font-size:12px;color:#9aa4b2;text-transform:uppercase">Produit</th>'
      + '<th align="center" style="padding:10px 12px;font-size:12px;color:#9aa4b2;text-transform:uppercase">Qté</th>'
      + '<th align="right" style="padding:10px 12px;font-size:12px;color:#9aa4b2;text-transform:uppercase">PU</th>'
      + '<th align="right" style="padding:10px 12px;font-size:12px;color:#9aa4b2;text-transform:uppercase">Total</th>'
      + '</tr></thead>'
      + '<tbody style="color:#e6edf5;font-size:14px">' + itemsHtml + '</tbody>'
      + '<tfoot><tr><td colspan="3" align="right" style="padding:14px 12px;font-weight:700;color:#fff">Total TTC</td>'
      + '<td align="right" style="padding:14px 12px;font-weight:700;color:#8B5CF6;font-size:16px">' + totalStr + '</td></tr></tfoot>'
      + '</table>'
      + invoiceBlock
      + '<p style="margin:24px 0 0;color:#9aa4b2;font-size:13px;line-height:1.6">'
      + 'Besoin d\'aide ? Réponds simplement à cet email, on te recontacte.'
      + '</p>'
      + '</td></tr>'
      + '<tr><td style="background:#0a0f14;padding:16px 32px;text-align:center;border-top:1px solid rgba(255,255,255,.06)">'
      + '<p style="margin:0;color:#6b7280;font-size:11px">© Pirates Tools — Antilles françaises</p>'
      + '</td></tr>'
      + '</table></td></tr></table></body></html>';
  };

  // Customer confirmation email (jamais les warnings — usage interne)
  if (model.customerEmail) {
    const intro = 'Bonjour' + (model.customerName ? ' ' + escape(model.customerName) : '') + ', nous avons bien reçu votre paiement. Votre commande est en cours de préparation — vous serez contacté·e sous peu pour la livraison.';
    await resendSend(apiKey, {
      from: from,
      to: model.customerEmail,
      subject: 'Confirmation de commande #' + orderRef + ' — Pirates Tools',
      html: baseHtml('Merci pour votre commande !', intro, false)
    });
    // Pas de PII en clair dans les logs (RGPD/minimisation) : on journalise la
    // référence de commande, jamais l'email du client.
    console.log('[webhook] Customer email sent (order ' + orderRef + ')');
  }

  // Owner notification email (avec les alertes taxe/intégrité)
  if (ownerEmail) {
    const intro = 'Nouvelle commande payée sur le site. '
      + (model.customerEmail ? 'Client : <strong>' + escape(model.customerEmail) + '</strong>' + (model.customerName ? ' (' + escape(model.customerName) + ')' : '') + '.' : 'Email client non fourni.');
    await resendSend(apiKey, {
      from: from,
      to: ownerEmail,
      subject: ((model.ownerWarnings && model.ownerWarnings.length) ? '⚠ ' : '')
        + '[Pirates Tools] Commande payée #' + orderRef + ' — ' + totalStr,
      html: baseHtml('Nouvelle commande reçue', intro, true),
      reply_to: model.customerEmail || undefined
    });
    console.log('[webhook] Owner email sent (order ' + orderRef + ')');
  }
}

async function resendSend(apiKey, payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error('Resend ' + r.status + ': ' + body);
  }
  return r.json();
}

function formatAmount(cents, currency) {
  if (typeof cents !== 'number') return '—';
  const val = (cents / 100).toFixed(2).replace('.', ',');
  const sym = currency === 'EUR' ? '€' : currency;
  return val + ' ' + sym;
}

function escape(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Exports internes pour les tests (non utilisés par Vercel).
module.exports._internals = {
  taxCheck: taxCheck,
  buildTaxWarnings: buildTaxWarnings,
  rebuildLines: rebuildLines,
  modelFromSession: modelFromSession,
  modelFromIntent: modelFromIntent,
  updateOrderWhere: updateOrderWhere,
  claimDecision: claimDecision,
  CLAIM_STALE_MS: CLAIM_STALE_MS,
  logPayment: logPayment,
  assignInvoiceNumber: assignInvoiceNumber
};
