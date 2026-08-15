// scripts/extraire-admin.js — SORT L'ADMIN DU BUNDLE VISITEUR (SEO ordre 9 / D-120).
//
// app.js = source DEV COMPLÈTE (jamais servie ; toutes les portes la scrutent).
// Ce script en génère DEUX fichiers servis :
//   · app.visitor.js  = bundle VISITEUR (fonctions admin RETIRÉES + amorces
//                       de chargement paresseux + contexte partagé exposé) ;
//   · admin.bundle.js = les fonctions admin, chargées seulement sur #/admin.
//
// ⛔ AUCUN octet d'admin n'est téléchargé par un visiteur normal.
// La coupe et la réécriture passent par l'AST (esprima/estraverse/escodegen) —
// jamais à la main (protocole §1.4). Prouvé sûr : MESURÉ zéro « shadow »
// (aucune fonction admin ne redéclare localement un nom partagé), donc le
// renommage aveugle des symboles partagés → A.<nom> est correct.
//
//   node scripts/extraire-admin.js            (re)génère app.visitor.js + admin.bundle.js
//   node scripts/extraire-admin.js --verifie  porte CI (à jour + zéro admin visiteur)
'use strict';
var fs = require('fs');
var path = require('path');
var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');

var RACINE = path.join(__dirname, '..');
// app.js reste la SOURCE COMPLÈTE (dev + toutes les portes qui la scrutent) ;
// on GÉNÈRE le bundle allégé servi (app.visitor.js) + le bundle admin.
var SRC = path.join(RACINE, 'app.js');
var VIS = path.join(RACINE, 'app.visitor.js');
var ADM = path.join(RACINE, 'admin.bundle.js');

// Version de cache-busting du bundle admin : lue dans sw.js (ASSET_VER), la
// même source que les ?v= d'index.html. Un bump de version doit régénérer les
// bundles — la porte --verifie le vérifie (elle relit sw.js).
function assetVer() {
  var sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  var m = sw.match(/const ASSET_VER\s*=\s*'([^']+)'/);
  return m ? m[1] : '0';
}

// Petits helpers admin APPELÉS hors admin (routeur, compte) → RESTENT visiteur.
var GARDER = ['adminGet', 'adminAuthHeaders', 'adminPostType', 'destroyAdminGlobe',
  'afficherPorteAdmin', 'getAdminSecret', 'setAdminSecret', 'porteAdmin',
  'adminNetworkError', 'adminReadResponse',
  // adminLoginTemplate : appelé par afficherPorteAdmin (gardé visiteur) — il
  // reste donc visiteur, sinon référence morte. MESURÉ par le contrôle des
  // appels croisés gardé→déplacé (le seul, avec renderAdmin qui a son amorce).
  'adminLoginTemplate'];
// Points d'entrée (appelés par le routeur) : deviennent des amorces paresseuses.
var ENTREES = ['renderAdmin', 'renderAjoutProduit'];
var ADMIN = /^(renderAdmin|admin|Admin|compta|Compta|renderAjout|loadAdmin|buildAdminGlobe|initAdminInstagram|bindAdmin|sendAdminReport|repriceHealthHtml|wireRepriceCopy|adminCourierFicheHTML|reviewCourier|ligneMouvementPrix|ajoutProduit)/;

function calcul() {
  var src = fs.readFileSync(SRC, 'utf8');
  var ast = esprima.parseScript(src, { range: true });
  var iife = null;
  ast.body.forEach(function (st) {
    if (iife) return;
    if (st.type === 'ExpressionStatement') { var e = st.expression; if (e.type === 'CallExpression') e = e.callee; if (e && /Function/.test(e.type)) iife = e; }
  });
  if (!iife) throw new Error('IIFE introuvable dans app.js');
  var body = iife.body.body;
  var garder = {}; GARDER.forEach(function (g) { garder[g] = 1; });
  var move = body.filter(function (n) { return n.type === 'FunctionDeclaration' && n.id && ADMIN.test(n.id.name) && !garder[n.id.name]; });
  var moveNames = {}; move.forEach(function (n) { moveNames[n.id.name] = 1; });
  // symboles top-level (candidats partagés)
  var top = {};
  body.forEach(function (n) {
    if (n.type === 'FunctionDeclaration' && n.id) top[n.id.name] = 1;
    if (n.type === 'VariableDeclaration') n.declarations.forEach(function (d) { if (d.id.type === 'Identifier') top[d.id.name] = 1; });
  });
  // shared = top-level référencés par l'admin, hors admin
  var shared = {};
  move.forEach(function (f) { estraverse.traverse(f, { enter: function (n) { if (n.type === 'Identifier' && top[n.name] && !moveNames[n.name]) shared[n.name] = 1; } }); });
  return { src: src, move: move, moveNames: moveNames, shared: Object.keys(shared).sort() };
}

