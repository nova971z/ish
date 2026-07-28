# PLAN — MÉMOIRE PROJET & ENTONNOIR v1
## Faire de `CLAUDE.md` un aiguillage, et de la recherche un entonnoir

> **État : PLAN SOUMIS À VALIDATION — rien n'est appliqué.**
> Rédigé le 28/07/2026. 12 étapes numérotées, chacune avec ses livrables, ses
> pièges, sa preuve de réussite et son geste d'annulation.

---

## 🚨 AVERTISSEMENT PRÉALABLE — un risque qui court pendant qu'on fait ceci

**La phase 0 du plan fondations n'a pas été faite.** Les **60 harnais
(~959 assertions)** qui protègent la livraison, les paiements et la 2FA vivent
toujours dans `/tmp/claude-0/…` — **hors du dépôt**. Un recyclage du conteneur
les détruit, et avec eux toute capacité de prouver une non-régression sur ces
parcours.

Ce chantier-ci ne les met pas en danger, mais **il ne les sauve pas non plus**.
Je le signale parce que c'est le seul risque du projet qui soit à la fois
**immédiat et irréversible**. L'user décide : sauver les harnais d'abord
(1 à 2 sessions), ou accepter le risque et faire la mémoire d'abord.

---

## 📊 CE QUE J'AI MESURÉ AVANT D'ÉCRIRE CE PLAN

Toutes les commandes sont en annexe (principe P-C).

### `CLAUDE.md` aujourd'hui
**1 499 lignes · 113 672 octets · 45 sections · 76 titres.**
Chargé **intégralement, à chaque session**, avant que je n'aie lu une seule
ligne de code. Ordre de grandeur : **~30 000 jetons de contexte** consommés
d'entrée (113 Ko de français ≈ 3,5 à 4 octets par jeton).

### Ce qu'il y a dedans, classé mécaniquement

| Nature | Lignes | Part | Sections |
|---|---|---|---|
| **JOURNAL** — récit au passé | **1 099** | **73,5 %** | 29 |
| **RÈGLES** — impératif au présent | 183 | 12,2 % | 8 |
| **ÉTAT / À FAIRE** — vivant, à jour | 141 | 9,4 % | 3 |
| **DÉCISIONS** — choix tranchés | 49 | 3,3 % | 3 |
| **AIGUILLAGE** — renvois | 23 | 1,5 % | 2 |

**Trois quarts du fichier racontent le passé.** Pour 183 lignes de règles
réellement opposables, j'en charge 1 499.

### 🔴 Le chiffre qui commande tout le plan
**55 lignes de RÈGLE sont enfouies dans des sections de JOURNAL.** Exemples
mesurés :

| Ligne | Section (journal) | Règle qui y est piégée |
|---|---|---|
| 703 | *Session perf affichage 3D* | « **jamais réutiliser un numéro** de version » |
| 530 | *Session 3 bugs post-sécurité* | « **TOUJOURS merger master** après vérification » |
| 521 | *Régression 3D post-sécurité* | « toute CSP sur un site 3D **DOIT** autoriser `worker-src blob:` » |
| 406 | *Session audit boutons* | « `behavior:'instant'` — **OBLIGATOIRE**, le smooth fausse les lectures » |
| 422 | *Session résilience écran noir* | « **PIÈGE TEST** : `div[role=alert]` matche `#stripeCardError` en premier » |

→ **Un découpage naïf** (« je déplace toutes les sections `Session…` vers
`JOURNAL.md` ») **perdrait ces 55 règles en silence.** C'est le danger central
de ce chantier, et l'étape 2 n'existe que pour ça.

---

## 🎯 CE QU'ON CONSTRUIT — la cible en une image

```
  AVANT                                  APRÈS
  ─────                                  ─────
  CLAUDE.md 1 499 lignes                 CLAUDE.md ≤ 80 lignes
  ├─ 73 % de journal                     └─ un AIGUILLAGE, rien d'autre
  ├─ règles noyées dedans                        │
  ├─ 11 documents orphelins                      ├─ .claude/rules/argent.md ─────┐
  └─ chargé en entier, toujours                  ├─ .claude/rules/livraison.md   │ chargés
                                                 ├─ .claude/rules/produits.md    │ TOUT SEULS
  Pour trouver où intervenir :                   └─ .claude/rules/front.md ──────┘ au bon moment
  3 à 6 fichiers ouverts, au flair
                                         docs/  INVARIANTS · DÉCISIONS · JOURNAL
                                                ÉTAT · INDEX · CARTOGRAPHIE

                                         Pour trouver où intervenir :
                                         $ node scripts/ou.js "modifier un prix"
                                         → l'endroit + les interdits + ce qui protège
```

