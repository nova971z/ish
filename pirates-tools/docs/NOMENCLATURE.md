# NOMENCLATURE — outillage, quincaillerie, EPI

> **À quoi ça sert.** Le traqueur reçoit des titres écrits par des
> fournisseurs, jamais par nous. Ce document dit comment ces titres nomment
> les choses, pour que le parseur reconnaisse un article **sans jamais
> deviner**. Il est la contrepartie lisible de `api/_lib/nomenclature.js` —
> le code fait foi, ce document l'explique.
>
> Écrit le **03/08/2026** à la demande de l'user : « une grosse recherche sur
> Internet de comment sont nommés les outillages, la quincaillerie et les
> équipements de protection […] un document massif et parfaitement rangé avec
> une chronologie en entonnoir pour que ton parseur ne se trompe pas. »

**Ce qu'il contient, compté sur la donnée elle-même :**

| | |
|---|---|
| Familles | **5** |
| Rayons | **39** |
| Types (noms canoniques) | **220** |
| Écritures reconnues | **725** |
| Mesures déclarées | **34** |
| Codes de norme EPI | **50** |

**Couverture sur le catalogue réel** — **1119 fiches typées sur 1226**.
Des 107 restantes, **106** portent un titre qui dit
littéralement « descriptif à compléter » : il n'y a rien à lire dedans. Reste
**1** fiche sans type — un titre sans aucun nom d'objet.

---

## 1. L'entonnoir — pourquoi il existe

```
niveau 1   FAMILLE    machine · consommable · energie · rangement · epi
niveau 2   RAYON      lame-circulaire · chaussure · foret · vetement …
niveau 3   TYPE       le nom canonique + toutes ses écritures réelles
niveau 4   MESURES    ce qu'on a le DROIT de chercher dans ce rayon
```

**Le niveau 4 est le cœur du dispositif.** Sans lui, un extracteur cherche
tout partout : il lit « 43 » dans « pointure 43 » et se demande si c'est un
voltage ; il voit « S3 » sur une chaussure et croit à une référence. Chaque
rayon déclare donc les **seules** mesures qui ont un sens chez lui, et tout le
reste est effacé en sortie.

> ⛔ **Une chaussure n'a pas de voltage.** Ce n'est plus une espérance, c'est
> une règle exécutée — et prouvée faillible par sabotage.

**Deux garde-fous, appris à leurs dépens :**

1. **Le type se choisit par la correspondance la plus LONGUE**, jamais par
   l'ordre de la liste. « Rainureuse à double disque Ø180 mm en coffret »
   contient trois termes de trois familles. Un ordre fixe se trompe forcément
   sur l'un des titres.
2. **Rayon inconnu ⇒ on n'efface rien.** Un trou de vocabulaire ne doit pas
   faire perdre des mesures justes ; il doit se voir, pas se punir.

---

## 2. Les rayons, et ce qu'on a le droit d'y chercher

