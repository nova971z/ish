# 🔁 Traqueur de prix — URL des raccourcis iPad (sauvegarde)

> Si l'app **Raccourcis** bugge et efface les shortcuts, tout est ici pour les
> reconstruire à l'identique. Chaque raccourci = **3 actions « Obtenir le contenu
> de l'URL »** dans cet ordre :
>
> 1. **health** → autorise `pirates-tools.com` (GET, ne rien changer).
> 2. **cotébrico** → la page marque, tous les produits sur UNE page (GET).
> 3. **POST** → `…/api/admin?type=price-watch&brand=…` : Méthode **POST**, Corps
>    **JSON**, champ **`text`** = variable **« Contenu de l'URL »** (la ligne
>    cotébrico juste au-dessus).
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
2. `https://www.cotebrico.fr/8-outils-electroportatifs/s-1/tension-18_v+36_v_2_x_18_v/marque-makita/nombre_de_batteries_fournies-aucune/type_de_moteur-brushless_sans_charbon/type_d_alimentation-batterie/batteries_compatibles-gamme_lxt_18_v/en_stock-oui/categories_2-outils_electroportatifs?resultsPerPage=200`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=MAKITA&dryRun=0`

## ⚫ Festool
1. `https://pirates-tools.com/api/health`
2. `https://www.cotebrico.fr/8-outils-electroportatifs/s-1/marque-festool/categories_2-outils_electroportatifs?resultsPerPage=100`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=FESTOOL&dryRun=1`

---

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
