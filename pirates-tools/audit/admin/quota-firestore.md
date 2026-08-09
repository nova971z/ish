# Quota Firestore — instrumentation, garde, plan de réduction

Incident (08/08/2026, soir) : `8 RESOURCE_EXHAUSTED: Quota exceeded` sur `GET admin?type=stats`.
Le quota gratuit journalier (50 000 lectures) a été épuisé.

## 1. Instrumentation — lectures Firestore par opération (comptées depuis le code)

Notations : **N** = nb de documents `product_overrides` ; **P** = documents
`analytics_products` (~1700, un par fiche vue) ; **D/C/G** = `analytics_daily`
(~1/jour, purgé > 14 mois) / `analytics_clicks` / `analytics_geo`.

| Opération | Requêtes Firestore | Lectures facturées | Preuve |
|---|---|---|---|
| **(a) Rendu d'une fiche** (SSR `/produit`) | 1 × `product_overrides.get()` | **N** (instance froide) ; **0** si cache < 30 s | `api/_lib/catalog.js:91`, TTL `:20,74` ; `render.js` ne lit AUCUN Firestore directement |
| **(b) Onglet stats** (`type=stats`) | 4 scans complets | **D + P + C + G** (dominé par **P ≈ 1700**) | `api/admin.js:687-698` (`readAll` × 4) |
| **(b bis) Onglet clients** (`type=clients`) | 1 + 200 | **200 docs + 200 agrégations `count()`** | `api/admin.js:701` `users.limit(200)`, `:707` `count().get()` par user |
| **(c) Session traqueur** (67 pages, `scan=1`) | 1 override (caché 20 min) + 67 backoff + écritures | **N** (page 1) **+ 67** (backoff) + 1 écriture / prix bougé | override `api/admin.js:3474` caché `pwScanCache` `:2457,2458` ; backoff `config/traqueur_etat.get()` (ajouté ce lot) ; écritures `:3610+` |

Le drain de l'incident est **(b)** : `analytics_products` (~1700 docs) relu
**à chaque ouverture** de l'onglet stats, plus **(b bis)** 200 `count()` sur
`clients`. Le rendu de fiche **(a)**, lui, est déjà amorti par le cache 30 s.

## 2. Garde RESOURCE_EXHAUSTED — DÉJÀ EN PLACE (vérifié)

- **Rendu / paiement** : toute erreur de lecture des overrides (quota compris)
  est rattrapée et le site retombe sur `products.json` (prix de base), avec
  `disponible:false` / `prixConfirmes:false` pour que le client SACHE que ce ne
  sont pas les prix vivants — jamais d'écran mort. Preuve : `api/_lib/catalog.js:101`
  (`catch`) → `repli()` `:80-86`.
- **Traqueur** : la relecture des overrides (`api/admin.js:3474`) est dans le
  `try` du handler ; un `RESOURCE_EXHAUSTED` y jette AVANT la boucle d'écriture
  → réponse 500 nommée, **aucune écriture**. Preuve : `handlePriceWatch` try/catch
  (prouvé par le sabotage ZZBOOM de `check-price-watch`).

⇒ Le site ne CASSE pas sur quota épuisé (repli propre) et le traqueur n'écrit
rien. Le mode de panne « argent » (prix faux débité) est déjà couvert.

## 3. Réduction — plan (objectif ≤ 5 lectures / rendu de fiche)

Non fait dans ce lot (rayon ARGENT élevé — chemin de rendu du prix). Ordonné :

1. **Snapshot agrégé des overrides** : le traqueur écrit, en plus de chaque
   `product_overrides/{id}`, un document unique `config/overrides_snapshot`
   (carte {id→override}). Le RENDU lit ce SEUL document → **1 lecture** par
   rendu froid (≤ 5, objectif atteint), au lieu de **N**. Le snapshot se
   réécrit à chaque relevé (aligné sur 2/jour). Porte : le snapshot est à jour
   vs la collection, sabotage.
2. **Stats bornées par période** : `analytics_daily` filtré à 7 j / 30 j
   (au lieu de tout l'historique) ; `analytics_products` agrégé en un rollup
   (ou lu en `Total` seulement, un doc de synthèse) → fin des ~1700 lectures
   par ouverture. Oracle stats sur jeu factice.
3. **Onglet clients** : total via un compteur agrégé, fin des 200 `count()`.

Tant que (1)-(3) ne sont pas faits, la garde du §2 empêche toute panne
d'argent ; le coût restant est du quota de lecture, pas un prix faux.
