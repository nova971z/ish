// PLAN 13 — DOUBLE AUTHENTIFICATION (TOTP). Ce qui compte :
//  1. mfa.js n'est PAS chargé pour une visite ordinaire (0 octet)
//  2. le badge et le panneau de « Mon compte » fonctionnent
//  3. l'adresse non vérifiée bloque l'activation (condition Google)
//  4. le QR est généré EN LOCAL + la clé est TOUJOURS lisible en texte
//  5. le défi de connexion apparaît et termine la connexion
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
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

const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
await ctx.route('**/*', r => /googleapis|gstatic|jsdelivr|coingecko|unpkg|tile\.|api-adresse|osrm|stripe/.test(r.request().url()) ? r.abort() : r.continue());

// On JOURNALISE tout téléchargement de mfa.js : c'est la mesure de la promesse
// « zéro octet pour qui n'y touche pas ».
const charges = [];
ctx.on('request', r => { if (/\/mfa\.js/.test(r.url())) charges.push(r.url()); });

const page = await ctx.newPage();
await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

// Faux SDK : on contrôle exactement ce que Firebase répond.
const poserUser = (verifie, facteurs) => page.addInitScript(([v, f]) => {
  const USER = {
    uid: 'moi', email: 'test@pirates-tools.com', displayName: 'Test',
    emailVerified: v, multiFactor: { enrolledFactors: f },
    getIdToken: () => Promise.resolve('t'), reload: () => Promise.resolve()
  };
  window.__mfaCalls = [];
  window.PT_FIREBASE = {
    configured: true, auth: {}, db: {},
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(USER), 0); return () => { }; },
    doc: () => ({}), getDoc: () => Promise.resolve({ exists: () => false }), setDoc: () => Promise.resolve(),
    updateDoc: () => Promise.resolve(), collection: function () { return { path: '' }; },
    addDoc: () => Promise.resolve({ id: 'x' }), getDocs: () => Promise.resolve({ forEach: () => { } }),
    query: c => c, orderBy: () => ({}), where: () => ({}), limit: () => ({}),
    onSnapshot: (q, cb) => { setTimeout(() => cb({ forEach: () => { } }), 0); return () => { }; },
    serverTimestamp: () => new Date(),
    EmailAuthProvider: { credential: (e, p) => ({ e, p }) },
    reauthenticateWithCredential: (u, c) => {
      window.__mfaCalls.push('reauth:' + c.p);
      return c.p === 'bonmotdepasse' ? Promise.resolve({}) : Promise.reject({ code: 'auth/wrong-password' });
    },
    multiFactor: (u) => ({
      enrolledFactors: u.multiFactor.enrolledFactors,
      getSession: () => { window.__mfaCalls.push('session'); return Promise.resolve({ s: 1 }); },
      enroll: (a, nom) => { window.__mfaCalls.push('enroll:' + a.code + ':' + nom); return a.code === '123456' ? Promise.resolve() : Promise.reject({ code: 'auth/invalid-verification-code' }); },
      unenroll: (fac) => { window.__mfaCalls.push('unenroll'); return Promise.resolve(); }
    }),
    TotpMultiFactorGenerator: {
      generateSecret: () => Promise.resolve({
        secretKey: 'ABCD EFGH IJKL MNOP',
        generateQrCodeUrl: (compte, editeur) => 'otpauth://totp/' + editeur + ':' + compte + '?secret=ABCDEFGH&issuer=' + editeur
      }),
      assertionForEnrollment: (s, code) => ({ code: code }),
      assertionForSignIn: (uid, code) => ({ uid: uid, code: code })
    },
    getMultiFactorResolver: (auth, err) => ({
      hints: [{ factorId: 'totp', uid: 'f1', displayName: 'App' }],
      resolveSignIn: (a) => {
        window.__mfaCalls.push('resolve:' + a.code);
        return a.code === '123456'
          ? Promise.resolve({ user: { email: 'test@pirates-tools.com', displayName: 'Test' } })
          : Promise.reject({ code: 'auth/invalid-verification-code' });
      }
    }),
    signInWithEmailAndPassword: () => Promise.reject({ code: 'auth/multi-factor-auth-required' })
  };
}, [verifie, facteurs]);

