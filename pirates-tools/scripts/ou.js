/* ou.js — L'ENTONNOIR : « je veux faire X » → où, et sous quelles contraintes.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE
   Trouver OÙ intervenir coûtait 3 à 6 fichiers ouverts. Pire : on trouvait le
   bon endroit sans connaître les contraintes qui s'y appliquent — la règle
   gravée, le piège déjà payé, la décision qui interdit telle approche. On
   refaisait donc des fautes déjà faites, à l'endroit exact où elles avaient
   déjà coûté cher.

   Cet outil ne LOCALISE pas seulement : il CONTRAINT. Il rend six blocs, et
   jamais une réponse partielle en silence :
     ① où          ② ce qui protège      ③ règles applicables
     ④ pièges payés ⑤ décisions en vigueur ⑥ ce que « fini » veut dire ici

   ⛔ IL NE CITE JAMAIS DE NUMÉRO DE LIGNE (garde-fou G7) : un numéro se périme
   au premier ajout. Il cite des NOMS DE FONCTION — 501 dans app.js, soit un
   repère tous les ~30 lignes, pour zéro octet livré (décision D-003).

   ⚠️ L'index ci-dessous est le SEUL élément écrit à la main. C'est donc le seul
   qui peut mentir. La porte CI `check-ou` vérifie que chaque fonction et chaque
   fichier nommés EXISTENT VRAIMENT.

   Usage :  node scripts/ou.js prix
            node scripts/ou.js "je veux modifier le panier"
            node scripts/ou.js --liste
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* ═══ L'INDEX ═════════════════════════════════════════════════════════════
   mots     : ce que l'on tape, sous toutes ses formes usuelles
   fichiers : chemins relatifs à pirates-tools/
   fonctions: noms EXACTS (vérifiés par la porte CI)
   protege  : ce qui casse si on se trompe — harnais, contrôle, porte
   regles   : fichier de .claude/rules/ qui se charge tout seul
   pieges   : ce qui a DÉJÀ coûté cher ici
   decisions: identifiants du registre docs/DECISIONS.md
   fini     : la condition de fin, pas « ça a l'air de marcher »            */
