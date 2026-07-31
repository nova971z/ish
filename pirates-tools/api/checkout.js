// POST /api/checkout — Creates a Stripe Checkout Session (redirect fallback).
// Requires STRIPE_SECRET_KEY on Vercel.
//
// SECURITY: like /api/create-payment-intent, unit prices are resolved
// SERVER-SIDE from the catalogue. The client sends only { key, qty } (+ territory);
// any client-sent price is ignored.

'use strict';

var catalog = require('./_lib/catalog');
var pricing = require('./_lib/pricing');
var paiementSocle = require('./_lib/paiement');   // couture : fournisseur actif
var rl = require('./_lib/ratelimit');
var loyalty = require('./_lib/loyalty');
var fbLib = require('./_lib/firebase');
var getFirebase = fbLib.getFirebase;

var MAX_QTY_PER_LINE = 99;
var MAX_LINES = 50;

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ⚠️ COUTURE PAIEMENT (31/07/2026) — voir api/_lib/paiement/index.js.
  // ⛔ La couche ne touche NI au prix, NI au territoire, NI à la remise : tout
  // reste calculé plus bas, côté serveur. Elle transporte, elle ne décide pas.
  var paiement = paiementSocle.fournisseur();
  if (!paiement.estConfigure()) {
    return res.status(503).json({ ok: false, error: 'Paiement non configuré (' + paiement.nom() + ').' });
  }
  // Le flux Checkout (page hébergée) est propre à Stripe : chez Revolut, la
  // même création d'ordre renvoie `token` ET `checkout_url`, donc les deux flux
  // du site convergeront. Tant que ce n'est pas fait, on refuse proprement.
  if (typeof paiement.creerSession !== 'function') {
    return res.status(503).json({
      ok: false,
      error: 'Le fournisseur ' + paiement.nom() + ' n\'expose pas de page de paiement hébergée. '
        + 'Utiliser le formulaire embarqué (/api/create-payment-intent).'
    });
  }

  // A4 — même limiteur que create-payment-intent : SEAU PARTAGÉ 'payment'
  // (une IP ne peut pas cumuler 20+20 en alternant les deux endpoints).
  if (!(await rl.allow('payment', rl.clientIp(req), 20, 3600))) {
    return res.status(429).json({ ok: false, error: 'Trop de tentatives. Réessayez dans une heure.' });
  }

  try {
    var body = req.body || {};
    var items = body.items;
    var customerEmail = body.customerEmail;

    // uid AUTHENTIFIÉ (S2) : vérifié depuis l'ID token Firebase du header
    // Authorization (jamais le corps). Absent/invalide → null. Voir
    // create-payment-intent.js pour le détail.
    var uid = await fbLib.verifyUid(req);

    // Territoire STRICT (A1) : absent → défaut ; fourni mais inconnu → 400.
    // Même règle que create-payment-intent — le webhook confronte ensuite ce
    // code à l'adresse de livraison collectée ci-dessous.
    var territory = body.territory == null || body.territory === ''
      ? pricing.DEFAULT_TERRITORY
      : String(body.territory);
    if (!pricing.getTerritory(territory)) {
      return res.status(400).json({ ok: false, error: 'Territoire inconnu' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Cart is empty' });
    }
    if (items.length > MAX_LINES) {
      return res.status(400).json({ ok: false, error: 'Too many items' });
    }

    var products = await catalog.loadCatalog();
    var lineItems = [];

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

      // Option coffret TSTAK : surcoût SERVEUR (0 si non éligible).
      var coffret = (raw.coffret === true || raw.coffret === 'true' || raw.coffret === 1) && pricing.coffretEligible(product);
      var unit = pricing.unitCents(product, territory) + (coffret ? pricing.coffretSurchargeCents(product) : 0);
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: (product.title || 'Produit Pirates Tools') + (coffret ? ' + coffret TSTAK' : ''),
            // Only allow catalogue-controlled absolute image URLs.
            ...(typeof product.img === 'string' && /^https?:\/\//.test(product.img)
              ? { images: [product.img] } : {})
          },
          unit_amount: unit
        },
        quantity: qty
      });
    }

    var origin = req.headers.origin || req.headers.referer || '';
    var baseUrl = origin.replace(/\/$/, '');

    // Remise fidélité serveur (même source que create-payment-intent : journal
    // payments/, infalsifiable). Stripe Checkout n'accepte pas de ligne
    // négative → coupon à usage unique au montant exact.
    var grossCents = lineItems.reduce(function (s, li) {
      return s + li.price_data.unit_amount * li.quantity;
    }, 0);
    var fb = getFirebase();
    var loyaltyQuote = uid && fb.db
      ? await loyalty.quote(fb.db, uid, grossCents)
      : { pct: 0, discountCents: 0 };
    // Remise appliquée seulement si elle ne fait pas passer sous le minimum
    // encaissable : mieux vaut une remise tronquée qu'un paiement refusé.
    var remiseCents = (loyaltyQuote.discountCents > 0
      && grossCents - loyaltyQuote.discountCents >= 50) ? loyaltyQuote.discountCents : 0;

    var session = await paiement.creerSession({
      lignes: lineItems,
      devise: 'eur',
      email: customerEmail || null,
      remiseCents: remiseCents,
      remiseLibelle: 'Fidélité −' + loyaltyQuote.pct + ' %',
      // A1 : adresse de livraison OBLIGATOIRE. C'est la donnée non-déclarative
      // qui permet au webhook de vérifier que le territoire facturé correspond
      // au lieu de livraison réel (code postal 97x → territoire, _lib/postal.js).
      // Les DOM ont leurs codes ISO propres (GP/MQ/GF/RE/YT) mais une adresse
      // DOM est aussi couramment saisie sous FR — les deux sont acceptés, le
      // code postal fait foi.
      paysLivraison: ['GP', 'MQ', 'GF', 'RE', 'YT', 'FR'],
      urlSucces: baseUrl + '/#/merci?session_id={CHECKOUT_SESSION_ID}',
      urlAnnule: baseUrl + '/#/devis',
      metadata: Object.assign({
        source: 'pirates-tools',
        territory: String(territory),
        itemCount: String(items.length),
        loyaltyPct: String(loyaltyQuote.pct),
        loyaltyDiscountCents: String(loyaltyQuote.discountCents)
      }, uid ? { uid: uid } : {})
    });

    return res.status(200).json({ ok: true, sessionId: session.id, url: session.urlHebergee });
  } catch (err) {
    console.error('[api/checkout] création de session échouée:', err.message);
    return res.status(500).json({ ok: false, error: 'Payment session creation failed' });
  }
};
