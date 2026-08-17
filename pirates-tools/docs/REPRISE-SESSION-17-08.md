# 🔁 REPRISE — TOUT ce que la prochaine session doit savoir

> **Écrit le 17/08/2026**, à la demande de l'user, avant la bascule vers le
> dépôt privé `nova971z/PIRATES-TOOLS-COM`. La conversation des 16–17/08 ne suit
> pas le déménagement : **son contenu intégral est ici**.
>
> ⛔ **Ce document est le point d'entrée. Le lire EN ENTIER avant toute action.**

---

# PARTIE I — L'ORDRE DE LECTURE, ET RIEN D'AUTRE AVANT

**Ne rien faire tant que les six points ne sont pas lus, dans cet ordre.**

| # | quoi | pourquoi celui-là, à ce rang |
|---|---|---|
| **1** | **ce document** | l'état, le chantier, mes fautes, ce qui est perdu |
| **2** | `CLAUDE.md` *(racine du dépôt)* | la mémoire d'entrée — 80 lignes, plafond imposé par une porte |
| **3** | `.claude/PROTOCOLE.md` | réinjecté à **chaque** message ; §0 aveugle, §2.6 la source, §5 bis l'éphémère |
| **4** | `docs/CARTOGRAPHIE.md` | la carte de vol du dépôt — ses chiffres sont vérifiés par une porte |
| **5** | `docs/CHAINE-TRAQUEUR.md` | **la chaîne traqueur · parseur · calculateur, en 10 maillons** |
| **6** | `docs/PLAN-FINIR-DEWALT.md` | le chantier en cours, 12 défauts numérotés, ordre imposé |

**Puis, avant CHAQUE intervention, sans exception :**

```bash
cd pirates-tools && node scripts/ou.js "<ce que je vais faire>"
```

L'entonnoir rend six blocs : où intervenir · ce qui protège · les règles
applicables · les pièges déjà payés · les décisions en vigueur · ce que « fini »
veut dire à cet endroit. **Interdit de proposer quoi que ce soit avant de l'avoir
lu.** Intention absente de l'index → l'ajouter, puis continuer.

**Les registres à consulter selon le besoin :**

| besoin | document |
|---|---|
| ce qui reste à faire, avec sa preuve | `docs/ETAT.md` |
| pourquoi tel choix, et ce qu'il a renversé | `docs/DECISIONS.md` |
| une panne, sa cause, la porte posée | `docs/LECONS.md` |
| d'où viennent mes erreurs, par mécanisme | `docs/ERREURS.md` (`node scripts/erreurs.js`) |
| ce que l'user a demandé, et où ça en est | `docs/DEMANDES.md` (`check-demandes`) |
| ce qui engage juridiquement | `docs/JURIDIQUE.md` (`node scripts/juridique.js J3`…) |
| les techniques nommées, M-01 à M-57 | `docs/METHODES.md` |
| l'histoire du projet | `docs/JOURNAL.md` |
| la liste de tous les documents | `docs/INDEX-DOCS.md` |

---

# PARTIE I bis — ⛔ LA TOUTE PREMIÈRE ACTION : RAPATRIER CE QUI MANQUE

**L'import GitHub a copié le dépôt à un instant T (~01h00 le 17/08). Le travail
poussé APRÈS cet instant n'y est pas.** L'user l'a repéré lui-même, et il avait
raison.

**Ce qui manque dans le nouveau dépôt** *(à vérifier, la liste peut s'être
allongée)* :

```
d5607cb  Les données brutes sont versées, et le fichier de reprise devient complet
8d9a86b  Fichier de reprise : tout ce que cette conversation contenait
```

⚠️ Le premier contient **les 2 056 réponses de balayage** et la version complète
de ce document. Sans lui, `archives/balayages/` n'existe pas.

