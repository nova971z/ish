import { join, basename } from 'node:path';
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const model=(await import('file://'+ROOT+'/api/_lib/pricing-model.js')).default;
const acc=(await import('file://'+ROOT+'/api/_lib/accounting.js')).default;
const DEF=Object.assign({},model.DEFAULT_CONFIG,{autoPrice:true,mode:'colissimo'});
const PAYS=[{amountCents:12000,cogsHtCents:6000,stripeFeeCents:200,status:'succeeded',territoryDeclared:'971',recordedAtMs:Date.UTC(2026,0,10)}];
const CH=[{id:'c1',amountHt:50,category:'transport',dateMs:Date.UTC(2026,1,1),tvaDeductible:9}];
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
function body(req){return new Promise(r=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch(e){r({})}})})}
const srv=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://x');const u=decodeURIComponent(url.pathname);const t=url.searchParams.get('type');
 if(u==='/api/admin'){res.writeHead(200,{'Content-Type':'application/json'});
   if(req.method==='GET'&&t==='pricing-config')return res.end(JSON.stringify({ok:true,config:DEF}));
   if(req.method==='GET'&&t==='accounting')return res.end(JSON.stringify({ok:true,accounting:acc.synthesize(PAYS,CH,DEF),charges:CH}));
   await body(req);return res.end(JSON.stringify({ok:true,overrides:{},config:DEF}));}
 if(u.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}')}
 let f=u==='/'?'/index.html':u;const fp=path.join(ROOT,f);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf')}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res)});
await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}`;
const br=await chromium.launch();const pg=await br.newPage({viewport:{width:430,height:1200}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.addInitScript(()=>{window.PT_API_BASE='';try{sessionStorage.setItem('pt_admin_secret','test')}catch(e){}});
await pg.goto(`${base}/#/admin`,{waitUntil:'networkidle'});await pg.waitForTimeout(900);
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log(' ❌',m)}};
// compta : HT a cote TTC + TVA recup
await pg.locator('.admin-tab[data-admin-tab="compta"]').click();await pg.waitForTimeout(600);
const rep=await pg.locator('#comptaReport').textContent();
ok(/TTC ·/.test(rep)&&/HT/.test(rep),'HT affiche a cote du TTC');
ok(/récupères|À RÉCUPÉRER|À REVERSER/.test(rep),'ligne TVA a recuperer/reverser');
ok(/déjà récupérée/.test(rep),'note TVA FR deja recuperee');
// fiscalite
ok(await pg.locator('.admin-tab[data-admin-tab="fisc"]').count()===1,'onglet Fiscalité present');
await pg.locator('.admin-tab[data-admin-tab="fisc"]').click();await pg.waitForTimeout(400);
const nCards=await pg.locator('.fisc-card').count();
console.log('cartes fiscalite:',nCards);
ok(nCards>=6,'>=6 cartes declarations (+ avertissement)');
const fisc=await pg.locator('#adminFiscBody').textContent();
ok(/impots\.gouv\.fr/.test(fisc)&&/douane\.gouv\.fr/.test(fisc)&&/formalites\.entreprises/.test(fisc),'liens officiels presents');
ok(await pg.locator('#adminFiscBody a[target="_blank"]').count()>=6,'boutons Ouvrir le site officiel');
ok(errs.length===0,'0 erreur JS');
console.log('errs:',errs.length?errs:'aucune');
console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await br.close();srv.close();process.exit(fail?1:0);
