// Harnais : chemins réels côté CLIENT (SEO ordre 1).
//  A. Un ancien lien à dièse (#/catalogue) est réécrit en chemin réel
//     (/catalogue) au démarrage — replaceState, pas de rechargement.
//  B. Un lien à dièse vers une fiche (#/produit/<slug>) devient
//     /produit/<slug> et la fiche se rend.
//  C. Une route inconnue affiche la vue 404 dédiée — jamais l'accueil
//     (défaut SEO-027).
//  D. Les routes privées (#/compte) gardent leur dièse : pas de chemin réel.
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const fp = normalize(join(ROOT, p)); if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const s = await stat(fp).catch(() => null); if (!s || !s.isFile()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(await readFile(fp));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// La fiche se choisit À L'EXÉCUTION (règle du dossier), sur le critère de
// l'application : une fiche visible du catalogue.
const brut = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));
const liste = Array.isArray(brut) ? brut : (brut.products || []);
const fiche = liste.find(p => (p.slug || p.id) && !p.hidden);
if (!fiche) { console.log('⏭ IGNORÉ — catalogue vide : rien à vérifier.'); process.exit(2); }
const SLUG = fiche.slug || fiche.id;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 } });
await ctx.route('**/*', r => /stripe|googleapis|gstatic|jsdelivr|coingecko|firebase|tile\./.test(r.request().url()) ? r.abort() : r.continue());
const page = await ctx.newPage();
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };
// Deux goto() sur la même URL ne rechargent pas : on fait varier ?b=N.
let bn = 0;
const boot = async (h) => { await page.goto(`${base}/?b=${++bn}${h}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.PT_BOOTED === true); };

// ── A. #/catalogue → /catalogue ─────────────────────────────────────────────
await boot('#/catalogue');
let r = await page.evaluate(() => ({ chemin: location.pathname, hash: location.hash,
  vue: (document.querySelector('.view--active') || {}).id }));
T('L\'ancien lien #/catalogue devient le chemin réel /catalogue', r.chemin === '/catalogue', JSON.stringify(r));
T('La vue catalogue est rendue', r.vue === 'view-catalogue', r.vue);

// ── B. #/produit/<slug> → /produit/<slug>, fiche rendue ─────────────────────
await boot('#/produit/' + SLUG);
r = await page.evaluate(() => ({ chemin: location.pathname,
  vue: (document.querySelector('.view--active') || {}).id,
  titre: (document.getElementById('pdpTitle') || {}).textContent || '' }));
T('L\'ancien lien fiche devient /produit/<slug>', r.chemin === '/produit/' + encodeURIComponent(SLUG), r.chemin);
T('La fiche se rend sur le chemin réel', r.vue === 'view-produit' && r.titre.trim().length > 0, JSON.stringify(r).slice(0, 90));

// ── B2. Le JSON-LD CLIENT (injecté après hydratation) reste propre sur le
//        chemin réel : image sans « /produit/ » parasite, aucun canonical à #.
//        C'est le défaut vu au test Rich Results du 08/08 (image
//        /produit/images/…) : le client résolvait contre location.href.
const seo = await page.evaluate(() => {
  const ld = document.querySelector('script[data-jsonld="product"]');
  let img = '', bcHasHash = false;
  try { img = (JSON.parse(ld.textContent).image || [])[0] || ''; } catch (_) {}
  const bc = document.querySelector('script[data-jsonld="breadcrumb"]');
  try { bcHasHash = JSON.parse(bc.textContent).itemListElement.some(x => /#/.test(x.item)); } catch (_) {}
  const canon = (document.querySelector('link[rel="canonical"]') || {}).href || '';
  return { img, bcHasHash, canon };
});
T('JSON-LD image = URL racine, jamais /produit/images/ (Rich Results)',
  /^https?:\/\/[^/]+\/images\//.test(seo.img) && seo.img.indexOf('/produit/images/') === -1, seo.img);
T('Fil d\'Ariane : aucun item à fragment #', seo.bcHasHash === false, JSON.stringify(seo).slice(0, 80));
T('Canonical de la fiche sans fragment #', seo.canon.indexOf('#') === -1, seo.canon);

// ── C. Route inconnue → vue 404 dédiée, jamais l'accueil ────────────────────
await boot('#/cette-route-n-existe-pas');
r = await page.evaluate(() => ({ vue: (document.querySelector('.view--active') || {}).id,
  h1: (document.getElementById('notfound-h1') || {}).textContent || '' }));
T('Route inconnue → vue 404 dédiée (SEO-027)', r.vue === 'view-404', r.vue);
T('La page 404 se nomme et offre une sortie', /introuvable/i.test(r.h1), r.h1);

// ── D. Route privée : le dièse reste ────────────────────────────────────────
await boot('#/compte');
r = await page.evaluate(() => ({ chemin: location.pathname, hash: location.hash }));
T('Une route privée (#/compte) garde son dièse', r.chemin === '/' && /compte|auth/.test(r.hash), JSON.stringify(r));

await browser.close(); server.close();
console.log(`\n${pass} OK / ${fail} KO`);
process.exit(fail ? 1 : 0);
