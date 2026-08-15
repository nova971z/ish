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
  // Panne du 29/07/2026 : site entièrement inaccessible sur le domaine (boucle
  // de redirection du Service Worker). Rien ne coûte plus cher qu'un site mort —
  // ce harnais passe donc en tête du noyau, avant même les parcours d'argent.
  'sw-navigation.mjs',
  'plan9-serveur.mjs',   // le serveur de la chaîne livraison (rapide, sans navigateur)
  'plan11-serveur.mjs',
  'plan12-serveur.mjs',  // adresse e-mail vérifiée exigée
  'course-pay.mjs',      // la modale de paiement des outils
  'plan10.mjs',          // panier rendu à l'annulation
  'accordE2E.mjs',       // l'accord de bout en bout
  // Un effacement mal gardé ne se répare pas après coup : la garde se prouve
  // avant, pas le jour où quelqu'un a vidé quelque chose par erreur.
  'raz-deux-clics.mjs',
  // Trois livraisons ont rendu ses PNG détourés sur fond NOIR : le repli JPEG
  // aplatit le canal alpha, et Safari iOS — son navigateur — tombe toujours
  // dedans. Un visuel produit abîmé se voit sur toutes les cartes du catalogue
  // et ne se rattrape qu'en réimportant à la main. Rapide, donc au noyau.
  'photo-transparence.mjs'
];

const args = process.argv.slice(2);
const complet = args.includes('--complet');
const noyau = args.includes('--noyau') || (!complet && args.filter((a) => !a.startsWith('--')).length === 0);
const nommes = args.filter((a) => !a.startsWith('--'));

const tous = (await readdir(TESTS))
  .filter((f) => (f.endsWith('.mjs') || f.endsWith('.js')) && !f.startsWith('_') && f !== 'lancer.mjs')
  .sort();

let liste = complet ? tous
  : nommes.length ? tous.filter((f) => nommes.some((n) => f.startsWith(n.replace(/\.(mjs|js)$/, ''))))
  : NOYAU.filter((f) => tous.includes(f));

if (!liste.length) {
  console.log('Aucun harnais à lancer.');
  console.log('Disponibles : ' + tous.map((f) => f.replace(/\.(mjs|js)$/, '')).join(' · '));
  process.exit(1);
}

console.log('╔' + '═'.repeat(68) + '╗');
console.log('║  ' + (complet ? 'LOT COMPLET' : noyau ? 'NOYAU RAPIDE' : 'SÉLECTION').padEnd(66) + '║');
console.log('║  ' + (liste.length + ' harnais').padEnd(66) + '║');
console.log('╚' + '═'.repeat(68) + '╝\n');

/* ═══ COMPTER LES ASSERTIONS — défaut réel corrigé le 28/07 ════════════════
   La première version comptait les lignes commençant par « ✅ ». Or **16
   harnais sur 47** n'en émettent pas une par assertion : ils résument tout sur
   UNE ligne (« ✅ ALL PASS — 6 passed, 0 failed », « 12 OK / 0 KO »…).
   Résultat : le lanceur affichait 1 assertion là où il y en avait 6, et le
   total général était SOUS-ÉVALUÉ — un chiffre faux qui avait l'air précis.
   C'est le pire défaut possible pour un instrument de mesure.

   On lit donc d'ABORD le bilan que le harnais rend lui-même — il sait ce qu'il
   a exécuté — et on ne retombe sur le comptage de lignes que s'il n'en rend
   aucun. La source retenue est affichée quand elle n'est pas le comptage
   direct : on ne cache pas comment un chiffre a été obtenu. */
