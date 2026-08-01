/* outils/vue.mjs — VOIR L'ÉCRAN AVANT DE LIVRER.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   Demandé par l'user le 01/08/2026, après une nuit où le tunnel de paiement a
   été livré six fois de suite avec un défaut visuel ou fonctionnel — et où
   c'est LUI qui les a vus, un par un, en rechargeant son iPad.

   Je livrais du code que je n'avais jamais regardé tourner. Playwright et
   Chromium sont pourtant installés, et les harnais s'en servent déjà : rien
   n'empêchait de lancer la page et de la regarder. C'était une paresse de
   méthode, pas une limite technique.

   ─────────────────────────────────────────────────────────────────────────
   USAGE

     node outils/vue.mjs "#/compte"                  → capture la route
     node outils/vue.mjs "#/devis" --large           → 1440 px au lieu de 1194
     node outils/vue.mjs "#/compte" --tel            → 390 px (iPhone)
     node outils/vue.mjs "#/compte" --clic "#monBtn" → clique puis capture
     node outils/vue.mjs "#/compte" --connecte       → simule un compte connecté

   ─────────────────────────────────────────────────────────────────────────
   `--connecte` — VOIR CE QUE VOIT UN CLIENT AUTHENTIFIÉ

   Les écrans du compte sont VIDES sans identité : `renderAccount()` sort
   immédiatement tant que `_currentUser` est nul. Sans cette option, une
   capture de `#/compte` ne montre que des cadres, et ne prouve rien.

   Le faux compte n'est PAS une béquille posée dans le produit : rien n'est
   ajouté à `app.js` ni à `index.html`. On intercepte la requête réseau vers
   `firebase-init.js` et on sert, À LA PLACE, un module qui remplit le MÊME
   contrat (`window.PT_FIREBASE` + événement `pt-firebase-ready`) — la couture
   que le produit expose déjà pour son propre démarrage. Le fichier servi aux
   clients est inchangé, à l'octet près.

   ⚠️ Ce que ça ne prouve pas : que les vraies règles Firestore laissent lire
   ces documents. Les données sont fabriquées ici, pas relues de la base.

   ─────────────────────────────────────────────────────────────────────────
   La capture sort dans `tests/_sortie/` — JAMAIS à la racine du site : quatre
   copies d'écran des espaces client et livreur y ont déjà été servies
   PUBLIQUEMENT (règle des harnais, apprise à la dure).

   ⛔ CE QU'IL NE PROUVE PAS. Une capture montre l'écran d'un navigateur, sur
   une machine, sans réseau externe (les appels Firebase, Stripe et cartes
   sont coupés — sinon la page attend indéfiniment).
   Elle ne dit rien du rendu sur iPad en navigation privée. C'est un
   GARDE-FOU contre le grossier, pas une preuve de conformité.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, RACINE } from '../tests/_socle.mjs';
import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const { chromium } = await playwright();

const args = process.argv.slice(2);
const route = args.find((a) => !a.startsWith('--')) || '#/';
const large = args.includes('--large');
const tel = args.includes('--tel');
const iClic = args.indexOf('--clic');
const clic = iClic !== -1 ? args[iClic + 1] : null;
/* `--vers` : amène un élément dans le champ avant la capture. Indispensable
   pour les zones à défilement PROPRE — le pied de la modale de paiement ne
   sort jamais sur une capture pleine page, il défile à l'intérieur d'elle. */
const iVers = args.indexOf('--vers');
const vers = iVers !== -1 ? args[iVers + 1] : null;
/* `--element` : ne capturer QUE cet élément, au lieu de la page entière. */
const iEl = args.indexOf('--element');
const element = iEl !== -1 ? args[iEl + 1] : null;
const connecte = args.includes('--connecte');
const paiement = args.includes('--paiement');

/* ── `--paiement` : voir le tunnel de carte POUR DE VRAI ──────────────────
   Le pied de la modale n'affiche le fournisseur qu'après que le SERVEUR a dit
   qui encaisse (`data.fournisseur`). Sans réponse d'API, `mentionFournisseur()`
   n'est jamais rappelée et on ne verrait jamais le logo.

   On simule donc la réponse — et RIEN d'autre. Le panier est semé dans
   `localStorage`, puis on suit le vrai parcours : #/devis → « Payer ». C'est
   `openPayModal()` du produit qui s'exécute, pas une copie du balisage.

   ⚠️ Ce que ça ne prouve pas : que le champ carte Revolut se monte. Son SDK
   est coupé avec le reste du réseau externe. On regarde la MISE EN PAGE. */
