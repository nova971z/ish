# Mémoire projet — Pirates Tools (e-commerce PWA)

Travail actif : `pirates-tools/` (PWA vanilla HTML/CSS/JS, API serverless Vercel + Firebase + Stripe).
Branche de dev : `claude/pirates-tools-rebuild-zWc1b`. Prod = Vercel, domaine perso `pirates-tools.com`.

## Exigence qualité (non négociable)
Code de niveau ingénieur web senior, standard des grandes institutions e-commerce.
Aucun hasard, aucun bullshit. Chaque correction est vérifiée dans le code avant d'être livrée.

## 📌 À FAIRE PLUS TARD (en attente, décidé avec l'user — à traiter ensemble)
- [ ] **Déployer les règles Firestore** (verrou anti-fraude S1 + crypto désactivé
      v322 : le fichier firestore.rules est à jour, mais PAS déployé sur le
      projet). Voie simple iPad = console.firebase.google.com → Firestore →
      Règles → coller le contenu de firestore.rules → Publier. (CLI impossible
      côté Claude : pas d'accès au compte Google de l'user, c'est voulu.)
- [ ] **Auth admin mot de passe fort + Google Authenticator (TOTP)** : demandé.
      Nécessite d'activer Identity Platform (console Firebase) + méthode TOTP,
      puis code : écran login admin (email+MDP+défi TOTP+enrôlement QR) et
      serveur exigeant claim admin ET 2e facteur, puis retrait d'ADMIN_SECRET.
      Le socle claim admin existe déjà (H6, set-admin-claim.js).
- [ ] **Tableau de bord admin — stats de visite/clics** : demandé (voir réponse
      donnée). À cadrer : reco = collecte maison (events → Firestore) OU GA4.
      Décision produit + périmètre à trancher avec l'user avant de coder.
- [ ] **⚠️ USER À VÉRIFIER — 2 fiches produits au SKU imprécis** (décidé le
      18/07/2026 : « laisse comme ça pour l'instant, mais garde ces valeurs et
      note qu'il faut que j'aille vérifier »). Ces 2 produits d'origine ont un
      SKU qui n'existe pas tel quel au catalogue constructeur ; leurs specs ont
      été remplies à partir du VRAI modèle équivalent (recherche web) mais
      RESTENT À CONFIRMER par l'user avant lancement :
        • Facom `CL3.C18SP` → vraie réf. probable **CL3.CH18SP2** (boulonneuse
          à chocs 1/2" 18V brushless, 950 Nm, kit 2×5 Ah + coffret ToughSystem).
        • Flex `FW1/2-502` → vraie réf. probable **Flex IW 1/2" 18.0-EC**
          (boulonneuse à chocs 1/2", 250 Nm ; « FW » n'existe pas chez Flex).
      Action user : confirmer que ce sont bien ces modèles vendus → alors
      corriger SKU/titre/id pour être exact ; sinon les retirer. (3 autres
      fiches fantômes DÉJÀ SUPPRIMÉES le 18/07 : Stanley FMC645D2, FMC688L2,
      Facom CL2.C18S.)

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

## Session cybersécurité S1-S3 (15/07/2026, SW v315, mergé master)
Suite à un audit sécurité complet 4 axes (API, Firebase, client/XSS, RGPD).
Verdict : socle solide (0 XSS exploitable, prix/fidélité serveur, QR local, SW
sain, pas de carte touchée). 3 failles critiques traitées :
- ✅ S1 RÈGLES FIRESTORE (le trou racine) : AUCUN firestore.rules n'était
  versionné → la seule barrière protégeant les données clients était inconnue.
  Créé firestore.rules (DEFAULT-DENY) + firebase.json : users/{uid} self-only +
  allowlist de champs ; orders création client 'quote'/'pending'/'declared'
  seulement (jamais 'paid') ; payments/stripe_events/rate_limits/
  product_overrides fermées au client ; catch-all final if false. PROUVÉ par
  scripts/test-rules.js (27 assertions) contre l'ÉMULATEUR Firestore réel
  (firebase-tools installé en dev). NON branché à la CI (émulateur requis).
- ✅ S3 (fermé par S1) : le client ne peut plus forger status:'paid' (règle) ;
  /merci écrit 'pending', le webhook Admin SDK confirme en 'paid'.
- ✅ S2 IDOR uid : create-payment-intent/checkout faisaient confiance à
  body.uid → un attaquant lisait la dépense/fidélité d'autrui + volait sa
  remise. Corrigé : _lib/firebase.verifyUid(req) vérifie l'ID token Firebase
  (Authorization Bearer) ; uid dérivé UNIQUEMENT du token vérifié, body.uid
  ignoré. Client : jsonAuthHeaders() joint getIdToken aux 2 POST.
⚠️ ACTIONS USER AVANT LANCEMENT :
  1. DÉPLOYER LES RÈGLES : `cd pirates-tools && npx firebase deploy --only
     firestore:rules` — TANT QUE CE N'EST PAS FAIT, la protection des données
     clients reste théorique (règles réelles sur le projet = inconnues).
  2. Vérifier FIREBASE_SERVICE_ACCOUNT sur Vercel (verifyIdToken en dépend ;
     sans lui, uid=null → aucune remise mais paiement OK).
Restent de l'audit sécu (🟠, non bloquants, à faire) : en-têtes CSP+HSTS+
Permissions-Policy (vercel.json) ; rate-limit x-real-ip au lieu de xff ;
territoire fiscal CP obligatoire côté API ; énumération de comptes ;
verifyBeforeUpdateEmail ; GA4/Meta Pixel sur-déclarés dans les textes.

## Session renforcements sécu H1-H6 (15/07/2026, SW v316, mergé master)
Suite aux 🟠 de l'audit cybersécurité. 1 commit chacun, tests unitaires +
Playwright + émulateur.
- ✅ H1 CSP + HSTS + Permissions-Policy (vercel.json) : CSP STRICTE sans
  'unsafe-inline' pour scripts → 3 scripts inline autorisés par EMPREINTE
  sha256 (restent frais avec le HTML). Whitelist Stripe/Firebase/CDN 3D/
  CoinGecko. HSTS 2 ans preload. Permissions-Policy (geoloc/cam/micro coupés,
  payment=self+stripe). COOP same-origin-allow-popups. GARDE-FOU CI :
  scripts/check-csp.js recalcule les hashes depuis index.html (dérive = CI
  rouge). Vérifié Chromium : 0 violation sur le code propre. NOTE : le ?v=
  bump ne change PAS les scripts inline → hashes stables.
- ✅ H2 rate-limit x-real-ip (Vercel, non spoofable) au lieu du 1er
  x-forwarded-for (falsifiable). Repli = DERNIER token XFF.
- ✅ H3 code postal OBLIGATOIRE sur create-payment-intent → territoire dérivé
  du CP seul (fin du taux Mayotte forçable par appel API direct). checkout
  (repli) reste déclaré+détectif.
- ✅ H4 anti-énumération : login → message générique unique ; reset password →
  message neutre même si compte inexistant. + activer Email Enumeration
  Protection console.
- ✅ H5 verifyBeforeUpdateEmail (au lieu d'updateEmail) : le nouvel email doit
  être vérifié ; email non écrit en Firestore avant confirmation ; s'appuie sur
  requires-recent-login (réauth de fait).
- ✅ H6 auth admin par CLAIM Firebase (rétrocompat secret) : verifyAdmin
  (claim admin===true) ; requireAdmin async accepte claim OU secret (aucun
  faux positif, échec fermé) ; client envoie X-Admin-Secret + Bearer si
  connecté ; scripts/set-admin-claim.js.
⚠️ ACTIONS USER (notées) :
  - H6 : `node scripts/set-admin-claim.js <email>` → reconnexion → vérifier
    /admin connecté sans secret → SUPPRIMER ADMIN_SECRET sur Vercel.
  - H4 : activer « Email Enumeration Protection » (console Firebase Auth).
firebase-tools + émulateur Firestore installés en dev (non committés) pour
tester règles (S1) — restent dispo pour re-tester.

## Session RGPD/mineurs M1-M5 (15/07/2026, SW v317, mergé master)
Derniers 🟢 de l'audit sécurité soldés :
- ✅ M1 fin sur-déclaration GA4/Meta Pixel : bandeau consentement affiché
  UNIQUEMENT si un traceur est configuré (IDs vides → pas de bandeau, conforme
  ePrivacy) ; politique reformulée (aucun traceur actif à ce jour). Mécanisme
  prêt : dès qu'un ID est renseigné, bandeau + consentement réapparaissent.
- ✅ M2 IP hachée (sha256 tronqué) dans rate_limits/ au lieu d'en clair.
  Rappel owner : activer policy TTL Firestore sur rate_limits.expiresAt.
- ✅ M3 pas de PII dans les logs : webhook logue orderRef, plus l'email ;
  contact/newsletter loguent status+message d'erreur, plus l'objet complet.
- ✅ M4 droit à l'oubli : rules owner-delete (users/{uid} + orders ; payments/
  conservé comptable) ; UI Paramètres « Supprimer mon compte » ; flux réauth
  mot de passe → purge orders+profil → deleteUser → nettoyage. test-rules.js
  29/29 (owner supprime SES données, pas celles d'autrui). Playwright OK.
- ✅ M5a noopener sur window.open WhatsApp (app.js). M5b SRI sha384 sur
  model-viewer 3.5.0 (hash calculé sur le fichier réel ajax.googleapis).
  three.js : SRI reporté (fichier jsdelivr injoignable via proxy pour hasher ;
  protégé par restriction d'origine CSP).
firestore.rules : delete désormais autorisé au titulaire (M4) — test-rules.js
à jour (29 assertions).

## Régression 3D post-sécurité (16/07/2026, SW v318, mergé master)
Bug : outils 3D ne s'affichent plus (après H1/M5b). Cause PROUVÉE : tous les
.glb produits sont KHR_draco_mesh_compression → model-viewer décode via un Web
Worker créé depuis un blob: + WASM (draco/basis depuis gstatic). La CSP H1
avait worker-src 'self' (bloque blob:) et pas de 'wasm-unsafe-eval' (bloque
WASM) → décodage impossible → 0 modèle rendu. Correctifs vercel.json :
worker-src 'self' blob: + child-src 'self' blob: + script-src 'wasm-unsafe-eval'
('wasm-unsafe-eval' ≠ 'unsafe-eval' → check-csp reste vert). SRI model-viewer
(M5b) RETIRÉ : crossOrigin+integrity exigeaient CORS + octets identiques au bit,
invérifiable en sandbox et 2e facteur de blocage ; protection = restriction
d'origine CSP. LEÇON : toute CSP sur un site 3D DOIT autoriser worker-src blob:
+ wasm-unsafe-eval. Rendu 3D réel non testable en sandbox (pas de réseau CDN) →
confirmation user sur le live.
NOTE : bandeau cookies masqué au démarrage = VOULU (M1, aucun traceur configuré)
— pas un bug ; peut être ré-affiché si un jour un ID GA4/Meta est renseigné.

## Session 3 bugs post-sécurité (16/07/2026, SW v320, mergé master)
LEÇON PROTOCOLE : les correctifs v319/v320 étaient restés sur la branche SANS
merge master pendant que l'user testait le live (= v318 encore cassée) → il a
constaté « rien ne marche ». TOUJOURS merger master après vérification (Vercel
ne déploie QUE master), c'est le protocole convenu (« tu peux merge et je te
fais un retour »).
Retours user (captures iPad, navigation privée) : (a) textures 3D blanches,
(b) page vide intermittente au clic catégorie, (c) bandeau cookies absent.
Méthode : reproduction Playwright sous la CSP RÉELLE + model-viewer vendu en
local (mv.js téléchargé), + capture analysée finement (la 5e capture a corrigé
mon diagnostic initial).
- ✅ TEXTURES BLANCHES (v319) : les GLB embarquent leurs textures en
  EXT_texture_webp (image/webp). three.js les décode en créant un blob: URL
  chargé via fetch() → gouverné par connect-src. La CSP (H1) n'autorisait blob:
  ni dans img-src ni dans connect-src → « Refused to connect blob: — connect-src »
  → « THREE.GLTFLoader: Couldn't load texture » → surface blanche (géométrie
  DRACO OK depuis v318). Correctif : blob: ajouté à img-src ET connect-src
  (blob = same-origin URL.createObjectURL, sûr). Reproduit + 0 violation après
  fix. LEÇON : site 3D avec textures embarquées webp/png → la CSP DOIT autoriser
  blob: dans connect-src (fetch du blob) ET img-src (voie Image/TextureLoader).
- ✅ PAGE VIDE (v320) : la capture montrait topbar+dock fixes MAIS ni barre de
  recherche ni chips ni liste = VUE entière non peinte (pas « #list vidé »).
  Cause : `.view { content-visibility:auto; contain-intrinsic-size:800px 600px }`.
  Sur iOS Safari, une vue dont le sous-arbre est remplacé (re-render #list au
  clic catégorie) ou révélée via bascule display reste « skipped » → seul le
  placeholder ~800×600 est peint = rectangle noir. Présent AVANT v314 → explique
  que la résilience SW n'ait rien changé (mauvaise cause à l'époque). Indice :
  l'auteur avait déjà neutralisé content-visibility sur #view-produit (« casse
  sticky »). Correctif : retiré de .view/.card/.cat-card (gain perf nul : SPA =
  1 vue affichée, listes 26 items). #view-produit reste content-visibility:
  visible. Écarté par test : PAS l'épuisement WebGL (model-viewer 3.x =
  renderer partagé unique, testé 26→2 ×8 = 0 fuite) ni la mémoire (aurait blanchi
  les modèles, pas la barre de recherche). Confirmation non-blank iPad = user.
- ✅ BANDEAU COOKIES (v320, REMPLACÉ en v321) : M1 le masquait (aucun traceur =
  pas de consentement requis). User le veut visible sans mentir. v320 = info +
  « J'ai compris » (bouton unique). RETOUR USER : pas de choix = « pas
  respectable » → v321 = schéma standard : cookies techniques TOUJOURS actifs
  (annoncés dans le texte, pas de case) + choix RÉEL Accepter/Refuser pour la
  mesure d'audience. Honnêteté : « pourra être activée » (aucun traceur branché) ;
  le choix est enregistré dans pt:analytics-consent = LA clé qui gouvernera
  GA4/Meta le jour d'un ID renseigné (Refuser = jamais de traçage, même après
  activation). CNIL : Refuser aussi accessible qu'Accepter. pt:cookie-notice
  supprimée. 10/10 assertions Playwright (refus/accept/persistance/reload/
  session privée/lien politique).
