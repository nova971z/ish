# 🔁 Traqueur de prix — URL des raccourcis iPad (sauvegarde)

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
> 3. **POST** → `…/api/admin?type=price-watch&brand=…` : Méthode **POST**, Corps
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
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=DEWALT&dryRun=0`

## 🔵 Makita
1. `https://pirates-tools.com/api/health`
2. `https://www.cotebrico.fr/1/makita?order=product.price.desc&resultsPerPage=800`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=MAKITA&dryRun=0`

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
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=FESTOOL&dryRun=0`

> ⚠️ **CE DOCUMENT ÉTAIT EN RETARD, PAS LE RACCOURCI.** Il portait encore
> `dryRun=1` et `resultsPerPage=100` le 01/08/2026, alors que le raccourci
> réel de l'user était déjà en `dryRun=0` avec `resultsPerPage=112`.
> Corrigé d'après SA capture d'écran — la seule source qui fasse foi ici.

---

## ➕ AJOUTER UN TRAQUEUR (autre site) — depuis le 01/08/2026

Même raccourci en 3 actions, avec **deux différences** :

1. l'URL 2 = la page « marque » du NOUVEAU site (tous les produits, une page) ;
2. l'URL 3 porte **`&source=<slug>`** — un nom court pour ce site, en
   minuscules : `…/api/admin?type=price-watch&brand=MAKITA&source=nouveausite&dryRun=1`
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
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=DEWALT&source=clickoutil&dryRun=1`

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
>    `https://pirates-tools.com/api/admin?type=price-watch&brand=DEWALT&source=idealo&scan=1&dryRun=1`
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
  → `…/api/admin?type=price-watch&brand=FLEX&dryRun=1`
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
