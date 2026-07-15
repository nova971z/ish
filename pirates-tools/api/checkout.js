// POST /api/checkout — Creates a Stripe Checkout Session (redirect fallback).
// Requires STRIPE_SECRET_KEY on Vercel.
//
// SECURITY: like /api/create-payment-intent, unit prices are resolved
// SERVER-SIDE from the catalogue. The client sends only { key, qty } (+ territory);
// any client-sent price is ignored.

'use strict';

var catalog = require('./_lib/catalog');
var pricing = require('./_lib/pricing');

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

  try {
    var stripe = require('stripe')(stripeKey);
    var body = req.body || {};
    var items = body.items;
    var customerEmail = body.customerEmail;
    var territory = body.territory || pricing.DEFAULT_TERRITORY;

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

    var session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      success_url: baseUrl + '/#/merci?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: baseUrl + '/#/devis',
      metadata: {
        source: 'pirates-tools',
        territory: String(territory),
        itemCount: String(items.length)
      }
    });

    return res.status(200).json({ ok: true, sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('[api/checkout] Stripe error:', err.message);
    return res.status(500).json({ ok: false, error: 'Payment session creation failed' });
  }
};
