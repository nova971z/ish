# TRI DU SCRATCHPAD — inventaire des 748 entrées

> Ouvert le 28/07/2026 (phase 0 du plan fondations). **Terminé le 28/07/2026.**
> Le plan exigeait que *chaque* fichier des deux scratchpads reçoive une
> catégorie écrite : « on ne supprime rien en silence ».

## Le périmètre, mesuré
| | entrées |
|---|---|
| `/tmp/claude-0/…/scratchpad/` (hors dépôt) | **527** |
| `pirates-tools/scratchpad/` (ignoré par git) | **221** |
| **Total** | **748** |

---

## 🔴 CE QUE LE TRI A TROUVÉ — et qui n'aurait pas dû être là

### 1. NEUF harnais oubliés — mon « 60/60 » était faux
J'avais annoncé « 60 harnais sur 60 tranchés ». **C'était faux** : je n'avais
inventorié que le scratchpad `/tmp`. Le scratchpad **du dépôt** contenait
**9 harnais supplémentaires (67 assertions)** jamais traités :

`final-smoke` · `verify-abo` · `verify-abo2` · `verify-abo3` ·
`verify-coffret-cart` · `verify-coffret-scope` · `verify-drt50` ·
`verify-home-strip` · `verify-notables12`

Ils couvrent les **abonnements**, l'**option coffret au panier** et le
**bandeau d'accueil** — des parcours qui n'étaient protégés par rien.
**Tous portés, tous verts.** Le compte réel n'était pas 60, mais **69**.

### 2. Les outils versionnés ne pouvaient pas tourner
`outils/` contenait **16 chemins absolus** (`/tmp/claude-0/…`,
`/home/user/ish/…`, `/opt/node22/…/playwright`). Ces outils étaient donc
**inexécutables ailleurs** — alors que leur README affirme que « refaire un
pack sans eux coûterait des jours ». **Un outil sauvé mais incapable de tourner
ne sauve rien.**
→ `outils/_socle.cjs` créé (RACINE, MODELES, POSTERS, travail(), playwright(),
three()), les 13 outils recâblés, **3 outils réutilisables récupérés**
(`_orient3d.js`, `build-batpack.mjs`, `build-square.mjs`).

### 3. La porte ne couvrait qu'un dossier sur deux
`scripts/check-harnais.js` refusait les chemins absolus dans `tests/` —
**mais pas dans `outils/`**, qui avait exactement le même défaut.
→ Étendue aux deux, récursive, **prouvée faillible sur `outils/`**.

---

## 📋 LES 748 ENTRÉES, PAR CATÉGORIE

### SAUVÉ — 68 entrées (9 %)
Versionnés dans le dépôt. Ils survivent au recyclage du conteneur.

- **55** — tests
- **8** — outils
- **5** — tests/_perimes

### ⚠️ À EXAMINER — 9 entrées (1 %)
Contenaient des assertions sans avoir été sauvés → **tous traités**, voir §1 ci-dessus.

- **9** — contient des assertions mais n'a pas été sauvé

### SCRIPT JETABLE — 362 entrées (48 %)
Laissés mourir. Ce sont des gestes ponctuels : appliquer un correctif déjà appliqué, produire une capture, mesurer une fois. Les rejouer ne produirait rien d'utile, et leur valeur est déjà passée dans le code ou dans le journal.

- **306** — diagnostic ou mesure ponctuelle, sans assertion durable
- **43** — produit une capture ponctuelle
- **13** — applique un correctif DÉJÀ appliqué — rejouer ne ferait rien

### ARTEFACT — 229 entrées (31 %)
Laissés mourir. **Reproductibles** : ce sont les SORTIES des outils versionnés dans `outils/`. Les 31 `.glb` sont des essais de composition à offsets successifs — ⚠️ **vérifié un par un : les packs FINAUX sont tous dans `models/products/`, aucun n'est perdu.**

- **180** — capture ou rendu produit par un outil — reproductible
- **31** — essai de composition 3D (offsets successifs) — les packs FINAUX sont dans models/products/
- **18** — copie de sauvegarde ponctuelle

### DONNÉE DE TRAVAIL — 63 entrées (8 %)
Laissées mourir. Sorties intermédiaires (relevés de prix, layouts, specs extraites) : ce qui comptait a été reporté dans `products.json`, `docs/` ou la mémoire projet.

- **37** — sortie intermédiaire d'un outil (layouts, specs, relevés)
- **22** — note ou page de travail
- **4** — type non classé

### DOSSIER DE TRAVAIL — 12 entrées (2 %)
Laissés mourir. Sorties de rendus et bacs à sable.

- **12** — sorties intermédiaires

### DÉPENDANCES — 5 entrées (1 %)
**Jamais versionnés — 725 Mo**, dont 110 Mo pour les seuls outils 3D. Git n'oublie jamais : un `git add` naïf aurait gonflé l'historique définitivement. `outils/README.md` donne la commande d'installation.

- **5** — node_modules et bacs à sable de bibliothèques

---

## ✅ CE QUI EST GARANTI — vérifié, pas supposé

| Contrôle | Résultat |
|---|---|
| **Secrets** — clé, jeton, compte de service versionné ? | le seul trouvé (`fake_sa.json`, clé privée PEM) est **remplacé par une génération à l'exécution** (`tests/_fauxcompte.cjs`). Aucun autre. |
| **Modèles 3D** — un `.glb` perdu ? | **les 31 sont soit versionnés dans `models/`, soit des essais intermédiaires**. Vérifié un par un. |
| **Images du site** — une référencée mais absente de `images/` ? | **aucune**. |
| **Outils réutilisables** — un oublié ? | 3 récupérés, les 13 rendus portables. |
| **Harnais** — un oublié ? | **9 récupérés**. Total réel : **69**, pas 60. |
| **`node_modules`** | **0 octet versionné** sur 725 Mo. |

## Ce qui meurt, et pourquoi c'est acceptable
**~680 entrées** sont laissées à la destruction du conteneur : scripts d'un
geste déjà fait, captures reproductibles, sorties intermédiaires.

Ce n'est pas une perte parce que **ce qui les produisait est versionné** : les
outils dans `outils/`, les décisions dans `docs/DECISIONS.md`, les leçons dans
la mémoire projet. Une capture se refait ; un outil perdu, non.
