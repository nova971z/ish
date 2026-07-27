/* =========================================================================
   AUDIT P8 — PERFORMANCE ET PWA
   =========================================================================
   L'user navigue TOUJOURS en navigation privée : aucun cache ne l'aide jamais,
   chaque visite est un chargement à froid intégral. Seul le POIDS BRUT compte,
   et il se mesure — il ne s'estime pas.

   MESURE DE RÉFÉRENCE (27/07/2026, Playwright, contexte neuf, cache vide) :
     AVANT correctifs : accueil 2 990 Ko / 26 req · catalogue 4 444 Ko / 34 req
     APRÈS correctifs : accueil 1 839 Ko / 15 req · catalogue 2 300 Ko / 14 req
   Le harnais reste dans scratchpad/perf.mjs (Playwright, hors CI).

   CONTRÔLE 1 — BUDGET DE POIDS (bloquant)
     Les gros fichiers texte sont plafonnés à leur taille compressée mesurée,
     avec une marge. On ne peut plus ajouter 200 Ko à app.js sans le voir.

   CONTRÔLE 2 — INVARIANTS DU SERVICE WORKER (bloquant)
     Règles gravées après des pannes réelles :
       • /api/* n'est JAMAIS intercepté (panne v487 : données admin périmées et
         réponses vides → « TypeError » opaque sous Safari) ;
       • aucun repli ne renvoie de corps VIDE, sauf pour les images ;
       • tout fichier du précache existe réellement sur le disque ;
       • le repli « n'importe quelle version » existe (écran noir après
         déploiement, panne v314).

   CONTRÔLE 3 — IMAGES : pas de vignette servie en pleine résolution sans
     chargement différé.

   Lancement : node scripts/audit/p8-perf.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f));
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };
const problems = [];

// ═══ CONTRÔLE 1 — budget de poids ═════════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P8.1 — BUDGET DE POIDS (taille compressée, telle que servie)');
LOG('━'.repeat(74));

// Plafonds en Ko GZIP, figés sur la mesure du 27/07/2026 + ~15 % de marge.
// Dépasser exige une décision explicite, pas une dérive silencieuse.
const BUDGET = {
  'app.js':        205,   // mesuré 176
  'styles.css':     60,   // mesuré  51
  'products.json':  65,   // mesuré  54
  'index.html':     46    // mesuré  39
};
let totalGz = 0;
Object.keys(BUDGET).forEach((f) => {
  const buf = read(f);
  const gz = zlib.gzipSync(buf, { level: 9 }).length / 1024;
  totalGz += gz;
  const ok = gz <= BUDGET[f];
  LOG('  ' + (ok ? '✅' : '❌') + ' ' + f.padEnd(16)
    + (buf.length / 1024).toFixed(0).padStart(5) + ' Ko brut → '
    + gz.toFixed(0).padStart(4) + ' Ko gzip   (plafond ' + BUDGET[f] + ')');
  if (!ok) {
    problems.push('BUDGET DÉPASSÉ : ' + f + ' pèse ' + gz.toFixed(0) + ' Ko compressés '
      + '(plafond ' + BUDGET[f] + '). L\'user navigue en privé : chaque octet est '
      + 'retéléchargé à CHAQUE visite.');
  }
});
LOG('  → texte total servi à froid : ' + totalGz.toFixed(0) + ' Ko compressés');

// ═══ CONTRÔLE 2 — invariants du Service Worker ════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P8.2 — SERVICE WORKER : invariants issus de pannes réelles');
LOG('━'.repeat(74));
const SW = read('sw.js').toString();

const invariants = [
  ['/api/* jamais intercepté (panne v487)',
   /url\.pathname\.indexOf\('\/api\/'\) === 0/.test(SW)],
  ['repli « n\'importe quelle version » présent (écran noir, panne v314)',
   /fromCacheAnyVersion/.test(SW)],
  ['navigationPreload activé à l\'activate, pas à l\'install',
   /activate[\s\S]{0,400}navigationPreload/.test(SW)],
  ['seul le shell racine peut rafraîchir index.html (anti-empoisonnement)',
   /isShell/.test(SW)],
  ['anciens caches supprimés à l\'activate',
   /caches\.delete/.test(SW)]
];
invariants.forEach(([quoi, ok]) => {
  LOG('  ' + (ok ? '✅' : '❌') + ' ' + quoi);
  if (!ok) problems.push('invariant du Service Worker rompu : ' + quoi);
});

// Corps vides : tolérés UNIQUEMENT pour les images.
const vides = (SW.match(/new Response\(''\s*,/g) || []).length;
const videImage = /image-unavailable-offline/.test(SW);
const okVides = vides === 0 || (vides === 1 && videImage);
LOG('  ' + (okVides ? '✅' : '❌') + ' aucun repli à corps vide hors images ('
  + vides + ' trouvé' + (vides > 1 ? 's' : '') + ')');
if (!okVides) {
  problems.push('le Service Worker peut renvoyer un CORPS VIDE hors image : le .json() '
    + 'de l\'appelant échoue et Safari ne remonte qu\'un « TypeError » opaque (panne v487).');
}

// Tout fichier précaché doit exister.
const shell = [...SW.matchAll(/'\.\/([^'?]+)(?:\?[^']*)?'/g)].map((m) => m[1])
  .filter((f) => /\.(html|css|js|png|webmanifest)$/.test(f));
const manquants = shell.filter((f) => !fs.existsSync(path.join(ROOT, f)));
LOG('  ' + (manquants.length ? '❌' : '✅') + ' les ' + shell.length
  + ' fichiers du précache existent sur le disque'
  + (manquants.length ? ' — MANQUANTS : ' + manquants.join(', ') : ''));
manquants.forEach((f) => problems.push('le Service Worker précache « ' + f
  + ' » qui N\'EXISTE PAS : l\'install échoue silencieusement sur cette entrée.'));

// ═══ CONTRÔLE 3 — images de vignette ══════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P8.3 — VIGNETTES : chargement différé dans les listes');
LOG('━'.repeat(74));
const APP = read('app.js').toString();
const aDefer = /data-src="' \+ imgSrc/.test(APP) && /function armCardImages/.test(APP);
LOG('  ' + (aDefer ? '✅' : '❌') + ' la carte produit sait différer son image (data-src + observateur)');
if (!aDefer) problems.push('la carte produit ne différe plus ses images : les bandeaux horizontaux '
  + 'retéléchargeront tous les posters d\'un coup (mesuré à 1,4 Mo sur l\'accueil).');

// Chaque conteneur qui rend des cartes différées doit ARMER l'observateur,
// sinon les images ne se chargent jamais.
const rendus = (APP.match(/defer: true/g) || []).length;
const armes = (APP.match(/armCardImages\(/g) || []).length - 1;   // −1 : la définition
LOG('  ' + (armes >= rendus ? '✅' : '❌') + ' ' + rendus + ' rendu(s) différé(s) · '
  + armes + ' armement(s) de l\'observateur');
if (armes < rendus) {
  problems.push('un rendu utilise defer: true SANS appeler armCardImages() : les vignettes '
    + 'resteraient vides à l\'écran.');
}

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P8 : performance et PWA conformes.' : '  ❌ P8 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P8 perf] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
