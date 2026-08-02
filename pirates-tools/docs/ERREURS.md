# REGISTRE DES ERREURS — classées par ORIGINE

> **Une erreur ne vient jamais de partout.** Elle vient d'un mécanisme précis,
> et le même mécanisme reproduit la même erreur. Ce registre classe donc par
> **cause racine**, jamais par ordre chronologique : on lit **une classe**, pas
> tout le fichier.
>
> Injecté à chaque message par le hook — mais **seulement le sommaire**.
> Le détail se lit à la demande : `node scripts/erreurs.js --classe O1`

---

## SOMMAIRE — sept origines, rien de plus

| Origine | Mécanisme | Cas | Antidote | Porte |
|---|---|---|---|---|
| **O1** | Affirmer avant de mesurer | 12 | §3 · §8 | `garde-sortie.js` *(hook Stop)* |
| **O2** | L'instrument de mesure est faux | 28 | §4.3 | sabotage obligatoire |
| **O3** | Réutiliser sans vérifier le contexte | 8 | §1.4 | `check-lecons.js` |
| **O4** | Contrainte connue, non appliquée | 4 | §1 | `garde-entonnoir.js` |
| **O5** | Outil artisanal au lieu de l'outil existant | 1 | §1.4 | aucune — humaine |
| **O6** | Copie périmée au lieu de la source vivante | 5 | §4.4 | `p7-architecture.js` |
| **O7** | **Lire le silence comme un succès** | 7 | §3 · §4.3 | `sabotage.mjs` · `ci.js` · `check-ancres.js` |

**65 erreurs, 7 mécanismes.** O1 et O2 en concentrent **40 à elles deux** :
c'est là qu'il faut regarder en premier, toujours.

⚠️ **O7 est né le 01/08/2026**, et il est né d'une règle qui existait déjà :
« non exécuté n'est PAS vert » — mais écrite pour les seuls harnais. Six
erreurs en une session, dont **un audit de sécurité mort sans que rien ne le
dise**. Une règle vraie appliquée à un seul endroit ne protège que cet
endroit ; il faut chercher où elle vaut AUSSI.

---

## O1 — AFFIRMER AVANT DE MESURER
*Mécanisme : je produis du texte plausible et je le livre comme un fait.
C'est la classe la plus grave : elle ne casse pas le code, elle casse la
confiance dans tout ce que je dis.*

| N° | Ce que j'ai affirmé | Le fait | Ce qui l'a démenti |
|---|---|---|---|
| **E-101** | « risque mesuré : 55 règles enfouies » | **79** | `node scripts/regles-enfouies.js` |
| **E-102** | « TTL fonctionne sur Spark, aucune demande de facturation » | Refusé | `403: billing disabled` à l'envoi |
| **E-103** | « D1 : du gain pur, sans risque » | 45 liaisons dont 7 pièges | analyse `esprima` |
| **E-104** | « aucune mention de médiateur dans index.html » | **3** occurrences | `grep -ci` |
| **E-110** | « clique le bouton qui enregistre le webhook » | **aucun bouton n'existait** — seul le point d'entrée serveur était écrit | `grep -c "revolut-webhook" app.js` → **0**. Récidive du `revolut-ping` : un point d'entrée admin sans bouton n'existe pas pour l'user |
| **E-111** | « Failed to load » lu comme le message RÉSEAU de Safari — panne admin diagnostiquée « la requête meurt avant les fonctions » | c'était MON PROPRE texte, `api/admin.js:1079` : le catch du GET répondait `500 { error: 'Failed to load' }` en avalant la vraie cause | un `grep` du message dans le dépôt AVANT d'attribuer une erreur à la plateforme — l'user a testé /api/health pour rien. Le catch nomme désormais le type + le message réel |
| **E-112** | « idealo : 15 produits par page, taille figée » — déduit du pas de 15 entre deux URL de pagination | sa capture montre **une soixantaine** de produits par page ; le nombre du chemin (`100I16-15/-30`) n'est pas le décompte affiché | récidive de D-68 (coût « déduit » 152 € contre 149,90 réels) : deux points de données ne font pas une grammaire — le site étant injoignable du dépôt, le CHIFFRE affiché se lit sur SA capture, jamais dans une inférence |
| **E-105** | « la plage 64.29.17.x est cassée » | `ish-ebon` y répondait | comparaison des 3 adresses |
| **E-106** | la porte juridique « couvre ce qui engage » | 8 fichiers sur **20** | sondes sur le code : `contact.js` = 91 marqueurs |
| **E-107** | l'entonnoir « protège ce qui est servi » | `manifest.webmanifest` servi sans protection ; **21 fichiers serveur sur 28** sans liste de contrôle | `scripts/couverture.js` |
| **E-109** | « le site vend 275,44 € » | le site sert **291,81 €** : j'avais lu `products.json`, pas les overrides Firestore qui font foi | l'user, capture d'écran à l'appui |
| **E-108** | « les trois invariants tombent **par construction** » | faux : **1684 échecs sur 3000** | oracle de propriétés indépendant, manche 1 |

