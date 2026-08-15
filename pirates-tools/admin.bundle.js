/* GÉNÉRÉ par scripts/extraire-admin.js — bundle admin (chargé sur #/admin). NE PAS ÉDITER : source app.js. */
(function (A) {
"use strict";
function adminFetch(method, body) {
  var apiBase = A.apiBaseUrl();
  return A.adminAuthHeaders({ 'Content-Type': 'application/json' }).then(function (headers) {
    var opts = {
      method: method,
      headers: headers
    };
    if (body)
      opts.body = JSON.stringify(body);
    return fetch(apiBase + '/api/admin', opts);
  }).then(function (r) {
    return r.json().then(function (data) {
      if (!r.ok || !data.ok)
        throw new Error(data.error || 'HTTP ' + r.status);
      return data;
    });
  });
}

function loadAdminStats(force) {
  var el = document.getElementById('adminStats');
  if (!el)
    return;
  if (A._adminStatsLoaded && !force)
    return;
  A._adminStatsLoaded = true;
  el.innerHTML = '<p class="admin-loading">Chargement\u2026</p>';
  var params = A._adminStatsJours === 7 || A._adminStatsJours === 30 ? { jours: A._adminStatsJours } : null;
  A.adminGet('stats', params).then(function (data) {
    A._adminStatsDerniere = data;
    renderAdminStats(el, data.stats || {}, data.periode || null);
  }).catch(function (e) {
    el.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
  });
}

function renderAdminStats(el, s, periode) {
  var t = s.totals || {};
  var totalVisitors = (t.newVisitors || 0) + (t.returningVisitors || 0);
  var html = '';
  var pJours = periode && periode.jours;
  var libPeriode = pJours === 7 ? '7 derniers jours' : pJours === 30 ? '30 derniers jours' : 'depuis le début';
  var fenetre = periode && periode.du && periode.au ? ' \u2014 du ' + A.escapeHTML(periode.du) + ' au ' + A.escapeHTML(periode.au) : '';
  html += '<div class="stat-periode" role="group" aria-label="Période des statistiques">' + [
    [
      7,
      '7 jours'
    ],
    [
      30,
      '30 jours'
    ],
    [
      'total',
      'Depuis le début'
    ]
  ].map(function (o) {
    var actif = pJours === o[0] || o[0] === 'total' && pJours === 'total';
    return '<button type="button" class="cat-chip' + (actif ? ' active' : '') + '" data-stats-jours="' + o[0] + '">' + o[1] + '</button>';
  }).join('') + '<span class="stat-periode__fenetre">' + A.escapeHTML(libPeriode) + fenetre + '</span>' + '</div>';
  var serieJours = s.daily || [];
  function cleJourUTC(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function nvSurFenetre(fen) {
    var aujourdhui = cleJourUTC(Date.now());
    if (fen === 'auj') {
      var dA = serieJours.find(function (d) {
        return d.date === aujourdhui;
      });
      return dA ? dA.newVisitors || 0 : 0;
    }
    if (fen === '7j') {
      var borne = cleJourUTC(Date.now() - 6 * 86400000);
      return serieJours.reduce(function (somme, d) {
        return somme + (d.date >= borne && d.date <= aujourdhui ? d.newVisitors || 0 : 0);
      }, 0);
    }
    var hier = cleJourUTC(Date.now() - 86400000);
    var dH = serieJours.find(function (d) {
      return d.date === hier;
    });
    return dH ? dH.newVisitors || 0 : 0;
  }
  var nvFen = A._adminStatsNvFenetre;
  var nvLib = nvFen === 'auj' ? 'aujourd\u2019hui' : nvFen === '7j' ? '7 derniers jours' : 'hier (la veille)';
  var carteNouveaux = '<div class="stat-card">' + '<span class="stat-card__value">' + nvSurFenetre(nvFen) + '</span>' + '<span class="stat-card__label">Nouveaux visiteurs</span>' + '<span class="stat-card__sub">1re visite \xB7 ' + A.escapeHTML(nvLib) + '</span>' + '<span class="stat-mini" role="group" aria-label="Fenêtre des nouveaux visiteurs">' + [
    [
      'hier',
      'Hier'
    ],
    [
      'auj',
      'Auj.'
    ],
    [
      '7j',
      '7 j'
    ]
  ].map(function (o) {
    return '<button type="button" class="stat-mini__btn' + (nvFen === o[0] ? ' active' : '') + '" data-stats-nv="' + o[0] + '">' + o[1] + '</button>';
  }).join('') + '</span>' + '</div>';
  html += '<div class="stat-grid">' + A.statCard('Visites (sessions)', t.sessions || 0, libPeriode) + A.statCard('Pages vues', t.pageViews || 0, libPeriode) + A.statCard('Clics mesurés', t.clicks || 0, 'boutons suivis \xB7 ' + libPeriode) + A.statCard('Visiteurs uniques', totalVisitors, 'consentis \xB7 ' + libPeriode) + carteNouveaux + A.statCard('Récurrents', t.returningVisitors || 0, 'déjà venus \xB7 ' + libPeriode) + '</div>' + '<p class="stat-note">Mesure première partie : robots exclus, et seuls les visiteurs ayant accepté la mesure sont comptés \u2014 les vrais totaux sont donc supérieurs.</p>';
  html += '<div class="stat-cols">' + '<section class="stat-block"><h3 class="stat-block__title">Appareils</h3>' + A.barRows(s.devices) + '</section>' + '<section class="stat-block"><h3 class="stat-block__title">Sources de trafic</h3>' + A.barRows(s.sources) + '</section>' + '</div>';
  html += '<section class="stat-block"><h3 class="stat-block__title">Produits les plus consultés</h3>' + '<p class="stat-note">Compteurs cumulés depuis le début \u2014 non filtrés par la période.</p>';
  var prods = (s.products || []).filter(function (p) {
    return p.views || p.selects || p.addToCart;
  }).slice(0, 15);
  if (!prods.length) {
    html += '<p class="admin-empty">Aucune consultation enregistrée pour le moment.</p>';
  } else {
    html += '<table class="stat-table"><thead><tr><th>Produit</th><th>Vues fiche</th><th>Clics carte</th><th>Panier</th><th>Achats</th><th>Temps moy.</th></tr></thead><tbody>';
    prods.forEach(function (p) {
      html += '<tr>' + '<td>' + A.escapeHTML(A.productTitleByKey(p.productId)) + '</td>' + '<td>' + (p.views || 0) + '</td>' + '<td>' + (p.selects || 0) + '</td>' + '<td>' + (p.addToCart || 0) + '</td>' + '<td>' + (p.purchases || 0) + '</td>' + '<td>' + A.fmtDuration(p.avgTimeMs) + '</td>' + '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</section>';
  html += '<section class="stat-block"><h3 class="stat-block__title">Clics \u2014 sur quoi et combien de fois</h3>' + '<p class="stat-note">Compteurs cumulés depuis le début \u2014 non filtrés par la période.</p>';
  var clicks = (s.clicks || []).slice(0, 20);
  if (!clicks.length) {
    html += '<p class="admin-empty">Aucun clic instrumenté pour le moment.</p>';
  } else {
    var cmap = {};
    clicks.forEach(function (c) {
      cmap[c.label] = c.count;
    });
    html += A.barRows(cmap, { limit: 20 });
  }
  html += '</section>';
  html += '<section class="stat-block"><h3 class="stat-block__title">Provenance des visiteurs</h3>' + '<p class="stat-note">Pays vu par le réseau (peut différer du domicile réel) \u2014 cumulé depuis le début.</p>';
  var geo = s.geo || [];
  if (!geo.length) {
    html += '<p class="admin-empty">Aucune donnée géographique pour le moment.</p>';
  } else {
    html += '<div id="adminGlobe" class="admin-globe" aria-hidden="true"></div>';
    var gmap = {};
    geo.slice(0, 15).forEach(function (g) {
      gmap[A.countryName(g.country)] = g.count;
    });
    html += A.barRows(gmap, { limit: 15 });
  }
  html += '</section>';
  el.innerHTML = html;
  A.$$('[data-stats-jours]', el).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var v = btn.getAttribute('data-stats-jours');
      A._adminStatsJours = v === 'total' ? 'total' : Number(v);
      loadAdminStats(true);
    });
  });
  A.$$('[data-stats-nv]', el).forEach(function (btn) {
    btn.addEventListener('click', function () {
      A._adminStatsNvFenetre = btn.getAttribute('data-stats-nv');
      if (A._adminStatsDerniere) {
        renderAdminStats(el, A._adminStatsDerniere.stats || {}, A._adminStatsDerniere.periode || null);
      } else {
        loadAdminStats(true);
      }
    });
  });
  A.destroyAdminGlobe();
  if (geo.length) {
    var container = document.getElementById('adminGlobe');
    if (container)
      buildAdminGlobe(container, geo);
  }
}

function buildAdminGlobe(container, geo) {
  var pts = [];
  geo.forEach(function (g) {
    var lat = typeof g.lat === 'number' ? g.lat : A.COUNTRY_LATLNG[g.country] && A.COUNTRY_LATLNG[g.country][0];
    var lng = typeof g.lng === 'number' ? g.lng : A.COUNTRY_LATLNG[g.country] && A.COUNTRY_LATLNG[g.country][1];
    if (typeof lat === 'number' && typeof lng === 'number')
      pts.push({
        lat: lat,
        lng: lng,
        count: g.count || 1
      });
  });
  if (!pts.length)
    return;
  Promise.all([
    A.ensureThree(),
    A.loadCoastline()
  ]).then(function (r) {
    var THREE = r[0];
    var coast = r[1] || [];
    if (!document.body.contains(container))
      return;
    A.destroyAdminGlobe();
    var w = container.clientWidth || 320;
    var h = container.clientHeight || 320;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
      });
    } catch (_) {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0, 0);
    container.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.z = 3.15;
    var group = new THREE.Group();
    scene.add(group);
    var disposables = [];
    var R = 1;
    var sphereGeo = new THREE.SphereGeometry(R, 48, 48);
    var sphereMat = new THREE.MeshBasicMaterial({ color: 1313318 });
    group.add(new THREE.Mesh(sphereGeo, sphereMat));
    disposables.push(sphereGeo, sphereMat);
    if (coast.length) {
      var coastMat = new THREE.LineBasicMaterial({
        color: 10980346,
        transparent: true,
        opacity: 0.6
      });
      disposables.push(coastMat);
      coast.forEach(function (line) {
        var v = [];
        for (var k = 0; k < line.length; k++)
          v.push(A.latLngToVec3(THREE, line[k][1], line[k][0], R * 1.004));
        var g = new THREE.BufferGeometry().setFromPoints(v);
        disposables.push(g);
        group.add(new THREE.Line(g, coastMat));
      });
    }
    var gratMat = new THREE.LineBasicMaterial({
      color: 7166878,
      transparent: true,
      opacity: 0.1
    });
    disposables.push(gratMat);
    var lat, lng, ring, i;
    for (lat = -60; lat <= 60; lat += 30) {
      ring = [];
      for (i = 0; i <= 64; i++)
        ring.push(A.latLngToVec3(THREE, lat, i / 64 * 360 - 180, R * 1.001));
      var gr = new THREE.BufferGeometry().setFromPoints(ring);
      disposables.push(gr);
      group.add(new THREE.LineLoop(gr, gratMat));
    }
    for (lng = -150; lng < 180; lng += 30) {
      ring = [];
      for (i = 0; i <= 64; i++)
        ring.push(A.latLngToVec3(THREE, i / 64 * 180 - 90, lng, R * 1.001));
      var gm = new THREE.BufferGeometry().setFromPoints(ring);
      disposables.push(gm);
      group.add(new THREE.Line(gm, gratMat));
    }
    var maxCount = pts.reduce(function (m, p) {
      return Math.max(m, p.count);
    }, 1);
    var markGeo = new THREE.SphereGeometry(1, 12, 12);
    var markMat = new THREE.MeshBasicMaterial({ color: 15772668 });
    disposables.push(markGeo, markMat);
    pts.forEach(function (p) {
      var scale = 0.006 + 0.01 * Math.sqrt(p.count / maxCount);
      var v = A.latLngToVec3(THREE, p.lat, p.lng, R * 1.008);
      var m = new THREE.Mesh(markGeo, markMat);
      m.position.copy(v);
      m.scale.setScalar(scale);
      group.add(m);
      var halo = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({
        color: 15772668,
        transparent: true,
        opacity: 0.25
      }));
      halo.position.copy(v);
      halo.scale.setScalar(scale * 2.4);
      group.add(halo);
      disposables.push(halo.material);
    });
    group.rotation.x = 0.35;
    group.rotation.y = -Math.PI * 0.5;
    var dragging = false, lastX = 0, lastY = 0;
    var canvas = renderer.domElement;
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.style.cursor = 'grabbing';
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging)
        return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      group.rotation.y += dx * 0.006;
      group.rotation.x = Math.max(-1.2, Math.min(1.2, group.rotation.x + dy * 0.006));
    });
    function endDrag() {
      dragging = false;
      canvas.style.cursor = 'grab';
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    var raf = null;
    function animate() {
      if (!dragging)
        group.rotation.y += 0.0018;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
      if (A._adminGlobe)
        A._adminGlobe.raf = raf;
    }
    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () {
        var nw = container.clientWidth, nh = container.clientHeight;
        if (nw && nh) {
          renderer.setSize(nw, nh);
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
        }
      });
      ro.observe(container);
    }
    A._adminGlobe = {
      renderer: renderer,
      ro: ro,
      disposables: disposables,
      raf: null
    };
    animate();
  }).catch(function () {
  });
}

function sendAdminReport() {
  var btn = document.getElementById('adminReportBtn');
  var status = document.getElementById('adminReportStatus');
  if (btn)
    btn.disabled = true;
  if (status) {
    status.textContent = 'Envoi\u2026';
    status.className = 'admin-row__status';
  }
  var apiBase = A.apiBaseUrl();
  A.adminAuthHeaders({ 'Content-Type': 'application/json' }).then(function (headers) {
    return fetch(apiBase + '/api/cron-report', {
      method: 'POST',
      headers: headers,
      body: '{}'
    });
  }).then(function (r) {
    return r.json().then(function (j) {
      return {
        ok: r.ok,
        data: j
      };
    });
  }).then(function (res) {
    if (btn)
      btn.disabled = false;
    if (!status)
      return;
    if (res.ok && res.data.ok && res.data.sent) {
      status.textContent = '\u2713 Rapport envoyé (' + res.data.period + ')';
      status.className = 'admin-row__status admin-row__status--ok';
    } else {
      status.textContent = '\u2717 ' + (res.data && (res.data.mailError || res.data.error) || 'Échec');
      status.className = 'admin-row__status admin-row__status--err';
    }
  }).catch(function (e) {
    if (btn)
      btn.disabled = false;
    if (status) {
      status.textContent = '\u2717 ' + e.message;
      status.className = 'admin-row__status admin-row__status--err';
    }
  });
}

function loadAdminClients(force) {
  var el = document.getElementById('adminClients');
  if (!el)
    return;
  if (A._adminClientsLoaded && !force)
    return;
  A._adminClientsLoaded = true;
  el.innerHTML = '<p class="admin-loading">Chargement\u2026</p>';
  A.adminGet('clients').then(function (data) {
    renderAdminClients(el, data.clients || []);
  }).catch(function (e) {
    el.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
  });
}

function renderAdminClients(el, clients) {
  if (!clients.length) {
    el.innerHTML = '<p class="admin-empty">Aucun compte client pour le moment.</p>';
    return;
  }
  el.innerHTML = '<p class="admin-count">' + clients.length + ' client' + (clients.length > 1 ? 's' : '') + '</p>' + '<div class="client-cards">' + clients.map(function (c) {
    var initial = (c.name || c.email || '?').charAt(0).toUpperCase();
    var tier = c.loyalty && c.loyalty.tier ? c.loyalty.tier : '';
    var rows = '';
    if (c.email)
      rows += '<div class="client-card__row"><span>\u2709️</span> ' + A.escapeHTML(c.email) + '</div>';
    if (c.phone)
      rows += '<div class="client-card__row"><span>\uD83D\uDCDE</span> ' + A.escapeHTML(c.phone) + '</div>';
    if (c.address)
      rows += '<div class="client-card__row"><span>\uD83D\uDCCD</span> ' + A.escapeHTML(c.address) + '</div>';
    return '<article class="client-card">' + '<div class="client-card__head">' + '<span class="client-card__avatar">' + A.escapeHTML(initial) + '</span>' + '<div class="client-card__id">' + '<span class="client-card__name">' + A.escapeHTML(c.name || 'Sans nom') + '</span>' + (tier ? '<span class="client-card__tier">' + A.escapeHTML(tier) + '</span>' : '') + '</div></div>' + '<div class="client-card__body">' + rows + '</div>' + '<div class="client-card__foot">' + '<span>' + (c.orderCount || 0) + ' commande' + ((c.orderCount || 0) > 1 ? 's' : '') + '</span>' + (c.createdAt ? '<span>Inscrit le ' + A.escapeHTML(new Date(c.createdAt).toLocaleDateString('fr-FR')) + '</span>' : '') + '</div>' + '</article>';
  }).join('') + '</div>';
}

function comptaState() {
  try {
    return JSON.parse(localStorage.getItem(A.COMPTA_VEILLE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function comptaSetChecked(id) {
  var s = comptaState();
  s[id] = Date.now();
  try {
    localStorage.setItem(A.COMPTA_VEILLE_KEY, JSON.stringify(s));
  } catch (e) {
  }
}

function comptaCopy(text, btn) {
  function done() {
    A.toast('Texte copié \u2014 colle-le dans ton email / le formulaire', 'success');
    if (btn) {
      var o = btn.textContent;
      btn.textContent = '\u2713 Copié\xA0!';
      setTimeout(function () {
        btn.textContent = o;
      }, 1800);
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () {
      comptaFallbackCopy(text);
      done();
    });
  } else {
    comptaFallbackCopy(text);
    done();
  }
}

function comptaFallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch (e) {
  }
  document.body.removeChild(ta);
}

function renderAdminCompta() {
  var el = document.getElementById('adminComptaBody');
  if (!el)
    return;
  var st = comptaState();
  var now = Date.now();
  var html = '';
  html += '<p class="admin-hint">Ta page pour <b>voir tes comptes</b>, <b>calculer tes prix</b>, <b>demander les devis transport</b> et <b>garder les taxes à jour</b>. Une chose à la fois. \uD83D\uDC4D</p>';
  html += '<h2 class="admin-subtitle">\uD83D\uDCCA Synthèse comptable</h2>';
  html += '<div class="compta-actions" style="margin-bottom:8px"><button type="button" class="btn primary" id="comptaExportPdf">\uD83D\uDCC4 Exporter en PDF</button><button type="button" class="btn btn--ghost" id="comptaReloadAcc">\u21BB Rafraîchir</button></div>';
  html += '<div class="compta-actions compta-actions--danger">' + '<button type="button" class="btn acc-logout-btn" id="comptaRaz">\uD83D\uDDD1️ Remettre la comptabilité à zéro</button>' + '<span class="admin-hint" id="comptaRazEtat"></span></div>';
  html += '<div id="comptaReport"><p class="admin-loading">Chargement des comptes\u2026</p></div>';
  html += '<h2 class="admin-subtitle">\uD83D\uDD0C Diagnostic paiement</h2>';
  html += '<div class="compta-card">' + '<p class="compta-line">Vérifie que le site sait parler au fournisseur de paiement. ' + 'L\'appel est en <b>lecture seule</b> : il ne crée rien et ne débite rien.</p>' + '<div class="compta-actions">' + '<button type="button" class="btn primary" id="revolutPing">\uD83D\uDD0C Tester la connexion Revolut</button>' + '<button type="button" class="btn btn--ghost" id="revolutOrdre">\uD83E\uDDFE Créer une commande de test (30 \u20AC)</button>' + '<button type="button" class="btn btn--ghost" id="revolutWebhook">\uD83D\uDD14 Enregistrer le webhook</button>' + '<button type="button" class="btn btn--ghost" id="webhookSante">\uD83D\uDCE1 Le fournisseur nous parle-t-il ?</button>' + '<button type="button" class="btn btn--ghost" id="revolutRelire">\uD83D\uDD0D Relire la commande de test</button>' + '</div>' + '<p class="compta-line"><small>La commande de test est créée dans le <b>bac à sable</b>, ' + 'en fausse monnaie, et n\'apparaît pas dans ta comptabilité. 30 \u20AC et pas moins : ' + 'en dessous, le 3-D Secure est contourné et la carte de test \xAB échec \xBB réussirait.</small></p>' + '<div id="revolutPingOut" class="compta-calc-out"></div></div>';
  html += '<h2 class="admin-subtitle">\uD83E\uDDF7 Contrôle des paiements encaissés</h2>';
  html += '<div class="compta-card">' + '<p class="compta-line">Compare l\'argent <b>réellement encaissé</b> chez le fournisseur ' + 'à ce que le site a enregistré. S\'il manque quelque chose, c\'est un client qui a payé ' + 'et dont la commande n\'a jamais été créée.</p>' + '<div class="compta-actions">' + '<button type="button" class="btn primary" id="reconLancer">\uD83E\uDDF7 Vérifier les 7 derniers jours</button>' + '<button type="button" class="btn btn--ghost" id="reconLancer30">\uD83D\uDCC6 Les 30 derniers jours</button>' + '</div>' + '<p class="compta-line"><small>Lecture seule des deux côtés : rien n\'est créé, rien n\'est ' + 'modifié. Les paiements de <b>moins de 15 minutes</b> sont mis de côté \u2014 leur notification ' + 'est probablement encore en route.</small></p>' + '<div id="reconOut" class="compta-calc-out"></div></div>';
  html += '<h2 class="admin-subtitle">\uD83E\uDDEE Calculateur &amp; prix automatiques</h2>';
  html += '<div id="comptaCalc"><p class="admin-loading">Chargement de la config\u2026</p></div>';
  html += '<h2 class="admin-subtitle">\uD83D\uDCE6 Demander un devis transport</h2>';
  html += '<div class="compta-cards">';
  A.COMPTA_DEVIS.forEach(function (d) {
    html += '<article class="compta-card">' + '<h3 class="compta-card__title">' + A.escapeHTML(d.titre) + '</h3>' + '<p class="compta-line"><span class="compta-lbl">Pour quoi\xA0:</span> ' + A.escapeHTML(d.pour) + '</p>' + '<p class="compta-line"><span class="compta-lbl">Quand\xA0:</span> ' + A.escapeHTML(d.quand) + '</p>' + '<p class="compta-line"><span class="compta-lbl">Où\xA0:</span> ' + A.escapeHTML(d.ou) + '</p>' + '<ol class="compta-steps">' + d.etapes.map(function (s) {
      return '<li>' + A.escapeHTML(s) + '</li>';
    }).join('') + '</ol>' + '<div class="compta-actions">' + '<button type="button" class="btn primary compta-copy" data-copy="' + d.id + '">\uD83D\uDCCB Copier le texte de demande</button>' + '<a class="btn btn--ghost" href="' + A.escapeHTML(d.url) + '" target="_blank" rel="noopener">Ouvrir le site \u2197</a>' + '</div>' + '<pre class="compta-tpl" id="tpl-' + d.id + '">' + A.escapeHTML(d.texte) + '</pre>' + '</article>';
  });
  html += '</div>';
  html += '<h2 class="admin-subtitle" style="margin-top:1.6rem">\uD83C\uDFDB️ Veille des taxes officielles</h2>';
  html += '<p class="admin-hint">Rappels automatiques : quand une carte est <b>orange</b>, il faut vérifier le taux sur le site officiel puis cliquer <b>\xAB\xA0C\u2019est vérifié\xA0\xBB</b>. Elle repasse au vert jusqu\u2019à la prochaine fois.</p>';
  html += '<div class="compta-cards">';
  A.COMPTA_VEILLE.forEach(function (v) {
    var last = st[v.id] || 0;
    var due = last ? last + v.freqMois * 30 * 24 * 3600 * 1000 : 0;
    var todo = !last || now >= due;
    var when = due ? new Date(due).toLocaleDateString('fr-FR') : '\u2014';
    html += '<article class="compta-card' + (todo ? ' compta-card--todo' : '') + '">' + '<div class="compta-badge ' + (todo ? 'is-todo' : 'is-ok') + '">' + (todo ? '\u26A0️ À VÉRIFIER' : '\u2705 À jour') + '</div>' + '<h3 class="compta-card__title">' + A.escapeHTML(v.titre) + '</h3>' + '<p class="compta-line"><span class="compta-lbl">Fréquence\xA0:</span> tous les ' + v.freqMois + ' mois' + (last ? ' \xB7 prochaine\xA0: <b>' + when + '</b>' : ' \xB7 <b>jamais vérifié</b>') + '</p>' + '<ol class="compta-steps">' + v.etapes.map(function (s) {
      return '<li>' + A.escapeHTML(s) + '</li>';
    }).join('') + '</ol>' + '<div class="compta-actions">' + '<a class="btn btn--ghost" href="' + A.escapeHTML(v.url) + '" target="_blank" rel="noopener">Ouvrir le site officiel \u2197</a>' + '<button type="button" class="btn primary compta-check" data-check="' + v.id + '">\u2705 C\u2019est vérifié</button>' + '</div>' + '</article>';
  });
  html += '</div>';
  el.innerHTML = html;
  el.querySelectorAll('.compta-copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = A.COMPTA_DEVIS.filter(function (x) {
        return x.id === b.getAttribute('data-copy');
      })[0];
      if (d)
        comptaCopy(d.texte, b);
    });
  });
  el.querySelectorAll('.compta-check').forEach(function (b) {
    b.addEventListener('click', function () {
      comptaSetChecked(b.getAttribute('data-check'));
      A.toast('Noté comme vérifié \u2014 rappel programmé', 'success');
      renderAdminCompta();
    });
  });
  comptaLoadCalc();
  comptaLoadAccounting();
  var razBtn = document.getElementById('comptaRaz');
  var razEtat = document.getElementById('comptaRazEtat');
  if (razBtn)
    razBtn.addEventListener('click', function () {
      razBtn.disabled = true;
      razBtn.textContent = 'Comptage\u2026';
      A.adminPostType('raz-compta', {}).then(function (d) {
        var c = d && d.compte || {};
        var tot = Object.keys(c).reduce(function (s2, k) {
          return s2 + Math.max(0, c[k]);
        }, 0);
        razBtn.disabled = false;
        razBtn.textContent = '\uD83D\uDDD1️ Remettre la comptabilité à zéro';
        var detail = 'paiements ' + (c.payments || 0) + ' \xB7 charges ' + (c.charges || 0) + ' \xB7 avoirs ' + (c.refunds || 0) + ' \xB7 notifications ' + (c.stripe_events || 0);
        if (razEtat)
          razEtat.textContent = detail;
        if (!tot) {
          if (razEtat)
            razEtat.textContent = 'Rien à effacer : la comptabilité est déjà vide.';
          return;
        }
        if (!window.confirm('Remettre la comptabilité à ZÉRO ?\n\n' + tot + ' écriture(s) seront effacées DÉFINITIVEMENT :\n' + detail + '\n\nLes comptes clients et le catalogue ne sont PAS touchés.'))
          return;
        if (!window.confirm('Dernière confirmation : on efface les ' + tot + ' écriture(s) ?\n\n' + 'Cette action est irréversible.'))
          return;
        razBtn.disabled = true;
        razBtn.textContent = 'Suppression\u2026';
        return A.adminPostType('raz-compta', { confirmer: 'OUI' }).then(function (d2) {
          var e2 = d2 && d2.efface || {};
          var n = Object.keys(e2).reduce(function (s2, k) {
            return s2 + e2[k];
          }, 0);
          razBtn.disabled = false;
          razBtn.textContent = '\uD83D\uDDD1️ Remettre la comptabilité à zéro';
          if (razEtat)
            razEtat.textContent = n + ' écriture(s) effacée(s). Comptabilité remise à zéro.';
          renderAdminCompta();
        });
      }).catch(function (e) {
        razBtn.disabled = false;
        razBtn.textContent = '\uD83D\uDDD1️ Remettre la comptabilité à zéro';
        if (razEtat)
          razEtat.textContent = 'Échec : ' + (e && e.message || 'erreur');
      });
    });
  var pdfBtn = document.getElementById('comptaExportPdf');
  if (pdfBtn)
    pdfBtn.onclick = function () {
      window.print();
    };
  var reloadBtn = document.getElementById('comptaReloadAcc');
  if (reloadBtn)
    reloadBtn.onclick = function () {
      comptaLoadAccounting();
    };
  comptaBrancherPing();
  comptaBrancherReconciliation();
}