| Rayon | Famille | Libellé | Types | Écritures | Mesures |
|---|---|---|---|---|---|
| `percage` | machine | Perçage et vissage | 11 | 28 | 15 |
| `vissage-choc` | machine | Vissage et boulonnage à chocs | 4 | 12 | 15 |
| `perforation` | machine | Perforation et démolition | 4 | 13 | 14 |
| `meulage` | machine | Meulage, tronçonnage, polissage | 11 | 30 | 14 |
| `sciage` | machine | Sciage | 11 | 31 | 15 |
| `bois` | machine | Travail du bois | 12 | 39 | 15 |
| `fixation` | machine | Clouage, agrafage, rivetage | 7 | 20 | 14 |
| `aspiration` | machine | Aspiration et soufflage | 3 | 12 | 14 |
| `jardin` | machine | Jardin et espaces verts | 13 | 28 | 16 |
| `chantier` | machine | Énergie et fluides de chantier | 13 | 37 | 15 |
| `mesure` | machine | Mesure, détection, éclairage | 9 | 29 | 14 |
| `confort` | machine | Confort de chantier | 7 | 18 | 14 |
| `combo` | machine | Lots de plusieurs machines | 1 | 8 | 13 |
| `lame-circulaire` | consommable | Lames de scie circulaire | 1 | 6 | 11 |
| `lame-alternative` | consommable | Lames de scie sabre, sauteuse, ruban | 5 | 13 | 12 |
| `lame-oscillante` | consommable | Lames pour outil multifonctions | 1 | 5 | 10 |
| `foret` | consommable | Forets, mèches, trépans | 8 | 28 | 11 |
| `fraise` | consommable | Fraises de défonceuse | 2 | 12 | 9 |
| `disque` | consommable | Disques de meuleuse | 7 | 20 | 12 |
| `abrasif` | consommable | Abrasifs de ponçage | 4 | 15 | 9 |
| `vissage-embout` | consommable | Embouts, douilles, clés | 6 | 24 | 11 |
| `burin` | consommable | Burins, pointes, pelles | 4 | 11 | 9 |
| `visserie` | consommable | Visserie, boulonnerie, fixations | 13 | 41 | 10 |
| `chaine` | consommable | Chaînes, guides, fils de coupe | 3 | 12 | 9 |
| `filtration` | consommable | Filtres, sacs, tuyaux | 3 | 11 | 9 |
| `accessoire` | consommable | Accessoires et pièces | 9 | 34 | 10 |
| `batterie` | energie | Batteries | 1 | 5 | 7 |
| `chargeur` | energie | Chargeurs et stations | 2 | 8 | 7 |
| `coffret` | rangement | Coffrets et valises | 2 | 17 | 7 |
| `mobilier` | rangement | Chariots, servantes, établis | 4 | 11 | 5 |
| `portage` | rangement | Sacs, ceintures, porte-outils | 2 | 9 | 4 |
| `chaussure` | epi | Chaussures et bottes de sécurité | 4 | 18 | 6 |
| `vetement` | epi | Vêtements de travail | 18 | 58 | 5 |
| `main` | epi | Protection des mains | 2 | 13 | 6 |
| `tete` | epi | Protection de la tête et du visage | 5 | 18 | 5 |
| `auditif` | epi | Protection auditive | 2 | 8 | 5 |
| `respiratoire` | epi | Protection respiratoire | 2 | 9 | 5 |
| `hauteur` | epi | Travail en hauteur | 3 | 11 | 7 |
| `genou` | epi | Protection des genoux | 1 | 3 | 5 |

---

## 3. Le dictionnaire des mesures

| Champ | Unité | Ce qu'il vaut |
|---|---|---|
| `voltage` | V | tension de l'outil, ≤ 60 V sur batterie |
| `voltageSecteur` | V | ≥ 100 V — le secteur, jamais l'outil |
| `ah` | Ah | capacité de la plus grosse batterie annoncée |
| `nbBatteries` | — | 0 si « outil nu » — une information, pas un vide |
| `watts` | W | puissance absorbée, machines filaires |
| `nbOutils` | — | machines d'un combo |
| `serie` | — | gamme batterie — commande la compatibilité |
| `brushless` | — | moteur sans charbon |
| `poidsKg` | kg |  |
| `bars` | bar | pression, nettoyeurs et compresseurs |
| `litres` | L | cuve, réservoir, contenance |
| `diametreMm` | mm | UNIQUEMENT si Ø explicite ou mot « diamètre » |
| `alesageMm` | mm | trou central — deux lames de même Ø ne se montent pas si l'alésage diffère |
| `dimensionsMm` | mm | cotes composées « 30x43 », « 6x57x93 » |
| `cotesMm` | mm | ⚠️ ambiguë — relevée, jamais interprétée. une cote nue : présente, de nature non dite |
| `longueurMm` | mm | longueur explicite ou exprimée en cm |
| `longueurM` | m | bobines de fil, rallonges, tuyaux |
| `pouces` | " | carré conducteur, filetage |
| `nbDents` | — | denture d'une lame |
| `denture` | — | géométrie : ATB, TCG, plate, négative |
| `grain` | — | FEPA : P40 grossier → P2500 finition |
| `nuance` | — | HSS-Co, BiM, carbure, diamant — double parfois le prix |
| `matiere` | — | matériau travaillé : bois, métal, béton… |
| `emmanchement` | — | SDS-plus, SDS-max, queue T, hexagonal… |
| `empreinte` | — | PZ, PH, TX, HEX, carré… |
| `formeDisque` | — | EN 12413 : type 27, 41, 42 |
| `nbPieces` | — | contenu d'un lot |
| `conditionnement` | — | coffret, lot, pack, boîte |
| `pourMachine` | — | machine de destination — JAMAIS l'article lui-même |
| `taille` | — | vêtement : S…5XL ou 38…64 |
| `pointure` | — | chaussure : 35 à 52 |
| `tailleGant` | — | gant : 6 à 12 |
| `normeEpi` | — | S1P, S3S, FFP2, EN 388… — vérifiée en ligne, jamais de mémoire |
| `couleur` | — |  |

