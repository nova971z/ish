// LES 7 POINTS DU PLAN, mesurés un par un.
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

const SANS_PANIER={id:'c1',mine:true,acceptedByMe:true,chatOpen:true,round:1,status:'acceptee',
  courierUid:'moi',courierName:'Nova',address:'Vieux-Habitants',zone:4,km:43.4,
  productTitle:'Quincaillerie #0002',qty:1,when:'heure',hour:'21:05',date:'2026-07-28',
  code:'213286',lines:[],accord:{prix:100,paiement:'especes',okClient:true,okLivreur:true,valide:true}};
const DISPO={id:'d9',status:'en_attente',zone:2,km:15,address:'Le Gosier, rue des Palmiers',
  productTitle:'Vis inox',qty:2,when:'matin',round:1};
const COURSES={ok:true,courier:true,dispo:[DISPO],mine:[SANS_PANIER,
  {id:'m2',status:'terminee',acceptedByMe:true,zone:1,km:6,address:'Gosier',productTitle:'Ciment',qty:3,when:'matin',round:1}]};
const PROFIL={uid:'moi',displayName:'Nova',commune:'Sainte-Anne',vehicle:'scooter',
  tarifs:{1:30,2:55,3:80,4:100},hDebut:'00:00',hFin:'23:00',available:true,published:true,
  coursesDone:0,ratingCount:0,ratingSum:0};

