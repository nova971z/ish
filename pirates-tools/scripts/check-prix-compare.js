/* check-prix-compare.js — ON NE COMPARE JAMAIS CONTRE UN PRIX QU'ON A INVENTÉ.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ LA PRATIQUE QUE CETTE PORTE FERME, mesurée le 15/08/2026 sur le
   catalogue entier :
     · 1 708 fiches sur 1 708 affichaient « Prix moyen local » + « Économisez
       X % » ;
     · 10 seulement s'appuyaient sur un relevé réel en magasin (QEGS /
       BricoBrico, Jarry, 24/07/2026) ;
     · 1 698 s'appuyaient sur `prix HT × 1,60` — un nombre calculé depuis NOTRE
       propre prix et présenté au client comme le prix pratiqué autour de lui ;
     · l'économie annoncée valait 25 % partout, et pour cause : avec
       ttc ≈ ht × 1,2 et local = ht × 1,6, (1,6 − 1,2) / 1,6 = 25 %. Ce n'était
       pas une bonne affaire, c'était une identité algébrique.

   ⛔ J4 — annoncer une réduction contre un prix de référence fabriqué est une
   pratique commerciale trompeuse. Le registre l'écrit déjà pour le « prix
   conseillé » gonflé (D-004) ; une estimation maison est pire : aucun tiers ne
   l'énonce. Le risque ne se voit à AUCUNE exécution — pas d'exception, pas de
   test rouge, rien. D'où cette porte, qui lit la source.

   ⚠️ CE QU'ELLE NE FAIT PAS : juger les relevés eux-mêmes. Un relevé faux
   reste faux ; elle garantit seulement qu'on ne compare QUE contre un relevé.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

module.exports = function () {
  var errors = [];
  var f = path.join(RACINE, 'app.js');
  if (!fs.existsSync(f)) {
    errors.push('[check-prix-compare] ⛔ app.js introuvable : impossible de vérifier '
      + 'd\'où vient le prix de comparaison.');
    return errors;
  }
  var src = fs.readFileSync(f, 'utf8');

  /* ⛔ PRÉALABLE — sans la fonction, la porte ne vérifie rien et se tairait.
     Une condition sans laquelle le contrôle est vide DOIT échouer. */
  var i = src.indexOf('function calcLocalPrice');
  if (i < 0) {
    errors.push('[check-prix-compare] ⛔ `calcLocalPrice` a disparu d\'app.js. Le bandeau '
      + 'de comparaison a peut-être changé de nom : cette porte ne garde plus rien tant '
      + 'qu\'elle n\'est pas rebranchée sur la nouvelle fonction.');
    return errors;
  }
  var corps = src.slice(i, i + 1200);
  var fin = corps.indexOf('\n  }');
  if (fin > 0) corps = corps.slice(0, fin);

  /* ① AUCUN FACTEUR MULTIPLICATIF sur notre propre prix. C'est la forme exacte
     du défaut : `ht * 1.60`. On refuse toute multiplication du prix par une
     constante dans cette fonction — c'est la seule façon de fabriquer un
     concurrent à partir de soi-même. */
  var inventes = corps.match(/(price|ht|ttc)\s*\*\s*[\d.]+|[\d.]+\s*\*\s*(price|ht|ttc)/gi);
  if (inventes) {
    errors.push('[check-prix-compare] ⛔ `calcLocalPrice` fabrique un prix concurrent en '
      + 'multipliant NOTRE prix : ' + inventes.join(', ') + '. C\'est le défaut du '
      + '15/08/2026 — 1 698 fiches annonçaient « Économisez 25 % » contre un nombre '
      + 'inventé. J4 : pratique commerciale trompeuse. Pas de relevé ⇒ pas de bandeau.');
  }

  /* ② LE SILENCE DOIT RESTER POSSIBLE. Si la fonction ne peut pas rendre 0,
     le bandeau s'affiche toujours, donc il ment toujours quelque part. */
  if (!/return\s+LOCAL_PRICES\[[^\]]+\]\s*\|\|[^;]*\|\|\s*0;/.test(corps)) {
    errors.push('[check-prix-compare] ⛔ `calcLocalPrice` ne rend plus 0 quand aucun relevé '
      + 'n\'existe. Sans ce zéro, le bandeau « Prix moyen local » s\'affiche sur des fiches '
      + 'sans relevé — c\'est-à-dire sur presque toutes.');
  }

  /* ③ L'APPELANT DOIT SE TAIRE SUR 0. Une fonction honnête et un appelant qui
     affiche quand même laisseraient le mensonge en place. */
  var j = src.indexOf('function localPriceComparison');
  if (j < 0) {
    errors.push('[check-prix-compare] ⛔ `localPriceComparison` a disparu : la porte ne peut '
      + 'plus vérifier que le bandeau se tait sans relevé.');
  } else {
    var app = src.slice(j, j + 900);
    if (!/if \(!\(local > 0\)/.test(app)) {
      errors.push('[check-prix-compare] ⛔ `localPriceComparison` n\'écarte plus le cas '
        + '« aucun relevé » (`local > 0`) : le bandeau s\'afficherait avec un prix nul ou '
        + 'inventé.');
    }
  }

  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-prix-compare : aucune économie annoncée contre un prix inventé');
}