REVERSAL DOC : la NOTE M1 ci-dessus (« bandeau masqué = voulu ») est désormais
caduque — remplacée par le bandeau info honnête.

## Canal crypto DÉSACTIVÉ (17/07/2026, SW v322, mergé master)
Décision produit : le paiement crypto (flux déclaratif non vérifié serveur =
risque fraude) est masqué au lancement, SANS effacer le code. Interrupteur
`PT_CRYPTO_ENABLED=false` (app.js) + 3 couches : UI (onglet + barre d'onglets
masqués via applyCryptoVisibility), logique (cryptoSwitchTab force 'card',
init crypto off), et firestore.rules ('declared' retiré de la liste blanche
create = vrai verrou anti-fraude). Réactiver = flag true + 'declared' remis
dans les règles (commentaires croisés). Vérifié : Playwright 7/7 + émulateur
29/29 (« Alice NE peut PAS créer declared »). ⚠️ le verrou serveur suppose les
règles DÉPLOYÉES (`firebase deploy --only firestore:rules`). Textes CGV/confid.
mentionnant le crypto laissés en place (« le cas échéant » = conditionnel, non
trompeur ; à retirer si suppression définitive un jour).

## Tableau de bord admin — Analytics maison (17/07/2026, SW v326, mergé master)
Fiche + plan : `pirates-tools/docs/PLAN-DASHBOARD-ADMIN.md`. Mesure d'audience
PREMIÈRE PARTIE (pas de GA4/traceur pub), agrégats (pas de log brut), IP jamais
stockée. 6 étapes, 1 commit chacune, tout vérifié (Playwright + émulateur +
unitaires check-analytics en CI).
- ✅ É1 socle serveur : api/events.js (POST public, rate-limit, validation anti-PII,
  géo en-têtes Vercel) → agrégats Firestore via api/_lib/analytics.js (logique
  PURE). Collections analytics_* server-only (rules). 34/34 émulateur.
