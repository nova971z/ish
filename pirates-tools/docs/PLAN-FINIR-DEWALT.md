# PLAN D'ACTION — FINIR DEWALT POUR DE BON

**Version 2 — 16/08/2026.** Établi après une seconde passe ligne par ligne sur
la chaîne entière. La v1 est remplacée : elle contenait deux mesures fausses,
retirées ci-dessous, et il manquait cinq défauts que cette passe a trouvés.

*Règle que je m'applique dans tout ce document : aucun chiffre sans la commande
qui l'a produit, aucune conclusion sans la mesure qui la tue si elle est fausse.*

---

## PARTIE I — CE QUE JE RETIRE

Trois de mes mesures étaient fausses. Elles sont retirées **avant** le plan,
parce qu'un plan bâti dessus répéterait la faute.

| # | ce que j'avais dit | pourquoi c'était faux | statut |
|---|---|---|---|
| **R1** | « DeWALT est fini à 100 % » | le 100 % était celui du balayage **MAKITA** (4 430/4 430). DeWALT est à **99,34 %** (3 932/3 958) et n'a pas été rebalayé depuis | **RETIRÉ** |
| **R2** | « l'instrument de complétude surestime (`lues + doublons > tuiles`) » | `admin.js:4608` additionne déjà `doublons` dans `luesBrutes` **avant** bornage — ma formule le comptait deux fois. `pwBornerLues` borne et rend l'écart | **HYPOTHÈSE MORTE** |
| **R3** | « 759 fiches DeWALT (72,5 %) jamais vues chez le fournisseur » | je cherchais les fiches dans `unknown`, or **une tuile appariée n'y va jamais**. Test discriminant : 198 réfs dans `applied`, 1 208 dans `unknown`, **0 dans les deux** — je comptais comme invisibles exactement celles qui avaient été trouvées | **CHIFFRE RETIRÉ** |

⛔ **R3 n'est pas une maladresse : c'est D-01 ci-dessous qui l'a rendue
possible.** Tant que ce défaut vit, ni vous ni moi ne pouvons répondre à la
seule question qui compte — *lesquelles de mes fiches ont un coût à jour ?*

⚠️ Une quatrième erreur, de forme : j'ai testé la grammaire DeWALT en attendant
la forme de retour de la grammaire Makita. Elle m'a rendu « 0 sur 1 047 », que
j'ai failli publier. **Cause réelle : les trois grammaires de marque rendent
trois formes différentes** — c'est le défaut **D-11**.

---

## PARTIE II — L'ÉTAT ÉTABLI, ET RIEN DE PLUS

| fait | valeur | établi par |
|---|---|---|
| fiches DeWALT au catalogue | **1 047** (sur 1 708) | `catalog.loadCatalog()` |
| balayages DeWALT archivés | **13** — 871 réponses | `zip2` → `zip14` |
| dernier balayage, tuiles lues | **3 932 / 3 958 = 99,34 %** | `page.tuiles` / `page.lues` |
| appariements `unchanged` cumulés | **15 361** | `counts.unchanged` |
| fiches **nommables** dans les réponses | **301** — *plancher, pas couverture* | `applied` ∪ `flagged` |
| **couverture réelle** | ⛔ **INCONNUE** | rien ne la porte |
| fiches refusées ≥ 5 fois, jamais servies | **59** | `flagged`, 13 balayages |
| pages de rattrapage servies à DeWALT | **0** | 13 × 67 = grille seule |

---

## PARTIE III — LES DOUZE DÉFAUTS, NUMÉROTÉS

### 🔴 D-01 — la couverture est structurellement inconnaissable

`applied` et `flagged` sont **nommés**. `unchanged` est **seulement compté** —
1 209 au dernier balayage, 15 361 cumulés, **0 nommé**.

| rubrique | comptée | nommée |
|---|---|---|
| `applied` | ✅ | ✅ |
| `flagged` | ✅ | ✅ |
| `unchanged` | ✅ | ⛔ **non** |

**Conséquence** : *« lesquelles de mes 1 047 fiches ont un coût fournisseur
frais ? »* n'a **aucune réponse possible**. C'est ce qui a produit R3, et c'est
ce qui a permis R1.
**Gravité** : bloquant — tout le reste en dépend.

---