**Comment les récupérer — mesuré, ça marche :**
l'ancien dépôt est **PUBLIC**, donc il se lit **sans aucun identifiant** (prouvé
le 17/08 : `git ls-remote https://github.com/nova971z/ish master` répond). Le
nouveau, lui, est là où la session a le droit d'écrire.

```bash
cd /chemin/du/depot
git remote add ancien https://github.com/nova971z/ish
git fetch ancien master
git log --oneline HEAD..ancien/master     # ce qui manque, avant de toucher
git merge ancien/master                    # ou : git cherry-pick <sha> <sha>
node pirates-tools/scripts/ci.js           # 6 demandes ouvertes attendues
node pirates-tools/tests/lancer.mjs --noyau
git push origin master
git remote remove ancien                   # ⛔ ne PAS laisser ce lien en place
```

⛔ **Retirer le remote `ancien` après coup**, sinon on repousse un jour dans le
dépôt public par distraction — c'est exactement ce qu'on cherche à arrêter.

⚠️ **Vérifier après le rapatriement** que `archives/balayages/INDEX.md` existe et
que `node scripts/bilan-balayage.js archives/balayages/25-makita` répond. Si oui,
les données brutes sont bien arrivées.

---

# PARTIE II — L'ÉTAT MESURÉ *(17/08/2026)*

| | |
|---|---|
| dernier commit avant ce document | **`8d9a86b`** |
| commits des 16–17/08 | **22** |
| empreinte du parseur | **`4d76627672f01800-380463`** |
| CI | **6 demandes ouvertes**, aucune autre erreur |
| noyau | **151/151 assertions, 9/9 harnais** |
| catalogue | **1 708 fiches** — DEWALT **1 047** · MAKITA **611** · FESTOOL **50** |
| lignes écrites à la main | **128 412** — 107 789 code + 20 623 doc |
| portes de contrôle | **65** (`scripts/check-*.js`) |
| balayages archivés | **25 relevés, 2 056 réponses de page** |

**Les 6 demandes ouvertes** : `D-180` (appliquer le plan DeWALT) · `D-184`
(protéger le code) · `D-54` (descriptifs de fiches) · `D-56` (audit admin) ·
`D-61` (photos floues) · `D-64` (référencement).
⚠️ **D-180 et D-184 sont OUVERTES exprès** : le travail n'est pas fini, et la CI
doit le rappeler à chaque exécution. Ne pas les fermer pour faire verdir.

**Les commandes de vérification, à lancer au démarrage :**

```bash
cd pirates-tools
node scripts/ci.js              # attendu : 6 demandes ouvertes, rien d'autre
node tests/lancer.mjs --noyau   # attendu : 151/151, 9/9
node outils/verifier-pousse.mjs # fin de lot, toujours
```

---

# PARTIE III — LES DONNÉES BRUTES, ENFIN VERSÉES

⛔ **Elles ont failli disparaître.** Les 25 balayages vivaient dans un bac
temporaire hors dépôt. Ils sont désormais dans
**`archives/balayages/`** — c'est exactement ce que la règle
`.claude/PROTOCOLE.md` §5 bis impose.

**`archives/balayages/INDEX.md`** dit, pour chaque relevé : la marque, le nombre
de réponses, les pages, les tuiles vues et lues, le pourcentage, **l'empreinte
du parseur qui a servi**, et les compteurs cumulés.

**Comment s'en servir :**

```bash
# le bilan tout fait d'un balayage :
node scripts/bilan-balayage.js archives/balayages/25-makita

# chercher une référence à travers TOUS les relevés :
grep -rl "DLM330" archives/balayages/

# rejouer une mesure : lire les rubriques d'une réponse
#   applied · flagged · unchanged(Ids) · unknown · sansRef · perdus
#   packsIgnores · absents · rupture · counts · couverture · page
#   versionParseur · rattrapageVerdict
```

⚠️ **Les 14 relevés `*-dewalt` sont ANTÉRIEURS au parseur actuel.** Ils portent
les empreintes `9dd79f7e…`, `609bf288…`, `779a09fe…`. Aucune conclusion tirée
d'eux ne vaut pour le code en service — c'est le défaut **DW-3**.

