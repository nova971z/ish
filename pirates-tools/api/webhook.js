// POST /api/webhook — Stripe webhook for payment confirmation
// Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET env vars.
// Optional: RESEND_API_KEY + RESEND_FROM + OWNER_EMAIL for transactional email.

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
        const sessionLite = event.data.object;
        console.log('[webhook] Payment confirmed:', sessionLite.id, 'Amount:', sessionLite.amount_total);

        // Retrieve the full session with line items and customer details for email
        let fullSession = sessionLite;
        try {
          fullSession = await stripe.checkout.sessions.retrieve(sessionLite.id, {
            expand: ['line_items', 'line_items.data.price.product', 'customer_details']
          });
        } catch (retrieveErr) {
          console.error('[webhook] Could not retrieve session:', retrieveErr.message);
        }

        // Update Firestore order status if Firebase Admin is configured
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
              .where('stripeSessionId', '==', sessionLite.id)
              .limit(1)
              .get();

            if (!usersSnap.empty) {
              const orderDoc = usersSnap.docs[0];
              await orderDoc.ref.update({
                status: 'paid',
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                stripePaymentIntent: sessionLite.payment_intent
              });
              console.log('[webhook] Order updated:', orderDoc.id);
            }
          } catch (fbErr) {
            console.error('[webhook] Firestore update failed:', fbErr.message);
          }
        }

        // Send confirmation emails via Resend (optional)
        try {
          await sendOrderEmails(fullSession);
        } catch (mailErr) {
          console.error('[webhook] Email send failed:', mailErr.message);
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

// ── Resend transactional email (HTTP, no SDK) ──────────────────
async function sendOrderEmails(session) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Pirates Tools <onboarding@resend.dev>';
  const ownerEmail = process.env.OWNER_EMAIL || '';

  if (!apiKey) {
    console.log('[webhook] RESEND_API_KEY not set — skipping email');
    return;
  }

  const currency = (session.currency || 'eur').toUpperCase();
  const totalStr = formatAmount(session.amount_total, currency);
  const customerEmail = (session.customer_details && session.customer_details.email) || session.customer_email || '';
  const customerName = (session.customer_details && session.customer_details.name) || '';
  const lineItems = (session.line_items && session.line_items.data) || [];

  const itemsHtml = lineItems.map((li) => {
    const name = (li.description) || (li.price && li.price.product && li.price.product.name) || 'Produit';
    const qty = li.quantity || 1;
    const unit = li.price ? formatAmount(li.price.unit_amount, currency) : '';
    const sub = formatAmount(li.amount_total, currency);
    return '<tr>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee">' + escape(name) + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">' + qty + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">' + unit + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">' + sub + '</td>'
      + '</tr>';
  }).join('');

  const orderRef = (session.id || '').slice(-8).toUpperCase();

  const baseHtml = function (title, intro) {
    return '<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#0a0f14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf5">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f14;padding:32px 0">'
      + '<tr><td align="center">'
      + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#0f1720;border:1px solid rgba(139,92,246,.3);border-radius:16px;overflow:hidden;max-width:600px">'
      + '<tr><td style="background:linear-gradient(135deg,#8B5CF6,#6d28d9);padding:28px 32px;text-align:center">'
      + '<h1 style="margin:0;font-size:24px;color:#fff;letter-spacing:.5px">PIRATES TOOLS</h1>'
      + '<p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">Outillage professionnel</p>'
      + '</td></tr>'
      + '<tr><td style="padding:32px">'
      + '<h2 style="margin:0 0 8px;font-size:20px;color:#fff">' + escape(title) + '</h2>'
      + '<p style="margin:0 0 20px;color:#9aa4b2;font-size:14px;line-height:1.6">' + intro + '</p>'
      + '<div style="background:#0a0f14;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin:16px 0">'
      + '<p style="margin:0;color:#9aa4b2;font-size:12px;text-transform:uppercase;letter-spacing:.06em">Référence commande</p>'
      + '<p style="margin:4px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:16px;color:#8B5CF6;font-weight:700">#' + escape(orderRef) + '</p>'
      + '</div>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;background:#0a0f14;border-radius:12px;overflow:hidden">'
      + '<thead><tr style="background:rgba(139,92,246,.1)">'
      + '<th align="left" style="padding:10px 12px;font-size:12px;color:#9aa4b2;text-transform:uppercase">Produit</th>'
      + '<th align="center" style="padding:10px 12px;font-size:12px;color:#9aa4b2;text-transform:uppercase">Qté</th>'
      + '<th align="right" style="padding:10px 12px;font-size:12px;color:#9aa4b2;text-transform:uppercase">PU</th>'
      + '<th align="right" style="padding:10px 12px;font-size:12px;color:#9aa4b2;text-transform:uppercase">Total</th>'
      + '</tr></thead>'
      + '<tbody style="color:#e6edf5;font-size:14px">' + itemsHtml + '</tbody>'
      + '<tfoot><tr><td colspan="3" align="right" style="padding:14px 12px;font-weight:700;color:#fff">Total TTC</td>'
      + '<td align="right" style="padding:14px 12px;font-weight:700;color:#8B5CF6;font-size:16px">' + totalStr + '</td></tr></tfoot>'
      + '</table>'
      + '<p style="margin:24px 0 0;color:#9aa4b2;font-size:13px;line-height:1.6">'
      + 'Besoin d\'aide ? Écris-nous sur WhatsApp : <a href="https://wa.me/33744776598" style="color:#8B5CF6;text-decoration:none">07 44 77 65 98</a>'
      + '</p>'
      + '</td></tr>'
      + '<tr><td style="background:#0a0f14;padding:16px 32px;text-align:center;border-top:1px solid rgba(255,255,255,.06)">'
      + '<p style="margin:0;color:#6b7280;font-size:11px">© Pirates Tools — Antilles françaises</p>'
      + '</td></tr>'
      + '</table></td></tr></table></body></html>';
  };

  // Customer confirmation email
  if (customerEmail) {
    const intro = 'Bonjour' + (customerName ? ' ' + escape(customerName) : '') + ', nous avons bien reçu votre paiement. Votre commande est en cours de préparation — vous serez contacté·e sous peu pour la livraison.';
    await resendSend(apiKey, {
      from: from,
      to: customerEmail,
      subject: 'Confirmation de commande #' + orderRef + ' — Pirates Tools',
      html: baseHtml('Merci pour votre commande !', intro)
    });
    console.log('[webhook] Customer email sent to', customerEmail);
  }

  // Owner notification email
  if (ownerEmail) {
    const intro = 'Nouvelle commande payée sur le site. '
      + (customerEmail ? 'Client : <strong>' + escape(customerEmail) + '</strong>' + (customerName ? ' (' + escape(customerName) + ')' : '') + '.' : 'Email client non fourni.');
    await resendSend(apiKey, {
      from: from,
      to: ownerEmail,
      subject: '[Pirates Tools] Commande payée #' + orderRef + ' — ' + totalStr,
      html: baseHtml('Nouvelle commande reçue', intro),
      reply_to: customerEmail || undefined
    });
    console.log('[webhook] Owner email sent to', ownerEmail);
  }
}

async function resendSend(apiKey, payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error('Resend ' + r.status + ': ' + body);
  }
  return r.json();
}

function formatAmount(cents, currency) {
  if (typeof cents !== 'number') return '—';
  const val = (cents / 100).toFixed(2).replace('.', ',');
  const sym = currency === 'EUR' ? '€' : currency;
  return val + ' ' + sym;
}

function escape(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
