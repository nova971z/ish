# 🔒 PROTÉGER L'ALGORITHME — état mesuré et procédure

> Demande de l'user, 16/08/2026 : *« il faut qu'on protège le code de
> l'algorithme afin que je ne me le fasse pas voler […] je ne veux pas que les
> gens puissent le voir sur les développeurs Web »*.
>
> ⛔ **La prémisse est fausse, et la réalité est plus grave.** L'algorithme
> n'est PAS visible dans les outils du navigateur — il n'y a jamais été. Il est
> visible **sur GitHub, par n'importe qui**. Tout ce document est mesuré.

---

## 1. CE QUI EST DANS LE NAVIGATEUR — mesuré, et c'est rassurant

Les huit fichiers servis (`app.js`, `app.visitor.js`, `admin.bundle.js`,
`sw.js`, `mfa.js`, `qrcode.js`, `firebase-init.js`, `crypto-config.js`) ont été
fouillés pour **16 identifiants** du moteur : `solveMarkup`, `octroiRate`,
`colissimoCost`, `recommend`, `marginAt`, `lireSuffixeDewalt`,
`lireSuffixeMakita`, `titreContreditFiche`, `apparierParConfiguration`,
`choisirCoutSource`, `parseIdealo`, `extraireCaracteristiques`,
`SUFFIXES_DEWALT`, `BATTERIES_DEWALT`, `patronRecherche`, `calcPrice`.

**Deux occurrences seulement, et aucune n'est l'algorithme :**

| trouvé | ce que c'est réellement |
|---|---|
| `calcPrice` (app.js:178) | TVA + octroi de mer. Des **taux publics de l'État**, et il FAUT les calculer côté client pour afficher un prix par territoire. Zéro valeur commerciale. |
| `recommend` | dans un **commentaire** (app.js:14983), pas dans du code. |

⇒ **Le traqueur, le parseur, les grammaires de référence et le calcul de
majoration sont 100 % côté serveur.** Ils tournent chez l'hébergeur et ne sont
jamais envoyés au navigateur. Une porte l'impose déjà : `check-pricing.js`
refuse tout identifiant du modèle de prix dans un fichier client.

⛔ **Conséquence : obfusquer le code servi ne protégerait RIEN**, puisque ce
qu'on veut protéger n'y est pas. Ce serait du théâtre, et coûteux (illisible à
déboguer, sourcemaps à gérer, service worker à réaligner).

---

## 2. LA VRAIE FUITE — le dépôt est PUBLIC

**Mesuré le 16/08/2026** : `github.com/nova971z/ish` répond en **Public**, sans
authentification, et l'arborescence `pirates-tools/api/_lib` y liste
`price-parse.js`, `pricing-model.js`, `nomenclature.js`.

Ce qui est donc lisible par n'importe qui, aujourd'hui :

| quoi | volume |
|---|---:|
| moteur en clair (`price-parse`, `nomenclature`, `pricing-model`, `traqueur-plans`, `pricing`, `admin`) | **12 459 lignes** |
| la **méthode écrite en français** (`docs/` : chaîne, décisions, leçons, fiscalité) | **15 498 lignes** |
| le catalogue avec prix, coûts et poids | **57 998 lignes**, 1 708 fiches |
| les adresses exactes du comparateur fournisseur | 9 occurrences |

⚠️ **Le pire n'est pas le code, c'est la documentation.** Un concurrent qui lit
`docs/CHAINE-TRAQUEUR.md`, `docs/DECISIONS.md` et `docs/LECONS.md` obtient le
**raisonnement** : pourquoi chaque garde existe, quelle panne elle a coûté,
quelles marges sont visées. Réécrire 12 000 lignes est long ; recopier une
méthode déjà démontrée est immédiat.

---

## 3. ⛔ LA CONTRAINTE QUI CHANGE TOUT — c'est un FORK

`nova971z/ish` porte la mention **« forked from ish-app/ish »**.

Or la documentation GitHub est formelle : **« You cannot change the visibility
of a fork »**, et *« all forks of public repositories are public »*.

⇒ **Le bouton « Make private » n'existera pas sur ce dépôt.** Toute solution qui
suppose de basculer celui-ci en privé est impossible. Il faut un dépôt NEUF.

---

## 4. CE QUI EST DÉJÀ FAIT (16/08/2026)

| mesure | état |
|---|---|
| `.gitignore` protège `.env`, `*.pem`, `*.key`, comptes de service, `.vercel` | ✅ fait — il ne contenait **que** les règles du projet amont, rien pour nous |
| `check-fuites.js` balaie **tout fichier versionné** (plus seulement les servis) pour les secrets reconnaissables à leur FORME | ✅ fait, sabotage rouge |
| aucun vrai secret trouvé dans le dépôt | ✅ vérifié — les `sk_test_…` des docs sont des exemples, la clé Firebase web est publique par conception |

