/* =========================================================================
   AUDIT P3 — SÉCURITÉ SERVEUR
   =========================================================================
   Surface réelle : 12 fonctions serverless + 24 sous-routes `body.type`
   (contact.js) + 29 sous-routes `query.type` (admin.js) = 65 points d'entrée.

   CONTRÔLE 1 — COHÉRENCE DU ROUTAGE (bloquant)
     contact.js aiguille par une LISTE de `body.type` en tête de handler, mais
     les gestionnaires vivent plus bas. Les deux peuvent diverger en silence :
     un type implémenté mais absent de la liste tombe dans le formulaire de
     contact et ne s'exécute JAMAIS. C'est arrivé (4 endpoints de l'accord,
     trouvés à l'audit du 27/07/2026) et aucun test ne pouvait le voir, les
     harnais simulant /api/contact. Ce contrôle compare les deux ensembles,
     dans les DEUX sens.

   CONTRÔLE 2 — SOCLE DE CHAQUE FONCTION (bloquant)
     Chaque fichier api/*.js doit : filtrer la méthode HTTP, appliquer le CORS
     (allowlist), et — s'il touche des données — exiger une authentification.

   Lancement : node scripts/audit/p3-endpoints.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const API = path.join(ROOT, 'api');
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };
const problems = [];

const read = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const uniq = (a) => [...new Set(a)].sort();

// ═══ CONTRÔLE 1 — routage ↔ implémentation ════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P3.1 — COHÉRENCE DU ROUTAGE de contact.js');
LOG('━'.repeat(74));

const CONTACT = read('contact.js');
const handlerIdx = CONTACT.indexOf('async function handleCourses');
const dispatch = CONTACT.slice(0, handlerIdx);
const handlers = CONTACT.slice(handlerIdx);

const grab = (txt) => uniq((txt.match(/body\.type === '([a-z-]+)'/g) || [])
  .map((m) => m.replace(/body\.type === '|'/g, '')));

const routed = grab(dispatch);
const implemented = grab(handlers);

const notRouted = implemented.filter((t) => !routed.includes(t));
const notImplemented = routed.filter((t) => !implemented.includes(t)
  // ces types sont traités DANS le bloc d'aiguillage lui-même
  && !['partner-application', 'partner-card-get', 'partner-card-media'].includes(t));

LOG('  types aiguillés : ' + routed.length + ' · types implémentés : ' + implemented.length);
if (notRouted.length) {
  problems.push('types implémentés mais JAMAIS aiguillés (donc morts) : ' + notRouted.join(', '));
  LOG('  ❌ IMPLÉMENTÉS MAIS JAMAIS AIGUILLÉS (code mort en production) : ' + notRouted.join(', '));
}
if (notImplemented.length) {
  problems.push('types aiguillés sans gestionnaire : ' + notImplemented.join(', '));
  LOG('  ❌ AIGUILLÉS SANS GESTIONNAIRE : ' + notImplemented.join(', '));
}
if (!notRouted.length && !notImplemented.length) LOG('  ✅ Routage et implémentation strictement alignés.');

// ═══ CONTRÔLE 2 — socle de chaque fonction ════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P3.2 — SOCLE DES 12 FONCTIONS SERVERLESS');
LOG('━'.repeat(74));

// Niveau d'authentification ATTENDU, décidé et justifié à l'audit.
const EXPECTED = {
  'admin.js':                 { auth: 'admin',   cors: true,  method: true },
  'contact.js':               { auth: 'mixte',   cors: true,  method: true },
  'create-payment-intent.js': { auth: 'public',  cors: true,  method: true },
  'checkout.js':              { auth: 'public',  cors: true,  method: true },
  'newsletter.js':            { auth: 'public',  cors: true,  method: true },
  'events.js':                { auth: 'public',  cors: true,  method: true },
  'products.js':              { auth: 'public',  cors: true,  method: true },
  'health.js':                { auth: 'public',  cors: true,  method: false },
  'instagram.js':             { auth: 'admin',   cors: true,  method: true },
  'test-email.js':            { auth: 'admin',   cors: true,  method: true },
  'cron-report.js':           { auth: 'secret',  cors: false, method: false },
  'webhook.js':               { auth: 'stripe',  cors: false, method: true }
};

const rows = [];
for (const f of Object.keys(EXPECTED)) {
  const src = read(f);
  const exp = EXPECTED[f];
  const hasMethod = /req\.method\s*(!==|===)\s*'[A-Z]+'/.test(src);
  const hasCors = /applyCors\(/.test(src);
  const hasAdmin = /requireAdmin\(/.test(src);
  const hasUid = /verifyUid\(/.test(src);
  const hasSecret = /CRON_SECRET|timingSafeEqual/.test(src);
  /* Vérification de signature du webhook. Deux formes acceptées, et PAS une de
     plus : l'appel direct au SDK (`constructEvent`) ou le passage par la
     couture (`verifierSignature`), qui délègue au fournisseur actif.
     ⚠️ Élargi le 31/07/2026 quand webhook.js est passé derrière la couture.
     L'élargissement est volontairement ÉTROIT : si aucune des deux formes n'est
     présente, le webhook accepte n'importe quelle requête — c'est-à-dire
     n'importe qui peut déclarer un paiement reçu. */
  const hasSig = /constructEvent\(|verifierSignature\(/.test(src);
  const hasRl = /rl\.allow\(/.test(src);

  const authOk = exp.auth === 'admin' ? hasAdmin
    : exp.auth === 'secret' ? (hasSecret || hasAdmin)
    : exp.auth === 'stripe' ? hasSig
    : exp.auth === 'mixte' ? (hasUid || hasAdmin)
    : true;

  if (exp.method && !hasMethod) problems.push(f + ' : aucun filtre de méthode HTTP');
  // NOTE : ne PAS exiger applyCors. Sans lui, aucun en-tête CORS n'est émis et
  // le navigateur bloque tout appel cross-origin : c'est le refus par défaut.
  // applyCors ne sert qu'aux endpoints destinés à être appelés d'une autre
  // origine (allowlist ALLOWED_ORIGINS). Vérifié à l'audit P3 (_lib/http.js).
  if (!authOk) problems.push(f + ' : niveau d\'authentification attendu « ' + exp.auth +' » NON constaté');

  rows.push({
    f, auth: exp.auth,
    method: exp.method ? (hasMethod ? '✅' : '❌') : '—',
    cors: hasCors ? 'allowlist' : 'refus',
    gate: authOk ? '✅' : '❌',
    rl: hasRl ? '✅' : '·'
  });
}
LOG('  fichier                      auth      méthode  CORS  garde  débit');
rows.forEach((r) => LOG('  ' + r.f.padEnd(28) + r.auth.padEnd(9)
  + '   ' + r.method + '      ' + r.cors.padEnd(9) + '  ' + r.gate + '     ' + r.rl));

// ═══ CONTRÔLE 3 — endpoints publics EN ÉCRITURE sans limitation ═══════════
LOG('\n' + '━'.repeat(74));
LOG('  P3.3 — ÉCRITURES PUBLIQUES : limitation de débit');
LOG('━'.repeat(74));
const PUBLIC_WRITE = ['contact.js', 'newsletter.js', 'events.js', 'create-payment-intent.js', 'checkout.js'];
PUBLIC_WRITE.forEach((f) => {
  const src = read(f);
  const n = (src.match(/rl\.allow\(/g) || []).length;
  if (!n) problems.push(f + ' : écriture publique SANS limitation de débit');
  LOG('  ' + f.padEnd(28) + (n ? '✅ ' + n + ' seau(x)' : '❌ aucune limitation'));
});

// ═══ CONTRÔLE 4 — APPARTENANCE (IDOR) sur chaque sous-route de course ═════
// Toute route qui agit sur une course d'après un `id` fourni par le client DOIT
// vérifier que l'appelant est bien partie à cette course. Sans ça, il suffit de
// deviner un id pour agir sur la livraison d'autrui.
LOG('\n' + '━'.repeat(74));
LOG('  P3.4 — APPARTENANCE DES OBJETS (IDOR) sur les routes de course');
LOG('━'.repeat(74));

// Découpe handleCourses en blocs `if (body.type === 'X') { … }`
const blocks = [];
const reBlock = /if \(body\.type === '([a-z-]+)'(?:[^)]*)\) \{/g;
let bm;
while ((bm = reBlock.exec(handlers)) !== null) {
  const start = bm.index;
  const next = reBlock.lastIndex;
  const end = handlers.indexOf("\n  if (body.type === '", next);
  blocks.push({ type: bm[1], body: handlers.slice(start, end === -1 ? handlers.length : end) });
}
// Routes qui n'agissent PAS sur un objet d'autrui : elles écrivent uniquement
// sous l'uid VÉRIFIÉ de l'appelant. L'exemption n'est pas un blanc-seing —
// elle est CONTRÔLÉE plus bas : si l'une d'elles se met à lire un identifiant
// fourni par le client (body.id / body.uid), elle sort de l'exemption et
// redevient un défaut. Sans ça, la liste serait un trou par lequel une vraie
// faille passerait.
const NO_TARGET = ['courier-status', 'courier-profile', 'courier-profile-save',
  'courier-available', 'courier-apply', 'course-request', 'course-list', 'course-create'];
const CIBLE_CLIENT = /body\.(id|uid|courseId|courierUid|artisanUid)\b/;

// Troisième cas légitime : les routes qui n'agissent QUE sur des documents
// ANCRÉS sur l'uid vérifié de l'appelant — soit parce que l'identifiant du
// document est construit à partir de cet uid, soit parce que la requête est
// filtrée dessus. Il n'y a alors pas d'objet d'autrui à protéger.
// ⚠️ Ce n'est PAS une liste de confiance : l'ancrage doit être VISIBLE dans le
// code du bloc, sinon la route ressort comme un défaut. Sans ce troisième cas,
// « conv-open » passait au vert par HASARD — le contrôle générique repérait
// « courierUid === uid », qui est en réalité le garde-fou « ne t'écris pas à
// toi-même », pas une vérification d'appartenance.
const ANCRE_UID = /\buid \+ '_'|=== uid \+ '_'|\.where\('(clientUid|courierUid|artisanUid)', '==', uid\)|\.doc\(uid\)/;
const OWNERSHIP = /artisanUid !== uid|artisanUid === uid|courierUid !== uid|courierUid === uid|pas-participant|pas-ta-course|isCourier|md\.uid !== uid|pi\.metadata\.uid !== uid/;

let idorOk = 0;
blocks.forEach((b) => {
  if (NO_TARGET.includes(b.type)) {
    if (!CIBLE_CLIENT.test(b.body)) { idorOk++; return; }
    // Elle était censée n'agir que sur l'appelant : elle lit désormais un
    // identifiant du client. L'exemption tombe, on exige une vérification.
    if (OWNERSHIP.test(b.body)) { idorOk++; return; }
    problems.push('route ' + b.type + ' : exemptée d\'IDOR car censée n\'agir que sur '
      + 'l\'appelant, mais elle lit un identifiant fourni par le client sans vérifier '
      + 'l\'appartenance. Retire-la de NO_TARGET ou ajoute le contrôle.');
    LOG('  ❌ ' + b.type + ' : exemption caduque (lit un id du client)');
    return;
  }
  if (ANCRE_UID.test(b.body)) { idorOk++; return; }
  if (OWNERSHIP.test(b.body)) { idorOk++; return; }
  problems.push('route ' + b.type + ' : agit sur une course sans vérifier l\'appartenance (IDOR)');
  LOG('  ❌ ' + b.type + ' : AUCUNE vérification d\'appartenance');
});
LOG('  routes de course analysées : ' + blocks.length + ' · appartenance vérifiée : ' + idorOk);
if (idorOk === blocks.length) LOG('  ✅ Toute route agissant sur une course vérifie que l\'appelant en est partie.');

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P3 : socle serveur conforme.' : '  ❌ P3 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P3 serveur] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
