// scripts/_format-catalogue.js — ÉCRIRE products.json SANS LE REFORMATER.
//
// ⛔ POURQUOI CE FICHIER EXISTE. Le 08/08/2026, huit endroits du dépôt
// écrivaient le catalogue avec `JSON.stringify(…, null, 1)` alors que le
// fichier vit en indentation 2. Mesuré sur UNE fiche modifiée :
// `git diff --stat` a rendu **57 795 insertions et 57 772 suppressions**.
// Un diff pareil n'est pas un détail d'esthétique — plus personne ne peut
// relire ce qui change dans le fichier qui porte TOUS LES PRIX, et
// l'historique de chaque ligne du catalogue est noyé.
//
// ⚠️ AUCUN CHIFFRE N'EST GRAVÉ ICI. L'indentation se MESURE sur le fichier
// qu'on s'apprête à réécrire : c'est la seule valeur qui ne se périme pas.
// La deuxième ligne porte l'indentation du premier niveau.
//
// Porte : `check-products-json` compare l'indentation du disque à celle de la
// version en dépôt (`git show HEAD:`) — sabotage prouvé rouge.
'use strict';
var fs = require('fs');

/** Indentation du premier niveau, lue dans le texte. 2 par défaut. */
function indentDe(texte) {
  var l2 = String(texte || '').split('\n')[1] || '';
  return (l2.match(/^ */) || [''])[0].length || 2;
}

/**
 * Réécrit un JSON en conservant l'indentation ET la fin de ligne du fichier
 * d'origine. `texteOrigine` doit être le contenu LU avant modification ; à
 * défaut, on relit le fichier — jamais on ne suppose.
 */
function ecrireCommeAvant(chemin, donnees, texteOrigine) {
  var avant = (texteOrigine != null) ? texteOrigine
    : (fs.existsSync(chemin) ? fs.readFileSync(chemin, 'utf8') : '');
  var fin = /\n$/.test(avant) ? '\n' : '';
  fs.writeFileSync(chemin, JSON.stringify(donnees, null, indentDe(avant)) + fin, 'utf8');
}

module.exports = { indentDe: indentDe, ecrireCommeAvant: ecrireCommeAvant };
