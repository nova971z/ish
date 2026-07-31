/* api/_lib/paiement/revolut.js — Revolut Merchant API derrière le contrat commun.
   ─────────────────────────────────────────────────────────────────────────
   Écrit le 31/07/2026. ⚠️ AUCUN appel réseau n'a encore été exécuté : le
   compte bac à sable n'existe pas au moment où ces lignes sont écrites. Tout
   ce qui est PUR ici (signature, table d'états, extraction de commission,
   construction du corps) est en revanche prouvé par `check-revolut.js`.

   Tant que `PAYMENT_PROVIDER` ne vaut pas `revolut`, ce fichier ne tourne pas.

   ─────────────────────────────────────────────────────────────────────────
   SOURCES — tout vient de la référence Merchant API 2026-04-20 fournie par
   l'user, jamais de mémoire. Voir docs/PLAN-REVOLUT.md.

   Base prod      https://merchant.revolut.com/api
   Base bac à sable https://sandbox-merchant.revolut.com/api
   En-têtes       Authorization: Bearer <clé secrète>
                  Revolut-Api-Version: 2026-04-20

   POST /api/orders                  → { id, token, state, checkout_url }
   GET  /api/orders/{id}             → …, payments[]
   POST /api/orders/{id}/refund      + en-tête Idempotency-Key
   GET  /api/payments/{id}           → fees[], settled_amount, card_country_code

   ─────────────────────────────────────────────────────────────────────────
   LES SIX ÉTATS D'UN ORDRE (table officielle)

     pending     ordre créé, aucune tentative         — non final
     processing  tentative en cours                   — non final
     authorised  autorisé, capture manuelle attendue   — final SI capture manuelle
     completed   capturé et réglé                     — ✅ NOTRE DÉCLENCHEUR
     cancelled   annulé / autorisation expirée        — final, échec
     failed      expiré sans paiement                 — final, échec

   Notre `capture_mode` est `automatic` → on agit sur `completed`, sur rien
   d'autre. Un état inconnu devient `inconnu` : journalisé, jamais traité.

   ⛔⛔ PIÈGE N°1 — UN PAIEMENT RATÉ N'EST PAS UNE COMMANDE RATÉE.
   ORDER_PAYMENT_DECLINED / ORDER_PAYMENT_FAILED signalent l'échec d'UNE
   TENTATIVE ; le client peut réessayer sur le MÊME ordre. Le réflexe hérité de
   `payment_intent.payment_failed` enterrerait une commande en cours de
   sauvetage. Ils sont donc traduits en `en_attente`, PAS en `echoue`.
   Une commande ne meurt que sur ORDER_CANCELLED ou ORDER_FAILED.

   ⛔⛔ PIÈGE N°2 — `payments` EST UN TABLEAU. Un ordre réessayé porte des
   tentatives refusées PUIS une réussie. La commission se lit sur le paiement
   ABOUTI, jamais sur payments[0], jamais en sommant tout le tableau.
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

var crypto = require('crypto');
var socle = require('./index');

var VERSION_API = '2026-04-20';

/* ⚠️ LE DÉFAUT EST LE BAC À SABLE, ET C'EST DÉLIBÉRÉ.
   Même principe que le routeur de la couture : le défaut doit être celui qui
   ne peut pas coûter d'argent. Une variable oubliée ou mal orthographiée doit
   envoyer vers de la fausse monnaie, jamais vers de vrais débits. Passer en
   production demande d'écrire `prod` en toutes lettres. */
function modeProd() {
  return String(process.env.REVOLUT_MODE || '').trim().toLowerCase() === 'prod';
}

/* Contrat commun — voir OPERATIONS dans index.js.
   ⚠️ Chez Revolut la réponse est CERTAINE, jamais `null` : le bac à sable est
   le défaut, et il faut écrire `prod` en toutes lettres pour en sortir. Il n'y
   a donc pas d'état « indéterminable » à gérer, contrairement à Stripe où le
   verdict se lit sur le préfixe d'une clé qui peut être mal collée. */
function modeTest() { return !modeProd(); }

function base() {
  return modeProd()
    ? 'https://merchant.revolut.com/api'
    : 'https://sandbox-merchant.revolut.com/api';
}

function cleSecrete() {
  return (modeProd()
    ? process.env.REVOLUT_SECRET_KEY
    : process.env.REVOLUT_SECRET_KEY_SANDBOX) || '';
}

function secretWebhook() {
  return (modeProd()
    ? process.env.REVOLUT_WEBHOOK_SECRET
    : process.env.REVOLUT_WEBHOOK_SECRET_SANDBOX) || '';
}

