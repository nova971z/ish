const { playwright, optionsNavigateur, RACINE, sortie } = require('./_socle.cjs');
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = playwright();
const ROOT = RACINE;
const vercel=require(path.join(ROOT,'vercel.json'));
let CSP=vercel.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value.replace(/;?\s*upgrade-insecure-requests/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon','.woff2':'font/woff2'};

// Serveur : sert le site + capture les POST /api/events (le "beacon sink").
const received = [];
const server=http.createServer((req,res)=>{
  if (req.method==='POST' && req.url.split('?')[0]==='/api/events'){
    let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{received.push(JSON.parse(b));}catch(_){} res.writeHead(204).end(); });
    return;
  }
  let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/'||p==='')p='/index.html';
  const file=path.join(ROOT,p);
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':CSP});return res.end(fs.readFileSync(path.join(ROOT,'index.html')));}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Security-Policy':CSP});res.end(fs.readFileSync(file));
});

const allEvents = () => received.flatMap(p => (p.events||[]).map(e => ({...e, _consent:p.consent, _vid:p.visitorId, _device:p.device, _source:p.source})));

async function run(){
  await new Promise(r=>server.listen(0,r));
  const base=`http://localhost:${server.address().port}`;
  const browser=await chromium.launch({args:['--no-sandbox']});
  let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:'')); ok?pass++:fail++;};

  // ── Session 0 : AUTOMATISATION (navigator.webdriver=true, défaut Playwright)
  // → aucun beacon ne doit partir (garde anti-bot client).
  const ctx0=await browser.newContext({viewport:{width:390,height:844}, userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'});
  const p0=await ctx0.newPage();
  await p0.goto(base+'/',{waitUntil:'domcontentloaded'}); await p0.waitForTimeout(1200);
  await p0.evaluate(()=>{ window.dispatchEvent(new Event('pagehide')); }); await p0.waitForTimeout(300);
  check('webdriver=true (automatisation) → AUCUN beacon', received.length===0, 'reçus='+received.length);
  received.length=0; await ctx0.close();

  // ── Session 1 : visiteur ANONYME (pas de consentement) ──────────────────
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true, userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'});
  const page=await ctx.newPage();
  // Simule un VRAI navigateur (Playwright force webdriver=true → on l'annule).
  await page.addInitScript(()=>{ try{ Object.defineProperty(navigator,'webdriver',{get:function(){return false;}}); }catch(_){} });
  const perr=[]; page.on('pageerror',e=>perr.push(String(e).slice(0,140)));
  await page.goto(base+'/',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(400);
  // naviguer catalogue → produit (view_item + time_on_item), cliquer un chip + dock
  await page.evaluate(()=>{ location.hash='#/catalogue'; }); await page.waitForTimeout(500);
  /* ⚠️ MÊME DÉFAUT QUE CI-DESSOUS, RESTÉ SUR LA CATÉGORIE (corrigé 01/08/2026).
     Ce harnais cliquait `[data-cat="Meuleuses"]`, une catégorie nommée en dur.
     L'user a regroupé ses familles — « Meuleuses » est devenue « Meulage,
     découpe et polissage ». La puce n'existait donc plus, `if(c)` ne cliquait
     RIEN, et le harnais annonçait « le clic sur une puce n'est plus mesuré »
     alors que la mesure d'audience marchait parfaitement.
     ⛔ Un harnais ne nomme JAMAIS une donnée du catalogue : c'est un choix
     délibéré de l'user, pas un défaut. On prend la PREMIÈRE puce réellement
     rendue (hors « Tout », qui ne filtre rien) et on vérifie que SON clic
     remonte. Aucun renommage de famille ne peut plus le casser. */
  const chipCat = await page.evaluate(()=>{
    var c=[...document.querySelectorAll('#catList .cat-chip')].find(x=>x.getAttribute('data-cat'));
    if(!c) return null;
    c.click();
    return c.getAttribute('data-track');
  });
  await page.waitForTimeout(300);
  // ⚠️ ANCRAGE SUR UN PRODUIT NOMMÉ, SUPPRIMÉ LE 28/07 : ce harnais ouvrait
  // « makita-dga504z », retiré du catalogue lors de la purge voulue par l'user.
  // Il annonçait donc « view_item n'est plus émis » — une fausse alerte de
  // régression sur la mesure d'audience. On prend désormais le PREMIER produit
  // réellement présent au catalogue : plus aucune suppression ne peut le casser.
  const PRODUIT = await page.evaluate(async () => {
    const r = await fetch('/products.json'); const j = await r.json();
    const l = Array.isArray(j) ? j : (j.products || []);
    const p = l.find(x => x && x.id && x.title);
    return p ? p.id : null;
  });
  if (!PRODUIT) { console.log('⛔ PRÉALABLE NON REMPLI — aucun produit au catalogue'); process.exit(1); }
  await page.evaluate((id)=>{ location.hash='#/produit/'+id; }, PRODUIT); await page.waitForTimeout(900);
  await page.evaluate(()=>{ location.hash='#/'; }); await page.waitForTimeout(400); // quitte le produit → flush time_on_item
  await page.evaluate(()=>{ var d=document.querySelector('[data-track="dock:catalogue"]'); if(d) d.click(); }); await page.waitForTimeout(300);
  // forcer un flush (pagehide)
  await page.evaluate(()=>{ window.dispatchEvent(new Event('pagehide')); }); await page.waitForTimeout(400);

  const ev = allEvents();
  const names = ev.map(e=>e.event);
  check('session_start émis', names.includes('session_start'));
  check('page_view émis', names.includes('page_view'));
  check('view_item émis avec id produit', ev.some(e=>e.event==='view_item'&&e.id===PRODUIT), 'produit='+PRODUIT);
  check('time_on_item émis avec ms>0', ev.some(e=>e.event==='time_on_item'&&e.id===PRODUIT&&e.ms>0), JSON.stringify(ev.find(e=>e.event==='time_on_item')||{}));
  // PRÉALABLE : sans puce rendue, l'assertion suivante ne vérifierait rien.
  check('préalable : une puce de catégorie est rendue au catalogue', !!chipCat, chipCat||'AUCUNE');
  check('click sur une puce de catégorie capturé',
    !!chipCat && ev.some(e=>e.event==='click'&&e.t===chipCat), chipCat||'—');
  check('click dock:catalogue capturé', ev.some(e=>e.event==='click'&&e.t==='dock:catalogue'));
  check('device=mobile détecté', ev.every(e=>e._device==='mobile'));
  check('ANONYME : consent=false partout', ev.every(e=>e._consent===false));
  check('ANONYME : aucun visitorId envoyé', ev.every(e=>e._vid===undefined));
  // PII : aucun payload ne doit contenir @ ou un email
  const raw = JSON.stringify(received);
  check('AUCUNE PII dans les payloads (@, prix, nom produit)', !/@|"price"|"name"|dewalt|makita.*chocs/i.test(raw), raw.slice(0,120));
  check('localStorage pt:vid ABSENT sans consentement', await page.evaluate(()=>!localStorage.getItem('pt:vid')));
  check('0 erreur JS', perr.length===0, perr.join(' | ')||'aucune');
  await ctx.close();

  // ── Session 2 : visiteur CONSENTANT ─────────────────────────────────────
  received.length=0;
  const ctx2=await browser.newContext({viewport:{width:1280,height:900}});
  const page2=await ctx2.newPage();
  await page2.addInitScript(()=>{ try{ Object.defineProperty(navigator,'webdriver',{get:function(){return false;}}); }catch(_){} });
  await page2.goto(base+'/',{waitUntil:'domcontentloaded'}); await page2.waitForTimeout(400);
  await page2.click('#consentBar [data-consent="accept"]'); await page2.waitForTimeout(300);
  // Même précaution qu'en session 1 : aucun produit nommé en dur.
  const PRODUIT2 = await page2.evaluate(async () => {
    const r = await fetch('/products.json'); const j = await r.json();
    const l = Array.isArray(j) ? j : (j.products || []);
    const p = l.find(x => x && x.id && x.title);
    return p ? p.id : null;
  });
  await page2.evaluate((id)=>{ location.hash='#/produit/'+id; }, PRODUIT2); await page2.waitForTimeout(700);
  await page2.evaluate(()=>{ window.dispatchEvent(new Event('pagehide')); }); await page2.waitForTimeout(400);
  const ev2 = allEvents();
  check('CONSENTI : consent=true après Accepter', ev2.length>0 && ev2.some(e=>e._consent===true), 'n='+ev2.length);
  check('CONSENTI : visitorId persistant envoyé', ev2.some(e=>typeof e._vid==='string'&&e._vid.length>=16));
  check('CONSENTI : localStorage pt:vid présent', await page2.evaluate(()=>!!localStorage.getItem('pt:vid')));
  check('device=desktop détecté', ev2.some(e=>e._device==='desktop'));
  await ctx2.close();

  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if(fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
