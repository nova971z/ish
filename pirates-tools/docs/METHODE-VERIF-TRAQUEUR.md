# Méthode d'entraînement du traqueur — gravée, améliorée à chaque tour

*Créée avec l'user le 15/08/2026. À CHAQUE zip reçu, ce processus se rejoue
et S'AMÉLIORE : toute erreur de la méthode elle-même se grave ici.*

## Le processus (version 3)

1. **Extraire** le zip, relever `versionParseur` (prouve quel code a tourné)
   et les cumuls de `counts` — les comparer au balayage précédent.
2. **Sens zip→site** : chaque entrée appariée (applied/flagged/hausses) se lit
   UNE PAR UNE, titre complet contre nature de la fiche. Jamais par lot.
3. **Sens site→zip** (ajouté au tour 4, ordre de l'user) : pour chaque fiche
   NUE du site, rassembler TOUTES ses tuiles du zip (unknown et sansRef
   compris — c'est là que se cachent les tuiles que le parseur n'a pas su
   lire), déterminer soi-même la nue la moins chère, la confronter au prix
   vendu, et vérifier que le parseur a fait pareil au millimètre.
4. **Graver AU FIL de la lecture** dans docs/VERIF-BALAYAGE-2.md — jamais à
   la fin. Chaque défaut : ligne, titre exact, prix, famille.
5. **Recouper** les défauts en familles, corriger, TÉMOIN RÉEL par correctif
   dans check-titre-fiche, sabotage prouvé rouge, CI, pousser.
6. **Améliorer la méthode** : les erreurs de la méthode se gravent ci-dessous.

## Erreurs de la méthode, corrigées en route

- **Tour 4** : le croisement par racine colle les CONSOMMABLES « pour » un
  outil (clous pour DCN692, lame pour DCS397) sur la fiche de l'OUTIL → faux
  ratios ×5-11. Règle ajoutée : écarter les titres « pour/for <réf> »,
  « Lame … pour », « Clous … pour cloueur » avant de calculer le min.
- **Tour 4** : `unchanged` n'est pas détaillé dans les réponses de balayage —
  le coût retenu des fiches stables ne se lit pas dans le zip, seulement
  déduit du prix site.

## Verdicts du tour 4 (zip 68–134, parseur 137f8a80) — lus un par un

124 fiches nues croisées site→zip. Le top des écarts, chacun élucidé :
- dcn692n ×11,4 · dcn930n ×5,3 · dcs397n ×5,1 · dcn660n ×5,0 : la « tuile pas
  chère » est un CONSOMMABLE pour l'outil (clous, lame). Le parseur les a
  correctement laissés sans appariement. ✅
- dcw210n/nt ×3,2-3,5 : les tuiles à 54,49/97,02 € sont des bundles
  Toolbrothers REFUSÉS par la garde — à raison ; un « machine + 4 kits
  abrasifs » à 54 € est une annonce de place de marché aberrante. ✅
- dcd709nt ×1,78 : tuiles nues « DCD709N » à 83-85 € en unknown — le parseur
  refuse À RAISON de poser un coût N (sans coffret) sur la fiche NT (avec
  TSTAK) : configuration non concordante, règle apparierParConfiguration. ✅
- dcd805 ×2,2 · dch273 ×1,9-2,1 · dcf850 ×1,8-1,9 · dcg405 ×1,8 : les tuiles
  les moins chères (84-120 €) sont des annonces GRISES de place de marché
  (titres traduits machinalement : « pilote d'impact pilote électrique »,
  « perceuse 18V/20V MAX ») restées en sansRef — le parseur n'extrait pas
  leur référence sur ce gabarit de tuile. ⚠️ DÉCISION USER REQUISE (ci-dessous).

## La décision qui conditionne « trop cher » (tour 4)

Les offres les MOINS chères d'idealo sur plusieurs machines nues sont des
vendeurs de place de marché (imports gris, titres mal traduits, -30 à -45 %
sous les revendeurs sérieux). Aujourd'hui le parseur ne les lit pas → le coût
retenu vient des revendeurs classiques → les prix du site paraissent hauts.
**Question à l'user : achètes-tu réellement chez ces vendeurs-là ?**
- OUI → j'apprends au parseur leur gabarit de tuile (extraction de réf sur
  titres traduits), le coût descend, les prix aussi.
- NON → le parseur est déjà au millimètre : il retient le moins cher des
  vendeurs achetables, et les prix actuels reflètent CE coût-là.

## Tour 5 (zip 68–134) — décision user gravée + deux causes mesurées

**DÉCISION USER (15/08/2026, mot pour mot)** : « on achète sur tous les sites
présents sur idealo, ce sont tous des revendeurs européens, sauf AliExpress ;
les prix AliExpress sont écartés par les délais, MAIS si le délai est ≤ 8
jours on les garde s'ils sont les moins chers ; Amazon = revendeur européen. »
⇒ Les tuiles de place de marché DOIVENT être lues. La barrière de délai
existante (barriere.juger + delaiEnJours) implémente déjà la règle des 8 jours.

**Cause n°1, MESURÉE** : la tuile « DEWALT DCF850 pilote d'impact… sans
brosse… » est rejetée avec `rej: "brosse métallique"` — « sans brosse »
(brushless mal traduit) déclenche le filtre d'accessoires sur le mot
« brosse ». Correctif : le filtre accessoire ne mord pas quand le mot est
précédé d'une négation (sans/without/ohne) ou fait partie de « sans
brosse(s) » = brushless.

