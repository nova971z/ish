# Règles de travail génériques — pour n'importe quel dépôt web

> Extraites d'un projet réel et reformulées en principes universels. Aucun nom,
> aucun chiffre, aucun détail propre au projet d'origine. Chaque règle donne :
> **(a)** la règle en une phrase, **(b)** pourquoi elle existe, **(c)** comment
> la faire respecter. Le mode d'emploi d'installation est en fin de fichier.

---

## 1. Gouvernance

### 1.1 — L'ordre de priorité est fixe et ne se négocie pas
**(a)** Argent, puis sécurité, puis fonctionnel, puis structure, puis finition — dans cet ordre, toujours.
**(b)** Sans ordre écrit, chaque arbitrage se rejoue à chaque fois, et la finition gagne parce qu'elle est visible ; les défauts d'argent, eux, sont silencieux.
**(c)** L'ordre est écrit dans le fichier mémoire du dépôt et rappelé automatiquement à chaque session (voir 8.2). Tout compte-rendu qui propose un arbitrage le cite.

### 1.2 — La mémoire du projet est UN fichier, à la racine
**(a)** Un seul fichier racine porte tout ce qui vaut partout : qui décide, les règles absolues, où vit chaque chose.
**(b)** Une mémoire éparpillée n'est jamais relue ; une mémoire unique se charge au démarrage de chaque session de travail, humaine ou assistée.
**(c)** Le fichier existe, il est court, et chaque règle nouvelle « gravée » y entre datée. Ce qui grossit trop part dans un document annexe, indexé (voir 1.3).

### 1.3 — Tout document a une adresse connue
**(a)** Un index des documents dit où vit chaque chose : l'état du chantier, les décisions, les pannes, les demandes, les erreurs.
**(b)** Un document introuvable est un document mort ; la connaissance qui n'a pas d'adresse se réécrit de zéro, avec de nouvelles erreurs.
**(c)** Le fichier mémoire contient une table « où vit quoi », et l'index est mis à jour dans le même lot que tout document nouveau.

### 1.4 — Chaque demande du propriétaire est ENREGISTRÉE, avec un état et une preuve
**(a)** Toute demande entre dans un registre daté (identifiant, texte de la demande, état : ouverte / faite / rendue, preuve ou motif).
**(b)** Une demande non écrite disparaît — le projet d'origine a mesuré qu'une demande orale répétée avait été perdue faute d'enregistrement, et la confiance se paie à chaque perte.
**(c)** Une porte automatique de la CI liste les demandes ouvertes et **refuse de considérer un lot comme livrable** tant qu'une demande traitée n'a pas sa preuve. Une demande qui dépend du propriétaire passe à « rendue » avec le motif, jamais à « faite ».

### 1.5 — Les décisions se journalisent avec ce qu'elles renversent
**(a)** Chaque décision durable est écrite : quoi, pourquoi, et quelle décision antérieure elle annule.
**(b)** Sans journal, la même question se re-tranche différemment six semaines plus tard, et le code contient les deux réponses à la fois.
**(c)** Un document de décisions numérotées ; le code qui applique une décision cite son numéro en commentaire.

### 1.6 — Les pannes deviennent des portes
**(a)** Chaque incident est journalisé : symptôme, cause racine, et la **porte automatique posée** pour qu'il ne revienne pas.
**(b)** Une panne comprise mais non verrouillée revient ; le journal transforme le coût payé en protection permanente.
**(c)** Un document « leçons » ; la revue de fin de lot vérifie que toute panne rencontrée y figure avec sa porte.

