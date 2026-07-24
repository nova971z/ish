// scripts/check-accounting.js — Vérifie le moteur de synthèse comptable.
'use strict';
var acc = require('../api/_lib/accounting');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-accounting] ' + m); }
  function near(a, b, t, m) { ok(Math.abs(a - b) <= t, m + ' (attendu ~' + b + ', obtenu ' + a + ')'); }

  var pays = [
    { amountCents: 12000, status: 'succeeded', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 0, 10) },
    { amountCents: 24000, status: 'succeeded', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 1, 5) },
    { amountCents: 9900, status: 'failed', territoryDeclared: '971', recordedAtMs: Date.UTC(2026, 1, 6) }
  ];
  var s = acc.synthesize(pays, { is: 0.15, targetNet: 0.15, refTerritory: '971' });

  ok(s.reel.nb_ventes === 2, 'ignore les paiements non réussis (2 ventes)');
  near(s.reel.ca_ttc, 360, 0.01, 'CA TTC = somme réelle');
  near(s.reel.ca_ht, 331.80, 0.05, 'CA HT = TTC / 1,085 (Guadeloupe)');
  near(s.reel.tva_collectee, 28.20, 0.05, 'TVA collectée');
  near(s.reel.panier_moyen, 180, 0.01, 'panier moyen');
  near(s.estime.resultat_net, 0.15 * s.reel.ca_ht, 0.02, 'résultat net = 15 % du CA HT');
  near(s.estime.is, s.estime.resultat_avant_is - s.estime.resultat_net, 0.02, 'IS = avant IS − net');
  ok(s.par_mois.length === 2, 'ventilation sur 2 mois');

  // CA nul → tout à zéro, pas de division par zéro.
  var z = acc.synthesize([], { is: 0.15, targetNet: 0.15 });
  ok(z.reel.ca_ttc === 0 && z.estime.resultat_net === 0 && z.reel.panier_moyen === 0, 'CA nul géré proprement');

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-accounting OK');
}
