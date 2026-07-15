// api/_lib/postal.js — Dérivation du territoire fiscal depuis un code postal.
//
// Contrôle d'intégrité A1 : le client déclare son territoire (body.territory)
// pour l'affichage ET le calcul du montant débité. Ce module permet au webhook
// de confronter ce territoire déclaré à l'adresse réellement collectée par
// Stripe (livraison Checkout / facturation carte) et de signaler toute
// divergence (ex. déclaré 976 Mayotte 0 % taxe, adresse 97110 Guadeloupe).
//
// Codes postaux DOM : 971xx Guadeloupe (inclut 97133 St-Barthélemy et
// 97150 St-Martin, rattachés au régime 971 côté boutique), 972xx Martinique,
// 973xx Guyane, 974xx La Réunion, 976xx Mayotte (aussi 985xx historique, non
// utilisé en pratique — non mappé volontairement).

'use strict';

var PREFIX_TO_TERRITORY = {
  '971': '971',
  '972': '972',
  '973': '973',
  '974': '974',
  '976': '976'
};

// Retourne le code territoire ('971'…'976') ou null si le code postal ne
// correspond à aucun territoire desservi (métropole, étranger, invalide).
function territoryFromPostal(postalCode) {
  var digits = String(postalCode == null ? '' : postalCode).replace(/\D/g, '');
  if (digits.length < 3) return null;
  return PREFIX_TO_TERRITORY[digits.slice(0, 3)] || null;
}

// Extrait le meilleur code postal disponible d'un objet adresse Stripe
// ({ postal_code, country, … }) — null si absent.
function postalFromStripeAddress(address) {
  if (!address || typeof address !== 'object') return null;
  var pc = address.postal_code;
  return (typeof pc === 'string' && pc.trim()) ? pc.trim() : null;
}

module.exports = {
  territoryFromPostal: territoryFromPostal,
  postalFromStripeAddress: postalFromStripeAddress
};
