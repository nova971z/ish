# VÉRIFICATION COMPLÈTE DEWALT — chaîne entière, maillon par maillon (16/08/2026)

> Demande de l'user : « hier apparemment tu m'as dit que la marque dewalt était
> finie à 100 % donc déjà tu vas revérifier toujours en cherchant la petite
> bête […] tu revérifies toute la chaîne d'évènements complète, ligne après
> ligne, jamais par lot ».
>
> **Verdict : NON, DeWALT n'est pas fini.** Six constats, chacun mesuré. Et un
> défaut que j'ai cru trouver et qui n'en était pas un — dit aussi.

---

## Le matériel de la vérification

13 balayages DeWALT archivés (`zip2` → `zip14`), 871 réponses de page.
Le plus récent est **zip14**. Catalogue : **1 047 fiches DeWALT** sur 1 708.

---

## DW-1 — le dernier balayage DeWALT est à 99,34 %, pas à 100 %

```
zip14 (DeWALT) : tuiles 3958 | lues 3932 → 99,34 %  | 11 pages incomplètes, 26 tuiles
zip25 (Makita) : tuiles 4430 | lues 4430 → 100,00 % |  0 page incomplète
```

Le « 100 % » **existe** — mais il a été atteint sur le balayage **Makita**, avec
le parseur d'aujourd'hui. **DeWALT n'a jamais été rebalayé depuis.** Le chiffre
lui a été attribué par transfert, et c'est une faute de ma part.

⚠️ Un écart de comptage d'ancres subsiste sur les deux marques (12 sur 11 pages
pour DeWALT, 8 sur 8 pour Makita) : le compteur d'ancres rate parfois une tuile
que le parseur, lui, découpe. Il est **borné et rendu**, jamais masqué.

---

## DW-2 — DeWALT n'a JAMAIS reçu le rattrapage

Les 13 balayages DeWALT font **67 pages chacun : la grille, et rien d'autre.**
Les balayages Makates récents en font **134** (67 grille + 67 recherches).

La jointure du rattrapage (D-172) est partie en production le 16/08 à 11h22 ;
le dernier balayage DeWALT est antérieur. Donc **aucune fiche DeWALT n'a jamais
été cherchée par référence** — et la grille seule plafonne : mesuré le 10/08,
**69,2 %**.

⇒ Toute la chaîne construite les 15 et 16/08 (recherche par racine, drain daté,
mémoire du rattrapage) n'a **jamais tourné pour cette marque**.

---

## DW-3 — le dernier balayage DeWALT décrit un code qui n'existe plus

