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

### 🔧 4 harnais de plus RÉCUPÉRÉS (28/07, 2ᵉ passe)

| Harnais | Cause **exacte** | Décision |
|---|---|---|
| `carte2b.mjs` | `const r` déclaré **dans** la boucle, utilisé **après** → `ReferenceError`. **Ce harnais n'avait jamais atteint une seule de ses assertions depuis son écriture.** | portée corrigée → **13/13** |
| `test-acc-ui.mjs` | appelait `synthesize(payments, cfg)` alors que la signature est `synthesize(payments, charges, cfg)` — le paramètre `charges` a été ajouté avec les charges saisies (art. 238 bis CGI, 25/07). Le plantage était **dans le code serveur**, mais la faute était dans l'appel. | appel corrigé → **8/8** |
| `audit-buttons.js` | 2 attentes périmées : « exactement 2 meuleuses » (catalogue passé de ~40 à 476) et « **onglet crypto actif** » alors que le canal crypto est **désactivé par décision user du 17/07** (`PT_CRYPTO_ENABLED = false`). | la 1ʳᵉ teste désormais le **comportement** du filtre (aucun produit nommé), la 2ᵉ a été **retournée** : elle protège la décision → **tout propre** |
| `pipeline-emulator.js` | exige l'**émulateur Firestore**, absent. Sans lui, l'Admin SDK visait la vraie base et rendait un mur d'`UNAUTHENTICATED`. | ⏭ **prérequis déclaré** : sortie en code 2, le lanceur affiche « IGNORÉ » et rappelle que *non exécuté n'est PAS vert* |

### 🔐 UNE CLÉ PRIVÉE RETIRÉE DU CHEMIN DE GIT
`pipeline-emulator.js` lisait un `fake_sa.json` **contenant une clé privée PEM**.
Même factice, elle n'entre pas dans le dépôt : c'est ce que `tests/README.md`
interdit, tout scanner de secrets la signalerait, et un lecteur qui la trouve
dans l'historique n'a aucun moyen de savoir qu'elle est fausse.
→ `tests/_fauxcompte.cjs` la **génère à l'exécution** (RSA 2048, projet
`demo-pt` — jamais `pirates-tools`). Rien de secret dans git, aucun fichier à
perdre, et une clé neuve à chaque lancement.

### ✅ `verify-beacon.js` — FAUSSE ALERTE DE RÉGRESSION, tranchée

Il annonçait que la mesure d'audience n'émettait plus `view_item` ni
`time_on_item`. **C'était le point n°1 de la liste de reprise**, parce qu'une
régression du site prime sur tout.

**Vérifié dans le code** : les deux événements sont toujours émis
(`app.js:495`, `app.js:507`, `app.js:2011`). La cause réelle : le harnais
ouvrait `#/produit/makita-dga504z`, **produit retiré du catalogue lors de la
purge voulue par l'user**. Il annonçait donc une panne inexistante.

→ **Les deux produits nommés en dur ont été supprimés** (session anonyme ET
session consentante) : le harnais prend désormais le **premier produit
réellement présent** au catalogue. Plus aucune suppression future ne peut le
casser. **17/17.**

⚠️ Le second ancrage (`dewalt-dcg405n`) **existait encore** — il n'échouait
pas, mais c'était un piège latent qui aurait explosé à la prochaine purge.
Traité aussi.

ℹ️ `pipeline-emulator.js` contient aussi `makita-dga504z`, et c'est **légitime** :
il s'agit d'événements **synthétiques** qu'il injecte lui-même pour vérifier
l'agrégation. Aucune lecture du catalogue, donc aucune dépendance.

### 🐛 UN DÉFAUT DANS MON PROPRE INSTRUMENT — trouvé en cherchant un faux vert

`test-variant-live` était noté « vert avec 1 assertion sur 6 » et classé comme
le plus suspect. **Il n'avait rien de suspect** : il rend bien « 6 passed,
0 failed ». C'est **le lanceur** qui comptait mal — il comptait les lignes
commençant par `✅`, alors que **16 harnais sur 47** résument tout sur une
seule ligne (`ALL PASS — 8 ok, 0 ko`, `12 OK / 0 KO`…).

**Mon total de « 808 assertions » était donc faux.** C'est le pire défaut
possible pour un instrument de mesure : un chiffre sous-évalué qui a l'air
précis. Corrigé — le lanceur lit d'abord le bilan que le harnais rend
lui-même, et **affiche la méthode employée** quand ce n'est pas le comptage
direct. Total réel après correction : **977 assertions**.

Ajouté au passage : un harnais **vert mais rendant 0 assertion** est désormais
**signalé** (« leur couverture est INVÉRIFIABLE — vert ne veut pas dire
vérifié »). `audit-buttons` était dans ce cas : il ne comptait que ses échecs.
Corrigé à la source, il rend maintenant **45/45**.

### 🔧 6 harnais de plus RÉCUPÉRÉS (28/07, 3ᵉ passe)

