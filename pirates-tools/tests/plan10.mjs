// PLAN 10 — « j'ai annulé ma commande et le bandeau "règle ta marchandise" est
// toujours là ; quand je clique, ça rouvre la commande annulée » (28/07/2026).
// + « la demande doit mettre l'article au panier : on annule la COURSE, pas la
//   commande — le produit reste au panier, il n'y a plus qu'à redemander ».
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
/* Par CATÉGORIE, comme l'app (estQuincaillerie) : la marque « Quincaillerie »
   est morte le 02/08/2026 avec le retrait des 304 fiches maison — la
   quincaillerie vivante vient du traqueur (marque DeWALT/Makita). */
const quinc = prods.filter(p => p.category === 'Quincaillerie').slice(0, 2);
const K1 = quinc[0].id || quinc[0].sku, K2 = quinc[1].id || quinc[1].sku;
// Un produit qui n'est PLUS au catalogue : il doit être ignoré sans casser.
const KMORT = 'produit-supprime-9999';

const ACCORD_OK = { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true };
const baseC = {
  id: 'c1', mine: true, acceptedByMe: false, chatOpen: true, round: 1, status: 'acceptee',
  courierUid: 'liv1', courierName: 'Kevin L.', address: 'Vieux-Habitants', zone: 4, km: 43.4,
  productTitle: '2 articles de quincaillerie', qty: 3, when: 'heure', hour: '09:30',
  date: '2026-08-01', lieu: 'Portail bleu', notes: 'Chien', code: '213286',
  goodsPaid: false, accord: ACCORD_OK, lines: [{ key: K1, qty: 2 }, { key: K2, qty: 1 }]
};
let COURSES = { ok: true, courier: false, dispo: [], mine: [] };
let posted = [];
let REP_CANCEL = { ok: true, status: 'annulee' };

