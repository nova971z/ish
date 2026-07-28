const { playwright, optionsNavigateur, RACINE, sortie } = require('./_socle.cjs');
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = playwright();
const ROOT = RACINE;
const vercel=require(path.join(ROOT,'vercel.json'));
let CSP=vercel.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value.replace(/;?\s*upgrade-insecure-requests/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.ico':'image/x-icon','.woff2':'font/woff2'};
const STATS = { ok:true, stats:{ totals:{sessions:50,pageViews:120,clicks:80,newVisitors:10,returningVisitors:5}, devices:{mobile:40,desktop:10}, sources:{instagram:30,direct:20}, daily:[], products:[], clicks:[{label:'chip:Meuleuses',count:9}],
  geo:[ {country:'FR',count:30,lat:46.6,lng:2.2}, {country:'GP',count:12,lat:16.25,lng:-61.58}, {country:'US',count:8,lat:38,lng:-97}, {country:'MQ',count:5} /* sans coord → repli */ ] }};
const server=http.createServer((req,res)=>{
  const u=req.url.split('?')[0];
  if(u==='/api/admin'){ const t=(req.url.match(/type=([^&]+)/)||[])[1]; res.writeHead(200,{'Content-Type':'application/json'});
    if(t==='stats')return res.end(JSON.stringify(STATS)); return res.end(JSON.stringify({ok:true,overrides:{},clients:[]})); }
  let p=decodeURIComponent(u); if(p==='/'||p==='')p='/index.html'; const file=path.join(ROOT,p);
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':CSP});return res.end(fs.readFileSync(path.join(ROOT,'index.html')));}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Security-Policy':CSP});res.end(fs.readFileSync(file));
});

// Mock THREE injecté AVANT app.js → ensureThree() résout avec ce mock.
const MOCK_THREE = `
(function(){
  window.__three = { renders:0, meshes:0, disposes:0, vecs:[] };
  function V(x,y,z){ this.x=x;this.y=y;this.z=z; }
  V.prototype.copy=function(o){ this.x=o.x;this.y=o.y;this.z=o.z; return this; };
  function Obj(){ this.rotation={x:0,y:0}; this.position=new V(0,0,0); this.scale={setScalar:function(){}}; }
  Obj.prototype.add=function(){};
  function Geo(){ window.__three; } Geo.prototype.setFromPoints=function(){return this;}; Geo.prototype.dispose=function(){window.__three.disposes++;};
  function Mat(){} Mat.prototype.dispose=function(){window.__three.disposes++;};
  window.THREE={
    Vector3:function(x,y,z){ var v=new V(x,y,z); window.__three.vecs.push(v); return v; },
    Scene:function(){ return new Obj(); },
    Group:function(){ return new Obj(); },
    PerspectiveCamera:function(){ return { position:new V(0,0,0), aspect:1, updateProjectionMatrix:function(){} }; },
    WebGLRenderer:function(){ var cvs=document.createElement('canvas'); return {
      domElement:cvs, setPixelRatio:function(){}, setSize:function(){}, setClearColor:function(){},
      render:function(){ window.__three.renders++; }, dispose:function(){ window.__three.disposes++; } }; },
    SphereGeometry:function(){ return new Geo(); },
    BufferGeometry:function(){ return new Geo(); },
    MeshBasicMaterial:function(){ return new Mat(); },
    LineBasicMaterial:function(){ return new Mat(); },
    Mesh:function(){ window.__three.meshes++; return new Obj(); },
    LineLoop:function(){ return new Obj(); },
    Line:function(){ return new Obj(); }
  };
})();
`;

async function scenario(page, base, useMock){
  const perr=[]; page.on('pageerror',e=>perr.push(String(e).slice(0,160)));
  if (useMock) await page.addInitScript(MOCK_THREE);
  await page.addInitScript(()=>{ try{sessionStorage.setItem('pt_admin_secret','x');}catch(_){}
    window.__csp=[]; document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.effectiveDirective)); });
  await page.goto(base+'/#/admin',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
  await page.click('.admin-tab[data-admin-tab="stats"]'); await page.waitForTimeout(1200);
  return { perr,
    globePresent: await page.evaluate(()=>!!document.getElementById('adminGlobe')),
    listPresent: await page.evaluate(()=>{ var e=document.getElementById('adminStats'); return /FR/.test(e.innerHTML) && e.querySelectorAll('.stat-bar__label').length>0; }),
    three: await page.evaluate(()=>window.__three||null),
    canvasInGlobe: await page.evaluate(()=>{ var g=document.getElementById('adminGlobe'); return g?g.querySelectorAll('canvas').length:0; })
  };
}

