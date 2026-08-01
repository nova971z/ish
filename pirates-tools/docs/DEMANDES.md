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
| D-51 | Coûts d'achat réels des Makita importées | 01/08 | `FAIT` | ⚠️ **Ma réponse d'abord était fausse** : j'ai proposé un collage manuel. Le traqueur écrit les coûts TOUT SEUL, y compris quand le prix ne bouge pas (`price-watch`, branche `unchanged`). Le relevé du 01/08 porte `dryRun:false` et `unchanged:615` : **615 coûts réels écrits** sur 620 fiches Makita. Rien à coller. |
| D-52 | Les 79 Makita restantes et les 304 Quincaillerie n'ont **aucun** coût relevé | 01/08 | `RENDU` | ⛔ **Bloqué sur une donnée que je ne peux pas inventer** : leur prix d'achat. Il me faut le relevé fournisseur de ces références (même format que les autres). Sans lui, leur prix reste une supposition — et la règle produits dit qu'un produit sans coût relevé ne reste pas au catalogue. Deux issues : fournir les coûts, ou retirer ces fiches. |
| D-54 | Le traqueur doit couvrir tout seul — rien à coller à la main | 01/08 | `FAIT` | Festool sorti de `dryRun=1` (il tournait en simulation depuis la création de ses 50 fiches) · le traqueur rend désormais `absents` et `absentsJamaisReleves` à chaque passage · porte `check-traqueur` : 3 sabotages, 3 rouges |
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
