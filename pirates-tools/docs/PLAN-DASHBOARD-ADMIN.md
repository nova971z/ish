# Fiche technique — Tableau de bord admin « Analytics maison » (Pirates Tools)

> Document maître de conception. À suivre étape par étape. Règle projet :
> **1 étape = 1 problème = 1 commit = 1 vérification verte.** Aucun hasard.
> Statut : PLAN VALIDÉ ? _(en attente décisions §4)_ — implémentation NON commencée.

---

## 1. Objectif (ce que l'user veut)

Un tableau de bord dans la partie **admin** (`#/admin`), sans dépendance tierce
(pas de GA4), affichant :

1. **Compteur de visiteurs.**
2. **Compteur de clics général.**
3. **Compteur de clics ultra-précis** : sur quoi on clique + combien de fois.
4. **Temps passé par article** : durée + sur quel article.
5. **Globe 3D de la Terre** : provenance géographique des visiteurs.
6. **Cartes client** : pour chaque compte créé, ses infos (nom, email, tél,
   adresse, fidélité, commandes).

Ajouts recommandés (voir §5, justifiés) : **entonnoir de conversion**, **sources
de trafic**, **appareil (mobile/desktop)**, **recherches internes**,
**abandon panier**.

---

## 2. État des lieux du code (constaté, pas supposé)

| Brique existante | Fichier / ligne | Réutilisation |
|---|---|---|
| `track(event, params)` — bus d'événements | `app.js:312` | **Point d'injection n°1** : y brancher l'envoi serveur. Émet déjà 11 events aux bons endroits. |
| Buffer events + `dataLayer` | `app.js:295,318` | Les events sont déjà collectés en mémoire, jamais envoyés. |
| Consentement `pt:analytics-consent` | `app.js:293`, bandeau v321 | Gouverne l'autorisation analytics. Clé déjà en place. |
| Init Firebase Admin partagé | `api/_lib/firebase.js` `getFirebase()` | Écriture serveur (Admin SDK, contourne les règles). |
| Rate-limit Firestore, IP hachée | `api/_lib/ratelimit.js` (`allow`, `clientIp`) | Anti-abus de l'endpoint d'ingestion (public). |
| Auth admin (claim OU secret) | `api/_lib/auth.js` `requireAdmin` | Protège la lecture des stats + cartes client. |
| Pattern endpoint POST public | `api/newsletter.js` | Gabarit de `api/events.js`. |
| CORS deny-par-défaut | `api/_lib/http.js` `applyCors` | Même politique pour les nouveaux endpoints. |
| Admin en onglets + panes | `app.js:5260+` (`renderAdmin`) | Ajouter onglets « Statistiques » et « Clients ». |
| `adminFetch` (auth headers) | `app.js:5225` | Lecture admin authentifiée des stats/clients. |
| three.js lazy | `app.js:1098` `ensureThree` | Globe 3D sans nouvelle lib. |
| Profil client | `firestore.rules:43` `users/{uid}` | Cartes client (données fournies volontairement). |
| Géo requête | En-têtes Vercel `x-vercel-ip-*` | Provenance sans IP stockée ni API tierce. |

**Conclusion :** ~70 % de la matière (captage + socle serveur + auth + 3D) existe.
Le travail = un **sink** (ingestion → agrégats Firestore), une **API de lecture
admin**, et l'**UI dashboard + globe**.

---

## 3. Architecture cible (niveau institutionnel)

### 3.1 Principe directeur : AGRÉGATS, pas de logs bruts
Stocker un document Firestore par clic = coût + lectures admin ingérables.
**On incrémente des compteurs** (`FieldValue.increment`) dans des documents
agrégés. Le dashboard lit **quelques docs**, pas des milliers d'events.

Collections (toutes **server-only** — écriture Admin SDK, lecture via API admin) :