---

## 4. Tous les types, rayon par rayon

*Le nombre entre parenthèses est le nombre d'écritures reconnues pour ce type.*

**`percage`** — Perçage et vissage  
· perceuse-visseuse *(3)* · perceuse à percussion *(3)* · perceuse d'angle *(2)* · perceuse à colonne *(2)* · perceuse *(2)* · visseuse à placo *(4)* · visseuse *(3)* · carotteuse *(3)* · taraudeuse *(1)* · malaxeur *(3)* · tarière *(2)*

**`vissage-choc`** — Vissage et boulonnage à chocs  
· visseuse à chocs *(4)* · clé à chocs *(4)* · boulonneuse *(2)* · cliquet *(2)*

**`perforation`** — Perforation et démolition  
· marteau perforateur *(4)* · marteau de démolition *(4)* · perforateur *(3)* · burineur *(2)*

**`meulage`** — Meulage, tronçonnage, polissage  
· meuleuse d'angle *(4)* · meuleuse droite *(2)* · meuleuse *(3)* · découpeuse *(4)* · polisseuse *(2)* · surfaceuse *(4)* · rainureuse *(3)* · grignoteuse *(2)* · cisaille *(2)* · lime à bande *(2)* · ébavureuse *(2)*

**`sciage`** — Sciage  
· scie circulaire *(3)* · scie plongeante *(2)* · scie sabre *(4)* · scie sauteuse *(2)* · scie à onglet *(4)* · scie sur table *(5)* · scie à ruban *(2)* · scie à matériaux *(4)* · scie à diamant *(2)* · scie égoïne *(2)* · scie *(1)*

**`bois`** — Travail du bois  
· défonceuse *(3)* · affleureuse *(3)* · raboteuse *(2)* · dégauchisseuse *(1)* · rabot *(2)* · ponceuse *(9)* · lamelleuse *(3)* · mortaiseuse *(2)* · plaqueuse de chants *(2)* · fraiseuse *(4)* · toupie *(2)* · outil multifonctions *(6)*

**`fixation`** — Clouage, agrafage, rivetage  
· cloueur de charpente *(2)* · cloueur de finition *(3)* · cloueur *(4)* · agrafeuse *(3)* · riveteuse *(2)* · pistolet à mastic *(4)* · cercleuse *(2)*

**`aspiration`** — Aspiration et soufflage  
· aspirateur *(5)* · souffleur *(3)* · système d'aspiration *(4)*

**`jardin`** — Jardin et espaces verts  
· tronçonneuse *(3)* · élagueuse sur perche *(3)* · élagueuse *(1)* · sécateur sur perche *(1)* · sécateur *(2)* · débroussailleuse *(2)* · coupe-bordure *(2)* · taille-haie *(3)* · tondeuse *(3)* · scarificateur *(2)* · motobineuse *(2)* · broyeur *(2)* · pulvérisateur *(2)*

**`chantier`** — Énergie et fluides de chantier  
· nettoyeur haute pression *(3)* · nettoyeur *(2)* · compresseur *(2)* · groupe électrogène *(3)* · poste à souder *(3)* · vibrateur *(3)* · pompe à graisse *(2)* · pompe *(4)* · gonfleur *(2)* · décapeur thermique *(3)* · treuil *(3)* · ventouse à vide *(3)* · station d'alimentation *(4)*

**`mesure`** — Mesure, détection, éclairage  
· niveau laser *(5)* · télémètre laser *(3)* · détecteur *(4)* · caméra d'inspection *(2)* · caméra thermique *(2)* · projecteur *(3)* · lampe *(4)* · niveau *(3)* · système sans fil *(3)*

**`confort`** — Confort de chantier  
· radio de chantier *(4)* · glacière *(3)* · ventilateur *(2)* · chauffage *(3)* · bouilloire *(1)* · four micro-ondes *(3)* · cafetière *(2)*

**`combo`** — Lots de plusieurs machines  
· pack d'outils *(8)*

**`lame-circulaire`** — Lames de scie circulaire  
· lame de scie circulaire *(6)*

**`lame-alternative`** — Lames de scie sabre, sauteuse, ruban  
· lame de scie sabre *(3)* · lame de scie sauteuse *(2)* · lame de scie à ruban *(2)* · scie-cloche *(4)* · lame de scie *(2)*

**`lame-oscillante`** — Lames pour outil multifonctions  
· lame pour outil multifonctions *(5)*

