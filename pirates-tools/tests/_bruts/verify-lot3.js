const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT='/home/user/ish/pirates-tools';
const vercel=require(path.join(ROOT,'vercel.json'));
let CSP=vercel.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value.replace(/;?\s*upgrade-insecure-requests/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/'||p==='')p='/index.html';const file=path.join(ROOT,p);if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':CSP});return res.end(fs.readFileSync(path.join(ROOT,'index.html')));}res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Security-Policy':CSP});res.end(fs.readFileSync(file));});

async function run(){
  await new Promise(r=>server.listen(0,r));
  const base=`http://localhost:${server.address().port}`;
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
  const page=await (await browser.newContext({viewport:{width:1280,height:900}})).newPage();
  const perr=[]; page.on('pageerror',e=>perr.push(String(e).slice(0,140)));
  let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:''));ok?pass++:fail++;};

  await page.goto(base+'/#/catalogue',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(900);
  const cat = await page.evaluate(()=>({
    cards: document.querySelectorAll('#list .product-card').length,
    chips: [...document.querySelectorAll('#catList .cat-chip')].map(c=>c.dataset.cat)
  }));
  check('catalogue : 40 produits affichés', cat.cards===40, 'cards='+cat.cards);
  check('nouvelle catégorie « Perforateurs »', cat.chips.includes('Perforateurs'));

  async function filter(cat){ await page.evaluate((c)=>{document.querySelectorAll('#catList .cat-chip').forEach(b=>{if(b.dataset.cat===c)b.click();});},cat); await page.waitForTimeout(300); return page.evaluate(()=>document.querySelectorAll('#list .product-card').length); }
  check('Perforateurs = 2', (await filter('Perforateurs'))===2);
  check('Batteries et chargeurs = 4 (3 packs + DCB184)', (await filter('Batteries et chargeurs'))===4);

  async function pdp(slug, needle){
    await page.evaluate((s)=>{ location.hash='#/produit/'+s; }, slug); await page.waitForTimeout(650);
    return page.evaluate(()=>{
      const specs=document.getElementById('pdpSpecs');
      return { title:(document.getElementById('pdpTitle')||{}).textContent||'',
        rows: specs?specs.querySelectorAll('tr').length:0, html: specs?specs.innerHTML:'',
        price:(document.getElementById('pdpPrice')||{}).textContent.replace(/\s+/g,' ').slice(0,30),
        img:(document.getElementById('pdpImg')||{}).getAttribute? (document.getElementById('pdpImg').getAttribute('src')||''):'' };
    });
  }
  const p1=await pdp('dewalt-d25033k-qs');
  check('PDP D25033K : titre', /D25033K/.test(p1.title), p1.title.slice(0,40));
  check('PDP D25033K : specs remplies', p1.rows>=12, 'rows='+p1.rows);
  check('PDP D25033K : spec vérifiée (SDS-Plus + 22 mm)', /SDS-Plus/.test(p1.html)&&/22 mm/.test(p1.html));
  check('PDP D25033K : prix TTC', /€/.test(p1.price), p1.price);

  const p2=await pdp('dewalt-dcd996p2-qw');
  check('PDP DCD996P2 : specs (95 Nm)', /95 Nm/.test(p2.html), 'rows='+p2.rows);
  const p3=await pdp('dewalt-dcf620nt-xj');
  check('PDP DCF620 (placo) : moteur à charbons', /charbons/.test(p3.html));
  check('PDP DCF620 : 4400 tr/min', /4400 tr\/min/.test(p3.html));
  const p4=await pdp('dewalt-dcb184');
  check('PDP DCB184 (batterie) : 5,0 Ah', /5,0 Ah/.test(p4.html));

  check('0 erreur JS', perr.length===0, perr.join(' | ')||'aucune');
  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if(fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
