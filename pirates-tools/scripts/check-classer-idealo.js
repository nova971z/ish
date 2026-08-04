#!/usr/bin/env node
'use strict';
/* ══ PORTE — LE CLASSEMENT DU BALAYAGE IDEALO ════════════════════════════════
   `node scripts/check-classer-idealo.js`

   Ce que cette porte défend, dans l'ordre des priorités du projet :

   ① ARGENT — le dédoublonnage ne doit JAMAIS confondre deux variantes dont le
     prix diffère. `DCF620N` (nu) et `DCF620NT` (coffret) sont séparés de ~50 €
     selon l'user ; les fusionner ferait écrire le prix du nu sur la fiche du
     coffret, ou l'inverse. Idem pour la référence NUE (`DCM200`) face à sa
     version suffixée (`DCM200N`) : mesuré sur le balayage du 04/08, le seau nu
     mélange des kits et des outils nus — `DCE560` à 123,99 € AVEC batteries
     contre `DCE560N` nu à 244,86 €.
   ② FONCTIONNEL — « le moins cher gagne » doit tenir même quand un prix est
     absent, nul, ou arrive en second.
   ③ HONNÊTETÉ DU CHIFFRE — une ignorance ne vote pas : un produit qu'aucun
     signal ne classe part dans « À trancher », pas dans la plus grosse famille.

   ⛔ Cette porte n'ancre AUCUNE donnée du catalogue : elle fabrique ses propres
   annonces. Dix-huit harnais sont morts pour avoir nommé un produit réel.

   ⚠️ Portes lues : J3 — aucune donnée personnelle ; J4 — aucun prix écrit ;
   J5 — aucune TVA. */

const cl = require('./classer-idealo.js');

/* ⛔ LE CONTRÔLE S'EXÉCUTE DANS UNE FONCTION, JAMAIS AU CHARGEMENT DU MODULE.
   La CI fait `safeRequire` puis appelle : un contrôle qui travaille au `require`
   rendrait ses assertions AVANT que la CI ne compte quoi que ce soit, et son
   retour (`undefined`) ferait mourir `runOne` sur « fn is not a function » —
   c'est-à-dire une porte présente, verte à l'écran, et qui casse la CI.
   ⚠️ Il rend un TABLEAU d'erreurs, comme toutes les autres portes du projet. */
/* ⛔⛔ LE PRÉALABLE VIT DANS L'ENVELOPPE, PAS DANS LE CORPS. Premier jet : le
   « moins de 20 assertions » était écrit à la FIN du corps — un `return`
   anticipé le sautait, et le sabotage qui amputait toutes les assertions
   laissait la porte VERTE. Une garde placée après ce qu'elle garde ne garde
   rien ; c'est E-405, la garde posée sur un seul chemin. Ici le compte est
   relevé par l'appelant, qui ne peut pas être court-circuité. */
