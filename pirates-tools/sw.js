/* sw.js — Pirates Tools (PWA) */
const VERSION        = 'pt-v536';                    // version du SW (logique SW)
const STATIC_CACHE   = `pt-static-${VERSION}`;
const RUNTIME_CACHE  = `pt-runtime-${VERSION}`;
const IMG_CACHE      = `pt-img-${VERSION}`;
const DATA_CACHE     = `pt-data-${VERSION}`;
const ORIGIN         = self.location.origin;

// Aligner avec le HTML (cache-busting des assets) — garde-fou CI :
// scripts/check-asset-versions.js casse la CI si sw.js et index.html divergent.
const ASSET_VER = '536';

// Icônes + manifest : fingerprint STABLE, séparé d'ASSET_VER. Ces fichiers ne
// changent pas à chaque déploiement — les re-cache-buster à chaque bump forçait
// leur re-téléchargement (~300 Ko) à chaque install, et le précache (?v=bump)
// ne matchait JAMAIS les requêtes de la page (restées sur l'ancien ?v=) →
// chaque asset téléchargé DEUX fois et stocké en double (STATIC + IMG cache).
// DOIT rester égal aux ?v= des icônes/manifest dans index.html (CI le vérifie).
const ICON_VER       = '421';

// Production = Vercel (pirates-tools.com), servi à la racine (/).
// On garde des chemins relatifs (./) pour que le SW fonctionne à l'identique
// en local, en preview Vercel et en production.
// NB : pas d'entrée './' — handleNavigate ne lit que la clé './index.html' ;
// précacher './' téléchargeait index.html une 2e fois pour une clé morte.
const APP_SHELL = [
  './index.html',                 // clé canonique unique du shell (fallback offline)
  `./styles.css?v=${ASSET_VER}`,
  `./app.js?v=${ASSET_VER}`,
  `./manifest.webmanifest?v=${ICON_VER}`,
  `./icons/icon-180.png?v=${ICON_VER}`,
  `./icons/icon-192.png?v=${ICON_VER}`,
  `./icons/icon-256.png?v=${ICON_VER}`,
  `./icons/icon-384.png?v=${ICON_VER}`,
  `./icons/icon-512.png?v=${ICON_VER}`
  // pirates-tools-logo.png retiré du précache : jamais affiché (poids mort).
];

// Utilitaires
const isGET = req => (req.method || 'GET').toUpperCase() === 'GET';
const sameOrigin = url => url.origin === ORIGIN;
const ext = p => (p.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
const isNav = evt => evt.request.mode === 'navigate';

// Précharger en douceur en ignorant les erreurs individuelles
async function precacheShell() {
  const c = await caches.open(STATIC_CACHE);
  await Promise.all(APP_SHELL.map(async (u) => {
    try {
      const r = await fetch(u, { cache:'no-store' });
      if (r && r.ok) await c.put(u, r.clone());
    } catch(e){ console.warn('[SW] precache skip:', u, e.message); }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      await precacheShell();
      await self.skipWaiting();
    } catch(_){}
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // navigationPreload doit être activé à l'ACTIVATE (à l'install, aucun worker
    // actif → l'appel n'a pas d'effet et peut rejeter).
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch(_){}
    }
    // Supprime les anciens caches
    const keep = new Set([STATIC_CACHE, RUNTIME_CACHE, IMG_CACHE, DATA_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.map(n => keep.has(n) ? null : caches.delete(n)));
    await self.clients.claim();
  })());
});

// Network helpers
async function fromCache(cacheName, request) {
  const c = await caches.open(cacheName);
  const m = await c.match(request, { ignoreVary:true });
  return m || null;
}
async function putCache(cacheName, request, response) {
  try {
    const c = await caches.open(cacheName);
    await c.put(request, response.clone());
  } catch(_){}
}
function timeout(ms, promise){
  return new Promise((resolve, reject)=>{
    const id = setTimeout(()=>reject(new Error('timeout')), ms);
    promise.then(v=>{ clearTimeout(id); resolve(v); }, e=>{ clearTimeout(id); reject(e); });
  });
}

