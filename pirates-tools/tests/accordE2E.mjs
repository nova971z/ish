// DE BOUT EN BOUT : le livreur ouvre le panneau accord, clique « J'accepte »,
// et on capture la requete HTTP REELLEMENT envoyee. Puis on la rejoue contre
// la VRAIE fonction serveur. Aucun maillon n'est suppose.
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
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

// Situation EXACTE de l'user : meme compte des deux cotes. SPEC A JOUR
// (28/07/2026) : c'est le LIVREUR qui propose le prix — il signe donc d'office
// (okLivreur), et c'est le CLIENT qui accepte. L'ancien etat « propose par le
// client » n'est plus atteignable.
const C={id:'c1',mine:true,acceptedByMe:true,chatOpen:true,round:1,status:'acceptee',
  courierUid:'moi',courierName:'Nova tools',address:'Vieux-Habitants',zone:4,km:43.4,
  productTitle:'Quincaillerie #0002',qty:1,when:'heure',hour:'21:05',date:'2026-07-28',
  code:'213286',lines:[],
  accord:{prix:100,paiement:'especes',date:'2026-07-28',hour:'21:05',lieu:'devant la boulangerie',
    notes:'celle du bourg',proposeBy:'moi',proposeRole:'livreur',okClient:false,okLivreur:true,valide:false}};
const COURSES={ok:true,courier:true,dispo:[],mine:[C]};
const PROFIL={uid:'moi',displayName:'Nova tools',commune:'Sainte-Anne',vehicle:'scooter',
  tarifs:{1:22,2:48,3:74,4:100},hDebut:'00:00',hFin:'23:30',available:true,published:true,
  coursesDone:0,ratingCount:0,ratingSum:0};

const ctx=await browser.newContext({viewport:{width:1000,height:1300}});
await ctx.route('**/*',r=>/googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
page.on('pageerror', e=>console.log('💥 JS :', e.message));
const envoyees=[];
await page.route('**/api/contact', route=>{
  const b=JSON.parse(route.request().postData()||'{}');
  envoyees.push(b);
  const rep=b.type==='course-list'?COURSES:b.type==='conv-list'?{ok:true,conversations:[]}
    :b.type==='courier-status'?{ok:true,courier:true}
    :b.type==='courier-profile'?{ok:true,courier:true,profile:PROFIL,repere:{1:22,2:48,3:74,4:100}}
    :b.type==='course-accord-accept'?{ok:true,valide:true}:{ok:true};
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rep)});
});
await page.addInitScript(()=>{
  const USER={uid:'moi',email:'justforwada@icloud.com',getIdToken:()=>Promise.resolve('t')};
  window.PT_COURIERS_FIXTURE=[];
  window.PT_FIREBASE={configured:true,auth:{},db:{},
    onAuthStateChanged:(a,cb)=>{setTimeout(()=>cb(USER),0);return()=>{};},
    doc:()=>({}),getDoc:()=>Promise.resolve({exists:()=>false}),setDoc:()=>Promise.resolve(),
    updateDoc:()=>Promise.resolve(),collection:function(){const a=[].slice.call(arguments);return{path:a.slice(1).join('/')};},
    addDoc:()=>Promise.resolve({id:'x'}),getDocs:()=>Promise.resolve({forEach:()=>{}}),
    query:(c)=>c,orderBy:()=>({}),where:()=>({}),limit:()=>({}),
    onSnapshot:(q,cb)=>{setTimeout(()=>cb({forEach:()=>{}}),0);return()=>{};},serverTimestamp:()=>new Date()};
});