---

## 🔻 L'ENTONNOIR v1 — ce qu'il est, et ce qu'il n'est PAS encore

Le plan fondations décrit un entonnoir à **zones numérotées** posées dans le
code (`// ══ @zone PAY-03 ══`). **Ce n'est PAS ce qu'on construit ici**, et
c'est délibéré :

| | Entonnoir v1 (ce plan) | Entonnoir v2 (plan fondations, phase 5) |
|---|---|---|
| granularité | **le fichier + la fonction** | la zone (~100 lignes) |
| touche au code ? | **NON, pas un octet** | oui : ~150 commentaires |
| bump du Service Worker ? | **non** | **oui, obligatoire** |
| budget P8 (`app.js` à 205/205) | **aucun impact** | +1,36 Ko → bloqué tant que la phase 3 n'a pas libéré la place |
| dépend de quoi ? | de rien | des phases 0, 3 et 4 |
| utilisable quand ? | **tout de suite** | dans ~10 sessions |

**Le mécanisme est le même** — et c'est ce qui rend la v1 légitime : *on ne
stocke jamais un numéro de ligne, on le calcule au moment où on le demande.*
La v1 le fait à partir du **nom de la fonction** (`grep -n "function lvPanelPay"`),
la v2 le fera à partir du **nom de la zone**. Prouvé mesuré : **70 ms** pour
résoudre un repère dans un fichier de 14 600 lignes.

→ **La v1 n'est pas un brouillon jetable : c'est la v2 sans les ancres.**
Le jour où les zones existent, `ou.js` gagne un niveau de finesse — son
interface et ses contrôles ne changent pas.

---

## Les principes, repris du plan fondations

- **P-A** — Une documentation non vérifiée est un mensonge en préparation.
- **P-B** — Ce qui peut être exécuté ne doit pas être écrit.
- **P-C** — Aucun chiffre n'entre dans un document sans avoir été mesuré.
- **P-D** *(nouveau, propre à ce chantier)* — **On ne construit pas sur une
  hypothèse non vérifiée.** Toute l'architecture cible repose sur un mécanisme
  (`.claude/rules/` avec `paths:`) que je connais **par la documentation, pas
  par l'expérience**. On le teste sur un cas jetable **avant** d'y transporter
  quoi que ce soit. C'est l'objet de l'étape 1.

---

# LES 12 ÉTAPES

---

## ÉTAPE 1 — Vérifier l'hypothèse technique AVANT de bâtir dessus

**Pourquoi en premier.** Tout le plan repose sur une affirmation de la
documentation : une règle rangée dans `.claude/rules/` avec un en-tête
`paths:` se charge **toute seule** quand j'ouvre un fichier correspondant, et
**reste invisible** le reste du temps. Si c'est faux — ou si ça ne marche pas
dans cet environnement précis — l'architecture entière s'effondre, et je
l'apprendrais après avoir tout déplacé.

**Livrables**
1. `.claude/rules/_essai.md` — une règle jetable, périmètre `paths: ["api/_lib/postal.js"]`,
   contenant une phrase reconnaissable et inoffensive.
2. Un compte-rendu écrit de trois observations.

**Protocole — trois observations, pas une**
| # | Situation | Attendu |
|---|---|---|
| A | session neuve, `/context`, sans ouvrir aucun fichier | la règle **n'apparaît PAS** |
| B | j'ouvre `api/_lib/postal.js`, puis `/context` | la règle **apparaît** |
| C | j'ouvre un autre fichier `api/` non visé | la règle **n'apparaît PAS** |

**Pièges**
- ⚠️ **L'observation par ouï-dire** : je ne dois pas conclure « ça marche »
  parce que je me sens influencé. Seule la liste de `/context` fait foi.
- ⚠️ **La version de l'outil** : le mécanisme dépend de la version de Claude
  Code. Le compte-rendu note la version constatée.
- ⚠️ **Le piège du périmètre trop large** : `**/*.js` chargerait partout, donc
  reviendrait à tout mettre dans `CLAUDE.md`. L'essai porte volontairement sur
  **un seul fichier**, pour que le résultat soit sans ambiguïté.

