// PLAN 8 (retour user 28/07/2026, capture IMG_4977) — 5 correctifs :
//  1. la DEMANDE DE LIVRAISON enregistre les lignes du panier (cause racine)
//  2. « Payer ma marchandise » ouvre la MODALE CARTE (fin du « Aller au catalogue »)
//  3. bandeau de statut pleine largeur, vert néon accepté / orange néon en attente
//  4. livreur : « Historique de course » replié, TOUT EN BAS, courses finies SEULEMENT
//  5. livreur : pastille orange « Statut : en cours », et la grosse fiche
//     DISPARAÎT quand la course est terminée
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

// Deux vraies clés quincaillerie du catalogue (résolues par findProductByKey).
const cat = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));
const prods = Array.isArray(cat) ? cat : (cat.products || []);
const quinc = prods.filter(p => p.brand === 'Quincaillerie').slice(0, 2);
if (quinc.length < 2) { console.log('❌ pas assez de quincaillerie au catalogue'); process.exit(1); }
const K1 = quinc[0].id || quinc[0].sku, K2 = quinc[1].id || quinc[1].sku;
console.log('Articles de test : ' + K1 + ' / ' + K2);

const PROFIL = { uid: 'moi', displayName: 'Nova', commune: 'Sainte-Anne', vehicle: 'scooter', tarifs: { 1: 30, 2: 55, 3: 80, 4: 100 }, hDebut: '00:00', hFin: '23:30', available: true, published: true, coursesDone: 0, ratingCount: 0, ratingSum: 0 };
const baseC = {
  id: 'c1', mine: true, acceptedByMe: true, chatOpen: true, round: 1,
  courierUid: 'moi', courierName: 'Nova', address: 'Vieux-Habitants', zone: 4, km: 43.4,
  productTitle: '2 articles de quincaillerie', qty: 3, when: 'heure', hour: '21:05',
  date: '2026-07-28', code: '213286', lines: [{ key: K1, qty: 2 }, { key: K2, qty: 1 }]
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
          : b.type === 'course-request' ? { ok: true, id: 'nouvelle' } : { ok: true };
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rep) });
});
await page.addInitScript(([k1, k2]) => {
  const USER = { uid: 'moi', email: 'justforwada@icloud.com', getIdToken: () => Promise.resolve('t') };
  try {
    // 'pt_no_cart' : permet de simuler un panier VIDÉ (navigation privée
    // refermée) sans que le fixture le réinjecte à chaque navigation.
    if (localStorage.getItem('pt_no_cart') !== '1') {
      localStorage.setItem('pt_cart', JSON.stringify({ version: '1', items: [
        { key: k1, qty: 2 }, { key: k2, qty: 1 }
      ] }));
    }
  } catch (_) { }
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
}, [K1, K2]);
const boot = async (h) => {
  await page.goto(base + '/index.html?b=' + Math.random().toString(36).slice(2) + h, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
  await page.waitForTimeout(1200);
};

// ═══ 1. CAUSE RACINE : la demande transporte les LIGNES DU PANIER ═══════════
console.log('\n━━ 1. LA DEMANDE ENREGISTRE LE PANIER (cause racine) ━━');
posted = [];
await boot('#/livraison');
const cartOk = await page.evaluate(() => {
  const sec = document.getElementById('livraisonOrder');
  return { visible: !!sec && !sec.hidden };
});
T('Le widget de commande est visible (panier quincaillerie)', cartOk.visible, JSON.stringify(cartOk));
// On court-circuite le géocodage (réseau coupé) en posant directement le
// résultat que la validation d'adresse aurait produit : Vieux-Habitants (971).
await page.evaluate(() => {
  const m = document.getElementById('livDelivMap');
  if (m) m._ptGeo = { lat: 16.0578, lng: -61.7639, label: 'Vieux-Habitants', postal: '97119', city: 'Vieux-Habitants', street: 'Rue test' };
  const box = document.getElementById('livraisonOrder');
  if (box) box._ptScene = 'data:image/jpeg;base64,AAAA';
  const f = document.getElementById('livDelivFilmOk'); if (f) f.checked = true;
});
await page.evaluate(() => { const b = document.getElementById('livDelivOrder'); if (b) b.click(); });
await page.waitForTimeout(900);
const req = posted.filter(p => p.type === 'course-request')[0] || null;
T('La demande est bien partie', !!req, req ? '' : 'aucun POST course-request — ' + JSON.stringify(posted.map(p => p.type)));
T('Elle transporte le champ `lines`', !!(req && Array.isArray(req.lines)), req ? JSON.stringify(req.lines) : '');
T('`lines` contient les 2 articles du panier', !!(req && req.lines && req.lines.length === 2), req && req.lines ? req.lines.length + ' ligne(s)' : '');
T('`lines` porte les bonnes clés et quantités',
  !!(req && req.lines && req.lines.some(l => l.key === K1 && l.qty === 2) && req.lines.some(l => l.key === K2 && l.qty === 1)),
  req ? JSON.stringify(req.lines) : '');
T('AUCUN prix client dans `lines` (le serveur seul décide)',
  !!(req && req.lines && req.lines.every(l => Object.keys(l).sort().join(',') === 'key,qty')),
  req ? JSON.stringify(req.lines && req.lines[0]) : '');

// ═══ 2 & 3. CÔTÉ CLIENT : paiement réel + bandeau de statut ════════════════
const ouvrirPay = async () => {
  await page.evaluate(() => {
    const b = document.querySelector('#clientDelivDetail [data-cpanel="pay"]');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
};

for (const [titre, accord, attendu] of [
  ['accord VALIDÉ des deux côtés', { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true }, 'ok'],
  ['accord proposé, PAS encore validé', { prix: 100, paiement: 'especes', okClient: true, okLivreur: false, valide: false }, 'wait']
]) {
  console.log('\n━━ 2/3. CÔTÉ CLIENT — ' + titre + ' ━━');
  COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, { status: 'acceptee', accord })] };
  await boot('#/mes-livraisons');
  const sig = await page.evaluate(() => {
    const h = document.getElementById('clientDelivEnCours');
    const s = h && !h.hidden ? h.querySelector('.lv-signet') : null;
    const p = s ? s.querySelector('.lv-pill--wait') : null;
    return {
      detFerme: (document.getElementById('clientDelivDetail') || {}).hidden === true,
      signet: !!s, pill: p ? p.textContent.trim() : null,
      couleur: p ? getComputedStyle(p).color : null,
      dansHisto: !!(s && s.closest('details'))
    };
  });
  T('AUCUNE fiche ne s\'ouvre toute seule', sig.detFerme === true, JSON.stringify(sig));
  T('Un SIGNET « en cours » est visible d\'emblée', sig.signet === true, JSON.stringify(sig));
  T('Il porte la pastille orange néon « Statut : en cours »',
    /Statut\s*:\s*en cours/.test(sig.pill || '') && /rgb\(251, 146, 60\)/.test(sig.couleur || ''), sig.pill + ' | ' + sig.couleur);
  T('Le signet est HORS de l\'historique replié', sig.dansHisto === false);
  await page.evaluate(() => { const s = document.querySelector('#clientDelivEnCours .lv-signet'); if (s) s.click(); });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const det = document.getElementById('clientDelivDetail');
    if (!det || det.hidden) return { absent: true };
    const ban = det.querySelector('.lv-statut');
    const cs = ban ? getComputedStyle(ban) : null;
    const larg = ban ? Math.round(ban.getBoundingClientRect().width) : 0;
    const carte = Math.round(det.getBoundingClientRect().width);
    const cartePad = parseFloat(getComputedStyle(det).paddingLeft) + parseFloat(getComputedStyle(det).paddingRight);
    return {
      banText: ban ? ban.textContent.trim() : null,
      ok: !!(ban && ban.classList.contains('lv-statut--ok')),
      wait: !!(ban && ban.classList.contains('lv-statut--wait')),
      couleur: cs ? cs.color : null,
      ombre: cs ? cs.boxShadow : null,
      larg, dispo: Math.round(carte - cartePad),
      ficheStatut: Array.from(det.querySelectorAll('.lv-fact__k')).some(e => /Statut/.test(e.textContent)),
      etape: Array.from(det.querySelectorAll('.lv-fact__k')).some(e => /Étape/.test(e.textContent)),
      html: det.innerHTML
    };
  });
  T('Le clic sur le signet OUVRE la grosse fiche', !r.absent, JSON.stringify(r).slice(0, 120));
  T('Bandeau de statut présent', !!r.banText, String(r.banText));
  if (attendu === 'ok') {
    T('Texte « Statut : accepté »', /Statut\s*:\s*accepté/.test(r.banText || ''), String(r.banText));
    T('Vert néon (classe --ok + halo)', r.ok && /rgb\(52, 211, 153\)/.test(r.couleur || '') && /px/.test(r.ombre || ''), r.couleur + ' | ' + String(r.ombre).slice(0, 40));
  } else {
    T('Texte « Statut : en attente »', /Statut\s*:\s*en attente/.test(r.banText || ''), String(r.banText));
    T('Orange néon (classe --wait + halo)', r.wait && /rgb\(251, 146, 60\)/.test(r.couleur || '') && /px/.test(r.ombre || ''), r.couleur + ' | ' + String(r.ombre).slice(0, 40));
  }
  T('Il prend TOUTE la largeur de la fiche', Math.abs(r.larg - r.dispo) <= 2, r.larg + 'px / ' + r.dispo + 'px');
  T('La petite fiche « 🚦 Statut » a disparu', !r.ficheStatut);
  T('Remplacée par « 🧭 Étape »', r.etape);

  // Panneau de paiement
  await ouvrirPay();
  const p = await page.evaluate(() => {
    const pan = document.getElementById('lvChatPanel');
    if (!pan || pan.hidden) return { absent: true };
    const b = pan.querySelector('#acPay');
    return {
      bouton: !!b, txt: b ? b.textContent.trim() : null, off: b ? b.disabled : null,
      catalogue: /Aller au catalogue/.test(pan.textContent),
      sansPanier: /sans panier/.test(pan.textContent),
      lignes: pan.querySelectorAll('.lv-accord__list li').length,
      corps: pan.textContent.slice(0, 90)
    };
  });
  if (attendu === 'ok') {
    T('Le bouton « Payer ma marchandise » existe', p.bouton, JSON.stringify(p).slice(0, 140));
    T('Il est ACTIF (cliquable)', p.off === false, 'disabled=' + p.off);
    T('Les 2 articles y sont listés', p.lignes === 2, p.lignes + ' ligne(s)');
    T('PLUS de « Aller au catalogue »', !p.catalogue);
    T('PLUS de bandeau « sans panier »', !p.sansPanier);
    // Le clic doit ouvrir la MODALE CARTE, pas naviguer ailleurs.
    await page.evaluate(() => { const b = document.querySelector('#lvChatPanel #acPay'); if (b) b.click(); });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const mo = document.getElementById('payModal');
      return {
        ouverte: !!mo && !mo.hidden && getComputedStyle(mo).display !== 'none',
        carte: !!document.querySelector('#payModal #carteMontage, #payModal #payAddress'),
        hash: location.hash
      };
    });
    T('Le clic OUVRE la modale de paiement', m.ouverte, JSON.stringify(m));
    T('Elle contient bien le formulaire de carte', m.carte, JSON.stringify(m));
    T('On ne navigue PAS ailleurs (on reste sur mes-livraisons)', /mes-livraisons/.test(m.hash), m.hash);
  } else {
    T('Le paiement dit qu\'il attend l\'accord', /accord/i.test(p.corps || ''), String(p.corps).slice(0, 70));
  }
}

