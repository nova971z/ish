# REGISTRE DES LEÇONS — une panne, une porte

> **Une leçon sans dent est une anecdote.** Chaque ligne doit nommer le fichier
> qui la fait respecter, et `scripts/check-lecons.js` vérifie que ce fichier
> **existe** — sinon la CI rougit.
>
> Il ne juge pas si la porte est bonne : ça, c'est le **sabotage** qui le prouve.
> Il vérifie qu'elle existe. C'est le minimum, et c'est mécanique.

**Format** — quatre colonnes, sans exception :
`| date | ce qui a cassé | la cause | la porte qui l'empêche |`

---

## Leçons du 29/07/2026

| Date | Ce qui a cassé | La cause | La porte |
|---|---|---|---|
| 29/07/2026 | Site entièrement mort sur le domaine, chargement sans fin, aucun bouton | Le dernier recours du Service Worker redirigeait la page vers elle-même | `tests/sw-navigation.mjs` |
| 29/07/2026 | Écran noir possible si le démarrage échoue | Rien ne vérifiait que le watchdog inline se déclenche vraiment | `tests/boot-resilience.mjs` |
| 29/07/2026 | 4 captures d'écran des espaces client et livreur servies **publiquement** | Des harnais écrivaient leurs images à la racine du site, versionnées | `scripts/check-harnais.js` |
| 29/07/2026 | Le lanceur de tests annonçait +1 assertion par harnais | Sa propre ligne de bilan était comptée comme une assertion | `tests/lancer.mjs` |
| 29/07/2026 | La clé TOTP sortait de l'écran de l'iPad | Réutilisation d'un style taillé pour un code à 6 chiffres | `tests/mfa-cle-largeur.mjs` |
| 29/07/2026 | La voie du claim admin était **inatteignable** : retirer `ADMIN_SECRET` aurait verrouillé l'administration | La porte de l'interface ne regardait que le secret local, sans jamais interroger le serveur | `.claude/rules/donnees.md` |
| 29/07/2026 | Un droit d'accès admin aurait survécu à une déconnexion | Drapeau d'état non réinitialisé au changement de compte | `scripts/audit/p7-architecture.js` |
| 29/07/2026 | `CLAUDE.md` avait atteint 1 552 lignes, 79 règles noyées dedans | Rien n'empêchait d'y écrire | `scripts/check-memoire.js` |
| 29/07/2026 | L'entonnoir `ou.js` pouvait envoyer vers des fonctions renommées | Son index est le seul élément écrit à la main | `scripts/check-ou.js` |
| 29/07/2026 | `ou.js` construit le matin, utilisé **zéro fois** de la journée | Un protocole qu'on peut oublier est un vœu | `scripts/garde-entonnoir.js` |
| 29/07/2026 | Plafond d'`app.js` bloquant un correctif de sécurité | Le fichier était à 29 octets de sa limite | `D-014` |
| 29/07/2026 | Le domaine ne répondait plus depuis le Maroc | Migration vers des IP Vercel injoignables depuis cet opérateur | `D-013` |
| 29/07/2026 | 20 erreurs répétées sans qu'aucune trace ne dise **d'où** elles venaient | Rien ne classait les fautes par mécanisme : chacune semblait isolée, donc imprévisible | `scripts/erreurs.js` |
| 29/07/2026 | Prix, statut des livreurs et données personnelles éditables sans jamais lire ce qu'ils engagent | Le filet ne couvrait que le bogue ; l'infraction ne se manifeste pas à l'exécution | `scripts/juridique.js` |
| 29/07/2026 | Cette même porte ne couvrait que 8 fichiers sur 20 — `contact.js` et ses 91 marqueurs de données personnelles passaient au travers | La table de correspondance était écrite à la main et rien ne la confrontait au code | `docs/JURIDIQUE.md` |
| 29/07/2026 | La porte de sortie a REFUSÉ À TORT une réponse conversationnelle : le participe « vérifié » y était pris pour une déclaration de travail fait | Un contrôle peut être faux en refusant à tort, pas seulement en laissant passer — et le faux refus détruit la protection entière, car une porte qui gêne finit désactivée | `scripts/garde-sortie.js` |
| 29/07/2026 | La porte de sortie a refusé deux chiffres pourtant mesurés, dans un tour très long | Sa fenêtre de lecture du transcript était fixe : les mesures du début tombaient hors de vue | `scripts/garde-sortie.js` |
| 31/07/2026 | Le prix AFFICHÉ n'était pas celui qui serait DÉBITÉ sur 27 fiches — le serveur calcule depuis `price_ht`, `price` n'est qu'un affichage | Rien ne vérifiait que les deux restent égaux au centime | `scripts/check-prix-affiches.js` |
| 31/07/2026 | Le **prix d'achat fournisseur** de 3 produits était publié dans `products.json`, téléchargeable par tous | `/api/products` filtrait les champs internes ; le fichier statique, non — la protection n'existait que sur une des deux sources | `scripts/check-prix-fuite.js` |
| 31/07/2026 | Le traqueur de prix est tombé en `401` et **plus aucun prix fournisseur n'a été relevé** — découvert seulement parce que l'user a comparé un prix à la main | A5 a retiré `ADMIN_SECRET` de Vercel ; le raccourci iPad ne sait s'authentifier que par secret partagé, et `requireAdmin` s'exécutait avant tout le reste | `scripts/check-watch-auth.js` |
| 29/07/2026 | Une demande commerciale — « trier l'annuaire par prix », « prix barré » — ne réveillait AUCUNE des décisions qui l'interdisent | L'entonnoir route sur l'intention qu'on nomme ; une demande dangereuse se formule toujours par son bénéfice, jamais par le mécanisme enfreint | `scripts/interdits.js` |
| 29/07/2026 | Une fonction de remboursement fausse dans son usage réel passait 5 propriétés sur 6 — seul le rejeu en DEUX appels la démasquait | Mes jeux de propriétés découlent de la forme de l'énoncé, pas de la séquence d'appels réelle | `.claude/rules/harnais.md` |
| 29/07/2026 | En session longue, j'écrivais sur un fichier changé depuis ma dernière lecture — un `node -e` avait dupliqué le registre et l'édition a continué sur l'ancienne idée | Le protocole disait « relire plutôt que se fier à son souvenir » ; rien ne le faisait respecter | `scripts/garde-fraicheur.js` |
| 29/07/2026 | Promesses invérifiables livrées comme des faits : « sans risque », « il suffit de », « ça devrait marcher » | Aucune commande ne peut prouver une affirmation portant sur l'avenir, et rien n'interdisait de l'écrire | `scripts/garde-sortie.js` |
| 29/07/2026 | `manifest.webmanifest` servi aux visiteurs sans protection, et 21 fichiers serveur sur 28 sans liste de contrôle métier | Deux tables écrites à la main que rien ne confrontait au code réel — le même défaut qu'en juridique, ailleurs | `scripts/couverture.js` |
| 29/07/2026 | Six erreurs O1 — chiffres, fichiers et lignes inventés — sans qu'aucun mécanisme ne puisse les intercepter avant la réponse | Les portes ne surveillaient que l'ÉCRITURE de fichiers ; ma prose sortait sans contrôle | `scripts/garde-sortie.js` |
| 29/07/2026 | Un sabotage cru annulé restait en place : `git checkout` sur un fichier non suivi, échec avalé par un `ou-vrai` de complaisance | La restauration est un instrument comme un autre, et il n'était pas relu | `docs/ERREURS.md` |

