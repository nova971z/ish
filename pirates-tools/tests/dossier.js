const { join, basename } = require('path');
const { RACINE } = require('./_socle.cjs');
/* Le dossier livreur doit être ENREGISTRÉ, et l'espace livreur doit en hériter.
   On appelle la VRAIE fonction exportée par api/contact.js, avec Firebase et
   l'authentification simulés — pour tester la logique, pas le réseau. */
'use strict';
const path = require('path');
const Module = require('module');
const ROOT = RACINE;
process.env.RESEND_API_KEY = 'test'; process.env.OWNER_EMAIL = 'o@x.invalid';

// ── Firestore simulé : un simple objet, mais avec la sémantique merge ────────
const STORE = {};
function docRef(coll, id) {
  const k = coll + '/' + id;
  return {
    get: async () => ({ exists: !!STORE[k], data: () => STORE[k] || {}, id }),
    set: async (v, o) => { STORE[k] = (o && o.merge) ? Object.assign({}, STORE[k] || {}, v) : v; },
    collection: () => ({ add: async () => ({ id: 'x' }) })
  };
}
const db = {
  collection: (c) => ({
    doc: (id) => docRef(c, id),
    add: async (v) => { STORE[c + '/auto'] = v; return { id: 'auto' }; },
    orderBy: () => ({ limit: () => ({ get: async () => ({ forEach: () => {} }) }) }),
    limit: () => ({ get: async () => ({ forEach: () => {} }) })
  })
};
let EMAIL = 'justforwada@icloud.com';
const admin = { auth: () => ({ getUser: async () => ({ email: EMAIL }) }),
                firestore: { FieldValue: { serverTimestamp: () => new Date() } } };

// ── Interception des modules internes ───────────────────────────────────────
const vraiResolve = Module._resolveFilename;
const FAUX = {};
FAUX[path.join(ROOT, 'api/_lib/firebase.js')] = {
  getFirebase: () => ({ admin, db }),
  verifyUid: async (req) => (req.headers.authorization ? 'UID-TEST' : null),
  // verifyIdentity ajoute le 28/07 (plan12 : adresse e-mail verifiee exigee).
  verifyIdentity: async (req) => (req.headers.authorization
    ? { uid: 'UID-TEST', email: 'test@example.test', emailVerified: true } : null)
};
FAUX[path.join(ROOT, 'api/_lib/ratelimit.js')] = { allow: async () => true, clientIp: () => '1.2.3.4' };
const vraiLoad = Module._load;
Module._load = function (req, parent, isMain) {
  try {
    const p = vraiResolve.call(Module, req, parent, isMain);
    if (FAUX[p]) return FAUX[p];
  } catch (_) {}
  return vraiLoad.apply(this, arguments);
};
// Les emails ne doivent PAS partir : on neutralise l'envoi.
const courses = require(path.join(ROOT, 'api/_lib/courses.js'));
courses.sendMail = async () => true;
const handler = require(path.join(ROOT, 'api/contact.js'));

function res() { const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; }; r.json = o => { r.body = o; return r; };
  r.end = () => r; r.setHeader = () => {}; return r; }
async function call(body, auth) {
  const rr = res();
  await handler({ method: 'POST', headers: auth === false ? {} : { authorization: 'Bearer t' }, body }, rr);
  return rr;
}

let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };
const BON = { type: 'courier-apply', vehicle: 'scooter', cylindree: '125', birth: '1990-05-04',
  name: 'Killian Legrix', email: 'k@example.invalid', phone: '0690000000',
  consent: true, filmConsent: true, pieces: { id: 'cni.jpg', siret: 'siret.pdf' } };

