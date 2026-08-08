// scripts/generer-styles.js — CSS SERVI SANS COMMENTAIRES (lot poids, levier 1).
//
// styles.css = SOURCE de développement (commentée ; ses commentaires vivent
// AUSSI dans docs/CSS-CARTE.md). Ce script en génère styles.min.css = le CSS
// SERVI, débarrassé de ses commentaires et espaces insignifiants.
//
// ⛔ ZÉRO CHANGEMENT DE RÈGLE. La coupe passe par css-tree (parseur réel,
// jamais une regex : un `/*` dans une chaîne piégerait un strip naïf). On ne
// retire QUE les nœuds Comment ; --verifie prouve que l'ensemble des règles
// (sélecteurs + déclarations, dans l'ordre) est identique entre source et servi.
//
//   node scripts/generer-styles.js            écrit styles.min.css
//   node scripts/generer-styles.js --verifie  porte CI (à jour + zéro commentaire + mêmes règles)
'use strict';
var fs = require('fs');
var path = require('path');
var csstree = require('css-tree');

var RACINE = path.join(__dirname, '..');
var SRC = path.join(RACINE, 'styles.css');
var OUT = path.join(RACINE, 'styles.min.css');

// Génère le CSS servi : AST de la source, on retire les nœuds Comment, on
// re-sérialise (compact). Rien d'autre n'est touché.
function generer() {
  var src = fs.readFileSync(SRC, 'utf8');
  var ast = csstree.parse(src);
  csstree.walk(ast, function (node, item, list) {
    if (node.type === 'Comment' && list) list.remove(item);
  });
  return '/* GÉNÉRÉ par scripts/generer-styles.js depuis styles.css — NE PAS ÉDITER. */\n'
    + csstree.generate(ast) + '\n';
}

// Signature de l'ensemble des règles : pour chaque Rule/Atrule, son prélude et
// ses déclarations sérialisés, dans l'ordre du fichier. Deux CSS de même
// signature ont EXACTEMENT les mêmes règles — seuls commentaires/espaces diffèrent.
function signatureRegles(css) {
  var ast = csstree.parse(css);
  var sig = [];
  csstree.walk(ast, function (node) {
    if (node.type === 'Rule') {
      sig.push('R|' + csstree.generate(node.prelude) + '{' + csstree.generate(node.block) + '}');
    } else if (node.type === 'Atrule') {
      sig.push('@|' + node.name + '|' + (node.prelude ? csstree.generate(node.prelude) : ''));
    }
  });
  return sig;
}

function compteCommentaires(css) {
  var ast = csstree.parse(css);
  var n = 0;
  csstree.walk(ast, function (node) { if (node.type === 'Comment') n++; });
  return n;
}

module.exports = { generer: generer, signatureRegles: signatureRegles };

if (require.main === module) {
  var attendu = generer();
  if (process.argv[2] === '--verifie') {
    var errs = [];
    var surDisque;
    try { surDisque = fs.readFileSync(OUT, 'utf8'); }
    catch (e) { console.error('  ❌ [generer-styles] styles.min.css manquant — relancer sans --verifie'); process.exit(1); }
    if (surDisque !== attendu) errs.push('styles.min.css pas à jour vs styles.css — relancer sans --verifie');
    var nc = compteCommentaires(surDisque.replace(/^\/\* GÉNÉRÉ[^\n]*\n/, ''));
    if (nc !== 0) errs.push(nc + ' commentaire(s) SUBSISTENT dans styles.min.css');
    // Zéro changement de règle : signatures identiques source ↔ servi.
    var sigSrc = signatureRegles(fs.readFileSync(SRC, 'utf8'));
    var sigOut = signatureRegles(surDisque);
    if (JSON.stringify(sigSrc) !== JSON.stringify(sigOut)) {
      errs.push('les RÈGLES diffèrent entre styles.css et styles.min.css (' + sigSrc.length + ' vs ' + sigOut.length + ' règles) — la coupe a changé le CSS');
    }
    if (errs.length) { errs.forEach(function (e) { console.error('  ❌ [generer-styles] ' + e); }); process.exit(1); }
    console.log('✅ generer-styles : styles.min.css à jour, 0 commentaire, ' + sigOut.length + ' règles identiques à la source');
    process.exit(0);
  }
  fs.writeFileSync(OUT, attendu);
  var s = fs.statSync(SRC).size, o = fs.statSync(OUT).size;
  console.log('styles.min.css écrit : ' + (s / 1024).toFixed(0) + ' Ko → ' + (o / 1024).toFixed(0) + ' Ko (' + signatureRegles(attendu).length + ' règles)');
}
