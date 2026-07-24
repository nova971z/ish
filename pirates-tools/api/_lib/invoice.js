// api/_lib/invoice.js — Génère une FACTURE conforme (droit français, 2026).
//
// Pur (aucune I/O). Utilisé côté serveur : par l'admin (aperçu/impression) et par
// le webhook (envoi auto au client). Gère les deux régimes :
//   • Assujetti TVA  → HT + TVA = TTC, avec n° TVA intracommunautaire.
//   • Franchise base → pas de TVA, mention « TVA non applicable, art. 293 B du CGI ».
//
// La numérotation (séquentielle, sans trou) est gérée en amont (compteur Firestore) ;
// ce module se contente de mettre en forme. Mentions obligatoires B2C incluses.

'use strict';

var pricing = require('./pricing');

function round2(n) { return Math.round(n * 100) / 100; }
function eur(n) { return round2(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fdate(ms) {
  if (!ms) return '';
  var d = new Date(ms);
  var p = function (n) { return n < 10 ? '0' + n : '' + n; };
  return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
}

// payment : { invoiceNumber, invoiceDateMs|recordedAtMs, amountCents, territoryDeclared,
//             customerEmail, customerName, customerAddress, linesDetail:[{name,qty,unitCents}] }
// seller  : config identité vendeur (voir DEFAULT_SELLER).
function buildInvoice(payment, seller) {
  seller = seller || {};
  var p = payment || {};
  var franchise = !!seller.franchise;
  var territory = p.territoryDeclared || p.territoryFromAddress || pricing.DEFAULT_TERRITORY;
  var tvaRate = franchise ? 0 : (pricing.getTerritory(territory) || pricing.getTerritory('971')).tvaRate;

  // Lignes : le montant stocké est TTC/unité. On dérive le HT (÷ 1+TVA).
  var srcLines = Array.isArray(p.linesDetail) && p.linesDetail.length
    ? p.linesDetail
    : [{ name: 'Commande Pirates Tools', qty: 1, unitCents: (p.amountCents || 0) }];

  var lines = [], totalHt = 0, totalTtc = 0;
  srcLines.forEach(function (l) {
    var qty = Number(l.qty) || 1;
    var unitTtc = (Number(l.unitCents) || 0) / 100;
    var unitHt = tvaRate ? unitTtc / (1 + tvaRate) : unitTtc;
    var lineHt = round2(unitHt * qty);
    var lineTtc = round2(unitTtc * qty);
    totalHt += lineHt; totalTtc += lineTtc;
    lines.push({ name: l.name || 'Produit', qty: qty, unitHt: round2(unitHt), unitTtc: round2(unitTtc), lineHt: lineHt, lineTtc: lineTtc });
  });
  totalHt = round2(totalHt); totalTtc = round2(totalTtc);
  var totalTva = round2(totalTtc - totalHt);

  return {
    number: p.invoiceNumber || 'PROFORMA',
    dateMs: p.invoiceDateMs || p.recordedAtMs || null,
    franchise: franchise,
    tvaRate: tvaRate,
    territory: territory,
    seller: seller,
    buyer: { name: p.customerName || '', email: p.customerEmail || '', address: p.customerAddress || '' },
    lines: lines,
    totalHt: totalHt, totalTva: totalTva, totalTtc: totalTtc,
    paidRef: p.paymentIntentId || p.stripeSessionId || ''
  };
}

// HTML autonome, imprimable A4 (fond blanc). Pas de dépendance externe.
function renderHtml(inv) {
  var s = inv.seller || {};
  var missing = '<span style="color:#c0243a">[À COMPLÉTER]</span>';
  function f(v) { return v ? esc(v) : missing; }

  var sellerBlock =
    '<div class="pt-inv-party"><b>' + f(s.raisonSociale) + '</b><br>'
    + (s.formeJuridique ? esc(s.formeJuridique) + (s.capital ? ' au capital de ' + esc(s.capital) : '') + '<br>' : missing + '<br>')
    + f(s.adresse) + '<br>'
    + 'SIRET : ' + f(s.siret) + (s.rcs ? ' · RCS ' + esc(s.rcs) : '') + '<br>'
    + (inv.franchise ? 'TVA non applicable, art. 293 B du CGI' : 'N° TVA : ' + f(s.tvaIntra)) + '<br>'
    + (s.email ? esc(s.email) : '') + (s.tel ? ' · ' + esc(s.tel) : '') + '</div>';

  var buyerBlock = '<div class="pt-inv-party"><b>Client</b><br>'
    + (inv.buyer.name ? esc(inv.buyer.name) + '<br>' : '')
    + (inv.buyer.address ? esc(inv.buyer.address) + '<br>' : '')
    + (inv.buyer.email ? esc(inv.buyer.email) : '') + '</div>';

  var rows = inv.lines.map(function (l) {
    return '<tr><td>' + esc(l.name) + '</td><td class="n">' + l.qty + '</td><td class="n">' + eur(l.unitHt) + '</td>'
      + '<td class="n">' + (inv.franchise ? '—' : Math.round(inv.tvaRate * 1000) / 10 + ' %') + '</td>'
      + '<td class="n">' + eur(l.lineHt) + '</td></tr>';
  }).join('');

  var totalsRows = '<tr><td>Total HT</td><td class="n">' + eur(inv.totalHt) + '</td></tr>'
    + (inv.franchise ? '' : '<tr><td>TVA (' + (Math.round(inv.tvaRate * 1000) / 10) + ' %)</td><td class="n">' + eur(inv.totalTva) + '</td></tr>')
    + '<tr class="tot"><td>TOTAL' + (inv.franchise ? '' : ' TTC') + '</td><td class="n">' + eur(inv.totalTtc) + '</td></tr>';

  return ''
    + '<div id="ptInvoice" class="pt-invoice">'
    + '<div class="pt-inv-head"><div><h1>FACTURE</h1>'
    + '<div>N° <b>' + esc(inv.number) + '</b></div>'
    + '<div>Date : ' + esc(fdate(inv.dateMs)) + '</div></div>'
    + '<div class="pt-inv-logo">Pirates&nbsp;Tools</div></div>'
    + '<div class="pt-inv-parties">' + sellerBlock + buyerBlock + '</div>'
    + '<table class="pt-inv-lines"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">PU HT</th><th class="n">TVA</th><th class="n">Montant HT</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
    + '<table class="pt-inv-tot">' + totalsRows + '</table>'
    + '<div class="pt-inv-notes">'
    + '<p>Règlement : payé par carte bancaire' + (inv.paidRef ? ' (réf. ' + esc(inv.paidRef) + ')' : '') + '.</p>'
    + (inv.franchise ? '<p>TVA non applicable, article 293 B du CGI.</p>' : '')
    + '<p>Garantie légale de conformité (2 ans, art. L.217-3 C. conso.) et garantie des vices cachés (art. 1641 C. civ.).</p>'
    + '<p>Pénalités de retard : 3× le taux d\'intérêt légal ; indemnité forfaitaire de recouvrement 40 € (pro). Pas d\'escompte pour paiement anticipé.</p>'
    + (s.mediateur ? '<p>Médiateur de la consommation : ' + esc(s.mediateur) + '.</p>' : '')
    + '</div>'
    + '</div>';
}

var DEFAULT_SELLER = {
  raisonSociale: '', formeJuridique: 'SASU', capital: '', adresse: '',
  siret: '', rcs: '', tvaIntra: '', email: '', tel: '', mediateur: '', franchise: false
};

module.exports = { buildInvoice: buildInvoice, renderHtml: renderHtml, DEFAULT_SELLER: DEFAULT_SELLER, _round2: round2 };
