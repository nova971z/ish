# Arbitrage D-57 — les 203 hausses en attente, tranchées UNE PAR UNE

*Rendu le 15/08/2026. Demande de l'user : « arbitre les 203 hausses D-57
maintenant, une par une ! Jamais par lot ! »*

## La base de preuve

- La liste : `archives/idealo/mouvement-des-prix.csv` (203 lignes `HAUSSE`,
  figées le 14/08 — AVANT la garde titre↔fiche, l'état durable de rafale et
  le tour 6).
- La preuve fraîche : les **SIX balayages complets du 15/08** envoyés par
  l'user (pages 68-134 · 135-201 · 2-67 · 68-134 · 135-201 · 202-268,
  horodatés 09:23 → 18:07, versions de parseur distinctes). Chaque référence
  a été cherchée dans TOUTES les sections de TOUTES les pages (applied,
  haussesDifferees, flagged, unknown, sansRef) — dossier de preuve par
  référence, puis verdict individuel.

## Ce que chaque verdict veut dire — et le geste qui va avec

| verdict | n | le geste |
|---|---|---|
| ✅ JUSTIFIÉE | 39 | coût revu au centime le 15/08 sur la tuile du produit lui-même. Appliquer : écran admin (recalcul depuis le coût stocké) — sûr pour ces fiches. |
| ✅ JUSTIFIÉE (prudente) | 20 | packs maison DWK*T : la tuile fraîche du pack est AU-DESSUS du coût CSV — la hausse proposée est en-deçà du réel, donc sans risque. Même geste. |
| ⚪ CADUQUE | 42 | le traqueur réparé a déjà écrit un état PLUS FRAIS le 15/08 (34 hausses appliquées, 6 baisses appliquées, 1 déjà appliquée avant, 1 écart nul). Rien à faire. |
| ⛔ REJETÉE | 8 | le coût du CSV venait d'une tuile kit / d'une variante non concordante / d'un encart / d'un lot / d'une réf tronquée. Ne JAMAIS appliquer ; le coût stocké de ces 8 fiches est suspect — les exclure de tout recalcul global tant qu'une tuile nue ne les a pas réécrites. |
| 🕐 NON CONFIRMÉE | 94 | aucune tuile concordante dans les 6 balayages complets : le relevé du CSV (≥ 1 jour) n'est confirmé par rien. Ne pas appliquer à la main ; la règle de fraîcheur (gel à 14 j) et les prochains balayages font foi. |

⚠️ **Pourquoi « pas de trace » ne veut pas dire « prix bon »** : une tuile au
prix INCHANGÉ est comptée (`counts.unchanged`) mais jamais détaillée dans les
zips. Une fiche absente des six balayages peut donc être à jour… ou absente
de la grille. Dans le doute, on ne fabrique pas une hausse à la main.

⚠️ **Les drapeaux C2a sur les packs DWK** datent du parseur d'avant le
correctif « défaut 10 » (packs maison légitimes) — ils prouvent que la tuile
et son prix étaient LÀ le 15/08, pas que la tuile est fautive.


## ✅ JUSTIFIÉE — coût confirmé le 15/08, à appliquer — 39 lignes