function comptaBrancherReconciliation() {
  var out = document.getElementById('reconOut');
  if (!out)
    return;
  var b7 = document.getElementById('reconLancer');
  var b30 = document.getElementById('reconLancer30');
  function lancer(jours) {
    if (b7)
      b7.disabled = true;
    if (b30)
      b30.disabled = true;
    out.innerHTML = '<p class="admin-loading">Comparaison en cours sur ' + jours + ' jours\u2026</p>';
    A.adminGet('reconciliation', { jours: jours }).then(function (d) {
      if (b7)
        b7.disabled = false;
      if (b30)
        b30.disabled = false;
      if (!d || !d.ok) {
        out.innerHTML = '<p class="admin-error"><b>\u26A0️ Le contrôle n\'a pas tourné \u2014 ' + A.escapeHTML(String(d && d.erreur || 'raison inconnue')) + '</b><br>' + A.escapeHTML(String(d && d.avertissement || 'Ce n\'est PAS \xAB aucun problème \xBB : c\'est \xAB on ne sait pas \xBB. À relancer.')) + '</p>';
        return;
      }
      var c = d.comptes || {};
      var faux = d.modeTest === true;
      var pied = '<div class="compta-res__brk">' + '<span>Fournisseur : <b>' + A.escapeHTML(String(d.fournisseur || '')) + '</b></span>' + '<span>Registre : <b>' + (faux ? 'TEST \u2014 fausse monnaie' : d.modeTest === false ? 'RÉEL \u2014 argent véritable' : '\u26A0️ indéterminé') + '</b></span>' + '<span>Encaissements examinés : ' + A.escapeHTML(String(c.examines)) + '</span>' + '<span>Déjà enregistrés : ' + A.escapeHTML(String(c.dejaTraites)) + '</span>' + '<span>Trop récents pour conclure : ' + A.escapeHTML(String(c.tropRecents)) + '</span>' + '</div>';
      var orph = d.orphelins || [];
      if (!orph.length) {
        out.innerHTML = '<div class="compta-res">' + '<div class="compta-res__price" style="font-size:1.1rem">\u2705 Tout est enregistré</div>' + pied + '</div>';
        return;
      }
      var somme = 0;
      var lignes = '';
      orph.forEach(function (o) {
        var cents = typeof o.montantCents === 'number' ? o.montantCents : 0;
        somme += cents;
        lignes += '<p class="compta-line"><b>' + A.escapeHTML(String(o.id || '?')) + '</b> \u2014 ' + A.escapeHTML(A.formatPrice(cents / 100)) + (o.creeAMs ? ' \u2014 ' + A.escapeHTML(new Date(o.creeAMs).toLocaleString('fr-FR')) : '') + '</p>';
      });
      if (faux) {
        out.innerHTML = '<div class="compta-res">' + '<div class="compta-res__price" style="font-size:1.05rem">\uD83E\uDDEA ' + orph.length + ' paiement(s) de TEST non enregistré(s) \u2014 ' + A.escapeHTML(A.formatPrice(somme / 100)) + ' de fausse monnaie</div>' + '<p class="compta-line"><b>Personne n\'attend</b> : ce sont des essais, pas des ' + 'ventes. Aucun euro réel n\'est en jeu et il n\'y a rien à traiter. ' + 'Ils resteront listés ici tant que le registre de test ne sera pas remis à zéro ' + 'chez le fournisseur \u2014 c\'est normal.</p>' + lignes + pied + '</div>';
        return;
      }
      out.innerHTML = '<p class="admin-error"><b>\u26D4 ' + orph.length + ' paiement(s) encaissé(s) ' + 'SANS commande enregistrée \u2014 ' + A.escapeHTML(A.formatPrice(somme / 100)) + '</b><br>' + (d.modeTest === null ? '\u26A0️ Le registre n\'a pas pu être identifié (clé au format inattendu) : on ' + 'traite ces lignes comme de l\'argent RÉEL, par prudence.<br>' : '') + 'Un client a payé et attend. À traiter à la main : retrouver la référence chez le ' + 'fournisseur, créer la commande, puis le prévenir.</p>' + lignes + pied;
    }).catch(function (e) {
      if (b7)
        b7.disabled = false;
      if (b30)
        b30.disabled = false;
      out.innerHTML = '<p class="admin-error"><b>\u26A0️ Le contrôle n\'a pas tourné \u2014 ' + A.escapeHTML(e.message || String(e)) + '</b><br>Ce n\'est PAS \xAB aucun problème \xBB : ' + 'c\'est \xAB on ne sait pas \xBB. À relancer.</p>';
    });
  }
  if (b7)
    b7.onclick = function () {
      lancer(7);
    };
  if (b30)
    b30.onclick = function () {
      lancer(30);
    };
}

function comptaBrancherOrdreTest(out) {
  var b = document.getElementById('revolutOrdre');
  if (!b || !out)
    return;
  b.onclick = function () {
    b.disabled = true;
    out.innerHTML = '<p class="admin-loading">Création de la commande\u2026</p>';
    A.adminGet('revolut-commande-test').then(function (d) {
      b.disabled = false;
      if (!d || !d.ok) {
        out.innerHTML = '<p class="admin-error"><b>\u274C Étape \xAB ' + A.escapeHTML(String(d && d.etape || '?')) + ' \xBB \u2014 ' + A.escapeHTML(String(d && d.erreur || 'raison inconnue')) + '</b>' + (d && d.indice ? '<br>\uD83D\uDC49 ' + A.escapeHTML(String(d.indice)) : '') + '</p>';
        return;
      }
      var url = String(d.urlPaiement || '');
      A._revolutDerniereCommande = String(d.id || '') || null;
      out.innerHTML = '<div class="compta-res">' + '<div class="compta-res__price" style="font-size:1.1rem">\u2705 Commande créée \u2014 ' + A.escapeHTML(String(d.montant || '')) + '</div>' + '<div class="compta-res__brk">' + '<span>Référence : <b>' + A.escapeHTML(String(d.id || '')) + '</b></span>' + '</div>' + (url ? '<div class="lv-cta" style="margin-top:.6rem">' + '<a class="btn primary" href="' + A.escapeHTML(url) + '" target="_blank" rel="noopener">' + '\uD83D\uDCB3 Ouvrir la page de paiement</a></div>' + '<p class="compta-line"><small>Carte de test : <b>4929 4205 7359 5709</b> \xB7 ' + 'n\'importe quel CVV à 3 chiffres \xB7 n\'importe quelle date future.</small></p>' : '<p class="admin-error">Aucune URL de paiement renvoyée.</p>') + '</div>';
    }).catch(function (e) {
      b.disabled = false;
      out.innerHTML = '<p class="admin-error">\u274C ' + A.escapeHTML(e.message || String(e)) + '</p>';
    });
  };
}

function comptaBrancherWebhook(out) {
  var b = document.getElementById('revolutWebhook');
  if (!b || !out)
    return;
  b.onclick = function () {
    b.disabled = true;
    out.innerHTML = '<p class="admin-loading">Enregistrement du webhook\u2026</p>';
    A.adminGet('revolut-webhook').then(function (d) {
      b.disabled = false;
      if (!d || !d.ok) {
        out.innerHTML = '<p class="admin-error"><b>\u274C Étape \xAB ' + A.escapeHTML(String(d && d.etape || '?')) + ' \xBB \u2014 ' + A.escapeHTML(String(d && d.erreur || 'raison inconnue')) + '</b>' + (d && d.indice ? '<br>\uD83D\uDC49 ' + A.escapeHTML(String(d.indice)) : '') + '</p>';
        return;
      }
      var html = '<div class="compta-res">' + '<div class="compta-res__price" style="font-size:1.05rem">' + (d.etape === 'existant' ? '\u2705 Webhook déjà en place' : '\u2705 Webhook enregistré') + '</div>' + '<div class="compta-res__brk"><span>Adresse : <b>' + A.escapeHTML(String(d.url || '')) + '</b></span></div>';
      if (d.secretSignature) {
        html += '<p class="compta-line"><b>\u26A0️ Copie ce secret MAINTENANT \u2014 il ne sera plus jamais affiché.</b></p>' + '<input type="text" readonly aria-label="Secret de signature du webhook"' + ' style="width:100%;font-family:monospace;padding:.5rem;border-radius:6px"' + ' value="' + A.escapeHTML(String(d.secretSignature)) + '" onclick="this.select()">' + '<p class="compta-line">' + A.escapeHTML(String(d.aFaire || '')) + '</p>';
      } else if (d.rappel) {
        html += '<p class="compta-line">' + A.escapeHTML(String(d.rappel)) + '</p>';
      }
      out.innerHTML = html + '</div>';
    }).catch(function (e) {
      b.disabled = false;
      out.innerHTML = '<p class="admin-error">\u274C ' + A.escapeHTML(e.message || String(e)) + '</p>';
    });
  };
}

function comptaBrancherRelire(out) {
  var b = document.getElementById('revolutRelire');
  if (!b || !out)
    return;
  b.onclick = function () {
    if (!A._revolutDerniereCommande) {
      out.innerHTML = '<p class="admin-error">Crée d\'abord une commande de test, ' + 'puis paie-la \u2014 c\'est elle qu\'on relira.</p>';
      return;
    }
    b.disabled = true;
    out.innerHTML = '<p class="admin-loading">Relecture chez Revolut\u2026</p>';
    A.adminGet('revolut-relire', { id: A._revolutDerniereCommande }).then(function (d) {
      b.disabled = false;
      if (!d || !d.ok) {
        out.innerHTML = '<p class="admin-error">\u274C ' + A.escapeHTML(String(d && d.erreur || 'raison inconnue')) + '</p>';
        return;
      }
      var okCom = d.commissionLue;
      out.innerHTML = '<div class="compta-res">' + '<div class="compta-res__price" style="font-size:1.05rem">' + (okCom ? '\u2705 Commande relue, commission lue' : '\u26A0️ Commande relue, commission INTROUVABLE') + '</div>' + '<div class="compta-res__brk">' + '<span>État : <b>' + A.escapeHTML(String(d.etat)) + '</b> (' + A.escapeHTML(String(d.etatBrut)) + ')</span>' + '<span>Montant : <b>' + A.escapeHTML(A.formatPrice((d.montantCents || 0) / 100)) + '</b></span>' + '<span>Commission réelle : <b>' + (okCom ? A.escapeHTML(A.formatPrice(d.commissionCents / 100)) : '\u2014 non lue \u2014') + '</b></span>' + '<span>Carte : ' + A.escapeHTML(String(d.marqueCarte || '?')) + ' (' + A.escapeHTML(String(d.paysCarte || '?')) + ')</span>' + '<span>Coordonnées reçues : ' + (d.aEmail ? 'e-mail \u2705' : 'e-mail \u274C') + ' \xB7 ' + (d.aNom ? 'nom \u2705' : 'nom \u274C') + ' \xB7 ' + (d.aAdresse ? 'adresse \u2705' : 'adresse \u274C') + '</span>' + '<span>Code postal retrouvé : <b>' + (d.codePostalRetrouve ? '\u2705 identique à l\'envoi' : '\u274C PERDU') + '</b></span>' + '<span>Données rattachées : ' + A.escapeHTML((d.metadataVues || []).join(', ') || 'aucune') + '</span>' + '</div>' + (okCom ? '' : '<p class="compta-line"><b>\u26A0️ Sans commission réelle, la marge de ' + 'chaque vente serait fausse.</b> Ne bascule pas tant que ce point n\'est pas ' + 'vert : envoie-moi cet écran.</p>') + (d.codePostalRetrouve ? '' : '<p class="compta-line"><b>\u26D4 Le code postal n\'est ' + 'pas revenu.</b> Le contrôle fiscal compare le territoire déclaré au code ' + 'postal réellement collecté : sans lui, il ne compare plus rien et ne ' + 'signalera JAMAIS d\'erreur de taxe. Ne bascule pas \u2014 envoie-moi cet écran.</p>') + '</div>';
    }).catch(function (e) {
      b.disabled = false;
      out.innerHTML = '<p class="admin-error">\u274C ' + A.escapeHTML(e.message || String(e)) + '</p>';
    });
  };
}

function comptaBrancherSante(out) {
  var b = document.getElementById('webhookSante');
  if (!b || !out)
    return;
  function ilYA(ms) {
    if (!ms)
      return '\u2014';
    var d = Math.max(0, Date.now() - ms);
    if (d < 60000)
      return 'il y a moins d\'une minute';
    if (d < 3600000)
      return 'il y a ' + Math.round(d / 60000) + ' min';
    if (d < 86400000)
      return 'il y a ' + Math.round(d / 3600000) + ' h';
    return 'le ' + new Date(ms).toLocaleString('fr-FR');
  }
  b.onclick = function () {
    b.disabled = true;
    out.innerHTML = '<p class="admin-loading">Lecture du journal des notifications\u2026</p>';
    A.adminGet('webhook-sante').then(function (d) {
      b.disabled = false;
      if (d.jamaisRecu) {
        out.innerHTML = '<p class="admin-error"><b>\uD83D\uDCE1 Aucune notification n\'est JAMAIS arrivée.</b><br>' + 'Le fournisseur ne nous a pas encore parlé. Soit le webhook n\'est pas enregistré ' + 'chez lui, soit son adresse ne pointe pas sur ce site, soit aucun paiement n\'a ' + 'encore eu lieu depuis son enregistrement.</p>';
        return;
      }
      var refusActuel = d.dernierRefusMs && (!d.dernierAccepteMs || d.dernierRefusMs > d.dernierAccepteMs);
      var pied = '<div class="compta-res__brk">' + '<span>Fournisseur : <b>' + A.escapeHTML(String(d.fournisseur || '?')) + '</b></span>' + '<span>Reçues : ' + A.escapeHTML(String(d.recus)) + '</span>' + '<span>Acceptées : ' + A.escapeHTML(String(d.acceptes)) + '</span>' + '<span>Refusées : ' + A.escapeHTML(String(d.refuses)) + '</span>' + '</div>';
      if (refusActuel) {
        var motif = String(d.dernierRefusMotif || 'inconnu');
        var quoiFaire;
        if (/absente|absent/i.test(motif)) {
          quoiFaire = 'Une <b>clé manque sur Vercel</b> pour le fournisseur qui nous écrit. ' + 'Ce n\'est PAS un problème de signature : ne touche pas au webhook côté ' + 'Revolut, tu perdrais son secret. Pose la variable que le motif nomme, ' + 'puis redéploie.';
        } else if (/signature|invalide|invalid/i.test(motif)) {
          quoiFaire = 'Le fournisseur nous parle bien, mais nous ne le reconnaissons pas : ' + 'le secret de signature posé sur Vercel ne correspond pas à celui du webhook ' + 'enregistré chez lui. Supprime le webhook côté Revolut, recrée-le avec le ' + 'bouton ci-dessus, et repose le nouveau secret.';
        } else {
          quoiFaire = 'Lis le motif ci-dessus : il dit précisément ce qui bloque. ' + 'Ne supprime rien tant que tu ne l\'as pas compris.';
        }
        out.innerHTML = '<p class="admin-error"><b>\u26D4 La dernière notification a été REFUSÉE (' + A.escapeHTML(ilYA(d.dernierRefusMs)) + ').</b><br>' + 'Motif : <b>' + A.escapeHTML(motif) + '</b><br>' + quoiFaire + '<br>Tant que c\'est le cas, <b>aucune vente ne sera ' + 'enregistrée</b>.</p>' + pied;
        return;
      }
      out.innerHTML = '<div class="compta-res">' + '<div class="compta-res__price" style="font-size:1.05rem">\u2705 Notifications reçues et acceptées</div>' + '<p class="compta-line">Dernière acceptée ' + A.escapeHTML(ilYA(d.dernierAccepteMs)) + (d.dernierGenre ? ' \u2014 événement : <b>' + A.escapeHTML(String(d.dernierGenre)) + '</b>' : '') + '.</p>' + (d.refuses ? '<p class="compta-line"><small>\u26A0️ ' + A.escapeHTML(String(d.refuses)) + ' refus plus ancien(s), déjà réglé(s) : dernier ' + A.escapeHTML(ilYA(d.dernierRefusMs)) + '.</small></p>' : '') + pied + '</div>';
    }).catch(function (e) {
      b.disabled = false;
      out.innerHTML = '<p class="admin-error">\u274C ' + A.escapeHTML(e.message || String(e)) + '</p>';
    });
  };
}

function comptaBrancherPing() {
  var btn = document.getElementById('revolutPing');
  var out = document.getElementById('revolutPingOut');
  if (!btn || !out)
    return;
  comptaBrancherOrdreTest(out);
  comptaBrancherWebhook(out);
  comptaBrancherSante(out);
  comptaBrancherRelire(out);
  btn.onclick = function () {
    btn.disabled = true;
    out.innerHTML = '<p class="admin-loading">Appel de Revolut\u2026</p>';
    A.adminGet('revolut-ping').then(function (d) {
      btn.disabled = false;
      if (d && d.ok) {
        out.innerHTML = '<div class="compta-res">' + '<div class="compta-res__price" style="font-size:1.1rem">\u2705 Revolut répond</div>' + '<div class="compta-res__brk">' + '<span>Environnement : <b>' + A.escapeHTML(String(d.base || '')) + '</b></span>' + '<span>Fournisseur actif : <b>' + A.escapeHTML(String(d.fournisseurActif || '')) + '</b></span>' + '<span>Longueur de la clé : ' + A.escapeHTML(String(d.longueurCle)) + ' caractères</span>' + '<span>Commandes sur 24 h : ' + A.escapeHTML(String(d.ordresDernieres24h)) + '</span>' + '</div></div>';
        return;
      }
      out.innerHTML = '<p class="admin-error"><b>\u274C Étape \xAB ' + A.escapeHTML(String(d && d.etape || '?')) + ' \xBB \u2014 ' + A.escapeHTML(String(d && d.erreur || 'raison inconnue')) + '</b>' + (d && d.indice ? '<br>\uD83D\uDC49 ' + A.escapeHTML(String(d.indice)) : '') + (d && d.longueurCle != null ? '<br><small>Longueur de la clé lue : ' + A.escapeHTML(String(d.longueurCle)) + ' caractères (0 = variable absente)</small>' : '') + '</p>';
    }).catch(function (e) {
      btn.disabled = false;
      out.innerHTML = '<p class="admin-error">\u274C ' + A.escapeHTML(e.message || String(e)) + '</p>';
    });
  };
}

function comptaLoadAccounting() {
  var box = document.getElementById('comptaReport');
  if (!box)
    return;
  box.innerHTML = '<p class="admin-loading">Chargement des comptes\u2026</p>';
  A.adminGet('accounting').then(function (data) {
    comptaRenderAccounting(box, data.accounting || {}, data.charges || [], data.refunds || []);
  }).catch(function (e) {
    box.innerHTML = '<p class="admin-error">Comptes indisponibles : ' + A.escapeHTML(e.message) + '<br><span class="admin-hint">(nécessite FIREBASE_SERVICE_ACCOUNT sur Vercel)</span></p>';
  });
}

function comptaChargesHtml(charges, eur) {
  var html = '<h3 class="compta-card__title" style="margin-top:1.4rem">Enregistrer une charge</h3>' + '<div class="compta-card"><div class="compta-cfg-grid">' + '<label>Type<select id="chgCat"><option value="transport">Transport / envois</option><option value="octroi">Octroi de mer</option><option value="achat">Achat marchandise (hors ventes)</option><option value="cfe">CFE</option><option value="assurance">Assurance</option><option value="banque">Frais bancaires</option><option value="autre">Autre</option></select></label>' + '<label>Libellé<input type="text" id="chgLabel" placeholder="ex. Colissimo mars"></label>' + '<label>Montant HT (\u20AC)<input type="number" id="chgAmount" step="0.01"></label>' + '</div>' + '<div class="compta-actions"><button type="button" class="btn primary" id="chgAdd">\uFF0B Ajouter la charge</button></div></div>';
  if (!charges || !charges.length)
    return html;
  html += '<h3 class="compta-card__title" style="margin-top:1rem">Charges enregistrées</h3><table class="compta-table">';
  charges.forEach(function (c) {
    var dt = c.dateMs ? new Date(c.dateMs).toLocaleDateString('fr-FR') : '';
    html += '<tr><td>' + A.escapeHTML(c.category) + (c.label ? ' \u2014 ' + A.escapeHTML(c.label) : '') + '<br><small style="opacity:.6">' + dt + '</small></td>' + '<td class="compta-num">' + eur(c.amountHt) + '</td>' + '<td><button type="button" class="btn btn--ghost compta-chg-del" data-id="' + A.escapeHTML(c.id) + '">\u2715</button></td></tr>';
  });
  return html + '</table>';
}

function comptaBrancherCharges(box) {
  var addBtn = document.getElementById('chgAdd');
  if (addBtn)
    addBtn.onclick = function () {
      var amount = parseFloat(document.getElementById('chgAmount').value);
      if (!(amount > 0)) {
        A.toast('Entre un montant HT valide', 'error');
        return;
      }
      addBtn.disabled = true;
      A.adminPostType('charge', {
        category: document.getElementById('chgCat').value,
        label: document.getElementById('chgLabel').value,
        amountHt: amount,
        dateMs: Date.now()
      }).then(function () {
        A.toast('Charge enregistrée', 'success');
        comptaLoadAccounting();
      }).catch(function (e) {
        A.toast('Erreur : ' + e.message, 'error');
        addBtn.disabled = false;
      });
    };
  box.querySelectorAll('.compta-chg-del').forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute('data-id');
      A.adminAuthHeaders().then(function (h) {
        return fetch(A.apiBaseUrl() + '/api/admin?type=charge&id=' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: h
        });
      }).then(function (r) {
        return r.json();
      }).then(function () {
        A.toast('Charge supprimée', 'success');
        comptaLoadAccounting();
      }).catch(function (e) {
        A.toast('Erreur : ' + e.message, 'error');
      });
    };
  });
}

function comptaRemboursementsHtml(refunds, eur) {
  var html = '<h3 class="compta-card__title" style="margin-top:1.4rem">Enregistrer un remboursement</h3>' + '<div class="compta-card">' + '<p class="compta-line">Un remboursement <b>annule une vente</b> : il retire du chiffre d\'affaires et de la TVA collectée. Ne le saisis jamais comme une charge.</p>' + '<div class="compta-cfg-grid">' + '<label>Montant remboursé TTC (\u20AC)<input type="number" id="rfAmount" step="0.01" placeholder="ce qui est reparti chez le client"></label>' + '<label>Référence de l\'avoir<input type="text" id="rfAvoir" placeholder="ex. AV-2026-001"></label>' + '<label>Coût d\'achat annulé HT (\u20AC)<input type="number" id="rfCogs" step="0.01" value="0" placeholder="0 si l\'outil est déjà commandé"></label>' + '<label>Commission d\'encaissement rendue (\u20AC)<input type="number" id="rfFee" step="0.01" value="0" placeholder="0 si le fournisseur ne rend rien"></label>' + '<label>Motif (sans nom de client)<input type="text" id="rfLabel" placeholder="ex. promo fournisseur terminée"></label>' + '<label>Référence de la vente<input type="text" id="rfPayment" placeholder="n\xB0 de commande ou identifiant du paiement"></label>' + '</div>' + '<p class="compta-line"><b>Sans référence d\'avoir, la TVA reste due.</b> Sa récupération est subordonnée à la rectification de la facture initiale : le calcul ne la retirera donc pas, et te le signalera.</p>' + '<div class="compta-actions"><button type="button" class="btn primary" id="rfAdd">\uFF0B Enregistrer le remboursement</button></div></div>';
  if (!refunds || !refunds.length)
    return html;
  html += '<h3 class="compta-card__title" style="margin-top:1rem">Remboursements enregistrés</h3><table class="compta-table">';
  refunds.forEach(function (r) {
    var dt = r.dateMs ? new Date(r.dateMs).toLocaleDateString('fr-FR') : '';
    var av = r.avoirRef ? 'avoir ' + A.escapeHTML(r.avoirRef) : '<b style="color:var(--danger,#c0392b)">SANS AVOIR \u2014 TVA encore due</b>';
    html += '<tr><td>' + (r.label ? A.escapeHTML(r.label) : 'Remboursement') + '<br><small style="opacity:.6">' + dt + ' \xB7 ' + av + '</small></td>' + '<td class="compta-num">\u2212' + eur(r.amountTtc) + '</td>' + '<td><button type="button" class="btn btn--ghost compta-rf-del" data-id="' + A.escapeHTML(r.id) + '">\u2715</button></td></tr>';
  });
  return html + '</table>';
}