async function run(){
  await new Promise(r=>server.listen(0,r));
  const base=`http://localhost:${server.address().port}`;
  const browser=await chromium.launch({args:['--no-sandbox']});
  let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:'')); ok?pass++:fail++;};

  // ── Scénario A : THREE mocké → chemin globe complet exercé ──────────────
  const ctxA=await browser.newContext({viewport:{width:1280,height:1000}});
  const pA=await ctxA.newPage();
  const A=await scenario(pA, base, true);
  check('A: conteneur globe présent', A.globePresent);
  check('A: canvas WebGL inséré dans le globe', A.canvasInGlobe===1, 'n='+A.canvasInGlobe);
  check('A: rendu three appelé (animation tourne)', A.three && A.three.renders>0, 'renders='+(A.three&&A.three.renders));
  check('A: marqueurs créés (>= 4 points : FR,GP,US,MQ-repli ×2 pt+halo)', A.three && A.three.meshes>=8, 'meshes='+(A.three&&A.three.meshes));
  // MQ n'a pas de coord → doit être placé via repli COUNTRY_LATLNG (donc 4 pays géolocalisés)
  check('A: coordonnées calculées (Vector3 générés)', A.three && A.three.vecs.length>0, 'vecs='+(A.three&&A.three.vecs.length));
  // pôle Nord check via latLngToVec3 indirect : un vecteur ~ (0,1,0) doit exister parmi les parallèles/méridiens (lat 90)
  check('A: liste par pays toujours présente (globe = surcouche)', A.listPresent);
  check('A: 0 erreur JS', A.perr.length===0, A.perr.join(' | ')||'aucune');
  // Interaction : le canvas est manipulable (touch-action:none, curseur grab,
  // pointerdown → grabbing, pointerup → grab).
  const drag = await pA.evaluate(()=>{
    var c = document.querySelector('#adminGlobe canvas'); if(!c) return {no:true};
    var out = { touch: c.style.touchAction, cur0: c.style.cursor };
    c.dispatchEvent(new PointerEvent('pointerdown', {clientX:10, clientY:10, pointerId:1, bubbles:true}));
    out.curDown = c.style.cursor;
    c.dispatchEvent(new PointerEvent('pointermove', {clientX:60, clientY:20, pointerId:1, bubbles:true}));
    c.dispatchEvent(new PointerEvent('pointerup', {pointerId:1, bubbles:true}));
    out.curUp = c.style.cursor;
    return out;
  });
  check('A: canvas draggable (touch-action:none)', drag.touch==='none', JSON.stringify(drag));
  check('A: pointerdown → curseur "grabbing"', drag.curDown==='grabbing', 'cur='+drag.curDown);
  check('A: pointerup → curseur "grab"', drag.curUp==='grab', 'cur='+drag.curUp);
  // Nettoyage : quitter l'onglet stats → canvas retiré + dispose appelé
  await pA.click('.admin-tab[data-admin-tab="clients"]'); await pA.waitForTimeout(400);
  const cleaned = await pA.evaluate(()=>({ canvas: document.querySelectorAll('#adminGlobe canvas').length, disposes:(window.__three||{}).disposes }));
  check('A: nettoyage à la sortie (canvas retiré)', cleaned.canvas===0);
  check('A: ressources three libérées (dispose appelé)', cleaned.disposes>0, 'disposes='+cleaned.disposes);
  await ctxA.close();

  // ── Scénario B : PAS de THREE (CDN bloqué, réalité sandbox) ─────────────
  const ctxB=await browser.newContext({viewport:{width:1280,height:1000}});
  const pB=await ctxB.newPage();
  const B=await scenario(pB, base, false);
  check('B: dégradation OK — liste par pays présente sans three', B.listPresent);
  check('B: aucune erreur JS malgré l\'échec de chargement three', B.perr.length===0, B.perr.join(' | ')||'aucune');
  await ctxB.close();

  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  await browser.close(); server.close();
  if(fail) process.exit(1);
}
run().catch(e=>{console.error(e);process.exit(1);});