| Harnais | Cause **exacte** | Décision |
|---|---|---|
| `test-variant-live.mjs` | rien — c'était le lanceur | **6/6** |
| `audit-buttons.js` | ne comptait que ses échecs, rendait 0/0 en vert | compte aussi les réussites → **45/45** |
| `verify-consent.js` | exigeait les mots « techniques nécessaires » et « pourra être activée ». Le texte a été **réécrit par décision user (v321)**, après son constat que « pas de choix = pas respectable ». | teste désormais ce que le bandeau doit **garantir**, pas comment il le dit → **11/11** |
| `verify-cron.js` | la variable `mail` était **écrasée** à chaque envoi. `cron-report` en fait **deux** (audience + rappel fiscal, ajouté plus tard) : elle gardait le second, sans pièce jointe. | collecte **tous** les envois et désigne chacun par son **objet** — l'ordre peut changer sans rien casser → **13/13** |
| `verify-globe.js` · `verify-dashboard.js` | cherchaient le code pays brut `FR`. L'interface affiche désormais le **nom** (`countryName` : FR → « France ») — une amélioration que le test dénonçait comme un défaut. | vérifient que la provenance est rendue, sans dépendre du nom d'un pays → **14/14** et **16/16** |
| `test-grid.mjs` | testait un **défilement infini** (`#gridSentinel`, lots de 35). Ce mécanisme **n'existe plus** : 0 occurrence dans `app.js`. Il a été remplacé par une **pagination** (`PAGE_SIZE = 40`, app.js:1314), suite au bug de la « page vide » (v320). | **réécrit** sur le mécanisme actuel : page 1 ≤ 40, contrôle de pagination présent, et surtout **la page 2 montre des produits DIFFÉRENTS** — une pagination qui répète la page 1 serait pire que pas de pagination. Ce comportement n'était protégé par personne → **7/7** |

### 🔧 Les 2 DERNIERS — même faute que les sept précédentes

| Harnais | Cause **exacte** | Décision |
|---|---|---|
| `regression.mjs` | exigeait qu'un produit **sans variante** n'ait **pas** de sélecteur. ⚠️ **VÉRIFIÉ AVANT DE CONCLURE** : l'option coffret a été étendue aux produits « standalone » (app.js:2107) — « Avec coffret » = prix de base **+ supplément d'envoi**, pas un autre produit. `makita-dtw300zj` n'existe pas au catalogue : le bouton ne vend **rien de fantôme**. C'est une fonctionnalité voulue, pas un défaut. | assertion **retournée** + une assertion **ajoutée** : le supplément doit être RÉEL, sinon les deux boutons afficheraient le même prix et mentiraient au client → **11/11** |
| `test-variant.mjs` | deux causes. (1) exigeait `makita-dga506z` dans la grille : il est au **rang 62**, donc en page 2 depuis la pagination. (2) même spec renversée que ci-dessus. | teste désormais ce qui ne dépend d'aucun rang — **la grille n'expose JAMAIS la version coffret d'une paire** → **16/16** |

### 🆕 `tests/pdp-specs.mjs` — LA COUVERTURE PERDUE, RECRÉÉE

La suppression des 5 harnais périmés avait laissé un trou : **plus personne ne
vérifiait que les caractéristiques s'affichent** sur une fiche produit. Comblé.

**Il ne nomme AUCUN produit.** Le produit de test est choisi **à l'exécution**
dans le catalogue réel, sur un critère (« il a des specs »). C'est la faute qui
a tué les cinq précédents et qu'on a retrouvée dans **huit** harnais le même
jour : aucune suppression future ne peut casser celui-ci.

**Il mesure l'OPACITÉ RÉELLE, pas la présence dans le DOM.** La panne **v334**
laissait les lignes présentes mais à `opacity: 0` — un test qui compte les
lignes aurait été vert.

⚠️ **Trois pièges rencontrés en l'écrivant, tous dans mon propre harnais :**
1. **Sans défiler, l'opacité est 0** — et c'est normal. J'ai failli déclarer un
   bug sur un comportement voulu.
2. **`behavior:'instant'` est obligatoire** : le défilement doux du site fausse
   les lectures (règle acquise le 15/07, enfouie dans le journal).
3. **L'opacité est un DÉGRADÉ lié au défilement, pas un interrupteur** —
   mesuré : ligne 0 à **1,00**, ligne 12 à **0,18**, toutes dans la fenêtre.
   Exiger « toutes les lignes > 0,5 » était une assertion **fausse** : elle
   aurait échoué sur un site parfaitement sain. On mesure les lignes de la
   **moitié haute** de la fenêtre, qui doivent être pleinement révélées.

**Prouvé faillible** : en réintroduisant `opacity: 0 !important` sur
`.pdp-specs-table tr` (la panne v334), le harnais rougit et nomme l'opacité
mesurée — 0,00.

## 🚪 Les portes posées
| Porte | Ce qu'elle refuse | Éprouvée ? |
|---|---|---|
| `scripts/check-harnais.js` (30ᵉ contrôle de la CI) | tout chemin absolu dans `tests/` | ✅ **sabotage** : en remettant `/home/user/ish/…` dans `detail.mjs`, la CI rougit et nomme le fichier, la ligne et le chemin |
| `tests/_porter.mjs` | il **signale** les chemins qu'il ne sait pas traiter au lieu de les laisser passer | ✅ 13 signalements réels, tous repris à la main |
| `compteur().prealable()` du socle | un harnais vert **pour la mauvaise raison** (leçon du faux vert `plan12-serveur` : un 503 en amont) | mécanisme en place, à utiliser dans les harnais neufs |
