// ESPACE LIVREUR : sa carte + les courses DISSOCIÉES, et les informations
// modifiables UNIQUEMENT derrière ⚙️.
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
const ctx=await browser.newContext({viewport:{width:1000,height:1300},deviceScaleFactor:2});
await ctx.route('**/*',r=>/googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

const PROFIL = { uid:'moi', displayName:'Nova', commune:'Sainte-Anne', vehicle:'scooter',
  cylindree:'125', bio:'Rapide et soigneux.', photo:'', tarifs:{1:30,2:55,3:80,4:120},
  hDebut:'00:00', hFin:'23:30', available:true, published:true,
  coursesDone:7, ratingCount:4, ratingSum:19 };
const COURSES = { ok:true, courier:true,
  dispo:[ {id:'d1', status:'en_attente', zone:1, km:5, address:'Rue des Palmiers, Le Gosier', productTitle:'Vis inox', qty:2, when:'matin', round:1} ],
  mine:[
    {id:'m1', status:'confirmee', acceptedByMe:true, zone:2, km:15, address:'Chantier Sainte-Anne', productTitle:'Plaques', qty:1, when:'matin', round:1, accord:{prix:55,valide:true}},
    {id:'m2', status:'terminee',  acceptedByMe:true, zone:1, km:6,  address:'Villa Gosier', productTitle:'Ciment', qty:3, when:'apresmidi', round:1, rating:5},
    {id:'m3', status:'terminee',  acceptedByMe:true, zone:3, km:28, address:'Capesterre', productTitle:'Tuyaux', qty:1, when:'matin', round:1}
  ] };

let bootN=0;
const boot=async(h)=>{
  await page.addInitScript(({PROFIL,COURSES})=>{
    const USER={uid:'moi', email:'justforwada@icloud.com', getIdToken:()=>Promise.resolve('t')};
    window.PT_COURIERS_FIXTURE=[Object.assign({},PROFIL)];
    window.PT_FIREBASE={ configured:true, auth:{}, db:{},
      onAuthStateChanged:(a,cb)=>{ setTimeout(()=>cb(USER),0); return ()=>{}; },
      doc:()=>({}), getDoc:()=>Promise.resolve({exists:()=>false}), setDoc:()=>Promise.resolve(),
      updateDoc:()=>Promise.resolve(), collection:function(){const a=[].slice.call(arguments);return{path:a.slice(1).join('/')};},
      addDoc:()=>Promise.resolve({id:'x'}), getDocs:()=>Promise.resolve({forEach:()=>{}}),
      query:(c)=>c, orderBy:()=>({}), where:()=>({}), limit:()=>({}),
      onSnapshot:(q,cb)=>{ setTimeout(()=>cb({forEach:()=>{}}),0); return ()=>{}; },
      serverTimestamp:()=>new Date() };
  }, {PROFIL,COURSES});
  await page.route('**/api/contact', route => {
    const b=JSON.parse(route.request().postData()||'{}');
    const rep = b.type==='courier-status' ? {ok:true,courier:true}
      : b.type==='courier-profile' ? {ok:true,courier:true,profile:PROFIL,repere:{1:22,2:48,3:74,4:100}}
      : b.type==='course-list' ? COURSES
      : {ok:true};
    route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(rep)});
  });
  await page.goto(base+'/index.html?e='+(++bootN)+h,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1100);
};

console.log('\n━━ ARRIVÉE : l\'espace de TRAVAIL, pas le formulaire ━━');
await boot('#/mode-livraison');
let r = await page.evaluate(()=>({
  travailVisible: !document.getElementById('courierWork').hidden,
  paramsCaches: !!document.getElementById('courierParams').hidden,
  gear: !!document.getElementById('courierGear'),
  gearTxt: (document.querySelector('#courierGear .lv-gear__t')||{}).textContent,
  gearRect: (()=>{ const g=document.getElementById('courierGear'); if(!g) return null;
    const b=g.getBoundingClientRect(); return {x:Math.round(b.x), w:Math.round(b.width), h:Math.round(b.height), vis:!!g.offsetParent}; })(),
  champsFiche: document.querySelectorAll('#courierWork #lvPfName, #courierWork #lvPfHDebut, #courierWork input[id^="lvTarifIn"]').length,
  maCarte: !!document.querySelector('#courierMyCard .courier-card'),
  bandeau: (document.querySelector('#courierMyCard .lv-service')||{}).textContent,
  dispo: (document.getElementById('courierDispo')||{}).textContent||'',
  mine: (document.getElementById('courierMine')||{}).textContent||'',
  titres: [...document.querySelectorAll('#courierWork .lv-h2, #courierWork .lv-h3')].map(e=>e.textContent.trim())
}));
T('on arrive sur l\'espace de TRAVAIL', r.travailVisible && r.paramsCaches);
T('le bouton ⚙️ existe et est visible', r.gear && r.gearRect && r.gearRect.vis, JSON.stringify(r.gearRect));
T('le ⚙️ est EN HAUT À DROITE', r.gearRect && r.gearRect.x > 500, 'x='+r.gearRect?.x);
T('le ⚙️ est assez grand pour être touché', r.gearRect && r.gearRect.h >= 40, 'h='+r.gearRect?.h);
T('AUCUN champ de fiche dans l\'espace de travail', r.champsFiche===0, r.champsFiche+' champ(s)');
T('SA CARTE est affichée', r.maCarte);
T('avec son bandeau d\'état', /EN SERVICE/.test(r.bandeau||''), (r.bandeau||'').trim().slice(0,40));

