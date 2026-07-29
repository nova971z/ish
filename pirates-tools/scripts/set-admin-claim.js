/* =========================================================
   set-admin-claim.js — Attribue le privilège admin (H6).

   Pose le custom claim Firebase { admin: true } sur un compte, ce qui permet
   à ce compte d'être reconnu comme administrateur par l'API (voie 1 de
   api/_lib/auth.js › requireAdmin), en remplacement du secret partagé.

   PRÉ-REQUIS : la variable d'environnement FIREBASE_SERVICE_ACCOUNT doit
   contenir le JSON du compte de service (le même que sur Vercel).

   USAGE (une seule fois, depuis pirates-tools/) :
     FIREBASE_SERVICE_ACCOUNT="$(cat chemin/service-account.json)" \
       node scripts/set-admin-claim.js ki.legrix@gmail.com
   ou avec un uid :
     … node scripts/set-admin-claim.js --uid <UID>

   APRÈS avoir vérifié que l'accès admin fonctionne EN ÉTANT CONNECTÉ à ce
   compte (sans saisir le secret), tu peux SUPPRIMER la variable ADMIN_SECRET
   sur Vercel pour fermer définitivement le risque du secret en sessionStorage.
   ⚠️ Le porteur du claim doit se DÉCONNECTER/RECONNECTER pour que son token
   contienne le nouveau claim.
   ========================================================= */
'use strict';

var admin = require('firebase-admin');

/* ⚠️ DEUX CHEMINS D'AUTHENTIFICATION — voir scripts/mfa-unlock.js, même motif.
   L'user travaille EXCLUSIVEMENT sur iPad : exiger la clé de service rendait ce
   script inexécutable pour lui, donc la fonctionnalité inatteignable.
   Le chemin recommandé est Google Cloud Shell : on y est déjà authentifié comme
   propriétaire du projet, AUCUNE clé n'est téléchargée — et une clé qui
   n'existe pas ne peut pas fuiter. */
var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
var PROJET = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
          || process.env.FIREBASE_PROJECT_ID || 'pirates-tools';

var arg = process.argv[2];
var isUid = arg === '--uid';
var target = isUid ? process.argv[3] : arg;
if (!target) {
  console.error('Usage: node scripts/set-admin-claim.js <email> | --uid <uid>');
  process.exit(1);
}

if (!admin.apps.length) {
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
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJET });
    console.log('· identité : identifiants par défaut (projet ' + PROJET + ')');
  }
}

/* Traduit l'erreur d'authentification, qui n'apparaît qu'au PREMIER APPEL
   RÉSEAU et pas à l'initialisation. Le message brut de Firebase parle de
   « metadata.google.internal » — il n'indique à personne quoi faire. */
function expliquerIdentite(msg) {
  if (!/fetch a valid Google OAuth2 access token|metadata\.google\.internal|Could not load the default credentials|ENOTFOUND/i.test(msg)) return false;
  console.error('❌ Personne n\'est authentifié — aucune identité utilisable.\n');
  console.error('   Le chemin RECOMMANDÉ, sans jamais manipuler de clé :');
  console.error('     1. ouvrir  https://shell.cloud.google.com  (gratuit, dans le navigateur)');
  console.error('     2. git clone <le dépôt> puis  cd pirates-tools');
  console.error('     3. npm install firebase-admin');
  console.error('     4. node scripts/set-admin-claim.js <email>');
  console.error('   Dans Cloud Shell on est déjà propriétaire du projet : aucune clé');
  console.error('   de service n\'est téléchargée, donc aucune ne peut fuiter.');
  return true;
}

(async function () {
  try {
    var user = isUid
      ? await admin.auth().getUser(target)
      : await admin.auth().getUserByEmail(target);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log('✅ Claim admin posé sur', user.email || user.uid, '(uid ' + user.uid + ').');
    console.log('   → Déconnecte/reconnecte ce compte pour rafraîchir son token,');
    console.log('     puis vérifie l\'accès /admin en étant connecté (sans secret).');
    process.exit(0);
  } catch (e) {
    var msg = String((e && e.message) || e);
    if (!expliquerIdentite(msg)) console.error('❌ Échec :', msg);
    process.exit(1);
  }
})();
