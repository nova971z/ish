/* check-prix-affiches.js — LE PRIX AFFICHÉ EST-IL CELUI QUI SERA DÉBITÉ ?
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE
   Mesuré le 31/07/2026 : **9 fiches sur 476** portaient un `price` qui ne
   correspondait pas à `price_ht × (1 + vat)`. Un centime d'écart, toujours dans
   le même sens — l'affichage annonçait moins que ce qui serait prélevé.

   Ce n'est pas un détail cosmétique. `api/_lib/pricing.js` calcule le montant
   débité À PARTIR DE `price_ht`, puis applique le taux du territoire de
   livraison. Le champ `price` ne sert QU'À AFFICHER. Les deux peuvent donc
   diverger sans que rien ne le dise, et c'est le client qui découvre l'écart
   au moment de payer.

   ⚠️ J4 — le prix annoncé doit être exact et complet. Un affichage qui ment
   d'un centime reste un affichage qui ment ; la règle ne prévoit pas de seuil
   de tolérance. Source à vérifier : economie.gouv.fr → information sur les prix.

   CE QUE LE CONTRÔLE EXIGE
     · `price` = arrondi au centime de `price_ht × (1 + vat)` ;
     · les trois champs présents et numériques ;
     · aucun prix négatif ou nul sur un produit vendable.

   ⚠️ Le taux de TVA de la FICHE (`vat`) est le taux métropole de référence. Le
   taux réellement appliqué dépend du TERRITOIRE DE LIVRAISON et se calcule
   côté serveur, à partir du code postal (jamais d'un champ déclaré). Ce
   contrôle vérifie la cohérence de l'AFFICHAGE, pas la fiscalité — celle-ci
   est couverte par check-pricing.js et audit/p5-money.js.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

var TOLERANCE = 0.005;   // un demi-centime : l'arrondi, rien de plus

module.exports = function () {
  var errors = [];
  var brut;
  try {
    brut = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'products.json'), 'utf8'));
  } catch (e) {
    return ['[check-prix-affiches] products.json illisible : ' + (e && e.message)];
  }
  var arr = Array.isArray(brut) ? brut : (brut.products || brut.items || []);
  if (!arr.length) return ['[check-prix-affiches] catalogue vide — le contrôle n\'a rien vérifié.'];

  var incoherents = [];
  arr.forEach(function (p) {
    var ref = p.sku || p.id || '(sans réf)';

    if (typeof p.price_ht !== 'number' || typeof p.vat !== 'number' || typeof p.price !== 'number') {
      errors.push('[check-prix-affiches] ' + ref + ' : price / price_ht / vat doivent être '
        + 'des nombres. Sans les trois, on ne peut PAS prouver que l\'affiché égale le débité.');
      return;
    }
    if (p.price_ht <= 0 || p.price <= 0) {
      errors.push('[check-prix-affiches] ' + ref + ' : prix nul ou négatif (' + p.price + ' TTC).');
      return;
    }
    var attendu = Math.round(p.price_ht * (1 + p.vat) * 100) / 100;
    if (Math.abs(attendu - p.price) > TOLERANCE) {
      incoherents.push(ref + ' : affiché ' + p.price.toFixed(2)
        + ' € mais price_ht ' + p.price_ht.toFixed(2) + ' × ' + (1 + p.vat)
        + ' = ' + attendu.toFixed(2) + ' €');
    }
  });

  if (incoherents.length) {
    errors.push('[check-prix-affiches] ' + incoherents.length + ' fiche(s) affichent un prix '
      + 'QUI N\'EST PAS celui que le serveur débitera. Le montant prélevé est calculé '
      + 'depuis `price_ht` (api/_lib/pricing.js) ; `price` n\'est qu\'un affichage. '
      + 'Corriger `price`, jamais `price_ht`.\n    ' + incoherents.slice(0, 12).join('\n    ')
      + (incoherents.length > 12 ? '\n    … et ' + (incoherents.length - 12) + ' autres' : ''));
  }
  return errors;
};
