const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PW+'/playwright');
const ROOT='/home/user/ish/pirates-tools';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary'};
// CSP EXACTE depuis vercel.json (on retire upgrade-insecure-requests : le
// serveur de test est en http localhost, la prod est 100% https).
const vercel=JSON.parse(fs.readFileSync(ROOT+'/vercel.json','utf8'));
let CSP='';vercel.headers[0].headers.forEach(h=>{if(h.key==='Content-Security-Policy')CSP=h.value;});
CSP=CSP.replace(/;\s*upgrade-insecure-requests/,'');
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Content-Security-Policy':CSP});fs.createReadStream(fp).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port,base=`http://127.0.0.1:${port}`;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1280,height:900}});const page=await ctx.newPage();
const cspViolations=[];
page.on('console',m=>{const t=m.text();if(/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(t))cspViolations.push(t.slice(0,140));});
const products=JSON.parse(fs.readFileSync(ROOT+'/products.json','utf8'));const prod=products[0];
await page.addInitScript(({slug,title})=>{localStorage.setItem('pt_cart',JSON.stringify({version:'1',items:[{key:slug,title:title,qty:1}]}));localStorage.setItem('pt_consent','accepted');},{slug:prod.slug||prod.id,title:prod.title});

await page.goto(base+'/#/catalogue',{waitUntil:'load'});await page.waitForTimeout(2500);
const st=await page.evaluate(()=>({
  booted:window.PT_BOOTED===true,
  stripePk:typeof window.PT_STRIPE_PK==='string'&&window.PT_STRIPE_PK.length>0,
  cryptoCfg:!!(window.PT_CRYPTO_CONFIG&&window.PT_CRYPTO_CONFIG.networks),
  apiBaseSet:typeof window.PT_API_BASE==='string',
  cards:document.querySelectorAll('#list .product-card').length,
  h1styled:(()=>{const h=document.querySelector('.catalogue-title');return h&&getComputedStyle(h).fontSize;})()
}));
// Sépare les VRAIES violations CSP des simples échecs réseau (CDN injoignables en sandbox).
const own=cspViolations.filter(v=>/127\.0\.0\.1|'self'|inline|eval/i.test(v)&&!/stripe|gstatic|googleapis|jsdelivr/i.test(v));
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.error('❌ '+m);}else console.log('✅ '+m);};
ok(st.stripePk,'script inline #2 (PT_STRIPE_PK) exécuté → hash correct');
ok(st.cryptoCfg,'script inline #3 (PT_CRYPTO_CONFIG) exécuté → hash correct');
ok(st.apiBaseSet,'PT_API_BASE défini');
ok(st.booted,'app.js exécuté sous script-src \'self\' → PT_BOOTED');
ok(st.cards>0,'catalogue rendu ('+st.cards+' cartes)');
ok(st.h1styled&&st.h1styled!=='16px','styles appliqués (titre '+st.h1styled+')');
ok(own.length===0,'0 violation CSP sur les ressources propres du site'+(own.length?' — '+own.join(' | '):''));
console.log('violations CSP totales observées (dont échecs réseau CDN attendus):',cspViolations.length);
cspViolations.slice(0,6).forEach(v=>console.log('   ·',v));
console.log(fail===0?'━━ ✅ H1 : CSP stricte, aucun blocage du code propre, app fonctionnelle':'━━ ❌ '+fail);
await b.close();server.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(1);});
