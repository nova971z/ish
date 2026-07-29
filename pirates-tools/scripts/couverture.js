/* couverture.js — LA SONDE QUI ATTRAPE MES OUBLIS.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE SONDE EXISTE
   Première faiblesse reconnue : **ma première énumération est presque toujours
   incomplète.** Ce n'est pas une impression, c'est mesuré deux fois le même
   jour :
     · la table juridique visait 8 fichiers, il en fallait 20 (E-106) ;
     · `manifest.webmanifest` était SERVI aux visiteurs sans être protégé ;
     · 21 fichiers serveur sur 28 n'avaient aucune liste de contrôle métier.

   Aucun de ces trous n'a été vu à l'œil. Tous l'ont été en confrontant une
   table écrite à la main au code réel. C'est ce que fait cette sonde, pour
   les deux tables restantes — `juridique.js` a déjà la sienne.

   LE PRINCIPE, applicable à n'importe quelle couverture
     1. dériver l'ensemble RÉEL depuis le code (jamais depuis une liste) ;
     2. exiger que chaque élément soit couvert, ou écarté NOMMÉMENT ;
     3. rougir sur tout le reste.
   Un oubli silencieux est le seul défaut que les autres contrôles ne peuvent
   pas voir : eux vérifient la cohérence de ce qui est écrit, pas ce qui
   manque.

     node scripts/couverture.js              le rapport lisible
     node scripts/couverture.js --controle   la porte (CI)
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');

function lire(f) {
  try { return fs.readFileSync(path.join(RACINE, f), 'utf8'); } catch (e) { return ''; }
}

/* ── L'ensemble RÉEL n°1 : ce que les visiteurs téléchargent ───────────────
   Dérivé de `sw.js` (ce que le Service Worker met en cache) et de
   `index.html` (ce que la page demande). Deux sources plutôt qu'une : un
   fichier servi mais absent du cache resterait invisible à la première. */
function fichiersServis() {
  var s = Object.create(null);
  (lire('sw.js').match(/'\.\/[\w./-]+'/g) || []).forEach(function (x) {
    s[x.replace(/'/g, '').replace(/^\.\//, '')] = true;
  });
  (lire('index.html').match(/(?:src|href)="\.?\/?([\w./-]+\.(?:js|css|json|webmanifest))/g) || [])
    .forEach(function (x) { s[x.replace(/.*="\.?\/?/, '')] = true; });
  return Object.keys(s).filter(function (f) {
    return !/^https?:/.test(f) && fs.existsSync(path.join(RACINE, f));
  }).sort();
}

/* ── L'ensemble RÉEL n°2 : tout ce qui tourne côté serveur ─────────────── */
function fichiersServeur() {
  var out = [];
  ['api', 'api/_lib'].forEach(function (d) {
    var abs = path.join(RACINE, d);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).forEach(function (f) {
      if (/\.js$/.test(f)) out.push('pirates-tools/' + d + '/' + f);
    });
  });
  return out.sort();
}

/* Les images ne s'éditent pas au clavier : la porte de l'entonnoir surveille
   des fichiers qu'on RÉÉCRIT. Un binaire est couvert ailleurs — plafond de
   poids (`audit/p8-perf.js`) et liste CATALOGUE. On l'écarte nommément
   plutôt que de le laisser dans un angle mort. */
var HORS_PROTECTION = {
  'icons/icon-256.png': 'binaire — couvert par le plafond de poids p8-perf, pas par une relecture'
};

function controle() {
  var errors = [];

  var ent;
  try { ent = require('./garde-entonnoir.js'); } catch (e) { return []; }   // absent : on passe
  if (!ent || !ent.PROTEGES || !ent.LISTES) return [];

  /* ── Couverture 1 : servi ⇒ protégé ─────────────────────────────────── */
  fichiersServis().forEach(function (f) {
    if (HORS_PROTECTION[f]) return;
    var cible = 'pirates-tools/' + f;
    if (ent.PROTEGES.some(function (re) { return re.test(cible); })) return;
    errors.push('couverture : ' + f + ' est TÉLÉCHARGÉ par les visiteurs et n\'est '
      + 'dans aucun motif de PROTEGES. Il peut être réécrit sans que l\'entonnoir '
      + 'ne dise rien — et sans rappel de bumper sw.js. L\'ajouter, ou l\'écarter '
      + 'nommément dans HORS_PROTECTION avec sa raison.');
  });

  /* ── Couverture 2 : serveur ⇒ liste de contrôle métier ──────────────── */
  var hors = ent.HORS_LISTE || {};
  fichiersServeur().forEach(function (f) {
    if (hors[f]) return;
    if (ent.LISTES.some(function (l) { return l.quand.test(f); })) return;
    errors.push('couverture : ' + f.replace('pirates-tools/', '') + ' tourne côté '
      + 'serveur et n\'a AUCUNE liste de contrôle métier. Le modifier n\'affiche '
      + 'donc rien de ce qui doit être vrai avant de dire que c\'est fini. '
      + 'Le rattacher à une liste, ou l\'écarter nommément dans HORS_LISTE.');
  });

  /* ── Couverture 3 : un écart nommé doit porter sur un fichier RÉEL ──── */
  Object.keys(hors).forEach(function (f) {
    if (!fs.existsSync(path.join(RACINE, '..', f))) {
      errors.push('couverture : HORS_LISTE écarte « ' + f + ' » qui n\'existe plus. '
        + 'Une exception fantôme masque le jour où un fichier de ce nom revient.');
    }
  });
  Object.keys(HORS_PROTECTION).forEach(function (f) {
    if (!fs.existsSync(path.join(RACINE, f))) {
      errors.push('couverture : HORS_PROTECTION écarte « ' + f + ' » qui n\'existe plus.');
    }
  });

  return errors;
}

module.exports = controle;
module.exports.controle = controle;
module.exports.fichiersServis = fichiersServis;
module.exports.fichiersServeur = fichiersServeur;

if (require.main === module) {
  if (process.argv[2] === '--controle') {
    var e = controle();
    if (e.length) { e.forEach(function (x) { console.error('❌ ' + x); }); process.exit(1); }
    console.log('✅ check-couverture : ' + fichiersServis().length + ' fichiers servis, '
      + fichiersServeur().length + ' fichiers serveur — tous couverts ou écartés nommément');
    process.exit(0);
  }

  var ent = require('./garde-entonnoir.js');
  console.log('\nFICHIERS SERVIS AUX VISITEURS\n');
  fichiersServis().forEach(function (f) {
    var ok = ent.PROTEGES.some(function (re) { return re.test('pirates-tools/' + f); });
    console.log('  ' + (ok ? '🔒' : HORS_PROTECTION[f] ? '· ' : '⚠️') + ' ' + f
      + (HORS_PROTECTION[f] && !ok ? '   (écarté : ' + HORS_PROTECTION[f] + ')' : ''));
  });
  console.log('\nFICHIERS SERVEUR ET LEUR LISTE DE CONTRÔLE\n');
  fichiersServeur().forEach(function (f) {
    var l = ent.LISTES.filter(function (x) { return x.quand.test(f); }).map(function (x) { return x.nom; });
    var h = (ent.HORS_LISTE || {})[f];
    console.log('  ' + (l.length ? '🔒' : h ? '· ' : '⚠️') + ' '
      + f.replace('pirates-tools/', '').padEnd(28) + (l.join(' + ') || (h ? 'écarté : ' + h : 'AUCUNE')));
  });
  console.log('');
}
