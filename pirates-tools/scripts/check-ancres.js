/* scripts/check-ancres.js — UN HARNAIS NE VISE JAMAIS UN IDENTIFIANT MORT.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE

   Le 01/08/2026, huit harnais étaient rouges. Après diagnostic, CINQ tombaient
   sur la même cause, et ce n'était pas un défaut du produit :

     · plan8              visait `#stripeCard` et `#payAddrForm`
                          — le second n'a JAMAIS existé (c'est `#payAddress`)
     · plan9              visait `#acDate`, `#acHour`, `#acLieu`, `#acNotes`
                          — retirés le jour où l'accord a cessé d'être une
                            négociation champ par champ (règle livraison)
     · plan13             visait `#mfaQR`, `#mfaStep2`
     · test-grid          visait `#gridSentinel`
     · verify-coffret-cart visait `#payAddrCp` (le vrai est `#payAddrPostal`)
     · audit-buttons      visait `#authSignup`

   L'interface avait bougé — souvent sur décision explicite de l'user. Les
   harnais, eux, continuaient d'attendre l'ancien monde. Deux conséquences,
   et la seconde est la pire :

     ① ils meurent sur un `TimeoutError` de 30 s, parfois SANS RENDRE UNE
        SEULE ASSERTION. Un harnais qui meurt avant de tester n'est pas
        « rouge sur le fond » : il ne dit RIEN. Zéro couverture, et un rouge
        qu'on finit par ignorer parce qu'« il est rouge depuis longtemps ».
     ② ils accusent le produit à tort. `verify-beacon` annonçait « le clic sur
        une puce n'est plus mesuré » alors que la mesure d'audience marchait
        parfaitement : c'est la CATÉGORIE qui avait été renommée.

   ⛔ Un harnais qui accuse à tort coûte plus cher qu'un harnais absent : il
   fait chercher un défaut qui n'existe pas, et il use la confiance qu'on met
   dans le reste du lot.

   ─────────────────────────────────────────────────────────────────────────
   CE QUE CETTE PORTE VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER

   ✅ Tout `#identifiant` cité dans `tests/` et `outils/` existe quelque part :
      posé dans `index.html`, ou construit par `app.js` (gabarits compris).
   ⛔ Elle ne dit RIEN de la visibilité, de l'ordre, ni du sens. Un identifiant
      peut exister et être dans un panneau masqué — c'est exactement ce qui
      tuait `verify-h5`. C'est un PLANCHER : le franchir ne veut pas dire
      « le harnais est juste », mais « il ne vise pas un fantôme ».

   ⚠️ ELLE NE COUVRE PAS LES ANCRES DE DONNÉES. Nommer une catégorie ou une
   référence produit est interdit par la règle des harnais, et reste
   invérifiable ici : le catalogue change tous les jours. Cette porte attrape
   la structure, pas le contenu.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';
var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* Identifiants tolérés SANS exister dans le produit, chacun avec sa raison.
   ⛔ Cette liste ne s'allonge pas pour faire passer un harnais cassé : une
   entrée sans motif vérifiable est une porte qu'on désarme soi-même. */
var TOLERES = {
  ptBootWatchdog: 'créé à l\'exécution par le script inline de secours (index.html), quand l\'application n\'a pas démarré',
  ptInvoice: 'créé par la fenêtre d\'impression de facture, hors document principal',
  toasts: 'conteneur de notifications créé au démarrage par app.js'
};

/* Une couleur hexadécimale n'est pas un sélecteur : `#fff`, `#facc15`.
   Sans cette exclusion la porte hurlerait sur toute la charte graphique. */
var COULEUR = /^[0-9a-fA-F]{3,8}$/;

/* ⚠️ ANCRES ABSENTES **VOULUES** — la nuance qui a failli tuer cette porte.
   Un harnais peut viser un identifiant PRÉCISÉMENT pour vérifier qu'il
   n'existe PAS. `plan9` fait exactement ça :

       T('AUCUN champ date / heure redemandé', C.date === false && …)

   parce que la règle livraison interdit de redemander au livreur ce que le
   client a déjà posé à la commande. `test-grid` fait pareil avec
   `#gridSentinel` : il PROUVE que le défilement infini a bien été retiré.

   Signaler ces harnais serait une fausse alerte — et une porte qui crie à
   tort finit désarmée. Mais les tolérer en silence rouvrirait le trou.

   D'où la DÉCLARATION, écrite dans le harnais lui-même, à côté des
   assertions qu'elle justifie :

       // ancres-absentes-voulues: acDate, acHour, acLieu

   ⛔ Elle se pose dans le fichier concerné, JAMAIS dans une liste centrale :
   une liste centrale se périme loin de son motif, et plus personne ne la
   relit. Ici, la déclaration est sous les yeux de qui touche l'assertion. */