**Preuve de réussite** : les trois observations sont conformes.
**Si l'hypothèse est fausse** : on bascule sur le repli — les règles vivent dans
`docs/` et `CLAUDE.md` les nomme ; l'aiguillage redevient déclaratif (donc plus
faible), et **on l'écrit** au lieu de le taire. Le reste du plan tient quand même.
**Annulation** : `rm .claude/rules/_essai.md`. Coût nul.

---

## ÉTAPE 2 — Le filet : copier AVANT de couper

**Pourquoi.** La règle « aucune suppression, uniquement des déplacements » est
un vœu tant qu'on coupe et recolle à la main. La seule façon de la **garantir**
est de copier l'intégralité d'abord, puis de ne retirer que ce qu'on a
formellement replacé ailleurs.

**Livrables**
1. `docs/JOURNAL.md` = **copie VERBATIM** de `CLAUDE.md` actuel, à l'octet près,
   avec un en-tête expliquant ce que c'est.
2. Un commit dédié, **avant toute modification** de `CLAUDE.md`.

**Preuve de réussite — mécanique, pas déclarative**
- [ ] `diff <(tail -n +N docs/JOURNAL.md) CLAUDE.md` rend **0 différence**
      (N = les lignes d'en-tête ajoutées)
- [ ] le commit ne contient **que** cette copie

**Pièges**
- ⚠️ **La copie « améliorée »** : reformuler pendant la copie, c'est déjà perdre.
  Verbatim veut dire verbatim.
- ⚠️ **L'ordre** : ce commit passe **avant** l'étape 3. Si on coupe d'abord, le
  filet n'existe pas au moment où on en a besoin.

**Annulation** : `git revert`. Aucun risque — rien d'autre n'a bougé.

---

## ÉTAPE 3 — Extraire les 55 règles enfouies *(l'étape la plus délicate)*

**Pourquoi.** C'est ici que ce chantier peut détruire de la valeur. 55 lignes
de règle vivent dans des sections de récit. Elles ont été payées cher — chacune
vient d'une panne réelle.

**Méthode — mécanique d'abord, jugement ensuite**
1. Le script `scripts/regles-enfouies.js` liste les lignes de journal portant un
   marqueur d'impératif (`RÈGLE`, `⛔`, `JAMAIS`, `TOUJOURS`, `OBLIGATOIRE`,
   `PIÈGE`, `LEÇON`, `interdit`, `non négociable`, `GRAVÉ`). **Aujourd'hui : 55.**
2. Je traite **chacune** des 55, sans exception, et je lui donne **une** issue :
   - **promue** → elle part dans un fichier de règles, reformulée à l'impératif présent ;
   - **narrative** → elle reste dans le journal, et j'écris **pourquoi** elle
     n'est pas une règle opposable ;
   - **déjà couverte** → elle existe déjà ailleurs (règle ou contrôle CI) ; on
     note où.
3. Le tableau des 55 décisions est écrit dans `docs/EXTRACTION-REGLES.md`.

**La porte qui empêche la perte silencieuse**
`scripts/check-memoire.js` rejoue la recherche de marqueurs sur `docs/JOURNAL.md`
et **échoue** si une ligne marquée n'est ni promue, ni listée comme narrative
justifiée. → *Impossible* d'oublier une règle sans que la CI ne le dise.

**Pièges**
- ⚠️ **Le marqueur manqué** : une règle formulée sans mot-clé (« il faut… »)
  échappe au script. → Après la passe mécanique, **relecture humaine des
  29 sections de journal**, et le compte de lignes relues est déclaré.
- ⚠️ **La sur-promotion** : promouvoir 55 lignes en 55 règles crée un pavé que
  personne ne lit. → Regroupement par sujet ; viser **≤ 25 règles nouvelles**,
  fusionnées avec les 183 lignes existantes.
