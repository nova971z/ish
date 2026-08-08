// audit/admin/oracle-argent.mjs — ORACLES INDÉPENDANTS de la math de l'argent.
//
// LECTURE-SEULE. N'importe QUE les vrais modules produit (côté « obtenu ») et
// compare à des nombres calculés À LA MAIN (côté « attendu », arithmétique
// écrite en toutes lettres dans les commentaires — JAMAIS via la fonction
// testée). Sortie : une ligne PASS/FAIL par cas + CSV oracles_argent.csv.
// Sort en code non-zéro si un seul cas échoue.
//
// Lancer : node audit/admin/oracle-argent.mjs
//
// Modèle commission (Killian, 01/08/2026) : Revolut Business EN LIGNE
//   = 1,0 % + 0,20 € PAR TRANSACTION (commissionPct 0.010, commissionFix 0.20).

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(__dirname, '../../api/_lib');

// ── VRAIS modules sous test (côté « obtenu ») ────────────────────────────────
const pricing      = require(resolve(LIB, 'pricing.js'));
const model        = require(resolve(LIB, 'pricing-model.js'));
const pricingCfg   = require(resolve(LIB, 'pricing-config.js'));
const loyalty      = require(resolve(LIB, 'loyalty.js'));
const accounting   = require(resolve(LIB, 'accounting.js'));

const CFG = model.DEFAULT_CONFIG;   // config de référence (1 % + 0,20 €, etc.)

// ── Cadre de test ────────────────────────────────────────────────────────────
const rows = [];   // { cas, entrees, attendu, obtenu, verdict }
let fails = 0;

function cell(v) {
  // Une cellule CSV : pas de ';' (→ ','), pas de saut de ligne.
  return String(v).replace(/;/g, ',').replace(/[\r\n]+/g, ' ').trim();
}

// approx : nombre attendu ~ obtenu à eps près. eps=0 → égalité stricte (cents).
function check(cas, entrees, attendu, obtenu, eps = 0, opts = {}) {
  let ok;
  if (opts.exactInt) {
    ok = Number.isInteger(obtenu) && obtenu === attendu;
  } else if (typeof attendu === 'number' && typeof obtenu === 'number') {
    ok = Math.abs(attendu - obtenu) <= eps;
  } else {
    ok = attendu === obtenu;
  }
  if (!ok) fails++;
  const verdict = ok ? 'OK' : 'ÉCART';
  rows.push({ cas, entrees, attendu, obtenu, verdict });
  const flag = ok ? 'PASS' : 'FAIL';
  console.log(`${flag}  ${cas}  | attendu=${attendu}  obtenu=${obtenu}  (${entrees})`);
}

