# Plan d'optimisation des performances — Pirates Tools

> Objectif : réduire le chargement initial de **~15 Mo à ~1 Mo** avec **zéro perte
> de qualité visible**. Basé sur l'audit du 15/07/2026.
>
> Principe qualité : on redimensionne chaque image à **2× sa taille d'affichage**
> (netteté Retina garantie) et on compresse en visuellement sans perte. Un logo
> de 4000 px affiché à 200 px est identique à un logo de 400 px affiché à 200 px —
> les pixels en trop ne sont jamais vus, ils ne font qu'alourdir.
>
> Outil : `sharp` (référence Node). Règle d'or : **1 étape = 1 vérification**.
> Sécurité : les originaux haute résolution sont conservés (jamais écrasés).

## Constat de départ (audit)

| Actif | Actuel | Cible | Gain |
|-------|--------|-------|------|
| 5 icônes PWA (1024×1536, 1,35 Mo ch.) | ~6,6 Mo | ~80 Ko | −98 % |
| 7 logos marques (jusqu'à 4000×4000) | ~8 Mo | ~0,3 Mo | −96 % |
| Précache SW au 1ᵉʳ chargement | ~8,3 Mo | <0,5 Mo | −94 % |
| model-viewer (CDN, dans `<head>`) | chargé partout | à la demande | −200 Ko/req tierce |
| **Total chargement initial** | **~15 Mo** | **~1 Mo** | **−93 %** |

---

## Étape 1 — Sauvegarde des originaux (sécurité, réversibilité)
- Copier tous les PNG haute résolution actuels dans `images/_originals/` (hors du champ servi, non déployé).
- **Vérif** : les originaux existent et sont intacts avant toute transformation.
- **Risque** : nul. Filet de sécurité complet.

## Étape 2 — Redimensionner les icônes PWA (le plus gros gain)
- `icon-180/192/256/384/512.png` → redimensionner chacune à sa **taille nominale** (180, 192, 256, 384, 512 px, carré), PNG optimisé.
- Garder PNG (les icônes de manifest PWA exigent PNG pour compatibilité maximale).
- Corriger le ratio : les sources sont 1024×**1536** (pas carré) → recadrer/adapter en carré propre pour les icônes d'app.
- **Vérif** : chaque icône fait sa taille nominale, poids <40 Ko ; l'icône d'install PWA et le favicon s'affichent net.
- **Gain** : ~6,6 Mo → ~80 Ko.

## Étape 3 — Logo hero (LCP — la 1ʳᵉ image peinte)
- Le hero utilise `icon-512` + srcset 256/384/512. Après l'étape 2 ces fichiers sont légers → le LCP passe de 1,35 Mo à ~40 Ko.
- Fournir en plus une version **WebP** du logo (fallback PNG) pour −30 % supplémentaires.
- **Vérif** : le logo d'accueil reste parfaitement net sur écran Retina ; poids LCP <50 Ko.

## Étape 4 — Logos de marques (textures des sphères 3D accueil)
- `dewalt/stanley/facom/flex/makita/wera/festool` (jusqu'à 4000×4000) → redimensionner à **512×512** (2× l'affichage ~200 px), format WebP + fallback PNG.
- Vérifier que la texture reste nette sur les sphères (elle le sera : petite sphère).
- **Vérif** : sphères de marques identiques à l'œil ; total logos ~8 Mo → ~0,3 Mo.

## Étape 5 — Images produits (bonus léger)
- Les 26 `main.jpg` sont déjà légers (~34 Ko). Conversion **WebP** (qualité 82) pour ~−30 % + fallback JPEG via `<picture>`.
- **Vérif** : produits identiques à l'œil ; catalogue plus léger.
- **Priorité** : basse (déjà correct). Optionnel.

## Étape 6 — Alléger le précache du Service Worker
- Découle des étapes 2-4 : le précache tombe de ~8,3 Mo à <0,5 Mo automatiquement (mêmes fichiers, désormais légers).
- **Vérif** : 1ᵉʳ chargement mesuré <1 Mo. Bump SW.

## Étape 7 — Différer le 3D et les tiers (chemin critique)
- `model-viewer.min.js` : le retirer du `<head>` et le charger **à la demande** (comme Three.js via `ensureThree`) uniquement quand un modèle 3D doit s'afficher (PDP, carrousel accueil).
- Différer l'initialisation du carrousel 3D + sphères Three.js **après le premier paint** (déjà partiellement via IntersectionObserver — à confirmer/renforcer).
- Retirer le `preconnect` vers `wa.me` (jamais utilisé au chargement).
- **Vérif** : le premier affichage ne dépend plus d'aucun script tiers.
- **Risque** : moyen (touche au chargement du 3D) → test visuel accueil + PDP requis.

## Étape 8 — Vérification finale
- Mesurer le poids total du 1ᵉʳ chargement (avant/après) et le confirmer par un tableau.
- Contrôle visuel : accueil (logo, sphères), catalogue, une PDP.
- `node scripts/ci.js` vert (les chemins d'images doivent toujours exister). Bump SW + `?v=`.
- Merger vers `master` pour déployer.

---

## Ordre d'exécution recommandé (impact décroissant)
1. **Étapes 1 → 2 → 3** : icônes + logo hero — **~7 Mo économisés, sans risque**. À faire en premier.
2. **Étape 4** : logos de marques — **~7,7 Mo économisés**.
3. **Étape 6** : le précache s'allège automatiquement.
4. **Étape 7** : différer le 3D — gain sur le temps de premier paint.
5. **Étapes 5 + 8** : bonus WebP produits + vérification.

## Garanties qualité (non négociable)
- Redimensionnement à **2× la taille d'affichage** → aucune perte visible, même sur Retina.
- Originaux **conservés** dans `images/_originals/` → réversible à tout moment.
- Compression **visuellement sans perte** (WebP q82-90, PNG optimisé).
- Contrôle **visuel** après chaque étape avant de valider.
