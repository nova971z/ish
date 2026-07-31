/* aligner-prix-affiches.js — REMET L'AFFICHAGE SUR CE QUI SERA DÉBITÉ.
   ─────────────────────────────────────────────────────────────────────────
   `price` est un AFFICHAGE. Le montant réellement prélevé se calcule depuis
   `price_ht` (api/_lib/pricing.js) avec le taux du territoire de livraison.
   Quand les deux divergent, c'est TOUJOURS `price` qu'on corrige — jamais
   `price_ht`, qui est la base commerciale décidée par le calculateur.

   ⚠️ Ce script ne FIXE aucun prix : il recopie une valeur dérivée. Il ne
   touche donc pas à la règle « plus aucun prix saisi à la main ».

     node scripts/aligner-prix-affiches.js            aperçu, n'écrit rien
     node scripts/aligner-prix-affiches.js --ecrire   applique

   ⚠️ Sauvegarde d'abord : products.json est versionné, donc `git diff` montre
   exactement ce qui bouge. On relit APRÈS écriture (E-206 : ne jamais se fier
   au retour d'une écriture).
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

var FICHIER = path.join(__dirname, '..', 'products.json');
var TOLERANCE = 0.005;

function main() {
  var texte = fs.readFileSync(FICHIER, 'utf8');
  var brut = JSON.parse(texte);
  var arr = Array.isArray(brut) ? brut : (brut.products || brut.items || []);
  var ecrire = process.argv.indexOf('--ecrire') !== -1;
  var changes = [];

  arr.forEach(function (p) {
    if (typeof p.price_ht !== 'number' || typeof p.vat !== 'number' || typeof p.price !== 'number') return;
    var attendu = Math.round(p.price_ht * (1 + p.vat) * 100) / 100;
    if (Math.abs(attendu - p.price) <= TOLERANCE) return;
    changes.push({ ref: p.sku || p.id, avant: p.price, apres: attendu });
    if (ecrire) p.price = attendu;
  });

  if (!changes.length) { console.log('  ✅ aucun écart : l\'affiché correspond déjà au débité.'); return 0; }

  console.log('  ' + changes.length + ' fiche(s) à aligner :');
  changes.slice(0, 30).forEach(function (c) {
    console.log('    ' + String(c.ref).padEnd(16) + c.avant.toFixed(2) + ' → ' + c.apres.toFixed(2) + ' €');
  });
  if (changes.length > 30) console.log('    … et ' + (changes.length - 30) + ' autres');

  var totalAvant = changes.reduce(function (s, c) { return s + c.avant; }, 0);
  var totalApres = changes.reduce(function (s, c) { return s + c.apres; }, 0);
  console.log('  écart cumulé sur ces fiches : ' + (totalApres - totalAvant).toFixed(2) + ' €');

  if (!ecrire) { console.log('\n  (aperçu seulement — relancer avec --ecrire pour appliquer)'); return 0; }

  /* On préserve la mise en forme du fichier : 2 espaces, saut de ligne final. */
  fs.writeFileSync(FICHIER, JSON.stringify(brut, null, 2) + '\n');

  /* ⚠️ On RELIT. Un message de succès ne prouve rien (E-206). */
  var relu = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  var arr2 = Array.isArray(relu) ? relu : (relu.products || relu.items || []);
  var reste = 0;
  arr2.forEach(function (p) {
    if (typeof p.price_ht !== 'number' || typeof p.vat !== 'number' || typeof p.price !== 'number') return;
    if (Math.abs(Math.round(p.price_ht * (1 + p.vat) * 100) / 100 - p.price) > TOLERANCE) reste++;
  });
  console.log('\n  écrit puis RELU : ' + reste + ' écart(s) restant(s)'
    + (reste ? '  ❌' : '  ✅'));
  return reste ? 1 : 0;
}

process.exit(main());