const FAUX_PAIEMENT = {
  ok: true, clientSecret: 'sandbox', fournisseur: 'revolut',
  urlHebergee: 'https://exemple.invalid/hors-ligne', modeTest: true,
  publicKey: 'sandbox', orderId: 'sandbox'
};

/* Faux `firebase-init.js` : même contrat que le vrai, données inventées.
   Les valeurs sont volontairement LONGUES (email, rue) — c'est ce qui casse
   une grille, pas « Jean ». */
const FAUX_FIREBASE = `
const user = {
  uid: 'demo-compte', email: 'prenom.nom-tres-long@exemple-de-domaine.com',
  displayName: 'Client de démonstration', emailVerified: true,
  getIdToken: () => Promise.resolve('faux-jeton')
};
const profil = {
  name: 'Client de démonstration', email: 'prenom.nom-tres-long@exemple-de-domaine.com',
  phone: '06 90 12 34 56', addrLine1: '127 résidence des Manguiers, bâtiment C',
  addrPostal: '97139', addrCity: 'Les Abymes', territory: '971', avatar: ''
};
const J = 86400000;
/* Lignes réelles : le bandeau dépliable ne se voit qu'avec du détail. Les
   clés sont bidon À DESSEIN — un harnais ne nomme jamais un produit du
   catalogue (dix-huit sont morts pour ça). */
const lignes = [
  { key: 'SANDBOX-1', title: 'Boulonneuse à chocs 18V LXT 700 Nm (machine seule)', price: 248.68, qty: 1 },
  { key: 'SANDBOX-2', title: 'Meuleuse d angle 18V Ø125 mm brushless en coffret', price: 189.9, qty: 2 },
  { key: 'SANDBOX-3', title: 'Coffret 6 douilles à queue Impact', price: 51.32, qty: 1 }
];
const commandes = [
  { items: 3, total: 489.9,  status: 'paid',     date: Date.now() - 2 * J, lines: lignes },
  { items: 1, total: 129,    status: 'pending',  date: Date.now() - 9 * J },
  { items: 2, total: 254.8,  status: 'quote',    date: Date.now() - 21 * J },
  { items: 5, total: 1120.5, status: 'paid',     date: Date.now() - 40 * J }
];
const snap = (d) => ({ data: () => d, exists: () => true, id: 'x' });
const rien = () => ({});
window.PT_FIREBASE = {
  configured: true, auth: { currentUser: user }, db: {},
  onAuthStateChanged: (a, cb) => { setTimeout(() => cb(user), 0); return () => {}; },
  doc: rien, collection: rien, query: rien, orderBy: rien, where: rien, limit: rien,
  getDoc: () => Promise.resolve(snap(profil)),
  setDoc: () => Promise.resolve(), updateDoc: () => Promise.resolve(),
  deleteDoc: () => Promise.resolve(), addDoc: () => Promise.resolve(),
  getDocs: () => Promise.resolve({
    empty: commandes.length === 0, size: commandes.length,
    forEach: (f) => commandes.forEach((c) => f(snap(c)))
  }),
  onSnapshot: () => () => {}, serverTimestamp: () => new Date(),
  signOut: () => Promise.resolve(), updateProfile: () => Promise.resolve(),
  multiFactor: () => ({ enrolledFactors: [] }),
  loadStorage: () => Promise.reject(new Error('hors sandbox'))
};
window.dispatchEvent(new Event('pt-firebase-ready'));
`;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (paiement && p.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(FAUX_PAIEMENT));
    }
    if (p === '/') p = '/index.html';
    const fp = normalize(join(RACINE, p));
    if (!fp.startsWith(RACINE)) { res.writeHead(403); return res.end(); }
    const s = await stat(fp).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(await readFile(fp));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: tel ? { width: 390, height: 844 } : { width: large ? 1440 : 1194, height: 900 },
  deviceScaleFactor: 2
});
/* Réseau externe coupé : sans ça la page attend Firebase et Stripe
   indéfiniment, et on capture un écran de chargement. Même liste que les
   harnais existants — on ne réinvente pas la sienne. */
