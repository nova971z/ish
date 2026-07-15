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
    var admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount))
      });
    }
    var db = admin.firestore();
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
      return Object.assign({}, p, patch);
    })
    .filter(function (p) { return !p.hidden; }); // hidden → not listed, not purchasable
}

// Merged catalogue (products.json + overrides, hidden removed).
async function loadCatalog() {
  var products = loadProducts();
  var overrides = await loadOverrides();
  return applyOverrides(products, overrides);
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
  findByKey: findByKey
};