function nom() { return 'revolut'; }
function estConfigure() { return !!cleSecrete(); }

/* ── Tables d'états ───────────────────────────────────────────────────────
   EXPLICITES et exhaustives sur ce que la documentation nomme. Tout le reste
   tombe en 'inconnu' par construction (voir socle.normaliserEtat). */
var ETATS_ORDRE = {
  'pending': 'en_attente',
  'processing': 'en_attente',
  'authorised': 'autorise',      // ⛔ RÉVERSIBLE — fonds rendus si non capturé
  'completed': 'paye',           // ✅ le seul qui déclenche quelque chose
  'cancelled': 'annule',
  'failed': 'echoue'
};

/* États d'un PAIEMENT (une tentative), distincts de ceux de l'ordre. */
var ETATS_PAIEMENT = {
  'pending': 'en_attente',
  'authorisation_started': 'en_attente',
  'authorisation_passed': 'autorise',
  'authorised': 'autorise',
  'captured': 'paye',
  'completed': 'paye',
  'declined': 'echoue',
  'failed': 'echoue',
  'cancelled': 'annule',
  'refund_validated': 'rembourse',
  'refunded': 'rembourse'
};

/* Genres d'evenements — vocabulaire commun (voir index.js).
   ⛔⛔ ORDER_PAYMENT_DECLINED et ORDER_PAYMENT_FAILED valent 'tentative_ratee',
   PAS 'abandonne'. La documentation est formelle : « Receiving
   ORDER_PAYMENT_FAILED or ORDER_PAYMENT_DECLINED does not mean the order has
   reached a final unsuccessful state. The customer can retry payment on the
   same order. » Les enterrer tuerait une vente en cours de sauvetage. */
var GENRES_REVOLUT = {
  'ORDER_COMPLETED': 'encaisse',
  'ORDER_AUTHORISED': 'autorise',
  'ORDER_PAYMENT_DECLINED': 'tentative_ratee',
  'ORDER_PAYMENT_FAILED': 'tentative_ratee',
  'ORDER_CANCELLED': 'abandonne',
  'ORDER_FAILED': 'abandonne'
};

/* Un paiement est-il celui qui a réellement abouti ? */
function estAbouti(p) {
  return !!p && socle.normaliserEtat(p.state, ETATS_PAIEMENT) === socle.ETAT_ACQUIS;
}

/* ⛔ COMMISSION RÉELLE — le cœur de la comptabilité « 100 % réelle ».
   Deux tableaux imbriqués, deux pièges :
     · `payments` contient les tentatives REFUSÉES en plus de la réussie ;
     · `fees` contient plusieurs types de frais pour un même paiement.
   On isole donc le paiement ABOUTI, puis on somme SES frais.
   Retourne `null` si aucun paiement abouti — JAMAIS 0 : un zéro se confondrait
   avec une commission réellement nulle dans le compte de résultat. */
function commissionCents(payments) {
  var liste = Array.isArray(payments) ? payments : [];
  var abouti = null;
  for (var i = 0; i < liste.length; i++) {
    if (estAbouti(liste[i])) { abouti = liste[i]; break; }
  }
  if (!abouti || !Array.isArray(abouti.fees)) return null;
  var total = 0, vu = false;
  abouti.fees.forEach(function (f) {
    if (f && typeof f.amount === 'number') { total += f.amount; vu = true; }
  });
  return vu ? total : null;
}

/* Le paiement abouti d'un ordre, pour en tirer adresse, e-mail et carte. */
function paiementAbouti(payments) {
  var liste = Array.isArray(payments) ? payments : [];
  for (var i = 0; i < liste.length; i++) if (estAbouti(liste[i])) return liste[i];
  return null;
}

/* ── Appel HTTP ───────────────────────────────────────────────────────────
   `fetch` global (Node ≥ 18 sur Vercel). Aucune dépendance ajoutée. */
async function appel(methode, chemin, corps, entetesSup) {
  var cle = cleSecrete();
  if (!cle) throw new Error('Revolut : clé secrète absente (REVOLUT_SECRET_KEY'
    + (modeProd() ? '' : '_SANDBOX') + ').');
  var entetes = Object.assign({
    'Authorization': 'Bearer ' + cle,
    'Revolut-Api-Version': VERSION_API
  }, corps ? { 'Content-Type': 'application/json' } : {}, entetesSup || {});

  var rep = await fetch(base() + chemin, {
    method: methode,
    headers: entetes,
    body: corps ? JSON.stringify(corps) : undefined
  });
  var texte = await rep.text();
  var data = null;
  try { data = texte ? JSON.parse(texte) : null; } catch (e) { /* corps non-JSON */ }
  if (!rep.ok) {
    /* ⛔ Le message d'erreur ne doit JAMAIS contenir la clé secrète : il part
       dans les journaux Vercel. On ne remonte que le statut et le message
       renvoyé par Revolut. */
    var msg = (data && (data.message || data.error)) || ('HTTP ' + rep.status);
    var err = new Error('Revolut ' + methode + ' ' + chemin + ' → ' + rep.status + ' : ' + msg);
    err.statut = rep.status;
    throw err;
  }
  return data;
}

