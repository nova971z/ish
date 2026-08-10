/* audit/nomenclature-makita.js — CE QUE LE PARSEUR SAIT DU RÉFÉRENCEMENT MAKITA.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CE FICHIER EXISTE. L'user, 10/08/2026 : « le vrai chantier
   n'est pas de deviner des lettres : c'est que ton compteur mélange trois
   choses. Un consommable ou une machine filaire n'a pas de conditionnement à
   connaître — les compter comme "inconnus" fait paraître le problème deux
   fois plus gros qu'il n'est. » Il avait raison, et le défaut était dans la
   MESURE, pas dans le parseur.

   Ce compteur-ci ne mélange plus rien. Il range chaque référence dans UNE de
   quatre cases, et il dit laquelle coûte de l'argent :
     ① RIEN À CONNAÎTRE     — accessoire, consommable, pièce, machine filaire.
                              La question « nu ou pack ? » n'a pas de sens.
     ② VARIANTE DE MODÈLE   — une lettre finale qui nomme une option de la
                              machine (contrôle électronique, gamme 40 V,
                              classe de filtration), pas un contenu de boîte.
     ③ CONDITIONNEMENT LU   — le code d'ensemble a été décodé.
     ④ INCONNU              — et LÀ seulement l'ignorance coûte quelque chose.

   ⛔ IL NE MODIFIE RIEN, et il ne dépend d'aucun service : il relit une
   archive versionnée. On peut donc le rejouer n'importe quand.

   Usage : node audit/nomenclature-makita.js [fichier.json] [--csv sortie.csv] */
'use strict';

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const nomen = require(path.join(RACINE, 'api/_lib/nomenclature.js'));

const args = process.argv.slice(2);
const iCsv = args.indexOf('--csv');
const SORTIE_CSV = iCsv !== -1 ? args[iCsv + 1] : null;
const FICHIER = args.filter((a, i) => a !== '--csv' && i !== iCsv + 1)[0]
  || path.join(RACINE, 'archives/products-makita-supprime-2026-08-10.json');

let fiches;
try {
  fiches = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
} catch (e) {
  console.error('illisible : ' + FICHIER + ' — ' + e.message);
  process.exit(2);
}
if (!Array.isArray(fiches) || !fiches.length) {
  console.error('aucune fiche dans ' + FICHIER);
  process.exit(2);
}

/* ⛔ L'ORACLE, C'EST SON TITRE — pas le code qu'on teste. Une concordance
   calculée à partir du décodage lui-même ne prouverait rien du tout. */
