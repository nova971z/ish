# AUDIT PROFOND — traqueur et parseur (16/08/2026)

> Demande de l'user : « analyse le traqueur et le parseur en réflexion et
> analytique profondes, cherche la moindre petite bête […] on ne mélange pas
> tout et on ne vérifie pas par lot ».
>
> ⛔ **Chaque chiffre de ce document porte la commande qui l'a produit.** Les
> mesures tournent sur le **balayage réel du 16/08 15h51** (110 pages,
> 4 430 tuiles) et sur le **catalogue réel** (1 708 fiches), jamais sur des
> exemples inventés. Les défauts sont numérotés et traités **un par un**.

---

## Constat 0 — la fiche du litige n'est PAS réparée (sa cause, oui)

| | |
|---|---|
| Cause du défaut | ✅ **fermée** |
| État de la fiche | ⛔ **toujours faux** |

- **Origine, datée** : balayage n°15, parseur `779a09fe…`. Une tuile intitulée
  « Makita DLM330 » — sans suffixe, **141,08 €**, le prix de la machine **nue** —
  écrite sur la fiche du **kit** `makita-dlm330rt`.
- **Aujourd'hui** : le même titre, rejoué sur le parseur en service
  (`4d399fb2…`), ne rapproche **plus rien** — les trois appariements le rendent
  en `restants`. La cause est fermée à la source.
- **Ce qui reste** : la dernière écriture sur cette fiche date de ce balayage
  n°15. Sur les **dix balayages suivants, aucune écriture** — la DLM330 a
  disparu des tuiles (0 occurrence propre sur 4 430 ; seul un pack combiné la
  cite, correctement laissé en `sansRef`). La fiche vend donc **219,24 €** un
  kit dont la tuile relevée valait **228,45 €**.
- Le correctif de la veille (mémoire du rattrapage) la fera **nommer** `muette`
  au prochain balayage. Nommer n'est pas réparer — c'est dit.

---

## Défaut 1 — 50 fiches d'une marque entière ne sont JAMAIS relevées

**Mesure.** Catalogue : 1 708 fiches — DEWALT 1 047, MAKITA 611, **FESTOOL 50**.
Plans du traqueur : DEWALT, MAKITA, **MILWAUKEE**.

⇒ **FESTOOL n'a aucun plan** : aucune adresse fournisseur, donc aucun relevé,
donc un prix qui ne repose sur aucun coût relu. Ces fiches ne peuvent même pas
être **gelées** : le gel juge un relevé périmé, et il n'y a pas de relevé.
⇒ Symétriquement, **un plan MILWAUKEE est entretenu pour 0 fiche** — il gonfle
la couverture apparente du traqueur.