/* ── Créer un ordre ───────────────────────────────────────────────────────
   Le montant arrive DÉJÀ calculé et vérifié par l'appelant. Ce module ne
   recalcule rien : il ne doit pas exister deux endroits où un prix se décide. */
async function creerPaiement(params) {
  var p = params || {};
  var corps = {
    amount: p.montantCents,
    currency: String(p.devise || 'eur').toUpperCase(),   // ISO 4217 en MAJUSCULES
    capture_mode: 'automatic',
    /* ⚠️ Sans ce réglage, un ordre non payé reste `pending` 30 JOURS et
       encombre le journal un mois. 30 minutes suffisent largement à un
       parcours d'achat. */
    expire_pending_after: 'PT30M'
  };
  if (p.description) corps.description = String(p.description).slice(0, 500);
  if (p.email) corps.customer = { email: String(p.email) };
  if (p.metadata && Object.keys(p.metadata).length) corps.metadata = p.metadata;
  if (p.reference) corps.merchant_order_data = { reference: String(p.reference).slice(0, 120) };
  if (p.urlRetour) corps.redirect_url = String(p.urlRetour);
  if (p.livraison && p.livraison.ligne1) {
    corps.shipping = {
      address: {
        street_line_1: p.livraison.ligne1,
        city: p.livraison.ville || '',
        postcode: p.livraison.codePostal || '',
        country_code: p.livraison.pays || 'FR'
      }
    };
    if (p.livraison.nom) corps.shipping.name = p.livraison.nom;
  }

  var o = await appel('POST', '/orders', corps);
  return {
    id: o.id,
    // Même rôle que le `client_secret` de Stripe : ce qui arme le widget.
    jetonClient: o.token,
    // Revolut fournit EN PLUS la page hébergée, dès la création. Stripe
    // exigeait un objet Session distinct — un aller-retour de moins.
    urlHebergee: o.checkout_url || null
  };
}

/* ── Relire un ordre et le rendre au format commun ────────────────────── */
async function lirePaiement(id) {
  var o = await appel('GET', '/orders/' + encodeURIComponent(String(id)));
  return depuisOrdre(o);
}

/* PUR — testé sans réseau. Sépare volontairement la conversion de l'appel :
   c'est la partie qui contient les deux pièges, donc celle qui doit être
   éprouvable hors ligne. */
function depuisOrdre(o) {
  var out = socle.paiementVide();
  if (!o) return out;
  out.fournisseur = 'revolut';
  out.id = o.id || null;
  out.etatBrut = o.state || null;
  out.etat = socle.normaliserEtat(o.state, ETATS_ORDRE);
  out.montantCents = (typeof o.amount === 'number') ? o.amount : null;
  out.devise = o.currency ? String(o.currency).toUpperCase() : null;
  out.metadata = o.metadata || {};

  var abouti = paiementAbouti(o.payments);
  out.commissionCents = commissionCents(o.payments);

  var payeur = (abouti && abouti.payer) || null;
  out.email = (payeur && payeur.email) || (o.customer && o.customer.email) || null;
  out.nom = (o.customer && o.customer.full_name)
    || (abouti && abouti.payment_method && abouti.payment_method.cardholder_name) || null;

  /* Adresse : facturation du paiement abouti en priorité (donnée non
     déclarative — c'est elle qui sert au contrôle fiscal détectif), repli sur
     l'adresse de livraison de l'ordre. */
  var adr = (abouti && abouti.billing_address) || (o.shipping && o.shipping.address) || null;
  if (adr) {
    out.adresse = {
      ligne1: adr.street_line_1 || null,
      ville: adr.city || null,
      codePostal: adr.postcode || null,
      pays: adr.country_code || null
    };
  }
  var mp = abouti && abouti.payment_method;
  if (mp) {
    out.paysCarte = mp.card_country_code || null;
    out.marqueCarte = mp.card_brand || null;
  }
  return out;
}

