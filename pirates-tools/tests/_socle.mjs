/* tests/_socle.mjs — le socle commun à tous les harnais.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE FICHIER EXISTE
   Les 60 harnais sauvés du scratchpad recopiaient CHACUN les mêmes ~20 lignes
   de serveur HTTP statique (52 sur 60, mesuré), et surtout les mêmes CHEMINS
   ABSOLUS :
       /home/user/ish/pirates-tools          (57 occurrences)
       /opt/node22/lib/node_modules/playwright (45)
       /opt/pw-browsers/chromium             (17)
   Versionnés tels quels, ils ne tournent QUE dans le conteneur où ils ont été
   écrits. Ce socle règle les deux problèmes en un seul endroit : le jour où
   l'environnement change, il y a UNE ligne à corriger, pas soixante.

   RÈGLE : aucun harnais porté ne doit contenir de chemin absolu. Le contrôle
   scripts/check-harnais.js (dans la CI) le refuse.
   ───────────────────────────────────────────────────────────────────────── */
import http from 'node:http';
import zlib from 'node:zlib';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* ═══ 1. OÙ EST LE DÉPÔT — calculé, jamais écrit en dur ═══════════════════ */
export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Dossier de sortie des captures et fichiers temporaires d'un harnais.
    Jamais versionné (tests/.gitignore), jamais déployé (.vercelignore). */
export async function sortie(nom) {
  const d = join(RACINE, 'tests', '_sortie', nom || 'divers');
  await mkdir(d, { recursive: true });
  return d;
}

/* ═══ 2. PLAYWRIGHT — résolu, avec un message clair s'il manque ═══════════ */
const CHEMINS_PLAYWRIGHT = [
  'playwright',                                        // installé normalement
  '/opt/node22/lib/node_modules/playwright/index.js',  // ce conteneur-ci
  '/usr/lib/node_modules/playwright/index.js'
];

/**
 * Charge Playwright, où qu'il soit.
 * Échoue avec une phrase compréhensible plutôt qu'une trace cryptique —
 * un harnais qui plante sans dire pourquoi finit par ne plus être lancé.
 */
export async function playwright() {
  const req = createRequire(import.meta.url);
  for (const c of CHEMINS_PLAYWRIGHT) {
    try {
      if (c.startsWith('/') && !existsSync(c)) continue;
      const m = await import(c.startsWith('/') ? c : req.resolve(c));
      return m.default || m;
    } catch (_) { /* on essaie le suivant */ }
  }
  throw new Error(
    'Playwright est introuvable.\n' +
    '  Ces harnais pilotent un vrai navigateur : sans lui, ils ne peuvent pas tourner.\n' +
    '  Installation :  npm install -D playwright && npx playwright install chromium\n' +
    '  Chemins essayés : ' + CHEMINS_PLAYWRIGHT.join(', ')
  );
}

/** Options de lancement du navigateur, avec le binaire pré-installé s'il existe. */
export function optionsNavigateur(extra) {
  const o = Object.assign({}, extra);
  const prepose = '/opt/pw-browsers/chromium';
  if (!o.executablePath && existsSync(prepose)) o.executablePath = prepose;
  return o;
}

/* ═══ 3. LE SERVEUR STATIQUE — un seul exemplaire pour tous ═══════════════ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.map': 'application/json'
};
const COMPRESSIBLE = /\.(html|css|js|mjs|json|svg|webmanifest|map)$/;

/**
 * Sert le dépôt en statique, en COMPRESSANT comme le fait Vercel.
 * (Sans compression, toute mesure de poids ou de durée serait fausse.)
 * @returns {Promise<{base:string, fermer:()=>void, port:number}>}
 */
export async function serveur(opts) {
  const racine = (opts && opts.racine) || RACINE;
  const srv = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/' || p.endsWith('/')) p += 'index.html';
      const fp = normalize(join(racine, p));
      if (!fp.startsWith(racine)) { res.writeHead(403); return res.end('hors racine'); }
      const st = await stat(fp).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404); return res.end('introuvable'); }
      const buf = await readFile(fp);
      const gz = COMPRESSIBLE.test(fp) && /gzip/.test(req.headers['accept-encoding'] || '');
      const corps = gz ? zlib.gzipSync(buf, { level: 9 }) : buf;
      res.writeHead(200, Object.assign(
        { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' },
        gz ? { 'Content-Encoding': 'gzip' } : {}
      ));
      res.end(corps);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  return { base: `http://127.0.0.1:${port}`, port, fermer: () => srv.close() };
}

/* ═══ 4. LE COMPTEUR D'ASSERTIONS ═════════════════════════════════════════ */
/**
 * Crée le compteur d'un harnais.
 *
 * ⚠️ RÈGLE ISSUE D'UN FAUX VERT RÉEL (plan12-serveur, 28/07) : un harnais peut
 * être vert pour la MAUVAISE raison — là, un 503 en amont faisait passer des
 * tests « pas bloqué » sans qu'aucun contrôle n'ait été franchi. D'où
 * `c.prealable()` : une condition qui, si elle est fausse, fait ÉCHOUER le
 * harnais au lieu de le laisser verdir à vide.
 */
export function compteur(titre) {
  let ok = 0, ko = 0;
  const echecs = [];
  const c = {
    /** Une assertion. `nom` doit faire ≥ 3 mots : un intitulé « test 4 »
        ne peut alimenter aucun catalogue de couverture. */
    T(nom, vrai, detail) {
      if (vrai) { ok++; console.log('✅ ' + nom + (detail ? ' — ' + detail : '')); }
      else { ko++; echecs.push(nom); console.log('❌ ' + nom + (detail ? ' — ' + detail : '')); }
      return !!vrai;
    },
    /** Condition sans laquelle le harnais ne teste RIEN. Fausse = échec net. */
    prealable(nom, vrai, detail) {
      if (!vrai) {
        ko++; echecs.push('PRÉALABLE NON REMPLI : ' + nom);
        console.log('⛔ PRÉALABLE NON REMPLI — ' + nom + (detail ? ' — ' + detail : ''));
        console.log('   Le harnais s\'arrête : vert ici voudrait dire « rien n\'a été vérifié ».');
        return false;
      }
      console.log('· préalable ok — ' + nom);
      return true;
    },
    get total() { return ok + ko; },
    get echecs() { return ko; },
    /** Rend le bilan et sort avec le bon code. */
    bilan() {
      const t = ok + ko;
      console.log('\n' + (ko ? '❌' : '✅') + ' ' + (titre || 'harnais') + ' — ' + ok + '/' + t);
      if (ko) { console.log('   échecs : ' + echecs.join(' · ')); }
      return { titre: titre || 'harnais', ok, ko, total: t, echecs: echecs.slice() };
    },
    /** Termine le processus. Utilisé quand le harnais est lancé seul. */
    terminer() { const b = c.bilan(); process.exitCode = b.ko ? 1 : 0; return b; }
  };
  return c;
}

/* ═══ 5. COUPE-CIRCUIT RÉSEAU ═════════════════════════════════════════════ */
/** Bloque tout appel sortant vers l'extérieur : un harnais ne doit JAMAIS
    dépendre d'un CDN, d'un service tiers, ni surtout toucher la vraie base. */
export const TIERS = /googleapis|gstatic|jsdelivr|unpkg|coingecko|tile\.|api-adresse|osrm|stripe|firebaseio|firebasestorage/;
export async function couperLeTiers(ctx) {
  await ctx.route('**/*', (r) => (TIERS.test(r.request().url()) ? r.abort() : r.continue()));
}
