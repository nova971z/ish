# PLAN D'ACTION EN ATTENTE — enregistré le 27/07/2026

> ⚠️ **RIEN N'EST FAIT DANS CE FICHIER.** C'est une liste de ce qu'il RESTE à
> faire, décidée avec l'user le 27/07/2026 au soir. On la déroulera plus tard,
> ensemble, point par point. **Ne rien appliquer sans que l'user le demande.**

---

## 1. INDEX FIRESTORE (onglet Commandes) — 3 étapes

**Le problème** : l'onglet **Commandes** de l'admin affiche « Index Firestore
manquant ». Firestore refuse de trier la liste des commandes tant que cet index
n'existe pas. Le site n'est pas cassé : c'est juste cette liste qui reste vide.

**Étape 1 — Créer l'index (2 minutes, sur l'iPad)**
Admin → onglet **Commandes** → bouton vert **« Créer l'index Firestore »**.
La console Firebase s'ouvre avec le formulaire **déjà pré-rempli** (collection,
champs, ordre de tri). Il n'y a rien à saisir : toucher **« Créer »** et c'est
tout. Le bouton et son URL existent déjà dans le code (`.admin-index-warn`) —
c'est ce qui évite d'aller chercher les bons champs à la main.

**Étape 2 — Attendre la construction (quelques minutes, rien à faire)**
Dans la console Firebase, l'index passe de **« Création… »** à **« Activé »**.
Tant qu'il est en création, la liste des commandes restera vide : c'est normal,
il ne faut pas re-cliquer.

**Étape 3 — Vérifier**
Revenir dans Admin → **Commandes** → bouton **« Rafraîchir »**.
✅ Réussi si : l'encadré jaune « Index Firestore manquant » **a disparu**.
❌ Si l'encadré revient : l'index n'est pas fini, ou il a été créé sur le mauvais
projet Firebase — me le dire, on regardera ensemble.

