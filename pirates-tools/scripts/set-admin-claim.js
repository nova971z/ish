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

var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!sa) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT manquant (JSON du compte de service).');
  process.exit(1);
}

var arg = process.argv[2];
var isUid = arg === '--uid';
var target = isUid ? process.argv[3] : arg;
if (!target) {
  console.error('Usage: node scripts/set-admin-claim.js <email> | --uid <uid>');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
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
    console.error('❌ Échec :', e.message);
    process.exit(1);
  }
})();
