/* =========================================================================
   AUDIT P4 — RÈGLES FIRESTORE, COUVERTURE ET INDEX
   =========================================================================
   POURQUOI CE CONTRÔLE EXISTE
   Le 27/07/2026, le fil de discussion faisait `where('round','==',n)` +
   `orderBy('at')`. Cette combinaison exige un INDEX COMPOSITE que le projet
   n'avait pas → en production la requête aurait échoué (FAILED_PRECONDITION)
   et le chat serait resté muet. **L'émulateur Firestore crée les index à la
   volée : il ne réclame JAMAIS rien.** Aucun test local ne pouvait le voir.

   CONTRÔLE 1 — INDEX COMPOSITES (bloquant)
     Détecte toute requête (navigateur ET serveur) dont la forme exige un index
     composite, et vérifie qu'il figure dans firestore.indexes.json.
     Règles Firestore (documentation officielle) — index composite requis si :
       • une égalité sur A  +  un orderBy sur B ≠ A
       • un filtre d'inégalité sur A  +  un orderBy sur B ≠ A
       • deux champs d'inégalité différents
       • un orderBy sur deux champs ou plus
     (Les égalités multiples seules NE le requièrent PAS : Firestore fusionne
     les index mono-champ.)

   CONTRÔLE 2 — COUVERTURE DES COLLECTIONS
     Toute collection touchée par le code doit avoir un `match` EXPLICITE dans
     firestore.rules. Le filet final `match /{document=**}` refuse déjà tout,
     mais la convention du projet est de déclarer l'intention collection par
     collection — sinon on ne sait plus si une ouverture est voulue ou oubliée.

   CONTRÔLE 3 — RÈGLES SANS TEST
     Toute collection déclarée dans firestore.rules doit être exercée par au
     moins une assertion de scripts/test-rules.js. Une règle sans test est une
     règle dont personne ne sait si elle fait ce qu'elle dit.

   Lancement : node scripts/audit/p4-firestore.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };
const problems = [];

const RULES = read('firestore.rules');
const INDEXES = JSON.parse(read('firestore.indexes.json'));
const APP = read('app.js');

const apiFiles = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => /\.js$/.test(f)).map((f) => 'api/' + f)
  .concat(fs.readdirSync(path.join(ROOT, 'api/_lib')).filter((f) => /\.js$/.test(f)).map((f) => 'api/_lib/' + f));

// ═══ CONTRÔLE 1 — INDEX COMPOSITES ════════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P4.1 — REQUÊTES EXIGEANT UN INDEX COMPOSITE');
LOG('━'.repeat(74));

const RANGE = ['<', '<=', '>', '>=', '!=', 'not-in', 'array-contains-any', 'in'];

// Analyse une requête décrite par ses clauses ; renvoie null ou la raison.
function needsComposite(wheres, orders) {
  const eqFields = wheres.filter((w) => w.op === '==').map((w) => w.field);
  const rangeFields = [...new Set(wheres.filter((w) => RANGE.includes(w.op)).map((w) => w.field))];
  if (orders.length >= 2) return 'tri sur ' + orders.length + ' champs (' + orders.join(', ') + ')';
  if (rangeFields.length >= 2) return 'inégalités sur 2 champs différents (' + rangeFields.join(', ') + ')';
  if (orders.length === 1) {
    const other = [...eqFields, ...rangeFields].filter((f) => f !== orders[0]);
    if (other.length) return 'filtre sur ' + other.join('/') + ' + tri sur ' + orders[0];
  }
  if (rangeFields.length === 1 && eqFields.filter((f) => f !== rangeFields[0]).length) {
    return 'égalité + inégalité sur des champs différents';
  }
  return null;
}

// Index composites déclarés
const declared = (INDEXES.indexes || []).map((ix) =>
  ix.collectionGroup + ':' + (ix.fields || []).map((f) => f.fieldPath).join('+'));
LOG('  index composites déclarés : ' + declared.length + (declared.length ? ' (' + declared.join(', ') + ')' : ''));

const found = [];

// ── Requêtes NAVIGATEUR : fb.query(col, fb.where(…), fb.orderBy(…), …) ─────
const reClientQuery = /(?:_fb|fb)\.query\(([^;]*?)\);/g;
let m;
while ((m = reClientQuery.exec(APP)) !== null) {
  const body = m[1];
  const line = APP.slice(0, m.index).split('\n').length;
  const wheres = [...body.matchAll(/where\(\s*'([^']+)'\s*,\s*'([^']+)'/g)].map((x) => ({ field: x[1], op: x[2] }));
  const orders = [...body.matchAll(/orderBy\(\s*'([^']+)'/g)].map((x) => x[1]);
  const reason = needsComposite(wheres, orders);
  found.push({ where: 'app.js:' + line, wheres, orders, reason, scope: 'navigateur' });
}

// ── Requêtes SERVEUR : chaînes .collection(x).where(...).orderBy(...) ──────
apiFiles.forEach((f) => {
  const src = read(f);
  // Une « chaîne » = tout ce qui suit .collection( ou .collectionGroup( jusqu'au .get()
  const reChain = /\.(collection|collectionGroup)\(\s*'([a-zA-Z_]+)'\s*\)([\s\S]{0,400}?)\.get\(/g;
  let c;
  while ((c = reChain.exec(src)) !== null) {
    const chain = c[3];
    if (!/\.where\(|\.orderBy\(/.test(chain)) continue;
    const line = src.slice(0, c.index).split('\n').length;
    const wheres = [...chain.matchAll(/\.where\(\s*(?:'([^']+)'|[^,]+)\s*,\s*'([^']+)'/g)]
      .map((x) => ({ field: x[1] || '__id__', op: x[2] }));
    const orders = [...chain.matchAll(/\.orderBy\(\s*'([^']+)'/g)].map((x) => x[1]);
    const reason = needsComposite(wheres, orders);
    found.push({ where: f + ':' + line, coll: c[2], wheres, orders, reason, scope: 'serveur' });
  }
});

LOG('  requêtes analysées : ' + found.length
  + ' (' + found.filter((q) => q.scope === 'navigateur').length + ' navigateur, '
  + found.filter((q) => q.scope === 'serveur').length + ' serveur)');

const risky = found.filter((q) => q.reason);
found.forEach((q) => {
  const desc = (q.wheres.map((w) => w.field + w.op).join(' ') + (q.orders.length ? ' tri:' + q.orders.join(',') : '')).trim();
  LOG('   ' + (q.reason ? '⚠️ ' : '✅ ') + q.where.padEnd(26) + (desc || '(sans clause)'));
});

risky.forEach((q) => {
  const key = (q.coll || '') + ':' + [...q.wheres.map((w) => w.field), ...q.orders].join('+');
  const covered = declared.some((d) => d.split(':')[0] === (q.coll || ''));
  if (!covered) {
    problems.push('INDEX COMPOSITE MANQUANT — ' + q.where + ' : ' + q.reason
      + '. Firestore refusera la requête en production (l\'émulateur, lui, ne dira rien).');
  }
});
if (!risky.length) LOG('  ✅ Aucune requête n\'exige d\'index composite.');

// ═══ CONTRÔLE 2 — COUVERTURE DES COLLECTIONS ══════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P4.2 — COUVERTURE : toute collection touchée est-elle déclarée ?');
LOG('━'.repeat(74));

const usedServer = new Set();
apiFiles.forEach((f) => {
  const src = read(f);
  [...src.matchAll(/collection(?:Group)?\(\s*'([a-z_]+)'/g)].forEach((x) => usedServer.add(x[1]));
});
const usedClient = new Set(
  [...APP.matchAll(/collection\((?:_fb|fb)\.db,\s*'([a-z_]+)'/g)].map((x) => x[1])
  .concat([...APP.matchAll(/collection\((?:_fb|fb)\.db,\s*'[a-z_]+',\s*[^,]+,\s*'([a-z_]+)'/g)].map((x) => x[1]))
);
const ruled = new Set([...RULES.matchAll(/match \/([a-z_]+)\/\{/g)].map((x) => x[1]));
ruled.delete('databases');   // vient de `match /databases/{database}/documents` — pas une collection

const undeclared = [...usedServer, ...usedClient].filter((c, i, a) => a.indexOf(c) === i && !ruled.has(c));
LOG('  collections touchées : serveur ' + usedServer.size + ' · navigateur ' + usedClient.size
  + ' · déclarées dans les règles : ' + ruled.size);
if (undeclared.length) {
  problems.push('collections sans `match` explicite (protégées par le seul filet final) : ' + undeclared.join(', '));
  LOG('  ❌ SANS DÉCLARATION EXPLICITE : ' + undeclared.join(', '));
} else LOG('  ✅ Toute collection touchée par le code est déclarée nommément.');

// ═══ CONTRÔLE 3 — RÈGLES SANS TEST ════════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P4.3 — RÈGLES NON COUVERTES PAR UN TEST');
LOG('━'.repeat(74));
const TESTS = read('scripts/test-rules.js');
const untested = [...ruled].filter((c) => !TESTS.includes("'" + c + "/") && !TESTS.includes('/' + c + "'")
  && !new RegExp("['/\\s]" + c + "[/'\\s]").test(TESTS));
LOG('  collections déclarées : ' + ruled.size + ' · exercées par test-rules.js : ' + (ruled.size - untested.length));
if (untested.length) {
  problems.push('collections déclarées mais JAMAIS testées : ' + untested.join(', '));
  LOG('  ❌ DÉCLARÉES MAIS NON TESTÉES : ' + untested.join(', '));
} else LOG('  ✅ Chaque collection déclarée est exercée par au moins une assertion.');

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P4 : Firestore conforme.' : '  ❌ P4 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P4 Firestore] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
