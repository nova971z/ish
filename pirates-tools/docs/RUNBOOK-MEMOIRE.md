# RUNBOOK — RESTRUCTURATION DE LA MÉMOIRE PROJET
## Le plan d'exécution que je suis à la lettre, étape par étape

> **Ce document n'est pas le plan stratégique** (`docs/PLAN-MEMOIRE-ET-ENTONNOIR.md`),
> c'est sa **procédure d'exécution**. Chaque étape porte ses commandes exactes,
> son résultat attendu exact, ce qu'il faut faire si ça ne correspond pas, et
> son geste d'annulation.
>
> Rédigé le 28/07/2026. **Aucune étape n'est commencée.**
>
> ⛔ **CHANTIER SUSPENDU** — l'user signale le 29/07 que `pirates-tools.com`
> affiche une **page noire**. Aucune étape de ce runbook ne démarre tant que le
> site n'est pas rétabli. Vérifié côté code : `app.js`, `styles.css`,
> `index.html`, `sw.js`, `api/` **intacts** (local et 8 derniers commits), le
> site **boote sans erreur** en local, les 3 empreintes CSP sont **valides**,
> l'`APP_SHELL` ne précache aucun fichier absent, versions alignées
> (`pt-v534`/`534`/`?v=534`), CI **6 vertes sur 6**. Diagnostic en attente de
> l'état du déploiement Vercel, que je ne peux pas consulter d'ici.

---

# 🛑 LES SEPT GARDE-FOUS — à relire avant CHAQUE étape

Ils existent parce que chacun correspond à une faute **réellement commise** dans
ce projet, pas à une précaution théorique.

### G1 — Aucun chiffre sans sa commande
Tout nombre écrit dans un document produit ici porte la commande qui le produit.
**Faute d'origine** : la v1 du plan fondations contenait **quatre chiffres faux**,
tous sortis de mémoire.

### G2 — Aucun exemple sans exécution préalable
Tout numéro de ligne, nom de fonction ou chemin cité est **vérifié par `grep`
avant d'être écrit**. **Faute d'origine** : le plan v4 citait
`lvPanelAccord` à `app.js:6012–6118` — il est à **6167**. Et
`course-goods-paid` à `api/contact.js:412–470` — il est à **1030**. Deux
exemples inventés dans un document dont le premier principe interdit
précisément cela.

### G3 — Aucun déplacement sans preuve mécanique de la destination
Une règle retirée du journal doit être **retrouvable par une commande** dans son
nouveau fichier. Un script le vérifie, il ne suffit pas d'y croire.
**Risque mesuré** : **55 lignes de règle** sont enfouies dans des sections de
récit. Un découpage naïf les perdrait en silence.

### G4 — Aucune suppression, uniquement des déplacements
Contrôle : la somme des lignes des fichiers produits ≥ le fichier d'origine.
**Faute évitée de justesse** : la copie verbatim (étape 1) est faite **avant**
toute coupe, pas après.

### G5 — Point d'arrêt obligatoire
Si un « résultat attendu » ne correspond pas, **je m'arrête**, je le signale, et
je n'improvise pas de contournement. **Faute d'origine** : j'ai transformé un
bouton cassé en « aller au catalogue » au lieu de chercher la cause — masquer un
symptôme au lieu de le traiter.

### G6 — Toute nouvelle porte est prouvée faillible
On la casse volontairement, elle doit rougir, on remet en état.
**Faute d'origine** : un garde-fou ajouté dans `showDetail` était
**inatteignable** — le sabotage ne le faisait jamais échouer. *Une vérification
qu'on ne parvient pas à faire échouer est une vérification qui ne vérifie rien.*

### G7 — Jamais d'ancrage sur une donnée ni sur une formulation
On teste ce qui doit **rester vrai**, pas ce qui est vrai aujourd'hui.
**Faute d'origine** : **18 harnais** dénonçaient comme défauts des décisions de
l'user ou des améliorations du site, parce qu'ils figeaient un nombre de
produits, un montant, ou une tournure de phrase.

---

# 📊 ÉTAT MESURÉ AU 28/07/2026 — le point de départ

Toutes ces valeurs sont re-mesurées **au début de l'étape 1** ; si elles ont
bougé, c'est le document qui est corrigé, jamais la mesure qui est arrondie.

