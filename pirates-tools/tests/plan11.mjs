// PLAN 11 — fluidité et vérité de l'affichage (retour user 28/07/2026).
//  P1 le bandeau vert vit sur TOUTES les pages et se rafraîchit tout seul
//  P3 le livreur peut MODIFIER son prix tant que le client n'a pas accepté
//  P4 l'historique montre les VRAIS statuts (annulée ≠ terminée)
//  P5 un échec réseau ne fait plus DISPARAÎTRE l'annuaire de l'accueil
//  P6 dans la bulle, on distingue qui écrit (compte jouant les deux rôles)
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const fp = normalize(join(ROOT, p)); if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const st = await stat(fp).catch(() => null); if (!st || !st.isFile()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(await readFile(fp));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };

const cat = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));
const prods = Array.isArray(cat) ? cat : (cat.products || []);
/* ⛔ La quincaillerie se reconnaît à sa CATÉGORIE (app.js, estQuincaillerie),
   plus à une marque : depuis le regroupement du catalogue, « Quincaillerie »
   n'est plus une marque — le filtre par marque rendait 0 fiche et le harnais
   mourait avant sa première assertion (corrigé le 08/08/2026). */
const quinc = prods.filter(p => String(p.category || '') === 'Quincaillerie').slice(0, 2);
if (quinc.length < 2) { console.log('⏭ IGNORÉ — moins de 2 fiches Quincaillerie au catalogue : rien à vérifier ici.'); process.exit(2); }
const K1 = quinc[0].id || quinc[0].sku, K2 = quinc[1].id || quinc[1].sku;

const PROFIL = {
  uid: 'moi', displayName: 'Nova', commune: 'Sainte-Anne', vehicle: 'scooter',
  tarifs: { 1: 30, 2: 55, 3: 80, 4: 100 }, hDebut: '00:00', hFin: '23:30',
  available: true, published: true, paiement: 'virement',
  coursesDone: 3, ratingCount: 2, ratingSum: 9
};
const LIVREUR_PUB = Object.assign({}, PROFIL, { uid: 'liv1', displayName: 'Kevin L.' });
const baseC = {
  id: 'c1', mine: true, acceptedByMe: true, chatOpen: true, round: 1, status: 'acceptee',
  courierUid: 'liv1', courierName: 'Kevin L.', address: 'Vieux-Habitants', zone: 4, km: 43.4,
  productTitle: '2 articles de quincaillerie', qty: 3, when: 'heure', hour: '09:30',
  date: '2026-08-01', lieu: 'Portail bleu, sous l\'auvent', notes: 'Chien dans la cour',
  code: '213286', lines: [{ key: K1, qty: 2 }, { key: K2, qty: 1 }]
};
let COURSES = { ok: true, courier: true, dispo: [], mine: [] };
let posted = [];

const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
await ctx.route('**/*', r => /googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm|stripe/.test(r.request().url()) ? r.abort() : r.continue());
const page = await ctx.newPage();
await page.route('**/api/contact', route => {
  const b = JSON.parse(route.request().postData() || '{}');
  posted.push(b);
  const rep = b.type === 'course-list' ? COURSES
    : b.type === 'conv-list' ? { ok: true, conversations: [] }
      : b.type === 'courier-status' ? { ok: true, courier: true }
        : b.type === 'courier-profile' ? { ok: true, courier: true, profile: PROFIL, repere: { 1: 22, 2: 48, 3: 74, 4: 100 } }
          : b.type === 'course-request' ? { ok: true, id: 'nouvelle' }
            : b.type === 'course-accept' ? { ok: true } : { ok: true };
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rep) });
});
// On CAPTURE les minuteries au lieu d'attendre 45 s réelles. Le produit n'est
// pas modifié : c'est le harnais qui instrumente setInterval.
await page.addInitScript(() => {
  window.__timers = [];
  const vrai = window.setInterval;
  window.setInterval = function (fn, ms) { window.__timers.push({ fn: fn, ms: ms }); return vrai.apply(window, arguments); };
});
await page.addInitScript(([k1, k2, liv]) => {
  const USER = { uid: 'moi', email: 'justforwada@icloud.com', getIdToken: () => Promise.resolve('t') };
  try {
    localStorage.setItem('pt_cart', JSON.stringify({ version: '1', items: [{ key: k1, qty: 2 }, { key: k2, qty: 1 }] }));
  } catch (_) { }
  window.PT_COURIERS_FIXTURE = [liv];
  window.PT_FIREBASE = {
    configured: true, auth: {}, db: {},
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(USER), 0); return () => { }; },
    doc: () => ({}), getDoc: () => Promise.resolve({ exists: () => false }), setDoc: () => Promise.resolve(),
    updateDoc: () => Promise.resolve(), collection: function () { const a = [].slice.call(arguments); return { path: a.slice(1).join('/') }; },
    addDoc: () => Promise.resolve({ id: 'x' }), getDocs: () => Promise.resolve({ forEach: () => { } }),
    query: (c) => c, orderBy: () => ({}), where: () => ({}), limit: () => ({}),
    onSnapshot: (q, cb) => { setTimeout(() => cb({ forEach: () => { } }), 0); return () => { }; },
    serverTimestamp: () => new Date()
  };
}, [K1, K2, LIVREUR_PUB]);
const boot = async (h) => {
  await page.goto(base + '/index.html?b=' + Math.random().toString(36).slice(2) + h, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
  await page.waitForTimeout(1300);
};
const ouvrirPanneau = async (nom) => {
  await page.evaluate((n) => {
    const b = document.querySelector('#clientDelivDetail [data-cpanel="' + n + '"], #courierDetail [data-cpanel="' + n + '"]');
    if (b) b.click();
  }, nom);
  await page.waitForTimeout(450);
};
const ouvrirSignet = async (sel) => {
  await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); }, sel);
  await page.waitForTimeout(650);
};


