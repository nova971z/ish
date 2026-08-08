// PLAN 9 — cohérence de la chaîne de livraison (retour user 28/07/2026).
//  1. duo : signet carré à gauche + carte du livreur à droite, MÊME hauteur
//  2. le client ne propose JAMAIS de prix (ni interface, ni requête)
//  3. le mode de règlement vient du livreur, pas d'un choix du client
//  4. date/heure/dépôt/précisions posés À LA COMMANDE, jamais redemandés
//  5. bandeau vert : clignote, « voir les détails », puis ✅ / ✕
import { playwright, RACINE, sortie } from './_socle.mjs';
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

// ═══ 1. LE DUO : signet à gauche, livreur à droite, MÊME hauteur ═══════════
console.log('\n━━ 1. DUO SIGNET + CARTE DU LIVREUR ━━');
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC)] };
await boot('#/mes-livraisons');
const D = await page.evaluate(() => {
  const duo = document.querySelector('#clientDelivEnCours .lv-duo');
  if (!duo) return { absent: true };
  const sig = duo.querySelector('.lv-signet');
  const co = duo.querySelector('.lv-duo__co');
  const carte = co ? co.querySelector('.courier-card') : null;
  const rs = sig.getBoundingClientRect(), rc = co.getBoundingClientRect();
  return {
    signet: !!sig, carte: !!carte,
    nom: carte ? (carte.querySelector('.courier-card__name') || {}).textContent : null,
    hSig: Math.round(rs.height), hCo: Math.round(rc.height),
    // « à gauche » / « à ses côtés » : même ligne, signet plus à gauche.
    gauche: Math.round(rs.left) < Math.round(rc.left),
    memeLigne: Math.abs(Math.round(rs.top) - Math.round(rc.top)) <= 2,
    colonnes: getComputedStyle(duo).gridTemplateColumns.split(' ').length,
    // Ce qui compte n'est pas le nombre de pistes déclarées mais la LARGEUR
    // réellement occupée : deux blocs de même largeur, remplissant la ligne.
    wSig: Math.round(rs.width), wCo: Math.round(rc.width),
    wDuo: Math.round(duo.getBoundingClientRect().width),
    cta: carte ? !!carte.querySelector('.courier-card__cta') : null,
    lien: carte ? carte.getAttribute('href') : null
  };
});
T('Le duo existe', !D.absent, JSON.stringify(D));
T('Le signet est présent', D.signet === true);
T('La carte du livreur qui a accepté est à côté', D.carte === true && /Kevin/.test(D.nom || ''), String(D.nom));
T('Le signet est bien À GAUCHE', D.gauche === true, 'gauche=' + D.gauche);
T('Ils sont sur la MÊME ligne', D.memeLigne === true, 'même ligne=' + D.memeLigne);
T('Ils ont EXACTEMENT la même hauteur', D.hSig === D.hCo, D.hSig + 'px vs ' + D.hCo + 'px');
T('Deux colonnes déclarées', D.colonnes === 2, D.colonnes + ' piste(s)');
T('Les deux blocs ont la même largeur', D.wSig === D.wCo, D.wSig + 'px vs ' + D.wCo + 'px');
T('Ils remplissent toute la ligne (aucun vide à droite)',
  Math.abs((D.wSig + D.wCo) - D.wDuo) <= 14, (D.wSig + D.wCo) + 'px sur ' + D.wDuo + 'px');
T('Aucun bouton « Discuter » grisé sur cette carte', D.cta === false);
T('La carte mène au profil du livreur', /livreur-profil/.test(D.lien || ''), String(D.lien));

