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
    var brandNames = Object.keys(BRAND_IMAGES);
    dom.brandGrid.innerHTML = brandNames.map(function (b) {
      var img = BRAND_IMAGES[b];
      return '<button class="brand" data-brand="' + escapeHTML(b) + '">'
        + '<div class="brand__bubble"><img class="brand__logo" src="' + escapeHTML(img) + '" alt="' + escapeHTML(b) + '" loading="lazy"></div>'
        + '<span class="brand__label">' + escapeHTML(b) + '</span>'
        + '</button>';
    }).join('');

    $$('.brand', dom.brandGrid).forEach(function (btn) {
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

  // ── Scroll passthrough : laisse scroller la page quand le 3D est au zoom min ──

  function setupModelViewerScrollPassthrough(mv) {
    if (!mv) return;
    // Retire un éventuel ancien listener
    if (mv._wheelPassthrough) {
      mv.removeEventListener('wheel', mv._wheelPassthrough);
    }

    mv._wheelPassthrough = function (e) {
      // Si l'utilisateur scroll vers le bas (deltaY > 0) = dézoom
      // On vérifie si le model-viewer est déjà au champ de vision max (zoom min)
      try {
        var fov = mv.getFieldOfView();            // renvoie le FOV actuel en degrés
        var maxFov = parseFloat(mv.getAttribute('max-field-of-view')) || 50;
        // Tolérance de 0.5 degré pour éviter les flottants
        if (e.deltaY > 0 && fov >= maxFov - 0.5) {
          // Zoom déjà au minimum → on laisse passer le scroll à la page
          // On ne fait rien (pas de preventDefault), le navigateur scrolle la page
          return;
        }
        // Si l'utilisateur scroll vers le haut (deltaY < 0) = zoom in
        var minFov = parseFloat(mv.getAttribute('min-field-of-view')) || 15;
        if (e.deltaY < 0 && fov <= minFov + 0.5) {
          // Zoom déjà au maximum → on laisse passer le scroll à la page
          return;
        }
      } catch (_) {
        // getFieldOfView pas encore dispo (modèle pas chargé) → laisser passer
        return;
      }
      // Sinon le model-viewer gère le zoom normalement (pas besoin d'intervenir)
    };

    // Le listener doit être passif pour ne pas bloquer le scroll natif
    // Mais on doit aussi empêcher model-viewer de capturer le wheel quand on veut passer
    // → On intercepte en phase capture, et on désactive camera-controls temporairement
    mv._wheelCapture = function (e) {
      try {
        var fov = mv.getFieldOfView();
        var maxFov = parseFloat(mv.getAttribute('max-field-of-view')) || 50;
        var minFov = parseFloat(mv.getAttribute('min-field-of-view')) || 15;
        var atMin = (e.deltaY > 0 && fov >= maxFov - 0.5);
        var atMax = (e.deltaY < 0 && fov <= minFov + 0.5);
        if (atMin || atMax) {
          // Désactive temporairement le zoom du model-viewer
          // pour que le wheel event atteigne le scroll de la page
          mv.style.pointerEvents = 'none';
          requestAnimationFrame(function () {
            mv.style.pointerEvents = '';
          });
        }
      } catch (_) {}
    };

    mv.addEventListener('wheel', mv._wheelCapture, { capture: true, passive: true });
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
    var pdpHeroPin = document.getElementById('pdpHeroPin');
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
      heroScale: 1, heroTY: 0, heroOp: 1, heroBlur: 6,
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

      // ═══ 1. HERO (sticky dans un wrapper 200vh) ═══
      // Le scroll dans le wrapper pilote l'animation :
      //   0%  → titre en haut, 3D flouté
      //   100% → titre sorti en bas, 3D net + interactif
      // Puis le scroll continue normalement vers le reste de la page
      if (pdpHeroPin && pdpHero) {
        var heroH = pdpHero.offsetHeight || winH;
        // scrollTravel = espace de scroll bonus dans le wrapper (200vh - 100vh)
        var scrollTravel = pdpHeroPin.offsetHeight - heroH;
        // Distance scrollée depuis le haut du wrapper
        var pinTop = pdpHeroPin.offsetTop;
        var scrolledInPin = scrollY - pinTop;
        // hp = progression dans la zone d'animation (0→1)
        var hp = clamp(scrolledInPin / Math.max(scrollTravel, 1), 0, 1);
        var hpE = easeOut(hp);

        // ── Titre : descend depuis le haut vers le bas ──
        var titleTravel = heroH * 0.7;
        var tInfoTY = hpE * titleTravel;
        var tInfoOp = clamp(1 - hp * 1.3, 0, 1);
        var tInfoScale = 1 - hpE * 0.2;

        // ── 3D model : défloute au scroll ──
        var tBlur = 6 * (1 - hpE);
        var tScale = 1 + hpE * 0.06;
        var tOp = 1;

        // ── Activer interaction 3D quand titre est sorti ──
        if (viewer3d) {
          viewer3d.style.pointerEvents = hp > 0.85 ? '' : 'none';
        }

        // Lerp
        state.heroScale = lerp(state.heroScale, tScale, L);
        state.heroTY = lerp(state.heroTY, 0, L);
        state.heroOp = lerp(state.heroOp, tOp, L);
        state.heroBlur = lerp(state.heroBlur, tBlur, L);
        state.infoTY = lerp(state.infoTY, tInfoTY, L);
        state.infoOp = lerp(state.infoOp, tInfoOp, L);
        state.infoScale = lerp(state.infoScale, tInfoScale, L);

        applyTransform(viewer3d,
          'scale(' + state.heroScale.toFixed(4) + ')',
          state.heroOp,
          'blur(' + state.heroBlur.toFixed(2) + 'px)'
        );
        applyTransform(heroInfo,
          'translateY(' + state.infoTY.toFixed(2) + 'px) scale(' + state.infoScale.toFixed(4) + ')',
          state.infoOp
        );
        if (heroGradient) heroGradient.style.opacity = String(clamp(1 - hpE * 0.95, 0, 1));

        // Camera rotation douce au scroll
        var tCamOrbit = 25 + hpE * 35;
        var tCamPitch = 72 + hpE * 8;
        state.camOrbit = lerp(state.camOrbit, tCamOrbit, L * 0.6);
        state.camPitch = lerp(state.camPitch, tCamPitch, L * 0.6);
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

    // ── Start animation loop ──
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
      // Reset hero parallax transforms
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
        renderHomeProducts();
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
