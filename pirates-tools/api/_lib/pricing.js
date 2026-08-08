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

// ── Supplément COFFRET TSTAK ──────────────────────────────────────────────
// Le prix affiché = SANS coffret (outil dans un carton simple). Option « avec
// coffret » = surcoût d'envoi La Poste Outre-mer dû au volume/poids du coffret
// (le coffret vient avec l'outil, il n'est pas racheté). 2 paliers selon le
// poids de l'outil. ⚠️ MIROIR de app.js (calcLocalPrice/coffret) — garder
// identique. Modifiable ici (tarif La Poste OM à confirmer par l'user).
// Éligible : machines (ncCategory 'power_tool') uniquement.
var COFFRET = { petit: 15, gros: 25, heavyKg: 3 };

/* ══ LE COFFRET A UN POIDS, ET DEUX FORMATS — RÈGLE DE L'USER, 08/08/2026 ═══
   Mot pour mot : « il y a deux formats de coffret, un gros et un petit ; le
   petit pèse environ 0,5 kg et le gros environ 1,3 kg ; dans les gros coffrets
   il n'y a que des circulaires ou des défonceuses avec accessoires (kit), ou
   alors s'il y a trois machines c'est un gros coffret […] toujours un maximum
   de deux machines par coffret ».

   ⛔ CE QUI TOURNAIT AVANT N'ÉTAIT PAS CETTE RÈGLE, et il la croyait appliquée.
   Mesuré le 08/08 : le palier se choisissait sur le POIDS DE L'OUTIL (≥ 3 kg),
   pas sur son TYPE — 62 fiches sur 1321 éligibles tombaient en « gros ». Et le
   poids du coffret n'était ajouté nulle part : `weight_kg` restait le poids de
   l'outil même quand le client cochait « avec coffret ».

   ⚠️ `weight_kg` EST LE POIDS DE L'OUTIL SEUL. C'est la deuxième moitié de sa
   consigne — « sans la mallette il pèse bien ce poids-là, le poids doit
   augmenter si on utilise le switch avec coffret ». Le poids expédié se
   CALCULE donc, il ne se stocke pas : une fiche ne peut pas porter deux poids.

   ⛔ TOUT CE BLOC EST MIROIR DE `app.js` — le prix AFFICHÉ doit rester
   exactement celui DÉBITÉ (porte J4). Une divergence ici n'est pas un écart
   d'arrondi, c'est une pratique commerciale trompeuse. */
var COFFRET_KG = { petit: 0.5, gros: 1.3 };

/* Le gros coffret se lit sur le TYPE d'outil, pas sur son poids. Trois cas, et
   ce sont EXACTEMENT les trois que l'user a nommés.

   ⚠️ ① « CIRCULAIRES » — pas la famille « Scies » entière : une sauteuse ou une
      sabre n'en sont pas, il a dit « circulaires ».
   ⚠️ ② « DÉFONCEUSES AVEC ACCESSOIRES (KIT) » — pas toute défonceuse. Première
      version mesurée : viser la famille « Défonceuses » faisait basculer 73
      fiches, dont des AFFLEUREUSES nues, qui tiennent dans un petit coffret.
      C'est le mot « kit » de sa phrase qui fait la différence, pas la famille.
   ⚠️ ③ « OU ALORS S'IL Y A TROIS MACHINES » — le nombre d'outils est annoncé
      dans le titre des packs (« Kit 5 outils »). */
var COFFRET_CIRCULAIRE = /\bscies?\s+circulaires?\b/i;
var COFFRET_DEFONCEUSE = /\bd[ée]fonceuses?\b|\baffleureuses?\b/i;
var COFFRET_KIT = /\bkits?\b|\bsets?\b|\bavec\s+accessoires?\b|\bcoffret\s+d[eu]\s+\d/i;
var COFFRET_NB_OUTILS = /(\d+)\s*(?:outils?|machines?)\b/i;
function coffretNbOutils(product) {
  var m = String((product && product.title) || '').match(COFFRET_NB_OUTILS);
  return m ? Number(m[1]) : 0;
}
function coffretGros(product) {
  if (!coffretEligible(product)) return false;
  var titre = String((product && product.title) || '');
  var texte = titre + ' ' + String((product && product.category) || '');
  if (COFFRET_CIRCULAIRE.test(texte)) return true;                       // ①
  if (COFFRET_DEFONCEUSE.test(texte) && COFFRET_KIT.test(titre)) return true;  // ②
  return coffretNbOutils(product) >= 3;                                  // ③
}
/* Poids réellement expédié : l'outil, plus le coffret quand le client le prend.
   ⛔ Sert au PORT, donc au prix : un poids sous-estimé fait un port sous-estimé,
   et la marge part avec. */
function poidsExpedieKg(product, avecCoffret) {
  var w = Number(product && product.weight_kg) || 0;
  if (!avecCoffret || !coffretEligible(product)) return w;
  return Math.round((w + (coffretGros(product) ? COFFRET_KG.gros : COFFRET_KG.petit)) * 1000) / 1000;
}
// Exclut ce qui n'est pas une machine (batterie/chargeur/accessoire/rangement/
// consommable). Décision user 25/07 : les PACKS/COMBOS ont AUSSI l'option
// (prix affiché = sans coffret, +15/25 € = surcoût d'envoi si coffret voulu)
// → 'combo|pack' retirés de la denylist. \b OBLIGATOIRES : sans eux « lame »
// matchait « Lamelleuses » et privait ces machines du switch (bug corrigé).
var COFFRET_DENY = /\b(batteries?|chargeurs?|accessoires?|rangements?|lames?|forets?|consommables?|coffrets?|mallettes?)\b/i;
function coffretEligible(product) {
  // coffretIncluded : produit DÉJÀ vendu en coffret/valise (ex. DJR360ZK) →
  // pas de switch « Sans/Avec coffret » (ni de surcoût forçable côté serveur).
  return !!(product && product.ncCategory === 'power_tool'
    && !product.coffretIncluded
    && !COFFRET_DENY.test(product.category || ''));
}
function coffretSurchargeCents(product) {
  if (!coffretEligible(product)) return 0;
  /* ⛔ LE PALIER SUIT LE TYPE D'OUTIL DEPUIS LE 08/08/2026, plus son poids.
     Avant : `weight_kg >= 3`. Cette ligne-là ne venait d'aucune décision de
     l'user — c'était un proxy, et il ne recouvrait pas sa règle. */
  var eur = coffretGros(product) ? COFFRET.gros : COFFRET.petit;
  return Math.round(eur * 100);
}

module.exports = {
  TERRITORIES: TERRITORIES,
  TAX_RULES_BY_NC: TAX_RULES_BY_NC,
  DEFAULT_TERRITORY: DEFAULT_TERRITORY,
  COFFRET: COFFRET,
  getTerritory: getTerritory,
  taxRatesFor: taxRatesFor,
  calcPrice: calcPrice,
  unitCents: unitCents,
  coffretEligible: coffretEligible,
  coffretSurchargeCents: coffretSurchargeCents,
  COFFRET_DENY: COFFRET_DENY,
  COFFRET_KG: COFFRET_KG,
  coffretGros: coffretGros,
  coffretNbOutils: coffretNbOutils,
  poidsExpedieKg: poidsExpedieKg
};
