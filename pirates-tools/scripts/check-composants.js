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

  /* ══ CE QUE LA CAMPAGNE DE SABOTAGE A DÉMASQUÉ ICI (13/08/2026) ═══════════
     `outils/sabotage-campagne.mjs` a mesuré **155 survivantes sur 194** dans
     ce banc — 20 % de couverture. Le motif est net et il se répète : chaque
     prédicat est une LISTE D'ALTERNATIVES (`a || b || c || …`), et mes témoins
     n'en éprouvaient qu'une ou deux. Toutes les autres pouvaient être
     neutralisées sans qu'aucune porte ne bronche.

     ⛔ POURQUOI ÇA COMPTE, ET CE N'EST PAS THÉORIQUE : chaque alternative de
     `estNegation` est une formulation RÉELLE relevée dans ses archives. Neutre
     une seule d'entre elles, et le prix d'une MACHINE entre dans la table des
     pièces — d'où une soustraction fausse, d'où un coût faux.

     ⇒ Chaque alternative a désormais SON cas. Un tableau : une ligne, une
     formulation, un verdict attendu. Neutraliser une branche fait tomber
     exactement une ligne, et le message dit laquelle. */

  /* ⑥ CHAQUE FORMULATION DE NÉGATION A SON TÉMOIN. */
  [['sans batterie ni chargeur', true, 'la forme française la plus courante'],
    ['livré sans chargeur', true, 'la négation portée par « sans » seul'],
    ['ni chargeur ni coffret', true, 'la négation portée par « ni »'],
    ['hors chargeur', true, 'la négation portée par « hors »'],
    ['chargeur non inclus', true, '« non inclus », posé après la pièce'],
    ['without Battery and Charger', true, 'anglais — le comparateur agrège toute l\'Europe'],
    ['no charger', true, 'anglais bref'],
    ['charger not included', true, 'anglais, « not included »'],
    ['bare tool', true, 'anglais, la formule des vendeurs professionnels'],
    ['ohne Akku und Ladegerät', true, 'allemand'],
    ['batterie 18 V 5,0 Ah avec chargeur', false, 'une carte ORDINAIRE ne doit pas être prise pour une négation']
  ].forEach(function (cas) {
    if (B.estNegation('MarqueA XY123 ' + cas[0]) !== cas[1]) {
      errors.push('[check-composants] ⛔⛔ ARGENT — NÉGATION : « ' + cas[0] + ' » ('
        + cas[2] + ') devrait ' + (cas[1] ? 'ÊTRE' : 'NE PAS être') + ' reconnu comme une '
        + 'négation. Chacune de ces formulations vient des archives réelles : en manquer UNE '
        + 'fait entrer un prix de MACHINE dans la table des pièces, et toute soustraction '
        + 'bâtie dessus est fausse.');
    }
  });

  /* ⑦ CHAQUE MARQUEUR DE PIÈCE DE TIERS A SON TÉMOIN. */
  [['Batterie SOCIETEX pour MARQUEA 18V', true, '« pour <marque> », marque fournie en argument'],
    ['Batterie compatible 18V 5Ah', true, '« compatible »'],
    ['Batterie de remplacement 18V', true, '« de remplacement »'],
    ['replacement battery 18V', true, 'anglais'],
    ['Ersatzakku 18V', true, 'allemand'],
    ['Batterie 18V 5Ah type AB123', true, '« type <réf> » : la pièce IMITE ce modèle'],
    ['Batterie MARQUEA 18V 5,0 Ah', false, 'une pièce d\'ORIGINE ne doit pas être écartée']
  ].forEach(function (cas) {
    if (B.estPieceDeTiers(cas[0], MQ) !== cas[1]) {
      errors.push('[check-composants] ⛔⛔ ARGENT — PIÈCE DE TIERS : « ' + cas[0] + ' » ('
        + cas[2] + ') devrait ' + (cas[1] ? 'ÊTRE' : 'NE PAS être') + ' écartée. Une pièce '
        + 'd\'un tiers ne tient pas la même charge et ne vaut pas le même prix : son coût ne '
        + 'dit rien de ce qu\'on paierait réellement. Et écarter une pièce d\'ORIGINE vide la '
        + 'table, donc fait refuser des reconstitutions gagnantes.');
    }
  });

  /* ⑧ CHAQUE FORME DE CONTENU MULTIPLE A SON TÉMOIN. */
  [['Machine (2 x 5,0 Ah + coffret)', true, 'contenu entre parenthèses'],
    ['Pack 2 x 5,0 Ah', true, 'multiplicateur devant une capacité'],
    ['Kit 3x batteries Powerstack', true, 'multiplicateur devant le MOT — le trou du 13/08'],
    ['Lot de 5 pièces', true, '« lot de N »'],
    ['Kit de démarrage de batterie', true, 'le mot KIT seul, sans aucun chiffre'],
    ['Machine avec 41 pièces', true, 'un compte de pièces'],
    ['Machine en coffret', true, 'un coffret est un contenu'],
    ['Batterie 18 V 5,0 Ah', false, 'une carte unitaire n\'annonce AUCUN contenu']
  ].forEach(function (cas) {
    if (B.annonceUnContenu(cas[0]) !== cas[1]) {
      errors.push('[check-composants] ⛔⛔ ARGENT — CONTENU MULTIPLE : « ' + cas[0] + ' » ('
        + cas[2] + ') devrait ' + (cas[1] ? 'ÊTRE' : 'NE PAS être') + ' vu comme un contenu '
        + 'multiple. En manquer un fait entrer le prix d\'un LOT comme s\'il était celui d\'une '
        + 'pièce à l\'unité — le coût sort plusieurs fois trop haut.');
    }
  });

  /* ⑨ LA MARQUE : UNE SEULE, OU AUCUNE. Un libellé qui cite DEUX marques ne
     dit pas de laquelle il parle — c'est typiquement un accessoire « compatible
     MarqueA et MarqueB ». Le rattacher à l'une des deux fabrique un composant
     qui n'existe pas, et la comparaison de coût qui suit est fausse. */
  if (B.marqueDuTexte('Batterie MARQUEA 18V 5Ah', MQ) !== 'MARQUEA') {
    errors.push('[check-composants] ⛔ une marque UNIQUE dans le libellé doit être reconnue — '
      + 'sinon toutes les cartes sont écartées et la table sort vide.');
  }
  if (B.marqueDuTexte('Batterie pour MARQUEA et MARQUEB 18V', MQ) !== null) {
    errors.push('[check-composants] ⛔⛔ ARGENT : un libellé citant DEUX marques est rattaché à '
      + 'l\'une d\'elles. Rien ne dit de laquelle il parle : le composant obtenu n\'existe pas, '
      + 'et le coût qu\'on en tire non plus.');
  }
  if (B.marqueDuTexte('Batterie 18V 5Ah', MQ) !== null) {
    errors.push('[check-composants] ⛔ un libellé SANS marque ne se rattache à personne — '
      + 'sinon on range une pièce dans la table de la première marque venue.');
  }

  /* ⑩ LES TENSIONS : ON NE RETIENT QUE CELLES D'UNE PLATEFORME D'OUTIL.
     ⛔ Le plancher existe parce qu'un libellé est plein de petits nombres
     suivis d'un « v » qui ne sont pas des tensions. Sans lui, n'importe quoi
     devient une plateforme et les pièces se rangent au hasard. */
  var vBas = B.valeursVolt('Chargeur 5V USB');
  if (vBas.length !== 0) {
    errors.push('[check-composants] ⛔ une tension trop basse pour une plateforme d\'outil ne '
      + 'doit PAS être retenue (obtenu ' + JSON.stringify(vBas) + ') : sinon un chargeur de '
      + 'téléphone se range dans la table des chargeurs d\'outil.');
  }
  var vDeux = B.valeursVolt('Chargeur rapide 12 V - 18 V Li-Ion');
  if (!(vDeux.length === 2 && vDeux.indexOf(12) >= 0 && vDeux.indexOf(18) >= 0)) {
    errors.push('[check-composants] ⛔ un chargeur qui couvre DEUX plateformes doit rendre les '
      + 'deux tensions (obtenu ' + JSON.stringify(vDeux) + ') : n\'en garder qu\'une le rendrait '
      + 'introuvable pour l\'autre, et les packs de cette plateforme cesseraient d\'être '
      + 'reconstituables.');
  }

  /* ⑪ LE LECTEUR D'ARCHIVES, ET C'EST LÀ QU'ÉTAIENT MES DEUX VRAIS DÉFAUTS.
     ⛔⛔ Il n'était éprouvé par RIEN — la campagne l'a montré : toutes ses
     décisions survivaient. Or c'est lui qui, le 13/08/2026, a rendu 0 chargeur
     sur 5 300 tuiles puis jeté la majorité des offres sans le dire, parce que
     les archives rangent le libellé et le prix à DEUX endroits différents
     (`unknown[]` : `name` + `srcTTC` ; `sansRef[]` : `titre` + `prix`).
     ⚠️ On écrit dans un dossier temporaire du système, jamais dans le dépôt :
     « un harnais n'écrit jamais à la racine du site ». Le chemin est CALCULÉ,
     jamais écrit en dur — un chemin absolu ne tourne que sur une machine. */
  var fs = require('fs'), os = require('os');
  var bac = null;
  try {
    bac = fs.mkdtempSync(path.join(os.tmpdir(), 'check-composants-'));
    fs.writeFileSync(path.join(bac, 'admin-1.json'), JSON.stringify({
      brand: 'MARQUEA',
      unknown: [{ rej: null, srcTTC: 11.11, name: 'forme A : le libelle vit dans name',
        titre: null, typ: 'batterie', fam: 'energie' }],
      sansRef: [{ rej: null, prix: 22.22, titre: 'forme B : le libelle vit dans titre',
        typ: 'batterie', fam: 'energie' }]
    }));
    var lues = B.tuilesDe(bac);
    var pA = lues.filter(function (t) { return t.prix === 11.11; });
    var pB = lues.filter(function (t) { return t.prix === 22.22; });
    if (pA.length !== 1 || !/libelle vit dans name/.test(pA[0].texte)) {
      errors.push('[check-composants] ⛔⛔ la forme d\'archive qui range le libellé dans `name` '
        + '(et le prix dans `srcTTC`) n\'est PAS lue. C\'est le défaut du 13/08/2026 : la '
        + 'majorité des offres partait à la poubelle en silence, et la table des pièces sortait '
        + 'quand même — donc fausse, et sans le dire.');
    }
    if (pB.length !== 1 || !/libelle vit dans titre/.test(pB[0].texte)) {
      errors.push('[check-composants] ⛔⛔ la forme d\'archive qui range le libellé dans `titre` '
        + '(et le prix dans `prix`) n\'est PAS lue. Une lecture qui ne trouve rien rend une '
        + 'liste vide, pas une erreur : le banc conclurait sur un dixième des données.');
    }
    /* …et une entrée SANS prix ne doit pas entrer : un composant à zéro euro
       ferait tomber tout coût reconstitué qui l'utilise. */
    fs.writeFileSync(path.join(bac, 'admin-2.json'), JSON.stringify({
      brand: 'MARQUEA',
      sansRef: [{ rej: null, prix: 0, titre: 'offre sans prix exploitable',
        typ: 'batterie', fam: 'energie' }]
    }));
    if (B.tuilesDe(bac).filter(function (t) { return /sans prix exploitable/.test(t.texte); }).length) {
      errors.push('[check-composants] ⛔⛔ ARGENT : une offre SANS prix entre dans la lecture. '
        + 'Un composant à zéro euro effondre tout coût reconstitué qui l\'emploie — et un coût '
        + 'effondré, c\'est vendre à perte.');
    }
  } catch (e) {
    errors.push('[check-composants] ⛔ PRÉALABLE : le lecteur d\'archives n\'a pas pu être '
      + 'éprouvé (' + e.message + '). Non exécuté n\'est pas vert.');
  } finally {
    if (bac) { try { fs.rmSync(bac, { recursive: true, force: true }); } catch (e2) { /* rien à faire */ } }
  }

  /* ⑫ ET SURTOUT : `construire`, LA FONCTION QUI CHOISIT LE PRIX RETENU.
     ⛔⛔ ELLE N'ÉTAIT APPELÉE PAR AUCUN TÉMOIN. La campagne l'a montré sans
     ambiguïté : toutes ses décisions survivaient — y compris celle qui garde
     le prix le PLUS BAS, c'est-à-dire la seule qui produise l'économie. Une
     porte qui éprouve les briques sans jamais assembler le mur ne dit rien du
     mur.

     ⛔ LA MARQUE SE LIT À L'EXÉCUTION, elle ne s'écrit pas ici : `construire`
     ne retient que les marques déclarées aux plans du traqueur, et « un
     harnais ne nomme jamais une donnée du catalogue ». On prend la première
     marque déclarée, quelle qu'elle soit. */
  var marques = B.marquesConnues();
  if (!marques.length) {
    errors.push('[check-composants] ⛔ PRÉALABLE : aucune marque aux plans du traqueur — '
      + '`construire` écarterait tout et le témoin serait vert à vide.');
    return errors;
  }
  var MQ1 = marques[0];
  function offreDe(texte, prix, typ, fam) {
    return { texte: MQ1 + ' ' + texte, descr: '', prix: prix, typ: typ || 'batterie',
      fam: fam || 'energie', sku: null, rej: null, source: 'temoin' };
  }
  var T = B.construire([
    /* la carte à l'unité la plus chère … */
    offreDe('Batterie 18V 5,0Ah Li-ion', 99.57),
    /* … et le LOT qui donne le vrai coût unitaire : 638,45 / 10 = 63,85 */
    offreDe('Lot de batteries 10 x AB123 18V Li-Ion - 10 X 5.0Ah', 638.45),
    /* un lot moins avantageux : il ne doit PAS l'emporter */
    offreDe('Lot de batteries 5 x AB123 18V Li-Ion - 5 X 5.0Ah', 400),
    /* une négation : c'est une machine, elle n'entre pas */
    offreDe('Rabot 18V sans batterie ni chargeur', 175.04, 'rabot', 'machine'),
    /* un vrai chargeur d'outil */
    offreDe('Chargeur rapide 12 V - 18 V Li-Ion 6 A', 97.73, 'chargeur'),
    /* un chargeur qui n'en est pas un : pas de tension de plateforme */
    offreDe('Chargeur Mural USB-C GaN 100W', 84.99, 'chargeur')
  ]);
  var bat18 = T.batteries[MQ1 + '|18V|5Ah'];
  if (!bat18) {
    errors.push('[check-composants] ⛔⛔ ARGENT : `construire` ne range AUCUNE batterie alors '
      + 'que trois offres exploitables lui sont données. La table vide fait tout refuser au '
      + 'calculateur : l\'économie est perdue en silence.');
  } else {
    if (Math.abs(bat18.prix - 63.85) > 0.01 || bat18.quantiteMinimale !== 10) {
      errors.push('[check-composants] ⛔⛔ ARGENT : le coût unitaire retenu n\'est pas le plus BAS '
        + '(attendu 63,85 EUR par le lot de 10, obtenu ' + bat18.prix + ' EUR pour une quantité '
        + 'minimale de ' + bat18.quantiteMinimale + '). C\'est exactement l\'écart mesuré sur ses '
        + 'relevés : 99,57 EUR à la carte unitaire contre 63,85 EUR par le lot, soit 36 % de '
        + 'trop payé si le choix se fait mal.');
    }
    if (!(bat18.prixDuLot > bat18.prix)) {
      errors.push('[check-composants] ⛔ le prix d\'ENTRÉE doit voyager avec le coût unitaire '
        + '(obtenu prixDuLot=' + bat18.prixDuLot + ' pour un unitaire de ' + bat18.prix + '). '
        + 'Un coût unitaire de lot ne s\'obtient qu\'en achetant le lot : le cacher, c\'est '
        + 'laisser prendre une décision d\'achat sans sa condition.');
    }
  }
  var chg18 = T.chargeurs[MQ1 + '|18V'];
  if (!chg18 || Math.abs(chg18.prix - 97.73) > 0.01) {
    errors.push('[check-composants] ⛔ le chargeur d\'outil n\'est pas rangé sous sa plateforme '
      + '(obtenu ' + JSON.stringify(chg18) + '). Sans lui, aucun pack contenant un chargeur ne '
      + 'peut être reconstitué.');
  }
  if (T.chargeurs[MQ1 + '|100V'] || Object.keys(T.chargeurs).some(function (k) {
    return /USB|GaN/i.test(String((T.chargeurs[k] || {}).texte || ''));
  })) {
    errors.push('[check-composants] ⛔⛔ ARGENT : un chargeur qui n\'est PAS un chargeur d\'outil '
      + 'est entré dans la table. Son prix servirait de prix de pièce dans une soustraction, et '
      + 'le coût de machine qui en sort ne correspondrait à rien.');
  }
  if (Object.keys(T.batteries).some(function (k) {
    return /sans batterie/i.test(String((T.batteries[k] || {}).texte || ''));
  })) {
    errors.push('[check-composants] ⛔⛔ ARGENT : une MACHINE dont le titre dit « sans batterie » '
      + 'est rangée comme une batterie. C\'est un prix de machine dans la table des pièces — '
      + 'le défaut mesuré le 13/08/2026, à 175,04 EUR.');
  }
  /* ⛔ PRÉALABLE : sans refus comptés, on ne saurait pas que les cartes
     écartées l'ont été pour une RAISON — et un rejet muet passe pour une
     absence de donnée. */
  if (!Object.keys(T.refus).length && !bat18) {
    errors.push('[check-composants] ⛔ PRÉALABLE : ni carte retenue ni refus compté — '
      + '`construire` n\'a rien traversé et le témoin est vert à vide.');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-composants : la table des pieces ne range que ce qui est prouve');
}
