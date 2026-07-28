const { join, basename } = require('path');
const { RACINE , playwright, optionsNavigateur } = require('./_socle.cjs');
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium} = playwright();
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary'};
const sockets=new Set();
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port,base=`http://127.0.0.1:${port}`;
const b=await chromium.launch({args:['--no-sandbox']});
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.error('❌ '+m);}else console.log('✅ '+m);};

// ── 1) WATCHDOG : app.js ne charge pas → message + bouton Recharger à ~7s
{
  const ctx=await b.newContext({viewport:{width:1180,height:820}});
  const page=await ctx.newPage();
  await page.route('**/app.js*',r=>r.abort());
  await page.goto(base+'/#/catalogue',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2000);
  ok(await page.evaluate(()=>!document.getElementById('ptBootWatchdog')),'watchdog silencieux avant 7s');
  await page.waitForTimeout(6000);
  const wd=await page.evaluate(()=>{const a=document.getElementById("ptBootWatchdog");return a?{txt:a.textContent.slice(0,60),btn:!!a.querySelector('button')}:null;});
  ok(wd&&wd.btn&&/chargement ne s.est pas termin/i.test(wd.txt),'app.js mort → watchdog affiché avec bouton Recharger ('+(wd&&wd.txt)+')');
  await ctx.close();
}
// ── 1b) boot normal → PAS de watchdog
{
  const ctx=await b.newContext({viewport:{width:1180,height:820}});
  const page=await ctx.newPage();
  await page.goto(base+'/#/catalogue',{waitUntil:'load'});
  await page.waitForTimeout(8200);
  ok(await page.evaluate(()=>window.PT_BOOTED===true&&!document.getElementById('ptBootWatchdog')),'boot normal → PT_BOOTED, aucun watchdog');
  await ctx.close();
}
// ── 2) SW : panne réseau + nouvelle version absente du cache → sert l'ancienne (ignoreSearch)
{
  const ctx=await b.newContext({viewport:{width:1180,height:820}});
  const page=await ctx.newPage();
  await page.goto(base+'/#/',{waitUntil:'load'});
  // attend que le SW contrôle la page et ait fini son précache
  await page.waitForFunction(()=>navigator.serviceWorker&&navigator.serviceWorker.controller,{timeout:10000}).catch(()=>{});
  await page.waitForTimeout(2500);
  const controlled=await page.evaluate(()=>!!navigator.serviceWorker.controller);
  ok(controlled,'page contrôlée par le Service Worker');
  // PANNE RÉSEAU TOTALE : on coupe le serveur (connexions détruites)
  await new Promise(r=>{server.close(()=>r());sockets.forEach(s=>s.destroy());});
  const rescue=await page.evaluate(async()=>{
    try{const r=await fetch('./app.js?v=99999'); const t=await r.text(); return{status:r.status,len:t.length};}
    catch(e){return{err:String(e).slice(0,60)};}
  });
  ok(rescue.status===200&&rescue.len>100000,'réseau coupé + version inconnue → le SW sert l\'app en cache ('+JSON.stringify(rescue)+')');
  await ctx.close();
}
console.log(fail===0?'━━ ✅ résilience : watchdog + sauvetage SW prouvés':'━━ ❌ '+fail);
await b.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(1);});