console.log('\n━━ CÔTÉ LIVREUR : du clic à la requête HTTP ━━');
await page.goto(base+'/index.html?ae=1#/mode-livraison',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
await page.waitForTimeout(1200);
await page.evaluate(()=>{
  // Course EN COURS → signet orange (user 28/07/2026) ; terminée → historique.
  const b = document.querySelector('#courierEnCours .lv-signet')
    || (()=>{ const h=document.querySelector('#courierWork details.lv-histo'); if(h) h.open=true;
              return h && h.querySelector('[data-course-focus]'); })();
  if (b) b.click();
});
await page.waitForTimeout(700);

let r = await page.evaluate(()=>{
  const det=document.getElementById('courierDetail');
  return { ouvert: det && !det.hidden,
    boutons:[...det.querySelectorAll('[data-cpanel]')].map(b=>b.getAttribute('data-cpanel')),
    panneauFerme: !!det.querySelector('#lvChatPanel').hidden };
});
T('le détail du livreur s\'ouvre', r.ouvert);
T('le bouton « L\'accord » est présent', r.boutons.includes('accord'), JSON.stringify(r.boutons));
T('les panneaux sont fermés à l\'arrivée', r.panneauFerme);

await page.click('#courierDetail [data-cpanel="accord"]');
await page.waitForTimeout(500);
r = await page.evaluate(()=>{
  const p=document.getElementById('lvChatPanel');
  return { ouvert: !p.hidden, titre:(p.querySelector('.lv-panel__t')||{}).textContent,
    accepte: !!p.querySelector('#acAccept'), prix: !!p.querySelector('#acPrix'),
    maj: !!p.querySelector('#acPropose'),
    signature:(p.querySelector('.lv-accord__sign')||{}).textContent };
});
T('le clic ouvre le panneau accord', r.ouvert, r.titre);
// SPEC RENVERSÉE (user 28/07/2026) : c'est le LIVREUR qui propose le prix — il
// signe donc d'office, et n'a jamais de bouton « J'accepte ». Tant que le
// client n'a pas accepté, il peut en revanche MODIFIER son prix (fenêtre de
// négociation). Détail : plan11.mjs.
T('le livreur n\'a pas de bouton « J\'accepte » (c\'est lui qui propose)', r.accepte === false, r.signature);
T('il peut MODIFIER son prix tant que le client n\'a pas accepté',
  r.prix === true && r.maj === true, JSON.stringify({ prix: r.prix, maj: r.maj }));

// L'ACCEPTATION EST DÉSORMAIS UN GESTE DU CLIENT (le livreur, lui, propose).
// On la déclenche donc depuis l'écran client, qui déclare le rôle « client ».
await page.goto(base+'/index.html?ae=1b#/mes-livraisons',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
await page.waitForTimeout(1300);
await page.evaluate(()=>{ const s=document.querySelector('#clientDelivEnCours .lv-signet'); if(s) s.click(); });
await page.waitForTimeout(700);
await page.evaluate(()=>{ const b=document.querySelector('#clientDelivDetail [data-cpanel="accord"]'); if(b) b.click(); });
await page.waitForTimeout(500);
const cAcc = await page.evaluate(()=>({
  accepte: !!document.querySelector('#lvChatPanel #acAccept'),
  prix: !!document.querySelector('#lvChatPanel #acPrix')
}));
T('côté CLIENT : le bouton « J\'accepte ce prix » est là', cAcc.accepte === true, JSON.stringify(cAcc));
T('côté CLIENT : aucun champ de prix (il n\'en propose jamais)', cAcc.prix === false);
const avant = envoyees.length;
await page.click('#acAccept');
await page.waitForTimeout(800);
const req = envoyees.slice(avant).filter(b=>b.type==='course-accord-accept')[0];
T('LA REQUÊTE PART', !!req, JSON.stringify(req||envoyees.slice(avant)));
T('  elle porte le bon type', req && req.type==='course-accord-accept');
T('  elle porte l\'id de la course', req && req.id==='c1', req&&req.id);
T('  ⚠️ elle DÉCLARE le rôle « client »', req && req.role==='client', 'role='+(req&&req.role));

console.log('\n━━ UN ÉCHEC DOIT ÊTRE IMPOSSIBLE À MANQUER ━━');
await page.unroute('**/api/contact');
await page.route('**/api/contact', route=>{
  const b=JSON.parse(route.request().postData()||'{}');
  if (b.type==='course-accord-accept') return route.fulfill({status:429,contentType:'application/json',
    body:JSON.stringify({ok:false,error:'Trop de requêtes. Réessaie dans quelques minutes.'})});
  const rep=b.type==='course-list'?COURSES:b.type==='conv-list'?{ok:true,conversations:[]}
    :b.type==='courier-status'?{ok:true,courier:true}
    :b.type==='courier-profile'?{ok:true,courier:true,profile:PROFIL,repere:{1:22,2:48,3:74,4:100}}:{ok:true};
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rep)});
});
// L'acceptation est un geste du CLIENT : c'est donc son écran qui doit rendre
// l'échec impossible à manquer.
await page.goto(base+'/index.html?ae=2#/mes-livraisons',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
await page.waitForTimeout(1300);
await page.evaluate(()=>{ const s=document.querySelector('#clientDelivEnCours .lv-signet'); if(s) s.click(); });
await page.waitForTimeout(700);
await page.evaluate(()=>{ const b=document.querySelector('#clientDelivDetail [data-cpanel="accord"]'); if(b) b.click(); });
await page.waitForTimeout(400);
await page.click('#acAccept');
await page.waitForTimeout(800);
r = await page.evaluate(()=>{
  const e=document.querySelector('#lvChatPanel .lv-erreur');
  const t=document.getElementById('toasts');
  return { bloc: e? e.textContent.trim() : null,
    hauteur: e? Math.round(e.getBoundingClientRect().height) : 0,
    toast: t? t.textContent.trim() : '' };
});
T('l\'échec s\'affiche EN GRAND dans le panneau', !!r.bloc && r.hauteur>=24,
  (r.bloc||'aucun bloc').slice(0,60)+' · '+r.hauteur+'px');
T('  il nomme la cause ET le code', /Trop de requêtes/.test(r.bloc||'') && /429/.test(r.bloc||''), r.bloc);
T('  un message flottant le double', /Trop de requêtes/.test(r.toast||''), r.toast.slice(0,50));

console.log('\n━━ LA MÊME REQUÊTE, REJOUÉE CONTRE LE VRAI SERVEUR ━━');
await browser.close(); server.close();

// Rejeu serveur
const path=await import('node:path'); const Module=(await import('node:module')).default;
process.env.RESEND_API_KEY='t'; process.env.OWNER_EMAIL='o@x.invalid';
const STORE={'courses/c1':JSON.parse(JSON.stringify({artisanUid:'moi',courierUid:'moi',status:'acceptee',
  round:1,artisanEmail:'justforwada@icloud.com',courierEmail:'justforwada@icloud.com',chatOpen:true,lines:[],
  accord:C.accord}))};
function ref(coll,id){const k=coll+'/'+id;return{
  get:async()=>({exists:!!STORE[k],data:()=>STORE[k]||{},id}),
  set:async(v,o)=>{STORE[k]=(o&&o.merge)?Object.assign({},STORE[k]||{},v):v;},
  update:async(v)=>{STORE[k]=Object.assign({},STORE[k]||{},v);},
  collection:()=>({add:async()=>({id:'m'})})};}
const db={collection:(c)=>({doc:(id)=>ref(c,id),add:async()=>({id:'x'}),
  where:()=>({limit:()=>({get:async()=>({forEach:()=>{}})})}),
  orderBy:()=>({limit:()=>({get:async()=>({forEach:()=>{}})})}),
  limit:()=>({get:async()=>({forEach:()=>{}})})}),
  runTransaction:async(fn)=>fn({get:(r)=>r.get(),update:(r,v)=>r.update(v),set:(r,v,o)=>r.set(v,o)})};
const admin={auth:()=>({getUser:async()=>({email:'justforwada@icloud.com'})}),
  firestore:{FieldValue:{serverTimestamp:()=>new Date()}}};
const vraiResolve=Module._resolveFilename, vraiLoad=Module._load, FAUX={};
FAUX[path.join(ROOT,'api/_lib/firebase.js')]={getFirebase:()=>({admin,db}),
  verifyUid:async(rq)=>rq.headers.authorization?'moi':null,
  // Identité complète (28/07/2026) : le serveur exige une adresse VÉRIFIÉE sur
  // les actions engageantes. Le compte de ce rejeu est vérifié.
  verifyIdentity:async(rq)=>rq.headers.authorization
    ? { uid:'moi', email:'justforwada@icloud.com', emailVerified:true } : null,
  verifyAdmin:async()=>false};
FAUX[path.join(ROOT,'api/_lib/ratelimit.js')]={allow:async()=>true,clientIp:()=>'1.2.3.4'};
Module._load=function(rq,p,m){try{const f=vraiResolve.call(Module,rq,p,m);if(FAUX[f])return FAUX[f];}catch(_){}
  return vraiLoad.apply(this,arguments);};
const courses=await import(path.join(ROOT,'api/_lib/courses.js'));
const handler=(await import(path.join(ROOT,'api/contact.js'))).default;
const rr={code:0,body:null}; rr.status=c=>{rr.code=c;return rr;}; rr.json=o=>{rr.body=o;return rr;};
rr.end=()=>rr; rr.setHeader=()=>{};
await handler({method:'POST',headers:{authorization:'Bearer t'},body:req},rr);
T('le serveur accepte la requête telle quelle', rr.code===200, rr.code+' '+JSON.stringify(rr.body));
const a=STORE['courses/c1'].accord;
T('LE CÔTÉ LIVREUR EST SIGNÉ', a.okLivreur===true, 'okLivreur='+a.okLivreur);
T('L\'ACCORD EST VALIDÉ', a.valide===true, 'valide='+a.valide);

console.log('\n'+pass+' OK / '+fail+' KO');
process.exit(fail?1:0);
