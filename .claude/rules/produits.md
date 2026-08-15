---
paths:
  - pirates-tools/products.json
  - pirates-tools/images/**
  - pirates-tools/models/**
  - pirates-tools/outils/**
---

# Règles produits, posters et packs 3D

*Extraites de la mémoire projet le 29/07/2026 (`docs/EXTRACTION-REGLES.md`,
groupes F et G). Détail complet : `docs/REGLES-PRODUITS.md` et
`docs/PACK-3D-LAYOUT.md` — ce fichier ne contient que ce qui est opposable.*

## Prix

**Plus aucun prix n'est saisi à la main.** Tout passe par le calculateur
(admin → Recalculer). Le coût d'achat est résolu dans cet ordre : traqueur >
fiche > variante > estimé. Un « coût estimé » signale un prix bâti sur une
supposition, à remplacer par un relevé réel.

**Un produit portant `priceLocked: true` n'est JAMAIS recalculé** — ni par
« Appliquer les nouveaux prix », ni par le traqueur. C'est une décision
commerciale, pas une lacune : il sort du décompte des estimés et s'affiche à
part. ⚠️ Le verrou gèle le prix **actuellement servi**, pas celui de
`products.json`.

**Les promotions sont autorisées dès qu'un produit est couvert par le
traqueur** — celui-ci prend le prix affiché, promo comprise, et se réajuste
seul quand la promo finit. ⛔ Un « prix conseillé » ou un MSRP gonflé n'est
jamais un prix source.

**Un produit dont le coût d'achat n'est pas relevé ne reste pas au catalogue.**
Son prix reposerait sur une supposition, et il n'est de toute façon pas
approvisionnable. ⚠️ Retirer une fiche **ne supprime jamais ses visuels** :
posters et modèles 3D sont conservés pour un éventuel retour.

## Descriptifs et fiches techniques — comment on les récupère

*Méthode gravée le 09/08/2026 à la demande de l'user : « il faudra que tu
saches déjà comment le faire ». Elle vaut pour les 1 590 fiches sans descriptif
mesurées ce jour (sur 1 708).*

**⛔ ON RELÈVE DES FAITS, ON NE COPIE PAS UN TEXTE.** Ce qui se récupère, ce
sont des **mesures** — puissance, vitesse, capacité de coupe, poids, cotes,
emmanchement, nuance. Ce qui se rédige, c'est la phrase : elle est écrite ici,
jamais reprise ailleurs. L'user, mot pour mot : « récupérer ne veut pas dire
copier-coller, on récupère, on modifie proprement sans défaut et on colle au
bon produit ».

**Le geste, dans cet ordre :**
1. **Une recherche par référence**, la référence exacte de la fiche accompagnée
   du type d'outil et d'une caractéristique attendue (puissance, diamètre) —
   sans quoi la recherche rend des produits voisins.
2. **La documentation du constructeur fait foi.** Un distributeur sert à
   recouper, jamais à trancher seul.
3. **Recoupement sur au moins deux sources indépendantes** pour toute valeur
   qui entre dans un calcul. ⛔ Le POIDS en fait partie : il commande le mode
   d'envoi, donc le prix (voir plus bas).
4. **Ce qui n'est pas trouvé reste VIDE**, et on le dit. Une caractéristique
   inventée est pire qu'une caractéristique absente — c'est E-101.
5. **Les sources sont citées** dans le compte-rendu, avec leur adresse.

**⛔⛔ LE POIDS EST UNE DONNÉE D'ARGENT, PAS UNE FINITION.** Mesuré le
09/08/2026 : **1 282 fiches sur 1 708 déclarent exactement 2 kg** — une valeur
par défaut, jamais une pesée. Or `shipFor()` lit `weight_kg` et en tire le mode
d'envoi. Sous 10 kg le tarif colis s'applique et grimpe avec le poids (23 € à
2 kg, jusqu'à 64 € à 10 kg) ; au-delà, le modèle bascule sur le tarif bateau à
29 €.
⚠️ **Conséquence mesurée, et elle n'est pas celle qu'on croit** : les machines
LOURDES ne sont pas sous-facturées (le bateau les rattrape). Le risque vit dans
la tranche **3 à 10 kg déclarée 2 kg** — jusqu'à **41 € de transport non
facturé par vente**. C'est cette tranche qu'on pèse en premier.
*Porte* : aucune à ce jour — un poids par défaut ne se distingue pas d'un poids
mesuré dans `products.json`. **Déclaratif, et dit.**

**⛔ CE QUI N'EST PAS RÉCUPÉRABLE DEPUIS CETTE SESSION : LES IMAGES.** Mesuré
le 09/08/2026, quatre fois : accès direct à un site constructeur, à un site
marchand, à une banque d'images, et téléchargement d'un fichier — **tous
refusés par le mandataire réseau**. Le moteur de recherche, lui, répond : il
rend des **pages**, jamais des fichiers. Les visuels restent donc le travail de
l'user (voir la règle des posters ci-dessous). On ne redemande plus.

## Posters

**Fond sombre obligatoire, jamais blanc.** Si un visuel fourni est sur fond
clair, le signaler **avant** de le poser.

**« Machine seule » ou « outil nu » signifie sans batterie sur l'image.**

⛔ Les visuels sont le travail de l'user : ne jamais les modifier **de sa
propre initiative**.

⛔⛔ **UN VISUEL QU'IL ENVOIE REMPLACE CELUI QUI EXISTE — SANS DEMANDER.**
*Gravé le 15/08/2026, sur sa consigne : « Non tu remplaces s'il y a déjà un
visuel ! »* Envoyer une photo EST la demande explicite : il ne l'aurait pas
envoyée s'il voulait garder l'ancienne. Je lui avais posé la question sur
`DCF850N` ; c'était une question de trop, exactement ce que la porte de sortie
reproche (I-3 : on continue, on ne renvoie pas le choix).
⇒ `poser-visuel.mjs --remplacer` est le mode **normal** quand il fournit
l'image. Le garde-fou sans `--remplacer` reste utile pour tout autre appelant
— un balayage, un import en masse — qui, lui, n'a rien demandé.
⚠️ L'ancien fichier n'est jamais supprimé : il reste dans `images/posters/`,
donc le retour en arrière coûte une ligne.

## Packs 3D — deux exigences non négociables

**1. L'orientation de l'outil suit la référence DCF887P2** : chuck ou enclume à
GAUCHE, logo DEWALT FACE caméra, outil DEBOUT sur sa batterie. Jamais le dos,
jamais un logo miroir.

⛔ **Une orientation validée est GRAVÉE dans le registre de `docs/REGLES-PRODUITS.md`.
On ne la re-choisit JAMAIS, on ne la re-dérive JAMAIS à l'œil.** On lit le
registre d'abord. Nouvel outil seulement → grille de rendus à 4×90°, l'user
tranche, et **on l'écrit immédiatement** dans le registre.

**2. Le mapping au sol est VERROUILLÉ.** Chargeur, batteries et coffret sont
les mêmes objets sur tous les packs : ils sont placés aux coordonnées exactes
du mapping validé, **jamais recalculés**. Principe : « copier le pack, ne
changer QUE l'outil ».

**Anti-chevauchement** : le constructeur doit planter si l'emprise de l'outil
touche un accessoire. Ne jamais livrer un pack où deux objets se chevauchent.

**Une fiche produit affiche TOUJOURS le modèle 3D qui tourne, pas le poster.**
Le poster reste l'image de la carte au catalogue.

⚠️ **`GLTFExporter` de three.js DÉCOMPRESSE les textures** (jusqu'à 100 Mo,
inutilisable). Passer par `gltf-transform`, qui les garde compressées — c'est
la seule voie viable.

## Fiscalité

⛔ **Ne JAMAIS répondre « demande à ton comptable »** sur un point fiscal
factuel. Tout est public : le chercher aux sources officielles
(impots.gouv.fr, douane.gouv.fr, BOFiP), le donner **sourcé et daté**, et
l'ajouter à `docs/METHODE-ENTREPRISE-FISCALITE.md`.
