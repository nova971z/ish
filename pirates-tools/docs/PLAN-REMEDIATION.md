# Plan de remédiation — Pirates Tools

> Document de travail. Objectif : passer d'un site fonctionnel mais fragile à un
> niveau **production institutionnel**. Chaque étape est autonome, vérifiable et
> donne lieu à **un commit dédié**. On ne passe pas à l'étape N+1 tant que la
> vérification de l'étape N n'est pas verte.
>
> Branche de travail : `claude/pirates-tools-rebuild-zWc1b`
> Règle d'or : **1 étape = 1 problème = 1 commit = 1 vérification**. Aucun mélange.

---

## Principe de priorisation

L'ordre n'est pas négociable : **argent → sécurité → fonctionnel → structure → polish**.
On ne touche pas au CSS mort tant qu'un client peut payer 1 centime un produit.

| Bloc | Étapes | Enjeu |
|------|--------|-------|
| Fonctionnel bloquant | 1 | Pages mortes, commandes non enregistrées |
| Argent | 2 | Prix manipulable / prix affiché ≠ débité |
| Sécurité | 3, 4 | Endpoints ouverts, XSS |
| Déploiement | 5 | Paiement cassé sur le domaine livré |
| Fiabilité paiement | 6 | Webhook Stripe |
| Résilience | 7, 8 | Service worker + bugs runtime |
| Qualité structurelle | 9, 10 | Dette CSS/JS, tests, docs |

---

## Étape 1 — Réparer le routeur (débloque admin, contact, favoris, ET l'enregistrement des commandes)

**Pourquoi c'est en premier** : une seule ligne ressuscite 4 pages mortes, dont `/merci`
(retour de paiement Stripe) — actuellement **aucune commande payée n'est enregistrée en base**.

- **Fichier** : `app.js`
- **Ligne** : `2753`
- **État actuel** :
  ```js
  var ROUTES = ['/', '/catalogue', '/produit', '/devis', '/compte', '/auth', '/abonnement'];
  ```
- **Correction** :
  ```js
  var ROUTES = ['/', '/catalogue', '/produit', '/devis', '/compte', '/auth',
                '/abonnement', '/admin', '/merci', '/contact', '/favoris'];
  ```
- **Points de contrôle associés** (les cas `switch` existent déjà, l.2895-2906 — rien à ajouter côté rendu) :
  - `/admin` → `renderAdmin()`
  - `/merci` → `handleMerciPage()` (écriture Firestore + fidélité + `track('purchase')`)
  - `/contact` → `setupContactForm()`
  - `/favoris` → `renderWishlist()`
- **Vérification** :
  1. Ouvrir `#/admin` → le panneau admin s'affiche (plus de redirection accueil).
  2. Ouvrir `#/contact` et `#/favoris` → vues correctes.
  3. Simuler un retour `#/merci` avec un `pt_pending_order` en `localStorage` → vérifier l'écriture Firestore.
- **Commit** : `fix(pt): register /admin /merci /contact /favoris routes (dead pages + lost orders)`

---

## Étape 2 — Intégrité des prix (faille d'argent)

**Deux bugs distincts, même étape car même sujet : le prix.**

### 2a — Le serveur doit recalculer le prix (ne jamais faire confiance au client)

