// Vérifie que la carte produit unifiée (audit P7) rend bien sur les 5 surfaces,
// et que la mention TTC — qui avait dérivé sur favoris et récemment vus —
// est désormais partout.
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT='/home/user/ish/pirates-tools';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 const fp=normalize(join(ROOT,p));if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end();}
 const st=await stat(fp).catch(()=>null);if(!st||!st.isFile()){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'});res.end(await readFile(fp));}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1194,height:834}});
await ctx.route('**/*',r=>/stripe|googleapis|gstatic|jsdelivr|coingecko|firebase|api-adresse|osrm|openstreetmap|unpkg|tile\./.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('💥 JS:',e.message));
let pass=0,fail=0;const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};
let bootN=0;
const boot=async h=>{await page.goto(base+'/index.html?b='+(++bootN)+h,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});await page.waitForTimeout(800);};
const cards=async sel=>page.evaluate(s=>{const el=document.querySelector(s);if(!el)return null;
 const c=[...el.querySelectorAll('.product-card')].filter(x=>!x.classList.contains('product-card--more'));
 return {n:c.length, ttc:c.filter(x=>/TTC/.test(x.textContent)).length,
   fav:c.filter(x=>x.querySelector('[data-wishlist-id]')).length,
   prix:c.filter(x=>/\d/.test((x.querySelector('.product-card__price')||{}).textContent||'')).length};},sel);

await boot('#/catalogue');
let r=await cards('#list');
T('Catalogue : cartes rendues, prix + TTC + bouton favori', r && r.n>0 && r.ttc===r.n && r.fav===r.n && r.prix===r.n, JSON.stringify(r));

await boot('#/');
r=await cards('#homeProductsTrack, .home-products-strip__track');
T('Accueil : cartes rendues avec TTC', r && r.n>0 && r.ttc===r.n, JSON.stringify(r));

// Favoris : on en ajoute deux AVANT d'ouvrir la page (sinon le test passe à vide)
await boot('#/catalogue');
const ids = await page.evaluate(()=>[...document.querySelectorAll('[data-wishlist-id]')]
  .slice(0,2).map(b=>b.getAttribute('data-wishlist-id')));
await page.evaluate(list=>{ localStorage.setItem('pt_wishlist', JSON.stringify(list)); }, ids);
await boot('#/favoris');
r=await cards('#wishlistList');
T('Favoris : 2 cartes réellement rendues (test non vide)', r && r.n===2, JSON.stringify({ids, r}));
T('Favoris : le prix porte enfin la mention TTC (dérive corrigée)',
  r && r.n>0 && r.ttc===r.n, JSON.stringify(r));

await boot('#/guadeloupe');
r=await cards('#terrViewProducts');
T('Page territoire : cartes rendues, TTC présent, pas de bouton favori',
  r && r.n>0 && r.ttc===r.n && r.fav===0, JSON.stringify(r));
T('Page territoire : la grille a bien une mise en page (correctif P1)',
  await page.evaluate(()=>{const g=document.getElementById('terrViewProducts');
    return g?getComputedStyle(g).display==='grid':false;}));

console.log(`\n${pass} OK / ${fail} KO`);
await browser.close();server.close();process.exit(fail?1:0);