function comptaBrancherRemboursements(box) {
  var rfBtn = document.getElementById('rfAdd');
  if (rfBtn)
    rfBtn.onclick = function () {
      var amount = parseFloat(document.getElementById('rfAmount').value);
      if (!(amount > 0)) {
        A.toast('Entre le montant TTC réellement remboursé', 'error');
        return;
      }
      rfBtn.disabled = true;
      A.adminPostType('refund', {
        amountTtc: amount,
        avoirRef: document.getElementById('rfAvoir').value,
        cogsAnnuleHt: parseFloat(document.getElementById('rfCogs').value) || 0,
        commissionRendue: parseFloat(document.getElementById('rfFee').value) || 0,
        label: document.getElementById('rfLabel').value,
        paymentId: document.getElementById('rfPayment').value,
        dateMs: Date.now()
      }).then(function () {
        A.toast('Remboursement enregistré', 'success');
        comptaLoadAccounting();
      }).catch(function (e) {
        A.toast('Erreur : ' + e.message, 'error');
        rfBtn.disabled = false;
      });
    };
  box.querySelectorAll('.compta-rf-del').forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute('data-id');
      A.adminAuthHeaders().then(function (h) {
        return fetch(A.apiBaseUrl() + '/api/admin?type=refund&id=' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: h
        });
      }).then(function (r) {
        return r.json();
      }).then(function () {
        A.toast('Remboursement supprimé', 'success');
        comptaLoadAccounting();
      }).catch(function (e) {
        A.toast('Erreur : ' + e.message, 'error');
      });
    };
  });
}

function comptaRenderAccounting(box, a, charges, refunds) {
  function eur(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' \u20AC';
  }
  var now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  function row(label, val, strong) {
    return '<tr class="' + (strong ? 'compta-row--strong' : '') + '"><td>' + A.escapeHTML(label) + '</td><td class="compta-num">' + A.escapeHTML(val) + '</td></tr>';
  }
  function kpi(label, val, sub) {
    return '<div class="compta-kpi"><div class="compta-kpi__val">' + A.escapeHTML(val) + '</div>' + (sub ? '<div class="compta-kpi__sub">' + A.escapeHTML(sub) + '</div>' : '') + '<div class="compta-kpi__lbl">' + A.escapeHTML(label) + '</div></div>';
  }
  var html = '<div id="comptaPrintable">';
  html += '<div class="compta-print-head"><b>Pirates Tools \u2014 Compte de résultat</b><span>Édité le ' + now + '</span></div>';
  if (!a.nb_ventes) {
    html += '<div class="compta-card"><p class="compta-line">Aucune vente encaissée pour l\'instant. Dès la 1ʳᵉ vente (paiement confirmé), tout se remplit ici \u2014 chiffres 100 % réels.</p></div>';
  }
  html += '<div class="compta-kpis">' + kpi('Chiffre d\'affaires', eur(a.ca_ttc) + ' TTC', eur(a.ca_ht) + ' HT') + kpi('Ventes', (a.nb_ventes || 0) + '') + kpi('Marge brute', eur(a.marge_brute), 'HT') + kpi('Résultat net', eur(a.resultat_net), 'HT') + '</div>';
  html += '<h3 class="compta-card__title" style="margin-top:1rem">Compte de résultat (réel)</h3>';
  html += '<table class="compta-table">' + row('Ventes encaissées', eur(a.brut && a.brut.ca_ttc || a.ca_ttc) + ' TTC \xB7 ' + eur(a.brut && a.brut.ca_ht || a.ca_ht) + ' HT') + (a.remboursements && a.remboursements.nb > 0 ? row('\u2212 Remboursements clients (' + a.remboursements.nb + ' vente' + (a.remboursements.nb > 1 ? 's annulées' : ' annulée') + ')', eur(a.remboursements.total_ttc) + ' TTC') + row('= Ventes nettes', eur(a.ca_ttc) + ' TTC \xB7 ' + eur(a.ca_ht) + ' HT', true) : '') + row('\u2212 TVA collectée (reversée à l\'État)', eur(a.tva_collectee)) + row('= Chiffre d\'affaires HT', eur(a.ca_ht), true) + row('\u2212 Coût des marchandises vendues', eur(a.cogs)) + row('= Marge brute', eur(a.marge_brute), true) + row('\u2212 Frais de vente Revolut (commission réelle)', eur(a.frais_encaissement != null ? a.frais_encaissement : a.frais_stripe)) + row('\u2212 Abonnement Revolut' + (a.abonnement_detail && a.abonnement_detail.mois > 0 ? ' (' + a.abonnement_detail.mois + ' mois \xD7 ' + eur(a.abonnement_detail.mensuel) + ', depuis ' + a.abonnement_detail.depuis + ')' : ''), eur(a.abonnement_encaissement || 0)) + row('\u2212 Charges saisies (transport, octroi, CFE, assurance\u2026)', eur(a.charges_saisies)) + row('= Résultat d\'exploitation', eur(a.resultat_exploitation), true) + (a.mecenat && a.mecenat.dons > 0 ? row('Dons mécénat (réintégrés fiscalement)', eur(a.mecenat.dons)) + row('\u2212 Réduction d\'IS mécénat (60 %' + (a.mecenat.report_5_ans > 0 ? ', ' + eur(a.mecenat.report_5_ans) + ' reportés 5 ans' : '') + ')', eur(a.mecenat.reduction_is)) : '') + row('\u2212 Impôt sur les sociétés (IS' + (a.mecenat && a.mecenat.dons > 0 ? ', après réduction mécénat' : '') + ')', eur(a.is)) + row('= RÉSULTAT NET', eur(a.resultat_net) + ' (' + (a.marge_nette_pct || 0) + ' %)', true) + '</table>';
  var tva = a.tva || {};
  var solde = tva.solde_a_reverser || 0;
  html += '<h3 class="compta-card__title" style="margin-top:1rem">TVA \u2014 ce que tu dois / ce que tu récupères</h3>';
  html += '<table class="compta-table">' + row('TVA collectée sur tes ventes', eur(tva.collectee)) + row('\u2212 TVA déductible (sur tes charges)', eur(tva.deductible)) + (solde >= 0 ? row('= À REVERSER à l\'État', eur(solde), true) : row('= À RÉCUPÉRER (crédit de TVA, l\'État te rembourse)', eur(-solde), true)) + '</table>';
  html += '<p class="compta-print-note">\uD83D\uDCA1 La <b>TVA française 20 %</b> que tu paies à cotébrico sur tes achats est <b>déjà récupérée</b> : ton coût des marchandises est compté en HT.</p>';
  if (a.remboursements && a.remboursements.sans_avoir > 0) {
    html += '<p class="admin-error"><b>' + a.remboursements.sans_avoir + ' remboursement' + (a.remboursements.sans_avoir > 1 ? 's sont enregistrés' : ' est enregistré') + ' sans référence d\'avoir.</b> ' + eur(a.remboursements.tva_non_recuperable) + ' de TVA restent donc à reverser alors que la vente est annulée. ' + 'La récupération est subordonnée à la rectification de la facture initiale : ' + 'émets l\'avoir au client, puis renseigne sa référence ci-dessous.</p>';
  }
  if (a.par_mois && a.par_mois.length) {
    html += '<h3 class="compta-card__title" style="margin-top:1rem">Par mois</h3>';
    html += '<table class="compta-table"><tr><th>Mois</th><th class="compta-num">Ventes</th><th class="compta-num">CA TTC</th><th class="compta-num">Marge brute</th></tr>';
    a.par_mois.forEach(function (m) {
      html += '<tr><td>' + m.mois + '</td><td class="compta-num">' + m.ventes + '</td><td class="compta-num">' + eur(m.ca_ttc) + '</td><td class="compta-num">' + eur(m.ca_ht - m.cogs) + '</td></tr>';
    });
    html += '</table>';
  }
  var brands = a.ventes_par_marque || [];
  var BRAND_TARGETS = { 'DeWALT': 10000 };
  html += '<h3 class="compta-card__title" style="margin-top:1rem">Ventes par marque</h3>';
  if (!brands.length) {
    html += '<p class="compta-line">Aucune vente par marque pour l\'instant. Chaque vente incrémente automatiquement le compteur de la marque concernée.</p>';
  } else {
    html += '<table class="compta-table"><tr><th>Marque</th><th class="compta-num">Unités</th><th class="compta-num">Ventes</th><th class="compta-num">CA TTC</th><th class="compta-num">CA HT</th></tr>';
    brands.forEach(function (b) {
      html += '<tr><td>' + A.escapeHTML(b.marque) + '</td><td class="compta-num">' + (b.unites || 0) + '</td><td class="compta-num">' + (b.ventes || 0) + '</td><td class="compta-num">' + eur(b.ca_ttc) + '</td><td class="compta-num">' + eur(b.ca_ht) + '</td></tr>';
    });
    html += '</table>';
    Object.keys(BRAND_TARGETS).forEach(function (name) {
      var found = brands.filter(function (b) {
        return String(b.marque).toLowerCase() === name.toLowerCase();
      })[0];
      var val = found ? found.ca_ttc : 0;
      var target = BRAND_TARGETS[name];
      var pct = target > 0 ? Math.min(100, Math.round(val / target * 100)) : 0;
      html += '<div class="brand-goal">' + '<div class="brand-goal__head"><b>Objectif partenariat ' + A.escapeHTML(name) + '</b>' + '<span>' + eur(val) + ' / ' + eur(target) + ' &middot; ' + pct + ' %</span></div>' + '<div class="brand-goal__bar"><span style="width:' + pct + '%"></span></div>' + (val >= target ? '<div class="brand-goal__ok">\u2705 Seuil atteint \u2014 volume justifiable auprès de ' + A.escapeHTML(name) + ' (chiffres réels, factures à l\'appui).</div>' : '<div class="brand-goal__sub">Encore ' + eur(target - val) + ' de ventes ' + A.escapeHTML(name) + ' pour atteindre le seuil.</div>') + '</div>';
    });
    html += '<p class="compta-print-note">Compteur bâti sur les ventes réelles encaissées (marque snapshotée à chaque vente). Sert de justificatif de volume auprès des marques.</p>';
  }
  if (a.complet === false) {
    html += '<p class="compta-print-note">\u26A0️ Certaines ventes n\'ont pas de coût d\'achat enregistré (données partielles). Le coût réel sera complet pour toutes les ventes à venir.</p>';
  }
  html += '<p class="compta-print-note"><b>Chiffres réels</b> (recettes encaissées, coût d\'achat snapshoté, commissions réelles, charges saisies). <b>Outil de gestion</b> : il ne remplace pas la tenue officielle des comptes ni tes factures d\'origine (à conserver 10 ans). À faire viser par un expert-comptable.</p>';
  html += '</div>';
  html += comptaChargesHtml(charges, eur) + comptaRemboursementsHtml(refunds, eur);
  box.innerHTML = html;
  comptaBrancherCharges(box);
  comptaBrancherRemboursements(box);
}

function comptaLoadCalc() {
  var box = document.getElementById('comptaCalc');
  if (!box)
    return;
  A.adminGet('pricing-config').then(function (data) {
    comptaRenderCalc(box, data.config || {});
  }).catch(function (e) {
    box.innerHTML = '<p class="admin-error">Config indisponible : ' + A.escapeHTML(e.message) + '<br><span class="admin-hint">(nécessite FIREBASE_SERVICE_ACCOUNT sur Vercel)</span></p>';
  });
}

function comptaRenderCalc(box, cfg) {
  var mode = cfg.mode || 'colissimo';
  var auto = cfg.autoPrice !== false;
  var pct = function (v) {
    return Math.round((Number(v) || 0) * 1000) / 10;
  };
  box.innerHTML = '<div class="compta-card">' + '<div class="compta-cfg-row">' + '<label class="compta-toggle"><input type="checkbox" id="cfgAuto"' + (auto ? ' checked' : '') + '> <span>Prix automatiques (le site calcule les prix tout seul)</span></label>' + '</div>' + '<div class="compta-cfg-grid">' + '<label>Mode d\'expédition<select id="cfgMode"><option value="colissimo"' + (mode === 'colissimo' ? ' selected' : '') + '>Colissimo (démarrage)</option><option value="container"' + (mode === 'container' ? ' selected' : '') + '>Container (prix baissés)</option></select></label>' + '<label>Marge nette cible (%)<input type="number" id="cfgTarget" step="0.5" value="' + pct(cfg.targetNet) + '"></label>' + '<label>IS (%)<input type="number" id="cfgIS" step="0.5" value="' + pct(cfg.is) + '"></label>' + '<label>Commission d\'encaissement (%)<input type="number" id="cfgCommPct" step="0.1" min="0" value="' + pct(cfg.commissionPct != null ? cfg.commissionPct : cfg.stripePct) + '"></label>' + '<label>Commission \u2014 part fixe (\u20AC)<input type="number" id="cfgCommFix" step="0.01" min="0" value="' + (Number(cfg.commissionFix != null ? cfg.commissionFix : cfg.stripeFix) || 0).toFixed(2) + '"></label>' + '</div>' + '<p class="admin-hint">Revolut en ligne : <b>1 %</b> carte grand public européenne, ' + '<b>2,8 %</b> carte professionnelle ou internationale. Le prix provisionne CE taux ; ' + 'la comptabilité, elle, lit toujours la commission réellement prélevée sur chaque vente.</p>' + '<div class="compta-actions"><button type="button" class="btn primary" id="cfgSave">\uD83D\uDCBE Enregistrer la config</button></div>' + '<hr class="compta-hr">' + '<h3 class="compta-card__title" style="margin-top:.4rem">Tester un prix</h3>' + '<div class="compta-cfg-grid">' + '<label>Coût TTC cotébrico (\u20AC)<input type="number" id="calcCost" step="0.01" value="84.90"></label>' + '<label>Poids nu (kg)<input type="number" id="calcWeight" step="0.1" value="1.6"></label>' + '</div>' + '<div class="compta-actions"><button type="button" class="btn btn--ghost" id="calcRun">Calculer le prix conseillé</button></div>' + '<div id="calcOut" class="compta-calc-out"></div>' + '<hr class="compta-hr">' + '<h3 class="compta-card__title">Appliquer à tout le catalogue</h3>' + '<p class="compta-line">Recalcule tous les prix depuis la config ci-dessus. On te montre d\'abord ce qui change, tu confirmes ensuite.</p>' + '<div class="compta-actions">' + '<button type="button" class="btn btn--ghost" id="repriceDry">\uD83D\uDC40 Voir ce qui changerait</button>' + '<button type="button" class="btn primary" id="repriceGo" disabled>\u2705 Appliquer les nouveaux prix</button>' + '</div>' + '<div id="repriceOut" class="compta-calc-out"></div>' + '</div>';
  document.getElementById('cfgSave').onclick = function () {
    var btn = this;
    btn.disabled = true;
    A.adminPostType('pricing-config', {
      autoPrice: document.getElementById('cfgAuto').checked,
      mode: document.getElementById('cfgMode').value,
      targetNet: (parseFloat(document.getElementById('cfgTarget').value) || 15) / 100,
      is: (parseFloat(document.getElementById('cfgIS').value) || 15) / 100,
      commissionPct: (parseFloat(document.getElementById('cfgCommPct').value) || 0) / 100,
      commissionFix: parseFloat(document.getElementById('cfgCommFix').value) || 0,
      stripePct: (parseFloat(document.getElementById('cfgCommPct').value) || 0) / 100,
      stripeFix: parseFloat(document.getElementById('cfgCommFix').value) || 0
    }).then(function () {
      A.toast('Config enregistrée', 'success');
      btn.disabled = false;
    }).catch(function (e) {
      A.toast('Erreur : ' + e.message, 'error');
      btn.disabled = false;
    });
  };
  document.getElementById('calcRun').onclick = function () {
    var out = document.getElementById('calcOut');
    out.innerHTML = '<p class="admin-loading">Calcul\u2026</p>';
    A.adminPostType('price-preview', {
      costTTC: parseFloat(document.getElementById('calcCost').value) || 0,
      weight: parseFloat(document.getElementById('calcWeight').value) || 2,
      mode: document.getElementById('cfgMode').value
    }).then(function (data) {
      var r = data.result;
      if (!r) {
        out.innerHTML = '<p class="admin-error">Pas de résultat</p>';
        return;
      }
      out.innerHTML = '<div class="compta-res">' + '<div class="compta-res__price">' + r.ttc.toFixed(0) + ' \u20AC <small>TTC (prix client, tout compris)</small></div>' + '<div class="compta-res__ht">' + r.priceHt.toFixed(2) + ' \u20AC HT</div>' + '<div class="compta-res__brk">' + '<span>Markup : <b>' + Math.round(r.markup * 100) + ' %</b></span>' + '<span>Coût HT : ' + r.costHT.toFixed(2) + ' \u20AC</span>' + '<span>Transport : ' + r.transport.toFixed(2) + ' \u20AC</span>' + '<span>Octroi payé : ' + r.octroiPaid.toFixed(2) + ' \u20AC</span>' + '<span class="compta-res__net">Net après IS : ' + r.netAfterIS.toFixed(2) + ' \u20AC (' + Math.round(r.marginAfterIS * 100) + ' %)</span>' + '</div></div>';
    }).catch(function (e) {
      out.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
    });
  };
  function repriceHealthHtml(d) {
    var o = d && d.origins;
    if (!o)
      return '';
    var solide = (o.traqueur || 0) + (o.fiche || 0) + (o.variante || 0);
    var est = o['estimé'] || 0;
    var locked = d.counts && d.counts.locked || 0;
    var h = '<div class="reprice-health"><strong>Sur quoi reposent tes prix :</strong><br>' + '\uD83D\uDCE1 ' + (o.traqueur || 0) + ' relevés par le traqueur \xB7 ' + '\uD83D\uDCC4 ' + (o.fiche || 0) + ' prix fournisseur saisis \xB7 ' + '\uD83D\uDD17 ' + (o.variante || 0) + ' déduits de la variante (\xB1 20 \u20AC) \xB7 ' + (est ? '<span class="admin-error">\u26A0️ ' + est + ' estimés</span>' : '\u2705 0 estimé') + (locked ? ' \xB7 \uD83D\uDD12 ' + locked + ' à prix verrouillé (jamais recalculé)' : '') + (o.rupture || 0 ? ' \xB7 <span class="admin-error">\u26D4 ' + o.rupture + ' gelés \u2014 prix intouchés</span>' : '') + '</div>';
    if ((o.rupture || 0) && d.gels && d.gels.length) {
      var RAISON_GEL = {
        rupture: 'en rupture chez toutes les sources',
        perime: 'plus vu depuis plus de 14 jours',
        mixte: 'relevés tous en rupture ou périmés',
        'source-retiree': 'seul relevé venu d\u2019un traqueur retiré \u2014 attend le traqueur en service'
      };
      h += '<p class="admin-hint">Produits gelés (aucun coût exploitable) :</p>' + '<ul class="compta-sample">' + d.gels.map(function (x) {
        var r = RAISON_GEL[x.raison] || x.raison || '';
        return '<li>' + A.escapeHTML(x.sku || '') + ' \u2014 ' + A.escapeHTML((x.name || '').slice(0, 70)) + (r ? ' <em>(' + A.escapeHTML(r) + ')</em>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (est && d.estimes && d.estimes.length) {
      var parMarque = {};
      d.estimes.forEach(function (x) {
        var b = x.brand || '\u2014';
        (parMarque[b] = parMarque[b] || []).push(x);
      });
      h += '<p class="admin-hint">Ces ' + d.estimes.length + ' produits n\'apparaissent pas dans le traqueur \u2014 leur prix repose sur une supposition :</p>' + '<div class="lv-cta" style="margin:.2rem 0 .6rem"><button type="button" class="btn" id="repriceCopyEst">\uD83D\uDCCB Copier la liste (' + d.estimes.length + ')</button>' + '<span class="lv-cta__note" id="repriceCopySt" aria-live="polite"></span></div>';
      Object.keys(parMarque).sort().forEach(function (b) {
        h += '<p class="admin-hint" style="margin:.5rem 0 .2rem"><strong>' + A.escapeHTML(b) + '</strong> \u2014 ' + parMarque[b].length + '</p>' + '<ul class="compta-sample">' + parMarque[b].map(function (x) {
          return '<li>' + A.escapeHTML(x.sku || '') + ' \u2014 ' + A.escapeHTML((x.name || '').slice(0, 70)) + ' <small>(coût supposé ' + x.srcTTC + ' \u20AC)</small></li>';
        }).join('') + '</ul>';
      });
    } else if (solide) {
      h += '<p class="admin-ok">\u2705 Tous les prix calculés reposent sur un coût d\'achat réel.</p>';
    }
    return h;
  }
  function wireRepriceCopy(d) {
    var btn = document.getElementById('repriceCopyEst');
    if (!btn || !d || !d.estimes)
      return;
    btn.onclick = function () {
      var txt = d.estimes.map(function (x) {
        return (x.brand || '?') + '\t' + (x.sku || '') + '\t' + (x.name || '') + '\t' + x.srcTTC + ' EUR';
      }).join('\n');
      var st = document.getElementById('repriceCopySt');
      navigator.clipboard.writeText(txt).then(function () {
        if (st)
          st.textContent = '\u2705 ' + d.estimes.length + ' lignes copiées \u2014 colle-les dans le chat.';
      }).catch(function () {
        if (st)
          st.textContent = 'Copie auto refusée \u2014 sélectionne le texte ci-dessous :';
        var pre = document.createElement('textarea');
        pre.readOnly = true;
        pre.rows = 12;
        pre.style.width = '100%';
        pre.value = txt;
        btn.parentNode.parentNode.appendChild(pre);
        pre.select();
      });
    };
  }
  var repriceOut = document.getElementById('repriceOut');
  document.getElementById('repriceDry').onclick = function () {
    repriceOut.innerHTML = '<p class="admin-loading">Analyse\u2026</p>';
    A.adminPostType('reprice-all', { dryRun: true }).then(function (d) {
      var c = d.counts || {};
      var sample = (d.changed || []).slice(0, 8).map(function (x) {
        return '<li>' + A.escapeHTML(x.name || x.sku) + ' : ' + (x.oldPrice != null ? x.oldPrice + ' \u20AC' : '\u2014') + ' \u2192 <b>' + x.newPrice + ' \u20AC</b>' + (x.costSrc ? ' <small>(coût ' + A.escapeHTML(x.costSrc) + ')</small>' : '') + '</li>';
      }).join('');
      repriceOut.innerHTML = '<p><b>' + c.changed + '</b> prix changeraient sur ' + c.total + ' produits (mode ' + d.mode + '). ' + (c.skipped ? c.skipped + ' ignorés (coût inconnu).' : '') + '</p>' + (sample ? '<ul class="compta-sample">' + sample + '</ul>' : '') + repriceHealthHtml(d) + '<p class="admin-hint">Vérifie que ça te va, puis clique \xAB Appliquer \xBB.</p>';
      wireRepriceCopy(d);
      document.getElementById('repriceGo').disabled = c.changed === 0;
    }).catch(function (e) {
      repriceOut.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
    });
  };
  document.getElementById('repriceGo').onclick = function () {
    var btn = this;
    btn.disabled = true;
    repriceOut.innerHTML = '<p class="admin-loading">Application\u2026</p>';
    A.adminPostType('reprice-all', { dryRun: false }).then(function (d) {
      A.toast(d.counts.changed + ' prix mis à jour', 'success');
      repriceOut.innerHTML = '<p>\u2705 <b>' + d.counts.changed + '</b> prix mis à jour. Visibles en production sous ~30 s (cache).</p>' + '<p class="admin-loading">Contre-vérification en cours\u2026</p>';
      return A.adminPostType('reprice-all', { dryRun: true }).then(function (v) {
        var rest = v.counts && v.counts.changed || 0;
        repriceOut.innerHTML = '<p>\u2705 <b>' + d.counts.changed + '</b> prix mis à jour.</p>' + (rest === 0 ? '<p class="admin-ok">\u2705 Contre-vérification : <b>plus aucun prix à changer</b>. Les nouveaux prix sont bien enregistrés.</p>' : '<p class="admin-error">\u26A0️ Contre-vérification : <b>' + rest + '</b> prix seraient encore à changer \u2014 signale-le, l\'enregistrement n\'a pas tout pris.</p>') + repriceHealthHtml(v);
        wireRepriceCopy(v);
      });
    }).catch(function (e) {
      repriceOut.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
      btn.disabled = false;
    });
  };
}

function ligneMouvementPrix(m) {
  var baisse = m.nouveau < m.ancien;
  var sens = baisse ? 'baisse' : 'hausse';
  return '<div class="pm-ligne">' + '<img class="pm-ligne__img" src="' + A.escapeHTML(m.img) + '" alt="" width="46" height="46"' + ' loading="lazy" decoding="async">' + '<span class="pm-ligne__txt">' + '<span class="pm-ligne__ref">' + A.escapeHTML(String(m.sku)) + '</span>' + '<span class="pm-ligne__nom">' + A.escapeHTML(String(m.titre)) + '</span>' + '</span>' + '<span class="pm-ligne__date">' + A.escapeHTML(A.formatReviewDate(m.at)) + '</span>' + '<span class="pm-ligne__prix">' + '<s class="pm-ligne__avant">' + A.formatPrice(m.ancien) + '</s>' + '<span class="pm-ligne__fleche" aria-hidden="true">' + (baisse ? '\u2193' : '\u2191') + '</span>' + '<strong class="pm-ligne__apres pm-ligne__apres--' + sens + '">' + A.formatPrice(m.nouveau) + '</strong>' + '<span class="pm-ligne__pct pm-ligne__pct--' + sens + '">' + (m.variation > 0 ? '+' : '') + m.variation + ' %</span>' + '</span>' + '</div>';
}

function loadAdminPriceMoves() {
  var hote = document.getElementById('adminPriceMoves');
  if (!hote)
    return;
  var sel = document.getElementById('pmJours');
  var jours = sel ? sel.value : '30';
  hote.innerHTML = '<p class="admin-loading">Chargement\u2026</p>';
  A.adminGet('price-moves', { jours: jours }).then(function (d) {
    var moves = d && d.moves || [];
    if (!moves.length) {
      hote.innerHTML = '<p class="admin-hint">Aucun mouvement de prix sur cette période. ' + 'Le journal se remplit à chaque passage du traqueur.</p>';
      return;
    }
    var baisses = moves.filter(function (m) {
      return m.nouveau < m.ancien;
    }).length;
    hote.innerHTML = '<p class="admin-hint"><strong>' + moves.length + '</strong> mouvement(s) sur ' + d.jours + ' jours \u2014 ' + baisses + ' baisse(s), ' + (moves.length - baisses) + ' hausse(s).</p>' + '<div class="pm-liste">' + moves.map(ligneMouvementPrix).join('') + '</div>';
  }).catch(function (e) {
    hote.innerHTML = '<p class="admin-hint admin-hint--err">Mouvements non chargés : ' + A.escapeHTML(e && e.message || 'erreur') + '</p>';
  });
}

function loadAdminMargins(force) {
  var el = document.getElementById('adminMarginsBody');
  if (!el)
    return;
  if (A._marginsLoaded && !force)
    return;
  el.innerHTML = '<p class="admin-loading">Calcul des marges sur les prix actuels\u2026</p>';
  A.adminGet('margins').then(function (data) {
    A._marginsLoaded = true;
    renderAdminMargins(el, data || {});
  }).catch(function () {
    el.innerHTML = '<p class="compta-line">Impossible de charger les marges. Vérifie ton accès admin et FIREBASE_SERVICE_ACCOUNT.</p>';
  });
}

function renderAdminMargins(el, data) {
  var rows = data.rows || [];
  var s = data.summary || {};
  var cfg = data.config || {};
  function eur(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }) + ' \u20AC';
  }
  function eur2(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' \u20AC';
  }
  function pctf(n) {
    return (Number(n) || 0).toLocaleString('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' %';
  }
  function mcls(m) {
    return m <= 0 ? 'mg-crit' : m < 10 ? 'mg-warn' : 'mg-good';
  }
  var html = '';
  html += '<p class="admin-hint">Marge nette réelle au <b>prix actuel du site</b> (catalogue live, mis à jour après chaque scan du traqueur), après envoi + octroi + commission d\'encaissement + frais fixes + IS. Territoire 971 \xB7 ' + 'envoi <b>' + A.escapeHTML(cfg.mode || 'colissimo') + '</b> \xB7 cible <b>' + Math.round((cfg.targetNet || 0.15) * 100) + ' % net</b> \xB7 traqueur auto <b>' + (cfg.autoPrice ? 'ON' : 'OFF') + '</b>.</p>';
  html += '<div class="compta-kpis">' + '<div class="compta-kpi"><div class="compta-kpi__val">' + pctf(s.avgMarginPct) + '</div><div class="compta-kpi__lbl">Marge nette moyenne</div></div>' + '<div class="compta-kpi"><div class="compta-kpi__val">' + eur(s.totalNet) + '</div><div class="compta-kpi__sub">1 vente de chaque</div><div class="compta-kpi__lbl">Marge \u20AC cumulée</div></div>' + '<div class="compta-kpi"><div class="compta-kpi__val">' + (s.packCount || 0) + '</div><div class="compta-kpi__sub">marge ' + eur(s.packNet) + '</div><div class="compta-kpi__lbl">Gros packs</div></div>' + '<div class="compta-kpi"><div class="compta-kpi__val">' + (s.count || 0) + '</div><div class="compta-kpi__lbl">Produits</div></div>' + '</div>';
  html += '<div class="mg-controls">' + '<div class="mg-chips">' + '<button type="button" class="mg-chip is-on" data-mg="all">Tous</button>' + '<button type="button" class="mg-chip" data-mg="pack">Gros packs</button>' + '<button type="button" class="mg-chip" data-mg="low">Marge faible</button>' + '</div>' + '<input type="search" id="mgSearch" class="mg-search" placeholder="Chercher un produit, une marque\u2026">' + '<button type="button" class="btn btn--ghost" id="mgReload">\u21BB Recalculer</button>' + '</div>';
  html += '<div class="mg-tablewrap"><table class="compta-table mg-table"><thead><tr>' + '<th class="mg-l">Produit</th><th class="mg-l">Marque</th>' + '<th class="compta-num">Mon achat (TTC)</th><th class="compta-num">Prix TTC 971</th>' + '<th class="compta-num">Poids</th><th class="mg-l">Envoi</th><th class="compta-num">Marge %</th><th class="compta-num">Marge \u20AC</th>' + '</tr></thead><tbody id="mgRows"></tbody></table></div>';
  el.innerHTML = html;
  var filter = 'all', q = '';
  function matches(r) {
    if (filter === 'pack' && !r.isPack)
      return false;
    if (filter === 'low' && r.marginPct >= 10)
      return false;
    if (q) {
      var t = (r.title + ' ' + r.brand + ' ' + r.sku).toLowerCase();
      if (t.indexOf(q) === -1)
        return false;
    }
    return true;
  }
  function paint() {
    var body = document.getElementById('mgRows');
    if (!body)
      return;
    var list = rows.filter(matches);
    body.innerHTML = list.map(function (r) {
      var c = mcls(r.marginPct);
      return '<tr><td class="mg-l">' + (r.isPack ? '<span class="mg-pk">pack</span> ' : '') + A.escapeHTML(r.title) + '</td>' + '<td class="mg-l">' + A.escapeHTML(r.brand || '') + '</td>' + '<td class="compta-num">' + (r.costTTC != null ? eur2(r.costTTC) : '\u2014') + (r.costSrc === 'estimé' ? ' <span class="mg-est" title="Dérivé du prix (pas encore relevé par le traqueur)">~</span>' : '') + '</td>' + '<td class="compta-num">' + eur(r.ttc971) + '</td>' + '<td class="compta-num">' + (r.weight || 0) + ' kg</td>' + '<td class="mg-l mg-ship">' + A.escapeHTML(r.shipKind) + '</td>' + '<td class="compta-num ' + c + '">' + pctf(r.marginPct) + '</td>' + '<td class="compta-num ' + c + '">' + eur2(r.netEur) + '</td></tr>';
    }).join('');
  }
  var chips = el.querySelectorAll('.mg-chip');
  chips.forEach(function (b) {
    b.onclick = function () {
      chips.forEach(function (x) {
        x.classList.remove('is-on');
      });
      b.classList.add('is-on');
      filter = b.getAttribute('data-mg');
      paint();
    };
  });
  var srch = document.getElementById('mgSearch');
  if (srch)
    srch.oninput = function (e) {
      q = (e.target.value || '').toLowerCase().trim();
      paint();
    };
  var rl = document.getElementById('mgReload');
  if (rl)
    rl.onclick = function () {
      loadAdminMargins(true);
    };
  paint();
}

function renderAdminFisc() {
  var el = document.getElementById('adminFiscBody');
  if (!el)
    return;
  var year = new Date().getFullYear();
  var done = A.fiscDone();
  var html = '';
  html += '<p class="admin-hint">Tes <b>déclarations officielles</b>, expliquées simplement, avec les <b>échéances</b> et le <b>lien direct</b> vers le bon site. Tu suis les cartes une par une. \uD83D\uDC4D</p>';
  html += '<div class="fisc-card" style="border-color:#c0243a;background:rgba(192,36,58,.08)">' + '<h3>\uD83D\uDD34 À VÉRIFIER EN PRIORITÉ (peut te coûter cher)</h3>' + '<p class="fisc-line"><b>1. TVA \u2014 es-tu vraiment assujetti ?</b> Ton site facture la TVA (8,5 %). Si ton chiffre d\'affaires est sous les seuils, tu peux être en <b>franchise en base</b> \u2192 dans ce cas tu ne dois <b>PAS</b> facturer la TVA (ce serait une faute). <b>Appelle ton SIE</b> pour trancher \u2014 si tu es en franchise, dis-le-moi, je retire la TVA du site.</p>' + '<p class="fisc-line"><b>2. IS à 15 % \u2014 remplis-tu les conditions ?</b> Le taux réduit exige : capital <b>entièrement libéré</b>, détenu à <b>\u2265 75 % par des personnes physiques</b>, CA &lt; 10 M\u20AC. Sinon c\'est 25 %.</p>' + '<p class="fisc-line"><b>3. Avantages DOM \u2014 ne les rate pas !</b> En Guadeloupe tu peux avoir des <b>exonérations</b> (zone franche <b>ZFANG</b> \u2192 abattement sur l\'IS, CFE exonérée plus longtemps). Ça peut <b>réduire fortement tes impôts</b>. Demande à ton SIE si tu y as droit.</p>' + '</div>';
  html += '<div class="fisc-card" style="border-color:rgba(245,158,11,.5);background:rgba(245,158,11,.07)">' + '<h3>\u26A0️ À garder en tête</h3>' + '<p class="fisc-line">Je donne les grandes lignes et les bons liens, mais je ne suis <b>pas</b> conseiller fiscal \u2192 pour tes obligations exactes, <b>SIE (gratuit)</b> ou expert-comptable.</p>' + '<p class="fisc-line"><b>Garde TOUTES tes factures</b> (achats cotébrico, transport, octroi\u2026) pendant <b>10 ans</b> : le compte de résultat de l\'app est un <b>outil de gestion</b>, il ne remplace pas tes vraies factures ni la tenue officielle des comptes.</p>' + '<p class="fisc-line">\uD83D\uDCA1 Les dates ci-dessous valent pour une <b>clôture au 31 décembre</b> \u2014 confirme ta date de clôture avec ton comptable.</p>' + '</div>';
  A.FISC_DECLARATIONS.forEach(function (d) {
    var isDone = done[d.id] === year;
    html += '<article class="fisc-card' + (isDone ? ' fisc-card--done' : '') + '">' + '<div class="fisc-when">\uD83D\uDDD3️ ' + A.escapeHTML(d.quand) + '</div>' + (isDone ? '<span class="compta-tag2 is-real" style="margin-left:6px">\u2713 fait en ' + year + '</span>' : '') + '<h3>' + A.escapeHTML(d.titre) + '</h3>' + '<p class="fisc-line"><span class="fisc-lbl">\uD83D\uDCC5 Échéance :</span> ' + A.escapeHTML(d.echeance) + '</p>' + '<p class="fisc-line"><span class="fisc-lbl">C\'est quoi :</span> ' + A.escapeHTML(d.quoi) + '</p>' + '<p class="fisc-line"><span class="fisc-lbl">Où :</span> ' + A.escapeHTML(d.ou) + '</p>' + '<p class="fisc-line">' + A.escapeHTML(d.note) + '</p>' + '<div class="compta-actions">' + '<a class="btn primary" href="' + A.escapeHTML(d.url) + '" target="_blank" rel="noopener">Ouvrir le site officiel \u2197</a>' + '<button type="button" class="btn btn--ghost fisc-done" data-id="' + d.id + '">' + (isDone ? '\u21BA Annuler' : '\u2705 Marquer comme fait') + '</button>' + '</div>' + '</article>';
  });
  el.innerHTML = html;
  el.querySelectorAll('.fisc-done').forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute('data-id');
      var st = A.fiscDone();
      if (st[id] === year)
        delete st[id];
      else
        st[id] = year;
      try {
        localStorage.setItem(A.FISC_DONE_KEY, JSON.stringify(st));
      } catch (e) {
      }
      renderAdminFisc();
    };
  });
}

