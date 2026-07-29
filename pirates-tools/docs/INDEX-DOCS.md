# INDEX DES DOCUMENTS — ce qui est vivant, ce qui est archivé

**Établi le 29/07/2026** (étape 10 du runbook mémoire).

> ⛔ **Aucun document n'est supprimé.** Archiver, c'est **déplacer** dans
> `docs/archives/`. Un document rangé reste lisible, cherchable et
> restaurable ; un document supprimé emporte avec lui le raisonnement qui l'a
> produit.

Un document que **rien ne cite** n'est jamais lu. La porte **M4** de
`scripts/check-memoire.js` refuse désormais tout orphelin : soit il est
désigné ici, soit il est rangé.

---

## 🟢 VIVANTS — source de vérité, cités depuis l'aiguillage

| Document | Rôle |
|---|---|
| `CARTOGRAPHIE.md` | où est quoi dans le code, fonction par fonction |
| `METHODE-ENTREPRISE-FISCALITE.md` | statut, TVA, octroi de mer — source fiscale |
| `REGLES-PRODUITS.md` | prix, posters, registre des orientations 3D |
| `PACK-3D-LAYOUT.md` | mapping au sol verrouillé des packs |
| `DECISIONS.md` | registre des décisions et de leurs renversements |
| `ETAT.md` | ce qui reste à faire, avec preuve |
| `JOURNAL.md` | copie intégrale de la mémoire — le filet |
| `EXTRACTION-REGLES.md` | le tri des 79 règles enfouies |
| `AVANCEMENT-FONDATIONS.md` | où en est le chantier |
| `LECONS.md` | registre des pannes et de la porte que chacune a produite |
| `ERREURS.md` | mes erreurs classées par **origine** — 6 mécanismes, lus par le sommaire seul (`scripts/erreurs.js`) |
| `JURIDIQUE.md` | les 5 domaines qui engagent la responsabilité — porte à ouvrir avant d'éditer (`scripts/juridique.js`) |
| `INDEX-DOCS.md` | ce fichier |

## 🟡 VIVANTS — travaux en cours, à reprendre

| Document | Pourquoi il reste vivant |
|---|---|
| `PLAN-FONDATIONS.md` | plan stratégique en 10 phases, seule la phase 0 est faite |
| `PLAN-ACTION-EN-ATTENTE.md` | décisions produit qui attendent l'user |
| `PLAN-ABONNEMENTS.md` | fonctionnalité non lancée, spécification conservée |
| `PLAN-SERVICE-COURSIER.md` | cadre du service de livraison, encore appliqué |
| `TRAQUEUR-URLS.md` | raccourcis du traqueur de prix, utilisés en production |
| `MAKITA-POSTERS-TODO.md` | posters restant à produire |
| `entreprise-sasu.md` | fiche d'identité de la société |
| `D1-EXTRACTION-ADMIN.md` | analyse préalable de l'extraction de l'administration — chantier suspendu |

## 📦 ARCHIVÉS — travail terminé, déplacé dans `docs/archives/`

| Document | Pourquoi archivé |
|---|---|
| `AUDIT-INTEGRITE-2026-07.md` | audit soldé ; ses conclusions vivent dans le code et les portes CI |
| `PLAN-MEMOIRE-ET-ENTONNOIR.md` | remplacé par `RUNBOOK-MEMOIRE.md`, plus précis et exécutable |
| `PLAN-PERF.md` | travaux de performance terminés ; les budgets vivent dans `p8-perf.js` |
| `TRI-SCRATCHPAD.md` | tri des 748 entrées terminé |
| `TRI-SCRATCHPAD-INVENTAIRE.md` | inventaire du même tri |
| `plan-creation-coursier.md` | remplacé par `PLAN-SERVICE-COURSIER.md` |
| `stack.md` | inventaire technique d'avril 2026, périmé ; `CARTOGRAPHIE.md` fait foi |
| `RUNBOOK-MEMOIRE.md` | chantier mémoire terminé le 29/07 ; conservé pour ses 7 garde-fous |

---

## Pourquoi ce fichier existe

`docs/` comptait **23 documents**, dont **15 que rien ne citait** — y compris
cinq écrits pendant ce chantier. Un plan que personne ne rouvre ne guide rien :
il occupe de la place et donne l'illusion que le sujet est traité.

La porte M4 rend l'oubli **mécaniquement impossible** : créer un document sans
le désigner fait rougir la CI.
