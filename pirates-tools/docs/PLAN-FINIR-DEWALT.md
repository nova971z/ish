# PLAN D'ACTION — FINIR DEWALT POUR DE BON

*Établi le 16/08/2026, après que j'ai annoncé « DeWALT fini à 100 % » sur un
chiffre qui venait du balayage **Makita**. Le plan qui suit ne contient aucune
étape dont le résultat ne soit **mesurable**, et chaque étape porte sa porte et
sa preuve de fin.*

---

## AVERTISSEMENT — deux de mes mesures d'aujourd'hui étaient fausses

Elles sont rétractées ici, avant le plan, parce qu'un plan bâti dessus serait
la même faute une troisième fois.

| # | ce que j'avais mesuré | pourquoi c'était faux | statut |
|---|---|---|---|
| R1 | « l'instrument de complétude surestime, `lues + doublons > tuiles` sur 24 pages » | `admin.js:4608` additionne déjà `doublons` dans `luesBrutes` **avant** bornage — ma formule le comptait deux fois | **HYPOTHÈSE MORTE** |
| R2 | « 759 fiches DeWALT (72,5 %) n'ont JAMAIS été vues chez le fournisseur » | je cherchais les fiches dans `unknown`. Or **une tuile appariée ne va jamais dans `unknown`** — test discriminant : 198 réfs dans `applied`, 1 208 dans `unknown`, **0 dans les deux**. Je comptais donc comme « jamais vues » précisément celles qui avaient été appariées | **CHIFFRE RETIRÉ** |

⛔ **Et R2 n'est pas une maladresse isolée : c'est le défaut D0 ci-dessous qui
l'a rendue possible.** Tant qu'il vit, personne — ni l'user, ni moi — ne peut
répondre à la seule question qui compte.

---

## L'ÉTAT RÉELLEMENT ÉTABLI (et rien de plus)

| fait | valeur | comment il est établi |
|---|---|---|
| fiches DeWALT au catalogue | **1 047** | `catalog.loadCatalog()` |
| balayages DeWALT archivés | **13** (871 réponses) | `zip2` → `zip14` |
| dernier balayage, tuiles lues | **3 932 / 3 958 = 99,34 %** | `page.tuiles` / `page.lues` |
| appariements `unchanged` cumulés | **15 361** | `counts.unchanged` |
| fiches **nommables** dans les réponses | **301** *(plancher)* | `applied` ∪ `flagged` |
| **couverture réelle** | ⛔ **INCONNUE** | la seule rubrique qui la porterait n'est pas nommée |
| fiches refusées ≥ 5 fois, jamais servies | **59** | `flagged` sur 13 balayages |
| pages de rattrapage jamais servies à DeWALT | **toutes** | 13 balayages × 67 pages = grille seule |

---

# PHASE 0 — RENDRE LA CHAÎNE MESURABLE

*Rien d'autre n'est vérifiable tant que ces deux points ne sont pas faits. Ils
ne corrigent aucun prix : ils rendent le système observable.*

### 0.1 — Nommer les fiches `unchanged` (identifiants seuls)

- **Le défaut.** `applied` et `flagged` sont **nommés** ; `unchanged` est
  seulement **compté** (1 209 au dernier balayage, 15 361 cumulés). La question
  *« lesquelles de mes 1 047 fiches ont un coût frais ? »* est donc sans réponse
  possible — c'est ce qui a produit ma rétractation R2 et ce qui a coûté une
  session entière sur la tondeuse Makita.
- **La correction.** La réponse de page porte `unchangedIds` : **les
  identifiants seuls**, ni titre ni prix. Mesuré : ~18 par page, ~1 200 par
  balayage — sans commune mesure avec les listes déjà rendues.
- **La porte.** `check-price-watch` : la liste existe, elle est de la même
  longueur que `counts.unchanged`, et elle ne porte QUE des identifiants.
- **Fini quand** : sur un balayage réel, `union(unchangedIds, applied, flagged)`
  se compte sur les 1 047 fiches et rend un **pourcentage de couverture**.
- **Coût pour l'user** : aucun geste.

### 0.2 — Faire remonter le diagnostic du plan jusqu'à l'user

- **Le défaut.** Le correctif du 16/08 (mémoire du rattrapage, racines
  `muettes`) écrit son verdict dans la **réponse du plan**. Or le raccourci
  n'enregistre que les réponses de **page** : mesuré sur 3 zips, **0 réponse de
  plan**. L'information part dans le vide.
