# PLAN FONDATIONS — Pirates Tools
## Construire les instruments avant d'auditer

> **État : PLAN v2 — SOUMIS À VALIDATION. Rien n'est appliqué.**
> v1 rédigée le 28/07/2026. **v2 le 28/07/2026 après vérification par mesure.**
> À relire et amender par l'user avant exécution.

---

## ⚠️ CE QUE LA RELECTURE A CORRIGÉ DANS MA PROPRE v1

J'ai passé la v1 au même régime que le code : chaque chiffre re-mesuré par une
commande. **Quatre affirmations étaient fausses.** Elles sont corrigées ci-dessous
et c'est ce qui a fait naître le principe P-C.

| # | Ce que la v1 affirmait | Ce que la mesure dit | Conséquence |
|---|---|---|---|
| E1 | « 125 fichiers de vérification » | **284 fichiers**, dont **60 vrais harnais** (~959 assertions) et **224 outils jetables** | le tri de la phase 0 change d'échelle : on versionne 60 fichiers, pas 125 |
| E2 | « `scratchpad/` est dans `.gitignore` » | vrai **mais incomplet** : il y a **DEUX** scratchpads, et le plus important est **hors du dépôt** | le risque est plus grave que décrit — voir F1 |
| E3 | « 10 contrôles automatiques » | **29 contrôles** enchaînés par `ci.js` | la couverture existante est bien meilleure que je ne le disais |
| E4 | « la CI est déjà longue » (sous-entendu) | **148 ms** (1,7 s avec le démarrage de node) | aucun budget de durée à défendre côté CI ; le coût est **uniquement** dans les harnais Playwright |

**Une erreur de la v1 n'a PAS été corrigée mais précisée** : l'invariant
« `where` + `orderBy` exige un index » était marqué « aucun contrôle — à créer ».
C'est exact, mais `scripts/check-firestore-queries.js` **existe déjà** et couvre
une règle voisine (refus du *descending key scan*). → On l'**étend**, on ne crée
pas un 28ᵉ fichier.

---

## Pourquoi ce chantier

Le site fonctionne et il est protégé (**29 contrôles automatiques** dans `ci.js`,
**~1 026 assertions** de harnais). Mais **trois faiblesses structurelles**
coûtent cher :

### F1 — Les harnais ne sont nulle part de durable (le risque immédiat)

Il existe **deux** dossiers de travail, et **aucun des deux n'est versionné** :

| Dossier | Contenu | Pourquoi il n'est pas versionné | Espérance de vie |
|---|---|---|---|
| `/tmp/claude-0/…/scratchpad/` | **60 harnais, ~959 assertions** — dont `plan7` à `plan13`, `couriers`, `bulle`, `espace`, `detail`, `accordE2E`, `adminliv`, `course-pay`, `a11y` | **hors du dépôt** : `git add` ne peut même pas l'atteindre | **le recyclage du conteneur** — heures ou jours |
| `pirates-tools/scratchpad/` | 221 fichiers, dont **9 harnais (~67 assertions)** + les constructeurs de packs 3D | ignoré par `pirates-tools/.gitignore:24` (`scratchpad/`) | tant que le disque tient |

**C'est pire que ce que disait la v1.** Tout ce qui protège la chaîne livraison,
les paiements et la 2FA — c'est-à-dire tout ce qu'on a construit ces trois
derniers jours — vit dans un répertoire temporaire **situé en dehors du dépôt**.
Un recyclage du conteneur et il n'en reste rien : plus aucune capacité de
prouver une non-régression sur ces parcours.

### F2 — La mémoire projet est un journal chronologique

`CLAUDE.md` = **1 499 lignes**. Pour retrouver une règle, il faut traverser
l'historique. Je relis donc du contexte inutile à chaque session, et une règle
enfouie au milieu d'un récit du 20/07 a toutes les chances d'être manquée.

Corollaire mesuré : `docs/` contient **17 fichiers (292 Ko)**, dont **6
seulement** sont cités depuis `CLAUDE.md`. **11 documents sont orphelins** —
donc jamais ouverts.

### F3 — Aucun graphe d'appels

Pour savoir ce qu'une modification casse, je dois chercher les appelants à la
main. C'est aussi ce qui interdit tout découpage sûr de `app.js` : on ne peut
pas extraire un module sans savoir qui appelle quoi.

**Objectif du chantier** : qu'avant même de lire une ligne de code, je sache
*où aller*, *ce que je risque de casser*, et *ce qui est déjà vérifié*.

---

## ⛔ CE QUE CE CHANTIER NE FAIT PAS ET NE BLOQUE PAS

**Le lancement commercial n'attend pas ce chantier.** Les points bloquants du
lancement (mentions légales, médiateur, Stripe LIVE, `STRIPE_WEBHOOK_SECRET`)
sont **indépendants** et restent prioritaires si l'user décide de lancer.

Ce chantier est un investissement sur la durée de vie du site, pas un prérequis
de mise en vente. **À tout moment, l'user peut l'interrompre entre deux phases**
sans rien laisser à moitié fait — c'est une exigence de conception, pas un
espoir (voir « Réversibilité » ci-dessous).

**Une seule exception : la phase 0.** Elle, il faut la faire tout de suite,
parce que le risque qu'elle traite est en cours de réalisation.

---

## Les principes non négociables

**P-A — Une documentation non vérifiée est un mensonge en préparation.**
Chaque document produit ici doit avoir un contrôle automatique qui échoue quand
il se désynchronise du code. Un numéro de ligne cité, une fonction nommée, un
harnais référencé : tout doit être validé mécaniquement. Sinon on fabrique une
carte qui envoie dans le mur au bout de trois semaines.

**P-B — Ce qui peut être exécuté ne doit pas être écrit.**
Une règle dans un fichier est une règle qu'on peut oublier. Une règle dans la CI
est une règle qui bloque. On n'écrit une règle en prose que lorsqu'elle est
réellement inautomatisable — et on le justifie alors explicitement.

