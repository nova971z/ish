# EXTRACTION DES RÈGLES ENFOUIES — étape 3 du runbook mémoire

**Date : 29/07/2026.** Source : `CLAUDE.md` (1552 lignes), copie gelée dans
`docs/JOURNAL.md`. Détection : `node scripts/regles-enfouies.js`.

> **79 lignes** portant un marqueur d'impératif, réparties sur **35 sections**.
> ⚠️ Le runbook annonçait « 55 lignes » sous l'étiquette **« risque mesuré »**.
> Aucune commande ne produisait ce chiffre : c'était une **estimation présentée
> comme une mesure**, en violation de mon propre garde-fou G1. **79 est la
> première valeur réellement mesurée.** Le runbook a été corrigé.

## Règle de ce document
Chaque ligne détectée reçoit **exactement une** issue. Aucune n'est laissée
sans décision — c'est tout l'objet de l'exercice.

| Issue | Signification |
|---|---|
| **PROMUE** | devient une règle opposable dans `.claude/rules/`, reformulée à l'impératif |
| **NARRATIVE** | reste dans le journal, avec le motif de sa non-opposabilité |
| **COUVERTE** | déjà garantie ailleurs (règle existante ou contrôle CI), avec l'endroit |
| **PÉRIMÉE** | renversée depuis, avec ce qui l'a remplacée |

⚠️ **Piège central** : promouvoir une règle MORTE est pire que la perdre — elle
contredirait la règle vivante, et le choix entre les deux se ferait au hasard.
D'où le croisement systématique avec `docs/DECISIONS.md`.

---

## Les 79, tranchées

### A — Contexte de l'user *(→ `.claude/rules/contexte-user.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 1 | 10 | Ne jamais déduire sa localisation de celle de l'entreprise | **PROMUE** |
| 2 | 16 | Navigation privée : pas de SW, pas de cache, pas de `localStorage` | **PROMUE** |
| 3 | 21 | Pas de téléphone ni de données cellulaires | **PROMUE** |
| 36 | 768 | « l'user navigue TOUJOURS en privé » (cold load intégral) | **COUVERTE** par #2 |
| 56 | 1175 | « il navigue TOUJOURS en privé et ferme le site » | **COUVERTE** par #2 |

### B — Méthode de diagnostic *(→ `.claude/rules/methode-diagnostic.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 4 | 53 | Watchdog absent ⇒ le HTML n'est jamais arrivé ⇒ relire le code est inutile | **PROMUE** |
| 55 | 1155 | « ça ne marche pas » ⇒ chercher la cause en amont, jamais masquer le symptôme | **PROMUE** |
| 59 | 1216 | Une vérification qu'on ne parvient pas à faire échouer ne vérifie rien | **PROMUE** |
| 60 | 1218 | *(même règle, autre formulation)* | **COUVERTE** par #59 |
| 70 | 1385 | Ne jamais poser une béquille de test dans le produit — signaler la limite | **PROMUE** |
| 72 | 1433 | Ne jamais se fier au retour d'une écriture : relire | **PROMUE** |
| 5 | 63 | « consulter la cartographie avant de travailler » | **PROMUE** |

### C — Service Worker *(→ `.claude/rules/service-worker.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 11 | 130 | Un SW corrigé ne prend la main qu'au rechargement suivant → recharger 2× | **PROMUE** |
| 12 | 135 | Jamais de corps de réponse vide | **PROMUE** |
| 20 | 471 | Plus jamais d'écran noir muet (watchdog) | **COUVERTE** par #4 + `tests/boot-resilience.mjs` |
| 35 | 755 | Ne jamais réutiliser un numéro de version | **PROMUE** |
| — | *(nouveau 29/07)* | Un dernier recours ne renvoie **jamais** de redirection | **PROMUE** |
| — | *(existant)* | Le SW ne touche jamais `/api/` | **PROMUE** |

### D — CSP, 3D et empreintes *(→ `.claude/rules/csp-et-3d.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 24 | 573 | Site 3D ⇒ la CSP doit autoriser `worker-src blob:` + `wasm-unsafe-eval` | **PROMUE** |
| 27 | 597 | Textures embarquées ⇒ `blob:` dans `connect-src` **et** `img-src` | **PROMUE** |
| 52 | 1032 | Modifier un script inline change son empreinte → recalculer la CSP | **PROMUE** |

