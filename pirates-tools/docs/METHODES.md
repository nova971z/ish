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

### M-34 — Une grammaire qui lit PARTIELLEMENT est plus dangereuse qu'une qui échoue

Un décodeur qui échoue rend `null`, et l'appelant le voit. Un décodeur qui lit
la moitié rend un objet **d'apparence complète** — et l'appelant conclut sur ce
qu'il n'a pas lu.

⇒ **Ce qu'une grammaire n'a pas su lire voyage AVEC son résultat**, jusqu'au
point de décision. Et un code non lu **interdit** de conclure « même contenu ».

*Panne payée le 11/08/2026, quelques minutes après avoir inscrit une nouvelle
grammaire dans l'audit des faux jumeaux* : deux écritures de la même machine,
l'une nue à 126 €, l'autre « appareil seul **+ DS150** » à 117 €, sortaient
**« même conditionnement »**. La grammaire disait pourtant `inconnus: ["D","S"]`
— je comparais les batteries et le coffret en jetant le reste du code.
Et le sens était le mauvais : le paquet **le plus complet** était le **moins
cher**. Retenir son coût sur la fiche de l'outil nu fait baisser le prix de
vente — c'est-à-dire **vendre à perte**. L'audit écrit pour trouver ce défaut
venait de le produire, pour la **troisième** fois.

*Porte* : `scripts/check-audit-multi-ecritures.js` (dans `ci.js`), sujet choisi
à l'exécution sur une forme, trois sabotages rouges.

---

### M-35 — Une porte qui mord sur MON code neuf a raison, et on ne l'apaise pas

Quand une porte existante devient rouge sur du code qu'on vient d'écrire, le
réflexe est de la trouver trop stricte. C'est presque toujours l'inverse.

*Cas du 11/08/2026* : `check-separation-marques` est devenue rouge sur
l'adaptateur de grammaire que je venais d'ajouter — « appelle une fonction de
marque sans que la marque soit vérifiée dans les parages ». J'aurais pu me dire
que la marque est vérifiée *en amont*, par la table qui choisit la grammaire.
Vrai aujourd'hui, faux dès que quelqu'un appelle l'adaptateur ailleurs.

⇒ **La garde se pose DANS la fonction, jamais dans l'intention de l'appelant.**
La marque est passée à l'appel **et** revérifiée chez soi — deux contrôles,
comme `refSansPrefixeDistributeur`. Sabotage à l'appui : garde retirée, porte
rouge.

---

### M-36 — Le prix JUSTE À LA FIN ne dit rien du prix SERVI PENDANT

Un balayage n'est pas atomique : entre sa première et sa dernière page, le site
sert des prix. Vérifier seulement l'état final, c'est ne rien vérifier de ce que
le client a vu.

*Panne payée, mesurée le 11/08/2026 sur son relevé réel* : sur une marque, en un
seul balayage, **onze fiches sur quinze** ont été affichées plus cher qu'elles ne
devaient pendant **13 à 44 pages** — jusqu'à **+312,59 €** sur l'une, **+203,64 €**
sur la lampe qu'il avait lui-même repérée. Surcoût cumulé pendant le balayage :
**1 465,85 €**. À la fin, chaque prix était juste.

⛔ **La cause n'est pas un bogue, c'est un ordre d'arrivée.** Le minimum de rafale
ne retient que ce qu'il a DÉJÀ vu : la première page qui touche une fiche écrit au
coût de cette page. Sur une grille non triée par prix, la même référence
réapparaît trente pages plus loin, deux fois moins chère.

⚠️ **Et le défaut était invisible sur l'autre marque** (0 € mesuré) : sa grille
est triée par prix, les tuiles d'un même article se suivent. **Une garde qui
dépend du tri d'un fournisseur n'est pas une garde** — elle marche par chance.

⇒ Pendant un balayage : une **baisse** s'écrit tout de suite (le minimum ne peut
que descendre, elle est déjà définitive) ; une **hausse** attend la fin de la
rafale. Elle n'est pas supprimée — D-015 exige qu'une vraie hausse fournisseur
passe — elle est **retenue, comptée et rendue**.