function corps(ok) {

/* ── ① LE DÉDOUBLONNAGE NE MÉLANGE PAS LES VARIANTES ───────────────────── */
function ligne(sku, titre, prix, car) {
  const e = { sku: sku, titre: titre, prix: prix, car: car || null };
  const k = cl.cleDoublon(e);
  e.cleDoublon = k.cle; e.niveauCle = k.niveau;
  e.pack = !!(car && car.pack);
  return e;
}

const nu = ligne('ZZF620N-XJ', 'ZZ nu', 125.12, { famille: 'machine' });
const coffret = ligne('ZZF620NT-XJ', 'ZZ coffret', 175.12, { famille: 'machine' });
ok(nu.cleDoublon !== coffret.cleDoublon,
  '⛔⛔ ARGENT : le NU et le COFFRET ne partagent JAMAIS une clé de doublon — '
  + 'un coffret vaut ~50 € de plus (' + nu.cleDoublon + ' vs ' + coffret.cleDoublon + ')');

ok(cl.dedoublonner([nu, coffret]).length === 2,
  '⛔ …et les deux SURVIVENT au dédoublonnage : le moins cher ne doit pas '
  + 'manger la variante coffret');

/* La zone géographique, elle, se retire : c'est le seul suffixe sans prix. */
const xj = ligne('ZZF620N-XJ', 'ZZ nu', 130, { famille: 'machine' });
const qw = ligne('ZZF620N-QW', 'ZZ nu', 120, { famille: 'machine' });
ok(xj.cleDoublon === qw.cleDoublon,
  '-XJ et -QW sont la MÊME référence : la zone géographique ne change pas le '
  + 'produit (' + xj.cleDoublon + ' vs ' + qw.cleDoublon + ')');
const gagnant = cl.dedoublonner([xj, qw]);
ok(gagnant.length === 1 && gagnant[0].prix === 120,
  '⛔ …et c\'est le MOINS CHER qui reste (' + (gagnant[0] || {}).prix + ' €)');

/* ── LA RÉFÉRENCE NUE NE SE RABAT PAS SUR LA SUFFIXÉE ──────────────────── */
const brut = ligne('ZZM200', 'Annonce sans lettre finale', 123.99, { famille: 'machine', pack: true });
const brutN = ligne('ZZM200N', 'Outil nu', 244.86, { famille: 'machine', pack: false });
ok(brut.cleDoublon !== brutN.cleDoublon,
  '⛔⛔ ARGENT : « ZZM200 » ne se rabat PAS sur « ZZM200N ». Mesuré sur les 112 '
  + 'paires du balayage, le seau nu mélange kits et outils nus — fusionner '
  + 'écrirait un prix de kit sur une fiche d\'outil nu');
ok(brut.niveauCle === 'référence nue',
  '⛔ …et le niveau de clé le DIT (« référence nue »), au lieu de laisser croire '
  + 'à une identification sûre (' + brut.niveauCle + ')');

/* …SAUF quand le titre nomme lui-même la référence longue : là c'est une
   LECTURE, pas une déduction. */
const lue = ligne('ZZM200', 'DeWALT ZZM200N — Lime à bande 18V ZZM200N', 226.88, { famille: 'machine' });
ok(lue.cleDoublon === 'REF:ZZM200N' && lue.niveauCle === 'référence lue dans le titre',
  'une référence nue dont le TITRE nomme une seule version longue est rattachée '
  + 'à celle-là, et le niveau de clé le dit (' + lue.cleDoublon + ' / ' + lue.niveauCle + ')');

const deuxCandidates = ligne('ZZM200', 'ZZM200N ou ZZM200NT au choix', 200, { famille: 'machine' });
ok(deuxCandidates.cleDoublon === 'REF:ZZM200',
  '⛔ …mais DEUX versions longues dans le titre ne se tranchent PAS : '
  + 'on garde la nue plutôt que de choisir au hasard (' + deuxCandidates.cleDoublon + ')');

/* ── L'AMBIGUÏTÉ EST SIGNALÉE, PAS CORRIGÉE EN DOUCE ───────────────────── */
const lot = [brut, brutN];
const marquees = cl.marquerAmbigues(lot);
ok(marquees === 1 && lot[0].refAmbigue === true && lot[1].refAmbigue === false,
  '⛔ la référence nue est MARQUÉE ambiguë dès qu\'une version suffixée existe '
  + 'dans le même balayage, et la suffixée ne l\'est pas (' + marquees + ' marquée(s))');

const seule = [ligne('ZZX999', 'sans frère suffixé', 10, { famille: 'machine' })];
ok(cl.marquerAmbigues(seule) === 0,
  '⛔ …et une référence nue SANS frère suffixé n\'est PAS marquée : une alerte '
  + 'qui se lève toujours ne signale plus rien');

/* ── ② « LE MOINS CHER GAGNE », Y COMPRIS QUAND UN PRIX MANQUE ─────────── */
function px(prix) {
  const e = ligne('ZZP100N', 'même produit', prix, { famille: 'machine' });
  return e;
}
const avecTrou = cl.dedoublonner([px(null), px(89.90), px(0), px(120)]);
ok(avecTrou.length === 1 && avecTrou[0].prix === 89.90,
  '⛔ ARGENT : un prix ABSENT ou NUL ne gagne jamais contre un prix réel — '
  + 'sinon le classement recommanderait un produit sans tarif ('
  + (avecTrou[0] || {}).prix + ')');

const ordreInverse = cl.dedoublonner([px(89.90), px(49.90)]);
ok(ordreInverse.length === 1 && ordreInverse[0].prix === 49.90,
  '⛔ …et le moins cher gagne même s\'il arrive en SECOND : une comparaison qui '
  + 'ne tient que dans un sens ne tient pas');

/* ── ③ LE CLASSEMENT : LA FAMILLE MESURÉE PRIME SUR LE TITRE ───────────── */
ok(cl.classer({ famille: 'machine' }, 'Gants de protection').rayon === 'ELECTRO_PORTATIF',
  '⛔ la famille MESURÉE par le parseur prime sur le titre : un titre trompeur '
  + 'ne doit pas renverser une caractéristique lue sur l\'annonce');

ok(cl.classer({ famille: 'consommable' }, '').rayon === 'QUINCAILLERIE',
  'un consommable va en quincaillerie');
ok(cl.classer({ famille: 'epi' }, '').rayon === 'VETEMENTS',
  'un EPI va en vêtements');
ok(cl.classer({ famille: 'energie' }, '').rayon === 'ELECTRO_PORTATIF',
  'une batterie va à l\'électro portatif — c\'est la plateforme des machines');

ok(cl.classer({}, 'ZZ9999').rayon === 'A_TRANCHER',
  '⛔⛔ UNE IGNORANCE NE VOTE PAS : sans famille et sans mot reconnaissable, le '
  + 'produit part dans « À trancher », JAMAIS dans la plus grosse famille');

/* ── LES ACCENTS ET LES COMPOSÉS — le défaut qui a coûté 16 lignes ─────── */
ok(cl.classer({}, 'Écouteurs True Wireless Pro').rayon === 'ELECTRO_PORTATIF',
  '⛔⛔ un titre commençant par une MAJUSCULE ACCENTUÉE est reconnu. `\\b[ée]` '
  + 'ne mord pas devant « É » : la frontière ASCII n\'existe pas là, le motif '
  + 'avait l\'air juste et ne trouvait rien');
ok(cl.classer({}, 'Ébrancheur 60 cm bypass').rayon === 'QUINCAILLERIE',
  '⛔ …dans les trois familles, pas seulement celle où le défaut a été vu');
ok(cl.classer({}, 'DEWALT Streifennagel 34Gr. Ring 75mm').rayon === 'QUINCAILLERIE',
  '⛔ un composé allemand est reconnu au FRAGMENT : « nagel » n\'a aucune '
  + 'frontière de mot au milieu de « Streifennagel »');
ok(cl.classer({}, 'DEWALT Streifennagel 34Gr.').signal === 'titre-fragment',
  '⛔ …et le signal DIT que c\'est un fragment : un rattachement par morceau de '
  + 'mot est moins sûr qu\'un mot entier, et le cacher serait mentir');

/* ── L'ORDRE DES FAMILLES EST DÉLIBÉRÉ ─────────────────────────────────── */
ok(cl.classer({}, 'Sac à dos lumineux avec 33 poches pour outils').rayon === 'VETEMENTS',
  'le portage passe AVANT l\'outil dans un titre qui contient les deux');

/* ── LE COMPTE OUTILS SEULS / PACKS ────────────────────────────────────── */
const mixte = [{ pack: true }, { pack: false }, { pack: false }];
const c = cl.compter(mixte);
ok(c.total === 3 && c.packs === 1 && c.seuls === 2,
  'le compte sépare packs et outils seuls sans en perdre ('
  + JSON.stringify(c) + ')');
ok(c.seuls + c.packs === c.total,
  '⛔ …et la somme des deux fait EXACTEMENT le total : un produit ne peut être '
  + 'ni les deux ni aucun');

/* ── LE CSV RESTE LISIBLE QUAND LE TITRE CONTIENT LE SÉPARATEUR ────────── */
const piege = ligne('ZZC1N', 'Perceuse ; 18V "XR" ligne1', 99, { famille: 'machine' });
piege.rayonCommercial = 'ELECTRO_PORTATIF'; piege.signalClassement = 'famille:machine';
piege.origine = 'test'; piege.doublonsFusionnes = 1;
const csv = cl.ligneCsv(piege);
ok(csv.split(';').length > cl.COLONNES.length - 1,
  'un titre contenant « ; » ne casse pas la ligne — il est mis entre guillemets');
ok(/"Perceuse ; 18V ""XR"" ligne1"/.test(csv),
  '⛔ …et les guillemets internes sont DOUBLÉS, sinon Numbers coupe la cellule ('
  + csv.slice(0, 90) + ')');

}

