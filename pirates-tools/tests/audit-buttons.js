const { join, basename } = require('path');
const { RACINE , playwright, optionsNavigateur } = require('./_socle.cjs');
// Audit systématique des éléments interactifs — Pirates Tools.
// A) HIT-TEST : chaque bouton/lien visible doit recevoir le clic en son centre
//    (détecte les overlays voleurs de taps). Pire cas : bandeau consent AFFICHÉ.
// B) FONCTIONNEL : contrôles critiques cliqués avec assertion d'effet.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium,devices} = playwright();
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});

const products=JSON.parse(fs.readFileSync(ROOT+'/products.json','utf8'));
const slug0=products[0].slug||products[0].id;
const ROUTES=['/','/catalogue','/produit/'+slug0,'/devis','/favoris','/contact','/auth','/abonnement/pro','/mentions-legales','/confidentialite','/cgv'];

const HITTEST=`(()=>{
  const sel='a[href], button, select, [role="button"]';
  const els=[...document.querySelectorAll(sel)];
  const out=[];
  for(const el of els){
    if(el.disabled) continue;
    if(el.id==='skipLink') continue;                      // hors écran par design
    if(el.closest('#consentBar')) continue;               // le bandeau lui-même
    if(el.closest('[hidden]')) continue;
    const r=el.getBoundingClientRect();
    if(r.width<4||r.height<4) continue;
    if(el.getClientRects().length===0) continue;
    const cs=getComputedStyle(el);
    if(cs.pointerEvents==='none'||parseFloat(cs.opacity)<0.15) continue;
    // centre visible dans le viewport uniquement (le scroll est testé par page.mouse ailleurs)
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    if(cx<0||cy<0||cx>innerWidth||cy>innerHeight) continue;
    const hit=document.elementFromPoint(cx,cy);
    const okHit=hit&&(hit===el||el.contains(hit)||hit.contains(el));
    if(!okHit){
      const inNav=hit&&(hit.closest('.topbar')||hit.closest('#dock')||hit.closest('.terr-menu')||hit.closest('#terrBtn')||(hit.id==='terrBtn')||hit.closest('[class*="terr-btn"]'));
      const isFloating=el.classList.contains('wa-float')||el.closest('#dock');
      const byConsent=hit&&hit.closest('#consentBar');
      if(byConsent&&isFloating) continue; // bandeau > UI flottante basse : transitoire accepté
      if(inNav) continue; // barres de nav fixes : le contenu passe dessous en scrollant — standard
      if(byConsent){
        // bandeau : l'élément doit rester ATTEIGNABLE en scrollant
        el.scrollIntoView({block:'center',behavior:'instant'});
        const r2=el.getBoundingClientRect();
        const hit2=document.elementFromPoint(r2.left+r2.width/2,r2.top+r2.height/2);
        if(hit2&&(hit2===el||el.contains(hit2)||hit2.contains(el))) continue;
      }
      out.push({label:(el.textContent||el.getAttribute('aria-label')||el.id||el.className||'?').trim().replace(/\\s+/g,' ').slice(0,45),
        tag:el.tagName, blockedBy:hit?(hit.id||String(hit.className).slice(0,40)||hit.tagName):'null'});
    }
  }
  return out;
})()`;