**P-C — Aucun chiffre n'entre dans un document sans avoir été mesuré.** *(nouveau)*
Ce principe est né de la v1 de ce plan même : elle contenait **quatre chiffres
faux**, tous obtenus « de mémoire ». Un chiffre non mesuré est une opinion
déguisée en fait, et il est d'autant plus dangereux qu'il a l'air précis.
→ Tout chiffre cité dans `docs/` porte, en commentaire ou en annexe, **la
commande qui le produit**.

---

## 📖 GLOSSAIRE — les mots que j'emploie, en français clair

L'user n'est pas développeur. Chaque terme technique de ce plan est défini ici,
et le vocabulaire de ce glossaire est le seul autorisé dans les documents
produits.

| Terme | Ce que ça veut dire |
|---|---|
| **Harnais** | un programme qui teste le site tout seul : il ouvre les pages, clique, et vérifie que ce qui doit s'afficher s'affiche. Il rend un score du type « 70/70 ». |
| **Assertion** | une vérification élémentaire dans un harnais. « 70/70 » = 70 assertions, toutes passées. |
| **Sabotage** | on casse volontairement le code pour vérifier que le harnais **s'en aperçoit**. Un test qu'on n'arrive pas à faire échouer ne teste rien. |
| **CI** | les contrôles automatiques lancés avant chaque livraison (`node scripts/ci.js`). Rouge = on ne livre pas. |
| **Porte** | un contrôle qui **refuse** le passage. Ce n'est pas un conseil, c'est un blocage. |
| **Invariant** | une vérité qui ne doit jamais être fausse, dans aucun cas (« le prix débité vient toujours du serveur »). |
| **Graphe d'appels** | la carte de « qui appelle qui » dans le code. Elle répond à : *si je change ça, qu'est-ce que ça casse ailleurs ?* |
| **Grappe** | un groupe de fonctions qui ne se parlent qu'entre elles. C'est le bon candidat pour sortir dans un fichier séparé, parce que le sortir ne dérange personne. |
| **Point de passage** | une fonction appelée de partout (`escapeHTML`, `apiBaseUrl`). Y toucher a un effet sur tout le site. |
| **Orpheline** | une fonction que plus personne n'appelle. Du code mort, qui pèse pour rien. |
| **Ancre** | un repère nommé posé en commentaire dans le code (`// ══ ZONE : PAIEMENT ══`). Contrairement à un numéro de ligne, elle ne se décale pas quand on modifie le fichier. |
| **Cliquet** | un contrôle qui autorise à faire mieux mais jamais pire (une fonction trop longue a le droit de rétrécir, jamais de regrossir). |
| **Index composite** | un réglage à déclarer chez Firebase pour que certaines recherches fonctionnent. Sans lui, la recherche marche en test et **plante en vrai**. |

---

## Critère de réussite global