// ═══ 2bis. LE CAS RÉEL DE L'USER : demande ANCIENNE + panier VIDÉ ══════════
// (navigation privée : le panier disparaît à la fermeture du site). C'est là
// que le bouton était devenu SOMBRE — donc intestable. Il ne doit JAMAIS être
// éteint : toujours actif, toujours un effet visible.
console.log('\n━━ 2bis. DEMANDE ANCIENNE (sans lignes) + PANIER VIDE ━━');
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, {
  status: 'acceptee', lines: [],
  accord: { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true }
})] };
await page.evaluate(() => { try { localStorage.setItem('pt_no_cart', '1'); localStorage.removeItem('pt_cart'); } catch (_) {} });
await boot('#/mes-livraisons');
await page.evaluate(() => { const s = document.querySelector('#clientDelivEnCours .lv-signet'); if (s) s.click(); });
await page.waitForTimeout(600);
await ouvrirPay();
const V = await page.evaluate(() => {
  const b = document.querySelector('#lvChatPanel #acPay');
  if (!b) return { absent: true };
  const cs = getComputedStyle(b);
  return {
    off: b.disabled, aria: b.getAttribute('aria-disabled'),
    txt: b.textContent.trim(), opacite: cs.opacity,
    explique: /avant l'enregistrement du panier/.test(document.getElementById('lvChatPanel').textContent),
    hash: location.hash
  };
});
T('Le bouton EXISTE malgré l\'absence d\'articles', !V.absent, JSON.stringify(V));
T('Il n\'est PAS désactivé (jamais de bouton sombre)', V.off === false && !V.aria, JSON.stringify(V));
T('Il n\'est pas grisé visuellement', parseFloat(V.opacite) >= 0.9, 'opacity=' + V.opacite);
T('Le panneau explique POURQUOI en une ligne', V.explique === true);
await page.evaluate(() => { const b = document.querySelector('#lvChatPanel #acPay'); if (b) b.click(); });
await page.waitForTimeout(600);
const V2 = await page.evaluate(() => ({ hash: location.hash, toast: !!document.querySelector('.toast, #toasts *') }));
T('Le clic a un EFFET VISIBLE (on arrive au catalogue)', /catalogue/.test(V2.hash), JSON.stringify(V2));

