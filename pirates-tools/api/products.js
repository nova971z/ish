// GET /api/products — Returns the product catalogue
// POST /api/products (admin) — future: CRUD operations

const fs = require('fs');
const path = require('path');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

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

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    try {
      const products = loadProducts();
      const { brand, category, q } = req.query || {};

      let filtered = products;
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
