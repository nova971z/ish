const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PW+'/playwright');
const ROOT='/home/user/ish/pirates-tools';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port,base=`http://127.0.0.1:${port}`;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1280,height:900}});const page=await ctx.newPage();
const errs=[];page.on('pageerror',e=>errs.push(e.message));
const products=JSON.parse(fs.readFileSync(ROOT+'/products.json','utf8'));const prod=products[0];
await page.addInitScript(({slug,title})=>{
  /* panier vide : le clic Payer déclenche le toast d'erreur */
  localStorage.setItem('pt_consent','accepted');
},{slug:prod.slug||prod.id,title:prod.title});
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.error('❌ '+m);}else console.log('✅ '+m);};

await page.goto(base+'/#/',{waitUntil:'load'});await page.waitForTimeout(1800);
// Assertions de styles calculés — les valeurs qui venaient de l'inline doivent
// être identiques maintenant qu'elles viennent de styles.css §45.
const drawerClosed=await page.evaluate(()=>{
  const d=document.getElementById('side-menu');const cs=getComputedStyle(d);
  return{width:cs.width,z:cs.zIndex,bg:cs.backgroundColor,transform:cs.transform!=='none'};
});
ok(drawerClosed.z==='1001'&&drawerClosed.transform,'drawer fermé : z-index 1001 + translate hors écran (valeurs ex-inline)');
// dock
const dock=await page.evaluate(()=>{const d=document.getElementById('dock');if(!d)return null;const cs=getComputedStyle(d);return{pos:cs.position,z:cs.zIndex,left:cs.left};});
ok(dock&&dock.pos==='fixed'&&dock.z==='999','dock : position fixed + z-index 999');
// drawer OUVERT
await page.click('#menu-toggle');await page.waitForTimeout(600);
const drawerOpen=await page.evaluate(()=>{
  const d=document.getElementById('side-menu');const cs=getComputedStyle(d);
  const bd=document.getElementById('menuBackdrop');const bcs=bd?getComputedStyle(bd):null;
  return{transform:cs.transform,backdropZ:bcs?bcs.zIndex:null,backdropVisible:bcs?bcs.display:null};
});
ok(drawerOpen.transform==='matrix(1, 0, 0, 1, 0, 0)','drawer ouvert : translate3d(0,0,0)');
ok(drawerOpen.backdropZ==='1000'&&drawerOpen.backdropVisible==='block','backdrop : z-index effectif 1000 + visible');
await page.screenshot({path:'/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/shots/c4-drawer.png'});
await page.keyboard.press('Escape');await page.waitForTimeout(400);
// toast
await page.evaluate(()=>{location.hash='#/devis';});await page.waitForTimeout(800);
const toastInfo=await page.evaluate(()=>{
  // déclenche un toast de chaque type via l'UI indirecte : ajoute au panier vide → toast erreur sur Payer
  const t=document.getElementById('toasts');
  return t?{z:getComputedStyle(t).zIndex,pos:getComputedStyle(t).position}:null;
});
ok(toastInfo&&toastInfo.z==='10000'&&toastInfo.pos==='fixed','#toasts : z-index effectif 10000');
await page.evaluate(()=>document.getElementById('devisPay').click());await page.waitForTimeout(400); // panier vide → toast erreur
const toastShown=await page.evaluate(()=>{
  const t=document.querySelector('#toasts .toast');
  return t?{bg:getComputedStyle(t).backgroundColor,text:t.textContent}:null;
});
ok(!!toastShown,'toast affiché (panier vide) : '+(toastShown?toastShown.text:'—'));
if(errs.length){fail++;console.error('pageerrors:',errs.slice(0,3));}
console.log(fail===0?'━━ ✅ C4 : styles calculés identiques depuis styles.css §45 (drawer/dock/backdrop/toasts)':'━━ ❌ '+fail);
await b.close();server.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(1);});
