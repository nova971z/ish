/* check-reconstitution.js — LE CALCULATEUR DE PACK NE DOIT PAS INVENTER.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CETTE PORTE EXISTE : parce que la première version de ce
   calculateur, écrite le 13/08/2026, a produit un chiffre FAUX en cinq
   minutes. Elle divisait le prix par le nombre de batteries annoncées, pour
   TOUT produit. Résultat mesuré sur son relevé : une clé à chocs vendue 235 €
   « (2 x 2,0 Ah + DCB107 + TSTAK II) » ressortait à **117,50 €**, comme s'il y
   avait deux clés à chocs. Il n'y en a qu'UNE. J'avais annoncé « 51 références
   gagnantes, 9 078 € d'économie » — entièrement bâti sur cette division.

   ⇒ La leçon tient en une phrase : **diviser n'a de sens que si le produit EST
   l'article qu'on compte.** Un lot de batteries se divise ; une machine livrée
   avec deux batteries se RECONSTITUE par soustraction.

   ⚠️ Cette porte vérifie les quatre invariants d'argent du module, chacun
   prouvé faillible :
     ① une MACHINE avec batteries n'est jamais divisée ;
     ② un composant sans prix ⇒ REFUS, jamais un total amputé ;
     ③ un reste invraisemblable après soustraction ⇒ REFUS ;
     ④ à prix égal on garde le PACK — l'user paie une commande, pas trois.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');
var RACINE = path.join(__dirname, '..');

module.exports = function checkReconstitution() {
  var errors = [];
  var R;
  try { R = require(path.join(RACINE, 'api/_lib/reconstitution.js')); }
  catch (e) {
    errors.push('[check-reconstitution] ⛔ module inchargeable : ' + e.message);
    return errors;
  }
  ['contenuDuPack', 'coutReconstitue', 'meilleurCout', 'meilleurCoutUnitaire',
    'roleDuProduit', 'coutMachineNue'].forEach(function (f) {
    if (typeof R[f] !== 'function') {
      errors.push('[check-reconstitution] ⛔ `' + f + '` absente : le calculateur est incomplet');
    }
  });
  if (errors.length) return errors;

  /* ① UNE MACHINE AVEC BATTERIES N'EST JAMAIS UN LOT — le défaut du 13/08. */
  var packMachine = R.contenuDuPack('Cle a chocs (2 x 2,0 Ah + chargeur + coffret)', '');
  var roleMachine = R.roleDuProduit({ type: 'visseuse a chocs', famille: 'machine' }, packMachine);
  if (roleMachine !== 'machine-avec-batteries') {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : une MACHINE livrée avec deux batteries '
      + 'est classée « ' + roleMachine + ' » au lieu de « machine-avec-batteries ». Divisée '
      + 'par deux, elle vaudrait la moitie de son prix — un coût qui n\'existe pas, et qui '
      + 'ferait vendre à perte. C\'est exactement l\'erreur du 13/08/2026.');
  }
  var roleLot = R.roleDuProduit({ type: 'batterie', famille: 'energie' },
    R.contenuDuPack('Lot de 5 Batteries Lithium-ION 5 Ah 18 V', ''));
  if (roleLot !== 'lot-de-batteries') {
    errors.push('[check-reconstitution] ⛔ un LOT DE BATTERIES est classé « ' + roleLot
      + '] » : sans lui, on ne peut pas déduire le coût unitaire, et on paie le prix fort.');
  }
  /* ⚠️ Et un lot de batteries VENDU AVEC un chargeur ne se divise pas non plus :
     le chargeur est dans le prix. */
  var roleLotChargeur = R.roleDuProduit({ type: 'batterie', famille: 'energie' },
    R.contenuDuPack('Pack 3 batteries 18V XR 5Ah + chargeur', ''));
  if (roleLotChargeur !== 'lot-de-batteries-avec-chargeur') {
    errors.push('[check-reconstitution] ⛔ un lot de batteries AVEC chargeur doit être '
      + 'distingué (obtenu « ' + roleLotChargeur + ' ») : le diviser tel quel répartirait '
      + 'le chargeur sur chaque batterie et fabriquerait un coût faux.');
  }

  /* ② UN COMPOSANT SANS PRIX ⇒ REFUS. Un total amputé est plus bas que la
     vérité, et un coût trop bas fait vendre à perte. */
  /* ⚠️ C'est la BATTERIE dont le prix manque, pas le chargeur. Premier jet :
     je faisais manquer le chargeur — le refus venait bien, mais par l'autre
     branche, et le sabotage « ignorer une batterie sans prix » passait sans
     faire rougir la porte. Un témoin qui peut réussir pour une autre raison ne
     témoigne de rien (M-33). */
  var sansPrix = R.coutReconstitue(R.contenuDuPack('Pack 2 batteries 5,0 Ah + chargeur', ''),
    function (q) { return q.quoi === 'chargeur' ? 40 : 0; });
  if (sansPrix.complet !== false || sansPrix.total !== null) {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : un composant dont le prix est INCONNU '
      + 'doit faire REFUSER la reconstitution (obtenu complet=' + sansPrix.complet
      + ' total=' + sansPrix.total + '). Un total amputé d\'une pièce est plus bas que la '
      + 'réalité — donc une vente à perte.');
  }
  var complet = R.coutReconstitue(R.contenuDuPack('Pack 2 batteries 5,0 Ah + chargeur', ''),
    function (q) { return q.quoi === 'batterie' ? 50 : 40; });
  if (complet.complet !== true || Math.abs(complet.total - 140) > 0.01) {
    errors.push('[check-reconstitution] ⛔ …et quand TOUS les prix sont connus, le total '
      + 'se calcule (attendu 2×50 + 40 = 140, obtenu ' + complet.total + '). Sans ce '
      + 'témoin, « refuser toujours » passerait le contrôle précédent.');
  }

  /* ③ UN RESTE INVRAISEMBLABLE APRÈS SOUSTRACTION ⇒ REFUS. */
  var absurde = R.coutMachineNue(100, R.contenuDuPack('Machine (2 x 5,0 Ah + chargeur)', ''),
    function (q) { return q.quoi === 'batterie' ? 60 : 40; });
  if (absurde.complet !== false) {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : quand les accessoires « valent » plus '
      + 'que le pack entier, le reste est absurde et doit être REFUSÉ (obtenu complet='
      + absurde.complet + ' total=' + absurde.total + '). Un coût de machine à quelques '
      + 'euros ferait vendre à perte.');
  }
  var sain = R.coutMachineNue(300, R.contenuDuPack('Machine (2 x 5,0 Ah + chargeur)', ''),
    function (q) { return q.quoi === 'batterie' ? 60 : 40; });
  if (sain.complet !== true || Math.abs(sain.total - 140) > 0.01) {
    errors.push('[check-reconstitution] ⛔ …et une soustraction saine aboutit (attendu '
      + '300 − 2×60 − 40 = 140, obtenu ' + sain.total + ') : sans ce témoin, « refuser '
      + 'toujours » passerait le contrôle précédent.');
  }

  /* ④ À PRIX ÉGAL, ON GARDE LE PACK. */
  var egal = R.meilleurCout(140, { complet: true, total: 140, detail: [{}] });
  if (egal.origine !== 'pack') {
    errors.push('[check-reconstitution] ⛔ à prix ÉGAL on garde le PACK (obtenu « '
      + egal.origine + ' ») : une seule commande vaut mieux que trois, et c\'est ce que '
      + 'l\'user paierait réellement.');
  }
  var moinsCher = R.meilleurCout(250, { complet: true, total: 163.88, detail: [{}] });
  if (moinsCher.origine !== 'reconstitue' || Math.abs(moinsCher.economie - 86.12) > 0.01) {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : quand reconstituer coûte MOINS cher, '
      + 'c\'est la reconstitution qui gagne, et l\'économie est chiffrée (obtenu origine='
      + moinsCher.origine + ' economie=' + moinsCher.economie + '). C\'est la demande de '
      + 'l\'user : « le parseur doit chercher à créer les meilleurs prix ».');
  }

  /* ⚠️ PRÉALABLE — un titre qui n'annonce aucun contenu ne fabrique pas de pack. */
  if (R.contenuDuPack('Batterie 18V XR Li-Ion 5,0 Ah', '') !== null) {
    errors.push('[check-reconstitution] ⛔ PRÉALABLE : un titre sans contenu multiple rend '
      + '`null` — sinon tout produit deviendrait un pack à reconstituer.');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-reconstitution : le calculateur de pack ne divise que ce qui se divise');
}
