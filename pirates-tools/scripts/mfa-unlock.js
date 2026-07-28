/* =========================================================
   mfa-unlock.js — LA PORTE DE SORTIE du second facteur (TOTP).

   ⚠️ POURQUOI CE SCRIPT EXISTE, ET POURQUOI IL A ÉTÉ ÉCRIT *AVANT* L'INTERFACE
   D'ENRÔLEMENT : le TOTP a une propriété qu'aucune autre fonctionnalité du
   site n'a — s'il se dérègle, l'utilisateur est enfermé DEHORS. Téléphone
   perdu, application désinstallée, horloge déréglée, défaut dans le défi de
   connexion : le mot de passe ne suffit plus, et « mot de passe oublié » ne
   sauve rien puisque le second facteur reste exigé après la réinitialisation.
   Sur le compte ADMIN, cela signifie perdre l'accès à toute l'administration.

   Ce script retire le ou les seconds facteurs d'un compte, avec l'Admin SDK —
   c'est-à-dire depuis l'extérieur du site, sans avoir besoin de s'y connecter.
   C'est le seul chemin qui reste quand tout le reste est verrouillé.

   PRÉ-REQUIS : FIREBASE_SERVICE_ACCOUNT (le JSON du compte de service, le même
   que sur Vercel). Ne JAMAIS le committer ni le coller dans une conversation.

   USAGE (depuis pirates-tools/) :
     # 1) VOIR l'état d'un compte, sans rien modifier :
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
       node scripts/mfa-unlock.js --check justforwada@icloud.com

     # 2) DÉVERROUILLER (retire tous les seconds facteurs) :
     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
       node scripts/mfa-unlock.js justforwada@icloud.com

   On peut désigner le compte par email ou par --uid <UID>.
   ========================================================= */
'use strict';

var admin = require('firebase-admin');

var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT manquant (JSON du compte de service).');
  process.exit(1);
}

var args = process.argv.slice(2);
// --check : mode LECTURE SEULE. Il existe pour qu'on puisse constater l'état
// d'un compte sans risquer de le modifier par erreur — et pour VÉRIFIER après
// coup que le déverrouillage a bien eu lieu (on ne se fie pas au message de
// succès, on relit).
var lectureSeule = args.indexOf('--check') !== -1;
args = args.filter(function (a) { return a !== '--check'; });

var parUid = args[0] === '--uid';
var cible = parUid ? args[1] : args[0];
if (!cible) {
  console.error('❌ Indique le compte : node scripts/mfa-unlock.js [--check] <email>|--uid <UID>');
  process.exit(1);
}

var creds;
try { creds = JSON.parse(sa); }
catch (e) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT n\'est pas un JSON valide :', e.message);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(creds) });
var auth = admin.auth();

function decrire(u) {
  var f = (u.multiFactor && u.multiFactor.enrolledFactors) || [];
  console.log('  compte  : ' + (u.email || '(sans email)') + '  (uid ' + u.uid + ')');
  console.log('  vérifié : ' + (u.emailVerified ? 'oui' : 'NON'));
  if (!f.length) { console.log('  facteurs: AUCUN — ce compte se connecte avec son seul mot de passe.'); return 0; }
  console.log('  facteurs: ' + f.length);
  f.forEach(function (x, i) {
    console.log('    ' + (i + 1) + '. ' + (x.displayName || '(sans nom)') + ' — type ' + x.factorId
      + ' — inscrit le ' + (x.enrollmentTime || '?'));
  });
  return f.length;
}

(parUid ? auth.getUser(cible) : auth.getUserByEmail(cible))
  .then(function (u) {
    console.log((lectureSeule ? '🔎 État actuel' : '🔎 Avant') + ' :');
    var avant = decrire(u);
    if (lectureSeule) { console.log('\nℹ️  Mode --check : RIEN n\'a été modifié.'); return null; }
    if (!avant) {
      console.log('\n✅ Rien à faire : ce compte n\'a aucun second facteur.');
      return null;
    }
    // `enrolledFactors: null` retire TOUS les seconds facteurs du compte.
    return auth.updateUser(u.uid, { multiFactor: { enrolledFactors: null } })
      .then(function () { return auth.getUser(u.uid); })   // on RELIT, on ne suppose pas
      .then(function (apres) {
        console.log('\n🔓 Après :');
        var reste = decrire(apres);
        if (reste) {
          console.error('\n❌ Des facteurs subsistent — le déverrouillage a ÉCHOUÉ.');
          process.exit(1);
        }
        console.log('\n✅ Déverrouillé. Le compte se reconnecte avec son mot de passe seul.');
        console.log('   Il peut réactiver la double authentification quand il veut,');
        console.log('   depuis Mon compte → Sécurité.');
      });
  })
  .catch(function (e) {
    if (e && e.code === 'auth/user-not-found') {
      console.error('❌ Aucun compte pour « ' + cible +' ».');
    } else {
      console.error('❌ Échec :', (e && e.message) || e);
    }
    process.exit(1);
  });
