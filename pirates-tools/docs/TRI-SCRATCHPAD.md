# TRI DU SCRATCHPAD — ce qui a été sauvé, ce qui reste à faire

> Ouvert le 28/07/2026 (phase 0 du plan fondations). **Ce document est vivant
> tant que `tests/_bruts/` n'est pas vide.**

## Pourquoi ce document existe
Jusqu'au 28/07/2026, **60 harnais (~959 assertions)** protégeant la chaîne
livraison, les paiements et la double authentification vivaient dans
`/tmp/claude-0/…/scratchpad/` — **hors du dépôt**. `git add` ne pouvait même pas
les atteindre. C'était le seul risque du projet à la fois **immédiat et
irréversible**.

## Méthode retenue : sauver d'abord, trier ensuite
Trier avant de sauver aurait laissé courir le risque pendant tout le tri.
Deux étages, assumés :
1. **Sauvetage** — copie verbatim des 60 harnais dans `tests/_bruts/`. Le risque
   disparaît immédiatement.
2. **Portage et tri** — chaque harnais est relancé, rendu portable, puis déplacé
   dans `tests/`. `_bruts/` doit finir **vide**.

## Critère de tri — mécanique, pas au jugé
Un fichier est un **harnais à versionner** s'il remplit les trois conditions :
1. il contient **≥ 5 assertions** ;
2. il **passe** quand on le relance aujourd'hui ;
3. il teste un **comportement du site**, pas un artefact d'investigation.

Tout le reste est un **outil** : réutilisable → `outils/` (jamais lancé par la
CI), jetable → laissé mourir, mais **écrit** ici. On ne supprime rien en silence.

---

## ✅ ÉTAGE 1 — SAUVETAGE : FAIT
| | |
|---|---|
| harnais copiés dans `tests/_bruts/` | **60** (463 Ko) |
| outils copiés dans `outils/` | **13** (72 Ko) |
| `node_modules` copiés | **0** — mesurés à **725 Mo** dans le scratchpad, dont 110 Mo pour les seuls outils 3D. Git n'oublie jamais. |
| plus gros fichier versionné | 40 Ko (`couriers.mjs`) |
| exclu du déploiement | ✅ `.vercelignore` : `tests/` et `outils/` |

## ✅ ÉTAGE 2 — PORTAGE : 19 / 60 faits

### Ce qui a été réparé au passage
Les harnais contenaient **3 familles de chemins absolus** qui les rendaient
inexécutables ailleurs :

| Chemin en dur | Occurrences | Remplacé par |
|---|---|---|
| `/home/user/ish/pirates-tools` | 57 | `RACINE`, calculé depuis `import.meta.url` |
| `/opt/node22/…/playwright` | 45 | `playwright()` du socle, avec repli et message clair |
| `/opt/pw-browsers/chromium` | 17 | `optionsNavigateur()`, ignoré si absent |

Et **52 harnais sur 60 recopiaient le même serveur HTTP** : il vit désormais une
seule fois, dans `tests/_socle.mjs`, **avec la compression gzip** (sans elle,
toute mesure de poids ou de durée serait fausse).

### Les 19 harnais portés — tous relancés, tous verts
```
node tests/lancer.mjs --complet   →  595/595 assertions · 19/19 verts · 239 s
node tests/lancer.mjs --noyau     →  136/136 assertions ·  6/6 verts ·  51 s
```

| Harnais | Assertions | Ce qu'il protège |
|---|---|---|
| `couriers` | 82 | annuaire livreurs, tarifs libres, profils publics |
| `plan8` · `plan9` | 71 · 71 | signets, bandeau de statut, qui décide quoi |
| `plan13` | 34 | double authentification TOTP |
| `plan10` | 33 | le panier rendu à l'annulation d'une course |
| `plan9-serveur` | 32 | contrat serveur de l'accord |
| `bulle` | 32 | fil de discussion client ↔ livreur |
| `plan11` | 28 | fluidité, sondage du bandeau, statuts réels |
| `detail` | 25 | fiche de course dépliée |
| `plan7` · `espace` | 24 · 24 | espaces client et livreur |
| `discuss` | 23 | messagerie |
| `plan12-serveur` | 21 | adresse e-mail vérifiée exigée |
| `accordE2E` | 18 | l'accord de bout en bout |
| `plan11-serveur` | 18 | alertes livreurs, SMS inerte sans clé |
| `a11y` | 16 | accessibilité (focus, contraste, noms) |
| `adminliv` | 15 | administration des litiges et vidéos |
| `course-pay` | 14 | modale de paiement des outils |
| `service` | 14 | page service coursier |

