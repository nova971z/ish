# REGISTRE DES DEMANDES — ce que l'user a demandé, et où ça en est

> **Une demande orale se perd ; une demande écrite se solde.**
>
> Ce registre existe parce que le 01/08/2026 l'user a écrit :
> *« il y a énormément de choses que je t'ai demandé et que tu n'as pas faite
> et ça c'est interdit. Il va falloir que tu les ajoutes dans tes putains de
> porte, tu ne livres pas le travail tant que tout n'est pas fait. »*
>
> Il avait raison, et le motif est mécanique : dans un échange long, une
> demande formulée en passant se noie dans celles qui suivent. Rien ne la
> retenait. Le résultat vu de son côté, c'est du travail livré « à moitié »,
> et du temps perdu à re-signaler.

---

## Comment ça marche

**Trois états, pas un de plus :**

| État | Ce que ça veut dire |
|---|---|
| `OUVERT` | demandé, pas fait. **Bloque la livraison.** |
| `FAIT` | fait ET prouvé — la preuve est dans la ligne. |
| `RENDU` | rendu à l'user : il a tranché autrement, ou ça dépend de lui. |

**Porte** : `scripts/check-demandes.js`, branchée dans `scripts/ci.js`.
Elle **fait échouer la CI** tant qu'une ligne est `OUVERT`.

⛔ **Une ligne ne passe pas à `FAIT` sans preuve vérifiable** — une commande,
un compteur, un harnais nommé. « C'est fait » n'est pas une preuve.

⚠️ **Ce que cette porte NE PEUT PAS faire, et il faut le dire** : elle ne lit
pas les conversations. Elle ne connaît que ce qui est écrit ici. Une demande
non consignée reste invisible — c'est la limite, et elle est humaine. Le
réflexe à garder : **une demande entendue s'écrit ici AVANT d'être traitée.**

---

## Demandes en cours

