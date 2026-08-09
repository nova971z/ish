# Règles du build et de la CI — hermétisme, installation fraîche, repères

*Gravées le 09/08/2026 (intégration V2). Chaque règle cite la panne qui l'a
payée (registre : `docs/LECONS.md`) et sa porte. Une règle sans porte le dit.*

## Statut d'un build — la vérification n'appartient plus à personne

**Ma session ne voit ni le site ni l'API de la plateforme d'hébergement**
(mesuré le 09/08/2026, définitif : `api.vercel.com` ET `pirates-tools.com`
→ CONNECT 403 du proxy). Un jeton d'API n'y changerait rien : le blocage est
réseau, pas d'authentification. C'est dit ici UNE fois — on ne le redécouvre
plus, on ne redemande plus.
**Conséquence, en deux temps :**
1. Fin de lot : `node outils/verifier-pousse.mjs`, puis la formulation exacte
   **« poussé, build non prouvé »**. Jamais « déployé » sans preuve.
2. Killian active **UNE FOIS** les notifications d'échec de déploiement par
   e-mail chez l'hébergeur — deux gestes : avatar → Settings → **Notifications**,
   puis dans la section déploiements activer **« Deployment Failed » (e-mail)**
   *(libellés à retrouver sur place : l'écran exact peut différer, ma session
   ne peut pas le vérifier)*. Ensuite : **le silence vaut succès, un e-mail
   vaut échec** — plus aucune vérification active de sa part, jamais.
⛔ **Un identifiant servi plus vieux que celui annoncé, au-delà du délai normal
de build, est un BUILD CASSÉ — pas un retard.** (Panne payée : ~9 h de builds
en erreur, 8 lots annoncés « déployés », rien en ligne — leçon du 09/08/2026.)
*Porte* : `outils/verifier-pousse.mjs` (SHA poussé prouvé ; preuve de build
tentée et son impossibilité DITE). Les faits que Killian a vérifiés vivent
dans `docs/ETAT-DASHBOARD.md` : on les relit, on ne les redemande jamais.

## Build hermétique — la construction ne lit AUCUN service de données

**Une étape de build ne dépend jamais d'un service externe** (base de données,
API tierce) : elle lit le dépôt, rien d'autre.
*Panne payée* : builds en ERROR en série, production figée ~9 h (09/08/2026)
— la cause était un schéma de configuration strict, mais la leçon vaut plus
large : tout ce que le build LIT peut le tuer, et un build qui lit un service
de données meurt quand le service tombe.
*État mesuré au jour du gravage* : `package.json` ne déclare **aucun** script
`build` — le déploiement sert les fichiers du dépôt tels quels, les fichiers
générés (`styles.min.css`, `app.visitor.js`, `index.html`, catalogue allégé)
sont **générés en local et versionnés**, leurs portes `--verifie` tournent
dans `ci.js`. La construction chez l'hébergeur ne lit donc aucun service de
données par CONSTRUCTION.
*Porte* : les portes `--verifie` des générateurs (dans `ci.js`) + la présente
règle pour tout script de build futur. Un « test build coupé du réseau » ne
peut pas se rejouer d'ici (le build vit chez l'hébergeur) — déclaratif sur ce
point, et dit.

## CI valable sur installation fraîche — tout import vit au manifeste

**Tout module importé par l'outillage (scripts, outils, tests, API) est
déclaré dans `package.json`.** Une CI qui ne survit pas à `npm install` sur
machine vierge est une CI locale, donc morte demain.
*Panne payée* : les bibliothèques d'analyse syntaxique de l'extraction admin
n'étaient pas au manifeste — un `npm install` les a SUPPRIMÉES et la porte de
l'ordre 9 est morte sur le coup (09/08/2026).
*Porte* : `scripts/check-deps.js` (branchée dans `ci.js`) — relit tous les
`require()` de l'outillage et refuse tout module ni natif ni déclaré
(sabotée le 09/08/2026, rouge). Le rejeu périodique après installation
propre reste un geste manuel : déclaratif, et dit.

## Un repère de performance est BLOQUANT, ou désarmé daté-motivé

**Un repère qu'on peut crever sans conséquence n'est pas un repère.** Soit il
casse la CI, soit son désarmement est écrit dans `docs/DECISIONS.md` avec le
motif ET la date de réarmement.
*Panne payée* : le repère de poids total « informatif » depuis le 01/08/2026
— crevé pendant des semaines sans qu'aucune alarme ne sonne (constaté le
08/08 : dépassement annoncé en passant dans un compte-rendu, personne n'avait
décidé de l'accepter).
*État au jour du gravage (mesuré)* : la panne est DÉJÀ close — la décision
**D-021** (08/08/2026, « Le total servi à froid redevient une porte BLOQUANTE,
P8.4 ≤ 400 Ko ») a réarmé le repère total, sabotage prouvé. Les plafonds PAR
FICHIER restent bloquants (D-014). La règle est gravée pour la PROCHAINE fois
qu'un repère se désarme « en passant ».
*Porte* : `scripts/audit/p8-perf.js` (P8.4 bloquant, D-021) + `check-memoire`
M7 (deux décisions actives contradictoires).
