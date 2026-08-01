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
function firebaseIntegrity() {
  var raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  var out = { present: !!raw, length: raw ? raw.length : 0, parses: false };
  if (!raw) return out;
  var json = null;
  try { json = JSON.parse(raw); out.parses = true; }
  catch (e) { out.parseError = String(e.message).slice(0, 120); return out; }
  var pk = (json && json.private_key) || '';
  out.hasProjectId = !!(json && json.project_id);
  out.hasClientEmail = !!(json && json.client_email);
  out.hasPrivateKey = !!pk;
  out.privateKeyComplete = pk.indexOf('BEGIN PRIVATE KEY') !== -1
    && pk.indexOf('END PRIVATE KEY') !== -1;
  try { out.firestoreReady = !!getFirebase().db; }
  catch (e) { out.firestoreReady = false; out.initError = String(e.message).slice(0, 120); }
  return out;
}

module.exports = function handler(req, res) {
  return res.status(200).json({
    ok: true,
    service: 'Pirates Tools API',
    version: 'v1',
    timestamp: new Date().toISOString(),
    env: {
      // Stripe
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
