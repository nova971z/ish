import { join, basename } from 'node:path';
import { RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pw = await playwright();
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>srv.listen(8803,r));
const {chromium}=pw;const b=await chromium.launch();const pg=await b.newPage({serviceWorkers:'block'});
let errs=[];pg.on('pageerror',e=>errs.push(e.message));
const P=JSON.parse(fs.readFileSync(ROOT+'/products.json','utf8'));
const slug=s=>{const x=P.find(y=>y.sku===s);return x?(x.slug||x.id):null;};
async function probe(sku){
  await pg.goto('http://127.0.0.1:8803/index.html#/produit/'+slug(sku),{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);
  return await pg.evaluate(()=>{
    const v=document.getElementById('pdpVariant');
    const amts=[...document.querySelectorAll('#pdpVariant .pdp-variant__amt')].map(e=>e.textContent);
    return {shown:v&&!v.hidden, amts};
  });
}
const A=[];const ok=(c,m)=>{A.push((c?'✅':'❌')+' '+m); if(!c)process.exitCode=1;};
let r=await probe('DCK266P2T');   // pack 8,5 kg -> +25
ok(r.shown && r.amts.length===2, 'pack DCK266P2T : switch présent — '+JSON.stringify(r.amts));
r=await probe('PJ7000J');         // lamelleuse 3,5 kg -> +25 (fix \b)
ok(r.shown, 'lamelleuse PJ7000J : switch présent (fix \\b) — '+JSON.stringify(r.amts));
r=await probe('BL1830B');         // batterie -> jamais
ok(!r.shown, 'batterie BL1830B : PAS de switch');
r=await probe('DTW700Z');         // paire réelle -> switch paire intact
ok(r.shown && r.amts.length===2, 'paire DTW700Z : switch paire intact — '+JSON.stringify(r.amts));
ok(errs.length===0, '0 erreur JS');
console.log(A.join('\n'));
await b.close();srv.close();
