# MÉTHODES — les techniques de travail, nommées

**Gravé le 10/08/2026**, sur ordre de l'user : « enregistre toutes les
techniques qu'on utilise, que ce soit pour l'ajout des produits, la création
des tables, la manière dont le parseur doit se comporter — absolument tout.
Tu dois aller graver quelque part, afin que tu puisses t'en servir à n'importe
quel moment, les nommer correctement. »

> ⛔ **CE DOCUMENT N'EST PAS UN COURS.** Chaque méthode porte un NOM, la panne
> qui l'a payée, et la façon de l'appliquer. Une méthode sans panne derrière
> elle est une opinion : elle n'entre pas ici.
>
> ⚠️ **Différence avec `.claude/rules/`** : les règles disent ce qui est
> INTERDIT dans un domaine (argent, build, harnais). Ce document dit COMMENT
> on s'y prend — les gestes, réutilisables d'une marque à l'autre, d'un
> fournisseur à l'autre, d'un chantier à l'autre.

---

## A. CONSTRUIRE UNE TABLE DE CONNAISSANCE

### M-01 — La table VOTÉE : on lit sa donnée, on ne juge pas à sa place

Quand il faut une correspondance (type d'outil → famille du site, référence →
rayon), on ne l'écrit pas au jugé : on **dépouille ses propres fiches** et on
retient ce qu'elles votent.

**Seuil obligatoire : au moins 3 fiches ET au moins 80 % d'accord.**

*Panne payée (10/08/2026)* : « nettoyeur haute pression » n'avait qu'**UNE**
fiche, rangée dans *Accessoires*. Sans seuil, ce classement isolé se
propageait à toute une gamme de machines. Un vote à une voix n'est pas un
vote, c'est une coïncidence.

*Porte* : la table est un fichier versionné (`data/*.json`) qui porte le
décompte des voix (`"accord": "18/20"`), pas seulement le résultat.

### M-02 — La SOURCE avant la valeur : pas de chiffre orphelin

Toute entrée d'une table de données porte **sa source et sa date**. Une clé
absente veut dire « on ne sait pas » — jamais « prends la valeur par défaut ».

*Panne évitée, chiffrée (10/08/2026)* : le calculateur de prix retombe sur
**2 kg** quand le poids manque. À coût fournisseur identique de 500 € TTC, il
rend **661,00 € à 2 kg** et **721,50 € à 10 kg**. Un poids par défaut sur une
machine lourde, c'est **60,50 € de marge perdue à chaque vente**.

```json
"DHR182": { "kg": 2.4, "source": "manuel Makita + cheefatt + hupshenghardware", "date": "2026-08-10" }
```

### M-03 — Une recherche par valeur : les recherches groupées MENTENT

Quand on va chercher des valeurs sur le Web, **une recherche par valeur**, et
on recoupe. Grouper plusieurs modèles dans une requête pour aller vite
fabrique des faux.

*Panne payée, mesurée le jour même (10/08/2026)* : une requête groupant cinq
modèles a rendu `DHR182` à **0,9 kg**. La recherche ciblée sur ce seul modèle
donne **2,4 kg** — presque trois fois plus. Une valeur fausse sur cinq.

### M-04 — Le RECOUPEMENT tue une source, et c'est son travail

Deux sources concordantes minimum. Le recoupement ne sert pas à « confirmer » :
il sert à **éliminer**.

*Panne évitée (10/08/2026)* : une première source annonçait « le suffixe `E`
de Makita = Extra, deux batteries ». Le recoupement l'a tuée — `RFE` vaut
2×3,0 Ah et c'est le `F` qui porte déjà les deux batteries ; le `E` est le
COFFRET. Une source seule l'aurait fait entrer dans le code.

### M-05 — La fourchette se lit vers le HAUT quand elle touche à l'argent

Une source qui rend « 1,6 – 2,0 kg » n'est pas inutilisable : on retient
**2,0**. Surestimer le poids fait payer plus de port, jamais moins.
Voir M-11 pour la règle générale.

---

## B. AJOUTER DES PRODUITS AU CATALOGUE

### M-06 — Le REFUS NOMMÉ : un générateur qui ne sait pas le DIT

Un générateur de fiches ne se replie jamais sur une valeur par défaut. Il
refuse, et il **nomme** ce qui manque — la racine, le type, le coût — pour
qu'on sache quoi aller chercher.

*Porte* : `scripts/generer-fiches-makita.js` sort un CSV « ce qui manque »
avant même d'écrire quoi que ce soit, et n'écrit rien sans `--ecrire`.

### M-07 — Le prix n'a qu'UN calculateur

