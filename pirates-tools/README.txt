═══════════════════════════════════════════════════════════════════
  PIRATES TOOLS — PWA E-Commerce (Vanilla HTML / CSS / JS)
═══════════════════════════════════════════════════════════════════

URL prod : https://ish-ebon.vercel.app/ (Vercel) — legacy : https://nova971z.github.io/ish/
Langue   : Français (fr-FR)
Thème    : Dark (#0a0f14) · Accent violet (#8B5CF6)
Version  : pt-v277 (Service Worker + ASSET_VER)
Backend  : Vercel serverless functions (api/products, api/checkout, api/webhook, api/orders,
           api/admin, api/health, api/contact, api/newsletter, api/test-email)

───────────────────────────────────────────────────────────────────
  ARCHITECTURE
───────────────────────────────────────────────────────────────────

PWA mono-fichier sans framework, sans bundler.
Routing SPA via hash (#/).

  index.html         Point d'entrée, crypto config inlinée (PT_CRYPTO_CONFIG)
  styles.css         ~5 600 lignes — design system dark/glassmorphism/neon
  app.js             ~3 500 lignes — logique complète (IIFE)
  sw.js              Service Worker multi-cache
  products.json      Catalogue produits (26 articles, 7 marques)
  firebase-init.js   Init Firebase Auth + Firestore
  manifest.webmanifest  Manifest PWA (standalone, portrait, fr-FR)
  404.html           Fallback SPA pour GitHub Pages
  .nojekyll          Désactive Jekyll sur GitHub Pages
  robots.txt         SEO
  sitemap.xml        SEO

───────────────────────────────────────────────────────────────────
  ROUTES (Hash SPA)
───────────────────────────────────────────────────────────────────

  #/                   Accueil (hero animé, bulles de marques 3D, produits phares)
  #/catalogue          Catalogue (filtre marque, catégorie, recherche)
  #/catalogue?brand=X  Catalogue filtré par marque
  #/produit/:slug      Fiche produit (PDP) — modèle 3D, specs, avis, ajout panier
  #/devis              Panier / devis (quantités, totaux TTC, envoi WhatsApp, paiement)
  #/compte             Mon compte (profil, fidélité, historique commandes) — auth requise
  #/auth               Connexion / Inscription / Mot de passe oublié
  #/abonnement/:plan   Détail d'un plan d'abonnement
  #/checkout           Checkout
  #/paiement/success   Confirmation paiement
  #/paiement/annule    Annulation paiement
  #/contact            Formulaire de contact (envoie email via Resend)
  #/favoris            Liste de favoris (wishlist, localStorage)
  #/admin              Admin panel (édition stock + prix) — ADMIN_SECRET requis

───────────────────────────────────────────────────────────────────
  FONCTIONNALITÉS PRINCIPALES
───────────────────────────────────────────────────────────────────

1. CATALOGUE & PRODUITS
   - 26 produits répartis sur 7 marques :
     DeWALT (9) · Makita (6) · Festool (3) · Facom (2) · Flex (2) · Stanley (2) · Wera (2)
   - Catégories : boulonneuses, visseuses, scies, meuleuses, jeux d'outils, tournevis
   - Filtres par marque (bulles) → par type (sous-catégories) → liste produits
   - Badges : Promo, Nouveau, Best-seller, Compact, Nu (sans batterie)
   - Badges stock : in_stock / low_stock / out_of_stock / preorder
     (pill colorée en haut-droite de la carte, grise-out quand en rupture,
     bloque add-to-cart et buy-now côté PDP)
   - Prix TTC / HT, TVA 20 %, ancien prix barré

2. MODÈLES 3D
   - 12 fichiers GLB dans /models/products/
   - <model-viewer> (Google, CDN v3.5.0) pour les fiches produit
   - Cartes produit : rendu statique, rotation au survol uniquement
   - Fallback image automatique si pas de modèle

3. SPHÈRES DE MARQUE (Accueil)
   - Three.js v0.160.0 chargé en lazy-load (ensureThree())
   - Sphères 3D avec texture dynamique (logo + couleur marque)
   - 7 marques avec couleurs dédiées (BRAND_COLORS)
   - IntersectionObserver pour ne rendre que les sphères visibles
   - Fallback logo 2D pendant le chargement

4. ANIMATIONS SCROLL (PDP)
   - Parallaxe Apple-style sur le héro produit
   - Déflouté progressif du titre "Conçu pour performer"
   - Lerp smooth (LERP_SPEED 0.08)
   - Reveal séquentiel des specs, features, boutons CTA
   - requestAnimationFrame avec IntersectionObserver

5. PANIER & DEVIS
   - LocalStorage persistant (clé 'pt_cart')
   - Stepper quantité (+/−), suppression, vidage
   - Calcul automatique sous-total, TVA, total TTC
   - Envoi du devis par WhatsApp (message pré-rempli)
   - Badge panier dans la toolbar/dock

6. PAIEMENTS — DOUBLE MODE
   a) Carte bancaire (Stripe)
      - Payment Links Stripe (par produit via paymentLink dans products.json)
      - Fallback vers onglet crypto si aucun lien configuré
   b) Crypto — Sélection en 2 étapes :
      Étape 1 → Choix du réseau blockchain :
        • Bitcoin
        • Ethereum (mainnet)
        • Arbitrum One
        • Solana
      Étape 2 → Choix de la crypto compatible avec le réseau :
        • Bitcoin      → BTC
        • Ethereum     → ETH
        • Arbitrum One → ETH, USDC, USDT
        • Solana       → SOL
      - QR code dynamique (api.qrserver.com)
      - Taux temps réel EUR→crypto (CoinGecko API)
      - Copie adresse + montant en un clic
      - Tutoriel intégré en 3 étapes numérotées
      - Option achat crypto par carte (NOWPayments on-ramp)

   Adresses de réception (MetaMask) :
     BTC : bc1qfh9zdgq598xc3vgsrnyp2v38pefcxz827kwxwx
     ETH / Arbitrum : 0xbF61CB5850754c3A87bEb696E3f0607718ad6b08
     SOL : GKVmgduLmvVtqvds8oXsH4UFxmkbAVT2om4bXBo2eQbu