- **La correction.** Le verdict du plan est recopié dans la réponse de la
  **première page** de la rafale — celle qui est toujours enregistrée. Pas de
  lecture Firestore supplémentaire : l'état est déjà lu à la construction du plan.
- **La porte.** `check-price-watch` : le verdict est présent dans une réponse de
  page, et une racine `muette` y est nommée.
- **Fini quand** : un zip contient au moins une réponse portant `rattrapageMuettes`.
- **Coût pour l'user** : aucun geste.

---

# PHASE 1 — MESURER LA VRAIE COUVERTURE DEWALT

### 1.1 — Un balayage DeWALT, avec le rattrapage joint

- **Pourquoi.** Les 13 balayages DeWALT sont **antérieurs** à la jointure du
  rattrapage (D-172, en ligne le 16/08 à 11h22) **et** au parseur actuel
  (`4d399fb2` ; zip14 tournait sur `609bf288` et `779a09fe`). Aucun chiffre
  DeWALT existant ne décrit le code en service.
- **Ce que ça donne.** La grille (67 pages) **plus** les pages de recherche par
  référence — le premier accès de DeWALT à ce chemin.
- **Coût pour l'user** : **un** lancement de son raccourci habituel.
- **Fini quand** : le zip est mesuré et la couverture chiffrée grâce à 0.1.

### 1.2 — Le vrai reste à faire, chiffré

⚠️ **Chiffre à ne pas prendre pour argent comptant.** Simulé sur base factice
**sans aucun relevé connu**, le rattrapage DeWALT rendrait **1 009 racines**,
soit 16 balayages au plafond actuel de 67. Mais cette simulation suppose
qu'AUCUNE fiche n'a de relevé — ce qui est faux (15 361 appariements observés).
**C'est un plafond haut, pas le reste réel.** Le reste réel se lit après 1.1,
et pas avant.

- **Fini quand** : le nombre de racines réellement en file est connu, et le
  nombre de balayages nécessaires en découle.

---

# PHASE 2 — COMBLER, DÉFAUT PAR DÉFAUT

### 2.1 — Les 59 fiches refusées en boucle

- **Mesuré.** Sur 13 balayages : **131** fiches refusées au moins une fois,
  **105** jamais servies, **59** refusées 5 fois ou plus sans une seule
  application. Record : `dewalt-dcg426n-xj`, **103 refus**.

```
103 refus  dewalt-dcg426n-xj    228,97 €   titre annonce batterie/chargeur, fiche nue
 78 refus  dewalt-dcb182        470,26 €   bundle « & » : plusieurs produits
 65 refus  dewalt-dcs355nt-xj   268,51 €   titre annonce batterie/chargeur, fiche nue
 52 refus  dewalt-dcd996n       330,00 €   titre annonce batterie/chargeur, fiche nue
 48 refus  dewalt-dcd800nt-xj   272,14 €   batterie incluse (Nx …Ah), fiche sans batterie
```

- ⛔ **Les refus sont JUSTES** — 168 des 169 du dernier balayage. Ce sont des
  machines NUES dont la grille ne montre que des KITS, et la garde interdit
  d'écrire un prix de kit sur une fiche nue. **On ne touche pas à la garde.**
- **Le défaut n'est pas le refus, c'est son SILENCE.** Une fiche refusée 103
  fois vend sur un coût que plus rien ne revalide, et rien ne le dit.
- **La correction, en deux temps** :
  - 2.1.a la recherche par référence les vise **en priorité** (une machine nue
    introuvable sur la grille a toutes ses chances sur une page famille — c'est
    ce qui a corrigé deux prix Makita au dernier balayage) ;
  - 2.1.b un refus répété **N fois de suite** sort NOMMÉ dans la réponse, comme
    une racine `muette`.
- **La porte.** `check-price-watch`, sur base factice comptée : un refus unique
  ne crie pas, un refus répété crie, la garde elle-même reste intacte (sabotage
  qui la retire ⇒ rouge).
- **Fini quand** : zéro fiche refusée ≥ 5 fois sans avoir été, soit servie, soit
  nommée.

### 2.2 — Les 10 fiches à préfixe de distributeur

