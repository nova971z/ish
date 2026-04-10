// GET  /api/orders?uid=xxx     — List orders for a user
// POST /api/orders             — Create a new order
// Backed by Firebase Admin SDK (requires FIREBASE_SERVICE_ACCOUNT env var)

let _admin = null;
let _db = null;

function initFirebase() {
  if (_admin) return;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
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
  if (req.method === 'OPTIONS') return res.status(204).end();

  initFirebase();
  if (!_db) {
    return res.status(503).json({
      ok: false,
      error: 'Firebase Admin not configured. Add FIREBASE_SERVICE_ACCOUNT in Vercel environment variables.'
    });
  }

  // ── GET: list orders for a user ──
  if (req.method === 'GET') {
    const { uid } = req.query || {};
    if (!uid) return res.status(400).json({ ok: false, error: 'Missing uid parameter' });

    try {
      const snap = await _db
        .collection('users').doc(uid)
        .collection('orders')
        .orderBy('date', 'desc')
        .limit(50)
        .get();

      const orders = [];
      snap.forEach(doc => {
        const d = doc.data();
        orders.push({
          id: doc.id,
          items: d.items || d.itemCount || 0,
          total: d.total || 0,
          status: d.status || 'pending',
          date: d.date ? d.date.toMillis() : null
        });
      });

      return res.status(200).json({ ok: true, orders });
    } catch (err) {
      console.error('[api/orders] GET error:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to fetch orders' });
    }
  }

  // ── POST: create a new order ──
  if (req.method === 'POST') {
    const { uid, items, total, paymentMethod, sessionId } = req.body || {};
    if (!uid || !items || !total) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: uid, items, total' });
    }

    try {
      const orderRef = await _db
        .collection('users').doc(uid)
        .collection('orders')
        .add({
          items: items,
          total: Number(total),
          itemCount: Array.isArray(items) ? items.length : 0,
          paymentMethod: paymentMethod || 'card',
          stripeSessionId: sessionId || null,
          status: 'confirmed',
          date: _admin.firestore.FieldValue.serverTimestamp()
        });

      return res.status(201).json({
        ok: true,
        orderId: orderRef.id
      });
    } catch (err) {
      console.error('[api/orders] POST error:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to create order' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
