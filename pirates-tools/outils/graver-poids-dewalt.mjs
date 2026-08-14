#!/usr/bin/env node
/* graver-poids-dewalt.mjs — VERSE LES PESÉES RECHERCHÉES DANS LA TABLE, SOUS PORTE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔ ENTRÉE : le JSON rendu par la campagne de recherche Web (une entrée par
   racine : statut, kg, sources[{url, kg}], note). SORTIE : data/poids-dewalt.json
   — mais RIEN n'y entre sans passer les mêmes invariants que la porte
   `check-poids-dewalt` (trois sources, trois sites, kg dans l'intervalle,
   cohérence ≤ 60 %). Une entrée qui échoue va dans `nonResolues` avec son
   motif : on ne jette rien, on ne grave rien de douteux.

   ⛔ CE SCRIPT NE CROIT PAS LA CAMPAGNE SUR PAROLE : le statut « resolue »
   annoncé par un agent est REVALIDÉ ici, mécaniquement. Un agent qui se serait
   trompé de règle ne contamine pas la table.

   Usage : node outils/graver-poids-dewalt.mjs <recherches.json> [--ecrire]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const require2 = createRequire(import.meta.url);
const porte = require2(path.join(RACINE, 'scripts/check-poids-dewalt.js'));

const FICHIER = process.argv[2];
const ECRIRE = process.argv.includes('--ecrire');
/* --table composants : vise data/poids-composants-dewalt.json (batteries,
   chargeurs, coffrets) — mêmes règles, même porte, autre fichier. */
const TABLE_CIBLE = process.argv.includes('--table')
  ? String(process.argv[process.argv.indexOf('--table') + 1] || '')
  : 'racines';
if (!FICHIER || !fs.existsSync(FICHIER)) {
  console.error('usage: node outils/graver-poids-dewalt.mjs <recherches.json> [--ecrire]');
  process.exit(2);
}

const brut = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
const entrees = Array.isArray(brut) ? brut : (brut.entrees || []);
if (!entrees.length) {
  console.error('⛔ PRÉALABLE : aucune entrée dans ' + FICHIER + ' — rien à graver.');
  process.exit(2);
}

const cible = path.join(RACINE, TABLE_CIBLE === 'composants'
  ? 'data/poids-composants-dewalt.json' : 'data/poids-dewalt.json');
const table = JSON.parse(fs.readFileSync(cible, 'utf8'));
table.poids = table.poids || {};
table.nonResolues = table.nonResolues || {};

let gravees = 0, refusees = 0, deja = 0;
const motifs = {};

for (const e of entrees) {
  const r = String(e.racine || e.cle || '').toUpperCase().trim();
  if (!r) continue;
  if (table.poids[r]) { deja++; continue; }

  const candidate = { poids: {} };
  candidate.poids[r] = { kg: Number(e.kg), sources: Array.isArray(e.sources) ? e.sources : [] };
  const fautes = (e.statut === 'resolue') ? porte.fautesDeLaTable(candidate) : ['statut ' + e.statut];

  if (!fautes.length) {
    table.poids[r] = { kg: Number(e.kg),
      sources: e.sources.map((s) => ({ url: String(s.url), kg: Number(s.kg) })) };
    if (e.note) table.poids[r].note = String(e.note).slice(0, 200);
    gravees++;
  } else {
    refusees++;
    const motif = fautes.join(' | ').slice(0, 240);
    motifs[motif.split(':')[0].slice(0, 60)] = (motifs[motif.split(':')[0].slice(0, 60)] || 0) + 1;
    table.nonResolues[r] = {
      motif: motif,
      sources: (e.sources || []).map((s) => ({ url: String(s.url || ''), kg: Number(s.kg) })),
      note: String(e.note || '').slice(0, 200)
    };
  }
}

console.log('entrées lues : ' + entrees.length);
console.log('  gravées (3 sources, 3 sites, cohérentes) : ' + gravees);
console.log('  non résolues (gardées avec leur motif)   : ' + refusees);
console.log('  déjà en table (jamais écrasées ici)      : ' + deja);
Object.keys(motifs).sort((a, b) => motifs[b] - motifs[a]).slice(0, 8)
  .forEach((m) => console.log('      ' + String(motifs[m]).padStart(4) + '  ' + m));

if (!ECRIRE) {
  console.log('\n(aperçu seul — rien n\'a été écrit. Ajouter --ecrire pour graver.)');
  process.exit(0);
}
table._mesure_le = new Date().toISOString().slice(0, 10);
fs.writeFileSync(cible, JSON.stringify(table, null, 1) + '\n', 'utf8');
console.log('\ngravé : ' + path.basename(cible) + ' — relire par la porte…');
const errs = porte();
if (errs.length) {
  errs.slice(0, 5).forEach((x) => console.error('  ❌ ' + x));
  console.error('⛔ LA PORTE REFUSE LA TABLE GRAVÉE — corriger avant tout commit.');
  process.exit(1);
}
console.log('✅ la table gravée passe check-poids-dewalt.');
