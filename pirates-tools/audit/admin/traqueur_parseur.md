# Traqueur de prix + Parseur (scraper de comparateur) — cartographie factuelle

> Cartographie en **lecture seule**. Chaque affirmation porte sa preuve `Fichier:Lignes`.
> Aucun jugement, aucune correction. Chemins relatifs à `/home/user/ish/pirates-tools/`.
> Flux décrit dans l'ordre : **site source → parseur → table → algorithme → override → affichage / JSON-LD / paiement**.

---

## 0. Vue d'ensemble en une phrase

Un raccourci iPad récupère le **texte d'une page de comparateur** (le serveur est bloqué en 403),
le POST vers `/api/admin?type=price-watch` ; le serveur **parse** ce texte en `{ sku, prix, … }`,
**choisit le coût le moins cher** parmi les sources fraîches et en stock, le **transforme en prix de
vente** par le modèle de marge, et **écrit un override Firestore** (`product_overrides/{id}`) que le
rendu SSR, l'endpoint public, le JSON-LD et le paiement relisent tous.

---

## 1. Source(s) tracker · fréquence · déclencheur

### 1.1 Quelle(s) source(s) — résolution factuelle des chaînes `priceSource`

Le code manipule **trois** valeurs de source, sous forme de *slugs* :

- `'cotebrico'` — parseur `parseCotebrico` (`api/_lib/price-parse.js:64`) ; c'est aussi le **slug par défaut** quand aucun `source` n'est passé (`api/admin.js:2957-2958` : `String((req.query && req.query.source) || 'cotebrico')`).
- `'clickoutil'` — parseur `parseClickoutil` (`api/_lib/price-parse.js:199`) ; format renvoyé `format: 'clickoutil'` (`api/_lib/price-parse.js:1225`).
- `'idealo'` — parseur `parseIdealo` (`api/_lib/price-parse.js:762`) ; format `format: 'idealo'` (`api/_lib/price-parse.js:1212, 1222`).

Le `sourceSlug` (query `source`) devient la clé d'entrée de la carte `priceSources` et, via le
choix du moins cher, la valeur écrite dans `priceSource` (`api/admin.js:3664, 3667, 3689, 3774`).
La valeur `priceSource` peut donc aussi valoir `'rupture'` (aucune source achetable, `api/admin.js:3614`).

**Résolution : quelle est LA source réellement traquée aujourd'hui ?**
Un seul **plan de balayage** est déclaré, et il pointe **idealo** :

```
'DEWALT@idealo': { site: 'idealo', pages: 67, pas: 15, parPage: 60, ordre: 'desc', … }
```
`api/_lib/traqueur-plans.js:22-55`. C'est le seul plan de l'objet `PLANS` (`traqueur-plans.js:22`, un unique membre).

- `cotebrico` : parseur + **héritage** conservés (ancien format `priceSrcTTC`/`priceSource`, ré-injecté dans le min par `pwSourcesConnues`, `api/admin.js:2018-2031`), mais **aucun plan** déclaré ; les commentaires de tête le désignent comme la source historique (`api/_lib/price-parse.js:8`, « Parseur des pages « marque » de cotébrico »).
- `clickoutil` : parseur mesuré/opérationnel (`api/_lib/price-parse.js:199-265`) mais **aucun plan** dans `PLANS`.
- `idealo` : **le seul avec plan de pagination** (67 pages) → c'est la source scannée en rafale.

L'aiguillage ne devine pas le site au slug : il fait **tourner les trois parseurs** et garde
le plus fécond (`api/_lib/price-parse.js:1195-1228`, fonction `parseAuto`).

### 1.2 Types d'URL

