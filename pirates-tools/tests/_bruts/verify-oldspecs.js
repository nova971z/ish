const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT='/home/user/ish/pirates-tools';
const OUT='/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad';
const vercel=require(path.join(ROOT,'vercel.json'));
let CSP=vercel.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value.replace(/;?\s*upgrade-insecure-requests/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/'||p==='')p='/index.html';const file=path.join(ROOT,p);if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':CSP});return res.end(fs.readFileSync(path.join(ROOT,'index.html')));}res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Security-Policy':CSP});res.end(fs.readFileSync(file));});

async function run(){
  await new Promise(r=>server.listen(0,r));
  const base=`http://localhost:${server.address().port}`;
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const page=await (await browser.newContext({viewport:{width:1200,height:1000}})).newPage();
  const perr=[]; page.on('pageerror',e=>perr.push(String(e).slice(0,140)));
  let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:''));ok?pass++:fail++;};

  // Cas 1 : ancien produit MAINTENANT rempli (DeWALT DCF894P2, 447 Nm)
  async function pdp(slug){
    await page.goto(base+'/#/produit/'+slug,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
    const box=await page.$('.pdp-split__specs');
    const visible = box ? await box.isVisible() : false;
    if(visible){ await box.scrollIntoViewIfNeeded(); for(let i=0;i<25;i++){ await page.mouse.wheel(0,30); await page.waitForTimeout(20); } await page.waitForTimeout(400); }
    return page.evaluate(()=>{
      const specs=document.getElementById('pdpSpecs');
      const block=document.querySelector('.pdp-split__specs');
      const rows=[...document.querySelectorAll('#pdpSpecs tr')];
      const ops=rows.map(r=>parseFloat(getComputedStyle(r).opacity));
      return { rows:rows.length, html:specs?specs.innerHTML:'', blockHidden:block?block.hidden:null,
        minOp: rows.length?Math.min(...ops):null };
    });
  }
  const a=await pdp('dewalt-dcf894p2-18v-1-2-boulonneuse-kit-2x5ah');
  check('DCF894P2 : specs remplies', a.rows>=10, 'rows='+a.rows);
  check('DCF894P2 : valeur vérifiée 447 Nm', /447 Nm/.test(a.html));
  check('DCF894P2 : lignes visibles (opacity>0.5)', a.minOp>0.5, 'min='+(a.minOp||0).toFixed(2));

  const m=await pdp('makita-dtw300z-18v-1-2-boulonneuse-nue');
  check('DTW300Z : specs Makita (330 Nm)', /330 Nm/.test(m.html), 'rows='+m.rows);
  const f=await pdp('festool-tsc55-scie-plongeante-18v');
  check('TSC55 : bi-tension 36 V', /36 V/.test(f.html), 'rows='+f.rows);
  const w=await pdp('wera-zyklop-speed-cliquet-coffret');
  check('8100SA : 72 dents', /72 dents/.test(w.html), 'rows='+w.rows);

  // Cas 2 : produit CASSÉ laissé sans specs → bloc masqué (pas de fabrication)
  const broken=await pdp('facom-cl2-c18s-visseuse-chocs-18v');
  check('CL2.C18S (cassé) : bloc specs masqué (aucune fabrication)', broken.blockHidden===true, 'hidden='+broken.blockHidden);

  check('0 erreur JS', perr.length===0, perr.join(' | ')||'aucune');
  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if(fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