- ⚠️ **La règle périmée** : certaines de ces 55 ont été **renversées** depuis
  (le bandeau cookies, l'auto-ouverture des fiches). Promouvoir une règle morte
  serait pire que la perdre. → Croisement obligatoire avec l'étape 4.

**Preuve de réussite**
- [ ] les 55 lignes ont une issue écrite, aucune sans décision
- [ ] `check-memoire.js` est vert **et prouvé faillible** (on remet une règle
      dans le journal sans la promouvoir : la CI doit rougir)
- [ ] le compte de lignes de journal relues à la main est déclaré

---

## ÉTAPE 4 — Le registre des décisions (`docs/DECISIONS.md`)

**Pourquoi.** La documentation officielle est formelle : deux consignes qui se
contredisent → j'en choisis une **au hasard**. Or au moins **cinq décisions
renversées** cohabitent aujourd'hui avec leur version d'origine.

**Format — une décision par entrée, jamais réécrite**
```
### D-014 — Le paiement de la course ne transite pas par la plateforme
  Statut  : ACTIVE
  Date    : 27/07/2026
  Décidé  : l'user
  Motif   : sortie de l'art. L7342-1 — la plateforme ne fixe ni n'encaisse
  Remplace: D-009 (escrow livreur)
  Preuve  : api/contact.js course-accord-*, aucune ligne de course au débit
```
Une décision renversée passe en `REMPLACÉE PAR D-0NN` — **on ne réécrit jamais**.

**Contenu initial — au minimum**
| Source | Nombre |
|---|---|
| les 3 sections DÉCISIONS de `CLAUDE.md` | 3 |
| les 5 renversements historiques identifiés | 5 |
| les décisions du plan fondations (minification, catalogue, numérotation…) | 5 |
| **les 3 propositions EN SUSPENS** (plafond total, plafond image, ancres) | 3 |
| celles que l'étape 3 fera remonter | ? |

**Pièges**
- ⚠️ **La décision sans motif** : « on ne fait pas X » sans le pourquoi sera
  reproposée dans trois semaines. → Le motif est **obligatoire**.
- ⚠️ **La décision qui n'en est pas une** : une préférence passagère n'est pas
  une décision. → Critère : elle doit avoir été **tranchée explicitement** par
  l'user, ou être une contrainte technique démontrée.
- ⚠️ **Les 3 en suspens** : elles sont marquées `⏳ NON TRANCHÉE`, et la porte
  de l'étape 9 **refuse** qu'une décision reste en suspens plus de 30 jours
  sans être resoumise. Une question sans réponse n'est pas un accord.

**Preuve de réussite**
- [ ] aucune paire ACTIVE ↔ ACTIVE contradictoire (contrôle automatique)
- [ ] chaque décision porte motif, date et preuve dans le code
- [ ] les 5 renversements historiques sont chaînés correctement

---

## ÉTAPE 5 — Les règles à périmètre (`.claude/rules/`)

**Pourquoi.** C'est le seul mécanisme qui charge une règle **au moment où elle
sert**. Sans lui, l'aiguillage dépend de ma discipline — donc c'est un vœu.

**Découpage proposé**, à valider par la mesure de l'étape 1 :

| Fichier | `paths:` | Contenu | Plafond |
|---|---|---|---|
| `argent.md` | `api/**`, `app.js` | prix serveur autoritaire, TVA/octroi, fidélité, Stripe, webhook, remises | 120 l. |
| `livraison.md` | `api/contact.js`, `api/_lib/courses.js` | qui décide quoi, code de remise, photos, litiges, `round`, escrow | 120 l. |
| `produits.md` | `products.json`, `images/**`, `models/**` | prix ×1,15, posters fond sombre, packs 3D, registre des orientations | 120 l. |
| `front.md` | `app.js`, `styles.css`, `index.html`, `sw.js` | jamais de bouton grisé, échec ≠ vide, bump SW, CSP 3D, classes concaténées | 120 l. |

**Pièges**
- ⚠️ **Le périmètre trop large** : `app.js` apparaît dans *argent* **et** *front*.
  Un même fichier peut légitimement déclencher deux règles — mais il faut le
  **mesurer** (`/context`), pas le supposer, et vérifier que le total chargé
  reste raisonnable.
- ⚠️ **La duplication** : une règle dans deux fichiers dérivera. → Une règle
  vit à **un seul endroit** ; les autres la citent par son identifiant.
- ⚠️ **Le secret** : aucune règle ne contient de clé, de jeton ni d'adresse
  privée. Contrôle automatique de motifs (`sk_`, `AIza`, `private_key`…).
- ⚠️ **La règle qui vieillit mal** : une règle qui cite un numéro de ligne se
  périme. → Les règles citent des **noms** (fonction, fichier), jamais des
  numéros. Les numéros, c'est le travail de `ou.js`.

**Preuve de réussite**
- [ ] `/context` : aucune règle chargée sur une session neuve ; la bonne règle
      chargée dès l'ouverture du fichier visé — **vérifié, pas supposé**
- [ ] chaque fichier ≤ 120 lignes
- [ ] aucune règle dupliquée entre deux fichiers (contrôle automatique)

---

## ÉTAPE 6 — `CLAUDE.md` devient un aiguillage (≤ 80 lignes)

**Ce qu'il contient — et rien d'autre**
1. Trois lignes de contexte (quoi, où, branche).
2. **La table de décision** : « tu touches à X → lis Y ».
3. Les 3 ou 4 règles vraiment universelles (qualité, vérification, commit).
4. **La procédure de secours** : quoi faire si `ou.js` est cassé ou absent.
5. Le renvoi vers `docs/AVANCEMENT-*.md` comme premier fichier à ouvrir.

**Ce qu'il ne contient JAMAIS** : une règle métier, un récit, une date, un
`@import` (qui rechargerait le fichier importé au lancement, donc n'allègerait
rien).

**Pièges**
- ⚠️ **L'aiguillage qui n'aiguille pas** : « voir les docs » ne dit pas lequel.
  → Chaque ligne de la table nomme **un** fichier et **une** situation.
- ⚠️ **Le fichier de secours manquant** : si `ou.js` plante, je dois savoir quoi
  faire. → La procédure de secours est **dans** `CLAUDE.md`, pas ailleurs :
  c'est le seul fichier dont je suis sûr qu'il sera chargé.
- ⚠️ **Le second `CLAUDE.md`** : créé par erreur **deux fois** dans l'histoire du
  projet. Un `CLAUDE.md` de sous-dossier ne survit même pas à la compression du
  contexte : il serait contradictoire **et** intermittent. → Porte CI.

**Preuve de réussite**
- [ ] ≤ 80 lignes, **aucune** règle métier, **aucun** `@import`
- [ ] `find . -name CLAUDE.md -not -path "*/node_modules/*" | wc -l` = **1**
- [ ] **Épreuve** : sur 10 situations tirées au sort, la table me dit quoi ouvrir
      **sans hésitation** — mesuré, pas ressenti

---

## ÉTAPE 7 — L'état vivant (`docs/ETAT.md`)

**Pourquoi.** 141 lignes de `CLAUDE.md` ne sont ni règle, ni récit, ni décision :
ce sont des **choses à faire**, dont l'état change. Les laisser dans la mémoire
permanente, c'est recharger une liste de courses à chaque session.

**Contenu** : la checklist pré-lancement (bloquants légaux, Stripe, webhook),
le « à faire plus tard », l'état de l'infrastructure (Identity Platform, Resend,
Cloudflare, Firestore), les actions qui attendent l'user.

**Piège principal**
- ⚠️ **La liste qui ment** : un « à faire » déjà fait est pire qu'une absence de
  liste, parce qu'il fait refaire le travail. → Chaque entrée porte **une preuve
  vérifiable** (une commande, une capture, un identifiant de commit). Une entrée
  sans preuve est marquée « non vérifié ».

**Preuve de réussite**
- [ ] chaque entrée a un état (`à faire` / `fait, prouvé par…` / `non vérifié`)
- [ ] la checklist pré-lancement est intégralement reportée, sans perte

---

## ÉTAPE 8 — `scripts/ou.js` : l'entonnoir v1

**Le cœur du chantier.** Une commande qui répond à *« je veux faire X »*.

**Les quatre étages, sans toucher au code**
```
① INTENTION   « modifier le prix affiché d'un produit »
     ↓  docs/INDEX.md — la seule table écrite à la main
② DOMAINE     ARGENT
     ↓  l'entrée nomme des FONCTIONS et des FICHIERS, jamais des numéros
③ CIBLES      calcPrice (app.js) · pricing.js (api/_lib) · products.json
     ↓  grep à l'instant : 70 ms sur 14 600 lignes
④ LIGNES VIVES  app.js:3901 · api/_lib/pricing.js:44
```

**Ce que la commande affiche — et c'est là qu'elle CONTRAINT**
```
$ node scripts/ou.js "modifier le prix affiché d'un produit"

  DOMAINE   ARGENT
  ICI       app.js:3901          calcPrice()
            api/_lib/pricing.js  (miroir serveur — AUTORITAIRE)
            products.json        (données)

  ⛔ INVARIANTS QUI S'APPLIQUENT
     · le prix débité vient TOUJOURS du catalogue serveur
     · client et serveur doivent rester au centime près

  🛡 CE QUI PROTÈGE CETTE ZONE
     · scripts/check-pricing.js   (parité client/serveur, dans la CI)
     · audit/p5-money

  ⚠️ PIÈGES DÉJÀ PAYÉS ICI
     · price = prix TTC source × 1,15 — jamais un « prix conseillé »
     · un produit priceLocked n'est JAMAIS recalculé

  📌 DÉCISIONS EN VIGUEUR
     · D-003 plus aucun prix saisi à la main (ACTIVE)

  ✅ CE QUE « FINI » VEUT DIRE ICI
     · check-pricing vert · un harnais qui échoue si la parité casse
     · sabotage prouvé · CI verte · bump SW si un asset change
```

**Le dernier bloc est la réponse à « uniquement du code de niveau
institutionnel »** : la commande ne dit pas seulement *où*, elle dit **à quelles
conditions le travail est terminé**. Le niveau d'exigence cesse d'être une
intention pour devenir une sortie de commande.

**Pièges**
- ⚠️ **L'index écrit à la main se périme.** C'est le seul élément non généré du
  système. → Porte CI : **chaque fonction et chaque fichier nommés dans
  `INDEX.md` doivent exister** (`grep` de vérification). Une fonction renommée
  fait rougir la CI le jour même.
- ⚠️ **L'homonyme** : plusieurs fonctions peuvent porter le même nom dans des
  portées différentes. → `ou.js` affiche **toutes** les correspondances plutôt
  que d'en choisir une, et signale l'ambiguïté.
- ⚠️ **L'intention introuvable** : si je cherche une intention absente de
  l'index, la commande ne doit **pas** répondre « rien » — elle doit proposer
  les entrées les plus proches et **me dire d'ajouter l'intention manquante**.
  Un outil qui répond « rien » se fait contourner à la troisième tentative.
- ⚠️ **L'entonnoir qui ment par omission** : s'il oublie un invariant, il donne
  une fausse assurance. → Chaque entrée d'`INDEX.md` déclare explicitement les
  invariants qui s'y appliquent ; l'étape 9 vérifie qu'aucun invariant du
  registre n'est orphelin (rattaché à zéro entrée).

**Preuve de réussite**
- [ ] `node scripts/ou.js "…"` répond en < 1 s sur 10 intentions tirées au sort
- [ ] chaque réponse contient les 5 blocs (où, invariants, protections, pièges,
      décisions) — jamais une réponse partielle silencieuse
- [ ] contrôle CI : 100 % des cibles de l'index existent, **prouvé faillible**
- [ ] aucun invariant du registre n'est rattaché à zéro entrée

---

## ÉTAPE 9 — Les portes de la mémoire (`scripts/check-memoire.js`)

**Pourquoi.** Sans porte, cette architecture se dégrade en trois semaines —
exactement comme la cartographie actuelle.

| Porte | Ce qu'elle refuse | Sabotage qui doit la faire rougir |
|---|---|---|
| M1 | `CLAUDE.md` > 80 lignes | ajouter 20 lignes |
| M2 | plus d'un `CLAUDE.md` dans le dépôt | en créer un dans `pirates-tools/` |
| M3 | un `@import` dans `CLAUDE.md` | en ajouter un |
| M4 | un document de `docs/` cité nulle part | créer un orphelin |
| M5 | une cible d'`INDEX.md` inexistante | renommer une fonction |
| M6 | une règle marquée dans le journal, ni promue ni justifiée | remettre une règle dans le journal |
| M7 | deux décisions ACTIVE contradictoires | remettre une décision renversée en ACTIVE |
| M8 | une règle dupliquée entre deux fichiers de `.claude/rules/` | copier un paragraphe |
| M9 | un secret dans un fichier de règles | y écrire `sk_test_…` |
| M10 | une décision `⏳ NON TRANCHÉE` de plus de 30 jours | vieillir une date |

**Pièges**
- ⚠️ **La porte trop zélée** finit désactivée et emporte la protection réelle.
  → **Aucune porte ne doit exiger d'exception** sur l'état obtenu à l'étape 8.
  Si elle en réclame une dès le premier jour, elle est mal conçue.
- ⚠️ **La durée** : `ci.js` prend **148 ms** aujourd'hui. Plafond **3 secondes**.
  Ces contrôles sont textuels, donc négligeables — mais on le vérifie.
- ⚠️ **La porte non éprouvée ne contrôle rien.** → Les 10 sabotages du tableau
  sont **obligatoires et tracés**, pas optionnels.

**Preuve de réussite**
- [ ] les 10 portes sont vertes sur l'état final, sans aucune exception ajoutée
- [ ] les 10 sabotages sont exécutés et **tous détectés**
- [ ] `node scripts/ci.js` reste sous 3 s

---

## ÉTAPE 10 — Le hook *(optionnel, en dernier, et seulement si utile)*

**Pourquoi en dernier.** Un hook mal réglé devient une gêne permanente. On ne
l'installe **qu'après** avoir vécu avec `ou.js` assez longtemps pour savoir
qu'il est utile.

**Ce qu'il fait** : intercepter une recherche à l'aveugle dans `app.js`,
`styles.css` ou `index.html` et rappeler `node scripts/ou.js`.

**Pièges**
- ⚠️ **L'adresse** : il doit vivre dans **`.claude/settings.json` VERSIONNÉ**.
  Ce fichier **n'existe pas** aujourd'hui (vérifié). Posé dans
  `settings.local.json`, il ne protégerait qu'une machine et disparaîtrait au
  prochain conteneur — le défaut même que ce chantier corrige.
- ⚠️ **Le blocage du travail légitime** : il doit être **contournable par un
  drapeau explicite**, sans quoi il finira supprimé.
- ⚠️ **Le champ d'action** : il ne s'applique qu'aux trois gros fichiers.
  Étendu à tout le dépôt, il deviendrait insupportable.

**Preuve de réussite**
- [ ] le hook se déclenche sur une recherche large dans `app.js`
- [ ] il **ne se déclenche pas** sur une lecture ciblée ni ailleurs
- [ ] le contournement explicite fonctionne
**Annulation** : retirer l'entrée de `.claude/settings.json`. Immédiat.

---

## ÉTAPE 11 — L'épreuve à froid *(la seule qui prouve que ça marche)*

**Pourquoi.** Tous les contrôles précédents vérifient la **forme**. Celui-ci
vérifie l'**usage** : est-ce que je travaille réellement mieux ?

**Protocole**
1. **10 intentions tirées au sort** parmi les sujets réels du site (modifier un
   prix, ajouter un champ à une commande, changer un texte légal, corriger le
   chat livreur, ajouter un produit, toucher à la CSP…).
2. Pour chacune : je pars **à froid**, je n'ouvre que `ou.js`, et je note
   combien de fichiers j'ai dû ouvrir avant d'arriver au bon endroit.
3. **Deux sabotages d'usage** : une intention absente de l'index (l'outil
   doit me le dire et me demander de l'ajouter, pas répondre « rien »), et une
   fonction renommée (la CI doit rougir le jour même).

**Seuils**
| Mesure | Aujourd'hui | Cible |
|---|---|---|
| fichiers ouverts pour trouver où intervenir | 3 à 6 | **≤ 1** |
| lignes de mémoire chargées d'office | 1 499 | **≤ 80** + les règles du domaine |
| règles opposables retrouvables en une commande | 0 | **toutes** |

**Preuve de réussite**
- [ ] 10/10 intentions résolues en **≤ 1 fichier ouvert**
- [ ] les 2 sabotages d'usage se comportent comme prévu
- [ ] **la mesure du contexte réellement chargé** est faite (`/context`) et
      comparée à l'avant : c'est le chiffre qui juge tout le chantier

---

## ÉTAPE 12 — Ranger, mesurer, et refermer

**Livrables**
1. Les 17 documents de `docs/` reçoivent leur étiquette : **VIVANT**,
   **ARCHIVE** (déplacé dans `docs/archives/`), **À TRANCHER** (l'user décide).
   ⚠️ Aucun n'est supprimé : archiver, c'est déplacer.
2. `docs/PLAN-FONDATIONS.md` mis à jour : sa phase 1 est faite, sa phase 5 l'est
   **à moitié** (entonnoir v1 sans les zones).
3. `docs/AVANCEMENT-FONDATIONS.md` créé, avec le point de reprise.
4. **Le compte-rendu chiffré** : contexte avant/après, lignes déplacées, règles
   promues, portes créées, sabotages réussis.

**Piège**
- ⚠️ **Le chantier qui ne se range pas lui-même** : ce plan doit recevoir son
  étiquette comme les autres — **VIVANT** jusqu'à l'étape 12, **ARCHIVE**
  ensuite. Sinon il devient le 18ᵉ orphelin qu'il dénonce.

---

# 📋 RÉCAPITULATIF — ordre, coût, réversibilité

| # | Étape | Sessions | Touche au code du site ? | Annulation |
|---|---|---|---|---|
| 1 | Vérifier `.claude/rules/` | 0,2 | non | `rm` du fichier d'essai |
| 2 | Copier avant de couper | 0,2 | non | `git revert` |
| 3 | Extraire les 55 règles enfouies | **1 à 1,5** | non | `git revert` |
| 4 | Registre des décisions | 0,5 | non | `git revert` |
| 5 | Règles à périmètre | 0,5 | non | `git revert` |
| 6 | `CLAUDE.md` = aiguillage | 0,3 | non | `git revert` |
| 7 | État vivant | 0,3 | non | `git revert` |
| 8 | `scripts/ou.js` — entonnoir v1 | **1** | non | `git revert` |
| 9 | Les 10 portes + 10 sabotages | 0,5 | non | `git revert` |
| 10 | Hook *(optionnel)* | 0,3 | non | retirer l'entrée |
| 11 | Épreuve à froid | 0,5 | non | — |
| 12 | Ranger et mesurer | 0,3 | non | `git revert` |
| | **Total** | **~6 sessions** | **AUCUNE étape ne modifie `app.js`, `styles.css`, `index.html` ni `api/`** | |

## 🛡 Pourquoi ce chantier ne peut pas casser le site
- **Aucune étape ne touche au code exécuté.** Ni `app.js`, ni `styles.css`,
  ni `index.html`, ni `api/`, ni `sw.js`.
- **Donc aucun bump de Service Worker** — le geste qui a produit l'écran noir
  v314 et le mélange stale/frais v374 n'est jamais posé ici.
- **Donc aucun impact sur le budget P8** (`app.js` est à 205/205, marge nulle).
- **Chaque étape est un commit annulable seul**, laissant `node scripts/ci.js` vert.
- Les seuls fichiers créés sont de la **documentation**, des **scripts de
  contrôle** et, à l'étape 10, **une configuration d'outil** — rien de servi
  au visiteur, rien de déployé sur Vercel.

## ⛔ Ce que ce plan ne fait PAS
- ❌ Il **ne sauve pas les harnais** (`/tmp`, hors dépôt) : c'est la phase 0 du
  plan fondations, et elle reste le seul risque immédiat et irréversible.
- ❌ Il **ne pose pas les zones** dans `app.js` : entonnoir v1, pas v2.
- ❌ Il **ne supprime aucun document** : archiver, c'est déplacer.
- ❌ Il **ne tranche pas** les 3 décisions en suspens : il les rend visibles.

---

## Annexe — les commandes qui produisent les chiffres de ce plan
*(P-C : un chiffre sans sa commande est une opinion)*

```bash
# taille et structure de la mémoire
wc -l CLAUDE.md ; wc -c CLAUDE.md
grep -c '^## ' CLAUDE.md ; grep -c '^#' CLAUDE.md

# répartition journal / règles / décisions / état / aiguillage
#   -> classement par motif sur les bornes de section (## …),
#      script joint : scripts/analyse-memoire.js (à créer à l'étape 3)

# les règles enfouies dans les sections de journal
#   marqueurs : RÈGLE ⛔ JAMAIS TOUJOURS OBLIGATOIRE PIÈGE LEÇON interdit
#   « non négociable » GRAVÉ   -> 55 lignes au 28/07/2026

# documents orphelins
ls pirates-tools/docs/*.md | wc -l                                  # 17
grep -oE "docs/[A-Za-z0-9._-]+\.md" CLAUDE.md | sort -u | wc -l      # 6

# le mécanisme de résolution d'un repère, chronométré
grep -n "function lvPanelAccord" pirates-tools/app.js                # 6167, ~70 ms

# durée de la CI (plafond fixé à 3 s)
node pirates-tools/scripts/ci.js | tail -1                           # 148 ms

# vérifier qu'aucun fichier de configuration d'outil n'existe encore
ls -la .claude/ 2>&1
```
