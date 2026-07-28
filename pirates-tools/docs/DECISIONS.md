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

## Décisions antérieures à reprendre dans ce registre
Ces choix ont été tranchés avant l'ouverture du registre et vivent encore dans
`CLAUDE.md` ou `docs/PLAN-FONDATIONS.md`. **Ils y seront transférés à l'étape 4
du plan mémoire**, avec leur statut — dont les **cinq renversements** qui
cohabitent aujourd'hui avec leur version d'origine.

| Sujet | Où c'est écrit aujourd'hui |
|---|---|
| Pas de minification | `docs/PLAN-FONDATIONS.md` |
| Pas de découpage du catalogue sous ~1000 produits | `docs/PLAN-FONDATIONS.md` |
| Pas de numéros de ligne inscrits dans le code | `docs/PLAN-FONDATIONS.md` |
| Canal crypto désactivé | `CLAUDE.md` |
| Purge du catalogue (« seul ce que le traqueur voit reste ») | `CLAUDE.md` |
| Stripe en mode test jusqu'au lancement | `CLAUDE.md` |
| Le client ne propose jamais de prix (livraison) | `CLAUDE.md` |
| Demande de course sans paiement | `CLAUDE.md` |
