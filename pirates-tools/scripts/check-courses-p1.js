// scripts/check-courses-p1.js — CHACUN VOIT SES COURSES, ET LA RAZ COMPTA VIT.
//
// ⛔ CE QUE CETTE PORTE DÉFEND. Deux P1 du même module, corrigés le
// 08/08/2026 (audit, CODE-096 et CODE-101) :
//   · course-list lisait les 50 DERNIÈRES courses TOUTES CONFONDUES puis
//     filtrait en mémoire — dès que 50 courses existaient au global, un
//     utilisateur aux courses plus anciennes ne voyait PLUS RIEN de ce qui
//     lui appartenait. Le filtre doit vivre DANS la requête.
//   · raz-compta vivait dans le bloc GET d'admin.js et y lisait `body`, qui
//     n'existe pas dans ce bloc — ReferenceError, 500 systématique — pendant
//     que l'écran admin l'appelle en POST et ne trouvait AUCUN gestionnaire.
//
// La porte EXÉCUTE les deux gestionnaires contre une fausse Firestore qui
// HONORE les filtres `where` : 60 courses au global, les 2 de l'utilisateur
// testé sont les PLUS ANCIENNES — l'ancien code (50 dernières) les perdait,
// le nouveau doit les rendre. Pas de vérification de forme quand on peut
// vérifier le comportement.
//
// ⚠️ Elle ne nomme AUCUNE donnée du catalogue et ne touche ni réseau ni
// Firestore réels : firebase, auth et le limiteur de débit sont remplacés
// dans require.cache, et tout est restauré dans un finally.
'use strict';
var path = require('path');

var RACINE = path.join(__dirname, '..');

/* ── Fausse Firestore : les `where` FILTRENT vraiment ───────────────────── */
function fausseFirestore(donnees) {
  // donnees : { nomCollection: { id: objet } }
  var suppressions = [];
  var ecritures = [];
  function snapDe(docs) {
    return {
      empty: docs.length === 0,
      size: docs.length,
      forEach: function (cb) { docs.forEach(cb); }
    };
  }
  function docsDe(nom) {
    var coll = donnees[nom] || {};
    return Object.keys(coll).map(function (id) {
      return { id: id, ref: { _nom: nom, _id: id }, data: function () { return coll[id]; } };
    });
  }
  function requete(nom, filtres, tri, plafond) {
    return {
      where: function (champ, op, val) {
        if (op !== '==') throw new Error('opérateur non simulé : ' + op);
        return requete(nom, filtres.concat([[champ, val]]), tri, plafond);
      },
      orderBy: function (champ, sens) { return requete(nom, filtres, [champ, sens || 'asc'], plafond); },
      limit: function (n) { return requete(nom, filtres, tri, n); },
      get: function () {
        var docs = docsDe(nom).filter(function (d) {
          return filtres.every(function (f) { return d.data()[f[0]] === f[1]; });
        });
        if (tri) {
          docs.sort(function (a, b) {
            var va = a.data()[tri[0]] || 0, vb = b.data()[tri[0]] || 0;
            return tri[1] === 'desc' ? vb - va : va - vb;
          });
        }
        if (plafond != null) docs = docs.slice(0, plafond);
        return Promise.resolve(snapDe(docs));
      }
    };
  }
  var db = {
    _suppressions: suppressions,
    _ecritures: ecritures,
    collection: function (nom) {
      var r = requete(nom, [], null, null);
      r.doc = function (id) {
        return {
          get: function () {
            var coll = donnees[nom] || {};
            var present = Object.prototype.hasOwnProperty.call(coll, id);
            return Promise.resolve({ exists: present, data: function () { return coll[id]; } });
          },
          set: function (obj) { ecritures.push({ collection: nom, id: id, obj: obj }); return Promise.resolve(); }
        };
      };
      return r;
    },
    batch: function () {
      var lot = [];
      return {
        delete: function (ref) { lot.push(ref); },
        commit: function () {
          lot.forEach(function (ref) {
            suppressions.push(ref._nom + '/' + ref._id);
            delete donnees[ref._nom][ref._id];
          });
          return Promise.resolve();
        }
      };
    }
  };
  return db;
}

