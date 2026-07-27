/* =========================================================================
   AUDIT P8 — PERFORMANCE ET PWA
   =========================================================================
   L'user navigue TOUJOURS en navigation privée : aucun cache ne l'aide jamais,
   chaque visite est un chargement à froid intégral. Seul le POIDS BRUT compte,
   et il se mesure — il ne s'estime pas.

   MESURE DE RÉFÉRENCE (27/07/2026, Playwright, contexte neuf, cache vide) :
     accueil 2 990 Ko / 26 requêtes · catalogue 4 444 Ko / 34 requêtes.
   Un chargement différé des vignettes a été tenté (accueil 1 839 Ko) puis
   RETIRÉ : il mettait en péril l'affichage instantané au défilement, exigence
   explicite de l'user, et la mesure du chemin critique était finalement PIRE
   (3 552 Ko). Le harnais reste dans scratchpad/perf.mjs (Playwright, hors CI).

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

   CONTRÔLE 3 — IMAGES : les vignettes se chargent IMMÉDIATEMENT. Le différé
     est interdit sans mesure et accord explicite (voir ci-dessus).

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

// ═══ CONTRÔLE 3 — RÈGLE GRAVÉE : pas de chargement différé des vignettes ══
// DÉCISION USER (27/07/2026) : l'affichage doit être INSTANTANÉ au défilement,
// y compris en navigation privée — c'est un travail de plusieurs heures et un
// critère non négociable. Un différé (data-src + observateur) a été tenté puis
// RETIRÉ : la mesure a montré un chemin critique de 3 552 Ko contre 2 990 Ko
// avant, soit une régression sur les DEUX tableaux. Ce contrôle empêche de le
// réintroduire par mégarde.
LOG('\n' + '━'.repeat(74));
LOG('  P8.3 — VIGNETTES : chargement immédiat (décision user, non négociable)');
LOG('━'.repeat(74));
const APP = read('app.js').toString();
const differe = /data-src="' \+ imgSrc/.test(APP) || /armCardImages/.test(APP);
LOG('  ' + (differe ? '❌' : '✅') + ' les vignettes se chargent immédiatement (aucun data-src)');
if (differe) {
  problems.push('CHARGEMENT DIFFÉRÉ RÉINTRODUIT sur les vignettes. Décision user du '
    + '27/07/2026 : l\'affichage doit être instantané au défilement, même en navigation '
    + 'privée. Un différé a déjà été tenté et retiré (chemin critique mesuré PIRE : '
    + '3 552 Ko contre 2 990). Ne pas refaire sans mesure ET accord explicite.');
}
const lazy = /loading="lazy"/.test(APP);
LOG('  ' + (lazy ? '✅' : '❌') + ' attribut loading="lazy" conservé (économie sans risque)');
if (!lazy) problems.push('loading="lazy" a disparu des vignettes.');

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P8 : performance et PWA conformes.' : '  ❌ P8 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P8 perf] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
