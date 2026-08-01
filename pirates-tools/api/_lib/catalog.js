// api/_lib/catalog.js — Single server-side source of truth for the catalogue.
//
// Loads products.json and merges Firestore admin overrides on top (price, stock,
// hidden…). Hidden products are filtered out, so they are neither listed nor
// purchasable. Used by /api/products (listing) and by the payment endpoints
// (server-authoritative pricing) so both resolve the exact same product data.

'use strict';

var fs = require('fs');
var path = require('path');

var _cache = null;
var _cacheTime = 0;
var CACHE_TTL = 60000; // 1 minute

var _overridesCache = null;
var _overridesCacheTime = 0;
var OVERRIDES_TTL = 30000; // 30 s — admin edits appear fast

function loadProducts() {
  var now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  var file = path.join(__dirname, '..', '..', 'products.json');
  var raw = fs.readFileSync(file, 'utf8');
  var data = JSON.parse(raw);
  if (data && data.products) data = data.products;
  _cache = Array.isArray(data) ? data : [];
  _cacheTime = now;
  return _cache;
}

async function loadOverrides() {
  var serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) return {};

  var now = Date.now();
  if (_overridesCache && now - _overridesCacheTime < OVERRIDES_TTL) {
    return _overridesCache;
  }

  try {
    var db = require('./firebase').getFirebase().db;
    if (!db) return _overridesCache || {};
    var snap = await db.collection('product_overrides').get();
    var map = {};
    snap.forEach(function (doc) {
      var data = doc.data();
      delete data.updatedAt; // strip Firestore internals
      map[doc.id] = data;
    });
    _overridesCache = map;
    _overridesCacheTime = now;
    return map;
  } catch (err) {
    console.error('[catalog] Overrides load failed:', err.message);
    return _overridesCache || {};
  }
}

function applyOverrides(products, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return products;
  return products
    .map(function (p) {
      var patch = overrides[p.id] || overrides[p.slug] || null;
      if (!patch) return p;
      var fusion = Object.assign({}, p, patch);
      /* ── L'ÉTIQUETTE « EN PROMO » EXPIRE À LA LECTURE ────────────────────
         Demande de l'user : au bout de deux mois au même prix, ce n'est plus
         une promotion, c'est le nouveau prix — on retire la mention.

         ⛔ Calculé ICI, à chaque lecture, et JAMAIS par une tâche planifiée.
         Une promo dont l'expiration dépend d'un cron reste affichée le jour où
         le cron ne tourne pas — et annoncer une réduction qui n'en est plus
         une est une pratique commerciale trompeuse (J4), pas un détail
         d'affichage. Ici, l'oubli est impossible : il n'y a rien à oublier.

         ⚠️ `promoAncienPrix` n'est PAS le prix de la veille : c'est le prix le
         plus bas pratiqué sur les 30 jours précédents, calculé à l'écriture
         (voir api/admin.js). C'est ce que J4 exige comme référence. */
      var DEUX_MOIS = 60 * 24 * 3600 * 1000;
      var debut = Number(fusion.promoDepuis || 0);
      fusion.promoActive = !!(debut > 0
        && (Date.now() - debut) < DEUX_MOIS
        && Number(fusion.promoAncienPrix) > Number(fusion.price));
      if (!fusion.promoActive) { fusion.promoAncienPrix = null; fusion.promoDepuis = null; }
      return fusion;
    })
    .filter(function (p) { return !p.hidden; }); // hidden → not listed, not purchasable
}

// Invalide le cache des overrides. À appeler APRÈS toute écriture de prix
// (reprice-all, traqueur) : sans ça, la même instance serverless continue de
// servir jusqu'à 30 s le catalogue d'AVANT l'écriture — et un contrôle
// immédiat re-signale les produits qu'on vient pourtant de corriger.
function invalidateOverrides() {
  _overridesCache = null;
  _overridesCacheTime = 0;
}

// Merged catalogue (products.json + overrides, hidden removed).
async function loadCatalog() {
  var products = loadProducts();
  var overrides = await loadOverrides();
  return applyOverrides(products, overrides);
}

// Champs INTERNES écrits par le traqueur de prix / reprice dans product_overrides
// (coût d'achat fournisseur réel + marge appliquée). Ils sont indispensables au
// webhook (COGS) et à l'admin (marges), mais ne doivent JAMAIS sortir sur
// l'endpoint public /api/products : les exposer = publier le prix d'achat et la
// marge exacte de chaque produit.
var PRIVATE_FIELDS = [
  'priceSource', 'priceSrcTTC', 'priceCheckedAt',
  'priceMarkup', 'priceMode', 'priceRecomputedAt', 'priceCostOrigin',
  /* ⛔ `priceSources` (01/08/2026) : la carte multi-traqueurs — chaque entrée
     porte un COÛT D'ACHAT FOURNISSEUR (`ttc`). La servir publiquement serait
     la fuite irréversible (CDN + historique) que check-prix-fuite interdit.
     C'est check-catalog-public qui a attrapé l'oubli, avant tout déploiement. */
  'priceSources',
  'hidden'
];

function toPublic(p) {
  var clean = Object.assign({}, p);
  for (var i = 0; i < PRIVATE_FIELDS.length; i++) delete clean[PRIVATE_FIELDS[i]];
  return clean;
}

// Catalogue pour l'endpoint PUBLIC : même fusion, champs internes retirés.
async function loadPublicCatalog() {
  var merged = await loadCatalog();
  return merged.map(toPublic);
}

// Resolve a product by its client key. Mirrors findProductByKey() in app.js:
// matches on id, slug, or sku.
function findByKey(catalog, key) {
  if (!key || !Array.isArray(catalog)) return null;
  for (var i = 0; i < catalog.length; i++) {
    var p = catalog[i];
    if (p.id === key || p.slug === key || p.sku === key) return p;
  }
  return null;
}

module.exports = {
  loadCatalog: loadCatalog,
  loadPublicCatalog: loadPublicCatalog,
  findByKey: findByKey,
  invalidateOverrides: invalidateOverrides,
  // Exposés pour les tests CI (fonctions pures).
  _internals: { applyOverrides: applyOverrides, toPublic: toPublic, PRIVATE_FIELDS: PRIVATE_FIELDS }
};
