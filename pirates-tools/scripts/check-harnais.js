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
/* ⚠️ TROU DANS CETTE PORTE, comblé le 28/07/2026 : elle ne couvrait que
   `tests/`. Or `outils/` avait EXACTEMENT le même défaut — 16 chemins absolus
   dans des outils versionnés, donc inexécutables ailleurs, alors que leur
   README affirme que « refaire un pack sans eux coûterait des jours ».
   Un outil sauvé mais incapable de tourner ne sauve rien. */
var DOSSIERS = ['tests', 'outils'];

// Le socle a le DROIT de citer des chemins : c'est lui qui les résout, en un
// seul endroit, avec un repli et un message clair. C'est toute sa raison d'être.
var DISPENSES = ['_socle.mjs', '_socle.cjs', '_porter.mjs', '_fauxcompte.cjs'];

// Ce qu'on refuse : un chemin absolu système dans une chaîne de caractères.
var ABSOLU = /['"`](\/(?:home|opt|usr|var|tmp|Users|mnt)\/[^'"`\n]*)['"`]/g;

module.exports = function checkHarnais() {
  var errors = [];
  var fichiers = [];
  DOSSIERS.forEach(function (d) {
    var abs = path.join(RACINE, d);
    if (!fs.existsSync(abs)) return;
    // récursif : outils/gltf/ contient les constructeurs de packs
    (function parcourir(rel) {
      fs.readdirSync(path.join(RACINE, rel), { withFileTypes: true }).forEach(function (e) {
        if (e.name === 'node_modules' || e.name.charAt(0) === '.') return;
        var r = rel + '/' + e.name;
        if (e.isDirectory()) { if (e.name !== '_perimes' && e.name !== '_travail' && e.name !== '_sortie') parcourir(r); }
        else if ((/\.(mjs|js|cjs)$/).test(e.name) && DISPENSES.indexOf(e.name) === -1) fichiers.push(r);
      });
    })(d);
  });

  /* ⚠️ TROU N°2, comblé le 29/07/2026 : quatre harnais écrivaient leurs
     captures d'écran À LA RACINE DU SITE (`p8-client.png`, `p9-bandeau.png`…).
     Conséquences réelles, pas théoriques :
       1. Ces fichiers étaient VERSIONNÉS et réécrits à chaque exécution — le
          dépôt devenait sale sans qu'on ait touché une ligne de code ;
       2. rien ne les excluait du déploiement : ils étaient donc SERVIS
          PUBLIQUEMENT sur pirates-tools.com (des copies d'écran des espaces
          client et livreur, accessibles à qui devine le nom) ;
       3. ~913 Ko de déploiement pour zéro usage.
     Le socle expose `sortie(nom)` exactement pour ça : tests/_sortie/ n'est ni
     versionné ni déployé. Cette porte refuse toute capture écrite ailleurs. */
  var CAPTURE = /screenshot\s*\(\s*\{[^}]*\bpath\s*:\s*['"`]([^'"`\n]+)['"`]/g;

  fichiers.forEach(function (f) {
    var src = fs.readFileSync(path.join(RACINE, f), 'utf8');
    var lignes = src.split('\n');
    lignes.forEach(function (l, i) {
      CAPTURE.lastIndex = 0;
      var cap;
      while ((cap = CAPTURE.exec(l))) {
        if (cap[1].indexOf('_sortie') === -1) {
          errors.push('CAPTURE HORS tests/_sortie/ dans ' + f + ':' + (i + 1)
            + ' → "' + cap[1] + '". Une capture écrite ailleurs salit le dépôt à '
            + 'chaque exécution et finit SERVIE PUBLIQUEMENT si elle atterrit à la '
            + 'racine du site. Passe par le socle : '
            + 'path: join(await sortie(\'<harnais>\'), \'<nom>.png\').');
        }
      }
      ABSOLU.lastIndex = 0;
      var m;
      while ((m = ABSOLU.exec(l))) {
        errors.push('CHEMIN ABSOLU dans ' + f + ':' + (i + 1) + ' → "' + m[1] + '". '
          + 'Un fichier qui cite un chemin en dur ne tourne que sur la machine où il '
          + 'a été écrit. Passe par le socle de son dossier : tests/_socle.mjs '
          + '(RACINE, playwright(), sortie()) ou outils/_socle.cjs (RACINE, MODELES, '
          + 'POSTERS, travail(), playwright(), three()).');
      }
    });
  });

  // Le dossier de sauvetage doit finir vide : tant qu'il reste des harnais
  // dedans, le tri n'est pas terminé. Ce n'est pas une erreur bloquante —
  // c'est un compteur qui doit descendre.
  var bruts = path.join(RACINE, 'tests', '_bruts');
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
  console.log('✅ check-harnais : aucun chemin absolu dans tests/ ni outils/');
}
