/* =========================================================================
   AUDIT P1 — INTÉGRITÉ STATIQUE
   =========================================================================
   Objectif : prouver que le code fait ce qu'il dit, sur 100 % des lignes.
   Méthode : analyse de l'ARBRE SYNTAXIQUE (esprima) — pas de grep approximatif.

   Contrôles :
     1. CONTRAT DOM  — tout id lu par le JS existe (HTML statique ou HTML généré),
                       et tout id du HTML statique est réellement utilisé.
     2. ID UNIQUES   — aucun id dupliqué dans index.html (getElementById en
                       silence sur le premier trouvé = bug invisible).
     3. GRAPHE DES FONCTIONS — fonction appelée mais jamais définie
                       (ReferenceError latent), fonction définie jamais appelée.
     4. GLOBALES IMPLICITES — affectation sans var/let/const (fuite globale).
     5. CONTRAT CSS  — classe utilisée mais jamais définie (le défaut
                       `.btn--primary` de l'étape C1 était exactement ça).

   Lancement : node scripts/audit/p1-static.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const esprima = require('esprima');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const APP = read('app.js');
const HTML = read('index.html');
const CSS = read('styles.css');

// Verbeux en lancement direct ; silencieux quand la CI l'importe (elle ne veut
// que la liste des erreurs, comme les autres contrôles de scripts/ci.js).
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };
let findings = 0;
const problems = [];
const section = (t) => LOG('\n' + '━'.repeat(74) + '\n  ' + t + '\n' + '━'.repeat(74));
const ok = (m) => LOG('  ✅ ' + m);
const bad = (m) => { findings++; problems.push(m); LOG('  ❌ ' + m); };
const warn = (m) => LOG('  ⚠️  ' + m);
const list = (arr, max) => arr.slice(0, max || 40).map((x) => '     · ' + x).join('\n')
  + (arr.length > (max || 40) ? '\n     … et ' + (arr.length - (max || 40)) + ' autres' : '');

// ── Parcours générique de l'AST ──────────────────────────────────────────────
function walk(node, visit, parent) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'range') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit, node));
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

const AST = esprima.parseScript(APP, { loc: true, range: true });

// Tous les littéraux chaîne de app.js (le HTML généré y vit).
const STRINGS = [];
walk(AST, (n) => {
  if (n.type === 'Literal' && typeof n.value === 'string') STRINGS.push({ v: n.value, line: n.loc.start.line });
  if (n.type === 'TemplateLiteral') n.quasis.forEach((q) => STRINGS.push({ v: q.value.cooked || '', line: n.loc.start.line }));
});
const ALL_JS_TEXT = STRINGS.map((s) => s.v).join('\n');

// ═══ 1. CONTRAT DOM ═══════════════════════════════════════════════════════════
section('1. CONTRAT DOM — les identifiants lus par le JS existent-ils ?');

// ids présents dans le HTML statique
const htmlIds = [];
HTML.replace(/\sid="([^"]+)"/g, (_, id) => { htmlIds.push(id); return _; });

// ids créés dynamiquement par le JS (chaînes contenant id="…")
const jsMadeIds = new Set();
ALL_JS_TEXT.replace(/\sid="([A-Za-z0-9_:-]+)"/g, (_, id) => { jsMadeIds.add(id); return _; });
ALL_JS_TEXT.replace(/\sid='([A-Za-z0-9_:-]+)'/g, (_, id) => { jsMadeIds.add(id); return _; });
// …et par AFFECTATION (el.id = 'x') : le bandeau prix (09/08) est créé ainsi
// (createElement + .id) et passait pour « lu mais inexistant ». ALL_JS_TEXT ne
// contient que les LITTÉRAUX : l'affectation se voit dans l'AST, pas dedans.
walk(AST, (n) => {
  if (n.type === 'AssignmentExpression' && n.operator === '='
    && n.left.type === 'MemberExpression' && !n.left.computed
    && n.left.property.type === 'Identifier' && n.left.property.name === 'id'
    && n.right.type === 'Literal' && typeof n.right.value === 'string') {
    jsMadeIds.add(n.right.value);
  }
});

// ids LUS par le JS : getElementById('x'), querySelector('#x'), $('#x')
const readIds = new Map();   // id -> [lignes]
const addRead = (id, line) => {
  if (!readIds.has(id)) readIds.set(id, []);
  readIds.get(id).push(line);
};
let dynamicReads = 0;
walk(AST, (n) => {
  if (n.type !== 'CallExpression') return;
  const c = n.callee;
  const name = c.type === 'MemberExpression' && c.property.type === 'Identifier' ? c.property.name
    : (c.type === 'Identifier' ? c.name : null);
  const a0 = n.arguments[0];
  if (name === 'getElementById') {
    if (a0 && a0.type === 'Literal' && typeof a0.value === 'string') addRead(a0.value, n.loc.start.line);
    else dynamicReads++;
  }
  if (name === 'querySelector' || name === 'querySelectorAll' || name === '$' || name === '$$') {
    if (a0 && a0.type === 'Literal' && typeof a0.value === 'string') {
      const m = a0.value.match(/^#([A-Za-z0-9_-]+)$/);
      if (m) addRead(m[1], n.loc.start.line);
    } else if (name === '$' || name === '$$') dynamicReads++;
  }
});

const htmlIdSet = new Set(htmlIds);
const missing = [];
for (const [id, lines] of readIds) {
  if (!htmlIdSet.has(id) && !jsMadeIds.has(id)) missing.push(id + '  (app.js:' + lines.join(',') + ')');
}
LOG('  ids HTML statiques : ' + htmlIds.length
  + ' · ids générés par JS : ' + jsMadeIds.size
  + ' · ids lus par JS : ' + readIds.size
  + ' · lectures dynamiques (non vérifiables) : ' + dynamicReads);
if (missing.length) { bad('IDENTIFIANTS LUS MAIS INEXISTANTS (' + missing.length + ') :'); LOG(list(missing)); }
else ok('Tout identifiant lu par le JS existe (HTML statique ou généré).');

// ids HTML jamais lus ni ciblés par le CSS → probablement morts
const usedSomewhere = new Set([...readIds.keys()]);
const cssIdRefs = new Set();
CSS.replace(/#([A-Za-z0-9_-]+)/g, (_, id) => { cssIdRefs.add(id); return _; });
const orphanIds = htmlIds.filter((id) => !usedSomewhere.has(id) && !cssIdRefs.has(id)
  && !ALL_JS_TEXT.includes(id) && !new RegExp('["\'`]' + id + '["\'`]').test(APP)
  && !HTML.includes('for="' + id + '"') && !HTML.includes('aria-labelledby="' + id + '"')
  && !HTML.includes('aria-describedby="' + id + '"') && !HTML.includes('aria-controls="' + id + '"')
  && !HTML.includes('href="#' + id + '"'));
if (orphanIds.length) { warn('ids HTML jamais référencés (' + orphanIds.length + ') — candidats au nettoyage :'); LOG(list(orphanIds, 25)); }
else ok('Aucun id HTML orphelin.');

// ═══ 2. ID UNIQUES ════════════════════════════════════════════════════════════
section('2. UNICITÉ DES IDENTIFIANTS HTML');
const dupes = {};
htmlIds.forEach((id) => { dupes[id] = (dupes[id] || 0) + 1; });
const dupList = Object.keys(dupes).filter((k) => dupes[k] > 1).map((k) => k + ' ×' + dupes[k]);
if (dupList.length) { bad('IDENTIFIANTS DUPLIQUÉS (' + dupList.length + ') — getElementById ne verra que le premier :'); LOG(list(dupList)); }
else ok('Les ' + htmlIds.length + ' identifiants de index.html sont uniques.');

// ═══ 3. GRAPHE DES FONCTIONS ══════════════════════════════════════════════════
section('3. GRAPHE DES FONCTIONS de app.js');
const declared = new Map();      // nom -> ligne
const called = new Map();        // nom -> [lignes]
walk(AST, (n) => {
  if (n.type === 'FunctionDeclaration' && n.id) declared.set(n.id.name, n.loc.start.line);
  if ((n.type === 'VariableDeclarator') && n.id.type === 'Identifier' && n.init
      && (n.init.type === 'FunctionExpression' || n.init.type === 'ArrowFunctionExpression')) {
    declared.set(n.id.name, n.loc.start.line);
  }
  if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
    const nm = n.callee.name;
    if (!called.has(nm)) called.set(nm, []);
    called.get(nm).push(n.loc.start.line);
  }
});

// Identifiants connus de l'environnement (navigateur + built-ins) : pas des bugs.
const KNOWN = new Set(['parseInt', 'parseFloat', 'isNaN', 'isFinite', 'String', 'Number', 'Boolean',
  'Array', 'Object', 'Date', 'Math', 'JSON', 'Promise', 'Error', 'RegExp', 'Map', 'Set', 'WeakMap',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'fetch', 'alert', 'confirm', 'prompt', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'IntersectionObserver', 'MutationObserver',
  'ResizeObserver', 'FileReader', 'Image', 'Blob', 'FormData', 'URL', 'URLSearchParams',
  'CustomEvent', 'Event', 'Intl', 'AbortController', 'TextDecoder', 'TextEncoder', 'queueMicrotask',
  'structuredClone', 'require', 'Symbol', 'Proxy', 'Reflect', 'BigInt', 'escape', 'unescape',
  'createImageBitmap', 'OffscreenCanvas', 'matchMedia', 'getComputedStyle', 'atob', 'btoa',
  'Notification', 'WebSocket', 'Worker', 'BroadcastChannel', 'reportError', 'Audio']);

const undefinedCalls = [];
for (const [nm, lines] of called) {
  if (declared.has(nm) || KNOWN.has(nm)) continue;
  // paramètre de fonction / variable locale recevant une fonction : cherché dans tout l'AST
  const isLocal = new RegExp('(?:var|let|const|function)\\s+' + nm + '\\b').test(APP)
    || new RegExp('function\\s*\\([^)]*\\b' + nm + '\\b').test(APP)
    // Paramètre d'une fonction NOMMÉE : `function f(a, cb, c)`. Sans cette
    // ligne, seules les fonctions anonymes voyaient leurs paramètres reconnus,
    // et toute fonction nommée recevant un callback était signalée à tort.
    || new RegExp('function\\s+\\w+\\s*\\([^)]*\\b' + nm + '\\b').test(APP)
    || new RegExp('\\b' + nm + '\\s*(?:,|\\))\\s*(?:\\{|=>)').test(APP);
  if (!isLocal) undefinedCalls.push(nm + '  (app.js:' + lines.slice(0, 3).join(',') + ')');
}
LOG('  fonctions déclarées : ' + declared.size + ' · identifiants appelés : ' + called.size);
if (undefinedCalls.length) { bad('APPELS VERS UNE FONCTION JAMAIS DÉFINIE (' + undefinedCalls.length + ') :'); LOG(list(undefinedCalls)); }
else ok('Aucun appel vers une fonction inexistante.');

// ── DOUBLONS DE DÉCLARATION DANS LA MÊME PORTÉE ──────────────────────────
// Deux `function X()` dans le MÊME corps : la seconde écrase la première en
// silence. Défaut réellement introduit lors de la factorisation de la carte
// produit (P7) : un vestige `function productCardHTML(p) { return
// productCardHTML(p, {...}); }` — une RÉCURSION INFINIE — n'était neutralisé
// que par l'ordre des déclarations. Déplacer du code l'aurait réveillée.
// (Deux fonctions de même nom dans des portées DIFFÉRENTES sont légitimes :
//  openMenu/closeMenu existent en local et au niveau module, sans conflit.)
const dupScope = [];
(function scanScopes(node) {
  if (!node || typeof node.type !== 'string') return;
  const corps = node.type === 'Program' ? node.body
    : (node.type === 'BlockStatement' ? node.body : null);
  if (corps) {
    const vus = new Map();
    corps.forEach((st) => {
      if (st.type !== 'FunctionDeclaration' || !st.id) return;
      if (vus.has(st.id.name)) dupScope.push(st.id.name + '  (app.js:' + vus.get(st.id.name) + ' et ' + st.loc.start.line + ')');
      else vus.set(st.id.name, st.loc.start.line);
    });
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'range') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => scanScopes(c));
    else if (v && typeof v.type === 'string') scanScopes(v);
  }
})(AST);
if (dupScope.length) { bad('FONCTIONS DÉCLARÉES DEUX FOIS DANS LA MÊME PORTÉE (' + dupScope.length + ') — la seconde écrase la première :'); LOG(list(dupScope)); }
else ok('Aucune fonction déclarée deux fois dans une même portée.');

const neverCalled = [];
for (const [nm, line] of declared) {
  if (called.has(nm)) continue;
  // référencée sans être appelée (passée en callback, exposée sur window…) ?
  const refs = (APP.match(new RegExp('\\b' + nm + '\\b', 'g')) || []).length;
  if (refs <= 1) neverCalled.push(nm + '  (app.js:' + line + ')');
}
if (neverCalled.length) { warn('Fonctions définies et JAMAIS référencées (' + neverCalled.length + ') — code mort :'); LOG(list(neverCalled)); }
else ok('Aucune fonction morte.');

// ═══ 4. GLOBALES IMPLICITES ═══════════════════════════════════════════════════
section('4. GLOBALES IMPLICITES (affectation sans var/let/const)');
const declaredNames = new Set();
walk(AST, (n) => {
  if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') declaredNames.add(n.id.name);
  if (n.type === 'FunctionDeclaration' && n.id) declaredNames.add(n.id.name);
  if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
    n.params.forEach((p) => { if (p.type === 'Identifier') declaredNames.add(p.name); });
  }
  if (n.type === 'CatchClause' && n.param && n.param.type === 'Identifier') declaredNames.add(n.param.name);
});
const implicit = [];
walk(AST, (n) => {
  if (n.type !== 'AssignmentExpression' || n.left.type !== 'Identifier') return;
  const nm = n.left.name;
  if (declaredNames.has(nm) || KNOWN.has(nm)) return;
  implicit.push(nm + '  (app.js:' + n.loc.start.line + ')');
});
if (implicit.length) { bad('AFFECTATIONS GLOBALES IMPLICITES (' + implicit.length + ') :'); LOG(list(implicit)); }
else ok('Aucune globale implicite — toutes les variables sont déclarées.');

// ═══ 5. CONTRAT CSS ═══════════════════════════════════════════════════════════
section('5. CONTRAT CSS — classes utilisées mais jamais définies');
const cssClasses = new Set();
CSS.replace(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g, (_, c) => { cssClasses.add(c); return _; });

const usedClasses = new Map();   // classe -> source
const addUse = (c, src) => { if (!usedClasses.has(c)) usedClasses.set(c, src); };
HTML.replace(/\sclass="([^"]+)"/g, (_, cl) => { cl.split(/\s+/).filter(Boolean).forEach((c) => addUse(c, 'index.html')); return _; });
ALL_JS_TEXT.replace(/\sclass="([^"]+)"/g, (_, cl) => {
  cl.split(/\s+/).filter(Boolean).forEach((c) => { if (!c.includes('{') && !c.includes('+')) addUse(c, 'app.js (HTML généré)'); });
  return _;
});
// classList.add('x') / classList.toggle('x')
walk(AST, (n) => {
  if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression') return;
  const p = n.callee.property;
  if (p.type !== 'Identifier' || !['add', 'remove', 'toggle', 'contains'].includes(p.name)) return;
  const o = n.callee.object;
  if (o.type === 'MemberExpression' && o.property.type === 'Identifier' && o.property.name === 'classList') {
    n.arguments.forEach((a) => { if (a.type === 'Literal' && typeof a.value === 'string') addUse(a.value, 'app.js (classList)'); });
  }
});

// Une classe SANS règle n'est un défaut que si elle promet un style qui
// n'existe pas. Ne sont donc PAS des défauts :
//   • les préfixes de concaténation (`abo-page--` + valeur) ;
//   • les blocs BEM dont la famille est stylée (`.lv-tarifs` avec
//     `.lv-tarifs__map` défini) — le bloc sert de racine, pas de style ;
//   • les crochets de sélection JS (`querySelector('.lv-rate__send')`).
const jsHooks = new Set();
walk(AST, (n) => {
  if (n.type !== 'CallExpression') return;
  const c = n.callee;
  const nm = c.type === 'MemberExpression' && c.property.type === 'Identifier' ? c.property.name : null;
  if (nm !== 'querySelector' && nm !== 'querySelectorAll' && nm !== 'closest' && nm !== 'matches') return;
  const a0 = n.arguments[0];
  if (a0 && a0.type === 'Literal' && typeof a0.value === 'string') {
    a0.value.replace(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g, (_, cl) => { jsHooks.add(cl); return _; });
  }
});
const cssFamily = (c) => CSS.includes('.' + c + '__') || CSS.includes('.' + c + '--');

// ── ALLOWLIST JUSTIFIÉE (audit P1, 27/07/2026) ──────────────────────────────
// Une classe sans règle CSS n'est un DÉFAUT que si elle promet un style absent.
// Chaque entrée ci-dessous a été vérifiée dans son contexte et porte sa raison.
// Toute NOUVELLE classe sans règle ni justification fera échouer le contrôle.
const CLASS_OK = {
  'home-products-strip--partners': 'modificateur de .home-products-strip (bloc stylé) — pas de variation voulue',
  'pdp-hero__img-wrap':            'conteneur de mise en page, dimensionné par son enfant .pdp-hero img',
  'acc-form':                      'balise <form> : flux bloc natif, champs stylés individuellement',
  'pj-fieldset--invite':           'modificateur de .pj-fieldset (bloc stylé)',
  'courier-map':                   'second nom sur .pdp-deliv-map (qui porte tout le style) — crochet de lecture',
  'footer-territories':            '<nav> de liens : les <a> du pied de page portent le style',
  'consent-bar__accept':           'porte déjà .btn.primary — sert de crochet de sélection',
  'product-card__img':             'image stylée par .product-card__img-wrap img',
  'devis-qty-minus':               'crochet JS ; le style vient de .devis-qty-btn',
  'devis-qty-plus':                'crochet JS ; le style vient de .devis-qty-btn',
  'lv-tarif--z':                   'préfixe concaténé (lv-tarif--z1..z4, tous définis)',
  'courier-card__ph--none':        'état vide : .courier-card__ph fournit déjà la mise en page',
  'courier-prof__ph--none':        'état vide : .courier-prof__ph fournit déjà la mise en page',
  'en_attente':                    'artefact : valeur de statut concaténée dans un attribut class',
  'basique':                       'artefact : valeur de formule concaténée dans un attribut class',
  'admin-field--inline':           'modificateur de .admin-field (bloc stylé) — admin interne',
  'admin-row__meta':               'élément de .admin-row (bloc stylé) — admin interne',
  'admin-app--dispute':            'modificateur de .admin-app (bloc stylé) — admin interne',
  'admin-stats':                   'conteneur d\'onglet admin, enfants stylés',
  'admin-clients':                 'conteneur d\'onglet admin, enfants stylés',
  'ig-account': 'panneau Instagram (admin interne), enfants stylés',
  'ig-account-info': 'panneau Instagram (admin interne), enfants stylés',
  'ig-token': 'panneau Instagram (admin interne), enfants stylés',
  'ig-token-result': 'panneau Instagram (admin interne), enfants stylés',
  'ig-media': 'panneau Instagram (admin interne), enfants stylés',
  'ig-publish': 'panneau Instagram (admin interne), enfants stylés',
  'ig-insights': 'panneau Instagram (admin interne), enfants stylés',
  'ig-insights-data': 'panneau Instagram (admin interne), enfants stylés',
  'view--active': 'marqueur d\'état sur la vue active — sémantique, aucun style attendu'
};
const undefinedClasses = [];
let ignored = 0;
for (const [c, src] of usedClasses) {
  if (cssClasses.has(c)) continue;
  if (c.endsWith('--') || c.endsWith('__')) { ignored++; continue; }   // préfixe concaténé
  if (cssFamily(c)) { ignored++; continue; }                            // bloc BEM stylé
  if (jsHooks.has(c)) { ignored++; continue; }                          // crochet JS
  if (CLASS_OK[c]) { ignored++; continue; }                             // justifiée (voir CLASS_OK)
  undefinedClasses.push(c + '  [' + src + ']');
}
LOG('  écartées (préfixe concaténé / bloc BEM stylé / crochet JS) : ' + ignored);
LOG('  classes définies en CSS : ' + cssClasses.size + ' · classes utilisées : ' + usedClasses.size);
if (undefinedClasses.length) { bad('CLASSES UTILISÉES SANS AUCUNE RÈGLE CSS (' + undefinedClasses.length + ') :'); LOG(list(undefinedClasses, 60)); }
else ok('Toute classe utilisée a au moins une règle CSS.');

// ── Verdict ──────────────────────────────────────────────────────────────────
LOG('\n' + '═'.repeat(74));
LOG(findings === 0 ? '  ✅ P1 : aucun défaut bloquant.' : '  ❌ P1 : ' + findings + ' catégorie(s) de défaut à traiter.');
LOG('═'.repeat(74) + '\n');
// Branché à la CI : toute régression d'intégrité statique casse le build.
module.exports = async function () {
  return problems.map((m) => '[P1 intégrité statique] ' + m.replace(/\s*:$/, '')
    + ' — détail : node scripts/audit/p1-static.js');
};
if (VERBOSE) process.exit(findings === 0 ? 0 : 1);