| n° | réf | site → proposé (coût CSV) | preuve du verdict |
|---|---|---|---|
| 4 | DCK2225MP2T | 812,95 → 904,82 (698,17) | la tuile du kit lui-même vaut 696,73 € (3 balayages 15/08, sansRef: titre multi-réfs) ≈ coût 698,17 — hausse fondée |
| 27 | DWK405PS | 1286,21 → 1305,35 (1023,00) | tuile du pack lui-même à 1023,00 = coût, revue 15/08 (le drapeau C2a = défaut 10, corrigé depuis) |
| 37 | DWK900T | 2172,10 → 2190,95 (1743,00) | tuile DWK900T (3×5,0Ah+4×TSTAK VI) à 1743,00 = coût, 15/08 |
| 49 | DWK207 | 568,66 → 587,40 (440,00) | tuile du pack à 440,00 = coût, 15/08 |
| 53 | DWK205 | 577,15 → 595,85 (447,00) | tuile du pack à 447,00 = coût, 15/08 |
| 59 | DWK208 | 523,02 → 541,63 (403,00) | tuile du pack à 403,00 = coût, 15/08 |
| 60 | DWK222 | 717,44 → 736,03 (561,00) | tuile du pack à 561,00 = coût, 15/08 |
| 61 | DWK201 | 528,02 → 546,60 (407,00) | tuile du pack à 407,00 = coût, 15/08 |
| 65 | DWK402 | 1002,34 → 1020,89 (792,00) | tuile du pack à 792,00 = coût, 15/08 |
| 66 | DWK303PS | 1064,81 → 1083,25 (843,00) | tuile du pack à 843,00 = coût, 15/08 |
| 67 | DWK200 | 550,22 → 568,66 (425,00) | tuile du pack à 425,00 = coût, 15/08 |
| 68 | DWK210 | 636,48 → 654,89 (495,00) | tuile du pack à 492,00 (coût CSV 495,00 : le frais est 3 € plus BAS — recalcul sur 492) |
| 69 | DWK204 | 555,18 → 573,58 (429,00) | tuile du pack à 429,00 = coût, 15/08 |
| 70 | DWK209 | 555,18 → 573,58 (429,00) | tuile du pack à 429,00 = coût, 15/08 |
| 71 | DWK306PS | 1096,54 → 1114,93 (869,00) | tuile du pack à 869,00 = coût, 15/08 |
| 74 | DWK304PS | 1123,91 → 1142,27 (891,00) | tuile du pack à 891,00 = coût, 15/08 |
| 82 | DWK307PS | 1164,43 → 1182,72 (924,00) | tuile du pack à 924,00 = coût, 15/08 |
| 86 | DWK223 | 826,10 → 844,34 (649,00) | tuile du pack à 649,00 = coût, 15/08 |
| 88 | DWK308PS | 1218,89 → 1237,10 (968,00) | tuile du pack à 968,00 = coût, 15/08 |
| 91 | DWK404PS | 1246,06 → 1264,24 (990,00) | tuile du pack à 990,00 = coût, 15/08 |
| 92 | DWK202 | 590,96 → 609,14 (458,00) | tuile du pack à 458,00 = coût, 15/08 |
| 93 | DWK203 | 590,96 → 609,14 (458,00) | tuile du pack à 458,00 = coût, 15/08 |
| 97 | DWK305PS | 1038,13 → 1055,81 (821,00) | tuile du pack à 821,00 = coût, 15/08 |
| 103 | DWK218 | 731,34 → 748,58 (571,00) | tuile du pack à 571,00 = coût, 15/08 |
| 105 | DWK703 | 2231,17 → 2248,24 (1790,00) | tuile du pack à 1790,00 = coût, 15/08 |
| 109 | DWK221 | 688,00 → 704,06 (535,00) | tuile du pack à 535,00 = coût, 15/08 |
| 110 | DWK225 | 690,64 → 706,69 (537,00) | tuile du pack à 537,00 = coût, 15/08 |
| 111 | DWK214 | 699,32 → 715,36 (544,00) | tuile du pack à 544,00 = coût, 15/08 |
| 112 | DWK213 | 699,32 → 715,36 (544,00) | tuile du pack à 544,00 = coût, 15/08 |
| 113 | DWK217 | 699,32 → 715,36 (544,00) | tuile du pack à 544,00 = coût, 15/08 |
| 114 | DWK216 | 714,05 → 730,03 (556,00) | tuile du pack à 556,00 = coût, 15/08 |
| 115 | DWK220 | 717,44 → 733,40 (559,00) | tuile du pack à 559,00 = coût, 15/08 |
| 116 | DWK215 | 717,44 → 733,40 (559,00) | tuile du pack à 559,00 = coût, 15/08 |
| 118 | DWK224 | 657,53 → 672,38 (509,00) | tuile du pack à 509,00 = coût, 15/08 |
| 121 | DWK219 | 651,41 → 665,78 (504,00) | tuile du pack à 504,00 = coût, 15/08 |
| 126 | DWK212 | 541,63 → 555,18 (414,00) | tuile du pack à 414,00 = coût, 15/08 |
| 131 | DWK206 | 509,70 → 522,06 (387,00) | tuile du pack à 387,00 = coût, 15/08 |
| 133 | DWK211 | 460,34 → 472,62 (347,00) | tuile du pack à 347,00 = coût, 15/08 |
| 185 | DCD740 | 222,44 → 223,32 (144,36) | tuile nue DCD740N (sans batterie) 144,31 ≈ coût 144,36 (5 centimes), fraîche 3 balayages |

## ✅ JUSTIFIÉE (prudente) — coût CSV ≤ tuile fraîche du pack, hausse en-deçà du réel — 20 lignes