- Page 1 : forme courte `https://www.idealo.fr/prechcat/100oM122663.html?q=dewalt&sortKey=maxPrice` (`traqueur-plans.js:46`, `patronPage1`).
- Pages 2..67 : `…/100I16-{offset}oM122663.html?q=dewalt&sortKey=maxPrice` avec `offset = (n-1)×15` (`traqueur-plans.js:45`, `patron` ; calcul de l'offset `api/_lib/price-parse.js:2814`).
- Tri `sortKey=maxPrice`, `ordre: 'desc'` → le balayage part de la **dernière page** (articles les moins chers, qui bougent le plus, `traqueur-plans.js:52-53` ; inversion `price-parse.js:2810-2811`).
- Le plan est servi par `GET /api/admin?type=price-watch-plan&brand=…&source=…` qui renvoie `urls`, `etapes`, et le `postUrl` de relevé (`api/admin.js:78-113`).

### 1.3 Fréquence + déclencheur des « 2 relevés/jour »

- **Il n'existe AUCUN cron serveur pour le traqueur.** Le seul cron déclaré est mensuel et concerne le rapport d'audience : `{ "path": "/api/cron-report", "schedule": "0 6 1 * *" }` (`vercel.json:3-5`).
- `api/cron-report.js` **ne déclenche aucun tracking** : il compile les analytics, envoie un mail Resend, purge la rétention (`api/cron-report.js:56-156`). Aucune référence au traqueur.
- Le relevé est déclenché **par le raccourci iPad de l'user** qui POST le texte de page vers `POST /api/admin?type=price-watch` (`api/admin.js:1141-1143` → `handlePriceWatch`, en-tête d'auth `x-watch-secret`, `api/_lib/auth.js:71-118`).
- Le « **2×/jour** » est une **intention produit écrite en commentaire**, pas une planification serveur : « Le relevé tourne 2×/jour et se réajuste dès la fin de la promo » (`api/_lib/price-parse.js:18-19`) ; « le relevé tourne 2x/jour » (`api/_lib/price-parse.js:108-109`). C'est la cadence du raccourci de l'user, exécuté depuis son IP.
- Le mode rafale des 67 pages : `&scan=1` maintient un cache de balayage pour éviter ~160 000 lectures Firestore (`api/admin.js:96-98` ; `api/_lib/catalog.js:212-220`, `loadCatalogAvec`).

---

## 2. Le PARSEUR — ce qu'il lit, la table qu'il bâtit

Point d'entrée : `priceParse.parseAuto(text, brand)` (`api/admin.js:3018`), qui lance les trois
parseurs et garde le plus productif (`price-parse.js:1195-1228`).

### 2.1 Prétraitement commun

- `stripHtml()` : décode entités, transforme **les balises de bloc en sauts de ligne** (`\n`) et le reste en espace — parce que tout le parseur travaille **par lignes** (`price-parse.js:31-53`, liste des balises de bloc ligne 43).
- `parsePriceFR()` : « 1 190,00 » → `1190.00`, gère espaces fines/insécables (`price-parse.js:56-60`).

### 2.2 Structure des objets produits renvoyés

Chaque parseur renvoie une liste d'**items** de forme :
```
{ sku, price, name, promo, enStock [, car, venuDOffre] }
```
- cotébrico : `price-parse.js:123` — `{ sku, price, name, promo, enStock }`.
- clickoutil : `price-parse.js:262` — `{ sku, price, name, promo, enStock:null }`.
- idealo (carte) : `price-parse.js:1179-1182` — `{ sku, price, name, promo:false, enStock:null, car }`.
- idealo (offre marchande promue) : `price-parse.js:1065-1067` — `{ …, car, venuDOffre:true }`.

Sémantique des champs :
- `price` = **prix TTC réellement affiché, promo comprise** (décision produit assumée, `price-parse.js:9-19, 106-111`).
- `promo` = booléen « ce bloc contenait un prix barré / Prix de base » — l'ancien prix **n'est jamais capturé** (`price-parse.js:21-24, 116, 260`).
- `enStock` : `true`/`false`/`null` (inconnu) selon badge de stock (`price-parse.js:87-100`).
- `car` : caractéristiques extraites du titre (voltage, Ah, pack, série, matière, pointure…) par `extraireCaracteristiques` (`price-parse.js:2187+`), via la nomenclature `nomenclature.js` (`price-parse.js:2094`).

`parseAuto` renvoie l'enveloppe `{ format, items, packs, sansRef, perdus }` (`price-parse.js:1212-1227`).

### 2.3 Parseur cotébrico (`parseCotebrico`, `price-parse.js:64-126`)

- Découpe la grille sur « **Ajouter au panier** » (fin de chaque fiche, `price-parse.js:71`).
- SKU = dernière réf `BRAND SKU` du bloc (le titre, `price-parse.js:101-105`).
- Prix = 1er `Prix X,XX €` du bloc (le prix courant précède le « Prix de base » barré, `price-parse.js:112-115`).
- État de stock lu **en tête du bloc suivant** (le badge « ✔ En stock » tombe après le bouton, `price-parse.js:75-100` ; `RUPTURE_RE` = `rupture|indisponible|épuisé|hors stock|non disponible`, `price-parse.js:147`).

