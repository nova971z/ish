// outils/verifier-pousse.mjs — LE COMMIT ANNONCÉ EST-IL VRAIMENT SUR origin/master ?
//
// ⛔ POURQUOI CET OUTIL EXISTE (08/08/2026). J'ai rendu plusieurs comptes
// rendus « tout est poussé sur master » alors que la PRODUCTION Vercel — qui
// suit master — servait encore une version antérieure. Cause mesurée : mes
// deux `git push … | tail -1` ne montraient que la DERNIÈRE ligne (le message
// de suivi de branche), jamais la ligne de mise à jour de réf. Un push qui
// n'avançait pas master passait donc pour réussi. Un travail resté en Preview
// n'existe pas pour Google.
//
// Cet outil FETCH puis vérifie qu'un SHA donné est bien un ancêtre de
// origin/master. Rouge → interdiction de rendre le compte-rendu.
//
//   node outils/verifier-pousse.mjs <sha>        # sha explicite
//   node outils/verifier-pousse.mjs              # HEAD local
'use strict';
import { execSync, spawnSync } from 'node:child_process';

function git(cmd) {
  return execSync('git ' + cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const sha = process.argv[2] || git('rev-parse HEAD');

try {
  // FETCH d'abord : sans lui, origin/master est une photographie périmée —
  // c'est exactement le piège qu'on répare.
  execSync('git fetch origin master', { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  console.error('❌ [verifier-pousse] git fetch a échoué : ' + (e.message || e));
  process.exit(1);
}

const shaCourt = git('rev-parse --short ' + sha);
const teteMaster = git('rev-parse --short origin/master');
let ancetre = false;
try {
  execSync('git merge-base --is-ancestor ' + sha + ' origin/master', { stdio: 'ignore' });
  ancetre = true;
} catch (_) { ancetre = false; }

if (!ancetre) {
  console.error('❌ [verifier-pousse] ' + shaCourt + ' N\'EST PAS sur origin/master (tête : '
    + teteMaster + ').');
  console.error('   La PRODUCTION Vercel suit master : ce travail n\'est PAS déployé.');
  console.error('   → git push origin ' + shaCourt + ':master, puis relancer cette vérification.');
  process.exit(1);
}

console.log('✅ [verifier-pousse] ' + shaCourt + ' est sur origin/master (tête : ' + teteMaster + ').');

/* ═══ ÉTAPE 2 — LE BUILD, PAS SEULEMENT LE GIT (08/08/2026) ═══════════════════
   ⛔ MOTIF, payé cher : les clés "comment" de vercel.json ont mis TOUS les
   builds en ERROR pendant ~9 h. Cette porte disait « ✅ sur origin/master » et
   j'annonçais « déployé » — alors que la Production servait toujours l'ancien
   commit. Poussé N'EST PAS construit, construit N'EST PAS servi.
   Désormais un lot n'est « déployé » que si l'une de ces PREUVES passe :
     ① la PRODUCTION elle-même (https://pirates-tools.com/api/health) rend
        build.commit === ce SHA — la preuve la plus forte, sans aucun jeton ;
     ② l'API Vercel (VERCEL_TOKEN) montre le déploiement de ce SHA en READY.
   Aucune des deux possible (réseau bloqué / pas de jeton) → ROUGE : le rapport
   dit « poussé, build NON prouvé », jamais « déployé ». */
function curl(url, enTetes) {
  // --noproxy : le mandataire de la session intercepte TOUT, même 127.0.0.1 —
  // le mock local du test de cette porte doit se joindre en direct.
  const args = ['-sS', '-m', '20', '--noproxy', '127.0.0.1,localhost', '-o', '-', '-w', '\n%{http_code}'];
  (enTetes || []).forEach((h) => args.push('-H', h));
  args.push(url);
  const r = spawnSync('curl', args, { encoding: 'utf8' });
  if (r.status !== 0) return { reseau: false, detail: String(r.stderr || '').trim().slice(0, 120) };
  const idx = r.stdout.lastIndexOf('\n');
  return { reseau: true, code: Number(r.stdout.slice(idx + 1)), corps: r.stdout.slice(0, idx) };
}

const sha7 = shaCourt.slice(0, 7);
// ~5 min de guet : le temps d'un build. VERIF_ESSAIS ne sert qu'au test de la
// porte elle-même (réduire l'attente du chemin rouge) — jamais en usage réel.
const ATTENTE_MS = 20000, ESSAIS = Number(process.env.VERIF_ESSAIS) || 15;
let preuve = null, dernierEtat = '';
for (let essai = 0; essai < ESSAIS && !preuve; essai++) {
  if (essai > 0) execSync('sleep ' + Math.round(ATTENTE_MS / 1000));
  // ① La production elle-même — aucun jeton nécessaire.
  // VERIF_HEALTH_URL : SEULEMENT pour le test de cette porte (mock local) —
  // jamais posé en usage réel. C'est ce qui rend le chemin VERT prouvable
  // sans réseau : un faux /api/health qui répond le bon (ou mauvais) SHA.
  const h = curl(process.env.VERIF_HEALTH_URL || 'https://pirates-tools.com/api/health');
  if (h.reseau && h.code === 200) {
    try {
      const commitProd = String((JSON.parse(h.corps).build || {}).commit || '');
      if (commitProd === sha7) { preuve = 'production /api/health sert ' + sha7; break; }
      dernierEtat = 'prod sert ' + (commitProd || '?') + ' (attendu ' + sha7 + ')';
    } catch (_) { dernierEtat = 'health illisible'; }
  } else if (!h.reseau) { dernierEtat = 'réseau bloqué vers pirates-tools.com (' + h.detail + ')'; }
  // ② L'API Vercel, si un jeton est posé.
  const jeton = process.env.VERCEL_TOKEN;
  if (jeton) {
    const a = curl('https://api.vercel.com/v6/deployments?limit=30&target=production',
      ['Authorization: Bearer ' + jeton]);
    if (a.reseau && a.code === 200) {
      try {
        const dep = (JSON.parse(a.corps).deployments || [])
          .find((d) => String((d.meta || {}).githubCommitSha || '').startsWith(sha7));
        const etat = dep && (dep.readyState || dep.state);
        if (etat === 'READY') { preuve = 'API Vercel : build ' + sha7 + ' READY'; break; }
        if (etat === 'ERROR') { dernierEtat = 'API Vercel : build ' + sha7 + ' en ERROR'; break; }
        dernierEtat = 'API Vercel : ' + (etat || 'déploiement introuvable pour ' + sha7);
      } catch (_) { dernierEtat = 'réponse API illisible'; }
    } else if (a.reseau) { dernierEtat = 'API Vercel refuse (HTTP ' + a.code + ') — jeton invalide ?'; }
    else { dernierEtat = dernierEtat || ('réseau bloqué vers api.vercel.com (' + a.detail + ')'); }
  }
  // Sans réseau ET sans jeton, attendre ne changera rien : on sort tout de suite.
  if (/réseau bloqué/.test(dernierEtat) && !jeton) break;
  if (/ERROR/.test(dernierEtat)) break;
}

if (preuve) {
  console.log('✅ [verifier-pousse] BUILD PROUVÉ — ' + preuve + '. Le lot est réellement DÉPLOYÉ.');
} else {
  console.error('❌ [verifier-pousse] BUILD NON PROUVÉ — ' + (dernierEtat || 'aucune sonde n\'a abouti') + '.');
  console.error('   Le SHA est poussé, mais RIEN ne prouve que Vercel l\'a construit et le sert.');
  console.error('   Le rapport doit dire « poussé, build non prouvé » — JAMAIS « déployé ».');
  console.error('   Débloquer : autoriser pirates-tools.com (et api.vercel.com + VERCEL_TOKEN)');
  console.error('   dans le réseau de l\'environnement Claude, ou vérifier la capture Vercel.');
  process.exit(1);
}
