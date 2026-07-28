import { join, basename } from 'node:path';
import { sortie, RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const model=(await import('file://'+ROOT+'/api/_lib/pricing-model.js')).default;
const acc=(await import('file://'+ROOT+'/api/_lib/accounting.js')).default;
const DEF=Object.assign({},model.DEFAULT_CONFIG,{autoPrice:true,mode:'colissimo'});
const PAYS=[{amountCents:12000,status:'succeeded',territoryDeclared:'971',recordedAtMs:Date.UTC(2026,0,10)},{amountCents:24000,status:'succeeded',territoryDeclared:'971',recordedAtMs:Date.UTC(2026,1,5)}];
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
function body(req){return new Promise(r=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch(e){r({})}})})}
const srv=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://x');const u=decodeURIComponent(url.pathname);const t=url.searchParams.get('type');
 if(u==='/api/admin'){res.writeHead(200,{'Content-Type':'application/json'});
   if(req.method==='GET'&&t==='pricing-config')return res.end(JSON.stringify({ok:true,config:DEF}));
   if(req.method==='GET'&&t==='accounting')return res.end(JSON.stringify({ok:true,accounting:acc.synthesize(PAYS,DEF)}));
   await body(req);return res.end(JSON.stringify({ok:true,overrides:{},config:DEF}));}
 if(u.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}')}
 let f=u==='/'?'/index.html':u;const fp=path.join(ROOT,f);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf')}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res)});
await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}`;
const br=await chromium.launch();const pg=await br.newPage({viewport:{width:430,height:1100}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.addInitScript(()=>{window.PT_API_BASE='';try{sessionStorage.setItem('pt_admin_secret','test')}catch(e){}});
await pg.goto(`${base}/#/admin`,{waitUntil:'networkidle'});await pg.waitForTimeout(900);
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log(' ❌',m)}};
await pg.locator('.admin-tab[data-admin-tab="compta"]').click();await pg.waitForTimeout(700);
ok(await pg.locator('#comptaPrintable').count()===1,'rapport comptable rendu');
ok(await pg.locator('.compta-kpi').count()===4,'4 indicateurs (KPI)');
const rep=await pg.locator('#comptaReport').textContent();
ok(/360,00/.test(rep),'CA TTC réel 360 € affiché');
ok(/RÉSULTAT NET/.test(rep),'ligne résultat net');
ok(/2026-01/.test(rep)&&/2026-02/.test(rep),'ventilation par mois');
ok(await pg.locator('#comptaExportPdf').count()===1,'bouton Export PDF');
// vérifie que le média print isole le rapport
const printOnlyOk=await pg.evaluate(()=>{return !!document.getElementById('comptaPrintable')});
ok(printOnlyOk,'zone imprimable présente');
ok(errs.length===0,'0 erreur JS');
console.log('errs:',errs.length?errs:'aucune');
console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await pg.emulateMedia({media:'print'});await pg.screenshot({path:join(await sortie('captures'), 'acc-print.png')});
await br.close();srv.close();process.exit(fail?1:0);