function renderAdminInvoices() {
  var el = document.getElementById('adminInvoicesBody');
  if (!el)
    return;
  el.innerHTML = '<p class="admin-loading">Chargement\u2026</p>';
  Promise.all([
    A.adminGet('invoice-config'),
    A.adminGet('invoices')
  ]).then(function (res) {
    comptaBuildInvoices(el, res[0].seller || {}, res[1].invoices || []);
  }).catch(function (e) {
    el.innerHTML = '<p class="admin-error">Factures indisponibles : ' + A.escapeHTML(e.message) + '<br><span class="admin-hint">(nécessite FIREBASE_SERVICE_ACCOUNT sur Vercel)</span></p>';
  });
}

function comptaBuildInvoices(el, s, list) {
  function v(x) {
    return A.escapeHTML(x || '');
  }
  var incomplete = !(s.raisonSociale && s.adresse && s.siret);
  var html = '';
  html += '<p class="admin-hint">Tes <b>factures conformes</b> (normes FR) : renseigne ton identité une fois, elles se génèrent ensuite pour chaque vente. Imprime-les pour le colis, ou elles partent par email au client.</p>';
  if (incomplete) {
    html += '<div class="fisc-card" style="border-color:rgba(245,158,11,.5);background:rgba(245,158,11,.07)"><h3>\u26A0️ Identité à compléter</h3><p class="fisc-line">Renseigne les champs ci-dessous <b>quand ta société sera créée</b> (raison sociale, SIRET, adresse\u2026). En attendant, les factures affichent [À COMPLÉTER] \u2014 c\'est normal.</p></div>';
  }
  html += '<h2 class="admin-subtitle">\uD83C\uDFE2 Identité de l\'entreprise (sur les factures)</h2>';
  html += '<div class="compta-card"><div class="compta-cfg-grid">' + '<label>Raison sociale<input id="invRS" value="' + v(s.raisonSociale) + '"></label>' + '<label>Forme juridique<input id="invForme" value="' + v(s.formeJuridique || 'SASU') + '"></label>' + '<label>Capital<input id="invCap" placeholder="ex. 1 000 \u20AC" value="' + v(s.capital) + '"></label>' + '<label>SIRET<input id="invSiret" value="' + v(s.siret) + '"></label>' + '<label>RCS (ville)<input id="invRcs" value="' + v(s.rcs) + '"></label>' + '<label>N\xB0 TVA intracom.<input id="invTva" value="' + v(s.tvaIntra) + '"></label>' + '<label>Email<input id="invEmail" value="' + v(s.email) + '"></label>' + '<label>Téléphone<input id="invTel" value="' + v(s.tel) + '"></label>' + '</div>' + '<label>Adresse du siège<input id="invAddr" value="' + v(s.adresse) + '"></label>' + '<label>Médiateur de la consommation<input id="invMed" placeholder="nom + coordonnées" value="' + v(s.mediateur) + '"></label>' + '<label class="compta-toggle" style="margin-top:8px"><input type="checkbox" id="invFranchise"' + (s.franchise ? ' checked' : '') + '> <span>Franchise en base de TVA (je ne facture PAS la TVA)</span></label>' + '<div class="compta-actions"><button type="button" class="btn primary" id="invSave">\uD83D\uDCBE Enregistrer l\'identité</button></div></div>';
  html += '<h2 class="admin-subtitle">\uD83E\uDDFE Factures émises</h2>';
  if (!list.length) {
    html += '<p class="compta-line" style="opacity:.7">Aucune facture pour l\'instant. Elles apparaîtront ici après chaque vente payée.</p>';
  } else {
    html += '<table class="compta-table"><tr><th>N\xB0</th><th>Date</th><th>Client</th><th class="compta-num">Montant</th><th></th></tr>';
    list.forEach(function (f) {
      var dt = f.recordedAtMs ? new Date(f.recordedAtMs).toLocaleDateString('fr-FR') : '';
      html += '<tr><td>' + v(f.invoiceNumber || '\u2014') + '</td><td>' + dt + '</td>' + '<td>' + v(f.customerName || f.customerEmail) + '</td>' + '<td class="compta-num">' + ((f.amountCents || 0) / 100).toFixed(2) + ' \u20AC</td>' + '<td><button type="button" class="btn btn--ghost inv-view" data-id="' + v(f.id) + '">Voir</button></td></tr>';
    });
    html += '</table>';
  }
  html += '<div id="invoiceView"></div>';
  el.innerHTML = html;
  document.getElementById('invSave').onclick = function () {
    var btn = this;
    btn.disabled = true;
    A.adminPostType('invoice-config', {
      raisonSociale: document.getElementById('invRS').value,
      formeJuridique: document.getElementById('invForme').value,
      capital: document.getElementById('invCap').value,
      siret: document.getElementById('invSiret').value,
      rcs: document.getElementById('invRcs').value,
      tvaIntra: document.getElementById('invTva').value,
      email: document.getElementById('invEmail').value,
      tel: document.getElementById('invTel').value,
      adresse: document.getElementById('invAddr').value,
      mediateur: document.getElementById('invMed').value,
      franchise: document.getElementById('invFranchise').checked
    }).then(function () {
      A.toast('Identité enregistrée', 'success');
      btn.disabled = false;
    }).catch(function (e) {
      A.toast('Erreur : ' + e.message, 'error');
      btn.disabled = false;
    });
  };
  el.querySelectorAll('.inv-view').forEach(function (b) {
    b.onclick = function () {
      var view = document.getElementById('invoiceView');
      view.innerHTML = '<p class="admin-loading">Génération\u2026</p>';
      var id = b.getAttribute('data-id');
      A.adminAuthHeaders().then(function (h) {
        return fetch(A.apiBaseUrl() + '/api/admin?type=invoice&id=' + encodeURIComponent(id), {
          method: 'GET',
          headers: h
        });
      }).then(function (r) {
        return r.json();
      }).then(function (data) {
        if (!data.ok)
          throw new Error(data.error || 'erreur');
        view.innerHTML = '<div class="compta-actions" style="margin:12px 0"><button type="button" class="btn primary" id="invPrint">\uD83D\uDDA8️ Imprimer / PDF</button></div>' + (data.html || '');
        var pb = document.getElementById('invPrint');
        if (pb)
          pb.onclick = function () {
            window.print();
          };
      }).catch(function (e) {
        view.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
      });
    };
  });
}

function loadAdminPartners() {
  var el = document.getElementById('adminPartnersBody');
  if (!el)
    return;
  el.innerHTML = '<p class="admin-loading">Chargement\u2026</p>';
  A.adminGet('partners').then(function (data) {
    A._adminPartnersList = data.partners || [];
    renderAdminPartners(el);
  }).catch(function (e) {
    el.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
  });
}

function adminPartnerFormHTML(p) {
  p = p || {};
  var tiers = [
    'basique',
    'pro',
    'gold',
    'black'
  ];
  var tierOpts = tiers.map(function (t) {
    return '<option value="' + t + '"' + (p.tier === t ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
  }).join('');
  return '<form id="adminPartnerForm" class="admin-tools-form" data-partner-id="' + A.escapeHTML(String(p.id || '')) + '">' + '<h2 class="admin-subtitle">' + (p.id ? 'Modifier la carte' : 'Nouvelle carte artisan') + '</h2>' + '<label class="admin-field"><span>Nom / Entreprise *</span>' + '<input type="text" id="apName" maxlength="80" required value="' + A.escapeHTML(String(p.name || '')) + '"></label>' + '<label class="admin-field"><span>Métier * (ex. Charpentier)</span>' + '<input type="text" id="apMetier" maxlength="40" required value="' + A.escapeHTML(String(p.metier || '')) + '"></label>' + '<label class="admin-field"><span>Commune</span>' + '<input type="text" id="apCommune" maxlength="40" value="' + A.escapeHTML(String(p.commune || '')) + '"></label>' + '<label class="admin-field"><span>Abonnement</span>' + '<select id="apTier">' + tierOpts + '</select></label>' + '<label class="admin-field"><span>Description (240 max)</span>' + '<textarea id="apDesc" rows="3" maxlength="240">' + A.escapeHTML(String(p.desc || '')) + '</textarea></label>' + '<label class="admin-field"><span>WhatsApp (chiffres, ex. 590690...)</span>' + '<input type="text" id="apWhatsapp" maxlength="20" value="' + A.escapeHTML(String(p.whatsapp || '')) + '"></label>' + '<label class="admin-field"><span>Site web (https://\u2026, Gold/Black)</span>' + '<input type="url" id="apLink" maxlength="200" value="' + A.escapeHTML(String(p.link || '')) + '"></label>' + '<label class="admin-field"><span>Ordre d\'affichage (petit = premier)</span>' + '<input type="number" id="apOrder" value="' + (Number.isFinite(Number(p.order)) ? Number(p.order) : 999) + '"></label>' + '<label class="admin-field admin-field--inline"><input type="checkbox" id="apActive"' + (p.active !== false ? ' checked' : '') + '> <span>Carte visible (active)</span></label>' + '<label class="admin-field admin-field--inline"><input type="checkbox" id="apGuest"' + (p.guest === true ? ' checked' : '') + '> <span>Invité / test (gratuit \u2014 tous les avantages SAUF le bon de 38 \u20AC/mois ; hors compteur des 10 places payantes)</span></label>' + '<label class="admin-field"><span>Email du compte client lié (l\'artisan pourra changer photos/logo depuis SON compte)</span>' + '<input type="email" id="apLinkedEmail" maxlength="200" placeholder="artisan@email.com" value="' + A.escapeHTML(String(p.linkedEmail || '')) + '"></label>' + '<label class="admin-field"><span>Logo (Pro/Gold/Black)</span>' + '<input type="file" id="apLogoFile" accept="image/*"></label>' + '<div id="apLogoPreview" class="admin-partner-photos"></div>' + '<label class="admin-field"><span>Photos (selon abonnement : Pro 1, Gold 3, Black 6)</span>' + '<input type="file" id="apPhotoFiles" accept="image/*" multiple></label>' + '<div id="apPhotosPreview" class="admin-partner-photos"></div>' + '<div class="ig-publish-actions">' + '<button type="submit" class="btn primary">' + (p.id ? 'Enregistrer' : 'Créer la carte') + '</button>' + (p.id ? '<button type="button" class="btn btn--ghost" id="apCancelEdit">Annuler</button>' : '') + '</div>' + '<span id="apStatus" class="admin-row__status" aria-live="polite"></span>' + '</form>';
}

function renderAdminPartnerPhotos() {
  var logoBox = document.getElementById('apLogoPreview');
  var photosBox = document.getElementById('apPhotosPreview');
  if (logoBox) {
    logoBox.innerHTML = (A._adminPartnerLogo ? '<span class="admin-partner-photo"><img src="' + A.safeImgSrc(A._adminPartnerLogo) + '" alt="Logo"><button type="button" data-remove-logo aria-label="Retirer le logo">\u2715</button></span>' : '') + (A._adminLogoBusy ? '<span class="img-busy">\u23F3 Traitement du logo\u2026</span>' : '');
    var rmLogo = logoBox.querySelector('[data-remove-logo]');
    if (rmLogo)
      rmLogo.onclick = function () {
        A._adminPartnerLogo = '';
        renderAdminPartnerPhotos();
      };
  }
  if (photosBox) {
    photosBox.innerHTML = A._adminPartnerPhotos.map(function (src, i) {
      return '<span class="admin-partner-photo"><img src="' + A.safeImgSrc(src) + '" alt="Photo ' + (i + 1) + '"><button type="button" data-remove-photo="' + i + '" aria-label="Retirer la photo ' + (i + 1) + '">\u2715</button></span>';
    }).join('') + (A._adminPhotosBusy > 0 ? '<span class="img-busy">\u23F3 Traitement de ' + A._adminPhotosBusy + ' image(s)\u2026</span>' : '');
    photosBox.querySelectorAll('[data-remove-photo]').forEach(function (btn) {
      btn.onclick = function () {
        A._adminPartnerPhotos.splice(Number(btn.getAttribute('data-remove-photo')), 1);
        renderAdminPartnerPhotos();
      };
    });
  }
}

function bindAdminPartnerForm(el, editing) {
  var form = document.getElementById('adminPartnerForm');
  if (!form)
    return;
  A._adminPartnerPhotos = editing && Array.isArray(editing.photos) ? editing.photos.slice() : [];
  A._adminPartnerLogo = editing && editing.logo || '';
  renderAdminPartnerPhotos();
  var logoFile = document.getElementById('apLogoFile');
  if (logoFile)
    logoFile.onchange = function () {
      var f = logoFile.files && logoFile.files[0];
      if (!f)
        return;
      A._adminLogoBusy = true;
      renderAdminPartnerPhotos();
      A.compressPartnerImage(f, 320, function (dataUrl) {
        A._adminLogoBusy = false;
        if (dataUrl)
          A._adminPartnerLogo = dataUrl;
        renderAdminPartnerPhotos();
        if (!dataUrl)
          A.toast('Image logo illisible', 'error');
      });
      logoFile.value = '';
    };
  var photoFiles = document.getElementById('apPhotoFiles');
  if (photoFiles)
    photoFiles.onchange = function () {
      var tier = (document.getElementById('apTier') || {}).value || 'basique';
      var max = A.ADMIN_PARTNER_PHOTOS_MAX[tier] || 0;
      var files = Array.prototype.slice.call(photoFiles.files || []);
      photoFiles.value = '';
      if (!max) {
        A.toast('L\'abonnement Basique n\'a pas de photo', 'error');
        return;
      }
      A._adminPhotosBusy += files.length;
      renderAdminPartnerPhotos();
      files.forEach(function (f) {
        A.compressPartnerImage(f, 900, function (dataUrl) {
          A._adminPhotosBusy = Math.max(0, A._adminPhotosBusy - 1);
          if (dataUrl && A._adminPartnerPhotos.length < max) {
            A._adminPartnerPhotos.push(dataUrl);
          } else if (dataUrl) {
            A.toast('Maximum ' + max + ' photo(s) pour ce tier', 'error');
          } else {
            A.toast('Image illisible : ' + f.name, 'error');
          }
          renderAdminPartnerPhotos();
        });
      });
    };
  var cancel = document.getElementById('apCancelEdit');
  if (cancel)
    cancel.onclick = function () {
      renderAdminPartners(el);
    };
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
      logo: A._adminPartnerLogo,
      photos: A._adminPartnerPhotos.slice(0, A.ADMIN_PARTNER_PHOTOS_MAX[tier] || 0)
    };
    submit.disabled = true;
    if (statusEl) {
      statusEl.textContent = 'Enregistrement\u2026';
      statusEl.className = 'admin-row__status';
    }
    A.adminPostType('partner-save', body).then(function () {
      A.toast('Carte enregistrée \u2713', 'success');
      loadAdminPartners();
    }).catch(function (err) {
      submit.disabled = false;
      if (statusEl) {
        statusEl.textContent = 'Erreur : ' + err.message;
        statusEl.className = 'admin-row__status is-error';
      }
    });
  };
}

