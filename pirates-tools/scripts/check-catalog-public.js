// scripts/check-catalog-public.js — Garde-fou anti-fuite des coûts fournisseur.
// L'endpoint public /api/products doit servir loadPublicCatalog() : les champs
// écrits par le traqueur de prix (priceSrcTTC = coût d'achat réel, priceMarkup…)
// ne doivent JAMAIS sortir. Ce check échoue si :
//  1) toPublic laisse passer un champ privé (test sur fonctions pures) ;
//  2) api/products.js n'utilise plus loadPublicCatalog ;
//  3) un nouveau champ 'price*' apparaît dans les écritures d'overrides
//     (api/admin.js) sans être couvert par PRIVATE_FIELDS.
'use strict';
var fs = require('fs');
var path = require('path');
var catalog = require('../api/_lib/catalog');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-catalog-public] ' + m); }

  var I = catalog._internals;
  ok(I && typeof I.toPublic === 'function' && Array.isArray(I.PRIVATE_FIELDS),
    '_internals (toPublic/PRIVATE_FIELDS) exposés');
  if (!I || !I.toPublic) return errors;

  // 1) Fonctions pures : un produit fusionné avec un override traqueur complet
  //    doit ressortir SANS aucun champ privé, mais AVEC ses champs publics.
  var base = [{ id: 'x1', slug: 'x1-slug', sku: 'X1', title: 'T', price: 120, price_ht: 100, brand: 'B' }];
  var overrides = {
    x1: {
      price: 115, price_ht: 95.83,
      priceSource: 'cotebrico', priceSrcTTC: 83.29, priceCheckedAt: 1,
      priceMarkup: 0.15, priceMode: 'colissimo', priceRecomputedAt: 2,
      hidden: false
    }
  };
  var merged = I.applyOverrides(base, overrides);
  ok(merged.length === 1 && merged[0].price === 115, 'applyOverrides fusionne le patch');
  var pub = merged.map(I.toPublic)[0];
  I.PRIVATE_FIELDS.forEach(function (k) {
    ok(!(k in pub), 'champ privé "' + k + '" absent de la sortie publique');
  });
  ok(pub.price === 115 && pub.price_ht === 95.83 && pub.title === 'T' && pub.sku === 'X1',
    'champs publics conservés (price/price_ht/title/sku)');

  // 2) L'endpoint public utilise bien loadPublicCatalog (pas loadCatalog).
  var productsSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'products.js'), 'utf8');
  ok(/loadPublicCatalog\s*\(/.test(productsSrc), 'api/products.js appelle loadPublicCatalog()');
  ok(!/catalog\.loadCatalog\s*\(/.test(productsSrc), 'api/products.js n\'appelle plus loadCatalog() brut');

  // 3) Dérive : toute CLÉ d'objet price* posée dans admin.js (écritures
  //    product_overrides du traqueur/reprice) doit être couverte par
  //    PRIVATE_FIELDS. Allowlist : priceHt = argument interne de marginAt
  //    (jamais écrit en override) ; price/price_ht = prix de VENTE, publics.
  var ALLOW = ['priceHt'];
  var adminSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  var written = {};
  (adminSrc.match(/\bprice[A-Z][A-Za-z]*(?=\s*:)/g) || []).forEach(function (f) { written[f] = true; });
  Object.keys(written).forEach(function (f) {
    if (ALLOW.indexOf(f) !== -1) return;
    ok(I.PRIVATE_FIELDS.indexOf(f) !== -1,
      'clé traqueur "' + f + '" posée par admin.js doit être listée dans PRIVATE_FIELDS (catalog.js)');
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-catalog-public OK');
}
