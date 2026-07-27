# AUDIT D'INTÉGRITÉ, DE SÉCURITÉ ET D'ARCHITECTURE — juillet 2026

> Demande user (27/07/2026) : « repasse tout au peigne fin… la moindre ligne doit
> être vérifiée… intégrité du code, sa qualité de niveau institutionnel, sa
> sécurité ainsi que l'architecture. Établis un plan d'action ultra complet
> avant de commencer. 1=1. »

---

## 0. PÉRIMÈTRE RÉEL (mesuré, pas estimé)

| Fichier / zone | Lignes | Poids |
|---|---:|---:|
| `app.js` (1 IIFE, 423 fonctions, 176 var de haut niveau) | 13 036 | 644 Ko |
| `styles.css` | 8 158 | 244 Ko |
| `api/*.js` (12 fonctions serverless) | 4 456 | — |
| `api/_lib/*.js` (16 modules) | 2 033 | — |
| `index.html` | 2 063 | 140 Ko |
| `sw.js` · `firebase-init.js` · `firestore.rules` · `storage.rules` | 679 | — |
| **TOTAL applicatif** | **≈ 30 400** | — |

Surface d'attaque / de bug mesurée :
- **237** affectations `innerHTML` (vecteur XSS n°1)
- **47** appels `fetch`, **24** types d'endpoint POST
- **22** collections Firestore côté serveur
- **119** `addEventListener` + **87** `.onclick` (fuites / doubles liaisons)
- **52** accès `localStorage` (quota Safari privé)

## 1. MÉTHODE — pourquoi « exhaustif » ne veut pas dire « tout relire à l'œil »

Relire 30 400 lignes à l'œil, une par une, n'est ni faisable ni fiable : l'œil
humain (ou machine) rate ce qu'il a déjà vu dix fois. La méthode retenue est
celle des audits institutionnels — **exhaustivité PAR CONSTRUCTION** :

1. **Pour chaque classe de défaut**, on écrit un **contrôle automatique qui
   parcourt 100 % des lignes concernées**. Le contrôle est versionné dans
   `scripts/`, rejouable, et branché à la CI quand il est stable.
2. **La revue manuelle** est réservée (a) aux zones que les contrôles signalent,
   (b) aux **chemins critiques argent / auth / données personnelles**, relus
   ligne à ligne quoi qu'il arrive.
3. **Aucune conclusion sans preuve exécutée.** Un défaut n'est « trouvé » que si
   on peut le montrer (sortie de script, test qui échoue, capture). Un correctif
   n'est « fait » que si un test le verrouille.

> Conséquence assumée : la couverture est **totale sur les classes de défauts
> traitées**, et je liste explicitement en fin de rapport ce qui n'est PAS
> couvert. Pas de « j'ai tout vérifié » creux.

## 2. ÉCHELLE DE GRAVITÉ

| Niveau | Définition | Traitement |
|---|---|---|
| 🔴 **CRITIQUE** | Perte d'argent, fuite de données, parcours cassé en prod | Correction immédiate + test de non-régression |
| 🟠 **MAJEUR** | Comportement faux dans un cas réel, faille exploitable sous condition | Correction dans la passe |
| 🟡 **MINEUR** | Incohérence, cas limite, message trompeur | Correction si sans risque |
| 🟢 **DETTE** | Qualité / lisibilité / convention, aucun impact utilisateur | Consigné, corrigé si gratuit |

## 3. RÈGLE DE TRAVAIL (non négociable)

**1 passe = 1 thème = 1 lot de correctifs = 1 vérification verte = 1 commit.**
Jamais de correctif non testé. Jamais de passe à moitié faite. À chaque commit :
`node scripts/ci.js` vert + harnais concernés verts.

---

## 4. LES 9 PASSES

### P1 — INTÉGRITÉ STATIQUE (le code fait-il ce qu'il dit ?)
**Contrôles automatiques à écrire** (`scripts/audit/*.js`) :
- `dom-contract` : tout `getElementById('x')` / `querySelector('#x')` de app.js
  a-t-il un `id="x"` dans index.html (ou est-il créé dynamiquement) ? Et
  l'inverse : id HTML jamais référencé = mort ?
