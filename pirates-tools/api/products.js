// GET /api/products — Returns the product catalogue.
// Merges Firestore admin overrides on top of the static products.json base
// (via the shared _lib/catalog module, which is the single server-side source
// of truth also used by the payment endpoints).

'use strict';

var catalog = require('./_lib/catalog');

/* ── SEO ordre 9 : catalogue ALLÉGÉ pour la grille (CODE-003) ──────────────
   Les 3 champs de DÉTAIL (mesurés : specs 129 Ko + description_long 89 Ko +
   features 60 Ko = 278 Ko sur 1708 fiches) ne servent QUE la fiche produit
   (renderPDP) et l'édition admin. La grille, la recherche, le panier et le
   prix ne les lisent jamais. On les retire de la LISTE : le boot télécharge
   moins ; la fiche récupère son détail à la demande via `?id=<slug>`.
   ⚠️ `desc` (phrase courte) RESTE : la recherche serveur et les cartes s'en
   servent. Le plafond de 12 fonctions Vercel interdit un endpoint dédié :
   le détail par fiche passe donc par CE point d'entrée, paramètre `id`. */
var CHAMPS_DETAIL = ['specs', 'description_long', 'features'];
// Lot poids (levier 2) : champs que le visiteur ne lit jamais (mesuré absents
// de app.visitor.js) — retirés de la LISTE, conservés sur la fiche ?id (admin).
// Aligné avec scripts/generer-catalogue-leger.js (porte : whitelist visiteur).
var CHAMPS_MORTS_VISITEUR = ['ficheAcompleter', 'productType', 'poidsSuppose',
  'sourceDescriptif', 'srcAltSkus', 'priceLocked'];
var TOUS_RETIRES = CHAMPS_DETAIL.concat(CHAMPS_MORTS_VISITEUR);
function alleger(p) {
  var clean = Object.assign({}, p);
  for (var i = 0; i < TOUS_RETIRES.length; i++) delete clean[TOUS_RETIRES[i]];
  clean._light = 1;   // marqueur : le client sait qu'il doit chercher le détail
  return clean;
}

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
      var id = one(query.id);

      /* ── FICHE À LA DEMANDE : ?id=<slug|id|sku> → UNE fiche COMPLÈTE ────────
         (avec les champs de détail). Sert renderPDP et l'édition admin, qui
         récupèrent le détail que la liste allégée ne porte plus. */
      if (id) {
        var fiche = catalog.findByKey(merged, id);
        if (!fiche) return res.status(404).json({ ok: false, error: 'Produit introuvable' });
        return res.status(200).json({ ok: true, prixConfirmes: etatCat.prixConfirmes, product: fiche });
      }

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
        // Liste ALLÉGÉE (SEO ordre 9) : détail retiré, récupéré à la demande.
        products: filtered.map(alleger)
      });
    } catch (err) {
      console.error('[api/products] Error:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to load products' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
