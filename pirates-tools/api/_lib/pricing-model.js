// api/_lib/pricing-model.js — Moteur de TARIFICATION (marge cible), côté serveur.
//
// Rôle : à partir du COÛT fournisseur + du POIDS d'un produit, calcule le
// `price_ht` (base métropole) qui garantit une marge NETTE cible APRÈS IS,
// une fois TOUT payé : transport (Colissimo ou container), octroi de mer (payé
// à l'import, non récupérable), frais du fournisseur, emballage, quote-part de frais
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
  /* COMMISSION D'ENCAISSEMENT — clés historiquement nommées « l'ancien fournisseur », gardées
     telles quelles parce qu'elles sont déjà écrites dans la config Firestore
     `pricing_config` : les renommer ferait retomber silencieusement sur les
     valeurs par défaut, donc changerait TOUS les prix sans que personne ne
     l'ait demandé. Le nom ment un peu, la valeur est juste. Renommage à
     l'étape 7 du plan Revolut, avec une migration explicite.

     ⚠️ VALEUR CHANGÉE LE 31/07/2026 — grille Revolut Business France, paiements
     EN LIGNE (relevée par l'user sur la page tarifs publique) :

       Visa / Mastercard  cartes conso nationales et européennes  1,0 % + 0,20 €
       Visa / Mastercard  cartes COMMERCIALES nationales          2,8 % + 0,20 €
       Visa / Mastercard  toutes cartes internationales           2,8 % + 0,20 €
       American Express   conso nationales                        1,7 % + 0,20 €
       American Express   commerciales / internationales          2,8 % + 0,20 €
       Revolut Pay personnel                                      1,0 % + 0,20 €
       Virement Open Banking              1,0 % + 0,20 € (plafonné à 5 €)
       Rétrofacturation contestée                                 15 €
       Remboursement                                       sans frais

     ⛔ ON RETIENT LE PLUS HAUT : 2,8 % + 0,20 €. Décision de l'user, et elle
     est plus fondée qu'il n'y paraît. Le vrai risque n'est PAS la carte
     internationale — c'est la carte COMMERCIALE NATIONALE, au même taux. Or les
     clients de Pirates Tools sont des ARTISANS : une carte professionnelle est
     leur moyen de paiement normal, pas une exception.

     Mesuré : coût 200 € HT, port 20 €, markup 45 %, Guadeloupe. Un prix calculé
     sur l'ancienne hypothèse de 1,5 % prévoit 5,42 € de commission ; une carte
     commerciale en prélève 9,85 €. 4,43 € perdus par vente, invisibles jusqu'au
     relevé bancaire.

     ⚠️ Le « 0,8 % + 0,02 € » affiché en tête de la page tarifs concerne les
     paiements EN PERSONNE (terminal). Il ne s'applique pas à une boutique en
     ligne : le minimum en ligne est 1,0 % + 0,20 €.

     Ce taux n'est pas gravé : il se corrige depuis la config admin, et la
     comptabilité lit de toute façon la commission RÉELLE de chaque vente
     (payments[].fees[]) — le compte de résultat reste exact même si ce chiffre
     vieillit. */
  /* ⚠️ DEUX NOMS ACCEPTÉS. `commissionPct`/`commissionFix` sont les noms
     courants depuis le 01/08/2026 ; `stripePct`/`stripeFix` sont ceux de la
     configuration DÉJÀ ENREGISTRÉE en base. Renommer sans lire l'ancien
     remettrait silencieusement la commission à sa valeur par défaut — donc
     fausserait tous les prix calculés. */
  commissionPct: 0.028,
  commissionFix: 0.20,
  packaging: 0.5,             // emballage (carton/bulles récupérés)
  /* ⚠️ ABONNEMENT DU FOURNISSEUR D'ENCAISSEMENT — 10 €/mois, soit 120 €/an
     (demande de l'user, 01/08/2026 : « il faut que ça comptabilise
     l'abonnement à dix euros par mois ainsi que les frais de vente »).
     Il est SÉPARÉ des autres frais fixes pour rester lisible et modifiable
     seul le jour où le tarif change. Les FRAIS DE VENTE, eux, ne sont pas
     estimés ici : chaque paiement porte sa commission RÉELLE, relue chez le
     fournisseur — voir `commissionPct` pour la seule estimation, utilisée au
     calcul de prix AVANT la vente. */
  abonnementMensuel: 10,      // €/mois, encaissement
  fixedAnnual: 1000,          // CFE + assurance + banque (sans comptable), €/an
  ordersPerYear: 400,         // pour répartir les frais fixes par commande
  // Lettre suivie Outre-mer pour les petits objets légers (≤ 500 g) : ~8 €,
  // bien moins cher que le Colissimo minimum. Prioritaire sous le seuil de poids.
  lettre: { maxKg: 0.5, price: 8 },
  // Au-delà de ce poids (kg), l'objet est trop lourd/volumineux pour un colis :
  // il part OBLIGATOIREMENT par bateau (container/fret), même en mode Colissimo.
  heavyKg: 10,
  // Grille Colissimo Outre-mer OM1 (poids max kg → prix €). Points 5 kg et 30 kg
  // officiels 2026 ; intermédiaires estimés (à confirmer sur laposte.fr).
  colissimo: [[0.5,14],[1,17],[2,23],[3,33],[5,38.90],[10,64],[15,88],[30,143.02]],
  // Coût logistique par unité en import CONTAINER (groupage LCL réparti).
  containerPerUnit: { nu: 5.3, coffret: 29 },
  // Option FTD Colissimo (Franc de Taxes et Droits) : le destinataire ne paie
  // RIEN à l'arrivée (promesse du site), taxes + frais refacturés à
  // l'expéditeur — 5,10 € HT par colis zone OM1 (colissimo.entreprise.
  // laposte.fr, vérifié 25/07/2026). Appliqué aux envois COLIS (colissimo +
  // lettre) ; le container a son dédouanement dans containerPerUnit.
  // ⚠️ Lettre suivie : pas d'option FTD officielle — provision identique pour
  // couvrir les frais de présentation en douane côté client (à défaut,
  // basculer ces envois en Colissimo FTD).
  douanePerParcel: 5.10
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
  var annuel = (cfg.fixedAnnual || 0) + 12 * (cfg.abonnementMensuel || 0);
  return (cfg.ordersPerYear > 0) ? (annuel / cfg.ordersPerYear) : 0;
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
function evaluate(costHT, markup, ship, octroi, tvaDom, cfg, douane) {
  douane = Number(douane) || 0;                       // FTD/frais de gestion douane (service, HORS base CIF)
  var priceHt = costHT * (1 + markup);
  var ttc = priceHt * (1 + octroi) * (1 + tvaDom);
  var revenueHT = priceHt * (1 + octroi);            // octroi = revenu (payé à l'import)
  var pct = (cfg.commissionPct != null) ? cfg.commissionPct : cfg.stripePct;
  var fix = (cfg.commissionFix != null) ? cfg.commissionFix : cfg.stripeFix;
  var commission = ttc * pct + fix;
  var octroiPaid = octroi * (costHT + ship);          // à l'import, non récupérable
  var costs = costHT + ship + octroiPaid + commission + cfg.packaging + fixedPerOrder(cfg) + douane;
  var netOp = revenueHT - costs;
  var netAfterIS = netOp * (1 - cfg.is);
  return {
    markup: markup, priceHt: round2(priceHt), ttc: round2(ttc),
    transport: round2(ship), octroiPaid: round2(octroiPaid), commission: round2(commission),
    douane: round2(douane),
    fixed: round2(cfg.packaging + fixedPerOrder(cfg)),
    is: round2(netOp * cfg.is), netOp: round2(netOp),
    netAfterIS: round2(netAfterIS),
    marginAfterIS: revenueHT > 0 ? netAfterIS / revenueHT : 0
  };
}