const BILANS = [
  // « ✅ ALL PASS — 6 passed, 0 failed »  ·  « ❌ FAILURES — 13 passed, 2 failed »
  { re: /(\d+)\s+passed,\s*(\d+)\s+failed/i, ok: 1, ko: 2, nom: 'passed/failed' },
  // « 12 OK / 0 KO »
  { re: /(\d+)\s*OK\s*\/\s*(\d+)\s*KO/i, ok: 1, ko: 2, nom: 'OK/KO' },
  // « ALL PASS — 8 ok, 0 ko »  (minuscules, autre tournure)
  { re: /(\d+)\s*ok,\s*(\d+)\s*ko/i, ok: 1, ko: 2, nom: 'ok/ko' },
  // « 0 hit-test + 2 fonctionnels » : deux compteurs d'ÉCHECS, pas de total
  { re: /(\d+)\s*hit-test\s*\+\s*(\d+)\s*fonctionnels?/i, echecs: [1, 2], nom: 'échecs seuls' },
  // « 17/17 assertions vertes »
  { re: /(\d+)\s*\/\s*(\d+)\s*assertions/i, ok: 1, tot: 2, nom: 'X/Y assertions' },
  // « ✅ titre du harnais — 8/8 » : le bilan rendu par tests/_socle.mjs.
  // Il n'était couvert par AUCUN motif — les harnais du socle retombaient donc
  // sur le comptage de lignes, bilan honnête ignoré.
  { re: /^[✅❌] .+? — (\d+)\/(\d+)\s*$/m, ok: 1, tot: 2, nom: 'bilan du socle' },
  // « ━━ RÉSULTAT : ❌ 0 hit-test + 2 fonctionnels » → pas de total exploitable
];

function compter(sortie) {
  /* ⚠️ SURCOMPTAGE DE +1, corrigé le 29/07/2026 — deuxième défaut trouvé dans
     ce compteur, et le pire genre : un instrument de mesure qui GONFLE.
     Le lanceur affichait « plan8 71/71 » là où le harnais lancé seul dit
     « 70/70 ». Cause : sa ligne de bilan commence elle aussi par « ✅ »
     (« ✅ 70/70 assertions », « ✅ titre — 6/6 ») et était comptée comme une
     assertion de plus. Le garde-fou de la ligne 105 se déclenchait alors à
     tort (« le bilan annonce moins que ce que j'ai compté »), le bilan
     honnête du harnais était écarté, et c'est le comptage gonflé qui gagnait.
     Correction : une ligne qui a la FORME d'un bilan n'est jamais comptée
     comme une assertion — c'est le résumé, pas le contenu.
     ⚠️ On exclut par la FORME, pas par la position : couper « les N dernières
     lignes » mangerait de vraies assertions chez un harnais court. */
  const toutes = sortie.trim().split('\n');
  const estBilan = (l) => /\d+\s*\/\s*\d+\s*assertions|\d+\s+passed,\s*\d+\s+failed|\d+\s*OK\s*\/\s*\d+\s*KO|\d+\s*ok,\s*\d+\s*ko|—\s*\d+\/\d+\s*$/i.test(l);
  const lignes = toutes.filter((l) => /^✅ /.test(l) && !estBilan(l)).length;
  const rouges = toutes.filter((l) => /^❌ /.test(l) && !estBilan(l)).length;
  // On cherche le bilan dans les DERNIÈRES lignes : c'est là qu'il est rendu,
  // et ça évite de confondre avec une phrase du corps du harnais.
  const fin = toutes.slice(-6).join('\n');
  for (const b of BILANS) {
    const m = fin.match(b.re);
    if (!m) continue;
    if (b.echecs) {
      // Ce harnais ne compte que ses ÉCHECS. On ne peut pas en déduire un
      // total : on garde le comptage de lignes, et on le DIT.
      const ko2 = b.echecs.reduce((a, i) => a + (parseInt(m[i], 10) || 0), 0);
      return { ok: lignes, ko: Math.max(rouges, ko2), source: 'échecs seuls (total inconnu)' };
    }
    const ok = parseInt(m[b.ok], 10);
    const ko = b.ko ? parseInt(m[b.ko], 10) : (parseInt(m[b.tot], 10) - ok);
    if (!isFinite(ok) || !isFinite(ko) || ok + ko === 0) continue;
    // Si le harnais annonce MOINS que ce qu'on a compté, on garde le plus
    // grand : un bilan partiel ne doit jamais faire disparaître des lignes
    // réellement vertes.
    if (ok + ko < lignes + rouges) break;
    return { ok, ko, source: b.nom };
  }
  return { ok: lignes, ko: rouges, source: null };
}