> **Autre voie possible** (à ne PAS faire si l'étape 1 a marché) : le fichier
> `firestore.indexes.json` est déjà versionné dans le dépôt ; la commande
> `npx firebase deploy --only firestore:indexes` pose tous les index d'un coup.
> Utile seulement si un jour il en manque plusieurs.

---

## 2. TOKEN META / INSTAGRAM — pas encore configuré

**Le problème** : l'onglet **Instagram** de l'admin affiche
« META_ACCESS_TOKEN not configured on Vercel ». Sans ce jeton, le site ne peut
ni lire le compte Instagram, ni afficher les publications.

**Ce qu'il faudra faire, dans l'ordre :**
1. **Côté Instagram** : vérifier que le compte `pirates_tools_971` est bien un
   compte **Professionnel (Business)** et qu'il est **relié à une Page
   Facebook** — sans ça, l'API Meta ne donne accès à rien.
2. **Côté Meta** : créer (ou rouvrir) l'application sur
   `developers.facebook.com`, y récupérer l'**App ID** et l'**App Secret**.
3. **Obtenir un premier jeton court** (1 h) via l'explorateur d'API de Meta,
   avec les autorisations `instagram_basic`, `pages_show_list`,
   `pages_read_engagement`.
4. **L'échanger contre un jeton 60 jours** : le bouton **« Échanger pour token
   60 jours »** existe déjà dans l'onglet Instagram de l'admin — c'est lui qui
   fait la conversion.
5. **Poser 3 variables sur Vercel** : `META_APP_ID`, `META_APP_SECRET`,
   `META_ACCESS_TOKEN` (le jeton 60 jours), puis redéployer.
6. **Vérifier** : Admin → Instagram → « Charger le compte » doit afficher le
   compte, et « Charger les posts » les dernières publications.

> ⚠️ **Le jeton expire tous les 60 jours.** Il faudra le régénérer, ou prévoir
> un renouvellement automatique — à décider quand on y sera.
> ⚠️ Ces 3 valeurs sont des **secrets serveur** : elles vivent sur Vercel
> uniquement, jamais dans le code, jamais envoyées dans une conversation.

---

## 3. BARÈME LIVREURS — ✅ FAIT le 27/07/2026 (v514)

Les trois endroits qui contredisaient le code ont été corrigés :
- page Livraison (client) : « les tarifs sont déjà **fixés** » → **barème
  conseillé**, calculé pour être le plus juste **des deux côtés**, chaque
  livreur restant libre de ses prix ;
- inscription livreur : « montants **minimum garantis** » → **barème
  CONSEILLÉ**, avec le rappel que c'est le livreur qui fixe ses prix, sans
  aucune conséquence sur son accès aux courses ni sur son classement ;
- admin, onglet Livreurs : titre « Barème **CONSEILLÉ (indicatif)** &
  carburant » + le fondement juridique écrit (L7342-1, directive (UE)
  2024/2831) et le rappel que le tri de l'annuaire ignore le prix.
Le texte de référence vit désormais dans UNE constante (`LV_BAREME_CONSEILLE_HTML`)
pour qu'il ne puisse plus diverger d'un écran à l'autre.

<details><summary>Énoncé d'origine (conservé)</summary>

### 3 bis. BARÈME LIVREURS — écrire noir sur blanc « barème CONSEILLÉ »

**Pourquoi c'est important (juridique, pas cosmétique)** : si la plateforme
**fixe** le prix de la course, elle tombe sous l'article **L7342-1 du code du
travail** et sous le critère de présomption de salariat de la **directive (UE)
2024/2831** (à transposer avant le **02/12/2026**). Le livreur fixe déjà
librement ses prix dans son espace (fait en v495) — mais **l'admin, lui,
affiche encore le barème comme s'il s'agissait DU tarif**, ce qui contredit à
l'écrit ce que fait le code.

**Ce qu'il faudra faire :**
- Dans l'admin, onglet **Livreurs**, renommer le titre « Barème & carburant » en
  quelque chose comme **« Barème CONSEILLÉ (indicatif) & carburant »**, et
  ajouter une phrase explicite : *le livreur fixe librement son prix ; ce barème
  n'est qu'un repère, aucune sanction ni aucun classement n'en dépend*.
- Passer en revue **tous** les endroits où le barème apparaît (admin, espace
  livreur, page Livraison côté client) pour que le mot **« conseillé »** ou
  **« indicatif »** y soit partout, sans exception.
- Vérifier au passage que le tri de l'annuaire des livreurs ne dépend **jamais**
  du prix (aujourd'hui : disponibilité → note → ancienneté — c'est correct).
- Reporter la formulation retenue dans `docs/METHODE-ENTREPRISE-FISCALITE.md`
  § 5 bis (« LA PARADE »).

</details>

---

## 4. ADMIN — cartes qui se chevauchent ou se touchent

**Le constat de l'user** (captures du 27/07/2026, iPad Safari privé) : dans
l'admin, des éléments se chevauchent ou se touchent. **Règle posée par l'user :
aucune carte ne doit en chevaucher une autre, ni la toucher.**

**Ce qu'il faudra faire :**
1. **Mesurer avant de toucher quoi que ce soit.** Un harnais qui injecte le
   balisage réel de l'admin dans la vraie page, et qui compare les rectangles
   deux à deux, sur les 4 formats (iPad paysage/portrait, iPhone, bureau).
   ⚠️ **Piège déjà rencontré** : `#view-admin` reste en `display:none` quand on
   se contente d'enlever la classe `hidden` → le harnais mesure **0 carte** et
   affiche un faux vert. Il faut d'abord trouver la règle CSS qui gagne, sinon
   toute la mesure ne vaut rien.
2. **Établir la liste exacte** des paires qui se chevauchent ou se touchent,
   avec l'écart en pixels et le format concerné — pas d'approximation à l'œil.
3. **Corriger** en une seule passe (écarts de grille, marges), puis **remesurer**
   et faire valider le rendu par l'user.
4. **Verrouiller** : ajouter le contrôle au harnais permanent pour que le défaut
   ne revienne pas.

> Sur les captures, la barre flottante du bas (🏠 🔧 🛒) recouvre aussi le
> contenu des tableaux quand on fait défiler. **À trancher avec l'user** : est-ce
> qu'on considère ça comme un défaut à corriger, ou comme le comportement normal
> d'une barre fixe ? Ne pas décider seul.

---

## 5. PIÈCES JUSTIFICATIVES DU DOSSIER LIVREUR — fichiers non téléversés

**État au 27/07/2026 (v512)** : le dossier livreur est désormais VRAIMENT
enregistré (véhicule, cylindrée, âge vérifié serveur, contact, consentements)
et l'espace livreur en hérite. **Mais les FICHIERS eux-mêmes — pièce
d'identité, avis SIRET, RC Pro, RIB, permis, carte grise, assurances,
capacité de transport — ne sont pas téléversés** : seul le NOM du fichier
choisi est enregistré (`pieces: { id: { name: 'cni.jpg', uploaded: false } }`).
L'admin voit donc « pièce déclarée » mais ne peut pas l'ouvrir.

**Ce qu'il faudra faire** : passer les pièces par **Firebase Storage** (comme
les vidéos de course), avec des règles d'accès strictes — le livreur téléverse
les siennes, l'admin seul les lit, personne d'autre. Prérequis : activer
Storage (plan Blaze) puis `npx firebase deploy --only storage` — c'est la même
action déjà en attente pour les vidéos.

⚠️ **Conséquence à connaître aujourd'hui** : un dossier ne peut pas être
validé sur pièces depuis l'admin. La validation reste une décision manuelle,
prise hors du site (documents reçus par email, par exemple).

---

## RAPPEL DE MÉTHODE (imposé par l'user, 27/07/2026)

- **Un plan enregistré n'est pas un plan appliqué.** Tant que l'user n'a pas dit
  « go », on ne touche à rien.
- **Lire la demande en entier avant d'agir.** Aller vite en partant à côté fait
  perdre bien plus de temps que lire posément.
