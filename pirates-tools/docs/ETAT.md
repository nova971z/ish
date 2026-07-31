# ÉTAT VIVANT — ce qui reste à faire

**Mis à jour le 31/07/2026.** Ce fichier ne contient ni règle, ni récit, ni
décision : uniquement des **choses à faire**, chacune avec sa **preuve
vérifiable**.

> ⚠️ **Un « à faire » déjà fait est pire qu'une absence de liste** : il fait
> refaire le travail. C'est arrivé — sur les 11 tâches ouvertes héritées de
> `CLAUDE.md`, **3 étaient déjà livrées ou caduques**, vérifié par commande le
> 29/07. Toute entrée sans preuve exécutable est marquée **NON VÉRIFIÉ**.

---

## 🔴 BLOQUANT — légal (illégal de vendre en B2C sans)

| # | À faire | Preuve que ce n'est pas fait |
|---|---|---|
| L1 | Remplir les `[À COMPLÉTER]` des mentions légales, de la confidentialité et des CGV (raison sociale, statut, SIRET, RCS, adresse, TVA, capital, directeur de publication) | `grep -c 'À COMPLÉTER' index.html` → **23** |
| L2 | Adhérer à un **médiateur de la consommation** agréé (CM2C, Medicys… ~50-100 €/an) et porter ses coordonnées dans les mentions **et** les CGV | `grep -ci 'CM2C\|Medicys\|CNPM' index.html` → **0** ; les mentions portent `Médiateur désigné : [À COMPLÉTER]` |
| L3 | Faire relire les trois documents légaux par un juriste | — *(hors code)* |
| L4 | Reporter `contact@pirates-tools.com` dans les champs `[À COMPLÉTER]` | inclus dans L1 |

> ⚠️ **Piège de vérification, rencontré en écrivant ce fichier.** J'avais noté
> « aucune mention de médiateur » ; `grep` en trouve **trois**. Ce sont des
> renvois (« voir Mentions légales »), pas des coordonnées : la structure du
> texte existe, le médiateur **n'est pas désigné**. Chercher le mot-clé du
> sujet ne prouve rien — il faut chercher **ce qui manque**, ici le nom d'un
> organisme agréé.

## 🔴 BLOQUANT — encaissement par carte

> ⚠️ **Réécrit le 31/07/2026 : l'encaisseur a changé.** D-016 remplace Stripe
> par Revolut (fonds sous 24 h contre 3 à 7 jours ouvrés, commissions plus
> basses). Les entrées P1–P3 ci-dessous ne sont **pas supprimées** : Stripe
> reste branché derrière la couture pendant toute la transition, et c'est
> exactement ce qui permet de revenir en arrière sans redéployer dans
> l'urgence. Elles sont **suspendues**, pas caduques.

### Chemin Revolut — c'est LUI qui bloque aujourd'hui

| # | À faire | Preuve que ce n'est pas fait |
|---|---|---|
| R-a | Cliquer **🔌 Diagnostic paiement → enregistrer le webhook** dans l'admin, puis poser le secret rendu sur Vercel sous `REVOLUT_WEBHOOK_SECRET_SANDBOX`, et **redéployer** | `revolut-ping` répond, mais aucun webhook n'est enregistré côté Revolut |
| R-b | Refaire un paiement de test **après** R-a, et vérifier que `payments/` porte l'écriture, qu'une facture est numérotée et que les e-mails partent | aujourd'hui le paiement réussit chez Revolut et **rien** n'arrive côté site : c'est précisément ce que R-a débloque |
| R-c | Basculer `PAYMENT_PROVIDER=revolut` sur Vercel, garder Stripe branché au moins une semaine | la variable vaut encore `stripe` (défaut du contrat) |
| R-d | Passer `REVOLUT_MODE` en `prod` et poser la clé de production, **après** R-b vert | les trois diagnostics refusent en mode `prod` — par construction |

