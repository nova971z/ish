// LE BLOC DÉTAIL D'UNE COURSE doit être RANGÉ : plus de fil de discussion
// dedans (la bulle est là pour ça), actions secondaires repliées.
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

const C={id:'c1',mine:true,acceptedByMe:true,chatOpen:true,round:1,status:'acceptee',
  courierUid:'moi',courierName:'Nova',address:'Vieux-Habitants',zone:4,km:43.4,
  productTitle:'Quincaillerie #0002',qty:1,when:'heure',hour:'21:05',date:'2026-07-28',
  code:'213286',accord:{prix:100,paiement:'especes',okClient:true,okLivreur:false,valide:false},lines:[]};
const COURSES={ok:true,courier:true,dispo:[],mine:[C]};
const PROFIL={uid:'moi',displayName:'Nova',commune:'Sainte-Anne',vehicle:'scooter',
  tarifs:{1:30,2:55,3:80,4:100},hDebut:'00:00',hFin:'23:30',available:true,published:true,
  coursesDone:0,ratingCount:0,ratingSum:0};

const ctx=await browser.newContext({viewport:{width:900,height:1200}});
await ctx.route('**/*',r=>/googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url())?r.abort():r.continue());
const page=await ctx.newPage();
await page.route('**/api/contact', route=>{
  const b=JSON.parse(route.request().postData()||'{}');
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
    onSnapshot:(q,cb)=>{setTimeout(()=>cb({forEach:(f)=>[{uid:'moi',role:'client',at:{toMillis:()=>1},text:'Salut'}].forEach(m=>f({data:()=>m}))}),0);return()=>{};},
    serverTimestamp:()=>new Date()};
});
const boot=async(h)=>{ await page.goto(base+'/index.html?dt='+Math.random().toString(36).slice(2)+h,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1100); };

