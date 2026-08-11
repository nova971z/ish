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

### M-23 — Le tarif d'un TRANSPORTEUR est une grille, pas un forfait

Un coût d'expédition dépend du poids. Le figer en forfait « pour les objets
lourds » sous-provisionne dès le premier kilo au-dessus du seuil.

*Panne payée (10/08/2026)* : tout article de plus de 10 kg provisionnait
**29 €** de port, quel que soit son poids — 11 kg comme 30 kg. Or le bateau de
La Poste (Colissimo Eco Outre-mer) coûte **39,24 € dès 10 kg**. Mesuré sur ses
9 fiches concernées : **606,15 € de provision manquante, 67,35 € par vente**.
⛔ Et **on n'interpole pas** entre deux points de grille : un poids qui ne
tombe pas sur un point confirmé prend le point confirmé **juste au-dessus**.
*Porte* : `scripts/check-pricing-model.js` (3 sabotages, 3 rouges) ·
`data/transport-outre-mer.json`.

### M-24 — Une porte qui verrouille un DÉFAUT empêche de le réparer

Une assertion qui recopie la valeur observée grave le comportement, bon ou
mauvais. Le jour où on corrige, c'est elle qui rougit.

*Panne payée le jour même* : `ok(lourd.transport < 40, 'port bateau < 40 €')`
décrivait le forfait de 29 €. Corriger le tarif faisait échouer la porte.
⇒ Une assertion vise un **INVARIANT** (« le port postal dépasse la quote-part
de groupage »), jamais un chiffre recopié.

### M-25 — Un refus doit REMONTER, jamais se diluer

Quand une fonction rend « je ne sais pas », l'appelant doit s'arrêter. Sinon
l'absence devient un zéro, et un zéro se calcule très bien.

*Panne payée à la minute où la règle du bateau est entrée* : `shipFor` rendait
`null` au-delà de 30 kg, `recommend` continuait — et sortait un prix calculé
avec **un port à 0 €**. Pire que le forfait qu'on venait de corriger. C'est sa
propre porte neuve qui l'a attrapé.

### M-26 — Le raccourci ne fabrique rien : il demande son PLAN

Un raccourci d'iPad ne doit contenir **aucune adresse fournisseur**. Il appelle
le point d'entrée `price-watch-plan`, qui lui rend la liste des pages, et il
boucle dessus. Changer de marque ne touche alors qu'**un seul mot, à deux
endroits** — le `brand=` des blocs 2 et 7.

*Panne payée (10/08/2026)* : je lui ai donné « quatre lignes à remplacer »
tirées d'une version périmée de la doc — gabarit d'URL, « Répéter 66 fois »,
« × 15 ». Sa capture d'écran a montré que son raccourci ne fait rien de tout
ça. ⛔ **Une recette se lit sur SON écran, jamais dans mon souvenir.**
*Porte* : `docs/TRAQUEUR-URLS.md`, section « L'anatomie du raccourci — les 9
blocs », avec le bloc 9 marqué **NON LU** parce qu'il est coupé sur sa capture.

### M-27 — L'ancre est la FORME, jamais la POSITION

Quand on va chercher une donnée dans un texte libre, on s'ancre sur ce qui est
**stable dans la donnée elle-même** — sa forme — et jamais sur l'endroit où on
l'a vue les premières fois.

*Panne évitée de justesse (10/08/2026)* : j'avais décrit les références d'une
marque comme étant « entre parenthèses » dans les titres. **L'user m'a repris :
« elles ne sont pas toujours dans des parenthèses ».** Mesuré sur ses 793
occurrences :

| Où le numéro se trouve | Combien | Part |
|---|---|---|
| entre parenthèses `(…)` | 393 | 49,6 % |
| après un tiret `- …` | 280 | 35,3 % |
| nu, en fin de titre | 74 | 9,3 % |
| ailleurs, parfois **avant** le nom du produit | 46 | 5,8 % |

S'ancrer sur les parenthèses aurait perdu **400 références sur 793 — la
moitié**. Ce qui est stable, c'est la forme : les **791** nombres à dix
chiffres du relevé commencent **tous** par `49`, sans une exception.

⚠️ Corollaire : une forme s'établit en comptant **toutes** les occurrences,
pas en regardant les trois premières. Trois exemples qui se ressemblent sont
une coïncidence — c'est M-01 appliqué à l'extraction.

### M-28 — Chaque MARQUE a sa table, et rien ne déborde

Une nomenclature appartient à **sa** marque. Le parseur reconnaît d'abord la
marque, **puis** ouvre la bonne table. Deux marques peuvent écrire pareil sans
vouloir dire la même chose.

*Pannes payées (10/08/2026)*, toutes le même jour :
- `roleCoffret('', 'DHP486RT')` rendait **coffret** — or ce suffixe désigne
  chez l'autre marque **une batterie de 5 Ah**, pas une boîte ;
