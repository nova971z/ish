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
await pg.waitForTimeout(1200);
const total=await pg.evaluate(()=>window.__ptDebug?0:document.querySelectorAll('.product-card').length);
const initial=await pg.locator('.product-card').count();
console.log('cartes au chargement:',initial);
ok(initial>0 && initial<=35,'lot initial <=35 (rendu progressif actif), pas 185');
const hasSentinel=await pg.locator('#gridSentinel').count();
ok(hasSentinel===1,'sentinelle presente');

// scroll progressif jusqu'en bas, en verifiant que ca s'ajoute
let last=initial;
for(let i=0;i<12;i++){
  await pg.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await pg.waitForTimeout(350);
  const n=await pg.locator('.product-card').count();
  if(n===last && (await pg.locator('#gridSentinel').count())===0) break;
  last=n;
}
const finalCount=await pg.locator('.product-card').count();
console.log('cartes apres scroll complet:',finalCount);
ok(finalCount>=180,'toutes les cartes accessibles au scroll (>=180)');
ok((await pg.locator('#gridSentinel').count())===0,'sentinelle retiree a la fin');

// filtre -> reset (categorie Scies)
await pg.evaluate(()=>window.scrollTo(0,0));
await pg.locator('.cat-chip',{hasText:'Scies'}).first().click().catch(()=>{});
await pg.waitForTimeout(600);
const afterFilter=await pg.locator('.product-card').count();
console.log('cartes apres filtre Scies (lot initial):',afterFilter);
ok(afterFilter>0 && afterFilter<=35,'filtre => repart sur un lot initial (pas cumul)');

console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await br.close();srv.close();process.exit(fail?1:0);