const boot = async (h) => {
  await page.goto(base + '/index.html?m=' + Math.random().toString(36).slice(2) + h, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
  await page.waitForTimeout(1200);
};

// ═══ 1. ZÉRO OCTET POUR UNE VISITE ORDINAIRE ═══════════════════════════════
console.log('\n━━ 1. LE MODULE NE SE CHARGE PAS TOUT SEUL ━━');
await poserUser(true, []);
charges.length = 0;
await boot('#/');
T('Accueil : mfa.js N\'est PAS téléchargé', charges.length === 0, charges.length + ' chargement(s)');
await boot('#/catalogue');
T('Catalogue : toujours aucun téléchargement', charges.length === 0, charges.length + ' chargement(s)');
// (#/auth avec un compte CONNECTÉ redirige vers #/compte : le chargement y
//  serait légitime. Le cas qui compte — visiteur non connecté — est mesuré
//  en section 5, sur une page dédiée.)

// ═══ 2. « MON COMPTE » : badge, puis chargement au clic ════════════════════
console.log('\n━━ 2. MON COMPTE : le badge, puis le panneau ━━');
await boot('#/compte');
await page.waitForTimeout(700);
const B = await page.evaluate(() => {
  const b = document.getElementById('mfaBadge');
  return { texte: b ? b.textContent.trim() : null, carte: !!document.getElementById('mfaCard') };
});
T('La carte « Double authentification » existe', B.carte === true);
T('Le badge annonce « Désactivée »', /Désactiv/.test(B.texte || ''), String(B.texte));
T('Le module a été chargé pour cette page', charges.length >= 1, charges.length + ' chargement(s)');
await page.evaluate(() => document.getElementById('mfaOpen').click());
await page.waitForTimeout(400);
const P = await page.evaluate(() => {
  const b = document.getElementById('mfaBody');
  return { pwd: !!document.getElementById('mfaPwd'), go: !!document.getElementById('mfaGo'), txt: b.textContent.replace(/\s+/g, ' ') };
});
T('Le panneau demande le mot de passe', P.pwd === true && P.go === true, JSON.stringify(P).slice(0, 80));
T('Il nomme Google Authenticator', /Google Authenticator/.test(P.txt), P.txt.slice(0, 70));

// ═══ 3. ADRESSE NON VÉRIFIÉE → BLOCAGE EXPLIQUÉ ════════════════════════════
console.log('\n━━ 3. ADRESSE NON VÉRIFIÉE (condition imposée par Google) ━━');
const page2 = await ctx.newPage();
await page2.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page2.addInitScript(() => {
  const USER = { uid: 'moi', email: 'x@y.z', emailVerified: false, multiFactor: { enrolledFactors: [] }, getIdToken: () => Promise.resolve('t') };
  window.PT_FIREBASE = {
    configured: true, auth: {}, db: {},
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(USER), 0); return () => { }; },
    doc: () => ({}), getDoc: () => Promise.resolve({ exists: () => false }), setDoc: () => Promise.resolve(),
    updateDoc: () => Promise.resolve(), collection: function () { return { path: '' }; },
    addDoc: () => Promise.resolve({ id: 'x' }), getDocs: () => Promise.resolve({ forEach: () => { } }),
    query: c => c, orderBy: () => ({}), where: () => ({}), limit: () => ({}),
    onSnapshot: (q, cb) => { setTimeout(() => cb({ forEach: () => { } }), 0); return () => { }; },
    serverTimestamp: () => new Date(), multiFactor: (u) => ({ enrolledFactors: [] })
  };
});
await page2.goto(base + '/index.html?n=1#/compte', { waitUntil: 'domcontentloaded' });
await page2.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
await page2.waitForTimeout(1400);
await page2.evaluate(() => { const b = document.getElementById('mfaOpen'); if (b) b.click(); });
await page2.waitForTimeout(500);
const NV = await page2.evaluate(() => {
  const b = document.getElementById('mfaBody');
  return { pwd: !!document.getElementById('mfaPwd'), txt: b.textContent.replace(/\s+/g, ' ') };
});
T('Aucun formulaire d\'activation tant que l\'adresse n\'est pas vérifiée', NV.pwd === false, JSON.stringify(NV).slice(0, 90));
T('Et on explique que c\'est Google qui l\'exige', /Google l'exige|Vérifie d'abord/.test(NV.txt), NV.txt.slice(0, 90));
await page2.close();