// Sans livreur : la colonne de droite explique l'attente (pas de saut de mise en page)
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, { status: 'en_attente', courierUid: null, courierName: '', chatOpen: false })] };
await boot('#/mes-livraisons');
const W = await page.evaluate(() => {
  const duo = document.querySelector('#clientDelivEnCours .lv-duo');
  const sig = duo && duo.querySelector('.lv-signet');
  const w = duo && duo.querySelector('.lv-duo__wait');
  return {
    attente: !!w, txt: w ? w.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : null,
    hSig: sig ? Math.round(sig.getBoundingClientRect().height) : 0,
    hCo: w ? Math.round(w.getBoundingClientRect().height) : 0
  };
});
T('Sans livreur, la colonne de droite annonce l\'attente', W.attente === true, String(W.txt));
T('Les hauteurs restent identiques', W.hSig === W.hCo, W.hSig + 'px vs ' + W.hCo + 'px');

// Sur iPhone la tuile ne fait que ~155 px : RIEN ne doit en déborder (la
// pastille en `nowrap` dépassait de 31 px, mesurés).
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC)] };
await page.setViewportSize({ width: 430, height: 1500 });
await boot('#/mes-livraisons');
const O = await page.evaluate(() => {
  const sig = document.querySelector('#clientDelivEnCours .lv-signet');
  const pill = sig && sig.querySelector('.lv-pill');
  if (!sig || !pill) return { absent: true };
  const rs = sig.getBoundingClientRect(), rp = pill.getBoundingClientRect();
  const duo = sig.closest('.lv-duo');
  return {
    debord: Math.round(rp.right - rs.right),
    scroll: sig.scrollWidth - sig.clientWidth,
    hSig: Math.round(rs.height),
    hCo: Math.round(duo.querySelector('.lv-duo__co').getBoundingClientRect().height),
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
await page.setViewportSize({ width: 900, height: 1400 });
T('iPhone : la pastille ne déborde pas de la tuile', O.debord <= 0, 'débord=' + O.debord + 'px');
T('iPhone : la tuile ne défile pas horizontalement', O.scroll <= 0, 'scroll=' + O.scroll + 'px');
T('iPhone : hauteurs toujours identiques', O.hSig === O.hCo, O.hSig + 'px vs ' + O.hCo + 'px');
T('iPhone : la page ne défile pas latéralement', O.pageScroll <= 0, 'page=' + O.pageScroll + 'px');

// ═══ 2 & 3. LE CLIENT NE PROPOSE NI PRIX NI MODE DE RÈGLEMENT ══════════════
console.log('\n━━ 2/3. LE CLIENT NE FIXE NI PRIX NI RÈGLEMENT ━━');
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, { accord: null })] };
await boot('#/mes-livraisons');
await ouvrirSignet('#clientDelivEnCours .lv-signet');
/* ⛔ CES CHAMPS DOIVENT ÊTRE ABSENTS — ce n'est pas un oubli, c'est la règle.
   L'accord ENTÉRINE, il ne renégocie pas : date, créneau, dépôt et précisions
   viennent de la course (le client les a posés une fois), le règlement vient
   du profil du livreur. Les redemander rouvrirait la porte à une plateforme
   qui « organise » la prestation — art. L7342-1, présomption de salariat.
   Les assertions ci-dessous vérifient donc leur ABSENCE.
   ancres-absentes-voulues: acPaiement, acDate, acHour, acLieu, acNotes */
