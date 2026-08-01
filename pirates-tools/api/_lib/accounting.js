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

/* REMBOURSEMENTS — pourquoi ce n'est PAS une charge
   ─────────────────────────────────────────────────────────────────────────
   Tentation : saisir un remboursement dans `charges`. Ce serait FAUX, et faux
   d'une façon qui se paie :

   · Un remboursement ANNULE une vente. Il diminue le CA et la **TVA
     COLLECTÉE**. Passé en charge, il gonflerait au contraire la TVA
     DÉDUCTIBLE : on réclamerait le remboursement d'une taxe jamais payée. Ce
     n'est pas une erreur de présentation, c'est une déclaration fausse.
   · Il n'annule PAS forcément le coût d'achat : si l'outil a déjà été commandé
     chez le fournisseur, le coût reste — l'outil part en stock, pas en fumée.
     D'où `cogsAnnuleHt`, saisi au cas par cas.
   · La commission Stripe n'est PAS supposée rendue. `stripeFeeRendu` se saisit
     d'après ce que le tableau de bord Stripe montre RÉELLEMENT (0 par défaut,
     l'hypothèse la plus défavorable). Ce fichier ne calcule que du réel : une
     supposition polie y serait un mensonge.

   ⚠️ CONDITION FISCALE — la récupération de la TVA sur une vente annulée est
   subordonnée à la RECTIFICATION DE LA FACTURE INITIALE (avoir / facture
   rectificative). Sans avoir émis au client, la TVA collectée reste due malgré
   le remboursement. D'où `avoirRef` : la synthèse RETRANCHE la TVA seulement
   quand l'avoir existe, et signale les autres au lieu de déduire une taxe
   qu'on n'a pas le droit de déduire. À vérifier à la source (J5) : CGI art.
   271 et 272 ; BOFiP BOI-TVA-DECLA-20-30-10-10 et BOI-TVA-DED-40-10-20.

   refunds : [{ amountTtc, cogsAnnuleHt, stripeFeeRendu, territory, dateMs,
                label, paymentId, avoirRef }]  — montants en EUROS. */
function applyRefunds(refunds, cfg) {
  var t = { ttc: 0, ht: 0, tva: 0, tvaSansAvoir: 0, cogsAnnule: 0, stripeRendu: 0,
            nb: 0, nbSansAvoir: 0, parMois: {} };
  (refunds || []).forEach(function (r) {
    var ttc = Number(r && r.amountTtc) || 0;
    if (!(ttc > 0)) return;                       // 0 ou négatif : ligne ignorée
    var tva = tvaFor({ territoryDeclared: r.territory }, cfg);
    var ht = ttc / (1 + tva);
    var taxe = ttc - ht;
    t.ttc += ttc; t.ht += ht; t.nb += 1;
    // La TVA ne se récupère QU'AVEC un avoir. Sans référence, on la laisse due :
    // mieux vaut un résultat pessimiste qu'un redressement.
    if (r.avoirRef) t.tva += taxe;
    else { t.tvaSansAvoir += taxe; t.nbSansAvoir += 1; }
    t.cogsAnnule += Math.max(0, Number(r.cogsAnnuleHt) || 0);
    /* ⚠️ DEUX NOMS ACCEPTÉS. `commissionRendue` est le nom courant depuis le
       01/08/2026 ; `stripeFeeRendu` est celui des avoirs DÉJÀ ENREGISTRÉS.
       Les renommer en base détruirait la lecture de pièces comptables
       existantes — on lit donc les deux, on n'écrit plus que le premier. */
    t.stripeRendu += Math.max(0, Number(r.commissionRendue != null ? r.commissionRendue : r.stripeFeeRendu) || 0);
    var k = monthKey(r.dateMs);
    (t.parMois[k] = t.parMois[k] || { ttc: 0, ht: 0, cogs: 0, nb: 0 });
    t.parMois[k].ttc += ttc; t.parMois[k].ht += ht;
    t.parMois[k].cogs += Math.max(0, Number(r.cogsAnnuleHt) || 0);
    t.parMois[k].nb += 1;
  });
  return t;
}

