/* check-nomenclature-milwaukee.js — CE QUE LE SUFFIXE DIT DE LA BOÎTE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CETTE PORTE EXISTE. Cette marque n'a **aucune fiche au
   catalogue** au jour où j'écris (mesuré : 0 sur 1 708). Tout ce qui suit est
   donc préparatoire — et c'est précisément le bon moment pour poser le filet :
   « le poser AVANT, jamais après ». Le jour où les fiches entreront, ce
   suffixe décidera de ce qu'on croit acheter, donc d'un coût, donc d'un prix.

   ⛔ LE FAIT QUI COMMANDE LA CONCEPTION : cette marque **ne publie aucune
   légende officielle de ses suffixes** (vérifié sur le Web le 13/08/2026 —
   c'est la liste « In the Box » de chaque fiche qui fait foi). La grammaire
   encodée est donc VOLONTAIREMENT étroite : ce qui est recoupé passe, tout le
   reste est REFUSÉ. Cette porte vérifie les deux moitiés — ce qui doit passer,
   et surtout ce qui doit être refusé.

   ⚠️ Mesure au jour du gravage, sur le relevé de l'user (67 pages, 3 929
   produits distincts, 747 avec un conditionnement lisible) :
     · 497 produits décodés (238 581 €), dont **404 outils NUS** ;
     · 42 produits refusés (26 276 €) — les formes ambiguës, listées ;
     · soit **92 %** des produits à conditionnement.

   ⚠️ Porte restaurée à l'identique après la perte du bac de travail dans une
   réinitialisation de session (le premier gravage n'avait pas été poussé) —
   ses quatre sabotages ont été REJOUÉS après restauration, pas présumés.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');
var RACINE = path.join(__dirname, '..');

module.exports = function checkNomenclatureMilwaukee() {
  var errors = [];
  var n;
  try { n = require(path.join(RACINE, 'api/_lib/nomenclature.js')); }
  catch (e) {
    errors.push('[check-nomenclature-milwaukee] ⛔ nomenclature inchargeable : ' + e.message);
    return errors;
  }
  if (typeof n.lireSuffixeMilwaukee !== 'function') {
    errors.push('[check-nomenclature-milwaukee] ⛔ `lireSuffixeMilwaukee` absente : le '
      + 'conditionnement de cette marque ne serait lu par personne.');
    return errors;
  }
  /* ⛔ La marque se lit dans les plans du traqueur, jamais écrite ici : « un
     harnais ne nomme jamais une donnée du catalogue ». On prend celle dont la
     nomenclature accepte le suffixe nu — c'est-à-dire celle que cette table
     sert. */
  var MQ = null;
  try {
    var plans = require(path.join(RACINE, 'api/_lib/traqueur-plans.js'));
    Object.keys(plans.PLANS || {}).forEach(function (k) {
      var m = String(k).split('@')[0].trim();
      if (!MQ && n.lireSuffixeMilwaukee('0', m)) MQ = m;
    });
  } catch (e) { /* remonté par le préalable ci-dessous */ }
  if (!MQ) {
    errors.push('[check-nomenclature-milwaukee] ⛔ PRÉALABLE : aucune marque des plans du '
      + 'traqueur n\'est servie par cette table — la porte n\'aurait rien vérifié.');
    return errors;
  }

  /* ① L'OUTIL NU EST NU. C'est la forme la plus fréquente du relevé : 404
     produits sur 497 décodés, 176 867 €. Si elle basculait, on soustrairait le
     prix de batteries FANTÔMES au prix de ces machines — leur coût
     s'effondrerait, et on vendrait à perte. */
  var nu = n.lireSuffixeMilwaukee('0', MQ);
  if (!nu || nu.nbBatteries !== 0 || nu.chargeur !== false || nu.nu !== true) {
    errors.push('[check-nomenclature-milwaukee] ⛔⛔ ARGENT : le suffixe de l\'outil NU ne rend '
      + 'pas un contenu vide (obtenu ' + JSON.stringify(nu) + '). C\'est la forme la plus '
      + 'fréquente du relevé — 404 produits. Lui prêter des batteries ferait soustraire le prix '
      + 'de pièces absentes, et le coût de la machine s\'effondrerait : vente à perte.');
  }

  /* ② LA LETTRE FINALE NE CHANGE QUE LA CAISSE, JAMAIS LES BATTERIES.
     C'est le point recoupé sur cinq revendeurs : la même référence en « X »
     (caisse renforcée) et en « C » (coffret standard) contient les mêmes deux
     batteries et le même chargeur. Confondre la caisse et le contenu ferait
     compter une batterie de plus ou de moins selon l'emballage. */
  var avecX = n.lireSuffixeMilwaukee('502X', MQ);
  var avecC = n.lireSuffixeMilwaukee('502C', MQ);
  if (!avecX || !avecC
      || avecX.nbBatteries !== avecC.nbBatteries || avecX.ah !== avecC.ah
      || avecX.chargeur !== avecC.chargeur) {
    errors.push('[check-nomenclature-milwaukee] ⛔⛔ ARGENT : deux emballages de la MÊME '
      + 'configuration ne rendent pas le même contenu (obtenu ' + JSON.stringify(avecX)
      + ' contre ' + JSON.stringify(avecC) + '). Recoupé sur cinq revendeurs : la lettre finale '
      + 'change la CAISSE, jamais les batteries. Les confondre fait compter une pièce de plus '
      + 'ou de moins selon l\'emballage — et une batterie vaut des dizaines d\'euros.');
  }
  if (avecX && (avecX.nbBatteries !== 2 || avecX.ah !== 5 || avecX.chargeur !== true)) {
    errors.push('[check-nomenclature-milwaukee] ⛔⛔ ARGENT : la configuration recoupée sur cinq '
      + 'revendeurs — deux batteries de 5 Ah et un chargeur — n\'est pas rendue (obtenu '
      + JSON.stringify(avecX) + '). C\'est la seule dont le contenu soit établi par des sources '
      + 'indépendantes : si elle tombe, plus rien n\'est vérifié.');
  }
  if (avecX && avecC && avecX.coffret === avecC.coffret) {
    errors.push('[check-nomenclature-milwaukee] ⛔ …et la lettre doit tout de même être RENDUE, '
      + 'distincte : sans elle on ne saurait plus dire quelle caisse est livrée, et deux '
      + 'conditionnements différents deviendraient indiscernables.');
  }

  /* ③ UNE FORME AMBIGUË EST REFUSÉE, JAMAIS DEVINÉE.
     ⛔ Ces formes existent dans son relevé (42 produits, 26 276 €) et **aucune
     source ne dit comment les lire** : deux capacités mêlées ? une capacité à
     deux chiffres ? Les deviner reviendrait à inventer un contenu — donc un
     coût. Le refus se voit et se corrige ; un coût faux, non. */
  ['422X', '522C', '523B', '533P', '624P', '310C', '120',
    '121C', '122', '820', 'B2', 'C402', 'M12'].forEach(function (s) {
    if (n.lireSuffixeMilwaukee(s, MQ)) {
      errors.push('[check-nomenclature-milwaukee] ⛔⛔ ARGENT : la forme ambiguë « ' + s + ' » '
        + 'est DÉCODÉE alors qu\'aucune source ne dit comment la lire (obtenu '
        + JSON.stringify(n.lireSuffixeMilwaukee(s, MQ)) + '). Deviner un contenu, c\'est '
        + 'inventer un coût : trop de batteries et la machine nue déduite s\'effondre — vente '
        + 'à perte ; trop peu et elle gonfle — ventes perdues.');
    }
  });

  /* ④ ET LES FORMES ÉTABLIES, ELLES, DOIVENT PASSER. Sans ce témoin,
     « refuser tout » satisferait le contrôle précédent. */
  [['201', 1, 2], ['202', 2, 2], ['302', 2, 3], ['402', 2, 4],
    ['501', 1, 5], ['504', 4, 5], ['602', 2, 6], ['802', 2, 8]].forEach(function (cas) {
    var r = n.lireSuffixeMilwaukee(cas[0], MQ);
    if (!r || r.nbBatteries !== cas[1] || r.ah !== cas[2]) {
      errors.push('[check-nomenclature-milwaukee] ⛔ la forme régulière « ' + cas[0] + ' » doit '
        + 'rendre ' + cas[1] + ' batterie(s) de ' + cas[2] + ' Ah (obtenu ' + JSON.stringify(r)
        + '). Sans ces témoins, « tout refuser » passerait le contrôle des formes ambiguës — et '
        + 'une nomenclature qui refuse tout ne renseigne aucune fiche.');
    }
  });

  /* ⑤ UNE CAPACITÉ AVEC ZÉRO BATTERIE N'EST PAS UN CONTENU.
     ⚠️ PREMIER TÉMOIN, ÉCRIT PUIS JETÉ. Je visais « 820 » — mais « 820 » ne
     ressemble PAS à la forme régulière, il est donc refusé bien avant
     d'atteindre cette garde. Retirer la garde laissait le contrôle VERT : le
     témoin réussissait pour une autre raison (M-33). Il faut une forme qui
     ressemble à la grammaire régulière et n'annonce pourtant aucune batterie —
     capacité lisible, compte à zéro. */
  var zero = n.lireSuffixeMilwaukee('500', MQ);
  if (zero) {
    errors.push('[check-nomenclature-milwaukee] ⛔⛔ ARGENT : une capacité annoncée avec ZÉRO '
      + 'batterie est acceptée (obtenu ' + JSON.stringify(zero) + '). Elle ressemble à la '
      + 'grammaire régulière sans en être : l\'accepter appliquerait le contenu d\'un ensemble '
      + 'à ce qui n\'en est pas un. Le coût qui en sort est faux dans un sens ou dans l\'autre.');
  }

  /* ⑥ SÉPARATION DES MARQUES (M-28). Cette table appartient à UNE marque.
     Appliquée à une autre, elle lirait « 502 » avec une grammaire qui n'est pas
     la sienne — et rapprocher deux marques fait BAISSER un coût, donc vendre
     à perte. */
  var autres = [];
  try {
    var pl = require(path.join(RACINE, 'api/_lib/traqueur-plans.js'));
    Object.keys(pl.PLANS || {}).forEach(function (k) {
      var m = String(k).split('@')[0].trim();
      if (m && m.toUpperCase() !== MQ.toUpperCase() && autres.indexOf(m) < 0) autres.push(m);
    });
  } catch (e) { /* déjà remonté */ }
  if (!autres.length) {
    errors.push('[check-nomenclature-milwaukee] ⛔ PRÉALABLE : aucune AUTRE marque aux plans — '
      + 'la garde de séparation ne peut pas être éprouvée, donc elle n\'est pas vérifiée.');
  }
  autres.forEach(function (m) {
    if (n.lireSuffixeMilwaukee('502X', m)) {
      errors.push('[check-nomenclature-milwaukee] ⛔⛔ ARGENT : la table d\'UNE marque lit le '
        + 'suffixe d\'une AUTRE. C\'est le défaut M-28, et son sens est le pire : il fait '
        + 'BAISSER un coût, donc vendre à perte.');
    }
  });
  if (n.lireSuffixeMilwaukee('502X', '')) {
    errors.push('[check-nomenclature-milwaukee] ⛔ sans marque, on ne lit RIEN : on ne saurait '
      + 'pas dans quelle table chercher, et deviner est l\'erreur qu\'on interdit.');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-nomenclature-milwaukee : le suffixe ne dit que ce qui est recoupé');
}