await ouvrirPanneau('accord');
const C = await page.evaluate(() => {
  const p = document.getElementById('lvChatPanel');
  return {
    prix: !!p.querySelector('#acPrix'),
    paiement: !!p.querySelector('input[name="acPaiement"], #acPaiement'),
    date: !!p.querySelector('#acDate'), heure: !!p.querySelector('#acHour'),
    lieu: !!p.querySelector('#acLieu'), notes: !!p.querySelector('#acNotes'),
    propose: !!p.querySelector('#acPropose'),
    saisies: p.querySelectorAll('input:not([type=hidden]), select, textarea').length,
    txt: p.textContent.replace(/\s+/g, ' ')
  };
});
T('AUCUN champ de prix côté client', C.prix === false, JSON.stringify(C));
T('AUCUN choix de mode de règlement côté client', C.paiement === false);
T('AUCUN champ date / heure redemandé', C.date === false && C.heure === false);
T('AUCUN champ dépôt / précisions redemandé', C.lieu === false && C.notes === false);
T('AUCUN bouton « proposer » côté client', C.propose === false);
T('Zéro champ de saisie dans tout le panneau', C.saisies === 0, C.saisies + ' champ(s)');
T('Le panneau explique que le prix vient du livreur', /au livreur.*annoncer son prix|C'est au livreur/i.test(C.txt), C.txt.slice(0, 80));
T('Il rappelle qu\'on négocie dans la discussion', /discussion/i.test(C.txt));

// Les conditions du client sont RAPPELÉES (lecture seule), pas redemandées
T('Le point de dépôt du client est rappelé', /Portail bleu/.test(C.txt), C.txt.slice(0, 60));
T('Ses précisions sont rappelées', /Chien dans la cour/.test(C.txt));
T('Sa date et son créneau sont rappelés', /2026-08-01/.test(C.txt) && /09:30/.test(C.txt));

// ═══ 4. LE LIVREUR PROPOSE SON PRIX, PRÉ-REMPLI, RÈGLEMENT DEPUIS SON PROFIL
console.log('\n━━ 4. LE LIVREUR PROPOSE SON PRIX ━━');
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, { accord: null, courierUid: 'moi' })] };
await boot('#/mode-livraison');
await ouvrirSignet('#courierEnCours .lv-signet');
await ouvrirPanneau('accord');
const L = await page.evaluate(() => {
  const p = document.getElementById('lvChatPanel');
  const px = p.querySelector('#acPrix');
  return {
    prix: !!px, valeur: px ? px.value : null,
    paiement: !!p.querySelector('input[name="acPaiement"], #acPaiement'),
    date: !!p.querySelector('#acDate'), lieu: !!p.querySelector('#acLieu'),
    propose: !!p.querySelector('#acPropose'),
    txt: p.textContent.replace(/\s+/g, ' ')
  };
});
T('Le livreur a UN champ : son prix', L.prix === true && L.propose === true, JSON.stringify(L).slice(0, 100));
T('Il est pré-rempli avec SON tarif de zone 4 (100 €)', L.valeur === '100', String(L.valeur));
T('Il ne ressaisit NI date NI dépôt (déjà posés par le client)', L.date === false && L.lieu === false);
T('Il ne choisit PAS son règlement ici — il vient de ses paramètres', L.paiement === false);
T('Son mode de règlement (virement) lui est rappelé', /virement/i.test(L.txt), L.txt.slice(0, 120));
T('On lui dit où le changer', /Paramètres/.test(L.txt));
T('Les conditions du client lui sont montrées', /Portail bleu/.test(L.txt) && /Chien dans la cour/.test(L.txt));

// La requête envoyée ne transporte QUE le prix
posted = [];
await page.evaluate(() => {
  const px = document.querySelector('#lvChatPanel #acPrix'); if (px) px.value = '75';
  const b = document.querySelector('#lvChatPanel #acPropose'); if (b) b.click();
});
await page.waitForTimeout(700);
const P = posted.filter(x => x.type === 'course-accord-propose')[0] || null;
T('La proposition part', !!P, P ? JSON.stringify(P.accord) : JSON.stringify(posted.map(x => x.type)));
T('Elle ne transporte QUE le prix',
  !!P && Object.keys(P.accord).length === 1 && P.accord.prix === '75', P ? JSON.stringify(P.accord) : '');
T('Elle déclare le rôle « livreur »', !!P && P.role === 'livreur', P ? String(P.role) : '');

