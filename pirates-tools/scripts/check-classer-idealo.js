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

/* ⛔ Mesuré, pas estimé : `assertions rendues : 24` (corps instrumenté). Mon
   premier seuil disait 21 — un chiffre écrit de tête, avec 3 assertions de
   marge dans lesquelles une amputation serait passée inaperçue. */
const ASSERTIONS_ATTENDUES = 24;

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
