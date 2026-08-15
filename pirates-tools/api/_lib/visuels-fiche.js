// api/_lib/visuels-fiche.js — UNE PHOTO, UN DOCUMENT.
//
// ⛔⛔ LE MUR QUE CE MODULE ABAT, mesuré le 15/08/2026 sur sa plainte
// « je ne peux pas ajouter plus de deux PNG sur un seul produit » :
//   plafond par image (IMG_MAX, api/admin.js) .... 700 000 caractères
//   budget du document entier (limites.js) ....... 950 000 octets
//   ⇒ deux photos au plafond = 1 400 000 : REFUSÉ.
// Les visuels étaient stockés EN BASE64 DANS le document de la fiche, et un
// document Firestore plafonne à 1 Mio. Le formulaire en promettait six ;
// l'architecture en autorisait deux, et encore, seulement légères. Ce n'était
// pas un réglage trop serré : aucun ajustement de qualité ne déplace un mur.
//
// ⇒ Chaque visuel part dans SON document, `product_images/{ficheId}_{rang}`.
// Chacun dispose alors de son propre mégaoctet. La fiche ne garde qu'un
// compteur : quelques octets au lieu de plusieurs centaines de milliers.
//
// ⚠️ POURQUOI PAS FIREBASE STORAGE, qui serait plus élégant (pas de base64,
// pas les 33 % de surcoût) : le bucket est déclaré et la CSP le couvrirait,
// MAIS `storage.rules` est en refus total hors vidéos de course, et son propre
// commentaire dit que Storage « doit être activé une fois dans la console ».
// Je ne peux pas le vérifier d'ici. Faire dépendre ce correctif d'une action
// que je ne contrôle pas ferait une quatrième livraison ratée sur le même
// sujet. On reste donc sur Firestore, dont on SAIT qu'il marche.
//
// ⚠️ COMPATIBILITÉ : une fiche ancienne porte encore ses visuels en clair dans
// `images`. On ne migre rien de force — `lireVisuels` rend `null` quand il n'y
// a pas de compteur, et l'appelant garde alors ce que la fiche contient.
'use strict';

var COLLECTION = 'product_images';
/* 6 visuels maximum, comme le formulaire l'annonce (api/admin.js). Un rang
   au-delà signalerait une incohérence, pas une envie : on refuse. */
var MAX_VISUELS = 6;
/* Un document Firestore plafonne à 1 Mio. On garde de la marge pour les
   champs d'accompagnement (rang, fiche, horodatage) et pour l'encodage. */
var BUDGET_VISUEL = 950000;

function cle(id, rang) { return String(id) + '_' + rang; }

/* Écrit les visuels dans leurs documents et rend le nombre écrit.
   ⛔ NETTOIE LES RANGS DEVENUS INUTILES : passer de 4 photos à 2 doit effacer
   les rangs 3 et 4, sinon une lecture ultérieure les ressusciterait et l'user
   verrait revenir des visuels qu'il vient de retirer. */
async function ecrireVisuels(db, admin, id, images, ancienNombre) {
  var liste = Array.isArray(images) ? images : [];
  if (liste.length > MAX_VISUELS) {
    throw new Error('visuels : ' + MAX_VISUELS + ' maximum (' + liste.length + ' reçus)');
  }
  /* ⛔⛔ LE PLAFOND N'A PAS DISPARU, IL A CHANGÉ DE PLACE — et il fallait le
     redire ici. Tant que les photos vivaient dans la fiche, c'est le budget du
     document qui les bornait ; en les sortant, ce garde-fou est tombé et une
     image absurde serait passée jusqu'à faire éclater SON PROPRE document.
     Trouvé par `scripts/banc-edition-fiche.js` au premier essai : son cycle 3
     — « une photo trop lourde doit être refusée » — est devenu vert alors que
     rien ne la refusait plus. Une protection qu'on déplace sans la reposer est
     une protection supprimée.
     ⇒ Chaque visuel doit tenir dans son document, marge comprise. */
  for (var k = 0; k < liste.length; k++) {
    var poids = String(liste[k] || '').length;
    if (poids > BUDGET_VISUEL) {
      throw new Error('visuel ' + (k + 1) + ' : ' + poids + ' caractères pour un plafond de '
        + BUDGET_VISUEL + ' — il ne tiendrait pas dans son propre document');
    }
  }
  for (var i = 0; i < liste.length; i++) {
    await db.collection(COLLECTION).doc(cle(id, i)).set({
      data: liste[i],
      rang: i,
      fiche: String(id),
      majLe: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: false });
  }
  var avant = Number(ancienNombre) || 0;
  for (var j = liste.length; j < avant; j++) {
    try { await db.collection(COLLECTION).doc(cle(id, j)).delete(); }
    catch (e) { /* un rang déjà absent n'est pas une panne */ }
  }
  return liste.length;
}

/* Rend le tableau des visuels, ou `null` si la fiche n'en déclare aucun.
   ⛔ `null` veut dire « je n'ai rien à dire », PAS « il n'y en a pas ». La
   distinction décide du sort des fiches anciennes : l'appelant doit alors
   garder ce que le document porte déjà.
   ⚠️ Une lecture qui échoue rend `null` elle aussi, jamais un tableau vide :
   servir une fiche sans sa photo est moins grave que la servir en AFFIRMANT
   qu'elle n'en a pas — la seconde efface le travail de l'user à l'écran. */
async function lireVisuels(db, id, nombre) {
  var n = Number(nombre) || 0;
  if (!(n > 0)) return null;
  var refs = [];
  for (var i = 0; i < Math.min(n, MAX_VISUELS); i++) {
    refs.push(db.collection(COLLECTION).doc(cle(id, i)));
  }
  try {
    var docs = await db.getAll.apply(db, refs);
    var out = [];
    docs.forEach(function (d) {
      if (d && d.exists) {
        var v = d.data();
        if (v && typeof v.data === 'string' && v.data) out.push(v.data);
      }
    });
    return out.length ? out : null;
  } catch (e) {
    console.error('[visuels-fiche] lecture échouée pour', id, ':', e.message);
    return null;
  }
}

/* Efface tous les visuels d'une fiche — à appeler quand l'override disparaît,
   sinon les documents restent orphelins ET facturés. */
async function effacerVisuels(db, id, nombre) {
  var n = Number(nombre) || MAX_VISUELS;
  for (var i = 0; i < Math.min(n, MAX_VISUELS); i++) {
    try { await db.collection(COLLECTION).doc(cle(id, i)).delete(); }
    catch (e) { /* déjà absent */ }
  }
}

module.exports = {
  COLLECTION: COLLECTION, MAX_VISUELS: MAX_VISUELS, cle: cle,
  ecrireVisuels: ecrireVisuels, lireVisuels: lireVisuels,
  effacerVisuels: effacerVisuels, BUDGET_VISUEL: BUDGET_VISUEL
};
