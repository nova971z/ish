// GET /api/health — Health check endpoint.
// Reports which env vars are configured (never leaks values).

var getFirebase = require('./_lib/firebase').getFirebase;

// Diagnostic d'INTÉGRITÉ du compte de service Firebase, sans JAMAIS exposer la
// valeur. Vercel masque les variables d'environnement une fois enregistrées :
// impossible de vérifier à l'œil qu'un copier-coller n'a pas été tronqué. Ce
// bloc répond à la seule question qui compte — « la clé est-elle complète et
// exploitable ? » — via des booléens et une longueur, jamais un fragment.
// Une clé saine fait ~2 300 caractères et sa clé privée porte ses deux
// marqueurs BEGIN/END : une troncature saute immédiatement aux yeux.
// ⛔⛔ SÉCURITÉ — LE MESSAGE D'ERREUR DE `JSON.parse` RECOPIE L'ENTRÉE.
// Mesuré sur Node v22.22.2 : `JSON.parse('ZZSECRET_TEMOIN_ABCDEFGHIJKLMNOP')`
// rend « Unexpected token 'Z', "ZZSECRET_T"... is not valid JSON » — soit les
// DIX PREMIERS SIGNES de l'entrée. Ici l'entrée est le compte de service
// Firebase, et ce point d'entrée est PUBLIC, sans authentification. Le cas où
// ça sort est exactement celui pour lequel ce diagnostic existe : un
// copier-coller raté — donc potentiellement décalé sur la clé privée.
// ⚠️ Le message n'est pas un contrat : sa forme change d'une version de Node à
// l'autre. On ne filtre donc pas les guillemets, on ne garde QUE le nombre —
// une position ne peut rien recopier. L'information utile (« ça casse au
// signe N ») survit intacte ; le fragment, lui, ne sort jamais.
function positionErreurJson(e) {
  var m = String((e && e.message) || '').match(/position\s+(\d+)/i);
  return m ? 'JSON invalide à la position ' + m[1] : 'JSON invalide';
}

// Un message d'erreur lisible, débarrassé de tout ce qui peut être un
// fragment de clé : une phrase d'erreur est faite de MOTS séparés d'espaces ;
// une suite de 20 signes sans une seule espace n'est pas un mot, c'est une
// donnée. On la remplace, on ne la tronque pas — tronquer laisse passer.
function messageSansSecret(e) {
  return String((e && e.message) || 'erreur')
    .replace(/\S{20,}/g, '[…]')
    .slice(0, 120);
}

function firebaseIntegrity() {
  var raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  var out = { present: !!raw, length: raw ? raw.length : 0, parses: false };
  if (!raw) return out;
  var json = null;
  try { json = JSON.parse(raw); out.parses = true; }
  catch (e) { out.parseError = positionErreurJson(e); return out; }
  var pk = (json && json.private_key) || '';
  out.hasProjectId = !!(json && json.project_id);
  out.hasClientEmail = !!(json && json.client_email);
  out.hasPrivateKey = !!pk;
  out.privateKeyComplete = pk.indexOf('BEGIN PRIVATE KEY') !== -1
    && pk.indexOf('END PRIVATE KEY') !== -1;
  try { out.firestoreReady = !!getFirebase().db; }
  /* ⛔ MÊME DANGER, AUTRE PORTEUR : ce message vient d'une bibliothèque tierce
     à qui on vient de passer la clé privée. Je ne peux pas prouver qu'aucune
     de ses versions n'en recopie un morceau — alors on ne parie pas. */
  catch (e) { out.firestoreReady = false; out.initError = messageSansSecret(e); }
  return out;
}

// ⛔ QUEL CODE TOURNE ICI ? — la question a coûté deux relevés à l'user, qui a
// testé un parseur déjà corrigé et reçu deux fois la même réponse fausse
// (E-404). Ni le dépôt, ni GitHub, ni la CI ne peuvent y répondre : seule la
// PRODUCTION sait ce que Vercel lui a mis. Vercel expose l'identifiant du
// commit à l'exécution — on le rend, court, à côté de la branche.
// ⚠️ Un identifiant de commit est un ÉTAT, pas un secret : il se partage. La
// règle « aucun secret ne quitte Vercel » vise les suites aléatoires, et rien
// d'autre de l'environnement ne sort d'ici — partout ailleurs, des booléens.
// ⚠️ Hors Vercel ces variables n'existent pas : on rend `null`, jamais une
// invention. « Je ne sais pas » est une réponse, « probablement » n'en est pas.
function build() {
  var sha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  return {
    commit: sha ? String(sha).slice(0, 7) : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    cible: process.env.VERCEL_ENV || null
  };
}

module.exports = function handler(req, res) {
  return res.status(200).json({
    ok: true,
    service: 'Pirates Tools API',
    version: 'v1',
    build: build(),
    timestamp: new Date().toISOString(),
    env: {
      // Revolut (encaissement) — l'étiquette nommait encore l'ancien
      // fournisseur au-dessus de variables qui sont celles de Revolut.
      revolut: !!process.env.REVOLUT_SECRET_KEY,
      webhookSecret: !!process.env.REVOLUT_WEBHOOK_SECRET,
      // Firebase
      firebase: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      // Resend (transactional email)
      resendApiKey: !!process.env.RESEND_API_KEY,
      resendFrom: !!process.env.RESEND_FROM,
      resendAudience: !!process.env.RESEND_AUDIENCE_ID,
      ownerEmail: !!process.env.OWNER_EMAIL,
      // Admin
      adminSecret: !!process.env.ADMIN_SECRET,
      // Meta / Instagram
      metaAppId: !!process.env.META_APP_ID,
      metaAppSecret: !!process.env.META_APP_SECRET,
      metaAccessToken: !!process.env.META_ACCESS_TOKEN,
      // CORS allowlist (empty = same-origin only, the secure default)
      allowedOrigins: !!process.env.ALLOWED_ORIGINS
    },
    // Intégrité du compte de service (booléens + longueur, jamais la valeur).
    firebaseCheck: firebaseIntegrity()
  });
};

/* ⛔ EXPOSÉES POUR ÊTRE GARDÉES, PAS POUR ÊTRE APPELÉES. Le chemin qui mène à
   `initError` demande que le compte de service parse ET que l'initialisation
   Firebase échoue — inatteignable depuis une porte. Tant que le filtre vivait
   à l'intérieur, un sabotage qui le supprimait laissait la porte VERTE : elle
   rassurait sans rien garantir. Même remède que `pwEstGel` : ce qui doit être
   prouvé devient une fonction qu'on peut appeler seule. */
module.exports.messageSansSecret = messageSansSecret;
module.exports.positionErreurJson = positionErreurJson;
