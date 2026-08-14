// api/_lib/limites.js — LE BUDGET DE TAILLE D'UN DOCUMENT, EN UN SEUL ENDROIT.
//
// ⛔⛔ POURQUOI CE FICHIER EXISTE (14/08/2026). Un document Firestore plafonne à
// 1 048 576 octets — c'est une limite de la plateforme, pas un choix. Or les
// photos des fiches créées à la main y sont stockées EN BASE64 (jusqu'à
// 700 000 signes par visuel), et le champ vignette `img` recopie `images[0]` :
// une seule photo de 700 Ko compte DEUX fois, soit ~1,4 Mo — l'écriture
// échoue. Deux issues possibles, toutes deux payées par l'user :
//   · l'écriture PRINCIPALE échoue → erreur 500 sèche, sans dire pourquoi ;
//   · l'écriture du SHARD de snapshot échoue en silence → la fiche disparaît
//     au rafraîchissement alors que l'admin a vu « ✅ ».
// ⇒ Le budget se vérifie AVANT d'écrire, ici, et le refus DIT les chiffres :
// ce qui est trop gros, de combien, et quoi retirer.
//
// ⚠️ 950 000 et non 1 048 576 : la sérialisation JSON sous-estime le comptage
// propriétaire de Firestore (noms de champs, index). La marge absorbe l'écart —
// dans le sens SÛR : refuser un peu trop tôt coûte un message ; refuser trop
// tard coûte une fiche perdue.
'use strict';

var BUDGET_DOC_OCTETS = 950000;

/* Taille sérialisée approchée d'un document candidat. Les sentinelles
   Firestore (serverTimestamp…) sérialisent en petits objets : l'approximation
   reste large grâce à la marge du budget. */
function tailleDoc(obj) {
  try { return JSON.stringify(obj).length; } catch (e) { return Infinity; }
}

/* Le document tient-il dans le budget ? Rend { ok, octets, budget, depassement }
   — l'appelant construit son message avec les CHIFFRES, jamais un refus muet. */
function docDansLeBudget(obj) {
  var octets = tailleDoc(obj);
  return {
    ok: octets <= BUDGET_DOC_OCTETS,
    octets: octets,
    budget: BUDGET_DOC_OCTETS,
    depassement: Math.max(0, octets - BUDGET_DOC_OCTETS)
  };
}

module.exports = { BUDGET_DOC_OCTETS: BUDGET_DOC_OCTETS, tailleDoc: tailleDoc,
  docDansLeBudget: docDansLeBudget };