- un audit découpait toutes les références avec la grammaire d'une seule
  marque : `DWMT73803` et `DWMT73801`, deux coffrets DIFFÉRENTS, tombaient sur
  la même racine. **Neuf faux jumeaux d'un coup**, dont un à 148,41 € ;
- la normalisation des préfixes de distributeur s'appliquait à toutes les
  marques. Aucune fiche d'une autre marque n'était touchée ce jour-là — **par
  chance, pas par construction**.

⛔ **Le sens de l'erreur est ici INVERSÉ** : rapprocher deux références fait
BAISSER le coût retenu, donc le prix. Un mauvais rapprochement fait vendre à
**perte**, là où d'habitude l'erreur fait vendre trop cher.

**Deux règles opposables :**
1. **Le nom porte la marque.** Toute table ou fonction propre à une marque
   s'appelle `…Makita`, `…Dewalt`, `…Milwaukee`. Un nom neutre sur une règle de
   marque rend la porte aveugle.
2. **La marque est un PARAMÈTRE, pas un contexte.** Elle est passée, et
   revérifiée chez l'appelée — jamais supposée par l'endroit du code.

*Porte* : `scripts/check-separation-marques.js`, dans `ci.js`.

### M-29 — Un détecteur qui cherche un MOT détecte du vocabulaire

Une porte doit chercher un **comportement**, pas un terme.

*Panne payée deux fois de suite, le même jour, sur la porte ci-dessus* :
① elle cherchait le mot « marque » dans les huit lignes précédentes — mais
chaque garde est précédée d'un **commentaire** qui l'explique et contient le
mot. J'ai retiré une vraie garde : **la porte est restée verte**, satisfaite
par la prose décrivant la garde disparue.
② commentaires retirés, le mot survivait dans la **signature**
(`function f(titre, sku, marque)`). Un paramètre nommé `marque` ne prouve pas
qu'on s'en sert. **Verte une seconde fois.**

⇒ Elle exige désormais une vraie comparaison — `===`, `!==`, `.test(…)`,
`indexOf` — ou que la marque soit passée à l'appel. Et c'est le **sabotage**
qui a démasqué les deux, pas la relecture.

---

### M-30 — Un alias de référence est une affirmation d'ARGENT, pas de catalogue

Déclarer qu'une écriture B désigne la même fiche que A, c'est déclarer que **le
coût d'achat de B vaut pour A**. Un alias ne se pose donc jamais « parce que ça
se ressemble » : la **grammaire de la marque** doit dire que les deux écritures
énoncent **le même contenu de boîte** — mêmes batteries, même capacité, même
coffret, mêmes accessoires.

*Panne payée, mesurée le 10/08/2026 sur son relevé réel* : la fiche de la
ponceuse à bande **nue** déclarait en alias la même machine **en coffret**. Le
parseur, lui, lisait parfaitement les deux (`Z` = machine seule, `ZJ` = machine
seule **en coffret MAKPAC**) — c'est la donnée du catalogue qui mentait. Le
traqueur a écrit le coût du coffret sur la fiche nue : **361,49 € au lieu de
288,40 €**, 73,09 € trop cher.

⚠️ **Et le sens qui fait mal est l'autre.** Ce jour-là l'alias a rendu la fiche
trop chère — ça ne coûte qu'une vente. Mais le minimum de rafale retient le coût
**le plus bas** : le jour où c'est le coffret qui est en promo, la fiche du
coffret hérite du prix de l'outil nu, et là on **vend à perte**.

*Porte* : `scripts/check-alias-nomenclature.js` (dans `ci.js`), prouvée faillible
sur **deux dimensions** — le coffret et la capacité des batteries. Angle mort
dit : une marque sans grammaire déclarée n'est pas vérifiée.

---

### M-31 — Deux compteurs justes peuvent décrire le même incident sous deux étiquettes opposées

Un diagnostic déduit une cause **parmi celles de son catalogue**. Si le cas réel
n'y figure pas, il n'échoue pas : il rend la cause la plus proche, **avec
assurance**. C'est le mode de panne le plus coûteux d'un instrument.

*Panne payée, 10/08/2026* : le relevé rendait `pagesDistinctes: 67`,
`pagesEnDouble: 45` **et** `pagesManquantes: 45`. Les deux derniers chiffres
décrivaient les **mêmes 45 pages** — arrivées et identiques d'un côté, absentes
de l'autre. Le diagnostic, qui ne connaissait pas ce cas, a estimé une cadence,
comparé deux dates et conclu **`jamais-arrivees` : « le remède est côté
réseau »**. Faux deux fois : les pages étaient arrivées, et le réseau allait
bien. La vraie cause : *le plan demandait 45 pages de plus que le site n'en
sert* — au-delà du dernier rang, le fournisseur ressert sa **page 1**, avec ses
60 tuiles pleines, sans rien signaler.

