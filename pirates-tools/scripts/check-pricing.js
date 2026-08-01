/* =========================================================
   check-pricing.js — Guards the server price engine.

   The amount charged is computed by api/_lib/pricing.js, which is a hand-kept
   mirror of the taxation engine in app.js. This check asserts the server engine
   against golden TTC values derived by hand from the published DOM-TOM rates
   (price_ht = 100 €). If a rate changes in pricing.js without the golden values
   being updated — and, by extension, without app.js being kept in sync — CI
   fails. Keeps "displayed price == charged price" from silently regressing.
========================================================= */
'use strict';

module.exports = function checkPricing() {
  var errors = [];
  var pricing;
  try {
    pricing = require('../api/_lib/pricing');
  } catch (e) {
    return ['[check-pricing] Impossible de charger api/_lib/pricing.js : ' + (e && e.message)];
  }

  // Golden TTC for a product with price_ht = 100 €.
  // ttc = 100 × (1 + octroiExterne + octroiRegional) × (1 + tva)
  var CASES = [
    // power_tool (territory defaults)
    { nc: 'power_tool', code: '971', ttc: 118.8075 },
    { nc: 'power_tool', code: '972', ttc: 118.8075 },
    { nc: 'power_tool', code: '973', ttc: 110.00 },   // TVA 0
    { nc: 'power_tool', code: '974', ttc: 116.6375 },
    { nc: 'power_tool', code: '976', ttc: 100.00 },   // fully exempt
    // hand_tool (NC override)
    { nc: 'hand_tool',  code: '971', ttc: 116.6375 },
    { nc: 'hand_tool',  code: '974', ttc: 115.01 },
    // accessory (NC override)
    { nc: 'accessory',  code: '971', ttc: 115.01 },
    { nc: 'accessory',  code: '973', ttc: 106.00 },
    // consumable (NC override)
    { nc: 'consumable', code: '971', ttc: 113.3825 },
    { nc: 'consumable', code: '976', ttc: 100.00 }
  ];

  var EPS = 1e-6;
  CASES.forEach(function (c) {
    var product = { price_ht: 100, ncCategory: c.nc };
    var got = pricing.calcPrice(product, c.code).ttc;
    if (Math.abs(got - c.ttc) > EPS) {
      errors.push('[check-pricing] ' + c.nc + '/' + c.code +
        ' : attendu TTC ' + c.ttc.toFixed(4) + ' € mais obtenu ' + got.toFixed(4) + ' €');
    }
    // Per-unit cents rounding must match too (this is what the payment provider is charged).
    var expectedCents = Math.round(c.ttc * 100);
    var gotCents = pricing.unitCents(product, c.code);
    if (gotCents !== expectedCents) {
      errors.push('[check-pricing] ' + c.nc + '/' + c.code +
        ' : cents attendus ' + expectedCents + ' mais obtenus ' + gotCents);
    }
  });

  // price_ht must be derivable from price/vat when price_ht is absent.
  var derived = pricing.calcPrice({ price: 120, vat: 0.2, ncCategory: 'power_tool' }, '976').ttc;
  if (Math.abs(derived - 100) > EPS) {
    errors.push('[check-pricing] dérivation HT depuis price/vat cassée : attendu 100 €, obtenu ' + derived.toFixed(4));
  }

  /* ═══ UN RÉGLAGE ENREGISTRÉ L'EMPORTE SUR UN DÉFAUT ═══════════════════════
     Défaut trouvé le 01/08/2026, sur le chemin de l'argent, et invisible :
     le modèle lit `commissionPct` en priorité et `stripePct` en repli, mais
     `DEFAULT_CONFIG` définit déjà `commissionPct` — le repli ne servait donc
     JAMAIS. Le taux enregistré par l'admin sous l'ancien nom était ignoré en
     silence : 1,5 % saisi, 2,8 % appliqué, soit 6,11 € de commission au lieu
     de 2,91 € sur un outil à 211 €.

     ⚠️ Le bouton EXISTAIT et ne faisait rien — la pire forme de réglage.
     Ce contrôle rejoue la fusion telle que `pricing-config.load()` la fait. */
  var model = require('../api/_lib/pricing-model');
  var pcfg = require('../api/_lib/pricing-config');

  /* ⚠️ ON APPELLE LA FONCTION DE PRODUCTION, pas une jumelle.
     Premier jet : ce contrôle réécrivait la fusion de son côté. Sabotage du
     VRAI `pricing-config.js` → la porte restait VERTE. Une porte qui teste
     une copie ne protège que la copie (erreur O6). */
  function fusionner(enBase) {
    return pcfg.fusionner(model.DEFAULT_CONFIG, enBase);
  }
  function commissionPour(enBase) {
    var prod = { weight_kg: 2.7, ncCategory: 'power_tool' };
    var r = model.recommend(prod, { costHT: 100 }, fusionner(enBase));
    return r ? r.commission : null;
  }

  var ancienNom = commissionPour({ stripePct: 0.015, stripeFix: 0.25 });
  var nouveauNom = commissionPour({ commissionPct: 0.015, commissionFix: 0.25 });
  var defaut = commissionPour({});

  if (!(ancienNom < defaut - 0.5)) {
    errors.push('[check-pricing] ⛔ un taux de commission enregistré sous `stripePct` est IGNORÉ : '
      + 'commission ' + Number(ancienNom).toFixed(2) + ' € alors que la valeur par défaut en donne '
      + Number(defaut).toFixed(2) + ' €. Le réglage admin ne fait rien, et les prix sont calculés '
      + 'sur une hypothèse que personne n\'a choisie.');
  }
  if (!(nouveauNom < defaut - 0.5)) {
    errors.push('[check-pricing] ⛔ un taux enregistré sous `commissionPct` est IGNORÉ — '
      + Number(nouveauNom).toFixed(2) + ' € contre ' + Number(defaut).toFixed(2) + ' € par défaut.');
  }
  // Les DEUX noms doivent donner le même prix : sinon le tarif dépend du nom
  // sous lequel il a été enregistré, ce qui est indéfendable.
  if (Math.abs(Number(ancienNom) - Number(nouveauNom)) > 0.01) {
    errors.push('[check-pricing] ⛔ le même taux donne deux commissions différentes selon son NOM : '
      + Number(ancienNom).toFixed(2) + ' € (stripePct) contre ' + Number(nouveauNom).toFixed(2) + ' € (commissionPct).');
  }
  // Et les deux noms doivent être enregistrables, sinon le réglage est mort-né.
  ['stripePct', 'stripeFix', 'commissionPct', 'commissionFix'].forEach(function (k) {
    var patch = {}; patch[k] = 0.011;
    if (pcfg.sanitize(patch)[k] === undefined) {
      errors.push('[check-pricing] ⛔ `' + k + '` n\'est pas enregistrable : l\'admin ne peut pas régler la commission sous ce nom.');
    }
  });

  return errors;
};