**Antidote** : §3 — la commande **dans le même message**. §8 — un écran qui ne
proteste pas ne prouve rien.

**Porte** : `scripts/garde-sortie.js`, branché sur le hook `Stop`. Il lit ma
réponse **avant qu'elle parte** et la **refuse** sur quatre points décidables :

| | Ce qui est refusé |
|---|---|
| **S1** | un fichier cité comme existant qui n'est **pas sur le disque** |
| **S2** | une commande citée dont le script n'existe pas |
| **S3** | un chiffre donné comme mesuré qu'**aucune sortie d'outil du tour n'a imprimé** |
| **S4** | « c'est fait / tout est vert » alors qu'**aucun outil n'a été lancé** |

S3 est E-101 rendu impossible : « 55 règles enfouies » n'était imprimé nulle part.

⚠️ **Ce que cette porte ne peut PAS faire**, et il faut le dire : elle ne juge
pas un raisonnement, ne voit pas une conclusion fausse tirée de chiffres justes,
ne lit pas une intention. Elle attrape le **détail concret inventé** — la forme
la plus fréquente et la plus coûteuse. Le reste de la classe reste humain.
Elle ne bloque **qu'une fois par message** et laisse passer au moindre doute :
un refus injustifié rendrait la session inutilisable, donc la porte serait
désactivée, donc elle ne protégerait plus rien.

---

## O2 — L'INSTRUMENT DE MESURE EST FAUX
*Mécanisme : le contrôle est vert, mais il ne mesure pas ce qu'il prétend.
Un détecteur faussement vert est PIRE que pas de détecteur : il donne une
confiance qui n'existe pas.*

