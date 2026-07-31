/* api/_lib/paiement/stripe.js — Stripe derrière le contrat commun.
   ─────────────────────────────────────────────────────────────────────────
   Ce module ne change RIEN au comportement : il enveloppe exactement les
   appels qui existaient déjà, aux mêmes endroits, avec les mêmes paramètres.
   Son seul rôle est de les rendre remplaçables.

   ⚠️ Tant que `PAYMENT_PROVIDER` n'est pas `revolut`, c'est ce fichier qui
   encaisse. Toute « simplification » ici touche de l'argent réel.
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

var socle = require('./index');

/* Table des états Stripe → vocabulaire commun. EXPLICITE et exhaustive pour
   les états documentés ; tout le reste tombe en 'inconnu' par construction.

   ⚠️ `requires_capture` est bien 'autorise' et PAS 'paye' : l'argent est
   réservé, pas encaissé. Le site n'utilise pas la capture différée aujourd'hui,
   mais si quelqu'un l'active un jour, cette ligne évite d'expédier un outil
   sur une simple autorisation. */
var ETATS_STRIPE = {
  'requires_payment_method': 'en_attente',
  'requires_confirmation': 'en_attente',
  'requires_action': 'en_attente',
  'processing': 'en_attente',
  'requires_capture': 'autorise',
  'succeeded': 'paye',
  'canceled': 'annule',
  'cancelled': 'annule'
};

function nom() { return 'stripe'; }

function cle() { return process.env.STRIPE_SECRET_KEY || ''; }

function estConfigure() { return !!cle(); }

function sdk() {
  var k = cle();
  if (!k) throw new Error('STRIPE_SECRET_KEY absente');
  return require('stripe')(k);
}

/* Crée l'intention de paiement.
   params : { montantCents, devise, description, metadata, email, livraison }
   livraison : { nom, ligne1, ville, codePostal, pays }

   ⚠️ Le montant arrive DÉJÀ calculé et vérifié par l'appelant. Ce module ne
   recalcule rien : il ne doit pas exister deux endroits où un prix se décide. */
async function creerPaiement(params) {
  var p = params || {};
  var intentParams = {
    amount: p.montantCents,
    currency: String(p.devise || 'eur').toLowerCase(),
    automatic_payment_methods: { enabled: true },
    description: String(p.description || '').substring(0, 500),
    metadata: p.metadata || {}
  };
  if (p.email) intentParams.receipt_email = p.email;
  if (p.livraison && p.livraison.ligne1) {
    intentParams.shipping = {
      name: p.livraison.nom || 'Client Pirates Tools',
      address: {
        line1: p.livraison.ligne1,
        city: p.livraison.ville || '',
        postal_code: p.livraison.codePostal || '',
        country: p.livraison.pays || 'FR'
      }
    };
  }
  var pi = await sdk().paymentIntents.create(intentParams);
  return {
    id: pi.id,
    // Stripe : le client monte le formulaire avec ce secret.
    // Revolut : ce sera le `token` de l'ordre. Même rôle, même champ.
    jetonClient: pi.client_secret,
    // Stripe Elements n'a pas de page hébergée (c'est le flux Checkout, à part).
    // Revolut fournit `checkout_url` dès la création. Champ prévu, null ici.
    urlHebergee: null
  };
}

/* Relit un paiement et le rend au format commun.
   `avecCommission` déclenche les appels supplémentaires (charge puis balance
   transaction) — coûteux, donc réservé au webhook qui en a besoin pour la
   comptabilité. Une simple vérification d'état ne les paie pas. */
async function lirePaiement(id, options) {
  var opts = options || {};
  var pi = await sdk().paymentIntents.retrieve(String(id));
  return await depuisIntent(pi, opts.avecCommission === true);
}

/* ⚠️ SPÉCIFIQUE AU FLUX CHECKOUT (redirection) — PAS dans le contrat commun.
   Revolut n'aura pas d'équivalent : chez lui, la page hébergée et le widget
   partagent le MÊME objet `order`, donc les deux flux du site convergeront sur
   `lirePaiement`. Cette fonction disparaîtra alors. C'est pourquoi elle ne
   figure pas dans OPERATIONS — un fournisseur n'a pas à la fournir, et
   l'appelant teste sa présence avant de s'en servir. */
async function lireSession(sessionId) {
  return await sdk().checkout.sessions.retrieve(String(sessionId), {
    expand: ['line_items', 'line_items.data.price.product', 'customer_details']
  });
}

/* Convertit un PaymentIntent Stripe (déjà en main) en paiement normalisé.
   Exporté à part : le webhook reçoit l'objet dans l'événement, il n'a pas à le
   re-télécharger. */
