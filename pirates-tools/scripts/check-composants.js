/* check-composants.js — LA TABLE DES PIÈCES DÉTACHÉES NE DOIT PAS MENTIR.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CETTE PORTE EXISTE. Le calculateur de pack ne vaut que ce que
   valent ses ENTRÉES. Le 13/08/2026, sur les trois relevés de l'user, la
   première table de composants a fait entrer, chacun mesuré :
     · « Makita DKP180ZJ … without Battery and Charger » → 175,04 € rangés
       comme le prix d'un CHARGEUR. C'est un rabot, et la phrase dit que le
       chargeur est ABSENT ;
     · « DeWalt Kit batterie DCBP 034 E3 3x batterie … 1,7 Ah » → 210,53 €
       rangés comme le prix d'UNE batterie ;
     · « DEWALT Chargeur Mural USB-C GaN 100W » → rangé comme un chargeur
       d'outil.
   Chacun de ces prix, injecté dans la soustraction qui déduit le coût d'une
   machine nue, fabrique un coût faux. Et un coût faux, c'est un prix de vente
   faux — donc de l'argent perdu à chaque commande.

   ⚠️ Les cinq invariants ci-dessous sont ceux dont la violation COÛTE. Chacun
   est prouvé faillible par `outils/sabotage.mjs`.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');
var RACINE = path.join(__dirname, '..');

module.exports = function checkComposants() {
  var errors = [];
  var B;
  try { B = require(path.join(RACINE, 'scripts/banc-composants.js')); }
  catch (e) {
    errors.push('[check-composants] ⛔ module inchargeable : ' + e.message);
    return errors;
  }
  ['estNegation', 'estPieceDeTiers', 'batterieUnitaire', 'lotDeBatteries',
    'chargeurSeul', 'valeursVolt', 'construire'].forEach(function (f) {
    if (typeof B[f] !== 'function') {
      errors.push('[check-composants] ⛔ `' + f + '` absente : la table est incomplète');
    }
  });
  if (errors.length) return errors;

  /* Une offre factice, de la forme exacte que rend `tuilesDe`. Aucun libellé
     du catalogue de l'user n'est nommé : ce sont des formes, pas des produits. */
  function offre(texte, prix, typ, fam) {
    return { texte: texte, descr: '', prix: prix, typ: typ || 'batterie',
      fam: fam || 'energie', sku: null, rej: null, source: 'temoin' };
  }
  var MQ = ['MARQUEA', 'MARQUEB'];

  /* ① LA NÉGATION, DANS LES TROIS LANGUES DU COMPARATEUR. Le comparateur
     agrège des vendeurs de toute l'Europe : une détection qui ne parle que
     français laisse entrer un prix de MACHINE dans la table des pièces. */
  [['sans batterie ni chargeur', 'francais'],
    ['without Battery and Charger', 'anglais'],
    ['ohne Akku und Ladegerät', 'allemand']].forEach(function (cas) {
    if (!B.estNegation('MarqueA XY123 ' + cas[0])) {
      errors.push('[check-composants] ⛔⛔ ARGENT : « ' + cas[0] + ' » (' + cas[1] + ') n\'est '
        + 'pas reconnu comme une NÉGATION. Le titre parle de la pièce POUR DIRE QU\'ELLE EST '
        + 'ABSENTE : la compter comme une pièce vendue seule range un prix de MACHINE dans la '
        + 'table, et la soustraction qui en découle fabrique un coût faux.');
    }
  });
  /* …et le témoin inverse : sans lui, « toujours vrai » passerait le contrôle. */
  if (B.estNegation('MarqueA batterie 18 V 5,0 Ah')) {
    errors.push('[check-composants] ⛔ une carte de batterie ordinaire est prise pour une '
      + 'négation : la table se viderait en silence et le calculateur refuserait tout.');
  }

  /* ② UN LOT SE DIVISE PAR SON COMPTE, ET UNE CARTE UNITAIRE NE SE DIVISE PAS.
     C'est la demande de l'user : « 372 € pour cinq batteries, c'est du grand
     n'importe quoi ». Sans division, le coût unitaire reste celui de la carte
     la plus chère — et on refuse des reconstitutions pourtant gagnantes. */
  var lot = B.lotDeBatteries(offre('MarqueA Lot de batteries 10 x XY123 18V Li-Ion - 10 X 5.0Ah', 638.45), MQ);
  if (!lot || lot.quantite !== 10 || lot.ah !== 5 || lot.volt !== 18) {
    errors.push('[check-composants] ⛔⛔ ARGENT : un lot de 10 batteries annoncé au titre n\'est '
      + 'pas lu comme tel (obtenu ' + JSON.stringify(lot) + '). Sans lui, le coût unitaire '
      + 'reste celui de la carte à l\'unité — mesuré 36 % au-dessus du coût atteignable.');
  }
  /* ⚠️ PREMIER TÉMOIN, ÉCRIT PUIS JETÉ : je vérifiais qu'une carte « Batterie
     18V 5,0Ah » n'était pas divisée. Le sabotage du seuil de quantité l'a
     laissé VERT — parce que ce titre n'annonce AUCUN compte, et qu'il tombait
     donc sur un refus antérieur. Un témoin qui réussit pour une autre raison
     ne témoigne de rien (M-33). Le voici remplacé par le cas qui COÛTE :
     ⛔⛔ UNE MACHINE LIVRÉE AVEC DEUX BATTERIES NE SE DIVISE JAMAIS. C'est
     l'erreur du 13/08/2026 : une clé à chocs à 235 € divisée par deux
     ressortait à 117,50 €, comme s'il y avait deux clés à chocs. Il n'y en a
     qu'UNE — et vendre sur ce coût-là, c'est vendre à perte. */
  var machine = B.lotDeBatteries(
    offre('MarqueA Cle a chocs XY123 18V 2 x 5,0 Ah batteries', 235, 'clé à chocs', 'machine'), MQ);
  if (machine) {
    errors.push('[check-composants] ⛔⛔ ARGENT : une MACHINE livrée avec deux batteries est '
      + 'lue comme un LOT et serait DIVISÉE par deux (obtenu ' + JSON.stringify(machine)
      + '). Son coût tomberait à la moitié de sa valeur : c\'est exactement l\'erreur du '
      + '13/08/2026, et elle fait vendre à perte.');
  }

  /* ③ UN LOT QUI EMBARQUE AUTRE CHOSE NE SE DIVISE PAS. Le « + » joint une
     pièce dont le prix est dans le total : le répartir sur les batteries
     fabrique un coût unitaire trop HAUT, et fait renoncer à l'économie. */
  if (B.lotDeBatteries(offre('MarqueA Source Kit 18V AB123 +CD456 (2x Battery 5 Ah)', 378.98), MQ)) {
    errors.push('[check-composants] ⛔ ARGENT : un lot dont le titre joint une autre pièce par '
      + '« + » est quand même divisé. Le prix de cette pièce se répartit alors sur chaque '
      + 'batterie : coût unitaire faux, économie perdue.');
  }

  /* ④ UN CHARGEUR SANS TENSION N'EST PAS UN CHARGEUR D'OUTIL. Le mot est le
     même pour un chargeur de téléphone ou de véhicule ; l'objet n'a rien à
     voir, et son prix non plus. On exige la PREUVE, pas l'absence de doute. */
  if (B.chargeurSeul(offre('MarqueA Chargeur Mural USB-C GaN 100W EU', 84.99, 'chargeur'), MQ)) {
    errors.push('[check-composants] ⛔⛔ ARGENT : un chargeur SANS TENSION annoncée entre dans '
      + 'la table des chargeurs d\'outil. Un chargeur de téléphone y ferait office de prix de '
      + 'pièce, et toute soustraction bâtie dessus serait fausse.');
  }
  if (!B.chargeurSeul(offre('MarqueA Chargeur rapide XY 12 V - 18 V Li-Ion 6 A', 97.73, 'chargeur'), MQ)) {
    errors.push('[check-composants] ⛔ …et un vrai chargeur d\'outil, lui, doit entrer. Sans ce '
      + 'témoin, « refuser tout chargeur » passerait le contrôle précédent.');
  }

  /* ⑤ LES MARQUES ARRIVENT DE L'EXTÉRIEUR. Une liste de marques écrite en dur
     dans la porte devient muette le jour où l'user en ajoute une — et une
     pièce d'un TIERS entre alors dans la table comme si elle était d'origine. */
  if (!B.estPieceDeTiers('Batterie SOCIETEX pour MARQUEA 18V 5Ah', MQ)) {
    errors.push('[check-composants] ⛔⛔ ARGENT : « pour <marque> » n\'est pas reconnu comme une '
      + 'pièce de TIERS alors que la marque est fournie. Une batterie d\'un tiers n\'est pas '
      + 'celle du pack : son prix ne dit rien du coût réel.');
  }
  if (B.estPieceDeTiers('Batterie SOCIETEX pour MARQUEA 18V 5Ah', [])) {
    errors.push('[check-composants] ⛔ la détection « pour <marque> » réussit même SANS marque '
      + 'fournie : la liste est donc écrite en dur quelque part. Un harnais ne nomme jamais une '
      + 'donnée du catalogue, et une liste en dur ne suivra pas les marques de l\'user.');
  }

  /* ⚠️ PRÉALABLE — deux tensions séparées par « / » sont DEUX tensions.
     Une batterie bi-tension n'appartient à aucune des deux plateformes seules :
     la ranger dans l'une fabrique un composant qui n'existe pas. */
  var v = B.valeursVolt('Batterie 18/54V 9,0Ah');
  if (!(v.length === 2 && v.indexOf(18) >= 0 && v.indexOf(54) >= 0)) {
    errors.push('[check-composants] ⛔ PRÉALABLE : « 18/54V » doit rendre DEUX tensions (obtenu '
      + JSON.stringify(v) + ') — sinon une batterie bi-tension passe pour une simple 54 V et '
      + 'entre dans la table d\'une plateforme à laquelle elle n\'appartient pas.');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-composants : la table des pieces ne range que ce qui est prouve');
}
