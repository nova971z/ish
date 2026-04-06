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
      'accountForm','accSave','accName','accEmail','accPhone','accAddress',
      'accAvatar','accAvatarImg','accCartMiniTxt','accLogout','accHistory','accLoyaltyTxt',
      'accSlider','accFill','accCursor',
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

    // Save to order history
    var email = localStorage.getItem('pt_auth');
    if (email) {
      var key = 'pt_orders_' + email;
      var orders = [];
      try { orders = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
      orders.unshift({ date: Date.now(), items: items.length, total: total });
      localStorage.setItem(key, JSON.stringify(orders));

      // Add loyalty points (1 point per euro)
      var users = getUsers();
      if (users[email]) {
        users[email].loyalty = (users[email].loyalty || 0) + Math.round(total);
        saveUsers(users);
      }
    }
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
    var brandNames = Object.keys(BRAND_IMAGES);
    dom.brandGrid.innerHTML = brandNames.map(function (b, i) {
      var img = BRAND_IMAGES[b];
      return '<button class="brand-card" data-brand="' + escapeHTML(b) + '" style="animation-delay:' + (i * 70) + 'ms">'
        + '<div class="brand-card__ring">'
        + '<div class="brand-card__bubble">'
        + '<img class="brand-card__logo" src="' + escapeHTML(img) + '" alt="' + escapeHTML(b) + '" loading="lazy">'
        + '</div>'
        + '</div>'
        + '<span class="brand-card__name">' + escapeHTML(b) + '</span>'
        + '</button>';
    }).join('');

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

  function setupPlans() {
    var canvas = document.getElementById('plansCanvas');
    var amountEl = document.getElementById('plansAmount');
    var labelEl = document.getElementById('plansLabel');
    var detailEl = document.getElementById('planDetail');
    var orbs = document.querySelectorAll('.plan-orb');
    if (!canvas || !orbs.length) return;

    // Canvas state
    var ctx, W, H, PAD, gW, gH;
    var canvasReady = false;
    var currentSaving = 0;
    var lastStorePts = null, lastPiratePts = null;
    var hoverMonth = -1;
    var MONTHS = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];

    function initCanvas() {
      var dpr = window.devicePixelRatio || 1;
      var wrap = document.getElementById('plansChartGraph');
      if (!wrap) return;
      var rect = wrap.getBoundingClientRect();
      if (rect.width < 10) return;
      W = Math.round(rect.width);
      H = Math.round(rect.height);
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      PAD = { top: 10, right: 32, bottom: 16, left: 22 };
      gW = W - PAD.left - PAD.right;
      gH = H - PAD.top - PAD.bottom;
      canvasReady = true;
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        initCanvas();
        drawChart(0);
      });
    });

    var maxY = 6000;
    var storeMulti  = [0.9, 0.7, 1.0, 1.1, 1.3, 0.8, 0.6, 0.7, 1.2, 1.1, 1.0, 1.6];
    var pirateMulti = [0.8, 0.6, 1.1, 1.0, 1.4, 0.7, 0.5, 0.8, 1.3, 1.0, 0.9, 1.5];

    var PLAN_INFO = {
      basique: {
        name: 'Basique',
        desc: 'L\'essentiel pour demarrer. Acces a notre catalogue en ligne et tarifs reduits sur vos premieres commandes.',
        features: [
          { icon: '🏷️', text: '-10% sur le catalogue' },
          { icon: '📦', text: 'Livraison standard' },
          { icon: '📧', text: 'Support par email' }
        ],
        color: 'basique'
      },
      pro: {
        name: 'Pro',
        desc: 'Le choix des professionnels. Remises significatives, paiement flexible et conseiller dedie pour optimiser vos achats.',
        features: [
          { icon: '🏷️', text: '-25% sur le catalogue' },
          { icon: '💳', text: 'Paiement differe 30j' },
          { icon: '👤', text: 'Conseiller dedie' },
          { icon: '🚚', text: 'Livraison express' },
          { icon: '📊', text: 'Dashboard commandes' }
        ],
        color: 'pro'
      },
      gold: {
        name: 'Gold',
        desc: 'L\'experience premium. Tous les avantages Pro + communication digitale et fidelite renforcee pour booster votre activite.',
        features: [
          { icon: '🏷️', text: '-30% sur le catalogue' },
          { icon: '💳', text: 'Paiement differe 60j' },
          { icon: '👤', text: 'Conseiller prioritaire' },
          { icon: '🚚', text: 'Livraison gratuite' },
          { icon: '💎', text: 'Points fidelite x3' },
          { icon: '📱', text: 'Reseaux sociaux inclus' },
          { icon: '🎁', text: 'Ventes privees' }
        ],
        color: 'gold'
      },
      black: {
        name: 'Black Metal',
        desc: 'Le summum absolu. Tous nos services reunis, remises maximales, communication complete et acces VIP illimite.',
        features: [
          { icon: '🏷️', text: '-40% sur le catalogue' },
          { icon: '💳', text: 'Paiement differe 90j' },
          { icon: '👤', text: 'Account manager VIP' },
          { icon: '🚚', text: 'Livraison J+1 gratuite' },
          { icon: '💎', text: 'Points fidelite x5' },
          { icon: '📱', text: 'Communication 360\u00b0' },
          { icon: '🎁', text: 'Ventes privees exclusives' },
          { icon: '🌐', text: 'Site vitrine offert' },
          { icon: '📸', text: 'Contenu photo/video' },
          { icon: '🔥', text: 'Acces beta nouveautes' }
        ],
        color: 'black'
      }
    };

    function buildCumul(monthly, multi) {
      var pts = []; var sum = 0;
      for (var m = 0; m < 12; m++) {
        sum += monthly * multi[m];
        var x = PAD.left + (m / 11) * gW;
        var y = PAD.top + gH - (sum / maxY) * gH;
        pts.push({ x: x, y: y });
      }
      return pts;
    }

    // Smooth bezier through points
    function bezierPath(pts) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 0; i < pts.length - 1; i++) {
        var x0 = pts[i].x, y0 = pts[i].y;
        var x1 = pts[i + 1].x, y1 = pts[i + 1].y;
        var cpx = (x0 + x1) / 2;
        ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
      }
    }

    function drawSmooth(pts, color, width, glow) {
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 4; }
      ctx.beginPath();
      bezierPath(pts);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    function fillSmooth(pts, colorTop, colorBot) {
      var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + gH);
      grad.addColorStop(0, colorTop);
      grad.addColorStop(1, colorBot || 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.moveTo(pts[0].x, PAD.top + gH);
      bezierPath(pts);
      ctx.lineTo(pts[pts.length - 1].x, PAD.top + gH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Cumulative values for tooltip (not just points)
    function buildCumulValues(monthly, multi) {
      var vals = []; var sum = 0;
      for (var m = 0; m < 12; m++) { sum += monthly * multi[m]; vals.push(Math.round(sum)); }
      return vals;
    }

    function drawChart(saving, hovIdx) {
      if (!canvasReady) { initCanvas(); }
      if (!canvasReady) return;
      currentSaving = saving;
      ctx.clearRect(0, 0, W, H);

      var fnt = '-apple-system,system-ui,sans-serif';
      var baseY = PAD.top + gH;

      // Grid
      [2000, 4000, 6000].forEach(function (v) {
        var y = PAD.top + gH - (v / maxY) * gH;
        ctx.strokeStyle = 'rgba(255,255,255,.035)';
        ctx.lineWidth = .5;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.font = '500 6.5px ' + fnt;
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText((v / 1000) + 'k', PAD.left - 4, y);
      });

      // Bottom axis
      ctx.strokeStyle = 'rgba(255,255,255,.04)';
      ctx.lineWidth = .5;
      ctx.beginPath(); ctx.moveTo(PAD.left, baseY); ctx.lineTo(W - PAD.right, baseY); ctx.stroke();

      // Month labels
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = '500 5.5px ' + fnt;
      ['J','F','M','A','M','J','J','A','S','O','N','D'].forEach(function (l, i) {
        var isHov = (hovIdx === i && saving > 0);
        ctx.fillStyle = isHov ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.14)';
        if (isHov) ctx.font = '700 6px ' + fnt;
        ctx.fillText(l, PAD.left + (i / 11) * gW, baseY + 3);
        if (isHov) ctx.font = '500 5.5px ' + fnt;
      });

      if (saving === 0) {
        lastStorePts = null; lastPiratePts = null;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,.07)';
        ctx.font = '500 7px ' + fnt;
        ctx.fillText('Selectionnez un service', W / 2, H / 2 - 2);
        return;
      }

      var storePts = buildCumul(500, storeMulti);
      var pirateMonthly = (maxY - saving) / 12;
      var piratePts = buildCumul(pirateMonthly, pirateMulti);
      lastStorePts = storePts;
      lastPiratePts = piratePts;

      // Savings zone
      ctx.beginPath();
      bezierPath(storePts);
      ctx.lineTo(piratePts[piratePts.length - 1].x, piratePts[piratePts.length - 1].y);
      for (var j = piratePts.length - 1; j > 0; j--) {
        var cpx = (piratePts[j].x + piratePts[j - 1].x) / 2;
        ctx.bezierCurveTo(cpx, piratePts[j].y, cpx, piratePts[j - 1].y, piratePts[j - 1].x, piratePts[j - 1].y);
      }
      ctx.closePath();
      var diffGrad = ctx.createLinearGradient(0, PAD.top, 0, baseY);
      diffGrad.addColorStop(0, 'rgba(52,211,153,.05)');
      diffGrad.addColorStop(1, 'rgba(52,211,153,.01)');
      ctx.fillStyle = diffGrad;
      ctx.fill();

      // Area fills
      fillSmooth(storePts, 'rgba(239,68,68,.04)', 'rgba(239,68,68,0)');
      fillSmooth(piratePts, 'rgba(139,92,246,.08)', 'rgba(139,92,246,0)');

      // Lines
      drawSmooth(storePts, 'rgba(239,68,68,.3)', 1);
      drawSmooth(piratePts, '#8B5CF6', 1.2, 'rgba(139,92,246,.25)');

      // End dots
      var sl = storePts[11], pl = piratePts[11];
      ctx.beginPath(); ctx.arc(sl.x, sl.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239,68,68,.5)'; ctx.fill();
      ctx.shadowColor = 'rgba(139,92,246,.35)'; ctx.shadowBlur = 3;
      ctx.beginPath(); ctx.arc(pl.x, pl.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#8B5CF6'; ctx.fill();
      ctx.shadowBlur = 0;

      // End values
      var stTotal = Math.round(storePts.reduce(function (a, _, i) { return a + 500 * storeMulti[i]; }, 0));
      var piTotal = Math.round(maxY - saving);
      ctx.font = '600 6px ' + fnt;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(239,68,68,.35)';
      ctx.fillText(stTotal.toLocaleString('fr-FR') + '\u20ac', sl.x + 4, sl.y);
      ctx.fillStyle = 'rgba(139,92,246,.7)';
      ctx.fillText(piTotal.toLocaleString('fr-FR') + '\u20ac', pl.x + 4, pl.y);

      // ── Interactive cursor overlay ──
      if (typeof hovIdx === 'number' && hovIdx >= 0 && hovIdx < 12) {
        var hx = storePts[hovIdx].x;
        var sy = storePts[hovIdx].y;
        var py = piratePts[hovIdx].y;
        var storeVals = buildCumulValues(500, storeMulti);
        var pirateVals = buildCumulValues(pirateMonthly, pirateMulti);
        var sv = storeVals[hovIdx];
        var pv = pirateVals[hovIdx];
        var diff = sv - pv;

        // Vertical line — dashed, subtle
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        ctx.lineWidth = .5;
        ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, baseY); ctx.stroke();
        ctx.setLineDash([]);

        // Dots on curves
        ctx.beginPath(); ctx.arc(hx, sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = .5; ctx.stroke();

        ctx.shadowColor = 'rgba(139,92,246,.4)'; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(hx, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#8B5CF6'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = .5; ctx.stroke();
        ctx.shadowBlur = 0;

        // Tooltip bubble
        var tipW = 58, tipH = 30;
        var tipX = hx - tipW / 2;
        var tipY = Math.min(sy, py) - tipH - 6;
        // Keep inside canvas
        if (tipX < 2) tipX = 2;
        if (tipX + tipW > W - 2) tipX = W - tipW - 2;
        if (tipY < 2) tipY = 2;

        // Bubble background
        ctx.beginPath();
        var r = 4;
        ctx.moveTo(tipX + r, tipY);
        ctx.lineTo(tipX + tipW - r, tipY);
        ctx.quadraticCurveTo(tipX + tipW, tipY, tipX + tipW, tipY + r);
        ctx.lineTo(tipX + tipW, tipY + tipH - r);
        ctx.quadraticCurveTo(tipX + tipW, tipY + tipH, tipX + tipW - r, tipY + tipH);
        ctx.lineTo(tipX + r, tipY + tipH);
        ctx.quadraticCurveTo(tipX, tipY + tipH, tipX, tipY + tipH - r);
        ctx.lineTo(tipX, tipY + r);
        ctx.quadraticCurveTo(tipX, tipY, tipX + r, tipY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(15,12,25,.88)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(139,92,246,.2)';
        ctx.lineWidth = .5;
        ctx.stroke();

        // Tooltip text
        var cx = tipX + tipW / 2;
        ctx.textAlign = 'center';
        ctx.font = '700 5.5px ' + fnt;
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.textBaseline = 'top';
        ctx.fillText(MONTHS[hovIdx], cx, tipY + 3);

        ctx.font = '600 5px ' + fnt;
        ctx.fillStyle = 'rgba(239,68,68,.6)';
        ctx.fillText(sv.toLocaleString('fr-FR') + '\u20ac', cx, tipY + 11);

        ctx.fillStyle = '#8B5CF6';
        ctx.fillText(pv.toLocaleString('fr-FR') + '\u20ac', cx, tipY + 17.5);

        ctx.fillStyle = '#34d399';
        ctx.fillText('-' + diff.toLocaleString('fr-FR') + '\u20ac', cx, tipY + 24);
      }
    }

    orbs.forEach(function (orb) {
      orb.addEventListener('click', function () {
        var wasActive = orb.classList.contains('is-active');
        orbs.forEach(function (o) { o.classList.remove('is-active'); });

        if (wasActive) {
          drawChart(0);
          if (amountEl) amountEl.textContent = '';
          if (labelEl) labelEl.textContent = 'Comparaison annuelle';
          if (detailEl) { detailEl.className = 'plan-detail'; detailEl.innerHTML = ''; }
          return;
        }

        orb.classList.add('is-active');
        var saving = parseInt(orb.dataset.saving) || 0;
        var price = orb.dataset.price || '0';
        var plan = orb.dataset.plan || '';
        var info = PLAN_INFO[plan] || {};

        drawChart(saving);

        if (amountEl) amountEl.textContent = '-' + saving.toLocaleString('fr-FR') + ' \u20ac/an';
        if (labelEl) labelEl.textContent = (info.name || '') + ' \u2022 ' + price + '\u20ac/mois';
        if (detailEl && info.desc) {
          var featHtml = '';
          if (info.features && info.features.length) {
            featHtml = '<div class="plan-detail__features">';
            info.features.forEach(function(f) {
              featHtml += '<span class="plan-detail__feat"><span class="plan-detail__feat-icon">' + f.icon + '</span>' + f.text + '</span>';
            });
            featHtml += '</div>';
          }
          detailEl.className = 'plan-detail is-open plan-detail--' + (info.color || plan);
          detailEl.innerHTML = '<div class="plan-detail__inner">'
            + '<div class="plan-detail__name">' + (info.name || '') + '</div>'
            + '<div class="plan-detail__desc">' + info.desc + '</div>'
            + featHtml
            + '<span class="plan-detail__saving">' + price + ' \u20ac/mois \u2192 ' + saving.toLocaleString('fr-FR') + ' \u20ac economises/an</span>'
            + '<a href="#/abonnement/' + plan + '" class="plan-detail__cta plan-detail__cta--' + (info.color || plan) + '">Choisir ' + (info.name || '') + '</a>'
            + '</div>';
        }
      });
    });

    // ── Interactive cursor (touch + mouse) ──
    function getMonthFromX(clientX) {
      var rect = canvas.getBoundingClientRect();
      var x = clientX - rect.left;
      // Scale from display coords to canvas CSS coords
      var scale = W / rect.width;
      var cx = x * scale;
      // Find nearest month
      var idx = Math.round(((cx - PAD.left) / gW) * 11);
      return Math.max(0, Math.min(11, idx));
    }

    function handleHover(clientX) {
      if (currentSaving <= 0) return;
      var m = getMonthFromX(clientX);
      if (m !== hoverMonth) {
        hoverMonth = m;
        drawChart(currentSaving, hoverMonth);
      }
    }

    function handleLeave() {
      if (hoverMonth >= 0) {
        hoverMonth = -1;
        drawChart(currentSaving);
      }
    }

    // Mouse
    canvas.addEventListener('mousemove', function (e) { handleHover(e.clientX); });
    canvas.addEventListener('mouseleave', handleLeave);

    // Touch — slide finger across chart
    canvas.addEventListener('touchstart', function (e) {
      if (currentSaving <= 0) return;
      e.preventDefault();
      handleHover(e.touches[0].clientX);
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      if (currentSaving <= 0) return;
      e.preventDefault();
      handleHover(e.touches[0].clientX);
    }, { passive: false });
    canvas.addEventListener('touchend', function () {
      // Keep tooltip visible for 1.5s then fade
      setTimeout(handleLeave, 1500);
    });
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
    var loggedIn = !!localStorage.getItem('pt_auth');
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
    }
  }

  // ── Hero logo scroll animation (lerp 60fps) ────────────────

  var heroLerp = { scale: 1, opacity: 1 };
  var heroRAF = null;
  var HERO_LERP_SPEED = 0.1;

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

    // Lerp toward targets
    heroLerp.scale += (tScale - heroLerp.scale) * HERO_LERP_SPEED;
    heroLerp.opacity += (tOpacity - heroLerp.opacity) * HERO_LERP_SPEED;

    // Snap when close enough
    if (Math.abs(heroLerp.scale - tScale) < 0.001) heroLerp.scale = tScale;
    if (Math.abs(heroLerp.opacity - tOpacity) < 0.001) heroLerp.opacity = tOpacity;

    // Apply directly — no CSS transitions, pure GPU
    dom.heroLogoContainer.style.transform = 'scale(' + heroLerp.scale.toFixed(4) + ')';
    dom.heroLogoContainer.style.opacity = heroLerp.opacity.toFixed(4);

    // Toggle visibility when fully hidden
    if (heroLerp.opacity <= 0.001) {
      dom.heroLogoContainer.style.visibility = 'hidden';
      dom.heroLogoContainer.style.pointerEvents = 'none';
    } else {
      dom.heroLogoContainer.style.visibility = '';
      dom.heroLogoContainer.style.pointerEvents = '';
    }

    heroRAF = requestAnimationFrame(heroTick);
  }

  function startHeroLoop() {
    if (!heroRAF) {
      heroLerp.scale = 1;
      heroLerp.opacity = 1;
      heroRAF = requestAnimationFrame(heroTick);
    }
  }

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
    if (dom.accPhone) dom.accPhone.value = user.phone || '';
    if (dom.accAddress) dom.accAddress.value = user.address || '';
    if (user.avatar && dom.accAvatarImg) dom.accAvatarImg.src = user.avatar;

    updateCartUI();

    // Loyalty
    var loyalty = user.loyalty || 0;
    var pct = Math.min(loyalty / 10, 100);
    updateLoyaltyBar(pct);
    if (dom.accLoyaltyTxt) dom.accLoyaltyTxt.textContent = loyalty + ' points';

    // Order history
    renderOrderHistory(email);
  }

  function renderOrderHistory(email) {
    if (!dom.accHistory) return;
    var key = 'pt_orders_' + email;
    var orders = [];
    try { orders = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}

    if (orders.length === 0) {
      dom.accHistory.innerHTML = '<p style="opacity:.6;text-align:center;padding:.5rem 0">Aucun devis envoye pour le moment.</p>';
      return;
    }

    var html = '';
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      html += '<div style="background:rgba(139,92,246,.04);border:1px solid rgba(139,92,246,.12);border-radius:12px;padding:.8rem 1rem">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">'
        + '<strong style="font-size:.9rem">Devis #' + (orders.length - i) + '</strong>'
        + '<span style="font-size:.78rem;color:var(--muted)">' + formatReviewDate(o.date) + '</span>'
        + '</div>'
        + '<p style="font-size:.85rem;opacity:.8;margin:0">' + o.items + ' article' + (o.items > 1 ? 's' : '') + ' — ' + formatPrice(o.total) + '</p>'
        + '</div>';
    }
    dom.accHistory.innerHTML = html;
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
    users[email].phone = (dom.accPhone ? dom.accPhone.value : '').trim();
    users[email].address = (dom.accAddress ? dom.accAddress.value : '').trim();

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

  function handlePasswordChange(e) {
    e.preventDefault();
    var email = localStorage.getItem('pt_auth');
    if (!email) return;
    var users = getUsers();
    if (!users[email]) return;

    var current = dom.pwdCurrent ? dom.pwdCurrent.value : '';
    var newPwd = dom.pwdNew ? dom.pwdNew.value : '';
    var confirm = dom.pwdConfirm ? dom.pwdConfirm.value : '';

    if (!current || !newPwd || !confirm) { toast('Remplissez tous les champs', 'error'); return; }
    if (newPwd.length < 6) { toast('Min. 6 caractères', 'error'); return; }
    if (newPwd !== confirm) { toast('Les mots de passe ne correspondent pas', 'error'); return; }

    var user = users[email];
    sha256(user.salt + current).then(function (hash) {
      if (hash !== user.hash) { toast('Mot de passe actuel incorrect', 'error'); return; }

      var newSalt = crypto.getRandomValues(new Uint8Array(16));
      var newSaltHex = Array.from(newSalt).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');

      sha256(newSaltHex + newPwd).then(function (newHash) {
        users[email].salt = newSaltHex;
        users[email].hash = newHash;
        saveUsers(users);
        if (dom.pwdCurrent) dom.pwdCurrent.value = '';
        if (dom.pwdNew) dom.pwdNew.value = '';
        if (dom.pwdConfirm) dom.pwdConfirm.value = '';
        toast('Mot de passe modifié', 'success');
      });
    });
  }

  function handleLogout() {
    localStorage.removeItem('pt_auth');
    toast('Déconnecté', 'success');
    location.hash = '#/auth';
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
