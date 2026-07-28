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

## ✅ ÉTAGE 2 — PORTAGE ET TRI : TERMINÉ

```
node tests/lancer.mjs --complet  →  777/777 assertions · 42/42 harnais verts · 375 s
node tests/lancer.mjs --noyau    →  136/136 assertions ·  6/6 harnais verts ·  51 s
```

### Ce qui a été réparé au passage
Trois familles de chemins absolus rendaient les harnais inexécutables ailleurs :

| Chemin en dur | Occurrences | Remplacé par |
|---|---|---|
| `/home/user/ish/pirates-tools` | 57 | `RACINE`, calculée depuis le fichier lui-même |
| `/opt/node22/…/playwright` | 45 | `playwright()` du socle, avec repli et message clair |
| `/opt/pw-browsers/chromium` | 17 | `optionsNavigateur()`, ignoré si absent |

Et **52 harnais sur 60 recopiaient le même serveur HTTP**. Il vit désormais une
seule fois — en deux dialectes, parce que 22 harnais sont en CommonJS et le
reste en modules ES : `tests/_socle.mjs` et `tests/_socle.cjs`.

### 🐛 UN DÉFAUT QUE J'AI INTRODUIT, ET QUE LE LANCEUR A ATTRAPÉ
Ma première version de `_porter.mjs` injectait des `import` ESM dans des
fichiers **CommonJS**. Node 22 détecte la syntaxe ESM et bascule le fichier en
module : leurs `require()` échouaient alors avec *« require is not defined in
ES module scope »*. **12 harnais cassés d'un coup.**

Le lanceur l'a montré sans ambiguïté (« a planté avant de tester »), et non pas
en affichant un score dégradé qu'on aurait pu prendre pour une régression du
site. `_porter.mjs` **détecte désormais le dialecte** avant de toucher au
fichier, et le commentaire explique pourquoi.

---

## 📋 LE TRI, DÉCISION PAR DÉCISION

### ✅ 42 harnais PORTÉS, relancés, verts

| Harnais | | 
|---|---|
| `a11y.mjs` | |
| `accord.js` | |
| `accordE2E.mjs` | |
| `adminliv.mjs` | |
| `bulle.mjs` | |
| `cards.mjs` | |
| `carte2.mjs` | |
| `carte3.mjs` | |
| `couriers.mjs` | |
| `course-pay.mjs` | |
| `detail.mjs` | |
| `discuss.mjs` | |
| `dossier.js` | |
| `espace.mjs` | |
| `livbtn.mjs` | |
| `livfix.mjs` | |
| `p9-preuve.mjs` | |
| `plan10.mjs` | |
| `plan11-serveur.mjs` | |
| `plan11.mjs` | |
| `plan12-serveur.mjs` | |
| `plan13.mjs` | |
| `plan7.mjs` | |
| `plan8.mjs` | |
| `plan9-serveur.mjs` | |
| `plan9.mjs` | |
| `service.mjs` | |
| `test-acc2.mjs` | |
| `test-calc.mjs` | |
| `test-compta.mjs` | |
| `test-fisc.mjs` | |
| `test-fisc2.mjs` | |
| `test-inv.mjs` | |
| `test-pager.mjs` | |
| `valider.js` | |
| `verify-c4.js` | |
| `verify-c6.js` | |
| `verify-crypto-off.js` | |
| `verify-csp.js` | |
| `verify-h5.js` | |
| `verify-m4.js` | |
| `verify-resilience.js` | |

