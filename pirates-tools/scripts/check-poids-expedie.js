/* check-poids-expedie.js — LA FORMULE DU POIDS EXPÉDIÉ NE SE DÉGRADE PAS.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ CE QUE CETTE PORTE GARDE : l'ordre de l'user du 14/08/2026 — le poids
   d'un pack se COMPOSE depuis la table (nu + batteries par gamme et capacité
   + chargeur + coffret) « toujours en ajoutant un surplus de 1 kg » pour les
   accessoires, manuels et carton. Le poids fait le port, le port fait le
   prix : chaque invariant cassé ici est de la marge perdue par vente.
   Les témoins n'utilisent AUCUNE donnée du catalogue : racines et masses
   factices, formes réelles. */
'use strict';

var path = require('path');
var RACINE = path.join(__dirname, '..');

module.exports = function checkPoidsExpedie() {
  var errors = [];
  var P;
  try { P = require(path.join(RACINE, 'api/_lib/poids-expedie.js')); }
  catch (e) { return ['[check-poids-expedie] ⛔ module inchargeable : ' + e.message]; }

  var tables = { nu: { ZZR100: { kg: 3 } }, composants: {
    'BATTERIE|XR|5AH': { kg: 0.6 }, 'BATTERIE|XR|2AH': { kg: 0.35 },
    'CHARGEUR|ZZC1': { kg: 0.4 }, 'CHARGEUR|ZZC2': { kg: 0.8 },
    'COFFRET|TSTAK': { kg: 2 } } };

  /* ① LE SURPLUS D'EMBALLAGE S'AJOUTE TOUJOURS — machine nue comprise.
     C'est l'ordre exact : « il y a toujours un ou deux accessoires ainsi que
     les manuels et le carton ». Sans lui, chaque envoi est sous-facturé du
     poids du carton. */
  if (P.SURPLUS_EMBALLAGE_KG !== 1) {
    errors.push('[check-poids-expedie] ⛔⛔ ARGENT : le surplus d\'emballage vaut '
      + P.SURPLUS_EMBALLAGE_KG + ' kg au lieu de 1 kg — c\'est un ORDRE de l\'user '
      + '(14/08/2026), pas un réglage.');
  }
  var nu = P.composerDewalt('ZZR100N', tables);
  if (!nu || nu.refus || Math.abs(nu.kg - 4) > 0.001) {
    errors.push('[check-poids-expedie] ⛔⛔ ARGENT : machine nue = poids nu + surplus (attendu '
      + '3 + 1 = 4, obtenu ' + JSON.stringify(nu) + '). Sans le surplus, chaque envoi est '
      + 'sous-facturé du poids du carton et des accessoires.');
  }

  /* ② UN KIT COMPOSE TOUT : batteries × masse par (gamme, capacité), chargeur,
     surplus. P1 = 1 × 5 Ah XR. */
  var kit = P.composerDewalt('ZZR100P1', tables);
  if (!kit || kit.refus || Math.abs(kit.kg - (3 + 0.6 + 0.8 + 1)) > 0.001) {
    errors.push('[check-poids-expedie] ⛔⛔ ARGENT : le kit 1 batterie ne compose pas '
      + '(attendu 3 + 0,6 + 0,8 chargeur majorant + 1 = 5,4, obtenu ' + JSON.stringify(kit)
      + '). Un kit pesé comme une machine nue est sous-facturé du port de ses batteries.');
  }

  /* ③ LE CHARGEUR RETENU EST LE MAJORANT DE LA TABLE (M-11) : surestimer
     protège la marge. Prendre le plus léger la mangerait. */
  if (P.masseChargeurMajorante(tables.composants) !== 0.8) {
    errors.push('[check-poids-expedie] ⛔ le chargeur retenu n\'est pas le MAJORANT de la table '
      + '(obtenu ' + P.masseChargeurMajorante(tables.composants) + ', attendu 0,8).');
  }

  /* ④ LE COFFRET ANNONCÉ PAR LE SUFFIXE SE COMPTE. P2T = 2 × 5 Ah + TSTAK. */
  var coffret = P.composerDewalt('ZZR100P2T', tables);
  if (!coffret || coffret.refus
      || Math.abs(coffret.kg - (3 + 2 * 0.6 + 0.8 + 2 + 1)) > 0.001) {
    errors.push('[check-poids-expedie] ⛔ le coffret du suffixe n\'entre pas dans la composition '
      + '(attendu 3 + 1,2 + 0,8 + 2 + 1 = 8, obtenu ' + JSON.stringify(coffret) + ').');
  }

  /* ⑤ UNE MASSE ABSENTE ⇒ REFUS NOMMÉ, JAMAIS UN REPLI. Le refus est la liste
     de courses des recherches — un repli silencieux serait le « 2 kg par
     défaut » qu'on vient d'éradiquer. */
  var sansNu = P.composerDewalt('ZZR999N', tables);
  if (!sansNu || !sansNu.refus || !/ZZR999/.test(sansNu.refus)) {
    errors.push('[check-poids-expedie] ⛔⛔ ARGENT : racine sans poids nu → il faut un REFUS qui '
      + 'NOMME la racine (obtenu ' + JSON.stringify(sansNu) + '). Un repli silencieux est le '
      + '« 2 kg par défaut » qu\'on vient d\'éradiquer — 60,50 € de marge par vente.');
  }
  var sansBat = P.composerDewalt('ZZR100M1', tables);   /* 4 Ah absente */
  if (!sansBat || !sansBat.refus || !/BATTERIE\|XR\|4AH/.test(sansBat.refus)) {
    errors.push('[check-poids-expedie] ⛔ masse de batterie absente → refus qui NOMME la clé '
      + '(obtenu ' + JSON.stringify(sansBat) + ').');
  }
  var sansChg = P.composerDewalt('ZZR100P1', { nu: tables.nu,
    composants: { 'BATTERIE|XR|5AH': { kg: 0.6 } } });
  if (!sansChg || !sansChg.refus || !/chargeur/.test(sansChg.refus)) {
    errors.push('[check-poids-expedie] ⛔ aucune masse de chargeur en table → refus dit (obtenu '
      + JSON.stringify(sansChg) + ').');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-poids-expedie : le poids se compose depuis la table, +1 kg d\'emballage, refus nommés');
}