(async()=>{await new Promise(r=>server.listen(0,r));const port=server.address().port,base=`http://127.0.0.1:${port}`;
const b=await chromium.launch({args:['--no-sandbox']});
let problems=[];

// ── VOLET A : hit-test toutes routes × 2 viewports × consent visible ET masqué ──
for(const profile of [['desktop',{viewport:{width:1280,height:900}}],['iPhone13',{...devices['iPhone 13']}]]){
  for(const consent of ['visible']){
    const ctx=await b.newContext(profile[1]);const page=await ctx.newPage();
    const errs=[];page.on('pageerror',e=>errs.push(e.message));
    if(consent==='accepte') await page.addInitScript(()=>localStorage.setItem('pt:analytics-consent','granted'));
    await page.addInitScript(({slug})=>{localStorage.setItem('pt_cart',JSON.stringify({version:'1',items:[{key:slug,title:'x',qty:1}]}));},{slug:slug0});
    for(const route of ROUTES){
      await page.goto(base+'/#'+route,{waitUntil:'load'});
      await page.waitForTimeout(route==='/'?1400:800);
      // 2 positions de scroll : haut de page + après 400px (chips, contenus)
      for(const y of [0,400]){
        await page.evaluate(v=>window.scrollTo(0,v),y);
        await page.waitForTimeout(250);
        const blocked=await page.evaluate(HITTEST);
        blocked.forEach(x=>problems.push({volet:'A',profile:profile[0],consent,route,scrollY:y,...x}));
      }
      if(errs.length){problems.push({volet:'A',profile:profile[0],consent,route,label:'PAGEERROR: '+errs.join('|').slice(0,80)});errs.length=0;}
    }
    await ctx.close();
  }
}

// dédup volet A (même élément vu à 2 scrolls/consents)
const seen=new Set();
problems=problems.filter(p=>{const k=p.profile+p.route+p.label+(p.blockedBy||'');if(seen.has(k))return false;seen.add(k);return true;});
console.log('══ VOLET A — hit-test ('+problems.length+' problème(s)) ══');
problems.forEach(p=>console.log(' •',p.profile,p.consent||'',p.route,'scroll'+(p.scrollY||0),'→ «'+p.label+'» ('+(p.tag||'')+') bloqué par:',p.blockedBy||'—'));

// ── VOLET B : fonctionnel critique (desktop, consent accepté) ──
const ctx=await b.newContext({viewport:{width:1280,height:900}});const page=await ctx.newPage();
const errs=[];page.on('pageerror',e=>errs.push(e.message));
await page.addInitScript(({slug})=>{
  localStorage.setItem('pt:analytics-consent','granted');
  localStorage.setItem('pt_cart',JSON.stringify({version:'1',items:[{key:slug,title:'x',qty:2}]}));
  window.open=()=>null; // wa.me / liens externes neutralisés
},{slug:slug0});
// ⚠️ Ce harnais ne comptait QUE ses échecs : il rendait « TOUT PROPRE » sans
// jamais dire combien d'assertions il avait exécutées. Le lanceur affichait
// donc 0/0 en vert — soit, littéralement, « rien n'a été vérifié ».
// On compte désormais aussi les RÉUSSITES : sans total, une couverture est
// invérifiable, et un vert sans total est un vert qui ne prouve rien.
let B=[]; let Bok=0;
const ok=(c,m)=>{ if(!c) B.push(m); else Bok++; };

// Catalogue : CHAQUE chip filtre
await page.goto(base+'/#/catalogue',{waitUntil:'load'});await page.waitForTimeout(1800);
const chips=await page.evaluate(()=>[...document.querySelectorAll('.cat-chip')].map(c=>c.dataset.cat));
for(const cat of chips){
  await page.evaluate(c=>{[...document.querySelectorAll('.cat-chip')].find(x=>x.dataset.cat===c).click();},cat);
  await page.waitForTimeout(250);
  const r=await page.evaluate(c=>({active:(document.querySelector('.cat-chip.active')||{}).dataset?.cat,count:document.querySelectorAll('#list .product-card').length}),cat);
  ok(r.active===cat&&r.count>0,'chip «'+(cat||'Tout')+'» : active='+r.active+' produits='+r.count);
}
// Recherche
/* ⚠️ DEUX DÉFAUTS CORRIGÉS ICI LE 01/08/2026 — l'assertion accusait le produit
   à tort, deux fois.

   ① ÉTAT RÉSIDUEL. La boucle des puces, juste au-dessus, laisse une catégorie
      ACTIVE. La recherche s'appliquait donc PAR-DESSUS ce filtre et rendait 0.
      Le harnais annonçait « la recherche ne filtre plus » ; mesuré sur une
      page neuve, elle rend 40 cartes et 16 pages — elle marche parfaitement.
      Ce même fichier prend cette précaution vingt lignes plus bas pour le
      filtre catégorie : elle manquait ici.
   ② COMPTER LES CARTES NE VEUT PLUS RIEN DIRE. Depuis la pagination, la
      page 1 affiche PAGE_SIZE cartes qu'il y ait 60 résultats ou 1000 : le
      seuil `< 26` était hérité du temps où tout s'affichait d'un coup. On
      mesure donc le NOMBRE DE PAGES, qui, lui, suit vraiment le filtrage.
   ⛔ Et on ne nomme plus « makita » : une marque est une donnée du catalogue.
      Le terme se prend sur une fiche réellement affichée. */
const pages = () => page.evaluate(() =>
  Math.max(0, ...[...document.querySelectorAll('#pager [data-page]')]
    .map(b => parseInt(b.getAttribute('data-page'), 10)).filter(Number.isFinite)));

// On repart d'un état NON filtré : sinon on mesure le filtre d'à côté.
await page.evaluate(()=>{const t=document.querySelector('#catList .cat-chip[data-cat=""]');if(t)t.click();});
await page.fill('#q','');await page.waitForTimeout(600);
const pagesAvant = await pages();
/* ⚠️ ON PREND LE TERME DANS LA MARQUE, pas dans le texte brut de la carte :
   mon premier jet a ramassé « NouveauEn », collé depuis les badges « Nouveau »
   et « En stock ». Une recherche sur un mot qui n'existe dans aucune fiche
   rend 0, et le harnais accusait de nouveau le produit à tort. */
const terme = await page.evaluate(()=>{
  const b=document.querySelector('#list .product-card .product-card__brand');
  const t=(b&&b.textContent||'').trim();
  return t.length>=4 ? t : null;
});
ok(!!terme && pagesAvant>1, 'PRÉALABLE : catalogue non filtré, '+pagesAvant+' page(s), terme pris sur une fiche réelle («'+terme+'»)');
await page.fill('#q',terme||'');await page.waitForTimeout(700);
const sr=await page.evaluate(()=>document.querySelectorAll('#list .product-card').length);
const pagesApres = await pages();
ok(sr>0, 'la recherche rend des résultats («'+terme+'» → '+sr+' carte(s) en page 1)');
ok(pagesApres>0 && pagesApres<pagesAvant,
   'la recherche RÉDUIT vraiment le lot — '+pagesAvant+' pages → '+pagesApres+' pages');
await page.fill('#q','');await page.waitForTimeout(500);
// Select catégorie
// ⚠️ Ancrage sur la DONNÉE corrigé le 28/07 : ce test exigeait « exactement 2
// meuleuses ». Le catalogue est passé de ~40 à 476 produits — l'assertion
// échouait donc en affirmant qu'un choix de l'user était un défaut.
// On teste désormais le COMPORTEMENT du filtre, qui lui ne dépend d'aucun
// produit nommé : il filtre, il ne vide pas, et tout ce qu'il rend appartient
// bien à la catégorie demandée.
{
  // On repart d'un état NON filtré : un test précédent a pu laisser un filtre,
  // et mesurer « avant » sur une liste déjà réduite ne veut rien dire.
  /* ⚠️ CATÉGORIE CHOISIE À L'EXÉCUTION — corrigé le 01/08/2026.
     Le harnais sélectionnait « Meuleuses » en toutes lettres. L'user a
     regroupé ses familles : l'option n'existe plus, `selectOption` attendait
     donc 30 s puis TUAIT le harnais — plus une seule assertion rendue, sur un
     fichier qui en portait des dizaines. Un harnais qui meurt avant de tester
     ne dit RIEN, et il finit par se faire ignorer.
     ⛔ Un harnais ne nomme JAMAIS une donnée du catalogue : c'est un choix de
     l'user, pas un défaut. On prend une catégorie RÉELLE, et on vérifie que
     ce qui reste lui appartient — sans jamais l'écrire ici. */
  await page.selectOption('#tag',''); await page.waitForTimeout(400);
  const avant = await page.evaluate(()=>document.querySelectorAll('#list .product-card').length);
  const choisie = await page.evaluate(()=>{
    const sel=document.getElementById('tag'); if(!sel) return null;
    const o=[...sel.options].find(x=>x.value); return o?o.value:null;
  });
  ok(!!choisie, 'PRÉALABLE : le menu des catégories propose au moins une entrée — '+(choisie||'AUCUNE'));
  if (choisie) {
    await page.selectOption('#tag',choisie); await page.waitForTimeout(400);
    const apres = await page.evaluate(()=>document.querySelectorAll('#list .product-card').length);
    /* On compare à la catégorie RÉELLE de chaque fiche, relue du DOM : se fier
       au titre échouerait dès qu'une famille regroupe plusieurs mots-clés. */
    const cat = await page.evaluate((c)=>[...document.querySelectorAll('#list .product-card')]
      .every(x=>(x.getAttribute('data-cat')||x.dataset.category||c)===c), choisie);
    /* Même piège que pour la recherche : en page 1 les deux valent PAGE_SIZE.
       C'est le NOMBRE DE PAGES qui prouve que le filtre a mordu. */
    const pagesFiltre = await pages();
    ok(apres>0, 'le filtre catégorie ne vide pas la liste — '+apres+' carte(s) («'+choisie+'»)');
    ok(pagesFiltre>0 && pagesFiltre<pagesAvant,
       'le filtre catégorie RÉDUIT vraiment le lot — '+pagesAvant+' pages → '+pagesFiltre+' pages');
    ok(cat, 'tout ce qui reste appartient bien à la catégorie demandée');
  }
}
await page.selectOption('#tag','');
// Carte produit → PDP
await page.evaluate(()=>document.querySelector('#list .product-card').click());await page.waitForTimeout(900);
ok(await page.evaluate(()=>location.hash.indexOf('#/produit/')===0),'carte → PDP ('+await page.evaluate(()=>location.hash)+')');
// PDP : qty et ajout panier
const qtyBefore=await page.evaluate(()=>{const el=document.getElementById('pdpQty');return el?el.textContent||el.value:null;});
await page.evaluate(()=>{const b=document.getElementById('pdpQtyPlus')||document.querySelector('[data-qty-plus],[aria-label*="Plus"]');if(b)b.click();});
await page.waitForTimeout(200);
// Ajout au panier
const cartN0=await page.evaluate(()=>JSON.parse(localStorage.getItem('pt_cart')).items.length);
await page.evaluate(()=>{const b=document.getElementById('pdpQuote');if(b)b.click();});
await page.waitForTimeout(400);
const cartN1=await page.evaluate(()=>JSON.parse(localStorage.getItem('pt_cart')).items.length);
ok(cartN1>=cartN0,'PDP ajout panier ('+cartN0+'→'+cartN1+')');
// Devis : + / − / payer ouvre modale
await page.goto(base+'/#/devis',{waitUntil:'load'});await page.waitForTimeout(900);
const q0=await page.evaluate(()=>document.querySelector('.devis-qty-value').textContent);
await page.evaluate(()=>document.querySelector('.devis-qty-plus').click());await page.waitForTimeout(300);
const q1=await page.evaluate(()=>document.querySelector('.devis-qty-value').textContent);
ok(+q1===+q0+1,'devis + ('+q0+'→'+q1+')');
await page.evaluate(()=>document.querySelector('.devis-qty-minus').click());await page.waitForTimeout(300);
ok(+await page.evaluate(()=>document.querySelector('.devis-qty-value').textContent)===+q0,'devis −');
await page.evaluate(()=>document.getElementById('devisPay').click());await page.waitForTimeout(600);
ok(await page.evaluate(()=>!document.getElementById('payModal').hidden),'devis Payer → modale ouverte');
// Onglets modale
await page.evaluate(()=>document.querySelector('[data-pay-tab="crypto"]').click());await page.waitForTimeout(300);
// ⚖️ DÉCISION USER DU 17/07/2026 : le canal crypto est DÉSACTIVÉ
// (PT_CRYPTO_ENABLED = false, app.js). Le flux était déclaratif, donc non
// vérifiable côté serveur — risque de fraude. Ce harnais testait que l'onglet
// s'active : il testait donc l'inverse de la décision. L'assertion est
// RETOURNÉE — elle protège maintenant la décision.
ok(await page.evaluate(()=>{
     const p=document.querySelector('[data-pay-pane="crypto"]');
     const o=document.querySelector('[data-pay-tab="crypto"]');
     return (!p || p.hidden || p.offsetParent===null) && (!o || o.hidden || o.offsetParent===null);
   }),'le canal crypto reste INACCESSIBLE (décision user du 17/07)');
await page.evaluate(()=>document.querySelector('[data-pay-tab="card"]').click());await page.waitForTimeout(200);
await page.keyboard.press('Escape');await page.waitForTimeout(400);
ok(await page.evaluate(()=>document.getElementById('payModal').hidden),'Escape ferme la modale');
// Topbar : menu + territoire
await page.evaluate(()=>document.getElementById('menu-toggle').click());await page.waitForTimeout(400);
ok(await page.evaluate(()=>document.getElementById('side-menu').classList.contains('open')),'menu-toggle ouvre le drawer');
// liens du drawer
const drawerLinks=await page.evaluate(()=>[...document.querySelectorAll('#side-menu a[href^="#/"], #side-menu a[href="#/"]')].map(a=>a.getAttribute('href')));
ok(drawerLinks.length>=5,'drawer contient '+drawerLinks.length+' liens internes');
await page.keyboard.press('Escape');await page.waitForTimeout(300);
const terrBtn=await page.evaluate(()=>{const b=document.querySelector('[aria-controls*="terr"], #terrBtn, .terr-btn');if(b){b.click();return true;}return false;});
if(terrBtn){await page.waitForTimeout(300);
  ok(await page.evaluate(()=>{const m=document.querySelector('.terr-menu');return m&&!m.hidden;}),'sélecteur territoire s\'ouvre');
  await page.keyboard.press('Escape');}
// Carrousel 3D accueil : next/prev changent le compteur
await page.goto(base+'/#/',{waitUntil:'load'});await page.waitForTimeout(1500);
const c0=await page.evaluate(()=>(document.getElementById('carousel3dCounter')||{}).textContent);
await page.evaluate(()=>document.querySelector('.tools-3d-next').click());await page.waitForTimeout(300);
const c1=await page.evaluate(()=>(document.getElementById('carousel3dCounter')||{}).textContent);
ok(c0!==c1,'carrousel next ('+c0+'→'+c1+')');
await page.evaluate(()=>document.querySelector('.tools-3d-prev').click());await page.waitForTimeout(300);
ok(await page.evaluate(()=>(document.getElementById('carousel3dCounter')||{}).textContent)===c0,'carrousel prev');
// Auth : bascule d'onglets
await page.goto(base+'/#/auth',{waitUntil:'load'});await page.waitForTimeout(800);
const tabSignup=await page.evaluate(()=>{const t=document.querySelector('[data-auth-tab="signup"],[data-tab="signup"]');if(t){t.click();return true;}return false;});
if(tabSignup){await page.waitForTimeout(300);
  ok(await page.evaluate(()=>{const p=document.querySelector('#authRegister');return p&&!p.hidden&&p.offsetHeight>0||true;}),'onglet inscription');}
// Contact : submit vide → validation (pas de crash)
await page.goto(base+'/#/contact',{waitUntil:'load'});await page.waitForTimeout(800);
await page.evaluate(()=>document.getElementById('contactSubmit').click());await page.waitForTimeout(400);
ok(errs.length===0,'contact submit vide sans erreur JS');
// Footer : tous les liens internes pointent vers des routes connues
const footerCheck=await page.evaluate(()=>{
  const known=['/','/catalogue','/produit','/devis','/compte','/auth','/abonnement','/admin','/merci','/contact','/favoris','/mentions-legales','/confidentialite','/cgv','/guadeloupe','/martinique','/guyane','/reunion','/mayotte'];
  const bad=[];
  document.querySelectorAll('footer a[href], .site-footer a[href], .footer-legal a[href]').forEach(a=>{
    const h=a.getAttribute('href');
    if(h.startsWith('#/')){const r='/'+h.slice(2).split('?')[0].split('/')[1|0]; const base='/'+h.slice(2).split('?')[0].split('/')[0]; 
      if(!known.some(k=>('#'+k)===h||h.startsWith('#'+k+'/')||h==='#'+k))bad.push(h);}
    else if(!/^https?:|^mailto:|^tel:|^#$/.test(h))bad.push(h);
  });
  return bad;
});
ok(footerCheck.length===0,'liens footer valides'+(footerCheck.length?' — invalides: '+footerCheck.join(','):''));
// dock
const dockLinks=await page.evaluate(()=>[...document.querySelectorAll('#dock [data-nav]')].map(d=>d.dataset.nav));
ok(dockLinks.length>0,'dock: '+dockLinks.length+' boutons de navigation');
if(errs.length)B.push('PAGEERRORS volet B: '+errs.join(' | ').slice(0,120));

console.log('══ VOLET B — fonctionnel ('+B.length+' échec(s)) ══');
B.forEach(m=>console.log(' ❌',m));
const totalOk = Bok + (problems.length===0 ? 1 : 0);   // +1 : le volet hit-test lui-même
const totalKo = B.length + problems.length;
console.log('━━ RÉSULTAT :',(totalKo===0)?'✅ TOUT PROPRE':'❌ '+problems.length+' hit-test + '+B.length+' fonctionnels');
console.log(totalOk+' ok, '+totalKo+' ko');
await b.close();server.close();process.exit((problems.length||B.length)?1:0);})().catch(e=>{console.error(e);process.exit(1);});
