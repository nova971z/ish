// api/_lib/analytics.js — Logique PURE de la mesure d'audience maison.
//
// Aucune dépendance Firestore ici : ce module valide/nettoie les événements et
// PLANIFIE les incréments d'agrégats sous forme de descripteurs simples. Le
// endpoint (api/events.js) applique ces descripteurs via l'Admin SDK. Cette
// séparation rend toute la logique testable sans émulateur ni réseau.
//
// PRINCIPES (cf. docs/PLAN-DASHBOARD-ADMIN.md) :
//   • Agrégats, jamais de log brut illimité.
//   • Aucune PII (email/téléphone/adresse) n'est acceptée dans un événement.
//   • L'IP n'est JAMAIS stockée : la géo est dérivée des en-têtes Vercel.
//   • Le profil par visiteur (affinité) n'existe QUE si le visiteur a consenti.

'use strict';

// ── Événements autorisés (allowlist stricte) ────────────────────────────────
// Tout événement hors de cette liste est ignoré (retour null au nettoyage).
var EVENT_ALLOWLIST = {
  session_start:   true, // ouverture de session (visiteur)
  page_view:       true, // navigation vers une route
  view_item:       true, // consultation d'une fiche produit
  select_item:     true, // clic sur une carte produit
  add_to_quote:    true, // ajout au panier/devis
  whatsapp_click:  true, // clic WhatsApp
  share:           true, // partage produit
  begin_checkout:  true, // ouverture modale paiement
  payment_success: true, // paiement carte confirmé côté client
  purchase:        true, // achat (page merci)
  territory_change:true, // changement de territoire
  view_territory:  true, // page territoire
  time_on_item:    true, // temps passé sur une fiche produit (ms)
  click:           true, // clic générique instrumenté (data-track)
  search:          true  // recherche interne
};

// Pondération de l'affinité produit/catégorie (visiteur consenti).
// Échelle « intention croissante » : plus l'action engage, plus le score monte.
var AFFINITY_WEIGHT = {
  view_item: 1,
  select_item: 2,
  add_to_quote: 5,
  purchase: 10
};

var MAX_EVENTS_PER_BATCH = 20;      // borne anti-abus (1 requête = 1 session tick)
var MAX_STR = 80;                    // longueur max d'un champ texte accepté
var PII_RE = /@|\+?\d[\d\s().-]{6,}/; // grossier : emails / numéros → rejet du champ