| empreinte du parseur | pages |
|---|---|
| `609bf288df34ab00-362649` | 23 |
| `779a09feb471dc00-364991` | 43 |
| **`4d399fb257390980-370117`** (dépôt aujourd'hui) | **0** |

Un déploiement a eu lieu **pendant** le balayage : deux versions dans un même
relevé. Et les deux sont périmées. Entre elles et aujourd'hui : la lecture de
toutes les références d'un pack (D-168), le registre des pertes, le recollage
des références éclatées, le comptage des doublons sur toutes les pages.

**Aucune conclusion tirée de zip14 ne vaut pour le code en service.**

---

## DW-4 — ⛔ LE PLUS LOURD : 59 fiches refusées en boucle, jamais servies

Sur les 13 balayages :

| | |
|---|---|
| fiches refusées au moins une fois | **131** |
| dont **jamais** appliquées, sur aucun balayage | **105** |
| dont refusées **5 fois ou plus** sans une seule application | **59** |

Les dix plus obstinées :

```
103 refus   dewalt-dcg426n-xj      228,97 €   titre annonce batterie/chargeur, fiche nue
 78 refus   dewalt-dcb182          470,26 €   bundle « & » : plusieurs produits
 65 refus   dewalt-dcs355nt-xj     268,51 €   titre annonce batterie/chargeur, fiche nue
 52 refus   dewalt-dcd996n         330,00 €   titre annonce batterie/chargeur, fiche nue
 48 refus   dewalt-dcd800nt-xj     272,14 €   batterie incluse (Nx …Ah), fiche sans batterie
 39 refus   dewalt-dcf887n         224,59 €   batterie incluse (Nx …Ah), fiche sans batterie
 39 refus   dewalt-dcd791n         188,58 €   titre annonce batterie/chargeur, fiche nue
 39 refus   dewalt-dce530n-xj      190,83 €   titre annonce batterie/chargeur, fiche nue
 39 refus   dewalt-dcg406n-xj      313,35 €   titre annonce batterie/chargeur, fiche nue
 36 refus   dewalt-dcf961nt-xj     471,35 €   titre annonce batterie/chargeur, fiche nue
```

⛔ **Ces refus sont JUSTES.** 168 des 169 refus du dernier balayage sont des
gardes qui font exactement leur travail : ne jamais écrire un prix de kit sur
une fiche nue, ni un prix de lot sur une fiche d'unité.

⛔ **Mais un refus juste et permanent est un trou.** Ces 59 fiches sont des
machines NUES dont le fournisseur ne vend, sur la grille, que des KITS. Leur
coût n'est donc jamais revalidé — leur prix repose sur ce qu'il y avait avant,
indéfiniment, **et rien ne le signale**. C'est **exactement la même classe de
défaut que la tondeuse Makita** : correct, silencieux, permanent.

⚠️ La sortie existe déjà et n'a jamais servi ici : **la recherche par
référence** (DW-2). Une machine nue introuvable sur la grille a toutes ses
chances sur une page famille — c'est ce qui a corrigé deux prix Makita au
dernier balayage.

---

## DW-5 — une fiche à 12 311,51 € refusée 13 fois de suite

```
dewalt-dt50002-qz  « DeWalt DT50002-QZ »  coût lu 10 000 €
                    refusé : prix source hors fourchette (MAX_TTC = 8 000 €)
                    présent à l'identique dans zip2 … zip14 — 13 balayages
```

Le refus est correct : 10 000 € dépasse la borne absolue, et cette borne est le
seul filet contre un parseur qui déraille (D-015 a retiré le plafond de
variation, à raison). Mais la fiche **continue de se vendre 12 311,51 €** sur
un coût que rien n'a jamais validé, et la situation est identique depuis 13
balayages. C'est une **décision de l'user**, pas une correction à faire en
douce : soit la borne monte pour cette famille, soit la fiche part.

---

## DW-6 — on ne peut pas savoir quelles fiches ont un coût frais

Les 871 réponses DeWALT sont **toutes en mode balayage** (`scan: true`), et ce
mode **omet la liste `unchanged`** — il n'en garde que le compte.

| rubrique | comptée | **nommée** |
|---|---|---|
| `applied` | ✅ | ✅ |
| `flagged` | ✅ | ✅ |
| `unchanged` | ✅ (1 209 au dernier balayage) | ⛔ **non** |

⇒ **301 fiches DeWALT identifiables sur 1 047 — et c'est un PLANCHER, pas une
couverture.** La question la plus importante qu'on puisse poser au traqueur —
*lesquelles de mes fiches ont un coût fournisseur frais ?* — est **sans réponse
possible** aujourd'hui.

C'est la même cécité qui a coûté une session entière sur la tondeuse : une
donnée qui existe, qu'on compte, et qu'on jette. La liste des seuls
identifiants pèserait ~18 lignes par page.

---

## Ce que j'ai cru trouver et qui n'en était pas un

J'ai mesuré `lues + doublons > tuiles` sur 24 pages du dernier balayage Makita
et conclu que l'instrument de complétude surestimait — donc que le « 100 % »
était gonflé. **Faux.** En allant au code (`api/admin.js:4608`), `doublons` est
**déjà additionné dans `luesBrutes`** avant le bornage : ma formule le comptait
une seconde fois. L'instrument borne (`pwBornerLues`) et rend l'écart séparément.

**L'instrument est sain.** L'hypothèse est morte, elle est déclarée morte, et
elle ne sera pas reprise.

---

## Récapitulatif — ce qu'il faudrait, dans l'ordre des priorités

| ordre | quoi | pourquoi maintenant |
|---|---|---|
| 1 | **nommer les `unchanged`** (identifiants seuls) | sans ça, aucune des questions ci-dessus n'est vérifiable, jamais |
| 2 | **un balayage DeWALT avec le rattrapage joint** | 59 fiches attendent une page famille depuis 13 balayages |
| 3 | **compter les refus chroniques et les NOMMER** | un refus juste et permanent doit crier, comme une racine `muette` |
| 4 | trancher `dt50002-qz` (12 311,51 €) | décision de l'user, jamais en douce |

⛔ Aucun de ces points n'est engagé dans ce document : l'user a fixé l'ordre —
DeWALT vérifié d'abord, Makita au message suivant.