const dispoC = Object.assign({}, baseC, {
  id: 'd1', status: 'en_attente', mine: false, acceptedByMe: false,
  courierUid: null, courierName: '', chatOpen: false
});
const ouvrirPanneau2 = async (nom) => {
  await page.evaluate((n) => {
    const b = document.querySelector('#courierDetail [data-cpanel="' + n + '"], #clientDelivDetail [data-cpanel="' + n + '"]');
    if (b) b.click();
  }, nom);
  await page.waitForTimeout(450);
};

// ═══ P1. LE BANDEAU SUIT LE LIVREUR PARTOUT, ET SE MET À JOUR SEUL ═════════
console.log('\n━━ P1. BANDEAU SUR TOUTES LES PAGES + RAFRAÎCHISSEMENT ━━');
COURSES = { ok: true, courier: true, dispo: [dispoC], mine: [] };
for (const [h, nom] of [['#/', 'Accueil'], ['#/catalogue', 'Catalogue'], ['#/compte', 'Mon compte'], ['#/mode-livraison', 'Mode livraison']]) {
  await boot(h);
  const v = await page.evaluate(() => {
    const b = document.getElementById('courseAlert');
    return { vu: !!b && !b.hidden, clignote: !!b && b.classList.contains('course-alert--blink') };
  });
  T('Le bandeau est visible sur « ' + nom + ' »', v.vu === true, JSON.stringify(v));
}

// Rafraîchissement AUTOMATIQUE : une course déposée APRÈS l'ouverture doit
// finir par apparaître, sans que le livreur ne fasse quoi que ce soit.
COURSES = { ok: true, courier: true, dispo: [], mine: [] };
await boot('#/');
const vide = await page.evaluate(() => (document.getElementById('courseAlert') || {}).hidden);
T('Au départ, aucune course → pas de bandeau', vide === true);
COURSES = { ok: true, courier: true, dispo: [dispoC], mine: [] };
// On déclenche le sondage sans attendre 45 s réelles.
const tmr = await page.evaluate(() => (window.__timers || []).map(t => t.ms));
T('Une minuterie de sondage à 45 s est bien armée', tmr.indexOf(45000) !== -1, JSON.stringify(tmr));
T('Une SEULE minuterie de sondage (aucun empilement)',
  tmr.filter(m => m === 45000).length === 1, JSON.stringify(tmr));
await page.evaluate(() => { (window.__timers || []).filter(t => t.ms === 45000).forEach(t => t.fn()); });
await page.waitForTimeout(900);
const apres = await page.evaluate(() => {
  const b = document.getElementById('courseAlert');
  return { vu: !!b && !b.hidden, txt: (document.getElementById('courseAlertTxt') || {}).textContent || '' };
});
T('Une course arrivée APRÈS coup finit par s\'afficher, sans rechargement',
  apres.vu === true, JSON.stringify(apres).slice(0, 90));

