// Harnais : le catalogue ALLÉGÉ (SEO ordre 9).
//  A. Le boot charge products-light.json (sans les champs de détail).
//  B. La grille s'affiche quand même (titre/prix/image présents).
//  C. Ouvrir une fiche déclenche /api/products?id=… et REMPLIT la
//     description longue (détail récupéré à la demande, fusion en place).
//  D. Si le détail est déjà là (re-ouverture), aucun 2e appel réseau.
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

// La fiche témoin se choisit À L'EXÉCUTION : une fiche éligible AVEC une
// description longue réelle (sinon le test « le détail se remplit » ne prouve rien).
const brut = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));
const liste = Array.isArray(brut) ? brut : (brut.products || []);
const fiche = liste.find(p => (p.slug || p.id) && String(p.description_long || '').trim() && p.img && !/placeholder/.test(p.img) && !p.hidden);
if (!fiche) { console.log('⏭ IGNORÉ — aucune fiche éligible avec description longue.'); process.exit(2); }
const SLUG = fiche.slug || fiche.id;
const DL = String(fiche.description_long).trim();

// Serveur : sert products-light.json (généré), le gabarit, et un faux
// /api/products?id=… qui renvoie la fiche COMPLÈTE (avec description_long).
let apiIdHits = 0;
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/products' && u.searchParams.get('id')) {
      apiIdHits++;
      const id = u.searchParams.get('id');
      const p = liste.find(x => x.slug === id || x.id === id || x.sku === id);
      res.writeHead(p ? 200 : 404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(p ? { ok: true, product: p } : { ok: false }));
    }
    if (u.pathname === '/api/products') {
      // ⛔ Comme la PROD : la liste /api/products est ALLÉGÉE et porte _light.
      // Un faux vide masquerait le bug où l'upgrade API écrase les fiches
      // légères SANS _light → renderPDP ne chercherait plus le détail.
      var legers = liste.map(function (p) {
        var c = Object.assign({}, p); delete c.specs; delete c.description_long; delete c.features; c._light = 1; return c;
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, products: legers }));
    }
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    if (!extname(p)) p = '/index.html';
    const fp = normalize(join(ROOT, p)); if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const s = await stat(fp).catch(() => null); if (!s || !s.isFile()) { res.writeHead(404); return res.end('nf'); }
    let corps = await readFile(fp);
    if (p === '/index.html') corps = String(corps).replace('<head>', '<head>\n  <base href="/">');
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(corps);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 } });
await ctx.route('**/*', r => /stripe|googleapis|gstatic|jsdelivr|coingecko|firebase|tile\./.test(r.request().url()) ? r.abort() : r.continue());
const page = await ctx.newPage();
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };

let bn = 0;
const boot = async (h) => { await page.goto(`${base}/?b=${++bn}${h}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.PT_BOOTED === true); };

// ── A+B. La grille charge l'allégé et s'affiche ─────────────────────────────
await boot('#/catalogue');
await page.waitForTimeout(600);
let r = await page.evaluate(() => {
  // Le produit en mémoire porte-t-il le marqueur allégé et PAS le détail ?
  const arr = window.__PT_PRODUCTS_FOR_TEST || null;
  const cards = document.querySelectorAll('#list .card, #list [data-product-id], #list a[href*="/produit/"]').length;
  return { cards };
});
T('La grille s\'affiche avec le catalogue allégé', r.cards > 0, JSON.stringify(r));

// ── C. Ouvrir la fiche déclenche le détail à la demande ─────────────────────
apiIdHits = 0;
await boot('#/produit/' + SLUG);
await page.waitForTimeout(400);
// Avant le détail : la fiche est allégee (description longue vide).
// Après ensureDetail + re-render : la description longue est remplie.
await page.waitForFunction((dl) => {
  const el = document.getElementById('pdpDescLong');
  return el && el.textContent && el.textContent.indexOf(dl.slice(0, 30)) !== -1;
}, DL, { timeout: 8000 }).catch(() => {});
r = await page.evaluate(() => ({
  descLong: (document.getElementById('pdpDescLong') || {}).textContent || '',
  vue: (document.querySelector('.view--active') || {}).id
}));
T('La fiche récupère son détail à la demande (description longue remplie)',
  r.descLong.indexOf(DL.slice(0, 30)) !== -1, r.descLong.slice(0, 50));
T('Le détail est venu d\'un appel /api/products?id=…', apiIdHits >= 1, 'appels=' + apiIdHits);

// ── D. Re-ouvrir la MÊME fiche DANS LA MÊME SESSION (navigation hash, pas de
//       rechargement) : le détail est déjà fusionné en mémoire, aucun 2e appel.
const avant = apiIdHits;
await page.evaluate(() => { location.hash = '#/catalogue'; });
await page.waitForTimeout(250);
await page.evaluate((s) => { location.hash = '#/produit/' + s; }, SLUG);
await page.waitForTimeout(600);
T('Re-ouverture (même session, sans reload) : aucun nouvel appel détail',
  apiIdHits === avant, 'avant=' + avant + ' apres=' + apiIdHits);

await browser.close(); server.close();
console.log(`\n${pass} OK / ${fail} KO`);
process.exit(fail ? 1 : 0);