| # | Demande | Date | État | Preuve / motif |
|---|---|---|---|---|
| D-63 | Ajouter TOUS les produits clickoutil présents dans le relevé du traqueur | 01/08 | `FAIT` | **129 fiches créées** (catalogue 1017 → 1146, graphie « DeWALT » relue du catalogue, familles existantes uniquement, prix par le calculateur depuis le coût relevé, poids 2 kg marqué `poidsSuppose`, image = remplacement en attendant ses visuels). **3 correspondances `-XJ`** posées en `srcAltSkus` (DCN930N, DCP580N, DCF850N — contenu « nu » vérifié des deux côtés, règle de l'user : -XJ = commercialisation géographique) + index des alias dans le traqueur, 1 sabotage rouge. **1 écarté motivé** : « Moulage TSTAK II pour meuleuse DCG405 » — la réf extraite est celle de la MEULEUSE (sa mise en garde exacte) ; reste listé en `unknown`. Les coûts s'écriront seuls au prochain passage `dryRun=0` (les fiches portent les réfs exactes de clickoutil). |
| D-64 | (attrapé en route) Le min multi-sources tournait sur des horodatages sentinels | 01/08 | `FAIT` | E-228 : `Number(serverTimestamp) = NaN` rendait l'entrée du passage EN COURS invisible au min — mesuré sur SES rapports (D25033K-QS : 119,90 € clickoutil perdu contre 126,72 €) — et un Timestamp relu paraissait toujours périmé (gel fantôme au recalcul). `enMillis` + `nowMs` partout où l'on date ; porte étendue (6 cas), 3 sabotages rouges. |
| D-62 | Le `dryRun` clickoutil propose des hausses sur des produits que cotébrico vend moins cher | 01/08 | `FAIT` | Son rapport `dryRun=1` (145 lus, `format: clickoutil`) montrait 12 hausses dont +136 % : la carte multi-sources naissait avec la seule entrée clickoutil, l'héritage cotébrico (format d'avant, sans carte) n'entrait pas dans le min (E-227). Corrigé : `pwSourcesConnues` fusionne carte + héritage MARQUÉ `cotebrico` aux trois endroits (relevé, rupture, recalcul) ; fraîcheur 14 j toujours juge ; un coût estimé ne se ressème jamais. Porte : cas « hausse fantôme » gravé (389 vs 200 → 200), 2 sabotages rouges. **Vérifié en production** sur son 2ᵉ `dryRun=1` : les 12 lignes portent `source: "cotebrico"` et sont devenues des baisses (ex. DCS355NT-XJ proposé 524,38 € hier → 220,52 €). |
| D-60 | Le traqueur clickoutil rend `parsed: 0` — comprendre pourquoi, sans rien inventer | 01/08 | `FAIT` | Le retour `parsed: 0` renvoie désormais `source` + un champ `diagnostic` MESURÉ sur la page reçue : comptes de chaque motif du parseur (« Ajouter au panier », « MARQUE RÉF », « Prix X,XX € »), verdict, et 3 extraits bruts autour de la marque. 4 modes d'échec exécutés, 4 verdicts justes ; `check-price-watch` étendu, 3 sabotages rouges. La page est injoignable du dépôt (CONNECT 403 mesuré) : c'est la page ELLE-MÊME, déjà envoyée par le raccourci, qui parle. |
| D-61 | Adapter le parseur au format de clickoutil | 01/08 | `FAIT` | En deux temps. ① Prouvé sur **la page entière fournie par l'user** (document Pages décompressé, 554 titres) : réf avant la marque, prix « € TTC » jamais le HT, packs écartés et listés (cloueur nu 729 € pris, ses packs 888/818 € ignorés). ② Son `dryRun=1` en production a rendu `parsed: 0` **et le diagnostic a montré pourquoi** : le flux réel n'a AUCUN « Ajouter au panier » (`boutonsPanier: 0` — le raccourci envoie le TEXTE, pas le HTML ; E-605). Parseur réécrit PAR LIGNES (titre · marque seule · « € TTC »), prouvé sur LES DEUX corpus : Pages → 145 produits, gabarit du flux réel → chaque cas juste. Porte réécrite sans le bouton, 3 sabotages rouges (dont la garde `(?!HT)` rendue falsifiable). **Reste son geste** : `dryRun=1` (attendu `format: clickoutil`, ≈ 145–150) puis `dryRun=0`. |
| D-58 | Un produit EN RUPTURE chez le fournisseur ne doit jamais faire bouger son prix | 01/08 | `FAIT` | Le parseur lit le badge de stock (tête du bloc suivant, mesuré sur SA capture) ; une source en rupture est écartée du coût ; sans source achetable le produit est **GELÉ** (origin `rupture`), listé dans l'écran admin, jamais recalculé. `check-price-watch` — sabotages ①③④ rouges. ⚠️ Si cotébrico écrit la rupture autrement, une capture d'une carte en rupture ajuste `RUPTURE_RE`. |
| D-59 | Plusieurs traqueurs : le calculateur prend TOUJOURS le moins cher des sources valides | 01/08 | `FAIT` | `&source=<slug>` sur l'URL du raccourci ; chaque site écrit sa propre entrée `priceSources.<slug>` ; coût effectif = `choisirCoutSource` (min des fraîches < 14 j ET en stock) au relevé COMME au recalcul ; anciens overrides lus tels quels. `check-price-watch` — min multi-sources, fraîcheur, héritage, 4 sabotages rouges. Mode d'emploi : `docs/TRAQUEUR-URLS.md` § « Ajouter un traqueur ». |
| D-57 | « Il y a du chevauchement sur certains trucs » | 01/08 | `FAIT` | Mesuré au VRAI bas de 6 routes × 2 écrans (défilement instantané + stabilisation + retour du dock) : zéro tap volé au repos. La chasse a débusqué et retiré un doublon `#dock` tout en `!important` qui faisait mentir la règle entretenue, et un harnais vert-par-construction. Porte `tests/chevauchement.mjs`, sabotage enfin rouge. ⚠️ Si le chevauchement VU est ailleurs (quelle page, quelle capture ?), il entre par la liste D-56. |
| D-55 | « À quoi servent les portes si tu ne les respectes pas ? » — expliquer, et combler | 01/08 | `FAIT` | Réponse donnée sans détour : les 30 portes vérifient le DÉPÔT contre lui-même ; aucune ne voyait ses raccourcis, sa Firestore, ni la page fournisseur. Mes 3 inventions de la soirée étaient toutes dans cet angle mort. Comblé par **S6 de `garde-sortie.js`** : une affirmation sur son environnement est refusée sans capture venue de lui. 5 cas testés, 5 justes. |
| D-56 | Vérifier que plus de la moitié de ses demandes ont bien été faites | 01/08 | `RENDU` | ⛔ **Je n'ai aucun instrument pour le mesurer, et je ne vais pas faire semblant.** `DEMANDES.md` a été créé aujourd'hui : il ne contient que ce que J'Y AI MIS. Tout ce qui précède n'est consigné nulle part — c'est exactement le trou qu'il dénonce. **Il me faut sa liste** ; chaque ligne entrera au registre et la CI refusera de livrer tant qu'elle sera ouverte. |
| D-51 | Coûts d'achat réels des Makita importées | 01/08 | `FAIT` | ⚠️ **Ma réponse d'abord était fausse** : j'ai proposé un collage manuel. Le traqueur écrit les coûts TOUT SEUL, y compris quand le prix ne bouge pas (`price-watch`, branche `unchanged`). Le relevé du 01/08 porte `dryRun:false` et `unchanged:615` : **615 coûts réels écrits** sur 620 fiches Makita. Rien à coller. |
| D-52 | Les 79 Makita restantes et les 304 Quincaillerie n'ont **aucun** coût relevé | 01/08 | `RENDU` | ⛔ **Bloqué sur une donnée que je ne peux pas inventer** : leur prix d'achat. Il me faut le relevé fournisseur de ces références (même format que les autres). Sans lui, leur prix reste une supposition — et la règle produits dit qu'un produit sans coût relevé ne reste pas au catalogue. Deux issues : fournir les coûts, ou retirer ces fiches. |
| D-54 | Le traqueur doit couvrir tout seul — rien à coller à la main | 01/08 | `FAIT` | ⚠️ **Mon diagnostic « Festool en simulation » était FAUX** — ses captures montrent `dryRun=0` sur les trois raccourcis. C'est le DOCUMENT du dépôt qui était périmé, pas son installation (E-603). Ce qui est réellement livré : le traqueur rend désormais `absents` et `absentsJamaisReleves` à chaque passage · `TRAQUEUR-URLS.md` aligné sur ses captures et marqué « copie, ne prouve rien » · porte `check-traqueur`, 2 sabotages, 2 rouges |
| D-53 | Recalculer le catalogue au taux 1 % | 01/08 | `RENDU` | Taux passé à 1 % (`pricing-model.js`), champ ajouté à l'écran admin. Le recalcul lui-même est un geste admin (deux boutons). |