function contenuDitParLeTitre(texte) {
  const s = String(texte || '');
  const m = s.match(/\(?\s*(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*Ah/);
  if (m) return { nb: parseInt(m[1], 10), ah: parseFloat(m[2].replace(',', '.')) };
  if (/machine seule|produit seul|\bsolo\b|sans batterie/i.test(s)) return { nb: 0, ah: null };
  return null;
}

const cases = { rien: [], variante: [], lu: [], inconnu: [] };
let testables = 0, concordances = 0;
const desaccords = [];
let sousEstimations = 0;

fiches.forEach((p) => {
  const sku = String((p && p.sku) || '');
  const forme = nomen.formeReferenceMakita(sku);
  const lu = nomen.lireSuffixeMakita(sku);
  const cfg = lu && lu.config;

  if (!forme.porteConditionnement || (forme.forme === 'modele' && !forme.sansFil && !cfg)) {
    cases.rien.push({ p: p, pourquoi: forme.forme === 'modele' ? 'machine filaire' : forme.note });
  } else if (lu && (!lu.suffixe || cfg)) {
    cases.lu.push({ p: p, cfg: cfg });
  } else if (lu && lu.varianteModele) {
    cases.variante.push({ p: p, suffixe: lu.suffixe });
  } else {
    cases.inconnu.push({ p: p, suffixe: lu ? lu.suffixe : '' });
  }

  if (!cfg || typeof cfg.nbBatteries !== 'number') return;
  const dit = contenuDitParLeTitre((p.title || '') + ' ' + (p.desc || ''));
  if (!dit) return;
  testables += 1;
  const accord = dit.nb === cfg.nbBatteries
    && (dit.ah == null || !cfg.ah || Math.abs(dit.ah - cfg.ah) < 0.05);
  if (accord) concordances += 1;
  else {
    if (cfg.nbBatteries < dit.nb) sousEstimations += 1;
    desaccords.push({
      sku: sku, suffixe: lu.suffixe,
      lu: cfg.nbBatteries + '×' + (cfg.ah || '?'),
      titre: dit.nb + '×' + (dit.ah || '?'),
      sens: cfg.nbBatteries < dit.nb ? 'SOUS-ESTIMÉ (dangereux)' : 'surestimé (sans risque de perte)'
    });
  }
});

const n = fiches.length;
const pct = (x) => (x / n * 100).toFixed(1) + ' %';
const tranche = cases.rien.length + cases.variante.length + cases.lu.length;

console.log('══ RÉFÉRENCEMENT MAKITA — ' + n + ' fiches lues dans ' + path.basename(FICHIER));
console.log('');
console.log('① rien à connaître (forme)   : ' + String(cases.rien.length).padStart(4) + '  ' + pct(cases.rien.length));
console.log('② variante de modèle          : ' + String(cases.variante.length).padStart(4) + '  ' + pct(cases.variante.length));
console.log('③ conditionnement LU          : ' + String(cases.lu.length).padStart(4) + '  ' + pct(cases.lu.length));
console.log('④ INCONNU — le seul qui coûte : ' + String(cases.inconnu.length).padStart(4) + '  ' + pct(cases.inconnu.length));
console.log('   ───────────────────────────────────────────');
console.log('   TRANCHÉ                    : ' + String(tranche).padStart(4) + '  ' + pct(tranche));
console.log('');
console.log('JUSTESSE — le titre de la fiche comme oracle, jamais le code testé');
console.log('   titres testables            : ' + testables);
console.log('   concordances                : ' + concordances
  + (testables ? '  (' + (concordances / testables * 100).toFixed(1) + ' %)' : ''));
console.log('   sous-estimations            : ' + sousEstimations
  + '   ⛔ une seule suffit à faire vendre à perte');
desaccords.forEach((d) => {
  console.log('     · ' + d.sku + ' [' + d.suffixe + '] lu ' + d.lu + ', titre ' + d.titre + ' — ' + d.sens);
});
if (cases.inconnu.length) {
  console.log('');
  console.log('LES INCONNUES, une par une :');
  cases.inconnu.forEach((x) => {
    console.log('   · ' + x.p.sku + ' [' + x.suffixe + '] — '
      + String(x.p.title || '').replace(/^Makita \S+ — /, '').slice(0, 70));
  });
}

if (SORTIE_CSV) {
  const cel = (v) => {
    const s = String(v == null ? '' : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const etat = new Map();
  cases.rien.forEach((x) => etat.set(x.p.sku, ['rien a connaitre', x.pourquoi, '']));
  cases.variante.forEach((x) => etat.set(x.p.sku, ['variante de modele', 'suffixe ' + x.suffixe, '']));
  cases.lu.forEach((x) => etat.set(x.p.sku, ['conditionnement lu', '',
    (x.cfg && typeof x.cfg.nbBatteries === 'number' ? x.cfg.nbBatteries + ' batterie(s)' : '')
    + (x.cfg && x.cfg.ah ? ' de ' + String(x.cfg.ah).replace('.', ',') + ' Ah' : '')
    + (x.cfg && x.cfg.coffret ? ' + coffret' : '')
    + (x.cfg && x.cfg.accessoires ? ' + accessoires' : '')]));
  cases.inconnu.forEach((x) => etat.set(x.p.sku, ['INCONNU', 'suffixe ' + x.suffixe, '']));
  const L = ['reference;titre;etat;pourquoi;contenu_lu'];
  fiches.slice().sort((a, b) => String(a.sku).localeCompare(String(b.sku))).forEach((p) => {
    const e = etat.get(p.sku) || ['?', '', ''];
    L.push([cel(p.sku), cel(p.title || p.name || ''), cel(e[0]), cel(e[1]), cel(e[2])].join(';'));
  });
  fs.writeFileSync(SORTIE_CSV, '﻿' + L.join('\r\n') + '\r\n', 'utf8');
  console.log('\ntableau écrit : ' + SORTIE_CSV + ' (' + (L.length - 1) + ' lignes)');
}
