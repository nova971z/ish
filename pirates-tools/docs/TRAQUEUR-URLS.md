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
2. `https://www.cotebrico.fr/8-outils-electroportatifs/s-1/marque-festool/categories_2-outils_electroportatifs?resultsPerPage=100`
3. `https://pirates-tools.com/api/admin?type=price-watch&brand=FESTOOL&dryRun=0`

> ⛔ **CORRIGÉ le 01/08/2026 : `dryRun=1` → `dryRun=0`.** La note ci-dessous
> disait « ses produits n'existent pas au catalogue » — c'était vrai à
> l'écriture, ça ne l'est plus : **50 fiches Festool** y sont depuis. Le
> raccourci tournait donc deux fois par jour en SIMULATION, sans jamais rien
> écrire, et ces 50 produits n'ont jamais eu de coût relevé. Une note qui se
> périme devient un mensonge qui tourne tout seul.

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