// Et dès que le panier est rempli, la MODALE CARTE s'ouvre pour cette meme course.
await page.evaluate(([k1, k2]) => {
  localStorage.removeItem('pt_no_cart');
  localStorage.setItem('pt_cart', JSON.stringify({ version: '1', items: [{ key: k1, qty: 2 }, { key: k2, qty: 1 }] }));
}, [K1, K2]);
await boot('#/mes-livraisons');
await page.evaluate(() => { const s = document.querySelector('#clientDelivEnCours .lv-signet'); if (s) s.click(); });
await page.waitForTimeout(600);
await ouvrirPay();
const V3 = await page.evaluate(() => {
  const b = document.querySelector('#lvChatPanel #acPay');
  return { txt: b ? b.textContent.trim() : null, off: b ? b.disabled : null,
    lignes: document.querySelectorAll('#lvChatPanel .lv-accord__list li').length };
});
T('Panier rempli → le bouton redevient « Payer ma marchandise »', /Payer ma marchandise/.test(V3.txt || ''), JSON.stringify(V3));
T('Les articles du panier sont repris et chiffres', V3.lignes === 2, V3.lignes + ' ligne(s)');
await page.evaluate(() => { const b = document.querySelector('#lvChatPanel #acPay'); if (b) b.click(); });
await page.waitForTimeout(700);
const V4 = await page.evaluate(() => {
  const mo = document.getElementById('payModal');
  return { ouverte: !!mo && !mo.hidden && getComputedStyle(mo).display !== 'none',
    carte: !!document.querySelector('#payModal #carteMontage, #payModal #payAddress') };
});
T('La MODALE CARTE s\'ouvre pour cette demande ancienne', V4.ouverte && V4.carte, JSON.stringify(V4));

