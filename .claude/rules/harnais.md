---
paths:
  - pirates-tools/tests/**
  - pirates-tools/scripts/**
---

# Règles des harnais et de la mesure

*Extraites de la mémoire projet le 29/07/2026 (`docs/EXTRACTION-REGLES.md`,
groupe I). Toutes viennent d'un test qui a été vert pour la mauvaise raison.*

## La règle mère

**Une vérification qu'on ne parvient pas à faire échouer ne vérifie rien.**
Chaque contrôle nouveau doit être prouvé faillible par **réintroduction
délibérée du défaut**. Un détecteur faussement vert est pire que pas de
détecteur : il donne une confiance qui n'existe pas.

⛔ **LE SABOTAGE SE FAIT AVEC L'OUTIL, PLUS À LA MAIN** *(01/08/2026)* :

```bash
node outils/sabotage.mjs --fichier <f> --cherche <s> --remplace <s> --commande "<cmd>"
```

Motif, mesuré le jour même : **trois sabotages sur cinq ont menti dans la même
session**. Deux `perl -0pi -e` dont l'ancre n'a jamais accroché — le fichier
n'a pas bougé, le contrôle est resté vert, et j'ai annoncé « la porte mord ».
Un troisième lancé sur `x.mjs` alors que le fichier s'appelle `x.js` :
`MODULE_NOT_FOUND`, aucune ligne contenant « ❌ », donc lu comme vert.

L'outil rend ces trois mensonges impossibles : il refuse de conclure si la
substitution n'a rien changé (empreinte avant/après), refuse de conclure si la
commande n'a pas tourné (échec de lancement ≠ résultat), restaure toujours le
fichier et **vérifie la restauration**. Il dit aussi ce qu'il attendait : un
sabotage qui laisse tout vert est un **échec de la porte**, pas un « ok ».

⚠️ Corollaire : **un sabotage qui ne casse rien ne prouve rien.** Si le test
reste vert après sabotage, vérifier d'abord que le sabotage était réel — il
tombe souvent à l'intérieur d'un `try/catch` existant.

## Pièges de mesure — chacun a produit un faux résultat

**Un délai FIXE posé au milieu d'une animation est un tirage au sort.**
`pdp-specs` lisait l'opacité des lignes à 1500 ms — mesuré : 0,615 à 500 ms,
**0,901** à 1500 ms, 0,917 à 3000 ms — avec un seuil d'assertion à **0,9**.
Deux exécutions du même code ont donné 68/68 puis 67/68. On attend que la
valeur **cesse de bouger** (deux relevés identiques, borne de sécurité), on ne
devine pas une durée.
⚠️ Et un seuil posé exactement là où la valeur se trouve n'est pas un seuil :
tester les **deux bouts** avec de la marge vaut mieux qu'un couteau au milieu.

**Ne jamais lancer deux lots de harnais EN PARALLÈLE.** Ils se disputent le
processeur, et une mesure sensible au temps bascule. C'est ce qui a révélé le
défaut ci-dessus — mais par accident, et ça aurait tout aussi bien pu en
fabriquer un faux.

**`behavior: 'instant'` est obligatoire** sur tout `scrollIntoView`. Le
défilement doux global du site fausse les lectures : la mesure part avant
l'arrivée.

**Deux `goto()` sur la MÊME URL ne rechargent pas la page** — c'est une
navigation same-document, l'application ne se ré-initialise pas et on teste
l'état précédent. Toujours faire varier l'URL (`?b=N`).

**`addInitScript` se réinjecte à CHAQUE navigation** — impossible de simuler
un état vidé sans un drapeau explicite.

**`querySelector('div[role=alert]')` matche `#stripeCardError` en premier.**
Cibler par identifiant, jamais par rôle générique.

**`context.route()` n'intercepte PAS les requêtes émises depuis un Service
Worker.** Pour couper réellement le réseau vu du Service Worker, **éteindre le
serveur**.

**Lire `innerText` juste après `waitUntil: 'commit'` renvoie une chaîne vide** :
la page vient de s'engager, elle n'est pas parsée. Attendre
`domcontentloaded`.

**Un harnais peut être vert sans avoir rien franchi.** Sans clés
d'environnement, un point d'entrée répond 503 **avant** tout contrôle, et les
tests « ce n'est pas bloqué » passent pour la mauvaise raison. D'où
`compteur().prealable()` : une condition sans laquelle le harnais n'a rien
vérifié fait **échouer** le harnais au lieu de le laisser verdir à vide.

**Une propriété testée sur un APPEL ISOLÉ ne dit rien de l'usage réel.**
Mesuré le 29/07/2026 : une fonction de remboursement passait **5 propriétés sur
6** et se trompait d'un centime dès le deuxième appel — parce qu'un client ne
renvoie jamais tout d'un coup. Seule la propriété qui rejouait une **SÉQUENCE**
d'appels l'a démasquée. Un jeu de propriétés tiré de la *forme de l'énoncé* est
aveugle à la *séquence d'appels* : toute fonction appelée plusieurs fois sur le
même objet se teste en séquence, pas seulement en un coup.

**Un énoncé peut être INSATISFIABLE.** Avant de s'acharner, vérifier qu'une
solution existe : trois unités identiques et un total non divisible par trois
rendaient l'invariant demandé arithmétiquement impossible. Démontrer
l'impossibilité vaut mieux que produire un contournement qui ment.

## Ancrage

⛔ **Un harnais ne nomme jamais une donnée du catalogue** (référence produit,
titre, prix, **catégorie**, **marque**). Dix-huit harnais sont morts pour cette
raison : ils affirmaient qu'un choix délibéré de l'user était un défaut. Le
sujet du test se **choisit à l'exécution**, sur un critère.

*Rappel payé une seconde fois le 01/08/2026, après le regroupement des familles
demandé par l'user :* `audit-buttons` sélectionnait « Meuleuses » et attendait
30 s avant de **mourir sans rendre une assertion** ; `verify-beacon` cliquait la
même puce et annonçait « le clic n'est plus mesuré » — la mesure marchait ;
`test-grid` cliquait « Scies » derrière un `.catch(()=>{})` qui masquait
l'échec. Trois harnais, une seule cause.

⛔ **Un harnais ne vise jamais un identifiant qui n'existe pas.**
Porte : `scripts/check-ancres.js`, branché dans `ci.js`. Il relit **tout ce qui
est servi** (`index.html` + chaque `.js` de la racine), comprend les
identifiants **construits par concaténation** (`'lvTarifIn' + zone`), et ignore
les commentaires.
Un identifiant visé **pour prouver son absence** se déclare dans le harnais,
à côté de l'assertion qu'il justifie :

```js
// ancres-absentes-voulues: acDate, acHour, acLieu
```

*Motif : le 01/08/2026, cinq harnais rouges — et un audit de sécurité mort —
tombaient tous sur des ancres périmées.*

## Ce qui rend un harnais VERT SANS RIEN VÉRIFIER

Trois formes rencontrées le 01/08/2026, toutes dans des harnais qui se
disaient verts :

**`|| true` en fin d'assertion.** `ok(p && !p.hidden && p.offsetHeight>0 || true)`
est vrai quoi qu'il arrive. Ce n'est pas une assertion, c'est une décoration.

**Le repli poli.** Quand la condition n'est pas réunie, pousser un `ℹ️ non
déclenché` au lieu d'échouer. `verify-coffret-cart` sautait ainsi son assertion
la plus importante — *le serveur reçoit-il `coffret:true` ?*, donc de l'argent —
parce qu'il ne remplissait que **4 des 6** champs obligatoires de l'adresse.
⛔ Une condition sans laquelle le harnais ne vérifie rien est un **préalable**,
et un préalable non rempli **échoue**.

**Lire un élément absent.** `!(document.getElementById('x') || {}).hidden` rend
`!undefined`, donc `true`, pour toujours. Le harnais teste le vide.

## Un seuil recopié se périme

⛔ **Ne jamais écrire dans un harnais un nombre qui vit dans le produit.**
`test-grid` exigeait « au plus 35 cartes » alors que `PAGE_SIZE` vaut 40 — et
le même fichier écrivait « 40 » vingt lignes plus haut. Il accusait la
pagination de cumuler.
On **relit la valeur à l'exécution** (`app.js`), ou on teste l'invariant plutôt
que le chiffre : `plan9` ne compte plus les modes de règlement, il vérifie que
le menu reflète **exactement** `LV_PAIEMENTS`.

⚠️ **Depuis la pagination, compter les cartes affichées ne prouve plus rien** :
la page 1 en montre `PAGE_SIZE` qu'il y ait 60 résultats ou 1000. Ce qui suit
le filtrage, c'est le **nombre de pages**.

⛔ **Un harnais ne s'ancre jamais sur une formulation exacte** d'interface. Les
textes changent ; le comportement, non.

## Portabilité

**Aucun chemin absolu dans `tests/` ni `outils/`.** Tout passe par le socle du
dossier. Un fichier qui cite un chemin en dur ne tourne que sur la machine où
il a été écrit — la CI le refuse (`check-harnais`).

**Un harnais n'écrit jamais à la racine du site.** Les captures vont dans
`tests/_sortie/`, ni versionné ni déployé. Quatre copies d'écran des espaces
client et livreur ont été servies **publiquement** sur le site pour cette
raison.

**Non exécuté n'est PAS vert.** Un harnais dont le prérequis manque doit sortir
en code 2 et être compté comme **ignoré**, jamais comme réussi.

⛔ **ET ÇA VAUT AUSSI POUR LA CI ELLE-MÊME.** Jusqu'au 01/08/2026, son
`safeRequire` traitait toute erreur de chargement comme « module manquant
ignoré ». Une porte **présente sur le disque mais cassée** ne s'exécutait donc
pas, et la CI annonçait « ✅ tous les contrôles sont passés ».
Ce n'était pas théorique : `audit/p3-endpoints.js` — l'audit d'authentification
des points d'entrée — **était mort depuis la migration Revolut** parce qu'il
lisait `api/checkout.js`, supprimé. Personne ne pouvait le savoir.
Désormais on distingue, **sur le disque** : fichier absent → contrôle optionnel ;
fichier présent qui refuse de se charger → **PORTE MORTE, la CI échoue**.

⚠️ Corollaire pour toute porte : ne jamais lire un fichier **au chargement du
module**. Une lecture qui jette rend la porte inchargeable ; une lecture
défensive transforme le fichier disparu en **information remontée**.

**Un instrument de mesure ne surestime jamais.** Le lanceur comptait sa propre
ligne de bilan comme une assertion : +1 par harnais, un chiffre faux qui avait
l'air précis.
