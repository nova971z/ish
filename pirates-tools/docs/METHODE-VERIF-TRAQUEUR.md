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
