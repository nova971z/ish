/* =========================================================
   Pirates Tools — CI runner
   - Agrège: audit/p1-static (intégrité statique AST), audit/p2-xss (injection HTML), audit/p3-* (securite serveur + aiguillage reel), audit/p4-firestore (regles + index), audit/p5-money (machine a etats + taux), audit/p6-rgpd (effacement + information), audit/p7-architecture (etat, fuites, cliquet), audit/p8-perf (budget de poids + SW), audit/p9-a11y (contraste + nom accessible), check-required-ids, check-paths, check-products-json
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
var p2Xss       = safeRequire('./audit/p2-xss', 'audit/p2-xss');
var p3Endpoints = safeRequire('./audit/p3-endpoints', 'audit/p3-endpoints');
var p3Dispatch  = safeRequire('./audit/p3-dispatch-live', 'audit/p3-dispatch-live');
var p4Firestore = safeRequire('./audit/p4-firestore', 'audit/p4-firestore');
var p5Money     = safeRequire('./audit/p5-money', 'audit/p5-money');
var p6Rgpd      = safeRequire('./audit/p6-rgpd', 'audit/p6-rgpd');
var p7Archi     = safeRequire('./audit/p7-architecture', 'audit/p7-architecture');
var p8Perf      = safeRequire('./audit/p8-perf', 'audit/p8-perf');
var p9A11y      = safeRequire('./audit/p9-a11y', 'audit/p9-a11y');
var reqPaths    = safeRequire('./check-paths',       'check-paths');
var reqProducts = safeRequire('./check-products-json','check-products-json');
var reqPricing  = safeRequire('./check-pricing',     'check-pricing');
var reqPriceModel = safeRequire('./check-pricing-model','check-pricing-model');
var reqAccount = safeRequire('./check-accounting','check-accounting');
var reqInvoice = safeRequire('./check-invoice','check-invoice');
var reqLoyalty  = safeRequire('./check-loyalty',     'check-loyalty');
var reqHoraires = safeRequire('./check-horaires',    'check-horaires');
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
var reqHarnais  = safeRequire('./check-harnais',      'check-harnais');
// Portes de la MÉMOIRE (29/07/2026) : CLAUDE.md avait atteint 1557 lignes parce
// que rien n'empêchait d'y écrire. Une mémoire ne tient pas par discipline,
// elle tient par des portes.
var reqMemoire  = safeRequire('./check-memoire',     'check-memoire');
var reqOu       = safeRequire('./check-ou',          'check-ou');
// Une panne doit produire une PORTE, pas un souvenir (boucle d'apprentissage).
var reqLecons   = safeRequire('./check-lecons',      'check-lecons');
// Le registre des erreurs est injecté à CHAQUE message : s'il se déforme ou
// s'il enfle, il finit ignoré — et un registre ignoré ne trace plus rien.
var reqErreurs  = safeRequire('./erreurs',           'check-erreurs');
// La porte juridique : on vérifie qu'elle a des dents. Un motif qui ne vise
// plus aucun fichier ne refuse plus rien ET ne le dit pas.
var modJur      = safeRequire('./juridique',         'check-juridique');
var reqJur      = modJur && modJur.controle ? modJur.controle : null;
// La porte d'O1 (hook Stop). Elle doit refuser le faux ET laisser passer le
// vrai : une porte hystérique finit désactivée, donc ne protège plus rien.
var reqSortie   = safeRequire('./garde-sortie',      'check-sortie');
// On n'écrit pas sur un fichier dont l'état a changé depuis qu'on l'a lu.
var modFrais    = safeRequire('./garde-fraicheur',   'check-fraicheur');
var reqFrais    = modFrais && modFrais.controle ? modFrais.controle : null;
// La sonde d'oublis : une table écrite à la main, confrontée au code réel.
var reqCouv     = safeRequire('./couverture',        'check-couverture');
// Le filet qui mord sur les MOTS DE LA DEMANDE, pas sur l'aiguillage.
var reqInterd   = safeRequire('./interdits',         'check-interdits');
// La porte du traqueur : elle doit ouvrir price-watch, et RIEN d'autre.
// Le 31/07 elle s'est refermee en silence et les prix ont cesse d'etre releves.
var reqWatchAu  = safeRequire('./check-watch-auth',  'check-watch-auth');
// Le prix AFFICHE doit etre celui qui sera DEBITE. Le serveur calcule depuis
// price_ht ; `price` n'est qu'un affichage. 27 fiches divergeaient le 31/07.
var reqPrixAff  = safeRequire('./check-prix-affiches','check-prix-affiches');
// products.json est SERVI PUBLIQUEMENT : le prix d'achat fournisseur ne doit
// jamais s'y trouver. 3 fiches l'exposaient le 31/07 — irreversible une fois
// sur le CDN et dans l'historique git.
var reqPrixFui  = safeRequire('./check-prix-fuite',  'check-prix-fuite');
// La couture paiement : deux fournisseurs, un seul contrat. Le defaut doit
// toujours designer celui qui ENCAISSE, et aucun etat inconnu ne doit pouvoir
// passer pour « paye » — c'est le seul defaut ici qui couterait de la marchandise.
var reqPaiement = safeRequire('./check-paiement',    'check-paiement');
// Le module Revolut est ecrit AVANT d'avoir pu appeler le reseau : tout ce qui
// est PUR (signature contre le vecteur officiel, commission d'un ordre
// reessaye, table des etats) s'eprouve ici, sinon la 1re verification aurait
// lieu sur un vrai paiement — c'est-a-dire trop tard.
var reqRevolut  = safeRequire('./check-revolut',     'check-revolut');

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
  await runOne(p2Xss,       'audit/p2-xss');
  await runOne(p3Endpoints, 'audit/p3-endpoints');
  await runOne(p3Dispatch,  'audit/p3-dispatch-live');
  await runOne(p4Firestore, 'audit/p4-firestore');
  await runOne(p5Money,     'audit/p5-money');
  await runOne(p6Rgpd,      'audit/p6-rgpd');
  await runOne(p7Archi,     'audit/p7-architecture');
  await runOne(p8Perf,      'audit/p8-perf');
  await runOne(p9A11y,      'audit/p9-a11y');
  await runOne(reqPaths,    'check-paths');
  await runOne(reqProducts, 'check-products-json');
  await runOne(reqPricing,  'check-pricing');
  await runOne(reqPriceModel,'check-pricing-model');
  await runOne(reqAccount, 'check-accounting');
  await runOne(reqInvoice, 'check-invoice');
  await runOne(reqLoyalty,  'check-loyalty');
  await runOne(reqHoraires, 'check-horaires');
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
  await runOne(reqHarnais,  'check-harnais');
  await runOne(reqMemoire,  'check-memoire');
  await runOne(reqOu,       'check-ou');
  await runOne(reqLecons,   'check-lecons');
  await runOne(reqErreurs,  'check-erreurs');
  await runOne(reqJur,      'check-juridique');
  await runOne(reqSortie,   'check-sortie');
  await runOne(reqFrais,    'check-fraicheur');
  await runOne(reqCouv,     'check-couverture');
  await runOne(reqInterd,   'check-interdits');
  await runOne(reqWatchAu,  'check-watch-auth');
  await runOne(reqPrixAff,  'check-prix-affiches');
  await runOne(reqPrixFui,  'check-prix-fuite');
  await runOne(reqPaiement, 'check-paiement');
  await runOne(reqRevolut,  'check-revolut');

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
