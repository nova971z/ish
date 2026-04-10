// POST /api/webhook — Stripe webhook for payment confirmation
// Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET env vars

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return res.status(503).json({ ok: false, error: 'Stripe webhook not configured' });
  }

  try {
    const stripe = require('stripe')(stripeKey);

    // Verify signature
    const sig = req.headers['stripe-signature'];
    const rawBody = req.body; // Vercel passes raw body for webhooks
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
        sig,
        webhookSecret
      );
    } catch (err) {
      console.error('[webhook] Signature verification failed:', err.message);
      return res.status(400).json({ ok: false, error: 'Invalid signature' });
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('[webhook] Payment confirmed:', session.id, 'Amount:', session.amount_total);

        // If Firebase Admin is configured, update order status
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (serviceAccount) {
          try {
            const admin = require('firebase-admin');
            if (!admin.apps.length) {
              admin.initializeApp({
                credential: admin.credential.cert(JSON.parse(serviceAccount))
              });
            }
            const db = admin.firestore();

            // Find and update order by Stripe session ID
            const usersSnap = await db.collectionGroup('orders')
              .where('stripeSessionId', '==', session.id)
              .limit(1)
              .get();

            if (!usersSnap.empty) {
              const orderDoc = usersSnap.docs[0];
              await orderDoc.ref.update({
                status: 'paid',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                stripePaymentIntent: session.payment_intent
              });
              console.log('[webhook] Order updated:', orderDoc.id);
            }
          } catch (fbErr) {
            console.error('[webhook] Firestore update failed:', fbErr.message);
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        console.log('[webhook] Session expired:', event.data.object.id);
        break;
      }

      default:
        console.log('[webhook] Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'Webhook processing failed' });
  }
};
