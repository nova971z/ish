import { join, basename } from 'node:path';
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = RACINE;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary' };
const productsJson = fs.readFileSync(path.join(ROOT,'products.json'),'utf8');

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  // Simulate LIVE: /api/products returns the merged catalogue (same as products.json here)
  if (u === '/api/products') {
    // simulate a slow cold serverless (700ms) so it arrives AFTER first paint
    setTimeout(() => { res.writeHead(200,{'Content-Type':'application/json'}); res.end(productsJson); }, 700);
    return;
  }
  if (u.startsWith('/api/')) { res.writeHead(200,{'Content-Type':'application/json'}); return res.end('{"ok":true}'); }
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
const page = await browser.newPage({ viewport:{ width:390, height:844 } });
page.on('console', m => { if (m.type()==='error') console.log('  [err]', m.text()); });
let pass=0, fail=0; const ok=(c,m)=>{ if(c)pass++; else{fail++;console.log('  ❌',m);} };

// LIVE-like: same-origin API configured
await page.addInitScript(() => { window.PT_API_BASE = ''; });

await page.goto(`${base}/#/produit/makita-dga506z`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(500); // static painted, API not yet (700ms)
const priceSoloEarly = (await page.locator('#pdpPrice .pdp-price__ttc').textContent().catch(()=>'')).trim();
console.log('  [t=500ms] solo price:', priceSoloEarly);

// Click coffret BEFORE api refresh arrives
const cofBtn = page.locator('#pdpVariant [data-variant="coffret"]');
const soloBtn = page.locator('#pdpVariant [data-variant="solo"]');
ok(await cofBtn.isVisible(), 'coffret button visible at t=500ms');
await cofBtn.click();
await page.waitForTimeout(120);
const priceAfterClick = (await page.locator('#pdpPrice .pdp-price__ttc').textContent()).trim();
ok(priceAfterClick !== priceSoloEarly, 'price switched to coffret on click');
console.log('  after click coffret:', priceAfterClick);

// Now let the API refresh land (700ms) → does it snap back / break the button?
await page.waitForTimeout(900);
const priceAfterRefresh = (await page.locator('#pdpPrice .pdp-price__ttc').textContent()).trim();
console.log('  after api refresh:', priceAfterRefresh);
ok(await cofBtn.getAttribute('class').then(c=>c.includes('active')).catch(()=>false)
   || priceAfterRefresh===priceAfterClick, 'coffret selection survived api refresh (or button still there)');

// Click again AFTER refresh — does the button still work?
await soloBtn.click();
await page.waitForTimeout(150);
const priceSoloAgain = (await page.locator('#pdpPrice .pdp-price__ttc').textContent()).trim();
ok(priceSoloAgain === priceSoloEarly, 'button still works after api refresh (solo restored)');
await cofBtn.click();
await page.waitForTimeout(150);
const priceCofAgain = (await page.locator('#pdpPrice .pdp-price__ttc').textContent()).trim();
ok(priceCofAgain === priceAfterClick, 'toggle to coffret works again after refresh');

// Overlay hit-test: is the coffret button the actual element at its center?
const hit = await page.evaluate(() => {
  const b = document.querySelector('#pdpVariant [data-variant="coffret"]');
  if (!b) return { ok:false, reason:'no button' };
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  return { ok: b.contains(el) || b === el, tag: el && el.tagName, cls: el && el.className, br: r };
});
ok(hit.ok, 'coffret button is the top element at its center (no overlay eating clicks): '+JSON.stringify(hit));

console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAILURES'} — ${pass} passed, ${fail} failed`);
await browser.close(); server.close(); process.exit(fail===0?0:1);
