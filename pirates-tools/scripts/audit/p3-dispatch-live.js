/* =========================================================================
   AUDIT P3 bis — TEST D'AIGUILLAGE RÉEL de api/contact.js
   =========================================================================
   POURQUOI CE TEST EXISTE
   Le 27/07/2026, quatre endpoints (`course-accord-propose|accept|reject`,
   `course-goods-paid`) étaient implémentés dans handleCourses mais ABSENTS de
   la liste d'aiguillage en tête de fichier. En production, l'appel tombait
   dans le formulaire de contact et la fonctionnalité « accord + paiement de la
   marchandise » ne s'exécutait JAMAIS. Aucun test ne pouvait le voir : les
   harnais Playwright SIMULENT /api/contact et ne touchent donc pas l'aiguillage.

   CE QUE FAIT CE TEST
   Il appelle la VRAIE fonction exportée par api/contact.js, avec une requête
   sans jeton d'authentification, pour chaque type connu. Le discriminant est
   net :
     • un type correctement aiguillé  → 401 « Connexion requise » (handleCourses)
     • un type oublié                 → il retombe sur le formulaire de contact
                                        et répond tout autre chose
   Aucun réseau, aucune base : Firebase n'est pas configuré dans ce contexte,
   ce qui suffit — on teste l'AIGUILLAGE, pas la logique métier.

   Lancement : node scripts/audit/p3-dispatch-live.js
   ========================================================================= */
'use strict';

const path = require('path');

// contact.js refuse de démarrer sans ces deux variables (503) : on les pose
// pour atteindre l'aiguillage. Valeurs factices, aucun appel réseau n'est fait.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-key-audit';
process.env.OWNER_EMAIL = process.env.OWNER_EMAIL || 'audit@example.invalid';

const handler = require(path.resolve(__dirname, '..', '..', 'api', 'contact.js'));
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };

// Tous les types censés atteindre handleCourses (auth Bearer obligatoire).
const COURSE_TYPES = [
  'course-create', 'course-list', 'course-accept', 'courier-status',
  'course-rate', 'course-deliver', 'course-confirm', 'course-proof',
  'course-scene', 'course-video', 'course-dispute',
  'courier-profile', 'courier-profile-save', 'courier-available',
  'course-request', 'course-release', 'course-cancel',
  'course-accord-propose', 'course-accord-accept', 'course-accord-reject',
  'course-goods-paid', 'account-erase'
];

function fakeRes() {
  const r = { code: 0, payload: null };
  r.status = function (c) { r.code = c; return r; };
  r.json = function (o) { r.payload = o; return r; };
  r.end = function () { return r; };
  r.setHeader = function () {};
  return r;
}

(async () => {
  const problems = [];
  let ok = 0;

  LOG('\n' + '━'.repeat(74));
  LOG('  P3 bis — AIGUILLAGE RÉEL de api/contact.js (' + COURSE_TYPES.length + ' types)');
  LOG('━'.repeat(74));

  for (const type of COURSE_TYPES) {
    const req = { method: 'POST', headers: {}, body: { type } };
    const res = fakeRes();
    try { await handler(req, res); } catch (e) {
      problems.push(type + ' : exception ' + e.message);
      LOG('  ❌ ' + type.padEnd(24) + ' exception : ' + e.message);
      continue;
    }
    const err = (res.payload && res.payload.error) || '';
    // Signature de handleCourses : 401 + « Connexion requise ».
    const reached = res.code === 401 && /Connexion requise/i.test(err);
    if (reached) { ok++; LOG('  ✅ ' + type.padEnd(24) + ' → 401 Connexion requise (aiguillé)'); }
    else {
      problems.push(type + ' : N\'ATTEINT PAS handleCourses (réponse ' + res.code + ' « ' + err + ' ») — type absent de la liste d\'aiguillage');
      LOG('  ❌ ' + type.padEnd(24) + ' → ' + res.code + ' « ' + err + ' »  ⟵ NON AIGUILLÉ');
    }
  }

  LOG('\n  ' + ok + ' / ' + COURSE_TYPES.length + ' types atteignent bien leur gestionnaire.');
  LOG('═'.repeat(74));
  LOG(problems.length === 0 ? '  ✅ P3 bis : aiguillage conforme.' : '  ❌ P3 bis : ' + problems.length + ' type(s) mort(s).');
  LOG('═'.repeat(74) + '\n');

  module.exports.__result = problems;
  if (VERBOSE) process.exit(problems.length ? 1 : 0);
})();

// Export CI : relance la vérification de façon synchrone pour scripts/ci.js.
module.exports = async function () {
  const problems = [];
  for (const type of COURSE_TYPES) {
    const req = { method: 'POST', headers: {}, body: { type } };
    const res = fakeRes();
    try { await handler(req, res); } catch (e) {
      problems.push('[P3 aiguillage] ' + type + ' : exception ' + e.message);
      continue;
    }
    const err = (res.payload && res.payload.error) || '';
    if (!(res.code === 401 && /Connexion requise/i.test(err))) {
      problems.push('[P3 aiguillage] ' + type + ' n\'atteint pas son gestionnaire (réponse '
        + res.code + ' « ' + err + ' ») — type absent de la liste d\'aiguillage de contact.js');
    }
  }
  return problems;
};
