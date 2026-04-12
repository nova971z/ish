/* ============================================================
   Pirates Tools — Single-file PWA Application
   Professional tools e-commerce for French Antilles
   ============================================================ */
(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────

  function escapeHTML(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
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

  // ── Stubs filled in by Phase 4 / Phase 5 ───────────────────
  // productBadges() renders DOM-TOM-specific pills (tropical, cordless, mayotte, stock).
  // localPriceComparison() injects a "local price" simulator on the PDP.
  // Defining them up front keeps render functions safe even if those phases
  // haven't been loaded yet.
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
    if (p.stock_status === 'in_stock')
      out.push('<span class="pt-badge pt-badge--stock" title="En stock, expédition rapide">⚡ <span class="pt-badge__txt">Stock local</span></span>');
    return out.join('');
  }
  function productBadges(p) {
    var inner = productBadgeItems(p);
    if (!inner) return '';
    return '<div class="pt-badges">' + inner + '</div>';
  }

  // calcLocalPrice — estimation du prix local moyen (revendeurs DOM-TOM)
  // Ratio 1.60 sur le prix HT (marge + taxes + transport typiques).
  function calcLocalPrice(product) {
    if (!product) return 0;
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

  function setupWaFloat() {
    var el = document.getElementById('waFloat');
    if (!el || el._bound) return;
    el._bound = true;
    el.addEventListener('click', function () {
      track('whatsapp_click', { source: 'float' });
    });
  }

  function setupConsentBar() {
    if (_consent) return; // already decided
    var bar = document.getElementById('consentBar');
    if (!bar) return;
    bar.hidden = false;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-consent]');
      if (!btn) return;
      var value = btn.getAttribute('data-consent');
      saveConsent(value === 'accept' ? 'granted' : 'denied');
      bar.hidden = true;
      if (value === 'accept') {
        flushAnalyticsQueue();
        track('consent_granted', { timestamp: Date.now() });
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
      'pdpTitle','pdpTag','pdpDesc','pdpPrice','pdpSpecs','pdpImg',
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
  var WA_PHONE = '33744776598';

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
    localStorage.setItem(CART_KEY, JSON.stringify({ version: '1', items: items }));
    updateCartUI();
  }

  function getCart() { return loadCartData(); }

  function productCardVisual(p) {
    var imgSrc = escapeHTML(p.img || 'images/placeholder.svg');
    var alt = escapeHTML(p.title);
    if (p.model) {
      return '<model-viewer class="product-card__model"'
        + ' src="' + escapeHTML(p.model) + '"'
        + ' alt="' + alt + '"'
        + ' loading="eager"'
        + ' reveal="auto"'
        + ' rotation-per-second="25deg"'
        + ' interaction-prompt="none"'
        + ' disable-zoom'
        + ' disable-tap'
        + ' disable-pan'
        + ' shadow-intensity="0.4"'
        + ' exposure="1.1"'
        + '><img slot="poster" src="' + imgSrc + '" alt="' + alt + '" loading="lazy" /></model-viewer>';
    }
    return '<img src="' + imgSrc + '" alt="' + alt + '" loading="lazy" decoding="async" class="product-card__img">';
  }

  function addToCart(item) {
    var items = getCart();
    var key = item.key || item.id || item.slug;
    var existing = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].key === key) { existing = items[i]; break; }
    }
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      items.push({
        key: key,
        title: item.title,
        brand: item.brand || '',
        price: Number(item.price) || 0,
        qty: 1,
        image: item.img || item.image || '',
        paymentLink: item.paymentLink || ''
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
        + '<p class="devis-empty__text">Parcourez notre catalogue et ajoutez vos outils preferes</p>'
        + '<a class="devis-btn devis-btn--browse" href="#/catalogue">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>'
        + '<span>Decouvrir le catalogue</span>'
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
      // Recompute unit price from the live product (territory-aware),
      // falling back to the stored item.price for historical cart entries.
      var p = findProductByKey(item.key);
      var unit = p ? calcPrice(p, _currentTerritory).ttc : Number(item.price) || 0;
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

    // Loyalty discount (Phase 4) applied on top of the items total
    var loyalty = getLoyaltyState ? getLoyaltyState(total) : null;
    var grand = loyalty ? loyalty.discountedTotal : total;

    // Estimated shipping for current territory
    var terrInfo = getTerritory() || getTerritory(DEFAULT_TERRITORY);
    var shipping = shippingEstimateFor(terrInfo.code);

    // Update stats
    if (statItems) statItems.textContent = totalQty;
    if (statTotal) statTotal.textContent = formatPrice(grand);
    if (footerTotal) footerTotal.textContent = formatPrice(grand);

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
        loyaltyEl.hidden = false;
        loyaltyEl.innerHTML = '<span class="devis-loyalty__tier">' + loyalty.tierIcon + ' '
          + escapeHTML(loyalty.tierLabel) + '</span>'
          + '<span class="devis-loyalty__save">−' + loyalty.discountPct + ' % ('
          + formatPrice(total - grand) + ')</span>'
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
    var items = getCart();
    if (items.length === 0) { toast('Panier vide', 'error'); return; }
    var msg = waCartMessage(items, _currentTerritory);
    window.open(waLink(msg), '_blank');

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
    // Try cache first for instant render
    try {
      var cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
      if (cached) {
        var arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr.length > 0) {
          setProducts(arr);
          onRouteChange();
        }
      }
    } catch (_) { /* ignore */ }

    // Prefer the serverless API when available (Vercel), fallback to
    // static products.json (GitHub Pages / offline). The API returns
    // { ok, count, products: [...] } while the static file is a raw array.
    var apiConfigured = typeof window.PT_API_BASE === 'string';
    var apiBase = window.PT_API_BASE || '';
    var primaryUrl = apiConfigured ? (apiBase + '/api/products') : 'products.json';
    var fallbackUrl = 'products.json';

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

    tryFetch(primaryUrl)
      .catch(function (err) {
        console.warn('[products] primary fetch failed (' + primaryUrl + '):', err.message);
        if (primaryUrl === fallbackUrl) throw err;
        return tryFetch(fallbackUrl);
      })
      .then(function (arr) {
        try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(arr)); } catch (_) {}
        setProducts(arr);
        onRouteChange();
      })
      .catch(function (err) {
        console.error('[products] all fetches failed:', err && err.message);
        if (products.length === 0) toast('Impossible de charger les produits', 'error');
      });
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
    var html = '<button class="cat-chip active" data-cat="">Tout</button>';
    allCategories.forEach(function (c) {
      html += '<button class="cat-chip" data-cat="' + escapeHTML(c) + '">' + escapeHTML(c) + '</button>';
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
      if (cat && p.category !== cat) return false;
      if (q) {
        var hay = (p.title + ' ' + p.brand + ' ' + (p.desc || '') + ' ' + (p.description || '')).toLowerCase();
        return hay.indexOf(q) !== -1;
      }
      return true;
    });
  }

  function renderProductList() {
    if (!dom.list) return;
    var filtered = filteredProducts();
    if (filtered.length === 0) {
      dom.list.innerHTML = '<p class="no-results">Aucun produit trouvé.</p>';
      return;
    }
    dom.list.innerHTML = filtered.map(function (p) {
      var out = isOutOfStock(p);
      var price = calcPrice(p, _currentTerritory);
      return '<a class="product-card' + (out ? ' product-card--out' : '') + '" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
        + '<div class="product-card__img-wrap">'
        + productCardVisual(p)
        + (p.tag ? '<span class="product-card__tag">' + escapeHTML(p.tag) + '</span>' : '')
        + stockBadge(p)
        + productBadges(p)
        + wishlistButton(p)
        + '</div>'
        + '<div class="product-card__body">'
        + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
        + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
        + '<span class="product-card__price">' + formatPrice(price.ttc) + ' <small>TTC</small></span>'
        + '</div>'
        + '</a>';
    }).join('');
    preloadModelViewers(dom.list);
  }

  // ── Brand grid (home page) ─────────────────────────────────

  var BRAND_IMAGES = {
    'DeWALT': 'images/brands/dewalt.png',
    'Facom': 'images/brands/facom.png',
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

  function createBrandSphere(container, brand, logoSrc) {
    if (container.dataset.sphereReady === '1') return;
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
    }).join('');

    initBrandSpheres();
    // Re-observe newly inserted reveal targets (brands grid + section).
    observeReveals(dom.brandGrid.closest('.view') || document);

    $$('.brand-card', dom.brandGrid).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var brand = btn.dataset.brand;
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

  function renderHomeProducts() {
    var track = document.getElementById('homeProductsTrack');
    if (!track) return;
    if (products.length === 0) {
      track.innerHTML = '<p class="no-results">Aucun produit pour le moment.</p>';
      return;
    }
    track.innerHTML = products.map(function (p) {
      var out = isOutOfStock(p);
      var price = calcPrice(p, _currentTerritory);
      return '<a class="product-card' + (out ? ' product-card--out' : '') + '" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
        + '<div class="product-card__img-wrap">'
        + productCardVisual(p)
        + (p.tag ? '<span class="product-card__tag">' + escapeHTML(p.tag) + '</span>' : '')
        + stockBadge(p)
        + productBadges(p)
        + wishlistButton(p)
        + '</div>'
        + '<div class="product-card__body">'
        + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
        + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
        + '<span class="product-card__price">' + formatPrice(price.ttc) + ' <small>TTC</small></span>'
        + '</div>'
        + '</a>';
    }).join('');
    preloadModelViewers(track);
  }

  // ── Scroll passthrough : page scroll quand le 3D est au zoom min/max ──

  function setupModelViewerScrollPassthrough(mv) {
    if (!mv) return;

    // Cleanup ancien listener
    if (mv._wheelHandler) {
      mv.removeEventListener('wheel', mv._wheelHandler, true);
    }

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

    if (dom.pdpTitle) dom.pdpTitle.textContent = product.title;
    if (dom.pdpTag) dom.pdpTag.textContent = product.brand + (product.tag ? ' \u00B7 ' + product.tag : '');
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

    // 3D model viewer — hero (plein ecran)
    var viewer = document.getElementById('pdp3d');
    if (viewer) {
      var modelSrc = product.model || 'models/dewalt-optimized.glb';
      viewer.setAttribute('src', modelSrc);
      viewer.setAttribute('alt', product.title);
      if (product.img) viewer.setAttribute('poster', product.img);
    }

    // 3D model viewer — secondary (angle different : vue de dessus/profil)
    var viewer2 = document.getElementById('pdp3dSecondary');
    if (viewer2) {
      var modelSrc2 = product.model || 'models/dewalt-optimized.glb';
      viewer2.setAttribute('src', modelSrc2);
      viewer2.setAttribute('alt', product.title + ' - vue detail');
      if (product.img) viewer2.setAttribute('poster', product.img);
    }

    // ── Scroll passthrough quand zoom 3D au minimum ──
    setupModelViewerScrollPassthrough(viewer);
    setupModelViewerScrollPassthrough(viewer2);

    // Scroll animation for landing sections
    initPdpScrollAnimations();

    // Price (TTC + HT + octroi de mer breakdown for the selected territory) + stock badge
    if (dom.pdpPrice) {
      var price = calcPrice(product, _currentTerritory);
      var terr = getTerritory() || getTerritory(DEFAULT_TERRITORY);
      dom.pdpPrice.innerHTML = '<span class="pdp-price__ttc">' + formatPrice(price.ttc) + ' TTC</span>'
        + '<span class="pdp-price__ht">' + formatPrice(price.ht) + ' HT</span>'
        + '<details class="pdp-price__breakdown">'
        +   '<summary>Détail ' + terr.flag + ' ' + escapeHTML(terr.name) + '</summary>'
        +   '<ul>'
        +     '<li><span>Prix HT</span><strong>' + formatPrice(price.ht) + '</strong></li>'
        +     '<li><span>Octroi de mer</span><strong>' + formatPrice(price.octroi) + '</strong></li>'
        +     '<li><span>TVA</span><strong>' + formatPrice(price.tva) + '</strong></li>'
        +     '<li class="pdp-price__total"><span>Total TTC</span><strong>' + formatPrice(price.ttc) + '</strong></li>'
        +   '</ul>'
        + '</details>'
        + stockBadge(product);
      localPriceComparison(product, price, dom.pdpPrice);
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

    // Specs table
    if (dom.pdpSpecs && product.specs) {
      var specsHtml = '<table>';
      Object.keys(product.specs).forEach(function (k) {
        specsHtml += '<tr><td>' + escapeHTML(k) + '</td><td>' + escapeHTML(product.specs[k]) + '</td></tr>';
      });
      specsHtml += '</table>';
      dom.pdpSpecs.innerHTML = specsHtml;
    } else if (dom.pdpSpecs) {
      dom.pdpSpecs.innerHTML = '';
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

    // Add to cart — stays on page, no redirect
    var pdpOut = isOutOfStock(product);
    if (dom.pdpQuote) {
      dom.pdpQuote.disabled = pdpOut;
      if (pdpOut) dom.pdpQuote.setAttribute('aria-disabled', 'true');
      else dom.pdpQuote.removeAttribute('aria-disabled');
      dom.pdpQuote.onclick = function () {
        if (isOutOfStock(product)) {
          toast('Produit en rupture de stock', 'error');
          return;
        }
        addToCart(product);
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
        openPayModal([{ title: product.title, price: product.price, qty: 1, paymentLink: product.paymentLink || '' }]);
      };
    }

    // WhatsApp link — territory-aware message
    if (dom.pdpWa) {
      dom.pdpWa.href = waLink(waProductMessage(product, _currentTerritory));
      dom.pdpWa.target = '_blank';
      dom.pdpWa.addEventListener('click', function () {
        if (typeof track === 'function') track('whatsapp_click', { source: 'pdp', id: product.id });
      }, { once: true });
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
      for (var j = 0; j < starBtns.length; j++) starBtns[j].classList.remove('active');

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
    localStorage.setItem(HOME_REVIEWS_KEY, JSON.stringify(reviews));
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

  var PLAN_INFO = {
    basique: { name: 'Basique', desc: 'L\'essentiel pour demarrer. Acces a notre catalogue en ligne et tarifs reduits sur vos premieres commandes.',
      features: [{icon:'🏷️',text:'-10% sur le catalogue'},{icon:'📦',text:'Livraison standard'},{icon:'📧',text:'Support par email'}], color:'basique' },
    pro: { name: 'Pro', desc: 'Le choix des professionnels. Remises significatives, paiement flexible et conseiller dedie pour optimiser vos achats.',
      features: [{icon:'🏷️',text:'-25% sur le catalogue'},{icon:'💳',text:'Paiement differe 30j'},{icon:'👤',text:'Conseiller dedie'},{icon:'🚚',text:'Livraison express'},{icon:'📊',text:'Dashboard commandes'}], color:'pro' },
    gold: { name: 'Gold', desc: 'L\'experience premium. Tous les avantages Pro + communication digitale et fidelite renforcee pour booster votre activite.',
      features: [{icon:'🏷️',text:'-30% sur le catalogue'},{icon:'💳',text:'Paiement differe 60j'},{icon:'👤',text:'Conseiller prioritaire'},{icon:'🚚',text:'Livraison gratuite'},{icon:'💎',text:'Points fidelite x3'},{icon:'📱',text:'Reseaux sociaux inclus'},{icon:'🎁',text:'Ventes privees'}], color:'gold' },
    black: { name: 'Black Metal', desc: 'Le summum absolu. Tous nos services reunis, remises maximales, communication complete et acces VIP illimite.',
      features: [{icon:'🏷️',text:'-40% sur le catalogue'},{icon:'💳',text:'Paiement differe 90j'},{icon:'👤',text:'Account manager VIP'},{icon:'🚚',text:'Livraison J+1 gratuite'},{icon:'💎',text:'Points fidelite x5'},{icon:'📱',text:'Communication 360\u00b0'},{icon:'🎁',text:'Ventes privees exclusives'},{icon:'🌐',text:'Site vitrine offert'},{icon:'📸',text:'Contenu photo/video'},{icon:'🔥',text:'Acces beta nouveautes'}], color:'black' }
  };

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
    var info = PLAN_INFO[plan] || {};

    _pDraw(saving);

    if (amtEl) amtEl.textContent = '-' + saving.toLocaleString('fr-FR') + ' \u20ac/an';
    if (lblEl) lblEl.textContent = (info.name || '') + ' \u2022 ' + price + '\u20ac/mois';
    if (dtlEl && info.desc) {
      var featHtml = '';
      if (info.features && info.features.length) {
        featHtml = '<div class="plan-detail__features">';
        info.features.forEach(function(f) {
          featHtml += '<span class="plan-detail__feat"><span class="plan-detail__feat-icon">' + f.icon + '</span>' + f.text + '</span>';
        });
        featHtml += '</div>';
      }
      dtlEl.className = 'plan-detail is-open plan-detail--' + (info.color || plan);
      dtlEl.innerHTML = '<div class="plan-detail__inner">'
        + '<div class="plan-detail__name">' + (info.name || '') + '</div>'
        + '<div class="plan-detail__desc">' + info.desc + '</div>'
        + featHtml
        + '<span class="plan-detail__saving">' + price + ' \u20ac/mois \u2192 ' + saving.toLocaleString('fr-FR') + ' \u20ac economises/an</span>'
        + '<a href="#/abonnement/' + plan + '" class="plan-detail__cta plan-detail__cta--' + (info.color || plan) + '">Choisir ' + (info.name || '') + '</a>'
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

    // Build model list from products that have a "model" field
    if (_3dModels.length === 0 && products.length > 0) {
      var seen = {};
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        if (p.model && !seen[p.model]) {
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
    var winH = window.innerHeight;

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

        // ── Glow arrière-plan : pulse plus fort au début ──
        var glowEl = pdpHero.querySelector('.pdp-hero::after');

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
        var ddp = getProgress(discoverDesc, 60);
        if (ddp > 0) {
          var tddop = clamp((ddp - 0.05) * 2.2, 0, 1);
          var tddty = (1 - easeOut(ddp)) * 70;
          var tddblur = Math.max(0, (1 - ddp) * 10);
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

  var ABO_DATA = {
    basique: {
      name: 'Basique',
      price: '9',
      tagline: 'L\'essentiel pour bien demarrer',
      desc: 'Accedez a notre catalogue en ligne avec des tarifs reduits. L\'abonnement ideal pour decouvrir l\'univers Pirates Tools sans engagement.',
      features: [
        { icon: '🏷️', text: 'Remise de 10% sur tout le catalogue', detail: 'Applicable sur chaque commande, sans minimum d\'achat.' },
        { icon: '📦', text: 'Livraison standard offerte des 80\u20ac', detail: 'Livraison sous 3-5 jours ouvrés partout en France.' },
        { icon: '📧', text: 'Support par email prioritaire', detail: 'Reponse garantie sous 24h les jours ouvrés.' },
        { icon: '📋', text: 'Acces au catalogue complet', detail: 'Toutes nos references disponibles en ligne 24h/24.' }
      ],
      theme: 'basique'
    },
    pro: {
      name: 'Pro',
      price: '29',
      tagline: 'Le choix des professionnels exigeants',
      desc: 'Des remises significatives, un paiement flexible et un conseiller dedie pour optimiser chaque commande. Concu pour les artisans et les pros du batiment.',
      features: [
        { icon: '🏷️', text: 'Remise de 25% sur tout le catalogue', detail: 'La meilleure remise pour les professionnels reguliers.' },
        { icon: '💳', text: 'Paiement differe a 30 jours', detail: 'Payez vos commandes a 30 jours fin de mois.' },
        { icon: '👤', text: 'Conseiller dedie personnel', detail: 'Un interlocuteur unique qui connait vos besoins.' },
        { icon: '🚚', text: 'Livraison express J+1', detail: 'Recevez vos commandes des le lendemain avant 13h.' },
        { icon: '📊', text: 'Dashboard commandes', detail: 'Suivez vos commandes, factures et historique en temps reel.' }
      ],
      theme: 'pro'
    },
    gold: {
      name: 'Gold',
      price: '59',
      tagline: 'L\'experience premium sans compromis',
      desc: 'Tous les avantages Pro amplifies, avec la communication digitale integree et un programme de fidelite renforce. Pour ceux qui veulent le meilleur.',
      features: [
        { icon: '🏷️', text: 'Remise de 30% sur tout le catalogue', detail: 'Le meilleur rapport qualite-prix du marche.' },
        { icon: '💳', text: 'Paiement differe a 60 jours', detail: 'Une tresorerie plus souple pour votre activite.' },
        { icon: '👤', text: 'Conseiller prioritaire VIP', detail: 'Ligne directe, disponible 6j/7 de 7h a 20h.' },
        { icon: '🚚', text: 'Livraison gratuite illimitee', detail: 'Sans minimum d\'achat, partout en France et DOM-TOM.' },
        { icon: '💎', text: 'Points fidelite x3', detail: 'Cumulez 3x plus de points a chaque commande.' },
        { icon: '📱', text: 'Gestion reseaux sociaux', detail: 'Nous gerons vos reseaux sociaux professionnels.' },
        { icon: '🎁', text: 'Acces ventes privees', detail: 'Des offres exclusives reservees aux membres Gold.' }
      ],
      theme: 'gold'
    },
    black: {
      name: 'Black Metal',
      price: '99',
      tagline: 'Le summum absolu. Tout inclus.',
      desc: 'Tous nos services reunis en un seul abonnement. Remises maximales, communication 360°, site web offert et acces VIP illimite. L\'excellence totale.',
      features: [
        { icon: '🏷️', text: 'Remise de 40% sur tout le catalogue', detail: 'La remise la plus elevee, reservee a l\'elite.' },
        { icon: '💳', text: 'Paiement differe a 90 jours', detail: 'La flexibilite maximale pour votre tresorerie.' },
        { icon: '👤', text: 'Account manager VIP dedie', detail: 'Un expert attitré, joignable 7j/7.' },
        { icon: '🚚', text: 'Livraison J+1 gratuite illimitee', detail: 'Express gratuit sans minimum, priorite absolue.' },
        { icon: '💎', text: 'Points fidelite x5', detail: 'Le taux de cumul le plus genereux.' },
        { icon: '📱', text: 'Communication 360\u00b0 complete', detail: 'Reseaux sociaux, contenu photo/video, branding.' },
        { icon: '🌐', text: 'Site vitrine professionnel offert', detail: 'Votre site web cle en main, heberge et maintenu.' },
        { icon: '📸', text: 'Contenu photo & video', detail: 'Shooting professionnel pour vos realisations.' },
        { icon: '🎁', text: 'Ventes privees exclusives', detail: 'Acces prioritaire aux ventes flash et nouveautes.' },
        { icon: '🔥', text: 'Acces beta nouveautes', detail: 'Testez les nouveaux produits avant tout le monde.' }
      ],
      theme: 'black'
    }
  };

  function renderAbonnement(slug) {
    var data = ABO_DATA[slug];
    var el = document.getElementById('aboContent');
    if (!el || !data) { location.hash = '#/'; return; }

    var featRows = '';
    data.features.forEach(function (f, i) {
      featRows += '<div class="abo-feat" style="animation-delay:' + (i * .07) + 's">'
        + '<div class="abo-feat__icon">' + f.icon + '</div>'
        + '<div class="abo-feat__body">'
        + '<div class="abo-feat__title">' + f.text + '</div>'
        + '<div class="abo-feat__detail">' + f.detail + '</div>'
        + '</div></div>';
    });

    el.innerHTML = '<div class="abo-page abo-page--' + data.theme + '">'
      // Back link
      + '<a href="#/" class="abo-back">\u2190 Retour</a>'

      // Hero header
      + '<div class="abo-hero">'
      + '<div class="abo-hero__glow"></div>'
      + '<div class="abo-hero__badge">' + data.name + '</div>'
      + '<h1 class="abo-hero__title" id="abo-h1">' + data.tagline + '</h1>'
      + '<p class="abo-hero__desc">' + data.desc + '</p>'
      + '<div class="abo-hero__price"><span class="abo-hero__amount">' + data.price + '\u20ac</span><span class="abo-hero__period">/mois</span></div>'
      + '</div>'

      // Features
      + '<div class="abo-features">'
      + '<h2 class="abo-features__title">Tout ce qui est inclus</h2>'
      + featRows
      + '</div>'

      // CTA
      + '<div class="abo-cta-wrap">'
      + '<button class="abo-cta abo-cta--' + data.theme + '">Souscrire a ' + data.name + ' \u2014 ' + data.price + '\u20ac/mois</button>'
      + '<p class="abo-cta-note">Sans engagement \u2022 Annulation a tout moment</p>'
      + '</div>'
      + '</div>';
  }

  // ── Router (hash-based SPA) ────────────────────────────────

  var ROUTES = ['/', '/catalogue', '/produit', '/devis', '/compte', '/auth', '/abonnement'];

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
    if (hash.indexOf('/produit/') === 0) {
      return { route: '/produit', slug: hash.replace('/produit/', '') };
    }
    if (hash.indexOf('/abonnement/') === 0) {
      return { route: '/abonnement', slug: hash.replace('/abonnement/', '') };
    }
    // Territory landings: /guadeloupe, /martinique, /guyane, /reunion, /mayotte
    var terrSlug = hash.replace(/^\//, '');
    if (territoryCodeFromSlug(terrSlug)) {
      return { route: '/territoire', slug: terrSlug };
    }
    if (ROUTES.indexOf(hash) === -1) return { route: '/', slug: null };
    return { route: hash, slug: null };
  }

  function onRouteChange() {
    var parsed = parseHash();
    var route = parsed.route;

    // Auth guards
    var loggedIn = !!_currentUser;
    if (route === '/compte' && !loggedIn) { location.hash = '#/auth'; return; }
    if (route === '/auth' && loggedIn) { location.hash = '#/compte'; return; }

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

    // Scroll to top
    window.scrollTo(0, 0);

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
        break;
      case '/catalogue':
        renderCategoryChips();
        renderCategorySelect();
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
        break;
      case '/auth':
        showAuthTab('login');
        break;
      case '/abonnement':
        if (parsed.slug) renderAbonnement(parsed.slug);
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
    }

    // Update <title> + meta description for SEO
    updateRouteMeta(route, parsed);

    // Analytics : page view + territory view
    if (typeof track === 'function') {
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

  // ── Sidebar menu ───────────────────────────────────────────

  var menuOpen = false;

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
      'auth/email-already-in-use': 'Cet email est deja utilise',
      'auth/invalid-email': 'Email invalide',
      'auth/weak-password': 'Mot de passe trop faible (min. 6 caracteres)',
      'auth/user-not-found': 'Aucun compte avec cet email',
      'auth/wrong-password': 'Mot de passe incorrect',
      'auth/invalid-credential': 'Email ou mot de passe incorrect',
      'auth/too-many-requests': 'Trop de tentatives. Reessaie plus tard',
      'auth/network-request-failed': 'Probleme de reseau',
      'auth/requires-recent-login': 'Reconnecte-toi pour effectuer cette action',
      'auth/missing-password': 'Mot de passe requis',
      'auth/popup-closed-by-user': 'Fenetre fermee'
    };
    return map[code] || (err && err.message) || 'Une erreur est survenue';
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

  function handleRegister(e) {
    e.preventDefault();
    if (!_fb || !_fb.configured) { toast('Authentification non configuree', 'error'); return; }

    var name = (dom.regName ? dom.regName.value : '').trim();
    var email = (dom.regEmail ? dom.regEmail.value : '').trim().toLowerCase();
    var pwd = dom.regPwd ? dom.regPwd.value : '';

    if (!name || !email || !pwd) { toast('Remplissez tous les champs', 'error'); return; }
    if (pwd.length < 6) { toast('Mot de passe trop court (min. 6)', 'error'); return; }

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
        toast('Compte cree, bienvenue ' + name + ' !', 'success');
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
        toast(fbErrorMessage(err), 'error');
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

    setBtnLoading(dom.forgotSubmit, true);
    _fb.sendPasswordResetEmail(_fb.auth, email)
      .then(function () {
        toast('Email de reinitialisation envoye', 'success');
        if (dom.authForgotPanel) dom.authForgotPanel.hidden = true;
        if (dom.forgotEmail) dom.forgotEmail.value = '';
      })
      .catch(function (err) {
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

  function renderAccount() {
    if (!_currentUser) return;
    var p = _userProfile || {};

    if (dom.accName) dom.accName.value = p.name || _currentUser.displayName || '';
    if (dom.accEmail) dom.accEmail.value = p.email || _currentUser.email || '';
    if (dom.accPhone) dom.accPhone.value = p.phone || '';
    if (dom.accAddress) dom.accAddress.value = p.address || '';
    if (p.avatar && dom.accAvatarImg) dom.accAvatarImg.src = p.avatar;

    updateCartUI();

    // Loyalty — merge server-side points with local tier progression.
    var loyalty = p.loyalty || 0;
    var pct = Math.min(loyalty / 10, 100);
    updateLoyaltyBar(pct);
    var lstate = getLoyaltyState(0);
    if (dom.accLoyaltyTxt) {
      dom.accLoyaltyTxt.innerHTML = lstate.tierIcon + ' ' + escapeHTML(lstate.tierLabel)
        + ' · ' + formatPrice(lstate.totalSpent) + ' cumulés'
        + (lstate.discountPct > 0 ? ' · −' + lstate.discountPct + ' %' : '')
        + (loyalty ? ' · ' + loyalty + ' pts' : '');
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
  }

  function renderOrderHistory() {
    if (!dom.accHistory || !_fb || !_currentUser) return;
    dom.accHistory.innerHTML = '<p style="opacity:.5;text-align:center;padding:.5rem 0">Chargement...</p>';

    var ordersRef = _fb.collection(_fb.db, 'users', _currentUser.uid, 'orders');
    var q = _fb.query(ordersRef, _fb.orderBy('date', 'desc'), _fb.limit(20));

    _fb.getDocs(q).then(function (snap) {
      if (snap.empty) {
        dom.accHistory.innerHTML = '<p style="opacity:.6;text-align:center;padding:.5rem 0">Aucun devis envoye pour le moment.</p>';
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

    var updates = { name: name, phone: phone, address: address };
    if (newEmail && newEmail !== _currentUser.email) updates.email = newEmail;

    var ref = _fb.doc(_fb.db, 'users', _currentUser.uid);
    var p = _fb.updateDoc(ref, updates);

    // Also update displayName on auth profile
    if (name && name !== _currentUser.displayName) {
      p = p.then(function () { return _fb.updateProfile(_fb.auth.currentUser, { displayName: name }); });
    }
    // Email change requires reauth in Firebase — best handled separately
    if (newEmail && newEmail !== _currentUser.email) {
      p = p.then(function () { return _fb.updateEmail(_fb.auth.currentUser, newEmail); });
    }

    p.then(function () {
      _userProfile = Object.assign({}, _userProfile || {}, updates);
      toast('Profil enregistre', 'success');
    }).catch(function (err) {
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
    if (newPwd.length < 6) { toast('Min. 6 caracteres', 'error'); return; }
    if (newPwd !== confirm) { toast('Les mots de passe ne correspondent pas', 'error'); return; }

    var cred = _fb.EmailAuthProvider.credential(_currentUser.email, current);
    _fb.reauthenticateWithCredential(_currentUser, cred)
      .then(function () { return _fb.updatePassword(_currentUser, newPwd); })
      .then(function () {
        if (dom.pwdCurrent) dom.pwdCurrent.value = '';
        if (dom.pwdNew) dom.pwdNew.value = '';
        if (dom.pwdConfirm) dom.pwdConfirm.value = '';
        toast('Mot de passe modifie', 'success');
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

  function handleResendVerification() {
    if (!_currentUser || !_fb) return;
    _fb.sendEmailVerification(_currentUser).then(function () {
      toast('Email de verification renvoye', 'success');
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
  function saveOrderToFirestore(itemCount, total) {
    if (!_fb || !_fb.configured || !_currentUser) return;
    var ordersRef = _fb.collection(_fb.db, 'users', _currentUser.uid, 'orders');
    _fb.addDoc(ordersRef, {
      date: _fb.serverTimestamp(),
      items: itemCount,
      total: total
    }).then(function () {
      // Add loyalty points (1 point per euro)
      var newLoyalty = ((_userProfile && _userProfile.loyalty) || 0) + Math.round(total);
      var ref = _fb.doc(_fb.db, 'users', _currentUser.uid);
      return _fb.updateDoc(ref, { loyalty: newLoyalty }).then(function () {
        if (_userProfile) _userProfile.loyalty = newLoyalty;
      });
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
          openPayModal([{ title: it.title, price: it.price, qty: it.qty || 1, paymentLink: it.paymentLink }]);
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
        return { title: it.title, price: it.price, qty: it.qty || 1, paymentLink: it.paymentLink || '' };
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

    // Resend email verification
    if (dom.accResendVerify) dom.accResendVerify.addEventListener('click', handleResendVerification);
  }

  // ── Bootstrap ──────────────────────────────────────────────

  // ── Stripe Payment Modal ───────────────────────────────────
  var _payItems = null;

  // ── Crypto pay state ───────────────────────────────────────
  var _cryptoSelected = null; // network object from PT_CRYPTO_CONFIG
  var _cryptoRates = {};      // coingeckoId -> EUR price
  var _cryptoTotalEur = 0;

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

  function cryptoQRUrl(payload) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data='
      + encodeURIComponent(payload);
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
        qr.src = cryptoQRUrl(cryptoBuildUri(net, amt || ''));
        qr.alt = 'QR ' + net.label;
        if (qrWrap) qrWrap.classList.add('is-ready');
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
    if (co.nowpaymentsApiKey) {
      // Crée dynamiquement une invoice NOWPayments avec le total panier.
      var body = {
        price_amount: Number(_cryptoTotalEur.toFixed(2)),
        price_currency: 'eur',
        pay_currency: co.nowpaymentsPayCurrency || 'usdttrc20',
        order_description: 'Pirates Tools — commande',
        success_url: location.origin + location.pathname + '#/merci',
        cancel_url:  location.origin + location.pathname + '#/checkout'
      };
      fetch('https://api.nowpayments.io/v1/invoice', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'x-api-key': co.nowpaymentsApiKey },
        body: JSON.stringify(body)
      }).then(function(r){ return r.json(); }).then(function(j){
        if (j && j.invoice_url) window.open(j.invoice_url, '_blank', 'noopener');
        else toast("Impossible de créer l'invoice NOWPayments.", 'error');
      }).catch(function(err){
        console.error('NOWPayments:', err);
        toast("Erreur réseau NOWPayments.", 'error');
      });
      return;
    }
    toast("Le paiement par carte n'est pas encore configuré. Édite crypto-config.js.", 'info');
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
        items: (_payItems || []).map(function(it){ return { title: it.title, price: it.price, qty: it.qty }; }),
        total: _cryptoTotalEur,
        method: 'crypto:' + _cryptoSelected.id,
        ts: Date.now()
      }));
    } catch(_){}
    window.open(url, '_blank', 'noopener');
  }

  function cryptoSwitchTab(tab) {
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

  function openPayModal(items) {
    var modal = document.getElementById('payModal');
    if (!modal || !items || !items.length) return;
    _payItems = items;
    _cryptoTotalEur = items.reduce(function(s,it){ return s + (it.price||0)*(it.qty||1); }, 0);
    _cryptoSelected = null;
    cryptoRenderNets();
    cryptoSwitchTab('card');

    var itemsEl = document.getElementById('payModalItems');
    var totalEl = document.getElementById('payModalTotal');
    var total = 0;
    var html = '';
    items.forEach(function (it) {
      var line = (it.price || 0) * (it.qty || 1);
      total += line;
      html += '<div class="pay-modal__line">'
        + '<div class="pay-modal__line-info">'
        +   '<span class="pay-modal__line-title">' + (it.title || 'Produit') + '</span>'
        +   '<span class="pay-modal__line-qty">x' + (it.qty || 1) + '</span>'
        + '</div>'
        + '<span class="pay-modal__line-price">' + formatPrice(line) + '</span>'
        + '</div>';
    });
    if (itemsEl) itemsEl.innerHTML = html;
    if (totalEl) totalEl.textContent = formatPrice(total);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { modal.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';

    // Initialize Stripe Elements (creates PaymentIntent + mounts form)
    _stripeReady = false;
    _stripeClientSecret = null;
    initStripeElements(total);

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

  function closePayModal() {
    var modal = document.getElementById('payModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    setTimeout(function () {
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

  // Create PaymentIntent and mount Elements
  function initStripeElements(total) {
    var stripe = getStripe();
    var container = document.getElementById('stripePaymentElement');
    var errorEl = document.getElementById('stripeCardError');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }

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

    var apiBase = window.PT_API_BASE || '';
    fetch(apiBase + '/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: _payItems.map(function (it) {
          return { title: it.title, price: it.price, qty: it.qty || 1 };
        }),
        customerEmail: (_currentUser && _currentUser.email) || undefined,
        territory: _currentTerritory
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok || !data.clientSecret) {
        throw new Error(data.error || 'Erreur création du paiement');
      }
      _stripeClientSecret = data.clientSecret;

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

  function confirmPayment() {
    if (!_payItems || !_payItems.length) return;
    var total = _payItems.reduce(function (s, it) { return s + (it.price || 0) * (it.qty || 1); }, 0);
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
          items: _payItems.map(function (it) { return { title: it.title, price: it.price, qty: it.qty }; }),
          total: total, ts: Date.now()
        }));
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
      });
      return;
    }

    // ── Fallback: server-side Stripe Checkout (redirect) ──
    var apiConfigured = typeof window.PT_API_BASE === 'string';
    var apiBase = window.PT_API_BASE || '';
    if (apiConfigured && !stripe) {
      var btn2 = document.getElementById('payModalConfirm');
      if (btn2) { btn2.disabled = true; btn2.textContent = 'Redirection…'; }

      fetch(apiBase + '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: _payItems.map(function (it) {
            return { title: it.title, price: it.price, qty: it.qty || 1 };
          }),
          customerEmail: (_currentUser && _currentUser.email) || undefined
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.url) {
          try {
            localStorage.setItem('pt_pending_order', JSON.stringify({
              items: _payItems.map(function (it) { return { title: it.title, price: it.price, qty: it.qty }; }),
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
        items: _payItems.map(function (it) { return { title: it.title, price: it.price, qty: it.qty }; }),
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

  function handleMerciPage() {
    // Called when route changes to /merci
    var pending = null;
    try { pending = JSON.parse(localStorage.getItem('pt_pending_order') || 'null'); } catch (e) {}
    if (pending) {
      // Local loyalty accrual — runs regardless of Firestore availability
      addLoyaltyPurchase(Number(pending.total) || 0);
      if (typeof track === 'function') track('purchase', { value: pending.total });
    }
    if (pending && _currentUser && _fb) {
      // Save to Firestore
      var ordersRef = _fb.collection(_fb.db, 'users', _currentUser.uid, 'orders');
      _fb.addDoc(ordersRef, {
        items: pending.items,
        total: pending.total,
        date: _fb.serverTimestamp(),
        status: 'paid',
        method: pending.method || 'stripe',
        paymentIntentId: pending.paymentIntentId || null
      }).then(function () {
        localStorage.removeItem('pt_pending_order');
      }).catch(function () {});
    } else if (pending) {
      // No Firestore but payment processed — clean up
      try { localStorage.removeItem('pt_pending_order'); } catch (_) {}
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

  function adminFetch(method, body) {
    var apiBase = (typeof window.PT_API_BASE === 'string') ? (window.PT_API_BASE || '') : '';
    var opts = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': getAdminSecret()
      }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(apiBase + '/api/admin', opts).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
      });
    });
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

    view.innerHTML = '<div class="admin-wrap">'
      + '<header class="admin-header">'
      + '<h1>Administration — Pirates Tools</h1>'
      + '<button type="button" class="btn btn--ghost" id="adminLogoutBtn">Déconnexion</button>'
      + '</header>'

      + '<nav class="admin-tabs" role="tablist">'
      + '<button type="button" class="admin-tab is-active" data-admin-tab="products" role="tab" aria-selected="true">Produits</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="orders" role="tab" aria-selected="false">Commandes</button>'
      + '<button type="button" class="admin-tab" data-admin-tab="tools" role="tab" aria-selected="false">Outils</button>'
      + '</nav>'

      + '<div class="admin-pane is-active" data-admin-pane="products">'
      + '<p class="admin-hint">Édite le stock et le prix de chaque produit. Les modifications sont enregistrées dans Firestore et visibles en production après rafraîchissement du cache (≤30 s).</p>'
      + '<div id="adminProductList" class="admin-list"><p class="admin-loading">Chargement…</p></div>'
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
      + '<button type="submit" class="btn btn--primary">Envoyer un email de test</button>'
      + '<span id="adminTestEmailStatus" class="admin-row__status" aria-live="polite"></span>'
      + '</form>'

      + '<h2 class="admin-subtitle">Environnement</h2>'
      + '<p class="admin-hint">Vérifie que les variables serverless sont bien configurées sur Vercel.</p>'
      + '<button type="button" class="btn btn--ghost" id="adminHealthBtn">Vérifier /api/health</button>'
      + '<pre id="adminHealthOutput" class="admin-health-output" hidden></pre>'
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
      });
    });

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

        var apiBase = (typeof window.PT_API_BASE === 'string') ? (window.PT_API_BASE || '') : '';
        fetch(apiBase + '/api/test-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': getAdminSecret()
          },
          body: JSON.stringify(to ? { to: to } : {})
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
        var apiBase = (typeof window.PT_API_BASE === 'string') ? (window.PT_API_BASE || '') : '';
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

    var apiBase = (typeof window.PT_API_BASE === 'string') ? (window.PT_API_BASE || '') : '';
    fetch(apiBase + '/api/admin?type=orders', {
      headers: { 'X-Admin-Secret': getAdminSecret() }
    })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
    .then(function (res) {
      if (!res.ok || !res.data.ok) {
        listEl.innerHTML = '<p class="admin-loading">Erreur : ' + escapeHTML((res.data && res.data.error) || 'Inconnue') + '</p>';
        return;
      }
      var orders = res.data.orders || [];
      if (orders.length === 0) {
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
        + '<button type="button" class="btn btn--primary" data-admin-action="save">Enregistrer</button>'
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
      + '<button type="submit" class="btn btn--primary">Se connecter</button>'
      + '</form>'
      + '<p class="admin-login__hint">La clé doit correspondre à la variable <code>ADMIN_SECRET</code> sur Vercel.</p>'
      + '</div>'
      + '</div>';
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

      var apiBase = (typeof window.PT_API_BASE === 'string') ? (window.PT_API_BASE || '') : '';
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

      var apiBase = (typeof window.PT_API_BASE === 'string') ? (window.PT_API_BASE || '') : '';
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
        + '<a class="btn btn--primary" href="#/catalogue">Voir le catalogue</a>'
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
        + '<span class="product-card__price">' + formatPrice(p.price) + '</span>'
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
        + '<span class="product-card__price">' + formatPrice(p.price) + '</span>'
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
      'telephone': '+33744776598',
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
        'telephone': '+33744776598',
        'contactType': 'customer service',
        'availableLanguage': 'French',
        'areaServed': 'FR'
      },
      'sameAs': []
    };
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
          + productBadges(p)
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
      case '/admin':
        setDocMeta('Administration — ' + BASE_TITLE, '');
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
    loadTerritory();
    loadConsent();
    setupTerritorySelector();
    setupConsentBar();
    setupWaFloat();
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
    onRouteChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
