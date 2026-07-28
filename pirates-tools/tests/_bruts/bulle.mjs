// BULLE DE DISCUSSION : accessible partout, rien chargé avant le 1er clic.
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
let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

const MSGS=[
  {uid:'systeme',role:'systeme',at:{toMillis:()=>1000},round:1,text:'Course acceptée par Nova.'},
  {uid:'moi',role:'client',at:{toMillis:()=>2000},round:1,text:'Bonjour, tu passes ce matin ?'},
  {uid:'autre',role:'livreur',at:{toMillis:()=>3000},round:1,text:'Oui, vers 9h.'}
];
const COURSES={ok:true,courier:true,dispo:[],mine:[
  {id:'c1',mine:true,chatOpen:true,round:1,status:'acceptee',courierName:'Nova',address:'Rue des Palmiers, Le Gosier',zone:1,km:5,when:'matin'}]};
const CONVS={ok:true,conversations:[{id:'moi_u9',role:'client',courierUid:'u9',courierName:'Kevin L.',lastAt:1}]};

const ctx=await browser.newContext({viewport:{width:900,height:1000},deviceScaleFactor:2});
await ctx.route('**/*',r=>/googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
let appelsAvantClic = 0;
await page.route('**/api/contact', route=>{
  const b=JSON.parse(route.request().postData()||'{}');
  if (['course-list','conv-list'].includes(b.type)) appelsAvantClic++;
  const rep = b.type==='course-list'?COURSES : b.type==='conv-list'?CONVS
    : b.type==='courier-status'?{ok:true,courier:false} : {ok:true};
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rep)});
});
await page.addInitScript((MSGS)=>{
  const USER={uid:'moi',email:'justforwada@icloud.com',getIdToken:()=>Promise.resolve('t')};
  window.__envois=[];
  window.PT_FIREBASE={configured:true,auth:{},db:{},
    onAuthStateChanged:(a,cb)=>{setTimeout(()=>cb(USER),0);return()=>{};},
    doc:()=>({}),getDoc:()=>Promise.resolve({exists:()=>false}),setDoc:()=>Promise.resolve(),
    updateDoc:()=>Promise.resolve(),
    collection:function(){const a=[].slice.call(arguments);return{path:a.slice(1).join('/')};},
    addDoc:(col,d)=>{window.__envois.push({path:col.path,d});return Promise.resolve({id:'x'});},
    getDocs:()=>Promise.resolve({forEach:()=>{}}),
    query:(c)=>c, orderBy:()=>{window.__orderBy=true;return{};},
    where:(f,o,v)=>{window.__where={f,o,v};return{};}, limit:()=>({}),
    onSnapshot:(q,cb)=>{setTimeout(()=>cb({forEach:(fn)=>MSGS.forEach(m=>fn({data:()=>m}))}),0);return()=>{};},
    serverTimestamp:()=>new Date()};
}, MSGS);