// ⚠️ Le sondage ne doit PAS refermer les détails pendant qu'on les lit.
await page.evaluate(() => { const g = document.getElementById('courseAlertGo'); if (g) g.click(); });
await page.waitForTimeout(400);
const ouvert1 = await page.evaluate(() => !document.getElementById('courseAlertDet').hidden);
await page.evaluate(() => { (window.__timers || []).filter(t => t.ms === 45000).forEach(t => t.fn()); });
await page.waitForTimeout(900);
const ouvert2 = await page.evaluate(() => !document.getElementById('courseAlertDet').hidden);
T('Les détails sont dépliés', ouvert1 === true);
T('Le rafraîchissement NE les referme PAS pendant la lecture', ouvert2 === true);

// ═══ P4. LES VRAIS STATUTS DANS L'HISTORIQUE ═══════════════════════════════
console.log('\n━━ P4. HISTORIQUE : LES VRAIS STATUTS ━━');
COURSES = {
  ok: true, courier: true, dispo: [],
  mine: [
    Object.assign({}, baseC, { id: 'h1', status: 'terminee', acceptedByMe: true, courierUid: 'moi' }),
    Object.assign({}, baseC, { id: 'h2', status: 'annulee', acceptedByMe: true, courierUid: 'moi' }),
    Object.assign({}, baseC, { id: 'h3', status: 'annulee', acceptedByMe: true, courierUid: 'moi' })
  ]
};
await boot('#/mode-livraison');
const H = await page.evaluate(() => {
  const h = document.querySelector('#courierWork details.lv-histo');
  if (h) h.open = true;
  const st = Array.from(document.querySelectorAll('#courierMine .lv-course__status'));
  return {
    n: st.length,
    txt: st.map(e => e.textContent.trim()),
    couleurs: st.map(e => getComputedStyle(e).color)
  };
});
T('Les 3 courses sont dans l\'historique', H.n === 3, JSON.stringify(H.txt));
T('On lit « Terminée » UNE fois', H.txt.filter(t => /Terminée/.test(t)).length === 1, JSON.stringify(H.txt));
T('On lit « Annulée » DEUX fois', H.txt.filter(t => /Annulée/.test(t)).length === 2, JSON.stringify(H.txt));
T('PLUS AUCUN « Par toi » qui masque le statut', !H.txt.some(t => /Par toi/.test(t)), JSON.stringify(H.txt));
T('Les couleurs distinguent terminée et annulée',
  new Set(H.couleurs).size === 2, JSON.stringify(H.couleurs));

// ═══ P3. LE LIVREUR PEUT MODIFIER SON PRIX ═════════════════════════════════
console.log('\n━━ P3. MODIFIER SON PRIX TANT QUE LE CLIENT N\'A PAS ACCEPTÉ ━━');
const PROPOSE = { prix: 100, paiement: 'virement', okClient: false, okLivreur: true, valide: false };
COURSES = {
  ok: true, courier: true, dispo: [],
  mine: [Object.assign({}, baseC, { accord: PROPOSE, acceptedByMe: true, courierUid: 'moi' })]
};
await boot('#/mode-livraison');
await ouvrirSignet('#courierEnCours .lv-signet');
await ouvrirPanneau2('accord');
const M = await page.evaluate(() => {
  const p = document.getElementById('lvChatPanel');
  const px = p.querySelector('#acPrix');
  return {
    champ: !!px, valeur: px ? px.value : null,
    maj: !!p.querySelector('#acPropose'), retirer: !!p.querySelector('#acReject'),
    txt: p.textContent.replace(/\s+/g, ' ')
  };
});
T('Le livreur retrouve un champ de prix', M.champ === true, JSON.stringify(M).slice(0, 110));
T('Pré-rempli avec le prix DÉJÀ proposé (100 €)', M.valeur === '100', String(M.valeur));
T('Un bouton « Mettre à jour mon prix »', M.maj === true);
T('Et il peut toujours retirer sa proposition', M.retirer === true);
T('Le panneau explique la fenêtre de négociation', /changer ton prix|trop cher/i.test(M.txt), M.txt.slice(0, 100));
posted = [];
await page.evaluate(() => {
  const px = document.querySelector('#lvChatPanel #acPrix'); if (px) px.value = '80';
  const b = document.querySelector('#lvChatPanel #acPropose'); if (b) b.click();
});
await page.waitForTimeout(700);
const MP = posted.filter(x => x.type === 'course-accord-propose')[0] || null;
T('Le nouveau prix part au serveur', !!MP && MP.accord.prix === '80', MP ? JSON.stringify(MP.accord) : 'aucun');
T('Toujours QUE le prix dans la requête', !!MP && Object.keys(MP.accord).length === 1, MP ? JSON.stringify(MP.accord) : '');