## Leçons du 01/08/2026

| Date | Ce qui a cassé | La cause | La porte |
|---|---|---|---|
| 01/08/2026 | Les règles Firestore **déployées** étaient en retard sur le dépôt — il leur manquait `refunds/`, ajoutée des jours plus tôt | Rien ne compare ce qui est PUBLIÉ à ce qui est versionné. On l'a découvert par hasard, en diffant un copier-coller de l'user. Sans ce hasard, un champ ajouté au profil aurait fait échouer TOUT l'enregistrement en production, avec un fichier local parfaitement correct | `scripts/check-paiement.js` |
| 01/08/2026 | J'ai donné à l'user une commande de terminal (`npx firebase deploy`) alors qu'il travaille exclusivement sur iPad | Même mécanisme que « ouvre cette adresse dans ton navigateur » : je propose un geste sans vérifier qu'il est exécutable chez LUI. Une consigne inapplicable est une consigne fausse | `docs/ERREURS.md` |

⚠️ **La première leçon n'est protégée qu'à MOITIÉ, et il faut le dire.**
`check-paiement` vérifie que tout champ écrit par le front figure dans
l'allowlist du **fichier** `firestore.rules`. Il ne peut PAS vérifier ce qui est
réellement **déployé** — la CI n'a aucun accès à la console Firebase.

