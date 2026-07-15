# Mémoire projet — Pirates Tools (e-commerce PWA)

Travail actif : `pirates-tools/` (PWA vanilla HTML/CSS/JS, API serverless Vercel + Firebase + Stripe).
Branche de dev : `claude/pirates-tools-rebuild-zWc1b`. Prod = Vercel, domaine perso `pirates-tools.com`.

## Exigence qualité (non négociable)
Code de niveau ingénieur web senior, standard des grandes institutions e-commerce.
Aucun hasard, aucun bullshit. Chaque correction est vérifiée dans le code avant d'être livrée.

## ⚠️ CHECKLIST PRÉ-LANCEMENT — à dérouler quand l'user demande « est-ce qu'on est prêt à lancer »
Le site N'EST PAS lancé (décidé le 15/07/2026). Ne rien ouvrir au public tant que ces points bloquants ne sont pas faits. Quand l'user pose la question, PARCOURIR cette liste et donner l'état point par point.

### 🔴 BLOQUANT (légal — sinon illégal de vendre en B2C)
- [ ] Remplir les champs `[À COMPLÉTER]` des 3 pages : mentions légales, confidentialité, CGV (identité entreprise : raison sociale, statut, SIRET, RCS, adresse, TVA, capital, directeur publication, email pro).
- [ ] Adhérer à un **médiateur de la consommation** agréé (CM2C, Medicys… ~50-100€/an) et mettre ses coordonnées dans mentions + CGV. OBLIGATOIRE pour vendre aux particuliers.
- [ ] Faire relire les 3 documents légaux par un juriste (recommandé fort).
- [ ] Email pro `contact@pirates-tools.com` (pas le gmail perso) pour les mentions/CGV.

### 🔴 BLOQUANT (paiement carte)
- [ ] Activer le compte Stripe (infos entreprise + RIB) pour encaisser en LIVE.
- [ ] Créer le webhook Stripe → URL `https://pirates-tools.com/api/webhook`, copier le `whsec_...` dans Vercel comme `STRIPE_WEBHOOK_SECRET`.
- [ ] Vérifier toutes les env vars Vercel : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FIREBASE_SERVICE_ACCOUNT, RESEND_API_KEY, RESEND_FROM, OWNER_EMAIL, ADMIN_SECRET, META_APP_ID/SECRET/ACCESS_TOKEN. (ALLOWED_ORIGINS optionnel.)

### 🟠 AVANT D'OUVRIR LE CRYPTO (si tu actives ce canal)
- [ ] Scanner le QR crypto local avec un VRAI wallet (Metamask…) et confirmer qu'il affiche la bonne adresse. Preuve finale avant tout paiement crypto réel.

### 🟢 MISE EN PROD
- [ ] Merger `claude/pirates-tools-rebuild-zWc1b` → `master` (Vercel auto-déploie).
- [ ] Vérifier `pirates-tools.com/api/health?test` renvoie du JSON (API branchée).

### ✅ DÉJÀ FAIT
- Firebase Authorized domains (pirates-tools.com + www) ✅. Domaine sur Vercel ✅. Plan remédiation 10/10 + QR local ✅.

### ⚪ NON BLOQUANT (dette technique reportée, cosmétique)
- Refactors CSS risqués (étape 9 : fork inline, !important, z-index). Split fonctions XXL (10d). Peuvent attendre après le lancement.

## Plan de remédiation en cours
Document maître : `pirates-tools/docs/PLAN-REMEDIATION.md` (10 étapes, versionné).
Ordre non négociable : argent → sécurité → fonctionnel → structure → polish.
Règle : **1 étape = 1 problème = 1 commit = 1 vérification verte**. Jamais d'étape à moitié faite.

