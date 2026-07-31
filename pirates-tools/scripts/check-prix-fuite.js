/* check-prix-fuite.js — LE PRIX D'ACHAT NE DOIT JAMAIS SORTIR.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE
   Découvert le 31/07/2026 : **3 fiches de `products.json` portaient
   `priceSrcTTC`**, le prix d'achat fournisseur relevé par le traqueur. Or ce
   fichier est SERVI PUBLIQUEMENT — n'importe qui le télécharge à la racine du
   site. Sur l'une d'elles : vendu 522,80 €, coût d'achat 454,62 € en clair.
   La marge exacte était lisible par tout concurrent.

   L'endpoint `/api/products` retirait bien ces champs (`PRIVATE_FIELDS` dans
   api/_lib/catalog.js) — mais **rien ne surveillait le fichier statique**. La
   protection existait sur une seule des deux sources.

   ⚠️ CE DÉFAUT EST IRRÉVERSIBLE une fois publié : le fichier part sur le CDN,
   puis reste dans l'historique git. On ne peut pas « dé-publier » un prix
   d'achat. D'où une porte qui refuse AVANT la livraison, jamais après.

   ⛔ Ce contrôle ne se contente pas des noms connus : il refuse aussi tout
   champ dont le nom trahit un coût ou une marge. Un champ inventé demain
   (`coutAchat`, `margeNette`…) serait sinon publié sans que rien ne bronche.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

/* Les champs internes connus — la même liste que api/_lib/catalog.js. */
var INTERNES = ['priceSource', 'priceSrcTTC', 'priceCheckedAt', 'priceMarkup',
  'priceMode', 'priceRecomputedAt', 'priceCostOrigin', 'hidden'];

/* Le filet large : tout nom de champ qui sent le coût ou la marge. */
var SUSPECT = /(cout|cost|achat|purchase|marge|margin|markup|fournisseur|supplier|wholesale|src.?ttc|src.?ht)/i;

/* Ce qui est légitimement public malgré le motif ci-dessus. */
var TOLERE = ['price', 'price_ht', 'priceLocked', 'currency', 'vat', 'srcAltSkus'];

module.exports = function () {
  var errors = [];
  var brut;
  try {
    brut = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'products.json'), 'utf8'));
  } catch (e) {
    return ['[check-prix-fuite] products.json illisible : ' + (e && e.message)];
  }
  var arr = Array.isArray(brut) ? brut : (brut.products || brut.items || []);
  if (!arr.length) return ['[check-prix-fuite] catalogue vide — le contrôle n\'a rien vérifié.'];

  var trouves = {};
  arr.forEach(function (p) {
    Object.keys(p).forEach(function (k) {
      var interdit = INTERNES.indexOf(k) !== -1
        || (SUSPECT.test(k) && TOLERE.indexOf(k) === -1);
      if (!interdit) return;
      if (!trouves[k]) trouves[k] = [];
      if (trouves[k].length < 5) trouves[k].push(p.sku || p.id || '?');
    });
  });

  var noms = Object.keys(trouves);
  if (noms.length) {
    errors.push('[check-prix-fuite] ⛔ `products.json` est SERVI PUBLIQUEMENT et contient '
      + 'des champs internes :\n    '
      + noms.map(function (k) {
          return k + '  (ex. ' + trouves[k].join(', ') + ')';
        }).join('\n    ')
      + '\n    Publier un prix d\'achat est IRRÉVERSIBLE : CDN, puis historique git. '
      + 'Retirer ces champs avant de livrer — l\'endpoint /api/products les filtre '
      + 'déjà (PRIVATE_FIELDS dans api/_lib/catalog.js), le fichier doit faire pareil.');
  }
  return errors;
};