On ne saisit **jamais** un prix de vente. On saisit le **coût fournisseur**,
et `api/_lib/pricing-model.js` (`recommend`) rend le prix — le même
calculateur que l'import, le traqueur et la page « Ajout de produits ».

*Motif* : une seconde formule diverge au premier correctif, et c'est le prix
montré au client qui ment. C'est la règle d'argent « une formule n'a qu'une
implémentation », appliquée à l'ajout de produits.

### M-08 — Le poids EXPÉDIÉ se compose, il ne se recopie pas

La table porte le poids de la **machine nue**. Un pack pèse plus : on ajoute
les batteries et le coffret, avec des masses sourcées, et **on ne minore
jamais**.

### M-09 — RESTAURER plutôt que FUSIONNER

Pour remettre des données retirées, on ne refabrique pas : on **restaure
l'état exact d'avant** et on le prouve identique octet à octet.

*Appliqué le 10/08/2026* : les 611 fiches Makita sont revenues par
`git show <commit>~1:products.json`, `cmp` muet. Aucune fiche recréée à la
main, donc **aucune occasion d'en dupliquer une**. Le doublon devient
impossible au lieu d'être « vérifié ».

*Préalable* : prouver d'abord que les deux moitiés reconstituent exactement le
tout (0 perdue, 0 apparue) et qu'aucune n'a bougé depuis.

### M-10 — TROIS vérifications, TROIS angles — jamais la même trois fois

Quand il demande « vérifie-toi trois fois », trois exécutions de la même
commande ne valent rien. Les trois angles :

1. **le FICHIER** — doublons de clés, comptes, intégrité ;
2. **les PORTES** — générateurs `--verifie`, CI, noyau, perf ;
3. **le CLIENT** — deux fiches sur une même URL ? une référence en double une
   fois normalisée ? une URL morte au sitemap ?

### M-11 — Le SENS DE L'ERREUR décide, quand la mesure ne tranche pas

Entre deux lectures possibles, on prend celle qui **ne peut pas faire vendre
à perte**. Surestimer un contenu ou un poids fait vendre trop cher ; le
sous-estimer fait vendre à perte.

*Appliqué* : `RF` vaut 1 batterie sur une fiche et 2 sur une autre, dix
sources à l'appui des deux — la marque se contredit. On retient **2**.
*Filet* : en aval, l'appariement compare ce que l'ANNONCE énonce, donc un
écart produit un **refus de rapprochement**, jamais un prix faux.

---

## C. COMMENT LE PARSEUR DOIT SE COMPORTER

### M-12 — La FORME d'abord, le contenu ensuite

Avant de décoder un identifiant, on classe sa **forme**. Beaucoup d'objets
n'ont rien à décoder : un consommable, une pièce détachée, une machine
filaire n'ont pas de conditionnement.

⛔ **« Rien à connaître » ≠ « inconnu ».** Les mélanger fait paraître le
problème deux fois plus gros qu'il n'est et envoie l'effort au mauvais
endroit.

*Panne payée (10/08/2026)* : je comptais « conditionnement inconnu » sur les
lames de scie, les fils de ligature et les raboteuses de 1988. Le défaut était
dans **ma mesure**, pas dans le parseur — et c'est l'user qui l'a vu.
*Porte* : `nomenclature.formeReferenceMakita()`, `audit/nomenclature-makita.js`.

### M-13 — Le CODE MUET : l'absence est parfois dans la donnée

Distinguer « la référence ne le dit pas » de « je ne sais pas le lire ».

*Preuve* : `DLX4057X1` contient 2 batteries de 3,0 Ah (sept revendeurs) alors
que `X1` ne porte **aucune** lettre de batterie. Le code est muet ; le titre,
lui, parle. Ce n'est pas une ignorance du parseur.

### M-14 — La COUPE avant la grammaire

Quand un décodeur échoue, soupçonner d'abord le **découpage**, pas la
grammaire. Inventer une règle pour un cas qu'on découpe mal, c'est empiler
une erreur sur une autre.

*Panne payée* : `ST113DSMJ` sortait « inconnu ». La grammaire savait lire
`SMJ` depuis le début — c'est la coupe qui était fausse : le `D` final
appartient au MODÈLE (`ST113D`), pas au code d'ensemble.
*Garde* : on ne déplace la lettre que si le reste devient décodable ; un essai
raté rend la coupe d'origine. On ne gagne donc jamais un décodage faux.

### M-15 — La CONSOMMATION TOTALE : un suffixe lu à moitié n'est pas lu

Si la grammaire ne consomme pas **tout** le suffixe, elle n'a pas compris —
elle se tait.