/* Le nombre d'assertions ATTENDU. Un contrôle qui en rend moins a été amputé —
   par une refonte, un `return` égaré, une exception avalée — et « non exécuté
   n'est PAS vert » vaut aussi pour les portes. */
const ASSERTIONS_ATTENDUES = 20;

module.exports = function () {
  const errors = [];
  let n = 0;
  const ok = function (cond, quoi) {
    n++;
    if (!cond) errors.push(quoi);
  };
  /* ⛔ Une exception dans le corps est un ÉCHEC, jamais un silence : sans ce
     catch, `runOne` la remonterait — mais le compte d'assertions, lui, serait
     perdu, et on ne saurait pas COMBIEN de contrôles n'ont pas eu lieu. */
  try { corps(ok); }
  catch (e) { errors.push('⛔ corps du contrôle mort : ' + (e && e.message ? e.message : e)); }
  if (n < ASSERTIONS_ATTENDUES) {
    errors.push('⛔ check-classer-idealo n\'a rendu que ' + n + ' assertions sur '
      + ASSERTIONS_ATTENDUES + ' attendues : un contrôle amputé qui se tait vaut '
      + 'pire que pas de contrôle.');
  }
  return errors;
};

if (require.main === module) {
  const e = module.exports();
  if (e.length) { e.forEach((x) => console.error('  ❌ ' + x)); process.exit(1); }
  console.log('✅ check-classer-idealo OK');
}
