// api/render.js — RENDU SERVEUR LÉGER des pages publiques (décision D-019).
//
// Pourquoi cette fonction existe : le site est une application à routage par
// dièse (#/produit/…) — un robot qui n'exécute pas JavaScript ne voyait qu'UNE
// page. Ici, chaque chemin réel (/produit/<slug>, /territoire/<slug>,
// /catalogue, /contact, /cgv…) répond un HTML complet, lisible sans script.
//
// Ce qui est servi : le gabarit index.html (le site normal, qui démarre et
// prend la main chez un humain), avec l'en-tête corrigé pour LA page demandée
// (title, description, canonical SANS fragment) et un bloc de contenu rendu
// côté serveur (#rendu-serveur) que app.js retire à son démarrage.
// ⛔ MÊME HTML POUR TOUS : aucun aiguillage robot/humain (le rendu réservé aux
// robots a été REJETÉ à l'ordre 0 — assimilable à du cloaking).
//
// VRAI 404 : un slug inconnu répond HTTP 404 avec meta robots noindex — jamais
// 200, jamais une redirection accueil (le défaut SEO-027, côté serveur).
//
// Prix : AUCUN prix n'est rendu ici à ce stade. Les prix vivent dans les
// overrides Firestore et leur affichage engage J4 — ils arriveront avec le
// JSON-LD Product (ordre 2), dérivés du même loadCatalog que le paiement.
//
// Cache : s-maxage=300 + stale-while-revalidate — le CDN absorbe le gros du
// trafic robots, la fonction ne tourne qu'une fois toutes les 5 minutes par
// page. INDEXATION PROGRESSIVE (anti thin content, D-019) : une fiche sans
// description_long ou avec un visuel placeholder est rendue noindex,follow.

'use strict';

const fs = require('fs');
const path = require('path');
const catalog = require('./_lib/catalog');

const BASE_URL = 'https://pirates-tools.com';

// Miroir de TERRITORY_SLUGS (app.js) — les 5 territoires servis.
const TERRITOIRES = {
  guadeloupe: 'Guadeloupe',
  martinique: 'Martinique',
  guyane: 'Guyane',
  reunion: 'La Réunion',
  mayotte: 'Mayotte'
};

// Pages fixes publiques : titre + description propres à chacune.
const PAGES_FIXES = {
  catalogue: {
    titre: 'Catalogue outillage professionnel — Pirates Tools',
    desc: 'Tout l\'outillage professionnel livré en Guadeloupe, Martinique, Guyane, Réunion et Mayotte — octroi de mer et TVA inclus.'
  },
  contact: {
    titre: 'Contact — Pirates Tools',
    desc: 'Une question, un devis, une commande : contactez Pirates Tools, outillage professionnel livré dans les DOM-TOM.'
  },
  cgv: {
    titre: 'Conditions générales de vente — Pirates Tools',
    desc: 'Les conditions générales de vente de Pirates Tools : commande, paiement, livraison DOM-TOM, garanties et retours.'
  },
  'mentions-legales': {
    titre: 'Mentions légales — Pirates Tools',
    desc: 'Mentions légales du site Pirates Tools.'
  },
  confidentialite: {
    titre: 'Politique de confidentialité — Pirates Tools',
    desc: 'Ce que Pirates Tools fait — et ne fait pas — de vos données personnelles.'
  },
  livraison: {
    titre: 'Livraison sur chantier — Pirates Tools',
    desc: 'Livraison de votre quincaillerie directement sur chantier par des livreurs indépendants, en Guadeloupe.'
  },
  artisans: {
    titre: 'Annuaire des artisans — Pirates Tools',
    desc: 'Les artisans partenaires de Pirates Tools en Guadeloupe et dans les DOM-TOM.'
  }
};

let _gabarit = null;
function gabarit() {
  if (_gabarit) return _gabarit;
  _gabarit = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  return _gabarit;
}

/* ── D-114 : des mentions légales EN CHANTIER ne s'indexent pas ──────────────
   Les pages /cgv, /mentions-legales et /confidentialite portent des champs
   « [À COMPLÉTER] » (raison sociale, SIRET, médiateur…) en attente de la
   création d'entreprise (D-020). Tant qu'un seul subsiste dans la vue, son
   HTML rendu porte noindex,follow. La détection relit le GABARIT à chaque
   rendu : le jour où les champs seront remplis, le noindex tombe TOUT SEUL —
   aucune levée manuelle, aucun geste à se rappeler. */