// ═══ 5. LE BANDEAU VERT : clignote, détaille, puis ✅ / ✕ ═══════════════════
console.log('\n━━ 5. BANDEAU VERT DU LIVREUR ━━');
const dispoC = Object.assign({}, baseC, {
  id: 'd1', status: 'en_attente', mine: false, acceptedByMe: false,
  courierUid: null, courierName: '', chatOpen: false
});
COURSES = { ok: true, courier: true, dispo: [dispoC], mine: [] };
await boot('#/mode-livraison');
const B1 = await page.evaluate(() => {
  const b = document.getElementById('courseAlert');
  const det = document.getElementById('courseAlertDet');
  const go = document.getElementById('courseAlertGo');
  const cta = document.getElementById('courseAlertSee');
  return {
    visible: !!b && !b.hidden,
    clignote: !!b && b.classList.contains('course-alert--blink'),
    anim: go ? getComputedStyle(go).animationName : null,
    ctaTxt: cta ? cta.textContent.trim() : null,
    detFerme: det ? det.hidden : null,
    expanded: go ? go.getAttribute('aria-expanded') : null
  };
});
T('Le bandeau est visible', B1.visible === true, JSON.stringify(B1));
T('Il CLIGNOTE (classe + animation réelle)',
  B1.clignote === true && /course-alert-blink/.test(B1.anim || ''), B1.clignote + ' / ' + B1.anim);
T('Le bouton dit « Voir les détails »', /Voir les détails/.test(B1.ctaTxt || ''), String(B1.ctaTxt));
T('Les détails sont repliés au départ', B1.detFerme === true);
T('aria-expanded = false', B1.expanded === 'false');

await page.evaluate(() => { const g = document.getElementById('courseAlertGo'); if (g) g.click(); });
await page.waitForTimeout(400);
const B2 = await page.evaluate(() => {
  const b = document.getElementById('courseAlert');
  const det = document.getElementById('courseAlertDet');
  const go = document.getElementById('courseAlertGo');
  return {
    ouvert: det ? !det.hidden : null,
    clignoteEncore: !!b && b.classList.contains('course-alert--blink'),
    expanded: go ? go.getAttribute('aria-expanded') : null,
    txt: det ? det.textContent.replace(/\s+/g, ' ') : '',
    ok: !!document.getElementById('courseAlertOk'),
    no: !!document.getElementById('courseAlertNo'),
    okVisible: (() => { const e = document.getElementById('courseAlertOk'); return !!e && e.getBoundingClientRect().height > 0; })()
  };
});
T('Le clic AGRANDIT le bandeau', B2.ouvert === true, JSON.stringify(B2).slice(0, 90));
T('Il ARRÊTE de clignoter pendant la lecture', B2.clignoteEncore === false);
T('aria-expanded passe à true', B2.expanded === 'true');
T('Les détails du CLIENT sont affichés', /Vieux-Habitants/.test(B2.txt) && /2026-08-01/.test(B2.txt), B2.txt.slice(0, 90));
T('Le point de dépôt du client y figure', /Portail bleu/.test(B2.txt));
T('Ses précisions y figurent', /Chien dans la cour/.test(B2.txt));
T('Son tarif de zone lui est rappelé', /100 €/.test(B2.txt));
T('Le bouton « J\'accepte » est là et visible', B2.ok === true && B2.okVisible === true);
T('Le bouton « Pas pour moi » est là', B2.no === true);
// Sur iPhone, une valeur longue ne doit JAMAIS s'enrouler au milieu de son
// intitulé : l'intitulé reste d'un bloc, la valeur passe à la ligne entière.
const B2b = await (async () => {
  await page.setViewportSize({ width: 390, height: 1400 });
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const li = document.querySelector('#courseAlertDet .lv-accord__list li');
    if (!li) return null;
    const k = li.querySelector('span'), v = li.querySelector('strong');
    return {
      hK: Math.round(k.getBoundingClientRect().height),
      hLigne: Math.round(parseFloat(getComputedStyle(k).lineHeight) || 18),
      txtK: k.textContent.trim()
    };
  });
})();
await page.setViewportSize({ width: 900, height: 1400 });
T('L\'intitulé ne se coupe pas en deux sur iPhone',
  B2b && B2b.hK <= B2b.hLigne + 2, JSON.stringify(B2b));