> ⛔ **R-a n'est pas une formalité.** Sans webhook, un paiement réussi ne
> produit **ni commande, ni facture, ni e-mail** : l'argent arrive, le client
> attend, et rien n'alerte. C'est le trou le plus large qui reste.
> Filet en attendant : **🧷 Contrôle des paiements encaissés**, dans le panneau
> comptabilité — il compare ce que Revolut a encaissé à ce que le site a
> enregistré (`node scripts/check-reconciliation.js` : **29 assertions**).

### Chemin Stripe — SUSPENDU (D-016), conservé pour le retour arrière

| # | À faire | Preuve |
|---|---|---|
| P1 | Activer le compte Stripe (informations d'entreprise + RIB) pour encaisser en **LIVE** | `index.html` porte `pk_test_…` |
| P2 | Créer le webhook Stripe vers `https://pirates-tools.com/api/webhook` et poser le `whsec_…` sur Vercel comme `STRIPE_WEBHOOK_SECRET` | absent des variables Vercel |
| P3 | Repasser en clés **LIVE** : `pk_live_` dans `index.html`, `sk_live_` sur Vercel, **puis recalculer l'empreinte CSP** | voir D-013 et `.claude/rules/front.md` |

> ⚠️ **P3 est un piège à site mort.** La clé publique vit dans un script inline
> autorisé par empreinte `sha256`. La changer sans exécuter
> `node scripts/check-csp.js` et reporter le nouveau hash dans `vercel.json`
> fait **bloquer le script par la CSP** : plus aucun `PT_STRIPE_PK`, site cassé.

## 🟠 Variables d'environnement Vercel manquantes

| # | Variable | Conséquence de l'absence |
|---|---|---|
| V2 | `STRIPE_WEBHOOK_SECRET` | voir P2 |
| V3 | `TWILIO_ACCOUNT_SID` / `AUTH_TOKEN` / `FROM` | **facultatif** — `sendSms()` reste totalement inerte sans elles (vérifié : zéro appel réseau) |

## 🟠 Avant d'ouvrir le canal crypto *(désactivé aujourd'hui — D non renversée)*

| # | À faire | Preuve |
|---|---|---|
| C1 | Scanner le QR crypto local avec un vrai portefeuille et confirmer l'adresse affichée | `PT_CRYPTO_ENABLED = false` dans `app.js` |

## 🟠 Actions de console qui attendent l'user

| # | À faire | Preuve |
|---|---|---|
| A1 | Activer **Storage** (console Firebase → Build → Storage) puis `npx firebase deploy --only storage` | sans ça l'envoi de vidéo échoue proprement, le reste fonctionne |
| ~~A3~~ | ~~Politique **TTL** Firestore sur `rate_limits.expiresAt`~~ | ⛔ **BLOQUÉ — exige la facturation, voir ci-dessous** |

> ⛔ **A3 — TENTÉ ET REFUSÉ le 29/07/2026.** Message exact de Google Cloud :
> `403: Project pirates-tools has billing disabled. Please enable it.`
> Les règles TTL **exigent le plan Blaze** (carte bancaire liée), même si la
> facture reste à 0 €. Décision : **on ne lie pas de carte pour ça** — c'est une
> optimisation de coût à long terme, pas une protection. `rate_limits` restera
> minuscule pendant des mois. À reprendre le jour où Blaze sera activé pour
> Storage (A1), et pas avant.
>
> ⚠️ **Piège de méthode payé ce jour-là** : le formulaire acceptait la saisie
> sans broncher, et j'en avais conclu que c'était autorisé. Google ne vérifie
> qu'à l'ENVOI. **Un écran qui ne proteste pas ne prouve rien.**

## 🟢 Mise en production

| # | À faire | Preuve |
|---|---|---|
| M1 | Vérifier que `pirates-tools.com/api/health?test` renvoie du JSON | à faire depuis un navigateur |

---

## ✅ Déjà fait — NE PAS REFAIRE

Chacune de ces lignes figurait encore comme « à faire » dans `CLAUDE.md`.
**Vérifié par commande le 29/07/2026.**

| Ce qui était listé | Preuve que c'est fait |
|---|---|
| Auth admin par TOTP (Google Authenticator) | `mfa.js` (16 662 o, 8 appels TOTP) + `scripts/mfa-unlock.js` |
| Tableau de bord admin — statistiques de visite | `api/events.js`, `api/_lib/analytics.js`, `api/cron-report.js`, `admin?type=stats` |
| Merger `claude/pirates-tools-rebuild-zWc1b` → `master` | **caduc** : on travaille directement sur `master` (D-010), la branche n'existe plus |
| Règles Firestore déployées | déployées par l'user le 25/07, confirmé par capture |
| Protection contre l'énumération d'adresses e-mail | activée, vérifiée sur capture le 25/07 |
| Infrastructure e-mail (Resend + domaine vérifié + routage Cloudflare) | testée de bout en bout le 25/07 |
| Identity Platform + MFA TOTP activés | `mfa.state = ENABLED` **et** `totpProviderConfig.state = ENABLED`, relus par API |
| Domaine et proxy réparés | D-013, mesuré le 29/07 |
| **A4 — DMARC posé** | `dig TXT _dmarc.pirates-tools.com` → `v=DMARC1; p=none; rua=mailto:contact@…` — et SPF + DKIM Resend + DKIM Cloudflare répondent, donc la politique s'appuie sur du réel |
| **V1 — `CRON_SECRET` posé et redéployé** | `/api/cron-report` sans jeton → `{"ok":false,"error":"Invalid admin credentials"}`. Le verrou est actif. |
| **A2 — 2FA activée sur le compte admin** | `mfa-unlock.js --check` → `facteurs: 1 · Application d'authentification — type totp — inscrit le 29 Jul 2026 10:20:47`. Et la **porte de sortie** est opérationnelle depuis Cloud Shell, essayée AVANT de poser le verrou. |
| **A5 — claim admin posé, `ADMIN_SECRET` retiré** | Onglet fermé (mémoire de session vide → mot de passe admin envoyé VIDE, donc rejeté par le serveur), reconnexion, administration ouverte **sans aucun secret**. Seule la voie du claim pouvait passer. Puis `ADMIN_SECRET` retiré de Vercel : l'accès fonctionne toujours. |

---

## 🟠 Contrepartie de D-014 — à faire

| # | À faire | Gain mesuré |
|---|---|---|
| **D1a** | **PRÉALABLE** — un harnais qui exerce les ÉTATS de l'administration (drapeaux de chargement paresseux, libération du globe), pas seulement son affichage | sans lui, l'extraction se ferait à l'aveugle sur son vrai mode de panne |
| **D1b** | Puis sortir les **48 fonctions** d'administration dans un module chargé à la demande | **23,4 Ko compressés** — analyse complète : `docs/D1-EXTRACTION-ADMIN.md` |

> ⛔ **D1 SUSPENDU le 29/07/2026, après analyse syntaxique complète.**
> 48 fonctions, 130 Ko bruts, **45 liaisons** à recréer — dont **7 variables
> mutables écrites des DEUX côtés** (`_adminStatsLoaded`, `_adminGlobe`,
> `_regionNames`…). Passées par valeur, une écriture du module n'atteindrait
> jamais `app.js` : onglets bloqués sur « Chargement… », globe 3D jamais libéré.
> **Ces pannes sont silencieuses** — les 10 harnais qui ouvrent l'administration
> vérifient le rendu et les erreurs JS, ils ne verraient rien.
> Un filet qui ne couvre pas le mode de panne du chantier n'est pas un filet :
> on pose D1a d'abord.

## ⚪️ Dette technique reportée — non bloquante, décidée

| Sujet | Motif du report |
|---|---|
| Purge des `!important` (71) | chaque retrait change la cascade → test visuel requis, gain nul |
| Découpe des fonctions XXL | 17 fonctions, dette **gelée** et surveillée par `p7-architecture` |
| Dédoublonnage CSS après la fusion des blocs inline | sans urgence, aucun effet visible |
