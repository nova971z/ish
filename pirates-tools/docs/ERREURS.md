# REGISTRE DES ERREURS — classées par ORIGINE

> **Une erreur ne vient jamais de partout.** Elle vient d'un mécanisme précis,
> et le même mécanisme reproduit la même erreur. Ce registre classe donc par
> **cause racine**, jamais par ordre chronologique : on lit **une classe**, pas
> tout le fichier.
>
> Injecté à chaque message par le hook — mais **seulement le sommaire**.
> Le détail se lit à la demande : `node scripts/erreurs.js --classe O1`

---

## SOMMAIRE — six origines, rien de plus

| Origine | Mécanisme | Cas | Antidote | Porte |
|---|---|---|---|---|
| **O1** | Affirmer avant de mesurer | 7 | §3 · §8 | `garde-sortie.js` *(hook Stop)* |
| **O2** | L'instrument de mesure est faux | 8 | §4.3 | sabotage obligatoire |
| **O3** | Réutiliser sans vérifier le contexte | 6 | §1.4 | `check-lecons.js` |
| **O4** | Contrainte connue, non appliquée | 3 | §1 | `garde-entonnoir.js` |
| **O5** | Outil artisanal au lieu de l'outil existant | 1 | §1.4 | aucune — humaine |
| **O6** | Copie périmée au lieu de la source vivante | 2 | §4.4 | `p7-architecture.js` |

**27 erreurs, 6 mécanismes.** O1 et O2 en concentrent **15 à elles deux** :
c'est là qu'il faut regarder en premier, toujours.

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
| **E-105** | « la plage 64.29.17.x est cassée » | `ish-ebon` y répondait | comparaison des 3 adresses |
| **E-106** | la porte juridique « couvre ce qui engage » | 8 fichiers sur **20** | sondes sur le code : `contact.js` = 91 marqueurs |
| **E-107** | l'entonnoir « protège ce qui est servi » | `manifest.webmanifest` servi sans protection ; **21 fichiers serveur sur 28** sans liste de contrôle | `scripts/couverture.js` |

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
| **E-201** | `tests/lancer.mjs` | 71/71 pour plan8 | comptait sa propre ligne de bilan |
| **E-202** | `tests/mfa-cle-largeur.mjs` | 6/6 sous sabotage | comparait deux largeurs toujours égales |
| **E-203** | porte M1 | refusait un fichier conforme | comptait le saut de ligne final |
| **E-204** | porte M4 | déclarait orphelin ce qui était rangé | ignorait `INDEX-DOCS.md` |
| **E-205** | mon test de `LECONS.md` | `D-013` et `D-014` « absents » | `grep` les prenait pour des fichiers |
| **E-206** | `git checkout <f> \|\| true` après sabotage | « fichier restauré » | `f` n'était pas suivi : rien restauré, **rien dit** |
| **E-207** | S3 de `garde-sortie.js` | « chiffre inventé détecté » | cherchait en SOUS-CHAÎNE : « 55 » se trouve dans n'importe quel identifiant |
| **E-208** | S4 de `garde-sortie.js` | « travail déclaré sans preuve » | **refus à tort** : le participe « vérifié » vit dans n'importe quelle phrase, y compris une question |

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

**Antidote** : §4.4 — le pire cas inclut « la donnée a changé depuis ».
**Porte** : `scripts/audit/p7-architecture.js` refuse un état d'identité non
réinitialisé — c'est lui qui a attrapé E-602 **sur moi**.

---

## Comment ce registre s'utilise

1. **Avant d'affirmer** quoi que ce soit d'engageant → relire **O1**.
2. **Avant de déclarer un contrôle vert** → relire **O2**.
3. **Avant de réutiliser** un motif, une classe, une regex → relire **O3**.
4. **Une nouvelle erreur** → la classer dans une origine **existante**. Si
   aucune ne convient, c'est un mécanisme neuf : créer **O7**, et se demander
   pourquoi il a échappé aux six premiers.

⛔ **Ce registre ne grossit pas indéfiniment.** Une erreur qui répète un cas déjà
listé n'ajoute pas de ligne : elle incrémente le compteur de sa classe. On
mesure la **récidive**, pas le volume.
