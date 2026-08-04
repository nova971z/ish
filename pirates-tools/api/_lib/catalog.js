// api/_lib/catalog.js — Single server-side source of truth for the catalogue.
//
// Loads products.json and merges Firestore admin overrides on top (price, stock,
// hidden…). Hidden products are filtered out, so they are neither listed nor
// purchasable. Used by /api/products (listing) and by the payment endpoints
// (server-authoritative pricing) so both resolve the exact same product data.

'use strict';

var fs = require('fs');
var path = require('path');
var priceParse = require('./price-parse');

var _cache = null;
var _cacheTime = 0;
var CACHE_TTL = 60000; // 1 minute

var _overridesCache = null;
var _overridesCacheTime = 0;
var OVERRIDES_TTL = 30000; // 30 s — admin edits appear fast

function loadProducts() {
  var now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  var file = path.join(__dirname, '..', '..', 'products.json');
  var raw = fs.readFileSync(file, 'utf8');
  var data = JSON.parse(raw);
  if (data && data.products) data = data.products;
  _cache = Array.isArray(data) ? data : [];
  _cacheTime = now;
  return _cache;
}

/* ⛔⛔ COMBIEN DE TEMPS UNE CARTE D'OVERRIDES RESTE-T-ELLE UNE VÉRITÉ EN PANNE.
   Quand Firestore ne répond plus, la carte déjà en mémoire vaut infiniment
   mieux que le fichier : ce sont les VRAIS prix, seulement un peu vieux. Mais
   un « un peu vieux » sans borne devient un mensonge. Quinze minutes : plus
   long que toute panne passagère, plus court que la vie d'une instance chaude. */
var CACHE_PANNE_MAX = 15 * 60 * 1000;

/* ⛔⛔⛔ LA PANNE ET LE VIDE NE DONNENT PLUS LA MÊME RÉPONSE. C'EST DE L'ARGENT.
   Jusqu'au 04/08/2026 cette fonction rendait `{}` dans les DEUX cas : « il n'y
   a aucun override » et « je n'ai PAS PU les lire ». `applyOverrides` sort
   aussitôt sur une carte vide, le catalogue redevenait `products.json` brut —
   et ce fichier n'est JAMAIS réécrit par le traqueur, donc l'écart ne fait que
   grandir.

   MESURÉ sur le balayage du 04/08, 141 fiches comparables : 49 ont un prix de
   fichier EN DESSOUS du prix recalculé, de **23,9 % en moyenne**, jusqu'à
   **−70,7 %** (DCF887N à 94,48 € au lieu de 322,07 €).
   ⛔ Et ce n'est pas de l'affichage : `create-payment-intent` résout ses prix
   par le MÊME `loadCatalog()`. Quand le quota Firestore sautait, le site
   VENDAIT à ces prix-là.
   ⚠️ Porte J4 lue : « le prix annoncé doit être exact et complet ». Un prix
   qu'on ne peut pas confirmer n'est pas un prix exact — et à −70 % il peut
   passer sous le coût d'achat. On préfère ne pas vendre plutôt que vendre faux.

   Ce qui est rendu :
     · `overrides`  la carte, comme avant
     · `disponible` FAUX uniquement quand Firebase est configuré et qu'aucune
                    carte fiable n'a pu être obtenue. Non configuré = mode
                    fichier DÉLIBÉRÉ, donc disponible.
     · `raison`     de quoi diagnostiquer sans deviner
     · `ageMs`      âge de la carte rendue ; 0 si elle vient d'être lue */
