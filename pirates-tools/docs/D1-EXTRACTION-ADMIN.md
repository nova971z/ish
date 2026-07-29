# D1 — sortir l'administration d'`app.js` : analyse préalable

**29/07/2026.** Contrepartie de la décision **D-014** (plafond d'`app.js` relevé
à 400 Ko). Objectif : les visiteurs ne téléchargent plus le code
d'administration, dont **seul le propriétaire se sert**.

## Le gain, mesuré — pas estimé

```
app.js aujourd'hui   : 205,2 Ko compressés
app.js sans l'admin  : 181,8 Ko compressés
GAIN                 :  23,4 Ko  (11,4 %)
total servi à froid  : 369,9 → 346,5 Ko
```

⚠️ L'user navigue **en privé** : rien n'est mis en cache chez lui. Ces 23,4 Ko
sont repayés **à chaque visite**, par lui comme par chaque visiteur.

## Ce que l'analyse syntaxique a établi

Mesuré avec `esprima` sur l'arbre syntaxique — **pas** par expressions
régulières, qui avaient donné un premier découpage faux.

| | |
|---|---|
| Fonctions à déplacer | **48** |
| Variables d'état à déplacer | **6** |
| Poids brut déplacé | **130 Ko**, 54 plages |
| Liaisons de contexte à recréer | **45** |

**Deux valeurs seulement se lisent vivantes** : `products` et `_currentUser`.
Elles changent en cours de session — une copie prise au chargement du module
afficherait un catalogue vide ou un utilisateur déconnecté. Elles passent par
des accesseurs, `ctx.products()` et `ctx.user()`.

## ⛔ CE QUI BLOQUE — 7 variables mutables écrites des DEUX côtés

```
_adminStatsLoaded · _adminClientsLoaded · _adminPartnersList
_adminPartnerPhotos · _adminPartnerLogo · _adminGlobe · _regionNames
```

Elles sont **lues et écrites** par du code qui déménage **et** par du code qui
reste (notamment `destroyAdminGlobe`, gardée côté `app.js` parce que le routeur
l'appelle). Passées par valeur dans le contexte, une écriture du module
modifierait **sa propre copie** : `app.js` ne la verrait jamais.

**Conséquences concrètes d'un tel oubli** : un onglet d'administration qui reste
sur « Chargement… » parce que son drapeau de chargement paresseux n'est jamais
remis à zéro ; un globe 3D qui n'est pas libéré en quittant la page et qui
continue de consommer le processeur.

⚠️ **Ces pannes sont SILENCIEUSES.** Les dix harnais qui ouvrent l'administration
vérifient le rendu et l'absence d'erreur JavaScript — **ils ne verraient rien**.

## Pourquoi ce chantier est suspendu, et à quelle condition il reprend

Un filet qui ne couvre pas le mode de panne du chantier n'est pas un filet.

**Préalable obligatoire** : un harnais qui exerce les **états** de
l'administration, pas seulement son affichage —
1. ouvrir un onglet, le quitter, y revenir → il doit se recharger, pas rester figé ;
2. quitter la page d'administration → le globe doit être libéré ;
3. enchaîner deux onglets à chargement paresseux → aucun ne doit rester bloqué.

Et, comme tout contrôle ici, **prouvé faillible** : on remet un drapeau qui ne
se réinitialise pas, le harnais doit rougir.

**Ensuite seulement**, l'extraction, avec deux options pour les 7 variables :
- les faire déménager aussi, en déplaçant également ce qui les écrit côté
  `app.js` — c'est le plus propre ;
- ou les exposer par paires accesseur/mutateur dans le contexte — plus rapide,
  mais 14 liaisons de plus.

## Ce qui a été appris en chemin

- **Un analyseur écrit à la main est le mauvais outil.** Premier essai au
  comptage d'accolades : 24 fonctions mal délimitées, 17 plages débordant sur
  la suivante, `app.js` cassé. `esprima` était déjà installé dans le projet.
- **Les plages « d'une fonction jusqu'à la suivante » emportent tout ce qui
  traîne entre les deux** — commentaires, déclarations. L'arbre syntaxique donne
  les bornes réelles.
- **J'avais annoncé « du gain pur, sans risque ». C'était faux**, et l'analyse
  l'a montré : 45 liaisons dont 7 pièges. L'annoncer avant de mesurer était une
  faute de méthode.
