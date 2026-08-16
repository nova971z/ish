# 🔗 LA CHAÎNE TRAQUEUR · PARSEUR · CALCULATEUR — maillon par maillon

> **À lire AVANT de toucher un seul de ces fichiers.** Ordre de l'user, gravé le
> 16/08/2026 : *« avant de toucher quoi que ce soit, si tu ne sais pas exactement
> de quoi c'est composé, tu dois lire la totalité de la chaîne du code […] aucun
> travail à l'aveugle n'est toléré »*. Règle : `.claude/PROTOCOLE.md` §0.
>
> ⚠️ **Ce document ne remplace pas la lecture du code.** Il dit OÙ regarder et
> DANS QUEL ORDRE, pour qu'on ne lise plus au hasard. Les numéros de ligne
> bougent : les **noms de fonction**, eux, sont stables — cherchez par nom.
>
> ⛔ Chaque chiffre ici a été **mesuré le 16/08/2026**, jamais recopié.

---

## Les fichiers, et leur poids réel

| fichier | lignes | rôle dans la chaîne |
|---|---:|---|
| `api/admin.js` | 5 567 | l'**orchestrateur** : reçoit la page, appelle tout le reste, écrit |
| `api/_lib/price-parse.js` | 4 116 | le **parseur** : découpe la page, lit les titres, apparie |
| `api/_lib/nomenclature.js` | 2 035 | les **grammaires de référence**, une par marque |
| `api/_lib/pricing-model.js` | 340 | le **calculateur** : coût → prix de vente |
| `api/_lib/traqueur-plans.js` | 212 | les **adresses** des pages à balayer, par marque |
| `api/_lib/pricing.js` | 195 | TVA, octroi de mer, territoires |

---

## LE PARCOURS D'UNE TUILE, DE LA PAGE AU PRIX

*Neuf maillons. Chacun peut refuser — et un refus n'est jamais silencieux.*

### ① Le plan — quelles pages balayer
`api/_lib/traqueur-plans.js` · `PLANS['<MARQUE>@idealo']`

Chaque marque a son plan : `pages`, `pas`, `parPage`, `ordre`, `patron`,
`patronPage1`, et **`patronRecherche`** (la recherche par référence).
⛔ **Le site plafonne à 67 pages** quel que soit le catalogue (prouvé par
empreintes : au-delà de l'offset 990 il ressert la page 1). La grille seule ne
peut donc PAS tout couvrir — mesuré le 10/08 : **69,2 %**.

Le plan est construit dans `api/admin.js` (type `price-watch-plan`), puis
**`pwJoindreRattrapage()`** y ajoute les pages de recherche par référence des
fiches sans relevé exploitable.
*Portes* : `check-plan-traqueur.js`, `check-marques-suivies.js`.

### ② L'entrée — le raccourci poste le TEXTE de la page
`api/admin.js` → `handlePriceWatch()`

⚠️ **Le raccourci n'envoie pas l'adresse, seulement le texte.** Conséquence
vécue : une réponse de page est **anonyme**, on ne sait pas ce qui a été
cherché. C'est pour ça que le verdict du rattrapage est déposé dans
`config/traqueur_etat` et recopié dans la réponse (`rattrapageVerdict`).

Drapeaux d'appel : `&scan=1` (balayage), `&dryRun=1` (à sec), `&inconnus=1`,
`&rattrapage=1`, `&source=<slug>`.

### ③ Le découpage — combien de tuiles, et lesquelles
`price-parse.js` → `compterTuiles()` puis `parseAuto()`

`parseAuto` essaie les trois gabarits (`parseCotebrico`, `parseClickoutil`,
`parseIdealo`) et garde celui qui rend quelque chose.
Sorties : `items` (réf lisible) · `packs` · `sansRef` · **`perdus`** (blocs
illisibles, avec leurs lignes et le motif) · `doublons`.
⛔ **Rien ne disparaît** : chaque tuile est lue, comptée **ou nommée**.
`page.tuiles` / `page.lues` / `page.ecartComptageTuiles` disent le compte, et
`pwBornerLues()` (dans `admin.js`) empêche l'instrument de surestimer.

### ④ La lecture d'un titre — ce que l'offre annonce
`price-parse.js` → `extraireCaracteristiques()` → `typerTitre()`

Rend ~50 champs : `famille`, `rayon`, `type`, `sku`, `nbBatteries`, `ah`,
`chargeur`, `coffret`, `pack`, `voltage`, dimensions, normes…
⛔ **Pièges déjà payés ici** : « sans chargeur » lu comme « avec chargeur »
(corrigé, `nieApres`) · « sans **fil** » et « sans **balais** » qui niaient à
tort (corrigé, `FAUSSES_NEGATIONS`) · un titre à **plusieurs** lots de
batteries n'est lu qu'en partie (**ouvert**, D-07 du plan DeWALT).
⚠️ Pour une MACHINE, `coffret` est forcé à `'AUCUN'` quand le titre se tait —
et c'est ce qui rend morte la branche « outil nu » de ⑥.

### ⑤ La grammaire de la référence — ce que la BOÎTE contient
`nomenclature.js` → `lireSuffixeDewalt()` · `lireSuffixeMakita()` ·
`lireSuffixeMilwaukee()`

⛔⛔ **M-28 — CHAQUE MARQUE A SA TABLE**, et la marque se vérifie **sur la ligne
d'appel** (`check-separation-marques.js` l'exige). Le sens de l'erreur est
INVERSÉ ici : rapprocher deux références fait **baisser** le coût, donc vendre
à perte.

