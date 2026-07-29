# ÉTAT VIVANT — ce qui reste à faire

**Mis à jour le 29/07/2026.** Ce fichier ne contient ni règle, ni récit, ni
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
| V1 | `CRON_SECRET` | le rapport mensuel refuse (401) et n'envoie rien |
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
| A2 | Activer la 2FA sur le compte **admin** (Mon compte → 🔐), après avoir vérifié son adresse e-mail | `scripts/mfa-unlock.js --check <email>` |
| A3 | Poser une politique **TTL** Firestore sur `rate_limits.expiresAt` | sinon la collection grossit indéfiniment |
| A4 | Poser un enregistrement **DMARC** chez Cloudflare | recommandé par Cloudflare, protège la délivrabilité |
| A5 | `node scripts/set-admin-claim.js <email>`, se reconnecter, vérifier l'accès admin **sans** secret, puis **supprimer `ADMIN_SECRET`** de Vercel | l'authentification par claim existe déjà (H6) |

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

---

## ⚪️ Dette technique reportée — non bloquante, décidée

| Sujet | Motif du report |
|---|---|
| Purge des `!important` (71) | chaque retrait change la cascade → test visuel requis, gain nul |
| Découpe des fonctions XXL | 17 fonctions, dette **gelée** et surveillée par `p7-architecture` |
| Dédoublonnage CSS après la fusion des blocs inline | sans urgence, aucun effet visible |
