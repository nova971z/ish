const { join, basename } = require('path');
const { RACINE , playwright, optionsNavigateur } = require('./_socle.cjs');
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium} = playwright();
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port,base=`http://127.0.0.1:${port}`;
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1280,height:900}});const page=await ctx.newPage();
const errs=[];page.on('pageerror',e=>errs.push(e.message));
const products=JSON.parse(fs.readFileSync(ROOT+'/products.json','utf8'));const prod=products[0];
await page.addInitScript(({slug,title})=>{
  localStorage.setItem('pt_cart',JSON.stringify({version:'1',items:[{key:slug,title:title,qty:1}]}));
  localStorage.setItem('pt_consent','accepted');
},{slug:prod.slug||prod.id,title:prod.title});
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.error('❌ '+m);}else console.log('✅ '+m);};

await page.goto(base+'/#/',{waitUntil:'load'});await page.waitForTimeout(1500);
// 1) Skip-link : premier Tab → skip-link ; Enter → focus <main>
await page.keyboard.press('Tab');
const first=await page.evaluate(()=>({id:document.activeElement.id,cls:document.activeElement.className,visible:getComputedStyle(document.activeElement).top}));
ok(first.id==='skipLink','premier Tab = skip-link (révélé au focus: top '+first.visible+')');
await page.keyboard.press('Enter');await page.waitForTimeout(300);
const afterEnter=await page.evaluate(()=>({id:document.activeElement.id,hash:location.hash}));
ok(afterEnter.id==='app','Enter → focus sur <main id=app>');
ok(afterEnter.hash===''||afterEnter.hash==='#/','le hash du routeur n\'est pas pollué ('+afterEnter.hash+')');

// 2) Focus routage : navigation → h1 de la vue focusé
await page.evaluate(()=>{location.hash='#/catalogue';});await page.waitForTimeout(1000);
const routeFocus=await page.evaluate(()=>({tag:document.activeElement.tagName,txt:document.activeElement.textContent.trim().slice(0,20)}));
ok(routeFocus.tag==='H1'&&/Catalogue/.test(routeFocus.txt),'routage → focus sur le h1 de la vue ('+routeFocus.txt+')');

// 3) Modale paiement : Tab confiné, Escape restaure le déclencheur
await page.evaluate(()=>{location.hash='#/devis';});await page.waitForTimeout(1000);
await page.click('#devisPay');await page.waitForTimeout(700);
let inside=true;
for(let i=0;i<25;i++){
  await page.keyboard.press('Tab');
  const w=await page.evaluate(()=>!!document.activeElement.closest('#payModal'));
  if(!w){inside=false;break;}
}
ok(inside,'25 × Tab : le focus reste confiné dans la modale de paiement');
for(let i=0;i<5;i++){await page.keyboard.press('Shift+Tab');}
const insideBack=await page.evaluate(()=>!!document.activeElement.closest('#payModal'));
ok(insideBack,'Shift+Tab : confiné aussi en arrière');
await page.keyboard.press('Escape');await page.waitForTimeout(500);
const restored=await page.evaluate(()=>document.activeElement.id);
ok(restored==='devisPay','Escape → focus restauré sur le bouton déclencheur (#'+restored+')');

// 4) Drawer : ouverture → focus dedans, confiné ; Escape → restauré
await page.click('#menu-toggle');await page.waitForTimeout(500);
const inDrawer=await page.evaluate(()=>!!document.activeElement.closest('#side-menu'));
ok(inDrawer,'ouverture drawer → focus déplacé dedans');
for(let i=0;i<15;i++){await page.keyboard.press('Tab');}
const stillIn=await page.evaluate(()=>!!document.activeElement.closest('#side-menu'));
ok(stillIn,'15 × Tab : confiné dans le drawer');
await page.keyboard.press('Escape');await page.waitForTimeout(400);
const backToggle=await page.evaluate(()=>document.activeElement.id);
ok(backToggle==='menu-toggle','Escape → focus restauré sur le bouton menu');

if(errs.length){fail++;console.error('pageerrors:',errs.slice(0,3));}
console.log(fail===0?'━━ ✅ C6 : 9/9 assertions clavier':'━━ ❌ '+fail+' échecs');
await b.close();server.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(1);});
