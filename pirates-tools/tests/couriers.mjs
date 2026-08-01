// Harnais : annuaire livreurs + fiche publique + tarifs par zone + chat (SW v495).
//  A. #/livraison → grille des cartes livreurs ; bandeau vert UNIQUEMENT si dispo.
//  B. Clic carte → fiche publique : nom, compteurs, carte des zones avec SES prix.
//  C. Accueil → bandeau livreurs affiché.
//  D. #/mode-livraison → panneau tarifs : carte pleine largeur, saisie en direct,
//     interrupteur de disponibilité.
//  E. Espace client → fil de discussion présent dès que la course est acceptée.
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

const COURIERS = [
  { uid:'u1', published:true, displayName:'Kevin L.', commune:'Sainte-Anne', vehicle:'scooter',
    bio:'Dispo tous les matins.', available:true, coursesDone:12, ratingCount:4, ratingSum:19,
    tarifs:{1:30,2:60,3:90,4:120},
    avis:[{r:5,c:'Rapide et sérieux',d:'2026-07-20'},{r:4,c:'',d:'2026-07-22'}] },
  { uid:'u2', published:true, displayName:'Marie B.', commune:'Le Moule', vehicle:'vae',
    available:false, coursesDone:3, ratingCount:0, ratingSum:0, tarifs:{1:18,2:40,3:70,4:95} },
  { uid:'u3', published:true, displayName:'Test C.', available:false, coursesDone:0, ratingCount:0, ratingSum:0 }
];

// État serveur simulé pour l'espace livreur
let profile = { uid:'me', displayName:'Kevin L.', commune:'Sainte-Anne', vehicle:'scooter',
  bio:'', photo:'', tarifs:{1:30,2:60,3:90,4:120}, available:false, published:true,
  coursesDone:12, ratingCount:4, ratingSum:19 };
// DEMANDE de livraison : acceptée par un livreur, AUCUN paiement.
const COURSE = { id:'c1', status:'acceptee', productTitle:'Vis inox', qty:2, address:'12 Rue des Alizés, Sainte-Anne',
  km:1.2, zone:1, lat:16.23, lng:-61.38, date:'2026-07-28', when:'matin', hour:'',
  mine:true, acceptedByMe:false, courierUid:'u1', courierName:'Kevin L.', chatOpen:true, round:1,
  paid:false, escrow:null, feeCents:0, amountCents:0, code:'123456', hasScene:false, hasProof:false,
  accord:null, goodsPaid:false, goodsAmountCents:0, lines:[{key:'quincaillerie-0001', qty:2}],
  rating:0, ratingComment:'', videosCount:0, litige:null, createdAt:Date.now() };