*Porte* : `scripts/check-price-watch.js`, cinq assertions dont **le témoin
inverse** (hors balayage, une hausse s'écrit immédiatement) sans lequel « ne
jamais écrire de hausse » resterait vert. Cinq sabotages rouges.

---

### M-37 — Une correction qui fait rougir une porte a révélé un défaut DE LA CORRECTION

Quand une porte existante devient rouge sur un correctif, la question n'est pas
« comment la calmer » mais « qu'a-t-elle vu que je n'ai pas vu ».

*Cas du 11/08/2026, dans la minute* : en retenant les hausses pendant un
balayage, j'ai fait tomber une assertion de 2026 — « une HAUSSE est comptée et
rendue : ne montrer que les baisses ferait d'un rapport un argumentaire ».
Elle avait raison : mon correctif venait de faire disparaître les hausses du
bilan. La nuance manquante tient en un mot — `flagged` = **refusé** (n'entre pas
au bilan), hausse différée = **en attente** (y entre). Le rapport est resté
honnête grâce à une assertion écrite avant le défaut qu'elle a attrapé.

---

### M-38 — Un état qu'on ne peut pas mesurer est un état qu'on finit par inventer

Quand une question sur le monde extérieur revient deux fois sans réponse, le
travail n'est plus d'y répondre : c'est de la **rendre mesurable**.

*Panne payée les 11 et 12/08/2026* : sur **quatre relevés successifs**, deux
faits contradictoires — le plan servi portait ma correction du jour, le parseur
servi ne la portait pas. Ma session ne voit ni le site ni l'API de l'hébergeur
(CONNECT 403, mesuré, définitif). J'ai passé **deux tours entiers** à débattre
d'un déploiement au lieu de le mesurer.

⇒ La réponse était dans les données depuis le début, sans que personne l'y ait
mise : le champ `haussesDifferees`, livré la veille, était **présent** dans deux
relevés et **absent** du troisième. Les trois traqueurs n'avaient donc pas tapé
la même version. Aucune contradiction — seulement un marqueur qu'on n'avait pas
posé exprès.

⇒ Depuis, chaque relevé porte `versionParseur`, une somme sur le **texte source**
des fichiers qui décident d'une référence. Pas un numéro à incrémenter à la main
(on l'oublie, et une version qui ment est pire que pas de version), pas la date
du fichier (l'empaquetage la réécrit) : le texte source est exactement ce qui
s'exécute.

*Porte* : `scripts/check-version-parseur.js` — présente dans les DEUX modes,
stable à code constant, et discriminante au caractère près. Trois sabotages
rouges.

---

### M-39 — Une garde qui n'a que le côté « refuse » laisse passer « refuse pour toujours »

Poser un refus, c'est écrire la moitié d'une règle. L'autre moitié — *et
ensuite, ça se débloque quand ?* — se teste séparément, ou elle n'existe pas.

*Panne payée le 12/08/2026, sur ma propre correction de la veille* : le commentaire
annonçait « une hausse attend la FIN de la rafale, **puis s'écrit** ». Le code se
contentait de `continue` : il la **jetait**. Mesuré sur ses trois relevés :
**33 hausses retenues, zéro écrite** — et sur l'une des marques la rafale s'était
pourtant terminée (67 pages sur 67). La même hausse aurait été détectée et jetée
à chaque balayage, indéfiniment : une vraie hausse fournisseur n'aurait **jamais**
pu passer.

⛔ Les trois assertions écrites la veille étaient **toutes vertes** pendant ce
défaut. Elles vérifiaient qu'on n'écrit pas ; aucune ne vérifiait qu'on finit par
écrire.

⛔⛔ **Et mon premier témoin de réparation était un faux vert** : il envoyait la
même fiche sur toutes les pages, donc sur la dernière la hausse s'écrivait par le
chemin normal — sans que la file de rejeu serve à rien. Les deux sabotages sont
passés sans le faire rougir. Le témoin juste ne montre la fiche **que sur la
première page** : seule la file peut encore l'écrire à la fin.

⇒ Un commentaire qui décrit un comportement que le code n'a pas est pire qu'un
commentaire absent : on le croit sans le vérifier.

---

### M-40 — Une file d'attente se range hors de ce qui la remet à zéro

Quand on retarde une décision, l'endroit où l'on range ce qui attend décide de
tout. Rangé dans un objet qui se réinitialise, ce qui attend disparaît — et le
retard devient une perte silencieuse.

*Panne payée le 12/08/2026, en deux temps, sur ma propre correction* :
① la file des hausses retenues vivait **dans la rafale**. Une rafale qui
n'aboutit pas — mesuré : 66 pages envoyées là où le plan en compte 67 — ne la
rejoue jamais ;
② et comme il enchaîne ses trois traqueurs à la suite, le balayage de la marque
**suivante** effaçait la file de la précédente, à tous les coups.
Les hausses étaient donc retenues, effacées, redétectées, réeffacées.
**Indéfiniment.** Coût mesuré le même jour, sur ses données : **neuf fiches
vendues à perte, −435,45 € par tour de vente**, parce que leur prix restait au
plus bas d'un balayage précédent pendant que le coût fournisseur remontait.

⇒ La file vit **hors** de la rafale, **indexée par marque** — et l'indexation
par marque n'est pas un rangement, c'est la garde : une file d'une marque
appliquée à une autre écrirait des prix croisés.

⚠️ **Et mon premier témoin ne traversait pas le chemin qu'il prétendait
tester** : il renvoyait 66 pages puis repartait à 1 **sans changer de marque**,
donc la rafale continuait et la file était rejouée par le chemin ordinaire. Le
sabotage passait, le harnais restait vert. Le témoin juste reproduit **sa
séquence réelle** : rafale avortée → autre marque → retour.

*Porte* : `scripts/check-price-watch.js`, deux sabotages rouges (file remise
dans la rafale ; file non indexée par marque).

---

### M-41 — Une règle d'argent posée sur UN format ne garde pas l'autre

Quand un même parseur sert plusieurs fournisseurs, une garde écrite pour l'un
laisse l'autre entièrement découvert — et personne ne le voit, parce que la
règle « existe ».

*Panne payée le 12/08/2026, capture de l'user à l'appui* : sur la même page, le
comparateur affichait « <réf> » à **213,44 €** et « <réf> (+ Jeu de clés
14 pièces) » à **351,98 €**. Le parseur rendait la MÊME référence sur les deux,
et le pack l'emportait quand il arrivait en premier : **138,54 € de coût
inventé** sur la machine seule.
La règle « un titre à “+” est un pack, il ne porte pas la référence d'un
composant » existait depuis le 02/08/2026 — **sur l'autre format seulement**.
Le parseur de celui-ci rendait `packs: []` **en dur**.

⚠️ **Et la moitié du travail est de ne PAS trop refuser** : mesuré sur ses trois
relevés, **548 tuiles sur 7 126** portent un « + », et la plupart sont
légitimes — une référence dont le suffixe dit déjà « 1 batterie 5 Ah » a le
droit d'être vendue avec son chargeur. On ne refuse donc que la combinaison
dangereuse : **référence NUE + titre qui ajoute**. Et « sans batterie +
chargeur » veut dire *ni l'un ni l'autre* : le refuser perdrait le prix le plus
bas.

*Porte* : `scripts/check-price-watch.js`, quatre assertions (pack refusé,
machine nue acceptée, référence conditionnée acceptée, « sans … + … » accepté),
trois sabotages rouges.

---

### M-42 — Un prix qu'on ne peut pas rattacher à son offre n'est pas vérifiable

Écrire un prix sans garder le **titre de l'offre qui l'a fourni**, c'est rendre
tout contrôle ultérieur impossible : on voit le montant, jamais d'où il vient.

*Mesuré le 12/08/2026* : deux tuiles portaient la même référence, l'une à
**77,46 €**, l'autre à **126 €**, sur deux pages différentes. Impossible de dire
laquelle est la vraie machine — les deux enregistrements portaient
`titre: undefined` et le nom de NOTRE fiche, jamais celui de la carte. Le défaut
du pack n'a pu être prouvé que **grâce à la capture d'écran de l'user**.
La règle existait déjà pour les listes du mode à sec ; elle manquait là où l'on
**écrit** vraiment.

⇒ Chaque prix écrit archive `titreCarte`. Sans ce champ, « pourquoi ce coût ? »
n'a pas de réponse, et on redemande une capture pour chaque doute.

---

### M-43 — Avant d'accuser le parseur, vérifier que la page est TRIÉE

Un écart de prix entre deux relevés ressemble toujours à un décalage
titre ↔ prix. Le test qui tranche coûte trois lignes : sur une page triée par
prix, la suite des prix rendus doit être **monotone**.

*Mesuré le 12/08/2026, et l'hypothèse est morte tout de suite* : **0 saut** sur
1 441 tuiles d'une marque et **0 saut** sur 2 334 d'une autre — leurs bandes
sont d'une régularité parfaite (99,99 → 102,42 €). Aucun décalage, nulle part.
La troisième marque montre 68,2 % de sauts **parce que sa grille n'est pas
triée par prix** — mesuré séparément, ses adresses ne portent pas de clé de
tri. Ce n'est donc pas un défaut, c'est un tri différent.

⇒ Deux prix différents pour une même référence ne prouvent pas un décalage :
le comparateur crée plusieurs CARTES pour un même outil. Sa propre capture le
montre — trois cartes, 113,48 €, 157,12 € et 173,17 €, pour la même scie.

---

### M-44 — Le banc PRODUIT PAR PRODUIT, sur le catalogue entier, contre le chemin réel

Passer chaque fiche du site au parseur — titre **et** description — comme si le
fournisseur en faisait une carte, puis comparer ce qu'il en comprend à ce que la
fiche dit. Pas un échantillon : **toutes**.

*Ordre de l'user, 12/08/2026* : « s'il y a 5 000 produits, tu revérifies les
5 000, c'est non négociable […] tu lis les descriptions, les titres, tu regardes
le prix et tu vérifies comment le parseur réagit par rapport à ça. »

**Ce que le premier passage a sorti, sur 1 708 fiches, en une exécution :**
· 95,7 % de références retrouvées, **19 fiches dont le TITRE porte une autre
  référence que le SKU** (leur prix partirait ailleurs), 53 sans référence
  lisible, 24 désaccords référence ↔ texte ;
· et surtout **trois faux positifs d'une règle que je venais d'écrire** — voir
  M-45. Aucune relecture ne les aurait trouvés.

⇒ Le banc passe par `parseIdealo`, le chemin qui **écrit les prix**, jamais par
la grammaire seule : une règle vérifiée hors de son chemin d'exécution est une
règle vérifiée nulle part (M-32, M-39, une troisième fois).

*Porte* : `scripts/banc-produits.js`, lecture seule, rejouable, `--csv`.

---

### M-45 — Comprendre un texte, ce n'est pas y chercher un signe

Une règle qui cherche un caractère attrape tout ce qui le contient. Comprendre,
c'est distinguer **ce que le signe introduit**.

*Panne payée le 12/08/2026, attrapée par le banc ci-dessus* : ma règle « un
titre à “+” annonce un pack » a écarté **trois machines explicitement nues**,
parce que leurs descriptifs disent « frein moteur **+ débrayage de sécurité** »,
« brushless **+ ADT** », « frein électronique **+ XPT** ». Ce sont des
**caractéristiques**, pas un contenu de boîte. Sur une vraie carte, leur prix
aurait été jeté.

⇒ Trois niveaux, dans cet ordre :
1. **ce que le vendeur écrit noir sur blanc prime** — « machine seule »,
   « outil nu », « sans batterie ni chargeur » ferment la question, et aucun
   « + » plus loin ne la rouvre ;
2. un « + » ne vaut ajout que devant un **objet livrable** (coffret, batterie,
   chargeur, jeu, lame, embout…), liste courte et tenue sur du mesuré ;
3. « avec &lt;objet&gt; » ne vaut que dans le **titre** — une description est un
   texte technique, souvent recopié d'une autre déclinaison : mesuré, l'une
   décrit une machine nue avec le descriptif de la version coffret.

⚠️ **Et le témoin de la règle 1 était un faux vert** : « (machine seule) +
débrayage » — mais « débrayage » n'étant pas un objet livrable, la fonction
répondait `false` par la règle 2. Le sabotage passait. Le témoin juste porte un
objet livrable (« + coffret ») : seule la déclaration peut alors l'empêcher.

*Porte* : six assertions dans `check-price-watch`, trois sabotages rouges.
Mesure de non-régression : sur ses 432 tuiles à référence nue, **une seule**
est écartée — un vrai pack à 597,22 €.

---

### M-46 — Une couverture gagnée sans sa garde est une régression d'argent

Apprendre au parseur à lire davantage augmente aussi ce qu'il peut lire **de
travers**. Chaque gain de lecture doit arriver avec la garde qui va avec, dans
le même geste.

*Panne payée le 13/08/2026, en relisant ses tuiles une par une* : une carte de
son relevé s'intitule « <réf>-XJ XR **Lot de 5 Batteries** Lithium-ION 5 Ah
18 V » et coûte **372,29 €**. Le serveur la laissait « sans référence » : aucun
dégât. **Mes propres corrections de lecture la rendent lisible** — et son prix
de lot partait alors sur la fiche d'**une** batterie.

⛔ **Recoupé sur le Web, deux sources indépendantes** : cette référence désigne
UNE batterie 18 V 5,0 Ah — 59,90 € au comparateur, 61,90 € et 63,39 € chez deux
revendeurs ; les conditionnements multiples se vendent par 2 ou par 3.
372,29 € ÷ 5 = 74,46 € l'unité. C'est bien un lot de cinq, et la fiche aurait
été affichée près de **cinq fois trop cher**.

⇒ Toute quantité multiple annoncée (« Lot de N », « Pack de N », « x N »)
interdit d'écrire le prix.

⚠️ **Et ce qu'on ne sait pas trancher, on ne l'écrit pas.** « Lot de 3 forets
étagés » a exactement la même forme, mais là la référence désigne le lot
lui-même : son prix est juste. Aucune règle de forme ne les sépare. Mesure du
choix, faite avant de le poser : 83 tuiles écartées sur trois relevés, dont
**deux seulement** atteignent une fiche — l'une évitée (×4,7), l'autre perdue
(87,97 €). On refuse d'ÉCRIRE, jamais de VOIR : la carte sort dans `packs`
avec son prix.

*Porte* : cinq assertions dans `check-price-watch`, deux sabotages rouges — un
par sens (garde absente, garde trop large).

---

### M-47 — Le relevé porte la version qui l'a produit : la question est close

*Posé le 12/08, vérifié le 13/08/2026* : les trois relevés portent
`versionParseur: d6325360418cfa00-339011`, **la même sur les trois**. En
recalculant cette somme sur chaque commit, elle désigne exactement celui qui a
servi les pages.

⇒ Deux tours entiers avaient été perdus à débattre de « le correctif est-il en
ligne ? » sans pouvoir trancher — la session ne voit ni le site ni l'API de
l'hébergeur. Une seule ligne dans la réponse a supprimé la question **pour
toujours**. Quand un doute revient deux fois, le travail n'est plus d'y
répondre : c'est de le rendre mesurable (M-38, appliqué et vérifié).

---

### M-48 — Le titre dit la vérité : on le CONVERTIT, on ne le jette pas

Une annonce marchande **engage le vendeur**. Si elle dit « lot de 5 batteries »,
il y a cinq batteries — sinon l'acheteur a un recours. Le titre n'est donc pas
une donnée douteuse à filtrer : c'est une **source de droit** dont on peut se
servir.

*Reprise de l'user, 13/08/2026, et il avait raison* : « s'il y a écrit lot de
cinq batteries, c'est qu'il y en a cinq […] le titre dit toujours la vérité.
S'il ne dit pas la vérité, j'aurais droit à un dédommagement auprès du
revendeur. » Sa capture du marchand le confirmait — « Nombre de batteries : 5
incluse(s) », « Unité de comptage : 5 unité ».

⛔ **Ma première correction jetait la carte.** Elle évitait bien l'erreur — le
prix de cinq batteries écrit comme coût d'une seule — mais elle jetait avec
elle une information juste et **avantageuse** : vérifié sur ses captures, les
quatre cartes de lot donnent **68,92 · 69,14 · 70,00 · 74,46 €** l'unité, alors
que la carte unitaire de son propre relevé est à **79,90 €**. Acheter par lot
lui revient moins cher — refuser le lot lui coûtait de l'argent.

⇒ N unités à P euros font **P/N** l'unité. Le pack porte désormais `quantite` et
`prixUnitaire`.

⚠️ **ET LA PREUVE EXIGÉE AVANT DE DIVISER.** Le prix unitaire n'entre dans le
calcul que si la référence a été vue **seule** dans la même rafale : c'est ce
qui établit qu'elle désigne une unité, pas un ensemble. Sans cette condition,
« Lot de 3 forets étagés » — dont la référence désigne le **jeu** de trois —
tomberait à 29,32 € au lieu de 87,97 € : une vente à perte. **Les deux titres
ont exactement la même forme** ; seule cette preuve les sépare.

*Porte* : quatre assertions dans `check-price-watch`, deux sabotages rouges
(prix unitaire non calculé ; preuve « vue seule » supprimée).

---

### M-49 — Diviser n'a de sens que si le produit EST l'article qu'on compte

Un prix se divise par une quantité **seulement** quand les N exemplaires sont
le produit lui-même. Sinon, ce n'est pas une division qu'il faut : c'est une
**soustraction**.

*Panne payée le 13/08/2026, et j'ai annoncé le chiffre faux avant de le
retirer* : j'ai divisé le prix par le nombre de batteries annoncées, pour tout
produit. Sur son relevé, une clé à chocs vendue **235 €** « (2 × 2,0 Ah +
chargeur + coffret) » ressortait à **117,50 €** — comme s'il y avait deux clés
à chocs. Il n'y en a qu'**une** : les deux batteries sont son contenu, pas des
exemplaires. J'avais annoncé « 51 références gagnantes, 9 078 € d'économie ».
**Entièrement faux.**

⇒ Trois rôles, et chacun sa formule :
· **lot de N articles** (le produit EST l'article) → prix ÷ N ;
· **lot de N + un accessoire** (chargeur inclus) → ni l'un ni l'autre : on
  reconstitue, sinon le chargeur se répartit sur chaque unité ;
· **machine livrée avec des batteries** → prix − N×batterie − chargeur, ce qui
  donne le coût de la machine nue.

⚠️ Le rôle se lit sur le **type du produit** (`car.type`), jamais sur la forme
de la référence.

⚠️ **Et un reste invraisemblable est un refus, pas un résultat** : si les
accessoires « valent » plus que le pack entier, soit un prix est faux, soit le
pack est en promotion. Dans les deux cas on ne sait pas — et un coût de machine
à trois euros ferait vendre à perte.

*Porte* : `scripts/check-reconstitution.js` (dans `ci.js`), quatre invariants
d'argent, trois sabotages rouges.

---

### M-50 — Un chiffre d'argent s'annonce APRÈS avoir vérifié ce qu'on a divisé

J'ai publié « 9 078 € d'économie » cinq minutes après avoir écrit le calcul, et
je l'ai retiré dix minutes plus tard. Le protocole demande la commande qui a
produit le chiffre — je l'avais. Il manquait l'autre moitié : **vérifier que
l'opération elle-même a un sens sur les cas qu'elle traite.**

⇒ Avant d'annoncer un gain, on regarde **trois lignes du détail à la main**. Ici,
lire « clé à chocs → 117,50 € » aurait suffi à tuer le chiffre avant qu'il ne
sorte.

⚠️ Un chiffre faux annoncé coûte plus qu'un chiffre absent : il oriente une
décision d'achat, et il faut ensuite le désavouer.

### M-51 — Un champ calculé n'engage que son auteur ; le titre engage le vendeur

Pour construire la table des pièces détachées, j'ai sélectionné les cartes par
le champ de type du parseur : `typ === 'chargeur'`. Résultat mesuré sur les
trois relevés du 13/08/2026 : **0 chargeur sur 5 300 tuiles**, alors que **970
tuiles écrivent « chargeur » dans leur titre**. Le parseur range en effet la
plupart des chargeurs en `typ:'batterie'` — sans conséquence pour lui, mais la
table sortait sans aucun chargeur, donc tout pack en contenant restait
non-reconstituable et l'économie se perdait en silence.

⇒ **Quand la question est « qu'est-ce que j'achète ? », on lit le TITRE.** Il
engage juridiquement le vendeur (M-48). Un champ calculé par un outil ne dit que
ce que cet outil a compris, et il n'a jamais promis d'être exhaustif.

⚠️ Corollaire : un champ calculé reste excellent en refus (« ceci est une
machine, donc pas une pièce »), jamais en sélection.

---

### M-52 — Une garde écrite dans une seule langue est ouverte dans les autres

Ma détection des négations ne parlait que français : « sans batterie ni
chargeur ». Le comparateur agrège des vendeurs de toute l'Europe. Sont donc
entrés dans la table des pièces, mesurés : un rabot « **without** Battery and
Charger » à 175,04 € rangé comme prix d'un CHARGEUR, et des machines « **ohne**
Akku » comme pièces vendues seules. Le titre parlait de la pièce **pour dire
qu'elle est absente** ; je l'ai lu comme une pièce vendue.

⇒ Toute garde qui lit du texte de marchand se pose dans **toutes les langues où
la source publie**, et le contrôle en cite une par langue. Même famille de
défaut : un multiplicateur qui n'attrape que « 3 x 1,7 Ah » et rate « 3x
batterie » — le compte porte tantôt sur un chiffre, tantôt sur le mot.

---

### M-53 — Un résultat invraisemblable accuse une ENTRÉE, pas le calcul

Le calculateur a déduit qu'une perceuse-visseuse sans charbon vendue 184,71 € en
pack valait **23,13 € nue**. L'arithmétique était juste. Ce qui était faux, c'est
une entrée : le seul chargeur d'outil vendu seul dans les trois relevés est un
chargeur rapide 6 A à **97,73 €** — recoupé sur le Web (deux sources), le
chargeur réellement livré dans ces packs vaut **29,90 à 37,58 €**. La
soustraction retirait le chargeur le plus cher du catalogue à des packs qui
embarquent le plus simple.

⇒ Devant un résultat qui ne peut pas exister, on ne rafistole pas le seuil : on
remonte à l'entrée la plus fragile. Ici, « une seule offre » n'est pas une
mesure — c'est un échantillon de taille 1, et il faut le dire quand on s'en sert.

⚠️ Et on va chercher un **oracle indépendant** : le même appareil vendu NU et
vendu EN PACK donne la valeur du lot d'accessoires **sans aucune modélisation**,
par simple soustraction entre deux prix relevés. Mesuré sur 24 paires : un pack
« 1 batterie + 1 chargeur » coûte **101,29 € de plus** que la machine nue
(médiane) — quand les mêmes pièces achetées séparément en coûteraient 161,58 €.

---

### M-54 — Zéro résultat n'est pas « il n'y a rien », c'est un préalable qui échoue

Le banc d'appariement nue/pack a rendu **zéro paire** en se croyant complet — il
appariait sur une racine qui rend « DCF787N » suffixe compris, si bien que la
machine nue et son pack n'avaient jamais la même clef. Deux fois le même jour :
la table de composants a d'abord rendu **0 marque**, donc 0 carte, en imprimant
quand même un tableau.

⇒ **Une condition sans laquelle le banc n'a rien mesuré est un PRÉALABLE, et un
préalable non rempli fait ÉCHOUER le banc** (code 2), jamais verdir à vide. Un
zéro imprimé au milieu d'un rapport se lit comme un fait ; un préalable rouge se
lit comme ce qu'il est.

### M-55 — Le sabotage CHOISI ne trouve que ce qu'on soupçonne ; il faut l'énumération

`outils/sabotage.mjs` sabote un endroit que je désigne. Je désigne ce que je
soupçonne ; je soupçonne ce à quoi j'ai pensé en écrivant la garde. **Les trous
sont, par construction, là où je ne regarde pas.**

⇒ `outils/sabotage-campagne.mjs` ne choisit rien : il retourne mécaniquement
CHAQUE décision du code — comparaison, seuil, conjonction, négation — une à la
fois, relance les portes, et classe le résultat en trois :

| issue | ce que ça veut dire |
|---|---|
| **TUÉE** | une porte rougit — la décision est protégée ✅ |
| **SURVIVANTE** | tout reste vert alors que le code a changé de sens ⛔ |
| **INERTE** | la substitution n'a rien changé — ni preuve ni trou |

Mesure du premier passage sur le calculateur de pack (13/08/2026) : **44 tuées,
68 survivantes — 39 %**. Après tri et ajout de témoins : **61 tuées, 46
survivantes — 57 %**, dont douze décisions d'argent nouvellement protégées.

⛔ **Une survivante n'est PAS forcément un défaut du produit** : c'est un défaut
du FILET. Le tri se fait une par une, et il y a trois verdicts honnêtes :
① la décision compte → on lui écrit un témoin ; ② elle est inatteignable (repli
défensif, quantificateur d'expression régulière, texte d'affichage) → on le dit ;
③ **elle ne décide rien** → on SUPPRIME la condition. Le troisième cas est le
plus instructif : une garde décorative se lit comme une garde.

⚠️ La campagne se protège elle-même, sinon elle ment : empreinte avant/après
(substitution sans effet ⇒ INERTE, jamais « survivante »), restauration
vérifiée avec arrêt net en cas d'échec, contrôle de référence exigé vert AVANT
de commencer, et « commande non lançable » distingué de « porte rouge ».

---

### M-56 — Une garde qui vit chez l'appelant n'est pas une garde

Deux fonctions de rapprochement du parseur — dont celle qui décide **quelle
fiche reçoit un prix**, la décision d'argent la plus lourde du projet —
indexaient toutes les fiches reçues **sans regarder leur marque**. Elles étaient
sûres tant que l'appelant ne leur passait que les fiches d'une marque. Mesuré :
l'appelant réel leur passe le catalogue ENTIER, trois marques confondues.

⇒ **Une fonction se protège elle-même, avec les arguments qu'elle reçoit.**
« L'appelant fait attention » n'est pas une garantie : ce n'est pas testable,
ça ne survit pas à un nouvel appelant, et rien ne le signale le jour où ça casse.

⚠️ Et on mesure l'exposition RÉELLE avant de dramatiser : ici zéro (aucune
référence portée par deux marques, zéro rapprochement hors-marque sur 1 117
cartes réelles). Le défaut était **latent**. On le corrige quand même — mais on
dit qu'il n'était pas en train de coûter, au lieu de laisser croire à un sauvetage.

---

### M-57 — Une porte qui lit un champ inexistant est verte pour toujours

L'invariant « le prix rendu est le prix de la carte » lisait `it.srcTTC` puis
`it.prix`. Le parseur rend le montant sous `price` ; les deux autres champs
n'existent pas. `Number(undefined)` vaut NaN, `isFinite(NaN)` est faux : la
comparaison ne s'exécutait **jamais**. Sabotage « +0,01 € sur chaque prix
rendu » ⇒ porte restée VERTE.

Même famille, le même jour : la porte passait `res.restants` aux fonctions de
rapprochement, un champ que `parseIdealo` ne rend pas. Elle leur donnait un
tableau vide et annonçait « 0 rapprochement, 0 défaut » — trois invariants
d'argent verts **sans avoir rien traversé**.

⇒ Deux parades, et il faut les deux :
① **un préalable de traversée** — un plancher de « combien de fois cet
invariant s'est-il seulement exécuté ? », qui fait ÉCHOUER la porte à zéro ;
② **le sabotage**, qui seul distingue une porte qui marche d'une porte qui se
tait. Une porte verte n'a jamais prouvé qu'elle regardait.

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
| M-34 | `audit/prix-multi-ecritures.js`, `scripts/check-audit-multi-ecritures.js` |
| M-35 | `scripts/check-separation-marques.js`, `audit/prix-multi-ecritures.js` (`adapterDewalt`) |
| M-36 | `api/admin.js` (`haussesDifferees`), `scripts/check-price-watch.js` |
| M-37 | `scripts/check-price-watch.js` (bilan des baisses) |
| M-38 | `api/_lib/price-parse.js` (`EMPREINTE_PARSEUR`), `scripts/check-version-parseur.js` |
| M-39 | `api/admin.js` (report des hausses), `scripts/check-price-watch.js` |
| M-40 | `api/admin.js` (`pwFileHausses`), `scripts/check-price-watch.js` |
| M-41 | `api/_lib/price-parse.js` (`titreAjouteDuContenu`, `referenceEstNue`) |
| M-42 | `api/admin.js` (`titreCarte`), `scripts/check-price-watch.js` |
| M-43 | `scripts/tableau-produits.js` |
| M-44 | `scripts/banc-produits.js` |
| M-45 | `api/_lib/price-parse.js` (`titreAjouteDuContenu`), `scripts/check-price-watch.js` |
| M-46 | `api/_lib/price-parse.js` (`titreAnnonceUneQuantiteMultiple`), `scripts/banc-tuiles.js` |
| M-47 | `api/_lib/price-parse.js` (`EMPREINTE_PARSEUR`), `scripts/check-version-parseur.js` |
| M-48 | `api/_lib/price-parse.js` (`quantite`, `prixUnitaire`), `api/admin.js` (`packsUnitaires`) |
| M-49 | `api/_lib/reconstitution.js`, `scripts/check-reconstitution.js` |
| M-50 | — règle de conduite, pas de code |
| M-51, M-52 | `scripts/banc-composants.js`, `scripts/check-composants.js` |
| M-53 | `scripts/banc-valeur-bundle.js` (oracle indépendant), `scripts/banc-reconstitution.js` |
| M-54 | préalables de `scripts/banc-composants.js` et `scripts/banc-valeur-bundle.js` |
| M-55 | `outils/sabotage-campagne.mjs`, témoins de `scripts/check-reconstitution.js` |
| M-56 | `api/_lib/price-parse.js` (gardes de marque des rapprochements), `scripts/check-price-watch.js` |
| M-57 | `scripts/check-parseur-releves.js` (invariants + planchers de traversée) |