| Mesure | Valeur | Commande |
|---|---|---|
| `CLAUDE.md` | **1 499 lignes · 113 672 octets · 45 sections** | `wc -l CLAUDE.md ; wc -c CLAUDE.md ; grep -c '^## ' CLAUDE.md` |
| Répartition | journal **73,5 %** · règles 12,2 % · état 9,4 % · décisions 3,3 % · aiguillage 1,5 % | classement par bornes de section |
| Règles enfouies dans le journal | **55 lignes** | détection par marqueurs, §étape 2 |
| Documents dans `docs/` | **22** (432 Ko) | `ls docs/*.md \| wc -l` |
| Cités depuis `CLAUDE.md` | **6** | `grep -oE 'docs/[^ ]+\.md' CLAUDE.md \| sort -u \| wc -l` |
| **Orphelins** | **16** | 22 − 6 |

⚠️ **Le nombre d'orphelins a AUGMENTÉ pendant le chantier** : il était de 11 au
moment de la rédaction du plan, il est de **16**. Mes propres livrables
(`DECISIONS.md`, `TRI-SCRATCHPAD.md`, `TRI-SCRATCHPAD-INVENTAIRE.md`,
`AVANCEMENT-FONDATIONS.md`, `RUNBOOK-MEMOIRE.md`) ne sont cités nulle part. Je
l'écris plutôt que de le laisser découvrir.

---

# LES ÉTAPES

---

## ÉTAPE 1 — RE-MESURER, et refuser de partir sur un chiffre périmé

**Objectif.** Aucune étape ne commence sur des valeurs supposées.

**Commandes**
```bash
cd pirates-tools
wc -l ../CLAUDE.md && wc -c ../CLAUDE.md && grep -c '^## ' ../CLAUDE.md
ls docs/*.md | wc -l
grep -oE 'docs/[A-Za-z0-9._-]+\.md' ../CLAUDE.md | sort -u | wc -l
node scripts/ci.js | tail -1
git status --porcelain | wc -l
```