// ═══ 4 & 5. CÔTÉ LIVREUR ═══════════════════════════════════════════════════
console.log('\n━━ 4/5. CÔTÉ LIVREUR — course EN COURS ━━');
COURSES = {
  ok: true, courier: true, dispo: [],
  mine: [Object.assign({}, baseC, { status: 'confirmee', goodsPaid: true, accord: { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true } })]
};
await boot('#/mode-livraison');
const sigL = await page.evaluate(() => {
  const h = document.getElementById('courierEnCours');
  const s = h && !h.hidden ? h.querySelector('.lv-signet') : null;
  const p = s ? s.querySelector('.lv-pill--wait') : null;
  return {
    detFerme: (document.getElementById('courierDetail') || {}).hidden === true,
    signet: !!s, pill: p ? p.textContent.trim() : null,
    couleur: p ? getComputedStyle(p).color : null,
    dansHisto: !!(s && s.closest('details'))
  };
});
T('LIVREUR : aucune fiche ne s\'ouvre toute seule', sigL.detFerme === true, JSON.stringify(sigL));
T('LIVREUR : le signet « en cours » est visible d\'emblée', sigL.signet === true, JSON.stringify(sigL));
T('LIVREUR : pastille orange néon sur le signet',
  /Statut\s*:\s*en cours/.test(sigL.pill || '') && /rgb\(251, 146, 60\)/.test(sigL.couleur || ''), sigL.pill + ' | ' + sigL.couleur);