### E — Firestore *(→ `.claude/rules/firestore.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 50 | 985 | `where` + `orderBy` sur 2 champs ⇒ index composite obligatoire | **PROMUE** |
| 51 | 990 | *(même règle, énoncé général — l'émulateur ne le dira jamais)* | **COUVERTE** par #50 |
| 44 | 894 | Déployer `firestore.rules` après modification | **PROMUE** |
| 41 | 833 | Storage : lecture/suppression client jamais autorisées | **COUVERTE** par `storage.rules` + `scripts/test-rules.js` |

### F — Prix, produits, catalogue *(→ `.claude/rules/prix-et-produits.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 8 | 88 | Promos autorisées **si** couvertes par le traqueur | **PROMUE** *(renverse « promos interdites » — voir DECISIONS)* |
| 9 | 98 | `priceLocked: true` ⇒ jamais recalculé | **PROMUE** |
| 10 | 108 | Posters : fond sombre obligatoire, jamais blanc | **PROMUE** |
| 13 | 142 | Un produit dont le coût n'est pas relevé ne reste pas au catalogue | **PROMUE** |
| 14 | 156 | Wera parti faute de couverture traqueur | **NARRATIVE** — constat historique, pas une consigne |
| 6 | 72 | Autoliquidation TVA à l'import obligatoire depuis 2022 | **COUVERTE** par `docs/METHODE-ENTREPRISE-FISCALITE.md` |
| 7 | 75 | Ne jamais répondre « demande à ton comptable » | **PROMUE** |

### G — Packs 3D *(→ `.claude/rules/packs-3d.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 29 | 672 | Deux exigences non négociables pour composer un pack | **PROMUE** |
| 30 | 677 | Orientation : chuck à gauche, logo face, jamais le dos ni un logo miroir | **PROMUE** |
| 31 | 681 | Une orientation validée est gravée : ne jamais la re-dériver | **PROMUE** |
| 32 | 682 | *(même règle)* | **COUVERTE** par #31 |
| 33 | 703 | Mapping au sol verrouillé, jamais recalculé | **PROMUE** |
| 34 | 745 | Fiche produit = toujours le modèle 3D qui tourne | **PROMUE** |
| 53 | 1090 | *(même exigence, formulation user)* | **COUVERTE** par #34 |
| 54 | 1112 | GLTFExporter décompresse les textures → passer par gltf-transform | **PROMUE** |

### H — Chaîne de livraison *(→ `.claude/rules/livraison.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 61 | 1239 | Qui décide quoi : règle gravée, à ne plus inverser | **PROMUE** |
| 62 | 1241 | Le client pose ses conditions à la commande et ne les ressaisit jamais | **PROMUE** |
| 63 | 1242 | Le client ne propose jamais de prix | **PROMUE** |
| 43 | 871 | Le tri de l'annuaire ne dépend jamais du prix *(présomption de salariat)* | **PROMUE** |
| 45 | 909 | Le livreur suivant ne lit jamais la conversation précédente (`round`) | **PROMUE** |
| 46 | 910 | Corollaire obligatoire : filtrer sur `round` côté client | **COUVERTE** par #45 |
| 57 | 1178 | Jamais de bouton `disabled` comme état de repos | **PROMUE** |
| 66 | 1301 | `livree` n'est pas soldée — elle attend la confirmation | **PROMUE** |
| 67 | 1311 | Demander depuis une fiche met l'article au panier | **COUVERTE** par `tests/plan10.mjs` |
| 68 | 1315 | On ne cumule jamais : quantité au maximum | **PROMUE** |
| 37 | 777 | Le client paie sa marchandise en ligne | **PÉRIMÉE** — renversée le 27/07 (demande sans paiement) |
| 38 | 781 | Photo obligatoire à la livraison | **PROMUE** |
| 39 | 788 | Territoire 971 obligatoire, frais autoritaires serveur | **PÉRIMÉE** — plus de frais plateforme depuis le 27/07 |
| 40 | 820 | Photo du chantier obligatoire à la commande | **PROMUE** |
| 42 | 845 | Consentement vidéo obligatoire des deux côtés | **PROMUE** |
| 47 | 922 | *(rappel : photo chantier, code, 2 photos, consentement)* | **COUVERTE** par #38 #40 #42 |
| 48 | 959 | Les prix viennent toujours du catalogue serveur | **PROMUE** |
| 74 | 1447 | Porte de sortie MFA obligatoire avant tout enrôlement | **PROMUE** |

### I — Harnais et mesure *(→ `.claude/rules/harnais.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 19 | 458 | `behavior:'instant'` obligatoire — le défilement doux fausse les lectures | **PROMUE** |
| 21 | 474 | `div[role=alert]` matche `#stripeCardError` en premier — cibler par id | **PROMUE** |
| 49 | 970 | Deux `goto()` sur la même URL = pas de rechargement | **PROMUE** |
| 58 | 1185 | `addInitScript` réinjecte à chaque navigation | **PROMUE** |
| 76 | 1476 | Un harnais peut être vert pour la mauvaise raison (503 en amont) | **COUVERTE** par `compteur().prealable()` du socle |
| 69 | 1337 | Ne pas refermer sous les yeux de l'utilisateur ce qu'il est en train de lire | **NARRATIVE** — spécifique au sondage livreur, déjà dans le code |
| 65 | 1276 | Classes CSS construites par concaténation — vérifier avant toute purge | **PROMUE** |
| 64 | 1274 | Plafonds de perf non relevés | **PROMUE** |

### J — Protocole de travail *(→ `.claude/rules/protocole.md`)*

| # | L | Contenu | Issue |
|---|---|---|---|
| 25 | 580 | Un correctif resté sur la branche n'est pas déployé | **PROMUE** |
| 26 | 582 | Toujours merger `master` après vérification | **PÉRIMÉE** — on travaille désormais DIRECTEMENT sur `master` |
| 18 | 256 | Ordre non négociable : argent → sécurité → fonctionnel → structure → polish | **PROMUE** |
| 71 | 1400 | La mémoire du projet est UN SEUL fichier, à la racine | **PROMUE** |
| 73 | 1438 | Ne jamais faire coller une sortie de configuration brute — filtrer | **PROMUE** |

### K — Restent NARRATIVES *(récit, constat ou état — non opposables)*

| # | L | Motif |
|---|---|---|
| 15 | 205 | Tâche de la checklist pré-lancement, pas une règle de code |
| 16 | 229 | État de l'infrastructure e-mail |
| 17 | 233 | Reste à faire, suivi dans la checklist |
| 22 | 504 | Liste de travaux de l'audit sécurité, tous soldés depuis |
| 23 | 520 | Compte rendu de H3 — la règle vit dans `api/create-payment-intent.js` |
| 28 | 615 | Description du bandeau cookies livré |
| 75 | 1468 | Explication d'un mécanisme Firebase, traitée dans le code |
| 77 | 1516 | Description de l'écran TOTP livré |
| 78 | 1524 | Contrainte imposée par Firebase, pas par nous |
| 79 | 1541 | Détail d'implémentation du bouton « Copier la clé » |

---

## Bilan

| Issue | A | B | C | D | E | F | G | H | I | J | K | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **PROMUE** | 3 | 6 | 3 | 3 | 2 | 5 | 6 | 13 | 6 | 4 | — | **51** |
| **COUVERTE** | 2 | 1 | 1 | — | 2 | 1 | 2 | 3 | 1 | — | — | **13** |
| **NARRATIVE** | — | — | — | — | — | 1 | — | — | 1 | — | 10 | **12** |
| **PÉRIMÉE** | — | — | — | — | — | — | — | 2 | — | 1 | — | **3** |
| **Lignes** | 5 | 7 | 4 | 3 | 4 | 7 | 8 | 18 | 8 | 5 | 10 | **79** |

**51 + 13 + 12 + 3 = 79.** Aucune ligne sans décision.

> ⚠️ Ce tableau a été recompté colonne par colonne après une **erreur
> d'arithmétique dans la première version** de ce bilan (44 + 14 + 12 + 3 = 73,
> soit 6 lignes qui disparaissaient sans qu'on le voie). Un total qui ne tombe
> pas juste dans un document dont l'objet est de ne rien perdre est
> précisément le défaut qu'il prétend corriger.

Les 51 promues sont regroupées en **10 fichiers de règles** par sujet (A→J), et
non 51 fichiers séparés : 51 règles isolées feraient un pavé que personne ne
lit, ce qui est exactement le défaut qu'on corrige.

## Les 3 périmées — à ne JAMAIS repromouvoir

1. **L777 / L788** — « le client paie la course en ligne », « frais autoritaires
   serveur ». Renversées le 27/07/2026 : la plateforme ne fixe plus le prix et
   n'encaisse plus la course *(sortie de l'art. L7342-1)*.
2. **L582** — « toujours merger `master` après vérification ». Renversée : on
   travaille désormais **directement sur `master`**.

## Relecture humaine (§3.3 du runbook)

La détection par marqueurs **rate** les règles sans mot-clé (« il faut… »,
« on ne peut pas… »). Les **35 sections concernées** ont été relues à l'écran
lors de ce tri, soit les **1552 lignes** de `CLAUDE.md`. Aucune règle
supplémentaire opposable n'a été retenue au-delà des 79 : les formulations
sans marqueur rencontrées relevaient toutes du compte rendu de session.