async function loadOverridesEtat() {
  var serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  /* Pas de Firebase du tout : rien à charger, donc rien qui manque. Le fichier
     EST la source, par construction et non par accident. */
  if (!serviceAccount) {
    return { overrides: {}, disponible: true, raison: 'firebase-non-configure', ageMs: 0 };
  }

  var now = Date.now();
  if (_overridesCache && now - _overridesCacheTime < OVERRIDES_TTL) {
    return { overrides: _overridesCache, disponible: true, raison: 'cache', ageMs: now - _overridesCacheTime };
  }

  /* Le repli commun aux deux modes de panne : la carte en mémoire tant qu'elle
     n'est pas trop vieille, l'aveu d'ignorance sinon. */
  function repli(raison) {
    var age = _overridesCache ? (Date.now() - _overridesCacheTime) : Infinity;
    if (_overridesCache && age < CACHE_PANNE_MAX) {
      return { overrides: _overridesCache, disponible: true, raison: raison + '-cache', ageMs: age };
    }
    return { overrides: {}, disponible: false, raison: raison, ageMs: age };
  }

  try {
    var db = require('./firebase').getFirebase().db;
    if (!db) return repli('firebase-indisponible');
    var snap = await db.collection('product_overrides').get();
    var map = {};
    snap.forEach(function (doc) {
      var data = doc.data();
      delete data.updatedAt; // strip Firestore internals
      map[doc.id] = data;
    });
    _overridesCache = map;
    _overridesCacheTime = Date.now();
    return { overrides: map, disponible: true, raison: 'lu', ageMs: 0 };
  } catch (err) {
    /* ⚠️ Le message part dans les journaux Vercel, jamais dans une réponse :
       il peut porter un identifiant de projet. */
    console.error('[catalog] Overrides load failed:', err.message);
    return repli('lecture-echouee');
  }
}

/* Compatibilité pour les appelants qui n'ont pas besoin de l'état.
   ⛔ AUCUN CHEMIN D'ARGENT NE PASSE PAR ICI : la panne y redevient invisible,
   et c'est précisément ce qu'on vient de corriger. */
async function loadOverrides() {
  return (await loadOverridesEtat()).overrides;
}

function applyOverrides(products, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return products;
  return products
    .map(function (p) {
      var patch = overrides[p.id] || overrides[p.slug] || null;
      if (!patch) return p;
      var fusion = Object.assign({}, p, patch);
      /* ── L'ÉTIQUETTE « EN PROMO » EXPIRE À LA LECTURE ────────────────────
         Demande de l'user : au bout de deux mois au même prix, ce n'est plus
         une promotion, c'est le nouveau prix — on retire la mention.

         ⛔ Calculé ICI, à chaque lecture, et JAMAIS par une tâche planifiée.
         Une promo dont l'expiration dépend d'un cron reste affichée le jour où
         le cron ne tourne pas — et annoncer une réduction qui n'en est plus
         une est une pratique commerciale trompeuse (J4), pas un détail
         d'affichage. Ici, l'oubli est impossible : il n'y a rien à oublier.

         ⚠️ `promoAncienPrix` n'est PAS le prix de la veille : c'est le prix le
         plus bas pratiqué sur les 30 jours précédents, calculé à l'écriture
         (voir api/admin.js). C'est ce que J4 exige comme référence. */
      var DEUX_MOIS = 60 * 24 * 3600 * 1000;
      /* ⛔ CORRIGÉ le 02/08/2026 : `promoDepuis` est écrit par le traqueur
         comme serverTimestamp → relu de Firestore, c'est un OBJET Timestamp,
         et Number(Timestamp) = NaN (E-228, même mécanisme que `priceSources`).
         `debut` restait NaN, `promoActive` restait FAUX pour toujours :
         l'étiquette promo ne s'est jamais affichée. `enMillis` ramène nombre,
         Timestamp ou sentinel en millisecondes réelles. */
      var debut = priceParse.enMillis(fusion.promoDepuis);
      fusion.promoActive = !!(debut > 0
        && (Date.now() - debut) < DEUX_MOIS
        && Number(fusion.promoAncienPrix) > Number(fusion.price));
      if (!fusion.promoActive) { fusion.promoAncienPrix = null; fusion.promoDepuis = null; }
      return fusion;
    })
    .filter(function (p) { return !p.hidden; }); // hidden → not listed, not purchasable
}

// Invalide le cache des overrides. À appeler APRÈS toute écriture de prix
// (reprice-all, traqueur) : sans ça, la même instance serverless continue de
// servir jusqu'à 30 s le catalogue d'AVANT l'écriture — et un contrôle
// immédiat re-signale les produits qu'on vient pourtant de corriger.
function invalidateOverrides() {
  _overridesCache = null;
  _overridesCacheTime = 0;
}

