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
  check('catalogue : 31 produits affichés', cat.cards===31, 'cards='+cat.cards);
  check('nouvelle catégorie Rabots', cat.chips.includes('Rabots'));
  check('nouvelle catégorie Souffleurs', cat.chips.includes('Souffleurs'));
  check('nouvelle catégorie Aspirateurs', cat.chips.includes('Aspirateurs'));

  // Filtre Combos → doit contenir les 2 nouveaux packs (total combos = 1 ancien + 2 = 3)
  await page.evaluate(()=>{document.querySelectorAll('#catList .cat-chip').forEach(b=>{if(b.dataset.cat==='Combos')b.click();});}); await page.waitForTimeout(300);
  const combos = await page.evaluate(()=>document.querySelectorAll('#list .product-card').length);
  check('Combos = 3 (1 ancien + 2 packs DeWALT)', combos===3, 'n='+combos);

  // Ouvre la fiche du souffleur → specs + prix + image
  await page.evaluate(()=>{ location.hash='#/produit/dewalt-dcv100-xj'; }); await page.waitForTimeout(700);
  const pdp = await page.evaluate(()=>{
    const specs=document.getElementById('pdpSpecs');
    const title=(document.getElementById('pdpTitle')||{}).textContent||'';
    const price=(document.getElementById('pdpPrice')||{}).textContent||'';
    const img=document.getElementById('pdpImg');
    return { title, specsRows: specs?specs.querySelectorAll('tr').length:0,
      hasVitesse:/80 m\/s/.test(specs?specs.innerHTML:''), price: price.replace(/\s+/g,' ').slice(0,40),
      imgSrc: img?(img.getAttribute('src')||img.src||''):'' };
  });
  check('PDP souffleur : titre chargé', /DCV100/.test(pdp.title), pdp.title.slice(0,40));
  check('PDP : tableau specs rempli', pdp.specsRows>=10, 'lignes='+pdp.specsRows);
  check('PDP : spec vérifiée présente (80 m/s)', pdp.hasVitesse);
  check('PDP : prix TTC affiché', /€/.test(pdp.price), pdp.price);
  check('PDP : image = placeholder (pas cassée)', /placeholder/.test(pdp.imgSrc), pdp.imgSrc.slice(-40));
  check('0 erreur JS', perr.length===0, perr.join(' | ')||'aucune');

  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if(fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
