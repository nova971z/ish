#!/usr/bin/env node
/* banc-milwaukee.js — L'INVENTAIRE AVANT D'ÉCRIRE UNE SEULE RÈGLE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CE BANC EXISTE AVANT LA NOMENCLATURE, ET PAS APRÈS.
   Milwaukee ne publie **aucune légende officielle de ses suffixes** — vérifié
   sur le Web le 13/08/2026 : ce qui fait foi, c'est la liste « In the Box » de
   chaque fiche, pas une règle. Encoder une grammaire devinée serait donc
   exactement l'erreur que le projet interdit (M-03, M-04) : une règle inventée
   qui décide d'un contenu, donc d'un coût, donc d'un prix de vente.

   ⇒ On mesure D'ABORD. Ce banc lit le relevé Milwaukee de l'user et rend :
     ① par FORME de référence (article 10 chiffres, article 8, plateforme),
        combien de cartes et quelle part du relevé ;
     ② la liste des SUFFIXES réellement rencontrés, triés par fréquence ET par
        argent en jeu — c'est la liste de travail à recouper, dans l'ordre ;
     ③ ce que le parseur ne lit toujours pas, et combien ça représente.

   ⚠️ CE BANC NE DÉCIDE RIEN et n'écrit dans aucun service. Il ne propose
   aucune interprétation de suffixe : il dit ce qui existe et ce que ça pèse.

   ⛔ LE RELEVÉ MILWAUKEE N'A PAS LA MÊME FORME QUE LES AUTRES, et ça m'a déjà
   coûté une affirmation fausse : il tourne en MODE À SEC (décision D-018 —
   aucune lecture ni écriture de la base), et range donc ses cartes sous
   `inconnus` et `sansRefDetail`, jamais sous `unknown` / `sansRef`. J'avais
   conclu « les trois relevés sont DEWALT + MAKITA » alors que le troisième est
   Milwaukee : mon lecteur cherchait des champs qui n'existent pas dans ce
   mode, et une lecture qui ne trouve rien rend une liste vide, pas une erreur.

   ⚠️ MESURE DE RÉFÉRENCE (13/08/2026, relevé de 67 pages, avant que le bac de
   travail ne soit perdu dans une réinitialisation de session) : 3 965 cartes,
   3 929 produits distincts ; 2 738 lus (70 %) — 1 661 articles à 10 chiffres,
   747 plateformes, 330 articles à 8 chiffres ; 1 191 illisibles (414 189 €).
   Ces chiffres se REJOUENT dès qu'un relevé est fourni : rien ici n'en dépend.

   Usage : node scripts/banc-milwaukee.js <dossier-de-releve> [...]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');
var pp = require(path.join(RACINE, 'api/_lib/price-parse.js'));
var nomen = pp.nomenclature;

/* ── LIRE LES CARTES, DANS LES DEUX FORMES DE RELEVÉ ───────────────────────
   ⚠️ `sec` (mode à sec) ⇒ `inconnus` + `sansRefDetail` ; relevé normal ⇒
   `unknown` + `sansRef`. On lit les quatre : un banc qui ne connaît qu'une
   forme se tait sur l'autre au lieu de le dire. */
var SEAUX = ['inconnus', 'sansRefDetail', 'unknown', 'sansRef', 'packsIgnores'];

function cartesDe(racine) {
  var out = [];
  if (!fs.existsSync(racine)) return out;
  (function walk(p) {
    var entrees;
    try { entrees = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return; }
    entrees.forEach(function (e) {
      var f = path.join(p, e.name);
      if (e.isDirectory()) return walk(f);
      if (!/^admin-\d+\.json$/.test(e.name)) return;
      var j;
      try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return; }
      var marque = String(j.brand || '');
      SEAUX.forEach(function (seau) {
        (Array.isArray(j[seau]) ? j[seau] : []).forEach(function (o) {
          if (!o || typeof o !== 'object') return;
          var titre = String(o.titre || o.name || '').trim();
          var prix = Number(o.srcTTC != null ? o.srcTTC : o.prix);
          if (!titre || !(prix > 0)) return;
          out.push({ marque: marque, titre: titre, prix: prix,
            sku: o.sku || null, car: o.car || null, seau: seau });
        });
      });
    });
  })(racine);
  return out;
}