- ✅ É2 émission client : beacon sendBeacon branché sur track(). 2 niveaux CNIL :
  ANONYME (sessionStorage, exempté) + CONSENTI (localStorage 13 mois → nouveau/
  récurrent + affinité produit). Bandeau reformulé (perso = avec accord). Temps/
  article (view_item→pagehide), clics data-track (dock/chips/WhatsApp). 16/16.
- ✅ É3 API admin : GET /api/admin?type=stats|clients (requireAdmin). summarize()
  pure. Clients = users/ + count() commandes.
- ✅ É4 UI : onglets admin Statistiques (compteurs, appareils/sources, top
  produits+temps, clics, provenance) + Clients (cartes). 16/16.
- ✅ É5 globe 3D : three.js (ensureThree, aucune texture externe), points par
  pays (repli COUNTRY_LATLNG DOM-TOM), surcouche non bloquante, destroy propre
  (0 fuite WebGL). 11/11 (THREE mocké + dégradation).
- ✅ É6 rapport mensuel : api/cron-report.js (Vercel Cron 1er du mois, auth
  CRON_SECRET OU admin) → mail Resend (résumé HTML + PIÈCE JOINTE JSON
  analysable) + purge daily>14 mois / visiteurs>13 mois. Bouton admin « recevoir
  maintenant ». 12/12 (Firestore mocké + Resend intercepté).
