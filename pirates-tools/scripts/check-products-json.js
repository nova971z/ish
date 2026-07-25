#!/usr/bin/env node
// scripts/check-products-json.js — Invariants RÉELS du catalogue (schéma 2026).
// Réécrit le 25/07/2026 : l'ancienne version validait un schéma disparu
// (price_cents, price_old, discount_percent — présents dans 0 produit sur 207)
// et générait ~400 warnings JETÉS (seuls les errors remontaient). Ici : chaque
// règle correspond à une invariante métier effective, et toute violation est
// une ERREUR CI.
//
// Invariants gardés :
//  1. Identité : id / sku / slug présents, uniques, sans collision inter-espaces
//     (findByKey résout par les trois).
//  2. Prix : price = price_ht × 1,20 (TTC métropole, tolérance 1 centime),
//     price_ht > 0, vat = 0.2, currency = 'EUR'.
//  3. Fiscal : ncCategory ∈ {power_tool, accessory, hand_tool} (barème
//     pricing.js), weight_kg > 0 (paliers coffret + expédition).
//  4. Paires solo/coffret : liens croisés coffretSku ↔ soloSku résolus, rôles
//     cohérents, variantSecondary sur CHAQUE coffret (sinon doublon en grille).
//  5. Fichiers : img existe sur disque, model (GLB) existe si renseigné.
//  6. Champs d'affichage : title, brand, category non vides.
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var PRODUCTS = process.env.PRODUCTS_JSON || path.join(ROOT, 'products.json');
var NC_VALID = { power_tool: 1, accessory: 1, hand_tool: 1 };

module.exports = function () {
  var errors = [];
  function err(m) { errors.push('[check-products-json] ' + m); }

  var list;
  try {
    var data = JSON.parse(fs.readFileSync(PRODUCTS, 'utf8'));
    list = Array.isArray(data) ? data : (data && data.products);
    if (!Array.isArray(list)) throw new Error('ni tableau ni {products:[]}');
  } catch (e) {
    err('products.json illisible : ' + e.message);
    return errors;
  }

  var seen = {}; // clé (id|sku|slug) → sku porteur, pour l'unicité inter-espaces
  var bySku = {};
  list.forEach(function (p) { if (p && p.sku) bySku[p.sku] = p; });

  list.forEach(function (p, i) {
    var ref = (p && (p.sku || p.id)) || ('#' + i);

    // 1. Identité
    ['id', 'sku', 'slug'].forEach(function (k) {
      if (!p[k] || typeof p[k] !== 'string') err(ref + ' : champ "' + k + '" manquant/vide');
    });
    [p.id, p.sku, p.slug].forEach(function (key) {
      if (!key) return;
      if (seen[key] && seen[key] !== ref) err(ref + ' : clé "' + key + '" en collision avec ' + seen[key]);
      else seen[key] = ref;
    });

    // 2. Prix
    if (!(typeof p.price === 'number' && p.price > 0)) err(ref + ' : price invalide (' + p.price + ')');
    if (!(typeof p.price_ht === 'number' && p.price_ht > 0)) err(ref + ' : price_ht invalide (' + p.price_ht + ')');
    if (typeof p.price === 'number' && typeof p.price_ht === 'number') {
      var expected = p.price_ht * 1.20;
      if (Math.abs(p.price - expected) > 0.01) {
        err(ref + ' : price ' + p.price + ' ≠ price_ht × 1,20 (' + expected.toFixed(2) + ')');
      }
    }
    if (p.vat !== 0.2) err(ref + ' : vat ' + p.vat + ' ≠ 0.2');
    if (p.currency !== 'EUR') err(ref + ' : currency ' + p.currency + ' ≠ EUR');

    // 3. Fiscal / logistique
    if (!NC_VALID[p.ncCategory]) err(ref + ' : ncCategory "' + p.ncCategory + '" hors barème');
    if (!(typeof p.weight_kg === 'number' && p.weight_kg > 0)) err(ref + ' : weight_kg invalide (' + p.weight_kg + ')');

    // 4. Paires solo/coffret
    if (p.variantGroup) {
      if (p.variantRole === 'solo') {
        var cof = bySku[p.coffretSku];
        if (!cof) err(ref + ' : coffretSku "' + p.coffretSku + '" introuvable');
        else {
          if (cof.variantGroup !== p.variantGroup) err(ref + ' : variantGroup divergent avec ' + cof.sku);
          if (cof.soloSku !== p.sku) err(ref + ' : lien croisé cassé (soloSku de ' + cof.sku + ' = ' + cof.soloSku + ')');
          if (!cof.variantSecondary) err(cof.sku + ' : variantSecondary manquant (le coffret apparaîtrait en DOUBLE dans la grille)');
        }
      } else if (p.variantRole === 'coffret') {
        if (!bySku[p.soloSku]) err(ref + ' : soloSku "' + p.soloSku + '" introuvable');
      } else {
        err(ref + ' : variantRole "' + p.variantRole + '" invalide (solo|coffret)');
      }
    }

    // 5. Fichiers
    if (p.img && !fs.existsSync(path.join(ROOT, p.img))) err(ref + ' : image absente du disque (' + p.img + ')');
    if (p.model && !fs.existsSync(path.join(ROOT, p.model))) err(ref + ' : modèle 3D absent du disque (' + p.model + ')');

    // 6. Affichage
    ['title', 'brand', 'category'].forEach(function (k) {
      if (!p[k] || typeof p[k] !== 'string' || !p[k].trim()) err(ref + ' : champ "' + k + '" manquant/vide');
    });
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-products-json OK (invariants réels, schéma 2026)');
}