/* ⛔ PAGE DE SECOURS — remplace un `Response.redirect('./')` qui BOUCLAIT.
   PANNE VÉCUE le 29/07/2026 (pirates-tools.com noir, chargement sans fin,
   AUCUN bouton) : le dernier recours de handleNavigate renvoyait
   `Response.redirect('./', 302)`. Or pour une navigation vers `/`, `./` résout
   vers… `/`. La page se redirigeait donc VERS ELLE-MÊME, indéfiniment.
   Reproduit et mesuré : `net::ERR_TOO_MANY_REDIRECTS` (tests/sw-navigation.mjs,
   caches vidés + serveur éteint).
   Conséquence exacte du symptôme observé : AUCUN octet de HTML n'est jamais
   rendu → aucun script ne s'exécute → le watchdog de index.html ne part pas →
   pas de bouton « Recharger ». L'utilisateur n'a strictement aucune sortie.
   ⚠️ Et ça ne frappait QUE le domaine : un Service Worker est enregistré PAR
   ORIGINE. ish-ebon.vercel.app, mêmes fichiers, n'en a pas → il marchait.
   RÈGLE GRAVÉE : un dernier recours ne renvoie JAMAIS de redirection. Il rend
   une page autonome, lisible, qui dit ce qui se passe et offre une sortie.
   Aucune ressource externe (le réseau est justement coupé), aucun script
   (rien ne garantit qu'il serait autorisé), un simple lien qui fonctionne. */