Le seul contrôle qui prouverait le déployé devrait tourner **dans le navigateur
d'un utilisateur connecté**, avec le SDK client (le seul soumis aux règles) :
tenter une écriture de profil et rapporter le refus. Tant qu'il n'existe pas,
le déploiement des règles reste une **étape humaine non vérifiée**, et c'est
écrit ici pour que personne ne croie le contraire.

| 01/08/2026 | Le tunnel de paiement livré **six fois** de suite avec un manque, trouvé par l'user à chaque fois : nom du titulaire, e-mail, téléphone, panier non vidé, fenêtre qui ne se ferme pas, bouton qui ment | Je corrigeais le point signalé et je livrais, sans jamais reculer pour lister ce qu'un tunnel DOIT contenir. Aucun de ces défauts n'était une panne : tout « marchait » | `scripts/check-tunnel-paiement.js` |

⚠️ **Cette porte est un PLANCHER, pas un plafond.** Elle vérifie la présence de
ce qui est fonctionnellement et légalement requis pour encaisser une carte —
elle ne dit pas si le formulaire est agréable. Un tunnel peut cocher ses quinze
cases et rester pénible. Elle empêche de livrer INCOMPLET, rien de plus.

| Date | Ce qui a cassé | La cause | La porte |
|---|---|---|---|
| 01/08/2026 | `audit/p3-endpoints` — l'audit d'**authentification des points d'entrée** — ne s'exécutait plus **depuis la migration Revolut**, et la CI affichait « ✅ tous les contrôles sont passés » | Il lisait `api/checkout.js` **au chargement du module** ; le fichier a été supprimé avec le tunnel de l'ancien encaisseur, `readFileSync` a jeté, et le `safeRequire` de la CI a rangé ça sous « ℹ️ module manquant ignoré ». Une porte présente mais illisible était traitée comme une porte optionnelle absente | `scripts/ci.js` |
| 01/08/2026 | Cinq harnais rouges depuis des jours, dont deux **morts avant de rendre une seule assertion** — zéro couverture sur le changement d'e-mail et sur le paiement avec coffret | Ils visaient des identifiants disparus (`#stripeCard`, `#payAddrCp`, `#acDate`) ou nommaient une catégorie du catalogue que l'user avait regroupée. L'interface bougeait sur SES décisions ; les harnais attendaient l'ancien monde et accusaient le produit | `scripts/check-ancres.js` |
| 01/08/2026 | Trois de mes propres sabotages ont **menti dans la même session** : j'ai annoncé « la porte mord » sur des mesures qui n'avaient jamais eu lieu | Deux motifs `perl` qui n'accrochaient pas (fichier inchangé), une commande lancée avec la mauvaise extension (`.mjs` contre `.js`). Aucune sortie ne contenait « ❌ », et j'ai lu ce silence comme un succès | `outils/sabotage.mjs` |

⚠️ **La leçon commune aux trois, et c'est la plus utile :** le projet possédait
déjà la règle — « **non exécuté n'est PAS vert** ». Elle était écrite pour les
harnais, et pour eux seuls. Ni la CI ni mes commandes de vérification n'y
étaient soumises. *Une règle vraie appliquée à un seul endroit ne protège que
cet endroit.* C'est l'origine **O7** du registre des erreurs.

| Date | Ce qui a cassé | La cause | La porte |
|---|---|---|---|
| 01/08/2026 | La règle entretenue du dock (`#dock, .dock`) ne commandait RIEN : la déplacer de 230 px ne changeait pas un pixel, et l'animation de repli `dock--hidden` était morte | Un bloc de secours historique `#dock{…}` TOUT en `!important`, 3 400 lignes plus loin, écrasait position, bottom et transform en silence — même maladie que `.acc-logout-btn` écrasé par `.actions .btn`. Découvert en sabordant la vraie règle : quatre sabotages sans effet ont fini par le trahir | `tests/chevauchement.mjs` |