const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
await ctx.route('**/*', r => /googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm|stripe/.test(r.request().url()) ? r.abort() : r.continue());
const page = await ctx.newPage();
await page.route('**/api/contact', route => {
  const b = JSON.parse(route.request().postData() || '{}');
  posted.push(b);
  const rep = b.type === 'course-list' ? COURSES
    : b.type === 'conv-list' ? { ok: true, conversations: [] }
      : b.type === 'courier-status' ? { ok: true, courier: false }
        : b.type === 'course-cancel' ? REP_CANCEL
          : b.type === 'course-request' ? { ok: true, id: 'nouvelle' } : { ok: true };
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rep) });
});
await page.addInitScript(() => {
  const USER = { uid: 'moi', email: 'justforwada@icloud.com', getIdToken: () => Promise.resolve('t') };
  window.PT_COURIERS_FIXTURE = [];
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
});
const panier = () => page.evaluate(() => {
  try {
    const d = JSON.parse(localStorage.getItem('pt_cart') || 'null');
    return (d && d.items) || [];
  } catch (_) { return []; }
});
const setPanier = (items) => page.evaluate((it) => {
  localStorage.setItem('pt_cart', JSON.stringify({ version: '1', items: it }));
}, items);
const boot = async (h) => {
  await page.goto(base + '/index.html?b=' + Math.random().toString(36).slice(2) + h, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
  await page.waitForTimeout(1300);
};
const todo = () => page.evaluate(() => {
  const h = document.getElementById('clientDelivTodo');
  const b = document.getElementById('lvTodoBtn');
  return {
    vide: !h || h.innerHTML.trim() === '',
    txt: h ? h.textContent.replace(/\s+/g, ' ').trim() : '',
    bouton: !!b
  };
});

// ═══ 1. SON BUG EXACT : une course ANNULÉE ne doit rien réclamer ════════════
console.log('\n━━ 1. COURSE ANNULÉE : plus aucun bandeau, plus aucune réouverture ━━');
COURSES = { ok: true, courier: false, dispo: [], mine: [Object.assign({}, baseC, { status: 'annulee' })] };
await boot('#/mes-livraisons');
const A = await todo();
const A2 = await page.evaluate(() => ({
  detFerme: (document.getElementById('clientDelivDetail') || {}).hidden === true,
  signet: !!document.querySelector('#clientDelivEnCours .lv-signet'),
  encoursCache: (document.getElementById('clientDelivEnCours') || {}).hidden === true
}));
T('AUCUN bandeau « Règle ta marchandise » sur une course annulée', A.vide === true, A.txt.slice(0, 90));
T('Donc AUCUN bouton « Régler » à cliquer', A.bouton === false);
T('Aucune fiche n\'est rouverte', A2.detFerme === true, JSON.stringify(A2));
T('Aucun signet « en cours »', A2.signet === false && A2.encoursCache === true, JSON.stringify(A2));

console.log('\n━━ 1bis. Course TERMINÉE : idem ━━');
COURSES = { ok: true, courier: false, dispo: [], mine: [Object.assign({}, baseC, { status: 'terminee', goodsPaid: true })] };
await boot('#/mes-livraisons');
const B = await todo();
T('AUCUN bandeau sur une course terminée', B.vide === true, B.txt.slice(0, 80));

console.log('\n━━ 1ter. NON-RÉGRESSION : les courses vivantes réclament toujours ━━');
COURSES = { ok: true, courier: false, dispo: [], mine: [Object.assign({}, baseC)] };
await boot('#/mes-livraisons');
const C = await todo();
T('Accord validé non réglé → le bandeau « Règle ta marchandise » EST là',
  C.vide === false && /Règle ta marchandise/.test(C.txt), C.txt.slice(0, 70));
COURSES = { ok: true, courier: false, dispo: [], mine: [Object.assign({}, baseC, { status: 'livree' })] };
await boot('#/mes-livraisons');
const D = await todo();
T('Course LIVRÉE → « Confirme la réception » (elle n\'est PAS soldée)',
  D.vide === false && /Confirme la réception/.test(D.txt), D.txt.slice(0, 70));
COURSES = {
  ok: true, courier: false, dispo: [],
  mine: [Object.assign({}, baseC, { accord: { prix: 90, paiement: 'especes', okClient: false, okLivreur: true, valide: false } })]
};
await boot('#/mes-livraisons');
const E = await todo();
T('Prix proposé non accepté → « Un accord t\'attend »',
  E.vide === false && /accord t/.test(E.txt), E.txt.slice(0, 70));

// Le mélange : une annulée + une vivante → c'est la VIVANTE qui doit sortir
COURSES = {
  ok: true, courier: false, dispo: [],
  mine: [
    Object.assign({}, baseC, { id: 'annulee1', status: 'annulee', address: 'Rue Annulée' }),
    Object.assign({}, baseC, { id: 'vivante1', address: 'Rue Vivante' })
  ]
};
await boot('#/mes-livraisons');
const F = await todo();
T('Avec une annulée ET une vivante, c\'est la VIVANTE qui est réclamée',
  /Rue Vivante/.test(F.txt) && !/Rue Annulée/.test(F.txt), F.txt.slice(0, 90));

// ═══ 2. LE PANIER REVIENT À L'ANNULATION ═══════════════════════════════════
console.log('\n━━ 2. ANNULER LA COURSE REND LES ARTICLES AU PANIER ━━');
COURSES = { ok: true, courier: false, dispo: [], mine: [Object.assign({}, baseC)] };
await boot('#/mes-livraisons');
await setPanier([]);                       // panier vidé (navigation privée refermée)
await page.evaluate(() => { const s = document.querySelector('#clientDelivEnCours .lv-signet'); if (s) s.click(); });
await page.waitForTimeout(600);
const G = await page.evaluate(() => {
  const b = document.getElementById('clientCancelBtn');
  const st = document.getElementById('clientCancelSt');
  return { bouton: !!b, note: st ? st.textContent.replace(/\s+/g, ' ') : '' };
});
T('Le bouton d\'annulation est là', G.bouton === true);
T('Il ANNONCE que les articles reviendront au panier', /panier/.test(G.note), G.note.slice(0, 100));
// Confirmation en deux temps : le premier clic arme seulement.
await page.evaluate(() => document.getElementById('clientCancelBtn').click());
await page.waitForTimeout(250);
T('1er clic = armement, aucune annulation envoyée',
  posted.filter(x => x.type === 'course-cancel').length === 0);
await page.evaluate(() => document.getElementById('clientCancelBtn').click());
await page.waitForTimeout(900);
T('2e clic = annulation envoyée', posted.some(x => x.type === 'course-cancel' && x.id === 'c1'));
const P1 = await panier();
T('Les 2 articles sont de retour dans le panier', P1.length === 2, JSON.stringify(P1.map(x => x.key + '×' + x.qty)));
T('Avec les bonnes quantités', !!(P1.find(x => x.key === K1 && x.qty === 2) && P1.find(x => x.key === K2 && x.qty === 1)),
  JSON.stringify(P1.map(x => x.key + '×' + x.qty)));
T('Et un vrai titre et un vrai prix (relus au catalogue)',
  P1.every(x => x.title && x.title !== x.key && Number(x.price) > 0), JSON.stringify(P1.map(x => ({ t: x.title, p: x.price }))));

console.log('\n━━ 2bis. ON NE CUMULE JAMAIS ━━');
// Le même article DÉJÀ au panier en plus grande quantité : on ne double pas.
COURSES = { ok: true, courier: false, dispo: [], mine: [Object.assign({}, baseC)] };
await boot('#/mes-livraisons');
await setPanier([{ key: K1, title: 'déjà là', price: 10, qty: 5, coffret: false }]);
await page.evaluate(() => { const s = document.querySelector('#clientDelivEnCours .lv-signet'); if (s) s.click(); });
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById('clientCancelBtn').click());
await page.waitForTimeout(200);
await page.evaluate(() => document.getElementById('clientCancelBtn').click());
await page.waitForTimeout(900);
const P2 = await panier();
const l1 = P2.find(x => x.key === K1);
T('L\'article déjà présent n\'est PAS cumulé (5 reste 5, pas 7)', !!l1 && l1.qty === 5, JSON.stringify(P2.map(x => x.key + '×' + x.qty)));
T('L\'article manquant est bien ajouté', !!P2.find(x => x.key === K2 && x.qty === 1), JSON.stringify(P2.map(x => x.key + '×' + x.qty)));
T('Aucune ligne en double', new Set(P2.map(x => x.key)).size === P2.length, JSON.stringify(P2.map(x => x.key)));

