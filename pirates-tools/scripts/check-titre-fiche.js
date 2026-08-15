/* check-titre-fiche.js — LE TITRE D'UNE OFFRE A LE DERNIER MOT SUR SON PRIX.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ LA PANNE QUE CETTE PORTE FERME, constatée par l'user le 15/08/2026
   (« le parseur ne fait pas correctement son travail ») et MESURÉE en relisant
   UN PAR UN les 400 appariements de son balayage idealo :
     · kits « DCF850N (1 x 5,0 Ah) » à 218,56 € sur la fiche NUE dont la vraie
       tuile vaut 118,86 € — hausse différée annoncée : 314,51 € ;
     · huit variantes kit DCG426 (P1/P2/M1/M2/H2…) sur la fiche nue ;
     · cinq bundles « machine & Batterie DCB182-XJ » sur la fiche de la
       batterie (216,70 € → 364,27 € annoncés) ;
     · « Lot 4 batteries DCB184 » et « 10 x DCB184 » sur la fiche d'UNE
       batterie (130,68 € → 251,36 €) ;
     · « Affleureuse & Coffret 22 Fraises DT90017-QZ » sur la fiche du coffret
       seul : 158,70 € → 605,60 €, +282 %.
   La règle écrite (« un prix de PACK ne s'écrit JAMAIS sur la réf d'un
   composant ») ne vivait que sur la voie sans-réf ; la voie par référence
   exacte ne relisait jamais le titre.

   CE QUE CETTE PORTE VÉRIFIE :
   ① `titreContreditFiche` refuse les 10 formes de tuiles FAUTIVES relevées
      dans le balayage réel — chaque témoin est un titre RÉELLEMENT vu ;
   ② elle laisse PASSER les 8 formes légitimes (nue explicite, négation de
      batterie, conditionnement normal d'un consommable, coffret NT) — une
      garde qui crie sur tout apprend à être ignorée ;
   ③ `api/admin.js` l'appelle bien au point unique d'écriture — sans le
      branchement, la fonction est un ornement.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* Témoins RÉELS — chaque titre vient du zip du 15/08/2026, lu à la main. */
var DOIVENT_ETRE_REFUSES = [
  ['DeWalt DCF850N (1 x 5,0 Ah)', 'DCF850N'],
  ['DeWalt DCH273N + 1x 4,0 Ah', 'DCH273N-XJ'],
  ['DEWALT - Scie Circulaire XR 18V - & Batterie XR 18V 4 Ah Li-Ion - DCB182-XJ', 'DCB182'],
  ['Lot 4 batteries 18V (5.0Ah) DCB184 - DEWALT', 'DCB184'],
  ['10 x DEWALT DCB184 batteries 18v 5Ah Li-ion', 'DCB184'],
  ['DeWalt DCH273 Marteau Combiné sans Fil 18V 3,5Ah avec 2 Batteries et Chargeur (DCH273S2T-QW)', 'DCH273N-XJ'],
  ['DeWalt DCS512 XR Scie Circulaire sans Balais 140mm 12V (DCS512P2-GB)', 'DCS512N'],
  ['DeWalt DCV517N-XJ - Aspirateur solides et liquides portatif à batterie - 18V 5Ah', 'DCV517N-XJ'],
  ['Dewalt DCB184-XJ XR Lot de 5 Batteries Lithium-ION 5 Ah 18 V', 'DCB184'],
  ['DEWALT DT70523TM-QZ Expositor Merchandiser DT70523T x 12', 'DT70523TM-QZ'],
  /* sans mention d'Ah : SEULE la branche « inclusion » l'attrape — c'est elle
     que ce témoin prouve faillible (sabotage du 15/08 resté vert sans lui). */
  ['DeWalt DCE530N + 1x batterie - sans chargeur', 'DCE530N-XJ']
];
var DOIVENT_PASSER = [
  ['DeWalt DCF850N', 'DCF850N'],
  ['Dewalt DCS369N-XJ Scie sabre compacte XR 18V Brushless (Machine seule)', 'DCS369N-XJ'],
  ['DeWalt DCD800N (Solo - without battery or charger)', 'DCD800N-XJ'],
  ['DeWalt DCS356NT-XJ (without battery and charger in TSTAK-Box II)', 'DCS356NT-XJ'],
  ['DeWalt Batterie XR 18V 5Ah Li-Ion (DCB184)', 'DCB184'],
  ['DeWALT Clous 34º, lisse, 90 mm, 2200 pièces - DNW3190E', 'DNW3190E'],
  ['DeWalt DCH273NT-XJ', 'DCH273NT-XJ'],
  ['DeWALT - Scie sabre compacte sans fil 18V, sans batterie DCS369N', 'DCS369N-XJ']
];

module.exports = function () {
  var errors = [];
  var pp;
  try { pp = require(path.join(RACINE, 'api/_lib/price-parse.js')); }
  catch (e) {
    errors.push('[check-titre-fiche] ⛔ price-parse.js inchargeable : ' + e.message);
    return errors;
  }
  if (typeof pp.titreContreditFiche !== 'function') {
    errors.push('[check-titre-fiche] ⛔ `titreContreditFiche` a disparu de price-parse.js : '
      + 'plus rien ne confronte le titre d\'une offre à la nature de la fiche.');
    return errors;
  }
  DOIVENT_ETRE_REFUSES.forEach(function (c) {
    if (!pp.titreContreditFiche(c[0], c[1], 'DEWALT')) {
      errors.push('[check-titre-fiche] ⛔ tuile FAUTIVE acceptée : « ' + c[0]
        + ' » → fiche ' + c[1] + '. C\'est la forme exacte du balayage du '
        + '15/08/2026 — un prix de kit/lot/bundle repartirait sur cette fiche.');
    }
  });
  DOIVENT_PASSER.forEach(function (c) {
    var m = pp.titreContreditFiche(c[0], c[1], 'DEWALT');
    if (m) {
      errors.push('[check-titre-fiche] ⛔ tuile LÉGITIME refusée : « ' + c[0]
        + ' » → ' + m + '. Une garde qui crie sur les vraies tuiles nues prive '
        + 'le traqueur de ses relevés les moins chers.');
    }
  });
  /* ③ le branchement : la fonction doit être APPELÉE au point d'écriture. */
  var adminSrc = fs.readFileSync(path.join(RACINE, 'api/admin.js'), 'utf8');
  /* ⚠️ ON CHERCHE L'APPEL EFFECTIF, PAS LE MOT. Sabotage du 15/08 :
     `null && priceParse.titreContreditFiche(...)` laissait la porte verte —
     le mot survivait, l'appel était mort. */
  if (!/const motifTitre = priceParse\.titreContreditFiche\(/.test(adminSrc)) {
    errors.push('[check-titre-fiche] ⛔ api/admin.js n\'appelle plus '
      + '`titreContreditFiche` : la garde existe mais aucune tuile ne la '
      + 'traverse — un ornement, pas un filet.');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-titre-fiche : le titre d\'une offre a le dernier mot — '
    + DOIVENT_ETRE_REFUSES.length + ' refus + ' + DOIVENT_PASSER.length + ' passages témoins');
}