⚠️ **Piège mortel, déjà payé** : en mode balayage, la liste `unchanged` n'était
**pas nommée** avant le correctif 0.1 du 16/08. Une fiche appariée ne figure
donc **jamais** dans `unknown`. La chercher là produit le faux « 759 fiches
jamais vues ». **Test qui tranche** : 198 réfs dans `applied`, 1 208 dans
`unknown`, **0 dans les deux**.

---

# PARTIE IV — LES MÉTHODES, EN ENTIER

*C'est ce qui vaut le plus. Un correctif se refait ; une méthode perdue se
repaye en pannes.*

## IV.1 — Comment on MESURE

1. **Aucun chiffre sans la commande qui l'a produit, DANS LE TOUR COURANT.**
   Le garde-sortie (`scripts/garde-sortie.js`) refuse la réponse sinon. Il m'a
   repris **trois fois** le 17/08 pour des chiffres pourtant mesurés au tour
   d'avant. **Un chiffre du tour précédent se remesure.**
2. **Un exemple non exécuté est une invention.** Jamais « par exemple, ça
   rendrait… » sans l'avoir lancé.
3. **Choisir LA mesure la plus discriminante**, pas la plus facile — celle qui
   élimine le plus d'hypothèses d'un coup.
4. **Dire d'avance ce qui TUERAIT l'hypothèse.** Une hypothèse qu'aucune
   observation ne peut réfuter n'est pas une hypothèse.
5. **Une hypothèse morte se déclare morte tout de suite**, et on n'y revient pas.
6. **Vérifier la FORME avant de conclure.** Quatre fois le 16/08 j'ai appelé une
   fonction avec le mauvais type et conclu qu'elle était cassée. `String({})`
   vaut « [object Object] ». **Inspecter la valeur de retour avant de l'asserter.**
7. **Ne jamais écrire un motif de recherche jetable** quand le produit en a
   déjà un. Trois de mes mesures d'affilée ont été faussées par « sans **fil** »
   et « sans **balais** » attrapés par mes propres expressions.

## IV.2 — Comment on POSE UNE PORTE

1. Une correction sans porte n'est pas finie. La porte se pose **avant** de
   clore, jamais après.
2. **La règle mère** : *une vérification qu'on ne parvient pas à faire échouer
   ne vérifie rien.* Une porte verte au premier essai est **suspecte**.
3. **Le sabotage se fait avec l'outil, jamais à la main :**
   ```bash
   node outils/sabotage.mjs --fichier <f> --cherche "<s>" --remplace "<s>" \
        --commande "node scripts/check-xxx.js"
   ```
   Il refuse de conclure si la substitution n'a rien changé, refuse de conclure
   si la commande n'a pas tourné, restaure et **vérifie** la restauration.
4. **Un sabotage qui ne casse rien ne prouve rien** — vérifier d'abord qu'il
   était réel ; il tombe souvent dans un `try/catch`.
5. **Un préalable** : une condition sans laquelle la porte ne vérifie rien doit
   la faire **ÉCHOUER**, jamais la laisser verdir « poliment ».
6. **Une contre-épreuve** : une porte qui refuse toujours ne vaut pas mieux
   qu'une porte qui accepte toujours. Toujours un cas qui doit PASSER.
7. **Jamais un nombre du produit recopié dans une porte** — on relit la valeur
   à l'exécution, ou on teste l'invariant.
8. **Jamais une donnée du catalogue nommée dans un harnais** — références
   synthétiques (`ZZ…`), le sujet se choisit à l'exécution.
9. **Vérifier l'expression EFFECTIVE, pas le vocabulaire** (M-29) : un détecteur
   qui cherche un mot détecte du vocabulaire. Il m'a déjà menti deux fois.

## IV.3 — Comment on VÉRIFIE UN BALAYAGE

