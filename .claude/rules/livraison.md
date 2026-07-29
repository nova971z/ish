---
paths:
  - pirates-tools/api/contact.js
  - pirates-tools/api/_lib/courses.js
---

# Règles de la chaîne de livraison

*Extraites de la mémoire projet le 29/07/2026 (`docs/EXTRACTION-REGLES.md`,
groupe H). Le fondement n'est pas ergonomique mais **juridique** : la
plateforme ne doit ni fixer le prix, ni encaisser la course — sinon
art. L7342-1 et présomption de salariat, directive (UE) 2024/2831.*

## Qui décide quoi — gravé, à ne plus inverser

**Le CLIENT pose TOUTES ses conditions à la commande** — date, créneau, point
de dépôt, précisions — et ne les ressaisit **jamais** ensuite.

**Le CLIENT ne propose JAMAIS de prix.** S'il trouve trop cher, il négocie dans
la discussion et le livreur ajuste ses tarifs dans ses propres paramètres.

**Le MODE DE RÈGLEMENT appartient au LIVREUR** (champ de son profil public). Le
client ne le choisit pas.

**L'accord n'est pas une négociation champ par champ : il ENTÉRINE.** Le corps
de la requête ne fournit que le prix ; date, heure, lieu et notes viennent de
la course, le règlement vient du profil. Une injection de `lieu` ou de `date`
par le corps est ignorée. **L'interface n'est jamais la sécurité** : le serveur
refuse le client sur `course-accord-propose`.

**Le tri de l'annuaire ne dépend JAMAIS du prix.** Ordre : disponibilité, puis
note, puis ancienneté. Aucune sanction ni aucun classement ne peut découler du
montant demandé — c'est précisément ce qui ferait de nous un employeur.

## Cloisonnement des conversations

**Le livreur suivant ne lit JAMAIS la conversation précédente.** Chaque remise
en ligne incrémente `round` ; les règles Firestore n'autorisent lecture et
écriture des messages que du round courant, et l'ex-livreur perd tout accès.
⚠️ Corollaire obligatoire côté client : la requête **doit** filtrer sur
`round`, sinon Firestore refuse la requête entière.

## Preuves et consentements

**Photo du chantier obligatoire à la commande** — le livreur doit pouvoir
repérer le dépôt.

**Deux photos obligatoires à la livraison**, prises sur place : le colis remis,
et une vue large du chantier.

**Consentement vidéo obligatoire des deux côtés** avant tout dépôt de vidéo.
Les vidéos sont privées, jamais publiées, visibles de l'administration seule,
et **supprimées à la clôture du litige**.

**Le code de remise à 6 chiffres n'est JAMAIS visible d'un livreur** — ni dans
la liste des courses disponibles, ni dans un e-mail. Il n'est joint qu'au
client propriétaire de la course.

## États

**`livree` n'est PAS soldée.** Elle attend la confirmation du client — c'est
même l'action la plus urgente. Seuls `terminee` et `annulee` sont finis.

**On ne CUMULE jamais un panier restauré.** Annuler trois fois ne doit pas
donner six articles : on porte la quantité au **maximum** entre le panier et la
course, jamais la somme.

**Les prix viennent TOUJOURS du catalogue serveur.** Les lignes enregistrées ne
portent que `{key, qty}` ; titre, prix et image sont relus au catalogue. Une
clé disparue est ignorée, jamais rendue en ligne fantôme.

**Jamais de bouton `disabled` comme état de repos.** Un bouton grisé ne dit ni
ce qui manque, ni quoi faire, et bloque le test. Il est toujours actif et a
toujours un effet visible. `disabled` n'est légitime que pendant un envoi en
cours.

## Périmé — ne JAMAIS repromouvoir

⛔ « Le client paie sa course en ligne » et « frais de livraison autoritaires
serveur » : **renversés le 27/07/2026**. La plateforme ne fixe plus le prix et
n'encaisse plus la course. Le code de paiement subsiste pour l'achat d'outils —
ne pas le supprimer, mais ne plus le brancher sur la livraison.
