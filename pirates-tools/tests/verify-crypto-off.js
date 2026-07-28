const { playwright, optionsNavigateur, RACINE, sortie } = require('./_socle.cjs');
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = playwright();
const ROOT = RACINE;
const vercel=require(path.join(ROOT,'vercel.json'));
let CSP=vercel.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value.replace(/;?\s*upgrade-insecure-requests/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/'||p==='')p='/index.html';const file=path.join(ROOT,p);if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':CSP});return res.end(fs.readFileSync(path.join(ROOT,'index.html')));}res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Security-Policy':CSP});res.end(fs.readFileSync(file));});

async function run(){
  await new Promise(r=>server.listen(0,r));
  const base=`http://localhost:${server.address().port}`;
  const browser=await chromium.launch({args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
  const page=await ctx.newPage();
  const perr=[]; page.on('pageerror',e=>perr.push(String(e).slice(0,140)));
  let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:'')); ok?pass++:fail++;};

  await page.goto(base+'/#/catalogue',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
  // Ouvrir la modale de paiement directement via l'API exposée
  await page.evaluate(()=>window.openPayModal([{key:'makita-dga504z',title:'Test',price:100,qty:1}]));
  await page.waitForTimeout(500);

  const st = await page.evaluate(()=>{
    const modal=document.getElementById('payModal');
    const cryptoTab=modal.querySelector('.pay-tab[data-pay-tab="crypto"]');
    const cardTab=modal.querySelector('.pay-tab[data-pay-tab="card"]');
    const tabs=modal.querySelector('.pay-tabs');
    const cryptoPane=modal.querySelector('[data-pay-pane="crypto"]');
    const cardPane=modal.querySelector('[data-pay-pane="card"]');
    const vis=el=>!!el && el.offsetHeight>0 && el.offsetWidth>0 && !el.hidden;
    return {
      modalOpen:!modal.hidden,
      cryptoTabVisible:vis(cryptoTab),
      cardPaneVisible:vis(cardPane),
      cryptoPaneHidden: !cryptoPane || cryptoPane.hidden,
      tabsVisible:vis(tabs),
    };
  });
  check('modale ouverte', st.modalOpen);
  check('onglet CRYPTO invisible', !st.cryptoTabVisible);
  check('panneau crypto masqué', st.cryptoPaneHidden);
  check('panneau CARTE visible', st.cardPaneVisible);
  check('barre d’onglets masquée (un seul moyen)', !st.tabsVisible);

  // Tentative de forcer la bascule crypto par code → doit rester sur carte
  const forced = await page.evaluate(()=>{
    // simulate clicking hidden crypto tab + calling switch directly is internal;
    // we can only click — hidden elements are unclickable, so assert pane stays card
    const cryptoPane=document.querySelector('[data-pay-pane="crypto"]');
    const cardPane=document.querySelector('[data-pay-pane="card"]');
    return { cryptoActive: cryptoPane && cryptoPane.classList.contains('is-active'),
             cardActive: cardPane && cardPane.classList.contains('is-active') };
  });
  check('carte reste le panneau actif, crypto jamais actif', !forced.cryptoActive && forced.cardActive, JSON.stringify(forced));

  check('0 erreur JS', perr.length===0, perr.join(' | ')||'aucune');
  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if(fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
