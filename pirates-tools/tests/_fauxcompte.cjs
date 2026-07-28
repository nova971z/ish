/* tests/_fauxcompte.cjs — fabrique un FAUX compte de service Firebase.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE FICHIER PLUTÔT QU'UN FICHIER DE DONNÉES VERSIONNÉ

   `pipeline-emulator.js` a besoin d'un compte de service syntaxiquement
   valide : `firebase-admin` refuse de démarrer sans, même contre l'émulateur.
   Le harnais lisait donc un `fake_sa.json` qui vivait dans le scratchpad —
   et ce fichier contient une **clé privée PEM**.

   ⛔ On ne verse PAS une clé privée dans git, même factice :
     · c'est exactement ce que la règle de `tests/README.md` interdit
       (« aucun identifiant réel, aucune clé de service ») ;
     · tout scanner de secrets la signalerait, à juste titre ;
     · et un lecteur qui la découvre dans l'historique n'a aucun moyen de
       savoir, lui, qu'elle est factice.

   On la GÉNÈRE donc à l'exécution. Avantages, tous réels :
     · rien de secret n'entre jamais dans le dépôt ;
     · aucun fichier de données à perdre ou à déplacer ;
     · la clé est neuve à chaque exécution, donc inutilisable ailleurs.

   ⚠️ Le projet nommé ici est `demo-pt`, pas `pirates-tools` : un harnais ne
   doit JAMAIS pouvoir toucher la vraie base, même par accident.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var crypto = require('crypto');

/** @returns {string} le JSON d'un compte de service jetable, prêt pour
 *  `process.env.FIREBASE_SERVICE_ACCOUNT`. */
function fauxCompteDeService(projet) {
  var paire = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  var p = projet || 'demo-pt';
  return JSON.stringify({
    type: 'service_account',
    project_id: p,
    private_key_id: 'faux-genere-a-l-execution',
    private_key: paire.privateKey,
    client_email: 'test@' + p + '.iam.gserviceaccount.com',
    client_id: '1',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test'
  });
}

module.exports = { fauxCompteDeService };
