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
// Les pages à balayer, déclarées une fois — jamais dans une URL tapée à la main.
const plans = require('./_lib/traqueur-plans');
// Snapshot des derniers prix vivants (4 docs agrégés) : CHAQUE écriture
// d'override doit s'y répercuter, sinon le rendu servirait des prix d'avant.
const snapshotLib = require('./_lib/snapshot');
// Ce qu'on refuse d'acheter, et pourquoi. Un seul fichier, fait pour changer.
const barriere = require('./_lib/barriere-achat');
/* Pourquoi une rafale rend moins de pages qu'elle n'en a envoyé. Fonction pure.
   ⚠️ Portes lues : J3 — n'y entrent que des horodatages techniques et des
   compteurs, aucune donnée personnelle, rien de persisté ni de journalisé ;
   J5 — aucune TVA, aucun octroi de mer : le territoire fiscal continue de se
   dériver du code postal, ce diagnostic n'y touche pas. */
const diagRafale = require('./_lib/diag-rafale');
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
  /* ⛔ LE PLAN DE BALAYAGE PASSE PAR LA MÊME PORTE QUE LE RELEVÉ, et il le
     doit : c'est le MÊME raccourci iPad qui l'appelle, et un raccourci ne
     peut pas produire de jeton Firebase (il expire chaque heure). Le laisser
     tomber sur `requireAdmin` l'aurait refusé en silence — exactement la
     panne du 31/07 où les prix ont cessé d'être relevés sans un mot.
     ⚠️ Portes lues : J3 — ce plan ne rend que des ADRESSES de pages publiques,
     aucune donnée personnelle, rien conservé ; J4 — aucun prix n'y transite,
     et rien n'y produit de prix barré ni de réduction annoncée (D-004) ;
     J5 — aucune TVA, aucun octroi de mer.
     ⚠️ Sécurité : `requireWatch` n'ouvre que le traqueur, et ce plan ne lit ni
     n'écrit rien. Le secret vit dans un EN-TÊTE, jamais dans une URL. */
  const typeDemande = (req.query && req.query.type) || '';
  const estWatch = typeDemande === 'price-watch' || typeDemande === 'price-watch-plan';
  const denied = estWatch ? await auth.requireWatch(req) : await auth.requireAdmin(req);
  if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });

  /* ── GET ?type=price-watch-plan : LES 67 PAGES, DANS L'ORDRE ──────────────
     ⛔ MOTIF, dit et redit par l'user : « arrête de me demander de rajouter
     quelque chose dans une URL ». Une page fournisseur paginée demande 67
     adresses différentes ; les lui faire taper une par une est une garantie
     d'erreur, et une erreur d'URL ici, c'est un prix qui ne descend pas.
     Le raccourci demande donc son plan, et boucle dessus. Rien à éditer.
     ⛔ PLACÉ AVANT FIRESTORE, ET C'EST VOULU : ce plan ne lit ni n'écrit
     rien. Le faire tomber sur le 503 « Firestore not configured » le rendrait
     indisponible pour une raison qui ne le concerne pas — et l'user
     chercherait la panne du côté du traqueur.
     ⚠️ Portes lues : J3 — des adresses de pages publiques, aucune donnée
     personnelle, rien conservé ; J4 — aucun prix ; J5 — aucune fiscalité. */
  if (req.method === 'GET' && typeDemande === 'price-watch-plan') {
    const brand = String((req.query && req.query.brand) || '').toUpperCase();
    const source = String((req.query && req.query.source) || '').toLowerCase();
    const p = plans.plan(brand, source);
    if (!p) {
      /* ⛔ UN REFUS QUI NE DIT PAS QUOI FAIRE EST UN MUR. On nomme les plans
         qui existent : l'écart entre ce qu'il a demandé et ce qui est déclaré
         saute aux yeux, sans un aller-retour de plus. */
      return res.status(404).json({
        ok: false,
        error: 'Aucun plan de balayage déclaré pour ' + (brand || '?') + '@' + (source || '?')
          + '. Plans connus : ' + plans.plansConnus().join(', ')
          + '. Ils se déclarent dans api/_lib/traqueur-plans.js, jamais dans une URL.'
      });
    }
    const etapes = priceParse.planBalayage(p);
    /* L'adresse du RELEVÉ, prête à l'emploi et en mode rafale : c'est elle que
       le raccourci met dans son POST. `scan=1` fait vivre le cache de
       balayage — sans lui, 67 pages coûteraient ~160 000 lectures Firestore. */
    const postUrl = '/api/admin?type=price-watch&brand=' + encodeURIComponent(brand)
      + '&source=' + encodeURIComponent(source) + '&scan=1&dryRun=0';
    return res.status(200).json({
      ok: true,
      brand: brand, source: source,
      pages: p.pages, parPage: p.parPage, ordre: p.ordre,
      /* ⚠️ Ce que le plan SUPPOSE encore, écrit noir sur blanc plutôt que tu
         (E-112 : une grammaire déduite de deux points est une invention). */
      aVerifier: p.aVerifier || null,
      note: p.note || null,
      postUrl: postUrl,
      /* Les adresses, DANS L'ORDRE DE BALAYAGE — décroissant ⇒ on part de la
         dernière page, là où les prix bougent le plus. */
      urls: etapes.map((e) => e.url),
      etapes: etapes
    });
  }

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
      /* FAIL-LOUD : raz-compta est POST uniquement — c'est ainsi que l'écran
         admin l'appelle (adminPostType), et un effacement définitif ne
         s'expose pas sur une URL. ⛔ Avant le 08/08/2026 la route vivait ICI,
         dans le bloc GET : elle lisait `body`, qui n'existe pas dans ce bloc —
         ReferenceError, donc 500 systématique (CODE-101) — pendant que le
         POST de l'écran ne trouvait AUCUN gestionnaire. Morte des deux côtés.
         Le gestionnaire réel vit désormais avec les autres POST. */
      if (type === 'raz-compta') {
        return res.status(400).json({
          ok: false,
          error: 'raz-compta = POST uniquement (corps JSON ; sans confirmer: "OUI", essai qui compte sans rien supprimer).'
        });
      }

      if (type === 'price-moves') {
        const jours = Math.min(365, Math.max(1, Number(req.query.jours) || 30));
        const depuis = Date.now() - jours * 24 * 3600 * 1000;
        const snap = await db.collection('price_watch_log')
          .where('at', '>=', depuis).orderBy('at', 'desc').limit(500).get();
        /* ⚠️ LE FILTRE FIRESTORE NE SUFFIT PAS, ET IL FAUT LE DIRE. Les
           entrées écrites AVANT la correction portent un Timestamp : dans
           l'ordre des types Firestore, elles passent toutes le `>=` numérique
           ci-dessus. Le tri en mémoire les remet à leur place, et le filtre en
           mémoire les juge sur leur vraie date. Sans ça, « 7 jours »
           afficherait l'historique entier. */
        const cat = await catalog.loadCatalog();
        const parId = {};
        cat.forEach((p) => { parId[p.id] = p; });
        const moves = [];
        snap.forEach((d) => {
          const v = d.data();
          const p = parId[v.id] || null;
          const ancien = Number(v.oldPrice) || 0;
          const nouveau = Number(v.newPrice) || 0;
          /* `enMillis` lit indifféremment un nombre ou un Timestamp relu de
             Firestore — c'est la fonction née d'E-228, on ne la réécrit pas. */
          const quand = priceParse.enMillis(v.at);
          if (!(quand >= depuis)) return;
          if (!(ancien > 0) || !(nouveau > 0) || ancien === nouveau) return;
          moves.push({
            id: v.id, sku: v.sku || (p && p.sku) || v.id,
            titre: (p && p.title) || v.sku || v.id,
            img: (p && p.img) || 'images/placeholder.svg',
            marque: v.brand || (p && p.brand) || '',
            ancien: ancien, nouveau: nouveau,
            variation: Math.round((nouveau / ancien - 1) * 1000) / 10,
            at: quand
          });
        });
        // Le tri final se fait ici : voir la note sur l'ordre des types.
        moves.sort((a, b) => b.at - a.at);
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
        /* ── PÉRIODE (demande user 09/08) : &jours=7|30 borne les compteurs
           journaliers (visites, pages vues, clics, visiteurs) à la fenêtre.
           L'id des docs analytics_daily EST la date (YYYY-MM-DD) : la requête
           par intervalle d'id ne LIT que les jours voulus — précision ET
           économie de quota. Sans paramètre : tout l'historique (Total).
           ⚠️ Produits/clics-libellés/pays n'ont PAS de dimension temporelle
           (compteurs cumulés, un doc par produit/libellé/pays) : ils restent
           « depuis le début » quel que soit le filtre — la réponse le DIT
           (periode.cumulatif) pour que l'écran l'affiche honnêtement.
           J3 : agrégats sans identifiant ni IP — rien de nouveau ne sort. */
        const joursDemandes = Number(req.query && req.query.jours) || 0;
        let daily;
        if (joursDemandes === 7 || joursDemandes === 30) {
          const depuis = analytics.dateKey(Date.now() - joursDemandes * 86400000);
          const sd = await db.collection('analytics_daily')
            .where(admin.firestore.FieldPath.documentId(), '>=', depuis).get();
          daily = [];
          sd.forEach((d) => daily.push(Object.assign({ id: d.id }, d.data())));
        } else {
          daily = await readAll('analytics_daily');
        }
        const products = await readAll('analytics_products');
        const clicks = await readAll('analytics_clicks');
        const geo = await readAll('analytics_geo');
        const dates = daily.map((d) => d.date || d.id).sort();
        return res.status(200).json({
          ok: true,
          periode: {
            jours: (joursDemandes === 7 || joursDemandes === 30) ? joursDemandes : 'total',
            du: dates[0] || null, au: dates[dates.length - 1] || null,
            cumulatif: 'produits, clics par libellé et pays sont comptés depuis le début (pas de date par événement)'
          },
          stats: analytics.summarize(daily, products, clicks, geo)
        });
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

  /* ── POST ?type=raz-compta : REMISE À ZÉRO DE LA COMPTABILITÉ ─────────────
     Demandée par l'user le 01/08/2026, deux fois, en toutes lettres :
     « je m'en fous que ça casse les informations dans la comptabilité, on
     vire tout, on remet l'historique à zéro, on refera des tests ».

     J'avais soulevé le caractère irréversible ; il a tranché. Ces écritures
     sont celles de la phase de TEST (fausse monnaie du bac à sable), pas
     des recettes réelles déclarées.

     ⛔ DÉPLACÉE ICI le 08/08/2026 (CODE-101) : elle vivait dans le bloc GET,
     où `body` n'existe pas — ReferenceError, 500 systématique — pendant que
     l'écran admin l'appelle en POST (adminPostType) et ne trouvait aucun
     gestionnaire. C'est le POST qui est juste : un effacement définitif ne
     s'expose pas sur une URL.

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
  if (req.method === 'POST' && ((req.query && req.query.type) === 'raz-compta')) {
    if (!db) return res.status(503).json({ ok: false, error: 'Firestore not configured' });
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const COLLECTIONS = ['payments', 'charges', 'refunds', 'stripe_events'];
    const compte = {};
    for (const c of COLLECTIONS) {
      try { compte[c] = (await db.collection(c).get()).size; }
      catch (e) { compte[c] = -1; }
    }
    if (String(body.confirmer || '') !== 'OUI') {
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

  // ── POST ?type=product-price-preview : CE QUE DONNERAIT LE CALCULATEUR ──
  // L'user saisit un coût fournisseur et doit VOIR le prix de vente avant de
  // créer la fiche. Il n'existe aucun calculateur côté navigateur, et il ne
  // doit pas en exister : deux implémentations divergeraient au premier
  // correctif, et c'est le prix affiché qui mentirait. La simulation passe
  // donc par le MÊME `recommend()` que la création — elle n'écrit rien.
  if (req.method === 'POST' && ((req.query && req.query.type) === 'product-price-preview')) {
    try {
      const b = req.body || {};
      const coutTTC = Number(b.srcTTC);
      if (!(coutTTC > 0)) return res.status(400).json({ ok: false, error: 'prix fournisseur requis' });
      const poids = Number(b.weight_kg);
      const reco = priceModel.recommend(
        { category: String(b.category || ''), weight_kg: poids > 0 ? poids : 2, vat: 0.2 },
        { costTTC: coutTTC, mode: 'colissimo' });
      if (!reco || !(reco.priceHtFor && reco.priceHtFor.price > 0)) {
        return res.status(422).json({ ok: false, error: 'le calculateur n\'a pas pu établir de prix' });
      }
      return res.status(200).json({ ok: true, price: reco.priceHtFor.price,
        price_ht: reco.priceHt, poidsSuppose: !(poids > 0) });
    } catch (err) {
      console.error('[api/admin] product-price-preview failed:', err.message);
      return res.status(500).json({ ok: false, error: 'calcul impossible' });
    }
  }

  // ── POST ?type=product-create : AJOUTER UN PRODUIT À LA MAIN ────────────
  // Demande de l'user, 07/08/2026 : « je vais pouvoir ajouter des produits
  // moi-même un par un … je rentrerai UNIQUEMENT le prix du fournisseur et le
  // calcul du véritable prix se fera automatiquement ».
  //
  // ⛔⛔ ARGENT — LE PRIX N'EST JAMAIS CELUI QU'ON REÇOIT. Le client n'envoie
  // qu'un COÛT D'ACHAT ; le prix de vente est calculé ICI, sur le serveur, par
  // `pricing-model.recommend()` — le même calculateur que l'importeur et que
  // le traqueur. Un `price` venu du formulaire est ignoré, purement et
  // simplement : c'est la règle « le serveur est autoritaire sur le montant ».
  //
  // ⛔ PORTE J4 LUE (`node scripts/juridique.js J4`) : « le prix annoncé doit
  // être exact et complet ». Si le calculateur ne peut pas établir de prix, on
  // REFUSE la création au lieu de publier une fiche sans prix.
  //
  // ⛔ PORTE J5 LUE : aucun taux n'est écrit ici. `recommend()` reçoit la
  // fiche et applique les taux du modèle ; la TVA et l'octroi de mer d'une
  // COMMANDE restent dérivés du code postal de livraison, jamais d'ici.
  //
  // ⛔ PORTE J3 LUE : ce point d'entrée ne touche à aucune donnée personnelle.
  // Rien de ce qui est écrit ici ne concerne une personne — que des produits.
  //
  // ⛔ LE COÛT D'ACHAT NE RESSORT JAMAIS. Il est écrit sous `srcTTC` dans le
  // document Firestore — jamais dans `products.json` (CDN + historique git,
  // fuite irréversible, gardée par `check-prix-fuite`) — et `toPublic()` le
  // retire de tout ce qui part vers un navigateur.
  //
  // ⚠️ L'IMAGE EST STOCKÉE TELLE QUELLE, SANS RECOMPRESSION : l'user a demandé
  // « télécharger le PNG sans perdre sa qualité ». C'est l'inverse du chemin
  // des photos d'artisans, qui réencode en WebP/JPEG dégressif. Le seul
  // plafond est donc PHYSIQUE : un document Firestore tient 1 Mio, et une
  // dataURL pèse ~4/3 de l'octet. Le plafond retenu est 700 000 signes, et ce
  // qu'il laisse passer a été MESURÉ, pas déduit : en encodant réellement,
  // 524 982 octets donnent 699 998 signes — trois octets de plus, et c'est
  // refusé. Soit 525 Ko (513 Kio) de fichier, ce qui laisse la marge du reste
  // de la fiche et reste sous le plafond D-002 de 871 Ko par image servie.
  if (req.method === 'POST' && ((req.query && req.query.type) === 'product-create')) {
    try {
      const b = req.body || {};
      const IMG_MAX = 700000;
      const sku = String(b.sku || '').trim().toUpperCase().replace(/[^A-Z0-9./-]/g, '').slice(0, 40);
      const title = String(b.title || '').trim().slice(0, 160);
      const brand = String(b.brand || '').trim().slice(0, 40);
      const category = String(b.category || '').trim().slice(0, 60);
      const coutTTC = Number(b.srcTTC);
      if (!sku) return res.status(400).json({ ok: false, error: 'référence requise' });
      if (!title) return res.status(400).json({ ok: false, error: 'titre requis' });
      if (!brand) return res.status(400).json({ ok: false, error: 'marque requise' });
      if (!category) return res.status(400).json({ ok: false, error: 'famille requise' });
      if (!(coutTTC > 0)) return res.status(400).json({ ok: false, error: 'prix fournisseur requis, TTC et strictement positif' });

      /* ⛔ JAMAIS DEUX FOIS LA MÊME RÉFÉRENCE. Le catalogue complet est relu —
         fichier ET fiches déjà créées à la main — parce qu'un doublon de SKU
         casse l'appariement du traqueur et fabrique deux prix pour un produit. */
      const dejaLa = (await catalog.loadCatalog())
        .some((p) => String(p.sku || '').toUpperCase() === sku);
      if (dejaLa) return res.status(409).json({ ok: false, error: 'la référence ' + sku + ' est déjà au catalogue' });

      const poids = Number(b.weight_kg);
      const poidsConnu = poids > 0;
      const specs = {};
      if (b.specs && typeof b.specs === 'object' && !Array.isArray(b.specs)) {
        Object.keys(b.specs).slice(0, 30).forEach((k) => {
          const cle = String(k).trim().slice(0, 40);
          const val = String(b.specs[k] == null ? '' : b.specs[k]).trim().slice(0, 120);
          if (cle && val) specs[cle] = val;
        });
      }
      const img = String(b.img || '');
      const imgOk = /^data:image\/(png|jpeg|webp);base64,/.test(img) && img.length <= IMG_MAX;
      if (img && !imgOk) {
        return res.status(400).json({ ok: false,
          error: 'image refusée : PNG, JPEG ou WebP, et 700 000 signes maximum une fois encodée' });
      }

      const id = (brand + '-' + sku).toLowerCase().normalize('NFD')
        .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 60);

      /* La fiche telle que le calculateur doit la voir : le port dépend du
         POIDS, et le poids fait le prix. Absent, `shipFor` retombe sur 2 kg —
         on le marque, exactement comme l'importeur, pour savoir quelles fiches
         auront un prix à revoir quand le poids réel sera connu. */
      const fiche = {
        id, sku, title, name: title, brand, category,
        slug: id,
        desc: String(b.desc || '').trim().slice(0, 2000),
        specs,
        img: imgOk ? img : 'images/placeholder.svg',
        currency: 'EUR',
        vat: 0.2,
        stock_status: 'in_stock',
        stock_label: 'En stock',
        weight_kg: poidsConnu ? poids : 2,
        poidsSuppose: !poidsConnu,
        creeALaMain: true
      };
      const reco = priceModel.recommend(fiche, { costTTC: coutTTC, mode: 'colissimo' });
      if (!reco || !(reco.priceHtFor && reco.priceHtFor.price > 0)) {
        return res.status(422).json({ ok: false,
          error: 'le calculateur n\'a pas pu établir de prix pour ce coût — fiche NON créée' });
      }
      fiche.price = reco.priceHtFor.price;
      fiche.price_ht = reco.priceHt;
      fiche.srcTTC = coutTTC;                 // ⛔ reste dans Firestore, jamais servi
      fiche.createdAt = admin.firestore.FieldValue.serverTimestamp();
      fiche.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('product_overrides').doc(id).set(fiche, { merge: false });
      await snapshotLib.majSnapshot(db, admin, id, fiche);
      catalog.invalidateOverrides();
      return res.status(200).json({ ok: true, id, sku,
        price: fiche.price, price_ht: fiche.price_ht, poidsSuppose: fiche.poidsSuppose });
    } catch (err) {
      console.error('[api/admin] product-create failed:', err.message);
      return res.status(500).json({ ok: false, error: 'création du produit échouée' });
    }
  }

  /* ── POST ?type=product-edit : LA FICHE ENTIÈRE, PAS SEULEMENT LE PRIX ────
     Demande de l'user, 08/08/2026 : « je dois pouvoir modifier la fiche produit
     complète […] là ça affiche que le libellé et le prix, je veux pouvoir tout
     modifier, description / fiche technique / png ».

     ⛔ POURQUOI UN POINT D'ENTRÉE À PART, ET PAS LA LISTE `allowed` DU POST
     GÉNÉRIQUE. Ces champs-là ne sont pas des chaînes : `specs` est un objet,
     `features` et `images` sont des tableaux, et `images` peut porter des
     images ENTIÈRES encodées. Les jeter dans la liste générique reviendrait à
     écrire dans Firestore ce que le navigateur envoie, sans forme ni borne —
     un document de plusieurs mégaoctets, ou un `specs` qui n'est pas un objet
     et casse le rendu de toutes les fiches.

     ⛔ CHAQUE CHAMP EST BORNÉ ET LE REFUS EST EXPLICITE. Tronquer en silence
     ferait disparaître du texte que l'user croit avoir enregistré.

     ⚠️ LE PRIX N'EST PAS ICI, ET C'EST VOULU. Il passe par le POST générique et
     par le calculateur ; un prix saisi à la main au milieu d'un formulaire de
     description contournerait la règle « plus aucun prix n'est saisi à la
     main » et la porte J4. */
  if (req.method === 'POST' && ((req.query && req.query.type) === 'product-edit')) {
    try {
      const b = req.body || {};
      const IMG_MAX = 700000;
      const id = String(b.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'identifiant du produit requis' });

      const patch = {};
      const refus = [];

      /* `title` sert AUSSI de `name` : les deux vivent dans le catalogue et la
         fiche lit l'un ou l'autre selon l'endroit — les laisser diverger
         afficherait deux noms pour un même produit. */
      if (b.title !== undefined) {
        const t = String(b.title).trim();
        if (!t) refus.push('le titre ne peut pas être vide');
        else if (t.length > 200) refus.push('titre : 200 signes maximum (' + t.length + ' reçus)');
        else { patch.title = t; patch.name = t; }
      }
      [['desc', 400], ['description_long', 6000], ['tag', 40], ['stock_label', 60]].forEach(function (p) {
        const k = p[0], max = p[1];
        if (b[k] === undefined) return;
        const v = String(b[k]).trim();
        if (v.length > max) refus.push(k + ' : ' + max + ' signes maximum (' + v.length + ' reçus)');
        else patch[k] = v;
      });
      if (b.stock_status !== undefined) {
        const s = String(b.stock_status);
        if (['in_stock', 'low_stock', 'out_of_stock', 'preorder'].indexOf(s) === -1) {
          refus.push('statut de stock inconnu : ' + s);
        } else patch.stock_status = s;
      }

      /* ⛔ LE POIDS EST DE L'ARGENT : il entre dans le calcul du port, donc du
         prix de vente. Un poids nul ferait un port nul. */
      if (b.weight_kg !== undefined) {
        const w = Number(b.weight_kg);
        if (!(w > 0) || w > 500) refus.push('poids : un nombre strictement positif en kg (reçu : ' + b.weight_kg + ')');
        else { patch.weight_kg = w; patch.poidsSuppose = false; }
      }

      /* Caractéristiques : un objet « clé → valeur ». Une ligne laissée vide
         est écartée, pas refusée — c'est une hésitation, pas une erreur. */
      if (b.specs !== undefined) {
        if (!b.specs || typeof b.specs !== 'object' || Array.isArray(b.specs)) {
          refus.push('caractéristiques : format attendu « clé : valeur »');
        } else {
          const cles = Object.keys(b.specs);
          if (cles.length > 40) refus.push('caractéristiques : 40 lignes maximum (' + cles.length + ' reçues)');
          else {
            const specs = {};
            cles.forEach(function (k) {
              const cle = String(k).trim().slice(0, 60);
              const val = String(b.specs[k] == null ? '' : b.specs[k]).trim().slice(0, 200);
              if (cle && val) specs[cle] = val;
            });
            patch.specs = specs;
          }
        }
      }

      if (b.features !== undefined) {
        if (!Array.isArray(b.features)) refus.push('points forts : une liste attendue');
        else if (b.features.length > 20) refus.push('points forts : 20 maximum (' + b.features.length + ' reçus)');
        else patch.features = b.features.map(function (f) {
          return String(f == null ? '' : f).trim().slice(0, 300);
        }).filter(Boolean);
      }

      /* ⛔ LES VISUELS : soit un chemin DU SITE, soit une image entière encodée.
         Rien d'autre — une URL externe ferait charger la fiche depuis un
         serveur tiers, que la CSP bloque et sur lequel on n'a aucune prise. */
      if (b.images !== undefined) {
        if (!Array.isArray(b.images)) refus.push('visuels : une liste attendue');
        else if (b.images.length > 6) refus.push('visuels : 6 maximum (' + b.images.length + ' reçus)');
        else {
          const images = [];
          b.images.forEach(function (v, i) {
            const s = String(v == null ? '' : v).trim();
            if (!s) return;
            const estChemin = /^images\/[A-Za-z0-9._/-]+\.(webp|png|jpe?g|svg)$/.test(s);
            const estEncodee = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
            if (!estChemin && !estEncodee) {
              refus.push('visuel ' + (i + 1) + ' : ni un fichier du site, ni une image encodée');
              return;
            }
            if (estEncodee && s.length > IMG_MAX) {
              refus.push('visuel ' + (i + 1) + ' : trop lourd — ' + IMG_MAX
                + ' signes maximum une fois encodé (' + s.length + ' reçus)');
              return;
            }
            images.push(s);
          });
          if (!refus.length) {
            patch.images = images;
            /* La carte du catalogue montre TOUJOURS le premier visuel : les
               laisser diverger afficherait un produit dans la grille et un
               autre sur sa fiche. */
            if (images.length) patch.img = images[0];
          }
        }
      }

      if (refus.length) return res.status(400).json({ ok: false, error: refus.join(' · ') });
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: 'aucun champ à enregistrer' });
      }

      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('product_overrides').doc(id).set(patch, { merge: true });
      await snapshotLib.majSnapshot(db, admin, id, patch);
      catalog.invalidateOverrides();
      console.log('[api/admin] product-edit', id, Object.keys(patch).join(','));
      return res.status(200).json({ ok: true, id: id,
        champs: Object.keys(patch).filter(function (k) { return k !== 'updatedAt'; }) });
    } catch (err) {
      console.error('[api/admin] product-edit failed:', err.message);
      return res.status(500).json({ ok: false, error: 'enregistrement de la fiche échoué' });
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
      await snapshotLib.majSnapshot(db, admin, productId, patch);

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
      await snapshotLib.majSnapshot(db, admin, String(id), null);
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
/* ⛔ MIN_TTC ALIGNÉ SUR LA BARRIÈRE D'ACHAT (09/08/2026, ordre de l'user :
   « baisser la marge minimale à un euro »). À 5 €, un article de quincaillerie
   à 3 € aurait passé la barrière (plancher 1 €) puis été refusé ICI en
   « hors fourchette » — deux planchers qui se contredisent, celui du bas doit
   suivre celui que l'user règle (api/_lib/barriere-achat.js). */
const PW = { MARGIN: 1.15, VAT: 1.20, MIN_TTC: 1, MAX_TTC: 8000 };
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

/* ── SOURCES RÉELLEMENT RELEVÉES (TR-006/TR-007) ────────────────────────────
   Un coût ne sert de base à la dérivation ± 20 € ou à l'héritage que s'il porte
   la marque d'UN traqueur — jamais une estimation (qui ne pose aucun
   priceSource de traqueur). Historiquement le seul slug reconnu était
   'cotebrico' ; la mise en réel bascule sur 'idealo', et le comparateur
   couvrira toutes les marques. On reconnaît donc TOUS les slugs de traqueur.
   ⛔ 'cotebrico'/'clickoutil' restent reconnus tant que des overrides Firestore
   les portent encore (données héritées) : les retirer ICI REQUALIFIERAIT ces
   coûts réels en estimations et changerait des prix. Leur retrait propre est un
   lot dédié (audit E), côté DONNÉES, pas ici.
   ⛔ J4 (porte lue) : ceci ne touche PAS le prix de référence des promotions
   (promoAncienPrix = plus bas sur 30 j, calculé ailleurs). Un relevé idealo est
   un vrai prix fournisseur — exactement ce qui doit nourrir le calcul serveur. */
var SOURCES_RELEVEES = { cotebrico: 1, clickoutil: 1, idealo: 1 };
function estSourceRelevee(s) { return !!(s && SOURCES_RELEVEES[s]); }

/* Anti rate-limit : après un blocage détecté du comparateur (Cloudflare), la
   session s'arrête et AUCUN nouveau relevé n'est appliqué pendant plusieurs
   heures — jamais de retry immédiat qui aggraverait le blocage. Deux sessions/
   jour espacées de ~12 h : 3 h saute les retries d'une session bloquée sans
   pénaliser la session planifiée suivante. */
var TRAQUEUR_BACKOFF_MS = 3 * 3600 * 1000;

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
    var real = (estSourceRelevee(o.priceSource) && ovHasCost)
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
  if (o && estSourceRelevee(o.priceSource) && !srcs[o.priceSource]
      && typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0
      && atHeritage > 0) {
    srcs[o.priceSource] = { ttc: o.priceSrcTTC, at: atHeritage };
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
/* ⛔⛔ LE SUFFIXE COMMERCIAL NE FAIT PAS L'IDENTITÉ — INDEX DES RACINES.
   Décision de l'user, 03/08 : « DCE079D1G-QW = DCE079D1G, ce sont exactement
   les mêmes produits […] sur idealo on n'a pas besoin de regarder le suffixe,
   tous les sites qui y sont sont européens ». Mesuré le même jour : 150 de ses
   177 vraies références DeWALT portent un suffixe. Exiger le suffixe exact,
   c'est rater l'article dès que le marchand écrit la référence nue — et c'est
   le cas le plus courant.

   ⛔ DEUX GARDES, ET AUCUNE N'EST FACULTATIVE :
   · une racine ne s'installe JAMAIS par-dessus une référence principale — une
     fiche écrite en toutes lettres l'emporte toujours sur une racine ;
   · une racine réclamée par DEUX fiches différentes est ÉCARTÉE, pas arbitrée.
     Choisir au hasard écrirait le coût d'un article sur la fiche d'un autre.
     Le comptage du 03/08 n'en trouve aucune sur son catalogue ; on le
     revérifie quand même à chaque exécution, parce qu'un catalogue change.
   ⚠️ Portes lues : J3 — des références d'outils publiques ; J4 — aucun prix
   n'entre ici, les caractéristiques bloquantes (coffret, édition limitée)
   continuent de trancher APRÈS ce rapprochement ; J5 — aucune TVA. */
/* ⛔⛔ BORNER SANS MASQUER. Mesuré le 04/08 : une page sur 67 rendait `lues: 60`
   pour `tuiles: 59`. Ce n'est PAS le décompte des lignes qui est faux — c'est le
   compte d'ANCRES qui a raté une tuile, les 66 autres pages en trouvent 60.
   ⛔ Deux fautes symétriques, et il faut éviter les DEUX : ne pas borner laisse
   un instrument surestimer (« un instrument de mesure ne surestime jamais ») ;
   borner en silence efface le symptôme et laisse le sous-comptage d'ancres
   vivre sa vie. On borne, ET l'écart repart dans la réponse.
   ⚠️ Fonction pure, pour être éprouvable seule : le cas ne se reproduit qu'une
   fois sur 67 pages réelles, et une garde qu'on ne peut pas déclencher ne
   garde rien. */
function pwBornerLues(brutes, tuiles) {
  const b = Math.max(0, Number(brutes) || 0);
  const t = Math.max(0, Number(tuiles) || 0);
  if (!t) return { lues: b, ecart: 0 };
  return { lues: Math.min(b, t), ecart: Math.max(0, b - t) };
}

function pwIndexerRacines(produits, index) {
  const parRacine = Object.create(null);
  (produits || []).forEach((p) => {
    if (!p || !p.sku) return;
    const r = priceParse.racineRef(p.sku);
    if (!r || r === String(p.sku).toUpperCase()) return;   // rien à gagner
    (parRacine[r] = parRacine[r] || []).push(p);
  });
  let poses = 0, ecartes = 0;
  Object.keys(parRacine).forEach((r) => {
    const fiches = parRacine[r];
    if (index[r]) return;                       // une réf principale gagne
    if (fiches.length > 1) { ecartes++; return; }   // ambiguë : on n'arbitre pas
    index[r] = fiches[0];
    poses++;
  });
  return { poses: poses, ecartes: ecartes };
}


/* ⛔⛔⛔ TROISIÈME NIVEAU D'APPARIEMENT : LA RACINE DE MODÈLE + LA VARIANTE.
   RÈGLE DE L'USER, 04/08/2026 : « si la référence c'est DCD800, le même
   produit peut avoir N / NT / T / NT-XJ mais c'est le MÊME PRODUIT — chaque
   site nomme comme il veut, il ne respecte pas forcément la nomenclature du
   fournisseur. Et le XJ peut changer, c'est la région ; on ne le regarde
   jamais. »

   ⛔ CE QUI MANQUAIT, MESURÉ : `racineRef` ne retire que le marquage de
   marché, et rend donc QUATRE clés pour un seul produit — `DCD800N`,
   `DCD800NT`, `DCD800T`, `DCD800`. Le traqueur ne pouvait pas reconnaître
   qu'une annonce « DCD800NT-QS » désigne la fiche « DCD800N-XJ » du
   catalogue : en mode réel, les coûts partaient sur des fiches distinctes et
   les prix ne pouvaient pas s'aligner.

   ⛔ ARGENT — CE QUI EMPÊCHE CE NIVEAU D'ÊTRE TROP LARGE. La racine seule
   réunirait aussi les kits (`DCD800D2` = 2 batteries) et les accessoires
   vendus POUR la machine. La VARIANTE, lue dans le titre, les sépare : elle
   dit ce que contient la boîte. Et une racine que PLUSIEURS fiches se
   disputent n'est pas arbitrée — même règle que `pwIndexerRacines`.
   ⚠️ La fiche visée est toujours celle qui porte le prix servi : sur une paire
   de variantes, c'est la face `solo` (la face `coffret` suit par le switch). */
function pwIndexerModeles(produits, index) {
  const parCle = Object.create(null);
  (produits || []).forEach((p) => {
    if (!p || !p.sku) return;
    /* La face coffret ne reçoit pas de coût : elle suit sa version nue. */
    if (p.variantRole === 'coffret') return;
    const cle = priceParse.racineModele(String(p.sku).toUpperCase())
      + '|' + priceParse.varianteProduit(p.title || p.name || '', null, p.sku);
    (parCle[cle] = parCle[cle] || []).push(p);
  });
  let poses = 0, ecartes = 0;
  Object.keys(parCle).forEach((cle) => {
    const fiches = parCle[cle];
    if (fiches.length > 1) { ecartes++; return; }   // ambiguë : on n'arbitre pas
    if (index[cle]) return;
    index[cle] = fiches[0];
    poses++;
  });
  return { poses: poses, ecartes: ecartes };
}

/* La clé de modèle d'une ANNONCE, dans le même vocabulaire que l'index. */
function pwCleModele(item) {
  const ref = String((item && item.sku) || '').toUpperCase();
  if (!ref) return '';
  return priceParse.racineModele(ref) + '|'
    + priceParse.varianteProduit((item && item.name) || '', (item && item.car) || null, ref);
}

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

/* ⛔ UNE SEULE DÉCISION DE GEL, À UN SEUL ENDROIT. Deux raisons — « rupture »
   (le fournisseur ne l'a plus) et « perime » (plus vu depuis la fenêtre de
   fraîcheur, parce que la page change tous les jours) — mais UN comportement :
   on ne touche pas au prix. ⚠️ Écrit en fonction pour être testable : tant que
   la condition vivait en ligne dans le recalcul, un oubli d'un des deux cas
   faisait DISPARAÎTRE le produit du rapport sans qu'aucun sabotage ne morde. */
/* ⛔ TROIS RAISONS DE GELER, UN SEUL COMPORTEMENT — on n'y touche pas, on le
   DIT (« source-retiree » ajoutée le 09/08/2026, D-022). */
function pwEstGel(origin) {
  return origin === 'rupture' || origin === 'perime' || origin === 'source-retiree';
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
    /* ⛔ « RUPTURE » ET « PÉRIMÉ » NE SONT PAS LA MÊME CHOSE, et l'user l'a
       fait apparaître le 03/08 : « les articles sur ces pages peuvent changer
       chaque jour, mais l'URL reste la bonne ». Sa liste est triée par prix ;
       les prix bougent tous les jours ; un article sort donc de la fenêtre
       balayée sans que le fournisseur ait cessé de le vendre. Au bout de
       14 jours son relevé se périme et le produit est GELÉ — c'est juste : un
       coût vieux de deux semaines n'est plus un coût. Mais l'appeler
       « rupture » était FAUX, et un diagnostic faux envoie chercher au
       mauvais endroit. Le gel reste identique ; seule la raison devient vraie.
       ⚠️ Portes lues — J3 : aucune donnée personnelle, on qualifie un état de
       stock. J4 : AUCUN prix ne bouge, un produit gelé reste gelé, et rien
       ici ne sert de prix de référence. J5 : ni TVA ni octroi de mer. */
    /* ⛔ TROISIÈME RAISON DE GELER, ET ELLE A SON NOM (09/08/2026, D-022) : le
       seul relevé vient d'un traqueur RETIRÉ. Ce n'est ni une rupture ni une
       péremption — le produit attend d'être vu par le traqueur en service.
       Même correction que « rupture » → « perime » plus haut : le gel ne
       change pas, la RAISON devient vraie. */
    var pourquoi = priceParse.raisonAucuneSource(pwSourcesConnues(o), Date.now());
    var originGel = pourquoi === 'perime' ? 'perime'
      : (pourquoi === 'source-retiree' ? 'source-retiree' : 'rupture');
    return { srcTTC: null, origin: originGel, raisonGel: pourquoi };
  }
  // ⚠️ Un coût n'est « relevé » que s'il porte priceSource='cotebrico', la
  // marque du traqueur. Sans ce contrôle, un coût ESTIMÉ écrit par un ancien
  // « Appliquer » se faisait passer pour un relevé réel : la supposition
  // devenait définitive et neutralisait le garde-fou coffret.
  if (o && estSourceRelevee(o.priceSource) && typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0) {
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
    const snapReprice = []; // snapshot regroupé (flush ≤4 écritures après la boucle)

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
      /* ⛔ DEUX RAISONS DE GELER, UN SEUL COMPORTEMENT. « rupture » (le
         fournisseur ne l'a plus) et « perime » (plus vu depuis 14 jours,
         parce que la page change tous les jours) gèlent tous les deux le
         prix — c'est la bonne réaction dans les deux cas. Mais elles ne se
         soignent pas pareil : l'une demande de changer de fournisseur,
         l'autre juste de rebalayer. ⚠️ Sans ce `||`, un produit « perime »
         serait tombé dans « coût source inconnu » et aurait DISPARU de la
         liste des gelés — gelé quand même, mais invisible au rapport. */
      if (pwEstGel(srcInfo.origin)) {
        origins.rupture++;
        if (gels.length < 250) {
          gels.push({ sku: p.sku, brand: p.brand || '', name: p.title || p.name,
            raison: srcInfo.raisonGel || srcInfo.origin });
        }
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
        const patchReprice = {
          price: priced.newPrice, price_ht: priced.newHt,
          priceMarkup: priced.markup, priceMode: priced.mode,
          priceCostOrigin: srcInfo.origin, priceRecomputedAt: now
        };
        await db.collection('product_overrides').doc(p.id).set(patchReprice, { merge: true });
        // Snapshot regroupé (comme le balayage) : accumulé, écrit en ≤4 appels
        // après la boucle — jamais un par produit (contention sur 4 documents).
        snapReprice.push({ id: p.id, patch: patchReprice });
      }
      changed.push(rec);
    }

    // Écritures faites : purge le cache pour que le prochain contrôle (et le
    // site public) reparte des prix réels, sans attendre l'expiration.
    if (snapReprice.length) await snapshotLib.majSnapshotBatch(db, admin, snapReprice);
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
/* ══ COMPTEUR DE COUVERTURE D'UN BALAYAGE ════════════════════════════════
   Demande de l'user, 03/08 : « il faut arriver à scanner tout le catalogue
   DeWALT ». La question à trancher n'est pas « combien cette page rend-elle »
   mais « combien de références DISTINCTES un balayage complet ramène-t-il ».
   Une fiche vue sur deux pages ne compte qu'une fois.

   ⛔ ON NE DEVINE PAS UN TOTAL EN MULTIPLIANT. « 67 pages × 25 lus » n'est pas
   une couverture : le comparateur peut chevaucher ses pages, en sauter, ou
   répéter les mêmes fiches. Seul le cumul des références VUES le dit.

   ⚠️ CE COMPTEUR VIT DANS UNE INSTANCE. Vercel peut démarrer une instance
   froide au milieu du balayage, et le cumul repartirait de zéro. C'est
   pourquoi la réponse rend AUSSI `pagesDansLaRafale` : un retour à 1 en plein
   balayage SE VOIT, au lieu de rendre un total faux avec l'air d'être juste.
   ⛔ Alimenté MÊME en mode à sec — c'est tout son intérêt : mesurer la
   couverture des 67 pages sans consommer une seule lecture Firestore.

   ⚠️ PORTES JURIDIQUES, lues avant d'écrire.
   · J3 — n'y transitent QUE des références d'outils et des titres d'annonces
     publiques : aucune donnée personnelle. Minimisation respectée (on garde
     des clés, pas des textes), rétention bornée à 20 min, en mémoire seule,
     jamais persistée, jamais journalisée.
   · J4 — AUCUN PRIX n'entre ici. Ce compteur ne compte que des IDENTITÉS
     d'articles ; il ne peut donc ni annoncer un prix, ni servir de prix de
     référence à une réduction. Le minimum 30 jours reste calculé ailleurs,
     sur le journal réel.
   · J5 — aucune TVA, aucun octroi de mer : le territoire fiscal continue de
     se dériver du code postal, ce compteur n'y touche pas. */
let pwCouv = null;
/* ⛔⛔ QUI COMPTE ? L'INSTANCE ELLE-MÊME, ET ELLE NE LE DISAIT PAS. J'ai lu
   « pagesRefusees: 0 avec 14 manquantes » et j'en ai conclu « les POST ne nous
   atteignent jamais ». Cette conclusion suppose que les 67 requêtes tombent
   dans la MÊME instance — hypothèse que rien ne mesurait. Le cumul vit dans la
   mémoire d'une instance serverless : une instance neuve au milieu du balayage
   repart de zéro et rend le nombre de pages DE LA FIN, sans qu'une seule page
   ait été perdue. 53 = 67 − 14 exactement, et 3 179 tuiles ÷ 53 = 59,98 : ça
   ressemble bien plus à un compteur qui redémarre qu'à quatorze pertes.
   ⛔ Une instance porte donc désormais son IDENTITÉ et sa DATE DE NAISSANCE.
   Comparées à la cadence de la rafale, elles tranchent (voir _lib/diag-rafale).
   ⚠️ J3 : un identifiant de PROCESSUS tiré au sort au démarrage et un
   horodatage. Aucun lien avec une personne, aucune persistance, aucun journal. */
const PW_INSTANCE = {
  id: Math.random().toString(36).slice(2, 10),
  demarrage: Date.now()
};
/* ⛔⛔ « COMBIEN DE PRODUITS ONT ÉTÉ LUS AU TOTAL ? » — LA QUESTION LA PLUS
   SIMPLE, ET AUCUN COMPTEUR N'Y RÉPONDAIT. Le 03/08, après son premier
   balayage complet des 67 pages, je n'ai pas pu la lui dire : ce cumul ne
   comptait que des IDENTITÉS DISTINCTES (1 581 réfs, 1 951 noms). Or il
   demande des TUILES — mot pour mot : « même si sur la même page il existe
   deux fois le même produit, on doit lire les 60 produits de chaque page ».
   Ce sont deux choses différentes, et la sienne est la bonne : une tuile non
   lue est une source de prix perdue, qu'elle fasse doublon ou non.
   ⛔ On cumule donc AUSSI les totaux bruts : ce que les pages contenaient, ce
   qu'on en a rendu. Sans eux la seule réponse honnête était « je ne sais
   pas » — et son raccourci ne garde que la DERNIÈRE des 67 réponses, donc le
   détail des 66 autres est déjà perdu au moment où il me la colle.
   ⚠️ Portes lues : J3 — deux entiers de plus, aucune donnée personnelle, même
   rétention de 20 min en mémoire seule, jamais persistée ; J4 — ce sont des
   COMPTES, aucun prix n'y entre et rien ici ne peut servir de prix de
   référence à une réduction ; J5 — aucune TVA, aucun octroi de mer. */
/* ⛔⛔ NOMMER LES FICHES QUI ONT FAILLI ÊTRE RAPPROCHÉES — SANS ÇA, « 14 »
   N'EST PAS ACTIONNABLE. Mesuré le 03/08 sur son balayage : 163 de ses fiches
   DeWALT retrouvées, 393 jamais vues. Le détail du catalogue montre que 379 de
   ces 393 portent un CODE INTERNE (`AC-00100736`) et non une référence
   constructeur : aucun fournisseur ne les écrira jamais. Restent 14 vraies
   références introuvables — et un écart de 14 qu'on ne sait pas NOMMER se
   termine en supposition (E-113, et avant lui l'écart de 11 « références non
   lues » que j'avais annoncé sans jamais pouvoir dire lesquelles).

   ⛔ CE QUE CETTE FONCTION TRANCHE. Deux causes opposées à une fiche
   introuvable, et un seul remède chacune :
   · le fournisseur écrit la MÊME référence autrement — `DCE530N-XJ` chez lui,
     `DCE530N` chez nous, ou l'inverse. C'est une ÉCRITURE, ça se répare avec
     `srcAltSkus`, et c'est de l'argent : chaque fiche réparée est un coût
     d'achat réel de plus.
   · le fournisseur ne vend pas l'article. Rien à réparer, et surtout rien à
     chercher.
   Le rapprochement par PRÉFIXE normalisé sépare les deux : il ne rend que les
   fiches dont une référence VUE partage le début. Les autres ne remontent pas.

   ⚠️ LIMITE ASSUMÉE : un préfixe commun n'est PAS une preuve d'identité —
   `DCD796` et `DCD7961` peuvent être deux outils. Cette liste dit « à
   vérifier », jamais « à écrire ». ⛔ Aucun `srcAltSkus` ne se déclare sans
   contrôle du CONTENU (nu contre pack) : c'est la mise en garde de l'user, un
   prix de pack sur un outil nu corromprait le coût.
   ⚠️ FONCTION PURE. Portes lues : J3 — ne circulent ici que des références
   d'outils publiques, aucune donnée personnelle, rien de persisté ; J4 — AUCUN
   prix n'y entre ni n'en sort, elle ne peut donc pas fabriquer un prix de
   référence ; J5 — aucune TVA, aucun octroi de mer. */
/* ══ LES BAISSES D'UN BALAYAGE, CUMULÉES SUR SES 67 PAGES ═══════════════════
   Demande de l'user, 03/08 : « la moyenne de baisse qu'on a pu faire pour tous
   ces produits », et « dix produits qui auront une baisse la plus élevée, je
   vais aller les vérifier AVANT de modifier les prix de la boutique ».

   ⛔ SA PHRASE EST LE CAHIER DES CHARGES : vérifier AVANT d'écrire. Ce cumul
   est donc fait pour être lu en `&dryRun=1` — le mode qui calcule les nouveaux
   prix et n'en écrit aucun. Il fonctionne aussi sur un vrai relevé, mais c'est
   l'ordre inverse de celui qu'il a demandé.
   ⛔ POURQUOI UN CUMUL, ET PAS UNE LECTURE PAGE PAR PAGE : son raccourci ne lui
   rend que la DERNIÈRE des 67 réponses. Les dix plus fortes baisses du
   balayage ne sont pas les dix plus fortes de la dernière page — sans cumul,
   la question n'a tout simplement pas de réponse.
   ⚠️ On ne compte QUE ce que le traqueur a validé (`applied`). Un prix écarté
   (`flagged`, hors fourchette) n'est pas une baisse : le faire entrer dans une
   moyenne la ferait mentir dans le sens qui plaît.
   ⚠️ Un produit vu sur deux pages ne compte qu'une fois — même article, même
   résultat ; deux fois pondérerait la moyenne au hasard.
   ⛔ LES HAUSSES SONT COMPTÉES AUSSI, et rendues. Il demande les baisses ; ne
   montrer que les baisses ferait d'un rapport un argumentaire.

   ⚠️ PORTE J4 LUE (`node scripts/juridique.js J4`). L'obligation : le prix
   annoncé doit être exact et complet, et une réduction annoncée se réfère au
   prix le plus bas pratiqué sur les 30 jours précédents. Ce cumul est HORS de
   ce chemin : il ne fixe aucun prix, n'en annonce aucun, et ne fait que
   RÉCAPITULER ce que le traqueur a déjà calculé, pour qu'il soit vérifié avant
   d'être écrit. ⛔ « ancien » n'est PAS un prix de référence au sens de cette
   règle — c'est l'état actuel de la fiche. Le minimum 30 jours se calcule
   ailleurs, sur le journal réel. Rien de ce qui sort d'ici ne doit servir à
   barrer un prix ni à afficher une réduction.
   ⚠️ J3 — aucune donnée personnelle : des références, des noms d'outils, des
   montants. J5 — aucune TVA ni octroi de mer ne se décide ici, le territoire
   fiscal continue de se dériver du code postal. */
/* ⛔⛔ OUVRIR LA RAFALE AVANT D'ÉCRIRE, PAS APRÈS. Le cumul de couverture était
   alimenté à la FIN du traitement d'une page : la rafale n'existait donc pas
   encore pendant que la page 1 écrivait ses prix. Or c'est PENDANT l'écriture
   qu'il faut savoir si la fiche a déjà été vue moins cher dans ce balayage.
   Cette fonction porte la création et la remise à zéro ; `pwCouvAjouter` s'en
   sert, et le chemin d'écriture aussi.
   ⚠️ Portes lues : J3 — des références d'outils et des compteurs, aucune donnée
   personnelle, rien de persisté ; J4 — voir `pwRafaleCoutMin` ; J5 — aucune
   TVA, aucun octroi de mer. */
function pwRafaleOuvrir(brand, pagesDuPlan, nowMs) {
  const pagesPlan = Math.max(0, parseInt(pagesDuPlan, 10) || 0);
  if (pwCouv && pagesPlan > 0 && pwCouv.pages >= pagesPlan) pwCouv = null;
  if (!pwCouv || (nowMs - pwCouv.at) > PW_SCAN_TTL || pwCouv.brand !== brand) {
    pwCouv = { brand: brand, refs: Object.create(null), noms: Object.create(null),
      empreintes: Object.create(null), fiches: Object.create(null),
      baisses: Object.create(null), coutMin: Object.create(null),
      pages: 0, tuiles: 0, lues: 0, debut: nowMs, at: nowMs };
  }
  return pwCouv;
}

/* ⛔⛔ DANS UNE MÊME RAFALE, ON GARDE LE COÛT LE MOINS CHER — JAMAIS LE DERNIER
   VU. Décision de l'user, 03/08, mot pour mot : « c'est totalement normal qu'il
   y ait le même produit plusieurs fois, on peut même le retrouver jusqu'à 10
   fois car ils comparent plus de 15 sites différents […] on récupère TOUJOURS
   le moins cher ».
   ⛔ Mesuré sur son balayage du même jour (67 pages) : CINQ fiches atteintes
   deux fois avec des coûts très écartés — `dewalt-dch273nt-xj` à 226,04 € puis
   341,22 €, `dewalt-dcn660n-xj` à 311,83 € puis 349,38 €. La carte des sources
   était ÉCRASÉE à chaque page : le prix final dépendait de QUELLE PAGE ÉTAIT
   PASSÉE EN DERNIER. Sur DCH273NT, 323,92 € ou 465,77 € au tirage au sort de
   la pagination — pour le même outil, le même jour.

   ⛔ LA MÉMOIRE EST CELLE DE LA RAFALE, PAS UNE COMPARAISON DE DATES. Un
   premier essai bornait le minimum aux entrées « écrites après le début de la
   rafale » : il mordait aussi sur des relevés DÉJÀ EN BASE, et faisait tomber
   une garde existante (E-228). Ce qui compte n'est pas quand l'entrée a été
   écrite, c'est si c'est CE balayage qui l'a écrite — donc on s'en souvient
   explicitement, fiche par fiche.
   ⚠️ Hors rafale, une hausse réelle du fournisseur doit pouvoir remonter le
   coût : un minimum éternel ferait vendre à perte le jour où le fournisseur
   augmente, et ce serait contraire à D-015 — le traqueur lit ce que la page
   AFFICHE, c'est exactement ce que l'user paiera.

   ⚠️ PORTE J4 LUE. Le prix annoncé doit être exact et complet ; une réduction
   se réfère au prix le plus bas des 30 jours précédents. Ici on ne fabrique
   aucun prix de référence : on retient le COÛT D'ACHAT le plus bas parmi ceux
   que le comparateur affiche pour le même article — celui que l'user paierait
   réellement. Le minimum 30 jours reste calculé ailleurs, sur le journal réel. */
function pwRafaleCoutMin(brand, id, src) {
  const cout = Number(src);
  if (!pwCouv || pwCouv.brand !== brand || !isFinite(cout) || cout <= 0) return src;
  const m = pwCouv.coutMin || (pwCouv.coutMin = Object.create(null));
  const clef = String(id || '');
  const ancien = Number(m[clef]);
  const retenu = (isFinite(ancien) && ancien > 0) ? Math.min(ancien, cout) : cout;
  m[clef] = retenu;
  return retenu;
}

const PW_TOP_BAISSES = 10;
function pwBaissesAjouter(store, recs) {
  (recs || []).forEach(function (r) {
    if (!r) return;
    const anc = Number(r.oldPrice), nouv = Number(r.newPrice);
    if (!isFinite(anc) || !isFinite(nouv) || anc <= 0) return;
    const k = String(r.sku || r.id || '').toUpperCase();
    if (!k) return;
    store[k] = {
      sku: r.sku, nom: String(r.name || '').slice(0, 90),
      ancien: Math.round(anc * 100) / 100,
      nouveau: Math.round(nouv * 100) / 100,
      euros: Math.round((anc - nouv) * 100) / 100,
      pct: Math.round(((anc - nouv) / anc) * 1000) / 10
    };
  });
}
function pwBaissesBilan(store, combien) {
  const tous = Object.keys(store || {}).map(function (k) { return store[k]; });
  if (!tous.length) return null;
  const enBaisse = tous.filter(function (x) { return x.euros > 0.005; });
  const enHausse = tous.filter(function (x) { return x.euros < -0.005; });
  const somPct = enBaisse.reduce(function (s, x) { return s + x.pct; }, 0);
  const somEur = enBaisse.reduce(function (s, x) { return s + x.euros; }, 0);
  /* ⛔ CLASSÉ PAR POURCENTAGE, PAS PAR EUROS. Une baisse de 400 € sur une
     machine à 5 000 € est banale ; une baisse de 60 % est soit une aubaine,
     soit une erreur de lecture — et c'est celle-là qu'il doit aller voir en
     premier. Les deux chiffres figurent sur chaque ligne. */
  const top = enBaisse.slice().sort(function (a, b) {
    return (b.pct - a.pct) || (b.euros - a.euros);
  }).slice(0, Math.max(1, combien || PW_TOP_BAISSES));
  return {
    produitsCompares: tous.length,
    enBaisse: enBaisse.length,
    enHausse: enHausse.length,
    baisseMoyennePct: enBaisse.length ? Math.round((somPct / enBaisse.length) * 10) / 10 : null,
    baisseMoyenneEuros: enBaisse.length ? Math.round((somEur / enBaisse.length) * 100) / 100 : null,
    plusFortesBaisses: top
  };
}

/* Assez pour porter TOUT ce qui manque sur sa marque la plus fournie — mesuré
   le 03/08 : 620 fiches MAKITA, 556 DeWALT — sans qu'un catalogue qui triple
   fasse exploser la réponse.
   ⛔ ET UNE TRONCATURE SE DIT. Un premier réglage à 600 coupait la liste MAKITA
   à 600 pour un compte de 619, et RIEN ne le signalait : le rapport se lisait
   « voici tout ce qui manque » en ayant tu 19 fiches. Un plafond silencieux
   ment exactement comme un compteur faux. La réponse porte donc
   `fichesJamaisVuesListeTronquee`, et une porte l'exige. */
const PW_MANQUANTS_MAX = 1200;
const PW_QUASI_MAX = 60;
function pwQuasiRapprochements(skusMarque, fichesVues, refsVues) {
  if (!Array.isArray(skusMarque) || !skusMarque.length) return null;
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  /* Index des références VUES par leurs six premiers signes : sans lui, 556
     fiches × 1 559 références font 867 000 comparaisons À CHAQUE PAGE. */
  const index = Object.create(null);
  Object.keys(refsVues || {}).forEach((r) => {
    const n = norm(r);
    if (n.length < 5) return;
    const k = n.slice(0, 6);
    (index[k] = index[k] || []).push({ brut: r, norm: n });
  });
  const exemples = [];
  let nb = 0;
  skusMarque.forEach((sku) => {
    if ((fichesVues || {})[String(sku).toUpperCase()]) return;   // déjà rapprochée
    const n = norm(sku);
    if (n.length < 5) return;
    const cands = index[n.slice(0, 6)];
    if (!cands) return;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (c.norm.indexOf(n) === 0 || n.indexOf(c.norm) === 0) {
        nb += 1;
        if (exemples.length < PW_QUASI_MAX) exemples.push({ fiche: sku, refVue: c.brut });
        break;
      }
    }
  });
  return { nb: nb, exemples: exemples };
}

/* ⚠️ `extra` porte ce qui s'est ajouté après coup — empreinte de page, articles
   RAPPROCHÉS d'une fiche, taille du catalogue de la marque. Un objet plutôt
   qu'une file de paramètres positionnels : au septième, une inversion d'ordre
   ne se voit plus.
   ⚠️ Portes lues avant d'écrire : J3 — n'y entrent que des références d'outils
   publiques et des compteurs, aucune donnée personnelle, rien de persisté ;
   J4 — AUCUN PRIX n'entre dans ce cumul : il compte des IDENTITÉS d'articles,
   il ne peut donc ni annoncer un prix, ni servir de prix de référence à une
   réduction ; J5 — aucune TVA, aucun octroi de mer, le territoire fiscal
   continue de se dériver du code postal. */
function pwCouvAjouter(brand, skus, titres, nbTuiles, nbLues, pagesDuPlan, extra) {
  const nowMs = Date.now();
  extra = extra || {};
  const empreinte = extra.empreinte;
  /* ⛔⛔ UNE NOUVELLE RAFALE REPART DE ZÉRO — SINON LE TOTAL GONFLE À CHAQUE
     ESSAI. Mesuré le 03/08 sur son deuxième balayage : `pagesDansLaRafale:
     120` au lieu de 67, parce que les deux lancements sont tombés dans la
     même fenêtre de vingt minutes et se sont additionnés. Le chiffre par page
     restait juste, mais le total, lui, ne voulait plus rien dire — et c'est
     le total qu'il lit.
     ⛔ Le plan sait combien de pages il compte. Dès qu'on les a toutes vues,
     la page suivante ouvre une rafale neuve. Aucune horloge, aucun réglage :
     la borne vient du plan lui-même. */
  const pagesPlan = Math.max(0, parseInt(pagesDuPlan, 10) || 0);
  pwRafaleOuvrir(brand, pagesDuPlan, nowMs);
  pwCouv.at = nowMs;
  pwCouv.pages += 1;
  if (empreinte) pwCouv.empreintes[String(empreinte)] = 1;
  /* ⛔⛔ COMBIEN DE SES FICHES LE BALAYAGE A-T-IL RETROUVÉES ? La question qu'il
     a posée le 03/08 — « où sont les produits ? » — et à laquelle AUCUN
     compteur ne répondait. Le cumul comptait les tuiles de la PAGE et les
     références VUES ; il ne comptait pas les RAPPROCHEMENTS avec son catalogue.
     Or c'est le seul chiffre qui dise si un balayage sert à quelque chose : une
     référence vue chez le fournisseur mais absente de ses fiches ne fera jamais
     bouger un prix. `reconnus: 0` s'affichait page par page, et une page peut
     légitimement n'en avoir aucun — sur les 67, l'absence de cumul rendait la
     question SANS RÉPONSE POSSIBLE.
     ⚠️ J4 : ce sont des IDENTITÉS d'articles rapprochées, aucun prix n'entre
     ici et rien ne peut servir de prix de référence à une réduction. */
  (extra.reconnus || []).forEach(function (s) {
    if (s) pwCouv.fiches[String(s).toUpperCase()] = 1;
  });
  pwCouv.tuiles += Math.max(0, parseInt(nbTuiles, 10) || 0);
  pwCouv.lues += Math.max(0, parseInt(nbLues, 10) || 0);
  (skus || []).forEach(function (s) { if (s) pwCouv.refs[String(s).toUpperCase()] = 1; });
  (titres || []).forEach(function (n) {
    var k = String(n || '').trim().toLowerCase();
    if (k) pwCouv.noms[k] = 1;
  });
  pwBaissesAjouter(pwCouv.baisses, extra.baisses);
  if (Array.isArray(extra.skusMarque)) pwCouv.skusMarque = extra.skusMarque;
  if (Array.isArray(extra.fichesDetail)) pwCouv.fichesDetail = extra.fichesDetail;
  const quasi = pwQuasiRapprochements(pwCouv.skusMarque, pwCouv.fiches, pwCouv.refs);
  const nbDistinctes = Object.keys(pwCouv.empreintes).length;
  const base = nbDistinctes || pwCouv.pages;
  const manquantes = pagesPlan ? Math.max(0, pagesPlan - base) : null;
  /* ⛔ LA CAUSE, PAS SEULEMENT LE CHIFFRE. Un « il manque 14 pages » sans cause
     se termine toujours en supposition — et j'en ai déjà écrit une fausse. */
  const explication = diagRafale.expliquerRafale({
    pagesDansLaRafale: base,
    pagesManquantes: manquantes,
    pagesRefusees: pwCouv.refus || 0,
    debutRafale: pwCouv.debut,
    finRafale: pwCouv.at,
    demarrageInstance: PW_INSTANCE.demarrage
  });
  return {
    pagesDansLaRafale: pwCouv.pages,
    /* ⛔⛔ COMBIEN DE PAGES LE PLAN EN ATTENDAIT — SANS ÇA, « 64 » A L'AIR
       D'UN SUCCÈS. Mesuré le 03/08 sur son balayage : `pagesDansLaRafale: 64`
       pour un plan de 67. Les tuiles par page étaient parfaites (3 838 ÷ 64 =
       59,97), donc RIEN ne signalait que TROIS PAGES n'avaient jamais atteint
       le serveur — requête échouée chez idealo, ou POST refusé avant d'entrer
       ici. Un compteur qui ne dit pas ce qu'il attendait ne peut pas dire
       qu'il manque quelque chose.
       ⚠️ J4 : trois pages absentes, ce sont ~180 sources de prix jamais vues,
       donc des coûts d'achat qui restent au niveau précédent sans raison. */
    pagesAttendues: pagesPlan || null,
    /* ⛔⛔ COMBIEN DE PAGES DIFFÉRENTES, PAS COMBIEN DE REQUÊTES. `pages` ne
       comptait que des POST acceptés : la même page envoyée deux fois valait
       deux pages, et le trou correspondant disparaissait du compte. Depuis
       `empreintePage`, une page porte une identité tirée de son contenu — le
       raccourci, lui, ne dit jamais laquelle il envoie.
       ⚠️ `null` quand aucune empreinte n'a pu être calculée : on le dit au
       lieu de rendre un zéro qui aurait l'air d'une mesure. */
    pagesDistinctes: nbDistinctes || null,
    pagesEnDouble: nbDistinctes ? Math.max(0, pwCouv.pages - nbDistinctes) : null,
    /* ⛔ LE MANQUE SE COMPTE SUR LES PAGES DIFFÉRENTES. Le compter sur les
       requêtes ferait disparaître un trou dès qu'une page part en double. */
    pagesManquantes: manquantes,
    /* ⛔ CE CHIFFRE NOMME UNE CAUSE, IL N'EN ÉLIMINE PAS DEUX. `> 0` ⇒ la page
       est ARRIVÉE VIDE (le fournisseur n'a rien rendu, le POST est parti quand
       même) : c'est MESURÉ, et ça se corrige côté lecture de la page.
       ⛔⛔ MAIS `= 0` AVEC DES MANQUANTES NE VEUT PAS DIRE « le POST ne nous a
       jamais atteints ». C'est exactement ce que j'avais écrit ici le 03/08, et
       c'était FAUX (E-113) : cette lecture suppose que les 67 requêtes tombent
       dans la MÊME instance. Le cumul vit dans la mémoire d'UNE instance — une
       instance neuve en plein balayage repart de zéro et rend le nombre de
       pages DE LA FIN, sans qu'une seule page ne se perde. Il reste donc TROIS
       causes possibles, et c'est `cause` ci-dessous qui tranche, sur la cadence
       de la rafale. */
    pagesRefusees: pwCouv.refus || 0,
    /* ⛔ LES DEUX CHIFFRES QU'IL DEMANDE, dans cet ordre : ce que les pages
       contenaient, ce qu'on en a lu. Doublons COMPRIS — c'est voulu. */
    tuilesVues: pwCouv.tuiles,
    lignesLues: pwCouv.lues,
    refsDistinctes: Object.keys(pwCouv.refs).length,
    nomsDistincts: Object.keys(pwCouv.noms).length,
    /* ⛔⛔ « OÙ SONT LES PRODUITS ? » — SA QUESTION, ET VOICI LES TROIS CHIFFRES
       QUI Y RÉPONDENT. `fichesDeLaMarque` : ce que SON catalogue contient pour
       cette marque. `fichesRetrouvees` : combien le balayage en a rapprochées.
       `fichesJamaisVues` : la différence, et c'est elle qui dit ce qui reste
       sans coût d'achat relevé.
       ⚠️ `null` tant que l'appelant ne dit pas la taille de son catalogue : on
       ne rend pas un zéro qui aurait l'air d'une mesure. */
    fichesDeLaMarque: extra.fichesMarque != null ? extra.fichesMarque : null,
    fichesRetrouvees: Object.keys(pwCouv.fiches).length,
    fichesJamaisVues: extra.fichesMarque != null
      ? Math.max(0, extra.fichesMarque - Object.keys(pwCouv.fiches).length) : null,
    /* ⛔⛔ …ET LESQUELLES ONT FAILLI L'ÊTRE, NOMMÉES. Un écart chiffré se
       suppose, un écart nommé se corrige. Chaque ligne ici est une fiche dont
       une référence VUE chez le fournisseur partage le début : soit la même
       référence écrite autrement (réparable par `srcAltSkus`, donc un coût
       d'achat réel de plus), soit un homonyme à écarter. Les fiches sans aucun
       voisin ne remontent pas — le fournisseur ne les vend pas, il n'y a rien
       à chercher.
       ⚠️ « À vérifier », jamais « à écrire » : un préfixe commun n'est pas une
       preuve d'identité, et un prix de pack sur un outil nu corromprait le
       coût. Le contrôle du contenu reste obligatoire. */
    /* ⛔⛔ LA LISTE NOMMÉE DE CE QUI N'A PAS ÉTÉ TROUVÉ. Sa demande du 03/08 :
       « je veux la liste des produits qui n'ont pas été trouvés, je vais aller
       chercher sur idealo pour vérifier s'ils n'y sont pas vraiment ». Le
       compteur disait 333 ; il ne disait PAS lesquelles — donc il ne permettait
       aucune vérification. Un écart chiffré se suppose, un écart nommé se va
       chercher.
       ⛔ ELLE NE SORT QUE SUR `&manquants=1`. Rendue à chaque page, elle
       pèserait des centaines de lignes × 67 pages — et le mode bref existe
       précisément parce que 3,4 millions de signes ne se collent pas sur un
       iPad. Une seule réponse suffit à la lire : c'est un cumul de rafale.
       ⚠️ `sku` ET `nom` : une référence seule ne se cherche pas sur un
       comparateur, il faut le libellé pour reconnaître l'article.
       ⚠️ Portes lues : J3 — des références et des libellés d'outils, aucune
       donnée personnelle ; J4 — aucun prix n'y figure ; J5 — aucune TVA,
       aucun octroi de mer. */
    fichesJamaisVuesDetail: (extra.manquants && Array.isArray(pwCouv.fichesDetail))
      ? pwCouv.fichesDetail
        .filter(function (f) { return !pwCouv.fiches[String(f.sku).toUpperCase()]; })
        .slice(0, PW_MANQUANTS_MAX)
      : undefined,
    /* ⛔ UNE TRONCATURE SE DIT. Sans ce drapeau, une liste coupée se lit
       « voici tout ce qui manque » — et l'user cherche 600 produits en croyant
       les avoir tous. Le compte, lui, reste juste : c'est l'écart entre les
       deux qui doit être NOMMÉ, jamais laissé à deviner. */
    fichesJamaisVuesListeTronquee: (extra.manquants && Array.isArray(pwCouv.fichesDetail))
      ? (pwCouv.fichesDetail
        .filter(function (f) { return !pwCouv.fiches[String(f.sku).toUpperCase()]; })
        .length > PW_MANQUANTS_MAX)
      : undefined,
    fichesQuasiRapprochees: quasi ? quasi.nb : null,
    fichesQuasiRapprocheesDetail: quasi ? quasi.exemples : null,
    /* ⛔⛔ CE QUE LE BALAYAGE FERAIT AUX PRIX, CUMULÉ SUR SES 67 PAGES — et les
       dix à vérifier AVANT d'écrire quoi que ce soit. `null` en mode à sec :
       aucun prix n'y est calculé, et rendre un zéro laisserait croire à une
       mesure. C'est `&dryRun=1` qui remplit ce bloc sans rien écrire. */
    baisses: pwBaissesBilan(pwCouv.baisses, PW_TOP_BAISSES),
    /* ⛔⛔ QUI A COMPTÉ, ET DEPUIS QUAND. Sans ces deux valeurs, un cumul
       amputé par une instance neuve est indiscernable d'un cumul amputé par
       des pages perdues — et les deux remèdes sont opposés. Si l'identifiant
       change d'une page à l'autre du MÊME balayage, le cumul est éclaté entre
       plusieurs instances et il ne faut PAS le lire comme un total. */
    instance: PW_INSTANCE.id,
    instanceAgeSecondes: Math.round((nowMs - PW_INSTANCE.demarrage) / 1000),
    rafaleSecondes: Math.round((pwCouv.at - pwCouv.debut) / 1000),
    cadenceSecondes: explication.cadenceSecondes,
    cause: explication.cause,
    lecture: explication.lecture
  };
}
/* ⛔⛔ COMPTER LES PAGES QUI ARRIVENT VIDES. Elles repartent en 400 sans
   toucher au cumul, donc elles étaient jusqu'ici INDISCERNABLES des pages qui
   ne sont jamais arrivées — et les deux appellent des remèdes opposés.
   ⚠️ On n'incrémente PAS `pages` : une page vide n'a rien apporté, la compter
   comme lue gonflerait le total et masquerait le trou. Elle a son compteur à
   elle, et c'est l'écart entre les deux qui parle. */
function pwCouvRefus(brand) {
  const nowMs = Date.now();
  if (!pwCouv || (nowMs - pwCouv.at) > PW_SCAN_TTL || pwCouv.brand !== brand) {
    pwCouv = { brand: brand, refs: Object.create(null), noms: Object.create(null),
      empreintes: Object.create(null), fiches: Object.create(null),
      baisses: Object.create(null),
      pages: 0, tuiles: 0, lues: 0, refus: 0, debut: nowMs, at: nowMs };
  }
  pwCouv.at = nowMs;
  pwCouv.refus = (pwCouv.refus || 0) + 1;
  return pwCouv.refus;
}
function pwScanReset() { pwScanCache = null; pwCouv = null; }

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
    // Mode d'essai à coût nul — voir le bloc « MODE À SEC » plus bas.
    const secMode = body.sec === true || (req.query && (req.query.sec === '1' || req.query.sec === 'true'));
    /* ⛔ MODE BILAN : les compteurs et les écarts, pas le détail produit par
       produit. Mesuré le 03/08 : une réponse pleine fait 50 480 signes, dont
       93 % de détail — sur 67 pages ça fait 3,4 millions de signes, que son
       iPad ne peut ni écrire ni recopier. Ses mots : « je ne pourrai pas te
       coller 10 000 produits ». Le détail reste accessible sans le drapeau. */
    const bref = body.bref === true || (req.query && (req.query.bref === '1' || req.query.bref === 'true'));
    /* ⛔ `&manquants=1` : la LISTE NOMMÉE des fiches de la marque qu'aucune page
       du balayage n'a retrouvées. Hors de ce drapeau elle ne sort pas — 333
       lignes rendues 67 fois seraient incollables, et c'est exactement le
       problème que `bref` a réglé. */
    const manquants = body.manquants === true
      || (req.query && (req.query.manquants === '1' || req.query.manquants === 'true'));
    /* ⛔ `&inconnus=1` : les références VUES chez le fournisseur qu'aucune fiche
       du catalogue n'a réclamées, avec leur TITRE. Sans elles, « pourquoi cette
       référence n'est-elle pas reconnue ? » n'a pas de réponse — le mode
       balayage vide `unknown` pour tenir dans un presse-papier, et j'ai buté
       dessus le 04/08 : compteur à 1 456, liste à 0.
       ⚠️ Le presse-papier n'est plus le canal : il enregistre dans un FICHIER,
       page par page. Mesuré : 1 456 inconnus sur 67 pages, soit ~22 par page —
       quelques Ko. Le drapeau reste explicite pour que le balayage courant ne
       s'alourdisse pas sans qu'on l'ait voulu. */
    const inconnusVoulus = body.inconnus === true
      || (req.query && (req.query.inconnus === '1' || req.query.inconnus === 'true'));
    /* ── IDENTITÉ DE LA SOURCE (01/08/2026) ─────────────────────────────────
       Un deuxième site va être traqué, puis d'autres : chaque raccourci passe
       `&source=<slug>`. Sans le paramètre : 'idealo' (mise en réel 08/08/2026 —
       cotebrico/clickoutil retirés) ; le Raccourci iPad envoie &source=idealo
       explicitement. ⛔ Le slug devient une CLÉ Firestore : alphabet
       fermé, longueur bornée — rien d'arbitraire n'entre en base.
       ⚠️ Calculé AVANT TOUT RETOUR, erreurs comprises : le premier essai
       clickoutil a rendu un JSON muet sur la source qui tournait —
       indiagnosticable. */
    const sourceSlug = (String((req.query && req.query.source) || 'idealo')
      .toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)) || 'idealo';

    /* Statut HTTP que le Raccourci a reçu du comparateur (facultatif) : s'il est
       envoyé (&status=403|429|1015…), il fait AUTORITÉ pour détecter un blocage,
       avant même de regarder le contenu. */
    const httpStatus = Number((req.query && req.query.status) || body.status) || 0;

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
      /* ⛔⛔ UNE PAGE REFUSÉE SE COMPTE — SINON ELLE EST INDISCERNABLE D'UNE
         PAGE JAMAIS ARRIVÉE. Mesuré sur ses deux balayages : 64 pages sur 67,
         puis 65 sur 67. Le nombre VARIE, donc c'est intermittent — mais rien
         ne disait laquelle des deux causes : soit le fournisseur n'a rien
         rendu et le POST est parti vide (il arrive ici et repart en 400 sans
         laisser la moindre trace), soit le POST n'a jamais atteint le serveur.
         ⛔ Ce compteur nomme UNE cause : `pagesRefusees > 0` ⇒ les pages
         ARRIVENT mais vides, le remède est côté lecture. C'est mesuré.
         ⛔⛔ IL N'EN NOMME PAS DEUX. J'avais écrit ici que `= 0` avec des pages
         manquantes signifiait « le POST se perd avant nous » : c'était FAUX
         (E-113). Cette lecture ne tient que si les 67 requêtes tombent dans la
         MÊME instance, et rien ne le mesurait — une instance neuve en plein
         balayage remet le cumul à zéro sans qu'une page ne se perde. La
         troisième cause se tranche sur la cadence (`_lib/diag-rafale.js`), et
         le TOTAL, lui, ne doit plus rien à aucune instance : il se calcule sur
         le fichier des réponses (`scripts/bilan-balayage.js`).
         ⚠️ Portes lues : J3 — un entier, aucune donnée personnelle, rien
         conservé au-delà de la fenêtre de rafale ; J4 — aucun prix n'entre
         ici ; J5 — aucune TVA, aucun octroi de mer. */
      pwCouvRefus(String((req.body && req.body.brand)
        || (req.query && req.query.brand) || 'DEWALT').toUpperCase());
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

    /* ── BLOCAGE DU COMPARATEUR (anti rate-limit, 08/08/2026) ─────────────────
       Cloudflare a rate-limité pendant les essais : au lieu d'une page produit
       on reçoit un challenge / 403 / 429 / 1015. Ce n'est PAS un catalogue vide
       — c'est un mur. On l'ARRÊTE : aucune écriture, on pose le backoff, on lève
       une alerte admin (doc agrégé `config/traqueur_etat`, 1 écriture).
       ⛔ Faux positif = poison : on ne bloque sur le CONTENU que si la page n'a
       rien donné (parsed 0) ; un statut HTTP de blocage, lui, fait autorité même
       si par malheur des tuiles étaient lisibles. Un run à sec / dryRun ne
       touche JAMAIS Firestore : il renvoie le blocage sans écrire. */
    const raisonBlocage = priceParse.detecterBlocage(text, httpStatus);
    if (raisonBlocage && (httpStatus >= 400 || !parsed.length)) {
      const maintenantBlocage = Date.now();
      const backoffJusqu = maintenantBlocage + TRAQUEUR_BACKOFF_MS;
      if (!secMode && !dryRun) {
        try {
          await db.collection('config').doc('traqueur_etat').set(
            { bloqueDepuis: maintenantBlocage, raisonBlocage: raisonBlocage, backoffJusqu: backoffJusqu,
              source: sourceSlug, brand: brand }, { merge: true });
        } catch (e) { /* l'alerte ne doit pas masquer le blocage lui-même */ }
      }
      return res.status(200).json({
        ok: false, bloque: true, raison: raisonBlocage, brand: brand, source: sourceSlug,
        backoffJusqu: backoffJusqu, sec: secMode || undefined,
        note: 'comparateur bloque (' + raisonBlocage + ') — aucune ecriture, backoff pose'
      });
    }
    /* ⛔⛔ ARGENT — « AUCUNE FICHE » N'EST PAS « RIEN RECONNU ». Ce test ne
       regardait que `items` : une page faite UNIQUEMENT d'annonces marchandes
       repartait en « aucun produit reconnu », et ses annonces — leurs prix
       compris — étaient jetées sans une trace. Trouvé le 03/08 par la porte,
       sur un corpus de deux offres et zéro fiche. Sur ses vraies pages il y a
       toujours des fiches ; le défaut attendait le premier jour où il n'y en
       aurait pas.
       ⛔ On ne rend « rien reconnu » que si on n'a RIEN — ni fiche, ni
       annonce. Sinon on continue : une annonce écartée reste une annonce
       listée, avec son prix. */
    if (!parsed.length && !(auto.sansRef || []).length) {
      /* Rien de reconnu — mais la page est LÀ, entre nos mains : on la mesure
         au lieu de la jeter. Le diagnostic dit laquelle des hypothèses du
         parseur casse sur ce site (séparateur de cartes, motif réf, motif
         prix), avec trois extraits bruts de la page fournisseur. C'est la
         SEULE voie d'apprentissage d'un format inconnu : ces sites sont
         injoignables depuis le dépôt (CONNECT 403, mesuré), et deviner un
         balisage est interdit (O6). Aucune donnée personnelle ici : la page
         est une grille produits publique. */
      /* ⛔⛔ AVANT TOUT AUTRE DIAGNOSTIC : EST-CE MA PROPRE RÉPONSE ?
         Mesuré le 03/08 sur son premier balayage des 67 pages —
         `octetsRecus: 1195` là où une page en fait treize mille, et les trois
         extraits étaient du JSON `{"ok":true,…}` ré-échappé à chaque tour.
         Dans le raccourci, le champ `text` du POST pointait sur « Contenu de
         l'URL », une variable qui au tour suivant désigne la sortie du POST
         PRÉCÉDENT et non la page qu'on vient de lire.
         ⛔ Le diagnostic générique répondait alors « la marque apparaît 5×
         mais jamais suivie d'une référence — ce site écrit ses titres
         autrement » : exact sur le texte reçu, et une piste TOTALEMENT
         fausse. Elle envoie chercher dans le parseur un défaut qui est dans
         le câblage du raccourci. Un diagnostic qui désigne le mauvais
         coupable coûte plus cher que pas de diagnostic.
         ⚠️ Portes lues : J3 — on ne rend qu'une longueur et un mode d'emploi,
         aucun extrait du corps reçu, donc aucune donnée personnelle même si
         le raccourci envoyait n'importe quoi ; J4 — aucun prix n'entre ici ;
         J5 — aucune TVA, aucun octroi de mer. */
      if (priceParse.estMaPropreReponse(text)) {
        return res.status(200).json({
          ok: true, brand, source: sourceSlug, parsed: 0, format: 'boucle',
          /* ⛔ CE MARQUEUR N'EST PAS DÉCORATIF : sans lui, cette réponse-ci ne
             se reconnaît pas elle-même quand le raccourci me la renvoie au
             tour suivant. Mesuré le 03/08 — le message d'aide sortait UNE
             fois, puis le tour d'après retombait sur le diagnostic générique
             qui accuse le parseur. L'user recevait la mauvaise piste juste
             après la bonne. Une réponse qui décrit un défaut doit survivre à
             son propre aller-retour. */
          boucleDetectee: true,
          note: '⛔ LE RACCOURCI M\'A RENVOYÉ MA PROPRE RÉPONSE, pas la page. '
            + 'Dans l\'action POST, le champ « text » pointe sur « Contenu de l\'URL » — '
            + 'or au tour suivant cette variable désigne la sortie du POST précédent. '
            + 'Remède : juste après l\'action qui lit la page (dans la boucle), ajouter '
            + '« Définir une variable » nommée par exemple `page`, puis mettre CETTE '
            + 'variable dans le champ « text » du POST. Rien d\'autre à changer.',
          octetsRecus: String(text || '').length
        });
      }
      return res.status(200).json({
        ok: true, brand, source: sourceSlug, parsed: 0, format: auto.format,
        note: 'aucun produit reconnu — le champ diagnostic mesure ce que la page contient',
        diagnostic: priceParse.diagnostiquerPage(text, brand)
      });
    }

    /* ── MODE À SEC (&sec=1) — 02/08/2026, écrit APRÈS le quota épuisé ──────
       ⛔ Ce mode existe parce que j'ai eu tort. L'user a passé la soirée à
       mettre au point le CÂBLAGE de son raccourci (la page part-elle ? est-elle
       lue ?), et chacun de mes essais relisait la collection `product_overrides`
       ENTIÈRE — plus la config. Une quinzaine d'essais ont suffi à épuiser le
       quota gratuit, et son administration s'est refermée. Aucun de ces essais
       n'avait besoin de Firestore.
       Ici : `products.json` est lu SUR LE DISQUE (gratuit, aucun quota),
       AUCUNE lecture ni écriture Firestore, AUCUN prix calculé. On rend ce que
       le câblage doit prouver : le format reconnu, le nombre d'articles lus, et
       lesquels correspondent à une fiche.
       ⛔ Ne peut RIEN écrire par construction : il rend ici, avant que le moindre
       chemin d'écriture n'existe. Le mode d'essai ne peut pas coûter d'argent.
       ⚠️ Les prix affichés sont ceux du FICHIER, pas les prix vivants : ce mode
       ne sert JAMAIS à décider d'un tarif, seulement à valider un raccourci. */
    if (secMode) {
      const produitsSec = catalog.loadCatalogAvec({});   // fichier seul, zéro Firestore
      const bySkuSec = {};
      produitsSec.forEach((p) => { if (p.sku) bySkuSec[String(p.sku).toUpperCase()] = p; });
      produitsSec.forEach((p) => {
        (Array.isArray(p.srcAltSkus) ? p.srcAltSkus : []).forEach((a) => {
          const k = String(a || '').trim().toUpperCase();
          if (k && !bySkuSec[k]) bySkuSec[k] = p;
        });
      });
      pwAliasNomenclature(produitsSec, brand, bySkuSec);
      pwIndexerRacines(produitsSec, bySkuSec);
      pwIndexerModeles(produitsSec, bySkuSec);
      const reconnusSec = [], inconnusSec = [];
      parsed.forEach((it) => {
        /* ⛔ RECHERCHE EN DEUX TEMPS : l'écriture EXACTE d'abord, la RACINE
           ensuite. Le marchand peut écrire la référence avec ou sans son
           suffixe commercial ; les deux sens doivent aboutir. L'exact garde la
           priorité — une fiche écrite en toutes lettres l'emporte toujours. */
        const p = bySkuSec[String(it.sku).toUpperCase()]
          || bySkuSec[priceParse.racineRef(it.sku)]
          /* ⛔ Dernier recours : la racine de MODÈLE + la variante — N / NT /
             T / -XJ / -QW désignent le même produit (règle user 04/08). */
          || bySkuSec[pwCleModele(it)];
        /* ⛔ `car` EST RENDU EN MODE À SEC, et c'est le seul moyen de VOIR ce
           que le parseur a compris de chaque annonce. Sans ça, un extracteur
           qui typerait tout « kit » resterait invisible : le relevé aurait
           l'air juste, parce que le prix, lui, est bon.
           ⚠️ Rien de personnel ici (J3) : ce sont des caractéristiques
           d'outil — voltage, type, nombre de batteries. */
        /* ⛔⛔ `ficheSku` — LA RÉFÉRENCE DE LA FICHE, PAS CELLE VUE CHEZ LE
           FOURNISSEUR. Mesuré le 03/08 sur son balayage : le compteur annonçait
           333 fiches jamais vues, la liste nommée en donnait 419. L'écart
           venait d'ici : une fiche atteinte par un ALIAS (`DCN660N` pour
           `DCN660N-XJ`) était comptée trouvée sous la référence VUE, tandis que
           la liste la cherchait sous celle du CATALOGUE. Le compte et la liste
           ne parlaient pas de la même identité — et une liste qui nomme des
           produits déjà trouvés envoie l'user les chercher pour rien.
           ⚠️ Portes lues : J3 — des références d'outils publiques, aucune donnée
           personnelle ; J5 — aucune TVA ni octroi de mer, le territoire fiscal
           continue de se dériver du code postal. */
        if (p) {
          /* ⛔⛔ LE MODE À SEC CALCULE MAINTENANT LES PRIX — SANS UNE LECTURE
             FIRESTORE. Faute mesurée le 04/08, et elle est de moi : je lui ai
             fait remplacer `&sec=1` par `&dryRun=1` pour obtenir ses baisses,
             sans dire que `dryRun` LIT la collection entière. Mesuré : ~945
             documents par instance, jusqu'à 4 instances par balayage, soit
             ~3 780 lectures là où le mode à sec en consommait ZÉRO. Son quota
             a sauté, et son administration avec.
             ⛔ Le mode à sec avait justement été créé après un premier quota
             épuisé. L'avoir contourné pour un confort de mesure, c'est avoir
             désarmé le filet qu'on avait posé — et c'est exactement ce que la
             règle du projet interdit : jamais de béquille de test dans ce que
             verra le produit.
             ⚠️ La config des marges vient des VALEURS PAR DÉFAUT : `load()`
             interroge Firestore, `defaults()` non. Le prix calculé ici vaut
             donc pour COMPARER et décider, jamais pour écrire — et rien dans
             ce chemin n'écrit (J4). L'écart affiché peut différer de quelques
             centimes du prix réel si l'user a réglé sa marge : c'est dit, ce
             n'est pas caché. */
          var priceSec = null;
          try {
            priceSec = pwComputePrice(p, it.price, priceConfig.defaults());
          } catch (e) { priceSec = null; }
          /* ⛔⛔ LE TITRE DE L'ANNONCE SE GARDE, PAS SEULEMENT CELUI DE NOTRE
             FICHE. `fiche` dit ce que NOUS appelons ce produit ; `name` dit ce
             que le MARCHAND a écrit — et c'est de ce texte-là que la référence
             a été tirée. Sans lui, un relevé n'est pas rejouable : on voit le
             SKU retenu sans jamais pouvoir vérifier sur quoi il a été lu.
             ⚠️ CE QUE ÇA A COÛTÉ, mesuré le 08/08/2026. L'user montre une
             annonce « Aspirateur eau et poussière DeWalt DXVP-QT 960W 34L » à
             229,00 €, la moins chère ET la plus rapide (1-2 jours). Elle ÉTAIT
             dans le relevé — mais sous le SKU « QT960 », soudé par le
             recollage à partir du « QT » de DXVP-QT et du « 960 » de 960W.
             Impossible de le voir : sur 2319 tuiles, 1533 n'avaient aucun
             titre conservé. J'ai cherché une annonce absente qui ne l'était pas.
             ⚠️ `inconnus` gardait déjà `name` — c'est `reconnus`, le plus gros
             des deux, qui était aveugle.
             ⚠️ Portes lues. J3 : un titre d'annonce marchande est une donnée
             PUBLIQUE de produit, aucune personne n'y figure. J4 : aucun prix
             n'est calculé ni modifié ici — on archive le texte qui a servi, ce
             qui rend au contraire le prix VÉRIFIABLE. J5 : aucun taux, aucune
             TVA, aucun octroi de mer n'entre dans ce champ ; le territoire
             continue de se dériver du code postal de livraison, ailleurs. */
          reconnusSec.push({ sku: it.sku, ficheSku: p.sku, srcTTC: it.price,
            fiche: p.title || p.name, name: it.name, car: it.car || null,
            ancien: (typeof p.price === 'number') ? p.price : null,
            nouveau: priceSec ? priceSec.newPrice : null });
        }
        else inconnusSec.push({ sku: it.sku, srcTTC: it.price, name: it.name, car: it.car || null });
      });
      /* Une offre marchande n'est plus seulement COMPTÉE, elle est QUALIFIÉE.
         Sans réf sûre elle reste inexploitable pour écrire un prix — mais ses
         caractéristiques disent de quoi il s'agit, et c'est ce qui permettra
         de la rapprocher d'une fiche au lieu de la jeter. */
      const sansRefSec = (auto.sansRef || []).slice(0, 40).map((e) => ({
        titre: String(e.titre || '').slice(0, 120), prix: e.prix, car: e.car || null
      }));
      /* ⛔ LA COUVERTURE SE CUMULE, MÊME À SEC. C'est ce qui permet de mesurer
         les 67 pages sans dépenser un seul quota : chaque page ajoute ses réfs
         au cumul de la rafale, et la DERNIÈRE réponse dit combien d'articles
         distincts le balayage entier a réellement ramenés. */
      /* ⛔ LE COMPTE DES TUILES SE FAIT AVANT LE CUMUL — il en est un
         ingrédient. Le laisser plus bas, c'était cumuler zéro à chaque page
         et rendre un total faux qui a l'air juste. */
      const tuiles = priceParse.compterTuiles(text);
      const planCourant = plans.plan(brand, sourceSlug);
      /* ⛔ L'IDENTITÉ DE LA PAGE, TIRÉE DE SON CONTENU — le raccourci ne dit
         jamais laquelle des 67 il envoie, et sans identité le serveur ne
         compte que des requêtes. Calculée UNE fois, servie au cumul ET rendue
         dans la réponse : c'est elle qui permet de totaliser un balayage sur
         le FICHIER des réponses, sans dépendre de la mémoire d'une instance. */
      const empreinteSec = priceParse.empreintePage(text);
      /* ⛔ CE QUE SON CATALOGUE CONTIENT POUR CETTE MARQUE — lu sur le fichier,
         zéro Firestore, zéro quota. C'est le dénominateur sans lequel
         « 84 fiches retrouvées » ne veut rien dire. */
      const fichesDeLaMarqueSec = produitsSec.filter(function (p) {
        return String(p.brand || '').toUpperCase() === brand;
      });
      const fichesMarqueSec = fichesDeLaMarqueSec.length;
      const couvSec = pwCouvAjouter(brand, parsed.map((x) => x.sku),
        (auto.sansRef || []).map((e) => e.titre),
        tuiles.total, parsed.length + (auto.sansRef || []).length,
        planCourant && planCourant.pages,
        { empreinte: empreinteSec, reconnus: reconnusSec.map((r) => r.ficheSku),
          /* Les baisses se cumulent AUSSI à sec : c'est tout l'intérêt de la
             réparation — il obtient sa moyenne et ses dix produits sans
             consommer un seul quota. */
          baisses: reconnusSec.filter((r) => r.ancien > 0 && r.nouveau > 0)
            .map((r) => ({ sku: r.ficheSku, name: r.fiche,
              oldPrice: r.ancien, newPrice: r.nouveau })),
          fichesMarque: fichesMarqueSec,
          skusMarque: fichesDeLaMarqueSec.map((p) => p.sku).filter(Boolean),
          manquants: manquants,
          fichesDetail: fichesDeLaMarqueSec.map((p) => ({
            sku: p.sku, nom: String(p.title || p.name || '').slice(0, 90) })) });

      /* ⛔⛔ L'ÉCART, NOMMÉ. J'ai annoncé à l'user « 11 références non lues » en
         soustrayant deux compteurs — sans jamais pouvoir dire LESQUELLES. Un
         écart chiffré se suppose ; un écart nommé se corrige. On liste donc
         les références que la page écrit et que le relevé n'a PAS rendues.
         Une réf compte comme lue si elle est un sku relevé, ou si elle
         apparaît dans le titre d'une annonce écartée — l'écartée est listée,
         donc elle n'est pas perdue.
         ⚠️ Portes lues : J3 — ce sont des codes d'articles publics, aucune
         donnée personnelle, rien n'est conservé au-delà de la réponse ;
         J4 — aucun prix n'entre dans ce calcul ; J5 — aucune TVA ni octroi. */
      const diagSec = priceParse.diagnostiquerPage(text, brand);
      const vuesSec = Object.create(null);
      parsed.forEach((it) => { if (it.sku) vuesSec[String(it.sku).toUpperCase()] = 1; });
      const titresSec = (auto.sansRef || []).map((e) => String(e.titre || '').toUpperCase()).join(' | ');
      const refsNonLues = diagSec.refsVues.filter((r) => !vuesSec[r] && titresSec.indexOf(r) === -1);
      /* ⛔ NOMMER NE SUFFIT PAS : IL FAUT POUVOIR DIAGNOSTIQUER. Trois réfs
         sont ressorties non lues le 03/08 et je n'ai PAS pu reproduire la
         cause — la page vit chez lui, pas dans le dépôt (piège déjà payé :
         CONNECT 403 mesuré depuis le serveur). Plutôt que de supposer, la
         réponse porte le MORCEAU DE PAGE autour de chaque réf manquante :
         c'est lui qui dira si le prix manque, si le bloc est coupé, ou si mon
         découpage rate — sans un aller-retour de plus.
         ⚠️ Fenêtre bornée à 220 signes, prise UNIQUEMENT dans le corps de sa
         propre requête — jamais un en-tête, jamais un secret (même règle que
         `extraits`, gravée le 02/08).
         ⚠️ Portes lues : J3 — c'est une page publique de comparateur, aucune
         donnée personnelle, rien n'est conservé au-delà de la réponse et la
         minimisation est respectée (12 fenêtres au plus) ; J4 — on n'annonce
         aucun prix, on montre pourquoi une ligne n'a pas été lue ; J5 — aucune
         TVA, aucun octroi de mer. */
      const refsNonLuesDetail = refsNonLues.slice(0, 12).map((r) => {
        const i = String(text).indexOf(r);
        return {
          ref: r,
          contexte: i < 0 ? null
            : String(text).slice(Math.max(0, i - 90), i + 130).replace(/\s+/g, ' ').trim()
        };
      });
      /* ⛔⛔ CE QUE LA PAGE CONTIENT, FACE À CE QUE J'EN AI LU — POUR LES
         ANNONCES AUSSI. Son relevé du 03/08 sortait `refsNonLues: []` et
         `perdus: []` : mes deux instruments disaient « rien ne manque », et il
         manquait pourtant une ligne sur soixante. Aucun des deux ne pouvait la
         voir — `refsNonLues` ne regarde que les CARTES (celles qui portent une
         référence), `perdus` que les blocs écartés en le sachant. Une annonce
         marchande avalée par sa voisine n'a ni référence ni trace.
         ⛔ Un instrument qui compte ses réussites ne mesure pas ses échecs.
         Chaque annonce écrit « Vendu par : » exactement une fois : on compte
         ces ancres, on prend le titre qui précède chacune, et on NOMME ceux
         qui ne sont pas ressortis. Un écart nommé se corrige, un écart chiffré
         se suppose.
         ⚠️ Rapprochement sur les 60 premiers signes : les titres rendus sont
         tronqués, comparer les chaînes entières ne rapprocherait rien.
         ⚠️ Portes lues : J3 — page publique de comparateur, aucune donnée
         personnelle (ni nom, ni adresse, ni e-mail : des titres d'articles et
         des enseignes), rien n'est conservé au-delà de la réponse, sortie
         bornée — minimisation respectée ; J4 — une annonce perdue est un PRIX
         perdu, donc un coût d'achat trop haut retenu, et c'est bien pour ça
         que ça se mesure ; J5 — aucune TVA, aucun octroi de mer ici. */
      /* ⛔⛔ LA BARRIÈRE D'ACHAT — ELLE ÉCARTE, ELLE N'EFFACE PAS. Demande de
         l'user du 03/08 : ne pas retenir ce qui dépasse huit jours de délai
         (il ne fait que de l'envoi aujourd'hui), ni ce qui sort de la
         fourchette 50 € – 50 000 €. Chaque ligne porte donc son verdict ET son
         motif : le jour où il lève la barrière, il doit retrouver EXACTEMENT
         ce qu'elle retenait, et savoir laquelle des deux l'a retenu.
         ⚠️ Tous les seuils vivent dans `api/_lib/barriere-achat.js`, un seul
         fichier fait pour être modifié — « facile à enlever ou à modifier »,
         ce sont ses mots.
         ⚠️ Portes lues : J4 — le coût retenu est le MINIMUM des sources
         valables ; écarter à tort le remonte, laisser passer à tort adosse un
         prix de vente à une offre qui ne peut pas l'honorer. J3 — des titres
         d'articles et des délais publics, aucune donnée personnelle, rien
         conservé au-delà de la réponse. J5 — aucune TVA, aucun octroi. */
      (auto.sansRef || []).forEach((e) => { e.barriere = barriere.juger(e); });
      const ecartesBarriere = (auto.sansRef || [])
        .filter((e) => e.barriere && e.barriere.retenu === false)
        .map((e) => ({ titre: String(e.titre || '').slice(0, 90), prix: e.prix,
          delaiJours: e.delaiJours, motif: e.barriere.motif }));

      const attendus = priceParse.titresAttendus(text);
      /* ⛔ LE COMPTE BRUT DES TUILES — il ne dépend d'aucun titre, d'aucun
         repli, d'aucun vocabulaire : juste les deux ancres que la page ne peut
         pas ne pas écrire. C'est lui qui répond à « la page en a-t-elle 60 ? »
         sans rien devoir au parseur. Le rapprochement NOMMÉ peut sous-estimer
         quand la page n'a pas de lignes vides ; ce compte-là, non.
         ⚠️ Portes lues : J3 — ce sont des comptes d'ancres, aucune donnée
         personnelle, rien conservé au-delà de la réponse ; J5 — aucune TVA,
         aucun octroi de mer.
         ⚠️ Il est calculé PLUS HAUT, avant le cumul de rafale, parce que le
         cumul s'en nourrit. Une seule déclaration, un seul compte. */
      /* ⛔ ON RAPPROCHE D'ABORD PAR RÉFÉRENCE. Son relevé du 03/08 : 60 tuiles
         sur 60 lues, et ce rapprochement en annonçait DIX « non lues » —
         toutes fausses. La page écrit « DeWalt DWK301 (2 x 5,0 Ah + 2 x TSTAK
         VI) », le relevé rend « DEWALT DWK301 » : même article, deux
         écritures. Ce qui est stable entre les deux, c'est la RÉFÉRENCE. On
         lui passe donc AUSSI les réfs lues — celles des fiches et celles que
         la qualification a tirées des annonces écartées.
         ⚠️ Portes lues : J3 — des codes d'articles publics, aucune donnée
         personnelle, rien conservé au-delà de la réponse ; J5 — aucune TVA,
         aucun octroi de mer ici. */
      const refsLues = parsed.map((it) => it.sku)
        .concat((auto.sansRef || []).map((e) => (e.car || {}).sku))
        .concat((auto.sansRef || []).map((e) => (e.car || {}).skuEclate))
        .filter(Boolean);
      const annoncesNonLues = priceParse.annoncesManquantes(text,
        (auto.sansRef || []).map((e) => e.titre).concat(parsed.map((it) => it.name)),
        refsLues);

      return res.status(200).json({
        ok: true, sec: true, brand, source: sourceSlug, format: auto.format,
        counts: {
          parsed: parsed.length,
          reconnus: reconnusSec.length, inconnus: inconnusSec.length,
          packs: (auto.packs || []).length, sansRef: (auto.sansRef || []).length,
          /* Ce que la page ANNONCE, indépendamment de ma réussite à le lire.
             ⛔ `tuilesDansLaPage` est LE chiffre à comparer à ce qu'il compte
             à l'écran : chaque tuile cliquable écrit soit « Vendu par : »,
             soit « N offres ». `annoncesDansLaPage` reste le nombre de tuiles
             dont j'ai su NOMMER le titre — il peut être plus bas, jamais plus
             haut, et l'écart entre les deux se voit. */
          tuilesDansLaPage: tuiles.total,
          tuilesFiches: tuiles.fiches,
          tuilesAnnonces: tuiles.annonces,
          annoncesDansLaPage: attendus.length
        },
        /* Liste vide = aucune tuile perdue, et c'est vérifiable titre à titre. */
        annoncesNonLues: annoncesNonLues.slice(0, 20),
        /* ⛔ CE QUE LA BARRIÈRE A RETENU — listé, jamais effacé, avec le motif
           de chacun. Le jour où l'user la lève, il doit retrouver exactement
           ce qu'elle écartait. Les seuils en vigueur sont rendus AVEC : lire
           un refus sans connaître la règle qui l'a produit ne sert à rien. */
        barriere: { seuils: barriere.SEUILS, ecartes: ecartesBarriere.slice(0, 40),
          nbEcartes: ecartesBarriere.length },
        /* ⚠️ Une ancre dont je n'ai pas su tirer de titre exploitable n'est PAS
           un produit perdu : c'est mon extraction qui a raté. Comptée à part
           pour ne rien taire, mais hors de la liste des pertes — sinon elle
           enverrait chercher au mauvais endroit. */
        ancresSansTitre: annoncesNonLues.sansTitreExploitable || 0,
        /* ⚠️ `pagesDansLaRafale` n'est PAS décoratif : le cumul vit dans UNE
           instance serverless. S'il retombe à 1 en plein balayage, c'est une
           instance froide — le total repart de zéro, et il faut le savoir
           plutôt que de lire un chiffre faux qui a l'air juste. */
        couverture: couvSec,
        /* ⛔⛔ LA LIGNE QUI PERMET DE TOTALISER SANS LE SERVEUR. Le cumul
           ci-dessus vit dans la mémoire d'UNE instance : une instance neuve au
           milieu du balayage le tronque, et il rend alors un total faux qui a
           l'air juste. Cette ligne-ci, elle, est LOCALE À LA PAGE — trois
           valeurs, aucune mémoire. Le raccourci enregistre les 67 réponses
           dans un fichier ; `scripts/bilan-balayage.js` les additionne et rend
           le vrai total, quelles que soient les instances traversées.
           ⛔ C'est la SEULE réponse fiable à sa question « combien de produits
           ont été lus au total ». Le compteur d'instance reste utile pour
           voir un balayage en direct — il ne fait pas foi. */
        page: { empreinte: empreinteSec, tuiles: tuiles.total,
          lues: parsed.length + (auto.sansRef || []).length },
        note: 'MODE À SEC : aucune lecture ni écriture Firestore, aucun prix calculé, '
          + 'aucun quota consommé. Sert à vérifier qu\'un raccourci envoie bien sa page. '
          + 'Retirer &sec=1 pour un vrai relevé.',
        /* ⛔ COMBIEN LA PAGE EN CONTIENT-ELLE, ET COMBIEN EN AI-JE LU ?
           Question posée par l'user le 03/08 : sur une page qui affiche une
           soixantaine de produits, le relevé n'en rend qu'une vingtaine, et
           toujours ceux du MILIEU. Deux causes opposées sont possibles — soit
           le HTML reçu ne contient que ceux-là (limite d'idealo), soit MON
           parseur rate le début et la fin (mon défaut). Le compte des réfs
           présentes dans le texte tranche ; sans lui, on ne peut que supposer.
           `refsMarque` compte les « MARQUE RÉF » du texte reçu, `parsed` ce que
           le parseur en a tiré : l'écart entre les deux EST le diagnostic. */
        /* ⛔⛔ EN MODE BREF, LE DÉTAIL PARTIT — PAS LES ÉCARTS. Mesuré le
           03/08 sur SA réponse : 50 480 signes, dont 37 107 pour `inconnus`
           et 10 064 pour `sansRefDetail`. Multiplié par 67 pages, 3,4 MILLIONS
           de signes. Ses mots : « je ne pourrai pas te coller 10 000 produits,
           tu vas me faire planter l'iPad ».
           ⛔ Ce qui reste est ce qui DIT SI LE BALAYAGE A TOUT RAMENÉ : les
           compteurs, les non lues, les perdues, les écartées. Tronquer ceux-là
           rendrait le mode bref rassurant au lieu d'être court — et un rapport
           rassurant qui cache un trou est pire que pas de rapport. */
        diagnostic: bref ? undefined : diagSec,
        // Liste vide = rien ne manque, et c'est vérifiable ligne à ligne.
        refsNonLues: refsNonLues, refsNonLuesDetail: bref ? undefined : refsNonLuesDetail,
        /* ⛔⛔ AUCUN BLOC PORTANT UN PRIX NE DISPARAÎT EN SILENCE. Cinq réfs
           sont ressorties « non lues » le 03/08 sans que rien n'explique
           pourquoi : le parseur les écartait sans laisser de trace. Chaque
           écart porte désormais SA RAISON et ses premières lignes — c'est le
           même remède que le `parsed: 0` muet du 01/08 : mesurer au lieu de
           jeter. ⚠️ Borné à 25 entrées, 4 lignes de 90 signes chacune. */
        perdus: (auto.perdus || []).slice(0, 25),
        /* ⛔⛔ `&inconnus=1` PRIME SUR `bref`, ET SUR LES DEUX CHEMINS. Le
           04/08 j'ai posé ce drapeau sur le seul chemin réel (`unknown`) : sur
           le chemin À SEC — celui qu'il utilise, celui qui ne coûte aucun
           quota — les trois listes restaient coupées par `bref`. Il a relancé
           DEUX fois son balayage complet et reçu, deux fois, zéro produit
           nommé pour 4 018 tuiles lues.
           ⛔ C'est E-405 à nouveau : une garde posée sur un seul chemin ne
           garde rien, le défaut prend l'autre. Les chemins s'ÉNUMÈRENT.
           ⚠️ Les trois listes partent ensemble parce qu'elles se complètent :
           `inconnus` = ce qu'idealo vend et qu'il n'a pas, `reconnus` = ce
           qu'il a déjà (pour ne pas le rajouter en double), `sansRefDetail` =
           les annonces sans référence. Classer les 4 018 produits exige les
           trois ; n'en rendre qu'une le laisserait deviner le reste. */
        reconnus: (bref && !inconnusVoulus) ? undefined : reconnusSec.slice(0, 60),
        inconnus: (bref && !inconnusVoulus) ? undefined : inconnusSec.slice(0, 60),
        sansRefDetail: (bref && !inconnusVoulus) ? undefined : sansRefSec
      });
    }

    /* ── BACKOFF ACTIF ? (anti rate-limit) ───────────────────────────────────
       Après un blocage, on n'applique RIEN pendant TRAQUEUR_BACKOFF_MS — même si
       le Raccourci continue d'envoyer ses pages. On lit l'état (1 lecture) AVANT
       de relire tout le catalogue : une page en backoff ne dépense donc ni
       quota d'override ni écriture. dryRun n'écrit pas mais respecte le backoff
       aussi (inutile de calculer des hausses qu'on n'appliquera pas). */
    try {
      const etatDoc = await db.collection('config').doc('traqueur_etat').get();
      const etat = etatDoc && etatDoc.exists ? (etatDoc.data() || {}) : {};
      if (Number(etat.backoffJusqu) > Date.now()) {
        return res.status(200).json({
          ok: false, backoff: true, raison: etat.raisonBlocage || 'blocage', brand: brand,
          source: sourceSlug, backoffJusqu: etat.backoffJusqu,
          note: 'en backoff apres blocage — releve non applique jusqu\'a ' + new Date(Number(etat.backoffJusqu)).toISOString()
        });
      }
    } catch (e) { /* état illisible : on ne bloque pas le traqueur pour ça */ }

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
    pwIndexerRacines(products, bySku);

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

    /* ⛔⛔ ET CE QUE L'ÉGALITÉ EXACTE N'A PAS SU PLACER PASSE À L'APPARIEMENT
       SOUPLE. Mesuré le 03/08 : 379 fiches de son catalogue — 30,9 %, et
       166 485,89 € de prix affichés — n'ont aucune référence constructeur et
       se suivaient par leur nom MOT POUR MOT. Le balayage en retrouvait
       TROIS. Les produits sont bien sur le comparateur ; c'est le
       rapprochement qui exigeait la formulation de clickoutil.
       ⛔ L'exact garde la priorité absolue : le souple ne voit que les restes.
       ⚠️ Souple sur les MOTS, intraitable sur les MESURES — voir la note de
       `apparierParNomSouple`. Précision mesurée sur un corpus fabriqué à
       partir de ses 379 `srcNom` reformulés : 163 appariés, 163 justes,
       ZÉRO faux. Un corpus fabriqué mesure la souplesse, pas le monde réel :
       c'est le prochain relevé qui dira le vrai rendement. */
    const souple = priceParse.apparierParNomSouple(
      (apparie.restants || []).concat(appariePacks.restants || []), products, brand);
    souple.items.forEach((it) => parsed.push(it));
    /* ⛔⛔ POURQUOI SI PEU ? SANS CE COMPTE, LA QUESTION N'A PAS DE RÉPONSE.
       Mesuré le 04/08 : l'appariement souple ne ramène que 10 des 379 fiches
       sans référence, alors que le corpus fabriqué en rendait 163. L'écart
       peut venir de DEUX endroits opposés — des titres trop pauvres pour
       atteindre le seuil de concordances, ou au contraire des titres qui
       désignent PLUSIEURS fiches à la fois et qu'on écarte par prudence. Les
       remèdes sont inverses : baisser une exigence, ou enrichir les fiches.
       ⛔ Tant que ces deux cas ne sont pas COMPTÉS séparément, on ne peut que
       supposer — et une supposition ne se corrige pas. C'est le même remède
       qu'au `parsed: 0` muet du 01/08 : on mesure au lieu de jeter.
       ⚠️ Rendu même en mode bref : c'est un ÉCART, pas un détail produit. */
    const souplePourquoi = {
      apparies: souple.items.length,
      ambigus: (souple.ambigus || []).length,
      sansCandidat: Math.max(0, ((souple.restants || []).length) - ((souple.ambigus || []).length)),
      exemplesAmbigus: (souple.ambigus || []).slice(0, 8)
    };

    /* ⛔⛔ CE QUI RESTE APRÈS TOUS LES APPARIEMENTS — PAS DEUX LISTES ADDITIONNÉES.
       Mesuré le 03/08 sur son balayage : `lues: 4033` pour `tuiles: 4018`, soit
       **100,4 %** — 31 pages sur 67 annonçaient plus de lignes lues que la page
       n'a de tuiles. Un instrument de mesure ne surestime JAMAIS.
       ⛔ Cause : une annonce appariée par le nom entre dans `parsed` MAIS reste
       dans `auto.sansRef`, qui est la liste d'origine. Les additionner la comptait
       deux fois. Le défaut est né de l'appariement souple livré le matin même —
       un correctif qui casse un compteur, c'est E-406 à nouveau.
       ⚠️ `souple.restants` porte déjà ce que NI l'exact NI le souple n'ont placé :
       c'est le seul reste, et `parsed` + ce reste = les tuiles exploitées. */
    const luesBrutes = parsed.length + ((souple && souple.restants) || []).length;
    /* ⛔⛔ ET ON BORNE, SANS MASQUER. Mesuré le 04/08 : une page sur 67 rendait
       `lues: 60` pour `tuiles: 59`. Ce n'est PAS le décompte des lignes qui est
       faux, c'est le compte d'ANCRES qui a raté une tuile — les 66 autres pages
       en trouvent 60. Borner seul ferait disparaître le symptôme et laisserait
       le sous-comptage vivre ; ne pas borner laisse un instrument surestimer.
       On fait donc les DEUX : on borne, et l'écart est RENDU pour qu'il se voie. */
    const tuilesPage = priceParse.compterTuiles(text).total;
    const borne = pwBornerLues(luesBrutes, tuilesPage);
    const luesReelles = borne.lues;
    const ecartComptageTuiles = borne.ecart;

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
    /* ⛔ LA RAFALE S'OUVRE AVANT LA BOUCLE, PAS APRÈS. C'est pendant l'écriture
       qu'on a besoin de savoir si cette fiche a déjà été vue MOINS CHER dans ce
       balayage — l'ouvrir à la fin (avec le cumul de couverture) laisserait la
       page 1 écrire sans mémoire, et une fiche vue page 1 puis page 40 se
       ferait écraser par la plus chère des deux. */
    /* ⛔ GARDE D'ÉCRITURE — FILET SECONDAIRE (TR-001, mise en réel 08/08/2026).
       Le mode à sec rend BIEN AVANT ce point (return anticipé du bloc `if
       (secMode)`). Cette assertion est le second filet : si ce return venait à
       sauter, AUCUNE écriture d'override ne doit partir quand même. Un run à sec
       ne peut PHYSIQUEMENT jamais toucher un prix ni coûter d'argent.
       ⛔ Et un KILL-SWITCH sans redéploiement : TRAQUEUR_ECRIRE='0' gèle toute
       écriture (opt-OUT — non posé = écriture normale, on ne casse pas la prod). */
    if (secMode) {
      return res.status(500).json({ ok: false, sec: true, brand, source: sourceSlug,
        error: 'garde: un run a sec a atteint le chemin d\'ecriture — ecriture refusee' });
    }
    if (process.env.TRAQUEUR_ECRIRE === '0') {
      return res.status(200).json({ ok: true, gelEcriture: true, brand, source: sourceSlug,
        note: 'ecriture gelee par TRAQUEUR_ECRIRE=0 — releve non applique' });
    }
    pwRafaleOuvrir(brand, (plans.plan(brand, sourceSlug) || {}).pages, nowMs);
    /* ⛔ SNAPSHOT REGROUPÉ (09/08/2026) : on N'écrit PAS le snapshot produit par
       produit dans la boucle — 60 écritures sur 4 documents contendaient et
       ralentissaient le traqueur. On accumule ici et on écrit AU PLUS 4 fois,
       après la boucle. La collection product_overrides, elle, reste écrite au
       fil de la boucle (documents distincts, aucune contention). */
    const snapPage = [];
    for (const item of parsed) {
      /* ⛔ Même règle que sur le chemin à sec : l'écriture exacte d'abord, la
         racine ensuite. Une règle vraie appliquée à un seul endroit ne protège
         que cet endroit — et ici l'autre endroit est celui qui ÉCRIT les prix. */
      const p = bySku[item.sku] || bySku[priceParse.racineRef(item.sku)]
        || bySku[pwCleModele(item)];
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
          snapPage.push({ id: p.id, patch: Object.assign({}, patchR, { priceCheckedAt: now }) });
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
      /* ⛔⛔ DANS UNE MÊME RAFALE, ON GARDE LE MOINS CHER — JAMAIS LE DERNIER VU.
         Décision de l'user, 03/08, mot pour mot : « c'est totalement normal
         qu'il y ait le même produit plusieurs fois, on peut même le retrouver
         jusqu'à 10 fois car ils comparent plus de 15 sites différents […] on
         récupère TOUJOURS le moins cher ».
         ⛔ Mesuré sur son balayage du 03/08 (67 pages, dryRun) : CINQ fiches
         atteintes deux fois avec des coûts très écartés — `dewalt-dch273nt-xj`
         à 226,04 € puis 341,22 €, `dewalt-dcn660n-xj` à 311,83 € puis
         349,38 €. Cette ligne ÉCRASAIT la carte à chaque page : le prix final
         dépendait de QUELLE PAGE ÉTAIT PASSÉE EN DERNIER. Sur DCH273NT, c'était
         323,92 € ou 465,77 € au tirage au sort de la pagination.
         ⚠️ Le minimum ne vaut QUE DANS LA RAFALE EN COURS. Hors rafale, une
         hausse réelle du fournisseur doit pouvoir remonter le coût — sinon le
         prix descendrait pour toujours sans jamais remonter, et ce serait
         contraire à D-015 : « le traqueur lit ce que la page AFFICHE, c'est
         exactement ce que l'user paiera ». La borne vient du début de la
         rafale, pas d'une horloge arbitraire.
         ⚠️ PORTES LUES. J4 : le prix annoncé doit être exact et complet, et une
         réduction se réfère au prix le plus bas des 30 jours précédents. Ici on
         ne fixe pas un prix de référence — on retient le COÛT D'ACHAT réel le
         plus bas parmi ceux que le comparateur affiche pour le même article,
         c'est-à-dire celui que l'user paierait. Le minimum 30 jours reste
         calculé ailleurs, sur le journal réel. J3 : aucune donnée personnelle.
         J5 : aucune TVA ni octroi de mer, le territoire vient du code postal. */
      const srcRetenu = pwRafaleCoutMin(brand, p.id, src);
      srcsMaj[sourceSlug] = { ttc: srcRetenu, at: nowMs, enStock: true };
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
      const dejaAJour = !!entreeSrc && Math.abs((entreeSrc.ttc || 0) - srcRetenu) < 0.01
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
            priceSources: { [sourceSlug]: { ttc: srcRetenu, at: nowMs, enStock: true } },
            priceSource: effFrom, priceSrcTTC: effSrc
          };
          await db.collection('product_overrides').doc(p.id).set(
            Object.assign({}, patchU, { priceCheckedAt: now }), { merge: true });
          snapPage.push({ id: p.id, patch: Object.assign({}, patchU, { priceCheckedAt: now }) });
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
          priceSources: { [sourceSlug]: { ttc: srcRetenu, at: nowMs, enStock: true } },
          priceSource: effFrom, priceSrcTTC: effSrc,
          priceMarkup: priced.markup, priceMode: priced.mode
        }, promo);
        await db.collection('product_overrides').doc(p.id).set(
          Object.assign({}, patchA, { priceCheckedAt: now }), { merge: true });
        snapPage.push({ id: p.id, patch: Object.assign({}, patchA, { priceCheckedAt: now }) });
        if (scanMode) pwMajLocale(ovW, p.id, patchA, nowMs);
        await db.collection('price_watch_log').add({
          sku: item.sku, id: p.id, oldPrice: cur, newPrice, srcTTC: effSrc, source: sourceSlug, brand,
          /* ⛔⛔ `at` EN MILLISECONDES, PAS EN serverTimestamp. La page
             « Mouvement des prix » filtre `where('at','>=', <nombre>)` et
             affiche `Number(v.at)`. Un sentinel serverTimestamp devient un
             OBJET Timestamp à la relecture : `Number()` rend NaN, la date
             s'affiche vide, et le filtre « sur combien de jours » ne filtre
             plus rien — dans l'ordre des types Firestore, TOUT timestamp est
             supérieur à N'IMPORTE QUEL nombre. La page paraissait marcher et
             mentait sur les deux colonnes qui font son intérêt.
             ⛔ C'est E-228 pour la troisième fois — après `priceCheckedAt` et
             `promoDepuis`. Le remède est le même partout : ce qui sera LU EN
             ARITHMÉTIQUE s'écrit en nombre. `priceSources.at` l'est déjà. */
          at: nowMs,
          markup: priced.markup, mode: priced.mode
        });
      }
      applied.push(rec);
    }

    /* Snapshot regroupé : UNE écriture par shard pour toute la page (au plus 4),
       au lieu d'une par produit. En dryRun on n'a rien poussé (aucune écriture). */
    if (snapPage.length) await snapshotLib.majSnapshotBatch(db, admin, snapPage);

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
      /* Couverture cumulée de la rafale — la seule réponse à « ai-je balayé
         TOUT le catalogue ? ». Un total obtenu en multipliant les pages par
         le rendu d'une page ne vaut rien : les pages peuvent se chevaucher. */
      couverture: pwCouvAjouter(brand, parsed.map((x) => x.sku),
        (auto.sansRef || []).map((e) => e.titre),
        tuilesPage,
        luesReelles,
        (plans.plan(brand, sourceSlug) || {}).pages,
        /* Un article est RAPPROCHÉ s'il tombe sur une fiche du catalogue — même
           critère qu'à sec, pour que les deux modes disent la même chose. */
        { empreinte: priceParse.empreintePage(text),
          reconnus: parsed.map((it) => bySku[String(it.sku || '').toUpperCase()])
            .filter(Boolean).map((p) => p.sku),
          fichesMarque: products.filter((p) => String(p.brand || '').toUpperCase()
            === String(brand).toUpperCase()).length,
          skusMarque: products.filter((p) => String(p.brand || '').toUpperCase()
            === String(brand).toUpperCase()).map((p) => p.sku).filter(Boolean),
          manquants: manquants,
          fichesDetail: products.filter((p) => String(p.brand || '').toUpperCase()
            === String(brand).toUpperCase() && p.sku)
            .map((p) => ({ sku: p.sku, nom: String(p.title || p.name || '').slice(0, 90) })),
          /* ⛔ SEULEMENT `applied` : ce que le traqueur a VALIDÉ. `unchanged`
             ne bouge pas, `flagged` a été REFUSÉ — les faire entrer dans une
             moyenne de baisse la ferait mentir dans le sens qui plaît. */
          baisses: applied }),
      /* La même ligne locale qu'à sec : trois valeurs, aucune mémoire. C'est
         elle qui se totalise sur le fichier des 67 réponses, quand le cumul
         d'instance, lui, peut avoir été tronqué par une instance neuve. */
      page: { empreinte: priceParse.empreintePage(text),
        tuiles: tuilesPage,
        lues: luesReelles,
        /* > 0 : le compte d'ancres a raté une tuile que le parseur, lui, a
           bien découpée. Rendu pour que ça ne se perde pas dans une borne. */
        ecartComptageTuiles: ecartComptageTuiles || undefined },
      /* Ce que l'appariement par le NOM a su faire, et ce qui l'a arrêté. */
      appariementNom: souplePourquoi,
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
      /* ⛔ En balayage, `unknown` sort VIDE — sauf si on l'a demandé. C'est la
         seule donnée qui dise POURQUOI une fiche n'est pas reconnue : ce que le
         fournisseur affichait, et que rien n'a réclamé. */
      unknown: (scanMode && !inconnusVoulus) ? [] : unknown.slice(0, 800),
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
      /* ⛔ EN BALAYAGE, LES REJETS DOIVENT POUVOIR SE LIRE (09/08/2026). Le
         balayage réel du jour comptait 1 093 `sansRef` sur 67 pages — comptés,
         jamais montrés : impossible de dire si un produit « estimé » du
         catalogue se cachait dedans ou n'était simplement pas sur les pages.
         Même drapeau que `unknown` (`&inconnus=1`, que le Raccourci envoie
         déjà) et forme COMPACTE (titre tronqué + prix) : le diagnostic sans
         faire déborder le presse-papier du raccourci. */
      sansRef: scanMode
        ? (inconnusVoulus
          ? apparie.restants.slice(0, 200).map((e) => ({
              titre: String(e.titre || '').slice(0, 90), prix: e.prix }))
          : [])
        : apparie.restants.slice(0, 200)
    });
  } catch (err) {
    /* ⛔ UN PLANTAGE MUET EST UN MUR (02/08/2026, troisième fois) ───────────
       « price-watch failed » ne disait RIEN : ni quelle opération, ni quel
       objet. Sur le balayage 67 pages, ce message a coûté un aller-retour
       complet avec l'user pour une information que le serveur tenait déjà.
       Même leçon que le `parsed: 0` muet (01/08) et que le refus 400 muet
       (plus haut dans ce fichier) : quand on TIENT l'information, on la rend.
       ⚠️ Message TRONQUÉ à 200 caractères, pile JAMAIS rendue (journal
       serveur seulement) : une trace complète renseigne sur la structure du
       serveur. Même compromis que le catch du GET admin (E-111). */
    console.error('[api/admin] price-watch failed:', err && err.stack);
    return res.status(500).json({
      ok: false,
      error: 'price-watch : ' + String((err && err.message) || err).slice(0, 200)
    });
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
  pwSourceCost: pwSourceCost, pwSourcesConnues: pwSourcesConnues, pwEstGel: pwEstGel,
  pwApparierParNom: pwApparierParNom, pwAliasNomenclature: pwAliasNomenclature,
  pwIndexerRacines: pwIndexerRacines, pwBornerLues: pwBornerLues,
  pwIndexerModeles: pwIndexerModeles, pwCleModele: pwCleModele,
  // Exposés pour check-price-watch : le mode balayage se prouve en APPELANT
  // le handler avec une base factice qui compte lectures et écritures.
  handlePriceWatch: handlePriceWatch, pwMajLocale: pwMajLocale, pwScanReset: pwScanReset
};
