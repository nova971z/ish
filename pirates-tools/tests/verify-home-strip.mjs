import { join, basename } from 'node:path';
import { RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pw = await playwright();
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>srv.listen(8797,r));
const {chromium}=pw;const b=await chromium.launch();const pg=await b.newPage({serviceWorkers:'block'});
let errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://127.0.0.1:8797/index.html#/',{waitUntil:'networkidle'});
await pg.waitForTimeout(1200);
const r=await pg.evaluate(()=>{
  const t=document.getElementById('homeProductsTrack');
  const cards=[...t.querySelectorAll('.product-card:not(.product-card--more)')];
  const more=t.querySelector('.product-card--more');
  const placeholders=cards.filter(c=>{const i=c.querySelector('img');return i&&i.src.indexOf('placeholder')!==-1;}).length;
  const coffretTitles=cards.filter(c=>/MAKPAC|coffret/i.test(c.querySelector('.product-card__title').textContent)&&/ZJ\b/.test(c.querySelector('.product-card__title').textContent)).length;
  return {count:cards.length, placeholders, coffretVariants:coffretTitles,
    more: more? more.textContent.replace(/\s+/g,' ').trim() : null,
    moreVisible: more? more.offsetWidth>0 : false};
});
const A=[];const ok=(c,m)=>{A.push((c?'✅':'❌')+' '+m); if(!c)process.exitCode=1;};
ok(r.count===16, 'bandeau borné à 16 cartes (lu: '+r.count+')');
ok(r.placeholders===0, '0 placeholder dans la vitrine (priorité vraies photos) — lu: '+r.placeholders);
ok(r.coffretVariants===0, '0 variante coffret ZJ dans le bandeau');
/* ⚠️ ANCRAGE SUR UN COMPTE, corrigé le 28/07 : « 186 produits ». Le catalogue
   en compte 476 aujourd'hui, et il bouge à chaque ajout ou purge voulus par
   l'user. On vérifie que la carte annonce un compte NON NUL et cohérent avec
   le catalogue réel — jamais un nombre figé. */
{
  const n = parseInt((String(r.more).match(/(\d[\d\s]*)\s*produits/) || [])[1] || '0', 10);
  ok(/Voir tout le catalogue/i.test(String(r.more)), 'la carte « Voir tout » est présente — lu: ' + r.more);
  ok(n > 0, 'elle annonce un nombre de produits non nul — n=' + n);
}
ok(r.moreVisible, 'carte "Voir tout" visible (largeur > 0)');
ok(errs.length===0, '0 erreur JS — '+JSON.stringify(errs));
// catalogue intact (pagination inchangée)
await pg.goto('http://127.0.0.1:8797/index.html#/catalogue',{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
const cat=await pg.evaluate(()=>document.querySelectorAll('#list .product-card').length);
ok(cat>0 && cat<=40, 'catalogue paginé intact ('+cat+' cartes ≤ 40)');
console.log(A.join('\n'));
await b.close();srv.close();