| Collection / doc | Contenu | Clé |
|---|---|---|
| `analytics_daily/{YYYY-MM-DD}` | visiteurs uniques (approx.), pages vues, clics totaux, par appareil, par source | 1 doc/jour |
| `analytics_products/{productId}` | vues, clics, ajouts panier, temps cumulé + n° d'échantillons (→ temps moyen), achats | 1 doc/produit |
| `analytics_clicks/{cibleHash}` | libellé cible + compteur (clic ultra-précis) | 1 doc/cible |
| `analytics_geo/{countryCode}` | pays, compteur, lat/long représentatifs (globe) | 1 doc/pays |
| `analytics_events_recent/{autoId}` | ring-buffer borné (≤500) des events bruts récents (détail/debug), purgé | court |
| `analytics_visitors/{visitorId}` | **consenti uniquement** : 1er/dernier vu (nouveau/récurrent), affinité catégorie/produit (scores) | 1 doc/visiteur consenti, TTL 13 mois |

### 3.2 Flux de données
```
Client (track + beacon)  →  POST /api/events  →  validation + rate-limit + géo
                                              →  incrément agrégats Firestore
Admin (#/admin, onglet Stats/Clients)  →  GET /api/admin?type=stats|clients
                                              →  requireAdmin  →  lecture agrégats
                                              →  rendu compteurs + globe + cartes
```

### 3.3 RGPD / CNIL — contrainte de conception NON négociable
La mesure d'audience **peut être exemptée de consentement** (délib. CNIL) SI :
- **première partie** (nos serveurs, pas de partage tiers) ; ✅ maison
- **pas de suivi cross-site**, pas de pub, finalité = stats agrégées ; ✅
- **IP non conservée** : on dérive pays/ville des en-têtes Vercel **puis on jette
  l'IP** (jamais stockée) ; ✅ (le rate-limit hache déjà l'IP — M2) ;
- **identifiant de session à durée limitée**, pas de ré-identification. → décision §4.

Si on reste dans l'exemption → **pas de bandeau requis** pour ces compteurs, et le
site reste conforme comme aujourd'hui. Sinon → l'envoi est gated par
`pt:analytics-consent` (le mécanisme du bandeau v321 existe déjà).

**Cartes client** = données fournies **volontairement** à l'inscription. Base
légale = relation contractuelle. Elles ne transitent QUE par l'API admin
authentifiée (jamais exposées au public). Droit à l'oubli déjà géré (M4).

### 3.4 Sécurité de l'ingestion (endpoint public)
- Validation **stricte** : allowlist des noms d'events, allowlist des champs,
  bornes de taille, types. Rejet silencieux sinon.
- **Rate-limit** par IP (réutilise `ratelimit.js`), fail-open borné.
- **Honeypot** + rejet des payloads géants. Aucune PII acceptée dans un event.
- Events **non autoritaires** : ne touchent JAMAIS commandes/paiements/prix.
- `analytics_*` fermées au client dans `firestore.rules` (comme `payments/`).

### 3.5 Non-régression
- Émission via `navigator.sendBeacon` (non bloquant, survit à la navigation).
- Tout le dashboard est **lazy** (chargé seulement dans l'onglet admin).
- Le globe 3D est lazy (three déjà autorisé CSP ; `worker/wasm` déjà ok).
- SW : les POST ne sont pas cachés (déjà le cas). CSP `connect-src 'self'` couvre
  `/api/events` (même origine). **Aucune** modification du parcours public.

---

## 4. Décisions ARRÊTÉES (validées avec l'user le 17/07/2026)

1. **Nouveau vs récurrent = OUI, en mode CONSENTI.** On veut distinguer les
   visiteurs nouveaux/récurrents ET bâtir une **affinité produit** par visiteur
   pour proposer des **promotions pertinentes** (sur les produits que la personne
   aime, pas des promos génériques). Ceci nécessite un identifiant persistant →
   **hors exemption CNIL → consentement requis**. On l'obtient de la manière la
   plus pro : le bandeau (déjà Accepter/Refuser, v321) explique clairement que
   ces données servent **uniquement à améliorer l'expérience** et à proposer des
   **offres pertinentes**. → **modèle à 2 niveaux** :
   - **Sans consentement** (exempté CNIL) : comptage **agrégé anonyme** de
     session — visites, géo, clics, temps. Pas d'ID persistant. Le site
     fonctionne comme aujourd'hui, rien à consentir pour cette couche.
   - **Avec consentement** : `visitorId` **persistant** (localStorage, 13 mois
     max CNIL) → nouveau/récurrent + **profil d'affinité** (catégories/produits
     appréciés) → moteur de promotions personnalisées.
