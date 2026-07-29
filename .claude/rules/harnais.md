---
paths:
  - pirates-tools/tests/**
  - pirates-tools/scripts/**
---

# Règles des harnais et de la mesure

*Extraites de la mémoire projet le 29/07/2026 (`docs/EXTRACTION-REGLES.md`,
groupe I). Toutes viennent d'un test qui a été vert pour la mauvaise raison.*

## La règle mère

**Une vérification qu'on ne parvient pas à faire échouer ne vérifie rien.**
Chaque contrôle nouveau doit être prouvé faillible par **réintroduction
délibérée du défaut**. Un détecteur faussement vert est pire que pas de
détecteur : il donne une confiance qui n'existe pas.

⚠️ Corollaire : **un sabotage qui ne casse rien ne prouve rien.** Si le test
reste vert après sabotage, vérifier d'abord que le sabotage était réel — il
tombe souvent à l'intérieur d'un `try/catch` existant.

## Pièges de mesure — chacun a produit un faux résultat

**`behavior: 'instant'` est obligatoire** sur tout `scrollIntoView`. Le
défilement doux global du site fausse les lectures : la mesure part avant
l'arrivée.

**Deux `goto()` sur la MÊME URL ne rechargent pas la page** — c'est une
navigation same-document, l'application ne se ré-initialise pas et on teste
l'état précédent. Toujours faire varier l'URL (`?b=N`).

**`addInitScript` se réinjecte à CHAQUE navigation** — impossible de simuler
un état vidé sans un drapeau explicite.

**`querySelector('div[role=alert]')` matche `#stripeCardError` en premier.**
Cibler par identifiant, jamais par rôle générique.

**`context.route()` n'intercepte PAS les requêtes émises depuis un Service
Worker.** Pour couper réellement le réseau vu du Service Worker, **éteindre le
serveur**.

**Lire `innerText` juste après `waitUntil: 'commit'` renvoie une chaîne vide** :
la page vient de s'engager, elle n'est pas parsée. Attendre
`domcontentloaded`.

**Un harnais peut être vert sans avoir rien franchi.** Sans clés
d'environnement, un point d'entrée répond 503 **avant** tout contrôle, et les
tests « ce n'est pas bloqué » passent pour la mauvaise raison. D'où
`compteur().prealable()` : une condition sans laquelle le harnais n'a rien
vérifié fait **échouer** le harnais au lieu de le laisser verdir à vide.

**Une propriété testée sur un APPEL ISOLÉ ne dit rien de l'usage réel.**
Mesuré le 29/07/2026 : une fonction de remboursement passait **5 propriétés sur
6** et se trompait d'un centime dès le deuxième appel — parce qu'un client ne
renvoie jamais tout d'un coup. Seule la propriété qui rejouait une **SÉQUENCE**
d'appels l'a démasquée. Un jeu de propriétés tiré de la *forme de l'énoncé* est
aveugle à la *séquence d'appels* : toute fonction appelée plusieurs fois sur le
même objet se teste en séquence, pas seulement en un coup.

**Un énoncé peut être INSATISFIABLE.** Avant de s'acharner, vérifier qu'une
solution existe : trois unités identiques et un total non divisible par trois
rendaient l'invariant demandé arithmétiquement impossible. Démontrer
l'impossibilité vaut mieux que produire un contournement qui ment.

## Ancrage

⛔ **Un harnais ne nomme jamais une donnée du catalogue** (référence produit,
titre, prix). Dix-huit harnais sont morts pour cette raison : ils affirmaient
qu'un choix délibéré de l'user était un défaut. Le sujet du test se **choisit à
l'exécution**, sur un critère.

⛔ **Un harnais ne s'ancre jamais sur une formulation exacte** d'interface. Les
textes changent ; le comportement, non.

## Portabilité

**Aucun chemin absolu dans `tests/` ni `outils/`.** Tout passe par le socle du
dossier. Un fichier qui cite un chemin en dur ne tourne que sur la machine où
il a été écrit — la CI le refuse (`check-harnais`).

**Un harnais n'écrit jamais à la racine du site.** Les captures vont dans
`tests/_sortie/`, ni versionné ni déployé. Quatre copies d'écran des espaces
client et livreur ont été servies **publiquement** sur le site pour cette
raison.

**Non exécuté n'est PAS vert.** Un harnais dont le prérequis manque doit sortir
en code 2 et être compté comme **ignoré**, jamais comme réussi.

**Un instrument de mesure ne surestime jamais.** Le lanceur comptait sa propre
ligne de bilan comme une assertion : +1 par harnais, un chiffre faux qui avait
l'air précis.
