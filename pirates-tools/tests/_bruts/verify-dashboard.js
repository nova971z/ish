const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT='/home/user/ish/pirates-tools';
const vercel=require(path.join(ROOT,'vercel.json'));
let CSP=vercel.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value.replace(/;?\s*upgrade-insecure-requests/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon','.woff2':'font/woff2'};

const STATS = { ok:true, stats:{
  totals:{ sessions:128, pageViews:410, clicks:263, newVisitors:37, returningVisitors:21 },
  devices:{ mobile:96, desktop:32 }, sources:{ instagram:54, google:40, direct:34 },
  daily:[{date:'2026-07-16',sessions:60,pageViews:200,clicks:120},{date:'2026-07-17',sessions:68,pageViews:210,clicks:143}],
  products:[ { productId:'makita-dga504z', views:88, selects:31, addToCart:12, purchases:3, avgTimeMs:42000 },
             { productId:'dewalt-dcg405n', views:64, selects:20, addToCart:7, purchases:1, avgTimeMs:15000 } ],
  clicks:[ { label:'chip:Meuleuses', count:73 }, { label:'dock:panier', count:41 }, { label:'wa:float', count:12 } ],
  geo:[ { country:'FR', count:88, lat:46, lng:2 }, { country:'GP', count:22 }, { country:'MQ', count:10 } ]
}};
const CLIENTS = { ok:true, total:2, clients:[
  { uid:'u1', name:'Jean Test', email:'jean@example.com', phone:'0690112233', address:'12 rue X, 97110 Pointe-à-Pitre', avatar:'', loyalty:{tier:'argent'}, orderCount:3, createdAt: Date.UTC(2026,5,1) },
  { uid:'u2', name:'', email:'anon@example.com', phone:'', address:'', avatar:'', loyalty:null, orderCount:0, createdAt: Date.UTC(2026,6,10) }
]};

const server=http.createServer((req,res)=>{
  const u=req.url.split('?')[0];
  if (u==='/api/admin'){
    const type=(req.url.split('?')[1]||'').match(/type=([^&]+)/);
    const t=type?decodeURIComponent(type[1]):'overrides';
    res.writeHead(200,{'Content-Type':'application/json'});
    if (t==='stats') return res.end(JSON.stringify(STATS));
    if (t==='clients') return res.end(JSON.stringify(CLIENTS));
    return res.end(JSON.stringify({ ok:true, overrides:{} }));
  }
  let p=decodeURIComponent(u); if(p==='/'||p==='')p='/index.html';
  const file=path.join(ROOT,p);
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':CSP});return res.end(fs.readFileSync(path.join(ROOT,'index.html')));}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Security-Policy':CSP});res.end(fs.readFileSync(file));
});

async function run(){
  await new Promise(r=>server.listen(0,r));
  const base=`http://localhost:${server.address().port}`;
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
  const page=await ctx.newPage();
  const perr=[], cspv=[];
  await page.addInitScript(()=>{ try{ sessionStorage.setItem('pt_admin_secret','test-secret'); }catch(_){}
    window.__csp=[]; document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.effectiveDirective+':'+(e.blockedURI||'').slice(0,40))); });
  page.on('pageerror',e=>perr.push(String(e).slice(0,160)));
  let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:'')); ok?pass++:fail++;};

  await page.goto(base+'/#/admin',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(800);
  check('admin déverrouillé (onglets visibles)', await page.evaluate(()=>!!document.querySelector('.admin-tab')));
  check('onglets Statistiques + Clients présents', await page.evaluate(()=>{
    var t=[...document.querySelectorAll('.admin-tab')].map(x=>x.textContent);
    return t.includes('Statistiques') && t.includes('Clients');
  }));

  // Onglet Statistiques
  await page.click('.admin-tab[data-admin-tab="stats"]'); await page.waitForTimeout(600);
  const stats = await page.evaluate(()=>{
    var el=document.getElementById('adminStats');
    return { html: el.innerHTML,
      cards:[...el.querySelectorAll('.stat-card__value')].map(x=>x.textContent),
      rows:[...el.querySelectorAll('.stat-table tbody tr')].length,
      bars:[...el.querySelectorAll('.stat-bar__label')].map(x=>x.textContent) };
  });
  check('compteur Visites = 128', stats.cards.includes('128'));
  check('nouveaux/récurrents affichés (37 / 21)', stats.cards.includes('37') && stats.cards.includes('21'));
  check('tableau produits rempli (2 lignes)', stats.rows===2, 'rows='+stats.rows);
  check('produit affiché par son titre (pas juste la clé)', /Makita/i.test(stats.html));
  check('temps moyen formaté (min/s)', /min|\bs\b/.test(stats.html));
  check('clics précis en barres (chip:Meuleuses)', stats.bars.some(b=>/Meuleuses/.test(b)));
  check('géo présente (FR/GP/MQ)', stats.bars.some(b=>b==='FR'));

  // Onglet Clients
  await page.click('.admin-tab[data-admin-tab="clients"]'); await page.waitForTimeout(500);
  const clients = await page.evaluate(()=>{
    var el=document.getElementById('adminClients');
    return { cards:[...el.querySelectorAll('.client-card')].length,
      hasEmail:/jean@example\.com/.test(el.innerHTML),
      hasPhone:/0690112233/.test(el.innerHTML),
      hasOrders:/3 commandes/.test(el.innerHTML),
      sansNom:/Sans nom/.test(el.innerHTML) };
  });
  check('2 cartes client', clients.cards===2);
  check('email client affiché', clients.hasEmail);
  check('téléphone client affiché', clients.hasPhone);
  check('nb commandes affiché (3 commandes)', clients.hasOrders);
  check('client sans nom → « Sans nom »', clients.sansNom);

  const csp = await page.evaluate(()=>window.__csp||[]);
  check('0 violation CSP', csp.length===0, csp.join(','));
  check('0 erreur JS', perr.length===0, perr.join(' | ')||'aucune');

  await page.screenshot({ path:'/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/dashboard-stats.png', fullPage:true });
  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if(fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
