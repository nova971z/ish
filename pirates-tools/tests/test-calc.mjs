import { join, basename } from 'node:path';
import { sortie, RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const model = (await import('file://'+ROOT+'/api/_lib/pricing-model.js')).default;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const DEFAULTS=Object.assign({},model.DEFAULT_CONFIG,{autoPrice:true,mode:'colissimo'});
function body(req){return new Promise(r=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch(e){r({})}});});}
const srv=http.createServer(async (req,res)=>{
  const url=new URL(req.url,'http://x'); const u=decodeURIComponent(url.pathname); const type=url.searchParams.get('type');
  if(u==='/api/admin'){
    res.writeHead(200,{'Content-Type':'application/json'});
    if(req.method==='GET'&&type==='pricing-config') return res.end(JSON.stringify({ok:true,config:DEFAULTS}));
    const b=await body(req);
    if(type==='pricing-config') return res.end(JSON.stringify({ok:true,config:Object.assign({},DEFAULTS,b)}));
    if(type==='price-preview'){ const product={weight_kg:b.weight||2,ncCategory:'power_tool',variantRole:'solo',title:''}; const r=model.recommend(product,{costTTC:b.costTTC,mode:b.mode},DEFAULTS); return res.end(JSON.stringify({ok:true,result:r})); }
    if(type==='reprice-all'){ return res.end(JSON.stringify({ok:true,dryRun:!!b.dryRun,mode:'colissimo',counts:{total:200,changed:150,skipped:5},changed:[{sku:'X',name:'Visseuse',oldPrice:88,newPrice:117},{sku:'Y',name:'Meuleuse',oldPrice:182,newPrice:238}]})); }
    return res.end(JSON.stringify({ok:true,overrides:{}}));
  }
  if(u.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}
  let f=u==='/'?'/index.html':u; const fp=path.join(ROOT,f);
  if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);
});
await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}`;
const br=await chromium.launch();const ctx=await br.newContext({viewport:{width:430,height:1000}});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.addInitScript(()=>{window.PT_API_BASE='';try{sessionStorage.setItem('pt_admin_secret','test')}catch(e){}});
await pg.goto(`${base}/#/admin`,{waitUntil:'networkidle'});await pg.waitForTimeout(1000);
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log(' ❌',m);}};
await pg.locator('.admin-tab[data-admin-tab="compta"]').click();
await pg.waitForTimeout(600);
ok(await pg.locator('#cfgMode').count()===1,'config chargée (mode présent)');
ok(await pg.locator('#cfgAuto').isChecked(),'autoPrice coché par défaut');
// calculer un prix
await pg.locator('#calcRun').click(); await pg.waitForTimeout(400);
const priceTxt=await pg.locator('.compta-res__price').textContent().catch(()=>'');
console.log('prix calculé:',priceTxt.trim().slice(0,30));
ok(/€/.test(priceTxt),'prix conseillé affiché');
ok(/Net après IS/.test(await pg.locator('#calcOut').textContent()),'net après IS affiché');
// reprice dry
await pg.locator('#repriceDry').click(); await pg.waitForTimeout(400);
ok(/150/.test(await pg.locator('#repriceOut').textContent()),'dry-run montre 150 changements');
ok(!(await pg.locator('#repriceGo').isDisabled()),'bouton Appliquer activé après dry-run');
await pg.locator('#repriceGo').click(); await pg.waitForTimeout(400);
ok(/mis à jour/.test(await pg.locator('#repriceOut').textContent()),'application confirmée');
// save config (mode container)
await pg.selectOption('#cfgMode','container'); await pg.locator('#cfgSave').click(); await pg.waitForTimeout(300);
ok(errs.length===0,'0 erreur JS');
console.log('erreurs:',errs.length?errs:'aucune');
console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await pg.screenshot({path:join(await sortie('captures'), 'calc.png'),fullPage:true});
await br.close();srv.close();process.exit(fail?1:0);
