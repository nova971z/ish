/* check-deps.js — LA CI DOIT SURVIVRE À UNE INSTALLATION FRAÎCHE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔ PANNE PAYÉE (09/08/2026, docs/LECONS.md) : les bibliothèques d'analyse
   syntaxique de l'extraction admin (esprima, estraverse, escodegen) étaient
   utilisées par la porte de l'ordre 9 mais ABSENTES de package.json — un
   simple `npm install` (venu installer autre chose) les a SUPPRIMÉES en tant
   qu'« extraneous », et la porte est morte sur le coup. Une CI qui ne survit
   pas à `npm install` sur machine vierge est une CI locale, donc morte demain.

   CE QUE CETTE PORTE FAIT : elle relit TOUS les `require()`/`import` de
   l'outillage (scripts/, outils/, tests/, api/, audit/) et refuse tout module
   qui n'est ni natif Node, ni relatif, ni déclaré dans package.json
   (dependencies + devDependencies).

   CE QU'ELLE NE FAIT PAS (dit, pas caché) : elle ne rejoue pas l'installation
   propre elle-même — ce rejeu reste un geste manuel périodique
   (.claude/rules/build.md). Elle garantit seulement que le manifeste est
   COMPLET, ce qui est la condition pour que ce rejeu réussisse. */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* Modules natifs : la liste vient de Node lui-même, jamais recopiée à la main
   (un seuil recopié se périme — règle des harnais). */
var NATIFS = new Set(require('module').builtinModules);

var DOSSIERS = ['scripts', 'outils', 'tests', 'api', 'audit'];
var EXT = /\.(js|mjs|cjs)$/;

function fichiersDe(dossier) {
  var abs = path.join(RACINE, dossier);
  if (!fs.existsSync(abs)) return [];
  var out = [];
  (function marche(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      var p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '_sortie') marche(p); }
      else if (EXT.test(e.name)) out.push(p);
    });
  })(abs);
  return out;
}

/* Le paquet d'un spécificateur : 'esprima' → esprima ; '@scope/x/lib' →
   @scope/x ; 'node:fs' → natif ; './x' → relatif (ignoré). */
function paquetDe(spec) {
  if (!spec || spec.charAt(0) === '.' || spec.charAt(0) === '/') return null;
  if (/^[a-z][a-z0-9+.-]*:/.test(spec)) return null;   // node:, file:, data:, https:…
  /* Un vrai nom de paquet npm n'a ni antislash ni espace : ces formes sont des
     artefacts du scan (chaînes échappées à l'intérieur d'un littéral regex —
     mesuré sur tests/_porter.mjs, faux positifs `\` et `\.\`). */
  if (/[\\\s]/.test(spec)) return null;
  var parts = spec.split('/');
  return spec.charAt(0) === '@' ? parts.slice(0, 2).join('/') : parts[0];
}

