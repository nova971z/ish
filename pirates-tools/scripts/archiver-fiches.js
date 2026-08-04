#!/usr/bin/env node
'use strict';
/* ══ ARCHIVER DES FICHES — LES RANGER, JAMAIS LES DÉTRUIRE ═══════════════════
   `node scripts/archiver-fiches.js --categorie Combos [--confirmer]`

   ⛔ DEMANDE DE L'USER, 04/08, MOT POUR MOT : « peut-être au lieu de les
   supprimer, les ranger dans un fichier externe qui ne pollue pas le site,
   comme ça si on a besoin de récupérer quelque chose ce sera facile — les
   fiches techniques par exemple ». Il avait d'abord dit « supprimer » ; il a
   choisi de ranger. On range.

   ⛔⛔ ESSAI PAR DÉFAUT. Sans `--confirmer`, l'outil COMPTE et montre, sans
   toucher à un seul octet. Un geste irréversible ne part jamais d'un lancement
   distrait — c'est la même règle que la remise à zéro de la comptabilité, et
   elle a déjà servi.

   ⛔ OÙ ÇA VA, ET POURQUOI LÀ. `archives/` est déclaré dans `.vercelignore` :
   présent dans git, JAMAIS déployé. C'est exactement le mécanisme qui existe
   déjà pour `images/_originals/` — on ne réinvente pas un rangement, on
   réutilise celui qui a fait ses preuves. Résultat : les fiches ne polluent
   plus le site, et une seule commande les ramène.

   ⚠️ CE QUI EST CONSERVÉ : la fiche ENTIÈRE, telle quelle — description,
   caractéristiques, prix, tout. Il a demandé de garder les fiches techniques ;
   n'en garder qu'un extrait reviendrait à décider à sa place ce qui compte.
   ⚠️ LES VISUELS SUIVENT : déplacés, jamais réécrits ni recompressés. Leur
   empreinte est relevée AVANT et APRÈS le déplacement, et l'outil ÉCHOUE si
   elle change. « Au pixel près » ne se promet pas, il se prouve.

   ⚠️ Portes lues : J3 — des fiches produit, aucune donnée personnelle ;
   J4 — aucun prix n'est recalculé, les fiches partent telles quelles ;
   J5 — aucune TVA, aucun octroi de mer. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const ARCHIVES = path.join(RACINE, 'archives');

function sha256(fichier) {
  return crypto.createHash('sha256').update(fs.readFileSync(fichier)).digest('hex');
}

/* Sépare les fiches à archiver du reste. Fonction PURE : elle ne lit ni
   n'écrit rien, pour être éprouvable sans toucher au catalogue. */
function trier(produits, critere) {
  const garde = [], archive = [];
  (produits || []).forEach((p) => {
    if (critere(p)) archive.push(p); else garde.push(p);
  });
  return { garde: garde, archive: archive };
}

/* ⛔⛔ LE CRITÈRE PAR RÉFÉRENCE, EXPOSÉ POUR ÊTRE ÉPROUVÉ. Écrit ici et non
   dans le harnais : une porte qui teste sa propre copie du critère est verte
   sans rien vérifier — piège rencontré en écrivant celle-ci, le sabotage du
   produit ne la faisait pas rougir.
   ⛔ Le préfixe mord au DÉBUT, jamais au milieu : une référence qui contient le
   motif ailleurs (`DCB-ZZ-003` pour un préfixe `ZZ-`) partirait avec, et ce
   serait une fiche archivée par erreur. */
function critereSkuPrefixe(prefixe) {
  const pre = String(prefixe || '').toUpperCase();
  return function (p) {
    return pre !== '' && String((p && p.sku) || '').toUpperCase().indexOf(pre) === 0;
  };
}

/* Les visuels d'une fiche, sans doublon : `heroImg` et `img` pointent souvent
   le même fichier, et le déplacer deux fois échouerait la seconde. */
