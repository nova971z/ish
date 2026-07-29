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

/* ⚠️ DEUX CHEMINS D'AUTHENTIFICATION, et le second est le PLUS SÛR.
   Ajouté le 29/07/2026, après avoir constaté un trou béant : la seule porte de
   sortie du TOTP exigeait la clé de service, or l'user travaille EXCLUSIVEMENT
   sur iPad — aucun terminal, aucun endroit sûr où poser ce fichier. La porte
   de secours existait donc sur le papier et pas dans la réalité. Poser un
   verrou dont on ne peut pas ouvrir la serrure, c'est enfermer.

   1. FIREBASE_SERVICE_ACCOUNT — le JSON, quand on l'a déjà sous la main.
   2. IDENTIFIANTS PAR DÉFAUT (Application Default Credentials) — c'est le
      chemin à privilégier. Dans **Google Cloud Shell** (gratuit, dans le
      navigateur, rien à installer), on est déjà authentifié comme
      propriétaire du projet : AUCUNE clé n'a besoin d'être téléchargée,
      copiée, ni stockée nulle part. Une clé qui n'existe pas ne fuite pas.

   Depuis Cloud Shell :
     git clone <dépôt> && cd pirates-tools && npm i firebase-admin
     node scripts/mfa-unlock.js --check <email> */
var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
var PROJET = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
          || process.env.FIREBASE_PROJECT_ID || 'pirates-tools';

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

if (sa) {
  var creds;
  try { creds = JSON.parse(sa); }
  catch (e) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT n\'est pas un JSON valide :', e.message);
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  console.log('· identité : clé de service (FIREBASE_SERVICE_ACCOUNT)');
} else {
  /* Aucune clé fournie : on tente les identifiants par défaut. C'est le cas
     normal dans Cloud Shell. Si personne n'est authentifié, l'appel suivant
     échouera — et le message ci-dessous dit quoi faire, plutôt que de laisser
     une trace cryptique. */
  try {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJET });
    console.log('· identité : identifiants par défaut (projet ' + PROJET + ')');
  } catch (e) {
    console.error('❌ Aucune identité utilisable.\n'
      + '   Deux façons de s\'authentifier :\n'
      + '   1) Dans Google Cloud Shell (gratuit, rien à installer, AUCUNE clé à manipuler) :\n'
      + '        gcloud auth application-default login   (souvent déjà fait)\n'
      + '   2) Avec la clé de service, si tu l\'as déjà :\n'
      + '        FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/mfa-unlock.js …\n'
      + '   Détail : ' + (e && e.message));
    process.exit(1);
  }
}
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
    var msg = String((e && e.message) || e);
    if (e && e.code === 'auth/user-not-found') {
      console.error('❌ Aucun compte pour « ' + cible +' ».');
    } else if (/fetch a valid Google OAuth2 access token|metadata\.google\.internal|Could not load the default credentials|ENOTFOUND/i.test(msg)) {
      /* ⚠️ Ce cas ne se manifeste PAS à l'initialisation : `applicationDefault()`
         ne vérifie rien tant qu'aucun appel réseau n'est fait. Le message brut
         de Firebase parle de « metadata.google.internal », ce qui n'indique à
         personne quoi faire. On le traduit ici, au seul endroit où il apparaît. */
      console.error('❌ Personne n\'est authentifié — aucune identité utilisable.\n');
      console.error('   Le chemin RECOMMANDÉ, sans jamais manipuler de clé :');
      console.error('     1. ouvrir  https://shell.cloud.google.com  (gratuit, dans le navigateur)');
      console.error('     2. git clone <le dépôt> puis  cd pirates-tools');
      console.error('     3. npm install firebase-admin');
      console.error('     4. node scripts/mfa-unlock.js --check <email>');
      console.error('   Dans Cloud Shell on est déjà authentifié comme propriétaire du projet :');
      console.error('   aucune clé de service n\'est téléchargée, donc aucune ne peut fuiter.\n');
      console.error('   À défaut, avec la clé de service déjà en main :');
      console.error('     FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/mfa-unlock.js …');
    } else {
      console.error('❌ Échec :', msg);
    }
    process.exit(1);
  });