var INDEX = [
  {
    intention: 'Prix, TVA, octroi de mer, remise fidélité',
    mots: ['prix', 'tva', 'octroi', 'marge', 'fidelite', 'fidélité', 'remise', 'tarif',
           'transport', 'port', 'colissimo', 'bateau', 'poids', 'expedition', 'expédition'],
    fichiers: ['api/_lib/pricing.js', 'api/_lib/loyalty.js', 'api/_lib/pricing-model.js',
               'data/transport-outre-mer.json', 'app.js'],
    fonctions: ['calcPrice'],
    protege: ['scripts/check-pricing.js (parité client ↔ serveur)', 'scripts/check-loyalty.js', 'scripts/audit/p5-money.js'],
    regles: ['.claude/rules/produits.md'],
    pieges: ['Le prix affiché et le prix débité doivent tomber au centime — le serveur est autoritaire, le prix client est ignoré.',
             'Le territoire vient du CODE POSTAL, jamais d\'un champ déclaré.',
             '⛔⛔ RÈGLE DE L\'USER, 10/08/2026 — PLUS DE 10 kg = BATEAU. Le bateau de La Poste s\'appelle Colissimo Eco Outre-mer : 39,24 € dès 10 kg (affiche officielle janvier 2026). Le forfait de 29 € qui traînait sous-provisionnait 606,15 € au total sur ses 9 fiches lourdes, 67,35 € par vente.',
             '⛔ M-23 — on n\'INTERPOLE jamais entre deux points d\'une grille de transport : on prend le point confirmé JUSTE AU-DESSUS. Interpoler, c\'est inventer un prix.',
             '⛔ M-25 — au-delà de 30 kg La Poste ne prend plus le colis : `recommend` rend `null`. Un refus REMONTE, il ne se dilue pas en port à 0 € (défaut attrapé par sa propre porte le jour même).',
             '⛔ M-24 — une assertion ne recopie pas la valeur observée : elle vise l\'INVARIANT. `ok(port < 40)` gravait le forfait fautif et rougissait quand on le corrigeait.'],
    decisions: ['D-004'],
    fini: 'check-pricing, check-pricing-model et check-loyalty verts, sabotages rouges, et un paiement de bout en bout rejoué.'
  },
  {
    intention: 'Paiement par carte, Revolut, webhook',
    mots: ['paiement', 'revolut', 'carte', 'webhook', 'payer', 'checkout',
           'merchant', 'encaisser', 'versement', 'payout'],
    fichiers: ['api/create-payment-intent.js', 'api/webhook.js', 'app.js',
               'docs/PLAN-REVOLUT.md'],
    fonctions: ['openPayModal'],
    protege: ['tests/course-pay.mjs', 'scripts/audit/p5-money.js'],
    regles: ['.claude/rules/donnees.md'],
    pieges: ['La clé publique vit dans un script inline autorisé par empreinte sha256 : la changer sans recalculer la CSP BLOQUE le script et tue le site.',
             'Le webhook doit lire le corps BRUT — un corps parsé invalide la signature.',
             'MIGRATION REVOLUT EN COURS (docs/PLAN-REVOLUT.md) : la charge utile du webhook Revolut ne contient QUE {event, order_id} — ni montant, ni commission, ni metadata. Tout se relit par GET /api/orders puis GET /api/payments.',
             'Revolut ne fournit AUCUN identifiant d\'événement : la clé d\'idempotence se dérive de event + order_id.',
             'La commission réelle est dans payments[].fees[] — un TABLEAU. On somme, on ne prend pas fees[0].'],
    decisions: ['D-009', 'D-013'],
    fini: 'scripts/check-csp.js vert, et le montant débité égal au montant affiché.'
  },
  {
    intention: 'Chaîne de livraison, courses, chat, accord',
    mots: ['livraison', 'course', 'livreur', 'chat', 'accord', 'coursier'],
    fichiers: ['api/contact.js', 'api/_lib/courses.js', 'app.js'],
    fonctions: ['lvChatHTML', 'lvStatutBandeau', 'renderCourierTarifPanel'],
    protege: ['tests/plan9.mjs', 'tests/plan10.mjs', 'tests/plan11.mjs', 'tests/couriers.mjs', 'scripts/audit/p3-endpoints.js'],
    regles: ['.claude/rules/livraison.md'],
    pieges: ['La plateforme ne fixe pas le prix et n\'encaisse pas la course — c\'est juridique, pas ergonomique.',
             'Une requête where + orderBy sur deux champs exige un index composite, et l\'émulateur ne le dira JAMAIS.'],
    decisions: ['D-009'],
    fini: 'plan9, plan10, plan11 et couriers verts, plus l\'émulateur Firestore.'
  },
  {
    intention: 'Persistance des écritures admin — création de fiche, photos, descriptions',
    mots: ['persistance', 'rafraichir', 'rafraîchir', 'disparait', 'disparaît', 'efface',
      'snapshot', 'shard', 'override', 'visible', 'ajout manuel', 'photo', 'description'],
    fichiers: ['api/admin.js', 'api/_lib/snapshot.js', 'api/_lib/catalog.js', 'api/_lib/limites.js'],
    fonctions: ['majSnapshot', 'valeurPourShard', 'lireSnapshot', 'docDansLeBudget'],
    protege: ['scripts/check-fiches-persistees.js'],
    regles: ['.claude/rules/donnees.md'],
    pieges: [
      '⛔⛔ ARGENT — un document Firestore plafonne à 1 Mio et les photos base64 comptent PLEIN pot, la vignette recopiant images[0] compte DEUX fois. Le budget se vérifie AVANT d\'écrire (api/_lib/limites.js), le refus dit les chiffres.',
      '⛔ Les champs LOURDS (img, images, description_long, specs, features) n\'entrent JAMAIS dans un shard de snapshot : entrée allégée + _riche, le catalogue lit les documents riches nommément.',
      '⛔ Après toute écriture de fiche : RELIRE le document PUIS prouver la VISIBILITÉ par le chemin public (loadCatalog) — la réponse porte visible:true/false, et le client CRIE sur false.',
      '⛔ Un formulaire d\'édition ne s\'ouvre JAMAIS sur un détail non chargé : il écraserait la vraie description par du vide (payé le 14/08/2026).',
      'Le repli sur la collection n\'est pris que si AUCUN shard n\'existe : une entrée manquante dans un shard est invisible pour toujours — d\'où la relecture de visibilité.'
    ],
    fini: 'check-fiches-persistees vert (chaîne écriture→rafraîchissement→relecture rejouée sur base factice au plafond réel), et chaque garde neuve sabotée rouge.'
  },
  {
    intention: 'Fiche produit, catalogue, modèles 3D, posters',
    mots: ['produit', 'catalogue', 'fiche', 'poster', '3d', 'glb', 'pack', 'modele', 'modèle'],
    fichiers: ['products.json', 'app.js', 'images/posters', 'models/products'],
    fonctions: ['renderPDP', 'setPdpViewer', 'loadProducts'],
    protege: ['tests/pdp-specs.mjs', 'scripts/audit/p8-perf.js'],
    regles: ['.claude/rules/produits.md'],
    pieges: ['Une orientation de pack validée est GRAVÉE : ne jamais la re-dériver à l\'œil.',
             'Un harnais ne doit JAMAIS nommer un produit — dix-huit sont morts pour ça.'],
    decisions: ['D-002', 'D-012'],
    fini: 'pdp-specs vert, et P8.5 sous le plafond de 871 Ko par image.'
  },
  {
    intention: 'Référencement, rendu serveur, sitemap, données structurées, territoires',
    mots: ['seo', 'referencement', 'référencement', 'rendu serveur', 'ssr', 'render',
           'sitemap', 'json-ld', 'jsonld', 'canonical', 'meta', 'og', 'territoire',
           'onlinestore', 'areaserved', 'noindex', 'rich results', 'maillage'],
    fichiers: ['api/render.js', 'app.js', 'scripts/generer-sitemap.js', 'sitemap.xml', 'vercel.json'],
    fonctions: ['pageProduit', 'jsonldProduit', 'garderVueSeule', 'injectProductJsonLd', 'updateRouteMeta'],
    protege: ['scripts/check-render.js', 'scripts/generer-sitemap.js --verifie', 'tests/chemins-reels.mjs'],
    regles: ['.claude/rules/front.md'],
    pieges: ['MÊME HTML pour tous : aucun aiguillage robot/humain (cloaking rejeté, D-019).',
             'Canonical et URLs JAMAIS avec un fragment # — le client résout contre l\'ORIGINE, pas location.href (sinon /produit/images/… sur chemin réel).',
             'Fiche sans description_long ou visuel placeholder ⇒ noindex,follow ; le sitemap suit la MÊME règle (estIndexable).',
             'Aucun prix rendu qui ne vienne pas du MÊME loadCatalog que le paiement (J4).'],
    decisions: ['D-019', 'D-020'],
    fini: 'check-render vert + sabotages rouges, generer-sitemap --verifie vert, chemins-reels vert, et Rich Results valide en prod.'
  },
  {
    intention: 'Service Worker, cache, mise en cache, version',
    mots: ['sw', 'service worker', 'cache', 'version', 'hors ligne', 'offline'],
    fichiers: ['sw.js', 'index.html'],
    fonctions: [],
    protege: ['tests/sw-navigation.mjs', 'tests/boot-resilience.mjs', 'scripts/check-asset-versions.js'],
    regles: ['.claude/rules/front.md'],
    pieges: ['Un dernier recours ne renvoie JAMAIS de redirection : `Response.redirect(\'./\')` boucle sur elle-même et tue le site en silence.',
             'Un SW corrigé ne prend la main qu\'au rechargement SUIVANT — recharger deux fois avant de conclure.',
             'Ne jamais réutiliser un numéro de version.'],
    decisions: [],
    fini: 'sw-navigation et boot-resilience verts, et les trois versions alignées.'
  },
  {
    intention: 'CSP, en-têtes de sécurité, rendu 3D bloqué',
    mots: ['csp', 'securite', 'sécurité', 'entete', 'en-tête', 'header', 'hsts', 'blob'],
    fichiers: ['vercel.json', 'index.html'],
    fonctions: [],
    protege: ['scripts/check-csp.js'],
    regles: ['.claude/rules/front.md'],
    pieges: ['Un site 3D exige worker-src blob:, wasm-unsafe-eval, et blob: dans connect-src ET img-src. Sans ça : modèles absents ou surfaces blanches.',
             'Toute modification d\'un script inline change son empreinte sha256.'],
    decisions: [],
    fini: 'check-csp vert ET zéro violation constatée dans un vrai navigateur.'
  },
  {
    intention: 'Règles Firestore, droits d\'accès, Storage',
    mots: ['firestore', 'rules', 'regles firestore', 'droits', 'storage', 'securite donnees'],
    fichiers: ['firestore.rules', 'storage.rules', 'firestore.indexes.json'],
    fonctions: [],
    protege: ['scripts/test-rules.js (émulateur réel)', 'scripts/audit/p4-firestore.js'],
    regles: ['.claude/rules/donnees.md'],
    pieges: ['Les règles doivent être DÉPLOYÉES : tant que ce n\'est pas fait, la protection est théorique.',
             'L\'émulateur crée ses index à la volée : il ne signalera jamais un index composite manquant.'],
    decisions: [],
    fini: 'test-rules vert contre l\'émulateur (npx firebase emulators:exec), ET règles déployées.'
  },
  {
    intention: 'Administration, statistiques, comptabilité',
    mots: ['admin', 'stats', 'statistiques', 'compta', 'tableau de bord', 'dashboard'],
    fichiers: ['api/admin.js', 'api/events.js', 'api/_lib/analytics.js', 'app.js'],
    fonctions: ['renderAdmin', 'track'],
    protege: ['scripts/check-analytics.js', 'scripts/audit/p6-rgpd.js'],
    regles: ['.claude/rules/donnees.md'],
    pieges: ['Le Service Worker ne doit JAMAIS intercepter /api/ : il servirait des données admin périmées.',
             'Aucune donnée personnelle dans les journaux serveur.'],
    decisions: [],
    fini: 'check-analytics vert et p6-rgpd vert.'
  },
  {
    intention: 'Compte de résultat, remboursements, avoirs, TVA à reverser',
    mots: ['comptabilité', 'compte de résultat', 'remboursement', 'rembourser', 'avoir',
           'facture rectificative', 'tva collectée', 'tva déductible', 'charge', 'charges',
           'cogs', 'résultat net', 'bilan', 'is', 'impôt sur les sociétés'],
    fichiers: ['api/_lib/accounting.js', 'api/admin.js', 'app.js'],
    fonctions: ['synthesize', 'applyRefunds', 'computeIS'],
    protege: ['scripts/check-accounting.js', 'scripts/audit/p5-money.js'],
    regles: ['.claude/rules/donnees.md'],
    pieges: [
      'Un remboursement n\'est PAS une charge : il diminue la TVA COLLECTÉE. Le saisir en charge gonflerait la TVA DÉDUCTIBLE — on réclamerait une taxe jamais payée.',
      'La TVA d\'une vente annulée ne se récupère QU\'AVEC un avoir (facture rectificative). Sans avoir, elle reste due malgré le remboursement.',
      'Un remboursement n\'annule le coût d\'achat que si l\'outil n\'a PAS été commandé. Sinon il part en stock, et le coût reste.',
      'La commission d\'encaissement n\'est pas supposée rendue : elle se saisit d\'après le tableau de bord du fournisseur, jamais d\'après une hypothèse.'
    ],
    decisions: [],
    fini: 'check-accounting vert (dont les cas remboursement), p5-money vert, et chaque nouvelle assertion prouvée faillible par sabotage.'
  },
  {
    intention: 'Panier, favoris, ajout au panier',
    mots: ['panier', 'favoris', 'cart', 'devis'],
    fichiers: ['app.js'],
    fonctions: ['addToCart'],
    protege: ['tests/plan10.mjs'],
    regles: ['.claude/rules/livraison.md'],
    pieges: ['Le panier doit survivre à l\'annulation d\'une course, et on ne CUMULE jamais : quantité au maximum, jamais la somme.',
             'L\'user navigue en privé : le localStorage est vide entre deux visites.'],
    decisions: [],
    fini: 'plan10 vert, dont le cas « fiche produit + panier vide ».'
  },
  {
    intention: 'Écran, interface, CSS, mise en page, UI/UX',
    mots: ['écran', 'ecran', 'interface', 'ui', 'ux', 'css', 'style', 'mise en page',
           'affichage', 'bouton', 'carte', 'onglet', 'formulaire', 'profil', 'paramètres',
           'parametres', 'réglages', 'reglages', 'visuel', 'design'],
    fichiers: ['index.html', 'styles.css', 'app.js'],
    fonctions: ['renderAccount', 'renderIdCard', 'setupAccountTabs'],
    protege: ['scripts/check-ecrans.js', 'outils/vue.mjs (REGARDER l\'écran)', 'tests/a11y.mjs', 'docs/CSS-CARTE.md (les commentaires du CSS y vivent)'],
    regles: ['.claude/rules/front.md'],
    pieges: ['⛔ On ne livre PAS un écran qu\'on n\'a pas regardé : `node outils/vue.mjs "#/laroute" [--tel] [--connecte]`. Six livraisons du tunnel de paiement ont été corrigées par l\'user, une par une, sur son iPad.',
             '`.actions` est un FRÈRE de `.specs`, jamais un enfant : `.specs` est un display:flex, le bouton s\'étire en pavé de couleur.',
             'Un `placeholder` n\'est pas une étiquette : il disparaît à la première frappe.',
             'Le style va dans styles.css, pas dans un attribut `style=` — sinon il ne suit pas les jetons de la charte. Le compte est un cliquet : il descend.',
             'Deux éléments ne portent JAMAIS le même identifiant : getElementById ne rend que le premier, et la moitié de l\'écran reste muette sans lever d\'erreur.'],
    decisions: [],
    fini: 'check-ecrans vert, ET une capture regardée pour chaque écran touché — en 1194 px ET en 390 px.'
  },
  {
    intention: 'Authentification, compte, double facteur',
    mots: ['auth', 'compte', 'connexion', 'mfa', 'totp', '2fa', 'mot de passe'],
    fichiers: ['mfa.js', 'firebase-init.js', 'api/_lib/firebase.js', 'app.js'],
    fonctions: [],
    protege: ['tests/plan13.mjs', 'tests/plan12-serveur.mjs', 'scripts/mfa-unlock.js'],
    regles: ['.claude/rules/donnees.md'],
    pieges: ['Un défaut dans le défi de connexion VERROUILLE l\'utilisateur hors de son compte — la porte de sortie (mfa-unlock) s\'écrit AVANT l\'interface.',
             'L\'user n\'a pas de téléphone : la clé en toutes lettres est LE chemin, pas un repli.'],
    decisions: ['D-008'],
    fini: 'plan13 et plan12-serveur verts, et mfa-unlock --check exécuté.'
  },
  {
    intention: 'Performance, poids, budgets',
    mots: ['perf', 'performance', 'poids', 'budget', 'lent', 'vitesse', 'ko'],
    fichiers: ['app.js', 'styles.css', 'index.html', 'products.json'],
    fonctions: [],
    protege: ['scripts/audit/p8-perf.js'],
    regles: ['.claude/rules/front.md'],
    pieges: ['Les plafonds ne se relèvent pas : on retire du poids.',
             'Avant toute purge CSS, vérifier les classes construites par concaténation.'],
    decisions: ['D-001', 'D-002', 'D-011', 'D-012'],
    fini: 'P8.4 sous 400 Ko et P8.5 sous 871 Ko par image.'
  },
  {
    intention: 'Domaine, DNS, déploiement, site inaccessible',
    mots: ['domaine', 'dns', 'vercel', 'cloudflare', 'deploiement', 'déploiement',
           'inaccessible', 'panne', 'ouvre', 'ouvrir', 'page blanche', 'page noire',
           'marche plus', 'site mort', 'injoignable', 'charge sans fin', 'hors ligne'],
    fichiers: ['vercel.json'],
    fonctions: [],
    protege: ['scripts/check-functions.js (plafond de 12 fonctions)'],
    regles: ['.claude/rules/front.md'],
    pieges: ['Ne jamais accepter la migration vers la cible Vercel par projet sans vérifier que les nouvelles IP répondent depuis le Maroc.',
             'Watchdog absent à l\'écran ⇒ le HTML n\'est jamais arrivé ⇒ relire le code ne servira à rien.'],
    decisions: ['D-013'],
    fini: 'les deux adresses s\'ouvrent, et le site est plus rapide qu\'avant.'
  },
  {
    intention: 'Savoir QUEL code tourne en production (est-ce déployé ?)',
    mots: ['deploye', 'déployé', 'est-ce deploye', 'quel commit', 'en production',
           'mis en ligne', 'a jour', 'à jour', 'version deployee', 'version déployée',
           'code perime', 'code périmé', 'je peux tester', 'je peux lancer'],
    fichiers: ['api/health.js'],
    fonctions: [],
    protege: ['scripts/check-deploiement.js'],
    regles: [],
    pieges: ['⛔ E-404 : « Vercel ne déploie que master ». Pousser la branche de travail N\'EST PAS livrer — 15 commits poussés à côté, et l\'user a retesté deux fois contre l\'ancien code.',
             '⛔ Le dépôt ne peut PAS voir ce que Vercel a déployé : ni GitHub, ni la CI, ni aucune commande d\'ici ne le disent. La seule réponse honnête vient de la PRODUCTION elle-même.',
             '⛔ `GET /api/health` porte `build.commit` (VERCEL_GIT_COMMIT_SHA, 7 signes) et `build.branch` : c\'est LA réponse, et le raccourci de l\'user appelle déjà ce point d\'entrée en première étape.',
             '⚠️ Un identifiant de commit est un ÉTAT, pas un secret — mais rien d\'autre de l\'environnement ne sort par là : jamais une valeur, seulement des booléens.'],
    decisions: [],
    fini: '`GET /api/health` renvoie le commit attendu — comparé à `git rev-parse --short HEAD`, pas supposé.'
  },
  {
    intention: 'Écrire ou corriger un harnais de test',
    mots: ['test', 'harnais', 'playwright', 'assertion', 'sabotage'],
    fichiers: ['tests', 'tests/_socle.mjs', 'tests/lancer.mjs', 'outils/sabotage.mjs'],
    fonctions: [],
    protege: ['scripts/check-harnais.js', 'scripts/check-ancres.js', 'outils/sabotage.mjs'],
    regles: ['.claude/rules/harnais.md'],
    pieges: ['Une vérification qu\'on ne parvient pas à faire échouer ne vérifie rien : sabotage obligatoire — et par `node outils/sabotage.mjs`, plus à la main. Trois sabotages sur cinq ont MENTI le 01/08/2026 (motif jamais accroché, mauvaise extension de fichier).',
             '⛔ Un harnais ne nomme JAMAIS une donnée du catalogue — référence, titre, prix, CATÉGORIE, MARQUE. Le sujet se choisit à l\'exécution.',
             '⛔ Un harnais ne vise jamais un identifiant mort : il meurt sur un délai SANS rendre d\'assertion, ou accuse le produit à tort. Porte : check-ancres. Une ancre visée pour prouver son ABSENCE se déclare : `// ancres-absentes-voulues: x, y`.',
             'Vert sans rien vérifier — trois formes vues le 01/08 : `|| true` en fin d\'assertion ; le repli poli (`ℹ️ non déclenché`) au lieu d\'un échec ; `!(getElementById(x)||{}).hidden` qui rend toujours true.',
             'Un seuil recopié du produit se périme (35 contre PAGE_SIZE=40). On relit la valeur à l\'exécution, ou on teste l\'invariant plutôt que le chiffre.',
             'Depuis la pagination, COMPTER LES CARTES ne prouve plus rien : la page 1 en montre PAGE_SIZE quoi qu\'il arrive. Mesurer le nombre de PAGES.',
             'Un état résiduel fausse tout : une puce restée active a fait rendre 0 à la recherche, et le harnais a accusé le produit.',
             '⛔ Un délai FIXE au milieu d\'une animation est un tirage au sort : pdp-specs lisait une opacité à 1500 ms (0,901) avec un seuil à 0,9. Deux exécutions du même code : 68/68 puis 67/68. On attend que la valeur CESSE DE BOUGER, et on teste les deux bouts avec de la marge.',
             '⛔ Ne JAMAIS lancer deux lots de harnais en parallèle : ils se disputent le processeur et toute mesure temporelle bascule.',
             'Un résultat de lot annoncé sur UNE exécution n\'est pas un fait : le rejouer avant de l\'affirmer.',
             'context.route() n\'intercepte PAS les requêtes émises depuis un Service Worker.',
             'Deux goto() sur la même URL ne rechargent pas la page.'],
    decisions: [],
    fini: 'le harnais est vert, check-ancres vert, ET prouvé faillible par `outils/sabotage.mjs` — qui refuse de conclure si le sabotage n\'a pas été appliqué ou si la commande n\'a pas tourné.'
  },
  {
    /* Ajoutée le 01/08/2026 : cinq harnais rouges et un audit de sécurité mort
       tombaient tous sur la même cause, et l'entonnoir n'avait rien à en dire.
       Un rouge ancien qu'on ne diagnostique pas devient un rouge qu'on ignore. */
    intention: 'Un harnais est rouge, ou une porte ne s\'exécute plus',
    mots: ['rouge', 'harnais rouge', 'porte morte', 'timeout', 'délai',
           'echec', 'échec', 'casse', 'cassé', 'reparer', 'réparer', 'diagnostic'],
    fichiers: ['tests/lancer.mjs', 'scripts/ci.js', 'scripts/check-ancres.js', 'outils/sabotage.mjs'],
    fonctions: [],
    protege: ['scripts/check-ancres.js', 'scripts/ci.js (safeRequire distingue absent / cassé)'],
    regles: ['.claude/rules/harnais.md'],
    pieges: ['⛔ AVANT de corriger, MESURER SI C\'ÉTAIT DÉJÀ ROUGE AVANT : `git worktree add <tmp> <commit>` puis rejouer le harnais là-bas. Sinon on s\'attribue une casse qu\'on n\'a pas faite, ou on masque celle qu\'on a faite.',
             '⚠️ Et lancer le harnais avec sa VRAIE extension : `.mjs` contre `.js`. Un MODULE_NOT_FOUND ne contient pas « ❌ » et se lit comme un vert.',
             'Un harnais à 0/0 n\'est pas « rouge sur le fond » : il est MORT AVANT DE TESTER. Zéro couverture, et un rouge qu\'on finit par ignorer.',
             'Cause n°1 mesurée le 01/08 : une ancre périmée (identifiant renommé, catégorie regroupée, champ retiré par décision). Lancer `node scripts/check-ancres.js` en premier.',
             '⛔ Une porte PRÉSENTE mais qui ne se charge pas ne se voit pas : `audit/p3-endpoints` était mort depuis la migration (il lisait un fichier supprimé) et la CI restait verte. Une porte ne lit JAMAIS un fichier au chargement du module.',
             'Un harnais réparé doit gagner des assertions, pas seulement passer au vert : audit-buttons est passé de 0 à 44, verify-h5 de 0 à 5.'],
    decisions: [],
    fini: 'le harnais rend PLUS d\'assertions qu\'avant, check-ancres vert, et la correction est prouvée par sabotage.'
  },
  {
    intention: 'Traqueur de prix — sources fournisseur, ruptures, relevés',
    mots: ['traqueur', 'tracker', 'relevé', 'releve', 'rupture', 'stock',
           'cotebrico', 'clickoutil', 'source', 'fournisseur', 'price-watch', 'coût', 'cout',
           'parseur', 'format'],
    fichiers: ['api/_lib/price-parse.js', 'api/admin.js', 'docs/TRAQUEUR-URLS.md',
               'docs/AUDIT-TRAQUEUR-PARSEUR-2026-08-16.md',
               'docs/AUDIT-DEWALT-2026-08-16.md',
               'docs/PLAN-FINIR-DEWALT.md',
               'docs/DEWALT-SUFFIXES-A-SOURCER.csv',
               'docs/CHAINE-TRAQUEUR.md', 'docs/PROTEGER-LE-CODE.md',
               'docs/REPRISE-SESSION-17-08.md'],
    fonctions: [],
    protege: ['scripts/check-price-watch.js', 'scripts/check-traqueur.js',
              'scripts/check-separation-marques.js', 'scripts/check-marques-suivies.js',
              'scripts/check-cartographie.js'],
    regles: [],
    pieges: ['⛔⛔ M-28 — CHAQUE MARQUE A SA TABLE. Le parseur reconnaît la marque, PUIS ouvre la bonne table. Mesuré le 10/08 : « T final = coffret » (règle d\'une marque) rendait « coffret » pour un suffixe qui désigne une batterie de 5 Ah chez l\'autre ; un audit a fabriqué 9 faux jumeaux en découpant toutes les références avec une seule grammaire.',
             '⚠️ Et le SENS DE L\'ERREUR est inversé ici : rapprocher deux références fait BAISSER le coût, donc vendre à PERTE. Porte : check-separation-marques.',
             '⛔ La page fournisseur est INJOIGNABLE depuis le dépôt (proxy 403) : le balisage se lit sur une CAPTURE de l\'user, jamais d\'imagination.',
             'Le badge « En stock »/« Rupture » d\'une carte vit APRÈS le bouton « Ajouter au panier » — donc EN TÊTE DU BLOC SUIVANT après découpage.',
             '⛔ Un produit EN RUPTURE ne fait jamais bouger un prix : source écartée, et GEL si aucune source achetable ne reste.',
             'Plusieurs traqueurs : `&source=<slug>` ; le coût effectif = MIN des sources fraîches (14 j) ET en stock (`choisirCoutSource`, pure, sabotée).',
             'Le slug de source devient une CLÉ Firestore : alphabet fermé [a-z0-9_-], longueur bornée.',
             'Le « Prix de base » barré est le PREMIER piège du parseur : le prix courant est le 1er match « Prix X,XX € », jamais le dernier.',
             'Chaque site a SON gabarit — `parseAuto` aiguille. clickoutil (mesuré sur la page réelle) : réf AVANT la marque, prix « X,XX € TTC » (le HT suit TOUJOURS — 1er jet : 147 promos sur 147), barré APRÈS le TTC en promo, aucun badge de stock.',
             '⛔ ARGENT : un prix de PACK ne s\'écrit JAMAIS sur la réf d\'un composant — titres à « + » écartés ET listés (`packsIgnores`), réf douteuse écartée ET listée (`sansRef`).',
             'Quand `parsed: 0`, la réponse porte `diagnostic` : comptes des motifs + extraits de la page reçue — c\'est elle qui apprend un format inconnu, pas l\'imagination.',
             '⛔ Règles user 02/08 : un MOULAGE/INSERT de coffret n\'est JAMAIS un produit (l\'importateur refuse) ; lames/mèches/fraises → catégorie Quincaillerie ; un accessoire SANS réf se suit par son NOM exact (`srcNom`), jamais si le nom est en doublon sur la page.',
             '⛔ Un COÛT FOURNISSEUR se LIT, jamais ne s\'infère : il est affiché dans l\'admin, section MARGE (dit par l\'user, 02/08). Demander une capture plutôt qu\'inverser le modèle — D-68 : l\'inversion a « mesuré » 152 € là où la page disait 149,90 €.',
             '⛔ Les overrides d\'AVANT le format carte portent leur relevé dans priceSrcTTC/priceSource : `pwSourcesConnues` les ressème dans le min (E-227 — sans ça, 1er passage d\'un site plus cher = hausses fantômes, mesuré : 12 dont +136 %).'],
    decisions: ['D-015'],
    fini: 'check-price-watch vert (ruptures, min multi-sources, gel, héritage), chaque promesse sabotée et rouge.'
  },
  {
    /* ⛔ INTENTION AJOUTÉE LE 10/08/2026, sur son ordre : « enregistre toutes
       les techniques qu'on utilise […] tu dois aller graver quelque part afin
       que tu puisses t'en servir à n'importe quel moment ». Un document que
       l'aiguillage ne cite pas n'est jamais relu au bon moment. */
    intention: 'Ajouter des produits au catalogue — depuis un relevé, en masse',
    mots: ['ajouter des produits', 'ajout de produits', 'ajouter au catalogue', 'créer des fiches',
           'creer des fiches', 'nouvelles fiches', 'verser au catalogue', 'importer des produits',
           'peser', 'poids', 'table de poids', 'méthode', 'methode', 'technique'],
    fichiers: ['scripts/generer-fiches-makita.js', 'data/poids-makita.json',
               'data/types-makita-categorie.json', 'products.json', 'docs/METHODES.md'],
    fonctions: ['poidsExpedie', 'categorieDe', 'phaseDe'],
    protege: ['scripts/generer-catalogue-leger.js --verifie', 'scripts/generer-sitemap.js --verifie',
              'scripts/audit/p8-perf.js', 'docs/METHODES.md (les 22 méthodes nommées)'],
    regles: [],
    pieges: ['⛔⛔ ARGENT — M-02 : le calculateur retombe sur 2 kg quand le poids manque. Mesuré, à coût identique de 500 € TTC : 661,00 € à 2 kg contre 721,50 € à 10 kg. Un poids supposé, c\'est 60,50 € de marge perdue PAR VENTE.',
             '⛔ M-06 — le générateur REFUSE et NOMME ce qui manque (racine, type, coût) : jamais de repli silencieux sur une valeur par défaut.',
             '⛔ M-07 — on ne saisit JAMAIS un prix de vente : on saisit le coût fournisseur, et `pricing-model.recommend` rend le prix. Une seconde formule diverge au premier correctif.',
             '⛔ M-03 — une recherche Web PAR VALEUR. Mesuré le 10/08 : une requête groupant cinq modèles a rendu DHR182 à 0,9 kg ; la recherche ciblée donne 2,4 kg.',
             '⛔ M-01 — une table de correspondance se DÉPOUILLE sur ses propres fiches, seuil ≥ 3 fiches ET ≥ 80 % d\'accord. Une fiche isolée mal rangée contaminerait toute une gamme.',
             '⛔ M-09 — pour REMETTRE des données retirées : restaurer l\'état exact d\'avant et le prouver identique octet à octet. Refabriquer, c\'est s\'offrir une occasion de doublon.',
             '⛔ M-10 — « vérifie-toi trois fois » veut dire TROIS ANGLES : le fichier, les portes, le client. Trois fois la même commande ne vaut rien.',
             '⚠️ M-11 — entre deux lectures possibles, prendre celle qui ne peut pas faire vendre à perte : surestimer le poids ou le contenu, jamais l\'inverse.',
             '⚠️ Le slug est une URL : il se dérive de la RÉFÉRENCE (unique), jamais du titre (qui se répète).'],
    decisions: [],
    fini: 'les fiches versées passent generer-catalogue-leger --verifie et generer-sitemap --verifie, '
      + '0 doublon de sku/id/slug, 0 URL morte, P8 perf conforme, et AUCUNE fiche sans poids sourcé.'
  },
  {
    intention: 'Ce que l\'user a demandé — registre et solde',
    mots: ['demande', 'demandes', 'demandé', 'promis', 'reste a faire', 'reste à faire',
           'oublié', 'oubli', 'pas fait', 'solde', 'livrer', 'livraison'],
    fichiers: ['docs/DEMANDES.md'],
    fonctions: [],
    protege: ['scripts/check-demandes.js'],
    regles: [],
    pieges: ['⛔ Une demande s\'écrit dans le registre AVANT d\'être traitée. Écrite après, elle a déjà pu être oubliée — c\'est comme ça qu\'on livre à moitié.',
             'Trois états seulement : OUVERT (bloque la livraison) · FAIT (avec sa preuve) · RENDU (dépend de l\'user, avec le motif).',
             '⛔ Une ligne ne passe pas à FAIT sans preuve vérifiable — une commande, un compteur, un harnais nommé. « C\'est fait » n\'est pas une preuve.',
             'Une ligne SANS état est pire qu\'une ligne ouverte : elle se lit comme faite. La porte la refuse aussi.',
             '⚠️ La porte ne lit PAS les conversations : une demande non consignée lui reste invisible. Elle empêche qu\'une demande RECONNUE se perde, rien de plus.'],
    decisions: [],
    fini: 'aucune ligne OUVERT, chaque FAIT porte sa preuve, et check-demandes vert.'
  },
  {
    intention: 'Mémoire du projet, règles, documentation',
    mots: ['memoire', 'mémoire', 'claude.md', 'doc', 'documentation', 'regle', 'règle'],
    fichiers: ['../CLAUDE.md', 'docs/JOURNAL.md', 'docs/DECISIONS.md', 'docs/ETAT.md', '.claude/rules'],
    fonctions: [],
    protege: ['scripts/check-memoire.js'],
    regles: [],
    pieges: ['La mémoire est UN SEUL fichier, à la racine du dépôt.',
             'Une règle qui cite un numéro de ligne se périme : citer des noms.',
             'Ne jamais promouvoir une règle renversée — elle contredirait la règle vivante.'],
    decisions: [],
    fini: 'check-memoire vert, CLAUDE.md sous 80 lignes, aucun document orphelin.'
  },
  {
    /* Ajoutée le 01/08/2026. L'entonnoir n'avait RIEN à dire sur une
       réécriture de commentaires en masse — alors que c'est exactement le
       geste qui a coûté une annulation complète le même jour. Une intention
       absente de l'index n'est pas une intention sans danger : c'est un
       danger sans porte. */
    intention: 'Réécrire des commentaires en masse sans toucher au code',
    mots: ['commentaire', 'commentaires', 'purge', 'purger', 'renommer', 'renommage',
           'remplacement', 'remplacer', 'sed', 'reecriture', 'réécriture',
           'apostrophe', 'orthographe', 'typo', 'en masse'],
    fichiers: ['outils/purge-commentaires.mjs', 'node_modules/esprima'],
    fonctions: [],
    protege: ['scripts/ci.js', 'scripts/check-fuites.js', 'tests/lancer.mjs --noyau'],
    regles: ['.claude/rules/harnais.md'],
    pieges: ['⛔ Un remplacement de texte ne distingue PAS un commentaire d\'une chaîne de caractères. Le 01/08/2026 : apostrophe insérée dans une chaîne à quotes simples → fichier qui ne se parse plus ; nom de domaine mué en phrase française ; et CI restée VERTE parce que le chargeur avalait le module cassé.',
             'Passer par le PARSEUR (esprima, déjà présent) et ne réécrire QUE les plages de commentaires qu\'il rend — jamais une plage calculée à la main.',
             '⛔ « Ça se parse encore » ne prouve RIEN : un fichier peut se parser et avoir changé de sens. La seule preuve qui vaut : retirer TOUS les commentaires avant et après, et comparer le reste OCTET PAR OCTET.',
             'Les identifiants de DONNÉES (champs qui existent en base) ne se réécrivent pas, même dans un commentaire : il mentirait sur la donnée réelle.',
             'esprima ne connaît pas `for await` : le neutraliser par des espaces de MÊME LONGUEUR, sinon toutes les positions glissent.'],
    decisions: [],
    fini: 'le code hors commentaires est identique à l\'octet près (empreinte affichée avant/après), CI verte, noyau vert.'
  }
];