---

## Soldées

| # | Demande | Date | État | Preuve |
|---|---|---|---|---|
| D-41 | Bouton « vider mon historique » côté client, en deux confirmations | 01/08 | `FAIT` | `tests/raz-deux-clics.mjs` — 7/7, quatre sabotages rouges |
| D-42 | Espacer le bouton de remise à zéro des indicateurs du haut | 01/08 | `FAIT` | `.compta-actions--danger { margin-top: 3rem }` |
| D-43 | Comptabiliser l'abonnement Revolut 10 €/mois et les frais de vente | 01/08 | `FAIT` | `check-accounting` — abonnement retranché au centime, 4 sabotages rouges |
| D-44 | Éradiquer le nom de l'ancien encaisseur, partout | 01/08 | `FAIT` | 114 commentaires réécrits par le parseur, code prouvé identique à l'octet près (14/14) |
| D-45 | Regrouper les puces de catégories du catalogue | 01/08 | `FAIT` | 20 familles, vérifié en capture |
| D-46 | Reprendre les 5 harnais rouges | 01/08 | `FAIT` | 68/68 harnais, 1117/1117 assertions, **deux exécutions concordantes** |
| D-47 | Mettre à jour portes, harnais et règles ; relever mes défaillances | 01/08 | `FAIT` | Origine **O7** créée (7 cas), `sabotage.mjs`, `check-ancres.js`, entonnoir enrichi |
| D-48 | Commission à 1 %, réglable | 01/08 | `FAIT` | `check-pricing` — champ présent, envoyé, réglage prioritaire ; 4 sabotages rouges |
| D-49 | Comprendre les 250 fiches absentes du traqueur | 01/08 | `FAIT` | Cause mesurée : leur coût d'achat n'a jamais été injecté ; 541 « estimés » = 541 coûts retrouvés dans le relevé d'import |
| D-50 | Que l'import ne reperde plus les coûts | 01/08 | `FAIT` | L'import produit la liste collable, **la vérifie par le vrai analyseur**, et refuse de se taire |
