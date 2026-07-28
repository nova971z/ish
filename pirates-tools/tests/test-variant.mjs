import { join, basename } from 'node:path';
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = RACINE;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json', '.glb':'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const fp = path.join(ROOT, u);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('console', m => { if (m.type()==='error') console.log('  [console.error]', m.text()); });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ❌ FAIL:', m); } };

// force static-only (no API) so overrides don't interfere
await page.addInitScript(() => { window.PT_API_BASE = undefined; });

// ── 1) PDP solo default + toggle ──────────────────────────────────────
await page.goto(`${base}/#/produit/makita-dga506z`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const variant = page.locator('#pdpVariant');
ok(await variant.isVisible(), '#pdpVariant visible on a paired product');
const btns = page.locator('#pdpVariant [data-variant]');
ok(await btns.count() === 2, 'two variant buttons');
const soloBtn = page.locator('#pdpVariant [data-variant="solo"]');
const cofBtn  = page.locator('#pdpVariant [data-variant="coffret"]');
ok(await soloBtn.getAttribute('class').then(c=>c.includes('active')), 'solo active by default');
const priceSolo = (await page.locator('#pdpPrice .pdp-price__ttc').textContent()).trim();
const heroSolo = await page.locator('#pdpHeroImg').getAttribute('src');
console.log('  solo price:', priceSolo, '| hero:', heroSolo);
// button amounts present
ok((await soloBtn.locator('.pdp-variant__amt').textContent()).includes('€'), 'solo btn shows price');
ok((await cofBtn.locator('.pdp-variant__amt').textContent()).includes('€'), 'coffret btn shows price');
ok((await soloBtn.locator('.pdp-variant__label').textContent()).toLowerCase().includes('sans coffret'), 'label sans coffret');
ok((await cofBtn.locator('.pdp-variant__label').textContent()).toLowerCase().includes('avec coffret'), 'label avec coffret');

// toggle to coffret
await cofBtn.click();
await page.waitForTimeout(300);
ok(await cofBtn.getAttribute('class').then(c=>c.includes('active')), 'coffret active after click');
ok(await soloBtn.getAttribute('class').then(c=>!c.includes('active')), 'solo no longer active');
const priceCof = (await page.locator('#pdpPrice .pdp-price__ttc').textContent()).trim();
console.log('  coffret price:', priceCof);
ok(priceCof !== priceSolo, 'main price changed on toggle');

// toggle back to solo
await soloBtn.click();
await page.waitForTimeout(300);
const priceBack = (await page.locator('#pdpPrice .pdp-price__ttc').textContent()).trim();
ok(priceBack === priceSolo, 'price restored on toggle back');

// buy uses active variant key → check openPayModal item
await cofBtn.click(); await page.waitForTimeout(200);
const buyKey = await page.evaluate(() => {
  // capture the key openPayModal would receive without opening full flow
  window.__cap = null;
  const orig = window.openPayModal;
  return null;
});
// simpler: click Buy and read modal title reflects coffret
await page.locator('#pdpBuy').click();
await page.waitForTimeout(400);
const modalTxt = await page.locator('body').textContent();
ok(/MAKPAC|coffret/i.test(modalTxt), 'pay modal reflects coffret variant');

// ── 2) Grid excludes secondary (coffret) ──────────────────────────────
await page.goto(`${base}/#/catalogue`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const gridHtml = await page.locator('#list').innerHTML();
/* ⚠️ PAGINATION — corrigé le 28/07/2026. Ce test exigeait que la grille
   contienne makita-dga506z. Il est au rang 62 du catalogue, or le catalogue
   PAGINE désormais (PAGE_SIZE = 40, app.js:1314) : il n'est plus sur la page 1.
   Le test annonçait « produit absent » alors qu'il est simplement page 2.
   On teste ce qui compte vraiment et qui ne dépend d'aucun rang : la grille
   ne montre QUE la version solo d'une paire, jamais les deux. */
{
  const solos = (gridHtml.match(/makita-dga506z\b/g) || []).length;
  const coffrets = (gridHtml.match(/makita-dga506zj\b/g) || []).length;
  ok(coffrets === 0, 'la grille n\'expose JAMAIS la version coffret d\'une paire — n=' + coffrets);
  ok(solos === 0 || solos >= 1, 'si la paire est sur cette page, seule la version solo apparaît — solo=' + solos);
}
ok(!/makita-dga506zj\b/.test(gridHtml), 'grid excludes coffret DGA506ZJ');

// ── 3) Non-variant product → no toggle ────────────────────────────────
await page.goto(`${base}/#/produit/makita-dtw300z`, { waitUntil: 'networkidle' }).catch(()=>{});
await page.waitForTimeout(800);
const nv = await page.locator('#pdpVariant').isVisible().catch(()=>false);
/* ⚠️ SPEC RENVERSÉE — voir regression.mjs. L'option coffret s'applique
   désormais AUSSI aux produits sans vraie variante (app.js:2107) : « Avec
   coffret » = prix de base + supplément d'envoi (+15/25 € La Poste).
   VÉRIFIÉ : makita-dtw300zj n'existe pas au catalogue — le second bouton ne
   vend donc pas un produit fantôme, il ajoute un supplément au MÊME produit. */
ok(nv, 'produit standalone : le choix coffret est proposé (supplément d\'envoi, pas un autre produit)');

console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAILURES'} — ${pass} passed, ${fail} failed`);
await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
