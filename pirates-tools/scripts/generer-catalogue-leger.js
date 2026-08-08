// scripts/generer-catalogue-leger.js — LE CATALOGUE STATIQUE DE LA GRILLE.
//
// SEO ordre 9 (CODE-003). Écrit products-light.json depuis products.json en
// retirant les 3 champs de DÉTAIL (specs, description_long, features) que seule
// la fiche produit affiche. La grille télécharge donc moins au démarrage ; la
// fiche récupère son détail à la demande (api/products.js ?id=<slug>).
//
// ⛔ products.json (COMPLET) n'est PAS touché : le serveur (chemin de l'ARGENT,
// create-payment-intent) et le rendu SSR le lisent entier. Seule la COPIE
// légère servie au boot du client est allégée.
//
//   node scripts/generer-catalogue-leger.js            écrit products-light.json
//   node scripts/generer-catalogue-leger.js --verifie  la porte CI (n'écrit rien)
'use strict';
var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');
var SOURCE = path.join(RACINE, 'products.json');
var CIBLE = path.join(RACINE, 'products-light.json');

// MÊME liste que api/products.js — un seul endroit de vérité serait mieux, mais
// le client ne charge pas de module serveur ; la porte vérifie qu'elles restent
// alignées (voir check-render, sinon un champ oublié d'un côté divergerait).
var CHAMPS_DETAIL = ['specs', 'description_long', 'features'];

function charger(f) {
  var data = JSON.parse(fs.readFileSync(f, 'utf8'));
  return (data && data.products) ? data.products : data;
}

function alleger(liste) {
  return liste.map(function (p) {
    var clean = Object.assign({}, p);
    CHAMPS_DETAIL.forEach(function (c) { delete clean[c]; });
    clean._light = 1;   // marqueur : le client récupère le détail à la demande
    return clean;
  });
}

module.exports = { alleger: alleger, CHAMPS_DETAIL: CHAMPS_DETAIL };

if (require.main === module) {
  var source = charger(SOURCE);
  var leger = alleger(source);
  if (process.argv[2] === '--verifie') {
    var errors = [];
    var surDisque;
    try { surDisque = charger(CIBLE); }
    catch (e) { console.error('  ❌ [catalogue-leger] products-light.json illisible : ' + e.message); process.exit(1); }
    // Même nombre de fiches, AUCUN champ de détail, et les champs restants
    // identiques à la source allégée (le fichier est à jour).
    if (surDisque.length !== leger.length) errors.push('products-light.json a ' + surDisque.length + ' fiches, attendu ' + leger.length + ' — relancer sans --verifie');
    var fuite = surDisque.find(function (p) { return CHAMPS_DETAIL.some(function (c) { return p[c] !== undefined; }); });
    if (fuite) errors.push('un champ de détail (' + CHAMPS_DETAIL.join('/') + ') SUBSISTE dans products-light.json — ex. ' + (fuite.slug || fuite.id));
    // À jour : la sérialisation triée doit coïncider (détecte une source modifiée sans régénération).
    if (JSON.stringify(surDisque) !== JSON.stringify(leger)) errors.push('products-light.json n\'est PAS à jour vs products.json — relancer sans --verifie');
    if (errors.length) { errors.forEach(function (e) { console.error('  ❌ [catalogue-leger] ' + e); }); process.exit(1); }
    var poidsSource = fs.statSync(SOURCE).size, poidsLeger = fs.statSync(CIBLE).size;
    console.log('✅ generer-catalogue-leger : ' + surDisque.length + ' fiches, détail retiré, à jour ('
      + (poidsSource / 1024).toFixed(0) + ' Ko → ' + (poidsLeger / 1024).toFixed(0) + ' Ko)');
    process.exit(0);
  }
  // Écriture au MÊME format compact que products.json (une fiche par ligne si
  // la source l'est ? non — on reste sur un JSON compact standard).
  fs.writeFileSync(CIBLE, JSON.stringify(leger));
  var s = fs.statSync(SOURCE).size, l = fs.statSync(CIBLE).size;
  console.log('products-light.json écrit : ' + leger.length + ' fiches, '
    + (s / 1024).toFixed(0) + ' Ko → ' + (l / 1024).toFixed(0) + ' Ko');
}