function renderAdminPartners(el) {
  el = el || document.getElementById('adminPartnersBody');
  if (!el)
    return;
  var rows = A._adminPartnersList.map(function (p) {
    return '<div class="admin-row" data-partner-row="' + A.escapeHTML(String(p.id || '')) + '">' + '<div class="admin-row__info">' + '<strong>' + A.escapeHTML(String(p.name || '')) + '</strong>' + ' <span class="admin-row__meta">' + A.escapeHTML(String(p.metier || '')) + ' \xB7 ' + A.escapeHTML(String(p.tier || 'basique')) + (p.guest === true ? ' \xB7 <em>invité</em>' : '') + (p.active === false ? ' \xB7 <em>masquée</em>' : '') + ' \xB7 ordre ' + (Number(p.order) || 0) + '</span>' + '</div>' + '<div class="admin-row__actions">' + '<button type="button" class="btn btn--ghost" data-partner-edit="' + A.escapeHTML(String(p.id || '')) + '">Modifier</button>' + '<button type="button" class="btn btn--ghost" data-partner-del="' + A.escapeHTML(String(p.id || '')) + '">Supprimer</button>' + '</div></div>';
  }).join('');
  el.innerHTML = '<div class="admin-list">' + (rows || '<p class="admin-hint">Aucune carte pour l\'instant.</p>') + '</div><hr class="menu-divider">' + adminPartnerFormHTML(null);
  bindAdminPartnerForm(el, null);
  el.querySelectorAll('[data-partner-edit]').forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute('data-partner-edit');
      var p = null;
      for (var i = 0; i < A._adminPartnersList.length; i++) {
        if (A._adminPartnersList[i].id === id) {
          p = A._adminPartnersList[i];
          break;
        }
      }
      if (!p)
        return;
      var formSlot = el.querySelector('#adminPartnerForm');
      if (formSlot)
        formSlot.outerHTML = adminPartnerFormHTML(p);
      bindAdminPartnerForm(el, p);
      var f = el.querySelector('#adminPartnerForm');
      if (f)
        f.scrollIntoView({ block: 'nearest' });
    };
  });
  el.querySelectorAll('[data-partner-del]').forEach(function (btn) {
    btn.onclick = function () {
      var id = btn.getAttribute('data-partner-del');
      if (!window.confirm('Supprimer définitivement cette carte ?'))
        return;
      btn.disabled = true;
      A.adminPostType('partner-delete', { id: id }).then(function () {
        A.toast('Carte supprimée', 'success');
        loadAdminPartners();
      }).catch(function (err) {
        btn.disabled = false;
        A.toast('Erreur : ' + err.message, 'error');
      });
    };
  });
}

function loadAdminInviteCodes() {
  var el = document.getElementById('adminInviteCodes');
  if (!el)
    return;
  el.innerHTML = '<p class="admin-loading">Chargement\u2026</p>';
  A.adminGet('invite-codes').then(function (data) {
    var codes = data.codes || [];
    if (!codes.length) {
      el.innerHTML = '<p class="admin-hint">Aucun code pour l\'instant.</p>';
      return;
    }
    el.innerHTML = codes.map(function (c) {
      return '<div class="admin-row">' + '<div class="admin-row__info"><strong style="letter-spacing:.08em">' + A.escapeHTML(c.code) + '</strong>' + ' <span class="admin-row__meta">' + (c.usedBy ? '\uD83C\uDF9F️ utilisé par ' + A.escapeHTML(c.usedBy) : '<em style="color:#34d399">libre</em>') + '</span></div>' + '<div class="admin-row__actions"><button type="button" class="btn btn--ghost" data-invite-del="' + A.escapeHTML(c.code) + '">Supprimer</button></div>' + '</div>';
    }).join('');
    el.querySelectorAll('[data-invite-del]').forEach(function (btn) {
      btn.onclick = function () {
        if (!window.confirm('Supprimer le code ' + btn.getAttribute('data-invite-del') + ' ?'))
          return;
        btn.disabled = true;
        A.adminPostType('invite-code-delete', { code: btn.getAttribute('data-invite-del') }).then(function () {
          loadAdminInviteCodes();
        }).catch(function (e) {
          btn.disabled = false;
          A.toast('Erreur : ' + e.message, 'error');
        });
      };
    });
  }).catch(function (e) {
    el.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
  });
}

function bindAdminInviteCodeCreate() {
  var btn = document.getElementById('adminInviteCodeCreate');
  var input = document.getElementById('adminInviteCodeInput');
  if (!btn || btn._bound)
    return;
  btn._bound = true;
  btn.onclick = function () {
    btn.disabled = true;
    A.adminPostType('invite-code-save', { code: (input && input.value || '').trim() }).then(function (data) {
      btn.disabled = false;
      if (input)
        input.value = '';
      A.toast('Code créé : ' + data.code, 'success');
      loadAdminInviteCodes();
    }).catch(function (e) {
      btn.disabled = false;
      A.toast('Erreur : ' + e.message, 'error');
    });
  };
}

function loadAdminApplications() {
  loadAdminInviteCodes();
  bindAdminInviteCodeCreate();
  var el = document.getElementById('adminApplicationsBody');
  if (!el)
    return;
  el.innerHTML = '<p class="admin-loading">Chargement\u2026</p>';
  A.adminGet('partner-applications').then(function (data) {
    var list = data.applications || [];
    if (!list.length) {
      el.innerHTML = '<p class="admin-hint">Aucune candidature pour l\'instant.</p>';
      return;
    }
    el.innerHTML = list.map(function (a) {
      var when = a.createdAt ? new Date(a.createdAt).toLocaleString('fr-FR') : '\u2014';
      var sizes = [
        a.sizes && a.sizes.tshirt ? 'T-shirt ' + a.sizes.tshirt : '',
        a.sizes && a.sizes.pantalon ? 'Pantalon ' + a.sizes.pantalon : '',
        a.sizes && a.sizes.pointure ? 'Pointure ' + a.sizes.pointure : '',
        a.sizes && a.sizes.gants ? 'Gants ' + a.sizes.gants : ''
      ].filter(Boolean).join(' \xB7 ');
      function line(label, val) {
        return val ? '<div class="admin-app__line"><span>' + A.escapeHTML(label) + '</span> ' + A.escapeHTML(val) + '</div>' : '';
      }
      return '<div class="admin-app admin-app--' + A.escapeHTML(a.tier || 'basique') + '">' + '<div class="admin-app__head">' + '<strong>' + A.escapeHTML(a.name || '') + '</strong>' + '<span class="admin-app__tier">' + A.escapeHTML((a.tier || '').toUpperCase()) + (a.invited ? ' \xB7 \uD83C\uDF9F️ INVITÉ' : '') + '</span>' + '</div>' + (a.invited ? '<div class="admin-app__line"><span>Invitation</span> code ' + A.escapeHTML(a.inviteCode || '') + ' \u2014 abonnement offert (pas de bon 38 \u20AC)</div>' : '') + (a.uid ? '<div class="admin-app__line"><span>Compte lié</span> \u2713 (mets son email dans \xAB Email du compte client lié \xBB en créant sa carte)</div>' : '') + line('Métier', a.metier + (a.commune ? ' \u2014 ' + a.commune : '')) + '<div class="admin-app__line"><span>Contact</span> ' + '<a href="mailto:' + encodeURIComponent(a.email) + '">' + A.escapeHTML(a.email) + '</a>' + (a.phone ? ' \xB7 ' + A.escapeHTML(a.phone) : '') + '</div>' + line('Tailles ÉPI', sizes) + line('Couleurs', a.couleurs) + line('Réseaux', [
        a.facebook,
        a.instagram
      ].filter(Boolean).join(' \xB7 ')) + line('Publicité', A.PJ_PUB_LABEL[a.pubChoice] || a.pubChoice) + line('Site', a.hasWebsite ? 'Oui (' + (a.websiteUrl || 'n.c.') + ') \u2014 ' + (A.PJ_SITE_LABEL[a.siteOption] || a.siteOption) : A.PJ_SITE_LABEL[a.siteOption] || '') + (a.hasLogo ? '<div class="admin-app__line"><span>Logo</span> \u2713 fourni</div>' : '') + line('Message', a.message) + '<div class="admin-app__foot">' + A.escapeHTML(when) + ' \xB7 statut : ' + A.escapeHTML(a.status || 'nouvelle') + '</div>' + '</div>';
    }).join('');
  }).catch(function (e) {
    el.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
  });
}

function renderAdminCourierBareme() {
  var el = document.getElementById('adminCourierBareme');
  if (!el)
    return;
  var P = A._lvAdminFuel || A.LV_FUEL_DEFAULT;
  var fmt = function (n, d) {
    return n.toFixed(d === undefined ? 2 : d).replace('.', ',');
  };
  var EXAMPLES = [
    {
      label: 'Sainte-Anne \u2194 Capesterre-Belle-Eau',
      route: 46,
      zone: 2
    },
    {
      label: 'Sainte-Anne \u2194 Basse-Terre (ville)',
      route: 61,
      zone: 3
    }
  ];
  var h = '<div class="admin-bareme">' + '<div class="admin-bareme__zones">' + A.LV_BAREME.map(function (b) {
    return '<div class="admin-bareme__zone"><span>' + b.emoji + ' Z' + b.zone + '</span><em>' + b.km + ' km</em><strong>' + b.prix + ' \u20AC</strong></div>';
  }).join('') + '</div>' + '<p class="admin-hint"><strong>\u2696️ Barème CONSEILLÉ \u2014 jamais imposé.</strong> Chaque livreur fixe librement ses ' + 'propres tarifs dans son espace ; aucune sanction, aucun déclassement et aucun filtre ne dépend du montant ' + 'choisi, et le tri de l\'annuaire ignore le prix (disponibilité, note, ancienneté). C\'est ce qui nous tient ' + 'hors de l\'art. L7342-1 et du critère \xAB prix fixé unilatéralement \xBB de la directive (UE) 2024/2831.<br>' + 'Construction du repère : ancrage Sainte-Anne \u2192 Basse-Terre (zone \uD83D\uDD34, trajet le plus long) = 100 \u20AC, ' + 'proportionnel au rayon (\u2248 2,17 \u20AC/km) \u2014 calibré pour être juste des DEUX côtés : le livreur reste gagnant ' + 'essence déduite (voir le tableau ci-dessous), l\'artisan paie un prix tenable. Réglé en direct entre eux, ' + '0 % pour la plateforme.</p>' + '<div class="admin-bareme__fuel">' + '<label>\u26FD Prix du litre sans plomb (Guadeloupe, réglementé \u2014 révisé chaque mois par la préfecture)' + '<input type="number" id="lvFuelInput" step="0.01" min="0.5" max="5" value="' + P.toFixed(2) + '"> \u20AC/L</label>' + '<button type="button" class="btn primary" id="lvFuelSave">Enregistrer</button>' + '<span id="lvFuelStatus" class="pj-status" aria-live="polite"></span>' + '</div>' + '<div class="admin-bareme__tablewrap"><table class="admin-bareme__table"><thead><tr>' + '<th>Cylindrée</th><th>Conso constructeur</th><th>Conso Guadeloupe<br><small>(+20 % chaleur/virages)</small></th><th>Coût essence<br>par km</th>' + EXAMPLES.map(function (ex) {
    var z = A.LV_BAREME[ex.zone];
    return '<th>' + ex.label + '<br><small>' + ex.route * 2 + ' km A/R route \xB7 course ' + z.emoji + ' ' + z.prix + ' \u20AC</small></th>';
  }).join('') + '</tr></thead><tbody id="lvBaremeBody"></tbody></table></div>' + '<p class="admin-hint">\xAB Il lui reste \xBB = rémunération de la course moins l\'essence A/R (avant cotisations micro-entrepreneur ~21,2 %). Le tableau se recalcule instantanément quand tu changes le prix du litre.</p>' + '</div>';
  el.innerHTML = h;
  function body() {
    var Pnow = parseFloat((document.getElementById('lvFuelInput') || {}).value) || P;
    var rows = Object.keys(A.LV_CYL).map(function (ck) {
      var c = A.LV_CYL[ck], gp = A.lvConsoGp(ck);
      var perKm = gp / 100 * Pnow;
      var cells = '<td><strong>' + c.label + '</strong></td>' + '<td>' + fmt(c.base, 1) + ' L/100</td>' + '<td><strong>' + fmt(gp, 1) + ' L/100</strong></td>' + '<td>' + fmt(perKm, 3) + ' \u20AC/km</td>';
      EXAMPLES.forEach(function (ex) {
        var kmAR = ex.route * 2, litres = gp * kmAR / 100, cout = litres * Pnow;
        var net = A.LV_BAREME[ex.zone].prix - cout;
        cells += '<td>' + fmt(litres, 1) + ' L \u2192 ' + fmt(cout) + ' \u20AC<br><small class="admin-bareme__net">il lui reste ' + fmt(net) + ' \u20AC</small></td>';
      });
      return '<tr>' + cells + '</tr>';
    }).join('');
    var tb = document.getElementById('lvBaremeBody');
    if (tb)
      tb.innerHTML = rows;
  }
  body();
  var inp = document.getElementById('lvFuelInput');
  if (inp)
    inp.oninput = body;
  var save = document.getElementById('lvFuelSave');
  if (save)
    save.onclick = function () {
      var v = parseFloat(inp.value);
      var st = document.getElementById('lvFuelStatus');
      if (!(v > 0.5 && v < 5)) {
        if (st)
          st.textContent = 'Prix invalide.';
        return;
      }
      if (st)
        st.textContent = 'Enregistrement\u2026';
      A.adminPostType('courier-config', { fuelPrice: v }).then(function () {
        A._lvAdminFuel = v;
        if (st)
          st.textContent = '\u2705 Enregistré (' + fmt(v) + ' \u20AC/L).';
      }).catch(function (e) {
        if (st)
          st.textContent = 'Erreur : ' + e.message;
      });
    };
}

function loadAdminCouriers() {
  if (A._lvAdminFuel === null) {
    A.adminGet('courier-config').then(function (d) {
      A._lvAdminFuel = d.config && d.config.fuelPrice || A.LV_FUEL_DEFAULT;
      renderAdminCourierBareme();
    }).catch(function () {
      A._lvAdminFuel = A.LV_FUEL_DEFAULT;
      renderAdminCourierBareme();
    });
  } else
    renderAdminCourierBareme();
  var rEl = document.getElementById('adminCourierRatings');
  if (rEl)
    A.adminGet('course-ratings').then(function (data) {
      var list = data.ratings || [];
      if (!list.length) {
        rEl.innerHTML = '<p class="admin-hint">Aucun avis pour l\'instant.</p>';
        return;
      }
      rEl.innerHTML = list.map(function (a) {
        var when = a.ratedAt ? new Date(a.ratedAt).toLocaleString('fr-FR') : '\u2014';
        var st = '\u2605\u2605\u2605\u2605\u2605'.slice(0, a.rating) + '\u2606\u2606\u2606\u2606\u2606'.slice(0, 5 - a.rating);
        return '<div class="admin-app"><div class="admin-app__head"><strong>' + st + ' (' + a.rating + '/5)</strong>' + '<span class="admin-app__tier">Zone ' + a.zone + ' \xB7 ' + a.prix + ' \u20AC</span></div>' + (a.comment ? '<div class="admin-app__line"><span>Commentaire</span> \xAB ' + A.escapeHTML(a.comment) + ' \xBB</div>' : '') + '<div class="admin-app__line"><span>Livraison</span> ' + A.escapeHTML(a.productTitle || '') + ' \u2014 ' + A.escapeHTML(a.address || '') + '</div>' + '<div class="admin-app__line"><span>Livreur</span> ' + A.escapeHTML(a.courierEmail || '\u2014') + ' \xB7 <span>Client</span> ' + A.escapeHTML(a.artisanEmail || '\u2014') + '</div>' + '<div class="admin-app__foot">' + A.escapeHTML(when) + '</div></div>';
      }).join('');
    }).catch(function (e) {
      rEl.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
    });
  var cEl = document.getElementById('adminCoursesBody');
  if (cEl)
    A.adminGet('courses').then(function (data) {
      var list = data.courses || [];
      if (!list.length) {
        cEl.innerHTML = '<p class="admin-hint">Aucune course enregistrée.</p>';
        return;
      }
      var ST = {
        en_attente: '\u23F3 En attente',
        acceptee: '\uD83D\uDEF5 Acceptée',
        livree: '\uD83D\uDCE6 Livrée',
        terminee: '\u2705 Terminée'
      };
      cEl.innerHTML = list.map(function (c) {
        var when = c.createdAt ? new Date(c.createdAt).toLocaleString('fr-FR') : '\u2014';
        var preuves = [];
        if (c.hasScene)
          preuves.push('\uD83D\uDCF7 chantier');
        if (c.hasProof)
          preuves.push('\uD83D\uDCE6 remise');
        if (c.videos)
          preuves.push('\uD83C\uDFA5 ' + c.videos);
        return '<div class="admin-app">' + '<div class="admin-app__head"><strong>' + A.escapeHTML(ST[c.status] || c.status) + '</strong>' + '<span class="admin-app__tier">Zone ' + c.zone + ' \xB7 ' + (c.paid && c.prix ? c.prix + ' \u20AC' : c.accord && c.accord.prix ? c.accord.prix + ' \u20AC (accord)' : 'prix à convenir') + (c.goodsPaid ? ' \xB7 marchandise réglée' : c.paid ? ' \xB7 payée' : ' \xB7 course non facturée par nous') + (c.escrow ? ' \xB7 ' + A.escapeHTML(c.escrow) : '') + '</span></div>' + '<div class="admin-app__line"><span>\uD83D\uDCCD</span> ' + A.escapeHTML(c.address || '\u2014') + (c.date ? ' \u2014 ' + A.escapeHTML(c.date) : '') + '</div>' + '<div class="admin-app__line"><span>Client</span> ' + A.escapeHTML(c.artisanEmail || '\u2014') + ' \xB7 <span>Livreur</span> ' + A.escapeHTML(c.courierEmail || '\u2014') + '</div>' + '<div class="admin-app__line"><span>Preuves</span> ' + (preuves.length ? preuves.join(' \xB7 ') : 'aucune') + (c.rating ? ' \xB7 \u2B50 ' + c.rating + '/5' : '') + '</div>' + '<div class="admin-app__foot">' + A.escapeHTML(when) + ' \xB7 ' + A.escapeHTML(c.id) + '</div>' + '<div class="admin-app__actions"><button type="button" class="btn" data-course-del="' + A.escapeHTML(c.id) + '">\uD83D\uDDD1 Supprimer définitivement</button></div>' + '</div>';
      }).join('');
      cEl.querySelectorAll('[data-course-del]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-course-del');
          if (!confirm('Supprimer DÉFINITIVEMENT cette course ?\n\nSes photos et ses vidéos seront effacées.\nCette action est irréversible.'))
            return;
          b.disabled = true;
          b.textContent = 'Suppression\u2026';
          A.adminPostType('course-delete', { id: id }).then(function (d) {
            A.toast('Course supprimée (' + (d.photosDeleted || 0) + ' photo(s), ' + (d.videosDeleted || 0) + ' vidéo(s))', 'success');
            loadAdminCouriers();
          }).catch(function (e) {
            b.disabled = false;
            b.textContent = '\uD83D\uDDD1 Supprimer définitivement';
            alert('Erreur : ' + e.message);
          });
        };
      });
    }).catch(function (e) {
      cEl.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
    });
  var dEl = document.getElementById('adminCourierDisputes');
  if (dEl)
    A.adminGet('course-disputes').then(function (data) {
      var list = data.disputes || [];
      if (!list.length) {
        dEl.innerHTML = '<p class="admin-hint">Aucun litige ni vidéo pour l\'instant.</p>';
        return;
      }
      dEl.innerHTML = list.map(function (d) {
        var lit = d.litige;
        var vids = (d.videos || []).map(function (v, i) {
          var when = v.at ? new Date(v.at).toLocaleString('fr-FR') : '';
          return v.url ? '<a href="' + A.escapeHTML(v.url) + '" target="_blank" rel="noopener noreferrer">\uD83C\uDFA5 Vidéo ' + (i + 1) + ' (' + A.escapeHTML(v.role || '?') + (when ? ' \xB7 ' + A.escapeHTML(when) : '') + ') \u2197</a>' : '<em>\uD83C\uDFA5 Vidéo ' + (i + 1) + ' (' + A.escapeHTML(v.role || '?') + ') \u2014 fichier indisponible (Storage non activé ?)</em>';
        }).join('<br>');
        return '<div class="admin-app admin-app--dispute">' + '<div class="admin-app__head"><strong>' + (lit && lit.open ? '\u26A0️ LITIGE OUVERT' : lit ? '\u2705 Litige clos' : '\uD83C\uDFA5 Vidéos') + '</strong>' + '<span class="admin-app__tier">Zone ' + d.zone + ' \xB7 ' + (d.paid && d.prix ? d.prix + ' \u20AC' : d.accord && d.accord.prix ? d.accord.prix + ' \u20AC (accord)' : 'prix à convenir') + ' \xB7 ' + A.escapeHTML(d.status || '') + (d.escrow ? ' \xB7 escrow ' + A.escapeHTML(d.escrow) : '') + '</span></div>' + '<div class="admin-app__line"><span>Course</span> ' + A.escapeHTML(d.id) + ' \u2014 ' + A.escapeHTML(d.address || '') + '</div>' + '<div class="admin-app__line"><span>Client</span> ' + A.escapeHTML(d.artisanEmail || '\u2014') + ' \xB7 <span>Livreur</span> ' + A.escapeHTML(d.courierEmail || '\u2014') + '</div>' + (lit && lit.message ? '<div class="admin-app__line"><span>Motif (' + A.escapeHTML(lit.role || '?') + ')</span> \xAB ' + A.escapeHTML(lit.message) + ' \xBB</div>' : '') + (vids ? '<div class="admin-app__line"><span>Vidéos</span> ' + vids + '</div>' : '') + (lit && lit.open ? '<div class="admin-app__actions"><button type="button" class="btn primary" data-dispute-close="' + A.escapeHTML(d.id) + '">\u2705 Clore le litige (supprime les vidéos)</button></div>' : '') + '</div>';
      }).join('');
      dEl.querySelectorAll('[data-dispute-close]').forEach(function (b) {
        b.onclick = function () {
          var decision = prompt('Décision (notée dans le dossier de la course) :', '');
          if (decision === null)
            return;
          b.disabled = true;
          A.adminPostType('course-dispute-close', {
            id: b.getAttribute('data-dispute-close'),
            decision: decision
          }).then(function () {
            loadAdminCouriers();
          }).catch(function (e) {
            b.disabled = false;
            alert('Erreur : ' + e.message);
          });
        };
      });
    }).catch(function (e) {
      dEl.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
    });
  var el = document.getElementById('adminCouriersBody');
  if (!el)
    return;
  el.innerHTML = '<p class="admin-loading">Chargement\u2026</p>';
  A.adminGet('courier-applications').then(function (data) {
    var list = data.applications || [];
    if (!list.length) {
      el.innerHTML = '<p class="admin-hint">Aucun dossier livreur pour l\'instant.</p>';
      return;
    }
    var attente = list.filter(function (a) {
      return (a.status || 'en_attente') === 'en_attente';
    });
    var valides = list.filter(function (a) {
      return a.status === 'valide';
    });
    var refuses = list.filter(function (a) {
      return a.status === 'refuse';
    });
    el.innerHTML = adminCourierSection('\uD83D\uDCE5 À traiter', attente, adminCourierDossierHTML, 'Aucun dossier en attente.') + adminCourierSection('\uD83D\uDEF5 Livreurs actifs', valides, adminCourierFicheHTML, 'Aucun livreur validé pour l\'instant.') + (refuses.length ? adminCourierSection('\uD83D\uDEAB Refusés', refuses, adminCourierDossierHTML, '') : '');
    el.querySelectorAll('[data-courier-ok]').forEach(function (b) {
      b.onclick = function () {
        reviewCourier(b.getAttribute('data-courier-ok'), 'valide');
      };
    });
    el.querySelectorAll('[data-courier-ko]').forEach(function (b) {
      b.onclick = function () {
        reviewCourier(b.getAttribute('data-courier-ko'), 'refuse');
      };
    });
  }).catch(function (e) {
    el.innerHTML = '<p class="admin-error">Erreur : ' + A.escapeHTML(e.message) + '</p>';
  });
}

function adminCourierSection(titre, liste, carte, vide) {
  if (!liste.length && !vide)
    return '';
  return '<h3 class="admin-subtitle">' + titre + ' <span class="admin-hint">(' + liste.length + ')</span></h3>' + (liste.length ? liste.map(carte).join('') : '<p class="admin-hint">' + vide + '</p>');
}