**`foret`** — Forets, mèches, trépans  
· foret multi-matériaux *(3)* · foret béton *(3)* · foret métal *(4)* · foret à bois *(6)* · foret étagé *(3)* · couronne diamantée *(3)* · taraud *(2)* · foret *(4)*

**`fraise`** — Fraises de défonceuse  
· fraise de défonceuse *(10)* · fraise *(2)*

**`disque`** — Disques de meuleuse  
· disque à tronçonner *(3)* · disque à ébarber *(3)* · disque à lamelles *(3)* · disque diamant *(2)* · plateau de surfaçage *(3)* · brosse métallique *(4)* · disque *(2)*

**`abrasif`** — Abrasifs de ponçage  
· disque abrasif *(4)* · bande abrasive *(2)* · feuille abrasive *(6)* · éponge abrasive *(3)*

**`vissage-embout`** — Embouts, douilles, clés  
· embout de vissage *(6)* · porte-embout *(3)* · douille à chocs *(3)* · douille *(3)* · clé mixte *(6)* · rallonge de douille *(3)*

**`burin`** — Burins, pointes, pelles  
· burin plat *(3)* · burin pointu *(3)* · burin *(2)* · pelle *(3)*

**`visserie`** — Visserie, boulonnerie, fixations  
· vis à bande *(3)* · vis autoperceuse *(3)* · vis à bois *(4)* · vis *(2)* · tirefond *(2)* · boulon *(3)* · écrou *(4)* · rondelle *(3)* · cheville *(7)* · clou *(4)* · agrafe *(1)* · rivet *(2)* · équerre *(3)*

**`chaine`** — Chaînes, guides, fils de coupe  
· chaîne de tronçonneuse *(3)* · guide-chaîne *(3)* · fil de débroussailleuse *(6)*

**`filtration`** — Filtres, sacs, tuyaux  
· filtre *(4)* · sac aspirateur *(4)* · tuyau d'aspiration *(3)*

**`accessoire`** — Accessoires et pièces  
· rail de guidage *(4)* · serre-joint *(4)* · trépied *(3)* · piètement *(3)* · adaptateur *(5)* · joint d'étanchéité *(3)* · charbon *(3)* · courroie *(3)* · accessoire *(6)*

**`batterie`** — Batteries  
· batterie *(5)*

**`chargeur`** — Chargeurs et stations  
· chargeur *(5)* · adaptateur secteur *(3)*

**`coffret`** — Coffrets et valises  
· coffret modulaire *(10)* · coffret *(7)*

**`mobilier`** — Chariots, servantes, établis  
· servante *(2)* · chariot *(3)* · établi *(3)* · armoire à outils *(3)*

**`portage`** — Sacs, ceintures, porte-outils  
· sac à outils *(4)* · ceinture porte-outils *(5)*

**`chaussure`** — Chaussures et bottes de sécurité  
· chaussure de sécurité *(7)* · botte de sécurité *(5)* · sur-chaussure *(3)* · semelle *(3)*

**`vetement`** — Vêtements de travail  
· pantalon de travail *(4)* · short de travail *(3)* · salopette *(4)* · combinaison *(3)* · veste de travail *(4)* · parka *(4)* · softshell *(3)* · polaire *(3)* · sweat *(4)* · polo *(2)* · t-shirt *(4)* · chemise *(2)* · gilet haute visibilité *(3)* · gilet *(3)* · veste de pluie *(4)* · tablier *(2)* · bonnet *(4)* · chaussette *(2)*

**`main`** — Protection des mains  
· gant de protection *(11)* · manchette *(2)*

**`tete`** — Protection de la tête et du visage  
· casque de chantier *(3)* · casquette anti-heurt *(2)* · lunettes de protection *(6)* · écran facial *(4)* · masque de soudeur *(3)*

**`auditif`** — Protection auditive  
· casque anti-bruit *(5)* · bouchon d'oreille *(3)*

**`respiratoire`** — Protection respiratoire  
· masque respiratoire *(7)* · cartouche respiratoire *(2)*

**`hauteur`** — Travail en hauteur  
· harnais antichute *(3)* · longe antichute *(5)* · ligne de vie *(3)*

**`genou`** — Protection des genoux  
· genouillère *(3)*


---

## 5. Références DeWALT — le suffixe dit ce qu'il y a dans la boîte

> ⛔⛔ **C'est la table qui rapporte le plus.** `DCD805N` et `DCD805P2` sont
> la **même machine** — l'une nue, l'autre avec deux batteries 5,0 Ah. Un
> comparateur n'écrit souvent **que** la référence. Sans cette lecture, les
> deux se ressemblent trait pour trait et le prix du lot s'écrit sur la
> machine nue : deux batteries perdues à chaque vente.

