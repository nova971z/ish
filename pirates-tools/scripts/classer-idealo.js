#!/usr/bin/env node
'use strict';
/* ══ CLASSER TOUT CE QUE LE BALAYAGE IDEALO A RAMENÉ ═════════════════════════
   `node scripts/classer-idealo.js <dossier-des-reponses> [--sortie <dossier>]`

   ⛔ DEMANDE DE L'USER, 04/08, MOT POUR MOT : « d'abord tu vas classer
   absolument tout sur ces 67 pages, tout l'électro portatif avec l'électro
   portatif, la quincaillerie avec la quincaillerie et les vêtements avec les
   vêtements, et tu me mets ça dans un fichier que je peux télécharger. Tu
   ranges correctement les 4020 produits. Tu vires les doublons et tu prends
   les moins chers. Tu vas définir combien il y a d'outils seuls au total,
   combien il y a de packs au total, ensuite tu élimines les doublons en
   gardant les moins chers, et pareil tu me dis combien il en reste. Et tu
   respectes exactement la même action avec la quincaillerie et les vêtements. »

   ⛔⛔ PAS DE TABLEAU DANS LA RÉPONSE. Sa consigne : « je ne veux plus jamais
   que tu me refasses un putain de tableau comme ça — tu utilises des canevas
   comme pour le code, que je puisse sélectionner et copier-coller exactement
   ce que j'ai envie ». La sortie est donc un FICHIER : CSV pour être ouvert
   dans Numbers sur son iPad, JSON pour la reprise par le code.

   ⚠️ Le CSV part avec un BOM UTF-8 et le point-virgule en séparateur : sans
   BOM, Numbers et Excel lisent « Perçage » comme « PerÃ§age » ; avec la
   virgule, tout prix français (« 249,90 ») casse la colonne.

   ⛔ CE QUI FAIT FOI POUR LA FAMILLE. Le parseur rend déjà `car.famille` et
   `car.rayon`, mesurés sur l'annonce elle-même — c'est la source. Le titre
   n'est consulté QUE si la famille est absente, et le classement dit alors
   par quel signal il a été obtenu (`signal` dans le CSV). Un produit qu'aucun
   des deux signaux ne tranche part dans « À TRANCHER » et n'est PAS distribué
   au hasard dans une des trois familles : une ignorance ne vote pas.

   ⛔ LA CLÉ DE DOUBLON SUIT LA GRAMMAIRE DE L'USER, 04/08 : « DCF = type
   d'outil, 620 = modèle, N = nu / T = coffret, -XJ = zone géographique ».
   La zone géographique se retire (`racineRef`), le N/T JAMAIS : la version
   coffret vaut ~50 € de plus que la nue, les confondre ferait écrire un prix
   de nu sur une fiche de coffret. C'est de l'argent, donc priorité 1.

   ⚠️ Portes lues : J3 — des annonces publiques d'outillage, aucune donnée
   personnelle ; J4 — aucun prix n'est recalculé ni écrit, on relève ceux des
   annonces tels quels ; J5 — aucune TVA, aucun octroi de mer. */

const fs = require('fs');
const path = require('path');
const priceParse = require('../api/_lib/price-parse.js');

/* ══ 1. LES TROIS FAMILLES COMMERCIALES ════════════════════════════════════
   ⛔ La table est écrite ICI, en clair, et pas enfouie dans une condition :
   déplacer une famille entière doit coûter UNE ligne. `energie` (batteries,
   chargeurs) va à l'électro portatif — c'est la plateforme d'alimentation des
   machines sans fil, jamais de la visserie. `rangement` (coffrets TSTAK,
   mobilier d'atelier, portage) va à la quincaillerie. */
const FAMILLE_VERS_RAYON = {
  machine: 'ELECTRO_PORTATIF',
  energie: 'ELECTRO_PORTATIF',
  consommable: 'QUINCAILLERIE',
  rangement: 'QUINCAILLERIE',
  epi: 'VETEMENTS'
};

const LIBELLE = {
  ELECTRO_PORTATIF: 'Électro portatif',
  QUINCAILLERIE: 'Quincaillerie',
  VETEMENTS: 'Vêtements & EPI',
  A_TRANCHER: 'À trancher'
};

