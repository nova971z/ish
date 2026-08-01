// scripts/check-accounting.js — Vérifie le moteur de compte de résultat RÉEL.
'use strict';
var acc = require('../api/_lib/accounting');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-accounting] ' + m); }
  function near(a, b, t, m) { ok(Math.abs(a - b) <= t, m + ' (attendu ~' + b + ', obtenu ' + a + ')'); }

  var pays = [
    { amountCents: 12000, cogsHtCents: 6000, stripeFeeCents: 200, status: 'succeeded', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 0, 10) },
    { amountCents: 24000, cogsHtCents: 12000, stripeFeeCents: 400, status: 'succeeded', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 1, 5) },
    { amountCents: 9900, cogsHtCents: 5000, stripeFeeCents: 100, status: 'failed', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 1, 6) }
  ];
  var charges = [
    { amountHt: 50, category: 'transport', tvaDeductible: 0 },
    { amountHt: 30, category: 'cfe', tvaDeductible: 0 }
  ];
  var s = acc.synthesize(pays, charges, { refTerritory: '971' });

  ok(s.nb_ventes === 2, 'ignore les paiements non réussis');
  near(s.ca_ttc, 360, 0.01, 'CA TTC réel');
  near(s.ca_ht, 331.80, 0.05, 'CA HT');
  near(s.tva_collectee, 28.20, 0.05, 'TVA collectée');
  near(s.cogs, 180, 0.01, 'COGS réel (coûts snapshotés)');
  near(s.marge_brute, 151.80, 0.05, 'marge brute = CA HT − COGS');
  near(s.frais_stripe, 6, 0.01, 'frais Stripe réels');
  near(s.charges_saisies, 80, 0.01, 'charges saisies totalisées');
  near(s.resultat_exploitation, 65.80, 0.05, 'résultat exploitation');
  near(s.is, 65.80 * 0.15, 0.02, 'IS 15 % sous le seuil');
  near(s.resultat_net, s.resultat_exploitation - s.is, 0.02, 'résultat net');
  ok(s.charges_par_categorie.transport === 50 && s.charges_par_categorie.cfe === 30, 'charges par catégorie');
  ok(s.complet === true, 'complet=true (tous les coûts snapshotés)');

  // Barème IS : 50 000 € → 42 500×15 % + 7 500×25 %.
  near(acc.computeIS(50000, {}), 42500 * 0.15 + 7500 * 0.25, 0.01, 'barème IS 15/25 %');
  ok(acc.computeIS(-100, {}) === 0, 'pas d\'IS sur une perte');

  // Vente sans coût snapshoté → complet=false, pas de plantage.
  var partial = acc.synthesize([{ amountCents: 12000, status: 'succeeded', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 0, 10) }], [], {});
  ok(partial.complet === false, 'complet=false si un coût manque');

  // Vide → tout à zéro.
  var z = acc.synthesize([], [], {});
  ok(z.ca_ttc === 0 && z.resultat_net === 0 && z.panier_moyen === 0, 'vide géré proprement');

  // ── Ventes par marque (preuve partenariat) ──
  var bpays = [
    { status: 'succeeded', territoryDeclared: '971', linesDetail: [
      { name: 'Visseuse', qty: 1, unitCents: 60000, brand: 'DeWALT' },
      { name: 'Batterie', qty: 2, unitCents: 20000, brand: 'DeWALT' }
    ] },
    { status: 'succeeded', territoryDeclared: '971', linesDetail: [
      { name: 'Scie', qty: 1, unitCents: 30000, brand: 'Makita' },
      { name: 'Remise fidélité −5 %', qty: 1, unitCents: -2000, brand: '' }
    ] },
    { status: 'failed', territoryDeclared: '971', linesDetail: [
      { name: 'Perfo', qty: 1, unitCents: 99900, brand: 'DeWALT' }
    ] }
  ];
  var bs = acc.brandStats(bpays, { refTerritory: '971' });
  ok(bs.length === 2, 'deux marques agrégées (échec ignoré)');
  var dw = bs.filter(function (b) { return b.marque === 'DeWALT'; })[0];
  ok(dw && dw.unites === 3, 'DeWALT : 3 unités (1 + 2)');
  near(dw.ca_ttc, 1000, 0.01, 'DeWALT CA TTC = 600 + 2×200');
  ok(dw.ventes === 1, 'DeWALT compté sur 1 vente');
  var mk = bs.filter(function (b) { return b.marque === 'Makita'; })[0];
  near(mk.ca_ttc, 300, 0.01, 'Makita CA TTC (remise négative ignorée)');
  ok(bs[0].marque === 'DeWALT', 'tri par CA TTC décroissant');
  ok(dw.ca_ht < dw.ca_ttc, 'CA HT dérivé sous le TTC');

  // ── Mécénat (art. 238 bis CGI) : don ≠ charge déductible ────────────────
  // 10 000 € de CA HT, 1 000 € de don : le don est réintégré dans la base IS
  // (base = résultat comptable + don) puis réduction de 60 % du don.
  var payMec = [{ amountCents: 1085000, status: 'succeeded', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 0, 5) }]; // 10 850 TTC → 10 000 HT (8,5 %)
  var mec = acc.synthesize(payMec, [{ amountHt: 1000, category: 'don', label: 'Asso 971' }], { refTerritory: '971' });
  near(mec.mecenat.dons, 1000, 0.01, 'dons détectés (catégorie don)');
  near(mec.mecenat.plafond, 20000, 0.01, 'plafond = max(20 000, 0,5 % CA) → 20 000 ici');
  near(mec.mecenat.reduction_is, 600, 0.01, 'réduction IS = 60 % du don');
  ok(mec.mecenat.report_5_ans === 0, 'pas de report sous le plafond');
  // Base IS réintégrée : résultat comptable (CA - don) + don = CA → IS plein sur 10 000,
  // puis −600 de réduction. Sans réintégration l'IS serait calculé sur 9 000 (FAUX).
  var isSansDon = acc.synthesize(payMec, [], { refTerritory: '971' }).is;
  near(mec.is, Math.max(0, isSansDon - 600), 0.01, 'IS = IS(base réintégrée) − 60 % du don');
  ok(mec.resultat_net === Math.round((mec.resultat_exploitation - mec.is) * 100) / 100, 'résultat net comptable cohérent');
  // Don énorme → plafonné + report.
  var big = acc.synthesize(payMec, [{ amountHt: 25000, category: 'mécénat', label: 'X' }], { refTerritory: '971' });
  near(big.mecenat.eligibles, 20000, 0.01, 'don plafonné à 20 000');
  near(big.mecenat.report_5_ans, 5000, 0.01, 'excédent reportable 5 ans');

  /* ── REMBOURSEMENTS ──────────────────────────────────────────────────────
     Le traqueur applique les promos automatiquement (décision user 31/07/2026).
     Un client peut donc payer un prix soldé que le fournisseur ne pratique
     déjà plus : la commande est annulée et remboursée. La compta doit le
     refléter SANS se tromper de sens.
     ⛔ Le piège central : un remboursement diminue la TVA COLLECTÉE. Saisi en
     charge, il gonflerait la TVA DÉDUCTIBLE — on réclamerait le remboursement
     d'une taxe jamais payée. Ce contrôle existe pour que les deux ne puissent
     jamais être confondus. */
  var base1 = { amountCents: 10850, cogsHtCents: 6000, stripeFeeCents: 200,
    status: 'succeeded', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 2, 10) };
  var sansR = acc.synthesize([base1], [], { refTerritory: '971' });
  near(sansR.ca_ttc, 108.50, 0.01, 'témoin : CA TTC sans remboursement');
  near(sansR.tva_collectee, 8.50, 0.02, 'témoin : TVA collectée 8,5 % (971)');

  // 1) Remboursement TOTAL, avoir émis, outil jamais commandé, l ancien fournisseur ne rend rien.
  var rTotal = [{ amountTtc: 108.50, cogsAnnuleHt: 60, stripeFeeRendu: 0,
    territory: '971', avoirRef: 'AV-2026-001', dateMs: Date.UTC(2026, 2, 12) }];
  var s1 = acc.synthesize([base1], [], { refTerritory: '971' }, rTotal);
  near(s1.ca_ttc, 0, 0.01, 'remboursement total → CA TTC ramené à zéro');
  near(s1.tva_collectee, 0, 0.02, 'remboursement total avec avoir → TVA collectée annulée');
  near(s1.cogs, 0, 0.01, 'outil jamais commandé → COGS annulé');
  near(s1.frais_stripe, 2, 0.01,
    '⛔ la commission Stripe NON rendue doit RESTER une charge. La supposer '
    + 'restituée ferait apparaître un résultat qui n\'existe pas.');
  near(s1.resultat_exploitation, -2, 0.01, 'il reste exactement la perte de commission');
  near(s1.brut.ca_ttc, 108.50, 0.01, 'le CA BRUT reste visible à côté du net');
  ok(s1.remboursements.nb === 1, 'le nombre de remboursements est exposé');
  near(s1.remboursements.total_ttc, 108.50, 0.01, 'total remboursé TTC exposé');

  // 2) ⛔ SENS DE LA TVA — un remboursement ne doit JAMAIS toucher la déductible.
  ok(s1.tva.deductible === sansR.tva.deductible,
    '⛔ un remboursement a bougé la TVA DÉDUCTIBLE. C\'est le sens inverse : il '
    + 'annule une TVA qu\'on a COLLECTÉE, il ne crée pas une TVA qu\'on aurait payée. '
    + 'Saisi ainsi, on réclamerait au fisc une taxe jamais versée.');
  ok(s1.tva.solde_a_reverser < sansR.tva.solde_a_reverser,
    'la TVA à reverser DIMINUE après un remboursement couvert par un avoir');

  // 3) SANS avoir : la TVA reste due. Le plus contre-intuitif, donc le plus utile.
  var rSansAvoir = [{ amountTtc: 108.50, cogsAnnuleHt: 60, stripeFeeRendu: 0,
    territory: '971', dateMs: Date.UTC(2026, 2, 12) }];
  var s2 = acc.synthesize([base1], [], { refTerritory: '971' }, rSansAvoir);
  near(s2.ca_ttc, 0, 0.01, 'sans avoir : le CA baisse quand même (l\'argent est parti)');
  near(s2.tva_collectee, 8.50, 0.02,
    '⛔ sans avoir, la TVA collectée doit RESTER DUE. La récupération est '
    + 'subordonnée à la rectification de la facture initiale (J5, CGI 271/272). '
    + 'La retrancher sans avoir, c\'est se déclarer un crédit qu\'on ne peut pas justifier.');
  ok(s2.remboursements.sans_avoir === 1, 'les remboursements sans avoir sont COMPTÉS');
  near(s2.remboursements.tva_non_recuperable, 8.50, 0.02,
    'le montant de TVA non récupérable est CHIFFRÉ — sinon on ne sait pas quoi régulariser');
  /* ⚠️ 1ʳᵉ VERSION FAUSSE de cette assertion : elle exigeait un
     `resultat_exploitation` PLUS MAUVAIS sans avoir. Elle est tombée en rouge,
     et elle avait tort — la TVA n'est pas une charge, c'est une taxe collectée
     pour le Trésor : elle ne traverse pas le compte de résultat. L'absence
     d'avoir ne coûte pas du RÉSULTAT, elle coûte de la TRÉSORERIE — 8,50 € à
     reverser sur une vente qui n'a pas eu lieu. C'est là qu'il faut regarder. */
  ok(s2.tva.solde_a_reverser > s1.tva.solde_a_reverser,
    'sans avoir, la TVA À REVERSER reste plus élevée qu\'avec : on doit une taxe '
    + 'sur une vente annulée tant que la facture n\'est pas rectifiée');
  near(s2.tva.solde_a_reverser - s1.tva.solde_a_reverser, 8.50, 0.02,
    'l\'écart vaut exactement la TVA de la vente remboursée');
  near(s2.resultat_exploitation, s1.resultat_exploitation, 0.01,
    'le RÉSULTAT, lui, est identique : la TVA ne le traverse pas');

  // 4) Outil DÉJÀ commandé → le coût reste (il part en stock, pas en fumée).
  var rStock = [{ amountTtc: 108.50, cogsAnnuleHt: 0, stripeFeeRendu: 0,
    territory: '971', avoirRef: 'AV-2026-002', dateMs: Date.UTC(2026, 2, 12) }];
  var s3 = acc.synthesize([base1], [], { refTerritory: '971' }, rStock);
  near(s3.cogs, 60, 0.01,
    'outil déjà commandé → le COGS RESTE. L\'annuler d\'office ferait disparaître '
    + 'un achat bien réel du compte de résultat.');
  ok(s3.resultat_exploitation < s1.resultat_exploitation, 'garder le stock coûte plus cher que l\'annuler');

  // 5) Le panier moyen ne doit PAS être contaminé : il mesure ce qu'un client
  //    dépense quand il achète, pas ce qui reste après annulation.
  near(s1.panier_moyen, 108.50, 0.01,
    'le panier moyen reste calculé sur le CA BRUT — un remboursement annule une '
    + 'vente, il ne rend pas les paniers plus petits');

  // 6) Mois : un remboursement apparaît dans SON mois, et un mois qui n'a QUE
  //    des remboursements ne doit pas disparaître du tableau.
  var rAutreMois = [{ amountTtc: 108.50, cogsAnnuleHt: 60, stripeFeeRendu: 0,
    territory: '971', avoirRef: 'AV-2026-003', dateMs: Date.UTC(2026, 5, 3) }];
  var s4 = acc.synthesize([base1], [], { refTerritory: '971' }, rAutreMois);
  var moisRemb = s4.par_mois.filter(function (m) { return m.remboursements > 0; });
  ok(moisRemb.length === 1 && moisRemb[0] && moisRemb[0].mois === '2026-06',
    'un mois sans vente mais avec remboursement existe dans par_mois (sinon un mois négatif s\'évapore)');
  /* ⚠️ Le sabotage « le mois sans vente disparaît » faisait CRASHER ce contrôle
     (TypeError sur moisRemb[0]) au lieu de le faire échouer proprement. Un
     contrôle qui plante interrompt toute la CI et masque les suivants : il doit
     REPORTER, pas exploser. D'où la garde. */
  if (moisRemb[0]) near(moisRemb[0].ca_ttc, -108.50, 0.01, 'ce mois-là est NÉGATIF, et on le voit');
  else ok(false, 'aucun mois de remboursement dans par_mois — le mois négatif s\'est évaporé');

  // 7) Lignes aberrantes ignorées sans planter.
  var sJunk = acc.synthesize([base1], [], { refTerritory: '971' },
    [{ amountTtc: 0 }, { amountTtc: -50 }, {}, null]);
  near(sJunk.ca_ttc, 108.50, 0.01, 'montant nul, négatif ou vide → ligne ignorée');
  ok(sJunk.remboursements.nb === 0, 'aucune ligne aberrante comptée');

  // 8) Rétrocompatibilité : les appels à 3 arguments doivent rester identiques.
  ok(JSON.stringify(acc.synthesize([base1], [], { refTerritory: '971' }))
     === JSON.stringify(acc.synthesize([base1], [], { refTerritory: '971' }, [])),
    'synthesize sans 4e argument == avec une liste vide (aucun appel existant cassé)');

  /* ── ABONNEMENT REVOLUT — la charge fixe qui n'apparaît dans aucune vente ──
     Revolut prélève une commission par vente (déjà dans `payments`) ET un
     abonnement mensuel débité du compte, invisible du journal des ventes.
     Sans ces contrôles, 120 €/an disparaîtraient du résultat — et l'IS serait
     calculé sur un bénéfice trop élevé. */
  var payAbo = [{ amountCents: 12000, cogsHtCents: 6000, stripeFeeCents: 200,
    status: 'succeeded', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 0, 10) }];
  var cfgAbo = { refTerritory: '971', abonnementMensuel: 10, nowMs: Date.UTC(2026, 7, 1) };

  // a) Sans date d'ouverture : on part du PREMIER encaissement (janv. → août = 8 mois).
  var a1 = acc.moisAbonnes(payAbo, cfgAbo);
  ok(a1.mois === 8, 'abonnement : 8 mois de janvier à août inclus (obtenu ' + a1.mois + ')');
  near(a1.total, 80, 0.01, 'abonnement : 8 × 10 €');
  ok(a1.depuis === '2026-01', 'abonnement : le mois de départ est rendu, donc vérifiable');

  // b) Date d'ouverture saisie : elle PRIME sur le premier paiement.
  var a2 = acc.moisAbonnes(payAbo, Object.assign({}, cfgAbo, { abonnementDebutMs: Date.UTC(2025, 11, 1) }));
  ok(a2.mois === 9 && a2.depuis === '2025-12', 'abonnement : la date saisie prime sur le premier paiement');

  // c) ⛔ Aucun paiement, aucune date → ZÉRO. Jamais un mois inventé.
  var a3 = acc.moisAbonnes([], cfgAbo);
  ok(a3.mois === 0 && a3.total === 0, 'abonnement : rien de réel à compter → 0, pas d\'estimation');

  // d) Montant mensuel à 0 → rien, et pas de division ni de NaN.
  var a4 = acc.moisAbonnes(payAbo, { nowMs: cfgAbo.nowMs, abonnementMensuel: 0 });
  ok(a4.total === 0, 'abonnement : montant nul → aucune charge');

  // e) L'abonnement est RETRANCHÉ du résultat, à hauteur exacte de son total.
  var sAbo = acc.synthesize(payAbo, [], cfgAbo, []);
  var sSans = acc.synthesize(payAbo, [], { refTerritory: '971', nowMs: cfgAbo.nowMs }, []);
  near(sAbo.abonnement_encaissement, 80, 0.01, 'abonnement exposé dans la synthèse');
  near(sSans.resultat_exploitation - sAbo.resultat_exploitation, 80, 0.01,
    'le résultat baisse EXACTEMENT du montant de l\'abonnement (sinon il est compté à moitié, ou deux fois)');
  // f) Les frais de VENTE restent comptés à part — deux coûts, deux lignes.
  near(sAbo.frais_encaissement, 2, 0.01, 'commission de vente réelle, distincte de l\'abonnement');

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-accounting OK');
}