/* ═══ RECHERCHE ═══════════════════════════════════════════════════════════ */
function sansAccent(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function chercher(q) {
  var n = sansAccent(q);
  var mots = n.split(/[^a-z0-9]+/).filter(function (m) { return m.length > 2; });
  return INDEX.map(function (e) {
    var score = 0;
    e.mots.forEach(function (m) {
      var mm = sansAccent(m);
      if (n.indexOf(mm) !== -1) score += 10;
      mots.forEach(function (x) { if (mm.indexOf(x) !== -1 || x.indexOf(mm) !== -1) score += 3; });
    });
    if (sansAccent(e.intention).indexOf(n) !== -1) score += 5;
    return { e: e, score: score };
  }).filter(function (r) { return r.score > 0; })
    .sort(function (a, b) { return b.score - a.score; });
}

function bloc(titre, items) {
  if (!items || !items.length) return;
  console.log('  ' + titre);
  items.forEach(function (x) { console.log('    · ' + x); });
  console.log('');
}

function afficher(e) {
  console.log('\n═══ ' + e.intention + ' ' + '═'.repeat(Math.max(0, 62 - e.intention.length)));
  console.log('');
  bloc('① OÙ', e.fichiers.concat(e.fonctions.map(function (f) { return 'fonction ' + f + '()'; })));
  bloc('② CE QUI PROTÈGE', e.protege);
  bloc('③ RÈGLES QUI SE CHARGENT SEULES', e.regles);
  bloc('④ PIÈGES DÉJÀ PAYÉS', e.pieges);
  bloc('⑤ DÉCISIONS EN VIGUEUR (docs/DECISIONS.md)', e.decisions);
  console.log('  ⑥ « FINI » VEUT DIRE ICI');
  console.log('    ' + e.fini + '\n');
}

module.exports = { INDEX: INDEX, chercher: chercher };

if (require.main === module) {
  var args = process.argv.slice(2);

  if (!args.length || args[0] === '--liste') {
    console.log('\nIntentions connues :\n');
    INDEX.forEach(function (e) { console.log('  · ' + e.intention); });
    console.log('\nUsage : node scripts/ou.js "je veux modifier le panier"\n');
    process.exit(0);
  }

  var q = args.join(' ');
  var r = chercher(q);

  if (!r.length) {
    /* ⚠️ NE JAMAIS RÉPONDRE « RIEN ». Un outil qui répond « rien » se fait
       contourner à la troisième tentative, et l'entonnoir ne sert plus. */
    console.log('\n⚠️  Aucune entrée ne correspond à « ' + q +' ».');
    console.log('   Ce n\'est pas une réponse : c\'est un trou dans l\'index.\n');
    console.log('   Les intentions les plus proches :');
    INDEX.slice(0, 5).forEach(function (e) { console.log('     · ' + e.intention); });
    console.log('\n   → AJOUTE cette intention dans scripts/ou.js (tableau INDEX)');
    console.log('     avant de continuer. Un index incomplet se dégrade tout seul.\n');
    process.exit(1);
  }

  if (r.length > 1 && r[0].score === r[1].score) {
    console.log('\n⚠️  Plusieurs entrées à égalité — toutes affichées, à toi de trancher.');
  }
  r.slice(0, 3).forEach(function (x) { afficher(x.e); });
}