/* Repêchage par le titre — UNIQUEMENT quand `car.famille` est vide. Chaque
   motif a été tiré des 104 annonces réellement restées sans famille au premier
   passage, jamais inventé, et les langues suivent ce qu'idealo publie : les
   fiches allemandes, polonaises et espagnoles sont dans le même flux.

   ⛔ L'ORDRE COMPTE, et il est délibéré : le vêtement d'abord (un « sac à dos
   pour outils » est un portage, pas une perceuse), la quincaillerie ensuite,
   l'électro en dernier — parce que « kit » et « batterie » apparaissent dans
   des titres de consommables et emporteraient tout s'ils passaient devant. */
/* ⛔⛔ LES ACCENTS SE RETIRENT AVANT DE CHERCHER, ET C'EST UN DÉFAUT PAYÉ.
   Premier jet : `/\b[ée]couteurs?/i` sur « Écouteurs True Wireless » — jamais
   trouvé. `\b` est une frontière ASCII : entre le début de chaîne et `É`, qui
   n'est pas un caractère de mot ASCII, il n'y a AUCUNE frontière. Le motif
   avait l'air juste, il ne mordait rien, et les écouteurs partaient en
   « à trancher » sans que rien ne le dise.
   ⚠️ Même piège pour l'allemand : `\bnagel` ne trouve pas « StreifenNAGEL »,
   parce qu'un composé n'a pas de frontière au milieu. D'où deux jeux de
   motifs — MOT (frontière exigée) et FRAGMENT (n'importe où). */