const PAGES_LEGALES = { cgv: 1, 'mentions-legales': 1, confidentialite: 1 };
function vueEnChantier(html, route) {
  var debut = String(html).indexOf('data-route="/' + route + '"');
  if (debut === -1) return false;
  var fin = String(html).indexOf('data-route="', debut + 13 + route.length);
  var vue = fin === -1 ? String(html).slice(debut) : String(html).slice(debut, fin);
  return vue.indexOf('À COMPLÉTER') !== -1;
}

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function absolue(chemin) {
  if (!chemin) return '';
  if (/^https?:\/\//.test(chemin)) return chemin;
  return BASE_URL + '/' + String(chemin).replace(/^\//, '');
}

/* La règle d'indexation progressive (D-019) : description réelle ET visuel
   réel, sinon noindex,follow. La MÊME règle décidera du sitemap (ordre 3). */
function estIndexable(p) {
  var texte = String((p && p.description_long) || '').trim();
  var img = String((p && p.img) || '');
  return texte.length > 0 && img.length > 0 && img.indexOf('placeholder') === -1;
}

/* Remplace l'en-tête du gabarit pour LA page servie. Les balises existent
   toutes dans index.html : on remplace, on n'empile pas (le double canonical
   est un défaut pire que l'absence). */
function poserEnTete(html, meta) {
  /* <base href="/"> : le gabarit vit d'ordinaire à la racine et toutes ses
     ressources sont relatives (styles.css, images/…). Servi depuis
     /produit/<slug>, chaque référence relative partirait vers
     /produit/styles.css — 404, page morte. La base ramène TOUT à la racine,
     y compris les URL que app.js fabrique ensuite. Les liens à dièse restent
     sains : app.js les prend en charge au clic (délégation). */
  html = html.replace('<head>', '<head>\n  <base href="/">');
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + escapeHTML(meta.titre) + '</title>');
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, '$1' + escapeHTML(meta.desc) + '$2');
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + escapeHTML(meta.canonical) + '$2');
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + escapeHTML(meta.canonical) + '$2');
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + escapeHTML(meta.titre) + '$2');
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + escapeHTML(meta.desc) + '$2');
  if (meta.image) {
    html = html.replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + escapeHTML(meta.image) + '$2');
    html = html.replace(/(<meta name="twitter:image" content=")[^"]*(")/, '$1' + escapeHTML(meta.image) + '$2');
  }
  if (meta.noindex) {
    html = html.replace('<link rel="canonical"', '<meta name="robots" content="noindex,follow">\n  <link rel="canonical"');
  }
  return html;
}

/* Le bloc rendu serveur : inséré au début du <body>, retiré par app.js au
   démarrage (renduServeurRetire). Un robot sans JavaScript le lit ; un humain
   le voit une fraction de seconde puis retrouve le site normal. */
function poserContenu(html, contenu) {
  // data-rendu-serveur : c'est par cet ATTRIBUT que app.js retire le bloc à
  // son démarrage (un id lu côté client serait accusé par p1-static).
  return html.replace('<body>', '<body>\n<div id="rendu-serveur" data-rendu-serveur>\n' + contenu + '\n</div>');
}

function pageProduit(p) {
  var indexable = estIndexable(p);
  var desc = String(p.desc || p.description_long || '').trim()
    || ('Fiche ' + p.title + ' — outillage professionnel livré dans les DOM-TOM.');
  var corps = '<article>'
    + '<h1>' + escapeHTML(p.title) + '</h1>'
    + (p.img && p.img.indexOf('placeholder') === -1
      ? '<img src="' + escapeHTML(absolue(p.img)) + '" alt="' + escapeHTML(p.title) + '" width="600" height="600">'
      : '')
    + (p.brand ? '<p>Marque : ' + escapeHTML(p.brand) + '</p>' : '')
    + (p.category ? '<p>Famille : ' + escapeHTML(p.category) + '</p>' : '')
    + '<p>' + escapeHTML(String(p.description_long || p.desc || '').trim() || desc) + '</p>'
    + '<p><a href="/catalogue">← Tout le catalogue</a></p>'
    + '</article>';
  return {
    statut: 200,
    meta: {
      titre: p.title + ' — Pirates Tools',
      desc: desc.slice(0, 300),
      canonical: BASE_URL + '/produit/' + encodeURIComponent(p.slug || p.id),
      image: p.img && p.img.indexOf('placeholder') === -1 ? absolue(p.img) : '',
      noindex: !indexable
    },
    contenu: corps
  };
}

function pageTerritoire(slug) {
  var nom = TERRITOIRES[slug];
  return {
    statut: 200,
    meta: {
      titre: 'Outillage professionnel ' + nom + ' — Pirates Tools',
      desc: 'Outillage professionnel livré en ' + nom + ' : octroi de mer et TVA du territoire inclus dans chaque prix affiché.',
      canonical: BASE_URL + '/territoire/' + slug,
      noindex: false
    },
    contenu: '<article>'
      + '<h1>Outillage professionnel ' + escapeHTML(nom) + '</h1>'
      + '<p>Pirates Tools livre l\'outillage professionnel en ' + escapeHTML(nom)
      + ' — chaque prix affiché inclut la TVA et l\'octroi de mer du territoire.</p>'
      + '<p><a href="/catalogue">Voir le catalogue</a></p>'
      + '</article>'
  };
}