- `id-unique` : aucun `id` dupliqué dans index.html (casse silencieusement
  `getElementById`).
- `fn-graph` : fonctions définies / jamais appelées ; fonctions appelées /
  jamais définies (ReferenceError latent).
- `globals` : variables affectées sans `var/let/const` (fuite en global).
- `css-refs` : classes CSS définies / jamais utilisées, et classes utilisées en
  JS/HTML / jamais définies (le défaut C1 `.btn--primary` a déjà coûté).
- `dead-branches` : `data-*` référencés d'un seul côté.

### P2 — SÉCURITÉ CLIENT (XSS et injection)
- Balayage des **237 `innerHTML`** : chaque interpolation `+ variable +` doit
  être soit un littéral, soit un nombre, soit passée par `escapeHTML`.
  Contrôle automatique + revue manuelle de chaque cas signalé.
- Attributs construits (`href`, `src`, `style`, `data-*`) : encodage correct.
- `isSafePartnerImg` / `isSafePartnerLink` : appliqués partout où une donnée
  serveur devient une URL.
- CSP : re-calcul des empreintes, vérification qu'aucune directive n'a été
  élargie inutilement.

### P3 — SÉCURITÉ SERVEUR (authz, validation, abus)
Revue **ligne à ligne** des 24 endpoints. Pour chacun, une grille :
1. méthode HTTP vérifiée ? 2. auth exigée et du bon niveau (public / connecté /
propriétaire / admin) ? 3. **IDOR** : l'objet visé appartient-il bien à
l'appelant ? 4. tous les champs d'entrée validés (type, longueur, liste
blanche) ? 5. rate-limit ? 6. les erreurs ne fuient-elles rien ? 7. aucune PII
dans les logs ?
→ Livrable : tableau de conformité 24 lignes × 7 colonnes, aucune case vide.

### P4 — RÈGLES FIRESTORE & STORAGE (la vraie barrière)
- **Couverture** : chaque collection écrite/lue par le serveur a-t-elle un
  `match` explicite ? (`charges`, `config`, `price_watch_log` sont aujourd'hui
  couvertes par le seul catch-all → à déclarer.)
- Chaque règle `allow` relue et **prouvée par une assertion** dans
  `test-rules.js` (objectif : aucune règle sans test).
- **Requêtes ↔ index** : toute requête client `where`+`orderBy` exige un index
  composite que l'émulateur ne réclame jamais → contrôle automatique dédié
  (`check-firestore-queries.js` à étendre).
- `storage.rules` : mêmes contrôles.

### P5 — ARGENT (intégrité comptable et fiscale)
- Parité **prix client ↔ prix serveur** au centime (déjà `check-pricing.js`, à
  étendre aux nouveaux chemins).
- Machine à états des courses : **énumérer toutes les transitions possibles**
  et vérifier qu'aucune ne permet un état absurde (livrer sans confirmer,
  annuler après paiement, noter sans livraison…). Livrable : diagramme +
  tableau des transitions autorisées, aligné client/serveur.
- Idempotence : webhook, `/merci`, `course-goods-paid`, `createFromIntent`.
- TVA / octroi de mer / territoires : re-vérification des taux contre
  `METHODE-ENTREPRISE-FISCALITE.md`.

### P6 — DONNÉES PERSONNELLES (RGPD)
- Inventaire complet : quelle donnée, où, combien de temps, qui y accède.
- Droit à l'oubli : la suppression de compte efface-t-elle **tout** (courses,
  messages, photos, vidéos, analytics) ?
- Minimisation : la fiche publique livreur ne doit contenir aucune donnée KYC.
- Consentements : traçés et respectés.

### P7 — ARCHITECTURE & QUALITÉ
- Duplications réelles (mêmes 10+ lignes à N endroits).
- Fonctions XXL (> 150 lignes) : liste, risque, découpe si sûre.
- État global d'app.js (176 `var`) : lesquelles sont dépendantes de l'identité
  et doivent tomber à la déconnexion ? (un défaut de ce type a déjà été trouvé)