console.log('\n━━ LES COURSES SONT DISSOCIÉES ━━');
console.log('   titres : '+JSON.stringify(r.titres));
// La fiche « Courses en attente » a été SUPPRIMÉE (demande user 28/07/2026) :
// les courses viennent au livreur par le bandeau vert, il ne va plus les
// chercher. L'assertion vérifie donc l'inverse.
T('« Courses en attente » a bien DISPARU', !r.titres.some(t=>/Courses en attente/.test(t)),
  JSON.stringify(r.titres));
T('le bandeau « nouvelle course » la remplace',
  await page.evaluate(()=>!!document.getElementById('courseAlert')));
// SPEC MISE À JOUR (user 28/07/2026) : plus de bloc « Mes courses » scindé en
// cours/terminées. La course EN COURS vit dans la grosse fiche (avec sa
// pastille orange) ; les TERMINÉES vont dans « Historique de course », replié
// tout en bas. Voir plan8.mjs pour les assertions complètes.
T('« Historique de course » a remplacé « Mes courses »',
  r.titres.some(t=>/Historique de course/.test(t)) && !r.titres.some(t=>/^🕘 Mes courses/.test(t)),
  JSON.stringify(r.titres));
// SPEC AFFINÉE (user 28/07/2026) : « pas besoin qu'elle soit ouverte, il est
// censé y avoir le petit signet en cours ». La course en cours est portée par
// un SIGNET orange néon ; la grosse fiche ne s'ouvre qu'au clic dessus.
T('la course EN COURS est portée par le signet, hors historique',
  r.titres.some(t=>/Course en cours/.test(t)), JSON.stringify(r.titres));
T('la course EN ATTENTE n\'est pas dans mes courses', !/Vis inox/.test(r.mine), r.mine.slice(0,50));
T('mes courses ne sont pas dans la liste en attente', !/Plaques|Ciment/.test(r.dispo));

console.log('\n━━ ⚙️ PARAMÈTRES : le SEUL endroit modifiable ━━');
await page.click('#courierGear');
await page.waitForTimeout(400);
r = await page.evaluate(()=>({
  paramsVisible: !document.getElementById('courierParams').hidden,
  travailCache: !!document.getElementById('courierWork').hidden,
  gearTxt: (document.querySelector('#courierGear .lv-gear__t')||{}).textContent,
  nom: (document.getElementById('lvPfName')||{}).value,
  commune: (document.getElementById('lvPfCommune')||{}).value,
  veh: (document.getElementById('lvPfVeh')||{}).value,
  hD: (document.getElementById('lvPfHDebut')||{}).value,
  hF: (document.getElementById('lvPfHFin')||{}).value,
  bio: (document.getElementById('lvPfBio')||{}).value,
  tarifs: [...document.querySelectorAll('input[id^="lvTarifIn"]')].map(e=>e.value),
  nbHeures: document.querySelectorAll('#lvPfHDebut option').length,
  dispoBtn: !!document.getElementById('lvDispoBtn')
}));
T('le ⚙️ ouvre les paramètres', r.paramsVisible && r.travailCache);
T('le bouton devient « Retour aux courses »', /Retour/.test(r.gearTxt||''), r.gearTxt);
T('nom pré-rempli', r.nom==='Nova', r.nom);
T('commune pré-remplie', r.commune==='Sainte-Anne', r.commune);
T('véhicule pré-rempli', r.veh==='scooter', r.veh);
T('HORAIRES pré-remplis, deux champs distincts', r.hD==='00:00' && r.hF==='23:30', r.hD+' → '+r.hF);
T('le menu d\'heures est complet (48 pas de 30 min + vide)', r.nbHeures===49, r.nbHeures);
T('présentation pré-remplie', /Rapide/.test(r.bio||''), r.bio);
T('SES tarifs pré-remplis', r.tarifs.join(',')==='30,55,80,120', r.tarifs.join(','));
T('interrupteur de disponibilité présent', r.dispoBtn);

await page.click('#courierGear');
await page.waitForTimeout(400);
r = await page.evaluate(()=>({ travail: !document.getElementById('courierWork').hidden,
  params: !!document.getElementById('courierParams').hidden }));
T('le bouton ramène aux courses', r.travail && r.params);

await page.locator('#view-mode-livraison').screenshot({path:'/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/espace.png'});
console.log('\n'+pass+' OK / '+fail+' KO   → capture : espace.png');
await browser.close();server.close();
process.exit(fail?1:0);
