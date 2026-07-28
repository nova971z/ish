# PLAN FONDATIONS — Pirates Tools
## Construire les instruments avant d'auditer

> **État : PLAN SOUMIS À VALIDATION. Rien n'est appliqué.**
> Rédigé le 28/07/2026. À relire et amender par l'user avant exécution.

---

## Pourquoi ce chantier

Le site fonctionne et il est protégé (10 contrôles automatiques, ~500
assertions de harnais). Mais **trois faiblesses structurelles** coûtent cher :

| # | Faiblesse | Conséquence concrète, mesurée |
|---|---|---|
| F1 | Les harnais de test vivent dans un dossier **temporaire** (`scratchpad/` est dans `.gitignore`, **0 fichier versionné**) | un recyclage du conteneur détruit ~500 assertions et la capacité de vérifier les non-régressions |
| F2 | La mémoire projet est un **journal chronologique de 1 499 lignes** | pour retrouver une règle, il faut traverser l'historique ; je relis donc du contexte inutile à chaque session |
| F3 | Aucun **graphe d'appels** | pour savoir ce qu'une modification casse, je dois chercher les appelants ; c'est aussi ce qui interdit tout découpage sûr de `app.js` |

**Objectif du chantier** : qu'avant même de lire une ligne de code, je sache
*où aller*, *ce que je risque de casser*, et *ce qui est déjà vérifié*.

## Les deux principes non négociables

**P-A — Une documentation non vérifiée est un mensonge en préparation.**
Chaque document produit ici doit avoir un contrôle automatique qui échoue quand
il se désynchronise du code. Un numéro de ligne cité, une fonction nommée, un
harnais référencé : tout doit être validé mécaniquement. Sinon on fabrique une
carte qui envoie dans le mur au bout de trois semaines.

**P-B — Ce qui peut être exécuté ne doit pas être écrit.**
Une règle dans un fichier est une règle qu'on peut oublier. Une règle dans la CI
est une règle qui bloque. On n'écrit une règle en prose que lorsqu'elle est
réellement inautomatisable — et on le justifie alors explicitement.

## Critère de réussite global

