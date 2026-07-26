// scripts/check-coffret.js — Parité du supplément COFFRET client ↔ serveur.
// Le client (app.js COFFRET_SURCH) et le serveur (pricing.js COFFRET) doivent
// être IDENTIQUES, sinon le prix affiché ≠ le prix débité.
'use strict';
var fs = require('fs');
var path = require('path');
var pricing = require('../api/_lib/pricing');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-coffret] ' + m); }

  var S = pricing.COFFRET;
  ok(S && S.petit === 15 && S.gros === 25 && S.heavyKg === 3, 'paliers serveur (15/25/3)');

  // Surcharge par palier + éligibilité.
  ok(pricing.coffretSurchargeCents({ ncCategory: 'power_tool', category: 'Meuleuses', weight_kg: 1.6 }) === 1500, 'petit outil = 15 €');
  ok(pricing.coffretSurchargeCents({ ncCategory: 'power_tool', category: 'Scies', weight_kg: 4 }) === 2500, 'gros outil = 25 €');
  ok(pricing.coffretSurchargeCents({ ncCategory: 'power_tool', category: 'Batteries et chargeurs', weight_kg: 0.7 }) === 0, 'batterie exclue');
  ok(pricing.coffretSurchargeCents({ ncCategory: 'accessory', category: 'Accessoires', weight_kg: 1 }) === 0, 'accessoire exclu');
  ok(pricing.coffretEligible({ ncCategory: 'power_tool', category: 'Perforateurs' }) === true, 'perforateur éligible');
  // Décision user 25/07 : packs/combos ONT l'option (sans coffret = prix de
  // base ; avec = +15/25 € de volume d'envoi).
  ok(pricing.coffretEligible({ ncCategory: 'power_tool', category: 'Combos' }) === true, 'pack/combo éligible (décision 25/07)');
  // \b : « lame » ne doit plus matcher « Lamelleuses » (machines éligibles).
  ok(pricing.coffretEligible({ ncCategory: 'power_tool', category: 'Lamelleuses' }) === true, 'lamelleuse éligible (fix \\b anti « lame »)');
  ok(pricing.coffretEligible({ ncCategory: 'accessory', category: 'Lames et forets' }) === false, 'lames/forets exclus');
  ok(pricing.coffretEligible({ ncCategory: 'power_tool', category: 'Rangements' }) === false, 'rangements exclus');
  // coffretIncluded : produit déjà vendu en coffret (DJR360ZK) → PAS de switch,
  // et surcoût forcé côté serveur = 0 (anti-abus).
  ok(pricing.coffretEligible({ ncCategory: 'power_tool', category: 'Scies', coffretIncluded: true }) === false, 'coffretIncluded → non éligible (switch masqué)');
  ok(pricing.coffretSurchargeCents({ ncCategory: 'power_tool', category: 'Scies', coffretIncluded: true, weight_kg: 4 }) === 0, 'coffretIncluded → surcoût 0 même forcé');

  // Parité avec le miroir client (app.js) — regex BYTE-IDENTIQUE, plus un préfixe.
  var app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  var m = app.match(/COFFRET_SURCH\s*=\s*\{\s*petit:\s*(\d+),\s*gros:\s*(\d+),\s*heavyKg:\s*(\d+)/);
  ok(!!m, 'COFFRET_SURCH trouvé dans app.js');
  if (m) {
    ok(Number(m[1]) === S.petit && Number(m[2]) === S.gros && Number(m[3]) === S.heavyKg,
      'paliers client ' + (m ? m[1] + '/' + m[2] + '/' + m[3] : '?') + ' = serveur ' + S.petit + '/' + S.gros + '/' + S.heavyKg);
  }
  var mDeny = app.match(/COFFRET_DENY\s*=\s*(\/[^\n]+\/i)\s*;/);
  ok(!!mDeny, 'COFFRET_DENY trouvé dans app.js');
  if (mDeny) {
    ok(mDeny[1] === pricing.COFFRET_DENY.toString(),
      'COFFRET_DENY client ≡ serveur (byte-identique) — client ' + mDeny[1] + ' vs serveur ' + pricing.COFFRET_DENY.toString());
  }

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-coffret OK');
}