| n° | réf | site → proposé (coût CSV) | preuve du verdict |
|---|---|---|---|
| 30 | DWK601T | 1904,11 → 1923,02 (1525,00) | pack maison ; tuile DWK601 (chariot) 1661 ≥ coût CSV 1525 — hausse en-deçà du frais |
| 31 | DWK700T | 1904,11 → 1923,02 (1525,00) | tuile DWK700 1716 ≥ 1525 |
| 32 | DWK802T | 1990,80 → 2009,70 (1595,00) | tuile DWK802 1686 ≥ 1595 |
| 33 | DWK804T | 2112,18 → 2131,06 (1694,00) | tuile DWK804 1714 ≥ 1694 |
| 34 | DWK801T | 2107,15 → 2126,02 (1690,00) | tuile DWK801 1837 ≥ 1690 |
| 35 | DWK803T | 2137,34 → 2156,21 (1714,00) | tuile DWK803 1843 ≥ 1714 |
| 36 | DWK701T | 2093,32 → 2112,18 (1679,00) | tuile DWK701 1780 ≥ 1679 |
| 39 | DWK901T | 2345,59 → 2364,42 (1884,00) | tuile DWK901 2036 ≥ 1884 |
| 41 | DWK1100T | 2749,39 → 2768,17 (2211,00) | tuile DWK1100 2253 ≥ 2211 |
| 43 | DWK1103T | 2871,05 → 2889,82 (2310,00) | tuile DWK1103 2431 ≥ 2310 |
| 44 | DWK1200T | 2884,81 → 2903,57 (2321,00) | tuile DWK1200 2519 ≥ 2321 |
| 45 | DWK1202T | 2884,81 → 2903,57 (2321,00) | tuile DWK1202 2453 ≥ 2321 |
| 47 | DWK1101T | 2824,76 → 2843,52 (2273,00) | tuile DWK1101 2509 ≥ 2273 |
| 50 | DWK1201T | 3086,28 → 3105,01 (2486,00) | tuile DWK1201 2618 ≥ 2486 |
| 51 | DWK1203T | 3218,68 → 3237,41 (2592,00) | tuile DWK1203 2607 ≥ 2592 |
| 98 | DWK600T | 1666,06 → 1683,72 (1331,00) | tuile DWK600 1474 ≥ 1331 |
| 101 | DWK702T | 1936,90 → 1954,26 (1551,00) | tuile DWK702 1620 ≥ 1551 |
| 102 | DWK800T | 1998,36 → 2015,66 (1601,00) | tuile DWK800 1714 ≥ 1601 |
| 106 | DWK805T | 2243,75 → 2260,80 (1800,00) | tuile DWK805 1925 ≥ 1800 |
| 108 | DWK1102T | 2641,32 → 2658,00 (2123,00) | tuile DWK1102 2387 ≥ 2123 |

## ⚪ CADUQUE — le traqueur réparé a déjà tranché plus frais le 15/08 — 42 lignes