7. AUTHENTIFICATION (Firebase)
   - Firebase Auth v10.13.2 (email / mot de passe)
   - Inscription, connexion, mot de passe oublié
   - Vérification email
   - Modification profil (nom, email, téléphone, adresse)
   - Changement de mot de passe
   - Messages d'erreur localisés en français (14 codes)
   - Persistence locale (browserLocalPersistence)

8. BASE DE DONNÉES (Cloud Firestore)
   - Collection users/{uid} : profil, points fidélité, avatar
   - Sous-collection users/{uid}/orders/{id} : historique commandes

9. PROGRAMME FIDÉLITÉ
   - 4 paliers : Basique, Pro, Gold, Black Metal
   - Avantages : remises, paiement différé, priorité, livraison gratuite
   - Multiplicateur de points (×1 à ×5)
   - Jauge visuelle dans le compte

10. PWA & OFFLINE
    - Manifest standalone, portrait, shortcuts (catalogue, devis, compte)
    - Prompt d'installation natif (beforeinstallprompt)
    - Service Worker 4 caches :
      pt-static  → app shell (HTML, CSS, JS, icônes)
      pt-runtime → requêtes runtime
      pt-img     → images (cache-first)
      pt-data    → products.json (network-first, timeout 4s)
    - Fallback offline vers index.html

11. CONTACT
    - Téléphone : 07 74 23 01 95 (bouton sticky en haut)
    - WhatsApp : wa.me/33774230195 (devis, confirmation paiement)
    - Chat flottant (bouton vert)