- Fuites : listeners, observers, `setInterval`, abonnements Firestore, WebGL.
- Cohérence des conventions (nommage, ES5, commentaires).

### P8 — PERFORMANCE & PWA
- Poids réel servi au premier chargement (l'user navigue TOUJOURS en privé →
  aucun cache ne l'aide).
- Service Worker : relecture intégrale (299 lignes), alignement des versions,
  aucun chemin ne peut rendre un corps vide.
- Requêtes réseau au boot : mesure, pas d'estimation.

### P9 — ACCESSIBILITÉ & ROBUSTESSE FRONT
- Contrastes, focus visible, pièges de focus, libellés ARIA.
- Comportement hors ligne / réseau coupé / quota localStorage plein.
- Rendu iPad (viewport réel 1194×834 et 834×1194).

---

## 5. LIVRABLES

1. Ce document, complété au fil des passes avec **chaque défaut trouvé** (avec
   sa preuve) et **son correctif** (avec son test).
2. Les scripts d'audit dans `scripts/audit/`, rejouables à volonté.
3. Les contrôles stables branchés à `scripts/ci.js` — pour que ces défauts ne
   puissent plus jamais revenir.
4. Un commit par passe.

---

# JOURNAL DES PASSES

<!-- rempli au fur et à mesure -->

## PASSE P1 — INTÉGRITÉ STATIQUE ✅ (27/07/2026, SW v499)

**Outil créé : `scripts/audit/p1-static.js`** — analyse de l'arbre syntaxique
(esprima) de app.js + index.html + styles.css. Couverture : **100 % des lignes**
des 3 fichiers pour les 5 classes de défaut ci-dessous. **Branché à `ci.js`** :
toute régression casse désormais le build.

Périmètre mesuré : 344 ids HTML · 198 ids générés en JS · 359 ids lus par le JS ·
422 fonctions · 1 025 classes CSS · 984 classes utilisées.

### Défauts trouvés et corrigés

| # | Gravité | Défaut | Preuve | Correctif |
|---|---|---|---|---|
| P1-1 | 🟠 | **`.product-grid` sans aucune règle CSS** → les 8 produits mis en avant des **5 pages territoire** (`#/guadeloupe`, `#/martinique`, `#/guyane`, `#/reunion`, `#/mayotte`) s'empilaient en pleine largeur au lieu de former une grille | `grep -c '\.product-grid' styles.css` = 0, classe posée sur `#terrViewProducts` (app.js) | Règle §52 alignée sur `.list` (grille du catalogue) → cartes identiques partout |
| P1-2 | 🟡 | **`.btn--ghost` utilisée 29 fois, jamais définie** → 28 boutons d'admin + « Voir les formules » rendus comme l'action PRINCIPALE (dégradé bleu plein) : hiérarchie visuelle écrasée. Même famille que `.btn--primary` (étape C1) | 29 occurrences, 0 règle | Variante implémentée (fond translucide, bordure discrète) |
| P1-3 | 🟡 | **`.btn--glow` utilisée 4 fois, jamais définie** (bouton Acheter, Publier un avis, Payer, Payer crypto) | 4 occurrences, 0 règle | Classe **retirée** (aucun changement visuel). L'effet « glow » n'a jamais existé — à décider avec l'user s'il le veut vraiment |
| P1-4 | 🟡 | **`#wishlistCount`** : le code met à jour un badge de comptage des favoris qui **n'existe dans aucun HTML** → bloc jamais exécutable | id absent de index.html et du HTML généré | Bloc mort retiré |
| P1-5 | 🟡 | **`toast--visible`** ajoutée puis retirée à chaque toast, **0 règle CSS** → la sortie du toast n'a jamais été animée | 0 règle | Manipulation morte retirée (l'entrée reste animée par `@keyframes toast-in`) |
| P1-6 | 🟢 | **3 fonctions déclarées et jamais référencées** : `shadeColor` (11 l.), `animateCounter` (20 l.), `territorySlugFromCode` (7 l.) | graphe d'appels AST | Supprimées (38 lignes) |
| P1-7 | 🟢 | `setupPdpCoffret` supprimait `#pdpCoffretOpt`, **élément qui n'est plus jamais créé** ; paramètre `product` inutilisé | id introuvable | Nettoyée |
| P1-8 | 🟢 | `.pt-loadbar` : `classList.remove('is-done')` alors que **`is-done` n'est ajoutée nulle part** et n'a aucune règle | 1 seule occurrence, en `remove` | Ligne morte retirée |
| P1-9 | 🟢 | `<div class="auth-tabs__indicator">` : div **vide, sans style, sans JS** | 0 CSS, 0 JS | Retirée |
| P1-10 | 🟢 | `.initial` sur le conteneur du logo d'accueil : aucune règle, aucun JS | 0 CSS, 0 JS | Retirée |

