# Règles de l'argent — formules, oracles, fraîcheur, services tiers

*Gravées le 09/08/2026 (intégration V2). Domaine : les calculs et les données
qui font le prix. Chaque règle cite sa panne (`docs/LECONS.md`) et sa porte ;
une règle sans porte le dit.*

## Une formule d'argent n'a qu'UNE implémentation

**Toute copie d'une formule de prix est GÉNÉRÉE depuis la source, jamais
recopiée à la main** — et une porte casse au premier octet d'écart.
*Panne payée* : `calcPrice` côté client a existé en PLUSIEURS copies — favoris
et « récemment vus » affichaient un prix non taxé, dérive de prix entre pages
(documentée dans `docs/PLAN-REMEDIATION.md` ; leçon du 09/08/2026).
*État mesuré au jour du gravage* : le calcul vit côté serveur
(`api/_lib/pricing-model.js`, `pricing.js`) ; **aucun** des identifiants du
modèle (`solveMarkup`, `octroiRate`, `colissimoCost`) n'existe dans `app.js`
— le client affiche, il ne calcule pas.
*Porte* : `scripts/check-pricing.js` refuse tout identifiant du modèle de
prix dans un fichier client (sabotée le 09/08/2026, rouge). Le jour où une
copie devient nécessaire, elle naît d'un générateur avec sa porte de diff —
comme `styles.min.css` ou `app.visitor.js`.

## Oracles indépendants — l'oracle n'importe JAMAIS le code testé

**La valeur attendue d'un calcul d'argent se calcule À LA MAIN** (papier,
tableur, autre langage) **et se vérifie par un script qui n'importe pas le
module testé.** Cas imposés au minimum : montant nul · remise totale · zone à
taux zéro · part fixe sur petit panier · arrondis en centimes entiers.
*Panne payée* : un plafond de majoration a fait vendre À PERTE pendant que la
suite de tests entière était verte — l'oracle et le testé étaient le même code
(leçon du 09/08/2026, héritée).
*État mesuré au jour du gravage* : `audit/admin/oracle-argent.mjs` existe mais
**importe `pricing.js`** (mesuré ligne 24) — il vérifie la cohérence interne,
pas la justesse. **Non conforme à cette règle.**
*Porte* : à refondre — l'oracle conforme porte ses valeurs attendues en
CONSTANTES calculées à la main, sources citées, et tourne dans `ci.js`. Tant
que ce n'est pas fait, cette règle est déclarative et le dit.

## Âge des données externes — un prix a un horodatage, et il périme

**Toute donnée venue d'un service externe porte son horodatage.** Passé un
premier seuil, elle s'affiche « en actualisation » ; passé un second, elle est
**NON OPPOSABLE : jamais encaissable sur la seule foi de la copie périmée.**
*Panne payée* : Firebase à la limite, le site a affiché des prix d'avant les
hausses en attente — périmés mais achetables, sans avertissement (08/08/2026).
*État mesuré au jour du gravage* : seuil de fraîcheur des relevés fournisseur
`SOURCE_FRESH_MS` = 14 j (`api/_lib/price-parse.js:1986`) → au-delà, GEL du
prix (jamais recalculé sur une source morte) ; panne Firestore → le rendu
porte `prixConfirmes:false` (`api/_lib/catalog.js`), le client affiche le
bandeau « prix en actualisation » et **bloque la saisie de carte**.
*Porte* : `scripts/check-price-watch.js` (gel), `tests/prix-non-confirmes.mjs`
(bandeau + blocage carte, 4/4). Le blocage vit côté client : un encaissement
forgé côté serveur sur copie périmée n'est pas couvert — dit, pas caché.

## Services tiers — cadence, refus, budget

**Un service tiers se consomme avec retenue** : cadence espacée irrégulière,
détection de refus PROUVÉE par sabotage, et un refus détecté = **zéro
écriture** + alerte + recul (backoff). **Et chaque consommateur de la base de
données a un BUDGET de lectures/écritures, mesuré.**
*Pannes payées, le MÊME soir (01/08/2026)* : quota Firestore épuisé (~1 700
lectures par rendu à froid, dépense invisible) ET limitation de débit du
comparateur — aucun des deux détecté.
*État mesuré au jour du gravage* : refus → `detecterBlocage`
(`api/_lib/price-parse.js`, marqueurs + codes HTTP), écriture coupée + état de
recul (`config/traqueur_etat`) ; lectures par rendu ÷425 (collection entière →
4 documents agrégés, `api/_lib/snapshot.js`) ; balayage : 1 lecture de
collection pour 67 pages (`&scan=1`), écritures regroupées ≤ 4 par page.
*Porte* : `scripts/check-price-watch.js` (blocage, backoff, compteurs de
lectures/écritures du balayage — assertions sur base factice comptée). Le
budget par consommateur N'EST PAS encore une porte globale chiffrée : les
compteurs existent par chemin critique, pas de plafond CI par consommateur —
déclaratif sur ce point, et dit.