### 🔴 D-02 — DeWALT n'a jamais reçu la recherche par référence

Les 13 balayages DeWALT font **67 pages : la grille, rien d'autre.** Les
balayages Makita récents en font **134** (67 grille + 67 recherches).
La jointure du rattrapage est en ligne depuis le 16/08 11h22 ; le dernier
balayage DeWALT lui est antérieur.

**Conséquence** : toute la chaîne bâtie les 15-16/08 — recherche par racine,
drain daté, mémoire du rattrapage — **n'a jamais tourné pour cette marque**. Or
la grille seule plafonne : **69,2 %** mesuré le 10/08.
**Gravité** : bloquant.

---

### 🔴 D-03 — 59 fiches refusées en boucle, jamais servies

Sur 13 balayages : **131** fiches refusées au moins une fois, **105** jamais
servies, **59** refusées ≥ 5 fois sans une seule application.

```
103 refus  dewalt-dcg426n-xj    228,97 €   titre annonce batterie/chargeur, fiche nue
 78 refus  dewalt-dcb182        470,26 €   bundle « & » : plusieurs produits
 65 refus  dewalt-dcs355nt-xj   268,51 €   titre annonce batterie/chargeur, fiche nue
 52 refus  dewalt-dcd996n       330,00 €   titre annonce batterie/chargeur, fiche nue
 48 refus  dewalt-dcd800nt-xj   272,14 €   batterie incluse (Nx …Ah), fiche sans batterie
 39 refus  dewalt-dcf887n       224,59 €   batterie incluse (Nx …Ah), fiche sans batterie
 39 refus  dewalt-dcd791n       188,58 €   titre annonce batterie/chargeur, fiche nue
 39 refus  dewalt-dce530n-xj    190,83 €   titre annonce batterie/chargeur, fiche nue
 39 refus  dewalt-dcg406n-xj    313,35 €   titre annonce batterie/chargeur, fiche nue
 36 refus  dewalt-dcf961nt-xj   471,35 €   titre annonce batterie/chargeur, fiche nue
```

⛔ **Les refus sont JUSTES** — 168 des 169 du dernier balayage. Ce sont des
machines NUES dont la grille ne montre que des KITS. **On ne touche pas à la
garde.**
⛔ **Le défaut, c'est le SILENCE.** Une fiche refusée 103 fois vend sur un coût
que plus rien ne revalide, et rien ne le signale.
**Gravité** : argent, silencieux, permanent — même classe que la tondeuse Makita.

---

### 🟠 D-04 — 10 fiches à préfixe de distributeur, sans normalisation

Dix références DeWALT portent `AT-`, `AR-` ou `TD.` devant la vraie référence.
Le parseur retire ces préfixes en lisant un titre ; l'index range la fiche sous
son sku complet. Le normaliseur `refSansPrefixeDistributeur` existe mais est
**Makita seulement** — à raison (M-28) — et rend `null` sur les dix.

**Cas prouvé** : `AT-DXV20PTA`, vendue **196,09 €**. Le fournisseur affiche
**exactement** `DXV20PTA` à **190,57 €**, et la fiche n'a **jamais** été
appariée en 13 balayages.

```
AT-DXV20P (154,50 €)   AT-DXV20PC        AT-DXV15T         AT-DXV20PTA (196,09 €)
AT-DXV23P-QT (221,58)  AT-DXV30SAPTA     TD.POWERSET5007 (259,79 €)
AT-DXV34PTA (314,46 €) DXVP-QT           AR-DXPW008E (1 564,72 €)
```

⚠️ **Sens de l'erreur INVERSÉ** : ce rapprochement fait **baisser** le coût,
donc un mauvais rapprochement ferait **vendre à perte**. Table à vérifier une
par une.
**Gravité** : argent (manque à gagner prouvé sur 1, à établir sur 9).

---

### 🟠 D-05 — 202 fiches (19,3 %) ont un suffixe que la grammaire ne sait pas lire

`lireSuffixeDewalt` rencontre des lettres inconnues sur **202 fiches**, réparties
en **79 suffixes distincts** :

