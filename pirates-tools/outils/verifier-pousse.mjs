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
import { execSync } from 'node:child_process';

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
console.log('   La production Vercel peut le servir. Rappel : si master et la branche pointent le');
console.log('   MÊME commit déjà bâti en Preview, Vercel dédoublonne — un commit NEUF sur master');
console.log('   (ce que produit chaque lot) est ce qui déclenche un déploiement Production.');
