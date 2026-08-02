// POST /api/admin — Admin CRUD for product overrides.
// Auth : header "x-admin-secret" must match env ADMIN_SECRET.
// Storage : Firestore collection `product_overrides/{id}`.
// Without Firebase configured, returns 503 with a helpful message.

const auth = require('./_lib/auth');
const http = require('./_lib/http');
const firebase = require('./_lib/firebase');
const analytics = require('./_lib/analytics');
const catalog = require('./_lib/catalog');
const priceParse = require('./_lib/price-parse');
const priceModel = require('./_lib/pricing-model');
const priceConfig = require('./_lib/pricing-config');
const pricing = require('./_lib/pricing');   // territoires (taux TVA/octroi) — saisie remboursement

/* Code postal de l'adresse FICTIVE du diagnostic Revolut. Au niveau du module,
   pas dans un bloc : la création de la commande et sa relecture vivent dans
   deux `if` différents, et une constante déclarée dans l'un ne serait pas
   forcément visible dans l'autre. Deux valeurs recopiées à la main
   divergeraient un jour — et c'est justement leur ÉGALITÉ qui prouve que le
   code postal fait l'aller-retour, donc que le contrôle fiscal aura de quoi
   travailler en production. */
const CP_DIAGNOSTIC = '97139';

module.exports = async function handler(req, res) {
  http.applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── Auth ──────────────────────────────────────────────────
  // ⚠️ Le traqueur de prix a sa PROPRE porte, traitée AVANT celle de
  // l'administration. Raison mesurée le 31/07/2026 : `requireAdmin` s'exécutait
  // ici, en tête, et refusait le raccourci iPad depuis le retrait
  // d'`ADMIN_SECRET` (A5). Le raccourci recevait « Invalid admin credentials »
  // et n'atteignait JAMAIS le reste du fichier — pas même le message « POST
  // uniquement ». Les prix fournisseur ont cessé d'être relevés EN SILENCE.
  //
  // ⚠️ J4 — ce point d'entrée décide de PRIX DE VENTE. Le prix relevé chez le
  // fournisseur est un COÛT, jamais un prix de référence affichable : rien ici
  // ne doit produire un prix barré ni une réduction annoncée (D-004).
  const estWatch = (req.query && req.query.type) === 'price-watch';
  const denied = estWatch ? await auth.requireWatch(req) : await auth.requireAdmin(req);
  if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });

  // ── Firestore (shared initializer) ────────────────────────
  const { admin, db } = firebase.getFirebase();
  if (!db) {
    return res.status(503).json({
      ok: false,
      error: 'Firestore not configured. Set FIREBASE_SERVICE_ACCOUNT env var.'
    });
  }

  // ── GET : list overrides OR recent orders ────────────────
  if (req.method === 'GET') {
    const type = (req.query && req.query.type) || 'overrides';

    /* ── GET ?type=moi : « suis-je le propriétaire ? » — ZÉRO lecture ──────
       Panne du 02/08/2026, mesurée sur l'écran de l'user : « 8
       RESOURCE_EXHAUSTED: Quota exceeded ». La porte admin vérifiait le
       claim en appelant le GET par défaut… qui lit TOUTE la collection des
       overrides. Quota Firestore épuisé = impossible même d'ENTRER dans
       l'admin. Or `requireAdmin` a déjà tranché plus haut, sans une seule
       lecture Firestore : arrivé ici, la réponse est oui. Ce point d'entrée
       ne touche à rien — la porte doit s'ouvrir même quand le quota est à
       sec (les panneaux, eux, diront leurs propres erreurs). */
    if (type === 'moi') return res.status(200).json({ ok: true, moi: true });

    // ── GET ?type=export-catalogue : le catalogue FUSIONNÉ, prêt à remplacer
    //    products.json ───────────────────────────────────────────────────────
    // POURQUOI CE POINT D'ENTRÉE EXISTE
    // Le site a DEUX sources de prix : `products.json` (versionné, servi par le
    // CDN) et `product_overrides` (Firestore, écrit par le traqueur). Le client
    // peint d'abord le fichier statique, puis passe à /api/products sous 6 s —
    // si l'API traîne ou échoue, le visiteur GARDE le prix du fichier. Comme
    // rien ne renvoie jamais les overrides vers le fichier, l'écart ne fait que
    // croître : c'est la cause des « prix différents partout ».
    //
    // Cet export rend la fusion telle qu'elle doit être écrite dans le fichier.
    // On la récupère, on la commite, et le statique cesse de mentir.
    //
    // ⚠️ `loadPublicCatalog()` et non `loadCatalog()` : les champs internes
    // (coût d'achat fournisseur, marge appliquée) ne doivent JAMAIS entrer dans
    // un fichier servi publiquement. Publier `priceSrcTTC`, ce serait publier
    // le prix d'achat de chaque produit — et ce serait irréversible, le fichier
    // partant sur le CDN puis dans l'historique git.
    /* ── GET ?type=revolut-ping : PREMIER contact réseau avec Revolut ──────
       Diagnostic d'installation. Il répond à trois questions dans l'ordre où
       elles se posent, et une seule à la fois :
         1. la clé secrète est-elle posée sur Vercel ?
         2. est-elle ACCEPTÉE par Revolut ? (c'est un appel réel, en LECTURE)
         3. quel environnement répond ?

       ⛔ REFUSE EN PRODUCTION. Un diagnostic qui tape sur l'API de production
       n'est plus un diagnostic : c'est un appel non prévu sur le chemin de
       l'argent réel. Il ne s'exécute qu'en bac à sable.

       ⛔ NE RENVOIE JAMAIS LA CLÉ, ni entière ni tronquée. Un extrait de secret
       reste un secret : cette réponse s'affiche à l'écran, se copie, se colle
       dans une conversation. On ne renvoie que sa LONGUEUR — le seul indice
       utile, celui qui révèle un copier-coller tronqué. */
    if (type === 'revolut-ping') {
      const paiementSocle = require('./_lib/paiement');
      const rev = require('./_lib/paiement/revolut');
      const longueur = String(process.env.REVOLUT_SECRET_KEY_SANDBOX || '').length;

      if (rev._modeProd()) {
        return res.status(400).json({
          ok: false,
          etape: 'garde',
          erreur: 'REVOLUT_MODE vaut « prod ». Ce diagnostic ne tape JAMAIS sur '
            + 'l\'API de production. Repasser la variable à « sandbox ».'
        });
      }
      if (!rev.estConfigure()) {
        return res.status(400).json({
          ok: false, etape: 'cle',
          erreur: 'REVOLUT_SECRET_KEY_SANDBOX absente ou vide sur Vercel. '
            + '⚠️ Une variable ajoutée ne prend effet QU\'AU DÉPLOIEMENT SUIVANT.',
          longueurCle: longueur
        });
      }
      try {
        // Appel RÉEL, en lecture seule : on ne crée rien, on ne débite rien.
        // S'il passe, l'authentification et l'URL de base sont bonnes.
        const ordres = await rev.listerPaiements(Date.now() - 24 * 3600 * 1000, Date.now());
        return res.status(200).json({
          ok: true,
          etape: 'reseau',
          message: 'Revolut a répondu. La clé est acceptée.',
          base: rev._base(),
          fournisseurActif: paiementSocle.nomFournisseur(),
          longueurCle: longueur,
          ordresDernieres24h: ordres.length
        });
      } catch (e) {
        return res.status(200).json({
          ok: false, etape: 'reseau',
          erreur: String(e.message || e).slice(0, 400),
          base: rev._base(),
          longueurCle: longueur,
          indice: /401|403/.test(String(e.message))
            ? 'Clé refusée : recoller la clé SECRET (pas la Public) en entier, sans espace, puis REDÉPLOYER.'
            : 'Vérifier que le compte Merchant du bac à sable est bien activé.'
        });
      }
    }

    /* ── GET ?type=revolut-commande-test : créer un ORDRE réel, en bac à sable ─
       Deuxième étape du diagnostic. `revolut-ping` prouve que la clé est
       acceptée ; celui-ci prouve qu'on sait CRÉER, et rend une `checkout_url`
       ouvrable pour payer avec une carte de test.

       ⛔ MÊME GARDE QU'AU PING : refuse si REVOLUT_MODE vaut « prod ». Créer
       des ordres de test en production polluerait la comptabilité réelle avec
       des montants qui ne correspondent à aucune vente.

       Montant : 3000 centimes = 30,00 €. Ce n'est pas arbitraire — la
       documentation dit que les commandes sous 30 € en EUR sont EXEMPTÉES de
       3-D Secure. En dessous, la carte de test « échec 3DS » réussirait, et le
       test ne testerait rien. */
    if (type === 'revolut-commande-test') {
      const rev = require('./_lib/paiement/revolut');
      if (rev._modeProd()) {
        return res.status(400).json({
          ok: false, etape: 'garde',
          erreur: 'REVOLUT_MODE vaut « prod ». On ne crée JAMAIS de commande de test '
            + 'en production : elle polluerait la comptabilité réelle.'
        });
      }
      if (!rev.estConfigure()) {
        return res.status(400).json({ ok: false, etape: 'cle',
          erreur: 'REVOLUT_SECRET_KEY_SANDBOX absente. Lancer d\'abord le test de connexion.' });
      }
      try {
        const cree = await rev.creerPaiement({
          montantCents: 3000,
          devise: 'eur',
          description: 'Commande de test Pirates Tools (bac a sable)',
          reference: 'TEST-' + Date.now(),
          /* ⛔ ADRESSE OBLIGATOIRE DANS LE DIAGNOSTIC — sans elle, le test ne
             prouvait pas l'aller-retour d'adresse, et c'est ce qui fait vivre
             le CONTRÔLE FISCAL DÉTECTIF (A1) : `taxCheck` compare le territoire
             déclaré au code postal RÉELLEMENT collecté. Si `depuisOrdre` lisait
             mal ce champ, `expected` vaudrait `null`, `mismatch` serait
             toujours faux, et la garde serait SILENCIEUSEMENT morte — tout
             marcherait, rien ne casserait, et une protection ne protégerait
             plus rien.
             ⚠️ Adresse FICTIVE, en Guadeloupe (971) : c'est le territoire réel
             du site, donc le cas qui compte. `pays: FR` et non GP — le site
             identifie les DOM par le code postal, pas par le code pays (voir
             `monterChampCarteRevolut`). */
          livraison: {
            nom: 'Diagnostic Pirates Tools',
            ligne1: '1 rue du Diagnostic',
            ville: 'Les Abymes',
            codePostal: CP_DIAGNOSTIC,
            pays: 'FR'
          },
          metadata: { source: 'pirates-tools', test: '1' }
        });
        return res.status(200).json({
          ok: true, etape: 'creation',
          message: 'Commande créée dans le bac à sable.',
          id: cree.id,
          // ⚠️ Le `token` sert à monter le widget. Ce n'est pas un secret de
          // compte : il ne vaut que pour CETTE commande de test à 30 € en
          // fausse monnaie, et il expire (expire_pending_after = PT30M).
          jeton: cree.jetonClient,
          urlPaiement: cree.urlHebergee,
          montant: '30,00 €'
        });
      } catch (e) {
        return res.status(200).json({
          ok: false, etape: 'creation',
          erreur: String(e.message || e).slice(0, 400),
          indice: 'Le compte Merchant du bac à sable doit être activé et accepter l\'EUR.'
        });
      }
    }

    /* ── GET ?type=revolut-webhook : enregistrer le webhook chez Revolut ────
       Sans webhook, un paiement réussi ne produit NI commande, NI facture, NI
       e-mail. C'est le maillon dont l'absence ne se voit qu'au premier vrai
       paiement — c'est-à-dire trop tard.

       ⚠️ CE POINT D'ENTRÉE AFFICHE UN SECRET, ET C'EST INÉVITABLE.
       `POST /api/webhooks` renvoie le `signing_secret` ; c'est le seul moyen de
       l'obtenir, et il doit être recopié sur Vercel. Trois précautions :
         · il ne s'affiche que derrière `requireAdmin` ;
         · il n'est JAMAIS écrit dans un journal serveur ni dans Firestore ;
         · la réponse porte un avertissement explicite.
       ⛔ Refuse en production, comme les deux autres diagnostics.

       Idempotence : si un webhook pointe DÉJÀ sur cette adresse, on ne crée
       rien. Deux abonnements identiques doubleraient chaque notification, donc
       chaque tentative de traitement. */
    if (type === 'revolut-webhook') {
      const rev = require('./_lib/paiement/revolut');
      if (rev._modeProd()) {
        return res.status(400).json({ ok: false, etape: 'garde',
          erreur: 'REVOLUT_MODE vaut « prod ». Cet outil ne touche que le bac à sable.' });
      }
      if (!rev.estConfigure()) {
        return res.status(400).json({ ok: false, etape: 'cle',
          erreur: 'REVOLUT_SECRET_KEY_SANDBOX absente.' });
      }
      /* ⛔ L'ADRESSE DÉCLARÉE CHEZ REVOLUT NE SE DEVINE PAS. Elle était
         fabriquée en recopiant l'en-tête `Origin` du navigateur : sans lui
         (et il manque plus souvent qu'on ne croit), la cible valait
         « /api/webhook » — une adresse relative que Revolut refuse, avec un
         message qui ne dit pas pourquoi. Et la recopier telle quelle, c'est
         laisser un tiers choisir où partiront les notifications de paiement.
         `origineSure` la valide contre ALLOWED_ORIGINS, ou rend `null`. */
      const origine = http.origineSure(req);
      if (!origine) {
        return res.status(400).json({ ok: false, etape: 'origine',
          erreur: 'Impossible de déterminer l\'adresse publique du site de façon sûre.',
          indice: 'Poser sur Vercel soit ALLOWED_ORIGINS (qui doit contenir '
            + 'https://pirates-tools.com), soit PUBLIC_BASE_URL = https://pirates-tools.com, '
            + 'puis redéployer. Sans ça, on enverrait à Revolut une adresse fabriquée '
            + 'au hasard — et aucune notification de paiement n\'arriverait.' });
      }
      const cible = origine + '/api/webhook';
      try {
        const deja = await rev.listerWebhooks();
        const memeUrl = deja.filter(function (w) { return w && w.url === cible; });
        if (memeUrl.length) {
          return res.status(200).json({
            ok: true, etape: 'existant',
            message: 'Un webhook pointe DÉJÀ sur cette adresse — rien n\'a été créé.',
            url: cible, id: memeUrl[0].id, evenements: memeUrl[0].events || [],
            rappel: 'Le secret de signature ne se ré-affiche pas ici. S\'il manque sur '
              + 'Vercel, supprimer ce webhook côté Revolut puis relancer ce bouton.'
          });
        }
        const w = await rev.creerWebhook(cible);
        return res.status(200).json({
          ok: true, etape: 'creation',
          message: 'Webhook enregistré.',
          url: w.url, id: w.id, evenements: w.evenements,
          secretSignature: w.secretSignature,
          aFaire: 'Poser ce secret sur Vercel sous le nom '
            + 'REVOLUT_WEBHOOK_SECRET_SANDBOX, puis REDÉPLOYER. '
            + '⚠️ Il ne sera plus affiché ici.'
        });
      } catch (e) {
        return res.status(200).json({ ok: false, etape: 'creation',
          erreur: String(e.message || e).slice(0, 400), url: cible,
          indice: 'L\'adresse doit être publique et en HTTPS pour que Revolut l\'accepte.' });
      }
    }

    /* ── GET ?type=reconciliation : LE FILET SOUS LE WEBHOOK ────────────────
       Compare ce que le fournisseur dit avoir encaissé à ce que notre journal
       `payments/` contient. Tout ce qui est dans le premier et pas dans le
       second est de l'argent encaissé pour lequel un client attend une commande
       qui n'existe pas — le pire mode de panne du site, parce qu'il est
       SILENCIEUX : rien ne casse, rien n'alerte, personne ne le sait.

       ⚠️ CE POINT D'ENTRÉE N'EST PAS UN DIAGNOSTIC — il n'a donc AUCUNE garde
       de production, contrairement aux trois outils Revolut au-dessus. C'est
       exactement en production qu'il sert. Il ne fait que LIRE, des deux côtés,
       et n'écrit rien nulle part.

       ⛔ IL MARCHE POUR LES DEUX FOURNISSEURS. Il passe par la couture, jamais
       par un SDK : le jour de la bascule, il continue de tourner sans qu'on y
       touche. C'est le seul filet qui restera si la politique de re-livraison
       de Revolut est plus courte que celle de l'ancien fournisseur — elle n'est pas
       documentée, et on ne parie pas là-dessus.

       ⛔ AUCUNE DONNÉE PERSONNELLE NE SORT (règle J3, audit p6-rgpd) : la
       réponse ne porte que des identifiants, des montants et des dates. Les
       ordres relus contiennent pourtant e-mail, nom et adresse — on les jette
       délibérément ici, au lieu de les laisser passer « au cas où ». */
    if (type === 'reconciliation') {
      const recon = require('./_lib/paiement/reconciliation');
      const socle = require('./_lib/paiement');
      const paiement = socle.fournisseur();
      if (!paiement.estConfigure()) {
        return res.status(400).json({ ok: false,
          erreur: 'Fournisseur « ' + paiement.nom() + ' » non configuré : sa clé secrète '
            + 'est absente. Sans elle on ne peut pas demander ce qu\'il a encaissé.' });
      }
      /* Fenêtre bornée à 30 jours : une fenêtre plus large ferait expirer la
         fonction avant de rendre quoi que ce soit, et un rattrapage qui
         n'aboutit jamais ne rattrape rien. Plusieurs passages courts valent
         mieux qu'un passage unique qui meurt. */
      const jours = Math.min(30, Math.max(1, parseInt((req.query && req.query.jours), 10) || 7));
      const jusqua = Date.now();
      const depuis = jusqua - jours * 24 * 60 * 60 * 1000;
      try {
        const ordres = await paiement.listerPaiements(depuis, jusqua);

        /* ⛔⛔ SEULS LES PAIEMENTS ABOUTIS COMPTENT COMME « DÉJÀ TRAITÉS ».
           `payments/{id}` porte AUSSI les tentatives ratées (status 'failed'),
           sous le MÊME identifiant que la commande — c'est le même ordre chez
           Revolut, le client réessaie dessus. Prendre tous les documents
           reviendrait à dire : « cet ordre est dans le journal, donc il est
           traité ». Un client dont la 1ʳᵉ tentative échoue, dont la 2ᵉ réussit,
           et dont le webhook de succès se perd, serait alors DÉFINITIVEMENT
           invisible pour le filet — le seul cas où il devait servir. */
        const journalSnap = await db.collection('payments').where('status', '==', 'succeeded').get();
        const idsAboutis = [];
        journalSnap.forEach(function (doc) { idsAboutis.push(doc.id); });

        const r = recon.comparer(ordres, idsAboutis, {});
        /* ⛔ EST-CE DE L'ARGENT ? La réponse change la NATURE du message, pas
           sa véracité. Deux paiements de l'ancien fournisseur en mode test ont été signalés
           comme « 317,79 € encaissés, un client attend » le 01/08/2026 : le
           filet disait vrai (absents du journal) et mentait sur la gravité.
           `null` = indéterminable → l'écran doit se comporter comme si c'était
           réel. On ne devine pas du côté qui rassure. */
        const enTest = paiement.modeTest();
        return res.status(200).json({
          ok: true,
          fournisseur: paiement.nom(),
          modeTest: enTest,
          fenetreJours: jours,
          resume: recon.resume(r),
          // Identifiants, montants, dates. Rien d'autre ne sort d'ici.
          orphelins: r.orphelins.map(function (o) {
            return { id: o.id, montantCents: o.montantCents, devise: o.devise, creeAMs: o.creeAMs };
          }),
          comptes: {
            examines: r.total,
            dejaTraites: r.dejaTraites.length,
            tropRecents: r.ignoresTropRecents.length,
            nonEncaisses: r.nonEncaisses.length,
            horsPerimetre: r.horsPerimetre.length,
            journalAboutis: idsAboutis.length
          }
        });
      } catch (e) {
        /* ⛔ On dit que la réconciliation N'A PAS EU LIEU. Rendre « 0 orphelin »
           sur une erreur serait le mensonge le plus cher du fichier : un filet
           qui rassure sans avoir regardé. */
        return res.status(200).json({ ok: false,
          erreur: String(e.message || e).slice(0, 400),
          avertissement: 'La réconciliation N\'A PAS TOURNÉ. Ce n\'est pas « aucun '
            + 'orphelin » : c\'est « on ne sait pas ». À relancer.' });
      }
    }

    /* ── GET ?type=revolut-relire : LE MAILLON JAMAIS EXÉCUTÉ ─────────────
       `depuisOrdre` et `commissionCents` n'ont jamais tourné sur une VRAIE
       réponse Revolut — seulement sur des jeux d'essai que j'ai écrits
       moi-même, donc conformes à ce que je CROIS de leur API. Si un champ
       s'appelle autrement, le montant, l'adresse ou la commission seront faux.

       ⛔ Découvrir ça au moment où une facture est émise coûterait un numéro de
       séquence — qui ne se rend pas. On le prouve donc AVANT la bascule, sur la
       commande de test déjà payée : lecture seule, aucune facture, aucun
       e-mail, aucune écriture.

       ⛔ Refuse en production, comme les autres diagnostics. */
    if (type === 'revolut-relire') {
      const rev = require('./_lib/paiement/revolut');
      if (rev._modeProd()) {
        return res.status(400).json({ ok: false, etape: 'garde',
          erreur: 'REVOLUT_MODE vaut « prod ». Cet outil ne touche que le bac à sable.' });
      }
      const idOrdre = String((req.query && req.query.id) || '').trim().slice(0, 80);
      if (!idOrdre) {
        return res.status(400).json({ ok: false, etape: 'id',
          erreur: 'Référence de commande manquante.',
          indice: 'Crée d\'abord une commande de test : sa référence s\'affiche ici.' });
      }
      try {
        const p = await rev.lirePaiement(idOrdre, { avecCommission: true });
        return res.status(200).json({
          ok: true,
          id: p.id,
          etat: p.etat,
          etatBrut: p.etatBrut,
          montantCents: p.montantCents,
          devise: p.devise,
          /* ⛔ `null` n'est PAS `0`. Une commission inconnue rendue à zéro
             ferait croire à une vente sans frais et fausserait la marge de
             chaque ligne du compte de résultat. */
          commissionCents: p.commissionCents,
          commissionLue: p.commissionCents !== null,
          marqueCarte: p.marqueCarte,
          paysCarte: p.paysCarte,
          /* Présence seulement — jamais la valeur : cet écran se photographie. */
          aEmail: !!p.email,
          aNom: !!p.nom,
          aAdresse: !!(p.adresse && p.adresse.codePostal),
          /* ⛔ LE POINT QUI COMPTE : le code postal revient-il IDENTIQUE ?
             C'est lui, et lui seul, qui permet au contrôle fiscal de comparer
             le territoire déclaré au territoire réel. S'il ne revient pas, la
             garde A1 est muette en production sans que rien ne le signale. */
          codePostalRetrouve: !!(p.adresse && p.adresse.codePostal === CP_DIAGNOSTIC),
          metadataVues: Object.keys(p.metadata || {})
        });
      } catch (e) {
        return res.status(200).json({ ok: false, etape: 'lecture',
          erreur: String(e.message || e).slice(0, 400),
          indice: 'La référence doit être celle d\'une commande créée dans CE bac à sable.' });
      }
    }

    /* ── GET ?type=webhook-sante : LE FOURNISSEUR NOUS PARLE-T-IL ? ────────
       La question à laquelle rien ne répondait. Un webhook dont la signature
       est refusée renvoie 400 : le fournisseur réessaie quelques fois, puis
       abandonne. La vente est encaissée, rien n'est enregistré, et l'unique
       trace partait dans les journaux Vercel — que personne ne lit.

       ⛔ Distinguer les trois états, parce qu'ils appellent trois gestes
       différents : jamais rien reçu (le webhook n'est pas déclaré, ou l'adresse
       est fausse) · reçu et ACCEPTÉ (tout va bien) · reçu et REFUSÉ (le secret
       de signature ne correspond pas — c'est le cas le plus vicieux, parce que
       le fournisseur ET le site ont l'air corrects chacun de leur côté).

       ⛔ Lecture seule, aucune donnée personnelle : horodatages, compteurs,
       genre d'événement et motif technique. Rien d'autre n'est stocké. */
    if (type === 'webhook-sante') {
      try {
        const doc = await db.collection('config').doc('webhook_sante').get();
        const d = doc.exists ? (doc.data() || {}) : {};
        return res.status(200).json({
          ok: true,
          jamaisRecu: !doc.exists || !d.dernierRecuMs,
          fournisseur: d.fournisseur || null,
          recus: d.recus || 0,
          acceptes: d.acceptes || 0,
          refuses: d.refuses || 0,
          dernierRecuMs: d.dernierRecuMs || null,
          dernierAccepteMs: d.dernierAccepteMs || null,
          dernierGenre: d.dernierGenre || null,
          dernierRefusMs: d.dernierRefusMs || null,
          dernierRefusMotif: d.dernierRefusMotif || null
        });
      } catch (e) {
        return res.status(200).json({ ok: false, etape: 'lecture',
          erreur: String(e.message || e).slice(0, 300),
          indice: 'Firestore doit être configuré (FIREBASE_SERVICE_ACCOUNT).' });
      }
    }

    if (type === 'export-catalogue') {
      try {
        const fusion = await catalog.loadPublicCatalog();
        const INTERNES = ['priceSource', 'priceSrcTTC', 'priceCheckedAt', 'priceMarkup',
          'priceMode', 'priceRecomputedAt', 'priceCostOrigin', 'hidden'];
        const fuites = [];
        fusion.forEach(function (p) {
          INTERNES.forEach(function (k) { if (k in p && fuites.indexOf(k) === -1) fuites.push(k); });
        });
        if (fuites.length) {
          return res.status(500).json({
            ok: false,
            error: 'Export refusé : champs internes présents (' + fuites.join(', ')
              + '). Publier le prix d\'achat serait irréversible.'
          });
        }
        return res.status(200).json({ ok: true, count: fusion.length, products: fusion });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
    // FAIL-LOUD : price-watch est POST uniquement (corps JSON {text} + en-tête
    // x-admin-secret — voir docs/TRAQUEUR-URLS.md). Avant, un GET retombait
    // SILENCIEUSEMENT sur la liste des overrides → un raccourci iPad mal
    // configuré (méthode restée GET) « réussissait » sans jamais mettre à jour
    // un seul prix. Désormais l'erreur est explicite dans la réponse.
    if (type === 'price-watch') {
      return res.status(405).json({
        ok: false,
        error: 'price-watch = POST uniquement. Raccourci : Méthode POST, Corps JSON { text: <contenu cotébrico> }, en-tête x-admin-secret. Voir docs/TRAQUEUR-URLS.md.'
      });
    }
    try {
      /* ── MOUVEMENT DES PRIX ───────────────────────────────────────────
         Demandé par l'user le 01/08/2026 : « une page mouvement des prix, un
         tableau avec les prix qui ont bougé, je choisis sur combien de jours ».

         Source : `price_watch_log`, écrit par le traqueur à chaque
         application de prix. On ne recalcule RIEN ici — on relit ce qui a
         réellement été appliqué. Un tableau qui recalculerait les prix
         montrerait ce qu'ils DEVRAIENT être, pas ce qu'ils ont ÉTÉ.

         ⚠️ `where('at','>=') + orderBy('at')` sur le même champ : pas d'index
         composite requis, mais l'entrée est tout de même versionnée dans
         `firestore.indexes.json` — l'émulateur ne signale jamais un index
         manquant, et on ne veut pas l'apprendre en production. */
      /* ── REMISE À ZÉRO DE LA COMPTABILITÉ ─────────────────────────────
         Demandée par l'user le 01/08/2026, deux fois, en toutes lettres :
         « je m'en fous que ça casse les informations dans la comptabilité, on
         vire tout, on remet l'historique à zéro, on refera des tests ».

         J'avais soulevé le caractère irréversible ; il a tranché. Ces écritures
         sont celles de la phase de TEST (fausse monnaie du bac à sable), pas
         des recettes réelles déclarées.

         ⛔ CE QUE ÇA EFFACE, DÉFINITIVEMENT :
           · `payments`       — le journal des encaissements (compte de
                                résultat, TVA, fidélité et historique client en
                                dépendent tous) ;
           · `charges`        — les charges saisies ;
           · `refunds`        — les avoirs et remboursements ;
           · `stripe_events`  — les notifications déjà traitées ;
           · `config/invoice` — le compteur de numéros de facture, remis à 0.

         ⛔ CE QUE ÇA N'EFFACE PAS, et ce n'est pas négociable : les COMPTES
         CLIENTS, les COURSES DE LIVRAISON et le CATALOGUE. Effacer un compte
         client détruirait les données personnelles de TIERS (J3) — c'est une
         autre décision, elle ne se prend pas dans le même geste.

         ⚠️ ESSAI PAR DÉFAUT : sans `confirmer: "OUI"` dans le corps, on COMPTE
         et on rend le compte, sans rien supprimer. Un geste irréversible ne
         part jamais sur un clic isolé. */
      if (type === 'raz-compta') {
        const COLLECTIONS = ['payments', 'charges', 'refunds', 'stripe_events'];
        const compte = {};
        for (const c of COLLECTIONS) {
          try { compte[c] = (await db.collection(c).get()).size; }
          catch (e) { compte[c] = -1; }
        }
        if (String((body && body.confirmer) || '') !== 'OUI') {
          return res.status(200).json({
            ok: true, essai: true, compte: compte,
            message: 'Rien n\'a ete supprime.'
          });
        }
        const efface = {};
        for (const c of COLLECTIONS) {
          let n = 0;
          try {
            /* Par lots de 400 : une écriture groupée Firestore plafonne à 500
               opérations et échoue EN ENTIER au-delà — on perdrait la moitié
               d'une suppression sans savoir laquelle. */
            for (;;) {
              const snap = await db.collection(c).limit(400).get();
              if (snap.empty) break;
              const lot = db.batch();
              snap.forEach((d) => lot.delete(d.ref));
              await lot.commit();
              n += snap.size;
              if (snap.size < 400) break;
            }
          } catch (e) { /* collection absente : rien a effacer */ }
          efface[c] = n;
        }
        try { await db.collection('config').doc('invoice').set({ last: 0, year: null }, { merge: true }); }
        catch (e) { /* compteur absent */ }
        return res.status(200).json({ ok: true, essai: false, efface: efface });
      }

      if (type === 'price-moves') {
        const jours = Math.min(365, Math.max(1, Number(req.query.jours) || 30));
        const depuis = Date.now() - jours * 24 * 3600 * 1000;
        const snap = await db.collection('price_watch_log')
          .where('at', '>=', depuis).orderBy('at', 'desc').limit(500).get();
        const cat = await catalog.loadCatalog();
        const parId = {};
        cat.forEach((p) => { parId[p.id] = p; });
        const moves = [];
        snap.forEach((d) => {
          const v = d.data();
          const p = parId[v.id] || null;
          const ancien = Number(v.oldPrice) || 0;
          const nouveau = Number(v.newPrice) || 0;
          if (!(ancien > 0) || !(nouveau > 0) || ancien === nouveau) return;
          moves.push({
            id: v.id, sku: v.sku || (p && p.sku) || v.id,
            titre: (p && p.title) || v.sku || v.id,
            img: (p && p.img) || 'images/placeholder.svg',
            marque: v.brand || (p && p.brand) || '',
            ancien: ancien, nouveau: nouveau,
            variation: Math.round((nouveau / ancien - 1) * 1000) / 10,
            at: Number(v.at) || 0
          });
        });
        return res.status(200).json({ ok: true, jours: jours, moves: moves });
      }

      if (type === 'orders') {
        // 50 dernières commandes, TOUS clients (collectionGroup).
        // Tri sur `date` : c'est LE champ horodatage que le client écrit
        // (serverTimestamp, app.js — la allowlist firestore.rules n'autorise
        // d'ailleurs que lui). L'ancien orderBy('createdAt') portait sur un
        // champ qu'aucune commande n'a jamais eu → Firestore excluait tous les
        // docs → liste structurellement vide. Nécessite le fieldOverride
        // COLLECTION_GROUP DESCENDING sur orders.date (firestore.indexes.json).
        const ordersSnap = await db.collectionGroup('orders')
          .orderBy('date', 'desc')
          .limit(50)
          .get();
        const orders = [];
        ordersSnap.forEach((doc) => {
          const d = doc.data();
          orders.push({
            id: doc.id,
            status: d.status || 'pending',
            customerEmail: d.customerEmail || d.email || '',
            total: typeof d.total === 'number' ? d.total : (typeof d.amount === 'number' ? d.amount : null),
            createdAt: d.date && d.date.toMillis ? d.date.toMillis() : (d.date || null),
            stripeSessionId: d.stripeSessionId || ''
          });
        });
        return res.status(200).json({ ok: true, orders: orders });
      }

      // ── Statistiques (dashboard analytics maison) ──────────────
      if (type === 'stats') {
        // Lecture simple sans tri : Firestore N'AUTORISE PAS orderBy(documentId,
        // 'desc') (« does not support descending key scans ») → ça faisait
        // planter la requête, et le dashboard affichait 0 alors que les données
        // existaient. summarize() somme et trie côté serveur ; toutes ces
        // collections sont naturellement bornées (analytics_daily = 1 doc/jour,
        // purgé > 14 mois ; le reste 1 doc/produit, /cible, /pays).
        const readAll = async (coll) => {
          const s = await db.collection(coll).get();
          const out = [];
          s.forEach((d) => out.push(Object.assign({ id: d.id }, d.data())));
          return out;
        };
        const daily = await readAll('analytics_daily');
        const products = await readAll('analytics_products');
        const clicks = await readAll('analytics_clicks');
        const geo = await readAll('analytics_geo');
        return res.status(200).json({ ok: true, stats: analytics.summarize(daily, products, clicks, geo) });
      }

      // ── Cartes client (comptes créés) ──────────────────────────
      if (type === 'clients') {
        const usersSnap = await db.collection('users').limit(200).get();
        const clients = [];
        for (const u of usersSnap.docs) {
          const d = u.data() || {};
          let orderCount = 0;
          try {
            const agg = await db.collection('users/' + u.id + '/orders').count().get();
            orderCount = agg.data().count;
          } catch (_) { orderCount = 0; }
          clients.push({
            uid: u.id,
            name: d.name || '',
            email: d.email || '',
            phone: d.phone || '',
            address: d.address || '',
            avatar: d.avatar || '',
            loyalty: (d.loyalty && typeof d.loyalty === 'object') ? d.loyalty : null,
            orderCount: orderCount,
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt || null)
          });
        }
        clients.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return res.status(200).json({ ok: true, clients: clients, total: clients.length });
      }

      // ── Config de tarification (marge cible) ───────────────────
      if (type === 'pricing-config') {
        const cfg = await priceConfig.load();
        return res.status(200).json({ ok: true, config: cfg });
      }

      // ── Synthèse comptable (compte de résultat) ────────────────
      // Revenus RÉELS lus du journal `payments` (Revolut) ; structure de résultat
      // ESTIMÉE par le modèle de marge (à valider par l'expert-comptable).
      if (type === 'accounting') {
        const accounting = require('./_lib/accounting');
        const cfg = await priceConfig.load();
        const paySnap = await db.collection('payments').get();
        const payments = [];
        paySnap.forEach((doc) => {
          const d = doc.data() || {};
          payments.push({
            amountCents: typeof d.amountCents === 'number' ? d.amountCents : 0,
            cogsHtCents: (typeof d.cogsHtCents === 'number') ? d.cogsHtCents : null,
            stripeFeeCents: (typeof d.stripeFeeCents === 'number') ? d.stripeFeeCents : null,
            status: d.status || '',
            territoryDeclared: d.territoryDeclared || d.territoryFromAddress || null,
            recordedAtMs: d.recordedAt && d.recordedAt.toMillis ? d.recordedAt.toMillis() : null,
            linesDetail: Array.isArray(d.linesDetail) ? d.linesDetail : []
          });
        });
        const chSnap = await db.collection('charges').get();
        const charges = [];
        chSnap.forEach((doc) => {
          const d = doc.data() || {};
          charges.push({ id: doc.id, amountHt: Number(d.amountHt) || 0, tvaDeductible: Number(d.tvaDeductible) || 0, category: d.category || 'autre', label: d.label || '', dateMs: d.dateMs || null });
        });
        // Remboursements : 4e source du compte de résultat. Ils VIENNENT EN
        // MOINS du CA et de la TVA collectée — jamais en plus des charges.
        const rfSnap2 = await db.collection('refunds').get();
        const refunds = [];
        rfSnap2.forEach((doc) => {
          const d = doc.data() || {};
          refunds.push({
            id: doc.id,
            amountTtc: Number(d.amountTtc) || 0,
            cogsAnnuleHt: Number(d.cogsAnnuleHt) || 0,
            commissionRendue: Number(d.commissionRendue != null ? d.commissionRendue : d.stripeFeeRendu) || 0,
            territory: d.territory || null,
            avoirRef: d.avoirRef || '',
            label: d.label || '',
            dateMs: d.dateMs || null
          });
        });
        return res.status(200).json({
          ok: true,
          accounting: accounting.synthesize(payments, charges, cfg, refunds),
          charges: charges,
          refunds: refunds
        });
      }

      // ── Identité vendeur pour les factures ─────────────────────
      if (type === 'invoice-config') {
        const invoice = require('./_lib/invoice');
        const doc = await db.collection('config').doc('invoice').get();
        const seller = Object.assign({}, invoice.DEFAULT_SELLER, doc.exists ? doc.data() : {});
        return res.status(200).json({ ok: true, seller: seller });
      }

      // ── Liste des factures (paiements réussis) ─────────────────
      if (type === 'invoices') {
        const snap = await db.collection('payments').get();
        const list = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (d.status !== 'succeeded') return;
          list.push({
            id: doc.id, invoiceNumber: d.invoiceNumber || null,
            amountCents: d.amountCents || 0, customerEmail: d.customerEmail || '',
            customerName: d.customerName || '',
            recordedAtMs: d.recordedAt && d.recordedAt.toMillis ? d.recordedAt.toMillis() : (d.invoiceDateMs || null)
          });
        });
        list.sort((a, b) => (b.recordedAtMs || 0) - (a.recordedAtMs || 0));
        return res.status(200).json({ ok: true, invoices: list });
      }

      // ── Génère la facture (HTML imprimable) d'un paiement ──────
      if (type === 'invoice') {
        const invoice = require('./_lib/invoice');
        const id = (req.query && req.query.id) || '';
        if (!id) return res.status(400).json({ ok: false, error: 'id manquant' });
        const doc = await db.collection('payments').doc(String(id)).get();
        if (!doc.exists) return res.status(404).json({ ok: false, error: 'paiement introuvable' });
        const p = doc.data() || {};
        const cfgDoc = await db.collection('config').doc('invoice').get();
        const seller = Object.assign({}, invoice.DEFAULT_SELLER, cfgDoc.exists ? cfgDoc.data() : {});
        const payment = Object.assign({}, p, { recordedAtMs: p.recordedAt && p.recordedAt.toMillis ? p.recordedAt.toMillis() : (p.invoiceDateMs || null) });
        const built = invoice.buildInvoice(payment, seller);
        return res.status(200).json({ ok: true, html: invoice.renderHtml(built), number: built.number });
      }

      // ── Partenaires (annuaire artisans) : liste admin ──────────
      if (type === 'partners') {
        const snap = await db.collection('partners').orderBy('order').get()
          .catch(() => db.collection('partners').get());
        // Fusionne le marqueur invité (partners_private, serveur seul) pour
        // l'affichage ADMIN uniquement — jamais présent dans la collection
        // publique lue par les visiteurs.
        const privSnap = await db.collection('partners_private').get().catch(() => null);
        const priv = {};
        if (privSnap) privSnap.forEach((doc) => { priv[doc.id] = doc.data() || {}; });
        const partners = [];
        snap.forEach((doc) => {
          partners.push(Object.assign({
            id: doc.id,
            guest: !!(priv[doc.id] && priv[doc.id].guest),
            linkedEmail: (priv[doc.id] && priv[doc.id].linkedEmail) || ''
          }, doc.data()));
        });
        return res.status(200).json({ ok: true, partners });
      }

      // ── Codes d'invitation (Black offert) : liste admin ────────
      if (type === 'invite-codes') {
        const snap = await db.collection('invite_codes').get();
        const codes = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          codes.push({
            code: doc.id,
            active: d.active !== false,
            usedBy: d.usedBy || '',
            usedAt: d.usedAt && d.usedAt.toMillis ? d.usedAt.toMillis() : null,
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null
          });
        });
        codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return res.status(200).json({ ok: true, codes });
      }

      // ── Candidatures partenaires (pré-inscriptions Phase 3a) ────
      if (type === 'partner-applications') {
        // Tri par date desc si possible ; fallback sans tri (index auto).
        const snap = await db.collection('partner_applications').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('partner_applications').limit(200).get());
        const applications = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          applications.push({
            id: doc.id,
            name: d.name || '', metier: d.metier || '', commune: d.commune || '',
            email: d.email || '', phone: d.phone || '', tier: d.tier || '',
            sizes: d.sizes || {}, couleurs: d.couleurs || '',
            facebook: d.facebook || '', instagram: d.instagram || '',
            pubChoice: d.pubChoice || '', hasWebsite: !!d.hasWebsite,
            websiteUrl: d.websiteUrl || '', siteOption: d.siteOption || '',
            message: d.message || '', status: d.status || 'nouvelle',
            hasLogo: !!(d.logo && String(d.logo).length > 0),
            invited: d.invited === true, inviteCode: d.inviteCode || '',
            uid: d.uid || '',
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null
          });
        });
        return res.status(200).json({ ok: true, applications });
      }

      // ── Config coursier : prix du litre d'essence (réglementé, révisé chaque
      // mois) pour le barème livreurs. Lu/écrit UNIQUEMENT via l'admin. ──
      if (type === 'courier-config') {
        const doc = await db.collection('courier_config').doc('main').get().catch(() => null);
        const config = (doc && doc.exists) ? doc.data() : {};
        return res.status(200).json({ ok: true, config: { fuelPrice: config.fuelPrice || null } });
      }

      // ── Avis clients sur les livreurs (notes + commentaires des courses) ──
      if (type === 'course-ratings') {
        const snap = await db.collection('courses').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('courses').limit(200).get())
          .catch(() => null);
        const ratings = [];
        if (snap) snap.forEach((doc) => {
          const c = doc.data() || {};
          if (!c.rating) return;
          ratings.push({
            id: doc.id, rating: c.rating, comment: c.ratingComment || '',
            address: c.address || '', productTitle: c.productTitle || '', prix: c.prix || 0,
            zone: c.zone || 0, courierEmail: c.courierEmail || '', artisanEmail: c.artisanEmail || '',
            ratedAt: c.ratedAt && c.ratedAt.toMillis ? c.ratedAt.toMillis() : null
          });
        });
        return res.status(200).json({ ok: true, ratings });
      }

      // ── Toutes les courses (administration + ménage de la phase de test) ──
      if (type === 'courses') {
        const snap = await db.collection('courses').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('courses').limit(200).get())
          .catch(() => null);
        const courses = [];
        if (snap) snap.forEach((doc) => {
          const c = doc.data() || {};
          courses.push({
            id: doc.id,
            status: c.status || '',
            address: c.address || '',
            zone: c.zone || 0,
            prix: c.prix || 0,
            date: c.date || '',
            paid: !!c.paid,
            escrow: c.escrow || null,
            artisanEmail: c.artisanEmail || '',
            courierEmail: c.courierEmail || '',
            hasScene: !!c.hasScene,
            hasProof: !!c.proofPhoto || !!c.hasProof,
            videos: (c.videos || []).length,
            rating: c.rating || 0,
            createdAt: c.createdAt && c.createdAt.toMillis ? c.createdAt.toMillis() : null
          });
        });
        return res.status(200).json({ ok: true, courses });
      }

      // ── Litiges & vidéos de remise (admin SEUL — jamais de lecture client).
      // Vidéos servies en URL SIGNÉE temporaire (1 h) depuis Firebase Storage.
      // Engagement : privées, jamais divulguées, effacées à la clôture. ──
      if (type === 'course-disputes') {
        const snap = await db.collection('courses').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('courses').limit(200).get())
          .catch(() => null);
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'pirates-tools.firebasestorage.app';
        let bucket = null;
        try { bucket = admin.storage().bucket(bucketName); } catch (e) { console.warn('[admin] storage indisponible:', e.message); }
        const disputes = [];
        if (snap) {
          for (const doc of snap.docs) {
            const c = doc.data() || {};
            const hasVideos = (c.videos || []).length > 0;
            const hasDispute = !!(c.litige && (c.litige.open || c.litige.closedAt));
            if (!hasVideos && !hasDispute) continue;
            const videos = [];
            for (const v of (c.videos || [])) {
              let url = null;
              if (bucket) {
                try {
                  const [signed] = await bucket.file(v.path).getSignedUrl({ action: 'read', expires: Date.now() + 3600 * 1000 });
                  url = signed;
                } catch (e) { /* fichier absent / Storage non activé */ }
              }
              videos.push({ role: v.role, at: v.at && v.at.toMillis ? v.at.toMillis() : null, url });
            }
            disputes.push({
              id: doc.id, status: c.status, address: c.address || '', prix: c.prix || 0, zone: c.zone || 0,
              escrow: c.escrow || null, artisanEmail: c.artisanEmail || '', courierEmail: c.courierEmail || '',
              litige: c.litige ? {
                open: !!c.litige.open, role: c.litige.role || '', message: c.litige.message || '',
                at: c.litige.at && c.litige.at.toMillis ? c.litige.at.toMillis() : null
              } : null,
              videos
            });
          }
        }
        return res.status(200).json({ ok: true, disputes });
      }

      // ── Dossiers livreurs (service coursier — validation manuelle option B).
      // Vide tant que le service est inactif (aucune candidature écrite). ──
      if (type === 'courier-applications') {
        const snap = await db.collection('courier_applications').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('courier_applications').limit(200).get())
          .catch(() => null);
        const applications = [];
        if (snap) snap.forEach((doc) => {
          const d = doc.data() || {};
          applications.push({
            uid: doc.id,
            name: d.name || '', email: d.email || '', phone: d.phone || '',
            vehicle: d.vehicle || '', cylindree: d.cylindree || '',
            status: d.status || 'en_attente',
            pieces: d.pieces || {},
            // Dérogation aux pièces (comptes de test) : l'admin doit la voir.
            piecesBypass: !!d.piecesBypass,
            piecesManquantes: Array.isArray(d.piecesManquantes) ? d.piecesManquantes : [],
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null
          });
        });
        // Un dossier VALIDÉ n'est plus une candidature : c'est un livreur. On
        // joint sa fiche publique (photo, commune, véhicule, tarifs, courses,
        // note) pour que l'administration affiche sa CARTE et non un formulaire
        // de validation déjà traité.
        const valides = applications.filter((a) => a.status === 'valide');
        if (valides.length) {
          const fiches = await Promise.all(valides.map((a) =>
            db.collection('couriers_public').doc(a.uid).get()
              .then((s) => (s.exists ? s.data() : null)).catch(() => null)));
          valides.forEach((a, i) => {
            const f = fiches[i];
            a.profile = f ? {
              uid: a.uid,
              displayName: f.displayName || a.name || '',
              photo: f.photo || '', commune: f.commune || '',
              vehicle: f.vehicle || a.vehicle || '', bio: f.bio || '',
              tarifs: f.tarifs || null, available: !!f.available,
              published: !!f.published,
              coursesDone: f.coursesDone || 0,
              ratingCount: f.ratingCount || 0, ratingSum: f.ratingSum || 0
            } : null;   // null = validé mais fiche pas encore remplie
          });
        }
        return res.status(200).json({ ok: true, applications });
      }

      // ── Liste des remboursements saisis ────────────────────────
      // orderBy sur UN SEUL champ : aucun index composite requis (le piège que
      // l'émulateur ne signale jamais). Repli sans tri si le champ manque.
      if (type === 'refunds') {
        const rfSnap = await db.collection('refunds').orderBy('dateMs', 'desc').limit(500).get()
          .catch(() => db.collection('refunds').limit(500).get());
        const refunds = [];
        rfSnap.forEach((doc) => { refunds.push(Object.assign({ id: doc.id }, doc.data())); });
        return res.status(200).json({ ok: true, refunds: refunds });
      }

      // ── Liste des charges saisies ──────────────────────────────
      if (type === 'charges') {
        const chSnap = await db.collection('charges').orderBy('dateMs', 'desc').limit(500).get().catch(() => db.collection('charges').limit(500).get());
        const charges = [];
        chSnap.forEach((doc) => { charges.push(Object.assign({ id: doc.id }, doc.data())); });
        return res.status(200).json({ ok: true, charges: charges });
      }

      // ── Marges nettes LIVE : marge réelle au prix ACTUEL du site ────────
      // Branché sur le catalogue live (products.json + product_overrides) : donc
      // reflète les prix en temps réel, y compris après un scan du traqueur.
      if (type === 'margins') {
        const cfg = await priceConfig.load();
        const tvaFR = cfg.tvaFR || 0.20;
        const ovSnap = await db.collection('product_overrides').get();
        const ov = {};
        ovSnap.forEach((doc) => { ov[doc.id] = doc.data() || {}; });
        const catProducts = await catalog.loadCatalog();
        const variantCostsM = pwBuildVariantCosts(catProducts, ov);
        const rows = [];
        catProducts.forEach((p) => {
          const priceHt = Number(p.price_ht) || 0;
          if (!(priceHt > 0)) return;
          const o = ov[p.id] || {};
          // Même source de vérité que le recalcul de prix (pwSourceCost) :
          // traqueur > prix réel saisi en fiche > estimation dérivée.
          const ci = pwSourceCost(p, o, cfg, variantCostsM);
          const tracked = ci.origin && ci.origin !== 'estimé';
          const costTTC = (ci.srcTTC > 0) ? ci.srcTTC : (priceHt / PW.MARGIN) * (1 + tvaFR);
          const r = priceModel.marginAt(p, { priceHt: priceHt, costTTC: costTTC, mode: cfg.mode }, cfg);
          if (!r) return;
          const skuU = String(p.sku || '').toUpperCase();
          const isPack = p.variantRole === 'coffret'
            || String(p.category || '').toLowerCase().indexOf('combo') !== -1
            || /^DCK|^PPACK|P2T$|P3T$|D2K$/.test(skuU)
            || /set [ée]nergie|pack\b.*outil|multi-?outil/i.test(p.title || '');
          rows.push({
            id: p.id, sku: p.sku, brand: p.brand, title: p.title || p.name, category: p.category,
            weight: r.weight, shipKind: r.shipKind, ship: pwRound2(r.transport),
            // costTTC = TON prix d'achat fournisseur (TTC métropole). SENSIBLE :
            // ne sort QUE par cet endpoint admin (requireAdmin) — jamais par
            // /api/products (PRIVATE_FIELDS, gardé par check-catalog-public).
            costTTC: pwRound2(costTTC),
            priceHt: pwRound2(priceHt), ttc971: pwRound2(r.ttc), costSrc: ci.origin || 'estimé',
            netEur: pwRound2(r.netAfterIS), marginPct: Math.round(r.marginAfterIS * 1000) / 10, isPack: isPack
          });
        });
        rows.sort((a, b) => b.netEur - a.netEur);
        const totalNet = rows.reduce((s, r) => s + r.netEur, 0);
        const avg = rows.length ? rows.reduce((s, r) => s + r.marginPct, 0) / rows.length : 0;
        const packs = rows.filter((r) => r.isPack);
        return res.status(200).json({
          ok: true,
          config: { mode: cfg.mode, targetNet: cfg.targetNet, autoPrice: cfg.autoPrice !== false },
          summary: {
            count: rows.length, totalNet: pwRound2(totalNet), avgMarginPct: Math.round(avg * 10) / 10,
            packCount: packs.length, packNet: pwRound2(packs.reduce((s, r) => s + r.netEur, 0))
          },
          rows: rows
        });
      }

      // Default: list all overrides
      const snap = await db.collection('product_overrides').get();
      const overrides = {};
      snap.forEach((doc) => { overrides[doc.id] = doc.data(); });
      return res.status(200).json({ ok: true, overrides: overrides });
    } catch (err) {
      console.error('[api/admin] GET failed:', err.message);
      // Erreur d'index collectionGroup (FAILED_PRECONDITION) : au lieu d'un 500,
      // on renvoie une liste vide + le LIEN de création d'index que Firestore
      // fournit dans le message d'erreur (« ...requires an index. You can create
      // it here: https://console.firebase.google.com/... »). L'admin n'a qu'à
      // toucher le lien → l'index se crée en 1 tap (voie iPad sans CLI).
      if (String(err.message).indexOf('index') !== -1) {
        const m = String(err.message).match(/https:\/\/console\.firebase\.google\.com\/\S+/);
        const indexUrl = m ? m[0].replace(/[).,\s]+$/, '') : '';
        return res.status(200).json({ ok: true, orders: [], hint: 'Firestore index required — check console', indexUrl: indexUrl });
      }
      /* ⛔ PLUS JAMAIS « Failed to load » NU — panne du 02/08/2026 : ce texte
         générique a caché la vraie cause à l'user ET m'a fait diagnostiquer
         un faux problème réseau (je l'ai pris pour le message de Safari).
         On nomme le type demandé et le message réel de l'erreur — un message
         d'erreur Firestore/Node ne contient pas de secret, et 200 caractères
         suffisent à désigner la cause (quota, index, délai…). */
      return res.status(500).json({
        ok: false,
        error: 'GET admin (' + ((req.query && req.query.type) || 'overrides') + ') : '
          + String(err.message || err).slice(0, 200)
      });
    }
  }

  // ── POST ?type=price-watch : traqueur de prix fournisseur ──
  // Fusionné ici (et pas dans un endpoint dédié) pour rester sous le plafond
  // Vercel Hobby de 12 fonctions serverless.
  if (req.method === 'POST' && ((req.query && req.query.type) === 'price-watch')) {
    return handlePriceWatch(req, res, admin, db);
  }

  // ── POST ?type=pricing-config : sauver la config de tarification ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'pricing-config')) {
    try {
      const cfg = await priceConfig.save(req.body || {});
      return res.status(200).json({ ok: true, config: cfg });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

  // ── POST ?type=price-preview : aperçu du prix recommandé (calcul serveur) ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'price-preview')) {
    try {
      const body = req.body || {};
      const cfg = await priceConfig.load();
      const product = { weight_kg: Number(body.weight) || 2, ncCategory: body.ncCategory || 'power_tool', variantRole: body.variantRole || 'solo', title: body.title || '' };
      const opts = { mode: body.mode || cfg.mode };
      if (body.costHT != null) opts.costHT = Number(body.costHT);
      else opts.costTTC = Number(body.costTTC || 0);
      const r = priceModel.recommend(product, opts, cfg);
      return res.status(200).json({ ok: true, result: r });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

  // ── POST ?type=reprice-all : recalcule TOUS les prix depuis le modèle ──
  // Recompute intentionnel (bouton admin). Utilise le coût source connu de chaque
  // produit (override priceSrcTTC en priorité, sinon price_ht × VAT du produit).
  if (req.method === 'POST' && ((req.query && req.query.type) === 'reprice-all')) {
    return handleRepriceAll(req, res, admin, db);
  }

  // ── POST ?type=partner-save : carte artisan de l'annuaire (upsert) ──
  // Validation STRICTE par allowlist : la carte est affichée publiquement
  // (route #/artisans + strip accueil), rien d'arbitraire n'entre en base.
  // Photos/logo = dataURL compressées côté admin (≤ ~120 Ko chacune) ; le
  // nombre de photos est plafonné par le tier (annuaire dégressif).
  if (req.method === 'POST' && ((req.query && req.query.type) === 'partner-save')) {
    try {
      const b = req.body || {};
      const TIERS = ['basique', 'pro', 'gold', 'black'];
      const PHOTOS_MAX = { basique: 0, pro: 1, gold: 3, black: 6 };
      const DATAURL_MAX = 170000; // ~125 Ko base64 par image
      const tier = TIERS.indexOf(b.tier) !== -1 ? b.tier : 'basique';
      const name = String(b.name || '').trim().slice(0, 80);
      const metier = String(b.metier || '').trim().slice(0, 40);
      if (!name || !metier) return res.status(400).json({ ok: false, error: 'name et metier requis' });
      const isDataImg = (v) => typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= DATAURL_MAX;
      const link = String(b.link || '').trim().slice(0, 200);
      if (link && !/^https?:\/\//.test(link)) return res.status(400).json({ ok: false, error: 'link doit être http(s)' });
      const photos = Array.isArray(b.photos) ? b.photos.filter(isDataImg).slice(0, PHOTOS_MAX[tier]) : [];
      const doc = {
        name, metier, tier,
        commune: String(b.commune || '').trim().slice(0, 40),
        whatsapp: String(b.whatsapp || '').replace(/[^0-9+]/g, '').slice(0, 20),
        desc: String(b.desc || '').trim().slice(0, 240),
        link,
        logo: isDataImg(b.logo) ? b.logo : '',
        photos,
        active: b.active !== false,
        order: Number.isFinite(Number(b.order)) ? Number(b.order) : 999,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      const id = String(b.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)
        || (name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || ('p' + Math.abs(hashCodeStr(name + metier))));
      // Liaison compte client (self-service photos/logo) : l'admin saisit
      // l'EMAIL du compte → on résout l'uid via Firebase Auth (le compte doit
      // exister). L'uid vit dans partners_private (serveur seul) : c'est LA
      // preuve d'appartenance qu'exige l'endpoint self-service (contact.js).
      let linkedUid = '';
      const linkedEmail = String(b.linkedEmail || '').trim().slice(0, 200);
      if (linkedEmail) {
        try {
          const userRec = await admin.auth().getUserByEmail(linkedEmail);
          linkedUid = userRec.uid;
        } catch (err) {
          return res.status(400).json({ ok: false, error: 'Aucun compte Pirates Tools avec cet email — l\'artisan doit d\'abord créer son compte (Menu → Compte).' });
        }
      }
      await db.collection('partners').doc(id).set(doc, { merge: false });
      // Black INVITÉ (décision user 25/07) : 2 artisans choisis à la main +
      // la carte de test admin. Tous les avantages Black GRATUITS (ÉPI, site,
      // pub, entraide, remise 5 %) SAUF le bon de 38 €/mois (ils ne paient
      // pas). Le marqueur vit dans `partners_private` (SERVEUR SEUL, jamais
      // dans `partners` qui est PUBLIQUEMENT lisible — on n'expose pas qui
      // paie et qui ne paie pas). Sert aux compteurs (10 places PAYANTES,
      // Phase 3b) et au portefeuille (pas de bon, Phase 4).
      await db.collection('partners_private').doc(id).set({
        guest: b.guest === true,
        uid: linkedUid,
        linkedEmail: linkedUid ? linkedEmail : ''
      }, { merge: true });
      return res.status(200).json({ ok: true, id, partner: doc, guest: b.guest === true, linkedEmail: linkedUid ? linkedEmail : '' });
    } catch (err) {
      console.error('[api/admin] partner-save failed:', err.message);
      return res.status(500).json({ ok: false, error: 'partner-save échoué' });
    }
  }

  // ── POST ?type=invite-code-save : créer un code d'invitation ──
  // Code fourni (normalisé A-Z 0-9 tiret, 4-24) ou GÉNÉRÉ (PT-XXXXXX).
  // create() échoue si le code existe déjà → pas d'écrasement silencieux.
  if (req.method === 'POST' && ((req.query && req.query.type) === 'invite-code-save')) {
    try {
      let code = String((req.body || {}).code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
      if (!code) {
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans O/0/I/L/1 (lisible)
        code = 'PT-';
        for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      if (code.length < 4) return res.status(400).json({ ok: false, error: 'Code trop court (4 caractères minimum)' });
      await db.collection('invite_codes').doc(code).create({
        active: true, usedBy: '', usedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.status(200).json({ ok: true, code });
    } catch (err) {
      if (String(err.code) === '6' || /already.?exists/i.test(err.message)) {
        return res.status(409).json({ ok: false, error: 'Ce code existe déjà' });
      }
      console.error('[api/admin] invite-code-save failed:', err.message);
      return res.status(500).json({ ok: false, error: 'invite-code-save échoué' });
    }
  }

  // ── Sauvegarde config coursier (prix du litre) ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'courier-config')) {
    try {
      const v = Number((req.body || {}).fuelPrice);
      if (!(v > 0.5 && v < 5)) return res.status(400).json({ ok: false, error: 'fuelPrice invalide (0,5-5 €/L)' });
      await db.collection('courier_config').doc('main').set({
        fuelPrice: Math.round(v * 100) / 100, updatedAt: new Date()
      }, { merge: true });
      return res.status(200).json({ ok: true, fuelPrice: Math.round(v * 100) / 100 });
    } catch (err) {
      console.error('[api/admin] courier-config failed:', err.message);
      return res.status(500).json({ ok: false, error: 'courier-config échoué' });
    }
  }

  // ── Validation d'un dossier livreur (option B) : valide / refuse. ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'courier-review')) {
    try {
      const b = req.body || {};
      const uid = String(b.uid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
      const status = String(b.status || '');
      if (!uid) return res.status(400).json({ ok: false, error: 'uid requis' });
      if (status !== 'valide' && status !== 'refuse') return res.status(400).json({ ok: false, error: 'statut invalide' });
      await db.collection('courier_applications').doc(uid).set({
        status: status, reviewedAt: new Date()
      }, { merge: true });
      // ⚠️ C'EST CETTE ÉCRITURE QUI DONNE (OU RETIRE) L'ACCÈS LIVREUR.
      // couriers/{uid}.kycValide === 'valide' est la SEULE porte d'entrée
      // (contact.js). Elle portait un « .catch(() => {}) » : en cas d'échec,
      // l'administration répondait « ✅ ok », la candidature passait en
      // « valide »… et le compte n'avait toujours aucun accès. Panne vécue le
      // 27/07/2026 — « je valide et ça ne marche pas », sans le moindre
      // message. On ne masque plus rien.
      try {
        await db.collection('couriers').doc(uid).set({ kycStatus: status }, { merge: true });
      } catch (e) {
        console.error('[api/admin] courier-review kycStatus failed:', e.message);
        return res.status(500).json({
          ok: false,
          error: 'Le dossier est marqué « ' + status + ' », mais l\'accès livreur n\'a PAS pu être appliqué '
            + '(écriture couriers/' + uid + ' refusée). Réessaie ; si ça persiste, le compte de service '
            + 'Firebase est en cause.'
        });
      }
      // ET ON VÉRIFIE L'EFFET : on relit. Annoncer un succès sans l'avoir
      // constaté, c'est reproduire exactement la panne.
      const apres = await db.collection('couriers').doc(uid).get();
      const kycStatus = apres.exists ? (apres.data().kycStatus || '') : '';
      if (kycStatus !== status) {
        return res.status(500).json({
          ok: false,
          error: 'Le statut du dossier a été enregistré, mais l\'accès livreur n\'a PAS été appliqué '
            + '(couriers/' + uid + '.kycStatus = « ' + (kycStatus || 'absent') + ' »). Réessaie.'
        });
      }
      return res.status(200).json({ ok: true, uid, status, kycStatus, courierActif: kycStatus === 'valide' });
    } catch (err) {
      console.error('[api/admin] courier-review failed:', err.message);
      return res.status(500).json({ ok: false, error: 'courier-review échoué' });
    }
  }

  // Clôture d'un litige : les vidéos sont EFFACÉES de Storage (engagement :
  // privées, conservées le temps du litige seulement) et la trace du litige
  // passe en « clos » (qui/quand/décision restent dans le doc course).
  if (req.method === 'POST' && ((req.query && req.query.type) === 'course-dispute-close')) {
    try {
      const id = String((req.body || {}).id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      const decision = String((req.body || {}).decision || '').slice(0, 500);
      if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
      const ref = db.collection('courses').doc(id);
      const d = await ref.get();
      if (!d.exists) return res.status(404).json({ ok: false, error: 'course introuvable' });
      const c = d.data() || {};
      let videosDeleted = 0;
      try {
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'pirates-tools.firebasestorage.app';
        const bucket = admin.storage().bucket(bucketName);
        await bucket.deleteFiles({ prefix: 'courses/' + id + '/videos/' });
        videosDeleted = (c.videos || []).length;
      } catch (e) { console.warn('[admin] suppression vidéos:', e.message); }
      await ref.update({
        videos: [],
        litige: Object.assign({}, c.litige || {}, { open: false, closedAt: new Date(), decision: decision || '' })
      });
      return res.status(200).json({ ok: true, id, videosDeleted });
    } catch (err) {
      console.error('[api/admin] course-dispute-close failed:', err.message);
      return res.status(500).json({ ok: false, error: 'course-dispute-close échoué' });
    }
  }

  // Supprimer une course DÉFINITIVEMENT (ménage de la phase de test).
  // Emporte tout ce qui lui appartient : la sous-collection `photos` (scène,
  // colis remis, vue du chantier) et les vidéos dans Storage — sinon ces
  // documents et fichiers resteraient orphelins, invisibles et facturés.
  if (req.method === 'POST' && ((req.query && req.query.type) === 'course-delete')) {
    try {
      const id = String((req.body || {}).id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
      const ref = db.collection('courses').doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ ok: false, error: 'course introuvable' });
      const data = doc.data() || {};

      // 1. Sous-collection photos
      let photosDeleted = 0;
      const photos = await ref.collection('photos').get();
      for (const p of photos.docs) { await p.ref.delete(); photosDeleted++; }

      // 1 bis. Sous-collection messages (le fil de discussion). Supprimer le
      //    document parent NE supprime PAS ses sous-collections dans Firestore :
      //    sans ça, la conversation survivait indéfiniment, inaccessible mais
      //    stockée — inacceptable pour des échanges entre deux personnes.
      let messagesDeleted = 0;
      const msgs = await ref.collection('messages').get();
      for (const m of msgs.docs) { await m.ref.delete(); messagesDeleted++; }

      // 2. Vidéos Storage (best-effort : Storage peut ne pas être activé)
      let videosDeleted = 0;
      if ((data.videos || []).length) {
        try {
          const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'pirates-tools.firebasestorage.app';
          await admin.storage().bucket(bucketName).deleteFiles({ prefix: 'courses/' + id + '/videos/' });
          videosDeleted = data.videos.length;
        } catch (e) { console.warn('[admin] course-delete vidéos:', e.message); }
      }

      // 3. La course elle-même, en DERNIER : si une étape échoue avant, le doc
      //    reste et l'opération est rejouable — jamais d'orphelin silencieux.
      await ref.delete();
      return res.status(200).json({ ok: true, id, photosDeleted, messagesDeleted, videosDeleted });
    } catch (err) {
      console.error('[api/admin] course-delete failed:', err.message);
      return res.status(500).json({ ok: false, error: 'course-delete échoué : ' + err.message });
    }
  }

  if (req.method === 'POST' && ((req.query && req.query.type) === 'invite-code-delete')) {
    try {
      const code = String((req.body || {}).code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (!code) return res.status(400).json({ ok: false, error: 'code requis' });
      await db.collection('invite_codes').doc(code).delete();
      return res.status(200).json({ ok: true, code });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'invite-code-delete échoué' });
    }
  }

  if (req.method === 'POST' && ((req.query && req.query.type) === 'partner-delete')) {
    try {
      const id = String((req.body || {}).id || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
      await db.collection('partners').doc(id).delete();
      await db.collection('partners_private').doc(id).delete().catch(() => {});
      return res.status(200).json({ ok: true, id });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'partner-delete échoué' });
    }
  }

  // ── POST ?type=charge : enregistrer une charge réelle (compta) ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'charge')) {
    try {
      const b = req.body || {};
      const CATS = ['transport', 'octroi', 'cfe', 'assurance', 'achat', 'banque', 'autre'];
      const amountHt = Number(b.amountHt);
      if (!(amountHt > 0)) return res.status(400).json({ ok: false, error: 'Montant HT invalide' });
      const doc = {
        category: CATS.indexOf(b.category) !== -1 ? b.category : 'autre',
        label: String(b.label || '').slice(0, 120),
        amountHt: pwRound2(amountHt),
        tvaDeductible: Number(b.tvaDeductible) > 0 ? pwRound2(Number(b.tvaDeductible)) : 0,
        dateMs: Number(b.dateMs) || Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      const ref = await db.collection('charges').add(doc);
      return res.status(200).json({ ok: true, id: ref.id, charge: doc });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Enregistrement charge échoué' });
    }
  }

  /* ── POST ?type=refund : enregistrer un remboursement client ──────────────
     ⛔ CE N'EST PAS UNE CHARGE. Un remboursement annule une vente : il diminue
     le CA et la TVA COLLECTÉE. Saisi dans `charges`, il gonflerait la TVA
     DÉDUCTIBLE — on réclamerait au fisc une taxe jamais versée. Les deux
     collections restent séparées pour que la confusion soit impossible
     (démonstration chiffrée dans _lib/accounting.js et check-accounting.js).

     Le site ne rembourse RIEN tout seul : l'user rembourse depuis l'ancien fournisseur, puis
     saisit ici ce qu'il a réellement constaté. Aucun champ n'est deviné. */
  if (req.method === 'POST' && ((req.query && req.query.type) === 'refund')) {
    try {
      const b = req.body || {};
      const amountTtc = Number(b.amountTtc);
      if (!(amountTtc > 0)) return res.status(400).json({ ok: false, error: 'Montant TTC remboursé invalide' });
      // Le territoire fixe le taux de TVA à annuler : il doit exister au
      // barème, sinon on retomberait silencieusement sur un taux inventé.
      const terr = pricing.getTerritory(String(b.territory || '')) ? String(b.territory) : '971';
      const doc = {
        amountTtc: pwRound2(amountTtc),
        // Coût d'achat annulé : 0 si l'outil a DÉJÀ été commandé au
        // fournisseur — il part en stock, la dépense reste bien réelle.
        cogsAnnuleHt: Number(b.cogsAnnuleHt) > 0 ? pwRound2(Number(b.cogsAnnuleHt)) : 0,
        // Commission du fournisseur réellement restituée, LUE sur le tableau de bord.
        // 0 par défaut = l'hypothèse la plus défavorable ; on ne suppose rien.
        commissionRendue: Number(b.commissionRendue != null ? b.commissionRendue : b.stripeFeeRendu) > 0 ? pwRound2(Number(b.commissionRendue != null ? b.commissionRendue : b.stripeFeeRendu)) : 0,
        territory: terr,
        // Référence de l'AVOIR (facture rectificative). Sans elle, la TVA
        // collectée reste due : la synthèse refuse de la retrancher.
        avoirRef: String(b.avoirRef || '').slice(0, 60),
        // Lien vers la vente : un identifiant fournisseur/commande, PAS un nom de
        // client. Minimisation RGPD (J3) — ce document n'a aucun besoin
        // d'identifier une personne pour faire de la comptabilité juste.
        paymentId: String(b.paymentId || '').slice(0, 120),
        label: String(b.label || '').slice(0, 160),
        dateMs: Number(b.dateMs) || Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      const ref = await db.collection('refunds').add(doc);
      return res.status(200).json({ ok: true, id: ref.id, refund: doc });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Enregistrement remboursement échoué' });
    }
  }

  // ── DELETE ?type=refund&id=… : retirer un remboursement mal saisi ──
  if (req.method === 'DELETE' && ((req.query && req.query.type) === 'refund')) {
    try {
      const id = (req.query && req.query.id) || (req.body && req.body.id) || '';
      if (!id) return res.status(400).json({ ok: false, error: 'id manquant' });
      await db.collection('refunds').doc(String(id)).delete();
      return res.status(200).json({ ok: true, id: String(id) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Suppression échouée' });
    }
  }

  // ── POST ?type=invoice-config : identité vendeur (factures) ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'invoice-config')) {
    try {
      const b = req.body || {};
      const FIELDS = ['raisonSociale', 'formeJuridique', 'capital', 'adresse', 'siret', 'rcs', 'tvaIntra', 'email', 'tel', 'mediateur'];
      const patch = {};
      FIELDS.forEach((k) => { if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 200); });
      if (b.franchise !== undefined) patch.franchise = !!b.franchise;
      if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: 'Aucun champ' });
      await db.collection('config').doc('invoice').set(patch, { merge: true });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Sauvegarde échouée' });
    }
  }

  // ── DELETE ?type=charge&id=… : supprimer une charge ──
  if (req.method === 'DELETE' && ((req.query && req.query.type) === 'charge')) {
    try {
      const id = (req.query && req.query.id) || (req.body && req.body.id) || '';
      if (!id) return res.status(400).json({ ok: false, error: 'id manquant' });
      await db.collection('charges').doc(String(id)).delete();
      return res.status(200).json({ ok: true, id: String(id) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Suppression échouée' });
    }
  }

  // ── POST : update or create an override ───────────────────
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const productId = String(body.id || '').trim();
      if (!productId) {
        return res.status(400).json({ ok: false, error: 'Missing product id' });
      }

      // Allowed fields — block arbitrary writes
      const allowed = [
        'stock_status', 'stock_label',
        'price', 'price_ht', 'vat', 'currency',
        'title', 'desc', 'description',
        'tag', 'paymentLink',
        'hidden'
      ];
      const patch = {};
      allowed.forEach((k) => {
        if (body[k] !== undefined) patch[k] = body[k];
      });

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: 'No valid fields to update' });
      }

      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('product_overrides').doc(productId).set(patch, { merge: true });

      console.log('[api/admin] Updated override for', productId, Object.keys(patch).join(','));
      return res.status(200).json({ ok: true, id: productId, patch: patch });
    } catch (err) {
      console.error('[api/admin] POST failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Update failed' });
    }
  }

  // ── DELETE : remove an override ───────────────────────────
  if (req.method === 'DELETE') {
    try {
      const id = (req.query && req.query.id) || (req.body && req.body.id) || '';
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });
      await db.collection('product_overrides').doc(String(id)).delete();
      return res.status(200).json({ ok: true, id: String(id) });
    } catch (err) {
      console.error('[api/admin] DELETE failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Delete failed' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};

// ── Traqueur de prix fournisseur (cotébrico) ────────────────────────────────
// Le raccourci iPad récupère le TEXTE/HTML d'une page marque cotébrico DEPUIS
// L'IP DE L'USER (le serveur est bloqué en 403) et le POST ici. On extrait
// réf + prix HORS PROMO, et on met à jour les prix (product_overrides) — avec
// GARDE-FOUS pour que l'auto-application soit sûre. dryRun=true → aucun écrit.
// MAX_TTC volontairement TRÈS haut (packs multi-outils = chers) : la réf exacte
// identifie le bon produit et son bloc ne contient que son prix → on fait confiance.
//
// ⛔ MAX_MOVE (plafond de variation 25 %) RETIRÉ le 31/07/2026 — décision D-015.
// Il jugeait un ÉCART, pas une valeur. Or le traqueur lit ce que la page du
// fournisseur affiche : une hausse de 29 % n'est pas une anomalie de lecture,
// c'est le tarif que l'user paiera. Le verrou a maintenu DVC560Z à un prix qui
// perdait 8,31 € par vente, parce que la réparation dépassait le seuil.
//
// Il ne reste donc que des bornes ABSOLUES : MIN_TTC / MAX_TTC. Elles ne jugent
// pas une variation mais une valeur impossible — c'est le seul filet qui
// attrape un parseur qui déraille, et il ne peut pas bloquer un prix réel.
const PW = { MARGIN: 1.15, VAT: 1.20, MIN_TTC: 5, MAX_TTC: 8000 };
function pwRound2(n) { return Math.round(n * 100) / 100; }

// Prix à partir du coût source TTC (src) : MODÈLE de marge cible si cfg.autoPrice,
// sinon repli historique ×1,15. Retourne { newPrice (TTC métropole), newHt, markup, mode }.
// GARDE-FOU COFFRET (décision user 26/07/2026) : chez le fournisseur, la même
// machine en coffret MAKPAC/TSTAK coûte ~20 € TTC de plus que la version nue.
// Quand le traqueur ne connaît qu'UNE des deux variantes, on dérive l'autre
// avec cet écart au lieu de partir d'une estimation en l'air — c'est ce qui
// évitait au calculateur de « se perdre » (ex. DJV185ZJ était estimé à
// 240,79 € alors que la version nue coûte 149,90 € → coût réel ~169,90 €).
var COFFRET_COST_DELTA = 20;

// Index des coûts RÉELS connus (traqueur ou fiche), par groupe de variante.
// { [variantGroup]: { solo: srcTTC, coffret: srcTTC } }
function pwBuildVariantCosts(products, ov) {
  var byGroup = {};
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    if (!p.variantGroup || (p.variantRole !== 'solo' && p.variantRole !== 'coffret')) continue;
    var o = (ov && ov[p.id]) || {};
    // Même exigence que pwSourceCost : seul un coût RELEVÉ (traqueur) ou saisi
    // en fiche sert de base à la dérivation ± 20 € — jamais une estimation.
    var ovHasCost = (typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0);
    var real = (o.priceSource === 'cotebrico' && ovHasCost)
      ? o.priceSrcTTC
      : ((!ovHasCost && typeof p.priceSrcTTC === 'number' && p.priceSrcTTC > 0) ? p.priceSrcTTC : null);
    if (!(real > 0)) continue;
    if (!byGroup[p.variantGroup]) byGroup[p.variantGroup] = {};
    byGroup[p.variantGroup][p.variantRole] = real;
  }
  return byGroup;
}

