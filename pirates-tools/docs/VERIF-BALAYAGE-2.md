# Vérification un par un — balayage n°2 (pages 135–201, parseur a0d6ec68)

*Registre gravé AU FIL de la lecture (ordre de l'user, 15/08/2026) : chaque
anomalie est décrite au moment où elle est vue, produit par produit, jamais
par lot. 542 entrées uniques : 172 appliquées · 135 refusées par la garde ·
234 hausses différées · 1 id refusé. Le plan d'action se construit au fur et
à mesure en bas, et n'est arrêté qu'à la fin des DEUX passes.*

## Constat d'ensemble mesuré avant lecture
- parseur déployé = version d'après mes correctifs (172 appliquées vs 14 au
  balayage n°1 ; 135 refus listés par `titreContreditFiche` ; 52 packs écartés).

## Anomalies, dans l'ordre de lecture (passe 1)
### Lignes 1–137 (les 172 APPLIQUÉES) — lues une à une

**✅ Le correctif central marche, prouvé par le cas de l'user** : ligne 29,
`dewalt-dcf850n` appliqué src 118,86 → new 191,84 — la hausse qui mourait en
mémoire est écrite. Idem 171 autres applications à titres propres.

**⛔ DÉFAUT 1 — les fiches NT et les réfs SANS suffixe échappent à la garde.**
`titreContreditFiche` ne vérifie batterie/Ah que si `referenceEstNue()` est
vrai. Or NT = coffret → `!ld.coffret` = false → garde SAUTÉE. Mesuré,
APPLIQUÉ à tort :
- l.27 `dcf620nt-xj` ← « (1x Powerstack Akku 5,0 Ah + TSTAK - ohne Ladegerät) » src 138,91
- l.43 `dch273nt-xj` ← « (1x5.0 Ah + TSTAK) » src 226,04
- l.72 `dcs356nt-xj` ← « (1x 5Ah + TSTAK + 35 pièces) » src 153,58
- l.82 `dcw210nt-xj` ← « (1 x 4,0 Ah in TSTAK) » src 142,37
- l.57 `dcl074-xj` (réf sans suffixe) ← « (1x 5Ah) » src 194,18
Correctif : la branche batterie doit s'appliquer si la fiche est nue OU NT
(coffret sans batterie), et pour les réfs sans suffixe lisible, au moindre
« (Nx …Ah) » du titre.

**⛔ DÉFAUT 2 — bundle à « + <réf produit> » non couvert.** Seul « & » est
refusé. l.42 `dch273n-xj` ← « DCH273N + D25303DH Aspiration des Poussières »
src 198,91 APPLIQUÉ : deux machines, prix du bundle sur la fiche du perfo.
Correctif : « + » suivi d'une RÉFÉRENCE produit (lettres+chiffres ≥ 5) = bundle.

**⛔ DÉFAUT 3 — code kit écrit DANS le titre (hors parenthèse finale) non lu.**
l.73 `dcs369n-xj` ← « DCS 369 E1 Scie Sabre … (DCS369N) » src 125,04 appliqué :
le « E1 » inline dit kit 1×1,7 Ah, seule la parenthèse finale est lue.

**⚠️ À précision moindre (notés, pas critiques)** : l.18 racine muette
« DCD796 - 18 V » appariée à la nue par `bySku[racineRef]` sans que l'annonce
énonce sa config ; l.66 tuile NT-Solo écrite sur fiche N (écart coffret).
### Lignes 138–272 (fin des appliquées + les 135 REFUSÉES) — lues une à une

**✅ La garde refuse juste sur ~125 cas** : kits « (1 x 5,0 Ah) », « + 1x
batterie — sans chargeur », bundles « & » du vendeur français, lots de 2/4/5,
« 10 x », réfs de kit en parenthèse (DCE555E2-SK, DCH273H2T-GB, DCFS950P2,
DCN650P1-SK, DCMHT520P1/P2-SK, DCMCS565P1-GB, DCLE34031D1GB) — chaque refus
relu contre son titre : exact.