function pageCatalogue(produits) {
  var eligibles = produits.filter(estIndexable);
  var liens = eligibles.map(function (p) {
    return '<li><a href="/produit/' + encodeURIComponent(p.slug || p.id) + '">' + escapeHTML(p.title) + '</a></li>';
  }).join('');
  var terr = Object.keys(TERRITOIRES).map(function (s) {
    return '<li><a href="/territoire/' + s + '">Outillage ' + escapeHTML(TERRITOIRES[s]) + '</a></li>';
  }).join('');
  return {
    statut: 200,
    meta: {
      titre: PAGES_FIXES.catalogue.titre,
      desc: PAGES_FIXES.catalogue.desc,
      canonical: BASE_URL + '/catalogue',
      noindex: false
    },
    contenu: '<nav>'
      + '<h1>Catalogue outillage professionnel</h1>'
      + '<ul>' + liens + '</ul>'
      + '<h2>Par territoire</h2>'
      + '<ul>' + terr + '</ul>'
      + '</nav>'
  };
}

function pageFixe(nom) {
  var meta = PAGES_FIXES[nom];
  return {
    statut: 200,
    meta: {
      titre: meta.titre,
      desc: meta.desc,
      canonical: BASE_URL + '/' + nom,
      // D-114 : une page légale avec des [À COMPLÉTER] reste hors index.
      noindex: !!(PAGES_LEGALES[nom] && vueEnChantier(gabarit(), nom))
    },
    /* Le contenu réel de ces pages vit dans le gabarit (sections .view) ; le
       bloc serveur ne porte que le titre — l'en-tête corrigé fait le travail. */
    contenu: '<h1>' + escapeHTML(meta.titre.replace(/ — Pirates Tools$/, '')) + '</h1>'
  };
}

/* Page 404 AUTONOME : elle dit ce qui s'est passé et offre une sortie — jamais
   une redirection déguisée (règle du dossier : un dernier recours rend une
   page lisible avec une sortie). */
function page404(chemin) {
  return {
    statut: 404,
    meta: {
      titre: 'Page introuvable — Pirates Tools',
      desc: 'Cette page n\'existe pas ou n\'existe plus.',
      canonical: BASE_URL + '/',
      noindex: true
    },
    contenu: '<article>'
      + '<h1>Page introuvable</h1>'
      + '<p>L\'adresse <code>' + escapeHTML(chemin || '') + '</code> ne correspond à aucune page.</p>'
      + '<p><a href="/catalogue">Voir le catalogue</a> · <a href="/">Retour à l\'accueil</a></p>'
      + '</article>'
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('GET uniquement');
  }
  var q = req.query || {};
  var page = String(q.page || '');
  var slug = String(q.slug || '').slice(0, 200);

  var rendu;
  try {
    if (page === 'produit') {
      var produits = await catalog.loadPublicCatalog();
      var p = catalog.findByKey(produits, slug);
      rendu = p ? pageProduit(p) : page404('/produit/' + slug);
    } else if (page === 'territoire') {
      rendu = TERRITOIRES[slug] ? pageTerritoire(slug) : page404('/territoire/' + slug);
    } else if (page === 'catalogue') {
      rendu = pageCatalogue(await catalog.loadPublicCatalog());
    } else if (PAGES_FIXES[page]) {
      rendu = pageFixe(page);
    } else {
      rendu = page404('/' + page);
    }
  } catch (e) {
    /* Panne de rendu ≠ page absente : on répond 500 SANS cache — un 404 mis
       en cache pour une panne ferait désindexer une page saine. */
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send('Erreur de rendu : ' + escapeHTML(e.message));
  }

  var html = poserContenu(poserEnTete(gabarit(), rendu.meta), rendu.contenu);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  /* 200 : le CDN absorbe (5 min + revalidation en arrière-plan). 404 : cache
     court seulement — une fiche peut naître d'une minute à l'autre. */
  res.setHeader('Cache-Control', rendu.statut === 200
    ? 'public, s-maxage=300, stale-while-revalidate=86400'
    : 'public, s-maxage=60');
  return res.status(rendu.statut).send(html);
};

// Exposées pour la porte CI (fonctions pures) — Vercel n'appelle que le
// module lui-même, ces propriétés ne changent rien au point d'entrée.
module.exports._internals = { vueEnChantier: vueEnChantier, estIndexable: estIndexable };