| n° | réf | site → proposé (coût CSV) | preuve du verdict |
|---|---|---|---|
| 10 | DCH263N | 233,48 → 280,69 (191,08) | traqueur réparé : appliqué 195,45 → 286,14 le 15/08 (C1b p201) |
| 11 | DCW210N-XJ | 176,44 → 220,81 (142,37) | appliqué 143,90 → 222,76 le 15/08 (C2a p67) ; le coût CSV 142,37 était la tuile NT |
| 16 | DPN75C-XJ | 486,74 → 518,14 (383,80) | appliqué 412,11 → 553,06 le 15/08 (C1b p201) |
| 18 | DCE555N-XJ | 182,58 → 209,82 (133,39) | appliqué 133,39 → 209,82 le 15/08 = exactement la ligne CSV |
| 23 | DCB104-QW | 243,38 → 265,99 (179,12) | remplacée : BAISSE plus fraîche appliquée 161,11 → 243,92 le 15/08 (C2a p22) |
| 25 | DXVCS003 | 160,03 → 181,54 (110,49) | appliqué 147,95 → 227,70 le 15/08 |
| 28 | DWE7492-QS | 777,22 → 796,27 (609,70) | appliqué 610,70 → 797,58 le 15/08 |
| 42 | DCH172N-XJ | 211,46 → 230,23 (149,99) | remplacée : BAISSE appliquée 134,85 → 211,58 le 15/08 (C1a p85) |
| 76 | DCS781N-XJ | 1134,17 → 1152,52 (899,00) | appliqué 911,03 → 1167,02 le 15/08 |
| 81 | DCF922N-XJ | 194,94 → 213,24 (136,17) | appliqué 137,24 → 214,51 le 15/08 |
| 90 | DCM586N | 481,87 → 500,06 (369,32) | appliqué 370,26 → 501,34 le 15/08 |
| 119 | D26204K | 437,77 → 452,33 (330,41) | appliqué 334,38 → 457,09 le 15/08 |
| 122 | DCMST901N-XJ | 692,87 → 706,82 (537,10) | remplacée : recalcul plus frais appliqué le 15/08 sur coût 522,25 → prix 688,32 (au lieu de 706,82) |
| 125 | DW721KN | 4247,89 → 4261,56 (3425,69) | appliqué 3425,78 → 4261,67 le 15/08 |
| 127 | DCS369N-XJ | 186,41 → 199,44 (125,04) | appliqué 125,04 → 199,44 le 15/08 = exactement la ligne CSV |
| 135 | DW03101-XJ | 265,60 → 277,46 (188,37) | appliqué 189,99 → 279,48 le 15/08 |
| 138 | DCS353B | 191,66 → 202,38 (127,44) | appliqué 128,80 → 204,14 le 15/08 (C1a p84) |
| 140 | DCD710 | 184,33 → 194,86 (121,33) | appliqué 112,74 → 184,33 le 15/08 |
| 142 | DCP580N | 253,13 → 263,51 (165,00) | appliqué 165,00 → 263,51 le 15/08 = exactement la ligne CSV |
| 143 | DXCMD155PE | 264,67 → 274,52 (185,99) | appliqué 197,99 → 289,26 le 15/08 |
| 147 | DCV501LN-XJ | 197,58 → 205,96 (130,27) | déjà appliquée avant le 15/08 (prix 205,96 constaté en production) ; les tuiles kit qui poussaient à 323 sont refusées |
| 150 | D25133K | 194,47 → 201,95 (127,09) | appliqué 127,08 → 202,06 le 15/08 |
| 152 | DWE492-QS | 178,82 → 185,82 (113,93) | appliqué 113,93 → 185,82 le 15/08 = exactement la ligne CSV |
| 153 | AT-DXV15T | 184,42 → 191,30 (118,38) | appliqué 136,80 → 213,96 le 15/08 (coût plus frais que le CSV) |
| 154 | DWE396 | 475,36 → 481,55 (354,08) | appliqué 383,98 → 518,38 le 15/08 |
| 158 | DWS727 | 925,27 → 929,41 (718,25) | appliqué 823,72 → 1059,30 le 15/08 |
| 165 | DCM561 | 262,81 → 266,29 (179,32) | appliqué 180,32 → 267,60 le 15/08 |
| 174 | DCS389NT-XJ | 374,46 → 376,39 (268,66) | appliqué 268,66 → 376,39 le 15/08 = exactement la ligne CSV |
| 176 | DWAMF1280 | 147,41 → 148,92 (83,99) | appliqué 84,30 → 149,29 le 15/08 = la ligne CSV à 37 centimes |
| 178 | DXCMS2550HE | 382,76 → 384,16 (274,99) | appliqué 284,99 → 396,42 le 15/08 |
| 180 | DXCMS2524HE | 296,59 → 297,85 (204,99) | appliqué 214,99 → 310,24 le 15/08 |
| 181 | DCH273N-XJ | 162,16 → 163,37 (83,69) | ⚠️ le coût CSV 83,69 était un prix d'ENCART (non-offre, tour 6) ; le vrai coût 198,91 est appliqué → 305,12 le 15/08 |
| 184 | DCG421N-XJ | 339,86 → 340,97 (239,95) | appliqué 267,93 → 375,37 le 15/08 |
| 188 | AT-DXV30SAPTA | 239,75 → 240,16 (158,10) | remplacée : BAISSE appliquée 143,80 → 222,60 le 15/08 (C2a p19) |
| 190 | DWST1-81078 | 330,78 → 331,12 (232,04) | remplacée : BAISSE appliquée 194,18 → 284,66 le 15/08 (C2a p27) |
| 191 | AT-DXV20PC | 161,93 → 162,25 (94,83) | appliqué 95,94 → 163,67 le 15/08 (C2a p67) |
| 194 | DCPW550B | 324,94 → 325,15 (227,06) | appliqué 240,34 → 341,52 le 15/08 |
| 195 | DCS374N | 636,48 → 636,65 (480,13) | appliqué 495,00 → 654,89 le 15/08 |
| 196 | DT70523TM-QZ | 352,18 → 352,31 (249,16) | écart déjà nul (site 352,18 vs 352,31) ; la tuile « x 12 » reste refusée par la garde (lot), décision existante |
| 197 | DCMBC723N-XJ | 783,53 → 783,66 (599,59) | appliqué 600,77 → 785,21 le 15/08 |
| 199 | DCH911NK-XJ | 1251,04 → 1251,12 (978,97) | remplacée : BAISSE appliquée 812,63 → 1045,86 le 15/08 (C2a p63) |
| 202 | DCF913B | 348,24 → 348,28 (245,96) | appliqué 235,10 → 335,02 le 15/08 (C2a p67) |

