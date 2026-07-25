// GET /api/products — Returns the product catalogue.
// Merges Firestore admin overrides on top of the static products.json base
// (via the shared _lib/catalog module, which is the single server-side source
// of truth also used by the payment endpoints).

'use strict';

var catalog = require('./_lib/catalog');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    try {
      // Catalogue PUBLIC : champs internes (coût fournisseur, marge du traqueur)
      // retirés — voir PRIVATE_FIELDS dans _lib/catalog.js.
      var merged = await catalog.loadPublicCatalog();

      // Un paramètre répété (?brand=a&brand=b) arrive en Array → on ne garde
      // que la première valeur au lieu de planter sur .toLowerCase().
      var query = req.query || {};
      var one = function (v) { return Array.isArray(v) ? String(v[0] || '') : (v ? String(v) : ''); };
      var brand = one(query.brand);
      var category = one(query.category);
      var q = one(query.q);

      var filtered = merged;
      if (brand) {
        filtered = filtered.filter(function (p) {
          return (p.brand || '').toLowerCase() === brand.toLowerCase();
        });
      }
      if (category) {
        filtered = filtered.filter(function (p) {
          return (p.category || '').toLowerCase() === category.toLowerCase();
        });
      }
      if (q) {
        var term = q.toLowerCase();
        filtered = filtered.filter(function (p) {
          return (p.title || '').toLowerCase().indexOf(term) !== -1 ||
                 (p.brand || '').toLowerCase().indexOf(term) !== -1 ||
                 (p.desc || '').toLowerCase().indexOf(term) !== -1;
        });
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
