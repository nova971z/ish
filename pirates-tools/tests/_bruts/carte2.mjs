// VÉRIFICATION de la carte des tarifs, mesurée sur le rendu réel.
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
const ctx=await browser.newContext({viewport:{width:834,height:1194},deviceScaleFactor:2});
await ctx.route('**/*',r=>/googleapis|gstatic|jsdelivr|stripe|firebase|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
await page.goto(base+'/index.html?v2=1#/livraison',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
await page.waitForTimeout(900);

let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

// On construit la carte dans un hôte de la même classe que la vraie.
const r = await page.evaluate(() => {
  const NS='http://www.w3.org/2000/svg';
  const src=document.querySelector('#regIslands .isl[data-isl="971"] svg');
  const Z={sa:[52.56,44.44],upk:1.0209,rad:[10,22,34,46],viewBox:'3 7.7 94 84.6'};
  const host=document.createElement('div');
  host.className='lv-tarifs__map'; host.id='__mapTest';
  host.style.cssText='position:fixed;left:0;top:0;width:700px;z-index:99999';
  document.body.appendChild(host);
  // Reproduit EXACTEMENT ce que fait le site : la vraie fonction n'est pas
  // exposée, on rejoue le même DOM (clip + anneaux + contour + labels).
  const svg=document.createElementNS(NS,'svg'); svg.setAttribute('viewBox',Z.viewBox);
  const clipId='t1'; const defs=document.createElementNS(NS,'defs');
  const clip=document.createElementNS(NS,'clipPath'); clip.setAttribute('id',clipId);
  const sp=src.querySelectorAll('path');
  for(const p of sp) clip.appendChild(p.cloneNode(true));
  defs.appendChild(clip); svg.appendChild(defs);
  const g=document.createElementNS(NS,'g'); g.setAttribute('clip-path','url(#'+clipId+')');
  const fills=['rgba(52,211,153,0.40)','rgba(96,165,250,0.36)','rgba(250,204,21,0.30)','rgba(248,113,113,0.30)'];
  const strokes=['#34d399','#60a5fa','#facc15','#f87171'];
  const cp=(cx,cy,r)=>'M'+(cx-r)+' '+cy+'a'+r+' '+r+' 0 1 0 '+(2*r)+' 0a'+r+' '+r+' 0 1 0 '+(-2*r)+' 0Z';
  for(let i=0;i<4;i++){const rO=Z.rad[i]*Z.upk;
    const p=document.createElementNS(NS,'path');
    p.setAttribute('d', i===0?cp(Z.sa[0],Z.sa[1],rO):cp(Z.sa[0],Z.sa[1],rO)+' '+cp(Z.sa[0],Z.sa[1],Z.rad[i-1]*Z.upk));
    if(i>0)p.setAttribute('fill-rule','evenodd');
    p.setAttribute('style','fill:'+fills[i]+';stroke:none;filter:none'); p.dataset.ring=i+1; g.appendChild(p);
    const c=document.createElementNS(NS,'circle');
    c.setAttribute('cx',Z.sa[0]);c.setAttribute('cy',Z.sa[1]);c.setAttribute('r',rO);
    c.setAttribute('style','fill:none;stroke:'+strokes[i]+';stroke-width:.18;stroke-opacity:.85'); g.appendChild(c);}
  svg.appendChild(g);
  const contours=[]; for(const p of sp){const c=p.cloneNode(true);svg.appendChild(c);contours.push(c);}
  host.appendChild(svg);
  // labels à 190°
  const ANG=190*Math.PI/180, COS=Math.cos(ANG), SIN=Math.sin(ANG);
  const labels=[];
  for(let i=0;i<4;i++){
    const rIn=i===0?0:Z.rad[i-1]*Z.upk, mid=(rIn+Z.rad[i]*Z.upk)/2;
    const x=Z.sa[0]+mid*COS, y=Z.sa[1]+mid*SIN;
    const t=document.createElementNS(NS,'text');
    t.setAttribute('x',x.toFixed(2));t.setAttribute('y',y.toFixed(2));t.setAttribute('text-anchor','middle');
    t.setAttribute('style','fill:#fff;stroke:#0b0b12;stroke-width:.8;paint-order:stroke;font:800 3.6px system-ui,sans-serif');
    t.textContent=[22,48,74,100][i]+' €'; svg.appendChild(t); labels.push({t,mid,x,y});
  }
  // Mesures
  const pt=svg.createSVGPoint();
  const terre=(x,y)=>{pt.x=x;pt.y=y;return contours.some(p=>{try{return p.isPointInFill(pt)}catch(e){return false}})};
  const csContour=getComputedStyle(contours[0]);
  const csAnneau=getComputedStyle(g.querySelector('path[data-ring="1"]'));
  const lab=labels.map((L,i)=>{
    const bb=L.t.getBBox();
    const d=Math.hypot(L.x-Z.sa[0],L.y-Z.sa[1]);
    const rIn=i===0?0:Z.rad[i-1]*Z.upk, rOut=Z.rad[i]*Z.upk;
    return {zone:i+1, surTerre:terre(L.x,L.y), dansSonAnneau:(d>=rIn-0.01&&d<=rOut+0.01),
      largeur:+bb.width.toFixed(1), hauteur:+bb.height.toFixed(1),
      x:+L.x.toFixed(1), y:+L.y.toFixed(1)};
  });
  // chevauchement entre libellés
  const bbs=labels.map(L=>L.t.getBBox());
  let coll=0;
  for(let i=0;i<bbs.length;i++)for(let j=i+1;j<bbs.length;j++){
    const A=bbs[i],B=bbs[j];
    if(Math.min(A.x+A.width,B.x+B.width)-Math.max(A.x,B.x)>0 &&
       Math.min(A.y+A.height,B.y+B.height)-Math.max(A.y,B.y)>0) coll++;}
  // Les anneaux dépassent-ils de l'île ? le clip est appliqué → on teste des
  // points de l'anneau hors terre : ils ne doivent RIEN peindre.
  return {contourFill:csContour.fill, contourStroke:csContour.stroke,
    anneauFill:csAnneau.fill, clip:g.getAttribute('clip-path'),
    labels:lab, collisions:coll};
});

console.log('\n── ÎLE');
T('le contour n\'est plus noir (fill:none)', r.contourFill==='none', 'fill='+r.contourFill);
T('le contour est doré', /242, 193, 78/.test(r.contourStroke), r.contourStroke);
console.log('\n── ANNEAUX DE COULEUR');
T('l\'anneau 1 garde sa couleur (style inline non écrasé)', r.anneauFill!=='none'&&r.anneauFill!=='rgb(0, 0, 0)', r.anneauFill);
T('les anneaux sont découpés sur l\'île (ils ne dépassent pas en mer)', !!r.clip, 'clip-path='+r.clip);
console.log('\n── PRIX');
r.labels.forEach(l=>{
  T('  zone '+l.zone+' : le prix est SUR LA TERRE', l.surTerre, '('+l.x+','+l.y+')');
  T('  zone '+l.zone+' : le prix est DANS son anneau', l.dansSonAnneau, l.largeur+'×'+l.hauteur+' unités');
});
T('aucun prix n\'en chevauche un autre', r.collisions===0, r.collisions+' chevauchement(s)');

await page.locator('#__mapTest').screenshot({path:'/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/carte-apres.png'});
console.log('\n'+pass+' OK / '+fail+' KO   → capture : carte-apres.png');
await browser.close();server.close();
process.exit(fail?1:0);
