# PLAN FONDATIONS — Pirates Tools
## Construire les instruments avant d'auditer

> **État : PLAN v5 — SOUMIS À VALIDATION. Rien n'est appliqué.**
> v1 le 28/07/2026 · **v2** après vérification par mesure ·
> **v3** après recherche documentaire extérieure et réponse à la proposition
> de numérotation des lignes ·
> **v4** après la demande d'un **système entonnoir** : numérotation par zones
> qui se réajuste toute seule, et recherche qui converge mécaniquement ·
> **v5** après relecture ligne à ligne du plan par lui-même : **26 défauts**
> corrigés, dont **3 graves** (un `git add` de 110 Mo, un bump de Service Worker
> oublié, une contradiction interne qui autorisait et interdisait la même chose).
> À relire et amender par l'user avant exécution.

---

## 🔎 CE QUE LA RELECTURE LIGNE À LIGNE A TROUVÉ DANS LA v4 (v5, 28/07/2026)

Le plan a été relu **ligne par ligne contre le code réel**. **26 défauts**, dont
**3 qui auraient pu abîmer le dépôt ou le site** s'ils avaient été exécutés tels
quels. Tous corrigés dans cette version.

| Gravité | Défaut | Où c'est traité |
|---|---|---|
| 🔴 | « versionner `_gltftools/` » aurait commité **110 Mo de `node_modules`** — et git n'oublie jamais | phase 0, encadré « DANGER MESURÉ » |
| 🔴 | poser les ancres modifie `app.js` → **bump du Service Worker obligatoire**, jamais mentionné. Deux pannes réelles du projet viennent de là (écran noir v314, mélange stale/frais v374) | phase 5, encadré « LE GESTE QUI PEUT CASSER LE SITE » |
| 🔴 | **contradiction interne** : la phase 3 devait supprimer du code, la règle de réversibilité l'interdisait | § Réversibilité, tableau des deux exceptions |
| 🟠 | **E3 était infaisable** : `app.js` est un IIFE unique, ses 8 lignes d'enveloppe n'appartiennent à aucune zone → le contrôle aurait toujours échoué | Entonnoir §5, zone `SOC-00` |
| 🟠 | **trois exemples chiffrés inventés** (`lvPanelAccord` est à 6167, pas 6012–6118 ; `course-goods-paid` à 1030, pas 412–470) — dans un plan qui pose P-A | §numérotation, Entonnoir §3, phase 7 |
| 🟠 | deux chiffres **déjà corrigés en conversation** traînaient encore : « 309 Ko » et « ~8× moins que la médiane » | § décisions déjà prises |
| 🟠 | le **hook n'avait pas d'adresse** : posé dans `settings.local.json`, il ne protégerait qu'une machine | phase 6 |
| 🟡 | 9 inexactitudes : « 28ᵉ fichier » (il y en a 29), « sept trous » (neuf), « quatre erreurs » (trois), 19-27 sessions (19-26), `docs/` 292 Ko (348), cartographie 29,5 Ko (32), un piège écrit **deux fois**, deux formulations périmées | partout |
| ⚪ | 3 manques : les **décisions en suspens** n'existaient nulle part, le plan **ne se rangeait pas lui-même**, l'annexe P-C ne couvrait pas ses propres chiffres | § EN SUSPENS, phase 1, annexe |

---

## ⚠️ CE QUE LA RELECTURE AVAIT DÉJÀ CORRIGÉ DANS LA v1

J'ai passé la v1 au même régime que le code : chaque chiffre re-mesuré par une
commande. **Trois affirmations étaient fausses**, et une quatrième ligne (E4)
n'était pas une erreur de la v1 mais une information neuve — elle est marquée
comme telle, parce que s'attribuer une faute qu'on n'a pas commise est encore
une inexactitude. C'est ce constat qui a fait naître le principe P-C.

| # | Ce que la v1 affirmait | Ce que la mesure dit | Conséquence |
|---|---|---|---|
| E1 | « 125 fichiers de vérification » | **284 fichiers**, dont **60 vrais harnais** (~959 assertions) et **224 outils jetables** | le tri de la phase 0 change d'échelle : on versionne 60 fichiers, pas 125 |
| E2 | « `scratchpad/` est dans `.gitignore` » | vrai **mais incomplet** : il y a **DEUX** scratchpads, et le plus important est **hors du dépôt** | le risque est plus grave que décrit — voir F1 |
| E3 | « 10 contrôles automatiques » | **29 contrôles** enchaînés par `ci.js` | la couverture existante est bien meilleure que je ne le disais |
| E4 *(pas une erreur : mesure neuve)* | la v1 ne parlait que de la durée des **harnais** | la CI, elle, prend **148 ms** (1,7 s avec le démarrage de node) | aucun budget de durée à défendre côté CI ; le coût est **uniquement** dans les harnais Playwright |

**Une erreur de la v1 n'a PAS été corrigée mais précisée** : l'invariant
« `where` + `orderBy` exige un index » était marqué « aucun contrôle — à créer ».
C'est exact, mais `scripts/check-firestore-queries.js` **existe déjà** et couvre
une règle voisine (refus du *descending key scan*). → On l'**étend**, on ne crée
pas un 30ᵉ fichier (il y en a déjà 29).

---

## 📚 CE QUE LA RECHERCHE EXTÉRIEURE A CORRIGÉ DANS LA v2

La v2 avait été vérifiée **contre le code**. Elle n'avait pas été vérifiée
**contre l'état de l'art**. **Neuf** constats en sont sortis (R1 → R9), dont trois changent le
plan en profondeur. Les sources sont en annexe.

### R1 — 🔴 L'aiguillage documentaire peut être MÉCANIQUE, pas déclaratif

La v2 pariait sur ma discipline : « `CLAUDE.md` te dit quel document ouvrir,
tu l'ouvres ». C'est un vœu, pas une porte — exactement ce que P-B interdit.

La documentation officielle décrit `.claude/rules/` avec un en-tête `paths:` :
une règle ainsi étiquetée **se charge toute seule quand je lis un fichier
correspondant**. Concrètement :

```yaml
---
paths: ["api/**/*.js"]
---
# Règles serveur : l'argent, l'authentification, les taux
```

→ dès que j'ouvre `api/contact.js`, les règles serveur entrent en contexte
**sans que personne ait à y penser**. C'est P-B appliqué à la documentation
elle-même. **La v2 aurait construit un aiguillage qu'on peut rater.**

### R2 — 🔴 Découper `CLAUDE.md` avec des `@imports` ne gagne RIEN

Je m'apprêtais à recommander des imports `@docs/…`. La doc est formelle : les
fichiers importés **sont chargés au lancement et entrent dans le contexte**.
Un import ne réduit donc pas le poids : il le déplace. Le seul vrai gain vient
de `.claude/rules/` avec `paths:` (chargement conditionnel) ou de documents
**non importés**, que j'ouvre à la demande.
→ **Correction** : aucun `@import` dans le `CLAUDE.md` cible. L'aiguillage
nomme les fichiers **entre accents graves** (ce qui empêche justement l'import).

### R3 — 🔴 Une règle dans `CLAUDE.md` n'est PAS une porte

La doc le dit sans détour : ces fichiers sont du **contexte**, pas de la
configuration ; il n'y a **aucune garantie** de respect strict, et pour bloquer
une action il faut un **hook** ou un contrôle exécuté.
→ **Correction de la phase 6** : une consigne écrite est un rappel, jamais une
porte. Les seules portes sont `ci.js` et les hooks. Le plan disait déjà
« exécutable avant tout » — désormais il dit **pourquoi**, avec la source.

### R4 — 🟠 Les décisions renversées se contredisent en silence

La doc avertit : **deux consignes qui se contredisent → j'en choisis une au
hasard.** Or notre mémoire contient au moins cinq décisions renversées qui
cohabitent avec leur version d'origine (promos interdites → autorisées sous
traqueur ; bandeau cookies masqué → affiché ; fiche auto-ouverte → signet ;
sélecteur de rôle ajouté → supprimé ; SMS → abandonné). Le journal les raconte
toutes, **sans marquer laquelle gagne**.