// Coût d'achat source (TTC métropole) d'un produit, par ordre de fiabilité :
//  1. override.priceSrcTTC  → relevé RÉEL du traqueur (scan cotébrico) ;
//  2. produit.priceSrcTTC   → prix fournisseur RÉEL saisi dans products.json
//     (produits que le traqueur ne voit pas : variantes « machine seule »…) ;
//  3. variante jumelle      → coût RÉEL de l'autre variante ± 20 € (coffret) ;
//  4. dérivé de price_ht    → ESTIMATION (le prix catalogue est supposé être
//     l'ancien coût ×1,15). À remplacer par un vrai prix dès que possible.
// Retourne { srcTTC, origin } — origin est affiché dans l'aperçu admin.
/* ── CARTE + HÉRITAGE : toutes les sources RÉELLEMENT connues d'un override ──
   Les relevés d'avant le 01/08/2026 vivent dans l'ancien format
   (`priceSrcTTC` / `priceSource` / `priceCheckedAt`), SANS carte
   `priceSources`. Sans cette fusion, le premier passage d'un NOUVEAU site ne
   voyait que lui-même et « le moins cher des sources » proposait des
   hausses : mesuré au premier `dryRun=1` clickoutil — 12 hausses proposées,
   dont +136 % sur un produit dont le relevé cotébrico était moins cher.
   ⛔ Seul `cotebrico` se ressème, et seulement s'il porte sa marque : un
   coût ESTIMÉ n'a jamais porté `priceSource: 'cotebrico'` (même garde que
   le chemin de lecture d'en dessous). La fraîcheur (14 j) reste jugée par
   `choisirCoutSource` — un héritage périmé ne pèse rien.
   PURE — testée par check-price-watch via _internals, sabotage compris. */
