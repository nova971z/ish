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
/* ⚠️ `app.js` : plafond RELEVÉ de 205 à 400 le 29/07/2026 — décision D-014 de
   l'user, tracée dans docs/DECISIONS.md, jamais une dérive silencieuse.
   Le fichier était à 204,97 pour 205 : 29 octets de marge. Un correctif de
   SÉCURITÉ (la porte admin n'atteignait jamais la voie du claim) ne pouvait
   plus entrer. Motif retenu, et il rejoint celui de D-001 : le seul chiffre
   qui concerne le visiteur est le TOTAL servi à froid. C'est donc P8.4
   (400 Ko, à 369,8 aujourd'hui) qui devient la limite réellement mordante —
   app.js ne peut pas dépasser ~335 Ko sans la faire rougir.
   ⚠️ CONTREPARTIE ACTÉE : sortir les 33 fonctions d'administration (92 Ko
   bruts, 12,9 % du fichier) dans un module chargé à la demande, comme mfa.js.
   Seul le propriétaire s'en sert ; tous les autres les téléchargent pour rien. */
const BUDGET = {
  'app.js':        400,   // relevé (D-014) — mesuré 205
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


// ═══ CONTRÔLE 4 — LE TOTAL SERVI À FROID ══════════════════════════════════
// DÉCISION USER DU 28/07/2026 : plafond de 400 Ko sur le TEXTE téléchargé à
// la première visite.
// POURQUOI CE CONTRÔLE EXISTE EN PLUS DES PLAFONDS PAR FICHIER : un plafond
// par fichier se CONTOURNE tout seul. Découper app.js en cinq fichiers ferait
// passer les cinq au vert sans qu'un seul octet ne disparaisse. Le visiteur,
// lui, télécharge le total. C'est donc le seul chiffre qui le concerne.
LOG('\n' + '━'.repeat(74));
LOG('  P8.4 — TOTAL SERVI À FROID (le chiffre que voit le visiteur)');
LOG('━'.repeat(74));

const PLAFOND_TOTAL_KO = 400;                       // décision user 28/07/2026
const SERVIS_A_FROID = ['index.html', 'styles.css', 'app.js',
  'firebase-init.js', 'products.json', 'sw.js'];
let totalFroid = 0;
SERVIS_A_FROID.forEach((f) => {
  try { totalFroid += zlib.gzipSync(read(f), { level: 9 }).length / 1024; } catch (e) {}
});
LOG('  ' + (totalFroid <= PLAFOND_TOTAL_KO ? '✅' : '❌')
  + ' total ' + totalFroid.toFixed(1) + ' Ko compressés   (plafond '
  + PLAFOND_TOTAL_KO + ', marge ' + (PLAFOND_TOTAL_KO - totalFroid).toFixed(1) + ')');
if (totalFroid > PLAFOND_TOTAL_KO) {
  problems.push('TOTAL SERVI À FROID DÉPASSÉ : ' + totalFroid.toFixed(1) + ' Ko '
    + '(plafond ' + PLAFOND_TOTAL_KO + '). Découper un fichier ne règle RIEN ici : '
    + 'ce contrôle mesure ce que le visiteur télécharge en tout. Il faut soit '
    + 'retirer du poids, soit différer du code (chargement à la demande), soit '
    + 'que l\'user relève le plafond par une décision tracée.');
}

// ═══ CONTRÔLE 5 — POIDS DES IMAGES SERVIES ════════════════════════════════
// DÉCISION USER DU 28/07/2026 : « on ne dépasse pas le plus gros héros qui
// fait 871 Ko ». Le plafond est donc calé sur l'image la plus lourde du site
// à cette date — c'est un CLIQUET : on a le droit de faire plus léger, jamais
// plus lourd.
// ⛔ CE CONTRÔLE NE COMPRESSE JAMAIS LES VISUELS. L'user exige des images de
// très haute qualité, contrairement aux sites d'outillage concurrents. Le
// levier n'est PAS la compression : c'est de servir la bonne TAILLE au bon
// endroit (vignette petite, héros intact). La qualité n'est jamais la
// variable d'ajustement.
// ⚠️ Ne portent QUE sur les images RÉELLEMENT DÉPLOYÉES : images/_originals/
// est une sauvegarde haute résolution, exclue par .vercelignore. La compter
// ferait crier le contrôle sur un fichier qu'aucun visiteur ne reçoit.
LOG('\n' + '━'.repeat(74));
LOG('  P8.5 — POIDS DES IMAGES SERVIES (cliquet, jamais de compression)');
LOG('━'.repeat(74));

const PLAFOND_IMAGE_KO = 871;                       // décision user 28/07/2026
const EXCLUS = (function () {
  try {
    return fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8')
      .split('\n').map((l) => l.trim())
      .filter((l) => l && l[0] !== '#')
      .map((l) => l.replace(/\/$/, ''));
  } catch (e) { return []; }
})();
function estDeploye(rel) {
  return !EXCLUS.some((x) => rel === x || rel.indexOf(x + '/') === 0);
}
function parcourir(dir, acc) {
  let entrees = [];
  try { entrees = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); }
  catch (e) { return acc; }
  entrees.forEach((e) => {
    const rel = dir + '/' + e.name;
    if (!estDeploye(rel)) return;
    if (e.isDirectory()) parcourir(rel, acc);
    else if (/\.(webp|png|jpe?g|gif|svg)$/i.test(e.name)) {
      acc.push({ rel: rel, ko: fs.statSync(path.join(ROOT, rel)).size / 1024 });
    }
  });
  return acc;
}
const imagesServies = parcourir('images', []);
const tropLourdes = imagesServies.filter((i) => i.ko > PLAFOND_IMAGE_KO);
const plusGrosse = imagesServies.slice().sort((a, b) => b.ko - a.ko)[0];
LOG('  ' + (tropLourdes.length === 0 ? '✅' : '❌') + ' ' + imagesServies.length
  + ' image(s) servie(s) · la plus lourde : '
  + (plusGrosse ? plusGrosse.ko.toFixed(1) + ' Ko (' + plusGrosse.rel + ')' : 'aucune')
  + '   (plafond ' + PLAFOND_IMAGE_KO + ')');
tropLourdes.forEach((i) => {
  problems.push('IMAGE TROP LOURDE : ' + i.rel + ' pèse ' + i.ko.toFixed(0) + ' Ko '
    + '(plafond ' + PLAFOND_IMAGE_KO + ', calé sur le plus gros héros au 28/07). '
    + 'NE PAS LA RECOMPRESSER : servir une version PLUS PETITE là où elle est '
    + 'affichée petite (vignette), et garder l\'original intact sur la fiche produit.');
});

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P8 : performance et PWA conformes.' : '  ❌ P8 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P8 perf] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
