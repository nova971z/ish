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
    mots: ['prix', 'tva', 'octroi', 'marge', 'fidelite', 'fidélité', 'remise', 'tarif'],
    fichiers: ['api/_lib/pricing.js', 'api/_lib/loyalty.js', 'app.js'],
    fonctions: ['calcPrice'],
    protege: ['scripts/check-pricing.js (parité client ↔ serveur)', 'scripts/check-loyalty.js', 'scripts/audit/p5-money.js'],
    regles: ['.claude/rules/produits.md'],
    pieges: ['Le prix affiché et le prix débité doivent tomber au centime — le serveur est autoritaire, le prix client est ignoré.',
             'Le territoire vient du CODE POSTAL, jamais d\'un champ déclaré.'],
    decisions: ['D-004'],
    fini: 'check-pricing et check-loyalty verts, et un paiement de bout en bout rejoué.'
  },
  {
    intention: 'Paiement par carte, Stripe, Revolut, webhook',
    mots: ['paiement', 'stripe', 'revolut', 'carte', 'webhook', 'payer', 'checkout',
           'merchant', 'encaisser', 'versement', 'payout'],
    fichiers: ['api/create-payment-intent.js', 'api/webhook.js', 'api/checkout.js', 'app.js',
               'docs/PLAN-REVOLUT.md'],
    fonctions: ['openPayModal'],
    protege: ['tests/course-pay.mjs', 'scripts/audit/p5-money.js'],
    regles: ['.claude/rules/donnees.md'],
    pieges: ['La clé publique vit dans un script inline autorisé par empreinte sha256 : la changer sans recalculer la CSP BLOQUE le script et tue le site.',
             'Le webhook doit lire le corps BRUT — un corps parsé invalide la signature.',
             'MIGRATION REVOLUT EN COURS (docs/PLAN-REVOLUT.md) : la charge utile du webhook Revolut ne contient QUE {event, order_id} — ni montant, ni commission, ni metadata. Tout se relit par GET /api/orders puis GET /api/payments.',
             'Revolut ne fournit AUCUN identifiant d\'événement : la clé d\'idempotence doit être dérivée de event + order_id, pas copiée du modèle Stripe.',
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
      'La commission Stripe n\'est pas supposée rendue : elle se saisit d\'après le tableau de bord, jamais d\'après une hypothèse.'
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
    intention: 'Écrire ou corriger un harnais de test',
    mots: ['test', 'harnais', 'playwright', 'assertion', 'sabotage'],
    fichiers: ['tests', 'tests/_socle.mjs', 'tests/lancer.mjs'],
    fonctions: [],
    protege: ['scripts/check-harnais.js'],
    regles: ['.claude/rules/harnais.md'],
    pieges: ['Une vérification qu\'on ne parvient pas à faire échouer ne vérifie rien : sabotage obligatoire.',
             'context.route() n\'intercepte PAS les requêtes émises depuis un Service Worker.',
             'Deux goto() sur la même URL ne rechargent pas la page.'],
    decisions: [],
    fini: 'le harnais est vert ET prouvé faillible par sabotage délibéré.'
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
