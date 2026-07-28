// Le bandeau et le point doivent s'allumer ET s'éteindre POUR DE VRAI :
// on mesure les couleurs et la lueur calculées, pas les classes.
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
const src = await readFile(ROOT+'/app.js','utf8');
const grab=(n)=>{const i=src.indexOf('function '+n+'(');if(i<0)throw new Error(n);let d=0,j=src.indexOf('{',i);
  for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const cst=(re)=>{const m=src.match(re);if(!m)throw new Error('cst '+re);return m[0];};
const CODE=[cst(/var LV_TZ_GP_OFFSET = -?\d+;/), cst(/var _HTML_ESCAPES = \{[\s\S]*?\};/),
  grab('escapeHTML'), grab('lvHhmmEnMinutes'), grab('lvMinutesLocalesGP'),
  grab('lvDansPlageHoraire'), grab('lvEnService'), grab('lvHorairesTxt'),
  grab('lvServiceBandeauHTML')].join('\n');

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:800,height:900},deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(base+'/index.html?sv=1',{waitUntil:'domcontentloaded'});
let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

const r = await page.evaluate((CODE)=>{
  eval(CODE);
  const T10 = new Date('2026-07-27T14:00:00Z');   // 10 h en Guadeloupe
  const T20 = new Date('2026-07-28T00:00:00Z');   // 20 h en Guadeloupe
  const cas = [
    { k:'en service', c:{available:true,hDebut:'08:00',hFin:'18:00'}, t:T10 },
    { k:'hors horaires', c:{available:true,hDebut:'08:00',hFin:'18:00'}, t:T20 },
    { k:'interrupteur coupé', c:{available:false,hDebut:'08:00',hFin:'18:00'}, t:T10 },
    { k:'sans horaires, allumé', c:{available:true}, t:T10 }
  ];
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:0;top:0;width:760px;background:#0a0f14;padding:18px;z-index:99999;display:flex;flex-direction:column;gap:10px';
  host.id='__svc';
  host.innerHTML = cas.map(x=>lvServiceBandeauHTML(x.c, x.t)).join('');
  document.body.appendChild(host);
  const lus = [...host.querySelectorAll('.lv-service')].map((el,i)=>{
    const dot = el.querySelector('.lv-service__dot');
    const cs = getComputedStyle(el), cd = getComputedStyle(dot);
    return { k:cas[i].k, txt:el.textContent.replace(/\s+/g,' ').trim(),
      classeOn: el.classList.contains('is-on'),
      fondBandeau: cs.backgroundColor, lueurBandeau: cs.boxShadow,
      fondPoint: cd.backgroundColor, lueurPoint: cd.boxShadow,
      anim: cd.animationName, taillePoint: cd.width };
  });
  return lus;
}, CODE);

r.forEach(x=>console.log('   ' + x.k.padEnd(22) + ' « ' + x.txt.slice(0,52) + ' »'));
const on = r[0], horsH = r[1], off = r[2], sansH = r[3];
console.log('\n— ALLUMÉ —');
T('  en service : bandeau allumé', on.classeOn);
T('  le POINT est vert vif', /52, 211, 153/.test(on.fondPoint), on.fondPoint);
T('  le POINT a une lueur', on.lueurPoint !== 'none' && on.lueurPoint.length > 4, on.lueurPoint.slice(0,44));
T('  le POINT pulse', on.anim === 'lv-pulse', on.anim);
T('  le BANDEAU a une lueur', on.lueurBandeau !== 'none', on.lueurBandeau.slice(0,44));
T('  le BANDEAU est teinté vert', /52, 211, 153/.test(on.fondBandeau), on.fondBandeau);
console.log('\n— ÉTEINT —');
T('  hors horaires : bandeau éteint', !horsH.classeOn);
T('  hors horaires : le point ne pulse plus', horsH.anim === 'none', horsH.anim);
T('  hors horaires : le point n\'a plus de lueur', horsH.lueurPoint === 'none', horsH.lueurPoint);
T('  hors horaires : le bandeau n\'a plus de lueur', horsH.lueurBandeau === 'none');
T('  hors horaires : la RAISON est dite', /horaires/i.test(horsH.txt), horsH.txt.slice(0,60));
T('  interrupteur coupé : éteint, et la raison est dite',
  !off.classeOn && /hors ligne/i.test(off.txt), off.txt.slice(0,60));
T('  sans horaires + allumé : en service', sansH.classeOn);
console.log('\n— LISIBILITÉ —');
T('  le point mesure au moins 10 px', parseFloat(on.taillePoint) >= 10, on.taillePoint);

await page.locator('#__svc').screenshot({path:'/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/service.png'});
console.log('\n'+pass+' OK / '+fail+' KO   → capture : service.png');
await browser.close();server.close();
process.exit(fail?1:0);