⚠️ **Un motif basé sur un NOM de variable a été retiré du balayage global** :
`ADMIN_SECRET = "…"` criait sur quatre harnais qui posent une valeur d'essai
puis la restaurent. Une porte qui crie à tort finit ignorée. Ces deux motifs
restent actifs sur les fichiers SERVIS, où toute valeur en dur est une fuite.

---

## 5. LA PROCÉDURE — ce qui reste à faire, et qui le fait

> ⛔ **Aucune de ces étapes n'est engagée.** Elles touchent le compte GitHub et
> l'hébergeur : c'est la décision et le geste de l'user, jamais les miens.

### Étape 1 — créer un dépôt PRIVÉ neuf *(user, ~2 min)*
GitHub → **New repository** → nom au choix → cocher **Private** → **ne pas**
initialiser avec un README.
⚠️ Ne pas passer par « Fork » ni par « Import » depuis l'ancien : on repartirait
d'un fork, et on retomberait sur la contrainte du §3.

### Étape 2 — y pousser l'historique *(moi, une commande)*
```bash
git remote add prive git@github.com:<compte>/<nouveau-nom>.git
git push prive --all && git push prive --tags
```
⚠️ **L'historique complet part avec.** C'est voulu : les décisions et les
mesures y vivent. Mais cela signifie qu'un secret qui aurait été poussé un jour
serait recopié — d'où la vérification du §4, faite **avant**.

### Étape 3 — rebrancher l'hébergeur *(user, ~3 min)*
Vercel → le projet → **Settings → Git** → déconnecter l'ancien dépôt, connecter
le nouveau. Les variables d'environnement **ne bougent pas** : elles vivent
chez Vercel, pas dans le dépôt.
⚠️ À vérifier sur place : que la branche de production reste **`master`**.

### Étape 4 — ne pas laisser l'ancien en ligne *(user, ~1 min)*
L'ancien dépôt restera public et **conservera tout l'historique**. Deux options,
à trancher :
- **le supprimer** (Settings → Danger Zone → Delete) — le plus net ;
- **le vider** en y poussant une branche orpheline sans notre code — moins net :
  les anciens commits restent accessibles par leur empreinte un certain temps,
  et les copies déjà faites, elles, restent faites.

⛔ **Dans les deux cas, ce qui a été public l'a été.** Si quelqu'un a cloné, on
ne peut rien y faire. La question n'est donc pas « effacer le passé » mais
« arrêter l'hémorragie maintenant ».

### Étape 5 — la ceinture juridique *(user, gratuit)*
Le code est protégé par le **droit d'auteur dès sa création**, sans dépôt ni
formalité. Ce qui manque, c'est la **preuve de date**. Deux moyens simples :
- une **enveloppe Soleau numérique** auprès de l'INPI (payante, quelques euros) ;
- ou, gratuit et suffisant dans bien des cas : le dépôt privé horodaté par
  GitHub fait déjà foi de l'antériorité de chaque commit.

⚠️ ⛔ **Je ne suis pas une source de droit** (protocole §8). Ces deux pistes
sont à confirmer auprès de l'**INPI** (`inpi.fr`) avant d'engager quoi que ce
soit — je n'ai pas vérifié les tarifs ni les conditions ce jour.

### Étape 6 — un fichier `LICENSE` *(moi, quand l'user le dit)*
Sans licence explicite, le code est « tous droits réservés » par défaut — ce qui
est déjà la position la plus protectrice. Y écrire un `LICENSE` propriétaire
rend l'intention **opposable** plutôt qu'implicite.

---

## 6. CE QU'IL NE FAUT PAS FAIRE — et pourquoi

| fausse bonne idée | pourquoi c'est inutile ici |
|---|---|
| **Obfusquer / minifier le serveur** | Le code serveur n'est **jamais envoyé** au navigateur. On rendrait illisible pour nous ce que personne ne voit. |
| **Obfusquer le client** | Ce qui s'y trouve, c'est de la TVA et de l'octroi de mer — des taux publics. |
| **Chiffrer les fichiers du dépôt** | Vercel doit les lire pour construire. Un chiffrement dont la clé est dans le dépôt ne chiffre rien. |
| **Retirer les commentaires du code** | Ils sont notre mémoire, et le protocole §0 impose de les lire. Le problème n'est pas qu'ils existent, c'est **qui peut les lire**. |
| **Passer le dépôt actuel en privé** | **Impossible** : c'est un fork (§3). |

---

## 7. L'ORDRE, PAR URGENCE

1. **Étapes 1 à 3** — dépôt privé + rebranchement. C'est la seule mesure qui
   arrête réellement la fuite. Tout le reste est secondaire.
2. **Étape 4** — l'ancien dépôt.
3. **Étape 5** — la preuve de date, à confirmer auprès de l'INPI.
4. **Étape 6** — la licence.
