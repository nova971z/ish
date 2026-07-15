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

═══ PLAN DE REMÉDIATION TERMINÉ (10/10 étapes) + QR crypto local (8e) fait. Reste : refactors CSS risqués (9 reporté), split XXL (10d reporté). ═══

## Vérification standard
`cd pirates-tools && node scripts/ci.js` doit rester vert après chaque étape.
Bump SW (`sw.js` VERSION + ASSET_VER) et `?v=` dans `index.html` à chaque changement d'asset.

## Rappels techniques
- app.js = un seul IIFE (~6172 lignes), style ES5 var/function.
- Cache-busting : VERSION + ASSET_VER + ?v= doivent être alignés.
- Ne jamais commiter de secret serveur côté client (clés publishable Stripe OK).