- **Fichiers** : `api/checkout.js` (l.34), `api/create-payment-intent.js` (l.38)
- **Problème** : `unit_amount`/`amount` proviennent de `item.price` envoyé par le navigateur.
- **Correction** :
  1. Charger `products.json` côté serveur (déjà lu dans `api/products.js` — factoriser un `loadCatalog()`).
  2. Pour chaque ligne, résoudre le produit par `id`/`sku` et utiliser **le prix du catalogue serveur**, jamais celui du body.
  3. Recalculer la taxe territoriale côté serveur si le territoire fait partie du devis (cf. `calcPrice` — porter la logique serveur ou l'extraire dans un module partagé `models/pricing.js`).
  4. Rejeter (400) toute ligne dont l'`id` est inconnu.
- **Vérification** : `POST /api/create-payment-intent` avec `{price: 0.01}` → le montant PaymentIntent doit être le **vrai** prix catalogue, pas 0,01 €.

### 2b — Le prix affiché doit égaler le prix débité

- **Fichiers/lignes** : affichage `app.js:681, 1402` (`calcPrice().ttc`) vs paiement `app.js:3971, 4190, 1482, 3605-3607` (`it.price` brut).
- **Correction** : tous les chemins de paiement doivent utiliser la **même** source que l'affichage (le prix taxé territoire). Idéalement, le montant final vient de l'étape 2a (serveur) et le client ne fait qu'afficher.
- **Vérification** : panier en Guadeloupe (TVA 8,5 % + octroi) → total panier == total modal == montant PaymentIntent, au centime.
- **Commit** : `fix(pt): resolve prices server-side and align displayed vs charged amount`

---

## Étape 3 — Verrouiller les endpoints API

- **3a — `api/orders.js`** : ajouter une authentification.
  - GET/POST exigent soit le secret admin (`x-admin-secret`, comparaison timing-safe), soit un ID token Firebase vérifié (`admin.auth().verifyIdToken`) dont l'`uid` doit correspondre au `?uid=` demandé.
  - Rejeter tout accès croisé (un utilisateur ne lit que ses propres commandes).
- **3b — CORS** (`vercel.json:7`) : remplacer `Access-Control-Allow-Origin: *` par une **allowlist d'origines** (domaine Vercel prod + preview). Les endpoints à secret ne doivent pas être appelables cross-site.
- **3c — Comparaison de secret timing-safe** : `api/admin.js:18`, `api/instagram.js:26`, `api/test-email.js:18` → remplacer `provided !== expected` par `crypto.timingSafeEqual` (avec égalisation de longueur). Factoriser dans `api/_lib/auth.js`.
- **Vérification** : appel cross-origin depuis un domaine tiers → bloqué ; `orders.js?uid=<autre>` sans token valide → 401.
- **Commit** : `fix(pt): authenticate orders API, restrict CORS, timing-safe admin secret`

---

## Étape 4 — Corriger les failles XSS

- **4a — `escapeHTML` doit échapper les guillemets** (`app.js:10-14`) :
  ```js
  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  ```
  (l'implémentation actuelle par nœud texte n'échappe **pas** `"` → injection en contexte d'attribut `alt="…"`, `src="…"`, `value="…"`).
- **4b — `openPayModal`** (`app.js:3985`) : envelopper `it.title` dans `escapeHTML(...)`.
- **4c — Audit des contextes d'attribut** : vérifier `app.js:556, 570, 572, 687, 862, 871, 906, 4867` (injection dans attributs à guillemets doubles) — l'étape 4a les couvre, mais confirmer visuellement.
- **Vérification** : produit de test avec titre `"><img src=x onerror=alert(1)>` → aucun script exécuté, texte affiché littéralement.
- **Commit** : `fix(pt): escape quotes in escapeHTML + sanitize payment modal (XSS)`

---

## Étape 5 — Cohérence de déploiement (paiement cassé sur le domaine livré)

- **Décision préalable à acter** : **la production est Vercel** (`ish-ebon.vercel.app`), car le paiement carte a besoin de `/api/*` que GitHub Pages n'a pas.
- **5a — `PT_API_BASE`** (`index.html:47-48`) : confirmer `''` (même origine) et **retirer** l'auto-déploiement GitHub Pages, ou pointer `PT_API_BASE` vers l'origine Vercel si Pages doit rester une vitrine sans paiement.
- **5b — Canonical / OG** (`index.html:14, 21`) : remplacer `https://nova971z.github.io/ish/` par l'URL Vercel de production.
- **5c — `sitemap.xml`** : les 32 URLs en fragment `#/…` sont ignorées des crawlers. Décision : soit assumer le SPA (sitemap = page d'accueil seule + `robots`), soit mettre en place un rendu de routes réelles. À court terme : corriger le domaine et documenter la limite.
- **5d — Workflow** : le déploiement doit se déclencher sur `master`, pas sur la branche `claude/…`. Corriger `.github/workflows/deploy-*.yml` (déclencheur `branches: [master]`) et s'assurer que `node scripts/ci.js` tourne **avant** le déploiement.
- **Vérification** : sur le domaine de prod, `/api/health` répond `200` ; `curl` du canonical == domaine de prod ; un push sur `master` déclenche CI puis déploiement.
- **Commit** : `fix(pt): align deploy target, canonical, sitemap and CI trigger on Vercel prod`

---

## Étape 6 — Fiabiliser le webhook Stripe

- **6a — Raw body** (`api/webhook.js:26`) : garantir le corps brut pour `constructEvent`.
  ```js
  export const config = { api: { bodyParser: false } };
  ```
  et lire le flux brut (`await buffer(req)`) au lieu de `JSON.stringify(rawBody)`.
- **6b — Idempotence** : dédupliquer sur `event.id` (collection Firestore `stripe_events/{id}` en `create` conditionnel) avant d'envoyer les emails / mettre à jour la commande. Empêche les doublons lors des redéliveries Stripe.
- **6c — Shape de réponse** : uniformiser sur `{ok:true, received:true}`.
- **Vérification** : rejouer un même `event.id` deux fois → un seul email, une seule écriture. Tester la signature avec `stripe listen`/CLI.
- **Commit** : `fix(pt): raw body + idempotency for Stripe webhook`

---

## Étape 7 — Corriger les bugs du Service Worker

- **7a — Empoisonnement du shell** (`sw.js:96-99`) : n'écrire dans `./index.html` **que** pour les vraies navigations vers l'app shell, pas pour toute réponse (`docs/`, `404.html`…). Conditionner sur `url.pathname`.
- **7b — Fallback image mort** (`sw.js:171-173`) : `fromCache` est `async` → `await` chaque appel avant le `||`.
  ```js
  const c1 = await fromCache(STATIC_CACHE, `./icons/icon-256.png?v=${ASSET_VER}`);
  if (c1) return c1;
  const c2 = await fromCache(STATIC_CACHE, './icons/icon-256.png');
  return c2 || new Response('', { status: 504 });
  ```
- **7c — `navigationPreload`** (`sw.js:50-52`) : déplacer l'activation de `install` vers `activate`.
- **7d — `CLEAR_OLD_CACHES`** (`sw.js:234-239`) : envelopper dans `e.waitUntil(...)`.
- **7e — Nettoyage précache** : retirer `./pt.js` (inexistant, l.20), dédupliquer le triple stockage de `index.html` (l.14-17), versionner les favicons ou les précacher non versionnés (cohérence `index.html:87-88`).
- **Vérification** : mode hors-ligne → image de secours s'affiche ; naviguer vers `docs/` puis revenir hors-ligne → app shell intact.
- **Bump SW** : `VERSION`/`ASSET_VER` → `290`, répercuter les `?v=` dans `index.html`.
- **Commit** : `fix(pt): service worker cache poisoning, offline fallback, preload timing`

---

## Étape 8 — Bugs de robustesse runtime (app.js)

- **8a — `starBtns` non défini** (`app.js:1679`) : définir `var starBtns = ...querySelectorAll(...)` dans la portée, ou réutiliser la variable existante des étoiles. Corrige le plantage à l'envoi d'un avis produit.
- **8b — `saveCart` / `saveHomeReview` sans try/catch** (`app.js:548, 1700`) : envelopper les `localStorage.setItem` (Safari privé / quota plein).
- **8c — `confirmPayment` sans `.catch`** (`app.js:4208`) : ajouter un `.catch` qui réactive le bouton et affiche une erreur.
- **8d — Clé NOWPayments côté client** (`app.js:3877` + `crypto-config.js:110`) : ne jamais envoyer de clé de compte au navigateur — router la création d'invoice via un endpoint serverless, ou retirer la fonctionnalité si non utilisée.
- **8e — QR codes tiers** (`app.js:3697, 3830`) : les QR d'adresses crypto sont générés par `api.qrserver.com` → générer localement (lib embarquée) pour éviter la substitution d'adresse.
- **8f — Accumulation d'écouteurs** (`app.js:1296-1314` mouseleave/touchstart, `1490-1493` whatsapp `once`) : retirer les anciens écouteurs avant d'en rajouter à chaque `renderPDP`.
- **8g — Garde d'auth au boot** (`app.js:2800`) : attendre `_authReady` (restauration session Firebase) avant de rediriger `#/compte` → `#/auth`, pour éviter le double-flicker.
- **Vérification** : envoyer un avis produit (pas de `ReferenceError`), payer avec réseau coupé (bouton réactivé), naviguer entre 5 PDP puis cliquer WhatsApp (un seul event `whatsapp_click`).
- **Commit** : `fix(pt): review submit crash, storage guards, payment catch, listener leaks`

---

## Étape 9 — Assainir CSS / HTML (source unique de vérité)

- **9a — Résoudre le fork inline vs styles.css** (`index.html:91-208` vs `styles.css:298+`) : supprimer les blocs `<style>` inline qui redéfinissent `.drawer`, `#toasts`, `.toast`, `.dock` ; garder **une seule** définition dans `styles.css`. Réactive au passage l'animation de glissement du dock (`index.html:94-97`).
- **9b — Supprimer le CSS mort** (~300 lignes) : section « 22) FOOTER » morte (`styles.css:4145`), section « 12) MODAL 3D » (`2367-2618`), section 21 `.site-links` (`4105`), `#a2hsTip` (`4888`). Vérifier chaque suppression par `grep` (0 référence dans index.html + app.js).
- **9c — `!important`** : réduire les 71 occurrences en résolvant la spécificité (surtout section 04 « couleurs forcées » et section 05 drawer).
- **9d — z-index** : établir une échelle documentée (ex. base 1, dropdowns 100, drawer 1000, dock 1000, toasts 9500, modales 9600) et éliminer les valeurs divergentes entre fichiers.
- **9e — Source unique** : numéro de téléphone (10 occurrences) → une constante ; adresses crypto → une seule source (retirer la duplication `index.html` ↔ `crypto-config.js`).
- **9f — Numérotation CSS** : corriger le doublon « 10b) », numéroter les sections 32-33 et suivantes, supprimer la section 15 vide.
- **9g — `<h1>` d'accueil** (`index.html:274`) : ajouter un `<h1>` visible sur la home (SEO + lecteurs d'écran).
- **9h — Retirer la console de debug de prod** (`index.html:1438-1518`) ou la conditionner à un flag.
- **Vérification** : `node scripts/ci.js` vert ; inspection visuelle drawer/dock/toasts inchangés ; Lighthouse a11y/SEO en hausse.
- **Commit** : `refactor(pt): single source of truth for CSS chrome, remove dead styles, fix z-index scale`

