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

     ⛔⛔ DÉCISION RENVERSÉE LE 01/08/2026 — ON RETIENT 1,0 % + 0,20 €.
     ─────────────────────────────────────────────────────────────────────
     La règle précédente disait « on retient le PLUS HAUT : 2,8 % », au motif
     que les clients sont des artisans et paient par carte professionnelle,
     facturée 2,8 % comme l'international. ELLE NE S'APPLIQUE PLUS.

     Motif donné par l'user, les deux grilles en capture à l'appui : le site
     affichait plus cher qu'au temps de l'ancien encaisseur alors que Revolut
     prend MOINS sur chaque taux comparable (conso 1,0 % contre 1,5 % ;
     international 2,8 % contre 3,25 %). Le modèle comparait en réalité le
     MEILLEUR taux de l'ancien au PIRE taux de Revolut — deux hypothèses qui
     ne se comparent pas.

     Mesuré, outil à 100 € HT de coût, 2,7 kg, Guadeloupe :
       hypothèse 2,8 % ............. 211,00 € TTC · commission 6,11 €
       hypothèse 1,0 % ............. 206,01 € TTC · commission 2,26 €
       (ancien encaisseur, 1,5 %) .. 207,08 € TTC · commission 3,36 €

     ⚠️ CE QUE CE CHOIX COÛTE, écrit une fois pour ne pas le redécouvrir au
     relevé bancaire : sur une vente réglée par carte PROFESSIONNELLE, Revolut
     prélèvera bien 2,8 %. Le prix n'en aura provisionné que 1,0 %. L'écart
     sort de la marge — sur l'exemple ci-dessus, 6,11 − 2,26 = 3,85 € par
     vente concernée.

     C'est un arbitrage ASSUMÉ, pas un oubli : afficher un prix juste pour la
     majorité plutôt qu'un prix de précaution pour tout le monde. Le compte de
     résultat reste exact quoi qu'il arrive — il lit la commission RÉELLE de
     chaque vente (`payments[].fees[]`), jamais cette estimation. Si les
     relevés montrent une majorité de cartes pro, ce taux se remonte depuis
     l'écran admin, sans toucher au code.

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
  commissionPct: 0.010,
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
  /* ⛔⛔ ON NE PAIE PAS D'IMPÔT SUR UNE PERTE — ET LE MODÈLE LE FAISAIT.
     Mesuré le 10/08/2026 : une vente à 50 € HT pour un coût de 100 € TTC donne
     un résultat d'exploitation de −62,53 €, et le modèle annonçait −53,15 €.
     Il ADOUCISSAIT la perte de 9,38 € en appliquant 15 % d'IS à un déficit.
     Sur un audit de prix, c'est exactement l'erreur qui laisse passer une vente
     à perte : elle paraît 15 % moins grave qu'elle ne l'est. */
  var netAfterIS = netOp > 0 ? netOp * (1 - cfg.is) : netOp;
  return {
    markup: markup, priceHt: round2(priceHt), ttc: round2(ttc),
    transport: round2(ship), octroiPaid: round2(octroiPaid), commission: round2(commission),
    douane: round2(douane),
    fixed: round2(cfg.packaging + fixedPerOrder(cfg)),
    is: round2(netOp > 0 ? netOp * cfg.is : 0), netOp: round2(netOp),
    netAfterIS: round2(netAfterIS),
    marginAfterIS: revenueHT > 0 ? netAfterIS / revenueHT : 0
  };
}

/* Markup minimal (pas de 0,1 %) atteignant la marge cible après IS.
   ⛔⛔ IL RENDAIT 3 EN SILENCE, ET C'ÉTAIT UN PRIX À PERTE. Mesuré le
   10/08/2026 : sous **13,39 € TTC** de coût fournisseur (poids 1 kg), la marge
   cible de 15 % est ARITHMÉTIQUEMENT inatteignable — les frais fixes par
   commande, l'option douane à 5,10 € et la commission mangent tout. La boucle
   sortait alors sur son plafond de 300 % et rendait un prix dont la marge
   réelle atteint **−780 %** : un article à 0,76 € vendu 3,04 € quand les seuls
   frais fixes valent ~8 €. Rien ne le disait.
   ⚠️ Portée mesurée sur son relevé : **647 références sur 3 581 (18,1 %)** sont
   sous ce seuil — aucune n'est encore au catalogue, mais elles font partie de
   celles qu'il veut ajouter. La garde est donc posée AVANT, pas après.
   ⇒ On rend désormais `{ markup, atteinte }`. L'appelant SAIT. */
function solveMarkup(costHT, ship, octroi, tvaDom, cfg, douane) {
  for (var m = 0.02; m <= 3; m += 0.001) {
    if (evaluate(costHT, m, ship, octroi, tvaDom, cfg, douane).marginAfterIS >= cfg.targetNet) {
      return { markup: m, atteinte: true };
    }
  }
  return { markup: 3, atteinte: false };
}

