// scripts/check-price-watch.js — Règle « min des sources » du traqueur (25/07).
// Quand le fournisseur vend une déclinaison MOINS cher que la réf principale
// (ex. DBS180ZJ coffret < DBS180Z nu), on achète la moins chère → prix de
// référence = min. Vérifie la fonction pure pickCheapestSource, son
// branchement dans handlePriceWatch, et que chaque srcAltSkus du catalogue ne
// pointe PAS vers un SKU encore présent au catalogue (sinon doublon de fiche).
'use strict';
var fs = require('fs');
var path = require('path');
var pp = require('../api/_lib/price-parse');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-price-watch] ' + m); }

  var f = pp.pickCheapestSource;
  ok(typeof f === 'function', 'pickCheapestSource exportée');
  if (!f) return errors;

  var page = { 'DBS180Z': 220.00, 'DBS180ZJ': 219.04 };
  ok(f(220.00, ['DBS180ZJ'], page) === 219.04, 'alt moins chère → min pris (219,04)');
  ok(f(210.00, ['DBS180ZJ'], page) === 210.00, 'propre moins cher → conservé');
  ok(f(220.00, ['ABSENTE'], page) === 220.00, 'alt absente de la page → ignorée');
  ok(f(220.00, undefined, page) === 220.00, 'sans srcAltSkus → prix propre');
  ok(f(220.00, ['dbs180zj'], page) === 219.04, 'casse du SKU insensible');
  ok(f(220.00, ['DBS180ZJ'], { DBS180ZJ: 0 }) === 220.00, 'alt à 0 → ignorée (pas de prix nul)');

  /* ── PROMOS : le traqueur prend le prix SOLDÉ, jamais le « Prix de base » ──
     Décision produit confirmée par l'user le 31/07/2026 : si cotébrico solde,
     il achète soldé, donc il vend soldé — le relevé tourne 2×/jour et remonte
     le prix dès la fin de la promo.
     Ce contrôle existe parce que l'en-tête du parseur affirmait exactement
     l'INVERSE jusqu'à cette date (« HORS PROMO, on prend le Prix de base »).
     Un commentaire ne protège rien ; une porte, si.
     ⛔ Références volontairement synthétiques : un harnais ne nomme jamais une
     donnée du catalogue. */
  function bloc(avantApres) {
    var courant = '<span class="price">Prix 149,90 €</span>';
    var base    = '<span class="old">Prix de base 199,00 €</span>';
    return '<div>Outil de controle - MAKITA ZZTEST1</div>'
      + (avantApres ? courant + base : base + courant)
      + '<button>Ajouter au panier</button>';
  }
  var pA = pp.parseCotebrico(bloc(true), 'MAKITA')[0];
  var pB = pp.parseCotebrico(bloc(false), 'MAKITA')[0];
  ok(pA && pA.price === 149.90, 'promo : le prix SOLDÉ est retenu (149,90), pas le Prix de base');
  ok(pB && pB.price === 149.90,
    'promo : ordre inversé (Prix de base AVANT le prix courant) → toujours le soldé. '
    + 'Le parseur ne doit pas dépendre de l\'ordre du gabarit cotébrico.');
  ok(pA && pA.promo === true, 'promo : le drapeau `promo` est levé quand un Prix de base est présent');
  var pSans = pp.parseCotebrico(
    '<div>Outil de controle - MAKITA ZZTEST2</div><span>Prix 294,74 €</span>'
    + '<button>Ajouter au panier</button>', 'MAKITA')[0];
  ok(pSans && pSans.promo === false, 'sans Prix de base → `promo` faux');
  ok(pSans && pSans.price === 294.74, 'sans promo : le prix affiché est retenu tel quel');

  // L'ancien prix ne doit PAS être capturé : un tarif fournisseur barré n'est
  // pas un prix de référence opposable (registre J4, décision D-004). S'il
  // apparaissait dans la sortie, il finirait un jour affiché barré sur le site.
  ok(pA && !('oldPrice' in pA) && !('basePrice' in pA) && !('priceBase' in pA),
    '⛔ le parseur expose l\'ancien prix fournisseur. Un tarif barré du fournisseur '
    + 'n\'est PAS un prix de référence : l\'afficher serait une pratique commerciale '
    + 'trompeuse (J4). Ne pas le capturer est la seule garantie qu\'il ne fuite pas.');

  /* L'en-tête du fichier doit décrire ce que le code fait — il a annoncé
     l'inverse jusqu'au 31/07/2026.
     ⚠️ 1ʳᵉ VERSION FAUSSE : elle cherchait l'ABSENCE de « HORS PROMO ». Elle a
     viré au rouge sur l'en-tête CORRIGÉ, qui cite la formulation fautive pour
     expliquer qu'elle l'était. Un contrôle par absence de mot ne distingue pas
     « le fichier affirme X » de « le fichier explique que X était faux ».
     On vérifie donc une AFFIRMATION, pas un silence. */
  var parseSrc = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'price-parse.js'), 'utf8');
  var entete = parseSrc.slice(0, parseSrc.indexOf('function stripHtml'));
  ok(/PROMO\s+COMPRISE/i.test(entete),
    'l\'en-tête de price-parse.js n\'affirme pas que le prix retenu est « PROMO '
    + 'COMPRISE ». Il a annoncé le contraire pendant des jours : sur du calcul de '
    + 'prix, un commentaire se croit sans se vérifier.');

  // Branchement réel dans handlePriceWatch.
  var adminSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  ok(/pickCheapestSource\s*\(\s*item\.price\s*,\s*p\.srcAltSkus/.test(adminSrc),
    'handlePriceWatch applique pickCheapestSource(item.price, p.srcAltSkus, …)');

  // Cohérence catalogue : un srcAltSkus ne doit jamais référencer un SKU
  // encore AU catalogue (la déclinaison doit être fusionnée, pas dupliquée).
  var products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'products.json'), 'utf8'));
  var skus = {}; products.forEach(function (p) { skus[String(p.sku).toUpperCase()] = 1; });
  products.forEach(function (p) {
    (p.srcAltSkus || []).forEach(function (a) {
      ok(!skus[String(a).toUpperCase()],
        p.sku + ' : srcAltSkus "' + a + '" existe ENCORE au catalogue (fusionner la fiche)');
    });
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-price-watch OK');
}
