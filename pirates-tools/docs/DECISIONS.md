# REGISTRE DES DÉCISIONS — Pirates Tools

> **Une décision acceptée n'est JAMAIS réécrite.** Si un choix en annule un
> autre, l'ancien passe en `REMPLACÉE PAR D-0NN` et les deux restent liés.
> On garde l'histoire **et** on sait laquelle fait foi.
>
> Pourquoi cette rigueur : deux consignes qui se contredisent dans la mémoire
> projet font que j'en applique **une au hasard**. Ce n'est pas une question de
> propreté, c'est une question de fiabilité.

**Format** : une décision = qui a tranché, quand, pourquoi, et où c'est vérifiable.
Une décision **sans motif** sera reproposée dans trois semaines.

---

## D-001 — Plafond de 400 Ko sur le total du texte servi à froid

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** |
| **Date** | 28/07/2026 |
| **Décidé par** | l'user — « il ne faut pas dépasser un plafond de 400 Ko je pense » |
| **Mesure au moment de la décision** | **367,8 Ko** · marge **32,2 Ko** |

**Motif.** Un plafond *par fichier* se contourne tout seul : découper `app.js`
en cinq fichiers ferait passer les cinq au vert **sans qu'un seul octet ne
disparaisse**. Le visiteur, lui, télécharge le total. C'est donc le seul chiffre
qui le concerne réellement.

**Ce qui est compté** : `index.html`, `styles.css`, `app.js`, `firebase-init.js`,
`products.json`, `sw.js` — tout ce qu'un visiteur reçoit avant de voir la boutique.

**Où c'est exécuté** : `scripts/audit/p8-perf.js`, contrôle **P8.4**, dans `ci.js`.
**Prouvé faillible** : en ajoutant 60 Ko à `app.js`, la CI affiche
`❌ total 426,8 Ko (plafond 400, marge −26,8)`.

**Comment le franchir légitimement** : différer du code (chargement à la
demande, comme `mfa.js`), retirer du poids, ou **relever le plafond par une
nouvelle décision tracée ici**. Jamais par une dérive silencieuse.

---

## D-002 — Aucune image servie ne dépasse 871 Ko

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** |
| **Date** | 28/07/2026 |
| **Décidé par** | l'user — « on ne dépasse pas le plus gros héros qui fait 871 Ko » |
| **Mesure au moment de la décision** | 346 images servies · la plus lourde : **870,5 Ko** (`images/posters/dhs680zj-hero.webp`) |

**Motif.** Les images ne sont surveillées par **rien** aujourd'hui, alors que
le plus gros héros pèse **plus du double de tout le code du site**. Le plafond
est calé sur l'existant : c'est un **cliquet** — on a le droit de faire plus
léger, jamais plus lourd.

### ⛔ CE QUE CETTE DÉCISION N'AUTORISE PAS
**Elle n'autorise PAS à recompresser les visuels.** L'user exige des images de
très haute qualité, contrairement aux sites d'outillage concurrents dont les
photos sont médiocres à force de compression. **La qualité n'est jamais la
variable d'ajustement.**

Le levier est ailleurs : **servir la bonne taille au bon endroit**. Une vignette
de 155 pixels n'a aucun besoin du fichier de 871 Ko — ce n'est pas une question
de qualité, c'est qu'on envoie une affiche pour remplir un timbre-poste. Le
fichier de la fiche produit, lui, reste **intact**.

**Où c'est exécuté** : `scripts/audit/p8-perf.js`, contrôle **P8.5**, dans `ci.js`.
**Prouvé faillible** : une image de 900 Ko dans `images/posters/` fait rougir la
CI et nomme le fichier.