Méthode complète : `docs/METHODE-VERIF-TRAQUEUR.md` (6 tours). En résumé :

1. `node scripts/bilan-balayage.js <dossier>` — pages, tuiles, lues, instances.
2. **Vérifier l'empreinte du parseur** : `versionParseur` doit être celle du
   dépôt. Sinon le relevé décrit un code qui n'existe plus.
3. **Lire les rubriques une par une**, jamais en bloc : `applied` (écrit),
   `flagged` (**refusé, avec le motif**), `unchangedIds` (inchangé, nommé depuis
   le 16/08), `unknown`, `sansRef`, `perdus`, `packsIgnores`.
4. **Un refus n'est pas un défaut** — 168 des 169 refus du dernier balayage
   DeWALT étaient justes. **Le défaut, c'est le refus SILENCIEUX et PERMANENT.**
5. **Croiser avec le catalogue** pour savoir ce qui n'a pas été vu, jamais de
   mémoire.

## IV.4 — Les règles d'ARGENT, non négociables

1. **Le sens de l'erreur décide de tout.** Rapprocher deux références fait
   **baisser** le coût → **vendre à perte**. C'est la faute la plus chère.
2. **M-28 — chaque marque a SA table**, et le test de marque se met **sur la
   ligne d'appel** (`check-separation-marques` l'exige).
3. **L'ambiguïté ne s'arbitre JAMAIS** : deux fiches compatibles ⇒ on ne
   rapproche rien.
4. **Un prix de PACK ne s'écrit jamais sur la référence d'un composant.**
5. **Un coût fournisseur se LIT, jamais ne s'infère.**
6. **On n'applique jamais un prix à la main** — ordre de l'user. C'est au
   traqueur de faire son travail.
7. **Bornes absolues seulement** : `PW.MIN_TTC` = 1 €, `PW.MAX_TTC` = 8 000 €.
   ⛔ **Le plafond de VARIATION a été retiré à raison (D-015) : ne pas le
   réintroduire.**
8. **Une donnée périmée (14 j) est NON OPPOSABLE** : gel du prix, bandeau
   « prix en actualisation », saisie de carte bloquée.

## IV.5 — Comment on LIVRE

1. **Un lot = une correction + sa porte + son sabotage.** Pas une journée.
2. **On pousse IMMÉDIATEMENT** : la session est éphémère, un travail non poussé
   n'existe pas (§5 bis, payé le 14/08 par la perte d'une préparation entière).
3. Toucher un fichier servi impose d'aligner `sw.js` (`VERSION`, `ASSET_VER`) et
   les `?v=` de `index.html` — la CI le vérifie.
4. `node scripts/ci.js` **et** `node tests/lancer.mjs --noyau` avant de pousser.
5. Fin de lot : `node outils/verifier-pousse.mjs`, puis les mots **exacts**
   « **poussé, build non prouvé** ». ⛔ Jamais « déployé ».
6. **Graver dans les registres** : `DEMANDES.md` pour la demande, `DECISIONS.md`
   si un choix est tranché, `LECONS.md` si une panne a été payée, `ERREURS.md`
   si la faute est de moi.

## IV.6 — Le FORMAT de chaque message à l'user

⛔ **Imposé, non négociable :**
1. Un bloc **CSV** en premier — séparateur `;`, une ligne d'en-tête, une ligne
   par point.
2. **En dessous**, des explications **numérotées**, en **mots simples**,
   **courtes**. Jamais un pavé.
3. Le doute est une cellule du tableau, jamais une invention.
4. ⛔ Ne **jamais** commenter son état — sommeil, fatigue, heure chez lui.
5. Aucun secret ne sort : filtrer toute sortie de commande.

## IV.7 — Qui est l'user *(gravé, à ne jamais redéduire)*

- Il est **au MAROC**. L'entreprise est en **GUADELOUPE**. ⛔ Ne jamais déduire
  l'un de l'autre.
