# 📋 RÈGLES PRODUITS — Pirates Tools (gravées, validées par l'user)

> Ce fichier est la **source de vérité** pour ajouter / modifier un produit ou un
> poster. Toute session Claude DOIT le lire et l'appliquer **sans que l'user ait
> à répéter**. Ne jamais y déroger. En cas de doute → demander, ne pas inventer.

---

## 1. 💶 PRIX (non négociable)

| Règle | Détail |
|-------|--------|
| **Formule** | `price` (TTC métropole affiché) = **prix TTC source × 1,15** (marge 15 % **SUR le TTC**, pas sur le HT — la TVA se récupère en fin d'année). |
| **HT** | `price_ht` = `price` / 1,20. CI vérifie `price ≈ price_ht × 1,20`. |
| **PROMOS = INTERDIT** | ⛔ **Ne JAMAIS regarder ni utiliser un prix soldé / promo / −X % / « prix barré ».** Toujours le prix TTC **normal**. |
| **MSRP ≠ source** | ⚠️ Un « prix conseillé » / MSRP gonflé N'est PAS le prix source. Utiliser le **vrai prix cotébrico hors promo**. Si on n'a que la promo ou le MSRP → **demander à l'user le prix réel**, ne pas deviner. |
| **Réalité DOM-TOM** | Le prix affiché doit rester crédible pour la Guadeloupe / DOM-TOM (le serveur ajoute octroi de mer + TVA territoriale par-dessus). Un prix trop haut = invendable. |
| **Devise / TVA** | `currency: "EUR"`, `vat: 0.2`. |

**Exemple** : TTC source 240,89 € → price = 240,89 × 1,15 = **277,02 €** ; price_ht = 277,02 / 1,20 = **230,85 €**.

---

## 2. 🖼️ POSTERS (images produit)

| Règle | Détail |
|-------|--------|
| **Fond sombre obligatoire** | Toujours un poster à **fond sombre / dégradé**. **Jamais de fond blanc/clair** (ça jure avec le site sombre). |
| **Signaler le fond blanc** | Si un PNG fourni a un fond blanc/clair → **le dire à l'user AVANT** de l'appliquer. |
| **PNG dans la conv = à poser** | Quand l'user envoie un PNG, c'est pour **remplacer le poster sur le site** — pas pour le regarder. On l'applique. |
| **Cohérence contenu/titre** | « Machine seule / outil nu » = **pas de batteries** sur l'image. Un « pack » = outil + batteries + chargeur + coffret. Si l'image ne colle pas au titre → le signaler. |
| **Conversion** | PNG → WebP, max **1024 px**, qualité **0,86** (`scratchpad/png2webp.mjs`, Playwright Chromium `canvas.toDataURL`). |
| **Nommage** | Nouveau fichier sans collision de cache ; si remplacement → suffixe `-v2`, `-v3`… Supprimer l'ancien webp devenu orphelin. |
| **Pas de poster ?** | Si l'user veut garder le produit mais n'a pas encore le PNG → mettre `images/placeholder.svg` (il voit qu'il reste à faire). |

---

## 3. 🚀 WORKFLOW (validé)

| Règle | Détail |
|-------|--------|
| **Master direct** | Travailler **directement sur `master`** : commit + `git push origin master` **immédiat** → Vercel déploie en live. Plus de branche de dev pour posters/produits. |
| **1 action = 1 commit + push** | Enchaîner produit par produit, ne pas empiler. |
| **CI verte** | `node scripts/ci.js` doit rester vert après chaque changement. |
| **Identifier via la capture** | Capture d'écran = le **titre** exact sur pirates-tools.com → chercher ce titre dans `products.json` → poser le PNG à cet endroit. |
| **Pas de SW bump** | Pour `products.json` + nouveaux posters uniquement : pas besoin de bumper le Service Worker (products.json est network-first, nouveaux noms de fichiers = pas de collision). |

---

## 4. 🧱 SCHÉMA D'UN PRODUIT (`products.json`, tableau à plat)

```
id            "dewalt-<sku-min>"          slug          "dewalt-<sku>-<desc>"
sku           "DCF891NT-XJ"               name          "<SKU>"
title         "<Marque> <SKU> — <desc courte>"
brand         "DeWALT" | "Makita" | …     category      voir §5 (chaîne EXACTE)
tag           "Nouveau"                   desc          1 phrase
img           "images/posters/<x>.webp"   price / price_ht  §1
currency "EUR"  vat 0.2                    stock_status "in_stock"  stock_label "En stock"
model ""       paymentLink ""             weight_kg <nb>
ncCategory "power_tool"                    productType "pro"
tags[]         ex ["brushless","tropical_ready"] / ["corded"]  (PAS brushless si moteur à charbons)
features[]     5 puces commerciales
specs{}        fiche technique COMPLÈTE (recopier la fiche source ligne à ligne)
description_long  paragraphe + « Livrée dans toute la zone DOM-TOM. Octroi de mer calculé automatiquement selon ton territoire. »
```

---

## 5. 🗂️ CATÉGORIES EXACTES (respecter l'orthographe, certaines sans accent)

`Boulonneuses a chocs` · `Visseuses a chocs` · `Perceuses-visseuses` · `Perforateurs` ·
`Meuleuses` · `Scies` · `Lamelleuses` · `Défonceuses` · `Rabots` · `Souffleurs` ·
`Aspirateurs` · `Ponceuses` · `Découpeuses` · `Cloueurs` · `Clés à cliquet` ·
`Élagage` · `Outils multifonctions` · `Outillage a main` · `Batteries et chargeurs` ·
`Combos` · `Accessoires`

---

## 6. 🔁 PROCÉDURE (à dérouler pour chaque produit)

1. Lire la/les image(s) : identifier **réf exacte** + **prix TTC hors promo** + **specs**.
2. Vérifier fond du PNG (sombre ? sinon signaler).
3. Convertir PNG → WebP (§2).
4. Nouveau produit → script `scratchpad/mk-<sku>.js` ; poster seul → patch `img`.
5. `node scripts/ci.js` vert.
6. `git add -A && git commit && git push origin master`.
7. Confirmer à l'user (réf, prix, ce qui a changé).

---

## 7. ✅ JOURNAL DES PRODUITS VALIDÉS (session 22–23/07/2026, master direct)

Prix = TTC source (hors promo) → affiché (× 1,15) / HT.

| Réf | Action | TTC source | Affiché | Poster |
|-----|--------|-----------|---------|--------|
| DCF899P2 | poster + prix | 374,99 | 431,24 | dcf899p2-v2 |
| DCF894P2 | poster | — | — | dcf894p2-v2 |
| DCF891NT-XJ | créé (solo) | 240,89 | 277,02 | dcf891nt-v3 |
| DCF891P2T-QW | créé (pack 812 Nm) | 411,72 | 473,48 | dcf891p2t |
| DCS520NT-XJ | créé (scie plongeante sans fil) | 519,68 | 597,63 | dcs520nt |
| DW682K-QS | créé (fraiseuse lamelles) | 249,89 | 287,37 | dw682k |
| DE7023-XJ | poster (piètement) | — | — | de7023 |
| PPACK0001 | poster (combo) | — | — | ppack0001-v2 |
| DCF894N | poster (solo) | — | — | dcf894n-v4 |
| DHR202ZJ | créé (Makita perfo SDS+) | 157,78 | 181,45 | dhr202zj |
| DCG405N | poster (meuleuse solo) | — | — | dcg405n-v3 |
| DCD996P2-QW | poster (pack XRP) | — | — | dcd996p2-v2 |
| DCG440N-XJ | créé (meuleuse 180 54V) | 317,72 | 365,38 | dcg440n |
| DCF620P2K | remplace DCF620D2K (5 Ah) | 318,90 | 366,73 | dcf620p2k |
| DCS378P2-QW | créé (scie à ruban) | **⚠ à revoir** | ⚠ 825,70 provisoire | dcs378p2 |

### ⏳ Prix EN ATTENTE / à revoir
- **DCS378P2-QW** : le 825,70 € vient d'un « prix conseillé » (MSRP) sur un site en soldes → **trop cher pour les DOM-TOM**. À recaler dès que l'user donne le **vrai prix cotébrico hors promo**.

### Décisions produit gravées ailleurs
- DCF894N = **vrai produit distinct** (à garder), ≠ DCF891NT-XJ (ne pas fusionner/supprimer).
- Meuleuses : DCG405N (tête standard) ≠ DCG405FN-XJ (tête plate) ≠ DCG440N-XJ (180 mm) ≠ DGA504Z (Makita).
- Voir aussi `../CLAUDE.md` (mémoire projet globale) et les règles packs 3D qui y sont gravées.