console.log('\n━━ 2ter. UN PRODUIT DISPARU DU CATALOGUE NE CASSE RIEN ━━');
COURSES = {
  ok: true, courier: false, dispo: [],
  mine: [Object.assign({}, baseC, { lines: [{ key: K1, qty: 1 }, { key: KMORT, qty: 3 }] })]
};
await boot('#/mes-livraisons');
await setPanier([]);
await page.evaluate(() => { const s = document.querySelector('#clientDelivEnCours .lv-signet'); if (s) s.click(); });
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById('clientCancelBtn').click());
await page.waitForTimeout(200);
await page.evaluate(() => document.getElementById('clientCancelBtn').click());
await page.waitForTimeout(900);
const P3 = await panier();
T('L\'article encore au catalogue est restauré', !!P3.find(x => x.key === K1), JSON.stringify(P3.map(x => x.key)));
T('Celui qui n\'existe plus est IGNORÉ (jamais de ligne fantôme)',
  !P3.find(x => x.key === KMORT), JSON.stringify(P3.map(x => x.key)));

console.log('\n━━ 2quater. UN ÉCHEC D\'ANNULATION NE TOUCHE PAS AU PANIER ━━');
REP_CANCEL = { ok: false, error: 'Trop tard : cette livraison est déjà en cours ou terminée.' };
COURSES = { ok: true, courier: false, dispo: [], mine: [Object.assign({}, baseC)] };
await boot('#/mes-livraisons');
await setPanier([]);
await page.evaluate(() => { const s = document.querySelector('#clientDelivEnCours .lv-signet'); if (s) s.click(); });
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById('clientCancelBtn').click());
await page.waitForTimeout(200);
await page.evaluate(() => document.getElementById('clientCancelBtn').click());
await page.waitForTimeout(900);
const P4 = await panier();
const ST = await page.evaluate(() => (document.getElementById('clientCancelSt') || {}).textContent || '');
T('Annulation refusée → le panier reste VIDE (pas de faux espoir)', P4.length === 0, JSON.stringify(P4));
T('Et le refus est affiché en clair', /Trop tard/.test(ST), ST.slice(0, 70));
REP_CANCEL = { ok: true, status: 'annulee' };

