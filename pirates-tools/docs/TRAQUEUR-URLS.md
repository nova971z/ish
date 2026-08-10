# 🔁 Traqueur de prix — URL des raccourcis iPad (sauvegarde)

> ⛔⛔ **PHASE D'ESSAI — TOUTES LES ADRESSES CI-DESSOUS PORTENT `&sec=1`.**
> Décision D-018 de l'user, 03/08/2026 : « on continue de tester à sec, je ne
> veux pas que ça utilise Firebase pour l'instant ». Le 04/08, je lui ai fait
> remplacer ce drapeau par `&dryRun=1` pour obtenir ses baisses de prix :
> `dryRun` n'écrit rien, mais il **lit la collection entière** — mesuré, ~3 780
> lectures par balayage contre **zéro** à sec. Son quota a sauté et son
> administration s'est fermée.
> ⛔ Le mode à sec **calcule désormais les prix** : il n'y a plus aucune raison
> d'en sortir. `check-mode-essai` refuse toute adresse écrite ici sans `sec=1`
> tant que D-018 dit `EN VIGUEUR` dans `docs/DECISIONS.md`.


> ⛔⛔ **CE FICHIER EST UNE COPIE DE SECOURS. IL NE PROUVE RIEN.**
> La configuration qui TOURNE vit dans l'app Raccourcis de l'iPad de l'user.
> Ce document ne peut que la retranscrire — et il se périme sans prévenir.
>
> **Le 01/08/2026, je l'ai lu et j'ai affirmé à l'user que son raccourci
> Festool tournait en simulation.** C'était faux : sa capture d'écran montrait
> `dryRun=0`. Le document était en retard, pas son installation. J'ai construit
> un diagnostic entier, et une porte, sur cette lecture — et je le lui ai
> annoncé comme un fait.
>
> ⛔ **On ne déduit JAMAIS l'état réel des raccourcis depuis ce fichier.**
> On le demande, ou on le lit sur une capture. Écart connu au 01/08/2026 :
> `resultsPerPage` de Festool valait 100 ici, 112 en vrai.

> Si l'app **Raccourcis** bugge et efface les shortcuts, tout est ici pour les
> reconstruire à l'identique. Chaque raccourci = **3 actions « Obtenir le contenu
> de l'URL »** dans cet ordre :
>
> 1. **health** → autorise `pirates-tools.com` (GET, ne rien changer).
> 2. **cotébrico** → la page marque, tous les produits sur UNE page (GET).
> 3. **POST** → `…/api/admin?type=price-watch&brand=…&sec=1` : Méthode **POST**, Corps
>    **JSON**, champ **`text`** = variable **« Contenu de l'URL »** (la ligne
>    cotébrico juste au-dessus). **En-tête obligatoire** (section « En-têtes ») :
>    Clé = **`x-watch-secret`**, Valeur = **ta clé `WATCH_SECRET` complète**
>    (Vercel → Settings → Environment Variables ; JAMAIS écrite dans le repo).
>    Coller la clé EN ENTIER, sans rien collé en trop autour.

> 🔑 **CHANGEMENT DU 31/07/2026 — `x-admin-secret` → `x-watch-secret`.**
> L'étape A5 a retiré `ADMIN_SECRET` de Vercel : l'administration passe
> désormais par le claim Firebase, plus fort et révocable. Mais un raccourci
> iPad ne peut pas produire de jeton Firebase — il expire chaque heure. Le
> traqueur est donc tombé en `401 Invalid admin credentials`, et **les prix
> fournisseur ont cessé d'être relevés en silence**.
>
> Remettre `ADMIN_SECRET` aurait rouvert TOUTE l'administration — commandes,
> clients, overrides — à un secret rejouable. Le traqueur a donc sa propre clé :
> elle n'ouvre que `price-watch`, ne peut écrire que des prix fournisseur, et se
> révoque seule sans toucher à l'accès administrateur.
>
> **À faire une fois** : Vercel → Settings → Environment Variables → ajouter
> `WATCH_SECRET` avec une longue suite aléatoire, puis redéployer. Mettre la
> même valeur dans l'en-tête `x-watch-secret` des deux raccourcis.
> ⚠️ Tant que `WATCH_SECRET` n'existe pas, l'ancien couple
> `ADMIN_SECRET` / `x-admin-secret` reste accepté **s'il est encore défini** :
> aucun raccourci qui marchait ne casse à cause de ce changement.
>
> ⚠️ NE PAS remettre d'action « Ajouter à Pages » / « Combiner » : c'est ce qui
> déclenchait le blocage « contenu web » d'iOS. Le contenu cotébrico va DIRECT
> dans le corps du POST.
>
> Planification : 2 automatisations horaires par marque (**8 h** et **20 h**).

