import { join, basename } from 'node:path';
import { RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pw = await playwright();
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>srv.listen(8802,r));
const {chromium}=pw;const b=await chromium.launch();const pg=await b.newPage({serviceWorkers:'block'});
let errs=[];pg.on('pageerror',e=>errs.push(e.message));
const A=[];const ok=(c,m)=>{A.push((c?'✅':'❌')+' '+m); if(!c)process.exitCode=1;};
// accueil
await pg.goto('http://127.0.0.1:8802/index.html#/',{waitUntil:'networkidle'});
await pg.waitForTimeout(1000);
ok(await pg.evaluate(()=>document.querySelectorAll('#homeProductsTrack .product-card').length)===17,'accueil : 16 cartes + Voir tout');
ok(await pg.evaluate(()=>{const i=document.getElementById('heroLogo');return (i.currentSrc||'').indexOf('webp')!==-1;}),'héros en WebP');
// catalogue
await pg.click('a[href="#/catalogue"]'); await pg.waitForTimeout(800);
ok(await pg.evaluate(()=>document.querySelectorAll('#list .product-card').length)>0,'catalogue peuplé');
// fiche + switch coffret + panier
await pg.goto('http://127.0.0.1:8802/index.html#/produit/makita-dhr283z',{waitUntil:'networkidle'}); await pg.waitForTimeout(800);
await pg.click('#pdpVariant [data-coffret="1"]'); await pg.waitForTimeout(200);
await pg.click('#pdpQuote'); await pg.waitForTimeout(300);
await pg.goto('http://127.0.0.1:8802/index.html#/devis',{waitUntil:'networkidle'}); await pg.waitForTimeout(600);
const sub=await pg.evaluate(()=>{const e=document.querySelector('.devis-item__subtotal');return e?e.textContent.trim():''});
ok(/493[,.]26/.test(sub),'panier : coffret facturé (493,26) — lu '+sub);
ok(errs.length===0,'0 erreur JS sur tout le parcours — '+JSON.stringify(errs.slice(0,2)));
console.log(A.join('\n'));
await b.close();srv.close();