const boot=async(h)=>{ appelsAvantClic=0;
  await page.goto(base+'/index.html?bl='+Math.random().toString(36).slice(2)+h,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(900); };

console.log('\n━━ LA BULLE EST LÀ, ET NE COÛTE RIEN AU DÉMARRAGE ━━');
await boot('#/');
let r = await page.evaluate(()=>{
  const b=document.getElementById('chatBubble'); const w=document.getElementById('chatWin');
  const rb=b?b.getBoundingClientRect():null;
  return { visible:!!b&&!b.hidden, fenetreFermee:!!w&&w.hidden,
    x:rb?Math.round(rb.x):null, bas:rb?Math.round(window.innerHeight-rb.bottom):null,
    taille:rb?Math.round(rb.width):null };
});
T('la bulle est visible', r.visible);
T('elle est À GAUCHE', r.x !== null && r.x < 60, 'x='+r.x);
T('elle est assez grande pour être touchée', r.taille>=48, r.taille+'px');
T('la fenêtre est fermée au départ', r.fenetreFermee);
// Ce qui compte vraiment : que RIEN ne la recouvre. Le bandeau cookies est
// fixé en bas et pleine largeur — il l'avalait (défaut trouvé ici même).
// La bulle s'écarte donc au-dessus de lui tant qu'il est affiché.
r = await page.evaluate(()=>{
  const b=document.getElementById('chatBubble'); const bb=b.getBoundingClientRect();
  const cx=bb.x+bb.width/2, cy=bb.y+bb.height/2;
  const dessus=document.elementFromPoint(cx,cy);
  const bar=document.getElementById('consentBar');
  const hb=(bar && !bar.hidden) ? Math.round(bar.getBoundingClientRect().height) : 0;
  return { atteignable: !!dessus && (dessus===b || b.contains(dessus)),
    quiRecouvre: dessus ? (dessus.id||dessus.className||dessus.tagName).toString().slice(0,30) : null,
    basBulle: Math.round(window.innerHeight-bb.bottom), hauteurBandeau: hb,
    auDessusDuBandeau: Math.round(window.innerHeight-bb.bottom) >= hb };
});
T('RIEN ne la recouvre (elle est cliquable)', r.atteignable, 'au point : '+r.quiRecouvre);
T('elle passe au-dessus du bandeau cookies', r.auDessusDuBandeau,
  'bas='+r.basBulle+'px · bandeau='+r.hauteurBandeau+'px');
T('AUCUN appel réseau de discussion avant le clic', appelsAvantClic===0, appelsAvantClic+' appel(s)');

console.log('\n━━ 1er CLIC : la liste des discussions ━━');
await page.click('#chatBubble');
await page.waitForTimeout(700);
r = await page.evaluate(()=>({
  ouverte: !document.getElementById('chatWin').hidden,
  titre:(document.getElementById('chatWinTitle')||{}).textContent,
  items:[...document.querySelectorAll('.chat-item__t')].map(e=>e.textContent),
  compteur:(document.getElementById('chatBubbleCount')||{}).textContent,
  envoiCache: !!document.getElementById('chatWinSend').hidden
}));
T('la fenêtre s\'ouvre', r.ouverte);
T('elle liste les DEUX types de discussion', r.items.length===2, JSON.stringify(r.items));
T('  la course y est', r.items.some(t=>/Nova/.test(t)));
T('  la discussion directe y est', r.items.some(t=>/Kevin/.test(t)));
T('la pastille affiche le nombre', r.compteur==='2', r.compteur);
T('pas de champ de saisie sur la liste', r.envoiCache);
T('les appels ne partent QU\'au clic', appelsAvantClic===2, appelsAvantClic+' appel(s)');

console.log('\n━━ OUVRIR UN FIL ━━');
await page.click('.chat-item');
await page.waitForTimeout(600);
r = await page.evaluate(()=>({
  titre:(document.getElementById('chatWinTitle')||{}).textContent,
  bulles:[...document.querySelectorAll('#chatWinBody .lv-msg')].map(e=>({c:e.className,t:e.textContent.trim().slice(0,26)})),
  retour: !document.getElementById('chatWinBack'),
  envoi: !document.getElementById('chatWinSend').hidden,
  where: window.__where, orderBy: !!window.__orderBy
}));
T('le titre devient celui du fil', /Nova/.test(r.titre||''), r.titre);
T('LES MESSAGES S\'AFFICHENT', r.bulles.length===3, JSON.stringify(r.bulles.map(b=>b.t)));
T('le message système est distingué', /lv-msg--sys/.test(r.bulles[0]?.c||''));
T('mon message est du bon côté', /lv-msg--me/.test(r.bulles[1]?.c||''));
T('celui de l\'autre aussi', /lv-msg--them/.test(r.bulles[2]?.c||''));
T('le champ de saisie apparaît', r.envoi);
T('PAS de bouton retour (la croix suffit)', r.retour);
T('la course filtre bien sur le round', r.where && r.where.f==='round' && r.where.v===1, JSON.stringify(r.where));
T('AUCUN orderBy (pas d\'index composite requis)', r.orderBy===false);

await page.fill('#chatWinInput','Je suis sur place');
await page.click('#chatWinGo');
await page.waitForTimeout(400);
r = await page.evaluate(()=>({env:window.__envois, champ:(document.getElementById('chatWinInput')||{}).value}));
T('l\'envoi part au bon endroit', r.env.length===1 && r.env[0].path==='courses/c1/messages', r.env[0]?.path);
T('avec mon uid, mon rôle et le round', r.env[0]?.d.uid==='moi' && r.env[0]?.d.role==='client' && r.env[0]?.d.round===1,
  JSON.stringify(r.env[0]?.d));
T('le champ est vidé', r.champ==='');

// 🐛 « les messages se touchent entre eux » : on mesure l'écart RÉEL entre
// bulles voisines, pas la présence d'une classe.
r = await page.evaluate(()=>{
  const b=[...document.querySelectorAll('#chatWinBody .lv-msg')];
  const ecarts=[];
  for(let i=0;i<b.length-1;i++){
    const A=b[i].getBoundingClientRect(), B=b[i+1].getBoundingClientRect();
    ecarts.push(+(B.top-A.bottom).toFixed(1));
  }
  return { ecarts, mini: ecarts.length?Math.min(...ecarts):null };
});
T('les messages NE se touchent PLUS', r.mini !== null && r.mini >= 4,
  'écarts : '+JSON.stringify(r.ecarts)+' px');

console.log('\n━━ RETOUR ET FERMETURE ━━');
await page.click('#chatWinClose'); await page.waitForTimeout(300);
T('la croix ferme la fenêtre', await page.evaluate(()=>!!document.getElementById('chatWin').hidden));
await page.click('#chatBubble'); await page.waitForTimeout(700);
r = await page.evaluate(()=>({titre:(document.getElementById('chatWinTitle')||{}).textContent,
  items:document.querySelectorAll('.chat-item').length}));
T('rouvrir repart de la LISTE (pas besoin de bouton retour)',
  /Mes discussions/.test(r.titre||'') && r.items===2, r.titre+' · '+r.items+' fil(s)');
await page.click('#chatWinClose'); await page.waitForTimeout(200);

console.log('\n━━ ELLE SUIT PARTOUT ━━');
for (const h of ['#/catalogue','#/mes-livraisons','#/livraison']) {
  await boot(h);
  T('  présente sur '+h, await page.evaluate(()=>!document.getElementById('chatBubble').hidden));
}
await page.locator('body').screenshot({path:'/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/bulle.png'}).catch(()=>{});
console.log('\n'+pass+' OK / '+fail+' KO');
await browser.close();server.close();
process.exit(fail?1:0);
