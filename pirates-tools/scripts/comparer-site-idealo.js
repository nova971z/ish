#!/usr/bin/env node
'use strict';
/* ══ COMPARER MON SITE ET IDEALO, LIGNE À LIGNE ══════════════════════════════
   `node scripts/comparer-site-idealo.js [--marque DeWALT] [--sortie <dossier>]`

   ⛔ DEMANDE DE L'USER, 04/08/2026 : « le laser rotatif DCE079D1G est à
   1312,09 € et nous on le vend plus de 2100 € … je veux savoir pourquoi, il
   n'est pas dans le tableau que tu m'as fourni hier … dans ce tableau tu
   rajoutes les outils que je possède sur mon site sur les mêmes lignes pour
   que je puisse comparer, et tu me mets dans un autre tableau ce que tu n'as
   pas pu trouver — et je parle UNIQUEMENT de la marque DeWALT, on ne touche
   pas à ma Makita ! »

   ⛔⛔ UNE SEULE MARQUE À LA FOIS, ET ELLE EST EXPLICITE. Aucune fiche d'une
   autre marque n'entre dans la comparaison ni n'est modifiée : cet outil ne
   fait que LIRE et écrire des CSV. Rien n'est réécrit dans le catalogue.

   ⚠️ CE QUE LA COMPARAISON PEUT DIRE, ET CE QU'ELLE NE PEUT PAS. Le prix
   idealo est un prix de VENTE public constaté chez des marchands ; le prix du
   site est le prix de vente calculé par le modèle depuis un coût d'achat. Un
   écart n'est donc PAS automatiquement une erreur — il peut venir d'un coût
   d'achat plus élevé, d'un marchand qui brade, ou d'une variante différente.
   La colonne « À REGARDER » dit pourquoi une ligne mérite un œil, elle ne
   condamne rien.

   ⚠️ Portes lues : J3 — des annonces publiques, aucune donnée personnelle ;
   J4 — aucun prix n'est écrit ni recalculé ; J5 — aucune TVA. */

const fs = require('fs');
const path = require('path');
const priceParse = require('../api/_lib/price-parse.js');
const classer = require('./classer-idealo.js');

const RACINE = path.join(__dirname, '..');

