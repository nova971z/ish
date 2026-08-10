// scripts/check-pricing-model.js — Vérifie le moteur de tarification (marge cible).
// Cas de référence validés avec l'user (15 % net après IS, Guadeloupe).
'use strict';

var model = require('../api/_lib/pricing-model');

module.exports = function () {
  var errors = [];
  function ok(cond, msg) { if (!cond) errors.push('[check-pricing-model] ' + msg); }
  function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (attendu ~' + b + ', obtenu ' + a + ')'); }

  var visseuse = { weight_kg: 1, ncCategory: 'power_tool', variantRole: 'solo', title: 'Visseuse nue' };
  var rColis = model.recommend(visseuse, { costHT: 62, mode: 'colissimo' });
  var rCont  = model.recommend(visseuse, { costHT: 62, mode: 'container' });

  // Petit objet léger (≤ 500 g) → lettre 8 € (pas Colissimo 14 €).
  var accessoire = { weight_kg: 0.4, ncCategory: 'accessory', title: 'Guide' };
  var rLettre = model.recommend(accessoire, { costHT: 12, mode: 'colissimo' });
  ok(rLettre.transport === 8, 'petit objet ≤500 g → lettre 8 €');
  ok(rLettre.shipKind === 'lettre', 'shipKind = lettre');
  var rColisAcc = model.recommend({ weight_kg: 1.0, ncCategory: 'accessory', title: 'X' }, { costHT: 12, mode: 'colissimo' });
  ok(rColisAcc.transport === 17 && rColisAcc.shipKind === 'colissimo', '>500 g → Colissimo (pas lettre)');

  // Objet lourd (>10 kg) en mode Colissimo → forcé bateau (tarif volumineux), pas Colissimo 143 €.
  var lourd = model.recommend({ weight_kg: 17, ncCategory: 'accessory', title: 'Piètement' }, { costHT: 160, mode: 'colissimo' });
  /* ⛔⛔ CES DEUX ASSERTIONS ONT ÉTÉ CORRIGÉES LE 10/08/2026, ET IL FAUT DIRE
     POURQUOI : elles GRAVAIENT LE DÉFAUT. « port bateau < 40 € » décrivait le
     forfait de 29 € appliqué à tout article de plus de 10 kg — or le bateau
     de La Poste (Colissimo Eco Outre-mer) coûte 39,24 € DÈS 10 kg. Une porte
     qui verrouille une valeur fausse empêche de la réparer : elle rougit quand
     on corrige. C'est le contraire de son travail.
     Ce qu'on vérifie désormais, c'est l'INVARIANT — le port d'un article lourd
     est celui de la grille postale, et il dépasse la quote-part de groupage —
     et non plus un chiffre recopié qui se périme au premier tarif. */
  ok(lourd.shipKind === 'bateau-poste', 'objet 17 kg → bateau de La Poste');
  ok(lourd.transport > model.DEFAULT_CONFIG.containerPerUnit.coffret,
    'objet lourd : le port postal dépasse la quote-part de groupage');

  ok(rColis && rColis.transport === 17, 'transport Colissimo 1 kg = 17 €');
  ok(rColis.marginAfterIS >= 0.149, 'Colissimo : marge après IS ≥ 15 % (obtenu ' + (rColis.marginAfterIS * 100).toFixed(1) + '%)');
  // Golden recalibré 25/07/2026 : +5,10 € de FTD/douane par colis (option
  // Colissimo « client ne paie rien à l'arrivée ») ajoutés au modèle → le
  // markup de référence passe de ~62 % à ~73 % pour tenir 15 % net après IS.
  near(rColis.markup * 100, 73, 8, 'Colissimo visseuse markup ~65-81 %');
  ok(rColis.douane === 5.10, 'FTD/douane 5,10 € comptée sur les envois colis');
  ok(rCont.douane === 0, 'container : pas de FTD par colis (dédouanement dans containerPerUnit)');

  ok(rCont.transport === 5.3, 'transport container nu = 5,3 €');
  ok(rCont.marginAfterIS >= 0.149, 'Container : marge après IS ≥ 15 %');
  ok(rCont.priceHt < rColis.priceHt, 'Container : prix plus bas que Colissimo (même marge)');

  var gros = { weight_kg: 3, ncCategory: 'power_tool', variantRole: 'solo', title: 'Gros outil' };
  var rg = model.recommend(gros, { costHT: 220, mode: 'colissimo' });
  ok(rg.marginAfterIS >= 0.149, 'Gros outil Colissimo : marge après IS ≥ 15 %');
  ok(rg.markup < rColis.markup, 'Gros outil : markup < petit outil (le port pèse moins)');

  near(rColis.priceHtFor.price, rColis.priceHt * 1.20, 0.02, 'price = price_ht × 1,20');

  var rTTC = model.recommend(visseuse, { costTTC: 74.40, mode: 'colissimo' });
  near(rTTC.costHT, 62, 0.1, 'costTTC 74,40 → costHT ~62');

  // Mode container : markup plus bas que Colissimo, même marge cible.
  var cfgCont = Object.assign({}, model.DEFAULT_CONFIG, { mode: 'container' });
  var rContTTC = model.recommend(visseuse, { costTTC: 74.40, mode: 'container' }, cfgCont);
  ok(rContTTC.markup < rTTC.markup, 'container : markup < Colissimo (même marge)');
  ok(rContTTC.marginAfterIS >= 0.149, 'container : marge après IS ≥ 15 %');

  // Sanitisation de la config : rejette clés inconnues, négatifs, mode invalide.
  var cfgLib = require('../api/_lib/pricing-config');
  var s = cfgLib.sanitize({ mode: 'container', targetNet: 0.15, evil: 'x', badNum: -5, refTerritory: '971' });
  ok(s.evil === undefined, 'sanitize : clé inconnue rejetée');
  ok(s.badNum === undefined, 'sanitize : nombre négatif rejeté');
  ok(s.mode === 'container', 'sanitize : mode valide conservé');
  ok(cfgLib.sanitize({ mode: 'avion' }).mode === undefined, 'sanitize : mode invalide rejeté');

  /* ══ LE BATEAU DE LA POSTE — RÈGLE DE L'USER, 10/08/2026 ══════════════════
     « Si un seul outil pèse plus de 10 kg, il passe par bateau. » Le seuil
     existait ; le COÛT était un forfait de 29 € quel que soit le poids, alors
     que Colissimo Eco Outre-mer — le bateau de La Poste — coûte 39,24 € dès
     10 kg. Mesuré sur ses 9 fiches de plus de 10 kg : **606,15 € de provision
     manquante au total, 67,35 € par vente**.
     ⛔ Ce qui est défendu ici, c'est de l'argent qui sort à chaque expédition
     lourde sans que rien ne le signale. */
  var grilles = require('../data/transport-outre-mer.json');
  ok(grilles && grilles.colissimoEco && grilles.colissimoEco._points.length > 0,
    '⚠️ PRÉALABLE : la grille du bateau de La Poste est déclarée — sans elle, rien '
    + 'de ce qui suit ne vérifie quoi que ce soit');
  /* Chaque point porte SA source : un tarif sans source est un tarif inventé. */
  var sansSource = grilles.colissimoEco._points.concat(grilles.colissimo._points)
    .filter(function (p) { return !p.source || !p.date; });
  ok(sansSource.length === 0,
    '⛔ chaque tarif de transport porte sa source ET sa date (sans source : '
    + JSON.stringify(sansSource) + ')');

  var sousSeuil = model.shipFor({ weight_kg: 9 }, 'colissimo', model.DEFAULT_CONFIG);
  ok(sousSeuil.shipKind === 'colissimo',
    '⚠️ PRÉALABLE : sous 10 kg, on reste en Colissimo — sinon l\'assertion suivante '
    + 'passerait pour la mauvaise raison (obtenu ' + sousSeuil.shipKind + ')');

  var lourd = model.shipFor({ weight_kg: 11 }, 'colissimo', model.DEFAULT_CONFIG);
  ok(lourd.shipKind === 'bateau-poste',
    '⛔ au-delà de 10 kg, l\'envoi passe par le BATEAU DE LA POSTE (obtenu '
    + lourd.shipKind + ')');
  ok(lourd.ship > model.DEFAULT_CONFIG.containerPerUnit.coffret,
    '⛔⛔ ARGENT : le bateau de La Poste coûte PLUS que la quote-part de groupage — '
    + 'les confondre sous-provisionne le transport de chaque article lourd (obtenu '
    + lourd.ship + ' € contre ' + model.DEFAULT_CONFIG.containerPerUnit.coffret + ' €)');
  /* ⛔ Le tarif retenu est un point de la grille, jamais une interpolation. */
  var tarifsGrille = {};
  grilles.colissimoEco._points.forEach(function (p) { tarifsGrille[p.prix] = 1; });
  ok(tarifsGrille[lourd.ship] === 1,
    '⛔ le tarif retenu est un POINT de la grille, pas une valeur interpolée — '
    + 'interpoler, c\'est inventer un prix de transport (obtenu ' + lourd.ship + ')');

  /* ⛔ Au-delà du plafond postal, on REFUSE de chiffrer plutôt que d'inventer. */
  var horsPoste = model.shipFor({ weight_kg: 35 }, 'colissimo', model.DEFAULT_CONFIG);
  ok(horsPoste.ship === null && horsPoste.shipKind === 'fret-devis',
    '⛔ au-delà de 30 kg La Poste ne prend plus le colis : on refuse de chiffrer '
    + '(obtenu ' + JSON.stringify(horsPoste) + ')');
  var recoHorsPoste = model.recommend({ weight_kg: 35, ncCategory: 'power_tool' },
    { costTTC: 500 }, model.DEFAULT_CONFIG);
  ok(recoHorsPoste === null,
    '⛔⛔ ARGENT : un article que La Poste ne transporte pas ne reçoit AUCUN prix '
    + 'recommandé — un prix calculé sur un transport inconnu est un prix faux '
    + '(obtenu ' + JSON.stringify(recoHorsPoste) + ')');

  /* ⚠️ Le mode container, lui, garde sa quote-part de groupage : c'est le cas
     où l'user affrète. Les deux ne doivent plus se confondre. */
  var cont = model.shipFor({ weight_kg: 20 }, 'container', model.DEFAULT_CONFIG);
  ok(cont.shipKind === 'container',
    '⚠️ PRÉALABLE : en mode container, un article lourd reste en groupage — sinon '
    + 'la règle du bateau écraserait le cas où il affrète (obtenu ' + cont.shipKind + ')');

  /* ══ DEUX DÉFAUTS DU CALCULATEUR, TROUVÉS EN LE RELISANT LIGNE PAR LIGNE ═══
     Sur son ordre du 10/08/2026 : « vérifie ligne par ligne toute la méthode de
     calcul et que rien n'est oublié ». */

  /* ⛔⛔ ① LE REPLI SILENCIEUX. `solveMarkup` bouclait jusqu'à 300 % et rendait
     ce plafond SANS RIEN DIRE quand la marge cible était inatteignable. Mesuré :
     sous 13,39 € TTC de coût, un article à 0,76 € sortait à 3,04 € — marge
     réelle −917 % — alors que les seuls frais fixes valent ~8 €. 647 des 3 581
     références de son relevé (18,1 %) sont dans cette zone. */
  var pauvre = model.recommend({ weight_kg: 1, ncCategory: 'accessory' },
    { costTTC: 1 }, model.DEFAULT_CONFIG);
  ok(pauvre && pauvre.cibleAtteinte === false,
    '⛔⛔ ARGENT : quand la marge cible est INATTEIGNABLE, le calculateur le DIT '
    + '(`cibleAtteinte:false`) au lieu de rendre son plafond en silence — sans ce '
    + 'drapeau, un article se crée à perte sans que rien ne le signale (obtenu '
    + JSON.stringify(pauvre && pauvre.cibleAtteinte) + ')');
  var riche = model.recommend({ weight_kg: 1, ncCategory: 'accessory' },
    { costTTC: 150 }, model.DEFAULT_CONFIG);
  ok(riche && riche.cibleAtteinte === true,
    '⚠️ PRÉALABLE : un coût normal atteint la cible et le dit — sinon l\'assertion '
    + 'précédente serait vraie pour tout le monde (obtenu '
    + JSON.stringify(riche && riche.cibleAtteinte) + ')');
  ok(pauvre.marginAfterIS < 0,
    '⚠️ et la marge annoncée pour ce cas est bien NÉGATIVE : le drapeau ne masque '
    + 'pas le chiffre, il l\'accompagne (obtenu ' + pauvre.marginAfterIS + ')');

  /* ⛔⛔ ② L'IMPÔT APPLIQUÉ À UNE PERTE. `netAfterIS = netOp × (1 − IS)`
     adoucissait un déficit de 15 %. Mesuré : une perte réelle de −62,53 €
     s'affichait −53,15 €. Sur un audit de prix, c'est ce qui laisse passer une
     vente à perte : elle paraît moins grave qu'elle n'est. */
  var perte = model.marginAt({ weight_kg: 1, ncCategory: 'accessory' },
    { costTTC: 100, priceHt: 50 }, model.DEFAULT_CONFIG);
  ok(perte && perte.netAfterIS === perte.netOp,
    '⛔⛔ ARGENT : aucun impôt sur une PERTE — le résultat après IS d\'un déficit '
    + 'est le déficit lui-même (obtenu netOp=' + (perte && perte.netOp)
    + ', netAfterIS=' + (perte && perte.netAfterIS) + ')');
  ok(perte && perte.is === 0,
    '⛔ et l\'IS affiché sur une perte vaut ZÉRO (obtenu ' + (perte && perte.is) + ')');
  var gain = model.marginAt({ weight_kg: 1, ncCategory: 'accessory' },
    { costTTC: 100, priceHt: 400 }, model.DEFAULT_CONFIG);
  ok(gain && gain.netAfterIS < gain.netOp && gain.is > 0,
    '⚠️ PRÉALABLE : sur un BÉNÉFICE l\'impôt s\'applique toujours — sinon les deux '
    + 'assertions ci-dessus passeraient sur un modèle qui aurait simplement '
    + 'oublié l\'IS (obtenu netOp=' + (gain && gain.netOp) + ', netAfterIS='
    + (gain && gain.netAfterIS) + ', is=' + (gain && gain.is) + ')');

  return errors;
};

// Exécution directe : node scripts/check-pricing-model.js
if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-pricing-model : moteur de tarification OK');
}