// Sélection du transport pour un produit et un mode. Factorisé (utilisé par
// recommend ET marginAt) → une seule source de vérité du choix d'envoi.
/* ⛔⛔ LE BATEAU DE LA POSTE, ET CE QU'IL COÛTE VRAIMENT.
   Règle de l'user, gravée le 10/08/2026 : « si un seul outil pèse plus de
   10 kg, il passe par bateau ». Le seuil existait déjà (`heavyKg: 10`) — mais
   le coût était un FORFAIT de 29 €, quel que soit le poids. Mesuré :
       11 kg → 29 €   ·   20 kg → 29 €   ·   30 kg → 29 €
   Or le bateau de La Poste s'appelle **Colissimo Eco Outre-mer**, et il coûte
   **39,24 € dès 10 kg** (affiche officielle La Poste, janvier 2026) — donc le
   forfait était déjà sous l'eau au premier kilo au-dessus du seuil, et très
   loin en haut de grille. Un transport sous-provisionné se paie sur la marge,
   vente après vente, sans que rien ne le dise.
   ⚠️ 29 € reste juste pour le mode `container` : c'est une quote-part de
   GROUPAGE, le cas où l'user affrète lui-même. Les deux ne se confondent plus.
   ⛔ ON N'INTERPOLE PAS. Un poids qui ne tombe pas sur un point confirmé prend
   le point confirmé JUSTE AU-DESSUS : interpoler, c'est inventer un prix de
   transport, et l'inventer trop bas fait vendre à perte. */
var GRILLES = require('../../data/transport-outre-mer.json');

function tarifDeGrille(weightKg, points) {
  for (var i = 0; i < points.length; i++) {
    if (weightKg <= points[i].kgMax) return points[i];
  }
  return null;                       // au-delà du plafond : on ne chiffre pas
}

function shipFor(product, mode, cfg) {
  var weight = Number(product && product.weight_kg) || 2;
  var isCoffret = (product && (product.variantRole === 'coffret' || /coffret|makpac|tstak|valise/i.test(product.title || '')));
  var heavy = cfg.heavyKg && weight > cfg.heavyKg;
  var ship, shipKind;
  if (heavy && mode !== 'container') {
    var pt = tarifDeGrille(weight, GRILLES.colissimoEco._points);
    if (!pt) {
      /* Au-delà de 30 kg, La Poste ne prend plus le colis : c'est du fret, et
         le coût se lit sur un devis de transitaire. On REFUSE de chiffrer
         plutôt que d'inventer — `recommend` rendra `null`, et l'appelant le
         VERRA au lieu de vendre à un prix faux. */
      return { ship: null, shipKind: 'fret-devis', weight: weight,
        motif: 'plus de ' + GRILLES.colissimoEco._plafond_kg
          + ' kg : hors Colissimo Eco Outre-mer, devis de transitaire' };
    }
    return { ship: pt.prix, shipKind: 'bateau-poste', weight: weight,
      tarifConfirme: pt.confirme === true, tranche: pt.kgMax };
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
  /* ⛔⛔ UN TRANSPORT INCONNU NE VAUT PAS ZÉRO. Attrapé par sa propre porte, à
     la minute où la règle du bateau est entrée : `shipFor` rendait `null` pour
     un article de plus de 30 kg, et le calcul continuait avec un port à 0 —
     donc un prix de vente calculé comme si l'expédition était gratuite. Pire
     que l'ancien forfait. Un refus doit REMONTER, pas se diluer. */
  if (s.ship == null) return null;
  var octroi = octroiRate(product, cfg);
  var tvaDom = tvaDomRate(cfg);
  var douane = douaneFor(s.shipKind, cfg);
  var sm = solveMarkup(costHT, s.ship, octroi, tvaDom, cfg, douane);
  var r = evaluate(costHT, sm.markup, s.ship, octroi, tvaDom, cfg, douane);
  /* ⛔ LE DRAPEAU QUI MANQUAIT. `false` veut dire : ce prix N'ATTEINT PAS la
     marge cible, et il peut être à perte. Celui qui écrit une fiche doit le
     lire et refuser — voir `scripts/generer-fiches-makita.js`. */
  r.cibleAtteinte = sm.atteinte;
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
  /* ⛔⛔ UN TRANSPORT INCONNU NE VAUT PAS ZÉRO. Attrapé par sa propre porte, à
     la minute où la règle du bateau est entrée : `shipFor` rendait `null` pour
     un article de plus de 30 kg, et le calcul continuait avec un port à 0 —
     donc un prix de vente calculé comme si l'expédition était gratuite. Pire
     que l'ancien forfait. Un refus doit REMONTER, pas se diluer. */
  if (s.ship == null) return null;
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
