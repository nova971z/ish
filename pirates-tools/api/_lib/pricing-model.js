// api/_lib/pricing-model.js — Moteur de TARIFICATION (marge cible), côté serveur.
//
// Rôle : à partir du COÛT fournisseur + du POIDS d'un produit, calcule le
// `price_ht` (base métropole) qui garantit une marge NETTE cible APRÈS IS,
// une fois TOUT payé : transport (Colissimo ou container), octroi de mer (payé
// à l'import, non récupérable), frais Stripe, emballage, quote-part de frais
// fixes annuels (CFE + assurance, sans comptable). Client = 0 à l'arrivée (DDP).
//
// ⚠️ Ce module NE lit ni n'écrit rien : il est PUR (config injectée). Le calcul
// des taxes territoriales (octroi/TVA) reste délégué à pricing.js (source unique).
// Vérifié par scripts/check-pricing-model.js.

'use strict';

var pricing = require('./pricing');

// Réglages par défaut. Destinés à être surchargés par la config admin (Firestore
// `pricing_config`). Tous vérifiables sur les sites officiels (douane.gouv,
// impots.gouv, laposte.fr). À réviser en janvier (loi de finances + tarifs annuels).
var DEFAULT_CONFIG = {
  refTerritory: '971',        // territoire de référence pour le pricing (où tu importes/vends)
  tvaFR: 0.20,                // TVA France récupérée (coût réel = TTC cotébrico / 1,20)
  is: 0.15,                   // impôt sociétés (≤ 42 500 € bénéfice ; 0,25 au-delà)
  targetNet: 0.15,            // marge NETTE cible APRÈS IS
  stripePct: 0.015,
  stripeFix: 0.25,
  packaging: 0.5,             // emballage (carton/bulles récupérés)
  fixedAnnual: 1000,          // CFE + assurance + banque (sans comptable), €/an
  ordersPerYear: 400,         // pour répartir les frais fixes par commande
  // Lettre suivie Outre-mer pour les petits objets légers (≤ 500 g) : ~8 €,
  // bien moins cher que le Colissimo minimum. Prioritaire sous le seuil de poids.
  lettre: { maxKg: 0.5, price: 8 },
  // Grille Colissimo Outre-mer OM1 (poids max kg → prix €). Points 5 kg et 30 kg
  // officiels 2026 ; intermédiaires estimés (à confirmer sur laposte.fr).
  colissimo: [[0.5,14],[1,17],[2,23],[3,33],[5,38.90],[10,64],[15,88],[30,143.02]],
  // Coût logistique par unité en import CONTAINER (groupage LCL réparti).
  containerPerUnit: { nu: 5.3, coffret: 29 }
};

function round2(n) { return Math.round(n * 100) / 100; }

// Coût du transport Colissimo pour un poids (kg), depuis la grille.
function colissimoCost(weightKg, grid) {
  grid = grid || DEFAULT_CONFIG.colissimo;
  for (var i = 0; i < grid.length; i++) {
    if (weightKg <= grid[i][0]) return grid[i][1];
  }
  return grid[grid.length - 1][1];
}

// Quote-part de frais fixes par commande.
function fixedPerOrder(cfg) {
  return (cfg.ordersPerYear > 0) ? (cfg.fixedAnnual / cfg.ordersPerYear) : 0;
}

// Taux d'octroi (externe+régional) applicable au produit sur le territoire de réf.
// Réutilise pricing.js (barème par ncCategory) → PAS de doublon de taux.
function octroiRate(product, cfg) {
  var r = pricing.taxRatesFor(product || {}, cfg.refTerritory);
  return r.octroiExterne + r.octroiRegional;
}
function tvaDomRate(cfg) {
  var t = pricing.getTerritory(cfg.refTerritory) || pricing.getTerritory('971');
  return t.tvaRate;
}

// Résultat économique pour un markup donné.
// costHT = coût réel HT (TVA FR récupérée). ship = transport €. octroi = taux.
function evaluate(costHT, markup, ship, octroi, tvaDom, cfg) {
  var priceHt = costHT * (1 + markup);
  var ttc = priceHt * (1 + octroi) * (1 + tvaDom);
  var revenueHT = priceHt * (1 + octroi);            // octroi = revenu (payé à l'import)
  var stripe = ttc * cfg.stripePct + cfg.stripeFix;
  var octroiPaid = octroi * (costHT + ship);          // à l'import, non récupérable
  var costs = costHT + ship + octroiPaid + stripe + cfg.packaging + fixedPerOrder(cfg);
  var netOp = revenueHT - costs;
  var netAfterIS = netOp * (1 - cfg.is);
  return {
    markup: markup, priceHt: round2(priceHt), ttc: round2(ttc),
    transport: round2(ship), octroiPaid: round2(octroiPaid), stripe: round2(stripe),
    fixed: round2(cfg.packaging + fixedPerOrder(cfg)),
    is: round2(netOp * cfg.is), netOp: round2(netOp),
    netAfterIS: round2(netAfterIS),
    marginAfterIS: revenueHT > 0 ? netAfterIS / revenueHT : 0
  };
}

// Markup minimal (pas de 0,1 %) atteignant la marge cible après IS.
function solveMarkup(costHT, ship, octroi, tvaDom, cfg) {
  for (var m = 0.02; m <= 3; m += 0.001) {
    if (evaluate(costHT, m, ship, octroi, tvaDom, cfg).marginAfterIS >= cfg.targetNet) return m;
  }
  return 3;
}

// API principale : prix recommandé pour un produit.
//   product : { weight_kg, ncCategory, variantRole, ... }
//   opts.costHT (prioritaire) OU opts.costTTC (÷ tvaFR) = coût fournisseur
//   opts.mode : 'colissimo' | 'container'
function recommend(product, opts, config) {
  var cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
  opts = opts || {};
  var costHT = (opts.costHT != null)
    ? Number(opts.costHT)
    : Number(opts.costTTC || 0) / (1 + cfg.tvaFR);
  if (!(costHT > 0)) return null;

  var weight = Number(product && product.weight_kg) || 2;
  var mode = opts.mode || 'colissimo';
  var isCoffret = (product && (product.variantRole === 'coffret' || /coffret|makpac|tstak|valise/i.test(product.title || '')));
  var ship, shipKind;
  if (mode === 'container') {
    ship = isCoffret ? cfg.containerPerUnit.coffret : cfg.containerPerUnit.nu;
    shipKind = 'container';
  } else if (cfg.lettre && weight <= cfg.lettre.maxKg) {
    // Petit objet léger → lettre suivie (~8 €), bien moins cher que Colissimo.
    ship = cfg.lettre.price;
    shipKind = 'lettre';
  } else {
    ship = colissimoCost(weight, cfg.colissimo);
    shipKind = 'colissimo';
  }

  var octroi = octroiRate(product, cfg);
  var tvaDom = tvaDomRate(cfg);
  var m = solveMarkup(costHT, ship, octroi, tvaDom, cfg);
  var r = evaluate(costHT, m, ship, octroi, tvaDom, cfg);
  r.costHT = round2(costHT);
  r.priceHtFor = { price_ht: r.priceHt, price: round2(r.priceHt * (1 + cfg.tvaFR)) };
  r.mode = mode;
  r.shipKind = shipKind;
  r.weight = weight;
  return r;
}

module.exports = {
  DEFAULT_CONFIG: DEFAULT_CONFIG,
  colissimoCost: colissimoCost,
  recommend: recommend,
  evaluate: evaluate,
  solveMarkup: solveMarkup,
  _round2: round2
};
