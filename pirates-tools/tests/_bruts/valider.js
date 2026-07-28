/* « Je valide la demande de livreur et ça ne marche pas ».
   On appelle la VRAIE fonction exportée par api/admin.js. */
'use strict';
const path = require('path');
const Module = require('module');
const ROOT = '/home/user/ish/pirates-tools';
process.env.ADMIN_SECRET = 'secret-de-test';

const STORE = {};
let ECHEC_COURIERS = false;           // simule une écriture qui échoue
function docRef(coll, id) {
  const k = coll + '/' + id;
  return {
    get: async () => ({ exists: !!STORE[k], data: () => STORE[k] || {}, id }),
    set: async (v, o) => {
      if (coll === 'couriers' && ECHEC_COURIERS) throw new Error('Firestore indisponible');
      STORE[k] = (o && o.merge) ? Object.assign({}, STORE[k] || {}, v) : v;
    }
  };
}
const db = { collection: (c) => ({
  doc: (id) => docRef(c, id),
  orderBy: () => ({ limit: () => ({ get: async () => ({ forEach: (f) => {
    Object.keys(STORE).filter(k => k.startsWith(c + '/')).forEach(k =>
      f({ id: k.split('/')[1], data: () => STORE[k] })); } }) }) }),
  limit: () => ({ get: async () => ({ forEach: () => {} }) })
}) };
const admin = { auth: () => ({ verifyIdToken: async () => { throw new Error('no'); } }),
                firestore: { FieldValue: { serverTimestamp: () => new Date() } } };

const vraiResolve = Module._resolveFilename, vraiLoad = Module._load;
const FAUX = {};
FAUX[path.join(ROOT, 'api/_lib/firebase.js')] = { getFirebase: () => ({ admin, db }),
  verifyAdmin: async () => false, verifyUid: async () => null };
Module._load = function (req, parent, isMain) {
  try { const p = vraiResolve.call(Module, req, parent, isMain); if (FAUX[p]) return FAUX[p]; } catch (_) {}
  return vraiLoad.apply(this, arguments);
};
const handler = require(path.join(ROOT, 'api/admin.js'));

function res() { const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; }; r.json = o => { r.body = o; return r; };
  r.end = () => r; r.setHeader = () => {}; return r; }
async function review(uid, status) {
  const rr = res();
  await handler({ method: 'POST', query: { type: 'courier-review' },
    headers: { 'x-admin-secret': 'secret-de-test' }, body: { uid, status } }, rr);
  return rr;
}

let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };

(async () => {
  STORE['courier_applications/UID-A'] = { uid: 'UID-A', name: 'Nova', status: 'en_attente', vehicle: 'scooter' };
  STORE['couriers/UID-A'] = { displayName: 'Nova', kycStatus: 'en_attente' };

  console.log('\n━━ Validation NORMALE ━━');
  const r = await review('UID-A', 'valide');
  T('réponse 200', r.code === 200, JSON.stringify(r.body));
  T('la candidature passe à « valide »', STORE['courier_applications/UID-A'].status === 'valide');
  T('L\'ACCÈS LIVREUR est réellement posé', STORE['couriers/UID-A'].kycStatus === 'valide',
    'kycStatus=' + STORE['couriers/UID-A'].kycStatus);
  T('le serveur CONFIRME l\'effet (il a relu)', r.body && r.body.courierActif === true);

  console.log('\n━━ Refus ━━');
  const r2 = await review('UID-A', 'refuse');
  T('réponse 200', r2.code === 200);
  T('l\'accès livreur est RETIRÉ', STORE['couriers/UID-A'].kycStatus === 'refuse');
  T('le serveur dit que l\'accès n\'est PAS actif', r2.body && r2.body.courierActif === false);

  console.log('\n━━ L\'écriture qui donne l\'accès ÉCHOUE ━━');
  ECHEC_COURIERS = true;
  const r3 = await review('UID-A', 'valide');
  T('l\'administration NE dit PAS « ok » (avant : elle le disait)', r3.code !== 200, 'code=' + r3.code);
  T('le message explique que l\'accès n\'a pas été appliqué',
    !!(r3.body && /accès livreur/i.test(r3.body.error || '')), r3.body && r3.body.error);
  ECHEC_COURIERS = false;

  console.log('\n━━ Garde-fous ━━');
  T('uid vide → 400', (await review('', 'valide')).code === 400);
  T('statut inventé → 400', (await review('UID-A', 'pirate')).code === 400);

  console.log('\n' + pass + ' OK / ' + fail + ' KO');
  process.exit(fail ? 1 : 0);
})();
