// api/_lib/pricing.js — Server-authoritative price engine (DOM-TOM taxation).
//
// ⚠️ SOURCE OF TRUTH SHARED WITH THE CLIENT.
// This is an exact port of the taxation engine in app.js (search "Territory
// taxation engine"). The two MUST stay byte-for-byte equivalent in their rates
// and formula, otherwise the amount displayed to the customer would differ from
// the amount charged. If you change a rate here, change it in app.js and vice
// versa. Covered by scripts/check-pricing-parity.js.
//
// Formula (additive octroi on the HT price, then TVA):
//   prixTTC = prixHT × (1 + octroiExterne + octroiRegional) × (1 + tva)

'use strict';

var TERRITORIES = [
  { code: '971', name: 'Guadeloupe', tvaRate: 0.085, octroiExterne: 0.07,  octroiRegional: 0.025 },
  { code: '972', name: 'Martinique', tvaRate: 0.085, octroiExterne: 0.07,  octroiRegional: 0.025 },
  { code: '973', name: 'Guyane',     tvaRate: 0.0,   octroiExterne: 0.075, octroiRegional: 0.025 },
  { code: '974', name: 'La Réunion', tvaRate: 0.085, octroiExterne: 0.05,  octroiRegional: 0.025 },
  { code: '976', name: 'Mayotte',    tvaRate: 0.0,   octroiExterne: 0.0,   octroiRegional: 0.0  }
];

var TAX_RULES_BY_NC = {
  power_tool: {},
  hand_tool: {
    '971': { octroiExterne: 0.05,  octroiRegional: 0.025 },
    '972': { octroiExterne: 0.05,  octroiRegional: 0.025 },
    '973': { octroiExterne: 0.05,  octroiRegional: 0.025 },
    '974': { octroiExterne: 0.035, octroiRegional: 0.025 },
    '976': { octroiExterne: 0.0,   octroiRegional: 0.0 }
  },
  accessory: {
    '971': { octroiExterne: 0.04, octroiRegional: 0.02 },
    '972': { octroiExterne: 0.04, octroiRegional: 0.02 },
    '973': { octroiExterne: 0.04, octroiRegional: 0.02 },
    '974': { octroiExterne: 0.03, octroiRegional: 0.02 },
    '976': { octroiExterne: 0.0,  octroiRegional: 0.0 }
  },
  consumable: {
    '971': { octroiExterne: 0.03, octroiRegional: 0.015 },
    '972': { octroiExterne: 0.03, octroiRegional: 0.015 },
    '973': { octroiExterne: 0.03, octroiRegional: 0.015 },
    '974': { octroiExterne: 0.02, octroiRegional: 0.015 },
    '976': { octroiExterne: 0.0,  octroiRegional: 0.0 }
  }
};

var DEFAULT_TERRITORY = '971';

function getTerritory(code) {
  code = code || DEFAULT_TERRITORY;
  for (var i = 0; i < TERRITORIES.length; i++) {
    if (TERRITORIES[i].code === code) return TERRITORIES[i];
  }
  return null;
}

function taxRatesFor(product, territoryCode) {
  var t = getTerritory(territoryCode) || getTerritory(DEFAULT_TERRITORY);
  var nc = (product && product.ncCategory) || 'power_tool';
  var override = (TAX_RULES_BY_NC[nc] && TAX_RULES_BY_NC[nc][t.code]) || null;
  return {
    tva: t.tvaRate,
    octroiExterne: override ? override.octroiExterne : t.octroiExterne,
    octroiRegional: override ? override.octroiRegional : t.octroiRegional
  };
}

function calcPrice(product, territoryCode) {
  if (!product) return { ht: 0, octroi: 0, tva: 0, ttc: 0, rates: null };
  var ht = Number(product.price_ht != null
    ? product.price_ht
    : (product.price / (1 + (product.vat || 0.2))));
  var r = taxRatesFor(product, territoryCode);
  var afterOctroi = ht * (1 + r.octroiExterne + r.octroiRegional);
  var octroi = afterOctroi - ht;
  var ttc = afterOctroi * (1 + r.tva);
  var tva = ttc - afterOctroi;
  return { ht: ht, octroi: octroi, tva: tva, ttc: ttc, rates: r };
}

// Unit price in integer cents for a given territory.
// Rounding is applied PER UNIT (same as the client), so line = unitCents × qty
// and the summed total is identical on both sides — no fractional-cent drift.
function unitCents(product, territoryCode) {
  return Math.round(calcPrice(product, territoryCode).ttc * 100);
}

module.exports = {
  TERRITORIES: TERRITORIES,
  TAX_RULES_BY_NC: TAX_RULES_BY_NC,
  DEFAULT_TERRITORY: DEFAULT_TERRITORY,
  getTerritory: getTerritory,
  taxRatesFor: taxRatesFor,
  calcPrice: calcPrice,
  unitCents: unitCents
};
