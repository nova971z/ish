/* check-analytics.js — Garde-fou de la logique PURE de mesure d'audience.
   Exporté comme les autres checks : retourne un tableau d'erreurs (vide = OK).
   Teste api/_lib/analytics.js sans Firestore ni réseau. */
'use strict';

var A = require('../api/_lib/analytics');

module.exports = function checkAnalytics() {
  var errors = [];
  function ok(cond, msg) { if (!cond) errors.push('[analytics] ' + msg); }

  // ── sanitizeEvent ─────────────────────────────────────────────────────────
  ok(A.sanitizeEvent({ event: 'inconnu' }) === null, 'événement hors allowlist doit être rejeté');
  ok(A.sanitizeEvent(null) === null, 'entrée nulle rejetée');
  var vi = A.sanitizeEvent({ event: 'view_item', id: 'makita-dga504z', category: 'Meuleuses', junk: 1 });
  ok(vi && vi.name === 'view_item' && vi.id === 'makita-dga504z', 'view_item nettoyé conserve id');
  ok(vi && vi.junk === undefined, 'champ inconnu (junk) jeté');
  // PII rejetée comme identifiant
  ok(A.sanitizeEvent({ event: 'view_item', id: 'a@b.com' }).id === undefined, 'un email ne peut pas être un id');
  ok(A.sanitizeEvent({ event: 'click', t: 'appelez 0692445566' }).t === undefined, 'un numéro rejeté comme cible');
  // ms borné
  var t = A.sanitizeEvent({ event: 'time_on_item', id: 'p1', ms: 9999999999 });
  ok(t && t.ms === 1800000, 'ms borné à 30 min');
  ok(A.sanitizeEvent({ event: 'time_on_item', id: 'p1', ms: -5 }).ms === 0, 'ms négatif ramené à 0');

  // ── isBot (filtrage robots) ─────────────────────────────────────────────────
  var HUMANS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
    'Mozilla/5.0 (Linux; Android 10; CUBOT_X20_PRO) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' // Cubot = VRAI tel
  ];
  HUMANS.forEach(function (ua, i) { ok(A.isBot(ua) === false, 'humain #' + i + ' non filtré (' + ua.slice(0, 24) + '…)'); });

  var BOTS = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
    'Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)',
    'python-requests/2.31.0', 'curl/8.4.0', 'Wget/1.21.3',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0 Safari/537.36',
    'WhatsApp/2.23.20.0', 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
    'Go-http-client/2.0', 'Chrome-Lighthouse'
  ];
  BOTS.forEach(function (ua, i) { ok(A.isBot(ua) === true, 'bot #' + i + ' filtré (' + ua.slice(0, 24) + '…)'); });
  ok(A.isBot('') === true, 'UA vide = bot');
  ok(A.isBot(null) === true, 'UA absent = bot');

  // ── deriveGeo (jamais d'IP) ────────────────────────────────────────────────
  var geo = A.deriveGeo({ 'x-vercel-ip-country': 'fr', 'x-vercel-ip-city': 'Pointe-%C3%A0-Pitre',
    'x-vercel-ip-latitude': '16.24', 'x-vercel-ip-longitude': '-61.53', 'x-real-ip': '1.2.3.4' });
  ok(geo && geo.country === 'FR', 'pays normalisé en majuscules');
  ok(geo && geo.lat === 16.24 && geo.lng === -61.53, 'lat/lng parsés');
  ok(JSON.stringify(geo).indexOf('1.2.3.4') === -1, "l'IP n'apparaît JAMAIS dans la géo");
  ok(A.deriveGeo({}) === null, 'sans pays → pas de géo');
  // RÉGRESSION : une ville avec un %encodage malformé ne doit PAS faire planter
  // deriveGeo (sinon /api/events → 500 → plus aucun événement enregistré).
  var geoBad;
  var threw = false;
  try { geoBad = A.deriveGeo({ 'x-vercel-ip-country': 'gp', 'x-vercel-ip-city': 'Pointe-%E0-Pitre%' }); }
  catch (_) { threw = true; }
  ok(!threw, 'deriveGeo ne jette JAMAIS, même sur ville %malformée');
  ok(geoBad && geoBad.country === 'GP', 'pays conservé malgré la ville invalide');

  // ── planWrites ─────────────────────────────────────────────────────────────
  var day = A.dateKey(Date.UTC(2026, 6, 17)); // 2026-07-17
  ok(day === '2026-07-17', 'dateKey UTC correct: ' + day);

  // Sans consentement : agrégats oui, profil visiteur NON.
  var opsNo = A.planWrites({
    events: [ { name: 'session_start' }, { name: 'view_item', id: 'p1', category: 'Meuleuses' },
              { name: 'click', t: 'dock:panier' } ],
    geo: { country: 'FR', lat: 1, lng: 2 }, device: 'mobile', source: 'instagram',
    consent: false, visitorId: 'v-123', nowMs: Date.UTC(2026, 6, 17)
  });
  var daily = opsNo.find(function (o) { return o.coll === 'analytics_daily'; });
  ok(daily && daily.inc.sessions === 1, 'session comptée');
  ok(daily && daily.inc.pageViews === undefined, 'pas de page_view ici');
  ok(daily && daily.inc['device.mobile'] === 1, 'appareil compté');
  ok(daily && daily.inc['source.instagram'] === 1, 'source comptée');
  ok(daily && daily.inc.clicks === 1, 'clic général compté');
  ok(opsNo.some(function (o) { return o.coll === 'analytics_clicks' && o.inc.count === 1; }), 'clic précis compté');
  ok(opsNo.some(function (o) { return o.coll === 'analytics_products' && o.doc === 'p1' && o.inc.views === 1; }), 'vue produit comptée');
  ok(opsNo.some(function (o) { return o.coll === 'analytics_geo' && o.doc === 'FR'; }), 'géo comptée');
  ok(!opsNo.some(function (o) { return o.coll === 'analytics_visitors'; }), 'AUCUN profil visiteur sans consentement');

  // Avec consentement : profil + affinité pondérée.
  var opsYes = A.planWrites({
    events: [ { name: 'view_item', id: 'p1', category: 'Meuleuses' },
              { name: 'add_to_quote', id: 'p1', category: 'Meuleuses' } ],
    geo: null, consent: true, visitorId: 'v-123', nowMs: 42
  });
  var vis = opsYes.find(function (o) { return o.coll === 'analytics_visitors'; });
  ok(vis && vis.doc === 'v-123', 'profil visiteur créé sous consentement');
  ok(vis && vis.inc['affProd.p1'] === 6, 'affinité produit = view(1)+add(5) = 6');
  ok(vis && vis.inc['affCat.Meuleuses'] === 6, 'affinité catégorie = 6');
  ok(vis && vis.firstSeenIfNew === 42, 'firstSeen prêt pour création');
  ok(vis && vis.inc.visits === 1, 'visite comptée sur le profil');

  // Nouveau vs récurrent : compté seulement sous consentement + flag nv.
  var opsNew = A.planWrites({ events: [ { name: 'session_start', nv: true } ], consent: true, visitorId: 'v-9', nowMs: 1 });
  var dNew = opsNew.find(function (o) { return o.coll === 'analytics_daily'; });
  ok(dNew && dNew.inc.newVisitors === 1 && dNew.inc.returningVisitors === undefined, 'nouveau visiteur compté');
  var opsRet = A.planWrites({ events: [ { name: 'session_start', nv: false } ], consent: true, visitorId: 'v-9', nowMs: 1 });
  var dRet = opsRet.find(function (o) { return o.coll === 'analytics_daily'; });
  ok(dRet && dRet.inc.returningVisitors === 1, 'visiteur récurrent compté');
  var opsAnon = A.planWrites({ events: [ { name: 'session_start', nv: true } ], consent: false, visitorId: 'v-9', nowMs: 1 });
  var dAnon = opsAnon.find(function (o) { return o.coll === 'analytics_daily'; });
  ok(dAnon && dAnon.inc.newVisitors === undefined && dAnon.inc.returningVisitors === undefined, 'anonyme : pas de nouveau/récurrent');

  // ── summarize (synthèse dashboard) ─────────────────────────────────────────
  var sum = A.summarize(
    [ { id: '2026-07-16', sessions: 5, pageViews: 12, clicks: 8, newVisitors: 3, returningVisitors: 2, device: { mobile: 4, desktop: 1 }, source: { google: 2, direct: 3 } },
      { id: '2026-07-17', sessions: 7, pageViews: 20, clicks: 10, newVisitors: 4, returningVisitors: 3, device: { mobile: 6, desktop: 1 }, source: { instagram: 5, direct: 2 } } ],
    [ { id: 'p1', views: 10, selects: 4, addToCart: 2, purchases: 1, timeMsTotal: 30000, timeSamples: 10 },
      { id: 'p2', views: 25, selects: 8, addToCart: 3, purchases: 0, timeMsTotal: 0, timeSamples: 0 } ],
    [ { id: 'c1', label: 'dock:panier', count: 9 }, { id: 'c2', label: 'chip:Meuleuses', count: 14 } ],
    [ { id: 'FR', country: 'FR', count: 8, lat: 46, lng: 2 }, { id: 'US', country: 'US', count: 3, lat: 38, lng: -97 } ]
  );
  ok(sum.totals.sessions === 12 && sum.totals.pageViews === 32, 'totaux sessions/pages cumulés');
  ok(sum.totals.newVisitors === 7 && sum.totals.returningVisitors === 5, 'nouveaux/récurrents cumulés');
  ok(sum.devices.mobile === 10 && sum.devices.desktop === 2, 'répartition appareils fusionnée');
  ok(sum.sources.direct === 5 && sum.sources.instagram === 5, 'sources fusionnées');
  ok(sum.daily[0].date === '2026-07-16' && sum.daily[1].date === '2026-07-17', 'série triée par date');
  ok(sum.products[0].productId === 'p2' && sum.products[0].views === 25, 'produits triés par vues');
  ok(sum.products[1].avgTimeMs === 3000, 'temps moyen = total/échantillons');
  ok(sum.products.find(function (p) { return p.productId === 'p2'; }).avgTimeMs === 0, 'temps moyen 0 si aucun échantillon (pas de division par zéro)');
  ok(sum.clicks[0].label === 'chip:Meuleuses' && sum.clicks[0].count === 14, 'clics triés desc');
  ok(sum.geo[0].country === 'FR' && sum.geo[0].count === 8, 'géo triée desc');

  // ── Rapport mensuel + purge ─────────────────────────────────────────────────
  var now = Date.UTC(2026, 6, 17); // 17/07/2026
  var rep = A.buildReport(sum, now);
  ok(rep.period === 'juillet 2026', 'période FR: ' + rep.period);
  ok(rep.periodKey === '2026-07', 'clé période: ' + rep.periodKey);
  ok(A.reportFilename(rep) === 'pirates-tools-analytics-2026-07.json', 'nom de fichier JSON');
  ok(rep.totals.sessions === 12 && Array.isArray(rep.topProducts), 'rapport porte totaux + top produits');
  var html = A.renderReportHtml(rep);
  ok(/Rapport d'audience/.test(html) && /juillet 2026/.test(html), 'HTML rapport rendu');
  ok(html.indexOf('<script') === -1, 'HTML rapport sans script');
  var cut = A.purgeCutoffs(now);
  ok(cut.dailyBefore === '2025-05-17', 'seuil purge daily = 14 mois avant (' + cut.dailyBefore + ')');
  ok(cut.visitorLastSeenBefore < now && (now - cut.visitorLastSeenBefore) > 300 * 24 * 3600 * 1000, 'seuil visiteurs ~13 mois');

  return errors;
};

// Exécution directe (dev) : affiche le résultat.
if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('❌ ' + e); }); process.exit(1); }
  console.log('✅ check-analytics : toutes les assertions passent');
}