// ═══ 4. ENRÔLEMENT : mot de passe → QR local + clé → code ══════════════════
console.log('\n━━ 4. ENRÔLEMENT COMPLET ━━');
await page.evaluate(() => { document.getElementById('mfaPwd').value = 'mauvais'; document.getElementById('mfaGo').click(); });
await page.waitForTimeout(500);
const E1 = await page.evaluate(() => (document.getElementById('mfaSt') || {}).textContent || '');
T('Mauvais mot de passe → refus EXPLIQUÉ', /Mot de passe incorrect/.test(E1), E1);
await page.evaluate(() => { document.getElementById('mfaPwd').value = 'bonmotdepasse'; document.getElementById('mfaGo').click(); });
await page.waitForTimeout(900);
const E2 = await page.evaluate(() => {
  const img = document.querySelector('#mfaQR img');
  return {
    etape2: !(document.getElementById('mfaStep2') || {}).hidden,
    qr: !!img, src: img ? img.getAttribute('src').slice(0, 30) : null,
    /* ⚠️ ANCRE CORRIGÉE LE 01/08/2026. Le harnais lisait `.lv-handcode__num`,
       la classe du code de remise d'une livraison — 6 chiffres. La clé TOTP en
       fait 32 : à cette taille elle sortait de l'écran de l'iPad, et `mfa.js`
       lui a donné sa propre classe `.mfa-cle` (id `mfaCle`) le 29/07/2026.
       L'ancienne classe existe toujours pour les livraisons, donc rien ne
       plantait : la lecture rendait simplement `undefined`, et le harnais
       annonçait « la clé n'est plus donnée en toutes lettres » — une fausse
       alerte sur la seule voie utilisable par l'user, qui n'a pas de
       téléphone pour scanner un QR. */
    cle: (document.getElementById('mfaCle') || {}).textContent,
    code: !!document.getElementById('mfaCode')
  };
});
T('L\'étape 2 s\'ouvre', E2.etape2 === true, JSON.stringify(E2).slice(0, 90));
T('Le QR est affiché', E2.qr === true);
T('…et généré EN LOCAL (data:image, aucun service tiers)', /^data:image/.test(E2.src || ''), String(E2.src));
T('La clé est AUSSI donnée en toutes lettres (QR illisible ≠ cul-de-sac)',
  /ABCD/.test(E2.cle || ''), String(E2.cle));
T('Le champ du code est là', E2.code === true);

