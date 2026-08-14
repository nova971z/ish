#!/usr/bin/env node
/* geler-corpus-parseur.js — FIGER UN ÉCHANTILLON DES RELEVÉS RÉELS.
   ─────────────────────────────────────────────────────────────────────────
   ⛔ POURQUOI. La porte `check-parseur-releves` doit rejouer de VRAIES cartes
   du fournisseur — c'est le seul texte qui ressemble à ce que le parseur
   rencontrera. Mais les archives de relevé vivent dans le dossier temporaire
   de l'user : elles disparaissent. Un corpus figé, versionné, survit.

   ⛔ LE CHOIX DES CARTES NE SE FAIT PAS À LA MAIN. Un échantillon choisi par
   moi contient les cas auxquels je pense — donc ceux qui marchent déjà. La
   sélection est donc MÉCANIQUE et reproductible :
     · toutes les cartes dont le texte annonce un CONTENU AJOUTÉ (c'est là que
       l'argent se joue : un prix de pack ne doit jamais s'écrire sur une
       référence nue) ;
     · plus un pas régulier sur tout le reste, pour que les formes ordinaires
       soient représentées.

   ⚠️ Le corpus est une DONNÉE (`data/corpus-parseur.json`), jamais du code de
   harnais : la règle « un harnais ne nomme jamais une donnée du catalogue »
   reste tenue — la porte n'écrit aucun titre, aucune référence, aucun prix.

   Usage : node scripts/geler-corpus-parseur.js <dossier-de-releves> [...]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

var PAS = 7;             /* un sur sept parmi les cartes ordinaires */
var PLAFOND = 1200;      /* au-delà, la porte devient trop lente pour être jouée */

/* Le texte annonce-t-il un ajout ? On reste large VOLONTAIREMENT : le but est
   de RETENIR ces cartes dans l'échantillon, pas de trancher leur sort. */
function annonceUnAjout(t) {
  return /\+/.test(t)
    || /\bavec\b|\bmit\b|\bwith\b|\binkl/i.test(t)
    || /\d\s*[xX×]\s*\d/.test(t)
    || /\bAh\b/i.test(t)
    || /\bchargeurs?\b|\bchargers?\b/i.test(t)
    || /\b(?:lots?|packs?|sets?|kits?|coffrets?|mallettes?)\b/i.test(t);
}

function lire(dossiers) {
  var cartes = [];
  dossiers.forEach(function (d) {
    var fics;
    try { fics = fs.readdirSync(d).filter(function (f) { return /^admin-\d+\.json$/.test(f); }); }
    catch (e) { return; }
    fics.sort(function (a, b) {
      return parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10);
    });
    fics.forEach(function (f) {
      var j;
      try { j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { return; }
      var marque = String(j.brand || '');
      if (!marque) return;
      /* ⛔⛔ DEUX FORMES DE RELEVÉ, ET J'AI AFFIRMÉ FAUX POUR NE PAS L'AVOIR VU.
         Un balayage en MODE À SEC (décision D-018 : aucune lecture ni écriture
         de la base pour cette marque-là) ne range PAS ses cartes au même
         endroit : `inconnus` et `sansRefDetail` au lieu de `unknown` et
         `sansRef`. Mon geleur ne lisait que la seconde forme — le corpus est
         donc sorti sans une seule carte d'une des trois marques, et j'en ai
         conclu à voix haute « les trois relevés sont ceux des deux autres
         marques ». C'était faux : le troisième relevé existait, avec 3 965
         cartes exploitables. **Une lecture qui ne trouve rien rend une liste
         vide, pas une erreur** — et un zéro se lit comme un fait. */
      ['unknown', 'sansRef', 'packsIgnores', 'applied',
        'inconnus', 'sansRefDetail'].forEach(function (seau) {
        (Array.isArray(j[seau]) ? j[seau] : []).forEach(function (x) {
          var titre = String(x.titre || x.titreCarte || x.name || '').trim();
          var descr = String(x.descr || '').replace(/\s+/g, ' ').trim();
          var prix = Number(x.srcTTC != null ? x.srcTTC : x.prix);
          if (!titre || !(prix > 0)) return;
          cartes.push({ marque: marque, titre: titre, descr: descr, prix: prix });
        });
      });
    });
  });
  return cartes;
}

function selectionner(cartes) {
  /* ⚠️ Déduplication d'abord : le même produit revient dans les trois relevés,
     et un corpus gonflé de doublons ralentit sans rien ajouter. */
  var vu = Object.create(null), uniques = [];
  cartes.forEach(function (c) {
    var k = c.marque + '|' + c.titre + '|' + c.descr;
    if (vu[k]) return;
    vu[k] = 1; uniques.push(c);
  });
  /* Tri STABLE et déterministe : deux gels du même dossier rendent le même
     corpus. Sans ça, la porte changerait de sujet à chaque regel et ses
     plafonds de couverture ne voudraient plus rien dire. */
  uniques.sort(function (a, b) {
    return a.marque < b.marque ? -1 : a.marque > b.marque ? 1
      : a.titre < b.titre ? -1 : a.titre > b.titre ? 1 : 0;
  });
  var avecAjout = [], ordinaires = [];
  uniques.forEach(function (c) {
    if (annonceUnAjout(c.titre + ' ' + c.descr)) avecAjout.push(c); else ordinaires.push(c);
  });
  var choisies = [];
  var pasAjout = Math.max(1, Math.ceil(avecAjout.length / (PLAFOND * 0.6)));
  avecAjout.forEach(function (c, i) { if (i % pasAjout === 0) choisies.push(c); });
  ordinaires.forEach(function (c, i) { if (i % PAS === 0) choisies.push(c); });
  return { choisies: choisies.slice(0, PLAFOND), uniques: uniques.length,
    avecAjout: avecAjout.length, ordinaires: ordinaires.length };
}

if (require.main === module) {
  var dossiers = process.argv.slice(2);
  if (!dossiers.length) {
    console.error('usage: node scripts/geler-corpus-parseur.js <dossier-de-releves> [...]');
    process.exit(2);
  }
  var cartes = lire(dossiers);
  if (!cartes.length) {
    console.error('⛔ PRÉALABLE : aucune carte lue — rien à geler.');
    process.exit(2);
  }
  var S = selectionner(cartes);
  var sortie = path.join(RACINE, 'data/corpus-parseur.json');
  fs.writeFileSync(sortie, JSON.stringify({
    gele: '13/08/2026',
    origine: 'relevés du traqueur fournis par l\'user (3 balayages)',
    selection: 'mécanique : toutes les cartes annonçant un ajout (échantillonnées si trop '
      + 'nombreuses), plus une carte ordinaire sur ' + PAS,
    lues: cartes.length, uniques: S.uniques,
    avecAjout: S.avecAjout, ordinaires: S.ordinaires,
    cartes: S.choisies
  }, null, 1));
  console.log(cartes.length + ' cartes lues, ' + S.uniques + ' uniques ('
    + S.avecAjout + ' annoncent un ajout, ' + S.ordinaires + ' ordinaires)');
  console.log('corpus gelé : data/corpus-parseur.json — ' + S.choisies.length + ' cartes');
}

module.exports = { annonceUnAjout: annonceUnAjout, lire: lire, selectionner: selectionner };
