// api/_lib/loyalty.js — Fidélité côté serveur (source de vérité débitable).
//
// ⚠️ MIROIR CLIENT : les paliers ci-dessous DOIVENT rester identiques à
// LOYALTY_TIERS dans app.js (affichage). Parité gardée par
// scripts/check-loyalty.js (CI).
//
// Pourquoi serveur : l'état fidélité client vit en localStorage — falsifiable
// en 10 s via la console. La dépense prise en compte pour la remise est donc
// recalculée depuis le journal Firestore `payments/` (écrit UNIQUEMENT par le
// webhook Stripe via l'Admin SDK ; les règles Firestore n'ouvrent pas cette
// collection aux clients). Un client ne peut augmenter son palier qu'en payant
// réellement.
//
// Fail-open assumé : sans Firestore/uid, la remise est simplement de 0 %
// (jamais de blocage du paiement pour un problème de fidélité).

'use strict';

var TIERS = [
  { key: 'bronze',  label: 'Bronze',  min: 0,    discountPct: 0 },
  { key: 'argent',  label: 'Argent',  min: 500,  discountPct: 2 },
  { key: 'or',      label: 'Or',      min: 2000, discountPct: 5 },
  { key: 'platine', label: 'Platine', min: 5000, discountPct: 8 }
];

function tierForSpendEur(spentEur) {
  var current = TIERS[0];
  for (var i = 0; i < TIERS.length; i++) {
    if (spentEur >= TIERS[i].min) current = TIERS[i];
  }
  return current;
}

// Somme des paiements CONFIRMÉS (webhook) de cet uid, en cents.
// Requête à égalités multiples : servie par les index automatiques Firestore
// (fusion d'index mono-champ), aucun index composite requis.
async function verifiedSpendCents(db, uid) {
  if (!db || !uid) return 0;
  var snap = await db.collection('payments')
    .where('uid', '==', uid)
    .where('status', '==', 'succeeded')
    .get();
  var sum = 0;
  snap.forEach(function (doc) {
    var a = doc.data().amountCents;
    if (typeof a === 'number' && isFinite(a) && a > 0) sum += a;
  });
  return sum;
}

// Devis de remise pour un total en cents. Ne jette jamais (fail-open 0 %).
async function quote(db, uid, totalCents) {
  var none = { pct: 0, discountCents: 0, verifiedSpendCents: 0, tierKey: TIERS[0].key, tierLabel: TIERS[0].label };
  try {
    var spendCents = await verifiedSpendCents(db, uid);
    var tier = tierForSpendEur(spendCents / 100);
    var discountCents = Math.round(totalCents * tier.discountPct / 100);
    return {
      pct: tier.discountPct,
      discountCents: discountCents,
      verifiedSpendCents: spendCents,
      tierKey: tier.key,
      tierLabel: tier.label
    };
  } catch (e) {
    console.error('[loyalty] quote failed (fail-open 0 %):', e.message);
    return none;
  }
}

module.exports = {
  TIERS: TIERS,
  tierForSpendEur: tierForSpendEur,
  verifiedSpendCents: verifiedSpendCents,
  quote: quote
};