await ctx.route('**/*', (r) => {
  const url = r.request().url();
  /* `firebase-init.js` est servi depuis NOTRE serveur : il faut l'attraper
     avant la coupure réseau, sinon il part au disque et le vrai module
     tenterait d'atteindre gstatic. */
  if (connecte && /\/firebase-init\.js/.test(url)) {
    return r.fulfill({ status: 200, contentType: 'text/javascript', body: FAUX_FIREBASE });
  }
  return /stripe|revolut|googleapis|gstatic|jsdelivr|coingecko|firebase|api-adresse|osrm|openstreetmap/.test(url)
    ? r.abort() : r.continue();
});

const page = await ctx.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e.message || e)));

if (paiement) {
  /* Le panier est semé AVANT le premier rendu — `addInitScript` se rejoue à
     chaque navigation, mais l'application lit `pt_cart` à son démarrage. La
     référence est volontairement bidon : ⛔ un harnais ne nomme JAMAIS une
     donnée du catalogue (règle des harnais, dix-huit harnais morts pour ça). */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pt_cart', JSON.stringify({
        version: '1',
        items: [{ ref: 'SANDBOX-1', title: 'Article de bac à sable', price: 199.9, qty: 1 }]
      }));
      /* Clé RELUE dans app.js (`ANALYTICS_CONSENT_KEY`), pas devinée : sans
         elle le bandeau cookies reste affiché et masque le pied de la modale,
         qui est précisément ce qu'on vient regarder. */
      localStorage.setItem('pt:analytics-consent', 'denied');
    } catch (_) {}
  });
}

await page.goto(base + '/index.html' + route, { waitUntil: 'domcontentloaded' });
/* ⚠️ `domcontentloaded` et non `commit` : lire le DOM juste après `commit`
   renvoie une page non parsée (piège consigné dans les règles des harnais). */
await page.waitForTimeout(1200);

if (clic) {
  const el = await page.$(clic);
  if (!el) { console.error('⚠️  sélecteur introuvable : ' + clic); }
  else { await el.click(); await page.waitForTimeout(900); }
}

if (paiement) {
  /* Le fournisseur n'est connu qu'une fois la commande créée côté serveur, et
     le serveur n'est appelé qu'une fois l'adresse complète. Sans ce
     remplissage, on regarderait un pied qui n'a jamais reçu sa réponse — et
     c'est exactement l'erreur qu'on vient de payer : croire avoir corrigé le
     texte alors que la valeur par défaut mentait toujours. */
  const champs = {
    '#payAddrName': 'Client de démonstration',
    '#payAddrEmail': 'client@exemple.invalid',
    '#payAddrPhone': '0690123456',
    '#payAddrLine1': '12 rue de démonstration',
    '#payAddrPostal': '97139',
    '#payAddrCity': 'Les Abymes'
  };
  for (const [sel, val] of Object.entries(champs)) {
    const el = await page.$(sel);
    if (!el) { console.error('⚠️  champ introuvable : ' + sel); continue; }
    await el.fill(val);
    await el.dispatchEvent('change');
  }
  await page.waitForTimeout(1600);
}

if (vers) {
  /* ⚠️ `behavior: 'instant'` OBLIGATOIRE : le défilement doux global du site
     fait partir la mesure avant l'arrivée (règle des harnais). */
  const ok = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return false;
    e.scrollIntoView({ behavior: 'instant', block: 'center' });
    return true;
  }, vers);
  if (!ok) console.error('⚠️  sélecteur introuvable : ' + vers);
  await page.waitForTimeout(500);
}

const sortie = join(RACINE, 'tests', '_sortie');
await mkdir(sortie, { recursive: true });
const nom = 'vue' + route.replace(/[^a-z0-9]/gi, '-') + (tel ? '-tel' : '')
  + (connecte ? '-connecte' : '') + (paiement ? '-paiement' : '') + '.png';
const fichier = join(sortie, nom);
if (element) {
  /* Capture d'un SEUL élément : pour regarder un détail — un pied de modale,
     un bouton — sans le noyer dans une page entière illisible. */
  const el = await page.$(element);
  if (!el) {
    console.error('⚠️  sélecteur introuvable : ' + element + ' — capture pleine page à la place.');
    await page.screenshot({ path: fichier, fullPage: true });
  } else {
    await el.screenshot({ path: fichier });
  }
} else {
  await page.screenshot({ path: fichier, fullPage: true });
}

console.log('capture : ' + fichier);
if (erreurs.length) {
  console.log('⛔ ERREURS JAVASCRIPT sur la page (' + erreurs.length + ') :');
  erreurs.slice(0, 5).forEach((e) => console.log('   · ' + e));
} else {
  console.log('aucune erreur JavaScript');
}

await browser.close();
server.close();
