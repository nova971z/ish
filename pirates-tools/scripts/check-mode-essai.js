// scripts/check-mode-essai.js — LA PHASE D'ESSAI SE DÉFEND TOUTE SEULE.
//
// ⛔⛔ POURQUOI CETTE PORTE EXISTE. L'user a posé le 03/08 : « on continue de
// tester à sec, je ne veux pas que ça utilise Firebase pour l'instant ». Le
// 04/08 je lui ai fait remplacer `&sec=1` par `&dryRun=1` pour qu'il obtienne
// ses baisses. `dryRun` n'écrit rien, mais il LIT toute la collection : mesuré,
// ~3 780 lectures par balayage contre ZÉRO à sec. Son quota a sauté, son
// administration s'est fermée, et il ne l'a vu qu'après.
//
// ⛔ Ses mots : « à aucun moment je t'avais demandé de passer en réel, tu as
// pris la décision à ma place ». Une consigne qu'aucune porte ne défend se
// refranchit toute seule — c'est la classe O4 du registre, la plus rageante :
// rien n'était à découvrir.
//
// ⚠️ La porte lit l'ÉTAT de la décision D-018 dans `docs/DECISIONS.md`. Tant
// qu'il dit `EN VIGUEUR`, aucune URL de traqueur écrite dans la documentation
// ne peut omettre `sec=1`. Le jour où l'user lève la décision, il l'écrit là-bas
// et cette porte se tait — elle ne se contourne pas dans une conversation.
'use strict';
var fs = require('fs');
var path = require('path');

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-mode-essai] ' + m); }

  var racine = path.join(__dirname, '..');
  var fDec = path.join(racine, 'docs', 'DECISIONS.md');
  if (!fs.existsSync(fDec)) {
    /* ⛔ Un fichier absent n'est pas un feu vert : sans la décision, on ne peut
       PAS savoir si la phase d'essai court. On échoue au lieu de laisser
       passer — « non exécuté n'est pas vert ». */
    ok(false, '⛔ docs/DECISIONS.md introuvable : impossible de savoir si la phase '
      + 'd\'essai est en cours. On ne suppose pas qu\'elle est levée.');
    return errors;
  }
  var dec = fs.readFileSync(fDec, 'utf8');
  var bloc = dec.slice(dec.indexOf('## D-018'));
  var enVigueur = dec.indexOf('## D-018') !== -1 && /\*\*État\s*:\s*EN VIGUEUR\*\*/.test(bloc);

  ok(dec.indexOf('## D-018') !== -1,
    '⛔⛔ la décision D-018 (phase d\'essai, aucun accès Firestore) a DISPARU de '
    + 'docs/DECISIONS.md. Une décision qu\'on efface au lieu de la lever se refranchit '
    + 'toute seule — c\'est exactement ce qui a fait sauter son quota le 04/08.');

  if (!enVigueur) return errors;   // décision levée : la porte se tait, c'est son rôle

  /* ⛔ On relit TOUTE la documentation servie à l'user, pas un fichier choisi :
     une règle vraie appliquée à un seul endroit ne protège que cet endroit
     (E-405, et O7 tout entier). */
  var dossiers = [path.join(racine, 'docs')];
  var fichiers = [];
  dossiers.forEach(function (d) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (n) {
      if (/\.md$/i.test(n)) fichiers.push(path.join(d, n));
    });
  });
  ok(fichiers.length > 0,
    '⛔ PRÉALABLE : au moins un document a été relu — sinon cette porte est verte '
    + 'sans avoir rien vérifié');

  /* Une URL de traqueur, c'est `type=price-watch` avec ses paramètres. On ne
     juge QUE celles-là : les autres adresses du projet ne consomment pas de
     quota par balayage. */
  var fautives = [];
  fichiers.forEach(function (f) {
    var txt = fs.readFileSync(f, 'utf8');
    var lignes = txt.split('\n');
    lignes.forEach(function (l, i) {
      /* ⚠️ `price-watch-plan` n'est PAS un balayage : c'est une requête unique
         qui rend la liste des pages. Elle ne consomme pas de quota par page, et
         la viser ferait crier la porte pour rien — un détecteur qui crie au
         loup finit ignoré. */
      if (l.indexOf('type=price-watch') === -1) return;
      if (l.indexOf('type=price-watch-plan') !== -1 && l.indexOf('type=price-watch&') === -1) return;
      /* ⚠️ Une ligne qui CITE la faute pour l'expliquer n'est pas la faute.
         Le registre des erreurs et les décisions doivent pouvoir écrire
         `&dryRun=1` pour raconter ce qui s'est passé — sinon on ne pourrait
         plus documenter ses propres erreurs. */
        if (/E-115|D-018|jamais|interdit|ne PAS|au lieu de|faute/i.test(l)) return;
      if (l.indexOf('sec=1') === -1) {
        fautives.push(path.basename(f) + ':' + (i + 1) + '  ' + l.trim().slice(0, 100));
      }
    });
  });

  ok(fautives.length === 0,
    '⛔⛔ D-018 est EN VIGUEUR (« je ne veux pas que ça utilise Firebase pour l\'instant ») '
    + 'et ' + fautives.length + ' URL de traqueur documentée(s) n\'ont PAS `sec=1`. '
    + 'Sans ce drapeau, un balayage lit ~3 780 documents — c\'est ce qui a fait sauter son '
    + 'quota le 04/08 :\n     ' + fautives.slice(0, 6).join('\n     '));

  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-mode-essai OK');
  }, function (err) {
    console.error('  ❌ [check-mode-essai] harnais mort : ' + err.message); process.exit(1);
  });
}