(async () => {
  console.log('\n━━ Contrôles refaits par le SERVEUR (le formulaire ne suffit pas) ━━');
  T('sans compte connecté → 401', (await call(BON, false)).code === 401);
  const majeur = { ...BON };
  T('véhicule inconnu → 400', (await call({ ...majeur, vehicle: 'fusee' })).code === 400);
  const auj = new Date(); const ado = new Date(auj.getFullYear() - 15, 0, 1).toISOString().slice(0, 10);
  const r17 = await call({ ...majeur, birth: ado });
  T('moins de 18 ans → REFUSÉ même si le formulaire a dit oui', r17.code === 400, r17.body && r17.body.error);
  T('date de naissance absente → 400', (await call({ ...majeur, birth: '' })).code === 400);
  T('scooter sans cylindrée → 400', (await call({ ...majeur, cylindree: '' })).code === 400);
  T('consentement décoché → 400', (await call({ ...majeur, consent: false })).code === 400);
  T('accord vidéo décoché → 400', (await call({ ...majeur, filmConsent: false })).code === 400);
  T('email invalide → 400', (await call({ ...majeur, email: 'pas-un-email' })).code === 400);

  console.log('\n━━ Le dossier est RÉELLEMENT enregistré ━━');
  const ok = await call(BON);
  T('dossier accepté → 200', ok.code === 200, JSON.stringify(ok.body));
  const cpt = STORE['couriers/UID-TEST'] || {};
  const app = STORE['courier_applications/UID-TEST'] || {};
  T('le VÉHICULE est enregistré sur le compte livreur', cpt.vehicle === 'scooter', 'vehicle=' + cpt.vehicle);
  T('la CYLINDRÉE est enregistrée', cpt.cylindree === '125', 'cylindree=' + cpt.cylindree);
  T('le nom et le téléphone sont enregistrés', cpt.displayName === 'Killian Legrix' && cpt.phone === '0690000000');
  T('le compte passe « en attente de validation »', cpt.kycStatus === 'en_attente', 'kycStatus=' + cpt.kycStatus);
  T('la candidature est visible par l\'admin', app.uid === 'UID-TEST' && app.status === 'en_attente');
  T('les pièces déclarées sont listées', !!(app.pieces && app.pieces.id && app.pieces.id.name === 'cni.jpg'));
  T('l\'âge calculé côté serveur est stocké', app.age >= 18, 'age=' + app.age);

  console.log('\n━━ L\'espace livreur HÉRITE du dossier (le cœur du défaut signalé) ━━');
  const prof = await call({ type: 'courier-profile' });
  const p = prof.body && prof.body.profile;
  T('profil lu → 200', prof.code === 200);
  T('le véhicule est déjà rempli, PLUS de « — choisir — »', p && p.vehicle === 'scooter', 'vehicle=' + (p && p.vehicle));
  T('l\'origine est signalée (repris du dossier)', p && p.vehicleFromDossier === true);
  T('la cylindrée suit aussi', p && p.cylindree === '125');
  T('le nom affiché est pré-rempli', p && p.displayName === 'Killian Legrix');

  console.log('\n━━ LA CHAÎNE COMPLÈTE : plus de mode livreur d\'office ━━');
  // Le dossier vient d'être déposé, mais l'admin n'a rien validé.
  const st1 = await call({ type: 'courier-status' });
  T('compte de test : PAS livreur tant que l\'admin n\'a pas validé',
    st1.body && st1.body.courier === false, 'courier=' + (st1.body && st1.body.courier));
  T('il ne peut PAS accepter de course', (await call({ type: 'course-accept', id: 'x' })).code === 403);
  T('il ne peut PAS publier de fiche livreur',
    (await call({ type: 'courier-profile-save', displayName: 'X' })).code === 403);
  T('il garde son accès CLIENT (déposer une demande de course)',
    (await call({ type: 'course-request', lat: 16.22, lng: -61.38, address: 'x' })).code !== 403);

  // L'admin valide (ce que fait api/admin.js : kycStatus = 'valide').
  STORE['couriers/UID-TEST'].kycStatus = 'valide';
  const st2 = await call({ type: 'courier-status' });
  T('après validation admin : il DEVIENT livreur', st2.body && st2.body.courier === true);
  T('il peut alors publier sa fiche',
    (await call({ type: 'courier-profile-save', displayName: 'Killian', tarifs: {} })).code === 200);

  console.log('\n━━ PIÈCES : exigées pour TOUS, dispensées pour le seul compte de test ━━');
  delete STORE['couriers/UID-TEST']; delete STORE['courier_applications/UID-TEST'];
  const SANS_PIECES = { ...BON, pieces: {} };
  T('compte de test : dossier accepté SANS aucune pièce',
    (await call(SANS_PIECES)).code === 200);
  T('la dispense est TRACÉE dans le dossier',
    STORE['courier_applications/UID-TEST'].piecesBypass === true,
    'manquantes=' + (STORE['courier_applications/UID-TEST'].piecesManquantes || []).length);

  EMAIL = 'quelquun.dautre@example.invalid';       // ← un autre client
  delete STORE['couriers/UID-TEST']; delete STORE['courier_applications/UID-TEST'];
  const rAutre = await call(SANS_PIECES);
  T('AUTRE compte : dossier REFUSÉ sans pièces', rAutre.code === 400, rAutre.body && rAutre.body.error);
  const toutes = {};
  ['id','siret','rcpro','rib','permis','cg','assveh','assmarch','capacite','registre']
    .forEach(k => { toutes[k] = k + '.pdf'; });
  T('AUTRE compte : dossier accepté AVEC toutes les pièces',
    (await call({ ...BON, pieces: toutes })).code === 200);
  T('AUTRE compte : pas de dispense inscrite',
    STORE['courier_applications/UID-TEST'].piecesBypass === false);
  T('AUTRE compte : PAS livreur d\'office non plus',
    (await call({ type: 'courier-status' })).body.courier === false);
  EMAIL = 'justforwada@icloud.com';   // on repasse sur le compte dispensé

  console.log('\n━━ Un dossier DÉJÀ VALIDÉ ne doit pas être rétrogradé ━━');
  delete STORE['courier_applications/UID-TEST'];
  await call(BON);
  STORE['couriers/UID-TEST'].kycStatus = 'valide';
  const r2 = await call({ ...BON, vehicle: 'vae', cylindree: '' });
  T('renvoi du dossier accepté', r2.code === 200);
  T('le statut « valide » est CONSERVÉ', STORE['couriers/UID-TEST'].kycStatus === 'valide',
    'kycStatus=' + STORE['couriers/UID-TEST'].kycStatus);
  T('le nouveau véhicule est bien pris en compte', STORE['couriers/UID-TEST'].vehicle === 'vae');

  console.log('\n' + pass + ' OK / ' + fail + ' KO');
  process.exit(fail ? 1 : 0);
})();