**Pourquoi personne ne pouvait le savoir** : `check-plan-traqueur` vérifie la
*forme* des plans (pagination, adresses, refus d'une marque inconnue) et **ne
lit jamais le catalogue**. Les deux moitiés de la question vivaient dans deux
fichiers qui ne se parlaient pas.

**Porte posée** : `scripts/check-marques-suivies.js`, branchée dans `ci.js`.
Une marque du catalogue sans plan fait **rougir la CI**, sauf si elle est
**déclarée** avec sa date et son motif — et une marque déclarée reste
**affichée à chaque CI** (un fait qu'on cesse d'afficher est un fait qu'on
oublie). Trois contrôles de cohérence en plus : déclaration périmée, déclaration
contradictoire, préalables. **6 sabotages, 6 rouges.**

⚠️ Première version de cette porte : **verte pour la mauvaise raison**. Deux de
ses quatre promesses n'étaient atteintes par aucune donnée réelle — les saboter
laissait tout vert. Le cœur a été rendu **pur et injectable**, et sept témoins
rejouent les branches sur des marques synthétiques.

---

## Défaut 2 — même avec un plan, le parseur ne saurait pas lire cette marque

**Mesure.** Les **50 références FESTOOL sont TOUTES numériques** (`577985`,
`578011`, `578013`…). Or le parseur n'extrait que des références **commençant
par une lettre** (`/^[A-Z]/`, `credible()`).

Vérifié sur deux formes de titre réalistes :

```
"Festool Scie plongeante TS 55 FEBQ-Plus 577010" → sku lu : null
"Festool 577985 Aspirateur CTL MIDI I"           → sku lu : null
```

⇒ **Brancher un plan ne suffirait pas.** C'est écrit dans la déclaration de la
porte du défaut 1, pas caché — et ça reste à traiter à part.

---

## Défaut 3 — une règle explicite de l'user n'a JAMAIS été exécutée

**La règle** (user, 10/08/2026, vérifiée à l'échelle : 158 paires sur 167 au
même prix à 2 % près) : *une référence sans suffixe dont la description ne parle
que de l'outil EST l'outil nu.*

**Elle est morte, et c'est démontrable sans mesure** — deux conditions du même
`if` s'excluent par construction :

| Ligne | Code |
|---|---|
| `price-parse.js:3906` | `if (car.famille === 'machine' && car.coffret == null) car.coffret = 'AUCUN';` |
| `price-parse.js:2420` | `if (nbAnn === null && car.famille === 'machine' && … && car.coffret == null …)` |

La première force `coffret` à `'AUCUN'` **précisément quand** `famille === 'machine'` ;
la seconde exige `coffret == null` **et** `famille === 'machine'`. Contradiction.

**Mesure de confirmation** sur les tuiles réelles : 3 736 titres distincts →
184 typés `famille = machine` → **99 muettes sur leur contenu** → la règle
passe **0 fois**, bloquée **99 fois sur 99**. Valeurs de `coffret` rencontrées :
`{"AUCUN": 99}`.

**Le témoin qui aurait dû l'attraper était vert pour la mauvaise raison** :
`check-price-watch` construit son `car` à la main —
`{ sku:'ZZN450', famille:'machine', type:'perceuse-visseuse' }` — **sans champ
`coffret`**, une forme que le parseur ne produit jamais. Même mécanisme que la
leçon du 13/08 (fiches d'essai sans `brand`).

---

## Défaut 4 — 10,9 % des « machines » sont des pièces détachées

**Mesure** sur les mêmes 3 736 titres : **20 des 184** titres typés
`famille = machine` sont dénoncés par leur propre libellé comme pièce ou
accessoire. Exemples réels :

```
tondeuse               Makita 643535-4 Clé de sécurité pour tondeuse sans fil DLM460
tondeuse               Roue avant de tondeuse DLM382 (pièce détachée)
perceuse à percussion  Makita 650721-0 Interrupteur pour perceuse à percussion DHR264
pack d'outils          Makita Moulage Mak-Pac DJV182 DBO180 8398261
ponceuse               Makita 416494-3 Entretoise pour meuleuse à bande modèle 9403
```

Le champ `pourMachine`, qui existe pour ça, rend `null` sur tous.
⚠️ Le **moulage** contredit une règle de l'user du 02/08 (« un MOULAGE/INSERT de
coffret n'est JAMAIS un produit ») : il est typé `pack d'outils`.

**Exposition aujourd'hui : nulle.** Un seul consommateur lit
`famille === 'machine'` pour une décision d'argent — et c'est la branche morte
du défaut 3. Le champ sort en revanche dans le diagnostic (`fam`) que l'user lit :
ce diagnostic est faux pour ces 20 tuiles.

---

## Défaut 5 — « pièce détachée » n'est pas dans la liste des accessoires

La vraie protection d'argent vit dans `varianteProduit` (motif `ACCESSOIRE` :
*support, adaptateur, rechange, filtre, moulage, insert, carter, charbons,
courroie*…). Elle tient sur cinq des six cas dangereux — **et lâche sur le
sixième** :

```
✅ ACCESSOIRE | Makita 643535-4 Clé de sécurité pour tondeuse … DLM460
⛔ NU         | Roue avant de tondeuse DLM382 (pièce détachée)
✅ ACCESSOIRE | Makita 162682-7 Arbre avant complet pour tondeuse … DLM382
✅ ACCESSOIRE | Makita 650721-0 Interrupteur pour perceuse … DHR264
✅ ACCESSOIRE | Makita Lance de Pulvérisation … DHW180
✅ ACCESSOIRE | Makita Moulage Mak-Pac DJV182 DBO180
```

Ni « **pièce détachée** » — la formule française la plus explicite — ni
« **roue** » ne figurent dans le motif.

**Exposition chiffrée.** 22 titres au vocabulaire explicite de pièce détachée
échappent au motif ; **3 portent une référence de notre catalogue** :

| réf lue | coût lu | fiche visée | prix de vente |
|---|---|---|---|
| DLM382 | **21,10 €** | DLM382PF4 | 837,55 € |
| DLM382 | **21,10 €** | DLM382PT2 | 550,67 € |
| DLM382 | **21,10 €** | DLM382Z | 322,26 € |

Une **roue de tondeuse à 21,10 €** comme coût de trois tondeuses.

---

## ⛔⛔ LE POINT LE PLUS IMPORTANT — les défauts 3 et 5 s'annulent

**Le défaut 3 (branche morte) est ce qui empêche aujourd'hui le défaut 5 de
coûter de l'argent. Réparer l'un SANS l'autre casse le site.**

Démontré en simulant la réparation du défaut 3 (`coffret: 'AUCUN'` traité comme
« le titre ne dit rien du coffret ») sur les 3 736 tuiles réelles → **8
attributions apparaissent, dont 6 catastrophiques** :

```
DHW180Z    coût lu   12,12 € | fiche vendue 193,28 €  ← Lance de Pulvérisation
DJV182Z    coût lu    4,09 € | fiche vendue 277,49 €  ← Moulage Mak-Pac
DLM460Z    coût lu   65,38 € | fiche vendue 617,30 €  ← Clé de sécurité
DHR264ZJ   coût lu  108,70 € | fiche vendue 428,87 €  ← Interrupteur
DLM382Z    coût lu   21,10 € | fiche vendue 322,26 €  ← Roue avant
DLM382Z    coût lu   24,15 € | fiche vendue 322,26 €  ← Arbre avant
```

**Ordre de réparation imposé par cette mesure :** défaut 5 (durcir la
reconnaissance des pièces détachées) **puis** défaut 4 (le typage `machine`)
**puis seulement** défaut 3 (réveiller la règle de l'user), chacun avec sa
porte et son sabotage, et une re-mesure sur ces mêmes 3 736 tuiles entre
chaque. Jamais dans l'autre sens, jamais ensemble.

---

## Ce que l'audit a CONFIRMÉ comme sain (à ne pas rouvrir)

- **Appariement exact** : sur **3 273 références inconnues** du balayage,
  **0** correspond exactement à un sku du catalogue. L'appariement exact ne
  rate rien.
- **Appariements souples en production** : rejoués sur les 3 273 tuiles,
  ils rendent **0 attribution** — aucune écriture hasardeuse en attente.
- **`choisirCoutSource`** : minimum sur les sources **fraîches (14 j) et en
  stock** seulement, source retirée ignorée, `nowMs` non numérique refusé.
- **Pas de plafond de variation** : c'est **voulu** (D-015, 31/07) — il jugeait
  un écart et non une valeur, et avait maintenu une fiche à perte. ⛔ Ne pas le
  réintroduire.

---

## Campagne de sabotage mécanique — résultat PARTIEL, et dit comme tel

`outils/sabotage-campagne.mjs` sur `api/_lib/price-parse.js` : **1 245 mutations
énumérées, 800 jouées** avant arrêt (la campagne mute le fichier sur le disque
et entrait en collision avec les vérifications de cette session).

**800 jouées → 14 tuées, 786 survivantes.** Répartition des survivantes :

| opérateur retourné | survivantes |
|---|---|
| seuil décalé | 423 |
| `\|\|` → `&&` | 153 |
| `&&` → `\|\|` | 120 |
| `===` → `!==` | 34 |
| `!==` → `===` | 33 |
| `>=` → `>` | 20 |
| négation retirée | 17 |
| `<=` → `<` | 5 |

⚠️ **Ce chiffre ne se lit pas comme « 98 % du parseur est faux »** : une
survivante est un défaut du **filet**, pas forcément du produit, et la majorité
tombe dans les fonctions de normalisation de texte, pas dans les décisions
d'argent. ⚠️ **Et il est partiel** : 445 mutations n'ont pas été jouées, la
seconde moitié du fichier n'est donc pas couverte par ce chiffre.
⛔ Le fichier a été **restauré et son empreinte revérifiée** après l'arrêt
(`4d399fb257390980-370117`, identique à avant).

À rejouer en entier, seul, sans autre travail concurrent.