function pwSourcesConnues(o) {
  const srcs = Object.assign({}, o && o.priceSources);
  /* `priceCheckedAt` relu de Firestore est un objet Timestamp, pas un nombre :
     `enMillis` le ramène en millisecondes réelles (Number() donnait des
     secondes d'une autre ère — 63 889 596 800 — et l'héritage paraissait
     toujours périmé face à Date.now()). */
  var atHeritage = priceParse.enMillis(o && o.priceCheckedAt);
  if (o && o.priceSource === 'cotebrico' && !srcs.cotebrico
      && typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0
      && atHeritage > 0) {
    srcs.cotebrico = { ttc: o.priceSrcTTC, at: atHeritage };
  }
  return srcs;
}

/* ── SUIVI PAR NOM (02/08/2026, règle posée par l'user) ────────────────────
   « Ce qui est important, c'est les références exactes et comment sont
   NOMMÉS les produits s'il n'y a pas de référence. » Un accessoire sans réf
   (lame, mèche, fraise…) se suit par son NOM EXACT : la fiche porte
   `srcNom` — le titre tel que le site fournisseur l'écrit — et chaque
   entrée sansRef du relevé qui correspond devient un relevé normal.
   ⛔ Deux gardes, toutes deux mesurées sur la vraie page :
     · un nom vu PLUSIEURS fois sur la page (« Lame de scie circulaire Elite
       Bois Ø184 mm » ×3) n'identifie RIEN → jamais apparié ;
     · un `srcNom` revendiqué par DEUX fiches → conflit → jamais apparié.
   PURE — testée par check-price-watch via _internals, sabotage compris. */
