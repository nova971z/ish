// DISCUSSION DIRECTE : le bouton n'est cliquable que si le livreur est en
// service, la carte reste cliquable vers sa fiche, et le serveur a le dernier mot.
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
const ctx=await browser.newContext({viewport:{width:900,height:1200}});
await ctx.route('**/*',r=>/googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

// Le livreur EN SERVICE a une plage large ; l'autre est hors horaires.
const FIXT = [
  { uid:'u1', published:true, displayName:'Kevin L.', commune:'Le Gosier', vehicle:'scooter',
    available:true, hDebut:'00:00', hFin:'23:30', tarifs:{1:30,2:55,3:80,4:110},
    coursesDone:12, ratingCount:5, ratingSum:24, avis:[] },
  { uid:'u2', published:true, displayName:'Marie B.', commune:'Sainte-Anne', vehicle:'vae',
    available:true, hDebut:'03:00', hFin:'03:30', tarifs:{1:25,2:50,3:75,4:100},
    coursesDone:3, ratingCount:0, ratingSum:0, avis:[] },
  { uid:'u3', published:true, displayName:'Test C.', commune:'Saint-François', vehicle:'trottinette',
    available:false, tarifs:{1:22,2:48,3:74,4:100}, coursesDone:0, ratingCount:0, ratingSum:0, avis:[] }
];
let bootN=0;
// Compte connecté simulé : sans lui, lvOuvrirDiscussion renvoie vers #/auth
// (comportement CORRECT — c'est le harnais qui devait fournir une identité).
const MSGS = [
  { uid:'systeme', role:'systeme', at:{toMillis:()=>1000}, text:'Discussion ouverte avec Kevin L. Pirates Tools ne fixe aucun prix.' },
  { uid:'moi', role:'client', at:{toMillis:()=>2000}, text:'Bonjour, tu peux passer ce matin ?' }
];
const boot=async(h)=>{
  await page.addInitScript((f)=>{ window.PT_COURIERS_FIXTURE=f; }, FIXT);
  await page.addInitScript((MSGS)=>{
    const USER = { uid:'moi', email:'client@example.invalid', getIdToken:()=>Promise.resolve('jeton') };
    window.__msgEnvoyes = [];
    window.PT_FIREBASE = {
      configured:true, auth:{}, db:{},
      onAuthStateChanged:(a,cb)=>{ setTimeout(()=>cb(USER),0); return ()=>{}; },
      doc:()=>({}), getDoc:()=>Promise.resolve({exists:()=>false}),
      setDoc:()=>Promise.resolve(), updateDoc:()=>Promise.resolve(),
      collection:function(){ const a=[].slice.call(arguments); return {path:a.slice(1).join('/')}; },
      addDoc:(col,data)=>{ window.__msgEnvoyes.push({path:col.path,data}); return Promise.resolve({id:'x'}); },
      getDocs:()=>Promise.resolve({forEach:()=>{}}),
      query:(c)=>c, orderBy:()=>{ window.__orderByUtilise=true; return {}; },
      where:()=>({}), limit:()=>({}),
      onSnapshot:(q,cb)=>{ setTimeout(()=>cb({forEach:(f)=>MSGS.forEach(m=>f({data:()=>m}))}),0); return ()=>{}; },
      serverTimestamp:()=>new Date()
    };
  }, MSGS);
  await page.goto(base+'/index.html?d='+(++bootN)+h,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(700);
};

console.log('\n━━ ANNUAIRE : le bouton suit l\'état réel ━━');
await boot('#/livraison');
let r = await page.evaluate(()=>{
  return [...document.querySelectorAll('#couriersGrid .courier-card')].map(c=>({
    nom:(c.querySelector('.courier-card__name')||{}).textContent,
    on:c.classList.contains('courier-card--on'),
    etat:((c.querySelector('.courier-card__dispo')||{}).textContent||'').trim(),
    horaires:[...c.querySelectorAll('.courier-card__meta')].map(e=>e.textContent).join(' '),
    btn:!!c.querySelector('[data-conv-open]'),
    btnOff:!!c.querySelector('.lv-discuter[disabled]'),
    href:c.getAttribute('href')
  }));
});
r.forEach(x=>console.log('   '+String(x.nom).padEnd(10)+' '+x.etat.padEnd(15)+' bouton:'+(x.btn?'ACTIF':'éteint')));
T('3 cartes affichées', r.length===3);
T('livreur dans ses horaires : bouton ACTIF', r[0].btn===true && r[0].btnOff===false, r[0].nom);
T('livreur HORS horaires : bouton éteint', r.some(x=>x.nom==='Marie B.' && !x.btn && x.btnOff));
T('livreur hors ligne : bouton éteint', r.some(x=>x.nom==='Test C.' && !x.btn && x.btnOff));
T('les horaires sont visibles sur la carte', /⏰/.test(r[0].horaires), r[0].horaires);
T('la carte reste cliquable vers la fiche', /#\/livreur-profil\//.test(r[0].href||''), r[0].href);

console.log('\n━━ FICHE PUBLIQUE ━━');
await boot('#/livreur-profil/u1');
r = await page.evaluate(()=>({
  h1:(document.querySelector('#courierprof-h1')||{}).textContent,
  bandeau:(document.querySelector('.lv-service')||{}).textContent,
  on:!!(document.querySelector('.lv-service.is-on')),
  point:!!document.querySelector('.lv-service .lv-service__dot'),
  btn:!!document.querySelector('.courier-prof__cta [data-conv-open]'),
  tarifs:[...document.querySelectorAll('#view-livreur-profil .lv-tarif__price')].map(e=>e.textContent)
}));
T('fiche ouverte au bon livreur', r.h1==='Kevin L.', r.h1);
T('bandeau EN SERVICE allumé + point', r.on && r.point, (r.bandeau||'').trim());
T('bouton Discuter présent et actif', r.btn);
T('ses tarifs sont affichés', r.tarifs.length===4, JSON.stringify(r.tarifs));

console.log('\n━━ LE SERVEUR A LE DERNIER MOT ━━');
// Le serveur refuse : l'écran doit le dire, pas ouvrir la discussion.
await page.route('**/api/contact', route => {
  const b = JSON.parse(route.request().postData()||'{}');
  if (b.type === 'conv-open') return route.fulfill({status:409, contentType:'application/json',
    body: JSON.stringify({ok:false, code:'hors-service', error:"Ce livreur n'est pas en service actuellement."})});
  return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ok:true})});
});
await boot('#/livreur-profil/u1');
await page.evaluate(()=>{ window.__toasts=[]; });
await page.click('.courier-prof__cta [data-conv-open]').catch(()=>{});
await page.waitForTimeout(600);
r = await page.evaluate(()=>({ hash:location.hash, toast:(document.querySelector('#toasts')||{}).textContent||'' }));
T('refus serveur : on N\'ouvre PAS la discussion', !/#\/discussion/.test(r.hash), r.hash);
T('refus serveur : le message est affiché', /pas en service/i.test(r.toast), r.toast.trim().slice(0,60));

// Acceptation : on navigue vers la discussion.
await page.unroute('**/api/contact');
await page.route('**/api/contact', route => route.fulfill({status:200, contentType:'application/json',
  body: JSON.stringify({ok:true, id:'moi_u1', courierName:'Kevin L.'})}));
await boot('#/livreur-profil/u1');
await page.click('.courier-prof__cta [data-conv-open]').catch(()=>{});
await page.waitForTimeout(700);
r = await page.evaluate(()=>({ hash:location.hash,
  champ:!!document.querySelector('#lvChatInput'), envoi:!!document.querySelector('#lvChatSend'),
  txt:(document.querySelector('#discussionBody')||{}).textContent||'' }));
T('accord serveur : on arrive sur la discussion', /#\/discussion\/moi_u1/.test(r.hash), r.hash);
T('le champ de message est là', r.champ && r.envoi);
T('le cadre est rappelé (aucun prix imposé)', /ne fixe aucun prix/i.test(r.txt));

console.log('\n━━ LE FIL FONCTIONNE ━━');
r = await page.evaluate(()=>({
  bulles:[...document.querySelectorAll('#lvChatLog .lv-msg')].map(e=>({
    cls:e.className, txt:(e.textContent||'').trim().slice(0,40) })),
  orderBy: !!window.__orderByUtilise
}));
T('les messages s\'affichent', r.bulles.length===2, JSON.stringify(r.bulles.map(b=>b.txt)));
T('le message SYSTÈME est distingué', /lv-msg--sys/.test(r.bulles[0]?.cls||''), r.bulles[0]?.cls);
T('MON message est du bon côté', /lv-msg--me/.test(r.bulles[1]?.cls||''), r.bulles[1]?.cls);
T('AUCUN orderBy Firestore (pas d\'index composite requis)', r.orderBy===false);

await page.fill('#lvChatInput','Je suis sur le chantier');
await page.click('#lvChatSend');
await page.waitForTimeout(400);
r = await page.evaluate(()=>({ envois:window.__msgEnvoyes, champ:(document.querySelector('#lvChatInput')||{}).value }));
T('l\'envoi écrit dans conversations/{id}/messages',
  r.envois.length===1 && r.envois[0].path==='conversations/moi_u1/messages', JSON.stringify(r.envois[0]?.path));
T('le message porte MON uid et mon rôle',
  r.envois[0]?.data.uid==='moi' && r.envois[0]?.data.role==='client', JSON.stringify(r.envois[0]?.data));
T('le champ est vidé après envoi', r.champ==='');
T('aucun champ superflu envoyé (les règles refuseraient)',
  Object.keys(r.envois[0]?.data||{}).sort().join(',')==='at,role,text,uid',
  Object.keys(r.envois[0]?.data||{}).join(','));

console.log('\n'+pass+' OK / '+fail+' KO');
await browser.close();server.close();
process.exit(fail?1:0);
