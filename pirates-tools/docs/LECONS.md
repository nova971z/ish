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

## Comment on s'en sert

1. Une panne survient → on la corrige.
2. **On écrit la ligne ici** : ce qui a cassé, la cause, la porte.
3. **La porte doit exister** — sinon la CI refuse la livraison.
4. **La porte doit être prouvée faillible** : on réintroduit le défaut, elle rougit.

⛔ Une leçon dont la colonne « porte » est vide n'est pas acceptée. Si la
protection n'existe pas encore, on l'écrit **avant** de clore la panne — ou on
dit explicitement qu'elle reste non protégée, et pourquoi.
