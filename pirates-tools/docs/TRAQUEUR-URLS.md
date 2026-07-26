# 🔁 Traqueur de prix — URL des raccourcis iPad (sauvegarde)

> Si l'app **Raccourcis** bugge et efface les shortcuts, tout est ici pour les
> reconstruire à l'identique. Chaque raccourci = **3 actions « Obtenir le contenu
> de l'URL »** dans cet ordre :
>
> 1. **health** → autorise `pirates-tools.com` (GET, ne rien changer).
> 2. **cotébrico** → la page marque, tous les produits sur UNE page (GET).
> 3. **POST** → `…/api/admin?type=price-watch&brand=…` : Méthode **POST**, Corps
>    **JSON**, champ **`text`** = variable **« Contenu de l'URL »** (la ligne
>    cotébrico juste au-dessus). **En-tête obligatoire** (section « En-têtes ») :
>    Clé = **`x-admin-secret`**, Valeur = **ta clé `ADMIN_SECRET` complète**
>    (celle définie sur Vercel → Settings → Environment Variables ; JAMAIS écrite
>    dans le repo). Sans cet en-tête, le serveur renvoie « non autorisé ».
>    Coller la clé EN ENTIER, sans rien collé en trop autour.
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
2. `https://www.cotebrico.fr/8-outils-electroportatifs/s-1/marque-festool/categories_2-outils_electroportatifs?resultsPerPage=100`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=FESTOOL&dryRun=1`

---

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

### Notes
- **`dryRun=0`** = applique les prix (marge 15 % sur le TTC affiché, promo comprise).
  **`dryRun=1`** = simulation, n'écrit rien (utile au 1er test d'une nouvelle marque).
- Festool est encore à `dryRun=1` : ses produits n'existent pas au catalogue → le
  traqueur les remonte dans la liste `unknown` pour création. Passer à `0` une fois
  les fiches créées et validées.
- Le paramètre `resultsPerPage` force TOUS les produits sur une seule page (pas de
  pagination = pas de « Combiner » = pas de blocage iOS). 200 laisse de la marge.
- La marque par défaut de l'endpoint est `DEWALT` ; on la met quand même en clair
  (`brand=DEWALT`) pour que chaque raccourci soit explicite.
