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
      'devisList','devisSend','devisClear',
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
  var WA_PHONE = '33774230195';

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
        + ' loading="lazy"'
        + ' reveal="auto"'
        + ' auto-rotate'
        + ' rotation-per-second="25deg"'
        + ' interaction-prompt="none"'
        + ' disable-zoom'
        + ' disable-tap'
        + ' disable-pan'
        + ' shadow-intensity="0.4"'
        + ' exposure="1.1"'
        + '><img slot="poster" src="' + imgSrc + '" alt="' + alt + '" loading="lazy" /></model-viewer>';
    }
    return '<img src="' + imgSrc + '" alt="' + alt + '" loading="lazy" class="product-card__img">';
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
      var sub = (item.price || 0) * qty;
      total += sub;
      totalQty += qty;
      return '<div class="devis-item" data-idx="' + idx + '" style="animation-delay:' + (idx * 60) + 'ms">'
        + '<div class="devis-item__img-wrap">'
        + '<img src="' + escapeHTML(item.image || 'images/placeholder.svg') + '" alt="" class="devis-item__img" loading="lazy">'
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
        + (item.paymentLink ? '<button class="devis-buy" data-idx="' + idx + '" aria-label="Acheter">💳 Payer</button>' : '')
        + '<button class="devis-remove" data-idx="' + idx + '" aria-label="Supprimer">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'
        + '</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    }).join('');

    dom.devisList.innerHTML = html;

    // Update stats
    if (statItems) statItems.textContent = totalQty;
    if (statTotal) statTotal.textContent = formatPrice(total);
    if (footerTotal) footerTotal.textContent = formatPrice(total);

    // Qty +/- handlers
    $$('.devis-qty-minus', dom.devisList).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(this.dataset.idx);
        var c = getCart();
        var newQty = Math.max(1, (c[i].qty || 1) - 1);
        updateQty(i, newQty);
        renderDevis();
      });
    });
    $$('.devis-qty-plus', dom.devisList).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(this.dataset.idx);
        var c = getCart();
        var newQty = (c[i].qty || 1) + 1;
        updateQty(i, newQty);
        renderDevis();
      });
    });

    // Buy line handlers
    $$('.devis-buy', dom.devisList).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(this.dataset.idx);
        var c = getCart();
        var it = c[i];
        if (!it) return;
        openPayModal([{ title: it.title, price: it.price, qty: it.qty || 1, paymentLink: it.paymentLink }]);
      });
    });

    // Remove handlers
    $$('.devis-remove', dom.devisList).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var el = this.closest('.devis-item');
        if (el) { el.classList.add('devis-item--removing'); }
        setTimeout(function () {
          removeFromCart(Number(btn.dataset.idx));
          renderDevis();
        }, 300);
      });
    });
  }

  function sendDevisWhatsApp() {
    var items = getCart();
    if (items.length === 0) { toast('Panier vide', 'error'); return; }
    var total = 0;
    var lines = ['*Demande de devis — Pirates Tools*\n'];
    items.forEach(function (item) {
      var sub = (item.price || 0) * (item.qty || 1);
      total += sub;
      lines.push('• ' + item.title + ' ×' + item.qty + ' — ' + formatPrice(sub));
    });
    lines.push('\n*Total TTC : ' + formatPrice(total) + '*');
    var url = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent(lines.join('\n'));
    window.open(url, '_blank');

    // Save to Firestore order history (if authenticated)
    saveOrderToFirestore(items.length, total);
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

    // Fetch fresh copy
    fetch('products.json')
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(arr));
        setProducts(arr);
        onRouteChange();
      })
      .catch(function () {
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

    $$('.cat-chip', dom.catList).forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentFilter.category = this.dataset.cat;
        syncFilters();
        renderProductList();
      });
    });
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
      return '<a class="product-card" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
        + '<div class="product-card__img-wrap">'
        + productCardVisual(p)
        + (p.tag ? '<span class="product-card__tag">' + escapeHTML(p.tag) + '</span>' : '')
        + '</div>'
        + '<div class="product-card__body">'
        + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
        + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
        + '<span class="product-card__price">' + formatPrice(p.price) + '</span>'
        + '</div>'
        + '</a>';
    }).join('');
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

  function createBrandSphere(container, brand, logoSrc) {
    if (typeof THREE === 'undefined') return;
    if (container.dataset.sphereReady === '1') return;
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

    var entry = { renderer: renderer, scene: scene, camera: camera, sphere: sphere, container: container, visible: true };
    _brandScenes.push(entry);

    // Resize observer
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        var nw = container.clientWidth, nh = container.clientHeight;
        if (nw && nh) {
          renderer.setSize(nw, nh);
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
        }
      });
      ro.observe(container);
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

  function initBrandSpheres() {
    if (typeof THREE === 'undefined') return;
    var bubbles = document.querySelectorAll('[data-brand-sphere]');
    if (!bubbles.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var el = e.target;
        var brand = el.getAttribute('data-brand-sphere');
        var logo = el.getAttribute('data-logo');
        if (e.isIntersecting) {
          createBrandSphere(el, brand, logo);
          // Mark visibility
          _brandScenes.forEach(function (s) { if (s.container === el) s.visible = true; });
        } else {
          _brandScenes.forEach(function (s) { if (s.container === el) s.visible = false; });
        }
      });
      startBrandRaf();
    }, { rootMargin: '100px' });
    bubbles.forEach(function (b) { io.observe(b); });
  }

  function renderBrandGrid() {
    if (!dom.brandGrid) return;
    var brandNames = Object.keys(BRAND_IMAGES);
    dom.brandGrid.innerHTML = brandNames.map(function (b, i) {
      var img = BRAND_IMAGES[b];
      return '<button class="brand-card" data-brand="' + escapeHTML(b) + '" style="animation-delay:' + (i * 70) + 'ms">'
        + '<div class="brand-card__ring">'
        + '<div class="brand-card__bubble" data-brand-sphere="' + escapeHTML(b) + '" data-logo="' + escapeHTML(img) + '">'
        + '<img class="brand-card__logo brand-card__logo--fallback" src="' + escapeHTML(img) + '" alt="' + escapeHTML(b) + '" loading="lazy">'
        + '</div>'
        + '</div>'
        + '<span class="brand-card__name">' + escapeHTML(b) + '</span>'
        + '</button>';
    }).join('');

    initBrandSpheres();

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
      return '<a class="product-card" href="#/produit/' + escapeHTML(p.slug || p.id) + '">'
        + '<div class="product-card__img-wrap">'
        + productCardVisual(p)
        + (p.tag ? '<span class="product-card__tag">' + escapeHTML(p.tag) + '</span>' : '')
        + '</div>'
        + '<div class="product-card__body">'
        + '<span class="product-card__brand">' + escapeHTML(p.brand) + '</span>'
        + '<h3 class="product-card__title">' + escapeHTML(p.title) + '</h3>'
        + '<span class="product-card__price">' + formatPrice(p.price) + '</span>'
        + '</div>'
        + '</a>';
    }).join('');
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

    // Price (TTC + HT)
    if (dom.pdpPrice) {
      var ht = product.price_ht || (product.price / (1 + (product.vat || 0.2)));
      dom.pdpPrice.innerHTML = '<span class="pdp-price__ttc">' + formatPrice(product.price) + ' TTC</span>'
        + '<span class="pdp-price__ht">' + formatPrice(ht) + ' HT</span>';
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
    if (dom.pdpQuote) {
      dom.pdpQuote.onclick = function () {
        addToCart(product);
      };
    }

    // Buy now (Stripe Payment Link)
    var pdpBuy = document.getElementById('pdpBuy');
    if (pdpBuy) {
      if (product.paymentLink) {
        pdpBuy.hidden = false;
        pdpBuy.onclick = function () {
          openPayModal([{ title: product.title, price: product.price, qty: 1, paymentLink: product.paymentLink }]);
        };
      } else {
        pdpBuy.hidden = true;
      }
    }

    // WhatsApp link
    if (dom.pdpWa) {
      var waMsg = 'Bonjour, je suis intéressé(e) par : ' + product.title + ' (' + formatPrice(product.price) + ')';
      dom.pdpWa.href = 'https://wa.me/' + WA_PHONE + '?text=' + encodeURIComponent(waMsg);
      dom.pdpWa.target = '_blank';
    }

    // Share button (Web Share API with clipboard fallback)
    if (dom.pdpShare) {
      dom.pdpShare.onclick = function () {
        var url = location.href;
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
            return '<a class="product-card product-card--sm" href="#/produit/' + escapeHTML(rp.slug || rp.id) + '">'
              + '<img src="' + escapeHTML(rp.img || 'images/placeholder.svg') + '" alt="' + escapeHTML(rp.title) + '" loading="lazy">'
              + '<span>' + escapeHTML(rp.title) + '</span>'
              + '<span class="product-card__price">' + formatPrice(rp.price) + '</span>'
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

    // Star selection
    var starBtns = starsSelect ? starsSelect.querySelectorAll('.pdp-reviews__star-btn') : [];
    for (var si = 0; si < starBtns.length; si++) {
      (function (btn, idx) {
        btn.addEventListener('click', function () {
          selectedRating = idx + 1;
          for (var j = 0; j < starBtns.length; j++) {
            starBtns[j].classList.toggle('active', j <= idx);
          }
        });
        btn.addEventListener('mouseenter', function () {
          for (var j = 0; j < starBtns.length; j++) {
            starBtns[j].style.color = j <= idx ? '#FFD700' : '';
          }
        });
        btn.addEventListener('mouseleave', function () {
          for (var j = 0; j < starBtns.length; j++) {
            starBtns[j].style.color = '';
          }
        });
      })(starBtns[si], si);
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

    // Star selection
    var starBtns = starsSelect ? starsSelect.querySelectorAll('.pdp-reviews__star-btn') : [];
    for (var si = 0; si < starBtns.length; si++) {
      (function (btn, idx) {
        btn.addEventListener('click', function () {
          selectedRating = idx + 1;
          for (var j = 0; j < starBtns.length; j++) {
            starBtns[j].classList.toggle('active', j <= idx);
          }
        });
      })(starBtns[si], si);
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
      for (var j = 0; j < starBtns.length; j++) starBtns[j].classList.remove('active');

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
    }
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
        var dp = getProgress(discoverHeading, 100);
        if (dp > 0) {
          var tds = 0.6 + easeOut(dp) * 0.4;
          var tdop = clamp(dp * 1.8, 0, 1);
          var tdblur = Math.max(0, (1 - dp) * 14);
          var tdty = (1 - easeOut(dp)) * 50;
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

  function parseHash() {
    var hash = location.hash.replace(/^#/, '') || '/';
    if (hash.indexOf('/produit/') === 0) {
      return { route: '/produit', slug: hash.replace('/produit/', '') };
    }
    if (hash.indexOf('/abonnement/') === 0) {
      return { route: '/abonnement', slug: hash.replace('/abonnement/', '') };
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
        setupPlans();
        setupHomeReviews();
        setup3DCarousel();
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
      case '/merci':
        handleMerciPage();
        break;
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

  function initAuth() {
    whenFirebaseReady(function (fb) {
      _fb = fb;
      if (!fb.configured) {
        // Firebase not yet configured by site owner — keep app usable
        _authReady = true;
        return;
      }
      // Listen to auth state changes
      fb.onAuthStateChanged(fb.auth, function (user) {
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

    // Loyalty
    var loyalty = p.loyalty || 0;
    var pct = Math.min(loyalty / 10, 100);
    updateLoyaltyBar(pct);
    if (dom.accLoyaltyTxt) dom.accLoyaltyTxt.textContent = loyalty + ' points';

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

    // Search input (debounced 300ms)
    if (dom.q) {
      dom.q.addEventListener('input', debounce(function () {
        currentFilter.query = dom.q.value;
        renderProductList();
      }, 300));
    }

    // Category select
    if (dom.tag) {
      dom.tag.addEventListener('change', function () {
        currentFilter.category = dom.tag.value;
        syncFilters();
        renderProductList();
      });
    }

    // Devis page actions
    if (dom.devisSend) dom.devisSend.addEventListener('click', sendDevisWhatsApp);
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

  function openPayModal(items) {
    var modal = document.getElementById('payModal');
    if (!modal || !items || !items.length) return;
    _payItems = items;

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

  function confirmPayment() {
    if (!_payItems || !_payItems.length) return;
    // For Payment Links, we open the first item's link.
    // Multi-item carts: each item has its own link, we open the first and warn.
    var first = _payItems[0];
    if (!first.paymentLink) {
      alert('Lien de paiement non configuré pour ce produit. Contacte le support.');
      return;
    }
    // Save pending order intent in localStorage so #/merci can record it
    try {
      var total = _payItems.reduce(function (s, it) { return s + (it.price || 0) * (it.qty || 1); }, 0);
      localStorage.setItem('pt_pending_order', JSON.stringify({
        items: _payItems.map(function (it) { return { title: it.title, price: it.price, qty: it.qty }; }),
        total: total,
        ts: Date.now()
      }));
    } catch (e) {}
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
  }

  function handleMerciPage() {
    // Called when route changes to /merci
    var pending = null;
    try { pending = JSON.parse(localStorage.getItem('pt_pending_order') || 'null'); } catch (e) {}
    if (pending && _currentUser && _fb) {
      // Save to Firestore
      var ordersRef = _fb.collection(_fb.db, 'users', _currentUser.uid, 'orders');
      _fb.addDoc(ordersRef, {
        items: pending.items,
        total: pending.total,
        date: _fb.serverTimestamp(),
        status: 'paid',
        method: 'stripe'
      }).then(function () {
        localStorage.removeItem('pt_pending_order');
      }).catch(function () {});
    }
  }

  // Expose openPayModal for cart buttons
  window.openPayModal = openPayModal;

  function setupRevealAnimations() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('[data-reveal], [data-reveal-stagger]').forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
        } else if (e.boundingClientRect.top > 0) {
          // Only reset when leaving by scrolling back up past it
          e.target.classList.remove('is-visible');
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    document.querySelectorAll('[data-reveal], [data-reveal-stagger]').forEach(function (el) {
      io.observe(el);
    });
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
    bindEvents();
    setupAccountTabs();
    setupRevealAnimations();
    setupPayModal();
    initAuth();
    initPWA();
    updateCartUI();
    loadProducts();
    onRouteChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