La pratique établie pour ça s'appelle **ADR** (*Architecture Decision Record*) :
une décision acceptée n'est **jamais réécrite**, elle est **remplacée**
(`superseded by #N`), et les deux restent liées. On garde l'histoire **et** on
sait qui fait foi.
→ **Nouveau livrable en phase 1** : `docs/DECISIONS.md`, une décision par
entrée, avec un statut **ACTIVE / REMPLACÉE PAR #N**. C'est ce qui manquait
pour que le journal cesse d'être ambigu.

### R5 — 🟠 Notre « sabotage » a un nom, une littérature et une mesure

Ce qu'on appelle sabotage depuis des semaines s'appelle **mutation testing** :
on introduit un défaut (*mutant*), et un test qui échoue a « **tué le mutant** ».
La qualité d'une suite se mesure en **score de mutation** = mutants tués /
mutants introduits.
→ **Amélioration des phases 4 et 6** : on ne dit plus « éprouvé par sabotage »
(oui/non), on affiche **un score par domaine**. « 6 sabotages, 6 détectés » sur
la livraison et « 0/0 » sur l'admin, ce n'est pas la même protection — et
aujourd'hui le plan les afficherait pareil.

### R6 — 🟠 Il manque les tests qui figent le comportement ACTUEL

Nos harnais testent ce que le site **doit** faire. Pour découper `app.js` sans
rien casser, il faut l'inverse : des tests qui figent ce qu'il **fait
aujourd'hui**, correct ou non. Ça s'appelle un **test de caractérisation**
(ou *golden master*) : on ne juge pas, on épingle.
→ **Nouveau prérequis avant tout découpage** (phase 8) : pour chacune des
11 routes, on capture le rendu produit et on exige qu'il soit **identique**
après extraction. L'outillage de comparaison existe déjà (harnais de captures
et comparaison de pixels des sessions précédentes).

### R7 — 🟢 L'émulateur Firestore est structurellement aveugle aux index

Confirmation par la documentation Google : **l'émulateur ne suit pas les index
composites et exécute n'importe quelle requête valide** ; il est explicitement
recommandé de tester contre une vraie instance. Nos **78/78 assertions
d'émulateur** ne peuvent donc **jamais** attraper un index manquant.
→ Ce n'est plus une intuition tirée d'un incident, c'est un fait documenté :
l'invariant « `where` + `orderBy` exige un index » **doit** être un contrôle
statique, parce qu'aucun test ne le trouvera.

### R8 — 🟢 Deux détails utiles, gratuits

- Les **commentaires HTML de bloc** (`<!-- … -->`) sont **retirés avant
  chargement** de `CLAUDE.md` : on peut y laisser des notes de maintenance
  **sans qu'elles coûtent un octet de contexte**.
- La commande **`/doctor`** propose des coupes sur un `CLAUDE.md` versionné :
  elle retire ce que je peux déduire du code et garde les pièges et les
  raisons. → À passer **au début de la phase 1**, avant de trier à la main.

### R9 — ⚪ Le quadrant manquant de la structure documentaire

