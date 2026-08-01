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
const connecte = args.includes('--connecte');

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
const commandes = [
  { items: 3, total: 489.9,  status: 'paid',     date: Date.now() - 2 * J },
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

await page.goto(base + '/index.html' + route, { waitUntil: 'domcontentloaded' });
/* ⚠️ `domcontentloaded` et non `commit` : lire le DOM juste après `commit`
   renvoie une page non parsée (piège consigné dans les règles des harnais). */
await page.waitForTimeout(1200);

if (clic) {
  const el = await page.$(clic);
  if (!el) { console.error('⚠️  sélecteur introuvable : ' + clic); }
  else { await el.click(); await page.waitForTimeout(900); }
}

const sortie = join(RACINE, 'tests', '_sortie');
await mkdir(sortie, { recursive: true });
const nom = 'vue' + route.replace(/[^a-z0-9]/gi, '-') + (tel ? '-tel' : '')
  + (connecte ? '-connecte' : '') + '.png';
const fichier = join(sortie, nom);
await page.screenshot({ path: fichier, fullPage: true });

console.log('capture : ' + fichier);
if (erreurs.length) {
  console.log('⛔ ERREURS JAVASCRIPT sur la page (' + erreurs.length + ') :');
  erreurs.slice(0, 5).forEach((e) => console.log('   · ' + e));
} else {
  console.log('aucune erreur JavaScript');
}

await browser.close();
server.close();