### 1.7 — Les erreurs de l'assistant se classent par MÉCANISME
**(a)** Les erreurs commises pendant le travail (chiffre inventé, hypothèse non mesurée, promesse sur l'avenir) sont enregistrées par mécanisme, pas par anecdote.
**(b)** L'anecdote ne se reproduit jamais à l'identique ; le mécanisme, si. C'est lui qu'il faut nommer pour le reconnaître la prochaine fois.
**(c)** Un registre d'erreurs interrogeable, et une porte de sortie (voir 7.4) qui bloque les récidives connues dans les comptes-rendus.

---

## 2. Mesure et honnêteté

### 2.1 — Aucun chiffre sans la commande qui l'a produite
**(a)** Tout nombre cité dans un compte-rendu a été produit par une commande exécutée **dans le même échange** ; un chiffre estimé se déclare estimé.
**(b)** Un chiffre estimé présenté comme mesuré est un mensonge — et c'est le mécanisme d'erreur le plus fréquent observé sur le projet d'origine.
**(c)** Porte de sortie automatique : un contrôle scanne la réponse avant livraison et refuse les affirmations chiffrées sans mesure, ainsi que les formules interdites (« sans risque », « il suffit de ») qui promettent l'avenir.

### 2.2 — Ne jamais se fier au retour d'une écriture : relire
**(a)** Toute configuration ou écriture se vérifie par une **lecture séparée**, jamais par le message de succès de l'écriture.
**(b)** Les écritures « réussies » qui n'ont rien écrit (mauvaise cible, cache, permission silencieuse) sont indétectables autrement.
**(c)** Le rituel de livraison inclut la relecture ; les scripts de vérification lisent l'état réel, pas le code qui était censé le produire.

### 2.3 — « Ça ne marche pas » = chercher la cause en amont
**(a)** Devant un symptôme, on remonte la chaîne (symptôme → couche → cause) ; griser un bouton ou contourner masque le symptôme et laisse le défaut.
**(b)** Le contournement crée un deuxième défaut : le premier, toujours là, plus le pansement qui le cache.
**(c)** Règle de diagnostic écrite : au moins trois causes candidates listées, la mesure la plus discriminante choisie (pas la plus facile), le critère qui TUERAIT l'hypothèse annoncé d'avance, et l'hypothèse morte déclarée morte.

### 2.4 — Jamais de béquille de test dans le produit
**(a)** Devant une impossibilité, on la signale ; on ne la contourne jamais dans ce que verront les utilisateurs finaux.
**(b)** Les béquilles « temporaires » deviennent permanentes dès qu'elles sont déployées, et elles se déclenchent en production.
**(c)** Revue de lot : toute condition spéciale « pour le test » dans du code servi fait échouer la revue.

### 2.5 — Le statut d'un déploiement se PROUVE ou se déclare non prouvé
**(a)** « Poussé » n'est pas « déployé » : la preuve est l'empreinte du code réellement servi (un point de santé qui rend l'identifiant du commit), sinon on écrit « poussé, build non prouvé ».
**(b)** Le projet d'origine a passé des heures sur des builds cassés que tout le monde croyait en ligne — le dépôt était juste, le serveur servait l'ancien.
**(c)** Un script de vérification post-poussée interroge le point de santé de production ; s'il est injoignable, le compte-rendu dit exactement cela, et ne dit jamais « déployé ».

### 2.6 — Une vérification qu'on ne parvient pas à faire échouer ne vérifie rien
**(a)** Tout contrôle nouveau se prouve faillible en **réintroduisant délibérément le défaut** qu'il prétend attraper : le contrôle doit virer au rouge.
**(b)** Un détecteur faussement vert est pire que pas de détecteur : il donne une confiance qui n'existe pas. Sur le projet d'origine, des tests entiers sont restés verts pendant des semaines sans rien vérifier.
**(c)** Le sabotage se fait avec un **outil dédié**, jamais à la main : l'outil refuse de conclure si la substitution n'a rien changé (empreinte avant/après), refuse si la commande n'a pas tourné, restaure le fichier et vérifie la restauration. Un sabotage qui laisse tout vert est un échec de la porte, pas un « ok ».

---

## 3. Portes automatiques (intégration continue)

### 3.1 — Non exécuté n'est PAS vert
**(a)** Une porte absente du disque est optionnelle ; une porte **présente mais qui refuse de se charger** fait échouer toute la CI ; un test dont le prérequis manque sort en « ignoré », jamais en « réussi ».
**(b)** Le lanceur du projet d'origine traitait toute erreur de chargement comme « module manquant » : un audit de sécurité est resté mort des semaines pendant que la CI annonçait « tout est passé ».
**(c)** Le lanceur distingue les trois cas sur le disque, et le bilan compte les ignorés à part.

### 3.2 — Un test ne nomme jamais une donnée du contenu
**(a)** Aucun test ne cite en dur une référence, un titre, un prix, une catégorie ou une marque du catalogue : le sujet du test se choisit **à l'exécution**, sur un critère.
**(b)** Le contenu appartient au propriétaire et change sans préavis ; des dizaines de tests du projet d'origine sont morts en accusant un choix délibéré du propriétaire d'être un défaut.
**(c)** Revue automatique des tests ; les données de test sont synthétiques (préfixes inventés), et quand un préfixe réel est l'objet même du test, la référence complète reste inventée.

### 3.3 — Un seuil recopié se périme
**(a)** Aucun test n'écrit en dur un nombre qui vit dans le produit : il relit la valeur à l'exécution, ou teste l'invariant plutôt que le chiffre.
**(b)** Le produit évolue, la copie non ; le test finit par accuser le produit d'avoir raison.
**(c)** Les tests importent les constantes du produit ou les lisent dans la réponse ; la revue refuse les nombres nus dans les assertions.

### 3.4 — Trois formes de tests verts qui ne vérifient rien — interdites
**(a)** Interdits : le `|| vrai` en fin d'assertion ; le « repli poli » (condition non réunie → message d'info au lieu d'un échec) ; la lecture d'un élément absent qui rend toujours vrai.
**(b)** Chacune a été trouvée dans des tests « verts » du projet d'origine — dont un qui sautait silencieusement sa seule assertion d'argent.
**(c)** Une condition sans laquelle le test ne vérifie rien est un **préalable**, et un préalable non rempli **échoue**. La revue de tests cherche ces trois formes.

### 3.5 — Tout fichier généré a une porte « à jour »
**(a)** Quand un fichier servi est généré depuis une source (feuille de style minifiée, gabarit compilé, catalogue allégé, extraction de module), la CI vérifie que le généré correspond à la source, et la transformation passe par un outil d'analyse syntaxique — jamais par du remplacement de texte à la main.
**(b)** Un généré oublié sert l'ancienne version en silence ; un remplacement textuel a des pièges connus (motifs spéciaux, ancres qui n'accrochent pas) qui cassent en production.
**(c)** Chaque générateur expose un mode `--verifie` branché dans la CI, avec un contrôle **sémantique** (le résultat expose bien ce qu'il doit), pas seulement une comparaison d'octets.

### 3.6 — Toucher un fichier servi impose d'aligner les versions de cache
**(a)** Toute modification d'un fichier servi s'accompagne de l'incrément des numéros de version du cache hors-ligne et des paramètres d'URL versionnés — et on ne réutilise **jamais** un numéro déjà publié.
**(b)** Deux contenus différents sous le même numéro : une partie des visiteurs garde l'ancien pour toujours.
**(c)** La CI compare la liste des fichiers modifiés aux numéros de version et échoue sur tout décalage.

---

## 4. Argent

### 4.1 — Le serveur est autoritaire sur les montants
**(a)** Aucun montant venu du client n'est cru : prix, remise, territoire fiscal — tout se recalcule côté serveur à partir de données que le client ne contrôle pas.
**(b)** Tout champ que le client peut forger sera forgé un jour.
**(c)** Audit automatique des points d'entrée de paiement ; test qui envoie un prix forgé et vérifie qu'il est ignoré.

### 4.2 — Les webhooks de paiement : corps brut, idempotence
**(a)** La signature d'un webhook se vérifie sur le corps **brut** (un corps re-sérialisé l'invalide), et le même événement rejoué deux fois ne produit qu'un seul effet.
**(b)** Les fournisseurs de paiement rejouent les événements ; sans idempotence, un client est débité ou servi deux fois.
**(c)** Test qui rejoue le même événement et compte les effets ; liste de contrôle « paiement » rappelée automatiquement à chaque modification d'un fichier sensible (voir 8.2).

### 4.3 — Le prix d'un lot ne s'écrit jamais sur un composant
**(a)** Quand une source externe de prix mélange articles seuls et lots, un prix de lot ne s'applique jamais à la fiche d'un composant, et une annonce ambiguë est écartée **et listée**, jamais appliquée.
**(b)** Un coût de lot écrit sur un article seul divise le coût apparent — et fait vendre à perte en silence.
**(c)** Détection des lots (vocabulaire + décomptes + références multiples) prouvée par sabotage ; tout ce qui est écarté sort dans la réponse avec son motif.

### 4.4 — Une barrière ÉCARTE, elle n'efface jamais
**(a)** Tout filtre (prix hors fourchette, délai trop long, article non reconnu) garde la ligne écartée **visible**, avec le motif et le seuil qui l'a retenue.
**(b)** Une ligne effacée est indiagnosticable ; le jour où le propriétaire lève la barrière, il doit retrouver exactement ce qu'elle retenait.
**(c)** Les seuils vivent dans **un seul fichier**, chacun avec son motif et la façon de le lever ; les réponses listent les écartés ; les compteurs restent exacts même quand les listes sont repliées.

### 4.5 — Les coûts d'achat ne sortent jamais
**(a)** Le coût fournisseur, la marge et tout champ commercialement sensible sont retirés de toute réponse publique et de tout code servi.
**(b)** Un concurrent ou un client qui lit les marges change la négociation pour toujours.
**(c)** Liste des champs privés unique, appliquée au point de sortie, vérifiée par une porte CI qui tente de les trouver dans les réponses publiques.

### 4.6 — Un mode « essai à sec » ne peut pas écrire
**(a)** Tout outil qui applique des changements d'argent offre un mode sans écriture, et une garde **côté écriture** refuse de servir si le mode essai atteint le chemin d'écriture.
**(b)** Un essai qui écrit est une écriture non voulue ; la garde transforme le bogue en refus explicite.
**(c)** Test qui lance l'essai à sec et vérifie zéro écriture ; sabotage de la garde → rouge.

---

## 5. Identité et données

### 5.1 — L'identité vient du jeton vérifié, jamais du corps de la requête
**(a)** L'identifiant utilisateur est dérivé **uniquement** du jeton d'authentification vérifié cryptographiquement ; l'état « courriel vérifié » se lit dans la revendication signée.
**(b)** Tout identifiant transmis en clair sera usurpé.
**(c)** Audit automatique des points d'entrée ; test qui envoie un identifiant forgé.

### 5.2 — Les règles d'accès sont en refus-par-défaut, versionnées, et DÉPLOYÉES
**(a)** Toute collection nouvelle de la base de données est fermée tant qu'une règle ne l'ouvre pas ; les règles vivent dans le dépôt ; une règle modifiée non déployée est une protection théorique.
**(b)** L'oubli d'une règle sur une collection nouvelle est le défaut le plus silencieux qui soit.
**(c)** Fichiers de règles versionnés, testés contre l'émulateur réel, et le rituel de livraison inclut le déploiement. ⚠️ L'émulateur ne signale jamais les index composites manquants : toute requête combinant filtre et tri sur deux champs se vérifie en conditions réelles.

### 5.3 — Aucune donnée personnelle dans les journaux
**(a)** Ni courriel, ni adresse, ni identifiant en clair dans les journaux serveur ; les adresses réseau utilisées pour la limitation de débit sont hachées.
**(b)** Les journaux sont copiés, exportés, conservés — chaque donnée personnelle qui y entre échappe au contrôle.
**(c)** Audit automatique des appels de journalisation ; le droit à l'oubli (suppression de compte) est implémenté et testé.

---

## 6. Écrans et livraison front

### 6.1 — On ne livre pas un écran qu'on n'a pas regardé
**(a)** Tout écran modifié est **regardé** avant livraison — une capture réelle, aux largeurs bureau ET mobile — pas seulement « le test passe ».
**(b)** Sur le projet d'origine, plusieurs livraisons du tunnel de paiement ont été corrigées une à une par le propriétaire, sur son appareil, parce que personne n'avait regardé.
**(c)** Un outil de capture d'écran scriptable fait partie du dépôt ; le rituel de fin de lot exige une capture regardée par écran touché, aux deux largeurs.

### 6.2 — Le style vit dans la feuille de style, les budgets se mesurent
**(a)** Aucun style en attribut inline (il échappe aux jetons de la charte) ; le poids servi au premier chargement se mesure compressé, avec la commande, à chaque lot qui touche un fichier servi.
**(b)** Le poids ne monte jamais d'un coup : il monte par petites dérives non mesurées.
**(c)** Porte CI sur les attributs de style ; le compte-rendu de lot colle la mesure du poids et l'écart au repère.

### 6.3 — Le cache hors-ligne a des règles absolues
**(a)** Le gestionnaire de cache ne touche jamais aux réponses d'API ; un dernier recours ne renvoie jamais de redirection ni de corps vide ; une erreur serveur ne remplace jamais une version saine en cache.
**(b)** Chacune de ces règles vient d'une panne réelle où le cache a servi du vide ou du faux à tous les visiteurs.
**(c)** Tests dédiés du gestionnaire de cache — en se souvenant qu'un simulateur de requêtes n'intercepte pas ce qu'émet le gestionnaire lui-même : pour tester la coupure réseau, on éteint réellement le serveur.

---

## 7. Compte-rendu et communication

### 7.1 — Format fixe : tableau d'abord, mots simples ensuite
**(a)** Tout compte-rendu commence par un bloc tabulaire (une ligne par point : fait, preuve, verdict), suivi d'explications **numérotées en mots simples** — courtes, jamais un pavé.
**(b)** Le propriétaire lit vite, compare d'un lot à l'autre, et retrouve chaque affirmation en face de sa preuve.
**(c)** Le format est gravé dans le fichier mémoire ; la porte de sortie peut vérifier sa présence. **Le doute est une cellule du tableau, jamais une invention polie.**

### 7.2 — On ne commente jamais l'état de la personne
**(a)** Ni sommeil, ni fatigue, ni heure locale, ni humeur : on répond au travail demandé, point.
**(b)** Ces commentaires n'apportent rien au travail et déplacent la conversation sur la personne.
**(c)** Règle gravée dans le fichier mémoire, rappelée par le protocole de session.

### 7.3 — Aucun secret ne sort, jamais
**(a)** Ni clé, ni jeton, ni suite de caractères aléatoires dans un compte-rendu, un commit ou un document : un **état** se partage (« la clé est présente »), une **valeur** jamais ; toute sortie de commande est filtrée avant d'être collée.
**(b)** Un secret collé une fois est un secret compromis — les historiques de conversation et de dépôt ne s'effacent pas vraiment.
**(c)** Les tests qui manipulent des secrets utilisent des témoins inventés et vérifient que les réponses d'erreur ne reflètent jamais un en-tête reçu.

### 7.4 — Une porte de sortie scanne chaque compte-rendu
**(a)** Avant d'être livré, chaque compte-rendu passe un contrôle automatique qui bloque : les chiffres sans mesure, les promesses sur l'avenir (« sans risque », « il suffit de »), les récidives d'erreurs connues du registre.
**(b)** La discipline déclarative ne tient pas seule ; la porte transforme la règle en refus mécanique.
**(c)** Un crochet de fin de réponse exécute le scanner ; un refus exige de corriger la réponse : mesurer et montrer la commande, ou retirer l'affirmation. « Je n'ai pas pu mesurer » est une réponse complète.

### 7.5 — Fin de lot : le rituel est toujours le même
**(a)** Un lot est fini quand : la CI est verte, le noyau de tests est vert, chaque contrôle neuf a son sabotage **rouge** cité avec son décompte, le commit est poussé, et le statut du déploiement est dit honnêtement (prouvé ou non prouvé).
**(b)** Tout ce qui n'est pas dans le rituel finit par être sauté un jour de fatigue.
**(c)** La commande de fin de lot est écrite dans le fichier mémoire ; le compte-rendu colle ses résultats.

---

## 8. Orientation et garde-fous de session

### 8.1 — Un index d'intentions dit OÙ intervenir avant de réfléchir
**(a)** Une commande unique prend l'intention en langage naturel (« modifier le paiement », « toucher au cache ») et rend : où intervenir, ce qui protège, les règles applicables, les pièges déjà payés, les décisions en vigueur, et ce que « fini » veut dire ici.
**(b)** La connaissance du dépôt ne sert que si elle arrive **avant** l'action ; après, elle s'appelle une régression.
**(c)** Intention inconnue de l'index → il le dit et demande de l'ajouter — jamais « rien ». Interdit de proposer une approche avant d'avoir lu sa sortie.

### 8.2 — Le protocole se réinjecte tout seul, à chaque message
**(a)** Les règles de session (priorités, diagnostic, mesure) sont **réinjectées automatiquement** à chaque échange par un crochet, et les fichiers sensibles déclenchent leur liste de contrôle à l'édition.
**(b)** Un protocole qu'on peut oublier est un vœu : le projet d'origine a mesuré qu'un outil construit un matin n'avait pas été utilisé une seule fois le jour même.
**(c)** Crochets d'entrée de message (protocole), d'édition (liste de contrôle par famille de fichiers, porte d'entonnoir), et de sortie (scanner du compte-rendu, voir 7.4).

### 8.3 — Quatre questions avant toute approche
**(a)** Avant d'agir : ① rayon d'impact — si je me trompe, qu'est-ce qui casse, pour qui ? ② réversibilité — comment revient-on en arrière ? un geste irréversible se sauvegarde d'abord ; ③ le filet couvre-t-il CE mode de panne ? un filet qui ne l'attrape pas n'est pas un filet — il se pose AVANT ; ④ le bon outil existe-t-il déjà dans le dépôt ?
**(b)** Chaque question correspond à une famille de pannes réellement payées, dont la pire : réécrire à la main un analyseur qui existait — juste à 95 %, et 95 % suffit à casser.
**(c)** Les quatre questions font partie du protocole réinjecté (8.2).

### 8.4 — Les fichiers à portée juridique ont leur propre porte
**(a)** Les fichiers qui engagent juridiquement (prix affichés, données personnelles, fiscalité, obligations d'information) sont recensés, et leur édition exige d'avoir **lu la fiche du domaine** — qui dit le risque et où le vérifier officiellement — avant d'écrire.
**(b)** Une infraction ne se détecte pas à l'exécution : aucun test vert ne couvre ce mode de panne.
**(c)** Crochet d'édition qui bloque tant que la fiche n'est pas lue dans la session ; et règle absolue : **aucun article de droit cité de mémoire** — un article de mémoire est une invention ; la fiche pointe vers les sources officielles, elle n'en est pas une.

---

## Mode d'emploi — installer ces règles dans un dépôt neuf

Ordre conseillé ; chaque étape est utilisable seule, mais l'effet vient de l'ensemble.

1. **Créer le fichier mémoire** à la racine : l'ordre de priorité (1.1), les règles absolues du propriétaire, la table « où vit quoi » (1.3), le format de compte-rendu (7.1), la commande de fin de lot (7.5). Court : tout le reste vit ailleurs et y est indexé.
2. **Créer les quatre registres** : demandes (1.4), décisions (1.5), leçons/pannes (1.6), erreurs par mécanisme (1.7). Des tableaux datés suffisent.
3. **Monter le lanceur de CI** avec la règle 3.1 dès le premier jour : trois états (absent / cassé / ignoré), jamais deux. Y brancher les portes au fur et à mesure : demandes ouvertes (1.4), fichiers générés (3.5), versions de cache (3.6), champs privés (4.5), attributs de style (6.2).
4. **Écrire l'outil de sabotage** (2.6) avant le deuxième test : substitution vérifiée par empreinte, exécution vérifiée, restauration vérifiée. À partir de là, tout contrôle neuf se livre avec son sabotage rouge.
5. **Écrire l'index d'intentions** (8.1) : au début, une simple table « intention → fichiers, portes, pièges, définition de fini », enrichie à chaque lot. La règle importante n'est pas sa taille, c'est le réflexe : on le consulte AVANT d'agir, et une intention absente s'y ajoute.
6. **Poser les crochets de session** (8.2, 7.4) : injection du protocole à chaque message, listes de contrôle à l'édition des fichiers sensibles (argent, identité, juridique — 8.4), scanner de compte-rendu en sortie. C'est l'étape qui transforme les règles en refus mécaniques.
7. **Graver le rituel de fin de lot** (7.5) et s'y tenir dès le premier lot : CI verte, noyau vert, sabotages rouges cités, poussée vérifiée (2.5), compte-rendu au format (7.1).
8. **Nourrir les registres à chaque incident** : une panne → une leçon → une porte (1.6) ; une erreur de méthode → un mécanisme au registre → un motif de plus dans le scanner de sortie (1.7, 7.4). C'est la boucle qui fait que le système devient plus sûr à mesure qu'il se trompe.

> Le principe qui résume tous les autres : **ce qui n'est pas vérifié mécaniquement finira par être faux, et ce qui n'est pas écrit finira par être perdu.** Chaque règle ci-dessus n'est que l'une de ces deux phrases, appliquée à un endroit précis.