// Markup minimal (pas de 0,1 %) atteignant la marge cible après IS.
function solveMarkup(costHT, ship, octroi, tvaDom, cfg, douane) {
  for (var m = 0.02; m <= 3; m += 0.001) {
    if (evaluate(costHT, m, ship, octroi, tvaDom, cfg, douane).marginAfterIS >= cfg.targetNet) return m;
  }
  return 3;
}

// Sélection du transport pour un produit et un mode. Factorisé (utilisé par
// recommend ET marginAt) → une seule source de vérité du choix d'envoi.
function shipFor(product, mode, cfg) {
  var weight = Number(product && product.weight_kg) || 2;
  var isCoffret = (product && (product.variantRole === 'coffret' || /coffret|makpac|tstak|valise/i.test(product.title || '')));
  var heavy = cfg.heavyKg && weight > cfg.heavyKg;
  var ship, shipKind;
  if (heavy && mode !== 'container') {
    ship = cfg.containerPerUnit.coffret; shipKind = 'bateau-lourd';       // trop lourd → bateau
  } else if (mode === 'container') {
    ship = isCoffret ? cfg.containerPerUnit.coffret : cfg.containerPerUnit.nu; shipKind = 'container';
  } else if (cfg.lettre && weight <= cfg.lettre.maxKg) {
    ship = cfg.lettre.price; shipKind = 'lettre';                          // petit/léger → lettre
  } else {
    ship = colissimoCost(weight, cfg.colissimo); shipKind = 'colissimo';
  }
  return { ship: ship, shipKind: shipKind, weight: weight };
}

