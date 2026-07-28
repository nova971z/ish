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
| **0 — Sauver les harnais** | 🟢 **quasi terminée (47/60 tranchés)** | risque irréversible **LEVÉ**. **42 portés et verts (777/777)**, 3 corrigés (specs renversées), 5 supprimés avec motif écrit, **13 non diagnostiqués** remis dans `tests/_bruts/`. Détail complet : `docs/TRI-SCRATCHPAD.md` |
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

**Prochain geste** : trier les **13 harnais restants** de `tests/_bruts/`
(audit-buttons, carte2b, pipeline-emulator, regression, test-acc-ui, test-grid,
test-variant, test-variant-live, verify-beacon, verify-consent, verify-cron,
verify-dashboard, verify-globe). Chacun reçoit une issue : porté, corrigé, ou
supprimé avec motif.

**Puis** : recréer un harnais pour le **rendu des caractéristiques sur la fiche
produit** — couverture perdue en supprimant les 5 harnais ancrés sur l'ancien
catalogue, et signalée comme telle plutôt que passée sous silence.

```bash
cd pirates-tools
node tests/lancer.mjs --noyau      # 6 harnais, ~51 s — l'argent et la livraison
node tests/lancer.mjs --complet    # 19 harnais, ~239 s
node tests/_porter.mjs tests/_bruts/<fichier>   # rendre un harnais portable
node scripts/ci.js                 # 30 contrôles, ~106 ms
```

## ⏳ EN ATTENTE D'UNE DÉCISION DE L'USER
1. **Plafond sur le TOTAL du texte** chargé à froid (368 Ko aujourd'hui) —
   un plafond par fichier se contourne en découpant.
2. **Plafond par image, selon le rôle** — vignette serrée, héros large.
   Mesuré : le plus gros héros pèse **871 Ko**, rien ne le surveille.
   ⚠️ Jamais un budget unique : **la qualité des visuels n'est pas la variable
   d'ajustement.**
3. **Les 1,36 Ko des repères de zone** (phase 5) — c'est une décision, pas un
   effet de bord d'un plafond relevé.