T('LIVREUR : le signet est HORS de l\'historique replié', sigL.dansHisto === false);
await page.evaluate(() => { const s = document.querySelector('#courierEnCours .lv-signet'); if (s) s.click(); });
await page.waitForTimeout(600);
const L = await page.evaluate(() => {
  const det = document.getElementById('courierDetail');
  const histo = document.querySelector('#courierWork details.lv-histo');
  const work = document.getElementById('courierWork');
  const pill = det ? det.querySelector('.lv-pill--wait') : null;
  const cs = pill ? getComputedStyle(pill) : null;
  const head = det ? det.querySelector('.lv-dhead') : null;
  const h2 = head ? head.querySelector('.lv-h2') : null;
  return {
    fiche: !!det && !det.hidden,
    pill: pill ? pill.textContent.trim() : null,
    couleur: cs ? cs.color : null, ombre: cs ? cs.boxShadow : null,
    // La pastille doit être À DROITE du titre : son bord gauche après celui du titre.
    aDroite: (pill && h2) ? Math.round(pill.getBoundingClientRect().left) > Math.round(h2.getBoundingClientRect().right) - 5 : null,
    histoTitre: histo ? histo.querySelector('summary').textContent.trim() : null,
    histoReplie: histo ? !histo.open : null,
    histoDernier: (histo && work) ? work.lastElementChild === histo : null,
    histoContenu: histo ? histo.querySelector('#courierMine').textContent.trim().slice(0, 60) : null,
    histoCartes: histo ? histo.querySelectorAll('[data-course-focus]').length : -1,
    selecteurCache: (() => { const e = document.getElementById('courierEnCours'); return e ? e.hidden : null; })()
  };
});
T('Le clic sur le signet ouvre la grosse fiche', L.fiche, JSON.stringify(L).slice(0, 130));
T('Pastille « Statut : en cours » présente', /Statut\s*:\s*en cours/.test(L.pill || ''), String(L.pill));
T('Orange néon (couleur + halo)', /rgb\(251, 146, 60\)/.test(L.couleur || '') && /px/.test(L.ombre || ''), L.couleur + ' | ' + String(L.ombre).slice(0, 40));
T('Elle est bien À DROITE du titre', L.aDroite === true, 'aDroite=' + L.aDroite);
// Sur iPhone la pastille passe SOUS le titre : elle doit rester collée à droite.
const mob = await (async () => {
  await page.setViewportSize({ width: 390, height: 1400 });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const h = document.querySelector('#courierDetail .lv-dhead');
    const p = h && h.querySelector('.lv-pill');
    if (!p) return null;
    const pr = p.getBoundingClientRect(), hr = h.getBoundingClientRect();
    return { ecartDroite: Math.round(hr.right - pr.right), sousLeTitre: Math.round(pr.top) > Math.round(h.querySelector('.lv-h2').getBoundingClientRect().top) + 5 };
  });
})();
await page.setViewportSize({ width: 900, height: 1400 });
T('Sur iPhone, la pastille reste collée à droite', mob && mob.ecartDroite <= 2, JSON.stringify(mob));
T('Le bloc s\'appelle « Historique de course »', /Historique de course/.test(L.histoTitre || ''), String(L.histoTitre));
T('Il est REPLIÉ à l\'arrivée', L.histoReplie === true);
T('Il est le TOUT DERNIER élément de la page', L.histoDernier === true);
T('La course EN COURS n\'y figure PAS', L.histoCartes === 0, L.histoCartes + ' carte(s) — ' + String(L.histoContenu));
T('Le bloc des signets reste affiché (la course tourne toujours)', L.selecteurCache === false);

console.log('\n━━ 5. CÔTÉ LIVREUR — course TERMINÉE ━━');
COURSES = {
  ok: true, courier: true, dispo: [],
  mine: [Object.assign({}, baseC, { status: 'terminee', goodsPaid: true, accord: { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true } })]
};
await boot('#/mode-livraison');
const F = await page.evaluate(() => {
  const det = document.getElementById('courierDetail');
  const histo = document.querySelector('#courierWork details.lv-histo');
  return {
    ficheCachee: !det || det.hidden,
    ficheVide: det ? det.innerHTML.trim() === '' : null,
    histoCartes: histo ? histo.querySelectorAll('[data-course-focus]').length : -1
  };
});
T('La grosse fiche a DISPARU', F.ficheCachee === true, JSON.stringify(F));
T('Elle est vraiment vidée (rien ne reste en mémoire)', F.ficheVide === true);
T('La course est passée dans l\'historique', F.histoCartes === 1, F.histoCartes + ' carte(s)');