const ctx=await browser.newContext({viewport:{width:1000,height:1300}});
await ctx.route('**/*',r=>/googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
const envoyees=[];
await page.route('**/api/contact', route=>{
  const b=JSON.parse(route.request().postData()||'{}'); envoyees.push(b);
  const rep=b.type==='course-list'?COURSES:b.type==='conv-list'?{ok:true,conversations:[]}
    :b.type==='courier-status'?{ok:true,courier:true}
    :b.type==='courier-profile'?{ok:true,courier:true,profile:PROFIL,repere:{1:22,2:48,3:74,4:100}}:{ok:true};
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
const boot=async(h)=>{ await page.goto(base+'/index.html?p7='+Math.random().toString(36).slice(2)+h,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1200); };

console.log('\n━━ MES LIVRAISONS (client) ━━');
await boot('#/mes-livraisons');
let r = await page.evaluate(()=>{
  const histo=document.querySelector('details.lv-histo');
  const cards=[...document.querySelectorAll('#view-mes-livraisons .lv-card, #view-mes-livraisons details.lv-histo')];
  return {
    histoExiste: !!histo, histoReplie: histo? !histo.open : null,
    histoTitre: histo? (histo.querySelector('.lv-h2')||{}).textContent : null,
    histoDernier: cards.length? cards[cards.length-1].classList.contains('lv-histo') : null
  };
});
T('4· « Historique de commande » existe et est REPLIÉ', r.histoExiste && r.histoReplie, r.histoTitre);
T('4· il est le DERNIER bloc de la page', r.histoDernier===true);
await page.click('.lv-histo__sum'); await page.waitForTimeout(400);
T('4· il s\'ouvre au clic', await page.evaluate(()=>!!document.querySelector('details.lv-histo').open));

await page.evaluate(()=>{const b=document.querySelector('[data-deliv-focus]'); if(b) b.click();});
await page.waitForTimeout(700);
r = await page.evaluate(()=>{
  const f=document.querySelector('#clientDelivDetail .lv-fact');
  const k=f? getComputedStyle(f.querySelector('.lv-fact__k')) : null;
  const cs=f? getComputedStyle(f) : null;
  const an=document.querySelector('#clientDelivDetail .lv-annuler');
  const btn=an? an.querySelector('.btn') : null;
  const par=an? an.parentElement.getBoundingClientRect() : null;
  const bb=btn? btn.getBoundingClientRect() : null;
  return {
    trait: k? k.borderBottomWidth+' / '+k.borderBottomColor : null,
    lueurTrait: k? k.boxShadow : null,
    contour: cs? cs.boxShadow : null,
    bord: cs? cs.borderColor : null,
    annuler: !!btn,
    centre: (btn&&par)? Math.abs((bb.x+bb.width/2)-(par.x+par.width/2)) : null
  };
});
T('3· les fiches ont un TRAIT sous le titre', /^[1-9]/.test(r.trait||''), r.trait);
T('3· ce trait est LUMINEUX', (r.lueurTrait||'none')!=='none', (r.lueurTrait||'').slice(0,40));
T('3· la fiche a un CONTOUR lumineux', (r.contour||'none')!=='none', (r.contour||'').slice(0,40));
T('2· le bouton « Annuler » existe', r.annuler);
T('2· il est CENTRÉ dans son conteneur', r.centre!==null && r.centre<2, 'écart '+(r.centre||0).toFixed(1)+' px');

await page.click('#clientDelivDetail [data-cpanel="pay"]'); await page.waitForTimeout(500);
r = await page.evaluate(()=>{
  const p=document.getElementById('lvChatPanel');
  return { mort: !!p.querySelector('#acPay'),
    explique: /sans panier/i.test(p.textContent||''),
    sortie: !!p.querySelector('a[href="#/catalogue"]') };
});
// SPEC CORRIGÉE (user 28/07/2026) : « je t'ai juste dit qu'il ne marchait pas,
// il doit afficher les modalités de paiement là où on insère notre carte ». La
// VRAIE cause était en amont — les lignes du panier n'étaient pas enregistrées
// avec la demande. Le bouton doit donc EXISTER et ouvrir la modale carte ; le
// remplacer par « Aller au catalogue » masquait le symptôme. Détail : plan8.mjs.
T('1· le bouton « Payer ma marchandise » existe TOUJOURS', r.mort);
T('1· PLUS de bandeau « sans panier »', !r.explique);
T('1· PLUS de substitution « Aller au catalogue »', !r.sortie);

console.log('\n━━ MODE LIVRAISON (livreur) ━━');
await boot('#/mode-livraison');
r = await page.evaluate(()=>{
  const al=document.getElementById('courseAlert');
  const rb=al&&!al.hidden? al.getBoundingClientRect():null;
  const top=document.querySelector('.topbar')   /* seul `.topbar` existe ; les deux autres formes étaient mortes et masquaient la vraie cible */;
  return { visible: !!al && !al.hidden, txt:(document.getElementById('courseAlertTxt')||{}).textContent,
    y: rb?Math.round(rb.y):null, croix: !!document.getElementById('courseAlertX'),
    ficheAttente: !!document.querySelector('#courierDispo:not([hidden])'),
    titreAttente: /Courses en attente/.test(document.body.innerText) };
});
T('6· le BANDEAU apparaît', r.visible, r.txt);
T('6· il est SOUS la barre du haut', r.y!==null && r.y>40 && r.y<160, 'y='+r.y);
T('6· il porte une croix', r.croix);
T('6· la fiche « Courses en attente » a DISPARU', !r.ficheAttente && !r.titreAttente);
await page.click('#courseAlertX'); await page.waitForTimeout(400);
T('6· la croix ferme le bandeau', await page.evaluate(()=>!!document.getElementById('courseAlert').hidden));

// SPEC AFFINÉE (user 28/07/2026) : « au clic sur la course, le bandeau
// s'agrandit et il voit les détails du client. À ce moment-là il pourra
// appuyer sur j'accepte, ou la petite croix. » Le clic n'accepte donc PLUS à
// l'aveugle : il DÉPLIE. L'acceptation est un second geste, éclairé.
await boot('#/mode-livraison');
const avant=envoyees.length;
await page.click('#courseAlertGo'); await page.waitForTimeout(500);
T('6· le clic DÉPLIE les détails (il n\'accepte plus à l\'aveugle)',
  await page.evaluate(()=>!document.getElementById('courseAlertDet').hidden));
T('6· aucune acceptation envoyée à ce stade',
  envoyees.slice(avant).filter(b=>b.type==='course-accept').length===0,
  JSON.stringify(envoyees.slice(avant).map(b=>b.type)));
await page.click('#courseAlertOk'); await page.waitForTimeout(700);
const acc=envoyees.slice(avant).filter(b=>b.type==='course-accept')[0];
T('6· « J\'accepte » accepte bien la course', !!acc && acc.id==='d9', JSON.stringify(acc));

r = await page.evaluate(()=>{
  const mine=document.getElementById('courierMine');
  const c=mine? mine.querySelector('.lv-course'):null;
  const cs=c? getComputedStyle(c,'::before'):null;
  return { liseré: cs? cs.width+' / '+cs.backgroundColor : null,
    titres:[...(mine?mine.querySelectorAll('.lv-h3'):[])].map(e=>e.textContent.trim()) };
});
T('7· chaque course porte un liseré d\'état', /^[1-9]/.test(r.liseré||''), r.liseré);
// SPEC MISE À JOUR : l'historique ne contient QUE les courses terminées, donc
// plus aucun sous-titre « En cours / Terminées » à l'intérieur.
T('7· l\'historique n\'a plus de sous-titres (finies uniquement)', r.titres.length===0, JSON.stringify(r.titres));

await page.click('#courierGear'); await page.waitForTimeout(600);
r = await page.evaluate(()=>{
  const p=document.getElementById('courierParams');
  return { bandeau: !!p.querySelector('.lv-service'),
    txt:(p.querySelector('.lv-service')||{}).textContent||'',
    heure: /en Guadeloupe/.test(p.textContent||''),
    interrupteur:(p.querySelector('.lv-dispo__txt')||{}).textContent||'' };
});
T('5· les paramètres montrent le MÊME état que les clients', r.bandeau, r.txt.trim().slice(0,46));
T('5· l\'heure de Guadeloupe est affichée', r.heure);
T('5· l\'interrupteur ne se fait plus passer pour l\'état final', /interrupteur/i.test(r.interrupteur), r.interrupteur.trim());

console.log('\n'+pass+' OK / '+fail+' KO');
await browser.close();server.close();
process.exit(fail?1:0);