// La course n'est PAS acceptée tant qu'on n'a pas cliqué « J'accepte »
T('Ouvrir les détails n\'accepte RIEN',
  posted.filter(x => x.type === 'course-accept').length === 0,
  JSON.stringify(posted.filter(x => x.type === 'course-accept')));
posted = [];
await page.evaluate(() => { const b = document.getElementById('courseAlertOk'); if (b) b.click(); });
await page.waitForTimeout(600);
T('« J\'accepte » envoie bien l\'acceptation',
  posted.some(x => x.type === 'course-accept' && x.id === 'd1'), JSON.stringify(posted.map(x => x.type)));

// La croix écarte sans rien envoyer
COURSES = { ok: true, courier: true, dispo: [dispoC], mine: [] };
await boot('#/mode-livraison');
posted = [];
await page.evaluate(() => { const x = document.getElementById('courseAlertX'); if (x) x.click(); });
await page.waitForTimeout(400);
const B3 = await page.evaluate(() => ({ visible: !document.getElementById('courseAlert').hidden }));
T('La croix masque le bandeau', B3.visible === false);
T('Elle n\'envoie AUCUNE acceptation', posted.filter(x => x.type === 'course-accept').length === 0);

// ═══ 6. LA COMMANDE COLLECTE TOUTES LES CONDITIONS ═════════════════════════
console.log('\n━━ 6. TOUT SE POSE À LA COMMANDE ━━');
posted = [];
await boot('#/livraison');
const F = await page.evaluate(() => ({
  lieu: !!document.getElementById('livDelivLieu'),
  notes: !!document.getElementById('livDelivNotes'),
  date: !!document.getElementById('livDelivDate'),
  when: document.querySelectorAll('input[name="livDelivWhen"]').length,
  prix: !!document.querySelector('#livraisonOrder input[type="number"]'),
  txt: (document.getElementById('livDelivZoneTxt') || {}).textContent || ''
}));
T('Le formulaire demande le point de dépôt', F.lieu === true, JSON.stringify(F));
T('Il demande les précisions', F.notes === true);
T('Il demande la date et le créneau', F.date === true && F.when === 3, 'when=' + F.when);
T('Il ne demande AUCUN prix au client', F.prix === false);
T('Il annonce que le prix vient du livreur', /prix.*proposé par le livreur/i.test(F.txt), F.txt.slice(0, 90));

await page.evaluate(() => {
  const m = document.getElementById('livDelivMap');
  if (m) m._ptGeo = { lat: 16.0578, lng: -61.7639, label: 'Vieux-Habitants', postal: '97119', city: 'Vieux-Habitants', street: 'Rue test' };
  const b = document.getElementById('livraisonOrder'); if (b) b._ptScene = 'data:image/jpeg;base64,AAAA';
  const f = document.getElementById('livDelivFilmOk'); if (f) f.checked = true;
  const l = document.getElementById('livDelivLieu'); if (l) l.value = 'Portail bleu, sous l\'auvent';
  const n = document.getElementById('livDelivNotes'); if (n) n.value = 'Chien dans la cour';
});
await page.evaluate(() => { const b = document.getElementById('livDelivOrder'); if (b) b.click(); });
await page.waitForTimeout(900);
const R = posted.filter(x => x.type === 'course-request')[0] || null;
T('La demande part avec le point de dépôt', !!R && /Portail bleu/.test(R.lieu || ''), R ? String(R.lieu) : 'aucune');
T('…et avec les précisions', !!R && /Chien/.test(R.notes || ''), R ? String(R.notes) : '');
T('…et avec date + créneau', !!R && !!R.date && !!R.when, R ? R.date + ' / ' + R.when : '');
T('…et SANS aucun prix', !!R && R.prix === undefined && R.accord === undefined, R ? JSON.stringify(R.prix) : '');