function pwApparierParNom(sansRef, products) {
  const norme = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const parNom = {};
  products.forEach((p) => {
    const n = norme(p && p.srcNom);
    if (!n) return;
    parNom[n] = Object.prototype.hasOwnProperty.call(parNom, n) ? false : p;
  });
  const vusPage = {};
  (sansRef || []).forEach((e) => { const n = norme(e && e.titre); if (n) vusPage[n] = (vusPage[n] || 0) + 1; });
  const items = [], restants = [];
  (sansRef || []).forEach((e) => {
    const n = norme(e && e.titre);
    const p = (n && vusPage[n] === 1) ? parNom[n] : null;
    if (p && Number(e.prix) > 0) {
      items.push({ sku: p.sku, price: Number(e.prix), name: String(e.titre), promo: false, enStock: null });
    } else restants.push(e);
  });
  return { items, restants };
}

/* ── NOMENCLATURE DeWALT (02/08/2026, règle posée par l'user — vérifiée par
   lui « sur tous les sites, même chez le fournisseur officiel ») ──────────
     · réf COURTE (DCD805) = LA MACHINE NUE : « N » = nu, « -XJ » =
       commercialisation européenne → DCD805 ≡ DCD805N ≡ DCD805N-XJ ;
     · « NT » = machine nue AVEC COFFRET TSTAK : un AUTRE contenu — une réf
       courte ne pointe JAMAIS vers un NT (l'envoi favorisé est sans
       coffret, le coffret garde son surplus via le modèle de variantes) ;
     · AMBIGUÏTÉ (deux fiches nues revendiquent la même base) → AUCUN
       rapprochement : écrire un coût sur la mauvaise fiche coûte plus cher
       que ne rien écrire.
   Portée : les fiches DeWALT, quand la marque DEMANDÉE est DEWALT — la
   nomenclature Makita (Z, ZJ…) n'a pas été tranchée par l'user.
   Mutations : ajoute des clés d'alias à `bySku`, sans JAMAIS écraser une
   entrée existante (sku principal et srcAltSkus priment).
   Testée par check-price-watch via _internals, sabotage compris. */
