# 🔁 REPRISE — tout ce que la prochaine session doit savoir

> **Écrit le 17/08/2026 à la demande de l'user**, avant la bascule vers le dépôt
> privé `nova971z/PIRATES-TOOLS-COM`. Cette conversation ne suit pas le
> déménagement : tout ce qu'elle contient est ici.
>
> ⛔ **À lire EN ENTIER avant la première action.** Puis appliquer le protocole
> §0 : `node scripts/ou.js "<intention>"`, `docs/CARTOGRAPHIE.md`,
> `docs/CHAINE-TRAQUEUR.md`, `docs/DECISIONS.md` · `LECONS.md` · `ERREURS.md`.

---

## 0. L'ÉTAT, EN UN COUP D'ŒIL *(mesuré le 17/08/2026)*

| | |
|---|---|
| dernier commit | **`01d67c2`** — « Rectificatif : l'import GitHub crée un dépôt indépendant… » |
| commits de cette session | **22** (16 et 17/08) |
| empreinte du parseur | **`4d76627672f01800-380463`** |
| CI | **6 demandes ouvertes**, aucune autre erreur |
| noyau | **151/151 assertions, 9/9 harnais** |
| catalogue | **1 708 fiches** — DEWALT 1 047 · MAKITA 611 · FESTOOL 50 |
| lignes écrites à la main | **128 412** (107 789 code + 20 623 doc) |
| portes de contrôle | **65** (`scripts/check-*.js`) |

**Les 6 demandes ouvertes** : `D-180` (appliquer le plan DeWALT) · `D-184`
(protéger le code) · `D-54` (descriptifs de fiches) · `D-56` (audit admin) ·
`D-61` (photos floues) · `D-64` (référencement).
⚠️ D-180 et D-184 ont été laissées **OUVERTES exprès** : le travail n'est pas
fini, et la CI doit le rappeler à chaque exécution.

---

## 1. ⛔ LE DÉMÉNAGEMENT EN COURS — À FINIR EN PREMIER

**Où on en est, exactement :**

| étape | état |
|---|---|
| l'ancien dépôt `nova971z/ish` est **PUBLIC** et c'est un **fork** de `ish-app/ish` | constaté |
| GitHub interdit de rendre un fork privé | vérifié en doc |
| l'user a **importé** le dépôt vers `nova971z/PIRATES-TOOLS-COM` | ✅ fait |
| le nouveau dépôt est **PRIVÉ** | ✅ vérifié : **404** pour un visiteur non connecté |
| le nouveau dépôt est **indépendant** (pas de « forked from ») | ✅ vérifié à l'écran |
| Vercel pointe encore sur l'**ancien** dépôt | ⛔ **pas encore basculé** |
| l'ancien dépôt public existe toujours | ⛔ **à trancher** |

**⛔ CE QU'IL RESTE À FAIRE, DANS CET ORDRE — ne pas inverser :**
1. Vérifier que cette nouvelle session voit bien le code (elle le voit si vous
   lisez ceci depuis le nouveau dépôt).
2. **Vercel** → Settings → Git → déconnecter l'ancien, connecter
   `PIRATES-TOOLS-COM`. Les variables d'environnement **ne bougent pas**, elles
   vivent chez Vercel. ⚠️ Vérifier sur place que la branche de production reste
   **`master`** et que le dossier racine reste **`pirates-tools`**.
3. **Trancher le sort de l'ancien dépôt** : le supprimer (le plus net) ou le
   vider. ⛔ Rappel dit à l'user : **ce qui a été public l'a été** ; si quelqu'un
   a cloné, on n'y peut rien. L'objectif est d'arrêter, pas d'effacer le passé.