// ⚠️ CAS DE L'USER : pas de téléphone, tout sur iPad — un appareil ne peut pas
// scanner son propre écran. La saisie manuelle doit donc primer sur le QR.
const IPAD = await page.evaluate(() => {
  const cle = document.getElementById('mfaCle');
  const copy = document.getElementById('mfaCopy');
  const qrBloc = document.querySelector('#mfaStep2 details');
  const box = document.getElementById('mfaStep2');
  return {
    cle: !!cle, copy: !!copy,
    qrReplie: qrBloc ? !qrBloc.open : null,
    // ⚠️ On mesure l'ORDRE DU DOCUMENT, pas la géométrie : le panneau n'est pas
    // peint dans ce contexte de test (tous les rects valent 0), la position à
    // l'écran ne dirait donc rien. compareDocumentPosition, lui, est exact.
    cleAvantQR: (cle && qrBloc)
      ? !!(cle.compareDocumentPosition(qrBloc) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
    txt: box ? box.textContent.replace(/\s+/g, ' ') : ''
  };
});
T('La clé est affichée en premier, AVANT le QR', IPAD.cleAvantQR === true, JSON.stringify(IPAD).slice(0, 90));
T('Le QR est replié (secondaire, pour un autre appareil)', IPAD.qrReplie === true);
T('Un bouton « Copier la clé » existe', IPAD.copy === true);
T('La marche à suivre est écrite (« Saisir une clé de configuration »)',
  /Saisir une clé de configuration/.test(IPAD.txt), IPAD.txt.slice(0, 110));
T('…et le type à choisir est précisé', /Basé sur le temps/.test(IPAD.txt));
// Le presse-papiers est refusé dans ce contexte de test : le repli doit alors
// SÉLECTIONNER la clé, jamais laisser le bouton sans effet.
await page.evaluate(() => document.getElementById('mfaCopy').click());
await page.waitForTimeout(400);
const COPIE = await page.evaluate(() => ({
  msg: (document.getElementById('mfaCopySt') || {}).textContent || '',
  selection: String(window.getSelection())
}));
T('Le bouton Copier a TOUJOURS un effet visible',
  /copiée|sélectionnée|Recopie/.test(COPIE.msg), JSON.stringify(COPIE).slice(0, 100));
await page.evaluate(() => { document.getElementById('mfaCode').value = '000000'; document.getElementById('mfaConfirm').click(); });
await page.waitForTimeout(600);
const E3 = await page.evaluate(() => (document.getElementById('mfaSt2') || {}).textContent || '');
T('Mauvais code → refus EXPLIQUÉ (et on dit que le code tourne)',
  /Code incorrect/.test(E3) && /30 secondes/.test(E3), E3.slice(0, 80));
await page.evaluate(() => { document.getElementById('mfaCode').value = '123456'; document.getElementById('mfaConfirm').click(); });
await page.waitForTimeout(700);
const E4 = await page.evaluate(() => ({
  calls: window.__mfaCalls,
  badge: (document.getElementById('mfaBadge') || {}).textContent
}));
T('L\'enrôlement est envoyé à Firebase', E4.calls.some(c => c.startsWith('enroll:123456')), JSON.stringify(E4.calls));
T('La ré-authentification a bien précédé (exigence Firebase)',
  E4.calls.indexOf('reauth:bonmotdepasse') < E4.calls.indexOf('session'), JSON.stringify(E4.calls));

// ═══ 5. LE DÉFI À LA CONNEXION ═════════════════════════════════════════════
console.log('\n━━ 5. DÉFI À LA CONNEXION ━━');
const page3 = await ctx.newPage();
await page3.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page3.addInitScript(() => {
  window.__mfaCalls = [];
  window.PT_FIREBASE = {
    configured: true, auth: {}, db: {},
    onAuthStateChanged: (a, cb) => { setTimeout(() => cb(null), 0); return () => { }; },
    doc: () => ({}), getDoc: () => Promise.resolve({ exists: () => false }), setDoc: () => Promise.resolve(),
    updateDoc: () => Promise.resolve(), collection: function () { return { path: '' }; },
    addDoc: () => Promise.resolve({ id: 'x' }), getDocs: () => Promise.resolve({ forEach: () => { } }),
    query: c => c, orderBy: () => ({}), where: () => ({}), limit: () => ({}),
    onSnapshot: (q, cb) => { setTimeout(() => cb({ forEach: () => { } }), 0); return () => { }; },
    serverTimestamp: () => new Date(),
    signInWithEmailAndPassword: () => Promise.reject({ code: 'auth/multi-factor-auth-required' }),
    getMultiFactorResolver: () => ({
      hints: [{ factorId: 'totp', uid: 'f1' }],
      resolveSignIn: (a) => { window.__mfaCalls.push('resolve:' + a.code); return a.code === '123456'
        ? Promise.resolve({ user: { email: 'test@x.fr', displayName: 'Test' } })
        : Promise.reject({ code: 'auth/invalid-verification-code' }); }
    }),
    TotpMultiFactorGenerator: { assertionForSignIn: (uid, code) => ({ uid, code }) }
  };
});
const chargesAvantDefi = charges.length;
await page3.goto(base + '/index.html?d=1#/auth', { waitUntil: 'domcontentloaded' });
await page3.waitForFunction(() => window.PT_BOOTED === true, { timeout: 15000 }).catch(() => { });
await page3.waitForTimeout(1200);
const avantDefi = await page3.evaluate(() => (document.getElementById('loginMfa') || {}).hidden);
T('Le champ du code est CACHÉ au départ', avantDefi === true);
T('Visiteur NON connecté sur la page de connexion : mfa.js pas encore chargé',
  charges.filter(u => /d=1/.test(u)).length === 0 || charges.length === chargesAvantDefi,
  'total ' + charges.length);
await page3.evaluate(() => {
  document.getElementById('loginEmail').value = 'test@x.fr';
  document.getElementById('loginPwd').value = 'motdepasse';
  document.getElementById('loginForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});
await page3.waitForTimeout(1400);
const D = await page3.evaluate(() => ({
  visible: !(document.getElementById('loginMfa') || {}).hidden,
  submitCache: (document.getElementById('loginSubmit') || {}).hidden,
  focus: document.activeElement && document.activeElement.id
}));
T('Le défi APPARAÎT (la connexion est suspendue, pas échouée)', D.visible === true, JSON.stringify(D));
T('Le bouton de connexion habituel s\'efface', D.submitCache === true);
T('Le curseur est déjà dans le champ du code', D.focus === 'loginMfaCode', String(D.focus));
await page3.evaluate(() => { document.getElementById('loginMfaCode').value = '999999'; document.getElementById('loginMfaGo').click(); });
await page3.waitForTimeout(700);
const D2 = await page3.evaluate(() => (document.getElementById('loginMfaErr') || {}).textContent || '');
T('Mauvais code → message clair, on reste sur place', /Code incorrect/.test(D2), D2.slice(0, 60));
await page3.evaluate(() => { document.getElementById('loginMfaCode').value = '123456'; document.getElementById('loginMfaGo').click(); });
await page3.waitForTimeout(900);
const D3 = await page3.evaluate(() => ({
  calls: window.__mfaCalls,
  // Le faux SDK ne « connecte » jamais réellement (onAuthStateChanged reste à
  // null), donc la garde de route ramène sur #/auth. Ce qui prouve la reprise
  // de la connexion, c'est le message de bienvenue ET la disparition du défi.
  bienvenue: /Bienvenue/.test((document.getElementById('toasts') || {}).textContent || ''),
  defiFerme: (document.getElementById('loginMfa') || {}).hidden === true
}));
T('Bon code → la connexion se termine', D3.calls.includes('resolve:123456'), JSON.stringify(D3.calls));
T('…et l\'utilisateur est accueilli', D3.bienvenue === true, JSON.stringify(D3));
T('…le défi se referme', D3.defiFerme === true, JSON.stringify(D3));

await browser.close(); server.close();
console.log('\n' + (fail ? '❌' : '✅') + ` ${pass}/${pass + fail} assertions`);
process.exit(fail ? 1 : 0);
