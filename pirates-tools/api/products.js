// GET /api/products — Returns the product catalogue.
// If FIREBASE_SERVICE_ACCOUNT is set, merges Firestore admin overrides
// on top of the static products.json base.

const fs = require('fs');
const path = require('path');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

let _overridesCache = null;
let _overridesCacheTime = 0;
const OVERRIDES_TTL = 30_000; // 30 seconds (shorter so admin edits appear fast)

function loadProducts() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  const file = path.join(__dirname, '..', 'products.json');
  const raw = fs.readFileSync(file, 'utf8');
  let data = JSON.parse(raw);
  if (data && data.products) data = data.products;
  _cache = Array.isArray(data) ? data : [];
  _cacheTime = now;
  return _cache;
}

async function loadOverrides() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) return {};

  const now = Date.now();
  if (_overridesCache && now - _overridesCacheTime < OVERRIDES_TTL) {
    return _overridesCache;
  }

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount))
      });
    }
    const db = admin.firestore();
    const snap = await db.collection('product_overrides').get();
    const map = {};
    snap.forEach((doc) => {
      const data = doc.data();
      // Strip Firestore internals
      delete data.updatedAt;
      map[doc.id] = data;
    });
    _overridesCache = map;
    _overridesCacheTime = now;
    return map;
  } catch (err) {
    console.error('[api/products] Overrides load failed:', err.message);
    return _overridesCache || {};
  }
}

function applyOverrides(products, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return products;
  return products
    .map((p) => {
      const patch = overrides[p.id] || overrides[p.slug] || null;
      if (!patch) return p;
      return Object.assign({}, p, patch);
    })
    .filter((p) => !p.hidden); // admin can hide products by setting hidden:true
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    try {
      const products = loadProducts();
      const overrides = await loadOverrides();
      const merged = applyOverrides(products, overrides);

      const { brand, category, q } = req.query || {};

      let filtered = merged;
      if (brand) {
        filtered = filtered.filter(p =>
          (p.brand || '').toLowerCase() === brand.toLowerCase()
        );
      }
      if (category) {
        filtered = filtered.filter(p =>
          (p.category || '').toLowerCase() === category.toLowerCase()
        );
      }
      if (q) {
        const term = q.toLowerCase();
        filtered = filtered.filter(p =>
          (p.title || '').toLowerCase().includes(term) ||
          (p.brand || '').toLowerCase().includes(term) ||
          (p.desc || '').toLowerCase().includes(term)
        );
      }

      return res.status(200).json({
        ok: true,
        count: filtered.length,
        products: filtered
      });
    } catch (err) {
      console.error('[api/products] Error:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to load products' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
