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
    var interne0 = rendre._internals || {};
    var gabaritSrc = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
    var titrePropreEsc = function (t) {
      return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // échappe aussi pour la regex
    };

    /* ── ① Fiche REMPLIE : 200, contenu produit, canonical propre, indexable ── */
    var slugPlein = pleine.slug || pleine.id;
    var r1 = await appel({ page: 'produit', slug: slugPlein });
    ok(r1.code === 200, 'fiche remplie → 200 — vu ' + r1.code);
    ok(r1.corps.indexOf('rendu-serveur') !== -1, 'le HTML brut porte le bloc rendu serveur');
    /* h1 UNIQUE (SEO-010/039) : exactement UN h1 dans la fiche, et il porte le
       nom du produit (pdpTitle pré-rempli, hydratation non destructive). */
    var nbH1 = (r1.corps.match(/<h1[ >]/g) || []).length;
    ok(nbH1 === 1, '⛔ h1 UNIQUE — ' + nbH1 + ' balise(s) h1 dans la fiche (attendu 1)');
    ok(new RegExp('id="pdpTitle"[^>]*>' + titrePropreEsc(pleine.title)).test(r1.corps),
      'le h1 unique (pdpTitle) porte le nom du produit');
    /* GARANTIE (D-118) : la MÊME phrase dans le rendu serveur ET dans le
       gabarit index.html — une garantie affichée engage, elle ne diverge pas. */
    ok(r1.corps.indexOf(interne0.GARANTIE) !== -1, 'la garantie D-118 est dans la fiche rendue');
    ok(gabaritSrc.indexOf(interne0.GARANTIE) !== -1, 'la garantie D-118 est dans le gabarit (index.html)');
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

    /* ── ⑥ D-114 : des mentions légales EN CHANTIER ne s'indexent pas ───────── */
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
          + ' — on n\'indexe pas des mentions légales en chantier (D-114)');
      }
    }

    /* ── ⑧ ORDRE 2 : seule la vue demandée est servie (SEO-010/039) ─────────
       Mesure externe du 08/08 : chaque fiche embarquait l'accueil, 22 vues et
       le texte INTÉGRAL des CGV. Critère ajouté par l'user : le HTML d'une
       fiche ne contient NI le texte des CGV NI les autres vues. */
    // Les vues portent data-route="/…" ; les LIENS du menu data-route="#/…" —
    // seuls les premiers sont des sections à dédoublonner.
    var vuesDansFiche = (r1.corps.match(/data-route="\//g) || []).length;
    ok(vuesDansFiche === 1, '⛔ la fiche ne sert QUE sa vue — ' + vuesDansFiche + ' vue(s) trouvée(s) (attendu 1)');
    ok(r1.corps.indexOf('data-route="/cgv"') === -1 && r1.corps.indexOf('À COMPLÉTER') === -1,
      '⛔ le texte des CGV/mentions ne vit PLUS dans chaque fiche');
    var vuesDansCatalogue = (r6.corps.match(/data-route="\//g) || []).length;
    ok(vuesDansCatalogue === 1, 'le catalogue aussi ne sert que sa vue — vu ' + vuesDansCatalogue);
    // D-115 (FOUC) : le CSS critique du bloc serveur vit dans le <head>,
    // AVANT tout contenu — lisible des le premier octet peint.
    var posStyle = r1.corps.indexOf('#rendu-serveur{');
    var posBloc = r1.corps.indexOf('<div id="rendu-serveur"');
    ok(posStyle !== -1 && posBloc !== -1 && posStyle < posBloc,
      'D-115 : CSS critique du bloc serveur present dans le <head>, avant le contenu');

    /* ── ⑨ ORDRE 2 : métas de partage exactes ──────────────────────────────── */
    var ogTitre = (r1.corps.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || '';
    var twTitre = (r1.corps.match(/<meta name="twitter:title" content="([^"]*)"/) || [])[1] || '';
    ok(ogTitre && ogTitre === twTitre, 'twitter:title ALIGNÉ sur og:title — og=' + ogTitre.slice(0, 40) + ' tw=' + twTitre.slice(0, 40));
    var ogDesc = (r1.corps.match(/<meta property="og:description" content="([^"]*)"/) || [])[1] || '';
    var twDesc = (r1.corps.match(/<meta name="twitter:description" content="([^"]*)"/) || [])[1] || '';
    ok(ogDesc && ogDesc === twDesc, 'twitter:description ALIGNÉE sur og:description');
    ok(/<meta property="og:type" content="product">/.test(r1.corps),
      'og:type=product sur une fiche (plus jamais website)');
    var dimLue = interne.dimsWebp && interne.dimsWebp(String(pleine.img));
    var wDeclare = (r1.corps.match(/<meta property="og:image:width" content="([^"]*)"/) || [])[1];
    if (dimLue) {
      ok(String(dimLue.w) === wDeclare,
        'og:image:width = dimension LUE dans le fichier — fichier ' + dimLue.w + ', déclaré ' + wDeclare);
    } else {
      ok(wDeclare === undefined, 'dimensions illisibles → AUCUNE dimension déclarée (on ne recopie pas 1200×630)');
    }

    /* ── ⑩ ORDRE 2 : JSON-LD Product et ItemList ──────────────────────────── */
    var ldBrut = (r1.corps.match(/<script type="application\/ld\+json">(.*?)<\/script>/s) || [])[1];
    ok(!!ldBrut, 'PRÉALABLE : un JSON-LD est rendu sur la fiche');
    if (ldBrut) {
      var ld = JSON.parse(ldBrut);
      ok(ld['@type'] === 'Product' && ld.name === pleine.title, 'JSON-LD Product au nom du produit');
      var nbGalerie = interne.toutesImages(pleine).length;
      ok(Array.isArray(ld.image) && ld.image.length === nbGalerie,
        'SEO-035 : TOUTES les images de la galerie — ' + (ld.image || []).length + '/' + nbGalerie);
      // J4 : le prix rendu est CELUI du même modèle que le paiement.
      var pricingLib = require(path.join(RACINE, 'api', '_lib', 'pricing.js'));
      ok(ld.offers && ld.offers.price === pricingLib.calcPrice(pleine, pricingLib.DEFAULT_TERRITORY).ttc.toFixed(2),
        '⛔ J4 : prix du JSON-LD = pricing.calcPrice (même modèle que le paiement) — vu ' + (ld.offers && ld.offers.price));
      // SEO-036 : priceValidUntil seulement s'il existe un relevé RÉEL.
      var aReleve = !!(pleine.priceCheckedAt || pleine.priceRecomputedAt);
      ok(aReleve ? !!ld.offers.priceValidUntil : ld.offers.priceValidUntil === undefined,
        'SEO-036 : priceValidUntil dérivé d\'un relevé réel, jamais inventé — relevé=' + aReleve + ', déclaré=' + (ld.offers && ld.offers.priceValidUntil));
      // Prix NON confirmés → AUCUNE offre (on n'annonce pas ce qu'on ne peut pas tenir).
      var sansPrix = JSON.parse(interne.jsonldProduit(pleine, false));
      ok(sansPrix.offers === undefined, '⛔ J4 : prix non confirmés → aucune offre rendue');
    }
    var ldCat = (r6.corps.match(/<script type="application\/ld\+json">(.*?)<\/script>/s) || [])[1];
    ok(!!ldCat, 'PRÉALABLE : un JSON-LD ItemList est rendu sur le catalogue');
    if (ldCat) {
      var il = JSON.parse(ldCat);
      ok(il['@type'] === 'ItemList' && il.numberOfItems === il.itemListElement.length && il.numberOfItems === nbEligibles,
        'SEO-034 : numberOfItems = items listés = éligibles — ' + il.numberOfItems + '/' + il.itemListElement.length + '/' + nbEligibles);
    }

    /* ── ⑦ D-116 / SEO-025 : le domaine vercel.app REDIRIGE, chemin conservé ──
       Un domaine technique qui répond 200 fabrique du contenu dupliqué. La
       preuve finale est externe (curl -I → 308, mesure de l'user) ; ici on
       verrouille la CONFIGURATION qui la produit — elle ne peut plus
       disparaître sans rougir. */
    var vercelCfg = JSON.parse(fs.readFileSync(path.join(RACINE, 'vercel.json'), 'utf8'));
    var redir = (vercelCfg.redirects || []).filter(function (r) {
      return (r.has || []).some(function (h) { return h.type === 'host' && /\.vercel\.app$/.test(h.value || ''); });
    })[0];
    ok(!!redir, 'PRÉALABLE : une redirection host *.vercel.app existe dans vercel.json (SEO-025)');
    if (redir) {
      ok(redir.permanent === true, 'la redirection vercel.app est PERMANENTE (308) — vu : ' + JSON.stringify(redir.permanent));
      ok(/^https:\/\/pirates-tools\.com\//.test(redir.destination || '') && /:path\*/.test(redir.destination || ''),
        'elle vise pirates-tools.com en CONSERVANT le chemin — vu : ' + redir.destination);
      ok(/:path\*/.test(redir.source || ''), 'sa source couvre TOUS les chemins — vu : ' + redir.source);
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
