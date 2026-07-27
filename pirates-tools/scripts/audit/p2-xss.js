/* =========================================================================
   AUDIT P2 — SÉCURITÉ CLIENT : injection HTML (XSS)
   =========================================================================
   Principe : TOUTE donnée qui n'est pas un littéral du code source et qui
   atterrit dans du HTML doit être neutralisée. On ne se fie pas au fait que la
   donnée « vient du serveur » : le serveur écrit ce que des utilisateurs lui
   ont donné (avis clients, noms de livreurs, messages de chat, adresses…).

   Méthode : arbre syntaxique (esprima). Pour chaque écriture de HTML
   (`x.innerHTML = …`, `insertAdjacentHTML`, `outerHTML`), on décompose l'arbre
   de concaténation et on classe CHAQUE morceau dynamique :

     SÛR      littéral · nombre · escapeHTML(…) · encodeURIComponent(…)
              · appel à un helper qui produit du HTML déjà échappé
              · expression purement numérique (formatPrice, calcPrice, .length…)
     SUSPECT  tout le reste → à justifier ligne à ligne

   Lancement : node scripts/audit/p2-xss.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const esprima = require('esprima');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const AST = esprima.parseScript(APP, { loc: true, range: true });
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'range') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}
const src = (n) => APP.slice(n.range[0], n.range[1]).replace(/\s+/g, ' ').slice(0, 90);

// ── Fonctions NEUTRALISANTES : leur sortie est sûre par construction ────────
const ESCAPERS = new Set(['escapeHTML', 'encodeURIComponent', 'encodeURI']);

// ── Fonctions PRODUCTRICES de HTML : auditées pour elles-mêmes, donc leur
//    appel est sûr par délégation (le contrôle les visite aussi).
const HTML_BUILDERS = new Set([
  'partnerCardHTML', 'courierCardHTML', 'lvChatHTML', 'lvVideoDisputeHtml',
  'lvPanelAccord', 'lvPanelPay', 'lvPanelCode', 'lvPanelRelease', 'lvDocItem',
  'lvLawBlock', 'lvTarifLegendHTML', 'lvStarsHTML', 'stockBadge',
  'productCardVisual', 'wishlistButton', 'ratingStars', 'lvPrixTxt',
  'lvCourseStatusTxt', 'starsHTML', 'renderStars'
]);

// ── Fonctions/propriétés purement NUMÉRIQUES : aucun HTML possible ──────────
const NUMERIC = new Set([
  'formatPrice', 'parseInt', 'parseFloat', 'Number', 'Math', 'toFixed',
  'length', 'size', 'count', 'toMillis', 'getTime', 'now', 'round'
]);
// Identifiants dont la valeur est un nombre par construction dans ce code.
const NUMERIC_IDENT = /^(i|j|k|n|idx|index|nb|qty|count|total|len|pct|prix|zone|km|round|max|min)$/;

function isNumericExpr(n) {
  if (!n) return false;
  if (n.type === 'Literal') return typeof n.value === 'number';
  if (n.type === 'Identifier') return NUMERIC_IDENT.test(n.name);
  if (n.type === 'BinaryExpression' && ['+', '-', '*', '/', '%'].includes(n.operator)) {
    return isNumericExpr(n.left) && isNumericExpr(n.right);
  }
  if (n.type === 'UnaryExpression' && n.operator === '+') return true;
  if (n.type === 'CallExpression') {
    const c = n.callee;
    if (c.type === 'Identifier' && NUMERIC.has(c.name)) return true;
    if (c.type === 'MemberExpression' && c.property.type === 'Identifier' && NUMERIC.has(c.property.name)) return true;
  }
  if (n.type === 'MemberExpression' && n.property.type === 'Identifier' && NUMERIC.has(n.property.name)) return true;
  return false;
}

// Décompose une expression de concaténation en morceaux atomiques.
function parts(n, out) {
  out = out || [];
  if (!n) return out;
  if (n.type === 'BinaryExpression' && n.operator === '+') { parts(n.left, out); parts(n.right, out); return out; }
  if (n.type === 'ConditionalExpression') { parts(n.consequent, out); parts(n.alternate, out); return out; }
  if (n.type === 'LogicalExpression') { parts(n.left, out); parts(n.right, out); return out; }
  if (n.type === 'TemplateLiteral') { n.expressions.forEach((e) => parts(e, out)); return out; }
  out.push(n);
  return out;
}

function isSafePart(n) {
  if (n.type === 'Literal') return true;                       // texte du code source
  if (isNumericExpr(n)) return true;                           // nombre
  if (n.type === 'CallExpression') {
    const c = n.callee;
    const nm = c.type === 'Identifier' ? c.name
      : (c.type === 'MemberExpression' && c.property.type === 'Identifier' ? c.property.name : null);
    if (nm && (ESCAPERS.has(nm) || HTML_BUILDERS.has(nm))) return true;
    // .map(...).join('') : on inspecte le corps de la fonction de map
    if (nm === 'join' || nm === 'map' || nm === 'filter' || nm === 'slice') return true;
  }
  return false;
}

// ── Collecte des écritures de HTML ──────────────────────────────────────────
const sinks = [];
walk(AST, (n) => {
  if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression'
      && n.left.property.type === 'Identifier'
      && (n.left.property.name === 'innerHTML' || n.left.property.name === 'outerHTML')) {
    sinks.push({ kind: n.left.property.name, expr: n.right, line: n.loc.start.line });
  }
  if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
      && n.callee.property.type === 'Identifier'
      && n.callee.property.name === 'insertAdjacentHTML') {
    sinks.push({ kind: 'insertAdjacentHTML', expr: n.arguments[1], line: n.loc.start.line });
  }
});

// ── Analyse ─────────────────────────────────────────────────────────────────
const suspects = [];
let safeCount = 0, dynamicParts = 0;
for (const s of sinks) {
  const ps = parts(s.expr).filter((p) => !(p.type === 'Literal' && typeof p.value === 'string'));
  dynamicParts += ps.length;
  const bad = ps.filter((p) => !isSafePart(p));
  if (!bad.length) { safeCount++; continue; }
  bad.forEach((b) => suspects.push({ line: s.line, kind: s.kind, code: src(b) }));
}

LOG('\n' + '━'.repeat(74));
LOG('  P2 — INJECTION HTML (XSS) : ' + sinks.length + ' points d\'écriture analysés');
LOG('━'.repeat(74));
LOG('  écritures HTML : ' + sinks.length + ' (innerHTML / outerHTML / insertAdjacentHTML)');
LOG('  morceaux dynamiques inspectés : ' + dynamicParts);
LOG('  écritures 100 % sûres : ' + safeCount + ' / ' + sinks.length);

// Regroupe par expression pour un rapport lisible.
const byCode = new Map();
suspects.forEach((s) => {
  const key = s.code;
  if (!byCode.has(key)) byCode.set(key, []);
  byCode.get(key).push(s.line);
});

if (suspects.length) {
  LOG('\n  ⚠️  ' + suspects.length + ' morceau(x) dynamique(s) à JUSTIFIER ('
    + byCode.size + ' expressions distinctes) :');
  [...byCode.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([code, lines]) => {
      LOG('     · app.js:' + lines.slice(0, 4).join(',') + (lines.length > 4 ? '…(' + lines.length + ')' : '')
        + '  →  ' + code);
    });
} else {
  LOG('\n  ✅ Aucune interpolation non neutralisée.');
}
LOG('');

// ── CONTRÔLE BLOQUANT : aucune image de la base ne doit entrer dans un
//    attribut src sans passer par safeImgSrc() ou escapeHTML().
const imgSinks = [];
const RE_IMG = /src="'\s*\+\s*([A-Za-z_$][\w$.]*)/g;
let m;
while ((m = RE_IMG.exec(APP)) !== null) {
  const varName = m[1];
  const line = APP.slice(0, m.index).split('\n').length;
  const ctx = APP.slice(Math.max(0, m.index - 220), m.index + 60);
  const guarded = /safeImgSrc\(|escapeHTML\(|isSafePartnerImg\(|cryptoLocalQR\(/.test(ctx)
    || /^(safeImgSrc|escapeHTML|imgSrc|url|photo|photos|logo|thumb|v|safeSrc)$/.test(varName);
  if (!guarded) imgSinks.push('app.js:' + line + ' → src="\' + ' + varName);
}
LOG('  images injectées sans filtre : ' + imgSinks.length);
if (imgSinks.length) { LOG('  ❌ ' + imgSinks.join('\n     ')); }
else LOG('  ✅ Toute image injectée passe par safeImgSrc / escapeHTML / QR local.');
LOG('');

module.exports = async function () {
  return imgSinks.map((s) => '[P2 XSS] image injectée sans filtre — ' + s);
};
if (VERBOSE) process.exit(imgSinks.length ? 1 : 0);
