# Commission Revolut — la part fixe 0,20 € est-elle dans le modèle de prix ?

> Audit **lecture seule**. Chaque chiffre porte la commande qui l'a produit.
> Figures mesurées en exécutant le **vrai** `api/_lib/pricing-model.js` (pas d'estimation).

## Réponse : PRÉSENT

La part fixe **0,20 €** est bien dans le modèle et appliquée **exactement** comme
« 1 % + 0,20 € par transaction en ligne ».

Verbatim (`api/_lib/pricing-model.js`) :

```
:89   commissionPct: 0.010,
:90   commissionFix: 0.20,
...
:160  var pct = (cfg.commissionPct != null) ? cfg.commissionPct : cfg.stripePct;
:161  var fix = (cfg.commissionFix != null) ? cfg.commissionFix : cfg.stripeFix;
:162  var commission = ttc * pct + fix;
```

Donc `commission = ttc × 0,010 + 0,20`. Le fixe est ajouté **une fois par produit
évalué**, sur le `ttc` DOM-TOM (octroi + TVA dom inclus). La carte pro 2,8 % est le
cas marginal **assumé non provisionné** (documenté `pricing-model.js:45-74`).

> Réserve intégrée (contexte Killian) : le compte de résultat lit la commission
> **réelle** de chaque vente (`payments[].fees[]`), jamais cette estimation — le
> 1 % + 0,20 ne sert qu'au **calcul du prix AVANT vente**.

---

## Table d'impact — marge nette après IS, avec / sans le 0,20 € fixe

Le modèle **résout le markup** (`solveMarkup`, `pricing-model.js:179-184`) pour
atteindre la cible `targetNet = 0,15` (marge nette après IS, `marginAfterIS =
netAfterIS / revenueHT`, `pricing-model.js:174`). Deux lectures :

**1. Marge à prix recommandé** (le modèle vise 15 % — colonne « obtenu ») :

| Panier (coût TTC) | Envoi | TTC vendu | Commission € (dont 0,20) | Markup | Marge nette obtenue |
|---|---|---|---|---|---|
| 8 € / 0,4 kg | lettre | 31,68 € | 0,520 (= 0,317 + **0,20**) | 300 % (saturé) | **12,29 %** ⚠️ sous cible |
| 20 € / 2 kg | colissimo | 69,48 € | 0,890 (= 0,695 + **0,20**) | 250,9 % | 15,01 % |
| 50 € / 2 kg | colissimo | 106,04 € | 1,260 (= 1,060 + **0,20**) | 114,2 % | 15,01 % |
| 100 € / 2 kg | colissimo | 167,02 € | 1,870 (= 1,670 + **0,20**) | 68,7 % | 15,04 % |
| 300 € / 2 kg | colissimo | 410,78 € | 4,310 (= 4,108 + **0,20**) | 38,3 % | 15,03 % |

Formule de chaque ligne : `pricing-model.js:155-176` (`evaluate`), commission
`:162`. Calcul exécuté : `recommend({weight_kg, ncCategory:'power_tool'},
{costTTC, mode:'colissimo'})`, territoire réf 971 (`DEFAULT_CONFIG.refTerritory`,
`:21`).

**2. Poids du 0,20 € à prix recommandé égal** (combien la marge remonterait si le
fixe n'existait pas — isole la part du 0,20) :

| Coût TTC | TTC vendu | Commission (0,20 incl.) | Marge AVEC 0,20 | Marge SANS 0,20 | Écart (pts) | Part du fixe dans la commission |
|---|---|---|---|---|---|---|
| 8 € | 31,68 € | 0,520 | 12,30 % | 12,88 % | **0,58** | 38,5 % |
| 20 € | 69,48 € | 0,890 | 15,01 % | 15,27 % | 0,27 | 22,5 % |
| 50 € | 106,04 € | 1,260 | 15,01 % | 15,18 % | 0,17 | 15,9 % |
| 100 € | 167,02 € | 1,870 | 15,04 % | 15,15 % | 0,11 | 10,7 % |
| 300 € | 410,78 € | 4,310 | 15,03 % | 15,08 % | 0,04 | 4,6 % |

Lecture : **le fixe pèse d'autant plus que le panier est petit** — 0,58 pt de
marge à 8 €, 0,04 pt à 300 € ; il fait 38,5 % de la commission à 8 € contre 4,6 %
à 300 €. C'est cohérent avec « la part fixe écrase les petits paniers ».
(`marginAt` au même `priceHt`, `commissionFix:0` vs défaut, `pricing-model.js:242-257`.)

---

## Produits SOUS le seuil de marge (15 %) — et vendus À PERTE

Comme `solveMarkup` **plafonne le markup à 300 %** (`for m … m <= 3 … return 3`,
`pricing-model.js:180-183`), les coûts fournisseur bas ne couvrent plus les frais
fixes par commande (transport + douane 5,10 € + emballage 0,5 € + quote-part
`fixedPerOrder` + commission dont 0,20 €). Balayage `recommend` réel, 971, power_tool :

**Colissimo (poids 2 kg)** :

| Coût TTC | Marge nette | État |
|---|---|---|
| 5 € | **−94,5 %** | PERTE, markup saturé 300 % |
| 8 € | **−35,5 %** | PERTE |
| 12 € | **−2,7 %** | PERTE |
| 13 € | +2,3 % | sous cible |
| 16 € | +13,6 % | sous cible |
| **18 € et +** | 15,0 % | cible atteinte |

**Lettre suivie (poids 0,4 kg)** :

| Coût TTC | Marge nette | État |
|---|---|---|
| 5 € | **−18,0 %** | PERTE |
| 8 € | +12,3 % | sous cible |
| **10 € et +** | 15,0 % | cible atteinte |

Bande sous-seuil (formule `pricing-model.js:155-184`) :
- **Colissimo 2 kg** : coût TTC **< ~18 €** → sous 15 % ; **< ~12,5 €** → marge **négative** (vente à perte).
- **Lettre 0,4 kg** : coût TTC **< ~10 €** → sous 15 % ; **< ~6 €** → marge **négative**.

### Limite de données — nommer les SKU exacts

Le coût fournisseur réel (`priceSrcTTC`) vit dans **Firestore `product_overrides`**,
retiré du catalogue public (`PRIVATE_FIELDS`, `catalog.js:227-236` ;
`products.json` servi ne le porte pas — vérifié : `priceSrcTTC present dans le
public ? false`). **Impossible d'énumérer les produits touchés depuis le dépôt.**
La bande de coût ci-dessus est le livrable ; la liste nominative se sort en
lisant `product_overrides.priceSrcTTC` (endpoint `type=margins`, `api/admin.js:1056-1105`,
qui expose déjà `costTTC` et la marge live) — c'est là qu'il faut brancher la porte.

Repère catalogue : sur 1708 fiches servies, **1 seule** a `price_ht < 25 €`
(SKU 488544, `price_ht=13,93`). La bande de perte est donc étroite aujourd'hui,
mais elle existe et rien ne l'empêche de se peupler au relevé réel de ce soir.

---

## Définition de « marge » — NON ambiguë (pas de QUESTION KILLIAN)

`marginAfterIS = netAfterIS / revenueHT` avec `revenueHT = priceHt × (1 + octroi)`
(`pricing-model.js:159, 174`). L'octroi encaissé est compté comme revenu (payé à
l'import), choix **explicitement documenté** (`:159` « octroi = revenu (payé à
l'import) »). Cible `targetNet = 0,15` après IS (`:24`). La définition est
précise et unique — aucune ambiguïté ne justifie une ligne QUESTION KILLIAN.

---

## Recommandations (rappel, détail dans `_aud_argent.csv`)

- **MA-003 (P3)** : graver la constante commentée « Revolut Business 1 % + 0,20 € »
  + oracle dédié `commission(ttc) == ttc·0,01 + 0,20`, prouvé faillible (fix → 0).
- **MA-004 (P1)** : faire remonter (drapeau `sousCible`) toute fiche où `recommend`
  sature à markup 300 % sans atteindre `targetNet`, au lieu de publier à perte en
  silence ; porte listant ces SKU via `priceSrcTTC`.