/* ⛔⛔ LA FORME À UTILISER SUR TOUT CHEMIN D'ARGENT. Elle rend le catalogue ET
   la question qui décide : les prix sont-ils CONFIRMÉS ? `loadCatalog()`
   au-dessous ne rend que le tableau — pratique pour afficher, aveugle pour
   vendre. Le nom dit lequel est lequel, parce qu'un appelant pressé prendra
   toujours le plus court. */
async function loadCatalogEtat() {
  var etat = await loadOverridesEtat();
  return {
    produits: applyOverrides(loadProducts(), etat.overrides),
    prixConfirmes: etat.disponible,
    raison: etat.raison,
    ageMs: etat.ageMs
  };
}

// Merged catalogue (products.json + overrides, hidden removed).
async function loadCatalog() {
  return (await loadCatalogEtat()).produits;
}

// Même fusion, mais avec une carte d'overrides DÉJÀ EN MAIN — aucune lecture
// Firestore. Sert au mode balayage du traqueur (&scan=1) : 67 pages en rafale
// relisaient la collection entière à CHAQUE page (≈ 160 000 lectures par
// balayage, plus de trois fois le quota gratuit quotidien — celui qui s'est
// épuisé le 01/08 et a fermé l'admin). L'appelant est responsable de la
// fraîcheur de la carte qu'il passe.
function loadCatalogAvec(overrides) {
  return applyOverrides(loadProducts(), overrides || {});
}

// Champs INTERNES écrits par le traqueur de prix / reprice dans product_overrides
// (coût d'achat fournisseur réel + marge appliquée). Ils sont indispensables au
// webhook (COGS) et à l'admin (marges), mais ne doivent JAMAIS sortir sur
// l'endpoint public /api/products : les exposer = publier le prix d'achat et la
// marge exacte de chaque produit.
var PRIVATE_FIELDS = [
  'priceSource', 'priceSrcTTC', 'priceCheckedAt',
  'priceMarkup', 'priceMode', 'priceRecomputedAt', 'priceCostOrigin',
  /* ⛔ `priceSources` (01/08/2026) : la carte multi-traqueurs — chaque entrée
     porte un COÛT D'ACHAT FOURNISSEUR (`ttc`). La servir publiquement serait
     la fuite irréversible (CDN + historique) que check-prix-fuite interdit.
     C'est check-catalog-public qui a attrapé l'oubli, avant tout déploiement. */
  'priceSources',
  'hidden'
];

function toPublic(p) {
  var clean = Object.assign({}, p);
  for (var i = 0; i < PRIVATE_FIELDS.length; i++) delete clean[PRIVATE_FIELDS[i]];
  return clean;
}

// Catalogue pour l'endpoint PUBLIC : même fusion, champs internes retirés.
async function loadPublicCatalog() {
  var merged = await loadCatalog();
  return merged.map(toPublic);
}

// Même chose, mais l'appelant sait si les prix sont confirmés.
async function loadPublicCatalogEtat() {
  var etat = await loadCatalogEtat();
  return {
    produits: etat.produits.map(toPublic),
    prixConfirmes: etat.prixConfirmes,
    raison: etat.raison,
    ageMs: etat.ageMs
  };
}

// Resolve a product by its client key. Mirrors findProductByKey() in app.js:
// matches on id, slug, or sku.
function findByKey(catalog, key) {
  if (!key || !Array.isArray(catalog)) return null;
  for (var i = 0; i < catalog.length; i++) {
    var p = catalog[i];
    if (p.id === key || p.slug === key || p.sku === key) return p;
  }
  return null;
}

module.exports = {
  loadCatalog: loadCatalog,
  loadCatalogEtat: loadCatalogEtat,
  loadCatalogAvec: loadCatalogAvec,
  loadPublicCatalog: loadPublicCatalog,
  loadPublicCatalogEtat: loadPublicCatalogEtat,
  loadOverridesEtat: loadOverridesEtat,
  findByKey: findByKey,
  invalidateOverrides: invalidateOverrides,
  // Exposés pour les tests CI (fonctions pures).
  _internals: { applyOverrides: applyOverrides, toPublic: toPublic,
    PRIVATE_FIELDS: PRIVATE_FIELDS, CACHE_PANNE_MAX: CACHE_PANNE_MAX }
};
