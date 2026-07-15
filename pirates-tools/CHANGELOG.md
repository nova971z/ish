# Changelog - Réparation et Harmonisation du Script Web

## Version 2.1.0 (2026-07-15) — Plan de remédiation (10 étapes)

Refonte qualité « niveau institutionnel », ordre : argent → sécurité → fonctionnel → structure.
Suivi détaillé : `docs/PLAN-REMEDIATION.md`.

### 🔴 Argent & sécurité
*   **Intégrité des prix** : le serveur recalcule chaque montant depuis le catalogue (`api/_lib/pricing.js`) ; le prix envoyé par le client est ignoré (fin du « payer 1 centime »). Prix affiché == prix débité (arrondi identique client/serveur, garde-fou CI `check-pricing.js`).
*   **API verrouillée** : `orders.js` passé en admin-only ; secret admin comparé en temps constant (`crypto.timingSafeEqual`) ; CORS refusé par défaut + allowlist `ALLOWED_ORIGINS`.
*   **XSS** : `escapeHTML` échappe les 5 caractères OWASP (dont les guillemets) → fin de l'injection d'attribut systémique.
*   **Webhook Stripe** : corps brut vérifié (signature) + idempotence sur `event.id` (fin des emails en double).
*   **Fuite de clé** : suppression du chemin NOWPayments côté client (clé de compte exposée).

### 🐛 Fonctionnel & résilience
*   **Routeur** : `/admin`, `/merci`, `/contact`, `/favoris` déclarées → l'admin fonctionne et les commandes payées sont enregistrées.
*   **Bugs runtime** : crash à l'envoi d'avis (`starBtns`), gardes `localStorage` (Safari privé), `confirmPayment` avec `.catch`, fuites d'écouteurs PDP, garde d'auth (`_authReady`).
*   **Service Worker** : empoisonnement du cache corrigé, fallback hors-ligne réparé, cycle de vie propre (v297).

### 🏗️ Structure
*   **Déploiement** : Vercel = production unique, domaine `pirates-tools.com` ; canonical/OG/sitemap alignés ; CI (`scripts/ci.js`) exécutée sur chaque push/PR.
*   **Helpers serverless partagés** : `_lib/{pricing,catalog,auth,http,firebase,ratelimit}.js` (init Firebase unique, prix, auth, CORS, rate-limit).
*   **Divers** : rate limiting IP sur contact/newsletter, helper client `apiBaseUrl()`, correction dérive de prix favoris/récents, CSS mort retiré (315 l.), lumière dorée du hero restaurée, `<h1>` d'accueil.

## Version 2.0.1 (2025-09-29)

### 🐛 Corrections de Bugs

*   **Correction des Erreurs de Syntaxe JavaScript :**
    *   Correction des guillemets typographiques (`’` et `”`) par des guillemets standards (`'` et `"`) dans `app.js` pour éviter les erreurs de parsing.
    *   Correction de la logique de la fonction `escapeHtml` qui n'échappait pas correctement les caractères HTML.
*   **Correction de l'Animation du Logo :**
    *   Correction du `z-index` et du positionnement du logo principal pour qu'il s'affiche correctement au-dessus des autres éléments.
    *   Correction de la transition de l'animation pour la rendre plus fluide.
    *   Suppression du logo d'arrière-plan qui s'affichait sur toutes les pages.
*   **Correction de l'Espacement :**
    *   Réduction de l'espacement excessif sous le logo en ajustant la variable `--listGap` et en supprimant les marges inutiles.
*   **Correction de la Navigation :**
    *   Ajout d'un `window.scrollTo(0, 0)` au début des fonctions de navigation pour que chaque nouvelle vue s'affiche en haut de la page.

### 🔄 Améliorations

*   **Réparation du Système de Panier :**
    *   Unification de la logique de persistance pour n'utiliser qu'une seule clé `localStorage` (`pt_cart`) et ainsi éliminer les incohérences.
    *   Réparation du bouton "Ajouter au panier" sur la fiche produit, qui était non fonctionnel à cause d'une logique de contournement trop complexe.
    *   Suppression des fonctions de débogage inutiles.

### ✅ Validation

*   **Validation HTML :** La structure sémantique a été vérifiée et est conforme aux standards HTML5.
*   **Validation CSS :** Les styles ont été corrigés et s'appliquent correctement.
*   **Test JavaScript :** Les erreurs de syntaxe ont été corrigées et les fonctionnalités sont de nouveau opérationnelles.
*   **Test d’Intégration :** Les trois fichiers (HTML, CSS, JS) fonctionnent maintenant de manière cohérente et sans erreurs dans la console.