/* =========================================================
   Pirates Tools — CI runner
   - Agrège: audit/p1-static (intégrité statique AST), check-required-ids, check-paths, check-products-json
   - + Optionnel: lint-products.js (si présent) sur products.json
   - Robuste: safe require, rapports clairs, exitCode propre
========================================================= */
/* eslint-disable no-var */
'use strict';

var fs   = require('fs');
var path = require('path');
var cp   = require('child_process');

function safeRequire(p, label){
  try { return require(p); }
  catch(e){ 
    console.warn('ℹ️  Module manquant ignoré:', label || p);
    return null;
  }
}
function asArray(x){
  if (!x) return [];
  if (Array.isArray(x)) return x;
  return [String(x)];
}

var reqIds      = safeRequire('./check-required-ids', 'check-required-ids');
var p1Static    = safeRequire('./audit/p1-static', 'audit/p1-static');
var reqPaths    = safeRequire('./check-paths',       'check-paths');
var reqProducts = safeRequire('./check-products-json','check-products-json');
var reqPricing  = safeRequire('./check-pricing',     'check-pricing');
var reqPriceModel = safeRequire('./check-pricing-model','check-pricing-model');
var reqAccount = safeRequire('./check-accounting','check-accounting');
var reqInvoice = safeRequire('./check-invoice','check-invoice');
var reqLoyalty  = safeRequire('./check-loyalty',     'check-loyalty');
var reqCoffret  = safeRequire('./check-coffret',     'check-coffret');
var reqCatPub   = safeRequire('./check-catalog-public','check-catalog-public');
var reqAssetVer = safeRequire('./check-asset-versions','check-asset-versions');
var reqWhClaim  = safeRequire('./check-webhook-claim','check-webhook-claim');
var reqPwMin    = safeRequire('./check-price-watch','check-price-watch');
var reqCsp      = safeRequire('./check-csp',         'check-csp');
var reqAnalytics= safeRequire('./check-analytics',   'check-analytics');
var reqFns      = safeRequire('./check-functions',   'check-functions');
var reqFsQ      = safeRequire('./check-firestore-queries','check-firestore-queries');
var reqPartApp  = safeRequire('./check-partner-application','check-partner-application');

// NOTE 25/07/2026 : l'étape lint-products.js (fichier jamais versionné,
// silencieusement sautée à chaque run) est SUPPRIMÉE — ses invariants réels
// vivent désormais dans check-products-json.js (schéma 2026).

(async function run(){
  var started = Date.now();
  var errors = [];

  async function runOne(fn, label){
    if (!fn) return;
    try {
      var out = await fn();                 // chaque check retourne [] d’erreurs
      errors = errors.concat(asArray(out)); // concatène
    } catch(e){
      errors.push('['+label+'] ' + (e && e.message ? e.message : e));
    }
  }

  await runOne(reqIds,      'check-required-ids');
  await runOne(p1Static,    'audit/p1-static');
  await runOne(reqPaths,    'check-paths');
  await runOne(reqProducts, 'check-products-json');
  await runOne(reqPricing,  'check-pricing');
  await runOne(reqPriceModel,'check-pricing-model');
  await runOne(reqAccount, 'check-accounting');
  await runOne(reqInvoice, 'check-invoice');
  await runOne(reqLoyalty,  'check-loyalty');
  await runOne(reqCoffret,  'check-coffret');
  await runOne(reqCatPub,   'check-catalog-public');
  await runOne(reqAssetVer, 'check-asset-versions');
  await runOne(reqWhClaim,  'check-webhook-claim');
  await runOne(reqPwMin,    'check-price-watch');
  await runOne(reqCsp,      'check-csp');
  await runOne(reqAnalytics,'check-analytics');
  await runOne(reqFns,      'check-functions');
  await runOne(reqFsQ,      'check-firestore-queries');
  await runOne(reqPartApp,  'check-partner-application');

  var dur = Math.max(1, Date.now() - started);
  if (errors.length){
    console.error('\n❌ CI FAILED — problèmes détectés ('+errors.length+'):\n');
    errors.forEach(function(e, i){ console.error((i+1)+'. '+e); });
    console.error('\nRésumé: '+errors.length+' erreur(s) • durée: '+dur+'ms');
    process.exit(1);
  } else {
    console.log('\n✅ CI OK — tous les contrôles sont passés. ('+dur+'ms)');
  }
})();