function adminCourierDossierHTML(a) {
  var veh = A.LV_VEHICLES[a.vehicle] ? A.LV_VEHICLES[a.vehicle].emoji + ' ' + A.LV_VEHICLES[a.vehicle].label : a.vehicle || '\u2014';
  var pieces = A.LV_PIECES_BASE.concat(A.LV_PIECES_EXTRA[a.vehicle] || []);
  var st = a.status || 'en_attente';
  var when = a.createdAt ? new Date(a.createdAt).toLocaleString('fr-FR') : '\u2014';
  return '<div class="admin-app admin-app--courier">' + '<div class="admin-app__head"><strong>' + A.escapeHTML(a.name || 'Livreur') + '</strong>' + '<span class="admin-app__tier">' + A.escapeHTML(veh) + (a.cylindree ? ' \xB7 ' + A.escapeHTML(a.cylindree) + ' cm\xB3' : '') + ' \xB7 ' + (st === 'refuse' ? '\uD83D\uDEAB refusé' : '\u23F3 en attente') + '</span></div>' + (a.piecesBypass ? '<div class="admin-app__line"><strong>\uD83E\uDDEA Dossier de TEST \u2014 dispensé de pièces</strong> (' + A.escapeHTML(String((a.piecesManquantes || []).length)) + ' manquante(s)). ' + 'Ne valide que si tu sais exactement pourquoi.</div>' : '') + '<div class="admin-app__line"><span>Contact</span> <a href="mailto:' + encodeURIComponent(a.email || '') + '">' + A.escapeHTML(a.email || '') + '</a>' + (a.phone ? ' \xB7 ' + A.escapeHTML(a.phone) : '') + '</div>' + pieces.map(function (p) {
    var f = a.pieces && a.pieces[p.id];
    return '<div class="admin-app__line"><span>' + A.escapeHTML(p.t) + '</span> ' + (f ? f.url ? '<a href="' + A.escapeHTML(f.url) + '" target="_blank" rel="noopener noreferrer">Voir la pièce \u2197</a>' : '<em>déclarée : ' + A.escapeHTML(f.name || '?') + ' (fichier non téléversé)</em>' : '<em>manquante</em>') + '</div>';
  }).join('') + '<div class="admin-app__foot">' + A.escapeHTML(when) + '</div>' + '<div class="admin-app__actions">' + (st === 'refuse' ? '<button type="button" class="btn primary" data-courier-ok="' + A.escapeHTML(a.uid || '') + '">\u21A9️ Réactiver</button>' : '<button type="button" class="btn primary" data-courier-ok="' + A.escapeHTML(a.uid || '') + '">\u2705 Valider</button>' + '<button type="button" class="btn" data-courier-ko="' + A.escapeHTML(a.uid || '') + '">\u274C Refuser</button>') + '</div></div>';
}

function adminCourierFicheHTML(a) {
  var p = a.profile;
  if (!p) {
    return '<div class="admin-app admin-app--courier">' + '<div class="admin-app__head"><strong>' + A.escapeHTML(a.name || 'Livreur') + '</strong>' + '<span class="admin-app__tier">\u2705 accès actif</span></div>' + '<div class="admin-app__line">Ce livreur n\'a pas encore rempli sa fiche publique ' + '(nom affiché, photo, tarifs). Elle apparaîtra ici dès qu\'il l\'aura enregistrée ' + 'depuis son espace livreur.</div>' + '<div class="admin-app__line"><span>Contact</span> ' + A.escapeHTML(a.email || '') + '</div>' + '<div class="admin-app__actions"><button type="button" class="btn" data-courier-ko="' + A.escapeHTML(a.uid || '') + '">\uD83D\uDEAB Retirer l\'accès livreur</button></div></div>';
  }
  var avg = p.ratingCount ? p.ratingSum / p.ratingCount : 0;
  var photo = A.isSafePartnerImg(p.photo) ? p.photo : '';
  var nom = A.escapeHTML(String(p.displayName || a.name || 'Livreur'));
  return '<div class="admin-app admin-app--courier">' + '<div class="admin-courier-fiche">' + (photo ? '<img class="admin-courier-fiche__ph" src="' + photo + '" alt="' + nom + '" loading="lazy">' : '<span class="admin-courier-fiche__ph admin-courier-fiche__ph--none" aria-hidden="true">\uD83D\uDEF5</span>') + '<div class="admin-courier-fiche__id">' + '<strong>' + nom + '</strong>' + '<span class="admin-app__tier">' + (p.available ? '\uD83D\uDFE2 Disponible' : '\u26AA️ Hors ligne') + ' \xB7 ' + (p.published ? 'fiche publiée' : 'fiche non publiée') + '</span>' + '<span class="admin-hint">' + (p.commune ? '\uD83D\uDCCD ' + A.escapeHTML(String(p.commune)) + ' \xB7 ' : '') + (p.vehicle ? A.escapeHTML(A.lvVehLabel(p.vehicle)) : '') + (a.cylindree ? ' ' + A.escapeHTML(a.cylindree) + ' cm\xB3' : '') + '</span>' + '</div></div>' + (p.bio ? '<div class="admin-app__line">\xAB ' + A.escapeHTML(String(p.bio)) + ' \xBB</div>' : '') + '<div class="admin-app__line"><span>Tarifs affichés</span> ' + A.LV_BAREME.map(function (b) {
    var t = p.tarifs && p.tarifs[b.zone] || null;
    return b.emoji + ' ' + (t ? t + ' \u20AC' : '\u2014');
  }).join(' \xB7 ') + '</div>' + '<div class="admin-app__line"><span>Activité</span> \uD83D\uDCE6 ' + (p.coursesDone || 0) + ' course' + ((p.coursesDone || 0) > 1 ? 's' : '') + ' livrée' + ((p.coursesDone || 0) > 1 ? 's' : '') + ' \xB7 ' + (p.ratingCount ? '\u2B50 ' + avg.toFixed(1) + '/5 (' + p.ratingCount + ' avis)' : 'aucun avis') + '</div>' + '<div class="admin-app__line"><span>Contact</span> <a href="mailto:' + encodeURIComponent(a.email || '') + '">' + A.escapeHTML(a.email || '') + '</a>' + (a.phone ? ' \xB7 ' + A.escapeHTML(a.phone) : '') + '</div>' + '<div class="admin-app__actions">' + '<a class="btn" href="#/livreur-profil/' + encodeURIComponent(String(a.uid || '')) + '">\uD83D\uDC41️ Voir sa fiche publique</a>' + '<button type="button" class="btn" data-courier-ko="' + A.escapeHTML(a.uid || '') + '">\uD83D\uDEAB Retirer l\'accès livreur</button>' + '</div></div>';
}

function reviewCourier(uid, status) {
  if (!uid)
    return;
  A.adminPostType('courier-review', {
    uid: uid,
    status: status
  }).then(function (d) {
    A.toast(d && d.courierActif ? '\u2705 Dossier validé \u2014 accès livreur ACTIF' : status === 'refuse' ? '\u274C Dossier refusé \u2014 accès livreur retiré' : '\u2705 Enregistré', 'success');
    if (A._currentUser && A._currentUser.uid === uid) {
      A.lvResetRole();
      A.updateAccLivBtn();
    }
    loadAdminCouriers();
  }).catch(function (e) {
    A.toast('Erreur : ' + e.message, 'error');
  });
}

function ajoutProduitMsg(texte, type) {
  var z = document.getElementById('apMsg');
  if (!z)
    return;
  z.textContent = texte || '';
  z.className = 'admin-hint' + (type ? ' ap-msg--' + type : '');
}

function adminApercuImage(box, dataUrl, nom, r) {
  box.className = 'ap-apercu';
  var note = r.intact ? 'envoyée telle quelle, sans recompression \u2014 ' + r.w + '\xD7' + r.h + ', ' + r.ko + ' Ko' : 'redimensionnée ' + r.wSource + '\xD7' + r.hSource + ' \u2192 ' + r.w + '\xD7' + r.h + ', ' + r.koSource + ' Ko \u2192 ' + r.ko + ' Ko (' + (dataUrl.indexOf('data:image/webp') === 0 ? 'WebP' : 'JPEG') + ', qualité ' + Math.round(r.qualite * 100) + ' %, transparence conservée)';
  box.innerHTML = '<img src="' + A.safeImgSrc(dataUrl) + '" alt="Aperçu de la photo du produit">' + '<span>' + A.escapeHTML(nom) + ' \u2014 ' + A.escapeHTML(note) + '</span>';
}

function ajoutProduitSpecs() {
  var specs = {};
  var lignes = document.querySelectorAll('#apSpecs .ap-spec');
  Array.prototype.forEach.call(lignes, function (l) {
    var c = l.querySelector('.ap-spec-cle');
    var v = l.querySelector('.ap-spec-val');
    if (c && v && c.value.trim() && v.value.trim())
      specs[c.value.trim()] = v.value.trim();
  });
  return specs;
}

function ajoutProduitLigneSpec() {
  var d = document.createElement('div');
  d.className = 'ap-spec';
  d.innerHTML = '<input type="text" class="ap-spec-cle search" aria-label="Nom de la caractéristique" placeholder="Puissance">' + '<input type="text" class="ap-spec-val search" aria-label="Valeur de la caractéristique" placeholder="18 V">' + '<button type="button" class="btn btn--ghost ap-spec-rm" aria-label="Retirer cette caractéristique">\u2715</button>';
  d.querySelector('.ap-spec-rm').onclick = function () {
    d.remove();
  };
  return d;
}

function ajoutProduitCorps() {
  return {
    sku: (document.getElementById('apSku') || {}).value || '',
    title: (document.getElementById('apTitre') || {}).value || '',
    brand: (document.getElementById('apMarque') || {}).value || '',
    category: (document.getElementById('apFamille') || {}).value || '',
    desc: (document.getElementById('apDesc') || {}).value || '',
    srcTTC: Number((document.getElementById('apCout') || {}).value || 0),
    weight_kg: Number((document.getElementById('apPoids') || {}).value || 0),
    specs: ajoutProduitSpecs(),
    img: A._ajoutImage
  };
}

function renderAjoutProduit() {
  var view = document.getElementById('ajoutProduitView');
  if (!view)
    return;
  if (A.porteAdmin(view))
    return;
  var familles = typeof ORDRE_CATEGORIES !== 'undefined' && ORDRE_CATEGORIES.length ? ORDRE_CATEGORIES : [];
  view.innerHTML = '<div class="admin-wrap">' + '<header class="admin-header">' + '<h1>Ajout de produits</h1>' + '<a class="btn btn--ghost" href="#/admin">Retour à l\'administration</a>' + '</header>' + '<p class="admin-hint">Tu ne saisis que le <strong>prix fournisseur TTC</strong>. ' + 'Le prix de vente est calculé par le calculateur du site \u2014 celui qui sert déjà ' + 'à l\'import et au traqueur \u2014 jamais à la main.</p>' + '<form id="apForm" class="ap-form" novalidate>' + '<div class="ap-grille">' + '<label>Référence<input type="text" id="apSku" class="search" required autocomplete="off" placeholder="DCD800NT"></label>' + '<label>Marque<input type="text" id="apMarque" class="search" required autocomplete="off" placeholder="DeWALT"></label>' + '<label>Famille<select id="apFamille" class="search" required>' + '<option value="">\u2014 choisir \u2014</option>' + familles.map(function (c) {
    return '<option value="' + A.escapeHTML(c) + '">' + A.escapeHTML(c) + '</option>';
  }).join('') + '</select></label>' + '<label>Poids en kg <em>(facultatif)</em><input type="number" id="apPoids" class="search" min="0" step="0.01" placeholder="2"></label>' + '</div>' + '<label class="ap-large">Titre du produit<input type="text" id="apTitre" class="search" required autocomplete="off" placeholder="Perceuse visseuse à percussion XR 18V"></label>' + '<label class="ap-large">Description<textarea id="apDesc" class="search" rows="5" placeholder="Ce que fait la machine, ce qui est livré avec."></textarea></label>' + '<fieldset class="ap-bloc"><legend>Caractéristiques techniques</legend>' + '<div id="apSpecs"></div>' + '<button type="button" class="btn btn--ghost" id="apSpecAdd">+ Ajouter une caractéristique</button>' + '</fieldset>' + '<fieldset class="ap-bloc"><legend>Photo du produit</legend>' + '<p class="admin-hint">PNG, JPEG ou WebP. Une image <strong>déjà au format</strong> ' + '(1000 px maximum, sous 525 Ko) part <strong>telle quelle</strong>, sans recompression. ' + 'Au-delà, elle est redimensionnée et convertie en WebP haute qualité \u2014 ' + '<strong>la transparence est conservée</strong> et l\'aperçu te dit exactement ce qui a été fait.</p>' + '<input type="file" id="apImage" accept="image/png,image/jpeg,image/webp" aria-label="Photo du produit">' + '<div id="apImageApercu" class="ap-apercu"></div>' + '</fieldset>' + '<fieldset class="ap-bloc"><legend>Prix</legend>' + '<label>Prix fournisseur TTC, en euros<input type="number" id="apCout" class="search" min="0" step="0.01" required placeholder="112.40"></label>' + '<button type="button" class="btn" id="apCalc">Calculer le prix de vente</button>' + '<p id="apPrix" class="ap-prix" aria-live="polite"></p>' + '</fieldset>' + '<p id="apMsg" class="admin-hint" role="status" aria-live="polite"></p>' + '<button type="submit" class="btn" id="apEnvoyer">Créer la fiche produit</button>' + '</form></div>';
  document.getElementById('apSpecs').appendChild(ajoutProduitLigneSpec());
  document.getElementById('apSpecAdd').onclick = function () {
    document.getElementById('apSpecs').appendChild(ajoutProduitLigneSpec());
  };
  A._ajoutImage = '';
  A._ajoutImageNom = '';
  document.getElementById('apImage').onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    var box = document.getElementById('apImageApercu');
    if (!f) {
      A._ajoutImage = '';
      box.textContent = '';
      return;
    }
    box.className = 'ap-apercu';
    box.textContent = 'Préparation de la photo\u2026';
    adminPreparerImage(f, { cote: 1000 }).then(function (r) {
      A._ajoutImage = r.dataUrl;
      A._ajoutImageNom = r.intact ? f.name : String(f.name).replace(/\.[a-z0-9]+$/i, '') + (r.dataUrl.indexOf('data:image/webp') === 0 ? '.webp' : '.jpg');
      adminApercuImage(box, r.dataUrl, A._ajoutImageNom, r);
    }).catch(function (err) {
      A._ajoutImage = '';
      box.className = 'ap-apercu ap-apercu--refus';
      box.textContent = err && err.message || 'Fichier illisible.';
    });
  };
  document.getElementById('apCalc').onclick = function () {
    var c = ajoutProduitCorps();
    var z = document.getElementById('apPrix');
    if (!(c.srcTTC > 0)) {
      z.textContent = 'Saisis d\'abord le prix fournisseur.';
      return;
    }
    z.textContent = 'Calcul\u2026';
    A.adminPostType('product-price-preview', {
      srcTTC: c.srcTTC,
      weight_kg: c.weight_kg,
      category: c.category
    }).then(function (r) {
      z.textContent = 'Prix de vente calculé : ' + r.price.toFixed(2).replace('.', ',') + ' \u20AC TTC' + (r.poidsSuppose ? '  (poids supposé à 2 kg \u2014 le port, donc le prix, changera si tu le renseignes)' : '');
    }).catch(function (e) {
      z.textContent = 'Calcul impossible : ' + (e && e.message || 'erreur');
    });
  };
  document.getElementById('apForm').onsubmit = function (ev) {
    ev.preventDefault();
    var btn = document.getElementById('apEnvoyer');
    var c = ajoutProduitCorps();
    if (!c.sku.trim() || !c.title.trim() || !c.brand.trim() || !c.category || !(c.srcTTC > 0)) {
      ajoutProduitMsg('Référence, marque, famille, titre et prix fournisseur sont obligatoires.', 'refus');
      return;
    }
    btn.disabled = true;
    ajoutProduitMsg('Création\u2026');
    A.adminPostType('product-create', c).then(function (r) {
      if (r && r.visible === false) {
        ajoutProduitMsg('\u26D4 ' + (r.erreur || 'fiche écrite mais NON visible au catalogue'), 'refus');
        A.toast('Fiche NON visible : elle disparaîtrait au rafraîchissement', 'error');
        return;
      }
      ajoutProduitMsg('\u2705 Fiche ' + r.sku + ' créée et VISIBLE au catalogue \u2014 prix de vente ' + Number(r.price).toFixed(2).replace('.', ',') + ' \u20AC TTC.' + (r.poidsSuppose ? ' Poids supposé à 2 kg : renseigne-le pour un prix juste.' : ''), 'ok');
      document.getElementById('apForm').reset();
      document.getElementById('apImageApercu').textContent = '';
      A._ajoutImage = '';
    }).catch(function (e) {
      ajoutProduitMsg('\u26D4 ' + (e && e.message || 'création impossible'), 'refus');
    }).then(function () {
      btn.disabled = false;
    });
  };
}

