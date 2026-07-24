// scripts/check-pricing-model.js — Vérifie le moteur de tarification (marge cible).
// Cas de référence validés avec l'user (15 % net après IS, Guadeloupe).
'use strict';

var model = require('../api/_lib/pricing-model');

module.exports = function () {
  var errors = [];
  function ok(cond, msg) { if (!cond) errors.push('[check-pricing-model] ' + msg); }
  function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (attendu ~' + b + ', obtenu ' + a + ')'); }

  var visseuse = { weight_kg: 1, ncCategory: 'power_tool', variantRole: 'solo', title: 'Visseuse nue' };
  var rColis = model.recommend(visseuse, { costHT: 62, mode: 'colissimo' });
  var rCont  = model.recommend(visseuse, { costHT: 62, mode: 'container' });

  ok(rColis && rColis.transport === 17, 'transport Colissimo 1 kg = 17 €');
  ok(rColis.marginAfterIS >= 0.149, 'Colissimo : marge après IS ≥ 15 % (obtenu ' + (rColis.marginAfterIS * 100).toFixed(1) + '%)');
  near(rColis.markup * 100, 62, 9, 'Colissimo visseuse markup ~55-64 %');

  ok(rCont.transport === 5.3, 'transport container nu = 5,3 €');
  ok(rCont.marginAfterIS >= 0.149, 'Container : marge après IS ≥ 15 %');
  ok(rCont.priceHt < rColis.priceHt, 'Container : prix plus bas que Colissimo (même marge)');

  var gros = { weight_kg: 3, ncCategory: 'power_tool', variantRole: 'solo', title: 'Gros outil' };
  var rg = model.recommend(gros, { costHT: 220, mode: 'colissimo' });
  ok(rg.marginAfterIS >= 0.149, 'Gros outil Colissimo : marge après IS ≥ 15 %');
  ok(rg.markup < rColis.markup, 'Gros outil : markup < petit outil (le port pèse moins)');

  near(rColis.priceHtFor.price, rColis.priceHt * 1.20, 0.02, 'price = price_ht × 1,20');

  var rTTC = model.recommend(visseuse, { costTTC: 74.40, mode: 'colissimo' });
  near(rTTC.costHT, 62, 0.1, 'costTTC 74,40 → costHT ~62');

  // Mode container : markup plus bas que Colissimo, même marge cible.
  var cfgCont = Object.assign({}, model.DEFAULT_CONFIG, { mode: 'container' });
  var rContTTC = model.recommend(visseuse, { costTTC: 74.40, mode: 'container' }, cfgCont);
  ok(rContTTC.markup < rTTC.markup, 'container : markup < Colissimo (même marge)');
  ok(rContTTC.marginAfterIS >= 0.149, 'container : marge après IS ≥ 15 %');

  // Sanitisation de la config : rejette clés inconnues, négatifs, mode invalide.
  var cfgLib = require('../api/_lib/pricing-config');
  var s = cfgLib.sanitize({ mode: 'container', targetNet: 0.15, evil: 'x', badNum: -5, refTerritory: '971' });
  ok(s.evil === undefined, 'sanitize : clé inconnue rejetée');
  ok(s.badNum === undefined, 'sanitize : nombre négatif rejeté');
  ok(s.mode === 'container', 'sanitize : mode valide conservé');
  ok(cfgLib.sanitize({ mode: 'avion' }).mode === undefined, 'sanitize : mode invalide rejeté');

  return errors;
};

// Exécution directe : node scripts/check-pricing-model.js
if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-pricing-model : moteur de tarification OK');
}