**⛔ DÉFAUT 4 — dimensions lues comme multiplicateur (FAUX POSITIF).**
l.241 : « DCK368P3T Triple Kit, 18 V, Jaune, 27 x 32 x 15 » → refusé « lot de
15 ». « 27 x 32 x 15 » est un GABARIT en cm, pas un lot. Le motif `x N $` en
fin de titre est trop large. (Pas de perte ici — une autre tuile du même kit
est appliquée l.54 — mais le motif est faux.)

**⛔ DÉFAUT 5 — le refus « lot »/« pcs » ignore que la FICHE est un kit.**
l.240 : « 18V battery combo pack 3 pcs. (DCK330P2T-QW) » refusé « lot de 3 »
alors que la fiche EST le kit DCK330P2T : « 3 pcs » décrit le CONTENU du kit,
pas trois exemplaires. Idem l.265-269 : « + 29/36 pcs. accessoires » refusés
comme « lot de 29/36 » — bon refus (batterie incluse) mais MAUVAIS motif : le
set d'accessoires inclus n'est pas un lot d'exemplaires. Fragile : si la
branche lot se corrige (défaut 4) sans que la branche batterie couvre NT
(défaut 1), ces tuiles passeraient.

**⛔ DÉFAUT 6 — id de fiche mal formé au catalogue : `dewalt-dcmph566n-xj-xj`**
(l.247) — le suffixe -xj est DOUBLÉ dans l'identifiant. Anomalie d'import à
corriger côté catalogue (une clé publique ne se renomme pas en douce : à
signaler à l'user).
### Lignes 273–542 (fin des refusées + 234 hausses différées + 1 id refusé)

**✅ Confirmations** : DT50002-QZ enfin bloqué par la borne absolue (« prix
source hors fourchette (10000 €) ») ; le rejeu durable a TOURNÉ en production
(les hausses différées listées = les mêmes valeurs que les 172 appliquées) ;
« Quantité:4000 » d'un consommable n'est PAS pris pour un lot (borne ≤ 50
juste) ; d125/8 refusé pour « / » comme documenté.

**⛔ DÉFAUT 7 — « & » lexical refusé à tort (3 faux positifs).**
l.306/307 « Aspirateur Eau & Poussière(s) » et l.290 « Coffret embouts &
forets » : le « & » relie deux NOMS dans la désignation d'UN produit, pas deux
produits. Correctif : le « & » ne fait bundle que si le segment d'après porte
une référence produit ou un objet vendu séparément — ou liste d'exceptions
lexicales (eau & poussière, embouts & forets, pouch & belt).

**⛔ DÉFAUT 8 — bundle « + <accessoire tiers> » non refusé.**
l.433-439 `dcw210n-xj` : « Solo + 4x Toolbrothers TURTLE », « + 2x SPIDER » —
le min de rafale (97,02 / 143,90) vient de bundles avec abrasifs tiers. Ni
« & », ni Ah → tout passe. Sens dangereux ici : un bundle promo MOINS cher
tire le coût de la nue vers le bas ; l'inverse la gonfle.

**⛔ DÉFAUT 9 — « quantité N » / « Quantity N » non lu comme lot.**
l.521 « Sac à outils 26 poches quantité 4 » à 140,14 sur la fiche d'UN sac.
(l.303 « Quantity 5 » n'a été refusé que par le « & », mauvaise raison.)

## Passe 2 — relecture par FICHE + vérifications croisées mesurées
Mesures croisées (commande : lecture products.json) :
- `dewalt-dnf64` porte bien sku DNF23R64E → l'appariement l.287 était CORRECT
  (fausse alerte de ma passe 1, retirée).
- `dewalt-dcmph566n-xj-xj` : le SKU du catalogue est « DCMPH566N-XJ-XJ » — le
  doublon -XJ vit dans la fiche elle-même (import), pas dans l'appariement.
  Conséquence mesurable : le strip d'UN seul « -XJ » dans la garde laisse un
  sku illisible pour la grammaire → garde affaiblie sur cette fiche.
- `dcs369n-xj` 186,41 € et `dcs369nt-xj` 201,41 € au catalogue, mais les DEUX
  overrides portaient old = 186,49 : trace d'une pollution N↔NT antérieure à
  la garde ; le balayage remonte le NT à 210,54 — se répare seul.
- `dcf887nt-xj` : tuile plate « DCF887NT » à 95,30 appliquée (old 155,90,
  −39 %). AUCUN plancher de vraisemblance n'existe (D-015 a retiré le plafond
  de variation sur ordre de l'user) — un signalement INFORMATIF (jamais
  bloquant) est une OPTION à lui soumettre, pas un correctif à imposer.
- `dcfs950n-xj` : le site est à 907,19 € — l'anomalie « old 161,63 » du
  balayage n°1 s'est résorbée d'elle-même avec les tuiles réelles.

## Réflexion profonde — recoupement des 9 défauts en 3 familles

**F1 — le titre dit un contenu que la garde ne lit pas** (sens : prix de PLUS
sur fiche de MOINS, ou l'inverse) : D1 (NT et sans-suffixe hors branche
batterie), D2 (« + <réf produit> »), D3 (code kit E1/P2/S2T inline), D8
(« + <accessoire tiers> »), D9 (« quantité N »).
**F2 — la garde lit un contenu que le titre ne dit pas** (refus à tort =
relevés les moins chers perdus) : D4 (dimensions « 27 x 32 x 15 » lues
« lot de 15 »), D5 (« 3 pcs » du CONTENU d'un kit refusé sur la fiche du
kit), D7 (« & » lexical : Eau & Poussières, embouts & forets).
**F3 — données catalogue, hors parseur** : D6 (sku DCMPH566N-XJ-XJ doublé),
DT50002-QZ servi 12 311,51 € (borne absolue bloque désormais la source, le
prix servi reste à corriger via D-57), plancher de vraisemblance absent
(décision D-015 : à soumettre à l'user, jamais imposer).

## PLAN D'ACTION (arrêté après les deux passes, comme ordonné)

Chaque point = correctif + témoin RÉEL de ce zip dans `check-titre-fiche` +
sabotage prouvé rouge. Ordre : argent d'abord (F1), faux positifs ensuite
(F2), catalogue enfin (F3, décisions user).
1. D1 — la branche batterie s'applique si `nbBatteries === 0` (nue OU NT), et
   pour un sku sans suffixe lisible dès qu'un motif « (Nx …Ah) » apparaît.
   Témoins : DCF620NT (1x Powerstack Akku 5,0 Ah + TSTAK) · DCL074 (1x 5Ah).
2. D2+D8 — « + » suivi d'une référence [A-Z]{2,}\d{2,} OU de « Nx <marque
   tierce/accessoire> » = bundle. Témoins : DCH273N + D25303DH · DCW210N +
   2x Toolbrothers SPIDER.
3. D3 — code kit (E1|E2|M1|M2|P1|P2|H2|S2T|T2|D2) accolé à la racine du sku
   de la fiche dans le titre ⇒ kit. Témoin : « DCS 369 E1 … (DCS369N) ».
4. D9 — « quantit[éy]\s*:?\s*N » (2 ≤ N ≤ 50) = lot. Témoin : DWST540601.
5. D4 — un « x N » précédé d'un autre « M x » numérique (dimensions) n'est
   PAS un lot. Témoin : DCK368P3T « 27 x 32 x 15 ».
6. D5 — si la fiche est un KIT (suffixe à batteries > 0 ou DCK…), « N pcs »
   ≤ contenu plausible n'est pas un lot d'exemplaires. Témoin : DCK330P2T.
7. D7 — « & » entre noms communs sans réf ni objet vendu séparément n'est pas
   un bundle. Témoins : DXV23PTA Eau & Poussière · DT70777 embouts & forets.
8. D6 — signaler à l'user la fiche au sku doublé DCMPH566N-XJ-XJ (renommer =
   sa décision, clé publique).
9. OPTION à soumettre (D-015) : marquage informatif « variation forte » sur
   les baisses > 35 % (jamais bloquant). Cas : DCF887NT 155,90 → 95,30.

*Processus rejoué deux fois : passe 1 = 542 lignes une à une (sections
appliquées, refusées, différées, refus d'id) ; passe 2 = relecture par fiche
avec mesures croisées au catalogue. Méthode gravée ici même.*