⚠️ ACTIONS USER (Vercel) pour activer pleinement :
  - `CRON_SECRET` (env) sinon le cron mensuel refuse (401) et n'envoie rien.
  - `FIREBASE_SERVICE_ACCOUNT` (déjà là), `RESEND_API_KEY`/`RESEND_FROM`/
    `OWNER_EMAIL` (déjà là) pour le mail.
  - Déployer firestore.rules (analytics_* fermées) — même action S1 en attente.
NOTE consentement : la couche ANONYME tourne sans consentement (exemption CNIL
mesure d'audience 1re partie) ; le profil persistant/affinité + nouveau/récurrent
n'existe QUE si l'utilisateur accepte. Refuser = pas de localStorage pt:vid.

## Vérification standard
`cd pirates-tools && node scripts/ci.js` doit rester vert après chaque étape.
Bump SW (`sw.js` VERSION + ASSET_VER) et `?v=` dans `index.html` à chaque changement d'asset.

## Rappels techniques
- app.js = un seul IIFE (~6172 lignes), style ES5 var/function.
- Cache-busting : VERSION + ASSET_VER + ?v= doivent être alignés.
- Ne jamais commiter de secret serveur côté client (clés publishable Stripe OK).

## Session catalogue produits (18/07/2026, SW v336, mergé master)
Peuplement du catalogue à partir de captures Cotébrico/Screwfix (l'user envoie
par lots de 5). Modèle de prix TRANCHÉ : `price_ht` = coût HT fournisseur × 1,15
(marge 15 %, PROMOS IGNORÉES) ; `price` = price_ht × 1,20 (TTC métropole
d'affichage). Le serveur re-dérive le TTC territorial (octroi + TVA DOM via
calcPrice/pricing.js). Libellés stock laissés « En stock » (décision user :
délais affichés au paiement, pas via le badge — futur chantier frais de port).
- Lot 1 (session précédente) : 5 DeWALT (packs/rabot/souffleur/aspi).
- Lot 2 : +4 DeWALT (DCK266P2T + 3 packs énergie FLEXVOLT) ; DCF887N existant
  réaligné 129€→94€ (marge ~88 %→15 %) + specs enrichies. Catégorie
  « Batteries et chargeurs » créée.
- Lot 3 : +5 DeWALT (2 perforateurs FILAIRES tag corded, batterie DCB184,
  DCD996P2, visseuse placo DCF620 moteur À CHARBONS). Catégorie
  « Perforateurs » créée.
- BUG specs INVISIBLES corrigé (v334) : `.pdp-specs-table tr` en opacity:0
  révélé au scroll, mais initPdpScrollAnimations() était appelé AVANT
  l'injection features/specs/kit → nouvelles lignes jamais animées (bloquées
  invisibles). Fix : appel APRÈS injection. Latent jusqu'ici car les 26
  produits d'origine avaient une table vide. + bloc « Caractéristiques » masqué
  quand aucune spec (v333, grille 3D recentrée .pdp-split--solo).
