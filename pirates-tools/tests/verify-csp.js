const { join, basename } = require('path');
const { RACINE , playwright, optionsNavigateur } = require('./_socle.cjs');
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium} = playwright();
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary'};
// CSP EXACTE depuis vercel.json (on retire upgrade-insecure-requests : le
// serveur de test est en http localhost, la prod est 100% https).
const vercel=JSON.parse(fs.readFileSync(ROOT+'/vercel.json','utf8'));
let CSP='';vercel.headers[0].headers.forEach(h=>{if(h.key==='Content-Security-Policy')CSP=h.value;});
CSP=CSP.replace(/;\s*upgrade-insecure-requests/,'');
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Content-Security-Policy':CSP});fs.createReadStream(fp).pipe(res);});
(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port,base=`http://127.0.0.1:${port}`;
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1280,height:900}});const page=await ctx.newPage();
const cspViolations=[];
page.on('console',m=>{const t=m.text();if(/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(t))cspViolations.push(t.slice(0,140));});
const products=JSON.parse(fs.readFileSync(ROOT+'/products.json','utf8'));const prod=products[0];
await page.addInitScript(({slug,title})=>{localStorage.setItem('pt_cart',JSON.stringify({version:'1',items:[{key:slug,title:title,qty:1}]}));localStorage.setItem('pt_consent','accepted');},{slug:prod.slug||prod.id,title:prod.title});

await page.goto(base+'/#/catalogue',{waitUntil:'load'});await page.waitForTimeout(2500);
const st=await page.evaluate(()=>({
  booted:window.PT_BOOTED===true,
  cryptoCfg:!!(window.PT_CRYPTO_CONFIG&&window.PT_CRYPTO_CONFIG.networks),
  apiBaseSet:typeof window.PT_API_BASE==='string',
  cards:document.querySelectorAll('#list .product-card').length,
  h1styled:(()=>{const h=document.querySelector('.catalogue-title');return h&&getComputedStyle(h).fontSize;})()
}));
// Sépare les VRAIES violations CSP des simples échecs réseau (CDN injoignables en sandbox).
const own=cspViolations.filter(v=>/127\.0\.0\.1|'self'|inline|eval/i.test(v)&&!/stripe|gstatic|googleapis|jsdelivr/i.test(v));
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.error('❌ '+m);}else console.log('✅ '+m);};
ok(st.cryptoCfg,'script inline #3 (PT_CRYPTO_CONFIG) exécuté → hash correct');
/* ⚠️ ASSERTION MORTE REMPLACÉE (01/08/2026). Elle exigeait `PT_STRIPE_PK`,
   un global posé par un script inline qui n'existe plus depuis le retrait de
   l'ancien encaisseur. Elle était donc ROUGE en permanence — dans un harnais
   absent du noyau, donc que personne ne lançait. Un harnais rouge qu'on ne
   regarde pas est pire qu'un harnais absent : il donne l'illusion d'une
   couverture. Le script inline #2 pose aujourd'hui `PT_API_BASE`, et c'est
   l'assertion ci-dessous qui prouve que son empreinte CSP est bonne. */
ok(st.apiBaseSet,'script inline #2 (PT_API_BASE) exécuté → hash correct');
ok(st.booted,'app.js exécuté sous script-src \'self\' → PT_BOOTED');
ok(st.cards>0,'catalogue rendu ('+st.cards+' cartes)');
ok(st.h1styled&&st.h1styled!=='16px','styles appliqués (titre '+st.h1styled+')');
ok(own.length===0,'0 violation CSP sur les ressources propres du site'+(own.length?' — '+own.join(' | '):''));
console.log('violations CSP totales observées (dont échecs réseau CDN attendus):',cspViolations.length);
cspViolations.slice(0,6).forEach(v=>console.log('   ·',v));

/* ═══ SCRIPT INLINE #1 — LE WATCHDOG, LE SEUL QUI N'ÉTAIT PAS COUVERT ══════
   Les scripts #2 et #3 se prouvent par le global qu'ils posent. Le #1 ne pose
   rien : il arme un `setTimeout` qui n'affiche un message QUE si l'application
   n'a pas démarré. Sur une page saine, il est donc invisible — et son
   empreinte CSP pouvait devenir fausse sans que rien ne rougisse.

   ⛔ Ce n'est pas un détail : c'est le filet de la panne du 29/07/2026, où le
   site était entièrement mort SANS AUCUN MESSAGE. Un watchdog bloqué par la
   CSP, c'est un écran noir au lieu d'une explication.

   On le met donc en situation : on coupe `app.js`, l'application ne démarre
   pas, et le message DOIT apparaître. */
{
  const ctx2=await b.newContext({viewport:{width:1280,height:900}});
  // On coupe app.js AVANT la navigation : c'est la panne qu'on rejoue.
  await ctx2.route('**/app.js*',r=>r.abort());
  const p2=await ctx2.newPage();
  await p2.goto(base+'/#/catalogue',{waitUntil:'domcontentloaded'});
  // Le watchdog s'arme à 7 s ; on laisse une marge, sans dépendre du chiffre
  // exact (il peut changer — c'est le comportement qui compte, pas la valeur).
  const vu=await p2.waitForSelector('#ptBootWatchdog',{timeout:15000}).then(()=>true).catch(()=>false);
  const booted2=await p2.evaluate(()=>window.PT_BOOTED===true).catch(()=>false);
  ok(!booted2,'préalable : app.js coupé, l\'application n\'a effectivement PAS démarré');
  ok(vu,'script inline #1 (watchdog) exécuté → un message s\'affiche au lieu d\'un écran noir');
  await ctx2.close();
}
console.log(fail===0?'━━ ✅ H1 : CSP stricte, aucun blocage du code propre, app fonctionnelle':'━━ ❌ '+fail);
await b.close();server.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(1);});
