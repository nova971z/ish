import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT='/home/user/ish/pirates-tools';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}if(u==='/')u='/index.html';const fp=path.join(ROOT,u);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf');}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}`;
const br=await chromium.launch();const pg=await br.newPage({viewport:{width:390,height:844}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/Failed to load|net::ERR|model-viewer|favicon|Refused/.test(m.text()))errs.push('CONSOLE '+m.text());});
await pg.addInitScript(()=>{window.PT_API_BASE=undefined;try{localStorage.setItem('pt:analytics-consent','refused')}catch(e){}});
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log(' ❌',m);}};
// Accueil
await pg.goto(`${base}/#/`,{waitUntil:'networkidle'});await pg.waitForTimeout(1000);
ok(await pg.locator('.brand-card').count()>0,'accueil : bulles marques');
// Catalogue pagination
await pg.goto(`${base}/#/catalogue`,{waitUntil:'networkidle'});await pg.waitForTimeout(800);
const gridCards=await pg.locator('#list .product-card').count();
ok(gridCards===40,'catalogue : 40 cartes/page (obtenu '+gridCards+')');
ok(await pg.locator('#pager .pager__btn').count()>0,'catalogue : pagination présente');
// PDF variante Makita
await pg.goto(`${base}/#/produit/makita-dga506z`,{waitUntil:'networkidle'});await pg.waitForTimeout(1200);
ok(await pg.locator('#pdpVariant [data-variant]').count()===2,'PDF : switch variante (2 boutons)');
const pSolo=(await pg.locator('#pdpPrice .pdp-price__ttc').textContent()).trim();
await pg.locator('#pdpVariant [data-variant="coffret"]').click();await pg.waitForTimeout(300);
ok((await pg.locator('#pdpPrice .pdp-price__ttc').textContent()).trim()!==pSolo,'PDF : bascule change le prix');
// PDF produit simple (pas de switch)
await pg.goto(`${base}/#/produit/makita-dtw300z`,{waitUntil:'networkidle'}).catch(()=>{});await pg.waitForTimeout(700);
ok(!(await pg.locator('#pdpVariant').isVisible().catch(()=>false)),'PDF simple : pas de switch');
// Admin compta (avec secret)
await pg.evaluate(()=>{try{sessionStorage.setItem('pt_admin_secret','test')}catch(e){}});
await pg.goto(`${base}/#/admin`,{waitUntil:'networkidle'});await pg.waitForTimeout(800);
ok(await pg.locator('.admin-tab[data-admin-tab="compta"]').count()===1,'admin : onglet Comptabilité');
await pg.locator('.admin-tab[data-admin-tab="compta"]').click();await pg.waitForTimeout(500);
ok(await pg.locator('.compta-card').count()>=6,'compta : cartes devis+veille');
console.log('\nErreurs JS globales:',errs.length?errs.slice(0,5):'AUCUNE');
ok(errs.length===0,'zéro erreur JS sur tous les parcours');
console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await br.close();srv.close();process.exit(fail?1:0);