/** Lance un harnais et récupère son score. */
function lancer(f) {
  return new Promise((resolve) => {
    const t = Date.now();
    const p = spawn(process.execPath, [join(TESTS, f)], { cwd: dirname(TESTS) });
    let sortie = '';
    p.stdout.on('data', (d) => { sortie += d; });
    p.stderr.on('data', (d) => { sortie += d; });
    p.on('close', (code) => {
      const c = compter(sortie);
      resolve({ f, code, ok: c.ok, ko: c.ko, source: c.source, ms: Date.now() - t, sortie });
    });
  });
}

const res = [];
for (const f of liste) {
  const r = await lancer(f);
  res.push(r);
  // Code 2 = PRÉREQUIS ABSENT (ex. l'émulateur Firestore ne tourne pas).
  // Distinct de l'échec : un test non exécuté n'est ni vert ni rouge, il est
  // IGNORÉ — et ça doit se voir, sinon on croit couvert ce qui ne l'est pas.
  const etat = r.code === 0 ? '✅' : (r.code === 2 ? '⏭ ' : '❌');
  console.log('  ' + etat + ' ' + f.replace(/\.(mjs|js)$/, '').padEnd(22)
    + String(r.ok + '/' + (r.ok + r.ko)).padStart(9) + '   ' + (r.ms / 1000).toFixed(1) + ' s'
    + (r.source ? '   (' + r.source + ')' : ''));
  if (r.code === 2) {
    const q = r.sortie.split('\n').filter((l) => l.trim().startsWith('⏭') || /^\s{3}/.test(l));
    q.slice(0, 4).forEach((l) => console.log('        ' + l.trim()));
  } else if (r.code !== 0) {
    const lignes = r.sortie.split('\n').filter((l) => l.startsWith('❌') || l.startsWith('⛔'));
    lignes.slice(0, 6).forEach((l) => console.log('        ' + l));
    if (lignes.length > 6) console.log('        … et ' + (lignes.length - 6) + ' autre(s)');
    if (!lignes.length) console.log('        (aucun ❌ : le harnais a planté avant de tester — voir ci-dessous)');
    if (!lignes.length) console.log('        ' + r.sortie.trim().split('\n').slice(-4).join('\n        '));
  }
}

const tot = res.reduce((s, r) => s + r.ok + r.ko, 0);
const bons = res.reduce((s, r) => s + r.ok, 0);
const rouges = res.filter((r) => r.code !== 0 && r.code !== 2);
const ignores = res.filter((r) => r.code === 2);
/* ⚠️ Un harnais VERT qui annonce 0 assertion dit littéralement « je n'ai rien
   vérifié ». Le compter comme bon, c'est croire couvert ce qui ne l'est pas.
   On ne le passe pas en rouge — il n'a pas échoué — mais on le NOMME. */
const muets = res.filter((r) => r.code === 0 && r.ok + r.ko === 0);
const duree = res.reduce((s, r) => s + r.ms, 0) / 1000;

console.log('\n' + '─'.repeat(70));
console.log('  ' + bons + '/' + tot + ' assertions · '
  + (res.length - rouges.length - ignores.length) + '/' + (res.length - ignores.length)
  + ' harnais verts · ' + duree.toFixed(1) + ' s');
if (ignores.length) {
  console.log('  ⏭  ' + ignores.length + ' IGNORÉ(S), prérequis absent : '
    + ignores.map((r) => r.f.replace(/\.(mjs|js)$/, '')).join(' · '));
  console.log('     → non exécuté n\'est PAS vert. Ces parcours ne sont pas couverts.');
}
if (muets.length) {
  console.log('  ⚠️  ' + muets.length + ' harnais VERT(S) mais rendant 0 assertion : '
    + muets.map((r) => r.f.replace(/\.(mjs|js)$/, '')).join(' · '));
  console.log('     → leur couverture est INVÉRIFIABLE. Vert ne veut pas dire vérifié.');
}
if (rouges.length) console.log('  ❌ à reprendre : ' + rouges.map((r) => r.f.replace(/\.(mjs|js)$/, '')).join(' · '));
else console.log('  ✅ tout est vert');
console.log('─'.repeat(70));

process.exitCode = rouges.length ? 1 : 0;
