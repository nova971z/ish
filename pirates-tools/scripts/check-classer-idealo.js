#!/usr/bin/env node
'use strict';
/* ══ PORTE — LE CLASSEMENT DU BALAYAGE IDEALO ════════════════════════════════
   `node scripts/check-classer-idealo.js`

   ⛔⛔ LA RÈGLE QU'ELLE DÉFEND EST CELLE DE L'USER, 04/08/2026, seconde
   version — il a ANNULÉ la première (qui gardait les lettres après les
   chiffres) après m'avoir démontré sur son propre catalogue qu'elle
   fabriquait des paires fantômes :
   « tu ne regardes plus les lettres après les numéros !!! tu te bases sur la
   description du produit et sur les premières lettres, ainsi que les numéros
   qui viennent après !!! et tu me vires les doublons, tu prends le moins cher »

   Donc, dans l'ordre des priorités du projet :
   ① ARGENT — même racine de modèle mais DESCRIPTIONS différentes = produits
     différents : la machine seule, la machine en pack, l'ACCESSOIRE fait pour
     elle. Sur le balayage réel : la racine DCE560 couvrait le pistolet nu à
     244,86 €, le kit à batterie à 581,99 € ET un kit de conversion à
     123,99 € — les fusionner écrirait le prix d'un accessoire sur la machine.
   ② FONCTIONNEL — même racine, même description ⇒ doublon : viré, le MOINS
     CHER gagne, y compris quand un prix manque ou arrive en second.
   ③ HONNÊTETÉ — une ignorance ne vote pas… sauf si un DOUBLON classé sait :
     l'annonce muette hérite alors de sa famille, jamais l'inverse.

   ⛔ Cette porte n'ancre AUCUNE donnée du catalogue : elle fabrique ses
   propres annonces (préfixe ZZ). Dix-huit harnais sont morts pour ça.

   ⚠️ Portes lues : J3 — aucune donnée personnelle ; J4 — aucun prix écrit ;
   J5 — aucune TVA. */

const cl = require('./classer-idealo.js');
const priceParse = require('../api/_lib/price-parse.js');

/* ⛔ Le contrôle s'exécute dans une FONCTION, jamais au chargement du module —
   et le préalable (compte d'assertions) vit dans l'ENVELOPPE : posé en fin de
   corps, un `return` égaré le sautait et la porte restait verte amputée. */
