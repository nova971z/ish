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
| **0 — Sauver les harnais** | ✅ **TERMINÉE — 69/69 tranchés** | **64 harnais verts (1 083/1 083)** + 1 avec prérequis déclaré + 5 supprimés avec motif. `tests/_bruts/` vide et supprimé. **Les 748 entrées des deux scratchpads sont catégorisées** (`docs/TRI-SCRATCHPAD-INVENTAIRE.md`). ⚠️ Le compte n'était pas 60 mais **69** : 9 harnais du scratchpad du dépôt avaient été oubliés. |
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

**Au 16/08/2026 — chantier en cours : calibrage du parseur, marque par marque.**
Les fiches (descriptions, caractéristiques techniques) viennent **après** :
ordre donné par l'user le 15/08.

| Marque | État | Ce qui reste |
|---|---|---|
| DeWALT | ✅ bouclée | rien — 100 % des tuiles lues, prouvé sur son balayage |
| **Makita** | 🔄 en cours | la traîne des fiches absentes de la grille se draine par le rattrapage ; surveiller les racines déclarées `muettes` |
| Milwaukee | ⏸️ pas commencée | plan d'URLs prêt (`api/_lib/traqueur-plans.js`), jamais balayée |

**Prochain geste** : au balayage suivant, lire `rattrapageMuettes` dans la
réponse du plan — ce sont les références que la recherche du fournisseur ne
rend **jamais**. Elles ont besoin d'un autre chemin, pas d'un balayage de plus.
L'histoire détaillée des 48 h (15–16/08) est au `docs/JOURNAL.md`, section
« SESSION DES 48 HEURES ».

*Chantier fondations & mémoire : terminé le 29/07/2026, historique ci-dessous.*

```bash
cd pirates-tools
node tests/lancer.mjs --noyau      # 6 harnais, ~52 s — l'argent et la livraison
node tests/lancer.mjs --complet    # 64 harnais, ~625 s
node scripts/ci.js                 # 32 controles, ~85 ms
```

## ✅ LES 3 DÉCISIONS EN ATTENTE ONT ÉTÉ TRANCHÉES (28/07/2026)
Registre : **`docs/DECISIONS.md`**

| # | Décision | Contrôle qui l'applique |
|---|---|---|
| **D-001** | plafond **400 Ko** sur le total du texte servi à froid (367,8 aujourd'hui) | `p8-perf` **P8.4**, prouvé faillible |
| **D-002** | aucune image servie au-dessus de **871 Ko** — **sans jamais recompresser** : on sert la bonne taille, pas une qualité dégradée | `p8-perf` **P8.5**, prouvé faillible, `_originals/` exclu |
| **D-003** | **pas de repères de zone dans le code livré** — les 434 noms de fonction donnent un repère tous les 34 lignes pour 0 Ko, contre 97 lignes pour +1,36 Ko | conséquence : la phase 5 perd sa condition d'entrée **et** son bump SW |

---

# CHANTIER MÉMOIRE — TERMINÉ le 29/07/2026 (étapes 1 → 12)

## Le chiffre qui juge tout le reste

| Mesure | Avant | Après |
|---|---|---|
| `CLAUDE.md` chargé à chaque session | **1 552 lignes · 113 672 octets** | **80 lignes · 3 721 octets** |
| Fichiers à ouvrir pour savoir où intervenir | 3 à 6 | **1 commande** |
| Règles opposables retrouvables mécaniquement | 0 | **51, dans 5 fichiers** |
| Documents `docs/` que rien ne cite | 15 | **0** |
| Portes protégeant la mémoire | 0 | **9** |
| Contrôles CI | 30 | **32** (durée 101–155 ms, 5 relevés) |

**La mémoire permanente a été divisée par 30** — et rien n'a été perdu :
`docs/JOURNAL.md` en conserve la copie intégrale, vérifiée au `diff`.

## Ce qui a été fait, étape par étape

1. **Mesuré** avant de toucher : 1 552 l., 45 sections, 23 documents dont 6 cités.
2. **Filet posé** — `docs/JOURNAL.md`, copie verbatim, `diff` sans écart.
3. **79 règles enfouies** débusquées par `scripts/regles-enfouies.js`, tranchées
   une par une dans `docs/EXTRACTION-REGLES.md` : 51 promues, 13 déjà couvertes,
   12 narratives, 3 périmées. *(Le runbook annonçait 55 : c'était une estimation
   présentée comme une mesure.)*
4. **Registre des décisions** porté à 13, avec **6 renversements chaînés** —
   plus aucune décision morte ne cohabite avec sa version vivante.
5. **Règles à périmètre** — 5 fichiers dans `.claude/rules/`, chargés
   automatiquement à l'ouverture du fichier concerné.
6. **`CLAUDE.md` devenu un aiguillage** de 80 lignes.
7. **`docs/ETAT.md`** — les tâches, chacune avec sa preuve. **3 « à faire » sur
   11 étaient déjà faits ou caducs**, vérifié par commande.
8. **`scripts/ou.js`** — l'entonnoir : six blocs par intention, jamais « rien ».
9. **9 portes** dans la CI, **toutes prouvées faillibles par sabotage**.
10. **7 documents archivés** (jamais supprimés), index dans `docs/INDEX-DOCS.md`.
11. **Épreuve à froid : 10/10 intentions** résolues en une commande.
12. Mesures ci-dessus.

## Les défauts trouvés dans mon propre travail

Ils comptent autant que le reste : un outil qui ment est pire que pas d'outil.

- Le runbook annonçait « **risque mesuré : 55 lignes** » — **aucune commande**
  ne produisait ce chiffre. C'était **79**.
- Mon premier bilan d'extraction faisait **73 au lieu de 79** : six lignes
  disparaissaient sans que rien ne le signale, dans un document dont l'objet
  est de ne rien perdre.
- La porte M1 **comptait une ligne de trop** (le saut de ligne final) et
  refusait un fichier conforme.
- La porte M4 ignorait `INDEX-DOCS.md`, c'est-à-dire **le fichier même qui
  range les documents** — elle déclarait orphelin ce qui était rangé.
- La vérification du filet indiquait `tail -n +6` pour un en-tête de 6 lignes.
- L'épreuve à froid a **échoué sur « le site ne s'ouvre plus »** — l'intention
  exacte de la panne de la nuit. L'outil a signalé le trou au lieu de mentir.

## Ce qui reste ouvert

- `docs/PLAN-FONDATIONS.md` : phases 1 à 9 non commencées.
- `docs/ETAT.md` : 8 tâches réellement ouvertes, dont 4 bloquantes au lancement.