La **1ʳᵉ URL (health) est identique pour les 3 marques** :
`https://pirates-tools.com/api/health`

---

## 🟡 DeWALT
1. `https://pirates-tools.com/api/health`
2. `https://www.cotebrico.fr/4/dewalt?order=product.price.desc&resultsPerPage=200`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=DEWALT&sec=1`

## 🔵 Makita
1. `https://pirates-tools.com/api/health`
2. `https://www.cotebrico.fr/1/makita?order=product.price.desc&resultsPerPage=800`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=MAKITA&sec=1`

> ⚠️ **URL CORRIGÉE le 26/07/2026.** L'ancienne était filtrée
> (`nombre_de_batteries_fournies-aucune` + `type_de_moteur-brushless` +
> `tension-18_v` + `en_stock-oui`) : elle EXCLUAIT donc structurellement tous
> les kits avec batteries, tous les modèles à charbons, les filaires et les
> produits en rupture — soit la majorité des 87 Makita du catalogue, qui
> n'avaient JAMAIS de coût relevé. Ne jamais remettre de filtre ici : le
> traqueur ne peut voir que ce que la page contient.

## ⚫ Festool
1. `https://pirates-tools.com/api/health`
2. `https://www.cotebrico.fr/8-outils-electroportatifs/s-1/marque-festool/categories_2-outils_electroportatifs?resultsPerPage=112`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=FESTOOL&sec=1`

> ⚠️ **CE DOCUMENT ÉTAIT EN RETARD, PAS LE RACCOURCI.** Il portait encore
> `dryRun=1` et `resultsPerPage=100` le 01/08/2026, alors que le raccourci
> réel de l'user était déjà en `dryRun=0` avec `resultsPerPage=112`.
> Corrigé d'après SA capture d'écran — la seule source qui fasse foi ici.

---

## 🔁 DeWALT — idealo, 67 PAGES EN BOUCLE (03/08/2026)

> ⛔ **PLUS AUCUNE URL À TAPER.** Les 67 adresses sont fabriquées par le
> serveur, dans l'ordre de balayage, et le raccourci boucle dessus. Le jour où
> la pagination du site change, elle change **à un seul endroit** —
> `api/_lib/traqueur-plans.js` — sous le contrôle de la CI.

Le raccourci a **quatre** actions au lieu de trois :

1. **health** — `https://pirates-tools.com/api/health`
   *(GET. Il rend aussi `build.commit` : c'est lui qui dit quel code tourne.)*
2. **le plan** — `https://pirates-tools.com/api/admin?type=price-watch-plan&brand=DEWALT&source=idealo`
   GET, **en-tête `x-watch-secret`** = la clé `WATCH_SECRET`.
   Rend `{ urls: [ …67 adresses… ], postUrl, pages, aVerifier }`.
3. **Répéter pour chaque** élément de `urls` :
   a. « Obtenir le contenu de l'URL » sur l'élément courant *(GET, la page)* ;
   b. « Obtenir le contenu de l'URL » sur
      `https://pirates-tools.com/api/admin?type=price-watch&brand=DEWALT&source=idealo&scan=1&sec=1`
      — **POST**, corps **JSON**, champ **`text`** = le contenu obtenu en (a),
      en-tête **`x-watch-secret`**.
      *(C'est exactement la valeur de `postUrl` rendue à l'étape 2.)*

> ⛔ **`&scan=1` N'EST PAS FACULTATIF.** Sans le cache de balayage, 67 pages
> relisent la collection à chaque page : le quota Firestore a déjà sauté une
> fois (02/08, « 8 RESOURCE_EXHAUSTED » sur son écran). L'adresse rendue par
> le plan le porte déjà — il n'y a rien à ajouter.

> ⛔ **L'ORDRE EST VOULU.** La page est triée par prix **décroissant**, donc le
> balayage part de la **dernière** page : c'est là que sont les articles les
> moins chers, ceux dont le prix bouge le plus. En tri croissant, on partirait
> de la première.

> ⚠️ **CE QUI RESTE SUPPOSÉ, ET COMMENT LE TRANCHER.** Le **pas** de la
> pagination (15 par page) est déduit de deux points seulement : l'URL envoyée
> pour « la page sept » porte `-90`, et la page déclare 67 pages.
> **Deux points de données ne font pas une grammaire** — c'est E-112, déjà
> payée. Le balayage le prouve tout seul : si le pas est juste,
> `couverture.refsDistinctes` croît d'environ **60 par page** ; s'il est trop
> petit, les pages se recouvrent et le compteur **stagne**. Aucun calcul à
> faire : c'est le premier balayage qui répond.

---

---

## 🧩 L'ANATOMIE DU RACCOURCI — LES 9 BLOCS, UNE FOIS POUR TOUTES

> ⛔⛔ **GRAVÉ LE 10/08/2026, SUR SA CAPTURE D'ÉCRAN.** Je lui avais donné une
> recette à quatre lignes à remplacer (URL de page 1, gabarit `[Nombre
> formaté]`, « Répéter 66 fois », « × 15 »). **Elle était fausse** : elle
> décrivait une version du raccourci qu'il n'utilise plus. Son raccourci réel
> **ne fabrique AUCUNE URL** — il demande le PLAN au serveur et boucle dessus.
> C'est tout l'intérêt du point d'entrée `price-watch-plan` : le jour où la
> pagination du site change, elle change dans `traqueur-plans.js`, et aucun
> raccourci n'est à retoucher.
>
> ⚠️ Ce que je lis sur SA capture, bloc par bloc — pas ce que j'imagine :

| # | Le bloc | Ce qu'il contient |
|---|---|---|
| **1** | Obtenir le contenu de | `https://pirates-tools.com/api/health` |
| **2** | Obtenir le contenu de | `https://pirates-tools.com/api/admin?type=price-watch-plan&brand=`**`DEWALT`**`&source=idealo` |
| **3** | Obtenir **Valeur** pour `urls` dans | Contenu de l'URL *(du bloc 2)* |
| **4** | **Répéter avec chaque élément dans** | Valeur du dictionnaire *(du bloc 3)* |
| **5** | ↳ Obtenir le contenu de | **Élément de répétition** *(l'adresse fournisseur)* |
| **6** | ↳ Définir la variable | **Page** sur Contenu de l'URL *(du bloc 5)* |
| **7** | ↳ Obtenir le contenu de | `type=price-watch&brand=`**`DEWALT`**`&source=idealo&scan=1&bref=1&manquants=1&inconnus=1` — ⛔ **sa capture ne montre PAS `sec=1`**, voir l'encadré ci-dessous |
| **8** | **Fin de la récurrence** | — |
| **9** | *(coupé en bas de sa capture)* | ⚠️ **NON LU** — je ne l'invente pas |

### ⛔ POUR UNE NOUVELLE MARQUE : DEUX CHOSES CHANGENT, PAS QUATRE

**Bloc 2** et **bloc 7** — le `brand=`. **Rien d'autre.**

| Bloc | Avant | Après (exemple Milwaukee) |
|---|---|---|
| **2** | `…price-watch-plan&brand=DEWALT&source=idealo` | `…price-watch-plan&brand=`**`MILWAUKEE`**`&source=idealo` |
| **7** | `…price-watch&brand=DEWALT&source=…&scan=1&sec=1&bref=1&manquants=1&inconnus=1` | `…price-watch&brand=`**`MILWAUKEE`**`&source=idealo&scan=1&sec=1&bref=1&manquants=1&inconnus=1` |

> ### ⛔⛔ CE QUE SA CAPTURE RÉVÈLE, ET QUE JE NE CORRIGE PAS EN DOUCE
>
> Le bloc 7 de son écran ne porte **pas** `&sec=1`. Or la décision **D-018**
> (« on continue de tester à sec, je ne veux pas que ça utilise Firebase pour
> l'instant ») est écrite **EN VIGUEUR** et n'a jamais été levée — et c'est une
> porte de la CI qui l'a signalé, pas moi.
>
> Ce que ça change, mesuré : sans `sec=1`, un balayage lit la collection
> entière — **~3 780 documents**, ce qui a fermé son administration le 04/08.
> Avec `sec=1`, le serveur lit `products.json` **sur le disque**, ne touche pas
> Firestore et ne peut RIEN écrire par construction.
>
> **Donc, dans cet ordre :**
> 1. **premier passage AVEC `&sec=1`** — il prouve le câblage (format reconnu,
>    nombre d'articles lus, lesquels correspondent à une fiche), sans quota :
>    `…?type=price-watch&brand=MILWAUKEE&source=idealo&scan=1&sec=1&bref=1&manquants=1&inconnus=1`
> 2. **ensuite seulement**, retirer `&sec=1` pour un vrai relevé — et c'est SA
>    décision, parce que c'est SA décision D-018 qui l'interdit aujourd'hui.

**Ce qui ne bouge JAMAIS** : le bloc 1 (`/api/health`), les blocs 3 à 6 et 8,
l'en-tête `x-watch-secret` sur les blocs 2 et 7, la méthode **POST** et le
champ **`text`** = variable **Page** sur le bloc 7.

⚠️ **Aucune URL fournisseur n'apparaît dans le raccourci.** Elles vivent
toutes dans `api/_lib/traqueur-plans.js`, côté serveur. C'est là — et là
seulement — que les adresses d'une nouvelle marque s'écrivent.

### Les quatre drapeaux du bloc 7, et pourquoi ils y sont

- **`scan=1`** — le cache de balayage. ⛔ **Pas facultatif** : sans lui, chaque
  page relit la collection entière et le quota a déjà sauté (01/08).
- **`bref=1`** — la réponse allégée. Une réponse pleine fait 50 480 signes ;
  sur 67 pages, son iPad ne peut ni l'écrire ni la recopier.
- **`manquants=1`** — la liste NOMMÉE des fiches qu'aucune page n'a retrouvées.
- **`inconnus=1`** — les références vues chez le fournisseur avec leur TITRE.
  Sans elles, « pourquoi cette référence n'est pas reconnue ? » n'a pas de
  réponse.

### Ce que je dois faire quand il dit « on crée le traqueur pour telle marque »

1. Il envoie les URL de **page 1, 2, 3 et dernière** *(quatre points : la loi
   de pagination est PROUVÉE, pas déduite — E-112)*.
2. J'ajoute le plan dans **`api/_lib/traqueur-plans.js`** : `pages`, `pas`,
   `parPage`, `ordre`, `patron`, `patronPage1`, `patronRecherche`.
   ⛔ `patronRecherche` est **obligatoire** — une porte le vérifie.
3. Je vérifie : le bon nombre d'adresses, **0 doublon**, aucun gabarit
   `{offset}` resté en place, page 1 sur son chemin propre.
4. Je lui rends **les deux lignes** du tableau ci-dessus, avec sa marque.
5. Je lui dis s'il a des fiches de cette marque au catalogue — sinon le premier
   balayage **découvre** au lieu de mettre à jour, et il faut le savoir avant.

---

## 🔴 MILWAUKEE — idealo, 67 PAGES (plan déclaré le 10/08/2026)

> **Le plan est en place** : `MILWAUKEE@idealo`, catégorie `M140603`, 67 pages.
> Ses quatre adresses donnent le pas : 0, 15, 30 et 990 = 66 × 15. **Le pas est
> PROUVÉ**, c'est le premier des trois plans dans ce cas.
>
> **Dans le raccourci dupliqué, deux blocs à modifier :**
>
> - **Bloc 2** → `https://pirates-tools.com/api/admin?type=price-watch-plan&brand=MILWAUKEE&source=idealo`
> - **Bloc 7** → `https://pirates-tools.com/api/admin?type=price-watch&brand=MILWAUKEE&source=idealo&scan=1&sec=1&bref=1&manquants=1&inconnus=1`
>   *(le `&sec=1` est le premier passage, celui qui prouve le câblage sans quota — voir l'encadré D-018 plus haut)*
>
> Rien d'autre. Pas d'URL idealo à taper : le bloc 2 les rapporte toutes.
>
> ⛔ **AUCUNE FICHE DE CETTE MARQUE AU CATALOGUE** (mesuré : Makita 611,
> DeWALT 1047, Festool 50, Milwaukee 0). Le premier balayage ne mettra **aucun
> prix à jour** — il DÉCOUVRE, et tout sort dans `inconnus`. Ce n'est pas une
> panne.
>
> ⚠️ **Ce qui reste à vérifier, et se vérifie tout seul** : `parPage = 60` est
> supposé identique aux deux autres marques. `tuilesDansLaPage` le mesure page
> par page, et `couverture.refsDistinctes` doit croître d'environ 60 par page.

## ➕ AJOUTER UN TRAQUEUR (autre site) — depuis le 01/08/2026

Même raccourci en 3 actions, avec **deux différences** :

1. l'URL 2 = la page « marque » du NOUVEAU site (tous les produits, une page) ;
2. l'URL 3 porte **`&source=<slug>`** — un nom court pour ce site, en
   minuscules : `…/api/admin?type=price-watch&brand=MAKITA&source=nouveausite&sec=1`
   *(premier passage en `dryRun=1` pour lire ce qui est reconnu, puis `0`.)*

**Le calculateur prend TOUJOURS le moins cher des sources valides** — fraîches
(moins de 14 jours) ET en stock. Chaque site écrit sa propre entrée ; aucun
n'écrase l'autre. Sans `source=`, c'est `cotebrico` : les raccourcis existants
ne changent pas.

⛔ **Un produit EN RUPTURE ne fait jamais bouger un prix.** Sa rupture est
enregistrée, sa source est écartée du choix, et s'il ne reste AUCUNE source
achetable, le produit est **GELÉ** — visible dans « Sur quoi reposent tes
prix » (⛔ gelés) et dans la réponse du traqueur (`rupture`).
⚠️ La détection lit le badge « En stock » / « Rupture » de la grille ; si un
site l'écrit autrement, une capture d'une carte en rupture suffit à ajuster
`RUPTURE_RE` dans `api/_lib/price-parse.js`.

## 🟤 DeWALT — clickoutil (2ᵉ source, créé par l'user le 01/08/2026)
1. `https://pirates-tools.com/api/health`
2. `https://www.clickoutil.com/recherche?controller=search&s=Dewalt&order=product.price.desc&resultsPerPage=600`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=DEWALT&source=clickoutil&sec=1`

> Retranscrit depuis SES captures du 01/08/2026 (IMG_5578 → IMG_5579 : il a
> ajouté `&source=clickoutil` lui-même entre les deux).
>
> **Le format est lu depuis le 01/08/2026 au soir**, en deux temps :
> le parseur a d'abord été prouvé sur le document Pages (554 titres) — puis
> le `diagnostic` DU FLUX RÉEL a montré que le raccourci n'envoie pas le
> HTML mais le TEXTE de la page, **sans aucun « Ajouter au panier »**
> (`boutonsPanier: 0` — E-605 : la copie n'était pas le flux). Le parseur
> travaille donc PAR LIGNES, sur l'ancrage présent dans les deux corpus :
> titre `… RÉF … DEWALT` · ligne marque seule · ligne « X,XX € TTC »
> (le « € HT » n'est jamais pris ; en promo le barré suit le TTC sur sa
> ligne). Aucun badge de stock par carte sur cette grille.
> **Packs montés par le site écartés et listés** (`packsIgnores` — leur prix
> ne s'écrit jamais sur la réf d'un composant), titres sans réf sûre écartés
> et listés (`sansRef`). Rien n'est silencieux.
>
> **Prochain geste** : un passage en `dryRun=1` pour confirmer le bout-en-bout
> (attendu : `format: "clickoutil"`, `parsed` ≈ 145–150), puis `dryRun=0`.

## 🧭 DeWALT — idealo, BALAYAGE DES 67 PAGES (3ᵉ source, construction du 02/08/2026)

> **Sa demande, mot pour mot : « il y a 67 pages, il faut absolument toutes les
> scanner » — avec SES URL** (liste filtrée DeWALT, tri `maxPrice` décroissant).
> Ses pages 4/5/67 ont confirmé la loi : page N = offset `(N−1)×15` dans le
> chemin (page 67 = `100I16-990`, et 990 = 66×15 ✓).
>
> **Un seul raccourci, une boucle « Répéter ». Actions dans cet ordre :**
>
> 1. **Obtenir le contenu de l'URL** → `https://pirates-tools.com/api/health`
>    (GET — réveille le serveur et autorise le domaine).
> 2. **Obtenir le contenu de l'URL** → page 1, SON URL exacte :
>    `https://www.idealo.fr/prechcat/100oM122663.html?q=dewalt&sortKey=maxPrice`
> 3. **Obtenir le contenu de l'URL** → POST
>    `https://pirates-tools.com/api/admin?type=price-watch&brand=DEWALT&source=idealo&scan=1&sec=1`
>    — Méthode **POST**, Corps **JSON**, champ **`text`** = « Contenu de l'URL »
>    (l'action 2). En-tête : `x-watch-secret` = la clé complète.
> 4. **Répéter 66 fois** — et DANS la répétition :
>    5. **Calculer** : « Indice de répétition » **× 15** (l'indice 1 → 15 = la
>       page 2 … l'indice 66 → 990 = la page 67).
>    6. **Formater le nombre** : le résultat du calcul, **0 décimale** (sans ça,
>       iOS peut écrire « 15,0 » dans l'URL).
>    7. **Texte** :
>       `https://www.idealo.fr/prechcat/100I16-[Nombre formaté]oM122663.html?q=dewalt&sortKey=maxPrice`
>    8. **Obtenir le contenu de l'URL** → le Texte (GET, comme l'action 2).
>    9. **Obtenir le contenu de l'URL** → le MÊME POST que l'action 3 (mêmes
>       réglages, même en-tête), champ `text` = « Contenu de l'URL » de l'action 8.
>    (fin de répétition)
>
> ⚠️ **Pas d'action « Combiner » ni « Ajouter à Pages »** (blocage « contenu
> web » iOS, déjà payé). Les réponses des 67 POST restent lisibles dans les
> **Résultats de Répéter** à la fin de l'exécution.
>
> **`&scan=1` est OBLIGATOIRE sur ce raccourci.** C'est le mode balayage côté
> serveur : sans lui, chaque page relit la collection des overrides en entier
> et 67 pages ≈ **160 000 lectures Firestore** — plus de trois fois le quota
> gratuit quotidien (celui qui s'est épuisé le 01/08 et a fermé l'admin). Avec,
> le balayage entier coûte ~1 500 lectures. En contrepartie : **ne pas modifier
> de prix à la main dans l'admin pendant qu'un balayage tourne** (le serveur
> travaille sur son relevé de rafale jusqu'à 20 min).
>
> **Doublons entre pages** : la même réf apparaît sur plusieurs pages à des prix
> différents — c'est SA raison d'exiger le tri décroissant : les pages tardives
> sont moins chères, la dernière écriture converge vers le MIN, et une écriture
> déjà à jour n'est pas répétée (prouvé par la porte).
>
> **Premier passage en `dryRun=1`** (la boucle entière, sans rien écrire) pour
> vérifier `format: "idealo"` page à page. Puis passer l'URL de l'action 3 ET
> celle de l'action 9 en `dryRun=0`. ⛔ Un raccourci ne reste JAMAIS en dryRun=1
> (règle plus bas — Festool y est resté des jours).
>
> Durée attendue : plusieurs minutes (134 requêtes web). Ne pas lancer deux
> traqueurs en même temps.

## 🟠 Flex · Wera · Facom (À CRÉER — 5 produits jamais traqués)
Même structure, seules la page cotébrico et le `brand=` changent. Le parseur est
agnostique de la marque (il cherche « MARQUE + référence » dans les titres).
Faire un 1er passage en `dryRun=1` pour vérifier ce qui est reconnu.

- Flex : page marque cotébrico + `?order=product.price.desc&resultsPerPage=400`
  → `…/api/admin?type=price-watch&brand=FLEX&sec=1`
- Wera : idem → `brand=WERA`
- Facom : idem → `brand=FACOM`

---

### ⚠️ Taille de page et limite serveur
Le corps du POST = le HTML BRUT de la page. Plafond Vercel = **4,5 Mo**
(`bodyParser.sizeLimit` dans api/admin.js). Si une page « toute la marque »
dépasse, le raccourci échoue (413) ou remonte `parsed: 0`.
**Repli** : deux raccourcis par marque, mêmes réglages, sorts opposés —
`?order=product.price.desc&resultsPerPage=400` et
`?order=product.price.asc&resultsPerPage=400` : les deux moitiés se rejoignent
au milieu et couvrent tout le catalogue.

### 🔒 Deux règles gravées (26/07/2026, après le 1er scan dé-filtré)
1. **Le coût relevé est enregistré même quand le prix ne bouge pas.** Avant, un
   produit dont le prix tombait déjà juste (`unchanged`) n'était jamais écrit :
   il n'avait donc AUCUN coût réel en base, comptait comme « estimé », et ne
   pouvait pas servir de base au garde-fou coffret ± 20 €.
2. ~~**Le plafond de variation (25 %)**~~ — **RETIRÉ le 31/07/2026 (D-015).**
   Il ne jugeait pas une valeur mais un ÉCART, et bloquait donc les vraies
   variations en même temps que les fausses — d'autant plus fort que la
   correction était nécessaire. Seules les bornes absolues MIN/MAX_TTC
   subsistent.

### Notes
- **`dryRun=0`** = applique les prix (marge 15 % sur le TTC affiché, promo comprise).
  **`dryRun=1`** = simulation, n'écrit rien (utile au 1er test d'une nouvelle marque).
- ⛔ **Un raccourci ne reste JAMAIS en `dryRun=1`.** C'est un mode d'essai pour un
  premier passage, pas un état de repos : il tourne, il consomme, et il n'écrit
  rien. Festool y est resté après que ses 50 fiches ont été créées — personne ne
  s'en est aperçu pendant des jours. Porte : `scripts/check-traqueur.js`.
- Le paramètre `resultsPerPage` force TOUS les produits sur une seule page (pas de
  pagination = pas de « Combiner » = pas de blocage iOS). 200 laisse de la marge.
- La marque par défaut de l'endpoint est `DEWALT` ; on la met quand même en clair
  (`brand=DEWALT`) pour que chaque raccourci soit explicite.

---

## 🔓 Plus rien à débloquer — le plafond de variation est retiré

**Décision D-015, 31/07/2026.** Le traqueur refusait un prix s'écartant de plus
de 25 % du dernier relevé. Ce verrou est **supprimé**.

Motif, et il est de l'user : *le traqueur lit ce que la page du fournisseur
affiche — c'est exactement ce qui sera payé.* Une hausse de 29 % n'est pas une
anomalie de lecture, c'est le tarif réel.

Ce que ce verrou a coûté : `DVC560Z` est resté à un prix qui faisait **perdre
8,31 € par vente**, parce que la correction dépassait le seuil.

**Ce qui reste** : les bornes absolues `MIN_TTC` / `MAX_TTC` — elles jugent une
valeur impossible, pas un écart. Et le verrou `priceLocked`, produit par produit.

⚠️ **Contrepartie assumée** : si cotébrico change la structure de ses pages et
que le parseur associe un prix à la mauvaise référence, plus rien ne l'arrête.
La trace reste (`applied` dans la réponse, `price_watch_log` en base), mais elle
se lit APRÈS. **Relire le rapport à chaque relevé** est désormais le seul
contre-poids.