// Réécrit une fonction déplacée : tout Identifier d'un nom partagé → A.<nom>.
// Zéro shadow mesuré → sûr sans analyse de portée. On ne touche PAS les clés
// de propriété (obj.shared) ni les noms de propriété d'objet littéral.
function reecrire(node, sharedSet) {
  return escodegen.generate(estraverse.replace(node, {
    enter: function (n, parent) {
      if (n.type !== 'Identifier' || !sharedSet[n.name]) return;
      // NE PAS renommer : membre après un point (obj.x), clé de propriété non calculée.
      if (parent && parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return estraverse.VisitorOption.Skip;
      if (parent && parent.type === 'Property' && parent.key === n && !parent.computed) return estraverse.VisitorOption.Skip;
      return { type: 'MemberExpression', computed: false, object: { type: 'Identifier', name: 'A' }, property: { type: 'Identifier', name: n.name } };
    }
  }), { format: { indent: { style: '  ' } } });
}

function generer() {
  var c = calcul();
  var sharedSet = {}; c.shared.forEach(function (s) { sharedSet[s] = 1; });

  // ── admin.bundle.js : fonctions réécrites, dans un wrapper qui reçoit A ──
  var corps = c.move.map(function (n) {
    return reecrire(JSON.parse(JSON.stringify(n)), sharedSet);
  }).join('\n\n');
  var expo = Object.keys(c.moveNames).map(function (n) { return n + ': ' + n; }).join(', ');
  var bundle = '/* GÉNÉRÉ par scripts/extraire-admin.js — bundle admin (chargé sur #/admin). NE PAS ÉDITER : source app.js. */\n'
    + '(function (A) {\n"use strict";\n' + corps + '\n\n'
    + 'window.__PT_ADMIN = { ' + expo + ' };\n'
    + '})(window.__PT_ADMIN_CTX);\n';

  /* ⛔⛔ LE COMMENTAIRE PART AVEC SA FONCTION — MESURÉ LE 15/08/2026.
     On coupait à partir du mot `function` : le pavé de commentaire posé
     JUSTE AU-DESSUS restait donc dans app.visitor.js, téléchargé par chaque
     visiteur qui n'ouvrira jamais l'administration. Relevé sur le bundle
     d'alors : 15 blocs orphelins, 69 402 octets bruts — et c'est ce qui a
     crevé le plafond des 400 Ko (400,7) en ajoutant deux fonctions admin.
     ⚠️ L'user navigue en privé : aucun cache, chaque octet est repayé à
     CHAQUE visite, la sienne comme celles de ses clients.
     On ne remonte que les commentaires COLLÉS à la fonction (rien d'autre que
     des espaces entre les deux) : un commentaire séparé par une ligne vide
     appartient au code d'avant, et l'emporter volerait sa documentation au
     bundle visiteur. */
  function debutAvecCommentaire(src, deb) {
    var i = deb;
    for (;;) {
      var j = i;
      while (j > 0 && /[ \t]/.test(src[j - 1])) j--;          // indentation
      if (j > 0 && src[j - 1] === '\n') j--;                  // UNE fin de ligne, pas deux
      else if (j !== i) return i;                             // pas en début de ligne
      if (j >= 2 && src[j - 2] === '*' && src[j - 1] === '/') {
        var o = src.lastIndexOf('/*', j - 2);
        if (o < 0) return i;
        i = o;
        continue;
      }
      if (j > 0) {
        var ligne = src.lastIndexOf('\n', j - 1) + 1;
        var t = src.slice(ligne, j);
        if (/^\s*\/\//.test(t)) { i = ligne; continue; }
      }
      return i;
    }
  }

  // ── app.js (visiteur) : source SANS les fonctions déplacées ni leurs commentaires ──
  var moveSorted = c.move.slice().sort(function (a, b) { return a.range[0] - b.range[0]; });
  var vis = '', cur = 0;
  moveSorted.forEach(function (n) {
    var deb = debutAvecCommentaire(c.src, n.range[0]);
    if (deb < cur) deb = n.range[0];        // jamais reculer avant la coupe précédente
    vis += c.src.slice(cur, deb);
    cur = n.range[1];
  });
  vis += c.src.slice(cur);

  // Contexte partagé + amorces : injectés à l'intérieur de l'IIFE, juste avant
  // son `init()` final. Repère : la ligne `if (document.readyState === 'loading')`.
  var ancre = "  if (document.readyState === 'loading') {";
  if (vis.indexOf(ancre) === -1) throw new Error('ancre init introuvable dans le bundle visiteur');
  var ctx = c.shared.map(function (s) {
    return "  Object.defineProperty(__A, '" + s + "', { get: function () { return " + s + "; }, set: function (v) { " + s + " = v; }, configurable: true });";
  }).join('\n');
  var amorces = ENTREES.map(function (e) {
    return "  function " + e + "() { var a = arguments; return chargerAdmin().then(function () { return window.__PT_ADMIN." + e + ".apply(null, a); }); }";
  }).join('\n');
  var inject = '\n  /* ── SEO ordre 9 (D-120) : admin chargé à la demande ─────────────────────\n'
    + '     Le bundle admin (admin.bundle.js) n\'est téléchargé que sur #/admin.\n'
    + '     Il lit les symboles partagés via window.__PT_ADMIN_CTX (accesseurs\n'
    + '     get/set → variables VIVES de cette fermeture). GÉNÉRÉ, ne pas éditer. */\n'
    + '  var __A = {};\n' + ctx + '\n  window.__PT_ADMIN_CTX = __A;\n'
    + '  var __adminCharge = null;\n'
    + '  function chargerAdmin() {\n'
    + '    if (window.__PT_ADMIN) return Promise.resolve();\n'
    + '    if (__adminCharge) return __adminCharge;\n'
    + '    __adminCharge = new Promise(function (res, rej) {\n'
    + '      var s = document.createElement(\'script\'); s.src = \'admin.bundle.js?v=' + assetVer() + '\';\n'
    + '      s.onload = res; s.onerror = function () { __adminCharge = null; rej(new Error(\'admin.bundle indisponible\')); };\n'
    + '      document.head.appendChild(s);\n'
    + '    });\n    return __adminCharge;\n  }\n'
    + amorces + '\n\n';
  /* ⛔ FORME FONCTION OBLIGATOIRE. En chaîne de remplacement, `$$`, `$&`, `$'`
     sont des MOTIFS SPÉCIAUX de String.replace : le symbole partagé `$$` était
     silencieusement exposé sous le nom `$` — et l'admin en prod mourait sur
     « A.$$ is not a function » (09/08/2026). Une fonction rend le texte LITTÉRAL. */
  vis = vis.replace(ancre, function () { return inject + ancre; });
  vis = '/* GÉNÉRÉ par scripts/extraire-admin.js depuis app.js — NE PAS ÉDITER. */\n' + vis;

  return { vis: vis, bundle: bundle, moveNames: Object.keys(c.moveNames), shared: c.shared };
}

module.exports = { generer: generer, calcul: calcul, GARDER: GARDER, ENTREES: ENTREES };

if (require.main === module) {
  var g = generer();
  if (process.argv[2] === '--verifie') {
    var errs = [];
    var vd, ad;
    try { vd = fs.readFileSync(VIS, 'utf8'); ad = fs.readFileSync(ADM, 'utf8'); }
    catch (e) { console.error('  ❌ [extraire-admin] bundle manquant : ' + e.message + ' — relancer sans --verifie'); process.exit(1); }
    if (vd !== g.vis) errs.push('app.visitor.js pas à jour vs app.js — relancer sans --verifie');
    if (ad !== g.bundle) errs.push('admin.bundle.js pas à jour vs app.js — relancer sans --verifie');
    g.moveNames.forEach(function (nm) {
      if (ENTREES.indexOf(nm) !== -1) return;   // les amorces réutilisent le nom
      if (new RegExp('function\\s+' + nm + '\\s*\\(').test(vd)) errs.push('la fonction admin ' + nm + ' est ENCORE définie dans le bundle visiteur');
    });
    /* ⛔ CHAQUE symbole partagé est exposé SOUS SON NOM EXACT dans le contexte.
       Motif (09/08/2026) : `$$` était devenu `$` via les motifs spéciaux de
       String.replace — le fichier régénéré était identique au fichier corrompu,
       donc la comparaison « à jour » ne voyait rien. Ce contrôle est SÉMANTIQUE :
       il cherche la clé verbatim, indépendamment du générateur. */
    g.shared.forEach(function (s) {
      if (vd.indexOf("Object.defineProperty(__A, '" + s + "'") === -1) {
        errs.push('symbole partagé « ' + s + ' » NON exposé sous son nom exact dans app.visitor.js — l\'admin mourra sur A.' + s);
      }
    });
    if (errs.length) { errs.forEach(function (e) { console.error('  ❌ [extraire-admin] ' + e); }); process.exit(1); }
    console.log('✅ extraire-admin : ' + g.moveNames.length + ' fonctions admin hors du bundle visiteur, à jour');
    process.exit(0);
  }
  fs.writeFileSync(VIS, g.vis);
  fs.writeFileSync(ADM, g.bundle);
  console.log('app.visitor.js + admin.bundle.js écrits : ' + g.moveNames.length + ' fonctions déplacées, '
    + g.shared.length + ' symboles partagés exposés. Bundle admin ' + (g.bundle.length / 1024).toFixed(0) + ' Ko.');
}
