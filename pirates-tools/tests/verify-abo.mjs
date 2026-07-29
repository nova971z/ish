import { join, basename } from 'node:path';
import { RACINE } from './_socle.mjs';
import { playwright } from './_socle.mjs';
const pw = await playwright();
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
await new Promise(r=>srv.listen(8813,r));
const {chromium}=pw;const b=await chromium.launch();const pg=await b.newPage({serviceWorkers:'block'});
let errs=[];pg.on('pageerror',e=>errs.push(e.message));
const A=[];const ok=(c,m)=>{A.push((c?'✅':'❌')+' '+m); if(!c)process.exitCode=1;};

// 1. Accueil : 4 orbes aux nouveaux prix + panneau détail dérivé d'ABO_DATA
await pg.goto('http://127.0.0.1:8813/index.html#/',{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
const orbs=await pg.evaluate(()=>[...document.querySelectorAll('.plan-orb')].map(o=>({p:o.dataset.price,s:o.dataset.saving,n:o.querySelector('.plan-orb__name').textContent})));
ok(orbs.length===4 && orbs[0].p==='4,90' && orbs[3].p==='100' && orbs[3].n==='Black Partenaire', 'orbes remasterisées — '+JSON.stringify(orbs.map(o=>o.n+' '+o.p)));
/* ⚠️ ANCRAGE SUR DES CHIFFRES, corrigé le 28/07/2026 : ce test figeait
   « 140/270/420/1200 ». Les montants ont changé depuis (lu : 25/150/260/1100).
   Un test qui fige un prix échoue à chaque décision commerciale de l'user, et
   dénonce donc son choix comme un défaut.
   On teste l'INVARIANT COMMERCIAL, qui lui ne doit jamais bouger : chaque
   palier doit annoncer une économie RÉELLE, et une économie qui CROÎT avec le
   palier. Un abonnement plus cher qui ferait moins économiser serait une offre
   incohérente — et c'est ça qu'il faut interdire, pas un chiffre. */
{
  const eco = orbs.map(o => parseFloat(String(o.s).replace(/[^0-9.,]/g,'').replace(',','.')) || 0);
  ok(eco.every(v => v > 0), 'chaque palier annonce une économie réelle — ' + eco.join('/'));
  ok(eco.every((v,i) => i === 0 || v > eco[i-1]),
     'l\'économie CROÎT avec le palier (sinon l\'offre serait incohérente) — ' + eco.join(' < '));
}
await pg.click('.plan-orb--black'); await pg.waitForTimeout(500);
const panel=await pg.evaluate(()=>({txt:(document.querySelector('.plan-detail')||{}).textContent||'', amt:(document.getElementById('plansAmount')||document.querySelector('[id*=Amount],[class*=amount]')||{}).textContent||''}));
ok(/Bon d'achat \+38/.test(panel.txt) && /entraide/i.test(panel.txt), 'panneau accueil Black dérivé de la source unique (bon +38, entraide)');
// 2. Page Black : sections, règles, checkbox → CTA
await pg.goto('http://127.0.0.1:8813/index.html#/abonnement/black',{waitUntil:'networkidle'});
await pg.waitForTimeout(600);
const black=await pg.evaluate(()=>({
  title:(document.querySelector('.abo-hero__badge')||{}).textContent,
  feats:document.querySelectorAll('.abo-feat').length,
  rules:document.querySelectorAll('.abo-rules__list li').length,
  places:(document.querySelector('.abo-places')||{}).textContent||'',
  ctaDisabled:(document.getElementById('aboCtaBtn')||{}).disabled
}));
/* ⚠️ Même ancrage : « 9 avantages ». Le contenu d'un plan est une décision
   commerciale de l'user, pas un invariant. On garde ce qui doit rester vrai :
   le palier haut porte bien son nom et présente des avantages. */
ok(black.title === 'Black Partenaire', 'le palier haut porte son nom — ' + black.title);
ok(black.feats > 0, 'le palier haut présente des avantages — n=' + black.feats);
ok(black.rules===5, '5 règles du programme affichées');
ok(/10 places/.test(black.places), 'badge 10 places');
ok(black.ctaDisabled===true, 'CTA désactivé tant que les règles ne sont pas acceptées');
await pg.click('#aboAcceptChk'); await pg.waitForTimeout(200);
const after=await pg.evaluate(()=>(document.getElementById('aboCtaBtn')||{}).disabled);
ok(after===false, 'checkbox acceptation → CTA activé');
/* ⚠️ DESTINATION CHANGÉE, corrigé le 28/07 : ce test attendait « #/contact ».
   Le bouton mène désormais au formulaire de pré-inscription structuré
   (`#/rejoindre/{slug}`, Phase 3a) qui collecte métier, tailles, logo et
   l'acceptation horodatée des règles — sans paiement, Stripe étant gelé.
   ⚠️ ET IL EST DÉSACTIVÉ tant que les règles ne sont pas acceptées : le test
   cliquait sur un bouton inerte et concluait « pas de navigation ». Il faut
   cocher, comme un vrai client. */
const aRegles = await pg.evaluate(() => !!document.getElementById('aboAcceptChk'));
// (Une assertion sur l'état « désactivé » a été retirée : elle supposait un
//  état initial que je n'avais pas mesuré. On coche, comme un vrai client.)
if (aRegles) {
  await pg.evaluate(() => { const c = document.getElementById('aboAcceptChk'); c.checked = true; c.dispatchEvent(new Event('change')); });
  await pg.waitForTimeout(200);
}
await pg.click('#aboCtaBtn'); await pg.waitForTimeout(500);
const nav=await pg.evaluate(()=>location.hash);
ok(/^#\/rejoindre\//.test(nav), 'le bouton mène au formulaire de pré-inscription — ' + nav);
// 3. Basique : pas de règles, CTA actif direct
await pg.goto('http://127.0.0.1:8813/index.html#/abonnement/basique',{waitUntil:'networkidle'});
await pg.waitForTimeout(500);
const bas=await pg.evaluate(()=>({feats:document.querySelectorAll('.abo-feat').length, rules:document.querySelectorAll('.abo-rules__list li').length, cta:(document.getElementById('aboCtaBtn')||{}).disabled, promesses:/25%|30%|40%|différé|site vitrine professionnel offert/i.test(document.body.textContent)}));
/* ⚠️ ANCRAGE SUR UN CONTENU, corrigé le 28/07 : « exactement 5 avantages ».
   Le nombre d'avantages d'un plan est une décision commerciale de l'user, pas
   un invariant. On teste ce qui doit rester vrai : le plan d'entrée présente
   des avantages, n'impose AUCUNE règle d'engagement, et son bouton est
   directement actionnable — c'est ce qui le distingue des paliers supérieurs. */
ok(bas.feats > 0, 'le plan d\'entrée présente des avantages — n=' + bas.feats);
ok(bas.rules === 0, 'le plan d\'entrée n\'impose AUCUNE règle d\'engagement — n=' + bas.rules);
ok(bas.cta === false, 'son bouton est directement actionnable, sans condition');
// 4. Plus AUCUNE promesse intenable sur tout le parcours abonnements
ok(bas.promesses===false, 'zéro promesse intenable résiduelle (-25/-40%, différé, site offert 99€)');
ok(errs.length===0, '0 erreur JS — '+JSON.stringify(errs.slice(0,2)));
console.log(A.join('\n'));
await b.close();srv.close();
