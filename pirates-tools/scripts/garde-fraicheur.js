/* garde-fraicheur.js — ON N'ÉCRIT PAS SUR UN FICHIER QU'ON N'A PLUS LU.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE
   Deuxième faiblesse reconnue : en session longue, je crois connaître un
   fichier lu bien plus tôt. Le protocole §3 dit « relire plutôt que se fier à
   son souvenir » — un vœu, que rien ne faisait respecter.

   Le mode de panne est arrivé aujourd'hui même : un `node -e` a DUPLIQUÉ
   `docs/ERREURS.md` (E-305), et j'ai continué à l'éditer sur la foi de ce que
   j'en savais avant. Cette porte l'aurait refusé.

   MÉCANIQUE — l'empreinte, pas le souvenir
     --lu     (PostToolUse/Read)        note taille + date de modification
     --ecrit  (PostToolUse/Write|Edit)  ré-note : ma propre écriture, je la connais
     --garde  (PreToolUse/Write|Edit)   REFUSE si le fichier a changé depuis

   Ce qu'elle attrape, et que rien d'autre ne voit : la modification venue
   d'AILLEURS — un `sed -i`, un script, un formateur, une autre session. Après
   elle, je ne peux plus écrire sur une photographie périmée.

   ⚠️ JAMAIS DE BLOCAGE PAR ACCIDENT — la leçon E-208, appliquée d'avance :
     · fichier absent (création) ou jamais lu → on laisse passer, ce n'est
       pas le sujet de cette porte ;
     · registre illisible, chemin hors du dépôt, pépin interne → on passe ;
     · un seul refus par fichier et par session : si le blocage se révélait
       injuste, il ne peut pas enfermer le travail.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

var DEPOT = path.join(__dirname, '..', '..');

/* Seuls les fichiers du dépôt nous intéressent. Éditer ailleurs (fichier
   temporaire, brouillon) ne regarde pas cette porte. */
function dansLeDepot(f) {
  if (!f) return false;
  var abs = path.resolve(f);
  return abs.indexOf(path.resolve(DEPOT) + path.sep) === 0;
}

function lireEntree() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch (e) { return null; }
}

function registre(d) {
  var sid = String((d && d.session_id) || 'sans-session').replace(/[^\w-]/g, '');
  return path.join(os.tmpdir(), 'pt-fraicheur-' + sid + '.json');
}

function charger(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch (e) { return {}; }
}

/* L'empreinte : taille ET date de modification. Deux grandeurs valent mieux
   qu'une — une réécriture de même taille à la même seconde est possible, les
   deux ensemble la rendent improbable. On ne prétend pas à la certitude d'une
   somme de contrôle : on prétend à un signal fiable et gratuit. */
function empreinte(f) {
  try {
    var s = fs.statSync(f);
    return s.size + ':' + s.mtimeMs;
  } catch (e) { return null; }
}

function noter(d, f) {
  if (!dansLeDepot(f)) return;
  var e = empreinte(f);
  if (!e) return;
  var p = registre(d);
  var r = charger(p);
  r[path.resolve(f)] = e;
  try { fs.writeFileSync(p, JSON.stringify(r)); } catch (err) {}
}

/* Le verdict, isolé de toute entrée/sortie pour être testable directement.
   Retourne null si l'écriture est permise, sinon la raison du refus. */
function verdict(connue, actuelle) {
  if (actuelle === null) return null;      // le fichier n'existe pas : création
  if (!connue) return null;                // jamais lu ici : ce n'est pas notre sujet
  if (connue === actuelle) return null;    // inchangé depuis ma lecture
  return 'perime';
}

module.exports = { verdict: verdict, empreinte: empreinte, dansLeDepot: dansLeDepot };

/* ═══ AUTO-CONTRÔLE — les deux directions, comme l'exige E-208 ════════════ */
var CAS = [
  { nom: 'fichier inchangé depuis la lecture', connue: '120:1000', actuelle: '120:1000', bloque: false },
  { nom: 'fichier modifié ailleurs depuis la lecture', connue: '120:1000', actuelle: '240:2000', bloque: true },
  { nom: 'même date mais taille différente', connue: '120:1000', actuelle: '999:1000', bloque: true },
  { nom: 'même taille mais date différente', connue: '120:1000', actuelle: '120:2000', bloque: true },
  { nom: 'fichier jamais lu dans cette session', connue: null, actuelle: '120:1000', bloque: false },
  { nom: 'fichier inexistant — création', connue: null, actuelle: null, bloque: false },
  { nom: 'création alors qu une empreinte traîne', connue: '120:1000', actuelle: null, bloque: false }
];

function autoControle() {
  var errors = [];
  CAS.forEach(function (c) {
    var r;
    try { r = verdict(c.connue, c.actuelle); }
    catch (e) {
      errors.push('garde-fraicheur : « ' + c.nom + ' » a fait planter le verdict : ' + (e && e.message));
      return;
    }
    var aBloque = r !== null;
    if (aBloque !== c.bloque) {
      errors.push('garde-fraicheur : « ' + c.nom + ' » devrait '
        + (c.bloque ? 'ÊTRE REFUSÉ' : 'PASSER') + ' et ' + (aBloque ? 'a été refusé' : 'est passé')
        + '. Une porte qui refuse à tort finit désactivée (E-208).');
    }
  });
  return errors;
}
module.exports.autoControle = autoControle;
module.exports.controle = autoControle;

if (require.main === module) {
  var mode = process.argv[2];

  if (mode === '--controle') {
    var e = autoControle();
    if (e.length) { e.forEach(function (x) { console.error('❌ ' + x); }); process.exit(1); }
    console.log('✅ check-fraicheur : ' + CAS.length + ' cas, refus et laissez-passer conformes');
    process.exit(0);
  }

  var d = lireEntree();
  if (!d) process.exit(0);

  try {
    var f = String((d.tool_input && d.tool_input.file_path) || '');

    if (mode === '--lu' || mode === '--ecrit') { noter(d, f); process.exit(0); }

    if (mode === '--garde') {
      if (!dansLeDepot(f)) process.exit(0);
      var r = charger(registre(d));
      var cle = path.resolve(f);
      if (verdict(r[cle] || null, empreinte(f)) === null) process.exit(0);

      /* Un seul refus par fichier : on oublie l'empreinte en refusant, donc
         la tentative suivante passera même si je n'ai pas relu. La porte
         signale, elle n'emprisonne pas. */
      delete r[cle];
      try { fs.writeFileSync(registre(d), JSON.stringify(r)); } catch (err) {}

      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            '⛔ FRAÎCHEUR — ce fichier a CHANGÉ depuis la dernière fois que tu '
            + 'l\'as lu.\n\n  Fichier : ' + f + '\n\n'
            + '  Quelque chose l\'a modifié entre-temps : une commande shell, un '
            + 'script, un formateur, une autre session. Ce que tu crois savoir de '
            + 'son contenu est une photographie périmée.\n'
            + '  ⚠️ C\'est E-305 : un `node -e` avait dupliqué `docs/ERREURS.md` '
            + 'et l\'édition a continué sur l\'ancienne idée du fichier.\n\n'
            + '  RELIS-LE, puis réécris. (Ce refus ne se represente pas pour ce '
            + 'fichier : il signale, il n\'emprisonne pas.)'
        }
      }));
      process.exit(0);
    }
  } catch (e) { process.exit(0); }        // pépin interne : on laisse passer
  process.exit(0);
}
