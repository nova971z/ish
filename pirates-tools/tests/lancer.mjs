/* tests/lancer.mjs — le lanceur unique des harnais.
   ─────────────────────────────────────────────────────────────────────────
     node tests/lancer.mjs --noyau     les parcours d'argent et de livraison
     node tests/lancer.mjs --complet   tout
     node tests/lancer.mjs plan9 bulle un ou plusieurs harnais nommés

   POURQUOI DEUX LOTS : ~15 harnais Playwright à ~40 s font 10 minutes. Trop
   long pour être lancé systématiquement — donc il ne le serait pas, donc il ne
   protégerait rien. Le NOYAU vise ≤ 90 s et couvre l'argent et la livraison ;
   le lot COMPLET se lance avant une livraison importante.
   ───────────────────────────────────────────────────────────────────────── */
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS = dirname(fileURLToPath(import.meta.url));

/* Le noyau : ce dont la panne coûterait de l'argent ou casserait un parcours.
   Un harnais absent d'ici n'est pas moins important — il est plus lent. */
const NOYAU = [
  'plan9-serveur.mjs',   // le serveur de la chaîne livraison (rapide, sans navigateur)
  'plan11-serveur.mjs',
  'plan12-serveur.mjs',  // adresse e-mail vérifiée exigée
  'course-pay.mjs',      // la modale de paiement des outils
  'plan10.mjs',          // panier rendu à l'annulation
  'accordE2E.mjs'        // l'accord de bout en bout
];

const args = process.argv.slice(2);
const complet = args.includes('--complet');
const noyau = args.includes('--noyau') || (!complet && args.filter((a) => !a.startsWith('--')).length === 0);
const nommes = args.filter((a) => !a.startsWith('--'));

const tous = (await readdir(TESTS))
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'lancer.mjs')
  .sort();

let liste = complet ? tous
  : nommes.length ? tous.filter((f) => nommes.some((n) => f.startsWith(n.replace(/\.mjs$/, ''))))
  : NOYAU.filter((f) => tous.includes(f));

if (!liste.length) {
  console.log('Aucun harnais à lancer.');
  console.log('Disponibles : ' + tous.map((f) => f.replace('.mjs', '')).join(' · '));
  process.exit(1);
}

console.log('╔' + '═'.repeat(68) + '╗');
console.log('║  ' + (complet ? 'LOT COMPLET' : noyau ? 'NOYAU RAPIDE' : 'SÉLECTION').padEnd(66) + '║');
console.log('║  ' + (liste.length + ' harnais').padEnd(66) + '║');
console.log('╚' + '═'.repeat(68) + '╝\n');

/** Lance un harnais et récupère son score depuis sa dernière ligne de bilan. */
function lancer(f) {
  return new Promise((resolve) => {
    const t = Date.now();
    const p = spawn(process.execPath, [join(TESTS, f)], { cwd: dirname(TESTS) });
    let sortie = '';
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { sortie += d; });
    p.on('close', (code) => {
      // Compte les ✅ / ❌ : marche quel que soit le style du harnais.
      const ok = (sortie.match(/^✅ /gm) || []).length;
      const ko = (sortie.match(/^❌ /gm) || []).length;
      resolve({ f, code, ok, ko, ms: Date.now() - t, sortie });
    });
  });
}

const res = [];
for (const f of liste) {
  const r = await lancer(f);
  res.push(r);
  const etat = r.code === 0 ? '✅' : '❌';
  console.log('  ' + etat + ' ' + f.replace('.mjs', '').padEnd(22)
    + String(r.ok + '/' + (r.ok + r.ko)).padStart(9) + '   ' + (r.ms / 1000).toFixed(1) + ' s');
  if (r.code !== 0) {
    const lignes = r.sortie.split('\n').filter((l) => l.startsWith('❌') || l.startsWith('⛔'));
    lignes.slice(0, 6).forEach((l) => console.log('        ' + l));
    if (lignes.length > 6) console.log('        … et ' + (lignes.length - 6) + ' autre(s)');
    if (!lignes.length) console.log('        (aucun ❌ : le harnais a planté avant de tester — voir ci-dessous)');
    if (!lignes.length) console.log('        ' + r.sortie.trim().split('\n').slice(-4).join('\n        '));
  }
}

const tot = res.reduce((s, r) => s + r.ok + r.ko, 0);
const bons = res.reduce((s, r) => s + r.ok, 0);
const rouges = res.filter((r) => r.code !== 0);
const duree = res.reduce((s, r) => s + r.ms, 0) / 1000;

console.log('\n' + '─'.repeat(70));
console.log('  ' + bons + '/' + tot + ' assertions · ' + (res.length - rouges.length) + '/' + res.length
  + ' harnais verts · ' + duree.toFixed(1) + ' s');
if (rouges.length) console.log('  ❌ à reprendre : ' + rouges.map((r) => r.f.replace('.mjs', '')).join(' · '));
else console.log('  ✅ tout est vert');
console.log('─'.repeat(70));

process.exitCode = rouges.length ? 1 : 0;
