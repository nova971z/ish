// scripts/check-render.js — LE RENDU SERVEUR REND CE QU'IL PROMET (SEO ordre 1).
//
// ⛔ CE QUE CETTE PORTE DÉFEND. Le site est une application à dièse : sans
// api/render.js, un robot ne voit qu'UNE page. Cette porte EXÉCUTE la
// fonction de rendu et vérifie les promesses de l'ordre 1 du plan SEO :
//   · une fiche valide répond 200 avec le contenu produit dans le HTML brut ;
//   · un slug inconnu répond HTTP 404 avec meta robots noindex — jamais 200,
//     jamais une redirection (le défaut SEO-027 côté serveur) ;
//   · le canonical ne porte JAMAIS de fragment # (défauts SEO-026/028) ;
//   · la règle d'indexation progressive (D-019) : fiche sans description_long
//     ou au visuel placeholder → noindex,follow ; fiche remplie → indexable ;
//   · le catalogue lie exactement les fiches ÉLIGIBLES (mesurées, pas comptées
//     à la main) ;
//   · le 200 porte le cache s-maxage=300 (décision D-019).
//
// ⚠️ Aucune donnée du catalogue n'est nommée : les fiches de test se
// choisissent À L'EXÉCUTION sur un critère. Sans Firebase configuré,
// catalog.js lit products.json — mode fichier délibéré, aucun réseau.
'use strict';
var fs = require('fs');
var path = require('path');

var RACINE = path.join(__dirname, '..');

