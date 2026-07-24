// scripts/check-invoice.js — Vérifie le moteur de facture (conformité, 2 régimes).
'use strict';
var inv = require('../api/_lib/invoice');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-invoice] ' + m); }
  function near(a, b, t, m) { ok(Math.abs(a - b) <= t, m + ' (attendu ~' + b + ', obtenu ' + a + ')'); }

  var pay = {
    invoiceNumber: 'F2026-0001', invoiceDateMs: Date.UTC(2026, 0, 15),
    amountCents: 24000, territoryDeclared: '971',
    customerEmail: 'client@ex.fr', customerName: 'Jean Test',
    linesDetail: [{ name: 'Perceuse DCD796', qty: 2, unitCents: 12000 }]
  };

  // Assujetti TVA (Guadeloupe 8,5 %).
  var i1 = inv.buildInvoice(pay, { raisonSociale: 'Pirates Tools', formeJuridique: 'SASU', siret: '123', franchise: false });
  near(i1.totalTtc, 240, 0.01, 'total TTC');
  near(i1.totalHt, 221.20, 0.05, 'total HT = TTC / 1,085');
  near(i1.totalTva, 18.80, 0.05, 'TVA calculée');
  ok(i1.lines.length === 1 && i1.lines[0].qty === 2, 'ligne produit');
  var h1 = inv.renderHtml(i1);
  ok(/FACTURE/.test(h1) && /F2026-0001/.test(h1), 'HTML : entête + numéro');
  ok(/N° TVA/.test(h1) && !/293 B/.test(h1), 'assujetti : affiche n° TVA, pas 293 B');

  // Franchise en base (pas de TVA).
  var i2 = inv.buildInvoice(pay, { raisonSociale: 'Pirates Tools', franchise: true });
  near(i2.totalHt, 240, 0.01, 'franchise : HT = TTC');
  ok(i2.totalTva === 0, 'franchise : TVA = 0');
  var h2 = inv.renderHtml(i2);
  ok(/293 B/.test(h2), 'franchise : mention art. 293 B du CGI');

  // Identité manquante → [À COMPLÉTER] visible (pas de crash).
  var h3 = inv.renderHtml(inv.buildInvoice(pay, {}));
  ok(/À COMPLÉTER/.test(h3), 'identité vendeur manquante → [À COMPLÉTER]');

  // Garanties légales toujours mentionnées.
  ok(/L\.217-3/.test(h1) && /1641/.test(h1), 'mentions garanties légales');

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-invoice OK');
}