**Cause n°2, PARTIELLEMENT mesurée** : les tuiles « DEWALT DCH273 perceuse à
percussion rotative… » (84,99–95,99 €) et « DEWALT DCD805 tournevis
électrique… » (88,99–111,99 €) sortent en sansRef avec `rej: null`, alors que
`refUniqueDuTitre` ET la sélection de candidats rendent la bonne réf sur ces
titres (testé). L'écartement se produit donc AVANT, dans l'ouverture des
tuiles de la grille `parseIdealo` — le gabarit exact de ces tuiles (place de
marché) diffère de « MARQUE RÉF » en tête. ⛔ Règle du projet : un balisage se
lit sur une CAPTURE, jamais d'imagination. IL FAUT une capture d'écran d'une
de ces tuiles pour corriger sans deviner.

**Prochain tour** : ① corriger la négation « sans brosse » (+ témoin réel +
sabotage) ; ② à réception de la capture, corriger l'ouverture de tuile ;
③ rejouer le croisement site→zip — dcd805/dch273/dcf850/dcg405 doivent alors
recevoir leurs coûts de place de marché et leurs prix descendre.

## Tour 6 (deux captures user du 15/08 + zips n°5 p.135–201 et n°6 p.202–268) — le tour qui renverse le tour 5

**Les captures demandées au tour 5 sont arrivées** — pages PRODUIT idealo,
lues, jamais imaginées :
- DCH273 : « 25 Variantes à partir de 198,91 € » — DCH273N-XJ **198,91 €**
  (« Meilleur prix », vendeur côtébrico ; RACETOOLS 200,16 € « vendu sans
  batterie »), DCH273NT-XJ **226,04 €**, P2T 388,00, H2T 484,48, P2 387,26,
  M1 345,48.
- DCD805 (page de la variante NT-XJ, « Comparez 17 offres », plage
  114,32–320,90 €) : DCD805NT-XJ **114,32 €** (« Meilleur prix »),
  DCD805N **129,90 €**, P2T 272,84, E2T-QW 293,20, H2T 371,95, E1T 248,32.

**Verdict n°1 — le « 89 € » n'est pas inventé, mais ce n'est pas une offre.**
La tuile existe mot pour mot dans SES zips : zip n°5 `admin-140` section
`sansRef`, DEUX fois — `{"rej": null, "prix": 88.99, "titre": "DEWALT DCD805
tournevis électrique Compact sans brosse perceuse à main perceuse à
percussi…"}` — et encore zip n°3 `admin-6` (88,99), zip n°6 `admin-207`
(88,99), plus les mêmes en DCH273 à 84,99–95,99 €. MAIS la capture prouve que
le minimum idealo de TOUTE la famille DCD805 est **114,32 €** (« Toutes les
Variantes à partir de 114,32 € », 17 offres) : un montant à 88,99 € n'existe
dans aucune liste d'offres du produit. Ces tuiles grises — titres traduits
machinalement, réf de FAMILLE sans suffixe de variante — sont des encarts de
grille (publicité / produits similaires), pas des offres achetables.

**Verdict n°2 — la « cause n°2 » du tour 5 était FAUSSE ; le plan ② est
ANNULÉ.** J'avais conclu « le parseur rate les tuiles les moins chères » et
proposé d'apprendre leur gabarit. Mesuré ce tour : le parseur LES LIT (elles
sortent en `sansRef` avec leur prix) et refuse de les écrire — à raison
double : réf de famille seule (impossible d'attribuer à une variante) et prix
sous le minimum réel de toutes les offres. Leur apprendre un gabarit aurait
ÉCRIT des prix inachetables sur des fiches précises. Erreur gravée : E-115
(O1, affirmer avant de mesurer — la « mesure » s'était arrêtée à la grille).

**Verdict n°3 — sur ces deux références, le parseur est au millimètre.**
Croisement capture→zips, valeur par valeur :

| variante (capture) | min idealo | vu et apparié par le parseur | où (page du zip) |
|---|---|---|---|
| DCH273N-XJ | 198,91 € | 198,91 € → `dewalt-dch273n-xj` | n°1 p.94 et 100, n°2 p.161 et 167 |
| DCH273NT-XJ | 226,04 € | 226,04 € → `dewalt-dch273nt-xj` | n°1 p.98, n°2 p.165 |
| famille DCD805 | 114,32 € | 114,32 € → `dewalt-dcd805n-xj` | n°1 p.81, n°2 p.148/151/152/168 |
| DCD805N | 129,90 € | 129,90 € → `dewalt-dcd805n-xj` | n°1 p.84 et 85 |

Dans les zips n°3 à 6 ces tuiles ne figurent plus : leur prix est stable, et
les INCHANGÉS sont comptés (`counts.unchanged`, ex. 26 sur n°6 p.214) mais
pas détaillés — limite de lecture déjà gravée au tour 4, confirmée ici.
⚠️ Nuance dite, pas cachée : la tuile de famille « DeWalt DCD805 » à 114,32 €
s'est appariée par NOM à la fiche N (nue) alors que ce minimum est porté par
la variante NT-XJ (avec coffret TSTAK). Coût favorable et ACHETABLE (acheter
la NT-XJ sert une commande de machine nue, coffret en plus) — jamais à perte.
Les hausses différées DCH273N-XJ → 305,12 € et DCH273NT-XJ → 323,92 €
(coûts 198,91/226,04, exacts au centime) attendent l'arbitrage D-57.

**Amélioration de méthode (tour 6)** : une tuile de grille dont le prix est
SOUS le « à partir de » de sa propre famille n'est pas une offre, c'est un
encart. Le croisement site→zip se termine TOUJOURS sur la page produit idealo
(carrousel de variantes + liste d'offres) — seule source du minimum opposable.
La grille seule ne suffit jamais à déclarer « le parseur a raté moins cher ».