⚠️ **Ce que `check-ancres` ne fait PAS.** Elle vérifie qu'un identifiant visé
EXISTE. Elle ne dit rien de sa **visibilité** — `verify-h5` mourait sur un champ
bien présent, mais dans un onglet masqué — ni des ancres de **données**
(catégorie, marque), invérifiables puisque le catalogue change tous les jours.
C'est un plancher : « le harnais ne vise pas un fantôme », pas « le harnais est
juste ».

⚠️ **Et elle n'a pas pu consulter les références externes** : `stripe.com`,
`legifrance.gouv.fr` et `economie.gouv.fr` répondent 403 depuis l'environnement
de travail. Ses exigences viennent du PROJET — `docs/JURIDIQUE.md`, harnais
existants, décisions écrites — et des types du paquet officiel Revolut. Ce qui
n'a pas pu être vérifié à la source y est dit comme tel.

| 01/08/2026 | Je livrais des écrans que je n'avais **jamais regardés tourner** — six allers-retours sur le tunnel de paiement, chaque défaut visuel trouvé par l'user sur son iPad | Playwright et Chromium sont installés, les harnais s'en servent déjà : rien n'empêchait de lancer la page et de la regarder. Paresse de méthode, pas limite technique | `outils/vue.mjs` |
| 01/08/2026 | Deux boutons **étirés en pavés de couleur** sur la page compte (« Se déconnecter », « Gérer la double authentification »), présents dans le dépôt sans que personne les voie | `.actions` imbriqué dans `.specs`, qui est un `display:flex` : le bouton s'étire sur toute la hauteur de la carte. Aucun test ne regarde un écran, et aucune règle ne disait où va `.actions` | `scripts/check-ecrans.js` |

