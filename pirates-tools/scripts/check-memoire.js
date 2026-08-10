/* check-memoire.js — LES PORTES DE LA MÉMOIRE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CES PORTES EXISTENT
   `CLAUDE.md` avait atteint 1557 lignes parce que rien n'empêchait d'y écrire.
   Chaque session y ajoutait son récit, et les règles opposables finissaient
   noyées dedans — 79 d'entre elles, retrouvées le 29/07/2026, dont personne ne
   pouvait raisonnablement se souvenir.

   Une mémoire ne se maintient pas par discipline : elle se maintient par des
   portes. Ce fichier les pose.

   ⛔ AUCUNE PORTE NE DOIT EXIGER D'EXCEPTION sur l'état obtenu. Si elle en
   réclame une dès le premier jour, elle est mal conçue et on la reprend.

   | Porte | Refuse                                                          |
   |-------|-----------------------------------------------------------------|
   | M1    | CLAUDE.md au-delà de 80 lignes                                  |
   | M2    | plus d'un CLAUDE.md dans le dépôt                               |
   | M3    | un @import dans CLAUDE.md                                       |
   | M4    | un document de docs/ que rien ne cite                           |
   | M6    | une règle écrite dans CLAUDE.md hors du bloc universel          |
   | M7    | deux décisions ACTIVE qui se contredisent                       |
   | M8    | une même règle dupliquée entre deux fichiers de .claude/rules/  |
   | M9    | un secret dans un fichier de règles                             |
   | M10   | une méthode citée qui n'existe pas, un fichier promis absent    |

   (M5 = l'index de l'entonnoir : voir `scripts/check-ou.js`.)
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');
var DEPOT = path.join(RACINE, '..');
var MEMOIRE = path.join(DEPOT, 'CLAUDE.md');
var PLAFOND = 80;

/* Le bloc de CLAUDE.md où les règles VRAIMENT universelles ont le droit de
   vivre. Partout ailleurs, une règle doit descendre dans .claude/rules/. */
var BALISE_DEBUT = '<!-- REGLES-UNIVERSELLES:DEBUT -->';
var BALISE_FIN = '<!-- REGLES-UNIVERSELLES:FIN -->';

var MARQUEURS = /\bRÈGLE\b|⛔|\bJAMAIS\b|\bTOUJOURS\b|\bOBLIGATOIRES?\b|non négociable|\bGRAVÉE?S?\b/;

/* ⚠️ `split('\n')` compte la chaîne vide qui suit le saut de ligne final : un
   fichier de 80 lignes en rendait 81, et la porte refusait un fichier conforme.
   On mesure donc exactement ce que mesure `wc -l`. Un contrôle qui compte faux
   est du même genre que celui qu'il prétend attraper. */
function lignes(f) {
  var t = fs.readFileSync(f, 'utf8');
  if (t.charAt(t.length - 1) === '\n') t = t.slice(0, -1);
  return t.split('\n');
}

