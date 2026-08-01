import { join, basename } from 'node:path';
import { RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pw = await playwright();
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>srv.listen(8804,r));
const {chromium}=pw;const b=await chromium.launch();const pg=await b.newPage({serviceWorkers:'block'});
let errs=[];pg.on('pageerror',e=>errs.push(e.message));
const A=[];const ok=(c,m)=>{A.push((c?'✅':'❌')+' '+m); if(!c)process.exitCode=1;};

// 1) chips sync : filtre Perforateurs -> accueil -> retour catalogue
await pg.goto('http://127.0.0.1:8804/index.html#/catalogue',{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
await pg.evaluate(()=>{[...document.querySelectorAll('.cat-chip')].find(c=>c.dataset.cat==='Perforateurs').click();});
await pg.waitForTimeout(400);
await pg.evaluate(()=>{location.hash='#/';}); await pg.waitForTimeout(400);
await pg.evaluate(()=>{location.hash='#/catalogue';}); await pg.waitForTimeout(600);
const chip=await pg.evaluate(()=>{const a=document.querySelector('.cat-chip.active');return {active:a?a.dataset.cat:null, sel:(document.getElementById('tag')||{}).value,
  listCount:document.querySelectorAll('#list .product-card').length};});
ok(chip.active==='Perforateurs', 'chip active = Perforateurs au retour (lu: '+chip.active+')');
ok(chip.sel==='Perforateurs', 'select = Perforateurs (lu: '+chip.sel+')');

// 2) modale : ouvrir -> fermer -> rouvrir en <250ms -> doit RESTER ouverte
await pg.goto('http://127.0.0.1:8804/index.html#/produit/makita-dhr283z',{waitUntil:'networkidle'});
await pg.waitForTimeout(700);
await pg.click('#pdpBuy');
await pg.waitForTimeout(150);
const r=await pg.evaluate(async()=>{
  const modal=document.getElementById('payModal');
  const closeBtn=modal.querySelector('.pay-modal__close, [data-pay-close]')   /* #payModalClose et [data-close] morts ; la vraie prise est [data-pay-close] */;
  if(closeBtn) closeBtn.click(); else return {err:'close btn introuvable'};
  await new Promise(r=>setTimeout(r,80));           // < 250 ms
  // rouvre via le bouton Acheter
  document.getElementById('pdpBuy').click();
  await new Promise(r=>setTimeout(r,400));          // laisse l ancien timer (250ms) expirer
  return {hidden:modal.hidden, isOpen:modal.classList.contains('is-open'), overflow:document.body.style.overflow};
});
ok(r.err===undefined && r.hidden===false && r.isOpen===true, 'modale reste OUVERTE après fermer/rouvrir <250ms — '+JSON.stringify(r));
ok(r.overflow==='hidden', 'scroll body verrouillé sous la modale (overflow=hidden, lu: "'+r.overflow+'")');
ok(errs.length===0,'0 erreur JS — '+JSON.stringify(errs.slice(0,2)));
console.log(A.join('\n'));
await b.close();srv.close();
