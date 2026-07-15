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

    // Territoire STRICT (A1) : absent → défaut ; fourni mais inconnu → 400.
    // Avant, un code invalide retombait silencieusement sur le défaut, ce qui
    // masquait toute tentative de manipulation du taux de taxe. Le code validé
    // est ensuite confronté à l'adresse réelle par le webhook (contrôle
    // détectif — voir api/_lib/postal.js).
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

    // Resolve every line against the server catalogue.
    var products = await catalog.loadCatalog();
    var totalCents = 0;
    var description = [];

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
    }

    if (totalCents < 50) {
      return res.status(400).json({ ok: false, error: 'Montant minimum : 0,50 €' });
    }

    var intentParams = {
      amount: totalCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      description: description.join(', ').substring(0, 500),
      metadata: {
        source: 'pirates-tools',
        territory: String(territory),
        itemCount: String(items.length),
        serverTotalEur: (totalCents / 100).toFixed(2)
      }
    };
    if (customerEmail) intentParams.receipt_email = customerEmail;

    var paymentIntent = await stripe.paymentIntents.create(intentParams);

    return res.status(200).json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: totalCents // authoritative amount, for optional client reconciliation
    });
  } catch (err) {
    console.error('[api/create-payment-intent] Stripe error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur création du paiement' });
  }
};