À la fin, une seule question tranche : **« Combien de fichiers dois-je ouvrir
pour savoir où intervenir sur un sujet donné ? »**
Aujourd'hui : 3 à 6 (mémoire + cartographie + recherche + code).
Cible : **1** (l'index), puis directement le bon endroit du code.

## 🛑 Critère d'ARRÊT — pour que ce chantier ne dévore pas tout

Un chantier de fondations sans condition de sortie devient un puits. Trois
règles d'arrêt, à appliquer sans discussion :

1. **Arrêt normal** : une phase se termine, l'user décide s'il enchaîne. Le
   défaut est **NON** : on ne continue que si l'user le dit.
2. **Arrêt sur non-rentabilité** : si une phase demande plus de **3 sessions**
   sans produire un livrable utilisable, elle est **coupée en deux** ou
   **abandonnée avec motif écrit**. On ne s'acharne pas.
3. **Arrêt sur priorité** : si l'user veut lancer, ou veut une fonctionnalité,
   le chantier s'interrompt **à la fin de la phase en cours**, jamais au milieu.

---

## 📍 SUIVI D'AVANCEMENT — reprendre sans relire

**Le problème réel** : une session peut s'interrompre au milieu du lot 7.3. À la
reprise, je ne dois pas relire 40 000 lignes pour savoir où j'en étais.

**Livrable, dès la phase 0** : `docs/AVANCEMENT-FONDATIONS.md`, court et
mécanique — une ligne par phase et par lot :

```
PHASE 0  ✅ terminée   commit a1b2c3d   60 harnais versionnés, 959 assertions vertes
PHASE 1  🔄 en cours   dernier point : CLAUDE.md découpé, RÈGLES à relire
PHASE 2  ⬜ à faire
...
LOT 7.3  🔄 en cours   lu jusqu'à app.js:8420 (fiche « panier » écrite, « paiement » non)
```

**Règle de session** : au démarrage, je lis **`docs/AVANCEMENT-FONDATIONS.md`
en premier, et lui seul**, pour savoir quoi ouvrir ensuite. C'est le point de
reprise, et c'est aussi ce qui évite de brûler du contexte à retrouver le fil.

**Règle d'écriture** : ce fichier est mis à jour **à la fin de chaque session**,
même — surtout — quand la session s'est mal passée.

---

## 💰 COÛT ESTIMÉ — en sessions, pas en tokens

L'user paie en sessions de travail, pas en jetons. Une **session** = un contexte
plein, soit à peu près une demi-journée d'échange soutenu.

| Phase | Sessions estimées | Ce qui rend l'estimation fragile |
|---|---|---|
| 0 — Sauver les harnais | **1 à 2** | le nombre de harnais périmés à corriger est inconnu tant qu'on ne les a pas relancés |
| 1 — Architecture documentaire | **1 à 2** | 1 499 lignes à trier ; découpage mécanique mais long |
| 2 — Invariants | **1** | plafonné à 15 invariants, donc borné par construction |
| 3 — Graphe d'appels | **2 à 3** | le plus incertain : les appels indirects (`onclick`, délégation) peuvent doubler le travail |
| 4 — Catalogue des harnais | **1** | généré, donc rapide — dépend de la phase 0 |
| 5 — Sommaire et cartographie | **2** | l'épreuve à l'aveugle peut imposer une seconde passe |
| 6 — Les portes | **1 à 2** | chaque porte exige son sabotage, ce qui double le temps par porte |
| 7 — Audit ligne par ligne | **7 à 10** (1+ par lot) | le lot 7.2/7.3 (`app.js` cœur) peut déborder |
| 8 — Synthèse et découpage | **1** | |
| 9 — Corrections | **variable** | dépend entièrement de ce que l'audit trouve — **non estimable avant la phase 8** |
| **Total hors phase 9** | **17 à 24 sessions** | |

⚠️ **Cette estimation est un ordre de grandeur, pas un engagement.** Si un lot
dépasse le double de son estimation, la règle d'arrêt n°2 s'applique.

---

## 🔁 RÉVERSIBILITÉ — la règle de commit

**Une phase = un ou plusieurs commits, jamais un commit à cheval sur deux phases.**
Chaque commit de ce chantier :
- porte un message préfixé `fondations(N)` où N est le numéro de phase ;
- laisse `node scripts/ci.js` **vert** ;
- est annulable seul (`git revert`) sans casser une autre phase.

**Ce que je m'interdis pendant les phases 0 à 6** : toucher à `app.js`,
`styles.css`, `index.html`, `api/` **autrement que pour ajouter des ancres en
commentaire** (phase 5). Les fondations ne modifient pas le produit. Toute
modification de comportement pendant ces phases est une faute, pas une
initiative.

---

# PHASE 0 — SAUVER LES HARNAIS

**Le risque est immédiat et irréversible. Rien d'autre ne commence avant.**

### Ce qui est en jeu — chiffré
| | `/tmp/claude-0/…/scratchpad/` | `pirates-tools/scratchpad/` |
|---|---|---|
| entrées totales | **514** | **221** |
| dont programmes (`.mjs`/`.js`) | **284** | **147** |
| dont **harnais** (≥ 5 assertions) | **60** (~**959** assertions) | **9** (~**67** assertions) |
| dont outils | 224 | 138 |
| statut git | **hors du dépôt** | ignoré (`pirates-tools/.gitignore:24`) |

Le reste (735 − 431 = **304 entrées**) sont des images, JSON, captures et
fichiers de travail : ils suivent la même règle de tri, mais ne sont ni harnais
ni programmes.

### Critère de tri — mécanique, pas au jugé
Un fichier est un **harnais à versionner** s'il remplit **les trois** conditions :
1. il contient **≥ 5 assertions** (compteur `T(`/`ok(`/`assert(`) ;
2. il **passe** quand on le relance aujourd'hui ;
3. il teste un **comportement du site**, pas un artefact d'investigation
   (une capture d'écran, un rendu 3D, un calcul de prix ponctuel).

Tout le reste est un **outil**, et les outils suivent une règle différente :
- **outil réutilisable** (constructeurs de packs 3D `_gltftools/`, collages de
  posters, `_orient.js`) → versionné dans `outils/`, **sans** être lancé par la
  CI, parce que refaire un pack sans eux coûterait des jours ;
- **outil jetable** (captures ponctuelles, scripts d'application d'un correctif
  déjà appliqué) → **laissé mourir**, avec la liste écrite de ce qui est
  abandonné. On ne supprime rien en silence.

### Livrables
1. **`tests/`** — dossier VERSIONNÉ des harnais.
2. **`outils/`** — dossier VERSIONNÉ des outils réutilisables.
3. **`docs/TRI-SCRATCHPAD.md`** — le tri écrit : chaque fichier, sa catégorie,
   et pour les abandonnés, le motif. C'est la trace qui permet de contester le
   tri plus tard.
4. **`tests/lancer.mjs`** — lanceur unique : total, échecs, durée, et
   **séparation noyau rapide / lot complet**.
5. **`docs/AVANCEMENT-FONDATIONS.md`** — créé ici, dès la première phase.
6. **Décision tracée** sur `.gitignore` : exception explicite pour `tests/` et
   `outils/`, `scratchpad/` restant ignoré.

### Pièges identifiés — à traiter, pas à découvrir
- ⚠️ **Chemins absolus** : les harnais contiennent `/home/user/ish/pirates-tools`
  en dur (`const ROOT = …`, vérifié dans `plan13.mjs:12`). Versionnés tels quels,
  ils casseront ailleurs. → Tous les chemins deviennent **relatifs au dépôt**.
- ⚠️ **Playwright en dur** : `import '/opt/node22/lib/node_modules/playwright/index.js'`
  (vérifié, `plan13.mjs:6`). → Résolution par un module partagé, avec un message
  clair si Playwright est absent — et non un plantage cryptique.
- ⚠️ **Le serveur statique recopié dans chaque harnais** : les ~20 lignes de
  serveur HTTP + table MIME sont dupliquées dans presque tous les `.mjs`. Les
  versionner en l'état fige 20 copies d'un même bloc. → **Un seul module
  `tests/_socle.mjs`**, et c'est aussi ce qui rend le point précédent réparable
  en un endroit.
- ⚠️ **Doublons** : `plan7`/`plan8` se recouvrent partiellement. → Recensement
  des recouvrements AVANT versionnement ; on ne fige pas la redondance.
- ⚠️ **Harnais périmés** : certains encodent des specs que l'user a renversées
  depuis (constaté : panneaux qui s'ouvraient seuls, `#courierMine` visible).
  **Un test faux est pire qu'un test absent.** → Chacun doit passer AVANT d'être
  versionné ; ceux qui échouent sont **corrigés** ou **supprimés avec motif
  écrit** — jamais désactivés en silence.
- ⚠️ **Durée** : ~15 harnais Playwright à ~40 s = **10 min**. Trop long pour un
  lancement systématique. → **Noyau rapide** (≤ 90 s, les parcours d'argent et de
  livraison) + **lot complet** (avant livraison importante).
  ℹ️ À l'inverse, `node scripts/ci.js` prend **148 ms** : aucun budget à
  défendre de ce côté-là.
- ⚠️ **Poids déployé** : `tests/` et `outils/` ne doivent JAMAIS partir sur
  Vercel (`.vercelignore`) ni entrer dans le Service Worker.
- ⚠️ **Le harnais qui écrit dans Firestore réel** : certains harnais serveur
  parlent à l'émulateur, d'autres stubbent. Un harnais versionné qui toucherait
  la vraie base serait un désastre. → Contrôle : aucun harnais ne doit contenir
  d'identifiants de projet réels ni de clé de service.

### Preuve de réussite — mesurable, pas déclarative
- [ ] `git ls-files tests/ | wc -l` ≥ 60
- [ ] `grep -rE "/tmp/|/home/user|/opt/node22" tests/ outils/` rend **0 résultat**
- [ ] `node tests/lancer.mjs --noyau` : **0 échec**, durée **≤ 90 s**
- [ ] `node tests/lancer.mjs --complet` : total ≥ **1 000 assertions**, 0 échec
- [ ] Un contrôle CI refuse tout nouveau harnais contenant un chemin absolu —
      **prouvé faillible par sabotage**
- [ ] `tests/` et `outils/` absents du build Vercel (vérifié dans `.vercelignore`)
- [ ] `docs/TRI-SCRATCHPAD.md` couvre les **735 entrées** des deux scratchpads
      (514 + 221) : aucun fichier sans catégorie

---

# PHASE 1 — ARCHITECTURE DOCUMENTAIRE

### Le problème exact
`CLAUDE.md` = **1 499 lignes** de journal chronologique. Et un
`CLAUDE_PIRATESTOOLS.md` **ne serait pas lu automatiquement** : seul `CLAUDE.md`
l'est. Écrire des règles ailleurs sans aiguillage = écrire des règles mortes.
Preuve mesurée : `docs/` contient 17 fichiers, **11 ne sont cités nulle part**.

### Structure cible

| Fichier | Nature | Taille visée | Lu quand |
|---|---|---|---|
| `CLAUDE.md` (racine) | **aiguillage** : quoi lire selon la tâche | ≤ 80 lignes | automatiquement, toujours |
| `docs/REGLES-PIRATESTOOLS.md` | **règles impératives** du site | ≤ 300 lignes | dès qu'on touche au site |
| `docs/INVARIANTS.md` | **vérités inviolables** (phase 2) | ≤ 120 lignes | avant toute modification |
| `docs/JOURNAL.md` | **historique** : pourquoi on en est là | libre | seulement en cas de doute |
| `docs/CARTOGRAPHIE.md` | **où est quoi** (phase 5) | libre | avant d'intervenir |
| `docs/AVANCEMENT-FONDATIONS.md` | **où j'en suis** | ≤ 40 lignes | au démarrage de chaque session |

### Règle de tri — appliquée sans exception
- **Impératif au présent** (« le prix vient toujours du serveur ») → RÈGLES
- **Récit au passé** (« le 26/07 on a découvert que… ») → JOURNAL
- **Localisation** (« lvPanelPay est à app.js:6013 ») → CARTOGRAPHIE
- **Vérité absolue et testable** → INVARIANTS

### Le sort des 17 documents existants — décidé, pas subi
Chaque fichier de `docs/` reçoit **une** étiquette, écrite dans l'index :

| Étiquette | Signification | Exemples pressentis |
|---|---|---|
| **VIVANT** | source de vérité en cours, cité depuis l'aiguillage | `METHODE-ENTREPRISE-FISCALITE.md`, `REGLES-PRODUITS.md`, `CARTOGRAPHIE.md` |
| **ARCHIVE** | terminé, gardé pour l'histoire, déplacé dans `docs/archives/` | `PLAN-REMEDIATION.md` (10/10 fait), `PLAN-DASHBOARD-ADMIN.md` (6/6 fait) |
| **À TRANCHER** | ni vivant ni mort — l'user décide | `PLAN-ABONNEMENTS.md`, `plan-creation-coursier.md`, `MAKITA-POSTERS-TODO.md` |

⚠️ **Aucun document n'est supprimé dans cette phase.** Archiver, c'est déplacer.

### Pièges identifiés
- ⚠️ **La perte d'information** : découper 1 499 lignes, c'est risquer de perdre
  une leçon durement acquise. → **Aucune suppression** : uniquement des
  déplacements. Contrôle : la somme des lignes des nouveaux fichiers ≥
  l'original, hors reformulations tracées.
- ⚠️ **L'aiguillage qui n'aiguille pas** : si `CLAUDE.md` dit juste « voir les
  docs », je ne saurai pas lequel ouvrir. → Il doit être une **table de
  décision** : *tu touches à l'argent → lis X* ; *tu touches à la livraison →
  lis Y*.
- ⚠️ **Le fichier orphelin** : un document non référencé n'est jamais lu (11 cas
  aujourd'hui). → Contrôle CI : **chaque fichier de `docs/` est cité** au moins
  une fois depuis l'aiguillage, directement ou en cascade. Les archives sont
  citées collectivement, via `docs/archives/`.
- ⚠️ **Le doublon de mémoire** : un second `CLAUDE.md` a été créé par erreur
  **deux fois** dans `pirates-tools/`. → Contrôle CI : **il n'existe qu'un seul
  `CLAUDE.md` dans le dépôt**, à la racine. Contrôle trivial, incident réel.
- ⚠️ **Les acquis de méthode transférables** : `CLAUDE.md` contient des leçons
  qui ne concernent pas ce site (elles vaudraient pour n'importe quel projet).
  → Elles vont dans `docs/METHODE-TRAVAIL.md`, pas dans les règles du site.

### Preuve de réussite
- [ ] `CLAUDE.md` ≤ 80 lignes et ne contient **aucune** règle métier
- [ ] `find . -name CLAUDE.md -not -path "*/node_modules/*" | wc -l` = **1**
- [ ] Chaque fichier de `docs/` est atteignable depuis `CLAUDE.md` — contrôle
      automatique qui échoue sur un orphelin, **prouvé faillible**
- [ ] Contrôle automatique : aucune date ni verbe au passé dans le fichier de
      RÈGLES (heuristique, avec liste d'exceptions justifiées)
- [ ] Épreuve : je réponds à « quelle est la règle sur les prix produits ? » en
      ouvrant **≤ 2 fichiers**

---

# PHASE 2 — REGISTRE DES INVARIANTS

### Objectif
Extraire les vérités qui ne doivent **jamais** être violées, et **les rendre
exécutables** partout où c'est possible (P-B).

### Candidats déjà identifiés dans l'histoire du projet
| Invariant | Automatisable ? | Contrôle existant |
|---|---|---|
| Le prix débité vient TOUJOURS du catalogue serveur | oui | `check-pricing.js`, `p5-money` |
| Un échec réseau n'est JAMAIS traité comme un résultat vide | partiellement | **aucun — à créer** (5 occurrences historiques) |
| Jamais de bouton désactivé comme état de repos | oui (statique) | **aucun — à créer** |
| On ne se fie jamais au retour d'une écriture : on relit | non (procédural) | prose + revue |
| Une vérification qu'on ne peut pas faire échouer ne vérifie rien | non (procédural) | prose + sabotage obligatoire |
| Aucun secret serveur côté client | oui | `p3-endpoints` partiel |
| Toute requête `where` + `orderBy` sur 2 champs exige un index composite | oui (statique) | **à ajouter dans `check-firestore-queries.js`** (le fichier existe, la règle non) |
| L'interface n'est jamais la sécurité : le serveur revérifie | partiellement | `p3-dispatch-live` |
| Une classe CSS construite par concaténation n'est jamais « morte » | oui (statique) | **aucun — à créer** (piège de purge rencontré 2 fois) |

### Pièges identifiés
- ⚠️ **L'invariant creux** : « le code doit être propre » n'est pas un invariant,
  c'est un vœu. → Critère d'admission : un invariant doit pouvoir être **violé
  de façon démontrable**. S'il est invérifiable, il n'entre pas.
- ⚠️ **Le faux invariant** : une règle vraie 95 % du temps crée des exceptions
  silencieuses. → Chaque invariant liste ses **exceptions légitimes** nommément,
  ou il n'en a aucune.
- ⚠️ **L'inflation** : 40 invariants = 0 invariant respecté. → Plafond **15**, et
  pour en ajouter un, il faut en retirer un ou justifier le dépassement.
- ⚠️ **L'invariant qui contredit une décision produit** : « jamais de bouton
  désactivé » a une exception légitime (l'état transitoire d'un envoi en cours).
  Un invariant sans son exception devient un contrôle qu'on désactive.

### Preuve de réussite
- [ ] Chaque invariant est soit couvert par un contrôle automatique, soit marqué
      « procédural » **avec la raison** de sa non-automatisation
- [ ] Chaque nouveau contrôle créé est **prouvé faillible** par sabotage
- [ ] Le registre tient en ≤ 120 lignes et compte ≤ 15 invariants

---

# PHASE 3 — GRAPHE DE DÉPENDANCES

### Objectif
Répondre en une seconde à : *« si je modifie cette fonction, qu'est-ce que je
casse ? »* — et **rendre le découpage de `app.js` possible sans deviner**.

### Livrables
1. **`scripts/graphe.js`** — analyse `app.js` (l'AST est **déjà** parsé par
   `p1-static`, donc l'infrastructure existe et le coût d'amorçage est faible)
   et produit :
   - pour chaque fonction : ses **appelants** et ses **appelées** ;
   - les **grappes** (candidates à l'extraction) ;
   - les **points de passage** (effet global) ;
   - les **orphelines** (code mort réel).
2. **`docs/GRAPHE.md`** — la sortie lisible, régénérable par commande.

### Pièges identifiés
- ⚠️ **Appels indirects** : `onclick`, `addEventListener`, tableaux de fonctions,
  `data-*` + délégation. Un graphe qui les ignore mentirait par omission.
  → L'outil doit **déclarer ses angles morts** plutôt que les taire.
- ⚠️ **Les fonctions appelées depuis une chaîne de caractères** : le HTML généré
  contient `onclick="..."`. Ces appels sont invisibles à l'analyse classique.
  → Passe dédiée sur les littéraux de chaîne, avec taux de confiance affiché.
- ⚠️ **Homonymes** : plusieurs `showDetail` existent dans des portées différentes
  (constaté). Les confondre produirait un graphe faux. → Résolution par portée.
- ⚠️ **La photo périmée** : un graphe généré une fois se désynchronise.
  → Régénérable en une commande + contrôle CI de fraîcheur.
- ⚠️ **L'illusion de complétude** : un graphe propre donne l'impression de tout
  savoir. → Il affiche son **taux de couverture** et ce qu'il n'a pas résolu.
- ⚠️ **Le coût qui dérape** : c'est la phase la plus incertaine du plan (2 à 3
  sessions estimées). → Si la résolution des appels indirects dépasse une
  session à elle seule, on livre un graphe **partiel et honnête** (angles morts
  déclarés) plutôt qu'un graphe complet jamais fini.

### Preuve de réussite
- [ ] `node scripts/graphe.js --qui-appelle lvPanelPay` liste les appelants
      réels, vérifiés **à la main sur 5 cas tirés au hasard**
- [ ] Les grappes proposées correspondent aux domaines métier (livraison, admin,
      catalogue…) — sinon l'analyse est à revoir
- [ ] Les orphelines détectées sont **réellement** mortes (vérification manuelle
      exhaustive : c'est du code qu'on va supprimer)
- [ ] Le taux de couverture est affiché et ≥ 80 % des appels résolus
- [ ] Un contrôle CI échoue si `docs/GRAPHE.md` n'est plus à jour

---

# PHASE 4 — CATALOGUE DES HARNAIS

### Objectif
Savoir **ce qui est déjà vérifié**, pour ne pas re-tester l'existant ni croire
couvert ce qui ne l'est pas.

### Livrable
**`docs/COUVERTURE.md`**, **généré** (jamais écrit à la main) :
- un harnais = son intitulé, son nombre d'assertions, le comportement couvert ;
- l'index inverse : *pour le sujet « paiement », les harnais concernés sont…* ;
- les **zones sans aucune couverture** — l'information la plus précieuse.

### Pièges identifiés
- ⚠️ **Écrit à la main = périmé en une semaine.** → Généré depuis les intitulés
  réels des assertions.
- ⚠️ **Compter les assertions n'est pas mesurer la couverture** : 70 assertions
  sur un bouton et 0 sur le paiement donnent un beau total et une protection
  nulle. → Couverture **par domaine**, pas un total.
- ⚠️ **Le harnais vert qui ne teste rien** : déjà rencontré (faux vert dû à un
  503 en amont, `plan12-serveur`). → Marquer les harnais dont la faillibilité a
  été **prouvée par sabotage**, signaler les autres comme **non éprouvés**.
- ⚠️ **L'intitulé qui ne dit rien** : une assertion nommée « test 4 » ne peut pas
  alimenter un catalogue. → Contrôle : tout intitulé d'assertion doit faire
  ≥ 3 mots. Les harnais fautifs sont renommés en phase 0.

### Preuve de réussite
- [ ] `docs/COUVERTURE.md` régénérable en une commande
- [ ] Il nomme au moins **3 zones non couvertes** (s'il n'en trouve aucune, il
      mesure mal — le site n'est pas couvert à 100 %)
- [ ] Chaque harnais indique s'il a été éprouvé par sabotage
- [ ] Le total affiché correspond au total du lanceur de la phase 0 (cohérence
      croisée : deux compteurs indépendants qui doivent tomber juste)

---

# PHASE 5 — SOMMAIRE ET CARTOGRAPHIE MAXIMALE

### Objectif
**L'instrument que l'user demande** : savoir où intervenir sans chercher.

### Livrables
1. **`docs/INDEX.md`** — l'entrée unique. Table à trois colonnes :
   *« je veux faire X »* → *fichier + ancre* → *contrôles et harnais qui
   protègent cette zone*.
2. **`docs/CARTOGRAPHIE.md` refondue** (29,5 Ko existants à reprendre).
3. **Ancres stables** dans le code (`// ══ ZONE : PAIEMENT ══`), **plus robustes
   qu'un numéro de ligne**, qui se décale à chaque modification.

⚠️ **C'est la seule phase 0-6 qui touche au code** — et uniquement pour ajouter
des commentaires. Aucun comportement modifié. La CI doit rester verte avant/après
et le poids de `app.js` ne doit pas franchir le budget P8 (205 Ko) : les ancres
sont courtes, mais elles ne sont pas gratuites.

### Pièges identifiés
- ⚠️ **Les numéros de ligne mentent dès le commit suivant.** C'est le défaut
  principal de la cartographie actuelle. → Ancres nommées + contrôle CI qui
  vérifie que chaque ancre citée **existe encore**.
- ⚠️ **La carte qui duplique le code** : si la cartographie explique *comment* ça
  marche, elle deviendra fausse. → Elle dit **où** et **quels pièges**, jamais
  *comment* : le comment est dans le code, seule source de vérité.
- ⚠️ **La table des matières illisible** : 200 entrées ne servent à rien.
  → L'index part des **intentions**, pas de la structure des fichiers.
- ⚠️ **Le budget de poids** : ~150 ancres × ~40 octets ≈ 6 Ko bruts. À vérifier
  contre le plafond P8 **avant** de les poser toutes, pas après.

### Preuve de réussite
- [ ] Épreuve à l'aveugle : sur **10 intentions tirées au sort**, l'index mène au
      bon endroit en **≤ 2 sauts**, sans aucune recherche textuelle
- [ ] Toutes les ancres citées existent — contrôle automatique **prouvé faillible**
- [ ] La cartographie ne contient **aucun** extrait de code
- [ ] `node scripts/ci.js` vert, budget P8 non dépassé

---

# PHASE 6 — LES PORTES

### Objectif
Rendre **impossible** — pas « déconseillé » — de refaire les erreurs déjà commises.

### Les portes, par nature
**Exécutables (priorité absolue)** — un contrôle CI qui refuse le passage.
Existent déjà (29 contrôles) : fonction qui grossit (P7), classe fantôme (P1),
budget dépassé (P8), appel vers une fonction inexistante (P1), plafond des
12 fonctions Vercel (`check-functions`), empreintes CSP (`check-csp`)…

**À créer** : bouton désactivé au repos · échec traité comme vide · `where` +
`orderBy` sans index composite · harnais avec chemin absolu · document orphelin ·
second `CLAUDE.md` · classe CSS construite par concaténation traitée comme morte.

**Procédurales (seulement si l'automatisation est impossible)** — une liste
courte. Chaque entrée dit **pourquoi** elle n'est pas automatisable.

### Pièges identifiés
- ⚠️ **La checklist de 30 points n'est jamais déroulée.** → Plafond **7 points**
  procéduraux. Au-delà, c'est qu'il faut automatiser.
- ⚠️ **La porte contournable** ne protège rien. → Toute porte exécutable est dans
  `ci.js`, donc bloquante.
- ⚠️ **La porte non éprouvée** : un contrôle qu'on n'a pas fait échouer ne
  contrôle rien. → **Sabotage obligatoire** pour chaque porte, tracé.
- ⚠️ **La porte trop zélée** : un contrôle qui crie sur du code légitime finit
  désactivé — et emporte avec lui la protection réelle. → Chaque porte doit
  passer **sur le code actuel sans aucune exception ajoutée**. Si elle exige des
  exceptions dès le premier jour, elle est mal conçue et on la reprend.
- ⚠️ **La durée** : 148 ms aujourd'hui. → Plafond fixé à **3 secondes** pour
  `ci.js`. Au-delà, une porte lente part dans le lot complet des harnais.

### Preuve de réussite
- [ ] Chaque nouvelle porte est prouvée faillible par sabotage
- [ ] Aucune porte n'exige d'exception sur le code actuel
- [ ] ≤ 7 points procéduraux, chacun justifié comme non automatisable
- [ ] **Les 5 défauts les plus coûteux de notre historique sont rejoués** : la CI
      doit les **refuser** aujourd'hui
- [ ] `node scripts/ci.js` reste sous 3 s

---

# PHASE 7 — AUDIT LIGNE PAR LIGNE

**Ne commence qu'après les phases 0 à 6.** Auditer sans les instruments, c'est
relire 38 000 lignes sans savoir ce qui est déjà vérifié.

### Volume réel
| Domaine | Lignes |
|---|---|
| `api/` — serveur, argent, sécurité | 7 229 |
| `app.js` | 14 557 |
| `styles.css` | 8 711 |
| `index.html` | 2 236 |
| `scripts/` — CI et audits | 4 592 |
| `sw.js`, `firebase-init.js`, `mfa.js` | 823 |
| **Total** | **~38 148** |

### Découpage en lots — un lot = une session dédiée
| Lot | Périmètre | Pourquoi cet ordre |
|---|---|---|
| 7.1 | `api/_lib/` puis `api/*.js` | l'argent et la sécurité d'abord |
| 7.2 | `app.js` — socle, routeur, catalogue, fiche produit | le cœur commercial |
| 7.3 | `app.js` — panier, paiement, compte, authentification | le chemin de l'argent côté client |
| 7.4 | `app.js` — livraison et livreurs | le plus récent, donc le plus fragile |
| 7.5 | `app.js` — admin, comptabilité, statistiques | ne concerne que l'user |
| 7.6 | `index.html` + `styles.css` | la structure et le visuel |
| 7.7 | `scripts/` — auditer les auditeurs | un contrôle faux est pire que pas de contrôle |

**Question tranchée** : `api/` passe **avant** la livraison, alors même que la
livraison est le code le plus récent. Motif : un défaut dans `api/` touche
l'argent réel de l'user et de ses clients ; un défaut de livraison touche un
parcours qui n'est pas encore ouvert au public.

### Méthode par lot — identique à chaque fois
1. Lecture **exhaustive et séquentielle**, sans saut.
2. Pour chaque bloc : **une fiche** — rôle, entrées/sorties, invariants qu'il
   doit respecter, pièges, couverture de test, défauts constatés.
3. Défauts **classés** : bloquant / réel / cosmétique / faux positif.
4. **Aucune correction pendant l'audit** — sauf le cas critique ci-dessous.
5. Cartographie et graphe **mis à jour au passage**.
6. `docs/AVANCEMENT-FONDATIONS.md` mis à jour **à la fin de chaque session**.

### 🚨 EXCEPTION — le défaut critique trouvé en cours d'audit
La règle « aucune correction pendant l'audit » a **une** exception, et elle est
bornée. Un défaut est **critique** s'il remplit au moins un de ces trois
critères :
- il fait **perdre ou détourner de l'argent** (client ou user) ;
- il **expose des données personnelles** ou permet d'agir au nom d'autrui ;
- il **casse le site en production** (page morte, parcours impossible).

Dans ce cas, et **dans ce cas seulement** :
1. j'**arrête l'audit** et je le signale à l'user immédiatement, avec le scénario
   d'échec concret ;
2. **l'user décide** : corriger tout de suite, ou noter et continuer ;
3. si on corrige : **un commit dédié**, hors du chantier fondations, avec son
   harnais et son sabotage — comme n'importe quel correctif ;
4. je reprends l'audit **exactement où je l'avais laissé** (d'où le point de
   reprise).

Tout le reste — même un défaut « réel » — attend la phase 9. **On ne mélange pas
observer et intervenir**, c'est ainsi qu'un audit devient un chantier sans fin.

### 🎨 CAS PARTICULIER — l'audit de `styles.css` (lot 7.6)
8 711 lignes de CSS ne s'auditent pas comme du code : une règle CSS n'est ni
juste ni fausse en soi, elle l'est **par rapport à ce qui s'affiche**. Une
lecture séquentielle de 8 711 lignes coûterait une session entière pour un
rendement quasi nul.

**Méthode différente, assumée** :
- **inventaire mécanique** : règles mortes (avec la précaution des classes
  construites par concaténation), `!important` restants, doublons de sélecteurs,
  valeurs en dur qui devraient être des tokens ;
- **inspection visuelle ciblée** : captures avant/après sur les 11 routes ×
  2 tailles d'écran, comparaison pixel — l'outil existe déjà
  (`audit-buttons.js`, harnais de captures) ;
- **pas de lecture ligne à ligne** : elle est explicitement **écartée**, avec ce
  motif écrit dans le rapport du lot.

### Pièges identifiés
- ⚠️ **La fatigue de l'auditeur** : après 2 000 lignes, on survole. → Lots bornés,
  une session par lot, compte de lignes réellement lues déclaré à la fin.
- ⚠️ **Le défaut trouvé qu'on corrige tout de suite** → interdiction stricte,
  sauf l'exception ci-dessus.
- ⚠️ **Le faux positif présenté comme un défaut** : ça détruit la confiance dans
  l'audit. → Tout défaut annoncé doit être **démontré** (scénario d'échec
  concret), sinon il est classé « à vérifier », pas « défaut ».
- ⚠️ **L'audit qui redécouvre le connu** : la moitié des défauts trouvés seront
  déjà documentés dans le journal ou déjà couverts par un harnais. → **Avant
  chaque lot**, lire `docs/COUVERTURE.md` pour le périmètre concerné. C'est
  exactement pour ça que la phase 4 passe avant.

### Preuve de réussite par lot
- [ ] Nombre de lignes lues déclaré, cohérent avec le périmètre
- [ ] Une fiche par bloc, aucune zone sans fiche
- [ ] Chaque défaut annoncé porte un scénario d'échec concret
- [ ] Cartographie et graphe mis à jour
- [ ] `docs/AVANCEMENT-FONDATIONS.md` à jour

---

# PHASE 8 — SYNTHÈSE ET PLAN DE DÉCOUPAGE

### Livrables
1. **`docs/SYNTHESE-AUDIT.md`** — état réel du code, défauts par gravité, dette
   assumée et dette à traiter.
2. **`docs/PLAN-DECOUPAGE.md`** — le découpage de `app.js`, **fondé sur le
   graphe** (phase 3), pas sur une intuition : quels modules, dans quel ordre,
   quel gain de poids, quel risque, quels harnais protègent chaque étape.
3. Mise à jour des règles et invariants avec ce que l'audit a appris.
4. **Le carnet de la phase 9** : les défauts, triés par gravité, prêts à être
   priorisés par l'user.

### Preuve de réussite
- [ ] Chaque module proposé au découpage est une **grappe réelle** du graphe
- [ ] Chaque étape de découpage est **réversible** et protégée par des harnais
      existants
- [ ] Le gain de poids est **chiffré**, pas estimé au doigt mouillé
- [ ] Aucun défaut du carnet n'est sans scénario d'échec

---

# PHASE 9 — CORRECTIONS *(la phase que la v1 avait oubliée)*

**La v1 disait « les correctifs sont une phase à part » et ne la créait jamais.**
L'audit produisait donc des défauts, puis s'arrêtait. C'est le défaut le plus
grave de la v1 : un audit sans phase de correction est un rapport, pas un
chantier.

### Ce qui la déclenche
La phase 8 rend un carnet de défauts triés. **L'user choisit ce qui est corrigé
et dans quel ordre.** Je ne décide pas de la priorité : je décris la gravité, il
tranche l'ordre.

### Méthode — inchangée depuis le début du projet
**1 défaut = 1 commit = 1 vérification verte.** Jamais un correctif à moitié
fait, jamais deux défauts dans un commit.

Pour chaque correctif :
1. le scénario d'échec est **rejoué** et échoue (le défaut est réel, ici et
   maintenant) ;
2. le correctif est écrit ;
3. le scénario passe ;
4. un **sabotage** prouve que la vérification est faillible ;
5. `node scripts/ci.js` vert + noyau rapide des harnais vert ;
6. commit, push, et bump du Service Worker si un asset a changé.

### Pièges identifiés
- ⚠️ **Le correctif qui en casse un autre** : c'est le risque n°1 quand on
  corrige 30 défauts d'affilée. → Le **lot complet** des harnais est rejoué tous
  les 5 correctifs, pas seulement à la fin.
- ⚠️ **La correction cosmétique qui passe avant la bloquante** : l'envie de
  commencer par le facile. → L'ordre est celui de l'user, et s'il n'en donne pas,
  c'est bloquant → réel → cosmétique, sans exception.
- ⚠️ **Le défaut qui n'en était pas un** : après quelques semaines, un « défaut »
  de l'audit peut s'avérer être une décision produit oubliée. → Avant de
  corriger, relire le journal sur le sujet. Un correctif qui annule une décision
  de l'user est une régression, pas une amélioration.
- ⚠️ **La dette assumée qu'on ne corrige pas** : certains défauts resteront
  (refactors risqués, `!important`, fonctions XXL). → Ils sont **écrits comme
  assumés**, avec leur motif, dans les règles. Une dette documentée n'est plus
  une dette cachée.

### Preuve de réussite
- [ ] Chaque correctif a son scénario d'échec rejoué **avant** et **après**
- [ ] Chaque nouvelle vérification est prouvée faillible par sabotage
- [ ] Le lot complet des harnais est vert tous les 5 correctifs
- [ ] Les défauts non corrigés sont **écrits comme dette assumée**, avec motif
- [ ] `docs/SYNTHESE-AUDIT.md` est mis à jour : ce qui est soldé, ce qui reste

---

## Ordre d'exécution retenu

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.1 → 7.2 → … → 7.7 → 8 → 9
```

**Pourquoi cet ordre exact :**
- **0 avant tout** : le risque de perte est immédiat et irréversible — les
  harnais critiques sont **hors du dépôt**.
- **1 et 2 avant 3** : il faut savoir ce qu'on cherche à protéger avant de
  cartographier.
- **3 avant 5** : la cartographie s'appuie sur le graphe, pas l'inverse.
- **4 avant 7** : auditer sans connaître la couverture existante fait re-vérifier
  ce qui l'est déjà.
- **6 avant 7** : les portes doivent exister avant l'audit, sinon l'audit
  trouvera des défauts qu'aucune porte n'empêchera de revenir.
- **8 avant 9** : on corrige sur une liste priorisée, pas au fil de l'eau.
- **9 en dernier** : corriger avant d'avoir tout vu, c'est corriger deux fois.

---

## Ce qui n'est PAS dans ce plan — décisions déjà prises
- ❌ **Minification** : écartée par l'user (28/07/2026). Motif : ajoute une étape
  de fabrication entre le `git push` et le site, donc un risque, pour un gain sur
  un poids déjà bon (309 Ko au premier chargement, ~8× moins que la médiane
  e-commerce).
- ❌ **Refonte d'architecture avant lancement** : écartée. Le découpage sera
  incrémental, fondé sur le graphe, module par module.
- ❌ **Correction des défauts pendant l'audit** : phase 9 séparée, priorisée par
  l'user — avec la seule exception du **défaut critique** (phase 7).
- ❌ **Blocage du lancement commercial** : ce chantier est indépendant de la
  checklist de lancement et ne la retarde pas.

---

## Annexe — les commandes qui produisent les chiffres de ce document
*(principe P-C : un chiffre sans sa commande est une opinion)*

```bash
# harnais et assertions dans un scratchpad
for f in *.mjs *.js; do n=$(grep -cE "(^|[^a-zA-Z_.\"'])(T|ok|assert|check|expect)\(" "$f"); \
  [ "$n" -ge 5 ] && echo "$n|$f"; done | sort -rn

# le scratchpad du dépôt est ignoré, et par quelle règle
git check-ignore -v pirates-tools/scratchpad/audit2.mjs

# nombre de contrôles enchaînés par la CI, et durée
grep -c "await runOne" pirates-tools/scripts/ci.js
node pirates-tools/scripts/ci.js | tail -1

# documents orphelins
ls pirates-tools/docs/*.md | wc -l
grep -oE "docs/[A-Za-z0-9._-]+\.md" CLAUDE.md | sort -u | wc -l

# volume du code
wc -l pirates-tools/app.js pirates-tools/styles.css pirates-tools/index.html
find pirates-tools/api -name '*.js' | xargs wc -l | tail -1
```