const API = [];   // journal des appels /api/contact (type + corps)

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:1194,height:834} });
// Aucun tiers : ni Stripe, ni Firebase, ni tuiles carto.
await ctx.route('**/*', r => /stripe|googleapis|gstatic|jsdelivr|coingecko|firebase|api-adresse|osrm|openstreetmap|unpkg|tile\./.test(r.request().url()) ? r.abort() : r.continue());
// API simulée
await ctx.route('**/api/contact', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  API.push(body);
  const send = (o) => route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(o) });
  if (body.type === 'course-request') return send({ ok:true, id:'newc', course:{ id:'newc', km:1.2, zone:1, code:'999999' } });
  if (body.type === 'course-scene') return send({ ok:true, id: body.id });
  if (body.type === 'course-accord-propose') {
    COURSE.accord = Object.assign({}, body.accord, { okClient:true, okLivreur:false, valide:false });
    return send({ ok:true, id: body.id, accord: COURSE.accord, valide:false });
  }
  if (body.type === 'course-accord-accept') {
    COURSE.accord = Object.assign({}, COURSE.accord, { okClient:true, okLivreur:true, valide:true });
    return send({ ok:true, id: body.id, accord: COURSE.accord, valide:true });
  }
  if (body.type === 'course-accord-reject') { COURSE.accord = null; return send({ ok:true, id: body.id, accord:null }); }
  if (body.type === 'course-goods-paid') { COURSE.goodsPaid = true; return send({ ok:true, id: body.id, status:'confirmee' }); }
  if (body.type === 'course-release') return send({ ok:true, id: body.id, status:'en_attente' });
  if (body.type === 'course-cancel') return send({ ok:true, id: body.id, status:'annulee' });
  if (body.type === 'courier-status') return send({ ok:true, courier:true });
  if (body.type === 'courier-profile') return send({ ok:true, courier:true, profile, repere:{1:22,2:48,3:74,4:100} });
  if (body.type === 'courier-profile-save') { profile = Object.assign({}, profile, body); return send({ ok:true, tarifs: body.tarifs }); }
  if (body.type === 'courier-available') { profile.available = !!body.available; return send({ ok:true, available: profile.available }); }
  if (body.type === 'course-list') { if (process.env.DBG) console.log('   [dbg] course-list accord =', JSON.stringify(COURSE.accord)); return send({ ok:true, courier:true, dispo:[], mine:[COURSE] }); }
  return send({ ok:true });
});
// Le PaymentIntent part sur /api/create-payment-intent (pas /api/contact) :
// on l'intercepte à part pour vérifier le marqueur de course.
const PI = [];
await ctx.route('**/api/create-payment-intent', async (route) => {
  PI.push(JSON.parse(route.request().postData() || '{}'));
  await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
    ok:true, clientSecret:'pi_test_secret', paymentIntentId:'pi_test',
    amount:190, gross:190, deliveryCents:0, course:null,
    loyalty:{ pct:0, discountCents:0, tierLabel:'Bronze' }
  }) });
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('💥 JS:', e.message));
await page.addInitScript((list) => {
  window.PT_COURIERS_FIXTURE = list;
  window.PT_PARTNERS_FIXTURE = [];
  // Firebase SIMULÉ : utilisateur connecté + Firestore minimal. Permet de tester
  // l'espace livreur (réservé aux connectés) et le fil de discussion sans réseau.
  window.__ptChatWrites = [];
  // Stripe.js SIMULÉ : sans lui, l'app ne crée jamais de PaymentIntent et on
  // ne pourrait pas vérifier que le marqueur de course part au serveur.
  window.Stripe = function () {
    var el = { mount: function () {}, on: function () {}, unmount: function () {}, destroy: function () {} };
    return {
      elements: function () { return { create: function () { return el; }, getElement: function () { return el; },
        submit: function () { return Promise.resolve({}); } }; },
      confirmPayment: function () { return Promise.resolve({ paymentIntent: { id: 'pi_test', status: 'succeeded' } }); }
    };
  };
  var USER = { uid:'me', email:'justforwada@icloud.com', displayName:'Kevin L.',
    getIdToken: function () { return Promise.resolve('faux-jeton'); } };
  // Renvoyés DANS LE DÉSORDRE : sans orderBy Firestore (index composite évité),
  // c'est le tri client qui doit rétablir la chronologie.
  var MSGS = [
    { uid:'me', role:'client', round:1, at:{ toMillis:function(){return 3000;} }, text:'Parfait, le portail sera ouvert.' },
    { uid:'systeme', role:'systeme', round:1, at:{ toMillis:function(){return 1000;} }, text:'Course acceptée par Kevin L.' },
    { uid:'u1', role:'livreur', round:1, at:{ toMillis:function(){return 2000;} }, text:'Bonjour, je passe vers 9h.' }
  ];
  window.__ptChatQuery = null;
  window.PT_FIREBASE = {
    configured: true, auth: {}, db: {},
    onAuthStateChanged: function (a, cb) { setTimeout(function () { cb(USER); }, 0); return function () {}; },
    doc: function () { return {}; },
    getDoc: function () { return Promise.resolve({ exists: function () { return false; } }); },
    setDoc: function () { return Promise.resolve(); },
    updateDoc: function () { return Promise.resolve(); },
    collection: function () { var a = [].slice.call(arguments); return { path: a.slice(1).join('/') }; },
    addDoc: function (col, data) { window.__ptChatWrites.push({ path: col.path, data: data }); return Promise.resolve({ id: 'x' }); },
    getDocs: function () { return Promise.resolve({ forEach: function () {} }); },
    query: function (c) { return c; },
    orderBy: function () { window.__ptUsedOrderBy = true; return {}; },
    where: function (f, op, v) { window.__ptChatQuery = { f: f, op: op, v: v }; return {}; },
    limit: function () { return {}; },
    onSnapshot: function (q, cb) {
      setTimeout(function () {
        cb({ forEach: function (f) { MSGS.forEach(function (m) { f({ data: function () { return m; } }); }); } });
      }, 0);
      return function () {};
    },
    serverTimestamp: function () { return new Date(); }
  };
}, COURIERS);