async function depuisIntent(pi, avecCommission) {
  var s = sdk();
  var out = socle.paiementVide();
  out.fournisseur = 'stripe';
  out.id = pi.id;
  out.etatBrut = pi.status || null;
  out.etat = socle.normaliserEtat(pi.status, ETATS_STRIPE);
  out.montantCents = (typeof pi.amount === 'number') ? pi.amount : null;
  out.devise = (pi.currency || 'eur').toUpperCase();
  out.metadata = pi.metadata || {};

  var charge = null;
  if (avecCommission || pi.latest_charge) {
    try {
      if (typeof pi.latest_charge === 'string') charge = await s.charges.retrieve(pi.latest_charge);
      else if (pi.latest_charge && typeof pi.latest_charge === 'object') charge = pi.latest_charge;
    } catch (e) {
      // Best-effort : l'absence de charge ne doit pas faire échouer une
      // lecture d'état. Le journal serveur restera moins détaillé, c'est tout.
      console.error('[paiement/stripe] charge illisible:', e.message);
    }
  }
  var billing = (charge && charge.billing_details) || {};
  var adr = (pi.shipping && pi.shipping.address) || billing.address || null;
  out.email = pi.receipt_email || billing.email || null;
  out.nom = (pi.shipping && pi.shipping.name) || billing.name || null;
  if (adr) {
    out.adresse = {
      ligne1: adr.line1 || null, ville: adr.city || null,
      codePostal: adr.postal_code || null, pays: adr.country || null
    };
  }
  if (charge && charge.payment_method_details && charge.payment_method_details.card) {
    var c = charge.payment_method_details.card;
    out.paysCarte = c.country || null;
    out.marqueCarte = c.brand || null;
  }

  /* ⚠️ COMMISSION RÉELLE, jamais estimée. C'est ce qui rend la comptabilité
     « 100 % réelle » (voir api/_lib/accounting.js). Si la lecture échoue, on
     laisse `null` — surtout PAS une estimation, qui aurait l'air d'un vrai
     chiffre dans le compte de résultat. */
  if (avecCommission && charge) {
    try {
      var bt = charge.balance_transaction;
      if (typeof bt === 'string') {
        var plein = await s.balanceTransactions.retrieve(bt);
        if (plein && typeof plein.fee === 'number') out.commissionCents = plein.fee;
      } else if (bt && typeof bt.fee === 'number') {
        out.commissionCents = bt.fee;
      }
    } catch (e) {
      console.error('[paiement/stripe] commission illisible:', e.message);
    }
  }
  return out;
}

/* Vérifie la signature du webhook sur le corps BRUT.
   ⚠️ `corpsBrut` DOIT être le Buffer reçu, jamais un objet re-sérialisé :
   six formes de JSON produisent des octets différents pour la même donnée.
   Retourne toujours un objet — jamais d'exception à gérer chez l'appelant. */
function verifierSignature(corpsBrut, entetes) {
  var secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { ok: false, erreur: 'STRIPE_WEBHOOK_SECRET absente' };
  var sig = entetes && (entetes['stripe-signature'] || entetes['Stripe-Signature']);
  if (!sig) return { ok: false, erreur: 'En-tête stripe-signature absent' };
  try {
    var evenement = sdk().webhooks.constructEvent(corpsBrut, sig, secret);
    return {
      ok: true,
      evenement: evenement,
      type: evenement.type,
      // Clé d'idempotence : Stripe fournit un identifiant d'événement unique.
      // ⚠️ Revolut n'en fournit AUCUN — sa clé devra être dérivée de
      // event + order_id. D'où ce champ dans le contrat plutôt qu'un
      // `event.id` recopié partout.
      cle: evenement.id
    };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
}

/* Remboursement. `cleIdempotence` évite le double remboursement si l'appel est
   rejoué (réseau coupé après l'envoi mais avant la réponse). */
async function rembourser(id, montantCents, devise, cleIdempotence) {
  var params = { payment_intent: String(id) };
  if (montantCents != null) params.amount = montantCents;
  var opts = cleIdempotence ? { idempotencyKey: String(cleIdempotence) } : {};
  var r = await sdk().refunds.create(params, opts);
  return { id: r.id, etat: r.status === 'succeeded' ? 'rembourse' : 'en_attente', etatBrut: r.status || null };
}

module.exports = {
  nom: nom,
  estConfigure: estConfigure,
  creerPaiement: creerPaiement,
  lirePaiement: lirePaiement,
  verifierSignature: verifierSignature,
  rembourser: rembourser,
  // Exportés pour le webhook (qui a déjà l'objet) et pour les contrôles.
  depuisIntent: depuisIntent,
  lireSession: lireSession,   // ⚠️ hors contrat commun — voir son commentaire
  ETATS_STRIPE: ETATS_STRIPE
};
