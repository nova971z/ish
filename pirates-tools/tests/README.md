# `tests/` — les harnais de vérification, VERSIONNÉS

## Pourquoi ce dossier existe
Jusqu'au 28/07/2026, **60 harnais (~959 assertions)** protégeant la chaîne
livraison, les paiements et la double authentification vivaient dans un
répertoire temporaire **situé hors du dépôt** (`/tmp/claude-0/…/scratchpad/`).
`git add` ne pouvait même pas les atteindre. Un recyclage du conteneur les
détruisait, et avec eux toute capacité de prouver une non-régression.

C'était le seul risque du projet à la fois **immédiat et irréversible**.

## État actuel — deux étages, volontairement

### `tests/_bruts/` — le sauvetage
Copie **VERBATIM** des 60 harnais, telle quelle. Ces fichiers :
- ⚠️ contiennent des **chemins absolus** (`/home/user/ish/pirates-tools`,
  `/opt/node22/lib/node_modules/playwright`) → ils ne tournent **que** dans
  l'environnement où ils ont été écrits ;
- ⚠️ **n'ont pas encore été retriés** : certains encodent des specs que l'user
  a renversées depuis (panneaux qui s'ouvraient seuls, `#courierMine` visible…).
  **Un test faux est pire qu'un test absent** ;
- ⚠️ dupliquent chacun ~20 lignes de serveur HTTP statique.

**Ils sont là pour ne plus pouvoir être perdus, pas pour être lancés en l'état.**

### `tests/` (racine) — les harnais portés
Au fur et à mesure du tri, chaque harnais est :
1. **relancé** — s'il échoue, il est corrigé ou supprimé **avec motif écrit** ;
2. rendu **portable** (chemins relatifs au dépôt, socle partagé) ;
3. déplacé de `_bruts/` vers ici.

`_bruts/` doit finir vide. Tant qu'il ne l'est pas, le tri n'est pas terminé.

## Règles
- ❌ **Jamais de `node_modules` ici.** Le code des outils, jamais leurs
  dépendances. (Mesuré le 28/07 : les `node_modules` du scratchpad pesaient
  **725 Mo**, dont 110 Mo pour les seuls outils 3D. Git n'oublie jamais.)
- ❌ **Jamais déployé** : `tests/` est exclu par `.vercelignore` et n'entre
  pas dans le Service Worker.
- ❌ **Aucun identifiant réel** : pas de clé de service, pas d'ID de projet
  Firebase de production. Un harnais qui écrirait dans la vraie base serait
  un désastre.
