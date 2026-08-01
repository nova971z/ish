const { join, basename } = require('path');
const { RACINE , playwright, optionsNavigateur } = require('./_socle.cjs');
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium} = playwright();
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port,base=`http://127.0.0.1:${port}`;
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext();const page=await ctx.newPage();
await page.addInitScript(()=>{
  window.__calls=[];
  const user={uid:'u1',email:'ancien@mail.fr',displayName:'Jean'};
  window.PT_FIREBASE={configured:true,auth:{currentUser:user},
    onAuthStateChanged:(a,cb)=>{setTimeout(()=>cb(user),40);return()=>{};},
    doc:()=>({}),getDoc:()=>Promise.resolve({exists:()=>true,data:()=>({name:'Jean',email:'ancien@mail.fr'})}),
    setDoc:()=>Promise.resolve(),
    updateDoc:(r,p)=>{window.__calls.push(['updateDoc',p]);return Promise.resolve();},
    updateProfile:()=>Promise.resolve(),
    updateEmail:(u,e)=>{window.__calls.push(['updateEmail',e]);return Promise.resolve();},
    verifyBeforeUpdateEmail:(u,e)=>{window.__calls.push(['verifyBeforeUpdateEmail',e]);return Promise.resolve();},
    collection:()=>({}),query:()=>({}),orderBy:()=>({}),limit:()=>({}),getDocs:()=>Promise.resolve({empty:true,size:0,forEach:()=>{}}),
    addDoc:()=>Promise.resolve(),serverTimestamp:()=>0,EmailAuthProvider:{credential:()=>({})},reauthenticateWithCredential:()=>Promise.resolve(),signOut:()=>Promise.resolve(),sendPasswordResetEmail:()=>Promise.resolve(),sendEmailVerification:()=>Promise.resolve()};
  localStorage.setItem('pt_consent','accepted');
});
await page.goto(base+'/#/compte',{waitUntil:'load'});await page.waitForTimeout(1200);
/* ⚠️ ONGLET PARAMÈTRES OBLIGATOIRE (corrigé 01/08/2026). La page compte a été
   réorganisée : « Profil » n'AFFICHE plus que les informations, et le seul
   endroit où on les MODIFIE est l'onglet « Paramètres ». `#accEmail` vit donc
   dans un panneau masqué, et `page.fill` attendait indéfiniment un champ non
   éditable — le harnais plantait sur un TimeoutError, sans jamais rendre une
   seule assertion. Un harnais qui meurt avant de tester n'est pas rouge sur
   le fond : il ne dit RIEN. On ouvre l'onglet, comme le fait un client. */
await page.click('.acc-tab[data-acc-tab="settings"]');
await page.waitForSelector('#accEmail',{state:'visible',timeout:5000});
await page.fill('#accEmail','nouveau@mail.fr');
await page.evaluate(()=>{const f=document.getElementById('accForm')||document.querySelector('#view-compte form');if(f)f.requestSubmit();});
await page.waitForTimeout(800);
const calls=await page.evaluate(()=>window.__calls);
const emailField=await page.evaluate(()=>document.getElementById('accEmail').value);
const toast=await page.evaluate(()=>{const t=document.querySelector('#toasts .toast');return t?t.textContent:'';});
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.error('❌ '+m);}else console.log('✅ '+m);};
ok(calls.some(c=>c[0]==='verifyBeforeUpdateEmail'&&c[1]==='nouveau@mail.fr'), 'verifyBeforeUpdateEmail appelé (pas updateEmail)');
ok(!calls.some(c=>c[0]==='updateEmail'), 'updateEmail PAS appelé');
ok(!calls.some(c=>c[0]==='updateDoc'&&('email' in c[1])), 'email NON écrit en Firestore (pas encore confirmé)');
ok(emailField==='ancien@mail.fr', 'champ email restauré sur l\'ancien (changement en attente)');
ok(/lien de confirmation.*nouveau@mail.fr/i.test(toast), 'message « lien de confirmation envoyé » ('+toast.slice(0,60)+'…)');
console.log(fail===0?'━━ ✅ H5 : verifyBeforeUpdateEmail, aucun écrit Firestore avant confirmation':'━━ ❌ '+fail);
await b.close();server.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(1);});
