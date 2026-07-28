// Test END-TO-END du VRAI code serveur contre Firestore émulé.
// events.js (écriture agrégats) → admin.js type=stats (lecture summarize).
const fs = require('fs');
const path = require('path');
const ROOT = '/home/user/ish/pirates-tools';

process.env.FIREBASE_SERVICE_ACCOUNT = fs.readFileSync(
  '/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/fake_sa.json', 'utf8');
process.env.ADMIN_SECRET = 'test-secret';
// FIRESTORE_EMULATOR_HOST est posé par `firebase emulators:exec`.
console.log('FIRESTORE_EMULATOR_HOST =', process.env.FIRESTORE_EMULATOR_HOST);

function mockRes() {
  return { _s: 0, _j: null, _ended: false,
    status(s){ this._s = s; return this; },
    json(j){ this._j = j; this._ended = true; return this; },
    end(){ this._ended = true; return this; },
    setHeader(){ return this; } };
}

// Payload IDENTIQUE à ce que le beacon envoie depuis le client.
const beaconBody = {
  events: [
    { event: 'session_start', nv: true },
    { event: 'page_view', route: '/' },
    { event: 'page_view', route: '/catalogue' },
    { event: 'view_item', id: 'makita-dga504z', category: 'Meuleuses' },
    { event: 'add_to_quote', id: 'makita-dga504z', category: 'Meuleuses' },
    { event: 'click', t: 'chip:Meuleuses' },
    { event: 'click', t: 'dock:panier' }
  ],
  consent: true,
  visitorId: 'visitor-abc-123',
  device: 'mobile',
  source: 'instagram'
};

const HUMAN_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const eventsReq = {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'user-agent': HUMAN_UA,
    'x-real-ip': '90.1.2.3',
    'x-vercel-ip-country': 'GP',
    'x-vercel-ip-city': 'Les%20Abymes',
    'x-vercel-ip-latitude': '16.27',
    'x-vercel-ip-longitude': '-61.51'
  },
  body: beaconBody
};

(async () => {
  let pass = 0, fail = 0;
  const check = (n, ok, d) => { console.log((ok ? '✅' : '❌') + ' ' + n + (d ? ' — ' + d : '')); ok ? pass++ : fail++; };

  // 1) events.js : écrire les agrégats
  const eventsHandler = require(path.join(ROOT, 'api/events.js'));
  const res1 = mockRes();
  let threw1 = null;
  try { await eventsHandler(eventsReq, res1); } catch (e) { threw1 = e; }
  check('events.js ne jette pas', !threw1, threw1 && threw1.message);
  check('events.js répond 204', res1._s === 204, 'status=' + res1._s);

  // Envoyer un 2e lot pour vérifier l'incrément cumulatif
  const res1b = mockRes();
  try { await eventsHandler({ ...eventsReq, body: { ...beaconBody, events: [{ event: 'session_start', nv: false }, { event: 'page_view', route: '/' }] } }, res1b); } catch (e) {}

  // 1c) FILTRAGE BOT : une requête avec User-Agent de robot ne doit RIEN écrire.
  const resBot = mockRes();
  await eventsHandler({ ...eventsReq, headers: { ...eventsReq.headers, 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    body: { ...beaconBody, events: [{ event: 'session_start' }, { event: 'page_view', route: '/' }] } }, resBot);
  check('bot (Googlebot) → 204', resBot._s === 204, 'status=' + resBot._s);

  // Laisser Firestore committer
  await new Promise(r => setTimeout(r, 300));

  // 2) Lire DIRECTEMENT Firestore pour voir ce qui a été écrit
  const firebase = require(path.join(ROOT, 'api/_lib/firebase.js'));
  const { db } = firebase.getFirebase();
  check('Firestore (Admin SDK) initialisé', !!db);

  const dailySnap = await db.collection('analytics_daily').get();
  const dailyDocs = [];
  dailySnap.forEach(d => dailyDocs.push({ id: d.id, data: d.data() }));
  console.log('\n--- analytics_daily écrit ---');
  console.log(JSON.stringify(dailyDocs, null, 1));
  check('analytics_daily a au moins 1 doc', dailyDocs.length >= 1, 'docs=' + dailyDocs.length);
  const day = dailyDocs[0] && dailyDocs[0].data;
  check('sessions comptées (=2)', day && day.sessions === 2, 'sessions=' + (day && day.sessions));
  check('pageViews comptées (=3)', day && day.pageViews === 3, 'pageViews=' + (day && day.pageViews));
  check('clics comptés (=2)', day && day.clicks === 2, 'clicks=' + (day && day.clicks));
  check('device.mobile incrémenté', day && day.device && day.device.mobile === 2, JSON.stringify(day && day.device));
  check('source.instagram incrémenté', day && day.source && day.source.instagram === 2, JSON.stringify(day && day.source));

  const prodSnap = await db.collection('analytics_products').get();
  const prodDocs = []; prodSnap.forEach(d => prodDocs.push({ id: d.id, data: d.data() }));
  console.log('\n--- analytics_products ---'); console.log(JSON.stringify(prodDocs, null, 1));
  check('produit makita-dga504z écrit', prodDocs.some(p => p.id === 'makita-dga504z'), 'ids=' + prodDocs.map(p => p.id).join(','));

  const geoSnap = await db.collection('analytics_geo').get();
  const geoDocs = []; geoSnap.forEach(d => geoDocs.push({ id: d.id, data: d.data() }));
  console.log('\n--- analytics_geo ---'); console.log(JSON.stringify(geoDocs, null, 1));
  check('géo GP écrite', geoDocs.some(g => g.id === 'GP'));

  const clkSnap = await db.collection('analytics_clicks').get();
  const clkDocs = []; clkSnap.forEach(d => clkDocs.push({ id: d.id, data: d.data() }));
  check('clics précis écrits (2 cibles)', clkDocs.length === 2, 'docs=' + clkDocs.length);

  // 3) admin.js type=stats : la lecture que fait le dashboard
  const adminHandler = require(path.join(ROOT, 'api/admin.js'));
  const res2 = mockRes();
  await adminHandler({ method: 'GET', query: { type: 'stats' }, headers: { 'x-admin-secret': 'test-secret' } }, res2);
  console.log('\n--- admin.js type=stats (ce que voit le dashboard) ---');
  console.log(JSON.stringify(res2._j && res2._j.stats && res2._j.stats.totals, null, 1));
  check('admin stats répond 200', res2._s === 200, 'status=' + res2._s);
  const totals = res2._j && res2._j.stats && res2._j.stats.totals;
  check('DASHBOARD verrait Visites=2', totals && totals.sessions === 2, 'sessions=' + (totals && totals.sessions));
  check('DASHBOARD verrait Pages vues=3', totals && totals.pageViews === 3, 'pageViews=' + (totals && totals.pageViews));

  console.log(`\n${pass}/${pass + fail} assertions vertes`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR HARNAIS', e); process.exit(2); });