// ═══ 3. LA DEMANDE POSE L'ARTICLE AU PANIER (fiche produit) ════════════════
console.log('\n━━ 3. DEMANDER UNE LIVRAISON MET L\'ARTICLE AU PANIER ━━');
posted = [];
await boot('#/livraison');
await setPanier([{ key: K1, title: 'Vis', price: 5, qty: 2, coffret: false }]);
await page.evaluate(() => { location.reload(); });
await page.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(1300);
await page.evaluate(() => {
  const m = document.getElementById('livDelivMap');
  if (m) m._ptGeo = { lat: 16.0578, lng: -61.7639, label: 'Vieux-Habitants', postal: '97119', city: 'V', street: 'R' };
  const b = document.getElementById('livraisonOrder'); if (b) b._ptScene = 'data:image/jpeg;base64,AAAA';
  const f = document.getElementById('livDelivFilmOk'); if (f) f.checked = true;
});
await page.evaluate(() => { const b = document.getElementById('livDelivOrder'); if (b) b.click(); });
await page.waitForTimeout(900);
const P5 = await panier();
T('La demande part', posted.some(x => x.type === 'course-request'), JSON.stringify(posted.map(x => x.type)));
T('Le panier N\'EST PAS vidé par la demande', P5.length >= 1, JSON.stringify(P5.map(x => x.key + '×' + x.qty)));
T('La quantité n\'a pas été gonflée au passage', (P5.find(x => x.key === K1) || {}).qty === 2,
  JSON.stringify(P5.map(x => x.key + '×' + x.qty)));

console.log('\n━━ 3bis. LE CAS DÉCISIF : demande depuis une FICHE PRODUIT, panier VIDE ━━');
// C'est exactement ce que vise « il faut que ça mette obligatoirement l'article
// dans son panier » : depuis une fiche, l'article n'y est pas — sans ce
// correctif, annuler la course laissait le client les mains vides.
posted = [];
await boot('#/produit/' + K1);
await setPanier([]);
await page.evaluate(() => { location.reload(); });
await page.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(1500);
const avantPdp = await panier();
const dispo = await page.evaluate(() => {
  const sec = document.getElementById('pdpDelivery');
  return { widget: !!sec && !sec.hidden, bouton: !!document.getElementById('pdpDelivOrder') };
});
T('Départ : le panier est bien VIDE', avantPdp.length === 0, JSON.stringify(avantPdp));
T('La fiche quincaillerie propose la livraison', dispo.widget === true && dispo.bouton === true, JSON.stringify(dispo));
await page.evaluate(() => {
  const m = document.getElementById('pdpDeliveryMap');
  if (m) m._ptGeo = { lat: 16.0578, lng: -61.7639, label: 'Vieux-Habitants', postal: '97119', city: 'V', street: 'R' };
  const b = document.getElementById('pdpDelivery'); if (b) b._ptScene = 'data:image/jpeg;base64,AAAA';
  const f = document.getElementById('pdpDelivFilmOk'); if (f) f.checked = true;
});
await page.evaluate(() => { const b = document.getElementById('pdpDelivOrder'); if (b) b.click(); });
await page.waitForTimeout(1000);
const P6 = await panier();
const R6 = posted.filter(x => x.type === 'course-request')[0] || null;
T('La demande part depuis la fiche', !!R6, JSON.stringify(posted.map(x => x.type)));
T('L\'article est MIS AU PANIER par la demande', P6.length === 1 && P6[0].key === K1,
  JSON.stringify(P6.map(x => x.key + '×' + x.qty)));
T('Il porte son vrai titre et son vrai prix',
  !!P6[0] && !!P6[0].title && P6[0].title !== P6[0].key && Number(P6[0].price) > 0,
  JSON.stringify(P6.map(x => ({ t: x.title, p: x.price }))));
T('Et la demande transporte bien cette ligne', !!R6 && (R6.lines || []).some(l => l.key === K1),
  R6 ? JSON.stringify(R6.lines) : '');

await browser.close(); server.close();
console.log('\n' + (fail ? '❌' : '✅') + ` ${pass}/${pass + fail} assertions`);
process.exit(fail ? 1 : 0);