## ⛔ REJETÉE — coût contaminé (kit, config, encart, lot ou fiche invalide) : NE JAMAIS appliquer — 8 lignes

| n° | réf | site → proposé (coût CSV) | preuve du verdict |
|---|---|---|---|
| 1 | DCF894N-XJ | 339,86 → 567,98 (424,50) | coût 424,50 = tuile kit DCF894P2T-15 (2×5,0Ah+chargeur+coffret), revue le 15/08 — prix de kit sur fiche nue |
| 3 | DCH273P1T-QW | 412,73 → 510,72 (358,90) | coût 358,90 ≈ tuiles DCH273P1 (sans coffret, 353,51-376,00 le 15/08) — P1≠P1T, configuration refusée à raison |
| 9 | DXV23PTA | 217,03 → 271,07 (183,15) | coût 183,15 ≈ DXV23PLPTA (183,63-183,93, autre modèle) ; la tuile propre est un bundle « & » refusé (259,42) |
| 17 | DCM200N | 324,89 → 353,23 (249,99) | coût 249,99 = tuile DCM200NT-XJ (variante coffret) posé sur la fiche N — surestime la nue |
| 84 | DCS350NT-XJ | 438,08 → 456,36 (333,84) | coût 333,84 = tuile famille DCS350 avec nBat=1 (une batterie) — prix de kit |
| 99 | P2LRT | 490,56 → 508,19 (375,88) | réf de fiche invalide (« P2LRT » = suffixe tronqué de DCD800P2LRT) — corriger la fiche avant tout prix |
| 107 | DCG414 | 392,47 → 409,30 (295,52) | coût 295,52 = tuile DCG414NT (variante coffret) posé sur la fiche de base — surestime |
| 129 | DCG409 | 153,11 → 165,78 (97,69) | la seule tuile est un ENCART (titre traduit machinalement, 108,99, sansRef) — coût 97,69 du même acabit, jamais opposable (tour 6) |

## 🕐 NON CONFIRMÉE — aucune tuile concordante dans les 6 balayages complets du 15/08 : ne pas toucher, gel 14 j — 94 lignes