function pwAliasNomenclature(products, brand, bySku) {
  if (String(brand || '').toUpperCase() !== 'DEWALT') return;
  const claims = {};
  products.forEach((p) => {
    if (String(p.brand || '').toUpperCase() !== 'DEWALT' || !p.sku) return;
    const sku = String(p.sku).toUpperCase();
    const aliases = [];
    if (/-XJ$/.test(sku)) aliases.push(sku.slice(0, -3));        // RN-XJ → RN (géo)
    const m = sku.match(/^([A-Z0-9\/.-]*\d)N(?:-XJ)?$/);         // fiche NUE seulement
    if (m) { aliases.push(m[1]); aliases.push(m[1] + '-XJ'); }   // base et base-XJ
    aliases.forEach((a) => {
      if (!a || bySku[a]) return;                                // jamais écraser
      claims[a] = (Object.prototype.hasOwnProperty.call(claims, a) && claims[a] !== p) ? false : p;
    });
  });
  Object.keys(claims).forEach((a) => { if (claims[a] && !bySku[a]) bySku[a] = claims[a]; });
}

function pwSourceCost(p, o, cfg, byGroup) {
  /* ── PLUSIEURS TRAQUEURS (01/08/2026) : la carte `priceSources` fait foi ──
     Chaque passage de traqueur écrit sa propre entrée { ttc, at, enStock }.
     Le coût effectif est le MOINS CHER des sources ACHETABLES : fraîches
     (moins de 14 jours) ET pas en rupture. S'il existe des relevés mais
     qu'AUCUN n'est achetable, on rend `origin: 'rupture'` : le produit est
     GELÉ — demandé par l'user après que dix produits en rupture chez le
     fournisseur allaient faire MONTER les prix du site. Un prix affiché là
     où l'on ne peut pas acheter n'est pas un coût d'approvisionnement. */
  if (o && o.priceSources && typeof o.priceSources === 'object'
      && Object.keys(o.priceSources).length) {
    /* L'HÉRITAGE cotébrico entre dans le min (pwSourcesConnues) : sans lui,
       une carte née d'un seul passage clickoutil ignorait un relevé
       cotébrico moins cher encore au format d'avant. ⚠️ La fusion ne
       s'applique QUE si la carte existe — un override sans carte garde le
       chemin d'héritage pur d'en dessous, qui ne juge pas la fraîcheur :
       en juger ici aurait GELÉ des produits au relevé ancien mais réel. */
    var choixPS = priceParse.choisirCoutSource(pwSourcesConnues(o), Date.now());
    if (choixPS) return { srcTTC: choixPS.ttc, origin: 'traqueur', source: choixPS.source };
    return { srcTTC: null, origin: 'rupture' };
  }
  // ⚠️ Un coût n'est « relevé » que s'il porte priceSource='cotebrico', la
  // marque du traqueur. Sans ce contrôle, un coût ESTIMÉ écrit par un ancien
  // « Appliquer » se faisait passer pour un relevé réel : la supposition
  // devenait définitive et neutralisait le garde-fou coffret.
  if (o && o.priceSource === 'cotebrico' && typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0) {
    return { srcTTC: o.priceSrcTTC, origin: 'traqueur' };
  }
  // ⚠️ `p` est le produit FUSIONNÉ : si l'override porte un priceSrcTTC, alors
  // p.priceSrcTTC EST cette valeur, pas le prix saisi dans products.json. On ne
  // lit donc la fiche que si l'override est muet — sinon un coût blanchi se
  // ferait passer pour un « prix fournisseur saisi ».
  var overrideHasCost = !!(o && typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0);
  if (!overrideHasCost && p && typeof p.priceSrcTTC === 'number' && p.priceSrcTTC > 0) {
    return { srcTTC: p.priceSrcTTC, origin: 'fiche' };
  }
  // Garde-fou coffret : dériver de la variante jumelle au coût RÉEL connu.
  if (byGroup && p && p.variantGroup && byGroup[p.variantGroup]) {
    var g = byGroup[p.variantGroup];
    if (p.variantRole === 'coffret' && g.solo > 0) {
      return { srcTTC: pwRound2(g.solo + COFFRET_COST_DELTA), origin: 'variante' };
    }
    if (p.variantRole === 'solo' && g.coffret > 0) {
      // Jamais en dessous de zéro (garde-fou sur les très petits prix).
      return { srcTTC: pwRound2(Math.max(0.01, g.coffret - COFFRET_COST_DELTA)), origin: 'variante' };
    }
  }
  if (p && typeof p.price_ht === 'number' && p.price_ht > 0) {
    return { srcTTC: pwRound2((p.price_ht / PW.MARGIN) * (1 + ((cfg && cfg.tvaFR) || 0.20))), origin: 'estimé' };
  }
  return { srcTTC: null, origin: null };
}