| N° | L'instrument | Ce qu'il annonçait | La faute |
|---|---|---|---|
| **E-229** | tout l'appareil « promo » (fenêtre 30 j + affichage), récidive d'E-228 sur le même mécanisme | l'étiquette promo « marchait » — en réalité JAMAIS affichée, et l'ancien prix barré était le mauvais | attrapée le 02/08 par relecture avant le balayage 67 pages (qui allait écrire beaucoup de baisses d'un coup). ① La fenêtre J4 se calculait `now − 30 j` sur le SENTINEL serverTimestamp → NaN → le journal jamais lu (et le `id ==` + `at >=` d'origine exigeait de toute façon un index composite jamais déclaré — double silence, le catch avalait) → `promoAncienPrix` retombait sur le prix courant : l'annonce trompeuse EXACTE que J4 interdit. ② `promoActive` lisait `Number(promoDepuis)` — or c'est un Timestamp relu de Firestore → NaN → jamais vrai. Corrigé : `enMillis` PARTOUT où une date entre en arithmétique, fenêtre filtrée en mémoire sur un seul `where` (règle E). Porte : check-price-watch appelle le HANDLER RÉEL sur base factice (qui JETTE sur le double where, comme la prod) — 4 sabotages rouges |
| **E-228** | l'arithmétique de fraîcheur de `choisirCoutSource`, nourrie de sentinels | le min « marchait » en dryRun — pour la mauvaise raison | les `at` partaient en sentinel `serverTimestamp` (Number → NaN : l'entrée du passage EN COURS invisible au min — mesuré sur ses deux rapports : D25033K-QS, clickoutil 119,90 € perdu contre cotébrico 126,72 €) et revenaient en objet Timestamp (Number → 63 889 596 800, des secondes d'une autre ère → tout périmé face à Date.now() → GEL fantôme au recalcul). Corrigé : `enMillis` (nombre tel quel, Timestamp par `.toMillis()`, le reste = 0 donc écarté) + `nowMs` numérique pour tout ce qui date. ⚠️ A récidivé sur la PROMO deux jours plus tard → E-229 |
| **E-227** | le « moins cher des sources », face aux overrides d'AVANT le format carte | 12 hausses proposées au 1er dryRun clickoutil, dont **+136 %** | la carte `priceSources` naissait avec la SEULE entrée clickoutil ; le relevé cotébrico moins cher, resté au format d'avant (`priceSrcTTC`/`priceSource`), n'entrait pas dans le min. Attrapé par le `dryRun=1` — c'est exactement son rôle. Corrigé : `pwSourcesConnues` ressème l'héritage MARQUÉ `cotebrico` (jamais un estimé), fraîcheur 14 j toujours juge |
| **E-226** | `parseClickoutil`, 1er jet du drapeau `promo` | **147 promos sur 147** cartes lues | « un prix suit le TTC → c'est un barré » — or le prix **HT** suit TOUJOURS le TTC sur cette grille. Le motif était vrai sur la carte promo qui l'avait inspiré, faux sur toutes les autres. Attrapé en exécutant sur la PAGE RÉELLE (114 promos après `(?!\s*HT)`) : un motif se valide sur la carte qui le casse, pas sur celle qui l'a inspiré |
| **E-201** | `tests/lancer.mjs` | 71/71 pour plan8 | comptait sa propre ligne de bilan |
| **E-202** | `tests/mfa-cle-largeur.mjs` | 6/6 sous sabotage | comparait deux largeurs toujours égales |
| **E-203** | porte M1 | refusait un fichier conforme | comptait le saut de ligne final |
| **E-204** | porte M4 | déclarait orphelin ce qui était rangé | ignorait `INDEX-DOCS.md` |
| **E-205** | mon test de `LECONS.md` | `D-013` et `D-014` « absents » | `grep` les prenait pour des fichiers |
| **E-206** | `git checkout <f> \|\| true` après sabotage | « fichier restauré » | `f` n'était pas suivi : rien restauré, **rien dit** |
| **E-207** | S3 de `garde-sortie.js` | « chiffre inventé détecté » | cherchait en SOUS-CHAÎNE : « 55 » se trouve dans n'importe quel identifiant |
| **E-208** | S4 de `garde-sortie.js` | « travail déclaré sans preuve » | **refus à tort** : le participe « vérifié » vit dans n'importe quelle phrase, y compris une question |
| **E-209** | S3 de `garde-sortie.js` | « chiffre jamais imprimé » | **refus à tort** : fenêtre fixe de 8 Mo — dans un tour long, les mesures du début tombaient hors de vue |
| **E-210** | mon assertion « le bouton de réconciliation est branché » | vert après suppression de l'appel | la regex matchait aussi la **définition** `function X()` : une fonction jamais appelée passait pour branchée |
| **E-211** | mon assertion « un seul accès à `event.data.object` » | **refus à tort** sur du code correct | je comptais les OCCURRENCES ; la ligne légitime en porte deux (`if (… && x) return x;`). La règle réelle est « aucune hors de la bascule », pas « exactement une » |
| **E-212** | mon assertion « la réponse porte `modeTest` » | vert après retrait du champ | je cherchais le MOT dans le bloc — l'appel `paiement.modeTest()` suffisait à le satisfaire. Récidive exacte d'E-210 : chercher une ressemblance au lieu d'énoncer la règle (`modeTest\s*:`) |
| **E-221** | ma famille « `.actions` dans `.specs` » de `check-ecrans.js` | verte sous sabotage | la regex du bloc était `([\s\S]*?)(?=<div class="(?:specs\|actions\|head)")` : la **capture s'arrêtait juste avant `.actions`**, donc ne le contenait jamais. Verte **par construction**, sur un dépôt qui portait le défaut à 2 endroits. Corrigée en comptant réellement la profondeur des `<div>` |
| **E-225** | `tests/chevauchement.mjs`, v1 | « aucun tap volé » sous QUATRE sabotages | l'application CACHE le dock pendant le défilement (`dock--hidden`) et le fait réapparaître à l'arrêt ; le harnais mesurait juste après le dernier geste → un dock à opacity 0 est filtré → zéro conflit PAR CONSTRUCTION. Corrigé : on attend le RETOUR de l'élément, et son retour est un PRÉALABLE |
| **E-224** | mes sabotages manuels au `perl` sans `/g` | « le dock déplacé ne déclenche rien » | la chaîne `translateX(-50%) translateY(0)` existe DEUX fois — la règle du dock ET une `@keyframes`. Sans `/g`, seule la PREMIÈRE (l'animation décorative) était éditée : trois diagnostics ont mesuré un dock jamais déplacé. `outils/sabotage.mjs` remplace toutes les occurrences ET compte ce qu'il a touché — s'en servir, pas la main |
| **E-222** | la même famille, version suivante | **refus à tort** sur 3 blocs sains | elle comptait la profondeur des `<div>` — or un `<form>` n'est **pas** un `<div>` : un `.actions` posé dans un formulaire (qui pose sa propre grille, donc ne s'étire pas) passait pour enfant direct de `.specs`. Les deux sens d'E-208 dans le même contrôle, à deux minutes d'écart |
| **E-223** | `grep -o 'style="[^"]*"' index.html \| wc -l` → **31** | le vrai compte était **32** | `grep` travaille **ligne par ligne** : un attribut `style=` qui court sur deux lignes lui échappe, là où `[^"]*` en JavaScript traverse les sauts de ligne. Un chiffre faux qui a l'air précis — et il partait devenir un cliquet |
| **E-220** | l'écran de santé du webhook | conseillait de supprimer et recréer le webhook | conseil UNIQUE quel que soit le motif. Sur une clé manquante il envoyait faire un geste **irréversible** — le secret de signature ne se ré-obtient jamais — pour un problème sans rapport |
| **E-218** | ma preuve « noterSante avale les pannes » | verte, **deux fois de suite** | (a) `catch (_)` cherché en source : `catch (_) { throw _; }` le satisfait et relance ; (b) je réassignais `fbMod.getFirebase` APRÈS coup, sans effet — `webhook.js` capture la référence au chargement. Le vrai Firebase répondait `db: null`, la fonction sortait avant d'écrire. Corrigé par remplacement du module dans `require.cache` **et un PRÉALABLE** qui échoue si le chemin n'a pas été traversé |
| **E-216** | `adminReadResponse` | « Erreur réseau : HTTP 400 » | ne lisait que `data.error` (anglais) ; les diagnostics répondent `erreur`/`etape`/`indice` (français). Il JETAIT avant le `.then`, rendant MORT tout le code de mise en forme des trois boutons Revolut — du diagnostic mort dans l'outil de diagnostic |
| **E-217** | ma preuve comportementale du lecteur | verte à vide | promesse non `await`ée dans un module async : les erreurs étaient poussées APRÈS le `return errors`. Démasquée par sabotage — seule l'assertion par regex rougissait |
| **E-214** | mon assertion « le secours ouvre la page hébergée » | vert avec `if (false)` | je cherchais la MENTION de la variable, pas son rôle de garde. Troisième récidive du même mécanisme (E-210, E-212) : chercher une ressemblance au lieu d'énoncer la règle |
| **E-215** | mon assertion « confirmPayment traite Revolut » | **refus à tort** après extraction | elle exigeait le code à un EMPLACEMENT précis ; sortir le bloc dans une fonction — ce que la barrière des fonctions gelées imposait — la faisait rougir sur un code meilleur |
| **E-213** | la réconciliation elle-même | « 317,79 € encaissés, un client attend » | **VRAI sur le fond, FAUX sur la gravité** : deux paiements Stripe en mode TEST. Le filet ne savait pas distinguer l'argent réel de la fausse monnaie — et une alerte qui crie sur des essais apprend à ne plus être regardée |

**Antidote** : §4.3 — **sabotage obligatoire**. On réintroduit le défaut ; si le
contrôle reste vert, c'est **le contrôle** qui est faux, pas le code qui est bon.
**Porte** : c'est la seule classe entièrement couverte — le sabotage est exigé.

⚠️ **E-208 ajoute l'autre sens à la classe.** Un instrument peut être faux en
**refusant à tort**, pas seulement en laissant passer. C'est même plus grave
ici : une porte qui gêne finit désactivée, donc elle cesse de protéger — le
faux refus détruit la protection *entière*, pas seulement un cas. D'où la règle
posée dans l'auto-contrôle : **les deux directions sont testées**, refuser le
faux ET laisser passer le vrai.

⚠️ **E-206 étend la classe à la RESTAURATION.** Un sabotage se défait, et la
remise en état est un instrument comme un autre : `|| true` avale l'échec,
`git checkout` ne peut rien sur un fichier non suivi. **On sauvegarde par copie
avant de saboter, et on relit après.** Un sabotage qu'on croit annulé et qui
reste en place est une régression livrée en croyant le contraire.

---

## O3 — RÉUTILISER SANS VÉRIFIER LE CONTEXTE
*Mécanisme : un motif qui marchait ailleurs est repris sans regarder ce qu'il
va contenir ici.*

| N° | Ce que j'ai réutilisé | Pour quoi | Le résultat |
|---|---|---|---|
| **E-301** | classe `.lv-handcode__num` (6 chiffres) | clé TOTP de 32 caractères | 1064 px sur un écran de 375 |
| **E-302** | plage « d'une fonction à la suivante » | découper 41 fonctions | emportait commentaires et déclarations |
| **E-303** | un motif de mot pour un symbole qui n'en est pas un | détecter les signes monétaires | zéro correspondance, code déclaré mort à tort |
| **E-304** | `type==="user"` pour délimiter un tour | découper le transcript | un `tool_result` est AUSSI une entrée « user » : tours coupés en morceaux d'un appel |
| **E-305** | `String.replace(a, b)` avec un `b` non maîtrisé | corriger un registre | une séquence spéciale dans `b` a **dupliqué le fichier entier** |
| **E-306** | `require()` sur un script conçu pour un hook | lire sa table de motifs | son `process.exit(0)` de haut niveau **tuait l'appelant sans un mot** |
| **E-307** | l'entonnoir interrogé avec MES mots | router une demande commerciale | « trier par prix » routait vers **D-012**, jamais vers D-009 qui l'interdit |
| **E-308** | `fournisseur()` — « qui encaisse ? » | répondre à « qui a SIGNÉ cette notification ? » | Revolut écrivait, Stripe tentait de le reconnaître : 2 reçues, **0 acceptée**, avec une configuration Revolut parfaite. Symétrique : après bascule, une re-livraison Stripe tardive serait refusée par Revolut |

**Antidote** : §1.4 — regarder **ce que le motif va contenir**, pas ce à quoi il
ressemble.

⛔ **E-305 : ne jamais réparer un document avec `String.replace` en ligne de
commande.** Certaines séquences du texte de remplacement sont interprétées par
le moteur et recopient tout ce qui suit — le registre a été **dupliqué en
entier**, et `E-303` a été avalé au passage. On répare avec un outil d'édition
exact, ou avec une fonction de remplacement littérale.

---

## O4 — CONTRAINTE CONNUE, NON APPLIQUÉE
*Mécanisme : l'information était écrite, disponible, exacte — et je ne l'ai pas
utilisée. La plus rageante : rien n'était à découvrir.*

| N° | La contrainte, déjà écrite | Ce que j'ai fait quand même |
|---|---|---|
| **E-401** | « l'user navigue TOUJOURS en privé » | traqué un défaut de Service Worker qui ne pouvait pas le toucher |
| **E-402** | l'entreprise est en Guadeloupe, **pas** l'user | déduit qu'il y était, orienté tout un diagnostic réseau à côté |
| **E-403** | `scripts/ou.js` construit le matin | utilisé **zéro fois** de la journée |
| **E-404** | « Vercel ne déploie que `master` » — première ligne de la mémoire projet | poussé **15 commits** sur la branche de travail en annonçant deux fois à l'user « relance quand c'est déployé ». Rien ne se déployait : il a retesté contre l'ancien code, et la réponse identique était inévitable. Le déploiement fait partie de « livré » — pousser la branche n'est pas livrer |

**Antidote** : §1 — l'entonnoir, **avant** de réfléchir.
**Porte** : `scripts/garde-entonnoir.js` refuse désormais l'édition d'un fichier
servi sans consultation préalable. E-403 ne peut plus se reproduire.

---

## O5 — OUTIL ARTISANAL AU LIEU DE L'OUTIL EXISTANT
*Mécanisme : j'écris moi-même ce qui existe déjà, en mieux, dans le projet.*

| N° | Ce que j'ai écrit à la main | Ce qui était déjà installé | Le résultat |
|---|---|---|---|
| **E-501** | un analyseur JavaScript au comptage d'accolades | `esprima`, dans `node_modules` | 24 fonctions mal délimitées, `app.js` cassé |

**Antidote** : §1.4 — chercher dans `node_modules`, `scripts/`, `tests/` **avant**
d'écrire. Un analyseur maison est faux à 95 %, et 95 % suffit à casser.

---

## O6 — COPIE PÉRIMÉE AU LIEU DE LA SOURCE VIVANTE
*Mécanisme : je lis une photographie prise plus tôt au lieu de l'état courant.*

| N° | Ce qui était lu | Ce qu'il fallait lire |
|---|---|---|
| **E-601** | `CTX.user.multiFactor` capturé au montage | `fb.multiFactor(user)`, état vivant |
| **E-602** | `_adminClaimOk` non remis à faux | tombe au changement de compte |
| **E-604** | le document du dépôt, pour affirmer que « les produits Festool n'existent pas au catalogue » | sa page fournisseur en affiche **50**, et l'analyseur reconnaît leurs références (`205721`, `577840`) — vérifié en repassant le format exact de sa capture dans `parseCotebrico`. Troisième invention de la même soirée, même mécanisme |
| **E-603** | `docs/TRAQUEUR-URLS.md`, pris pour la configuration réelle des raccourcis iPad | l'app Raccourcis de l'user — sa capture montrait `dryRun=0` là où le document disait `1`. J'ai bâti un diagnostic ENTIER et une porte sur cette lecture, et je le lui ai annoncé comme un fait. Commis le jour même où je consignais O7 |
| **E-605** | le document Pages de l'user (page clickoutil passée par presse-papier + collage + décompression), pris pour LE flux du traqueur | le flux réel, que seul le `diagnostic` en production pouvait montrer : **aucun « Ajouter au panier »** dedans (`boutonsPanier: 0`) — le raccourci livre le TEXTE de la page, pas son HTML. Le parseur, prouvé sur la copie, découpait sur un bouton absent du vivant et rendait 0. Réécrit PAR LIGNES sur l'ancrage présent dans les deux corpus ; le gabarit de la porte ne contient plus ce bouton |

**Antidote** : §4.4 — le pire cas inclut « la donnée a changé depuis ».

⛔ **E-603 ajoute une frontière qui manquait** : certaines sources vivent
**hors du dépôt** — les raccourcis d'un iPad, une variable Vercel, une règle
Firestore déployée. Le dépôt n'en contient que des COPIES, et une copie ne
prouve rien. On demande, ou on lit une capture. On n'en déduit jamais.

**Portes** : `scripts/audit/p7-architecture.js` refuse un état d'identité non
réinitialisé — c'est lui qui a attrapé E-602 **sur moi**.
`scripts/check-traqueur.js` exige que `TRAQUEUR-URLS.md` porte en tête
« CE FICHIER EST UNE COPIE DE SECOURS. IL NE PROUVE RIEN. » — pour que le
prochain lecteur, moi compris, ne le reprenne pas pour la source.

⛔ **S6 de `garde-sortie.js`** — la seule porte qui pouvait attraper E-603 et
E-604, parce qu'elle ne vérifie pas le dépôt mais **ma parole**. Une phrase
qui affirme un fait sur son environnement (raccourci, Firestore, page
fournisseur, variable Vercel) est REFUSÉE si aucune capture venue de lui n'a
été lue dans le tour. Les questions et les demandes passent : punir le fait
de demander produirait l'inverse de l'effet voulu (E-208).

---

## O7 — LIRE LE SILENCE COMME UN SUCCÈS
*Mécanisme : la mesure **n'a pas eu lieu**, rien ne le dit, et j'appelle ça un
résultat. Distinct de O2, où l'instrument mesure — mal. Ici il ne mesure pas du
tout, et son silence ressemble trait pour trait à un succès.*

*Pourquoi il a échappé aux six premiers :* le projet avait déjà la maxime
« **non exécuté n'est PAS vert** »… écrite pour les **harnais** seulement. Ni
mes commandes de vérification, ni la CI elle-même n'y étaient soumises. Une
règle qui ne couvre qu'un endroit se fait contourner par tous les autres.

| N° | Ce que j'ai conclu | Ce qui s'était réellement passé | Ce qui l'a démenti |
|---|---|---|---|
| **E-701** | « la garde a mordu » | le `perl -0pi -e "s/^…/…/m"` n'a **jamais accroché** : fichier inchangé, contrôle vert faute d'avoir quoi que ce soit à attraper | `grep` du sabotage → **0** occurrence |
| **E-702** | « la garde a mordu » | la copie de l'outil, lancée depuis un autre dossier, est morte sur `ERR_MODULE_NOT_FOUND` **avant la première ligne utile** | le message d'erreur, que mon `grep "❌"` ne pouvait pas voir |
| **E-703** | « 7 harnais sur 8 étaient déjà rouges » | relevé lancé sur `x.mjs` là où le fichier s'appelle `x.js` → `MODULE_NOT_FOUND`, compté **vert** | relevé refait avec la vraie extension : **8 sur 8** |
| **E-704** | « les 19 empreintes sont identiques » | vrai des 14 fichiers touchés par l'outil seul ; **5 avaient été édités à la main** ensuite | `diff` des empreintes, qui a montré 5 écarts |
| **E-705** | « CI verte, donc les portes tournent » | `safeRequire` avalait toute porte **présente mais cassée** sous un `ℹ️ module manquant ignoré` — `audit/p3-endpoints` (authentification des points d'entrée) était **mort depuis la migration** | sabotage de la porte : CI restée **verte** |
| **E-706** | « commande non exécutée » | mon propre outil cherchait `Cannot find module` **n'importe où** dans la sortie : une commande qui tourne parfaitement peut l'imprimer. Fausse alerte de mon détecteur | la commande avait tourné, code 1, sortie complète |
| **E-707** | « lot complet : 68/68 harnais, 1115/1115 » | une SEULE exécution, annoncée comme un fait acquis. La seconde, sur le MÊME code, a rendu 67/68 : `pdp-specs` lisait une opacité animée à 1500 ms fixes, pile sur son seuil de 0,9 — et j'avais lancé deux lots EN PARALLÈLE, ce qui a suffi à faire basculer la mesure | seconde exécution du même code · mesure de l'opacité à 500/1500/3000/5000 ms |

**Antidote** : ne jamais conclure d'une **absence de signal**. Exiger une preuve
**positive** que la mesure a eu lieu — empreinte avant/après pour une écriture,
code de sortie **et** contenu pour une commande, nombre d'assertions rendues
pour un harnais.

**Portes** :
- `outils/sabotage.mjs` — refuse de conclure si la substitution n'a rien changé
  ou si la commande n'a pas tourné ; restaure et **vérifie** la restauration.
  *(Ferme E-701, E-702, E-703. E-706 est sa propre correction.)*
- `scripts/ci.js` — `safeRequire` distingue **fichier absent** (optionnel) de
  **porte présente et cassée** (échec net). *(Ferme E-705.)*
- `scripts/check-ancres.js` — attrape la cause n°1 des harnais qui meurent
  avant d'avoir testé quoi que ce soit.

⚠️ **E-704 n'a pas de porte** : ce n'est pas une mesure fausse, c'est un
**périmètre d'affirmation** trop large. L'antidote est §3 — dire sur quoi porte
exactement le chiffre qu'on annonce, dans la même phrase que le chiffre.

---

## Comment ce registre s'utilise

1. **Avant d'affirmer** quoi que ce soit d'engageant → relire **O1**.
2. **Avant de déclarer un contrôle vert** → relire **O2**.
3. **Avant de réutiliser** un motif, une classe, une regex → relire **O3**.
4. **Avant de conclure d'un silence** — commande sans erreur, sortie vide,
   contrôle qui n'a rien dit → relire **O7**. Une mesure qui n'a pas eu lieu
   ressemble à un succès.
5. **Une nouvelle erreur** → la classer dans une origine **existante**. Si
   aucune ne convient, c'est un mécanisme neuf : créer **O8**, et se demander
   pourquoi il a échappé aux sept premières.

⛔ **Ce registre ne grossit pas indéfiniment.** Une erreur qui répète un cas déjà
listé n'ajoute pas de ligne : elle incrémente le compteur de sa classe. On
mesure la **récidive**, pas le volume.