2. **Clic ultra-précis** : j'annote le HTML avec des attributs `data-track`
   (choix pro : déclaratif, pas de couplage JS fragile). _(décision déléguée →
   retenue.)_
3. **Rétention = 14 mois puis purge auto** + **RAPPORT MENSUEL PAR MAIL** à
   l'owner (Resend, déjà configuré). ✅ **Ton instinct est correct** : garder des
   millions d'events bruts dans Firestore coûte cher et ralentit les lectures ;
   les **agrégats** restent légers, et un **export mensuel envoyé par mail**
   t'archive l'historique complet **hors du site**. Le mail contient un **résumé
   lisible + une pièce jointe JSON structurée** (analysable) — format pensé pour
   que tu le déposes dans un **projet Claude** et qu'on l'analyse au niveau
   institutionnel. Puis les données > 14 mois sont purgées côté site.

### 4bis. Moteur de promotions personnalisées (nouveau — suite décision 1)
- Par `visitorId` consenti : compteurs d'affinité `catégorie → score`,
  `produit → score` (vue = +1, clic = +2, ajout panier = +5, achat = +10 —
  pondération type « institutionnel », ajustable).
- L'admin voit, par segment, les produits/catégories les plus aimés → cible ses
  promos dessus. (Sous-fonction future possible : afficher au visiteur consenti
  des offres sur SES produits favoris — hors périmètre initial, noté.)