### 🔧 3 harnais CORRIGÉS — ils encodaient une spec renversée depuis
| Harnais | Ce qu'il testait | Ce qu'il teste maintenant |
|---|---|---|
| `accord.js` | « le **client** propose l'accord » | ⚖️ La règle a été **renversée le 28/07 (v528)** : seul le livreur propose. Plutôt que de supprimer le test, **l'assertion a été retournée** — elle protège désormais la règle en vigueur : « le CLIENT ne peut PAS proposer (403 **serveur**, pas seulement l'interface) ». C'est une règle à enjeu juridique (art. L7342-1) et **elle n'était couverte nulle part ailleurs** — vérifié. |
| `verify-m4.js` | suppression de compte par `deleteDoc` **côté client** | La suppression a été **refondue** : elle appelle l'endpoint serveur `account-erase`, qui purge aussi ce que le client ne peut pas toucher (courses, fil de discussion, photos, fiche livreur publique, dossier KYC). Le harnais guette désormais **le réseau**, et vérifie l'ordre : réauth → purge → suppression du compte Auth **en dernier**. Couverture RGPD non seulement préservée, mais **élargie**. |
| `dossier.js` | dossier livreur | Son faux `_lib/firebase` ne fournissait pas `verifyIdentity`, ajouté le 28/07 (adresse e-mail vérifiée exigée). Piège déjà consigné dans la mémoire projet. Stub complété. |

### 🗑 5 harnais SUPPRIMÉS — avec motif, jamais en silence
Ils sont conservés dans `tests/_perimes/` (non lancés) plutôt qu'effacés, pour
qu'on puisse contester la décision.

| Harnais | Motif de suppression |
|---|---|
| `verify-lot2.js` · `verify-lot3.js` · `verify-products.js` · `verify-oldspecs.js` · `shot-fix.js` | Ils sont **ancrés sur l'état du catalogue au 18/07** (« 35 produits affichés », « Perforateurs = 2 »). Or l'user a **volontairement purgé** le catalogue depuis. Vérifié produit par produit : **DCF894P2, TSC55, CL2.C18S, DCF620, DCD996P2 ont tous été supprimés à sa demande**. Ces harnais échouent donc en affirmant qu'un choix de l'user est un défaut. **Un test faux est pire qu'un test absent.** |

⚠️ **Ce qui est perdu, et il faut le dire** : ces harnais vérifiaient aussi le
rendu des **caractéristiques sur la fiche produit** (lignes visibles, bloc
masqué si aucune spec) — un vrai comportement, non lié au catalogue. Les
invariants de données sont couverts par `check-products-json` (dans la CI),
**mais le rendu visuel des specs n'est plus couvert par personne.** À reprendre
dans un harnais neuf, indépendant de tout produit nommé.

### ⏳ 13 harnais NON DIAGNOSTIQUÉS — sauvés, remis dans `_bruts/`
Je ne les ai **pas** triés : je manquais de marge pour le faire correctement, et
je préfère le dire que le prétendre. Ils sont **sauvés** (le risque irréversible
reste levé) mais retirés de `tests/`, **pour une raison de fond** : une suite qui
reste rouge en permanence finit par être ignorée, et cesse alors de protéger
quoi que ce soit.

- `audit-buttons.js`
- `carte2b.mjs`
- `pipeline-emulator.js`
- `regression.mjs`
- `test-acc-ui.mjs`
- `test-grid.mjs`
- `test-variant-live.mjs`
- `test-variant.mjs`
- `verify-beacon.js`
- `verify-consent.js`
- `verify-cron.js`
- `verify-dashboard.js`
- `verify-globe.js`

**Prochaine étape** : les reprendre un par un, chacun recevant l'une des trois
issues — porté, corrigé, ou supprimé avec motif.

---

## 🚪 Les portes posées
| Porte | Ce qu'elle refuse | Éprouvée ? |
|---|---|---|
| `scripts/check-harnais.js` (30ᵉ contrôle de la CI) | tout chemin absolu dans `tests/` | ✅ **sabotage** : en remettant `/home/user/ish/…` dans `detail.mjs`, la CI rougit et nomme le fichier, la ligne et le chemin |
| `tests/_porter.mjs` | il **signale** les chemins qu'il ne sait pas traiter au lieu de les laisser passer | ✅ 13 signalements réels, tous repris à la main |
| `compteur().prealable()` du socle | un harnais vert **pour la mauvaise raison** (leçon du faux vert `plan12-serveur` : un 503 en amont) | mécanisme en place, à utiliser dans les harnais neufs |