4. Optionnel, à sa main : preuve de date (enveloppe Soleau INPI — **à confirmer
   auprès de l'INPI, je ne suis pas une source de droit**) et un `LICENSE`
   propriétaire.

Le détail complet est dans **`docs/PROTEGER-LE-CODE.md`**.

---

## 2. CE QUI A ÉTÉ MESURÉ SUR L'EXPOSITION DU CODE

- Les **8 fichiers servis** au navigateur ont été fouillés pour **16
  identifiants** du moteur. **Deux occurrences, aucune n'est l'algorithme** :
  `calcPrice` (app.js:178) ne calcule que TVA + octroi de mer — des taux publics
  de l'État — et `recommend` n'apparaît que dans un commentaire.
- ⇒ **Obfusquer le code servi ne protégerait rien.** Le traqueur, le parseur,
  les grammaires et le calcul de majoration sont **100 % côté serveur**.
- Ce qui était public sur GitHub : **12 459 lignes de moteur**, **15 498 lignes
  de méthode** dans `docs/`, **57 998 lignes de catalogue** avec les coûts.
- ⚠️ **Le pire n'était pas le code, c'est la documentation** : elle livre le
  raisonnement.
- ✅ **Aucun vrai secret n'a été trouvé** dans le dépôt. Les `sk_test_…` des docs
  sont des exemples ; la clé Firebase web est publique par conception.
- `.gitignore` protège désormais `.env`, `*.pem`, `*.key`, comptes de service,
  `.vercel` — il ne contenait **que** les règles du projet amont.
- `check-fuites.js` balaie maintenant **tout fichier versionné**, plus seulement
  les servis. ⚠️ Deux motifs basés sur un **nom de variable**
  (`ADMIN_SECRET = "…"`) ont été **retirés du balayage global** : ils criaient
  sur 4 harnais qui posent une valeur d'essai. Une porte qui crie à tort finit
  ignorée. Ils restent actifs sur les fichiers SERVIS.

---

## 3. ⛔ CE QUI DISPARAÎT AVEC CETTE SESSION — ET C'EST IMPORTANT

**Les 25 balayages archivés (2 056 réponses de page) vivaient dans un bac
temporaire, hors dépôt. Ils sont PERDUS.**

Conséquence directe : **aucune mesure sur l'historique des balayages n'est plus
rejouable.** Tous les chiffres de ce document qui viennent de ces zips sont
désormais **des faits écrits, pas des mesures reproductibles** — les traiter
comme tels, et ne jamais les représenter comme fraîchement mesurés.

⚠️ `archives/idealo/` contient **535 fichiers**, mais ce sont des **extraits**
que j'ai fabriqués, pas les relevés bruts.

⇒ **Le prochain zip que l'user enverra est le nouveau point de départ.**

---

## 4. LE CHANTIER PRINCIPAL — FINIR DEWALT

Le plan complet, numéroté, est dans **`docs/PLAN-FINIR-DEWALT.md`** (v2, 12
défauts D-01→D-12, 6 phases). Voici où on en est réellement.

### ✅ FAIT ET POUSSÉ

| étape | ce qui a été fait | preuve |
|---|---|---|
| **0.1** | la réponse de balayage rend `unchangedIds` — les fiches inchangées sont **NOMMÉES** | 4 assertions dont un préalable, **3 sabotages rouges** |
| **0.2** | le verdict du rattrapage est déposé dans `config/traqueur_etat` et **recopié dans la réponse de page** | 5 assertions, **3 sabotages rouges** |
| **D-13** | « sans chargeur » était lu « avec chargeur » — corrigé via `nieApres` | 12/12 dont 4 contre-épreuves |
| **D-14** | `nieApres` se laissait berner par « sans **fil** » et « sans **balais** » — corrigé par `FAUSSES_NEGATIONS` | **3 sabotages rouges** |
| **grammaire** | `K` = coffret · `B` seul = machine nue · `R` = faisceau rouge · `L` = classe de poussière · `NG18` = nue+vert+18 V | **4 sabotages rouges** |
| **tension** | une tension en fin de suffixe n'est plus lue comme un code de batterie | voir §5 |
| **tiret** | un séparateur orphelin ne ressuscite plus une batterie fantôme | 1 sabotage rouge |

**Effet mesuré du calibrage** : fiches DeWALT au suffixe illisible
**202 → 126** ; dont **machines ou énergie : 92 → 37**.

### ⛔ CE QUI RESTE — dans l'ordre imposé par la mesure

> **L'ordre n'est pas négociable** : D-05 avant D-06, et D-06 avant tout
> appariement souple DeWALT. Inverser fait vendre à perte sur 202 fiches.

1. **33 suffixes sans source** → `docs/DEWALT-SUFFIXES-A-SOURCER.csv`.
   L'user a proposé d'aider. Familles : aspirateurs (`A`,`P`,`PTA`,`SAPTA`),
   nettoyeurs haute pression (`U`,`E`,`CE`), compresseurs
   (`M50HE`,`T200HE`,`T270HCE`,`QTC`,`RC`,`MRC`), lasers
   (`CG`,`GB`,`RB`,`D1RS`).
   ⚠️ **Correction déjà faite auprès de l'user** : j'avais dit « 9 fiches »,
   c'est **33**. Mon 9 ne comptait que `P`,`U`,`E`,`DH`.
2. **D-06** — coffret et machine nue rendent encore la MÊME signature dans
   `varianteProduit`. Latent aujourd'hui **parce que DeWALT n'a aucun
   appariement par configuration** (garde M-28, Makita seulement).
   ⛔⛔ **Ajouter cet appariement à DeWALT — l'idée la plus évidente pour
   augmenter la couverture — serait une vente à perte immédiate sur 202 fiches.**
3. **D-07** — un titre à plusieurs lots de batteries n'est lu qu'en partie :
   « 1 x 5,0 + 2 x 2,0 » → **1** au lieu de 3.
4. **D-08** — 8 fiches où notre propre titre contredit notre propre référence.
5. **D-11** — les trois grammaires de marque rendent **trois formes de retour
   différentes**. C'est ce qui m'a fait publier « 0 sur 1 047 » à tort.
6. **Phase 3** — un balayage DeWALT **avec le rattrapage joint** : c'est un
   geste de l'user, et c'est ce qui donnera enfin la vraie couverture.
7. **Phase 4** — les **59 fiches refusées ≥ 5 fois sans une seule application**
   (record `dewalt-dcg426n-xj`, **103 refus**) ; les **10 fiches à préfixe de
   distributeur** (`AT-`, `AR-`, `TD.`) dont **`AT-DXV20PTA`** — vendue
   196,09 €, le fournisseur affiche `DXV20PTA` à **190,57 €**, jamais appariée
   en 13 balayages ; et **`dewalt-dt50002-qz`**, refusée 13 fois sur 13
   (coût lu 10 000 € > borne 8 000 €) et **vendue 12 311,51 €** —
   ⛔ **décision de l'user, jamais une correction en douce**.
8. **Phase 5** — une **porte de couverture par marque**. C'est la cause racine
   de ma faute : aucune porte ne mesurait la couverture, donc mon « 100 % »
   venait de ma tête.

### Le dossier Makita, laissé en plan

- `makita-dlm330rt` **vend toujours à perte**. Cause **datée et fermée** : le
  balayage n°15 (parseur `779a09fe…`) a écrit le prix de la machine **nue**
  (141,08 €) sur la fiche du **kit**. Le parseur actuel ne rapproche plus rien
  sur ce titre — **la cause est réparée**, le résidu en base ne l'est pas.
- Depuis, **0 tuile DLM330 propre sur 4 430** : le fournisseur ne la montre
  plus. Le correctif « mémoire du rattrapage » la **nommera** `muette` au
  prochain balayage. **Nommer n'est pas réparer** — le dire à l'user.
- **FESTOOL** : 50 fiches, **aucun plan de traqueur**, et leurs **50 références
  sont numériques** — le parseur rend `null`. Déclarées non suivies dans
  `check-marques-suivies.js`. L'user a dit : « on ne s'occupe pas de Festool
  pour l'instant ».
- **MILWAUKEE** : un plan existe pour **0 fiche**.

---

## 5. ⛔ MES SEPT FAUTES DE CETTE SESSION — À NE PAS REFAIRE

*Elles sont listées ici parce que ce sont elles, plus que les correctifs, qui
doivent survivre. Le protocole §0 les cite déjà.*

1. **« DeWALT est fini à 100 % »** — le chiffre venait du balayage **MAKITA**.
   DeWALT était à 99,34 %, sur un balayage qui datait. **C'est la faute qui a
   déclenché tout le reste.**
2. **« 759 fiches DeWALT jamais vues »** — je les cherchais dans `unknown`, or
   une tuile **appariée n'y va jamais**. Test discriminant : 198 réfs dans
   `applied`, 1 208 dans `unknown`, **0 dans les deux**. Je comptais comme
   invisibles exactement celles qui avaient été trouvées.
3. **« l'instrument de complétude surestime »** — faux, `admin.js` additionne
   déjà `doublons` dans `luesBrutes` avant bornage. Ma formule comptait deux fois.
4. **Le mauvais TYPE d'argument, quatre fois.** `titreContreditFiche` prend le
   sku en **CHAÎNE** ; je lui passais l'objet fiche. `String({})` vaut
   « [object Object] ». J'ai conclu « le parseur n'est pas alimenté » — faux.
5. **Trois motifs de recherche jetables faux d'affilée** — 75,1 %, puis 6,3 %,
   puis 39 « refus dus au bogue ». Les trois contaminés par « sans **fil** » et
   « sans **balais** ». **Mesure propre et définitive : sur les 794 refus, le
   bogue n'en change AUCUN.**
6. **« je pousse l'historique en une commande »** — impossible : `.git/shallow`
   existe, ma copie ne contenait que 125 commits.
7. **« ne pas passer par Import »** — faux, l'Importer GitHub crée un dépôt
   **indépendant**, pas un fork.

⚠️ **Le garde-sortie m'a repris trois fois** pour avoir donné un chiffre non
mesuré **dans le tour courant** (107 789, 65, 107 600). Un chiffre mesuré au
tour précédent doit être **remesuré** avant d'être cité.

---

## 6. CE QUI EST CONFIRMÉ SAIN — ne pas rouvrir

| maillon | mesure |
|---|---|
| unicité des sku / racines / identifiants DeWALT | **0** collision sur 1 047 |
| appariement exact | **0** rate sur 3 273 références inconnues |
| appariements souples en production | **0** attribution hasardeuse en attente |
| les gardes de refus | **168 / 169** refus justifiés |
| `choisirCoutSource` | minimum sur sources **fraîches ET en stock** seulement |
| instrument de complétude | borne et rend l'écart — **ne surestime pas** |
| absence de plafond de variation | **voulu** (D-015). ⛔ **Ne pas réintroduire** |

---

## 7. LES RÈGLES DE L'USER GRAVÉES CETTE SESSION

1. **`.claude/PROTOCOLE.md` §0 — AUCUN TRAVAIL À L'AVEUGLE.** Lire la chaîne
   entière avant de la toucher, dans l'ordre nommé.
2. **`.claude/PROTOCOLE.md` §5 bis — MA SESSION EST ÉPHÉMÈRE.** Un travail non
   poussé n'existe pas. Pousser dès qu'un lot est fini, commiter **avant** toute
   campagne longue, ne rien laisser d'important hors du dépôt.
3. **`.claude/PROTOCOLE.md` §2.6** *(déjà là)* — jamais de détour, jamais de
   petite correction isolée : **la source, toujours**.

**Ses ordres permanents, rappelés :**
- ⛔ **Jamais par lot** — un par un, toujours.
- ⛔ **Format de chaque message** : un bloc **CSV** d'abord, puis des
  explications **numérotées, courtes, en mots simples**. Jamais de pavé.
- ⛔ **Aucun chiffre sans la commande qui l'a produit, dans le tour courant.**
- ⛔ Fin de lot : `node outils/verifier-pousse.mjs` puis les mots exacts
  **« poussé, build non prouvé »** — jamais « déployé ».
- ⛔ **On n'applique jamais un prix à la main.** C'est au traqueur de faire son
  travail.
- ⛔ Ne jamais commenter son état (sommeil, fatigue, heure).
- Il est **au Maroc**, l'entreprise est en **Guadeloupe**. iPad, navigation
  privée exclusive, **pas de téléphone**.

---

## 8. LES DOCUMENTS NEUFS DE CETTE SESSION

| document | ce qu'il contient |
|---|---|
| `docs/PLAN-FINIR-DEWALT.md` | le plan v2 — 12 défauts, 6 phases, 2 balayages et 1 décision demandés à l'user |
| `docs/AUDIT-DEWALT-2026-08-16.md` | la vérification chaîne par chaîne, avec ses rectificatifs |
| `docs/AUDIT-TRAQUEUR-PARSEUR-2026-08-16.md` | l'audit profond, 5 défauts dont deux qui s'annulent |
| `docs/CHAINE-TRAQUEUR.md` | **la chaîne en 10 maillons** — à lire avant de toucher au traqueur |
| `docs/PROTEGER-LE-CODE.md` | l'exposition mesurée et la procédure de déménagement |
| `docs/DEWALT-SUFFIXES-A-SOURCER.csv` | les 33 suffixes sans source, à remplir avec l'user |
| `scripts/check-marques-suivies.js` | une marque vendue sans plan fait rougir la CI |
| `scripts/check-cartographie.js` | les chiffres de la carte se relisent sur le disque |

⚠️ `docs/CARTOGRAPHIE.md` a été remise à jour : elle annonçait **207 produits**
pour 1 708 réels et **12 contrôles** pour 65. Deux sections ajoutées : « où est
la carte avant de toucher » et les **26 modules de `api/_lib/`**.

---

## 9. LA PREMIÈRE CHOSE À FAIRE DANS LA NOUVELLE SESSION

1. Lire ce fichier en entier. *(fait, si vous lisez ceci)*
2. `cd pirates-tools && node scripts/ci.js` — attendu : **6 demandes ouvertes**,
   rien d'autre.
3. `node tests/lancer.mjs --noyau` — attendu : **151/151, 9/9**.
4. Confirmer à l'user que la nouvelle session voit le code, **puis** le laisser
   basculer Vercel.
5. Reprendre le plan à **`docs/PLAN-FINIR-DEWALT.md`**, phase 1.1 — les 33
   suffixes, avec son aide.

⛔ **Ne rien annoncer comme mesuré sans avoir relancé la commande dans le tour
courant.** C'est la faute la plus fréquente de cette session, et le garde-sortie
la refusera.