```
suffixe «K»    40 fiches   ex. D25033K-QS (200,96 €)
suffixe «E»    22 fiches   ex. DNN2045E (122,28 €)
suffixe «B»    12 fiches   ex. DT20737B-QZ (791,48 €)
suffixe «PS»    9 fiches   ex. DPC17PS (588,30 €)
suffixe «SZ»    7 fiches   ex. DNBA1644SZ (128,34 €)
suffixe «KT»    5 fiches   ex. DWS520KT-QS (414,08 €)
suffixe «NK»    5 fiches   ex. DCGG571NK-XJ (330,37 €)
… 72 autres
```

⛔ **Je n'écris pas ce que ces lettres signifient.** Le `K` de DeWALT, je ne
peux pas l'affirmer sans une source — l'affirmer de mémoire serait exactement
l'invention que le protocole interdit. **Ce qui est mesuré, c'est que la
grammaire n'en dit rien.**
**C'est le calibrage que Makita a reçu (D-170) et que DeWALT n'a jamais eu.**
**Gravité** : prépare D-06.

---

### 🔴 D-06 — coffret et machine nue rendent la MÊME signature

Conséquence directe de D-05, mesurée :

```
D25033K    → NU        D25033    → NU     (identiques)
DWS520KT   → NU        DWS520    → NU     (identiques)
DCGG571NK  → NU        DCGG571N  → NU     (identiques)
```

Deux produits différents, **interchangeables pour l'appariement**. La garde
`titreContreditFiche` interrogée sur la paire rend `null` : elle ne voit aucune
contradiction, parce qu'il n'y en a pas **dans ce qu'elle sait lire**.

⚠️ **Exposition aujourd'hui : NULLE, et c'est un accident heureux.** Les trois
appariements rendent `[]` sur ces paires — parce que
**`apparierParConfiguration` est réservé à Makita** (garde de marque M-28) et
que DeWALT n'a donc **aucun appariement par configuration**.

⛔⛔ **LE PIÈGE À NE PAS TOMBER DEDANS.** Ajouter un appariement par
configuration à DeWALT est la façon la plus évidente d'augmenter sa couverture
— et **ce serait une vente à perte immédiate sur ces 202 fiches**, exactement
comme la paire Makita ③/⑤ où réparer l'un seul cassait le site.
**⇒ D-05 se répare AVANT D-06, et D-06 avant tout appariement souple DeWALT.**

---

### 🟠 D-07 — un titre à plusieurs lots de batteries n'est lu qu'en partie

`extraireCaracteristiques` ne retient que le **premier** groupe :

```
"1 batterie de 5 Ah XR, 2 batteries de 2 Ah"  → nbBatteries = 1   (attendu 3)
"kit 1 x 5,0 Ah + 2 x 2,0 Ah"                 → nbBatteries = 1   (attendu 3)
"3 batteries 5 Ah"                            → nbBatteries = 3   ✅
"2 batteries 5,0 Ah"                          → nbBatteries = 2   ✅
```

**Deux conséquences** : ① un kit multi-lots peut atterrir sur une fiche à 1
batterie → coût trop **haut** → prix trop haut (J4 : le prix doit être exact) ;
② la fiche à 3 batteries ne reçoit jamais sa vraie tuile → elle reste périmée.
**Gravité** : prix faux vers le haut + couverture perdue.

---

### 🟡 D-08 — 8 fiches où notre propre titre contredit notre propre référence

```
DCB124G        réf 0 batt | titre 1 batt |   148,51 €
DCB094K-QW     réf 0 batt | titre 1 batt |   157,44 €
DCC018N        réf 0 batt | titre 1 batt |   202,98 €
DCH253N        réf 0 batt | titre 1 batt |   273,66 €
DCB283BC       réf 0 batt | titre 2 batt |   358,27 €
DCMCST632N-XJ  réf 0 batt | titre 1 batt |   550,08 €
DCK611P1D2     réf 3 batt | titre 1 batt |   924,83 €   ← expliqué par D-07
DCK624P3T      réf 3 batt | titre 1 batt | 1 825,12 €   ← expliqué par D-07
```

Deux sont expliquées par D-07. Les six autres sont à trancher **une par une** :
soit le titre de la fiche est faux, soit la référence l'est.
**Gravité** : moyenne — mais chacune est une fiche que la garde jugera de travers.

---

### 🟡 D-09 — `dt50002-qz` : 12 311,51 € depuis 13 balayages

