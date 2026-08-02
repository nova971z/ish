// Harnais : paiement de course quincaillerie + stepper quantité (SW v476).
// 1. Fiche QC → stepper visible, +/− fonctionnels, bornes 1..99.
// 2. openPayModal(items, courseCtx) → ligne livraison affichée, total = produits
//    + frais, formulaire adresse PRÉREMPLI (CP du chantier).
// 3. Fiche machine → stepper masqué.
// 4. addToCart addQty → panier à la bonne quantité.
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml' };
const server = http.createServer(async (req,res)=>{
  try { let p = decodeURIComponent(req.url.split('?')[0]); if (p==='/') p='/index.html';
    const fp = normalize(join(ROOT,p)); if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end();}
    const s = await stat(fp).catch(()=>null); if(!s||!s.isFile()){res.writeHead(404);return res.end('nf');}
    res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'}); res.end(await readFile(fp));
  } catch(e){res.writeHead(500);res.end(String(e));}
});
await new Promise(r=>server.listen(0,r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:1194,height:834} });
await ctx.route('**/*', r => /stripe|googleapis|gstatic|jsdelivr|coingecko|firebase|api-adresse|osrm|openstreetmap/.test(r.request().url()) ? r.abort() : r.continue());
const page = await ctx.newPage();
let pass=0, fail=0;
const T = (name, ok, extra='') => { ok?pass++:fail++; console.log((ok?'✅':'❌')+' '+name+(extra?' — '+extra:'')); };

/* Fiche choisie À L'EXÉCUTION par CATÉGORIE — la règle des harnais interdit de
   nommer une donnée du catalogue, et ce fichier l'a payé : il visait
   `quincaillerie-0001` en dur, morte au retrait des 304 fiches maison
   (02/08/2026). Même critère que l'app (estQuincaillerie). */
