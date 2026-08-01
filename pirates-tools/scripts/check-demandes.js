/* scripts/check-demandes.js — ON NE LIVRE PAS TANT QU'UNE DEMANDE EST OUVERTE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE

   Le 01/08/2026, l'user écrit :
     « il y a énormément de choses que je t'ai demandé et que tu n'as pas
       faite et ça c'est interdit. Il va falloir que tu les ajoutes dans tes
       putains de porte, tu ne livres pas le travail tant que tout n'est pas
       fait. »

   Il avait raison, et le mécanisme est banal : dans un échange long, une
   demande formulée en passant se noie sous les suivantes. Rien ne la
   retenait. Vu de son côté : du travail livré à moitié, et du temps perdu à
   re-signaler ce qui avait déjà été dit une fois.

   Aucune des portes existantes ne pouvait l'attraper. Elles vérifient toutes
   la même chose — que le CODE est cohérent. Aucune ne sait ce qui a été
   DEMANDÉ. C'est un angle mort de tout le dispositif, et il est resté ouvert
   jusqu'à ce que l'user le nomme.

   ─────────────────────────────────────────────────────────────────────────
   CE QU'ELLE FAIT

   Elle lit `docs/DEMANDES.md` et fait ÉCHOUER la CI tant qu'une ligne porte
   l'état `OUVERT`. Pas d'avertissement, pas de compteur : un refus.

   ⛔ CE QU'ELLE NE PEUT PAS FAIRE, et il faut le dire clairement : elle ne lit
   pas les conversations. Elle ne connaît que ce qui est ÉCRIT dans le
   registre. Une demande jamais consignée reste invisible pour elle.
   Cette porte ne remplace donc pas l'écoute — elle empêche seulement qu'une
   demande DÉJÀ RECONNUE se perde entre deux messages.

   ⚠️ Corollaire de méthode : une demande s'écrit dans le registre **avant**
   d'être traitée, pas après. Écrite après, elle a déjà pu être oubliée.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';
var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');
var REGISTRE = path.join(RACINE, 'docs', 'DEMANDES.md');

var ETATS = ['OUVERT', 'FAIT', 'RENDU'];

module.exports = function () {
  var errors = [];

  if (!fs.existsSync(REGISTRE)) {
    errors.push('[check-demandes] ⛔ `docs/DEMANDES.md` a disparu. C\'est le seul endroit '
      + 'où les demandes de l\'user sont retenues : sans lui, elles se reperdent une par une.');
    return errors;
  }
  var src = fs.readFileSync(REGISTRE, 'utf8');

  /* Une ligne de demande = une ligne de tableau avec un identifiant D-xx.
     On lit le registre, pas une idée qu'on s'en fait. */
  var lignes = src.split('\n').filter(function (l) { return /^\|\s*D-\d+\s*\|/.test(l); });

  // Préalable : un registre vide ferait verdir la porte sans rien vérifier.
  if (!lignes.length) {
    errors.push('[check-demandes] ⛔ PRÉALABLE : aucune ligne `D-xx` lisible dans le registre. '
      + 'Vert ici voudrait dire « rien n\'a été contrôlé » — c\'est exactement le faux vert '
      + 'que le projet refuse (« non exécuté n\'est pas vert »).');
    return errors;
  }

  var ouvertes = [], sansEtat = [];
  lignes.forEach(function (l) {
    var cols = l.split('|').map(function (c) { return c.trim(); });
    var id = cols[1] || '?';
    var quoi = cols[2] || '';
    var etat = null;
    ETATS.forEach(function (e) { if (l.indexOf('`' + e + '`') !== -1) etat = e; });
    if (!etat) { sansEtat.push(id + ' — ' + quoi.slice(0, 60)); return; }
    if (etat === 'OUVERT') ouvertes.push(id + ' — ' + quoi.slice(0, 90));
  });

  /* Un état absent est PIRE qu'un état « ouvert » : la ligne existe, elle
     n'annonce rien, et elle passerait inaperçue. On refuse aussi. */
  sansEtat.forEach(function (d) {
    errors.push('[check-demandes] ⛔ la demande ' + d + ' ne porte AUCUN état '
      + '(`OUVERT`, `FAIT` ou `RENDU`). Une ligne muette se lit comme faite, et ne l\'est pas.');
  });

  ouvertes.forEach(function (d) {
    errors.push('[check-demandes] ⛔ DEMANDE OUVERTE — ' + d
      + '\n      On ne livre pas tant qu\'elle est ouverte. Si elle dépend de l\'user ou '
      + 'qu\'il a tranché autrement, elle passe à `RENDU` avec le motif — pas à `FAIT`.');
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-demandes : aucune demande ouverte');
}