12. ADMIN PANEL (#/admin)
    - Authentification par clé simple (env ADMIN_SECRET sur Vercel)
    - La clé est stockée uniquement en sessionStorage (jamais persistée)
    - Édition en ligne : stock_status, stock_label, prix
    - Backend : POST /api/admin → Firestore `product_overrides/{id}`
    - Merge côté /api/products : overrides Firestore ont la priorité sur products.json
    - Cache 30 s pour refléter les modifs en prod

13. EMAILS TRANSACTIONNELS (Resend)
    - Webhook Stripe `/api/webhook` envoie 2 emails après paiement :
      a) Client : confirmation de commande (template HTML dark/violet)
      b) Propriétaire : notification de nouvelle commande payée
    - Providers : Resend REST API (pas de SDK)
    - Feature flag : n'envoie rien si RESEND_API_KEY absent
    - Env vars : RESEND_API_KEY, RESEND_FROM, OWNER_EMAIL
    - Endpoint de test admin : POST /api/test-email (gated ADMIN_SECRET)

14. FORMULAIRE DE CONTACT (/contact)
    - Page dédiée #/contact avec formulaire validé client + serveur
    - POST /api/contact → envoie un email à OWNER_EMAIL via Resend
    - Anti-spam : honeypot + validation longueur/email
    - Reply-to = email client, pour réponse directe

15. NEWSLETTER (/api/newsletter)
    - Widget sur la page d'accueil (section home-newsletter)
    - POST /api/newsletter :
      a) Si RESEND_AUDIENCE_ID est set → ajout auto au Resend Audience
      b) Sinon → fallback : email à OWNER_EMAIL avec l'inscription
    - Anti-spam : honeypot + validation
    - Env vars : RESEND_API_KEY + (RESEND_AUDIENCE_ID ou OWNER_EMAIL)

