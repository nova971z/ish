// api/_lib/verif-visibilite.js — CE QUI EST ÉCRIT EST-IL VRAIMENT SERVI ?
//
// ⛔⛔ POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST À PART.
// Après une écriture de fiche, le serveur doit prouver que le public verra
// bien la modification — sinon on retombe dans le mensonge du 14/08/2026
// (« ✅ » affiché sur une fiche qui disparaît au rafraîchissement).
// Mais la comparaison « écrit == servi » est PLUS SUBTILE qu'une égalité
// littérale, et ma première version s'est trompée. Résultat sur l'écran de
// l'user le 15/08/2026 : « modifications écrites mais NON VISIBLES » — une
// alarme sur une écriture pourtant parfaite. Une garde qui crie au loup est
// aussi nuisible qu'une garde muette : elle apprend à ignorer les alarmes.
//
// LES DEUX PIÈGES, ET POURQUOI ILS SONT STRUCTURELS :
//
// ① UN CHAMP DÉRIVÉ NE PEUT PAS ÊTRE ÉGAL À CE QU'ON A ÉCRIT. La vignette
//    `img` n'est plus stockée — elle doublait le poids du document — elle se
//    CALCULE à la lecture depuis `images[0]`. On écrit donc `img: null` et le
//    public voit la photo. Comparer littéralement, c'est comparer `null` à une
//    photo : faux à tous les coups, pour toujours.
//    ⇒ Pour un champ dérivé, on ne vérifie pas l'égalité : on vérifie que la
//    DÉRIVATION a bien eu lieu.
//
// ② L'ORDRE DES CLÉS N'EST PAS UNE DIFFÉRENCE. Les caractéristiques (`specs`)
//    sont une table ; une base de données ne garantit AUCUN ordre au retour.
//    `JSON.stringify` en fait pourtant deux textes différents. Comparer ainsi,
//    c'est déclarer invisible une fiche parfaitement servie, au hasard de
//    l'ordre des clés.
//    ⇒ On compare une forme CANONIQUE : clés triées, en profondeur.
//
// ⚠️ CE MODULE NE DÉCIDE RIEN D'AUTRE : il ne lit aucun service, n'écrit rien,
// et rend la liste des champs réellement absents. C'est l'appelant qui alerte.
'use strict';

/* Forme canonique : mêmes données ⇒ même texte, quel que soit l'ordre des
   clés. Les tableaux gardent leur ordre — il porte du sens, le premier visuel
   étant la vignette. */
function canonique(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonique).join(',') + ']';
  var cles = Object.keys(v).sort();
  return '{' + cles.map(function (k) {
    return JSON.stringify(k) + ':' + canonique(v[k]);
  }).join(',') + '}';
}

/* ⛔ LES CHAMPS DÉRIVÉS, ET LA RÈGLE QUI LES ÉPROUVE. Un champ dérivé n'est
   jamais comparé littéralement : on vérifie la dérivation elle-même.
   `img` : écrit à `null` quand des visuels sont fournis, calculé à la lecture
   comme `images[0]` (voir la dérivation dans api/_lib/catalog.js). */
var DERIVES = {
  img: function (patch, servi) {
    var visuels = patch.images;
    if (!Array.isArray(visuels) || !visuels.length) return null;   /* règle ordinaire */
    return (servi && servi.img === visuels[0])
      ? null
      : 'img (la vignette devrait être dérivée du premier visuel, elle ne l\'est pas)';
  }
};

/* Rend la liste des champs ÉCRITS que le public ne verra PAS correctement.
   Liste vide ⇒ la modification est réellement servie.
     `patch`  ce qu'on vient d'écrire
     `servi`  la fiche telle que le chemin public la rend
     `champs` les champs à éprouver (par défaut : ceux du patch)
   ⚠️ `servi` absent — fiche introuvable au catalogue — rend TOUT manquant :
   une liste vide se lirait « tout va bien », et ce serait le mensonge même
   qu'on répare. */
function champsNonServis(patch, servi, champs) {
  var liste = Array.isArray(champs) ? champs : Object.keys(patch || {});
  liste = liste.filter(function (k) { return k !== 'updatedAt' && k !== 'createdAt'; });
  if (!servi) return liste.length ? liste.slice() : ['(fiche absente du catalogue)'];
  var manquants = [];
  liste.forEach(function (k) {
    if (DERIVES[k]) {
      var faute = DERIVES[k](patch, servi);
      if (faute) manquants.push(faute);
      return;
    }
    if (canonique(servi[k]) !== canonique(patch[k])) manquants.push(k);
  });
  return manquants;
}

/* ⛔⛔ LE VERDICT COMPLET — ET POURQUOI IL VIT ICI, PAS CHEZ L'APPELANT.
   `champsNonServis` répond à « les champs sont-ils servis ? ». Le verdict que
   l'admin doit rendre répond à une question plus large : « dois-je alerter ? ».
   Les deux diffèrent sur un cas réel : une fiche MASQUÉE (`hidden`) est
   volontairement écartée du catalogue public (`applyOverrides` la filtre —
   api/_lib/catalog.js). L'écriture peut être parfaite ET la fiche absente :
   crier « NON VISIBLE » là-dessus refait la fausse alarme du 15/08 avec une
   autre cause — et une alarme fausse apprend à ignorer les alarmes.

   ⚠️ CETTE FONCTION EST LA SEULE COPIE DE LA DÉCISION. Les deux chemins
   d'écriture d'`api/admin.js` ET `scripts/banc-edition-fiche.js` l'appellent.
   C'est ce qui rend le banc opposable : s'il portait sa propre version de la
   règle, il validerait un comportement que la production n'a pas — le piège
   exact que ce projet paie depuis deux jours.

     `documentRelu`  le document tel qu'il vient d'être relu. C'est LUI qui
                     fait foi pour `hidden` : le patch peut ne pas en parler.
   Rend { visible, absents, masquee }. */
function verdictVisibilite(patch, servi, champs, documentRelu) {
  var masquee = !!(documentRelu && documentRelu.hidden);
  if (!servi && masquee) return { visible: true, absents: [], masquee: true };
  var absents = champsNonServis(patch, servi, champs);
  return { visible: absents.length === 0, absents: absents, masquee: masquee };
}

module.exports = { canonique: canonique, champsNonServis: champsNonServis,
  verdictVisibilite: verdictVisibilite, DERIVES: DERIVES };
