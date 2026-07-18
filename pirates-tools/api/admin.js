// POST /api/admin — Admin CRUD for product overrides.
// Auth : header "x-admin-secret" must match env ADMIN_SECRET.
// Storage : Firestore collection `product_overrides/{id}`.
// Without Firebase configured, returns 503 with a helpful message.

const auth = require('./_lib/auth');
const http = require('./_lib/http');
const firebase = require('./_lib/firebase');
const analytics = require('./_lib/analytics');

module.exports = async function handler(req, res) {
  http.applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── Auth (constant-time admin secret) ─────────────────────
  const denied = await auth.requireAdmin(req);
  if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });

  // ── Firestore (shared initializer) ────────────────────────
  const { admin, db } = firebase.getFirebase();
  if (!db) {
    return res.status(503).json({
      ok: false,
      error: 'Firestore not configured. Set FIREBASE_SERVICE_ACCOUNT env var.'
    });
  }

  // ── GET : list overrides OR recent orders ────────────────
  if (req.method === 'GET') {
    const type = (req.query && req.query.type) || 'overrides';
    try {
      if (type === 'orders') {
        // Read last 50 orders from collectionGroup('orders')
        const ordersSnap = await db.collectionGroup('orders')
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();
        const orders = [];
        ordersSnap.forEach((doc) => {
          const d = doc.data();
          orders.push({
            id: doc.id,
            status: d.status || 'pending',
            customerEmail: d.customerEmail || d.email || '',
            total: typeof d.total === 'number' ? d.total : (typeof d.amount === 'number' ? d.amount : null),
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt || null),
            stripeSessionId: d.stripeSessionId || ''
          });
        });
        return res.status(200).json({ ok: true, orders: orders });
      }

      // ── Statistiques (dashboard analytics maison) ──────────────
      if (type === 'stats') {
        // Lecture simple sans tri : Firestore N'AUTORISE PAS orderBy(documentId,
        // 'desc') (« does not support descending key scans ») → ça faisait
        // planter la requête, et le dashboard affichait 0 alors que les données
        // existaient. summarize() somme et trie côté serveur ; toutes ces
        // collections sont naturellement bornées (analytics_daily = 1 doc/jour,
        // purgé > 14 mois ; le reste 1 doc/produit, /cible, /pays).
        const readAll = async (coll) => {
          const s = await db.collection(coll).get();
          const out = [];
          s.forEach((d) => out.push(Object.assign({ id: d.id }, d.data())));
          return out;
        };
        const daily = await readAll('analytics_daily');
        const products = await readAll('analytics_products');
        const clicks = await readAll('analytics_clicks');
        const geo = await readAll('analytics_geo');
        return res.status(200).json({ ok: true, stats: analytics.summarize(daily, products, clicks, geo) });
      }

      // ── Cartes client (comptes créés) ──────────────────────────
      if (type === 'clients') {
        const usersSnap = await db.collection('users').limit(200).get();
        const clients = [];
        for (const u of usersSnap.docs) {
          const d = u.data() || {};
          let orderCount = 0;
          try {
            const agg = await db.collection('users/' + u.id + '/orders').count().get();
            orderCount = agg.data().count;
          } catch (_) { orderCount = 0; }
          clients.push({
            uid: u.id,
            name: d.name || '',
            email: d.email || '',
            phone: d.phone || '',
            address: d.address || '',
            avatar: d.avatar || '',
            loyalty: (d.loyalty && typeof d.loyalty === 'object') ? d.loyalty : null,
            orderCount: orderCount,
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt || null)
          });
        }
        clients.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return res.status(200).json({ ok: true, clients: clients, total: clients.length });
      }

      // Default: list all overrides
      const snap = await db.collection('product_overrides').get();
      const overrides = {};
      snap.forEach((doc) => { overrides[doc.id] = doc.data(); });
      return res.status(200).json({ ok: true, overrides: overrides });
    } catch (err) {
      console.error('[api/admin] GET failed:', err.message);
      // collectionGroup index errors: return an empty list instead of 500
      if (String(err.message).indexOf('index') !== -1) {
        return res.status(200).json({ ok: true, orders: [], hint: 'Firestore index required — check console' });
      }
      return res.status(500).json({ ok: false, error: 'Failed to load' });
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