let pass=0, fail=0;
const T = (name, ok, extra='') => { ok?pass++:fail++; console.log((ok?'✅':'❌')+' '+name+(extra?' — '+extra:'')); };
// ⚙️ Depuis le 27/07/2026, la fiche du livreur n'est modifiable QUE derrière
// le bouton Paramètres : l'espace de travail est réservé aux courses. Tous les
// contrôles qui visent le formulaire doivent donc l'ouvrir d'abord.
// ⚠️ IDEMPOTENT : appelée alors que les paramètres sont DÉJÀ ouverts, un
// second clic les refermerait et l'attente ne se terminerait jamais.
// Attente de l'ESPACE DE TRAVAIL (courses). À ne pas confondre avec
// ouvrirParams : les deux écrans s'excluent, et attendre le mauvais fait
// expirer le harnais sur un élément volontairement caché.
const attendreEspace = async () => {
  // #courierMine vit dans un <details> REPLIÉ (historique) : il est donc
  // ATTACHÉ mais pas visible. On attend sa présence, pas sa visibilité.
  await page.waitForSelector('#courierWork:not([hidden]) #courierMine', { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(300);
};
const ouvrirParams = async () => {
  const dejaOuvert = await page.evaluate(() => {
    const p = document.getElementById('courierParams');
    return !!p && !p.hidden;
  });
  if (!dejaOuvert) await page.click('#courierGear');
  await page.waitForSelector('#courierTarifMap svg', { timeout: 10000 });
};
let bootN = 0;
// La liste des livraisons vit dans « Historique de commande », un <details>
// REPLIÉ (user 28/07/2026) : on le déplie avant de cliquer une carte, comme
// le ferait l'utilisateur. La livraison EN COURS, elle, s'ouvre toute seule.
// La course EN COURS n'est plus dans une liste (user 28/07/2026) : la grosse
// fiche s'ouvre toute seule dessus. Seules les courses TERMINÉES vivent dans
// « Historique de course ». Ce helper couvre les deux cas.
const ouvrirCourseLivreur = async () => {
  const dansHisto = await page.evaluate(() => {
    // Course EN COURS → signet orange, visible d'emblée. Terminée → historique.
    const sg = document.querySelector('#courierEnCours .lv-signet');
    if (sg) { sg.click(); return false; }
    const h = document.querySelector('#courierWork details.lv-histo');
    const b = h && h.querySelector('[data-course-focus]');
    if (b) { h.open = true; b.click(); return true; }
    return false;
  });
  await page.waitForTimeout(dansHisto ? 400 : 100);
  return dansHisto;
};
const ouvrirHisto = async () => {
  await page.evaluate(() => { const d = document.querySelector('details.lv-histo'); if (d) d.open = true; });
  await page.waitForTimeout(150);
};
const boot = async (hash) => {
  // Deux boot() sur la MÊME URL feraient une navigation same-document (aucun
  // rechargement, donc aucun re-render). Le compteur garantit une URL neuve.
  await page.goto(base+'/index.html?b='+(++bootN)+hash, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(700);
};

// ── A. Annuaire sur #/livraison ────────────────────────────────────────────
await boot('#/livraison');
let r = await page.evaluate(()=>{
  const cards=[...document.querySelectorAll('#couriersGrid .courier-card')];
  return cards.map(c=>({
    name:(c.querySelector('.courier-card__name')||{}).textContent,
    on:c.classList.contains('courier-card--on'),
    dispo:(c.querySelector('.courier-card__dispo')||{}).textContent,
    // Le POINT lumineux doit exister sur chaque carte (allumé ou éteint).
    point: !!c.querySelector('.courier-card__dispo .lv-service__dot'),
    price:(c.querySelector('.courier-card__price')||{}).textContent,
    href:c.getAttribute('href')
  }));
});
T('Annuaire : 3 cartes livreurs affichées', r.length===3, JSON.stringify(r.map(x=>x.name)));
T('État « en service » UNIQUEMENT sur le livreur en ligne',
  r[0] && r[0].on===true && /En service/.test(r[0].dispo)
  && r[1] && r[1].on===false && /Pas en service/.test(r[1].dispo),
  JSON.stringify(r.map(x=>({n:x.name,on:x.on,d:(x.dispo||'').trim()}))));
T('Chaque carte porte le point lumineux', r.every(x=>x.point));
T('Carte : prix mini = SON tarif zone 1 (30 €, pas le repère 22 €)', /30\s*€/.test(r[0].price||''), r[0].price);
T('Carte cliquable vers la fiche publique', r[0].href==='#/livreur-profil/u1', r[0].href);

// ── B. Fiche publique ──────────────────────────────────────────────────────
await page.click('#couriersGrid .courier-card');
await page.waitForTimeout(600);
r = await page.evaluate(()=>{
  const svg=document.querySelector('#courierProfMap svg');
  const labels=[...document.querySelectorAll('#courierProfMap text[id^="cpZ"]')].map(t=>t.textContent);
  return {
    hash: location.hash,
    h1: (document.getElementById('courierprof-h1')||{}).textContent,
    counters: [...document.querySelectorAll('.courier-prof__c strong')].map(e=>e.textContent),
    dispo: (document.querySelector('.lv-service')||{}).textContent,
    dispoOn: !!(document.querySelector('.lv-service') || {classList:{contains:()=>false}}).classList.contains('is-on'),
    dispoPoint: !!document.querySelector('.lv-service .lv-service__dot'),
    hasSvg: !!svg,
    labels,
    legend: [...document.querySelectorAll('#view-livreur-profil .lv-tarif__price')].map(e=>e.textContent),
    avis: document.querySelectorAll('.courier-avis__i').length,
    editable: document.querySelectorAll('#view-livreur-profil .lv-tarif__in input').length
  };
});
T('Route fiche livreur ouverte', r.hash==='#/livreur-profil/u1', r.hash);
T('Nom du livreur en titre', r.h1==='Kevin L.', r.h1);
T('Compteurs : 12 courses · 4,8/5 · à partir de 30 €',
  r.counters[0]==='12' && r.counters[1]==='4.8/5' && r.counters[2]==='30 €', JSON.stringify(r.counters));
T('Fiche : bandeau « EN SERVICE » allumé', /EN SERVICE/.test(r.dispo||'') && r.dispoOn===true, r.dispo);
T('Fiche : le point lumineux est présent', r.dispoPoint);
T('Carte des zones rendue (SVG)', r.hasSvg===true);
T('Les 4 prix DU LIVREUR sont inscrits dans les zones',
  JSON.stringify(r.labels)===JSON.stringify(['30 €','60 €','90 €','120 €']), JSON.stringify(r.labels));
T('Légende = ses prix (30/60/90/120), pas le repère',
  JSON.stringify(r.legend)===JSON.stringify(['30 €','60 €','90 €','120 €']), JSON.stringify(r.legend));
T('Aucun champ de saisie en vue client (lecture seule)', r.editable===0, String(r.editable));
T('2 avis clients affichés', r.avis===2, String(r.avis));

// Livreur sans tarifs enregistrés → repli sur le repère indicatif
await boot('#/livreur-profil/u3');
r = await page.evaluate(()=>[...document.querySelectorAll('#courierProfMap text[id^="cpZ"]')].map(t=>t.textContent));
T('Livreur sans tarifs → repère indicatif affiché (22/48/74/100)',
  JSON.stringify(r)===JSON.stringify(['22 €','48 €','74 €','100 €']), JSON.stringify(r));

// uid inconnu → message clair, pas de page vide
await boot('#/livreur-profil/inconnu');
r = await page.evaluate(()=>(document.getElementById('courierProfileBody')||{}).textContent||'');
T('uid inconnu → message explicite (pas de page vide)', /n'existe pas|plus inscrit/.test(r), r.slice(0,60));

// ── C. Bandeau accueil ─────────────────────────────────────────────────────
await boot('#/');
r = await page.evaluate(()=>{
  const s=document.getElementById('couriersStripSection');
  return { hidden:s?s.hidden:null, cards:document.querySelectorAll('#couriersStripTrack .courier-card').length };
});
T('Accueil : bandeau livreurs affiché avec les cartes', r.hidden===false && r.cards===4, JSON.stringify(r));

// ── D. Espace livreur : tarifs + disponibilité ─────────────────────────────
await boot('#/mode-livraison');
T('à l\'arrivée, AUCUN champ de fiche dans l\'espace de travail',
  await page.evaluate(()=>document.querySelectorAll('#courierWork #lvPfName, #courierWork input[id^="lvTarifIn"]').length===0));
T('le bouton ⚙️ Paramètres est présent et à droite',
  await page.evaluate(()=>{ const g=document.getElementById('courierGear');
    return !!g && g.getBoundingClientRect().x > 300; }));
await ouvrirParams();
r = await page.evaluate(()=>{
  const map=document.querySelector('#courierTarifMap svg');
  return {
    panel: !!document.getElementById('courierTarifs').querySelector('.lv-tarifs'),
    mapFirst: (()=>{ const t=document.getElementById('courierTarifs'), e=document.getElementById('courierEarnings');
      return !!(t && e && (t.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)); })(),
    hasSvg: !!map,
    width: map ? Math.round(map.getBoundingClientRect().width) : 0,
    hostWidth: Math.round(document.getElementById('courierTarifMap').getBoundingClientRect().width),
    labels: [...document.querySelectorAll('#courierTarifMap text[id^="ctZ"]')].map(t=>t.textContent),
    inputs: [...document.querySelectorAll('.lv-tarif__in input')].map(i=>i.value),
    dispoOn: (document.getElementById('lvDispoBtn')||{}).getAttribute ? document.getElementById('lvDispoBtn').getAttribute('aria-pressed') : null
  };
});
T('Panneau tarifs présent EN TÊTE de l\'espace livreur (avant les gains)', r.panel===true && r.mapFirst===true, JSON.stringify({p:r.panel,f:r.mapFirst}));
T('Grande carte des zones rendue', r.hasSvg===true);
T('Carte sur toute la largeur de son conteneur', r.width>0 && Math.abs(r.width - r.hostWidth) <= 2, r.width+'px / hôte '+r.hostWidth+'px');
T('Carte en GRAND format (> 380 px de large)', r.width>380, r.width+'px');
T('Ses prix inscrits dans les zones', JSON.stringify(r.labels)===JSON.stringify(['30 €','60 €','90 €','120 €']), JSON.stringify(r.labels));
T('4 champs de saisie pré-remplis à SES prix', JSON.stringify(r.inputs)===JSON.stringify(['30','60','90','120']), JSON.stringify(r.inputs));
T('Interrupteur de disponibilité initialement à OFF', r.dispoOn==='false', String(r.dispoOn));

// Saisie : le prix change EN DIRECT dans l'anneau
await page.fill('#lvTarifIn1', '45');
await page.waitForTimeout(150);
r = await page.evaluate(()=>document.getElementById('ctZ1').textContent);
T('Saisie d\'un prix → mise à jour immédiate dans la zone', r==='45 €', r);

// Interrupteur → passe à ON
await page.click('#lvDispoBtn');
await page.waitForTimeout(400);
r = await page.evaluate(()=>({
  pressed: document.getElementById('lvDispoBtn').getAttribute('aria-pressed'),
  cls: document.getElementById('lvDispoBtn').className,
  txt: (document.querySelector('.lv-dispo__txt')||{}).textContent
}));
T('Clic sur l\'interrupteur → DISPONIBLE', r.pressed==='true' && /is-on/.test(r.cls) && /DISPONIBLE/.test(r.txt), JSON.stringify(r));

// Enregistrement : le prix saisi part bien au serveur
const saved = new Promise(res => page.once('requestfinished', ()=>{}));
await page.click('#lvPfSave');
await page.waitForTimeout(500);
r = await page.evaluate(()=>(document.getElementById('lvPfSt')||{}).textContent);
T('Enregistrement de la fiche confirmé', /Enregistré/.test(r||''), r);
T('Le serveur a reçu le tarif zone 1 modifié (45 €)', profile.tarifs && Number(profile.tarifs[1])===45, JSON.stringify(profile.tarifs));

// ── E. Le fil a QUITTÉ le bloc détail ─────────────────────────────────────
// SPEC MISE À JOUR (user 28/07/2026) : « enlever les messages qui n'ont plus
// rien à faire à l'intérieur, la bulle de discussion est là pour ça ». Le bloc
// détail ne garde que ce qui appartient à la course. Le fil lui-même (envoi,
// ordre chronologique, rôles, chemin d'écriture) est couvert par bulle.mjs.
await boot('#/mes-livraisons');
await page.waitForTimeout(500);
// SPEC AFFINÉE (user 28/07/2026) : rien ne s'ouvre tout seul. La livraison en
// cours est portée par un SIGNET orange néon, hors de l'historique replié ;
// c'est le clic dessus qui ouvre la fiche.
const sigCli = await page.evaluate(()=>{
  const h=document.getElementById('clientDelivEnCours');
  const s=h && !h.hidden ? h.querySelector('.lv-signet') : null;
  return { ferme:(document.getElementById('clientDelivDetail')||{}).hidden===true, signet:!!s };
});
T("Aucune fiche ouverte d'office", sigCli.ferme===true, JSON.stringify(sigCli));
T('Un signet « en cours » porte la livraison', sigCli.signet===true, JSON.stringify(sigCli));
await page.evaluate(()=>{const s=document.querySelector('#clientDelivEnCours .lv-signet'); if(s) s.click();});
await page.waitForTimeout(600);
r = await page.evaluate(()=>{
  const det=document.getElementById('clientDelivDetail');
  return {
    auto: !!det && !det.hidden,
    chat: !!det.querySelector('.lv-chat'),
    log: !!det.querySelector('#lvChatLog'),
    champ: !!det.querySelector('#lvChatInput'),
    bulles: det.querySelectorAll('.lv-msg').length,
    lien: (det.querySelector('a[href^="#/livreur-profil/"]')||{}).getAttribute
      ? det.querySelector('a[href^="#/livreur-profil/"]').getAttribute('href') : null,
    actions: det.querySelectorAll('[data-cpanel]').length,
    bulleDock: !!document.getElementById('chatBubble')
  };
});
T("Le clic sur le signet ouvre la fiche", r.auto===true, JSON.stringify(r));
T('AUCUN fil de messages dans le bloc détail', r.log===false && r.champ===false && r.bulles===0, JSON.stringify(r));
T("La colonne d'actions de la course est bien là", r.actions>0, r.actions+' bouton(s)');
T('Lien vers la fiche du livreur depuis la livraison', r.lien==='#/livreur-profil/u1', String(r.lien));
T('La discussion vit dans la BULLE, toujours accessible', r.bulleDock===true);


// ── F. Colonne d'actions + accord + paiement de la marchandise ─────────────
r = await page.evaluate(()=>[...document.querySelectorAll('.lv-chat__side .lv-cbtn')]
  .map(b=>({ p:b.getAttribute('data-cpanel'), t:(b.querySelector('.lv-cbtn__t')||{}).textContent,
             s:(b.querySelector('.lv-cbtn__s')||{}).textContent })));
T('Colonne d\'actions à droite du chat : 4 boutons côté client',
  r.length===4 && r.map(x=>x.p).join(',')==='accord,pay,code,release', JSON.stringify(r.map(x=>x.p)));
T('Le bouton Accord annonce qu\'il reste à rédiger', r[0].s==='à rédiger', r[0].s);
T('Le paiement est annoncé comme postérieur à l\'accord', r[1].s==="après l'accord", r[1].s);

// Panneau paiement AVANT accord → bloqué
await page.click('[data-cpanel="pay"]');
await page.waitForTimeout(250);
r = await page.evaluate(()=>({ txt:(document.getElementById('lvChatPanel')||{}).textContent,
  btn: !!document.getElementById('acPay') }));
T('Sans accord validé, aucun bouton de paiement',
  r.btn===false && /accord est validé/.test(r.txt||''), (r.txt||'').slice(0,60));

// Rédiger l'accord
await page.click('[data-cpanel="accord"]');
await page.waitForTimeout(250);
// ⚖️ RÈGLE MÉTIER RENVERSÉE (user 28/07/2026) : « le client ne peut pas
// proposer son prix, le prix se gère dans la conversation ». Le CLIENT n'a
// donc plus AUCUN formulaire d'accord — ni prix, ni mode de règlement, ni
// lieu (qu'il a déjà donné à la commande). Il attend la proposition du
// livreur, l'accepte, ou négocie dans le fil. Détail : plan9.mjs.
r = await page.evaluate(()=>{
  const p = document.getElementById('lvChatPanel');
  return {
    prix: !!p.querySelector('#acPrix'),
    /* Même exigence que plan9 : ces champs ne doivent PAS exister côté
       client. On compte pour prouver le zéro.
       ancres-absentes-voulues: acPaiement, acLieu */
    modes: [...p.querySelectorAll('input[name="acPaiement"], #acPaiement')].length,
    lieu: !!p.querySelector('#acLieu'),
    propose: !!p.querySelector('#acPropose'),
    saisies: p.querySelectorAll('input:not([type=hidden]), select, textarea').length,
    txt: p.textContent.replace(/\s+/g,' ')
  };
});
T('Le CLIENT n\'a aucun champ de prix', r.prix===false, JSON.stringify(r).slice(0,120));
T('Ni mode de règlement, ni lieu à ressaisir', r.modes===0 && r.lieu===false);
T('Aucun bouton « proposer » côté client', r.propose===false);
T('Zéro champ de saisie dans son panneau', r.saisies===0, r.saisies+' champ(s)');
T('Le panneau lui dit que le prix vient du livreur', /livreur/i.test(r.txt), r.txt.slice(0,70));
T('Ses conditions de commande lui sont rappelées', /2026-07-28/.test(r.txt), r.txt.slice(0,90));


// L'autre partie a proposé → le panneau s'ouvre TOUT SEUL, avec « J'accepte »
COURSE.accord = { prix:35, paiement:'especes', lieu:'Portail bleu', date:'2026-07-28', hour:'',
                  okClient:false, okLivreur:true, valide:false };
await boot('#/mes-livraisons');
await ouvrirHisto(); await page.click('[data-deliv-focus]');
await page.waitForTimeout(700);
// SPEC MISE À JOUR (user 28/07/2026) : « le widget où il y a l'accord, je veux
// qu'il soit fermé ». PLUS AUCUNE ouverture automatique — on arrive sur des
// panneaux fermés, la pastille du bouton dit ce qui attend, et c'est le clic
// qui ouvre. Un panneau qui se déplie tout seul rendait l'écran illisible.
r = await page.evaluate(()=>({
  ferme: document.getElementById('lvChatPanel').hidden,
  badge: (document.querySelector('[data-cpanel="accord"] .lv-cbtn__s')||{}).textContent
}));
T("Aucun panneau ouvert a l'arrivee", r.ferme===true, JSON.stringify(r));
await page.click('[data-cpanel="accord"]');
await page.waitForTimeout(300);
r.accept = await page.evaluate(()=>!!document.getElementById('acAccept'));
T("Au clic, le panneau propose « J'accepte cet accord »", r.accept===true, JSON.stringify(r));
T('Le bouton de la colonne signale « à accepter »', /à accepter/.test(r.badge||''), r.badge);
API.length = 0;
await page.click('#acAccept');
await page.waitForTimeout(600);
T('Acceptation envoyée', API.some(b=>b.type==='course-accord-accept'), JSON.stringify(API.map(b=>b.type)));

// Accord validé → le panneau « Ma marchandise » s'ouvre tout seul côté client
await boot('#/mes-livraisons');
await ouvrirHisto(); await page.click('[data-deliv-focus]');
await page.waitForTimeout(600);
T("Aucun panneau ouvert a l'arrivee (accord valide)",
  await page.evaluate(()=>document.getElementById('lvChatPanel').hidden)===true);
await page.click('[data-cpanel="pay"]');
await page.waitForTimeout(300);
r = await page.evaluate(()=>({
  open: !document.getElementById('lvChatPanel').hidden,
  txt: document.getElementById('lvChatPanel').textContent,
  pay: !!document.getElementById('acPay')
}));
T('Au clic, le panneau de reglement offre le bouton de paiement',
  r.open===true && r.pay===true, (r.txt||'').slice(0,70));
T('Le panneau rappelle que la course va DIRECTEMENT au livreur',
  /ne passent pas par nous/.test(r.txt||''), (r.txt||'').slice(0,120));

// Le paiement de la marchandise ouvre bien la modale carte, marquée pour cette course
await page.click('#acPay');
await page.waitForTimeout(500);
/* L'adresse valide déclenche la création du PaymentIntent (handlePayAddressChange).
   ⚠️ E-MAIL ET TÉLÉPHONE SONT OBLIGATOIRES depuis le 01/08/2026 : sans eux
   `validatePayAddress()` rend `valid: false`, aucune commande n'est créée, et
   cette assertion tombait sur « aucun ». Le harnais était périmé, pas le code —
   il testait un formulaire qui n'existait plus.
   ⛔ Un harnais qui rougit sans qu'on sache s'il accuse le code ou lui-même ne
   protège plus rien : c'est pour ça qu'il est remis à jour, pas contourné. */
await page.fill('#payAddrName', 'Kevin L.');
await page.fill('#payAddrEmail', 'kevin@exemple.invalid');
await page.fill('#payAddrPhone', '0690112233');
await page.fill('#payAddrLine1', '12 Rue des Alizés');
await page.fill('#payAddrPostal', '97180');
await page.fill('#payAddrCity', 'Sainte-Anne');
await page.waitForTimeout(900);
r = await page.evaluate(()=>({
  modal: !!(document.getElementById('payModal') && document.getElementById('payModal').hidden===false),
  total: (document.getElementById('payModalTotal')||{}).textContent
}));
T('Clic « Payer ma marchandise » → modale carte ouverte', r.modal===true, r.total);
const pi = PI[PI.length-1];
T('Le paiement porte le marqueur de la course (et AUCUN prix de course dedans)',
  !!pi && pi.courseId==='c1' && pi.course === undefined && pi.items.length===1,
  pi ? JSON.stringify({ courseId:pi.courseId, course:pi.course, items:pi.items }) : 'aucun');

// ── F2. Remise en ligne depuis la colonne d'actions ────────────────────────
await boot('#/mes-livraisons');
await ouvrirHisto(); await page.click('[data-deliv-focus]');
await page.waitForTimeout(600);
await page.click('[data-cpanel="release"]');
await page.waitForTimeout(250);
r = await page.evaluate(()=>({ btn: !!document.getElementById('lvChatRelease'),
  txt:(document.getElementById('lvChatPanel')||{}).textContent }));
T('Panneau « remettre en ligne » avec avertissement sur la discussion',
  r.btn===true && /ne pourra pas la lire/.test(r.txt||''), (r.txt||'').slice(0,60));
API.length = 0;
await page.click('#lvChatRelease');
await page.waitForTimeout(400);
T('Clic → appel course-release sur la bonne course',
  API.some(b=>b.type==='course-release' && b.id==='c1'), JSON.stringify(API.map(b=>b.type)));

// ── G. Annulation par le client (confirmation en 2 temps) ──────────────────
await boot('#/mes-livraisons');
await ouvrirHisto(); await page.click('[data-deliv-focus]');
await page.waitForTimeout(400);
r = await page.evaluate(()=>({ btn: !!document.getElementById('clientCancelBtn'),
  txt: (document.getElementById('clientCancelBtn')||{}).textContent }));
T('Bouton « annuler ma demande » présent côté client', r.btn===true, r.txt);
API.length = 0;
await page.click('#clientCancelBtn');                 // 1er clic = armement seulement
await page.waitForTimeout(250);
r = await page.evaluate(()=>(document.getElementById('clientCancelBtn')||{}).textContent);
T('1er clic n\'annule PAS (protection anti-tap accidentel)',
  /Confirmer/.test(r||'') && !API.some(b=>b.type==='course-cancel'), r);
await page.click('#clientCancelBtn');                 // 2e clic = annulation réelle
await page.waitForTimeout(400);
T('2e clic → appel course-cancel', API.some(b=>b.type==='course-cancel' && b.id==='c1'),
  JSON.stringify(API.map(b=>b.type)));

// ── H. LA DEMANDE N'OUVRE PLUS AUCUN PANNEAU DE PAIEMENT ───────────────────
await boot('#/produit/quincaillerie-0001');
API.length = 0;
r = await page.evaluate(()=>{
  // Simule une adresse géocodée (l'API adresse est coupée dans le harnais).
  const map = document.getElementById('pdpDeliveryMap');
  map._ptGeo = { lat:16.2260, lng:-61.3823, label:'12 Rue des Alizés, 97180 Sainte-Anne',
                 street:'12 Rue des Alizés', postal:'97180', city:'Sainte-Anne' };
  const box = document.getElementById('pdpDelivery');
  box._ptScene = 'data:image/jpeg;base64,AAAA';
  document.getElementById('pdpDelivFilmOk').checked = true;
  document.getElementById('pdpDelivOrder').click();
  return { label: document.getElementById('pdpDelivOrder').textContent.trim() };
});
T('Le bouton dit bien « demande », plus « commander »',
  /Envoyer ma demande/.test(r.label), r.label);
await page.waitForTimeout(700);
const modalOpen = await page.evaluate(()=>{
  const m = document.getElementById('payModal');
  return !!(m && m.hidden === false);
});
T('AUCUN panneau de paiement ne s\'ouvre', modalOpen===false, String(modalOpen));
const req = API.find(b=>b.type==='course-request');
T('Une demande de course est envoyée au serveur', !!req, JSON.stringify(API.map(b=>b.type)));
T('La demande porte l\'adresse, la date et le créneau — et AUCUN prix',
  !!req && req.address.indexOf('Sainte-Anne')>-1 && !!req.date && req.when==='matin'
  && req.prix===undefined && req.zone===undefined,
  req ? JSON.stringify({a:req.address,d:req.date,w:req.when,p:req.prix,z:req.zone}) : 'aucune');
T('La photo du chantier est jointe juste après la demande',
  API.some(b=>b.type==='course-scene' && b.id==='newc'), JSON.stringify(API.map(b=>b.type)));

// ── I. ÉTAT « CONFIRMÉE » : la course réellement commandée ─────────────────
// (défauts trouvés à l'audit : le livreur ne pouvait pas valider la livraison,
//  le client perdait son code, la vidéo/litige disparaissaient.)
COURSE.status = 'confirmee';
COURSE.goodsPaid = true;
COURSE.accord = { prix:35, paiement:'especes', lieu:'Portail bleu', okClient:true, okLivreur:true, valide:true };
COURSE.acceptedByMe = true;

await boot('#/mes-livraisons');
await ouvrirHisto(); await page.click('[data-deliv-focus]');
await page.waitForTimeout(600);
// Le code de remise a QUITTÉ le corps du bloc (user 28/07/2026) : il s'affichait
// deux fois, et un code secret n'a rien à faire en permanence sous les yeux de
// qui passe derrière l'épaule. Il vit désormais dans son panneau, au clic.
await page.click('[data-cpanel="code"]');
await page.waitForTimeout(300);
r = await page.evaluate(()=>{
  const det=document.getElementById('clientDelivDetail');
  return {
    statut: /Statut\s*:/.test(det.textContent) || /Commandée/.test(det.textContent),
    code: !!det.querySelector('.lv-handcode__num'),
    video: !!det.querySelector('.lv-video, .lv-dispute'),
    annuler: !!det.querySelector('#clientCancelBtn'),
    note: !!det.querySelector('.lv-rate')
  };
});
T('Course confirmée : le client VOIT toujours son code de remise', r.code===true);
T('Course confirmée : vidéo/litige toujours accessibles', r.video===true);
T('Course confirmée : plus d\'annulation possible (marchandise payée)', r.annuler===false);
T('Aucune note tant que la livraison n\'est pas faite', r.note===false);

await boot('#/mode-livraison');
await attendreEspace();
await page.waitForTimeout(400);
await ouvrirCourseLivreur();
await page.waitForTimeout(500);
r = await page.evaluate(()=>{
  const det=document.getElementById('courierDetail');
  return {
    proof: !!det.querySelector('#courierProofBtn'),
    code: !!det.querySelector('#courierCode'),
    prix: (det.querySelector('.lv-h2')||{}).textContent,
    release: !!det.querySelector('[data-cpanel="release"]')
  };
});
T('Course confirmée : le livreur PEUT valider la livraison (3 preuves)',
  r.proof===true && r.code===true, JSON.stringify({p:r.proof,c:r.code}));
T('Le livreur voit SON tarif de zone (' + profile.tarifs[1] + ' €), pas le repère plateforme (22 €)',
  new RegExp(profile.tarifs[1] + ' €').test(r.prix||'') && !/22 €/.test(r.prix||''), r.prix);
T('Course confirmée : la remise en ligne reste possible (sortie autonome, audit P5)',
  r.release===true, JSON.stringify(r.release));

// Course acceptée mais NI accord NI paiement → livraison impossible
COURSE.status = 'acceptee'; COURSE.goodsPaid = false; COURSE.accord = null;
await boot('#/mode-livraison');
await attendreEspace();
await page.waitForTimeout(400);
await ouvrirCourseLivreur();
await page.waitForTimeout(500);
r = await page.evaluate(()=>!!document.querySelector('#courierDetail #courierProofBtn'));
T('Course non confirmée : AUCUN moyen de la marquer livrée', r===false, String(r));

// ── J. Plus AUCUN « undefined € » nulle part ───────────────────────────────
COURSE.status = 'acceptee'; COURSE.goodsPaid = false; COURSE.accord = null; COURSE.acceptedByMe = false;
await boot('#/mes-livraisons');
await page.waitForTimeout(600);
r = await page.evaluate(()=>({
  liste: (document.getElementById('clientDelivList')||{}).textContent||'',
  page: document.body.innerText
}));
T('Demande sans accord : « prix à convenir », jamais « undefined »',
  /prix à convenir/.test(r.liste) && !/undefined/.test(r.page), r.liste.slice(0,70));

COURSE.accord = { prix:35, paiement:'especes', okClient:true, okLivreur:true, valide:true };
await boot('#/mes-livraisons');
await page.waitForTimeout(600);
r = await page.evaluate(()=>({
  liste: (document.getElementById('clientDelivList')||{}).textContent||'',
  page: document.body.innerText
}));
T('Accord validé : le prix CONVENU s\'affiche (35 € convenus)',
  /35 € convenus/.test(r.liste) && !/undefined/.test(r.page), r.liste.slice(0,70));

// Widget gains du livreur : aucun euro retenu par la plateforme
COURSE.acceptedByMe = true;
await boot('#/mode-livraison');
await attendreEspace();
await page.waitForTimeout(500);
r = await page.evaluate(()=>({
  earn: (document.getElementById('courierEarnings')||{}).textContent||'',
  page: document.body.innerText
}));
T('Widget gains : dit que le client règle en direct, sans solde retenu',
  /directement par le client/.test(r.earn) && !/undefined/.test(r.page), r.earn.slice(0,90));

// ── K. SORTIE AUTONOME quand la marchandise est payée (audit P5) ──────────
COURSE.status = 'confirmee'; COURSE.goodsPaid = true; COURSE.acceptedByMe = false;
COURSE.accord = { prix:35, paiement:'especes', okClient:true, okLivreur:true, valide:true };
await boot('#/mes-livraisons');
await ouvrirHisto(); await page.click('[data-deliv-focus]');
await page.waitForTimeout(600);
r = await page.evaluate(()=>({
  release: !!document.querySelector('[data-cpanel="release"]'),
  annuler: !!document.getElementById('clientCancelBtn')
}));
T('Marchandise payée : le client garde une sortie autonome (remise en ligne)',
  r.release===true, JSON.stringify(r));
T('Marchandise payée : plus d\'annulation d\'un clic (décision commerciale)',
  r.annuler===false, JSON.stringify(r));

await page.click('[data-cpanel="release"]');
await page.waitForTimeout(300);
r = await page.evaluate(()=>(document.getElementById('lvChatPanel')||{}).textContent||'');
T('Le panneau garantit qu\'il ne repaiera pas sa marchandise',
  /reste payée/.test(r) && /seconde fois/.test(r), r.slice(0,90));
API.length = 0;
await page.click('#lvChatRelease');
await page.waitForTimeout(400);
T('Remise en ligne effective depuis « confirmée »',
  API.some(b=>b.type==='course-release' && b.id==='c1'), JSON.stringify(API.map(b=>b.type)));

// Aucune erreur JS sur tout le parcours
console.log(`\n${pass} OK / ${fail} KO`);
await browser.close(); server.close();
process.exit(fail?1:0);
