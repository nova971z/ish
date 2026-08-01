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
