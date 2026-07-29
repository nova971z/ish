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

## Posters

**Fond sombre obligatoire, jamais blanc.** Si un visuel fourni est sur fond
clair, le signaler **avant** de le poser.

**« Machine seule » ou « outil nu » signifie sans batterie sur l'image.**

⛔ Les visuels sont le travail de l'user : ne jamais les modifier sans qu'il
l'ait demandé explicitement.

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
