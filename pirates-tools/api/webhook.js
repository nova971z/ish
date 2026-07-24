// POST /api/webhook — Stripe webhook for payment confirmation
// Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET env vars.
// Optional: RESEND_API_KEY + RESEND_FROM + OWNER_EMAIL for transactional email.
//
// Correctness requirements handled here:
//  1. RAW BODY — Stripe signs the exact request bytes. Vercel's default parser
//     would turn the body into an object; re-stringifying it does NOT reproduce
//     the signed bytes and breaks (or masks) signature verification. We disable
//     the body parser (config below) and read the raw stream ourselves.
//  2. IDEMPOTENCY — Stripe delivers each event at-least-once. We claim each
//     event.id in Firestore before processing so a redelivery is acknowledged
//     without re-sending confirmation emails.
//  3. COVERAGE (A2) — the site has TWO payment flows. Stripe Checkout emits
//     checkout.session.completed ; Stripe Elements (create-payment-intent)
//     emits payment_intent.succeeded and NEVER a session event. Both are
//     handled. The PI handler only processes intents WE created directly
//     (metadata.source === 'pirates-tools') : the PaymentIntent under a
//     Checkout Session does not carry our metadata, so a card payment via
//     Checkout can never trigger a double email.
//  4. SERVER TRACE (A2) — every processed payment is journaled in the
//     Firestore `payments/{stripeId}` collection. Even if no client-side
//     order document ever appears (tab closed, Firestore client offline),
//     the money always leaves a server-side trace.
//  5. TAX CHECK (A1, détectif) — the charged tax territory comes from client
//     declaration. We compare it against the postal code of the real address
//     Stripe collected (shipping for Checkout, card billing for Elements) and
//     flag any mismatch in the payments journal + owner email so the order is
//     verified BEFORE shipping.

'use strict';

var getFirebase = require('./_lib/firebase').getFirebase;
var stripeMeta = require('./_lib/stripe-meta');
var postal = require('./_lib/postal');
var pricing = require('./_lib/pricing');
var catalog = require('./_lib/catalog');
var invoiceLib = require('./_lib/invoice');

// Identité vendeur (config/invoice) pour la facture ; défauts si absente.
async function loadSeller(fb) {
  var seller = Object.assign({}, invoiceLib.DEFAULT_SELLER);
  try {
    if (fb.db) {
      var doc = await fb.db.collection('config').doc('invoice').get();
      if (doc.exists) seller = Object.assign(seller, doc.data());
    }
  } catch (e) { /* défauts */ }
  return seller;
}

