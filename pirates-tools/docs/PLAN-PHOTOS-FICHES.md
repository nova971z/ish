# Plan d'action — photos des fiches produit

*Écrit le 15/08/2026, après la troisième remontée de l'user sur le même sujet.
Exigé par lui : « tu vas analyser le code avant de toucher à quoi que ce soit,
et tu vas te créer un plan d'action ». Les deux causes ci-dessous sont
MESURÉES, pas supposées — chacune avec la commande qui l'a produite.*

---

## Ce qu'il constate

1. **Impossible d'ajouter plus de deux PNG** sur un même produit.
2. **Un carré noir apparaît autour du produit** — sa transparence est perdue.
   Il n'envoie QUE des PNG détourés.

---

## CAUSE 1 — le carré noir : le repli JPEG détruit la transparence

**Où** : `app.js`, fonction `adminPreparerImage`, la ligne du repli
`toDataURL('image/jpeg', …)` quand le navigateur n'a pas encodé en WebP.

**Le mécanisme.** Le code demande du WebP. Si le navigateur ne sait pas
encoder ce format, il rend du PNG **sans le dire** — le code le détecte au
préfixe (c'est bien vu) mais bascule alors sur **JPEG**. Or JPEG n'a **aucun
canal alpha** : les pixels transparents sont aplatis sur du noir.

**Mesuré dans un vrai navigateur** (Chromium, un PNG 100×100 transparent avec
un carré rouge au centre ; on relit la couleur d'un coin après encodage) :

```
image/webp   coin rgba(0,0,0,0)     -> TRANSPARENT
image/jpeg   coin rgba(0,0,0,255)   -> NOIR OPAQUE   ← le carré noir de sa capture
image/png    coin rgba(0,0,0,0)     -> TRANSPARENT
```

**Le défaut de raisonnement.** Le repli est à l'envers : quand le navigateur
rend du PNG, on a DÉJÀ une image transparente correcte — le seul problème
restant est le poids. Basculer sur JPEG « pour gagner du poids » sacrifie la
seule chose qu'on ne peut pas récupérer.

⚠️ Safari iOS — le navigateur de l'user — est précisément le cas où
`toDataURL('image/webp')` peut ne pas être supporté. C'est donc LUI qui
tombait systématiquement dans le repli JPEG.

**Correctif.** Détecter la transparence de la source (un pixel d'alpha < 255
suffit). Si l'image est transparente : **jamais de JPEG**, on reste en PNG et
on compense le poids par la RÉSOLUTION, pas par le format. Si l'image est
pleinement opaque : JPEG reste légitime.

---

## CAUSE 2 — deux photos maximum : les photos vivent DANS le document

**Où** : `api/admin.js` (`IMG_MAX`) et `api/_lib/limites.js`
(`BUDGET_DOC_OCTETS`).

**Mesuré** :

```
plafond PAR image ....... 700 000 caractères
budget du DOCUMENT ...... 950 000 octets
1 photo au plafond ...... 700 000  -> passe
2 photos au plafond ... 1 400 000  -> REFUSÉ
nombre max de photos au plafond par image : 1
taille par photo s'il en veut 6 : 158 333 octets (~119 Ko réels)
```

**Le mécanisme.** Les photos sont stockées **en base64 à l'intérieur du
document Firestore**, et un document plafonne à 1 Mio. Le formulaire promet
6 visuels ; l'architecture en autorise deux, et encore, seulement si elles
sont légères. Ce n'est pas un réglage trop serré : c'est un **mur**. Aucun
ajustement de qualité ne le déplace — descendre à 119 Ko par photo pour en
loger 6 dégraderait visiblement un visuel dessiné sur 1674 px.

**Correctif retenu : une photo = un document.** Les visuels quittent le
document de la fiche et vont chacun dans leur propre document
(`product_images/{ficheId}_{n}`). Chacun dispose alors de son propre Mio.
Le document de la fiche ne garde qu'une liste de renvois, donc quelques
centaines d'octets.

**Pourquoi ce choix plutôt que Firebase Storage.** Storage serait plus élégant
(pas de base64, pas de surcoût de 33 %), le bucket est déjà déclaré
(`firebase-init.js`) et la CSP le couvrirait déjà (`img-src https:`,
`connect-src https://*.googleapis.com`). **Mais** `storage.rules` est en
default-deny total hors vidéos de course, et son propre commentaire dit que
Storage « doit être activé une fois dans la console Firebase » — je ne peux
pas vérifier d'ici si ça a été fait. Un correctif qui dépend d'une action
console non vérifiable ferait une quatrième fausse livraison sur le même
sujet. On reste donc sur Firestore, dont on sait qu'il fonctionne, et le
passage à Storage devient une optimisation ultérieure, pas un préalable.

---

## Étapes, dans l'ordre, et ce qui prouve chacune

| # | Étape | Preuve exigée |
|---|---|---|
| 1 | Transparence défendue : plus jamais de JPEG sur une image à canal alpha | harnais navigateur : un PNG transparent ressort avec alpha = 0 ; sabotage (remettre JPEG) → rouge |
| 2 | Une photo = un document `product_images` ; la fiche ne garde que des renvois | banc : cycle « 6 photos » accepté ; budget de la fiche mesuré avant/après |
| 3 | Le chemin public lit les photos et les sert | banc : les 6 photos ressortent par `loadCatalog` ; cycle 2 (rafraîchissement) les conserve |
| 4 | Les fiches déjà en base64 continuent de marcher | banc : une fiche ancienne (base64 dans le document) reste servie |
| 5 | Portes + sabotages | chaque garde neuve prouvée faillible ; `check-fiches-persistees` vert |

⛔ **Rien n'est annoncé « fini » avant que l'étape 5 soit verte.** Trois
livraisons sur ce sujet ont été annoncées finies et ne l'étaient pas.