function pageDeSecours(pathname){
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<title>Pirates Tools — connexion indisponible</title><style>'
    + 'html,body{margin:0;height:100%;background:#0b0b12;color:#e9e9f2;'
    + 'font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
    + 'main{max-width:34rem;margin:0 auto;padding:18vh 1.5rem 3rem;text-align:center}'
    + 'h1{font-size:1.4rem;margin:0 0 .8rem;color:#fbbf24}'
    + 'p{margin:0 0 1rem;color:#b9b9c9}code{color:#8B5CF6;word-break:break-all}'
    + 'a{display:inline-block;margin-top:1rem;padding:.85rem 1.6rem;border-radius:999px;'
    + 'background:#8B5CF6;color:#fff;text-decoration:none;font-weight:600}'
    + '</style></head><body><main>'
    + '<h1>Connexion indisponible</h1>'
    + '<p>Le site n\'a pas pu être chargé et aucune version hors ligne n\'est '
    + 'disponible sur cet appareil.</p>'
    + '<p>Vérifie ta connexion, puis réessaie.</p>'
    + '<a href="/">Réessayer</a>'
    + '<p style="margin-top:2rem;font-size:.8rem">Page demandée : <code>'
    + pathname.replace(/[<>&"]/g, '') + '</code></p>'
    + '</main></body></html>';
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

// Stratégies
async function handleNavigate(event){
  // Navigation : preload/réseau, sinon fallback index.html en cache.
  // IMPORTANT : seul le shell racine (/ ou /index.html) a le droit de rafraîchir
  // la clé './index.html'. Toute autre navigation (docs/, page 404…) ne doit
  // JAMAIS écraser le shell hors-ligne (sinon empoisonnement du cache).
  const url = new URL(event.request.url);
  const isShell = url.pathname === '/' || url.pathname === '/index.html';

  // Une panne SERVEUR (5xx) n'est pas une réponse : c'est une absence de
  // réponse habillée en HTTP. Si on a le shell en cache, il vaut infiniment
  // mieux qu'une page d'erreur Vercel — l'app est une SPA, elle repart du hash.
  // Un 404, lui, reste un 404 : c'est une information, on ne la masque pas.
  const utilisable = (r) => !!r && (r.ok || r.status < 500);

  try {
    const pre = await event.preloadResponse;
    if (pre) {
      if (isShell && pre.ok) putCache(STATIC_CACHE, './index.html', pre.clone());
      if (utilisable(pre)) return pre;
      const secours5xx = await fromCache(STATIC_CACHE, './index.html');
      if (secours5xx) return secours5xx;
      return pre;
    }
  } catch(_){}

  try {
    const net = await fetch(event.request);
    if (isShell && net && net.ok) putCache(STATIC_CACHE, './index.html', net.clone());
    if (utilisable(net)) return net;
    const secours5xx = await fromCache(STATIC_CACHE, './index.html');
    if (secours5xx) return secours5xx;
    return net;
  } catch(_){
    const cached = await fromCache(STATIC_CACHE, './index.html');
    if (cached) return cached;
    // ⛔ JAMAIS de redirection ici — voir pageDeSecours() ci-dessus.
    return pageDeSecours(url.pathname);
  }
}

async function handleProducts(request){
  // Network-first (avec timeout). Sur succès on met en cache ; sur erreur réseau
  // OU réponse non-ok (404/500), on bascule sur le cache — un 500 transitoire ne
  // doit pas battre une bonne copie en cache.
  try {
    const net = await timeout(4000, fetch(request));
    if (net && net.ok) { putCache(DATA_CACHE, request, net.clone()); return net; }
    // non-ok → tombe dans le fallback cache ci-dessous
  } catch(_){ /* erreur réseau → fallback cache */ }

  const cached = await fromCache(DATA_CACHE, request);
  if (cached) return cached;

  // Essaie l'autre chemin (data/ <-> racine)
  try {
    const url = new URL(request.url);
    const twin = url.pathname.endsWith('/products.json')
      ? url.pathname.replace('/products.json','/data/products.json')
      : url.pathname.replace('/data/products.json','/products.json');
    const altReq = new Request(`${url.origin}${twin}${url.search}`, { method:'GET' });
    const altCached = await fromCache(DATA_CACHE, altReq);
    if (altCached) return altCached;
  } catch(_){}

  // Rien en cache : catalogue vide (l'app a son propre fallback statique)
  return new Response('[]', { status:200, headers:{ 'Content-Type':'application/json' } });
}

// Dernier recours : une version en cache du MÊME chemin, en ignorant ?v=.
// Après un déploiement, app.js?v=NOUVEAU n'est pas encore en cache ; si le
// réseau hoquette à cet instant, renvoyer 504 = app.js jamais exécuté = page
// noire figée (vues .hidden, seul le HTML statique s'affiche). Une version
// légèrement périmée mais FONCTIONNELLE vaut toujours mieux qu'une page morte.
async function fromCacheAnyVersion(cacheName, request) {
  try {
    const c = await caches.open(cacheName);
    const m = await c.match(request, { ignoreVary:true, ignoreSearch:true });
    return m || null;
  } catch(_){ return null; }
}

async function handleStatic(event, request){
  // CSS/JS/Manifest/JSON (non data) -> stale-while-revalidate
  const cached = await fromCache(STATIC_CACHE, request);

  // ⚠️ UNE SEULE requête réseau, réutilisée dans les deux branches.
  // Avant : la revalidation partait TOUJOURS, puis la branche « rien en cache »
  // relançait un `fetch(request)` — donc app.js (205 Ko) et styles.css (60 Ko)
  // étaient demandés DEUX fois à chaque chargement à froid. L'user navigue
  // toujours en privé : chez lui, tout chargement est un chargement à froid.
  const reseau = fetch(request).then((net) => {
    if (net && net.ok) putCache(STATIC_CACHE, request, net.clone());
    return net;
  });

  if (cached) {
    // On ne laisse JAMAIS ce rejet sans preneur : une promesse rejetée passée à
    // waitUntil() peut faire tomber l'événement entier.
    event.waitUntil(reseau.catch(() => {}));
    return cached;
  }

  try {
    return await reseau;
  } catch(_){
    const anyVersion = await fromCacheAnyVersion(STATIC_CACHE, request);
    if (anyVersion) return anyVersion;
    // JAMAIS de corps vide — règle gravée après la panne v487 : un corps vide
    // fait échouer le .json() de l'appelant et Safari ne remonte qu'un
    // « TypeError » opaque, sans URL ni cause. On répond quelque chose de
    // LISIBLE, adapté au type demandé.
    const p = new URL(request.url).pathname;
    if (p.endsWith('.json') || p.endsWith('.webmanifest')) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Service Worker : réseau injoignable et aucune version en cache pour ' + p
      }), { status: 504, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('/* Service Worker : ' + p + ' injoignable, aucune version en cache */',
      { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function handleImage(request){
  // Images/icônes -> cache-first puis réseau.
  // STATIC_CACHE consulté AUSSI : les icônes du shell y sont précachées à
  // l'install — avant, ce précache n'était JAMAIS lu par ce handler (seule
  // IMG_CACHE l'était) → chaque icône précachée était re-téléchargée par la
  // page et stockée en double (~265 Ko de poids mort par install).
  const cached = await fromCache(IMG_CACHE, request);
  if (cached) return cached;
  const pre = await fromCache(STATIC_CACHE, request);
  if (pre) return pre;
  try {
    const net = await fetch(request);
    if (net && net.ok) {
      putCache(IMG_CACHE, request, net.clone());
    }
    return net;
  } catch(_){
    // Fallback icône — fromCache est async : il faut AWAIT chaque lookup,
    // sinon le `||` renvoie une Promise (toujours truthy) → respondWith(null).
    const c1 = await fromCache(STATIC_CACHE, `./icons/icon-256.png?v=${ICON_VER}`);
    if (c1) return c1;
    const c2 = await fromCache(STATIC_CACHE, './icons/icon-256.png');
    if (c2) return c2;
    // Image : un corps vide est ici SANS danger (aucun appelant ne le parse,
    // le navigateur affiche simplement une image cassée). On garde malgré tout
    // un statut explicite pour le diagnostic.
    return new Response('', { status: 504, headers: { 'X-PT-Reason': 'image-unavailable-offline' } });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!isGET(req)) return;

  const url = new URL(req.url);

  // Laisse passer les requêtes cross-origin (WhatsApp, fonts externes CDN, etc.)
  if (!sameOrigin(url)) return;

  // ⚠️ NE JAMAIS INTERCEPTER L'API. Les endpoints /api/* sont dynamiques et
  // authentifiés : les mettre en cache renvoie des données périmées (admin,
  // comptes, prix), et le repli « réponse vide 504 » du cas par défaut casse
  // l'appel côté client — Safari le signale par « TypeError: Type error ».
  // On laisse le navigateur les traiter lui-même, sans intermédiaire.
  if (url.pathname.indexOf('/api/') === 0 || url.pathname === '/api') return;

  // 1) Navigation (SPA hash routes)
  if (isNav(event)) {
    event.respondWith(handleNavigate(event));
    return;
  }

  const pathname = url.pathname;
  const e = ext(pathname);

  // 2) Produits JSON (data/products.json ou products.json)
  if (pathname.endsWith('/data/products.json') || pathname.endsWith('/products.json')) {
    event.respondWith(handleProducts(req));
    return;
  }

  // 3) Images & icônes
  if (['png','jpg','jpeg','webp','gif','svg','ico'].includes(e)) {
    event.respondWith(handleImage(req));
    return;
  }

  // 4) CSS / JS / Manifest / Maps / Polices / JSON (hors data/products)
  if (['css','js','mjs','map','webmanifest','woff2','woff','ttf','otf','json'].includes(e)) {
    event.respondWith(handleStatic(event, req));
    return;
  }

  // 5) Par défaut : passe au réseau (et met en cache léger si 200)
  event.respondWith((async ()=>{
    try {
      const net = await fetch(req);
      if (net && net.ok && sameOrigin(url)) { putCache(RUNTIME_CACHE, req, net.clone()); }
      return net;
    } catch(err){
      const cached = await fromCache(RUNTIME_CACHE, req) || await fromCache(STATIC_CACHE, req);
      if (cached) return cached;
      // JAMAIS de corps vide : un `new Response('')` fait échouer le .json()
      // de l'appelant, et le navigateur ne remonte qu'un « TypeError » opaque
      // qui ne dit ni l'URL ni la cause. On répond une erreur LISIBLE.
      return new Response(JSON.stringify({
        ok: false,
        error: 'Service Worker : réseau injoignable et rien en cache pour ' + url.pathname,
        detail: String((err && err.message) || err || 'network error')
      }), { status: 504, headers: { 'Content-Type': 'application/json' } });
    }
  })());
});

// Messages depuis l'app (mise à jour souple)
self.addEventListener('message', (e) => {
  const data = e && e.data;
  if (!data) return;

  if (data === 'SKIP_WAITING' || (data && data.type) === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data === 'CLEAR_OLD_CACHES' || (data && data.type) === 'CLEAR_OLD_CACHES') {
    // e.waitUntil : garde le SW en vie jusqu'à la fin du nettoyage (sinon il peut
    // être terminé au milieu des suppressions).
    e.waitUntil((async ()=> {
      const keep = new Set([STATIC_CACHE, RUNTIME_CACHE, IMG_CACHE, DATA_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.map(n => keep.has(n) ? null : caches.delete(n)));
    })());
  }
});