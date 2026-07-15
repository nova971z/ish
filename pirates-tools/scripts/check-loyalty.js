/* =========================================================
   check-loyalty.js — Garde la parité des paliers fidélité.

   La remise réellement débitée est calculée par api/_lib/loyalty.js ; le
   client (app.js, LOYALTY_TIERS) affiche les mêmes paliers. Si l'un des deux
   change sans l'autre, l'avantage affiché divergerait de la remise appliquée
   au paiement — ce check fait échouer la CI dans ce cas.
========================================================= */
'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function checkLoyalty() {
  var errors = [];
  var lib;
  try {
    lib = require('../api/_lib/loyalty');
  } catch (e) {
    return ['[check-loyalty] Impossible de charger api/_lib/loyalty.js : ' + (e && e.message)];
  }

  // Extrait LOYALTY_TIERS du source client (app.js).
  var appSrc;
  try {
    appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
  } catch (e) {
    return ['[check-loyalty] Impossible de lire app.js : ' + (e && e.message)];
  }
  var m = appSrc.match(/LOYALTY_TIERS\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) return ['[check-loyalty] LOYALTY_TIERS introuvable dans app.js'];

  var clientTiers;
  try {
    clientTiers = new Function('return ' + m[1] + ';')();
  } catch (e) {
    return ['[check-loyalty] LOYALTY_TIERS illisible : ' + (e && e.message)];
  }

  if (!Array.isArray(clientTiers) || clientTiers.length !== lib.TIERS.length) {
    return ['[check-loyalty] Nombre de paliers divergent : client ' + (clientTiers && clientTiers.length) + ' vs serveur ' + lib.TIERS.length];
  }
  for (var i = 0; i < lib.TIERS.length; i++) {
    var s = lib.TIERS[i], c = clientTiers[i];
    ['key', 'min', 'discountPct'].forEach(function (f) {
      if (s[f] !== c[f]) {
        errors.push('[check-loyalty] Palier "' + s.key + '" : ' + f + ' divergent (client ' + c[f] + ' vs serveur ' + s[f] + ')');
      }
    });
  }
  return errors;
};
