// api/_lib/accounting.js — Moteur de SYNTHÈSE comptable (compte de résultat).
//
// Principe (concret & vérifiable) :
//   • REVENUS = RÉELS, lus du journal `payments` (écrit par le webhook Stripe).
//     Le total encaissé concorde avec Stripe → chiffre opposable.
//   • STRUCTURE DE RÉSULTAT (coûts, IS, résultat net) = ESTIMÉE par le modèle de
//     marge cible. Clairement étiquetée « estimation » : l'expert-comptable la
//     valide avec les vraies factures d'achat / d'import.
//
// Pur (aucune I/O). Testé par scripts/check-accounting.js.

'use strict';

var pricing = require('./pricing');

function round2(n) { return Math.round(n * 100) / 100; }

// TVA applicable à un paiement selon son territoire (repli : territoire de réf).
function tvaFor(payment, cfg) {
  var code = (payment && (payment.territoryDeclared || payment.territoryFromAddress)) || cfg.refTerritory || '971';
  var t = pricing.getTerritory(code) || pricing.getTerritory('971');
  return t ? t.tvaRate : 0.085;
}

// payments : [{ amountCents, status, territoryDeclared, recordedAtMs }]
// cfg : config de tarification (is, targetNet, refTerritory…)
function synthesize(payments, cfg) {
  cfg = cfg || {};
  var is = (cfg.is != null) ? cfg.is : 0.15;
  var target = (cfg.targetNet != null) ? cfg.targetNet : 0.15;

  var succeeded = (payments || []).filter(function (p) { return p && p.status === 'succeeded' && p.amountCents > 0; });

  var caTtc = 0, tvaCollectee = 0, caHt = 0;
  var byMonth = {};
  succeeded.forEach(function (p) {
    var ttc = p.amountCents / 100;
    var tva = tvaFor(p, cfg);
    var ht = ttc / (1 + tva);          // revenu hors TVA (la TVA est reversée à l'État)
    caTtc += ttc; caHt += ht; tvaCollectee += (ttc - ht);
    var key = monthKey(p.recordedAtMs);
    if (!byMonth[key]) byMonth[key] = { ca_ttc: 0, ca_ht: 0, ventes: 0 };
    byMonth[key].ca_ttc += ttc; byMonth[key].ca_ht += ht; byMonth[key].ventes += 1;
  });

  var nbVentes = succeeded.length;
  var panierMoyen = nbVentes ? caTtc / nbVentes : 0;

  // ── Estimation du résultat (modèle) ────────────────────────
  // Cible : résultat net après IS ≈ target × CA HT. On remonte à l'exploitation.
  var resultatNet = target * caHt;
  var resultatAvantIS = (is < 1) ? resultatNet / (1 - is) : resultatNet;
  var isEstime = resultatAvantIS - resultatNet;
  var chargesTotales = caHt - resultatAvantIS;   // coût marchandises + transport + octroi + Stripe + frais fixes

  var months = Object.keys(byMonth).sort().map(function (k) {
    return { mois: k, ca_ttc: round2(byMonth[k].ca_ttc), ca_ht: round2(byMonth[k].ca_ht), ventes: byMonth[k].ventes };
  });

  return {
    reel: {
      ca_ttc: round2(caTtc),
      ca_ht: round2(caHt),
      tva_collectee: round2(tvaCollectee),
      nb_ventes: nbVentes,
      panier_moyen: round2(panierMoyen)
    },
    estime: {
      charges_totales: round2(chargesTotales),
      resultat_avant_is: round2(resultatAvantIS),
      is: round2(isEstime),
      resultat_net: round2(resultatNet),
      marge_nette_pct: caHt > 0 ? round2(resultatNet / caHt * 100) : 0
    },
    tva: {
      collectee: round2(tvaCollectee),
      note: 'TVA déductible (sur achats/frais) à renseigner par l’expert-comptable — solde à reverser = collectée − déductible.'
    },
    par_mois: months,
    meta: {
      is_taux: is, cible_net: target,
      revenus_source: 'payments (Stripe) — RÉEL',
      resultat_source: 'modèle de marge — ESTIMATION (à valider par l’expert-comptable)'
    }
  };
}

function monthKey(ms) {
  if (!ms) return '0000-00';
  var d = new Date(ms);
  var m = d.getUTCMonth() + 1;
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' + m : '' + m);
}

module.exports = { synthesize: synthesize, _round2: round2, _tvaFor: tvaFor };
