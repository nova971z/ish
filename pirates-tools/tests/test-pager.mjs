import { join, basename } from 'node:path';
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}if(u==='/')u='/index.html';const fp=path.join(ROOT,u);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf');}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}`;
const br=await chromium.launch();const pg=await br.newPage({viewport:{width:390,height:844}});
pg.on('console',m=>{if(m.type()==='error')console.log(' [err]',m.text());});
await pg.addInitScript(()=>{window.PT_API_BASE=undefined;});
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log(' ❌',m);}};

await pg.goto(`${base}/#/catalogue`,{waitUntil:'networkidle'});
await pg.waitForTimeout(1000);
const c1=await pg.locator('.product-card').count();
console.log('page 1 cartes:',c1);
ok(c1===40,'exactement 40 cartes en page 1 (DOM borne)');
ok(await pg.locator('#pager').isVisible(),'pager visible');
const nbtn=await pg.locator('#pager .pager__btn[data-page]:not(.pager__nav)').count();
console.log('boutons numeros:',nbtn);

// aller page 2
await pg.locator('#pager .pager__btn[data-page="2"]').click();
await pg.waitForTimeout(400);
const c2=await pg.locator('.product-card').count();
console.log('page 2 cartes:',c2);
ok(c2>0 && c2<=40,'page 2 : DOM toujours <=40 (page precedente retiree)');
ok(await pg.locator('#pager .pager__btn.active[data-page="2"]').count()===1,'bouton 2 actif');

// bouton suivant/precedent
await pg.locator('#pager .pager__btn[data-page="prev"]').click();
await pg.waitForTimeout(300);
ok(await pg.locator('#pager .pager__btn.active[data-page="1"]').count()===1,'prev -> retour page 1');

// filtre Scies -> reset page 1
await pg.locator('.cat-chip',{hasText:'Scies'}).first().click().catch(()=>{});
await pg.waitForTimeout(500);
const cf=await pg.locator('.product-card').count();
console.log('Scies page 1 cartes:',cf);
ok(cf>0 && cf<=40,'apres filtre : <=40 et page 1');
ok(await pg.locator('#pager .pager__btn.active[data-page="1"]').count()===1 || await pg.locator('#pager').isHidden(),'pager reset page 1 (ou masque si <=1 page)');

// total accessible en parcourant les pages (catalogue complet)
await pg.locator('.cat-chip',{hasText:'Tout'}).first().click().catch(()=>{});
await pg.waitForTimeout(400);
const totalPages=await pg.evaluate(()=>Math.ceil(document.querySelectorAll('.product-card').length? (window.__x||0):0,0));
let seen=new Set();
// clic sur derniere page
const lastBtnCount=await pg.locator('#pager .pager__btn[data-page]:not(.pager__nav)').last().textContent();
console.log('derniere page affichee:',lastBtnCount);
ok(parseInt(lastBtnCount,10)>=5,'catalogue complet = plusieurs pages (>=5 pour 185/40)');

console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await br.close();srv.close();process.exit(fail?1:0);