```
dewalt-dt50002-qz   coût lu 10 000 €   refusé : hors fourchette (MAX_TTC = 8 000 €)
                    identique dans zip2 … zip14 — 13 balayages
```

Le refus est correct : cette borne est le dernier filet contre un parseur qui
déraille, et **D-015 a retiré le plafond de variation à raison**. Je n'y touche
pas.
⛔ **Décision de l'user, jamais une correction en douce** : ① monter la borne
pour cette famille ; ② valider 10 000 € comme vrai coût ; ③ retirer la fiche.

---

### 🟡 D-10 — le verdict du rattrapage ne vous parvient pas

Le correctif du 16/08 (racines `muettes`) écrit son verdict dans la **réponse
du plan**. Le raccourci n'enregistre que les réponses de **page** : mesuré sur
3 zips, **0 réponse de plan**. Ce que j'ai livré hier part dans le vide.
**Gravité** : rend inutile un correctif déjà livré.

---

### 🟡 D-11 — trois grammaires de marque, trois formes de retour

```
lireSuffixeDewalt("DCD791P2-QW")  → { nbBatteries, batteries[], ah, coffret, nu, suffixe }
lireSuffixeMakita("DHP486RTJ")    → { racine, suffixe, config:{…}, varianteModele }
lireSuffixeMilwaukee("M18FPD2…")  → null
```

Trois formes pour la même question. C'est ce qui m'a fait publier « 0 sur
1 047 » à tort. Un appelant qui se trompe de forme lit `undefined` — donc
« pas de batterie » — **en silence**.
**Gravité** : structure, mais elle fabrique des erreurs d'argent par accident.

---

### 🟢 D-12 — le compteur d'ancres rate parfois une tuile

Écart mesuré : **12 sur 11 pages** (DeWALT), **8 sur 8 pages** (Makita). Le
parseur découpe une tuile que le compteur d'ancres n'a pas vue. C'est **borné
et rendu** (`ecartComptageTuiles`), jamais masqué — donc connu, petit, et non
bloquant. Listé pour ne pas l'oublier.

---

## PARTIE IV — CE QUI EST CONFIRMÉ SAIN (ne pas rouvrir)

| maillon | mesure |
|---|---|
| unicité des sku DeWALT | **0** doublon sur 1 047 |
| unicité des racines commerciales | **0** collision |
| unicité des identifiants de fiche | **0** doublon |
| appariement exact | **0** rate sur 3 273 références inconnues |
| appariements souples en production | **0** attribution hasardeuse en attente |
| les gardes de refus | **168 / 169** refus justifiés |
| `choisirCoutSource` | minimum sur sources **fraîches ET en stock** seulement |
| instrument de complétude | borne et rend l'écart — **ne surestime pas** |
| absence de plafond de variation | **voulu** (D-015). ⛔ Ne pas réintroduire |

---

## PARTIE V — LE PLAN, DANS L'ORDRE IMPOSÉ PAR LES MESURES

> ⛔ **L'ordre n'est pas négociable** : D-05 avant D-06, et D-06 avant tout
> appariement souple DeWALT. Inverser fait vendre à perte sur 202 fiches — c'est
> mesuré, pas supposé.

### PHASE 0 — rendre la chaîne mesurable *(0 geste)*

| étape | quoi | porte | fini quand |
|---|---|---|---|
| **0.1** | émettre `unchangedIds` — identifiants seuls, ~18/page | `check-price-watch` : liste présente, longueur = `counts.unchanged`, rien d'autre que des identifiants | un balayage rend un **pourcentage de couverture** sur les 1 047 |
| **0.2** | recopier le verdict du plan dans la 1re réponse de page | `check-price-watch` : une racine `muette` est nommée dans une réponse de page | un zip contient `rattrapageMuettes` |

*Corrige D-01 et D-10. Aucun prix touché.*

### PHASE 1 — calibrer la grammaire DeWALT *(0 geste)*