| 01/08/2026 | Le tunnel abandonnait la commande — « Le paiement par carte sera bientôt disponible » — quand `window.Stripe` était absent, **alors que Revolut encaisse**. Un client dont le navigateur bloque `js.stripe.com` (bloqueur, proxy d'entreprise) perdait la vente, sans message utile ni trace | `initStripeElements` testait `getStripe()` AVANT d'appeler le serveur. Or c'est le serveur qui dit qui encaisse : le front n'a aucun moyen de le savoir avant sa réponse. Le SDK d'un fournisseur ne peut pas conditionner le tunnel de l'autre | `scripts/check-tunnel-paiement.js` |
| 01/08/2026 | La fenêtre de paiement annonçait « Paiement sécurisé par **Stripe** » pendant que Revolut encaissait, à l'instant précis où le client donne son numéro de carte | DEUX sources, corrigées séparément : le texte statique d'`index.html`, **et** `var _paiementFournisseur = 'stripe'` — j'avais cru n'avoir qu'un texte à changer. Vu en bac à sable, pas en relisant | `scripts/check-tunnel-paiement.js` |

| 01/08/2026 | L'adresse personnelle de l'user était écrite **deux fois en dur** dans `app.js`, fichier servi à tous les visiteurs — et elle **désignait nommément le compte dispensé de pièces justificatives** | Le front portait une copie de la liste serveur « pour le confort d'affichage ». Une liste d'exemption dans un fichier public ne fuit pas seulement une adresse : elle publie la cible à viser. Le serveur répond désormais deux booléens pour le seul compte authentifié | `scripts/check-fuites.js` |
| 01/08/2026 | Une assertion du harnais `couriers` était **rouge en silence** : « le paiement porte le marqueur de la course » → *aucun*. Elle l'était depuis que l'e-mail et le téléphone sont devenus obligatoires | Le harnais remplissait un formulaire qui n'existait plus. `validatePayAddress()` rendait `valid:false`, aucune commande n'était créée — et rien ne disait si le rouge accusait le code ou le test | `tests/couriers.mjs`|
| 01/08/2026 | `styles.css` servait **20 795 octets gzip de commentaires** à chaque visite — et l'user navigue en privé, donc aucun cache ne les amortit : retéléchargés à chaque fois, par lui et par ses clients | Rien ne mesurait la part de commentaire dans un fichier servi. Le budget total était saturé à 400,1 Ko sur 400, ce qui bloquait tout ajout | `outils/purge-css.mjs` + `docs/CSS-CARTE.md` |

⚠️ **Rien n'a été perdu du CSS.** Les 382 blocs sont dans `docs/CSS-CARTE.md`,
rattachés à leur **sélecteur** — jamais à un numéro de ligne, qui se périme.
L'outil refuse d'écrire si la liste des déclarations CSS change : **7 803
avant, 7 803 après**, vérifié à chaque exécution et prouvé par sabotage.

⚠️ **`check-fuites.js` s'est trompé en refusant à tort** avant d'être juste :
son critère de gabarit téléphonique attendait les zéros juste après
l'indicatif (`^0[67]0{8}$`), alors que le gabarit du site est `06 90 00 00 00`.
Il refusait donc un gabarit légitime — et un refus à tort finit par faire
désactiver la porte (E-208). Le critère réel est une longue suite de chiffres
identiques : aucun numéro attribué n'en porte six.

⚠️ **Le logo Revolut n'a PAS été dessiné.** `revolut.com` et
`assets.revolut.com` répondent `000` (CONNECT refusé par la politique réseau),
et le paquet officiel `@revolut/checkout@1.1.25` ne contient aucune image —
`tar tzf … | grep -icE '\.svg|\.png'` → 0. Redessiner une marque de mémoire,
c'est l'inventer. C'est l'user qui a fourni le R ; `outils/icone-revolut.mjs`
le compose sans le retoucher, sur des couleurs ÉCHANTILLONNÉES sur sa capture
d'écran (#313131 → #141414).

⚠️ **Cet outil porte un DÉTECTEUR DE FORMAT, exigé par l'user**, après que
j'eus commencé à écrire un détourage par luminance inutile : le fichier reçu
était un WebP au damier aplati (`alphaMin: 255`), pas le PNG envoyé — la
conversion s'était faite dans le tuyau, en silence. Il constate désormais la
signature (octets magiques), le type de couleur IHDR, **et** l'alpha réel
pixel par pixel — un RGBA dont tous les alpha valent 255 est un fichier opaque
déguisé. Sans alpha exploitable, il s'ARRÊTE au lieu de bricoler.

⚠️ **`outils/vue.mjs` ne prouve PAS la conformité.** Il montre l'écran d'un
Chromium, sur une machine, réseau externe coupé. Il ne dit rien du rendu sur
iPad en navigation privée. C'est un garde-fou contre le grossier — la seule
preuve qui vaille reste l'écran de l'user. Son option `--connecte` ne pose
aucune béquille dans le produit : elle intercepte la requête vers
`firebase-init.js` et sert un module qui remplit le même contrat.

⚠️ **`check-ecrans.js`, c'est `check-tunnel-paiement.js` étendu à tout le
site**, demandé le 01/08/2026 : « à chaque fois qu'on va créer quelque chose
sur le site, on se réfère à ce qui existe déjà sur les plus grandes
institutions et notre CSS doit être en accord ». Il ne juge **rien** de
l'esthétique : identifiants uniques, `.actions` bien placé, champs étiquetés,
boutons nommés, style en dur qui ne remonte pas. Le reste se REGARDE.

⚠️ **Il s'est trompé DEUX FOIS avant d'être juste** (E-221 puis E-222) : vert
par construction, puis refusant à tort trois blocs sains. Les deux sens du faux
instrument, dans le même contrôle, à quelques minutes d'écart. C'est le
sabotage qui a tranché les deux fois — pas la relecture.

⚠️ **La seconde n'a AUCUNE porte mécanique, et il faut le dire aussi.**
`docs/ERREURS.md` est un registre relu à chaque intention (`node scripts/erreurs.js`),
pas un contrôle : rien ne rougit si je propose demain une commande de terminal
à quelqu'un qui n'en a pas. La seule dent réelle est la mémoire projet, qui dit
noir sur blanc que l'user travaille **sur iPad, en navigation privée**. Une
consigne se vérifie donc contre CE contexte avant d'être donnée — pas après.

---
| 09/08/2026 | TOUS les builds Vercel en ERROR pendant ~9 h — Production figée sur l'ancien commit, 8 lots annoncés « déployés » alors que rien n'était en ligne | Des clés `"comment"` ajoutées dans `vercel.json` (schéma strict : propriété inconnue = build refusé) ; et la porte de fin de lot ne vérifiait que GIT, jamais le BUILD — poussé n'est pas construit, construit n'est pas servi | `outils/verifier-pousse.mjs` |
| 01/08/2026 | Le quota Firestore gratuit s'est ÉPUISÉ en une soirée : le site est retombé sur les prix du fichier de base, périmés, servis comme des vrais | Chaque rendu à froid lisait la collection d'overrides ENTIÈRE (~1 700 lectures) ; personne n'avait de budget de lectures par consommateur, la dépense était invisible jusqu'à l'épuisement | `api/_lib/snapshot.js` |
| 01/08/2026 | Le MÊME soir, le comparateur de prix a commencé à refuser les pages (limitation de débit) — deux services tiers en panne simultanée, aucun des deux détecté par le code | Cadence de balayage régulière et rapprochée, aucune détection de refus, aucune retenue : le traqueur continuait d'écrire comme si les pages étaient saines | `api/_lib/price-parse.js` |
| 08/08/2026 | Firebase à la limite : le site a AFFICHÉ des prix d'avant les hausses en attente — périmés mais achetables, sans aucun avertissement à l'écran | Le repli servait la dernière copie disponible sans HORODATAGE ni statut : rien ne distinguait un prix vivant d'une copie morte, ni à l'écran ni à l'encaissement | `api/_lib/catalog.js` |
| 09/08/2026 | (héritée, documentée dans `docs/PLAN-REMEDIATION.md`) La formule de prix client `calcPrice` existait en PLUSIEURS copies — favoris et « récemment vus » affichaient un prix non taxé : dérive de prix entre pages | Une formule d'argent recopiée diverge en silence ; aucune porte ne comparait les copies entre elles | `scripts/check-pricing.js` |
| 09/08/2026 | (héritée, rapportée par l'user) Un plafond de majoration a fait vendre À PERTE pendant que la suite de tests entière était verte | Tous les tests vérifiaient le code avec le code : aucune valeur attendue calculée À LA MAIN, hors du module testé — l'oracle et le testé étaient la même personne | `audit/admin/oracle-argent.mjs` |
| 09/08/2026 | Un `npm install` a SUPPRIMÉ les bibliothèques d'analyse syntaxique (absentes du manifeste) : la porte d'extraction admin est morte sur le coup | Des outils de CI importaient des modules jamais déclarés dans `package.json` — l'installation propre était léthale et personne ne la rejouait | `scripts/check-deps.js` |
| 09/08/2026 | Le traqueur laissait **517 tuiles sur 1 094** partir aux rejets ALORS QUE LEUR PRIX ÉTAIT DANS LA PAGE — 124 fiches du catalogue restaient sur un coût SUPPOSÉ, et l'écran d'administration les comptait comme « estimés » sans que rien n'explique pourquoi | Le chemin « carte » du parseur ne cherchait la référence QU'AU PREMIER MOT après la marque. Le site écrit les machines « marque + réf + description » (lues : 45/45) et les accessoires « marque + description + réf » (perdues). Une garde posée sur un seul gabarit ne garde qu'un gabarit | `api/_lib/price-parse.js` |
| 09/08/2026 | Le traqueur voulait faire MONTER des prix sur la foi d'une tuile plus chère, alors que la MOINS CHÈRE était sur la même page : meuleuse à 225,42 € au lieu de 204,23 €, souffleur à 244,13 € au lieu de 145,48 € (98,65 € de trop par vente) | Le comparateur écrit certaines cartes avec la référence ÉCLATÉE PAR DES ESPACES (« <marque> DCG 405 N »). Le parseur refuse de recoller — à raison — et la carte partait aux rejets ; il ne restait qu'une tuile plus chère, qui faisait le coût. Une garde prudente au bon endroit peut coûter de l'argent AILLEURS si rien ne rattrape ce qu'elle écarte | `api/_lib/price-parse.js` |
| 09/08/2026 | UNE page de balayage sur 67 est revenue en ERREUR ENTIÈRE (« documentPath must point to a document ») : ~60 relevés perdus d'un coup, à cause d'UN seul produit dont l'identifiant contient une barre oblique (référence constructeur à `/`) | La base lit la barre comme un séparateur de chemin et refuse l'écriture ; l'exception remontait jusqu'au point d'entrée, sans try/catch par fiche. Un produit pouvait donc en emporter soixante — et rien ne le disait | `api/admin.js` |
| 09/08/2026 | Le balayage MAKITA tournait à 11,24 s/page contre 3,51 s pour celui de 67 pages — l'user : « j'ai l'impression que c'est encore plus long » | La réponse pesait 63 Ko dont **55 Ko pour la seule liste des fiches jamais vues** (605 entrées, nom compris), renvoyée à CHAQUE page : 5,7 Mo de la même liste sur 112 pages, transférés puis empilés dans le raccourci. On avait cherché la lenteur du côté du CALCUL (2,38 ms/page mesurés, négligeables) alors qu'elle était dans le POIDS DE LA RÉPONSE | `api/admin.js` |
| 09/08/2026 | L'onglet stats admin mort en PROD (« A.$$ is not a function ») alors que tous les harnais étaient verts | `$$` dans la chaîne de remplacement de String.replace est un MOTIF SPÉCIAL : le symbole partagé `$$` était exposé sous le nom `$` — et le fichier régénéré étant identique au corrompu, la comparaison « à jour » ne voyait rien | `scripts/extraire-admin.js` |
| 10/08/2026 | **4 400 lectures Firestore pour 3 écritures en deux minutes** de balayage — le quota gratuit journalier (50 k) crevé par un seul traqueur, alors que le snapshot en 4 documents existait DEPUIS LA VEILLE | Une optimisation posée à UN endroit (`catalog.js`) et jamais propagée : le traqueur et trois écrans d'administration lisaient toujours `product_overrides` en entier (~1 708 documents). Le cache de rafale masquait la dépense — il ne protège QUE l'instance sans serveur qui l'a rempli, et 2 pages sur 112 sont parties froides. **Une correction locale n'est pas une correction tant que tous les appelants du même besoin ne sont pas passés par le même chemin** | `scripts/check-price-watch.js` |
| 10/08/2026 | La base factice du harnais du traqueur MENTAIT dans le sens rassurant : ses écritures de `product_overrides` étaient invisibles à ses propres lectures | Un simulacre qui n'est pas COHÉRENT rend des scénarios que la production ne produira jamais — ici, chaque page relisait un catalogue vierge, ce qui faisait passer pour « appliqué » ce qui est en réalité « inchangé ». Le jour où le code est devenu correct, c'est le HARNAIS qui est devenu rouge | `scripts/check-price-watch.js` |
| 10/08/2026 | Le rapprochement par configuration — livré la veille comme LE remède au premier poste de non-reconnaissance — a rendu **0 sur 112 pages**, alors que le relevé portait **886 annonces énonçant leur nombre de batteries** | Le point d'entrée lui passait une liste **encore vide** à cet endroit du fichier : elle ne se remplit qu'au fil de la boucle d'écriture, ~120 lignes plus bas. La règle était juste et ses assertions UNITAIRES vertes — elles appellent la fonction directement et ne peuvent pas voir un branchement mort. **Une passe qui ne reçoit rien reste verte pour toujours** : seule une assertion qui traverse le POINT D'ENTRÉE la démasque | `scripts/check-price-watch.js` |
| 10/08/2026 | La liste des fiches jamais vues, « différée à la dernière page » la veille, n'est **JAMAIS partie** : 0 page sur 112, sur deux balayages | Le balayage se répartit sur PLUSIEURS instances sans serveur (mesuré 110+2, puis 111+1) et le cumul vit dans la mémoire d'UNE instance : aucune n'a jamais vu « toutes les pages », donc la condition « il n'en manque plus aucune » n'a pu être vraie nulle part. **Une condition qui ne peut pas devenir vraie n'est pas un différé, c'est une suppression** — et rien ne la distinguait d'un différé qui marche | `scripts/check-price-watch.js` |
| 10/08/2026 | **Troisième fois en deux jours** : une information CALCULÉE par le serveur et jamais rendue. D'abord le contenu des annonces (batteries / chargeur / coffret), puis le rapprochement par configuration, puis le CLASSEMENT — famille et type, calculés sur la ligne de description de chaque tuile, absents de la réponse | La réponse était taillée sur la question du moment (« quel prix ? ») et jamais réexaminée quand la question a changé (« que faut-il créer ? »). Le symptôme est toujours le même : depuis la réponse, la donnée qui tranche a l'air de ne pas exister — et on cherche à la reconstruire dehors. **Ce qui est lu se rend**, en forme compacte, sinon la mesure suivante se fera sur du vide | `scripts/check-price-watch.js` |
| 10/08/2026 | **QUATRIÈME fois** la même faute, et la pire : le parseur FABRIQUAIT le nom rendu (`marque + réf`) juste après avoir lu le vrai titre et la description de la carte. J'en ai conclu, et ANNONCÉ à l'user, que « les tuiles de cette marque ne portent pas de description » — sur quoi il a fallu trois tours pour revenir | Un champ CONSTRUIT ressemble à un champ LU : rien ne distinguait « MARQUE RÉF » d'un titre réellement pauvre. J'ai donc raisonné sur ma propre fabrication et déclaré une limite de la SOURCE là où il n'y avait qu'une amputation de ma RÉPONSE. **Une donnée qu'on reconstruit doit se signaler comme telle** — et la mesure qui tranche existait : 2 991 types lus, 2 991 absents du nom rendu | `scripts/check-price-watch.js` |
| 10/08/2026 | Une RÈGLE MÉTIER donnée par l'user — « référence sans suffixe + description qui ne parle que de l'outil = outil nu » — appliquée pour une marque, jamais ÉCRITE, donc perdue au moment de traiter la seconde. Il a dû la redire, et me le reprocher | Une règle qui ne vit que dans la conversation n'existe pas : elle ne se relit pas, ne se teste pas, ne se transporte pas d'une marque à l'autre. **Toute règle dictée par l'user se grave dans le CODE avec sa mesure, le jour où elle est dite** — ici elle valait 445 rapprochements sur 574, et elle est restée inexploitée pendant deux marques | `scripts/check-price-watch.js` |
| 10/08/2026 | Le premier jet de cette règle rapprochait une **butée parallèle à 14,49 €** de la fiche d'une **scie plongeante** | Un ACCESSOIRE porte la référence de la machine sur laquelle il se monte : la référence seule ne dit pas si on tient l'article ou sa compatibilité. La garde manquante n'était pas dans la règle mais dans son domaine : elle ne vaut que si l'annonce est typée MACHINE. **Une règle juste appliquée hors de son domaine devient un défaut d'argent** — et c'est la MESURE qui l'a montrée, pas la relecture | `scripts/check-price-watch.js` |
| 10/08/2026 | **Deuxième fois** que l'ajout de PNG sur une fiche échoue chez l'user : toute photo réelle de 2 000 px était REFUSÉE, et le message lui renvoyait le travail (« recadre-la sur le produit ») | La préparation FIXAIT le côté et ne faisait descendre que la QUALITÉ : sur une image dense, même au palier le plus bas, le poids restait au-dessus du plafond. Et le harnais ne pouvait pas le voir — **son cas d'essai était un PNG de 1×1 pixel**. Un jeu d'essai plus léger que le pire cas réel ne teste rien : il mesure la fonction sur une entrée qui ne se produit jamais | `tests/admin-fiche.mjs` |
| 10/08/2026 | L'user a conclu deux fois « ça ne marche pas » sans jamais savoir POURQUOI | Le succès criait (bandeau vert) mais l'échec chuchotait : la ligne d'état vit à l'intérieur du panneau, souvent hors écran sur un iPad. **Un canal de retour asymétrique fabrique des pannes sans cause** — celui qui échoue est précisément celui qui a besoin de lire | `tests/admin-fiche.mjs` |
| 10/08/2026 | Troisième balayage, la liste des fiches jamais vues n'arrivait toujours pas — alors que le correctif précédent était en ligne | Deux comptes confondus : les pages au CONTENU DISTINCT (couverture) et les pages TRAITÉES (fin de boucle). Le fournisseur ressert la même page au-delà d'un certain rang — **110 pages traitées, 43 en double, 67 distinctes** — donc « il manque 45 pages » restait vrai alors que le raccourci avait fini. **Un critère juste pour une question l'est rarement pour une autre** : la liste attend la FIN, pas la couverture | `scripts/check-price-watch.js` |

---

## Comment on s'en sert

1. Une panne survient → on la corrige.
2. **On écrit la ligne ici** : ce qui a cassé, la cause, la porte.
3. **La porte doit exister** — sinon la CI refuse la livraison.
4. **La porte doit être prouvée faillible** : on réintroduit le défaut, elle rougit.

⛔ Une leçon dont la colonne « porte » est vide n'est pas acceptée. Si la
protection n'existe pas encore, on l'écrit **avant** de clore la panne — ou on
dit explicitement qu'elle reste non protégée, et pourquoi.