⇒ **Ce qui est MESURÉ passe avant ce qui est DÉDUIT.** Le doublon est un fait
constaté : il tranche avant toute estimation, exactement comme la page vide.
⇒ **Une explication partielle se dit partielle** : 4 doublons pour 10
manquantes rend `doublons-partiels` et compte les 6 restantes, jamais une cause
qui aurait l'air complète.
⇒ **Un chiffre juste que personne ne sait lire ne sert à rien.** `pagesEnDouble:
45` était déjà rendu depuis des jours — il fallait le lire comme « ton plan est
trop long de 45 pages », et rien ne le disait. Un compteur porte donc sa
**conduite à tenir**, pas seulement sa valeur.

*Porte* : `api/_lib/diag-rafale.js` (causes `plan-trop-long` et
`doublons-partiels`), quatre assertions dans `scripts/check-price-watch.js`
dont une sur le **câblage** — les trois autres resteraient vertes si
`api/admin.js` cessait de passer le compteur.

---

### M-32 — Une table écrite, exportée et testée peut n'être BRANCHÉE nulle part

Écrire la nomenclature d'une marque ne la met pas en service. Le contrôle qui
vérifie qu'une fonction **existe** ne vérifie pas qu'on l'**appelle** : les deux
choses n'ont rien à voir, et seule la seconde protège quoi que ce soit.

*Panne payée, mesurée le 11/08/2026* : `lireReferenceMilwaukee` était écrite,
exportée, et couverte par **dix assertions vertes** — position du numéro dans le
titre, nom de gamme refusé, mot de liaison refusé, suffixe détaché rattrapé,
compatibilité écartée. Aucune ligne de production ne l'appelait. La marque était
**intégralement invisible** au traqueur, et rien ne le disait.
Sur son relevé à sec (67 pages, 4 019 tuiles) : **1 442 tuiles dont le titre
porte un numéro d'article parfaitement lisible** ressortaient « sans référence ».

⛔ **La cause dans le code n'était pas une omission, c'était une règle d'une
autre marque appliquée à tout le monde** : *« une référence commence par des
lettres, sans exception »* — vraie, mesurée sur les 1 105 fiches d'une marque, et
posée dans une fonction PARTAGÉE. Or les numéros d'article de cette marque-ci
sont **entièrement numériques**. Une règle de marque qui déborde ne fabrique pas
seulement de faux rapprochements : elle **efface une marque entière**.

⚠️ Et `check-separation-marques` ne pouvait pas la voir : elle cherche les
fonctions dont le NOM porte une marque, et cette règle-là vivait en ligne, sans
nom, dans une fonction neutre. C'est l'angle mort que cette porte déclare.

⇒ **Un contrôle de nomenclature teste le CHEMIN RÉEL du parseur**, pas la table
isolée — et il vérifie aussi que la règle **ne déborde pas** sur une autre
marque. Gain mesuré sur son relevé : **+1 080 tuiles lues, +993 références
distinctes** (44,5 % → 71,8 % des tuiles lues).

*Porte* : `scripts/check-price-watch.js` — quatre assertions sur le chemin réel
(branchement, non-débordement, nombre quelconque refusé), prouvées faillibles.

---

### M-33 — Un témoin qui peut réussir pour une autre raison ne témoigne de rien

Avant de conclure qu'une porte mord, vérifier que l'assertion échouerait
**par la cause visée** et pas par une autre.

*Panne payée le 11/08/2026, dans la même heure* : pour prouver qu'un nombre
quelconque ne devient pas une référence, j'avais pris le titre
« … 9000 tr/min 1200 W ». Il porte **deux** nombres — donc deux candidats, donc
refus par **ambiguïté**. L'assertion était verte sans que la table ait rien
tranché : le sabotage « accepte n'importe quel nombre » l'a laissée **verte**.
Un seul nombre dans le titre, et le sabotage devient rouge.

⇒ Un témoin s'écrit avec **une seule** cause possible de succès. Et c'est le
sabotage qui le dit — pas la relecture.

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
| M-19, M-20, M-24, M-25 | `outils/sabotage.mjs`, `scripts/check-pricing-model.js` |
| M-23 | `data/transport-outre-mer.json`, `api/_lib/pricing-model.js` |
| M-26, M-27 | `docs/TRAQUEUR-URLS.md`, `api/_lib/traqueur-plans.js` |
| M-28, M-29 | `scripts/check-separation-marques.js`, `api/_lib/price-parse.js` |
| M-30 | `scripts/check-alias-nomenclature.js`, `products.json` (`srcAltSkus`) |
| M-31 | `api/_lib/diag-rafale.js`, `scripts/check-price-watch.js`, `api/_lib/traqueur-plans.js` |
| M-32 | `api/_lib/price-parse.js` (`candidatsAvecPosition`), `api/_lib/nomenclature.js` (`lireReferenceMilwaukee`) |
| M-33 | `scripts/check-price-watch.js`, `outils/sabotage.mjs` |