*Source : support.dewalt.com, croisée avec la règle déjà gravée par l'user le
02/08 (D-74), qu'elle confirme.*

| Suffixe | Batteries | Capacité | Coffret | Note |
|---|---|---|---|---|
| `N` | 0 | — | — | machine NUE, sans batterie ni chargeur |
| `NT` | 0 | — | TSTAK | machine nue livrée en coffret TSTAK |
| `C1` | 1 | 1.5 Ah | — |  |
| `C2` | 2 | 1.5 Ah | — |  |
| `D1` | 1 | 2 Ah | — |  |
| `D2` | 2 | 2 Ah | — |  |
| `E1` | 1 | 1.7 Ah | — |  |
| `E2` | 2 | 1.7 Ah | — |  |
| `L1` | 1 | 3 Ah | — |  |
| `L2` | 2 | 3 Ah | — |  |
| `M1` | 1 | 4 Ah | — |  |
| `M2` | 2 | 4 Ah | — |  |
| `P1` | 1 | 5 Ah | — |  |
| `P2` | 2 | 5 Ah | — |  |
| `H1` | 1 | 5 Ah | — |  |
| `H2` | 2 | 5 Ah | — |  |
| `T1` | 1 | 6 Ah | — |  |
| `T2` | 2 | 6 Ah | — |  |
| `X1` | 1 | 9 Ah | — |  |
| `X2` | 2 | 9 Ah | — |  |
| `Y1` | 1 | 12 Ah | — |  |
| `Y2` | 2 | 12 Ah | — |  |

**La lettre donne la capacité, le chiffre donne le nombre** — ils se lisent
séparément. `P3` existe (trois batteries de 5,0 Ah) : une table fermée à 1
et 2 lisait ce lot comme s'il n'en portait aucune.

**Un `T` final après le code batterie** signale le coffret TSTAK :
`DCK368P3T` = 3 × 5,0 Ah + TSTAK.

**Extensions régionales** — `-XJ` `-QW` `-QS` `-GB` `-LX` `-B1` `-QZ`.
Elles ne changent **rien** au contenu, seulement le marché visé. Deux annonces
qui ne diffèrent que par là sont le **même article** — et c'est ce qui permet
de les rapprocher sans risque.

---

## 6. Gammes et plateformes

*La gamme commande la compatibilité des batteries, donc le prix d'un lot : un
FlexVolt 54 V ne se compare pas à un 18 V XR, même si tout le reste concorde.*
*Source : dewalt.co.uk/systems.*

| Gamme | Marque | Tension | Note |
|---|---|---|---|
| `XR FLEXVOLT` | DEWALT | 54 V | bascule 18/54 V selon l'outil |
| `FLEXVOLT` | DEWALT | 54 V | 54 V, se rétrograde en 18 V |
| `POWERSTACK` | DEWALT | 18 V | cellules pochette : plus dense, plus légère |
| `POWERDETECT` | DEWALT | — | l'outil adapte sa puissance à la batterie |
| `ATOMIC` | DEWALT | 18 V | gamme compacte |
| `XTREME` | DEWALT | 12 V | sub-compact 12 V |
| `XR` | DEWALT | 18 V | plateforme 18 V la plus large |
| `LXT` | MAKITA | 18 V |  |
| `CXT` | MAKITA | 12 V |  |
| `XGT` | MAKITA | 40 V | 40 V Max, incompatible LXT |

---

## 7. Quincaillerie — ce qui fait le prix

### 7.1 Emmanchements

> ⛔ **SDS-plus et SDS-max ne sont PAS interchangeables** : queue Ø 10 mm à
> 2 rainures contre Ø 18 mm à 3 rainures. Deux forets de même diamètre et
> d'emmanchement différent sont deux articles, et leurs prix n'ont rien à voir.

*Source : hellertools.fr, bricozor.com.*

| Canonique | Écritures reconnues |
|---|---|
| `SDS-MAX` | sds-max · sds max |
| `SDS-PLUS` | sds-plus · sds plus · sds+ |
| `SDS-QUICK` | sds-quick · sds quick |
| `SDS` | sds |
| `HEX 1/4` | hexagonal 1/4 · hex 1/4 · six pans 1/4 |
| `HEXAGONAL` | hexagonal · six pans · 6 pans |
| `CYLINDRIQUE` | cylindrique · queue lisse · queue ronde |
| `QUEUE T` | queue t · emmanchement t · t-shank |
| `QUEUE U` | queue u · emmanchement u · u-shank |
| `STARLOCK` | starlock · starlock plus · starlock max |
| `E-CUT` | e-cut · ecut |
| `MOYEU DEPORTE` | moyeu déporté |
| `M14` | m14 |
| `M16` | m16 |