| étape | quoi | porte | fini quand |
|---|---|---|---|
| **1.1** | inventorier les 79 suffixes inconnus, **un par un**, chacun avec sa source | — | chaque suffixe a une signification **sourcée** ou est déclaré inconnu |
| **1.2** | étendre `SUFFIXES_DEWALT`, garde de marque **sur la ligne d'appel** | `check-separation-marques` + `check-parseur-releves` sur corpus gelé | 0 lettre inconnue sur les 1 047, ou la liste des restantes est écrite |
| **1.3** | vérifier que coffret ≠ nue **signent différemment** | témoin + **sabotage** (retour à l'ancienne table ⇒ rouge) | `D25033K` ≠ `D25033` |

*Corrige D-05 puis D-06. ⛔ Ne rien ajouter à l'appariement avant 1.3 verte.*

### PHASE 2 — réparer la lecture des titres *(0 geste)*

| étape | quoi | porte | fini quand |
|---|---|---|---|
| **2.1** | additionner **tous** les lots de batteries d'un titre | témoin sur les 4 formes mesurées + sabotage | `"1 x 5,0 + 2 x 2,0"` → 3 |
| **2.2** | trancher les 8 désaccords titre ↔ référence, **un par un** | — | 0 désaccord non expliqué |
| **2.3** | unifier la forme de retour des trois grammaires | porte : les trois rendent la même forme | un appelant ne peut plus lire `undefined` en silence |

*Corrige D-07, D-08, D-11.*

### PHASE 3 — mesurer la vraie couverture *(1 balayage)*

| étape | quoi | fini quand |
|---|---|---|
| **3.1** | **un balayage DeWALT avec le rattrapage joint** | le zip est mesuré |
| **3.2** | chiffrer le reste réel de la file | le nombre de racines en file est connu |

⚠️ **Chiffre à ne pas prendre au mot** : simulé sur base factice **sans aucun
relevé connu**, le rattrapage DeWALT rendrait **1 009 racines** → 16 balayages
au plafond de 67. Mais 15 361 appariements ont été observés : beaucoup de fiches
ONT un relevé. **C'est un plafond haut, pas le reste réel.** Il se lit après 3.1.

*Corrige D-02.*

### PHASE 4 — combler *(1 décision)*

| étape | quoi | porte | fini quand |
|---|---|---|---|
| **4.1** | les 59 refus chroniques : priorisés dans la recherche, puis **NOMMÉS** au N-ième refus | base factice comptée : 1 refus ne crie pas, N refus crient, la garde reste intacte au sabotage | 0 fiche refusée ≥ 5 fois sans être servie **ou** nommée |
| **4.2** | les 10 préfixes distributeur, **une par une** | `check-separation-marques` ; alias seulement si la place est libre | les 10 sont appariées **ou** déclarées absentes |
| **4.3** | `dt50002-qz` | décision écrite dans `docs/DECISIONS.md` | l'user a tranché |

*Corrige D-03, D-04, D-09.*

### PHASE 5 — verrouiller *(1 balayage)*

| étape | quoi | fini quand |
|---|---|---|
| **5.1** | une **porte de couverture par marque** : tuiles lues, fiches nommées, jamais servies, refus chroniques | `node scripts/couverture-marque.js DEWALT` rend le chiffre — **et c'est le seul que j'ai le droit de citer** |
| **5.2** | re-mesure après Phase 4, écart écrit | les deux couvertures sont comparées |

*Corrige la cause de R1 : aucune porte ne mesurait la couverture, donc mon
« 100 % » venait de ma tête.*

---

## PARTIE VI — « DEWALT EST FINI » VOUDRA DIRE, EXACTEMENT

1. la couverture est **chiffrée par la porte 5.1**, plus jamais par moi ;
2. **zéro** fiche refusée ≥ 5 fois sans être servie ou nommée ;
3. **zéro** lettre de suffixe inconnue, ou la liste des restantes est écrite ;
4. coffret et machine nue **signent différemment** (sabotage rouge à l'appui) ;
5. les 10 fiches à préfixe sont tranchées une par une ;
6. `dt50002-qz` est tranchée par vous ;
7. le tout mesuré sur un balayage produit par le **parseur en service**.

---

## CE QUE ÇA VOUS COÛTE

| | |
|---|---|
| balayages à lancer | **2** (étapes 3.1 et 5.2) |
| décisions à prendre | **1** (`dt50002-qz`, étape 4.3) |
| tout le reste | du code, avec sa porte et son sabotage |

⛔ **Aucune étape n'est engagée. Ce plan est soumis, pas exécuté.**