---

## Étape 10 — Qualité structurelle & garde-fous durables

- **10a — Helper `apiUrl()`** : factoriser les 12 résolutions dupliquées de `PT_API_BASE` en une fonction unique.
- **10b — Template carte produit unique** : les 5 copies (dont favoris/récemment-vus affichent un prix non taxé) → une seule fonction `renderProductCard(p)` utilisant `calcPrice().ttc` partout. Corrige la dérive de prix inter-pages.
- **10c — Helpers API partagés** : `api/_lib/firebase.js` (init unique), `api/_lib/auth.js` (secret timing-safe), `api/_lib/pricing.js` (prix serveur) — supprime la quadruple duplication d'init Firebase.
- **10d — Découper les fonctions XXL** : `renderAdmin` (~250 l.), `initPdpScrollAnimations` (~400 l.), `renderPDP` (~215 l.) en sous-fonctions testables.
- **10e — Rate limiting** : `api/contact.js`, `api/newsletter.js` (relais email non authentifiés) → limitation par IP/temps.
- **10f — Fuite d'erreur** : `api/instagram.js:238`, `api/test-email.js:80` → messages génériques au client, détails uniquement en logs serveur.
- **10g — CI réelle** : activer `node scripts/ci.js` en pipeline (GitHub Actions racine) sur `master` et sur PR ; y ajouter un lint et un check XSS basique.
- **10h — Docs** : mettre à jour `CHANGELOG.md` (entrées depuis 2025-09) et `README.txt` (version SW, tailles de fichiers, domaine de prod, flux Stripe Elements réel).
- **Vérification** : CI verte en pipeline ; `grep` confirme 1 seule définition de carte produit et 1 seul `apiUrl` ; audit prix inter-pages cohérent.
- **Commit** : `refactor(pt): shared helpers, dedup product card, CI enforcement, docs sync`

---

## Récapitulatif — tableau de suivi

| Étape | Titre | Bloc | Statut |
|------:|-------|------|:------:|
| 1 | Routeur (pages mortes + commandes) | Fonctionnel | ☐ |
| 2 | Intégrité des prix | Argent | ☐ |
| 3 | Verrouillage API (auth, CORS, secret) | Sécurité | ☐ |
| 4 | Failles XSS | Sécurité | ☐ |
| 5 | Cohérence de déploiement | Déploiement | ☐ |
| 6 | Webhook Stripe (raw body + idempotence) | Paiement | ☐ |
| 7 | Bugs Service Worker | Résilience | ☐ |
| 8 | Bugs runtime app.js | Résilience | ☐ |
| 9 | Assainissement CSS/HTML | Structure | ☐ |
| 10 | Qualité structurelle & CI | Structure | ☐ |

**Règle de fin d'étape** : commit dédié + vérification verte + case cochée. Aucune étape n'est
« à moitié faite ». En cas de blocage, on documente et on n'avance pas.
