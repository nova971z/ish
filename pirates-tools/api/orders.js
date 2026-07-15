// GET  /api/orders?uid=xxx  — List a user's orders (ADMIN ONLY)
// POST /api/orders          — Create an order (ADMIN ONLY)
//
// AUTH: requires the admin secret (header "x-admin-secret"). This endpoint uses
// the Firebase Admin SDK, which bypasses Firestore security rules, so it must
// never be exposed to end users. The customer-facing app does NOT use it — it
// reads/writes its own orders through the Firebase *client* SDK under per-user
// Firestore rules. This endpoint is an admin/support tool only.

'use strict';

var auth = require('./_lib/auth');
var http = require('./_lib/http');

var _admin = null;
var _db = null;

function initFirebase() {
  if (_admin) return;
  var serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) return;
  _admin = require('firebase-admin');
  if (!_admin.apps.length) {
    _admin.initializeApp({
      credential: _admin.credential.cert(JSON.parse(serviceAccount))
    });
  }
  _db = _admin.firestore();
}

module.exports = async function handler(req, res) {
  http.applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── Auth (admin only) ──
  var denied = auth.requireAdmin(req);
  if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });

  initFirebase();
  if (!_db) {
    return res.status(503).json({
      ok: false,
      error: 'Firebase Admin not configured. Add FIREBASE_SERVICE_ACCOUNT in Vercel environment variables.'
    });
  }

  // ── GET: list orders for a user ──
  if (req.method === 'GET') {
    var uid = (req.query && req.query.uid) || '';
    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing uid parameter' });
    }

    try {
      var snap = await _db
        .collection('users').doc(uid)
        .collection('orders')
        .orderBy('date', 'desc')
        .limit(50)
        .get();

      var orders = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        orders.push({
          id: doc.id,
          items: d.items || d.itemCount || 0,
          total: typeof d.total === 'number' ? d.total : 0,
          status: d.status || 'pending',
          date: d.date && d.date.toMillis ? d.date.toMillis() : null
        });
      });

      return res.status(200).json({ ok: true, orders: orders });
    } catch (err) {
      console.error('[api/orders] GET error:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to fetch orders' });
    }
  }

  // ── POST: create a new order ──
  if (req.method === 'POST') {
    var body = req.body || {};
    var uid = body.uid;
    var items = body.items;
    var total = Number(body.total);

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing or invalid uid' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid items' });
    }
    if (!isFinite(total) || total < 0) {
      return res.status(400).json({ ok: false, error: 'Missing or invalid total' });
    }

    try {
      var orderRef = await _db
        .collection('users').doc(uid)
        .collection('orders')
        .add({
          items: items,
          total: total,
          itemCount: items.length,
          paymentMethod: body.paymentMethod || 'card',
          stripeSessionId: body.sessionId || null,
          status: 'confirmed',
          date: _admin.firestore.FieldValue.serverTimestamp()
        });

      return res.status(201).json({ ok: true, orderId: orderRef.id });
    } catch (err) {
      console.error('[api/orders] POST error:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to create order' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
