import { join, basename } from 'node:path';
import { RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pw = await playwright();
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>srv.listen(8810,r));
const {chromium}=pw;const b=await chromium.launch();const pg=await b.newPage({serviceWorkers:'block'});
let errs=[];pg.on('pageerror',e=>errs.push(e.message));
const A=[];const ok=(c,m)=>{A.push((c?'✅':'❌')+' '+m); if(!c)process.exitCode=1;};
const P=JSON.parse(fs.readFileSync(ROOT+'/products.json','utf8'));
const slug=s=>P.find(y=>y.sku===s).slug;
// DRT50Z : switch standalone +15 (poids 1.x kg ?)
await pg.goto('http://127.0.0.1:8810/index.html#/produit/'+slug('DRT50Z'),{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
let r=await pg.evaluate(()=>({amts:[...document.querySelectorAll('#pdpVariant .pdp-variant__amt')].map(e=>e.textContent),
  specs:document.querySelectorAll('#pdpSpecs tr').length}));
ok(r.amts.length===2, 'DRT50Z : switch standalone présent — '+JSON.stringify(r.amts));
ok(r.specs>=10, 'DRT50Z : specs affichées ('+r.specs+' lignes)');
// DRT50ZJX3 : produit autonome (fiche OK, titre 4 bases)
await pg.goto('http://127.0.0.1:8810/index.html#/produit/'+slug('DRT50ZJX3'),{waitUntil:'networkidle'});
await pg.waitForTimeout(700);
r=await pg.evaluate(()=>({title:document.getElementById('pdpTitle').textContent, amts:[...document.querySelectorAll('#pdpVariant .pdp-variant__amt')].map(e=>e.textContent)}));
ok(/4 bases/.test(r.title), 'DRT50ZJX3 : titre kit 4 bases — '+r.title.slice(0,60));
ok(r.amts.length===2, 'DRT50ZJX3 : option coffret volume dispo (pack en Makpac) — '+JSON.stringify(r.amts));
// visible dans la grille catalogue (recherche)
await pg.goto('http://127.0.0.1:8810/index.html#/catalogue',{waitUntil:'networkidle'});
await pg.waitForTimeout(600);
await pg.fill('#q','DRT50'); await pg.waitForTimeout(600);
const cards=await pg.evaluate(()=>[...document.querySelectorAll('#list .product-card__title')].map(e=>e.textContent));
ok(cards.some(t=>/DRT50ZJX3/.test(t)), 'DRT50ZJX3 visible dans la grille ('+cards.length+' cartes DRT50)');
ok(errs.length===0,'0 erreur JS');
console.log(A.join('\n'));
await b.close();srv.close();