/* ── Lister les ordres sur une fenêtre — LE RATTRAPAGE ────────────────────
   Sert uniquement à la réconciliation : comparer ce que Revolut dit avoir
   encaissé à ce que notre journal contient. Voir reconciliation.js.

   La documentation donne `GET /api/orders` avec `from`, `to`, `limit` et
   `state`. On filtre sur `completed` — les seuls qui devraient avoir produit
   une commande chez nous.

   ⚠️ `limit` borné : une fenêtre trop large sur un compte actif renverrait des
   milliers d'ordres et ferait expirer la fonction serverless. On préfère
   plusieurs passages courts qu'un passage unique qui n'aboutit jamais. */
async function listerPaiements(depuisMs, jusquaMs) {
  var q = [];
  if (depuisMs) q.push('from=' + encodeURIComponent(new Date(depuisMs).toISOString()));
  if (jusquaMs) q.push('to=' + encodeURIComponent(new Date(jusquaMs).toISOString()));
  q.push('state=completed');
  q.push('limit=100');
  var rep = await appel('GET', '/orders?' + q.join('&'));
  var liste = (rep && Array.isArray(rep.orders)) ? rep.orders : [];
  return liste.map(function (o) {
    var n = depuisOrdre(o);
    // `creeAMs` : la réconciliation en a besoin pour son délai de grâce.
    n.creeAMs = o.created_at ? Date.parse(o.created_at) : null;
    return n;
  });
}

/* ── Signature du webhook ─────────────────────────────────────────────────
   Algorithme VÉRIFIÉ contre le vecteur de test officiel :

     payload_to_sign = "v1." + {Revolut-Request-Timestamp} + "." + {corps BRUT}
     signature       = "v1=" + HMAC_SHA256(signing_secret, payload).hex()

   ⚠️ `corpsBrut` DOIT être le Buffer reçu. Six formes de JSON produisent des
   octets différents pour la même donnée — prouvé. Le bodyParser est désactivé
   dans api/webhook.js exactement pour ça.

   ⚠️ L'en-tête peut porter PLUSIEURS signatures (rotation de secret) : on
   découpe et on compare à chacune, en temps constant.

   ⛔ FENÊTRE ANTI-REJEU : la documentation n'en donne AUCUNE. Les 5 minutes
   ci-dessous sont CHOISIES PAR NOUS, pas lues chez Revolut. Sans contrôle
   d'âge, une requête signée capturée se rejoue indéfiniment. */
var FENETRE_MS = 5 * 60 * 1000;

function verifierSignature(corpsBrut, entetes, maintenantMs) {
  var secret = secretWebhook();
  if (!secret) {
    return { ok: false, erreur: 'REVOLUT_WEBHOOK_SECRET'
      + (modeProd() ? '' : '_SANDBOX') + ' absent. Il est renvoyé par POST /api/webhooks '
      + '(champ signing_secret) et se relit par GET /api/webhooks/{id}.' };
  }
  var h = entetes || {};
  var horodatage = h['revolut-request-timestamp'] || h['Revolut-Request-Timestamp'];
  var signature = h['revolut-signature'] || h['Revolut-Signature'];
  if (!horodatage) return { ok: false, erreur: 'En-tête Revolut-Request-Timestamp ABSENT.' };
  if (!signature) return { ok: false, erreur: 'En-tête Revolut-Signature ABSENT.' };

  var ageMs = (typeof maintenantMs === 'number' ? maintenantMs : Date.now()) - Number(horodatage);
  if (!isFinite(ageMs) || Math.abs(ageMs) > FENETRE_MS) {
    return { ok: false, erreur: 'Horodatage hors fenêtre (' + Math.round(ageMs / 1000)
      + ' s d\'écart, tolérance ' + (FENETRE_MS / 1000) + ' s). Rejeu probable.' };
  }

  var attendue = calculerSignature(secret, horodatage, corpsBrut);
  if (!comparerSignatures(signature, attendue)) {
    return { ok: false, erreur: 'Signature invalide.' };   // ⛔ ne rien révéler de plus
  }

  var evenement = null;
  try { evenement = JSON.parse(Buffer.isBuffer(corpsBrut) ? corpsBrut.toString('utf8') : String(corpsBrut)); }
  catch (e) { return { ok: false, erreur: 'Corps signé mais illisible en JSON.' }; }
  if (!evenement || !evenement.event || !evenement.order_id) {
    return { ok: false, erreur: 'Charge utile sans `event` ou sans `order_id`.' };
  }

  return {
    ok: true,
    evenement: evenement,
    type: evenement.event,
    /* ⛔ Revolut ne fournit AUCUN identifiant d'événement. La clé d'idempotence
       se dérive donc de event + order_id. Sans ça, deux événements différents
       du même ordre se marcheraient dessus, ou une re-livraison serait
       retraitée. */
    cle: String(evenement.event) + ':' + String(evenement.order_id),
    genre: socle.normaliserGenre(evenement.event, GENRES_REVOLUT)
  };
}