// Read the raw request body as a Buffer (parser is disabled — see config).
async function readRawBody(req) {
  var chunks = [];
  for await (var chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  var stripeKey = process.env.STRIPE_SECRET_KEY;
  var webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return res.status(503).json({ ok: false, error: 'Stripe webhook not configured' });
  }

  try {
    var stripe = require('stripe')(stripeKey);

    // ── 1) Verify signature against the RAW body ──
    var sig = req.headers['stripe-signature'];
    var rawBody = await readRawBody(req);
    var event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('[webhook] Signature verification failed:', err.message);
      return res.status(400).json({ ok: false, error: 'Invalid signature' });
    }

    // ── 2) Idempotency: claim the event.id before doing any side effects ──
    var fb = getFirebase();
    if (fb.db) {
      var eventRef = fb.db.collection('stripe_events').doc(event.id);
      try {
        // create() is atomic and fails if the doc already exists → duplicate.
        await eventRef.create({
          type: event.type,
          receivedAt: fb.admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (dupErr) {
        console.log('[webhook] Duplicate event ignored:', event.id);
        return res.status(200).json({ ok: true, received: true, duplicate: true });
      }
    } else {
      console.warn('[webhook] Firestore not configured — idempotency disabled for', event.id);
    }

    // ── 3) Process the event ──
    switch (event.type) {
      case 'checkout.session.completed':
        await handleSessionCompleted(stripe, fb, event.data.object);
        break;

      case 'payment_intent.succeeded':
        await handleIntentSucceeded(stripe, fb, event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handleIntentFailed(fb, event.data.object);
        break;

      case 'checkout.session.expired': {
        console.log('[webhook] Session expired:', event.data.object.id);
        break;
      }

      default:
        console.log('[webhook] Unhandled event type:', event.type);
    }

    return res.status(200).json({ ok: true, received: true });
  } catch (err) {
    console.error('[webhook] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'Webhook processing failed' });
  }
}

// Disable Vercel's automatic body parsing so we receive the raw bytes Stripe
// signed (required for constructEvent). CommonJS equivalent of
// `export const config = { api: { bodyParser: false } }`.
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };

// ════════════════════════════════════════════════════════════════
// Event handlers
// ════════════════════════════════════════════════════════════════

// ── Stripe Checkout (redirect) : checkout.session.completed ──
async function handleSessionCompleted(stripe, fb, sessionLite) {
  console.log('[webhook] Payment confirmed (session):', sessionLite.id, 'Amount:', sessionLite.amount_total);

  // Retrieve the full session with line items + customer details for email
  var fullSession = sessionLite;
  try {
    fullSession = await stripe.checkout.sessions.retrieve(sessionLite.id, {
      expand: ['line_items', 'line_items.data.price.product', 'customer_details']
    });
  } catch (retrieveErr) {
    console.error('[webhook] Could not retrieve session:', retrieveErr.message);
  }

  // A1 — contrôle fiscal détectif : adresse de LIVRAISON (collectée par
  // shipping_address_collection) prioritaire, sinon adresse de facturation.
  var declaredTerritory = (fullSession.metadata && fullSession.metadata.territory) || null;
  var shipAddr = (fullSession.shipping_details && fullSession.shipping_details.address)
    || (fullSession.customer_details && fullSession.customer_details.address) || null;
  var tax = taxCheck(declaredTerritory, shipAddr);

  var sessionUid = (fullSession.metadata && fullSession.metadata.uid) || null;

  // A2 — journal serveur : la trace existe même sans document client.
  await logPayment(fb, fullSession.id, {
    kind: 'checkout_session',
    status: 'succeeded',
    amountCents: fullSession.amount_total != null ? fullSession.amount_total : null,
    currency: (fullSession.currency || 'eur').toUpperCase(),
    customerEmail: (fullSession.customer_details && fullSession.customer_details.email) || fullSession.customer_email || null,
    paymentIntentId: typeof fullSession.payment_intent === 'string' ? fullSession.payment_intent : null,
    uid: sessionUid,
    territoryDeclared: declaredTerritory,
    territoryFromAddress: tax.expectedTerritory,
    postalCode: tax.postalCode,
    taxMismatch: tax.mismatch
  });

  // Mark the matching Firestore order as paid (idempotent update).
  // Le champ stripeSessionId est écrit par le client sur /merci (étape A5).
  await updateOrderWhere(fb, sessionUid, 'stripeSessionId', fullSession.id, {
    status: 'paid',
    stripePaymentIntent: typeof fullSession.payment_intent === 'string' ? fullSession.payment_intent : null
  });

  // Send confirmation emails via Resend (best-effort; never fail the hook)
  try {
    await sendOrderEmails(modelFromSession(fullSession, tax));
  } catch (mailErr) {
    console.error('[webhook] Email send failed:', mailErr.message);
  }
}

// ── Stripe Elements : payment_intent.succeeded ──
async function handleIntentSucceeded(stripe, fb, pi) {
  // Ne traiter QUE les PaymentIntents créés par create-payment-intent.js.
  // Le PI créé en interne par une Checkout Session ne porte pas notre metadata
  // → il est ignoré ici et traité via checkout.session.completed (pas de
  // double email, déterministe).
  if (!pi.metadata || pi.metadata.source !== 'pirates-tools') {
    console.log('[webhook] payment_intent.succeeded ignored (not ours):', pi.id);
    return;
  }
  console.log('[webhook] Payment confirmed (intent):', pi.id, 'Amount:', pi.amount);

  // Adresse de facturation de la carte (seule adresse disponible sur ce flux —
  // le formulaire embarqué ne collecte pas d'adresse de livraison).
  var charge = null;
  try {
    if (typeof pi.latest_charge === 'string') {
      charge = await stripe.charges.retrieve(pi.latest_charge);
    } else if (pi.latest_charge && typeof pi.latest_charge === 'object') {
      charge = pi.latest_charge;
    }
  } catch (chargeErr) {
    console.error('[webhook] Could not retrieve charge:', chargeErr.message);
  }
  var billing = (charge && charge.billing_details) || {};
  var declaredTerritory = pi.metadata.territory || null;
  // Adresse de LIVRAISON attachée au PI (formulaire adresse de la modale) en
  // priorité ; repli facturation carte (anciens paiements sans adresse).
  var piShipAddr = (pi.shipping && pi.shipping.address) || null;
  var tax = taxCheck(declaredTerritory, piShipAddr || billing.address || null);

  // Reconstruit les lignes depuis la metadata (source serveur : catalogue +
  // moteur de prix). Contrôle d'intégrité : la somme doit valoir pi.amount —
  // sinon (prix catalogue modifié entre-temps, metadata absente) on dégrade
  // sur une ligne unique au montant réellement débité, jamais un faux détail.
  var rebuilt = await rebuildLines(pi, declaredTerritory);

  var customerEmail = pi.receipt_email || billing.email || null;
  var piUid = pi.metadata.uid || null;

  // Commission Stripe RÉELLE (compta) : lue sur la balance transaction de la charge.
  var stripeFeeCents = null;
  try {
    var btId = charge && charge.balance_transaction;
    if (typeof btId === 'string') {
      var bt = await stripe.balanceTransactions.retrieve(btId);
      if (bt && typeof bt.fee === 'number') stripeFeeCents = bt.fee;
    } else if (btId && typeof btId === 'object' && typeof btId.fee === 'number') {
      stripeFeeCents = btId.fee;
    }
  } catch (feeErr) { console.error('[webhook] Stripe fee lookup failed:', feeErr.message); }

  // Facture : numéro séquentiel + snapshot des lignes et de l'identité client.
  var invoiceNumber = await assignInvoiceNumber(fb, Date.now());
  var custName = (pi.shipping && pi.shipping.name) || billing.name || '';
  var custAddr = formatAddr(piShipAddr || billing.address || null);

  await logPayment(fb, pi.id, {
    kind: 'payment_intent',
    status: 'succeeded',
    amountCents: pi.amount != null ? pi.amount : null,
    currency: (pi.currency || 'eur').toUpperCase(),
    customerEmail: customerEmail,
    customerName: custName,
    customerAddress: custAddr,
    paymentIntentId: pi.id,
    uid: piUid,
    territoryDeclared: declaredTerritory,
    territoryFromAddress: tax.expectedTerritory,
    postalCode: tax.postalCode,
    taxMismatch: tax.mismatch,
    linesRebuilt: rebuilt.ok,
    // Compta 100 % réel : coût d'achat snapshoté + commission Stripe réelle.
    cogsHtCents: (rebuilt.cogsHtCents != null ? rebuilt.cogsHtCents : null),
    stripeFeeCents: stripeFeeCents,
    // Facture : détail des lignes + numéro + date, pour générer la facture conforme.
    linesDetail: (rebuilt.lines || []).map(function (l) { return { name: l.name, qty: l.qty, unitCents: l.unitCents }; }),
    invoiceNumber: invoiceNumber,
    invoiceDateMs: Date.now()
  });

  // Le client écrit sa commande avec paymentIntentId sur /merci (A5). Selon la
  // course client/webhook le doc peut ne pas encore exister — le journal
  // payments/ ci-dessus reste la trace autoritaire dans tous les cas.
  await updateOrderWhere(fb, piUid, 'paymentIntentId', pi.id, {
    status: 'paid',
    confirmedByWebhook: true
  });

  try {
    // Facture jointe à l'email client : identité vendeur + n° + détail HT/TVA.
    var emailModel = modelFromIntent(pi, charge, rebuilt, tax, customerEmail);
    try {
      var seller = await loadSeller(fb);
      var inv = invoiceLib.buildInvoice({
        invoiceNumber: invoiceNumber, invoiceDateMs: Date.now(), amountCents: pi.amount,
        territoryDeclared: declaredTerritory, customerEmail: customerEmail, customerName: custName,
        customerAddress: custAddr, linesDetail: (rebuilt.lines || []).map(function (l) { return { name: l.name, qty: l.qty, unitCents: l.unitCents }; })
      }, seller);
      emailModel.invoice = { number: inv.number, seller: seller, totalHt: inv.totalHt, totalTva: inv.totalTva, franchise: inv.franchise, tvaRate: inv.tvaRate };
    } catch (invErr) { console.error('[webhook] email invoice build failed:', invErr.message); }
    await sendOrderEmails(emailModel);
  } catch (mailErr) {
    console.error('[webhook] Email send failed:', mailErr.message);
  }
}

// ── Stripe Elements : payment_intent.payment_failed ──
async function handleIntentFailed(fb, pi) {
  if (!pi.metadata || pi.metadata.source !== 'pirates-tools') return;
  var lastErr = (pi.last_payment_error && pi.last_payment_error.message) || null;
  console.log('[webhook] Payment failed (intent):', pi.id, lastErr || '');
  await logPayment(fb, pi.id, {
    kind: 'payment_intent',
    status: 'failed',
    amountCents: pi.amount != null ? pi.amount : null,
    currency: (pi.currency || 'eur').toUpperCase(),
    customerEmail: pi.receipt_email || null,
    paymentIntentId: pi.id,
    uid: (pi.metadata && pi.metadata.uid) || null,
    territoryDeclared: (pi.metadata && pi.metadata.territory) || null,
    failureMessage: lastErr
  });
}

// ════════════════════════════════════════════════════════════════
// Shared helpers
// ════════════════════════════════════════════════════════════════

// A1 — compare le territoire déclaré au territoire dérivé du code postal réel.
// mismatch === true SEULEMENT si on a un code postal exploitable ET qu'il
// contredit la déclaration (une adresse absente/hors-DOM donne expected=null :
// signalé comme « invérifiable », pas comme fraude).
function taxCheck(declaredTerritory, address) {
  var pc = postal.postalFromStripeAddress(address);
  var expected = pc ? postal.territoryFromPostal(pc) : null;
  return {
    postalCode: pc,
    expectedTerritory: expected,
    mismatch: !!(expected && declaredTerritory && expected !== declaredTerritory)
  };
}

// Numéro de facture séquentiel, sans trou (compteur transactionnel Firestore).
// Format Fyyyy-NNNN. Best-effort : jamais bloquant pour le paiement.
async function assignInvoiceNumber(fb, dateMs) {
  if (!fb.db) return null;
  try {
    var year = new Date(dateMs || Date.now()).getUTCFullYear();
    var ref = fb.db.collection('config').doc('invoiceCounter');
    var num = await fb.db.runTransaction(async function (t) {
      var snap = await t.get(ref);
      var data = snap.exists ? (snap.data() || {}) : {};
      var seq = (data['seq_' + year] || 0) + 1;
      var patch = {}; patch['seq_' + year] = seq;
      t.set(ref, patch, { merge: true });
      return seq;
    });
    return 'F' + year + '-' + ('0000' + num).slice(-4);
  } catch (e) {
    console.error('[webhook] invoice number failed:', e.message);
    return null;
  }
}

function formatAddr(a) {
  if (!a) return '';
  return [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country]
    .filter(Boolean).join(', ');
}

// A2 — journal Firestore payments/{stripeId}. Best-effort : ne jette jamais
// (un échec de journalisation ne doit pas faire re-livrer l'événement, les
// emails restant le signal principal).
async function logPayment(fb, stripeId, data) {
  if (!fb.db) return;
  try {
    await fb.db.collection('payments').doc(String(stripeId)).set(
      Object.assign({}, data, {
        recordedAt: fb.admin.firestore.FieldValue.serverTimestamp()
      }),
      { merge: true }
    );
    console.log('[webhook] Payment journaled:', stripeId, data.status, data.taxMismatch ? '⚠ TAX MISMATCH' : '');
  } catch (e) {
    console.error('[webhook] Payment journal failed:', e.message);
  }
}

// Met à jour la commande client correspondante.
// Chemin PRIVILÉGIÉ : users/{uid}/orders (uid depuis la metadata Stripe) —
// requête de collection simple couverte par les index AUTOMATIQUES Firestore,
// aucun index à créer. REPLI (uid absent — anciens paiements) : collectionGroup,
// qui exige un index collection-group sur le champ interrogé (défini dans
// firestore.indexes.json ; sans lui Firestore log FAILED_PRECONDITION avec
// l'URL de création en 1 clic).
async function updateOrderWhere(fb, uid, field, value, patch) {
  if (!fb.db || !value) return;
  try {
    var query = uid
      ? fb.db.collection('users').doc(uid).collection('orders').where(field, '==', value)
      : fb.db.collectionGroup('orders').where(field, '==', value);
    var snap = await query.limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update(Object.assign({}, patch, {
        paidAt: fb.admin.firestore.FieldValue.serverTimestamp()
      }));
      console.log('[webhook] Order updated via', (uid ? 'users/' + uid + '/orders.' : 'collectionGroup.') + field, ':', snap.docs[0].id);
    } else {
      console.log('[webhook] No order matches', field, '=', value, uid ? '(uid ' + uid + ')' : '(sans uid)', '— client doc absent ou pas encore écrit');
    }
  } catch (fbErr) {
    console.error('[webhook] Firestore order update failed (' + field + '):', fbErr.message);
  }
}

// Reconstruit les lignes {name, qty, unitCents, subCents} d'un PaymentIntent
// depuis metadata items_* + catalogue + moteur de prix. { ok, lines }
async function rebuildLines(pi, territory) {
  var fallback = {
    ok: false,
    lines: [{
      name: (pi.description || 'Commande Pirates Tools').substring(0, 200),
      qty: 1,
      unitCents: pi.amount != null ? pi.amount : null,
      subCents: pi.amount != null ? pi.amount : null
    }]
  };
  var metaItems = stripeMeta.readItems(pi.metadata);
  if (!metaItems || !metaItems.length) return fallback;
  try {
    var products = await catalog.loadCatalog();
    var lines = [];
    var sum = 0;
    var cogsHtCents = 0;   // coût d'achat RÉEL des marchandises vendues (compta)
    for (var i = 0; i < metaItems.length; i++) {
      var product = catalog.findByKey(products, metaItems[i].k);
      if (!product) return fallback;
      var qty = parseInt(metaItems[i].q, 10) || 1;
      var unit = pricing.unitCents(product, territory || pricing.DEFAULT_TERRITORY);
      sum += unit * qty;
      cogsHtCents += Math.round(productCostHt(product) * 100) * qty;
      lines.push({ name: product.title || 'Produit', qty: qty, unitCents: unit, subCents: unit * qty });
    }
    // Remise fidélité serveur (create-payment-intent) : pi.amount = brut −
    // remise. On la matérialise en ligne négative pour que le détail somme
    // exactement au montant débité.
    var discountCents = parseInt((pi.metadata && pi.metadata.loyaltyDiscountCents) || '0', 10);
    if (isFinite(discountCents) && discountCents > 0) {
      var pct = (pi.metadata && pi.metadata.loyaltyPct) || '';
      lines.push({
        name: 'Remise fidélité' + (pct ? ' −' + pct + ' %' : ''),
        qty: 1,
        unitCents: -discountCents,
        subCents: -discountCents
      });
      sum -= discountCents;
    }
    // Intégrité : le détail reconstruit doit valoir exactement le montant
    // débité. Un prix catalogue modifié entre paiement et webhook → dégradation
    // (jamais un email dont le détail ne somme pas au total).
    if (pi.amount != null && sum !== pi.amount) {
      console.warn('[webhook] Rebuilt lines drift:', sum, '≠', pi.amount, '— fallback single line');
      return fallback;
    }
    return { ok: true, lines: lines, cogsHtCents: cogsHtCents };
  } catch (e) {
    console.error('[webhook] rebuildLines failed:', e.message);
    return fallback;
  }
}

// Coût d'achat HT RÉEL d'un produit (compta). Priorité au coût fournisseur
// enregistré par le traqueur (priceSrcTTC ÷ 1,20). Sinon on remonte depuis le
// prix de vente HT et le markup appliqué (priceMarkup), ou à défaut ×1,15.
function productCostHt(product) {
  if (product && typeof product.priceSrcTTC === 'number' && product.priceSrcTTC > 0) {
    return product.priceSrcTTC / 1.20;
  }
  var ph = (product && typeof product.price_ht === 'number') ? product.price_ht : 0;
  if (product && typeof product.priceMarkup === 'number' && product.priceMarkup > 0) {
    return ph / (1 + product.priceMarkup);
  }
  return ph > 0 ? ph / 1.15 : 0;
}

// ── Normalisation : les deux flux produisent le même modèle d'email ──

function modelFromSession(session, tax) {
  var currency = (session.currency || 'eur').toUpperCase();
  var lineItems = (session.line_items && session.line_items.data) || [];
  return {
    orderRef: (session.id || '').slice(-8).toUpperCase(),
    totalCents: session.amount_total != null ? session.amount_total : null,
    currency: currency,
    customerEmail: (session.customer_details && session.customer_details.email) || session.customer_email || '',
    customerName: (session.customer_details && session.customer_details.name) || '',
    lines: lineItems.map(function (li) {
      return {
        name: (li.description) || (li.price && li.price.product && li.price.product.name) || 'Produit',
        qty: li.quantity || 1,
        unitCents: li.price ? li.price.unit_amount : null,
        subCents: li.amount_total != null ? li.amount_total : null
      };
    }),
    ownerWarnings: buildTaxWarnings(tax, session.metadata && session.metadata.territory)
  };
}

function modelFromIntent(pi, charge, rebuilt, tax, customerEmail) {
  var billing = (charge && charge.billing_details) || {};
  return {
    orderRef: (pi.id || '').slice(-8).toUpperCase(),
    totalCents: pi.amount != null ? pi.amount : null,
    currency: (pi.currency || 'eur').toUpperCase(),
    customerEmail: customerEmail || '',
    customerName: billing.name || '',
    lines: rebuilt.lines,
    ownerWarnings: buildTaxWarnings(tax, pi.metadata && pi.metadata.territory)
      .concat(rebuilt.ok ? [] : ['Détail des lignes indisponible — le total débité fait foi.'])
  };
}

// Messages d'alerte destinés à l'email OWNER uniquement (texte brut, échappé
// à l'insertion).
function buildTaxWarnings(tax, declaredTerritory) {
  if (!tax) return [];
  var declared = pricing.getTerritory(declaredTerritory || '');
  var declaredLabel = declared ? (declared.name + ' (' + declared.code + ')') : String(declaredTerritory || 'inconnu');
  if (tax.mismatch) {
    var real = pricing.getTerritory(tax.expectedTerritory);
    return ['TAXE À VÉRIFIER AVANT EXPÉDITION : territoire facturé ' + declaredLabel
      + ' mais adresse réelle en ' + (real ? real.name + ' (' + real.code + ')' : tax.expectedTerritory)
      + ' — code postal ' + tax.postalCode + '. Le montant encaissé peut être erroné (octroi/TVA).'];
  }
  if (!tax.postalCode) {
    return ['Adresse sans code postal exploitable — territoire fiscal ' + declaredLabel + ' non vérifié.'];
  }
  if (!tax.expectedTerritory) {
    return ['Code postal ' + tax.postalCode + ' hors DOM desservis — territoire fiscal ' + declaredLabel + ' non vérifié.'];
  }
  return [];
}

// ── Resend transactional email (HTTP, no SDK) ──────────────────
async function sendOrderEmails(model) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Pirates Tools <onboarding@resend.dev>';
  const ownerEmail = process.env.OWNER_EMAIL || '';

  if (!apiKey) {
    console.log('[webhook] RESEND_API_KEY not set — skipping email');
    return;
  }

  const currency = model.currency || 'EUR';
  const totalStr = formatAmount(model.totalCents, currency);

  const itemsHtml = (model.lines || []).map(function (li) {
    const unit = li.unitCents != null ? formatAmount(li.unitCents, currency) : '—';
    const sub = li.subCents != null ? formatAmount(li.subCents, currency) : '—';
    return '<tr>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee">' + escape(li.name) + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">' + (li.qty || 1) + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">' + unit + '</td>'
      + '<td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">' + sub + '</td>'
      + '</tr>';
  }).join('');

  const orderRef = model.orderRef || '';

  const warningsHtml = (model.ownerWarnings || []).map(function (w) {
    return '<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);border-radius:10px;padding:12px 14px;margin:0 0 14px">'
      + '<p style="margin:0;color:#fca5a5;font-size:13px;font-weight:700">⚠ ' + escape(w) + '</p>'
      + '</div>';
  }).join('');

  // Bloc facture (identité vendeur + n° + HT/TVA + mentions) pour l'email client.
  const invData = model.invoice;
  const invoiceBlock = invData ? (function () {
    const s = invData.seller || {};
    return '<div style="margin-top:20px;padding:16px;background:#0a0f14;border:1px solid rgba(139,92,246,.25);border-radius:12px;font-size:12px;color:#9aa4b2">'
      + '<p style="margin:0 0 6px;color:#fff;font-weight:700">Facture n° ' + escape(invData.number) + '</p>'
      + '<p style="margin:0">Total HT : ' + formatAmount(Math.round(invData.totalHt * 100), currency)
      + (invData.franchise ? '' : ' &middot; TVA (' + (Math.round(invData.tvaRate * 1000) / 10) + ' %) : ' + formatAmount(Math.round(invData.totalTva * 100), currency))
      + ' &middot; Total TTC : ' + totalStr + '</p>'
      + (invData.franchise ? '<p style="margin:6px 0 0">TVA non applicable, art. 293 B du CGI.</p>' : '')
      + '<p style="margin:8px 0 0;font-size:11px">' + escape(s.raisonSociale || '') + (s.siret ? ' &middot; SIRET ' + escape(s.siret) : '') + (s.adresse ? ' &middot; ' + escape(s.adresse) : '') + '</p>'
      + '<p style="margin:4px 0 0;font-size:11px">Garantie légale de conformité (2 ans) et garantie des vices cachés. Droit de rétractation : 14 jours (voir CGV).</p>'
      + '</div>';
  })() : '';

  const baseHtml = function (title, intro, includeWarnings) {
    return '<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#0a0f14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf5">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f14;padding:32px 0">'
      + '<tr><td align="center">'
      + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#0f1720;border:1px solid rgba(139,92,246,.3);border-radius:16px;overflow:hidden;max-width:600px">'
      + '<tr><td style="background:linear-gradient(135deg,#8B5CF6,#6d28d9);padding:28px 32px;text-align:center">'
      + '<h1 style="margin:0;font-size:24px;color:#fff;letter-spacing:.5px">PIRATES TOOLS</h1>'
      + '<p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">Outillage professionnel</p>'
      + '</td></tr>'
      + '<tr><td style="padding:32px">'
      + (includeWarnings ? warningsHtml : '')
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
      + invoiceBlock
      + '<p style="margin:24px 0 0;color:#9aa4b2;font-size:13px;line-height:1.6">'
      + 'Besoin d\'aide ? Écris-nous sur WhatsApp : <a href="https://wa.me/33744776598" style="color:#8B5CF6;text-decoration:none">07 44 77 65 98</a>'
      + '</p>'
      + '</td></tr>'
      + '<tr><td style="background:#0a0f14;padding:16px 32px;text-align:center;border-top:1px solid rgba(255,255,255,.06)">'
      + '<p style="margin:0;color:#6b7280;font-size:11px">© Pirates Tools — Antilles françaises</p>'
      + '</td></tr>'
      + '</table></td></tr></table></body></html>';
  };

  // Customer confirmation email (jamais les warnings — usage interne)
  if (model.customerEmail) {
    const intro = 'Bonjour' + (model.customerName ? ' ' + escape(model.customerName) : '') + ', nous avons bien reçu votre paiement. Votre commande est en cours de préparation — vous serez contacté·e sous peu pour la livraison.';
    await resendSend(apiKey, {
      from: from,
      to: model.customerEmail,
      subject: 'Confirmation de commande #' + orderRef + ' — Pirates Tools',
      html: baseHtml('Merci pour votre commande !', intro, false)
    });
    // Pas de PII en clair dans les logs (RGPD/minimisation) : on journalise la
    // référence de commande, jamais l'email du client.
    console.log('[webhook] Customer email sent (order ' + orderRef + ')');
  }

  // Owner notification email (avec les alertes taxe/intégrité)
  if (ownerEmail) {
    const intro = 'Nouvelle commande payée sur le site. '
      + (model.customerEmail ? 'Client : <strong>' + escape(model.customerEmail) + '</strong>' + (model.customerName ? ' (' + escape(model.customerName) + ')' : '') + '.' : 'Email client non fourni.');
    await resendSend(apiKey, {
      from: from,
      to: ownerEmail,
      subject: ((model.ownerWarnings && model.ownerWarnings.length) ? '⚠ ' : '')
        + '[Pirates Tools] Commande payée #' + orderRef + ' — ' + totalStr,
      html: baseHtml('Nouvelle commande reçue', intro, true),
      reply_to: model.customerEmail || undefined
    });
    console.log('[webhook] Owner email sent (order ' + orderRef + ')');
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

// Exports internes pour les tests (non utilisés par Vercel).
module.exports._internals = {
  taxCheck: taxCheck,
  buildTaxWarnings: buildTaxWarnings,
  rebuildLines: rebuildLines,
  modelFromSession: modelFromSession,
  modelFromIntent: modelFromIntent,
  updateOrderWhere: updateOrderWhere
};
