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
    // Per-unit cents rounding must match too (this is what Stripe is charged).
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

  return errors;
};