*Panne payée* : `RP2302FC07`, défonceuse **filaire** de 2 300 W, sortait
« 2 batteries de 3 Ah » sur la foi de son `F`, en abandonnant `C07` en route.

### M-16 — La GARDE DE CONTEXTE : la même lettre ne dit pas la même chose partout

Une lettre de batterie sur une machine **filaire** est une lettre de nom de
modèle. Le contexte (sans fil / filaire, gamme 18 V / 40 V) précède la lecture.

*Panne payée, chiffrée* : sept machines filaires — `HR2811FT`, `HR2670FT`,
`HR1841FJ`, `JR3051TK`, `VC4210MX`, `RP2302FC07`, `RP2303FC07` — étaient
créditées de deux batteries, donc d'un coût de kit.

### M-17 — L'ORACLE, c'est SA donnée — jamais le code testé

La justesse d'un parseur se mesure contre les **titres que l'user a écrits**,
pas contre une autre partie du même code.

*Règle héritée (`.claude/rules/argent.md`)* : un plafond de majoration a fait
vendre à perte pendant que toute la suite de tests était verte — l'oracle et
le testé étaient le même code.
*Appliqué* : `audit/nomenclature-makita.js` prend ses titres pour oracle et
compte **séparément** les sous-estimations, seules dangereuses.

### M-18 — L'URL vient de SON écran, et une loi de pagination veut TROIS points

On ne déduit jamais une adresse fournisseur par symétrie. Et le pas d'une
pagination ne se conclut pas de deux points.

*Panne payée (E-112)* : « 15 produits par page » déduit du pas de l'URL, alors
que la page en affiche 60.
*Bon exemple (10/08/2026)* : pour Milwaukee, l'user a donné les pages 1, 2, 3
et 67 — quatre points, le pas de 15 est **prouvé** au lieu d'être supposé.

---

## D. PROUVER QU'UN CONTRÔLE SERT À QUELQUE CHOSE

### M-19 — Le sabotage qui ne mord pas accuse DEUX choses

Un sabotage resté vert ne veut pas dire « c'est bon ». Il dit l'une de ces
deux choses, et il faut trancher laquelle :

1. **l'assertion manque** — le cas n'est couvert par aucune porte ;
2. **le code est INUTILE** — on peut le supprimer sans que rien ne bouge.

*Les deux sont arrivés le 10/08/2026.* Une seconde lecture du lot
d'accessoires était morte (déjà traitée en amont) : supprimée. Et une
assertion « machine filaire » tenait pour une autre raison que la garde
qu'elle prétendait tester : un cas la testant vraiment a été ajouté.

⛔ **Du code qu'aucun sabotage ne peut tuer est du code qui ment sur son
utilité.**

### M-20 — L'assertion VERTE POUR LA MAUVAISE RAISON

Avant de conclure qu'une porte protège, vérifier **par quel chemin** elle
passe. Une assertion peut tenir grâce à une règle voisine, et tomber en
silence le jour où la règle qu'elle vise disparaît.

*Cas* : `ZZR2811FT → null` restait vrai sans la garde « sans fil », parce que
la règle de consommation totale l'attrapait aussi. Le témoin réel est `FJ`,
qui se consomme entièrement et que **seule** cette garde arrête.

---

## E. RENDRE COMPTE

### M-21 — Le chiffre vient avec la commande qui l'a produit

Aucun nombre dans un compte rendu sans la commande, dans le **même message**.
Un chiffre estimé présenté comme mesuré est un mensonge.

### M-22 — Dire le COÛT RÉEL de ce qui reste

Quand un chantier se compte en centaines d'opérations, on le dit avec le
chiffre, tout de suite. « Ça avance » sans ordre de grandeur empêche l'user
d'arbitrer.

*Appliqué* : « 536 racines à peser, une recherche chacune » — pas « je
continue ».

---

## Où ces méthodes sont déjà branchées

| Méthode | Le code qui l'applique |
|---|---|
| M-01, M-02 | `data/poids-makita.json`, `data/types-makita-categorie.json` |
| M-06, M-07, M-08 | `scripts/generer-fiches-makita.js` |
| M-12, M-13 | `api/_lib/nomenclature.js` (`formeReferenceMakita`) |
| M-14, M-15, M-16 | `api/_lib/nomenclature.js` (`lireSuffixeMakita`, `decomposerSuffixeMakita`) |
| M-17 | `audit/nomenclature-makita.js` |
| M-18 | `api/_lib/traqueur-plans.js`, `docs/TRAQUEUR-URLS.md` |
| M-19, M-20 | `outils/sabotage.mjs`, `scripts/check-price-watch.js` |