### 🚪 La porte qui empêche la rechute
`scripts/check-harnais.js`, branché dans `ci.js` : **refuse tout chemin absolu**
dans `tests/`. **Prouvé faillible** — en réintroduisant `/home/user/ish/…` dans
`detail.mjs`, la CI passe au rouge et nomme le fichier, la ligne et le chemin.

---

## ⏳ ÉTAGE 2 — CE QUI RESTE : 41 harnais dans `tests/_bruts/`

Ils sont **sauvés** (le risque irréversible est levé) mais **pas encore portés
ni relancés**. Ils testent des sujets plus anciens : administration,
comptabilité, prix, RGPD, tableau de bord, packs 3D, résilience.

⚠️ **Ils ne doivent pas être lancés en l'état** : chemins absolus, et surtout
certains encodent des specs que l'user a renversées depuis. **Un test faux est
pire qu'un test absent.**

Chacun recevra l'une des trois issues, écrite ici :
- **porté** → relancé, rendu portable, déplacé dans `tests/` ;
- **corrigé** → il testait une spec renversée, on le réaligne ;
- **supprimé** → avec le motif, jamais en silence.

| Harnais | Assertions | Dernière modif |
|---|---|---|
| `dossier.js` | 36 | 28/07 |
| `audit-buttons.js` | 19 | 28/07 |
| `verify-beacon.js` | 17 | 28/07 |
| `verify-dashboard.js` | 16 | 28/07 |
| `pipeline-emulator.js` | 16 | 28/07 |
| `test-variant.mjs` | 15 | 28/07 |
| `verify-globe.js` | 14 | 28/07 |
| `verify-lot3.js` | 13 | 28/07 |
| `verify-lot2.js` | 12 | 28/07 |
| `verify-cron.js` | 12 | 28/07 |
| `accord.js` | 12 | 28/07 |
| `verify-products.js` | 11 | 28/07 |
| `valider.js` | 11 | 28/07 |
| `verify-consent.js` | 10 | 28/07 |
| `verify-c6.js` | 10 | 28/07 |
| `test-inv.mjs` | 9 | 28/07 |
| `test-acc2.mjs` | 9 | 28/07 |
| `regression.mjs` | 9 | 28/07 |
| `p9-preuve.mjs` | 9 | 28/07 |
| `verify-oldspecs.js` | 8 | 28/07 |
| `test-pager.mjs` | 8 | 28/07 |
| `test-fisc2.mjs` | 8 | 28/07 |
| `test-fisc.mjs` | 8 | 28/07 |
| `test-calc.mjs` | 8 | 28/07 |
| `test-acc-ui.mjs` | 8 | 28/07 |
| `livfix.mjs` | 8 | 28/07 |
| `verify-m4.js` | 7 | 28/07 |
| `verify-csp.js` | 7 | 28/07 |
| `verify-crypto-off.js` | 7 | 28/07 |
| `test-compta.mjs` | 7 | 28/07 |
| `livbtn.mjs` | 7 | 28/07 |
| `carte3.mjs` | 7 | 28/07 |
| `carte2b.mjs` | 7 | 28/07 |
| `carte2.mjs` | 7 | 28/07 |
| `verify-c4.js` | 6 | 28/07 |
| `test-variant-live.mjs` | 6 | 28/07 |
| `shot-fix.js` | 6 | 28/07 |
| `cards.mjs` | 6 | 28/07 |
| `verify-resilience.js` | 5 | 28/07 |
| `verify-h5.js` | 5 | 28/07 |
| `test-grid.mjs` | 5 | 28/07 |
## Prochaine étape
Porter ces 41 harnais par lots, en commençant par les plus récents (24/07 :
prix, comptabilité, variantes), puis les plus anciens (15-18/07 : vérifications
de correctifs déjà fusionnés, dont beaucoup sont probablement couverts par les
29 contrôles de la CI — à vérifier avant de les supprimer).
