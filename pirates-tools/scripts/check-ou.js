/* check-ou.js — L'INDEX DE L'ENTONNOIR NE DOIT JAMAIS MENTIR.
   ─────────────────────────────────────────────────────────────────────────
   `scripts/ou.js` porte le SEUL élément écrit à la main de tout le dispositif :
   son index d'intentions. C'est donc le seul qui peut se périmer en silence —
   une fonction renommée, un fichier déplacé, un harnais supprimé, et l'outil
   envoie vers le vide avec l'assurance d'un outil qui sait.

   Un aiguillage qui envoie au mauvais endroit est PIRE que pas d'aiguillage :
   on lui fait confiance.

   Ce contrôle vérifie que TOUT ce que l'index nomme existe réellement :
   fichiers, dossiers, fonctions, harnais, contrôles, fichiers de règles, et
   identifiants de décision.

   Retourne un tableau d'erreurs (vide = OK), comme les autres checks.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');
var DEPOT = path.join(RACINE, '..');

/** Résout un chemin de l'index : relatif à pirates-tools/, ou au dépôt si `../`. */
function resoudre(p) {
  return p.indexOf('../') === 0 ? path.join(DEPOT, p.slice(3))
       : p.indexOf('.claude/') === 0 ? path.join(DEPOT, p)
       : path.join(RACINE, p);
}

/** Extrait le premier chemin d'une chaîne du type "scripts/x.js (commentaire)". */
function cheminSeul(s) {
  var m = String(s).match(/^[^\s(]+/);
  return m ? m[0] : String(s);
}

module.exports = function checkOu() {
  var errors = [];
  var ou;
  try {
    ou = require('./ou.js');
  } catch (e) {
    return ['scripts/ou.js est illisible : ' + e.message];
  }

  if (!Array.isArray(ou.INDEX) || !ou.INDEX.length) {
    return ['scripts/ou.js : l\'index est vide — l\'entonnoir ne guide plus rien.'];
  }

  /* Fonctions déclarées, par fichier — mémoïsé, chaque fichier lu une seule fois.
     ⚠️ CETTE FONCTION NE REGARDAIT QUE app.js. Tant que tout le code d'intérêt
     y vivait, ça passait. La première entrée d'index pointant vers un module
     serveur (api/_lib/accounting.js) a fait échouer la CI en accusant l'index
     d'être périmé, alors que les fonctions existaient bel et bien. Un contrôle
     qui accuse à tort finit par être contourné. On cherche donc dans LES
     FICHIERS QUE L'ENTRÉE ELLE-MÊME DÉSIGNE, plus app.js en repli. */
  var cacheDecl = {};
  function declareesDans(chemin) {
    if (cacheDecl[chemin]) return cacheDecl[chemin];
    var d = {};
    try {
      var src = fs.readFileSync(resoudre(chemin), 'utf8');
      // `function nom(`, `var nom = function`, `nom: function`, `const nom = (…) =>`
      (src.match(/function\s+([A-Za-z_$][\w$]*)/g) || []).forEach(function (m) {
        d[m.replace(/function\s+/, '')] = true;
      });
      (src.match(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g) || []).forEach(function (m) {
        d[m.replace(/(?:var|let|const)\s+/, '').replace(/\s*=[\s\S]*$/, '')] = true;
      });
    } catch (e) { /* fichier illisible : déjà signalé par le contrôle d'existence */ }
    cacheDecl[chemin] = d;
    return d;
  }

  // Les décisions réellement enregistrées.
  var decisions = {};
  var fdec = path.join(RACINE, 'docs', 'DECISIONS.md');
  if (fs.existsSync(fdec)) {
    (fs.readFileSync(fdec, 'utf8').match(/^## (D-\d+)/gm) || []).forEach(function (m) {
      decisions[m.replace('## ', '')] = true;
    });
  }

  ou.INDEX.forEach(function (e) {
    var ou_ = 'ou.js › « ' + e.intention + ' »';

    if (!e.mots || !e.mots.length) errors.push(ou_ + ' : aucun mot-clé — cette entrée est introuvable.');
    if (!e.fini) errors.push(ou_ + ' : pas de condition de fin. « Fini » doit être vérifiable, pas ressenti.');

    (e.fichiers || []).forEach(function (f) {
      if (!fs.existsSync(resoudre(f))) {
        errors.push(ou_ + ' nomme « ' + f + ' » qui N\'EXISTE PAS. '
          + 'Un aiguillage qui envoie au vide est pire que pas d\'aiguillage.');
      }
    });

    (e.fonctions || []).forEach(function (fn) {
      var cherchesDans = (e.fichiers || []).concat(['app.js']);
      var trouvee = cherchesDans.some(function (f) { return declareesDans(f)[fn]; });
      if (!trouvee) {
        errors.push(ou_ + ' nomme la fonction ' + fn + '() qui n\'est déclarée dans AUCUN '
          + 'des fichiers de l\'entrée (' + cherchesDans.join(', ') + ') — renommée ou '
          + 'supprimée ? Mets l\'index à jour.');
      }
    });

    (e.protege || []).forEach(function (p) {
      var c = cheminSeul(p);
      if (!fs.existsSync(resoudre(c))) {
        errors.push(ou_ + ' annonce comme protection « ' + c + ' » qui n\'existe pas. '
          + 'Annoncer une protection inexistante est le pire des mensonges de cet outil.');
      }
    });

    (e.regles || []).forEach(function (r) {
      if (!fs.existsSync(resoudre(r))) {
        errors.push(ou_ + ' renvoie vers la règle « ' + r + ' » qui n\'existe pas.');
      }
    });

    (e.decisions || []).forEach(function (d) {
      if (!decisions[d]) {
        errors.push(ou_ + ' cite la décision ' + d + ' absente de docs/DECISIONS.md.');
      }
    });
  });

  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('❌ ' + e); }); process.exit(1); }
  var n = require('./ou.js').INDEX.length;
  console.log('✅ check-ou : les ' + n + ' intentions de l\'entonnoir pointent toutes vers du réel');
}