### Suivi des étapes
- [x] 1. Routeur : ajouter /admin /merci /contact /favoris à ROUTES (app.js:2753) ✅ commit, SW v290
       Note : cancel_url '#/checkout' (app.js:3876) pointe vers une route fantôme → à traiter étape 2 (le repointer vers #/devis).
- [x] 2. Intégrité des prix ✅ commit, SW v291
       Serveur autoritaire : api/_lib/pricing.js (port exact de calcPrice) + api/_lib/catalog.js.
       create-payment-intent.js & checkout.js recalculent depuis le catalogue par `key`, ignorent le prix client.
       Client envoie {key,qty}, affiche le TTC territorial (payUnitCents, arrondi identique serveur).
       Parité garantie par scripts/check-pricing.js (dans ci.js). parseHash tolère ?query. cancel_url #/checkout→#/devis.
       NOTE : remise fidélité volontairement PAS répercutée sur le montant débité (éviterait un nouveau trou de confiance client) — à décider avec l'utilisateur si on veut l'appliquer (nécessiterait vérif serveur).
- [x] 3. Verrouiller API ✅ commit (server-only, pas de bump SW)
       api/_lib/auth.js (requireAdmin + timingSafeEqualStr via crypto.timingSafeEqual).
       api/_lib/http.js (applyCors : refus par défaut, allowlist via env ALLOWED_ORIGINS).
       orders.js verrouillé admin-only (le client ne l'utilise PAS — il passe par le SDK Firebase sous règles Firestore).
       admin.js / instagram.js / test-email.js : auth timing-safe partagée + applyCors.
       vercel.json : suppression du CORS wildcard /api + ajout X-Content-Type-Options nosniff.
       health.js expose allowedOrigins. Pour activer un cross-origin : définir ALLOWED_ORIGINS sur Vercel.
- [x] 4. Failles XSS ✅ commit, SW v292
       escapeHTML réécrit (pur, échappe & < > " ' — les 5 caractères OWASP) → ferme l'injection d'attribut systémique.
       Vérifié : escapeHTML jamais utilisé avec textContent/.value (donc &quot; jamais affiché). Descriptions produit rendues via textContent (immunisées).
       openPayModal it.title déjà échappé (étape 2). Templates plans/abonnements : toutes interpolations innerHTML échappées (défense en profondeur). href via encodeURIComponent.
- [x] 5. Cohérence déploiement ✅ commit, SW v293
       Prod unique = Vercel (ish-ebon.vercel.app). canonical/og/twitter/robots/sitemap repointés vers Vercel.
       sitemap réduit à l'URL racine indexable (SPA hash → fragments ignorés des crawlers) + og:site_name/og:locale ajoutés.
       Auto-déploiement GitHub Pages DÉSACTIVÉ (deploy-pirates-tools.yml → workflow_dispatch only, non supprimé).
       Workflows morts supprimés (pirates-tools/.github/workflows/*). Nouvelle CI racine .github/workflows/pirates-tools-ci.yml exécute scripts/ci.js sur push/PR.
       Domaine perso = pirates-tools.com (repointé partout : canonical/og/twitter/robots/sitemap/README/firebase-init/sw). SW v294.
       ACTION USER REQUISE : Firebase Console → Auth → Authorized domains → ajouter pirates-tools.com (sinon login échoue).
- [x] 6. Webhook Stripe ✅ commit (server-only, pas de bump SW)
       Corps brut : bodyParser désactivé (module.exports.config) + readRawBody (stream→Buffer) → constructEvent sur les octets exacts signés.
       Idempotence : api/_lib/firebase.js (getFirebase partagé) + claim atomique event.id dans Firestore `stripe_events` (create() échoue si doublon → 200 skip, pas de 2e email).
       Réponses uniformisées {ok:true,received:true}. Order update via db partagé.
       NOTE : dedup gated sur Firebase (nécessaire pour store persistant serverless).
- [x] 7. Bugs Service Worker ✅ commit, SW v295
       7a empoisonnement : handleNavigate guard isShell (seul / ou /index.html rafraîchit la clé ./index.html).
       7b fallback image mort : await chaque fromCache (Promise toujours truthy → respondWith(null)).
       7c navigationPreload déplacé install→activate. 7d CLEAR_OLD_CACHES dans e.waitUntil.
       7e APP_SHELL nettoyé (pt.js inexistant retiré, clé shell unique ./index.html, fin du triple stockage + staleness clé versionnée).
       7f handleProducts : réponse non-ok → fallback cache. 7g branches opaque mortes supprimées.
       favicon/manifest/apple-touch-icon versionnés dans index.html (90-92) pour matcher le précache.
- [x] 8. Bugs runtime app.js ✅ commit, SW v296
       8a starBtns → reset via starsSelect.querySelectorAll (fin du ReferenceError à l'envoi d'avis).
       8b saveCart + saveHomeReview : try/catch sur setItem (Safari privé/quota).
       8c confirmPayment : .catch (bouton réactivé si réseau coupe, plus de rejection non gérée).
       8d NOWPayments : suppression du chemin client x-api-key (fuite clé de compte) ; config cardCheckout réduite à {url:''}. co.url (lien pré-généré) reste. Dynamique → futur endpoint serverless.
       8f fuites listeners : setupModelViewerScrollPassthrough retire mouseleave/touchstart ; pdpWa → onclick (plus d'empilement).
       8g garde auth : redirection /compte↔/auth seulement si _authReady (fin double-flicker au reload).
       8e QR crypto tiers : ✅ RÉSOLU (SW v299). qrserver retiré → génération 100 % locale via qrcode.js vendu (qrcode-generator v2.0.4, MIT, lisible). Lazy-load (ensureQRLib, mirror ensureThree) + cryptoLocalQR (createDataURL). Vérifié par aller-retour encode→décodage jsqr indépendant→adresse identique (6 cas réels). Repli sûr : jamais de tiers, l'adresse texte fait foi. Reste : scan par l'user avec vrai wallet avant ouverture crypto.
- [~] 9. Assainir CSS/HTML — SOUS-ENSEMBLE SÛR FAIT ✅ commit, SW v297 ; refactors risqués REPORTÉS.
       FAIT : (1) lumière dorée restaurée (#hero::before halo radial or, styles.css:444) ; (2) console debug retirée de la prod (~82 l., index.html) ; (3) <h1> sr-only sur l'accueil (SEO/a11y) ; (4) CSS mort retiré (315 l. : section 12 modal 3D + sections 21-22 site-links/footer mort — TOUS sélecteurs vérifiés 0-réf ; vrai footer .footer-social/.site-footer intact).
       REPORTÉ (nécessite vérif visuelle par-règle, refusé de sweeper à l'aveugle = « aucun hasard ») :
        - fork inline styles.css vs index.html (.drawer/#toasts/.toast/#dock) : déplacer verbatim en fin de styles.css (ordre cascade préservé) — à faire prudemment.
        - purge !important (71→moins) : chaque retrait change la cascade → test visuel requis.
        - échelle z-index documentée : réordonner l'empilement → test visuel requis.
        - #a2hsTip mort mais éparpillé (styles.css 4367+, 4888) → suppression ciblée.
        - renumérotation sections CSS (doublon 10b, sections 32+ non numérotées).
- [x] 10. Qualité structurelle & CI ✅ commit, SW v298
       10a helper apiBaseUrl() → factorise les 11 résolutions PT_API_BASE dupliquées.
       10b dérive de prix corrigée : favoris/récents affichaient formatPrice(p.price) métropole → calcPrice().ttc territorial (comme partout).
       10c init Firebase UNIQUE : _lib/firebase.js seul require('firebase-admin') ; admin.js/orders.js/catalog.js migrés vers getFirebase.
       10e rate limiting Firestore (_lib/ratelimit.js, fenêtre fixe, fail-open) : contact 5/h/IP, newsletter 5/h/IP.
       10f test-email.js : plus d'écho de la réponse brute Resend (loggé serveur). instagram.js gardé (admin-only, utile au diagnostic — décision documentée).
       10g CI déjà branchée (étape 5). 10h docs : CHANGELOG v2.1.0 + README (version, tailles, NOWPayments).
       REPORTÉ 10d : découpe des fonctions XXL (renderAdmin/initPdpScrollAnimations/renderPDP) — refactor cosmétique risqué, pas de valeur fonctionnelle, à faire avec tests.

═══ PLAN DE REMÉDIATION TERMINÉ (10/10 étapes) + QR crypto local (8e) fait. ═══

## Session dette technique post-remédiation (15/07/2026, SW v308, mergé master)
Méthode : vérif visuelle RÉELLE via harness Playwright (serveur statique local +
captures avant/après + assertions DOM), pas de sweep à l'aveugle.
- ✅ Halo doré RÉ-ANCRÉ : #hero::before (position:fixed, bavait sur le fond) →
  .hero-logo-container::before (cercle or localisé, centré sur le logo, corrigé
  du padding-top/2 ; z-index 0 < logo 11). Disparaît avec le hero. Vérifié :
  présent accueil, ABSENT catalogue.
- ✅ 3D À LA DEMANDE (perf) : model-viewer retiré du <head> → ensureModelViewer()
  (miroir ensureThree), déclenché PDP à l'ouverture + carrousel/cartes via l'IO
  ~700px. .catch sur chaque appel (échec CDN → poster, pas de rejet nu). wa.me
  preconnect retiré. Vérifié : page sans 3D = 0 injection.
- ✅ IMAGES : facom.png 383 Ko (logo sur fond métal PHOTO, PNG inadapté) →
  facom.webp 62 Ko (-84 %, q88, visuellement identique, réf app.js:940). Logo
  mort 1,35 Mo (0-réf) → images/_originals/ + .vercelignore (exclut les HD du
  déploiement). images/ servi 3,0→1,3 Mo. Posters produits laissés JPEG (~30 Ko,
  lazy, gain marginal + poster model-viewer ne gère pas <picture>).
- ✅ CSS mort purgé : #a2hsTip/#a2hsTriangle/.a2hs-tip__*/@keyframes a2hs-in +
  #netBanner (tous 0-réf vérifiés). Échelle z-index documentée en tête de
  styles.css (couches -1→10000).
REPORTÉ (inchangé, risque cascade réel / valeur nulle, à faire AVEC tests) :
- fork inline index.html/styles.css (.drawer/#dock/#toasts/.toast/.backdrop…
  dupliqués, l'inline gagne) : fusion touche tous les états interactifs, 0 gain.
- purge !important (échelle z-index désormais documentée pour aider).
- 10d découpe XXL : initPdpScrollAnimations (397 l., moteur rAF à état partagé —
  split = risque timing non vérifiable en statique), renderAdmin (251 l., CRUD
  admin non exerçable ici), renderPDP (225 l.). Décision étayée : pas de gain
  utilisateur, refactor pré-lancement écarté.

## Session « argent & confiance » A1-A5 (15/07/2026, SW v310, mergé master)
Suite à l'audit complet 4 axes (rapports : API/sécu, CSS/HTML, app.js, PWA/SEO/a11y).
Correctifs paiement, 1 commit chacun, tests unitaires + Playwright :
- ✅ A1 territoire fiscal : validation stricte (400 si code inconnu) sur les 2
  endpoints ; Checkout collecte l'adresse de livraison (GP/MQ/GF/RE/YT/FR) ;
  _lib/postal.js (CP → territoire, 22 tests). Contrôle DÉTECTIF branché au
  webhook : divergence territoire déclaré ↔ CP réel = ⚠ email owner + journal.
  Limite documentée : flux Elements sans adresse pré-paiement (préventif
  intégral = Address Element, décision produit).
- ✅ A2 webhook : payment_intent.succeeded/failed traités (filtre
  metadata.source='pirates-tools' → pas de double email avec les sessions) ;
  lignes {key,qty} chunkées dans la metadata PI (_lib/stripe-meta.js, limites
  Stripe testées 50 lignes) ; reconstruction serveur du détail avec contrôle
  d'intégrité au centime (dérive → repli ligne unique) ; journal Firestore
  payments/{stripeId} = trace serveur systématique ; matching commande par
  stripeSessionId ET paymentIntentId ; 17 assertions unitaires (_internals).
- ✅ A3 : total panier affiché = montant réellement débité (plein tarif). La
  remise fidélité N'EST PAS débitable (état localStorage falsifiable) → bloc
  « Avantage −X % — non déduit ici, à faire valoir sur devis WhatsApp ».
  Remise réelle = fidélité serveur par uid (décision produit, non fait).
- ✅ A4 : rate limit seau PARTAGÉ 'payment' 20/h/IP sur create-payment-intent
  + checkout (429), après les gardes method/config, fail-open documenté.
- ✅ A5 : /merci exige une PREUVE (paymentIntentId inline / redirect_status=
  succeeded / session_id correspondant) sinon rien n'est écrit ; crypto →
  statut 'declared', 0 point ; pending consommé AVANT effets (anti-double au
  refresh) ; périmé >2h purgé ; items=nombre + lines[] (fix affichage compte) ;
  stripeSessionId écrit (webhook peut confirmer) ; URL Stripe nettoyée
  (replaceState). 9 scénarios Playwright verts.
Restent de l'audit (hors argent) : C1 .btn--primary jamais définie, C2 accents
manquants, C3 preload 3D no-op catalogue, C5 updateEmail ordre, C6 a11y modales
/focus/skip-link, C7 tokens couleur, C8 double fidélité (atténué : le local est
désormais un cache synchronisé sur le serveur à chaque devis de paiement).

## Session pré-C (15/07/2026, SW v311, mergé master) — suites A1-A5
- ✅ Index Firestore RÉSOLU À LA RACINE : uid client → metadata Stripe (sanitisé
  [A-Za-z0-9_-]{1,128}, jamais un droit) → webhook matche users/{uid}/orders en
  CHEMIN DIRECT (index automatiques, rien à créer). collectionGroup = repli
  (anciens paiements) couvert par firestore.indexes.json versionné
  (`firebase deploy --only firestore:indexes` ou URL 1-clic loguée).
  payments/ journalise l'uid (succeeded + failed).
- ✅ REMISE FIDÉLITÉ RÉELLE (décision produit tranchée : oui) : _lib/loyalty.js,
  dépense vérifiée = somme des payments 'succeeded' de l'uid (webhook-only →
  infalsifiable). create-payment-intent débite brut−remise (metadata gross/pct/
  discount, tronquée si <50c) ; checkout via coupon Stripe once ; webhook ajoute
  la ligne négative « Remise fidélité −X % » (intégrité au centime conservée,
  metadata mensongère→fallback) ; la modale se réaligne sur la réponse serveur
  (total + ligne remise) et synchronise le cache local pt:loyalty ;
  scripts/check-loyalty.js en CI (parité paliers app.js ↔ serveur).
- ✅ ADRESSE AVANT PAIEMENT (décision produit tranchée : oui) : formulaire
  adresse NATIF dans la modale carte (choix délibéré vs Address Element :
  pas de refonte du flux confirm, pas de perte de saisie, testable). Le
  formulaire carte n'apparaît qu'à adresse valide ; le CP fixe le territoire
  (serveur re-dérive via _lib/postal.js = AUTORITAIRE ; hors DOM → 400) ;
  changement de CP → PI re-créé au bon taux ; adresse attachée au PI ;
  webhook détectif sur pi.shipping en priorité. 6 scénarios Playwright verts
  + tests serveur (75001 refusé, 97110 prime, rétrocompat sans CP).
NOTE : le flux checkout (repli sans Stripe.js) collecte l'adresse via Stripe
(shipping_address_collection) — la remise y passe par coupon, le territoire y
reste déclaré+détectif (pas de CP pré-session ; acceptable, flux secondaire).

## Session tableau C — C1 à C8 (15/07/2026, SW v312, mergé master)
Audit résiduel soldé, 8/8, 1 commit chacun, régression complète rejouée en fin
de batch (2 tests périmés réalignés, zéro régression produit) :
- ✅ C1 .btn--primary (jamais définie, 8 réfs) → unifiée sur .btn.primary.
- ✅ C2 accents : 94+8+35 remplacements en 3 passes CONTEXTUELLES (succes=type
  toast, detail=<details> → jamais de sed aveugle) ; plans/abonnements inclus ;
  products.json exclu (données). Corollaire : skip-link top -42→-80px (liseré
  blanc détecté par analyse de pixels du coin haut-gauche).
- ✅ C3 preload 3D : cartes loading="lazy" (l'IO ~700px upgrade + charge le
  script) — accès direct #/catalogue fonctionnel (15 cartes, 8 upgradées,
  1 injection) + bonus perf (GLB sous le fold non chargés).
- ✅ C4 fork inline FUSIONNÉ : 3 blocs <style> déplacés VERBATIM en fin de
  styles.css (§45) — cascade équivalente par construction ; 0 <style> dans le
  HTML ; échelle z-index corrigée aux valeurs EFFECTIVES (backdrop 1000,
  drawer 1001, toasts 10000). Vérifié : styles calculés identiques + diff
  pixels 0,000 % + drawer/toast/dock réels. Dédoublonnage NON fait (étape
  suivante possible, sans urgence).
- ✅ C5 updateEmail : Auth D'ABORD → Firestore ENSUITE ; échec Auth = zéro
  divergence (doc intact, champ restauré, message précis) ; profil enregistré
  indépendamment. Prouvé par stub PT_FIREBASE journalisant l'ordre des appels.
- ✅ C6 a11y : trapFocus réel (Tab/Shift+Tab confinés, restauration au
  déclencheur — getClientRects car offsetParent null sous fixed) sur payModal
  + drawer ; focus du h1 de vue à chaque VRAI changement de route (clé
  route|slug — onRouteChange re-tire sur la même route au boot, piège détecté
  par harnais) ; skip-link réel (activation JS, pas de hash routeur).
  9/9 assertions clavier.
- ✅ C7 tokens : --accent/--accent-rgb/-deep/-dark/-soft ; 313 littéraux violets
  → 0 dans styles.css ; canvas + emails serveur exclus (documenté) ; diff
  pixels avant/après = 0,000 %.
- ✅ C8 fidélité : plus AUCUN point sur envoi de devis (doc tracé status:
  'quote') ; compte affiché depuis la dépense vérifiée (cache pt:loyalty
  synchronisé serveur) ; champ profil `loyalty` legacy (ni incrémenté ni
  affiché) ; barre = progression réelle vers le palier suivant.

## Session audit boutons (15/07/2026, SW v313, mergé master)
Bug signalé (« les chips catégories ne marchent pas ») → cause prouvée par
hit-test : le BANDEAU COOKIES mobile (fixed z9700, +96px au-dessus du dock,
texte ~8 lignes = pavé ~350px) recouvrait les chips et avalait les taps à
chaque session en navigation privée. Correctifs : bandeau au vrai bas (peut
couvrir le dock temporairement) + texte court avec lien politique + pile
verticale mobile + max-height 30vh ; chips catalogue = rangée unique
défilante sur mobile ; devis +/− recouverts par le sous-total → flex-wrap.
OUTIL AJOUTÉ : scratchpad audit-buttons.js — volet A hit-test de tous les
boutons/liens visibles (11 routes × desktop/iPhone × bandeau affiché ; barres
de nav fixes = non-défaut ; pointer-events:none exclus ; retry scrollIntoView
behavior:'instant' — OBLIGATOIRE, le smooth global fausse les lectures) +
volet B fonctionnel (chips, recherche, select, PDP, panier, modale, menu,
territoire, carrousel, auth, contact, footer, dock). Résultat final : 0 défaut.

## Session résilience écran noir (15/07/2026, SW v314, mergé master)
Bug iPad intermittent : page noire (vues .hidden), seuls topbar/dock/WhatsApp
statiques affichés. Cause : après un déploiement (8 bumps ce jour-là), app.js
?v=NOUVEAU absent du cache SW + hoquet réseau → handleStatic rendait 504 VIDE
→ app jamais exécutée, aucune relance. Introuvable en harnais SANS SW —
reproduit avec page contrôlée par SW + serveur coupé. Défense en 2 étages :
- sw.js fromCacheAnyVersion : dernier recours = même chemin en cache,
  ignoreSearch (app périmée fonctionnelle > page morte ; SWR rafraîchit après).
- index.html watchdog inline #ptBootWatchdog : PT_BOOTED (fin d'init app.js)
  absent après 7 s → message + bouton Recharger. Plus JAMAIS d'écran noir muet.
Vérifié 5/5 : app.js coupé→watchdog ; boot normal→pas de watchdog ; SW
contrôle ; serveur coupé + ?v=inconnu → 200 depuis le cache (273 Ko).
PIÈGE TEST : querySelector('div[role=alert]') matche #stripeCardError en
premier — cibler #ptBootWatchdog.

## Vérification standard
`cd pirates-tools && node scripts/ci.js` doit rester vert après chaque étape.
Bump SW (`sw.js` VERSION + ASSET_VER) et `?v=` dans `index.html` à chaque changement d'asset.

## Rappels techniques
- app.js = un seul IIFE (~6172 lignes), style ES5 var/function.
- Cache-busting : VERSION + ASSET_VER + ?v= doivent être alignés.
- Ne jamais commiter de secret serveur côté client (clés publishable Stripe OK).
