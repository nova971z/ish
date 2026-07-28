/* check-harnais.js — Garde-fou de portabilité des harnais.
   Les 60 harnais sauvés du scratchpad le 28/07/2026 contenaient des chemins
   absolus (`/home/user/ish/pirates-tools`, `/opt/node22/.../playwright`,
   `/opt/pw-browsers/chromium`) : ils ne tournaient QUE dans le conteneur où ils
   avaient été écrits. Versionnés tels quels, ils auraient donné l'illusion
   d'une protection tout en étant inexécutables ailleurs.
   Ce contrôle refuse qu'un chemin absolu revienne dans tests/.
   Retourne un tableau d'erreurs (vide = OK), comme les autres checks. */
'use strict';

var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');
var TESTS = path.join(RACINE, 'tests');

// Le socle a le DROIT de citer des chemins : c'est lui qui les résout, en un
// seul endroit, avec un repli et un message clair. C'est toute sa raison d'être.
var DISPENSES = ['_socle.mjs', '_porter.mjs'];

// Ce qu'on refuse : un chemin absolu système dans une chaîne de caractères.
var ABSOLU = /['"`](\/(?:home|opt|usr|var|tmp|Users|mnt)\/[^'"`\n]*)['"`]/g;

module.exports = function checkHarnais() {
  var errors = [];
  if (!fs.existsSync(TESTS)) return errors;

  var fichiers = fs.readdirSync(TESTS).filter(function (f) {
    return (/\.(mjs|js)$/).test(f) && DISPENSES.indexOf(f) === -1;
  });

  fichiers.forEach(function (f) {
    var src = fs.readFileSync(path.join(TESTS, f), 'utf8');
    var lignes = src.split('\n');
    lignes.forEach(function (l, i) {
      ABSOLU.lastIndex = 0;
      var m;
      while ((m = ABSOLU.exec(l))) {
        errors.push('CHEMIN ABSOLU dans tests/' + f + ':' + (i + 1) + ' → "' + m[1] + '". '
          + 'Un harnais qui cite un chemin en dur ne tourne que sur la machine où il a '
          + 'été écrit. Passe par tests/_socle.mjs (RACINE, playwright(), sortie()).');
      }
    });
  });

  // Le dossier de sauvetage doit finir vide : tant qu'il reste des harnais
  // dedans, le tri n'est pas terminé. Ce n'est pas une erreur bloquante —
  // c'est un compteur qui doit descendre.
  var bruts = path.join(TESTS, '_bruts');
  if (fs.existsSync(bruts)) {
    var n = fs.readdirSync(bruts).filter(function (f) { return (/\.(mjs|js)$/).test(f); }).length;
    if (n > 0 && require.main === module) {
      console.log('  ℹ️  tests/_bruts/ contient encore ' + n + ' harnais non portés '
        + '(sauvés mais pas triés). Ce dossier doit finir vide.');
    }
  }

  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('❌ ' + e); }); process.exit(1); }
  console.log('✅ check-harnais : aucun chemin absolu dans tests/');
}