function renderAdmin() {
  var view = document.getElementById('adminView');
  if (!view)
    return;
  if (A.porteAdmin(view))
    return;
  A._adminStatsLoaded = false;
  A._adminClientsLoaded = false;
  A.destroyAdminGlobe();
  view.innerHTML = '<div class="admin-wrap">' + '<header class="admin-header">' + '<h1>Administration \u2014 Pirates Tools</h1>' + '<a class="btn" href="#/ajout-produit">+ Ajout de produits</a>' + '<button type="button" class="btn btn--ghost" id="adminLogoutBtn">Déconnexion</button>' + '</header>' + '<nav class="admin-tabs" role="tablist">' + '<button type="button" class="admin-tab is-active" data-admin-tab="products" role="tab" aria-selected="true">Produits</button>' + '<button type="button" class="admin-tab" data-admin-tab="compta" role="tab" aria-selected="false">Comptabilité</button>' + '<button type="button" class="admin-tab" data-admin-tab="margins" role="tab" aria-selected="false">Marges</button>' + '<button type="button" class="admin-tab" data-admin-tab="pricemoves" role="tab" aria-selected="false">Mouvement des prix</button>' + '<button type="button" class="admin-tab" data-admin-tab="fisc" role="tab" aria-selected="false">Fiscalité</button>' + '<button type="button" class="admin-tab" data-admin-tab="invoices" role="tab" aria-selected="false">Factures</button>' + '<button type="button" class="admin-tab" data-admin-tab="stats" role="tab" aria-selected="false">Statistiques</button>' + '<button type="button" class="admin-tab" data-admin-tab="clients" role="tab" aria-selected="false">Clients</button>' + '<button type="button" class="admin-tab" data-admin-tab="partners" role="tab" aria-selected="false">Partenaires</button>' + '<button type="button" class="admin-tab" data-admin-tab="applications" role="tab" aria-selected="false">Candidatures</button>' + '<button type="button" class="admin-tab" data-admin-tab="couriers" role="tab" aria-selected="false">Livreurs</button>' + '<button type="button" class="admin-tab" data-admin-tab="orders" role="tab" aria-selected="false">Commandes</button>' + '<button type="button" class="admin-tab" data-admin-tab="tools" role="tab" aria-selected="false">Outils</button>' + '<button type="button" class="admin-tab" data-admin-tab="instagram" role="tab" aria-selected="false">Instagram</button>' + '</nav>' + '<div class="admin-pane is-active" data-admin-pane="products">' + '<p class="admin-hint">Édite le stock, le prix, et la fiche complète de chaque produit (bouton \u2304). Les modifications sont enregistrées dans Firestore et visibles en production après rafraîchissement du cache (\u226430 s).</p>' + '<div class="admin-prodbar">' + '<label class="admin-prodbar__lab" for="adminProdSearch">Chercher un produit</label>' + '<input type="search" id="adminProdSearch" class="search" autocomplete="off"' + ' placeholder="référence, titre, marque ou famille">' + '<span class="admin-prodbar__count" id="adminProdCount" aria-live="polite"></span>' + '</div>' + '<div class="admin-prodbar">' + '<label class="admin-prodbar__lab" for="adminSansReleveMarque">Références sans coût relevé</label>' + '<select id="adminSansReleveMarque" class="search"></select>' + '<button type="button" id="adminSansReleveBtn" class="btn">Télécharger le tableau (CSV)</button>' + '<span class="admin-prodbar__count" id="adminSansReleveEtat" aria-live="polite"></span>' + '</div>' + '<div id="adminProductList" class="admin-list"><p class="admin-loading">Chargement\u2026</p></div>' + '</div>' + '<div class="admin-pane" data-admin-pane="pricemoves" hidden>' + '<p class="admin-hint">Tous les prix qui ont bougé, relus du journal du traqueur \u2014 ce qui a réellement été appliqué, jamais un recalcul.</p>' + '<div class="pm-barre">' + '<label>Sur les <select id="pmJours" class="search">' + '<option value="7">7 jours</option><option value="30" selected>30 jours</option>' + '<option value="90">90 jours</option><option value="180">6 mois</option>' + '<option value="365">1 an</option></select></label>' + '<button type="button" id="pmRefresh" class="btn">Actualiser</button>' + '</div>' + '<div id="adminPriceMoves"><p class="admin-loading">Chargement\u2026</p></div>' + '</div>' + '<div class="admin-pane" data-admin-pane="compta" hidden>' + '<div id="adminComptaBody"></div>' + '</div>' + '<div class="admin-pane" data-admin-pane="margins" hidden>' + '<div id="adminMarginsBody"></div>' + '</div>' + '<div class="admin-pane" data-admin-pane="fisc" hidden>' + '<div id="adminFiscBody"></div>' + '</div>' + '<div class="admin-pane" data-admin-pane="invoices" hidden>' + '<div id="adminInvoicesBody"></div>' + '</div>' + '<div class="admin-pane" data-admin-pane="orders" hidden>' + '<p class="admin-hint">Dernières commandes payées (lecture seule). Nécessite <code>FIREBASE_SERVICE_ACCOUNT</code>.</p>' + '<div id="adminOrdersList" class="admin-list"><p class="admin-loading">Clique sur "Rafraîchir" pour charger les commandes.</p></div>' + '<button type="button" class="btn btn--ghost" id="adminOrdersRefresh">Rafraîchir</button>' + '</div>' + '<div class="admin-pane" data-admin-pane="tools" hidden>' + '<h2 class="admin-subtitle">Email Resend</h2>' + '<p class="admin-hint">Envoie un email de test pour vérifier que <code>RESEND_API_KEY</code>, <code>RESEND_FROM</code> et <code>OWNER_EMAIL</code> sont correctement configurés.</p>' + '<form id="adminTestEmailForm" class="admin-tools-form">' + '<label class="admin-field">' + '<span>Destinataire (vide = OWNER_EMAIL)</span>' + '<input type="email" id="adminTestEmailTo" placeholder="test@example.com">' + '</label>' + '<button type="submit" class="btn primary">Envoyer un email de test</button>' + '<span id="adminTestEmailStatus" class="admin-row__status" aria-live="polite"></span>' + '</form>' + '<h2 class="admin-subtitle">Environnement</h2>' + '<p class="admin-hint">Vérifie que les variables serverless sont bien configurées sur Vercel.</p>' + '<button type="button" class="btn btn--ghost" id="adminHealthBtn">Vérifier /api/health</button>' + '<pre id="adminHealthOutput" class="admin-health-output" hidden></pre>' + '</div>' + '<div class="admin-pane" data-admin-pane="instagram" hidden>' + '<div class="ig-admin">' + '<div class="ig-section ig-account">' + '<h2 class="admin-subtitle">Compte Instagram</h2>' + '<p class="admin-hint">Informations du compte Instagram Business lié.</p>' + '<button type="button" class="btn primary" id="igLoadAccount" aria-label="Charger le compte Instagram">Charger le compte</button>' + '<div id="igAccountInfo" class="ig-account-info" hidden></div>' + '</div>' + '<div class="ig-section ig-token">' + '<h2 class="admin-subtitle">Token d\'accès</h2>' + '<p class="admin-hint">Échange le token court (1h) contre un token longue durée (60 jours). Après l\'échange, copie le nouveau token et mets-le à jour dans Vercel \u2192 Environment Variables \u2192 META_ACCESS_TOKEN.</p>' + '<button type="button" class="btn btn--ghost" id="igExchangeToken" aria-label="Échanger le token">Échanger pour token 60 jours</button>' + '<div id="igTokenResult" class="ig-token-result" hidden></div>' + '</div>' + '<div class="ig-section ig-media">' + '<h2 class="admin-subtitle">Publications</h2>' + '<p class="admin-hint">Dernières publications Instagram. Clique sur un post pour voir les commentaires.</p>' + '<button type="button" class="btn btn--ghost" id="igLoadMedia" aria-label="Charger les publications">Charger les posts</button>' + '<div id="igMediaGrid" class="ig-media-grid"></div>' + '</div>' + '<div class="ig-section ig-publish">' + '<h2 class="admin-subtitle">Nouveau post</h2>' + '<p class="admin-hint">Crée un post Instagram. L\'image doit être une URL publique (hébergée en ligne). Le post sera d\'abord créé en brouillon \u2014 tu devras confirmer la publication.</p>' + '<form id="igPublishForm" class="ig-publish-form">' + '<label class="admin-field"><span>URL de l\'image</span>' + '<input type="url" id="igImageUrl" placeholder="https://example.com/image.jpg" required></label>' + '<label class="admin-field"><span>Légende / Caption</span>' + '<textarea id="igCaption" rows="4" placeholder="Nouvelle offre Pirates Tools ! \uD83C\uDFF4‍\u2620️&#10;#PiratesTools #Guadeloupe #Outillage"></textarea></label>' + '<div class="ig-publish-preview" id="igPreview" hidden>' + '<img id="igPreviewImg" src="" alt="Aperçu" class="ig-preview-img">' + '<p id="igPreviewCaption" class="ig-preview-caption"></p>' + '</div>' + '<div class="ig-publish-actions">' + '<button type="button" class="btn btn--ghost" id="igPreviewBtn">Aperçu</button>' + '<button type="submit" class="btn primary" id="igPublishBtn" disabled>Créer le brouillon</button>' + '</div>' + '<span id="igPublishStatus" class="admin-row__status" aria-live="polite"></span>' + '</form>' + '<div id="igDraftConfirm" class="ig-draft-confirm" hidden>' + '<p class="ig-draft-msg">Brouillon créé ! Confirme la publication :</p>' + '<button type="button" class="btn primary" id="igConfirmPublish" aria-label="Confirmer la publication">Publier maintenant</button>' + '<button type="button" class="btn btn--ghost" id="igCancelPublish">Annuler</button>' + '<span id="igConfirmStatus" class="admin-row__status" aria-live="polite"></span>' + '</div>' + '</div>' + '<div class="ig-section ig-comments">' + '<h2 class="admin-subtitle">Commentaires</h2>' + '<p class="admin-hint">Sélectionne un post ci-dessus pour voir ses commentaires, ou entre un Media ID manuellement.</p>' + '<div class="ig-comments-lookup">' + '<input type="text" id="igMediaIdInput" placeholder="Media ID" class="ig-media-id-input">' + '<button type="button" class="btn btn--ghost" id="igLoadComments" aria-label="Charger les commentaires">Charger</button>' + '</div>' + '<div id="igCommentsList" class="ig-comments-list"></div>' + '</div>' + '<div class="ig-section ig-insights">' + '<h2 class="admin-subtitle">Statistiques</h2>' + '<p class="admin-hint">Impressions, portée et visites profil (derniers 30 jours).</p>' + '<button type="button" class="btn btn--ghost" id="igLoadInsights" aria-label="Charger les statistiques">Charger les stats</button>' + '<div id="igInsightsData" class="ig-insights-data"></div>' + '</div>' + '</div>' + '</div>' + '<div class="admin-pane" data-admin-pane="stats" hidden>' + '<p class="admin-hint">Mesure d\'audience maison (première partie, sans traceur publicitaire). Données agrégées, IP jamais stockée. Le globe des visiteurs arrive à l\'étape suivante.</p>' + '<div id="adminStats" class="admin-stats"><p class="admin-loading">Chargement\u2026</p></div>' + '<div class="admin-stats-actions">' + '<button type="button" class="btn btn--ghost" id="adminStatsRefresh">Rafraîchir</button>' + '<button type="button" class="btn primary" id="adminReportBtn">Recevoir le rapport par mail</button>' + '<span id="adminReportStatus" class="admin-row__status" aria-live="polite"></span>' + '</div>' + '</div>' + '<div class="admin-pane" data-admin-pane="clients" hidden>' + '<p class="admin-hint">Fiches des clients ayant créé un compte (données fournies volontairement à l\'inscription).</p>' + '<div id="adminClients" class="admin-clients"><p class="admin-loading">Chargement\u2026</p></div>' + '<button type="button" class="btn btn--ghost" id="adminClientsRefresh">Rafraîchir</button>' + '</div>' + '<div class="admin-pane" data-admin-pane="partners" hidden>' + '<p class="admin-hint">Cartes de l\'annuaire \xAB Nos artisans \xBB (#/artisans). Les partenaires Black apparaissent aussi sur l\'accueil. Photos compressées automatiquement (\u2264 ~120 Ko chacune).</p>' + '<div id="adminPartnersBody"><p class="admin-loading">Chargement\u2026</p></div>' + '</div>' + '<div class="admin-pane" data-admin-pane="applications" hidden>' + '<h2 class="admin-subtitle">Codes d\'invitation</h2>' + '<p class="admin-hint">Crée un code et envoie-le à ton invité : il s\'inscrit via \xAB Rejoindre le réseau \xBB en entrant ce code (abonnement offert, compte requis). Usage unique \u2014 le code se consomme à la candidature.</p>' + '<div class="ig-comments-lookup">' + '<input type="text" id="adminInviteCodeInput" placeholder="Vide = code généré (PT-XXXXXX)" class="ig-media-id-input" autocapitalize="characters">' + '<button type="button" class="btn primary" id="adminInviteCodeCreate">Créer un code</button>' + '</div>' + '<div id="adminInviteCodes" class="admin-list"><p class="admin-loading">Chargement\u2026</p></div>' + '<h2 class="admin-subtitle">Candidatures reçues</h2>' + '<p class="admin-hint">Pré-inscriptions reçues via le formulaire \xAB Rejoindre le réseau \xBB (#/rejoindre). Sans paiement \u2014 à recontacter au lancement. Tu reçois aussi chaque candidature par email.</p>' + '<div id="adminApplicationsBody"><p class="admin-loading">Chargement\u2026</p></div>' + '<button type="button" class="btn btn--ghost" id="adminApplicationsRefresh">Rafraîchir</button>' + '</div>' + '<div class="admin-pane" data-admin-pane="couriers" hidden>' + '<h2 class="admin-subtitle">Barème CONSEILLÉ (indicatif) & carburant</h2>' + '<div id="adminCourierBareme"><p class="admin-loading">Chargement\u2026</p></div>' + '<h2 class="admin-subtitle">\u2B50 Avis clients sur les livreurs</h2>' + '<div id="adminCourierRatings"><p class="admin-loading">Chargement\u2026</p></div>' + '<h2 class="admin-subtitle">\uD83E\uDDEA Toutes les courses</h2>' + '<p class="admin-hint">Vue complète, y compris les courses de test. La suppression est DÉFINITIVE et emporte les photos et les vidéos de la course.</p>' + '<div id="adminCoursesBody"><p class="admin-loading">Chargement\u2026</p></div>' + '<h2 class="admin-subtitle">\u26A0️ Litiges & vidéos de remise</h2>' + '<p class="admin-hint">Vidéos PRIVÉES (client/livreur) lisibles ici uniquement, via lien signé 1 h. Engagement : jamais divulguées, effacées à la clôture du litige. Clore un litige supprime définitivement ses vidéos du Storage.</p>' + '<div id="adminCourierDisputes"><p class="admin-loading">Chargement\u2026</p></div>' + '<h2 class="admin-subtitle">Dossiers livreurs</h2>' + '<p class="admin-hint">Candidatures coursier reçues via \xAB Devenir Livreur \xBB. Vérifie les pièces (identité, permis, assurance, capacité transport\u2026) puis valide ou refuse. Le service est INACTIF tant que le module n\'est pas ouvert : cette liste sera vide jusqu\'au lancement.</p>' + '<div id="adminCouriersBody"><p class="admin-loading">Chargement\u2026</p></div>' + '<button type="button" class="btn btn--ghost" id="adminCouriersRefresh">Rafraîchir</button>' + '</div>' + '</div>';
  var logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn)
    logoutBtn.onclick = function () {
      A.setAdminSecret('');
      renderAdmin();
    };
  var tabs = view.querySelectorAll('.admin-tab');
  var panes = view.querySelectorAll('.admin-pane');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.getAttribute('data-admin-tab');
      try {
        tab.scrollIntoView({
          inline: 'center',
          block: 'nearest'
        });
      } catch (_) {
      }
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
      if (target === 'orders')
        loadAdminOrders();
      if (target === 'compta')
        renderAdminCompta();
      if (target === 'margins')
        loadAdminMargins();
      if (target === 'pricemoves')
        loadAdminPriceMoves();
      if (target === 'fisc')
        renderAdminFisc();
      if (target === 'invoices')
        renderAdminInvoices();
      if (target === 'instagram')
        initAdminInstagram();
      if (target === 'stats')
        loadAdminStats();
      if (target === 'clients')
        loadAdminClients();
      if (target === 'partners')
        loadAdminPartners();
      if (target === 'applications')
        loadAdminApplications();
      if (target === 'couriers')
        loadAdminCouriers();
      if (target !== 'stats')
        A.destroyAdminGlobe();
    });
  });
  var pmJours = document.getElementById('pmJours');
  if (pmJours)
    pmJours.addEventListener('change', loadAdminPriceMoves);
  var pmRefresh = document.getElementById('pmRefresh');
  if (pmRefresh)
    pmRefresh.addEventListener('click', loadAdminPriceMoves);
  var statsRefresh = document.getElementById('adminStatsRefresh');
  if (statsRefresh)
    statsRefresh.onclick = function () {
      loadAdminStats(true);
    };
  var reportBtn = document.getElementById('adminReportBtn');
  if (reportBtn)
    reportBtn.onclick = sendAdminReport;
  var clientsRefresh = document.getElementById('adminClientsRefresh');
  if (clientsRefresh)
    clientsRefresh.onclick = function () {
      loadAdminClients(true);
    };
  var appsRefresh = document.getElementById('adminApplicationsRefresh');
  if (appsRefresh)
    appsRefresh.onclick = function () {
      loadAdminApplications();
    };
  var couriersRefresh = document.getElementById('adminCouriersRefresh');
  if (couriersRefresh)
    couriersRefresh.onclick = function () {
      loadAdminCouriers();
    };
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
        statusEl.textContent = 'Envoi\u2026';
        statusEl.className = 'admin-row__status';
      }
      var apiBase = A.apiBaseUrl();
      A.adminAuthHeaders({ 'Content-Type': 'application/json' }).then(function (headers) {
        return fetch(apiBase + '/api/test-email', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(to ? { to: to } : {})
        });
      }).then(function (r) {
        return r.json().then(function (j) {
          return {
            ok: r.ok,
            data: j
          };
        });
      }).then(function (res) {
        submit.disabled = false;
        if (res.ok && res.data.ok) {
          if (statusEl) {
            statusEl.textContent = '\u2713 Envoyé à ' + res.data.to;
            statusEl.className = 'admin-row__status admin-row__status--ok';
          }
        } else {
          if (statusEl) {
            statusEl.textContent = '\u2717 ' + (res.data && res.data.error || 'Erreur inconnue');
            statusEl.className = 'admin-row__status admin-row__status--err';
          }
        }
      }).catch(function (err) {
        submit.disabled = false;
        if (statusEl) {
          statusEl.textContent = '\u2717 Réseau : ' + err.message;
          statusEl.className = 'admin-row__status admin-row__status--err';
        }
      });
    });
  }
  var healthBtn = document.getElementById('adminHealthBtn');
  if (healthBtn) {
    healthBtn.addEventListener('click', function () {
      var out = document.getElementById('adminHealthOutput');
      var apiBase = A.apiBaseUrl();
      healthBtn.disabled = true;
      fetch(apiBase + '/api/health').then(function (r) {
        return r.json().catch(function () {
          return {
            ok: false,
            error: 'Invalid response'
          };
        });
      }).then(function (data) {
        healthBtn.disabled = false;
        if (out) {
          out.hidden = false;
          out.textContent = JSON.stringify(data, null, 2);
        }
      }).catch(function (err) {
        healthBtn.disabled = false;
        if (out) {
          out.hidden = false;
          out.textContent = 'Erreur : ' + err.message;
        }
      });
    });
  }
  var refreshBtn = document.getElementById('adminOrdersRefresh');
  if (refreshBtn)
    refreshBtn.addEventListener('click', loadAdminOrders);
  var champRech = document.getElementById('adminProdSearch');
  if (champRech) {
    champRech.value = A._adminProdQ;
    champRech.addEventListener('input', function () {
      A._adminProdQ = champRech.value || '';
      renderAdminList();
    });
  }
  adminBrancherSansReleve();
  renderAdminList();
}

function adminBrancherSansReleve() {
  var sel = document.getElementById('adminSansReleveMarque');
  var btn = document.getElementById('adminSansReleveBtn');
  var etat = document.getElementById('adminSansReleveEtat');
  if (!sel || !btn)
    return;
  var marques = {};
  (A.products || []).forEach(function (p) {
    var m = String(p && p.brand || '').trim();
    if (m)
      marques[m] = (marques[m] || 0) + 1;
  });
  var noms = Object.keys(marques).sort();
  sel.innerHTML = noms.map(function (m) {
    return '<option value="' + A.escapeHTML(m) + '">' + A.escapeHTML(m) + ' (' + marques[m] + ')</option>';
  }).join('');
  btn.addEventListener('click', function () {
    var marque = sel.value || '';
    if (!marque)
      return;
    btn.disabled = true;
    if (etat) {
      etat.textContent = 'Calcul en cours\u2026';
    }
    var url = A.apiBaseUrl() + '/api/admin?type=price-watch-plan&brand=' + encodeURIComponent(marque) + '&source=idealo&rattrapage=1&format=csv';
    A.adminAuthHeaders({}).then(function (headers) {
      return fetch(url, { headers: headers });
    }).then(function (r) {
      if (!r.ok)
        return r.text().then(function (t) {
          throw new Error(t.slice(0, 180));
        });
      return r.text();
    }).then(function (txt) {
      var lignes = txt.split('\n').filter(function (l) {
        return l.trim();
      }).length - 1;
      var blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = marque.toLowerCase().replace(/[^a-z0-9]/g, '') + '-sans-releve.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 4000);
      if (etat) {
        etat.textContent = lignes + ' référence(s) sans coût relevé';
      }
      A.toast(lignes + ' référence(s) dans le tableau', 'success');
    }).catch(function (e) {
      if (etat) {
        etat.textContent = 'Échec : ' + e.message;
      }
      A.toast('Tableau non produit : ' + e.message, 'error');
    }).then(function () {
      btn.disabled = false;
    });
  });
}

function loadAdminOrders() {
  var listEl = document.getElementById('adminOrdersList');
  if (!listEl)
    return;
  listEl.innerHTML = '<p class="admin-loading">Chargement des commandes\u2026</p>';
  var apiBase = A.apiBaseUrl();
  A.adminAuthHeaders().then(function (headers) {
    return fetch(apiBase + '/api/admin?type=orders', { headers: headers });
  }).then(function (r) {
    return r.json().then(function (j) {
      return {
        ok: r.ok,
        data: j
      };
    });
  }).then(function (res) {
    if (!res.ok || !res.data.ok) {
      listEl.innerHTML = '<p class="admin-loading">Erreur : ' + A.escapeHTML(res.data && res.data.error || 'Inconnue') + '</p>';
      return;
    }
    var orders = res.data.orders || [];
    if (orders.length === 0) {
      if (res.data.indexUrl) {
        listEl.innerHTML = '<div class="admin-index-warn">' + '<p><b>Index Firestore manquant.</b> La liste des commandes a besoin d\'un index. Touche le bouton ci-dessous : la console Firebase s\'ouvre, tu confirmes, et l\'index se crée tout seul (quelques minutes).</p>' + '<a class="btn primary" href="' + encodeURI(res.data.indexUrl) + '" target="_blank" rel="noopener noreferrer">Créer l\'index Firestore</a>' + '<p class="admin-hint">Après création, reviens ici et touche \xAB Rafraîchir \xBB.</p>' + '</div>';
        return;
      }
      listEl.innerHTML = '<p class="admin-loading">Aucune commande pour l\'instant.</p>';
      return;
    }
    listEl.innerHTML = orders.map(function (o) {
      var status = o.status || 'pending';
      var when = o.createdAt ? new Date(o.createdAt).toLocaleString('fr-FR') : '\u2014';
      var total = typeof o.total === 'number' ? A.formatPrice(o.total) : '\u2014';
      return '<div class="admin-row">' + '<div class="admin-row__head">' + '<div class="admin-row__info">' + '<span class="admin-row__brand">Commande ' + A.escapeHTML(String(o.id || '').slice(-8).toUpperCase()) + '</span>' + '<strong class="admin-row__title">' + A.escapeHTML(o.customerEmail || 'Client anonyme') + '</strong>' + '<span class="admin-row__id">' + A.escapeHTML(when) + ' \xB7 ' + A.escapeHTML(total) + ' \xB7 ' + A.escapeHTML(status) + '</span>' + '</div>' + '</div>' + '</div>';
    }).join('');
  }).catch(function (err) {
    listEl.innerHTML = '<p class="admin-loading">Erreur réseau : ' + A.escapeHTML(err.message) + '</p>';
  });
}

function adminProdFiltres() {
  var q = A._adminProdQ.trim().toLowerCase();
  if (!q)
    return (A.products || []).slice();
  var mots = q.split(/\s+/);
  return (A.products || []).filter(function (p) {
    var foin = [
      p.sku,
      p.title,
      p.name,
      p.brand,
      p.category,
      p.id
    ].join(' ').toLowerCase();
    return mots.every(function (m) {
      return foin.indexOf(m) !== -1;
    });
  });
}

