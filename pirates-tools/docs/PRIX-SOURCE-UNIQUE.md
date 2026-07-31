# LES PRIX — POURQUOI IL Y EN AVAIT PLUSIEURS, ET COMMENT ON REFERME

> Écrit le 31/07/2026, après un constat de l'user : le même produit n'affichait
> pas le même prix partout.

---

## Le mécanisme, tel qu'il est

Il y a **deux sources**, et c'est voulu :

| Source | Rôle | Qui l'écrit |
|---|---|---|
| `products.json` | versionné, servi par le CDN, **peint l'écran tout de suite** | un commit |
| `product_overrides` (Firestore) | la vie du catalogue : prix relevés, ajustements | le traqueur, l'admin |

Le client charge dans cet ordre — `app.js`, fonction de chargement du catalogue :

1. le cache `localStorage` *(rendu instantané sur visite répétée)* ;
2. **`products.json`** — le CDN répond sans Firestore, l'accueil ne fige jamais ;
3. **`/api/products`** — la fusion `fichier + overrides`, **bornée à 6 secondes**.

Une source ne remplace jamais une source plus fraîche déjà appliquée.

## Le défaut

**Rien ne renvoyait jamais les overrides vers le fichier.** L'écart ne pouvait
donc que croître. Conséquences mesurées :

- si `/api/products` traîne ou échoue, le visiteur **garde le prix du fichier** ;
- selon le moment, l'appareil et la chance, deux visiteurs voient deux prix ;
- ⚠️ l'user navigue **en privé** : aucun cache ne persiste, il repart du
  fichier statique à chaque visite.

## Deux défauts trouvés en cherchant celui-là

**1. Le prix affiché n'était pas celui qui sera débité — 27 fiches sur 476.**
Le montant prélevé se calcule depuis `price_ht` (`api/_lib/pricing.js`) avec le
taux du territoire de livraison. Le champ `price` n'est **qu'un affichage**. Les
deux avaient divergé d'un centime. → porte `scripts/check-prix-affiches.js`,
correction par `scripts/aligner-prix-affiches.js`.

**2. Le prix d'ACHAT fournisseur était publié — 3 fiches.**
`products.json` est téléchargeable par n'importe qui. Trois fiches portaient
`priceSrcTTC`. Sur l'une : vendu 522,80 €, coût d'achat 454,62 € en clair.
L'endpoint `/api/products` filtrait bien ces champs ; **le fichier statique,
non** — la protection n'existait que sur une des deux sources.
→ porte `scripts/check-prix-fuite.js`.

⚠️ Ce défaut-là est **irréversible** une fois livré : CDN, puis historique git.

---

## La boucle qui referme

```bash
# 1. exporter la fusion (compte propriétaire connecté)
#    GET /api/admin?type=export-catalogue   → { ok, count, products }

# 2. aperçu — n'écrit rien
node scripts/importer-catalogue.js export.json

# 3. appliquer, puis RELIRE le diff avant de commiter
node scripts/importer-catalogue.js export.json --ecrire
node scripts/ci.js && git diff products.json
```

**Quatre garde-fous, chacun contre une façon précise de tout casser :**

| Refus | Ce qu'il empêche |
|---|---|
| export plus court que le catalogue | une suppression silencieuse de produits |
| champ interne présent | publier le prix d'achat — irréversible |
| prix variant de plus de 35 % | un traqueur qui a mal lu une page repeint le catalogue |
| relecture après écriture | croire un message de succès (E-206) |

Le dernier ne se contourne pas ; le troisième cède à `--force`, **après**
vérification à la source.

---

## Ce qui reste imparfait, et qu'il faut savoir

- **La boucle est manuelle.** Le traqueur tourne sur Vercel, dont le système de
  fichiers est en lecture seule : il ne peut pas écrire dans le dépôt. Refermer
  la boucle demande donc un export, un import, un commit.
- **Entre deux imports, l'écart revient.** Plus le traqueur relève de prix, plus
  le fichier vieillit. À faire tourner régulièrement — au minimum après chaque
  campagne de relevés.
- **Aucune porte ne compare aujourd'hui le fichier aux overrides**, faute
  d'accès à Firestore depuis la CI. Le jour où cet accès existe, c'est le
  contrôle à écrire en premier.
