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

  /* ══ CE QUE LA CAMPAGNE DE SABOTAGE A DÉMASQUÉ (13/08/2026) ═══════════════
     `outils/sabotage-campagne.mjs` retourne mécaniquement CHAQUE décision du
     module, une par une, et relance les portes. Verdict du premier passage :
     **44 décisions tuées, 68 SURVIVANTES** — 39 % de couverture. Autrement
     dit : deux décisions d'argent sur trois pouvaient être inversées sans
     qu'aucune porte ne bronche. Les témoins ci-dessous ferment celles qui
     COÛTENT. Les autres survivantes sont des replis défensifs inatteignables
     ou du texte d'affichage : elles restent au compte-rendu de campagne, elles
     ne sont pas maquillées en témoins. */

  /* ⑤ UN LOT DE **DEUX** EST DÉJÀ UN LOT. Le seuil « plus de 1 » pouvait
     devenir « plus de 2 » sans faire rougir quoi que ce soit : tous mes
     témoins parlaient de lots de 3 ou 5. Or le lot de deux est le
     conditionnement le plus courant — le rater, c'est renoncer à l'économie. */
  var lotDeDeux = R.roleDuProduit({ type: 'batterie', famille: 'energie' },
    R.contenuDuPack('Lot de 2 Batteries Lithium-ION 5 Ah 18 V', ''));
  if (lotDeDeux !== 'lot-de-batteries') {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : un lot de DEUX batteries est classé « '
      + lotDeDeux + ' » au lieu de « lot-de-batteries ». Le lot de deux est le '
      + 'conditionnement le plus courant : ne pas le voir, c\'est renoncer à l\'économie sur '
      + 'la plus grosse part du gisement.');
  }

  /* ⑥ UNE BATTERIE SEULE N'EST PAS UNE MACHINE AVEC BATTERIES. La conjonction
     pouvait devenir une disjonction : une batterie unitaire serait alors
     « machine-avec-batteries », donc soumise à une SOUSTRACTION d'accessoires
     qui n'existent pas. */
  /* ⚠️ LE TÉMOIN DOIT ANNONCER **UNE** BATTERIE, PAS ZÉRO. Premier jet : un
     titre sans quantité (« Batterie 18V 5,0 Ah ») — il rendait bien « autre »,
     mais il l'aurait rendu AUSSI avec la conjonction retournée, puisque les
     deux termes étaient faux. Témoin vert pour la mauvaise raison (M-33). Avec
     « 1 x 5,0 Ah », la quantité est 1 : trop petite pour un lot, donc le seul
     rempart restant est bien la conjonction qu'on veut éprouver. */
  var uneBatterie = R.roleDuProduit({ type: 'batterie', famille: 'energie' },
    R.contenuDuPack('Batterie 18V 1 x 5,0 Ah Li-Ion', ''));
  if (uneBatterie === 'machine-avec-batteries') {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : une BATTERIE est classée '
      + '« machine-avec-batteries ». On lui soustrairait le prix des accessoires qu\'elle est '
      + 'censée contenir — c\'est-à-dire elle-même — et son coût tomberait près de zéro. '
      + 'Vendre sur ce coût-là, c\'est vendre à perte.');
  }

  /* ⑥ bis — ET LE LOT DE DEUX **AVEC CHARGEUR** SE DISTINGUE AUSSI. Le témoin
     du lot-avec-chargeur parlait d'un pack de trois : le seuil pouvait donc y
     glisser de « plus de 1 » à « plus de 2 » sans conséquence visible. */
  var deuxAvecChargeur = R.roleDuProduit({ type: 'batterie', famille: 'energie' },
    R.contenuDuPack('Pack 2 batteries 18V XR 5Ah + chargeur', ''));
  if (deuxAvecChargeur !== 'lot-de-batteries-avec-chargeur') {
    errors.push('[check-reconstitution] ⛔ un lot de DEUX batteries avec chargeur doit être '
      + 'distingué (obtenu « ' + deuxAvecChargeur + ' ») : divisé tel quel, le prix du '
      + 'chargeur se répartirait sur chaque batterie et fabriquerait un coût faux.');
  }

  /* ⑦ LE SEUIL D'INVRAISEMBLANCE DÉCIDE, DONC IL S'ÉPROUVE DANS SA BANDE.
     Mes deux témoins précédents tombaient l'un très au-dessus, l'autre en
     négatif : le seuil lui-même n'était jamais franchi de près, et le DOUBLER
     ne cassait rien. Ici : 300 € de pack, deux batteries à 70 et un chargeur à
     115 ⇒ reste 45 €, soit 15 % — au-dessus du seuil, donc ACCEPTÉ. Doubler le
     seuil refuserait ce cas, et la porte rougirait.
     ⚠️ ET ON DIT CE QU'ON NE SAIT PAS : ce seuil est une CONVENTION, pas une
     mesure. Il n'a PAS attrapé le cas réel du 13/08 — une machine déduite à
     23,13 € sur un pack de 184,71 €, soit 12,5 %, donc acceptée alors qu'elle
     était fausse. La vraie parade est un ORACLE INDÉPENDANT
     (`scripts/banc-valeur-bundle.js` : le même appareil vendu nu et en pack),
     pas un pourcentage. Ce témoin verrouille le seuil actuel ; il ne prétend
     pas que ce seuil soit le bon. */
  var bande = R.coutMachineNue(300, R.contenuDuPack('Machine (2 x 5,0 Ah + chargeur)', ''),
    function (q) { return q.quoi === 'batterie' ? 70 : 115; });
  if (bande.complet !== true || Math.abs(bande.total - 45) > 0.01) {
    errors.push('[check-reconstitution] ⛔ le SEUIL d\'invraisemblance n\'est pas éprouvé dans '
      + 'sa bande : un reste de 45 EUR sur 300 EUR (15 %) doit être ACCEPTÉ (obtenu complet='
      + bande.complet + ' total=' + bande.total + '). Sans ce témoin, le seuil peut doubler '
      + 'sans que rien ne le dise — et un seuil qu\'on déplace sans conséquence n\'est pas un '
      + 'seuil.');
  }

  /* ⑧ UN COFFRET DONT LE PRIX EST CONNU ENTRE DANS LE TOTAL, MÊME PETIT. Le
     test « prix connu » pouvait glisser d'un cran : un coffret à 1 € serait
     alors compté zéro. Un euro n'est pas rien quand il se répète à chaque
     ligne du catalogue. */
  var avecCoffret = R.coutReconstitue(R.contenuDuPack('Pack 1 batterie 5,0 Ah + coffret', ''),
    function (q) { return q.quoi === 'coffret' ? 1 : 50; });
  if (avecCoffret.complet !== true || Math.abs(avecCoffret.total - 51) > 0.01) {
    errors.push('[check-reconstitution] ⛔ un coffret dont le prix est CONNU entre dans le '
      + 'total, si petit soit-il (attendu 50 + 1 = 51, obtenu ' + avecCoffret.total + '). '
      + 'Un seuil placé juste au-dessus le ferait disparaître sans un mot.');
  }

  /* ⑨ UNE MACHINE À **UNE SEULE** BATTERIE EST UN PACK. C'est le
     conditionnement le plus répandu (« 1 x 5,0 Ah + chargeur »). Le seuil
     pouvait passer de « au moins une batterie » à « au moins deux » sans qu'on
     s'en aperçoive : ces packs cessaient alors d'être reconstituables, et
     l'économie se perdait — en silence, comme toujours. */
  var machineUneBat = R.roleDuProduit({ type: 'perceuse-visseuse', famille: 'machine' },
    R.contenuDuPack('Perceuse-visseuse 18V (1 x 5,0 Ah + chargeur)', ''));
  if (machineUneBat !== 'machine-avec-batteries') {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : une machine livrée avec UNE batterie est '
      + 'classée « ' + machineUneBat + ' » au lieu de « machine-avec-batteries ». C\'est le '
      + 'conditionnement le plus répandu : le rater, c\'est renoncer à reconstituer la plus '
      + 'grande partie du catalogue.');
  }

  /* ⑩ UN RESTE DÉRISOIRE MAIS POSITIF EST REFUSÉ. Mes deux témoins encadraient
     le seuil par le haut (45 sur 300, accepté) et par le très bas (reste
     NÉGATIF, refusé) — mais un reste POSITIF et minuscule ne passait par
     aucun des deux. Or c'est précisément lui qui fait vendre à perte : une
     machine « à 15 € » se vendrait au prix d'une machine à 15 €. */
  var derisoire = R.coutMachineNue(300, R.contenuDuPack('Machine (2 x 5,0 Ah + chargeur)', ''),
    function (q) { return q.quoi === 'batterie' ? 130 : 25; });
  if (derisoire.complet !== false) {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : un reste POSITIF mais dérisoire (15 EUR '
      + 'sur 300) doit être REFUSÉ (obtenu complet=' + derisoire.complet + ' total='
      + derisoire.total + '). Un coût de machine à 15 EUR ferait vendre à perte, et il est '
      + 'exactement du même genre que la perceuse « à 23,13 EUR » mesurée le 13/08.');
  }

  /* ⑪ UNE RECONSTITUTION REFUSÉE NE SERT JAMAIS DE COÛT. Le test pouvait
     devenir une conjonction : un résultat `complet: false` (donc un total
     `null`) échappait alors au repli sur le pack et ressortait comme
     « reconstitué » avec un coût NUL. Un coût nul, c'est tout donner. */
  var refusee = R.meilleurCout(250, { complet: false, total: null, detail: [] });
  if (refusee.origine !== 'pack' || refusee.retenu !== 250) {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : une reconstitution REFUSÉE doit faire '
      + 'garder le prix du PACK (obtenu origine=' + refusee.origine + ' retenu='
      + refusee.retenu + '). Sinon un refus ressort comme un coût — et un coût nul, c\'est '
      + 'donner la marchandise.');
  }
  var sansPrixDuPack = R.meilleurCout(0, null);
  if (sansPrixDuPack.origine !== 'aucun' || sansPrixDuPack.retenu !== null) {
    errors.push('[check-reconstitution] ⛔ sans prix de pack ET sans reconstitution, on ne '
      + 'retient RIEN (obtenu origine=' + sansPrixDuPack.origine + '). Rendre un coût ici '
      + 'serait l\'inventer.');
  }

  /* ⑫ LE COÛT UNITAIRE D'UN LOT SE CALCULE VRAIMENT. C'est la fonction qui
     porte l'économie mesurée sur ses relevés (une batterie à 63,85 € au lieu
     de 99,57 €). Elle pouvait être neutralisée — rendre `null` en toutes
     circonstances — sans qu'aucune porte ne le dise. */
  var meilleur = R.meilleurCoutUnitaire([
    { quantite: 1, prix: 99.57 }, { quantite: 10, prix: 638.45 }, { quantite: 5, prix: 323.94 }
  ]);
  if (!meilleur || meilleur.quantite !== 10 || Math.abs(meilleur.unitaire - 63.85) > 0.01) {
    errors.push('[check-reconstitution] ⛔⛔ ARGENT : le meilleur coût unitaire d\'un ensemble '
      + 'd\'offres n\'est pas trouvé (attendu 63,85 EUR par le lot de 10, obtenu '
      + JSON.stringify(meilleur) + '). C\'est cette fonction qui porte l\'économie : '
      + 'neutralisée, on paie le prix de la carte à l\'unité.');
  }
  if (R.meilleurCoutUnitaire([]) !== null || R.meilleurCoutUnitaire(null) !== null) {
    errors.push('[check-reconstitution] ⛔ …et sans offre, elle rend `null` — sinon '
      + '« toujours null » passerait le contrôle précédent.');
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