function renderAdminList() {
  var listEl = document.getElementById('adminProductList');
  if (!listEl)
    return;
  if (!A.products || A.products.length === 0) {
    listEl.innerHTML = '<p class="admin-loading">Catalogue vide \u2014 attends que les produits soient chargés.</p>';
    return;
  }
  var trouves = adminProdFiltres();
  var montres = trouves.slice(0, A.ADMIN_PROD_MAX);
  var compteur = document.getElementById('adminProdCount');
  if (compteur) {
    compteur.textContent = trouves.length === 0 ? 'aucun produit ne correspond' : trouves.length + ' produit' + (trouves.length > 1 ? 's' : '') + (trouves.length > montres.length ? ' \u2014 les ' + montres.length + ' premiers sont affichés, affine la recherche' : '');
  }
  if (trouves.length === 0) {
    listEl.innerHTML = '<p class="admin-loading">Aucun produit ne correspond à cette recherche.</p>';
    return;
  }
  listEl.innerHTML = montres.map(function (p) {
    var id = A.escapeHTML(p.id);
    var status = p.stock_status || 'in_stock';
    var label = p.stock_label || '';
    var price = Number(p.price || 0).toFixed(2);
    return '<div class="admin-row" data-product-id="' + id + '">' + '<div class="admin-row__head">' + '<img src="' + A.escapeHTML(p.img || 'images/placeholder.svg') + '" alt="" class="admin-row__img" loading="lazy" decoding="async">' + '<div class="admin-row__info">' + '<span class="admin-row__brand">' + A.escapeHTML(p.brand || '') + '</span>' + '<strong class="admin-row__title">' + A.escapeHTML(p.title || '') + '</strong>' + '<span class="admin-row__id">' + id + '</span>' + '</div>' + '</div>' + '<div class="admin-row__fields">' + '<label class="admin-field">' + '<span>Statut stock</span>' + '<select data-admin-field="stock_status">' + adminOption(status, 'in_stock', 'En stock') + adminOption(status, 'low_stock', 'Stock limité') + adminOption(status, 'out_of_stock', 'Rupture') + adminOption(status, 'preorder', 'Précommande') + '</select>' + '</label>' + '<label class="admin-field">' + '<span>Libellé affiché</span>' + '<input type="text" data-admin-field="stock_label" value="' + A.escapeHTML(label) + '" placeholder="En stock">' + '</label>' + '<label class="admin-field">' + '<span>Prix TTC (\u20AC)</span>' + '<input type="number" step="0.01" min="0" data-admin-field="price" value="' + price + '">' + '</label>' + '</div>' + '<div class="admin-row__actions">' + '<button type="button" class="btn primary" data-admin-action="save">Enregistrer</button>' + '<button type="button" class="btn btn--ghost" data-admin-action="reset">Annuler</button>' + '<button type="button" class="btn btn--ghost admin-row__more" data-admin-action="deplier"' + ' aria-expanded="false" aria-label="Ouvrir la fiche complète de ' + A.escapeHTML(p.title || id) + '">' + '<span class="admin-row__chev" aria-hidden="true">\u2304</span> Fiche complète</button>' + '<span class="admin-row__status" aria-live="polite"></span>' + '</div>' + '<div class="admin-fiche" data-admin-fiche hidden></div>' + '</div>';
  }).join('');
  listEl.onclick = function (e) {
    var btn = e.target.closest('[data-admin-action]');
    if (!btn)
      return;
    var row = btn.closest('.admin-row');
    if (!row)
      return;
    var action = btn.getAttribute('data-admin-action');
    var id = row.getAttribute('data-product-id');
    var statusEl = row.querySelector('.admin-row__status');
    if (action === 'deplier') {
      adminBasculerFiche(row, btn);
      return;
    }
    if (action === 'fiche-save') {
      adminEnregistrerFiche(row, btn);
      return;
    }
    if (action === 'spec-add') {
      adminAjouterLigneSpec(row);
      return;
    }
    if (action === 'spec-del') {
      var l = btn.closest('.admin-spec');
      if (l)
        l.remove();
      return;
    }
    if (action === 'feat-add') {
      adminAjouterLigneFeat(row);
      return;
    }
    if (action === 'feat-del') {
      var f = btn.closest('.admin-feat');
      if (f)
        f.remove();
      return;
    }
    if (action === 'img-del') {
      var v = btn.closest('.admin-vis');
      if (v)
        v.remove();
      return;
    }
    if (action === 'save') {
      var patch = {};
      row.querySelectorAll('[data-admin-field]').forEach(function (el) {
        var f = el.getAttribute('data-admin-field');
        var v = el.value;
        if (f === 'price')
          v = Number(v);
        patch[f] = v;
      });
      patch.id = id;
      btn.disabled = true;
      if (statusEl) {
        statusEl.textContent = 'Envoi\u2026';
        statusEl.className = 'admin-row__status';
      }
      adminFetch('POST', patch).then(function () {
        if (statusEl) {
          statusEl.textContent = 'Enregistré';
          statusEl.className = 'admin-row__status admin-row__status--ok';
        }
        for (var i = 0; i < A.products.length; i++) {
          if (A.products[i].id === id) {
            Object.assign(A.products[i], patch);
            break;
          }
        }
        A.toast('Produit mis à jour', 'success');
      }).catch(function (err) {
        if (statusEl) {
          statusEl.textContent = 'Erreur : ' + err.message;
          statusEl.className = 'admin-row__status admin-row__status--err';
        }
        if (String(err.message).toLowerCase().indexOf('invalid admin') !== -1) {
          A.setAdminSecret('');
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

function adminProduitPar(id) {
  for (var i = 0; i < (A.products || []).length; i++) {
    if (A.products[i].id === id)
      return A.products[i];
  }
  return null;
}

function adminBasculerFiche(row, btn) {
  var boite = row.querySelector('[data-admin-fiche]');
  if (!boite)
    return;
  var ouvert = !boite.hidden;
  if (ouvert) {
    boite.hidden = true;
    boite.innerHTML = '';
    btn.setAttribute('aria-expanded', 'false');
    row.classList.remove('admin-row--ouverte');
    return;
  }
  var p = adminProduitPar(row.getAttribute('data-product-id'));
  if (!p)
    return;
  var peindre = function () {
    boite.innerHTML = adminFicheHtml(p);
    boite.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    row.classList.add('admin-row--ouverte');
    adminBrancherAjoutImage(row);
  };
  if (p._light) {
    boite.hidden = false;
    boite.innerHTML = '<p class="lv-hint">Chargement de la fiche\u2026</p>';
    A.ensureDetail(p).then(function () {
      if (p._light) {
        boite.innerHTML = '<p class="lv-hint">\u26D4 Fiche complète injoignable \u2014 ' + 'édition bloquée pour ne pas écraser la description existante. ' + 'Recharger et réessayer.</p>';
        return;
      }
      peindre();
    });
  } else {
    peindre();
  }
}

function adminFicheHtml(p) {
  var specs = p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs) ? p.specs : {};
  var feats = Array.isArray(p.features) ? p.features : [];
  var imgs = Array.isArray(p.images) && p.images.length ? p.images : p.img && !/placeholder/.test(p.img) ? [p.img] : [];
  var h = '<div class="admin-fiche__grille">';
  h += '<label class="admin-field admin-field--large"><span>Titre affiché</span>' + '<input type="text" data-fiche="title" value="' + A.escapeHTML(p.title || '') + '"></label>';
  h += '<label class="admin-field admin-field--large"><span>Phrase courte (sous le titre, cartes du catalogue)</span>' + '<textarea rows="2" data-fiche="desc">' + A.escapeHTML(p.desc || '') + '</textarea></label>';
  h += '<label class="admin-field admin-field--large"><span>Description longue (fiche produit)</span>' + '<textarea rows="8" data-fiche="description_long">' + A.escapeHTML(p.description_long || '') + '</textarea></label>';
  h += '<label class="admin-field"><span>Poids réel, en kg (sert au calcul du port)</span>' + '<input type="number" step="0.01" min="0.01" data-fiche="weight_kg" value="' + A.escapeHTML(String(p.weight_kg == null ? '' : p.weight_kg)) + '">' + (p.poidsSuppose ? '<em class="admin-fiche__note">poids SUPPOSÉ \u2014 à remplacer par le poids réel</em>' : '') + '</label>';
  h += '<label class="admin-field"><span>Étiquette (Nouveau, Pro\u2026)</span>' + '<input type="text" data-fiche="tag" value="' + A.escapeHTML(p.tag || '') + '"></label>';
  h += '<div class="admin-field admin-field--large"><span>Caractéristiques techniques</span>' + '<div class="admin-specs" data-specs>';
  Object.keys(specs).forEach(function (k) {
    h += adminLigneSpecHtml(k, specs[k]);
  });
  if (!Object.keys(specs).length)
    h += adminLigneSpecHtml('', '');
  h += '</div>' + '<button type="button" class="btn btn--ghost admin-fiche__add" data-admin-action="spec-add">+ Ajouter une caractéristique</button>' + '</div>';
  h += '<div class="admin-field admin-field--large"><span>Points forts (puces de la fiche)</span>' + '<div class="admin-feats" data-feats>';
  feats.forEach(function (f) {
    h += adminLigneFeatHtml(f);
  });
  if (!feats.length)
    h += adminLigneFeatHtml('');
  h += '</div>' + '<button type="button" class="btn btn--ghost admin-fiche__add" data-admin-action="feat-add">+ Ajouter un point fort</button>' + '</div>';
  h += '<div class="admin-field admin-field--large"><span>Visuels \u2014 le premier est celui de la carte du catalogue</span>' + '<div class="admin-vis-liste" data-images>';
  imgs.forEach(function (src) {
    h += adminVisuelHtml(src);
  });
  h += '</div>' + '<label class="admin-fiche__ajout-img">' + '<span>Ajouter un ou plusieurs visuels (PNG, JPEG ou WebP)</span>' + '<input type="file" accept="image/png,image/jpeg,image/webp" multiple data-ajout-img>' + '</label>' + '<p class="admin-fiche__note">Chaque visuel est réduit à 2000 px et réencodé en WebP dans le navigateur : ' + 'la transparence est conservée, et le fichier reste sous la limite d\'envoi.</p>' + '</div>';
  h += '</div>' + '<div class="admin-fiche__actions">' + '<button type="button" class="btn primary" data-admin-action="fiche-save">Enregistrer la fiche</button>' + '<span class="admin-fiche__status" aria-live="polite"></span>' + '</div>';
  return h;
}

function adminLigneSpecHtml(cle, val) {
  return '<div class="admin-spec">' + '<input type="text" class="admin-spec__k" data-spec-k value="' + A.escapeHTML(String(cle || '')) + '" aria-label="Nom de la caractéristique" placeholder="Tension">' + '<input type="text" class="admin-spec__v" data-spec-v value="' + A.escapeHTML(String(val == null ? '' : val)) + '" aria-label="Valeur de la caractéristique" placeholder="18 V XR">' + '<button type="button" class="admin-spec__del" data-admin-action="spec-del" aria-label="Retirer cette caractéristique">\xD7</button>' + '</div>';
}

function adminLigneFeatHtml(txt) {
  return '<div class="admin-feat">' + '<input type="text" data-feat value="' + A.escapeHTML(String(txt || '')) + '" aria-label="Point fort" placeholder="Moteur brushless sans charbon">' + '<button type="button" class="admin-spec__del" data-admin-action="feat-del" aria-label="Retirer ce point fort">\xD7</button>' + '</div>';
}

function adminVisuelHtml(src) {
  return '<div class="admin-vis" data-src="' + A.escapeHTML(src) + '">' + '<img src="' + A.escapeHTML(src) + '" alt="" loading="lazy" decoding="async">' + '<button type="button" class="admin-vis__del" data-admin-action="img-del" aria-label="Retirer ce visuel">\xD7</button>' + '</div>';
}

function adminAjouterLigneSpec(row) {
  var z = row.querySelector('[data-specs]');
  if (z)
    z.insertAdjacentHTML('beforeend', adminLigneSpecHtml('', ''));
}

function adminAjouterLigneFeat(row) {
  var z = row.querySelector('[data-feats]');
  if (z)
    z.insertAdjacentHTML('beforeend', adminLigneFeatHtml(''));
}

function adminImageATransparence(img, w, h) {
  try {
    var k = Math.min(1, 128 / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    var x = c.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    var d = x.getImageData(0, 0, c.width, c.height).data;
    for (var i = 3; i < d.length; i += 4)
      if (d[i] < 255)
        return true;
    return false;
  } catch (_) {
    return true;
  }
}

function adminEncoderSansPerdreLeFond(canvas, qualite, transparente) {
  var sortie = canvas.toDataURL('image/webp', qualite);
  if (sortie.indexOf('data:image/webp') === 0)
    return sortie;
  if (transparente)
    return canvas.toDataURL('image/png');
  return canvas.toDataURL('image/jpeg', qualite);
}

function adminPreparerImage(fichier, opts) {
  var o = opts || {};
  var COTE = o.cote || 1000;
  var PLAFOND = o.plafond || 700000;
  return new Promise(function (resoudre, rejeter) {
    var lect = new FileReader();
    lect.onerror = function () {
      rejeter(new Error('lecture impossible : ' + fichier.name));
    };
    lect.onload = function () {
      var source = String(lect.result || '');
      var koSource = Math.round(source.length * 0.75 / 1000);
      var img = new Image();
      img.onerror = function () {
        rejeter(new Error('image illisible : ' + fichier.name));
      };
      img.onload = function () {
        var wI = img.naturalWidth || img.width, hI = img.naturalHeight || img.height;
        var tropGrande = Math.max(wI, hI) > COTE;
        if (source.length <= PLAFOND && !tropGrande) {
          resoudre({
            dataUrl: source,
            w: wI,
            h: hI,
            ko: koSource,
            intact: true,
            qualite: 1,
            wSource: wI,
            hSource: hI,
            koSource: koSource
          });
          return;
        }
        var transparente = adminImageATransparence(img, wI, hI);
        var facteurs = [
          1,
          0.8,
          0.64,
          0.5,
          0.4
        ];
        var c = document.createElement('canvas');
        var dernier = null, largeurVue = 0, aplati = false;
        for (var f = 0; f < facteurs.length; f++) {
          var cible = Math.max(320, Math.round(COTE * facteurs[f]));
          var k = Math.min(1, cible / Math.max(wI, hI));
          var lg = Math.max(1, Math.round(wI * k));
          if (lg === largeurVue)
            continue;
          largeurVue = lg;
          c.width = lg;
          c.height = Math.max(1, Math.round(hI * k));
          var x = c.getContext('2d', { willReadFrequently: true });
          x.imageSmoothingEnabled = true;
          x.imageSmoothingQuality = 'high';
          x.clearRect(0, 0, c.width, c.height);
          x.drawImage(img, 0, 0, c.width, c.height);
          var sortie = adminEncoderSansPerdreLeFond(c, A.VISUEL_QUALITE, transparente);
          if (transparente) {
            var coin = x.getImageData(0, 0, 1, 1).data[3];
            if (coin !== 0) {
              aplati = true;
              break;
            }
          }
          dernier = {
            l: sortie.length,
            w: c.width,
            h: c.height
          };
          if (sortie.length <= PLAFOND) {
            resoudre({
              dataUrl: sortie,
              w: c.width,
              h: c.height,
              ko: Math.round(sortie.length * 0.75 / 1000),
              intact: false,
              qualite: A.VISUEL_QUALITE,
              transparente: transparente,
              wSource: wI,
              hSource: hI,
              koSource: koSource
            });
            return;
          }
        }
        if (aplati) {
          rejeter(new Error('la conversion a APLATI la transparence de ' + fichier.name + ' \u2014 rien n\'a été ajouté. Ton PNG serait apparu ' + 'sur un carré noir. Ce navigateur ne sait pas encoder le WebP ' + 'en gardant le fond : envoie le visuel autrement, il sera posé ' + 'avec l\'outil qui produit les posters du site.'));
          return;
        }
        rejeter(new Error('image impossible à faire tenir sous ' + Math.round(PLAFOND * 0.75 / 1000) + ' Ko : essayé jusqu\'à ' + (dernier ? dernier.w + '\xD7' + dernier.h + ' en WebP qualité ' + String(A.VISUEL_QUALITE).replace('.', ',') + ' (' + Math.round(dernier.l * 0.75 / 1000) + ' Ko)' : 'aucun encodage') + ' \u2014 source ' + wI + '\xD7' + hI + ', ' + koSource + ' Ko'));
      };
      img.src = source;
    };
    lect.readAsDataURL(fichier);
  });
}

function adminReduireImage(fichier) {
  return adminPreparerImage(fichier, { cote: A.VISUEL_COTE }).then(function (r) {
    return r.dataUrl;
  });
}

function adminBrancherAjoutImage(row) {
  var champ = row.querySelector('[data-ajout-img]');
  var liste = row.querySelector('[data-images]');
  var etat = row.querySelector('.admin-fiche__status');
  if (!champ || !liste)
    return;
  champ.onchange = function () {
    var fichiers = Array.prototype.slice.call(champ.files || []);
    if (!fichiers.length)
      return;
    if (etat) {
      etat.textContent = 'Préparation des visuels\u2026';
      etat.className = 'admin-fiche__status';
    }
    Promise.all(fichiers.map(adminReduireImage)).then(function (uris) {
      uris.forEach(function (u) {
        liste.insertAdjacentHTML('beforeend', adminVisuelHtml(u));
      });
      champ.value = '';
      if (etat) {
        etat.textContent = uris.length + ' visuel(s) ajouté(s) \u2014 pense à enregistrer la fiche';
        etat.className = 'admin-fiche__status admin-fiche__status--ok';
      }
    }).catch(function (e) {
      if (etat) {
        etat.textContent = 'Erreur : ' + e.message;
        etat.className = 'admin-fiche__status admin-fiche__status--err';
      }
      A.toast('Visuel refusé : ' + e.message, 'error');
    });
  };
}

function adminEnregistrerFiche(row, btn) {
  var id = row.getAttribute('data-product-id');
  var etat = row.querySelector('.admin-fiche__status');
  var corps = { id: id };
  row.querySelectorAll('[data-fiche]').forEach(function (el) {
    var k = el.getAttribute('data-fiche');
    corps[k] = k === 'weight_kg' ? Number(el.value) : el.value;
  });
  if (!(corps.weight_kg > 0))
    delete corps.weight_kg;
  var specs = {};
  row.querySelectorAll('.admin-spec').forEach(function (l) {
    var k = (l.querySelector('[data-spec-k]') || {}).value || '';
    var v = (l.querySelector('[data-spec-v]') || {}).value || '';
    if (k.trim() && v.trim())
      specs[k.trim()] = v.trim();
  });
  corps.specs = specs;
  corps.features = Array.prototype.map.call(row.querySelectorAll('[data-feat]'), function (el) {
    return el.value;
  }).filter(function (v) {
    return String(v).trim();
  });
  corps.images = Array.prototype.map.call(row.querySelectorAll('.admin-vis'), function (el) {
    return el.getAttribute('data-src');
  }).filter(Boolean);
  btn.disabled = true;
  if (etat) {
    etat.textContent = 'Envoi\u2026';
    etat.className = 'admin-fiche__status';
  }
  A.adminPostType('product-edit', corps).then(function (rep) {
    if (rep && rep.visible === false) {
      if (etat) {
        etat.textContent = '\u26D4 ' + (rep.erreur || 'écrit mais NON visible au catalogue');
        etat.className = 'admin-fiche__status admin-fiche__status--err';
      }
      A.toast('Modifications NON visibles : elles disparaîtraient au rafraîchissement', 'error');
      return;
    }
    if (etat) {
      etat.textContent = rep.masquee ? 'Enregistré \u2014 fiche MASQUÉE, elle n\'apparaît pas au catalogue (' + (rep.champs || []).length + ' champ(s))' : 'Enregistré et VISIBLE \u2014 ' + (rep.champs || []).length + ' champ(s)';
      etat.className = 'admin-fiche__status admin-fiche__status--' + (rep.masquee ? 'warn' : 'ok');
    }
    var p = adminProduitPar(id);
    if (p) {
      Object.assign(p, corps);
      if (corps.images && corps.images.length)
        p.img = corps.images[0];
      var t = row.querySelector('.admin-row__title');
      if (t && corps.title)
        t.textContent = corps.title;
      var vign = row.querySelector('.admin-row__img');
      if (vign && p.img)
        vign.src = p.img;
    }
    A.toast('Fiche produit mise à jour', 'success');
  }).catch(function (err) {
    if (etat) {
      etat.textContent = 'Refusé : ' + err.message;
      etat.className = 'admin-fiche__status admin-fiche__status--err';
    }
    A.toast('Fiche NON enregistrée : ' + err.message, 'error');
  }).then(function () {
    btn.disabled = false;
  });
}

function adminOption(current, value, label) {
  var sel = current === value ? ' selected' : '';
  return '<option value="' + value + '"' + sel + '>' + label + '</option>';
}

function initAdminInstagram() {
  var loadAccBtn = document.getElementById('igLoadAccount');
  if (loadAccBtn && !loadAccBtn._igBound) {
    loadAccBtn._igBound = true;
    loadAccBtn.addEventListener('click', function () {
      loadAccBtn.disabled = true;
      loadAccBtn.textContent = 'Chargement\u2026';
      A.igApiFetch('account', 'GET').then(function (res) {
        loadAccBtn.disabled = false;
        loadAccBtn.textContent = 'Charger le compte';
        var infoEl = document.getElementById('igAccountInfo');
        if (!infoEl)
          return;
        if (!res.ok || !res.data.ok) {
          infoEl.hidden = false;
          infoEl.innerHTML = '<p class="ig-error">' + A.escapeHTML(res.data.error || 'Erreur') + '</p>';
          return;
        }
        var a = res.data.account;
        infoEl.hidden = false;
        infoEl.innerHTML = '<div class="ig-account-card">' + (a.profile_picture_url ? '<img src="' + A.escapeHTML(a.profile_picture_url) + '" alt="Photo de profil" class="ig-avatar">' : '') + '<div class="ig-account-details">' + '<strong class="ig-username">@' + A.escapeHTML(a.username || '') + '</strong>' + (a.name ? '<span class="ig-name">' + A.escapeHTML(a.name) + '</span>' : '') + '<div class="ig-stats">' + '<span>' + (a.followers_count || 0) + ' abonnés</span>' + '<span>' + (a.follows_count || 0) + ' abonnements</span>' + '<span>' + (a.media_count || 0) + ' publications</span>' + '</div>' + (a.biography ? '<p class="ig-bio">' + A.escapeHTML(a.biography) + '</p>' : '') + '</div></div>';
      }).catch(function (err) {
        loadAccBtn.disabled = false;
        loadAccBtn.textContent = 'Charger le compte';
        var infoEl = document.getElementById('igAccountInfo');
        if (infoEl) {
          infoEl.hidden = false;
          infoEl.innerHTML = '<p class="ig-error">Réseau : ' + A.escapeHTML(err.message) + '</p>';
        }
      });
    });
  }
  var exchangeBtn = document.getElementById('igExchangeToken');
  if (exchangeBtn && !exchangeBtn._igBound) {
    exchangeBtn._igBound = true;
    exchangeBtn.addEventListener('click', function () {
      exchangeBtn.disabled = true;
      exchangeBtn.textContent = 'Échange en cours\u2026';
      A.igApiFetch('exchange-token', 'GET').then(function (res) {
        exchangeBtn.disabled = false;
        exchangeBtn.textContent = 'Échanger pour token 60 jours';
        var resultEl = document.getElementById('igTokenResult');
        if (!resultEl)
          return;
        resultEl.hidden = false;
        if (!res.ok || !res.data.ok) {
          resultEl.innerHTML = '<p class="ig-error">' + A.escapeHTML(res.data.error || 'Erreur') + '</p>';
          return;
        }
        resultEl.innerHTML = '<div class="ig-token-card">' + '<p class="ig-token-success">Token longue durée généré (' + (res.data.expires_in_days || '?') + ' jours)</p>' + '<p class="admin-hint">Copie ce token et mets-le à jour sur Vercel :</p>' + '<textarea class="ig-token-textarea" rows="3" readonly onclick="this.select()">' + A.escapeHTML(res.data.access_token || '') + '</textarea>' + '<p class="admin-hint">Vercel \u2192 Settings \u2192 Environment Variables \u2192 META_ACCESS_TOKEN \u2192 Edit \u2192 Colle \u2192 Save</p>' + '</div>';
      }).catch(function (err) {
        exchangeBtn.disabled = false;
        exchangeBtn.textContent = 'Échanger pour token 60 jours';
        var resultEl = document.getElementById('igTokenResult');
        if (resultEl) {
          resultEl.hidden = false;
          resultEl.innerHTML = '<p class="ig-error">Réseau : ' + A.escapeHTML(err.message) + '</p>';
        }
      });
    });
  }
  var loadMediaBtn = document.getElementById('igLoadMedia');
  if (loadMediaBtn && !loadMediaBtn._igBound) {
    loadMediaBtn._igBound = true;
    loadMediaBtn.addEventListener('click', A.igLoadMedia);
  }
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
      if (!imgUrl) {
        A.toast('Ajoute une URL d\'image', 'error');
        return;
      }
      if (previewEl)
        previewEl.hidden = false;
      if (previewImg)
        previewImg.src = imgUrl;
      if (previewCap)
        previewCap.textContent = caption || '(pas de légende)';
      if (publishBtn)
        publishBtn.disabled = false;
    });
  }
  var publishForm = document.getElementById('igPublishForm');
  if (publishForm && !publishForm._igBound) {
    publishForm._igBound = true;
    publishForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var imgUrl = (document.getElementById('igImageUrl').value || '').trim();
      var caption = (document.getElementById('igCaption').value || '').trim();
      var statusEl = document.getElementById('igPublishStatus');
      if (!imgUrl)
        return;
      if (publishBtn)
        publishBtn.disabled = true;
      if (statusEl) {
        statusEl.textContent = 'Création du brouillon\u2026';
        statusEl.className = 'admin-row__status';
      }
      A.igApiFetch('publish-start', 'POST', {
        image_url: imgUrl,
        caption: caption
      }).then(function (res) {
        if (!res.ok || !res.data.ok) {
          if (statusEl) {
            statusEl.textContent = 'Erreur : ' + (res.data.error || 'Inconnue');
            statusEl.className = 'admin-row__status admin-row__status--err';
          }
          if (publishBtn)
            publishBtn.disabled = false;
          return;
        }
        A._igDraftCreationId = res.data.creation_id;
        if (statusEl) {
          statusEl.textContent = 'Brouillon prêt !';
          statusEl.className = 'admin-row__status admin-row__status--ok';
        }
        var draftEl = document.getElementById('igDraftConfirm');
        if (draftEl)
          draftEl.hidden = false;
      }).catch(function (err) {
        if (statusEl) {
          statusEl.textContent = 'Réseau : ' + err.message;
          statusEl.className = 'admin-row__status admin-row__status--err';
        }
        if (publishBtn)
          publishBtn.disabled = false;
      });
    });
  }
  var confirmBtn = document.getElementById('igConfirmPublish');
  if (confirmBtn && !confirmBtn._igBound) {
    confirmBtn._igBound = true;
    confirmBtn.addEventListener('click', function () {
      if (!A._igDraftCreationId)
        return;
      confirmBtn.disabled = true;
      var statusEl = document.getElementById('igConfirmStatus');
      if (statusEl) {
        statusEl.textContent = 'Publication\u2026';
        statusEl.className = 'admin-row__status';
      }
      A.igApiFetch('publish-finish', 'POST', { creation_id: A._igDraftCreationId }).then(function (res) {
        confirmBtn.disabled = false;
        if (!res.ok || !res.data.ok) {
          if (statusEl) {
            statusEl.textContent = 'Erreur : ' + (res.data.error || 'Inconnue');
            statusEl.className = 'admin-row__status admin-row__status--err';
          }
          return;
        }
        if (statusEl) {
          statusEl.textContent = 'Publié !';
          statusEl.className = 'admin-row__status admin-row__status--ok';
        }
        A.toast('Post Instagram publié !', 'success');
        A._igDraftCreationId = null;
        var form = document.getElementById('igPublishForm');
        if (form)
          form.reset();
        var previewEl = document.getElementById('igPreview');
        if (previewEl)
          previewEl.hidden = true;
        var draftEl = document.getElementById('igDraftConfirm');
        if (draftEl)
          draftEl.hidden = true;
        if (publishBtn)
          publishBtn.disabled = true;
        A.igLoadMedia();
      }).catch(function (err) {
        confirmBtn.disabled = false;
        if (statusEl) {
          statusEl.textContent = 'Réseau : ' + err.message;
          statusEl.className = 'admin-row__status admin-row__status--err';
        }
      });
    });
  }
  var cancelBtn = document.getElementById('igCancelPublish');
  if (cancelBtn && !cancelBtn._igBound) {
    cancelBtn._igBound = true;
    cancelBtn.addEventListener('click', function () {
      A._igDraftCreationId = null;
      var draftEl = document.getElementById('igDraftConfirm');
      if (draftEl)
        draftEl.hidden = true;
      if (publishBtn)
        publishBtn.disabled = false;
      var statusEl = document.getElementById('igPublishStatus');
      if (statusEl)
        statusEl.textContent = '';
    });
  }
  var loadCommBtn = document.getElementById('igLoadComments');
  if (loadCommBtn && !loadCommBtn._igBound) {
    loadCommBtn._igBound = true;
    loadCommBtn.addEventListener('click', function () {
      var mediaId = (document.getElementById('igMediaIdInput').value || '').trim();
      if (!mediaId) {
        A.toast('Entre un Media ID', 'error');
        return;
      }
      A.igLoadComments(mediaId);
    });
  }
  var insightsBtn = document.getElementById('igLoadInsights');
  if (insightsBtn && !insightsBtn._igBound) {
    insightsBtn._igBound = true;
    insightsBtn.addEventListener('click', function () {
      insightsBtn.disabled = true;
      insightsBtn.textContent = 'Chargement\u2026';
      A.igApiFetch('insights', 'GET').then(function (res) {
        insightsBtn.disabled = false;
        insightsBtn.textContent = 'Charger les stats';
        var dataEl = document.getElementById('igInsightsData');
        if (!dataEl)
          return;
        if (!res.ok || !res.data.ok) {
          dataEl.innerHTML = '<p class="ig-error">' + A.escapeHTML(res.data.error || 'Erreur') + '</p>';
          return;
        }
        if (res.data.warning) {
          dataEl.innerHTML = '<p class="admin-hint">' + A.escapeHTML(res.data.warning) + '</p>';
          return;
        }
        var insights = res.data.insights || [];
        if (insights.length === 0) {
          dataEl.innerHTML = '<p class="admin-hint">Pas encore de données disponibles.</p>';
          return;
        }
        dataEl.innerHTML = '<div class="ig-insights-grid">' + insights.map(function (m) {
          var val = m.values && m.values.length ? m.values[m.values.length - 1].value : '\u2014';
          return '<div class="ig-insight-card">' + '<span class="ig-insight-label">' + A.escapeHTML(m.title || m.name || '') + '</span>' + '<strong class="ig-insight-value">' + A.escapeHTML(String(val)) + '</strong>' + (m.description ? '<small class="ig-insight-desc">' + A.escapeHTML(m.description) + '</small>' : '') + '</div>';
        }).join('') + '</div>';
      }).catch(function (err) {
        insightsBtn.disabled = false;
        insightsBtn.textContent = 'Charger les stats';
        var dataEl = document.getElementById('igInsightsData');
        if (dataEl)
          dataEl.innerHTML = '<p class="ig-error">Réseau : ' + A.escapeHTML(err.message) + '</p>';
      });
    });
  }
}

window.__PT_ADMIN = { adminFetch: adminFetch, loadAdminStats: loadAdminStats, renderAdminStats: renderAdminStats, buildAdminGlobe: buildAdminGlobe, sendAdminReport: sendAdminReport, loadAdminClients: loadAdminClients, renderAdminClients: renderAdminClients, comptaState: comptaState, comptaSetChecked: comptaSetChecked, comptaCopy: comptaCopy, comptaFallbackCopy: comptaFallbackCopy, renderAdminCompta: renderAdminCompta, comptaBrancherReconciliation: comptaBrancherReconciliation, comptaBrancherOrdreTest: comptaBrancherOrdreTest, comptaBrancherWebhook: comptaBrancherWebhook, comptaBrancherRelire: comptaBrancherRelire, comptaBrancherSante: comptaBrancherSante, comptaBrancherPing: comptaBrancherPing, comptaLoadAccounting: comptaLoadAccounting, comptaChargesHtml: comptaChargesHtml, comptaBrancherCharges: comptaBrancherCharges, comptaRemboursementsHtml: comptaRemboursementsHtml, comptaBrancherRemboursements: comptaBrancherRemboursements, comptaRenderAccounting: comptaRenderAccounting, comptaLoadCalc: comptaLoadCalc, comptaRenderCalc: comptaRenderCalc, ligneMouvementPrix: ligneMouvementPrix, loadAdminPriceMoves: loadAdminPriceMoves, loadAdminMargins: loadAdminMargins, renderAdminMargins: renderAdminMargins, renderAdminFisc: renderAdminFisc, renderAdminInvoices: renderAdminInvoices, comptaBuildInvoices: comptaBuildInvoices, loadAdminPartners: loadAdminPartners, adminPartnerFormHTML: adminPartnerFormHTML, renderAdminPartnerPhotos: renderAdminPartnerPhotos, bindAdminPartnerForm: bindAdminPartnerForm, renderAdminPartners: renderAdminPartners, loadAdminInviteCodes: loadAdminInviteCodes, bindAdminInviteCodeCreate: bindAdminInviteCodeCreate, loadAdminApplications: loadAdminApplications, renderAdminCourierBareme: renderAdminCourierBareme, loadAdminCouriers: loadAdminCouriers, adminCourierSection: adminCourierSection, adminCourierDossierHTML: adminCourierDossierHTML, adminCourierFicheHTML: adminCourierFicheHTML, reviewCourier: reviewCourier, ajoutProduitMsg: ajoutProduitMsg, adminApercuImage: adminApercuImage, ajoutProduitSpecs: ajoutProduitSpecs, ajoutProduitLigneSpec: ajoutProduitLigneSpec, ajoutProduitCorps: ajoutProduitCorps, renderAjoutProduit: renderAjoutProduit, renderAdmin: renderAdmin, adminBrancherSansReleve: adminBrancherSansReleve, loadAdminOrders: loadAdminOrders, adminProdFiltres: adminProdFiltres, renderAdminList: renderAdminList, adminProduitPar: adminProduitPar, adminBasculerFiche: adminBasculerFiche, adminFicheHtml: adminFicheHtml, adminLigneSpecHtml: adminLigneSpecHtml, adminLigneFeatHtml: adminLigneFeatHtml, adminVisuelHtml: adminVisuelHtml, adminAjouterLigneSpec: adminAjouterLigneSpec, adminAjouterLigneFeat: adminAjouterLigneFeat, adminImageATransparence: adminImageATransparence, adminEncoderSansPerdreLeFond: adminEncoderSansPerdreLeFond, adminPreparerImage: adminPreparerImage, adminReduireImage: adminReduireImage, adminBrancherAjoutImage: adminBrancherAjoutImage, adminEnregistrerFiche: adminEnregistrerFiche, adminOption: adminOption, initAdminInstagram: initAdminInstagram };
})(window.__PT_ADMIN_CTX);