| n° | réf | site → proposé (coût CSV) | preuve du verdict |
|---|---|---|---|
| 2 | DW711 | 1287,82 → 1406,26 (1105,55) | aucune tuile DW711 dans les 6 balayages du 15/08 |
| 5 | D27107XPS | 1599,55 → 1690,34 (1336,24) | seule D27107 (1501,49, autre modèle sans XPS) vue — coût 1336,24 sans trace |
| 6 | DCN930N | 465,30 → 551,69 (392,10) | seules tuiles kit (543,64/604,69, refusées par la garde) et clous — coût 392,10 sans trace |
| 7 | DCS572NT-XJ | 268,70 → 333,36 (233,77) | coût 233,77 = tuile famille DCS572 (fraîche 15/08) non attribuable à la variante NT — configuration |
| 8 | DCB116-QW | 106,98 → 167,21 (98,82) | aucune trace |
| 12 | DWMT73803 | 368,75 → 411,02 (296,98) | aucune trace (grammaire DWMT : prudence D-157) |
| 13 | DCS727N | 987,60 → 1028,86 (798,80) | seule DCS727T2-QW (kit 2 batt, 986,10) vue |
| 14 | DCW600N-XJ | 245,66 → 285,82 (195,10) | aucune trace |
| 15 | DCF897N-XJ | 342,19 → 375,83 (268,26) | aucune trace |
| 19 | DWE4206-QS | 174,37 → 200,65 (125,96) | seule DWE4206K (variante coffret, 176,99) vue |
| 20 | DCS334N-XJ | 232,33 → 257,46 (172,10) | coût 172,10 sans trace ; toutes les tuiles DCS334N récentes sont des kits refusés |
| 21 | DWS773 | 316,28 → 340,61 (239,70) | aucune trace |
| 22 | DCG200NT | 495,18 → 519,04 (384,76) | seule DCG200T2 (kit 2 batt, 706,94) vue |
| 24 | D25881K-QS | 756,60 → 778,25 (594,99) | aucune trace |
| 26 | DCR019 | 167,10 → 187,39 (115,18) | aucune trace |
| 29 | DCE085D1G | 529,68 → 548,65 (408,53) | aucune trace |
| 38 | DXGNI20E | 856,27 → 875,10 (673,67) | aucune trace |
| 40 | DCH733N-XJ | 2603,33 → 2622,13 (2092,68) | aucune trace |
| 46 | DCN682N | 567,31 → 586,07 (439,00) | seule DCN682D2 XR (kit, 649) vue |
| 48 | DWK301 | 893,63 → 912,38 (704,00) | aucune trace |
| 52 | DCPS7154N-XJ | 3780,08 → 3798,78 (3048,78) | aucune trace |
| 54 | DCMWP500N-XJ | 688,00 → 706,69 (537,00) | aucune trace |
| 55 | DCK791 | 404,18 → 422,84 (306,41) | coût 306,41 = tuile DCK791D2KX (suffixe non concordant avec la fiche DCK791) |
| 56 | DCK2223MP2T | 697,88 → 716,54 (544,90) | aucune trace |
| 57 | DXF2067 | 470,10 → 488,75 (359,90) | aucune trace |
| 58 | D25430K | 519,35 → 537,98 (399,99) | aucune trace |
| 62 | DXRH012E | 412,42 → 430,99 (312,99) | aucune trace |
| 63 | DCS398T2 | 993,30 → 1011,85 (784,99) | aucune trace |
| 64 | DCH832XN-XJ | 605,59 → 624,14 (469,99) | coût 469,99 = tuile famille DCH832 (fraîche) — attribution famille→XN non prouvée |
| 72 | DWK403 | 1105,52 → 1123,91 (876,00) | aucune trace |
| 73 | DW304PK | 335,02 → 353,39 (250,10) | aucune trace |
| 75 | DCE822NG18-XJ | 506,03 → 524,38 (389,00) | aucune trace |
| 77 | DCH274N | 433,44 → 451,78 (330,00) | seule DCH274P1T (kit, 443) vue |
| 78 | DCR017 | 510,20 → 528,53 (392,37) | aucune trace |
| 79 | DWK400 | 1151,23 → 1169,56 (913,00) | aucune trace |
| 80 | DXF1853 | 433,31 → 451,63 (329,90) | aucune trace |
| 83 | DCBPS0554-XJ | 1164,43 → 1182,72 (924,00) | aucune trace |
| 85 | DWK401 | 1191,68 → 1209,94 (946,00) | aucune trace |
| 87 | DCMBC823N-XJ | 678,48 → 696,70 (529,00) | aucune trace |
| 89 | DWK300 | 839,80 → 858,00 (660,00) | aucune trace |
| 94 | DCN910N | 863,20 → 881,34 (679,00) | aucune trace |
| 95 | DCN950N-XJ | 585,16 → 602,99 (452,69) | aucune trace |
| 96 | DCE080D1RS | 1578,65 → 1596,41 (1259,99) | seule DCE080D1GS-QW (1531, autre variante) vue |
| 100 | DWP849X | 320,83 → 338,44 (237,83) | aucune trace |
| 104 | AT-DXV20P | 154,50 → 171,71 (102,45) | la voisine AT-DXV20PC vit sa vie (appliquée) ; la fiche P sans trace |
| 117 | DWE575K | 273,66 → 288,56 (197,38) | aucune trace |
| 120 | DCE0811 | 438,29 → 452,76 (330,72) | voisine DCE0811D1R-QW 332,68 — attribution non prouvée |
| 123 | DCE050N-XJ | 363,96 → 377,86 (269,90) | aucune trace |
| 124 | DCF99MP2T | 581,15 → 594,84 (446,24) | coût 446,24 sans trace ; seule la tuile du kit complet DCK2225MP2T (696,73) vue |
| 128 | DCE825NG18-XJ | 432,06 → 444,78 (324,18) | seule DCE825D1G18-QW (429) vue |
| 130 | D25733K-QS | 925,91 → 938,48 (725,26) | aucune trace |
| 132 | DCMBBL800N | 781,58 → 793,91 (607,89) | aucune trace |
| 134 | D25335K-QS | 758,14 → 770,11 (588,77) | aucune trace |
| 136 | DCS377NT-XJ | 384,71 → 396,26 (284,88) | aucune trace |
| 137 | DPC17PS | 588,30 → 599,36 (449,97) | aucune trace |
| 139 | D24000 | 1295,64 → 1306,22 (1024,49) | seule D240001 (accessoire 91,96, autre réf) vue |
| 141 | DCMPS567N-XJ | 279,02 → 289,46 (198,13) | seule DCMPS567P1-QW (kit, 293,39) vue |
| 144 | DWD241-QS | 311,33 → 321,08 (223,75) | aucune trace |
| 145 | DCS378 | 486,58 → 495,90 (365,98) | tuile nue DCS378N-XJ 356,90 fraîche (< coût CSV 365,98) mais non attribuée — configuration |
| 146 | DW0811 | 357,24 → 366,11 (260,39) | aucune trace |
| 148 | DCF840NT-XJ | 180,66 → 188,69 (116,26) | coût 116,26 = tuile famille DCF840 (fraîche) — famille→NT non prouvée |
| 149 | DCM563PB-XJ | 223,36 → 231,31 (150,89) | coût 150,89 = tuile famille DCM563 (fraîche) — attribution non prouvée |
| 151 | DCG418NT-XJ | 285,77 → 292,87 (200,87) | coût 200,87 = tuile famille DCG418 (fraîche) — famille→NT non prouvée |
| 155 | DCN692N | 1076,33 → 1082,33 (842,28) | seuls des consommables « pour DCN692 » (clous 91,85-94,70) vus |
| 156 | DCF891NT-XJ | 310,75 → 316,00 (219,75) | coût 219,75 = tuile famille DCF891 (fraîche) — famille→NT non prouvée |
| 157 | DCF601N | 175,27 → 179,94 (109,12) | coût 109,12 sans trace ; ⚠️ la tuile famille récente porte le prix du kit D2 (169,87, 2 batteries) — ne jamais l'attribuer |
| 159 | DCH481N | 598,06 → 602,17 (452,08) | seule DCH481X2-QW (kit, 881,66) vue |
| 160 | D26441 | 178,30 → 182,21 (110,97) | aucune trace |
| 161 | DCE0822D1R | 384,16 → 387,92 (278,08) | seule DCE0822D1G (359,90, autre variante) vue |
| 162 | DWMT73801-1 | 214,54 → 218,24 (140,26) | aucune trace |
| 163 | DCS386NT-XJ | 352,19 → 355,82 (252,00) | seule DCS386H2T (kit 2 batt, 513,94) vue |
| 164 | DWV010 | 636,58 → 640,10 (483,10) | aucune trace |
| 166 | DCS491 | 346,21 → 349,48 (246,98) | tuile nue DCS491N 246,98 = coût, fraîche — mais attribution base↔N non prouvée |
| 167 | DCMCS565N-XJ | 270,31 → 273,55 (185,21) | seuls kits P1 vus (285,10 unknown ; 461,21 refusé) |
| 168 | DWH161D1-QW | 217,38 → 220,30 (159,98) | tuile nue DWH161N 154,81 fraîche ; la fiche D1 (avec batterie) sans trace |
| 169 | DW275KN | 238,57 → 241,46 (159,17) | aucune trace |
| 170 | D26500K | 352,93 → 355,82 (252,00) | tuile D26500 (sans coffret) 217,30 fraîche ; la fiche K sans trace |
| 171 | DW294 | 384,36 → 387,01 (277,43) | aucune trace |
| 172 | DWT2151643 | 164,74 → 167,03 (98,66) | aucune trace |
| 173 | DW333K | 471,82 → 474,10 (348,09) | aucune trace |
| 175 | DCDW108 | 350,21 → 351,90 (248,87) | aucune trace |
| 177 | DCS579NT-XJ | 386,90 → 388,39 (278,42) | coût 278,42 = tuile famille DCS579 (fraîche) — famille→NT non prouvée |
| 179 | DCK229P2T | 834,06 → 835,42 (641,64) | aucune trace |
| 182 | DWMT45424 | 200,32 → 201,50 (126,73) | aucune trace |
| 183 | DCMCS574N-XJ | 393,12 → 394,28 (283,25) | seule DCMCS574X1-QW (54V 9Ah, autre variante, 464,09) vue |
| 186 | DWD112S | 166,07 → 166,74 (98,43) | aucune trace |
| 187 | DWMT73801 | 218,33 → 218,87 (140,75) | aucune trace |
| 189 | DWV901L | 468,88 → 469,25 (344,28) | aucune trace |
| 192 | DW739 | 1320,20 → 1320,47 (1035,66) | aucune trace |
| 193 | AT-DXV34PTA | 314,46 → 314,70 (218,69) | aucune trace |
| 198 | DCF512N | 239,09 → 239,20 (157,26) | seule DCF512EN (variante E, 249) vue |
| 200 | DCD799N-XJ | 196,87 → 196,94 (122,94) | seule une tuile kit NT+batterie+chargeur (213,90, sansRef) vue |
| 201 | D21570K | 481,34 → 481,40 (353,97) | aucune trace |
| 203 | DWHT0-43172 | 157,57 → 157,60 (90,99) | aucune trace |