// payments : [{ amountCents, cogsHtCents, stripeFeeCents, status, territoryDeclared, recordedAtMs }]
// charges  : [{ amountHt, tvaDeductible, category, label, dateMs }]
// refunds  : [{ amountTtc, cogsAnnuleHt, stripeFeeRendu, territory, dateMs, label, avoirRef }]
function synthesize(payments, charges, cfg, refunds) {
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

  // Charges saisies, regroupées par catégorie. Les DONS (mécénat) sont
  // comptés à part : comptablement ce sont des charges, mais FISCALEMENT ils
  // ne sont PAS déductibles (réintégration au résultat imposable) — l'avantage
  // passe par une RÉDUCTION D'IMPÔT de 60 % du don, plafonnée à
  // max(20 000 €, 0,5 % du CA HT), excédent reportable 5 ans (art. 238 bis
  // CGI, vérifié 25/07/2026). Saisir la catégorie « don » ou « mécénat ».
  var chargesParCat = {};
  var chargesTotal = 0, tvaDeductible = 0, dons = 0;
  charges.forEach(function (c) {
    var v = Number(c.amountHt) || 0;
    var cat = c.category || 'autre';
    chargesParCat[cat] = round2((chargesParCat[cat] || 0) + v);
    chargesTotal += v;
    if (/^(don|dons|m[ée]c[ée]nat)$/i.test(cat)) dons += v;
    tvaDeductible += Number(c.tvaDeductible) || 0;
  });

  /* Remboursements : ils VIENNENT EN MOINS du chiffre d'affaires, pas en plus
     des charges (voir le long commentaire d'applyRefunds). On garde les
     totaux BRUTS à côté : un chiffre qui a bougé sans qu'on puisse voir de
     combien est un chiffre qu'on ne peut pas contrôler. */
  var rb = applyRefunds(refunds, cfg);
  var caTtcBrut = caTtc, caHtBrut = caHt, tvaBrute = tvaCollectee;
  var cogsBrut = cogs, stripeBrut = stripe;
  caTtc -= rb.ttc;
  caHt -= rb.ht;
  tvaCollectee -= rb.tva;              // uniquement la part couverte par un avoir
  cogs -= rb.cogsAnnule;               // outil jamais commandé → coût annulé
  stripe -= rb.stripeRendu;            // commission réellement rendue, saisie

  var margeBrute = caHt - cogs;
  var resultatExpl = margeBrute - stripe - chargesTotal;   // comptable (dons en charge)
  // Fiscal : dons réintégrés dans la base IS, puis réduction 60 % plafonnée.
  var baseIS = resultatExpl + dons;
  var plafondMecenat = Math.max(20000, 0.005 * caHt);
  var donsEligibles = Math.min(dons, plafondMecenat);
  var reductionMecenat = 0.6 * donsEligibles;
  var is = Math.max(0, computeIS(baseIS, cfg) - reductionMecenat);
  var resultatNet = resultatExpl - is;

  // Les mois où il n'y a EU QUE des remboursements doivent exister aussi,
  // sinon un mois négatif disparaît purement et simplement du tableau.
  Object.keys(rb.parMois).forEach(function (k) {
    if (!byMonth[k]) byMonth[k] = { ca_ttc: 0, ca_ht: 0, cogs: 0, ventes: 0 };
  });
  var months = Object.keys(byMonth).sort().map(function (k) {
    var r = rb.parMois[k] || { ttc: 0, ht: 0, cogs: 0, nb: 0 };
    return {
      mois: k,
      ca_ttc: round2(byMonth[k].ca_ttc - r.ttc),
      ca_ht: round2(byMonth[k].ca_ht - r.ht),
      cogs: round2(byMonth[k].cogs - r.cogs),
      ventes: byMonth[k].ventes,
      remboursements: r.nb,
      remb_ttc: round2(r.ttc)
    };
  });

  return {
    ca_ttc: round2(caTtc),
    tva_collectee: round2(tvaCollectee),
    ca_ht: round2(caHt),
    cogs: round2(cogs),
    marge_brute: round2(margeBrute),
    frais_encaissement: round2(stripe),
    frais_stripe: round2(stripe),   // alias hérité — lu par d'anciens écrans
    charges_saisies: round2(chargesTotal),
    charges_par_categorie: chargesParCat,
    resultat_exploitation: round2(resultatExpl),
    is: round2(is),
    resultat_net: round2(resultatNet),
    marge_nette_pct: caHt > 0 ? round2(resultatNet / caHt * 100) : 0,
    nb_ventes: succeeded.length,
    // Panier moyen = ce qu'un client dépense EN MOYENNE quand il achète. Il se
    // calcule donc sur le CA BRUT : un remboursement n'a pas rendu les paniers
    // plus petits, il a annulé une vente. Les deux chiffres ne parlent pas de
    // la même chose et ne doivent pas se contaminer.
    panier_moyen: succeeded.length ? round2(caTtcBrut / succeeded.length) : 0,
    // Totaux AVANT remboursements — pour pouvoir vérifier l'écart soi-même.
    brut: {
      ca_ttc: round2(caTtcBrut), ca_ht: round2(caHtBrut), tva_collectee: round2(tvaBrute),
      cogs: round2(cogsBrut), frais_encaissement: round2(stripeBrut), frais_stripe: round2(stripeBrut)
    },
    remboursements: {
      nb: rb.nb,
      total_ttc: round2(rb.ttc),
      total_ht: round2(rb.ht),
      tva_recuperee: round2(rb.tva),
      cogs_annule: round2(rb.cogsAnnule),
      stripe_rendu: round2(rb.stripeRendu),
      // ⚠️ Remboursements SANS avoir : la TVA correspondante reste DUE. Ce
      // n'est pas un détail de présentation — c'est de l'argent à reverser.
      sans_avoir: rb.nbSansAvoir,
      tva_non_recuperable: round2(rb.tvaSansAvoir)
    },
    tva: { collectee: round2(tvaCollectee), deductible: round2(tvaDeductible), solde_a_reverser: round2(tvaCollectee - tvaDeductible) },
    mecenat: {
      dons: round2(dons),
      plafond: round2(plafondMecenat),
      eligibles: round2(donsEligibles),
      reduction_is: round2(reductionMecenat),
      report_5_ans: round2(Math.max(0, dons - donsEligibles))
    },
    par_mois: months,
    ventes_par_marque: brandStats(payments, cfg),   // preuve partenariat fournisseur
    complet: cogsConnu,   // false si une vente n'a pas de coût snapshoté (données partielles)
    meta: { source: 'RÉEL — paiements Stripe + coûts snapshotés + charges et remboursements saisis' }
  };
}