function fauxRes() {
  var r = { code: 0, corps: null };
  r.status = function (c) { r.code = c; return r; };
  r.json = function (o) { r.corps = o; return r; };
  r.setHeader = function () { return r; };
  r.end = function () { return r; };
  return r;
}

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-courses-p1] ' + m); }

  var envAvant = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
  };
  var cheminFirebase = require.resolve(path.join(RACINE, 'api', '_lib', 'firebase.js'));
  var cheminRl = require.resolve(path.join(RACINE, 'api', '_lib', 'ratelimit.js'));
  var cheminAuth = require.resolve(path.join(RACINE, 'api', '_lib', 'auth.js'));
  var cheminContact = require.resolve(path.join(RACINE, 'api', 'contact.js'));
  var cheminAdmin = require.resolve(path.join(RACINE, 'api', 'admin.js'));
  var cachesAvant = {};
  [cheminFirebase, cheminRl, cheminAuth, cheminContact, cheminAdmin].forEach(function (c) {
    cachesAvant[c] = require.cache[c];
    delete require.cache[c];
  });

  try {
    process.env.RESEND_API_KEY = 'cle-de-porte-jamais-reseau';
    process.env.OWNER_EMAIL = 'proprietaire@exemple.invalid';
    process.env.ALLOWED_ORIGINS = 'https://exemple-porte.invalid';

    /* ── ① course-list : 60 courses au global, les 2 du compte sont les plus
       ANCIENNES — l'ancien code (50 dernières toutes confondues) les perdait */
    var UID = 'compte-de-porte';
    var courses = {};
    // Les 2 de l'utilisateur, créées EN PREMIER (createdAt les plus petits).
    courses['ma-commande'] = { artisanUid: UID, status: 'acceptee', createdAt: 1, code: '123456' };
    courses['ma-tournee'] = { courierUid: UID, status: 'acceptee', createdAt: 2 };
    // 58 courses d'autres comptes par-dessus, dont 3 en attente.
    for (var i = 0; i < 58; i++) {
      courses['autre-' + i] = {
        artisanUid: 'autrui-' + i, status: i < 3 ? 'en_attente' : 'acceptee', createdAt: 10 + i
      };
    }
    var db1 = fausseFirestore({
      courses: courses,
      couriers: {} // pas de dossier livreur : isCourier = false, dispo hors sujet
    });
    db1.collection('couriers'); // (l'accès passe par doc().get(), exists=false)

    require.cache[cheminFirebase] = {
      id: cheminFirebase, filename: cheminFirebase, loaded: true,
      exports: {
        getFirebase: function () {
          return {
            db: db1,
            admin: { auth: function () { return { getUser: function () { return Promise.resolve({ email: 'porte@exemple.invalid' }); } }; } }
          };
        },
        verifyUid: function () { return Promise.resolve(UID); },
        verifyIdentity: function () { return Promise.resolve({ uid: UID, email: 'porte@exemple.invalid', emailVerified: true }); },
        verifyAdmin: function () { return Promise.resolve(false); }
      }
    };
    require.cache[cheminRl] = {
      id: cheminRl, filename: cheminRl, loaded: true,
      exports: { allow: function () { return Promise.resolve(true); }, clientIp: function () { return '127.0.0.1'; } }
    };
    var contact = require(cheminContact);

    var res1 = fauxRes();
    await contact(
      { method: 'POST', headers: { origin: 'https://exemple-porte.invalid' }, body: { type: 'course-list' } },
      res1
    );
    ok(res1.code === 200, 'course-list répond 200 — vu ' + res1.code + ' ' + JSON.stringify(res1.corps).slice(0, 120));
    var mine = (res1.corps && res1.corps.mine) || [];
    var ids = mine.map(function (c) { return c.id; }).sort();
    ok(mine.length === 2 && ids[0] === 'ma-commande' && ids[1] === 'ma-tournee',
      'sur 60 courses au global, le compte reçoit SES 2 courses (les plus anciennes) — vu : ' + JSON.stringify(ids));
    var maCommande = mine.filter(function (c) { return c.id === 'ma-commande'; })[0];
    ok(maCommande && maCommande.code === '123456',
      'le client voit le code de SA course');

    /* ── ② raz-compta : GET refusé fort, POST essai puis effacement ───────── */
    var compta = {
      payments: { p1: { montantCents: 100 }, p2: { montantCents: 200 } },
      charges: { c1: { montantCents: 50 } },
      refunds: {},
      stripe_events: { e1: {} }
    };
    var db2 = fausseFirestore(compta);
    require.cache[cheminFirebase].exports.getFirebase = function () { return { db: db2, admin: {} }; };
    require.cache[cheminAuth] = {
      id: cheminAuth, filename: cheminAuth, loaded: true,
      exports: {
        requireAdmin: function () { return Promise.resolve(null); },
        requireWatch: function () { return Promise.resolve(null); }
      }
    };
    var admin = require(cheminAdmin);

    var resGet = fauxRes();
    await admin({ method: 'GET', headers: {}, query: { type: 'raz-compta' } }, resGet);
    ok(resGet.code === 400, 'GET raz-compta rend 400 (plus jamais 500) — vu ' + resGet.code + ' ' + JSON.stringify(resGet.corps).slice(0, 120));
    ok(/POST uniquement/.test((resGet.corps && resGet.corps.error) || ''),
      'le refus GET dit quoi faire (POST uniquement) — vu : ' + JSON.stringify(resGet.corps));
    ok(db2._suppressions.length === 0, 'un GET ne supprime RIEN — vu ' + db2._suppressions.length + ' suppression(s)');

    var resEssai = fauxRes();
    await admin({ method: 'POST', headers: {}, query: { type: 'raz-compta' }, body: {} }, resEssai);
    ok(resEssai.code === 200 && resEssai.corps && resEssai.corps.essai === true,
      'POST sans confirmer = ESSAI (200, rien de supprimé) — vu ' + resEssai.code + ' ' + JSON.stringify(resEssai.corps).slice(0, 120));
    ok(resEssai.corps && resEssai.corps.compte && resEssai.corps.compte.payments === 2,
      'l\'essai COMPTE avant de demander confirmation — vu : ' + JSON.stringify((resEssai.corps || {}).compte));
    ok(db2._suppressions.length === 0, 'l\'essai ne supprime RIEN — vu ' + db2._suppressions.length + ' suppression(s)');

    var resRaz = fauxRes();
    await admin({ method: 'POST', headers: {}, query: { type: 'raz-compta' }, body: { confirmer: 'OUI' } }, resRaz);
    ok(resRaz.code === 200 && resRaz.corps && resRaz.corps.essai === false,
      'POST confirmer:OUI efface (200, essai:false) — vu ' + resRaz.code + ' ' + JSON.stringify(resRaz.corps).slice(0, 120));
    ok(resRaz.corps && resRaz.corps.efface && resRaz.corps.efface.payments === 2 && resRaz.corps.efface.charges === 1,
      'le compte rendu d\'effacement est exact — vu : ' + JSON.stringify((resRaz.corps || {}).efface));
    ok(db2._suppressions.length === 4, 'les 4 écritures comptables sont effacées — vu ' + db2._suppressions.length);
    var invoiceRaz = db2._ecritures.filter(function (e) { return e.collection === 'config' && e.id === 'invoice'; });
    ok(invoiceRaz.length === 1 && invoiceRaz[0].obj && invoiceRaz[0].obj.last === 0,
      'le compteur de factures est remis à 0');
  } finally {
    [cheminFirebase, cheminRl, cheminAuth, cheminContact, cheminAdmin].forEach(function (c) {
      if (cachesAvant[c] === undefined) delete require.cache[c];
      else require.cache[c] = cachesAvant[c];
    });
    if (envAvant.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = envAvant.RESEND_API_KEY;
    if (envAvant.OWNER_EMAIL === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = envAvant.OWNER_EMAIL;
    if (envAvant.ALLOWED_ORIGINS === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = envAvant.ALLOWED_ORIGINS;
  }
  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-courses-p1 OK');
  }, function (err) {
    console.error('  ❌ [check-courses-p1] harnais mort : ' + err.message);
    process.exit(1);
  });
}
