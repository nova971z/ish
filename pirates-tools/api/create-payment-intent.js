// POST /api/create-payment-intent — Creates a Stripe PaymentIntent for Elements.
// Requires STRIPE_SECRET_KEY on Vercel.
//
// SECURITY: prices are resolved SERVER-SIDE from the catalogue. The client sends
// only { key, qty } per line (+ territory); any price sent by the client is
// ignored. This closes the "pay 1 cent for anything" hole — the amount charged
// can never be influenced by the browser.

'use strict';

var catalog = require('./_lib/catalog');
var pricing = require('./_lib/pricing');
var stripeMeta = require('./_lib/stripe-meta');
var rl = require('./_lib/ratelimit');
var loyalty = require('./_lib/loyalty');
var postal = require('./_lib/postal');
var fbLib = require('./_lib/firebase');
var getFirebase = fbLib.getFirebase;

var MAX_QTY_PER_LINE = 99;
var MAX_LINES = 50;

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  var stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(503).json({
      ok: false,
      error: 'Stripe not configured. Add STRIPE_SECRET_KEY in Vercel environment variables.'
    });
  }

  // A4 — endpoint public : borne la création d'objets Stripe (pollution
  // dashboard, alertes fraude). 20/h/IP = généreux pour un client légitime
  // qui re-essaie sa carte ; fail-open si Firestore indisponible (documenté).
  if (!(await rl.allow('payment', rl.clientIp(req), 20, 3600))) {
    return res.status(429).json({ ok: false, error: 'Trop de tentatives. Réessayez dans une heure.' });
  }

  try {
    var stripe = require('stripe')(stripeKey);
    var body = req.body || {};
    var items = body.items;
    var customerEmail = body.customerEmail;

    // uid AUTHENTIFIÉ (S2) : vérifié depuis l'ID token Firebase du header
    // Authorization, jamais depuis le corps de la requête. C'est ce qui empêche
    // un attaquant de réclamer la remise fidélité d'autrui ou de polluer son
    // historique en envoyant un uid arbitraire. Absent/invalide → null (aucune
    // remise, aucun matching par uid). Le body.uid éventuel est IGNORÉ.
    var uid = await fbLib.verifyUid(req);

    // Territoire fiscal (H3) : le code postal de livraison est OBLIGATOIRE et
    // constitue la SEULE source du territoire de taxation, re-dérivé côté
    // serveur (postal.territoryFromPostal). Fini le mode « déclaratif » :
    // auparavant, un appel API direct sans postalCode retombait sur
    // body.territory, permettant de payer au taux Mayotte (TVA 0 %, octroi 0 %)
    // ≈ −19 % pour n'importe quelle livraison. Le client (modale adresse-
    // d'abord) envoie toujours le CP. body.territory est désormais IGNORÉ pour
    // le montant débité.
    var postalCode = typeof body.postalCode === 'string' ? body.postalCode.trim().slice(0, 12) : '';
    if (!postalCode) {
      return res.status(400).json({ ok: false, error: 'Code postal de livraison requis.' });
    }
    var territory = postal.territoryFromPostal(postalCode);
    if (!territory) {
      return res.status(400).json({
        ok: false,
        error: 'Livraison uniquement en Guadeloupe, Martinique, Guyane, La Réunion et Mayotte (code postal 971xx–976xx).'
      });
    }
    var territorySource = 'postal';

    // Adresse de livraison (facultative côté API, envoyée par la modale) :
    // attachée au PaymentIntent (visible Stripe/antifraude, relue par le
    // webhook pour le contrôle détectif). Chaînes bornées, jamais bloquant.
    function cleanStr(s, max) { return typeof s === 'string' ? s.trim().slice(0, max) : ''; }
    var shipIn = body.shipping || {};
    var shipping = null;
    if (postalCode && cleanStr(shipIn.line1, 200)) {
      shipping = {
        name: cleanStr(shipIn.name, 120) || 'Client Pirates Tools',
        address: {
          line1: cleanStr(shipIn.line1, 200),
          city: cleanStr(shipIn.city, 120),
          postal_code: postalCode,
          country: 'FR'
        }
      };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Cart is empty' });
    }
    if (items.length > MAX_LINES) {
      return res.status(400).json({ ok: false, error: 'Too many items' });
    }

    // Resolve every line against the server catalogue.
    var products = await catalog.loadCatalog();
    var totalCents = 0;
    var description = [];
    var validatedLines = []; // lignes {key, qty} VALIDÉES (clé résolue, qty bornée)

    for (var i = 0; i < items.length; i++) {
      var raw = items[i] || {};
      var key = raw.key || raw.id || raw.slug;
      var qty = parseInt(raw.qty, 10);
      if (!isFinite(qty) || qty < 1) qty = 1;
      if (qty > MAX_QTY_PER_LINE) qty = MAX_QTY_PER_LINE;

      var product = catalog.findByKey(products, key);
      if (!product) {
        return res.status(400).json({ ok: false, error: 'Produit introuvable', key: String(key || '') });
      }

      totalCents += pricing.unitCents(product, territory) * qty;
      description.push((product.title || 'Produit') + ' x' + qty);
      validatedLines.push({ key: product.slug || product.id || String(key), qty: qty });
    }

    if (totalCents < 50) {
      return res.status(400).json({ ok: false, error: 'Montant minimum : 0,50 €' });
    }

    // Remise fidélité SERVEUR : calculée depuis le journal payments/ (écrit
    // uniquement par le webhook — infalsifiable côté client), jamais depuis un
    // état client. Fail-open 0 % (un souci de fidélité ne bloque pas la vente).
    var fb = getFirebase();
    var loyaltyQuote = uid && fb.db
      ? await loyalty.quote(fb.db, uid, totalCents)
      : { pct: 0, discountCents: 0, verifiedSpendCents: 0, tierKey: 'bronze', tierLabel: 'Bronze' };
    var amountCents = totalCents - loyaltyQuote.discountCents;
    if (amountCents < 50) {
      // Remise ramenant sous le minimum Stripe : on la tronque plutôt que
      // d'échouer un paiement légitime.
      loyaltyQuote = { pct: 0, discountCents: 0, verifiedSpendCents: loyaltyQuote.verifiedSpendCents, tierKey: loyaltyQuote.tierKey, tierLabel: loyaltyQuote.tierLabel };
      amountCents = totalCents;
    }

    // A2 : les lignes {key, qty} voyagent dans la metadata (chunkées — limite
    // Stripe 500 car./valeur). Le webhook payment_intent.succeeded les relit
    // pour reconstruire la commande côté serveur (email détaillé + journal),
    // ce qu'un PaymentIntent ne permet pas nativement (pas de line_items).
    var itemsMeta = stripeMeta.chunkItems(validatedLines) || {};

    var intentParams = {
      amount: amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      description: description.join(', ').substring(0, 500),
      metadata: Object.assign({
        source: 'pirates-tools',
        territory: String(territory),
        territorySource: territorySource,
        postalCode: postalCode,
        itemCount: String(validatedLines.length),
        serverTotalEur: (amountCents / 100).toFixed(2),
        grossTotalEur: (totalCents / 100).toFixed(2),
        loyaltyPct: String(loyaltyQuote.pct),
        loyaltyDiscountCents: String(loyaltyQuote.discountCents)
      }, uid ? { uid: uid } : {}, itemsMeta)
    };
    if (customerEmail) intentParams.receipt_email = customerEmail;
    if (shipping) intentParams.shipping = shipping;

    var paymentIntent = await stripe.paymentIntents.create(intentParams);

    return res.status(200).json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountCents,   // montant DÉBITÉ (remise déduite) — le client DOIT afficher celui-ci
      gross: totalCents,     // total plein tarif avant remise
      loyalty: {
        pct: loyaltyQuote.pct,
        discountCents: loyaltyQuote.discountCents,
        verifiedSpendCents: loyaltyQuote.verifiedSpendCents,
        tierKey: loyaltyQuote.tierKey,
        tierLabel: loyaltyQuote.tierLabel
      }
    });
  } catch (err) {
    console.error('[api/create-payment-intent] Stripe error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur création du paiement' });
  }
};
