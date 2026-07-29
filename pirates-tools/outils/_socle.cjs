/* outils/_socle.cjs — la racine du dépôt, calculée.
   ─────────────────────────────────────────────────────────────────────────
   MÊME DÉFAUT QUE LES HARNAIS, TROUVÉ LE 28/07/2026 EN TRIANT LE SCRATCHPAD :
   les outils versionnés ici écrivaient dans `/tmp/claude-0/…` et lisaient
   `/home/user/ish/pirates-tools/…`. Ils étaient donc **inexécutables ailleurs**
   — alors que leur README affirme que « refaire un pack sans eux coûterait des
   jours ». Un outil sauvé mais incapable de tourner ne sauve rien.

   Les chemins vivent désormais ICI, à un seul endroit. */
'use strict';
var path = require('path');
var fs = require('fs');

/** La racine du dépôt (pirates-tools/), calculée depuis ce fichier. */
var RACINE = path.join(__dirname, '..');

/** Dossier de travail des outils : sorties intermédiaires, jamais versionnées. */
function travail(nom) {
  var d = path.join(RACINE, 'outils', '_travail', nom || '');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/* Playwright et three sont utilises par les outils de RENDU (orientation d'un
   GLB, collage d'un poster). Meme principe que pour les harnais : on resout,
   on ne code pas en dur, et on explique clairement si c'est absent. */
function resoudre(noms, quoi, commande) {
  for (var i = 0; i < noms.length; i++) {
    try { if (noms[i].charAt(0) !== '/' || fs.existsSync(noms[i])) return require(noms[i]); }
    catch (e) { /* suivant */ }
  }
  throw new Error(quoi + ' est introuvable.\n  Installation : ' + commande
    + '\n  Chemins essayes : ' + noms.join(', '));
}
function playwright() {
  return resoudre(['playwright', '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright'], 'Playwright',
    'npm install -D playwright && npx playwright install chromium');
}
function three() {
  return resoudre(['three', path.join(__dirname, 'node_modules', 'three')], 'three.js',
    'cd outils && npm install three');
}
function optionsNavigateur(extra) {
  var o = Object.assign({}, extra || {});
  var prepose = '/opt/pw-browsers/chromium';
  if (!o.executablePath && fs.existsSync(prepose)) o.executablePath = prepose;
  return o;
}

module.exports = { RACINE, travail, playwright, three, optionsNavigateur,
  MODELES: path.join(RACINE, 'models', 'products'),
  POSTERS: path.join(RACINE, 'images', 'posters') };
