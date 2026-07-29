/* check-lecons.js — UNE PANNE DOIT PRODUIRE UNE PORTE, PAS UN SOUVENIR.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE CONTRÔLE EXISTE
   Le 29/07/2026 a produit une dizaine de leçons réelles. Chacune a été écrite
   dans un commit, puis oubliée : un commit ne se relit pas. Les seules qui
   protègent encore sont celles devenues un CONTRÔLE ou un HARNAIS.

   Une leçon qui n'a pas de dent est une anecdote. Ce contrôle refuse les
   anecdotes : chaque entrée de `docs/LECONS.md` doit NOMMER le fichier qui la
   fait respecter, et ce fichier doit EXISTER.

   ⚠️ Il ne vérifie pas que la porte est bonne — ça, c'est le sabotage qui le
   prouve. Il vérifie qu'elle EXISTE. C'est le minimum, et c'est mécanique.

   Retourne un tableau d'erreurs (vide = OK), comme les autres checks.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');
var DEPOT = path.join(RACINE, '..');
var FICHIER = path.join(RACINE, 'docs', 'LECONS.md');

/* Une leçon = une ligne de tableau à 4 colonnes :
   | date | ce qui a cassé | la cause | la porte qui l'empêche | */
var LIGNE = /^\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/;

module.exports = function checkLecons() {
  var errors = [];
  if (!fs.existsSync(FICHIER)) {
    return ['docs/LECONS.md est absent. Le registre des leçons est le seul '
      + 'endroit où une panne se transforme en protection durable.'];
  }

  var lignes = fs.readFileSync(FICHIER, 'utf8').split('\n');
  var n = 0;

  lignes.forEach(function (l, i) {
    var m = LIGNE.exec(l);
    if (!m) return;
    n++;
    var quoi = m[2].trim();
    var porte = m[4].trim().replace(/`/g, '');

    if (!quoi) {
      errors.push('LECONS.md ligne ' + (i + 1) + ' : aucune description de ce qui a cassé.');
    }
    if (!porte) {
      errors.push('LECONS.md ligne ' + (i + 1) + ' : aucune porte nommée. '
        + 'Une leçon sans dent est une anecdote — elle ne protégera de rien.');
      return;
    }

    /* La porte peut être un contrôle, un harnais, une règle ou une décision.
       Dans tous les cas : le fichier doit exister. */
    var candidats = porte.split(/\s*[+·,]\s*/).filter(Boolean);
    candidats.forEach(function (c) {
      if (/^D-\d+$/.test(c)) {                       // une décision tracée
        var dec = path.join(RACINE, 'docs', 'DECISIONS.md');
        if (!fs.existsSync(dec) || fs.readFileSync(dec, 'utf8').indexOf('## ' + c) === -1) {
          errors.push('LECONS.md ligne ' + (i + 1) + ' : la décision ' + c
            + ' n\'existe pas dans docs/DECISIONS.md.');
        }
        return;
      }
      var abs = c.indexOf('.claude/') === 0 ? path.join(DEPOT, c) : path.join(RACINE, c);
      if (!fs.existsSync(abs)) {
        errors.push('LECONS.md ligne ' + (i + 1) + ' : la porte « ' + c + ' » N\'EXISTE PAS. '
          + 'Soit on la crée, soit la leçon n\'est pas encore protégée et il faut le dire.');
      }
    });
  });

  if (n === 0) {
    errors.push('docs/LECONS.md ne contient aucune leçon exploitable. '
      + 'Format attendu : | date | ce qui a cassé | la cause | la porte |');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('❌ ' + e); }); process.exit(1); }
  var src = fs.readFileSync(FICHIER, 'utf8').split('\n');
  var n = src.filter(function (l) { return LIGNE.test(l); }).length;
  console.log('✅ check-lecons : ' + n + ' leçon(s), toutes rattachées à une porte qui existe');
}
