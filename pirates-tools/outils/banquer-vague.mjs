#!/usr/bin/env node
/* banquer-vague.mjs — UN PAQUET FINI EST UN PAQUET EN SÉCURITÉ.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CE SCRIPT EXISTE. Demande de l'user, 15/08/2026 : « à chaque
   paquet terminé, tu enregistres et tu recommences un paquet afin qu'on ne
   perde pas le travail au cas où la limite est atteinte ». Il a déjà payé
   cette leçon : une réinitialisation de session a fait perdre TOUT le travail
   Milwaukee non poussé. Entre une vague rendue et son gravage, il y avait
   jusqu'ici cinq gestes à la main — cinq occasions de tout perdre.

   Ici c'est UN geste, et il fait la séquence entière :
     ① grave la vague (le graveur REVALIDE : 3 sources, 3 sites, écart ≤ 60 %)
     ② rejoue les portes — si une porte rougit, on N'ÉCRIT RIEN de plus
     ③ commit + pousse sur master ET sur la branche de travail
     ④ imprime le PROCHAIN paquet, prêt à relancer
   Si une étape échoue, les suivantes ne tournent pas : un paquet à moitié
   banqué serait pire que pas de paquet du tout.

   ⚠️ AUCUN SECRET NE SORT D'ICI : ce script ne lit aucune variable
   d'environnement et n'imprime que des références produit et des compteurs.

   Usage : node outils/banquer-vague.mjs <sortie-vague.json> [--taille 50]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const DEPOT = path.join(RACINE, '..');

const SORTIE = process.argv[2];
const TAILLE = process.argv.includes('--taille')
  ? Number(process.argv[process.argv.indexOf('--taille') + 1]) : 50;
if (!SORTIE || !fs.existsSync(SORTIE)) {
  console.error('usage: node outils/banquer-vague.mjs <sortie-vague.json> [--taille 50]');
  process.exit(2);
}

function courir(cmd, args, ou) {
  const r = execFileSync(cmd, args, { cwd: ou || RACINE, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'] });
  return String(r || '');
}
function tenter(cmd, args, ou) {
  try { return { ok: true, sortie: courir(cmd, args, ou) }; }
  catch (e) { return { ok: false, sortie: String((e.stdout || '') + (e.stderr || '')) }; }
}

/* ── ① GRAVER ───────────────────────────────────────────────────────────── */
console.log('① gravage…');
const g = tenter(process.execPath, [path.join(RACINE, 'outils/graver-poids-dewalt.mjs'),
  SORTIE, '--ecrire']);
process.stdout.write(g.sortie.split('\n').filter((l) => l.trim()).map((l) => '   ' + l).join('\n') + '\n');
if (!g.ok) { console.error('⛔ le gravage a échoué — rien n\'est commité.'); process.exit(1); }

/* ── ② LES PORTES — un paquet ne se banque pas sur une table cassée ─────── */
console.log('② portes…');
let portesOk = true;
for (const porte of ['scripts/check-poids-dewalt.js', 'scripts/check-composants.js']) {
  const p = tenter(process.execPath, [path.join(RACINE, porte)]);
  console.log('   ' + (p.ok ? '✅' : '❌') + ' ' + porte
    + ' — ' + p.sortie.trim().split('\n').pop());
  if (!p.ok) portesOk = false;
}
if (!portesOk) {
  console.error('⛔ une porte rougit : la table est gravée sur le disque mais RIEN n\'est');
  console.error('   poussé. Corriger la porte, puis relancer ce script.');
  process.exit(1);
}

/* ── ③ COMMIT + POUSSE ──────────────────────────────────────────────────── */
const racines = JSON.parse(fs.readFileSync(path.join(RACINE, 'data/poids-dewalt.json'), 'utf8'));
const composants = JSON.parse(fs.readFileSync(path.join(RACINE, 'data/poids-composants-dewalt.json'), 'utf8'));
const nRac = Object.keys(racines.poids || {}).length;
const nCom = Object.keys(composants.poids || {}).length;

const sale = courir('git', ['status', '--porcelain', '--', 'pirates-tools/data'], DEPOT).trim();
if (!sale) {
  console.log('③ rien de neuf à commiter (la vague n\'a rien ajouté à la table).');
} else {
  console.log('③ commit + pousse…');
  courir('git', ['add', 'pirates-tools/data'], DEPOT);
  const msg = 'DeWALT : paquet de pesées banqué — ' + nRac + ' racines, ' + nCom + ' composants\n\n'
    + 'Banqué par outils/banquer-vague.mjs : gravage revalidé (trois sources, trois\n'
    + 'sites distincts, écart ≤ 60 %), portes rejouées vertes, puis poussé. Un paquet\n'
    + 'fini est poussé AVANT que le suivant parte — demande de l\'user du 15/08/2026,\n'
    + 'après la perte du travail Milwaukee non poussé.\n\n'
    + 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n';
  courir('git', ['commit', '-q', '-m', msg], DEPOT);
  for (const ref of ['master', 'claude/pirates-tools-rebuild-zWc1b']) {
    const p = tenter('git', ['push', 'origin', 'HEAD:' + ref], DEPOT);
    console.log('   ' + (p.ok ? '✅ poussé sur ' : '❌ pousse échouée sur ') + ref);
  }
}

