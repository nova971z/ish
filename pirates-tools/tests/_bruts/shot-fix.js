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
  let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:''));ok?pass++:fail++;};

  // Ancien produit sans specs → bloc masqué + grille solo
  await page.goto(base+'/#/produit/dewalt-dcf894p2',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(800);
  const old = await page.evaluate(()=>{
    const block=document.querySelector('.pdp-split__specs');
    const grid=document.querySelector('.pdp-split');
    return { hidden: block? block.hidden : null,
      solo: grid? grid.classList.contains('pdp-split--solo') : null,
      headingVisible: block ? (block.offsetParent!==null) : null };
  });
  check('ancien produit : bloc specs masqué', old.hidden===true, 'hidden='+old.hidden);
  check('ancien produit : grille en colonne solo', old.solo===true);
  check('ancien produit : « Caractéristiques » plus rendu', old.headingVisible===false);
  const split1=await page.$('.pdp-section--split'); await split1.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  await split1.screenshot({path:path.join(OUT,'fix-ANCIEN-sans-specs.png')});

  // Notre produit avec specs → bloc visible + 2 colonnes
  await page.goto(base+'/#/produit/dewalt-dcd996p2-qw',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(800);
  const ours = await page.evaluate(()=>{
    const block=document.querySelector('.pdp-split__specs');
    const grid=document.querySelector('.pdp-split');
    return { hidden: block?block.hidden:null, solo: grid?grid.classList.contains('pdp-split--solo'):null,
      rows: document.querySelectorAll('#pdpSpecs tr').length };
  });
  check('notre produit : bloc specs visible', ours.hidden===false);
  check('notre produit : grille 2 colonnes (pas solo)', ours.solo===false);
  check('notre produit : specs rendues', ours.rows>=15, 'rows='+ours.rows);
  const split2=await page.$('.pdp-section--split'); await split2.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  await split2.screenshot({path:path.join(OUT,'fix-NOTRE-avec-specs.png')});

  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if(fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