À la fin, une seule question tranche : **« Combien de fichiers dois-je ouvrir
pour savoir où intervenir sur un sujet donné ? »**
Aujourd'hui : 3 à 6 (mémoire + cartographie + recherche + code).
Cible : **1** (l'index), puis directement le bon endroit du code.

---

# PHASE 0 — SAUVER LES HARNAIS

**Le risque est immédiat. Rien d'autre ne commence avant.**

### Ce qui est en jeu
125 fichiers de vérification dans un dossier temporaire, dont **tous ceux qui
protègent la chaîne livraison, les paiements et la 2FA**. `scratchpad/` est
ignoré par git — vérifié : `.gitignore:24`, et `git ls-files scratchpad/`
renvoie **0**.

### Livrables
1. **`tests/`** — un dossier VERSIONNÉ, remplaçant le scratchpad temporaire
   pour tout ce qui est un harnais de vérification.
2. **Tri explicite** : ce qui est un test durable (à versionner) vs un
   outil jetable d'investigation (à laisser mourir). Le tri est écrit, pas
   implicite.
3. **`tests/lancer.mjs`** — un lanceur unique qui exécute tous les harnais et
   rend un compte-rendu global (total, échecs, durée).
4. **Suppression de `scratchpad/` du `.gitignore`** OU exception explicite
   pour `tests/` — décision tracée.

### Pièges identifiés — à traiter, pas à découvrir
- ⚠️ **Chemins absolus** : les harnais contiennent des chemins en dur vers
  `/tmp/claude-0/…` et `/home/user/ish/pirates-tools`. Versionnés tels quels,
  ils casseront ailleurs. → Tous les chemins doivent devenir **relatifs au
  dépôt**.
- ⚠️ **Playwright en dur** : `import '/opt/node22/lib/node_modules/playwright/index.js'`.
  Même problème. → Résolution par un module partagé, avec un message clair si
  Playwright est absent (et non un plantage cryptique).
- ⚠️ **Doublons** : plusieurs harnais testent la même chose (`plan7`/`plan8`
  se recouvrent partiellement). Les versionner tels quels fige la redondance.
  → Recensement des recouvrements AVANT versionnement.
- ⚠️ **Harnais périmés** : certains encodent des specs que l'user a renversées
  depuis. Un test faux est pire qu'un test absent. → Chacun doit passer AVANT
  d'être versionné ; ceux qui échouent sont soit corrigés, soit supprimés avec
  motif écrit.
- ⚠️ **Durée totale** : ~15 harnais Playwright à ~40 s = 10 min. Trop long pour
  un lancement systématique. → Séparer un **noyau rapide** d'un **lot complet**.
- ⚠️ **Poids déployé** : `tests/` ne doit JAMAIS partir sur Vercel
  (`.vercelignore`) ni entrer dans le Service Worker.

### Preuve de réussite — mesurable, pas déclarative
- [ ] `git ls-files tests/ | wc -l` > 0 (les tests sont réellement commités)
- [ ] `node tests/lancer.mjs` s'exécute **depuis un dépôt fraîchement cloné**,
      sans aucun chemin absolu — vérifié par `grep -r "/tmp/\|/home/user" tests/`
      qui doit rendre **0 résultat**
- [ ] Le compte-rendu affiche un total ≥ 500 assertions et **0 échec**
- [ ] Un contrôle CI refuse tout nouveau harnais contenant un chemin absolu
- [ ] `tests/` absent du build Vercel (vérifié dans `.vercelignore`)

---

# PHASE 1 — ARCHITECTURE DOCUMENTAIRE

### Le problème exact
`CLAUDE.md` = 1 499 lignes de journal chronologique. Et un
`CLAUDE_PIRATESTOOLS.md` **ne serait pas lu automatiquement** : seul `CLAUDE.md`
l'est. Écrire des règles ailleurs sans aiguillage = écrire des règles mortes.

### Structure cible

| Fichier | Nature | Taille visée | Lu quand |
|---|---|---|---|
| `CLAUDE.md` (racine) | **aiguillage** : quoi lire selon la tâche | ≤ 80 lignes | automatiquement, toujours |
| `docs/REGLES-PIRATESTOOLS.md` | **règles impératives** du site | ≤ 300 lignes | dès qu'on touche au site |
| `docs/INVARIANTS.md` | **vérités inviolables** (phase 2) | ≤ 120 lignes | avant toute modification |
| `docs/JOURNAL.md` | **historique** : pourquoi on en est là | libre | seulement en cas de doute |
| `docs/CARTOGRAPHIE.md` | **où est quoi** (phase 5) | libre | avant d'intervenir |

### Règle de tri — appliquée sans exception
- **Impératif au présent** (« le prix vient toujours du serveur ») → RÈGLES
- **Récit au passé** (« le 26/07 on a découvert que… ») → JOURNAL
- **Localisation** (« lvPanelPay est à app.js:6013 ») → CARTOGRAPHIE
- **Vérité absolue et testable** → INVARIANTS

### Pièges identifiés
- ⚠️ **La perte d'information** : découper 1 499 lignes, c'est risquer de
  perdre une leçon durement acquise. → **Aucune suppression** dans cette phase :
  uniquement des déplacements. Contrôle : la somme des lignes des nouveaux
  fichiers ≥ l'original, hors reformulations tracées.
- ⚠️ **L'aiguillage qui n'aiguille pas** : si `CLAUDE.md` dit juste « voir les
  docs », je ne saurai pas lequel ouvrir. → Il doit être une **table de
  décision** : *tu touches à l'argent → lis X* ; *tu touches à la livraison →
  lis Y*.
- ⚠️ **Le fichier orphelin** : un document non référencé n'est jamais lu.
  → Un contrôle CI vérifie que **chaque fichier de `docs/` est cité** au moins
  une fois depuis l'aiguillage, directement ou en cascade.
- ⚠️ **Le bot Discord** : `CLAUDE.md` contient des acquis de méthode issus
  d'un autre projet. Ils ont de la valeur. → Ils vont dans un
  `docs/METHODE-TRAVAIL.md` **transférable**, pas dans les règles du site.

### Preuve de réussite
- [ ] `CLAUDE.md` ≤ 80 lignes et ne contient **aucune** règle métier
      (uniquement des renvois)
- [ ] Chaque fichier de `docs/` est atteignable depuis `CLAUDE.md` — contrôle
      automatique qui échoue sur un orphelin
- [ ] Contrôle automatique : aucune date ni aucun verbe au passé dans le
      fichier de RÈGLES (heuristique, avec liste d'exceptions justifiées)
- [ ] Relecture de contrôle : je réponds à « quelle est la règle sur les prix
      produits ? » en ouvrant **≤ 2 fichiers**

---

# PHASE 2 — REGISTRE DES INVARIANTS

### Objectif
Extraire les vérités qui ne doivent **jamais** être violées, quel que soit le
contexte, et **les rendre exécutables** partout où c'est possible (P-B).

### Candidats déjà identifiés dans l'histoire du projet
| Invariant | Automatisable ? | Contrôle existant |
|---|---|---|
| Le prix débité vient TOUJOURS du catalogue serveur | oui | `check-pricing.js`, `p5-money` |
| Un échec réseau n'est JAMAIS traité comme un résultat vide | partiellement | aucun — **à créer** |
| Jamais de bouton désactivé comme état de repos | oui (statique) | aucun — **à créer** |
| On ne se fie jamais au retour d'une écriture : on relit | non (procédural) | prose + revue |
| Une vérification qu'on ne peut pas faire échouer ne vérifie rien | non (procédural) | prose + sabotage obligatoire |
| Aucun secret serveur côté client | oui | `p3-endpoints` partiel |
| Toute requête `where` + `orderBy` sur 2 champs exige un index | oui (statique) | aucun — **à créer** |
| L'interface n'est jamais la sécurité : le serveur revérifie | partiellement | `p3-dispatch-live` |

### Pièges identifiés
- ⚠️ **L'invariant creux** : « le code doit être propre » n'est pas un
  invariant, c'est un vœu. → Critère d'admission : un invariant doit pouvoir
  être **violé de façon démontrable**. S'il est invérifiable, il n'entre pas.
- ⚠️ **Le faux invariant** : une règle vraie 95 % du temps crée des exceptions
  silencieuses. → Chaque invariant liste ses **exceptions légitimes**
  nommément, ou il n'en a aucune.
- ⚠️ **L'inflation** : 40 invariants = 0 invariant respecté. → Plafond **15**,
  et pour en ajouter un, il faut en retirer un ou justifier le dépassement.

### Preuve de réussite
- [ ] Chaque invariant du registre est soit couvert par un contrôle automatique,
      soit explicitement marqué « procédural » avec la raison de sa
      non-automatisation
- [ ] Chaque nouveau contrôle créé est **prouvé faillible** (sabotage délibéré,
      selon notre règle)
- [ ] Le registre tient en ≤ 120 lignes

---

# PHASE 3 — GRAPHE DE DÉPENDANCES

### Objectif
Répondre en une seconde à : *« si je modifie cette fonction, qu'est-ce que je
casse ? »* — et **rendre le découpage de `app.js` possible sans deviner**.

### Livrables
1. **`scripts/graphe.js`** — outil qui analyse `app.js` (déjà parsé par
   `p1-static`, donc l'infrastructure existe) et produit :
   - pour chaque fonction : ses **appelants** et ses **appelées**
   - les **grappes** : ensembles de fonctions qui ne se parlent qu'entre elles
     (= candidats naturels à l'extraction en module)
   - les **points de passage** : fonctions appelées de partout (toucher à
     `escapeHTML` ou `apiBaseUrl` a un effet global)
   - les **orphelines** : jamais appelées (code mort réel)
2. **`docs/GRAPHE.md`** — la sortie lisible, régénérable par commande.

### Pièges identifiés
- ⚠️ **Appels indirects** : `onclick`, `addEventListener`, tableaux de
  fonctions, `data-*` + délégation. Un graphe qui les ignore mentirait par
  omission. → L'outil doit **signaler ses angles morts** plutôt que les taire.
- ⚠️ **Homonymes** : plusieurs `showDetail` existent dans des portées
  différentes (constaté). Les confondre produirait un graphe faux. → Résolution
  par portée, pas par nom.
- ⚠️ **La photo périmée** : un graphe généré une fois se désynchronise.
  → Régénérable en une commande, et un contrôle CI vérifie que le fichier
  committé correspond au code actuel.
- ⚠️ **L'illusion de complétude** : un graphe propre donne l'impression de tout
  savoir. → Il affiche explicitement son taux de couverture et ce qu'il n'a
  pas pu résoudre.

### Preuve de réussite
- [ ] `node scripts/graphe.js --qui-appelle lvPanelPay` liste les appelants
      réels, vérifiés à la main sur 5 cas tirés au hasard
- [ ] Les grappes proposées sont cohérentes avec les domaines métier
      (livraison, admin, catalogue…) — sinon l'analyse est à revoir
- [ ] Les fonctions orphelines détectées sont réellement mortes (vérification
      manuelle exhaustive : c'est du code qu'on va supprimer)
- [ ] Un contrôle CI échoue si `docs/GRAPHE.md` n'est plus à jour

---

# PHASE 4 — CATALOGUE DES HARNAIS

### Objectif
Savoir **ce qui est déjà vérifié**, pour ne pas re-tester l'existant ni croire
couvert ce qui ne l'est pas.

### Livrable
**`docs/COUVERTURE.md`**, **généré** (jamais écrit à la main) :
- un harnais = son intitulé, son nombre d'assertions, le comportement couvert
- l'index inverse : *pour le sujet « paiement », les harnais concernés sont…*
- les **zones sans aucune couverture** — l'information la plus précieuse

### Pièges identifiés
- ⚠️ **Écrit à la main = périmé en une semaine.** → Généré depuis les intitulés
  réels des assertions.
- ⚠️ **Compter les assertions n'est pas mesurer la couverture** : 70 assertions
  sur un bouton et 0 sur le paiement donnent un beau total et une protection
  nulle. → Le catalogue affiche la couverture **par domaine**, pas un total.
- ⚠️ **Le harnais vert qui ne teste rien** : déjà rencontré (faux vert dû à un
  503 en amont). → Marquer les harnais dont la faillibilité a été **prouvée par
  sabotage**, et signaler les autres comme non éprouvés.

### Preuve de réussite
- [ ] `docs/COUVERTURE.md` est régénérable en une commande
- [ ] Il nomme au moins 3 zones non couvertes (s'il n'en trouve aucune, il
      mesure mal — le site n'est pas couvert à 100 %)
- [ ] Chaque harnais indique s'il a été éprouvé par sabotage

---

# PHASE 5 — SOMMAIRE ET CARTOGRAPHIE MAXIMALE

### Objectif
**L'instrument que l'user demande** : savoir où intervenir sans chercher.

### Livrables
1. **`docs/INDEX.md`** — l'entrée unique. Table à trois colonnes :
   *« je veux faire X »* → *fichier + ligne* → *contrôles et harnais qui
   protègent cette zone*.
2. **`docs/CARTOGRAPHIE.md` refondue** (28,8 Ko existants à reprendre) :
   plan de chaque fichier, par zones numérotées, avec bornes de lignes.
3. **Ancres stables** : des marqueurs en commentaire dans le code
   (`// ══ ZONE : PAIEMENT ══`) auxquels la cartographie se réfère — **plus
   robustes qu'un numéro de ligne**, qui se décale à chaque modification.

### Pièges identifiés
- ⚠️ **Les numéros de ligne mentent dès le commit suivant.** C'est le défaut
  principal de la cartographie actuelle. → Ancres nommées + contrôle CI qui
  vérifie que chaque ancre citée **existe encore**.
- ⚠️ **La carte qui duplique le code** : si la cartographie explique *comment*
  ça marche, elle deviendra fausse. → Elle dit **où** et **quels pièges**,
  jamais *comment* : le comment est dans le code, seule source de vérité.
- ⚠️ **La table des matières illisible** : 200 entrées ne servent à rien.
  → L'index part des **intentions** (« modifier un prix », « ajouter un champ à
  la commande »), pas de la structure des fichiers.

### Preuve de réussite
- [ ] Épreuve à l'aveugle : sur **10 intentions** tirées au sort, l'index mène
      au bon endroit du code en **≤ 2 sauts**, sans aucune recherche textuelle
- [ ] Toutes les ancres citées existent — contrôle automatique
- [ ] La cartographie ne contient **aucun** extrait de code (elle localise,
      elle n'explique pas)

---

# PHASE 6 — LES PORTES

### Objectif
Rendre **impossible** — pas « déconseillé » — de refaire les erreurs déjà
commises.

### Les portes, par nature
**Exécutables (priorité absolue)** — un contrôle CI qui refuse le passage.
Existent déjà : fonction qui grossit (P7), classe fantôme (P1), budget dépassé
(P8), appel vers une fonction inexistante (P1).
**À créer** : bouton désactivé au repos · échec traité comme vide ·
`where` + `orderBy` sans index · harnais avec chemin absolu · document orphelin.

**Procédurales (seulement si l'automatisation est impossible)** — une liste
courte, à dérouler avant de livrer. Chaque entrée doit dire **pourquoi** elle
n'est pas automatisable.

### Pièges identifiés
- ⚠️ **La checklist de 30 points n'est jamais déroulée.** → Plafond **7 points**
  procéduraux. Au-delà, c'est qu'il faut automatiser.
- ⚠️ **La porte contournable** ne protège rien. → Toute porte exécutable doit
  être dans `ci.js`, donc bloquante.
- ⚠️ **La porte non éprouvée** : un contrôle qu'on n'a pas fait échouer ne
  contrôle rien. → **Sabotage obligatoire** pour chaque porte créée, tracé.

### Preuve de réussite
- [ ] Chaque nouvelle porte exécutable est prouvée faillible par sabotage
- [ ] ≤ 7 points procéduraux, chacun justifié comme non automatisable
- [ ] Les 5 défauts les plus coûteux de notre historique sont rejoués : la CI
      doit les **refuser** aujourd'hui

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
| 7.6 | `styles.css` + `index.html` | le visuel et la structure |
| 7.7 | `scripts/` — auditer les auditeurs | un contrôle faux est pire que pas de contrôle |

### Méthode par lot — identique à chaque fois
1. Lecture **exhaustive et séquentielle**, sans saut.
2. Pour chaque bloc : **une fiche** — rôle, entrées/sorties, invariants qu'il
   doit respecter, pièges, couverture de test, défauts constatés.
3. Les défauts sont **classés** : bloquant / réel / cosmétique / faux positif.
4. **Aucune correction pendant l'audit** — sinon on ne finit jamais et on mélange
   observation et intervention. Les correctifs sont une phase à part, priorisée
   par l'user.
5. La cartographie et le graphe sont **mis à jour au passage** (l'audit les
   affine).

### Pièges identifiés
- ⚠️ **La fatigue de l'auditeur** : après 2 000 lignes, on survole. → Lots
  bornés, une session par lot, et le compte de lignes réellement lues est
  déclaré à la fin de chaque lot.
- ⚠️ **Le défaut trouvé qu'on corrige tout de suite** : c'est ainsi qu'un audit
  devient un chantier sans fin. → Interdiction stricte (point 4).
- ⚠️ **Le faux positif présenté comme un défaut** : ça détruit la confiance
  dans l'audit. → Tout défaut annoncé doit être **démontré** (scénario d'échec
  concret), sinon il est classé « à vérifier », pas « défaut ».

### Preuve de réussite par lot
- [ ] Nombre de lignes lues déclaré, cohérent avec le périmètre
- [ ] Une fiche par bloc, aucune zone sans fiche
- [ ] Chaque défaut annoncé porte un scénario d'échec concret
- [ ] Cartographie et graphe mis à jour

---

# PHASE 8 — SYNTHÈSE ET PLAN DE DÉCOUPAGE

### Livrables
1. **`docs/SYNTHESE-AUDIT.md`** — état réel du code, défauts par gravité,
   dette assumée et dette à traiter.
2. **`docs/PLAN-DECOUPAGE.md`** — le découpage de `app.js`, **fondé sur le
   graphe** (phase 3), pas sur une intuition : quels modules, dans quel ordre,
   quel gain de poids, quel risque, quels harnais protègent chaque étape.
3. Mise à jour des règles et invariants avec ce que l'audit a appris.

### Preuve de réussite
- [ ] Chaque module proposé au découpage est une **grappe réelle** du graphe
- [ ] Chaque étape de découpage est **réversible** et protégée par des harnais
      existants
- [ ] Le gain de poids est **chiffré**, pas estimé au doigt mouillé

---

## Ordre d'exécution retenu

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.1 → 7.2 → … → 7.7 → 8
```

**Pourquoi cet ordre exact :**
- **0 avant tout** : le risque de perte est immédiat et irréversible.
- **1 et 2 avant 3** : il faut savoir ce qu'on cherche à protéger avant de
  cartographier.
- **3 avant 5** : la cartographie s'appuie sur le graphe, pas l'inverse.
- **4 avant 7** : auditer sans connaître la couverture existante fait
  re-vérifier ce qui l'est déjà.
- **6 avant 7** : les portes doivent exister avant l'audit, sinon l'audit
  trouvera des défauts qu'aucune porte n'empêchera de revenir.
- **8 en dernier** : le découpage exige le graphe **et** l'audit.

## Ce qui n'est PAS dans ce plan — décisions déjà prises
- ❌ **Minification** : écartée par l'user (28/07/2026). Motif : ajoute une
  étape de fabrication entre le `git push` et le site, donc un risque, pour un
  gain sur un poids déjà bon (309 Ko au premier chargement, ~8× moins que la
  médiane e-commerce).
- ❌ **Refonte d'architecture avant lancement** : écartée. Le découpage sera
  incrémental, fondé sur le graphe, module par module.
- ❌ **Correction des défauts pendant l'audit** : phase séparée, priorisée par
  l'user.