- SPECS ANCIENS PRODUITS (v335) : 22/25 remplies via recherche web fiches
  constructeur (4 agents // : DeWALT/Makita/Festool+Flex/Facom+Stanley+Wera).
  Corrigés fidèlement : DCS391N = À CHARBONS (pas brushless), TSC55 = bi-tension
  36 V. Voir specs-*.json dans scratchpad si re-run nécessaire.
- 3 fiches FANTÔMES SUPPRIMÉES (v336, validé user) : Stanley FMC645D2 (réf. =
  visseuse à chocs, pas scie sauteuse), FMC688L2 (réf. = batterie, pas
  perceuse), Facom CL2.C18S (SKU inexistant). Catalogue 40→37, TOUS avec specs.
- 2 fiches SKU-imprécis GARDÉES à vérifier par l'user → voir « À FAIRE PLUS
  TARD » (Facom CL3.C18SP, Flex FW1/2-502).
- DCG405FN-XJ (meuleuse tête plate, ~20/07) : prix dérivé d'AMAZON (176,24€
  TTC → HT 146,87 × 1,15) car INTROUVABLE sur Cotébrico. Prix VALIDÉ par l'user
  (« on s'aligne sur ce prix pour l'instant ») — PAS une erreur. À ajuster
  seulement SI l'user trouve moins cher un jour (il préviendra).
