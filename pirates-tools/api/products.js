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
      /* ⛔ L'ÉTAT DES PRIX SORT AVEC LE CATALOGUE. Quand Firestore ne répond
         plus, la fusion retombe sur `products.json`, mesuré jusqu'à 70 % en
         dessous du vrai prix (voir _lib/catalog.js). Le client doit pouvoir le
         SAVOIR au lieu de peindre un prix faux comme s'il était frais — et
         surtout ne pas le ranger dans son cache local à la place du bon. */
      var etatCat = await catalog.loadPublicCatalogEtat();
      var merged = etatCat.produits;

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
        /* ⛔ FAUX veut dire : ces prix viennent du fichier statique, pas des
           overrides. Le client ne doit ni les mettre en cache à la place des
           bons, ni laisser croire qu'ils sont à jour. */
        prixConfirmes: etatCat.prixConfirmes,
        products: filtered
      });
    } catch (err) {
      console.error('[api/products] Error:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to load products' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
