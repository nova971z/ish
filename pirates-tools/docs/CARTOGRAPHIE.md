# 🗺️ CARTOGRAPHIE — Pirates Tools (carte de vol du code)

> **But** : aller DROIT À LA SOURCE quand on travaille sur le site. Où est quoi,
> comment c'est fait, et les pièges à ne pas oublier. Précision militaire.
>
> **⚠️ Numéros de ligne = ancres approximatives.** Le code bouge à chaque
> commit. Si le numéro est décalé de quelques dizaines de lignes, **cherche par
> NOM de fonction/constante** (ils sont tous cités) : c'est la vraie clé.
> Dernière mise à jour de la carte : session du 24/07/2026 (SW v406).
>
> Fichiers de référence (source de vérité MÉTIER, à lire avant d'agir) :
> `../CLAUDE.md` (mémoire projet), `docs/REGLES-PRODUITS.md` (prix/posters),
> `docs/PACK-3D-LAYOUT.md` + `../CLAUDE.md §RÈGLES PACKS 3D` (packs 3D).

---

## 0. VUE D'ENSEMBLE

| Élément | Détail |
|---|---|
| **Type** | PWA e-commerce vanilla (HTML/CSS/JS), **aucun framework**, **aucun build** |
| **Prod** | Vercel → domaine `pirates-tools.com`. Déploie **uniquement `master`**. |
| **Backend** | Vercel serverless (`api/`, Node 22.x) + Firebase/Firestore + Stripe + Resend |
| **Deps** | `stripe@^14`, `firebase-admin@^12` (c'est TOUT côté serveur) |
| **Client** | `app.js` (~8 560 lignes, **UN SEUL IIFE**, style ES5 `var`/`function`), `styles.css` (~7 700 lignes), `index.html` (~1 620 lignes), `sw.js` |
| **Données** | `products.json` (206 produits, **tableau JSON brut**), pas de dossier `data/` |
| **Workflow** | 1 étape = 1 problème = 1 commit = 1 vérif verte (`node scripts/ci.js`). Travail direct sur `master`. Bump SW à chaque changement d'asset. |
| **Mémoire projet** | `../CLAUDE.md` (un niveau AU-DESSUS de `pirates-tools/`) |

**Fichiers racine** : `index.html`, `app.js`, `styles.css`, `sw.js`, `products.json`,
`firebase-init.js`, `firebase.json`, `crypto-config.js`, `qrcode.js`,
`world-coastline.json`, `manifest.webmanifest`, `404.html`, `robots.txt`,
`sitemap.xml`, `README.txt`, `CHANGELOG.md`.

---

## 1. index.html — vues, routes, points de repère

### `<head>` (lignes ~3–131)
- **Script inline 1 — watchdog de boot** (~52–71) : au bout de 7 s, si
  `window.PT_BOOTED` absent → injecte `#ptBootWatchdog` (alerte + bouton
  Recharger). Anti-écran-noir.
- **Script inline 2 — config API/Stripe** (~78–81) : `window.PT_API_BASE=''`
  (serverless même origine) + `window.PT_STRIPE_PK='pk_live_…'`.
- **Script inline 3 — `PT_CRYPTO_CONFIG`** (~85–117) : réseaux crypto +
  `cardCheckout.url` + **`whatsappNumber:''`** ← SOURCE UNIQUE du numéro de contact.
- ⚠️ **Ces 3 scripts inline sont hashés (sha256) dans la CSP** (`vercel.json`).
  Les modifier → recalculer le hash (sinon page cassée en prod). Gardé vert par
  `scripts/check-csp.js`.
- CSS `styles.css?v=NNN` (~36) ; **JS `app.js?v=NNN` defer** (fin body ~1617) ;
  Stripe.js (~1616). `manifest.webmanifest?v=NNN` (~125).

### Vues SPA (`#view-*` + `data-route`) — le routeur bascule le `.hidden`
| id | route | Contenu clé |
|---|---|---|
| `view-home` | `/` | marques, bannière 3D, strip produits, récemment vus, abonnements, avis, newsletter |
| `view-catalogue` | `/catalogue` | `#q` (recherche), `#tag` (select), `#catList` (chips), `#list` (grille), **`#pager`** |
| `view-produit` | `/produit` | `#pdpHero`, **`#pdpVariant`** (switch solo/coffret), split 3D+specs, features, kit, CTA, avis, liés |
| `view-devis` | `/devis` | panier `#devisList`, livraison, fidélité, footer sticky |
| `view-compte` | `/compte` | onglets profil/commandes/paramètres (+ suppression compte RGPD) |
| `view-auth` | `/auth` | login / mot de passe oublié / inscription |
| `view-abonnement` | `/abonnement` | `#aboContent` (rendu JS) |
| `view-contact` | `/contact` | `#contactForm` (+ honeypot) |
| `view-wishlist` | `/favoris` | `#wishlistList` |
| `view-admin` | `/admin` | **`#adminView`** — TOUT l'admin est monté par JS ici (aucune sous-vue statique) |
| `view-territoire` | `/territoire` | atterrissage DOM-TOM (`#/guadeloupe`…`#/mayotte` y résolvent) |
| `view-merci` | `/merci` | confirmation paiement |
| `view-mentions` / `view-confidentialite` / `view-cgv` | pages légales | identité entreprise `[À COMPLÉTER]` |

### Points de repère fixes
`#skipLink` (137) · topbar (139 : `#menu-toggle`, `#terrBtn`/`#terrMenu`, `#fbBtn`,
`#igBtn`) · `#hero`/`#heroLogo` (177) · `#pt-loadbar` (189) · `<main id="app">` (192) ·
**`#payModal`** (1219 : onglets card/crypto, `#payAddress`, `#stripePaymentElement`,
`#stripeCardError`, `#cryptopayNets`, QR) · footer (1424) · **`#waFloat`** (1488) ·
`#consentBar` (1496) · **`#dock`** (1512 : accueil/catalogue/panier + appel/WhatsApp) ·
drawer `#side-menu` (1528) · `#toasts` (1602).

### Contact (numéro tél/WhatsApp) — attribut, pas de dur
Éléments câblés par attribut (le numéro vient de `PT_CRYPTO_CONFIG.whatsappNumber`,
**vide → masqués par `applyContactChannels()`**) : `data-contact="phone"|"wa"`,
`data-tel-link`/`data-tel-text`, `data-wa-link`/`data-wa-text`. Voir §PIÈGES.

---

## 2. app.js — carte par zone (IIFE unique, L5→8558)

| Zone | Lignes | Fonctions/état clés |
|---|---|---|
| **Helpers boot** | 8–76 | `escapeHTML` (36), `apiBaseUrl()` (43, lit `PT_API_BASE`), `jsonAuthHeaders()` (53, Bearer Firebase), `debounce`, `formatPrice` |
| **Moteur fiscal territoire** | 78–285 | `TERRITORIES` (86), `TAX_RULES_BY_NC` (99), `DEFAULT_TERRITORY='971'` (125), `_currentTerritory` (126), `calcPrice()` (155, **cœur prix client**), `getTerritory`, `setTerritory` (174), `setupTerritorySelector` (206) |
| **Analytics + consentement** | 287–512 | `track()` (312, central), `aTrack`/`aFlush` (beacon `/api/events`), `aInit` (493), consentement CNIL 2 niveaux |
| **Contact + bandeau conso** | 514–602 | `fmtPhone` (515), **`applyContactChannels()`** (528, masque tel/WhatsApp), `setupConsentBar` (558) |
| **Fidélité** | 604–669 | `LOYALTY_TIERS` (610), `getLoyaltyState` (647), `addLoyaltyPurchase` (664) |
| **WhatsApp + messages panier** | 671–770 | **`waLink()`** (672, vide si pas de `WA_PHONE`), `waCartMessage` (690), `findProductByKey` (714), `stockBadge` (740) |
| **DOM refs + panier** | 772–933 | `cacheDom()` (778), `CART_KEY` (821), **`WA_PHONE`** (827, depuis config), `addToCart`/`removeFromCart`/`updateQty`, `updateCartUI` (911) |
| **Page devis** | 935–1079 | `renderDevis()` (937), **`sendDevisWhatsApp()`** (1061) |
| **Chargement produits** | 1081–1193 | `loadProducts()` (1088, cascade cache→statique→api), `setProducts` (1184), état `products`/`allCategories`/`allBrands` |
| **Catalogue : grille/pagination/filtres** | 1195–1333 | `PAGE_SIZE=40` (1246), `renderPager` (1281), `renderGridPage` (1311), `filteredProducts` (1224, exclut `variantSecondary`), `productCardHTML` (1251) |
| **Sphères marques 3D (Three.js)** | 1335–1669 | `ensureThree()` (1432, lazy), **`ensureModelViewer()`** (1454, lazy), `createBrandSphere`, `initBrandSpheres` (1612), `renderBrandGrid` (1638) |
| **Strip produits accueil + passthrough 3D** | 1671–1759 | `renderHomeProducts` (1673), `setupModelViewerScrollPassthrough` (1702) |
| **PDP (fiche produit)** | 1761–2178 | `fitHeroPoster()` (1769), **`renderPDP(slug)`** (1842 : `variantSolo`/`variantCoffret` 1859, `setPdpViewer` 1932, `applyVariant` 1986, specs/features/kit, `initPdpScrollAnimations` 2094, add-to-cart/buy) |
| **Avis** | 2180–2350 | `setupReviews` (2214), avis accueil |
| **Graphique Plans (canvas)** | 2352–2659 | `_pDraw` (2437), `setupPlans` (2612) |
| **Carrousel 3D accueil** | 2740–2906 | `setup3DCarousel` (2785), `kickCarousel3D` |
| **Animations scroll PDP (lerp)** | 2908–3338 | **`initPdpScrollAnimations()`** (2921, moteur rAF, 10 étapes — FRAGILE, voir PIÈGES), `animateCounter` (3320) |
| **Abonnements** | 3340–3447 | `ABO_DATA` (3342), `renderAbonnement` (3407) |
| **Routeur (hash SPA)** | 3449–3669 | **`ROUTES`** (3451), `parseHash()` (3478, tolère `?query`), **`onRouteChange()`** (3501, gardes auth, bascule vues, focus a11y) |
| **Anim logo héros** | 3671–3752 | `heroTick` (3677), `startHeroLoop`/`stopHeroLoop` |
| **Focus trap + menu** | 3754–3826 | `trapFocus()` (3759, WCAG), `openMenu`/`closeMenu` |
| **Auth (Firebase)** | 3828–4065 | `_currentUser`/`_authReady` (3831), `initAuth()` (3894), `handleLogin/Register/ForgotPassword` (anti-énumération) |
| **Page compte** | 4067–4370 | `renderAccount` (4069), `handleAccountSave` (4149, email via verifyBeforeUpdate), **`handleDeleteAccount`** (4256, RGPD), `saveOrderToFirestore` (4359) |
| **PWA** | 4372–4407 | `initPWA()` (4376, register SW + prompt install) |
| **Binding events** | 4409–4583 | `bindEvents()` (4411, hashchange, délégations devis/dock/auth) |
| **Paiement + crypto** | 4585–5501 | `PT_CRYPTO_ENABLED=false` (4604), `ptCryptoCfg()` (4607), `applyCryptoVisibility` (4875), `openPayModal` (4950), `getStripe()` (5161, lit `PT_STRIPE_PK`), **`initStripeElements()`** (5173, POST create-payment-intent), `confirmPayment()` (5313), form adresse (5086) |
| **/merci + preuve paiement** | 5503–5620 | `merciPaymentProof` (5524, 3 preuves), `handleMerciPage` (5546) |
| **Reveal + loadbar + utils MV** | 5622–5754 | `preloadModelViewers` (5745), `getMvPreloadIO` (5729) |
| **Admin — auth/fetch** | 5756–5830 | `ADMIN_SECRET_KEY='pt_admin_secret'` (5760), `adminAuthHeaders` (5778), `adminFetch`/`adminGet`/`adminPostType` (5790–5818) |
| **Admin — Stats + globe 3D** | 5832–6214 | `renderAdminStats` (5884), `buildAdminGlobe` (6046), `sendAdminReport` (6190) |
| **Admin — Clients** | 6216–6258 | `loadAdminClients` (6218), `renderAdminClients` |
| **Admin — Comptabilité** | 6260–6661 | `COMPTA_VEILLE`/`COMPTA_DEVIS`, `renderAdminCompta` (6331), **`comptaRenderAccounting`** (6429, P&L + `ventes_par_marque` + charges), `comptaRenderCalc` (6571, config prix + reprice-all) |
| **Admin — Fiscalité** | 6663–6761 | `FISC_DECLARATIONS` (6665), `renderAdminFisc` (6712) |
| **Admin — Factures** | 6763–6847 | `renderAdminInvoices` (6764), `comptaBuildInvoices` (6776, identité vendeur + liste + vue facture) |
| **Admin — renderer principal + produits CRUD** | 6849–7309 | **`renderAdmin()`** (6849, gate login, onglets, dispatch), `renderAdminList` (7195, CRUD stock/prix), `loadAdminOrders` (7155) |
| **Admin — Instagram** | 7311–7685 | `initAdminInstagram` (7326) |
| **Contact + newsletter** | 7687–7818 | `setupContactForm` (7690), `setupNewsletterForm` (7758) |
| **Favoris** | 7820–7924 | `toggleWishlist` (7835), `renderWishlist` (7879) |
| **Récemment vus** | 7926–7981 | `addRecentlyViewed` (7931), `RECENT_MAX=8` |
| **SEO (JSON-LD + meta)** | 7983–8494 | `injectProductJsonLd` (7985), `injectOrganizationJsonLd` (8113, tél. seulement si `WA_PHONE`), `handleTerritoryRoute` (8305), `updateRouteMeta` (8433) |
| **Onglets compte + BOOT** | 8496–8558 | **`init()`** (8516, séquence de démarrage), `window.PT_BOOTED=true` (8549) |

**Lectures config globale** : `PT_API_BASE` (43), `PT_CRYPTO_CONFIG` (827 pour
WA_PHONE, 4607), `PT_STRIPE_PK` (5163), `PT_FIREBASE` (via `whenFirebaseReady` 3886).

---

## 3. styles.css — sections, tokens, z-index, print

Fichier ~7 700 lignes, sections **numérotées en commentaire** (§01→§45).

### Tokens `:root` (~31–78) — pour re-thématiser
`--bg:#0a0f14`, `--panel`, `--card`, `--fg`, `--muted`, `--border`, `--brand:#19d3ff`.
**Famille accent (violet dominant, LES 5 valeurs à éditer pour retheming global)** :
`--accent:#8B5CF6`, `--accent-rgb:139,92,246`, `--accent-deep:#7C3AED`,
`--accent-dark:#6d28d9`, `--accent-soft:#a78bfa`. WhatsApp `--wa-1:#25d366`.
Layout piloté par JS : `--safe-top`, `--app-vh`, `--dockH`, `--heroFadeH`, `--hero-*`.

### Échelle z-index (documentée en tête, ~7–27) — VALEURS EFFECTIVES
`-1` héros masqué · `10–11` hero/logo · `999` `#dock` · `1000` topbar/backdrop ·
`1001` drawer · `1002` menu-toggle · `9000` pay-modal · `9500` terr-menu ·
`9600` consent-bar · `9700` wa-float · `10000` toasts/loadbar/skip-link.
⚠️ Les vraies valeurs sont fixées en **§45 (ex-inline, ~7578)** qui surcharge la base.

### Sections repères (n° → ligne approx)
§01 tokens 30 · §03 topbar 169 · §04 boutons couleurs forcées 258 · §05 menu 318 ·
§06 héros 469 (halo doré `.hero-logo-container::before` ~521) · §09 cartes néon 681 ·
`.card` ~898 · pager ~692 · §13 catalogue 2482 · **§14 PDP 2532** (variant switch
`.pdp-variant` ~2707) · §23 dock 4104 · §24 vues/router 4200 · §25 toasts 4225 ·
§29 marques 4334 · §31 footer 4642 · **ADMIN ~5691** (`.compta-*` ~6040,
**`.brand-goal` ~6093**, `.fisc-*` ~6101, **facture `.pt-invoice`/`.pt-inv-*` ~6119**) ·
§37 consent 6887 · §38 wa-float 6947 · §44 pages légales 7520 · **§45 ex-inline 7578**.

### `@media print` (~6143–6161)
N'affiche QUE `#comptaPrintable` et `#ptInvoice` (+ enfants), force
`print-color-adjust:exact` (garde jaune/anthracite + filigrane facture),
restyle `#comptaPrintable` en clair. **Les 2 imprimables ne se chevauchent pas**
(l'onglet admin inactif est `display:none`).

---

## 4. api/ — 12 endpoints serverless (LIMITE VERCEL = 12, voir PIÈGES)

| Endpoint | Méthode | Auth | Rôle |
|---|---|---|---|
| **`admin.js`** (498 l.) | GET/POST/DELETE | `requireAdmin` | Hub admin. GET `?type=` : orders, stats, clients, pricing-config, **accounting**, invoice-config, invoices, **invoice** (`&id=`), charges, overrides. POST : **price-watch** (traqueur), pricing-config, price-preview, **reprice-all**, charge, invoice-config, override. DELETE : charge, override. Garde-fous prix `PW` (357). |
| **`webhook.js`** (698 l.) | POST | Signature Stripe | Confirme paiement. `handleSessionCompleted` (144), **`handleIntentSucceeded`** (197 : rebuildLines, frais Stripe réels, **`assignInvoiceNumber`** 341, facture email), `handleIntentFailed` (304). `rebuildLines` (414, **snapshote cogs + brand par ligne**). Idempotence via `stripe_events`. Corps BRUT (bodyParser off). |
| `create-payment-intent.js` (191 l.) | POST | public + `verifyUid` | PaymentIntent Elements. **Territoire depuis CODE POSTAL seul** (H3). Prix serveur. Remise fidélité. Lignes → metadata. |
| `checkout.js` (153 l.) | POST | public + `verifyUid` | Checkout Session (repli). Prix serveur. Coupon fidélité. `shipping_address_collection`. |
| `contact.js` (127 l.) | POST | public | Formulaire contact → OWNER_EMAIL. Honeypot + rate-limit 5/h/IP. |
| `newsletter.js` (115 l.) | POST | public | Inscription → Resend audience ou OWNER_EMAIL. Honeypot + 5/h/IP. |
| `events.js` (114 l.) | POST | public | Ingestion analytics maison. Anti-bot + 60/min/IP + honeypot. **Toujours 204**. |
| `cron-report.js` (156 l.) | GET | `CRON_SECRET` OU admin | Cron mensuel (`0 6 1 * *`) : rapport analytics + **rappel veille taxes** (`veilleReminderHtml` 22) + purge rétention. |
| `instagram.js` (238 l.) | GET/POST | `requireAdmin` | Instagram Business (Graph API v21.0). |
| `products.js` (54 l.) | GET | public | Catalogue = `catalog.loadCatalog()`, filtres brand/category/q. |
| `test-email.js` (99 l.) | POST | `requireAdmin` | Email de test Resend. |
| `health.js` (31 l.) | GET | public | Booléens de présence des env vars (jamais les valeurs). |

### api/_lib/ — 16 modules partagés
| Module | Pur ? | Rôle |
|---|---|---|
| **`pricing.js`** | PUR | Moteur fiscal DOM-TOM. **MIROIR EXACT de app.js** (gardé par check-pricing). `calcPrice`, `unitCents`. Formule `ttc=ht×(1+octroiExt+octroiRég)×(1+tva)`. |
| `catalog.js` | Firestore | `loadCatalog` = products.json + `product_overrides` (cache 60s/30s), `findByKey`. |
| `auth.js` | Firestore | `requireAdmin` (claim Firebase OU secret timing-safe). |
| `http.js` | PUR | `applyCors` (allowlist `ALLOWED_ORIGINS`, refus par défaut). |
| `firebase.js` | Firestore | `getFirebase` (init unique Admin SDK), `verifyUid` (Bearer→uid), `verifyAdmin` (claim). |
| `postal.js` | PUR | `territoryFromPostal` (préfixe CP → territoire). |
| `stripe-meta.js` | PUR | `chunkItems`/`readItems` (lignes dans metadata Stripe ; limites CHUNK 450, MAX 40). |
| `ratelimit.js` | Firestore | `allow(bucket,key,max,windowSec)` fenêtre fixe, **fail-open**, IP hachée (`x-real-ip`). |
| `loyalty.js` | Firestore | **`TIERS`** (mirror app.js, gardé par check-loyalty), `verifiedSpendCents` (somme `payments`), `quote`. |
| **`pricing-model.js`** | PUR | Moteur marge cible (net 15% après IS). **`DEFAULT_CONFIG`** (lettre/heavyKg/colissimo/container). `recommend`, `solveMarkup`. |
| `pricing-config.js` | Firestore | `config/pricing` (allowlist, cache 30s), `sanitize`, `save`. |
| **`accounting.js`** | PUR | `synthesize` (compte de résultat réel), **`brandStats`** (ventes/marque), `computeIS` (15%/25%). |
| **`invoice.js`** | PUR | `buildInvoice`, `renderHtml` (facture A4). 2 régimes (TVA / franchise 293 B). `DEFAULT_SELLER`. |
| `analytics.js` | PUR | `sanitizeEvent`, `planWrites`, `summarize`, `buildReport`, `purgeCutoffs`. Jamais d'IP stockée. |
| `price-parse.js` | PUR | `parseCotebrico` (page marque → `[{sku,price,name}]`) pour le traqueur. |

---

## 5. Firestore — collections & sécurité

**Modèle : DEFAULT-DENY.** Catch-all final `match /{document=**} { allow read,write: if false }`.
Client = soumis aux règles ; serveur (Admin SDK) = bypass.

| Collection | Accès client | Écrite par |
|---|---|---|
| `users/{uid}` | self read/create/update (allowlist champs) + delete (RGPD) | client + admin |
| `users/{uid}/orders/{id}` | self read/create (`quote`/`pending` SEULEMENT, jamais `paid`) ; **update: if false** | **webhook** confirme en `paid` |
| `payments/{id}` | ❌ serveur-only | webhook, loyalty |
| `charges/{id}` | ❌ (catch-all) | admin (compta) |
| `config/{pricing,invoice,invoiceCounter}` | ❌ | pricing-config, admin, webhook |
| `stripe_events/{id}` | ❌ | webhook (idempotence) |
| `product_overrides/{id}` | ❌ | admin, traqueur |
| `rate_limits/{id}` | ❌ | ratelimit (IP hachée) |
| `analytics_*` (daily/products/clicks/geo/visitors/events_recent) | ❌ | events, purge cron |

`firestore.indexes.json` : aucun index composite ; 2 `fieldOverrides`
(collectionGroup `orders.stripeSessionId` + `.paymentIntentId`) pour le repli
webhook sur anciens paiements sans uid.

⚠️ **RÈGLES PAS ENCORE DÉPLOYÉES** sur le projet (action user en attente —
`firebase deploy --only firestore:rules`). Tant que non fait, la protection est théorique.

---

## 6. scripts/ci.js — 12 contrôles (doit rester VERT)

`check-required-ids` (IDs DOM présents) · `check-paths` (images référencées existent) ·
`check-products-json` (schéma catalogue) · **`check-pricing`** (parité pricing.js ↔
golden) · **`check-pricing-model`** (sélection transport + marge ≥15%) ·
**`check-accounting`** (P&L + brandStats) · `check-invoice` (2 régimes TVA/franchise) ·
**`check-loyalty`** (parité TIERS serveur ↔ app.js) · **`check-csp`** (hash scripts
inline ↔ vercel.json) · `check-analytics` · **`check-functions`** (≤12 fonctions api/) ·
`check-firestore-queries` (interdit `orderBy(documentId,'desc')`).

Autres scripts NON en CI : `set-admin-claim.js`, `test-rules.js` (émulateur Firestore).

---

## 7. products.json — schéma produit (206 produits, tableau brut)

**Champs** : `id` (clé), `slug`, `sku` (réf. traqueur), `title`, `name`, `brand`,
`category`, `tag`, `desc`, `img` (`images/posters/*.webp`), **`price`** (TTC réf.),
`currency`, `vat` (0.2), **`price_ht`** (base moteur fiscal), `stock_status`,
`stock_label`, `paymentLink`, `weight_kg` (transport), **`ncCategory`**
(`power_tool`/`accessory`/`hand_tool` → octroi), `productType`, `tags[]`,
`description_long`, `specs{}`, `features[]`, **`model`** (chemin `.glb`, 200/206).
**Variantes** : `variantGroup`, `variantRole` (`solo`/`coffret`), `coffretSku`,
`soloSku`, `variantSecondary` (masqué du catalogue).

**Marques** : Makita 88, Festool 57, DeWALT 56, Flex 2, Wera 2, Facom 1.
**Prix** (RÈGLE GRAVÉE, cf. REGLES-PRODUITS.md) : `price` = TTC source × 1,15 ;
`price_ht` = price / 1,20. Le serveur re-dérive le TTC territorial.

**Assets** : `images/brands/` (7 logos), `images/posters/` (~100 webp par sku),
`images/_originals/` (HD, **exclu du deploy** via `.vercelignore`), `icons/` (PWA),
**`models/products/`** (46 `.glb`, nommés par SKU, packs en `-pack.glb`).

---

## 8. Variables d'environnement (Vercel)

| Var | Sert à | Endpoints |
|---|---|---|
| `STRIPE_SECRET_KEY` | API Stripe | webhook, create-PI, checkout |
| `STRIPE_WEBHOOK_SECRET` | Signature webhook | webhook |
| `FIREBASE_SERVICE_ACCOUNT` | Admin SDK (bypass règles) | firebase, catalog, set-admin-claim |
| `RESEND_API_KEY` / `RESEND_FROM` / `OWNER_EMAIL` | Emails | webhook, contact, newsletter, cron, test-email |
| `RESEND_AUDIENCE_ID` | Liste newsletter | newsletter |
| `ADMIN_SECRET` | Auth admin (`x-admin-secret`) | auth |
| `CRON_SECRET` | Cron mensuel (401 sinon) | cron-report |
| `META_ACCESS_TOKEN` / `META_APP_ID` / `META_APP_SECRET` | Instagram | instagram |
| `ALLOWED_ORIGINS` | CORS cross-origin (optionnel) | http |

`api/health.js` sonde la présence de toutes ces vars (page de diagnostic).

---

## 9. Flux critiques (bout en bout)

- **PRIX** : `products.json.price_ht` → serveur `pricing.unitCents(territoire)` →
  affiché == débité. Le client envoie `{key,qty}`, JAMAIS le prix. Parité
  app.js↔pricing.js gardée par check-pricing. **Le prix client n'est jamais cru.**
- **PAIEMENT (Elements)** : `initStripeElements` → POST `create-payment-intent`
  (territoire=CP, prix serveur, remise fidélité, lignes→metadata) →
  `confirmPayment` → **webhook `payment_intent.succeeded`** (rebuildLines, frais
  Stripe réels, n° facture séquentiel, email facture, `payments/`, order `paid`).
- **FIDÉLITÉ** : dépense = somme `payments` confirmés (`loyalty.verifiedSpendCents`,
  serveur-only → infalsifiable). Remise appliquée serveur, jamais depuis localStorage.
- **TERRITOIRE fiscal** : dérivé du **code postal** côté serveur (autoritaire).
  Contrôle détectif au webhook (CP réel vs territoire déclaré → email owner).
- **FACTURE** : `assignInvoiceNumber` (compteur transactionnel `config/invoiceCounter`,
  `Fyyyy-NNNN`) → `invoice.buildInvoice` → email client + imprimable admin.
- **VENTES/MARQUE** : marque snapshotée par ligne (webhook) → `accounting.brandStats`
  → onglet Comptabilité (barre objectif DeWALT 10 000 €).
- **ANALYTICS** : `track`→beacon `/api/events`→agrégats `analytics_*` (jamais d'IP,
  jamais de log brut). Rapport + purge par cron mensuel.

---

## 10. ⚠️ PIÈGES À NE PAS OUBLIER (lire AVANT de toucher)

1. **CACHE-BUSTING SW — TRIPLE ALIGNEMENT.** À tout changement de `app.js`,
   `styles.css` ou `index.html` : bumper **`sw.js` VERSION (`pt-vNNN`) + ASSET_VER**
   ET **`index.html` `?v=NNN`** (styles.css + app.js). **Ne JAMAIS réutiliser un
   numéro** (déjà causé des mélanges stale/frais). Vercel ne déploie QUE `master`.

2. **CSP — HASH DES SCRIPTS INLINE.** Modifier un des 3 `<script>` inline de
   `index.html` (watchdog, config API, PT_CRYPTO_CONFIG) **change son sha256** →
   il faut mettre à jour le hash dans `vercel.json`. `check-csp.js` casse la CI
   sinon. Le `?v=` NE change PAS les scripts inline (hashes stables).
   Site 3D → la CSP DOIT garder `worker-src blob:` + `wasm-unsafe-eval` +
   `blob:` dans `img-src` ET `connect-src` (sinon modèles/textures cassés).

3. **LIMITE 12 FONCTIONS SERVERLESS (Vercel Hobby).** On est **à 12 pile**.
   Nouvelle logique serveur = l'ajouter dans `api/_lib/` ou dans `admin.js`
   (dispatch `?type=`), JAMAIS un nouveau fichier `api/*.js`. `check-functions.js` garde.

4. **PRIX SERVEUR AUTORITAIRE.** `pricing.js` est le **miroir exact** de la logique
   prix de `app.js`. Modifier l'un → modifier l'autre à l'identique (check-pricing).
   Idem `loyalty.js` TIERS ↔ app.js LOYALTY_TIERS (check-loyalty).

5. **NUMÉRO DE CONTACT = SOURCE UNIQUE.** Il vit dans
   `index.html` → `PT_CRYPTO_CONFIG.whatsappNumber` (vide aujourd'hui). Vide →
   `applyContactChannels()` (app.js ~528) masque TOUT (dock, flottant, footer,
   PDP, contact, devis) et rien ne fuit. Pour réactiver : renseigner LE numéro là,
   c'est tout. Ne JAMAIS re-coder un numéro en dur ailleurs.

6. **`content-visibility` INTERDIT sur les vues.** A déjà causé la « page vide »
   iOS (rectangle noir). Retiré de `.view/.card/.cat-card`. Ne pas le réintroduire.

7. **3D À LA DEMANDE.** `model-viewer` et Three.js sont **lazy** (`ensureModelViewer`,
   `ensureThree`). Ne pas remettre `<model-viewer>` dans le `<head>` ni charger un
   GLB au chemin critique. La fiche produit = POSTER statique en héros, le SEUL 3D
   est le petit carré « vue détail » en `loading="lazy"`. L'user navigue en PRIVÉ
   (cold load à chaque visite) → seul le poids brut compte.

8. **PACKS 3D — ORIENTATIONS GRAVÉES.** Ne JAMAIS re-dériver à l'œil. Lire le
   REGISTRE dans `../CLAUDE.md §RÈGLES PACKS 3D` + `docs/PACK-3D-LAYOUT.md`.
   Mapping au sol verrouillé (copier le pack, ne changer QUE l'outil).

9. **WEBHOOK = ARGENT, best-effort partout.** Corps BRUT obligatoire
   (`bodyParser:false`). Idempotence via `stripe_events`. La construction facture/
   email est en try/catch : jamais bloquante pour l'email de commande.

10. **RÈGLES FIRESTORE PAS DÉPLOYÉES.** Le fichier `firestore.rules` est à jour
    mais **pas publié** sur le projet (action user). Le verrou anti-fraude (crypto
    `declared` retiré, `paid` interdit au client) suppose les règles déployées.

11. **CRYPTO DÉSACTIVÉ.** `PT_CRYPTO_ENABLED=false` (app.js ~4604). Code conservé,
    UI masquée (`applyCryptoVisibility`), `declared` retiré des règles. Réactiver =
    flag true + remettre `declared` dans firestore.rules.

12. **TEST = PLAYWRIGHT RÉEL.** Vérif visuelle réelle (serveur statique local +
    captures + assertions DOM), jamais de sweep à l'aveugle. Playwright global :
    `/opt/node22/lib/node_modules/playwright` (import default, pas named). Ignorer
    les erreurs réseau CDN (Stripe/Firebase bloqués en sandbox) — ne compter que
    les vrais `pageerror`. `scratchpad/` est jetable (gitignoré).

13. **`scrollIntoView` : `behavior:'instant'`** dans les harnais (le smooth global
    fausse les hit-tests). `querySelector('div[role=alert]')` matche `#stripeCardError`
    en premier — cibler par id précis.

14. **PDP `initPdpScrollAnimations` FRAGILE.** Moteur rAF à état partagé (~2921,
    10 étapes). Découpe/refactor = risque timing non vérifiable en statique. Ne pas
    y toucher sans tests visuels. `#view-produit` garde `content-visibility:visible`.

---

## 11. Conventions (rappel)
- **1 étape = 1 problème = 1 commit = 1 vérif verte.** Ordre : argent → sécurité →
  fonctionnel → structure → polish.
- Travail direct sur `master` (commit + push immédiat → Vercel live). CI verte à chaque fois.
- Bump SW à chaque asset. Jamais de secret serveur côté client (clé Stripe publishable OK).
- Vérifier dans le code AVANT de livrer. Aucun hasard, aucun bullshit.
