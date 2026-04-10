// POST /api/checkout — Creates a Stripe Checkout Session
// Requires STRIPE_SECRET_KEY environment variable on Vercel

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(503).json({
      ok: false,
      error: 'Stripe not configured. Add STRIPE_SECRET_KEY in Vercel environment variables.'
    });
  }

  try {
    const stripe = require('stripe')(stripeKey);
    const { items, customerEmail } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Cart is empty' });
    }

    // Build Stripe line items from cart
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.title || 'Produit Pirates Tools',
          ...(item.image ? { images: [item.image] } : {})
        },
        unit_amount: Math.round((item.price || 0) * 100) // cents
      },
      quantity: item.qty || 1
    }));

    const origin = req.headers.origin || req.headers.referer || 'https://nova971z.github.io/ish';
    const baseUrl = origin.replace(/\/$/, '');

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      success_url: baseUrl + '/#/paiement/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: baseUrl + '/#/paiement/annule',
      metadata: {
        source: 'pirates-tools',
        itemCount: String(items.length)
      }
    });

    return res.status(200).json({
      ok: true,
      sessionId: session.id,
      url: session.url
    });
  } catch (err) {
    console.error('[api/checkout] Stripe error:', err.message);
    return res.status(500).json({
      ok: false,
      error: 'Payment session creation failed'
    });
  }
};
