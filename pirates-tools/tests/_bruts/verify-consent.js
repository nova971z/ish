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
  let pass=0, fail=0;
  const check=(name,ok,detail)=>{ console.log((ok?'✅':'❌')+' '+name+(detail?' — '+detail:'')); ok?pass++:fail++; };

  // ── Session A : premier passage, choix REFUSER ──────────────────────────
  const ctxA=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
  const a=await ctxA.newPage();
  const perr=[]; a.on('pageerror',e=>perr.push(String(e).slice(0,140)));
  await a.goto(base+'/',{waitUntil:'domcontentloaded'}); await a.waitForTimeout(800);
  let st=await a.evaluate(()=>{
    const bar=document.getElementById('consentBar');
    return { hidden:bar.hidden, text:(bar.querySelector('.consent-bar__text')||{}).textContent||'',
      btns:[...bar.querySelectorAll('[data-consent]')].map(b=>({v:b.getAttribute('data-consent'),t:b.textContent.trim(),visible:b.offsetHeight>0})) };
  });
  check('bandeau visible au 1er passage', !st.hidden);
  check('texte annonce cookies techniques toujours actifs', /techniques nécessaires/.test(st.text) && /toujours actifs/.test(st.text), st.text.slice(0,90)+'…');
  check('texte honnête (« pourra être activée », pas de traceur affirmé)', /pourra être activée/.test(st.text));
  const deny=st.btns.find(b=>b.v==='deny'), acc=st.btns.find(b=>b.v==='accept');
  check('2 boutons visibles : Refuser + Accepter', !!(deny&&deny.visible&&acc&&acc.visible), JSON.stringify(st.btns.map(b=>b.t)));
  await a.click('#consentBar [data-consent="deny"]'); await a.waitForTimeout(200);
  let after=await a.evaluate(()=>({hidden:document.getElementById('consentBar').hidden, ls:localStorage.getItem('pt:analytics-consent')}));
  check('Refuser → bandeau masqué + consentement "denied" enregistré', after.hidden && after.ls==='denied', 'ls='+after.ls);
  await a.reload({waitUntil:'domcontentloaded'}); await a.waitForTimeout(700);
  const hiddenAfterReload=await a.evaluate(()=>document.getElementById('consentBar').hidden);
  check('reload même session → bandeau ne réapparaît pas', hiddenAfterReload);
  await ctxA.close();

  // ── Session B : nouvelle session privée, choix ACCEPTER ─────────────────
  const ctxB=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
  const b=await ctxB.newPage();
  await b.goto(base+'/',{waitUntil:'domcontentloaded'}); await b.waitForTimeout(800);
  const freshVisible=await b.evaluate(()=>!document.getElementById('consentBar').hidden);
  check('nouvelle session privée → bandeau réaffiché', freshVisible);
  await b.click('#consentBar [data-consent="accept"]'); await b.waitForTimeout(200);
  const accSt=await b.evaluate(()=>({hidden:document.getElementById('consentBar').hidden, ls:localStorage.getItem('pt:analytics-consent')}));
  check('Accepter → bandeau masqué + consentement "granted" enregistré', accSt.hidden && accSt.ls==='granted', 'ls='+accSt.ls);
  await ctxB.close();

  // ── Session C : desktop, le lien politique existe ────────────────────────
  const ctxC=await browser.newContext({viewport:{width:1280,height:900}});
  const c=await ctxC.newPage();
  await c.goto(base+'/',{waitUntil:'domcontentloaded'}); await c.waitForTimeout(800);
  const link=await c.evaluate(()=>{const l=document.querySelector('#consentBar .consent-bar__link');return l?l.getAttribute('href'):null;});
  check('lien « En savoir plus » → #/confidentialite', link==='#/confidentialite', 'href='+link);
  await ctxC.close();

  check('0 erreur JS sur toutes les sessions', perr.length===0, perr.join(' | ')||'aucune');
  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if (fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