16. WISHLIST / FAVORIS
    - Bouton cœur sur chaque carte produit (catalogue, home, favoris)
    - Stockage : localStorage clé `pt_wishlist` (tableau d'IDs)
    - Route #/favoris : grille des produits favoris avec empty state
    - Toast feedback à chaque ajout/retrait

17. RÉCEMMENT CONSULTÉS
    - Track les 8 derniers produits vus (localStorage `pt_recently_viewed`)
    - Affiché sur la home en dessous du strip "Nos produits"
    - Section cachée si aucun produit vu

18. SEO (JSON-LD + meta dynamiques)
    - JSON-LD `Organization` injecté sur toutes les pages
    - JSON-LD `Product` injecté sur PDP avec stock availability
    - <title> et <meta description> mis à jour à chaque route change
    - Availability mappée depuis stock_status (InStock, OutOfStock, etc.)

19. ADMIN PANEL (3 onglets)
    - Onglet Produits : édition stock + prix (déjà documenté en §12)
    - Onglet Commandes : lecture des 50 dernières commandes depuis
      Firestore collectionGroup('orders') (ordre desc par createdAt)
    - Onglet Outils :
      • Test email via Resend (vérifie la config)
      • Health check /api/health (affiche quelles env vars sont set)

───────────────────────────────────────────────────────────────────
  ARBORESCENCE COMPLÈTE
───────────────────────────────────────────────────────────────────

pirates-tools/
├── index.html
├── styles.css
├── app.js
├── sw.js
├── products.json
├── firebase-init.js
├── crypto-config.js          (legacy, config maintenant inlinée)
├── manifest.webmanifest
├── package.json
├── 404.html
├── .nojekyll
├── robots.txt
├── sitemap.xml
├── .deploy-trigger
├── .gitignore
│
├── icons/
│   ├── icon-180.png
│   ├── icon-192.png
│   ├── icon-256.png
│   ├── icon-384.png
│   └── icon-512.png
│
├── images/
│   ├── pirates-tools-logo.png
│   ├── Logo pirates tools 2.png
│   ├── brands/
│   │   ├── dewalt.svg
│   │   ├── makita.svg
│   │   ├── festool.svg
│   │   ├── flex.svg
│   │   ├── stanley.svg
│   │   ├── wera.svg
│   │   └── facom.svg
│   └── products/          (25 images produit)
│
├── models/
│   ├── dewalt-optimized.glb
│   ├── tools.json
│   ├── Tools/
│   └── products/
│       ├── dcd796.glb
│       ├── dcf850.glb
│       ├── dcf887.glb
│       ├── dcf894n.glb
│       ├── dcg405n.glb
│       ├── dcs391n.glb
│       ├── ddf487z.glb
│       ├── dga504z.glb
│       ├── dtd172z.glb
│       ├── kraftform-kompakt.glb
│       ├── tsc55.glb
│       └── zyklop-speed.glb
│
├── scripts/
│   ├── ci.js
│   ├── account.js
│   ├── check-required-ids.js
│   ├── check-products-json.js
│   ├── check-paths.js
│   └── menu-6b.js
│
├── docs/
│   └── stack.md
│
├── CHANGELOG.md
├── ANALYSIS.md
└── README.txt                (ce fichier)

───────────────────────────────────────────────────────────────────
  DÉPENDANCES EXTERNES (CDN)
───────────────────────────────────────────────────────────────────

  model-viewer 3.5.0     ajax.googleapis.com     Composant 3D GLB
  Three.js 0.160.0       cdn.jsdelivr.net        Sphères de marque (lazy)
  Firebase 10.13.2       gstatic.com             Auth + Firestore
  CoinGecko API          api.coingecko.com       Taux EUR→crypto (gratuit)
  QR Server              api.qrserver.com        Génération QR codes

Aucune dépendance npm en production. Zéro framework. Zéro bundler.

───────────────────────────────────────────────────────────────────
  SERVICE WORKER — STRATÉGIES DE CACHE
───────────────────────────────────────────────────────────────────

  Navigations SPA       → Network-first + fallback index.html
  products.json         → Network-first (timeout 4 s) + cache fallback
  CSS / JS / manifest   → Stale-While-Revalidate
  Images internes       → Cache-first (loose)
  Images externes       → Cache-first (safe)
  Requêtes cross-origin → Pass-through (pas de cache)

  Versionning : VERSION = 'pt-v277', ASSET_VER = '277'
  → Incrémenter les deux + query strings (?v=277) à chaque déploiement.

───────────────────────────────────────────────────────────────────
  LANCEMENT LOCAL
───────────────────────────────────────────────────────────────────

Le Service Worker nécessite un serveur HTTP (pas de file://).

  # Python
  cd pirates-tools && python3 -m http.server 8080

  # Node
  cd pirates-tools && npx http-server -p 8080

  Ouvrir http://localhost:8080

───────────────────────────────────────────────────────────────────
  DÉPLOIEMENT (GitHub Pages)
───────────────────────────────────────────────────────────────────

Workflow : .github/workflows/pages.yml
Trigger  : push sur main OU dispatch manuel
Action   : upload du répertoire racine → GitHub Pages
URL      : https://nova971z.github.io/ish/

───────────────────────────────────────────────────────────────────
  CI / VALIDATION
───────────────────────────────────────────────────────────────────

  npm test  →  node scripts/ci.js
    ✓ Vérifie les IDs DOM requis dans index.html
    ✓ Valide le schéma products.json
    ✓ Contrôle les chemins d'images et modèles 3D

  Node.js ≥ 18.18.0 requis.

───────────────────────────────────────────────────────────────────
  CONVENTIONS
───────────────────────────────────────────────────────────────────

  Commits   : type(scope): message — ex: feat(crypto): two-step chain picker
  SW bump   : bump(sw): pt-vXXX
  Cache-bust: ?v=XXX sur styles.css et app.js dans index.html

───────────────────────────────────────────────────────────────────
  CHECKLIST AVANT PR
───────────────────────────────────────────────────────────────────

  [ ] SW VERSION + ASSET_VER incrémentés
  [ ] ?v=XXX mis à jour dans index.html (CSS + JS)
  [ ] LCP < 2.5 s
  [ ] A11y ≥ 95
  [ ] Routes hash fonctionnelles
  [ ] Liens WhatsApp OK
  [ ] Crypto : taux CoinGecko, QR, copie adresse
  [ ] Aucune erreur console
  [ ] Test mobile (PWA standalone)
