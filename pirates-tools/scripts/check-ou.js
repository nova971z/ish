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

  // Les fonctions déclarées dans app.js, lues une seule fois.
  var appjs = fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8');
  var declarees = {};
  (appjs.match(/function\s+([A-Za-z_$][\w$]*)/g) || []).forEach(function (m) {
    declarees[m.replace(/function\s+/, '')] = true;
  });

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
      if (!declarees[fn]) {
        errors.push(ou_ + ' nomme la fonction ' + fn + '() qui n\'est PLUS déclarée dans app.js '
          + '(renommée ou supprimée ?). Mets l\'index à jour.');
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
