import { join, basename } from 'node:path';
import { RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pw = await playwright();
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>srv.listen(8814,r));
const {chromium}=pw;const b=await chromium.launch();const pg=await b.newPage({serviceWorkers:'block'});
let errs=[];pg.on('pageerror',e=>errs.push(e.message));
const A=[];const ok=(c,m)=>{A.push((c?'✅':'❌')+' '+m); if(!c)process.exitCode=1;};
await pg.goto('http://127.0.0.1:8814/index.html#/abonnement/black',{waitUntil:'networkidle'});
await pg.waitForTimeout(600);
let r=await pg.evaluate(()=>({
  pills:[...document.querySelectorAll('.abo-switch__pill')].map(e=>e.textContent.trim()),
  active:(document.querySelector('.abo-switch__pill.is-active')||{}).textContent||'',
  body:document.getElementById('aboContent').textContent
}));
ok(r.pills.length===4, 'switcher 4 pastilles en haut de page — '+JSON.stringify(r.pills));
ok(/Black Partenaire/.test(r.active), 'pastille active = pack courant');
ok(/avant-première/.test(r.body), 'Black : ventes privées en avant-première ajoutées');
ok(!/Fidélité x2|Fidélité x3|compte double|comptent triple/i.test(r.body), 'multiplicateurs fidélité retirés (Black)');
ok(/Non cumulable avec la remise fidélité/.test(r.body), 'non-cumul remise/fidélité affiché');
ok(/plafonnée à 100 €/.test(r.body), 'plafond 100 €/mois affiché');
// switch direct Black -> Gold via la pastille
await pg.click('.abo-switch__pill--gold'); await pg.waitForTimeout(600);
r=await pg.evaluate(()=>({hash:location.hash, badge:(document.querySelector('.abo-hero__badge')||{}).textContent, body:document.getElementById('aboContent').textContent, active:(document.querySelector('.abo-switch__pill.is-active')||{}).textContent||''}));
ok(r.hash==='#/abonnement/gold' && r.badge==='Gold', 'switch direct Black → Gold sans retour accueil');
ok(/Gold/.test(r.active), 'pastille active suit le switch');
ok(!/Fidélité x2/i.test(r.body), 'multiplicateur retiré (Gold)');
ok(errs.length===0, '0 erreur JS');
console.log(A.join('\n'));
await b.close();srv.close();