// Frais douane/FTD par commande selon le mode d'envoi : colis (colissimo ou
// lettre) = option FTD par colis ; container/bateau = dédouanement déjà couvert
// par containerPerUnit.
function douaneFor(shipKind, cfg) {
  return (shipKind === 'colissimo' || shipKind === 'lettre') ? (Number(cfg.douanePerParcel) || 0) : 0;
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

  var mode = opts.mode || 'colissimo';
  var s = shipFor(product, mode, cfg);
  var octroi = octroiRate(product, cfg);
  var tvaDom = tvaDomRate(cfg);
  var douane = douaneFor(s.shipKind, cfg);
  var m = solveMarkup(costHT, s.ship, octroi, tvaDom, cfg, douane);
  var r = evaluate(costHT, m, s.ship, octroi, tvaDom, cfg, douane);
  r.costHT = round2(costHT);
  r.priceHtFor = { price_ht: r.priceHt, price: round2(r.priceHt * (1 + cfg.tvaFR)) };
  r.mode = mode;
  r.shipKind = s.shipKind;
  r.weight = s.weight;
  return r;
}

// Marge RÉELLE à un prix DONNÉ (pas le prix recommandé) : pour auditer le prix
// actuel du site. opts.priceHt = price_ht courant (catalogue live). opts.costHT
// OU opts.costTTC = coût fournisseur. Retourne netAfterIS, marginAfterIS, etc.
function marginAt(product, opts, config) {
  var cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
  opts = opts || {};
  var costHT = (opts.costHT != null) ? Number(opts.costHT) : Number(opts.costTTC || 0) / (1 + cfg.tvaFR);
  var priceHt = Number(opts.priceHt || 0);
  if (!(costHT > 0) || !(priceHt > 0)) return null;
  var mode = opts.mode || 'colissimo';
  var s = shipFor(product, mode, cfg);
  var octroi = octroiRate(product, cfg);
  var tvaDom = tvaDomRate(cfg);
  var markup = priceHt / costHT - 1;
  var r = evaluate(costHT, markup, s.ship, octroi, tvaDom, cfg, douaneFor(s.shipKind, cfg));
  r.costHT = round2(costHT);
  r.mode = mode; r.shipKind = s.shipKind; r.weight = s.weight;
  return r;
}

module.exports = {
  DEFAULT_CONFIG: DEFAULT_CONFIG,
  colissimoCost: colissimoCost,
  shipFor: shipFor,
  douaneFor: douaneFor,
  recommend: recommend,
  marginAt: marginAt,
  evaluate: evaluate,
  solveMarkup: solveMarkup,
  _round2: round2
};