/* PUR — c'est cette fonction qui a été confrontée au vecteur officiel. */
function calculerSignature(secret, horodatage, corpsBrut) {
  var h = crypto.createHmac('sha256', secret);
  h.update('v1.' + String(horodatage) + '.', 'utf8');
  h.update(Buffer.isBuffer(corpsBrut) ? corpsBrut : Buffer.from(String(corpsBrut), 'utf8'));
  return 'v1=' + h.digest('hex');
}

/* PUR. Compare en temps constant à CHACUNE des signatures de l'en-tête. */
function comparerSignatures(enTete, attendue) {
  var bonne = Buffer.from(String(attendue));
  return String(enTete || '').split(',').some(function (s) {
    var b = Buffer.from(s.trim());
    if (b.length !== bonne.length) {
      crypto.timingSafeEqual(bonne, bonne);   // travail constant, résultat faux
      return false;
    }
    return crypto.timingSafeEqual(b, bonne);
  });
}

/* ── Enregistrer le webhook chez Revolut ──────────────────────────────────
   `POST /api/webhooks` renvoie un `signing_secret` — la seule et unique fois
   où on peut le lire à la creation. Sans lui, aucune signature n'est
   verifiable, donc aucun evenement n'est accepte, donc aucune commande n'est
   traitee. C'est le maillon dont l'absence ne se voit qu'au premier paiement.

   Evenements retenus : les six qui existent. On s'abonne meme a ceux qu'on ne
   fait que journaliser (tentatives ratees) — une trace coute moins cher qu'un
   diagnostic a l'aveugle le jour ou un client dit « j'ai paye ». */
var EVENEMENTS = ['ORDER_COMPLETED', 'ORDER_AUTHORISED', 'ORDER_CANCELLED',
  'ORDER_FAILED', 'ORDER_PAYMENT_DECLINED', 'ORDER_PAYMENT_FAILED'];

async function creerWebhook(url) {
  var r = await appel('POST', '/webhooks', { url: String(url), events: EVENEMENTS });
  return {
    id: r && r.id,
    url: r && r.url,
    evenements: (r && r.events) || [],
    // ⚠️ Le SEUL moment ou ce secret est lisible a la creation. L'appelant doit
    // le poser sur Vercel immediatement — il n'est pas stocke ici.
    secretSignature: r && r.signing_secret
  };
}

/* Liste les webhooks deja enregistres — pour eviter d'en creer un deuxieme
   sur la meme URL (Revolut plafonne a 10, et deux abonnements identiques
   doublent chaque notification). */
async function listerWebhooks() {
  var r = await appel('GET', '/webhooks');
  return (r && Array.isArray(r.webhooks)) ? r.webhooks : [];
}

/* ── Remboursement ────────────────────────────────────────────────────────
   Crée un NOUVEL ordre de type `refund`, lié par `related_order_id`.
   `Idempotency-Key` évite le double remboursement si l'appel est rejoué. */
async function rembourser(id, montantCents, devise, cleIdempotence) {
  var corps = { amount: montantCents, currency: String(devise || 'eur').toUpperCase() };
  var sup = cleIdempotence ? { 'Idempotency-Key': String(cleIdempotence) } : {};
  var r = await appel('POST', '/orders/' + encodeURIComponent(String(id)) + '/refund', corps, sup);
  return {
    id: r && r.id,
    etat: socle.normaliserEtat(r && r.state, ETATS_ORDRE),
    etatBrut: (r && r.state) || null
  };
}

module.exports = {
  nom: nom,
  estConfigure: estConfigure,
  modeTest: modeTest,
  creerPaiement: creerPaiement,
  lirePaiement: lirePaiement,
  verifierSignature: verifierSignature,
  rembourser: rembourser,
  listerPaiements: listerPaiements,
  creerWebhook: creerWebhook,
  listerWebhooks: listerWebhooks,
  EVENEMENTS: EVENEMENTS,
  // Exportés pour les contrôles : ce sont les parties PURES, celles qui
  // portent les deux pièges et qui s'éprouvent sans réseau.
  depuisOrdre: depuisOrdre,
  commissionCents: commissionCents,
  calculerSignature: calculerSignature,
  comparerSignatures: comparerSignatures,
  ETATS_ORDRE: ETATS_ORDRE,
  GENRES_REVOLUT: GENRES_REVOLUT,
  ETATS_PAIEMENT: ETATS_PAIEMENT,
  FENETRE_MS: FENETRE_MS,
  _modeProd: modeProd,
  _base: base
};