- 3D branchée aux fiches par lots (GLB uploadés par l'user sur master, nommés
  par SKU). Règle : rendu outil-seul UNIQUEMENT sur versions nues ; kits P2/P2T/
  D2K = modèles composés (fournis plus tard) → GLB seul retiré des kits
  DCF894P2/DCF887P2/DCF850P2T/DCD796P2. Poids GLB cible ≤1,5 Mo (2,5 max).

## Session packs 3D — modèle interactif fusionné (20/07/2026, SW v351, mergé master)
EXIGENCE USER NON NÉGOCIABLE : « toutes les fiches produits doivent contenir le
modèle qui tourne et pas le poster ». Pour les kits (P2/P2T/D2K = plusieurs
objets), il faut donc FUSIONNER les composants GLB en UN seul modèle, et
compresser « un tout petit peu » si trop lourd.
- ✅ DCF887P2 (1er pack) : fusion de 5 composants (visseuse DCF887N + chargeur
  DCB1104 + 2× batterie DCB184 orientées bat_r90 = Math.PI/2 + coffret TSTAK)
  en `models/products/dcf887p2-pack.glb`. Proportions RÉELLES (outil 180 mm,
  chargeur 150 mm, batterie 85 mm, coffret 430 mm). Disposition compacte :
  coffret centre-fond, outil à droite, chargeur + 2 batteries devant, aucun
  chevauchement. products.json DCF887P2.model branché. Le poster 2D (collage
  images/posters/dcf887p2.webp) RESTE l'image de la CARTE (catalogue rapide,
  0 GLB) ; la 3D ne se charge qu'à l'ouverture de la fiche (setPdpViewer, déjà
  en place). Orbite par défaut model-viewer 25/72 cadre le pack de face-droite.