const catQ = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));
const prodsQ = Array.isArray(catQ) ? catQ : (catQ.products || []);
const ficheQ = prodsQ.find(p => p.category === 'Quincaillerie' && (p.id || p.slug));
if (!ficheQ) { console.log('❌ PRÉALABLE : aucune fiche de catégorie Quincaillerie au catalogue'); process.exit(1); }
await page.goto(base+'/index.html#/produit/'+(ficheQ.id||ficheQ.slug),{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
await page.waitForTimeout(800);

// 1. Stepper visible sur fiche QC
let r = await page.evaluate(()=>{
  const w=document.getElementById('pdpQtyWrap');
  return { hidden: w?w.hidden:null, val: (document.getElementById('pdpQtyVal')||{}).textContent };
});
T('Stepper visible sur fiche quincaillerie', r.hidden===false, JSON.stringify(r));
// + / − / bornes
await page.click('#pdpQtyPlus'); await page.click('#pdpQtyPlus');
r = await page.evaluate(()=>document.getElementById('pdpQtyVal').textContent);
T('Deux clics + → quantité 3', r==='3', r);
await page.click('#pdpQtyMinus');
r = await page.evaluate(()=>({v:document.getElementById('pdpQtyVal').textContent}));
T('Un clic − → quantité 2', r.v==='2', r.v);
r = await page.evaluate(()=>{ // borne basse
  const m=document.getElementById('pdpQtyMinus'); m.click(); return { v: document.getElementById('pdpQtyVal').textContent, dis: m.disabled };
});
T('Borne basse : 1 atteint, bouton − désactivé', r.v==='1' && r.dis===true, JSON.stringify(r));

// 2. Ajout panier à qty 3
await page.click('#pdpQtyPlus'); await page.click('#pdpQtyPlus');
await page.click('#pdpQuote');
r = await page.evaluate(()=>{
  const keys=Object.keys(localStorage).filter(k=>/cart/i.test(k));
  const raw=JSON.parse(localStorage.getItem(keys[0])||'{}');
  const c=Array.isArray(raw)?raw:(raw.items||[]);
  return c.map(i=>({key:i.key,qty:i.qty}));
});
T('Ajout panier → qty 3 en une fois', JSON.stringify(r).includes('"qty":3'), JSON.stringify(r));

// 3. Modale paiement avec contexte course
/* La clé est celle de la fiche RÉELLE choisie plus haut : une clé morte ne
   résout plus vers un produit, et le prix territorial (971) ne s'applique
   alors pas — c'est ce qui a rougi ce test au retrait des fiches maison. */
r = await page.evaluate((cleFiche)=>{
  window.openPayModal([{ key:cleFiche, title:'Article de contrôle', price:1, qty:2 }],
    { address:'12 Rue des Alizés 97180 Sainte-Anne', street:'12 Rue des Alizés', postal:'97180', city:'Sainte-Anne',
      lat:16.24, lng:-61.36, date:'2026-07-28', when:'matin', hour:'', zone:1, prix:22 });
  const modal=document.getElementById('payModal');
  const items=document.getElementById('payModalItems');
  const deliv=items.querySelector('.pay-modal__line--deliv');
  /* Somme des lignes PRODUITS lue dans la modale elle-même : recopier la
     table fiscale 971 dans un harnais serait un seuil recopié (il se
     périme) — l'invariant testable est « total = produits + livraison ». */
  const lignesProduits = [...items.querySelectorAll('.pay-modal__line:not(.pay-modal__line--deliv) .pay-modal__line-price')]
    .map(el => { const m = el.textContent.replace(/\s/g,'').match(/(\d+(?:[.,]\d{2}))€/); return m ? parseFloat(m[1].replace(',','.')) : 0; });
  return {
    open: modal && modal.hidden===false,
    delivLine: deliv ? deliv.textContent.replace(/\s+/g,' ').trim() : null,
    sommeProduits: lignesProduits.reduce((s,x)=>s+x, 0),
    total: document.getElementById('payModalTotal').textContent,
    postal: document.getElementById('payAddrPostal').value,
    line1: document.getElementById('payAddrLine1').value,
    city: document.getElementById('payAddrCity').value
  };
}, ficheQ.id || ficheQ.slug);
T('Modale de paiement OUVERTE', r.open===true);
T('Ligne livraison zone 1 — 22 € affichée', !!r.delivLine && r.delivLine.includes('zone 1') && r.delivLine.includes('22'), r.delivLine||'absente');
{
  /* Jusqu'au 02/08/2026 ce test attendait « 23,90 € » en dur, calculé sur une
     clé produit morte : la modale utilise le prix RÉEL de la fiche (serveur
     autoritaire), pas celui passé en ligne. L'invariant qui ne se périme
     pas : le total affiché = somme des lignes produits + livraison, au
     centime. */
  const totalNum = parseFloat(String(r.total).replace(/[^0-9,.]/g,'').replace(',','.'));
  const attendu = Math.round((r.sommeProduits + 22) * 100) / 100;
  T('Total = somme des lignes produits + livraison 22 €, au centime',
    r.sommeProduits > 0 && Math.abs(totalNum - attendu) <= 0.01,
    r.total + ' vs produits ' + r.sommeProduits + ' + 22');
}
T('Adresse chantier préremplie (CP 97180)', r.postal==='97180' && r.city==='Sainte-Anne' && r.line1.length>3, JSON.stringify({postal:r.postal,city:r.city,line1:r.line1}));

// 3b. Photo du chantier : setInputFiles → compression + aperçu + statut
{
  // petit PNG 2x2 rouge
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADUlEQVR4nGP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==','base64');
  await page.setInputFiles('#pdpDelivScene', { name:'chantier.png', mimeType:'image/png', buffer: png });
  await page.waitForTimeout(600);
  const sc = await page.evaluate(()=>({
    st: (document.getElementById('pdpDelivSceneSt')||{}).textContent,
    prev: !document.getElementById('pdpDelivScenePrev').hidden && !!document.querySelector('#pdpDelivScenePrev img'),
    stored: !!(document.getElementById('pdpDelivery')._ptScene)
  }));
  T('Photo chantier : compressée, aperçu affiché, stockée', sc.st.includes('✅') && sc.prev && sc.stored, JSON.stringify(sc));
}

// 3c. Consentement remise filmée : cases présentes dans les 2 widgets
{
  const cc = await page.evaluate(()=>({
    pdp: !!document.getElementById('pdpDelivFilmOk'),
    liv: !!document.getElementById('livDelivFilmOk'),
    txt: (document.querySelector('#pdpDelivery .lv-consent--film')||{}).textContent||''
  }));
  T('Consentement remise filmée présent (fiche + page livraison)', cc.pdp && cc.liv && cc.txt.includes('filmée'), JSON.stringify({pdp:cc.pdp,liv:cc.liv}));
}

// 3d. Garde CGV : le bouton de commande refuse tant que la case n'est pas cochée
{
  const g = await page.evaluate(()=>{
    const cgv=document.getElementById('payCgvOk');
    const btn=document.getElementById('payModalConfirm');
    if(cgv) cgv.checked=false;
    btn.click();                                   // tentative sans consentement
    const note=document.getElementById('payCgvNote');
    return { label: btn.textContent.trim(), bloque: note && !note.hidden, coche: cgv? cgv.checked : null };
  });
  T('Bouton porte la mention légale obligatoire', /Commander avec obligation de paiement/.test(g.label), g.label);
  T('Sans case cochée → commande bloquée + message', g.bloque===true && g.coche===false, JSON.stringify(g));
}

// 4. Fiche machine → stepper masqué
await page.evaluate(()=>{ location.hash='#/catalogue'; });
await page.waitForTimeout(300);
r = await page.evaluate(()=>{
  const prods = (window.PT_PRODUCTS||[]);
  return null;
});
await page.goto(base+'/index.html#/produit/makita-dtw700z-boulonneuse-a-chocs-1-2-18v-lxt-700nm-machine-seule',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
await page.waitForTimeout(700);
r = await page.evaluate(()=>{
  const w=document.getElementById('pdpQtyWrap');
  const title=(document.getElementById('pdpTitle')||{}).textContent||document.title;
  return { hidden: w?w.hidden:null, title };
});
T('Stepper MASQUÉ sur fiche machine', r.hidden===true, JSON.stringify(r));

console.log(`\n${pass} OK / ${fail} KO`);
await browser.close(); server.close();
process.exit(fail?1:0);