function sansAccents(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* MOT — la frontière est exigée : « vis » ne doit pas attraper « visseuse ». */
const MOTS = [
  ['VETEMENTS', /\b(vestes?|pantalons?|blousons?|sweats?|t-?shirts?|polos?|casquettes?|bonnets?|gants?|chaussures?|bottes?|bottines?|genouilleres?|salopettes?|parkas?|softshell|gilets?|combinaisons?|harnais|hats?|caps?|jackets?|trousers|boots?|gloves?|sac a dos)\b/],
  ['QUINCAILLERIE', /\b(forets?|meches?|lames?|disques?|embouts?|douilles?|vis|chevilles?|fraises?|burins?|ciseaux?|abrasifs?|mallettes?|assortiment|rangement|servante|etablis?|cadenas|equerres?|clous?|ongles|taloches?|spatules?|truelles?|enclume|pietements?|legstand|supports?|treteaux?|ebrancheurs?|wrench|couronnes?|corona|nozzle|buses?|tuyaux?|raccords?|dents?|denture|jerricane|caisse|boite|tige telescopique|sac a outils|scies? cloche|papier de verre|jeu de|set de|coffrets? de|kit d.accessoires|niveau a bulle|cabeza|core bit|forage bit|griff)\b/],
  ['ELECTRO_PORTATIF', /\b(perceuses?|visseuses?|meuleuses?|scies?|perforateurs?|marteaux?|ponceuses?|rabots?|defonceuses?|cloueurs?|agrafeuses?|aspirateurs?|souffleurs?|tronconneuses?|tondeuses?|debroussailleuses?|compresseurs?|lasers?|projecteurs?|lampes?|radios?|chargeurs?|batteries?|accus?|kits?|combo|multitool|routeurs?|decoupeurs?|nettoyeurs?|pompes?|ventilateurs?|surfaceuses?|riveteuses?|pistolets?|pilonneuses?|enrouleurs?|ecouteurs?|earphones?|headphones?|bluetooth|cables?|grzechotka|zszywacz|vacuum|cleaner|reservoir|taille-?haies?|outil multifonctions?|poste a souder|regle vibrante|sous vide|casques? audio)\b/]
];

/* FRAGMENT — sans frontière, pour les composés allemands et les marques
   collées. Chaque entrée vient d'un titre réellement vu dans le balayage. */
const FRAGMENTS = [
  ['QUINCAILLERIE', /(nagel|nagle|spachtel|bohrkrone|lochsage|lochsaege|werkzeugset|schrauben|klingen|stauchkopf|einsatz)/],
  ['ELECTRO_PORTATIF', /(schrauber|bohrhammer|saege|schleifer|akkupack|staubsauger)/]
];

/* ⛔ FONCTION PURE — aucune lecture disque, pour être éprouvable sans balayage.
   Rend TOUJOURS `{ rayon, signal }` : le signal dit d'où vient le verdict, et
   c'est lui qui permet de contester un classement sans relire tout le code. */
function classer(car, titre) {
  const c = car || {};
  const parFamille = FAMILLE_VERS_RAYON[String(c.famille || '')];
  if (parFamille) return { rayon: parFamille, signal: 'famille:' + c.famille };
  const t = sansAccents(titre);
  for (let i = 0; i < MOTS.length; i++) {
    if (MOTS[i][1].test(t)) return { rayon: MOTS[i][0], signal: 'titre' };
  }
  for (let i = 0; i < FRAGMENTS.length; i++) {
    if (FRAGMENTS[i][1].test(t)) return { rayon: FRAGMENTS[i][0], signal: 'titre-fragment' };
  }
  /* ⛔ Aucun signal : on le DIT. Le ranger d'office en électro portatif
     gonflerait la famille la plus grosse d'un chiffre invérifiable. */
  return { rayon: 'A_TRANCHER', signal: 'aucun' };
}

/* ══ 2. LA CLÉ DE DOUBLON ══════════════════════════════════════════════════
   Trois niveaux, du plus sûr au moins sûr, et le niveau retenu est écrit dans
   le CSV : un dédoublonnage par titre normalisé n'a pas la même force qu'un
   dédoublonnage par référence, et le cacher serait mentir sur la précision. */
function normaliserTitre(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(dewalt|de\s*walt)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ⛔⛔ UNE RÉFÉRENCE NUE SE COMPLÈTE PAR LE TITRE, ELLE NE SE DEVINE PAS.
   Mesuré sur le balayage : idealo publie parfois « DCM200 » là où l'outil est
   un DCM200N, et 1 308 lignes portent ainsi une référence qui s'arrête sur un
   chiffre. Quand le TITRE de l'annonce nomme UNE SEULE référence plus longue
   commençant par celle-là, on prend la longue — c'est une LECTURE, pas une
   déduction. Deux candidates différentes : on ne tranche pas.

   ⛔ CE QU'ON NE FAIT PAS : rabattre « DCM200 » sur « DCM200N » par principe.
   Mesuré sur les 112 paires X / XN du balayage, le seau nu MÉLANGE les
   variantes — `DCE560` sort à 123,99 € AVEC batteries quand `DCE560N` est nu à
   244,86 €, `DCLE34031` à 791,98 € en kit quand `DCLE34031N` est nu à
   367,63 €. Fusionner écrirait un prix de kit sur une fiche d'outil nu, ou
   l'inverse. C'est de l'argent, donc priorité 1 : on s'abstient et on SIGNALE
   (colonne « Réf. ambiguë » du CSV). */
function refDansLeTitre(racine, titre) {
  const t = String(titre || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ');
  const re = new RegExp('\\b' + racine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[A-Z][A-Z0-9]*\\b', 'g');
  const vus = Array.from(new Set(t.match(re) || []));
  return vus.length === 1 ? vus[0] : null;
}

function cleDoublon(e) {
  const c = e.car || {};
  const ref = e.sku || c.sku || c.skuEclate || null;
  if (ref) {
    const racine = priceParse.racineRef(String(ref).toUpperCase());
    if (/[0-9]$/.test(racine)) {
      const longue = refDansLeTitre(racine, e.titre);
      if (longue) {
        return { cle: 'REF:' + priceParse.racineRef(longue), niveau: 'référence lue dans le titre' };
      }
      return { cle: 'REF:' + racine, niveau: 'référence nue' };
    }
    return { cle: 'REF:' + racine, niveau: 'référence' };
  }
  const n = normaliserTitre(e.titre);
  if (n) return { cle: 'TIT:' + n, niveau: 'titre' };
  return { cle: 'BRUT:' + JSON.stringify(e).slice(0, 120), niveau: 'aucun' };
}

/* ⛔ « LES MOINS CHERS » — la consigne, appliquée telle quelle. Un prix absent
   ou nul ne gagne JAMAIS contre un prix réel : sinon le doublon retenu serait
   celui dont on ne connaît pas le prix, et le classement recommanderait un
   produit sans tarif. */
function dedoublonner(liste) {
  const par = new Map();
  (liste || []).forEach((e) => {
    const k = e.cleDoublon;
    const prec = par.get(k);
    if (!prec) { par.set(k, e); return; }
    const pn = (typeof e.prix === 'number' && e.prix > 0) ? e.prix : Infinity;
    const pp = (typeof prec.prix === 'number' && prec.prix > 0) ? prec.prix : Infinity;
    if (pn < pp) par.set(k, e);
  });
  return Array.from(par.values());
}

/* ══ 3. LECTURE DES RÉPONSES ═══════════════════════════════════════════════ */
function fichiersDe(dossier) {
  return fs.readdirSync(dossier)
    .filter((n) => /\.json$/i.test(n))
    .map((n) => path.join(dossier, n))
    .filter((f) => fs.statSync(f).isFile());
}

/* Les trois listes rendues par le mode à sec, ramenées à UNE forme. Chacune
   apporte ce qu'elle a : `reconnus` la fiche du catalogue, `inconnus` la
   référence lue chez le marchand, `sansRefDetail` le titre complet. */
function aplatir(rep) {
  const out = [];
  (rep.reconnus || []).forEach((e) => out.push({
    origine: 'reconnu', sku: e.sku || null, ficheSku: e.ficheSku || null,
    titre: e.fiche || e.sku || '', prix: e.srcTTC, car: e.car || null,
    prixSiteActuel: e.ancien, prixSiteCalcule: e.nouveau
  }));
  (rep.inconnus || []).forEach((e) => out.push({
    origine: 'inconnu', sku: e.sku || null, ficheSku: null,
    titre: e.name || e.sku || '', prix: e.srcTTC, car: e.car || null,
    prixSiteActuel: null, prixSiteCalcule: null
  }));
  (rep.sansRefDetail || []).forEach((e) => out.push({
    origine: 'sans-ref', sku: null, ficheSku: null,
    titre: e.titre || '', prix: e.prix, car: e.car || null,
    prixSiteActuel: null, prixSiteCalcule: null
  }));
  return out;
}

/* ⛔⛔ LE COMPTE DES PAGES ET DES TUILES NE SE RÉÉCRIT PAS ICI. Il vit dans
   `scripts/bilan-balayage.js`, écrit après E-113 précisément pour ça : une
   page s'identifie par l'EMPREINTE de son contenu (`page.empreinte`), jamais
   par son rang, et une page envoyée deux fois ne doit compter ses tuiles
   qu'une fois. Recopier cette logique ici en ferait une seconde vérité qui
   divergerait au premier correctif — c'est O6, la copie périmée. */
const bilanBalayage = require('./bilan-balayage.js');

function collecter(dossier, pagesAttendues) {
  const fichiers = fichiersDe(dossier);
  const lignes = [];
  const vues = new Set();
  const objets = [];
  let illisibles = 0, pagesPlafonnees = 0, pagesEnDouble = 0;
  fichiers.forEach((f) => {
    let j;
    try { j = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { illisibles++; return; }
    objets.push(j);
    /* ⛔ UNE PAGE ENVOYÉE DEUX FOIS N'APPORTE PAS DE PRODUITS EN PLUS. Sans
       cette garde, un renvoi du raccourci gonflerait le total AVANT
       dédoublonnage — et le nombre de « doublons supprimés » compterait des
       doublons que j'aurais fabriqués moi-même. */
    const emp = (j.page && j.page.empreinte) ? String(j.page.empreinte) : null;
    if (emp && vues.has(emp)) { pagesEnDouble++; return; }
    if (emp) vues.add(emp);
    /* ⛔ LE PLAFOND SE COMPTE, IL NE SE TAIT PAS. `sansRefDetail` est tronqué
       à 40 entrées par page côté serveur ; une page qui en rend exactement 40
       a probablement perdu la suite, et un total qui ne le dirait pas se
       ferait passer pour exhaustif. */
    if ((j.sansRefDetail || []).length >= 40) pagesPlafonnees++;
    aplatir(j).forEach((l) => lignes.push(l));
  });
  const b = bilanBalayage.bilan(objets, pagesAttendues);
  return { lignes: lignes, pages: b.pagesDifferentes, tuiles: b.tuilesVues,
    produitsLus: b.produitsLus, pagesManquantes: b.pagesManquantes,
    fichiers: fichiers.length, illisibles: illisibles,
    pagesPlafonnees: pagesPlafonnees, pagesEnDouble: pagesEnDouble };
}

/* ⛔ MARQUER LES RÉFÉRENCES AMBIGUËS — l'ambiguïté se voit, elle ne se corrige
   pas en douce. Une clé qui s'arrête sur un chiffre est ambiguë dès qu'il
   existe, dans le même balayage, une clé identique prolongée d'une lettre :
   « DCM200 » à côté de « DCM200N » peut désigner le nu comme le coffret, et
   c'est à l'user de trancher, pas à moi. */
function marquerAmbigues(lignes) {
  const cles = new Set(lignes.map((e) => e.cleDoublon));
  let n = 0;
  lignes.forEach((e) => {
    const k = e.cleDoublon;
    e.refAmbigue = false;
    if (!/^REF:.*[0-9]$/.test(k)) return;
    for (const autre of cles) {
      if (autre !== k && autre.indexOf(k) === 0 && /^[A-Z]/.test(autre.slice(k.length))) {
        e.refAmbigue = true; n++; return;
      }
    }
  });
  return n;
}

/* ══ 4. LE BILAN — AVANT ET APRÈS, PAR FAMILLE ═════════════════════════════ */
function compter(liste) {
  let packs = 0, seuls = 0;
  liste.forEach((e) => { if (e.pack) packs++; else seuls++; });
  return { total: liste.length, seuls: seuls, packs: packs };
}

function bilanParRayon(lignes) {
  const par = {};
  lignes.forEach((e) => { (par[e.rayonCommercial] = par[e.rayonCommercial] || []).push(e); });
  const res = {};
  Object.keys(par).forEach((r) => {
    const avant = par[r];
    const apres = dedoublonner(avant);
    res[r] = { avant: compter(avant), apres: compter(apres), lignes: apres, brutes: avant };
  });
  return res;
}

/* ══ 5. ÉCRITURE ═══════════════════════════════════════════════════════════ */
function csvChamp(v) {
  const s = (v == null) ? '' : String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function prixFr(v) {
  return (typeof v === 'number' && isFinite(v)) ? v.toFixed(2).replace('.', ',') : '';
}

const COLONNES = ['Famille', 'Rayon', 'Référence', 'Titre', 'Prix idealo (€)',
  'Pack', 'Type', 'Voltage', 'Coffret', 'Ah', 'Nb outils', 'Nb batteries',
  'Nb pièces', 'Édition limitée', 'Origine', 'Signal de classement',
  'Clé de doublon', 'Niveau de clé', 'Réf. ambiguë', 'Doublons fusionnés',
  'Réf. fiche du site', 'Prix actuel du site (€)'];

function ligneCsv(e) {
  const c = e.car || {};
  return [
    LIBELLE[e.rayonCommercial] || e.rayonCommercial,
    c.rayon || '', e.sku || c.sku || c.skuEclate || '', e.titre || '',
    prixFr(e.prix), e.pack ? 'pack' : 'seul', c.type || '',
    c.voltage == null ? '' : c.voltage, c.coffret || '',
    c.ah == null ? '' : c.ah, c.nbOutils == null ? '' : c.nbOutils,
    c.nbBatteries == null ? '' : c.nbBatteries, c.nbPieces == null ? '' : c.nbPieces,
    c.editionLimitee ? 'oui' : '', e.origine, e.signalClassement,
    e.cleDoublon, e.niveauCle, e.refAmbigue ? 'oui' : '',
    e.doublonsFusionnes == null ? '' : e.doublonsFusionnes,
    e.ficheSku || '', prixFr(e.prixSiteActuel)
  ].map(csvChamp).join(';');
}

function ecrireCsv(fichier, lignes) {
  const corps = [COLONNES.join(';')].concat(lignes.map(ligneCsv)).join('\r\n');
  fs.writeFileSync(fichier, '﻿' + corps + '\r\n', 'utf8');
}

const ORDRE = ['ELECTRO_PORTATIF', 'QUINCAILLERIE', 'VETEMENTS', 'A_TRANCHER'];

function principal(argv) {
  const dossier = argv[0];
  const iS = argv.indexOf('--sortie');
  const sortie = iS !== -1 ? argv[iS + 1] : path.join(__dirname, '..', 'archives', 'idealo');
  if (!dossier || !fs.existsSync(dossier)) {
    console.error('usage : node scripts/classer-idealo.js <dossier-des-reponses> [--sortie <dossier>]');
    return 2;
  }

  const iP = argv.indexOf('--pages');
  const pagesAttendues = iP !== -1 ? parseInt(argv[iP + 1], 10) : 67;
  const rec = collecter(dossier, pagesAttendues);
  if (!rec.lignes.length) {
    console.error('❌ aucune ligne lue : le dossier ne contient pas de réponses exploitables.');
    return 2;
  }

  rec.lignes.forEach((e) => {
    const cl = classer(e.car, e.titre);
    e.rayonCommercial = cl.rayon;
    e.signalClassement = cl.signal;
    const k = cleDoublon(e);
    e.cleDoublon = k.cle;
    e.niveauCle = k.niveau;
    /* ⛔ `pack` VIENT DU PARSEUR, il ne se redevine pas ici. Une seconde
       définition du mot « pack » divergerait de celle du traqueur au premier
       correctif, et les deux chiffres se contrediraient sans qu'on sache
       lequel croire. */
    e.pack = !!(e.car && e.car.pack);
  });

  const ambigues = marquerAmbigues(rec.lignes);
  const bilan = bilanParRayon(rec.lignes);

  /* Combien d'annonces chaque ligne retenue représente — c'est ce qui prouve
     que « le moins cher » a bien eu des concurrents à battre. */
  ORDRE.forEach((r) => {
    if (!bilan[r]) return;
    const compte = new Map();
    bilan[r].brutes.forEach((e) => compte.set(e.cleDoublon, (compte.get(e.cleDoublon) || 0) + 1));
    bilan[r].lignes.forEach((e) => { e.doublonsFusionnes = compte.get(e.cleDoublon) || 1; });
  });

  fs.mkdirSync(sortie, { recursive: true });
  const ecrits = [];
  ORDRE.forEach((r) => {
    if (!bilan[r] || !bilan[r].lignes.length) return;
    const nom = 'idealo-' + r.toLowerCase().replace(/_/g, '-') + '.csv';
    const f = path.join(sortie, nom);
    ecrireCsv(f, bilan[r].lignes.slice().sort((a, b) => (a.prix || 0) - (b.prix || 0)));
    ecrits.push({ fichier: f, lignes: bilan[r].lignes.length });
  });

  const toutes = ORDRE.filter((r) => bilan[r]).reduce((acc, r) => acc.concat(bilan[r].lignes), []);
  const fTout = path.join(sortie, 'idealo-tout.csv');
  ecrireCsv(fTout, toutes);
  ecrits.push({ fichier: fTout, lignes: toutes.length });

  const fJson = path.join(sortie, 'idealo-classe.json');
  fs.writeFileSync(fJson, JSON.stringify({
    balayage: { fichiers: rec.fichiers, pages: rec.pages, tuiles: rec.tuiles,
      lignesLues: rec.lignes.length, pagesPlafonnees: rec.pagesPlafonnees },
    familles: ORDRE.filter((r) => bilan[r]).map((r) => ({
      cle: r, libelle: LIBELLE[r], avant: bilan[r].avant, apres: bilan[r].apres
    })),
    produits: toutes
  }, null, 2));
  ecrits.push({ fichier: fJson, lignes: toutes.length });

  /* ══ LE RELEVÉ ═══════════════════════════════════════════════════════════ */
  const l = (s) => console.log(s);
  l('');
  l('═══ CLASSEMENT DU BALAYAGE IDEALO ═══');
  l('');
  l('  réponses lues .............. ' + rec.fichiers + (rec.illisibles ? '  (' + rec.illisibles + ' illisibles, NON comptées)' : ''));
  l('  pages différentes .......... ' + rec.pages + ' / ' + pagesAttendues
    + (rec.pagesManquantes ? '   ⚠️ ' + rec.pagesManquantes + ' MANQUANTE(S)' : '')
    + (rec.pagesEnDouble ? '   (' + rec.pagesEnDouble + ' page(s) envoyée(s) deux fois, comptée(s) une seule)' : ''));
  l('  tuiles vues sur les pages .. ' + rec.tuiles);
  l('  produits lus par le parseur  ' + rec.produitsLus);
  l('  lignes de produit reçues ... ' + rec.lignes.length
    + '  (' + (rec.tuiles ? (rec.lignes.length * 100 / rec.tuiles).toFixed(1) : '—') + ' % des tuiles)');
  if (rec.pagesPlafonnees) {
    l('  ⚠️ ' + rec.pagesPlafonnees + ' page(s) au PLAFOND de 40 annonces sans référence :');
    l('     leur suite n\'a pas été renvoyée. Le total ci-dessus est donc un PLANCHER.');
  }
  l('');
  ORDRE.forEach((r) => {
    if (!bilan[r]) return;
    const b = bilan[r];
    l('  ── ' + LIBELLE[r] + ' ' + '─'.repeat(Math.max(2, 44 - LIBELLE[r].length)));
    l('     AVANT dédoublonnage : ' + b.avant.total + '   dont outils seuls : '
      + b.avant.seuls + '   packs : ' + b.avant.packs);
    l('     APRÈS dédoublonnage : ' + b.apres.total + '   dont outils seuls : '
      + b.apres.seuls + '   packs : ' + b.apres.packs);
    l('     doublons supprimés .. ' + (b.avant.total - b.apres.total));
    l('');
  });
  const tA = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].avant.total, 0);
  const tP = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].apres.total, 0);
  const sA = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].avant.seuls, 0);
  const kA = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].avant.packs, 0);
  const sP = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].apres.seuls, 0);
  const kP = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].apres.packs, 0);
  l('  ── TOUTES FAMILLES ' + '─'.repeat(28));
  l('     AVANT : ' + tA + '   outils seuls : ' + sA + '   packs : ' + kA);
  l('     APRÈS : ' + tP + '   outils seuls : ' + sP + '   packs : ' + kP);
  l('');
  l('  ⚠️ ' + ambigues + ' ligne(s) portent une référence AMBIGUË (elle s\'arrête sur un');
  l('     chiffre alors qu\'une version suffixée existe : « DCM200 » à côté de');
  l('     « DCM200N »). Elles ne sont PAS fusionnées — un prix de kit écrit sur');
  l('     une fiche d\'outil nu coûterait de l\'argent. Colonne « Réf. ambiguë ».');
  l('');
  l('  Fichiers écrits :');
  ecrits.forEach((e) => l('     · ' + path.relative(path.join(__dirname, '..'), e.fichier)
    + '   (' + e.lignes + ' lignes)'));
  l('');
  l('  ⛔ archives/ est dans .vercelignore : ces fichiers ne sont jamais servis.');
  l('');
  return 0;
}

module.exports = {
  classer: classer, cleDoublon: cleDoublon, dedoublonner: dedoublonner,
  normaliserTitre: normaliserTitre, compter: compter, aplatir: aplatir,
  ligneCsv: ligneCsv, COLONNES: COLONNES, FAMILLE_VERS_RAYON: FAMILLE_VERS_RAYON,
  sansAccents: sansAccents, marquerAmbigues: marquerAmbigues,
  refDansLeTitre: refDansLeTitre
};

if (require.main === module) process.exit(principal(process.argv.slice(2)));