var DECLARATION = /ancres-absentes-voulues\s*:\s*([^\n*]+)/g;

function absencesVoulues(src) {
  var set = new Set(), m;
  DECLARATION.lastIndex = 0;
  while ((m = DECLARATION.exec(src))) {
    m[1].split(/[,\s]+/).forEach(function (id) {
      id = id.replace(/^#/, '').trim();
      if (id) set.add(id);
    });
  }
  return set;
}

function lire(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

/* ⚠️ ON RETIRE LES COMMENTAIRES AVANT DE CHERCHER — et par le PARSEUR.
   Premier jet : la porte hurlait sur `#monBtn`, qui n'apparaît que dans
   l'exemple d'usage écrit en tête de `outils/vue.mjs`. Une ligne de
   documentation n'est pas une ancre, et une porte qui crie sur un commentaire
   se fait désarmer en trois jours.
   ⛔ Pas d'expression régulière ici : elle ne sait pas distinguer `// …` dans
   du code de `"// …"` dans une chaîne. `esprima` est déjà dans le dépôt. */
var esprima = null;
try { esprima = require(path.join(RACINE, 'node_modules', 'esprima')); } catch (e) { /* voir prealable */ }

/* Fichiers dont les commentaires n'ont PAS pu être retirés. On les NOMME au
   lieu de les traiter en silence : un repli muet transforme une porte en
   générateur de fausses alertes, et c'est ainsi qu'on la fait désarmer. */
var nonDepouilles = [];

function sansCommentaires(nom, src) {
  if (!esprima) return src;
  /* ⚠️ TROIS FORMES QU'ESPRIMA 4 NE CONNAÎT PAS, neutralisées à LONGUEUR
     ÉGALE — jamais supprimées : retirer des caractères décalerait toutes les
     plages et couperait les commentaires au mauvais endroit.
       · `for await (` — lecture du corps brut d'une requête ;
       · `await ` au PREMIER NIVEAU — `outils/vue.mjs` et la plupart des
         harnais commencent par là. C'est ce qui faisait échouer l'analyse en
         silence, et la porte hurlait alors sur un exemple d'usage écrit en
         commentaire (`#monBtn`) ;
       · `import(…)` DYNAMIQUE — celui-là faisait tomber 23 fichiers d'un
         coup, la plupart des harnais chargeant ainsi un module serveur.
         `import(` → `Import(` : un appel ordinaire, 6 caractères contre 6. */
  var pourAnalyse = src
    .replace(/for await \(/g, 'for       (')
    .replace(/\bawait /g, '      ')
    .replace(/\bimport\(/g, 'Import(');
  var cs = null;
  try {
    cs = esprima.parseModule(pourAnalyse, { comment: true, range: true, tolerant: true }).comments || [];
  } catch (e) {
    try {
      cs = esprima.parseScript(pourAnalyse, { comment: true, range: true, tolerant: true }).comments || [];
    } catch (e2) { cs = null; }
  }
  if (!cs) { nonDepouilles.push(nom); return src; }
  cs.sort(function (a, b) { return a.range[0] - b.range[0]; });
  var out = '', pos = 0;
  cs.forEach(function (c) { out += src.slice(pos, c.range[0]); pos = c.range[1]; });
  return out + src.slice(pos);
}

/* ⚠️ ON LIT TOUT CE QUI EST SERVI, pas deux fichiers choisis à la main.
   Premier jet : je ne lisais qu'`index.html` + `app.js`. La porte a donc
   accusé `#mfaQR` et `#mfaStep2` d'être morts — ils vivent dans `mfa.js`,
   chargé à la demande par l'application. Une porte qui ne regarde qu'une
   PARTIE du produit accuse à tort, et c'est exactement le reproche qu'elle
   adresse aux harnais. La liste se DÉCOUVRE : tout `.js` de la racine. */
function fichiersServis() {
  var liste = [path.join(RACINE, 'index.html')];
  fs.readdirSync(RACINE).forEach(function (f) {
    if (/\.js$/.test(f)) liste.push(path.join(RACINE, f));
  });
  return liste;
}

function identifiantsExistants() {
  var connus = new Set();
  var sources = fichiersServis().map(lire);
  sources.forEach(function (src) {
    /* ⚠️ `[\w-]` ET PAS `[A-Za-z]` : mon premier relevé écrivait
       `id="payAddr[A-Za-z]*"` et ratait donc `payAddrLine1` à cause du
       chiffre. Un relevé qui sous-compte fabrique de fausses alertes — la
       faute même que cette porte existe pour empêcher. */
    var motifs = [
      /\bid="([A-Za-z][\w-]*)"/g,        // balisage
      /\bid='([A-Za-z][\w-]*)'/g,
      /\bid=\\?"([A-Za-z][\w-]*)\\?"/g,  // balisage dans un gabarit JS
      /\.id\s*=\s*['"]([A-Za-z][\w-]*)['"]/g,   // élément créé en JS
      /getElementById\(\s*['"]([A-Za-z][\w-]*)['"]/g
    ];
    motifs.forEach(function (re) {
      var m;
      while ((m = re.exec(src))) connus.add(m[1]);
    });
  });
  return connus;
}

/* ⚠️ IDENTIFIANTS CONSTRUITS PAR CONCATÉNATION — ils n'apparaissent JAMAIS
   littéralement. `id="lvTarifIn' + b.zone + '"` produit `lvTarifIn1`,
   `lvTarifIn2`… Sans ça, la porte accuse à tort un identifiant parfaitement
   vivant. C'est le piège déjà consigné pour les classes CSS (`toast--`,
   `abo-page--`…) : il se rejoue à l'identique sur les identifiants.
   On relève les PRÉFIXES, et tout identifiant qui en commence par un est
   accepté — avec la limite assumée qu'on ne vérifie plus le suffixe. */
function prefixesConstruits() {
  var prefixes = [];
  fichiersServis().forEach(function (p) {
    var src = lire(p);
    var re = /\bid=\\?["']([A-Za-z][\w-]*)['"]?\s*\+/g, m;
    while ((m = re.exec(src))) if (m[1].length >= 3) prefixes.push(m[1]);
    var re2 = /\.id\s*=\s*['"]([A-Za-z][\w-]*)['"]\s*\+/g;
    while ((m = re2.exec(src))) if (m[1].length >= 3) prefixes.push(m[1]);
  });
  return prefixes;
}

module.exports = function () {
  var errors = [];
  var connus = identifiantsExistants();
  var prefixes = prefixesConstruits();
  var construit = function (id) {
    return prefixes.some(function (p) { return id !== p && id.indexOf(p) === 0; });
  };

  // Préalable : sans identifiants relevés, la porte verdirait à vide.
  if (connus.size < 100) {
    errors.push('[check-ancres] ⛔ PRÉALABLE : seuls ' + connus.size + ' identifiants relevés '
      + 'dans index.html + app.js. Le relevé est cassé — cette porte ne vérifierait RIEN. '
      + 'Vert ici voudrait dire « rien n\'a été contrôlé ».');
    return errors;
  }

  var dossiers = ['tests', 'outils'];
  var manquantes = new Map();

  dossiers.forEach(function (d) {
    var dir = path.join(RACINE, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function (f) {
      if (!/\.(mjs|js)$/.test(f) || f.charAt(0) === '_') return;
      // Déclarations lues sur le fichier BRUT : elles vivent en commentaire.
      var voulues = absencesVoulues(lire(path.join(dir, f)));
      var src = sansCommentaires(d + '/' + f, lire(path.join(dir, f)));
      /* On ne lit que les sélecteurs écrits dans une CHAÎNE : un `#` dans un
         commentaire ou une URL n'est pas une ancre. */
      var re = /['"`]([^'"`\n]*)['"`]/g, m;
      while ((m = re.exec(src))) {
        var chaine = m[1];
        if (chaine.indexOf('#') === -1) continue;
        if (/^#\/|\/#\//.test(chaine)) continue;          // route d'application
        var ids = chaine.match(/#([A-Za-z][\w-]*)/g) || [];
        ids.forEach(function (brut) {
          var id = brut.slice(1);
          if (COULEUR.test(id)) return;
          if (connus.has(id) || TOLERES[id] || construit(id) || voulues.has(id)) return;
          if (!manquantes.has(id)) manquantes.set(id, new Set());
          manquantes.get(id).add(d + '/' + f);
        });
      }
    });
  });

  manquantes.forEach(function (fichiers, id) {
    errors.push('[check-ancres] ⛔ `#' + id + '` n\'existe NULLE PART dans index.html ni app.js, '
      + 'mais ' + [].concat(Array.from(fichiers)).join(', ') + ' le vise. '
      + 'Le harnais attendra un élément qui ne viendra jamais : il mourra sur un délai, '
      + 'sans rendre d\'assertion, ou accusera le produit à tort. '
      + 'Corrige l\'ancre — ne l\'ajoute PAS à TOLERES pour faire taire la porte.');
  });

  if (nonDepouilles.length) {
    console.warn('  ⚠️  commentaires non retirés (analyse impossible) : ' + nonDepouilles.join(', ')
      + ' — les ancres citées dans leurs commentaires peuvent apparaître à tort.');
  }

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-ancres OK');
}
