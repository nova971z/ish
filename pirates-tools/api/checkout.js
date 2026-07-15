// POST /api/checkout — Creates a Stripe Checkout Session (redirect fallback).
// Requires STRIPE_SECRET_KEY on Vercel.
//
// SECURITY: like /api/create-payment-intent, unit prices are resolved
// SERVER-SIDE from the catalogue. The client sends only { key, qty } (+ territory);
// any client-sent price is ignored.

'use strict';

var catalog = require('./_lib/catalog');
var pricing = require('./_lib/pricing');
var rl = require('./_lib/ratelimit');
var loyalty = require('./_lib/loyalty');
var getFirebase = require('./_lib/firebase').getFirebase;

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

  // A4 — même limiteur que create-payment-intent : SEAU PARTAGÉ 'payment'
  // (une IP ne peut pas cumuler 20+20 en alternant les deux endpoints).
  if (!(await rl.allow('payment', rl.clientIp(req), 20, 3600))) {
    return res.status(429).json({ ok: false, error: 'Trop de tentatives. Réessayez dans une heure.' });
  }

  try {
    var stripe = require('stripe')(stripeKey);
    var body = req.body || {};
    var items = body.items;
    var customerEmail = body.customerEmail;

    // uid Firebase (déclaratif — voir create-payment-intent.js) : matching
    // commande + journal payments/ côté webhook. Sanitisé, jamais un droit.
    var uid = typeof body.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.uid)
      ? body.uid : null;

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

      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: product.title || 'Produit Pirates Tools',
            // Only allow catalogue-controlled absolute image URLs.
            ...(typeof product.img === 'string' && /^https?:\/\//.test(product.img)
              ? { images: [product.img] } : {})
          },
          unit_amount: pricing.unitCents(product, territory)
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
    var discounts = [];
    if (loyaltyQuote.discountCents > 0 && grossCents - loyaltyQuote.discountCents >= 50) {
      var coupon = await stripe.coupons.create({
        amount_off: loyaltyQuote.discountCents,
        currency: 'eur',
        duration: 'once',
        name: 'Fidélité −' + loyaltyQuote.pct + ' %'
      });
      discounts = [{ coupon: coupon.id }];
    }

    var session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      // A1 : adresse de livraison OBLIGATOIRE. C'est la donnée non-déclarative
      // qui permet au webhook de vérifier que le territoire facturé correspond
      // au lieu de livraison réel (code postal 97x → territoire, _lib/postal.js).
      // Les DOM ont leurs codes ISO propres (GP/MQ/GF/RE/YT) mais une adresse
      // DOM est aussi couramment saisie sous FR — les deux sont acceptés, le
      // code postal fait foi.
      shipping_address_collection: {
        allowed_countries: ['GP', 'MQ', 'GF', 'RE', 'YT', 'FR']
      },
      ...(discounts.length ? { discounts: discounts } : {}),
      success_url: baseUrl + '/#/merci?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: baseUrl + '/#/devis',
      metadata: Object.assign({
        source: 'pirates-tools',
        territory: String(territory),
        itemCount: String(items.length),
        loyaltyPct: String(loyaltyQuote.pct),
        loyaltyDiscountCents: String(loyaltyQuote.discountCents)
      }, uid ? { uid: uid } : {})
    });

    return res.status(200).json({ ok: true, sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('[api/checkout] Stripe error:', err.message);
    return res.status(500).json({ ok: false, error: 'Payment session creation failed' });
  }
};
