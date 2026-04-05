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
      'loginForm','registerForm','loginEmail','loginPwd',
      'regName','regEmail','regPwd',
      'accountForm','accSave','accName','accEmail',
      'accAvatar','accAvatarImg','accCartMiniTxt',
      'accSlider','accFill','accCursor',
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
        image: item.img || item.image || ''
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
    if (items.length === 0) {
      dom.devisList.innerHTML = '<div class="empty" style="padding:2rem;text-align:center">'
        + '<p><strong>Votre panier est vide</strong></p>'
        + '<p style="opacity:.7;margin:.5rem 0 1rem">Decouvrez nos produits et ajoutez-les a votre panier</p>'
        + '<a class="btn primary" href="#/catalogue">Voir le catalogue</a>'
        + '</div>';
      return;
    }
    var total = 0;
    var html = items.map(function (item, idx) {
      var sub = (item.price || 0) * (item.qty || 1);
      total += sub;
      return '<div class="devis-item" data-idx="' + idx + '">'
        + '<img src="' + escapeHTML(item.image || 'images/placeholder.svg') + '" alt="" class="devis-item__img" loading="lazy">'
        + '<div class="devis-item__info">'
        + '<strong>' + escapeHTML(item.title) + '</strong>'
        + '<span class="devis-item__brand">' + escapeHTML(item.brand) + '</span>'
        + '<span class="devis-item__price">' + formatPrice(item.price) + '</span>'
        + '</div>'
        + '<div class="devis-item__actions">'
        + '<input type="number" class="devis-qty" min="1" value="' + (item.qty || 1) + '" data-idx="' + idx + '">'
        + '<button class="devis-remove" data-idx="' + idx + '" aria-label="Supprimer">&times;</button>'
        + '</div>'
        + '</div>';
    }).join('');
    html += '<div class="devis-total"><strong>Total TTC :</strong> ' + formatPrice(total) + '</div>';
    dom.devisList.innerHTML = html;

    // Qty change handlers
    $$('.devis-qty', dom.devisList).forEach(function (inp) {
      inp.addEventListener('change', function () {
        updateQty(Number(this.dataset.idx), Number(this.value));
        renderDevis();
      });
    });

    // Remove handlers
    $$('.devis-remove', dom.devisList).forEach(function (btn) {
      btn.addEventListener('click', function () {
        removeFromCart(Number(this.dataset.idx));
        renderDevis();
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
        + '<img src="' + escapeHTML(p.img || 'images/placeholder.svg') + '" alt="' + escapeHTML(p.title) + '" loading="lazy">'
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

  function renderBrandGrid() {
    if (!dom.brandGrid) return;
    dom.brandGrid.innerHTML = allBrands.map(function (b) {
      var img = BRAND_IMAGES[b];
      var inner = img
        ? '<img src="' + escapeHTML(img) + '" alt="' + escapeHTML(b) + '" loading="lazy">'
        : '<span class="brand-bubble__text">' + escapeHTML(b) + '</span>';
      return '<button class="brand-bubble" data-brand="' + escapeHTML(b) + '">' + inner + '</button>';
    }).join('');

    $$('.brand-bubble', dom.brandGrid).forEach(function (btn) {
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
    if (dom.pdpTag) dom.pdpTag.textContent = product.brand + (product.tag ? ' • ' + product.tag : '');
    if (dom.pdpDesc) dom.pdpDesc.textContent = product.description || product.desc || '';
    if (dom.pdpImg) {
      dom.pdpImg.src = product.img || 'images/placeholder.svg';
      dom.pdpImg.alt = product.title;
    }

    // Price (TTC + HT)
    if (dom.pdpPrice) {
      var ht = product.price_ht || (product.price / (1 + (product.vat || 0.2)));
      dom.pdpPrice.innerHTML = '<span class="pdp-price__ttc">' + formatPrice(product.price) + ' TTC</span>'
        + '<span class="pdp-price__ht">' + formatPrice(ht) + ' HT</span>';
    }

    // Specs table
    if (dom.pdpSpecs && product.specs) {
      var specsHtml = '<table class="pdp-specs">';
      Object.keys(product.specs).forEach(function (k) {
        specsHtml += '<tr><td>' + escapeHTML(k) + '</td><td>' + escapeHTML(product.specs[k]) + '</td></tr>';
      });
      specsHtml += '</table>';
      dom.pdpSpecs.innerHTML = specsHtml;
    } else if (dom.pdpSpecs) {
      dom.pdpSpecs.innerHTML = '';
    }

    // Add to cart — stays on page, no redirect
    if (dom.pdpQuote) {
      dom.pdpQuote.onclick = function () {
        addToCart(product);
      };
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

  // ── Router (hash-based SPA) ────────────────────────────────

  var ROUTES = ['/', '/catalogue', '/produit', '/devis', '/compte', '/auth'];

  function parseHash() {
    var hash = location.hash.replace(/^#/, '') || '/';
    if (hash.indexOf('/produit/') === 0) {
      return { route: '/produit', slug: hash.replace('/produit/', '') };
    }
    if (ROUTES.indexOf(hash) === -1) return { route: '/', slug: null };
    return { route: hash, slug: null };
  }

  function onRouteChange() {
    var parsed = parseHash();
    var route = parsed.route;

    // Auth guards
    var loggedIn = !!localStorage.getItem('pt_auth');
    if (route === '/compte' && !loggedIn) { location.hash = '#/auth'; return; }
    if (route === '/auth' && loggedIn) { location.hash = '#/compte'; return; }

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
      } else {
        dom.hero.classList.add('hero-out');
        dom.hero.style.display = 'none';
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
    }
  }

  // ── Hero logo scroll animation ─────────────────────────────

  function handleHeroScroll() {
    if (!dom.heroLogo || !dom.heroLogoContainer) return;
    if (parseHash().route !== '/') return;

    var y = window.scrollY;
    var threshold = 100;
    var maxScroll = 400;

    if (y < threshold) {
      dom.heroLogoContainer.className = 'hero-logo-container initial';
      dom.heroLogoContainer.style.setProperty('--scale-factor', '1');
      dom.heroLogoContainer.style.setProperty('--opacity-factor', '1');
    } else if (y >= maxScroll) {
      dom.heroLogoContainer.className = 'hero-logo-container hidden';
      dom.heroLogoContainer.style.setProperty('--scale-factor', '6');
      dom.heroLogoContainer.style.setProperty('--opacity-factor', '0');
    } else {
      var progress = (y - threshold) / (maxScroll - threshold);
      dom.heroLogoContainer.className = 'hero-logo-container scaling';
      dom.heroLogoContainer.style.setProperty('--scale-factor', String(1 + progress * 5));
      dom.heroLogoContainer.style.setProperty('--opacity-factor', String(1 - progress));
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

  // ── Auth (localStorage-based) ──────────────────────────────

  function getUsers() {
    try { return JSON.parse(localStorage.getItem('pt_users') || '{}'); }
    catch (_) { return {}; }
  }

  function saveUsers(users) {
    localStorage.setItem('pt_users', JSON.stringify(users));
  }

  function sha256(message) {
    var data = new TextEncoder().encode(message);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
    });
  }

  function handleRegister(e) {
    e.preventDefault();
    var name = (dom.regName ? dom.regName.value : '').trim();
    var email = (dom.regEmail ? dom.regEmail.value : '').trim().toLowerCase();
    var pwd = dom.regPwd ? dom.regPwd.value : '';

    if (!name || !email || !pwd) { toast('Remplissez tous les champs', 'error'); return; }
    if (pwd.length < 6) { toast('Mot de passe trop court (min. 6)', 'error'); return; }

    var users = getUsers();
    if (users[email]) { toast('Cet email est déjà utilisé', 'error'); return; }

    var salt = crypto.getRandomValues(new Uint8Array(16));
    var saltHex = Array.from(salt).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');

    sha256(saltHex + pwd).then(function (hash) {
      users[email] = { name: name, email: email, salt: saltHex, hash: hash };
      saveUsers(users);
      localStorage.setItem('pt_auth', email);
      toast('Compte créé', 'success');
      location.hash = '#/compte';
    });
  }

  function handleLogin(e) {
    e.preventDefault();
    var email = (dom.loginEmail ? dom.loginEmail.value : '').trim().toLowerCase();
    var pwd = dom.loginPwd ? dom.loginPwd.value : '';

    if (!email || !pwd) { toast('Remplissez tous les champs', 'error'); return; }

    var users = getUsers();
    var user = users[email];
    if (!user) { toast('Email inconnu', 'error'); return; }

    sha256(user.salt + pwd).then(function (hash) {
      if (hash !== user.hash) { toast('Mot de passe incorrect', 'error'); return; }
      localStorage.setItem('pt_auth', email);
      toast('Bienvenue, ' + user.name, 'success');
      location.hash = '#/compte';
    });
  }

  function showAuthTab(tab) {
    if (dom.authLoginTab) dom.authLoginTab.classList.toggle('active', tab === 'login');
    if (dom.authRegisterTab) dom.authRegisterTab.classList.toggle('active', tab === 'register');
    if (dom.authLogin) dom.authLogin.style.display = tab === 'login' ? '' : 'none';
    if (dom.authRegister) dom.authRegister.style.display = tab === 'register' ? '' : 'none';
  }

  // ── Account page ───────────────────────────────────────────

  function renderAccount() {
    var email = localStorage.getItem('pt_auth');
    if (!email) return;
    var users = getUsers();
    var user = users[email];
    if (!user) return;

    if (dom.accName) dom.accName.value = user.name || '';
    if (dom.accEmail) dom.accEmail.value = user.email || email;
    if (user.avatar && dom.accAvatarImg) dom.accAvatarImg.src = user.avatar;

    updateCartUI();

    // Loyalty meter
    if (dom.accSlider) {
      var loyalty = user.loyalty || 0;
      dom.accSlider.value = loyalty;
      updateLoyaltyBar(loyalty);
    }
  }

  function updateLoyaltyBar(val) {
    if (dom.accFill) dom.accFill.style.width = val + '%';
    if (dom.accCursor) dom.accCursor.style.left = val + '%';
  }

  function handleAccountSave(e) {
    e.preventDefault();
    var email = localStorage.getItem('pt_auth');
    if (!email) return;
    var users = getUsers();
    if (!users[email]) return;

    users[email].name = (dom.accName ? dom.accName.value : '').trim();
    var newEmail = (dom.accEmail ? dom.accEmail.value : '').trim().toLowerCase();
    if (newEmail && newEmail !== email) {
      users[newEmail] = users[email];
      users[newEmail].email = newEmail;
      delete users[email];
      localStorage.setItem('pt_auth', newEmail);
    }
    saveUsers(users);
    toast('Profil enregistré', 'success');
  }

  function handleAvatarChange(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      if (dom.accAvatarImg) dom.accAvatarImg.src = ev.target.result;
      var email = localStorage.getItem('pt_auth');
      if (email) {
        var users = getUsers();
        if (users[email]) {
          users[email].avatar = ev.target.result;
          saveUsers(users);
        }
      }
    };
    reader.readAsDataURL(file);
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

    // Scroll for hero animation (throttled via rAF)
    var scrollTicking = false;
    window.addEventListener('scroll', function () {
      if (!scrollTicking) {
        requestAnimationFrame(function () {
          handleHeroScroll();
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    }, { passive: true });

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

    // Loyalty slider
    if (dom.accSlider) {
      dom.accSlider.addEventListener('input', function () {
        updateLoyaltyBar(Number(this.value));
      });
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────

  function init() {
    cacheDom();
    bindEvents();
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