⚠️ **Les trois grammaires rendent trois formes différentes** — objet plat pour
DeWALT, `{racine, suffixe, config}` pour Makita, `null` pour Milwaukee. C'est
un piège réel : un appelant qui se trompe de forme lit `undefined`, donc
« pas de batterie », **en silence**. *(D-11 du plan DeWALT, ouvert.)*

DeWALT : `BATTERIES_DEWALT` (C/D/E/L/M/P/H/T/X/Y + chiffre) et
`MARQUEURS_DEWALT` (N nue · T TSTAK · M McLaren · G vert · **R rouge** ·
**L classe de poussière** · **K coffret**). Une tension en FIN de suffixe
(12/18/54/108) n'est **pas** un code de batterie. Un suffixe valant exactement
`B` = machine nue. **33 suffixes restent sans source** :
`docs/DEWALT-SUFFIXES-A-SOURCER.csv`.

### ⑥ L'appariement — quelle fiche reçoit cette tuile
`admin.js` appelle, dans cet ordre :

1. **exact** par `sku` (index construit sur le catalogue) ;
2. `apparierParRefRecollee()` — recolle une référence éclatée dans le titre ;
3. `apparierParConfiguration()` — ⚠️ **MAKITA SEULEMENT** (garde M-28) ;
4. `apparierParNomSouple()` — compare les NOMS, le plus permissif.

⛔ **L'ambiguïté ne s'arbitre JAMAIS** : deux fiches compatibles ⇒ on ne
rapproche rien. Règle depuis le premier jour.
⚠️ DeWALT n'a **aucun** appariement par configuration — et c'est ce qui masque
aujourd'hui le fait que coffret et machine nue signent pareil (D-06 du plan).
**Ajouter cet appariement à DeWALT sans corriger la grammaire d'abord = vente à
perte immédiate sur 202 fiches.** L'ordre est imposé par la mesure.

### ⑦ La garde — le titre a le dernier mot
`price-parse.js` → `titreContreditFiche(titre, skuFiche, marque)`

⚠️ **Prend le sku en CHAÎNE, pas la fiche.** Lui passer l'objet rend
« [object Object] » et la garde ne juge plus rien — erreur commise **quatre
fois** le 16/08.

Appelée au **point unique d'écriture** : toutes les voies d'appariement passent
par elle. Rend un **motif** (texte) si le titre contredit la fiche, `null`
sinon. Motifs : bundle « & » · lot de N · batterie incluse · chargeur inclus ·
code de kit accolé · référence de kit entre parenthèses.
⛔ Elle **refuse**, elle n'invente jamais un prix.

### ⑧ Le choix du coût — le moins cher qui soit ACHETABLE
`price-parse.js` → `choisirCoutSource(sources, nowMs, maxAgeMs, actives)`

Minimum sur les sources **fraîches** (`SOURCE_FRESH_MS` = 14 j) **ET en stock**
seulement. Une source retirée (`SOURCES_ACTIVES`) ne pèse plus. Un `nowMs` non
numérique refuse tout. Si rien ne reste : `raisonAucuneSource()` dit pourquoi
(`rupture` / `perime` / `mixte`) et le prix est **GELÉ**.

### ⑨ Le calculateur — du coût au prix de vente
`pricing-model.js` → `recommend(product, opts, config)`

`solveMarkup()` cherche la majoration qui atteint la marge visée, en tenant
compte de : transport (`shipFor` + `colissimoCost` sur
`data/transport-outre-mer.json`), **octroi de mer** (`octroiRate`), TVA du
territoire (`tvaDomRate`), douane (`douaneFor`), part fixe par commande
(`fixedPerOrder`). `marginAt()` fait l'inverse : quelle marge à ce prix.