⚠️ **Ne porte que sur les images RÉELLEMENT DÉPLOYÉES.** `images/_originals/`
contient des sauvegardes haute résolution (jusqu'à 1 352 Ko) exclues par
`.vercelignore` : aucun visiteur ne les reçoit. Les compter ferait crier le
contrôle sur des fichiers qui ne coûtent rien. **Vérifié par sabotage** : une
image de 2 Mo déposée dans `_originals/` est correctement ignorée.

---

## D-003 — Pas de repères de zone dans le code livré

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** |
| **Date** | 28/07/2026 |
| **Décidé par** | l'assistant, sur délégation explicite de l'user (« je ne sais pas ce que c'est, tranche et choisis la solution la plus institutionnelle ») |

**De quoi il s'agissait.** Le plan fondations prévoyait de poser ~150
commentaires-repères dans `app.js` (`// ══ @zone PAY-03 — Règlement de la
marchandise ══`) pour qu'une commande puisse répondre « la zone PAY-03 est
à telle ligne ».

### La décision : NON. Et ce n'est pas un compromis, c'est strictement mieux.

**1. La mesure tranche seule.**

| | repère tous les… | coût livré au visiteur |
|---|---|---|
| repères de zone (~150) | **97 lignes** | **+1,36 Ko, à chaque visite** |
| noms de fonction (**434 déjà présents**) | **34 lignes** | **0 Ko** |

Les repères de zone seraient **trois fois plus grossiers ET payants**. Le code
porte déjà, gratuitement, une granularité meilleure que celle qu'on voulait
ajouter.

**2. Le principe institutionnel.** L'outillage de développement ne se paie pas
sur la bande passante du visiteur. Ces 1,36 Ko seraient téléchargés,
décompressés et analysés par **chaque client, à chaque visite, pour toujours**,
au bénéfice exclusif du confort de l'assistant. Sur ce site il n'y a **aucune
étape de fabrication** (la minification a été écartée, à raison) : la source
**est** ce qui est servi. La discipline doit donc être à l'écriture — *rien
n'entre dans `app.js` qui ne serve au visiteur*.

**3. Ça supprime le seul vrai risque du chantier.** Poser les repères était la
**seule** étape qui touchait au code de production, donc la seule qui exigeait
un bump du Service Worker — le geste qui a produit l'**écran noir v314** et le
**mélange stale/frais v374**. En refusant les repères, ce risque disparaît
entièrement.

**4. Ça débloque la suite.** La phase 5 du plan fondations était **bloquée** par
une dépendance dure : « la phase 3 doit d'abord libérer 2 Ko sur `app.js` ».
Cette dépendance n'existe plus.

### Conséquences concrètes
- L'entonnoir reste à **granularité fonction** (`scripts/ou.js`, entonnoir v1),
  et il n'y aura pas de « v2 à zones ».
- La phase 5 du plan fondations perd sa condition d'entrée et son bump SW.
- Le contrôle **E3** (« aucune ligne hors zone ») devient « aucune ligne hors
  fonction », naturellement vrai dans un fichier bâti sur un IIFE unique.

### Ce qu'on perd, honnêtement
Un nom de zone aurait pu porter une **intention métier** qu'un nom de fonction
ne porte pas toujours (`lvPanelPay` dit moins que « règlement de la marchandise
par le client »). → Cette intention vit dans **`docs/INDEX.md`**, la table des
intentions de l'entonnoir : elle relie « je veux faire X » aux fonctions
concernées. Elle est **hors du code livré**, donc gratuite pour le visiteur, et
elle peut être aussi bavarde qu'on veut.

---

## ⏳ Décisions en attente
*(aucune à ce jour — D-001, D-002 et D-003 étaient les trois en suspens du
28/07, toutes tranchées.)*

---

## D-004 — Les promotions sont prises en compte, si le traqueur couvre le produit

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** — **REMPLACE D-004a** |
| **Date** | 24/07/2026 |
| **Décidé par** | l'user |

**Motif.** Le traqueur relève **le prix affiché, promo comprise**. La marge de
15 % reste donc calée sur le **coût réel du jour** : si le fournisseur solde,
l'user achète soldé aussi. Le prix se réajuste seul quand la promo finit.

**D-004a — RENVERSÉE** : « les promotions sont ignorées ». Elle valait pour la
saisie **manuelle** d'un prix figé, où une promo aurait gravé un coût faux.
⛔ Ne jamais la repromouvoir sur un produit couvert par le traqueur.
**Reste vrai dans les deux cas** : un « prix conseillé » ou un MSRP gonflé
n'est jamais un prix source.

---

## D-005 — Bandeau cookies : choix réel entre Accepter et Refuser

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** — **REMPLACE D-005a et D-005b** |
| **Date** | 16/07/2026 |
| **Décidé par** | l'user — « pas de choix = pas respectable » |

**Motif.** Cookies techniques toujours actifs et annoncés dans le texte ; choix
réel sur la mesure d'audience, **Refuser aussi accessible qu'Accepter** (CNIL).
Le choix est enregistré dans `pt:analytics-consent`, la clé qui gouvernera un
éventuel traceur : refuser vaut pour toujours, même après activation.

**D-005a — RENVERSÉE** : « bandeau masqué tant qu'aucun traceur n'est
configuré » (conforme ePrivacy, mais l'user le veut visible).
**D-005b — RENVERSÉE** : bandeau d'information avec un seul bouton
« J'ai compris ».

---

## D-006 — Aucune fiche de course ne s'ouvre d'elle-même : un signet la porte

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** — **REMPLACE D-006a** |
| **Date** | 28/07/2026 |
| **Décidé par** | l'user — « pas besoin qu'elle soit ouverte, il est censé y avoir le petit signet en cours, orange effet néon » |

**Motif.** La course en cours vit **hors** de l'historique replié, portée par un
signet cliquable à liseré orange. C'est lui qui ouvre la fiche.

**D-006a — RENVERSÉE** : la fiche de la course en cours s'ouvrait
automatiquement, au motif qu'elle n'apparaissait dans aucune liste.

---

## D-007 — Deux comptes de test distincts, jamais de béquille dans le produit

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** — **REMPLACE D-007a** |
| **Date** | 28/07/2026 |
| **Décidé par** | l'user — « tu trouves pas ça bizarre ? » |

**Motif.** Quand le client et le livreur sont le **même compte**, les deux côtés
portent le même identifiant : **aucun code ne peut distinguer deux personnes qui
n'en sont qu'une.** C'est une impossibilité logique, pas une difficulté
technique. La réponse est un second compte de test, pas un contournement.

**D-007a — RENVERSÉE** : un sélecteur « J'écris en tant que » avait été ajouté
**dans l'interface**. Un vrai client n'aurait jamais dû le voir.
⛔ **Règle générale qui en découle** : devant une impossibilité, on la SIGNALE ;
on ne pose pas une béquille de test dans le produit.

---

## D-008 — Second facteur par application d'authentification, jamais par SMS

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** — **REMPLACE D-008a** |
| **Date** | 28/07/2026 |
| **Décidé par** | l'user — « e-mail + Google Authenticator, pas de SMS » |

**Motif.** Le SMS coûte, dépend d'un opérateur, et **l'user n'a pas de
téléphone**. Le TOTP fonctionne hors ligne, sur son iPad, via le trousseau
Apple. Identity Platform et le TOTP sont activés sur le projet.

**D-008a — RENVERSÉE** : envoi d'alertes et de codes par SMS (Twilio). Le code
`sendSms()` subsiste mais est **totalement inerte** sans les trois variables
d'environnement — vérifié : zéro appel réseau sans clé.

---

## D-009 — La plateforme ne fixe pas le prix de la course et ne l'encaisse pas

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** — **REMPLACE D-009a** |
| **Date** | 27/07/2026 |
| **Décidé par** | l'user — « le client fait une demande de courses, il ne paye rien avant » |

**Motif.** C'est la sortie complète de l'art. **L7342-1** et du critère de
présomption de salariat de la directive **(UE) 2024/2831** (transposition avant
le 02/12/2026). Le livreur fixe librement ses tarifs ; **aucun tri ni aucune
sanction ne dépend du montant**. Pirates Tools n'encaisse que **sa** marchandise.

**D-009a — RENVERSÉE** : le client payait marchandise + livraison en une fois,
les frais de course étaient **autoritaires côté serveur** et gelés en escrow.
⛔ Le code de paiement subsiste pour l'achat d'outils — ne pas le supprimer,
mais ne plus le brancher sur la livraison.

---

## D-010 — On travaille directement sur `master`

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** — **REMPLACE D-010a** |
| **Date** | 23/07/2026 |
| **Décidé par** | l'user |

**Motif.** Vercel ne déploie que `master`. Un correctif resté sur une branche
n'existe pas pour l'utilisateur : le 16/07, deux correctifs y sont restés
pendant qu'il testait le site en ligne, et il a constaté « rien ne marche ».

**D-010a — RENVERSÉE** : « toujours merger `master` après vérification ».
**Ce qui reste vrai** : un correctif non poussé n'est pas déployé.

---

## D-011 — Pas de minification

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** |
| **Date** | 21/07/2026 |
| **Décidé par** | l'user — « pas besoin » |

**Motif.** Évoquée après un travail de performance, écartée une fois la vitesse
redevenue normale. Elle ajouterait une étape de construction entre le code
source et ce qui est servi — donc un écart entre ce qu'on lit et ce qui tourne.
Réversible : à rouvrir si un plafond de **D-001** devient intenable autrement.

---

## D-012 — Pas de découpage du catalogue sous ~1000 produits

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** |
| **Date** | 28/07/2026 |
| **Décidé par** | l'user — « je resterai à 500-600 produits maximum » |

**Motif.** Le gain mesuré était de **25 ms**, jugé sans rapport avec la
complexité ajoutée. Un serveur dédié est envisagé plus tard pour la montée en
charge. Seuil de réouverture : **au-delà de ~1000 produits**.

---

## D-013 — Le domaine reste sur l'ancienne cible Vercel, derrière le proxy Cloudflare

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** |
| **Date** | 29/07/2026 |
| **Décidé par** | l'user, après une panne totale du site |
| **Mesure** | `pirates-tools.com` → `104.21.19.232` · `172.67.190.117` (Cloudflare) |

**Motif.** L'apex pointait sur la **nouvelle** cible Vercel
(`…vercel-dns-017.com` → `64.29.17.65` / `216.198.79.65`), injoignable depuis
l'opérateur marocain de l'user. Problème **connu et récurrent** des nouvelles
plages Vercel — cas identiques signalés depuis le Brésil (AS28668), Oman
(AS204170) et la Corée du Sud. Rien n'apparaît sur le statut Vercel : la coupure
est dans le chemin réseau.

**Ce qui est décidé** : apex **et** `www` sur `cname.vercel-dns.com` (ancienne
cible, plages `66.33.60.x` / `76.76.21.x`), **proxy Cloudflare activé** sur les
deux. ⛔ Ne jamais accepter la migration vers la cible par projet sans avoir
d'abord vérifié que les nouvelles IP répondent depuis le Maroc.

**Ce qui est conservé volontairement** : `www` reste branché en **Production**
(et non en redirection) — deux chemins indépendants vers le site. C'est ce
double chemin qui a permis de diagnostiquer la panne.

**Effets de bord à ne pas prendre pour des pannes** : Vercel peut afficher
« Invalid Configuration » (il voit des IP Cloudflare) = cosmétique ; un
déploiement qui ne s'affiche pas = cache Cloudflare → **Purge Everything**.

---

## D-014 — Plafond d'`app.js` relevé de 205 à 400 Ko

| | |
|---|---|
| **Statut** | ✅ **ACTIVE** |
| **Date** | 29/07/2026 |
| **Décidé par** | l'user — « relève la limite à 400, je ne pense pas que ça aura un gros impact sur la vitesse de téléchargement du site, c'est même pas le poids d'une photo » |
| **Mesure au moment de la décision** | `app.js` **205,18 Ko** · total servi à froid **369,9 Ko** (plafond 400, marge 30,1) |

**Motif.** `app.js` était à **204,97 Ko pour un plafond de 205** : **29 octets de
marge**. Un correctif de **sécurité** — la porte de l'administration n'atteignait
jamais la voie du claim, rendant `ADMIN_SECRET` impossible à retirer — pesait
186 octets de trop. Le plafond bloquait une correction nécessaire, ce qui n'est
pas son rôle.

Le raisonnement de l'user rejoint celui de **D-001** : *le seul chiffre qui
concerne réellement le visiteur est le TOTAL servi à froid*. Un plafond par
fichier se contourne de toute façon en découpant. **C'est donc P8.4 (400 Ko au
total) qui devient la limite réellement mordante** : `app.js` ne peut pas
dépasser ~335 Ko sans la faire rougir.

**Nuance dite à l'user, et assumée par lui** : du JavaScript n'est pas une
image. Une photo s'affiche, du code se **lit et s'exécute** — et l'user navigue
en privé, donc à **chaque** visite. Le coût n'est pas seulement du
téléchargement, c'est du temps processeur sur iPad.

**Ce qui n'est PAS autorisé par cette décision** : laisser `app.js` grossir sans
regarder. Le plafond total reste opposable et la CI le vérifie.

**CONTREPARTIE ACTÉE, à faire** : sortir les **33 fonctions d'administration**
(**92 Ko bruts, 12,9 % du fichier**, mesuré) dans un module chargé à la demande,
sur le modèle de `mfa.js` et `qrcode.js`. **Seul le propriétaire s'en sert** ;
tous les visiteurs les téléchargent et les font analyser par leur navigateur
pour rien. Une fois fait, on rabaissera le plafond à la mesure réelle.

**Où c'est exécuté** : `scripts/audit/p8-perf.js`, contrôle **P8.1**.