- RGPD : profil lié à un ID pseudonyme, effaçable (droit à l'oubli), finalité
  déclarée (amélioration UX + offres pertinentes), **jamais** de revente/partage.

---

## 5. Ajouts recommandés (non demandés — pourquoi, en une ligne)

- **Entonnoir de conversion** (visite → vue produit → panier → devis → achat) :
  LA métrique reine e-commerce, montre **où** les gens décrochent.
- **Sources de trafic** (referrer : Google / Instagram / direct) : dit quel
  canal marketing rapporte, sans tracer l'individu.
- **Appareil mobile/desktop** : ton audience DOM-TOM est mobile → priorise les
  optimisations.
- **Recherches internes** (ce que les gens tapent) : révèle la demande et les
  produits manquants à référencer.
- **Abandon panier** (ajouté mais jamais commandé) : signal prix/friction.

---

## 6. Plan d'implantation — 5 étapes (1 étape = 1 commit = vérif verte)

### Étape 1 — Socle serveur : ingestion + agrégats + règles (sans UI)
- `api/events.js` : POST public, validation stricte (allowlist events/champs,
  bornes), honeypot, rate-limit IP, géo via en-têtes Vercel (IP jetée),
  incréments `analytics_daily/products/clicks/geo` + ring-buffer borné.
- `firestore.rules` : `analytics_*` → `allow read, write: if false` (server-only).
- **Vérif** : tests unitaires (validation rejette event inconnu / PII / payload
  géant ; incréments corrects) + émulateur (client ne lit/écrit pas `analytics_*`).
- **MÉMO** : ne stocke JAMAIS l'IP ; agrégats only ; endpoint idempotent-tolérant.

### Étape 2 — Émetteur client (beacon) branché sur `track()`
- Étendre `track()` : après le buffer, `sendBeacon('/api/events', payload)`
  (gated consentement seulement si on sort de l'exemption CNIL — cf §4).
- `visitorId` de session (§4 décision A) — anonyme, non-PII.
- Temps par article : chrono `view_item` → `pagehide`/`visibilitychange`, envoi
  `time_on_item {productId, ms}` via beacon.
- Délégation clic globale : capture `data-track` (clic général + précis).
- **Vérif** : Playwright — events partent (intercept `/api/events`), payload
  **sans PII**, 0 erreur, parcours public intact.
- **MÉMO** : sendBeacon = non bloquant ; pas de `await` dans le chemin critique ;
  ne jamais mettre email/nom dans un event.

### Étape 3 — API lecture admin (stats + clients)
- `api/admin.js` : `type=stats` (agrégats : visiteurs, clics, top produits,
  temps moyen/produit, géo, entonnoir) et `type=clients` (cartes depuis `users/`
  + compteur commandes). Derrière `requireAdmin`. Pagination clients.
- **Vérif** : 401 sans auth ; formes de réponse ; pas de fuite hors admin.
- **MÉMO** : réutiliser `requireAdmin` ; jamais exposer ces routes au public ;
  limiter les champs renvoyés.

### Étape 4 — Dashboard UI (compteurs, clic précis, temps, cartes client)
- Onglets admin **« Statistiques »** + **« Clients »**. Compteurs animés,
  tableau clic-précis trié, temps moyen par article, cartes client responsive
  (thème `--accent`). États vide/chargement/erreur soignés.
- **Vérif** : Playwright — onglets rendent, données réelles affichées, a11y
  (focus/labels), **régression admin existant = 0**.
- **MÉMO** : réutiliser `adminFetch`/`adminAuthHeaders` ; pas de refactor des
  panes existantes ; XSS = tout en `textContent`/`escapeHTML`.

### Étape 5 — Globe 3D + finitions
- Globe three.js **lazy** dans l'onglet Stats : sphère + points par pays
  (`analytics_geo` lat/long), légende, top pays. Dégradé propre si WebGL absent.
- **Vérif** : CSP 0 violation (three déjà autorisé), perf (lazy, 1 contexte),
  régression complète, bump SW + `?v=`, merge master.
- **MÉMO** : réutiliser `ensureThree` ; `.catch` sur chargement ; détruire la
  scène à la sortie d'onglet (pas de fuite) ; globe = confort, jamais bloquant.

### Étape 6 — Rapport mensuel par mail + purge auto (Vercel Cron)
- `api/cron-report.js` : protégé (secret cron), déclenché par **Vercel Cron**
  (mensuel). Compile les agrégats → **mail Resend** à `OWNER_EMAIL` : résumé
  lisible + **pièce jointe JSON structurée** (analysable dans un projet Claude).
  Puis **purge** `analytics_daily`/`events_recent` > 14 mois et
  `analytics_visitors` inactifs > 13 mois.
- **Vérif** : exécution simulée (mail formé, JSON valide, purge ne touche que le
  périmètre daté) ; le cron exige le secret ; 0 PII d'un visiteur anonyme dans
  le rapport (agrégats + clients consentis only).
- **MÉMO** : format JSON = clé de l'analyse ultérieure → schéma stable et
  documenté ; `vercel.json` → section `crons` ; idempotent (rejouable sans
  double compte).

---

## 7. Mémos transverses (à relire avant chaque étape)
- **Cache-busting** : bump `sw.js` VERSION + ASSET_VER + `?v=` index.html à
  chaque changement d'asset.
- **CI** : `node scripts/ci.js` vert après chaque étape (dont `check-csp.js`).
- **Rules** : toute nouvelle collection → règle explicite + test émulateur (le
  catch-all `if false` la ferme déjà, mais on documente l'intention).
- **Merge** : après vérif verte, **merger master** (Vercel ne déploie que master).
- **Zéro régression paiement/sécurité** : l'analytics ne touche jamais argent,
  prix, commandes, auth. Couche strictement additive.
- **Déploiement règles** : rappel — les règles ne prennent effet qu'une fois
  `firebase deploy --only firestore:rules` fait (action user en attente).
