/* =========================================================================
   AUDIT P5 — ARGENT : machine à états, idempotence, taux
   =========================================================================
   Une course engage de l'argent réel (marchandise payée à Pirates Tools) et
   un engagement entre deux personnes. Un état atteignable mais sans issue, ou
   une transition permise à tort, se paie en litiges — pas en tickets.

   CONTRÔLE 1 — SPÉCIFICATION ↔ CODE
     La machine à états est DÉCLARÉE ici, noir sur blanc. Le contrôle extrait
     du code (api/contact.js) le statut écrit par chaque route et la garde qui
     le protège, puis compare aux deux sens : une transition du code absente de
     la spéc, ou une transition de la spéc absente du code, fait échouer.

   CONTRÔLE 2 — ACCESSIBILITÉ ET PIÈGES
     Depuis chaque état non terminal, il doit exister au moins une sortie
     AUTONOME (déclenchable par le client ou le livreur, sans intervention
     humaine de l'exploitant). Un état où l'argent est engagé et dont on ne
     sort que par un email à l'owner est signalé.

   CONTRÔLE 3 — IDEMPOTENCE des écritures d'argent
     Chaque chemin qui encaisse ou confirme doit être rejouable sans effet
     double (create() atomique, claim d'événement, ou sortie anticipée).

   Lancement : node scripts/audit/p5-money.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };
const problems = [];

const CONTACT_FULL = read('api/contact.js');
const CONTACT = CONTACT_FULL.slice(CONTACT_FULL.indexOf('async function handleCourses'));

// ═══ SPÉCIFICATION DÉCLARÉE ═══════════════════════════════════════════════
// `auto` = sortie déclenchable par une partie elle-même (pas par l'exploitant).
const SPEC = [
  { via: 'course-request',      from: ['(création)'],              to: 'en_attente', auto: true,  qui: 'client' },
  { via: 'course-accept',       from: ['en_attente'],              to: 'acceptee',   auto: true,  qui: 'livreur' },
  { via: 'course-goods-paid',   from: ['acceptee'],                to: 'confirmee',  auto: true,  qui: 'client' },
  { via: 'course-release',      from: ['acceptee', 'confirmee'],   to: 'en_attente', auto: true,  qui: 'participant' },
  { via: 'course-accord-accept', from: ['acceptee'],               to: 'confirmee',  auto: true,  qui: 'participant' },
  { via: 'course-cancel',       from: ['en_attente', 'acceptee'],  to: 'annulee',    auto: true,  qui: 'client' },
  { via: 'course-deliver',      from: ['confirmee', 'acceptee'],   to: 'livree',     auto: true,  qui: 'livreur' },
  { via: 'course-confirm',      from: ['livree'],                  to: 'terminee',   auto: true,  qui: 'client' }
];
const TERMINAUX = ['terminee', 'annulee'];

// ═══ CONTRÔLE 1 — le code dit-il la même chose ? ══════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P5.1 — MACHINE À ÉTATS : spécification ↔ code');
LOG('━'.repeat(74));

function blocOf(type) {
  const i = CONTACT.indexOf("body.type === '" + type + "'");
  if (i === -1) return null;
  const j = CONTACT.indexOf("\n  if (body.type === '", i + 10);
  return CONTACT.slice(i, j === -1 ? CONTACT.length : j);
}

LOG('  route                 spéc : depuis            → vers        code');
SPEC.forEach((t) => {
  const b = blocOf(t.via);
  if (!b) { problems.push('route ' + t.via + ' déclarée dans la spéc mais absente du code'); LOG('  ❌ ' + t.via + ' ABSENTE DU CODE'); return; }
  // statut écrit
  const source = t.via === 'course-request' ? read('api/_lib/courses.js') : b;
  const wrote = [...source.matchAll(/status: '([a-z_]+)'|\.status = '([a-z_]+)'/g)].map((x) => x[1] || x[2]);
  const okTo = t.to === '(création)' || wrote.includes(t.to);
  // états acceptés en entrée
  const guardTxt = (b.match(/^.*(?:c\.status|d\.data\(\)\.status).*$/gm) || []).join(' ');
  const froms = t.from.filter((f) => f !== '(création)');
  const okFrom = froms.length === 0 || froms.every((f) => guardTxt.includes("'" + f + "'"));
  const extra = [...guardTxt.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    .filter((s) => ['en_attente', 'acceptee', 'confirmee', 'livree', 'terminee', 'annulee'].includes(s))
    .filter((s) => !froms.includes(s) && s !== t.to);
  const flag = (okTo && okFrom && !extra.length) ? '✅' : '❌';
  LOG('  ' + flag + ' ' + t.via.padEnd(20) + t.from.join('|').padEnd(24) + '→ ' + t.to.padEnd(12)
    + (extra.length ? ' ⚠ accepte aussi : ' + extra.join(',') : ''));
  if (!okTo) problems.push(t.via + ' : la spéc dit « → ' + t.to +' » mais le code n\'écrit pas ce statut');
  if (!okFrom) problems.push(t.via + ' : la spéc autorise depuis ' + froms.join('|') + ' mais la garde du code ne le reflète pas');
  if (extra.length) problems.push(t.via + ' : le code accepte des états NON déclarés dans la spéc (' + extra.join(', ') + ')');
});

// ═══ CONTRÔLE 2 — pièges ══════════════════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P5.2 — ACCESSIBILITÉ : tout état a-t-il une sortie autonome ?');
LOG('━'.repeat(74));
const etats = ['en_attente', 'acceptee', 'confirmee', 'livree', 'terminee', 'annulee'];
etats.forEach((e) => {
  if (TERMINAUX.includes(e)) { LOG('  ⏹  ' + e.padEnd(12) + 'état terminal (aucune sortie attendue)'); return; }
  const sorties = SPEC.filter((t) => t.from.includes(e));
  const autonomes = sorties.filter((t) => t.auto);
  LOG('  ' + (autonomes.length ? '✅' : '❌') + ' ' + e.padEnd(12)
    + (sorties.length ? sorties.map((t) => t.via + '→' + t.to + ' (' + t.qui + ')').join(' · ') : 'AUCUNE'));
  if (!autonomes.length) {
    problems.push('ÉTAT PIÈGE : depuis « ' + e + ' », aucune sortie déclenchable par les parties '
      + '— seule une intervention manuelle de l\'exploitant débloque la situation, alors que de l\'argent est engagé.');
  }
});

// ═══ CONTRÔLE 3 — idempotence ═════════════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P5.3 — IDEMPOTENCE des écritures d\'argent');
LOG('━'.repeat(74));
const GARANTIES = [
  ['création de course (webhook ↔ /merci)', 'api/_lib/courses.js', /ref\.create\(course\)/,
   'doc id = id du PaymentIntent ; create() échoue si le doc existe'],
  ['événements de paiement journalisés', 'api/webhook.js', /collection\('stripe_events'\)/,
   'claim atomique de event.id avant tout effet'],
  ['marchandise payée', 'api/contact.js', /if \(c\.goodsPaid\) return c;/,
   'sortie anticipée si déjà réglée'],
  ['acceptation de course', 'api/contact.js', /runTransaction[\s\S]{0,600}?deja-prise/,
   'transaction : premier arrivé, second refusé']
];
GARANTIES.forEach(([quoi, f, re, comment]) => {
  const present = re.test(read(f));
  LOG('  ' + (present ? '✅' : '❌') + ' ' + quoi.padEnd(38) + comment);
  if (!present) problems.push('idempotence NON constatée : ' + quoi + ' (' + f + ')');
});

// ═══ CONTRÔLE 4 — taux fiscaux ════════════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P5.4 — TAUX DE TVA vs source de vérité fiscale');
LOG('━'.repeat(74));
const PRICING = read('api/_lib/pricing.js');
// Source : docs/METHODE-ENTREPRISE-FISCALITE.md §2 — 8,5 % en 971/972/974,
// TVA non applicable en 973/976.
const ATTENDU = { '971': 0.085, '972': 0.085, '974': 0.085, '973': 0, '976': 0 };
Object.keys(ATTENDU).forEach((code) => {
  const m = PRICING.match(new RegExp("code: '" + code + "'[^}]*tvaRate: ([0-9.]+)"));
  const found = m ? parseFloat(m[1]) : null;
  const ok = found === ATTENDU[code];
  LOG('  ' + (ok ? '✅' : '❌') + ' ' + code + '  attendu ' + (ATTENDU[code] * 100).toFixed(1)
    + ' %   trouvé ' + (found === null ? 'ABSENT' : (found * 100).toFixed(1) + ' %'));
  if (!ok) problems.push('taux de TVA ' + code + ' : attendu ' + ATTENDU[code] + ', trouvé ' + found
    + ' (source : docs/METHODE-ENTREPRISE-FISCALITE.md §2)');
});

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P5 : chaîne argent conforme.' : '  ❌ P5 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P5 argent] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