⛔ **Une seule implémentation** : `check-pricing.js` refuse tout identifiant du
modèle de prix dans un fichier client. Le client AFFICHE, il ne calcule pas.
⛔ **Bornes ABSOLUES seulement** : `PW.MIN_TTC` = 1 €, `PW.MAX_TTC` = 8 000 €.
Le plafond de VARIATION a été retiré à raison (**D-015**) : il jugeait un écart,
pas une valeur, et avait maintenu une fiche à perte. **Ne pas le réintroduire.**

### ⑩ L'écriture — et ce qu'elle rend
`admin.js` → `lotAjouter()` (écritures groupées) → `product_overrides` +
miroir `snapshot`.

La réponse porte : `applied` · `flagged` (refusés, **avec le motif**) ·
`unchangedIds` (identifiants des fiches inchangées) · `unknown` · `sansRef` ·
`perdus` · `packsIgnores` · `absents` · `rupture` · `haussesDifferees` ·
`counts` · `couverture` · `page` · `versionParseur` · `rattrapageVerdict`.

⛔ Une **baisse** s'écrit tout de suite ; une **hausse** attend la fin de la
rafale (le minimum ne peut que descendre). La file des hausses est **durable**
(`config/pw_hausses_<marque>`) : elle survit au recyclage d'une instance.

---

## LES ÉTATS DURABLES (Firestore, collection `config`)

| document | ce qu'il retient |
|---|---|
| `traqueur_etat` | backoff après blocage · **verdict du rattrapage** relu par chaque page |
| `pw_hausses_<marque>` | les hausses en attente de fin de rafale |
| `pw_rattrapage_<marque>` | les racines déjà cherchées, et leurs silences |

⚠️ **Budget mesuré** : le rattrapage coûte **1 lecture + 2 écritures par PLAN**
— une fois par balayage, jamais par page. Assertion en égalité STRICTE dans
`check-price-watch.js`.

---

## LES PORTES — ce qui interdit quoi

| porte | ce qu'elle empêche |
|---|---|
| `check-price-watch.js` | le gros œuvre : ruptures, min multi-sources, gel, héritage, rattrapage, budget |
| `check-parseur-releves.js` | les invariants du parseur sur le **corpus gelé** de vraies cartes |
| `check-titre-fiche.js` | qu'un prix de kit s'écrive sur une fiche nue (18 refus + 18 passages témoins) |
| `check-separation-marques.js` | qu'une grammaire de marque morde une autre marque (M-28) |
| `check-version-parseur.js` | qu'un relevé ne dise pas quelle version l'a produit |
| `check-plan-traqueur.js` | un plan mal formé |
| `check-marques-suivies.js` | qu'une marque vendue n'ait **aucun** plan (FESTOOL : 50 fiches) |
| `check-pricing.js` · `check-pricing-model.js` | une deuxième implémentation du prix |
| `check-alias-nomenclature.js` | qu'un alias désigne un autre contenu de boîte |
| `check-traqueur.js` | la forme des relevés |

⛔ **Une porte se prouve faillible** : `node outils/sabotage.mjs --fichier … --cherche … --remplace … --commande "…"`.
Une porte verte au premier essai est **suspecte**, pas rassurante.

---

## CE QUI EST OUVERT AUJOURD'HUI

Le registre complet, numéroté, avec l'ordre de réparation imposé par la
mesure : **`docs/PLAN-FINIR-DEWALT.md`** (D-01 → D-14).
Les suffixes DeWALT encore sans source : **`docs/DEWALT-SUFFIXES-A-SOURCER.csv`** (33).

---

## OÙ SONT LES AUTRES CARTES

| document | ce qu'il couvre |
|---|---|
| `docs/CARTOGRAPHIE.md` | tout le dépôt : `index.html`, `app.js`, `styles.css`, API, Firestore |
| `docs/TRAQUEUR-URLS.md` | les adresses fournisseur, telles que l'user les a envoyées |
| `docs/NOMENCLATURE.md` | les grammaires de référence, côté produit |
| `docs/METHODE-VERIF-TRAQUEUR.md` | comment on VÉRIFIE un balayage, tour par tour |
| `docs/DECISIONS.md` · `LECONS.md` · `ERREURS.md` | ce qui est tranché, cassé, payé |
| `scripts/ou.js` | l'entonnoir — **le point d'entrée, avant tout le reste** |