function visuelsDe(p) {
  const v = [];
  [p && p.heroImg, p && p.img].forEach((f) => {
    if (!f || /placeholder/i.test(String(f))) return;
    const rel = String(f).replace(/^\//, '');
    if (v.indexOf(rel) === -1) v.push(rel);
  });
  return v;
}

function principal(argv) {
  const iCat = argv.indexOf('--categorie');
  const categorie = iCat !== -1 ? argv[iCat + 1] : null;
  /* ⛔ SÉLECTION PAR PRÉFIXE DE RÉFÉRENCE. Demande de l'user, 04/08 : « vire
     tous les produits de clickoutil, déplace-les dans un environnement qui ne
     pollue pas le site — je ne veux pas que le site au démarrage les charge ».
     Ces fiches ne se reconnaissent pas à leur catégorie (elles sont éparpillées
     sur huit rayons) mais à leur RÉFÉRENCE : un code interne, jamais une
     référence constructeur. Mesuré : 110 fiches, 78 Ko chargés à chaque
     ouverture du site, et aucun visuel. */
  const iPref = argv.indexOf('--sku-prefixe');
  const prefixe = iPref !== -1 ? argv[iPref + 1] : null;
  const confirmer = argv.indexOf('--confirmer') !== -1;
  if (!categorie && !prefixe) {
    console.error('usage : node scripts/archiver-fiches.js '
      + '(--categorie <nom> | --sku-prefixe <debut>) [--confirmer]');
    return 2;
  }
  if (categorie && prefixe) {
    /* ⛔ Deux critères à la fois, c'est deux gestes destructifs mêlés : on
       refuse plutôt que de deviner lequel l'emporte. */
    console.error('❌ --categorie ET --sku-prefixe ensemble : un seul critère à la fois.');
    return 2;
  }

  const fCat = path.join(RACINE, 'products.json');
  const brut = JSON.parse(fs.readFileSync(fCat, 'utf8'));
  const liste = Array.isArray(brut) ? brut : (brut.products || []);
  const critere = prefixe
    ? critereSkuPrefixe(prefixe)
    : ((p) => new RegExp(categorie, 'i').test(String((p && p.category) || '')));
  const quoi = prefixe ? ('réf. commençant par « ' + prefixe + ' »') : ('catégorie « ' + categorie + ' »');
  const tri = trier(liste, critere);

  console.log('');
  console.log('═══ ARCHIVER LES FICHES — ' + quoi + ' ═══');
  console.log('');
  console.log('  fiches au catalogue ........ ' + liste.length);
  console.log('  à archiver ................. ' + tri.archive.length);
  console.log('  restantes .................. ' + tri.garde.length);
  const visuels = [];
  tri.archive.forEach((p) => visuelsDe(p).forEach((v) => {
    if (visuels.indexOf(v) === -1) visuels.push(v);
  }));
  const presents = visuels.filter((v) => fs.existsSync(path.join(RACINE, v)));
  console.log('  visuels à déplacer ......... ' + presents.length
    + (visuels.length !== presents.length ? '  (' + (visuels.length - presents.length) + ' déjà absents)' : ''));

  if (!confirmer) {
    console.log('');
    console.log('  ⚠️ ESSAI — rien n\'a été déplacé. Relancer avec --confirmer pour agir.');
    console.log('');
    return 0;
  }

  fs.mkdirSync(ARCHIVES, { recursive: true });
  fs.mkdirSync(path.join(ARCHIVES, 'visuels'), { recursive: true });

  /* ⛔ LES EMPREINTES SE PRENNENT AVANT. Sans elles, « les images n'ont pas
     bougé » resterait une promesse — et une promesse n'est pas une preuve. */
  const avant = {};
  presents.forEach((v) => { avant[v] = sha256(path.join(RACINE, v)); });

  const horodatage = new Date().toISOString().slice(0, 10);
  const etiquette = (prefixe || categorie).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const dest = path.join(ARCHIVES, 'fiches-' + etiquette + '-' + horodatage + '.json');
  fs.writeFileSync(dest, JSON.stringify(tri.archive, null, 2));

  const bouges = [];
  presents.forEach((v) => {
    const cible = path.join(ARCHIVES, 'visuels', path.basename(v));
    fs.copyFileSync(path.join(RACINE, v), cible);
    /* ⛔ ON VÉRIFIE LA COPIE AVANT D'EFFACER L'ORIGINAL. Effacer d'abord, c'est
       parier ; vérifier d'abord, c'est savoir. */
    if (sha256(cible) !== avant[v]) {
      console.error('  ❌ ' + v + ' : la copie DIFFÈRE de l\'original. Rien n\'est effacé.');
      return;
    }
    fs.unlinkSync(path.join(RACINE, v));
    bouges.push(v);
  });

  if (bouges.length !== presents.length) {
    console.error('');
    console.error('  ❌ ARRÊT : ' + (presents.length - bouges.length) + ' visuel(s) n\'ont pas pu être '
      + 'copiés à l\'identique. Le catalogue n\'a PAS été modifié.');
    return 1;
  }

  if (Array.isArray(brut)) fs.writeFileSync(fCat, JSON.stringify(tri.garde, null, 2));
  else { brut.products = tri.garde; fs.writeFileSync(fCat, JSON.stringify(brut, null, 2)); }

  console.log('');
  console.log('  fiches rangées dans ........ ' + path.relative(RACINE, dest));
  console.log('  visuels déplacés ........... ' + bouges.length + ' vers archives/visuels/');
  console.log('  empreintes vérifiées ....... ' + bouges.length + '/' + bouges.length + ' identiques');
  console.log('');
  console.log('  ⛔ `archives/` est dans .vercelignore : dans git, jamais servi.');
  console.log('');
  return 0;
}

module.exports = { trier: trier, visuelsDe: visuelsDe, critereSkuPrefixe: critereSkuPrefixe };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