### 2.4 Parseur clickoutil (`parseClickoutil`, `price-parse.js:199-265`)

- Travaille **ligne par ligne** ; ancre = ligne `X,XX € TTC` (`price-parse.js:209, 213-216`) ; le `€ HT` juste dessous **n'est jamais pris** (`price-parse.js:167-170, 260`).
- Titre = ligne au-dessus du prix (l'étiquette marque seule est sautée, `price-parse.js:218-221`).
- Titre à « + » = **pack monté par le site** → `packs` (jamais sur la réf d'un composant, `price-parse.js:228-234`).
- Réf = unique candidat `≥2 lettres, ≥1 chiffre, ≥5 car.`, hors suites d'unités (`UNITE_RE`, `price-parse.js:152, 235-262`).

### 2.5 Parseur idealo (`parseIdealo`, `price-parse.js:762-1186`)

Deux natures de blocs distinguées par **ancres**, pas par fenêtre :
- **Carte produit** (prix agrégé de N marchands) : se ferme sur `NB_OFFRES` (`^\d+ offres`) **puis** un prix `à partir de X €` / prix seul (`price-parse.js:793, 871-888`). Titre = 1re ligne `MARQUE RÉF` (`price-parse.js:794-795, 1090-1102`).
- **Offre marchande** : porte « Vendu par : » et « Détails de l'offre » (`price-parse.js:774-775, 827-857`). Ces titres sont souvent des **lots** → écartés sauf si le titre nomme **une seule réf sûre**, auquel cas l'offre est **promue** en item après passage par la **barrière d'achat** (`price-parse.js:1007-1088` ; barrière `price-parse.js:1052-1064`).
- Prix : **total en tête de ligne** vs **frais annoncés par étiquette** (`691,53 € TVA incluse` accepté ; `Frais de port : 3,23 €` rejeté) — règle structurelle (`price-parse.js:799-803, 912-918, 1014-1027`).
- Garde-fou 40 lignes : le titre d'une carte n'est jamais éjecté (`pop` vs `shift`, `price-parse.js:938-941`).
- Rendu : `{ items, sansRef, perdus }` (`price-parse.js:1185`). `perdus` (≤25) consigne tout bloc à prix non lu, avec sa raison (`price-parse.js:990-1005`).

### 2.6 Lecture de la référence dans un titre (le cœur « argent »)

`lireReferenceDuTitre(titre, brand)` → `{ ref, pourMachines, contient }` (`price-parse.js:630-755`) :
- écarte occasion/reconditionné (`OFFRE_OCCASION`, `price-parse.js:392, 634`) et « Power Set » (`OFFRE_LOT`, `price-parse.js:391, 638`) ;
- refuse les **assemblages de produits distincts** (réf collée à un `+`/`&` de 1er niveau, `assemblageDeProduits`, `price-parse.js:612-625, 640`) ;
- sépare **réf propre** / **compatibilité** (`pour/für/for/compatible`, `MOT_COMPAT` `price-parse.js:445-448`) / **contenu** de kit ;
- **une seule** réf propre ⇒ retenue ; zéro ou plusieurs ⇒ refus (`price-parse.js:716-754`).

### 2.7 Instrumentation / diagnostic

- `compterTuiles` (compte brut des ancres, `price-parse.js:1321-1329`), `titresAttendus` (`price-parse.js:1296-1307`), `annoncesManquantes` (`price-parse.js:1810`), `diagnostiquerPage` (`price-parse.js:1888`), `empreintePage` (`price-parse.js:1770`).
- `apparierParNomSouple` : appariement souple par le nom pour les fiches sans réf constructeur (`price-parse.js:1406`).

---

## 3. L'ALGORITHME — d'un coût traqué au prix affiché (verbatim)

### 3.1 Choix du coût source

`choisirCoutSource(sources, nowMs, maxAgeMs)` (`price-parse.js:2000-2015`) : parmi les entrées
`priceSources[slug] = { ttc, at, enStock }`, retient le **moins cher** parmi celles qui sont :
- `ttc > 0` (`price-parse.js:2008`),
- **pas en rupture** `enStock !== false` (`price-parse.js:2009`),
- **fraîches** : `(nowMs - at) <= maxAgeMs` (`price-parse.js:2011`) ; défaut `SOURCE_FRESH_MS = 14 j` (`price-parse.js:1983` : `14 * 24 * 3600 * 1000`).

Aucune source achetable ⇒ `raisonAucuneSource` distingue `'rupture'` / `'perime'` / `'mixte'` (`price-parse.js:2036-2053`), et `pwSourceCost` renvoie `origin:'rupture'|'perime'` → **produit gelé** (`api/admin.js:2211-2244` ; gel `pwEstGel`, `api/admin.js:2209`).

Ordre de fiabilité du coût dans `pwSourceCost` (`api/admin.js:2211-2275`) :
1. carte `priceSources` via `choisirCoutSource` → `origin:'traqueur'` (`api/admin.js:2220-2229`) ;
2. héritage `priceSource==='cotebrico'` + `priceSrcTTC` → `'traqueur'` (`api/admin.js:2249-2251`) ;
3. `p.priceSrcTTC` de la fiche → `'fiche'` (`api/admin.js:2257-2258`) ;
4. variante jumelle ± `COFFRET_COST_DELTA = 20 €` → `'variante'` (`api/admin.js:1975, 2260-2270`) ;
5. dérivé de `price_ht` → `'estimé'` : `srcTTC = (price_ht / 1,15) × (1 + tvaFR)` (`api/admin.js:2271-2273`).

### 3.2 Coût → prix (verbatim)

`pwComputePrice(product, srcTTC, cfg)` (`api/admin.js:2277-2290`) :

```js
if (!cfg || cfg.autoPrice !== false) {
  const r = priceModel.recommend(product, { costTTC: srcTTC, mode: (cfg && cfg.mode) || 'colissimo' }, cfg);
  if (r && r.priceHt > 0)
    return { newHt: r.priceHt, newPrice: pwRound2(r.priceHt * (1 + (cfg.tvaFR || 0.20))), markup: r.markup, mode: r.mode };
}
const newPrice = pwRound2(srcTTC * PW.MARGIN);          // repli ×1,15
return { newPrice, newHt: pwRound2(newPrice / PW.VAT), markup: 0.15, mode: 'legacy' };
```
`PW = { MARGIN: 1.15, VAT: 1.20, MIN_TTC: 5, MAX_TTC: 8000 }` (`api/admin.js:1964`) ; `pwRound2 = Math.round(n*100)/100` (`api/admin.js:1965`).

### 3.3 Le modèle de marge (`api/_lib/pricing-model.js`), pas à pas

`recommend(product, { costTTC, mode }, cfg)` (`pricing-model.js:216-237`) :

1. **Coût HT** : `costHT = costTTC / (1 + tvaFR)`, `tvaFR = 0.20` (`pricing-model.js:219-221, 23`).
2. **Transport** `shipFor` (`pricing-model.js:188-203`) : lettre si `poids ≤ 0,5 kg` (8 €) ; **bateau-lourd** si `poids > heavyKg(10)` (29 €) ; sinon grille Colissimo OM1 (`pricing-model.js:111, 128-134`) ; container si `mode==='container'`.
3. **Octroi** `octroiRate` = octroiExterne + octroiRegional pour `refTerritory='971'` (`pricing-model.js:144-147` ; barème délégué à `pricing.taxRatesFor`).
4. **Douane/FTD** : `5,10 €` par colis (colissimo/lettre), 0 en container (`pricing-model.js:122, 208-210`).
5. **Markup minimal** `solveMarkup` : boucle `m` de `0,02` à `3` par pas de `0,001` jusqu'à `marginAfterIS >= targetNet(0,15)` (`pricing-model.js:178-184, 24`).
6. **`evaluate`** (`pricing-model.js:155-176`), formules verbatim :
   - `priceHt = costHT * (1 + markup)`
   - `ttc = priceHt * (1 + octroi) * (1 + tvaDom)`
   - `revenueHT = priceHt * (1 + octroi)`
   - `commission = ttc * commissionPct + commissionFix` (`commissionPct = 0.010`, `commissionFix = 0.20`, `pricing-model.js:89-90` ; repli `stripePct/stripeFix`, `pricing-model.js:160-161`)
   - `octroiPaid = octroi * (costHT + ship)`
   - `costs = costHT + ship + octroiPaid + commission + packaging(0,5) + fixedPerOrder + douane`
   - `fixedPerOrder = (fixedAnnual(1000) + 12×abonnementMensuel(10)) / ordersPerYear(400)` (`pricing-model.js:137-140, 100-102`)
   - `netOp = revenueHT - costs` ; `netAfterIS = netOp × (1 - is)`, `is = 0.15` (`pricing-model.js:23, 166`)
   - `marginAfterIS = netAfterIS / revenueHT` (`pricing-model.js:174`).
7. Renvoie `priceHtFor = { price_ht: priceHt, price: round2(priceHt × (1 + tvaFR)) }` (`pricing-model.js:232`).

### 3.4 Configuration (source unique) `api/_lib/pricing-config.js`

- Doc Firestore `config/pricing`, fusionné avec `DEFAULT_CONFIG` (`pricing-config.js:32-33, 67-95`).
- Priorité **réglage enregistré > défaut** rétablie à la lecture (`fusionner`, `pricing-config.js:55-65`) : `stripePct/stripeFix` remappés vers `commissionPct/commissionFix` s'ils sont seuls fournis.
- Firestore indisponible → défauts marqués `_sourceIllisible`, **non mis en cache** (`pricing-config.js:79-92`).
- `autoPrice` par défaut `true` (`pricing-config.js:33`) → le modèle s'applique sauf `autoPrice===false` explicite (`api/admin.js:2282`).

### 3.5 Du `price_ht` d'override au prix débité/affiché

`price` stocké = **base TTC métropole** = `price_ht × 1,20` (`api/admin.js:2285`). Le prix réellement
affiché/débité est **recalculé par territoire** par `pricing.calcPrice` (`api/_lib/pricing.js:69-80`) :
```
ht = price_ht (ou price/1,2) ; ttc = ht × (1+octroiExt+octroiReg) × (1+tvaDom)
```
`unitCents = Math.round(ttc × 100)` (`pricing.js:85-87`), territoire par défaut `971` (`pricing.js:48`).

---

## 4. Les OVERRIDES Firestore — structure, cycle de vie, lecteurs

### 4.1 Document `product_overrides/{id}` — champs écrits par le traqueur

Patch appliqué (`api/admin.js:3771-3778`) :
```
price          // TTC métropole = newHt × 1,20
price_ht       // newHt (base commerciale)
priceSources   // { [slug]: { ttc, at:<nowMs number>, enStock:true } }
priceSource    // slug de la source retenue (moins chère)  |  'rupture'
priceSrcTTC    // coût effectif retenu (TTC)
priceMarkup    // priced.markup
priceMode      // priced.mode ('colissimo'/'legacy'/…)
priceCheckedAt // serverTimestamp (`now`)
promoDepuis    // serverTimestamp | null
promoAncienPrix// refMin 30 j | null
```
Variantes du patch : rupture (`api/admin.js:3609-3617`), prix inchangé mais coût à enregistrer (`api/admin.js:3687-3692`).
`priceSources.at` est un **nombre** (`nowMs`) car lu en arithmétique de fraîcheur ; `priceCheckedAt`/`promoDepuis` sont des **serverTimestamp** (`api/admin.js:3498-3505, 3782-3793`).

`price_watch_log/{auto}` (journal des mouvements, `api/admin.js:3780-3795`) :
`{ sku, id, oldPrice, newPrice, srcTTC, source(sourceSlug), brand, at:<nowMs>, markup, mode }`.

### 4.2 Cycle de vie

- **Créé/mis à jour** : à chaque relevé, `set(..., { merge: true })` (`api/admin.js:3616, 3691, 3777`) ; cache local du scan `pwMajLocale` (`api/admin.js:2905-2915`).
- **Rupture** : `enStock:false` écrit, coût recalculé sans cette source ; gel si rien d'achetable (`api/admin.js:3603-3620`).
- **Périmé** : entrée > 14 j ignorée par `choisirCoutSource` → gel `origin:'perime'` (`api/admin.js:2230-2243`).
- **Promo** : posée si `newPrice < min(30 j réel)` relu de `price_watch_log` (`api/admin.js:3744-3776`) ; **expire à la lecture** à 2 mois dans `applyOverrides` (`catalog.js:153-177`), jamais par cron.
- **Verrou** `priceLocked:true` : le traqueur relève mais **n'écrit jamais** (`api/admin.js:3626`).
- **Fiche créée à la main** : override portant `creeALaMain` devient une fiche (`catalog.js:116-144`).
- **Invalidation cache** après écriture : `catalog.invalidateOverrides()` (`api/admin.js:3800` ; `catalog.js:183-190`).

### 4.3 Qui LIT les overrides (liste exhaustive)

Toutes les lectures passent par la fusion `applyOverrides` (`catalog.js:146-181`), via `loadCatalog*`.

| Lecteur | Fichier:Lignes | Ce qu'il lit / fait |
|---|---|---|
| **Rendu SSR (page produit)** | `render.js:304-352` (`pageProduit`) via `loadCatalogEtat` | HTML serveur ; prix par `pricing.calcPrice`. |
| **JSON-LD Product** | `render.js:265-302` (`jsonldProduit`), injecté `render.js:241-242, 349` | `offers.price = pricing.calcPrice(p, 971).ttc` ; **aucune offre si prix non confirmés** (`render.js:280`). |
| **JSON-LD ItemList (catalogue)** | `render.js:414, 435` | liste + JSON-LD dérivés du même catalogue. |
| **Endpoint public `/api/products`** | `catalog.js:5, 244-259` (`loadPublicCatalog`) | fusion + `toPublic` retire `PRIVATE_FIELDS` (`catalog.js:227-242`). |
| **Client (front)** | `api/admin.js:143-147` (commentaire flux) | peint `products.json` puis bascule sur `/api/products` sous 6 s. |
| **Paiement** | `create-payment-intent.js:154, 166-190` | `loadCatalogEtat` + `findByKey` + `pricing.unitCents` ; **refuse si `!prixConfirmes`** → 503 `PRIX_NON_CONFIRMES` (`create-payment-intent.js:155-163`). |
| **Admin (marges, reprice, export)** | `api/admin.js:1057-1108, 2310-2312, 3457` | lecture directe `product_overrides`. |
| **Traqueur lui-même** | `api/admin.js:3457` (`ovSnapW`), héritage `pwSourcesConnues` | relit les sources connues avant d'écrire. |

Champs jamais publics : `PRIVATE_FIELDS = [priceSource, priceSrcTTC, priceCheckedAt, priceMarkup, priceMode, priceRecomputedAt, priceCostOrigin, priceSources, hidden]` (`catalog.js:227-236`) ; JSON-LD sort les champs **un par un** (`render.js:256-259, 265-301`).

---

## 5. Garde-fous EXISTANTS (ce qui est en place aujourd'hui)

- **Parse échoue / rien reconnu** : `parseAuto` garde le parseur le plus fécond ; s'il ne reste rien (ni fiche ni annonce) → `format:'aucun'` (`price-parse.js:1199-1215`). Texte `< 200` car. → `400` avec **diagnostic** (`api/admin.js:2973-3009`). `diagnostiquerPage` sur `dryRun` mesure chaque hypothèse (`price-parse.js:1888+`, appelée en dryRun).
- **Prix aberrant** : bornes **absolues** `MIN_TTC=5` / `MAX_TTC=8000` — hors fourchette ⇒ `flagged`, **pas** appliqué (`api/admin.js:1964, 3699, 3719`). Le **plafond de variation 25 % (MAX_MOVE) a été RETIRÉ** (décision D-015, `api/admin.js:1955-1963, 3700-3718`) : une hausse réelle du fournisseur n'est plus bloquée.
- **Le site change son HTML** : trois parseurs concurrents + aiguillage au plus fécond (`price-parse.js:1195-1228`) ; registre `perdus` (`price-parse.js:990-1005`), `compterTuiles`/`titresAttendus`/`annoncesManquantes` mesurent l'écart entre tuiles vues et lues (`api/admin.js:3569-3572`, `pwBornerLues` `api/admin.js:2108-2113`).
- **Produit disparu de la source** : listé dans `absents` / `jamaisReleves` (`api/admin.js:3822-3839`) ; son coût réel est **conservé** tant qu'il n'est pas périmé (14 j) puis **gel** `origin:'perime'` (`api/admin.js:2230-2243`).
- **Rupture chez le fournisseur** : `enStock:false` exclut la source, gel si rien d'achetable (`api/admin.js:3603-3620` ; `choisirCoutSource` `price-parse.js:2009`).
- **Config illisible (quota/réseau Firestore)** : le traqueur **refuse d'écrire** hors dryRun → 503 (`api/admin.js:3493-3495`) ; idem `handleRepriceAll` (`api/admin.js:2305-2307`).
- **Prix non confirmés côté lecture** : après `CACHE_PANNE_MAX = 15 min` de panne Firestore, `prixConfirmes=false` (`catalog.js:34-107, 197-205`) → **paiement refusé** (`create-payment-intent.js:155-163`) et **JSON-LD sans offre** (`render.js:280`).
- **Fuite de coût d'achat** : `check-prix-fuite.js` interdit `priceSrcTTC` & co dans `products.json` servi publiquement (`scripts/check-prix-fuite.js:1-35`) ; `PRIVATE_FIELDS` filtre l'endpoint (`catalog.js:227-242`).
- **Verrou produit** : `priceLocked` (`api/admin.js:3626`).
- **Anti-écrasement en rafale** : dans une même rafale, on garde le **coût min** vu, pas le dernier (`pwRafaleCoutMin`, `api/admin.js:3639-3663`).

---

## 6. `priceCheckedAt` — écritures et lectures

**Écrit** (serverTimestamp `now`) à chaque `set` d'override :
- `api/admin.js:3617` (rupture), `:3692` (inchangé), `:3778` (appliqué) — via `Object.assign({}, patch, { priceCheckedAt: now })`.
- Copie locale du scan en **nombre** `nowMs` (`pwMajLocale`, `api/admin.js:2907`).

**Lu** :
- JSON-LD : `releve = enMillis(p.priceCheckedAt || p.priceRecomputedAt)` (`render.js:291`) ; si `> 0` :
  - `offre.validFrom = date(releve)` (`render.js:296`),
  - `offre.priceValidUntil = date(releve + 14 j)` (`render.js:297`, fenêtre de fraîcheur D-112).
- Traqueur : `enMillis(o.priceCheckedAt)` pour dater l'héritage cotébrico dans le min (`api/admin.js:2024-2028`).
- Journal des mouvements : `enMillis(v.at)` (relit `price_watch_log`, `api/admin.js:633`).

`enMillis` ramène nombre / Timestamp / sentinel en ms réelles (`price-parse.js:1994-1998`).

---

## 7. SCHÉMA TEXTE du flux complet

```
[Raccourci iPad]  GET /api/admin?type=price-watch-plan&brand=DEWALT&source=idealo
      │                       └─► traqueur-plans.js PLANS['DEWALT@idealo'] → planBalayage() → 67 URLs (ordre desc)
      │
      ▼  (pour chaque page, récupérée depuis l'IP de l'user, le serveur étant en 403)
[Raccourci iPad]  POST /api/admin?type=price-watch&brand=DEWALT&source=idealo&scan=1
      │  corps { text:<texte de la page idealo> }, en-tête x-watch-secret
      ▼
auth.requireWatch (auth.js:71)  ──►  handlePriceWatch (admin.js:2917)
      ▼
priceParse.parseAuto(text)  ──►  [cotebrico | clickoutil | idealo], le + fécond gagne (price-parse.js:1195)
      │                                    └─► items { sku, price(TTC affiché), promo, enStock, car }
      │                                    └─► packs / sansRef / perdus (listés, jamais devinés)
      ▼
appariement fiche  (sku exact → racineRef → racineModele+variante → srcNom)   (admin.js:3598, 2044)
      ▼
priceSources[slug] = { ttc, at:nowMs, enStock } ; choisirCoutSource → MOINS CHER frais & en stock (price-parse.js:2000)
      │        (rupture/perime → GEL, prix inchangé)
      ▼
pwComputePrice → pricing-model.recommend  (costTTC/1,2=costHT ; markup mini pour marge nette 15 % après IS)
      │        newHt = priceHt ;  newPrice = round2(priceHt × 1,20)   (admin.js:2285 / pricing-model.js:216)
      │        bornes MIN_TTC 5 / MAX_TTC 8000  (sinon flagged, pas écrit)
      ▼
set product_overrides/{id}  { price, price_ht, priceSources, priceSource, priceSrcTTC, priceMarkup,
      │                        priceMode, priceCheckedAt(serverTS), promoDepuis, promoAncienPrix }
      │        + add price_watch_log { oldPrice, newPrice, at:nowMs, … }
      ▼
catalog.applyOverrides (fusion products.json + overrides ; promoActive expire à la lecture 2 mois)
      ├─► render.js pageProduit → HTML SSR
      ├─► render.js jsonldProduit → offers.price = calcPrice(971).ttc ; validFrom/priceValidUntil = priceCheckedAt (+14 j)
      ├─► /api/products (loadPublicCatalog, PRIVATE_FIELDS retirés) → front (après products.json)
      └─► create-payment-intent → unitCents(product, territoire) ; refuse si prix non confirmés (panne > 15 min)
```

---

## 8. Outils hors-ligne (scripts) rattachés au traqueur

- `scripts/classer-idealo.js` — classe **tout** un balayage idealo en 3 familles (électro/quincaillerie/vêtements), vire doublons (racineModele+variante, moins cher gagne), sort CSV/JSON ; n'écrit aucun prix (`classer-idealo.js:1-43, 55-61`).
- `scripts/comparer-site-idealo.js` — compare le catalogue DeWALT au coût idealo ligne à ligne, CSV ; ne réécrit rien ; appariement racine+variante (`comparer-site-idealo.js:3-32, 48-55`).
- `scripts/aligner-prix-idealo.js` — répercute les coûts idealo sur les prix via `pricing-model.recommend` (même chemin que le traqueur), essai par défaut + sauvegarde (`aligner-prix-idealo.js:3-40`).
- `scripts/aligner-prix-affiches.js` — remet `price = round2(price_ht × (1+vat))` dans `products.json` (affiché = débité), aperçu sans `--ecrire`, relit après écriture (`aligner-prix-affiches.js:1-69`).
- `scripts/bilan-traqueur.js` — dit combien de fiches **ne seront pas traitées** en mode réel, en rejouant les 3 index d'appariement de `admin.js` (`bilan-traqueur.js:3-25`).
- `scripts/check-price-watch.js` — porte CI : règle « min des sources » (`pickCheapestSource`), branchement dans `handlePriceWatch`, offre cherchée dans les deux seaux (`check-price-watch.js:1-45`).
- `scripts/check-traqueur.js` — porte : chaque marque du catalogue a une source vivante (prévient les « prix estimés » silencieux) (`check-traqueur.js:1-40`).
- `scripts/check-plan-traqueur.js` — porte : chaque plan tient debout, le secret ne fuit pas dans une URL (`check-plan-traqueur.js:1-40`).
- `scripts/check-prix-confirmes.js` — porte : on ne vend pas à un prix non confirmable (panne Firestore) (`check-prix-confirmes.js:1-32`).
- `scripts/check-prix-fuite.js` — porte : le prix d'achat ne sort jamais dans `products.json` public (`check-prix-fuite.js:1-35`).

---

## 9. Signalements factuels (constats, sans correctif)

1. **Déclarations dupliquées dans `price-parse.js`.** `SERIES` est défini deux fois — d'abord dérivé de la nomenclature (`price-parse.js:2096`, `nomen.GAMMES`), puis **réécrasé** par un tableau en dur (`price-parse.js:2109`). `BOITES` de même (`price-parse.js:2097` puis `:2110`, valeur identique). La première définition (issue de la nomenclature) est donc morte : c'est la liste codée en dur ligne 2109 qui prévaut.
2. **Fréquence « 2 relevés/jour » sans support serveur.** Les commentaires affirment « le relevé tourne 2×/jour » (`price-parse.js:18-19, 108-109`), mais `vercel.json:3-5` ne déclare **qu'un** cron mensuel (`cron-report`), qui **ne déclenche pas** le traqueur. La cadence dépend entièrement du raccourci iPad ; rien dans le dépôt ne la garantit ni ne la mesure.
3. **`cotebrico` et `clickoutil` sans plan de balayage.** `PLANS` ne contient que `DEWALT@idealo` (`traqueur-plans.js:22-55`). Un POST `source=cotebrico`/`clickoutil` reste possible (parseurs actifs, slug par défaut `cotebrico` `api/admin.js:2957`), mais `GET …type=price-watch-plan` pour ces sources renvoie `404` (`api/admin.js:82-92`). Le slug par défaut (`cotebrico`) ne correspond donc **pas** à la seule source planifiée (`idealo`).
4. **Deux référentiels de config Firestore nommés différemment.** `pricing-config.js` lit/écrit le doc `config/pricing` (`pricing-config.js:2-3, 74, 130`), tandis que les commentaires de `pricing-model.js` désignent la config admin comme Firestore `pricing_config` (`pricing-model.js:18, 27-30`). Le chemin réellement utilisé est `config/pricing` ; le commentaire du modèle cite un autre nom.
5. **`priceRecomputedAt` / `priceCostOrigin` listés mais non écrits par le traqueur.** Ces champs figurent dans `PRIVATE_FIELDS` (`catalog.js:229`) et sont lus en repli par le JSON-LD (`render.js:291`), mais `handlePriceWatch` n'écrit que `priceCheckedAt` (aucune écriture de `priceRecomputedAt` trouvée dans `handlePriceWatch`) — ils proviennent d'un autre chemin (reprice-all).