- **iPad, navigation privée exclusive** : aucun service worker, aucun cache,
  stockage local vide entre deux visites. Aucun diagnostic ne peut s'appuyer
  dessus.
- **Ni téléphone ni données cellulaires** : jamais de test en 4G, jamais de code
  à scanner depuis un autre appareil.
- Ses achats fournisseurs sont livrés en **France métropolitaine** ; l'acheminement
  vers la Guadeloupe relève du modèle de prix.
- **Jamais par lot.** Un par un, toujours.

---

# PARTIE V — LE DÉMÉNAGEMENT, À FINIR EN PREMIER

| étape | état |
|---|---|
| l'ancien `nova971z/ish` est **PUBLIC** et c'est un **fork** de `ish-app/ish` | constaté |
| GitHub interdit de rendre un fork privé | vérifié en documentation |
| import vers `nova971z/PIRATES-TOOLS-COM` | ✅ fait |
| le nouveau dépôt est **PRIVÉ** | ✅ **404** pour un visiteur non connecté |
| il est **indépendant** (pas de « forked from ») | ✅ vérifié |
| Vercel pointe encore sur l'**ancien** | ⛔ **pas encore basculé** |
| l'ancien dépôt public existe toujours | ⛔ **à trancher** |

**Ordre à respecter — ne pas inverser :**
1. Confirmer que la nouvelle session voit le code.
2. **Vercel** → Settings → Git → déconnecter l'ancien, connecter le nouveau.
   Les variables d'environnement **ne bougent pas**. ⚠️ Vérifier que la branche
   de production reste **`master`** et le dossier racine **`pirates-tools`**.
3. Trancher le sort de l'ancien dépôt. ⛔ **Ce qui a été public l'a été** — si
   quelqu'un a cloné, on n'y peut rien. On arrête, on n'efface pas le passé.
