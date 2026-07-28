const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PW+'/playwright');
const ROOT='/home/user/ish/pirates-tools';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port,base=`http://127.0.0.1:${port}`;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const ctx=await b.newContext();const page=await ctx.newPage();
await page.addInitScript(()=>{
  window.__calls=[];
  const user={uid:'u1',email:'j@t.fr',displayName:'Jean'};
  const mk=(name)=>(...a)=>{window.__calls.push([name,a.map(x=>x&&x.__path||(typeof x==='object'?'obj':x))]);return Promise.resolve();};
  window.PT_FIREBASE={configured:true,auth:{currentUser:user},
    onAuthStateChanged:(a,cb)=>{setTimeout(()=>cb(user),40);return()=>{};},
    doc:(...a)=>({__path:a.slice(1).join('/')}),
    getDoc:()=>Promise.resolve({exists:()=>true,data:()=>({name:'Jean',email:'j@t.fr'})}),
    setDoc:()=>Promise.resolve(),updateDoc:()=>Promise.resolve(),updateProfile:()=>Promise.resolve(),
    deleteDoc:(ref)=>{window.__calls.push(['deleteDoc',ref&&ref.__path]);return Promise.resolve();},
    collection:(...a)=>({__path:a.slice(1).join('/')}),query:()=>({}),orderBy:()=>({}),limit:()=>({}),
    getDocs:()=>Promise.resolve({forEach:(cb)=>{cb({ref:{__path:'users/u1/orders/o1'}});cb({ref:{__path:'users/u1/orders/o2'}});},empty:false,size:2}),
    addDoc:()=>Promise.resolve(),serverTimestamp:()=>0,
    EmailAuthProvider:{credential:(em,pw)=>{window.__calls.push(['credential',[em,pw]]);return {};}},
    reauthenticateWithCredential:()=>{window.__calls.push(['reauth',[]]);return Promise.resolve();},
    deleteUser:()=>{window.__calls.push(['deleteUser',[]]);return Promise.resolve();},
    signOut:()=>Promise.resolve(),sendPasswordResetEmail:()=>Promise.resolve(),updateEmail:()=>Promise.resolve(),verifyBeforeUpdateEmail:()=>Promise.resolve(),sendEmailVerification:()=>Promise.resolve()};
  localStorage.setItem('pt_consent','accepted');
  localStorage.setItem('pt:loyalty',JSON.stringify({totalSpent:1200}));
  window.confirm=()=>true; // accepte la confirmation
});
await page.goto(base+'/#/compte',{waitUntil:'load'});await page.waitForTimeout(1200);
// aller sur l'onglet Paramètres où vit le formulaire de suppression
await page.evaluate(()=>{const t=document.querySelector('[data-acc-tab="settings"]');if(t)t.click();});
await page.waitForTimeout(400);
await page.fill('#deleteAccountPwd','monMotDePasse');
await page.evaluate(()=>document.getElementById('deleteAccountForm').requestSubmit());
await page.waitForTimeout(800);
const calls=await page.evaluate(()=>window.__calls);
const loyaltyGone=await page.evaluate(()=>localStorage.getItem('pt:loyalty')===null);
const hash=await page.evaluate(()=>location.hash);
console.log('séquence:',JSON.stringify(calls.map(c=>c[0])));
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.error('❌ '+m);}else console.log('✅ '+m);};
const seq=calls.map(c=>c[0]);
ok(seq.indexOf('reauth')!==-1,'réauthentification par mot de passe effectuée');
const iReauth=seq.indexOf('reauth'), iDelUser=seq.indexOf('deleteUser');
const delDocs=calls.filter(c=>c[0]==='deleteDoc');
ok(delDocs.length>=3,'commandes (2) + profil supprimés ('+delDocs.length+' deleteDoc)');
ok(delDocs.some(c=>/orders\/o1/.test(c[1]))&&delDocs.some(c=>/orders\/o2/.test(c[1])),'les 2 commandes supprimées');
ok(delDocs.some(c=>c[1]==='users/u1'),'le profil users/u1 supprimé');
ok(iDelUser!==-1 && iReauth<iDelUser && delDocs.every((_,idx)=>true) && iDelUser>seq.indexOf('deleteDoc'),'ordre : réauth → Firestore → deleteUser (Auth en dernier)');
ok(loyaltyGone,'cache local pt:loyalty purgé');
ok(hash===''||hash==='#/','redirigé vers l\'accueil');
console.log(fail===0?'━━ ✅ M4 : suppression compte (réauth + purge Firestore + deleteUser) complète':'━━ ❌ '+fail);
await b.close();server.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(1);});
