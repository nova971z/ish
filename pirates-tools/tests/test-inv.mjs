import { join, basename } from 'node:path';
import { sortie, RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const invoice=(await import('file://'+ROOT+'/api/_lib/invoice.js')).default;
let SELLER={raisonSociale:'',formeJuridique:'SASU',franchise:false};
const PAY={id:'pi_1',invoiceNumber:'F2026-0001',invoiceDateMs:Date.UTC(2026,0,15),amountCents:24000,territoryDeclared:'971',customerEmail:'c@ex.fr',customerName:'Jean',status:'succeeded',recordedAtMs:Date.UTC(2026,0,15),linesDetail:[{name:'Perceuse DCD796',qty:2,unitCents:12000}]};
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
function body(req){return new Promise(r=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch(e){r({})}})})}
const srv=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://x');const u=decodeURIComponent(url.pathname);const t=url.searchParams.get('type');
 if(u==='/api/admin'){res.writeHead(200,{'Content-Type':'application/json'});
   if(req.method==='GET'&&t==='invoice-config')return res.end(JSON.stringify({ok:true,seller:SELLER}));
   if(req.method==='GET'&&t==='invoices')return res.end(JSON.stringify({ok:true,invoices:[{id:'pi_1',invoiceNumber:'F2026-0001',amountCents:24000,customerEmail:'c@ex.fr',customerName:'Jean',recordedAtMs:Date.UTC(2026,0,15)}]}));
   if(req.method==='GET'&&t==='invoice'){const built=invoice.buildInvoice(PAY,SELLER);return res.end(JSON.stringify({ok:true,html:invoice.renderHtml(built),number:built.number}))}
   const b=await body(req);
   if(t==='invoice-config'){SELLER=Object.assign(SELLER,b);return res.end(JSON.stringify({ok:true}))}
   return res.end(JSON.stringify({ok:true,overrides:{}}));}
 if(u.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}')}
 let f=u==='/'?'/index.html':u;const fp=path.join(ROOT,f);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf')}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res)});
await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}`;
const br=await chromium.launch();const pg=await br.newPage({viewport:{width:430,height:1200}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.addInitScript(()=>{window.PT_API_BASE='';try{sessionStorage.setItem('pt_admin_secret','test')}catch(e){}});
await pg.goto(`${base}/#/admin`,{waitUntil:'networkidle'});await pg.waitForTimeout(900);
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log(' ❌',m)}};
ok(await pg.locator('.admin-tab[data-admin-tab="invoices"]').count()===1,'onglet Factures');
await pg.locator('.admin-tab[data-admin-tab="invoices"]').click();await pg.waitForTimeout(600);
ok(await pg.locator('#invRS').count()===1,'formulaire identite vendeur');
ok(await pg.locator('#invFranchise').count()===1,'toggle franchise TVA');
ok(await pg.locator('.inv-view').count()===1,'facture listee');
// voir la facture
await pg.locator('.inv-view').first().click();await pg.waitForTimeout(400);
const iv=await pg.locator('#invoiceView').textContent();
ok(/FACTURE/.test(iv)&&/F2026-0001/.test(iv),'facture rendue (entete + numero)');
ok(/À COMPLÉTER/.test(iv),'identite vide -> [A COMPLETER]');
ok(await pg.locator('#invPrint').count()===1,'bouton Imprimer/PDF');
ok(await pg.locator('#ptInvoice').count()===1,'zone imprimable #ptInvoice');
// enregistrer identite
await pg.fill('#invRS','Pirates Tools');await pg.fill('#invSiret','12345678900012');await pg.fill('#invAddr','Rue X, Gpe');
await pg.locator('#invSave').click();await pg.waitForTimeout(300);
ok(errs.length===0,'0 erreur JS');
console.log('errs:',errs.length?errs:'aucune');
console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await pg.emulateMedia({media:'print'});await pg.screenshot({path:join(await sortie('captures'), 'invoice-print.png')});
await br.close();srv.close();process.exit(fail?1:0);