function pwComputePrice(product, srcTTC, cfg) {
  // Verrou de sécurité : le MODÈLE de marge cible (15 % net) s'applique par
  // défaut. On ne retombe au ×1,15 QUE si autoPrice est EXPLICITEMENT désactivé
  // (autoPrice === false). Ainsi un scan traqueur ne peut jamais casser les
  // marges à cause d'une config partielle où autoPrice serait absent.
  if (!cfg || cfg.autoPrice !== false) {
    const r = priceModel.recommend(product, { costTTC: srcTTC, mode: (cfg && cfg.mode) || 'colissimo' }, cfg);
    if (r && r.priceHt > 0) {
      return { newHt: r.priceHt, newPrice: pwRound2(r.priceHt * (1 + (cfg.tvaFR || 0.20))), markup: r.markup, mode: r.mode };
    }
  }
  const newPrice = pwRound2(srcTTC * PW.MARGIN);
  return { newPrice, newHt: pwRound2(newPrice / PW.VAT), markup: 0.15, mode: 'legacy' };
}

// Recalcule TOUS les prix depuis le modèle (bouton admin, recompute intentionnel).
// Coût source = override.priceSrcTTC en priorité, sinon dérivé de price_ht × VAT.
// Garde-fous de fourchette (MIN/MAX) mais PAS de plafond de variation (le grand
// saut lors du 1er passage au modèle est voulu). dryRun renvoie l'aperçu sans écrire.
async function handleRepriceAll(req, res, admin, db) {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const dryRun = body.dryRun === true || (req.query && (req.query.dryRun === '1' || req.query.dryRun === 'true'));
    const cfg = await priceConfig.load();
    /* ⛔ CONFIG ILLISIBLE = AUCUN PRIX ÉCRIT — même garde que le traqueur :
       recalculer tout le catalogue avec les réglages PAR DÉFAUT au lieu des
       siens serait une écriture non voulue (crainte de l'user, 02/08/2026,
       au lendemain du quota Firestore épuisé). */
    if (cfg._sourceIllisible && !dryRun) {
      return res.status(503).json({ ok: false, error: 'config de prix illisible (Firestore indisponible) — aucun prix écrit, réessayer plus tard' });
    }

    // Overrides existants (pour le coût source connu).
    const ovSnap = await db.collection('product_overrides').get();
    const ov = {};
    ovSnap.forEach((d) => { ov[d.id] = d.data() || {}; });

    const products = await catalog.loadCatalog();
    // Garde-fou coffret : coûts RÉELS connus par groupe de variante, pour
    // dériver la variante manquante (± 20 €) au lieu de l'estimer.
    const variantCosts = pwBuildVariantCosts(products, ov);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const changed = [], skipped = [];
    // Santé des coûts d'achat : sur quoi reposent RÉELLEMENT les prix du site.
    // Affiché même quand rien ne change — « 0 à changer » ne veut rien dire si
    // les prix sont bâtis sur des estimations.
    const origins = { traqueur: 0, fiche: 0, variante: 0, 'estimé': 0, rupture: 0 };
    const estimes = [];
    /* Produits GELÉS : des relevés existent mais aucun n'est achetable
       (rupture partout, ou relevés périmés). On ne recalcule PAS leur prix —
       et on le DIT, au lieu de les fondre dans « coût inconnu ». */
    const gels = [];
    let lockedCount = 0;   // produits à prix verrouillé (jamais recalculés)

    for (const p of products) {
      // 🔒 PRIX VERROUILLÉ : décision commerciale de l'owner, le calculateur
      // n'y touche JAMAIS (produit dont le coût fournisseur n'est pas relevable
      // — prix constaté variable selon les revendeurs). Sorti du décompte des
      // « estimés » : ce n'est pas une lacune à combler, c'est un choix.
      if (p.priceLocked === true) { lockedCount++; continue; }

      const o = ov[p.id] || {};
      // Coût source TTC : traqueur > fiche > variante jumelle ±20 € > estimation.
      const srcInfo = pwSourceCost(p, o, cfg, variantCosts);
      const srcTTC = srcInfo.srcTTC;
      if (srcInfo.origin === 'rupture') {
        origins.rupture++;
        if (gels.length < 250) gels.push({ sku: p.sku, brand: p.brand || '', name: p.title || p.name });
        continue;   // prix GELÉ : aucune source achetable, on n'y touche pas
      }
      if (!(srcTTC > 0)) { skipped.push({ id: p.id, sku: p.sku, reason: 'coût source inconnu' }); continue; }
      if (srcTTC < PW.MIN_TTC || srcTTC > PW.MAX_TTC) { skipped.push({ id: p.id, sku: p.sku, reason: 'hors fourchette' }); continue; }
      if (origins[srcInfo.origin] !== undefined) origins[srcInfo.origin]++;
      // Liste EXHAUSTIVE des produits sans coût réel : c'est la réponse à
      // « quels produits n'apparaissent pas dans le traqueur ? ». Plafond haut
      // (250) pour ne jamais tronquer silencieusement le catalogue réel.
      if (srcInfo.origin === 'estimé' && estimes.length < 250) {
        estimes.push({ sku: p.sku, brand: p.brand || '', name: p.title || p.name, srcTTC: srcTTC });
      }

      const priced = pwComputePrice(p, srcTTC, cfg);
      // Prix ACTUEL : l'override fraîchement relu fait foi. `p` vient du
      // catalogue fusionné, dont le cache d'overrides peut avoir jusqu'à 30 s
      // de retard : juste après un « Appliquer », il renvoyait encore l'ancien
      // prix → les mêmes produits étaient re-signalés comme « à changer »
      // alors qu'ils venaient d'être corrigés (fausse impression de bug).
      const cur = (typeof o.price === 'number') ? o.price
        : (typeof p.price === 'number' ? p.price : null);
      if (cur != null && Math.abs(priced.newPrice - cur) < 0.02) continue; // déjà bon
      const rec = { id: p.id, sku: p.sku, name: p.title || p.name, oldPrice: cur, newPrice: priced.newPrice, newHt: priced.newHt, markup: priced.markup, srcTTC,
        costSrc: srcInfo.origin };
      if (!dryRun) {
        // ⚠️ N'ÉCRIT PLUS priceSrcTTC. Le coût d'achat n'appartient qu'à ses
        // sources RÉELLES : le traqueur (scan cotébrico) ou la fiche produit.
        // L'écrire ici « blanchissait » une estimation en coût réel, la figeait
        // définitivement et empêchait toute correction ultérieure (garde-fou
        // coffret, nouveau relevé). Le coût est désormais re-résolu à chaque
        // passage ; on ne mémorise que son ORIGINE, pour la transparence.
        await db.collection('product_overrides').doc(p.id).set({
          price: priced.newPrice, price_ht: priced.newHt,
          priceMarkup: priced.markup, priceMode: priced.mode,
          priceCostOrigin: srcInfo.origin, priceRecomputedAt: now
        }, { merge: true });
      }
      changed.push(rec);
    }

    // Écritures faites : purge le cache pour que le prochain contrôle (et le
    // site public) reparte des prix réels, sans attendre l'expiration.
    if (!dryRun && changed.length) catalog.invalidateOverrides();

    return res.status(200).json({
      ok: true, dryRun: !!dryRun, mode: cfg.mode, autoPrice: !!cfg.autoPrice,
      counts: { total: products.length, changed: changed.length, skipped: skipped.length, locked: lockedCount },
      origins: origins, estimes: estimes, gels: gels,
      changed: changed.slice(0, 500), skipped: skipped.slice(0, 100)
    });
  } catch (err) {
    console.error('[api/admin] reprice-all failed:', err.message);
    return res.status(500).json({ ok: false, error: 'reprice-all failed' });
  }
}

function hashCodeStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return h;
}

/* ── CACHE DE BALAYAGE (&scan=1) — 02/08/2026, demande de l'user ────────────
   La liste idealo DeWALT fait 67 PAGES (tri maxPrice décroissant), balayées
   par UN SEUL raccourci en rafale. Sans cache, CHAQUE page relisait la
   collection `product_overrides` entière DEUX fois (catalogue fusionné +
   relecture « à la source ») : ≈ 160 000 lectures Firestore par balayage —
   plus de trois fois le quota GRATUIT quotidien, celui-là même qui s'est
   épuisé le 01/08 et a fermé l'admin (E-111).
   En mode balayage : la PREMIÈRE page lit tout, les suivantes réutilisent le
   relevé en mémoire, et CHAQUE écriture est répercutée dedans (pwMajLocale) —
   sans cette répercussion, `dejaAJour` mentirait et chaque doublon
   inter-pages réécrirait le même prix.
   ⚠️ Uniquement sur `&scan=1` : un relevé isolé garde la relecture pleine.
   La relecture « à la source » protégeait la garde « variation > 25 % » —
   retirée depuis (D-015) : rien dans le chemin d'écriture n'exige plus une
   fraîcheur sous 30 s. Limite assumée : pendant un balayage, une modification
   admin faite à la main peut rester invisible jusqu'à 20 min → on ne modifie
   pas les prix à la main pendant qu'un balayage tourne. */
let pwScanCache = null;
const PW_SCAN_TTL = 20 * 60 * 1000;
function pwScanReset() { pwScanCache = null; }

/* Répercute une écriture Firestore dans le relevé local du balayage : même
   sémantique que `set(..., { merge: true })` — fusion par clé, et fusion par
   sous-clé pour la carte `priceSources`. `priceCheckedAt` local devient un
   NOMBRE (nowMs) : le sentinel serverTimestamp vaut NaN en arithmétique
   (E-228) et rendrait le relevé invisible à la page suivante. */
function pwMajLocale(ovW, id, patch, nowMs) {
  const avant = ovW[id] || {};
  const apres = Object.assign({}, avant, patch, { priceCheckedAt: nowMs });
  if (patch && patch.priceSources) {
    apres.priceSources = Object.assign({}, avant.priceSources, patch.priceSources);
  }
  // `promoDepuis` s'écrit en Firestore comme sentinel serverTimestamp :
  // localement il devient le même instant, en nombre.
  if (patch && patch.promoDepuis) apres.promoDepuis = nowMs;
  ovW[id] = apres;
}