### 7.2 Nuances de coupe

*Elles pèsent plus lourd sur le prix que la marque : un foret HSS-Co coûte
couramment le double d'un HSS ordinaire, à diamètre identique.*

| Canonique | Écritures reconnues |
|---|---|
| `HSS-CO` | hss-co · hss co · hssco · cobalt |
| `HSS-G` | hss-g · hss g · hss rectifié |
| `HSS-TIN` | hss-tin · nitrure de titane · titane |
| `HSS` | hss · acier rapide |
| `HCS` | hcs · acier au carbone |
| `BIM` | bim · bi-métal · bi metal · bimétal |
| `CARBURE` | carbure · carbure de tungstène · tct · widia |
| `DIAMANT` | diamant · diamanté |
| `CERAMIQUE` | céramique |
| `ZIRCONIUM` | zirconium · zircone |
| `CORINDON` | corindon · oxyde d'aluminium |

### 7.3 Lames de scie circulaire — Ø, alésage, denture

Mot de l'user : « il y aura la taille, ou l'**alésage** des circulaires avec le
diamètre ». Deux lames de même Ø et d'alésage différent **ne se montent pas sur
la même machine**. Le nombre de dents et la géométrie font le reste du prix :
24 dents pour le débit rapide, 48–60 pour la finition. Angle **positif** pour
le bois, **négatif** pour l'aluminium et le mélaminé.
*Source : manomano.fr, blog.berner.eu.*

| Denture | Écritures reconnues |
|---|---|
| `ATB` | atb · denture alternée · biseau alterné · alternée |
| `HI-ATB` | hi-atb · atb renforcée |
| `TCG` | tcg · denture trapézoïdale · trapézoïdale |
| `FTG` | ftg · denture plate |
| `NEGATIVE` | angle négatif · négative |
| `POSITIVE` | angle positif · positive |

### 7.4 Disques de meuleuse — EN 12413

*Source : dépliant de sécurité FEPA (fepa-abrasives.org).*
Alésage standard des meuleuses d'angle : **22,23 mm**.

| Forme | Écritures reconnues |
|---|---|
| `TYPE 27` | type 27 · moyeu déporté · à ébarber |
| `TYPE 41` | type 41 · tronçonnage plat |
| `TYPE 42` | type 42 · tronçonnage à moyeu déporté |
| `TYPE 1` | type 1 · meule droite |

> ⚠️ Le marquage EN 12413 comporte **douze éléments obligatoires**, dont la
> vitesse maximale **et une date de péremption** : un disque abrasif se périme.
> Ce n'est pas un détail de vocabulaire, c'est une contrainte de stock.

### 7.5 Grains d'abrasif — FEPA 42-1:2006

| Plage | Usage |
|---|---|
| P12 – P40 | arrachement de matière, décapage |
| P50 – P120 | ponçage courant |
| P150 – P320 | lissage avant finition, mastics |
| P360 – P2500 | finition très fine, apprêts et vernis |

Disques à lamelles : 16–24 grossier · 30–60 moyen · 80–100 fin.
*Source : carross.eu, lecoinducarrossier.fr.*

### 7.6 Empreintes de vissage

*Pozidriv se décline PZ0 à PZ4, Torx TX10 à TX50, hexagonal HEX2 à HEX8.*
⚠️ **PH et PZ se ressemblent et ne sont pas interchangeables** — un embout PH
dans une vis PZ arrondit la tête. *Source : infos.wurth.fr, bricozor.com.*

| Canonique | Écritures reconnues |
|---|---|
| `PZ` | pozidriv · pz |
| `PH` | phillips · ph · cruciforme |
| `TXP` | torx plus · resistorx · tampertorx · torx security |
| `TX` | torx · tx · t-star · étoile |
| `HEX` | allen · hex |
| `SQ` | carré · robertson · square |
| `SL` | fente · plat · slotted |
| `TRI` | tri-wing · triangulaire |
| `SPL` | spline · cannelé · 12 pans |

### 7.7 Matières travaillées

Le plus **spécifique** gagne : « bois dur » avant « bois », sans quoi une lame
à bois dur serait confondue avec une lame à bois tendre — deux prix.

