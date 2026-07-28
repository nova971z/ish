# `outils/` — les outils réutilisables, VERSIONNÉS

Ce ne sont **pas** des tests : ils ne vérifient rien, ils **fabriquent**.
Ils ne sont donc jamais lancés par la CI.

| Dossier / fichier | À quoi ça sert |
|---|---|
| `gltf/` | constructeurs des packs 3D (fusion outil + chargeur + 2 batteries + coffret) |
| `_orient.js` | rend un GLB sous 4 angles à 90°, pour choisir l'orientation d'un outil |
| `collage-pack*.js`, `collage-duo-nocase.js` | collages des posters de packs (images des cartes) |
| `_tools_poster.js` | rendu d'un outil à la caméra poster |

## Pourquoi les garder
Refaire un pack 3D sans eux coûterait des jours : le mapping au sol est
verrouillé, les orientations validées sont gravées, et le builder plante
volontairement si deux objets se chevauchent.
Voir `docs/PACK-3D-LAYOUT.md` et les règles packs 3D de la mémoire projet.

## ⚠️ Leurs dépendances ne sont PAS ici
`gltf-transform` et `meshoptimizer` pèsent **110 Mo** et ne doivent jamais
entrer dans git. Pour s'en servir :

```bash
cd outils/gltf && npm install @gltf-transform/core @gltf-transform/functions \
  @gltf-transform/extensions meshoptimizer three
```