// L'historique ne doit pas être un bouton MORT : un clic doit rouvrir la fiche,
// mais avec la pastille VERTE « terminée » (et surtout pas l'orange en cours).
await page.evaluate(() => {
  const h = document.querySelector('#courierWork details.lv-histo');
  if (h) { h.open = true; const b = h.querySelector('[data-course-focus]'); if (b) b.click(); }
});
await page.waitForTimeout(600);
const R = await page.evaluate(() => {
  const det = document.getElementById('courierDetail');
  const ok = det ? det.querySelector('.lv-pill--ok') : null;
  return {
    rouverte: !!det && !det.hidden && det.innerHTML.trim() !== '',
    verte: ok ? ok.textContent.trim() : null,
    orange: !!(det && det.querySelector('.lv-pill--wait'))
  };
});
T('Un clic dans l\'historique ROUVRE la fiche (pas un bouton mort)', R.rouverte === true, JSON.stringify(R));
T('Pastille VERTE « Statut : terminée »', /Statut\s*:\s*terminée/.test(R.verte || ''), String(R.verte));
T('AUCUNE pastille orange « en cours » sur une course finie', R.orange === false);

// LE VRAI PARCOURS : la course se termine PENDANT la session (le livreur valide,
// le client confirme) et la page se re-rend SANS rechargement. La grosse fiche,
// ouverte l'instant d'avant, doit se refermer d'elle-même.
console.log('\n━━ 5bis. LA COURSE SE TERMINE EN COURS DE SESSION (sans rechargement) ━━');
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, { status: 'confirmee', goodsPaid: true, accord: { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true } })] };
await boot('#/mode-livraison');
// On ouvre la fiche comme le ferait le livreur : en touchant le signet.
await page.evaluate(() => { const s = document.querySelector('#courierEnCours .lv-signet'); if (s) s.click(); });
await page.waitForTimeout(600);
const avant = await page.evaluate(() => {
  const d = document.getElementById('courierDetail');
  const h = document.getElementById('courierEnCours');
  return {
    ouverte: !!d && !d.hidden, pill: !!(d && d.querySelector('.lv-pill--wait')),
    signet: !!(h && !h.hidden && h.querySelector('.lv-signet'))
  };
});
T('Départ : signet présent, et la fiche ouverte au clic', avant.ouverte && avant.pill && avant.signet, JSON.stringify(avant));
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, { status: 'terminee', goodsPaid: true, accord: { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true } })] };
await page.evaluate(() => { const b = document.getElementById('courierRefresh'); if (b) b.click(); });
await page.waitForTimeout(1000);
const apres = await page.evaluate(() => {
  const d = document.getElementById('courierDetail');
  const h = document.querySelector('#courierWork details.lv-histo');
  const sg = document.getElementById('courierEnCours');
  return {
    cachee: !d || d.hidden, vide: d ? d.innerHTML.trim() === '' : null,
    histo: h ? h.querySelectorAll('[data-course-focus]').length : -1,
    signetParti: !sg || sg.hidden || !sg.querySelector('.lv-signet')
  };
});
T('Le signet « en cours » a disparu avec la fin de la course', apres.signetParti === true, JSON.stringify(apres));
T('La fiche se REFERME toute seule à la fin de la course', apres.cachee === true, JSON.stringify(apres));
T('Son contenu est purgé', apres.vide === true, JSON.stringify(apres));
T('La course a rejoint l\'historique sans rechargement', apres.histo === 1, apres.histo + ' carte(s)');

// Captures pour vérification visuelle
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, { status: 'acceptee', accord: { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true } })] };
await page.setViewportSize({ width: 430, height: 1500 });
await boot('#/mes-livraisons');
await page.screenshot({ path: join(await sortie('plan8'), 'client.png'), fullPage: true });
COURSES = { ok: true, courier: true, dispo: [], mine: [Object.assign({}, baseC, { status: 'confirmee', goodsPaid: true, accord: { prix: 100, paiement: 'especes', okClient: true, okLivreur: true, valide: true } })] };
await boot('#/mode-livraison');
await page.screenshot({ path: join(await sortie('plan8'), 'livreur.png'), fullPage: true });
console.log('captures : tests/_sortie/plan8/');
await browser.close(); server.close();
console.log('\n' + (fail ? '❌' : '✅') + ` ${pass}/${pass + fail} assertions`);
process.exit(fail ? 1 : 0);
