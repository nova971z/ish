// scripts/check-price-watch.js — Règle « min des sources » du traqueur (25/07).
// Quand le fournisseur vend une déclinaison MOINS cher que la réf principale
// (ex. DBS180ZJ coffret < DBS180Z nu), on achète la moins chère → prix de
// référence = min. Vérifie la fonction pure pickCheapestSource, son
// branchement dans handlePriceWatch, et que chaque srcAltSkus du catalogue ne
// pointe PAS vers un SKU encore présent au catalogue (sinon doublon de fiche).
'use strict';
var fs = require('fs');
var path = require('path');
var pp = require('../api/_lib/price-parse');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-price-watch] ' + m); }

  var f = pp.pickCheapestSource;
  ok(typeof f === 'function', 'pickCheapestSource exportée');
  if (!f) return errors;

  var page = { 'DBS180Z': 220.00, 'DBS180ZJ': 219.04 };
  ok(f(220.00, ['DBS180ZJ'], page) === 219.04, 'alt moins chère → min pris (219,04)');
  ok(f(210.00, ['DBS180ZJ'], page) === 210.00, 'propre moins cher → conservé');
  ok(f(220.00, ['ABSENTE'], page) === 220.00, 'alt absente de la page → ignorée');
  ok(f(220.00, undefined, page) === 220.00, 'sans srcAltSkus → prix propre');
  ok(f(220.00, ['dbs180zj'], page) === 219.04, 'casse du SKU insensible');
  ok(f(220.00, ['DBS180ZJ'], { DBS180ZJ: 0 }) === 220.00, 'alt à 0 → ignorée (pas de prix nul)');

  // Branchement réel dans handlePriceWatch.
  var adminSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  ok(/pickCheapestSource\s*\(\s*item\.price\s*,\s*p\.srcAltSkus/.test(adminSrc),
    'handlePriceWatch applique pickCheapestSource(item.price, p.srcAltSkus, …)');

  // Cohérence catalogue : un srcAltSkus ne doit jamais référencer un SKU
  // encore AU catalogue (la déclinaison doit être fusionnée, pas dupliquée).
  var products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'products.json'), 'utf8'));
  var skus = {}; products.forEach(function (p) { skus[String(p.sku).toUpperCase()] = 1; });
  products.forEach(function (p) {
    (p.srcAltSkus || []).forEach(function (a) {
      ok(!skus[String(a).toUpperCase()],
        p.sku + ' : srcAltSkus "' + a + '" existe ENCORE au catalogue (fusionner la fiche)');
    });
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-price-watch OK');
}
