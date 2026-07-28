# AVANCEMENT — chantier fondations & mémoire

> **Ce fichier est le POINT DE REPRISE.** Au démarrage d'une session,
> `CLAUDE.md` est chargé automatiquement ; **le premier fichier que j'ouvre
> volontairement, c'est celui-ci**, et rien d'autre avant lui.
> Mis à jour à la fin de chaque session — surtout quand elle s'est mal passée.

Dernière mise à jour : **28/07/2026**

---

## PLAN FONDATIONS (`docs/PLAN-FONDATIONS.md`, v5)

| Phase | État | Où ça en est |
|---|---|---|
| **0 — Sauver les harnais** | 🟢 **58/60 tranchés** | **52 harnais verts (977/977)** + 1 ignoré (prérequis déclaré), 5 supprimés avec motif, **2 non diagnostiqués**. Détail : `docs/TRI-SCRATCHPAD.md` |
| 1 — Architecture documentaire | ⬜ à faire | remplacée par le plan mémoire ci-dessous |
| 2 — Invariants | ⬜ à faire | |
| 3 — Graphe d'appels | ⬜ à faire | doit libérer ≥ 2 Ko sur `app.js` avant la phase 5 |
| 4 — Catalogue des harnais | ⬜ à faire | dépend de la fin de la phase 0 |
| 5 — Cartographie / entonnoir v2 | ⬜ à faire | **bloquée** : `app.js` à 205/205, marge nulle |
| 6 — Les portes | 🟡 amorcée | `check-harnais` créé et **prouvé faillible** |
| 7 — Audit ligne par ligne | ⬜ à faire | 7 lots |
| 8 — Synthèse et découpage | ⬜ à faire | |
| 9 — Corrections | ⬜ à faire | |

## PLAN MÉMOIRE & ENTONNOIR v1 (`docs/PLAN-MEMOIRE-ET-ENTONNOIR.md`)

| Étape | État | Où ça en est |
|---|---|---|
| **1 — Vérifier `.claude/rules/`** | ✅ **FAIT** | hypothèse **VÉRIFIÉE** (Claude Code 2.1.220). La règle ne se charge qu'à l'ouverture du fichier visé, jamais avant, jamais sur un autre. **L'architecture cible est confirmée, rien à changer.** Fichier d'essai supprimé. |
| 2 — Copier avant de couper | ⬜ à faire | `docs/JOURNAL.md` = copie verbatim de `CLAUDE.md`, **avant toute coupe** |
| 3 — Extraire les 55 règles enfouies | ⬜ à faire | l'étape la plus délicate |
| 4 — Registre des décisions | ⬜ à faire | dont les **3 décisions en suspens** non tranchées |
| 5 — Règles à périmètre | ⬜ à faire | argent · livraison · produits · front |
| 6 — `CLAUDE.md` = aiguillage ≤ 80 l. | ⬜ à faire | |
| 7 — État vivant | ⬜ à faire | |
| 8 — `scripts/ou.js` (entonnoir v1) | ⬜ à faire | |
| 9 — Les 10 portes de la mémoire | ⬜ à faire | |
| 10 — Hook *(optionnel)* | ⬜ à faire | `.claude/settings.json` versionné |
| 11 — Épreuve à froid | ⬜ à faire | |
| 12 — Ranger et mesurer | ⬜ à faire | |

---

## ▶️ REPRENDRE ICI

**Prochain geste** : les **2 derniers** harnais de `tests/_bruts/`.

| Harnais | Symptôme mesuré |
|---|---|
| `regression.mjs` | 8/9 — « PDF simple : pas de switch » |
| `test-variant.mjs` | 13/15 — variantes coffret/nue |

**Puis** : recréer un harnais pour le **rendu des caractéristiques sur la fiche
produit** — couverture perdue avec les 5 harnais supprimés. ⚠️ **Sans nommer
aucun produit** : c'est la leçon de `verify-beacon` et de `audit-buttons`.

**Puis** : le tri des ~690 entrées de scratchpad non catégorisées.

**Enfin** : `CLAUDE.md` (plan mémoire, étape 2 — la copie verbatim avant toute
coupe, puis les 55 règles enfouies).

## ✅ LES 3 DÉCISIONS EN ATTENTE ONT ÉTÉ TRANCHÉES (28/07/2026)
Registre : **`docs/DECISIONS.md`**

| # | Décision | Contrôle qui l'applique |
|---|---|---|
| **D-001** | plafond **400 Ko** sur le total du texte servi à froid (367,8 aujourd'hui) | `p8-perf` **P8.4**, prouvé faillible |
| **D-002** | aucune image servie au-dessus de **871 Ko** — **sans jamais recompresser** : on sert la bonne taille, pas une qualité dégradée | `p8-perf` **P8.5**, prouvé faillible, `_originals/` exclu |
| **D-003** | **pas de repères de zone dans le code livré** — les 434 noms de fonction donnent un repère tous les 34 lignes pour 0 Ko, contre 97 lignes pour +1,36 Ko | conséquence : la phase 5 perd sa condition d'entrée **et** son bump SW |