- PIPELINE (réutilisable pour les autres packs) : `scratchpad/_gltftools/
  pack-merge.mjs` (gltf-transform). mergeDocuments(target,source) — PAS
  doc.merge ; reparent des enfants de scène sous un node wrapper ; getBounds →
  scale sur realMax ; rotationY via quaternion ; layout `pos` compact ; UN SEUL
  buffer (contrainte GLB, consolidation des accessors). Compression : dedup +
  weld + **simplify meshopt ratio 0.3 (erreur 0,1 %)** + draco + textureCompress
  WebP 512². Le maillage était l'ennemi (1,19 M verts → 6 Mo avant décimation),
  PAS les textures (0,4 Mo). Résultat 2,54 Mo (bande acceptable, < plafond 3 Mo).
  meshoptimizer présent dans _gltftools/node_modules (MeshoptSimplifier.ready).
  LEÇON : GLTFExporter three.js DÉCOMPRESSE les textures (→103 Mo, inutilisable) ;
  gltf-transform les garde compressées → seule voie viable.
- VÉRIF : rendu three.js headless (SwiftShader) du GLB décimé à l'angle de
  référence → coffret/outil/chargeur/batteries + logos NETS, 0 perte visible.
- COMPOSITION affinée en 2 retours user puis VALIDÉE (« nickel tu peux
  envoyer ») → mergé master : (1) visseuse = HÉROS au premier plan avant-droit
  (produit principal, doit être le plus visible) ; coffret tourné rotationY
  -90°→0° = DE FACE (loquets/étiquette vers caméra ; -90° montrait le côté =
  « de travers ») ; chargeur+batteries en rangée avant sans occlusion.
  (2) chargeur+2 batteries RAPPROCHÉS de la visseuse (rangée décalée droite +
  resserrée) ; coffret réduit 430→400 mm. RECETTE COMPO (à réutiliser) : caméra
  PDP fixe ≈ azimut 25°/polar 72° (+Z vers caméra, +X à droite) → placer le
  produit principal en +Z/+X (premier plan = héros par perspective), coffret de
  face reculé (-Z) décalé gauche, accessoires en rangée avant étalée en X.
  Orientations vérifiées par rendu 4×90° (_orient.js) : DCF887N héros = rotY 0
  (chuck gauche, logo DEWALT face) ; TSTAK de face = rotY 0.
- Les 3 autres kits (DCF894P2, DCF850P2T, DCD796P2 + gros packs) suivront la
  MÊME recette quand l'user enverra leurs composants GLB + photo de référence.
- 🗺️ GABARIT VERSIONNÉ (idée user « quadrillage map au sol pour se souvenir des
  positions ») : `docs/PACK-3D-LAYOUT.md` + `docs/pack-3d-layout-map.svg`
  (carte quadrillée mm, vue de dessus, extraite AUTO du pipeline via
  pack-layout.json). Contient repère caméra, règle héros, coordonnées validées
  (cx/cz/emprise par composant) ET les formules paramétriques relatives au
  coffret → à réappliquer tel quel pour les prochains packs. Vérif orientation
  d'un GLB : `scratchpad/_orient.js` (4 vues à 90°).