// Accord VALIDÉ → plus aucune modification possible
COURSES = {
  ok: true, courier: true, dispo: [],
  mine: [Object.assign({}, baseC, { accord: { prix: 100, paiement: 'virement', okClient: true, okLivreur: true, valide: true }, acceptedByMe: true, courierUid: 'moi' })]
};
await boot('#/mode-livraison');
await ouvrirSignet('#courierEnCours .lv-signet');
await ouvrirPanneau2('accord');
const MV = await page.evaluate(() => {
  const p = document.getElementById('lvChatPanel');
  return { champ: !!p.querySelector('#acPrix'), txt: p.textContent.replace(/\s+/g, ' ') };
});
T('Accord VALIDÉ → plus de champ de prix (rien ne se renégocie)', MV.champ === false, MV.txt.slice(0, 70));

// ═══ P5. UN ÉCHEC RÉSEAU NE VIDE PLUS L'ANNUAIRE ═══════════════════════════
console.log('\n━━ P5. ÉCHEC ≠ VIDE (annuaire de l\'accueil) ━━');
// On passe par le VRAI chemin Firebase (pas le fixture) : 1er appel OK,
// suivants en échec — exactement un hoquet réseau en cours de session.
const page2 = await ctx.newPage();
await page2.route('**/api/contact', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ ok: true, courier: false, dispo: [], mine: [], conversations: [] })
}));
await page2.addInitScript(([liv]) => {
  const USER = { uid: 'moi', email: 'justforwada@icloud.com', getIdToken: () => Promise.resolve('t') };
  window.__nGetDocs = 0;
  window.PT_FIREBASE = {
    configured: true, auth: {}, db: {},
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(USER), 0); return () => { }; },
    doc: () => ({}), getDoc: () => Promise.resolve({ exists: () => false }), setDoc: () => Promise.resolve(),
    updateDoc: () => Promise.resolve(),
    collection: function () { const a = [].slice.call(arguments); return { path: a.slice(1).join('/') }; },
    addDoc: () => Promise.resolve({ id: 'x' }),
    getDocs: function (c) {
      window.__nGetDocs++;
      // 1er passage : succès. Ensuite : panne réseau.
      if (window.__nGetDocs > 2) return Promise.reject(new Error('réseau'));
      const src = (c && /couriers_public/.test(c.path || '')) ? [liv] : [];
      return Promise.resolve({ forEach: (f) => src.forEach(d => f({ id: d.uid, data: () => d })) });
    },
    query: (c) => c, orderBy: () => ({}), where: () => ({}), limit: () => ({}),
    onSnapshot: (q, cb) => { setTimeout(() => cb({ forEach: () => { } }), 0); return () => { }; },
    serverTimestamp: () => new Date()
  };
}, [LIVREUR_PUB]);
const boot2 = async (h) => {
  await page2.goto(base + '/index.html?p=' + Math.random().toString(36).slice(2) + h, { waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
  await page2.waitForTimeout(1400);
};
await boot2('#/');
const S1 = await page2.evaluate(() => {
  const s = document.getElementById('couriersStripSection');
  return { vue: !!s && !s.hidden, n: document.querySelectorAll('#couriersStripTrack .courier-card').length };
});
T('1er chargement : l\'annuaire des livreurs s\'affiche', S1.vue === true && S1.n >= 1, JSON.stringify(S1));
// On force un rechargement de l'annuaire alors que le réseau est tombé.
const S2 = await page2.evaluate(async () => {
  const av = document.querySelectorAll('#couriersStripTrack .courier-card').length;
  location.hash = '#/livraison';
  await new Promise(r => setTimeout(r, 900));
  location.hash = '#/';
  await new Promise(r => setTimeout(r, 1200));
  const s = document.getElementById('couriersStripSection');
  return {
    avant: av, vue: !!s && !s.hidden,
    n: document.querySelectorAll('#couriersStripTrack .courier-card').length,
    appels: window.__nGetDocs
  };
});
T('Le réseau est bien tombé entre-temps', S2.appels > 2, S2.appels + ' appel(s) getDocs');
T('La section N\'A PAS disparu malgré l\'échec', S2.vue === true, JSON.stringify(S2));
T('Les livreurs sont toujours affichés (dernier succès resservi)', S2.n >= 1, JSON.stringify(S2));

await browser.close(); server.close();
console.log('\n' + (fail ? '❌' : '✅') + ` ${pass}/${pass + fail} assertions`);
process.exit(fail ? 1 : 0);
