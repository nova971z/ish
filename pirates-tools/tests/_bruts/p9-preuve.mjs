// PREUVE DE FAILLIBILITÉ — un détecteur faussement vert est pire que pas de
// détecteur. On réintroduit VOLONTAIREMENT les 3 défauts que P9 doit voir et
// on exige qu'il les voie ; puis on retire et on exige qu'il redevienne vert.
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT='/home/user/ish/pirates-tools';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 const fp=normalize(join(ROOT,p));if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end();}
 const st=await stat(fp).catch(()=>null);if(!st||!st.isFile()){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'});res.end(await readFile(fp));}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:834,height:1194}});
await ctx.route('**/*',r=>/googleapis|gstatic|jsdelivr|stripe|firebase|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
await page.goto(base+'/index.html?p=1',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
await page.waitForTimeout(800);

let ok=0,ko=0;
const T=(n,c)=>{c?ok++:ko++;console.log((c?'✅':'❌')+' '+n);};

// ── 1. NOM ACCESSIBLE : bouton sans texte ni aria-label ───────────────────
const sansNom = async () => page.evaluate(() => {
  let n=0;
  document.querySelectorAll('button, a[href], input, select, textarea').forEach((el)=>{
    if(!el.offsetParent && getComputedStyle(el).position!=='fixed') return;
    if(el.getAttribute('aria-hidden')==='true'||el.closest('[aria-hidden="true"]')) return;
    if(el.tabIndex<0) return;
    const img=el.querySelector&&el.querySelector('img[alt]');
    const c=[el.getAttribute('aria-label'),el.getAttribute('title'),
      (el.labels&&el.labels.length?el.labels[0].textContent:''),el.textContent,
      el.getAttribute('alt'),(img?img.getAttribute('alt'):''),el.getAttribute('placeholder')];
    if(!c.map(x=>(x||'').trim()).find(x=>x)) n++;
  });
  return n;
});
T('état sain : 0 élément sans nom accessible', (await sansNom())===0);
await page.evaluate(()=>{const b=document.createElement('button');b.id='__mauvais';
  b.style.cssText='width:40px;height:40px';document.body.appendChild(b);});
T('défaut réintroduit (bouton muet) → DÉTECTÉ', (await sansNom())===1);
await page.evaluate(()=>document.getElementById('__mauvais').remove());
T('défaut retiré → redevient vert', (await sansNom())===0);

// ── 2. CIBLE TACTILE : petit bouton isolé, sans équivalent ────────────────
const petites = async () => page.evaluate(() => {
  const els=[...document.querySelectorAll('button, a[href], input, select')]
    .filter(el=>el.offsetParent&&el.getBoundingClientRect().width>0);
  const boxes=els.map(el=>{const b=el.getBoundingClientRect();
    return{el,cx:b.x+b.width/2,cy:b.y+b.height/2,w:b.width,h:b.height};});
  const enLigne=(el)=>{if(el.tagName!=='A')return false;const p=el.parentElement;if(!p)return false;
    return getComputedStyle(el).display==='inline'&&[...p.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1);};
  const EQUIV=[{cls:'tools-3d-dot',par:'.tools-3d-prev, .tools-3d-next'}];
  const equiv=(el)=>EQUIV.some(e=>el.classList.contains(e.cls)&&[...document.querySelectorAll(e.par)]
    .some(c=>{const b=c.getBoundingClientRect();return c.offsetParent&&b.width>=24&&b.height>=24;}));
  const ko=[];
  boxes.forEach(a=>{ if(a.w>=24&&a.h>=24)return; if(enLigne(a.el))return; if(equiv(a.el))return;
    if(!boxes.some(b=>b!==a&&Math.hypot(a.cx-b.cx,a.cy-b.cy)<24))return;
    ko.push(Math.round(a.w)+'×'+Math.round(a.h)); });
  return ko.length;
});
T('état sain : 0 cible sous 24px sans espacement ni équivalent', (await petites())===0);
await page.evaluate(()=>{const d=document.createElement('div');d.id='__petits';
  d.style.cssText='position:fixed;top:300px;left:300px;display:flex;gap:2px;z-index:5';
  d.innerHTML='<button style="width:12px;height:12px">a</button><button style="width:12px;height:12px">b</button>';
  document.body.appendChild(d);});
T('défaut réintroduit (2 cibles 12×12 collées) → DÉTECTÉ', (await petites())===2);
await page.evaluate(()=>document.getElementById('__petits').remove());
T('défaut retiré → redevient vert', (await petites())===0);

// ── 3. EXCEPTION « Équivalent » : elle DOIT tomber si l'équivalent disparaît ─
const dotsKo = async () => page.evaluate(() => {
  const EQUIV=[{cls:'tools-3d-dot',par:'.tools-3d-prev, .tools-3d-next'}];
  const equiv=(el)=>EQUIV.some(e=>el.classList.contains(e.cls)&&[...document.querySelectorAll(e.par)]
    .some(c=>{const b=c.getBoundingClientRect();return c.offsetParent&&b.width>=24&&b.height>=24;}));
  return [...document.querySelectorAll('.tools-3d-dot')].filter(d=>!equiv(d)).length;
});
T('pastilles couvertes tant que les flèches existent', (await dotsKo())===0);
await page.evaluate(()=>{document.querySelectorAll('.tools-3d-arrow').forEach(a=>a.style.display='none');});
T('flèches masquées → l\'exception TOMBE, les 10 pastilles redeviennent des défauts', (await dotsKo())===10);
await page.evaluate(()=>{document.querySelectorAll('.tools-3d-arrow').forEach(a=>a.style.display='');});
T('flèches rétablies → exception de nouveau valable', (await dotsKo())===0);

console.log('\n'+(ko?'❌ '+ko+' preuve(s) en échec':'✅ '+ok+'/'+ok+' — les contrôles P9 sont capables d\'échouer'));
await browser.close();server.close();
process.exit(ko?1:0);