module.exports = function checkMemoire() {
  var errors = [];

  /* ── M2 : un seul fichier de mémoire ──────────────────────────────────── */
  var trouves = [];
  (function parcourir(dir, prof) {
    if (prof > 3) return;
    var e;
    try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    e.forEach(function (x) {
      if (x.name === 'node_modules' || x.name.charAt(0) === '.') return;
      var p = path.join(dir, x.name);
      if (x.isDirectory()) parcourir(p, prof + 1);
      else if (x.name === 'CLAUDE.md') trouves.push(path.relative(DEPOT, p));
    });
  })(DEPOT, 0);

  if (trouves.length !== 1) {
    errors.push('M2 — il doit y avoir EXACTEMENT UN CLAUDE.md, à la racine. Trouvé(s) : '
      + (trouves.join(', ') || 'aucun') + '. Deux mémoires divergent toujours ; '
      + 'un second fichier a déjà été créé par erreur le 28/07/2026.');
  }

  if (!fs.existsSync(MEMOIRE)) return errors;
  var L = lignes(MEMOIRE);

  /* ── M1 : plafond de taille ───────────────────────────────────────────── */
  if (L.length > PLAFOND) {
    errors.push('M1 — CLAUDE.md fait ' + L.length + ' lignes (plafond ' + PLAFOND + '). '
      + 'Ce fichier est un AIGUILLAGE, pas un journal : le récit va dans '
      + 'docs/JOURNAL.md, les règles dans .claude/rules/, les décisions dans '
      + 'docs/DECISIONS.md, les tâches dans docs/ETAT.md.');
  }

  /* ── M3 : pas d'@import ───────────────────────────────────────────────── */
  L.forEach(function (l, i) {
    if (/^@/.test(l.trim())) {
      errors.push('M3 — @import en ligne ' + (i + 1) + ' de CLAUDE.md. Un fichier importé '
        + 'est chargé COMME S\'IL ÉTAIT COLLÉ DEDANS : ça n\'allège rien, ça déplace. '
        + 'Nommer le document entre accents graves.');
    }
  });

  /* ── M6 : aucune règle hors du bloc universel ─────────────────────────── */
  var dedans = false, vuBalise = false;
  L.forEach(function (l, i) {
    if (l.indexOf(BALISE_DEBUT) !== -1) { dedans = true; vuBalise = true; return; }
    if (l.indexOf(BALISE_FIN) !== -1) { dedans = false; return; }
    if (dedans) return;
    if (/^\s*(\||#|>)/.test(l)) return;          // tableau, titre, citation
    if (MARQUEURS.test(l)) {
      errors.push('M6 — règle en ligne ' + (i + 1) + ' de CLAUDE.md, HORS du bloc universel : '
        + '« ' + l.trim().slice(0, 70) + ' ». Une règle de domaine vit dans '
        + '.claude/rules/ (elle s\'y charge toute seule quand elle sert). '
        + 'Si elle est vraiment universelle, place-la entre les balises.');
    }
  });
  if (!vuBalise && L.length <= PLAFOND) {
    errors.push('M6 — CLAUDE.md ne porte pas les balises ' + BALISE_DEBUT + ' / '
      + BALISE_FIN + '. Sans elles, aucune règle universelle n\'est délimitée.');
  }

  /* ── M4 : aucun document orphelin ─────────────────────────────────────── */
  var dossierDocs = path.join(RACINE, 'docs');
  if (fs.existsSync(dossierDocs)) {
    var cites = fs.readFileSync(MEMOIRE, 'utf8');
    /* INDEX-DOCS.md est LE fichier qui désigne les documents : l'oublier ici
       ferait passer pour orphelin tout ce qu'il range correctement. */
    ['scripts/ou.js', 'docs/ETAT.md', 'docs/DECISIONS.md', 'docs/JOURNAL.md',
     'docs/EXTRACTION-REGLES.md', 'docs/INDEX-DOCS.md'].forEach(function (f) {
      var p = path.join(RACINE, f);
      if (fs.existsSync(p)) cites += '\n' + fs.readFileSync(p, 'utf8');
    });
    fs.readdirSync(dossierDocs).filter(function (f) { return /\.md$/.test(f); })
      .forEach(function (f) {
        if (f === 'JOURNAL.md') return;                 // le filet, cité par construction
        if (cites.indexOf(f) === -1) {
          errors.push('M4 — docs/' + f + ' n\'est cité nulle part. Un document que rien '
            + 'ne désigne n\'est jamais lu : soit on le cite depuis l\'aiguillage, '
            + 'soit on le range dans docs/archives/. On ne le supprime pas.');
        }
      });
  }

  /* ── M10 : une méthode citée existe, un fichier promis existe ──────────
     ⛔ POURQUOI CETTE PORTE. `docs/METHODES.md` a été gravé le 10/08/2026 sur
     son ordre : « enregistre toutes les techniques qu'on utilise […] afin que
     tu puisses t'en servir à n'importe quel moment, les nommer correctement ».
     Un catalogue de méthodes se périme de deux façons, et TOUTES DEUX en
     silence :
       ① on cite `M-07` ailleurs (entonnoir, protocole, règles) alors que la
          méthode a été renumérotée ou n'a jamais existé — la référence pointe
          dans le vide, et personne ne s'en aperçoit ;
       ② le tableau « où ces méthodes sont branchées » nomme un fichier qui a
          été renommé ou supprimé — la méthode devient une intention.
     C'est le même défaut que l'ancre périmée d'un harnais, appliqué à la
     mémoire. On le refuse de la même manière : en relisant le réel. */
  var fMeth = path.join(RACINE, 'docs', 'METHODES.md');
  if (fs.existsSync(fMeth)) {
    var meth = fs.readFileSync(fMeth, 'utf8');
    var declarees = {};
    (meth.match(/^### (M-\d{2})/gm) || []).forEach(function (m) {
      declarees[m.replace('### ', '')] = 1;
    });
    if (!Object.keys(declarees).length) {
      errors.push('M10 — docs/METHODES.md ne déclare aucune méthode `### M-xx`. '
        + 'Un catalogue vide se lit comme un catalogue à jour.');
    }
    /* ① les citations, partout où elles peuvent vivre */
    ['scripts/ou.js', '../.claude/PROTOCOLE.md', '../CLAUDE.md'].forEach(function (f) {
      var p = path.join(RACINE, f);
      if (!fs.existsSync(p)) return;
      var txt = fs.readFileSync(p, 'utf8');
      var vues = {};
      (txt.match(/\bM-\d{2}\b/g) || []).forEach(function (c) { vues[c] = 1; });
      Object.keys(vues).forEach(function (c) {
        if (!declarees[c]) {
          errors.push('M10 — ' + f + ' cite la méthode ' + c + ', que docs/METHODES.md '
            + 'ne déclare pas. Une référence qui pointe dans le vide se lit comme '
            + 'une méthode existante.');
        }
      });
    });
    /* ② les fichiers que le tableau final promet */
    var promis = {};
    (meth.match(/`([a-z0-9_./-]+\.(?:js|mjs|json|md))`/gi) || []).forEach(function (m) {
      var f = m.replace(/`/g, '');
      if (f.indexOf('/') === -1) return;                 // un nom seul n'est pas un chemin
      promis[f] = 1;
    });
    Object.keys(promis).forEach(function (f) {
      var p = path.join(RACINE, f);
      var p2 = path.join(RACINE, '..', f);
      if (!fs.existsSync(p) && !fs.existsSync(p2)) {
        errors.push('M10 — docs/METHODES.md nomme ' + f + ', qui n\'existe pas. '
          + 'Une méthode dont le code a disparu n\'est plus une méthode, c\'est un souvenir.');
      }
    });
  }

  /* ── M7 : pas deux décisions ACTIVE contradictoires ───────────────────── */
  var fdec = path.join(RACINE, 'docs', 'DECISIONS.md');
  if (fs.existsSync(fdec)) {
    var src = fs.readFileSync(fdec, 'utf8');
    // Une décision « REMPLACE D-0NNx » enterre sa version renversée : celle-ci
    // ne doit alors JAMAIS apparaître comme ACTIVE.
    var remplacees = (src.match(/REMPLACE\s+(D-\d+[a-z]?(?:\s+et\s+D-\d+[a-z]?)*)/g) || [])
      .join(' ').match(/D-\d+[a-z]/g) || [];
    remplacees.forEach(function (d) {
      var re = new RegExp('##\\s*' + d + '\\b[\\s\\S]{0,400}?ACTIVE');
      if (re.test(src)) {
        errors.push('M7 — ' + d + ' est marquée RENVERSÉE et ACTIVE en même temps. '
          + 'Deux consignes contradictoires font qu\'on en applique UNE AU HASARD.');
      }
    });
  }

  /* ── M8 et M9 : les fichiers de règles ────────────────────────────────── */
  var dossierRegles = path.join(DEPOT, '.claude', 'rules');
  if (fs.existsSync(dossierRegles)) {
    var fichiers = fs.readdirSync(dossierRegles).filter(function (f) { return /\.md$/.test(f); });
    var vues = {};

    fichiers.forEach(function (f) {
      var contenu = fs.readFileSync(path.join(dossierRegles, f), 'utf8');

      /* M9 — aucun secret. Une règle est lue par tout le monde. */
      var motifs = [/sk_(test|live)_[A-Za-z0-9]{8,}/, /AIza[A-Za-z0-9_-]{20,}/,
                    /ya29\.[A-Za-z0-9_-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
                    /"private_key"\s*:/];
      motifs.forEach(function (m) {
        if (m.test(contenu)) {
          errors.push('M9 — un secret figure dans .claude/rules/' + f + '. '
            + 'Les règles sont versionnées et lues par tous : jamais de clé dedans.');
        }
      });

      /* M8 — pas de règle dupliquée entre deux fichiers : elle DÉRIVERAIT.
         On compare les phrases longues (≥ 60 caractères), pas les fragments. */
      contenu.split('\n').forEach(function (l, i) {
        var t = l.trim();
        if (t.length < 60 || /^[#>|\-*]/.test(t)) return;
        var cle = t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (vues[cle] && vues[cle].fichier !== f) {
          errors.push('M8 — règle dupliquée entre .claude/rules/' + vues[cle].fichier
            + ' et .claude/rules/' + f + ' (ligne ' + (i + 1) + '). Une règle qui vit '
            + 'à deux endroits DÉRIVE : elle vit à un seul, les autres la citent.');
        } else { vues[cle] = { fichier: f }; }
      });
    });
  }

  /* ── Le filet ne doit jamais disparaître ──────────────────────────────── */
  var journal = path.join(RACINE, 'docs', 'JOURNAL.md');
  if (!fs.existsSync(journal)) {
    errors.push('docs/JOURNAL.md a disparu. C\'est la copie intégrale de la mémoire '
      + 'avant découpage — sans lui, tout ce qui a été retiré de CLAUDE.md est perdu.');
  } else if (lignes(journal).length < 1000) {
    errors.push('docs/JOURNAL.md est tombé à ' + lignes(journal).length + ' lignes. '
      + 'Ce fichier ne perd JAMAIS de ligne : c\'est sa seule raison d\'être.');
  }

  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('❌ ' + e); }); process.exit(1); }
  console.log('✅ check-memoire : les 8 portes de la mémoire sont franchies');
}