Le cadre **Diátaxis** distingue quatre besoins : apprendre, faire, chercher un
fait, **comprendre**. La v2 couvrait « faire » (règles), « chercher » (carto,
invariants) et l'histoire — mais **rien n'explique comment le système
fonctionne aujourd'hui**, et la v2 l'interdisait même à la cartographie.
→ **Ajout borné** : `docs/FONCTIONNEMENT.md`, limité aux **4 flux critiques**
(achat d'un outil · demande de livraison · accord et règlement · administration),
écrit pour un lecteur non développeur. Borné à 4, sinon il devient une seconde
cartographie qui se périme.

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

Corollaire mesuré : `docs/` contient **17 fichiers (348 Ko)**, dont **6
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

## 📏 NUMÉROTER CHAQUE LIGNE DU CODE — proposition de l'user, réponse mesurée

> Proposition (28/07/2026) : *« lors de l'audit on devrait numéroter chaque ligne
> du code, ce qui te permettrait de te repérer et d'agrémenter la cartographie
> correctement. »*

**Le besoin est juste et il est même le cœur du problème.** La réponse se
sépare en deux : **écrire** les numéros dans le fichier = non, et voici les
chiffres ; **s'appuyer** sur des numéros exacts et vérifiables = oui, et c'est
adopté sous trois formes concrètes.

### ❌ Ce qu'il ne faut PAS faire : inscrire les numéros dans le code

Test réel : `awk '{printf "/*%d*/%s\n", NR, $0}' app.js` — chaque ligne
préfixée de son numéro en commentaire.

| | `app.js` actuel | `app.js` numéroté |
|---|---|---|
| brut | 744 342 o (727 Ko) | 864 249 o (844 Ko) |
| **compressé — ce que le client télécharge** | **205,0 Ko** | **250,3 Ko** |
| plafond P8 | 205 Ko | 205 Ko |
| verdict | marge : **0** | **dépassement : +45,3 Ko** |

⚠️ *Deux outils donnent deux chiffres différents pour le même fichier :
`gzip -9` en ligne de commande rend 204,1 Ko, `zlib.gzipSync` niveau 9 rend
205,0 Ko. **C'est le second qui fait foi**, parce que c'est celui que le
contrôle P8 exécute. La v4 citait les deux sans le dire, et annonçait donc une
marge de 0,9 Ko là où elle est nulle.*

**Quatre raisons de refuser, par ordre de gravité :**

1. **+45 Ko compressés téléchargés par chaque client, à chaque visite.**
   Ce sont **120 000 octets bruts de commentaires** que le navigateur doit
   télécharger, décompresser et analyser — **pour zéro bénéfice utilisateur**.
   Et tu navigues en privé : rien n'est mis en cache, c'est retéléchargé à
   chaque fois. Ce serait le plus gros ajout de poids de l'histoire du site,
   au bénéfice exclusif de mon confort de lecture.
2. **Les numéros seraient faux dès la première modification.** Insérer une seule
   ligne au milieu rend faux les 10 000 numéros du dessous. C'est **exactement**
   le défaut qu'on cherche à corriger dans la cartographie actuelle — on le
   reproduirait, en pire, parce qu'il serait écrit dans le code.
3. **Les différences git deviendraient illisibles.** Ajouter une ligne
   afficherait **14 557 lignes modifiées**. Impossible de relire un correctif,
   impossible de revenir en arrière proprement.
4. **Je les ai déjà.** Mon outil de lecture affiche le numéro devant chaque
   ligne qu'il me montre, systématiquement. Je n'ai **jamais** manqué de
   numéros de ligne. Ce qui me manque, ce n'est pas le numéro : c'est
   **qu'il reste vrai demain**.

### ✅ Ce que la proposition apporte de juste, et qui est adopté

Le vrai besoin derrière l'idée, c'est : **une référence exacte, vérifiable, qui
ne ment pas.** Trois mécanismes le donnent, sans un octet livré au client.

**1. Les fiches d'audit citent le numéro de ligne ET l'empreinte du commit.**
Un audit est une **photographie**. Figée à un commit précis, une ligne est
exacte **pour toujours** et vérifiable par n'importe qui :

```
FICHE — lvPanelAccord
  app.js:6167–…  @ commit 45567e7
  vérifiable : git show 45567e7:pirates-tools/app.js | sed -n '6167,6240p'
```
*(Exemple **vérifié** le 28/07 : `grep -n "function lvPanelAccord" app.js`
rend bien 6167. La v4 citait « 6012–6118 » — un numéro **inventé**, dans la
section même qui prêche P-A. Corrigé, et c'est la raison pour laquelle tout
exemple chiffré de ce plan porte désormais sa commande de vérification.)*

C'est ta demande, prise au mot, et rendue **infalsifiable** : la commande
ci-dessus affichera toujours exactement ce que j'ai lu, même dans six mois.

**2. Les ancres pour la carte durable** (phase 5). Un repère nommé posé en
commentaire (`// ══ ZONE : PAIEMENT ══`) ne se décale pas : il suit son code.
Coût **mesuré** (pas estimé) : 150 repères = **+9 Ko bruts, +1,36 Ko
compressés**, contre 120 000 octets bruts pour la numérotation intégrale —
**13 fois moins**, et ça reste vrai.

**3. `docs/ANCRES.md` — le tableau « ancre → ligne actuelle », REGÉNÉRÉ par
commande.** C'est le point qui te donne le confort que tu cherches : tu obtiens
bien une liste de numéros de ligne à jour, mais elle est **produite par la
machine à la demande**, pas écrite à la main et pas embarquée dans le site.
Un contrôle CI échoue si le tableau n'est plus à jour.

> **En une phrase** : ton idée est bonne, sa mise en œuvre doit être **à côté du
> code, pas dedans**. Numéros exacts figés à un commit pour l'audit, ancres pour
> la carte, tableau régénérable pour la lecture — et **0 octet** envoyé au client.

---

# 🔻 LE SYSTÈME ENTONNOIR — la numérotation qui se réajuste toute seule

> Demande de l'user (28/07/2026, après lecture de la v3) : *« il faut trouver un
> système intelligent qui se réajuste, afin de créer un système entonnoir dans
> tes recherches qui obligatoirement va t'amener là où tu dois aller et non pas
> là où toi tu veux aller. »*

**Réponse honnête à la question posée : non, la v3 ne l'avait pas.** Elle
contenait le bon ingrédient (`docs/ANCRES.md`, régénérable) mais présenté comme
un **confort de lecture**. L'user demande autre chose et de plus important : que
la recherche **converge mécaniquement**, au lieu de dépendre de mon flair. C'est
le même principe que P-B, appliqué à ma façon de chercher. Cette section est
donc **nouvelle**, et elle refond la phase 5.

## 1. Le mécanisme : on ne STOCKE jamais un numéro, on le CALCULE

C'est toute l'astuce, et elle est simple. Un numéro écrit quelque part se périme.
Un numéro **dérivé du fichier au moment où on le demande** ne peut pas se périmer.

**Preuve exécutée** (28/07/2026, sur une copie de `app.js`) :

| Étape | Résultat |
|---|---|
| repère `@zone PAY-03` posé | `app.js:6012` |
| 40 lignes insérées **1 200 lignes plus haut** | `app.js:6052` |
| travail manuel de renumérotation | **zéro** |
| temps de résolution sur 14 600 lignes | **70 ms** |

C'est exactement le comportement demandé — « le numéro des lignes en dessous se
réajuste ». Simplement, **le réajustement a lieu à la lecture, pas à l'écriture**.
Personne ne renumérote jamais rien.

## 2. Ce qu'on numérote : les ZONES, pas les lignes

Voilà le déplacement qui fait tout fonctionner. Une ligne est **une position** :
elle bouge dès qu'on touche au-dessus. Une zone est **une identité** : elle ne
bouge jamais.

```
  // ══ @zone PAY-03 — Règlement de la marchandise par le client ══
```

`PAY` = le domaine · `03` = la zone. Tu obtiens bien la carte numérotée que tu
veux — mais numérotée là où le numéro peut rester vrai.

### ⚠️ La règle d'attribution, qui est la clé du système
**Un numéro de zone est une identité, jamais une position.**
- il est attribué **une fois** et n'est **jamais réutilisé**, même après suppression ;
- une nouvelle zone insérée entre `PAY-03` et `PAY-04` prend **le prochain
  numéro libre** (`PAY-27`), surtout pas `PAY-03bis` ni une renumérotation ;
- **on ne réordonne jamais** : la lecture dans l'ordre du fichier est donnée par
  l'index, pas par la valeur du numéro.

C'est précisément ce qui manquait à la numérotation ligne à ligne : là, le
numéro **était** la position, donc il mentait au premier ajout. Ici, il n'a
aucun rapport avec la position — donc il ne peut plus mentir. C'est aussi la
règle des registres de décisions (§R4), pour la même raison.

## 3. L'entonnoir : quatre étages, aucun choix laissé à mon jugement

```
   ① INTENTION      « je veux modifier le règlement de la marchandise »
        ↓            table des intentions (docs/INDEX.md)
   ② DOMAINE        PAY   (l'argent)
        ↓            index des zones
   ③ ZONE           PAY-03
        ↓            balayage du fichier, à l'instant
   ④ LIGNE VIVE     app.js:6167–6240  +  api/contact.js:1030–…
```

**Une seule commande parcourt les quatre étages :**

```
$ node scripts/ou.js "règlement de la marchandise"

  ZONE   PAY-03 — Règlement de la marchandise par le client
  ICI    app.js:6167–6240           (calculé à l'instant)
         api/contact.js:1030–…      course-goods-paid

  INVARIANTS QUI S'APPLIQUENT ICI
   · le montant débité vient TOUJOURS du catalogue serveur
   · jamais de bouton désactivé comme état de repos

  CE QUI PROTÈGE CETTE ZONE
   · tests/plan10.mjs — 32 assertions, score de mutation 5/5
   · scripts/check-pricing.js

  PIÈGES DÉJÀ PAYÉS ICI
   · les lignes du panier doivent voyager AVEC la demande (panne v527)
   · c.lines ne porte que {key, qty} : titre et prix relus au catalogue

  DÉCISIONS EN VIGUEUR
   · #12 la plateforme n'encaisse QUE la marchandise, jamais la course (ACTIVE)
```

### 🔴 Le point décisif : l'entonnoir ne localise pas, il CONTRAINT
Un moteur de recherche répond *« c'est là »* et me laisse faire ce que je veux.
L'entonnoir répond *« c'est là, **et voici ce que tu n'as pas le droit d'y
faire** »* : les invariants, les pièges déjà payés, les décisions en vigueur, et
ce qui te préviendra si tu casses quelque chose.

C'est ça, « m'amener là où je dois aller et non là où je veux aller » : la
sortie de la commande **arrive avec ses interdits**. Aujourd'hui, ces interdits
sont dispersés dans 1 499 lignes de journal et je peux passer à côté sans même
savoir qu'ils existaient.

## 4. Les trois degrés de force — et lequel on choisit

| Degré | Mécanisme | Force réelle |
|---|---|---|
| ① Disponible | la commande existe | **faible** — je peux ne pas m'en servir |
| ② Rappelé | `CLAUDE.md` dit de l'utiliser | **faible** — c'est du contexte, pas une garantie (§R3) |
| ③ Imposé | un **hook** intercepte la recherche à l'aveugle dans `app.js` et renvoie vers `ou.js` | **fort** — s'applique quoi que je décide |

**Recommandation : ③, mais étroitement borné.** Le hook ne se déclenche que sur
une recherche large dans les trois gros fichiers (`app.js`, `styles.css`,
`index.html`), et il est **contournable par un drapeau explicite** — parce
qu'une porte qui bloque du travail légitime finit désactivée, et emporte avec
elle la protection réelle (piège déjà identifié en phase 6).

⚠️ **Coût assumé** : un hook mal réglé devient une gêne permanente. Il est donc
créé **en dernier**, une fois `ou.js` réellement utile — jamais avant.

## 5. Les trois contrôles qui empêchent l'entonnoir de mentir

| Contrôle | Ce qu'il refuse |
|---|---|
| **E1** | une zone citée dans un document mais **absente du code** |
| **E2** | une zone présente dans le code mais **absente de l'index** |
| **E3** | 🔴 **une ligne de `app.js` n'appartenant à AUCUNE zone** |

**E3 est le contrôle qui fait exister l'entonnoir.** Tant que les zones ne
couvrent pas 100 % du fichier, il reste des terres sans nom où je peux errer.
Quand la couverture est totale, **toute ligne appartient à exactement une zone**,
donc l'entonnoir aboutit **toujours** — il n'a plus le droit de ne pas savoir.

⚠️ **Correction de la v4 : E3 tel qu'il était écrit était infaisable.**
`app.js` est **un seul IIFE** : les 6 premières lignes (en-tête, `(function () {`,
`'use strict'`) et les 2 dernières (`})();`) n'appartiennent à aucun domaine
métier. « Aucune ligne hors zone » aurait donc **toujours échoué**, ou forcé une
zone artificielle — et un contrôle qui échoue toujours finit désactivé.
→ Une zone **`SOC-00 — enveloppe du fichier`** couvre explicitement l'ouverture
et la fermeture de l'IIFE. E3 exige alors une couverture réellement totale,
**et devient tenable**. Aucune autre exception n'est admise : chaque tolérance
supplémentaire rouvrirait une terre sans nom.

## 6. ⚠️ Ce qui bloque aujourd'hui : il n'y a plus un octet de place

Mesure du jour, par le contrôle P8 lui-même :

| Fichier | Poids compressé | Plafond | Marge |
|---|---|---|---|
| `app.js` | **205 Ko** | 205 Ko | **0** |

Et 150 repères de zone coûtent, mesuré : **+9 Ko bruts, +1,36 Ko compressés**
→ `app.js` passerait à **206,3 Ko**, soit **1,33 Ko au-dessus du plafond**.

**Conséquence sur l'ordre du plan** : la phase 5 ne peut pas poser les repères
tant que la place n'est pas libérée. Or **la phase 3 produit exactement ça** —
la liste des fonctions orphelines, c'est-à-dire du code mort réel à supprimer.
Ce n'était qu'un enchaînement logique dans la v3 ; c'est désormais une
**dépendance dure et chiffrée** : *la phase 3 doit libérer au moins 2 Ko
compressés avant que la phase 5 puisse commencer.*

Si elle n'y arrive pas, deux issues, et **c'est l'user qui tranche** :
- relever le plafond P8 de 205 à 208 Ko (décision explicite, tracée dans
  `docs/DECISIONS.md` — jamais une dérive silencieuse) ;
- ou poser moins de repères (zones plus grosses, entonnoir moins fin).

⚠️ Le plafond **n'est pas relevé par défaut**. Il a déjà forcé trois nettoyages
utiles ; c'est un détecteur de dérive, pas une contrariété.

## 7. Ce que ça change dans le plan

| Phase | Modification |
|---|---|
| **3** — graphe | gagne un **objectif chiffré** : libérer ≥ 2 Ko compressés de code mort |
| **5** — cartographie | refondue **autour de l'entonnoir** : zones numérotées, `scripts/ou.js`, contrôles E1/E2/E3 |
| **6** — portes | gagne le **hook** qui impose l'entonnoir (créé en dernier) |
| **7** — audit | chaque fiche porte **son numéro de zone** en plus de sa plage de lignes et de l'empreinte du commit |

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
| **Score de mutation** | la note d'un sabotage : défauts détectés / défauts introduits. « 6/6 » veut dire que les six pièges volontaires ont tous été vus. C'est le nom officiel de ce qu'on fait depuis des semaines. |
| **Test de caractérisation** | un test qui fige ce que le code fait **aujourd'hui**, sans dire si c'est bien. Il sert de filet quand on déplace du code : si le résultat change, c'est qu'on a cassé quelque chose. |
| **Décision remplacée** | quand un choix en annule un plus ancien, on **ne réécrit pas** l'ancien : on le marque « remplacée par #N ». On garde l'histoire, et on sait lequel fait foi. |
| **Règle à périmètre** | une règle rangée dans `.claude/rules/` avec la liste des fichiers qu'elle concerne. Elle **se charge toute seule** quand j'ouvre un de ces fichiers, et reste invisible le reste du temps. |
| **Hook** | une commande que l'outil exécute automatiquement à un moment fixe (avant un commit, après une modification). Contrairement à une consigne écrite, elle s'applique **quoi que je décide**. |

---

## Critère de réussite global

À la fin, une seule question tranche : **« Combien de fichiers dois-je ouvrir
pour savoir où intervenir sur un sujet donné ? »**
Aujourd'hui : 3 à 6 (mémoire + cartographie + recherche + code).
Cible : **zéro fichier ouvert à la main** — une commande, `node scripts/ou.js`,
puis directement le bon endroit du code. *(La v4 disait « 1 fichier, l'index » ;
l'entonnoir a rendu cette réponse périmée : ce n'est plus un fichier qu'on
ouvre, c'est une commande qu'on lance.)*

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

**Règle de session** : `CLAUDE.md` est chargé automatiquement, je n'y peux
rien ; **le premier fichier que j'OUVRE volontairement** est
`docs/AVANCEMENT-FONDATIONS.md`, et rien d'autre avant lui. C'est le point de
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
| 1 — Architecture documentaire | **2 à 3** *(relevé en v3)* | 1 499 lignes à trier, **plus** la mise en place de `.claude/rules/`, du registre des décisions et des 4 flux expliqués |
| 2 — Invariants | **1** | plafonné à 15 invariants, donc borné par construction |
| 3 — Graphe d'appels | **2 à 3** | le plus incertain : les appels indirects (`onclick`, délégation) peuvent doubler le travail |
| 4 — Catalogue des harnais | **1** | généré, donc rapide — dépend de la phase 0 |
| 5 — Sommaire et cartographie | **2** | l'épreuve à l'aveugle peut imposer une seconde passe |
| 6 — Les portes | **1 à 2** | chaque porte exige son sabotage, ce qui double le temps par porte |
| 7 — Audit ligne par ligne | **7 à 10** (1+ par lot) | le lot 7.2/7.3 (`app.js` cœur) peut déborder |
| 8 — Synthèse et découpage | **2** *(relevé en v3)* | inclut désormais les tests de caractérisation des 11 routes |
| 9 — Corrections | **variable** | dépend entièrement de ce que l'audit trouve — **non estimable avant la phase 8** |
| **Total hors phase 9** | **19 à 26 sessions** | somme des minima / maxima, revérifiée |

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
`styles.css`, `index.html`, `api/`. Les fondations ne modifient pas le produit.
Toute modification de comportement pendant ces phases est une faute, pas une
initiative.

**Deux exceptions, et deux seulement** — la v4 en oubliait une, ce qui la
rendait contradictoire avec elle-même :

| Exception | Phase | Nature du risque | Encadrement |
|---|---|---|---|
| **ajouter des ancres en commentaire** | 5 | quasi nul (un commentaire ne s'exécute pas) | commit unique + bump du Service Worker (voir phase 5) |
| **supprimer des fonctions orphelines** | 3 | 🔴 **réel** : c'est du code qui disparaît | voir l'encadrement ci-dessous |

### 🔴 Supprimer du code mort N'EST PAS anodin
La v4 demandait à la phase 3 de « libérer ≥ 2 Ko en supprimant les orphelines »
tout en écrivant, deux pages plus loin, que je m'interdis de toucher à `app.js`.
**Les deux ne pouvaient pas être vrais.** Tranché ici : la suppression est
autorisée, mais c'est le geste le plus risqué des phases 0-6, bien plus
qu'ajouter un commentaire.

- Le graphe a des **angles morts déclarés** : `onclick` dans une chaîne de
  caractères, délégation par `data-*`, tableaux de fonctions. Une « orpheline »
  peut être appelée par un de ces chemins.
- → **Une orpheline par commit**, jamais un lot. Ainsi un `git revert` cible
  exactement la fonction fautive.
- → Avant chaque suppression : recherche textuelle du nom **dans tout le dépôt**
  (`app.js`, `index.html`, les harnais), pas seulement dans le graphe.
- → Après chaque suppression : **lot complet des harnais**, pas le noyau rapide.
- → Si les 2 Ko ne sont pas atteints sans forcer, **on n'insiste pas** : c'est
  l'user qui tranche (relever le plafond ou poser moins de repères). Supprimer
  du code pour tenir un chiffre serait une inversion des priorités.

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

### 🔴 DANGER MESURÉ — ne JAMAIS versionner les dépendances des outils
La v4 disait « versionner `_gltftools/` ». **Mesuré :
`_gltftools/node_modules` pèse 110 Mo**, et l'ensemble des `node_modules` du
scratchpad **725 Mo** :

| dossier | poids |
|---|---|
| `eagerbuild/node_modules` | 512 Mo |
| `_gltftools/node_modules` | **110 Mo** |
| `node_modules` (racine du scratchpad) | 69 Mo |
| `_3dtest/node_modules` | 33 Mo |
| `qrtest/node_modules` | 1 Mo |

Un `git add outils/` naïf commiterait ces 110 Mo — et **git n'oublie jamais** :
l'historique resterait gonflé même après suppression, il faudrait réécrire tout
le dépôt pour le nettoyer. C'est le geste **le plus dangereux et le plus
irréversible** de tout ce chantier.

→ **Règle absolue** : on versionne **le code des outils**, jamais leurs
dépendances. `outils/` reçoit un `package.json` (la liste de ce qu'il faut
installer) et un `.gitignore` contenant `node_modules/`. Un contrôle CI refuse
tout fichier de plus de **1 Mo** entrant dans `tests/` ou `outils/`.
→ **Vérification avant le premier commit de la phase 0** :
`git add -n outils/ tests/ | wc -l` et `du -sh` sur ce qui serait ajouté.
On regarde AVANT, pas après.
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
`CLAUDE.md` = **1 499 lignes** de journal chronologique, alors que la
recommandation officielle est **sous 200 lignes** (« au-delà, ça consomme du
contexte et réduit l'adhérence aux consignes »). Et un `CLAUDE_PIRATESTOOLS.md`
**ne serait pas lu automatiquement** : seul `CLAUDE.md` l'est. Écrire des règles
ailleurs sans mécanisme de chargement = écrire des règles mortes.
Preuve mesurée : `docs/` contient 17 fichiers, **11 ne sont cités nulle part**.

### Structure cible — **révisée en v3** (R1, R2, R4, R9) **et v4** (`docs/ANCRES.md`)

| Fichier | Nature | Taille visée | Chargé comment |
|---|---|---|---|
| `CLAUDE.md` (racine) | **aiguillage** : quoi lire selon la tâche | ≤ 80 lignes | **automatiquement, toujours** |
| `.claude/rules/argent.md` | règles serveur, prix, paiement | ≤ 120 lignes | **tout seul** quand j'ouvre `api/**` |
| `.claude/rules/livraison.md` | règles de la chaîne livreur | ≤ 120 lignes | **tout seul** sur les zones concernées |
| `.claude/rules/produits.md` | prix, posters, packs 3D | ≤ 120 lignes | **tout seul** sur `products.json`, `images/**` |
| `docs/INVARIANTS.md` | vérités inviolables (phase 2) | ≤ 120 lignes | à la demande |
| `docs/DECISIONS.md` | **décisions, avec statut ACTIVE / REMPLACÉE PAR #N** | libre | à la demande |
| `docs/JOURNAL.md` | historique : comment on en est arrivé là | libre | en cas de doute |
| `docs/FONCTIONNEMENT.md` | **les 4 flux critiques expliqués**, pour un humain | ≤ 200 lignes | quand l'user veut comprendre |
| `docs/CARTOGRAPHIE.md` | où est quoi (phase 5) | libre | avant d'intervenir |
| `docs/ANCRES.md` | ancre → ligne actuelle, **généré** | libre | à la demande |
| `docs/AVANCEMENT-FONDATIONS.md` | où j'en suis | ≤ 40 lignes | au démarrage de session |

⚠️ **Aucun `@import` dans `CLAUDE.md`.** Un fichier importé est chargé au
lancement comme s'il était collé dedans : ça n'allège rien (R2). Les documents
sont **nommés entre accents graves**, ce qui empêche justement l'import.

⚠️ **Le découpage `.claude/rules/` est le vrai gain.** C'est la seule mécanique
qui charge une règle **au moment où elle sert** — donc la seule qui rende
l'aiguillage fiable au lieu de dépendre de ma discipline (R1).

### Règle de tri — appliquée sans exception
- **Impératif au présent** (« le prix vient toujours du serveur ») → RÈGLES
- **Choix tranché par l'user** (« pas de minification ») → **DECISIONS**, avec statut
- **Récit au passé** (« le 26/07 on a découvert que… ») → JOURNAL
- **Localisation** (« lvPanelPay est à app.js:6013 ») → CARTOGRAPHIE
- **Vérité absolue et testable** → INVARIANTS
- **Explication d'un flux de bout en bout** → FONCTIONNEMENT (4 flux, pas plus)

### Étape préalable, gratuite
Passer **`/doctor`** sur le `CLAUDE.md` actuel **avant** tout tri manuel : il
propose des coupes en retirant ce que je peux déduire du code et en gardant les
pièges et les raisons (R8). Ce qu'il propose est une **suggestion**, pas une
décision : chaque coupe reste soumise à la règle « aucune suppression, que des
déplacements ».

### Le sort des 17 documents existants — décidé, pas subi
Chaque fichier de `docs/` reçoit **une** étiquette, écrite dans l'index :

| Étiquette | Signification | Exemples pressentis |
|---|---|---|
| **VIVANT** | source de vérité en cours, cité depuis l'aiguillage | `METHODE-ENTREPRISE-FISCALITE.md`, `REGLES-PRODUITS.md`, `CARTOGRAPHIE.md` |
| **ARCHIVE** | terminé, gardé pour l'histoire, déplacé dans `docs/archives/` | `PLAN-REMEDIATION.md` (10/10 fait), `PLAN-DASHBOARD-ADMIN.md` (6/6 fait) |
| **À TRANCHER** | ni vivant ni mort — l'user décide | `PLAN-ABONNEMENTS.md`, `plan-creation-coursier.md`, `MAKITA-POSTERS-TODO.md` |

⚠️ **Aucun document n'est supprimé dans cette phase.** Archiver, c'est déplacer.

⚠️ **Et ce plan-ci ?** Il doit se ranger lui-même, sinon il devient le
18ᵉ document orphelin qu'il dénonce. Étiquette : **VIVANT tant que les phases
0 à 9 ne sont pas soldées**, puis **ARCHIVE**. Ses acquis durables (invariants,
décisions, règle des zones) auront alors migré dans `docs/INVARIANTS.md`,
`docs/DECISIONS.md` et `docs/CARTOGRAPHIE.md` — un plan terminé n'a plus à être
lu, seulement à être consultable.

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
- ⚠️ **Les acquis de méthode transférables** : `CLAUDE.md` contient des leçons
  qui ne concernent pas ce site (elles vaudraient pour n'importe quel projet).
  → Elles vont dans `docs/METHODE-TRAVAIL.md`, pas dans les règles du site.
- ⚠️ **Les contradictions silencieuses** *(nouveau v3)* : deux consignes
  opposées → j'en choisis une **au hasard** (R3/R4). Au moins **5 décisions
  renversées** cohabitent aujourd'hui avec leur version d'origine. → Contrôle
  CI : aucune décision de `docs/DECISIONS.md` ne peut être ACTIVE si une autre
  la déclare REMPLACÉE. Une décision **n'est jamais réécrite**, elle est
  **remplacée**, et le lien entre les deux est conservé.
- ⚠️ **Un `paths:` trop large annule le gain** : une règle étiquetée `**/*.js`
  se charge partout, donc revient à l'inclure dans `CLAUDE.md`. → Chaque règle
  déclare le périmètre le plus étroit qui la rende utile, et on **mesure** ce
  qui se charge réellement (`/context`) plutôt que de le supposer.
- ⚠️ **La duplication de `CLAUDE.md`** : un second fichier a été créé par erreur
  **deux fois**. La doc ajoute une raison de plus de l'interdire : un
  `CLAUDE.md` de sous-dossier **ne survit pas à la compression du contexte**,
  alors que celui de la racine est rechargé. Un doublon serait donc à la fois
  contradictoire **et** intermittent — le pire des deux.

### Preuve de réussite
- [ ] `CLAUDE.md` ≤ 80 lignes et ne contient **aucune** règle métier
- [ ] `find . -name CLAUDE.md -not -path "*/node_modules/*" | wc -l` = **1**
- [ ] Aucun `@import` dans `CLAUDE.md` (contrôle automatique)
- [ ] `/context` confirme que les règles `paths:` **ne se chargent pas** sur une
      session ordinaire, et **se chargent** dès que le fichier visé est ouvert —
      vérifié, pas supposé
- [ ] Chaque fichier de `docs/` est atteignable depuis `CLAUDE.md` — contrôle
      automatique qui échoue sur un orphelin, **prouvé faillible**
- [ ] Contrôle automatique : aucune date ni verbe au passé dans les fichiers de
      RÈGLES (heuristique, avec liste d'exceptions justifiées)
- [ ] `docs/DECISIONS.md` : chaque renversement historique retrouvé porte son
      statut, et **aucune paire contradictoire ne subsiste**
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
| Toute requête `where` + `orderBy` sur 2 champs exige un index composite | oui (statique) — **et c'est la SEULE voie** : Google documente que l'émulateur ne suit pas les index et exécute toute requête valide (R7) | **à ajouter dans `check-firestore-queries.js`** (le fichier existe, la règle non) |
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

### 🎯 OBJECTIF CHIFFRÉ AJOUTÉ — libérer la place des repères de zone
`app.js` pèse **205 Ko compressés pour un plafond de 205** : marge nulle. Les
repères de la phase 5 coûtent **+1,36 Ko**. Cette phase doit donc **libérer au
moins 2 Ko compressés** en supprimant les fonctions orphelines qu'elle détecte.
C'est ce qui transforme la détection de code mort en travail utile immédiat,
au lieu d'une liste qu'on regarde en hochant la tête.
⚠️ Une orpheline ne se supprime **qu'après vérification manuelle exhaustive** :
le graphe a des angles morts déclarés (appels via `onclick`, délégation), et
supprimer une fonction encore appelée par une chaîne de caractères casserait le
site en silence.

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
- [ ] **≥ 2 Ko compressés libérés sur `app.js`** — mesuré par `p8-perf`, pas
      estimé. Sinon la phase 5 est bloquée et l'user doit trancher (relever le
      plafond ou poser moins de repères)
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
- ⚠️ **« Éprouvé » en oui/non ne mesure rien** *(nouveau v3, R5)* : notre
  sabotage est du **mutation testing**, et cette pratique se mesure en **score
  de mutation** (mutants tués / mutants introduits). Marquer « éprouvé » un
  domaine avec 1 sabotage et un autre avec 12 les fait passer pour équivalents.
  → Le catalogue affiche **le score par domaine**, pas une case cochée.
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
**Construire l'entonnoir** décrit plus haut : que la recherche converge
mécaniquement au lieu de dépendre de mon flair.

### ✅ CONDITION D'ENTRÉE LEVÉE — décision **D-003** du 28/07/2026
Cette phase était bloquée par une dépendance dure : « la phase 3 doit d'abord
libérer 2 Ko sur `app.js` ». **Elle ne l'est plus** : les repères de zone sont
**refusés** (`docs/DECISIONS.md`, D-003).

Motif mesuré : les **434 noms de fonction déjà présents** donnent un repère
tous les **34 lignes pour 0 Ko**, là où ~150 repères de zone en donneraient un
tous les **97 lignes pour +1,36 Ko livrés à chaque visiteur**. Plus grossier
**et** payant.

→ **Cette phase ne touche donc plus au code du site**, ne demande plus de bump
du Service Worker, et n'a plus aucune condition d'entrée.

### Livrables
1. **Zones numérotées** posées dans le code :
   `// ══ @zone PAY-03 — Règlement de la marchandise par le client ══`
   Le numéro est une **identité** : attribué une fois, jamais réutilisé, jamais
   réordonné (voir la règle d'attribution, section Entonnoir §2).
2. **`scripts/ou.js`** — la commande qui parcourt les quatre étages de
   l'entonnoir et rend : localisation vive, invariants applicables, harnais qui
   protègent, pièges déjà payés, décisions en vigueur.
3. **`docs/INDEX.md`** — la table des **intentions** (« je veux faire X ») vers
   les domaines et les zones. C'est l'étage ① de l'entonnoir.
4. **`docs/ANCRES.md`** — le tableau *zone → ligne actuelle*, **régénéré par
   commande**. La numérotation demandée par l'user, toujours à jour parce que
   jamais stockée, et **0 octet livré au client**.
5. **`docs/CARTOGRAPHIE.md` refondue** (32 Ko existants à reprendre), indexée
   par zone et non par numéro de ligne.
6. **Contrôles E1 / E2 / E3** dans la CI (voir Entonnoir §5).

⚠️ **C'est la seule phase 0-6 qui touche au code** — et uniquement pour ajouter
des commentaires. Aucun comportement modifié : la CI et le lot complet des
harnais doivent être verts avant **et** après, à l'identique.

### ✅ CE RISQUE A DISPARU — décision **D-003**
Ce qui suit décrivait le seul geste du chantier touchant la production : poser
les repères dans `app.js` imposait un bump du Service Worker, celui-là même qui
a produit l'**écran noir v314** et le **mélange stale/frais v374**.
**Les repères sont refusés (D-003) : plus aucune étape du chantier ne modifie le
code servi, donc plus aucun bump.** La procédure ci-dessous est **conservée**
— elle reste la référence le jour où un asset changera pour une autre raison.

### 🔴 LE GESTE QUI PEUT CASSER LE SITE — le bump du Service Worker
**La v4 ne le mentionnait nulle part.**

Modifier `app.js` — même pour n'y ajouter que des commentaires — est un
**changement d'asset**. La règle du projet, vérifiée par `check-asset-versions`,
impose alors d'aligner **quatre choses d'un seul coup** :

| | quoi |
|---|---|
| 1 | `sw.js` → `VERSION = 'pt-vN'` |
| 2 | `sw.js` → `ASSET_VER = 'N'` |
| 3 | `index.html` → `app.js?v=N` **et** `styles.css?v=N` |
| 4 | `sw.js` → `APP_SHELL` référence les mêmes `?v=N` |

**Deux pannes réelles de ce projet viennent de là**, et elles sont dans le
journal :
- **v314 — écran noir.** `app.js?v=NOUVEAU` absent du cache du Service Worker
  + un hoquet réseau → l'application ne s'exécutait jamais, page noire muette.
- **v374 — mélange stale/frais.** Un numéro de version **réutilisé** : deux
  contenus différents publiés sous le même numéro, des visiteurs servis moitié
  ancien moitié nouveau.

→ **Règles pour la phase 5**, non négociables :
- **un seul commit** pose toutes les ancres et fait le bump — jamais deux
  commits, jamais un bump oublié ;
- **jamais un numéro déjà utilisé**, même après un revert ;
- `node scripts/ci.js` doit être vert (c'est `check-asset-versions` qui
  l'atteste), et l'user **recharge DEUX fois** avant de conclure — un Service
  Worker corrigé ne prend la main qu'au chargement suivant ;
- si quoi que ce soit cloche, **`git revert` du commit unique** remet le site
  exactement dans son état d'avant. C'est pour ça qu'il doit être unique.

### Pièges identifiés
- ⚠️ **Les numéros de ligne mentent dès le commit suivant.** C'est le défaut
  principal de la cartographie actuelle. → Ancres nommées + contrôle CI qui
  vérifie que chaque ancre citée **existe encore**.
- ⚠️ **La carte qui duplique le code** : si la cartographie explique *comment* ça
  marche, elle deviendra fausse. → Elle dit **où** et **quels pièges**, jamais
  *comment* : le comment est dans le code, seule source de vérité.
- ⚠️ **La table des matières illisible** : 200 entrées ne servent à rien.
  → L'index part des **intentions**, pas de la structure des fichiers.
- ⚠️ **Le budget de poids** : mesuré, **+1,36 Ko compressés** pour 150 repères,
  sur une marge de **0**. D'où la condition d'entrée ci-dessus. Ce n'est pas une
  précaution théorique : le contrôle P8 refusera le commit.
- ⚠️ **Les zones trop fines** : une zone tous les 30 lignes fait 480 zones,
  donc un index illisible et un budget crevé. → Viser **~150 zones**, soit une
  centaine de lignes par zone en moyenne, et regrouper plutôt que découper.
- ⚠️ **La zone qui déménage** : si du code migre d'une zone à l'autre, le repère
  reste juste mais l'intitulé ment. → E2 vérifie l'existence, pas le sens ;
  la cohérence intitulé/contenu est **relue à chaque lot de la phase 7**, qui
  traverse de toute façon tout le fichier.

### Preuve de réussite
- [ ] **Épreuve à l'aveugle** : sur **10 intentions tirées au sort**,
      `node scripts/ou.js` mène au bon endroit **du premier coup**, sans aucune
      recherche textuelle de ma part
- [ ] **E3 vert** : aucune ligne de `app.js` hors zone — c'est ce contrôle qui
      prouve que l'entonnoir aboutit toujours
- [ ] E1 et E2 verts, et tous deux **prouvés faillibles** par sabotage
- [ ] `docs/ANCRES.md` régénéré donne les mêmes numéros qu'une lecture directe
      du fichier, vérifié sur 5 zones tirées au sort
- [ ] La cartographie ne contient **aucun** extrait de code
- [ ] `node scripts/ci.js` vert, budget P8 **non dépassé** (pas « relevé »)

---

# PHASE 6 — LES PORTES

### Objectif
Rendre **impossible** — pas « déconseillé » — de refaire les erreurs déjà commises.

### 🔴 CE QU'UNE PORTE N'EST PAS *(établi en v3, R3)*
La documentation officielle est sans ambiguïté : un fichier de consignes est du
**contexte**, pas de la configuration — **aucune garantie** de respect strict,
et pour bloquer une action il faut un **hook** ou un contrôle exécuté.
→ **Conséquence directe** : une règle écrite dans `CLAUDE.md`, si bien rédigée
soit-elle, **n'est pas une porte**. C'est un rappel. Les seules vraies portes
sont `scripts/ci.js` (bloquant) et les **hooks** (exécutés à un moment fixe du
cycle, quoi que je décide). Toute la valeur de cette phase tient là-dedans.

### Les portes, par nature
**Exécutables (priorité absolue)** — un contrôle CI qui refuse le passage.
Existent déjà (29 contrôles) : fonction qui grossit (P7), classe fantôme (P1),
budget dépassé (P8), appel vers une fonction inexistante (P1), plafond des
12 fonctions Vercel (`check-functions`), empreintes CSP (`check-csp`)…

**À créer** : bouton désactivé au repos · échec traité comme vide · `where` +
`orderBy` sans index composite · harnais avec chemin absolu · document orphelin ·
second `CLAUDE.md` · classe CSS construite par concaténation traitée comme morte ·
**E1/E2/E3 de l'entonnoir** (zone citée inexistante · zone hors index · ligne
sans zone).

**Le hook de l'entonnoir — la seule porte qui agisse sur MOI, pas sur le code.**
Toutes les autres portes vérifient un fichier. Celle-ci intercepte **une
recherche à l'aveugle** dans `app.js` / `styles.css` / `index.html` et la
renvoie vers `node scripts/ou.js`. C'est le seul mécanisme qui rende l'entonnoir
obligatoire plutôt que disponible (voir Entonnoir §4).
⚠️ **Créée en DERNIER**, une fois `ou.js` réellement utile, et **contournable
par un drapeau explicite** : une porte qui bloque du travail légitime finit
désactivée, et emporte la protection réelle avec elle.

⚠️ **Où vit ce hook — la v4 ne le disait pas, et ça compte.** Il n'existe
aujourd'hui **aucun** `.claude/settings.json` dans le dépôt (vérifié). Le hook
doit être posé dans **`.claude/settings.json` VERSIONNÉ**, pas dans
`settings.local.json` : dans le second cas il ne protégerait que la machine où
il a été écrit, et disparaîtrait au prochain conteneur — exactement le défaut
que la phase 0 corrige pour les harnais. Créer ce fichier est donc un livrable
en soi, et il est **le seul fichier de configuration** que ce chantier ajoute.

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

⚠️ **Limite assumée du lot 7.7** : la phase 6 vient d'ajouter des portes dans
`scripts/`. Les auditer au lot 7.7, c'est **me relire moi-même**, à quelques
sessions d'écart. Ça vaut mieux que rien, mais ça ne vaut pas une relecture
extérieure. → Pour ces portes-là précisément, le vrai contrôle n'est pas la
relecture : c'est le **sabotage**, qui ne dépend pas de mon jugement. Le lot 7.7
vérifie donc en priorité que **chaque porte a bien son sabotage tracé**, et
seulement ensuite lit le code.

**Question tranchée** : `api/` passe **avant** la livraison, alors même que la
livraison est le code le plus récent. Motif : un défaut dans `api/` touche
l'argent réel de l'user et de ses clients ; un défaut de livraison touche un
parcours qui n'est pas encore ouvert au public.

### Méthode par lot — identique à chaque fois
1. Lecture **exhaustive et séquentielle**, sans saut.
2. Pour chaque bloc : **une fiche** — rôle, entrées/sorties, invariants qu'il
   doit respecter, pièges, couverture de test, défauts constatés.
   **En-tête obligatoire, format figé** *(v4)* :
   ```
   FICHE — PAY-03 — Règlement de la marchandise par le client
     app.js:6167–6240  @ commit 45567e7
     vérifiable : git show 45567e7:pirates-tools/app.js | sed -n '6167,6240p'
     retrouvable : node scripts/ou.js PAY-03
   ```
   ⚠️ **Les numéros ci-dessus sont réels, pas illustratifs.** La v4 en donnait
   d'inventés (`6012–6118`, `api/contact.js:412–470`) : dans un plan qui pose
   P-A, un exemple faux est la pire des fautes, parce qu'il enseigne l'erreur.
   **Règle : aucun exemple chiffré n'entre dans un document sans avoir été
   exécuté.**
   Trois références, chacune pour un usage différent :
   - le **numéro de zone** est l'identité durable — il ne bougera jamais ;
   - la **plage de lignes + empreinte de commit** fige la photographie : dans
     six mois, la commande affichera exactement ce que j'ai lu ;
   - `ou.js` donne la **position vive**, recalculée à l'instant.

   ⚠️ Une fiche sans numéro de zone est refusée : elle serait introuvable par
   l'entonnoir, donc invisible à la prochaine session.
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
- [ ] **Aucun trou de couverture** : les plages de lignes des fiches, mises
      bout à bout, couvrent **la totalité** du périmètre du lot. Contrôle
      automatique — c'est la seule façon de prouver qu'on n'a pas survolé
- [ ] Chaque fiche porte son empreinte de commit et sa commande de vérification
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
5. **`tests/golden/` — les tests de caractérisation** *(nouveau v3, R6)*.

### 🔒 PRÉREQUIS ABSOLU AU DÉCOUPAGE — le test de caractérisation
Nos harnais vérifient ce que le site **doit** faire. Pour sortir un module de
`app.js` sans rien casser, il faut l'inverse : figer ce qu'il **fait
aujourd'hui**, correct ou non. C'est le *test de caractérisation* (ou *golden
master*) : **on ne juge pas, on épingle**.

Concrètement : pour chacune des **11 routes**, on capture le rendu produit
(structure de la page + styles calculés) **avant** toute extraction, et on exige
qu'il soit **identique après**. L'outillage existe déjà (harnais de captures et
comparaison de pixels des sessions précédentes) — il n'y a rien à inventer, juste
à figer.

⚠️ **Sans ce filet, le découpage est un pari.** Un module extrait peut très bien
faire passer tous les harnais existants et casser un détail que personne ne
testait — et c'est précisément ce genre de détail qui a produit l'écran noir,
les textures blanches et la page vide dans l'histoire de ce site.

### Preuve de réussite
- [ ] `tests/golden/` couvre les **11 routes**, et une modification volontaire
      d'un rendu le fait **échouer** (prouvé faillible)
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

## ⏳ EN SUSPENS — décisions posées à l'user, jamais tranchées

Ces trois points ont été proposés en conversation le 28/07 et **n'ont pas reçu
de réponse** — la discussion est passée à autre chose. Sans être écrits ici, ils
seraient purement et simplement perdus. Ils n'engagent rien tant que l'user
n'a pas tranché.

| # | Proposition | Pourquoi elle a été faite | État |
|---|---|---|---|
| S1 | **Un plafond sur le TOTAL du texte chargé à froid** (368 Ko aujourd'hui) | un plafond *par fichier* se contourne tout seul : découper `app.js` en cinq fichiers ferait passer tous les plafonds au vert **sans qu'un octet ne disparaisse** | ⏳ non tranché |
| S2 | **Un plafond par image, distinct selon le rôle** — serré sur les vignettes, large sur les héros | mesuré : le plus gros héros pèse **871 Ko**, soit plus du double de tout le code du site, et **rien ne le surveille**. ⚠️ Deux budgets selon le rôle, **jamais un seul** : l'user exige des visuels de très haute qualité, la qualité n'est **jamais** la variable d'ajustement | ⏳ non tranché |
| S3 | **Les 1,36 Ko des repères de zone** | +0,37 % du poids total, en échange d'un système de navigation durable. Cela reste **une décision, pas un effet de bord d'un plafond relevé** | ⏳ non tranché |

⚠️ **Ces trois lignes migrent dans `docs/DECISIONS.md` dès la phase 1**, avec le
statut que l'user leur donnera. Une proposition sans réponse n'est pas un accord.

---

## Ce qui n'est PAS dans ce plan — décisions déjà prises
- ❌ **Minification** : écartée par l'user (28/07/2026). Motif : ajoute une étape
  de fabrication entre le `git push` et le site, donc un risque, pour un gain sur
  un poids déjà bon : **368 Ko de texte au premier chargement** (mesuré), soit
  **~3,5× moins** que la médiane e-commerce — *et non « 309 Ko, 8× moins »,
  chiffres donnés de mémoire puis corrigés par la mesure le 28/07*.
- ❌ **Refonte d'architecture avant lancement** : écartée. Le découpage sera
  incrémental, fondé sur le graphe, module par module.
- ❌ **Correction des défauts pendant l'audit** : phase 9 séparée, priorisée par
  l'user — avec la seule exception du **défaut critique** (phase 7).
- ❌ **Blocage du lancement commercial** : ce chantier est indépendant de la
  checklist de lancement et ne la retarde pas.
- ❌ **Découpage du catalogue (index léger + fiches à la demande)** : écarté par
  l'user le 28/07/2026, **après mesure sur son propre iPad**. Le gain réel à
  476 produits est de **25 ms** (82 → 57 ms) : sans commune mesure avec le
  chantier. Motifs de l'user : il compte rester à **500-600 produits maximum**,
  et si le site marche il prendra un **serveur privé** qu'il optimisera pour un
  affichage instantané même en mauvaise connexion.
  → **Ne pas reproposer** tant que le catalogue reste sous ~1000 produits.
  Les mesures qui ont servi à trancher sont conservées ci-dessous, pour ne pas
  avoir à les refaire :
  | catalogue | ouverture, non découpé | découpé | seuil |
  |---|---|---|---|
  | 476 produits (aujourd'hui) | 54 Ko | 16 Ko | gain 25 ms — **non rentable** |
  | 2000 produits | 251 Ko | 76 Ko | gain ~5 s sur 4G faible — rentable |
  Et le point qui restait à prouver, prouvé : **bien fait, le découpage ne coûte
  rien sur la fiche produit** (l'adresse de l'image voyage dans la carte, donc
  image et données partent ensemble). La qualité des visuels n'est jamais la
  variable d'ajustement.
- ❌ **Numéros de ligne inscrits dans le code** : écarté sur mesure
  (**+45,3 Ko compressés**, plafond P8 crevé, numéros faux au premier commit,
  différences git illisibles). **Le besoin est retenu** sous trois autres
  formes : fiches d'audit avec empreinte de commit, ancres nommées,
  `docs/ANCRES.md` régénérable. Voir la section dédiée.

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

# entonnoir : un repère nommé se réajuste-t-il vraiment ? (section Entonnoir §1)
grep -n "@zone PAY-03" app.js        # -> le numéro de ligne, recalculé à l'instant

# coût des 150 repères de zone (section Entonnoir §6)
#   +9 Ko bruts / +1,36 Ko compressés, mesuré en insérant 150 lignes de commentaire
#   puis en comparant zlib.gzipSync(level 9) avant / après

# poids réels du site (section « ce qui n'est pas dans ce plan »)
node -e 'const z=require("zlib"),f=require("fs");["index.html","styles.css","app.js","products.json","firebase-init.js","sw.js"].forEach(x=>console.log(x,(z.gzipSync(f.readFileSync(x),{level:9}).length/1024).toFixed(1),"Ko"))'

# vérifier un exemple cité dans ce plan AVANT de l'écrire (règle v5)
grep -n "function lvPanelAccord" app.js
grep -n "course-goods-paid" api/contact.js

# coût réel d'une numérotation de chaque ligne (section « numérotation »)
awk '{printf "/*%d*/%s\n", NR, $0}' app.js > /tmp/num.js
echo "gzip actuel   : $(gzip -9 -c app.js  | wc -c)"   # 209 028 o = 204,1 Ko
echo "gzip numéroté : $(gzip -9 -c /tmp/num.js | wc -c)" # 256 328 o = 250,3 Ko
```

---

## Annexe — sources extérieures consultées (v3, 28/07/2026)

| # | Sujet | Ce qu'on en tire | Source |
|---|---|---|---|
| R1/R2/R3/R8 | Fichiers de mémoire, règles à périmètre, imports, `/doctor`, commentaires HTML, compression du contexte | l'aiguillage devient mécanique ; un import n'allège rien ; une consigne n'est pas une porte | [Claude Code — How Claude remembers your project](https://code.claude.com/docs/en/memory) |
| R4 | Registre des décisions (ADR) : statut, `superseded`, ne jamais réécrire | `docs/DECISIONS.md` avec statuts | [adr.github.io](https://adr.github.io/) · [Martin Fowler — Architecture Decision Record](https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html) · [Microsoft Learn — Maintain an ADR](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record) |
| R5 | *Mutation testing* : mutant, « tuer le mutant », score de mutation | notre sabotage devient une **note**, pas une case cochée | [Wikipedia — Mutation testing](https://en.wikipedia.org/wiki/Mutation_testing) |
| R6 | Tests de caractérisation / *golden master*, coutures, code hérité | filet obligatoire **avant** tout découpage de `app.js` | [Wikipedia — Characterization test](https://en.wikipedia.org/wiki/Characterization_test) · [Understand Legacy Code — key points of Feathers](https://understandlegacycode.com/blog/key-points-of-working-effectively-with-legacy-code/) |
| R7 | Index composites Firestore ; l'émulateur ne les suit pas | l'invariant **doit** être un contrôle statique : aucun test ne le trouvera | [Firebase — Index types](https://firebase.google.com/docs/firestore/query-data/index-overview) · [Google Cloud — Use the Firestore emulator](https://docs.cloud.google.com/firestore/native/docs/emulator) |
| R9 | Diátaxis : quatre besoins documentaires distincts | le quadrant « comprendre » manquait → `docs/FONCTIONNEMENT.md`, borné à 4 flux | [diataxis.fr](https://diataxis.fr/) |
