import { join, basename } from 'node:path';
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const model=(await import('file://'+ROOT+'/api/_lib/pricing-model.js')).default;
const acc=(await import('file://'+ROOT+'/api/_lib/accounting.js')).default;
const DEF=Object.assign({},model.DEFAULT_CONFIG,{autoPrice:true,mode:'colissimo'});
const PAYS=[{amountCents:12000,cogsHtCents:6000,stripeFeeCents:200,status:'succeeded',territoryDeclared:'971',recordedAtMs:Date.UTC(2026,0,10)},{amountCents:24000,cogsHtCents:12000,stripeFeeCents:400,status:'succeeded',territoryDeclared:'971',recordedAtMs:Date.UTC(2026,1,5)}];
let CHARGES=[{id:'c1',amountHt:50,category:'transport',label:'Colissimo',dateMs:Date.UTC(2026,1,1)}];
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
function body(req){return new Promise(r=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch(e){r({})}})})}
const srv=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://x');const u=decodeURIComponent(url.pathname);const t=url.searchParams.get('type');
 if(u==='/api/admin'){res.writeHead(200,{'Content-Type':'application/json'});
   if(req.method==='GET'&&t==='pricing-config')return res.end(JSON.stringify({ok:true,config:DEF}));
   if(req.method==='GET'&&t==='accounting')return res.end(JSON.stringify({ok:true,accounting:acc.synthesize(PAYS,CHARGES,DEF),charges:CHARGES}));
   if(req.method==='DELETE'&&t==='charge'){CHARGES=CHARGES.filter(c=>c.id!==url.searchParams.get('id'));return res.end(JSON.stringify({ok:true}))}
   const b=await body(req);
   if(t==='charge'){CHARGES.push({id:'c'+(CHARGES.length+1),amountHt:b.amountHt,category:b.category,label:b.label,dateMs:b.dateMs});return res.end(JSON.stringify({ok:true,id:'x'}))}
   return res.end(JSON.stringify({ok:true,overrides:{},config:DEF}));}
 if(u.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}')}
 let f=u==='/'?'/index.html':u;const fp=path.join(ROOT,f);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf')}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res)});
await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}`;
const br=await chromium.launch();const pg=await br.newPage({viewport:{width:430,height:1200}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.addInitScript(()=>{window.PT_API_BASE='';try{sessionStorage.setItem('pt_admin_secret','test')}catch(e){}});
await pg.goto(`${base}/#/admin`,{waitUntil:'networkidle'});await pg.waitForTimeout(900);
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log(' ❌',m)}};
await pg.locator('.admin-tab[data-admin-tab="compta"]').click();await pg.waitForTimeout(700);
const rep=await pg.locator('#comptaReport').textContent();
ok(/Coût des marchandises vendues/.test(rep),'ligne COGS (réel)');
ok(/Marge brute/.test(rep),'ligne marge brute');
/* ⛔ ANCRAGE CORRIGÉ (01/08/2026). Ce contrôle exigeait le texte exact
   « Frais Stripe ». Le libellé est devenu « Frais de vente Revolut » le jour
   où l'abonnement a été séparé de la commission — et le harnais est passé au
   rouge sans qu'aucun comportement n'ait cassé.
   C'est la règle des harnais : on ne s'ancre JAMAIS sur une formulation
   d'interface, elle change ; on s'ancre sur le CONCEPT COMPTABLE, qui ne
   change pas. Les deux coûts d'encaissement doivent apparaître, séparément —
   les fondre en une ligne serait le vrai défaut. */
ok(/commission|frais de vente/i.test(rep), 'ligne commission d\'encaissement (réelle)');
ok(/abonnement/i.test(rep), 'ligne abonnement d\'encaissement, distincte de la commission');
ok(!/estimé/.test(rep),'aucun mot "estimé" (100% réel)');
ok(/151,80/.test(rep),'marge brute 151,80 (CA HT 331,80 − COGS 180)');
ok(await pg.locator('#chgAdd').count()===1,'formulaire saisie de charge');
ok(await pg.locator('.compta-chg-del').count()===1,'charge existante listée + supprimable');
// ajoute une charge
await pg.selectOption('#chgCat','cfe');await pg.fill('#chgLabel','CFE 2026');await pg.fill('#chgAmount','300');
await pg.locator('#chgAdd').click();await pg.waitForTimeout(500);
ok(await pg.locator('.compta-chg-del').count()===2,'nouvelle charge ajoutée (2 lignes)');
ok(errs.length===0,'0 erreur JS');
console.log('errs:',errs.length?errs:'aucune');
console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await br.close();srv.close();process.exit(fail?1:0);
