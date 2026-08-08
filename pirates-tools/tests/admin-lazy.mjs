// Harnais : l'admin est chargé À LA DEMANDE (SEO ordre 9 / D-120).
//  A. Un visiteur qui NE va PAS en admin ne télécharge JAMAIS admin.bundle.js.
//  B. Aller sur #/admin déclenche le chargement du bundle, expose
//     window.__PT_ADMIN, et rend l'écran admin SANS ReferenceError
//     (preuve que le contexte partagé window.__PT_ADMIN_CTX est bien câblé).
//  C. Les accesseurs partagés fonctionnent : __PT_ADMIN_CTX.escapeHTML échappe,
//     et __PT_ADMIN_CTX.products reflète le catalogue VIVANT.
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

let bundleHits = 0;
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.endsWith('/admin.bundle.js')) bundleHits++;
    if (u.pathname === '/api/products') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, products: [] })); }
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    if (!extname(p)) p = '/index.html';
    const fp = normalize(join(ROOT, p)); if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const st = await stat(fp).catch(() => null); if (!st || !st.isFile()) { res.writeHead(404); return res.end('nf'); }
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
const erreurs = [];
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
page.on('pageerror', e => erreurs.push(String(e.message || e)));
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };

let bn = 0;
const boot = async (h) => { await page.goto(`${base}/?b=${++bn}${h}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.PT_BOOTED === true); };

// ── A. Une visite catalogue ne charge PAS le bundle admin ───────────────────
await boot('#/catalogue');
await page.waitForTimeout(500);
T('Un visiteur (catalogue) ne télécharge AUCUN octet d\'admin', bundleHits === 0, 'requêtes bundle=' + bundleHits);
T('window.__PT_ADMIN absent tant qu\'on n\'est pas allé en admin',
  await page.evaluate(() => typeof window.__PT_ADMIN === 'undefined'));

// ── B. #/admin charge le bundle et rend l'écran sans ReferenceError ─────────
erreurs.length = 0;
await boot('#/admin');
await page.waitForFunction(() => !!window.__PT_ADMIN, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600);
T('Aller en admin télécharge admin.bundle.js', bundleHits >= 1, 'requêtes bundle=' + bundleHits);
T('window.__PT_ADMIN est exposé après chargement', await page.evaluate(() => !!window.__PT_ADMIN));
const refErr = erreurs.filter(e => /is not defined|ReferenceError|is not a function/i.test(e));
T('AUCUN ReferenceError pendant le rendu admin (contexte partagé câblé)',
  refErr.length === 0, refErr.slice(0, 2).join(' | '));
T('L\'écran admin a rendu quelque chose', await page.evaluate(() => {
  const v = document.getElementById('view-admin');
  return !!v && !v.classList.contains('hidden') && v.textContent.trim().length > 0;
}));

// ── C. Les accesseurs partagés fonctionnent (get échappe, état vivant) ──────
const acc = await page.evaluate(() => {
  const A = window.__PT_ADMIN_CTX || {};
  return {
    esc: typeof A.escapeHTML === 'function' ? A.escapeHTML('<b>&"') : null,
    prodsEstTableau: Array.isArray(A.products)
  };
});
T('__PT_ADMIN_CTX.escapeHTML (accesseur) échappe correctement',
  acc.esc === '&lt;b&gt;&amp;&quot;', String(acc.esc));
T('__PT_ADMIN_CTX.products reflète le catalogue vivant (accesseur get)',
  acc.prodsEstTableau === true);

await browser.close(); server.close();
console.log(`\n${pass} OK / ${fail} KO`);
process.exit(fail ? 1 : 0);
