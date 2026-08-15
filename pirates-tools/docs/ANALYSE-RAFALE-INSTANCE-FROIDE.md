# Analyse gravée — le traqueur perd ses hausses : chaîne complète, état, reste à faire

*Gravée le 15/08/2026, sur ordre de l'user (« on retrace la chaîne, on analyse
le code et le comportement, on corrige à la source — et tu graves l'analyse »).
Tout chiffre ci-dessous vient de SON zip (67 pages idealo, admin-68 → admin-134)
ou du code, ligne citée.*

## Le symptôme qu'il constate

DCF850N vendu ~147,97–149,82 € pour un coût idealo du jour de **118,86 €** —
marge quasi nulle après port. « Le parseur ne fait pas son travail. »

## La mesure qui accuse

| mesure | valeur | où |
|---|---|---|
| hausses différées annoncées sur la rafale | **415** | somme des `counts.haussesDifferees`, admin-68→134 |
| hausses réellement appliquées | **14** | somme des `counts.applied` |
| dernière page (134) | différait ENCORE (3 hausses) | `counts` d'admin-134 |
| cause écrite dans la couverture | `instance-froide`, `pages: None`, instance âgée de 97 s | `couverture` d'admin-133/134 |
| hausse DCF850N calculée et perdue | 118,86 € → newPrice **191,84 €** (markup 0,614) | `haussesDifferees` d'admin-82 |

## La chaîne, retracée en entier

1. Une tuile plus chère que le prix courant → **hausse différée** (`api/admin.js`,
   bloc `scanMode && newPrice > cur && !rafaleFinieCettePage`, ~l.4781) — voulu,
   correct (le 11/08 : 11 fiches sur 15 affichées trop cher en cours de rafale).
2. La fin de rafale se détecte ainsi (~l.4488) :
   `rafaleFinieCettePage = ... (pwCouv.pages + 1) >= pagesDuPlanCourant` —
   **`pwCouv` est une variable de MODULE** (`let pwCouv = null`, l.2967).
3. La file des hausses est une variable de module aussi
   (`pwHaussesEnAttente`, l.2987).
4. **Vercel recycle les instances.** Une instance froide repart avec
   `pwCouv = null` et une file vide : la fin de rafale n'arrive jamais
   (compteur reparti de zéro), et les hausses accumulées par les instances
   précédentes n'existent plus. Les 415 → 14 sont exactement ça.
5. Conséquence : **les prix ne remontent jamais** — le site reste au plus bas
   historique pendant que les coûts fournisseur montent. C'est le défaut de
   marge de DCF850N, et de toute fiche dont le coût a monté.

## Les TROIS états de rafale en mémoire d'instance (la source unique du mal)

| état | rôle | risque si perdu | statut |
|---|---|---|---|
| `pwHaussesEnAttente` (l.2987) | file des hausses à rejouer | hausses jamais écrites → marge rongée | ✅ **RÉPARÉ** (a21a7a1) : doc durable `config/pw_hausses_<marque>`, rejeu fin de rafale OU entrée > 30 min (`PW_HAUSSE_TTL_MS`) |
| `pwCouv.pages` (l.2967/3256) | détection de fin de rafale | la fin n'arrive jamais sur instance froide | ⛔ à persister — le TTL de 30 min du correctif ① borne le retard, mais la détection reste mémoire |
| `pwCouv.coutMin` (`pwRafaleCoutMin`, l.3159) | minimum de rafale anti-hausses-fantômes | instance froide oublie les tuiles moins chères déjà vues → sur-prix temporaire en cours de balayage (le défaut du 11/08 revient par le recyclage) | ⛔ à persister |

## Le reste à faire, précisément

1. **Persister `pages` et `coutMin`** dans le MÊME document durable
   (`config/pw_hausses_<marque>`, clés `_pages` et `_coutMin` — le filtre de
   rejeu ignore déjà les clés sans `.sku`). Lecture : dans le bloc durable
   existant (~l.4505), AVANT le calcul de `rafaleFinieCettePage` ; la fin se
   décide sur `max(pages mémoire, pages durables)`. Écriture : une seule par
   page, en fin de traitement (près du flush `snapPage`, ~l.4806).
   Coût : +0 lecture (le doc est déjà lu), +1 écriture par page.
2. **La porte `check-instance-froide`** — le harnais existe déjà dans
   `scripts/check-price-watch.js` : `pageIdealo(sku, prixTxt)` (~l.3300),
   `reqPage(sku, extras)`, `fauxRes()`, `fauxAdmin` (~l.3154), `fauxDb()`, et
   l'appel direct `admFn(req, res, fauxAdmin, db)`.
   Scénario : page 1 en `scan=1` avec une tuile PLUS CHÈRE que le prix courant
   → la hausse doit être différée ET écrite dans le doc durable de la base
   factice ; puis `delete require.cache[require.resolve('../api/admin.js')]`
   et re-`require` — une VRAIE instance froide ; antidater `at` de l'entrée
   durable à −31 min ; page suivante → la hausse DOIT être appliquée
   (override écrit). **Sabotages exigés** : ① neutraliser l'écriture durable
   → rouge ; ② neutraliser le rejeu (`unePerimee`) → rouge.
3. Brancher la porte dans `ci.js` et `outils/sabotage-campagne.mjs`.

## Ce qui est déjà en place (ne pas refaire)

- Garde titre↔fiche (`titreContreditFiche`, porte `check-titre-fiche`,
  19 témoins réels, 5 sabotages rouges) — les kits/lots/bundles ne
  contaminent plus les fiches nues. Poussé (1cde9ef).
- File durable des hausses avec rejeu TTL. Poussé (a21a7a1).
- Le prix de DCF850N n'a PAS été modifié à la main — ordre de l'user : les
  prix se rétablissent par le TRAQUEUR, pas par une saisie. Après la
  correction ci-dessus, UNE rafale complète suffit ; même interrompue, le
  TTL de 30 min rejoue les hausses au passage suivant.

## Anomalies signalées, à arbitrer (jamais corrigées en douce)

- `DT50002-QZ` : tuile à 10 000 €, fiche servie **12 311,51 €** — pollution
  ancienne, prix absurde pour un accessoire.
- `DCFS950N` : old 161,63 € contre tuiles à 685 € — l'un des deux est faux.
- À traiter avec les 203 hausses en attente (D-57).
