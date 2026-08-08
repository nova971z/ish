// scripts/generer-sitemap.js — LE SITEMAP NE DÉCLARE QUE CE QUI EST INDEXABLE.
//
// SEO ordre 3. Écrit sitemap.xml depuis products.json, en n'incluant QUE des
// URLs réelles, résolvables ET indexables :
//   · fiches ÉLIGIBLES — MÊME règle que le noindex (render._internals.estIndexable :
//     description_long non vide ET visuel hors placeholder). Une fiche vide est
//     noindex → elle n'a rien à faire dans le sitemap ;
//   · les 5 territoires (toujours indexables) ;
//   · les pages fixes indexables — /catalogue, /contact, / ; les pages légales
//     EN CHANTIER (vueEnChantier, D-114) sont noindex → EXCLUES tant qu'elles
//     portent des [À COMPLÉTER].
//
// ⛔ On ne déclare JAMAIS une famille ou une page qui n'a pas de route serveur
// réelle : une <loc> qui répond 404 fait désindexer, elle ne fait pas indexer.
//
//   node scripts/generer-sitemap.js            écrit sitemap.xml
//   node scripts/generer-sitemap.js --verifie  la porte CI (n'écrit rien)
'use strict';
var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');
var BASE = 'https://pirates-tools.com';

// Réutilise les mêmes règles que le rendu — jamais une deuxième définition
// qui divergerait (estIndexable, vueEnChantier, TERRITOIRES).
var interne = require('../api/render.js')._internals;

// Pages fixes candidates. Les légales ne sont retenues que HORS chantier.
var PAGES_FIXES = ['', 'catalogue', 'contact'];
var PAGES_LEGALES = ['cgv', 'mentions-legales', 'confidentialite'];

function chargerProduits() {
  var data = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
  if (data && data.products) data = data.products;
  return Array.isArray(data) ? data : [];
}

// Construit la LISTE des URLs (sans date) — pure, testable, partagée par
// l'écriture et la porte.
function urls() {
  var out = [];
  PAGES_FIXES.forEach(function (p) { out.push(BASE + '/' + p); });
  var gab = interne.gabarit();
  PAGES_LEGALES.forEach(function (p) {
    if (!interne.vueEnChantier(gab, p)) out.push(BASE + '/' + p);
  });
  Object.keys(interne.TERRITOIRES).forEach(function (s) { out.push(BASE + '/territoire/' + s); });
  chargerProduits().filter(interne.estIndexable).forEach(function (p) {
    out.push(BASE + '/produit/' + encodeURIComponent(p.slug || p.id));
  });
  return out;
}

function xml(liste, dateJour) {
  var corps = liste.map(function (u) {
    return '  <url>\n    <loc>' + u + '</loc>\n    <lastmod>' + dateJour + '</lastmod>\n  </url>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!-- Généré par scripts/generer-sitemap.js — NE PAS éditer à la main.\n'
    + '     Ne contient que des URLs réelles ET indexables : fiches éligibles\n'
    + '     (même règle que le noindex), 5 territoires, pages fixes non en chantier. -->\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + corps + '\n</urlset>\n';
}

module.exports = urls;
module.exports.xml = xml;

if (require.main === module) {
  var liste = urls();
  if (process.argv[2] === '--verifie') {
    // Porte CI : le sitemap sur le disque déclare EXACTEMENT les URLs
    // indexables mesurées — ni une fiche noindex de trop, ni une éligible
    // oubliée. On ne compare pas les dates (lastmod), seulement les <loc>.
    var errors = [];
    var attendu = liste.slice().sort();
    var surDisque;
    try {
      var brut = fs.readFileSync(path.join(RACINE, 'sitemap.xml'), 'utf8');
      surDisque = (brut.match(/<loc>([^<]+)<\/loc>/g) || [])
        .map(function (l) { return l.replace(/<\/?loc>/g, ''); }).sort();
    } catch (e) {
      console.error('  ❌ [generer-sitemap] sitemap.xml illisible : ' + e.message);
      process.exit(1);
    }
    if (surDisque.length !== attendu.length) {
      errors.push('le sitemap déclare ' + surDisque.length + ' URL, attendu ' + attendu.length
        + ' (fiches éligibles + territoires + pages fixes hors chantier). Relancer sans --verifie.');
    }
    // Aucune fiche noindex ne doit figurer : toute /produit/ du sitemap doit
    // être éligible. On le prouve en recomparant à la liste calculée.
    var manquantes = attendu.filter(function (u) { return surDisque.indexOf(u) === -1; });
    var enTrop = surDisque.filter(function (u) { return attendu.indexOf(u) === -1; });
    if (manquantes.length) errors.push(manquantes.length + ' URL indexable(s) ABSENTE(S) du sitemap, ex. ' + manquantes[0]);
    if (enTrop.length) errors.push(enTrop.length + ' URL EN TROP (non indexable ?) dans le sitemap, ex. ' + enTrop[0]);
    if (errors.length) { errors.forEach(function (e) { console.error('  ❌ [generer-sitemap] ' + e); }); process.exit(1); }
    console.log('✅ generer-sitemap : ' + surDisque.length + ' URL, toutes indexables et à jour');
    process.exit(0);
  }
  // Écriture. La date vient de l'appelant (le module n'invente pas de date —
  // Date().toISOString est autorisé ici, hors des scripts de workflow).
  var dateJour = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(RACINE, 'sitemap.xml'), xml(liste, dateJour));
  console.log('sitemap.xml écrit : ' + liste.length + ' URL (' + dateJour + ')');
}
