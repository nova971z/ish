// scripts/check-courses-alertes.js — LES ALERTES DU MODULE COURSES PARTENT.
//
// ⛔ CE QUE CETTE PORTE DÉFEND. Trois fonctions d'alerte et un bloc de
// paiement, tous morts par ReferenceError jusqu'au 08/08/2026 (audit,
// CODE-093/094/095/128/129/130) :
//   · alertCourseAgain lisait un `db` d'aucune portée — 500 APRÈS le commit
//     de la remise en ligne ;
//   · alertCourierApplication : même `db` fantôme, plus un bloc SMS
//     copié-collé qui lisait une `course` inexistante — l'alerte de dossier
//     n'est JAMAIS partie, avalée par un catch vide ;
//   · course-goods-paid écrivait `pi.id`, const d'un AUTRE bloc — AUCUNE
//     course ne pouvait passer à `confirmee`.
//
// La porte EXÉCUTE les trois fonctions d'alerte contre une fausse base et un
// faux réseau : pas de vérification de forme quand on peut vérifier le
// comportement. Le bloc goods-paid, enfoui dans une transaction d'un handler
// authentifié, est vérifié à la SOURCE avec un préalable — son rejeu complet
// vit dans les harnais E2E de courses.
//
// ⚠️ Elle ne nomme AUCUNE donnée du catalogue et ne touche ni réseau ni
// Firestore réels : fetch est remplacé, la db est factice, et tout est
// restauré dans un finally.
'use strict';
var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');

function fausseDb(couriers) {
  return {
    collection: function () {
      return {
        where: function () { return this; },
        limit: function () { return this; },
        get: function () {
          return Promise.resolve({
            forEach: function (cb) { couriers.forEach(function (c) { cb({ data: function () { return c; } }); }); }
          });
        }
      };
    }
  };
}

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-courses-alertes] ' + m); }

  var envAvant = { RESEND_API_KEY: process.env.RESEND_API_KEY, RESEND_FROM: process.env.RESEND_FROM };
  var fetchAvant = global.fetch;
  var envois = [];
  try {
    process.env.RESEND_API_KEY = 'cle-de-porte-jamais-reseau';
    delete process.env.TWILIO_ACCOUNT_SID;   // canal SMS non configuré : silencieux par contrat
    global.fetch = function (url, opts) {
      envois.push({ url: String(url), corps: JSON.parse((opts && opts.body) || '{}') });
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } });
    };
    delete require.cache[require.resolve('../api/_lib/courses.js')];
    var C = require('../api/_lib/courses.js');

    /* ── Les signatures portent bien db ──────────────────────────────────── */
    ok(C.alertCourseAgain.length === 3, 'alertCourseAgain attend (course, id, db) — vu ' + C.alertCourseAgain.length + ' paramètre(s)');
    ok(C.alertCourierApplication.length === 3, 'alertCourierApplication attend (compte, uid, db) — vu ' + C.alertCourierApplication.length);
    ok(C.alertNewCourse.length === 3, 'alertNewCourse attend (course, id, db) — vu ' + C.alertNewCourse.length);

    var db = fausseDb([
      { email: 'livreur-a@exemple.test', phone: '' },
      { email: 'livreur-b@exemple.test', phone: '' }
    ]);
    var course = { zone: 'A', address: '12 rue des Essais', km: 3, date: '2026-08-09' };

    /* ── ① Remise en ligne : s'exécute, et touche les livreurs ───────────── */
    envois.length = 0;
    var e1 = null;
    try { await C.alertCourseAgain(course, 'COURSE-TEST', db); } catch (e) { e1 = e; }
    ok(!e1, 'alertCourseAgain ne jette plus (avant : ReferenceError db) — ' + (e1 && e1.message));
    var dests1 = envois.map(function (x) { return x.corps.to; });
    ok(dests1.indexOf('livreur-a@exemple.test') !== -1 && dests1.indexOf('livreur-b@exemple.test') !== -1,
      'la remise en ligne alerte bien les livreurs validés — destinataires : ' + dests1.join(', '));

    /* ── ② Candidature : s'exécute, et NE FUIT PAS le dossier ────────────── */
    envois.length = 0;
    var e2 = null;
    try {
      await C.alertCourierApplication(
        { displayName: 'Candidat Essai', email: 'candidat@exemple.test', phone: '0690000000', vehicle: 'vae' },
        'UID-TEST', db);
    } catch (e) { e2 = e; }
    ok(!e2, 'alertCourierApplication ne jette plus (avant : deux ReferenceError) — ' + (e2 && e2.message));
    var dests2 = envois.map(function (x) { return x.corps.to; });
    ok(envois.length > 0, 'l\'alerte de dossier part réellement (avant : jamais) — ' + envois.length + ' envoi(s)');
    ok(dests2.indexOf('livreur-a@exemple.test') === -1 && dests2.indexOf('livreur-b@exemple.test') === -1,
      '⛔ DONNÉE PERSONNELLE : le dossier du candidat ne part JAMAIS chez les autres livreurs — destinataires : ' + dests2.join(', '));

    /* ── ③ Nouvelle course : le chemin sain reste sain ───────────────────── */
    envois.length = 0;
    var e3 = null;
    try { await C.alertNewCourse(course, 'COURSE-TEST-2', db); } catch (e) { e3 = e; }
    ok(!e3, 'alertNewCourse fonctionne toujours — ' + (e3 && e3.message));
    ok(envois.length > 0, 'alertNewCourse envoie — ' + envois.length + ' envoi(s)');

    /* ── ④ goods-paid écrit le paiement de SON bloc, à la source ─────────── */
    var src = fs.readFileSync(path.join(RACINE, 'api', 'contact.js'), 'utf8');
    var iBloc = src.indexOf("goodsPaid: true");
    ok(iBloc !== -1, 'PRÉALABLE : le bloc goodsPaid existe dans contact.js — sans lui, rien n\'est vérifié');
    if (iBloc !== -1) {
      var bloc = src.slice(iBloc, iBloc + 400);
      ok(/goodsPaymentIntentId:\s*paye\.id/.test(bloc),
        'goods-paid écrit paye.id (le paiement vérifié de CE bloc)');
      ok(!/\bpi\./.test(bloc),
        '⛔ goods-paid ne référence PLUS `pi` — la const d\'un autre bloc (ReferenceError, CODE-093)');
    }
  } finally {
    global.fetch = fetchAvant;
    if (envAvant.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = envAvant.RESEND_API_KEY;
    if (envAvant.RESEND_FROM === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = envAvant.RESEND_FROM;
    delete require.cache[require.resolve('../api/_lib/courses.js')];
  }
  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-courses-alertes OK');
  }, function (err) {
    console.error('  ❌ [check-courses-alertes] harnais mort : ' + err.message);
    process.exit(1);
  });
}
