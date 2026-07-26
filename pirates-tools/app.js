/* ============================================================
   Pirates Tools — Single-file PWA Application
   Professional tools e-commerce for French Antilles
   ============================================================ */
(function () {
  'use strict';

  // Restauration du scroll pilotée par NOUS, pas par le navigateur.
  // En 'auto' (défaut), le navigateur ré-applique la position de défilement
  // mémorisée pour une URL APRÈS le hashchange → il écrasait notre
  // window.scrollTo(0,0) du routeur : rouvrir une vue déjà visitée (ex. une 2e
  // bulle de marque après avoir scrollé la 1re puis fait « retour ») ramenait
  // en bas de page. En 'manual', c'est le routeur qui décide → toujours en haut.
  if ('scrollRestoration' in history) {
    try { history.scrollRestoration = 'manual'; } catch (_) {}
  }

  // Saut instantané en haut de page. behavior:'instant' passe outre le
  // `html{scroll-behavior:smooth}` global (sinon un reset de scroll s'anime et
  // peut être interrompu par le re-rendu de la vue). Repli two-arg pour tout
  // navigateur qui ne connaîtrait pas la forme à options.
  function scrollTopNow() {
    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
    catch (_) { window.scrollTo(0, 0); }
  }

  // ── Helpers ──────────────────────────────────────────────────

  // Escape for safe interpolation into HTML — both element content AND
  // double-quoted attributes. The previous textNode implementation did NOT
  // escape quotes, so any value containing " could break out of an attribute
  // (e.g. alt="…" src="…" value="…") and inject markup. Escaping the five
  // OWASP characters closes that systemically. Pure (no DOM), so it is safe to
  // call before the document is ready and faster in tight render loops.
  var _HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHTML(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function (ch) { return _HTML_ESCAPES[ch]; });
  }

  // Base de l'API serverless. window.PT_API_BASE = '' → même origine (Vercel).
  // Source unique : remplace les ~11 résolutions dupliquées auparavant en ligne.
  function apiBaseUrl() {
    return (typeof window.PT_API_BASE === 'string') ? window.PT_API_BASE : '';
  }

  // En-têtes d'un POST JSON authentifié (S2). Si l'utilisateur est connecté, on
  // joint son ID token Firebase en `Authorization: Bearer` : le serveur en
  // dérive l'uid VÉRIFIÉ (la remise fidélité et le matching de commande ne
  // reposent plus sur un uid déclaratif falsifiable). Résout toujours (jamais
  // de rejet) : sans session ou si getIdToken échoue, on part sans en-tête auth
  // (le serveur traite alors la requête comme anonyme = pas de remise).
  function jsonAuthHeaders() {
    var base = { 'Content-Type': 'application/json' };
    var user = _currentUser;
    if (user && typeof user.getIdToken === 'function') {
      return user.getIdToken().then(function (tok) {
        base['Authorization'] = 'Bearer ' + tok;
        return base;
      }).catch(function () { return base; });
    }
    return Promise.resolve(base);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function formatPrice(n) {
    return Number(n).toFixed(2).replace('.', ',') + ' €';
  }

  // ── Territory taxation engine (TVA + Octroi de mer DOM-TOM) ──
  // ⚠️ MIRRORED SERVER-SIDE in api/_lib/pricing.js (authoritative for charges).
  // Keep the rates and formula below byte-for-byte identical to that module —
  // any divergence makes the displayed price differ from the charged price.
  // Guarded by scripts/check-pricing.js.
  // Rates are baseline public references; they can be adjusted per NC category
  // via TAX_RULES_BY_NC below. Numbers are *additive* on the HT price:
  // prixTTC = prixHT × (1 + octroiExterne + octroiRegional) × (1 + tva)
  var TERRITORIES = [
    { code:'971', name:'Guadeloupe',  flag:'🇬🇵', tvaRate:0.085, octroiExterne:0.07,  octroiRegional:0.025 },
    { code:'972', name:'Martinique',  flag:'🇲🇶', tvaRate:0.085, octroiExterne:0.07,  octroiRegional:0.025 },
    { code:'973', name:'Guyane',      flag:'🇬🇫', tvaRate:0.0,   octroiExterne:0.075, octroiRegional:0.025 },
    { code:'974', name:'La Réunion',  flag:'🇷🇪', tvaRate:0.085, octroiExterne:0.05,  octroiRegional:0.025 },
    { code:'976', name:'Mayotte',     flag:'🇾🇹', tvaRate:0.0,   octroiExterne:0.0,   octroiRegional:0.0  }
  ];

  // Adjustments per Nomenclature Combinée (NC) category.
  // If a category is listed here, its octroi rates override the territory defaults.
  // power_tool → outillage électroportatif NC 8467 (baseline)
  // hand_tool  → outillage à main NC 8205/8207 (baseline, lower external)
  // accessory / consumable → léger, taxes moindres
  var TAX_RULES_BY_NC = {
    power_tool: {}, // uses territory defaults
    hand_tool:  {
      '971': { octroiExterne:0.05, octroiRegional:0.025 },
      '972': { octroiExterne:0.05, octroiRegional:0.025 },
      '973': { octroiExterne:0.05, octroiRegional:0.025 },
      '974': { octroiExterne:0.035,octroiRegional:0.025 },
      '976': { octroiExterne:0.0,  octroiRegional:0.0 }
    },
    accessory: {
      '971': { octroiExterne:0.04, octroiRegional:0.02 },
      '972': { octroiExterne:0.04, octroiRegional:0.02 },
      '973': { octroiExterne:0.04, octroiRegional:0.02 },
      '974': { octroiExterne:0.03, octroiRegional:0.02 },
      '976': { octroiExterne:0.0,  octroiRegional:0.0 }
    },
    consumable: {
      '971': { octroiExterne:0.03, octroiRegional:0.015 },
      '972': { octroiExterne:0.03, octroiRegional:0.015 },
      '973': { octroiExterne:0.03, octroiRegional:0.015 },
      '974': { octroiExterne:0.02, octroiRegional:0.015 },
      '976': { octroiExterne:0.0,  octroiRegional:0.0 }
    }
  };

  var TERRITORY_KEY = 'pt:territory';
  var DEFAULT_TERRITORY = '971';
  var _currentTerritory = DEFAULT_TERRITORY;

  function loadTerritory() {
    try {
      var saved = localStorage.getItem(TERRITORY_KEY);
      if (saved && getTerritory(saved)) { _currentTerritory = saved; return; }
    } catch (_) { /* privacy mode */ }
    _currentTerritory = DEFAULT_TERRITORY;
  }

  function getTerritory(code) {
    code = code || _currentTerritory;
    for (var i = 0; i < TERRITORIES.length; i++) {
      if (TERRITORIES[i].code === code) return TERRITORIES[i];
    }
    return null;
  }

  function taxRatesFor(product, territoryCode) {
    var t = getTerritory(territoryCode) || getTerritory(DEFAULT_TERRITORY);
    var nc = (product && product.ncCategory) || 'power_tool';
    var override = (TAX_RULES_BY_NC[nc] && TAX_RULES_BY_NC[nc][t.code]) || null;
    return {
      tva: t.tvaRate,
      octroiExterne: override ? override.octroiExterne : t.octroiExterne,
      octroiRegional: override ? override.octroiRegional : t.octroiRegional
    };
  }

  function calcPrice(product, territoryCode) {
    if (!product) return { ht:0, octroi:0, tva:0, ttc:0, rates:null };
    var ht = Number(product.price_ht != null
      ? product.price_ht
      : (product.price / (1 + (product.vat || 0.2))));
    var r = taxRatesFor(product, territoryCode);
    var afterOctroi = ht * (1 + r.octroiExterne + r.octroiRegional);
    var octroi = afterOctroi - ht;
    var ttc = afterOctroi * (1 + r.tva);
    var tva = ttc - afterOctroi;
    return {
      ht: ht,
      octroi: octroi,
      tva: tva,
      ttc: ttc,
      rates: r
    };
  }

  function setTerritory(code, opts) {
    if (!getTerritory(code)) return;
    if (code === _currentTerritory && !(opts && opts.force)) return;
    _currentTerritory = code;
    try { localStorage.setItem(TERRITORY_KEY, code); } catch (_) {}
    updateTerritoryLabels();
    // Re-render current route so all prices update
    if (typeof onRouteChange === 'function') {
      try { onRouteChange(); } catch (_) {}
    }
    try {
      document.dispatchEvent(new CustomEvent('pt:territory-change', { detail:{ code: code } }));
    } catch (_) {}
    if (typeof track === 'function') track('territory_change', { code: code });
  }

  function updateTerritoryLabels() {
    var t = getTerritory() || getTerritory(DEFAULT_TERRITORY);
    var labels = document.querySelectorAll('[data-terr-label]');
    labels.forEach(function (el) {
      el.textContent = t.flag + ' ' + t.name;
    });
    // Highlight active item in the popover
    var items = document.querySelectorAll('#terrMenu [data-terr-code]');
    items.forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-terr-code') === t.code);
    });
  }

  // Render + wire up the territory selector (topbar popover).
  // The topbar <button id="terrBtn"> and <ul id="terrMenu"> live in index.html.
  // If the menu is empty, populate it from TERRITORIES.
  function setupTerritorySelector() {
    var btn = document.getElementById('terrBtn');
    var menu = document.getElementById('terrMenu');
    if (!btn || !menu) return;

    if (!menu.childElementCount) {
      menu.innerHTML = TERRITORIES.map(function (t) {
        return '<li role="none"><button type="button" role="menuitemradio" '
          + 'class="terr-menu__item" data-terr-code="' + t.code + '" aria-checked="false">'
          + '<span class="terr-menu__flag" aria-hidden="true">' + t.flag + '</span>'
          + '<span class="terr-menu__name">' + escapeHTML(t.name) + '</span>'
          + '<span class="terr-menu__code">(' + t.code + ')</span>'
          + '</button></li>';
      }).join('');
    }

    function closeMenu() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    function openMenu() {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var first = menu.querySelector('.terr-menu__item');
      if (first) first.focus();
    }

    if (!btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menu.hidden) openMenu(); else closeMenu();
      });
      document.addEventListener('click', function (e) {
        if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) closeMenu();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !menu.hidden) { closeMenu(); btn.focus(); }
      });
      menu.addEventListener('click', function (e) {
        var item = e.target.closest('[data-terr-code]');
        if (!item) return;
        setTerritory(item.getAttribute('data-terr-code'));
        closeMenu();
      });
    }

    updateTerritoryLabels();
  }

  // ── DOM-TOM feature badges ─────────────────────────────────
  // productBadgeItems() builds the tropical/cordless/mayotte badge spans.
  // Utilisé UNIQUEMENT sur la fiche produit (PDP, section découverte) : les
  // cartes catalogue ne les affichent plus (retirés à la demande — ils
  // encombraient le coin bas-gauche des cartes).
  function productBadgeItems(p) {
    if (!p) return '';
    var out = [];
    if (Array.isArray(p.tags)) {
      if (p.tags.indexOf('tropical_ready') !== -1)
        out.push('<span class="pt-badge pt-badge--tropical" title="Adapté aux climats tropicaux">🌴 <span class="pt-badge__txt">Tropical</span></span>');
      if (p.tags.indexOf('cordless') !== -1)
        out.push('<span class="pt-badge pt-badge--cordless" title="Sans fil">🔋 <span class="pt-badge__txt">Sans fil</span></span>');
      if (p.tags.indexOf('mayotte_project') !== -1)
        out.push('<span class="pt-badge pt-badge--mayotte" title="Idéal chantier Mayotte">🏗️ <span class="pt-badge__txt">Chantier Mayotte</span></span>');
    }
    // Note : le badge "⚡ Stock local" a été retiré — il faisait doublon avec la
    // pastille "EN STOCK" (stockBadge). On évite la redondance visuelle.
    return out.join('');
  }

  // calcLocalPrice — estimation du prix local moyen (revendeurs DOM-TOM)
  // Ratio 1.60 sur le prix HT (marge + taxes + transport typiques).
  // Prix concurrents RÉELS relevés en Guadeloupe (TTC, machine nue, magasins de
  // Jarry — QEGS/BricoBrico, relevé 24/07/2026). Prioritaires sur l'estimation
  // ×1,60 pour afficher l'économie VRAIE. Étendre au fil des relevés (id produit
  // → prix moyen local €). Voir docs/CARTOGRAPHIE.md / veille concurrentielle.
  var LOCAL_PRICES = {
    'dewalt-dcg200nt-xj': 1165,  // QEGS 1165€
    'dewalt-dcs520nt-xj': 1025,  // QEGS 1025€
    'dewalt-dch273n-xj': 638,    // QEGS 638,05€
    'dewalt-dcp580n': 549,       // QEGS 549€
    'dewalt-dcs367n-xj': 485,    // QEGS 485€
    'dewalt-dcf620nt-xj': 435,   // QEGS 435€
    'dewalt-dcf850n': 399,       // QEGS 399€
    'dewalt-dcb184': 252,        // QEGS 252,45€
    'dewalt-dcg405n': 329,       // QEGS 379€ / BricoBrico 279,64€
    'dewalt-dwe6423-qs': 199,    // QEGS 199€
    'dewalt-d25033k-qs': 262     // QEGS 262€
  };

  function calcLocalPrice(product) {
    if (!product) return 0;
    // 1) prix concurrent réel relevé (le plus crédible) ; 2) champ localPrice
    // éventuel sur la fiche ; 3) repli estimation HT × 1,60.
    var real = LOCAL_PRICES[product.id] || Number(product.localPrice) || 0;
    if (real > 0) return real;
    var ht = Number(product.price_ht != null
      ? product.price_ht
      : (product.price / (1 + (product.vat || 0.2))));
    return ht * 1.60;
  }

  // ── Analytics (GA4 / Meta Pixel) + consent ─────────────────
  //
  // We load nothing third-party until the visitor explicitly accepts. Until
  // then, events are buffered in-memory (and mirrored in dataLayer in case a
  // tag manager is already present on the page).
  var ANALYTICS = { ga4Id: '', metaPixelId: '' };
  var ANALYTICS_CONSENT_KEY = 'pt:analytics-consent';
  var _consent = null;
  var _analyticsQueue = [];

  function loadConsent() {
    try { _consent = localStorage.getItem(ANALYTICS_CONSENT_KEY); }
    catch (_) { _consent = null; }
  }
  function saveConsent(value) {
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, value); } catch (_) {}
    _consent = value;
  }
  function hasConsent() { return _consent === 'granted'; }

  function forwardToProviders(eventName, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', eventName, params || {}); } catch (_) {}
    try { if (typeof window.fbq === 'function') window.fbq('trackCustom', eventName, params || {}); } catch (_) {}
  }

  function track(eventName, params) {
    var payload = { event: eventName };
    if (params && typeof params === 'object') {
      for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) payload[k] = params[k];
    }
    // Always buffer + dataLayer (cheap and dev-useful)
    _analyticsQueue.push(payload);
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(payload);
    } catch (_) {}
    // Mesure d'audience maison (beacon → /api/events). Émise TOUJOURS : la
    // couche anonyme (agrégats) est exemptée de consentement (CNIL) ; le
    // consentement ne gouverne QUE le profil persistant/affinité (aTrack le gère).
    try { aTrack(eventName, params); } catch (_) {}
    if (!hasConsent()) return;
    forwardToProviders(eventName, params);
  }

  // Replay buffered events to providers when consent is granted after page load
  function flushAnalyticsQueue() {
    if (!hasConsent()) return;
    _analyticsQueue.forEach(function (payload) {
      var ev = payload.event;
      var params = {};
      for (var k in payload) if (k !== 'event') params[k] = payload[k];
      forwardToProviders(ev, params);
    });
  }

  // ══ Mesure d'audience maison (beacon → /api/events) ════════════════════════
  // Couche STRICTEMENT additive, alignée RGPD/CNIL. Deux niveaux :
  //  • ANONYME (exempté de consentement) : identifiant de SESSION éphémère
  //    (sessionStorage), agrégats seulement, IP jamais envoyée/stockée.
  //  • CONSENTI : identifiant PERSISTANT (localStorage, ~13 mois) → nouveau vs
  //    récurrent + profil d'affinité (offres pertinentes). Créé à l'acceptation,
  //    supprimé au refus. Émission via navigator.sendBeacon (non bloquant,
  //    survit à la navigation). Ne casse JAMAIS l'app (tout est try/catch).
  var PT_A_SID = 'pt:sid';       // session anonyme
  var PT_A_VID = 'pt:vid';       // visiteur persistant (consenti)
  var PT_A_VID_TS = 'pt:vid_ts'; // horodatage création (purge 13 mois)
  var A_VID_MAX_MS = 13 * 30 * 24 * 3600 * 1000;
  var _aQueue = [];
  var _aFlushTimer = null;
  var _aSessionStarted = false;
  var _aItemTimer = null; // { id, start }

  function aRandId() {
    try {
      if (window.crypto && crypto.getRandomValues) {
        var b = new Uint8Array(16); crypto.getRandomValues(b);
        return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      }
    } catch (_) {}
    return 'r' + Math.abs((Date.now() ^ (Math.random() * 1e9)) | 0).toString(36);
  }

  function aGetSessionId() {
    try {
      var s = sessionStorage.getItem(PT_A_SID);
      if (!s) { s = aRandId(); sessionStorage.setItem(PT_A_SID, s); }
      return s;
    } catch (_) { return null; }
  }

  // Visiteur persistant : UNIQUEMENT sous consentement. { id, isNew } ou null.
  function aGetVisitor() {
    if (!hasConsent()) return null;
    try {
      var ts = parseInt(localStorage.getItem(PT_A_VID_TS) || '0', 10);
      var id = localStorage.getItem(PT_A_VID);
      if (id && ts && (Date.now() - ts) > A_VID_MAX_MS) { id = null; } // périmé
      var isNew = false;
      if (!id) {
        id = aRandId();
        localStorage.setItem(PT_A_VID, id);
        localStorage.setItem(PT_A_VID_TS, String(Date.now()));
        isNew = true;
      }
      return { id: id, isNew: isNew };
    } catch (_) { return null; }
  }
  function aClearVisitor() {
    try { localStorage.removeItem(PT_A_VID); localStorage.removeItem(PT_A_VID_TS); } catch (_) {}
  }

  function aDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';
  }
  function aSource() {
    try {
      var r = document.referrer || '';
      if (!r) return 'direct';
      var host = new URL(r).hostname.replace(/^www\./, '');
      if (host === location.hostname) return 'internal';
      if (/google\./.test(host)) return 'google';
      if (/instagram\./.test(host)) return 'instagram';
      if (/facebook\.|fb\./.test(host)) return 'facebook';
      if (/bing\./.test(host)) return 'bing';
      return 'other';
    } catch (_) { return 'direct'; }
  }

  function aEnqueue(name, params) {
    var ev = { event: name };
    if (params) for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) ev[k] = params[k];
    _aQueue.push(ev);
    if (_aQueue.length >= 15) aFlush();
    else if (!_aFlushTimer) { _aFlushTimer = setTimeout(function () { _aFlushTimer = null; aFlush(); }, 4000); }
  }

  function aFlush() {
    if (_aFlushTimer) { clearTimeout(_aFlushTimer); _aFlushTimer = null; }
    if (!_aQueue.length) return;
    var events = _aQueue.splice(0, 20);
    var consent = hasConsent();
    var vis = consent ? aGetVisitor() : null;
    var payload = { events: events, consent: consent, device: aDevice(), source: aSource() };
    if (vis) payload.visitorId = vis.id;
    try {
      var url = apiBaseUrl() + '/api/events';
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (_) { /* la mesure d'audience ne casse jamais l'app */ }
  }

  // Forward MINIMAL d'un événement track() vers le beacon (minimisation :
  // jamais de nom produit / prix / PII — seulement id, catégorie, route, ms).
  function aTrack(name, params) {
    params = params || {};
    var out = {};
    if (params.id != null) out.id = String(params.id);
    if (params.category != null) out.category = String(params.category);
    if (name === 'page_view' && params.route) out.route = String(params.route);
    if (name === 'view_item' && out.id) aStartItemTimer(out.id);
    aEnqueue(name, out);
  }

  // Chrono « temps passé sur un article » : démarré à l'ouverture de la fiche,
  // vidé au départ (changement de route) ou à la fermeture de l'onglet.
  function aStartItemTimer(id) { aFlushItemTime(); _aItemTimer = { id: id, start: Date.now() }; }
  function aFlushItemTime() {
    if (!_aItemTimer) return;
    var ms = Date.now() - _aItemTimer.start;
    var id = _aItemTimer.id;
    _aItemTimer = null;
    if (id && ms > 0) aEnqueue('time_on_item', { id: id, ms: ms });
  }

  function aStartSession() {
    if (_aSessionStarted) return;
    _aSessionStarted = true;
    aGetSessionId();
    var params = {};
    if (hasConsent()) { var v = aGetVisitor(); if (v) params.nv = v.isNew; }
    aEnqueue('session_start', params);
  }

  // Clics « ultra-précis » : capture déclarative via l'attribut data-track
  // (nommé, contrôlé, jamais de PII). Délégation globale unique.
  function aSetupClicks() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-track]') : null;
      if (!el) return;
      var label = el.getAttribute('data-track');
      if (label) aEnqueue('click', { t: label });
    }, true);
  }

  function aSetupLifecycle() {
    var flushAll = function () { aFlushItemTime(); aFlush(); };
    window.addEventListener('pagehide', flushAll);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushAll();
    });
  }

  function aInit() {
    // Garde anti-automatisation : navigator.webdriver === true sous Selenium/
    // Playwright/Puppeteer & Cie (même si le bot falsifie son User-Agent). On
    // n'émet alors AUCUN événement — complète le filtrage serveur par UA.
    try { if (navigator.webdriver === true) return; } catch (_) {}
    try {
      aSetupClicks();
      aSetupLifecycle();
      aStartSession();
    } catch (_) { /* jamais bloquant */ }
  }

  function setupWaFloat() {
    var el = document.getElementById('waFloat');
    if (!el || el._bound) return;
    el._bound = true;
    el.addEventListener('click', function () {
      track('whatsapp_click', { source: 'float' });
    });
  }

  // Formate 596XXXXXXXXX → 0X XX XX XX XX (affichage FR). Repli : +indicatif.
  function fmtPhone(digits) {
    var d = String(digits || '');
    if (d.length === 11 && (d.indexOf('33') === 0)) d = '0' + d.slice(2);
    if (d.length === 10) return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
    return d ? '+' + digits : '';
  }

  // Affiche/masque + câble TOUS les points de contact (téléphone + WhatsApp)
  // selon qu'un numéro est configuré. Aucun numéro → tout est masqué (rien ne
  // fuite : les libellés sont vides dans le HTML, remplis ici seulement si un
  // numéro existe). Un numéro renseigné → liens tel:/wa.me + textes posés
  // partout. Les liens porteurs d'un message (pdpWa/terrViewWa/devis) sont posés
  // à leur rendu via waLink() ; ici on gère les liens statiques et la visibilité.
  function applyContactChannels() {
    var has = !!WA_PHONE;
    var tel = has ? 'tel:+' + WA_PHONE : '#';
    var wa = has ? 'https://wa.me/' + WA_PHONE : '#';
    var hideSel = ['#waFloat', '#pdpWa', '#terrViewWa', '#devisSend',
      '.dock__btn--call', '.dock__btn--wa', '.footer-social__link--wa',
      '[data-contact="phone"]', '[data-contact="wa"]'];
    hideSel.forEach(function (sel) {
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        els[i].hidden = !has;
        els[i].style.display = has ? '' : 'none';
      }
    });
    if (!has) return;
    var telEls = document.querySelectorAll('[data-tel-link], .dock__btn--call');
    for (var a = 0; a < telEls.length; a++) telEls[a].href = tel;
    var waEls = document.querySelectorAll('[data-wa-link], .dock__btn--wa, .footer-social__link--wa, #waFloat');
    for (var b = 0; b < waEls.length; b++) waEls[b].href = wa;
    var telTxt = document.querySelectorAll('[data-tel-text]');
    for (var c = 0; c < telTxt.length; c++) telTxt[c].textContent = fmtPhone(WA_PHONE);
    var waTxt = document.querySelectorAll('[data-wa-text]');
    for (var d = 0; d < waTxt.length; d++) waTxt[d].textContent = 'wa.me/' + WA_PHONE;
  }

  // Un traceur soumis à consentement est-il RÉELLEMENT configuré ?
  function analyticsConfigured() {
    return !!(ANALYTICS && (ANALYTICS.ga4Id || ANALYTICS.metaPixelId));
  }

  function setupConsentBar() {
    if (_consent) return; // choix Accepter/Refuser déjà exprimé
    var bar = document.getElementById('consentBar');
    if (!bar) return;

    // Schéma standard e-commerce (décision produit 16-17/07) :
    //  • Cookies TECHNIQUES (panier, session, territoire) : toujours actifs,
    //    annoncés dans le texte (le RGPD/ePrivacy n'exige aucun consentement).
    //  • Mesure d'audience ANONYME (notre beacon maison, sans cookie
    //    publicitaire, IP non stockée) : exemptée CNIL → tourne sans
    //    consentement, annoncée honnêtement.
    //  • PERSONNALISATION (nouveau/récurrent + affinité produit → offres
    //    pertinentes) : nécessite un identifiant persistant → CONSENTEMENT.
    //    C'est ce que gouverne le choix Accepter/Refuser (pt:analytics-consent).
    // Refuser = aucun profil persistant (aucun localStorage pt:vid), la mesure
    // reste purement anonyme. CNIL : Refuser aussi accessible qu'Accepter.
    var textEl = bar.querySelector('.consent-bar__text');
    if (textEl) {
      textEl.innerHTML = '<strong>Cookies</strong> — Cookies techniques (panier, session, '
        + 'territoire) toujours actifs. Nous mesurons l’audience de façon <strong>anonyme</strong>. '
        + 'Avec votre accord, nous <strong>personnalisons nos offres</strong> selon vos préférences '
        + 'pour améliorer votre expérience — jamais de publicité ni de revente. '
        + '<a href="#/confidentialite" class="consent-bar__link">En savoir plus</a>';
    }

    bar.hidden = false;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-consent]');
      if (!btn) return;
      var value = btn.getAttribute('data-consent');
      if (value !== 'accept' && value !== 'deny') return;
      saveConsent(value === 'accept' ? 'granted' : 'denied');
      bar.hidden = true;
      if (value === 'accept') {
        // Personnalisation acceptée : crée l'identifiant persistant (affinité)
        // et pousse les événements en attente avec le consentement.
        try { aGetVisitor(); aFlush(); } catch (_) {}
        if (analyticsConfigured()) flushAnalyticsQueue();
        track('consent_granted', { timestamp: Date.now() });
      } else {
        // Refus : aucun profil persistant. Purge tout identifiant existant.
        try { aClearVisitor(); } catch (_) {}
      }
    });
  }

  // ── Loyalty tiers ──────────────────────────────────────────
  //
  // Cumulated spend (in €) drives the tier and the discount applied on every
  // future order. Persisted in localStorage so it survives sessions; real-world
  // deployments would move this server-side.
  var LOYALTY_KEY = 'pt:loyalty';
  var LOYALTY_TIERS = [
    { key:'bronze',  label:'Bronze',  icon:'🥉', min:0,    discountPct:0 },
    { key:'argent',  label:'Argent',  icon:'🥈', min:500,  discountPct:2 },
    { key:'or',      label:'Or',      icon:'🥇', min:2000, discountPct:5 },
    { key:'platine', label:'Platine', icon:'💎', min:5000, discountPct:8 }
  ];

  function loadLoyalty() {
    try {
      var raw = localStorage.getItem(LOYALTY_KEY);
      if (!raw) return { totalSpent: 0 };
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.totalSpent === 'number') return parsed;
    } catch (_) {}
    return { totalSpent: 0 };
  }

  function saveLoyalty(state) {
    try { localStorage.setItem(LOYALTY_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function tierForSpend(spent) {
    var current = LOYALTY_TIERS[0];
    for (var i = 0; i < LOYALTY_TIERS.length; i++) {
      if (spent >= LOYALTY_TIERS[i].min) current = LOYALTY_TIERS[i];
    }
    return current;
  }

  function nextTier(currentKey) {
    for (var i = 0; i < LOYALTY_TIERS.length - 1; i++) {
      if (LOYALTY_TIERS[i].key === currentKey) return LOYALTY_TIERS[i + 1];
    }
    return null;
  }

  // Computes discount+tier info for the devis footer.
  function getLoyaltyState(currentCartTotal) {
    var state = loadLoyalty();
    var tier = tierForSpend(state.totalSpent || 0);
    var next = nextTier(tier.key);
    var discount = (currentCartTotal || 0) * (tier.discountPct / 100);
    return {
      tierKey: tier.key,
      tierLabel: tier.label,
      tierIcon: tier.icon,
      discountPct: tier.discountPct,
      discountedTotal: (currentCartTotal || 0) - discount,
      nextTierAt: next ? next.min : tier.min,
      totalSpent: state.totalSpent || 0
    };
  }

  // Called once an order completes (success page or PSP webhook confirmation).
  function addLoyaltyPurchase(amount) {
    if (!(amount > 0)) return;
    var state = loadLoyalty();
    state.totalSpent = (state.totalSpent || 0) + amount;
    saveLoyalty(state);
  }

  // ── WhatsApp helpers ───────────────────────────────────────
  function waLink(msg) {
    if (!WA_PHONE) return '';   // aucun numéro configuré → pas de lien
    return 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent(msg || '');
  }

  function waProductMessage(product, territoryCode) {
    if (!product) return '';
    var t = getTerritory(territoryCode) || getTerritory(DEFAULT_TERRITORY);
    var price = calcPrice(product, t.code);
    var url = location.origin + location.pathname + '#/produit/' + (product.slug || product.id);
    return 'Bonjour Pirates Tools, je suis intéressé(e) par : '
      + product.title + ' (' + (product.brand || '') + ')\n'
      + 'Prix TTC : ' + formatPrice(price.ttc) + '\n'
      + 'Territoire : ' + t.flag + ' ' + t.name + ' (' + t.code + ')\n'
      + 'Lien : ' + url + '\n\n'
      + 'Pouvez-vous confirmer la disponibilité et le délai de livraison ?';
  }

  function waCartMessage(items, territoryCode) {
    if (!items || !items.length) return '';
    var t = getTerritory(territoryCode) || getTerritory(DEFAULT_TERRITORY);
    var lines = ['*Demande de devis — Pirates Tools*\n'];
    lines.push('Territoire : ' + t.flag + ' ' + t.name + ' (' + t.code + ')');
    lines.push('');
    var total = 0;
    items.forEach(function (item) {
      var p = findProductByKey(item.key);
      var unit = p ? calcPrice(p, t.code).ttc : Number(item.price) || 0;
      // Ligne « avec coffret » : le supplément d'envoi fait partie du prix.
      if (item.coffret && p) unit += coffretSurchargeCents(p) / 100;
      var qty = item.qty || 1;
      var sub = unit * qty;
      total += sub;
      lines.push('• ' + item.title + ' ×' + qty + ' — ' + formatPrice(sub));
    });
    lines.push('');
    lines.push('*Total TTC : ' + formatPrice(total) + '*');
    var est = shippingEstimateFor(t.code);
    lines.push('Livraison estimée : ' + est.days + ' (à partir de ' + formatPrice(est.price) + ')');
    lines.push('\nMerci de confirmer la disponibilité et le délai de livraison.');
    return lines.join('\n');
  }

  // Find a product in memory by its cart key (id/slug/sku)
  function findProductByKey(key) {
    if (!key || !products) return null;
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      if (p.id === key || p.slug === key || p.sku === key) return p;
    }
    return null;
  }

  function localPriceComparison(product, price, container) {
    if (!product || !price || !container) return;
    var local = calcLocalPrice(product);
    if (!(local > 0) || !(price.ttc > 0)) return;
    if (price.ttc >= local) return; // no saving to show
    var saving = Math.round(((local - price.ttc) / local) * 100);
    var html = '<div class="pt-local-compare">'
      + '<span class="pt-local-compare__label">Prix moyen local</span>'
      + '<span class="pt-local-compare__value">' + formatPrice(local) + '</span>'
      + '<span class="pt-local-compare__saving">Économisez ' + saving + ' %</span>'
      + '</div>';
    container.insertAdjacentHTML('beforeend', html);
  }

  // Stock badge helper — renders a colored pill based on product.stock_status.
  // Statuses: in_stock (green), low_stock (orange), out_of_stock (red), preorder (blue).
  // Empty string if no status set, so existing products render unchanged.
  function stockBadge(p) {
    if (!p || !p.stock_status) return '';
    var status = String(p.stock_status).toLowerCase();
    var label = p.stock_label || '';
    var mod = '';
    var text = '';
    switch (status) {
      case 'in_stock':
        mod = 'in'; text = label || 'En stock';
        break;
      case 'low_stock':
        mod = 'low'; text = label || 'Stock limité';
        break;
      case 'out_of_stock':
        mod = 'out'; text = label || 'Rupture';
        break;
      case 'preorder':
        mod = 'preorder'; text = label || 'Précommande';
        break;
      default:
        return '';
    }
    return '<span class="stock-badge stock-badge--' + mod + '">'
      + '<span class="stock-badge__dot" aria-hidden="true"></span>'
      + escapeHTML(text)
      + '</span>';
  }

  function isOutOfStock(p) {
    return p && String(p.stock_status || '').toLowerCase() === 'out_of_stock';
  }

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  // ── DOM references ──────────────────────────────────────────

  var dom = {};
  function cacheDom() {
    var ids = [
      'menu-toggle','topbarLogo','homeLink',
      'hero','heroLogoContainer','heroLogo',
      'side-menu','menuBackdrop',
      'q','tag','catList','list','brandGrid',
      'pdpTitle','pdpTag','pdpHeroBadges','pdpHeroImg','pdpDesc','pdpPrice','pdpSpecs','pdpImg',
      'pdpQuote','pdpWa','pdpShare','pdpRelated',
      'devisList','devisSend','devisClear','devisPay',
      'dock','dockCartBtn','dockCount','dockHomeBtn','dockQuoteBtn',
      'authLoginTab','authRegisterTab','authLogin','authRegister',
      'loginForm','registerForm','loginEmail','loginPwd','loginSubmit','regSubmit',
      'regName','regEmail','regPwd',
      'authForgotBtn','authForgotPanel','authForgotClose','forgotForm','forgotEmail','forgotSubmit',
      'accountForm','accSave','accName','accEmail','accPhone','accAddress',
      'accAvatar','accAvatarImg','accCartMiniTxt','accLogout','accHistory','accLoyaltyTxt',
      'accSlider','accFill','accCursor','accVerifyBanner','accResendVerify',
      'pwdChangeForm','pwdCurrent','pwdNew','pwdConfirm',
      'toasts','installBtn'
    ];
    ids.forEach(function (id) {
      dom[id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = document.getElementById(id);
    });
  }

  // ── Toast system ────────────────────────────────────────────

  function toast(msg, type) {
    type = type || 'info';
    if (!dom.toasts) return;
    var el = document.createElement('div');
    el.className = 'toast toast--' + type;
    el.textContent = msg;
    dom.toasts.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('toast--visible'); });
    setTimeout(function () {
      el.classList.remove('toast--visible');
      setTimeout(function () { el.remove(); }, 300);
    }, 3000);
  }

  // ── Cart (single source of truth) ──────────────────────────

  var CART_KEY = 'pt_cart';
  // Numéro de contact UNIQUE (téléphone + WhatsApp) : source de vérité =
  // window.PT_CRYPTO_CONFIG.whatsappNumber (index.html). Vide tant qu'aucun
  // numéro dédié n'est pris → applyContactChannels() masque tous les liens
  // tel:/WhatsApp. Renseigner le numéro à UN SEUL endroit le fait réapparaître
  // partout.
  var WA_PHONE = ((window.PT_CRYPTO_CONFIG && window.PT_CRYPTO_CONFIG.whatsappNumber) || '').replace(/[^0-9]/g, '');

  function loadCartData() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === '1' && Array.isArray(parsed.items)) return parsed.items;
      }
    } catch (_) { /* corrupt data */ }
    return [];
  }

  function saveCart(items) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ version: '1', items: items }));
    } catch (e) { /* Safari privé / quota plein — n'interrompt pas l'ajout au panier */ }
    updateCartUI();
  }

  function getCart() { return loadCartData(); }

  function productCardVisual(p) {
    // PERF (cascade de chargement fluide) : les vignettes du catalogue
    // n'affichent QUE l'image légère (poster). Le modèle 3D (lourd, ~2 Mo/pièce)
    // ne se charge PLUS sur la grille — uniquement sur la fiche produit (PDP).
    // Avant : chaque carte avec un modèle téléchargeait son GLB dès l'ouverture
    // du catalogue (~10 cartes × 2 Mo = 20 Mo d'un coup) → catalogue très lent.
    // Désormais le catalogue s'ouvre instantanément ; la 3D interactive reste
    // sur la page produit, là où l'utilisateur veut réellement l'examiner.
    var imgSrc = escapeHTML(p.img || 'images/placeholder.svg');
    var alt = escapeHTML(p.title);
    // fetchpriority="low" : les vignettes de cartes cèdent la bande passante au
    // 1er outil du carrousel 3D (priorité normale) → il se charge AVANT elles
    // (demande user). Elles restent lazy et se chargent juste après / au scroll.
    return '<img src="' + imgSrc + '" alt="' + alt + '" loading="lazy" fetchpriority="low" decoding="async" class="product-card__img">';
  }

  function addToCart(item) {
    var items = getCart();
    var key = item.key || item.id || item.slug;
    var coffret = !!item.coffret;
    var existing = null;
    // Une ligne « avec coffret » est distincte de la même sans coffret.
    for (var i = 0; i < items.length; i++) {
      if (items[i].key === key && !!items[i].coffret === coffret) { existing = items[i]; break; }
    }
    // addQty : quantité ajoutée en un clic (sélecteur de quantité des fiches
    // quincaillerie) — 1 par défaut, comportement historique inchangé.
    var addQty = Math.max(1, Math.min(99, parseInt(item.addQty, 10) || 1));
    if (existing) {
      existing.qty = Math.min(99, (existing.qty || 1) + addQty);
    } else {
      items.push({
        key: key,
        title: item.title + (coffret ? ' + coffret TSTAK' : ''),
        brand: item.brand || '',
        price: Number(item.price) || 0,
        qty: addQty,
        image: item.img || item.image || '',
        paymentLink: item.paymentLink || '',
        coffret: coffret
      });
    }
    saveCart(items);
    pulseDock();
    toast('Ajouté au panier', 'success');
    if (typeof track === 'function') {
      track('add_to_quote', { id: item.id || item.slug, name: item.title, price: item.price });
    }
  }

  function removeFromCart(index) {
    var items = getCart();
    items.splice(index, 1);
    saveCart(items);
  }

  function updateQty(index, qty) {
    var items = getCart();
    if (qty < 1) { items.splice(index, 1); }
    else { items[index].qty = qty; }
    saveCart(items);
  }

  function clearCart() {
    saveCart([]);
    toast('Panier vidé', 'info');
  }

  function updateCartUI() {
    var items = getCart();
    var count = items.reduce(function (s, i) { return s + (i.qty || 1); }, 0);

    // Dock badge
    if (dom.dockCount) {
      dom.dockCount.textContent = count;
      dom.dockCount.style.display = count > 0 ? '' : 'none';
    }

    // Account mini cart
    if (dom.accCartMiniTxt) {
      dom.accCartMiniTxt.textContent = count > 0
        ? count + ' article' + (count > 1 ? 's' : '') + ' dans votre panier'
        : 'Votre panier est vide';
    }
  }

  function pulseDock() {
    if (!dom.dock) return;
    dom.dock.classList.add('dock--pulse');
    setTimeout(function () { dom.dock.classList.remove('dock--pulse'); }, 600);
  }

  // ── Devis (cart page) ──────────────────────────────────────

  function renderDevis() {
    if (!dom.devisList) return;
    var items = getCart();
    var footer = document.getElementById('devisFooter');
    var statItems = document.getElementById('devisStatItems');
    var statTotal = document.getElementById('devisStatTotal');
    var footerTotal = document.getElementById('devisFooterTotal');

    if (items.length === 0) {
      dom.devisList.innerHTML =
        '<div class="devis-empty">'
        + '<div class="devis-empty__icon">🛒</div>'
        + '<h3 class="devis-empty__title">Votre panier est vide</h3>'
        + '<p class="devis-empty__text">Parcourez notre catalogue et ajoutez vos outils préférés</p>'
        + '<a class="devis-btn devis-btn--browse" href="#/catalogue">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>'
        + '<span>Découvrir le catalogue</span>'
        + '</a>'
        + '</div>';
      if (footer) footer.style.display = 'none';
      if (statItems) statItems.textContent = '0';
      if (statTotal) statTotal.innerHTML = '0 &euro;';
      if (footerTotal) footerTotal.innerHTML = '0 &euro;';
      return;
    }

    if (footer) footer.style.display = '';
    var total = 0;
    var totalQty = 0;
    var html = items.map(function (item, idx) {
      var qty = item.qty || 1;
      // Prix unitaire = payUnitCents (source de vérité UNIQUE du montant débité :
      // territoire + supplément coffret inclus, miroir exact du serveur). Une
      // ligne « avec coffret » affiche donc bien base + 15/25 €, comme la fiche
      // et comme le débit réel. Repli item.price pour les lignes historiques.
      var unit = payUnitCents({ key: item.key, coffret: !!item.coffret, price: item.price }) / 100;
      var sub = unit * qty;
      total += sub;
      totalQty += qty;
      return '<div class="devis-item" data-idx="' + idx + '" style="animation-delay:' + (idx * 60) + 'ms">'
        + '<div class="devis-item__img-wrap">'
        + '<img src="' + escapeHTML(item.image || 'images/placeholder.svg') + '" alt="" class="devis-item__img" loading="lazy" decoding="async">'
        + '</div>'
        + '<div class="devis-item__body">'
        + '<div class="devis-item__info">'
        + '<strong class="devis-item__name">' + escapeHTML(item.title) + '</strong>'
        + '<span class="devis-item__brand">' + escapeHTML(item.brand || '') + '</span>'
        + '</div>'
        + '<div class="devis-item__bottom">'
        + '<div class="devis-item__qty-wrap">'
        + '<button class="devis-qty-btn devis-qty-minus" data-idx="' + idx + '" aria-label="Moins">−</button>'
        + '<span class="devis-qty-value">' + qty + '</span>'
        + '<button class="devis-qty-btn devis-qty-plus" data-idx="' + idx + '" aria-label="Plus">+</button>'
        + '</div>'
        + '<span class="devis-item__subtotal">' + formatPrice(sub) + '</span>'
        + '<button class="devis-buy" data-idx="' + idx + '" aria-label="Payer cette ligne">💳 Payer</button>'
        + '<button class="devis-remove" data-idx="' + idx + '" aria-label="Supprimer">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'
        + '</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    }).join('');

    dom.devisList.innerHTML = html;

    // A3 — le total affiché EST le montant débité au paiement carte (plein
    // tarif, recalculé serveur). L'ancienne version affichait ici le total
    // remisé fidélité alors que la modale de paiement débitait le plein tarif :
    // prix affiché ≠ prix payé, inacceptable en B2C. La remise fidélité n'est
    // PAS appliquée au débit car son état vit en localStorage (falsifiable
    // côté client, invérifiable serveur) — elle reste affichée comme avantage
    // à faire valoir sur devis WhatsApp (bloc fidélité ci-dessous).
    var loyalty = getLoyaltyState ? getLoyaltyState(total) : null;

    // Estimated shipping for current territory
    var terrInfo = getTerritory() || getTerritory(DEFAULT_TERRITORY);
    var shipping = shippingEstimateFor(terrInfo.code);

    // Update stats
    if (statItems) statItems.textContent = totalQty;
    if (statTotal) statTotal.textContent = formatPrice(total);
    if (footerTotal) footerTotal.textContent = formatPrice(total);

    // Shipping estimate line
    var shippingEl = document.getElementById('devisShipping');
    if (shippingEl) {
      shippingEl.hidden = false;
      shippingEl.innerHTML = '<span class="devis-shipping__label">🚢 Livraison ' + escapeHTML(terrInfo.name) + '</span>'
        + '<span class="devis-shipping__value">à partir de ' + formatPrice(shipping.price) + '</span>'
        + '<span class="devis-shipping__delay">' + shipping.days + '</span>';
    }

    // Loyalty line in the footer (if we have a tier banner slot)
    var loyaltyEl = document.getElementById('devisLoyalty');
    if (loyaltyEl) {
      if (loyalty && loyalty.discountPct > 0) {
        var pct = loyalty.totalSpent > 0
          ? Math.min(100, Math.round((loyalty.totalSpent / (loyalty.nextTierAt || loyalty.totalSpent)) * 100))
          : 0;
        // Libellé factuel : le total ci-dessus reste le plein tarif ; la
        // remise est déduite AU PAIEMENT CARTE, calculée par le serveur depuis
        // l'historique d'achats VÉRIFIÉ (journal webhook — le palier local
        // n'est qu'un cache d'affichage synchronisé à chaque paiement).
        loyaltyEl.hidden = false;
        loyaltyEl.innerHTML = '<span class="devis-loyalty__tier">' + loyalty.tierIcon + ' '
          + escapeHTML(loyalty.tierLabel) + '</span>'
          + '<span class="devis-loyalty__save">Avantage −' + loyalty.discountPct + ' % ('
          + formatPrice(total - loyalty.discountedTotal) + ') — déduit au paiement carte selon votre historique vérifié</span>'
          + '<div class="devis-loyalty__bar"><div class="devis-loyalty__fill" style="width:' + pct + '%"></div></div>';
      } else if (loyalty) {
        var nextMin = loyalty.nextTierAt || 500;
        var pctNext = Math.min(100, Math.round(((loyalty.totalSpent || 0) / nextMin) * 100));
        loyaltyEl.hidden = false;
        loyaltyEl.innerHTML = '<span class="devis-loyalty__tier">' + loyalty.tierIcon + ' '
          + escapeHTML(loyalty.tierLabel) + '</span>'
          + '<span class="devis-loyalty__hint">Encore ' + formatPrice(Math.max(0, nextMin - (loyalty.totalSpent || 0)))
          + ' pour le palier suivant</span>'
          + '<div class="devis-loyalty__bar"><div class="devis-loyalty__fill" style="width:' + pctNext + '%"></div></div>';
      } else {
        loyaltyEl.hidden = true;
      }
    }
  }

  function sendDevisWhatsApp() {
    if (!WA_PHONE) { toast('Contact bientôt disponible', 'info'); return; }
    var items = getCart();
    if (items.length === 0) { toast('Panier vide', 'error'); return; }
    var msg = waCartMessage(items, _currentTerritory);
    // noopener : la page ouverte ne reçoit pas window.opener (anti-tabnabbing),
    // cohérent avec les autres window.open du fichier.
    window.open(waLink(msg), '_blank', 'noopener');

    // Save to Firestore order history (if authenticated)
    var total = 0;
    items.forEach(function (item) {
      var p = findProductByKey(item.key);
      var unit = p ? calcPrice(p, _currentTerritory).ttc : Number(item.price) || 0;
      total += unit * (item.qty || 1);
    });
    saveOrderToFirestore(items.length, total);
    if (typeof track === 'function') track('whatsapp_click', { source: 'devis' });
  }

  // ── Products ───────────────────────────────────────────────

  var PRODUCTS_CACHE_KEY = 'pt_products_cache';
  var products = [];
  var allCategories = [];
  var allBrands = [];

  function loadProducts() {
    // STRATÉGIE (robustesse — l'accueil ne doit JAMAIS attendre le serverless) :
    //   0) cache localStorage      → rendu instantané sur visite répétée
    //   1) products.json (statique) → CHEMIN RAPIDE : servi par le CDN de bord,
    //      SANS Firestore. C'est lui qui peint l'accueil, tout de suite.
    //   2) /api/products (overrides admin) → enrichissement, BORNÉ à 6 s.
    // Avant : /api/products (qui lit Firestore) était le fetch PRIMAIRE, SANS
    // timeout, et le fallback statique ne se déclenchait que sur ERREUR — jamais
    // sur LENTEUR. Un serverless froid + Firestore lent figeait donc l'accueil
    // (produits ET carrousel vides) plusieurs dizaines de secondes.
    var apiConfigured = typeof window.PT_API_BASE === 'string';
    var apiBase = apiBaseUrl();
    var staticUrl = 'products.json';
    var overridesUrl = apiConfigured ? (apiBase + '/api/products') : null;

    function extractProducts(data) {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.products)) return data.products;
      return null;
    }

    function tryFetch(url) {
      return fetch(url, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          var arr = extractProducts(data);
          if (!arr) throw new Error('Invalid response shape');
          return arr;
        });
    }

    // Borne un fetch : rejette au-delà de `ms` (un serverless froid ne doit
    // jamais figer l'affichage).
    function withTimeout(p, ms) {
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
        p.then(function (v) { clearTimeout(t); resolve(v); },
               function (e) { clearTimeout(t); reject(e); });
      });
    }

    // Fraîcheur croissante : cache < static < api. Une source ne remplace jamais
    // une source plus fraîche déjà appliquée (course réseau maîtrisée).
    var RANK = { cache: 0, static: 1, api: 2 };
    var appliedRank = -1;
    var lastJson = null;
    function apply(arr, source) {
      if (!Array.isArray(arr) || arr.length === 0) return; // jamais de catalogue vide
      if (RANK[source] <= appliedRank) return;
      appliedRank = RANK[source];
      var json = JSON.stringify(arr);
      // Données IDENTIQUES à ce qui est déjà affiché (cas courant : aucun override
      // admin → /api/products renvoie exactement products.json) → on NE re-rend
      // PAS : un re-render inutile rechargeait toutes les images (marques + cartes)
      // une 2e fois et cassait l'ordre de priorité de chargement.
      if (json === lastJson) return;
      lastJson = json;
      try { localStorage.setItem(PRODUCTS_CACHE_KEY, json); } catch (_) {}
      setProducts(arr);
      // L'arrivée de données N'EST JAMAIS une navigation → toujours
      // isDataRefresh=true : re-render EN PLACE (pas de scroll reset, pas de
      // page_view — dédupliqué par routeKey dans onRouteChange). Avant, le 1er
      // apply() repassait en onRouteChange(false) → à CHAQUE cold load en
      // navigation privée : double rendu complet de la route + page_view ×2
      // (stats admin gonflées ~×2 sur la page d'atterrissage).
      onRouteChange(true);
    }

    // 0) Cache instantané (no-op en navigation privée).
    try {
      var cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
      if (cached) {
        var carr = JSON.parse(cached);
        if (Array.isArray(carr) && carr.length > 0) apply(carr, 'cache');
      }
    } catch (_) { /* ignore */ }

    // 1) Statique d'abord — rapide, jamais bloquant.
    tryFetch(staticUrl)
      .then(function (arr) { apply(arr, 'static'); })
      .catch(function (err) { console.warn('[products] statique KO:', err.message); });

    // 2) Enrichissement overrides — borné, non bloquant.
    if (overridesUrl) {
      withTimeout(tryFetch(overridesUrl), 6000)
        .then(function (arr) { apply(arr, 'api'); })
        .catch(function (err) { console.warn('[products] overrides ignorés:', err.message); });
    }

    // 3) Filet : si rien n'a pu être rendu au bout de 8 s, prévenir l'utilisateur.
    setTimeout(function () {
      if (products.length === 0) toast('Impossible de charger les produits', 'error');
    }, 8000);
  }

  function setProducts(arr) {
    products = arr;
    var catSet = {}, brandSet = {};
    arr.forEach(function (p) {
      if (p.category) catSet[p.category] = true;
      if (p.brand) brandSet[p.brand] = true;
    });
    allCategories = Object.keys(catSet).sort();
    allBrands = Object.keys(brandSet).sort();
  }

  // ── Catalogue rendering ────────────────────────────────────

  var currentFilter = { query: '', category: '' };

  function renderCategoryChips() {
    if (!dom.catList) return;
    var html = '<button class="cat-chip active" data-cat="" data-track="chip:Tout">Tout</button>';
    allCategories.forEach(function (c) {
      html += '<button class="cat-chip" data-cat="' + escapeHTML(c) + '" data-track="chip:' + escapeHTML(c) + '">' + escapeHTML(c) + '</button>';
    });
    dom.catList.innerHTML = html;
  }

  function renderCategorySelect() {
    if (!dom.tag) return;
    var html = '<option value="">Toutes catégories</option>';
    allCategories.forEach(function (c) {
      html += '<option value="' + escapeHTML(c) + '">' + escapeHTML(c) + '</option>';
    });
    dom.tag.innerHTML = html;
  }

  function syncFilters() {
    if (dom.tag) dom.tag.value = currentFilter.category;
    $$('.cat-chip', dom.catList).forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.cat === currentFilter.category);
    });
  }

  function filteredProducts() {
    var q = currentFilter.query.toLowerCase().trim();
    var cat = currentFilter.category;
    return products.filter(function (p) {
      // Les variantes « avec coffret » ne s'affichent pas dans la grille : elles
      // sont accessibles via le switch de la fiche de leur solo (variantSecondary).
      if (p.variantSecondary) return false;
      if (cat && p.category !== cat) return false;
      if (q) {
        var hay = (p.title + ' ' + p.brand + ' ' + (p.desc || '') + ' ' + (p.description || '')).toLowerCase();
        return hay.indexOf(q) !== -1;
      }
      return true;
    });
  }

  // ── Grille catalogue PAGINÉE ───────────────────────────────────────────────
  // On n'affiche JAMAIS plus de PAGE_SIZE cartes à la fois (les pages précédentes
  // sont retirées du DOM). Rendre 185 — ou même 50 — fiches d'un coup fait une
  // page trop longue → iOS Safari ne peint pas assez vite en scroll inertiel
  // (cartes « disparues »). Avec un DOM borné à 40, le scroll reste fluide même
  // sur un vieil iPad. Boutons de page classiques (‹ 1 2 3 … ›).
  var PAGE_SIZE = 40;
  var _gridItems = [];
  var _gridPage = 1;
  var _pagerWired = false;

  function productCardHTML(p) {
    var out = isOutOfStock(p);
    var price = calcPrice(p, _currentTerritory);
    return '<a class="product-card' + (out ? ' product-card--out' : '') + '" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
      + '<div class="product-card__img-wrap">'
      + productCardVisual(p)
      + (p.tag ? '<span class="product-card__tag">' + escapeHTML(p.tag) + '</span>' : '')
      + stockBadge(p)
      + wishlistButton(p)
      + '</div>'
      + '<div class="product-card__body">'
      + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
      + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
      + '<span class="product-card__price">' + formatPrice(price.ttc) + ' <small>TTC</small></span>'
      + '</div>'
      + '</a>';
  }

  // Liste compacte de numéros de page : 1 … (p-1) p (p+1) … N
  function pagerNumbers(cur, total) {
    if (total <= 7) { var a = []; for (var i = 1; i <= total; i++) a.push(i); return a; }
    var out = [1];
    var lo = Math.max(2, cur - 1), hi = Math.min(total - 1, cur + 1);
    if (lo > 2) out.push('…');
    for (var j = lo; j <= hi; j++) out.push(j);
    if (hi < total - 1) out.push('…');
    out.push(total);
    return out;
  }

  function renderPager(totalPages) {
    var pager = document.getElementById('pager');
    if (!pager) return;
    if (totalPages <= 1) { pager.innerHTML = ''; pager.hidden = true; return; }
    pager.hidden = false;
    var html = '<button class="pager__btn pager__nav" data-page="prev"' + (_gridPage === 1 ? ' disabled' : '') + ' aria-label="Page precedente">‹</button>';
    pagerNumbers(_gridPage, totalPages).forEach(function (n) {
      if (n === '…') html += '<span class="pager__ellipsis">…</span>';
      else html += '<button class="pager__btn' + (n === _gridPage ? ' active' : '') + '" data-page="' + n + '"' + (n === _gridPage ? ' aria-current="page"' : '') + '>' + n + '</button>';
    });
    html += '<button class="pager__btn pager__nav" data-page="next"' + (_gridPage === totalPages ? ' disabled' : '') + ' aria-label="Page suivante">›</button>';
    pager.innerHTML = html;
    if (!_pagerWired) {
      _pagerWired = true;
      pager.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-page]');
        if (!btn || btn.disabled) return;
        var tp = Math.max(1, Math.ceil(_gridItems.length / PAGE_SIZE));
        var v = btn.getAttribute('data-page');
        if (v === 'prev') _gridPage = Math.max(1, _gridPage - 1);
        else if (v === 'next') _gridPage = Math.min(tp, _gridPage + 1);
        else _gridPage = Math.min(tp, Math.max(1, parseInt(v, 10) || 1));
        renderGridPage();
        // Remonter en haut de la liste (au-dessus = barre de recherche/chips).
        var y = dom.list.getBoundingClientRect().top + window.pageYOffset - 96;
        window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
      });
    }
  }

  function renderGridPage() {
    if (!dom.list) return;
    var totalPages = Math.max(1, Math.ceil(_gridItems.length / PAGE_SIZE));
    if (_gridPage > totalPages) _gridPage = totalPages;
    if (_gridPage < 1) _gridPage = 1;
    if (_gridItems.length === 0) {
      dom.list.innerHTML = '<p class="no-results">Aucun produit trouvé.</p>';
      renderPager(0);
      return;
    }
    var start = (_gridPage - 1) * PAGE_SIZE;
    var pageItems = _gridItems.slice(start, start + PAGE_SIZE);
    dom.list.innerHTML = pageItems.map(productCardHTML).join('');
    preloadModelViewers(dom.list);
    renderPager(totalPages);
  }

  function renderProductList() {
    if (!dom.list) return;
    _gridItems = filteredProducts();
    _gridPage = 1;                      // tout changement de filtre/route → page 1
    renderGridPage();
  }

  // ── Brand grid (home page) ─────────────────────────────────

  var BRAND_IMAGES = {
    'DeWALT': 'images/brands/dewalt.png',
    'Facom': 'images/brands/facom.webp',
    'Festool': 'images/brands/festool.png',
    'Flex': 'images/brands/flex.png',
    'Makita': 'images/brands/makita.png',
    'Stanley': 'images/brands/stanley.png',
    'Wera': 'images/brands/wera.png'
  };

  // ── 3D Brand spheres (Three.js) ────────────────────────────
  var BRAND_COLORS = {
    'DeWALT':  '#FEBD17',
    'Facom':   '#E30613',
    'Festool': '#0E7C3A',
    'Flex':    '#D40000',
    'Makita':  '#00A1E4',
    'Stanley': '#FFCB05',
    'Wera':    '#1B1B1B'
  };
  var _brandScenes = [];

  function sampleLogoEdgeColor(img) {
    // Sample many perimeter pixels of the source PNG; average all opaque ones.
    // This gives the actual background color around the logo subject.
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    var W = img.width, H = img.height;
    var step = Math.max(1, Math.floor(Math.min(W, H) / 40));
    var data;
    try { data = cx.getImageData(0, 0, W, H).data; }
    catch (e) { return null; }
    var r = 0, g = 0, b = 0, n = 0;
    function sample(x, y) {
      var i = (y * W + x) * 4;
      if (data[i + 3] > 220) { r += data[i]; g += data[i+1]; b += data[i+2]; n++; }
    }
    for (var x = 0; x < W; x += step) { sample(x, 0); sample(x, H - 1); }
    for (var y = 0; y < H; y += step) { sample(0, y); sample(W - 1, y); }
    // Also sample a ring just inside (in case PNG has a transparent border)
    var inset = Math.floor(Math.min(W, H) * 0.05);
    for (var x2 = inset; x2 < W - inset; x2 += step) { sample(x2, inset); sample(x2, H - 1 - inset); }
    for (var y2 = inset; y2 < H - inset; y2 += step) { sample(inset, y2); sample(W - 1 - inset, y2); }
    if (n < 6) return null;
    return 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
  }

  function buildBrandTexture(logoSrc, fallbackColor, cb) {
    var SIZE = 1024;
    var canvas = document.createElement('canvas');
    canvas.width = SIZE * 2;
    canvas.height = SIZE;
    var ctx = canvas.getContext('2d');

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var bg = sampleLogoEdgeColor(img) || fallbackColor;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      var maxW = SIZE * 1.1;
      var maxH = SIZE * 0.7;
      var ratio = Math.min(maxW / img.width, maxH / img.height);
      var w = img.width * ratio;
      var h = img.height * ratio;
      var x = (canvas.width - w) / 2;
      var y = (canvas.height - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      cb(canvas);
    };
    img.onerror = function () {
      ctx.fillStyle = fallbackColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      cb(canvas);
    };
    img.src = logoSrc;
  }

  function shadeColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = (num >> 16) + percent;
    var g = ((num >> 8) & 0xff) + percent;
    var b = (num & 0xff) + percent;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  // Lazy-load Three.js once, on demand. Prevents the "multiple
  // instances of Three.js" race with model-viewer at boot, which
  // was breaking GLB rendering on Safari iPad.
  var _threePromise = null;
  function ensureThree() {
    if (typeof window.THREE !== 'undefined') return Promise.resolve(window.THREE);
    if (_threePromise) return _threePromise;
    _threePromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
      s.async = true;
      s.onload = function () { resolve(window.THREE); };
      s.onerror = function () { _threePromise = null; reject(new Error('three load failed')); };
      document.head.appendChild(s);
    });
    return _threePromise;
  }

  // Lazy-load <model-viewer> (Google, ~200 Ko) UNIQUEMENT quand un modèle 3D
  // doit s'afficher — plus dans le <head>, donc hors du chemin critique du 1er
  // paint. Idempotent. Un <model-viewer> déjà présent dans le DOM s'upgrade
  // tout seul dès que le custom element est défini (ses attributs src/
  // camera-controls sont relus à l'upgrade) → l'ordre « src d'abord, script
  // ensuite » est sûr. On résout sur whenDefined (signal fiable de définition)
  // et on rejette sur l'échec réseau du script.
  var _mvPromise = null;
  function ensureModelViewer() {
    if (window.customElements && customElements.get('model-viewer')) return Promise.resolve();
    if (_mvPromise) return _mvPromise;
    _mvPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js';
      // SRI RETIRÉ (régression 3D) : crossOrigin='anonymous' + integrity
      // exigeaient que le CDN réponde en CORS ET que les octets reçus par le
      // navigateur correspondent au hash au bit près — condition invérifiable
      // ici et qui bloquait le chargement de model-viewer. La protection reste
      // la restriction d'ORIGINE de la CSP (script-src ajax.googleapis.com) :
      // un attaquant ne peut pas charger ce script depuis un autre domaine.
      s.onerror = function () { _mvPromise = null; reject(new Error('model-viewer load failed')); };
      document.head.appendChild(s);
      if (window.customElements && customElements.whenDefined) {
        customElements.whenDefined('model-viewer').then(function () { resolve(); });
      } else {
        s.onload = function () { resolve(); };
      }
    });
    return _mvPromise;
  }

  function createBrandSphere(container, brand, logoSrc) {
    if (container.dataset.sphereReady === '1') return;
    // Garde anti-orphelin : le chargement de three.js est asynchrone (CDN) et
    // la grille de marques peut être re-rendue (innerHTML) entre-temps — le
    // container capturé par la closure est alors DÉTACHÉ du DOM. Sans cette
    // garde, on créait un WebGLRenderer par container mort (jusqu'à 7 par
    // re-rendu), poussé dans _brandScenes et jamais disposé → épuisement des
    // contextes WebGL (~16 max, l'iPad sature le premier).
    if (!container.isConnected) return;
    if (typeof window.THREE === 'undefined') {
      // Defer until Three is ready, then re-enter once.
      ensureThree().then(function () {
        createBrandSphere(container, brand, logoSrc);
      }).catch(function () { /* keep CSS fallback */ });
      return;
    }
    container.dataset.sphereReady = '1';

    var w = container.clientWidth || 120;
    var h = container.clientHeight || 120;
    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'brand-card__canvas';
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.z = 3.4;

    var ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);
    var key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 2, 4);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0xa78bfa, 0.5);
    rim.position.set(-2, -1, -2);
    scene.add(rim);

    var geom = new THREE.SphereGeometry(1, 64, 64);
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.15
    });
    var sphere = new THREE.Mesh(geom, mat);
    sphere.rotation.y = -Math.PI / 2;
    scene.add(sphere);

    buildBrandTexture(logoSrc, BRAND_COLORS[brand] || '#8B5CF6', function (canvas) {
      var tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
      tex.anisotropy = 8;
      mat.map = tex;
      mat.needsUpdate = true;
      renderer.render(scene, camera);
      var fb = container.querySelector('.brand-card__logo--fallback');
      if (fb) fb.style.opacity = '0';
    });
    renderer.render(scene, camera);

    var entry = { renderer: renderer, scene: scene, camera: camera, sphere: sphere, container: container, visible: true, ro: null };
    _brandScenes.push(entry);

    // Resize observer (stored in entry for cleanup)
    if (typeof ResizeObserver !== 'undefined') {
      entry.ro = new ResizeObserver(function () {
        var nw = container.clientWidth, nh = container.clientHeight;
        if (nw && nh) {
          renderer.setSize(nw, nh);
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
        }
      });
      entry.ro.observe(container);
    }
  }

  var _brandScrollBound = false;
  var _brandRafId = null;
  var _brandLastScroll = 0;
  var _brandRotVel = 0;
  var _brandRotX = 0;
  function bindBrandScroll() {
    if (_brandScrollBound) return;
    _brandScrollBound = true;
    function tick() {
      var spring = -_brandRotX * 0.06;
      _brandRotVel += spring;
      _brandRotVel *= 0.86;
      _brandRotX += _brandRotVel;

      var anyVisible = false;
      for (var i = 0; i < _brandScenes.length; i++) {
        var s = _brandScenes[i];
        if (!s.visible) continue;
        anyVisible = true;
        s.sphere.rotation.x = _brandRotX;
        s.renderer.render(s.scene, s.camera);
      }

      // Idle detection: stop the loop when nothing visible AND motion settled.
      var settled = Math.abs(_brandRotVel) < 0.0005 && Math.abs(_brandRotX) < 0.0005;
      if (!anyVisible || settled) {
        _brandRafId = null;
        _brandScrollBound = false;
        return;
      }
      _brandRafId = requestAnimationFrame(tick);
    }
    _brandRafId = requestAnimationFrame(tick);
  }
  function startBrandRaf() { bindBrandScroll(); }

  // Wake brand RAF on scroll (loop self-stops when idle)
  window.addEventListener('scroll', function () {
    var sy = window.scrollY || 0;
    var d = sy - _brandLastScroll;
    _brandLastScroll = sy;
    _brandRotVel += d * 0.0015;
    if (!_brandScrollBound && _brandScenes.some(function (s) { return s.visible; })) {
      bindBrandScroll();
    }
  }, { passive: true });

  var _brandIO = null;
  function disposeBrandScenes() {
    if (_brandIO) { _brandIO.disconnect(); _brandIO = null; }
    _brandScenes.forEach(function (s) {
      try { if (s.ro) s.ro.disconnect(); } catch (_) {}
      try { s.renderer.dispose(); } catch (_) {}
      try {
        if (s.renderer.domElement && s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
      } catch (_) {}
    });
    _brandScenes.length = 0;
  }

  function initBrandSpheres() {
    // Drop stale scenes from a previous home render (detached DOM).
    disposeBrandScenes();
    var bubbles = document.querySelectorAll('[data-brand-sphere]');
    if (!bubbles.length) return;
    // Ensure Three.js is available then create all spheres
    ensureThree().then(function () {
      bubbles.forEach(function (el) {
        var brand = el.getAttribute('data-brand-sphere');
        var logo = el.getAttribute('data-logo');
        createBrandSphere(el, brand, logo);
      });
    }).catch(function () { /* fallback logos stay visible */ });
    // Visibility is driven by an IO so we don't render off-screen scenes.
    _brandIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var el = e.target;
        _brandScenes.forEach(function (s) {
          if (s.container === el) s.visible = e.isIntersecting;
        });
      });
      startBrandRaf();
    }, { rootMargin: '200px' });
    bubbles.forEach(function (b) { _brandIO.observe(b); });
  }

  function renderBrandGrid() {
    if (!dom.brandGrid) return;
    var brandNames = Object.keys(BRAND_IMAGES);
    dom.brandGrid.innerHTML = brandNames.map(function (b, i) {
      var img = BRAND_IMAGES[b];
      return '<button class="brand-card" data-brand="' + escapeHTML(b) + '" style="animation-delay:' + (i * 70) + 'ms">'
        + '<div class="brand-card__ring">'
        + '<div class="brand-card__bubble" data-brand-sphere="' + escapeHTML(b) + '" data-logo="' + escapeHTML(img) + '">'
        + '<img class="brand-card__logo brand-card__logo--fallback" src="' + escapeHTML(img) + '" alt="' + escapeHTML(b) + '" loading="lazy" decoding="async">'
        + '</div>'
        + '</div>'
        + '<span class="brand-card__name">' + escapeHTML(b) + '</span>'
        + '</button>';
    }).join('')
      // Bulle « Livraison quincaillerie » (service coursier) — pas une marque :
      // navigue vers la page #/livraison (pas de sphère 3D, pas de filtre).
      + '<button class="brand-card" data-brand="__livraison" style="animation-delay:' + (brandNames.length * 70) + 'ms">'
      + '<div class="brand-card__ring">'
      + '<div class="brand-card__bubble brand-card__bubble--liv" aria-hidden="true">🛵</div>'
      + '</div>'
      + '<span class="brand-card__name">Livraison quincaillerie</span>'
      + '</button>';

    initBrandSpheres();
    // Re-observe newly inserted reveal targets (brands grid + section).
    observeReveals(dom.brandGrid.closest('.view') || document);

    $$('.brand-card', dom.brandGrid).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var brand = btn.dataset.brand;
        // Bulle Quincaillerie : même mécanique que les marques — catalogue avec
        // la recherche pré-remplie « Quincaillerie » (les 304 fiches QC- matchent
        // par brand/catégorie). La page #/livraison reste accessible via le menu.
        if (brand === '__livraison') brand = 'Quincaillerie';
        location.hash = '#/catalogue';
        // Slight delay so route change renders catalogue first
        setTimeout(function () {
          currentFilter.query = brand;
          if (dom.q) dom.q.value = brand;
          renderProductList();
        }, 50);
      });
    });
  }

  // ── Home products scroll strip ─────────────────────────────

  // Bandeau « Nos produits » (accueil) : VITRINE bornée, pas le catalogue entier.
  // Rendre les 207 produits ici (dont les 21 variantes coffret censées être
  // masquées) = exactement le problème que la pagination du catalogue (PAGE_SIZE
  // 40) a été créée pour éviter — sur la page d'atterrissage, en navigation
  // privée, à chaque visite. Règles : variantes coffret exclues (même règle que
  // filteredProducts), cap HOME_STRIP_MAX, priorité aux produits qui ont une
  // vraie photo (un bandeau de placeholders ne vend rien), carte « Voir tout »
  // en fin de piste vers le catalogue complet.
  var HOME_STRIP_MAX = 16;
  function renderHomeProducts() {
    var track = document.getElementById('homeProductsTrack');
    if (!track) return;
    if (products.length === 0) {
      track.innerHTML = '<p class="no-results">Aucun produit pour le moment.</p>';
      return;
    }
    var pool = products.filter(function (p) { return !p.variantSecondary; });
    var withImg = [], noImg = [];
    pool.forEach(function (p) {
      var real = p.img && p.img.indexOf('placeholder') === -1;
      (real ? withImg : noImg).push(p);
    });
    var list = withImg.concat(noImg).slice(0, HOME_STRIP_MAX);
    track.innerHTML = list.map(function (p) {
      var out = isOutOfStock(p);
      var price = calcPrice(p, _currentTerritory);
      return '<a class="product-card' + (out ? ' product-card--out' : '') + '" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
        + '<div class="product-card__img-wrap">'
        + productCardVisual(p)
        + (p.tag ? '<span class="product-card__tag">' + escapeHTML(p.tag) + '</span>' : '')
        + stockBadge(p)
        + wishlistButton(p)
        + '</div>'
        + '<div class="product-card__body">'
        + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
        + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
        + '<span class="product-card__price">' + formatPrice(price.ttc) + ' <small>TTC</small></span>'
        + '</div>'
        + '</a>';
    }).join('')
      + '<a class="product-card product-card--more" href="#/catalogue">'
      + '<span class="product-card__more-icon">→</span>'
      + '<span class="product-card__more-label">Voir tout le catalogue</span>'
      + '<span class="product-card__more-count">' + pool.length + ' produits</span>'
      + '</a>';
    preloadModelViewers(track);
  }

  // ── Scroll passthrough : page scroll quand le 3D est au zoom min/max ──

  function setupModelViewerScrollPassthrough(mv) {
    if (!mv) return;

    // Cleanup des anciens listeners. mv (#pdp3d / #pdp3dSecondary) persiste entre
    // les rendus PDP : sans retirer mouseleave/touchstart, ils s'accumulent à
    // chaque renderPDP.
    if (mv._wheelHandler)      mv.removeEventListener('wheel', mv._wheelHandler, true);
    if (mv._mouseLeaveHandler) mv.removeEventListener('mouseleave', mv._mouseLeaveHandler);
    if (mv._touchHandler)      mv.removeEventListener('touchstart', mv._touchHandler);

    var passActive = false;

    mv._wheelHandler = function (e) {
      var fov;
      try { fov = mv.getFieldOfView(); } catch (_) { return; }

      var maxFov = parseFloat(mv.getAttribute('max-field-of-view')) || 50;
      var minFov = parseFloat(mv.getAttribute('min-field-of-view')) || 15;
      var scrollingDown = e.deltaY > 0;
      var scrollingUp = e.deltaY < 0;
      var atZoomMin = fov >= maxFov - 0.8;
      var atZoomMax = fov <= minFov + 0.8;

      // Quand au zoom min et scroll bas, ou zoom max et scroll haut → page scroll
      if ((scrollingDown && atZoomMin) || (scrollingUp && atZoomMax)) {
        if (!passActive) {
          passActive = true;
          mv.style.pointerEvents = 'none';
        }
      } else {
        // L'utilisateur zoome dans une direction valide → rendre le contrôle au 3D
        if (passActive) {
          passActive = false;
          mv.style.pointerEvents = '';
        }
      }
    };

    // Restaurer pointer-events quand la souris quitte le viewer
    mv._mouseLeaveHandler = function () {
      if (passActive) {
        passActive = false;
        mv.style.pointerEvents = '';
      }
    };

    // Restaurer aussi au touchstart (mobile)
    mv._touchHandler = function () {
      if (passActive) {
        passActive = false;
        mv.style.pointerEvents = '';
      }
    };

    mv.addEventListener('wheel', mv._wheelHandler, { capture: true, passive: true });
    mv.addEventListener('mouseleave', mv._mouseLeaveHandler);
    mv.addEventListener('touchstart', mv._touchHandler, { passive: true });
  }

  // ── PDP (Product Detail Page) ──────────────────────────────

  // Cadre le poster du héros AU PLUS GROS possible entre la topbar et le titre,
  // sans jamais chevaucher ni l'une ni l'autre. Détecte les bords RÉELS du
  // produit dans l'image (les posters ont une marge de fond variable) via un
  // mini-canvas, puis applique translate+scale : le produit est calé juste sous
  // la topbar (petite marge) et réduit UNIQUEMENT si sa hauteur dépasse la place
  // au-dessus du titre. Marche pour les posters actuels comme pour les futurs PNG.
  function fitHeroPoster() {
    var img = dom.pdpHeroImg;
    var hero = document.getElementById('pdpHero');
    var title = dom.pdpTitle;
    if (!img || !hero || !title) return;
    function run() {
      try {
        var W = img.clientWidth, H = img.clientHeight;
        var nw = img.naturalWidth, nh = img.naturalHeight;
        if (!W || !H || !nw || !nh) return;
        // 1) Bords du produit dans l'image (fond = médiane des 4 coins).
        var cv = document.createElement('canvas');
        var sc = Math.min(1, 200 / Math.max(nw, nh));
        cv.width = Math.max(1, Math.round(nw * sc));
        cv.height = Math.max(1, Math.round(nh * sc));
        var cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        var d = cx.getImageData(0, 0, cv.width, cv.height).data;
        var cw = cv.width, ch = cv.height;
        function px(x, y) { var i = (y * cw + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
        var corners = [px(0, 0), px(cw - 1, 0), px(0, ch - 1), px(cw - 1, ch - 1)];
        var br = 0, bg = 0, bb = 0;
        corners.forEach(function (c) { br += c[0]; bg += c[1]; bb += c[2]; });
        br /= 4; bg /= 4; bb /= 4;
        var hasAlpha = corners.some(function (c) { return c[3] < 20; });
        var minY = ch, maxY = -1;
        for (var y = 0; y < ch; y++) {
          for (var x = 0; x < cw; x++) {
            var i = (y * cw + x) * 4;
            var a = d[i + 3];
            var dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb;
            var isProd = hasAlpha ? (a > 25) : (a > 25 && (dr * dr + dg * dg + db * db) > 1400);
            if (isProd) { if (y < minY) minY = y; if (y > maxY) maxY = y; break; }
          }
          // scan complet de la ligne seulement si utile (perf) — ici on s'arrête
          // au 1er pixel produit de la ligne pour les bornes verticales.
        }
        if (maxY < 0 || (maxY - minY) < ch * 0.15) return; // détection douteuse → défaut CSS
        var tn = minY / ch, bn = (maxY + 1) / ch;   // bornes verticales normalisées
        // 2) Placement object-fit: contain de l'image dans l'élément.
        var imgAR = nw / nh, boxAR = W / H, drawH, dy0;
        if (imgAR > boxAR) { drawH = W / imgAR; dy0 = (H - drawH) / 2; }
        else { drawH = H; dy0 = 0; }
        var prodTop = dy0 + tn * drawH;
        var prodBot = dy0 + bn * drawH;
        var prodH = prodBot - prodTop;
        // 3) Zone cible : sous la topbar (marge) → au-dessus du titre (marge).
        //    Position du titre via offsetTop cumulé (insensible aux transforms
        //    d'apparition/parallaxe, contrairement à getBoundingClientRect).
        var titleTop = 0, el = title;
        while (el && el !== hero && el !== document.body) { titleTop += el.offsetTop; el = el.offsetParent; }
        var topMargin = 14;
        var target = (titleTop - 14) - topMargin;   // hauteur dispo
        if (target < 60) return;
        var s = Math.min(1, target / prodH);        // le plus gros possible, sans agrandir
        // origine au sommet du produit → l'échelle réduit vers le bas, le sommet
        // reste calé ; translateY amène ce sommet juste sous la topbar.
        img.style.transformOrigin = '50% ' + prodTop.toFixed(1) + 'px';
        img.style.transform = 'translateY(' + (topMargin - prodTop).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
      } catch (_) { /* fond CSS par défaut conservé */ }
    }
    if (img.complete && img.naturalWidth) run();
    else img.onload = run;
    _heroFitFn = run;   // rappel au resize / changement d'orientation
  }
  var _heroFitFn = null;
  var _heroFitRAF = 0;
  window.addEventListener('resize', function () {
    if (!_heroFitFn) return;
    if (_heroFitRAF) cancelAnimationFrame(_heroFitRAF);
    _heroFitRAF = requestAnimationFrame(function () { try { _heroFitFn(); } catch (_) {} });
  });

  function renderPDP(slug) {
    var product = null;
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      if (p.slug === slug || p.id === slug || p.sku === slug) { product = p; break; }
    }
    if (!product) {
      if (dom.pdpTitle) dom.pdpTitle.textContent = 'Produit introuvable';
      return;
    }

    // ── Variante Solo / Coffret ───────────────────────────────────────────────
    // Certains outils existent en « sans coffret » (solo, affiché par défaut sur
    // les cartes) ET « avec coffret » (MAKPAC/valise). Les deux fiches sont liées
    // (variantGroup + coffretSku/soloSku). On résout la paire, on affiche le solo
    // par défaut, et un switch dans le héros permet de basculer (image + prix +
    // cible d'achat). Le coffret est masqué de la grille (variantSecondary).
    var variantSolo = null, variantCoffret = null;
    if (product.variantGroup) {
      if (product.variantRole === 'coffret') {
        variantCoffret = product;
        variantSolo = findProductByKey(product.soloSku) || null;
      } else {
        variantSolo = product;
        variantCoffret = findProductByKey(product.coffretSku) || null;
      }
    }
    var hasVariants = !!(variantSolo && variantCoffret);
    // Produit « actif » (celui qu'on achète / affiche) — mutable par le switch.
    var activeProduct = hasVariants ? variantSolo : product;

    if (dom.pdpTitle) dom.pdpTitle.textContent = product.title;
    // Badges en haut \u00E0 droite (comme les cartes) : pastille stock, puis tag
    // (best-seller\u2026) en dessous. Lib\u00E8re le centre \u2192 titre descendu, poster remont\u00E9.
    if (dom.pdpHeroBadges) {
      var badgesHtml = stockBadge(product);
      if (product.tag) badgesHtml += '<span class="pdp-hero__flag">' + escapeHTML(product.tag) + '</span>';
      dom.pdpHeroBadges.innerHTML = badgesHtml;
    }
    if (dom.pdpDesc) dom.pdpDesc.textContent = product.description || product.desc || '';
    if (dom.pdpImg) {
      dom.pdpImg.src = product.img || 'images/placeholder.svg';
      dom.pdpImg.alt = product.title;
    }

    // Long description (DOM-TOM enriched) + DOM-TOM badges
    var pdpBadges = document.getElementById('pdpBadges');
    if (pdpBadges) {
      var items = productBadgeItems(product);
      pdpBadges.innerHTML = items;
      pdpBadges.hidden = !items;
    }
    var pdpMore = document.getElementById('pdpMore');
    var pdpDescLong = document.getElementById('pdpDescLong');
    if (pdpMore && pdpDescLong) {
      if (product.description_long) {
        pdpDescLong.textContent = product.description_long;
        pdpMore.hidden = false;
      } else {
        pdpMore.hidden = true;
        pdpDescLong.textContent = '';
      }
    }

    // SEO : update title + description + JSON-LD for this product
    setDocMeta(
      product.title + ' — ' + BASE_TITLE,
      (product.description || product.desc || BASE_DESC).slice(0, 160)
    );
    injectProductJsonLd(product);
    injectBreadcrumbLd([
      { name: 'Accueil', hash: '/' },
      { name: 'Catalogue', hash: '/catalogue' },
      { name: product.title, hash: '/produit/' + (product.slug || product.id) }
    ]);
    addRecentlyViewed(product.id);
    if (typeof track === 'function') {
      track('view_item', { id: product.id, name: product.title, brand: product.brand, price: product.price });
    }

    // HÉROS = POSTER produit dans une vraie <img> (jamais de 3D ici) → cadrage
    // contrôlé au pixel côté CSS (produit remonté, bas vide rogné) et plus léger.
    // La 3D est UNIQUEMENT dans le carré « vue détail » (pdp3dSecondary), chargée
    // au scroll (loading=lazy). Si le produit n'a pas de GLB, le carré reste sur
    // son poster (jamais de modèle « fantôme »).
    if (dom.pdpHeroImg) {
      // Héros = version « fiche » (heroImg : lumière cuite + outils horizontaux
      // réduits) ; carte de catalogue = product.img (taille pleine). Repli img.
      dom.pdpHeroImg.src = product.heroImg || product.img || 'images/placeholder.svg';
      dom.pdpHeroImg.alt = product.title;
      fitHeroPoster();
    }
    function setPdpViewer(v, alt, load3D) {
      if (!v) return;
      v.setAttribute('alt', alt);
      if (product.img) v.setAttribute('poster', product.img);
      // #pdp3dSecondary PERSISTE entre les fiches (SPA, même élément réutilisé).
      // Sans reset explicite, model-viewer garde le DERNIER GLB chargé → « modèle
      // fantôme » : un produit sans GLB (ou dont le GLB change) affiche le modèle
      // de la fiche précédente. On force donc l'état EXACT voulu à chaque ouverture.
      var wanted = (product.model && load3D) ? product.model : '';
      var current = v.getAttribute('src') || '';
      if (current !== wanted) {
        // Décharge systématiquement l'ancien modèle AVANT d'installer le bon
        // (transition src: absent → nouveau = rechargement garanti par model-viewer).
        v.removeAttribute('src');
        try { v.src = null; } catch (e) {}
      }
      if (wanted) {
        v.setAttribute('reveal', 'auto');       // charge/affiche SON modèle 3D
        v.setAttribute('src', wanted);
      } else {
        v.setAttribute('reveal', 'manual');     // aucun GLB → figé sur le poster produit
      }
    }
    var viewer2 = document.getElementById('pdp3dSecondary');
    setPdpViewer(viewer2, product.title + ' - vue detail', true);   // carré = le seul 3D

    // model-viewer (script CDN ~200 Ko, caché) requis pour le carré 3D. Le GLB
    // (~2,5 Mo) n'est chargé que par ce carré, au scroll. .catch : échec CDN →
    // le poster du carré reste, aucun rejet non géré.
    if (viewer2) ensureModelViewer().catch(function () {});

    // ── Scroll passthrough quand zoom 3D au minimum (carré uniquement) ──
    setupModelViewerScrollPassthrough(viewer2);

    // NB : l'animation de scroll (initPdpScrollAnimations) est initialisée PLUS BAS,
    // une fois que features/specs/kit sont injectés dans le DOM. Sinon elle capture
    // des <tr>/<li> périmés et le nouveau contenu reste bloqué à opacity:0 (invisible).

    // Price (TTC + HT pour le territoire sélectionné).
    // La pastille stock N'EST PLUS ici (passée en haut à droite, badges) et le
    // dépliant « Détail <territoire> » (octroi/TVA) a été RETIRÉ (demande user) :
    // le détail reste calculé au paiement. Bloc compact → titre resserré au-dessus
    // du bandeau vert.
    if (dom.pdpPrice) {
      var price = calcPrice(product, _currentTerritory);
      dom.pdpPrice.innerHTML = '<span class="pdp-price__ttc">' + formatPrice(price.ttc) + ' TTC</span>'
        + '<span class="pdp-price__ht">' + formatPrice(price.ht) + ' HT</span>';
      localPriceComparison(product, price, dom.pdpPrice);
    }

    // ── Switch de variante (Solo / Coffret) ───────────────────────────────────
    // Applique une variante : image héros, prix affiché, cible d'achat (activeProduct),
    // lien WhatsApp et état visuel des boutons. Ne touche PAS aux specs/3D (identiques :
    // même outil, seul le conditionnement change).
    function applyVariant(v) {
      activeProduct = v;
      var isCof = (v.variantRole === 'coffret');
      if (dom.pdpHeroImg) {
        dom.pdpHeroImg.src = v.heroImg || v.img || 'images/placeholder.svg';
        dom.pdpHeroImg.alt = v.title;
        fitHeroPoster();
      }
      if (dom.pdpImg) { dom.pdpImg.src = v.img || 'images/placeholder.svg'; dom.pdpImg.alt = v.title; }
      if (dom.pdpTitle) dom.pdpTitle.textContent = v.title;
      if (dom.pdpPrice) {
        var pr = calcPrice(v, _currentTerritory);
        dom.pdpPrice.innerHTML = '<span class="pdp-price__ttc">' + formatPrice(pr.ttc) + ' TTC</span>'
          + '<span class="pdp-price__ht">' + formatPrice(pr.ht) + ' HT</span>';
        localPriceComparison(v, pr, dom.pdpPrice);
      }
      if (dom.pdpWa) dom.pdpWa.href = waLink(waProductMessage(v, _currentTerritory));
      var vEl = document.getElementById('pdpVariant');
      if (vEl) {
        var btns = vEl.querySelectorAll('[data-variant]');
        for (var b = 0; b < btns.length; b++) {
          var on = (btns[b].getAttribute('data-variant') === 'coffret') === isCof;
          btns[b].classList.toggle('active', on);
          btns[b].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      }
    }
    // Applique l'option coffret pour un produit SANS vraie variante (standalone) :
    // même switch 2 boutons que les paires, « Avec coffret » = prix de base +
    // supplément d'envoi (+15/25 € La Poste, volume). Le prix de BASE est intact,
    // l'image ne change pas (poster coffret dédié à venir). Pilote _pdpCoffret
    // (repris par addToCart / openPayModal / payUnitCents → débit serveur exact).
    function applyCoffretToggle(prod, withC) {
      _pdpCoffret = !!withC;
      activeProduct = prod;
      var pr = calcPrice(prod, _currentTerritory);
      var surEuro = withC ? coffretSurchargeCents(prod) / 100 : 0;
      var shown = { ttc: pr.ttc + surEuro, ht: pr.ht + surEuro };
      if (dom.pdpPrice) {
        dom.pdpPrice.innerHTML = '<span class="pdp-price__ttc">' + formatPrice(shown.ttc) + ' TTC</span>'
          + '<span class="pdp-price__ht">' + formatPrice(shown.ht) + ' HT</span>';
        localPriceComparison(prod, shown, dom.pdpPrice);
      }
      var vEl = document.getElementById('pdpVariant');
      if (vEl) {
        var bs = vEl.querySelectorAll('[data-coffret]');
        for (var i = 0; i < bs.length; i++) {
          var on = (bs[i].getAttribute('data-coffret') === '1') === !!withC;
          bs[i].classList.toggle('active', on);
          bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      }
    }
    var pdpVariantEl = document.getElementById('pdpVariant');
    if (pdpVariantEl) {
      if (hasVariants) {
        var pSolo = calcPrice(variantSolo, _currentTerritory);
        var pCof = calcPrice(variantCoffret, _currentTerritory);
        pdpVariantEl.hidden = false;
        pdpVariantEl.innerHTML =
          '<div class="pdp-variant__switch" role="group" aria-label="Choix du conditionnement">'
          + '<button type="button" class="pdp-variant__btn" data-variant="solo">'
          + '<span class="pdp-variant__label">Sans coffret</span>'
          + '<span class="pdp-variant__amt">' + formatPrice(pSolo.ttc) + '</span></button>'
          + '<button type="button" class="pdp-variant__btn" data-variant="coffret">'
          + '<span class="pdp-variant__label">Avec coffret</span>'
          + '<span class="pdp-variant__amt">' + formatPrice(pCof.ttc) + '</span></button>'
          + '</div>';
        var vBtns = pdpVariantEl.querySelectorAll('[data-variant]');
        for (var vb = 0; vb < vBtns.length; vb++) {
          vBtns[vb].onclick = (function (which) {
            return function () { applyVariant(which === 'coffret' ? variantCoffret : variantSolo); };
          })(vBtns[vb].getAttribute('data-variant'));
        }
      } else if (coffretEligible(product)) {
        // Produit standalone éligible : switch coffret (supplément d'envoi).
        var pB = calcPrice(product, _currentTerritory);
        var surE = coffretSurchargeCents(product) / 100;
        pdpVariantEl.hidden = false;
        pdpVariantEl.innerHTML =
          '<div class="pdp-variant__switch" role="group" aria-label="Choix du conditionnement">'
          + '<button type="button" class="pdp-variant__btn active" data-coffret="0" aria-pressed="true">'
          + '<span class="pdp-variant__label">Sans coffret</span>'
          + '<span class="pdp-variant__amt">' + formatPrice(pB.ttc) + '</span></button>'
          + '<button type="button" class="pdp-variant__btn" data-coffret="1" aria-pressed="false">'
          + '<span class="pdp-variant__label">Avec coffret</span>'
          + '<span class="pdp-variant__amt">' + formatPrice(pB.ttc + surE) + '</span></button>'
          + '</div>';
        var cBtns = pdpVariantEl.querySelectorAll('[data-coffret]');
        for (var cb = 0; cb < cBtns.length; cb++) {
          cBtns[cb].onclick = (function (withC) {
            return function () { applyCoffretToggle(product, withC); };
          })(cBtns[cb].getAttribute('data-coffret') === '1');
        }
      } else {
        pdpVariantEl.hidden = true;
        pdpVariantEl.innerHTML = '';
      }
    }
    // Applique la variante par défaut (solo si paire, sinon le produit lui-même).
    applyVariant(activeProduct);

    // Note « vendu sans batterie ni chargeur » (machine seule) — demande user.
    var battNote = document.getElementById('pdpBattNote');
    if (battNote) {
      if (batteryNotIncluded(product)) {
        battNote.innerHTML = '<span class="pdp-batt-note__tri" aria-hidden="true">⚠️</span> Vendu sans batterie ni chargeur';
        battNote.hidden = false;
      } else {
        battNote.hidden = true;
        battNote.innerHTML = '';
      }
    }

    // Features (points forts)
    var featuresEl = document.getElementById('pdpFeatures');
    if (featuresEl && product.features && product.features.length > 0) {
      featuresEl.innerHTML = product.features.map(function (f) {
        return '<div class="pdp-feature">'
          + '<div class="pdp-feature__icon">\u2713</div>'
          + '<span>' + escapeHTML(f) + '</span>'
          + '</div>';
      }).join('');
    } else if (featuresEl) {
      featuresEl.innerHTML = '';
    }

    // Specs table — masque le bloc « Caractéristiques » (titre inclus) quand le
    // produit n'a AUCUNE caractéristique, sinon la fiche affiche un titre vide.
    // Dans ce cas la grille 3D+specs passe en colonne unique centrée.
    if (dom.pdpSpecs) {
      var specKeys = product.specs ? Object.keys(product.specs) : [];
      var specsBlock = dom.pdpSpecs.closest('.pdp-split__specs');
      var splitGrid = dom.pdpSpecs.closest('.pdp-split');
      if (specKeys.length > 0) {
        var specsHtml = '<table>';
        specKeys.forEach(function (k) {
          specsHtml += '<tr><td>' + escapeHTML(k) + '</td><td>' + escapeHTML(product.specs[k]) + '</td></tr>';
        });
        specsHtml += '</table>';
        dom.pdpSpecs.innerHTML = specsHtml;
        if (specsBlock) specsBlock.hidden = false;
        if (splitGrid) splitGrid.classList.remove('pdp-split--solo');
      } else {
        dom.pdpSpecs.innerHTML = '';
        if (specsBlock) specsBlock.hidden = true;
        if (splitGrid) splitGrid.classList.add('pdp-split--solo');
      }
    }

    // Kit
    var kitSection = document.getElementById('pdpKitSection');
    var kitEl = document.getElementById('pdpKit');
    if (kitEl && product.kit && product.kit.length > 0) {
      if (kitSection) kitSection.style.display = '';
      kitEl.innerHTML = product.kit.map(function (item) {
        return '<li>' + escapeHTML(item) + '</li>';
      }).join('');
    } else {
      if (kitSection) kitSection.style.display = 'none';
      if (kitEl) kitEl.innerHTML = '';
    }

    // ── Fiches QUINCAILLERIE : le split 3D/specs est REMPLACÉ par le bloc
    // « Livraison sur ton chantier » (carte de l'île + adresse + créneau). Le
    // reste de la fiche (prix, achat, WhatsApp…) est inchangé.
    var isQuinc = (product.brand === 'Quincaillerie');
    var splitSection = document.querySelector('.pdp-section--split');
    var delivSection = document.getElementById('pdpDelivery');
    // Testeur (allowlist) : bloc livraison AUSSI sur les machines (chaîne de
    // test complète) — le split 3D/specs reste alors visible.
    var showDeliv = isQuinc || lvIsTester();
    if (splitSection) splitSection.hidden = isQuinc;
    if (delivSection) {
      delivSection.hidden = !showDeliv;
      if (showDeliv) initPdpDelivery(product);
    }

    // Scroll animation for landing sections — APRÈS l'injection de features/specs/kit
    // pour que les nouveaux <tr>/<li>/cartes soient bien captés et révélés (sinon
    // ils restent à opacity:0). C'était la cause du texte de caractéristiques invisible.
    initPdpScrollAnimations();

    // Add to cart — stays on page, no redirect
    var pdpOut = isOutOfStock(product);
    setupPdpCoffret(activeProduct);   // option coffret TSTAK (machines éligibles)
    setupPdpQty(isQuinc);             // sélecteur de quantité (quincaillerie)
    if (dom.pdpQuote) {
      dom.pdpQuote.disabled = pdpOut;
      if (pdpOut) dom.pdpQuote.setAttribute('aria-disabled', 'true');
      else dom.pdpQuote.removeAttribute('aria-disabled');
      dom.pdpQuote.onclick = function () {
        if (isOutOfStock(product)) {
          toast('Produit en rupture de stock', 'error');
          return;
        }
        addToCart(Object.assign({}, activeProduct, { coffret: _pdpCoffret, addQty: _pdpQty }));
      };
    }

    // Buy now — toujours visible, ouvre la modale (Carte/Crypto)
    var pdpBuy = document.getElementById('pdpBuy');
    if (pdpBuy) {
      pdpBuy.hidden = false;
      pdpBuy.disabled = pdpOut;
      if (pdpOut) pdpBuy.setAttribute('aria-disabled', 'true');
      else pdpBuy.removeAttribute('aria-disabled');
      pdpBuy.onclick = function () {
        if (isOutOfStock(product)) {
          toast('Produit en rupture de stock', 'error');
          return;
        }
        // Libellé aligné sur addToCart : une ligne « avec coffret » porte son
        // suffixe partout (modale, email, facture) — le prix, lui, vient du flag.
        openPayModal([{ key: activeProduct.id || activeProduct.slug, title: activeProduct.title + (_pdpCoffret ? ' + coffret TSTAK' : ''), price: activeProduct.price, qty: _pdpQty, coffret: _pdpCoffret, paymentLink: activeProduct.paymentLink || '' }]);
      };
    }

    // WhatsApp link — territory-aware message
    if (dom.pdpWa) {
      dom.pdpWa.href = waLink(waProductMessage(activeProduct, _currentTerritory));
      dom.pdpWa.target = '_blank';
      // onclick (et non addEventListener) : remplace le handler à chaque
      // renderPDP au lieu d'en empiler un par produit visité (sinon N events
      // whatsapp_click au premier clic, avec N id différents).
      dom.pdpWa.onclick = function () {
        if (typeof track === 'function') track('whatsapp_click', { source: 'pdp', id: product.id });
      };
    }

    // Share button (Web Share API with clipboard fallback)
    if (dom.pdpShare) {
      dom.pdpShare.onclick = function () {
        var url = location.href;
        if (typeof track === 'function') {
          track('share', { id: product.id, name: product.title, method: navigator.share ? 'web_share' : 'clipboard' });
        }
        if (navigator.share) {
          navigator.share({ title: product.title, text: product.desc || '', url: url });
        } else {
          navigator.clipboard.writeText(url).then(function () {
            toast('Lien copié', 'success');
          });
        }
      };
    }

    // ── Reviews system ──
    setupReviews(product.id);

    // Related products (same brand or category)
    if (dom.pdpRelated) {
      var related = products.filter(function (rp) {
        return rp.id !== product.id && (rp.brand === product.brand || rp.category === product.category);
      }).slice(0, 4);
      if (related.length > 0) {
        dom.pdpRelated.innerHTML = '<h3>Produits similaires</h3><div class="related-grid">'
          + related.map(function (rp) {
            var rpPrice = calcPrice(rp, _currentTerritory);
            return '<a class="product-card product-card--sm" href="#/produit/' + escapeHTML(rp.slug || rp.id) + '">'
              + '<img src="' + escapeHTML(rp.img || 'images/placeholder.svg') + '" alt="' + escapeHTML(rp.title) + '" loading="lazy" decoding="async">'
              + '<span>' + escapeHTML(rp.title) + '</span>'
              + '<span class="product-card__price">' + formatPrice(rpPrice.ttc) + ' <small>TTC</small></span>'
              + '</a>';
          }).join('') + '</div>';
      } else {
        dom.pdpRelated.innerHTML = '';
      }
    }
  }

  // ── Reviews system (localStorage-based) ────────────────────

  var REVIEWS_KEY = 'pt_reviews';

  function getReviews(productId) {
    try {
      var all = JSON.parse(localStorage.getItem(REVIEWS_KEY) || '{}');
      return all[productId] || [];
    } catch (e) { return []; }
  }

  function saveReview(productId, review) {
    try {
      var all = JSON.parse(localStorage.getItem(REVIEWS_KEY) || '{}');
      if (!all[productId]) all[productId] = [];
      all[productId].unshift(review);
      localStorage.setItem(REVIEWS_KEY, JSON.stringify(all));
    } catch (e) { /* silent */ }
  }

  function renderStars(rating) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<span style="color:' + (i <= rating ? '#FFD700' : 'rgba(255,255,255,.12)') + '">&#9733;</span>';
    }
    return html;
  }

  function formatReviewDate(ts) {
    var d = new Date(ts);
    var months = ['jan', 'fev', 'mar', 'avr', 'mai', 'jun', 'jul', 'aou', 'sep', 'oct', 'nov', 'dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function setupReviews(productId) {
    var listEl = document.getElementById('pdpReviewsList');
    var avgEl = document.getElementById('pdpAvgRating');
    var starsEl = document.getElementById('pdpAvgStars');
    var countEl = document.getElementById('pdpReviewCount');
    var form = document.getElementById('pdpReviewForm');
    var starsSelect = document.getElementById('pdpStarsSelect');
    if (!listEl || !form) return;

    var selectedRating = 0;

    // Star selection — event delegation on container (no per-button listeners)
    if (starsSelect && !starsSelect._ptDelegated) {
      starsSelect._ptDelegated = true;
      starsSelect.addEventListener('click', function (e) {
        var btn = e.target.closest('.pdp-reviews__star-btn');
        if (!btn) return;
        var allBtns = starsSelect.querySelectorAll('.pdp-reviews__star-btn');
        var idx = Array.prototype.indexOf.call(allBtns, btn);
        if (idx < 0) return;
        selectedRating = idx + 1;
        for (var j = 0; j < allBtns.length; j++) {
          allBtns[j].classList.toggle('active', j <= idx);
        }
      });
      starsSelect.addEventListener('mouseenter', function (e) {
        var btn = e.target.closest('.pdp-reviews__star-btn');
        if (!btn) return;
        var allBtns = starsSelect.querySelectorAll('.pdp-reviews__star-btn');
        var idx = Array.prototype.indexOf.call(allBtns, btn);
        if (idx < 0) return;
        for (var j = 0; j < allBtns.length; j++) {
          allBtns[j].style.color = j <= idx ? '#FFD700' : '';
        }
      }, true);
      starsSelect.addEventListener('mouseleave', function (e) {
        var btn = e.target.closest('.pdp-reviews__star-btn');
        if (!btn) return;
        var allBtns = starsSelect.querySelectorAll('.pdp-reviews__star-btn');
        for (var j = 0; j < allBtns.length; j++) {
          allBtns[j].style.color = '';
        }
      }, true);
    }

    function renderReviewsList() {
      var reviews = getReviews(productId);

      // Summary
      if (reviews.length === 0) {
        if (avgEl) avgEl.textContent = '—';
        if (starsEl) starsEl.innerHTML = renderStars(0);
        if (countEl) countEl.textContent = 'Aucun avis — soyez le premier !';
        listEl.innerHTML = '<div class="pdp-reviews__empty">Pas encore d\'avis pour ce produit.</div>';
        return;
      }

      var total = 0;
      for (var i = 0; i < reviews.length; i++) total += reviews[i].rating;
      var avg = total / reviews.length;

      if (avgEl) avgEl.textContent = avg.toFixed(1);
      if (starsEl) starsEl.innerHTML = renderStars(Math.round(avg));
      if (countEl) countEl.textContent = reviews.length + ' avis';

      var html = '';
      for (var ri = 0; ri < reviews.length; ri++) {
        var r = reviews[ri];
        var initial = (r.name || '?').charAt(0).toUpperCase();
        html += '<div class="pdp-review-card">'
          + '<div class="pdp-review-card__header">'
          + '<div class="pdp-review-card__author">'
          + '<div class="pdp-review-card__avatar">' + escapeHTML(initial) + '</div>'
          + '<div>'
          + '<div class="pdp-review-card__name">' + escapeHTML(r.name) + '</div>'
          + '<div class="pdp-review-card__date">' + formatReviewDate(r.date) + '</div>'
          + '</div>'
          + '</div>'
          + '<div class="pdp-review-card__stars">' + renderStars(r.rating) + '</div>'
          + '</div>'
          + '<p class="pdp-review-card__text">' + escapeHTML(r.text) + '</p>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }

    // Form submit
    form.onsubmit = function (e) {
      e.preventDefault();
      var nameInput = document.getElementById('pdpReviewName');
      var textInput = document.getElementById('pdpReviewText');
      var name = (nameInput.value || '').trim();
      var text = (textInput.value || '').trim();

      if (!name) { toast('Entrez votre prénom', 'error'); nameInput.focus(); return; }
      if (selectedRating === 0) { toast('Sélectionnez une note', 'error'); return; }
      if (!text) { toast('Écrivez votre avis', 'error'); textInput.focus(); return; }

      saveReview(productId, {
        name: name,
        rating: selectedRating,
        text: text,
        date: Date.now()
      });

      // Reset form
      nameInput.value = '';
      textInput.value = '';
      selectedRating = 0;
      if (starsSelect) {
        var resetBtns = starsSelect.querySelectorAll('.pdp-reviews__star-btn');
        for (var j = 0; j < resetBtns.length; j++) resetBtns[j].classList.remove('active');
      }

      toast('Merci pour votre avis !', 'success');
      renderReviewsList();
    };

    renderReviewsList();
  }

  // ── Home page reviews (global, not per-product) ────────────

  var HOME_REVIEWS_KEY = 'pt_home_reviews';

  function getHomeReviews() {
    try { return JSON.parse(localStorage.getItem(HOME_REVIEWS_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function saveHomeReview(review) {
    var reviews = getHomeReviews();
    reviews.unshift(review);
    try {
      localStorage.setItem(HOME_REVIEWS_KEY, JSON.stringify(reviews));
    } catch (e) { /* Safari privé / quota plein */ }
  }

  // ── Plans / Services interactif ────────────────────────────

  // ── Plans — all state & functions at module scope ──────────

  var _plansEvtBound = false;
  var _pCtx, _pW, _pH, _pPAD, _pgW, _pgH;
  var _pReady = false;
  var _pSaving = 0;
  var _pHover = -1;
  var _pMaxY = 6000;
  var _pStoreM  = [0.9, 0.7, 1.0, 1.1, 1.3, 0.8, 0.6, 0.7, 1.2, 1.1, 1.0, 1.6];
  var _pPirateM = [0.8, 0.6, 1.1, 1.0, 1.4, 0.7, 0.5, 0.8, 1.3, 1.0, 0.9, 1.5];
  var _pMonths = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

  // PLAN_INFO dérivé d'ABO_DATA (source unique) — construit paresseusement
  // car ABO_DATA est déclaré plus bas dans l'IIFE (var hoisté, affecté après).
  var _planInfoCache = null;
  function getPlanInfo(plan) {
    if (!_planInfoCache) {
      _planInfoCache = { basique: aboToPlanInfo('basique'), pro: aboToPlanInfo('pro'), gold: aboToPlanInfo('gold'), black: aboToPlanInfo('black') };
    }
    return _planInfoCache[plan] || {};
  }

  function _pInitCanvas() {
    var canvas = document.getElementById('plansCanvas');
    var wrap = document.getElementById('plansChartGraph');
    if (!canvas || !wrap) return;
    var dpr = window.devicePixelRatio || 1;
    var rect = wrap.getBoundingClientRect();
    if (rect.width < 10) return;
    _pW = Math.round(rect.width);
    _pH = Math.round(rect.height);
    canvas.width  = _pW * dpr;
    canvas.height = _pH * dpr;
    _pCtx = canvas.getContext('2d');
    _pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _pPAD = { top: 10, right: 32, bottom: 16, left: 22 };
    _pgW = _pW - _pPAD.left - _pPAD.right;
    _pgH = _pH - _pPAD.top - _pPAD.bottom;
    _pReady = true;
  }

  // ── Chart drawing helpers (module scope) ──

  function _pBuildCumul(monthly, multi) {
    var pts = []; var sum = 0;
    for (var m = 0; m < 12; m++) {
      sum += monthly * multi[m];
      pts.push({ x: _pPAD.left + (m / 11) * _pgW, y: _pPAD.top + _pgH - (sum / _pMaxY) * _pgH });
    }
    return pts;
  }

  function _pBezier(pts) {
    _pCtx.moveTo(pts[0].x, pts[0].y);
    for (var i = 0; i < pts.length - 1; i++) {
      var cpx = (pts[i].x + pts[i + 1].x) / 2;
      _pCtx.bezierCurveTo(cpx, pts[i].y, cpx, pts[i + 1].y, pts[i + 1].x, pts[i + 1].y);
    }
  }

  function _pLine(pts, color, w, glow) {
    if (glow) { _pCtx.shadowColor = glow; _pCtx.shadowBlur = 4; }
    _pCtx.beginPath(); _pBezier(pts);
    _pCtx.strokeStyle = color; _pCtx.lineWidth = w;
    _pCtx.lineJoin = 'round'; _pCtx.lineCap = 'round'; _pCtx.stroke();
    _pCtx.shadowBlur = 0;
  }

  function _pFill(pts, cTop, cBot) {
    var g = _pCtx.createLinearGradient(0, _pPAD.top, 0, _pPAD.top + _pgH);
    g.addColorStop(0, cTop); g.addColorStop(1, cBot || 'rgba(0,0,0,0)');
    _pCtx.beginPath(); _pCtx.moveTo(pts[0].x, _pPAD.top + _pgH);
    _pBezier(pts); _pCtx.lineTo(pts[pts.length - 1].x, _pPAD.top + _pgH);
    _pCtx.closePath(); _pCtx.fillStyle = g; _pCtx.fill();
  }

  function _pCumulVals(monthly, multi) {
    var v = []; var s = 0;
    for (var m = 0; m < 12; m++) { s += monthly * multi[m]; v.push(Math.round(s)); }
    return v;
  }

  function _pDraw(saving, hovIdx) {
    if (!_pReady) _pInitCanvas();
    if (!_pReady) return;
    _pSaving = saving;
    var c = _pCtx, W = _pW, H = _pH, PAD = _pPAD, gW = _pgW, gH = _pgH;
    c.clearRect(0, 0, W, H);
    var fnt = '-apple-system,system-ui,sans-serif';
    var baseY = PAD.top + gH;

    [2000, 4000, 6000].forEach(function (v) {
      var y = PAD.top + gH - (v / _pMaxY) * gH;
      c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = .5; c.setLineDash([]);
      c.beginPath(); c.moveTo(PAD.left, y); c.lineTo(W - PAD.right, y); c.stroke();
      c.font = '500 6.5px ' + fnt; c.fillStyle = 'rgba(255,255,255,.18)';
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText((v / 1000) + 'k', PAD.left - 4, y);
    });

    c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = .5;
    c.beginPath(); c.moveTo(PAD.left, baseY); c.lineTo(W - PAD.right, baseY); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'top'; c.font = '500 5.5px ' + fnt;
    ['J','F','M','A','M','J','J','A','S','O','N','D'].forEach(function (l, i) {
      var isH = (hovIdx === i && saving > 0);
      c.fillStyle = isH ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.14)';
      if (isH) c.font = '700 6px ' + fnt;
      c.fillText(l, PAD.left + (i / 11) * gW, baseY + 3);
      if (isH) c.font = '500 5.5px ' + fnt;
    });

    if (saving === 0) {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(255,255,255,.07)'; c.font = '500 7px ' + fnt;
      c.fillText('Selectionnez un service', W / 2, H / 2 - 2);
      return;
    }

    var storePts = _pBuildCumul(500, _pStoreM);
    var pirateMonthly = (_pMaxY - saving) / 12;
    var piratePts = _pBuildCumul(pirateMonthly, _pPirateM);

    c.beginPath(); _pBezier(storePts);
    c.lineTo(piratePts[piratePts.length - 1].x, piratePts[piratePts.length - 1].y);
    for (var j = piratePts.length - 1; j > 0; j--) {
      var cpx = (piratePts[j].x + piratePts[j - 1].x) / 2;
      c.bezierCurveTo(cpx, piratePts[j].y, cpx, piratePts[j - 1].y, piratePts[j - 1].x, piratePts[j - 1].y);
    }
    c.closePath();
    var dg = c.createLinearGradient(0, PAD.top, 0, baseY);
    dg.addColorStop(0, 'rgba(52,211,153,.05)'); dg.addColorStop(1, 'rgba(52,211,153,.01)');
    c.fillStyle = dg; c.fill();

    _pFill(storePts, 'rgba(239,68,68,.04)', 'rgba(239,68,68,0)');
    _pFill(piratePts, 'rgba(139,92,246,.08)', 'rgba(139,92,246,0)');
    _pLine(storePts, 'rgba(239,68,68,.3)', 1);
    _pLine(piratePts, '#8B5CF6', 1.2, 'rgba(139,92,246,.25)');

    var sl = storePts[11], pl = piratePts[11];
    c.beginPath(); c.arc(sl.x, sl.y, 1.5, 0, Math.PI * 2); c.fillStyle = 'rgba(239,68,68,.5)'; c.fill();
    c.shadowColor = 'rgba(139,92,246,.35)'; c.shadowBlur = 3;
    c.beginPath(); c.arc(pl.x, pl.y, 2, 0, Math.PI * 2); c.fillStyle = '#8B5CF6'; c.fill(); c.shadowBlur = 0;

    var stTotal = Math.round(storePts.reduce(function (a, _, i) { return a + 500 * _pStoreM[i]; }, 0));
    var piTotal = Math.round(_pMaxY - saving);
    c.font = '600 6px ' + fnt; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(239,68,68,.35)'; c.fillText(stTotal.toLocaleString('fr-FR') + '\u20ac', sl.x + 4, sl.y);
    c.fillStyle = 'rgba(139,92,246,.7)'; c.fillText(piTotal.toLocaleString('fr-FR') + '\u20ac', pl.x + 4, pl.y);

    // Cursor tooltip
    if (typeof hovIdx === 'number' && hovIdx >= 0 && hovIdx < 12) {
      var hx = storePts[hovIdx].x, sy = storePts[hovIdx].y, py = piratePts[hovIdx].y;
      var sv = _pCumulVals(500, _pStoreM)[hovIdx];
      var pv = _pCumulVals(pirateMonthly, _pPirateM)[hovIdx];
      var diff = sv - pv;
      c.setLineDash([2, 2]); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = .5;
      c.beginPath(); c.moveTo(hx, PAD.top); c.lineTo(hx, baseY); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(hx, sy, 2.5, 0, Math.PI * 2); c.fillStyle = '#ef4444'; c.fill();
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = .5; c.stroke();
      c.shadowColor = 'rgba(139,92,246,.4)'; c.shadowBlur = 4;
      c.beginPath(); c.arc(hx, py, 3, 0, Math.PI * 2); c.fillStyle = '#8B5CF6'; c.fill();
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = .5; c.stroke(); c.shadowBlur = 0;
      var tipW = 58, tipH = 30, tipX = hx - tipW / 2, tipY = Math.min(sy, py) - tipH - 6;
      if (tipX < 2) tipX = 2; if (tipX + tipW > W - 2) tipX = W - tipW - 2; if (tipY < 2) tipY = 2;
      c.beginPath(); var r = 4;
      c.moveTo(tipX + r, tipY); c.lineTo(tipX + tipW - r, tipY);
      c.quadraticCurveTo(tipX + tipW, tipY, tipX + tipW, tipY + r);
      c.lineTo(tipX + tipW, tipY + tipH - r);
      c.quadraticCurveTo(tipX + tipW, tipY + tipH, tipX + tipW - r, tipY + tipH);
      c.lineTo(tipX + r, tipY + tipH);
      c.quadraticCurveTo(tipX, tipY + tipH, tipX, tipY + tipH - r);
      c.lineTo(tipX, tipY + r);
      c.quadraticCurveTo(tipX, tipY, tipX + r, tipY);
      c.closePath(); c.fillStyle = 'rgba(15,12,25,.88)'; c.fill();
      c.strokeStyle = 'rgba(139,92,246,.2)'; c.lineWidth = .5; c.stroke();
      var cx = tipX + tipW / 2; c.textAlign = 'center'; c.textBaseline = 'top';
      c.font = '700 5.5px ' + fnt; c.fillStyle = 'rgba(255,255,255,.5)';
      c.fillText(_pMonths[hovIdx], cx, tipY + 3);
      c.font = '600 5px ' + fnt;
      c.fillStyle = 'rgba(239,68,68,.6)'; c.fillText(sv.toLocaleString('fr-FR') + '\u20ac', cx, tipY + 11);
      c.fillStyle = '#8B5CF6'; c.fillText(pv.toLocaleString('fr-FR') + '\u20ac', cx, tipY + 17.5);
      c.fillStyle = '#34d399'; c.fillText('-' + diff.toLocaleString('fr-FR') + '\u20ac', cx, tipY + 24);
    }
  }

  // ── Orb click handler (module scope, uses event delegation) ──

  function _pHandleOrbClick(orb) {
    var amtEl = document.getElementById('plansAmount');
    var lblEl = document.getElementById('plansLabel');
    var dtlEl = document.getElementById('planDetail');
    var allOrbs = document.querySelectorAll('.plan-orb');
    var wasActive = orb.classList.contains('is-active');
    allOrbs.forEach(function (o) { o.classList.remove('is-active'); });

    if (wasActive) {
      _pDraw(0);
      if (amtEl) amtEl.textContent = '';
      if (lblEl) lblEl.textContent = 'Comparaison annuelle';
      if (dtlEl) { dtlEl.className = 'plan-detail'; dtlEl.innerHTML = ''; }
      return;
    }

    orb.classList.add('is-active');
    var saving = parseInt(orb.dataset.saving) || 0;
    var price = orb.dataset.price || '0';
    var plan = orb.dataset.plan || '';
    var info = getPlanInfo(plan);

    _pDraw(saving);

    if (amtEl) amtEl.textContent = '-' + saving.toLocaleString('fr-FR') + ' \u20ac/an';
    if (lblEl) lblEl.textContent = (info.name || '') + ' \u2022 ' + price + '\u20ac/mois';
    if (dtlEl && info.desc) {
      var featHtml = '';
      if (info.features && info.features.length) {
        featHtml = '<div class="plan-detail__features">';
        info.features.forEach(function(f) {
          featHtml += '<span class="plan-detail__feat"><span class="plan-detail__feat-icon">' + escapeHTML(f.icon) + '</span>' + escapeHTML(f.text) + '</span>';
        });
        featHtml += '</div>';
      }
      dtlEl.className = 'plan-detail is-open plan-detail--' + escapeHTML(info.color || plan);
      dtlEl.innerHTML = '<div class="plan-detail__inner">'
        + '<div class="plan-detail__name">' + escapeHTML(info.name || '') + '</div>'
        + '<div class="plan-detail__desc">' + escapeHTML(info.desc) + '</div>'
        + featHtml
        + '<span class="plan-detail__saving">' + price + ' \u20ac/mois \u2192 ' + saving.toLocaleString('fr-FR') + ' \u20ac economises/an</span>'
        + '<a href="#/abonnement/' + encodeURIComponent(plan) + '" class="plan-detail__cta plan-detail__cta--' + escapeHTML(info.color || plan) + '">Choisir ' + escapeHTML(info.name || '') + '</a>'
        + '</div>';
    }
  }

  // ── Cursor helpers (module scope) ──

  function _pGetMonth(clientX) {
    var canvas = document.getElementById('plansCanvas');
    if (!canvas) return -1;
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 1) return -1;
    var scale = _pW / rect.width;
    var cx = (clientX - rect.left) * scale;
    return Math.max(0, Math.min(11, Math.round(((cx - _pPAD.left) / _pgW) * 11)));
  }

  function _pOnHover(clientX) {
    if (_pSaving <= 0) return;
    var m = _pGetMonth(clientX);
    if (m !== _pHover) { _pHover = m; _pDraw(_pSaving, _pHover); }
  }

  function _pOnLeave() {
    if (_pHover >= 0) { _pHover = -1; _pDraw(_pSaving); }
  }

  // ── setupPlans: just resets UI + reinits canvas; events via delegation ──

  function setupPlans() {
    // Reset UI
    _pReady = false;
    _pSaving = 0;
    _pHover = -1;
    var amtEl = document.getElementById('plansAmount');
    var lblEl = document.getElementById('plansLabel');
    var dtlEl = document.getElementById('planDetail');
    if (amtEl) amtEl.textContent = '';
    if (lblEl) lblEl.textContent = 'Comparaison annuelle';
    if (dtlEl) { dtlEl.className = 'plan-detail'; dtlEl.innerHTML = ''; }
    document.querySelectorAll('.plan-orb').forEach(function (o) { o.classList.remove('is-active'); });

    // Re-init canvas after layout
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        _pInitCanvas();
        _pDraw(0);
      });
    });

    // Bind events only once via delegation
    if (_plansEvtBound) return;
    _plansEvtBound = true;

    var orbsContainer = document.getElementById('planOrbs');
    if (orbsContainer) {
      orbsContainer.addEventListener('click', function (e) {
        var orb = e.target.closest('.plan-orb');
        if (orb) _pHandleOrbClick(orb);
      });
    }

    var canvas = document.getElementById('plansCanvas');
    if (canvas) {
      canvas.addEventListener('mousemove', function (e) { _pOnHover(e.clientX); });
      canvas.addEventListener('mouseleave', _pOnLeave);
      canvas.addEventListener('touchstart', function (e) {
        if (_pSaving <= 0) return;
        e.preventDefault(); _pOnHover(e.touches[0].clientX);
      }, { passive: false });
      canvas.addEventListener('touchmove', function (e) {
        if (_pSaving <= 0) return;
        e.preventDefault(); _pOnHover(e.touches[0].clientX);
      }, { passive: false });
      canvas.addEventListener('touchend', function () { setTimeout(_pOnLeave, 1500); });
    }
  }

  function setupHomeReviews() {
    var listEl = document.getElementById('homeReviewsList');
    var form = document.getElementById('homeReviewForm');
    var starsSelect = document.getElementById('homeStarsSelect');
    if (!listEl || !form) return;

    var selectedRating = 0;

    // Star selection — event delegation on container (no per-button listeners)
    if (starsSelect && !starsSelect._ptDelegated) {
      starsSelect._ptDelegated = true;
      starsSelect.addEventListener('click', function (e) {
        var btn = e.target.closest('.pdp-reviews__star-btn');
        if (!btn) return;
        var allBtns = starsSelect.querySelectorAll('.pdp-reviews__star-btn');
        var idx = Array.prototype.indexOf.call(allBtns, btn);
        if (idx < 0) return;
        selectedRating = idx + 1;
        for (var j = 0; j < allBtns.length; j++) {
          allBtns[j].classList.toggle('active', j <= idx);
        }
      });
    }

    function renderList() {
      var reviews = getHomeReviews();
      if (reviews.length === 0) {
        listEl.innerHTML = '<div class="home-reviews__empty">Aucun avis pour le moment — soyez le premier !</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < reviews.length; i++) {
        var r = reviews[i];
        var initial = (r.name || '?').charAt(0).toUpperCase();
        html += '<div class="pdp-review-card">'
          + '<div class="pdp-review-card__header">'
          + '<div class="pdp-review-card__author">'
          + '<div class="pdp-review-card__avatar">' + escapeHTML(initial) + '</div>'
          + '<div>'
          + '<div class="pdp-review-card__name">' + escapeHTML(r.name) + '</div>'
          + '<div class="pdp-review-card__date">' + formatReviewDate(r.date) + '</div>'
          + '</div>'
          + '</div>'
          + '<div class="pdp-review-card__stars">' + renderStars(r.rating) + '</div>'
          + '</div>'
          + '<p class="pdp-review-card__text">' + escapeHTML(r.text) + '</p>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }

    form.onsubmit = function (e) {
      e.preventDefault();
      var nameInput = document.getElementById('homeReviewName');
      var textInput = document.getElementById('homeReviewText');
      var name = (nameInput.value || '').trim();
      var text = (textInput.value || '').trim();

      if (!name) { toast('Entrez votre prénom', 'error'); nameInput.focus(); return; }
      if (selectedRating === 0) { toast('Sélectionnez une note', 'error'); return; }
      if (!text) { toast('Écrivez votre avis', 'error'); textInput.focus(); return; }

      saveHomeReview({ name: name, rating: selectedRating, text: text, date: Date.now() });

      nameInput.value = '';
      textInput.value = '';
      selectedRating = 0;
      if (starsSelect) {
        var resetBtns = starsSelect.querySelectorAll('.pdp-reviews__star-btn');
        for (var j = 0; j < resetBtns.length; j++) resetBtns[j].classList.remove('active');
      }

      toast('Merci pour votre avis !', 'success');
      renderList();
    };

    renderList();
  }

  // ── 3D Carousel on homepage ──

  var _3dCarouselBound = false;
  var _3dIdx = 0;
  var _3dModels = [];
  var _carouselIO = null;      // repli : charge le 3D quand on scrolle vers lui
  var _carousel3dKicked = false;   // 1er outil du carrousel déjà lancé ?
  var _carousel3dDeferred = false; // trigger window.load déjà armé ?

  // Lance le chargement du 1er outil du carrousel (script model-viewer + GLB).
  // Idempotent. Appelé soit après le contenu critique (window.load), soit au
  // scroll vers le carrousel — le premier qui arrive gagne.
  function kickCarousel3D() {
    if (_carousel3dKicked) return;
    _carousel3dKicked = true;
    var v = document.getElementById('carousel3dViewer');
    ensureModelViewer().catch(function () {});
    if (v) v.setAttribute('loading', 'eager');
    if (_carouselIO && v) { try { _carouselIO.unobserve(v); } catch (_) {} }
  }

  function _3dShow(idx) {
    var viewer = document.getElementById('carousel3dViewer');
    var brandEl = document.getElementById('carousel3dBrand');
    var nameEl = document.getElementById('carousel3dName');
    var counterEl = document.getElementById('carousel3dCounter');
    var dotsEl = document.getElementById('carousel3dDots');
    if (!viewer || _3dModels.length === 0) return;

    if (idx < 0) idx = _3dModels.length - 1;
    if (idx >= _3dModels.length) idx = 0;
    _3dIdx = idx;
    var m = _3dModels[idx];
    viewer.setAttribute('src', m.src);
    if (brandEl) brandEl.textContent = m.brand;
    if (nameEl) nameEl.textContent = m.name;
    if (counterEl) counterEl.textContent = (idx + 1) + ' / ' + _3dModels.length;
    if (dotsEl) {
      var dots = dotsEl.querySelectorAll('.tools-3d-dot');
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('active', i === idx);
      }
    }
  }

  function setup3DCarousel() {
    var viewer = document.getElementById('carousel3dViewer');
    var dotsEl = document.getElementById('carousel3dDots');
    if (!viewer || !dotsEl) return;

    // Build model list from products that have a "model" field.
    // CAP À 10 (décision produit 21/07) : vitrine, pas catalogue exhaustif.
    // PRODUITS SEULS UNIQUEMENT (décision produit 21/07) : les packs composés
    // (*-pack.glb) sont visuellement moins bons que les scans d'outils seuls —
    // la vitrine ne montre que le meilleur.
    var CAROUSEL_MAX = 10;
    if (_3dModels.length === 0 && products.length > 0) {
      var seen = {};
      for (var i = 0; i < products.length && _3dModels.length < CAROUSEL_MAX; i++) {
        var p = products[i];
        if (p.model && !seen[p.model] && !/-pack\.glb$/i.test(p.model)) {
          seen[p.model] = true;
          _3dModels.push({ src: p.model, brand: p.brand, name: p.name, slug: p.slug });
        }
      }
    }

    if (_3dModels.length === 0) return;

    // Build dots
    dotsEl.innerHTML = '';
    for (var d = 0; d < _3dModels.length; d++) {
      var dot = document.createElement('button');
      dot.className = 'tools-3d-dot' + (d === _3dIdx ? ' active' : '');
      dot.setAttribute('aria-label', 'Modele ' + (d + 1));
      dot.dataset.idx = d;
      dotsEl.appendChild(dot);
    }

    // Show current model
    _3dShow(_3dIdx);

    // ORDRE DE PRIORITÉ VOULU (demande user) : contenu critique (hero + marques)
    // → PUIS le 1er outil du carrousel 3D → PUIS les cartes produits (plus bas,
    // lazy → chargées au scroll, donc après). Le carrousel ne charge RIEN au boot
    // (sinon ses ~3 Mo saturent le tuyau et affament les images critiques :
    // bulles à 14 s, cartes à 30 s constatées) — mais dès que le critique est
    // peint, on lance le modèle pour qu'il soit prêt avant que l'utilisateur
    // n'arrive au carrousel.
    // A) Repli au scroll : si l'utilisateur descend avant window.load. Marge
    //    200px < distance mini du carrousel sous le fold (350px mesuré) → ne se
    //    déclenche jamais à l'ouverture. Pas de poster (auto-reveal model-viewer).
    if ('IntersectionObserver' in window) {
      if (!_carouselIO) {
        _carouselIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { if (en.isIntersecting) kickCarousel3D(); });
        }, { rootMargin: '200px 0px 200px 0px' });
      }
      _carouselIO.observe(viewer);
    }
    // B) Priorité voulue (user) : le 1er outil du carrousel AVANT les cartes.
    //    On lance le carrousel juste après ce 1er rendu de l'accueil (les images
    //    de marques ont déjà leur requête en file) — PAS à window.load, qui sur
    //    connexion lente attend aussi les cartes (Chromium élargit le seuil lazy)
    //    et ferait donc charger le carrousel APRÈS elles. 350ms : laisse les
    //    marques prendre la bande d'abord, puis le carrousel part avant les cartes.
    if (!_carousel3dDeferred) {
      _carousel3dDeferred = true;
      setTimeout(kickCarousel3D, 350);
    }

    if (!_3dCarouselBound) {
      _3dCarouselBound = true;

      // Arrow + dot clicks via delegation
      var banner = document.getElementById('tools-banner');
      if (banner) {
        banner.addEventListener('click', function (e) {
          if (e.target.closest('.tools-3d-prev')) {
            _3dShow(_3dIdx - 1);
          } else if (e.target.closest('.tools-3d-next')) {
            _3dShow(_3dIdx + 1);
          } else {
            var dot = e.target.closest('.tools-3d-dot');
            if (dot && dot.dataset.idx !== undefined) {
              _3dShow(parseInt(dot.dataset.idx, 10));
            }
          }
        });
      }

      // Swipe support on touch devices
      var stage = document.querySelector('.tools-3d-stage');
      if (stage) {
        var startX = 0, startY = 0, tracking = false;
        stage.addEventListener('touchstart', function (e) {
          if (e.touches.length === 1) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            tracking = true;
          }
        }, { passive: true });
        stage.addEventListener('touchend', function (e) {
          if (!tracking) return;
          tracking = false;
          var dx = e.changedTouches[0].clientX - startX;
          var dy = e.changedTouches[0].clientY - startY;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) _3dShow(_3dIdx + 1);
            else _3dShow(_3dIdx - 1);
          }
        }, { passive: true });
      }

      // Keyboard navigation when carousel is visible
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          var v = document.getElementById('carousel3dViewer');
          if (!v) return;
          var rect = v.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            _3dShow(_3dIdx + (e.key === 'ArrowLeft' ? -1 : 1));
          }
        }
      });
    } // end _3dCarouselBound guard
  }

  // ── PDP scroll animations (Apple-style immersive — lerp-based) ──

  var pdpObserver = null;
  var pdpScrollHandler = null;
  var pdpRAF = null;
  var pdpResizeHandler = null;

  // Math helpers
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
  // Lerp: smoothly interpolate current → target each frame
  function lerp(current, target, speed) { return current + (target - current) * speed; }

  function initPdpScrollAnimations() {
    // ── Cleanup ──
    if (pdpObserver) { pdpObserver.disconnect(); pdpObserver = null; }
    if (pdpRAF) { cancelAnimationFrame(pdpRAF); pdpRAF = null; }
    if (pdpResizeHandler) {
      window.removeEventListener('resize', pdpResizeHandler);
      pdpResizeHandler = null;
    }

    // Reset sections
    var sections = document.querySelectorAll('.pdp-section[data-animate]');
    sections.forEach(function (s) { s.classList.remove('visible'); s.style.cssText = ''; });

    // Scroll hint
    var scrollHint = document.getElementById('pdpScrollHint');
    if (scrollHint) scrollHint.classList.remove('hidden-hint');
    var hintHidden = false;
    function hideHint() {
      if (!hintHidden && scrollHint) {
        scrollHint.classList.add('hidden-hint');
        hintHidden = true;
      }
    }

    // ── Cache DOM refs ──
    var pdpHero = document.getElementById('pdpHero');
    var heroInfo = document.getElementById('pdpHeroInfo');
    var heroGradient = pdpHero ? pdpHero.querySelector('.pdp-hero__gradient') : null;
    var viewer3d = document.getElementById('pdp3d');
    var viewer2 = document.getElementById('pdp3dSecondary');
    var discoverHeading = document.getElementById('pdpDiscoverHeading');
    var discoverDesc = document.getElementById('pdpDesc');
    var splitViewer = document.querySelector('.pdp-split__viewer');
    var splitSpecs = document.querySelector('.pdp-split__specs');
    var mediaImg = document.querySelector('.pdp-landing__media');
    var ctaHeading = document.querySelector('.pdp-cta__heading');
    var featureCards = document.querySelectorAll('.pdp-feature');
    var kitItems = document.querySelectorAll('.pdp-kit li');
    var specRows = document.querySelectorAll('.pdp-specs-table tr');
    var ctaButtons = document.querySelectorAll('.pdp-section--cta .btn--lg');
    var dockEl = document.getElementById('dock');
    var waFloatEl = document.getElementById('waFloat');
    var winH = window.innerHeight;

    // Hide dock + WA float initially on PDP (hero visible)
    if (dockEl) dockEl.classList.add('dock--hidden');
    if (waFloatEl) waFloatEl.classList.add('wa-float--hidden');

    pdpResizeHandler = function () { winH = window.innerHeight; };
    window.addEventListener('resize', pdpResizeHandler, { passive: true });

    // ── Smooth state: current lerped values ──
    var LERP_SPEED = 0.08; // lower = smoother/slower (Apple feel)
    var state = {
      heroScale: 1, heroTY: 0, heroOp: 1, heroBlur: 0,
      infoTY: 0, infoOp: 1, infoScale: 1,
      discHeadScale: 0.6, discHeadTY: 40, discHeadOp: 0, discHeadBlur: 12,
      discDescTY: 60, discDescOp: 0, discDescBlur: 8,
      splitVX: -80, splitVScale: 0.85, splitVOp: 0,
      splitSX: 80, splitSOp: 0,
      mediaScale: 0.8, mediaTY: 50, mediaOp: 0, mediaBlur: 6,
      ctaScale: 0.5, ctaTY: 60, ctaOp: 0, ctaBlur: 10,
      camOrbit: 25, camPitch: 72,
      cam2Orbit: 120
    };

    // Per-element reveal progress (for features, kit, specs, buttons)
    var featureProgress = []; for (var fi = 0; fi < featureCards.length; fi++) featureProgress.push(0);
    var kitProgress = []; for (var ki = 0; ki < kitItems.length; ki++) kitProgress.push(0);
    var specProgress = []; for (var si = 0; si < specRows.length; si++) specProgress.push(0);
    var btnProgress = []; for (var bi = 0; bi < ctaButtons.length; bi++) btnProgress.push(0);

    // Get element's scroll progress (0 = not visible, 1 = fully in view)
    function getProgress(el, offset) {
      if (!el) return -1;
      var rect = el.getBoundingClientRect();
      var start = rect.top - winH + (offset || 0);
      var end = rect.bottom;
      var range = end - start;
      if (range <= 0) return 0;
      return clamp(-start / range, 0, 1);
    }

    // Apply style only when value changed (perf)
    function applyTransform(el, transform, opacity, filter) {
      if (!el) return;
      el.style.transform = transform;
      el.style.opacity = String(Math.max(0, opacity));
      if (filter !== undefined) el.style.filter = filter;
    }

    // ── Main animation loop (runs every frame, lerps toward targets) ──
    var running = true;
    var lastCamOrbit = -1;
    var lastCam2Orbit = -1;

    function tick() {
      if (!running) return;
      pdpRAF = requestAnimationFrame(tick);

      var scrollY = window.scrollY || window.pageYOffset;
      if (scrollY > 50) hideHint();

      var L = LERP_SPEED;

      // ═══ 1. HERO — parallax multi-couche ultra immersif ═══
      if (pdpHero && heroLerpReady) {
        var heroH = pdpHero.offsetHeight || winH;
        var hp = clamp(scrollY / heroH, 0, 1);
        // Deux easings : rapide pour le début, lent pour la fin
        var hpE = easeOut(hp);
        var hpFast = easeOut(clamp(hp * 1.5, 0, 1)); // le titre part plus vite

        // ── 3D model : monte doucement + léger zoom + fade subtil ──
        var tScale = 1 + hpE * 0.18;
        var tModelTY = hpE * -35;             // monte un peu
        var tModelOp = 1 - hpE * 0.4;
        var tModelBlur = hpE * 3;             // léger blur en sortie

        // ── Titre : vitesse 1.5x → part plus vite que le modèle ──
        var tInfoTY = hpFast * -120;          // monte plus vite et plus loin
        var tInfoOp = 1 - hpFast * 1.5;
        var tInfoScale = 1 - hpFast * 0.2;

        // Lerp
        state.heroScale = lerp(state.heroScale, tScale, L);
        state.heroTY = lerp(state.heroTY, tModelTY, L);
        state.heroOp = lerp(state.heroOp, tModelOp, L);
        state.heroBlur = lerp(state.heroBlur, tModelBlur, L);
        state.infoTY = lerp(state.infoTY, tInfoTY, L);
        state.infoOp = lerp(state.infoOp, tInfoOp, L);
        state.infoScale = lerp(state.infoScale, tInfoScale, L);

        applyTransform(viewer3d,
          'scale(' + state.heroScale.toFixed(4) + ') translateY(' + state.heroTY.toFixed(2) + 'px)',
          state.heroOp,
          'blur(' + state.heroBlur.toFixed(2) + 'px)'
        );
        applyTransform(heroInfo,
          'translateY(' + state.infoTY.toFixed(2) + 'px) scale(' + state.infoScale.toFixed(4) + ')',
          state.infoOp
        );
        // Gradient : s'estompe au scroll pour révéler le 3D
        if (heroGradient) heroGradient.style.opacity = String(clamp(1 - hpE * 0.7, 0, 1));

        // Camera : rotation + plongée pour un effet cinématique
        var tCamOrbit = 25 + hpE * 50;
        var tCamPitch = 72 + hpE * 15;
        state.camOrbit = lerp(state.camOrbit, tCamOrbit, L * 0.5);
        state.camPitch = lerp(state.camPitch, tCamPitch, L * 0.5);
        var roundedOrbit = Math.round(state.camOrbit * 10) / 10;
        if (viewer3d && Math.abs(roundedOrbit - lastCamOrbit) > 0.3) {
          viewer3d.setAttribute('camera-orbit', roundedOrbit + 'deg ' + (Math.round(state.camPitch * 10) / 10) + 'deg auto');
          lastCamOrbit = roundedOrbit;
        }
      }

      // ═══ DOCK + WA FLOAT: hide during hero, show after scrolling past ═══
      if (pdpHero) {
        var heroThreshold = (pdpHero.offsetHeight || winH) * 0.7;
        if (scrollY > heroThreshold) {
          if (dockEl) dockEl.classList.remove('dock--hidden');
          if (waFloatEl) waFloatEl.classList.remove('wa-float--hidden');
        } else {
          if (dockEl) dockEl.classList.add('dock--hidden');
          if (waFloatEl) waFloatEl.classList.add('wa-float--hidden');
        }
      }

      // ═══ 2. DISCOVER HEADING ═══
      if (discoverHeading) {
        var dp = getProgress(discoverHeading, 320);
        if (dp > 0) {
          var dpFast = clamp(dp * 2.2, 0, 1);
          var tds = 0.6 + easeOut(dpFast) * 0.4;
          var tdop = clamp(dp * 3, 0, 1);
          var tdblur = Math.max(0, (1 - dpFast) * 14);
          var tdty = (1 - easeOut(dpFast)) * 50;
          state.discHeadScale = lerp(state.discHeadScale, tds, L);
          state.discHeadTY = lerp(state.discHeadTY, tdty, L);
          state.discHeadOp = lerp(state.discHeadOp, tdop, L);
          state.discHeadBlur = lerp(state.discHeadBlur, tdblur, L);
          applyTransform(discoverHeading,
            'scale(' + state.discHeadScale.toFixed(4) + ') translateY(' + state.discHeadTY.toFixed(2) + 'px)',
            state.discHeadOp,
            'blur(' + state.discHeadBlur.toFixed(2) + 'px)'
          );
        }
      }

      // ═══ 3. DISCOVER DESC ═══
      if (discoverDesc) {
        var ddp = getProgress(discoverDesc, 200);
        if (ddp > 0) {
          var ddpFast = clamp(ddp * 2.5, 0, 1);
          var tddop = clamp(ddp * 3, 0, 1);
          var tddty = (1 - easeOut(ddpFast)) * 40;
          var tddblur = Math.max(0, (1 - ddpFast) * 6);
          state.discDescTY = lerp(state.discDescTY, tddty, L);
          state.discDescOp = lerp(state.discDescOp, tddop, L);
          state.discDescBlur = lerp(state.discDescBlur, tddblur, L);
          applyTransform(discoverDesc,
            'translateY(' + state.discDescTY.toFixed(2) + 'px)',
            state.discDescOp,
            'blur(' + state.discDescBlur.toFixed(2) + 'px)'
          );
        }
      }

      // ═══ 4. SPLIT — viewer & specs ═══
      if (splitViewer) {
        var svp = easeOut(clamp(getProgress(splitViewer, 80) * 1.4, 0, 1));
        state.splitVX = lerp(state.splitVX, (1 - svp) * -100, L);
        state.splitVScale = lerp(state.splitVScale, 0.85 + svp * 0.15, L);
        state.splitVOp = lerp(state.splitVOp, svp, L);
        applyTransform(splitViewer,
          'translateX(' + state.splitVX.toFixed(2) + 'px) scale(' + state.splitVScale.toFixed(4) + ')',
          state.splitVOp
        );
      }
      if (splitSpecs) {
        var ssp = easeOut(clamp((getProgress(splitSpecs, 80) - 0.05) * 1.4, 0, 1));
        state.splitSX = lerp(state.splitSX, (1 - ssp) * 100, L);
        state.splitSOp = lerp(state.splitSOp, ssp, L);
        applyTransform(splitSpecs,
          'translateX(' + state.splitSX.toFixed(2) + 'px)',
          state.splitSOp
        );
      }

      // Secondary 3D camera
      if (viewer2 && splitViewer) {
        var v2p = getProgress(splitViewer, 0);
        if (v2p > 0) {
          state.cam2Orbit = lerp(state.cam2Orbit, 120 + v2p * 70, L * 0.5);
          var r2 = Math.round(state.cam2Orbit * 10) / 10;
          if (Math.abs(r2 - lastCam2Orbit) > 0.3) {
            viewer2.setAttribute('camera-orbit', r2 + 'deg 55deg auto');
            lastCam2Orbit = r2;
          }
        }
      }

      // ═══ 5. MEDIA IMAGE ═══
      if (mediaImg) {
        var mp = easeOut(clamp(getProgress(mediaImg, 50) * 1.6, 0, 1));
        state.mediaScale = lerp(state.mediaScale, 0.8 + mp * 0.2, L);
        state.mediaTY = lerp(state.mediaTY, (1 - mp) * 60, L);
        state.mediaOp = lerp(state.mediaOp, mp, L);
        state.mediaBlur = lerp(state.mediaBlur, Math.max(0, (1 - mp) * 8), L);
        applyTransform(mediaImg,
          'scale(' + state.mediaScale.toFixed(4) + ') translateY(' + state.mediaTY.toFixed(2) + 'px)',
          state.mediaOp,
          'blur(' + state.mediaBlur.toFixed(2) + 'px)'
        );
      }

      // ═══ 6. CTA HEADING ═══
      if (ctaHeading) {
        var cp = easeOut(clamp(getProgress(ctaHeading, 80) * 1.5, 0, 1));
        state.ctaScale = lerp(state.ctaScale, 0.5 + cp * 0.5, L);
        state.ctaTY = lerp(state.ctaTY, (1 - cp) * 70, L);
        state.ctaOp = lerp(state.ctaOp, cp, L);
        state.ctaBlur = lerp(state.ctaBlur, Math.max(0, (1 - cp) * 12), L);
        applyTransform(ctaHeading,
          'scale(' + state.ctaScale.toFixed(4) + ') translateY(' + state.ctaTY.toFixed(2) + 'px)',
          state.ctaOp,
          'blur(' + state.ctaBlur.toFixed(2) + 'px)'
        );
      }

      // ═══ 7. FEATURES — scroll-driven stagger per card ═══
      if (featureCards.length > 0) {
        var featParent = featureCards[0].parentElement;
        var baseP = getProgress(featParent, 60);
        for (var i = 0; i < featureCards.length; i++) {
          var delay = i * 0.06;
          var raw = clamp((baseP - delay) * 2.5, 0, 1);
          var target = easeOut(raw);
          featureProgress[i] = lerp(featureProgress[i], target, L);
          var fp = featureProgress[i];
          var fty = (1 - fp) * 50;
          var fscale = 0.85 + fp * 0.15;
          var fblur = (1 - fp) * 5;
          applyTransform(featureCards[i],
            'translateY(' + fty.toFixed(2) + 'px) scale(' + fscale.toFixed(4) + ')',
            fp,
            'blur(' + fblur.toFixed(2) + 'px)'
          );
        }
      }

      // ═══ 8. KIT ITEMS — scroll-driven stagger ═══
      if (kitItems.length > 0) {
        var kitParent = kitItems[0].parentElement;
        var kitBase = getProgress(kitParent, 60);
        for (var ki2 = 0; ki2 < kitItems.length; ki2++) {
          var kdelay = ki2 * 0.05;
          var kraw = clamp((kitBase - kdelay) * 2.5, 0, 1);
          var ktarget = easeOut(kraw);
          kitProgress[ki2] = lerp(kitProgress[ki2], ktarget, L);
          var kp = kitProgress[ki2];
          var ktx = (1 - kp) * -60;
          var kblur = (1 - kp) * 4;
          applyTransform(kitItems[ki2],
            'translateX(' + ktx.toFixed(2) + 'px)',
            kp,
            'blur(' + kblur.toFixed(2) + 'px)'
          );
        }
      }

      // ═══ 9. SPEC ROWS — scroll-driven stagger ═══
      if (specRows.length > 0) {
        var specParent = specRows[0] && specRows[0].closest('.pdp-specs-table');
        var specBase = specParent ? getProgress(specParent, 60) : 0;
        for (var sri = 0; sri < specRows.length; sri++) {
          var sdelay = sri * 0.04;
          var sraw = clamp((specBase - sdelay) * 2.5, 0, 1);
          var starget = easeOut(sraw);
          specProgress[sri] = lerp(specProgress[sri], starget, L);
          var sp = specProgress[sri];
          applyTransform(specRows[sri],
            'translateX(' + ((1 - sp) * -30).toFixed(2) + 'px)',
            sp,
            'blur(' + ((1 - sp) * 3).toFixed(2) + 'px)'
          );
        }
      }

      // ═══ 10. CTA BUTTONS — scroll-driven stagger ═══
      if (ctaButtons.length > 0) {
        var btnParent = ctaButtons[0].closest('.pdp-section--cta');
        var btnBase = btnParent ? getProgress(btnParent, 60) : 0;
        for (var bti = 0; bti < ctaButtons.length; bti++) {
          var bdelay = bti * 0.06;
          var braw = clamp((btnBase - 0.15 - bdelay) * 2.5, 0, 1);
          var btarget = easeOut(braw);
          btnProgress[bti] = lerp(btnProgress[bti], btarget, L);
          var bp = btnProgress[bti];
          applyTransform(ctaButtons[bti],
            'translateY(' + ((1 - bp) * 40).toFixed(2) + 'px) scale(' + (0.9 + bp * 0.1).toFixed(4) + ')',
            bp,
            'blur(' + ((1 - bp) * 5).toFixed(2) + 'px)'
          );
        }
      }
    }

    // ── IntersectionObserver (for .visible class — glow dividers + ::after) ──
    if ('IntersectionObserver' in window) {
      pdpObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            hideHint();
            pdpObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.05, rootMargin: '0px 0px -30px 0px' });
      sections.forEach(function (s) { pdpObserver.observe(s); });
    } else {
      sections.forEach(function (s) { s.classList.add('visible'); });
    }

    // ── Start animation loop immediately, but defer hero lerp ──
    // CSS entry animations handle the hero for the first 1.5s
    var heroLerpReady = false;
    setTimeout(function () {
      if (!running) return;
      heroLerpReady = true;
      if (viewer3d) {
        viewer3d.style.animation = 'none';
        viewer3d.style.opacity = '1';
        viewer3d.style.transform = 'scale(1) translateY(0)';
        viewer3d.style.filter = 'blur(0)';
      }
      if (heroInfo) {
        heroInfo.style.animation = 'none';
        heroInfo.style.opacity = '1';
        heroInfo.style.transform = 'translateY(0) scale(1)';
        heroInfo.style.filter = 'blur(0)';
      }
    }, 1550);
    tick();

    // Store cleanup fn on the handler ref for the router to call
    pdpScrollHandler = function cleanup() {
      running = false;
      if (pdpRAF) { cancelAnimationFrame(pdpRAF); pdpRAF = null; }
      // Restore dock + WA float visibility when leaving PDP
      var d = document.getElementById('dock');
      var w = document.getElementById('waFloat');
      if (d) d.classList.remove('dock--hidden');
      if (w) w.classList.remove('wa-float--hidden');
    };
  }

  // ── Counter animation for spec numeric values ──
  function animateCounter(el, val) {
    var num = parseFloat(val);
    if (isNaN(num)) { el.textContent = val; return; }
    var suffix = val.replace(/[\d.,\-+]/g, '').trim();
    var isFloat = val.indexOf('.') !== -1 || val.indexOf(',') !== -1;
    var decimals = isFloat ? (val.split(/[.,]/)[1] || '').length : 0;
    var start = 0;
    var duration = 1200;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var current = start + (num - start) * eased;
      el.textContent = (decimals > 0 ? current.toFixed(decimals) : Math.round(current)) + (suffix ? ' ' + suffix : '');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Abonnement Page ──────────────────────────────────────────

  // ── ABO_DATA — SOURCE UNIQUE des abonnements (PLAN_INFO en dérive) ─────────
  // Remaster 25/07/2026 : valeurs RÉELLES et tenables (fin de la maquette
  // -25/-40 %/site offert). Black Partenaire = spec finale validée user ;
  // Basique/Pro/Gold = proportionnalité proposée (bon ≈ 38 % de la cotisation),
  // à co-valider. Détail complet : docs/PLAN-ABONNEMENTS.md.
  // `saving` = économie annuelle HONNÊTE sur le profil affiché (artisan
  // ~4 000 €/an d'achats) : bon annuel + remise sur ce profil (+ valeur du
  // pack pour Black). Alimente l'orbe (data-saving) ET le graphe.
  var ABO_DATA = {
    basique: {
      name: 'Basique',
      price: '4,90',
      saving: 25,
      tagline: 'L\'entrée dans le club',
      desc: 'Un bon d\'achat qui se remplit tous les mois, l\'accès aux ventes privées et un SAV prioritaire. Sans engagement.',
      features: [
        { icon: '💳', text: 'Bon d\'achat +1,90 € chaque mois', detail: 'Crédité à chaque mensualité payée (~23 €/an), cumulable, et il vous reste acquis même si vous arrêtez.' },
        { icon: '🎁', text: 'Ventes privées abonnés', detail: 'Accès aux offres réservées avant tout le monde.' },
        { icon: '📧', text: 'SAV prioritaire sous 48h', detail: 'Votre demande passe devant, réponse garantie sous 48h ouvrées.' },
        { icon: '📇', text: 'Carte dans l\'annuaire artisans', detail: 'Votre entreprise référencée sur notre page « Nos artisans » (carte texte).' }
      ],
      theme: 'basique'
    },
    pro: {
      name: 'Pro',
      price: '14,90',
      saving: 150,
      tagline: 'Pour l\'artisan qui commande régulièrement',
      desc: 'Le bon mensuel plus costaud, 2% de remise permanente et l\'accès aux précommandes container : les prix bateau, réservés aux abonnés.',
      features: [
        { icon: '💳', text: 'Bon d\'achat +5,70 € chaque mois', detail: 'Crédité à chaque mensualité payée (~68 €/an), cumulable, acquis même si vous arrêtez.' },
        { icon: '🏷️', text: 'Remise permanente de 2%', detail: 'Sur tout le catalogue. Non cumulable avec la remise fidélité : la plus avantageuse s\'applique.' },
        { icon: '🚢', text: 'Précommandes container', detail: 'Livraison groupée par bateau : 10 à 40 € de moins par outil, délai 3 à 5 semaines.' },
        { icon: '📧', text: 'SAV prioritaire sous 24h', detail: 'Réponse garantie sous 24h ouvrées, WhatsApp direct.' },
        { icon: '🎁', text: 'Ventes privées abonnés', detail: 'Accès aux offres réservées avant tout le monde.' },
        { icon: '📇', text: 'Annuaire : logo + 1 photo', detail: 'Votre carte artisan avec logo et une photo de réalisation.' }
      ],
      theme: 'pro'
    },
    gold: {
      name: 'Gold',
      price: '29,90',
      saving: 260,
      tagline: 'Le club avancé : équipement floqué et entraide entre membres',
      desc: 'Remise renforcée, bon mensuel sérieux, t-shirt et pantalon floqués chaque année, et le réseau d\'entraide du club Gold : des artisans d\'autres métiers partagent vos réalisations.',
      features: [
        { icon: '💳', text: 'Bon d\'achat +11,40 € chaque mois', detail: 'Crédité à chaque mensualité payée (~137 €/an), cumulable, acquis même si vous arrêtez.' },
        { icon: '🦺', text: 'T-shirt + pantalon floqués, chaque année', detail: 'Personnalisés aux couleurs de votre entreprise, flocage inclus, renouvelés chaque année. Tailles collectées à l\'inscription. (Le pack ÉPI complet — chaussures, lunettes, gants — est réservé au Black Partenaire.)' },
        { icon: '🤝', text: 'Entraide du club Gold : 2 partages/mois', detail: '2 fois par mois, un membre Gold d\'un AUTRE métier partage votre post ou story Instagram/Facebook — jamais un concurrent : un charpentier ne partage jamais un charpentier. Vous partagez en retour.' },
        { icon: '🏷️', text: 'Remise permanente de 3%', detail: 'Sur tout le catalogue. Non cumulable avec la remise fidélité : la plus avantageuse s\'applique.' },
        { icon: '🚢', text: 'Précommandes container prioritaires', detail: 'Vos outils partent dans le premier groupage disponible.' },
        { icon: '📐', text: '1 devis chantier personnalisé/trimestre', detail: 'On chiffre ensemble l\'outillage complet d\'un chantier, conseils inclus.' },
        { icon: '📧', text: 'SAV prioritaire sous 12h', detail: 'WhatsApp direct, réponse sous 12h ouvrées.' },
        { icon: '📇', text: 'Annuaire : 3 photos + lien', detail: 'Carte enrichie : logo, 3 photos de réalisations et lien vers votre site.' }
      ],
      rules: [
        '2 fois par mois, vous partagez la publication du membre Gold qui vous est attribué (métier différent du vôtre, jamais un concurrent) — et un membre partage la vôtre.',
        '3 manquements aux règles de partage entraînent la sortie du programme d\'entraide.',
        'Le bon de 11,40 € est crédité uniquement pour les mois effectivement payés.',
        'Sans engagement : vous partez quand vous voulez, votre bon cumulé vous reste.'
      ],
      theme: 'gold'
    },
    black: {
      name: 'Black Partenaire',
      price: '100',
      saving: 1100,
      places: 10,
      tagline: 'Le programme partenaire. 10 places, pas une de plus.',
      desc: 'Bien plus qu\'un abonnement : un pack pro complet chaque année (ÉPI floqués + site web), votre publicité locale gérée, et un réseau d\'entraide entre artisans de métiers différents qui partagent votre travail chaque semaine.',
      features: [
        { icon: '💳', text: 'Bon d\'achat +38 € chaque mois', detail: 'Crédité à chaque mensualité payée (456 €/an), cumulable sans limite — et il vous reste acquis même si vous arrêtez : cet argent est à vous.' },
        { icon: '🦺', text: 'Pack ÉPI complet floqué, chaque année', detail: 'Débloqué IMMÉDIATEMENT dès votre premier paiement : chaussures de sécurité, pantalon, t-shirt, lunettes et gants, personnalisés aux couleurs de votre entreprise. Tailles collectées à la souscription, puis renouvelé chaque année.' },
        { icon: '🌐', text: 'Votre site web pro, créé et remasterisé chaque année', detail: 'Lancé IMMÉDIATEMENT dès votre premier paiement : site vitrine + nom de domaine inclus. Vous avez déjà un site ? Au choix : refonte du vôtre, page portfolio complémentaire, ou budget pub doublé le 1er trimestre.' },
        { icon: '📣', text: 'Votre publicité locale gérée', detail: '~120 €/an de budget publicitaire réel, au choix Google Ads ou Facebook/Instagram, ciblé sur votre zone. Point mensuel WhatsApp.' },
        { icon: '🤝', text: 'Réseau d\'entraide entre artisans', detail: 'Chaque semaine, un partenaire d\'un AUTRE métier partage votre publication (jamais un concurrent : un pisciniste pousse un charpentier). Vous partagez la sienne en retour.' },
        { icon: '📱', text: '1 story dédiée/mois + story hebdo des partenaires', detail: 'Votre entreprise mise en avant sur les réseaux Pirates Tools : une story rien que pour vous chaque mois, plus la story hebdomadaire collective.' },
        { icon: '🎁', text: 'Ventes privées en avant-première', detail: 'Vous voyez les promotions et arrivages avant tous les autres abonnés.' },
        { icon: '🚢', text: 'Précommandes container prioritaires', detail: 'Comme les packs Pro et Gold — prêt à attendre 3 à 5 semaines ? Les prix bateau (10 à 40 € de moins par outil), et vos outils partent dans le premier groupage.' },
        { icon: '📐', text: 'Devis chantier personnalisés illimités', detail: 'On chiffre l\'outillage complet de vos chantiers autant de fois que nécessaire, réponse prioritaire.' },
        { icon: '📇', text: 'Carte premium dans l\'annuaire', detail: 'Design premium, 6 photos, badge Partenaire et lien direct vers votre site.' },
        { icon: '🏷️', text: 'Remise permanente de 5%', detail: 'Sur tout le catalogue, plafonnée à 100 € de remise par mois. Non cumulable avec la remise fidélité : la plus avantageuse s\'applique.' },
        { icon: '📞', text: 'SAV ligne directe', detail: 'Notre ligne directe, réponse prioritaire absolue.' }
      ],
      rules: [
        'Chaque semaine, vous partagez la publication du partenaire qui vous est attribué (métier différent du vôtre, jamais un concurrent) — et un partenaire partage la vôtre.',
        'Vous partagez la story Pirates Tools de votre binôme au moins 1 fois par mois sur vos réseaux.',
        '3 manquements aux règles de partage entraînent la sortie du programme.',
        'Le bon de 38 € est crédité uniquement pour les mois effectivement payés. En cas d\'impayé : rappels par email, 15 jours pour régulariser ; un mois de délai possible sur simple message expliquant votre situation ; au-delà d\'1 mois + 15 jours, l\'abonnement est résilié. Votre bon cumulé reste acquis.',
        'Sans engagement : vous partez quand vous voulez, votre bon cumulé vous reste.'
      ],
      theme: 'black'
    }
  };
  // Dérive PLAN_INFO (panneau accueil) depuis la source unique : plus de doublon.
  function aboToPlanInfo(key) {
    var d = ABO_DATA[key];
    return {
      name: d.name, desc: d.desc, color: d.theme,
      features: d.features.slice(0, 7).map(function (f) { return { icon: f.icon, text: f.text }; })
    };
  }

  function renderAbonnement(slug) {
    var data = ABO_DATA[slug];
    var el = document.getElementById('aboContent');
    if (!el || !data) { location.hash = '#/'; return; }

    var featRows = '';
    data.features.forEach(function (f, i) {
      featRows += '<div class="abo-feat" style="animation-delay:' + (i * .07) + 's">'
        + '<div class="abo-feat__icon">' + escapeHTML(f.icon) + '</div>'
        + '<div class="abo-feat__body">'
        + '<div class="abo-feat__title">' + escapeHTML(f.text) + '</div>'
        + '<div class="abo-feat__detail">' + escapeHTML(f.detail) + '</div>'
        + '</div></div>';
    });

    // Switcher : comparer/changer de pack sans repasser par l'accueil.
    var switcher = '<nav class="abo-switch" aria-label="Comparer les abonnements">'
      + ['basique', 'pro', 'gold', 'black'].map(function (k) {
        var d = ABO_DATA[k];
        return '<a href="#/abonnement/' + k + '" class="abo-switch__pill abo-switch__pill--' + d.theme + (k === slug ? ' is-active' : '') + '"'
          + (k === slug ? ' aria-current="page"' : '') + '>'
          + escapeHTML(d.name) + '<span class="abo-switch__price">' + d.price + '\u20ac/m</span></a>';
      }).join('')
      + '</nav>';

    el.innerHTML = '<div class="abo-page abo-page--' + escapeHTML(data.theme) + '">'
      // Back link
      + '<a href="#/" class="abo-back">\u2190 Retour</a>'
      + switcher

      // Hero header
      + '<div class="abo-hero">'
      + '<div class="abo-hero__glow"></div>'
      + '<div class="abo-hero__badge">' + escapeHTML(data.name) + '</div>'
      + '<h1 class="abo-hero__title" id="abo-h1">' + escapeHTML(data.tagline) + '</h1>'
      + '<p class="abo-hero__desc">' + escapeHTML(data.desc) + '</p>'
      + '<div class="abo-hero__price"><span class="abo-hero__amount">' + data.price + '\u20ac</span><span class="abo-hero__period">/mois</span></div>'
      + '</div>'

      // Features
      + '<div class="abo-features">'
      + '<h2 class="abo-features__title">Tout ce qui est inclus</h2>'
      + featRows
      + '</div>'

      // Règles du programme (tiers qui en ont — Black Partenaire) + acceptation.
      + (data.rules && data.rules.length
        ? '<div class="abo-rules"><h2 class="abo-features__title">Les règles du programme</h2>'
          + '<p class="abo-rules__intro">Un club d\'entraide ne fonctionne que si chacun joue le jeu. En souscrivant, vous acceptez ces règles :</p>'
          + '<ol class="abo-rules__list">'
          + data.rules.map(function (r) { return '<li>' + escapeHTML(r) + '</li>'; }).join('')
          + '</ol>'
          + '<label class="abo-accept"><input type="checkbox" id="aboAcceptChk"> <span>J\'ai lu et j\'accepte les règles du programme Partenaire.</span></label>'
          + '</div>'
        : '')

      // CTA — pré-lancement : souscription via contact (WhatsApp si numéro
      // configuré, sinon formulaire de contact). Le paiement en ligne de
      // l'abonnement arrive en Phase 3 (Stripe Subscriptions).
      + '<div class="abo-cta-wrap">'
      + (data.places ? '<p class="abo-places">' + data.places + ' places au total — programme limité</p>' : '')
      + '<button class="abo-cta abo-cta--' + escapeHTML(data.theme) + '" id="aboCtaBtn"' + (data.rules ? ' disabled aria-disabled="true"' : '') + '>Demander ma place \u2014 ' + data.price + '\u20ac/mois</button>'
      + '<p class="abo-cta-note">Sans engagement \u2022 Annulation à tout moment \u2022 Souscription accompagnée (on vous recontacte)</p>'
      + '</div>'
      + '</div>';

    // Acceptation des règles → active le CTA (tiers avec règles uniquement).
    var ctaBtn = document.getElementById('aboCtaBtn');
    var chk = document.getElementById('aboAcceptChk');
    if (ctaBtn) {
      if (chk) {
        chk.addEventListener('change', function () {
          ctaBtn.disabled = !chk.checked;
          ctaBtn.setAttribute('aria-disabled', chk.checked ? 'false' : 'true');
        });
      }
      ctaBtn.onclick = function () {
        if (ctaBtn.disabled) return;
        // Redirige vers le formulaire de pré-inscription structuré (Phase 3a) :
        // il collecte tout (métier, tailles, logo…) + l'acceptation horodatée
        // des règles. Aucun paiement (Stripe gelé tant que l'entreprise n'existe
        // pas). Le tier choisi est pré-sélectionné via le slug.
        if (typeof track === 'function') track('abo_request', { plan: slug });
        location.hash = '#/rejoindre/' + encodeURIComponent(slug);
      };
    }
  }

  // ── Annuaire artisans (Phase 2 abonnements) ────────────────
  // Données : collection Firestore `partners` — écrite UNIQUEMENT par le
  // serveur (admin.js type=partner-save, Admin SDK), lue publiquement par le
  // SDK client (rules : read true / write false). Pas d'endpoint GET dédié :
  // plan Vercel Hobby 12/12 fonctions (décision Phase 2, PLAN-ABONNEMENTS.md).
  // window.PT_PARTNERS_FIXTURE = couture de test (Playwright) : si un tableau
  // est présent, il remplace Firestore (aucun réseau).

  var _partnersPromise = null;

  var PARTNER_TIERS = {
    basique: { label: 'Basique', photos: 0 },
    pro:     { label: 'Pro',     photos: 1 },
    gold:    { label: 'Gold',    photos: 3 },
    black:   { label: 'Partenaire', photos: 6 }
  };

  // Défense en profondeur : même si les docs sont écrits par le serveur (déjà
  // validés), on n'injecte JAMAIS une source d'image qui ne soit pas une
  // data-URL image inline (miroir du contrôle serveur isDataImg d'admin.js).
  function isSafePartnerImg(src) {
    return typeof src === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(src);
  }
  function isSafePartnerLink(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  }

  // Normalisation COMMUNE fixture/Firestore : cartes inactives exclues, tri
  // par `order` croissant (pas de orderBy Firestore : un doc SANS le champ
  // serait silencieusement exclu de la requête ; tri client robuste).
  function normalizePartners(list) {
    return list.filter(function (p) { return p && p.active !== false; })
      .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
  }

  function loadPartners() {
    if (_partnersPromise) return _partnersPromise;
    if (Array.isArray(window.PT_PARTNERS_FIXTURE)) {
      _partnersPromise = Promise.resolve(normalizePartners(window.PT_PARTNERS_FIXTURE.slice()));
      return _partnersPromise;
    }
    _partnersPromise = new Promise(function (resolve) {
      whenFirebaseReady(function (fb) {
        if (!fb || !fb.configured || !fb.collection || !fb.getDocs) { resolve([]); return; }
        fb.getDocs(fb.collection(fb.db, 'partners')).then(function (snap) {
          var list = [];
          snap.forEach(function (d) {
            var p = d.data() || {};
            p.id = d.id;
            list.push(p);
          });
          resolve(normalizePartners(list));
        }).catch(function () {
          _partnersPromise = null; // erreur réseau → retenter à la prochaine visite
          resolve([]);
        });
      });
    });
    return _partnersPromise;
  }

  function partnerWaLink(p) {
    var digits = String(p.whatsapp || '').replace(/\D/g, '');
    return digits ? ('https://wa.me/' + digits) : '';
  }

  // 4 designs par tier : basique = texte seul ; pro = 1 photo ; gold = 3 photos
  // + lien site ; black = premium (6 photos, badge Partenaire, lien mis en avant).
  function partnerCardHTML(p) {
    var tier = PARTNER_TIERS[p.tier] ? p.tier : 'basique';
    var conf = PARTNER_TIERS[tier];
    var photos = (Array.isArray(p.photos) ? p.photos : []).filter(isSafePartnerImg).slice(0, conf.photos);
    var name = escapeHTML(String(p.name || ''));
    var metier = escapeHTML(String(p.metier || ''));
    var commune = escapeHTML(String(p.commune || ''));
    var desc = escapeHTML(String(p.desc || ''));
    var logo = tier !== 'basique' && isSafePartnerImg(p.logo) ? p.logo : '';
    var wa = partnerWaLink(p);
    var link = (tier === 'gold' || tier === 'black') && isSafePartnerLink(p.link) ? p.link : '';

    var html = '<article class="partner-card partner-card--' + tier + '" data-partner-id="' + escapeHTML(String(p.id || '')) + '">';
    if (tier === 'black') {
      html += '<span class="partner-card__badge">★ Partenaire Black</span>';
    }
    if (photos.length) {
      html += '<div class="partner-card__cover"><img src="' + photos[0] + '" alt="' + name + '" loading="lazy"></div>';
      if (photos.length > 1) {
        html += '<div class="partner-card__thumbs">';
        for (var i = 1; i < photos.length; i++) {
          html += '<img src="' + photos[i] + '" alt="" loading="lazy">';
        }
        html += '</div>';
      }
    }
    html += '<div class="partner-card__body">'
          + '<div class="partner-card__head">'
          + (logo ? '<img class="partner-card__logo" src="' + logo + '" alt="" loading="lazy">' : '')
          + '<h3 class="partner-card__name">' + name + '</h3>'
          + '</div>'
          + (metier ? '<span class="partner-card__metier">' + metier + (commune ? ' — ' + commune : '') + '</span>' : '')
          + (desc ? '<p class="partner-card__desc">' + desc + '</p>' : '');
    if (wa || link) {
      html += '<div class="partner-card__actions">';
      if (wa) html += '<a class="partner-card__btn partner-card__btn--wa" href="' + wa + '" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>';
      if (link) html += '<a class="partner-card__btn" href="' + escapeHTML(link) + '" target="_blank" rel="noopener noreferrer">🌐 Son site</a>';
      html += '</div>';
    }
    html += '</div></article>';
    return html;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERVICE COURSIER — formulaire « Devenir Livreur » (adaptatif par véhicule)
  // ⚠️ INACTIF tant que COURIER_ENABLED = false : personne ne peut réellement
  // candidater/faire des courses. On construit toute l'archi maintenant.
  // Cadre légal complet + sources : docs/plan-creation-coursier.md.
  // ══════════════════════════════════════════════════════════════════════════
  var COURIER_ENABLED = false;

  // Liens officiels (sources gouvernementales — vérifiés dans le doc).
  var LV_LINKS = {
    inpi:      'https://formalites.entreprises.gouv.fr',
    transport: 'https://www.ecologie.gouv.fr/politiques-publiques/acces-exercice-profession-transporteur-marchandises',
    dealGp:    'https://www.guadeloupe.developpement-durable.gouv.fr',
    permis:    'https://www.service-public.fr/particuliers/vosdroits/N530',
    urssaf:    'https://www.autoentrepreneur.urssaf.fr'
  };

  // Socle commun à TOUS les véhicules (livrer contre rémunération = activité pro).
  var LV_BASE = [
    { t: 'Avoir 18 ans minimum', h: 'Obligatoire. La date de naissance ci-dessus le vérifie automatiquement.' },
    { t: 'Être auto-entrepreneur (micro-entreprise)', h: 'Livrer contre paiement est une activité professionnelle : tu dois avoir un statut. Création 100&nbsp;% gratuite et en ligne.', link: { u: LV_LINKS.inpi, l: 'Créer ma micro-entreprise (Guichet unique)' } },
    { t: 'Une pièce d\'identité valide', h: 'Carte d\'identité ou passeport.' },
    { t: 'Une assurance Responsabilité Civile Professionnelle (RC Pro)', h: 'Elle te couvre si tu causes un dommage pendant une livraison.' },
    { t: 'Un RIB à ton nom', h: 'Pour être payé automatiquement après chaque course.' },
    { t: 'Un smartphone', h: 'Pour recevoir les courses et te faire guider.' }
  ];

  // Véhicules : chaque entrée = cahier des charges + textes de loi + explications.
  // Assureurs pros deux-roues livraison (boutons cliquables → devis). Prix
  // INDICATIFS (le tarif réel dépend de l'âge/véhicule/zone) — signalé à l'user.
  var LV_INSURERS = [
    { name: 'Orus', desc: 'RC Pro coursier / livreur', price: 'dès ~10 €/mois*', url: 'https://www.orus.eu/assurance-rc-pro/coursier-livreur' },
    { name: 'Coover', desc: 'Assurance pro livreur', price: 'devis en ligne', url: 'https://www.coover.fr' },
    { name: 'AssurUp', desc: 'RC Pro & véhicule pro', price: 'devis en ligne', url: 'https://www.assurup.com' },
    { name: 'Opticourtage', desc: 'Scooter / moto de livraison', price: 'devis scooter pro', url: 'https://www.opticourtage.com/assurance-scooter-de-livraison/' }
  ];

  // Coût estimé des démarches par véhicule (VRAIES valeurs — sources : France
  // Travail/AFTRAL/Promotrans pour la formation, réglementation transport léger,
  // devis assureurs). Affiché au-dessus du cahier des charges, maj au changement.
  var LV_COSTS = {
    vae: {
      total: 'Environ 0 € à l\'installation', time: 'Prêt en ~3 à 7 jours',
      once: [ { l: 'Création auto-entrepreneur', v: 'Gratuit' } ],
      month: [ { l: 'Assurance RC Pro', v: '~10 à 15 €' } ],
      summary: 'Quasi rien à débourser : juste ton assurance RC Pro (~10-15 €/mois). Aucun permis, aucune licence transport. Le seul délai = créer ta micro-entreprise (SIRET reçu sous quelques jours) et souscrire ton assurance.'
    },
    trottinette: {
      total: 'Environ 0 € à l\'installation', time: 'Prêt en ~3 à 7 jours',
      once: [ { l: 'Création auto-entrepreneur', v: 'Gratuit' } ],
      month: [ { l: 'Assurance RC Pro', v: '~10 à 15 €' }, { l: 'Assurance RC trottinette (obligatoire)', v: '~5 à 15 €' } ],
      summary: 'Aucun frais d\'installation. Compte environ 15 à 30 €/mois d\'assurances. Aucun permis. Délai = création micro-entreprise + assurances (quelques jours).'
    },
    scooter: {
      total: 'Environ 850 à 1 700 € au départ', time: 'Compte ~2 à 3 mois',
      once: [
        { l: 'Création auto-entrepreneur', v: 'Gratuit' },
        { l: 'Formation capacité transport léger', v: '750 à 1 500 €' },
        { l: 'Permis (uniquement si tu ne l\'as pas déjà)', v: '600 à 1 000 €' },
        { l: 'Casque homologué', v: '~50 à 100 €' },
        { l: 'Gants certifiés', v: '~30 à 80 €' }
      ],
      justify: [ { l: 'Capacité financière à justifier (réserve)', v: '~1 800 € (pas dépensé)' } ],
      month: [
        { l: 'Assurance RC Pro', v: '~10 à 15 €' },
        { l: 'Assurance du véhicule (usage pro)', v: '~30 à 60 €' },
        { l: 'Assurance des marchandises transportées', v: '~5 à 20 €' }
      ],
      summary: 'Le plus rentable, mais il faut investir au départ. En une fois : formation capacité 750-1 500 € + casque/gants ~80-180 € (le permis n\'est à payer que si tu ne l\'as pas déjà). À prévoir aussi : ~1 800 € de réserve à justifier (tu ne les dépenses pas). Puis, chaque mois : ~45 à 95 € d\'assurances au total. Le délai vient surtout de la formation (~3 semaines) et de l\'inscription au registre (récépissé sous ~2 mois).'
    }
  };

  // Cylindrées détaillées + consommation. Base = conso réelle constatée en
  // cycle mixte (sources revendeurs/essais) ; GUADELOUPE = +20 % (chaleur qui
  // dégrade le rendement + relief et virages permanents = relances constantes).
  // Ces consos serviront au CALCUL DU BARÈME par véhicule (coût/km réel).
  var LV_CYL = {
    '50':      { label: '50 cm³ (cyclomoteur)',  base: 2.5, permis: 'Permis AM (dès 14 ans)' },
    '125':     { label: '125 cm³',               base: 3.0, permis: 'Permis A1 (dès 16 ans), ou permis B + formation de 7 h' },
    '300-500': { label: '300 à 500 cm³',         base: 4.5, permis: 'Permis A2 (dès 18 ans)' },
    '600+':    { label: '600 cm³ et plus',       base: 6.0, permis: 'Permis A2 (dès 18 ans), puis A' }
  };
  var LV_GP_SURCONSO = 1.20;   // +20 % Guadeloupe
  function lvConsoGp(key) { return Math.round(LV_CYL[key].base * LV_GP_SURCONSO * 10) / 10; }

  // ── BARÈME PAR ZONE (décision user, corrigée 26/07) ────────────────────────
  // Ancrage : le trajet LE PLUS LONG = Sainte-Anne → BASSE-TERRE (la ville),
  // zone 🔴 4 (rayon 46 km) = 100 € MAXIMUM. Tarif DÉGRESSIF proportionnel au
  // rayon extérieur de zone : taux = 100 € / 46 km ≈ 2,17 €/km.
  // → Z1 (10 km) 22 € · Z2 (22 km) 48 € · Z3 (34 km) 74 € · Z4 (46 km) 100 €.
  // (Z1 respecte le plancher de 20 € voulu par l'user.) Montants = rémunération
  // MINIMUM garantie du livreur, carburant à sa charge (coûts réels très en
  // dessous : voir tableau admin Barème).
  var LV_BAREME = [
    { zone: 1, emoji: '🟢', km: '0-10',  prix: 22 },
    { zone: 2, emoji: '🔵', km: '10-22', prix: 48 },
    { zone: 3, emoji: '🟡', km: '22-34', prix: 74 },
    { zone: 4, emoji: '🔴', km: '34-46', prix: 100 }
  ];
  // Comptes de TEST (chaîne complète courses actives pour eux seuls — décision
  // user : son compte perso teste artisan ET livreur, sans documents).
  var LV_TEST_EMAILS = ['justforwada@icloud.com'];
  function lvIsTester() {
    try { return !!(_currentUser && _currentUser.email && LV_TEST_EMAILS.indexOf(String(_currentUser.email).toLowerCase()) !== -1); }
    catch (_) { return false; }
  }

  var LV_FUEL_DEFAULT = 1.87;  // €/L sans plomb Guadeloupe (réglementé, révisé
                               // chaque mois — modifiable dans Admin → Livreurs)
  var LV_ROUTE_FACTOR = 1.62;  // route réelle ≈ 1,62 × vol d'oiseau (mesuré sur
                               // Sainte-Anne→Capesterre : 46 km route / 28,4 km)

  // Aides RÉELLES pour financer les démarches (véhicules motorisés) — organismes
  // officiels, liens directs. Affichées dans le cahier des charges scooter/moto.
  var LV_AIDES = [
    { name: 'CPF', desc: 'Finance le permis A1/A2 (plafond 900 €) et la formation capacité transport', url: 'https://www.moncompteformation.gouv.fr' },
    { name: 'France Travail — AIF', desc: 'Aide Individuelle à la Formation : complète le CPF si tu es inscrit', url: 'https://www.francetravail.fr' },
    { name: 'Mission Locale (16-25 ans)', desc: 'Accompagnement jeunes + aides permis + allocation CEJ', url: 'https://www.unml.info' },
    { name: 'ADIE — microcrédit', desc: 'Prête jusqu\'à 12 000 € (véhicule, équipement, permis) — très présente en Outre-mer', url: 'https://www.adie.org' },
    { name: 'ACRE', desc: 'Cotisations réduites de ~50 % ta 1re année de micro-entreprise', url: 'https://www.autoentrepreneur.urssaf.fr/portail/accueil/sinformer-sur-le-statut/toutes-les-aides.html' },
    { name: 'Région Guadeloupe', desc: 'Aides régionales à la formation professionnelle des jeunes', url: 'https://www.regionguadeloupe.fr' }
  ];

  // Pièces à TÉLÉVERSER (option B : dépôt + validation manuelle admin).
  // Le dossier passe en statut « en_attente » ; l'admin valide/refuse chaque
  // pièce. Architecture prête à brancher un vérificateur en direct plus tard.
  var LV_PIECES_BASE = [
    { id: 'id',    t: 'Pièce d\'identité (recto-verso)' },
    { id: 'siret', t: 'Justificatif auto-entrepreneur (avis SIRET / INPI)',
      demarche: { u: LV_LINKS.inpi, l: 'Créer ma micro-entreprise' } },
    { id: 'rcpro', t: 'Attestation d\'assurance RC Pro',
      demarche: { u: 'https://www.orus.eu/assurance-rc-pro/coursier-livreur', l: 'Souscrire une RC Pro' } },
    { id: 'rib',   t: 'RIB à ton nom' }
  ];
  var LV_PIECES_EXTRA = {
    vae: [],
    trottinette: [ { id: 'rc', t: 'Attestation assurance responsabilité civile',
      demarche: { u: 'https://www.orus.eu', l: 'Assurer ma trottinette' } } ],
    scooter: [
      { id: 'permis',   t: 'Permis de conduire (adapté à la cylindrée)',
        demarche: { u: LV_LINKS.permis, l: 'Infos permis' } },
      { id: 'cg',       t: 'Carte grise du véhicule à ton nom',
        demarche: { u: 'https://immatriculation.ants.gouv.fr', l: 'Carte grise (ANTS)' } },
      { id: 'assveh',   t: 'Attestation assurance véhicule — usage professionnel',
        demarche: { u: 'https://www.opticourtage.com/assurance-scooter-de-livraison/', l: 'Assurer mon véhicule pro' } },
      { id: 'assmarch', t: 'Attestation assurance des marchandises transportées',
        demarche: { u: 'https://www.coover.fr', l: 'Assurer les marchandises' } },
      { id: 'capacite', t: 'Attestation de capacité de transport léger (DREAL)',
        demarche: { u: 'https://www.aftral.com/formation/ac-transport-leger-de-marchandises', l: 'Trouver la formation' } },
      { id: 'registre', t: 'Récépissé d\'inscription au registre des transporteurs',
        demarche: { u: LV_LINKS.dealGp, l: 'DEAL Guadeloupe' },
        form: { u: 'https://www.formulaires.service-public.gouv.fr/gf/cerfa_16093.do', l: 'Télécharger le formulaire (CERFA)' } }
    ]
  };

  var LV_VEHICLES = {
    vae: {
      emoji: '🔋', label: 'Vélo à assistance électrique (VAE)',
      note: { type: 'ok', txt: 'Bon compromis : assimilé à un vélo (aucune licence transport, aucun permis), tout en couvrant plus de distance. Doit être bridé à 25 km/h.' },
      docs: [ { t: 'Ton VAE doit être bridé à 25 km/h (assistance légale)', h: 'Au-delà de 25 km/h (« speed-bike »), c\'est un cyclomoteur : permis + immatriculation + assurance obligatoires (voir la catégorie Scooter/Moto).' } ],
      permis: null,
      laws: [
        { ref: 'Code de la route, art. R311-1 (cycle à pédalage assisté)',
          plain: 'Un VAE (assistance ≤ 25 km/h, moteur ≤ 250 W qui se coupe dès que tu arrêtes de pédaler) est légalement un VÉLO. Donc : pas de permis, pas d\'immatriculation, pas de licence transport. Juste le socle commun.',
          link: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000025758263' }
      ]
    },
    trottinette: {
      emoji: '🛴', label: 'Trottinette électrique',
      note: { type: 'ok', txt: 'Autorisée. Engin motorisé (≤ 25 km/h) : une assurance responsabilité civile est OBLIGATOIRE.' },
      docs: [ { t: 'Assurance Responsabilité Civile OBLIGATOIRE', h: 'Une trottinette électrique est un engin motorisé : l\'assurance RC est imposée par la loi (au-delà de la RC Pro du socle).' } ],
      permis: null,
      laws: [
        { ref: 'Décret n° 2019-1082 (EDPM) + Code des assurances, art. L211-1',
          plain: 'La trottinette électrique est un « engin de déplacement personnel motorisé » (EDPM), limité à 25 km/h. Pas de permis ni d\'immatriculation, MAIS comme elle est motorisée, l\'assurance responsabilité civile est OBLIGATOIRE.',
          link: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000039258297' }
      ]
    },
    scooter: {
      emoji: '🛵', label: 'Scooter / Moto',
      note: { type: 'strong', txt: 'Le plus rentable (distances) MAIS le plus de démarches. Tant que TOUT n\'est pas fourni et validé, tu ne peux pas faire de courses. On te guide pas à pas.' },
      docs: [
        { t: 'Permis adapté à la cylindrée', h: 'AM (50 cm³, dès 14 ans) · A1 (125 cm³, dès 16 ans) · A2 (dès 18 ans) · A. Permis B + 7 h de formation → 125 cm³.', link: { u: LV_LINKS.permis, l: 'Quel permis pour quel deux-roues' } },
        { t: 'Carte grise du véhicule à ton nom', h: 'Le deux-roues doit être immatriculé.' },
        { t: 'Assurance du véhicule à usage PROFESSIONNEL (livraison)', h: '⚠️ Ton assurance deux-roues personnelle NE couvre PAS le transport pour autrui. En cas d\'accident en livraison, tu serais non assuré. Choisis une assurance pro ci-dessous :', insurers: true },
        { t: 'Assurance des marchandises transportées', h: 'Tu es responsable de ce que tu transportes (vis, prises…) : une assurance dédiée couvre la perte ou la casse.' },
        { t: '🔴 Attestation de capacité professionnelle de transport léger', h: 'Formation d\'environ 105 h + examen à la DREAL. Obligatoire pour transporter des marchandises pour autrui avec un véhicule motorisé.', link: { u: LV_LINKS.transport, l: 'Accès à la profession de transporteur' } },
        { t: '🔴 Inscription au registre des transporteurs (DEAL Guadeloupe)', h: 'Demande d\'autorisation d\'exercer déposée à la DEAL/DREAL de ta région. Un récépissé est délivré sous ~2 mois.', link: { u: LV_LINKS.dealGp, l: 'DEAL Guadeloupe' } },
        { t: 'Casque homologué + gants certifiés', h: 'Obligatoires à deux-roues motorisé.' }
      ],
      permis: 'AM / A1 / A2 / A',
      laws: [
        { ref: 'Code des transports — transport public routier de marchandises',
          plain: 'Transporter des marchandises POUR AUTRUI avec un véhicule MOTORISÉ (même un scooter 50 cm³) = « transport public de marchandises », une activité réglementée. Il faut la capacité professionnelle de transport léger (≈105 h de formation) ET l\'inscription au registre des transporteurs. Le vélo, lui, en est exempté.',
          link: LV_LINKS.transport }
      ]
    }
  };

  // ── Zones tarifaires (barème par distance) — Guadeloupe validée par l'user.
  // Centre = bourg de Sainte-Anne ; rayons en km RÉELS (cercle 4 = côte ouest
  // de Basse-Terre, 46 km). Coordonnées dans le repère du SVG 100x100 du
  // sélecteur d'îles (#regIslands), même projection GeoJSON (scratchpad/
  // zones-971c.mjs). upk = unités SVG par km.
  var LV_ZONES = {
    '971': {
      sa: [52.56, 44.44], upk: 1.0209, rad: [10, 22, 34, 46],
      viewBox: '3 7.7 94 84.6',
      fills: ['rgba(52,211,153,0.40)', 'rgba(96,165,250,0.36)', 'rgba(250,204,21,0.30)', 'rgba(248,113,113,0.30)'],
      strokes: ['#34d399', '#60a5fa', '#facc15', '#f87171'],
      label: 'Sainte-Anne'
    }
  };

  // Construit la carte des zones dans `host` à partir du SVG d'île source
  // (contours GeoJSON clonés : clip + tracé). Zones = anneaux transparents
  // CLIPPÉS à la terre (rien ne peint la mer), traits ultra-fins.
  function lvBuildZoneMap(host, srcSvg, z) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', z.viewBox);
    var clipId = 'lvClip' + Math.floor(Math.random() * 1e6);
    var defs = document.createElementNS(NS, 'defs');
    var clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', clipId);
    var srcPaths = srcSvg.querySelectorAll('path');
    var i, p;
    for (i = 0; i < srcPaths.length; i++) clip.appendChild(srcPaths[i].cloneNode(true));
    defs.appendChild(clip); svg.appendChild(defs);
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('clip-path', 'url(#' + clipId + ')');
    function circlePath(cx, cy, r) {
      return 'M' + (cx - r).toFixed(2) + ' ' + cy.toFixed(2)
        + 'a' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 1 0 ' + (2 * r).toFixed(2) + ' 0'
        + 'a' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 1 0 ' + (-2 * r).toFixed(2) + ' 0Z';
    }
    for (i = 0; i < z.rad.length; i++) {
      var rO = z.rad[i] * z.upk;
      p = document.createElementNS(NS, 'path');
      p.setAttribute('d', i === 0 ? circlePath(z.sa[0], z.sa[1], rO)
        : circlePath(z.sa[0], z.sa[1], rO) + ' ' + circlePath(z.sa[0], z.sa[1], z.rad[i - 1] * z.upk));
      if (i > 0) p.setAttribute('fill-rule', 'evenodd');
      p.setAttribute('style', 'fill:' + z.fills[i] + ';stroke:none;filter:none'); // inline > CSS or doré
      g.appendChild(p);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', z.sa[0]); c.setAttribute('cy', z.sa[1]); c.setAttribute('r', rO.toFixed(2));
      c.setAttribute('style', 'fill:none;stroke:' + z.strokes[i] + ';stroke-width:.18;stroke-opacity:.85');
      g.appendChild(c);
    }
    svg.appendChild(g);
    for (i = 0; i < srcPaths.length; i++) svg.appendChild(srcPaths[i].cloneNode(true)); // contour doré (CSS)
    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', z.sa[0]); dot.setAttribute('cy', z.sa[1]); dot.setAttribute('r', '0.7');
    dot.setAttribute('style', 'fill:#fff');
    svg.appendChild(dot);
    var txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', (z.sa[0] + 1.5).toFixed(1)); txt.setAttribute('y', (z.sa[1] - 1.2).toFixed(1));
    txt.setAttribute('style', 'fill:#fff;font:600 3.4px sans-serif');
    txt.textContent = z.label;
    svg.appendChild(txt);
    host.appendChild(svg);
  }

  function lvDocItem(d) {
    var h = '<li class="lv-doc"><span class="lv-doc__t">' + d.t + '</span>';
    if (d.h) h += '<span class="lv-doc__h">' + d.h + '</span>';
    if (d.insurers) {
      h += '<div class="lv-insurers">';
      LV_INSURERS.forEach(function (ins) {
        h += '<a class="lv-ins" href="' + escapeHTML(ins.url) + '" target="_blank" rel="noopener noreferrer">'
          + '<span class="lv-ins__name">' + escapeHTML(ins.name) + '</span>'
          + '<span class="lv-ins__desc">' + escapeHTML(ins.desc) + '</span>'
          + '<span class="lv-ins__price">' + escapeHTML(ins.price) + '</span></a>';
      });
      h += '</div><span class="lv-ins__note">*prix indicatif — le tarif réel dépend de ton âge, ton véhicule et ta zone. Fais un devis gratuit sur leur site.</span>';
    }
    if (d.link) h += '<a class="lv-doc__link" href="' + escapeHTML(d.link.u) + '" target="_blank" rel="noopener noreferrer">' + escapeHTML(d.link.l) + ' ↗</a>';
    return h + '</li>';
  }
  function lvLawBlock(law) {
    return '<div class="lv-law">'
      + '<div class="lv-law__ref">📜 Ce que dit la loi — <strong>' + escapeHTML(law.ref) + '</strong></div>'
      + '<div class="lv-law__plain"><span class="lv-law__tag">En clair</span> ' + law.plain + '</div>'
      + (law.link ? '<a class="lv-law__link" href="' + escapeHTML(law.link) + '" target="_blank" rel="noopener noreferrer">Lire le texte officiel ↗</a>' : '')
      + '</div>';
  }

  // ── Carte de livraison (LEAFLET + OpenStreetMap + services de l'ÉTAT) ──────
  // Décision user 26/07 : PAS Google Maps. Pile 100 % gratuite/institutionnelle :
  //  • Leaflet 1.9.4 VENDU en local (vendor/leaflet/, ~145 Ko, zéro CDN) ;
  //  • fond de carte OpenStreetMap (routes complètes DOM-TOM) ;
  //  • géocodage adresse = Base Adresse Nationale (api-adresse.data.gouv.fr,
  //    service OFFICIEL de l'État, sans clé) ;
  //  • itinéraire indicatif = OSRM (router.project-osrm.org, open-source).
  // INTELLIGENT : centrée automatiquement sur l'île du visiteur
  // (_currentTerritory, persistant → un client Martinique voit la Martinique).
  var ISLAND_MAP = {
    '971': { lat: 16.22,  lng: -61.53, zoom: 10, name: 'Guadeloupe' },
    '972': { lat: 14.64,  lng: -61.02, zoom: 11, name: 'Martinique' },
    '973': { lat: 4.94,   lng: -52.33, zoom: 9,  name: 'Guyane' },
    '974': { lat: -21.13, lng: 55.53,  zoom: 10, name: 'La Réunion' },
    '976': { lat: -12.82, lng: 45.15,  zoom: 12, name: 'Mayotte' }
  };
  var LV_DEPOT = { lat: 16.2260, lng: -61.3823 };   // Sainte-Anne (départ courses 971)
  var _leafletPromise = null;
  function ensureLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (_leafletPromise) return _leafletPromise;
    _leafletPromise = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = 'vendor/leaflet/leaflet.js'; s.async = true;
      s.onload = function () {
        try { window.L.Icon.Default.prototype.options.imagePath = 'vendor/leaflet/images/'; } catch (_) {}
        resolve();
      };
      s.onerror = function () { _leafletPromise = null; reject(new Error('leaflet-load-failed')); };
      document.head.appendChild(s);
    });
    return _leafletPromise;
  }
  function haversineKm(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function lvZoneForKm(km) {
    var radii = [10, 22, 34, 46];
    for (var i = 0; i < radii.length; i++) if (km <= radii[i]) return LV_BAREME[i];
    return null;   // hors zone
  }

  // Limites géographiques par île (fitBounds = île ENTIÈRE toujours visible
  // dans la carte carrée — inclut Marie-Galante/Les Saintes/Désirade pour 971).
  var ISLAND_BOUNDS = {
    '971': [[15.80, -61.88], [16.55, -60.95]],
    '972': [[14.38, -61.25], [14.90, -60.78]],
    '973': [[2.10, -54.65], [5.80, -51.55]],
    '974': [[-21.42, 55.20], [-20.85, 55.86]],
    '976': [[-13.05, 44.95], [-12.60, 45.32]]
  };

  // ── WIDGET LIVRAISON réutilisable (fiche produit + page Livraison) ──────────
  // cfg = { box, map, addr, date, hourWrap, hour, whenName, zone, order, status,
  //         payload() → { productKey, productTitle, qty } }
  function initDeliveryWidget(cfg) {
    var box = document.getElementById(cfg.box);
    if (!box) return;
    var isle = ISLAND_MAP[_currentTerritory] || ISLAND_MAP['971'];
    var isleCode = ISLAND_MAP[_currentTerritory] ? _currentTerritory : '971';
    var is971 = isleCode === '971';
    var zoneTxt = document.getElementById(cfg.zone);
    function zoneBaseTxt() {
      return '💶 Frais de livraison selon la zone ('
        + LV_BAREME.map(function (b) { return b.emoji + ' ' + b.prix + ' €'; }).join(' · ')
        + ' — distance depuis Sainte-Anne), payés <strong>en ligne avec ta commande</strong> puis reversés '
        + '<strong>à 100 % au livreur</strong> une fois ta livraison confirmée (photo à l\'appui). '
        + 'Tape ton adresse : ta zone s\'affiche. L\'itinéraire proposé au livreur est indicatif : il reste libre de sa route.';
    }
    if (zoneTxt) zoneTxt.innerHTML = zoneBaseTxt();
    // Date par défaut = aujourd'hui (input iOS vide = trou visuel).
    var dateEl = document.getElementById(cfg.date);
    if (dateEl && !dateEl.value) {
      var now = new Date();
      dateEl.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }
    // Créneau : l'heure ne s'affiche qu'en « heure précise ».
    var hourWrap = document.getElementById(cfg.hourWrap);
    var radios = box.querySelectorAll('input[name="' + cfg.whenName + '"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].onchange = function () {
        var mode = (box.querySelector('input[name="' + cfg.whenName + '"]:checked') || {}).value;
        if (hourWrap) hourWrap.hidden = (mode !== 'heure');
      };
    }
    var mapEl = document.getElementById(cfg.map);
    if (!mapEl) return;
    // Photo du CHANTIER (obligatoire) : référence pour le livreur + preuve de
    // comparaison à la livraison. Compressée localement, envoyée après paiement.
    var sceneBtn = document.getElementById(cfg.sceneBtn);
    var sceneFile = document.getElementById(cfg.scene);
    var sceneSt = document.getElementById(cfg.sceneSt);
    var scenePrev = document.getElementById(cfg.scenePrev);
    if (sceneBtn && sceneFile) {
      sceneBtn.onclick = function () { sceneFile.click(); };
      sceneFile.onchange = function () {
        var f = sceneFile.files && sceneFile.files[0];
        if (!f) return;
        if (sceneSt) sceneSt.textContent = 'Compression…';
        lvCompressPhoto(f).then(function (data) {
          box._ptScene = data;
          if (sceneSt) sceneSt.textContent = '✅ Photo ajoutée';
          if (scenePrev) { scenePrev.hidden = false; scenePrev.innerHTML = '<img src="' + data + '" alt="Photo du chantier">'; }
        }).catch(function () {
          if (sceneSt) sceneSt.textContent = '❌ Photo illisible — réessaie.';
        });
      };
    }
    // Bouton COMMANDER → ouvre la MODALE DE PAIEMENT (la même que pour les
    // outils) : produits + frais de livraison payés en une fois. La course
    // n'est créée qu'APRÈS paiement vérifié (metadata Stripe → /merci ou
    // webhook) — impossible de commander sans payer.
    var orderBtn = document.getElementById(cfg.order);
    var orderSt = document.getElementById(cfg.status);
    if (orderBtn) orderBtn.onclick = function () {
      if (!_currentUser) { toast('Connecte-toi pour commander une livraison', 'error'); location.hash = '#/auth'; return; }
      var g = mapEl._ptGeo;
      if (!g) { if (orderSt) orderSt.textContent = 'Tape ton adresse et valide-la (Entrée) pour la localiser.'; return; }
      if (territoryFromPostalClient(g.postal) !== '971') {
        if (orderSt) orderSt.textContent = 'Livraison sur chantier disponible en Guadeloupe uniquement pour le moment.';
        return;
      }
      var km = haversineKm(LV_DEPOT, { lat: g.lat, lng: g.lng });
      var z = lvZoneForKm(km);
      if (!z) { if (orderSt) orderSt.textContent = 'Adresse hors zone de livraison (max 46 km depuis Sainte-Anne).'; return; }
      var when = (box.querySelector('input[name="' + cfg.whenName + '"]:checked') || {}).value || 'matin';
      var hour = (document.getElementById(cfg.hour) || {}).value || '';
      if (when === 'heure' && !hour) { if (orderSt) orderSt.textContent = 'Choisis l\'heure souhaitée.'; return; }
      var pl = cfg.payload();
      if (!pl || !pl.items || !pl.items.length) { if (orderSt) orderSt.textContent = 'Ton panier ne contient pas de quincaillerie.'; return; }
      if (!box._ptScene) {
        if (orderSt) orderSt.textContent = '📷 Ajoute la photo du chantier (obligatoire) — elle guide le livreur et sert de preuve.';
        if (sceneBtn) sceneBtn.focus();
        return;
      }
      var filmOk = document.getElementById(cfg.filmOk);
      if (filmOk && !filmOk.checked) {
        if (orderSt) orderSt.textContent = '🎥 Coche l\'accord de remise filmée (obligatoire) — c\'est la protection mutuelle client/livreur.';
        filmOk.focus();
        return;
      }
      if (orderSt) orderSt.textContent = '💳 Paiement sécurisé — la course part chez les livreurs dès le paiement validé.';
      openPayModal(pl.items, {
        address: g.label, street: g.street || '', postal: g.postal || '', city: g.city || '',
        lat: g.lat, lng: g.lng,
        date: (dateEl || {}).value || '', when: when, hour: hour,
        zone: z.zone, prix: z.prix,
        scenePhoto: box._ptScene
      });
    };
    ensureLeaflet().then(function () {
      var map = mapEl._ptMap;
      if (!map) {
        mapEl.innerHTML = '';
        map = window.L.map(mapEl, { scrollWheelZoom: false });
        window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
        }).addTo(map);
        if (is971) window.L.marker([LV_DEPOT.lat, LV_DEPOT.lng]).addTo(map).bindPopup('Départ des courses — Sainte-Anne');
        mapEl._ptMap = map;
      }
      // Cadrage = l'ÎLE ENTIÈRE dans la carte carrée (fitBounds), pas un centre/zoom fixe.
      if (mapEl.dataset.isle !== isleCode) {
        mapEl.dataset.isle = isleCode;
        if (ISLAND_BOUNDS[isleCode]) map.fitBounds(ISLAND_BOUNDS[isleCode], { padding: [8, 8] });
        else map.setView([isle.lat, isle.lng], isle.zoom);
      }
      setTimeout(function () {
        map.invalidateSize();
        if (ISLAND_BOUNDS[isleCode] && !mapEl._ptDest) map.fitBounds(ISLAND_BOUNDS[isleCode], { padding: [8, 8] });
      }, 80);

      // Adresse → position (Base Adresse Nationale, service officiel de l'État).
      var addr = document.getElementById(cfg.addr);
      if (addr && !addr._ptWired) {
        addr._ptWired = true;
        var geocode = function () {
          var q = addr.value.trim();
          if (q.length < 4) return;
          fetch('https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(q)
              + '&limit=1&lat=' + isle.lat + '&lon=' + isle.lng)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              var f = data && data.features && data.features[0];
              if (!f) { if (zoneTxt) zoneTxt.innerHTML = '❓ Adresse introuvable — précise la commune (ex. « Rue X, Le Gosier »).<br>' + zoneBaseTxt(); return; }
              var lng = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
              var label = f.properties && f.properties.label || q;
              if (mapEl._ptDest) map.removeLayer(mapEl._ptDest);
              mapEl._ptDest = window.L.marker([lat, lng]).addTo(map).bindPopup(escapeHTML(label)).openPopup();
              mapEl._ptGeo = {
                lat: lat, lng: lng, label: label,
                // BAN : rue / CP / commune séparés → préremplissage de la
                // modale de paiement (le CP fixe le territoire fiscal).
                street: (f.properties && f.properties.name) || '',
                postal: (f.properties && f.properties.postcode) || '',
                city: (f.properties && f.properties.city) || ''
              };
              map.setView([lat, lng], 13);
              if (is971) {
                var km = haversineKm(LV_DEPOT, { lat: lat, lng: lng });
                var z = lvZoneForKm(km);
                if (zoneTxt) zoneTxt.innerHTML = z
                  ? '📍 <strong>' + escapeHTML(label) + '</strong> — ' + km.toFixed(1) + ' km de Sainte-Anne → '
                    + z.emoji + ' <strong>Zone ' + z.zone + ' : ' + z.prix + ' € de livraison</strong> (payés avec ta commande — reversés à 100 % au livreur après confirmation).'
                  : '📍 <strong>' + escapeHTML(label) + '</strong> — ' + km.toFixed(1) + ' km : hors zone de livraison actuelle (max 46 km depuis Sainte-Anne).';
                fetch('https://router.project-osrm.org/route/v1/driving/' + LV_DEPOT.lng + ',' + LV_DEPOT.lat + ';' + lng + ',' + lat + '?overview=full&geometries=geojson')
                  .then(function (r) { return r.json(); })
                  .then(function (rt) {
                    var route = rt && rt.routes && rt.routes[0];
                    if (!route) return;
                    if (mapEl._ptRoute) map.removeLayer(mapEl._ptRoute);
                    var coords = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
                    mapEl._ptRoute = window.L.polyline(coords, { color: '#f2c14e', weight: 4, opacity: 0.85 }).addTo(map);
                    map.fitBounds(mapEl._ptRoute.getBounds(), { padding: [28, 28] });
                  }).catch(function () {});
              }
            }).catch(function () {});
        };
        addr.addEventListener('change', geocode);
        addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); geocode(); } });
      }
    }).catch(function () {
      if (mapEl.dataset.fallback) return;
      mapEl.dataset.fallback = '1';
      mapEl.classList.add('pdp-deliv-map--fallback');
      var src2 = document.querySelector('#regIslands .isl[data-isl="' + isleCode + '"] svg');
      if (src2) {
        var cl = src2.cloneNode(true);
        mapEl.appendChild(cl);
        try { var bb = cl.getBBox(); cl.setAttribute('viewBox', (bb.x - 3) + ' ' + (bb.y - 3) + ' ' + (bb.width + 6) + ' ' + (bb.height + 6)); } catch (_) {}
      }
    });
  }

  // Fiche produit : livraison d'UN produit.
  function initPdpDelivery(product) {
    initDeliveryWidget({
      box: 'pdpDelivery', map: 'pdpDeliveryMap', addr: 'pdpDelivAddr', date: 'pdpDelivDate',
      hourWrap: 'pdpDelivHourWrap', hour: 'pdpDelivHour', whenName: 'pdpDelivWhen',
      zone: 'pdpDelivZoneTxt', order: 'pdpDelivOrder', status: 'pdpDelivStatus',
      scene: 'pdpDelivScene', sceneBtn: 'pdpDelivSceneBtn', sceneSt: 'pdpDelivSceneSt', scenePrev: 'pdpDelivScenePrev', filmOk: 'pdpDelivFilmOk',
      payload: function () {
        // Lignes PAYABLES (modale carte) — quantité = sélecteur de la fiche.
        return { items: [{ key: product.id || product.slug, title: product.title, price: product.price, qty: _pdpQty }] };
      }
    });
  }

  // Page vitrine « Livraison quincaillerie » : barème rendu depuis LV_BAREME
  // (source unique — le panneau livreur affiche exactement les mêmes prix).
  function renderLivraison() {
    var box = document.getElementById('livraisonBareme');
    if (box) box.innerHTML = LV_BAREME.map(function (b) {
      return '<div class="lv-bareme__row"><span>' + b.emoji + ' Zone ' + b.zone + ' <em>(' + b.km + ' km)</em></span>'
        + '<span class="lv-bareme__prix">' + b.prix + ' \u20ac</span></div>';
    }).join('');

    // ── Commander une livraison depuis le PANIER (quincaillerie uniquement) ──
    // Grande carte carrée + widget complet, visibles si le panier contient de
    // la quincaillerie ; sinon invitation à en ajouter.
    var orderSec = document.getElementById('livraisonOrder');
    var noCart = document.getElementById('livraisonNoCart');
    if (!orderSec) return;
    var quincItems = getCart().filter(function (it) {
      var p = findProductByKey(it.key);
      return p && p.brand === 'Quincaillerie';
    });
    var has = quincItems.length > 0;
    orderSec.hidden = !has;
    if (noCart) noCart.hidden = has;
    if (!has) return;
    var itemsEl = document.getElementById('livDelivItems');
    var totalQty = 0;
    if (itemsEl) itemsEl.innerHTML = quincItems.map(function (it) {
      totalQty += (it.qty || 1);
      return '<div class="lv-bareme__row"><span>' + escapeHTML(it.title || it.key) + '</span><span class="lv-bareme__prix">× ' + (it.qty || 1) + '</span></div>';
    }).join('');
    else quincItems.forEach(function (it) { totalQty += (it.qty || 1); });
    initDeliveryWidget({
      box: 'livraisonOrder', map: 'livDelivMap', addr: 'livDelivAddr', date: 'livDelivDate',
      hourWrap: 'livDelivHourWrap', hour: 'livDelivHour', whenName: 'livDelivWhen',
      zone: 'livDelivZoneTxt', order: 'livDelivOrder', status: 'livDelivStatus',
      scene: 'livDelivScene', sceneBtn: 'livDelivSceneBtn', sceneSt: 'livDelivSceneSt', scenePrev: 'livDelivScenePrev', filmOk: 'livDelivFilmOk',
      payload: function () {
        // Lignes PAYABLES = la quincaillerie du panier (modale carte).
        var items = getCart().filter(function (it) {
          var p = findProductByKey(it.key);
          return p && p.brand === 'Quincaillerie';
        });
        if (!items.length) return null;
        return {
          items: items.map(function (it) {
            return { key: it.key, title: it.title || it.key, price: it.price, qty: it.qty || 1, coffret: !!it.coffret };
          })
        };
      }
    });
  }

  function renderLivreur() {
    var box = document.getElementById('lvForm');
    if (!box) return;
    var noteClass = { warn: 'lv-note--warn', ok: 'lv-note--ok', strong: 'lv-note--strong' };
    var state = { veh: null, dossier: false, files: {}, cylindree: '', remun: false, filmConsent: false,
                  contact: { name: '', email: '', phone: '' }, consent: false, submitted: false };
    // Pré-remplissage depuis le compte connecté (email au minimum).
    try { if (typeof _currentUser !== 'undefined' && _currentUser) {
      state.contact.email = _currentUser.email || '';
      state.contact.name = _currentUser.displayName || '';
    } } catch (_) {}
    function piecesFor(veh) { return LV_PIECES_BASE.concat(LV_PIECES_EXTRA[veh] || []); }

    // SHELL STABLE : le champ date est rendu UNE fois et n'est JAMAIS recréé
    // pendant la saisie. Sur iOS, remplacer l'input pendant que le sélecteur est
    // ouvert le fermait avant validation (bug signalé). Seuls #lvAgeMsg et
    // #lvDynamic changent -> le picker natif reste stable jusqu'au « Valider ».
    var bannerClosed = false;
    try { bannerClosed = localStorage.getItem('pt:lv-banner-closed') === '1'; } catch (_) {}
    box.innerHTML =
      (bannerClosed ? '' :
        '<div class="lv-banner lv-banner--green" id="lvBanner">'
        + '<button type="button" class="lv-banner__close" id="lvBannerClose" aria-label="Fermer ce message">×</button>'
        + '<div class="lv-banner__isles" id="lvBannerIsles" aria-hidden="true"></div>'
        + '<div>🟢 <strong>Ce service ouvre le 1er janvier.</strong> Tu peux déjà tout préparer et <strong>tester le formulaire</strong> (choisir tes fichiers, remplir ton dossier). Pour l\'instant, <strong>rien n\'est enregistré</strong> — c\'est juste pour découvrir.</div>'
        + '</div>')
      + '<div id="lvCourses"></div>'
      + '<div class="lv-card"><label class="lv-field"><span>Ta date de naissance *</span>'
      + '<input type="date" id="lvBirth" autocomplete="bday"></label>'
      + '<p class="lv-hint" id="lvAgeMsg" style="margin-top:.6rem">Renseigne ta date de naissance pour continuer.</p></div>'
      + '<div id="lvDynamic"></div>';

    function ageFromInput() {
      var birth = document.getElementById('lvBirth');
      if (!birth || !birth.value) return null;
      var d = new Date(birth.value), now = new Date();
      var years = now.getFullYear() - d.getFullYear();
      if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years--;
      return years;
    }

    function renderDynamic() {
      var years = ageFromInput();
      var msg = document.getElementById('lvAgeMsg');
      var dyn = document.getElementById('lvDynamic');
      if (!dyn) return;
      if (years === null) {
        if (msg) { msg.className = 'lv-hint'; msg.textContent = 'Renseigne ta date de naissance pour continuer.'; }
        dyn.innerHTML = ''; return;
      }
      if (years < 18) {
        if (msg) { msg.className = 'lv-age lv-age--ko'; msg.innerHTML = '❌ Tu dois avoir <strong>18 ans minimum</strong> pour devenir livreur (obligation légale). Reviens à ta majorité&nbsp;!'; }
        dyn.innerHTML = ''; return;
      }
      if (msg) { msg.className = 'lv-age lv-age--ok'; msg.textContent = '✅ Tu as ' + years + ' ans — tu peux continuer.'; }

      var h = [];
      // Sélecteur véhicule.
      h.push('<div class="lv-card"><h2 class="lv-h2">Choisis ton véhicule</h2><div class="lv-vehicles">');
      Object.keys(LV_VEHICLES).forEach(function (k) {
        var vv = LV_VEHICLES[k];
        h.push('<button type="button" class="lv-veh' + (state.veh === k ? ' lv-veh--on' : '') + '" data-veh="' + k + '">'
          + '<span class="lv-veh__emoji">' + vv.emoji + '</span><span class="lv-veh__label">' + vv.label + '</span></button>');
      });
      h.push('</div></div>');

      if (state.veh && LV_VEHICLES[state.veh]) {
        var v = LV_VEHICLES[state.veh];
        // Bouton rémunération (barème par distance) — plein largeur, vert néon.
        // La carte interactive + la grille de prix arrivent (prochain message user).
        h.push('<button type="button" class="lv-remun" id="lvRemun">💶 Combien je vais gagner&nbsp;? — Voir le barème par distance</button>');
        if (state.remun) {
          // Panneau tarifs : UNIQUEMENT l'île du compte du client (territoire
          // sélectionné) — c'est à l'intérieur de ce contour que les zones
          // tarifaires seront délimitées (carte interactive à venir).
          var terr = getTerritory(_currentTerritory) || getTerritory(DEFAULT_TERRITORY);
          h.push('<div class="lv-card lv-remun-panel">'
            + '<div class="lv-remun-isle" id="lvRemunIsle" data-isle="' + terr.code + '" aria-label="' + escapeHTML(terr.name) + '"></div>'
            + '<p class="lv-remun-isle__name">' + escapeHTML(terr.name) + '</p>'
            + '<div class="lv-bareme">'
            + LV_BAREME.map(function (b) {
                return '<div class="lv-bareme__row"><span>' + b.emoji + ' Zone ' + b.zone + ' <em>(' + b.km + ' km)</em></span>'
                  + '<span class="lv-bareme__prix">' + b.prix + ' €</span></div>';
              }).join('')
            + '</div>'
            + '<p style="margin:.5rem 0 0" class="lv-hint">💶 Montants <strong>minimum garantis</strong> par livraison, payés par l\'artisan — la distance est mesurée depuis Sainte-Anne. Exemples : livrer à Capesterre-Belle-Eau (zone 🟡) = <strong>74 €</strong> ; jusqu\'à Basse-Terre (zone 🔴, le plus long trajet) = <strong>100 €</strong>, pour ~12 € d\'essence aller-retour même en grosse moto.</p></div>');
        }
        // Coût + délai des démarches, JUSTE EN DESSOUS des cartes (position validée
        // par l'user), maj au changement de véhicule.
        var c = LV_COSTS[state.veh];
        if (c) {
          h.push('<div class="lv-card lv-cost"><h2 class="lv-h2">💶 Coût & délai des démarches</h2>');
          h.push('<div class="lv-cost__headline">'
            + '<div class="lv-cost__big"><span class="lv-cost__biglbl">Budget de départ</span><span class="lv-cost__bigv">' + c.total + '</span></div>'
            + '<div class="lv-cost__big"><span class="lv-cost__biglbl">Délai estimé</span><span class="lv-cost__bigv">⏱️ ' + c.time + '</span></div></div>');
          var costRows = function (title, rows) {
            if (!rows || !rows.length) return;
            h.push('<div class="lv-cost__grp"><span class="lv-cost__title">' + title + '</span>');
            rows.forEach(function (r) { h.push('<div class="lv-cost__row"><span>' + r.l + '</span><span class="lv-cost__v">' + r.v + '</span></div>'); });
            h.push('</div>');
          };
          costRows('À l\'installation (une fois)', c.once);
          costRows('À justifier (réserve, non dépensé)', c.justify);
          costRows('Par mois (récurrent)', c.month);
          h.push('<p class="lv-cost__sum">' + c.summary + '</p>');
          h.push('<p class="lv-hint">Estimations indicatives — les tarifs et délais réels dépendent des organismes et assureurs.</p></div>');
        }
        h.push('<div class="lv-card"><h2 class="lv-h2">Ton cahier des charges — ' + v.emoji + ' ' + v.label + '</h2>');
        if (v.note) h.push('<div class="lv-note ' + (noteClass[v.note.type] || '') + '">' + v.note.txt + '</div>');
        // Cylindrée (moto/scooter) : détermine le permis requis + servira au barème.
        if (state.veh === 'scooter') {
          h.push('<label class="lv-field lv-cyl"><span>🏍️ Cylindrée de ton véhicule *</span><select id="lvCyl">'
            + '<option value="">— Choisis —</option>');
          Object.keys(LV_CYL).forEach(function (ck) {
            h.push('<option' + (state.cylindree === ck ? ' selected' : '') + ' value="' + ck + '">'
              + LV_CYL[ck].label + ' — ≈ ' + String(lvConsoGp(ck)).replace('.', ',') + ' L/100 km en Guadeloupe</option>');
          });
          h.push('</select></label>');
          if (state.cylindree && LV_CYL[state.cylindree]) {
            var cy = LV_CYL[state.cylindree];
            h.push('<div class="lv-conso">'
              + '<div class="lv-cost__row"><span>Consommation constructeur (cycle mixte)</span><span class="lv-cost__v">≈ ' + String(cy.base).replace('.', ',') + ' L/100 km</span></div>'
              + '<div class="lv-cost__row"><span>Majoration Guadeloupe (chaleur + virages/relief : relances constantes)</span><span class="lv-cost__v">+20 %</span></div>'
              + '<div class="lv-cost__row"><span><strong>Consommation retenue pour ton barème</strong></span><span class="lv-cost__v">≈ ' + String(lvConsoGp(state.cylindree)).replace('.', ',') + ' L/100 km</span></div>'
              + '</div>');
            h.push('<p class="lv-hint">Permis requis : <strong>' + cy.permis + '</strong>. Cette consommation sert à calculer ta rémunération : plus ton véhicule consomme, plus le tarif en tient compte — tu ne travailles jamais à perte.</p>');
          }
        }
        h.push('<h3 class="lv-h3">Le socle commun (obligatoire pour tous)</h3><ul class="lv-docs">');
        LV_BASE.forEach(function (d) { h.push(lvDocItem(d)); });
        h.push('</ul>');
        if (v.docs && v.docs.length) {
          h.push('<h3 class="lv-h3">En plus, pour ' + v.label + '</h3><ul class="lv-docs">');
          v.docs.forEach(function (d) { h.push(lvDocItem(d)); });
          h.push('</ul>');
          // Aides au financement (véhicules motorisés uniquement) : la
          // formation + le permis + le véhicule peuvent être largement financés.
          if (state.veh === 'scooter') {
            h.push('<h3 class="lv-h3">💰 Tu n\'es pas obligé de tout payer de ta poche — les aides RÉELLES</h3>');
            h.push('<p class="lv-hint" style="margin:0 0 .6rem">La formation capacité, le permis et même le véhicule peuvent être financés en grande partie. Clique, vérifie tes droits, monte ton dossier :</p>');
            h.push('<div class="lv-insurers">');
            LV_AIDES.forEach(function (a) {
              h.push('<a class="lv-ins" href="' + escapeHTML(a.url) + '" target="_blank" rel="noopener noreferrer">'
                + '<span class="lv-ins__name">' + escapeHTML(a.name) + '</span>'
                + '<span class="lv-ins__desc">' + escapeHTML(a.desc) + '</span></a>');
            });
            h.push('</div>');
          }
        } else {
          h.push('<p class="lv-hint">✅ Rien de plus que le socle commun — c\'est le véhicule le plus simple administrativement.</p>');
        }
        h.push('</div>');
        h.push('<div class="lv-card"><h2 class="lv-h2">Les textes de loi (et ce qu\'ils veulent dire)</h2>');
        v.laws.forEach(function (law) { h.push(lvLawBlock(law)); });
        h.push('<p class="lv-hint">Sources officielles : URSSAF, DREAL/DEAL, Légifrance.</p></div>');
        if (!state.dossier) {
          h.push('<div class="lv-card lv-cta">'
            + '<button type="button" class="btn primary" id="lvOpenDossier">Je prépare mon dossier →</button>'
            + '<span class="lv-cta__note">Prépare et dépose tes pièces. On vérifie tout avant de t\'activer.</span></div>');
        } else {
          // ── Mon dossier : dépôt des pièces (option B) ──
          var pieces = piecesFor(state.veh);
          var ready = 0;
          pieces.forEach(function (p) { if (state.files[p.id]) ready++; });
          h.push('<div class="lv-card"><h2 class="lv-h2">Mon dossier — pièces à déposer</h2>');
          h.push('<div class="lv-progress"><div class="lv-progress__bar"><span style="width:' + Math.round(100 * ready / pieces.length) + '%"></span></div>'
            + '<span class="lv-progress__txt">' + ready + ' / ' + pieces.length + ' pièces prêtes</span></div>');
          h.push('<ul class="lv-docs">');
          pieces.forEach(function (p) {
            var got = state.files[p.id];
            h.push('<li class="lv-piece' + (got ? ' lv-piece--ok' : '') + '">'
              + '<span class="lv-piece__t">' + (got ? '✅ ' : '') + p.t + '</span>'
              + (got ? '<span class="lv-piece__file">' + escapeHTML(got) + '</span>' : '')
              + '<span class="lv-piece__actions">'
              + (p.demarche ? '<a class="lv-piece__demarche" href="' + escapeHTML(p.demarche.u) + '" target="_blank" rel="noopener noreferrer">📋 ' + escapeHTML(p.demarche.l) + ' ↗</a>' : '')
              + (p.form ? '<a class="lv-piece__form" href="' + escapeHTML(p.form.u) + '" target="_blank" rel="noopener noreferrer">⬇️ ' + escapeHTML(p.form.l) + '</a>' : '')
              + '<label class="lv-piece__btn">' + (got ? 'Remplacer' : 'Choisir un fichier')
              + '<input type="file" accept="image/*,application/pdf" data-piece="' + p.id + '" hidden></label>'
              + '</span></li>');
          });
          h.push('</ul>');
          var allReady = ready === pieces.length;
          if (state.submitted) {
            h.push('<div class="lv-note lv-note--ok" style="margin-top:1rem">✅ <strong>Ton dossier de test est complet&nbsp;!</strong> Le service ouvre le 1er janvier — on vérifiera tes pièces à ce moment-là. Pour l\'instant rien n\'est enregistré (c\'est un test).</div>');
          } else {
            h.push('<h3 class="lv-h3">Tes coordonnées</h3>');
            h.push('<div class="lv-grid2">'
              + '<label class="lv-field"><span>Nom complet *</span><input type="text" id="lvName" value="' + escapeHTML(state.contact.name) + '" maxlength="80"></label>'
              + '<label class="lv-field"><span>Email *</span><input type="email" id="lvEmail" value="' + escapeHTML(state.contact.email) + '" maxlength="120"></label>'
              + '<label class="lv-field"><span>Téléphone / WhatsApp</span><input type="tel" id="lvPhone" value="' + escapeHTML(state.contact.phone) + '" maxlength="30" placeholder="0690…"></label>'
              + '</div>');
            h.push('<label class="lv-consent"><input type="checkbox" id="lvConsent"' + (state.consent ? ' checked' : '') + '> <span>J\'autorise Pirates Tools à traiter mes documents (pièce d\'identité, permis, assurance…) dans le seul but de vérifier mon éligibilité au service de livraison. Je peux demander leur suppression à tout moment. <a href="#/confidentialite">Politique de confidentialité</a>.</span></label>');
            h.push('<label class="lv-consent"><input type="checkbox" id="lvFilmConsent"' + (state.filmConsent ? ' checked' : '') + '> <span>🎥 J\'accepte que les <strong>remises de colis puissent être filmées</strong>, par le client comme par moi, comme preuve mutuelle en cas de litige. Ces vidéos restent <strong>privées</strong> (jamais publiées, visibles de l\'administrateur seul) et sont <strong>supprimées une fois le litige clos</strong>. Toute remise se fait dans le respect mutuel.</span></label>');
            h.push('<div class="lv-cta" style="margin-top:1rem">'
              + '<button type="button" class="btn primary" id="lvSubmitDossier">Envoyer mon dossier (test)</button>'
              + '<span class="lv-cta__note" id="lvSubmitNote"></span></div>');
          }
          h.push('</div>');
        }
      }

      dyn.innerHTML = h.join('');
      var vehBtns = dyn.querySelectorAll('[data-veh]');
      for (var i = 0; i < vehBtns.length; i++) {
        (function (btn) { btn.onclick = function () {
          state.veh = btn.getAttribute('data-veh');
          state.dossier = false; state.files = {}; state.cylindree = ''; state.submitted = false; state.remun = false;
          renderDynamic();
        }; })(vehBtns[i]);
      }
      var remun = document.getElementById('lvRemun');
      if (remun) remun.onclick = function () { state.remun = !state.remun; renderDynamic(); };
      // Île du client dans le panneau tarifs : clone le contour GeoJSON depuis
      // le sélecteur d'inscription (source unique des tracés).
      var remIsle = document.getElementById('lvRemunIsle');
      if (remIsle) {
        var isleCode = remIsle.getAttribute('data-isle');
        var srcIsle = document.querySelector('#regIslands .isl[data-isl="' + isleCode + '"] svg');
        if (srcIsle && LV_ZONES[isleCode]) {
          // Carte des ZONES TARIFAIRES (clippées à la terre, validée user).
          lvBuildZoneMap(remIsle, srcIsle, LV_ZONES[isleCode]);
        } else if (srcIsle) {
          var cl = srcIsle.cloneNode(true);
          remIsle.appendChild(cl);
          // Recadre le viewBox sur le contenu RÉEL (le carré 100x100 du sélecteur
          // laisse du vide autour des îles larges) → l'île occupe tout l'espace
          // du panneau sans agrandir celui-ci.
          try {
            var bb = cl.getBBox();
            cl.setAttribute('viewBox', (bb.x - 3) + ' ' + (bb.y - 3) + ' ' + (bb.width + 6) + ' ' + (bb.height + 6));
          } catch (_) {}
        }
      }
      var cyl = document.getElementById('lvCyl');
      if (cyl) cyl.onchange = function () { state.cylindree = cyl.value; renderDynamic(); };
      var openDos = document.getElementById('lvOpenDossier');
      if (openDos) openDos.onclick = function () { state.dossier = true; renderDynamic(); };
      var fileInputs = dyn.querySelectorAll('[data-piece]');
      for (var j = 0; j < fileInputs.length; j++) {
        (function (inp) { inp.onchange = function () {
          var f = inp.files && inp.files[0];
          if (f) state.files[inp.getAttribute('data-piece')] = f.name;  // TEST : nom seulement, AUCUN stockage
          renderDynamic();
        }; })(fileInputs[j]);
      }
      // Coordonnées : maj SANS re-render (garde le focus pendant la frappe).
      var nm = document.getElementById('lvName'); if (nm) nm.oninput = function () { state.contact.name = nm.value; };
      var em = document.getElementById('lvEmail'); if (em) em.oninput = function () { state.contact.email = em.value; };
      var ph = document.getElementById('lvPhone'); if (ph) ph.oninput = function () { state.contact.phone = ph.value; };
      var cs = document.getElementById('lvConsent'); if (cs) cs.onchange = function () { state.consent = cs.checked; };
      var fc = document.getElementById('lvFilmConsent'); if (fc) fc.onchange = function () { state.filmConsent = fc.checked; };
      var sub = document.getElementById('lvSubmitDossier');
      if (sub) sub.onclick = function () {
        if (nm) state.contact.name = nm.value; if (em) state.contact.email = em.value;
        if (ph) state.contact.phone = ph.value; if (cs) state.consent = cs.checked;
        if (fc) state.filmConsent = fc.checked;
        var missing = [];
        if (piecesFor(state.veh).some(function (p) { return !state.files[p.id]; })) missing.push('toutes les pièces');
        if (state.veh === 'scooter' && !state.cylindree) missing.push('la cylindrée');
        if (!state.contact.name) missing.push('ton nom');
        if (!state.contact.email) missing.push('ton email');
        if (!state.consent) missing.push('le consentement (case à cocher)');
        if (!state.filmConsent) missing.push('l\'accord de remise filmée (case 🎥)');
        var note = document.getElementById('lvSubmitNote');
        if (missing.length) { if (note) note.textContent = 'Il manque : ' + missing.join(', ') + '.'; return; }
        state.submitted = true; renderDynamic();  // DÉMO — aucun stockage, aucun envoi serveur
      };
    }

    var birthEl = document.getElementById('lvBirth');
    if (birthEl) birthEl.onchange = renderDynamic;   // fire au « Valider » du picker
    var back = document.getElementById('lvBack');
    if (back) back.onclick = function () { history.length > 1 ? history.back() : (location.hash = '#/compte'); };

    // Bandeau : contours dorés des îles (clonés depuis le sélecteur d'inscription
    // #regIslands = les VRAIS tracés GeoJSON, zéro duplication) + bouton fermer.
    var bIsles = document.getElementById('lvBannerIsles');
    if (bIsles) {
      var srcSvgs = document.querySelectorAll('#regIslands .isl svg');
      for (var si = 0; si < srcSvgs.length; si++) bIsles.appendChild(srcSvgs[si].cloneNode(true));
    }
    var bClose = document.getElementById('lvBannerClose');
    if (bClose) bClose.onclick = function () {
      var bn = document.getElementById('lvBanner');
      if (bn) bn.remove();
      try { localStorage.setItem('pt:lv-banner-closed', '1'); } catch (_) {}
    };

    // ── MODE TEST : espace courses du livreur (allowlist uniquement) ──
    // Le compte de test voit les courses en attente et peut les accepter
    // (1er arrivé = transaction serveur). Alertes par email à la création.
    if (lvIsTester()) loadLvCourses();
  }

  // ── MODE LIVRAISON : l'espace livreur (même environnement pour TOUS) ───────
  // Carte de l'île avec les courses posées dessus (pastille couleur de zone),
  // détail au clic (carte ↔ liste synchronisées), acceptation (serveur seul
  // juge : mode test = allowlist, sinon 403), historique de courses.
  // ── Rôle livraison (cache) : livreur ACCEPTÉ (serveur) ou client ──────────
  var _lvRolePromise = null;
  function lvGetRole() {
    if (!_currentUser) return Promise.resolve(false);
    if (_lvRolePromise) return _lvRolePromise;
    _lvRolePromise = jsonAuthHeaders().then(function (headers) {
      return fetch(apiBaseUrl() + '/api/contact', { method: 'POST', headers: headers, body: JSON.stringify({ type: 'courier-status' }) });
    }).then(function (r) { return r.json(); })
      .then(function (d) { return !!(d && d.courier); })
      .catch(function () { return lvIsTester(); });
    return _lvRolePromise;
  }
  // Boutons du compte (colonne droite) : « Mes livraisons » pour TOUS ;
  // « Mode livraison » UNIQUEMENT pour les livreurs acceptés (ou testeur).
  function updateAccLivBtn() {
    var btn = document.getElementById('accLivBtn');
    if (!btn) return;
    btn.hidden = !lvIsTester();          // affichage immédiat pour le testeur
    lvGetRole().then(function (isC) { btn.hidden = !isC; });
  }

  // Espace livreur : RÉSERVÉ aux livreurs acceptés — un client est redirigé
  // vers SON environnement « Mes livraisons ».
  // Compresse la photo de preuve de livraison : max 1100 px, JPEG — vise
  // < 500 Ko en base64 (limite doc Firestore 1 Mio, garde serveur 700 Ko).
  function lvCompressPhoto(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('Lecture du fichier impossible')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Image illisible')); };
        img.onload = function () {
          var MAX = 1100;
          var sc = Math.min(1, MAX / Math.max(img.width, img.height));
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * sc);
          cv.height = Math.round(img.height * sc);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          var q = 0.72;
          var out = cv.toDataURL('image/jpeg', q);
          while (out.length > 680000 && q > 0.4) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
          resolve(out);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // Libellés partagés des statuts de course (livreur + client).
  function lvCourseStatusTxt(c, forClient) {
    if (c.status === 'en_attente') return '⏳ En attente d\'un livreur';
    if (c.status === 'acceptee') return forClient ? '🛵 Prise en charge par un livreur' : '🛵 Acceptée — livraison en cours';
    if (c.status === 'livree') return forClient ? '📦 Livrée — vérifie la photo et confirme la réception' : '📦 Livrée — en attente de confirmation du client';
    if (c.status === 'terminee') return '✅ Terminée';
    return escapeHTML(c.status);
  }

  // ── Vidéos de remise / litige (Firebase Storage, module chargé à la
  // demande — 0 octet au boot). Le FICHIER part direct au Storage (rules :
  // participants de la course seulement, ≤120 Mo, video/*) ; la référence est
  // ensuite journalisée serveur (course-video). Vidéos PRIVÉES : lisibles par
  // l'admin seul (URL signée), jamais publiées, supprimées à la clôture.
  function lvUploadVideo(c, file, onProgress) {
    if (!file || String(file.type).indexOf('video/') !== 0) return Promise.reject(new Error('Choisis une vidéo.'));
    if (file.size > 100 * 1024 * 1024) return Promise.reject(new Error('Vidéo trop lourde (max 100 Mo) — filme plus court.'));
    if (!_fb || !_fb.loadStorage) return Promise.reject(new Error('Connexion requise.'));
    var ext = (String(file.name).split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    var path = 'courses/' + c.id + '/videos/' + Date.now() + '.' + ext;
    return _fb.loadStorage().then(function (S) {
      var task = S.uploadBytesResumable(S.ref(S.storage, path), file, { contentType: file.type });
      return new Promise(function (resolve, reject) {
        task.on('state_changed', function (snap) {
          if (onProgress && snap.totalBytes) onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100));
        }, function (err) {
          // Message EXPLICITE au lieu du code Firebase brut : tant que
          // Storage n'est pas activé sur le projet, l'upload échoue et
          // l'utilisateur doit comprendre que ce n'est pas SA faute.
          var code = (err && err.code) || '';
          if (code === 'storage/unauthorized') {
            reject(new Error('Dépôt refusé — tu dois être le client ou le livreur de cette course.'));
          } else if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') {
            reject(new Error('Connexion trop instable — réessaie avec une vidéo plus courte.'));
          } else {
            reject(new Error('Dépôt de vidéos indisponible pour le moment (fonction pas encore activée). Tes photos et le litige fonctionnent normalement.'));
          }
        }, function () { resolve(path); });
      });
    }).then(function (donePath) {
      return jsonAuthHeaders().then(function (headers) {
        return fetch(apiBaseUrl() + '/api/contact', {
          method: 'POST', headers: headers,
          body: JSON.stringify({ type: 'course-video', id: c.id, path: donePath })
        });
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) throw new Error(d.error || 'Enregistrement de la vidéo échoué');
        return donePath;
      });
    });
  }

  // Bloc vidéo + litige commun aux deux espaces (client et livreur).
  function lvVideoDisputeHtml(c) {
    var litOpen = c.litige && c.litige.open;
    var h = '<div class="lv-vid">';
    if (litOpen) {
      h += '<div class="lv-note lv-note--warn">⚠️ <strong>Litige en cours</strong> (ouvert par le '
        + escapeHTML(c.litige.role || '?') + '). L\'administrateur examine les preuves — ajoute ta vidéo si tu en as une.</div>';
    }
    h += '<p class="lv-hint">🎥 Vidéo de la remise' + (litOpen ? ' / du litige' : '') + ' (optionnelle) : elle protège les <strong>deux</strong> parties. '
      + 'Privée — visible de l\'administrateur seul, jamais publiée, supprimée à la clôture du litige.'
      + (c.videosCount ? ' <strong>' + c.videosCount + ' vidéo' + (c.videosCount > 1 ? 's' : '') + ' déjà déposée' + (c.videosCount > 1 ? 's' : '') + '.</strong>' : '') + '</p>'
      + '<input type="file" accept="video/*" capture="environment" class="lv-vid__file" hidden>'
      + '<div class="lv-cta"><button type="button" class="btn lv-vid__btn">🎥 Ajouter une vidéo</button>'
      + '<span class="lv-cta__note lv-vid__st" aria-live="polite"></span></div>';
    if (!litOpen) {
      h += '<details class="lv-dispute"><summary>⚠️ Un problème avec cette livraison ? Ouvrir un litige</summary>'
        + '<textarea class="lv-dispute__msg" maxlength="1000" rows="3" placeholder="Décris précisément le problème (min. 10 caractères)…"></textarea>'
        + '<div class="lv-cta"><button type="button" class="btn lv-dispute__send">Ouvrir le litige</button>'
        + '<span class="lv-cta__note lv-dispute__st" aria-live="polite"></span></div></details>';
    }
    h += '</div>';
    return h;
  }

  function wireVideoDispute(root, c, rerender) {
    var box = root.querySelector('.lv-vid');
    if (!box) return;
    var btn = box.querySelector('.lv-vid__btn');
    var file = box.querySelector('.lv-vid__file');
    var st = box.querySelector('.lv-vid__st');
    if (btn && file) {
      btn.onclick = function () { file.click(); };
      file.onchange = function () {
        var f = file.files && file.files[0];
        if (!f) return;
        btn.disabled = true;
        lvUploadVideo(c, f, function (pct) { if (st) st.textContent = '⏫ Envoi… ' + pct + ' %'; })
          .then(function () {
            toast('🎥 Vidéo déposée — privée, visible de l\'administrateur seul', 'success');
            rerender();
          })
          .catch(function (e) {
            btn.disabled = false;
            if (st) st.textContent = '❌ ' + ((e && e.message) || 'Envoi échoué');
          });
      };
    }
    var send = box.querySelector('.lv-dispute__send');
    if (send) send.onclick = function () {
      var msg = box.querySelector('.lv-dispute__msg');
      var dst = box.querySelector('.lv-dispute__st');
      send.disabled = true;
      if (dst) dst.textContent = 'Ouverture…';
      jsonAuthHeaders().then(function (headers) {
        return fetch(apiBaseUrl() + '/api/contact', {
          method: 'POST', headers: headers,
          body: JSON.stringify({ type: 'course-dispute', id: c.id, message: msg ? msg.value : '' })
        });
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { toast('⚠️ Litige ouvert — l\'administrateur est prévenu par email', 'success'); rerender(); }
        else { send.disabled = false; if (dst) dst.textContent = '❌ ' + (d.error || 'Erreur'); }
      }).catch(function () { send.disabled = false; if (dst) dst.textContent = 'Erreur réseau.'; });
    };
  }

  function renderCourierSpace() {
    lvGetRole().then(function (isC) {
      if (!isC) { location.hash = '#/mes-livraisons'; return; }
      renderCourierSpaceInner();
    });
  }
  function renderCourierSpaceInner() {
    var back = document.getElementById('courierBack');
    if (back) back.onclick = function () { history.length > 1 ? history.back() : (location.hash = '#/compte'); };
    var refresh = document.getElementById('courierRefresh');
    if (refresh) refresh.onclick = renderCourierSpace;
    var banner = document.getElementById('courierBanner');
    if (banner) banner.innerHTML = lvIsTester()
      ? '<div class="lv-banner lv-banner--green">🟢 <strong>Mode test actif</strong> sur ton compte — les courses ci-dessous sont réelles (test), tu peux les accepter.</div>'
      : '<div class="lv-banner lv-banner--green">🟢 <strong>Le service ouvre le 1er janvier.</strong> Ton espace livreur est prêt — les courses apparaîtront ici dès l\'ouverture.</div>';

    var isleCode = ISLAND_MAP[_currentTerritory] ? _currentTerritory : '971';
    var mapEl = document.getElementById('courierMap');
    var markers = {};
    var mapReady = ensureLeaflet().then(function () {
      var map = mapEl._ptMap;
      if (!map) {
        mapEl.innerHTML = '';
        map = window.L.map(mapEl, { scrollWheelZoom: false });
        window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
        }).addTo(map);
        window.L.marker([LV_DEPOT.lat, LV_DEPOT.lng]).addTo(map).bindPopup('Dépôt — Sainte-Anne');
        mapEl._ptMap = map;
      }
      if (mapEl._ptLayer) { map.removeLayer(mapEl._ptLayer); }
      mapEl._ptLayer = window.L.layerGroup().addTo(map);
      map.fitBounds(ISLAND_BOUNDS[isleCode] || ISLAND_BOUNDS['971'], { padding: [8, 8] });
      setTimeout(function () { map.invalidateSize(); map.fitBounds(ISLAND_BOUNDS[isleCode] || ISLAND_BOUNDS['971'], { padding: [8, 8] }); }, 80);
      return map;
    }).catch(function () { return null; });

    var ZCOLOR = ['#34d399', '#60a5fa', '#facc15', '#f87171'];
    function whenTxt(c) {
      return c.when === 'heure' ? ('à ' + escapeHTML(c.hour || '?')) : (c.when === 'matin' ? 'le matin' : "l'après-midi");
    }
    function showDetail(c, canAccept) {
      var det = document.getElementById('courierDetail');
      if (!det) return;
      var z = LV_BAREME[(c.zone || 1) - 1] || LV_BAREME[0];
      det.hidden = false;
      // Rémunération : payée en ligne par le client, GELÉE jusqu'à sa
      // confirmation de réception (photo à l'appui) — puis versée au livreur.
      var payLine = '';
      if (c.paid) {
        payLine = '💰 <strong>' + c.prix + ' €</strong> — '
          + (c.escrow === 'libere' ? 'versés sur ton compte ✅'
            : c.escrow === 'liberable' ? 'débloqués, versement en cours'
            : 'payés par le client, <strong>gelés</strong> jusqu\'à sa confirmation de réception') + '<br>';
      }
      det.innerHTML = '<h2 class="lv-h2">' + z.emoji + ' Course zone ' + c.zone + ' — <strong>' + c.prix + ' €</strong></h2>'
        + '<div class="lv-course__body">'
        + '📦 ' + escapeHTML(c.productTitle || '') + (c.qty > 1 ? ' × ' + c.qty : '') + '<br>'
        + '📍 ' + escapeHTML(c.address || '') + ' <em>(' + c.km + ' km de Sainte-Anne)</em><br>'
        + '📅 ' + (c.date ? escapeHTML(c.date) : 'au plus tôt') + ' ' + whenTxt(c) + '<br>'
        + payLine
        + '🚦 Statut : <strong>' + lvCourseStatusTxt(c, false) + '</strong>'
        + (c.acceptedByMe ? ' — ✅ acceptée par toi' : '') + '</div>'
        + (canAccept && c.status === 'en_attente'
          ? '<button type="button" class="btn primary" style="margin-top:.6rem" data-course-accept="' + escapeHTML(c.id) + '">✅ Accepter cette course</button>' : '')
        // Validation de livraison en 3 preuves : CODE DE REMISE (le client le
        // donne en main propre contre le colis), photo du colis remis, photo
        // large du chantier avec les colis posés. Sans les 3, pas de statut
        // « livrée », donc pas de déblocage d'argent.
        + (c.acceptedByMe && c.status === 'acceptee'
          ? '<div class="lv-proof">'
            + (c.hasScene ? '<p class="lv-hint">📷 Chantier photographié par le client (repère le point de dépôt) :</p><div class="lv-proof__img" id="courierSceneImg">Chargement…</div>' : '')
            + '<p class="lv-hint">✅ Pour valider la livraison, il te faut les <strong>3 preuves</strong> :</p>'
            + '<label class="lv-field"><span>🔑 Code de remise (6 chiffres) — le client te le donne contre le colis</span>'
            + '<input type="text" id="courierCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" class="lv-code-input"></label>'
            + '<input type="file" accept="image/*" capture="environment" id="courierProofFile" hidden>'
            + '<input type="file" accept="image/*" capture="environment" id="courierProofFile2" hidden>'
            + '<div class="lv-cta"><button type="button" class="btn" id="courierPhoto1Btn">📦 Photo du colis remis</button>'
            + '<button type="button" class="btn" id="courierPhoto2Btn">🏗️ Photo du chantier (colis posés, vue large)</button></div>'
            + '<div class="lv-cta"><button type="button" class="btn primary" id="courierProofBtn" disabled>✅ Marquer livrée</button>'
            + '<span class="lv-cta__note" id="courierProofSt" aria-live="polite"></span></div>'
            + '</div>' : '')
        // Vidéo de remise + litige (protection mutuelle — voir consentement)
        + (c.acceptedByMe && ['acceptee', 'livree', 'terminee'].indexOf(c.status) !== -1
          ? lvVideoDisputeHtml(c) : '');
      wireAccept(det);
      wireProof(det, c);
      wireVideoDispute(det, c, renderCourierSpace);
      det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function wireAccept(root) {
      var btns = root.querySelectorAll('[data-course-accept]');
      for (var i = 0; i < btns.length; i++) {
        (function (b) {
          b.onclick = function () {
            b.disabled = true; b.textContent = '…';
            jsonAuthHeaders().then(function (headers) {
              return fetch(apiBaseUrl() + '/api/contact', {
                method: 'POST', headers: headers,
                body: JSON.stringify({ type: 'course-accept', id: b.getAttribute('data-course-accept') })
              });
            }).then(function (r) { return r.json(); }).then(function (dd) {
              if (dd.ok) toast('Course acceptée ✅ — l\'artisan est prévenu par email', 'success');
              else toast(dd.error || 'Erreur', 'error');
              renderCourierSpace();
            }).catch(function () { toast('Erreur réseau', 'error'); renderCourierSpace(); });
          };
        })(btns[i]);
      }
    }
    function wireProof(root, c) {
      var btn = root.querySelector('#courierProofBtn');
      if (!btn) return;
      var st = root.querySelector('#courierProofSt');
      var codeEl = root.querySelector('#courierCode');
      // Photo du chantier fournie par le client à la commande (repère + comparaison)
      var sceneImg = root.querySelector('#courierSceneImg');
      if (sceneImg) {
        jsonAuthHeaders().then(function (headers) {
          return fetch(apiBaseUrl() + '/api/contact', {
            method: 'POST', headers: headers, body: JSON.stringify({ type: 'course-proof', id: c.id })
          });
        }).then(function (r) { return r.json(); }).then(function (d) {
          var src = d.ok && d.photos && d.photos.scene;
          sceneImg.innerHTML = src ? '<img src="' + src + '" alt="Chantier photographié par le client">' : 'Photo indisponible.';
        }).catch(function () { sceneImg.textContent = 'Photo indisponible (réseau).'; });
      }
      // 3 preuves : code + 2 photos — le bouton ne s'active que quand tout y est.
      var shots = { p1: null, p2: null };
      function ready() {
        var codeOk = !c.code || (codeEl && codeEl.value.replace(/\D/g, '').length === 6);
        btn.disabled = !(codeOk && shots.p1 && shots.p2);
      }
      function wireShot(btnId, fileId, slot, doneLabel) {
        var b = root.querySelector('#' + btnId);
        var f = root.querySelector('#' + fileId);
        if (!b || !f) return;
        b.onclick = function () { f.click(); };
        f.onchange = function () {
          var fl = f.files && f.files[0];
          if (!fl) return;
          b.disabled = true; b.textContent = '⏳ Compression…';
          lvCompressPhoto(fl).then(function (data) {
            shots[slot] = data;
            b.disabled = false; b.textContent = '✅ ' + doneLabel;
            ready();
          }).catch(function () {
            b.disabled = false; b.textContent = '❌ Réessaie — ' + doneLabel;
          });
        };
      }
      wireShot('courierPhoto1Btn', 'courierProofFile', 'p1', 'Colis remis');
      wireShot('courierPhoto2Btn', 'courierProofFile2', 'p2', 'Vue du chantier');
      if (codeEl) codeEl.oninput = ready;
      ready();
      btn.onclick = function () {
        btn.disabled = true;
        if (st) st.textContent = 'Envoi des preuves…';
        jsonAuthHeaders().then(function (headers) {
          return fetch(apiBaseUrl() + '/api/contact', {
            method: 'POST', headers: headers,
            body: JSON.stringify({
              type: 'course-deliver', id: c.id,
              code: codeEl ? codeEl.value.replace(/\D/g, '') : '',
              photo: shots.p1, photo2: shots.p2
            })
          });
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) {
            toast('📦 Livraison validée — le client doit confirmer pour débloquer tes ' + c.prix + ' €', 'success');
            renderCourierSpace();
          } else { btn.disabled = false; if (st) st.textContent = '❌ ' + (d.error || 'Erreur'); }
        }).catch(function (e) {
          btn.disabled = false;
          if (st) st.textContent = '❌ ' + ((e && e.message) || 'Erreur réseau.');
        });
      };
    }
    function courseCard(c, canAccept) {
      var z = LV_BAREME[(c.zone || 1) - 1] || LV_BAREME[0];
      return '<button type="button" class="lv-course lv-course--btn' + (c.status !== 'en_attente' ? ' lv-course--done' : '') + '" data-course-focus="' + escapeHTML(c.id) + '">'
        + '<span class="lv-course__head"><span>' + z.emoji + ' Zone ' + c.zone + ' · <strong>' + c.prix + ' €</strong></span>'
        + '<span class="lv-course__status">' + (c.status === 'en_attente' ? 'En attente' : (c.acceptedByMe ? '✅ Par toi' : escapeHTML(c.status))) + '</span></span>'
        + '<span class="lv-course__body">📍 ' + escapeHTML((c.address || '').slice(0, 60)) + ' <em>(' + c.km + ' km)</em></span>'
        + '</button>';
    }

    jsonAuthHeaders().then(function (headers) {
      return fetch(apiBaseUrl() + '/api/contact', { method: 'POST', headers: headers, body: JSON.stringify({ type: 'course-list' }) });
    }).then(function (r) { return r.json(); }).then(function (d) {
      var dispoEl = document.getElementById('courierDispo');
      var mineEl = document.getElementById('courierMine');
      if (!d.ok) {
        if (dispoEl) dispoEl.innerHTML = '<p class="lv-hint">Erreur : ' + escapeHTML(d.error || '?') + '</p>';
        if (mineEl) mineEl.innerHTML = '';
        return;
      }
      var canAccept = !!d.courier;
      var byId = {};
      (d.dispo || []).concat(d.mine || []).forEach(function (c) { byId[c.id] = c; });
      if (dispoEl) dispoEl.innerHTML = (d.dispo && d.dispo.length)
        ? d.dispo.map(function (c) { return courseCard(c, canAccept); }).join('')
        : '<p class="lv-hint">Aucune course disponible pour l\'instant.</p>';
      if (mineEl) mineEl.innerHTML = (d.mine && d.mine.length)
        ? d.mine.map(function (c) { return courseCard(c, false); }).join('')
        : '<p class="lv-hint">Aucune course pour l\'instant — commande une livraison depuis une fiche quincaillerie ou la page Livraison.</p>';
      // Clic carte de course -> détail + focus carte
      var cards = document.querySelectorAll('[data-course-focus]');
      for (var i = 0; i < cards.length; i++) {
        (function (btn) {
          btn.onclick = function () {
            var c = byId[btn.getAttribute('data-course-focus')];
            if (!c) return;
            showDetail(c, canAccept);
            mapReady.then(function (map) {
              if (map && isFinite(c.lat) && isFinite(c.lng)) {
                map.setView([c.lat, c.lng], 12);
                if (markers[c.id]) markers[c.id].openPopup();
              }
            });
          };
        })(cards[i]);
      }
      // Pastilles sur la carte (couleur de zone)
      mapReady.then(function (map) {
        if (!map || !mapEl._ptLayer) return;
        (d.dispo || []).concat((d.mine || []).filter(function (c) { return !byId[c.id] || true; })).forEach(function (c) {
          if (!isFinite(c.lat) || !isFinite(c.lng) || markers[c.id]) return;
          var col = ZCOLOR[(c.zone || 1) - 1] || ZCOLOR[0];
          var m = window.L.circleMarker([c.lat, c.lng], {
            radius: 9, color: col, weight: 2, fillColor: col, fillOpacity: c.status === 'en_attente' ? 0.75 : 0.3
          }).addTo(mapEl._ptLayer);
          m.bindPopup((c.status === 'en_attente' ? '📬 ' : '✅ ') + escapeHTML((c.address || '').slice(0, 60)) + '<br>Zone ' + c.zone + ' — ' + c.prix + ' €');
          m.on('click', function () { showDetail(c, canAccept); });
          markers[c.id] = m;
        });
      });
    }).catch(function () {
      var dispoEl = document.getElementById('courierDispo');
      if (dispoEl) dispoEl.innerHTML = '<p class="lv-hint">Erreur réseau.</p>';
    });
  }

  // ── MES LIVRAISONS : l'environnement CLIENT ────────────────────────────────
  // Carte de ses livraisons, détail (montant payé, dates, statut) et NOTATION
  // du livreur (étoiles + commentaire, une seule fois, visible dans l'admin).
  function renderClientDeliveries() {
    var back = document.getElementById('clientDelivBack');
    if (back) back.onclick = function () { history.length > 1 ? history.back() : (location.hash = '#/compte'); };
    var refresh = document.getElementById('clientDelivRefresh');
    if (refresh) refresh.onclick = renderClientDeliveries;
    var isleCode = ISLAND_MAP[_currentTerritory] ? _currentTerritory : '971';
    var mapEl = document.getElementById('clientDelivMap');
    var markers = {};
    var mapReady = ensureLeaflet().then(function () {
      var map = mapEl._ptMap;
      if (!map) {
        mapEl.innerHTML = '';
        map = window.L.map(mapEl, { scrollWheelZoom: false });
        window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
        }).addTo(map);
        mapEl._ptMap = map;
      }
      if (mapEl._ptLayer) map.removeLayer(mapEl._ptLayer);
      mapEl._ptLayer = window.L.layerGroup().addTo(map);
      map.fitBounds(ISLAND_BOUNDS[isleCode] || ISLAND_BOUNDS['971'], { padding: [8, 8] });
      setTimeout(function () { map.invalidateSize(); map.fitBounds(ISLAND_BOUNDS[isleCode] || ISLAND_BOUNDS['971'], { padding: [8, 8] }); }, 80);
      return map;
    }).catch(function () { return null; });

    var ZCOLOR = ['#34d399', '#60a5fa', '#facc15', '#f87171'];
    function whenTxt(c) {
      return c.when === 'heure' ? ('à ' + escapeHTML(c.hour || '?')) : (c.when === 'matin' ? 'le matin' : "l'après-midi");
    }
    function stars(n) {
      var s = '';
      for (var i = 1; i <= 5; i++) s += (i <= n ? '★' : '☆');
      return s;
    }
    function statusLabel(c) { return lvCourseStatusTxt(c, true); }
    function showDetail(c) {
      var det = document.getElementById('clientDelivDetail');
      if (!det) return;
      var z = LV_BAREME[(c.zone || 1) - 1] || LV_BAREME[0];
      det.hidden = false;
      // Argent : montant payé en ligne (produits + livraison) — les frais de
      // livraison sont gelés puis reversés au livreur après confirmation.
      var payLine = c.paid
        ? '💶 Payé en ligne : <strong>' + formatPrice((c.amountCents || 0) / 100) + '</strong> — dont '
          + c.prix + ' € de livraison '
          + (c.escrow === 'libere' ? 'versés au livreur ✅'
            : c.escrow === 'liberable' ? 'débloqués pour le livreur'
            : 'gelés jusqu\'à ta confirmation de réception') + '<br>'
        : '💶 Frais de livraison : <strong>' + c.prix + ' €</strong><br>';
      var h = '<h2 class="lv-h2">' + z.emoji + ' Livraison zone ' + c.zone + '</h2>'
        + '<div class="lv-course__body">'
        + '📦 ' + escapeHTML(c.productTitle || '') + (c.qty > 1 ? ' × ' + c.qty : '') + '<br>'
        + '📍 ' + escapeHTML(c.address || '') + ' <em>(' + c.km + ' km de Sainte-Anne)</em><br>'
        + '📅 ' + (c.date ? escapeHTML(c.date) : 'au plus tôt') + ' ' + whenTxt(c) + '<br>'
        + payLine
        + '🚦 ' + statusLabel(c) + '</div>';
      // CODE DE REMISE : le client le garde pour lui et ne le donne au livreur
      // qu'EN MAIN PROPRE, contre le colis — sans lui, le livreur ne peut pas
      // valider la livraison. Affiché en clair + en QR (généré 100 % en local).
      // Courses de TEST créées avant le paiement en ligne : ni code, ni
      // escrow. Le dire franchement plutôt que d'afficher un bloc vide.
      if (c.mine && !c.code && !c.paid && (c.status === 'en_attente' || c.status === 'acceptee')) {
        h += '<div class="lv-note lv-note--warn" style="margin-top:.7rem">ℹ️ <strong>Ancienne course de test</strong> — créée avant la mise en place du paiement en ligne : '
          + 'elle n\'a donc <strong>pas de code de remise</strong> et aucun montant n\'a été débité. '
          + 'Passe une nouvelle commande pour voir le code, le QR et la chaîne complète.</div>';
      }
      if (c.mine && c.code && (c.status === 'en_attente' || c.status === 'acceptee')) {
        h += '<div class="lv-handcode">'
          + '<div class="lv-handcode__row"><span class="lv-handcode__key">🔑 Code de remise</span>'
          + '<strong class="lv-handcode__num">' + escapeHTML(c.code) + '</strong></div>'
          + '<div class="lv-handcode__qr" id="clientCodeQR"></div>'
          + '<p class="lv-hint">Donne ce code au livreur (ou fais-lui scanner le QR) <strong>uniquement quand il te remet le colis</strong> — c\'est lui qui valide la livraison et débloque son paiement.</p>'
          + '</div>';
      }
      // Livrée → le client vérifie les PHOTOS du livreur (colis remis + vue du
      // chantier) et les compare à SA photo de commande, puis confirme : c'est
      // sa confirmation qui débloque les frais gelés (anti-arnaque des 2 côtés).
      if (c.status === 'livree' && c.mine) {
        h += '<div class="lv-proof" id="clientProofBox">'
          + (c.hasProof
            ? '<p class="lv-hint">📸 Preuves du livreur' + (c.hasScene ? ' + ta photo de commande — vérifie que tout correspond' : '') + ' :</p>'
              + '<div class="lv-proof__grid" id="clientProofImg">Chargement des photos…</div>'
            : '<p class="lv-hint">Le livreur n\'a pas joint de photo.</p>')
          + '<div class="lv-cta"><button type="button" class="btn primary" id="clientConfirmBtn">✅ Confirmer la réception — débloque le paiement du livreur</button>'
          + '<span class="lv-cta__note" id="clientConfirmSt" aria-live="polite"></span></div>'
          + '</div>';
      }
      // Vidéo + litige côté CLIENT (dès qu'un livreur est impliqué)
      if (c.mine && ['acceptee', 'livree', 'terminee'].indexOf(c.status) !== -1) {
        h += lvVideoDisputeHtml(c);
      }
      if (c.rating) {
        h += '<div class="lv-note lv-note--ok" style="margin-top:.7rem">⭐ Ta note : <strong>' + stars(c.rating) + '</strong>'
          + (c.ratingComment ? '<br>« ' + escapeHTML(c.ratingComment) + ' »' : '') + '</div>';
      } else if (c.status === 'acceptee' || c.status === 'livree' || c.status === 'terminee') {
        h += '<div class="lv-rate" data-rate-id="' + escapeHTML(c.id) + '">'
          + '<h3 class="lv-h3">Note ton livreur</h3>'
          + '<div class="lv-rate__stars" role="radiogroup" aria-label="Note sur 5">'
          + [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" class="lv-rate__star" data-star="' + i + '" aria-label="' + i + ' étoile' + (i > 1 ? 's' : '') + '">☆</button>'; }).join('')
          + '</div>'
          + '<textarea class="lv-rate__comment" maxlength="500" rows="2" placeholder="Un commentaire sur la livraison ? (optionnel)"></textarea>'
          + '<div class="lv-cta"><button type="button" class="btn primary lv-rate__send" disabled>Envoyer ma note</button>'
          + '<span class="lv-cta__note lv-rate__status" aria-live="polite"></span></div></div>';
      } else {
        h += '<p class="lv-hint" style="margin-top:.6rem">Tu pourras noter ton livreur dès qu\'il aura pris la course.</p>';
      }
      det.innerHTML = h;
      wireVideoDispute(det, c, renderClientDeliveries);
      // QR du code de remise (généré 100 % en local — ensureQRLib, jamais de tiers)
      var qrBox = det.querySelector('#clientCodeQR');
      if (qrBox && c.code) {
        ensureQRLib().then(function () {
          var url = cryptoLocalQR(c.code);
          if (url) qrBox.innerHTML = '<img src="' + url + '" alt="QR du code de remise ' + escapeHTML(c.code) + '">';
        }).catch(function () { /* le code en clair suffit */ });
      }
      // Photos de preuve + confirmation de réception (statut « livrée »)
      if (c.status === 'livree' && c.mine) {
        if (c.hasProof) {
          jsonAuthHeaders().then(function (headers) {
            return fetch(apiBaseUrl() + '/api/contact', {
              method: 'POST', headers: headers,
              body: JSON.stringify({ type: 'course-proof', id: c.id })
            });
          }).then(function (r) { return r.json(); }).then(function (d) {
            var box = document.getElementById('clientProofImg');
            if (!box) return;
            var ph = (d.ok && d.photos) || {};
            var cell = function (src, label) {
              return src ? '<figure class="lv-proof__cell"><img src="' + src + '" alt="' + label + '"><figcaption>' + label + '</figcaption></figure>' : '';
            };
            var html2 = cell(ph.remise, '📦 Colis remis (livreur)')
              + cell(ph.chantier, '🏗️ Vue du chantier, colis posés (livreur)')
              + cell(ph.scene, '📷 Ta photo à la commande');
            box.innerHTML = html2 || 'Photos indisponibles.';
          }).catch(function () {
            var box = document.getElementById('clientProofImg');
            if (box) box.textContent = 'Photos indisponibles (réseau).';
          });
        }
        var cf = det.querySelector('#clientConfirmBtn');
        var cfSt = det.querySelector('#clientConfirmSt');
        if (cf) cf.onclick = function () {
          cf.disabled = true;
          if (cfSt) cfSt.textContent = 'Confirmation…';
          jsonAuthHeaders().then(function (headers) {
            return fetch(apiBaseUrl() + '/api/contact', {
              method: 'POST', headers: headers,
              body: JSON.stringify({ type: 'course-confirm', id: c.id })
            });
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.ok) {
              toast('✅ Réception confirmée — le paiement du livreur est débloqué', 'success');
              renderClientDeliveries();
            } else { cf.disabled = false; if (cfSt) cfSt.textContent = '❌ ' + (d.error || 'Erreur'); }
          }).catch(function () { cf.disabled = false; if (cfSt) cfSt.textContent = 'Erreur réseau.'; });
        };
      }
      // Étoiles interactives
      var rate = det.querySelector('.lv-rate');
      if (rate) {
        var chosen = 0;
        var starBtns = rate.querySelectorAll('.lv-rate__star');
        var send = rate.querySelector('.lv-rate__send');
        var st = rate.querySelector('.lv-rate__status');
        function paint() {
          for (var i = 0; i < starBtns.length; i++) starBtns[i].textContent = (i < chosen) ? '★' : '☆';
          if (send) send.disabled = !chosen;
        }
        for (var i = 0; i < starBtns.length; i++) {
          (function (b) { b.onclick = function () { chosen = parseInt(b.getAttribute('data-star'), 10); paint(); }; })(starBtns[i]);
        }
        if (send) send.onclick = function () {
          send.disabled = true;
          if (st) st.textContent = 'Envoi…';
          jsonAuthHeaders().then(function (headers) {
            return fetch(apiBaseUrl() + '/api/contact', {
              method: 'POST', headers: headers,
              body: JSON.stringify({ type: 'course-rate', id: rate.getAttribute('data-rate-id'), rating: chosen, comment: rate.querySelector('.lv-rate__comment').value })
            });
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.ok) { toast('Merci pour ta note ⭐', 'success'); renderClientDeliveries(); }
            else { send.disabled = false; if (st) st.textContent = '❌ ' + (d.error || 'Erreur'); }
          }).catch(function () { send.disabled = false; if (st) st.textContent = 'Erreur réseau.'; });
        };
      }
      det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    jsonAuthHeaders().then(function (headers) {
      return fetch(apiBaseUrl() + '/api/contact', { method: 'POST', headers: headers, body: JSON.stringify({ type: 'course-list' }) });
    }).then(function (r) { return r.json(); }).then(function (d) {
      var listEl = document.getElementById('clientDelivList');
      if (!listEl) return;
      if (!d.ok) { listEl.innerHTML = '<p class="lv-hint">Erreur : ' + escapeHTML(d.error || '?') + '</p>'; return; }
      var mine = (d.mine || []).filter(function (c) { return c.mine; });
      if (!mine.length) {
        listEl.innerHTML = '<p class="lv-hint">Aucune livraison pour l\'instant. Commande ta quincaillerie et fais-toi livrer sur ton chantier — depuis une fiche produit ou la page <a href="#/livraison">Livraison quincaillerie</a>.</p>';
        return;
      }
      var byId = {};
      mine.forEach(function (c) { byId[c.id] = c; });
      listEl.innerHTML = mine.map(function (c) {
        var z = LV_BAREME[(c.zone || 1) - 1] || LV_BAREME[0];
        return '<button type="button" class="lv-course lv-course--btn' + (c.status !== 'en_attente' ? '' : '') + '" data-deliv-focus="' + escapeHTML(c.id) + '">'
          + '<span class="lv-course__head"><span>' + z.emoji + ' <strong>' + c.prix + ' €</strong> · ' + (c.date ? escapeHTML(c.date) : 'au plus tôt') + '</span>'
          + '<span class="lv-course__status">' + (c.rating ? '⭐ ' + c.rating + '/5' : statusLabel(c)) + '</span></span>'
          + '<span class="lv-course__body">📍 ' + escapeHTML((c.address || '').slice(0, 60)) + '</span>'
          + '</button>';
      }).join('');
      var cards = listEl.querySelectorAll('[data-deliv-focus]');
      for (var i = 0; i < cards.length; i++) {
        (function (btn) {
          btn.onclick = function () {
            var c = byId[btn.getAttribute('data-deliv-focus')];
            if (!c) return;
            showDetail(c);
            mapReady.then(function (map) {
              if (map && isFinite(c.lat) && isFinite(c.lng)) { map.setView([c.lat, c.lng], 12); if (markers[c.id]) markers[c.id].openPopup(); }
            });
          };
        })(cards[i]);
      }
      mapReady.then(function (map) {
        if (!map || !mapEl._ptLayer) return;
        mine.forEach(function (c) {
          if (!isFinite(c.lat) || !isFinite(c.lng)) return;
          var col = ZCOLOR[(c.zone || 1) - 1] || ZCOLOR[0];
          var m = window.L.circleMarker([c.lat, c.lng], { radius: 9, color: col, weight: 2, fillColor: col, fillOpacity: 0.7 }).addTo(mapEl._ptLayer);
          m.bindPopup(escapeHTML((c.address || '').slice(0, 60)) + '<br>' + c.prix + ' € — ' + (c.date || 'au plus tôt'));
          m.on('click', function () { showDetail(c); });
          markers[c.id] = m;
        });
      });
    }).catch(function () {
      var listEl = document.getElementById('clientDelivList');
      if (listEl) listEl.innerHTML = '<p class="lv-hint">Erreur réseau.</p>';
    });
  }

  function loadLvCourses() {
    var host = document.getElementById('lvCourses');
    if (!host) return;
    host.innerHTML = '<div class="lv-card"><h2 class="lv-h2">📬 Courses (mode test)</h2>'
      + '<p class="lv-hint">Ton compte est en <strong>mode test livreur</strong> — aucun document requis. Tu vois les courses créées et tu peux les accepter.</p>'
      + '<div id="lvCoursesList"><p class="lv-hint">Chargement…</p></div>'
      + '<button type="button" class="btn" id="lvCoursesRefresh" style="margin-top:.6rem">Rafraîchir</button></div>';
    var refresh = document.getElementById('lvCoursesRefresh');
    if (refresh) refresh.onclick = loadLvCourses;
    var list = document.getElementById('lvCoursesList');
    jsonAuthHeaders().then(function (headers) {
      return fetch(apiBaseUrl() + '/api/contact', {
        method: 'POST', headers: headers, body: JSON.stringify({ type: 'course-list' })
      });
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { list.innerHTML = '<p class="lv-hint">Erreur : ' + escapeHTML(d.error || '?') + '</p>'; return; }
      var whenTxt = function (c) {
        return c.when === 'heure' ? ('à ' + escapeHTML(c.hour || '?')) : (c.when === 'matin' ? 'le matin' : "l'après-midi");
      };
      var card = function (c, withAccept) {
        var z = LV_BAREME[(c.zone || 1) - 1] || LV_BAREME[0];
        return '<div class="lv-course' + (c.status !== 'en_attente' ? ' lv-course--done' : '') + '">'
          + '<div class="lv-course__head"><span>' + z.emoji + ' Zone ' + c.zone + ' · <strong>' + c.prix + ' €</strong></span>'
          + '<span class="lv-course__status">' + (c.status === 'en_attente' ? 'En attente' : (c.acceptedByMe ? '✅ Acceptée par toi' : escapeHTML(c.status))) + '</span></div>'
          + '<div class="lv-course__body">' + escapeHTML(c.productTitle || '') + (c.qty > 1 ? ' × ' + c.qty : '') + '<br>'
          + '📍 ' + escapeHTML(c.address || '') + ' <em>(' + c.km + ' km)</em><br>'
          + '📅 ' + (c.date ? escapeHTML(c.date) : 'au plus tôt') + ' ' + whenTxt(c) + '</div>'
          + (withAccept && c.status === 'en_attente'
            ? '<button type="button" class="btn primary" data-course-accept="' + escapeHTML(c.id) + '">✅ Accepter cette course</button>' : '')
          + '</div>';
      };
      var h = '';
      if (d.dispo && d.dispo.length) {
        h += '<h3 class="lv-h3">Disponibles</h3>' + d.dispo.map(function (c) { return card(c, true); }).join('');
      } else {
        h += '<p class="lv-hint">Aucune course en attente pour l\'instant. Crée-en une depuis une fiche produit (bloc « Livraison sur ton chantier »).</p>';
      }
      var doneMine = (d.mine || []).filter(function (c) { return c.status !== 'en_attente'; });
      if (doneMine.length) h += '<h3 class="lv-h3">Historique</h3>' + doneMine.map(function (c) { return card(c, false); }).join('');
      list.innerHTML = h;
      var btns = list.querySelectorAll('[data-course-accept]');
      for (var i = 0; i < btns.length; i++) {
        (function (b) {
          b.onclick = function () {
            b.disabled = true; b.textContent = '…';
            jsonAuthHeaders().then(function (headers) {
              return fetch(apiBaseUrl() + '/api/contact', {
                method: 'POST', headers: headers,
                body: JSON.stringify({ type: 'course-accept', id: b.getAttribute('data-course-accept') })
              });
            }).then(function (r) { return r.json(); }).then(function (dd) {
              if (dd.ok) { toast('Course acceptée ✅ — l\'artisan est prévenu par email', 'success'); }
              else { toast(dd.error || 'Erreur', 'error'); }
              loadLvCourses();
            }).catch(function () { toast('Erreur réseau', 'error'); loadLvCourses(); });
          };
        })(btns[i]);
      }
    }).catch(function () { list.innerHTML = '<p class="lv-hint">Erreur réseau.</p>'; });
  }

  function renderArtisans() {
    var back = document.getElementById('artisansBack');
    if (back) back.onclick = function () {
      if (history.length > 1) history.back();
      else location.hash = '#/';
    };
    var grid = $('#artisansGrid');
    if (!grid) return;
    grid.innerHTML = '<p class="no-results">Chargement...</p>';
    loadPartners().then(function (list) {
      if (!list.length) {
        grid.innerHTML = '<div class="artisans-empty">'
          + '<span class="artisans-empty__icon" aria-hidden="true">🛠️</span>'
          + '<p>Les premiers artisans partenaires arrivent bientôt.</p>'
          + '</div>';
        return;
      }
      grid.innerHTML = list.map(partnerCardHTML).join('');
    });
  }

  // Accueil : bandeau horizontal (même mécanique que « Nos produits »), réservé
  // aux partenaires BLACK (premium). Masqué tant qu'il n'y en a aucun.
  function renderPartnersStrip() {
    var section = document.getElementById('partnersStripSection');
    var track = document.getElementById('partnersStripTrack');
    if (!section || !track) return;
    loadPartners().then(function (list) {
      var blacks = list.filter(function (p) { return p.tier === 'black'; });
      if (!blacks.length) { section.hidden = true; return; }
      track.innerHTML = blacks.map(function (p) {
        var photos = (Array.isArray(p.photos) ? p.photos : []).filter(isSafePartnerImg);
        var name = escapeHTML(String(p.name || ''));
        var metier = escapeHTML(String(p.metier || ''));
        return '<a class="partner-strip-card" href="#/artisans" data-track="home:partner">'
          + (photos.length
              ? '<div class="partner-strip-card__img"><img src="' + photos[0] + '" alt="' + name + '" loading="lazy"></div>'
              : '<div class="partner-strip-card__img partner-strip-card__img--empty" aria-hidden="true">🛠️</div>')
          + '<span class="partner-strip-card__badge">★ Partenaire</span>'
          + '<span class="partner-strip-card__name">' + name + '</span>'
          + (metier ? '<span class="partner-strip-card__metier">' + metier + '</span>' : '')
          + '</a>';
      }).join('')
      + '<a class="partner-strip-card partner-strip-card--more" href="#/artisans">'
      + '<span class="partner-strip-card__more-icon" aria-hidden="true">→</span>'
      + '<span class="partner-strip-card__name">Voir tous nos artisans</span></a>';
      section.hidden = false;
    });
  }

  // ── Pré-inscription partenaire (Phase 3a — sans paiement) ──
  // Formulaire d'onboarding artisan. Envoi via /api/contact
  // (type=partner-application) : ZÉRO paiement, pure collecte + acceptation
  // horodatée des règles. Réutilise compressPartnerImage (logo). Le CTA reste
  // ACTIF seulement quand la case « j'accepte les règles » est cochée.

  var _partnerJoinBound = false;
  var _pjLogo = '';

  // Champs visibles selon la formule (décision user 25/07) :
  //   Basique / Pro → annuaire seul : PAS d'ÉPI, PAS de visibilité/pub.
  //   Gold → t-shirt + pantalon floqués (pas de pointure/gants) + réseaux
  //          (partage croisé du club Gold, 2×/mois) — PAS de pub gérée ni site.
  //   Black → tout (pack ÉPI complet, pub gérée Google/Meta, site vitrine).
  function applyTierFields(tier) {
    var noEquip = (tier === 'basique' || tier === 'pro');
    var isGold = (tier === 'gold');
    var el;
    if ((el = document.getElementById('pjFsEpi'))) el.hidden = noEquip;
    if ((el = document.getElementById('pjFsVisibilite'))) el.hidden = noEquip;
    if ((el = document.getElementById('pjFieldPointure'))) el.hidden = isGold;
    if ((el = document.getElementById('pjFieldGants'))) el.hidden = isGold;
    if ((el = document.getElementById('pjPubBlock'))) el.hidden = (tier !== 'black');
    if ((el = document.getElementById('pjSiteBlock'))) el.hidden = (tier !== 'black');
    if ((el = document.getElementById('pjEpiHint'))) {
      el.textContent = isGold
        ? 'Ton pack Gold : t-shirt + pantalon floqués aux couleurs de ton entreprise, renouvelés chaque année.'
        : 'Utile pour préparer ton pack complet (t-shirt, pantalon, chaussures, lunettes, gants). Tu pourras ajuster plus tard.';
    }
    if ((el = document.getElementById('pjVisHint'))) el.hidden = !isGold;
  }

  function setupPartnerJoinForm(slug) {
    var form = document.getElementById('partnerJoinForm');
    if (!form) return;

    // Pré-sélection de la formule depuis l'URL (#/rejoindre/black).
    var tierSel = document.getElementById('pjTier');
    var TIERS = { basique: 1, pro: 1, gold: 1, black: 1 };
    if (tierSel && slug && TIERS[slug]) tierSel.value = slug;
    applyTierFields(tierSel ? tierSel.value : 'black');

    if (_partnerJoinBound) return;
    _partnerJoinBound = true;

    if (tierSel) {
      tierSel.addEventListener('change', function () { applyTierFields(tierSel.value); });
    }

    // Bouton retour : revient à la page précédente (annuaire, abonnement…) ;
    // arrivée directe sans historique → repli sur l'annuaire artisans.
    var backBtn = document.getElementById('pjBack');
    if (backBtn) backBtn.onclick = function () {
      if (history.length > 1) history.back();
      else location.hash = '#/artisans';
    };

    var rulesChk = document.getElementById('pjRulesChk');
    var submit = document.getElementById('pjSubmit');
    var statusEl = document.getElementById('pjStatus');
    var hasSite = document.getElementById('pjHasSite');
    var siteUrlWrap = document.getElementById('pjSiteUrlWrap');
    var siteOptWrap = document.getElementById('pjSiteOptWrap');
    var logoFile = document.getElementById('pjLogoFile');
    var logoPreview = document.getElementById('pjLogoPreview');

    if (rulesChk && submit) {
      rulesChk.addEventListener('change', function () { submit.disabled = !rulesChk.checked; });
    }
    if (hasSite) {
      hasSite.addEventListener('change', function () {
        if (siteUrlWrap) siteUrlWrap.hidden = !hasSite.checked;
        if (siteOptWrap) siteOptWrap.hidden = !hasSite.checked;
      });
    }
    if (logoFile) {
      logoFile.addEventListener('change', function () {
        var f = logoFile.files && logoFile.files[0];
        if (!f) return;
        if (logoPreview) logoPreview.innerHTML = '<span class="img-busy">⏳ Traitement du logo…</span>';
        compressPartnerImage(f, 320, function (dataUrl) {
          if (!dataUrl) {
            if (logoPreview) logoPreview.innerHTML = '';
            toast('Image logo illisible', 'error');
            return;
          }
          _pjLogo = dataUrl;
          if (logoPreview) {
            logoPreview.innerHTML = '<span class="admin-partner-photo"><img src="' + _pjLogo + '" alt="Logo"><button type="button" id="pjLogoRemove" aria-label="Retirer le logo">✕</button></span>';
            var rm = document.getElementById('pjLogoRemove');
            if (rm) rm.onclick = function () { _pjLogo = ''; logoPreview.innerHTML = ''; };
          }
        });
        logoFile.value = '';
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'pj-status'; }

      function pjErr(msg) {
        if (submit) submit.disabled = false;
        if (statusEl) { statusEl.textContent = msg; statusEl.className = 'pj-status is-error'; }
      }

      var pubEl = form.querySelector('input[name="pjPub"]:checked');
      var data = {
        type: 'partner-application',
        name: (val('pjName')).trim(),
        metier: (val('pjMetier')).trim(),
        commune: (val('pjCommune')).trim(),
        email: (val('pjEmail')).trim(),
        phone: (val('pjPhone')).trim(),
        tier: (val('pjTier') || 'black'),
        sizes: {
          tshirt: val('pjTshirt'), pantalon: val('pjPantalon').trim(),
          pointure: val('pjPointure').trim(), gants: val('pjGants')
        },
        couleurs: val('pjCouleurs').trim(),
        facebook: val('pjFacebook').trim(),
        instagram: val('pjInstagram').trim(),
        pubChoice: pubEl ? pubEl.value : 'aucun',
        hasWebsite: !!(hasSite && hasSite.checked),
        websiteUrl: val('pjSiteUrl').trim(),
        siteOption: (hasSite && hasSite.checked) ? (val('pjSiteOpt') || 'refonte') : 'neuf',
        message: val('pjMessage').trim(),
        logo: _pjLogo,
        inviteCode: val('pjInviteCode').trim().toUpperCase(),
        rulesAccepted: !!(rulesChk && rulesChk.checked),
        website: val('pjHoneypot') // honeypot (piège à bots, doit rester vide)
      };

      // Ne transmettre QUE les champs qui existent dans la formule choisie :
      // les blocs masqués (applyTierFields) peuvent garder des saisies d'un
      // choix précédent — on les vide pour que la candidature reflète l'offre.
      if (data.tier === 'basique' || data.tier === 'pro') {
        data.sizes = { tshirt: '', pantalon: '', pointure: '', gants: '' };
        data.couleurs = ''; data.logo = '';
        data.facebook = ''; data.instagram = '';
        data.pubChoice = 'aucun'; data.hasWebsite = false;
        data.websiteUrl = ''; data.siteOption = 'aucun';
      } else if (data.tier === 'gold') {
        data.sizes.pointure = ''; data.sizes.gants = '';
        data.pubChoice = 'aucun'; data.hasWebsite = false;
        data.websiteUrl = ''; data.siteOption = 'aucun';
      }

      if (data.name.length < 2) return pjErr('Indique le nom de ton entreprise.');
      if (data.metier.length < 2) return pjErr('Indique ton métier.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return pjErr('Email invalide.');
      if (!data.rulesAccepted) return pjErr('Merci d\'accepter les règles du programme.');
      // Code d'invitation → compte OBLIGATOIRE (la carte sera rattachée à
      // l'uid vérifié ; sans session, le serveur ne peut rien rattacher).
      if (data.inviteCode && !_currentUser) {
        return pjErr('Avec un code d\'invitation, connecte-toi d\'abord à ton compte Pirates Tools (Menu → Compte → Créer un compte), puis reviens valider le formulaire.');
      }

      if (submit) submit.disabled = true;
      if (statusEl) { statusEl.textContent = 'Envoi…'; statusEl.className = 'pj-status'; }

      var apiBase = apiBaseUrl();
      // jsonAuthHeaders : joint le Bearer Firebase si connecté → le serveur
      // rattache la candidature à l'uid VÉRIFIÉ (jamais déclaratif).
      jsonAuthHeaders().then(function (headers) {
        return fetch(apiBase + '/api/contact', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(data)
        });
      })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
      .then(function (res) {
        if (res.ok && res.data && res.data.ok) {
          form.reset();
          _pjLogo = '';
          if (logoPreview) logoPreview.innerHTML = '';
          if (siteUrlWrap) siteUrlWrap.hidden = true;
          if (siteOptWrap) siteOptWrap.hidden = true;
          if (submit) submit.disabled = true;
          if (statusEl) {
            statusEl.textContent = 'Merci ! Ta pré-inscription est enregistrée. On te recontacte au lancement.';
            statusEl.className = 'pj-status is-ok';
          }
          toast('Pré-inscription envoyée ✓', 'success');
          track('partner_application', { tier: data.tier });
        } else {
          pjErr((res.data && res.data.error) || 'Envoi impossible, réessaie.');
        }
      })
      .catch(function (err) { pjErr('Erreur réseau : ' + err.message); });
    });

    function val(id) { var el = document.getElementById(id); return el ? (el.value || '') : ''; }
  }

  // ── Router (hash-based SPA) ────────────────────────────────

  var ROUTES = ['/', '/catalogue', '/produit', '/devis', '/compte', '/auth', '/abonnement',
                '/admin', '/merci', '/contact', '/favoris', '/artisans', '/rejoindre', '/livreur', '/livraison', '/mode-livraison', '/mes-livraisons',
                '/mentions-legales', '/confidentialite', '/cgv'];

  // Territory landing slugs (keys) → territory codes (values).
  // Used to expose SEO-friendly routes like #/guadeloupe.
  var TERRITORY_SLUGS = {
    'guadeloupe': '971',
    'martinique': '972',
    'guyane':     '973',
    'reunion':    '974',
    'mayotte':    '976'
  };

  function territoryCodeFromSlug(slug) {
    return Object.prototype.hasOwnProperty.call(TERRITORY_SLUGS, slug)
      ? TERRITORY_SLUGS[slug]
      : null;
  }

  function territorySlugFromCode(code) {
    for (var k in TERRITORY_SLUGS) {
      if (TERRITORY_SLUGS[k] === code) return k;
    }
    return null;
  }

  function parseHash() {
    var hash = location.hash.replace(/^#/, '') || '/';
    // Strip any query string carried in the hash (e.g. Stripe Checkout returns
    // to #/merci?session_id=…) so it doesn't break the exact ROUTES match.
    var qIndex = hash.indexOf('?');
    if (qIndex !== -1) hash = hash.substring(0, qIndex) || '/';
    if (hash.indexOf('/produit/') === 0) {
      return { route: '/produit', slug: hash.replace('/produit/', '') };
    }
    if (hash.indexOf('/abonnement/') === 0) {
      return { route: '/abonnement', slug: hash.replace('/abonnement/', '') };
    }
    // Pré-inscription partenaire avec formule pré-sélectionnée (#/rejoindre/black).
    if (hash.indexOf('/rejoindre/') === 0) {
      return { route: '/rejoindre', slug: hash.replace('/rejoindre/', '') };
    }
    // Territory landings: /guadeloupe, /martinique, /guyane, /reunion, /mayotte
    var terrSlug = hash.replace(/^\//, '');
    if (territoryCodeFromSlug(terrSlug)) {
      return { route: '/territoire', slug: terrSlug };
    }
    if (ROUTES.indexOf(hash) === -1) return { route: '/', slug: null };
    return { route: hash, slug: null };
  }

  var _lastRouteKey = null;

  function onRouteChange(isDataRefresh) {
    // Clôt le chrono « temps sur l'article » si on quittait une fiche produit.
    try { aFlushItemTime(); } catch (_) {}
    var parsed = parseHash();
    var route = parsed.route;

    // Quitte l'admin → libère le globe 3D (contexte WebGL, rAF).
    if (route !== '/admin') { try { destroyAdminGlobe(); } catch (_) {} }

    // Auth guards — n'appliquer la redirection qu'une fois la session Firebase
    // restaurée (_authReady). Sinon un utilisateur connecté qui recharge sur
    // #/compte est renvoyé vers #/auth puis ramené (double navigation/flicker).
    // renderAccount() no-op tant que _currentUser est null ; onAuthStateChanged
    // relance onRouteChange dès que l'auth est prête.
    if (route === '/compte' && _authReady && !_currentUser) { location.hash = '#/auth'; return; }
    if (route === '/mode-livraison' && _authReady && !_currentUser) { location.hash = '#/auth'; return; }
    if (route === '/mes-livraisons' && _authReady && !_currentUser) { location.hash = '#/auth'; return; }
    if (route === '/auth' && _authReady && _currentUser) { location.hash = '#/compte'; return; }

    // Cleanup PDP animation loop when leaving product page
    if (route !== '/produit') {
      if (pdpObserver) { pdpObserver.disconnect(); pdpObserver = null; }
      if (pdpScrollHandler) {
        pdpScrollHandler(); // calls the cleanup fn (stops rAF loop)
        pdpScrollHandler = null;
      }
      if (pdpResizeHandler) {
        window.removeEventListener('resize', pdpResizeHandler);
        pdpResizeHandler = null;
      }
      // Reset hero transforms
      var pdpViewer = document.getElementById('pdp3d');
      if (pdpViewer) { pdpViewer.style.transform = ''; pdpViewer.style.opacity = ''; pdpViewer.style.filter = ''; }
      var pdpInfo = document.getElementById('pdpHeroInfo');
      if (pdpInfo) { pdpInfo.style.transform = ''; pdpInfo.style.opacity = ''; }
    }

    // Show matching view, hide all others
    $$('.view[data-route]').forEach(function (v) {
      var match = (v.dataset.route === route);
      v.classList.toggle('view--active', match);
      v.classList.toggle('hidden', !match);
      v.style.display = match ? '' : 'none';
    });

    // Body page class
    var pageName = route === '/' ? 'home' : route.replace(/^\//, '');
    document.body.className = document.body.className.replace(/page-\S+/g, '').trim();
    document.body.classList.add('page-' + pageName);

    // Hero visibility (home only)
    if (dom.hero) {
      if (route === '/') {
        dom.hero.classList.remove('hero-out');
        dom.hero.style.display = '';
        if (dom.heroLogoContainer) {
          dom.heroLogoContainer.style.display = '';
          dom.heroLogoContainer.style.transform = 'scale(1)';
          dom.heroLogoContainer.style.opacity = '1';
          dom.heroLogoContainer.style.visibility = '';
        }
        startHeroLoop();
      } else {
        stopHeroLoop();
        dom.hero.classList.add('hero-out');
        dom.hero.style.display = 'none';
        if (dom.heroLogoContainer) dom.heroLogoContainer.style.display = 'none';
      }
    }

    // Close sidebar on any navigation
    closeMenu();

    // Retour en HAUT à chaque navigation. On réinitialise tout de suite (avant
    // le rendu de la vue) PUIS après le prochain paint via rAF : plusieurs vues
    // peignent leur contenu de façon asynchrone (filtre marque à +50 ms,
    // animations reveal, 3D paresseux) et un décalage de mise en page laissait
    // sinon un résidu de défilement (on n'atterrissait pas pile en haut).
    // behavior:'instant' FORCE le saut immédiat malgré `html{scroll-behavior:
    // smooth}` (sinon le défilement s'anime et le re-rendu de la vue interrompt
    // l'animation en cours de route → on n'atterrissait pas pile en haut).
    // isDataRefresh === true : re-rendu déclenché par l'arrivée tardive des
    // données (enrichissement /api/products), PAS une navigation → on NE défile
    // PAS (l'utilisateur a pu descendre entre-temps). Test STRICT obligatoire :
    // onRouteChange est branché tel quel sur 'hashchange' (l.4100), donc le
    // navigateur lui passe l'objet Event en 1er argument à chaque navigation —
    // un simple `!isDataRefresh` le prenait pour un data-refresh (truthy) et
    // sautait le scroll → on n'atterrissait plus en haut du catalogue.
    if (isDataRefresh !== true) {
      scrollTopNow();
      requestAnimationFrame(scrollTopNow);
    }

    // Route-specific rendering
    switch (route) {
      case '/':
        renderBrandGrid();
        renderHomeProducts();
        renderRecentlyViewed();
        setupPlans();
        setupHomeReviews();
        setup3DCarousel();
        setupNewsletterForm();
        renderPartnersStrip();
        break;
      case '/catalogue':
        renderCategoryChips();
        renderCategorySelect();
        // Ré-aligne chips + select sur le filtre PERSISTANT (currentFilter.
        // category survit à la navigation) : sans ça, revenir sur /catalogue
        // affichait la liste filtrée mais la chip « Tout » active (désynchro).
        syncFilters();
        renderProductList();
        break;
      case '/produit':
        if (parsed.slug) renderPDP(decodeURIComponent(parsed.slug));
        break;
      case '/devis':
        renderDevis();
        break;
      case '/compte':
        renderAccount();
        updateAccLivBtn();
        break;
      case '/auth':
        showAuthTab('login');
        break;
      case '/abonnement':
        // Sans slug (#/abonnement, ex. lien « Voir les formules ») : afficher
        // le premier tier — la page a un switcher en tête pour comparer les 4.
        // Avant, l'absence de slug laissait #aboContent VIDE (page blanche).
        renderAbonnement(parsed.slug || 'basique');
        break;
      case '/territoire':
        if (parsed.slug) handleTerritoryRoute(parsed.slug);
        break;
      case '/merci':
        handleMerciPage();
        break;
      case '/admin':
        renderAdmin();
        break;
      case '/contact':
        setupContactForm();
        break;
      case '/favoris':
        renderWishlist();
        break;
      case '/artisans':
        renderArtisans();
        break;
      case '/rejoindre':
        setupPartnerJoinForm(parsed.slug || '');
        break;
      case '/livreur':
        renderLivreur();
        break;
      case '/livraison':
        renderLivraison();
        break;
      case '/mode-livraison':
        renderCourierSpace();
        break;
      case '/mes-livraisons':
        renderClientDeliveries();
        break;
    }

    // Update <title> + meta description for SEO
    updateRouteMeta(route, parsed);

    // A11y (WCAG 2.4.3) : focus sur le titre de la vue affichée. Sans lui, le
    // lecteur d'écran n'annonce jamais la « nouvelle page » d'une SPA et le
    // focus clavier reste sur le lien cliqué — les h1[tabindex="-1"] des vues
    // existaient précisément pour ça mais n'étaient jamais focus.
    // UNIQUEMENT quand la route change réellement : onRouteChange est re-invoqué
    // sur la même route au boot (produits chargés, auth restaurée) et voler le
    // focus à ces moments-là casserait la tabulation initiale (skip-link).
    // preventScroll : scrollTopNow gère déjà le défilement.
    var routeKey = route + '|' + (parsed.slug || '');
    var routeChanged = (routeKey !== _lastRouteKey);
    if (_lastRouteKey !== null && routeChanged) {
      var activeView = document.querySelector('.view:not(.hidden)');
      var viewTitle = activeView ? activeView.querySelector('h1') : null;
      if (viewTitle) {
        if (!viewTitle.hasAttribute('tabindex')) viewTitle.setAttribute('tabindex', '-1');
        try { viewTitle.focus({ preventScroll: true }); } catch (_) { viewTitle.focus(); }
      }
    }
    _lastRouteKey = routeKey;

    // Analytics : page view + territory view — UNIQUEMENT quand la route change
    // réellement (routeKey). onRouteChange est re-invoqué sur la MÊME route par
    // l'arrivée des produits et la restauration de l'auth : sans ce garde,
    // chaque cold load comptait 2-3 page_view (stats admin gonflées).
    if (typeof track === 'function' && routeChanged) {
      track('page_view', { route: route, slug: parsed.slug || null });
      if (route === '/territoire' && parsed.slug) {
        track('view_territory', { code: territoryCodeFromSlug(parsed.slug) });
      }
    }
  }

  // ── Hero logo scroll animation (lerp 60fps) ────────────────

  var heroLerp = { scale: 1, opacity: 1 };
  var heroRAF = null;
  var HERO_LERP_SPEED = 0.35;

  function heroTick() {
    if (!dom.heroLogoContainer) return;
    if (parseHash().route !== '/') {
      heroRAF = null;
      return;
    }

    var y = window.scrollY;
    var threshold = 80;
    var maxScroll = 450;

    // Target values
    var tScale, tOpacity;
    if (y <= threshold) {
      tScale = 1;
      tOpacity = 1;
    } else if (y >= maxScroll) {
      tScale = 6;
      tOpacity = 0;
    } else {
      var p = (y - threshold) / (maxScroll - threshold);
      // Ease-out cubic for smoother feel
      var pE = 1 - Math.pow(1 - p, 3);
      tScale = 1 + pE * 5;
      tOpacity = 1 - pE;
    }

    var dS = tScale - heroLerp.scale;
    var dO = tOpacity - heroLerp.opacity;
    var settled = Math.abs(dS) < 0.001 && Math.abs(dO) < 0.001;

    if (settled) {
      heroLerp.scale = tScale;
      heroLerp.opacity = tOpacity;
    } else {
      heroLerp.scale += dS * HERO_LERP_SPEED;
      heroLerp.opacity += dO * HERO_LERP_SPEED;
      dom.heroLogoContainer.style.transform = 'scale(' + heroLerp.scale.toFixed(4) + ')';
      dom.heroLogoContainer.style.opacity = heroLerp.opacity.toFixed(4);
    }

    // Toggle visibility when fully hidden
    if (heroLerp.opacity <= 0.001) {
      dom.heroLogoContainer.style.visibility = 'hidden';
      dom.heroLogoContainer.style.pointerEvents = 'none';
    } else {
      dom.heroLogoContainer.style.visibility = '';
      dom.heroLogoContainer.style.pointerEvents = '';
    }

    if (settled) {
      heroRAF = null;
      return;
    }
    heroRAF = requestAnimationFrame(heroTick);
  }

  function startHeroLoop() {
    if (!heroRAF) {
      heroRAF = requestAnimationFrame(heroTick);
    }
  }

  // Wake hero loop on scroll
  window.addEventListener('scroll', function () {
    if (!heroRAF && parseHash().route === '/') {
      heroRAF = requestAnimationFrame(heroTick);
    }
  }, { passive: true });

  function stopHeroLoop() {
    if (heroRAF) {
      cancelAnimationFrame(heroRAF);
      heroRAF = null;
    }
  }

  // ── Piège de focus (a11y, WCAG 2.4.3) ──────────────────────
  // aria-modal="true" promet que la tabulation reste confinée au dialogue et
  // que le focus revient au déclencheur à la fermeture — c'est ce que ce
  // utilitaire implémente réellement (modale de paiement + menu latéral).
  // Retourne une fonction release() : retire le handler et restaure le focus.
  function trapFocus(container) {
    var previous = document.activeElement;
    function focusables() {
      var sel = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
      return Array.prototype.filter.call(container.querySelectorAll(sel), function (el) {
        // getClientRects : vrai test de visibilité (offsetParent est null pour
        // les descendants de position:fixed → inutilisable ici).
        return !el.disabled && el.getClientRects().length > 0;
      });
    }
    function onKeydown(e) {
      if (e.key !== 'Tab') return;
      var els = focusables();
      if (!els.length) return;
      var first = els[0];
      var last = els[els.length - 1];
      var inside = container.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', onKeydown, true);
    var target = focusables()[0] || container;
    try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    return function release() {
      document.removeEventListener('keydown', onKeydown, true);
      if (previous && typeof previous.focus === 'function') {
        try { previous.focus({ preventScroll: true }); } catch (_) {}
      }
    };
  }

  // ── Sidebar menu ───────────────────────────────────────────

  var menuOpen = false;
  var _menuTrapRelease = null;

  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;
    if (dom.sideMenu) {
      dom.sideMenu.classList.add('open');
      dom.sideMenu.setAttribute('aria-hidden', 'false');
    }
    if (dom.menuBackdrop) dom.menuBackdrop.style.display = 'block';
    if (dom.menuToggle) dom.menuToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
    if (dom.sideMenu) _menuTrapRelease = trapFocus(dom.sideMenu);
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    if (dom.sideMenu) {
      dom.sideMenu.classList.remove('open');
      dom.sideMenu.setAttribute('aria-hidden', 'true');
    }
    if (dom.menuBackdrop) dom.menuBackdrop.style.display = 'none';
    if (dom.menuToggle) dom.menuToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
    if (_menuTrapRelease) { _menuTrapRelease(); _menuTrapRelease = null; }
  }

  function toggleMenu() {
    menuOpen ? closeMenu() : openMenu();
  }

  // ── Auth (Firebase) ────────────────────────────────────────

  // Module-scope state
  var _fb = null;                 // Firebase API namespace (window.PT_FIREBASE)
  var _currentUser = null;        // Firebase Auth user (or null)
  var _userProfile = null;        // Cached Firestore profile doc
  var _authReady = false;         // True after first onAuthStateChanged callback

  // Map Firebase error codes -> French user messages
  function fbErrorMessage(err) {
    var code = (err && err.code) || '';
    var map = {
      'auth/email-already-in-use': 'Cet email est déjà utilisé',
      'auth/invalid-email': 'Email invalide',
      'auth/weak-password': 'Mot de passe trop faible (min. 6 caractères)',
      'auth/user-not-found': 'Aucun compte avec cet email',
      'auth/wrong-password': 'Mot de passe incorrect',
      'auth/invalid-credential': 'Email ou mot de passe incorrect',
      'auth/too-many-requests': 'Trop de tentatives. Réessaie plus tard',
      'auth/network-request-failed': 'Problème de réseau',
      'auth/requires-recent-login': 'Reconnecte-toi pour effectuer cette action',
      'auth/missing-password': 'Mot de passe requis',
      'auth/popup-closed-by-user': 'Fenêtre fermée'
    };
    return map[code] || (err && err.message) || 'Une erreur est survenue';
  }

  // H4 — anti-énumération de comptes. À la CONNEXION, ne jamais distinguer
  // « aucun compte » de « mot de passe incorrect » : sinon un attaquant sait
  // quels emails sont clients (base de phishing / credential-stuffing). Tous
  // les échecs d'identification renvoient le même message générique ; seules
  // les erreurs non liées à l'existence du compte (réseau, quota) restent
  // explicites. Complément recommandé : activer « Email Enumeration
  // Protection » dans la console Firebase.
  function authLoginError(err) {
    var code = (err && err.code) || '';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password'
        || code === 'auth/invalid-credential' || code === 'auth/invalid-email'
        || code === 'auth/missing-password' || code === 'auth/missing-email') {
      return 'Email ou mot de passe incorrect';
    }
    return fbErrorMessage(err);
  }

  // Loading state on a submit button
  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.classList.add('is-loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  }

  // Wait for the firebase-init.js module to expose window.PT_FIREBASE
  function whenFirebaseReady(cb) {
    if (window.PT_FIREBASE) { cb(window.PT_FIREBASE); return; }
    window.addEventListener('pt-firebase-ready', function () {
      cb(window.PT_FIREBASE);
    }, { once: true });
  }

  var _authInited = false;
  var _authUnsub = null;
  function initAuth() {
    if (_authInited) return;
    _authInited = true;
    whenFirebaseReady(function (fb) {
      _fb = fb;
      if (!fb.configured) {
        // Firebase not yet configured by site owner — keep app usable
        _authReady = true;
        return;
      }
      // Listen to auth state changes (store unsubscribe for cleanup)
      if (_authUnsub) _authUnsub();
      _authUnsub = fb.onAuthStateChanged(fb.auth, function (user) {
        _currentUser = user || null;
        _authReady = true;
        if (user) {
          // Load Firestore profile in background
          loadUserProfile().then(function () {
            // Re-render account if currently visible
            if (location.hash === '#/compte') renderAccount();
          });
        } else {
          _userProfile = null;
        }
        // If we're on a guarded route, re-evaluate
        if (location.hash === '#/compte' && !user) {
          location.hash = '#/auth';
        } else if (location.hash === '#/auth' && user) {
          location.hash = '#/compte';
        }
      });
    });
  }

  // Read user profile from Firestore (creates default if missing)
  function loadUserProfile() {
    if (!_fb || !_currentUser) return Promise.resolve(null);
    var ref = _fb.doc(_fb.db, 'users', _currentUser.uid);
    return _fb.getDoc(ref).then(function (snap) {
      if (snap.exists()) {
        _userProfile = snap.data();
      } else {
        _userProfile = {
          name: _currentUser.displayName || '',
          email: _currentUser.email || '',
          phone: '',
          address: '',
          avatar: '',
          loyalty: 0,
          createdAt: _fb.serverTimestamp()
        };
        return _fb.setDoc(ref, _userProfile);
      }
    }).catch(function (err) {
      console.warn('[Auth] loadUserProfile failed:', err);
    });
  }

  // ── Handlers ───────────────────────────────────────────────

  var _regIsland = '';   // île choisie à l'inscription (cartes dorées) → territoire

  function handleRegister(e) {
    e.preventDefault();
    if (!_fb || !_fb.configured) { toast('Authentification non configuree', 'error'); return; }

    var name = (dom.regName ? dom.regName.value : '').trim();
    var email = (dom.regEmail ? dom.regEmail.value : '').trim().toLowerCase();
    var pwd = dom.regPwd ? dom.regPwd.value : '';

    if (!name || !email || !pwd) { toast('Remplissez tous les champs', 'error'); return; }
    if (pwd.length < 6) { toast('Mot de passe trop court (min. 6)', 'error'); return; }
    if (!_regIsland) { toast('Choisis ton île 🏝️', 'error'); return; }

    setBtnLoading(dom.regSubmit, true);
    _fb.createUserWithEmailAndPassword(_fb.auth, email, pwd)
      .then(function (cred) {
        // Set displayName on auth profile
        return _fb.updateProfile(cred.user, { displayName: name }).then(function () { return cred.user; });
      })
      .then(function (user) {
        // Create Firestore profile
        var ref = _fb.doc(_fb.db, 'users', user.uid);
        _userProfile = {
          name: name,
          email: email,
          phone: '',
          address: '',
          avatar: '',
          loyalty: 0,
          createdAt: _fb.serverTimestamp()
        };
        return _fb.setDoc(ref, _userProfile).then(function () { return user; });
      })
      .then(function (user) {
        // Send verification email (non-blocking)
        _fb.sendEmailVerification(user).catch(function (e) { console.warn('verify email:', e); });
        // Applique l'île choisie comme territoire du site (octroi/TVA, persisté).
        if (_regIsland && getTerritory(_regIsland)) setTerritory(_regIsland);
        toast('Compte créé, bienvenue ' + name + ' !', 'success');
        location.hash = '#/compte';
      })
      .catch(function (err) {
        toast(fbErrorMessage(err), 'error');
      })
      .finally(function () {
        setBtnLoading(dom.regSubmit, false);
      });
  }

  function handleLogin(e) {
    e.preventDefault();
    if (!_fb || !_fb.configured) { toast('Authentification non configuree', 'error'); return; }

    var email = (dom.loginEmail ? dom.loginEmail.value : '').trim().toLowerCase();
    var pwd = dom.loginPwd ? dom.loginPwd.value : '';
    if (!email || !pwd) { toast('Remplissez tous les champs', 'error'); return; }

    setBtnLoading(dom.loginSubmit, true);
    _fb.signInWithEmailAndPassword(_fb.auth, email, pwd)
      .then(function (cred) {
        toast('Bienvenue, ' + (cred.user.displayName || cred.user.email), 'success');
        location.hash = '#/compte';
      })
      .catch(function (err) {
        toast(authLoginError(err), 'error'); // message générique (anti-énumération)
      })
      .finally(function () {
        setBtnLoading(dom.loginSubmit, false);
      });
  }

  function handleForgotPassword(e) {
    e.preventDefault();
    if (!_fb || !_fb.configured) { toast('Authentification non configuree', 'error'); return; }

    var email = (dom.forgotEmail ? dom.forgotEmail.value : '').trim().toLowerCase();
    if (!email) { toast('Entre ton email', 'error'); return; }

    // H4 — anti-énumération : on affiche le MÊME message que l'email existe ou
    // non. Le succès et l'erreur user-not-found aboutissent à un message neutre
    // (« si un compte existe… ») ; on ne révèle jamais l'existence d'un compte.
    var neutralMsg = 'Si un compte est associé à cet email, un lien de réinitialisation vient d\'être envoyé.';
    function forgotDone() {
      toast(neutralMsg, 'success');
      if (dom.authForgotPanel) dom.authForgotPanel.hidden = true;
      if (dom.forgotEmail) dom.forgotEmail.value = '';
    }
    setBtnLoading(dom.forgotSubmit, true);
    _fb.sendPasswordResetEmail(_fb.auth, email)
      .then(forgotDone)
      .catch(function (err) {
        var code = (err && err.code) || '';
        // user-not-found → traité comme un succès neutre (pas de fuite).
        if (code === 'auth/user-not-found') { forgotDone(); return; }
        // Erreurs non révélatrices (format, réseau, quota) : message explicite.
        toast(fbErrorMessage(err), 'error');
      })
      .finally(function () {
        setBtnLoading(dom.forgotSubmit, false);
      });
  }

  function showAuthTab(tab) {
    if (dom.authLoginTab) {
      dom.authLoginTab.classList.toggle('active', tab === 'login');
      dom.authLoginTab.setAttribute('aria-selected', tab === 'login' ? 'true' : 'false');
    }
    if (dom.authRegisterTab) {
      dom.authRegisterTab.classList.toggle('active', tab === 'register');
      dom.authRegisterTab.setAttribute('aria-selected', tab === 'register' ? 'true' : 'false');
    }
    if (dom.authLogin) dom.authLogin.style.display = tab === 'login' ? '' : 'none';
    if (dom.authRegister) dom.authRegister.style.display = tab === 'register' ? '' : 'none';
    // Always close forgot panel on tab switch
    if (dom.authForgotPanel) dom.authForgotPanel.hidden = true;
  }

  // ── Account page ───────────────────────────────────────────

  // ── Ma carte artisan (self-service photos/logo — exigence user 25/07) ──
  // La carte annuaire liée au compte (liaison posée par l'admin) est éditable
  // par l'artisan lui-même : logo + photos UNIQUEMENT, via contact.js
  // (Bearer vérifié serveur). Masqué si aucune carte liée.
  var _accCardState = null;
  var _accCardLogoBusy = false;
  var _accCardPhotosBusy = 0;

  function loadMyPartnerCard() {
    var wrap = document.getElementById('accPartnerCard');
    if (!wrap || !_currentUser) return;
    jsonAuthHeaders().then(function (headers) {
      return fetch(apiBaseUrl() + '/api/contact', {
        method: 'POST', headers: headers,
        body: JSON.stringify({ type: 'partner-card-get' })
      });
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.card) { wrap.hidden = true; return; }
      _accCardState = data.card;
      wrap.hidden = false;
      renderMyPartnerCard();
    }).catch(function () { wrap.hidden = true; });
  }

  function renderMyPartnerCard() {
    var body = document.getElementById('accPartnerBody');
    var c = _accCardState;
    if (!body || !c) return;
    body.innerHTML = '<p style="opacity:.85;margin:0 0 .8rem">'
      + escapeHTML((c.tier || '').toUpperCase()) + ' — <strong>' + escapeHTML(c.name) + '</strong>'
      + (c.metier ? ' (' + escapeHTML(c.metier) + ')' : '')
      + '. Tu peux changer ton logo et tes photos quand tu veux — le reste (texte, lien…) passe par nous sur WhatsApp.</p>'
      + '<p style="font-weight:600;margin:.2rem 0 .3rem">Logo</p>'
      + '<div id="accCardLogoBox" class="admin-partner-photos"></div>'
      + '<input type="file" id="accCardLogoFile" accept="image/*">'
      + '<p style="font-weight:600;margin:.9rem 0 .3rem">Photos (' + (c.photos || []).length + '/' + c.photosMax + ')</p>'
      + (c.photosMax > 0
          ? '<div id="accCardPhotosBox" class="admin-partner-photos"></div><input type="file" id="accCardPhotoFiles" accept="image/*" multiple>'
          : '<p class="admin-hint">Ta formule n\'inclut pas de photos dans l\'annuaire.</p>')
      + '<div class="actions" style="margin-top:1rem"><button type="button" class="btn primary" id="accCardSave">Enregistrer ma carte</button></div>'
      + '<span id="accCardStatus" class="admin-row__status" aria-live="polite"></span>';
    renderMyPartnerMedia();

    var logoFile = document.getElementById('accCardLogoFile');
    if (logoFile) logoFile.onchange = function () {
      var f = logoFile.files && logoFile.files[0];
      if (!f) return;
      _accCardLogoBusy = true; renderMyPartnerMedia();
      compressPartnerImage(f, 320, function (dataUrl) {
        _accCardLogoBusy = false;
        if (dataUrl) c.logo = dataUrl; else toast('Image logo illisible', 'error');
        renderMyPartnerMedia();
      });
      logoFile.value = '';
    };
    var photoFiles = document.getElementById('accCardPhotoFiles');
    if (photoFiles) photoFiles.onchange = function () {
      var files = Array.prototype.slice.call(photoFiles.files || []);
      photoFiles.value = '';
      _accCardPhotosBusy += files.length; renderMyPartnerMedia();
      files.forEach(function (f) {
        compressPartnerImage(f, 900, function (dataUrl) {
          _accCardPhotosBusy = Math.max(0, _accCardPhotosBusy - 1);
          if (dataUrl && c.photos.length < c.photosMax) c.photos.push(dataUrl);
          else if (dataUrl) toast('Maximum ' + c.photosMax + ' photo(s) pour ta formule', 'error');
          else toast('Image illisible : ' + f.name, 'error');
          renderMyPartnerMedia();
        });
      });
    };
    var save = document.getElementById('accCardSave');
    if (save) save.onclick = function () {
      var statusEl = document.getElementById('accCardStatus');
      save.disabled = true;
      if (statusEl) { statusEl.textContent = 'Enregistrement…'; statusEl.className = 'admin-row__status'; }
      jsonAuthHeaders().then(function (headers) {
        return fetch(apiBaseUrl() + '/api/contact', {
          method: 'POST', headers: headers,
          body: JSON.stringify({ type: 'partner-card-media', logo: c.logo || '', photos: c.photos || [] })
        });
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
      .then(function (res) {
        save.disabled = false;
        if (res.ok && res.data.ok) {
          if (statusEl) { statusEl.textContent = 'Enregistré ✓ — visible sur le site dans quelques secondes.'; }
          toast('Carte mise à jour ✓', 'success');
        } else {
          if (statusEl) { statusEl.textContent = 'Erreur : ' + ((res.data && res.data.error) || 'réessaie'); statusEl.className = 'admin-row__status is-error'; }
        }
      }).catch(function (err) {
        save.disabled = false;
        if (statusEl) { statusEl.textContent = 'Erreur réseau : ' + err.message; statusEl.className = 'admin-row__status is-error'; }
      });
    };
  }

  function renderMyPartnerMedia() {
    var c = _accCardState;
    if (!c) return;
    var logoBox = document.getElementById('accCardLogoBox');
    if (logoBox) {
      logoBox.innerHTML = (c.logo
        ? '<span class="admin-partner-photo"><img src="' + c.logo + '" alt="Logo"><button type="button" data-acc-logo-rm aria-label="Retirer le logo">✕</button></span>' : '')
        + (_accCardLogoBusy ? '<span class="img-busy">⏳ Traitement du logo…</span>' : '');
      var rm = logoBox.querySelector('[data-acc-logo-rm]');
      if (rm) rm.onclick = function () { c.logo = ''; renderMyPartnerMedia(); };
    }
    var photosBox = document.getElementById('accCardPhotosBox');
    if (photosBox) {
      photosBox.innerHTML = (c.photos || []).map(function (src, i) {
        return '<span class="admin-partner-photo"><img src="' + src + '" alt="Photo ' + (i + 1) + '"><button type="button" data-acc-photo-rm="' + i + '" aria-label="Retirer la photo ' + (i + 1) + '">✕</button></span>';
      }).join('')
        + (_accCardPhotosBusy > 0 ? '<span class="img-busy">⏳ Traitement de ' + _accCardPhotosBusy + ' image(s)…</span>' : '');
      photosBox.querySelectorAll('[data-acc-photo-rm]').forEach(function (btn) {
        btn.onclick = function () {
          c.photos.splice(Number(btn.getAttribute('data-acc-photo-rm')), 1);
          renderMyPartnerMedia();
        };
      });
    }
  }

  function renderAccount() {
    if (!_currentUser) return;
    var p = _userProfile || {};

    if (dom.accName) dom.accName.value = p.name || _currentUser.displayName || '';
    if (dom.accEmail) dom.accEmail.value = p.email || _currentUser.email || '';
    if (dom.accPhone) dom.accPhone.value = p.phone || '';
    if (dom.accAddress) dom.accAddress.value = p.address || '';
    if (p.avatar && dom.accAvatarImg) dom.accAvatarImg.src = p.avatar;

    updateCartUI();

    // Fidélité — SOURCE UNIQUE : la dépense vérifiée (pt:loyalty = cache
    // synchronisé sur le serveur à chaque devis de paiement). L'ancien champ
    // profil `loyalty` (points crédités sur simple devis WhatsApp) est legacy
    // et n'est plus affiché : deux compteurs contradictoires = zéro confiance.
    var lstate = getLoyaltyState(0);
    var nextAt = lstate.nextTierAt || 0;
    var pct = nextAt > 0 ? Math.min(100, Math.round((lstate.totalSpent / nextAt) * 100)) : 100;
    updateLoyaltyBar(pct);
    if (dom.accLoyaltyTxt) {
      dom.accLoyaltyTxt.innerHTML = lstate.tierIcon + ' ' + escapeHTML(lstate.tierLabel)
        + ' · ' + formatPrice(lstate.totalSpent) + ' cumulés'
        + (lstate.discountPct > 0 ? ' · −' + lstate.discountPct + ' % au paiement carte' : '');
    }

    // Hero header
    var heroName = document.getElementById('accHeroName');
    var heroEmail = document.getElementById('accHeroEmail');
    if (heroName) heroName.textContent = p.name || _currentUser.displayName || 'Pirate';
    if (heroEmail) heroEmail.textContent = p.email || _currentUser.email || '';

    // Email verification banner
    if (dom.accVerifyBanner) {
      dom.accVerifyBanner.hidden = !!_currentUser.emailVerified;
    }

    // Order history (async)
    renderOrderHistory();

    // Carte artisan liée au compte (self-service photos/logo, masqué sinon)
    loadMyPartnerCard();
  }

  function renderOrderHistory() {
    if (!dom.accHistory || !_fb || !_currentUser) return;
    dom.accHistory.innerHTML = '<p style="opacity:.5;text-align:center;padding:.5rem 0">Chargement...</p>';

    var ordersRef = _fb.collection(_fb.db, 'users', _currentUser.uid, 'orders');
    var q = _fb.query(ordersRef, _fb.orderBy('date', 'desc'), _fb.limit(20));

    _fb.getDocs(q).then(function (snap) {
      if (snap.empty) {
        dom.accHistory.innerHTML = '<p style="opacity:.6;text-align:center;padding:.5rem 0">Aucun devis envoyé pour le moment.</p>';
        return;
      }
      var html = '';
      var idx = 0;
      var total = snap.size;
      snap.forEach(function (docSnap) {
        var o = docSnap.data();
        var dateMs = o.date && o.date.toMillis ? o.date.toMillis() : (o.date || Date.now());
        html += '<div style="background:rgba(139,92,246,.04);border:1px solid rgba(139,92,246,.12);border-radius:12px;padding:.8rem 1rem">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">'
          + '<strong style="font-size:.9rem">Devis #' + (total - idx) + '</strong>'
          + '<span style="font-size:.78rem;color:var(--muted)">' + formatReviewDate(dateMs) + '</span>'
          + '</div>'
          + '<p style="font-size:.85rem;opacity:.8;margin:0">' + o.items + ' article' + (o.items > 1 ? 's' : '') + ' — ' + formatPrice(o.total) + '</p>'
          + '</div>';
        idx++;
      });
      dom.accHistory.innerHTML = html;
    }).catch(function (err) {
      console.warn('[Auth] order history failed:', err);
      dom.accHistory.innerHTML = '<p style="opacity:.6;text-align:center;padding:.5rem 0;color:#f88">Erreur de chargement.</p>';
    });
  }

  function updateLoyaltyBar(val) {
    if (dom.accFill) dom.accFill.style.width = val + '%';
    if (dom.accCursor) dom.accCursor.style.left = val + '%';
  }

  function handleAccountSave(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!_fb || !_currentUser) return;

    var name = (dom.accName ? dom.accName.value : '').trim();
    var newEmail = (dom.accEmail ? dom.accEmail.value : '').trim().toLowerCase();
    var phone = (dom.accPhone ? dom.accPhone.value : '').trim();
    var address = (dom.accAddress ? dom.accAddress.value : '').trim();

    // C5 — ORDRE STRICT pour l'email : Auth D'ABORD, Firestore ENSUITE.
    // L'ancienne version écrivait le nouvel email dans Firestore puis appelait
    // updateEmail : si Auth refusait (cas courant auth/requires-recent-login),
    // le document affichait durablement un email qui n'était PAS l'identité de
    // connexion. Désormais le doc n'est mis à jour qu'après succès Auth, et un
    // échec email n'annule pas l'enregistrement du reste du profil (feedback
    // distinct pour chaque issue).
    var profileUpdates = { name: name, phone: phone, address: address };
    var emailChanged = !!(newEmail && newEmail !== _currentUser.email);

    var ref = _fb.doc(_fb.db, 'users', _currentUser.uid);
    _fb.updateDoc(ref, profileUpdates)
      .then(function () {
        if (name && name !== _currentUser.displayName) {
          return _fb.updateProfile(_fb.auth.currentUser, { displayName: name });
        }
      })
      .then(function () {
        _userProfile = Object.assign({}, _userProfile || {}, profileUpdates);
        if (!emailChanged) {
          toast('Profil enregistré', 'success');
          return;
        }
        // H5 — verifyBeforeUpdateEmail (au lieu d'updateEmail). Firebase envoie
        // un lien de confirmation au NOUVEL email ; le changement d'identité ne
        // prend effet QU'APRÈS que l'utilisateur a cliqué ce lien — impossible
        // donc de s'attribuer une adresse qu'on ne contrôle pas. Firebase exige
        // aussi une connexion récente (auth/requires-recent-login) → réauth de
        // fait pour une opération d'identité sensible.
        // On N'ÉCRIT PAS l'email en Firestore ici : il n'est pas encore
        // confirmé. Le champ profil se resynchronisera sur la vraie identité au
        // prochain login avec la nouvelle adresse (loadUserProfile).
        var applyEmail = _fb.verifyBeforeUpdateEmail
          ? _fb.verifyBeforeUpdateEmail(_fb.auth.currentUser, newEmail)
          : _fb.updateEmail(_fb.auth.currentUser, newEmail); // repli SDK ancien
        return applyEmail
          .then(function () {
            // Le changement est EN ATTENTE : l'ancien email reste actif tant que
            // le lien n'est pas cliqué. On remet le champ sur l'email courant.
            if (dom.accEmail) dom.accEmail.value = _currentUser.email || '';
            toast('Profil enregistré. Un lien de confirmation a été envoyé à ' + newEmail
              + ' — clique-le pour valider ton nouvel email.', 'success');
          })
          .catch(function (err) {
            // Profil déjà enregistré ; l'email n'a PAS changé. Champ restauré.
            if (dom.accEmail) dom.accEmail.value = _currentUser.email || '';
            toast('Profil enregistré, mais email non modifié : ' + fbErrorMessage(err), 'error');
          });
      })
      .catch(function (err) {
        toast(fbErrorMessage(err), 'error');
      });
  }

  function handlePasswordChange(e) {
    e.preventDefault();
    if (!_fb || !_currentUser) return;

    var current = dom.pwdCurrent ? dom.pwdCurrent.value : '';
    var newPwd = dom.pwdNew ? dom.pwdNew.value : '';
    var confirm = dom.pwdConfirm ? dom.pwdConfirm.value : '';

    if (!current || !newPwd || !confirm) { toast('Remplissez tous les champs', 'error'); return; }
    if (newPwd.length < 6) { toast('Min. 6 caractères', 'error'); return; }
    if (newPwd !== confirm) { toast('Les mots de passe ne correspondent pas', 'error'); return; }

    var cred = _fb.EmailAuthProvider.credential(_currentUser.email, current);
    _fb.reauthenticateWithCredential(_currentUser, cred)
      .then(function () { return _fb.updatePassword(_currentUser, newPwd); })
      .then(function () {
        if (dom.pwdCurrent) dom.pwdCurrent.value = '';
        if (dom.pwdNew) dom.pwdNew.value = '';
        if (dom.pwdConfirm) dom.pwdConfirm.value = '';
        toast('Mot de passe modifié', 'success');
      })
      .catch(function (err) {
        toast(fbErrorMessage(err), 'error');
      });
  }

  function handleLogout() {
    if (!_fb || !_fb.configured) { location.hash = '#/auth'; return; }
    _fb.signOut(_fb.auth).then(function () {
      _currentUser = null;
      _userProfile = null;
      toast('Deconnecte', 'success');
      location.hash = '#/auth';
    }).catch(function (err) {
      toast(fbErrorMessage(err), 'error');
    });
  }

  // Droit à l'oubli (M4). Supprime DÉFINITIVEMENT le compte : réauth par mot de
  // passe (preuve de propriété — pas juste une session ouverte), puis purge des
  // commandes + du profil (règles Firestore owner-delete), puis suppression du
  // compte Auth. Le journal payments/ (server-only) est conservé au titre des
  // obligations comptables. Ordre choisi : Firestore d'ABORD (tant que le
  // compte existe, les règles autorisent la suppression), Auth EN DERNIER.
  function handleDeleteAccount(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!_fb || !_currentUser) return;
    var pwdEl = document.getElementById('deleteAccountPwd');
    var btn = document.getElementById('deleteAccountBtn');
    var pwd = pwdEl ? pwdEl.value : '';
    if (!pwd) { toast('Confirme ton mot de passe', 'error'); return; }
    if (!window.confirm('Cette action est IRRÉVERSIBLE : ton compte, ton profil et ton historique seront supprimés définitivement. Continuer ?')) return;

    if (btn) { btn.disabled = true; btn.textContent = 'Suppression…'; }
    var user = _fb.auth.currentUser;
    var uid = user.uid;
    var cred = _fb.EmailAuthProvider.credential(user.email, pwd);

    _fb.reauthenticateWithCredential(user, cred)
      .then(function () {
        // Purge les commandes du client (chacune supprimée par le titulaire).
        var ordersRef = _fb.collection(_fb.db, 'users', uid, 'orders');
        return _fb.getDocs(ordersRef).then(function (snap) {
          var dels = [];
          snap.forEach(function (d) { dels.push(_fb.deleteDoc(d.ref)); });
          return Promise.all(dels);
        });
      })
      .then(function () {
        // Supprime le document profil.
        return _fb.deleteDoc(_fb.doc(_fb.db, 'users', uid));
      })
      .then(function () {
        // Supprime le compte Auth (en dernier).
        return _fb.deleteUser(user);
      })
      .then(function () {
        // Nettoyage local (caches non essentiels liés à l'identité).
        try {
          localStorage.removeItem('pt:loyalty');
          localStorage.removeItem('pt_pending_order');
        } catch (_) {}
        _currentUser = null;
        _userProfile = null;
        toast('Ton compte et tes données ont été supprimés.', 'success');
        location.hash = '#/';
      })
      .catch(function (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Supprimer définitivement mon compte'; }
        var code = (err && err.code) || '';
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          toast('Mot de passe incorrect.', 'error');
        } else if (code === 'auth/requires-recent-login') {
          toast('Reconnecte-toi puis réessaie la suppression.', 'error');
        } else {
          toast('Suppression impossible : ' + fbErrorMessage(err), 'error');
        }
      });
  }

  function handleResendVerification() {
    if (!_currentUser || !_fb) return;
    _fb.sendEmailVerification(_currentUser).then(function () {
      toast('Email de vérification renvoyé', 'success');
    }).catch(function (err) {
      toast(fbErrorMessage(err), 'error');
    });
  }

  function handleAvatarChange(e) {
    var file = e.target.files && e.target.files[0];
    if (!file || !_fb || !_currentUser) return;

    // Resize/compress to ~256x256 to keep Firestore doc small
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      var max = 256;
      var w = img.width, h = img.height;
      if (w > h) { if (w > max) { h = h * max / w; w = max; } }
      else { if (h > max) { w = w * max / h; h = max; } }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      if (dom.accAvatarImg) dom.accAvatarImg.src = dataUrl;

      var ref = _fb.doc(_fb.db, 'users', _currentUser.uid);
      _fb.updateDoc(ref, { avatar: dataUrl }).then(function () {
        if (_userProfile) _userProfile.avatar = dataUrl;
        toast('Photo mise a jour', 'success');
      }).catch(function (err) {
        toast(fbErrorMessage(err), 'error');
      });
    };
    img.src = url;
  }

  // Save a quote/order to Firestore (called from sendDevisWhatsApp)
  // Trace le DEVIS WhatsApp dans l'historique du compte. C8 : n'octroie PLUS
  // de « points » — un devis envoyé n'est pas un achat. La fidélité a une
  // source unique : la dépense VÉRIFIÉE serveur (journal payments/ alimenté
  // par le webhook), dont pt:loyalty est le cache d'affichage synchronisé.
  // L'ancien champ profil `loyalty` (points par devis) est legacy : ni
  // incrémenté ni affiché désormais.
  function saveOrderToFirestore(itemCount, total) {
    if (!_fb || !_fb.configured || !_currentUser) return;
    var ordersRef = _fb.collection(_fb.db, 'users', _currentUser.uid, 'orders');
    _fb.addDoc(ordersRef, {
      date: _fb.serverTimestamp(),
      items: itemCount,
      total: total,
      status: 'quote'
    }).catch(function (err) {
      console.warn('[Auth] saveOrder failed:', err);
    });
  }

  // ── PWA install + service worker ───────────────────────────

  var deferredInstallPrompt = null;

  function initPWA() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js');
    }

    // Install prompt
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (dom.installBtn) dom.installBtn.style.display = '';
    });

    if (dom.installBtn) {
      dom.installBtn.style.display = 'none';
      dom.installBtn.addEventListener('click', function () {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function () {
          deferredInstallPrompt = null;
          dom.installBtn.style.display = 'none';
        });
      });
    }

    // Mobile viewport height CSS variable
    function setVH() {
      document.documentElement.style.setProperty('--app-vh', (window.innerHeight * 0.01) + 'px');
    }
    setVH();
    window.addEventListener('resize', setVH);
  }

  // ── Event binding (single pass, no duplicates) ─────────────

  function bindEvents() {
    // Hash-based router (single listener)
    window.addEventListener('hashchange', onRouteChange);

    // Hero logo lerp animation loop
    startHeroLoop();

    // Menu toggle
    if (dom.menuToggle) dom.menuToggle.addEventListener('click', toggleMenu);
    if (dom.menuBackdrop) dom.menuBackdrop.addEventListener('click', closeMenu);

    // Close menu when clicking sidebar links
    if (dom.sideMenu) {
      dom.sideMenu.addEventListener('click', function (e) {
        if (e.target.closest('a[href]')) closeMenu();
      });
    }

    // Escape key closes menu
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen) closeMenu();
    });

    // Home navigation shortcuts
    if (dom.topbarLogo) {
      dom.topbarLogo.addEventListener('click', function (e) {
        e.preventDefault();
        location.hash = '#/';
      });
    }
    if (dom.homeLink) {
      dom.homeLink.addEventListener('click', function (e) {
        e.preventDefault();
        location.hash = '#/';
      });
    }

    // Track product card clicks (select_item) via event delegation on <main>
    var mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.addEventListener('click', function (e) {
        var card = e.target.closest('.product-card[href]');
        if (!card) return;
        var href = card.getAttribute('href') || '';
        var slug = href.replace('#/produit/', '');
        var p = findProductByKey(slug);
        if (p && typeof track === 'function') {
          track('select_item', { id: p.id, name: p.title, brand: p.brand });
        }
      });
    }

    // Search input (debounced 300ms)
    if (dom.q) {
      dom.q.addEventListener('input', debounce(function () {
        currentFilter.query = dom.q.value;
        renderProductList();
      }, 300));
    }

    // Category chips — event delegation
    if (dom.catList) {
      dom.catList.addEventListener('click', function (e) {
        var btn = e.target.closest('.cat-chip');
        if (!btn) return;
        currentFilter.category = btn.dataset.cat || '';
        syncFilters();
        renderProductList();
      });
    }

    // Category select
    if (dom.tag) {
      dom.tag.addEventListener('change', function () {
        currentFilter.category = dom.tag.value;
        syncFilters();
        renderProductList();
      });
    }

    // Devis page actions — event delegation (single listener, never re-added)
    if (dom.devisList) {
      dom.devisList.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-idx]');
        if (!btn) return;
        var i = Number(btn.dataset.idx);
        var c = getCart();
        if (btn.classList.contains('devis-qty-minus')) {
          updateQty(i, Math.max(1, (c[i].qty || 1) - 1));
          renderDevis();
        } else if (btn.classList.contains('devis-qty-plus')) {
          updateQty(i, (c[i].qty || 1) + 1);
          renderDevis();
        } else if (btn.classList.contains('devis-buy')) {
          var it = c[i]; if (!it) return;
          // coffret propagé → payUnitCents (affichage modale) ET corps envoyé au
          // serveur ({key,qty,coffret}) facturent le supplément d'envoi.
          openPayModal([{ key: it.key, title: it.title, price: it.price, qty: it.qty || 1, coffret: !!it.coffret, paymentLink: it.paymentLink }]);
        } else if (btn.closest('.devis-remove')) {
          var el = btn.closest('.devis-item');
          if (el) el.classList.add('devis-item--removing');
          setTimeout(function () { removeFromCart(i); renderDevis(); }, 300);
        }
      });
    }
    if (dom.devisSend) dom.devisSend.addEventListener('click', sendDevisWhatsApp);
    if (dom.devisPay) dom.devisPay.addEventListener('click', function () {
      var items = getCart();
      if (!items.length) { toast('Panier vide', 'error'); return; }
      openPayModal(items.map(function (it) {
        return { key: it.key, title: it.title, price: it.price, qty: it.qty || 1, coffret: !!it.coffret, paymentLink: it.paymentLink || '' };
      }));
    });
    if (dom.devisClear) {
      dom.devisClear.addEventListener('click', function () {
        clearCart();
        renderDevis();
      });
    }

    // Dock navigation buttons
    $$('#dock [data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        location.hash = '#' + this.dataset.nav;
      });
    });

    // Auth tab switching
    if (dom.authLoginTab) dom.authLoginTab.addEventListener('click', function () { showAuthTab('login'); });
    if (dom.authRegisterTab) dom.authRegisterTab.addEventListener('click', function () { showAuthTab('register'); });

    // Auth form submissions
    if (dom.loginForm) dom.loginForm.addEventListener('submit', handleLogin);
    if (dom.registerForm) dom.registerForm.addEventListener('submit', handleRegister);

    // Sélecteur d'île (inscription) : cartes aux contours dorés. Le clic marque
    // la sélection ; le territoire n'est APPLIQUÉ (setTerritory) qu'à la
    // création réussie du compte (handleRegister lit _regIsland).
    var islGrid = document.getElementById('regIslands');
    if (islGrid) islGrid.addEventListener('click', function (e) {
      var btn = e.target.closest('.isl');
      if (!btn) return;
      _regIsland = btn.getAttribute('data-isl') || '';
      var all = islGrid.querySelectorAll('.isl');
      for (var ii = 0; ii < all.length; ii++) {
        var on = all[ii] === btn;
        all[ii].classList.toggle('isl--on', on);
        all[ii].setAttribute('aria-checked', on ? 'true' : 'false');
      }
    });

    // Forgot password
    if (dom.authForgotBtn) {
      dom.authForgotBtn.addEventListener('click', function () {
        if (dom.authForgotPanel) dom.authForgotPanel.hidden = false;
        if (dom.forgotEmail) {
          dom.forgotEmail.value = (dom.loginEmail && dom.loginEmail.value) || '';
          dom.forgotEmail.focus();
        }
      });
    }
    if (dom.authForgotClose) {
      dom.authForgotClose.addEventListener('click', function () {
        if (dom.authForgotPanel) dom.authForgotPanel.hidden = true;
      });
    }
    if (dom.forgotForm) dom.forgotForm.addEventListener('submit', handleForgotPassword);

    // Account save
    if (dom.accountForm) dom.accountForm.addEventListener('submit', handleAccountSave);
    if (dom.accSave) {
      dom.accSave.addEventListener('click', function (e) {
        e.preventDefault();
        handleAccountSave(e);
      });
    }

    // Avatar upload preview
    if (dom.accAvatar) dom.accAvatar.addEventListener('change', handleAvatarChange);

    // Password change
    if (dom.pwdChangeForm) dom.pwdChangeForm.addEventListener('submit', handlePasswordChange);

    // Logout
    if (dom.accLogout) dom.accLogout.addEventListener('click', handleLogout);
    var delForm = document.getElementById('deleteAccountForm');
    if (delForm) delForm.addEventListener('submit', handleDeleteAccount);

    // Resend email verification
    if (dom.accResendVerify) dom.accResendVerify.addEventListener('click', handleResendVerification);
  }

  // ── Bootstrap ──────────────────────────────────────────────

  // ── Stripe Payment Modal ───────────────────────────────────
  var _payItems = null;
  // Course de livraison quincaillerie attachée au paiement en cours :
  // { address, lat, lng, postal, city, date, when, hour, zone, prix } ou null.
  // Le serveur (create-payment-intent) recalcule zone/prix depuis lat/lng —
  // cet objet ne sert qu'à l'UX (préremplissage adresse, ligne livraison).
  var _payCourse = null;

  // ── Crypto pay state ───────────────────────────────────────
  var _cryptoSelected = null; // network object from PT_CRYPTO_CONFIG
  var _cryptoRates = {};      // coingeckoId -> EUR price
  var _cryptoTotalEur = 0;

  // ── INTERRUPTEUR canal crypto ──────────────────────────────
  // Décision 16/07/2026 : le paiement crypto est un flux DÉCLARATIF (le client
  // annonce « j'ai payé » → commande 'declared' à vérifier à la main sur la
  // blockchain), non vérifiable par le serveur comme l'est la carte via Stripe.
  // Risque de fraude au lancement → on le fait DISPARAÎTRE sans rien effacer :
  // tout le code crypto ci-dessous RESTE intact, mais l'onglet et le chemin
  // 'declared' sont neutralisés. RÉACTIVER = passer ce flag à true ICI **et**
  // réautoriser 'declared' dans firestore.rules (users/{uid}/orders → create).
  // Aucune autre modification requise.
  var PT_CRYPTO_ENABLED = false;
  function cryptoEnabled(){ return PT_CRYPTO_ENABLED === true; }

  function ptCryptoCfg(){ return (window.PT_CRYPTO_CONFIG || { networks: [], cardCheckout: {} }); }

  function cryptoFormatAmount(eurTotal, net) {
    var rate = _cryptoRates[net.coingeckoId];
    if (!rate || rate <= 0) return null;
    var amt = eurTotal / rate;
    return amt.toFixed(net.decimals || 6).replace(/\.?0+$/,'');
  }

  function cryptoBuildUri(net, amount) {
    if (!net.uriScheme) return net.address;
    // BIP21-ish: scheme:address?amount=...
    var u = net.uriScheme + net.address;
    if (amount) u += '?amount=' + amount;
    return u;
  }

  // QR de paiement crypto : génération 100 % LOCALE (bibliothèque qrcode.js
  // vendue, licence MIT, vérifiée par aller-retour). Aucun service tiers → une
  // adresse crypto ne peut plus être substituée ni fuitée. Chargée à la demande.
  var _qrLibPromise = null;
  function ensureQRLib() {
    if (typeof window.qrcode === 'function') return Promise.resolve(window.qrcode);
    if (_qrLibPromise) return _qrLibPromise;
    _qrLibPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'qrcode.js';
      s.async = true;
      s.onload = function () { resolve(window.qrcode); };
      s.onerror = function () { _qrLibPromise = null; reject(new Error('qr lib load failed')); };
      document.head.appendChild(s);
    });
    return _qrLibPromise;
  }

  function cryptoLocalQR(payload) {
    if (typeof window.qrcode !== 'function') return null;
    try {
      var qr = window.qrcode(0, 'M'); // version auto, correction d'erreur M (15 %)
      qr.addData(payload);
      qr.make();
      return qr.createDataURL(6, 4); // 6 px/module, marge 4 modules (norme QR)
    } catch (e) {
      console.error('[cryptoLocalQR]', e && e.message);
      return null;
    }
  }

  function cryptoFetchRates() {
    var cfg = ptCryptoCfg();
    var ids = (cfg.networks || []).map(function(n){ return n.coingeckoId; })
      .filter(function(v,i,a){ return v && a.indexOf(v) === i; });
    if (!ids.length) return Promise.resolve({});
    var url = 'https://api.coingecko.com/api/v3/simple/price?vs_currencies=eur&ids=' + ids.join(',');
    return fetch(url).then(function(r){ return r.json(); }).then(function(j){
      var out = {};
      Object.keys(j || {}).forEach(function(k){ if (j[k] && j[k].eur) out[k] = j[k].eur; });
      _cryptoRates = out;
      return out;
    }).catch(function(){ return {}; });
  }

  function cryptoChains() {
    var nets = (ptCryptoCfg().networks || []);
    var seen = {}, out = [];
    nets.forEach(function(n){
      if (seen[n.chain]) return;
      seen[n.chain] = true;
      out.push({ chain: n.chain, tokens: nets.filter(function(x){ return x.chain === n.chain; }) });
    });
    return out;
  }

  function cryptoRenderNets() {
    var wrap = document.getElementById('cryptopayNets');
    if (!wrap) return;
    var chains = cryptoChains();
    if (!chains.length) {
      wrap.innerHTML = '<div class="cryptopay__empty">⚠️ Aucun réseau crypto configuré.</div>';
      return;
    }
    wrap.innerHTML = chains.map(function(c){
      var tokens = c.tokens.map(function(t){ return t.symbol; }).join(' · ');
      return '<button type="button" class="cryptopay-net" role="radio" '
        + 'aria-checked="false" data-chain="' + c.chain.replace(/"/g,'&quot;') + '">'
        + '<span class="cryptopay-net__chain">' + c.chain + '</span>'
        + '<span class="cryptopay-net__token">' + tokens + '</span>'
        + '</button>';
    }).join('');
    wrap.querySelectorAll('.cryptopay-net').forEach(function(btn){
      btn.addEventListener('click', function(){
        cryptoSelectChain(btn.getAttribute('data-chain'));
      });
    });
  }

  function cryptoSelectChain(chain) {
    var wrap = document.getElementById('cryptopayNets');
    if (wrap) {
      wrap.querySelectorAll('.cryptopay-net').forEach(function(b){
        var on = b.getAttribute('data-chain') === chain;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    var tokensWrap = document.getElementById('cryptopayTokensWrap');
    var tokensEl   = document.getElementById('cryptopayTokens');
    var entry = cryptoChains().find(function(c){ return c.chain === chain; });
    if (!entry || !tokensEl) return;
    if (tokensWrap) tokensWrap.hidden = false;
    tokensEl.innerHTML = entry.tokens.map(function(t){
      return '<button type="button" class="cryptopay-token" role="radio" '
        + 'aria-checked="false" data-net-id="' + t.id + '">'
        + '<span class="cryptopay-token__sym">' + t.symbol + '</span>'
        + '<span class="cryptopay-token__name">' + t.label + '</span>'
        + '</button>';
    }).join('');
    tokensEl.querySelectorAll('.cryptopay-token').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-net-id');
        var net = entry.tokens.find(function(x){ return x.id === id; });
        if (net) cryptoSelectNet(net);
      });
    });
    // auto-select first compatible token
    if (entry.tokens[0]) cryptoSelectNet(entry.tokens[0]);
  }

  function cryptoSelectNet(net) {
    _cryptoSelected = net;
    var wrap = document.getElementById('cryptopayNets');
    if (wrap) {
      wrap.querySelectorAll('.cryptopay-net').forEach(function(b){
        var on = b.getAttribute('data-chain') === net.chain;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    var tokensEl = document.getElementById('cryptopayTokens');
    if (tokensEl) {
      tokensEl.querySelectorAll('.cryptopay-token').forEach(function(b){
        var on = b.getAttribute('data-net-id') === net.id;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    var chainEl  = document.getElementById('cryptopayChain');
    var addrEl   = document.getElementById('cryptopayAddr');
    var amountEl = document.getElementById('cryptopayAmount');
    var symEl    = document.getElementById('cryptopayAmountSymbol');
    var rateEl   = document.getElementById('cryptopayRate');

    if (chainEl) chainEl.textContent = net.chain;
    if (addrEl)  addrEl.textContent = net.address || '—';

    var addrLooksUnset = !net.address || /^REMPLACE_/i.test(net.address);
    var amt = cryptoFormatAmount(_cryptoTotalEur, net);
    var rate = _cryptoRates[net.coingeckoId];
    if (amt && rate) {
      if (amountEl) amountEl.textContent = amt;
      if (symEl) symEl.textContent = net.symbol;
      if (rateEl) rateEl.textContent = '1 ' + net.symbol + ' ≈ ' + rate.toFixed(2) + ' € (taux temps réel)';
    } else {
      if (amountEl) amountEl.textContent = '…';
      if (symEl) symEl.textContent = net.symbol;
      if (rateEl) rateEl.textContent = 'Récupération du taux en cours…';
    }

    var qr = document.getElementById('cryptopayQR');
    var qrWrap = qr ? qr.parentElement : null;
    if (qr) {
      if (addrLooksUnset) {
        qr.removeAttribute('src');
        qr.alt = 'Adresse non configurée';
        if (qrWrap) qrWrap.classList.remove('is-ready');
      } else {
        var payload = cryptoBuildUri(net, amt || '');
        var label = net.label;
        ensureQRLib().then(function () {
          var cur = document.getElementById('cryptopayQR');
          if (!cur) return; // modal fermé entre-temps
          var dataUrl = cryptoLocalQR(payload);
          if (dataUrl) {
            cur.src = dataUrl;
            cur.alt = 'QR ' + label;
            if (cur.parentElement) cur.parentElement.classList.add('is-ready');
          }
        }).catch(function () {
          // Échec de chargement de la lib : on NE retombe PAS sur un service
          // tiers. L'adresse en texte (copiable, avec avertissement) fait foi.
          var cur = document.getElementById('cryptopayQR');
          if (cur) { cur.removeAttribute('src'); cur.alt = 'QR indisponible — utilisez l\'adresse ci-dessous'; }
          if (qrWrap) qrWrap.classList.remove('is-ready');
        });
      }
    }
  }

  function cryptoCopy(text, btn) {
    if (!text || text === '—' || text === '…') return;
    var done = function(){
      if (!btn) return;
      var prev = btn.innerHTML;
      btn.innerHTML = '✓ Copié !';
      btn.classList.add('is-copied');
      setTimeout(function(){
        btn.innerHTML = prev;
        btn.classList.remove('is-copied');
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function(){});
    } else {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); done();
      } catch(_){}
    }
  }

  function cryptoOpenCardOnramp() {
    var cfg = ptCryptoCfg();
    var co  = cfg.cardCheckout || {};
    if (co.url) {
      window.open(co.url, '_blank', 'noopener');
      return;
    }
    // SÉCURITÉ : la création dynamique d'invoice NOWPayments a été RETIRÉE du
    // client. Elle envoyait la clé API de compte (x-api-key) à chaque visiteur —
    // n'importe qui pouvait l'extraire et créer des factures sur le compte
    // marchand. Pour réactiver NOWPayments, passer par un endpoint serverless
    // (/api/nowpayments) qui garde la clé côté serveur, comme pour Stripe.
    // Le lien de paiement pré-généré (co.url) ci-dessus reste, lui, sûr.
    toast("Le paiement crypto dynamique n'est pas encore disponible.", 'info');
  }

  function cryptoConfirmPaid() {
    if (!_cryptoSelected) {
      toast('Choisis d\'abord un réseau crypto.', 'info');
      return;
    }
    var cfg = ptCryptoCfg();
    var amt = cryptoFormatAmount(_cryptoTotalEur, _cryptoSelected) || '?';
    var msg = 'Bonjour, j\'ai effectué un paiement crypto :\n'
      + '• Réseau : ' + _cryptoSelected.chain + '\n'
      + '• Montant : ' + amt + ' ' + _cryptoSelected.symbol + ' (~' + _cryptoTotalEur.toFixed(2) + ' €)\n'
      + '• Adresse : ' + _cryptoSelected.address + '\n'
      + 'Voici mon TXID : ';
    var num = (cfg.whatsappNumber || '').replace(/[^0-9]/g,'');
    var url = num
      ? ('https://wa.me/' + num + '?text=' + encodeURIComponent(msg))
      : ('https://wa.me/?text=' + encodeURIComponent(msg));
    // sauvegarde l'intention de commande pour /merci
    try {
      localStorage.setItem('pt_pending_order', JSON.stringify({
        items: (_payItems || []).map(function(it){ return { key: it.key, title: it.title, price: payUnitCents(it) / 100, qty: it.qty }; }),
        total: _cryptoTotalEur,
        method: 'crypto:' + _cryptoSelected.id,
        ts: Date.now()
      }));
    } catch(_){}
    window.open(url, '_blank', 'noopener');
  }

  // Masque/affiche l'onglet crypto et la barre d'onglets selon l'interrupteur.
  // Canal désactivé → seule la carte reste : la barre d'onglets (2 choix) n'a
  // plus de raison d'être, on la masque et le panneau crypto est neutralisé.
  function applyCryptoVisibility(modal) {
    var root = modal || document;
    var on = cryptoEnabled();
    var cryptoTab = root.querySelector('.pay-tab[data-pay-tab="crypto"]');
    var tabs = root.querySelector('.pay-tabs');
    var cryptoPane = root.querySelector('[data-pay-pane="crypto"]');
    if (cryptoTab) cryptoTab.hidden = !on;
    if (tabs) tabs.hidden = !on;
    if (cryptoPane && !on) { cryptoPane.hidden = true; cryptoPane.classList.remove('is-active'); }
  }

  function cryptoSwitchTab(tab) {
    // Défense en profondeur : impossible de basculer sur crypto si désactivé.
    if (tab === 'crypto' && !cryptoEnabled()) tab = 'card';
    var card = document.querySelector('[data-pay-pane="card"]');
    var crypto = document.querySelector('[data-pay-pane="crypto"]');
    var btnCard   = document.getElementById('payModalConfirm');
    var btnCrypto = document.getElementById('payModalCryptoConfirm');
    var powered   = document.getElementById('payModalPowered');
    document.querySelectorAll('.pay-tab').forEach(function(b){
      var on = b.getAttribute('data-pay-tab') === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (tab === 'crypto') {
      if (card) { card.classList.remove('is-active'); card.hidden = true; }
      if (crypto) { crypto.classList.add('is-active'); crypto.hidden = false; }
      if (btnCard)   btnCard.hidden = true;
      if (btnCrypto) btnCrypto.hidden = false;
      if (powered)   powered.innerHTML = 'Paiements crypto directs — sans intermédiaire';

      // (re)render des réseaux à chaque ouverture pour rester défensif
      cryptoRenderNets();

      // Auto-select IMMÉDIAT du premier réseau (avant l'appel API),
      // pour qu'on voie tout de suite QR + adresse + sélection visuelle.
      var firstChain = cryptoChains()[0];
      if (!_cryptoSelected && firstChain) cryptoSelectChain(firstChain.chain);

      // Puis on rafraîchit les taux et on recalcule le montant.
      cryptoFetchRates().then(function(){
        if (_cryptoSelected) cryptoSelectNet(_cryptoSelected);
      });

      // Remonter le scroll de la modale au tout début pour que
      // l'étape 1 (« Choisis ton réseau ») soit immédiatement visible.
      var body = document.querySelector('#payModal .pay-modal__body');
      if (body) body.scrollTop = 0;
      var dlg = document.querySelector('#payModal .pay-modal__dialog');
      if (dlg) dlg.scrollTop = 0;
    } else {
      if (crypto) { crypto.classList.remove('is-active'); crypto.hidden = true; }
      if (card) { card.classList.add('is-active'); card.hidden = false; }
      if (btnCrypto) btnCrypto.hidden = true;
      if (btnCard)   btnCard.hidden = false;
      if (powered)   powered.innerHTML = 'Propulsé par <strong>Stripe</strong> — leader mondial du paiement en ligne';
    }
  }

  // Territory-aware unit price in integer cents. Mirrors api/_lib/pricing.js
  // (same per-unit rounding) so the amount shown here equals the amount the
  // server will charge. Falls back to the stored metropolitan price only for
  // legacy cart entries whose product is no longer in the live catalogue.
  // Supplément coffret TSTAK — MIROIR de api/_lib/pricing.js (garder IDENTIQUE).
  // Éligible = machine (ncCategory 'power_tool'). 2 paliers selon le poids.
  var COFFRET_SURCH = { petit: 15, gros: 25, heavyKg: 3 };
  // Packs/combos INCLUS (décision user 25/07) ; \b anti « lame »→« Lamelleuses ».
  var COFFRET_DENY = /\b(batteries?|chargeurs?|accessoires?|rangements?|lames?|forets?|consommables?|coffrets?|mallettes?)\b/i;
  function coffretEligible(p) { return !!(p && p.ncCategory === 'power_tool' && !p.coffretIncluded && !COFFRET_DENY.test(p.category || '')); }

  // Outil vendu SANS batterie ni chargeur (machine seule / solo / produit seul)
  // → note d'avertissement sur la fiche (demande user : « ajoute sans batterie »).
  // Les packs/kits/combos (batteries incluses) sont EXCLUS.
  function batteryNotIncluded(p) {
    if (!p) return false;
    var s = (p.specs && (p.specs['Batterie / chargeur'] || p.specs['Batterie/chargeur'])) || '';
    if (/non\s*inclus/i.test(s)) return true;
    var txt = ((p.title || '') + ' ' + (p.desc || '') + ' ' + (p.name || '')).toLowerCase();
    if (/pack|combo|\bkit\b|2x\d|\(2x|batteries?\s+inclus/.test(txt)) return false;
    return /machine seule|machine nue|produit seul|outil nu|\(solo\)|\bsolo\b/.test(txt);
  }
  function coffretSurchargeCents(p) {
    if (!coffretEligible(p)) return 0;
    var w = Number(p && p.weight_kg) || 0;
    return Math.round((w >= COFFRET_SURCH.heavyKg ? COFFRET_SURCH.gros : COFFRET_SURCH.petit) * 100);
  }

  // Choix « coffret » courant sur la fiche (réinitialisé à chaque ouverture).
  // Le switch 2 boutons (Sans/Avec coffret) est rendu dans #pdpVariant par
  // renderPDP (applyCoffretToggle pour les standalone, applyVariant pour les
  // paires). Ici on ne fait plus que réinitialiser l'état + nettoyer une
  // éventuelle ancienne case à cocher (compat).
  var _pdpCoffret = false;
  function setupPdpCoffret(product) {
    _pdpCoffret = false;
    var old = document.getElementById('pdpCoffretOpt');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  // Sélecteur de QUANTITÉ de la fiche (quincaillerie uniquement — les
  // machines s'achètent à l'unité, le panier gère les multiples). Pilote
  // l'ajout panier, l'achat direct et la commande de livraison.
  var _pdpQty = 1;
  function setupPdpQty(show) {
    _pdpQty = 1;
    var wrap = document.getElementById('pdpQtyWrap');
    if (!wrap) return;
    wrap.hidden = !show;
    if (!show) return;
    var val = document.getElementById('pdpQtyVal');
    var minus = document.getElementById('pdpQtyMinus');
    var plus = document.getElementById('pdpQtyPlus');
    function paint() {
      if (val) val.textContent = String(_pdpQty);
      if (minus) minus.disabled = _pdpQty <= 1;
      if (plus) plus.disabled = _pdpQty >= 99;
    }
    if (minus) minus.onclick = function () { if (_pdpQty > 1) { _pdpQty--; paint(); } };
    if (plus) plus.onclick = function () { if (_pdpQty < 99) { _pdpQty++; paint(); } };
    paint();
  }

  function payUnitCents(it) {
    var p = findProductByKey(it && it.key);
    var ttc = p ? calcPrice(p, _currentTerritory).ttc : (Number(it && it.price) || 0);
    var cents = Math.round(ttc * 100);
    if (it && it.coffret && p) cents += coffretSurchargeCents(p);   // option coffret
    return cents;
  }

  function payTotalCents(items) {
    return (items || []).reduce(function (s, it) {
      return s + payUnitCents(it) * (it.qty || 1);
    }, 0);
  }

  function openPayModal(items, courseCtx) {
    var modal = document.getElementById('payModal');
    if (!modal || !items || !items.length) return;
    // Annule une fermeture en cours (course fermer→rouvrir < 250 ms).
    if (_payCloseTimer) { clearTimeout(_payCloseTimer); _payCloseTimer = null; }
    _payItems = items;
    _payCourse = courseCtx || null;
    _cryptoTotalEur = payTotalCents(items) / 100;
    _cryptoSelected = null;
    applyCryptoVisibility(modal);        // masque l'onglet crypto si désactivé
    if (cryptoEnabled()) cryptoRenderNets();
    cryptoSwitchTab('card');

    var itemsEl = document.getElementById('payModalItems');
    var totalEl = document.getElementById('payModalTotal');
    var totalCents = 0;
    var html = '';
    items.forEach(function (it) {
      var lineCents = payUnitCents(it) * (it.qty || 1);
      totalCents += lineCents;
      html += '<div class="pay-modal__line">'
        + '<div class="pay-modal__line-info">'
        +   '<span class="pay-modal__line-title">' + escapeHTML(it.title || 'Produit') + '</span>'
        +   '<span class="pay-modal__line-qty">x' + (it.qty || 1) + '</span>'
        + '</div>'
        + '<span class="pay-modal__line-price">' + formatPrice(lineCents / 100) + '</span>'
        + '</div>';
    });
    // Ligne livraison chantier (estimation locale — le serveur renverra le
    // montant AUTORITAIRE via renderServerQuote, recalculé depuis lat/lng).
    if (_payCourse && _payCourse.prix) {
      totalCents += _payCourse.prix * 100;
      html += '<div class="pay-modal__line pay-modal__line--deliv">'
        + '<div class="pay-modal__line-info">'
        +   '<span class="pay-modal__line-title">🛵 Livraison sur chantier — zone ' + _payCourse.zone + ' <em>(100 % reversés au livreur)</em></span>'
        +   '<span class="pay-modal__line-qty">x1</span>'
        + '</div>'
        + '<span class="pay-modal__line-price">' + formatPrice(_payCourse.prix) + '</span>'
        + '</div>';
    }
    var total = totalCents / 100;
    if (itemsEl) itemsEl.innerHTML = html;
    if (totalEl) totalEl.textContent = formatPrice(total);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { modal.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';

    // Confinement clavier réel (promis par aria-modal) + restauration du
    // focus au déclencheur à la fermeture.
    if (_payTrapRelease) _payTrapRelease();
    _payTrapRelease = trapFocus(modal);

    // Adresse d'abord : le formulaire carte (et le PaymentIntent) ne sont
    // créés qu'après une adresse de livraison valide — le code postal fixe le
    // territoire fiscal côté serveur (préventif A1).
    _stripeReady = false;
    _stripeClientSecret = null;
    _quoteTerritory = null;
    setupPayAddressForm();
    // Course : l'adresse du CHANTIER (déjà géocodée sur la carte) préremplit
    // le formulaire — le formulaire carte se charge immédiatement.
    if (_payCourse) {
      var pf = function (id, v) { var el = document.getElementById(id); if (el && v) el.value = v; };
      pf('payAddrName', (_currentUser && (_currentUser.displayName || _currentUser.email)) || '');
      pf('payAddrLine1', _payCourse.street || _payCourse.address || '');
      pf('payAddrPostal', _payCourse.postal || '');
      pf('payAddrCity', _payCourse.city || '');
    }
    handlePayAddressChange();

    // Analytics
    if (typeof track === 'function') {
      track('begin_checkout', {
        value: total,
        currency: 'EUR',
        items_count: items.length,
        territory: _currentTerritory
      });
    }
  }

  var _payTrapRelease = null;
  // Timer de fermeture (animation 250 ms). openPayModal l'ANNULE : sans ça,
  // fermer puis rouvrir en < 250 ms laissait le vieux timer masquer la modale
  // fraîchement ouverte et réactiver le scroll du body sous elle.
  var _payCloseTimer = null;

  function closePayModal() {
    var modal = document.getElementById('payModal');
    if (!modal) return;
    if (_payTrapRelease) { _payTrapRelease(); _payTrapRelease = null; }
    modal.classList.remove('is-open');
    if (_payCloseTimer) clearTimeout(_payCloseTimer);
    _payCloseTimer = setTimeout(function () {
      _payCloseTimer = null;
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }, 250);
  }

  // ── Stripe Elements integration ─────────────────────────────
  //
  // Flow:
  // 1. openPayModal → initStripeElements() creates PaymentIntent via API
  // 2. Stripe Payment Element mounts in #stripePaymentElement
  // 3. User fills card details inside the embedded form
  // 4. confirmPayment() calls stripe.confirmPayment() client-side
  // 5. On success → inline redirect to /merci (no external redirect)

  var _stripe = null;       // Stripe instance
  var _stripeElements = null; // Stripe Elements instance
  var _stripeClientSecret = null;
  var _stripeReady = false;
  var _quoteTerritory = null;   // territoire du PaymentIntent en cours (dérivé du CP)
  var _payAddressBound = false; // listeners du formulaire adresse posés une seule fois
  var _payAddrDebounce = null;

  // ── Adresse de livraison (blindage fiscal préventif) ────────
  // Miroir client de api/_lib/postal.js : code postal → territoire desservi.
  // Le serveur re-dérive lui-même depuis postalCode (autoritaire) — cette
  // copie ne sert qu'à l'UX (recalcul immédiat, message d'erreur).
  function territoryFromPostalClient(pc) {
    var d = String(pc || '').replace(/\D/g, '');
    if (d.length < 3) return null;
    var p = d.slice(0, 3);
    return (p === '971' || p === '972' || p === '973' || p === '974' || p === '976') ? p : null;
  }

  function readPayAddress() {
    function val(id) {
      var el = document.getElementById(id);
      return el ? el.value.trim() : '';
    }
    return { name: val('payAddrName'), line1: val('payAddrLine1'), postal: val('payAddrPostal'), city: val('payAddrCity') };
  }

  // Valide le formulaire, met à jour les hints/classes. Retourne
  // { valid, territory, addr } — territory null tant que CP hors DOM.
  function validatePayAddress() {
    var addr = readPayAddress();
    var hint = document.getElementById('payAddrHint');
    var postalEl = document.getElementById('payAddrPostal');
    var terr = territoryFromPostalClient(addr.postal);
    var postalFilled = addr.postal.length >= 5;
    var complete = !!(addr.name && addr.line1 && addr.city && postalFilled);

    if (postalEl) postalEl.classList.toggle('is-invalid', postalFilled && !terr);
    if (hint) {
      if (postalFilled && !terr) {
        hint.textContent = 'Code postal hors zone : nous livrons uniquement les DOM (971xx à 976xx).';
        hint.classList.add('is-error');
      } else if (terr && complete) {
        var t = getTerritory(terr);
        hint.textContent = 'Livraison ' + (t ? t.flag + ' ' + t.name : terr) + ' — prix TTC calculés pour ce territoire.';
        hint.classList.remove('is-error');
      } else {
        hint.textContent = 'Nous livrons en Guadeloupe, Martinique, Guyane, La Réunion et Mayotte (code postal 971xx–976xx).';
        hint.classList.remove('is-error');
      }
    }
    return { valid: !!(complete && terr), territory: terr, addr: addr };
  }

  function setupPayAddressForm() {
    if (_payAddressBound) return;
    var form = document.getElementById('payAddress');
    if (!form) return;
    _payAddressBound = true;
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.addEventListener('input', function () {
      if (_payAddrDebounce) clearTimeout(_payAddrDebounce);
      _payAddrDebounce = setTimeout(handlePayAddressChange, 350);
    });
  }

  // (Re)crée le PaymentIntent quand l'adresse devient valide ou que le CP
  // change de territoire. Idempotent : rien à faire si le PI courant est déjà
  // au bon territoire.
  function handlePayAddressChange() {
    var v = validatePayAddress();
    var container = document.getElementById('stripePaymentElement');
    if (!v.valid) {
      if (!_stripeClientSecret && container) {
        container.innerHTML = '<div class="stripe-fallback">'
          + '<p>Renseignez votre adresse de livraison ci-dessus pour afficher le paiement par carte.</p>'
          + '</div>';
      }
      return;
    }
    if (_stripeClientSecret && v.territory === _quoteTerritory) return;
    initStripeElements();
  }

  // Appearance matching Pirates Tools dark theme
  var STRIPE_APPEARANCE = {
    theme: 'night',
    variables: {
      colorPrimary: '#8B5CF6',
      colorBackground: '#0f1722',
      colorText: '#e6edf5',
      colorDanger: '#ef4444',
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      borderRadius: '10px',
      spacingUnit: '4px'
    },
    rules: {
      '.Input': {
        backgroundColor: '#1a2332',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: 'none',
        color: '#e6edf5',
        padding: '12px'
      },
      '.Input:focus': {
        border: '1px solid #8B5CF6',
        boxShadow: '0 0 0 2px rgba(139, 92, 246, 0.25)'
      },
      '.Label': {
        color: '#cdd6e0',
        fontSize: '13px',
        fontWeight: '600'
      },
      '.Tab': {
        backgroundColor: '#1a2332',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        color: '#cdd6e0'
      },
      '.Tab--selected': {
        backgroundColor: '#8B5CF6',
        border: '1px solid #8B5CF6',
        color: '#fff'
      },
      '.Tab:hover': {
        color: '#fff'
      }
    }
  };

  function getStripe() {
    if (_stripe) return _stripe;
    var pk = window.PT_STRIPE_PK;
    if (!pk || typeof window.Stripe !== 'function') return null;
    _stripe = window.Stripe(pk);
    return _stripe;
  }

  // Create PaymentIntent and mount Elements.
  // Pré-requis : adresse de livraison valide (handlePayAddressChange est le
  // seul appelant). Le territoire fiscal envoyé est DÉRIVÉ du code postal —
  // et le serveur le re-dérive lui-même depuis postalCode (autoritaire).
  function initStripeElements() {
    var ship = validatePayAddress();
    if (!ship.valid) return;
    var stripe = getStripe();
    var container = document.getElementById('stripePaymentElement');
    var errorEl = document.getElementById('stripeCardError');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    _quoteTerritory = ship.territory;

    if (!stripe) {
      // Stripe not configured — show fallback message
      if (container) {
        container.innerHTML = '<div class="stripe-fallback">'
          + '<p>Le paiement par carte sera bientôt disponible.</p>'
          + '<p>En attendant, utilisez <strong>WhatsApp</strong> ou <strong>Crypto</strong> pour commander.</p>'
          + '</div>';
      }
      _stripeReady = false;
      return;
    }

    // Show loading state
    if (container) {
      container.innerHTML = '<div class="stripe-loading">'
        + '<div class="stripe-loading__spinner"></div>'
        + '<span>Chargement du formulaire de paiement…</span>'
        + '</div>';
    }

    var apiBase = apiBaseUrl();
    var piBody = JSON.stringify({
      // Server resolves prices from the catalogue by key — no price is sent.
      items: _payItems.map(function (it) {
        return { key: it.key, title: it.title, qty: it.qty || 1, coffret: !!it.coffret };
      }),
      customerEmail: (_currentUser && _currentUser.email) || undefined,
      // Territoire dérivé du CP de livraison ; le serveur re-dérive depuis
      // postalCode (source autoritaire) — celui-ci prime toujours.
      territory: ship.territory,
      postalCode: ship.addr.postal,
      shipping: { name: ship.addr.name, line1: ship.addr.line1, city: ship.addr.city },
      // Course quincaillerie : le serveur recalcule zone + frais depuis lat/lng
      // et les AJOUTE au montant débité (reversés au livreur après confirmation).
      course: _payCourse ? {
        lat: _payCourse.lat, lng: _payCourse.lng, address: _payCourse.address,
        date: _payCourse.date, when: _payCourse.when, hour: _payCourse.hour
      } : undefined
      // uid retiré du corps (S2) : le serveur le dérive de l'ID token vérifié
      // (en-tête Authorization), il n'est plus déclaratif.
    });
    jsonAuthHeaders().then(function (headers) {
      return fetch(apiBase + '/api/create-payment-intent', {
        method: 'POST', headers: headers, body: piBody
      });
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok || !data.clientSecret) {
        throw new Error(data.error || 'Erreur création du paiement');
      }
      _stripeClientSecret = data.clientSecret;

      // Le serveur est la SEULE vérité du montant débité : il applique la
      // remise fidélité vérifiée (journal payments/, infalsifiable). On
      // réaligne l'affichage de la modale sur sa réponse (total + ligne
      // remise) — jamais l'inverse.
      renderServerQuote(data);

      // Unmount previous elements if any
      if (_stripeElements) {
        try { _stripeElements.getElement('payment').destroy(); } catch (_) {}
      }

      _stripeElements = stripe.elements({
        clientSecret: _stripeClientSecret,
        appearance: STRIPE_APPEARANCE,
        locale: 'fr'
      });

      var paymentElement = _stripeElements.create('payment', {
        layout: {
          type: 'tabs',
          defaultCollapsed: false
        }
      });

      if (container) container.innerHTML = '';
      paymentElement.mount('#stripePaymentElement');

      paymentElement.on('ready', function () {
        _stripeReady = true;
      });

      paymentElement.on('change', function (ev) {
        if (errorEl) {
          if (ev.error) {
            errorEl.textContent = ev.error.message;
            errorEl.hidden = false;
          } else {
            errorEl.hidden = true;
            errorEl.textContent = '';
          }
        }
      });
    })
    .catch(function (err) {
      _stripeReady = false;
      if (container) {
        container.innerHTML = '<div class="stripe-fallback">'
          + '<p>Impossible de charger le formulaire de paiement.</p>'
          + '<p>' + escapeHTML(err.message || 'Erreur réseau') + '</p>'
          + '<p>Utilisez <strong>WhatsApp</strong> ou <strong>Crypto</strong> pour commander.</p>'
          + '</div>';
      }
    });
  }

  // Réaligne la modale de paiement sur la réponse serveur : total débité
  // (remise fidélité déduite) + ligne de remise + synchronisation du cache
  // fidélité local (l'affichage panier/compte suit la vérité serveur).
  function renderServerQuote(data) {
    if (!data) return;
    var itemsEl = document.getElementById('payModalItems');
    var totalEl = document.getElementById('payModalTotal');
    if (itemsEl) {
      var old = itemsEl.querySelector('.pay-modal__line--loyalty');
      if (old) old.parentNode.removeChild(old);
      if (data.loyalty && data.loyalty.discountCents > 0) {
        var div = document.createElement('div');
        div.className = 'pay-modal__line pay-modal__line--loyalty';
        div.innerHTML = '<div class="pay-modal__line-info">'
          + '<span class="pay-modal__line-title">Remise fidélité '
          + escapeHTML(data.loyalty.tierLabel || '') + ' −' + data.loyalty.pct + ' %</span>'
          + '</div>'
          + '<span class="pay-modal__line-price">−' + formatPrice(data.loyalty.discountCents / 100) + '</span>';
        itemsEl.appendChild(div);
      }
    }
    if (totalEl && typeof data.amount === 'number') {
      totalEl.textContent = formatPrice(data.amount / 100);
    }
    // Ligne livraison chantier : réalignée sur le devis SERVEUR (zone + frais
    // recalculés depuis lat/lng — l'estimation locale ne fait jamais foi).
    if (data.course && itemsEl) {
      var dl = itemsEl.querySelector('.pay-modal__line--deliv');
      if (dl) {
        var dt = dl.querySelector('.pay-modal__line-title');
        var dp = dl.querySelector('.pay-modal__line-price');
        if (dt) dt.innerHTML = '🛵 Livraison sur chantier — zone ' + data.course.zone + ' <em>(100 % reversés au livreur)</em>';
        if (dp) dp.textContent = formatPrice((data.deliveryCents || data.course.prix * 100) / 100);
      }
    }
    if (data.loyalty && typeof data.loyalty.verifiedSpendCents === 'number') {
      saveLoyalty({ totalSpent: data.loyalty.verifiedSpendCents / 100 });
    }
  }

  function confirmPayment() {
    if (!_payItems || !_payItems.length) return;
    var total = payTotalCents(_payItems) / 100;
    var stripe = getStripe();
    var errorEl = document.getElementById('stripeCardError');

    // ── Stripe Elements flow (embedded card form) ──
    if (stripe && _stripeElements && _stripeClientSecret) {
      var btn = document.getElementById('payModalConfirm');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="pay-modal__btn-icon">⏳</span> Traitement en cours…'; }
      if (errorEl) { errorEl.hidden = true; }

      // Save pending order before confirming
      try {
        localStorage.setItem('pt_pending_order', JSON.stringify({
          items: _payItems.map(function (it) { return { key: it.key, title: it.title, price: payUnitCents(it) / 100, qty: it.qty }; }),
          total: total, ts: Date.now(),
          // Course : /merci finalisera la création (preuve = paymentIntentId).
          course: _payCourse ? 1 : 0
        }));
        // Photo du chantier : trop lourde pour le pending localStorage → elle
        // voyage en sessionStorage (survit au retour 3DS, purgée après envoi).
        if (_payCourse && _payCourse.scenePhoto) {
          sessionStorage.setItem('pt_course_scene', _payCourse.scenePhoto);
        }
      } catch (_) {}

      stripe.confirmPayment({
        elements: _stripeElements,
        confirmParams: {
          return_url: location.origin + location.pathname + '#/merci'
        },
        redirect: 'if_required'
      })
      .then(function (result) {
        if (result.error) {
          // Payment failed — show error
          if (errorEl) {
            errorEl.textContent = result.error.message || 'Le paiement a échoué.';
            errorEl.hidden = false;
          }
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="pay-modal__btn-icon">💳</span> Payer en toute sécurité';
          }
          toast(result.error.message || 'Le paiement a échoué', 'error');
        } else {
          // Payment succeeded (or requires redirect handled by Stripe)
          var pi = result.paymentIntent;
          if (pi && pi.status === 'succeeded') {
            // Update pending order with payment intent ID
            try {
              var pending = JSON.parse(localStorage.getItem('pt_pending_order') || '{}');
              pending.paymentIntentId = pi.id;
              pending.method = 'stripe_elements';
              localStorage.setItem('pt_pending_order', JSON.stringify(pending));
            } catch (_) {}

            if (typeof track === 'function') {
              track('payment_success', { value: total, method: 'card', paymentIntentId: pi.id });
            }

            closePayModal();
            toast('Paiement réussi !', 'success');
            location.hash = '#/merci';
          }
        }
      })
      .catch(function (err) {
        // Réseau coupé / SDK Stripe en erreur : réactiver le bouton, sinon il
        // reste bloqué sur « Traitement en cours… » avec une rejection non gérée.
        console.error('[confirmPayment]', err && err.message);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="pay-modal__btn-icon">💳</span> Payer en toute sécurité';
        }
        if (errorEl) {
          errorEl.textContent = 'Le paiement n\'a pas pu aboutir. Vérifiez votre connexion et réessayez.';
          errorEl.hidden = false;
        }
        toast('Erreur réseau — paiement non abouti', 'error');
      });
      return;
    }

    // Stripe est chargé mais aucun PaymentIntent : l'adresse de livraison
    // n'est pas (encore) valide — guider l'utilisateur au lieu de basculer
    // silencieusement sur un autre moyen de paiement.
    if (stripe && !_stripeClientSecret) {
      var shipCheck = validatePayAddress();
      if (errorEl) {
        errorEl.textContent = shipCheck.valid
          ? 'Le formulaire de paiement se charge — patientez un instant puis réessayez.'
          : 'Renseignez d\'abord votre adresse de livraison (code postal 971xx–976xx).';
        errorEl.hidden = false;
      }
      var firstEmpty = ['payAddrName', 'payAddrLine1', 'payAddrPostal', 'payAddrCity'].map(function (id) {
        return document.getElementById(id);
      }).filter(function (el) { return el && !el.value.trim(); })[0];
      if (firstEmpty) firstEmpty.focus();
      return;
    }

    // ── Fallback: server-side Stripe Checkout (redirect) ──
    var apiConfigured = typeof window.PT_API_BASE === 'string';
    var apiBase = apiBaseUrl();
    if (apiConfigured && !stripe) {
      var btn2 = document.getElementById('payModalConfirm');
      if (btn2) { btn2.disabled = true; btn2.textContent = 'Redirection…'; }

      var coBody = JSON.stringify({
        // Server resolves prices from the catalogue by key — no price is sent.
        items: _payItems.map(function (it) {
          return { key: it.key, title: it.title, qty: it.qty || 1, coffret: !!it.coffret };
        }),
        customerEmail: (_currentUser && _currentUser.email) || undefined,
        territory: _currentTerritory
        // uid retiré du corps (S2) : dérivé de l'ID token vérifié côté serveur.
      });
      jsonAuthHeaders().then(function (headers) {
        return fetch(apiBase + '/api/checkout', { method: 'POST', headers: headers, body: coBody });
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.url) {
          try {
            localStorage.setItem('pt_pending_order', JSON.stringify({
              items: _payItems.map(function (it) { return { key: it.key, title: it.title, price: payUnitCents(it) / 100, qty: it.qty }; }),
              total: total, sessionId: data.sessionId, ts: Date.now()
            }));
          } catch (_) {}
          window.location.href = data.url;
        } else {
          toast(data.error || 'Erreur paiement', 'error');
          if (btn2) { btn2.disabled = false; btn2.textContent = 'Payer par carte'; }
        }
      })
      .catch(function () {
        toast('Erreur réseau — réessayez', 'error');
        if (btn2) { btn2.disabled = false; btn2.textContent = 'Payer par carte'; }
      });
      return;
    }

    // ── Fallback: legacy Payment Links ──
    var first = _payItems[0];
    if (!first || !first.paymentLink) {
      toast('Paiement carte non configuré — bascule sur Crypto.', 'info');
      cryptoSwitchTab('crypto');
      return;
    }
    try {
      localStorage.setItem('pt_pending_order', JSON.stringify({
        items: _payItems.map(function (it) { return { key: it.key, title: it.title, price: payUnitCents(it) / 100, qty: it.qty }; }),
        total: total, ts: Date.now()
      }));
    } catch (_) {}
    window.open(first.paymentLink, '_blank', 'noopener');
    closePayModal();
  }

  function setupPayModal() {
    var modal = document.getElementById('payModal');
    if (!modal) return;
    modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-pay-close')) closePayModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closePayModal();
    });
    var confirm = document.getElementById('payModalConfirm');
    if (confirm) confirm.addEventListener('click', confirmPayment);

    // Onglets
    modal.querySelectorAll('.pay-tab').forEach(function(b){
      b.addEventListener('click', function(){
        cryptoSwitchTab(b.getAttribute('data-pay-tab'));
      });
    });

    // Boutons crypto
    var copyAddr = document.getElementById('cryptopayCopyAddr');
    if (copyAddr) copyAddr.addEventListener('click', function(){
      var a = document.getElementById('cryptopayAddr');
      cryptoCopy(a ? a.textContent : '', copyAddr);
    });
    var copyAmt = document.getElementById('cryptopayCopyAmount');
    if (copyAmt) copyAmt.addEventListener('click', function(){
      var a = document.getElementById('cryptopayAmount');
      cryptoCopy(a ? a.textContent : '', copyAmt);
    });
    var cardBtn = document.getElementById('cryptopayCardBtn');
    if (cardBtn) cardBtn.addEventListener('click', cryptoOpenCardOnramp);
    var cryptoConf = document.getElementById('payModalCryptoConfirm');
    if (cryptoConf) cryptoConf.addEventListener('click', cryptoConfirmPaid);
  }

  // Extrait un paramètre d'une query string ('?a=1&b=2' ou 'a=1&b=2').
  function qsParam(qs, name) {
    if (!qs) return null;
    var m = String(qs).replace(/^\?/, '').match(new RegExp('(?:^|&)' + name + '=([^&]*)'));
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  // A5 — preuve de paiement pour /merci. AVANT : l'existence d'un
  // pt_pending_order suffisait à écrire une commande « paid » + créditer la
  // fidélité — or le pending est posé AVANT la confirmation Stripe (paiement
  // abandonné → pending fantôme) et une simple déclaration crypto WhatsApp
  // finissait aussi en « paid ». Trois preuves acceptées :
  //  1. inline  : pending.paymentIntentId — écrit UNIQUEMENT dans la branche
  //     pi.status === 'succeeded' de confirmPayment ;
  //  2. redirect: ?redirect_status=succeeded&payment_intent=pi_… posé par
  //     Stripe AVANT le hash au retour 3DS (location.search) ;
  //  3. session : #/merci?session_id=cs_… (Stripe Checkout ne redirige vers
  //     success_url qu'après paiement) ET correspondance avec le sessionId
  //     mémorisé au départ vers Stripe.
  // La déclaration crypto n'est PAS une preuve : commande 'declared' (à
  // vérifier via TXID), zéro point fidélité.
  function merciPaymentProof(pending) {
    var redirectStatus = qsParam(location.search, 'redirect_status');
    if (redirectStatus && redirectStatus !== 'succeeded') {
      return { ok: false, reason: 'redirect_' + redirectStatus };
    }
    if (pending.paymentIntentId) {
      return { ok: true, kind: 'card', paymentIntentId: pending.paymentIntentId };
    }
    if (redirectStatus === 'succeeded') {
      return { ok: true, kind: 'card', paymentIntentId: qsParam(location.search, 'payment_intent') || null };
    }
    var hashQ = location.hash.indexOf('?') !== -1 ? location.hash.slice(location.hash.indexOf('?')) : '';
    var sessionId = qsParam(hashQ, 'session_id');
    if (sessionId && pending.sessionId && sessionId === pending.sessionId) {
      return { ok: true, kind: 'card', sessionId: sessionId };
    }
    if (String(pending.method || '').indexOf('crypto:') === 0) {
      return { ok: true, kind: 'crypto' };
    }
    return { ok: false, reason: 'no_proof' };
  }

  function handleMerciPage() {
    // Called when route changes to /merci
    var pending = null;
    try { pending = JSON.parse(localStorage.getItem('pt_pending_order') || 'null'); } catch (e) {}
    if (!pending) return;

    // Pending périmé (>2 h) : reliquat d'un paiement abandonné — on le purge
    // sans rien écrire.
    var MAX_PENDING_AGE = 2 * 3600 * 1000;
    if (!pending.ts || (Date.now() - pending.ts) > MAX_PENDING_AGE) {
      try { localStorage.removeItem('pt_pending_order'); } catch (_) {}
      return;
    }

    var proof = merciPaymentProof(pending);
    if (!proof.ok) {
      // Échec explicite du retour 3DS → purge (le paiement n'a pas eu lieu).
      // Sans preuve du tout : on laisse le pending en place (un retour
      // redirect légitime peut encore arriver), la garde 2 h le purgera.
      if (String(proof.reason).indexOf('redirect_') === 0) {
        try { localStorage.removeItem('pt_pending_order'); } catch (_) {}
      }
      return;
    }

    // Preuve obtenue : consommer le pending AVANT tout effet — un refresh de
    // /merci ne peut plus recréditer la fidélité ni dupliquer la commande.
    try { localStorage.removeItem('pt_pending_order'); } catch (_) {}

    var isCrypto = proof.kind === 'crypto';
    var lines = Array.isArray(pending.items) ? pending.items : [];
    var totalNum = Number(pending.total) || 0;

    // Course de livraison quincaillerie PAYÉE : finaliser sa création avec la
    // preuve (paymentIntentId). Le serveur vérifie le paiement chez Stripe et
    // crée la course depuis la metadata — idempotent avec le webhook (doc id
    // = pi.id), donc aucun doublon si les deux chemins passent.
    if (pending.course && proof.paymentIntentId) {
      jsonAuthHeaders().then(function (headers) {
        return fetch(apiBaseUrl() + '/api/contact', {
          method: 'POST', headers: headers,
          body: JSON.stringify({ type: 'course-create', paymentIntentId: proof.paymentIntentId })
        });
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) {
          toast('🛵 Course créée — les livreurs sont alertés par email', 'success');
          // Photo du chantier prise à la commande → jointe à la course créée.
          var scene = null;
          try { scene = sessionStorage.getItem('pt_course_scene'); } catch (_) {}
          if (scene && d.course && d.course.id) {
            jsonAuthHeaders().then(function (headers) {
              return fetch(apiBaseUrl() + '/api/contact', {
                method: 'POST', headers: headers,
                body: JSON.stringify({ type: 'course-scene', id: d.course.id, photo: scene })
              });
            }).then(function (r2) { return r2.json(); }).then(function (d2) {
              if (d2.ok) { try { sessionStorage.removeItem('pt_course_scene'); } catch (_) {} }
            }).catch(function () {});
          }
        } else if (d.error) toast('Livraison : ' + d.error, 'error');
      }).catch(function () {});
    }

    if (!isCrypto) {
      // Fidélité locale : uniquement sur paiement carte prouvé. La déclaration
      // crypto sera valorisée après vérification humaine du TXID.
      addLoyaltyPurchase(totalNum);
      if (typeof track === 'function') track('purchase', { value: totalNum });
    }

    if (_currentUser && _fb) {
      var ordersRef = _fb.collection(_fb.db, 'users', _currentUser.uid, 'orders');
      _fb.addDoc(ordersRef, {
        // items = NOMBRE de lignes (l'historique du compte affiche
        // « N articles ») ; le détail vit dans `lines`.
        items: lines.length,
        lines: lines,
        total: totalNum,
        date: _fb.serverTimestamp(),
        // S3 : le client N'ÉCRIT JAMAIS 'paid'. 'pending' = paiement carte
        // initié (le webhook Stripe le confirmera en 'paid' via l'Admin SDK,
        // seule source autoritaire) ; 'declared' = crypto à vérifier. Ainsi
        // un utilisateur ne peut plus forger une fausse commande « payée »
        // dans le tableau de bord admin (règle Firestore l'interdit aussi).
        status: isCrypto ? 'declared' : 'pending',
        method: pending.method || 'stripe',
        paymentIntentId: proof.paymentIntentId || pending.paymentIntentId || null,
        // Permet au webhook checkout.session.completed de retrouver et
        // confirmer cette commande (updateOrderWhere stripeSessionId).
        stripeSessionId: proof.sessionId || pending.sessionId || null
      }).catch(function (err) {
        console.warn('[merci] order save failed:', err && err.message);
      });
    }

    // Nettoie les paramètres de retour Stripe de l'URL (?payment_intent=…) :
    // évite tout retraitement au refresh et n'expose pas le client_secret
    // dans l'historique/partage d'URL.
    if (location.search) {
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}
    }
  }

  // Expose openPayModal for cart buttons
  window.openPayModal = openPayModal;

  var _revealIO = null;
  function observeReveals(root) {
    var scope = root || document;
    if (!('IntersectionObserver' in window)) {
      scope.querySelectorAll('[data-reveal], [data-reveal-stagger]').forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }
    if (!_revealIO) {
      _revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
          } else if (e.boundingClientRect.top > 0) {
            e.target.classList.remove('is-visible');
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    }
    scope.querySelectorAll('[data-reveal], [data-reveal-stagger]').forEach(function (el) {
      _revealIO.observe(el);
    });
  }

  function setupRevealAnimations() {
    observeReveals(document);
  }

  // ── Top loading bar ─────────────────────────────────────────
  // Indeterminate slide while booting / returning to home, then
  // ramps to 100% and fades out. Pure CSS-driven, no deps.
  var _ptLoadEl = null, _ptLoadHide = 0;
  function ptLoadBar() {
    if (_ptLoadEl) return _ptLoadEl;
    _ptLoadEl = document.getElementById('pt-loadbar');
    return _ptLoadEl;
  }
  function ptLoadStart() {
    var el = ptLoadBar(); if (!el) return;
    clearTimeout(_ptLoadHide);
    el.classList.remove('is-done');
    el.classList.add('is-on', 'is-indet');
    var bar = el.firstElementChild;
    if (bar) bar.style.width = '';
  }
  function ptLoadDone() {
    var el = ptLoadBar(); if (!el) return;
    el.classList.remove('is-indet');
    var bar = el.firstElementChild;
    if (bar) { bar.style.width = '100%'; }
    clearTimeout(_ptLoadHide);
    _ptLoadHide = setTimeout(function(){
      el.classList.remove('is-on');
      if (bar) bar.style.width = '0%';
    }, 360);
  }
  // Boot: show until window load (or 4s safety)
  ptLoadStart();
  var _ptBootDone = false;
  function ptBootFinish(){ if (_ptBootDone) return; _ptBootDone = true; ptLoadDone(); }
  if (document.readyState === 'complete') {
    setTimeout(ptBootFinish, 250);
  } else {
    window.addEventListener('load', function(){ setTimeout(ptBootFinish, 200); }, { once:true });
    setTimeout(ptBootFinish, 4000);
  }
  // Re-show on every navigation back to the home route
  window.addEventListener('hashchange', function(){
    var h = (location.hash || '').replace(/^#/, '') || '/';
    if (h === '/' || h === '' || h === '/home') {
      ptLoadStart();
      setTimeout(ptLoadDone, 700);
    }
  });

  // ── <model-viewer> hover-rotate (product cards) ────────────
  // Cards stay still by default; auto-rotate only while hovered
  // (or focused via keyboard). Saves CPU/GPU on long lists.
  document.addEventListener('pointerenter', function (e) {
    var t = e.target;
    if (t && t.nodeType === 1 && t.classList && t.classList.contains('product-card__model')) {
      t.setAttribute('auto-rotate', '');
    }
  }, true);
  document.addEventListener('pointerleave', function (e) {
    var t = e.target;
    if (t && t.nodeType === 1 && t.classList && t.classList.contains('product-card__model')) {
      t.removeAttribute('auto-rotate');
    }
  }, true);

  // ── <model-viewer> error surfacing ─────────────────────────
  // Listen for failed model loads at the document level so we can
  // tell the user (and ourselves) what's wrong.
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'MODEL-VIEWER') {
      try { console.error('[model-viewer error]', t.id || t.className, t.src); } catch (_) {}
    }
  }, true);

  // ── <model-viewer> preloader ───────────────────────────────
  // Upgrades loading="lazy" → "eager" as soon as a viewer is within
  // ~700px of the viewport, so models are ready by the time the user
  // scrolls to them. Single shared IO, survives DOM re-renders.
  var _mvPreloadIO = null;
  function getMvPreloadIO() {
    if (_mvPreloadIO || !('IntersectionObserver' in window)) return _mvPreloadIO;
    _mvPreloadIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var mv = e.target;
        // Un <model-viewer> approche du viewport → charge le script à la demande
        // (idempotent) puis marque-le eager. L'élément s'upgrade dès définition.
        // .catch : si le CDN tombe, on garde le poster/fallback, pas de rejet nu.
        ensureModelViewer().catch(function () {});
        mv.setAttribute('loading', 'eager');
        _mvPreloadIO.unobserve(mv);
      });
    }, { rootMargin: '700px 0px 700px 0px' });
    return _mvPreloadIO;
  }
  function preloadModelViewers(root) {
    var io = getMvPreloadIO();
    var scope = root || document;
    var list = scope.querySelectorAll('model-viewer[loading="lazy"]');
    if (!io) {
      list.forEach(function (mv) { mv.setAttribute('loading', 'eager'); });
      return;
    }
    list.forEach(function (mv) { io.observe(mv); });
  }

  // ── Admin panel (#/admin) ──────────────────────────────────
  // Stock + price editing backed by POST /api/admin.
  // Auth : user enters ADMIN_SECRET — stored only in sessionStorage.

  var ADMIN_SECRET_KEY = 'pt_admin_secret';

  function getAdminSecret() {
    try { return sessionStorage.getItem(ADMIN_SECRET_KEY) || ''; }
    catch (e) { return ''; }
  }
  function setAdminSecret(val) {
    try {
      if (val) sessionStorage.setItem(ADMIN_SECRET_KEY, val);
      else sessionStorage.removeItem(ADMIN_SECRET_KEY);
    } catch (e) { /* silent */ }
  }

  // En-têtes d'une requête admin (H6). Toujours X-Admin-Secret (voie
  // transitoire) ; on AJOUTE Authorization: Bearer si un compte Firebase est
  // connecté (voie claim admin, à privilégier). Le serveur accepte l'une OU
  // l'autre — migration sans coupure, et le secret peut être retiré une fois
  // le claim vérifié. Résout toujours (jamais de rejet).
  function adminAuthHeaders(extra) {
    var headers = Object.assign({ 'X-Admin-Secret': getAdminSecret() }, extra || {});
    var user = _currentUser;
    if (user && typeof user.getIdToken === 'function') {
      return user.getIdToken().then(function (tok) {
        headers['Authorization'] = 'Bearer ' + tok;
        return headers;
      }).catch(function () { return headers; });
    }
    return Promise.resolve(headers);
  }

  function adminFetch(method, body) {
    var apiBase = apiBaseUrl();
    return adminAuthHeaders({ 'Content-Type': 'application/json' }).then(function (headers) {
      var opts = { method: method, headers: headers };
      if (body) opts.body = JSON.stringify(body);
      return fetch(apiBase + '/api/admin', opts);
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
      });
    });
  }

  // GET /api/admin?type=… (authentifié). Renvoie le JSON validé.
  function adminGet(type) {
    var apiBase = apiBaseUrl();
    return adminAuthHeaders().then(function (headers) {
      return fetch(apiBase + '/api/admin?type=' + encodeURIComponent(type), { method: 'GET', headers: headers });
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
      });
    });
  }

  // POST /api/admin?type=… (authentifié). Renvoie le JSON validé.
  function adminPostType(type, body) {
    var apiBase = apiBaseUrl();
    return adminAuthHeaders({ 'Content-Type': 'application/json' }).then(function (headers) {
      return fetch(apiBase + '/api/admin?type=' + encodeURIComponent(type), {
        method: 'POST', headers: headers, body: JSON.stringify(body || {})
      });
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
      });
    });
  }

  // ── Dashboard : Statistiques ───────────────────────────────
  var _adminStatsLoaded = false;
  function loadAdminStats(force) {
    var el = document.getElementById('adminStats');
    if (!el) return;
    if (_adminStatsLoaded && !force) return;
    _adminStatsLoaded = true;
    el.innerHTML = '<p class="admin-loading">Chargement…</p>';
    adminGet('stats').then(function (data) {
      renderAdminStats(el, data.stats || {});
    }).catch(function (e) {
      el.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>';
    });
  }

  function statCard(label, value, sub) {
    return '<div class="stat-card">'
      + '<span class="stat-card__value">' + escapeHTML(String(value)) + '</span>'
      + '<span class="stat-card__label">' + escapeHTML(label) + '</span>'
      + (sub ? '<span class="stat-card__sub">' + escapeHTML(sub) + '</span>' : '')
      + '</div>';
  }

  function fmtDuration(ms) {
    ms = Number(ms) || 0;
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' s';
    var m = Math.floor(s / 60); var r = s % 60;
    return m + ' min ' + (r < 10 ? '0' + r : r) + ' s';
  }

  function barRows(map, opts) {
    var entries = Object.keys(map || {}).map(function (k) { return [k, Number(map[k]) || 0]; });
    if (!entries.length) return '<p class="admin-empty">Aucune donnée pour le moment.</p>';
    entries.sort(function (a, b) { return b[1] - a[1]; });
    if (opts && opts.limit) entries = entries.slice(0, opts.limit);
    var max = entries[0][1] || 1;
    return '<div class="stat-bars">' + entries.map(function (e) {
      var pct = Math.round((e[1] / max) * 100);
      return '<div class="stat-bar">'
        + '<span class="stat-bar__label">' + escapeHTML(e[0]) + '</span>'
        + '<span class="stat-bar__track"><span class="stat-bar__fill" style="width:' + pct + '%"></span></span>'
        + '<span class="stat-bar__val">' + e[1] + '</span>'
        + '</div>';
    }).join('') + '</div>';
  }

  function productTitleByKey(key) {
    var p = findProductByKey(key);
    return p ? (p.brand + ' — ' + p.title) : key;
  }

  function renderAdminStats(el, s) {
    var t = s.totals || {};
    var totalVisitors = (t.newVisitors || 0) + (t.returningVisitors || 0);
    var html = '';

    // Compteurs principaux.
    html += '<div class="stat-grid">'
      + statCard('Visites', t.sessions || 0)
      + statCard('Pages vues', t.pageViews || 0)
      + statCard('Clics', t.clicks || 0)
      + statCard('Visiteurs identifiés', totalVisitors, 'consentis')
      + statCard('Nouveaux', t.newVisitors || 0)
      + statCard('Récurrents', t.returningVisitors || 0)
      + '</div>';

    // Appareils + sources.
    html += '<div class="stat-cols">'
      + '<section class="stat-block"><h3 class="stat-block__title">Appareils</h3>' + barRows(s.devices) + '</section>'
      + '<section class="stat-block"><h3 class="stat-block__title">Sources de trafic</h3>' + barRows(s.sources) + '</section>'
      + '</div>';

    // Produits les plus consultés (+ temps moyen).
    html += '<section class="stat-block"><h3 class="stat-block__title">Produits les plus consultés</h3>';
    var prods = (s.products || []).filter(function (p) { return p.views || p.selects || p.addToCart; }).slice(0, 15);
    if (!prods.length) {
      html += '<p class="admin-empty">Aucune consultation enregistrée pour le moment.</p>';
    } else {
      html += '<table class="stat-table"><thead><tr><th>Produit</th><th>Vues</th><th>Clics</th><th>Panier</th><th>Achats</th><th>Temps moy.</th></tr></thead><tbody>';
      prods.forEach(function (p) {
        html += '<tr>'
          + '<td>' + escapeHTML(productTitleByKey(p.productId)) + '</td>'
          + '<td>' + (p.views || 0) + '</td>'
          + '<td>' + (p.selects || 0) + '</td>'
          + '<td>' + (p.addToCart || 0) + '</td>'
          + '<td>' + (p.purchases || 0) + '</td>'
          + '<td>' + fmtDuration(p.avgTimeMs) + '</td>'
          + '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '</section>';

    // Clics ultra-précis.
    html += '<section class="stat-block"><h3 class="stat-block__title">Clics — sur quoi et combien de fois</h3>';
    var clicks = (s.clicks || []).slice(0, 20);
    if (!clicks.length) {
      html += '<p class="admin-empty">Aucun clic instrumenté pour le moment.</p>';
    } else {
      var cmap = {};
      clicks.forEach(function (c) { cmap[c.label] = c.count; });
      html += barRows(cmap, { limit: 20 });
    }
    html += '</section>';

    // Provenance : globe 3D (si des coordonnées existent) + liste par pays.
    html += '<section class="stat-block"><h3 class="stat-block__title">Provenance des visiteurs</h3>';
    var geo = (s.geo || []);
    if (!geo.length) {
      html += '<p class="admin-empty">Aucune donnée géographique pour le moment.</p>';
    } else {
      html += '<div id="adminGlobe" class="admin-globe" aria-hidden="true"></div>';
      var gmap = {};
      geo.slice(0, 15).forEach(function (g) { gmap[countryName(g.country)] = g.count; });
      html += barRows(gmap, { limit: 15 });
    }
    html += '</section>';

    el.innerHTML = html;

    // Globe 3D (lazy, three.js déjà utilisé pour les sphères de marque). En cas
    // d'échec (CDN/WebGL), la liste par pays ci-dessus reste la source fiable.
    destroyAdminGlobe();
    if (geo.length) {
      var container = document.getElementById('adminGlobe');
      if (container) buildAdminGlobe(container, geo);
    }
  }

  // ── Globe 3D de provenance (three.js, sans texture externe) ────────────────
  // Coordonnées de repli pour les pays fréquents / DOM-TOM quand un document géo
  // ne porte pas de lat/lng (les en-têtes Vercel en fournissent la plupart).
  var COUNTRY_LATLNG = {
    FR:[46.6,2.2], GP:[16.25,-61.58], MQ:[14.64,-61.02], GF:[3.93,-53.13],
    RE:[-21.11,55.53], YT:[-12.82,45.17], US:[38,-97], GB:[54,-2], DE:[51,10],
    BE:[50.5,4.5], ES:[40,-4], IT:[42,12], CA:[56,-106], NL:[52,5], CH:[47,8],
    PT:[39,-8], LU:[49.8,6.1], MA:[32,-6], SN:[14.5,-14.5], CI:[7.5,-5.5]
  };
  // Code ISO pays → nom complet (FR). Sert à afficher des noms lisibles dans la
  // liste de provenance de l'admin plutôt que des initiales. Fallback = le code.
  var COUNTRY_NAME = {
    FR:'France', GP:'Guadeloupe', MQ:'Martinique', GF:'Guyane', RE:'La Réunion',
    YT:'Mayotte', PM:'Saint-Pierre-et-Miquelon', BL:'Saint-Barthélemy', MF:'Saint-Martin',
    NC:'Nouvelle-Calédonie', PF:'Polynésie française', WF:'Wallis-et-Futuna', TF:'TAAF',
    US:'États-Unis', GB:'Royaume-Uni', DE:'Allemagne', BE:'Belgique', ES:'Espagne',
    IT:'Italie', CA:'Canada', NL:'Pays-Bas', CH:'Suisse', PT:'Portugal', LU:'Luxembourg',
    MA:'Maroc', SN:'Sénégal', CI:'Côte d\'Ivoire', IE:'Irlande', AT:'Autriche', SE:'Suède',
    NO:'Norvège', DK:'Danemark', FI:'Finlande', PL:'Pologne', CZ:'Tchéquie', GR:'Grèce',
    RO:'Roumanie', HU:'Hongrie', BG:'Bulgarie', HR:'Croatie', SK:'Slovaquie', SI:'Slovénie',
    LT:'Lituanie', LV:'Lettonie', EE:'Estonie', CY:'Chypre', MT:'Malte', MX:'Mexique',
    BR:'Brésil', AR:'Argentine', JP:'Japon', CN:'Chine', IN:'Inde', AU:'Australie',
    NZ:'Nouvelle-Zélande', ZA:'Afrique du Sud', DZ:'Algérie', TN:'Tunisie', RU:'Russie',
    TR:'Turquie', HT:'Haïti', DO:'République dominicaine', GY:'Guyana', SR:'Suriname',
    BB:'Barbade', LC:'Sainte-Lucie', DM:'Dominique', AG:'Antigua-et-Barbuda',
    TT:'Trinité-et-Tobago', VE:'Venezuela', CO:'Colombie', CM:'Cameroun', GA:'Gabon',
    BJ:'Bénin', TG:'Togo', ML:'Mali', BF:'Burkina Faso', NE:'Niger', GN:'Guinée',
    CD:'Congo (RDC)', CG:'Congo', MG:'Madagascar', MU:'Maurice'
  };
  // Intl.DisplayNames couvre TOUS les pays ISO en français (natif navigateur,
  // aucune ressource externe). Repli sur la table ci-dessus pour les très vieux
  // navigateurs, puis sur le code brut si vraiment inconnu.
  var _regionNames = null;
  try {
    if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
      _regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });
    }
  } catch (_) { _regionNames = null; }
  function countryName(code) {
    if (!code) return 'Inconnu';
    if (_regionNames) {
      try { var n = _regionNames.of(code); if (n && n !== code) return n; } catch (_) {}
    }
    return COUNTRY_NAME[code] || code;
  }
  var _adminGlobe = null;

  function destroyAdminGlobe() {
    if (!_adminGlobe) return;
    try {
      if (_adminGlobe.raf) cancelAnimationFrame(_adminGlobe.raf);
      if (_adminGlobe.ro) _adminGlobe.ro.disconnect();
      if (_adminGlobe.renderer) {
        _adminGlobe.renderer.dispose();
        var c = _adminGlobe.renderer.domElement;
        if (c && c.parentNode) c.parentNode.removeChild(c);
      }
      (_adminGlobe.disposables || []).forEach(function (d) { try { d.dispose(); } catch (_) {} });
    } catch (_) {}
    _adminGlobe = null;
  }

  function latLngToVec3(THREE, lat, lng, r) {
    var phi = (90 - lat) * Math.PI / 180;
    var theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }

  // Côtes du monde (contours continents) — chargées à la demande, en cache, et
  // UNIQUEMENT par le globe admin (fichier same-origin, jamais sur les pages
  // publiques). Échec → [] (le globe se dessine sans les continents).
  var _coastlineCache = null;
  function loadCoastline() {
    if (_coastlineCache) return Promise.resolve(_coastlineCache);
    return fetch('world-coastline.json')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (j) { _coastlineCache = Array.isArray(j) ? j : []; return _coastlineCache; })
      .catch(function () { _coastlineCache = []; return _coastlineCache; });
  }

  function buildAdminGlobe(container, geo) {
    // Points géolocalisables (coord fournie OU repli connu).
    var pts = [];
    geo.forEach(function (g) {
      var lat = (typeof g.lat === 'number') ? g.lat : (COUNTRY_LATLNG[g.country] && COUNTRY_LATLNG[g.country][0]);
      var lng = (typeof g.lng === 'number') ? g.lng : (COUNTRY_LATLNG[g.country] && COUNTRY_LATLNG[g.country][1]);
      if (typeof lat === 'number' && typeof lng === 'number') pts.push({ lat: lat, lng: lng, count: g.count || 1 });
    });
    if (!pts.length) return; // rien à placer → on garde la liste seule

    Promise.all([ensureThree(), loadCoastline()]).then(function (r) {
      var THREE = r[0]; var coast = r[1] || [];
      if (!document.body.contains(container)) return; // onglet déjà quitté
      destroyAdminGlobe();
      var w = container.clientWidth || 320;
      var h = container.clientHeight || 320;

      var renderer;
      try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
      catch (_) { return; } // WebGL indisponible → liste seule
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
      camera.position.z = 3.15;
      var group = new THREE.Group();
      scene.add(group);

      var disposables = [];
      var R = 1;

      // Sphère OPAQUE sombre : occulte (depth-test) les côtes et points de la
      // face arrière → on ne voit que l'hémisphère visible = zone précise.
      var sphereGeo = new THREE.SphereGeometry(R, 48, 48);
      var sphereMat = new THREE.MeshBasicMaterial({ color: 0x140a26 });
      group.add(new THREE.Mesh(sphereGeo, sphereMat));
      disposables.push(sphereGeo, sphereMat);

      // Contours des continents (côtes simplifiées) en violet clair.
      if (coast.length) {
        var coastMat = new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.6 });
        disposables.push(coastMat);
        coast.forEach(function (line) {
          var v = [];
          for (var k = 0; k < line.length; k++) v.push(latLngToVec3(THREE, line[k][1], line[k][0], R * 1.004));
          var g = new THREE.BufferGeometry().setFromPoints(v);
          disposables.push(g);
          group.add(new THREE.Line(g, coastMat));
        });
      }

      // Quadrillage TRÈS discret (juste pour la lecture du globe).
      var gratMat = new THREE.LineBasicMaterial({ color: 0x6d5b9e, transparent: true, opacity: 0.10 });
      disposables.push(gratMat);
      var lat, lng, ring, i;
      for (lat = -60; lat <= 60; lat += 30) {
        ring = [];
        for (i = 0; i <= 64; i++) ring.push(latLngToVec3(THREE, lat, (i / 64) * 360 - 180, R * 1.001));
        var gr = new THREE.BufferGeometry().setFromPoints(ring); disposables.push(gr);
        group.add(new THREE.LineLoop(gr, gratMat));
      }
      for (lng = -150; lng < 180; lng += 30) {
        ring = [];
        for (i = 0; i <= 64; i++) ring.push(latLngToVec3(THREE, (i / 64) * 180 - 90, lng, R * 1.001));
        var gm = new THREE.BufferGeometry().setFromPoints(ring); disposables.push(gm);
        group.add(new THREE.Line(gm, gratMat));
      }

      // Points visiteurs : PETITS et précis (zone exacte), légère variation de
      // taille selon le volume, halo discret. Occultés en face arrière.
      var maxCount = pts.reduce(function (m, p) { return Math.max(m, p.count); }, 1);
      var markGeo = new THREE.SphereGeometry(1, 12, 12);
      var markMat = new THREE.MeshBasicMaterial({ color: 0xf0abfc });
      disposables.push(markGeo, markMat);
      pts.forEach(function (p) {
        var scale = 0.006 + 0.010 * Math.sqrt(p.count / maxCount); // beaucoup plus petit
        var v = latLngToVec3(THREE, p.lat, p.lng, R * 1.008);
        var m = new THREE.Mesh(markGeo, markMat);
        m.position.copy(v); m.scale.setScalar(scale);
        group.add(m);
        var halo = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xf0abfc, transparent: true, opacity: 0.25 }));
        halo.position.copy(v); halo.scale.setScalar(scale * 2.4);
        group.add(halo);
        disposables.push(halo.material);
      });

      // Oriente l'Atlantique/Europe-Afrique vers l'avant, légère inclinaison.
      group.rotation.x = 0.35;
      group.rotation.y = -Math.PI * 0.5;

      // ── Interaction : faire tourner le globe au doigt / à la souris ────────
      // Pointer Events (souris + tactile iPad unifiés) + setPointerCapture pour
      // suivre le geste hors du canvas. Les écouteurs sont sur le CANVAS → ils
      // disparaissent avec lui au nettoyage (aucune fuite). touch-action:none
      // empêche la page de défiler pendant qu'on manipule le globe.
      var dragging = false, lastX = 0, lastY = 0;
      var canvas = renderer.domElement;
      canvas.style.cursor = 'grab';
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', function (e) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        canvas.style.cursor = 'grabbing';
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        group.rotation.y += dx * 0.006;
        // Inclinaison bornée (on ne bascule pas par-dessus les pôles).
        group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + dy * 0.006));
      });
      function endDrag() { dragging = false; canvas.style.cursor = 'grab'; }
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);

      var raf = null;
      function animate() {
        // Auto-rotation douce quand l'utilisateur ne manipule pas le globe.
        if (!dragging) group.rotation.y += 0.0018;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
        if (_adminGlobe) _adminGlobe.raf = raf;
      }

      var ro = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(function () {
          var nw = container.clientWidth, nh = container.clientHeight;
          if (nw && nh) { renderer.setSize(nw, nh); camera.aspect = nw / nh; camera.updateProjectionMatrix(); }
        });
        ro.observe(container);
      }

      _adminGlobe = { renderer: renderer, ro: ro, disposables: disposables, raf: null };
      animate();
    }).catch(function () { /* three/côtes KO → la liste par pays reste affichée */ });
  }

  // Déclenche l'envoi du rapport mensuel maintenant (test manuel). POST
  // authentifié /api/cron-report → mail Resend + purge. Résout côté serveur.
  function sendAdminReport() {
    var btn = document.getElementById('adminReportBtn');
    var status = document.getElementById('adminReportStatus');
    if (btn) btn.disabled = true;
    if (status) { status.textContent = 'Envoi…'; status.className = 'admin-row__status'; }
    var apiBase = apiBaseUrl();
    adminAuthHeaders({ 'Content-Type': 'application/json' }).then(function (headers) {
      return fetch(apiBase + '/api/cron-report', { method: 'POST', headers: headers, body: '{}' });
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, data: j }; });
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (!status) return;
      if (res.ok && res.data.ok && res.data.sent) {
        status.textContent = '✓ Rapport envoyé (' + res.data.period + ')';
        status.className = 'admin-row__status admin-row__status--ok';
      } else {
        status.textContent = '✗ ' + ((res.data && (res.data.mailError || res.data.error)) || 'Échec');
        status.className = 'admin-row__status admin-row__status--err';
      }
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      if (status) { status.textContent = '✗ ' + e.message; status.className = 'admin-row__status admin-row__status--err'; }
    });
  }

  // ── Dashboard : Clients ────────────────────────────────────
  var _adminClientsLoaded = false;
  function loadAdminClients(force) {
    var el = document.getElementById('adminClients');
    if (!el) return;
    if (_adminClientsLoaded && !force) return;
    _adminClientsLoaded = true;
    el.innerHTML = '<p class="admin-loading">Chargement…</p>';
    adminGet('clients').then(function (data) {
      renderAdminClients(el, data.clients || []);
    }).catch(function (e) {
      el.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>';
    });
  }

  function renderAdminClients(el, clients) {
    if (!clients.length) {
      el.innerHTML = '<p class="admin-empty">Aucun compte client pour le moment.</p>';
      return;
    }
    el.innerHTML = '<p class="admin-count">' + clients.length + ' client' + (clients.length > 1 ? 's' : '') + '</p>'
      + '<div class="client-cards">' + clients.map(function (c) {
        var initial = (c.name || c.email || '?').charAt(0).toUpperCase();
        var tier = (c.loyalty && c.loyalty.tier) ? c.loyalty.tier : '';
        var rows = '';
        if (c.email) rows += '<div class="client-card__row"><span>✉️</span> ' + escapeHTML(c.email) + '</div>';
        if (c.phone) rows += '<div class="client-card__row"><span>📞</span> ' + escapeHTML(c.phone) + '</div>';
        if (c.address) rows += '<div class="client-card__row"><span>📍</span> ' + escapeHTML(c.address) + '</div>';
        return '<article class="client-card">'
          + '<div class="client-card__head">'
          + '<span class="client-card__avatar">' + escapeHTML(initial) + '</span>'
          + '<div class="client-card__id">'
          + '<span class="client-card__name">' + escapeHTML(c.name || 'Sans nom') + '</span>'
          + (tier ? '<span class="client-card__tier">' + escapeHTML(tier) + '</span>' : '')
          + '</div></div>'
          + '<div class="client-card__body">' + rows + '</div>'
          + '<div class="client-card__foot">'
          + '<span>' + (c.orderCount || 0) + ' commande' + ((c.orderCount || 0) > 1 ? 's' : '') + '</span>'
          + (c.createdAt ? '<span>Inscrit le ' + escapeHTML(new Date(c.createdAt).toLocaleDateString('fr-FR')) + '</span>' : '')
          + '</div>'
          + '</article>';
      }).join('') + '</div>';
  }

  // ── Comptabilité & Veille (admin) ──────────────────────────────────────────
  // Pensé SIMPLE (dyspraxie) : une action à la fois, langage clair, gros boutons,
  // texte prêt à copier. Deux blocs : (1) demander un devis transport (CMA CGM &
  // transitaires), (2) veille des taxes officielles avec rappels + validation 1-clic.
  var COMPTA_VEILLE_KEY = 'pt:compta:veille';

  var COMPTA_DEVIS = [
    {
      id: 'cmacgm',
      titre: 'CMA CGM — conteneur complet (20′ / 40′)',
      pour: 'Quand tu passes aux gros volumes (plus de ~10 palettes d’un coup).',
      quand: 'Avant de commander un conteneur, et pour comparer les prix tous les 6 mois.',
      ou: 'En ligne : va sur cma-cgm.com → crée un compte pro gratuit → outil de devis « SpotOn » (devis instantané).',
      url: 'https://www.cma-cgm.com',
      etapes: [
        'Ouvre cma-cgm.com et crée un compte professionnel (gratuit).',
        'Cherche « SpotOn » ou « Demander un devis / Quote ».',
        'Origine : Le Havre ou Marseille-Fos. Destination : Pointe-à-Pitre (Guadeloupe).',
        'Colle le texte ci-dessous si un message est demandé, et remplis les [À COMPLÉTER].'
      ],
      texte: 'Bonjour,\n\nJe souhaite un devis pour un transport maritime :\n- Origine : Le Havre ou Marseille-Fos (France métropole)\n- Destination : Pointe-à-Pitre (Guadeloupe, 971)\n- Type : conteneur 20′ (ou 40′) — marchandise : outillage électroportatif neuf, sur palettes\n- Volume estimé : [À COMPLÉTER] palettes / m³\n- Fréquence : [ponctuel / mensuel]\n- Je souhaite un devis PORTE-À-PORTE incluant : fret, THC, dédouanement et livraison finale.\n- Merci de préciser si l’octroi de mer est inclus ou en sus.\n\nSociété : [TON NOM / SASU]\nSIRET : [À COMPLÉTER]\nContact : [TON EMAIL / TÉL]\n\nMerci d’avance.\nCordialement,'
    },
    {
      id: 'groupage',
      titre: 'Transitaire groupage — palette seule (LCL)',
      pour: 'Pour envoyer 1 à quelques palettes (moins qu’un conteneur entier).',
      quand: 'Dès que tu passes du colis Colissimo à la palette.',
      ou: 'Contacte un groupeur : Ovrsea (ovrsea.com), Boxtal Pro (boxtal.com), ou un transitaire local des Antilles.',
      url: 'https://www.ovrsea.com',
      etapes: [
        'Choisis un groupeur (Ovrsea, Boxtal Pro, ou un transitaire antillais).',
        'Utilise leur formulaire de contact / devis en ligne.',
        'Colle le texte ci-dessous et remplis les [À COMPLÉTER].'
      ],
      texte: 'Bonjour,\n\nJe cherche un tarif de GROUPAGE MARITIME (LCL) :\n- Origine : France métropole\n- Destination : Pointe-à-Pitre (Guadeloupe, 971)\n- Marchandise : outillage électroportatif neuf, sur palette(s) Europe 120×80\n- Dimensions/poids par palette : [ex. 120×80×120 cm, ~400 kg]\n- Nombre de palettes : [À COMPLÉTER]\n- Valeur de la marchandise : [À COMPLÉTER] € (pour l’assurance et l’octroi)\n- Merci d’un tarif au m³ (W/M) + les frais fixes (dédouanement, livraison finale).\n- Merci de préciser si l’octroi de mer est inclus.\n\nSociété : [TON NOM / SASU] — SIRET [À COMPLÉTER]\nContact : [EMAIL / TÉL]\n\nMerci beaucoup.\nCordialement,'
    }
  ];

  var COMPTA_VEILLE = [
    { id: 'octroi', titre: 'Octroi de mer (taux par produit)', freqMois: 6,
      url: 'https://www.douane.gouv.fr',
      etapes: ['Va sur douane.gouv.fr', 'Cherche « octroi de mer Guadeloupe », catégorie outillage', 'Compare avec ton logiciel (aujourd’hui : 7 % + 2,5 %)', 'Si différent → corrige dans les Réglages du calculateur'] },
    { id: 'is', titre: 'Barème impôt sur les sociétés (IS)', freqMois: 12,
      url: 'https://www.impots.gouv.fr',
      etapes: ['Va sur impots.gouv.fr', 'Cherche « taux impôt sur les sociétés »', 'Vérifie : 15 % jusqu’à 42 500 € de bénéfice, puis 25 %', 'Change surtout en janvier (loi de finances)'] },
    { id: 'tva', titre: 'TVA Guadeloupe', freqMois: 12,
      url: 'https://www.impots.gouv.fr',
      etapes: ['impots.gouv.fr → « TVA DOM »', 'Vérifie le taux normal Guadeloupe (aujourd’hui 8,5 %)', 'Corrige si besoin'] },
    { id: 'colissimo', titre: 'Grille Colissimo Outre-mer (poids/prix)', freqMois: 12,
      url: 'https://www.laposte.fr/tarif-colissimo-outre-mer',
      etapes: ['laposte.fr → « tarif Colissimo Outre-mer »', 'Note les prix par tranche (0,5 / 1 / 2 / 5 / 10 / 30 kg)', 'Mets à jour la grille du calculateur (nouveaux tarifs chaque janvier)'] }
  ];

  function comptaState() {
    try { return JSON.parse(localStorage.getItem(COMPTA_VEILLE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function comptaSetChecked(id) {
    var s = comptaState(); s[id] = Date.now();
    try { localStorage.setItem(COMPTA_VEILLE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function comptaCopy(text, btn) {
    function done() { toast('Texte copié — colle-le dans ton email / le formulaire', 'success'); if (btn) { var o = btn.textContent; btn.textContent = '✓ Copié !'; setTimeout(function () { btn.textContent = o; }, 1800); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { comptaFallbackCopy(text); done(); });
    } else { comptaFallbackCopy(text); done(); }
  }
  function comptaFallbackCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta);
  }

  function renderAdminCompta() {
    var el = document.getElementById('adminComptaBody');
    if (!el) return;
    var st = comptaState();
    var now = Date.now();
    var html = '';

    html += '<p class="admin-hint">Ta page pour <b>voir tes comptes</b>, <b>calculer tes prix</b>, <b>demander les devis transport</b> et <b>garder les taxes à jour</b>. Une chose à la fois. 👍</p>';

    // ── Bloc SYNTHÈSE COMPTABLE (rempli après chargement) ──────
    html += '<h2 class="admin-subtitle">📊 Synthèse comptable</h2>';
    html += '<div class="compta-actions" style="margin-bottom:8px"><button type="button" class="btn primary" id="comptaExportPdf">📄 Exporter en PDF</button><button type="button" class="btn btn--ghost" id="comptaReloadAcc">↻ Rafraîchir</button></div>';
    html += '<div id="comptaReport"><p class="admin-loading">Chargement des comptes…</p></div>';

    // ── Bloc 0 : calculateur & prix automatiques (rempli après chargement config) ─
    html += '<h2 class="admin-subtitle">🧮 Calculateur &amp; prix automatiques</h2>';
    html += '<div id="comptaCalc"><p class="admin-loading">Chargement de la config…</p></div>';

    // ── Bloc 1 : demander un devis ─────────────────────────────
    html += '<h2 class="admin-subtitle">📦 Demander un devis transport</h2>';
    html += '<div class="compta-cards">';
    COMPTA_DEVIS.forEach(function (d) {
      html += '<article class="compta-card">'
        + '<h3 class="compta-card__title">' + escapeHTML(d.titre) + '</h3>'
        + '<p class="compta-line"><span class="compta-lbl">Pour quoi :</span> ' + escapeHTML(d.pour) + '</p>'
        + '<p class="compta-line"><span class="compta-lbl">Quand :</span> ' + escapeHTML(d.quand) + '</p>'
        + '<p class="compta-line"><span class="compta-lbl">Où :</span> ' + escapeHTML(d.ou) + '</p>'
        + '<ol class="compta-steps">' + d.etapes.map(function (s) { return '<li>' + escapeHTML(s) + '</li>'; }).join('') + '</ol>'
        + '<div class="compta-actions">'
        + '<button type="button" class="btn primary compta-copy" data-copy="' + d.id + '">📋 Copier le texte de demande</button>'
        + '<a class="btn btn--ghost" href="' + escapeHTML(d.url) + '" target="_blank" rel="noopener">Ouvrir le site ↗</a>'
        + '</div>'
        + '<pre class="compta-tpl" id="tpl-' + d.id + '">' + escapeHTML(d.texte) + '</pre>'
        + '</article>';
    });
    html += '</div>';

    // ── Bloc 2 : veille taxes ──────────────────────────────────
    html += '<h2 class="admin-subtitle" style="margin-top:1.6rem">🏛️ Veille des taxes officielles</h2>';
    html += '<p class="admin-hint">Rappels automatiques : quand une carte est <b>orange</b>, il faut vérifier le taux sur le site officiel puis cliquer <b>« C’est vérifié »</b>. Elle repasse au vert jusqu’à la prochaine fois.</p>';
    html += '<div class="compta-cards">';
    COMPTA_VEILLE.forEach(function (v) {
      var last = st[v.id] || 0;
      var due = last ? (last + v.freqMois * 30 * 24 * 3600 * 1000) : 0;
      var todo = !last || now >= due;
      var when = due ? new Date(due).toLocaleDateString('fr-FR') : '—';
      html += '<article class="compta-card' + (todo ? ' compta-card--todo' : '') + '">'
        + '<div class="compta-badge ' + (todo ? 'is-todo' : 'is-ok') + '">' + (todo ? '⚠️ À VÉRIFIER' : '✅ À jour') + '</div>'
        + '<h3 class="compta-card__title">' + escapeHTML(v.titre) + '</h3>'
        + '<p class="compta-line"><span class="compta-lbl">Fréquence :</span> tous les ' + v.freqMois + ' mois'
        + (last ? ' · prochaine : <b>' + when + '</b>' : ' · <b>jamais vérifié</b>') + '</p>'
        + '<ol class="compta-steps">' + v.etapes.map(function (s) { return '<li>' + escapeHTML(s) + '</li>'; }).join('') + '</ol>'
        + '<div class="compta-actions">'
        + '<a class="btn btn--ghost" href="' + escapeHTML(v.url) + '" target="_blank" rel="noopener">Ouvrir le site officiel ↗</a>'
        + '<button type="button" class="btn primary compta-check" data-check="' + v.id + '">✅ C’est vérifié</button>'
        + '</div>'
        + '</article>';
    });
    html += '</div>';

    el.innerHTML = html;

    el.querySelectorAll('.compta-copy').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = COMPTA_DEVIS.filter(function (x) { return x.id === b.getAttribute('data-copy'); })[0];
        if (d) comptaCopy(d.texte, b);
      });
    });
    el.querySelectorAll('.compta-check').forEach(function (b) {
      b.addEventListener('click', function () {
        comptaSetChecked(b.getAttribute('data-check'));
        toast('Noté comme vérifié — rappel programmé', 'success');
        renderAdminCompta();
      });
    });

    comptaLoadCalc();
    comptaLoadAccounting();
    var pdfBtn = document.getElementById('comptaExportPdf');
    if (pdfBtn) pdfBtn.onclick = function () { window.print(); };
    var reloadBtn = document.getElementById('comptaReloadAcc');
    if (reloadBtn) reloadBtn.onclick = function () { comptaLoadAccounting(); };
  }

  // Charge la synthèse comptable (revenus réels + résultat estimé).
  function comptaLoadAccounting() {
    var box = document.getElementById('comptaReport');
    if (!box) return;
    box.innerHTML = '<p class="admin-loading">Chargement des comptes…</p>';
    adminGet('accounting').then(function (data) {
      comptaRenderAccounting(box, data.accounting || {}, data.charges || []);
    }).catch(function (e) {
      box.innerHTML = '<p class="admin-error">Comptes indisponibles : ' + escapeHTML(e.message)
        + '<br><span class="admin-hint">(nécessite FIREBASE_SERVICE_ACCOUNT sur Vercel)</span></p>';
    });
  }

  // Compte de résultat 100 % RÉEL + saisie des charges.
  function comptaRenderAccounting(box, a, charges) {
    function eur(n) { return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
    var now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    function row(label, val, strong) { return '<tr class="' + (strong ? 'compta-row--strong' : '') + '"><td>' + escapeHTML(label) + '</td><td class="compta-num">' + escapeHTML(val) + '</td></tr>'; }
    function kpi(label, val, sub) { return '<div class="compta-kpi"><div class="compta-kpi__val">' + escapeHTML(val) + '</div>' + (sub ? '<div class="compta-kpi__sub">' + escapeHTML(sub) + '</div>' : '') + '<div class="compta-kpi__lbl">' + escapeHTML(label) + '</div></div>'; }

    // ── Partie imprimable (PDF) : 100 % réel ──
    var html = '<div id="comptaPrintable">';
    html += '<div class="compta-print-head"><b>Pirates Tools — Compte de résultat</b><span>Édité le ' + now + '</span></div>';
    if (!a.nb_ventes) {
      html += '<div class="compta-card"><p class="compta-line">Aucune vente encaissée pour l\'instant. Dès la 1ʳᵉ vente (paiement Stripe confirmé), tout se remplit ici — chiffres 100 % réels.</p></div>';
    }
    html += '<div class="compta-kpis">'
      + kpi('Chiffre d\'affaires', eur(a.ca_ttc) + ' TTC', eur(a.ca_ht) + ' HT') + kpi('Ventes', (a.nb_ventes || 0) + '')
      + kpi('Marge brute', eur(a.marge_brute), 'HT') + kpi('Résultat net', eur(a.resultat_net), 'HT')
      + '</div>';

    html += '<h3 class="compta-card__title" style="margin-top:1rem">Compte de résultat (réel)</h3>';
    html += '<table class="compta-table">'
      + row('Ventes encaissées (Stripe)', eur(a.ca_ttc) + ' TTC · ' + eur(a.ca_ht) + ' HT')
      + row('− TVA collectée (reversée à l\'État)', eur(a.tva_collectee))
      + row('= Chiffre d\'affaires HT', eur(a.ca_ht), true)
      + row('− Coût des marchandises vendues', eur(a.cogs))
      + row('= Marge brute', eur(a.marge_brute), true)
      + row('− Frais Stripe (réels)', eur(a.frais_stripe))
      + row('− Charges saisies (transport, octroi, CFE, assurance…)', eur(a.charges_saisies))
      + row('= Résultat d\'exploitation', eur(a.resultat_exploitation), true)
      // Mécénat (art. 238 bis CGI) : le don est réintégré fiscalement puis
      // ouvre 60 % de réduction d'IS (plafond max(20 000 €, 0,5 % CA HT)).
      + ((a.mecenat && a.mecenat.dons > 0)
        ? row('Dons mécénat (réintégrés fiscalement)', eur(a.mecenat.dons))
          + row('− Réduction d\'IS mécénat (60 %' + (a.mecenat.report_5_ans > 0 ? ', ' + eur(a.mecenat.report_5_ans) + ' reportés 5 ans' : '') + ')', eur(a.mecenat.reduction_is))
        : '')
      + row('− Impôt sur les sociétés (IS' + ((a.mecenat && a.mecenat.dons > 0) ? ', après réduction mécénat' : '') + ')', eur(a.is))
      + row('= RÉSULTAT NET', eur(a.resultat_net) + ' (' + (a.marge_nette_pct || 0) + ' %)', true)
      + '</table>';

    var tva = a.tva || {};
    var solde = tva.solde_a_reverser || 0;
    html += '<h3 class="compta-card__title" style="margin-top:1rem">TVA — ce que tu dois / ce que tu récupères</h3>';
    html += '<table class="compta-table">'
      + row('TVA collectée sur tes ventes', eur(tva.collectee))
      + row('− TVA déductible (sur tes charges)', eur(tva.deductible))
      + (solde >= 0
          ? row('= À REVERSER à l\'État', eur(solde), true)
          : row('= À RÉCUPÉRER (crédit de TVA, l\'État te rembourse)', eur(-solde), true))
      + '</table>';
    html += '<p class="compta-print-note">💡 La <b>TVA française 20 %</b> que tu paies à cotébrico sur tes achats est <b>déjà récupérée</b> : ton coût des marchandises est compté en HT.</p>';

    if (a.par_mois && a.par_mois.length) {
      html += '<h3 class="compta-card__title" style="margin-top:1rem">Par mois</h3>';
      html += '<table class="compta-table"><tr><th>Mois</th><th class="compta-num">Ventes</th><th class="compta-num">CA TTC</th><th class="compta-num">Marge brute</th></tr>';
      a.par_mois.forEach(function (m) { html += '<tr><td>' + m.mois + '</td><td class="compta-num">' + m.ventes + '</td><td class="compta-num">' + eur(m.ca_ttc) + '</td><td class="compta-num">' + eur(m.ca_ht - m.cogs) + '</td></tr>'; });
      html += '</table>';
    }
    // ── Ventes par marque (preuve pour un partenariat fournisseur) ──
    var brands = a.ventes_par_marque || [];
    var BRAND_TARGETS = { 'DeWALT': 10000 };   // seuil partenariat visé
    html += '<h3 class="compta-card__title" style="margin-top:1rem">Ventes par marque</h3>';
    if (!brands.length) {
      html += '<p class="compta-line">Aucune vente par marque pour l\'instant. Chaque vente incrémente automatiquement le compteur de la marque concernée.</p>';
    } else {
      html += '<table class="compta-table"><tr><th>Marque</th><th class="compta-num">Unités</th><th class="compta-num">Ventes</th><th class="compta-num">CA TTC</th><th class="compta-num">CA HT</th></tr>';
      brands.forEach(function (b) {
        html += '<tr><td>' + escapeHTML(b.marque) + '</td><td class="compta-num">' + (b.unites || 0) + '</td><td class="compta-num">' + (b.ventes || 0) + '</td><td class="compta-num">' + eur(b.ca_ttc) + '</td><td class="compta-num">' + eur(b.ca_ht) + '</td></tr>';
      });
      html += '</table>';
      Object.keys(BRAND_TARGETS).forEach(function (name) {
        var found = brands.filter(function (b) { return String(b.marque).toLowerCase() === name.toLowerCase(); })[0];
        var val = found ? found.ca_ttc : 0;
        var target = BRAND_TARGETS[name];
        var pct = target > 0 ? Math.min(100, Math.round(val / target * 100)) : 0;
        html += '<div class="brand-goal">'
          + '<div class="brand-goal__head"><b>Objectif partenariat ' + escapeHTML(name) + '</b>'
          + '<span>' + eur(val) + ' / ' + eur(target) + ' &middot; ' + pct + ' %</span></div>'
          + '<div class="brand-goal__bar"><span style="width:' + pct + '%"></span></div>'
          + (val >= target
              ? '<div class="brand-goal__ok">✅ Seuil atteint — volume justifiable auprès de ' + escapeHTML(name) + ' (chiffres réels, factures à l\'appui).</div>'
              : '<div class="brand-goal__sub">Encore ' + eur(target - val) + ' de ventes ' + escapeHTML(name) + ' pour atteindre le seuil.</div>')
          + '</div>';
      });
      html += '<p class="compta-print-note">Compteur bâti sur les ventes réelles encaissées (marque snapshotée à chaque vente). Sert de justificatif de volume auprès des marques.</p>';
    }

    if (a.complet === false) {
      html += '<p class="compta-print-note">⚠️ Certaines ventes n\'ont pas de coût d\'achat enregistré (données partielles). Le coût réel sera complet pour toutes les ventes à venir.</p>';
    }
    html += '<p class="compta-print-note"><b>Chiffres réels</b> (revenus Stripe, coût d\'achat snapshoté, frais Stripe, charges saisies). <b>Outil de gestion</b> : il ne remplace pas la tenue officielle des comptes ni tes factures d\'origine (à conserver 10 ans). À faire viser par un expert-comptable.</p>';
    html += '</div>'; // fin imprimable

    // ── Saisie des charges (hors PDF) ──
    html += '<h3 class="compta-card__title" style="margin-top:1.4rem">Enregistrer une charge</h3>';
    html += '<div class="compta-card"><div class="compta-cfg-grid">'
      + '<label>Type<select id="chgCat"><option value="transport">Transport / envois</option><option value="octroi">Octroi de mer</option><option value="achat">Achat marchandise (hors ventes)</option><option value="cfe">CFE</option><option value="assurance">Assurance</option><option value="banque">Frais bancaires</option><option value="autre">Autre</option></select></label>'
      + '<label>Libellé<input type="text" id="chgLabel" placeholder="ex. Colissimo mars"></label>'
      + '<label>Montant HT (€)<input type="number" id="chgAmount" step="0.01"></label>'
      + '</div>'
      + '<div class="compta-actions"><button type="button" class="btn primary" id="chgAdd">＋ Ajouter la charge</button></div></div>';

    if (charges && charges.length) {
      html += '<h3 class="compta-card__title" style="margin-top:1rem">Charges enregistrées</h3><table class="compta-table">';
      charges.forEach(function (c) {
        var dt = c.dateMs ? new Date(c.dateMs).toLocaleDateString('fr-FR') : '';
        html += '<tr><td>' + escapeHTML(c.category) + (c.label ? ' — ' + escapeHTML(c.label) : '') + '<br><small style="opacity:.6">' + dt + '</small></td>'
          + '<td class="compta-num">' + eur(c.amountHt) + '</td>'
          + '<td><button type="button" class="btn btn--ghost compta-chg-del" data-id="' + escapeHTML(c.id) + '">✕</button></td></tr>';
      });
      html += '</table>';
    }

    box.innerHTML = html;

    var addBtn = document.getElementById('chgAdd');
    if (addBtn) addBtn.onclick = function () {
      var amount = parseFloat(document.getElementById('chgAmount').value);
      if (!(amount > 0)) { toast('Entre un montant HT valide', 'error'); return; }
      addBtn.disabled = true;
      adminPostType('charge', {
        category: document.getElementById('chgCat').value,
        label: document.getElementById('chgLabel').value,
        amountHt: amount,
        dateMs: Date.now()
      }).then(function () { toast('Charge enregistrée', 'success'); comptaLoadAccounting(); })
        .catch(function (e) { toast('Erreur : ' + e.message, 'error'); addBtn.disabled = false; });
    };
    box.querySelectorAll('.compta-chg-del').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id');
        adminAuthHeaders().then(function (h) {
          return fetch(apiBaseUrl() + '/api/admin?type=charge&id=' + encodeURIComponent(id), { method: 'DELETE', headers: h });
        }).then(function (r) { return r.json(); }).then(function () { toast('Charge supprimée', 'success'); comptaLoadAccounting(); })
          .catch(function (e) { toast('Erreur : ' + e.message, 'error'); });
      };
    });
  }

  // Charge la config serveur puis construit le calculateur + prix automatiques.
  function comptaLoadCalc() {
    var box = document.getElementById('comptaCalc');
    if (!box) return;
    adminGet('pricing-config').then(function (data) {
      comptaRenderCalc(box, data.config || {});
    }).catch(function (e) {
      box.innerHTML = '<p class="admin-error">Config indisponible : ' + escapeHTML(e.message)
        + '<br><span class="admin-hint">(nécessite FIREBASE_SERVICE_ACCOUNT sur Vercel)</span></p>';
    });
  }

  function comptaRenderCalc(box, cfg) {
    var mode = cfg.mode || 'colissimo';
    var auto = cfg.autoPrice !== false;
    var pct = function (v) { return Math.round((Number(v) || 0) * 1000) / 10; };
    box.innerHTML =
      '<div class="compta-card">'
      + '<div class="compta-cfg-row">'
      + '<label class="compta-toggle"><input type="checkbox" id="cfgAuto"' + (auto ? ' checked' : '') + '> <span>Prix automatiques (le site calcule les prix tout seul)</span></label>'
      + '</div>'
      + '<div class="compta-cfg-grid">'
      + '<label>Mode d\'expédition<select id="cfgMode"><option value="colissimo"' + (mode === 'colissimo' ? ' selected' : '') + '>Colissimo (démarrage)</option><option value="container"' + (mode === 'container' ? ' selected' : '') + '>Container (prix baissés)</option></select></label>'
      + '<label>Marge nette cible (%)<input type="number" id="cfgTarget" step="0.5" value="' + pct(cfg.targetNet) + '"></label>'
      + '<label>IS (%)<input type="number" id="cfgIS" step="0.5" value="' + pct(cfg.is) + '"></label>'
      + '</div>'
      + '<div class="compta-actions"><button type="button" class="btn primary" id="cfgSave">💾 Enregistrer la config</button></div>'
      + '<hr class="compta-hr">'
      + '<h3 class="compta-card__title" style="margin-top:.4rem">Tester un prix</h3>'
      + '<div class="compta-cfg-grid">'
      + '<label>Coût TTC cotébrico (€)<input type="number" id="calcCost" step="0.01" value="84.90"></label>'
      + '<label>Poids nu (kg)<input type="number" id="calcWeight" step="0.1" value="1.6"></label>'
      + '</div>'
      + '<div class="compta-actions"><button type="button" class="btn btn--ghost" id="calcRun">Calculer le prix conseillé</button></div>'
      + '<div id="calcOut" class="compta-calc-out"></div>'
      + '<hr class="compta-hr">'
      + '<h3 class="compta-card__title">Appliquer à tout le catalogue</h3>'
      + '<p class="compta-line">Recalcule tous les prix depuis la config ci-dessus. On te montre d\'abord ce qui change, tu confirmes ensuite.</p>'
      + '<div class="compta-actions">'
      + '<button type="button" class="btn btn--ghost" id="repriceDry">👀 Voir ce qui changerait</button>'
      + '<button type="button" class="btn primary" id="repriceGo" disabled>✅ Appliquer les nouveaux prix</button>'
      + '</div>'
      + '<div id="repriceOut" class="compta-calc-out"></div>'
      + '</div>';

    document.getElementById('cfgSave').onclick = function () {
      var btn = this; btn.disabled = true;
      adminPostType('pricing-config', {
        autoPrice: document.getElementById('cfgAuto').checked,
        mode: document.getElementById('cfgMode').value,
        targetNet: (parseFloat(document.getElementById('cfgTarget').value) || 15) / 100,
        is: (parseFloat(document.getElementById('cfgIS').value) || 15) / 100
      }).then(function () { toast('Config enregistrée', 'success'); btn.disabled = false; })
        .catch(function (e) { toast('Erreur : ' + e.message, 'error'); btn.disabled = false; });
    };

    document.getElementById('calcRun').onclick = function () {
      var out = document.getElementById('calcOut');
      out.innerHTML = '<p class="admin-loading">Calcul…</p>';
      adminPostType('price-preview', {
        costTTC: parseFloat(document.getElementById('calcCost').value) || 0,
        weight: parseFloat(document.getElementById('calcWeight').value) || 2,
        mode: document.getElementById('cfgMode').value
      }).then(function (data) {
        var r = data.result;
        if (!r) { out.innerHTML = '<p class="admin-error">Pas de résultat</p>'; return; }
        out.innerHTML = '<div class="compta-res">'
          + '<div class="compta-res__price">' + r.ttc.toFixed(0) + ' € <small>TTC (prix client, tout compris)</small></div>'
          + '<div class="compta-res__ht">' + r.priceHt.toFixed(2) + ' € HT</div>'
          + '<div class="compta-res__brk">'
          + '<span>Markup : <b>' + Math.round(r.markup * 100) + ' %</b></span>'
          + '<span>Coût HT : ' + r.costHT.toFixed(2) + ' €</span>'
          + '<span>Transport : ' + r.transport.toFixed(2) + ' €</span>'
          + '<span>Octroi payé : ' + r.octroiPaid.toFixed(2) + ' €</span>'
          + '<span class="compta-res__net">Net après IS : ' + r.netAfterIS.toFixed(2) + ' € (' + Math.round(r.marginAfterIS * 100) + ' %)</span>'
          + '</div></div>';
      }).catch(function (e) { out.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>'; });
    };

    var repriceOut = document.getElementById('repriceOut');
    document.getElementById('repriceDry').onclick = function () {
      repriceOut.innerHTML = '<p class="admin-loading">Analyse…</p>';
      adminPostType('reprice-all', { dryRun: true }).then(function (d) {
        var c = d.counts || {};
        var sample = (d.changed || []).slice(0, 8).map(function (x) {
          return '<li>' + escapeHTML(x.name || x.sku) + ' : ' + (x.oldPrice != null ? x.oldPrice + ' €' : '—') + ' → <b>' + x.newPrice + ' €</b></li>';
        }).join('');
        repriceOut.innerHTML = '<p><b>' + c.changed + '</b> prix changeraient sur ' + c.total + ' produits (mode ' + d.mode + '). '
          + (c.skipped ? c.skipped + ' ignorés (coût inconnu).' : '') + '</p>'
          + (sample ? '<ul class="compta-sample">' + sample + '</ul>' : '')
          + '<p class="admin-hint">Vérifie que ça te va, puis clique « Appliquer ».</p>';
        document.getElementById('repriceGo').disabled = (c.changed === 0);
      }).catch(function (e) { repriceOut.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>'; });
    };
    document.getElementById('repriceGo').onclick = function () {
      var btn = this; btn.disabled = true;
      repriceOut.innerHTML = '<p class="admin-loading">Application…</p>';
      adminPostType('reprice-all', { dryRun: false }).then(function (d) {
        toast((d.counts.changed) + ' prix mis à jour', 'success');
        repriceOut.innerHTML = '<p>✅ <b>' + d.counts.changed + '</b> prix mis à jour. Visibles en production sous ~30 s (cache).</p>';
      }).catch(function (e) { repriceOut.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>'; btn.disabled = false; });
    };
  }

  // ── Fiscalité : guide des déclarations officielles (SASU à l'IS, DOM) ──────
  var FISC_DONE_KEY = 'pt:fisc:done';
  var FISC_DECLARATIONS = [
    {
      id: 'tva', titre: 'TVA — déclaration de TVA', quand: 'Mensuelle ou trimestrielle',
      echeance: 'Vers le 24 du mois suivant (réel normal) ou par trimestre — selon ton régime.',
      quoi: 'Tu déclares la TVA collectée sur tes ventes moins la TVA déductible (le « solde » de ta compta). Tu reverses la différence, ou tu récupères si c\'est un crédit.',
      ou: 'impots.gouv.fr → Espace Professionnel → « Déclarer la TVA »', url: 'https://www.impots.gouv.fr/professionnel',
      note: 'Le chiffre exact = la ligne TVA de ton compte de résultat (onglet Comptabilité).'
    },
    {
      id: 'is', titre: 'Impôt sur les sociétés (IS) — résultat', quand: 'Annuelle (+ acomptes)',
      echeance: 'Acomptes : 15 mars · 15 juin · 15 sept · 15 déc. Liasse + solde : ~mi-mai (clôture au 31/12).',
      quoi: 'La « liasse fiscale » (formulaire n° 2065) : tu déclares le résultat. L\'IS (15 % jusqu\'à 42 500 €, 25 % au-delà) se paie en acomptes puis solde.',
      ou: 'impots.gouv.fr → Espace Professionnel → « Déclarer les résultats »', url: 'https://www.impots.gouv.fr/professionnel',
      note: 'C\'est LE document que l\'expert-comptable monte à partir de ton compte de résultat (exporte le PDF Compta).'
    },
    {
      id: 'cfe', titre: 'CFE — Cotisation Foncière des Entreprises', quand: 'Annuelle',
      echeance: 'Paiement : 15 décembre. Déclaration initiale (1447-C) : avant le 31 décembre de l\'année de création.',
      quoi: 'Impôt local fixe. Souvent exonérée l\'année de création (et exonérations prolongées possibles en DOM).',
      ou: 'impots.gouv.fr → Espace Professionnel → « CFE »', url: 'https://www.impots.gouv.fr/professionnel',
      note: 'Enregistre la CFE payée dans tes charges (onglet Comptabilité).'
    },
    {
      id: 'octroi', titre: 'Octroi de mer — à l\'import', quand: 'À chaque importation',
      echeance: 'Au moment où ta marchandise entre en Guadeloupe (via la douane / ton transitaire).',
      quoi: 'La taxe DOM sur les marchandises importées. Souvent gérée par le transitaire — vérifie qu\'elle est incluse dans son devis.',
      ou: 'douane.gouv.fr (téléservice DELT@ / ton transitaire)', url: 'https://www.douane.gouv.fr',
      note: 'Enregistre l\'octroi payé dans tes charges pour un résultat net exact.'
    },
    {
      id: 'comptes', titre: 'Comptes annuels — dépôt du bilan', quand: 'Annuelle',
      echeance: 'AG d\'approbation dans les 6 mois de la clôture, puis dépôt au greffe dans le mois qui suit.',
      quoi: 'Ta société dépose ses comptes annuels (bilan + compte de résultat) via le Guichet unique — ta compta devient « officielle ».',
      ou: 'formalites.entreprises.gouv.fr (Guichet unique INPI)', url: 'https://formalites.entreprises.gouv.fr',
      note: 'Monté à partir de ta compta réelle.'
    },
    {
      id: 'formalites', titre: 'Formalités entreprise (créer / modifier)', quand: 'À la création puis si changement',
      echeance: 'Dès que tu crées, modifies (adresse, activité…) ou fermes.',
      quoi: 'Tout passe par le Guichet unique — point d\'entrée officiel unique depuis 2023.',
      ou: 'formalites.entreprises.gouv.fr (Guichet unique INPI)', url: 'https://formalites.entreprises.gouv.fr',
      note: 'Ton SIRET et tes statuts viennent de là.'
    }
  ];

  function fiscDone() { try { return JSON.parse(localStorage.getItem(FISC_DONE_KEY) || '{}'); } catch (e) { return {}; } }

  // ── Marges nettes LIVE (branché sur les prix RÉELS du site) ─────────────
  var _marginsLoaded = false;
  function loadAdminMargins(force) {
    var el = document.getElementById('adminMarginsBody');
    if (!el) return;
    if (_marginsLoaded && !force) return;
    el.innerHTML = '<p class="admin-loading">Calcul des marges sur les prix actuels…</p>';
    adminGet('margins').then(function (data) {
      _marginsLoaded = true;
      renderAdminMargins(el, data || {});
    }).catch(function () {
      el.innerHTML = '<p class="compta-line">Impossible de charger les marges. Vérifie ton accès admin et FIREBASE_SERVICE_ACCOUNT.</p>';
    });
  }

  function renderAdminMargins(el, data) {
    var rows = data.rows || [];
    var s = data.summary || {};
    var cfg = data.config || {};
    function eur(n) { return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'; }
    function eur2(n) { return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
    function pctf(n) { return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'; }
    function mcls(m) { return m <= 0 ? 'mg-crit' : (m < 10 ? 'mg-warn' : 'mg-good'); }

    var html = '';
    html += '<p class="admin-hint">Marge nette réelle au <b>prix actuel du site</b> (catalogue live, mis à jour après chaque scan du traqueur), après envoi + octroi + Stripe + frais fixes + IS. Territoire 971 · '
      + 'envoi <b>' + escapeHTML(cfg.mode || 'colissimo') + '</b> · cible <b>' + Math.round((cfg.targetNet || 0.15) * 100) + ' % net</b> · traqueur auto <b>' + (cfg.autoPrice ? 'ON' : 'OFF') + '</b>.</p>';

    html += '<div class="compta-kpis">'
      + '<div class="compta-kpi"><div class="compta-kpi__val">' + pctf(s.avgMarginPct) + '</div><div class="compta-kpi__lbl">Marge nette moyenne</div></div>'
      + '<div class="compta-kpi"><div class="compta-kpi__val">' + eur(s.totalNet) + '</div><div class="compta-kpi__sub">1 vente de chaque</div><div class="compta-kpi__lbl">Marge € cumulée</div></div>'
      + '<div class="compta-kpi"><div class="compta-kpi__val">' + (s.packCount || 0) + '</div><div class="compta-kpi__sub">marge ' + eur(s.packNet) + '</div><div class="compta-kpi__lbl">Gros packs</div></div>'
      + '<div class="compta-kpi"><div class="compta-kpi__val">' + (s.count || 0) + '</div><div class="compta-kpi__lbl">Produits</div></div>'
      + '</div>';

    html += '<div class="mg-controls">'
      + '<div class="mg-chips">'
      + '<button type="button" class="mg-chip is-on" data-mg="all">Tous</button>'
      + '<button type="button" class="mg-chip" data-mg="pack">Gros packs</button>'
      + '<button type="button" class="mg-chip" data-mg="low">Marge faible</button>'
      + '</div>'
      + '<input type="search" id="mgSearch" class="mg-search" placeholder="Chercher un produit, une marque…">'
      + '<button type="button" class="btn btn--ghost" id="mgReload">↻ Recalculer</button>'
      + '</div>';

    // « Mon achat » = coût fournisseur TTC. La donnée n'existe QUE dans la
    // réponse /api/admin?type=margins (auth admin) — jamais dans le code public
    // ni dans /api/products (strippé par PRIVATE_FIELDS, gardé par la CI).
    html += '<div class="mg-tablewrap"><table class="compta-table mg-table"><thead><tr>'
      + '<th class="mg-l">Produit</th><th class="mg-l">Marque</th>'
      + '<th class="compta-num">Mon achat (TTC)</th><th class="compta-num">Prix TTC 971</th>'
      + '<th class="compta-num">Poids</th><th class="mg-l">Envoi</th><th class="compta-num">Marge %</th><th class="compta-num">Marge €</th>'
      + '</tr></thead><tbody id="mgRows"></tbody></table></div>';

    el.innerHTML = html;

    var filter = 'all', q = '';
    function matches(r) {
      if (filter === 'pack' && !r.isPack) return false;
      if (filter === 'low' && r.marginPct >= 10) return false;
      if (q) { var t = (r.title + ' ' + r.brand + ' ' + r.sku).toLowerCase(); if (t.indexOf(q) === -1) return false; }
      return true;
    }
    function paint() {
      var body = document.getElementById('mgRows');
      if (!body) return;
      var list = rows.filter(matches);
      body.innerHTML = list.map(function (r) {
        var c = mcls(r.marginPct);
        return '<tr><td class="mg-l">' + (r.isPack ? '<span class="mg-pk">pack</span> ' : '') + escapeHTML(r.title) + '</td>'
          + '<td class="mg-l">' + escapeHTML(r.brand || '') + '</td>'
          + '<td class="compta-num">' + (r.costTTC != null ? eur2(r.costTTC) : '—')
          + (r.costSrc === 'estimé' ? ' <span class="mg-est" title="Dérivé du prix (pas encore relevé par le traqueur)">~</span>' : '') + '</td>'
          + '<td class="compta-num">' + eur(r.ttc971) + '</td>'
          + '<td class="compta-num">' + (r.weight || 0) + ' kg</td>'
          + '<td class="mg-l mg-ship">' + escapeHTML(r.shipKind) + '</td>'
          + '<td class="compta-num ' + c + '">' + pctf(r.marginPct) + '</td>'
          + '<td class="compta-num ' + c + '">' + eur2(r.netEur) + '</td></tr>';
      }).join('');
    }
    var chips = el.querySelectorAll('.mg-chip');
    chips.forEach(function (b) {
      b.onclick = function () {
        chips.forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        filter = b.getAttribute('data-mg');
        paint();
      };
    });
    var srch = document.getElementById('mgSearch');
    if (srch) srch.oninput = function (e) { q = (e.target.value || '').toLowerCase().trim(); paint(); };
    var rl = document.getElementById('mgReload');
    if (rl) rl.onclick = function () { loadAdminMargins(true); };
    paint();
  }

  function renderAdminFisc() {
    var el = document.getElementById('adminFiscBody');
    if (!el) return;
    var year = new Date().getFullYear();
    var done = fiscDone();
    var html = '';
    html += '<p class="admin-hint">Tes <b>déclarations officielles</b>, expliquées simplement, avec les <b>échéances</b> et le <b>lien direct</b> vers le bon site. Tu suis les cartes une par une. 👍</p>';

    // 🔴 3 points légaux critiques (la petite bête qui peut te griller)
    html += '<div class="fisc-card" style="border-color:#c0243a;background:rgba(192,36,58,.08)">'
      + '<h3>🔴 À VÉRIFIER EN PRIORITÉ (peut te coûter cher)</h3>'
      + '<p class="fisc-line"><b>1. TVA — es-tu vraiment assujetti ?</b> Ton site facture la TVA (8,5 %). Si ton chiffre d\'affaires est sous les seuils, tu peux être en <b>franchise en base</b> → dans ce cas tu ne dois <b>PAS</b> facturer la TVA (ce serait une faute). <b>Appelle ton SIE</b> pour trancher — si tu es en franchise, dis-le-moi, je retire la TVA du site.</p>'
      + '<p class="fisc-line"><b>2. IS à 15 % — remplis-tu les conditions ?</b> Le taux réduit exige : capital <b>entièrement libéré</b>, détenu à <b>≥ 75 % par des personnes physiques</b>, CA &lt; 10 M€. Sinon c\'est 25 %.</p>'
      + '<p class="fisc-line"><b>3. Avantages DOM — ne les rate pas !</b> En Guadeloupe tu peux avoir des <b>exonérations</b> (zone franche <b>ZFANG</b> → abattement sur l\'IS, CFE exonérée plus longtemps). Ça peut <b>réduire fortement tes impôts</b>. Demande à ton SIE si tu y as droit.</p>'
      + '</div>';

    html += '<div class="fisc-card" style="border-color:rgba(245,158,11,.5);background:rgba(245,158,11,.07)">'
      + '<h3>⚠️ À garder en tête</h3>'
      + '<p class="fisc-line">Je donne les grandes lignes et les bons liens, mais je ne suis <b>pas</b> conseiller fiscal → pour tes obligations exactes, <b>SIE (gratuit)</b> ou expert-comptable.</p>'
      + '<p class="fisc-line"><b>Garde TOUTES tes factures</b> (achats cotébrico, transport, octroi…) pendant <b>10 ans</b> : le compte de résultat de l\'app est un <b>outil de gestion</b>, il ne remplace pas tes vraies factures ni la tenue officielle des comptes.</p>'
      + '<p class="fisc-line">💡 Les dates ci-dessous valent pour une <b>clôture au 31 décembre</b> — confirme ta date de clôture avec ton comptable.</p>'
      + '</div>';

    FISC_DECLARATIONS.forEach(function (d) {
      var isDone = done[d.id] === year;
      html += '<article class="fisc-card' + (isDone ? ' fisc-card--done' : '') + '">'
        + '<div class="fisc-when">🗓️ ' + escapeHTML(d.quand) + '</div>'
        + (isDone ? '<span class="compta-tag2 is-real" style="margin-left:6px">✓ fait en ' + year + '</span>' : '')
        + '<h3>' + escapeHTML(d.titre) + '</h3>'
        + '<p class="fisc-line"><span class="fisc-lbl">📅 Échéance :</span> ' + escapeHTML(d.echeance) + '</p>'
        + '<p class="fisc-line"><span class="fisc-lbl">C\'est quoi :</span> ' + escapeHTML(d.quoi) + '</p>'
        + '<p class="fisc-line"><span class="fisc-lbl">Où :</span> ' + escapeHTML(d.ou) + '</p>'
        + '<p class="fisc-line">' + escapeHTML(d.note) + '</p>'
        + '<div class="compta-actions">'
        + '<a class="btn primary" href="' + escapeHTML(d.url) + '" target="_blank" rel="noopener">Ouvrir le site officiel ↗</a>'
        + '<button type="button" class="btn btn--ghost fisc-done" data-id="' + d.id + '">' + (isDone ? '↺ Annuler' : '✅ Marquer comme fait') + '</button>'
        + '</div>'
        + '</article>';
    });
    el.innerHTML = html;

    el.querySelectorAll('.fisc-done').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id'); var st = fiscDone();
        if (st[id] === year) delete st[id]; else st[id] = year;
        try { localStorage.setItem(FISC_DONE_KEY, JSON.stringify(st)); } catch (e) {}
        renderAdminFisc();
      };
    });
  }

  // ── Factures (admin) : identité vendeur + génération / impression ──────────
  function renderAdminInvoices() {
    var el = document.getElementById('adminInvoicesBody');
    if (!el) return;
    el.innerHTML = '<p class="admin-loading">Chargement…</p>';
    Promise.all([adminGet('invoice-config'), adminGet('invoices')]).then(function (res) {
      comptaBuildInvoices(el, res[0].seller || {}, res[1].invoices || []);
    }).catch(function (e) {
      el.innerHTML = '<p class="admin-error">Factures indisponibles : ' + escapeHTML(e.message)
        + '<br><span class="admin-hint">(nécessite FIREBASE_SERVICE_ACCOUNT sur Vercel)</span></p>';
    });
  }

  function comptaBuildInvoices(el, s, list) {
    function v(x) { return escapeHTML(x || ''); }
    var incomplete = !(s.raisonSociale && s.adresse && s.siret);
    var html = '';
    html += '<p class="admin-hint">Tes <b>factures conformes</b> (normes FR) : renseigne ton identité une fois, elles se génèrent ensuite pour chaque vente. Imprime-les pour le colis, ou elles partent par email au client.</p>';
    if (incomplete) {
      html += '<div class="fisc-card" style="border-color:rgba(245,158,11,.5);background:rgba(245,158,11,.07)"><h3>⚠️ Identité à compléter</h3><p class="fisc-line">Renseigne les champs ci-dessous <b>quand ta société sera créée</b> (raison sociale, SIRET, adresse…). En attendant, les factures affichent [À COMPLÉTER] — c\'est normal.</p></div>';
    }

    // Formulaire identité vendeur
    html += '<h2 class="admin-subtitle">🏢 Identité de l\'entreprise (sur les factures)</h2>';
    html += '<div class="compta-card"><div class="compta-cfg-grid">'
      + '<label>Raison sociale<input id="invRS" value="' + v(s.raisonSociale) + '"></label>'
      + '<label>Forme juridique<input id="invForme" value="' + v(s.formeJuridique || 'SASU') + '"></label>'
      + '<label>Capital<input id="invCap" placeholder="ex. 1 000 €" value="' + v(s.capital) + '"></label>'
      + '<label>SIRET<input id="invSiret" value="' + v(s.siret) + '"></label>'
      + '<label>RCS (ville)<input id="invRcs" value="' + v(s.rcs) + '"></label>'
      + '<label>N° TVA intracom.<input id="invTva" value="' + v(s.tvaIntra) + '"></label>'
      + '<label>Email<input id="invEmail" value="' + v(s.email) + '"></label>'
      + '<label>Téléphone<input id="invTel" value="' + v(s.tel) + '"></label>'
      + '</div>'
      + '<label>Adresse du siège<input id="invAddr" value="' + v(s.adresse) + '"></label>'
      + '<label>Médiateur de la consommation<input id="invMed" placeholder="nom + coordonnées" value="' + v(s.mediateur) + '"></label>'
      + '<label class="compta-toggle" style="margin-top:8px"><input type="checkbox" id="invFranchise"' + (s.franchise ? ' checked' : '') + '> <span>Franchise en base de TVA (je ne facture PAS la TVA)</span></label>'
      + '<div class="compta-actions"><button type="button" class="btn primary" id="invSave">💾 Enregistrer l\'identité</button></div></div>';

    // Liste des factures
    html += '<h2 class="admin-subtitle">🧾 Factures émises</h2>';
    if (!list.length) {
      html += '<p class="compta-line" style="opacity:.7">Aucune facture pour l\'instant. Elles apparaîtront ici après chaque vente payée.</p>';
    } else {
      html += '<table class="compta-table"><tr><th>N°</th><th>Date</th><th>Client</th><th class="compta-num">Montant</th><th></th></tr>';
      list.forEach(function (f) {
        var dt = f.recordedAtMs ? new Date(f.recordedAtMs).toLocaleDateString('fr-FR') : '';
        html += '<tr><td>' + v(f.invoiceNumber || '—') + '</td><td>' + dt + '</td>'
          + '<td>' + v(f.customerName || f.customerEmail) + '</td>'
          + '<td class="compta-num">' + ((f.amountCents || 0) / 100).toFixed(2) + ' €</td>'
          + '<td><button type="button" class="btn btn--ghost inv-view" data-id="' + v(f.id) + '">Voir</button></td></tr>';
      });
      html += '</table>';
    }
    html += '<div id="invoiceView"></div>';
    el.innerHTML = html;

    document.getElementById('invSave').onclick = function () {
      var btn = this; btn.disabled = true;
      adminPostType('invoice-config', {
        raisonSociale: document.getElementById('invRS').value, formeJuridique: document.getElementById('invForme').value,
        capital: document.getElementById('invCap').value, siret: document.getElementById('invSiret').value,
        rcs: document.getElementById('invRcs').value, tvaIntra: document.getElementById('invTva').value,
        email: document.getElementById('invEmail').value, tel: document.getElementById('invTel').value,
        adresse: document.getElementById('invAddr').value, mediateur: document.getElementById('invMed').value,
        franchise: document.getElementById('invFranchise').checked
      }).then(function () { toast('Identité enregistrée', 'success'); btn.disabled = false; })
        .catch(function (e) { toast('Erreur : ' + e.message, 'error'); btn.disabled = false; });
    };
    el.querySelectorAll('.inv-view').forEach(function (b) {
      b.onclick = function () {
        var view = document.getElementById('invoiceView');
        view.innerHTML = '<p class="admin-loading">Génération…</p>';
        var id = b.getAttribute('data-id');
        adminAuthHeaders().then(function (h) {
          return fetch(apiBaseUrl() + '/api/admin?type=invoice&id=' + encodeURIComponent(id), { method: 'GET', headers: h });
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (!data.ok) throw new Error(data.error || 'erreur');
          view.innerHTML = '<div class="compta-actions" style="margin:12px 0"><button type="button" class="btn primary" id="invPrint">🖨️ Imprimer / PDF</button></div>' + (data.html || '');
          var pb = document.getElementById('invPrint');
          if (pb) pb.onclick = function () { window.print(); };
        }).catch(function (e) { view.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>'; });
      };
    });
  }

  // ── Dashboard : Partenaires (annuaire artisans, Phase 2) ───
  // CRUD des cartes de l'annuaire via /api/admin (partner-save/partner-delete,
  // Admin SDK serveur — le client n'écrit JAMAIS dans `partners`, rules
  // write:false). Photos compressées côté navigateur (canvas → WebP ≤ ~120 Ko,
  // sous le plafond serveur DATAURL_MAX 170 000 caractères).

  var _adminPartnersList = [];
  var _adminPartnerPhotos = [];   // dataURLs de la carte en cours d'édition
  var _adminPartnerLogo = '';

  var ADMIN_PARTNER_PHOTOS_MAX = { basique: 0, pro: 1, gold: 3, black: 6 };

  // PERF (retour user iPad : « le logo met beaucoup de temps à s'afficher ») :
  // 1) le format d'export (WebP sinon JPEG) est détecté UNE FOIS — avant,
  //    chaque itération de qualité tentait un encodage WebP que Safari ne sait
  //    pas produire : il renvoyait un PNG complet (coûteux) jeté aussitôt, ×5 ;
  // 2) décodage via createImageBitmap(file) quand dispo — décode hors du fil
  //    principal, bien plus rapide qu'un <img> pour les photos 12 Mpx d'iPad ;
  //    repli <img> conservé (vieux navigateurs). Orientation EXIF demandée
  //    quand l'option est supportée.
  var _canvasWebpOk = null;
  function canvasWebpSupported() {
    if (_canvasWebpOk === null) {
      try {
        var c = document.createElement('canvas'); c.width = 1; c.height = 1;
        _canvasWebpOk = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
      } catch (_) { _canvasWebpOk = false; }
    }
    return _canvasWebpOk;
  }

  function compressPartnerImage(file, maxSide, cb) {
    function encode(source, w, h, done) {
      try {
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
        // Qualité dégressive jusqu'à passer sous le plafond serveur (170 000
        // caractères base64) avec de la marge (~150 000).
        var mime = canvasWebpSupported() ? 'image/webp' : 'image/jpeg';
        var qualities = [0.82, 0.7, 0.58, 0.45, 0.32];
        var out = '';
        for (var i = 0; i < qualities.length; i++) {
          out = canvas.toDataURL(mime, qualities[i]);
          if (out.length <= 150000) break;
        }
        if (done) done();
        cb(out.length <= 170000 ? out : '');
      } catch (_) { if (done) done(); cb(''); }
    }
    function legacyDecode() {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { encode(img, img.width, img.height, function () { URL.revokeObjectURL(url); }); };
      img.onerror = function () { URL.revokeObjectURL(url); cb(''); };
      img.src = url;
    }
    if (typeof createImageBitmap === 'function') {
      // Option orientation EXIF si supportée, sinon appel nu, sinon repli <img>.
      createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return createImageBitmap(file); })
        .then(function (bmp) {
          encode(bmp, bmp.width, bmp.height, function () { if (bmp.close) bmp.close(); });
        })
        .catch(legacyDecode);
    } else {
      legacyDecode();
    }
  }

  function loadAdminPartners() {
    var el = document.getElementById('adminPartnersBody');
    if (!el) return;
    el.innerHTML = '<p class="admin-loading">Chargement…</p>';
    adminGet('partners').then(function (data) {
      _adminPartnersList = data.partners || [];
      renderAdminPartners(el);
    }).catch(function (e) {
      el.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>';
    });
  }

  function adminPartnerFormHTML(p) {
    p = p || {};
    var tiers = ['basique', 'pro', 'gold', 'black'];
    var tierOpts = tiers.map(function (t) {
      return '<option value="' + t + '"' + (p.tier === t ? ' selected' : '') + '>'
        + t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
    }).join('');
    return '<form id="adminPartnerForm" class="admin-tools-form" data-partner-id="' + escapeHTML(String(p.id || '')) + '">'
      + '<h2 class="admin-subtitle">' + (p.id ? 'Modifier la carte' : 'Nouvelle carte artisan') + '</h2>'
      + '<label class="admin-field"><span>Nom / Entreprise *</span>'
      + '<input type="text" id="apName" maxlength="80" required value="' + escapeHTML(String(p.name || '')) + '"></label>'
      + '<label class="admin-field"><span>Métier * (ex. Charpentier)</span>'
      + '<input type="text" id="apMetier" maxlength="40" required value="' + escapeHTML(String(p.metier || '')) + '"></label>'
      + '<label class="admin-field"><span>Commune</span>'
      + '<input type="text" id="apCommune" maxlength="40" value="' + escapeHTML(String(p.commune || '')) + '"></label>'
      + '<label class="admin-field"><span>Abonnement</span>'
      + '<select id="apTier">' + tierOpts + '</select></label>'
      + '<label class="admin-field"><span>Description (240 max)</span>'
      + '<textarea id="apDesc" rows="3" maxlength="240">' + escapeHTML(String(p.desc || '')) + '</textarea></label>'
      + '<label class="admin-field"><span>WhatsApp (chiffres, ex. 590690...)</span>'
      + '<input type="text" id="apWhatsapp" maxlength="20" value="' + escapeHTML(String(p.whatsapp || '')) + '"></label>'
      + '<label class="admin-field"><span>Site web (https://…, Gold/Black)</span>'
      + '<input type="url" id="apLink" maxlength="200" value="' + escapeHTML(String(p.link || '')) + '"></label>'
      + '<label class="admin-field"><span>Ordre d\'affichage (petit = premier)</span>'
      + '<input type="number" id="apOrder" value="' + (Number.isFinite(Number(p.order)) ? Number(p.order) : 999) + '"></label>'
      + '<label class="admin-field admin-field--inline"><input type="checkbox" id="apActive"' + (p.active !== false ? ' checked' : '') + '> <span>Carte visible (active)</span></label>'
      + '<label class="admin-field admin-field--inline"><input type="checkbox" id="apGuest"' + (p.guest === true ? ' checked' : '') + '> <span>Invité / test (gratuit — tous les avantages SAUF le bon de 38 €/mois ; hors compteur des 10 places payantes)</span></label>'
      + '<label class="admin-field"><span>Email du compte client lié (l\'artisan pourra changer photos/logo depuis SON compte)</span>'
      + '<input type="email" id="apLinkedEmail" maxlength="200" placeholder="artisan@email.com" value="' + escapeHTML(String(p.linkedEmail || '')) + '"></label>'
      + '<label class="admin-field"><span>Logo (Pro/Gold/Black)</span>'
      + '<input type="file" id="apLogoFile" accept="image/*"></label>'
      + '<div id="apLogoPreview" class="admin-partner-photos"></div>'
      + '<label class="admin-field"><span>Photos (selon abonnement : Pro 1, Gold 3, Black 6)</span>'
      + '<input type="file" id="apPhotoFiles" accept="image/*" multiple></label>'
      + '<div id="apPhotosPreview" class="admin-partner-photos"></div>'
      + '<div class="ig-publish-actions">'
      + '<button type="submit" class="btn primary">' + (p.id ? 'Enregistrer' : 'Créer la carte') + '</button>'
      + (p.id ? '<button type="button" class="btn btn--ghost" id="apCancelEdit">Annuler</button>' : '')
      + '</div>'
      + '<span id="apStatus" class="admin-row__status" aria-live="polite"></span>'
      + '</form>';
  }

  // Retour visuel immédiat pendant la compression (photos iPad 12 Mpx =
  // décodage perceptible) : chips « ⏳ » tant qu'un traitement est en cours.
  var _adminLogoBusy = false;
  var _adminPhotosBusy = 0;

  function renderAdminPartnerPhotos() {
    var logoBox = document.getElementById('apLogoPreview');
    var photosBox = document.getElementById('apPhotosPreview');
    if (logoBox) {
      logoBox.innerHTML = (_adminPartnerLogo
        ? '<span class="admin-partner-photo"><img src="' + _adminPartnerLogo + '" alt="Logo"><button type="button" data-remove-logo aria-label="Retirer le logo">✕</button></span>'
        : '')
        + (_adminLogoBusy ? '<span class="img-busy">⏳ Traitement du logo…</span>' : '');
      var rmLogo = logoBox.querySelector('[data-remove-logo]');
      if (rmLogo) rmLogo.onclick = function () { _adminPartnerLogo = ''; renderAdminPartnerPhotos(); };
    }
    if (photosBox) {
      photosBox.innerHTML = _adminPartnerPhotos.map(function (src, i) {
        return '<span class="admin-partner-photo"><img src="' + src + '" alt="Photo ' + (i + 1) + '"><button type="button" data-remove-photo="' + i + '" aria-label="Retirer la photo ' + (i + 1) + '">✕</button></span>';
      }).join('')
        + (_adminPhotosBusy > 0 ? '<span class="img-busy">⏳ Traitement de ' + _adminPhotosBusy + ' image(s)…</span>' : '');
      photosBox.querySelectorAll('[data-remove-photo]').forEach(function (btn) {
        btn.onclick = function () {
          _adminPartnerPhotos.splice(Number(btn.getAttribute('data-remove-photo')), 1);
          renderAdminPartnerPhotos();
        };
      });
    }
  }

  function bindAdminPartnerForm(el, editing) {
    var form = document.getElementById('adminPartnerForm');
    if (!form) return;
    _adminPartnerPhotos = (editing && Array.isArray(editing.photos)) ? editing.photos.slice() : [];
    _adminPartnerLogo = (editing && editing.logo) || '';
    renderAdminPartnerPhotos();

    var logoFile = document.getElementById('apLogoFile');
    if (logoFile) logoFile.onchange = function () {
      var f = logoFile.files && logoFile.files[0];
      if (!f) return;
      _adminLogoBusy = true;
      renderAdminPartnerPhotos(); // « ⏳ » immédiat — l'user voit que ça travaille
      compressPartnerImage(f, 320, function (dataUrl) {
        _adminLogoBusy = false;
        if (dataUrl) _adminPartnerLogo = dataUrl;
        renderAdminPartnerPhotos();
        if (!dataUrl) toast('Image logo illisible', 'error');
      });
      logoFile.value = '';
    };

    var photoFiles = document.getElementById('apPhotoFiles');
    if (photoFiles) photoFiles.onchange = function () {
      var tier = (document.getElementById('apTier') || {}).value || 'basique';
      var max = ADMIN_PARTNER_PHOTOS_MAX[tier] || 0;
      var files = Array.prototype.slice.call(photoFiles.files || []);
      photoFiles.value = '';
      if (!max) { toast('L\'abonnement Basique n\'a pas de photo', 'error'); return; }
      _adminPhotosBusy += files.length;
      renderAdminPartnerPhotos(); // « ⏳ n image(s) » immédiat
      files.forEach(function (f) {
        compressPartnerImage(f, 900, function (dataUrl) {
          _adminPhotosBusy = Math.max(0, _adminPhotosBusy - 1);
          if (dataUrl && _adminPartnerPhotos.length < max) {
            _adminPartnerPhotos.push(dataUrl);
          } else if (dataUrl) {
            toast('Maximum ' + max + ' photo(s) pour ce tier', 'error');
          } else {
            toast('Image illisible : ' + f.name, 'error');
          }
          renderAdminPartnerPhotos();
        });
      });
    };

    var cancel = document.getElementById('apCancelEdit');
    if (cancel) cancel.onclick = function () { renderAdminPartners(el); };

    form.onsubmit = function (e) {
      e.preventDefault();
      var statusEl = document.getElementById('apStatus');
      var submit = form.querySelector('button[type="submit"]');
      var tier = (document.getElementById('apTier') || {}).value || 'basique';
      var body = {
        id: form.getAttribute('data-partner-id') || '',
        name: (document.getElementById('apName') || {}).value || '',
        metier: (document.getElementById('apMetier') || {}).value || '',
        commune: (document.getElementById('apCommune') || {}).value || '',
        tier: tier,
        desc: (document.getElementById('apDesc') || {}).value || '',
        whatsapp: (document.getElementById('apWhatsapp') || {}).value || '',
        link: (document.getElementById('apLink') || {}).value || '',
        order: Number((document.getElementById('apOrder') || {}).value),
        active: !!(document.getElementById('apActive') || {}).checked,
        guest: !!(document.getElementById('apGuest') || {}).checked,
        linkedEmail: ((document.getElementById('apLinkedEmail') || {}).value || '').trim(),
        logo: _adminPartnerLogo,
        photos: _adminPartnerPhotos.slice(0, ADMIN_PARTNER_PHOTOS_MAX[tier] || 0)
      };
      submit.disabled = true;
      if (statusEl) { statusEl.textContent = 'Enregistrement…'; statusEl.className = 'admin-row__status'; }
      adminPostType('partner-save', body).then(function () {
        toast('Carte enregistrée ✓', 'success');
        loadAdminPartners();
      }).catch(function (err) {
        submit.disabled = false;
        if (statusEl) { statusEl.textContent = 'Erreur : ' + err.message; statusEl.className = 'admin-row__status is-error'; }
      });
    };
  }

  function renderAdminPartners(el) {
    el = el || document.getElementById('adminPartnersBody');
    if (!el) return;
    var rows = _adminPartnersList.map(function (p) {
      return '<div class="admin-row" data-partner-row="' + escapeHTML(String(p.id || '')) + '">'
        + '<div class="admin-row__info">'
        + '<strong>' + escapeHTML(String(p.name || '')) + '</strong>'
        + ' <span class="admin-row__meta">' + escapeHTML(String(p.metier || '')) + ' · ' + escapeHTML(String(p.tier || 'basique'))
        + (p.guest === true ? ' · <em>invité</em>' : '')
        + (p.active === false ? ' · <em>masquée</em>' : '') + ' · ordre ' + (Number(p.order) || 0) + '</span>'
        + '</div>'
        + '<div class="admin-row__actions">'
        + '<button type="button" class="btn btn--ghost" data-partner-edit="' + escapeHTML(String(p.id || '')) + '">Modifier</button>'
        + '<button type="button" class="btn btn--ghost" data-partner-del="' + escapeHTML(String(p.id || '')) + '">Supprimer</button>'
        + '</div></div>';
    }).join('');
    el.innerHTML = '<div class="admin-list">'
      + (rows || '<p class="admin-hint">Aucune carte pour l\'instant.</p>')
      + '</div><hr class="menu-divider">' + adminPartnerFormHTML(null);

    bindAdminPartnerForm(el, null);

    el.querySelectorAll('[data-partner-edit]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-partner-edit');
        var p = null;
        for (var i = 0; i < _adminPartnersList.length; i++) {
          if (_adminPartnersList[i].id === id) { p = _adminPartnersList[i]; break; }
        }
        if (!p) return;
        var formSlot = el.querySelector('#adminPartnerForm');
        if (formSlot) formSlot.outerHTML = adminPartnerFormHTML(p);
        bindAdminPartnerForm(el, p);
        var f = el.querySelector('#adminPartnerForm');
        if (f) f.scrollIntoView({ block: 'nearest' });
      };
    });

    el.querySelectorAll('[data-partner-del]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-partner-del');
        if (!window.confirm('Supprimer définitivement cette carte ?')) return;
        btn.disabled = true;
        adminPostType('partner-delete', { id: id }).then(function () {
          toast('Carte supprimée', 'success');
          loadAdminPartners();
        }).catch(function (err) {
          btn.disabled = false;
          toast('Erreur : ' + err.message, 'error');
        });
      };
    });
  }

  // ── Dashboard : Candidatures partenaires (Phase 3a) ────────
  var PJ_PUB_LABEL = { google: 'Google Ads', meta: 'Facebook / Instagram', aucun: 'À définir' };
  var PJ_SITE_LABEL = { neuf: 'Site vitrine neuf', refonte: 'Refonte de son site', portfolio: 'Page portfolio', 'pub-doublee': 'Pas de site — pub doublée', aucun: 'À définir' };

  // ── Codes d'invitation (Black offert) ──────────────────────
  function loadAdminInviteCodes() {
    var el = document.getElementById('adminInviteCodes');
    if (!el) return;
    el.innerHTML = '<p class="admin-loading">Chargement…</p>';
    adminGet('invite-codes').then(function (data) {
      var codes = data.codes || [];
      if (!codes.length) { el.innerHTML = '<p class="admin-hint">Aucun code pour l\'instant.</p>'; return; }
      el.innerHTML = codes.map(function (c) {
        return '<div class="admin-row">'
          + '<div class="admin-row__info"><strong style="letter-spacing:.08em">' + escapeHTML(c.code) + '</strong>'
          + ' <span class="admin-row__meta">' + (c.usedBy
              ? '🎟️ utilisé par ' + escapeHTML(c.usedBy)
              : '<em style="color:#34d399">libre</em>') + '</span></div>'
          + '<div class="admin-row__actions"><button type="button" class="btn btn--ghost" data-invite-del="' + escapeHTML(c.code) + '">Supprimer</button></div>'
          + '</div>';
      }).join('');
      el.querySelectorAll('[data-invite-del]').forEach(function (btn) {
        btn.onclick = function () {
          if (!window.confirm('Supprimer le code ' + btn.getAttribute('data-invite-del') + ' ?')) return;
          btn.disabled = true;
          adminPostType('invite-code-delete', { code: btn.getAttribute('data-invite-del') })
            .then(function () { loadAdminInviteCodes(); })
            .catch(function (e) { btn.disabled = false; toast('Erreur : ' + e.message, 'error'); });
        };
      });
    }).catch(function (e) {
      el.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>';
    });
  }

  function bindAdminInviteCodeCreate() {
    var btn = document.getElementById('adminInviteCodeCreate');
    var input = document.getElementById('adminInviteCodeInput');
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.onclick = function () {
      btn.disabled = true;
      adminPostType('invite-code-save', { code: (input && input.value || '').trim() }).then(function (data) {
        btn.disabled = false;
        if (input) input.value = '';
        toast('Code créé : ' + data.code, 'success');
        loadAdminInviteCodes();
      }).catch(function (e) {
        btn.disabled = false;
        toast('Erreur : ' + e.message, 'error');
      });
    };
  }

  function loadAdminApplications() {
    loadAdminInviteCodes();
    bindAdminInviteCodeCreate();
    var el = document.getElementById('adminApplicationsBody');
    if (!el) return;
    el.innerHTML = '<p class="admin-loading">Chargement…</p>';
    adminGet('partner-applications').then(function (data) {
      var list = data.applications || [];
      if (!list.length) { el.innerHTML = '<p class="admin-hint">Aucune candidature pour l\'instant.</p>'; return; }
      el.innerHTML = list.map(function (a) {
        var when = a.createdAt ? new Date(a.createdAt).toLocaleString('fr-FR') : '—';
        var sizes = [
          a.sizes && a.sizes.tshirt ? 'T-shirt ' + a.sizes.tshirt : '',
          a.sizes && a.sizes.pantalon ? 'Pantalon ' + a.sizes.pantalon : '',
          a.sizes && a.sizes.pointure ? 'Pointure ' + a.sizes.pointure : '',
          a.sizes && a.sizes.gants ? 'Gants ' + a.sizes.gants : ''
        ].filter(Boolean).join(' · ');
        function line(label, val) {
          return val ? '<div class="admin-app__line"><span>' + escapeHTML(label) + '</span> ' + escapeHTML(val) + '</div>' : '';
        }
        return '<div class="admin-app admin-app--' + escapeHTML(a.tier || 'basique') + '">'
          + '<div class="admin-app__head">'
          + '<strong>' + escapeHTML(a.name || '') + '</strong>'
          + '<span class="admin-app__tier">' + escapeHTML((a.tier || '').toUpperCase()) + (a.invited ? ' · 🎟️ INVITÉ' : '') + '</span>'
          + '</div>'
          + (a.invited ? '<div class="admin-app__line"><span>Invitation</span> code ' + escapeHTML(a.inviteCode || '') + ' — abonnement offert (pas de bon 38 €)</div>' : '')
          + (a.uid ? '<div class="admin-app__line"><span>Compte lié</span> ✓ (mets son email dans « Email du compte client lié » en créant sa carte)</div>' : '')
          + line('Métier', a.metier + (a.commune ? ' — ' + a.commune : ''))
          + '<div class="admin-app__line"><span>Contact</span> '
            + '<a href="mailto:' + encodeURIComponent(a.email) + '">' + escapeHTML(a.email) + '</a>'
            + (a.phone ? ' · ' + escapeHTML(a.phone) : '') + '</div>'
          + line('Tailles ÉPI', sizes)
          + line('Couleurs', a.couleurs)
          + line('Réseaux', [a.facebook, a.instagram].filter(Boolean).join(' · '))
          + line('Publicité', PJ_PUB_LABEL[a.pubChoice] || a.pubChoice)
          + line('Site', a.hasWebsite ? ('Oui (' + (a.websiteUrl || 'n.c.') + ') — ' + (PJ_SITE_LABEL[a.siteOption] || a.siteOption)) : (PJ_SITE_LABEL[a.siteOption] || ''))
          + (a.hasLogo ? '<div class="admin-app__line"><span>Logo</span> ✓ fourni</div>' : '')
          + line('Message', a.message)
          + '<div class="admin-app__foot">' + escapeHTML(when) + ' · statut : ' + escapeHTML(a.status || 'nouvelle') + '</div>'
          + '</div>';
      }).join('');
    }).catch(function (e) {
      el.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>';
    });
  }

  // ── Dashboard : Barème livreurs & carburant (prix essence modifiable live) ──
  var _lvAdminFuel = null;   // prix du litre chargé depuis le serveur
  function renderAdminCourierBareme() {
    var el = document.getElementById('adminCourierBareme');
    if (!el) return;
    var P = _lvAdminFuel || LV_FUEL_DEFAULT;
    var fmt = function (n, d) { return n.toFixed(d === undefined ? 2 : d).replace('.', ','); };
    var EXAMPLES = [
      { label: 'Sainte-Anne ↔ Capesterre-Belle-Eau', route: 46, zone: 2 },  // zone 🟡 (index 2)
      { label: 'Sainte-Anne ↔ Basse-Terre (ville)',  route: 61, zone: 3 }   // zone 🔴 (index 3)
    ];
    var h = '<div class="admin-bareme">'
      // Barème par zone (rappel)
      + '<div class="admin-bareme__zones">'
      + LV_BAREME.map(function (b) {
          return '<div class="admin-bareme__zone"><span>' + b.emoji + ' Z' + b.zone + '</span><em>' + b.km + ' km</em><strong>' + b.prix + ' €</strong></div>';
        }).join('')
      + '</div>'
      + '<p class="admin-hint">Barème dégressif : ancrage Sainte-Anne → Basse-Terre (zone 🔴, trajet le plus long) = 100 €, proportionnel au rayon (≈ 2,17 €/km). Payé par l\'artisan au livreur — 0 % pour la plateforme.</p>'
      // Prix essence modifiable
      + '<div class="admin-bareme__fuel">'
      + '<label>⛽ Prix du litre sans plomb (Guadeloupe, réglementé — révisé chaque mois par la préfecture)'
      + '<input type="number" id="lvFuelInput" step="0.01" min="0.5" max="5" value="' + P.toFixed(2) + '"> €/L</label>'
      + '<button type="button" class="btn primary" id="lvFuelSave">Enregistrer</button>'
      + '<span id="lvFuelStatus" class="pj-status" aria-live="polite"></span>'
      + '</div>'
      // Tableau conso par cylindrée (recalcul LIVE quand le prix change)
      + '<div class="admin-bareme__tablewrap"><table class="admin-bareme__table"><thead><tr>'
      + '<th>Cylindrée</th><th>Conso constructeur</th><th>Conso Guadeloupe<br><small>(+20 % chaleur/virages)</small></th><th>Coût essence<br>par km</th>'
      + EXAMPLES.map(function (ex) {
          var z = LV_BAREME[ex.zone];
          return '<th>' + ex.label + '<br><small>' + (ex.route * 2) + ' km A/R route · course ' + z.emoji + ' ' + z.prix + ' €</small></th>';
        }).join('')
      + '</tr></thead><tbody id="lvBaremeBody"></tbody></table></div>'
      + '<p class="admin-hint">« Il lui reste » = rémunération de la course moins l\'essence A/R (avant cotisations micro-entrepreneur ~21,2 %). Le tableau se recalcule instantanément quand tu changes le prix du litre.</p>'
      + '</div>';
    el.innerHTML = h;

    function body() {
      var Pnow = parseFloat((document.getElementById('lvFuelInput') || {}).value) || P;
      var rows = Object.keys(LV_CYL).map(function (ck) {
        var c = LV_CYL[ck], gp = lvConsoGp(ck);
        var perKm = gp / 100 * Pnow;
        var cells = '<td><strong>' + c.label + '</strong></td>'
          + '<td>' + fmt(c.base, 1) + ' L/100</td>'
          + '<td><strong>' + fmt(gp, 1) + ' L/100</strong></td>'
          + '<td>' + fmt(perKm, 3) + ' €/km</td>';
        EXAMPLES.forEach(function (ex) {
          var kmAR = ex.route * 2, litres = gp * kmAR / 100, cout = litres * Pnow;
          var net = LV_BAREME[ex.zone].prix - cout;
          cells += '<td>' + fmt(litres, 1) + ' L → ' + fmt(cout) + ' €<br><small class="admin-bareme__net">il lui reste ' + fmt(net) + ' €</small></td>';
        });
        return '<tr>' + cells + '</tr>';
      }).join('');
      var tb = document.getElementById('lvBaremeBody');
      if (tb) tb.innerHTML = rows;
    }
    body();
    var inp = document.getElementById('lvFuelInput');
    if (inp) inp.oninput = body;
    var save = document.getElementById('lvFuelSave');
    if (save) save.onclick = function () {
      var v = parseFloat(inp.value);
      var st = document.getElementById('lvFuelStatus');
      if (!(v > 0.5 && v < 5)) { if (st) st.textContent = 'Prix invalide.'; return; }
      if (st) st.textContent = 'Enregistrement…';
      adminPostType('courier-config', { fuelPrice: v }).then(function () {
        _lvAdminFuel = v;
        if (st) st.textContent = '✅ Enregistré (' + fmt(v) + ' €/L).';
      }).catch(function (e) { if (st) st.textContent = 'Erreur : ' + e.message; });
    };
  }

  // ── Dashboard : Dossiers livreurs (service coursier — validation manuelle) ──
  function loadAdminCouriers() {
    // Barème & carburant : charge le prix du litre serveur puis rend le tableau.
    if (_lvAdminFuel === null) {
      adminGet('courier-config').then(function (d) {
        _lvAdminFuel = (d.config && d.config.fuelPrice) || LV_FUEL_DEFAULT;
        renderAdminCourierBareme();
      }).catch(function () { _lvAdminFuel = LV_FUEL_DEFAULT; renderAdminCourierBareme(); });
    } else renderAdminCourierBareme();

    // Avis clients (notes + commentaires des courses)
    var rEl = document.getElementById('adminCourierRatings');
    if (rEl) adminGet('course-ratings').then(function (data) {
      var list = data.ratings || [];
      if (!list.length) { rEl.innerHTML = '<p class="admin-hint">Aucun avis pour l\'instant.</p>'; return; }
      rEl.innerHTML = list.map(function (a) {
        var when = a.ratedAt ? new Date(a.ratedAt).toLocaleString('fr-FR') : '—';
        var st = '★★★★★'.slice(0, a.rating) + '☆☆☆☆☆'.slice(0, 5 - a.rating);
        return '<div class="admin-app"><div class="admin-app__head"><strong>' + st + ' (' + a.rating + '/5)</strong>'
          + '<span class="admin-app__tier">Zone ' + a.zone + ' · ' + a.prix + ' €</span></div>'
          + (a.comment ? '<div class="admin-app__line"><span>Commentaire</span> « ' + escapeHTML(a.comment) + ' »</div>' : '')
          + '<div class="admin-app__line"><span>Livraison</span> ' + escapeHTML(a.productTitle || '') + ' — ' + escapeHTML(a.address || '') + '</div>'
          + '<div class="admin-app__line"><span>Livreur</span> ' + escapeHTML(a.courierEmail || '—') + ' · <span>Client</span> ' + escapeHTML(a.artisanEmail || '—') + '</div>'
          + '<div class="admin-app__foot">' + escapeHTML(when) + '</div></div>';
      }).join('');
    }).catch(function (e) { rEl.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>'; });

    // Litiges & vidéos (privées — liens signés 1 h ; clôture = suppression)
    var dEl = document.getElementById('adminCourierDisputes');
    if (dEl) adminGet('course-disputes').then(function (data) {
      var list = data.disputes || [];
      if (!list.length) { dEl.innerHTML = '<p class="admin-hint">Aucun litige ni vidéo pour l\'instant.</p>'; return; }
      dEl.innerHTML = list.map(function (d) {
        var lit = d.litige;
        var vids = (d.videos || []).map(function (v, i) {
          var when = v.at ? new Date(v.at).toLocaleString('fr-FR') : '';
          return v.url
            ? '<a href="' + escapeHTML(v.url) + '" target="_blank" rel="noopener noreferrer">🎥 Vidéo ' + (i + 1) + ' (' + escapeHTML(v.role || '?') + (when ? ' · ' + escapeHTML(when) : '') + ') ↗</a>'
            : '<em>🎥 Vidéo ' + (i + 1) + ' (' + escapeHTML(v.role || '?') + ') — fichier indisponible (Storage non activé ?)</em>';
        }).join('<br>');
        return '<div class="admin-app admin-app--dispute">'
          + '<div class="admin-app__head"><strong>' + (lit && lit.open ? '⚠️ LITIGE OUVERT' : (lit ? '✅ Litige clos' : '🎥 Vidéos')) + '</strong>'
          + '<span class="admin-app__tier">Zone ' + d.zone + ' · ' + d.prix + ' € · ' + escapeHTML(d.status || '') + (d.escrow ? ' · escrow ' + escapeHTML(d.escrow) : '') + '</span></div>'
          + '<div class="admin-app__line"><span>Course</span> ' + escapeHTML(d.id) + ' — ' + escapeHTML(d.address || '') + '</div>'
          + '<div class="admin-app__line"><span>Client</span> ' + escapeHTML(d.artisanEmail || '—') + ' · <span>Livreur</span> ' + escapeHTML(d.courierEmail || '—') + '</div>'
          + (lit && lit.message ? '<div class="admin-app__line"><span>Motif (' + escapeHTML(lit.role || '?') + ')</span> « ' + escapeHTML(lit.message) + ' »</div>' : '')
          + (vids ? '<div class="admin-app__line"><span>Vidéos</span> ' + vids + '</div>' : '')
          + (lit && lit.open
            ? '<div class="admin-app__actions"><button type="button" class="btn primary" data-dispute-close="' + escapeHTML(d.id) + '">✅ Clore le litige (supprime les vidéos)</button></div>'
            : '')
          + '</div>';
      }).join('');
      dEl.querySelectorAll('[data-dispute-close]').forEach(function (b) {
        b.onclick = function () {
          var decision = prompt('Décision (notée dans le dossier de la course) :', '');
          if (decision === null) return;
          b.disabled = true;
          adminPostType('course-dispute-close', { id: b.getAttribute('data-dispute-close'), decision: decision })
            .then(function () { loadAdminCouriers(); })
            .catch(function (e) { b.disabled = false; alert('Erreur : ' + e.message); });
        };
      });
    }).catch(function (e) { dEl.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>'; });

    var el = document.getElementById('adminCouriersBody');
    if (!el) return;
    el.innerHTML = '<p class="admin-loading">Chargement…</p>';
    adminGet('courier-applications').then(function (data) {
      var list = data.applications || [];
      if (!list.length) { el.innerHTML = '<p class="admin-hint">Aucun dossier livreur pour l\'instant (service inactif).</p>'; return; }
      el.innerHTML = list.map(function (a) {
        var veh = LV_VEHICLES[a.vehicle] ? (LV_VEHICLES[a.vehicle].emoji + ' ' + LV_VEHICLES[a.vehicle].label) : (a.vehicle || '—');
        var pieces = LV_PIECES_BASE.concat(LV_PIECES_EXTRA[a.vehicle] || []);
        var piecesHtml = pieces.map(function (p) {
          var f = a.pieces && a.pieces[p.id];
          return '<div class="admin-app__line"><span>' + escapeHTML(p.t) + '</span> '
            + (f ? '<a href="' + escapeHTML(f.url || '#') + '" target="_blank" rel="noopener noreferrer">Voir la pièce ↗</a>' : '<em>manquante</em>') + '</div>';
        }).join('');
        var st = a.status || 'en_attente';
        var when = a.createdAt ? new Date(a.createdAt).toLocaleString('fr-FR') : '—';
        return '<div class="admin-app admin-app--courier">'
          + '<div class="admin-app__head"><strong>' + escapeHTML(a.name || 'Livreur') + '</strong>'
          + '<span class="admin-app__tier">' + escapeHTML(veh) + ' · ' + escapeHTML(st) + '</span></div>'
          + '<div class="admin-app__line"><span>Contact</span> <a href="mailto:' + encodeURIComponent(a.email || '') + '">' + escapeHTML(a.email || '') + '</a>' + (a.phone ? ' · ' + escapeHTML(a.phone) : '') + '</div>'
          + piecesHtml
          + '<div class="admin-app__foot">' + escapeHTML(when) + '</div>'
          + '<div class="admin-app__actions">'
          + '<button type="button" class="btn primary" data-courier-ok="' + escapeHTML(a.uid || '') + '">✅ Valider</button>'
          + '<button type="button" class="btn" data-courier-ko="' + escapeHTML(a.uid || '') + '">❌ Refuser</button>'
          + '</div></div>';
      }).join('');
      el.querySelectorAll('[data-courier-ok]').forEach(function (b) { b.onclick = function () { reviewCourier(b.getAttribute('data-courier-ok'), 'valide'); }; });
      el.querySelectorAll('[data-courier-ko]').forEach(function (b) { b.onclick = function () { reviewCourier(b.getAttribute('data-courier-ko'), 'refuse'); }; });
    }).catch(function (e) {
      el.innerHTML = '<p class="admin-error">Erreur : ' + escapeHTML(e.message) + '</p>';
    });
  }
  function reviewCourier(uid, status) {
    if (!uid) return;
    adminPostType('courier-review', { uid: uid, status: status })
      .then(function () { loadAdminCouriers(); })
      .catch(function (e) { alert('Erreur : ' + e.message); });
  }

  function renderAdmin() {
    var view = document.getElementById('adminView');
    if (!view) return;

    var secret = getAdminSecret();
    if (!secret) {
      view.innerHTML = adminLoginTemplate();
      var form = document.getElementById('adminLoginForm');
      var input = document.getElementById('adminSecretInput');
      if (form && input) {
        form.onsubmit = function (e) {
          e.preventDefault();
          var val = (input.value || '').trim();
          if (!val) return;
          setAdminSecret(val);
          renderAdmin();
        };
      }
      return;
    }

    // Re-rendu de l'admin : réinitialise les drapeaux de chargement paresseux
    // (sinon, en ré-entrant dans l'admin, les onglets resteraient sur
    // « Chargement… ») et libère un éventuel globe orphelin.
    _adminStatsLoaded = false;
    _adminClientsLoaded = false;
    destroyAdminGlobe();

    view.innerHTML = '<div class="admin-wrap">'
      + '<header class="admin-header">'
      + '<h1>Administration — Pirates Tools</h1>'
      + '<button type="button" class="btn btn--ghost" id="adminLogoutBtn">Déconnexion</button>'
      + '</header>'

      + '<nav class="admin-tabs" role="tablist">'
      + '<button type="button" class="admin-tab is-active" data-admin-tab="products" role="tab" aria-selected="true">Produits</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="compta" role="tab" aria-selected="false">Comptabilité</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="margins" role="tab" aria-selected="false">Marges</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="fisc" role="tab" aria-selected="false">Fiscalité</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="invoices" role="tab" aria-selected="false">Factures</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="stats" role="tab" aria-selected="false">Statistiques</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="clients" role="tab" aria-selected="false">Clients</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="partners" role="tab" aria-selected="false">Partenaires</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="applications" role="tab" aria-selected="false">Candidatures</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="couriers" role="tab" aria-selected="false">Livreurs</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="orders" role="tab" aria-selected="false">Commandes</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="tools" role="tab" aria-selected="false">Outils</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="instagram" role="tab" aria-selected="false">Instagram</button>'
      + '</nav>'

      + '<div class="admin-pane is-active" data-admin-pane="products">'
      + '<p class="admin-hint">Édite le stock et le prix de chaque produit. Les modifications sont enregistrées dans Firestore et visibles en production après rafraîchissement du cache (≤30 s).</p>'
      + '<div id="adminProductList" class="admin-list"><p class="admin-loading">Chargement…</p></div>'
      + '</div>'

      + '<div class="admin-pane" data-admin-pane="compta" hidden>'
      + '<div id="adminComptaBody"></div>'
      + '</div>'

      + '<div class="admin-pane" data-admin-pane="margins" hidden>'
      + '<div id="adminMarginsBody"></div>'
      + '</div>'

      + '<div class="admin-pane" data-admin-pane="fisc" hidden>'
      + '<div id="adminFiscBody"></div>'
      + '</div>'

      + '<div class="admin-pane" data-admin-pane="invoices" hidden>'
      + '<div id="adminInvoicesBody"></div>'
      + '</div>'

      + '<div class="admin-pane" data-admin-pane="orders" hidden>'
      + '<p class="admin-hint">Dernières commandes payées (lecture seule). Nécessite <code>FIREBASE_SERVICE_ACCOUNT</code>.</p>'
      + '<div id="adminOrdersList" class="admin-list"><p class="admin-loading">Clique sur "Rafraîchir" pour charger les commandes.</p></div>'
      + '<button type="button" class="btn btn--ghost" id="adminOrdersRefresh">Rafraîchir</button>'
      + '</div>'

      + '<div class="admin-pane" data-admin-pane="tools" hidden>'
      + '<h2 class="admin-subtitle">Email Resend</h2>'
      + '<p class="admin-hint">Envoie un email de test pour vérifier que <code>RESEND_API_KEY</code>, <code>RESEND_FROM</code> et <code>OWNER_EMAIL</code> sont correctement configurés.</p>'
      + '<form id="adminTestEmailForm" class="admin-tools-form">'
      + '<label class="admin-field">'
      + '<span>Destinataire (vide = OWNER_EMAIL)</span>'
      + '<input type="email" id="adminTestEmailTo" placeholder="test@example.com">'
      + '</label>'
      + '<button type="submit" class="btn primary">Envoyer un email de test</button>'
      + '<span id="adminTestEmailStatus" class="admin-row__status" aria-live="polite"></span>'
      + '</form>'

      + '<h2 class="admin-subtitle">Environnement</h2>'
      + '<p class="admin-hint">Vérifie que les variables serverless sont bien configurées sur Vercel.</p>'
      + '<button type="button" class="btn btn--ghost" id="adminHealthBtn">Vérifier /api/health</button>'
      + '<pre id="adminHealthOutput" class="admin-health-output" hidden></pre>'
      + '</div>'

      + '<div class="admin-pane" data-admin-pane="instagram" hidden>'

      + '<div class="ig-admin">'

      // ─ Account info section
      + '<div class="ig-section ig-account">'
      + '<h2 class="admin-subtitle">Compte Instagram</h2>'
      + '<p class="admin-hint">Informations du compte Instagram Business lié.</p>'
      + '<button type="button" class="btn primary" id="igLoadAccount" aria-label="Charger le compte Instagram">Charger le compte</button>'
      + '<div id="igAccountInfo" class="ig-account-info" hidden></div>'
      + '</div>'

      // ─ Token management
      + '<div class="ig-section ig-token">'
      + '<h2 class="admin-subtitle">Token d\'accès</h2>'
      + '<p class="admin-hint">Échange le token court (1h) contre un token longue durée (60 jours). Après l\'échange, copie le nouveau token et mets-le à jour dans Vercel → Environment Variables → META_ACCESS_TOKEN.</p>'
      + '<button type="button" class="btn btn--ghost" id="igExchangeToken" aria-label="Échanger le token">Échanger pour token 60 jours</button>'
      + '<div id="igTokenResult" class="ig-token-result" hidden></div>'
      + '</div>'

      // ─ Posts gallery
      + '<div class="ig-section ig-media">'
      + '<h2 class="admin-subtitle">Publications</h2>'
      + '<p class="admin-hint">Dernières publications Instagram. Clique sur un post pour voir les commentaires.</p>'
      + '<button type="button" class="btn btn--ghost" id="igLoadMedia" aria-label="Charger les publications">Charger les posts</button>'
      + '<div id="igMediaGrid" class="ig-media-grid"></div>'
      + '</div>'

      // ─ New post (draft + publish)
      + '<div class="ig-section ig-publish">'
      + '<h2 class="admin-subtitle">Nouveau post</h2>'
      + '<p class="admin-hint">Crée un post Instagram. L\'image doit être une URL publique (hébergée en ligne). Le post sera d\'abord créé en brouillon — tu devras confirmer la publication.</p>'
      + '<form id="igPublishForm" class="ig-publish-form">'
      + '<label class="admin-field"><span>URL de l\'image</span>'
      + '<input type="url" id="igImageUrl" placeholder="https://example.com/image.jpg" required></label>'
      + '<label class="admin-field"><span>Légende / Caption</span>'
      + '<textarea id="igCaption" rows="4" placeholder="Nouvelle offre Pirates Tools ! 🏴‍☠️&#10;#PiratesTools #Guadeloupe #Outillage"></textarea></label>'
      + '<div class="ig-publish-preview" id="igPreview" hidden>'
      + '<img id="igPreviewImg" src="" alt="Aperçu" class="ig-preview-img">'
      + '<p id="igPreviewCaption" class="ig-preview-caption"></p>'
      + '</div>'
      + '<div class="ig-publish-actions">'
      + '<button type="button" class="btn btn--ghost" id="igPreviewBtn">Aperçu</button>'
      + '<button type="submit" class="btn primary" id="igPublishBtn" disabled>Créer le brouillon</button>'
      + '</div>'
      + '<span id="igPublishStatus" class="admin-row__status" aria-live="polite"></span>'
      + '</form>'
      + '<div id="igDraftConfirm" class="ig-draft-confirm" hidden>'
      + '<p class="ig-draft-msg">Brouillon créé ! Confirme la publication :</p>'
      + '<button type="button" class="btn primary" id="igConfirmPublish" aria-label="Confirmer la publication">Publier maintenant</button>'
      + '<button type="button" class="btn btn--ghost" id="igCancelPublish">Annuler</button>'
      + '<span id="igConfirmStatus" class="admin-row__status" aria-live="polite"></span>'
      + '</div>'
      + '</div>'

      // ─ Comments viewer
      + '<div class="ig-section ig-comments">'
      + '<h2 class="admin-subtitle">Commentaires</h2>'
      + '<p class="admin-hint">Sélectionne un post ci-dessus pour voir ses commentaires, ou entre un Media ID manuellement.</p>'
      + '<div class="ig-comments-lookup">'
      + '<input type="text" id="igMediaIdInput" placeholder="Media ID" class="ig-media-id-input">'
      + '<button type="button" class="btn btn--ghost" id="igLoadComments" aria-label="Charger les commentaires">Charger</button>'
      + '</div>'
      + '<div id="igCommentsList" class="ig-comments-list"></div>'
      + '</div>'

      // ─ Insights
      + '<div class="ig-section ig-insights">'
      + '<h2 class="admin-subtitle">Statistiques</h2>'
      + '<p class="admin-hint">Impressions, portée et visites profil (derniers 30 jours).</p>'
      + '<button type="button" class="btn btn--ghost" id="igLoadInsights" aria-label="Charger les statistiques">Charger les stats</button>'
      + '<div id="igInsightsData" class="ig-insights-data"></div>'
      + '</div>'

      + '</div>' // .ig-admin
      + '</div>' // admin-pane instagram

      // ── Statistiques (dashboard analytics maison) ──────────────
      + '<div class="admin-pane" data-admin-pane="stats" hidden>'
      + '<p class="admin-hint">Mesure d\'audience maison (première partie, sans traceur publicitaire). Données agrégées, IP jamais stockée. Le globe des visiteurs arrive à l\'étape suivante.</p>'
      + '<div id="adminStats" class="admin-stats"><p class="admin-loading">Chargement…</p></div>'
      + '<div class="admin-stats-actions">'
      + '<button type="button" class="btn btn--ghost" id="adminStatsRefresh">Rafraîchir</button>'
      + '<button type="button" class="btn primary" id="adminReportBtn">Recevoir le rapport par mail</button>'
      + '<span id="adminReportStatus" class="admin-row__status" aria-live="polite"></span>'
      + '</div>'
      + '</div>'

      // ── Clients (comptes créés) ────────────────────────────────
      + '<div class="admin-pane" data-admin-pane="clients" hidden>'
      + '<p class="admin-hint">Fiches des clients ayant créé un compte (données fournies volontairement à l\'inscription).</p>'
      + '<div id="adminClients" class="admin-clients"><p class="admin-loading">Chargement…</p></div>'
      + '<button type="button" class="btn btn--ghost" id="adminClientsRefresh">Rafraîchir</button>'
      + '</div>'

      // ── Partenaires (annuaire artisans, Phase 2 abonnements) ──
      + '<div class="admin-pane" data-admin-pane="partners" hidden>'
      + '<p class="admin-hint">Cartes de l\'annuaire « Nos artisans » (#/artisans). Les partenaires Black apparaissent aussi sur l\'accueil. Photos compressées automatiquement (≤ ~120 Ko chacune).</p>'
      + '<div id="adminPartnersBody"><p class="admin-loading">Chargement…</p></div>'
      + '</div>'

      // ── Candidatures (pré-inscriptions artisans, Phase 3a) ──
      + '<div class="admin-pane" data-admin-pane="applications" hidden>'

      + '<h2 class="admin-subtitle">Codes d\'invitation</h2>'
      + '<p class="admin-hint">Crée un code et envoie-le à ton invité : il s\'inscrit via « Rejoindre le réseau » en entrant ce code (abonnement offert, compte requis). Usage unique — le code se consomme à la candidature.</p>'
      + '<div class="ig-comments-lookup">'
      + '<input type="text" id="adminInviteCodeInput" placeholder="Vide = code généré (PT-XXXXXX)" class="ig-media-id-input" autocapitalize="characters">'
      + '<button type="button" class="btn primary" id="adminInviteCodeCreate">Créer un code</button>'
      + '</div>'
      + '<div id="adminInviteCodes" class="admin-list"><p class="admin-loading">Chargement…</p></div>'

      + '<h2 class="admin-subtitle">Candidatures reçues</h2>'
      + '<p class="admin-hint">Pré-inscriptions reçues via le formulaire « Rejoindre le réseau » (#/rejoindre). Sans paiement — à recontacter au lancement. Tu reçois aussi chaque candidature par email.</p>'
      + '<div id="adminApplicationsBody"><p class="admin-loading">Chargement…</p></div>'
      + '<button type="button" class="btn btn--ghost" id="adminApplicationsRefresh">Rafraîchir</button>'
      + '</div>'

      // ── Livreurs : validation des dossiers coursier (option B, KYC manuel) ──
      + '<div class="admin-pane" data-admin-pane="couriers" hidden>'
      + '<h2 class="admin-subtitle">Barème & carburant</h2>'
      + '<div id="adminCourierBareme"><p class="admin-loading">Chargement…</p></div>'
      + '<h2 class="admin-subtitle">⭐ Avis clients sur les livreurs</h2>'
      + '<div id="adminCourierRatings"><p class="admin-loading">Chargement…</p></div>'
      + '<h2 class="admin-subtitle">⚠️ Litiges & vidéos de remise</h2>'
      + '<p class="admin-hint">Vidéos PRIVÉES (client/livreur) lisibles ici uniquement, via lien signé 1 h. Engagement : jamais divulguées, effacées à la clôture du litige. Clore un litige supprime définitivement ses vidéos du Storage.</p>'
      + '<div id="adminCourierDisputes"><p class="admin-loading">Chargement…</p></div>'
      + '<h2 class="admin-subtitle">Dossiers livreurs</h2>'
      + '<p class="admin-hint">Candidatures coursier reçues via « Devenir Livreur ». Vérifie les pièces (identité, permis, assurance, capacité transport…) puis valide ou refuse. Le service est INACTIF tant que le module n\'est pas ouvert : cette liste sera vide jusqu\'au lancement.</p>'
      + '<div id="adminCouriersBody"><p class="admin-loading">Chargement…</p></div>'
      + '<button type="button" class="btn btn--ghost" id="adminCouriersRefresh">Rafraîchir</button>'
      + '</div>'

      + '</div>';

    var logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) logoutBtn.onclick = function () {
      setAdminSecret('');
      renderAdmin();
    };

    // Tab delegation
    var tabs = view.querySelectorAll('.admin-tab');
    var panes = view.querySelectorAll('.admin-pane');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-admin-tab');
        // Barre d'onglets défilante : ramène l'onglet cliqué dans la zone visible.
        try { tab.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (_) {}
        tabs.forEach(function (t) {
          var active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panes.forEach(function (p) {
          var active = p.getAttribute('data-admin-pane') === target;
          p.classList.toggle('is-active', active);
          p.hidden = !active;
        });
        if (target === 'orders') loadAdminOrders();
        if (target === 'compta') renderAdminCompta();
        if (target === 'margins') loadAdminMargins();
        if (target === 'fisc') renderAdminFisc();
        if (target === 'invoices') renderAdminInvoices();
        if (target === 'instagram') initAdminInstagram();
        if (target === 'stats') loadAdminStats();
        if (target === 'clients') loadAdminClients();
        if (target === 'partners') loadAdminPartners();
        if (target === 'applications') loadAdminApplications();
        if (target === 'couriers') loadAdminCouriers();
        if (target !== 'stats') destroyAdminGlobe(); // libère le contexte WebGL
      });
    });

    var statsRefresh = document.getElementById('adminStatsRefresh');
    if (statsRefresh) statsRefresh.onclick = function () { loadAdminStats(true); };
    var reportBtn = document.getElementById('adminReportBtn');
    if (reportBtn) reportBtn.onclick = sendAdminReport;
    var clientsRefresh = document.getElementById('adminClientsRefresh');
    if (clientsRefresh) clientsRefresh.onclick = function () { loadAdminClients(true); };
    var appsRefresh = document.getElementById('adminApplicationsRefresh');
    if (appsRefresh) appsRefresh.onclick = function () { loadAdminApplications(); };
    var couriersRefresh = document.getElementById('adminCouriersRefresh');
    if (couriersRefresh) couriersRefresh.onclick = function () { loadAdminCouriers(); };

    // Test email form
    var testForm = document.getElementById('adminTestEmailForm');
    if (testForm) {
      testForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var toInput = document.getElementById('adminTestEmailTo');
        var statusEl = document.getElementById('adminTestEmailStatus');
        var submit = testForm.querySelector('button[type="submit"]');
        var to = (toInput.value || '').trim();

        submit.disabled = true;
        if (statusEl) {
          statusEl.textContent = 'Envoi…';
          statusEl.className = 'admin-row__status';
        }

        var apiBase = apiBaseUrl();
        adminAuthHeaders({ 'Content-Type': 'application/json' }).then(function (headers) {
          return fetch(apiBase + '/api/test-email', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(to ? { to: to } : {})
          });
        })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
        .then(function (res) {
          submit.disabled = false;
          if (res.ok && res.data.ok) {
            if (statusEl) {
              statusEl.textContent = '✓ Envoyé à ' + res.data.to;
              statusEl.className = 'admin-row__status admin-row__status--ok';
            }
          } else {
            if (statusEl) {
              statusEl.textContent = '✗ ' + ((res.data && res.data.error) || 'Erreur inconnue');
              statusEl.className = 'admin-row__status admin-row__status--err';
            }
          }
        })
        .catch(function (err) {
          submit.disabled = false;
          if (statusEl) {
            statusEl.textContent = '✗ Réseau : ' + err.message;
            statusEl.className = 'admin-row__status admin-row__status--err';
          }
        });
      });
    }

    // Health check
    var healthBtn = document.getElementById('adminHealthBtn');
    if (healthBtn) {
      healthBtn.addEventListener('click', function () {
        var out = document.getElementById('adminHealthOutput');
        var apiBase = apiBaseUrl();
        healthBtn.disabled = true;
        fetch(apiBase + '/api/health')
          .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Invalid response' }; }); })
          .then(function (data) {
            healthBtn.disabled = false;
            if (out) {
              out.hidden = false;
              out.textContent = JSON.stringify(data, null, 2);
            }
          })
          .catch(function (err) {
            healthBtn.disabled = false;
            if (out) {
              out.hidden = false;
              out.textContent = 'Erreur : ' + err.message;
            }
          });
      });
    }

    // Orders refresh button
    var refreshBtn = document.getElementById('adminOrdersRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadAdminOrders);

    renderAdminList();
  }

  function loadAdminOrders() {
    var listEl = document.getElementById('adminOrdersList');
    if (!listEl) return;
    listEl.innerHTML = '<p class="admin-loading">Chargement des commandes…</p>';

    var apiBase = apiBaseUrl();
    adminAuthHeaders().then(function (headers) {
      return fetch(apiBase + '/api/admin?type=orders', { headers: headers });
    })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
    .then(function (res) {
      if (!res.ok || !res.data.ok) {
        listEl.innerHTML = '<p class="admin-loading">Erreur : ' + escapeHTML((res.data && res.data.error) || 'Inconnue') + '</p>';
        return;
      }
      var orders = res.data.orders || [];
      if (orders.length === 0) {
        // Index Firestore manquant : Firestore renvoie un lien de création
        // « 1 tap ». On l'affiche pour que l'admin crée l'index sans CLI.
        if (res.data.indexUrl) {
          listEl.innerHTML = '<div class="admin-index-warn">'
            + '<p><b>Index Firestore manquant.</b> La liste des commandes a besoin d\'un index. Touche le bouton ci-dessous : la console Firebase s\'ouvre, tu confirmes, et l\'index se crée tout seul (quelques minutes).</p>'
            + '<a class="btn primary" href="' + encodeURI(res.data.indexUrl) + '" target="_blank" rel="noopener noreferrer">Créer l\'index Firestore</a>'
            + '<p class="admin-hint">Après création, reviens ici et touche « Rafraîchir ».</p>'
            + '</div>';
          return;
        }
        listEl.innerHTML = '<p class="admin-loading">Aucune commande pour l\'instant.</p>';
        return;
      }
      listEl.innerHTML = orders.map(function (o) {
        var status = o.status || 'pending';
        var when = o.createdAt ? new Date(o.createdAt).toLocaleString('fr-FR') : '—';
        var total = typeof o.total === 'number' ? formatPrice(o.total) : '—';
        return '<div class="admin-row">'
          + '<div class="admin-row__head">'
          + '<div class="admin-row__info">'
          + '<span class="admin-row__brand">Commande ' + escapeHTML(String(o.id || '').slice(-8).toUpperCase()) + '</span>'
          + '<strong class="admin-row__title">' + escapeHTML(o.customerEmail || 'Client anonyme') + '</strong>'
          + '<span class="admin-row__id">' + escapeHTML(when) + ' · ' + escapeHTML(total) + ' · ' + escapeHTML(status) + '</span>'
          + '</div>'
          + '</div>'
          + '</div>';
      }).join('');
    })
    .catch(function (err) {
      listEl.innerHTML = '<p class="admin-loading">Erreur réseau : ' + escapeHTML(err.message) + '</p>';
    });
  }

  function renderAdminList() {
    var listEl = document.getElementById('adminProductList');
    if (!listEl) return;

    if (!products || products.length === 0) {
      listEl.innerHTML = '<p class="admin-loading">Catalogue vide — attends que les produits soient chargés.</p>';
      return;
    }

    listEl.innerHTML = products.map(function (p) {
      var id = escapeHTML(p.id);
      var status = (p.stock_status || 'in_stock');
      var label = (p.stock_label || '');
      var price = Number(p.price || 0).toFixed(2);
      return '<div class="admin-row" data-product-id="' + id + '">'
        + '<div class="admin-row__head">'
        + '<img src="' + escapeHTML(p.img || 'images/placeholder.svg') + '" alt="" class="admin-row__img" loading="lazy" decoding="async">'
        + '<div class="admin-row__info">'
        + '<span class="admin-row__brand">' + escapeHTML(p.brand || '') + '</span>'
        + '<strong class="admin-row__title">' + escapeHTML(p.title || '') + '</strong>'
        + '<span class="admin-row__id">' + id + '</span>'
        + '</div>'
        + '</div>'
        + '<div class="admin-row__fields">'
        + '<label class="admin-field">'
        + '<span>Statut stock</span>'
        + '<select data-admin-field="stock_status">'
        + adminOption(status, 'in_stock', 'En stock')
        + adminOption(status, 'low_stock', 'Stock limité')
        + adminOption(status, 'out_of_stock', 'Rupture')
        + adminOption(status, 'preorder', 'Précommande')
        + '</select>'
        + '</label>'
        + '<label class="admin-field">'
        + '<span>Libellé affiché</span>'
        + '<input type="text" data-admin-field="stock_label" value="' + escapeHTML(label) + '" placeholder="En stock">'
        + '</label>'
        + '<label class="admin-field">'
        + '<span>Prix TTC (€)</span>'
        + '<input type="number" step="0.01" min="0" data-admin-field="price" value="' + price + '">'
        + '</label>'
        + '</div>'
        + '<div class="admin-row__actions">'
        + '<button type="button" class="btn primary" data-admin-action="save">Enregistrer</button>'
        + '<button type="button" class="btn btn--ghost" data-admin-action="reset">Annuler</button>'
        + '<span class="admin-row__status" aria-live="polite"></span>'
        + '</div>'
        + '</div>';
    }).join('');

    // Event delegation : save / reset buttons
    listEl.onclick = function (e) {
      var btn = e.target.closest('[data-admin-action]');
      if (!btn) return;
      var row = btn.closest('.admin-row');
      if (!row) return;
      var action = btn.getAttribute('data-admin-action');
      var id = row.getAttribute('data-product-id');
      var statusEl = row.querySelector('.admin-row__status');

      if (action === 'save') {
        var patch = {};
        row.querySelectorAll('[data-admin-field]').forEach(function (el) {
          var f = el.getAttribute('data-admin-field');
          var v = el.value;
          if (f === 'price') v = Number(v);
          patch[f] = v;
        });
        patch.id = id;
        btn.disabled = true;
        if (statusEl) { statusEl.textContent = 'Envoi…'; statusEl.className = 'admin-row__status'; }
        adminFetch('POST', patch).then(function () {
          if (statusEl) { statusEl.textContent = 'Enregistré'; statusEl.className = 'admin-row__status admin-row__status--ok'; }
          // Patch the in-memory product so other views reflect the change
          for (var i = 0; i < products.length; i++) {
            if (products[i].id === id) {
              Object.assign(products[i], patch);
              break;
            }
          }
          toast('Produit mis à jour', 'success');
        }).catch(function (err) {
          if (statusEl) { statusEl.textContent = 'Erreur : ' + err.message; statusEl.className = 'admin-row__status admin-row__status--err'; }
          if (String(err.message).toLowerCase().indexOf('invalid admin') !== -1) {
            setAdminSecret('');
            renderAdmin();
          }
        }).then(function () {
          btn.disabled = false;
        });
      } else if (action === 'reset') {
        renderAdminList();
      }
    };
  }

  function adminOption(current, value, label) {
    var sel = (current === value) ? ' selected' : '';
    return '<option value="' + value + '"' + sel + '>' + label + '</option>';
  }

  function adminLoginTemplate() {
    return '<div class="admin-login">'
      + '<div class="admin-login__card">'
      + '<h1>Administration</h1>'
      + '<p>Entre ta clé admin pour gérer le catalogue.</p>'
      + '<form id="adminLoginForm">'
      + '<label for="adminSecretInput">Clé admin</label>'
      + '<input type="password" id="adminSecretInput" autocomplete="current-password" required>'
      + '<button type="submit" class="btn primary">Se connecter</button>'
      + '</form>'
      + '<p class="admin-login__hint">La clé doit correspondre à la variable <code>ADMIN_SECRET</code> sur Vercel.</p>'
      + '</div>'
      + '</div>';
  }

  // ── Instagram Admin ──────────────────────────────────────────
  var _igDraftCreationId = null;

  // extraQuery : paramètres additionnels DÉJÀ encodés (ex. 'media_id=…').
  // Ne JAMAIS les concaténer dans `action` : encodeURIComponent encoderait le
  // « & » et le serveur recevrait action="comments&media_id=…" → 400.
  function igApiFetch(action, method, body, extraQuery) {
    var apiBase = apiBaseUrl();
    var url = apiBase + '/api/instagram?action=' + encodeURIComponent(action)
      + (extraQuery ? '&' + extraQuery : '');
    var extra = (body && method === 'POST') ? { 'Content-Type': 'application/json' } : null;
    return adminAuthHeaders(extra).then(function (headers) {
      var opts = { method: method || 'GET', headers: headers };
      if (body && method === 'POST') opts.body = JSON.stringify(body);
      return fetch(url, opts);
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); });
  }

  function initAdminInstagram() {
    // ─ Account info
    var loadAccBtn = document.getElementById('igLoadAccount');
    if (loadAccBtn && !loadAccBtn._igBound) {
      loadAccBtn._igBound = true;
      loadAccBtn.addEventListener('click', function () {
        loadAccBtn.disabled = true;
        loadAccBtn.textContent = 'Chargement…';
        igApiFetch('account', 'GET').then(function (res) {
          loadAccBtn.disabled = false;
          loadAccBtn.textContent = 'Charger le compte';
          var infoEl = document.getElementById('igAccountInfo');
          if (!infoEl) return;
          if (!res.ok || !res.data.ok) {
            infoEl.hidden = false;
            infoEl.innerHTML = '<p class="ig-error">' + escapeHTML(res.data.error || 'Erreur') + '</p>';
            return;
          }
          var a = res.data.account;
          infoEl.hidden = false;
          infoEl.innerHTML = '<div class="ig-account-card">'
            + (a.profile_picture_url ? '<img src="' + escapeHTML(a.profile_picture_url) + '" alt="Photo de profil" class="ig-avatar">' : '')
            + '<div class="ig-account-details">'
            + '<strong class="ig-username">@' + escapeHTML(a.username || '') + '</strong>'
            + (a.name ? '<span class="ig-name">' + escapeHTML(a.name) + '</span>' : '')
            + '<div class="ig-stats">'
            + '<span>' + (a.followers_count || 0) + ' abonnés</span>'
            + '<span>' + (a.follows_count || 0) + ' abonnements</span>'
            + '<span>' + (a.media_count || 0) + ' publications</span>'
            + '</div>'
            + (a.biography ? '<p class="ig-bio">' + escapeHTML(a.biography) + '</p>' : '')
            + '</div></div>';
        }).catch(function (err) {
          loadAccBtn.disabled = false;
          loadAccBtn.textContent = 'Charger le compte';
          var infoEl = document.getElementById('igAccountInfo');
          if (infoEl) { infoEl.hidden = false; infoEl.innerHTML = '<p class="ig-error">Réseau : ' + escapeHTML(err.message) + '</p>'; }
        });
      });
    }

    // ─ Token exchange
    var exchangeBtn = document.getElementById('igExchangeToken');
    if (exchangeBtn && !exchangeBtn._igBound) {
      exchangeBtn._igBound = true;
      exchangeBtn.addEventListener('click', function () {
        exchangeBtn.disabled = true;
        exchangeBtn.textContent = 'Échange en cours…';
        igApiFetch('exchange-token', 'GET').then(function (res) {
          exchangeBtn.disabled = false;
          exchangeBtn.textContent = 'Échanger pour token 60 jours';
          var resultEl = document.getElementById('igTokenResult');
          if (!resultEl) return;
          resultEl.hidden = false;
          if (!res.ok || !res.data.ok) {
            resultEl.innerHTML = '<p class="ig-error">' + escapeHTML(res.data.error || 'Erreur') + '</p>';
            return;
          }
          resultEl.innerHTML = '<div class="ig-token-card">'
            + '<p class="ig-token-success">Token longue durée généré (' + (res.data.expires_in_days || '?') + ' jours)</p>'
            + '<p class="admin-hint">Copie ce token et mets-le à jour sur Vercel :</p>'
            + '<textarea class="ig-token-textarea" rows="3" readonly onclick="this.select()">' + escapeHTML(res.data.access_token || '') + '</textarea>'
            + '<p class="admin-hint">Vercel → Settings → Environment Variables → META_ACCESS_TOKEN → Edit → Colle → Save</p>'
            + '</div>';
        }).catch(function (err) {
          exchangeBtn.disabled = false;
          exchangeBtn.textContent = 'Échanger pour token 60 jours';
          var resultEl = document.getElementById('igTokenResult');
          if (resultEl) { resultEl.hidden = false; resultEl.innerHTML = '<p class="ig-error">Réseau : ' + escapeHTML(err.message) + '</p>'; }
        });
      });
    }

    // ─ Load media
    var loadMediaBtn = document.getElementById('igLoadMedia');
    if (loadMediaBtn && !loadMediaBtn._igBound) {
      loadMediaBtn._igBound = true;
      loadMediaBtn.addEventListener('click', igLoadMedia);
    }

    // ─ Publish form: preview
    var previewBtn = document.getElementById('igPreviewBtn');
    var publishBtn = document.getElementById('igPublishBtn');
    if (previewBtn && !previewBtn._igBound) {
      previewBtn._igBound = true;
      previewBtn.addEventListener('click', function () {
        var imgUrl = (document.getElementById('igImageUrl').value || '').trim();
        var caption = (document.getElementById('igCaption').value || '').trim();
        var previewEl = document.getElementById('igPreview');
        var previewImg = document.getElementById('igPreviewImg');
        var previewCap = document.getElementById('igPreviewCaption');
        if (!imgUrl) { toast('Ajoute une URL d\'image', 'error'); return; }
        if (previewEl) previewEl.hidden = false;
        if (previewImg) previewImg.src = imgUrl;
        if (previewCap) previewCap.textContent = caption || '(pas de légende)';
        if (publishBtn) publishBtn.disabled = false;
      });
    }

    // ─ Publish form: create draft
    var publishForm = document.getElementById('igPublishForm');
    if (publishForm && !publishForm._igBound) {
      publishForm._igBound = true;
      publishForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var imgUrl = (document.getElementById('igImageUrl').value || '').trim();
        var caption = (document.getElementById('igCaption').value || '').trim();
        var statusEl = document.getElementById('igPublishStatus');
        if (!imgUrl) return;
        if (publishBtn) publishBtn.disabled = true;
        if (statusEl) { statusEl.textContent = 'Création du brouillon…'; statusEl.className = 'admin-row__status'; }

        igApiFetch('publish-start', 'POST', { image_url: imgUrl, caption: caption })
          .then(function (res) {
            if (!res.ok || !res.data.ok) {
              if (statusEl) { statusEl.textContent = 'Erreur : ' + (res.data.error || 'Inconnue'); statusEl.className = 'admin-row__status admin-row__status--err'; }
              if (publishBtn) publishBtn.disabled = false;
              return;
            }
            _igDraftCreationId = res.data.creation_id;
            if (statusEl) { statusEl.textContent = 'Brouillon prêt !'; statusEl.className = 'admin-row__status admin-row__status--ok'; }
            var draftEl = document.getElementById('igDraftConfirm');
            if (draftEl) draftEl.hidden = false;
          })
          .catch(function (err) {
            if (statusEl) { statusEl.textContent = 'Réseau : ' + err.message; statusEl.className = 'admin-row__status admin-row__status--err'; }
            if (publishBtn) publishBtn.disabled = false;
          });
      });
    }

    // ─ Confirm publish
    var confirmBtn = document.getElementById('igConfirmPublish');
    if (confirmBtn && !confirmBtn._igBound) {
      confirmBtn._igBound = true;
      confirmBtn.addEventListener('click', function () {
        if (!_igDraftCreationId) return;
        confirmBtn.disabled = true;
        var statusEl = document.getElementById('igConfirmStatus');
        if (statusEl) { statusEl.textContent = 'Publication…'; statusEl.className = 'admin-row__status'; }

        igApiFetch('publish-finish', 'POST', { creation_id: _igDraftCreationId })
          .then(function (res) {
            confirmBtn.disabled = false;
            if (!res.ok || !res.data.ok) {
              if (statusEl) { statusEl.textContent = 'Erreur : ' + (res.data.error || 'Inconnue'); statusEl.className = 'admin-row__status admin-row__status--err'; }
              return;
            }
            if (statusEl) { statusEl.textContent = 'Publié !'; statusEl.className = 'admin-row__status admin-row__status--ok'; }
            toast('Post Instagram publié !', 'success');
            _igDraftCreationId = null;
            // Reset form
            var form = document.getElementById('igPublishForm');
            if (form) form.reset();
            var previewEl = document.getElementById('igPreview');
            if (previewEl) previewEl.hidden = true;
            var draftEl = document.getElementById('igDraftConfirm');
            if (draftEl) draftEl.hidden = true;
            if (publishBtn) publishBtn.disabled = true;
            // Refresh media
            igLoadMedia();
          })
          .catch(function (err) {
            confirmBtn.disabled = false;
            if (statusEl) { statusEl.textContent = 'Réseau : ' + err.message; statusEl.className = 'admin-row__status admin-row__status--err'; }
          });
      });
    }

    // ─ Cancel publish
    var cancelBtn = document.getElementById('igCancelPublish');
    if (cancelBtn && !cancelBtn._igBound) {
      cancelBtn._igBound = true;
      cancelBtn.addEventListener('click', function () {
        _igDraftCreationId = null;
        var draftEl = document.getElementById('igDraftConfirm');
        if (draftEl) draftEl.hidden = true;
        if (publishBtn) publishBtn.disabled = false;
        var statusEl = document.getElementById('igPublishStatus');
        if (statusEl) statusEl.textContent = '';
      });
    }

    // ─ Load comments
    var loadCommBtn = document.getElementById('igLoadComments');
    if (loadCommBtn && !loadCommBtn._igBound) {
      loadCommBtn._igBound = true;
      loadCommBtn.addEventListener('click', function () {
        var mediaId = (document.getElementById('igMediaIdInput').value || '').trim();
        if (!mediaId) { toast('Entre un Media ID', 'error'); return; }
        igLoadComments(mediaId);
      });
    }

    // ─ Load insights
    var insightsBtn = document.getElementById('igLoadInsights');
    if (insightsBtn && !insightsBtn._igBound) {
      insightsBtn._igBound = true;
      insightsBtn.addEventListener('click', function () {
        insightsBtn.disabled = true;
        insightsBtn.textContent = 'Chargement…';
        igApiFetch('insights', 'GET').then(function (res) {
          insightsBtn.disabled = false;
          insightsBtn.textContent = 'Charger les stats';
          var dataEl = document.getElementById('igInsightsData');
          if (!dataEl) return;
          if (!res.ok || !res.data.ok) {
            dataEl.innerHTML = '<p class="ig-error">' + escapeHTML(res.data.error || 'Erreur') + '</p>';
            return;
          }
          if (res.data.warning) {
            dataEl.innerHTML = '<p class="admin-hint">' + escapeHTML(res.data.warning) + '</p>';
            return;
          }
          var insights = res.data.insights || [];
          if (insights.length === 0) {
            dataEl.innerHTML = '<p class="admin-hint">Pas encore de données disponibles.</p>';
            return;
          }
          dataEl.innerHTML = '<div class="ig-insights-grid">' + insights.map(function (m) {
            var val = (m.values && m.values.length) ? m.values[m.values.length - 1].value : '—';
            return '<div class="ig-insight-card">'
              + '<span class="ig-insight-label">' + escapeHTML(m.title || m.name || '') + '</span>'
              + '<strong class="ig-insight-value">' + escapeHTML(String(val)) + '</strong>'
              + (m.description ? '<small class="ig-insight-desc">' + escapeHTML(m.description) + '</small>' : '')
              + '</div>';
          }).join('') + '</div>';
        }).catch(function (err) {
          insightsBtn.disabled = false;
          insightsBtn.textContent = 'Charger les stats';
          var dataEl = document.getElementById('igInsightsData');
          if (dataEl) dataEl.innerHTML = '<p class="ig-error">Réseau : ' + escapeHTML(err.message) + '</p>';
        });
      });
    }
  }

  function igLoadMedia() {
    var gridEl = document.getElementById('igMediaGrid');
    if (!gridEl) return;
    gridEl.innerHTML = '<p class="admin-loading">Chargement des posts…</p>';
    var loadBtn = document.getElementById('igLoadMedia');
    if (loadBtn) loadBtn.disabled = true;

    igApiFetch('media', 'GET').then(function (res) {
      if (loadBtn) loadBtn.disabled = false;
      if (!res.ok || !res.data.ok) {
        gridEl.innerHTML = '<p class="ig-error">' + escapeHTML(res.data.error || 'Erreur') + '</p>';
        return;
      }
      var media = res.data.media || [];
      if (media.length === 0) {
        gridEl.innerHTML = '<p class="admin-hint">Aucune publication pour l\'instant.</p>';
        return;
      }
      gridEl.innerHTML = media.map(function (m) {
        var thumb = m.thumbnail_url || m.media_url || '';
        var date = m.timestamp ? new Date(m.timestamp).toLocaleDateString('fr-FR') : '';
        var caption = (m.caption || '').substring(0, 80);
        return '<div class="ig-media-card" data-media-id="' + escapeHTML(m.id) + '">'
          + (thumb ? '<img src="' + escapeHTML(thumb) + '" alt="Post Instagram" class="ig-media-thumb" loading="lazy" decoding="async">' : '<div class="ig-media-nothumb">Pas d\'image</div>')
          + '<div class="ig-media-info">'
          + '<span class="ig-media-date">' + escapeHTML(date) + '</span>'
          + '<span class="ig-media-type">' + escapeHTML(m.media_type || '') + '</span>'
          + '<p class="ig-media-caption">' + escapeHTML(caption) + (caption.length >= 80 ? '…' : '') + '</p>'
          + '<div class="ig-media-stats">'
          + '<span>' + (m.like_count || 0) + ' likes</span>'
          + '<span>' + (m.comments_count || 0) + ' commentaires</span>'
          + '</div>'
          + '</div></div>';
      }).join('');

      // Click to load comments
      gridEl.onclick = function (e) {
        var card = e.target.closest('.ig-media-card');
        if (!card) return;
        var mediaId = card.getAttribute('data-media-id');
        if (!mediaId) return;
        var input = document.getElementById('igMediaIdInput');
        if (input) input.value = mediaId;
        igLoadComments(mediaId);
        // Scroll to comments section
        var commSection = document.querySelector('.ig-comments');
        if (commSection) commSection.scrollIntoView({ behavior: 'smooth' });
      };
    }).catch(function (err) {
      if (loadBtn) loadBtn.disabled = false;
      gridEl.innerHTML = '<p class="ig-error">Réseau : ' + escapeHTML(err.message) + '</p>';
    });
  }

  function igLoadComments(mediaId) {
    var listEl = document.getElementById('igCommentsList');
    if (!listEl) return;
    listEl.innerHTML = '<p class="admin-loading">Chargement des commentaires…</p>';

    igApiFetch('comments', 'GET', null, 'media_id=' + encodeURIComponent(mediaId)).then(function (res) {
      if (!res.ok || !res.data.ok) {
        listEl.innerHTML = '<p class="ig-error">' + escapeHTML(res.data.error || 'Erreur') + '</p>';
        return;
      }
      var comments = res.data.comments || [];
      if (comments.length === 0) {
        listEl.innerHTML = '<p class="admin-hint">Aucun commentaire sur ce post.</p>';
        return;
      }
      listEl.innerHTML = comments.map(function (c) {
        var date = c.timestamp ? new Date(c.timestamp).toLocaleString('fr-FR') : '';
        var replies = (c.replies && c.replies.data) || [];
        return '<div class="ig-comment" data-comment-id="' + escapeHTML(c.id) + '">'
          + '<div class="ig-comment-header">'
          + '<strong>@' + escapeHTML(c.username || '') + '</strong>'
          + '<span class="ig-comment-date">' + escapeHTML(date) + '</span>'
          + '</div>'
          + '<p class="ig-comment-text">' + escapeHTML(c.text || '') + '</p>'
          + (replies.length ? '<div class="ig-replies">' + replies.map(function (r) {
            return '<div class="ig-reply">'
              + '<strong>@' + escapeHTML(r.username || '') + '</strong> '
              + '<span>' + escapeHTML(r.text || '') + '</span>'
              + '</div>';
          }).join('') + '</div>' : '')
          + '<div class="ig-comment-actions">'
          + '<input type="text" class="ig-reply-input" placeholder="Répondre…">'
          + '<button type="button" class="btn btn--ghost ig-reply-btn" aria-label="Répondre au commentaire">Répondre</button>'
          + '</div>'
          + '</div>';
      }).join('');

      // Reply delegation
      listEl.onclick = function (e) {
        var replyBtn = e.target.closest('.ig-reply-btn');
        if (!replyBtn) return;
        var commentEl = replyBtn.closest('.ig-comment');
        if (!commentEl) return;
        var commentId = commentEl.getAttribute('data-comment-id');
        var input = commentEl.querySelector('.ig-reply-input');
        var message = (input && input.value || '').trim();
        if (!message) { toast('Écris une réponse', 'error'); return; }
        replyBtn.disabled = true;
        igApiFetch('reply', 'POST', { comment_id: commentId, message: message })
          .then(function (res) {
            replyBtn.disabled = false;
            if (res.ok && res.data.ok) {
              toast('Réponse envoyée', 'success');
              input.value = '';
              // Reload comments
              igLoadComments(mediaId);
            } else {
              toast('Erreur : ' + (res.data.error || 'Inconnue'), 'error');
            }
          })
          .catch(function (err) {
            replyBtn.disabled = false;
            toast('Réseau : ' + err.message, 'error');
          });
      };
    }).catch(function (err) {
      listEl.innerHTML = '<p class="ig-error">Réseau : ' + escapeHTML(err.message) + '</p>';
    });
  }

  // ── Contact form (/contact) ────────────────────────────────

  var _contactBound = false;
  function setupContactForm() {
    var form = document.getElementById('contactForm');
    if (!form || _contactBound) return;
    _contactBound = true;

    var status = document.getElementById('contactStatus');
    var submit = document.getElementById('contactSubmit');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (status) { status.textContent = ''; status.className = 'contact-form__status'; }

      var data = {
        name: (document.getElementById('contactName').value || '').trim(),
        email: (document.getElementById('contactEmail').value || '').trim(),
        phone: (document.getElementById('contactPhone').value || '').trim(),
        subject: (document.getElementById('contactSubject').value || '').trim(),
        message: (document.getElementById('contactMessage').value || '').trim(),
        website: (document.getElementById('contactHoneypot').value || '')
      };

      // Client-side validation
      if (data.name.length < 2) { return contactError('Nom trop court'); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { return contactError('Email invalide'); }
      if (data.message.length < 10) { return contactError('Message trop court (min. 10 caractères)'); }

      submit.disabled = true;
      if (status) { status.textContent = 'Envoi…'; status.className = 'contact-form__status'; }

      var apiBase = apiBaseUrl();
      fetch(apiBase + '/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
      .then(function (res) {
        submit.disabled = false;
        if (res.ok && res.data && res.data.ok) {
          form.reset();
          if (status) {
            status.textContent = 'Message envoyé. On te répond sous peu.';
            status.className = 'contact-form__status contact-form__status--ok';
          }
          toast('Message envoyé', 'success');
        } else {
          var msg = (res.data && res.data.error) || 'Envoi impossible';
          contactError(msg);
        }
      })
      .catch(function (err) {
        submit.disabled = false;
        contactError('Erreur réseau : ' + err.message);
      });

      function contactError(msg) {
        submit.disabled = false;
        if (status) {
          status.textContent = msg;
          status.className = 'contact-form__status contact-form__status--err';
        }
      }
    });
  }

  // ── Newsletter signup (home) ───────────────────────────────

  var _newsletterBound = false;
  function setupNewsletterForm() {
    var form = document.getElementById('newsletterForm');
    if (!form || _newsletterBound) return;
    _newsletterBound = true;

    var input = document.getElementById('newsletterEmail');
    var status = document.getElementById('newsletterStatus');
    var honeypot = form.querySelector('.home-newsletter__honeypot');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (status) {
          status.textContent = 'Email invalide';
          status.className = 'home-newsletter__status home-newsletter__status--err';
        }
        return;
      }

      var submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      if (status) {
        status.textContent = 'Inscription…';
        status.className = 'home-newsletter__status';
      }

      var apiBase = apiBaseUrl();
      fetch(apiBase + '/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          website: honeypot ? honeypot.value : ''
        })
      })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
      .then(function (res) {
        if (submit) submit.disabled = false;
        if (res.ok && res.data && res.data.ok) {
          input.value = '';
          if (status) {
            status.textContent = 'Merci ! Inscription confirmée.';
            status.className = 'home-newsletter__status home-newsletter__status--ok';
          }
        } else {
          if (status) {
            status.textContent = (res.data && res.data.error) || 'Inscription impossible';
            status.className = 'home-newsletter__status home-newsletter__status--err';
          }
        }
      })
      .catch(function () {
        if (submit) submit.disabled = false;
        if (status) {
          status.textContent = 'Erreur réseau';
          status.className = 'home-newsletter__status home-newsletter__status--err';
        }
      });
    });
  }

  // ── Wishlist (favoris) ─────────────────────────────────────

  var WISHLIST_KEY = 'pt_wishlist';

  function getWishlist() {
    try { return JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveWishlist(list) {
    try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(list)); } catch (e) { /* silent */ }
    updateWishlistUI();
  }
  function isInWishlist(id) {
    return getWishlist().indexOf(id) !== -1;
  }
  function toggleWishlist(id) {
    var list = getWishlist();
    var idx = list.indexOf(id);
    if (idx === -1) {
      list.push(id);
      toast('Ajouté aux favoris', 'success');
    } else {
      list.splice(idx, 1);
      toast('Retiré des favoris', 'info');
    }
    saveWishlist(list);
  }
  function updateWishlistUI() {
    // Sync all wishlist buttons in the DOM
    var list = getWishlist();
    document.querySelectorAll('[data-wishlist-id]').forEach(function (btn) {
      var id = btn.getAttribute('data-wishlist-id');
      var active = list.indexOf(id) !== -1;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-label', active ? 'Retirer des favoris' : 'Ajouter aux favoris');
    });
    // Update wishlist count badge if present
    var countEl = document.getElementById('wishlistCount');
    if (countEl) {
      countEl.textContent = list.length;
      countEl.hidden = list.length === 0;
    }
  }

  function wishlistButton(product) {
    var id = product.id;
    var active = isInWishlist(id);
    return '<button type="button" class="wishlist-btn' + (active ? ' is-active' : '') + '" '
      + 'data-wishlist-id="' + escapeHTML(id) + '" '
      + 'aria-pressed="' + (active ? 'true' : 'false') + '" '
      + 'aria-label="' + (active ? 'Retirer des favoris' : 'Ajouter aux favoris') + '" '
      + 'title="' + (active ? 'Retirer des favoris' : 'Ajouter aux favoris') + '">'
      + '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
      + '<path fill="currentColor" d="M12 21s-7.5-4.35-10-9.2C.6 8.3 2.7 4.5 6.5 4.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 3.8 0 5.9 3.8 4.5 7.3C19.5 16.65 12 21 12 21z"/>'
      + '</svg>'
      + '</button>';
  }

  function renderWishlist() {
    var listEl = document.getElementById('wishlistList');
    if (!listEl) return;

    var ids = getWishlist();
    if (ids.length === 0) {
      listEl.innerHTML = '<div class="wishlist-empty">'
        + '<svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true"><path fill="currentColor" opacity=".3" d="M12 21s-7.5-4.35-10-9.2C.6 8.3 2.7 4.5 6.5 4.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 3.8 0 5.9 3.8 4.5 7.3C19.5 16.65 12 21 12 21z"/></svg>'
        + '<h2>Aucun favori pour l\'instant</h2>'
        + '<p>Clique sur le cœur d\'un produit pour l\'ajouter ici.</p>'
        + '<a class="btn primary" href="#/catalogue">Voir le catalogue</a>'
        + '</div>';
      return;
    }

    var favs = products.filter(function (p) { return ids.indexOf(p.id) !== -1; });

    listEl.innerHTML = favs.map(function (p) {
      var out = isOutOfStock(p);
      return '<a class="product-card' + (out ? ' product-card--out' : '') + '" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
        + '<div class="product-card__img-wrap">'
        + productCardVisual(p)
        + (p.tag ? '<span class="product-card__tag">' + escapeHTML(p.tag) + '</span>' : '')
        + stockBadge(p)
        + wishlistButton(p)
        + '</div>'
        + '<div class="product-card__body">'
        + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
        + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
        + '<span class="product-card__price">' + formatPrice(calcPrice(p, _currentTerritory).ttc) + '</span>'
        + '</div>'
        + '</a>';
    }).join('');
    preloadModelViewers(listEl);
  }

  // Global delegation for wishlist clicks (attached once in init)
  function bindWishlistDelegation() {
    document.body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-wishlist-id]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      toggleWishlist(btn.getAttribute('data-wishlist-id'));
    });
  }

  // ── Recently viewed products (localStorage) ────────────────

  var RECENT_KEY = 'pt_recently_viewed';
  var RECENT_MAX = 8;

  function addRecentlyViewed(id) {
    if (!id) return;
    try {
      var list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      list = list.filter(function (x) { return x !== id; });
      list.unshift(id);
      if (list.length > RECENT_MAX) list.length = RECENT_MAX;
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) { /* silent */ }
  }
  function getRecentlyViewed() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function renderRecentlyViewed() {
    var track = document.getElementById('recentlyViewedTrack');
    var section = document.getElementById('recentlyViewedSection');
    if (!track || !section) return;

    var ids = getRecentlyViewed();
    var items = ids
      .map(function (id) {
        for (var i = 0; i < products.length; i++) {
          if (products[i].id === id) return products[i];
        }
        return null;
      })
      .filter(Boolean);

    if (items.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    track.innerHTML = items.map(function (p) {
      var out = isOutOfStock(p);
      return '<a class="product-card' + (out ? ' product-card--out' : '') + '" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
        + '<div class="product-card__img-wrap">'
        + productCardVisual(p)
        + stockBadge(p)
        + '</div>'
        + '<div class="product-card__body">'
        + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
        + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
        + '<span class="product-card__price">' + formatPrice(calcPrice(p, _currentTerritory).ttc) + '</span>'
        + '</div>'
        + '</a>';
    }).join('');
    preloadModelViewers(track);
  }

  // ── SEO : JSON-LD structured data ──────────────────────────

  function injectProductJsonLd(product) {
    removeJsonLd('product');
    if (!product) return;
    var price = calcPrice(product, _currentTerritory);
    var terr = getTerritory() || getTerritory(DEFAULT_TERRITORY);
    var est = shippingEstimateFor(terr.code);
    var data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': product.title,
      'description': product.description_long || product.description || product.desc || '',
      'brand': { '@type': 'Brand', 'name': product.brand || '' },
      'sku': product.sku || product.id,
      'image': product.img ? [new URL(product.img, location.href).href] : [],
      'weight': product.weight_kg ? { '@type': 'QuantitativeValue', 'value': product.weight_kg, 'unitCode': 'KGM' } : undefined,
      'offers': {
        '@type': 'Offer',
        'priceCurrency': 'EUR',
        'price': price.ttc.toFixed(2),
        'availability': ldAvailability(product.stock_status),
        'url': location.href,
        'priceValidUntil': new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        'shippingDetails': {
          '@type': 'OfferShippingDetails',
          'shippingDestination': {
            '@type': 'DefinedRegion',
            'addressCountry': 'FR',
            'addressRegion': terr.name
          },
          'shippingRate': {
            '@type': 'MonetaryAmount',
            'value': est.price.toFixed(2),
            'currency': 'EUR'
          },
          'deliveryTime': {
            '@type': 'ShippingDeliveryTime',
            'handlingTime': { '@type': 'QuantitativeValue', 'minValue': 1, 'maxValue': 3, 'unitCode': 'DAY' },
            'transitTime':  { '@type': 'QuantitativeValue', 'minValue': est.from, 'maxValue': est.to, 'unitCode': 'DAY' }
          }
        }
      }
    };
    // Clean undefined fields
    if (!data.weight) delete data.weight;
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jsonld', 'product');
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function ldAvailability(status) {
    switch (String(status || '').toLowerCase()) {
      case 'out_of_stock': return 'https://schema.org/OutOfStock';
      case 'preorder': return 'https://schema.org/PreOrder';
      case 'low_stock': return 'https://schema.org/LimitedAvailability';
      default: return 'https://schema.org/InStock';
    }
  }

  // Breadcrumb JSON-LD — injected on product and territory pages for SEO.
  function injectBreadcrumbLd(crumbs) {
    removeJsonLd('breadcrumb');
    if (!crumbs || !crumbs.length) return;
    var base = location.origin + location.pathname;
    var items = crumbs.map(function (c, i) {
      return {
        '@type': 'ListItem',
        'position': i + 1,
        'name': c.name,
        'item': c.hash ? (base + '#' + c.hash) : (base)
      };
    });
    var data = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': items
    };
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jsonld', 'breadcrumb');
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function removeJsonLd(kind) {
    var old = document.head.querySelector('script[data-jsonld="' + kind + '"]');
    if (old) old.parentNode.removeChild(old);
  }

  // ItemList JSON-LD for catalogue page — enriches search results with product list.
  function injectItemListLd() {
    removeJsonLd('itemlist');
    if (!products || !products.length) return;
    var base = location.origin + location.pathname;
    var items = products.slice(0, 50).map(function (p, i) {
      var price = calcPrice(p, _currentTerritory);
      return {
        '@type': 'ListItem',
        'position': i + 1,
        'item': {
          '@type': 'Product',
          'name': p.title,
          'url': base + '#/produit/' + (p.slug || p.id),
          'image': p.img ? new URL(p.img, location.href).href : '',
          'offers': {
            '@type': 'Offer',
            'priceCurrency': 'EUR',
            'price': price.ttc.toFixed(2),
            'availability': ldAvailability(p.stock_status)
          }
        }
      };
    });
    var data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': 'Catalogue Pirates Tools',
      'numberOfItems': products.length,
      'itemListElement': items
    };
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jsonld', 'itemlist');
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function injectOrganizationJsonLd() {
    if (document.head.querySelector('script[data-jsonld="org"]')) return;
    var data = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      'name': 'Pirates Tools',
      'url': location.origin,
      'logo': location.origin + '/icons/icon-512.png',
      'areaServed': [
        { '@type': 'AdministrativeArea', 'name': 'France' },
        { '@type': 'AdministrativeArea', 'name': 'Guadeloupe' },
        { '@type': 'AdministrativeArea', 'name': 'Martinique' },
        { '@type': 'AdministrativeArea', 'name': 'Guyane française' },
        { '@type': 'AdministrativeArea', 'name': 'La Réunion' },
        { '@type': 'AdministrativeArea', 'name': 'Mayotte' }
      ],
      'description': 'Outillage professionnel DeWALT, Makita, Festool, Flex, Facom, Stanley, Wera — livraison DOM-TOM (Guadeloupe, Martinique, Guyane, Réunion, Mayotte). Octroi de mer inclus.',
      'contactPoint': {
        '@type': 'ContactPoint',
        'contactType': 'customer service',
        'availableLanguage': 'French',
        'areaServed': 'FR'
      },
      'sameAs': []
    };
    // Téléphone dans les données structurées seulement si un numéro est configuré.
    if (WA_PHONE) { data.telephone = '+' + WA_PHONE; data.contactPoint.telephone = '+' + WA_PHONE; }
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jsonld', 'org');
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  // ── Dynamic route meta (title + description) ──────────────

  var BASE_TITLE = 'Pirates Tools — Outillage professionnel DOM-TOM';
  var BASE_DESC = 'Outillage pro DeWALT, Makita, Festool, Flex, Facom, Stanley, Wera livré en Guadeloupe, Martinique, Guyane, Réunion et Mayotte. Octroi de mer et TVA inclus.';

  function setDocMeta(title, desc) {
    if (title) document.title = title;
    if (desc) {
      var m = document.head.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', desc);
    }
  }

  // Update/insert meta tags for OG, Twitter, canonical
  function setHeadMeta(name, value, attr) {
    if (!value) return;
    attr = attr || 'name';
    var sel = 'meta[' + attr + '="' + name + '"]';
    var el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', value);
  }

  function setCanonical(url) {
    if (!url) return;
    var el = document.head.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', url);
  }

  // ── Territory landing page ─────────────────────────────────
  //
  // SEO FAQ per territory. The entries feed both the visible FAQ and the
  // schema.org FAQPage JSON-LD so Google can render rich results.
  var TERR_FAQ = {
    '971': [
      { q: "Quels sont les délais de livraison en Guadeloupe ?",
        a: "Généralement 5 à 10 jours ouvrés depuis la métropole, transit maritime + livraison à domicile sur toute l'île (Basse-Terre, Grande-Terre, Marie-Galante)." },
      { q: "L'octroi de mer est-il inclus dans le prix affiché ?",
        a: "Oui. Le prix TTC affiché intègre l'octroi de mer externe, l'octroi régional et la TVA applicable à la Guadeloupe (8,5 %)." },
      { q: "Puis-je bénéficier de la garantie constructeur en Guadeloupe ?",
        a: "Oui, toutes nos machines DeWALT, Makita, Festool, Flex et Facom sont couvertes par la garantie constructeur officielle. Pirates Tools assure la prise en charge SAV." },
      { q: "Comment payer depuis la Guadeloupe ?",
        a: "Carte bancaire, virement ou crypto. Nous acceptons aussi les paiements en plusieurs fois sur demande via WhatsApp." }
    ],
    '972': [
      { q: "Quels sont les délais de livraison en Martinique ?",
        a: "Généralement 5 à 10 jours ouvrés depuis la métropole jusqu'à Fort-de-France, Le Lamentin et le reste de l'île." },
      { q: "Livrez-vous dans le Sud de la Martinique ?",
        a: "Oui, toute l'île est couverte (Sainte-Anne, Le Marin, Trinité, Saint-Pierre…)." },
      { q: "Octroi de mer et TVA ?",
        a: "TVA 8,5 % + octroi de mer Martinique inclus dans le prix TTC affiché automatiquement." },
      { q: "Les outils sont-ils adaptés au climat tropical ?",
        a: "Nous sélectionnons des gammes pro (XR, LXT, Festool, Flex) avec protection IP élevée et traitements anti-corrosion." }
    ],
    '973': [
      { q: "Livrez-vous en Guyane ?",
        a: "Oui, livraison vers Cayenne, Kourou, Saint-Laurent-du-Maroni et plus. Délais 7 à 15 jours ouvrés." },
      { q: "Particularités fiscales de la Guyane ?",
        a: "La Guyane bénéficie d'un régime TVA 0 %. Seul l'octroi de mer s'applique, déjà inclus dans le prix TTC." },
      { q: "Comment gérer la douane depuis la Guyane ?",
        a: "Pirates Tools s'occupe de tout. Vous recevez le produit à domicile, taxes incluses." },
      { q: "Y a-t-il une assistance locale ?",
        a: "Support WhatsApp 6j/7 pour toute question technique, devis ou SAV." }
    ],
    '974': [
      { q: "Quels délais pour La Réunion ?",
        a: "Environ 7 à 14 jours ouvrés selon le mode d'expédition. Livraison vers Saint-Denis, Saint-Pierre, Saint-Paul et toute l'île." },
      { q: "Octroi de mer à La Réunion ?",
        a: "TVA 8,5 % + octroi de mer inclus. Le détail HT/Octroi/TVA/TTC est visible sur chaque fiche produit." },
      { q: "Garantie sur les batteries Li-Ion ?",
        a: "Garantie constructeur + extension Pirates Tools possible. Support local via WhatsApp." },
      { q: "Comment payer depuis La Réunion ?",
        a: "CB, virement SEPA, crypto (BTC/ETH/USDT/SOL) et paiement en plusieurs fois sur demande." }
    ],
    '976': [
      { q: "Livrez-vous à Mayotte ?",
        a: "Oui, toute l'île est desservie. Délais 10 à 20 jours ouvrés selon la zone." },
      { q: "TVA et octroi à Mayotte ?",
        a: "Mayotte est en franchise de TVA (0 %) et actuellement sans octroi de mer sur l'outillage pro. Le prix TTC affiché correspond au prix HT métropole." },
      { q: "Quels outils choisir pour les chantiers mahorais ?",
        a: "Nos packs combos DeWALT XR et Makita LXT sont recommandés : robustesse, autonomie terrain, IP54." },
      { q: "Assistance technique à Mayotte ?",
        a: "Équipe Pirates Tools joignable par WhatsApp pour conseil, devis ou intervention SAV." }
    ]
  };

  function shippingEstimateFor(code) {
    switch (code) {
      case '971': return { days:'5–10 jours ouvrés', from:5,  to:10, price:29.90 };
      case '972': return { days:'5–10 jours ouvrés', from:5,  to:10, price:29.90 };
      case '973': return { days:'7–15 jours ouvrés', from:7,  to:15, price:39.90 };
      case '974': return { days:'7–14 jours ouvrés', from:7,  to:14, price:34.90 };
      case '976': return { days:'10–20 jours ouvrés',from:10, to:20, price:49.90 };
      default:    return { days:'5–10 jours ouvrés', from:5,  to:10, price:29.90 };
    }
  }

  function injectShippingDetailsLd(terrCode) {
    removeJsonLd('shipping');
    var t = getTerritory(terrCode);
    if (!t) return;
    var est = shippingEstimateFor(terrCode);
    var data = {
      '@context': 'https://schema.org',
      '@type': 'OfferShippingDetails',
      'shippingDestination': {
        '@type': 'DefinedRegion',
        'addressCountry': 'FR',
        'addressRegion': t.name
      },
      'shippingRate': {
        '@type': 'MonetaryAmount',
        'value': est.price.toFixed(2),
        'currency': 'EUR'
      },
      'deliveryTime': {
        '@type': 'ShippingDeliveryTime',
        'handlingTime': { '@type': 'QuantitativeValue', 'minValue': 1, 'maxValue': 3, 'unitCode': 'DAY' },
        'transitTime':  { '@type': 'QuantitativeValue', 'minValue': est.from, 'maxValue': est.to, 'unitCode': 'DAY' }
      }
    };
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jsonld', 'shipping');
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function injectFaqLd(qaList) {
    removeJsonLd('faq');
    if (!Array.isArray(qaList) || !qaList.length) return;
    var data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': qaList.map(function (qa) {
        return {
          '@type': 'Question',
          'name': qa.q,
          'acceptedAnswer': { '@type': 'Answer', 'text': qa.a }
        };
      })
    };
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-jsonld', 'faq');
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function handleTerritoryRoute(slug) {
    var code = territoryCodeFromSlug(slug);
    if (!code) { location.hash = '#/'; return; }

    // Switching territory re-runs onRouteChange which would recurse; so we
    // mutate state directly without calling setTerritory's re-render.
    if (_currentTerritory !== code) {
      _currentTerritory = code;
      try { localStorage.setItem(TERRITORY_KEY, code); } catch (_) {}
      updateTerritoryLabels();
      try { document.dispatchEvent(new CustomEvent('pt:territory-change', { detail:{ code: code } })); } catch (_) {}
    }

    var t = getTerritory(code);
    var est = shippingEstimateFor(code);

    // Header elements
    var flagEl = document.getElementById('terrViewFlag');
    var nameEl = document.getElementById('terrViewName');
    var leadEl = document.getElementById('terrViewLead');
    var ratesEl = document.getElementById('terrViewRates');
    var waEl = document.getElementById('terrViewWa');
    if (flagEl) flagEl.textContent = t.flag;
    if (nameEl) nameEl.textContent = t.name;
    if (leadEl) {
      leadEl.textContent = 'Outillage professionnel DeWALT, Makita, Festool, Flex et Facom livré en ' + t.name
        + ' sous ' + est.days + '. Octroi de mer calculé automatiquement.';
    }
    if (ratesEl) {
      var tva = (t.tvaRate * 100).toFixed(1).replace('.', ',');
      var oex = ((t.octroiExterne + t.octroiRegional) * 100).toFixed(1).replace('.', ',');
      ratesEl.innerHTML = '<span class="terr-view__rate"><strong>TVA</strong> ' + tva + ' %</span>'
        + '<span class="terr-view__rate"><strong>Octroi de mer</strong> ' + oex + ' %</span>'
        + '<span class="terr-view__rate"><strong>Code</strong> ' + t.code + '</span>';
    }
    if (waEl) {
      var waMsg = 'Bonjour Pirates Tools, je suis en ' + t.name + ' (' + t.code + '). J\'aimerais un devis.';
      waEl.href = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent(waMsg);
    }

    // Featured products: pick 8 with tropical_ready or highest stock
    var prodEl = document.getElementById('terrViewProducts');
    if (prodEl) {
      var featured = products.filter(function (p) {
        return Array.isArray(p.tags) && p.tags.indexOf('tropical_ready') !== -1;
      }).slice(0, 8);
      if (!featured.length) featured = products.slice(0, 8);
      prodEl.innerHTML = featured.map(function (p) {
        var out = isOutOfStock(p);
        var pr = calcPrice(p, code);
        return '<a class="product-card' + (out ? ' product-card--out' : '') + '" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
          + '<div class="product-card__img-wrap">'
          + productCardVisual(p)
          + (p.tag ? '<span class="product-card__tag">' + escapeHTML(p.tag) + '</span>' : '')
          + stockBadge(p)
          + '</div>'
          + '<div class="product-card__body">'
          + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
          + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
          + '<span class="product-card__price">' + formatPrice(pr.ttc) + ' <small>TTC</small></span>'
          + '</div>'
          + '</a>';
      }).join('');
      preloadModelViewers(prodEl);
    }

    // Shipping card
    var shipEl = document.getElementById('terrViewShipping');
    if (shipEl) {
      shipEl.innerHTML = '<div class="terr-ship-card">'
        + '<div class="terr-ship-card__icon" aria-hidden="true">🚢</div>'
        + '<div><strong>Délai moyen</strong><p>' + est.days + '</p></div>'
        + '</div>'
        + '<div class="terr-ship-card">'
        + '<div class="terr-ship-card__icon" aria-hidden="true">📦</div>'
        + '<div><strong>Frais de port estimés</strong><p>à partir de ' + formatPrice(est.price) + '</p></div>'
        + '</div>'
        + '<div class="terr-ship-card">'
        + '<div class="terr-ship-card__icon" aria-hidden="true">🛡️</div>'
        + '<div><strong>Garantie</strong><p>Constructeur + SAV Pirates Tools</p></div>'
        + '</div>';
    }

    // FAQ
    var faqEl = document.getElementById('terrViewFaq');
    var faq = TERR_FAQ[code] || [];
    if (faqEl) {
      faqEl.innerHTML = faq.map(function (qa) {
        return '<details class="faq-item">'
          + '<summary>' + escapeHTML(qa.q) + '</summary>'
          + '<p>' + escapeHTML(qa.a) + '</p>'
          + '</details>';
      }).join('');
    }

    // Structured data + meta
    injectShippingDetailsLd(code);
    injectFaqLd(faq);
    injectBreadcrumbLd([
      { name: 'Accueil', hash: '/' },
      { name: t.name, hash: '/' + slug }
    ]);
    var title = 'Outillage pro en ' + t.name + ' — ' + BASE_TITLE;
    var desc  = 'Achetez votre outillage professionnel livré en ' + t.name
      + '. Octroi de mer, TVA et délais inclus. ' + BASE_DESC;
    setDocMeta(title, desc);
    setHeadMeta('og:title', title, 'property');
    setHeadMeta('og:description', desc, 'property');
    setHeadMeta('og:url', location.href, 'property');
    setHeadMeta('twitter:title', title);
    setHeadMeta('twitter:description', desc);
    setCanonical(location.origin + location.pathname + '#/' + slug);
  }

  function resetSeoExtras() {
    removeJsonLd('product');
    removeJsonLd('shipping');
    removeJsonLd('faq');
    removeJsonLd('breadcrumb');
    removeJsonLd('itemlist');
    setCanonical(location.origin + location.pathname);
    setHeadMeta('og:url', location.origin + location.pathname, 'property');
    setHeadMeta('og:title', BASE_TITLE, 'property');
    setHeadMeta('og:description', BASE_DESC, 'property');
    setHeadMeta('twitter:title', BASE_TITLE);
    setHeadMeta('twitter:description', BASE_DESC);
  }

  function updateRouteMeta(route, parsed) {
    switch (route) {
      case '/':
        setDocMeta(BASE_TITLE, BASE_DESC);
        resetSeoExtras();
        break;
      case '/catalogue':
        setDocMeta('Catalogue — ' + BASE_TITLE, 'Découvre notre catalogue d\'outillage professionnel : ' + products.length + ' produits, 7 marques. ' + BASE_DESC);
        removeJsonLd('product');
        injectBreadcrumbLd([
          { name: 'Accueil', hash: '/' },
          { name: 'Catalogue', hash: '/catalogue' }
        ]);
        injectItemListLd();
        break;
      case '/produit':
        // product meta is set in renderPDP once we know which product
        break;
      case '/livraison':
        setDocMeta('Livraison quincaillerie \u2014 ' + BASE_TITLE, 'Fais-toi livrer ta quincaillerie directement sur ton chantier en Guadeloupe. Tarifs fixes par zone, livreurs locaux. Ouverture le 1er janvier.');
        break;
      case '/devis':
        setDocMeta('Panier / devis — ' + BASE_TITLE, 'Finalise ton devis et passe commande chez Pirates Tools.');
        removeJsonLd('product');
        break;
      case '/compte':
        setDocMeta('Mon compte — ' + BASE_TITLE, 'Espace client Pirates Tools.');
        removeJsonLd('product');
        break;
      case '/auth':
        setDocMeta('Connexion — ' + BASE_TITLE, 'Connexion et inscription au compte client Pirates Tools.');
        removeJsonLd('product');
        break;
      case '/contact':
        setDocMeta('Contact — ' + BASE_TITLE, 'Contacte Pirates Tools par email, téléphone ou WhatsApp.');
        removeJsonLd('product');
        break;
      case '/favoris':
        setDocMeta('Mes favoris — ' + BASE_TITLE, 'Tes produits favoris sur Pirates Tools.');
        removeJsonLd('product');
        break;
      case '/artisans':
        setDocMeta('Nos artisans — ' + BASE_TITLE, 'L\'annuaire des artisans partenaires Pirates Tools : des professionnels locaux de confiance en Guadeloupe et dans les DOM-TOM.');
        removeJsonLd('product');
        break;
      case '/rejoindre':
        setDocMeta('Rejoindre le réseau — ' + BASE_TITLE, 'Pré-inscription au programme partenaire artisans Pirates Tools — sans engagement, sans paiement.');
        removeJsonLd('product');
        break;
      case '/admin':
        setDocMeta('Administration — ' + BASE_TITLE, '');
        removeJsonLd('product');
        break;
      case '/mentions-legales':
        setDocMeta('Mentions légales — ' + BASE_TITLE, 'Mentions légales du site Pirates Tools : éditeur, hébergeur, médiation.');
        removeJsonLd('product');
        break;
      case '/confidentialite':
        setDocMeta('Politique de confidentialité — ' + BASE_TITLE, 'Comment Pirates Tools protège vos données personnelles (RGPD).');
        removeJsonLd('product');
        break;
      case '/cgv':
        setDocMeta('Conditions Générales de Vente — ' + BASE_TITLE, 'CGV Pirates Tools : commande, paiement, livraison DOM-TOM, rétractation, garanties.');
        removeJsonLd('product');
        break;
      case '/territoire':
        // handleTerritoryRoute() already set title/desc/OG/canonical/JSON-LD
        break;
      default:
        setDocMeta(BASE_TITLE, BASE_DESC);
        removeJsonLd('product');
    }
  }

  function setupAccountTabs() {
    var tabs = document.querySelectorAll('.acc-tab');
    var panes = document.querySelectorAll('.acc-pane');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-acc-tab');
        tabs.forEach(function (t) {
          var active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panes.forEach(function (p) {
          var active = p.getAttribute('data-acc-pane') === target;
          p.classList.toggle('active', active);
          p.hidden = !active;
        });
      });
    });
  }

  function init() {
    cacheDom();
    // Skip-link : focus programmatique du <main> (preventDefault — un vrai
    // saut #app passerait par le routeur hash et re-rendrait l'accueil).
    var skipLink = document.getElementById('skipLink');
    if (skipLink) {
      skipLink.addEventListener('click', function (e) {
        e.preventDefault();
        var main = document.getElementById('app');
        if (main) { try { main.focus({ preventScroll: false }); } catch (_) { main.focus(); } }
      });
    }
    loadTerritory();
    loadConsent();
    setupTerritorySelector();
    setupConsentBar();
    setupWaFloat();
    applyContactChannels();   // masque tel/WhatsApp tant qu'aucun numéro n'est configuré
    bindEvents();
    setupAccountTabs();
    setupRevealAnimations();
    setupPayModal();
    initAuth();
    initPWA();
    updateCartUI();
    loadProducts();
    bindWishlistDelegation();
    updateWishlistUI();
    injectOrganizationJsonLd();
    aInit(); // mesure d'audience maison (clics data-track, cycle de vie, session)
    onRouteChange();
    // Signal pour le watchdog de boot (index.html) : l'app a démarré et le
    // routeur a affiché une vue — pas d'écran « chargement incomplet ».
    window.PT_BOOTED = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