**Résultat attendu**
- `git status` rend **0** (arbre propre — sinon on ne sait pas ce qu'on modifie)
- `ci.js` est **vert**
- les autres valeurs sont **notées**, quelles qu'elles soient

**Si ça ne correspond pas** → **G5** : arbre sale ou CI rouge = **arrêt**. On
règle d'abord, on ne restructure pas par-dessus.

**Preuve de fin** : les 6 valeurs sont écrites dans le compte rendu de session.
**Annulation** : néant (lecture seule).

---

## ÉTAPE 2 — LE FILET : copier AVANT de couper

**Objectif.** Rendre la perte d'information **impossible par construction**, et
non « improbable par attention ».

**Commandes**
```bash
cd /home/user/ish
{ printf '%s\n' \
  '# JOURNAL DU PROJET — copie intégrale de la mémoire au 28/07/2026' \
  '' \
  '> Ce fichier est la copie VERBATIM de CLAUDE.md avant sa restructuration.' \
  '> Il existe pour une seule raison : garantir que le découpage ne perd RIEN.' \
  '> Aucune ligne ne sera jamais supprimée ici.' \
  '' ; cat CLAUDE.md ; } > pirates-tools/docs/JOURNAL.md
```

**Vérification — mécanique, pas déclarative**
```bash
diff <(tail -n +6 pirates-tools/docs/JOURNAL.md) CLAUDE.md && echo "IDENTIQUE"
```

**Résultat attendu** : la sortie affiche exactement `IDENTIQUE`, sans aucune
ligne de différence.

**Si ça ne correspond pas** → **G5** : arrêt. Le filet doit être parfait avant
toute coupe, sinon il ne sert à rien.

**Commit** : `fondations(1): filet — copie verbatim de CLAUDE.md`, **ce commit
ne contient QUE cette copie**.
**Annulation** : `git revert`. Rien d'autre n'a bougé.

---

## ÉTAPE 3 — EXTRAIRE LES 55 RÈGLES ENFOUIES *(l'étape la plus délicate)*

**Objectif.** Aucune de ces 55 lignes ne disparaît en silence.

### 3.1 — Créer l'outil de détection (versionné, pas jetable)
`scripts/regles-enfouies.js` : liste les lignes de sections de **journal**
portant un marqueur d'impératif — `RÈGLE`, `⛔`, `JAMAIS`, `TOUJOURS`,
`OBLIGATOIRE`, `PIÈGE`, `LEÇON`, `interdit`, `non négociable`, `GRAVÉ`.

```bash
node scripts/regles-enfouies.js
```
**Résultat attendu** : **55** lignes, avec numéro et section d'origine.
**Si le compte diffère** → **G5** : arrêt. Soit `CLAUDE.md` a changé, soit ma
détection est fausse. On tranche **avant** de continuer.

### 3.2 — Traiter les 55, une par une, sans exception
Chacune reçoit **exactement une** issue, écrite dans
`docs/EXTRACTION-REGLES.md` :

| Issue | Signification |
|---|---|
| **PROMUE** | devient une règle, reformulée à l'impératif présent, dans un fichier de `.claude/rules/` |
| **NARRATIVE** | reste dans le journal — **et j'écris pourquoi** elle n'est pas opposable |
| **DÉJÀ COUVERTE** | existe ailleurs (règle ou contrôle CI) — **je note où**, vérifié par `grep` (**G2**) |
| **PÉRIMÉE** | la décision a été renversée depuis — **je note par quoi** |

⚠️ **Piège identifié** : certaines de ces 55 ont été **renversées** (le bandeau
cookies, l'auto-ouverture des fiches). **Promouvoir une règle morte serait pire
que la perdre** : elle contredirait la règle vivante, et je choisirais alors
l'une des deux au hasard. Croisement obligatoire avec `docs/DECISIONS.md`.

⚠️ **Second piège** : viser **≤ 25 règles promues**. 55 règles séparées font un
pavé que personne ne lit. On regroupe par sujet.

### 3.3 — Relecture humaine des sections de journal
La détection par marqueurs **rate** les règles formulées sans mot-clé (« il
faut… », « on ne peut pas… »). Je relis les **29 sections de journal** et je
**déclare le nombre de lignes réellement relues**.

### 3.4 — La porte qui rend la perte impossible
`scripts/check-memoire.js` rejoue la détection sur `docs/JOURNAL.md` et
**échoue** si une ligne marquée n'est ni promue, ni listée comme narrative
justifiée.

**Sabotage obligatoire (G6)** : remettre une règle dans le journal sans la
promouvoir → la CI doit rougir et **nommer la ligne**.

**Preuve de fin**
- [ ] les 55 ont une issue écrite, **aucune sans décision**
- [ ] `check-memoire.js` vert **et prouvé faillible**
- [ ] le compte de lignes relues à la main est déclaré

---

## ÉTAPE 4 — LE REGISTRE DES DÉCISIONS

**Objectif.** Qu'aucune décision renversée ne cohabite avec sa version d'origine.
Sans cela, **j'applique l'une des deux au hasard** — ce n'est pas une question
de propreté mais de fiabilité.

`docs/DECISIONS.md` **existe déjà** (D-001, D-002, D-003 du 28/07). Il s'agit
de le compléter.

**À y transférer**, chacune avec motif, date, et preuve dans le code :

| Source | Nombre |
|---|---|
| les 3 sections DÉCISIONS de `CLAUDE.md` | 3 |
| les **5 renversements** historiques | 5 |
| les décisions du plan fondations (minification, catalogue, numérotation) | 3 |
| celles que l'étape 3 fait remonter | ? |

**Les 5 renversements à chaîner** — vérifiés dans `CLAUDE.md` :
1. promos interdites → autorisées sous traqueur
2. bandeau cookies masqué → affiché
3. fiche qui s'ouvre seule → signet
4. sélecteur de rôle ajouté → supprimé
5. SMS → abandonné au profit de l'e-mail + TOTP

**Contrôle** : aucune paire ACTIVE ↔ ACTIVE contradictoire.
**Sabotage (G6)** : remettre une décision renversée en ACTIVE → la CI rougit.

---

## ÉTAPE 5 — LES RÈGLES À PÉRIMÈTRE

**Objectif.** Qu'une règle se charge **au moment où elle sert**, sans que
personne ait à y penser.

⚠️ **Le mécanisme est VÉRIFIÉ** (étape 1 du plan mémoire, 28/07) : règle jetable
posée, sentinelle apparue **uniquement** à l'ouverture du fichier visé, jamais
avant, jamais sur un autre fichier `api/`. Claude Code 2.1.220.

| Fichier | `paths:` | Plafond |
|---|---|---|
| `.claude/rules/argent.md` | `api/**` | 120 l. |
| `.claude/rules/livraison.md` | `api/contact.js`, `api/_lib/courses.js` | 120 l. |
| `.claude/rules/produits.md` | `products.json`, `images/**`, `models/**` | 120 l. |
| `.claude/rules/front.md` | `app.js`, `styles.css`, `index.html`, `sw.js` | 120 l. |

**Vérification** : `/context` sur une session neuve → **aucune** règle chargée ;
après ouverture du fichier visé → **la bonne** règle chargée. **Mesuré, pas
supposé.**

**Pièges**
- ⚠️ un `paths:` trop large (`**/*.js`) annule tout le gain
- ⚠️ une règle dupliquée entre deux fichiers **dérivera** → elle vit à **un
  seul** endroit, les autres la citent
- ⚠️ **aucun secret** dans une règle → contrôle de motifs (`sk_`, `AIza`,
  `private_key`)
- ⚠️ une règle qui cite un **numéro de ligne** se périme → les règles citent des
  **noms**, jamais des numéros (**G7**)

---

## ÉTAPE 6 — `CLAUDE.md` DEVIENT UN AIGUILLAGE (≤ 80 lignes)

**Ce qu'il contient — et rien d'autre**
1. trois lignes de contexte (quoi, où, branche)
2. la **table de décision** : « tu touches à X → lis Y »
3. les 3–4 règles vraiment universelles
4. **la procédure de secours** si `ou.js` est cassé ou absent
5. le renvoi vers `docs/AVANCEMENT-FONDATIONS.md` comme premier fichier à ouvrir

**Ce qu'il ne contient JAMAIS** : une règle métier, un récit, une date, un
`@import`.

⚠️ **Pourquoi pas d'`@import`** : un fichier importé est chargé au lancement
**comme s'il était collé dedans**. Ça n'allège rien, ça déplace. Les documents
sont nommés **entre accents graves**, ce qui empêche justement l'import.

**Preuve de fin**
```bash
wc -l CLAUDE.md                                        # ≤ 80
find . -name CLAUDE.md -not -path '*/node_modules/*' | wc -l   # = 1
grep -c '^@' CLAUDE.md                                 # = 0
```

---

## ÉTAPE 7 — L'ÉTAT VIVANT (`docs/ETAT.md`)

**Objectif.** Sortir de la mémoire permanente les **141 lignes** qui ne sont ni
règle, ni récit, ni décision : ce sont des **choses à faire**.

**Contenu** : checklist pré-lancement, « à faire plus tard », état de
l'infrastructure, actions qui attendent l'user.

⚠️ **Piège principal** : un « à faire » **déjà fait** est pire qu'une absence de
liste — il fait refaire le travail. Chaque entrée porte une **preuve
vérifiable** (commande, identifiant de commit). Sans preuve → marquée
« non vérifié ».

---

## ÉTAPE 8 — `scripts/ou.js` — L'ENTONNOIR

**Objectif.** Une commande qui répond à « je veux faire X », et qui **contraint**
au lieu de seulement localiser.

⚠️ **Granularité FONCTION, pas zone** — décision **D-003** :
les **434 noms de fonction** déjà présents donnent un repère tous les
**34 lignes pour 0 Ko**, contre 97 lignes pour **+1,36 Ko livrés** avec des
repères de zone. **Aucune ligne de `app.js` n'est modifiée.**

**Ce que la commande affiche** — cinq blocs, jamais une réponse partielle
silencieuse : où · invariants applicables · ce qui protège · pièges déjà payés ·
décisions en vigueur. Plus un sixième : **ce que « fini » veut dire ici**.

**Pièges**
- ⚠️ l'index est le seul élément écrit à la main → **porte CI** : chaque
  fonction et chaque fichier nommés doivent **exister** (**G2**)
- ⚠️ homonymes → afficher **toutes** les correspondances, signaler l'ambiguïté
- ⚠️ intention introuvable → **ne jamais répondre « rien »** : proposer les
  entrées proches et demander d'ajouter l'intention. Un outil qui répond « rien »
  se fait contourner à la troisième tentative.

---

## ÉTAPE 9 — LES PORTES DE LA MÉMOIRE

| Porte | Refuse | Sabotage (G6) |
|---|---|---|
| M1 | `CLAUDE.md` > 80 lignes | ajouter 20 lignes |
| M2 | plus d'un `CLAUDE.md` | en créer un dans `pirates-tools/` |
| M3 | un `@import` dans `CLAUDE.md` | en ajouter un |
| M4 | un document de `docs/` cité nulle part | créer un orphelin |
| M5 | une cible d'`INDEX.md` inexistante | renommer une fonction |
| M6 | une règle marquée dans le journal, ni promue ni justifiée | remettre une règle |
| M7 | deux décisions ACTIVE contradictoires | réactiver une décision renversée |
| M8 | une règle dupliquée entre deux fichiers de `.claude/rules/` | copier un paragraphe |
| M9 | un secret dans un fichier de règles | y écrire `sk_test_…` |

⚠️ **M4 va rougir immédiatement** : il y a **16 orphelins**, dont **5 que j'ai
créés moi-même**. C'est voulu — la porte doit être posée **après** le rangement
de l'étape 10, pas avant.

⚠️ **Aucune porte ne doit exiger d'exception** sur l'état obtenu. Si elle en
réclame une dès le premier jour, elle est mal conçue et on la reprend.

**Budget de durée** : `ci.js` prend **76 à 130 ms** (5 relevés : 130 · 76 · 117 ·
77 · 113). Plafond **3 s**.
⚠️ La première version de ce runbook annonçait « ~85 ms » — **une mesure
unique**, prise sur un relevé favorable. Un relevé isolé n'est pas une mesure :
le suivant a donné 333 ms. **G1 s'applique à ce document comme aux autres.**

---

## ÉTAPE 10 — RANGER LES 22 DOCUMENTS

Chaque fichier de `docs/` reçoit **une** étiquette :

| Étiquette | Signification |
|---|---|
| **VIVANT** | source de vérité, cité depuis l'aiguillage |
| **ARCHIVE** | terminé, déplacé dans `docs/archives/` |
| **À TRANCHER** | l'user décide |

⚠️ **Aucun document n'est supprimé.** Archiver, c'est déplacer.
⚠️ **Ce runbook se range lui-même** : VIVANT jusqu'à l'étape 12, ARCHIVE ensuite.

---

## ÉTAPE 11 — L'ÉPREUVE À FROID *(la seule qui prouve que ça marche)*

Les étapes 1 à 10 vérifient la **forme**. Celle-ci vérifie l'**usage**.

**Protocole**
1. **10 intentions tirées au sort** parmi les sujets réels du site.
2. Pour chacune : partir **à froid**, n'ouvrir que `ou.js`, **compter** les
   fichiers ouverts avant d'arriver au bon endroit.
3. **Deux sabotages d'usage** : une intention absente de l'index (l'outil doit
   le dire, pas répondre « rien ») ; une fonction renommée (la CI rougit).

| Mesure | Aujourd'hui | Cible |
|---|---|---|
| fichiers ouverts pour trouver où intervenir | 3 à 6 | **≤ 1** |
| lignes de mémoire chargées d'office | **1 499** | **≤ 80** + règles du domaine |
| règles opposables retrouvables en une commande | 0 | **toutes** |

**Le chiffre qui juge tout le chantier** : le contexte réellement chargé,
mesuré par `/context`, avant et après.

---

## ÉTAPE 12 — MESURER ET REFERMER

**Livrables**
1. `docs/AVANCEMENT-FONDATIONS.md` à jour
2. `docs/PLAN-MEMOIRE-ET-ENTONNOIR.md` : ses 12 étapes marquées faites
3. **Le compte rendu chiffré** : contexte avant/après, lignes déplacées, règles
   promues, portes créées, sabotages réussis
4. Ce runbook passe en **ARCHIVE**

---

# 📋 RÉCAPITULATIF — ordre, réversibilité, risque

| # | Étape | Touche au code du site ? | Annulation |
|---|---|---|---|
| 1 | Re-mesurer | non | — |
| 2 | Filet (copie verbatim) | non | `git revert` |
| 3 | Extraire les 55 règles | non | `git revert` |
| 4 | Registre des décisions | non | `git revert` |
| 5 | Règles à périmètre | non | `git revert` |
| 6 | `CLAUDE.md` = aiguillage | non | `git revert` |
| 7 | État vivant | non | `git revert` |
| 8 | `scripts/ou.js` | non | `git revert` |
| 9 | Les 9 portes | non | `git revert` |
| 10 | Ranger les 22 documents | non | `git revert` |
| 11 | Épreuve à froid | non | — |
| 12 | Mesurer et refermer | non | `git revert` |

## 🛡 Pourquoi ce chantier ne peut pas casser le site
- **Aucune étape ne modifie `app.js`, `styles.css`, `index.html`, `api/` ni `sw.js`.**
- **Donc aucun bump de Service Worker** — le geste qui a produit l'écran noir
  v314 et le mélange stale/frais v374 n'est jamais posé.
- **Donc aucun impact sur les budgets P8** (400 Ko de total, 871 Ko par image).
- Chaque étape est **un commit annulable seul**, laissant `ci.js` vert.
- Les seuls fichiers créés sont de la **documentation**, des **scripts de
  contrôle** et **une configuration d'outil**.

## ⛔ Ce que ce runbook ne fait PAS
- ❌ il ne pose **aucun repère de zone** dans le code (décision **D-003**)
- ❌ il ne **supprime aucun document** : archiver, c'est déplacer
- ❌ il ne **bloque pas le lancement commercial** : mentions légales, médiateur,
  Stripe LIVE restent indépendants et prioritaires si l'user décide de lancer