function csvChamp(v) {
  const s = (v == null) ? '' : String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function prixFr(v) {
  return (typeof v === 'number' && isFinite(v) && v > 0) ? v.toFixed(2).replace('.', ',') : '';
}
function ecrireCsv(fichier, entete, lignes) {
  const corps = [entete.join(';')].concat(lignes.map((l) => l.map(csvChamp).join(';'))).join('\r\n');
  fs.writeFileSync(fichier, '﻿' + corps + '\r\n', 'utf8');
}

/* ⛔ L'APPARIEMENT SE FAIT SUR LA RACINE **ET** LA VARIANTE — jamais sur la
   racine seule. C'est la leçon du DCE079 : `racineModele` rend `DCE079` pour
   le laser ROUGE comme pour le VERT, et les apparier sur cette seule base
   collerait le prix de l'un sur la fiche de l'autre (430 € d'écart au
   catalogue). La variante lit la description — faisceau, batteries, coffret. */
function cleProduit(sku, titre, car) {
  const racine = priceParse.racineModele(String(sku || '').toUpperCase());
  return racine + '|' + classer.varianteProduit(titre, car || {});
}

function principal(argv) {
  const iM = argv.indexOf('--marque');
  const marque = iM !== -1 ? argv[iM + 1] : 'DeWALT';
  const iS = argv.indexOf('--sortie');
  const sortie = iS !== -1 ? argv[iS + 1] : path.join(RACINE, 'archives', 'idealo');

  const jsonClasse = path.join(RACINE, 'archives', 'idealo', 'idealo-classe.json');
  if (!fs.existsSync(jsonClasse)) {
    console.error('⛔ ' + jsonClasse + ' absent : lancer d\'abord scripts/classer-idealo.js');
    return 2;
  }
  const idealo = JSON.parse(fs.readFileSync(jsonClasse, 'utf8')).produits || [];

  const brut = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
  const catalogue = Array.isArray(brut) ? brut : (brut.products || []);
  /* ⛔ FILTRE DE MARQUE, EXPLICITE ET EN AMONT. « on ne touche pas à ma
     Makita » : aucune fiche d'une autre marque ne doit apparaître, même dans
     la colonne de comparaison. */
  const mesFiches = catalogue.filter(
    (p) => String(p.brand || '').toUpperCase() === marque.toUpperCase());

  /* Index du catalogue par racine+variante, puis par racine seule en repli. */
  const parCle = new Map(), parRacine = new Map();
  mesFiches.forEach((p) => {
    const cle = cleProduit(p.sku, p.title || p.name, null);
    if (!parCle.has(cle)) parCle.set(cle, p);
    const r = priceParse.racineModele(String(p.sku || '').toUpperCase());
    if (!parRacine.has(r)) parRacine.set(r, p);
  });

  const apparies = [], sansEquivalent = [], vus = new Set();

  idealo.forEach((e) => {
    const ref = e.sku || (e.car && (e.car.sku || e.car.skuEclate)) || '';
    if (!ref) return;
    const racine = priceParse.racineModele(String(ref).toUpperCase());
    const cle = racine + '|' + (e.variante || '');
    let fiche = parCle.get(cle) || null;
    let niveau = fiche ? 'référence + variante' : '';
    if (!fiche && parRacine.has(racine)) { fiche = parRacine.get(racine); niveau = 'référence seule (variante différente)'; }
    if (!fiche) {
      sansEquivalent.push([ref, e.titre || '', prixFr(e.prix),
        (e.variante || ''), (e.rayonCommercial || ''),
        'aucune fiche DeWALT de ce modèle sur le site']);
      return;
    }
    vus.add(fiche.sku);
    const pIdealo = (typeof e.prix === 'number') ? e.prix : null;
    const pSite = (typeof fiche.price === 'number') ? fiche.price : null;
    let ecart = '', pct = '', regarder = '';
    if (pIdealo > 0 && pSite > 0) {
      ecart = pSite - pIdealo;
      pct = (ecart / pIdealo) * 100;
      /* ⛔ Un seuil qui ne sert qu'à trier l'œil : au-delà de 40 % d'écart,
         la ligne mérite un regard. Ce n'est pas un verdict. */
      if (pct >= 40) regarder = 'mon prix est TRÈS au-dessus du prix idealo';
      else if (pct <= -10) regarder = 'mon prix est SOUS le prix idealo';
      if (niveau !== 'référence + variante') {
        regarder = (regarder ? regarder + ' — ' : '')
          + 'ATTENTION : rapproché sur la référence seule, la version peut différer';
      }
    } else {
      regarder = 'un des deux prix manque';
    }
    apparies.push([
      ref, e.titre || '', prixFr(pIdealo), (e.variante || ''),
      fiche.sku, fiche.title || '', prixFr(pSite), fiche.category || '',
      (typeof ecart === 'number' ? prixFr(Math.abs(ecart)) : ''),
      (typeof pct === 'number' ? (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(0) + ' %' : ''),
      niveau, regarder
    ]);
  });

  /* Les fiches DeWALT du site qu'aucune annonce idealo n'a touchées : elles
     n'ont plus de prix de référence pour se comparer. */
  const jamaisVues = mesFiches.filter((p) => !vus.has(p.sku))
    .map((p) => [p.sku, p.title || '', prixFr(p.price), p.category || '',
      'aucune annonce idealo trouvée pour ce modèle sur les 67 pages']);

  fs.mkdirSync(sortie, { recursive: true });
  const fA = path.join(sortie, 'comparaison-site-idealo.csv');
  ecrireCsv(fA, ['Référence idealo', 'Titre chez idealo', 'Prix idealo (€)',
    'Version (outil, pack, accessoire)', 'Référence sur mon site',
    'Titre sur mon site', 'Mon prix de vente (€)', 'Ma famille',
    'Écart en euros', 'Écart en %', 'Sur quoi le rapprochement s\'appuie',
    'À REGARDER'],
    apparies.sort((a, b) => {
      const pa = parseFloat(String(a[9]).replace(/[^0-9.]/g, '')) || 0;
      const pb = parseFloat(String(b[9]).replace(/[^0-9.]/g, '')) || 0;
      return pb - pa;
    }));

  const fB = path.join(sortie, 'non-apparies.csv');
  ecrireCsv(fB, ['Référence idealo', 'Titre chez idealo', 'Prix idealo (€)',
    'Version', 'Famille', 'Pourquoi je n\'ai pas trouvé'], sansEquivalent);

  const fC = path.join(sortie, 'site-sans-annonce-idealo.csv');
  ecrireCsv(fC, ['Référence sur mon site', 'Titre sur mon site',
    'Mon prix de vente (€)', 'Ma famille', 'Pourquoi'], jamaisVues);

  const l = (s) => console.log(s);
  l('');
  l('═══ COMPARAISON ' + marque.toUpperCase() + ' — MON SITE ↔ IDEALO ═══');
  l('');
  l('  fiches ' + marque + ' au catalogue ...... ' + mesFiches.length);
  l('  produits idealo classés ........... ' + idealo.length);
  l('');
  l('  APPARIÉS (les deux prix côte à côte) . ' + apparies.length);
  l('     · sur référence + version ........ ' + apparies.filter((r) => r[10] === 'référence + variante').length);
  l('     · sur référence seule (à vérifier) ' + apparies.filter((r) => r[10] !== 'référence + variante').length);
  l('  idealo SANS équivalent sur le site ... ' + sansEquivalent.length);
  l('  mes fiches SANS annonce idealo ....... ' + jamaisVues.length);
  l('');
  const tresHaut = apparies.filter((r) => /TRÈS au-dessus/.test(r[11])).length;
  const sous = apparies.filter((r) => /SOUS le prix/.test(r[11])).length;
  l('  ⚠️ mon prix ≥ 40 % au-dessus d\'idealo : ' + tresHaut);
  l('  ⚠️ mon prix SOUS le prix idealo ......  ' + sous);
  l('');
  [fA, fB, fC].forEach((f) => l('  écrit : ' + path.relative(RACINE, f)));
  l('');
  return 0;
}

module.exports = { cleProduit: cleProduit };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
