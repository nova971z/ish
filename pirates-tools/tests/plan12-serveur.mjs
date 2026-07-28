// PLAN 12 — ADRESSE E-MAIL VÉRIFIÉE EXIGÉE (28/07/2026, décision user).
// Le contrôle qui compte est SERVEUR : l'interface n'est jamais la sécurité.
// ⚠️ Sans ces variables, contact.js répond 503 AVANT tout contrôle : les tests
// « pas bloqué » passeraient alors pour la mauvaise raison — un faux vert.
process.env.RESEND_API_KEY = 'test';
process.env.OWNER_EMAIL = 'owner@test.invalid';
process.env.ALLOWED_ORIGINS = 'https://pirates-tools.com';
import { createRequire } from 'node:module';
import { RACINE } from './_socle.mjs';
const require = createRequire(RACINE + '/');
let pass = 0, fail = 0;
const T = (n, ok, x = '') => { ok ? pass++ : fail++; console.log((ok ? '✅' : '❌') + ' ' + n + (x ? ' — ' + x : '')); };

// On remplace le module firebase par un faux : on contrôle exactement ce que
// le jeton déclare, ce qu'aucun test de bout en bout ne permettrait.
const chemin = require.resolve('./api/_lib/firebase.js');
let JETON = null;
require.cache[chemin] = {
  id: chemin, filename: chemin, loaded: true,
  exports: {
    getFirebase: () => ({ db: null, admin: null }),
    verifyUid: async () => (JETON ? JETON.uid : null),
    verifyIdentity: async () => JETON,
    verifyAdmin: async () => false
  }
};

console.log('━━ A. verifyIdentity lit bien la revendication signée ━━');
// (contrôle direct sur le vrai module, hors cache)
delete require.cache[chemin];
const vrai = require('./api/_lib/firebase.js');
T('verifyIdentity est exporté', typeof vrai.verifyIdentity === 'function');
T('verifyUid est conservé (rétrocompatibilité)', typeof vrai.verifyUid === 'function');
T('Sans en-tête Authorization → aucune identité', await vrai.verifyIdentity({ headers: {} }) === null);
T('En-tête malformé → aucune identité', await vrai.verifyIdentity({ headers: { authorization: 'Basic xxx' } }) === null);
// On remet le faux module pour la suite.
require.cache[chemin] = {
  id: chemin, filename: chemin, loaded: true,
  exports: {
    getFirebase: () => ({ db: null, admin: null }),
    verifyUid: async () => (JETON ? JETON.uid : null),
    verifyIdentity: async () => JETON,
    verifyAdmin: async () => false
  }
};
delete require.cache[require.resolve('./api/contact.js')];
const handler = require('./api/contact.js');

// Le harnais n'a pas de base Firestore : les endpoints qui en ont besoin
// répondent « Base non configurée » (503). Ce refus arrive APRÈS le contrôle
// d'adresse — le rencontrer PROUVE donc qu'on l'a franchi. On l'accepte
// explicitement, mais on refuse tout autre 503 (garde-fou en amont de tout).
const aFranchiLeControle = (r) =>
  !(r.corps && r.corps.code === 'email-non-verifie')
  && r.code !== 403
  && (r.code !== 503 || /Base non configurée/.test((r.corps && r.corps.error) || ''));

const appel = async (type, extra) => {
  let code = 0, corps = null;
  const res = {
    status(c) { code = c; return this; },
    json(o) { corps = o; return this; },
    setHeader() { return this; }, end() { return this; }
  };
  await handler(
    { method: 'POST', headers: { origin: 'https://pirates-tools.com' }, body: Object.assign({ type }, extra || {}) },
    res
  );
  return { code, corps };
};

console.log('\n━━ B. Adresse NON vérifiée : les actions engageantes sont refusées ━━');
JETON = { uid: 'u1', email: 'a@b.c', emailVerified: false };
for (const t of ['course-request', 'courier-apply']) {
  const r = await appel(t, { lat: 16.05, lng: -61.76, address: 'X' });
  T('« ' + t +' » est refusé (403)', r.code === 403, 'code=' + r.code);
  T('  le refus est NOMMÉ (code exploitable par l\'écran)',
    r.corps && r.corps.code === 'email-non-verifie', JSON.stringify(r.corps));
  T('  et explique quoi faire', /Vérifie ton adresse/.test((r.corps && r.corps.error) || ''), (r.corps || {}).error);
}

console.log('\n━━ C. La LECTURE reste possible (ne jamais coincer au milieu du gué) ━━');
for (const t of ['course-list', 'courier-status', 'conv-list']) {
  const r = await appel(t);
  T('« ' + t + ' » n\'est PAS bloqué par la vérification',
    aFranchiLeControle(r),
    'code=' + r.code + ' ' + JSON.stringify(r.corps).slice(0, 70));
}
console.log('\n━━ C bis. Une course DÉJÀ engagée reste actionnable ━━');
for (const t of ['course-accord-accept', 'course-cancel', 'course-release']) {
  const r = await appel(t, { id: 'c1' });
  T('« ' + t + ' » n\'est PAS bloqué',
    aFranchiLeControle(r),
    'code=' + r.code + ' ' + JSON.stringify(r.corps).slice(0, 70));
}

console.log('\n━━ D. Adresse vérifiée : plus aucun blocage ━━');
JETON = { uid: 'u1', email: 'a@b.c', emailVerified: true };
for (const t of ['course-request', 'courier-apply']) {
  const r = await appel(t, { lat: 16.05, lng: -61.76, address: 'X' });
  T('« ' + t + ' » n\'est plus refusé pour ce motif',
    aFranchiLeControle(r),
    'code=' + r.code + ' ' + JSON.stringify(r.corps).slice(0, 70));
}

console.log('\n━━ E. Sans jeton du tout : 401, pas 403 ━━');
JETON = null;
const r401 = await appel('course-request', {});
T('Non connecté → 401 « Connexion requise »', r401.code === 401, 'code=' + r401.code);
T('  et pas le message de vérification (on ne confond pas les deux cas)',
  !(r401.corps && r401.corps.code === 'email-non-verifie'), JSON.stringify(r401.corps));

console.log('\n' + (fail ? '❌' : '✅') + ` ${pass}/${pass + fail} assertions serveur`);
process.exit(fail ? 1 : 0);