- **Mesuré.** 10 fiches DeWALT portent `AT-`, `AR-` ou `TD.` devant la vraie
  référence. Le parseur retire ces préfixes en lisant un titre ; l'index du
  traqueur, lui, indexe la fiche sous son sku complet. Le normaliseur
  `refSansPrefixeDistributeur` existe — mais il est **Makita seulement**
  (à raison : M-28), et il rend `null` sur les dix.
- **Cas prouvé** : `AT-DXV20PTA`, vendue **196,09 €**. Le fournisseur affiche
  **exactement** `DXV20PTA` à **190,57 €** — et la fiche n'a **jamais** été
  appariée en 13 balayages.
- **La correction.** Une table de préfixes **propre à DeWALT**, avec la garde de
  marque **sur la ligne d'appel** (M-28 ; `check-separation-marques` l'exige).
- ⚠️ **Le sens de l'erreur est INVERSÉ ici** : ce rapprochement fait **baisser**
  le coût retenu, donc un mauvais rapprochement ferait **vendre à perte**.
  L'alias ne s'ajoute donc que si la place est libre, et chaque paire est
  vérifiée à la main avant d'entrer dans la table.
- **Fini quand** : les 10 sont soit appariées, soit déclarées absentes du
  fournisseur — une par une, jamais en lot.

### 2.3 — `dewalt-dt50002-qz` : 12 311,51 € depuis 13 balayages

- **Mesuré.** Refusée **13 fois sur 13**, motif `prix source hors fourchette
  (10 000 €)` — la borne absolue vaut 8 000 € (`PW.MAX_TTC`).
- **Le refus est correct** : cette borne est le dernier filet contre un parseur
  qui déraille, et D-015 a retiré le plafond de variation à raison. **Je n'y
  touche pas.**
- ⛔ **C'est une décision de l'user, jamais une correction en douce.** Trois
  options, à trancher : ① monter la borne pour cette famille d'articles ;
  ② vérifier que 10 000 € est le vrai coût et l'écrire à la main une fois ;
  ③ retirer la fiche.
- **Fini quand** : l'user a tranché, et la décision est écrite dans
  `docs/DECISIONS.md`.

---

# PHASE 3 — VERROUILLER, POUR QUE ÇA NE REVIENNE PAS

### 3.1 — Une couverture par marque, mesurée et opposable

- **Le défaut de fond.** J'ai pu annoncer « DeWALT 100 % » parce qu'**aucune
  porte ne mesure la couverture d'une marque**. Le chiffre venait de ma tête.
- **La correction.** Une porte lit le dernier balayage archivé de chaque marque
  et rend : tuiles lues, fiches nommées, fiches jamais servies, refus chroniques.
  Un pourcentage annoncé sans cette sortie n'a plus le droit d'exister.
- **Fini quand** : `node scripts/couverture-marque.js DEWALT` rend le chiffre,
  et c'est le SEUL chiffre que j'ai le droit de citer.

### 3.2 — Re-mesure et clôture

- Rejouer 1.1 après la Phase 2, comparer les deux couvertures, et écrire l'écart.
- **DeWALT sera « fini » quand, et seulement quand** :
  1. la couverture est **chiffrée** par 3.1 (plus jamais par moi) ;
  2. **zéro** fiche refusée ≥ 5 fois sans être servie ou nommée ;
  3. les 10 fiches à préfixe sont tranchées une par une ;
  4. `dt50002-qz` est tranchée par l'user ;
  5. le tout mesuré sur un balayage produit par le parseur **en service**.

---

## RÉCAPITULATIF — l'ordre, et ce qu'il coûte à l'user

| # | étape | gestes user | dépendance |
|---|---|---|---|
| 0.1 | nommer les `unchanged` | 0 | — |
| 0.2 | remonter le verdict du plan dans une réponse de page | 0 | — |
| 1.1 | un balayage DeWALT avec rattrapage | **1 balayage** | 0.1 + 0.2 |
| 1.2 | chiffrer le reste réel | 0 | 1.1 |
| 2.1 | refus chroniques : priorisés puis nommés | 0 | 1.2 |
| 2.2 | les 10 préfixes distributeur, une par une | 0 | — |
| 2.3 | `dt50002-qz` | **1 décision** | — |
| 3.1 | porte de couverture par marque | 0 | 0.1 |
| 3.2 | re-mesure et clôture | **1 balayage** | tout |

**Total demandé à l'user : deux balayages et une décision.** Le reste est du
code, avec sa porte et son sabotage.

⛔ Aucune étape de ce plan n'est engagée dans ce document. Il est soumis, pas
exécuté.