for (const [hash, sel, quoi] of [
  ['#/mes-livraisons','[data-deliv-focus]','CLIENT'],
  ['#/mode-livraison','[data-course-focus]','LIVREUR']
]) {
  console.log('\n━━ DÉTAIL D\'UNE COURSE — CÔTÉ ' + quoi + ' ━━');
  await boot(hash);
  await page.evaluate((s)=>{const b=document.querySelector(s); if(b) b.click();}, sel);
  await page.waitForTimeout(700);
  const r = await page.evaluate(()=>{
    const det=document.querySelector('#clientDelivDetail:not([hidden]), #courierDetail:not([hidden])');
    if(!det) return {absent:true};
    return {
      log: !!det.querySelector('#lvChatLog'),
      champ: !!det.querySelector('#lvChatInput'),
      bulles: det.querySelectorAll('.lv-msg').length,
      bouton: !!det.querySelector('[data-openchat]'),
      boutonLarge: (()=>{const b=det.querySelector('[data-openchat]'); if(!b) return 0;
        return Math.round(b.getBoundingClientRect().width);})(),
      vidReplie: (()=>{const d=det.querySelector('details.lv-vid'); return d? !d.open : null;})(),
      texte: (det.textContent||'').replace(/\s+/g,' ').length,
      panneauFerme: (()=>{const p=det.querySelector('#lvChatPanel'); return p? !!p.hidden : null;})(),
      ysBoutons: [...det.querySelectorAll('.lv-cbtn')].map(b=>Math.round(b.getBoundingClientRect().y)),
      // « Horizontalement » = plus de colonne verticale : au moins deux
      // boutons partagent une rangée. Avec 4 boutons sur un bloc étroit,
      // l'enroulement 3+1 est le comportement CORRECT — l'exiger sur une
      // seule ligne serait exiger un débordement.
      // Les 5 informations doivent être des FICHES côte à côte, et le code de
      // remise ne doit plus apparaître ici (il a son propre panneau).
      fiches: [...det.querySelectorAll('.lv-facts > .lv-fact .lv-fact__k')].map(e=>e.textContent.trim()),
      fichesParRangee: (()=>{const f=[...det.querySelectorAll('.lv-facts > .lv-fact')];
        if(!f.length) return 0;
        const ys=[...new Set(f.map(x=>Math.round(x.getBoundingClientRect().y)))];
        return f.length / ys.length;})(),
      qrInline: det.querySelectorAll('.lv-handcode, .lv-handcode__qr').length   /* #clientCodeQR mort : le QR est `.lv-handcode__qr` */,
      codeEnClair: /Code de remise\s*\d/.test((det.textContent||'').replace(/\s+/g,' ')),
      rangees: (()=>{const b=[...det.querySelectorAll('.lv-cbtn')];
        if(!b.length) return null;
        const ys=[...new Set(b.map(x=>Math.round(x.getBoundingClientRect().y)))];
        return { nb: ys.length, parRangee: b.length / ys.length };})()
    };
  });
  T('  le détail s\'ouvre', !r.absent);
  T('  plus AUCUN fil de discussion dans le bloc', !r.log && !r.champ && r.bulles===0,
    'log='+r.log+' champ='+r.champ+' bulles='+r.bulles);
  T('  plus de bouton « Ouvrir la discussion » non plus (la bulle suffit)', !r.bouton);
  T('  vidéo / litige REPLIÉS par défaut', r.vidReplie===true, 'replié='+r.vidReplie);
  T('  AUCUN panneau ouvert à l\'arrivée', r.panneauFerme===true, 'fermé='+r.panneauFerme);
  T('  les boutons ne sont PLUS en colonne verticale', r.rangees && r.rangees.parRangee >= 2,
    r.ysBoutons.length+' boutons sur '+(r.rangees&&r.rangees.nb)+' rangée(s)');
  T('  les 5 informations sont des FICHES', r.fiches.length===5, JSON.stringify(r.fiches));
  T('  elles sont côte à côte (plusieurs par rangée)', r.fichesParRangee >= 2,
    r.fichesParRangee.toFixed(1)+' fiche(s) par rangée');
  T('  AUCUN code de remise en clair dans le bloc', !r.codeEnClair);
  T('  AUCUN QR en double dans le bloc', r.qrInline===0, r.qrInline+' trouvé(s)');
  console.log('     longueur du texte du bloc : ' + r.texte + ' caractères');

}
// Le code n'a pas DISPARU : il vit dans son panneau, qui ne s'ouvre qu'au clic.
console.log('\n━━ LE CODE RESTE ACCESSIBLE — DANS SON PANNEAU, ET NULLE PART AILLEURS ━━');
await boot('#/mes-livraisons');
await page.evaluate(()=>{const b=document.querySelector('[data-deliv-focus]'); if(b) b.click();});
await page.waitForTimeout(700);
let z = await page.evaluate(()=>({
  bouton: !!document.querySelector('#clientDelivDetail [data-cpanel="code"]'),
  qrAvant: document.querySelectorAll('#clientDelivDetail img[alt*="QR"], #clientDelivDetail canvas').length
}));
T('  le bouton « Code de remise » est présent', z.bouton);
T('  AUCUN QR affiché avant le clic', z.qrAvant===0, z.qrAvant+' image(s)');
await page.click('#clientDelivDetail [data-cpanel="code"]');
await page.waitForTimeout(900);
z = await page.evaluate(()=>{
  const p=document.getElementById('lvChatPanel');
  return { code: /213286/.test(p.textContent||''),
    qr: p.querySelectorAll('img[alt*="QR"], img').length,
    total: document.querySelectorAll('#clientDelivDetail img[alt*="QR"]').length };
});
T('  le code apparaît au clic', z.code);
T('  son QR aussi', z.qr>=1, z.qr+' image(s)');
T('  et il n\'apparaît QU\'UNE seule fois sur l\'écran', z.total===1, z.total+' QR au total');

console.log('\n'+pass+' OK / '+fail+' KO');
await browser.close();server.close();
process.exit(fail?1:0);