module.exports = function checkDeps() {
  var errors = [];
  var manifeste;
  try {
    manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));
  } catch (e) {
    return ['[check-deps] ⛔ package.json illisible : ' + e.message];
  }
  var declares = new Set(Object.keys(manifeste.dependencies || {})
    .concat(Object.keys(manifeste.devDependencies || {})));

  /* ⛔ ON NE RÉÉCRIT PAS UN PARSEUR À LA MAIN (protocole §1-Q4). Le premier jet
     en regex a rendu `stripe` « importé » par un fichier qui ne fait que CITER
     `require("stripe")` dans un MESSAGE d'assertion (mesuré le 09/08/2026),
     plus deux artefacts tirés d'un littéral regex. En JETONS, une chaîne de
     message est UN jeton String isolé : elle ne peut pas fabriquer une
     séquence `require ( "…" )`. esprima est déjà au manifeste. */
  var esprima = require('esprima');
  function importsDe(src) {
    var out = [], toks;
    try { toks = esprima.tokenize(src, { tolerant: true }); }
    catch (e) { return null; }                     // fichier intokenisable : dit plus bas
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      // require ( "x" )  ·  import ( "x" )
      if ((t.type === 'Identifier' && t.value === 'require')
          || (t.type === 'Keyword' && t.value === 'import')) {
        if (toks[i + 1] && toks[i + 1].value === '(' && toks[i + 2] && toks[i + 2].type === 'String') {
          out.push(toks[i + 2].value.slice(1, -1));
        }
      }
      // import … from "x"  ·  export … from "x"
      if (t.type === 'Identifier' && t.value === 'from'
          && toks[i + 1] && toks[i + 1].type === 'String') {
        out.push(toks[i + 1].value.slice(1, -1));
      }
      // import "x"  (effet de bord)
      if (t.type === 'Keyword' && t.value === 'import'
          && toks[i + 1] && toks[i + 1].type === 'String') {
        out.push(toks[i + 1].value.slice(1, -1));
      }
    }
    return out;
  }

  var vus = 0, manquants = Object.create(null), intokenisables = [];
  DOSSIERS.forEach(function (d) {
    fichiersDe(d).forEach(function (f) {
      var specs = importsDe(fs.readFileSync(f, 'utf8'));
      if (specs === null) { intokenisables.push(path.relative(RACINE, f)); return; }
      specs.forEach(function (s) {
        var pq = paquetDe(s);
        if (!pq || NATIFS.has(pq)) return;
        vus++;
        if (!declares.has(pq)) {
          (manquants[pq] = manquants[pq] || []).push(path.relative(RACINE, f));
        }
      });
    });
  });
  /* Un fichier illisible n'est pas un fichier propre (non exécuté ≠ vert). */
  if (intokenisables.length) {
    console.warn('[check-deps] ⚠️ ' + intokenisables.length + ' fichier(s) intokenisable(s), '
      + 'scan aveugle dessus : ' + intokenisables.slice(0, 5).join(', ')
      + (intokenisables.length > 5 ? '…' : ''));
  }
  if (intokenisables.length > 5) {
    errors.push('[check-deps] ⛔ ' + intokenisables.length + ' fichiers intokenisables — '
      + 'trop d\'angles morts pour garantir quoi que ce soit.');
  }

  /* ⚠️ PRÉALABLE (règle des harnais : un harnais vert sans avoir rien franchi
     ne prouve rien) : si le scan n'a vu AUCUN import de paquet, c'est le scan
     qui est cassé, pas le dépôt qui est propre. */
  if (vus === 0) {
    errors.push('[check-deps] ⛔ PRÉALABLE : zéro import de paquet vu dans '
      + DOSSIERS.join('/') + ' — le scan n\'a rien lu, il ne peut rien garantir.');
  }

  /* Deux classes, deux traitements — et rien de tronqué en silence :
     · INSTALLÉ mais non déclaré → BLOQUANT. C'est le mécanisme exact de la
       panne : `npm install` supprime l'« extraneous » et la porte meurt.
     · NI installé NI déclaré → LISTÉ en avertissement, pas bloquant : le
       script échoue déjà visiblement à l'exécution, et graver une version au
       hasard dans le manifeste serait une invention — la version se fixe à la
       prochaine utilisation réelle de l'outil (.claude/rules/build.md). */
  Object.keys(manquants).forEach(function (pq) {
    var ou = manquants[pq].slice(0, 3).join(', ')
      + (manquants[pq].length > 3 ? ' (+' + (manquants[pq].length - 3) + ')' : '');
    var installe = fs.existsSync(path.join(RACINE, 'node_modules', pq, 'package.json'));
    if (installe) {
      errors.push('[check-deps] ⛔ `' + pq + '` est INSTALLÉ et importé par ' + ou
        + ' mais ABSENT de package.json : le prochain `npm install` le supprime '
        + 'et la porte qui s\'en sert meurt (panne du 09/08/2026, docs/LECONS.md).');
    } else {
      console.warn('[check-deps] ⚠️ `' + pq + '` importé par ' + ou
        + ' — ni installé ni déclaré : outil d\'atelier inutilisable en l\'état, '
        + 'version à fixer à sa prochaine utilisation réelle.');
    }
  });

  return errors;
};

/* Lancement direct : `node scripts/check-deps.js` — code 1 si erreurs.
   (check-pricing n'a PAS ce lanceur et un lancement direct y « verdit » à
   vide — piège mesuré le 09/08/2026 ; celui-ci ne le rejoue pas.) */
if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('✅ check-deps OK — tous les imports de l\'outillage sont au manifeste');
}
