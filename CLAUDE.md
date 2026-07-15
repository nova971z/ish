# Mémoire projet — Pirates Tools (e-commerce PWA)

Travail actif : `pirates-tools/` (PWA vanilla HTML/CSS/JS, API serverless Vercel + Firebase + Stripe).
Branche de dev : `claude/pirates-tools-rebuild-zWc1b`. Prod = Vercel, domaine perso `pirates-tools.com`.

## Exigence qualité (non négociable)
Code de niveau ingénieur web senior, standard des grandes institutions e-commerce.
Aucun hasard, aucun bullshit. Chaque correction est vérifiée dans le code avant d'être livrée.

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
       8e QR crypto tiers (qrserver) : MITIGÉ (avertissement → l'adresse texte fait foi, pas le QR). REPORTÉ : génération QR locale (lib complète ~1000 l. ; blob invérifiable ou encodeur maison risqué refusés). À traiter comme tâche dédiée révisée avant lancement crypto.
- [~] 9. Assainir CSS/HTML — SOUS-ENSEMBLE SÛR FAIT ✅ commit, SW v297 ; refactors risqués REPORTÉS.
       FAIT : (1) lumière dorée restaurée (#hero::before halo radial or, styles.css:444) ; (2) console debug retirée de la prod (~82 l., index.html) ; (3) <h1> sr-only sur l'accueil (SEO/a11y) ; (4) CSS mort retiré (315 l. : section 12 modal 3D + sections 21-22 site-links/footer mort — TOUS sélecteurs vérifiés 0-réf ; vrai footer .footer-social/.site-footer intact).
       REPORTÉ (nécessite vérif visuelle par-règle, refusé de sweeper à l'aveugle = « aucun hasard ») :
        - fork inline styles.css vs index.html (.drawer/#toasts/.toast/#dock) : déplacer verbatim en fin de styles.css (ordre cascade préservé) — à faire prudemment.
        - purge !important (71→moins) : chaque retrait change la cascade → test visuel requis.
        - échelle z-index documentée : réordonner l'empilement → test visuel requis.
        - #a2hsTip mort mais éparpillé (styles.css 4367+, 4888) → suppression ciblée.
        - renumérotation sections CSS (doublon 10b, sections 32+ non numérotées).
- [ ] 10. Qualité structurelle & CI (helpers partagés, carte produit unique, docs)

## Vérification standard
`cd pirates-tools && node scripts/ci.js` doit rester vert après chaque étape.
Bump SW (`sw.js` VERSION + ASSET_VER) et `?v=` dans `index.html` à chaque changement d'asset.

## Rappels techniques
- app.js = un seul IIFE (~6172 lignes), style ES5 var/function.
- Cache-busting : VERSION + ASSET_VER + ?v= doivent être alignés.
- Ne jamais commiter de secret serveur côté client (clés publishable Stripe OK).