### Contrôles PASSÉS (aucun défaut)

- ✅ **Contrat DOM** : les 359 identifiants lus par le JS existent tous.
- ✅ **Unicité** : les 344 ids de index.html sont uniques (un doublon ferait
  silencieusement échouer `getElementById`).
- ✅ **Graphe d'appels** : aucun appel vers une fonction inexistante.
- ✅ **Portée** : **aucune globale implicite** — les 13 000 lignes de app.js
  déclarent toutes leurs variables.
- ✅ **Contrat CSS** : après correctifs, toute classe utilisée a une règle, ou
  figure dans une **allowlist justifiée nommément** (29 entrées, une raison
  vérifiée par entrée). Toute nouvelle classe non justifiée casse la CI.

### Réserve honnête
21 lectures DOM dynamiques (`getElementById(variable)`) ne sont pas vérifiables
statiquement — elles restent hors couverture de ce contrôle.

**Vérifications** : `ci.js` vert · couriers.mjs 76/76 · course-pay.mjs 14/14.

## PASSE P2 — SÉCURITÉ CLIENT : INJECTION HTML (XSS) ✅ (27/07/2026, SW v500)

**Outil créé : `scripts/audit/p2-xss.js`** — analyse AST de **239 points
d'écriture HTML** (`innerHTML`, `outerHTML`, `insertAdjacentHTML`). Pour chacun,
l'arbre de concaténation est décomposé et **chaque morceau dynamique** est
classé : littéral · nombre · `escapeHTML()` · `encodeURIComponent()` · appel à un
constructeur de HTML audité. **Branché à `ci.js`** (partie bloquante).

Résultat brut : **177 / 239 écritures prouvées 100 % sûres** sans intervention.
252 morceaux dynamiques inspectés.

### Défaut trouvé et corrigé

