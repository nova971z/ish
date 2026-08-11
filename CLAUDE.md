# Mémoire projet — Pirates Tools

Boutique d'outillage professionnel. PWA en HTML/CSS/JS sans framework, API sans
serveur sur Vercel, Firebase, Stripe. Le code vit dans `pirates-tools/`.
On travaille **directement sur `master`** : Vercel ne déploie que lui.

## Par où commencer — une seule commande

```bash
cd pirates-tools && node scripts/ou.js "ce que je veux faire"
```

Six blocs : où intervenir · ce qui protège · règles applicables · pièges déjà payés ·
décisions en vigueur · « fini » ici. Intention inconnue : elle le dit et demande de l'ajouter — jamais « rien ».

## Où vit quoi

| Ce que je cherche | Fichier |
|---|---|
| Ce qui reste à faire, avec sa preuve | `pirates-tools/docs/ETAT.md` |
| Pourquoi tel choix, et ce qu'il a renversé | `pirates-tools/docs/DECISIONS.md` |
| Les règles opposables, par domaine | `.claude/rules/` *(chargées toutes seules)* |
| Comment le site est fait | `pirates-tools/docs/CARTOGRAPHIE.md` |
| Fiscalité, statut, TVA | `pirates-tools/docs/METHODE-ENTREPRISE-FISCALITE.md` |
| **Comment on s'y prend** — les techniques, nommées | `pirates-tools/docs/METHODES.md` *(43 méthodes, `M-01` à `M-43`)* |
| L'histoire du projet · où en est le chantier | `pirates-tools/docs/JOURNAL.md` · `AVANCEMENT-FONDATIONS.md` |
| Une panne, sa cause, la porte posée | `pirates-tools/docs/LECONS.md` |
| **Ce que l'user a demandé, et où ça en est** | `pirates-tools/docs/DEMANDES.md` *(porte : `check-demandes`)* |
| **D'où viennent mes erreurs**, par mécanisme | `pirates-tools/docs/ERREURS.md` *(`node scripts/erreurs.js`)* |
| **Ce qui engage juridiquement** — la porte à ouvrir | `pirates-tools/docs/JURIDIQUE.md` *(`node scripts/juridique.js`)* |
| La liste de tous les documents | `pirates-tools/docs/INDEX-DOCS.md` |

Ouvrir `sw.js` charge `front.md` ; `api/contact.js` charge `livraison.md`.

<!-- REGLES-UNIVERSELLES:DEBUT -->
## Ce qui vaut partout, tout le temps

**Qui est l'user.** Il est **au Maroc** ; l'entreprise est en Guadeloupe — ne jamais
déduire l'un de l'autre. Il travaille **sur iPad, en navigation privée exclusivement** :
aucun service worker, aucun cache, stockage local vide entre deux visites — aucun
diagnostic le concernant ne peut s'appuyer là-dessus. Il n'a **ni téléphone ni données
cellulaires** : jamais de test en 4G, ni de code à scanner depuis un autre appareil.
**Ses achats fournisseurs sont livrés en FRANCE MÉTROPOLITAINE** *(gravé 02/08/2026)* : port marchand le plus souvent gratuit, frais/délais éventuels écrits sur la carte produit (machines très lourdes) ; l'acheminement vers la Guadeloupe relève du modèle de prix, jamais du jugement d'un fournisseur.

**Que du quantifiable.** Aucun chiffre sans la commande qui l'a produit, aucun exemple sans l'avoir exécuté. Un chiffre estimé présenté comme mesuré est un mensonge.

**Une vérification qu'on ne parvient pas à faire échouer ne vérifie rien** : tout contrôle neuf se prouve faillible en réintroduisant le défaut.

**Ne jamais se fier au retour d'une écriture : relire.** Une configuration se vérifie par une lecture séparée, jamais par un message de succès.

**« Ça ne marche pas » veut dire : chercher la cause en amont.** Griser un
bouton ou contourner, c'est masquer le symptôme ; le défaut, lui, reste.

**Jamais de béquille de test dans le produit.** Devant une impossibilité, on la signale ; on ne la contourne pas dans ce que verront les clients.

**L'ordre de priorité ne se négocie pas** : argent, sécurité, fonctionnel, structure, finition.

**Sur une question factuelle, on cherche la réponse** — sources officielles, sourcée et datée. Ne jamais renvoyer l'user vers quelqu'un d'autre.

**Aucun secret ne quitte Vercel** — ni code, ni règle, ni conversation. Un état se partage, une suite de caractères aléatoires non : filtrer toute sortie de commande.

⛔ **On ne commente jamais l'état de l'user** — ni sommeil, ni fatigue, ni l'heure chez lui. On répond au travail demandé, point.
⛔ **Format de TOUT message à l'user** *(gravé 08/08, amendé 09/08/2026)* : le bloc **CSV** (`;`, en-tête, une ligne par point), puis EN DESSOUS des **explications numérotées en mots simples** — courtes, jamais un pavé. Le doute est une cellule, jamais une invention.
⛔ **Statut d'un build Vercel** *(gravé 09/08/2026, amendé le soir)* : `api.vercel.com` et le site sont injoignables de ma session (mesuré, DÉFINITIF : CONNECT 403) — fin de lot = `verifier-pousse` puis « **poussé, build non prouvé** », jamais « déployé ». Killian active UNE FOIS les notifications d'échec de déploiement par e-mail (2 gestes, `.claude/rules/build.md`) : le **silence vaut succès, un e-mail vaut échec** — plus aucune vérification active de sa part. Un SHA servi plus vieux qu'annoncé au-delà du délai normal de build est un **BUILD CASSÉ**, pas un retard. Ses faits vérifiés vivent dans `docs/ETAT-DASHBOARD.md` : on les relit, on ne les redemande jamais.

**La mémoire du projet est ce seul fichier**, à la racine du dépôt.
<!-- REGLES-UNIVERSELLES:FIN -->

## Avant de livrer

```bash
cd pirates-tools && node scripts/ci.js && node tests/lancer.mjs --noyau
```

Toucher à un fichier servi impose d'aligner `sw.js` (`VERSION`, `ASSET_VER`) et les `?v=` de `index.html` — la CI le vérifie.

## Si l'aiguillage est cassé

`scripts/ou.js` absent ou fautif : lire `pirates-tools/docs/CARTOGRAPHIE.md`, puis
`pirates-tools/docs/JOURNAL.md` — l'historique intégral. Rien n'a été supprimé.
