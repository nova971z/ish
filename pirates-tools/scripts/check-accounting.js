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

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-accounting OK');
}