// Ligne informative sans assertion (question à trancher).
function note(cas, entrees, attendu, obtenu, verdict) {
  rows.push({ cas, entrees, attendu, obtenu, verdict });
  console.log(`NOTE  ${cas}  | ${verdict}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// C-001/C-036 — calcPrice : TTC = HT × (1+octE+octR) × (1+tva)
// Taux lus dans pricing.js : 971 power_tool = octE .07 octR .025 tva .085
//                            976 Mayotte     = 0 / 0 / 0
//                            973 Guyane      = octE .075 octR .025 tva 0
//                            974 accessory   = octE .03 octR .02 tva .085
//                            971 hand_tool   = octE .05 octR .025 tva .085
// ═════════════════════════════════════════════════════════════════════════════

// calc-1 : 971 power_tool HT=100
//   afterOctroi = 100 × 1.095 = 109.5 ; ttc = 109.5 × 1.085 = 118.8075
check('calc-1 TTC 971 power_tool HT=100',
  'price_ht=100 nc=power_tool terr=971',
  118.8075, pricing.calcPrice({ price_ht: 100, ncCategory: 'power_tool' }, '971').ttc, 1e-9);

// calc-2 : MAYOTTE 976, octroi 0 ET tva 0 → ttc = HT = 100 (cas obligatoire)
//   afterOctroi = 100 × 1 = 100 ; ttc = 100 × 1 = 100
check('calc-2 Mayotte 976 octroi 0 tva 0 HT=100',
  'price_ht=100 nc=power_tool terr=976',
  100, pricing.calcPrice({ price_ht: 100, ncCategory: 'power_tool' }, '976').ttc, 1e-9);

// calc-3 : PRIX 0 (cas obligatoire) → tout 0
check('calc-3 prix 0',
  'price_ht=0 terr=971',
  0, pricing.calcPrice({ price_ht: 0, ncCategory: 'power_tool' }, '971').ttc, 0);

// calc-4 : sans price_ht → HT = price / (1+vat) = 120/1.2 = 100 → ttc 118.8075
check('calc-4 HT deduit de price/vat',
  'price=120 vat=0.2 terr=971',
  118.8075, pricing.calcPrice({ price: 120, vat: 0.2, ncCategory: 'power_tool' }, '971').ttc, 1e-9);

// calc-5 : 971 hand_tool HT=200 (oct .075) → 200×1.075=215 ; ×1.085 = 233.275
check('calc-5 hand_tool 971 HT=200',
  'price_ht=200 nc=hand_tool terr=971',
  233.275, pricing.calcPrice({ price_ht: 200, ncCategory: 'hand_tool' }, '971').ttc, 1e-9);

// calc-6 : Guyane 973 power_tool HT=100 (oct .10, tva 0) → 110 × 1 = 110
check('calc-6 Guyane 973 tva 0 HT=100',
  'price_ht=100 nc=power_tool terr=973',
  110, pricing.calcPrice({ price_ht: 100, ncCategory: 'power_tool' }, '973').ttc, 1e-9);

// calc-7 : 974 accessory HT=50 (oct .05) → 52.5 × 1.085 = 56.9625
check('calc-7 accessory 974 HT=50',
  'price_ht=50 nc=accessory terr=974',
  56.9625, pricing.calcPrice({ price_ht: 50, ncCategory: 'accessory' }, '974').ttc, 1e-9);

// calc-8 : octroi (part) 971 power_tool HT=100 → afterOctroi 109.5 → octroi 9.5
check('calc-8 octroi 971 HT=100',
  'price_ht=100 nc=power_tool terr=971 champ=octroi',
  9.5, pricing.calcPrice({ price_ht: 100, ncCategory: 'power_tool' }, '971').octroi, 1e-9);

// calc-9 : tva (part) 971 power_tool HT=100 → 109.5 × 0.085 = 9.3075
check('calc-9 tva 971 HT=100',
  'price_ht=100 nc=power_tool terr=971 champ=tva',
  9.3075, pricing.calcPrice({ price_ht: 100, ncCategory: 'power_tool' }, '971').tva, 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// C-002 — unitCents = Math.round(ttc × 100) → CENTIMES ENTIERS
// ═════════════════════════════════════════════════════════════════════════════

// uc-1 : 971 power_tool HT=100 → round(118.8075×100)=round(11880.75)=11881
check('uc-1 unitCents 971 HT=100',
  'price_ht=100 terr=971',
  11881, pricing.unitCents({ price_ht: 100, ncCategory: 'power_tool' }, '971'), 0, { exactInt: true });

// uc-2 : ARRONDI CENTIMES (cas obligatoire) — 974 accessory HT=50
//   ttc = 56.9625 → ×100 = 5696.25 → round = 5696 (entier, pas de demi-cent)
const uc2 = pricing.unitCents({ price_ht: 50, ncCategory: 'accessory' }, '974');
check('uc-2 arrondi centimes entier 974 HT=50',
  'ttc=56.9625 ×100=5696.25 round',
  5696, uc2, 0, { exactInt: true });
console.log(`      preuve entier : Number.isInteger(${uc2}) = ${Number.isInteger(uc2)}`);

// uc-3 : Mayotte HT=100 → round(10000)=10000
check('uc-3 unitCents Mayotte HT=100',
  'price_ht=100 terr=976',
  10000, pricing.unitCents({ price_ht: 100, ncCategory: 'power_tool' }, '976'), 0, { exactInt: true });

// uc-4 : prix 0 → 0
check('uc-4 unitCents prix 0',
  'price_ht=0 terr=971',
  0, pricing.unitCents({ price_ht: 0 }, '971'), 0, { exactInt: true });

// uc-5 : 971 hand_tool HT=200 → round(233.275×100)=round(23327.5)=23328
check('uc-5 unitCents hand_tool 971 HT=200',
  'ttc=233.275 ×100=23327.5 round',
  23328, pricing.unitCents({ price_ht: 200, ncCategory: 'hand_tool' }, '971'), 0, { exactInt: true });

// ═════════════════════════════════════════════════════════════════════════════
// C-003/C-037 — taxRatesFor : sélection taux par territoire + catégorie NC
// ═════════════════════════════════════════════════════════════════════════════

// tr-1 : power_tool 971 → octE .07
check('tr-1 taux octE power_tool 971',
  'nc=power_tool terr=971',
  0.07, pricing.taxRatesFor({ ncCategory: 'power_tool' }, '971').octroiExterne, 0);
// tr-2 : Mayotte power_tool → octE 0 (octroi nul)
check('tr-2 taux octE Mayotte',
  'nc=power_tool terr=976',
  0, pricing.taxRatesFor({ ncCategory: 'power_tool' }, '976').octroiExterne, 0);
// tr-3 : hand_tool 974 → octE .035 (override)
check('tr-3 taux octE hand_tool 974',
  'nc=hand_tool terr=974',
  0.035, pricing.taxRatesFor({ ncCategory: 'hand_tool' }, '974').octroiExterne, 0);
// tr-4 : consumable 971 → octR .015 (override)
check('tr-4 taux octR consumable 971',
  'nc=consumable terr=971',
  0.015, pricing.taxRatesFor({ ncCategory: 'consumable' }, '971').octroiRegional, 0);
// tr-5 : territoire inconnu → repli DEFAULT 971 → tva .085
check('tr-5 territoire inconnu repli 971',
  'nc=power_tool terr=999',
  0.085, pricing.taxRatesFor({ ncCategory: 'power_tool' }, '999').tva, 0);
// tr-6 : nc inconnue → pas d override → défaut territoire 971 octE .07
check('tr-6 nc inconnue repli defaut terr',
  'nc=inconnue terr=971',
  0.07, pricing.taxRatesFor({ ncCategory: 'zzz' }, '971').octroiExterne, 0);

// ═════════════════════════════════════════════════════════════════════════════
// C-004/C-042 — coffretSurchargeCents : petit 15 € / gros 25 € → cents entiers
//   éligible = power_tool && !coffretIncluded && !DENY(category)
//   gros = circulaire | (défonceuse & kit) | nbOutils>=3
// ═════════════════════════════════════════════════════════════════════════════

// cf-1 : petit → round(15×100)=1500
check('cf-1 coffret petit',
  'nc=power_tool title=Perceuse cat=Perceuses',
  1500, pricing.coffretSurchargeCents({ ncCategory: 'power_tool', title: 'Perceuse', category: 'Perceuses' }), 0, { exactInt: true });
// cf-2 : gros via « scie circulaire » → round(25×100)=2500
check('cf-2 coffret gros circulaire',
  'nc=power_tool title=Scie circulaire',
  2500, pricing.coffretSurchargeCents({ ncCategory: 'power_tool', title: 'Scie circulaire', category: 'Scies' }), 0, { exactInt: true });
// cf-3 : gros via « 3 outils » dans le titre → 2500
check('cf-3 coffret gros 3 machines',
  'nc=power_tool title=Kit 3 outils',
  2500, pricing.coffretSurchargeCents({ ncCategory: 'power_tool', title: 'Kit 3 outils', category: 'Packs' }), 0, { exactInt: true });
// cf-4 : non éligible (accessory) → 0
check('cf-4 coffret non eligible accessory',
  'nc=accessory',
  0, pricing.coffretSurchargeCents({ ncCategory: 'accessory', title: 'Foret' }), 0, { exactInt: true });
// cf-5 : non éligible (category dans DENY) → 0
check('cf-5 coffret non eligible category coffret',
  'nc=power_tool category=Coffrets',
  0, pricing.coffretSurchargeCents({ ncCategory: 'power_tool', title: 'X', category: 'Coffrets' }), 0, { exactInt: true });
// cf-6 : coffretIncluded → 0
check('cf-6 coffret deja inclus',
  'nc=power_tool coffretIncluded=true',
  0, pricing.coffretSurchargeCents({ ncCategory: 'power_tool', title: 'Perceuse', coffretIncluded: true }), 0, { exactInt: true });

// ═════════════════════════════════════════════════════════════════════════════
// C-005 — poidsExpedieKg : outil + coffret (petit 0.5 / gros 1.3), arrondi gramme
// ═════════════════════════════════════════════════════════════════════════════

// pe-1 : outil 2.7 + petit 0.5 = 3.2
check('pe-1 poids outil+petit coffret',
  'weight=2.7 avecCoffret=true petit',
  3.2, pricing.poidsExpedieKg({ ncCategory: 'power_tool', title: 'Perceuse', weight_kg: 2.7 }, true), 1e-9);
// pe-2 : sans coffret → 2.7
check('pe-2 poids sans coffret',
  'weight=2.7 avecCoffret=false',
  2.7, pricing.poidsExpedieKg({ ncCategory: 'power_tool', title: 'Perceuse', weight_kg: 2.7 }, false), 1e-9);
// pe-3 : gros (scie circulaire) 4 + 1.3 = 5.3
check('pe-3 poids outil+gros coffret',
  'weight=4 avecCoffret=true gros',
  5.3, pricing.poidsExpedieKg({ ncCategory: 'power_tool', title: 'Scie circulaire', weight_kg: 4 }, true), 1e-9);
// pe-4 : non éligible (accessory) → poids outil seul 1
check('pe-4 poids non eligible',
  'weight=1 nc=accessory avecCoffret=true',
  1, pricing.poidsExpedieKg({ ncCategory: 'accessory', weight_kg: 1 }, true), 1e-9);
// pe-5 : poids 0 (manquant) → 0
check('pe-5 poids 0',
  'weight absent avecCoffret=false',
  0, pricing.poidsExpedieKg({ ncCategory: 'power_tool' }, false), 0);

// ═════════════════════════════════════════════════════════════════════════════
// C-006 — colissimoCost : grille [[.5,14][1,17][2,23][3,33][5,38.90][10,64][15,88][30,143.02]]
// ═════════════════════════════════════════════════════════════════════════════
const GRID = CFG.colissimo;
check('co-1 colissimo 0.4kg', 'w=0.4', 14, model.colissimoCost(0.4, GRID), 0);
check('co-2 colissimo 2.7kg', 'w=2.7 -> palier 3kg', 33, model.colissimoCost(2.7, GRID), 0);
check('co-3 colissimo 5kg', 'w=5', 38.90, model.colissimoCost(5, GRID), 1e-9);
check('co-4 colissimo 10kg', 'w=10', 64, model.colissimoCost(10, GRID), 0);
check('co-5 colissimo hors grille 40kg', 'w=40 -> dernier', 143.02, model.colissimoCost(40, GRID), 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// C-007 — fixedPerOrder = (fixedAnnual + 12×abonnementMensuel) / ordersPerYear
//   défaut : (1000 + 12×10) / 400 = 1120 / 400 = 2.80
// ═════════════════════════════════════════════════════════════════════════════
// fixedPerOrder n'est PAS exporté : on l'extrait du VRAI code via evaluate().
//   evaluate(0,0,0,0,0,CFG,0) : revenueHT=0, costs = commission(0.20) + packaging(0.5)
//   + fixedPerOrder + 0 → netOp = −(0.70 + fixedPerOrder). Donc :
//   fixedPerOrder = −netOp − 0.70. Attendu main = (1000+12×10)/400 = 2.80.
const evFix = model.evaluate(0, 0, 0, 0, 0, CFG, 0);
check('fpo-1 fixedPerOrder defaut (via evaluate)',
  '(1000+12×10)/400 = 2.80',
  2.8, model._round2(-evFix.netOp - 0.20 - 0.5), 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// C-009 — evaluate : commission = ttc × 1% + 0,20 € PAR TRANSACTION
//   priceHt = costHT×(1+markup) ; ttc = priceHt×(1+octroi)×(1+tvaDom)
//   revenueHT = priceHt×(1+octroi) ; commission = ttc×0.01 + 0.20
//   octroiPaid = octroi×(costHT+ship)
//   costs = costHT+ship+octroiPaid+commission+0.5+2.8+douane
//   netOp = revenueHT − costs ; netAfterIS = netOp×0.85
// ═════════════════════════════════════════════════════════════════════════════

// ev-A : PANIER ~8 € AVEC PART FIXE 0,20 € (cas obligatoire)
//   costHT=8, markup=0, octroi=0, tvaDom=0, ship=0, douane=0
//   ttc = 8 ; commission = 8×0.01 + 0.20 = 0.08 + 0.20 = 0.28
const evA = model.evaluate(8, 0, 0, 0, 0, CFG, 0);
check('ev-A commission panier 8e = 1% + 0.20',
  'costHT=8 markup=0 ttc=8',
  0.28, evA.commission, 1e-9);
//   preuve part fixe : sur ttc=8, la part variable 1% vaut 0.08, le reste 0.20 = fix
console.log(`      part fixe isolée : commission(${evA.commission}) − 1%×8(0.08) = ${(evA.commission - 0.08).toFixed(2)} €`);

// ev-B : deuxième transaction, ttc différent → la part fixe 0,20 s applique ENCORE
//   costHT=100, markup=0, octroi=0, tvaDom=0 → ttc=100 ; commission=100×0.01+0.20=1.20
const evB = model.evaluate(100, 0, 0, 0, 0, CFG, 0);
check('ev-B commission ttc=100 = 1.00 + 0.20 (fix par transaction)',
  'costHT=100 markup=0 ttc=100',
  1.20, evB.commission, 1e-9);

// ev-C : cas complet 971 — costHT=100 markup=1.0 octroi .095 tvaDom .085 ship 33 douane 5.10
//   priceHt = 200 ; revenueHT = 200×1.095 = 219 ; ttc = 219×1.085 = 237.615
//   commission = 237.615×0.01 + 0.20 = 2.37615 + 0.20 = 2.57615 → round2 2.58
const evC = model.evaluate(100, 1.0, 33, 0.095, 0.085, CFG, 5.10);
check('ev-C ttc 971 markup 100%',
  'costHT=100 markup=1 oct .095 tva .085 ship 33 douane 5.10',
  237.615, evC.ttc, 1e-2);
check('ev-C commission round2',
  'commission=2.57615 -> round2',
  2.58, evC.commission, 1e-9);
//   octroiPaid = 0.095×(100+33)=0.095×133=12.635 → round2 12.64
check('ev-C octroiPaid',
  'octroi .095 ×(100+33)=12.635',
  12.64, evC.octroiPaid, 1e-9);
//   costs = 100+33+12.635+2.57615+0.5+2.8+5.10 = 156.61115
//   netOp = 219 − 156.61115 = 62.38885 → round2 62.39
check('ev-C netOp round2',
  'revenueHT 219 − costs 156.61115',
  62.39, evC.netOp, 1e-9);
//   netAfterIS = 62.38885 × 0.85 = 53.0305225 → round2 53.03
check('ev-C netAfterIS round2',
  'netOp 62.38885 ×0.85',
  53.03, evC.netAfterIS, 1e-9);
//   marginAfterIS = 53.0305225 / 219 = 0.24214850...
check('ev-C marginAfterIS (net apres IS / revenueHT)',
  'netAfterIS 53.0305225 / revenueHT 219',
  0.2421485, evC.marginAfterIS, 1e-6);

// ev-D : PRIX 0 → revenueHT 0 → marginAfterIS = 0 (garde revenueHT>0)
//   commission = 0×0.01 + 0.20 = 0.20 (la part fixe reste due même à 0)
const evD = model.evaluate(0, 0, 0, 0, 0, CFG, 0);
check('ev-D marginAfterIS a prix 0',
  'costHT=0 -> revenueHT=0',
  0, evD.marginAfterIS, 0);
check('ev-D commission a prix 0 = fix 0.20',
  'ttc=0 -> 0×0.01+0.20',
  0.20, evD.commission, 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// C-010 — solveMarkup : plus petit markup (pas 0.001) atteignant targetNet apres IS
//   Dérivation main (octroi 0, tvaDom 0, ship 0, douane 0, costHT 100, defauts) :
//   marginAfterIS = 0.85×(0.99·P − 103.5)/P ≥ target, P=100(1+m)
//   target 0.15 : 0.6915 P ≥ 87.975 → P ≥ 127.2234 → m ≥ 0.272234 → renvoie 0.273
// ═════════════════════════════════════════════════════════════════════════════
const sm1 = model.solveMarkup(100, 0, 0, 0, CFG, 0);
check('sm-1 solveMarkup target 0.15 (attendu 0.273)',
  'costHT=100 oct0 tva0 ship0 target0.15',
  0.273, Math.round(sm1 * 1000) / 1000, 1e-9);
//   target 0 : 0.99·P − 103.5 ≥ 0 → P ≥ 104.545 → m ≥ 0.04545 → renvoie 0.046
const sm2 = model.solveMarkup(100, 0, 0, 0, Object.assign({}, CFG, { targetNet: 0 }), 0);
check('sm-2 solveMarkup target 0 (attendu 0.046)',
  'costHT=100 target0',
  0.046, Math.round(sm2 * 1000) / 1000, 1e-9);
//   target inatteignable (0.99) → plafond 3 (marge max ~0.8415 < 0.99)
const sm3 = model.solveMarkup(100, 0, 0, 0, Object.assign({}, CFG, { targetNet: 0.99 }), 0);
check('sm-3 solveMarkup target 0.99 -> plafond 3',
  'target0.99 inatteignable',
  3, sm3, 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// C-011 — recommend : prix conseillé. Dérivation main (971, colissimo 2.7kg) :
//   ship=colissimo(2.7)=33 ; octroi .095 ; tvaDom .085 ; douane 5.10
//   boundary : 0.7564013625·P ≥ 131.09975 → P ≥ 173.3203 → m=0.734 → priceHt 173.4
//   price = round2(173.4 × 1.20) = 208.08
// ═════════════════════════════════════════════════════════════════════════════
const rec = model.recommend({ weight_kg: 2.7, ncCategory: 'power_tool' }, { costHT: 100, mode: 'colissimo' }, {});
check('rec-1 recommend priceHt (attendu 173.4)',
  'costHT=100 weight=2.7 mode=colissimo terr=971',
  173.4, rec.priceHt, 1e-2);
check('rec-1 recommend price TTC-FR (attendu 208.08)',
  'priceHt 173.4 ×1.20',
  208.08, rec.priceHtFor.price, 1e-2);
check('rec-1 recommend shipKind',
  'colissimo 2.7kg',
  'colissimo', rec.shipKind);
// marge du prix conseillé ≥ target 0.15
check('rec-1 recommend marginAfterIS >= target (0/1)',
  'marginAfterIS >= 0.15 ?',
  1, rec.marginAfterIS >= 0.15 ? 1 : 0, 0, { exactInt: true });
// recommend via costTTC : 120/1.2 = 100 → même priceHt 173.4
const recTtc = model.recommend({ weight_kg: 2.7, ncCategory: 'power_tool' }, { costTTC: 120, mode: 'colissimo' }, {});
check('rec-2 recommend depuis costTTC=120 -> costHT 100',
  'costTTC=120 /1.20=100',
  173.4, recTtc.priceHt, 1e-2);
// recommend coût nul → null
check('rec-3 recommend costHT<=0 -> null',
  'costHT=0',
  'null', rec === null ? 'null' : (model.recommend({ weight_kg: 2 }, { costHT: 0 }, {}) === null ? 'null' : 'non-null'));

// ═════════════════════════════════════════════════════════════════════════════
// C-012 — marginAt : marge RÉELLE au prix donné. markup = priceHt/costHT − 1
//   costHT=100 priceHt=173.4 → markup 0.734 → même evaluate que rec-1
//   netOp = 1.08311925×173.4 − 154.235 = 33.577878 → round2 33.58
//   netAfterIS = 0.85×33.577878 = 28.5411963 → round2 28.54
//   marginAfterIS = 28.5411963 / (1.095×173.4=189.873) = 0.150317
// ═════════════════════════════════════════════════════════════════════════════
const mgt = model.marginAt({ weight_kg: 2.7, ncCategory: 'power_tool' }, { costHT: 100, priceHt: 173.4 }, {});
check('mat-1 marginAt netOp',
  'costHT=100 priceHt=173.4',
  33.58, mgt.netOp, 1e-9);
check('mat-1 marginAt netAfterIS',
  'netOp 33.577878 ×0.85',
  28.54, mgt.netAfterIS, 1e-9);
check('mat-1 marginAt marginAfterIS',
  '28.5411963 / 189.873',
  0.150317, mgt.marginAfterIS, 1e-5);
// marginAt via costTTC
const mgtTtc = model.marginAt({ weight_kg: 2.7, ncCategory: 'power_tool' }, { costTTC: 120, priceHt: 173.4 }, {});
check('mat-2 marginAt depuis costTTC',
  'costTTC=120 priceHt=173.4',
  28.54, mgtTtc.netAfterIS, 1e-9);
// marginAt priceHt<=0 → null
check('mat-3 marginAt priceHt<=0 -> null',
  'priceHt=0',
  'null', model.marginAt({ weight_kg: 2 }, { costHT: 100, priceHt: 0 }, {}) === null ? 'null' : 'non-null');

// ═════════════════════════════════════════════════════════════════════════════
// C-016 — tierForSpendEur : bronze 0(0%) argent 500(2%) or 2000(5%) platine 5000(8%)
// ═════════════════════════════════════════════════════════════════════════════
check('ti-1 tier 0e', 'spend=0', 'bronze', loyalty.tierForSpendEur(0).key);
check('ti-2 tier 499.99e', 'spend=499.99', 'bronze', loyalty.tierForSpendEur(499.99).key);
check('ti-3 tier 500e (borne)', 'spend=500', 'argent', loyalty.tierForSpendEur(500).key);
check('ti-4 tier 2000e (borne)', 'spend=2000', 'or', loyalty.tierForSpendEur(2000).key);
check('ti-5 tier 5000e (borne)', 'spend=5000', 'platine', loyalty.tierForSpendEur(5000).key);
check('ti-6 tier 100000e', 'spend=100000', 'platine', loyalty.tierForSpendEur(100000).key);

// ═════════════════════════════════════════════════════════════════════════════
// C-014 — loyalty.quote : discountCents = round(totalCents × pct / 100)
//   quote() lit la dépense vérifiée en base → mockDb renvoie les paiements.
// ═════════════════════════════════════════════════════════════════════════════
function mockDb(payments) {
  const snap = { forEach(cb) { payments.forEach(p => cb({ data: () => p })); } };
  const q = { where() { return q; }, async get() { return snap; } };
  return { collection() { return q; } };
}
// ly-1 : spend 0 → bronze 0% → discount 0 (total 10000)
check('ly-1 remise bronze 0%',
  'spend=0 total=10000',
  0, (await loyalty.quote(mockDb([]), 'u', 10000)).discountCents, 0, { exactInt: true });
// ly-2 : spend 600€ (60000c) → argent 2% → round(10000×2/100)=200
check('ly-2 remise argent 2%',
  'spend=60000c total=10000',
  200, (await loyalty.quote(mockDb([{ amountCents: 60000 }]), 'u', 10000)).discountCents, 0, { exactInt: true });
// ly-3 : spend 2000€ → or 5% → round(10000×5/100)=500
check('ly-3 remise or 5%',
  'spend=200000c total=10000',
  500, (await loyalty.quote(mockDb([{ amountCents: 200000 }]), 'u', 10000)).discountCents, 0, { exactInt: true });
// ly-4 : spend 5000€ → platine 8% → round(10000×8/100)=800
check('ly-4 remise platine 8%',
  'spend=500000c total=10000',
  800, (await loyalty.quote(mockDb([{ amountCents: 500000 }]), 'u', 10000)).discountCents, 0, { exactInt: true });
// ly-5 : arrondi — spend platine, total 10101 → round(10101×8/100)=round(808.08)=808
check('ly-5 remise arrondi centime',
  'spend platine total=10101 -> round(808.08)',
  808, (await loyalty.quote(mockDb([{ amountCents: 500000 }]), 'u', 10101)).discountCents, 0, { exactInt: true });

// ── C-014 bis — REMISE FIDÉLITÉ 100 % (cas obligatoire) ──────────────────────
// Aucun palier réel ne dépasse 8 %. Pour exercer la VRAIE fonction quote() à
// 100 %, on injecte en place un palier {min:0, discountPct:100} dans le tableau
// TIERS partagé (même référence que l'interne), on mesure, puis on RESTAURE.
//   discountCents = round(8000 × 100 / 100) = 8000 → amountCents = 8000−8000 = 0
const _tiersBackup = loyalty.TIERS.map(t => Object.assign({}, t));
loyalty.TIERS.splice(0, loyalty.TIERS.length, { key: 'full', label: 'Full', min: 0, discountPct: 100 });
const q100 = await loyalty.quote(mockDb([{ amountCents: 1 }]), 'u', 8000);
loyalty.TIERS.splice(0, loyalty.TIERS.length, ..._tiersBackup);   // RESTAURE
check('ly-100 remise fidelite 100% -> tout le panier',
  'palier 100% total=8000',
  8000, q100.discountCents, 0, { exactInt: true });
check('ly-100 amountCents apres remise 100% = 0',
  'total 8000 − remise 8000',
  0, 8000 - q100.discountCents, 0, { exactInt: true });
// preuve de restauration : palier platine max de nouveau à 8 %
check('ly-100 TIERS restaure (platine 8%)',
  'apres restauration',
  8, loyalty.tierForSpendEur(9999).discountPct, 0, { exactInt: true });

// ═════════════════════════════════════════════════════════════════════════════
// C-013 — round2 (pricing-model._round2) = Math.round(n×100)/100
// ═════════════════════════════════════════════════════════════════════════════
check('r2-1 round2 1.234', 'n=1.234', 1.23, model._round2(1.234), 1e-9);
check('r2-2 round2 1.236', 'n=1.236', 1.24, model._round2(1.236), 1e-9);
check('r2-3 round2 118.8075', 'n=118.8075 -> 11880.75 round', 118.81, model._round2(118.8075), 1e-9);
check('r2-4 round2 -3.58', 'n=-3.58', -3.58, model._round2(-3.58), 1e-9);
check('r2-5 round2 0', 'n=0', 0, model._round2(0), 0);

// ═════════════════════════════════════════════════════════════════════════════
// C-018 — computeIS (accounting) : 15% jusqu a 42500, 25% au-dela
// ═════════════════════════════════════════════════════════════════════════════
check('is-1 IS benefice 0', 'benefice=0', 0, accounting.computeIS(0, {}), 0);
check('is-2 IS benefice negatif', 'benefice=-100', 0, accounting.computeIS(-100, {}), 0);
check('is-3 IS 10000 (taux reduit 15%)', 'benefice=10000 ->1500', 1500, accounting.computeIS(10000, {}), 1e-9);
check('is-4 IS 42500 (seuil, 15%)', 'benefice=42500 ->6375', 6375, accounting.computeIS(42500, {}), 1e-9);
// 50000 : 42500×0.15 + 7500×0.25 = 6375 + 1875 = 8250
check('is-5 IS 50000 (mixte)', 'benefice=50000 ->8250', 8250, accounting.computeIS(50000, {}), 1e-9);
// 100000 : 6375 + 57500×0.25 = 6375 + 14375 = 20750
check('is-6 IS 100000 (mixte)', 'benefice=100000 ->20750', 20750, accounting.computeIS(100000, {}), 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// C-007-fusion — pricing-config.fusionner : un réglage ENREGISTRÉ l'emporte
//   (bug argent 01/08/2026 : stripePct saisi mais commissionPct défaut ignorait)
// ═════════════════════════════════════════════════════════════════════════════
const D = pricingCfg.defaults();
check('fu-1 stripePct enregistre ecrase commissionPct defaut',
  'enBase={stripePct:0.015}',
  0.015, pricingCfg.fusionner(D, { stripePct: 0.015 }).commissionPct, 1e-9);
check('fu-2 commissionPct direct',
  'enBase={commissionPct:0.028}',
  0.028, pricingCfg.fusionner(D, { commissionPct: 0.028 }).commissionPct, 1e-9);
check('fu-3 commissionPct l emporte sur stripePct si les deux',
  'enBase={stripePct:0.015,commissionPct:0.02}',
  0.02, pricingCfg.fusionner(D, { stripePct: 0.015, commissionPct: 0.02 }).commissionPct, 1e-9);
check('fu-4 stripeFix enregistre ecrase commissionFix',
  'enBase={stripeFix:0.25}',
  0.25, pricingCfg.fusionner(D, { stripeFix: 0.25 }).commissionFix, 1e-9);
check('fu-5 rien enregistre -> defaut 1% (0.010)',
  'enBase={}',
  0.010, pricingCfg.fusionner(D, {}).commissionPct, 1e-9);

// ═════════════════════════════════════════════════════════════════════════════
// QUESTION KILLIAN — le mot « marge » recouvre PLUSIEURS formules coexistantes.
// Chacune est explicitement définie (donc chaque oracle ci-dessus se calcule),
// mais le TERME seul est ambigu entre écrans/fichiers → à trancher pour le libellé.
// ═════════════════════════════════════════════════════════════════════════════
note('QUESTION KILLIAN: définition de la marge',
  'candidats: (a) pricing-model.js:174 marginAfterIS = netAfterIS/revenueHT [net apres IS / (priceHt×(1+octroi))] '
  + '(b) accounting.js:248 marge_nette_pct = resultatNet/caHt×100 [net apres IS / CA HT] '
  + '(c) accounting.js:200 marge_brute = caHt − cogs [brute, en euros] '
  + '(d) admin.bundle.js:1148/1164 r.marginPct [affichage de marginAt, = (a)]',
  'chaque formule est calculable (oracles OK ci-dessus)',
  'terme « marge » ambigu : dénominateur revenueHT (a) vs CA HT (b), et brute (c) ≠ nette (a/b)',
  'À TRANCHER');

// ── Écriture du CSV + bilan ──────────────────────────────────────────────────
const header = 'Cas;Entrees;Attendu_calcule_main;Obtenu_code;Verdict';
const lines = rows.map(r =>
  [cell(r.cas), cell(r.entrees), cell(r.attendu), cell(r.obtenu), cell(r.verdict)].join(';'));
const csv = [header, ...lines].join('\n') + '\n';
writeFileSync(resolve(__dirname, 'oracles_argent.csv'), csv);

const total = rows.filter(r => r.verdict === 'OK' || r.verdict === 'ÉCART').length;
const pass = rows.filter(r => r.verdict === 'OK').length;
console.log('\n──────────────────────────────────────────────');
console.log(`Cas assertés : ${total}  |  PASS : ${pass}  |  FAIL : ${fails}`);
console.log(`Lignes CSV (dont notes) : ${rows.length}`);
console.log(`CSV écrit : ${resolve(__dirname, 'oracles_argent.csv')}`);
if (fails > 0) {
  console.log('ÉCART(S) détecté(s) — voir les lignes FAIL ci-dessus.');
  process.exit(1);
}
console.log('Tous les oracles concordent.');
process.exit(0);
