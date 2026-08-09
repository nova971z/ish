// Harnais : PRIX NON CONFIRMÉS (Firebase en panne / quota épuisé).
//  A. API répond prixConfirmes:true  → AUCUN bandeau, achat normal.
//  B. API répond prixConfirmes:false → bandeau visible « prix en cours
//     d'actualisation » (même vérité que le refus serveur du paiement).
//  C. API INJOIGNABLE (500)          → même bandeau : ne pas savoir si les
//     prix sont vivants se traite comme « pas vivants ».
// ⛔ Motif (09/08/2026, remonté par l'user) : quand le quota Firebase était
// épuisé, le site affichait les prix de BASE sans un mot — des prix
// possiblement périmés présentés comme vrais. Le serveur refusait déjà le
// débit ; l'écran, lui, faisait semblant.
import { playwright, RACINE } from './_socle.mjs';
const { chromium } = await playwright();
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const brut = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));
const liste = Array.isArray(brut) ? brut : (brut.products || []);

let modeApi = 'confirme';   // 'confirme' | 'nonconfirme' | 'panne'
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/products') {
      if (modeApi === 'panne') { res.writeHead(500); return res.end('{"ok":false}'); }
      const legers = liste.map((p) => { const c = Object.assign({}, p); delete c.specs; delete c.description_long; delete c.features; c._light = 1; return c; });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, prixConfirmes: modeApi === 'confirme', products: legers }));
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
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 } });
await ctx.route('**/*', (r) => /stripe|googleapis|gstatic|jsdelivr|coingecko|firebase|tile\./.test(r.request().url()) ? r.abort() : r.continue());
const page = await ctx.newPage();
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };

let bn = 0;
async function boot(mode) {
  modeApi = mode;
  await page.goto(`${base}/?b=${++bn}#/catalogue`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PT_BOOTED === true, { timeout: 10000 });
  // l'appel API (borné à 6 s) doit avoir tranché : on attend l'état stable
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const b = document.getElementById('prixBandeau');
    return { bandeau: !!b, texte: b ? b.textContent : '' };
  });
}

const a = await boot('confirme');
T('prix confirmés → AUCUN bandeau', a.bandeau === false, JSON.stringify(a));

const b = await boot('nonconfirme');
T('prixConfirmes:false → bandeau visible', b.bandeau === true, JSON.stringify(b));
T('…et il dit que les prix s\'actualisent et que les commandes reprennent',
  /actualisation/i.test(b.texte) && /commandes/i.test(b.texte), b.texte.slice(0, 80));

const c = await boot('panne');
T('API injoignable (500) → même bandeau (l\'ignorance = non confirmé)', c.bandeau === true, JSON.stringify(c));

await browser.close(); server.close();
console.log(`\n${pass} OK / ${fail} KO`);
process.exit(fail ? 1 : 0);
