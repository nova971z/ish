// api/_lib/accounting.js — Compte de résultat 100 % RÉEL (aucune estimation).
//
// Tout est calculé sur des données réelles :
//   • Revenus  = journal `payments` (Stripe) — montant encaissé exact.
//   • Coût des marchandises vendues (COGS) = coût d'achat RÉEL snapshoté à la vente
//     (payments.cogsHtCents, écrit par le webhook).
//   • Frais Stripe = commission RÉELLE prélevée (payments.stripeFeeCents).
//   • Autres charges (transport payé, octroi, CFE, assurance…) = SAISIES par
//     l'exploitant dans la collection `charges` (comme tout logiciel de compta).
//   • IS = barème réel (15 % jusqu'à 42 500 € de bénéfice, 25 % au-delà).
//
// Pur (aucune I/O). Testé par scripts/check-accounting.js.

'use strict';

var pricing = require('./pricing');

function round2(n) { return Math.round(n * 100) / 100; }
function c2e(cents) { return (Number(cents) || 0) / 100; }

function tvaFor(payment, cfg) {
  var code = (payment && (payment.territoryDeclared || payment.territoryFromAddress)) || (cfg && cfg.refTerritory) || '971';
  var t = pricing.getTerritory(code) || pricing.getTerritory('971');
  return t ? t.tvaRate : 0.085;
}

// Barème IS réel (France, PME) : 15 % jusqu'à 42 500 € de bénéfice, 25 % au-delà.
function computeIS(benefice, cfg) {
  if (!(benefice > 0)) return 0;
  var seuil = (cfg && cfg.isSeuil) || 42500;
  var tauxRed = (cfg && cfg.isReduit != null) ? cfg.isReduit : 0.15;
  var tauxNorm = (cfg && cfg.isNormal != null) ? cfg.isNormal : 0.25;
  if (benefice <= seuil) return benefice * tauxRed;
  return seuil * tauxRed + (benefice - seuil) * tauxNorm;
}

// payments : [{ amountCents, cogsHtCents, stripeFeeCents, status, territoryDeclared, recordedAtMs }]
// charges  : [{ amountHt, tvaDeductible, category, label, dateMs }]
function synthesize(payments, charges, cfg) {
  cfg = cfg || {};
  charges = charges || [];

  var succeeded = (payments || []).filter(function (p) { return p && p.status === 'succeeded' && p.amountCents > 0; });

  var caTtc = 0, tvaCollectee = 0, caHt = 0, cogs = 0, stripe = 0;
  var byMonth = {};
  var cogsConnu = true;
  succeeded.forEach(function (p) {
    var ttc = c2e(p.amountCents);
    var tva = tvaFor(p, cfg);
    var ht = ttc / (1 + tva);
    caTtc += ttc; caHt += ht; tvaCollectee += (ttc - ht);
    cogs += c2e(p.cogsHtCents);
    stripe += c2e(p.stripeFeeCents);
    if (p.cogsHtCents == null) cogsConnu = false;   // au moins une vente sans coût snapshoté
    var key = monthKey(p.recordedAtMs);
    (byMonth[key] = byMonth[key] || { ca_ttc: 0, ca_ht: 0, cogs: 0, ventes: 0 });
    byMonth[key].ca_ttc += ttc; byMonth[key].ca_ht += ht; byMonth[key].cogs += c2e(p.cogsHtCents); byMonth[key].ventes += 1;
  });

  // Charges saisies, regroupées par catégorie.
  var chargesParCat = {};
  var chargesTotal = 0, tvaDeductible = 0;
  charges.forEach(function (c) {
    var v = Number(c.amountHt) || 0;
    chargesParCat[c.category || 'autre'] = round2((chargesParCat[c.category || 'autre'] || 0) + v);
    chargesTotal += v;
    tvaDeductible += Number(c.tvaDeductible) || 0;
  });

  var margeBrute = caHt - cogs;
  var resultatExpl = margeBrute - stripe - chargesTotal;
  var is = computeIS(resultatExpl, cfg);
  var resultatNet = resultatExpl - is;

  var months = Object.keys(byMonth).sort().map(function (k) {
    return { mois: k, ca_ttc: round2(byMonth[k].ca_ttc), ca_ht: round2(byMonth[k].ca_ht), cogs: round2(byMonth[k].cogs), ventes: byMonth[k].ventes };
  });

  return {
    ca_ttc: round2(caTtc),
    tva_collectee: round2(tvaCollectee),
    ca_ht: round2(caHt),
    cogs: round2(cogs),
    marge_brute: round2(margeBrute),
    frais_stripe: round2(stripe),
    charges_saisies: round2(chargesTotal),
    charges_par_categorie: chargesParCat,
    resultat_exploitation: round2(resultatExpl),
    is: round2(is),
    resultat_net: round2(resultatNet),
    marge_nette_pct: caHt > 0 ? round2(resultatNet / caHt * 100) : 0,
    nb_ventes: succeeded.length,
    panier_moyen: succeeded.length ? round2(caTtc / succeeded.length) : 0,
    tva: { collectee: round2(tvaCollectee), deductible: round2(tvaDeductible), solde_a_reverser: round2(tvaCollectee - tvaDeductible) },
    par_mois: months,
    complet: cogsConnu,   // false si une vente n'a pas de coût snapshoté (données partielles)
    meta: { source: 'RÉEL — paiements Stripe + coûts snapshotés + charges saisies' }
  };
}

function monthKey(ms) {
  if (!ms) return '0000-00';
  var d = new Date(ms);
  var m = d.getUTCMonth() + 1;
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' + m : '' + m);
}

module.exports = { synthesize: synthesize, computeIS: computeIS, _round2: round2, _tvaFor: tvaFor };