## Décision de l'user après lecture (15/08, mot pour mot)

**« Non, nous, on applique rien du tout, c'est le traqueur et le parseur qui
doivent faire leur travail correctement ! »** — AUCUNE application manuelle,
jamais. La colonne « geste » ci-dessus est donc amendée : le seul geste
autorisé est de laisser tourner le traqueur, et de réparer le traqueur si lui
ne fait pas son travail.

## Constat sur le balayage suivant (zip n°7, pages 269-335, même soir)

Le balayage d'après — parseur **identique au dépôt** (empreinte
`14f44a28bfaa5c00-360255`, vérifiée localement) — mesure ceci sur 67 pages
complètes :
- `applied` **0** · `haussesDifferees` **0** · `unchanged` **1205** ·
  `flagged` 167 · `unknown` 1491 · `sansRef` 925.
- Or « unchanged » dans le code n'est PAS « coût inchangé » : c'est
  **« prix modèle recalculé ≡ prix courant à 2 centimes près »**
  (`api/admin.js`, test `Math.abs(newPrice - cur) < 0.02` — `newPrice` est
  recalculé à CHAQUE lecture depuis le coût frais). Le traqueur répare donc
  la dérive TOUT SEUL, par construction, pour toute fiche appariée.
- **Conséquence mesurée : toute la population appariée est déjà au modèle.**
  Les hausses justifiées dont la tuile s'apparie n'ont plus rien en attente —
  le traqueur avait déjà fait son travail. Aucun écran, aucun geste.