/* ── ④ LE PROCHAIN PAQUET ───────────────────────────────────────────────── */
const restantes = [];
const faites = new Set(Object.keys(racines.poids || {}));
const nonRes = racines.nonResolues || {};
const source = path.join(RACINE, 'data/dewalt-racines.json');
let toutes = [];
if (fs.existsSync(source)) {
  toutes = JSON.parse(fs.readFileSync(source, 'utf8'));
} else {
  /* repli : le catalogue lui-même porte les racines à peser */
  const prods = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
  const liste = Array.isArray(prods) ? prods : (prods.products || []);
  const vu = new Set();
  liste.filter((p) => /dewalt/i.test(p.brand || p.marque || p.title || ''))
    .filter((p) => p.poidsSuppose === true)
    .forEach((p) => {
      const r = String(p.sku || p.id || '').split(/[-_]/)[0].toUpperCase();
      if (!r || vu.has(r)) return;
      vu.add(r);
      toutes.push({ r: r, t: String(p.title || '').slice(0, 70) });
    });
}
/* ⛔⛔ NE JAMAIS REPASSER SUR CE QU'ON VIENT D'ESSAYER, TANT QU'IL RESTE DU
   NEUF. Défaut mesuré le 15/08/2026 : le paquet suivant reproposait mot pour
   mot les références que la vague venait de rendre « introuvable » ou « non
   résolue ». Or le budget de recherche est plafonné (~200 par campagne) : les
   redonner en tête revient à brûler la campagne sur des impasses connues,
   pendant que des centaines de références n'ont JAMAIS été tentées.
   ⚠️ Ce n'est PAS un abandon — elles restent dans `nonResolues` avec leur
   motif, et reviennent d'elles-mêmes en fin de file quand le neuf est épuisé.
   Sceller serait le défaut d'en face, celui des 117 fausses « introuvable ». */
const jamaisTentees = [];
const dejaTentees = [];
toutes.forEach((c) => {
  const r = c.r || c.racine;
  if (faites.has(r)) return;
  (nonRes[r] ? dejaTentees : jamaisTentees).push({ r: r, t: c.t || c.titre || '' });
});
/* ⛔⛔ LES KITS MULTI-OUTILS PASSENT EN DERNIER, ET CE N'EST PAS UN ABANDON.
   Mesuré sur la vague du 15/08 : 50 références de kits (DCK…) ont rendu 5
   poids gravables — 10 %. Les vagues de machines seules tournent bien au-dessus.
   La cause est structurelle : le poids d'un kit est celui d'un COLIS que peu de
   revendeurs publient, alors que le poids d'une machine est une spécification
   constructeur.
   ⚠️ Et surtout : un kit n'a pas besoin d'être cherché. `poids-expedie.js` sait
   COMPOSER — outil nu + batteries + chargeur + 1 kg d'emballage (l'ordre de
   l'user du 14/08/2026). Il lui faut le poids des MACHINES. Chercher les kits
   avant leurs machines, c'est payer des recherches pour un résultat qu'on
   obtiendra gratuitement ensuite.
   ⇒ Machines d'abord, kits ensuite. Le budget de recherche va là où il produit. */
function estKit(r) { return /^DCK/i.test(String(r || '')); }
const machines = jamaisTentees.filter((x) => !estKit(x.r));
const kits = jamaisTentees.filter((x) => estKit(x.r));
machines.forEach((x) => restantes.push(x));
kits.forEach((x) => restantes.push(x));
dejaTentees.forEach((x) => restantes.push(x));

console.log('');
console.log('④ état : ' + nRac + ' racines gravées · ' + Object.keys(nonRes).length
  + ' non résolues gardées · ' + restantes.length + ' restantes');
console.log('   jamais tentées : ' + machines.length + ' machines + ' + kits.length
  + ' kits (les kits passent en dernier, ils se COMPOSENT)');
console.log('   déjà tentées sans succès, repoussées en fin de file : ' + dejaTentees.length);
if (!restantes.length) {
  console.log('   ✅ PLUS RIEN À PESER — toutes les racines connues sont gravées.');
  process.exit(0);
}
const paquet = restantes.slice(0, TAILLE);
const lots = [];
for (let i = 0; i < paquet.length; i += 10) lots.push(paquet.slice(i, i + 10));
/* tests/_sortie/ : ni versionné ni déployé — la seule place où un outil écrit
   (règle des harnais : jamais à la racine du site, quatre captures d'écrans
   privés y ont été servies publiquement pour l'avoir oublié). */
const sortieDir = path.join(RACINE, 'tests/_sortie');
if (!fs.existsSync(sortieDir)) fs.mkdirSync(sortieDir, { recursive: true });
const dest = path.join(sortieDir, 'prochain-paquet.json');
fs.writeFileSync(dest, JSON.stringify(lots));
console.log('   prochain paquet écrit : ' + dest);
console.log('   ' + paquet.length + ' références en ' + lots.length + ' lots · '
  + JSON.stringify(lots).length + ' octets');
console.log('   vagues restantes à ce rythme : ' + Math.ceil(restantes.length / TAILLE));