/* ── CE QUE LA NOMENCLATURE SAIT LIRE, CARTE PAR CARTE ─────────────────── */
function inventaire(cartes) {
  var parForme = {}, suffixes = {}, illisibles = [];
  var vus = Object.create(null);

  cartes.forEach(function (c) {
    var k = c.titre + '|' + c.prix;
    if (vus[k]) return;          /* le même produit revient d'une page à l'autre */
    vus[k] = 1;

    var lu = null;
    try { lu = nomen.lireReferenceMilwaukee(c.titre); } catch (e) { lu = null; }
    if (!lu) {
      illisibles.push(c);
      return;
    }
    var f = parForme[lu.forme] = parForme[lu.forme] || { n: 0, euros: 0, exemples: [] };
    f.n++; f.euros += c.prix;
    if (f.exemples.length < 3) f.exemples.push(c.titre.slice(0, 78));

    /* ⛔ SEULE LA FORME « PLATEFORME » PORTE UN CONDITIONNEMENT. Un numéro
       d'article (10 ou 8 chiffres) ne dit RIEN de ce qu'il y a dans la boîte :
       c'est un identifiant, pas une description. On ne lui invente pas de
       contenu — c'est la fiche du fabricant qui le donnera. */
    if (!lu.porteConditionnement) return;
    var s = lu.suffixe || '(aucun)';
    var e = suffixes[s] = suffixes[s] || { n: 0, euros: 0, min: Infinity, max: 0, exemples: [] };
    e.n++; e.euros += c.prix;
    if (c.prix < e.min) e.min = c.prix;
    if (c.prix > e.max) e.max = c.prix;
    if (e.exemples.length < 2) e.exemples.push(c.titre.slice(0, 74));
  });
  return { parForme: parForme, suffixes: suffixes, illisibles: illisibles,
    uniques: Object.keys(vus).length };
}

module.exports = { cartesDe: cartesDe, inventaire: inventaire, SEAUX: SEAUX };

if (require.main === module) {
  var racines = process.argv.slice(2);
  if (!racines.length) {
    console.error('usage: node scripts/banc-milwaukee.js <dossier-de-releve> [...]');
    process.exit(2);
  }
  var cartes = [];
  racines.forEach(function (r) { cartes = cartes.concat(cartesDe(r)); });
  /* ⛔ PRÉALABLE : sans carte, le banc n'a rien mesuré. */
  if (!cartes.length) {
    console.error('⛔ PRÉALABLE : aucune carte lue dans ' + racines.join(', ')
      + ' — le banc n\'a rien mesuré. Non exécuté n\'est pas vert.');
    process.exit(2);
  }
  var I = inventaire(cartes);
  console.log(cartes.length + ' cartes lues, ' + I.uniques + ' produits distincts');
  console.log('');
  console.log('── ① CE QUE LA NOMENCLATURE SAIT LIRE, PAR FORME ──');
  var totalLu = 0;
  Object.keys(I.parForme).sort(function (a, b) { return I.parForme[b].n - I.parForme[a].n; })
    .forEach(function (f) {
      var x = I.parForme[f];
      totalLu += x.n;
      console.log('  ' + f.padEnd(12) + String(x.n).padStart(5) + ' produits   '
        + String(Math.round(x.euros)).padStart(8) + ' EUR au total');
      x.exemples.forEach(function (t) { console.log('        · ' + t); });
    });
  console.log('  ' + 'ILLISIBLE'.padEnd(12) + String(I.illisibles.length).padStart(5)
    + ' produits   ' + String(Math.round(I.illisibles.reduce(function (s, c) {
      return s + c.prix; }, 0))).padStart(8) + ' EUR au total');
  console.log('  → lues : ' + totalLu + ' / ' + I.uniques
    + ' (' + Math.round((totalLu / I.uniques) * 100) + ' %)');
  console.log('');
  console.log('── ② LES SUFFIXES RENCONTRÉS — LA LISTE DE TRAVAIL, PAR ARGENT EN JEU ──');
  console.log('     (aucune interprétation ici : on dit ce qui existe et ce que ça pèse)');
  var sufs = Object.keys(I.suffixes).sort(function (a, b) {
    return I.suffixes[b].euros - I.suffixes[a].euros; });
  sufs.slice(0, 30).forEach(function (s) {
    var e = I.suffixes[s];
    console.log('  ' + s.padEnd(10) + String(e.n).padStart(4) + ' produits  '
      + String(Math.round(e.euros)).padStart(8) + ' EUR  (de '
      + e.min.toFixed(2) + ' a ' + e.max.toFixed(2) + ' EUR)');
    e.exemples.forEach(function (t) { console.log('        · ' + t); });
  });
  if (sufs.length > 30) console.log('  … et ' + (sufs.length - 30) + ' autres suffixes');
  console.log('');
  console.log('── ③ CE QUE LE PARSEUR NE LIT PAS ENCORE ──');
  console.log('  ' + I.illisibles.length + ' produits, '
    + Math.round(I.illisibles.reduce(function (s, c) { return s + c.prix; }, 0)) + ' EUR');
  I.illisibles.slice(0, 12).forEach(function (c) {
    console.log('        · ' + String(c.prix).padStart(8) + ' EUR  ' + c.titre.slice(0, 76));
  });
}