async function handlePriceWatch(req, res, admin, db) {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    let text = (typeof req.body === 'string') ? req.body : (body.text || '');
    const brand = String(body.brand || (req.query && req.query.brand) || 'DEWALT').toUpperCase();
    const dryRun = body.dryRun === true || (req.query && (req.query.dryRun === '1' || req.query.dryRun === 'true'));
    const scanMode = body.scan === true || (req.query && (req.query.scan === '1' || req.query.scan === 'true'));
    /* ── IDENTITÉ DE LA SOURCE (01/08/2026) ─────────────────────────────────
       Un deuxième site va être traqué, puis d'autres : chaque raccourci passe
       `&source=<slug>`. Sans le paramètre : 'cotebrico' — aucun raccourci
       existant ne change. ⛔ Le slug devient une CLÉ Firestore : alphabet
       fermé, longueur bornée — rien d'arbitraire n'entre en base.
       ⚠️ Calculé AVANT TOUT RETOUR, erreurs comprises : le premier essai
       clickoutil a rendu un JSON muet sur la source qui tournait —
       indiagnosticable. */
    const sourceSlug = (String((req.query && req.query.source) || 'cotebrico')
      .toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)) || 'cotebrico';

    /* ⛔ UN REFUS MUET EST UN MUR (02/08/2026) ──────────────────────────────
       « text manquant ou trop court » n'a longtemps rien dit d'autre. Sur le
       raccourci de balayage 67 pages, ce mur s'est levé à chaque tour sans une
       seule information exploitable : impossible de distinguer « la variable
       du corps JSON pointe vers la mauvaise action » (on reçoit alors « 15 »,
       ou une réponse d'API) de « la page fournisseur n'a rien renvoyé »
       (rafale coupée, URL construite invalide). C'est le MÊME défaut que le
       `parsed: 0` muet du 01/08, et le même remède : le serveur TIENT le
       corps, il le MESURE au lieu de le jeter.
       ⚠️ On ne reflète que ce qui vient du corps de SA propre requête, plafonné
       à 200 caractères — une page fournisseur publique, ou son propre relevé.
       ⛔ Aucun en-tête n'est reflété : la clé du traqueur y vit, et un extrait
       de secret reste un secret. */
    if (!text || text.length < 200) {
      const recu = String(text || '');
      return res.status(400).json({
        ok: false, error: 'text manquant ou trop court', source: sourceSlug,
        diagnostic: {
          caracteresRecus: recu.length,
          typeDuCorps: typeof req.body,
          clesDuCorps: (req.body && typeof req.body === 'object') ? Object.keys(req.body).slice(0, 12) : [],
          debutRecu: recu.slice(0, 200),
          lecture: !recu.length
            ? 'champ `text` VIDE ou absent — la variable du corps JSON ne se résout pas, ou la page n\'a rien renvoyé'
            : (recu.length < 40
              ? 'contenu TRÈS court — la variable du corps JSON pointe vers un nombre ou une URL, pas vers la page'
              : 'contenu court — page fournisseur tronquée, vide, ou réponse d\'un autre point d\'entrée')
        }
      });
    }

    /* Aiguillage de format (01/08/2026) : chaque parseur tourne, le plus
       fécond gagne — cotébrico et clickoutil n'écrivent ni leurs prix ni
       leurs réfs pareil (mesuré sur la page réelle des deux). Les PACKS
       montés par le site et les titres sans réf sûre sont ÉCARTÉS et
       LISTÉS, jamais devinés : un prix de pack écrit sur la réf d'un
       composant corromprait un coût d'achat. */
    const auto = priceParse.parseAuto(text, brand);
    const parsed = auto.items;
    if (!parsed.length) {
      /* Rien de reconnu — mais la page est LÀ, entre nos mains : on la mesure
         au lieu de la jeter. Le diagnostic dit laquelle des hypothèses du
         parseur casse sur ce site (séparateur de cartes, motif réf, motif
         prix), avec trois extraits bruts de la page fournisseur. C'est la
         SEULE voie d'apprentissage d'un format inconnu : ces sites sont
         injoignables depuis le dépôt (CONNECT 403, mesuré), et deviner un
         balisage est interdit (O6). Aucune donnée personnelle ici : la page
         est une grille produits publique. */
      return res.status(200).json({
        ok: true, brand, source: sourceSlug, parsed: 0, format: auto.format,
        note: 'aucun produit reconnu — le champ diagnostic mesure ce que la page contient',
        diagnostic: priceParse.diagnostiquerPage(text, brand)
      });
    }

    /* Overrides relus À LA SOURCE : le catalogue fusionné peut avoir jusqu'à
       30 s de retard. En mode balayage (&scan=1), le relevé vient du cache de
       rafale (voir CACHE DE BALAYAGE ci-dessus) — une lecture pour 67 pages
       au lieu de deux par page, et le catalogue se fusionne SUR CE relevé. */
    let ovW;
    /* ⚠️ `cacheReutilise` est RENDU dans la réponse (`scanCache`), et ce n'est
       pas de la décoration : le cache vit dans la mémoire d'UNE instance
       serverless. Vercel réutilise normalement l'instance chaude entre deux
       requêtes qui se suivent — mais rien ne le garantit, et une instance
       froide relit tout. Annoncer « ~1 500 lectures par balayage » sans le
       mesurer serait une supposition présentée comme un fait : chaque page
       dit donc elle-même si elle a réutilisé le relevé. Un balayage sain
       affiche `scanCache: false` à la page 1 et `true` ensuite. */
    let cacheReutilise = false;
    if (scanMode && pwScanCache && (Date.now() - pwScanCache.at) < PW_SCAN_TTL) {
      ovW = pwScanCache.map;
      cacheReutilise = true;
    } else {
      const ovSnapW = await db.collection('product_overrides').get();
      ovW = {};
      ovSnapW.forEach((d) => { ovW[d.id] = d.data() || {}; });
      if (scanMode) pwScanCache = { map: ovW, at: Date.now() };
    }
    const products = scanMode ? catalog.loadCatalogAvec(ovW) : await catalog.loadCatalog();
    const bySku = {};
    products.forEach((p) => { if (p.sku) bySku[String(p.sku).toUpperCase()] = p; });
    /* Les RÉFÉRENCES ALTERNATIVES (`srcAltSkus`) pointent vers leur fiche :
       un site peut n'afficher QUE la déclinaison — clickoutil écrit
       « DCN930N-XJ » là où la fiche dit « DCN930N », et l'user a tranché :
       le suffixe -XJ est un marquage de commercialisation géographique, pas
       une identité. Sans cet index, l'alias tombait dans `unknown` et la
       fiche n'était jamais mise à jour par ce site.
       ⛔ Un alias n'écrase JAMAIS un sku principal — et une alternative ne
       se déclare qu'après vérification du CONTENU (nu vs pack) : c'est la
       mise en garde de l'user, un prix de pack sur une fiche d'outil nu
       corromprait le coût. */
    products.forEach((p) => {
      (Array.isArray(p.srcAltSkus) ? p.srcAltSkus : []).forEach((a) => {
        const k = String(a || '').trim().toUpperCase();
        if (k && !bySku[k]) bySku[k] = p;
      });
    });
    pwAliasNomenclature(products, brand, bySku);

    // Config de tarification : si autoPrice, on applique le MODÈLE de marge cible
    // (markup adaptatif poids/mode pour 15 % net après IS) ; sinon repli ×1,15.
    const cfg = await priceConfig.load();
    /* ⛔ CONFIG ILLISIBLE (quota Firestore, réseau) = AUCUN PRIX ÉCRIT.
       Crainte de l'user le 02/08/2026, au lendemain du quota épuisé : un
       passage qui écrirait avec les RÉGLAGES PAR DÉFAUT au lieu des siens.
       Les marges resteraient pleines (autoPrice vrai par défaut), mais une
       écriture sous réglages non voulus reste une écriture non voulue :
       on refuse, le raccourci repassera dans 12 h. */
    if (cfg._sourceIllisible && !dryRun) {
      return res.status(503).json({ ok: false, error: 'config de prix illisible (Firestore indisponible) — aucun prix écrit, repasser plus tard' });
    }

    const applied = [], flagged = [], unchanged = [], unknown = [], lockedW = [];
    const now = admin.firestore.FieldValue.serverTimestamp();
    /* ⚠️ DEUX HORLOGES, DEUX USAGES — appris en production (E-228) :
       `now` est un SENTINEL serverTimestamp, bon pour les champs d'affichage
       (priceCheckedAt…) mais Number(now) = NaN : glissé dans un `at` de
       `priceSources`, il rendait l'entrée du passage EN COURS invisible au
       min (D25033K-QS : clickoutil 119,90 € perdu contre 126,72 €). Tout ce
       qui sert à l'ARITHMÉTIQUE de fraîcheur prend `nowMs`, un nombre. */
    const nowMs = Date.now();

    /* Les accessoires SANS RÉF s'apparient par leur NOM EXACT (`srcNom` sur
       la fiche — règle de l'user) : chaque apparié devient un relevé normal,
       les autres restent listés. */
    const apparie = pwApparierParNom(auto.sansRef, products);
    apparie.items.forEach((it) => parsed.push(it));
    /* Les PACKS aussi (02/08/2026, décision de l'user — il les VEUT au
       catalogue) : identité = le titre exact (`srcNom`), jamais la réf d'un
       composant. Le verrou d'argent reste entier : un pack non apparié
       reste listé, son prix ne s'écrit sur AUCUNE fiche. */
    const appariePacks = pwApparierParNom(auto.packs, products);
    appariePacks.items.forEach((it) => parsed.push(it));

    // Prix parsés indexés par SKU (pour la règle « min des sources » srcAltSkus).
    const parsedBySku = {};
    parsed.forEach((it) => { parsedBySku[String(it.sku).toUpperCase()] = it.price; });

    /* Produits vus EN RUPTURE sur cette page : leur prix ne sert JAMAIS de
       coût (on ne peut pas acheter là), mais la rupture est ENREGISTRÉE pour
       que le coût effectif se recalcule sans cette source. */
    const enRupture = [];

    /* Une fiche peut être vue DEUX fois sur la même page — par son sku et par
       un alias (`srcAltSkus`). On ne l'écrit qu'une fois : la première
       rencontre gagne, et le choix du moins cher regarde de toute façon
       TOUTES les déclinaisons présentes sur la page. */
    const fichesVues = new Set();
    for (const item of parsed) {
      const p = bySku[item.sku];
      if (!p) { unknown.push({ sku: item.sku, srcTTC: item.price, name: item.name }); continue; }
      if (fichesVues.has(p.id)) continue;
      fichesVues.add(p.id);
      if (item.enStock === false) {
        enRupture.push({ sku: item.sku, id: p.id, name: p.title || p.name, srcTTC: item.price });
        if (!dryRun) {
          const srcsR = pwSourcesConnues(ovW[p.id] || {});   // carte + héritage
          srcsR[sourceSlug] = { ttc: item.price, at: nowMs, enStock: false };
          const choixR = priceParse.choisirCoutSource(srcsR, nowMs);
          const patchR = {
            priceSources: { [sourceSlug]: { ttc: item.price, at: nowMs, enStock: false } },
            // Le coût effectif se recalcule SANS cette source. S'il ne reste
            // rien d'achetable, le produit passe en GEL (origin 'rupture').
            priceSrcTTC: choixR ? choixR.ttc : null,
            priceSource: choixR ? choixR.source : 'rupture'
          };
          await db.collection('product_overrides').doc(p.id).set(
            Object.assign({}, patchR, { priceCheckedAt: now }), { merge: true });
          if (scanMode) pwMajLocale(ovW, p.id, patchR, nowMs);
        }
        continue;
      }
      // Règle 25/07 : si le produit référence des déclinaisons fournisseur
      // (srcAltSkus, ex. DBS180Z ← DBS180ZJ), on achète TOUJOURS la moins
      // chère → source effective = min des prix présents sur la page.
      // 🔒 Prix verrouillé : le traqueur relève, mais n'écrit JAMAIS.
      if (p.priceLocked === true) { lockedW.push({ sku: item.sku, id: p.id, name: p.title || p.name }); continue; }
      const oW = ovW[p.id] || {};
      /* Le PROPRE sku de la fiche entre dans la liste des candidats : quand la
         fiche est atteinte par un ALIAS (clickoutil n'affiche que DCN930N-XJ),
         `item` est l'alias — sans cet ajout, un prix du sku principal présent
         ailleurs sur la page échapperait au min. */
      const src = priceParse.pickCheapestSource(item.price,
        [p.sku].concat(Array.isArray(p.srcAltSkus) ? p.srcAltSkus : []), parsedBySku);
      /* ── COÛT EFFECTIF = LE MOINS CHER DE TOUTES LES SOURCES VALIDES ──────
         (01/08/2026) Cette source-ci, fraîchement relevée, rejoint la carte
         `priceSources` ; le prix du site se calcule sur le minimum des
         sources fraîches ET en stock — quel que soit le traqueur qui parle. */
      const srcsMaj = pwSourcesConnues(oW);   // carte + héritage cotébrico
      srcsMaj[sourceSlug] = { ttc: src, at: nowMs, enStock: true };
      const choix = priceParse.choisirCoutSource(srcsMaj, nowMs);
      const effSrc = choix ? choix.ttc : src;
      const effFrom = choix ? choix.source : sourceSlug;
      const priced = pwComputePrice(p, effSrc, cfg);
      const newPrice = priced.newPrice, newHt = priced.newHt;
      const cur = (typeof oW.price === 'number') ? oW.price
        : (typeof p.price === 'number' ? p.price : null);
      const rec = { sku: item.sku, id: p.id, name: p.title || p.name, srcTTC: effSrc, source: effFrom, newPrice, newHt, markup: priced.markup, oldPrice: cur };

      // Cette source a-t-elle DÉJÀ ce relevé, et le coût effectif est-il déjà bon ?
      const entreeSrc = (oW.priceSources || {})[sourceSlug];
      const dejaAJour = !!entreeSrc && Math.abs((entreeSrc.ttc || 0) - src) < 0.01
        && Math.abs((oW.priceSrcTTC || 0) - effSrc) < 0.01 && entreeSrc.enStock !== false;

      if (cur != null && Math.abs(newPrice - cur) < 0.02) {
        unchanged.push(rec);
        // Le prix est déjà bon — mais le COÛT RELEVÉ doit quand même être
        // enregistré. Sans ça, un produit parfaitement suivi n'a JAMAIS de coût
        // réel en base : il compte comme « estimé », le garde-fou coffret ne
        // peut pas s'appuyer dessus, et la marge affichée repose sur une
        // supposition alors que le vrai prix fournisseur est connu.
        if (!dryRun && !dejaAJour) {
          const patchU = {
            priceSources: { [sourceSlug]: { ttc: src, at: nowMs, enStock: true } },
            priceSource: effFrom, priceSrcTTC: effSrc
          };
          await db.collection('product_overrides').doc(p.id).set(
            Object.assign({}, patchU, { priceCheckedAt: now }), { merge: true });
          if (scanMode) pwMajLocale(ovW, p.id, patchU, nowMs);
        }
        continue;
      }

      let reason = null;
      if (src < PW.MIN_TTC || src > PW.MAX_TTC) reason = 'prix source hors fourchette (' + src + ' €)';
      // ⛔ PLAFOND DE VARIATION RETIRÉ — décision D-015 de l'user, 31/07/2026.
      //
      // Il refusait tout prix bougeant de plus de 25 % par rapport au dernier
      // relevé. Motif d'origine : se protéger d'une page mal lue. Motif du
      // retrait, et il est plus fort : **le traqueur lit ce que la page du
      // fournisseur AFFICHE — c'est exactement ce que l'user paiera.** Une
      // hausse de 29 % n'est pas une anomalie à filtrer, c'est le tarif réel.
      //
      // Ce que ce verrou a réellement coûté : DVC560Z est resté à un prix qui
      // faisait perdre 8,31 € par vente, parce que la correction nécessaire
      // dépassait le seuil. Un garde-fou qui bloque la réparation d'une perte
      // ne protège pas, il ampute.
      //
      // ⚠️ Les bornes ABSOLUES (MIN_TTC / MAX_TTC) restent en place : elles ne
      // jugent pas une variation mais une valeur impossible, et c'est le seul
      // filet qui attrape un parseur qui déraille. Le verrou `priceLocked`
      // reste actif lui aussi.
      // Une variation, même énorme, reste visible dans la réponse (`applied`)
      // et dans `price_watch_log` : on ne perd pas la trace, on cesse de bloquer.
      if (reason) { rec.reason = reason; flagged.push(rec); continue; }

      if (!dryRun) {
        /* ── ÉTIQUETTE « EN PROMO » ─────────────────────────────────────
           Demandée par l'user le 01/08/2026 : « lorsque le prix baisse, il
           faut le notifier en promo ; si le prix remonte on enlève ; et si le
           prix reste à ce prix-là plus de deux mois, ça devient son nouveau
           prix, on enlève la notification ».

           ⛔⛔ LE PRIX DE RÉFÉRENCE N'EST PAS « CELUI D'AVANT ». La porte J4 le
           dit : « une réduction annoncée se réfère au PRIX LE PLUS BAS
           PRATIQUÉ SUR LES 30 JOURS PRÉCÉDENTS ». Barrer le prix de la veille
           alors qu'on a vendu moins cher il y a trois semaines, c'est une
           annonce de réduction trompeuse — une infraction, pas une
           approximation. On relit donc le journal des mouvements et on prend
           le MINIMUM réellement pratiqué.

           Et s'il n'y a aucune réduction face à ce minimum, il n'y a PAS de
           promo, même si le prix vient de baisser : c'est le cas d'un prix
           remonté puis rebaissé — rien de nouveau n'est offert au client.

           L'expiration à deux mois se calcule à l'AFFICHAGE (`promoActive`) :
           une promo qui dépendrait d'une tâche planifiée resterait affichée le
           jour où la tâche ne tourne pas, et une réduction périmée affichée
           est le même délit. */
        var promo = { promoDepuis: null, promoAncienPrix: null };
        if (newPrice < cur) {
          /* ⛔ CORRIGÉ le 02/08/2026 — la fenêtre était calculée avec le
             SENTINEL : `now - 30 j` = NaN (E-228, même mécanisme), et la
             requête `where('at' >= NaN)` ne rendait JAMAIS rien — le catch
             avalait tout et `refMin` retombait sur le prix courant. Résultat :
             un prix remonté puis rebaissé s'affichait « promo » face au prix
             de la veille — précisément l'annonce trompeuse que J4 interdit.
             Fenêtre désormais en NOMBRES (nowMs), et filtrée EN MÉMOIRE sur
             un seul `where` : `id ==` + `at >=` exigerait un index composite
             que l'émulateur ne signalerait jamais (règle E). Le journal d'un
             seul produit tient en quelques documents. */
          var depuis30 = nowMs - 30 * 24 * 3600 * 1000;
          var refMin = cur;
          try {
            var hist = await db.collection('price_watch_log')
              .where('id', '==', p.id).get();
            hist.forEach(function (d) {
              var v = d.data();
              if (priceParse.enMillis(v.at) < depuis30) return; // hors fenêtre 30 j
              [Number(v.oldPrice), Number(v.newPrice)].forEach(function (x) {
                if (x > 0 && x < refMin) refMin = x;
              });
            });
          } catch (e) { /* journal illisible → on reste sur le prix courant */ }
          if (newPrice < refMin) promo = { promoDepuis: now, promoAncienPrix: refMin };
        }
        const patchA = Object.assign({
          price: newPrice, price_ht: newHt,
          priceSources: { [sourceSlug]: { ttc: src, at: nowMs, enStock: true } },
          priceSource: effFrom, priceSrcTTC: effSrc,
          priceMarkup: priced.markup, priceMode: priced.mode
        }, promo);
        await db.collection('product_overrides').doc(p.id).set(
          Object.assign({}, patchA, { priceCheckedAt: now }), { merge: true });
        if (scanMode) pwMajLocale(ovW, p.id, patchA, nowMs);
        await db.collection('price_watch_log').add({
          sku: item.sku, id: p.id, oldPrice: cur, newPrice, srcTTC: effSrc, source: sourceSlug, brand, at: now,
          markup: priced.markup, mode: priced.mode
        });
      }
      applied.push(rec);
    }

    if (!dryRun && applied.length) catalog.invalidateOverrides();

    /* ⛔⛔ LE TROU QUE PERSONNE NE VOYAIT — ajouté le 01/08/2026.
       ─────────────────────────────────────────────────────────────────────
       Le traqueur rendait `unknown` : les références de la PAGE absentes du
       catalogue. Utile — mais c'est l'INVERSE qui coûte de l'argent.

       Ce qu'il ne disait PAS : quelles fiches DU CATALOGUE la page n'a pas
       montrées. Celles-là n'ont jamais de coût relevé, donc leur prix se
       calcule sur un coût DEVINÉ à partir du prix — un cercle qui confirme
       toujours ce qui existe déjà. Et rien, nulle part, ne le signalait.

       L'user l'a découvert seul, après coup, sur son écran d'admin : « 541
       estimés ». Un automatisme doit dire ça tout seul, à chaque passage.

       Causes possibles d'une absence, toutes actionnables :
         · la page fournisseur est plafonnée (`resultsPerPage`) et coupe la
           queue de liste ;
         · la référence n'est pas vendue par ce fournisseur ;
         · la référence du catalogue ne correspond pas à celle de la page ;
         · le raccourci tourne en `dryRun=1` et n'écrit donc jamais rien.
       On les rend VISIBLES au lieu de les laisser deviner. */
    const vusSurLaPage = new Set(parsed.map((it) => String(it.sku).toUpperCase()));
    const absents = products
      .filter((p) => String(p.brand || '').toUpperCase() === String(brand).toUpperCase())
      .filter((p) => !vusSurLaPage.has(String(p.sku || '').toUpperCase()))
      .map((p) => {
        const o = ovW[p.id] || {};
        /* ⚠️ « absent de CETTE page » ≠ « jamais relevé ». Une fiche vue lors
           d'un passage précédent garde son coût réel. Seules les secondes
           vivent sur une supposition — ce sont elles qui comptent.
           ⚠️ Corrigé au passage multi-sources : la version d'avant ne
           reconnaissait que `priceSource === 'cotebrico'` — un relevé venu
           d'un AUTRE traqueur aurait compté « jamais relevé ». */
        const srcs = o.priceSources || {};
        const releve = Object.keys(srcs).some((s) => Number((srcs[s] || {}).ttc) > 0)
          || (typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0);
        return { sku: p.sku, id: p.id, name: p.title || p.name, dejaReleve: releve };
      });
    const jamaisReleves = absents.filter((a) => !a.dejaReleve);

    return res.status(200).json({
      ok: true, brand, dryRun: !!dryRun, scan: !!scanMode,
      // Mesure, pas promesse : le relevé a-t-il été réutilisé sur CETTE page ?
      scanCache: scanMode ? cacheReutilise : undefined,
      counts: {
        parsed: parsed.length, applied: applied.length, flagged: flagged.length,
        unchanged: unchanged.length, unknown: unknown.length, locked: lockedW.length,
        absents: absents.length, absentsJamaisReleves: jamaisReleves.length,
        rupture: enRupture.length,
        packsIgnores: appariePacks.restants.length, packsSuivis: appariePacks.items.length,
        sansRef: apparie.restants.length, sansRefSuivis: apparie.items.length
      },
      source: sourceSlug, format: auto.format,
      /* ── BALAYAGE : LES COMPTEURS, PAS LES LISTES (02/08/2026) ────────────
         67 pages × les listes détaillées ≈ un Mo de texte dans le
         presse-papier du raccourci : illisible, incollable, donc invérifiable.
         En `&scan=1` les listes sortent VIDES et seuls les compteurs de
         `counts` parlent — aucun chiffre n'est perdu, et `note` le dit au lieu
         de le taire.
         ⛔ `applied` reste ENTIER quel que soit le mode : c'est la liste des
         prix qui bougent, donc de l'argent. Une réponse qui cacherait ce
         qu'elle vient de changer serait pire qu'une réponse trop longue.
         ⚠️ Conséquence assumée : un relevé de balayage ne nourrit PAS
         l'importateur (il lit `unknown`/`sansRef`/`packsIgnores`). Pour créer
         des fiches, refaire un passage SANS `&scan=1` sur la page voulue. */
      note: scanMode
        ? 'balayage : listes détaillées omises (les compteurs de `counts` restent exacts). '
          + 'Pour obtenir unknown / sansRef / packsIgnores et créer des fiches, '
          + 'refaire un passage SANS &scan=1 sur la page voulue.'
        : undefined,
      applied, flagged,
      unknown: scanMode ? [] : unknown.slice(0, 800),
      /* En balayage, « absent de CETTE page » ne veut rien dire non plus : une
         page idealo montre ~60 produits sur ~1 200 fiches — la liste serait
         tout le catalogue, répété 67 fois. */
      absents: scanMode ? [] : absents.slice(0, 800),
      rupture: scanMode ? [] : enRupture.slice(0, 400),
      /* Hors balayage, restent listés et jamais silencieux : packs et titres
         sans réf NON appariés par nom (`srcNom`). Plafond 400 (et non 100) :
         c'est cette liste, AVEC les prix, qui sert à créer les fiches des
         packs — plafonnée à 100, l'import aurait été borgne (275 packs sur la
         page, mesurés le 02/08). */
      packsIgnores: scanMode ? [] : appariePacks.restants.slice(0, 400),
      sansRef: scanMode ? [] : apparie.restants.slice(0, 200)
    });
  } catch (err) {
    console.error('[api/admin] price-watch failed:', err.message);
    return res.status(500).json({ ok: false, error: 'price-watch failed' });
  }
}

// Corps volumineux (3 pages cotébrico) → augmente la limite du body parser.
// Corps volumineux : le traqueur reçoit le HTML BRUT d'une page cotébrico
// entière. Une page « toute la marque » (resultsPerPage=800) pèse plusieurs Mo.
// 4,5 Mo = plafond de Vercel pour le corps d'une requête serverless — on s'y
// cale. Au-delà, découper la marque en 2 pages (voir docs/TRAQUEUR-URLS.md).
module.exports.config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };
// Pour les portes UNIQUEMENT : tester le vrai chemin, jamais une copie (O6).
module.exports._internals = {
  pwSourceCost: pwSourceCost, pwSourcesConnues: pwSourcesConnues,
  pwApparierParNom: pwApparierParNom, pwAliasNomenclature: pwAliasNomenclature,
  // Exposés pour check-price-watch : le mode balayage se prouve en APPELANT
  // le handler avec une base factice qui compte lectures et écritures.
  handlePriceWatch: handlePriceWatch, pwMajLocale: pwMajLocale, pwScanReset: pwScanReset
};