// Un id produit/catégorie/cible : caractères sûrs, borné. Sinon rejeté.
function safeToken(v, max) {
  if (typeof v !== 'string') return '';
  var s = v.trim().slice(0, max || 64);
  if (!s) return '';
  if (PII_RE.test(s)) return '';                 // jamais de PII comme identifiant
  return s.replace(/[^\w .:/'\-À-ÿ]/g, '');       // alphanum + ponctuation légère
}

function isFiniteNum(n) { return typeof n === 'number' && isFinite(n); }

// Nettoie UN événement brut client → objet sûr, ou null si invalide.
// On ne conserve QUE les champs connus par type ; tout le reste est jeté.
function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var name = typeof raw.event === 'string' ? raw.event : raw.name;
  if (typeof name !== 'string' || !EVENT_ALLOWLIST[name]) return null;

  var out = { name: name };
  // id produit (view_item/select_item/add_to_quote/time_on_item/purchase item)
  if (raw.id != null) { var id = safeToken(String(raw.id), 64); if (id) out.id = id; }
  // catégorie éventuelle (affinité)
  if (raw.category != null) { var c = safeToken(String(raw.category), 48); if (c) out.category = c; }
  // cible d'un clic générique (libellé court, ex "dock:panier")
  if (name === 'click' && raw.t != null) { var t = safeToken(String(raw.t), MAX_STR); if (t) out.t = t; }
  // temps passé (ms) : borné à 30 min pour écarter les onglets oubliés
  if (name === 'time_on_item' && isFiniteNum(raw.ms)) {
    out.ms = Math.max(0, Math.min(1800000, Math.round(raw.ms)));
  }
  // route (page_view) : chemin court, pas de query (pas de PII en query)
  if (name === 'page_view' && typeof raw.route === 'string') {
    out.route = safeToken(raw.route.split('?')[0], 48);
  }
  // source de trafic (referrer classifié côté client : 'google'/'instagram'/'direct'…)
  if (raw.src != null) { var s = safeToken(String(raw.src), 24); if (s) out.src = s; }
  return out;
}

// Classe l'appareil à partir d'un indice client borné ('mobile'|'desktop').
function normDevice(d) { return d === 'mobile' ? 'mobile' : (d === 'desktop' ? 'desktop' : null); }

// Dérive la géo depuis les en-têtes Vercel. NE RENVOIE JAMAIS l'IP.
// Retourne { country, city, lat, lng } (champs éventuellement absents) ou null.
function deriveGeo(headers) {
  var h = headers || {};
  var country = safeToken(String(h['x-vercel-ip-country'] || '').toUpperCase(), 2);
  if (!country) return null;
  var lat = parseFloat(h['x-vercel-ip-latitude']);
  var lng = parseFloat(h['x-vercel-ip-longitude']);
  var city = safeToken(decodeURIComponent(String(h['x-vercel-ip-city'] || '')), 48);
  var geo = { country: country };
  if (city) geo.city = city;
  if (isFiniteNum(lat) && isFiniteNum(lng)) { geo.lat = lat; geo.lng = lng; }
  return geo;
}

// dateKey déterministe (YYYY-MM-DD) à partir d'un timestamp ms (injecté → testable).
function dateKey( nowMs ) {
  var d = new Date(nowMs);
  var m = d.getUTCMonth() + 1;
  var day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

// Hash court et stable d'un libellé de cible → id de document sûr.
function clickDocId(label) {
  var s = String(label || '');
  var hash = 5381;
  for (var i = 0; i < s.length; i++) { hash = ((hash << 5) + hash + s.charCodeAt(i)) >>> 0; }
  return 'c' + hash.toString(36);
}

// PLANIFIE les écritures d'agrégats pour un lot d'événements nettoyés.
// Entrée : { events[], geo, device, source, consent, visitorId, nowMs }
// Sortie : liste de descripteurs { coll, doc, inc?, set?, merge:true }.
//   inc = champs à incrémenter (dot-path autorisé) ; set = champs à poser.
// FONCTION PURE : aucune écriture réelle ici → 100 % testable.
function planWrites(input) {
  var events = (input && input.events) || [];
  var geo = input && input.geo;
  var device = normDevice(input && input.device);
  var source = safeToken(String((input && input.source) || ''), 24) || null;
  var consent = !!(input && input.consent);
  var visitorId = consent ? safeToken(String((input && input.visitorId) || ''), 40) : '';
  var day = dateKey((input && input.nowMs) || 0);

  var ops = [];
  var daily = { coll: 'analytics_daily', doc: day, merge: true, inc: {}, set: { date: day } };
  ops.push(daily);

  // Affinité (visiteur consenti) : accumulée puis émise en une écriture.
  var affCat = {}, affProd = {};

  events.forEach(function (ev) {
    // Compteur générique par type d'événement (visibilité complète du volume).
    daily.inc['ev.' + ev.name] = (daily.inc['ev.' + ev.name] || 0) + 1;

    if (ev.name === 'session_start') {
      daily.inc.sessions = (daily.inc.sessions || 0) + 1;
      if (device) daily.inc['device.' + device] = (daily.inc['device.' + device] || 0) + 1;
      if (source) daily.inc['source.' + source] = (daily.inc['source.' + source] || 0) + 1;
    }
    if (ev.name === 'page_view') {
      daily.inc.pageViews = (daily.inc.pageViews || 0) + 1;
    }
    if (ev.name === 'click') {
      daily.inc.clicks = (daily.inc.clicks || 0) + 1;
      if (ev.t) {
        ops.push({ coll: 'analytics_clicks', doc: clickDocId(ev.t), merge: true,
          inc: { count: 1 }, set: { label: ev.t } });
      }
    }
    // Compteurs par produit.
    if (ev.id) {
      var pInc = {};
      if (ev.name === 'view_item')    pInc.views = 1;
      if (ev.name === 'select_item')  pInc.selects = 1;
      if (ev.name === 'add_to_quote') pInc.addToCart = 1;
      if (ev.name === 'purchase')     pInc.purchases = 1;
      if (ev.name === 'time_on_item') { pInc.timeMsTotal = ev.ms || 0; pInc.timeSamples = 1; }
      if (Object.keys(pInc).length) {
        ops.push({ coll: 'analytics_products', doc: ev.id, merge: true,
          inc: pInc, set: { productId: ev.id } });
      }
      // Affinité produit/catégorie (consenti seulement).
      var w = AFFINITY_WEIGHT[ev.name];
      if (consent && visitorId && w) {
        affProd[ev.id] = (affProd[ev.id] || 0) + w;
        if (ev.category) affCat[ev.category] = (affCat[ev.category] || 0) + w;
      }
    }
  });

  // Géo (une fois par lot, sur la session).
  if (geo && geo.country) {
    var gset = { country: geo.country };
    if (isFiniteNum(geo.lat) && isFiniteNum(geo.lng)) { gset.lat = geo.lat; gset.lng = geo.lng; }
    ops.push({ coll: 'analytics_geo', doc: geo.country, merge: true, inc: { count: 1 }, set: gset });
  }

  // Profil visiteur consenti : nouveau/récurrent + affinité.
  if (consent && visitorId) {
    var vinc = { visits: 1 };
    var vset = { lastSeen: (input && input.nowMs) || 0 };
    Object.keys(affProd).forEach(function (k) { vinc['affProd.' + k] = affProd[k]; });
    Object.keys(affCat).forEach(function (k) { vinc['affCat.' + k] = affCat[k]; });
    // firstSeen n'est posé que s'il n'existe pas → géré côté endpoint (create).
    ops.push({ coll: 'analytics_visitors', doc: visitorId, merge: true,
      inc: vinc, set: vset, firstSeenIfNew: (input && input.nowMs) || 0 });
  }

  return ops;
}

module.exports = {
  EVENT_ALLOWLIST: EVENT_ALLOWLIST,
  AFFINITY_WEIGHT: AFFINITY_WEIGHT,
  MAX_EVENTS_PER_BATCH: MAX_EVENTS_PER_BATCH,
  sanitizeEvent: sanitizeEvent,
  deriveGeo: deriveGeo,
  planWrites: planWrites,
  dateKey: dateKey,
  clickDocId: clickDocId,
  _safeToken: safeToken
};