multi-matériaux · cloison sèche · bois avec clous · bois dur · bois tendre · bois · aggloméré · mélaminé · contreplaqué · stratifié · inox · acier · fonte · aluminium · cuivre · métal · tôle · béton armé · béton · pierre · brique · parpaing · carrelage · faïence · plexiglas · pvc · plastique · placo · plâtre · fibrociment

---

## 8. EPI et vêtement de travail

> ⛔ **Les codes de norme ont été VÉRIFIÉS EN LIGNE, pas cités de mémoire.**
> La révision **2022** d'EN ISO 20345 a ajouté **S6** et **S7** et les suffixes
> **S / L** (plaque anti-perforation testée à la pointe 3 mm ou 4,5 mm). De
> mémoire j'aurais rendu S1 à S3 et rien d'autre — donc faux.
>
> ⚠️ Ce tableau **désigne où vérifier**. Il n'est pas une source de droit.

*Sources : s24.fr · officina.shop · mer.fr · protection-des-mains.com ·
abisco.fr · modyf.fr · inrs.fr · js-fournitures.fr.*

| Code | Norme | Ce qu'il garantit |
|---|---|---|
| `SB` | EN ISO 20345 | exigences de base, embout résistant |
| `S1` | EN ISO 20345 | SB + arrière fermé, antistatique, absorption au talon |
| `S1P` | EN ISO 20345 | S1 + semelle anti-perforation |
| `S1PS` | EN ISO 20345:2022 | S1P, plaque textile, essai pointe 3 mm |
| `S1PL` | EN ISO 20345:2022 | S1P, plaque textile, essai pointe 4,5 mm |
| `S2` | EN ISO 20345 | S1 + résistance à l'eau de la tige |
| `S3` | EN ISO 20345 | S2 + anti-perforation + semelle à crampons |
| `S3S` | EN ISO 20345:2022 | S3, plaque textile, essai pointe 3 mm |
| `S3L` | EN ISO 20345:2022 | S3, plaque textile, essai pointe 4,5 mm |
| `S4` | EN ISO 20345 | bottes polymère, antistatique |
| `S5` | EN ISO 20345 | S4 + anti-perforation + crampons |
| `S6` | EN ISO 20345:2022 | NOUVEAU 2022 — S2 + étanchéité totale WR |
| `S7` | EN ISO 20345:2022 | NOUVEAU 2022 — S3 + étanchéité totale WR |
| `S7S` | EN ISO 20345:2022 | S7, essai pointe 3 mm |
| `S7L` | EN ISO 20345:2022 | S7, essai pointe 4,5 mm |
| `SRA` | EN ISO 20345 | antidérapant — carrelage + détergent |
| `SRB` | EN ISO 20345 | antidérapant — acier + glycérine |
| `SRC` | EN ISO 20345 | SRA + SRB |
| `WR` | EN ISO 20345 | chaussure entièrement étanche |
| `WRU` | EN ISO 20345 | tige résistante à l'eau |
| `HRO` | EN ISO 20345 | semelle résistante à la chaleur de contact |
| `HI` | EN ISO 20345 | isolation contre la chaleur |
| `CI` | EN ISO 20345 | isolation contre le froid |
| `ESD` | IEC 61340 | décharge électrostatique |
| `EN 388` | — | risques mécaniques — 4 chiffres : abrasion, coupure, déchirure, perforation ; puis une lettre A→F pour la coupure ISO 13997 |
| `EN ISO 21420` | — | exigences générales des gants (remplace EN 420) |
| `EN 374` | — | risques chimiques et micro-organismes |
| `EN 511` | — | protection contre le froid |
| `EN 407` | — | chaleur et feu |
| `EN 397` | — | casque de chantier — chute d'objets, essai 5 kg à 1 m |
| `EN 12492` | — | casque de travaux en hauteur — chocs multi-directionnels |
| `EN 812` | — | casquette anti-heurt — protection LIMITÉE, ce n'est PAS un casque |
| `EN 166` | — | protection individuelle de l'œil |
| `EN 169` | — | filtres pour le soudage |
| `EN 172` | — | filtres solaires à usage professionnel |
| `EN 352` | — | protecteurs auditifs : coquilles, bouchons, serre-tête |
| `FFP1` | EN 149 | filtre ≥ 80 % des aérosols de 0,6 µm |
| `FFP2` | EN 149 | filtre ≥ 94 % |
| `FFP3` | EN 149 | filtre ≥ 99 % |
| `EN 149` | — | demi-masques filtrants jetables |
| `EN ISO 20471` | — | signalisation haute visibilité, classes 1 à 3 |
| `EN 343` | — | protection contre la pluie |
| `EN 342` | — | ensembles contre le froid |
| `EN ISO 11612` | — | chaleur et flamme |
| `EN ISO 11611` | — | vêtements de soudage |
| `EN 361` | — | harnais d'antichute |
| `EN 355` | — | absorbeurs d'énergie |
| `EN 354` | — | longes |
| `EN 795` | — | dispositifs d'ancrage |
| `EN 14404` | — | protège-genoux pour le travail à genoux |