// ═══ 7. PARAMÈTRES LIVREUR : son mode de règlement ═════════════════════════
console.log('\n━━ 7. LE LIVREUR CHOISIT SON RÈGLEMENT DANS SES PARAMÈTRES ━━');
COURSES = { ok: true, courier: true, dispo: [], mine: [] };
await boot('#/mode-livraison');
await page.evaluate(() => { const g = document.getElementById('courierGear'); if (g) g.click(); });
await page.waitForTimeout(700);
const S = await page.evaluate(() => {
  const sel = document.getElementById('lvPfPaiement');
  return {
    present: !!sel, valeur: sel ? sel.value : null,
    options: sel ? Array.from(sel.options).map(o => o.value) : []
  };
});
T('Le réglage « comment veux-tu être payé » existe', S.present === true, JSON.stringify(S));
T('Il reflète son profil (virement)', S.valeur === 'virement', String(S.valeur));
/* ⚠️ ASSERTION REFAITE LE 01/08/2026 — elle comptait, elle ne vérifiait rien.
   Elle exigeait EXACTEMENT deux modes, nommés en dur (« especes »,
   « virement »). Un troisième a été ajouté depuis, délibérément (le lien de
   paiement, pour que le livreur soit réglé tout de suite). Le harnais criait
   donc au défaut sur une fonctionnalité voulue — et il aurait crié pareil au
   RETRAIT d'un mode, sans jamais dire lequel.

   On teste maintenant l'INVARIANT que le code énonce lui-même, deux lignes
   au-dessus du menu : « ajouter un mode sans l'offrir au livreur (ou
   l'inverse) donne un réglage impossible à choisir, ou un choix que le
   serveur refuse ». Le menu doit donc refléter LV_PAIEMENTS À L'IDENTIQUE.
   Aucun mode nommé ici : la liste de référence est relue dans `app.js`. */
const MODES_ATTENDUS = (function (src) {
  const bloc = (src.match(/var LV_PAIEMENTS = \[([\s\S]*?)\];/) || [])[1] || '';
  return [...bloc.matchAll(/v:\s*'([^']+)'/g)].map((m) => m[1]);
})(await readFile(join(RACINE, 'app.js'), 'utf8'));
T('PRÉALABLE : la liste des modes est relue dans app.js',
  MODES_ATTENDUS.length > 0, MODES_ATTENDUS.length + ' mode(s) — ' + JSON.stringify(MODES_ATTENDUS));
T('Le menu offre EXACTEMENT les modes déclarés par le produit, ni plus ni moins',
  S.options.join('|') === MODES_ATTENDUS.join('|'),
  'menu=' + JSON.stringify(S.options) + ' attendu=' + JSON.stringify(MODES_ATTENDUS));
posted = [];
await page.evaluate(() => {
  const sel = document.getElementById('lvPfPaiement'); if (sel) sel.value = 'especes';
  const b = document.getElementById('lvPfSave'); if (b) b.click();
});
await page.waitForTimeout(700);
const SV = posted.filter(x => x.type === 'courier-profile-save')[0] || null;
T('L\'enregistrement transporte son choix', !!SV && SV.paiement === 'especes', SV ? String(SV.paiement) : 'aucun');

// Captures
await page.setViewportSize({ width: 430, height: 1600 });
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC)] };
await boot('#/mes-livraisons');
await page.screenshot({ path: join(await sortie('plan9'), 'client.png'), fullPage: true });
COURSES = { ok: true, courier: true, dispo: [dispoC], mine: [] };
await boot('#/mode-livraison');
await page.evaluate(() => { const g = document.getElementById('courseAlertGo'); if (g) g.click(); });
await page.waitForTimeout(500);
await page.screenshot({ path: join(await sortie('plan9'), 'bandeau.png') });
await browser.close(); server.close();
console.log('\n' + (fail ? '❌' : '✅') + ` ${pass}/${pass + fail} assertions`);
process.exit(fail ? 1 : 0);
