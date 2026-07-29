/* garde-entonnoir.js — LE PROTOCOLE CESSE D'ÊTRE UN VŒU.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE
   Le 29/07/2026, `scripts/ou.js` — l'entonnoir censé me donner, AVANT toute
   intervention, les règles, les pièges déjà payés et la définition de « fini » —
   a été construit le matin et utilisé **zéro fois** de la journée. Ni avant le
   Service Worker, ni avant l'administration, ni avant D1 où il aurait montré
   que le filet ne couvrait pas le mode de panne.

   Un protocole qu'on peut oublier est un vœu. Celui-ci **refuse l'édition**.

   MÉCANIQUE — trois modes, appelés par les hooks de .claude/settings.json :
     --debut   (UserPromptSubmit) efface le témoin : chaque message rouvre le
               tour, l'entonnoir doit être reconsulté.
     --marque  (PostToolUse/Bash) pose le témoin si la commande a lancé ou.js.
     --garde   (PreToolUse/Write|Edit) REFUSE si un fichier SERVI est modifié
               sans témoin.

   ⚠️ PORTÉE VOLONTAIREMENT ÉTROITE : uniquement ce que les visiteurs
   téléchargent ou ce qui garde leurs données. Documents, règles, tests et
   scripts restent libres — sinon la porte gênerait plus qu'elle ne protège,
   et une porte qui gêne finit désactivée.

   ⚠️ ÉCHEC SILENCIEUX INTERDIT DANS LES DEUX SENS : ce script ne doit jamais
   bloquer par accident (il laisse passer si quoi que ce soit cloche de son
   côté), ni laisser passer en silence ce qu'il doit refuser (le refus est
   explicite et dit quoi faire).
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

/* Fichiers SERVIS aux visiteurs, ou gardiens de leurs données. Toute
   modification ici exige d'avoir consulté l'entonnoir. */
var PROTEGES = [
  /(^|\/)pirates-tools\/app\.js$/,
  /(^|\/)pirates-tools\/sw\.js$/,
  /(^|\/)pirates-tools\/index\.html$/,
  /(^|\/)pirates-tools\/styles\.css$/,
  /(^|\/)pirates-tools\/mfa\.js$/,
  /(^|\/)pirates-tools\/firebase-init\.js$/,
  /(^|\/)pirates-tools\/products\.json$/,
  /(^|\/)pirates-tools\/vercel\.json$/,
  /(^|\/)pirates-tools\/(firestore|storage)\.rules$/,
  /(^|\/)pirates-tools\/api\//
];

function lireEntree() {
  var brut = '';
  try { brut = fs.readFileSync(0, 'utf8'); } catch (e) { return {}; }
  try { return JSON.parse(brut) || {}; } catch (e) { return {}; }
}

/* Un témoin PAR SESSION : deux sessions parallèles ne se déverrouillent pas
   l'une l'autre. */
function temoin(d) {
  var sid = String((d && d.session_id) || 'sans-session').replace(/[^\w-]/g, '');
  return path.join(os.tmpdir(), 'pt-entonnoir-' + sid);
}

var mode = process.argv[2];
var d = lireEntree();
var t = temoin(d);

try {
  if (mode === '--debut') {
    // Nouveau message de l'user : le tour recommence, le témoin tombe.
    try { fs.unlinkSync(t); } catch (e) { /* absent = déjà bon */ }
    process.exit(0);
  }

  if (mode === '--marque') {
    var cmd = String((d.tool_input && d.tool_input.command) || '');
    if (/\bou\.js\b/.test(cmd)) fs.writeFileSync(t, String(Date.now()));
    process.exit(0);
  }

  if (mode === '--garde') {
    var f = String((d.tool_input && d.tool_input.file_path) || '');
    var vise = PROTEGES.some(function (re) { return re.test(f); });
    if (!vise || fs.existsSync(t)) process.exit(0);   // hors portée, ou entonnoir consulté

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          '⛔ PROTOCOLE §1 — fichier SERVI aux visiteurs modifié sans avoir '
          + 'consulté l\'entonnoir.\n\n  Fichier : ' + f + '\n\n'
          + '  Lance d\'abord, et LIS la sortie :\n'
          + '      cd pirates-tools && node scripts/ou.js "<ce que je vais faire>"\n\n'
          + '  Elle donne les règles applicables, les pièges déjà payés, les '
          + 'décisions en vigueur et ce que « fini » veut dire ici.\n'
          + '  Motif de cette porte : l\'entonnoir a été construit le 29/07 et '
          + 'utilisé zéro fois le jour même. Un protocole qu\'on peut oublier '
          + 'est un vœu.'
      }
    }));
    process.exit(0);
  }
} catch (e) {
  /* ⚠️ En cas de pépin interne, on LAISSE PASSER. Une porte qui bloque par
     accident rend le dépôt inutilisable et finit désactivée — donc ne protège
     plus rien du tout. */
  process.exit(0);
}
process.exit(0);
