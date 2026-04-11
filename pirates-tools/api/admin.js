// POST /api/admin — Admin CRUD for product overrides.
// Auth : header "x-admin-secret" must match env ADMIN_SECRET.
// Storage : Firestore collection `product_overrides/{id}`.
// Without Firebase configured, returns 503 with a helpful message.

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── Auth ──────────────────────────────────────────────────
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: 'Admin not configured. Set ADMIN_SECRET env var on Vercel.'
    });
  }
  const provided = req.headers['x-admin-secret'] || '';
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: 'Invalid admin secret' });
  }

  // ── Firestore ─────────────────────────────────────────────
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    return res.status(503).json({
      ok: false,
      error: 'Firestore not configured. Set FIREBASE_SERVICE_ACCOUNT env var.'
    });
  }

  let admin, db;
  try {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount))
      });
    }
    db = admin.firestore();
  } catch (err) {
    console.error('[api/admin] Firebase init failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Firestore init failed' });
  }

  // ── GET : list all overrides ──────────────────────────────
  if (req.method === 'GET') {
    try {
      const snap = await db.collection('product_overrides').get();
      const overrides = {};
      snap.forEach((doc) => { overrides[doc.id] = doc.data(); });
      return res.status(200).json({ ok: true, overrides: overrides });
    } catch (err) {
      console.error('[api/admin] GET failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to load overrides' });
    }
  }

  // ── POST : update or create an override ───────────────────
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const productId = String(body.id || '').trim();
      if (!productId) {
        return res.status(400).json({ ok: false, error: 'Missing product id' });
      }

      // Allowed fields — block arbitrary writes
      const allowed = [
        'stock_status', 'stock_label',
        'price', 'price_ht', 'vat', 'currency',
        'title', 'desc', 'description',
        'tag', 'paymentLink',
        'hidden'
      ];
      const patch = {};
      allowed.forEach((k) => {
        if (body[k] !== undefined) patch[k] = body[k];
      });

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: 'No valid fields to update' });
      }

      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('product_overrides').doc(productId).set(patch, { merge: true });

      console.log('[api/admin] Updated override for', productId, Object.keys(patch).join(','));
      return res.status(200).json({ ok: true, id: productId, patch: patch });
    } catch (err) {
      console.error('[api/admin] POST failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Update failed' });
    }
  }

  // ── DELETE : remove an override ───────────────────────────
  if (req.method === 'DELETE') {
    try {
      const id = (req.query && req.query.id) || (req.body && req.body.id) || '';
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });
      await db.collection('product_overrides').doc(String(id)).delete();
      return res.status(200).json({ ok: true, id: String(id) });
    } catch (err) {
      console.error('[api/admin] DELETE failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Delete failed' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
