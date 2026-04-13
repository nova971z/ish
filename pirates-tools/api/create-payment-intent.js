// POST /api/create-payment-intent — Creates a Stripe PaymentIntent for Elements
// Requires STRIPE_SECRET_KEY environment variable on Vercel

module.exports = async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    var territory = body.territory || '';

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Cart is empty' });
    }

    // Compute total in cents
    var totalCents = 0;
    var description = [];
    items.forEach(function (item) {
      var cents = Math.round((item.price || 0) * 100) * (item.qty || 1);
      totalCents += cents;
      description.push((item.title || 'Produit') + ' x' + (item.qty || 1));
    });

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
        territory: territory,
        itemCount: String(items.length)
      }
    };

    if (customerEmail) {
      intentParams.receipt_email = customerEmail;
    }

    var paymentIntent = await stripe.paymentIntents.create(intentParams);

    return res.status(200).json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    console.error('[api/create-payment-intent] Stripe error:', err.message);
    return res.status(500).json({
      ok: false,
      error: 'Erreur création du paiement'
    });
  }
};