function fauxRes() {
  var r = { code: 0, corps: '', entetes: {} };
  r.status = function (c) { r.code = c; return r; };
  r.send = function (b) { r.corps = String(b); return r; };
  r.setHeader = function (k, v) { r.entetes[String(k).toLowerCase()] = v; return r; };
  r.json = function (o) { r.corps = JSON.stringify(o); return r; };
  return r;
}

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-render] ' + m); }

  var saAvant = process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;   // mode fichier délibéré
  try {
    delete require.cache[require.resolve(path.join(RACINE, 'api', 'render.js'))];
    var rendre = require(path.join(RACINE, 'api', 'render.js'));

    var produits = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
    if (produits && produits.products) produits = produits.products;
    var eligible = function (p) {
      return String(p.description_long || '').trim()
        && p.img && String(p.img).indexOf('placeholder') === -1 && !p.hidden;
    };
    var pleine = produits.filter(eligible)[0];
    var vide = produits.filter(function (p) { return !eligible(p) && !p.hidden; })[0];
    ok(!!pleine, 'PRÉALABLE : au moins une fiche remplie (description_long + visuel) au catalogue');
    ok(!!vide, 'PRÉALABLE : au moins une fiche vide au catalogue (sinon la règle noindex n\'est pas vérifiable)');
    if (!pleine || !vide) return errors;

    var appel = async function (query) {
      var res = fauxRes();
      await rendre({ method: 'GET', query: query }, res);
      return res;
    };

    /* ── ① Fiche REMPLIE : 200, contenu produit, canonical propre, indexable ── */
    var slugPlein = pleine.slug || pleine.id;
    var r1 = await appel({ page: 'produit', slug: slugPlein });
    ok(r1.code === 200, 'fiche remplie → 200 — vu ' + r1.code);
    ok(r1.corps.indexOf('<h1>') !== -1 && r1.corps.indexOf('rendu-serveur') !== -1,
      'le HTML brut porte le bloc rendu serveur avec un h1');
    var canon1 = (r1.corps.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
    ok(canon1 === 'https://pirates-tools.com/produit/' + encodeURIComponent(slugPlein),
      'canonical exact de la fiche — vu : ' + canon1);
    ok(canon1.indexOf('#') === -1, '⛔ canonical SANS fragment # (SEO-026/028) — vu : ' + canon1);
    ok(!/name="robots" content="noindex/.test(r1.corps),
      'fiche remplie : PAS de noindex (elle a gagné son indexation)');
    ok(String(r1.entetes['cache-control'] || '').indexOf('s-maxage=300') !== -1,
      'le 200 porte s-maxage=300 (D-019) — vu : ' + r1.entetes['cache-control']);
    var titrePropre = pleine.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    ok(r1.corps.indexOf(titrePropre) !== -1, 'le titre du produit est dans le HTML rendu');

    /* ── ② Fiche VIDE : 200 mais noindex,follow (indexation progressive) ───── */
    var r2 = await appel({ page: 'produit', slug: vide.slug || vide.id });
    ok(r2.code === 200, 'fiche vide → 200 (elle existe) — vu ' + r2.code);
    ok(/name="robots" content="noindex,follow"/.test(r2.corps),
      '⛔ fiche vide → noindex,follow (anti thin content, D-019)');

    /* ── ③ Slug INCONNU : vrai 404 + noindex, jamais 200 ni redirection ────── */
    var r3 = await appel({ page: 'produit', slug: 'slug-qui-n-existe-pas-du-tout' });
    ok(r3.code === 404, '⛔ slug inconnu → HTTP 404 — vu ' + r3.code);
    ok(/name="robots" content="noindex/.test(r3.corps), 'le 404 porte meta robots noindex');
    ok(r3.corps.indexOf('rendu-serveur') !== -1 && /introuvable/i.test(r3.corps),
      'le 404 est une page lisible avec une sortie, pas un corps vide');

    /* ── ④ Territoires : les 5 répondent, un faux répond 404 ───────────────── */
    var r4 = await appel({ page: 'territoire', slug: 'guadeloupe' });
    ok(r4.code === 200 && /Guadeloupe/.test(r4.corps), 'territoire guadeloupe → 200 avec son nom');
    var r5 = await appel({ page: 'territoire', slug: 'atlantide' });
    ok(r5.code === 404, 'territoire inconnu → 404 — vu ' + r5.code);

    /* ── ⑤ Catalogue : liens = fiches éligibles MESURÉES ───────────────────── */
    var r6 = await appel({ page: 'catalogue' });
    var nbLiens = (r6.corps.match(/href="\/produit\//g) || []).length;
    var nbEligibles = produits.filter(eligible).length;
    ok(r6.code === 200 && nbLiens === nbEligibles,
      'le catalogue lie exactement les fiches éligibles — ' + nbLiens + ' lien(s) pour ' + nbEligibles + ' éligible(s)');

    /* ── ⑥ D-65 : des mentions légales EN CHANTIER ne s'indexent pas ───────── */
    var interne = rendre._internals || {};
    ok(typeof interne.vueEnChantier === 'function', 'PRÉALABLE : vueEnChantier est exposée à la porte');
    if (typeof interne.vueEnChantier === 'function') {
      // Les deux branches de la règle, prouvées sur des vues synthétiques :
      // la détection mord quand le marqueur est là…
      ok(interne.vueEnChantier('<section data-route="/cgv">SIRET : [À COMPLÉTER]</section>', 'cgv') === true,
        'une vue avec [À COMPLÉTER] est déclarée en chantier');
      // …et la LEVÉE est automatique quand il n'y est plus (D-020, aucun geste).
      ok(interne.vueEnChantier('<section data-route="/cgv">SIRET : 123 456 789</section>', 'cgv') === false,
        'une vue complétée sort du chantier TOUTE SEULE (levée automatique)');
      // Et sur le VRAI gabarit : le rendu de chaque page légale reflète
      // exactement son état — noindex si chantier, rien sinon.
      var gabaritReel = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
      var legales = ['cgv', 'mentions-legales', 'confidentialite'];
      for (var i = 0; i < legales.length; i++) {
        var nom = legales[i];
        var chantier = interne.vueEnChantier(gabaritReel, nom);
        var rl = await appel({ page: nom });
        var porteNoindex = /name="robots" content="noindex,follow"/.test(rl.corps);
        ok(rl.code === 200 && porteNoindex === chantier,
          '/' + nom + ' : noindex=' + porteNoindex + ' pour chantier=' + chantier
          + ' — on n\'indexe pas des mentions légales en chantier (D-65)');
      }
    }
  } finally {
    if (saAvant === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = saAvant;
  }
  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-render OK');
  }, function (err) {
    console.error('  ❌ [check-render] harnais mort : ' + err.message);
    process.exit(1);
  });
}
