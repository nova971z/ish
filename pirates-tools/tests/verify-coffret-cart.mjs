import { join, basename } from 'node:path';
import { RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pw = await playwright();
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>srv.listen(8796,r));
const {chromium}=pw;const b=await chromium.launch();const pg=await b.newPage({serviceWorkers:'block'});
let errs=[];pg.on('pageerror',e=>errs.push(e.message));
let piBody=null;
await pg.route(/\/api\/create-payment-intent/,async route=>{piBody=JSON.parse(route.request().postData()||'{}');await route.fulfill({status:500,contentType:'application/json',body:'{"error":"test-intercept"}'});});

const A=[];const ok=(c,m)=>{A.push((c?'✅':'❌')+' '+m); if(!c)process.exitCode=1;};

// 1. PDP DHR283Z (standalone, gros >=3kg => +25) : activer coffret, ajouter au panier
await pg.goto('http://127.0.0.1:8796/index.html#/produit/makita-dhr283z',{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
await pg.click('#pdpVariant [data-coffret="1"]');
await pg.waitForTimeout(200);
await pg.click('#pdpQuote');
// 2. PDP DGA508Z (petit => +15) : SANS coffret, ajouter
await pg.goto('http://127.0.0.1:8796/index.html#/produit/makita-dga508z',{waitUntil:'networkidle'});
await pg.waitForTimeout(700);
await pg.click('#pdpQuote');
// 3. Panier
await pg.goto('http://127.0.0.1:8796/index.html#/devis',{waitUntil:'networkidle'});
await pg.waitForTimeout(700);
const devis=await pg.evaluate(()=>{
  const items=[...document.querySelectorAll('.devis-item')].map(el=>({
    name:el.querySelector('.devis-item__name').textContent,
    sub:el.querySelector('.devis-item__subtotal').textContent.trim()
  }));
  const total=(document.getElementById('devisFooterTotal')||document.querySelector('[id*=footerTotal],[id*=Total]')||{}).textContent||'';
  return {items,total:total.trim()};
});
// prix attendus (971 par défaut): DHR283Z 468,26 + 25 = 493,26 ; DGA508Z 173,82
const l1=devis.items.find(i=>/DHR283Z/.test(i.name)), l2=devis.items.find(i=>/DGA508Z/.test(i.name));
ok(l1 && /coffret TSTAK/.test(l1.name), 'ligne DHR283Z porte le libellé "+ coffret TSTAK"');
ok(l1 && /493[,.]26/.test(l1.sub), 'sous-total DHR283Z = 493,26 € (base 468,26 + 25) — lu: '+(l1&&l1.sub));
ok(l2 && /173[,.]82/.test(l2.sub), 'sous-total DGA508Z sans coffret = 173,82 € — lu: '+(l2&&l2.sub));

// 4. Payer tout → la modale doit afficher le total coffret inclus + envoyer coffret:true au serveur
await pg.click('#devisPay');
await pg.waitForTimeout(800);
const modal=await pg.evaluate(()=>{
  const m=document.getElementById('payModal'); if(!m) return {open:false};
  return {open:!m.hidden, text:(m.textContent||'').replace(/\s+/g,' ').slice(0,900)};
});
ok(modal.open,'modale de paiement ouverte');
ok(/493[,.]26/.test(modal.text)||/667[,.]08/.test(modal.text),'la modale inclut le montant coffret (493,26 visible ou total 667,08) — extrait: '+modal.text.slice(0,200));
// le PI part quand le formulaire adresse est valide ; on force l'appel en remplissant si présent
/* ⚠️ DEUX DÉFAUTS CORRIGÉS LE 01/08/2026, et le second est le plus grave.

   ① Le harnais visait `#payAddrCp`, qui n'a jamais existé — le champ est
      `#payAddrPostal`. `elementHandle.fill` attendait donc 30 s puis TUAIT le
      harnais : zéro assertion rendue.
   ② Il ne remplissait que QUATRE des SIX champs obligatoires de l'adresse
      (ni e-mail ni téléphone). Le formulaire n'était jamais valide, la
      commande ne partait pas au serveur — et l'assertion la plus importante
      du fichier, « le serveur reçoit bien coffret:true », se transformait en
      un `ℹ️` poli. Un contrôle qui se contente d'un message quand il ne peut
      pas conclure est un contrôle qui ne contrôle rien.

   On remplit donc TOUT ce que le produit déclare obligatoire, relu du DOM :
   ajouter un champ requis demain ne pourra plus désarmer ce contrôle. */
const requis = await pg.evaluate(() =>
  [...document.querySelectorAll('#payAddress [required]')].map(e => e.id).filter(Boolean));
ok(requis.length >= 4, 'PRÉALABLE : le formulaire d\'adresse déclare ses champs obligatoires — ' + JSON.stringify(requis));
const VALEURS = {
  payAddrName: 'Client de démonstration', payAddrEmail: 'client@exemple.invalid',
  payAddrPhone: '0690123456', payAddrLine1: '1 rue du Port',
  payAddrPostal: '97110', payAddrCity: 'Pointe-à-Pitre'
};
for (const id of requis) {
  const v = VALEURS[id];
  ok(v !== undefined, 'champ obligatoire « ' + id + ' » connu du harnais (sinon il ne peut pas valider le formulaire)');
  if (v === undefined) continue;
  await pg.fill('#' + id, v);
  await pg.dispatchEvent('#' + id, 'change');
}
await pg.waitForTimeout(1800);

ok(!!piBody, 'PRÉALABLE : la commande est bien partie au serveur — sans elle, rien de ce qui suit ne serait vérifié');
if (piBody) {
  const it=(piBody.items||[]).find(x=>/dhr283z/i.test(x.key||''));
  ok(it && it.coffret===true, 'payload serveur : items[] DHR283Z porte coffret:true — reçu: '+JSON.stringify(piBody.items));
}
ok(errs.length===0,'0 erreur JS — '+JSON.stringify(errs));
console.log(A.join('\n'));
await b.close();srv.close();