4. À sa main : preuve de date (**enveloppe Soleau INPI — à confirmer auprès de
   l'INPI, je ne suis pas une source de droit**) et un `LICENSE` propriétaire.

**Ce qui a été mesuré sur l'exposition** *(détail : `docs/PROTEGER-LE-CODE.md`)* :
- 8 fichiers servis fouillés pour 16 identifiants du moteur → **2 occurrences,
  aucune n'est l'algorithme**. `calcPrice` ne fait que TVA + octroi de mer (taux
  publics), `recommend` n'est qu'un commentaire.
- ⇒ **Obfusquer le code servi ne protégerait rien.**
- Étaient publics : **12 459 lignes de moteur**, **15 498 lignes de méthode**,
  **57 998 lignes de catalogue** avec les coûts.
- ✅ **Aucun vrai secret** dans le dépôt.
- `.gitignore` protège désormais `.env`, `*.pem`, `*.key`, comptes de service.
- `check-fuites.js` balaie **tout fichier versionné**. ⚠️ Deux motifs par **nom
  de variable** ont été retirés du balayage global : ils criaient sur 4 harnais
  d'essai. Une porte qui crie à tort finit ignorée.

---

# PARTIE VI — LE CHANTIER DEWALT

Plan complet : **`docs/PLAN-FINIR-DEWALT.md`** (v2, défauts D-01→D-12).

## VI.1 — Fait et poussé

| étape | ce qui a été fait | preuve |
|---|---|---|
| **0.1** | la réponse rend `unchangedIds` — les fiches inchangées sont **NOMMÉES** | 4 assertions dont un préalable, **3 sabotages rouges** |
| **0.2** | le verdict du rattrapage est déposé dans `config/traqueur_etat` puis **recopié dans la réponse de page** | 5 assertions, **3 sabotages rouges** |
| **D-13** | « sans chargeur » lu « avec chargeur » — corrigé via `nieApres` | 12/12 dont 4 contre-épreuves |
| **D-14** | `nieApres` berné par « sans fil » / « sans balais » — `FAUSSES_NEGATIONS` | **3 sabotages rouges** |
| grammaire | `K`=coffret · `B` seul=nue · `R`=rouge · `L`=classe poussière · `NG18`=nue+vert+18 V | **4 sabotages rouges** |
| tension | une tension en fin de suffixe n'est plus un code de batterie | témoin + contre-épreuves |
| tiret | un séparateur orphelin ne ressuscite plus une batterie fantôme | 1 sabotage rouge |

**Effet mesuré** : suffixes illisibles **202 → 126** ; machines/énergie **92 → 37**.

## VI.2 — Ce qui reste, dans l'ordre IMPOSÉ

> ⛔ **D-05 avant D-06, et D-06 avant tout appariement souple DeWALT.**
> Inverser fait vendre à perte sur 202 fiches. Mesuré, pas supposé.

1. **33 suffixes sans source** → `docs/DEWALT-SUFFIXES-A-SOURCER.csv`. L'user a
   proposé son aide. ⚠️ **Correction déjà faite auprès de lui** : j'avais dit
   « 9 fiches », c'est **33**.
2. **D-06** — coffret et machine nue signent encore pareil. Latent **parce que
   DeWALT n'a aucun appariement par configuration**. ⛔⛔ **Ajouter cet
   appariement — l'idée la plus évidente pour augmenter la couverture — serait
   une vente à perte immédiate.**
3. **D-07** — « 1 x 5,0 + 2 x 2,0 » lu **1** au lieu de 3.
4. **D-08** — 8 fiches où notre titre contredit notre référence.
5. **D-11** — trois grammaires, **trois formes de retour différentes**.
6. **Phase 3** — un balayage DeWALT **avec rattrapage** *(geste de l'user)*.
7. **Phase 4** — 59 fiches refusées ≥ 5 fois sans une seule application (record
   `dewalt-dcg426n-xj`, **103 refus**) · 10 fiches à préfixe distributeur, dont
   **`AT-DXV20PTA`** vendue 196,09 € quand le fournisseur affiche `DXV20PTA` à
   **190,57 €**, jamais appariée en 13 balayages · **`dewalt-dt50002-qz`**
   refusée 13/13 et **vendue 12 311,51 €** — ⛔ **décision de l'user**.
8. **Phase 5** — une **porte de couverture par marque**. C'est la cause racine
   de ma faute : aucune porte ne la mesurait, donc mon « 100 % » venait de ma tête.

## VI.3 — Makita, laissé en plan

- **`makita-dlm330rt` vend toujours à perte.** Cause **datée et fermée** : le
  balayage n°15 (parseur `779a09fe…`) a écrit le prix de la machine **nue**
  (141,08 €) sur la fiche du **kit**. Le parseur actuel ne rapproche plus rien
  sur ce titre. **Le résidu en base, lui, n'est pas corrigé.**
- Depuis, **0 tuile DLM330 propre sur 4 430**. Le correctif la **nommera**
  `muette`. **Nommer n'est pas réparer** — le dire à l'user.
- **FESTOOL** : 50 fiches, **aucun plan**, et **50 références numériques** que le
  parseur rend `null`. Déclarées non suivies. L'user : « on ne s'occupe pas de
  Festool pour l'instant ».
- **MILWAUKEE** : un plan pour **0 fiche**.

---

# PARTIE VII — MES SEPT FAUTES, NOMMÉES

*Elles comptent plus que les correctifs. Le protocole §0 en cite quatre.*

1. **« DeWALT est fini à 100 % »** — chiffre pris sur le balayage **MAKITA**.
   DeWALT était à **99,34 %**. C'est la faute qui a déclenché tout le reste.
2. **« 759 fiches jamais vues »** — cherchées dans `unknown`, où une fiche
   appariée ne va **jamais**.
3. **« l'instrument de complétude surestime »** — faux, `doublons` est déjà dans
   `luesBrutes` avant bornage.
4. **Le mauvais TYPE d'argument, quatre fois.** `titreContreditFiche` prend une
   **chaîne**, pas la fiche.
5. **Trois motifs jetables faux d'affilée** — 75,1 %, puis 6,3 %, puis 39.
   **Mesure propre : sur les 794 refus, le bogue n'en change AUCUN.**
6. **« je pousse l'historique en une commande »** — impossible, clone superficiel.
7. **« ne pas passer par Import »** — faux, l'Importer crée un dépôt indépendant.

⚠️ **Le garde-sortie m'a repris trois fois** pour un chiffre non mesuré **dans le
tour courant**.

---

# PARTIE VIII — CE QUI EST CONFIRMÉ SAIN, à ne pas rouvrir

| maillon | mesure |
|---|---|
| unicité des sku / racines / identifiants DeWALT | **0** collision sur 1 047 |
| appariement exact | **0** rate sur 3 273 références inconnues |
| appariements souples en production | **0** attribution hasardeuse en attente |
| les gardes de refus | **168 / 169** justifiés |
| `choisirCoutSource` | minimum sur sources **fraîches ET en stock** |
| instrument de complétude | borne et rend l'écart — **ne surestime pas** |
| absence de plafond de variation | **voulu** (D-015). ⛔ **Ne pas réintroduire** |

---

# PARTIE IX — LES RÈGLES GRAVÉES CETTE SESSION

1. **`.claude/PROTOCOLE.md` §0 — AUCUN TRAVAIL À L'AVEUGLE.** Lire la chaîne
   entière avant de la toucher, dans l'ordre nommé. Cite les quatre fautes
   qu'elle interdit.
2. **§5 bis — MA SESSION EST ÉPHÉMÈRE.** Un travail non poussé n'existe pas.
   Pousser dès qu'un lot est fini, commiter avant toute campagne longue, ne rien
   laisser d'important hors du dépôt.
3. **§2.6** *(du 16/08)* — jamais de détour ni de correction isolée : **la
   source, toujours**.

**Documents et portes créés :**

| fichier | rôle |
|---|---|
| `docs/PLAN-FINIR-DEWALT.md` | le plan v2 — 12 défauts, 6 phases |
| `docs/AUDIT-DEWALT-2026-08-16.md` | la vérification chaîne par chaîne + rectificatifs |
| `docs/AUDIT-TRAQUEUR-PARSEUR-2026-08-16.md` | 5 défauts dont deux qui s'annulent |
| `docs/CHAINE-TRAQUEUR.md` | la chaîne en 10 maillons |
| `docs/PROTEGER-LE-CODE.md` | l'exposition mesurée et la procédure |
| `docs/DEWALT-SUFFIXES-A-SOURCER.csv` | les 33 suffixes sans source |
| `archives/balayages/` + `INDEX.md` | **les 2 056 réponses brutes, enfin versées** |
| `scripts/check-marques-suivies.js` | une marque vendue sans plan fait rougir la CI |
| `scripts/check-cartographie.js` | les chiffres de la carte se relisent sur le disque |

⚠️ `docs/CARTOGRAPHIE.md` remise à jour : elle annonçait **207 produits** pour
1 708 et **12 contrôles** pour 65.

---

# PARTIE X — LA PREMIÈRE CHOSE À FAIRE

1. Lire ce document en entier. *(fait, si vous lisez ceci)*
2. Lire `CLAUDE.md`, puis `.claude/PROTOCOLE.md`.
3. `cd pirates-tools && node scripts/ci.js` → **6 demandes ouvertes**, rien d'autre.
4. `node tests/lancer.mjs --noyau` → **151/151, 9/9**.
5. Dire à l'user que la session voit le code, **puis** le laisser basculer Vercel.
6. Reprendre à `docs/PLAN-FINIR-DEWALT.md`, **phase 1.1** — les 33 suffixes,
   avec son aide.

⛔ **Ne rien annoncer comme mesuré sans avoir relancé la commande dans le tour
courant.** C'est la faute la plus fréquente de cette session, et le garde-sortie
la refusera.