function corps(ok) {

  function ligne(sku, titre, prix, car) {
    const e = { sku: sku, titre: titre, prix: prix, car: car || null };
    const k = cl.cleDoublon(e);
    e.cleDoublon = k.cle; e.niveauCle = k.niveau; e.variante = k.variante;
    e.roleCoffret = k.roleCoffret;
    e.pack = !!(car && car.pack);
    return e;
  }

  /* ── ① LA RACINE DE MODÈLE — les lettres après les chiffres NE COMPTENT PLUS */
  ok(priceParse.racineModele('ZZE560N-XJ') === 'ZZE560'
    && priceParse.racineModele('ZZE560D1-QW') === 'ZZE560'
    && priceParse.racineModele('ZZE560') === 'ZZE560',
    '⛔⛔ RÈGLE USER : ZZE560N-XJ, ZZE560D1-QW et ZZE560 sont le MÊME modèle — '
    + 'les lettres après les chiffres ne comptent plus ('
    + priceParse.racineModele('ZZE560N-XJ') + ' / ' + priceParse.racineModele('ZZE560D1-QW') + ')');

  ok(priceParse.racineModele('ZZST1-81078') === 'ZZST1-81078',
    '⛔ …mais un groupe -chiffres FAIT partie du modèle : couper ZZST1-81078 à '
    + 'ZZST1 confondrait tous les coffrets de la gamme ('
    + priceParse.racineModele('ZZST1-81078') + ')');

  ok(priceParse.racineModele('2-910') === '2-910'
    && priceParse.racineModele('AT-ZZAM2250') === 'AT-ZZAM2250',
    'une écriture qui ne commence pas par des lettres est rendue TELLE QUELLE : '
    + 'mieux vaut ne pas regrouper que regrouper faux');

  /* ── LA DESCRIPTION SÉPARE CE QUE LA RACINE RÉUNIT ──────────────────────── */
  const outil = ligne('ZZE560N-XJ', 'ZZ pistolet à mastic 18V', 244.86, { famille: 'machine', pack: false });
  const kit = ligne('ZZE560D1-QW', 'ZZ pistolet 18V + 1x2,0Ah + chargeur', 581.99, { famille: 'machine', pack: true });
  const acc = ligne(null, 'Kit de conversion du tube d\'extrusion pour ZZE 560', 123.99,
    { famille: 'machine', pack: true, skuEclate: 'ZZE560' });

  ok(outil.cleDoublon !== kit.cleDoublon && outil.cleDoublon !== acc.cleDoublon
    && kit.cleDoublon !== acc.cleDoublon,
    '⛔⛔ ARGENT : même racine, trois DESCRIPTIONS — machine seule, pack à '
    + 'batteries, accessoire — trois clés distinctes (' + outil.cleDoublon + ' / '
    + kit.cleDoublon + ' / ' + acc.cleDoublon + ')');
  ok(acc.variante === 'ACCESSOIRE',
    '⛔ « kit de conversion … pour ZZE 560 » est un ACCESSOIRE : la référence se '
    + 'GARDE (elle dit pour quelle machine), la description tranche ('
    + acc.variante + ')');
  ok(cl.dedoublonner([outil, kit, acc]).length === 3,
    '⛔ …et les trois SURVIVENT au dédoublonnage : l\'accessoire à 123,99 € ne '
    + 'doit jamais devenir « le moins cher » de la machine à 244,86 €');

  /* « avec support », « + coffret » : une INCLUSION n'est pas une pièce. */
  const avecSupport = ligne('ZZ24000', 'ZZ Wet Tile Saw avec support de roue, 250 mm', 1504.98,
    { famille: 'machine', pack: true });
  ok(avecSupport.variante !== 'ACCESSOIRE',
    '⛔ « la machine AVEC support » n\'est pas un accessoire : le mot qui précède '
    + '(avec/with/mit/+) annonce un contenu livré, pas une pièce détachée ('
    + avecSupport.variante + ')');

  /* ── LES SUFFIXES COMMERCIAUX FUSIONNENT, LE MOINS CHER GAGNE ───────────── */
  const nXJ = ligne('ZZE560N-XJ', 'ZZ pistolet nu', 250.00, { famille: 'machine', pack: false });
  const nQW = ligne('ZZE560N-QW', 'ZZ pistolet nu', 244.86, { famille: 'machine', pack: false });
  const nNu = ligne('ZZE560', 'ZZ pistolet nu', 260.00, { famille: 'machine', pack: false });
  ok(nXJ.cleDoublon === nQW.cleDoublon && nQW.cleDoublon === nNu.cleDoublon,
    '⛔ N-XJ, N-QW et la racine nue, MÊME description ⇒ même produit ('
    + nXJ.cleDoublon + ')');
  const gagnant = cl.dedoublonner([nXJ, nQW, nNu]);
  ok(gagnant.length === 1 && gagnant[0].prix === 244.86,
    '⛔ …doublons virés, le MOINS CHER gagne (' + (gagnant[0] || {}).prix + ' €)');

  /* ── ② « LE MOINS CHER », MÊME AVEC DES TROUS ───────────────────────────── */
  function px(prix) { return ligne('ZZP100N', 'même produit nu', prix, { famille: 'machine' }); }
  const avecTrou = cl.dedoublonner([px(null), px(89.90), px(0), px(120)]);
  ok(avecTrou.length === 1 && avecTrou[0].prix === 89.90,
    '⛔ ARGENT : un prix ABSENT ou NUL ne gagne jamais contre un prix réel ('
    + (avecTrou[0] || {}).prix + ')');
  const ordreInverse = cl.dedoublonner([px(89.90), px(49.90)]);
  ok(ordreInverse.length === 1 && ordreInverse[0].prix === 49.90,
    '⛔ …et le moins cher gagne même s\'il arrive en SECOND');

  /* ── ③ LE CLASSEMENT PAR FAMILLE ────────────────────────────────────────── */
  ok(cl.classer({ famille: 'machine' }, 'Gants de protection').rayon === 'ELECTRO_PORTATIF',
    '⛔ la famille MESURÉE par le parseur prime sur le titre');
  ok(cl.classer({ famille: 'consommable' }, '').rayon === 'QUINCAILLERIE',
    'un consommable va en quincaillerie');
  ok(cl.classer({ famille: 'epi' }, '').rayon === 'VETEMENTS',
    'un EPI va en vêtements');
  ok(cl.classer({ famille: 'energie' }, '').rayon === 'ELECTRO_PORTATIF',
    'une batterie va à l\'électro portatif');
  ok(cl.classer({}, 'ZZ9999').rayon === 'A_TRANCHER',
    '⛔⛔ UNE IGNORANCE NE VOTE PAS : sans famille ni mot reconnaissable, '
    + '« À trancher », jamais la plus grosse famille');

  /* ── ACCENTS ET COMPOSÉS — défaut payé (16 lignes mal classées) ─────────── */
  ok(cl.classer({}, 'Écouteurs True Wireless Pro').rayon === 'ELECTRO_PORTATIF',
    '⛔⛔ `\\b` ne mord pas devant « É » : les accents se retirent AVANT de chercher');
  ok(cl.classer({}, 'Ébrancheur 60 cm bypass').rayon === 'QUINCAILLERIE',
    '⛔ …dans les trois familles, pas seulement celle où le défaut a été vu');
  ok(cl.classer({}, 'ZZBRAND Streifennagel 34Gr. Ring 75mm').rayon === 'QUINCAILLERIE',
    '⛔ un composé allemand est reconnu au FRAGMENT (« nagel » au milieu du mot)');
  ok(cl.classer({}, 'ZZBRAND Streifennagel 34Gr.').signal === 'titre-fragment',
    '⛔ …et le signal DIT que c\'est un fragment — moins sûr qu\'un mot entier');
  ok(cl.classer({}, 'Sac à dos lumineux avec 33 poches pour outils').rayon === 'VETEMENTS',
    'le portage passe AVANT l\'outil dans un titre qui contient les deux');

  /* ── CE QUI CHANGE LE PRIX SÉPARE LES PRODUITS ──────────────────────────── */
  /* Défaut trouvé par l'user le 04/08 sur son catalogue : deux lasers de même
     racine, l'un à faisceau rouge, l'autre vert — 430 € d'écart au catalogue —
     avaient FUSIONNÉ, et le moins cher avait effacé l'autre. */
  const rouge = ligne('ZZE079D1R', 'ZZ Laser rotatif faisceau rouge 18V', 1098.88, { famille: 'machine', pack: false });
  const vert = ligne('ZZE079D1G', 'ZZ Laser rotatif faisceau vert 18V', 1312.09, { famille: 'machine', pack: false });
  ok(rouge.cleDoublon !== vert.cleDoublon,
    '⛔⛔ ARGENT : deux versions d\'un même modèle que seule la DESCRIPTION '
    + 'distingue (faisceau rouge / vert) ne partagent JAMAIS une clé — sinon le '
    + 'moins cher efface l\'autre et son prix passe sur la mauvaise fiche ('
    + rouge.cleDoublon + ' vs ' + vert.cleDoublon + ')');
  ok(cl.dedoublonner([rouge, vert]).length === 2,
    '⛔ …et les deux SURVIVENT au dédoublonnage');

  /* La configuration de batteries est le premier facteur de prix. */
  /* ⚠️ LES DEUX TITRES NE DIFFÈRENT QUE PAR LES BATTERIES. Premier jet : ils
     disaient aussi « + chargeur » d'un seul côté — les clés différaient grâce
     au chargeur, et neutraliser la signature de batteries laissait la porte
     VERTE. Une assertion qui passe pour une autre raison que celle qu'elle
     annonce ne vérifie rien. */
  const p2 = ligne('ZZD796P2', 'ZZ perceuse 18V avec 2x5,0Ah', 400, { famille: 'machine', pack: true });
  const d1 = ligne('ZZD796D1', 'ZZ perceuse 18V avec 1x2,0Ah', 250, { famille: 'machine', pack: true });
  ok(p2.cleDoublon !== d1.cleDoublon,
    '⛔⛔ ARGENT : « 2x5,0Ah » et « 1x2,0Ah » ne sont pas le même produit — '
    + 'les batteries font le prix (' + p2.cleDoublon + ' vs ' + d1.cleDoublon + ')');

  const memeConfigA = ligne('ZZD796P2-XJ', 'ZZ perceuse 18V avec 2x5,0Ah', 420, { famille: 'machine', pack: true });
  const memeConfigB = ligne('ZZD796P2-QW', 'ZZ perceuse 18V avec 2 X 5.0 AH', 399, { famille: 'machine', pack: true });
  ok(memeConfigA.cleDoublon === memeConfigB.cleDoublon,
    '⛔ …mais « 2x5,0Ah » et « 2 X 5.0 AH » sont la MÊME configuration : une '
    + 'signature sensible à la casse ou à la virgule séparerait le même produit ('
    + memeConfigA.cleDoublon + ')');
  const g2 = cl.dedoublonner([memeConfigA, memeConfigB]);
  ok(g2.length === 1 && g2[0].prix === 399,
    '⛔ …et le moins cher gagne (' + (g2[0] || {}).prix + ' €)');

  /* ── LE COFFRET EST UN INTERRUPTEUR, PAS UN PRODUIT ─────────────────────── */
  /* Règle de l'user, 04/08 : « N / NT / NT-XJ, si la référence est la même au
     début, on a qu'UNE SEULE carte produit et la personne peut switcher
     version sans coffret et version avec coffret ; XJ c'est pour la région ».
     Mesuré : 0 fiche DeWALT sur 1105 utilisait le switch, et la carte coffret
     recevait son PROPRE coût — DCH273NT à 586,07 € contre 264,37 € pour la
     nue, quand le switch facture 15 €. */
  const nuSolo = ligne('ZZD800N-XJ', 'ZZ perceuse 18V 90 Nm sans batterie ni chargeur', 112.02, { famille: 'machine' });
  const nuCoffret = ligne('ZZD800NT-XJ', 'ZZ perceuse 18V 90 Nm, coffret TSTAK, sans batterie', 145.00, { famille: 'machine' });
  ok(nuSolo.cleDoublon === nuCoffret.cleDoublon,
    '⛔⛔ ARGENT : la version NUE et la version COFFRET du même modèle partagent '
    + 'la MÊME clé — une seule carte produit, le coffret est un interrupteur ('
    + nuSolo.cleDoublon + ' vs ' + nuCoffret.cleDoublon + ')');
  ok(nuSolo.roleCoffret === 'solo' && nuCoffret.roleCoffret === 'coffret',
    '⛔ …et le RÔLE les distingue pour alimenter le switch (' + nuSolo.roleCoffret
    + ' / ' + nuCoffret.roleCoffret + ')');

  /* ── « SANS BATTERIE NI CHARGEUR » N'EST PAS « AVEC » ───────────────────── */
  const nie = cl.varianteProduit('ZZ perceuse 18V XR 90 Nm - sans batterie ni chargeur', { pack: true });
  ok(nie === 'NU',
    '⛔⛔ lire un mot n\'est pas comprendre une phrase : « sans batterie NI '
    + 'chargeur » doit donner une machine NUE, pas un pack avec chargeur ('
    + nie + ')');
  const avec = cl.varianteProduit('ZZ perceuse 18V avec 1x2,0Ah et chargeur', { pack: true });
  ok(/CHARGEUR/.test(avec),
    '⛔ …mais un chargeur RÉELLEMENT inclus est bien vu — une négation qui '
    + 'mordrait toujours effacerait tous les packs (' + avec + ')');

  /* ── « 2x batterie 2,0 Ah » VAUT DEUX BATTERIES ─────────────────────────── */
  ok(cl.signatureBatteries('perceuse + 2x batterie 2,0 ah + chargeur') === '2X2.0',
    '⛔⛔ ARGENT : un mot intercalé (« 2x BATTERIE 2,0 Ah ») ne doit pas faire '
    + 'lire une seule batterie — deux 5 Ah ne valent pas une ('
    + cl.signatureBatteries('perceuse + 2x batterie 2,0 ah + chargeur') + ')');
  ok(cl.signatureBatteries('perceuse 18v sans batterie') === 'SANSBAT',
    '⛔ …et « sans batterie » se dit SANSBAT, jamais une quantité inventée');

  /* ── LE TITRE TRANCHE CE QUE LA VARIANTE A MAL SÉPARÉ ───────────────────── */
  /* Mesuré sur le balayage réel : 11 annonces IDENTIQUES (même titre) avaient
     survécu sous deux clés, OUTIL et PACK, parce que `pack` avait été lu
     différemment selon la page. Même description = même produit. */
  const t1 = ligne('ZZH172N-XJ', 'ZZ Perforateur SDS Plus 18V ZZH172N-XJ', 251.24, { famille: 'machine', pack: true });
  const t2 = ligne('ZZH172N-XJ', 'ZZ Perforateur SDS Plus 18V ZZH172N-XJ', 149.99, { famille: 'machine', pack: false });
  t1.rayonCommercial = 'ELECTRO_PORTATIF'; t2.rayonCommercial = 'ELECTRO_PORTATIF';
  t1.signalClassement = t2.signalClassement = 'famille:machine';
  const bil = cl.bilanParRayon([t1, t2]);
  const restants = (bil.ELECTRO_PORTATIF || {}).lignes || [];
  ok(restants.length === 1 && restants[0].prix === 149.99,
    '⛔⛔ deux annonces au MÊME TITRE ne survivent jamais toutes les deux, même '
    + 'si le parseur a lu `pack` différemment selon la page : le titre est la '
    + 'description, et le moins cher gagne (' + restants.length + ' restante(s), '
    + (restants[0] || {}).prix + ' €)');


  /* ── LES SUFFIXES DE BATTERIE DeWALT, LUS SUR LA RÉFÉRENCE ──────────────── */
  /* ⛔ Demande de l'user, 04/08/2026 : « il faut absolument connaître TOUTES
     les références de pack avec batterie qui existent. » Table cherchée sur le
     web (toolguyd, slicehardware, housedigest) et recoupée avec sa capture de
     32 kits DCK. Les cas ci-dessous portent un préfixe ZZ : on éprouve la
     GRAMMAIRE, jamais un produit du catalogue. */
  const nomen = priceParse.nomenclature;
  const lus = {
    'ZZK2050E2T-QW': { nb: 2, ah: 1.7, gamme: 'POWERSTACK', coffret: 'TSTAK' },
    'ZZK2050H2T-QW': { nb: 2, ah: 5.0, gamme: 'POWERSTACK', coffret: 'TSTAK' },
    'ZZK212D2T-QW':  { nb: 2, ah: 2.0, gamme: 'XR', coffret: 'TSTAK' },
    'ZZK2101L2T-QW': { nb: 2, ah: 3.0, gamme: 'XR', coffret: 'TSTAK' },
    'ZZK324T2-QW':   { nb: 2, ah: 6.0, gamme: 'FLEXVOLT', coffret: null },
    'ZZK422P3T-QW':  { nb: 3, ah: 5.0, gamme: 'XR', coffret: 'TSTAK' }
  };
  Object.keys(lus).forEach(function (ref) {
    const att = lus[ref];
    const r = nomen.lireSuffixeDewalt(ref);
    ok(r.nbBatteries === att.nb && r.batteries.length === 1
      && r.batteries[0].ah === att.ah && r.batteries[0].gamme === att.gamme
      && r.coffret === att.coffret,
      '⛔⛔ ARGENT : « ' + ref + ' » doit se lire ' + att.nb + '×' + att.ah + ' Ah '
      + att.gamme + (att.coffret ? ' + coffret' : ' sans coffret')
      + ' — confondre deux capacités, c\'est offrir des batteries à chaque vente ('
      + JSON.stringify({ nb: r.nbBatteries, bat: r.batteries, coffret: r.coffret }) + ')');
  });

  /* ⛔ Le « T » est AMBIGU et c'est le CHIFFRE qui tranche : `T2` est une
     batterie FLEXVOLT 6 Ah, un `T` final sans chiffre est le coffret TSTAK. */
  const tBat = nomen.lireSuffixeDewalt('ZZK324T2-QW');
  const tCof = nomen.lireSuffixeDewalt('ZZD800NT-XJ');
  ok(tBat.nbBatteries === 2 && tBat.coffret === null
    && tCof.nbBatteries === 0 && tCof.coffret === 'TSTAK',
    '⛔⛔ le « T » suivi d\'un CHIFFRE est une batterie FLEXVOLT ; un « T » FINAL '
    + 'est le coffret TSTAK. Les confondre ferait payer un coffret pour deux '
    + 'batteries 6 Ah, ou l\'inverse');

  /* Deux capacités dans la même boîte : les deux se lisent. */
  const mixte = nomen.lireSuffixeDewalt('ZZK317P1D1-QW');
  ok(mixte.nbBatteries === 2 && mixte.batteries.length === 2,
    '⛔ « P1D1 » = UNE 5 Ah ET UNE 2 Ah : une table figée n\'aurait jamais couvert '
    + 'ces assemblages, il faut les LIRE (' + JSON.stringify(mixte.batteries) + ')');

  /* ⛔ LE TITRE PRIME SUR LA RÉFÉRENCE, DANS LES DEUX SENS. */
  ok(priceParse.varianteProduit('ZZ machine', {}, 'ZZD800D2-QW') === '2X2',
    '⛔ titre MUET : la référence parle et annonce 2×2 Ah ('
    + priceParse.varianteProduit('ZZ machine', {}, 'ZZD800D2-QW') + ')');
  ok(priceParse.varianteProduit('ZZ perceuse 18V sans batterie ni chargeur', {}, 'ZZD800D2-QW') === 'NU',
    '⛔⛔ titre EXPLICITE « sans batterie ni chargeur » : il GAGNE contre le '
    + 'suffixe D2 de la référence — sinon le prix d\'un kit tomberait sur une '
    + 'machine nue (' + priceParse.varianteProduit('ZZ perceuse 18V sans batterie ni chargeur', {}, 'ZZD800D2-QW') + ')');
  ok(priceParse.varianteProduit('ZZ perceuse 18V + 2x5,0Ah + chargeur', {}, 'ZZD800N-XJ') !== 'NU',
    '⛔ …et dans l\'autre sens : un titre qui annonce deux batteries gagne contre '
    + 'le « N » de la référence');

  /* Une lettre inconnue est RENDUE, jamais devinée ni avalée. */
  const inconnu = nomen.lireSuffixeDewalt('ZZD800J2-XJ');
  ok(inconnu.inconnus.indexOf('J') !== -1,
    '⛔ une lettre de batterie INCONNUE est remontée dans `inconnus` — c\'est ce '
    + 'qui permettra d\'agrandir la table sur des faits, jamais sur une '
    + 'supposition (' + JSON.stringify(inconnu.inconnus) + ')');


  /* ── LIRE LE TITRE COMME UN HUMAIN LE LIT ────────────────────────────────
     ⛔⛔ QUATRE CAS APPORTÉS PAR L'USER LE 04/08/2026, CAPTURES À L'APPUI.
     Mesuré avant correctif : 5 échecs sur 5. Je cherchais un MOT (« pour ») au
     lieu de lire la PHRASE — « il faut arrêter de prendre les gens pour des
     cons », et il avait raison. Chacun de ces cas est ici pour ne plus jamais
     repasser. Préfixe ZZ : on éprouve la grammaire, jamais son catalogue. */

  /* ① « pour » qui introduit une CARACTÉRISTIQUE, pas une machine. */
  ok(priceParse.lireReferenceDuTitre('ZZB117-QW Chargeur de piles, Pour technologie de batterie Li-Ion, Affichage LED', 'ZZBRAND').ref === 'ZZB117-QW',
    '⛔⛔ « Chargeur de piles, POUR technologie de batterie Li-Ion » est un '
    + 'CHARGEUR : « pour » y annonce une caractéristique, pas une compatibilité. '
    + 'Le rejeter perdait un produit entier ('
    + priceParse.lireReferenceDuTitre('ZZB117-QW Chargeur de piles, Pour technologie de batterie Li-Ion', 'ZZBRAND').ref + ')');

  /* ② DEUX références : celle de la machine visée, et la SIENNE. */
  var tete = priceParse.lireReferenceDuTitre(
    'ZZBRAND Tête d\'outil réglable en cuivre de 2,2 cm pour ZZE4500 (ZZE450078)', 'ZZBRAND');
  ok(tete.ref === 'ZZE450078',
    '⛔⛔ ARGENT : la référence PROPRE de l\'article est celle qui n\'est PAS '
    + 'introduite par « pour ». La confondre écrirait le prix d\'une tête de '
    + 'cuivre sur la machine entière (' + tete.ref + ')');
  ok(tete.pourMachines.indexOf('ZZE4500') !== -1,
    '⛔ …et la machine visée est RELEVÉE, pas jetée : c\'est elle qui dit que '
    + 'l\'article est un accessoire (' + JSON.stringify(tete.pourMachines) + ')');

  /* ③ Une référence de pièce détachée n'a qu'UNE lettre. */
  ok(priceParse.lireReferenceDuTitre('Barre pour scie Stationnaire ZZBRAND N233859', 'ZZBRAND').ref === 'N233859',
    '⛔ une référence à UNE seule lettre suivie d\'un long numéro est valide — '
    + 'exiger deux lettres jetait toutes les pièces détachées');

  /* ④ …mais une UNITÉ ne devient jamais une référence pour autant. */
  ok(priceParse.lireReferenceDuTitre('ZZBRAND bidon 600ML de graisse', 'ZZBRAND').ref === null
    && priceParse.lireReferenceDuTitre('ZZBRAND clous 250PCS 18GA', 'ZZBRAND').ref === null,
    '⛔⛔ « 600ML », « 250PCS », « 18GA » sont des UNITÉS : sans ce garde-fou, '
    + 'l\'assouplissement du cas ③ en aurait fait des références');

  /* ⑤ Plusieurs machines visées et aucune référence propre ⇒ on refuse. */
  var multi = priceParse.lireReferenceDuTitre('Batterie de remplacement pour ZZB184 ZZB181 ZZB182', 'ZZBRAND');
  ok(multi.ref === null,
    '⛔⛔ ARGENT : une batterie « pour » trois machines n\'a PAS de référence '
    + 'propre — lui en attribuer une écrirait son prix sur un outil');

  /* ── LES AUTRES GARDES TIENNENT TOUJOURS ─────────────────────────────────── */
  ok(priceParse.refUniqueDuTitre('ZZBRAND Foret métal HSS-G Coffret 29 pièces - ZZ7926-XJ', 'ZZBRAND') === 'ZZ7926-XJ',
    '⛔ une offre dont le titre NOMME une seule référence la donne');
  ok(priceParse.refUniqueDuTitre('ZZBRAND Power Set 1 x 18V 5,0 Ah + ZZB107', 'ZZBRAND') === null,
    '⛔⛔ un LOT (« + ») ne donne PAS sa référence : elle n\'y est qu\'un COMPOSANT');
  ok(priceParse.refUniqueDuTitre('ZZBRAND ZZD796 reconditionné', 'ZZBRAND') === null,
    '⛔ une offre d\'OCCASION n\'est pas notre produit neuf');
  ok(priceParse.refUniqueDuTitre('ZZBRAND Batterie XR 18V-54V ZZB548-XJ', 'ZZBRAND') === 'ZZB548-XJ',
    '⛔ « 18V-54V » est une UNITÉ, jamais une référence ('
    + priceParse.refUniqueDuTitre('ZZBRAND Batterie XR 18V-54V ZZB548-XJ', 'ZZBRAND') + ')');

  /* ── LE COMPTE OUTILS SEULS / PACKS ─────────────────────────────────────── */
  const c = cl.compter([{ pack: true }, { pack: false }, { pack: false }]);
  ok(c.total === 3 && c.packs === 1 && c.seuls === 2 && c.seuls + c.packs === c.total,
    'le compte sépare packs et outils seuls, et leur somme fait EXACTEMENT le total ('
    + JSON.stringify(c) + ')');

  /* ── LE CSV SURVIT AU SÉPARATEUR DANS UN TITRE ──────────────────────────── */
  const piege = ligne('ZZC1N', 'Perceuse ; 18V "XR" ligne1', 99, { famille: 'machine' });
  piege.rayonCommercial = 'ELECTRO_PORTATIF'; piege.signalClassement = 'famille:machine';
  piege.origine = 'test'; piege.doublonsFusionnes = 1;
  const csv = cl.ligneCsv(piege);
  ok(csv.split(';').length > cl.COLONNES.length - 1,
    'un titre contenant « ; » ne casse pas la ligne — il est mis entre guillemets');
  ok(/"Perceuse ; 18V ""XR"" ligne1"/.test(csv),
    '⛔ …et les guillemets internes sont DOUBLÉS, sinon Numbers coupe la cellule');
}

/* ⛔ Mesuré, pas estimé : `assertions rendues : 25` (corps instrumenté après
   l'ajout de la fusion par titre). Un seuil écrit de tête laisse une marge où
   une amputation passe inaperçue — il se remesure à chaque assertion neuve. */
const ASSERTIONS_ATTENDUES = 36;

module.exports = function () {
  const errors = [];
  let n = 0;
  const ok = function (cond, quoi) {
    n++;
    if (!cond) errors.push(quoi);
  };
  try { corps(ok); }
  catch (e) { errors.push('⛔ corps du contrôle mort : ' + (e && e.message ? e.message : e)); }
  if (n < ASSERTIONS_ATTENDUES) {
    errors.push('⛔ check-classer-idealo n\'a rendu que ' + n + ' assertions sur '
      + ASSERTIONS_ATTENDUES + ' attendues : contrôle amputé.');
  }
  return errors;
};

if (require.main === module) {
  const e = module.exports();
  if (e.length) { e.forEach((x) => console.error('  ❌ ' + x)); process.exit(1); }
  console.log('✅ check-classer-idealo OK');
}
