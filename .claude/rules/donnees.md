---
paths:
  - pirates-tools/firestore.rules
  - pirates-tools/storage.rules
  - pirates-tools/firestore.indexes.json
  - pirates-tools/api/_lib/firebase.js
---

# Règles des données — Firestore et Storage

*Extraites de la mémoire projet le 29/07/2026 (`docs/EXTRACTION-REGLES.md`,
groupe E).*

## Index composites — le piège que l'émulateur ne révèle jamais

**Toute requête combinant `where` et `orderBy` sur deux champs différents exige
un index composite.** Sans lui, la requête échoue en production avec
`FAILED_PRECONDITION`.

⚠️ **L'émulateur Firestore crée ses index à la volée** : il ne signalera
**jamais** ce manque. Un test vert ne prouve donc rien ici. Deux issues
acceptables :
1. **supprimer le besoin** — filtrer sur un seul champ et trier en mémoire
   quand le volume le permet (préféré : aucune étape de déploiement à ne pas
   oublier) ;
2. déclarer l'index dans `firestore.indexes.json` **et** le déployer.

Ce défaut a échappé à toute la batterie de tests le 27/07/2026 et aurait tué
le chat en production.

## Déploiement des règles

**Toute modification de `firestore.rules` ou `storage.rules` doit être
déployée** — `npx firebase deploy --only firestore:rules` (ou `storage`). Tant
que ce n'est pas fait, la protection est **théorique** : les règles réelles du
projet restent inconnues.

**Les règles sont en `default-deny`.** Toute collection nouvelle est fermée
jusqu'à déclaration explicite. `scripts/test-rules.js` doit exercer **chaque**
collection déclarée — le contrôle `p4-firestore` de l'audit le vérifie.

**Sur Storage, le client ne lit ni ne supprime jamais.** L'écriture est
réservée aux participants de la course, plafonnée en taille et en type.
L'accès en lecture passe par des URL signées à durée limitée, côté serveur.

## Identité

**L'`uid` ne vient JAMAIS du corps de la requête.** Il est dérivé
**uniquement** du jeton Firebase vérifié (`Authorization: Bearer`). Faire
confiance à `body.uid` a ouvert une faille d'accès aux données d'autrui
(session S2).

**`email_verified` se lit dans la revendication signée du jeton**, jamais dans
un champ transmis. ⚠️ Cette revendication n'est rafraîchie qu'au renouvellement
du jeton (1 h) ou sur `getIdToken(true)` : sans forçage, un utilisateur qui
vient de valider son adresse reste refusé pendant une heure.

**Ne jamais journaliser de donnée personnelle** — ni e-mail, ni adresse. On
journalise une référence de commande, un statut, un message d'erreur.