| # | Gravité | Défaut | Preuve | Correctif |
|---|---|---|---|---|
| P2-1 | 🟠 | **9 images injectées dans `src="…"` sans aucun filtre côté client**, alors que le projet applique déjà `isSafePartnerImg` ailleurs — **violation de son propre invariant de défense en profondeur** (le commentaire au-dessus d'`isSafePartnerImg` dit littéralement « on n'injecte JAMAIS une source d'image qui ne soit pas une data-URL inline »). Sites : photo du chantier vue par le livreur, les 3 photos de preuve vues par le client, logo + photos d'artisan (espace self-service **et** admin), 3 aperçus locaux. Une valeur contenant `"` sortirait de l'attribut. | `grep 'src="'\'' +'` : 22 sites, 9 sans garde | Helper unique **`safeImgSrc()`** créé et appliqué aux 9 sites. Contrôle CI **bloquant** : toute nouvelle image non filtrée casse le build. |

### Vérifications ciblées PASSÉES

- ✅ **Texte saisi par un utilisateur** (adresse de chantier, titre de produit,
  nom/bio/commune de livreur, avis clients, messages de chat, nom/métier
  d'artisan) : recherche exhaustive des injections **sans `escapeHTML`** → 3
  résultats, **tous légitimes** après vérification : un message WhatsApp (texte
  brut, pas du HTML), un helper dont l'unique appelant échappe déjà, et un
  passage par une fonction `line()` qui échappe.
- ✅ **Messages du chat** : `escapeHTML(String(m.text))` — le texte de l'autre
  partie ne peut pas s'exécuter.
- ✅ **Avis clients publiés** sur la fiche livreur : `escapeHTML` sur note,
  commentaire et date.
- ✅ **Liens** (`href`) : `escapeHTML` + `encodeURIComponent` sur les uid.

### Réserve honnête
Le contrôle signale encore **67 expressions dynamiques informatives** :
variables accumulatrices (`html`, `h`, `rows`…) que l'analyse statique ne peut
pas suivre jusqu'à leur construction, et champs numériques serveur (`c.zone`,
`c.qty`, `c.km`, `pct`…). Elles ont été **relues une par une** : aucune ne
transporte de texte utilisateur non échappé. Suivre les accumulateurs
exigerait une analyse de flux de données — hors périmètre de cette passe, noté.

## PASSE P3 — SÉCURITÉ SERVEUR ✅ (27/07/2026, SW v501)

⚠️ **CORRECTION DU PLAN** : la surface réelle n'est pas de 24 endpoints mais de
**65 points d'entrée** — 12 fonctions serverless + 24 sous-routes `body.type`
(contact.js) + 29 sous-routes `query.type` (admin.js).

**Outils créés** : `scripts/audit/p3-endpoints.js` (analyse statique, 4 contrôles)
et `scripts/audit/p3-dispatch-live.js` (**test d'exécution réel**). Les deux sont
**branchés à `ci.js`**.

### 🔴 DÉFAUT CRITIQUE TROUVÉ — fonctionnalité morte en production

| # | Gravité | Défaut | Preuve | Correctif |
|---|---|---|---|---|
| P3-1 | 🔴 | **4 endpoints implémentés mais JAMAIS aiguillés** : `course-accord-propose`, `course-accord-accept`, `course-accord-reject`, `course-goods-paid`. `contact.js` aiguille par une liste de `body.type` en tête de fichier ; les gestionnaires ont été ajoutés plus bas **sans mettre la liste à jour**. En production, l'appel retombait dans le **formulaire de contact** : toute la fonctionnalité « accord + paiement de la marchandise » (livrée la veille) **ne s'exécutait jamais**. | Test d'exécution : le défaut réintroduit volontairement fait répondre **`400 « Nom invalide (2–100 caractères) »`** au bouton « Proposer cet accord » | Les 4 types ajoutés à la liste + **deux contrôles CI** qui rendent la classe de défaut impossible |

**Pourquoi aucun test ne l'avait vu** : les harnais Playwright **simulent**
`/api/contact` et renvoient des réponses préfabriquées — ils ne touchent donc
jamais l'aiguillage réel. C'est un angle mort structurel du harnais, désormais
couvert par `p3-dispatch-live.js` qui appelle **la vraie fonction exportée**.
Ce test a été **prouvé capable d'échouer** (défaut réintroduit → 4 rouges,
restauré → 21/21 verts).

### Contrôles PASSÉS

| Contrôle | Résultat |
|---|---|
| **Aiguillage ↔ implémentation** (contact.js, dans les 2 sens) | ✅ 21/21 types atteignent leur gestionnaire (vérifié **à l'exécution**) |
| **Garde admin** : les 29 sous-routes d'admin | ✅ `requireAdmin` en **ligne 20**, avant toute branche métier — point de passage unique, aucune branche ne peut lui échapper |
| **Filtre de méthode HTTP** | ✅ présent sur les 10 fonctions qui en ont besoin |
| **Authentification par fonction** | ✅ 12/12 conformes au niveau attendu (admin / mixte / public / secret cron / signature Stripe) |
| **Limitation de débit sur les écritures publiques** | ✅ contact (5 seaux), newsletter, events, create-payment-intent, checkout |
| **Appartenance des objets (IDOR)** sur les 20 routes de course | ✅ 20/20 — chaque route agissant sur une course vérifie que l'appelant en est partie (`artisanUid`/`courierUid` comparés au uid **du jeton vérifié**, jamais au corps de la requête) |
| **Carte artisan self-service** | ✅ IDOR **impossible par construction** : l'id de la carte est dérivé du uid vérifié (`partners_private where uid == uid`), jamais lu dans la requête |

### Attente corrigée (faux positif écarté, pas le code)
Six fonctions n'appellent pas `applyCors`. Vérification faite dans
`_lib/http.js` : `applyCors` n'émet des en-têtes **que** pour une origine
explicitement autorisée. **Son absence signifie « aucun en-tête CORS », donc
blocage par le navigateur de tout appel cross-origin** — c'est l'état le plus
sûr, pas un défaut. L'attente du contrôle a été corrigée, le code non touché.
Seule réserve 🟢 : si `ALLOWED_ORIGINS` est un jour renseigné, ces 6 fonctions
ne l'honoreront pas — à savoir, sans impact aujourd'hui (tout est same-origin).

**Vérifications** : CI verte · couriers.mjs 76/76 · course-pay.mjs 14/14 ·
émulateur Firestore 78/78.

## PASSE P4 — RÈGLES FIRESTORE, COUVERTURE ET INDEX ✅ (27/07/2026, SW v502)

**Outil créé : `scripts/audit/p4-firestore.js`**, branché à `ci.js`. Trois
contrôles, dont le détecteur d'index composite — celui qui manquait.

### 🟢 Le contrôle le plus important passe : aucun index manquant

**16 requêtes Firestore analysées** (2 navigateur + 14 serveur), classées selon
les règles officielles d'indexation. **Aucune n'exige d'index composite.**
Les deux requêtes multi-clauses sont correctes et l'étaient déjà :
- `payments.where(uid==).where(status==)` → égalités multiples seules :
  Firestore fusionne les index mono-champ, **aucun index composite requis** ;
- `collectionGroup('orders').orderBy('date','desc')` → couvert par le
  `fieldOverride` COLLECTION_GROUP DESCENDING déjà versionné.

**Détecteur prouvé capable d'échouer** : l'`orderBy('at')` fautif réintroduit
→ `⚠️ app.js:5361  round== tri:at` + sortie en erreur ; retiré → vert.
C'est exactement le défaut qui serait parti en production sans être vu, **parce
que l'émulateur crée les index à la volée et ne réclame jamais rien**.

### Défauts trouvés et corrigés

| # | Gravité | Défaut | Correctif |
|---|---|---|---|
| P4-1 | 🟡 | **Vidéos de litige écrasables.** Le nom de fichier était un simple horodatage (`courses/{id}/videos/1753…mp4`), sans l'auteur. `storage.rules` autorisant les DEUX participants à écrire sur ce chemin, un participant pouvait écraser la vidéo de l'autre — **une preuve détruite en silence**, dans le seul module où la preuve est l'enjeu. | Chemin préfixé par l'uid de l'auteur + `storage.rules` exige `fileName.matches('^' + request.auth.uid + '-.*')` → **écrasement impossible par construction**. Coût nul : Storage n'est pas encore déployé. |
| P4-2 | 🟢 | **4 collections sans `match` explicite** (`charges`, `config`, `price_watch_log`, et la sous-collection `courses/{id}/photos`) : protégées par le seul filet final. Sans déclaration, impossible de distinguer « fermé volontairement » de « oublié ». | Déclarées nommément avec leur raison. |
| P4-3 | 🟠 | **9 règles n'étaient prouvées par AUCUN test.** Une règle non testée est une règle dont personne ne sait si elle fait ce qu'elle dit — et c'est la seule barrière entre un navigateur et les données clients. | **20 assertions ajoutées** → `test-rules.js` passe de **78 à 98 assertions**, toutes vertes sur l'émulateur réel. Objectif « aucune règle sans test » **atteint : 27/27**. |

### Revue manuelle de `storage.rules`
Default-deny · écriture réservée aux participants (lecture croisée Firestore) ·
120 Mo max · `video/*` obligatoire · **lecture et suppression interdites au
client** (les vidéos ne sortent que par URL signée admin) · course inexistante
→ `firestore.get` échoue → refus (fail-closed) · après une remise en ligne,
l'ex-livreur perd l'accès. **Conforme**, plus le durcissement P4-1.

**Vérifications** : CI verte · couriers.mjs 76/76 · course-pay.mjs 14/14 ·
**émulateur Firestore 98/98**.

## PASSE P5 — ARGENT : machine à états, idempotence, taux ✅ (27/07/2026, SW v503)

**Outil créé : `scripts/audit/p5-money.js`**, branché à `ci.js`. La machine à
états est désormais **DÉCLARÉE noir sur blanc** dans le script ; le contrôle
extrait du code le statut écrit et la garde de chaque route, et **compare dans
les deux sens**. Une divergence entre l'intention et le code fait échouer la CI.

### La machine à états, écrite et vérifiée

| Route | Depuis | Vers | Déclenché par |
|---|---|---|---|
| `course-request` | (création) | `en_attente` | client |
| `course-accept` | `en_attente` | `acceptee` | livreur (1er arrivé, transaction) |
| `course-goods-paid` | `acceptee` | `confirmee` | client (paiement vérifié chez Stripe) |
| `course-accord-accept` | `acceptee` | `confirmee` | participant — **uniquement si la marchandise est déjà réglée** |
| `course-release` | `acceptee` · `confirmee` | `en_attente` | participant |
| `course-cancel` | `en_attente` · `acceptee` | `annulee` | client |
| `course-deliver` | `confirmee` · `acceptee`+payée | `livree` | livreur (code + 2 photos) |
| `course-confirm` | `livree` | `terminee` | client |

### Défauts trouvés et corrigés

| # | Gravité | Défaut | Correctif |
|---|---|---|---|
| P5-1 | 🟠 | **ÉTAT PIÈGE.** Depuis `confirmee` (marchandise réglée), les seules issues étaient : le livreur livre, ou un litige. **Un client ayant payé et dont le livreur ne se présente jamais n'avait AUCUNE sortie autonome** — son argent était engagé et seul un email à l'exploitant débloquait la situation. | `course-release` autorisé depuis `confirmee`. **`goodsPaid` est conservé** : dès qu'un nouvel accord est validé, la course repasse « confirmée » **sans second paiement** (`course-accord-accept` → `confirmee` si `goodsPaid`). Corollaire : `course-cancel` refuse désormais si la marchandise est payée — annuler devient une décision commerciale (chat ou litige), plus un clic. |
| P5-2 | 🟡 | **`course-goods-paid` n'avait AUCUNE garde de statut** : elle écrivait `confirmee` depuis n'importe quel état. Non exploitable aujourd'hui (la sortie anticipée sur `goodsPaid` bloque le rejeu), mais une route qui touche à l'argent ne doit jamais écrire un statut à l'aveugle. | Garde `status === 'acceptee'` ajoutée, et le contrôle d'idempotence remonté AVANT la vérification de l'accord. |

**Détecteur prouvé capable d'échouer** : le piège réintroduit → `❌ course-release`
+ sortie en erreur ; retiré → vert.

### Contrôles PASSÉS

- ✅ **Accessibilité** : depuis chacun des 4 états non terminaux, il existe au
  moins une sortie **déclenchable par les parties elles-mêmes**. Plus aucun état
  ne dépend d'une intervention humaine de l'exploitant.
- ✅ **Idempotence des 4 chemins d'argent** :
  création de course (id du doc = id du PaymentIntent, `create()` atomique) ·
  événements Stripe (claim de `event.id` avant tout effet) ·
  marchandise réglée (sortie anticipée) ·
  acceptation (transaction, second arrivé refusé).
- ✅ **Taux de TVA conformes** à `METHODE-ENTREPRISE-FISCALITE.md` §2 :
  971/972/974 = 8,5 % · 973/976 = non applicable. Vérifié champ par champ.
- ✅ Les **7 contrôles argent préexistants** (parité des prix client/serveur,
  modèle de marge, fidélité, coffret, comptabilité, facture, claim webhook)
  sont verts.

### Test réaligné, et pourquoi
Une assertion écrite à la passe P3 (« Course confirmée : plus de remise en
ligne ») **verrouillait précisément le piège**. La spécification ayant changé,
le test change avec elle — il vérifie désormais que la sortie existe. Ce n'est
pas un test qu'on assouplit pour faire passer du rouge : c'est une intention
corrigée, donc une assertion corrigée.

**Vérifications** : CI verte · couriers.mjs **80/80** · course-pay.mjs 14/14 ·
émulateur Firestore 98/98.
