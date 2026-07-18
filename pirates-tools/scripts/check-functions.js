/* check-functions.js — Garde-fou du plafond de fonctions serverless.
   Vercel Hobby (gratuit) limite à 12 fonctions par déploiement : au-delà, le
   BUILD ÉCHOUE (le site ne se met plus à jour). Ce check compte les endpoints
   api/*.js (hors _lib) et échoue AVANT le déploiement si on dépasse.
   Retourne un tableau d'erreurs (vide = OK), comme les autres checks. */
'use strict';

var fs = require('fs');
var path = require('path');

var LIMIT = 12; // plafond Vercel Hobby

module.exports = function checkFunctions() {
  var errors = [];
  var apiDir = path.resolve(__dirname, '../api');
  var fns;
  try {
    fns = fs.readdirSync(apiDir).filter(function (f) { return /\.js$/.test(f); });
  } catch (e) {
    return ['[functions] dossier api/ introuvable'];
  }
  if (fns.length > LIMIT) {
    errors.push('[functions] ' + fns.length + ' fonctions serverless (' + fns.join(', ')
      + ') > plafond Vercel Hobby (' + LIMIT + '). Le déploiement ÉCHOUERA. '
      + 'Fusionne ou retire un endpoint avant de merger.');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('❌ ' + e); }); process.exit(1); }
  console.log('✅ check-functions : ≤ ' + LIMIT + ' fonctions serverless');
}