// Ventes par MARQUE (preuve pour partenariat fournisseur, ex. seuil DeWALT
// ~10 000 €). Agrège les lignes réelles snapshotées à la vente (linesDetail
// avec brand + unitCents TTC territorial). Les lignes sans marque (remise
// fidélité, montants négatifs) sont ignorées. Retourne un tableau trié par CA
// TTC décroissant : [{ marque, unites, ca_ttc, ca_ht, ventes }].
function brandStats(payments, cfg) {
  cfg = cfg || {};
  var succeeded = (payments || []).filter(function (p) { return p && p.status === 'succeeded'; });
  var byBrand = {};
  succeeded.forEach(function (p) {
    var tva = tvaFor(p, cfg);
    var lines = Array.isArray(p.linesDetail) ? p.linesDetail : [];
    var brandsInSale = {};
    lines.forEach(function (l) {
      var brand = (l && l.brand ? String(l.brand) : '').trim();
      var unit = Number(l && l.unitCents) || 0;
      var qty = Number(l && l.qty) || 1;
      if (!brand || unit <= 0) return;   // ligne sans marque ou remise négative
      var ttc = c2e(unit) * qty;
      var b = (byBrand[brand] = byBrand[brand] || { marque: brand, unites: 0, ca_ttc: 0, ca_ht: 0, ventes: 0 });
      b.unites += qty;
      b.ca_ttc += ttc;
      b.ca_ht += ttc / (1 + tva);
      brandsInSale[brand] = true;
    });
    Object.keys(brandsInSale).forEach(function (brand) { byBrand[brand].ventes += 1; });
  });
  return Object.keys(byBrand).map(function (k) {
    return { marque: byBrand[k].marque, unites: byBrand[k].unites,
      ca_ttc: round2(byBrand[k].ca_ttc), ca_ht: round2(byBrand[k].ca_ht), ventes: byBrand[k].ventes };
  }).sort(function (a, b) { return b.ca_ttc - a.ca_ttc; });
}

function monthKey(ms) {
  if (!ms) return '0000-00';
  var d = new Date(ms);
  var m = d.getUTCMonth() + 1;
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' + m : '' + m);
}

module.exports = { synthesize: synthesize, brandStats: brandStats, computeIS: computeIS,
  applyRefunds: applyRefunds, _round2: round2, _tvaFor: tvaFor };
