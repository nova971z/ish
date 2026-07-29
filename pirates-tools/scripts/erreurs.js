/* erreurs.js — LIRE MES ERREURS SANS SE GAVER D'INFORMATION.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE
   Un registre d'erreurs qu'on relit en entier à chaque fois ne sert à rien :
   il coûte de l'attention à chaque message et finit ignoré. Celui-ci est
   classé par ORIGINE, et on n'en lit qu'une part à la fois.

     --sommaire        le tableau des 6 origines (injecté à chaque message)
     --classe O1       le détail d'une seule classe, à la demande
     --controle        vérifie que le registre est bien formé (CI)

   ⛔ Le sommaire doit rester COURT. S'il dépasse ~20 lignes, c'est que le
   registre a grossi au lieu de se condenser : une erreur qui répète un cas
   existant incrémente un compteur, elle n'ajoute pas de ligne.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

var FICHIER = path.join(__dirname, '..', 'docs', 'ERREURS.md');
var PLAFOND_SOMMAIRE = 20;

function lire() {
  if (!fs.existsSync(FICHIER)) return null;
  return fs.readFileSync(FICHIER, 'utf8');
}

/** Le bloc « SOMMAIRE », des en-têtes de tableau jusqu'à la ligne de conclusion. */
function sommaire(src) {
  var L = src.split('\n');
  var d = L.findIndex(function (l) { return /^## SOMMAIRE/.test(l); });
  if (d === -1) return null;
  var out = [];
  for (var i = d; i < L.length; i++) {
    if (i > d && /^---\s*$/.test(L[i])) break;
    out.push(L[i]);
  }
  return out.join('\n').trim();
}

/** Le détail d'une classe : de son titre au séparateur suivant. */
function classe(src, id) {
  var L = src.split('\n');
  var re = new RegExp('^## ' + id + ' —');
  var d = L.findIndex(function (l) { return re.test(l); });
  if (d === -1) return null;
  var out = [];
  for (var i = d; i < L.length; i++) {
    if (i > d && /^---\s*$/.test(L[i])) break;
    out.push(L[i]);
  }
  return out.join('\n').trim();
}

/** Les identifiants d'erreur déclarés, et les classes qui existent. */
function inventaire(src) {
  return {
    classes: (src.match(/^## (O\d+) —/gm) || []).map(function (l) { return l.match(/O\d+/)[0]; }),
    cas: (src.match(/\*\*E-\d{3}\*\*/g) || []).map(function (l) { return l.replace(/\*/g, ''); })
  };
}

/* Contrôle d'intégrité — appelé par la CI. Un registre mal formé est pire
   qu'aucun registre : on croit lire une classification, on lit du texte. */
function controle() {
  var errors = [];
  var src = lire();
  if (!src) return ['docs/ERREURS.md est absent. Sans lui, aucune erreur n\'est traçable.'];

  var s = sommaire(src);
  if (!s) return ['docs/ERREURS.md : section « ## SOMMAIRE » introuvable.'];
  var n = s.split('\n').length;
  if (n > PLAFOND_SOMMAIRE) {
    errors.push('Le sommaire des erreurs fait ' + n + ' lignes (plafond '
      + PLAFOND_SOMMAIRE + '). Il est injecté à CHAQUE message : s\'il grossit, '
      + 'il finit ignoré. Une erreur qui répète un cas existant incrémente un '
      + 'compteur, elle n\'ajoute pas de ligne.');
  }

  var inv = inventaire(src);
  if (!inv.classes.length) errors.push('docs/ERREURS.md : aucune classe d\'origine (## O1 — …).');

  // Toute classe citée au sommaire doit avoir sa section, et réciproquement.
  var auSommaire = (s.match(/\*\*O\d+\*\*/g) || []).map(function (x) { return x.replace(/\*/g, ''); });
  auSommaire.forEach(function (o) {
    if (inv.classes.indexOf(o) === -1) {
      errors.push('docs/ERREURS.md : ' + o + ' est au sommaire mais n\'a aucune section détaillée.');
    }
  });
  inv.classes.forEach(function (o) {
    if (auSommaire.indexOf(o) === -1) {
      errors.push('docs/ERREURS.md : la section ' + o + ' n\'apparaît pas au sommaire — donc jamais lue.');
    }
  });

  // Un identifiant d'erreur doit appartenir à sa classe : E-1xx dans O1, etc.
  inv.cas.forEach(function (id) {
    var o = 'O' + id.charAt(2);
    var bloc = classe(src, o);
    if (!bloc || bloc.indexOf(id) === -1) {
      errors.push('docs/ERREURS.md : ' + id + ' devrait vivre dans ' + o
        + ' — la numérotation dit son origine, sinon elle ne trace rien.');
    }
  });

  /* Le compteur du sommaire doit ÉGALER le nombre de cas réellement écrits.
     C'est tout l'intérêt du registre : on mesure la RÉCIDIVE. Un compteur
     qu'on oublie de bumper transforme la mesure en décoration — et le sommaire
     est justement la seule partie que je relis à chaque message. */
  s.split('\n').forEach(function (l) {
    var m = l.match(/\|\s*\*\*(O\d+)\*\*\s*\|[^|]*\|\s*(\d+)\s*\|/);
    if (!m) return;
    var annonce = parseInt(m[2], 10);
    var reel = inv.cas.filter(function (id) { return 'O' + id.charAt(2) === m[1]; }).length;
    if (annonce !== reel) {
      errors.push('docs/ERREURS.md : le sommaire annonce ' + annonce + ' cas pour '
        + m[1] + ', il y en a ' + reel + '. Le compteur mesure la récidive : faux, '
        + 'il ne mesure plus rien — et c\'est la seule ligne relue à chaque message.');
    }
  });

  /* Le total en toutes lettres sous le tableau doit suivre, lui aussi. */
  var tot = s.match(/\*\*(\d+)\s+erreurs?,\s*(\d+)\s+mécanismes?\.\*\*/);
  if (tot) {
    if (parseInt(tot[1], 10) !== inv.cas.length) {
      errors.push('docs/ERREURS.md : le bilan annonce ' + tot[1] + ' erreurs, '
        + 'le registre en contient ' + inv.cas.length + '.');
    }
    if (parseInt(tot[2], 10) !== inv.classes.length) {
      errors.push('docs/ERREURS.md : le bilan annonce ' + tot[2] + ' mécanismes, '
        + 'le registre en contient ' + inv.classes.length + '.');
    }
  } else {
    errors.push('docs/ERREURS.md : le bilan « N erreurs, M mécanismes » a disparu '
      + 'du sommaire — plus rien ne recoupe les compteurs de classe.');
  }

  return errors;
}

module.exports = controle;
module.exports.controle = controle;

if (require.main === module) {
  var a = process.argv[2];
  var src = lire();

  if (a === '--controle') {
    var e = controle();
    if (e.length) { e.forEach(function (x) { console.error('❌ ' + x); }); process.exit(1); }
    var i = inventaire(src);
    console.log('✅ check-erreurs : ' + i.classes.length + ' origines, ' + i.cas.length
      + ' cas, sommaire ' + sommaire(src).split('\n').length + '/' + PLAFOND_SOMMAIRE + ' lignes');
    process.exit(0);
  }

  if (a === '--classe') {
    var id = String(process.argv[3] || '').toUpperCase();
    var b = src && classe(src, id);
    if (!b) {
      console.error('Classe « ' + id + ' » inconnue. Disponibles : '
        + (src ? inventaire(src).classes.join(' ') : 'aucune'));
      process.exit(1);
    }
    console.log(b);
    process.exit(0);
  }

  // Par défaut : le sommaire, et rien d'autre.
  console.log(src ? sommaire(src) : 'docs/ERREURS.md absent');
}