- Les 8 REJETÉES : aucune n'a écrit quoi que ce soit (0 applied, 0 différé) —
  la garde tient, leurs coûts suspects restent inertes.
- Les packs à chariot (fiches `DWK600T`…`DWK1203T`) restent `unknown` :
  la tuile idealo s'écrit `DWK600` sans T. ⛔ **On ne recolle PAS T↔sans-T,
  et c'est prouvé** : idealo porte À LA FOIS « DWK900T (3×5,0 Ah + 4×TSTAK
  VI) » à 1743,00 € ET « DWK900 (3×5,0 Ah + caddy 3in1) » à 1903,00 € —
  DEUX packs différents sous le même numéro. Recoller écrirait le prix du
  mauvais pack (M-28 : rapprocher fabrique des faux jumeaux). Ces fiches
  vivent de leur propre tuile T quand elle paraît ; sinon gel 14 j.
- `rej:"chariot"` sur ces tuiles n'est PAS un refus : c'est le champ
  `typeRejete` — le titre disait « chariot », la nomenclature (DWK = pack
  d'outils) a gagné, l'écarté reste lisible. Comportement voulu.
- Divers : 1 tuile au titre tronqué (« DeWalt DWK », 347 €) → sansRef, à
  raison ; 1 id refusé connu (`d125/8`, décision user en attente) ;
  1 fiche verrouillée relevée sans écriture.

## Ce qui reste, dans l'ordre de l'argent — SANS geste manuel

1. Les 8 REJETÉES : coût stocké suspect mais INERTE (rien ne l'applique) ;
   une vraie tuile nue les réécrira, le gel 14 j couvre l'attente.
2. Les 94 NON CONFIRMÉES : balayages suivants + gel 14 j. Rien d'autre.
3. La fiche **P2LRT** (réf tronquée) et l'id **`d125/8`** : défauts de
   DONNÉES à corriger un jour — indépendants des prix, décision user.

*Ma session ne peut ni lire ni écrire Firestore (CONNECT 403, définitif) :
ce registre classe et prouve ; l'écriture appartient au traqueur seul.*