### Les trois échelles de taille, qui ne se mélangent jamais

| Échelle | Plage | Rayon |
|---|---|---|
| Pointure | 35 → 52 | `chaussure` |
| Taille de gant | 6 → 12 | `main` |
| Taille de vêtement | XXS → 5XL, ou 38 → 64 | `vetement` |

Le mot « taille » les annonce **toutes les trois**, et le nombre seul ne
tranche pas. **C'est le rayon qui décide** — l'entonnoir sert exactement à ça.
Mesuré avant correction : « Pantalon de travail taille 48 » sortait avec
`pointure: 48`, puis perdait tout au verrou.

---

## 9. Conditionnement et état de livraison

**Conditionnements** — coffret · lot · pack · jeu · set · assortiment · boîte · boite · paquet · blister · sachet · carton · seau · recharge

« Coffret **DE** 29 forets » : le mot désigne l'**emballage**, pas l'article.
Sans cette coupe, tout lot de consommables serait rangé en « rangement » — le
contenant volerait la place du contenu. Mesuré : **38 titres de la
Quincaillerie sur 69** commencent par cette forme.

**Machine nue** — outil nu · machine nue · machine seule · produit seul · solo · sans batterie · sans batterie ni chargeur · body only · bare tool

Chacune vaut `nbBatteries = 0`, et c'est une **information**, pas une absence
d'information. « Voltage inconnu » et « 0 V » ne se comparent pas de la même
façon ; les confondre apparierait n'importe quoi.

---

## 10. Comment ajouter du vocabulaire

1. Ouvrir `api/_lib/nomenclature.js`.
2. Trouver le **rayon** qui convient — ou en créer un, avec sa liste de
   mesures autorisées. Un rayon sans mesures déclarées ne filtre rien.
3. Ajouter `['rayon', 'nom canonique', ['écriture 1', 'écriture 2', …]]`.
   Le pluriel et les accents sont gérés : inutile d'écrire « elagueuse » à
   côté d'« élagueuse », ni « lames » à côté de « lame ».
4. Lancer la porte, **et prouver qu'elle mord** :

```bash
cd pirates-tools && node scripts/check-price-watch.js
node outils/sabotage.mjs --fichier api/_lib/nomenclature.js \
  --cherche "<la ligne ajoutée>" --remplace "" \
  --commande "node scripts/check-price-watch.js"
```

5. Mesurer la couverture sur le catalogue réel avant de dire que c'est fini.

> ⛔ Un rayon cité par un type mais absent de `RAYONS` **fait échouer le
> chargement du module**, exprès. Une nomenclature à moitié valide qui se
> charge quand même est pire qu'une porte morte : le parseur typerait dans le
> vide sans que rien ne le dise.

---

## 11. Ce que le parseur ne fera jamais

- **Inventer une référence.** Une réf éclatée par des espaces (« DXPW 003 E »)
  part dans `skuEclate`, qui sert à **rapprocher** deux annonces, jamais à
  écrire un prix. On ne sait pas si le vrai code s'arrête au 003 ou au E.
- **Nommer une cote qu'il n'a pas comprise.** « 125 mm » sans Ø va dans
  `cotesMm` : mesure présente, nature non dite. « Meuleuse 125 mm » est un
  diamètre de disque, « Lame Alligator 430 mm » une longueur — le titre ne
  tranche pas, et deviner nommerait faux une fois sur deux.
- **Confondre une norme et une référence.** « EN 388 » sur un gant sortait en
  sku `EN388` : deux gants se seraient comparés par un code qu'aucun
  fabricant n'écrit.
- **Prendre le contenant pour le contenu.** « Lames **POUR** multi-cutter »
  désigne des lames ; la machine de destination va dans `pourMachine`.
- **Rendre zéro pour un champ non trouvé.** Tout champ absent rend `null`.

---

*Le code fait foi : `api/_lib/nomenclature.js`. Ce document en est la lecture.
La porte qui les garde : `scripts/check-price-watch.js`.*
