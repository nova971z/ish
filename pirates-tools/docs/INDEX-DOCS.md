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
| `IMPORT-REFUSES.md` | les références du relevé fournisseur **écartées** à l'import, avec leur motif (nom vide, libellé tronqué par l'analyse de la source, doublon de SKU ou de référence alternative). Écrites plutôt qu'avalées en silence — régénéré par `node outils/importer-catalogue.mjs` |
| `CSS-CARTE.md` | **tous** les commentaires retirés de `styles.css`, rattachés à leur sélecteur — ils coûtaient 20 795 octets gzip **à chaque visite** (navigation privée : aucun cache ne les amortit). Régénéré par `node outils/purge-css.mjs` |
| `LECONS.md` | registre des pannes et de la porte que chacune a produite |
| `DEMANDES.md` | **ce que l'user a demandé, et où ça en est** — trois états, et la CI REFUSE de livrer tant qu'une ligne est `OUVERT` (`scripts/check-demandes.js`) |
| `ERREURS.md` | mes erreurs classées par **origine** — 7 mécanismes, lus par le sommaire seul (`scripts/erreurs.js`) |
| `JURIDIQUE.md` | les 5 domaines qui engagent la responsabilité — porte à ouvrir avant d'éditer (`scripts/juridique.js`) |
| `EPREUVES.md` | trois épreuves en environnement isolé : ce que le dispositif attrape et ce qu'il laisse passer |
| `PRIX-SOURCE-UNIQUE.md` | pourquoi le site avait plusieurs prix, et la boucle qui referme l'écart |
| `METHODES.md` | **les techniques de travail, NOMMÉES** — construire une table, ajouter des produits, comment le parseur doit se comporter, prouver qu'un contrôle sert. 26 méthodes, chacune avec la panne qui l'a payée et le code qui l'applique. C'est le document qu'on relit avant de recommencer un chantier du même genre pour une autre marque ou un autre fournisseur |
| `INDEX-DOCS.md` | ce fichier |

## 🟡 VIVANTS — travaux en cours, à reprendre

| Document | Pourquoi il reste vivant |
|---|---|
| `PLAN-FONDATIONS.md` | plan stratégique en 10 phases, seule la phase 0 est faite |
| `PLAN-ACTION-EN-ATTENTE.md` | décisions produit qui attendent l'user |
| `PLAN-ABONNEMENTS.md` | fonctionnalité non lancée, spécification conservée |
| `PLAN-SERVICE-COURSIER.md` | cadre du service de livraison, encore appliqué |
| `PLAN-REVOLUT.md` | migration du paiement Stripe → Revolut : inventaire 1=1, correspondance des API, étapes, et **ce qui manque encore à lire à la source** |
| `TRAQUEUR-URLS.md` | raccourcis du traqueur de prix, utilisés en production |
| `NOMENCLATURE.md` | **comment les fournisseurs nomment outillage, quincaillerie et EPI** — 221 types, 1 075 écritures (français, espagnol, anglais), 39 rayons rangés en entonnoir ; **préfixes** ET suffixes de référence DeWALT, normes EPI, emmanchements, nuances, dentures. Contrepartie lisible de `api/_lib/nomenclature.js` |
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

| `docs/ETAT-DASHBOARD.md` | Faits vérifiés par capture sur le dashboard Vercel — ne jamais redemander |
