/* check-paiement.js — LA COUTURE TIENT-ELLE ?
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE CONTRÔLE EXISTE

   La couture n'a qu'une raison d'être : pouvoir changer de fournisseur de
   paiement, et REVENIR EN ARRIÈRE, sans réécrire cinq fichiers dans l'urgence.
   Elle ne vaut donc que si trois choses restent vraies :

     1. les deux fournisseurs exposent EXACTEMENT le même contrat ;
     2. la table des états ne peut pas faire passer un état inconnu pour
        « payé » — c'est le seul défaut de ce fichier qui coûterait de la
        marchandise ;
     3. le fournisseur par défaut reste celui qui FONCTIONNE, quoi qu'on
        écrive de travers dans les variables d'environnement.

   ⛔ Le point 2 est le cœur. Un état mal cartographié n'échoue pas : il
   expédie. C'est exactement le mode de panne qu'aucun test fonctionnel
   n'attrape, parce que tout « marche ».
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-paiement] ' + m); }

  var RACINE = path.join(__dirname, '..');
  var socle, stripe, revolut;
  try {
    socle = require(path.join(RACINE, 'api', '_lib', 'paiement', 'index.js'));
    stripe = require(path.join(RACINE, 'api', '_lib', 'paiement', 'stripe.js'));
    revolut = require(path.join(RACINE, 'api', '_lib', 'paiement', 'revolut.js'));
  } catch (e) {
    return ['check-paiement : la couche paiement est illisible — ' + e.message];
  }

  /* ── 1. Les deux fournisseurs exposent le MÊME contrat ─────────────────
     Sans ça, la bascule échoue au premier appel manquant, en production, sur
     le chemin de l'argent. */
  (socle.OPERATIONS || []).forEach(function (op) {
    ok(typeof stripe[op] !== 'undefined',
      'le fournisseur STRIPE n\'expose pas « ' + op +' » — la couture est incomplète.');
    ok(typeof revolut[op] !== 'undefined',
      'le fournisseur REVOLUT n\'expose pas « ' + op + ' » — on découvrirait le trou '
      + 'le jour de la bascule, pas avant.');
  });
  ok((socle.OPERATIONS || []).length >= 6,
    'la liste OPERATIONS a rétréci : un contrat qui maigrit laisse des appels directs '
    + 'au SDK repartir dans la nature.');

  /* ── 2. ⛔ LE CŒUR : un état inconnu ne devient JAMAIS « payé » ─────────
     On éprouve la normalisation avec tout ce qui pourrait tromper : valeurs
     absentes, casse, espaces, chaînes proches, types non-chaîne, et surtout
     des clés qui existent sur l'objet JavaScript mais pas dans la table. */
  var T = { 'succeeded': 'paye', 'requires_capture': 'autorise' };
  var pieges = [
    [undefined, 'valeur absente'],
    [null, 'null'],
    ['', 'chaîne vide'],
    ['inexistant', 'état jamais vu'],
    ['constructor', '⛔ clé héritée d\'Object — le piège classique du dictionnaire JS'],
    ['toString', '⛔ clé héritée d\'Object'],
    ['__proto__', '⛔ clé héritée d\'Object'],
    ['hasOwnProperty', '⛔ clé héritée d\'Object'],
    [0, 'nombre'],
    [{}, 'objet'],
    [[], 'tableau'],
    ['succeeded_', 'proche mais faux'],
    ['SUCCEEDE', 'tronqué']
  ];
  pieges.forEach(function (p) {
    var r = socle.normaliserEtat(p[0], T);
    ok(r === 'inconnu',
      '⛔ normaliserEtat(' + p[1] + ') rend « ' + r +' » au lieu de « inconnu ». '
      + 'Un état non cartographié qui devient autre chose qu\'inconnu peut '
      + 'déclencher une expédition sur un paiement qu\'on n\'a pas compris.');
  });
  ok(socle.normaliserEtat('succeeded', T) === 'paye', 'un état connu se traduit bien');
  ok(socle.normaliserEtat('  SUCCEEDED  ', T) === 'paye', 'espaces et casse tolérés sur un état CONNU');
  ok(socle.normaliserEtat('requires_capture', T) === 'autorise',
    'requires_capture doit valoir « autorise », JAMAIS « paye » : l\'argent est '
    + 'réservé, pas encaissé.');

  /* Aucune table de fournisseur ne doit produire un état hors vocabulaire. */
  Object.keys(stripe.ETATS_STRIPE || {}).forEach(function (k) {
    var v = stripe.ETATS_STRIPE[k];
    ok((socle.ETATS || []).indexOf(v) !== -1,
      'la table Stripe traduit « ' + k + ' » en « ' + v + ' », qui n\'est pas du '
      + 'vocabulaire commun. Un septième état inventé en douce ne serait traité nulle part.');
  });

  /* ⛔ Aucun état Stripe ne doit valoir « paye » à part `succeeded`. */
  Object.keys(stripe.ETATS_STRIPE || {}).forEach(function (k) {
    if (stripe.ETATS_STRIPE[k] === socle.ETAT_ACQUIS) {
      ok(k === 'succeeded',
        '⛔ l\'état Stripe « ' + k + ' » est traduit en « payé ». Seul `succeeded` '
        + 'prouve l\'encaissement chez Stripe.');
    }
  });

  /* ── 3. Le fournisseur par défaut est celui qui FONCTIONNE ─────────────
     Une variable mal orthographiée sur Vercel ne doit pas basculer le site sur
     un fournisseur non validé : elle doit le laisser où il est. */
  var avant = process.env.PAYMENT_PROVIDER;
  try {
    var cas = [
      [undefined, 'variable absente'],
      ['', 'variable vide'],
      ['revolute', 'faute de frappe'],
      ['REVOLUT_', 'faute de frappe'],
      ['stripe', 'valeur explicite'],
      ['n\'importe quoi', 'valeur absurde']
    ];
    cas.forEach(function (c) {
      if (c[0] === undefined) delete process.env.PAYMENT_PROVIDER;
      else process.env.PAYMENT_PROVIDER = c[0];
      ok(socle.nomFournisseur() === 'stripe',
        '⛔ PAYMENT_PROVIDER = « ' + String(c[0]) + ' » (' + c[1] + ') bascule le site '
        + 'ailleurs que sur Stripe. Le défaut doit TOUJOURS désigner le fournisseur '
        + 'qui encaisse réellement.');
    });
    ['revolut', 'REVOLUT', ' Revolut '].forEach(function (v) {
      process.env.PAYMENT_PROVIDER = v;
      ok(socle.nomFournisseur() === 'revolut',
        'PAYMENT_PROVIDER = « ' + v + ' » doit bien sélectionner Revolut (la bascule '
        + 'doit être possible, sinon la couture ne sert à rien).');
    });
  } finally {
    if (avant === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = avant;
  }

  /* ── 4. Sans clé, le module Revolut REFUSE — il ne fait jamais semblant ──
     ⚠️ Bloc RÉÉCRIT le 31/07/2026. Il vérifiait qu'un module VIDE levait
     « pas encore implémenté ». Le module est écrit maintenant, mais la
     protection ne change pas d'un pouce : sans clé, on doit ÉCHOUER
     BRUYAMMENT, jamais rendre une valeur qui ferait croire qu'on encaisse. */
  var avantCles = {
    p: process.env.REVOLUT_SECRET_KEY,
    s: process.env.REVOLUT_SECRET_KEY_SANDBOX,
    m: process.env.REVOLUT_MODE
  };
  try {
    delete process.env.REVOLUT_SECRET_KEY;
    delete process.env.REVOLUT_SECRET_KEY_SANDBOX;
    delete process.env.REVOLUT_MODE;

    ok(revolut.estConfigure() === false,
      '⛔ le module Revolut se déclare configuré SANS clé secrète. Un point d\'entrée '
      + 'croirait pouvoir encaisser et laisserait passer une commande impayée.');

    ['creerPaiement', 'lirePaiement', 'rembourser'].forEach(function (op) {
      var refuse = false;
      try {
        var r = revolut[op]('x', 1, 'eur');
        // Fonctions async : l'absence de clé doit REJETER la promesse.
        if (r && typeof r.then === 'function') { r.then(function () {}, function () {}); refuse = true; }
      } catch (e) { refuse = /clé secrète absente|REVOLUT_SECRET_KEY/i.test(e.message); }
      ok(refuse, '⛔ revolut.' + op + '() ne refuse pas quand la clé manque. Rendre une '
        + 'valeur au lieu d\'échouer est pire que ne rien faire : on croirait avoir encaissé.');
    });

    var sig = revolut.verifierSignature(Buffer.from('{}'), {});
    ok(sig && sig.ok === false,
      'revolut.verifierSignature() doit REFUSER, pas lever : un webhook qui explose '
      + 'renvoie 500 et invite à re-livrer une requête qu\'on ne saura jamais traiter.');
    ok(sig && /REVOLUT_WEBHOOK_SECRET/.test(String(sig.erreur || '')),
      'le refus doit NOMMER la variable manquante. Un « non autorisé » nu a déjà coûté '
      + 'une journée de prix non relevés (voir check-watch-auth).');
  } finally {
    if (avantCles.p === undefined) delete process.env.REVOLUT_SECRET_KEY; else process.env.REVOLUT_SECRET_KEY = avantCles.p;
    if (avantCles.s === undefined) delete process.env.REVOLUT_SECRET_KEY_SANDBOX; else process.env.REVOLUT_SECRET_KEY_SANDBOX = avantCles.s;
    if (avantCles.m === undefined) delete process.env.REVOLUT_MODE; else process.env.REVOLUT_MODE = avantCles.m;
  }

  /* ── 4 bis. ⛔⛔ LE GENRE DES ÉVÉNEMENTS — un ratage n'est pas un abandon ─
     Le webhook aiguille désormais sur le GENRE, pas sur le nom d'événement.
     C'est là que se joue la distinction la plus coûteuse de la migration :
     chez Revolut, un paiement refusé n'enterre PAS la commande — le client
     peut réessayer sur le MÊME ordre. La documentation est formelle :

       « Receiving ORDER_PAYMENT_FAILED or ORDER_PAYMENT_DECLINED does not mean
         the order has reached a final unsuccessful state. »

     Confondre 'tentative_ratee' et 'abandonne' tuerait une vente en cours de
     sauvetage, sans qu'aucun test fonctionnel ne bronche. */
  [['stripe', stripe.GENRES_STRIPE], ['revolut', revolut.GENRES_REVOLUT]].forEach(function (f) {
    var table = f[1];
    ok(table && typeof table === 'object',
      'le fournisseur ' + f[0] + ' n\'expose pas de table de GENRES d\'événements — '
      + 'le webhook ne saurait pas quoi faire de ses notifications.');
    if (!table) return;
    Object.keys(table).forEach(function (k) {
      ok((socle.GENRES || []).indexOf(table[k]) !== -1,
        f[0] + ' traduit l\'événement « ' + k + ' » en « ' + table[k] + ' », hors du '
        + 'vocabulaire commun. Un genre inventé ne serait traité nulle part.');
    });
    var encaissent = Object.keys(table).filter(function (k) { return table[k] === socle.GENRE_ACQUIS; });
    ok(encaissent.length > 0,
      '⛔ aucun événement de ' + f[0] + ' ne vaut « encaisse » : plus rien ne '
      + 'déclencherait jamais de commande.');
  });

  /* Les cas nommés, un par un — ce sont ceux qui coûtent. */
  var GR = revolut.GENRES_REVOLUT || {};
  ok(GR.ORDER_COMPLETED === socle.GENRE_ACQUIS,
    'ORDER_COMPLETED doit valoir « encaisse » — sinon aucune commande ne part jamais.');
  ok(GR.ORDER_AUTHORISED === 'autorise',
    '⛔ ORDER_AUTHORISED ne vaut pas « autorise ». S\'il valait « encaisse », on '
    + 'expédierait sur de l\'argent RÉVERSIBLE : les fonds retournent au client si '
    + 'l\'ordre n\'est pas capturé.');
  ['ORDER_PAYMENT_DECLINED', 'ORDER_PAYMENT_FAILED'].forEach(function (e) {
    ok(GR[e] === 'tentative_ratee',
      '⛔⛔ ' + e + ' vaut « ' + GR[e] + ' » au lieu de « tentative_ratee ». '
      + 'C\'est UNE TENTATIVE qui échoue, pas la commande : le client peut réessayer '
      + 'sur le MÊME ordre. L\'enterrer ici tue une vente en cours de sauvetage, et '
      + 'le ORDER_COMPLETED suivant arrive sur un dossier déjà clos.');
  });
  ['ORDER_CANCELLED', 'ORDER_FAILED'].forEach(function (e) {
    ok(GR[e] === 'abandonne',
      e + ' doit valoir « abandonne » : ce sont les deux SEULS événements qui tuent '
      + 'définitivement une commande chez Revolut.');
  });
  var GS = stripe.GENRES_STRIPE || {};
  ok(GS['payment_intent.payment_failed'] === 'tentative_ratee',
    '⛔ payment_intent.payment_failed vaut « ' + GS['payment_intent.payment_failed']
    + ' ». Chez Stripe aussi le client peut re-tenter sa carte sur le même intent.');

  /* Un événement inconnu ne devient JAMAIS « encaisse ». */
  ['inexistant', 'ORDER_', 'constructor', '__proto__', 'toString', '', null, undefined, 0, {}]
    .forEach(function (v) {
      [GR, GS].forEach(function (t) {
        ok(socle.normaliserGenre(v, t) === 'autre',
          '⛔ l\'événement inconnu (' + String(v) + ') ne vaut pas « autre ». Un genre '
          + 'non cartographié qui déclencherait quelque chose, c\'est une commande '
          + 'expédiée sur une notification qu\'on n\'a pas comprise.');
      });
    });

  /* ── 4 ter. Le webhook aiguille bien sur le GENRE ─────────────────────
     TROU DÉCOUVERT PAR SABOTAGE le 31/07/2026 : remettre `switch (event.type)`
     dans le webhook ne faisait rougir AUCUN contrôle. Or c'est le retour
     exact à l'état d'avant — les noms d'événements Stripe en dur — et le jour
     de la bascule, Revolut n'émettant aucun de ces noms, TOUS les paiements
     tomberaient dans le `default` : encaissés, jamais traités. Le client
     paierait et ne recevrait rien. */
  var WH = path.join(RACINE, 'api', 'webhook.js');
  if (fs.existsSync(WH)) {
    var whSrc = fs.readFileSync(WH, 'utf8');
    ok(/switch\s*\(\s*verif\.genre\s*\)/.test(whSrc),
      '⛔ api/webhook.js n\'aiguille plus sur `verif.genre`. S\'il est revenu à '
      + '`switch (event.type)`, il attend des noms d\'événements Stripe : le jour de '
      + 'la bascule, Revolut n\'en émet aucun et TOUS les paiements tomberaient dans '
      + 'le cas par défaut — encaissés, jamais traités.');
    ok(!/case\s*'payment_intent\.succeeded'/.test(whSrc),
      '⛔ api/webhook.js contient encore un `case \'payment_intent.succeeded\'` : '
      + 'un nom d\'événement propre à Stripe est redevenu une décision.');

    /* ⛔ UN SEUL ENDROIT LIT `event.data.object` — la bascule entre les deux
       formes de charge utile. Chaque autre lecture serait un chemin qui
       fonctionne chez Stripe et rend `undefined` chez Revolut : le handler ne
       verrait ni montant, ni metadata, ni adresse. Il ne planterait même pas —
       il traiterait une commande vide. On compte les occurrences hors
       commentaire, et AUCUNE ne doit tomber hors de `objetPaiement`.

       ⚠️ 1ʳᵉ VERSION FAUSSE : elle exigeait « exactement une occurrence ». Or la
       ligne légitime en porte DEUX — `if (… && event.data.object) return
       event.data.object;` — et le contrôle rougissait sur du code correct. On
       ne compte pas les occurrences : on retire la fonction autorisée et on
       vérifie qu'il n'en reste aucune ailleurs. C'est la règle réelle. */
    var sansCommentaires = whSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    /* ⛔ `event.type` N'EXISTE PAS CHEZ REVOLUT — sa charge utile est
       `{ event, order_id }`. Le nom de l'événement est un champ du CONTRAT
       (`verif.type`), pas de la charge utile.

       Ce que ça coûtait, trouvé le 31/07/2026 : `claimRef.create({ type:
       event.type })` écrivait `undefined`, que le SDK Admin Firestore REFUSE.
       L'exception tombait dans le `catch (dupErr)` voisin, qui l'avalait — le
       claim finissait posé par le `set` de reprise, l'idempotence tenait PAR
       ACCIDENT, et le type de l'événement disparaissait de la piste d'audit.
       Aucun symptôme visible : tout « marchait ». */
    var lecturesType = (sansCommentaires.match(/event\.type/g) || []).length;
    ok(lecturesType === 0,
      '⛔⛔ api/webhook.js lit `event.type` (' + lecturesType + ' fois). Ce champ '
      + 'n\'existe QUE chez Stripe : la charge utile de Revolut est `{ event, order_id }`. '
      + 'Chez lui la valeur vaut `undefined`, que Firestore refuse d\'écrire — et '
      + 'l\'exception se fait avaler par le `catch` du claim. Rien ne casse visiblement, '
      + 'l\'idempotence tient par accident, et la piste d\'audit perd le type de '
      + 'l\'événement. Le contrat fournit `verif.type`.');

    var mObjet = sansCommentaires.match(/async function objetPaiement[\s\S]*?\n\}/);
    ok(!!mObjet, '⛔ `objetPaiement` a disparu de api/webhook.js : plus rien ne relit la '
      + 'commande chez Revolut, dont la charge utile ne contient qu\'un identifiant.');
    var ailleurs = sansCommentaires.replace(mObjet ? mObjet[0] : '', '');
    var horsBascule = (ailleurs.match(/event\.data\.object/g) || []).length;
    ok(horsBascule === 0,
      '⛔ `event.data.object` est lu HORS de `objetPaiement` (' + horsBascule + ' fois). '
      + 'Toute lecture ailleurs est un chemin qui marche chez Stripe et rend `undefined` '
      + 'chez Revolut : ni montant, ni metadata, ni adresse. Ça ne planterait même pas — '
      + 'ça traiterait une commande vide.');

    /* ⛔⛔ LA COMMANDE DE DIAGNOSTIC NE DOIT JAMAIS DEVENIR UNE VENTE.
       `api/admin.js ?type=revolut-commande-test` crée un ordre à 30 € portant
       `source: pirates-tools` — il DOIT le porter, c'est ce qui prouve que la
       chaîne complète marche. Mais la garde d'appartenance du webhook ne
       regarde que ce marqueur : sans exclusion explicite du marqueur `test`,
       ce faux paiement produit une écriture comptable, consomme un numéro de
       facture (séquence légale, on ne « dé-consomme » pas) et envoie des
       emails de confirmation pour une vente qui n'existe pas.
       Aucun test fonctionnel ne verrait le défaut : tout « marche ». */
    var mGarde = whSrc.match(/function handleIntentSucceeded[\s\S]{0,1600}?Payment confirmed/);
    ok(mGarde && /metadata\.test/.test(mGarde[0]),
      '⛔⛔ la garde d\'appartenance de `handleIntentSucceeded` n\'exclut plus les '
      + 'commandes de diagnostic (`metadata.test`). L\'ordre de test à 30 € porte '
      + '`source: pirates-tools` : son webhook produirait une écriture comptable, un '
      + 'numéro de facture consommé et des emails de confirmation pour une vente qui '
      + 'n\'existe pas.');
  }

  /* Le pendant côté émetteur : si le diagnostic cesse de poser le marqueur, la
     garde ci-dessus n'a plus rien à surveiller et reverdit à vide. */
  var ADM = path.join(RACINE, 'api', 'admin.js');
  if (fs.existsSync(ADM)) {
    var admSrc = fs.readFileSync(ADM, 'utf8');
    var mTest = admSrc.match(/type === 'revolut-commande-test'[\s\S]{0,1800}?metadata:[^\n]*/);
    ok(!mTest || /test:\s*'1'/.test(mTest[0]),
      '⛔⛔ la commande de diagnostic Revolut ne porte plus `test: \'1\'` dans sa '
      + 'metadata. La garde du webhook s\'appuie dessus pour ne pas la traiter comme '
      + 'une vraie vente : sans ce marqueur, elle en devient une.');

    /* ── LE FILET, CÔTÉ SERVEUR ─────────────────────────────────────────── */
    var mRec = admSrc.match(/type === 'reconciliation'[\s\S]{0,6000}?\n    \}/);
    ok(!!mRec,
      '⛔ /api/admin n\'expose plus `?type=reconciliation`. Le bouton du panneau '
      + 'comptabilité appellerait une adresse qui n\'existe pas : le filet ne tourne plus, '
      + 'et un paiement encaissé dont le webhook s\'est perdu redevient invisible.');
    if (mRec) {
      /* ⛔⛔ Le journal `payments/` porte AUSSI les tentatives ratées, sous le
         MÊME identifiant que la commande (chez Revolut le client réessaie sur
         le même ordre). Sans le filtre `status == succeeded`, un ordre présent
         en « failed » passerait pour « déjà traité » : le client dont la 1ʳᵉ
         tentative échoue, dont la 2ᵉ réussit et dont le webhook de succès se
         perd deviendrait DÉFINITIVEMENT invisible — le seul cas qui compte. */
      ok(/where\(\s*'status'\s*,\s*'=='\s*,\s*'succeeded'\s*\)/.test(mRec[0]),
        '⛔⛔ la réconciliation compare TOUT le journal `payments/`, tentatives ratées '
        + 'comprises. Or elles portent le même identifiant que la commande : un ordre '
        + 'échoué puis payé, dont le webhook de succès se perd, passerait pour « déjà '
        + 'traité » et ne serait JAMAIS rattrapé. Seuls les paiements aboutis comptent.');

      /* ⛔ RGPD (J3) : la réponse s'affiche, se copie, part en capture d'écran. */
      ['\\bemail\\b', '\\bnom\\b', 'adresse'].forEach(function (champ) {
        ok(!(new RegExp(champ + '\\s*:', 'i')).test(mRec[0]),
          '⛔ la réponse de réconciliation renvoie un champ « ' + champ.replace(/\\b/g, '')
          + ' ». Les ordres relus portent e-mail, nom et adresse : ils ne doivent PAS '
          + 'ressortir. Identifiants, montants et dates seulement (règle J3, audit p6).');
      });

      /* ⛔ Un échec doit se DIRE. Renvoyer un résultat vide sur erreur, c'est
         afficher « aucun orphelin » alors que rien n'a été comparé. */
      ok(/avertissement/.test(mRec[0]),
        '⛔⛔ en cas d\'échec, la réconciliation ne dit plus qu\'elle N\'A PAS TOURNÉ. '
        + 'L\'écran afficherait « rien à signaler » sans que rien n\'ait été comparé.');
    }
  }

  /* ── 4 ter bis. LA GARDE D'ÉTAT NE VAUT QUE POUR L'ENCAISSEMENT ─────────
     Ceci n'est pas une lecture de source : on APPELLE `objetPaiement` avec un
     faux fournisseur et on regarde ce qu'elle rend. Une regex dirait à quoi le
     code ressemble ; cet appel dit ce qu'il FAIT.

     Le défaut visé, trouvé le 31/07/2026 en relisant mon propre code : la garde
     « état ≠ payé → null » était INCONDITIONNELLE. Chez Revolut, une tentative
     refusée laisse l'ordre en `pending` (le client peut réessayer dessus) — donc
     `objetPaiement` rendait `null`, `handleIntentFailed` n'était jamais appelée,
     et AUCUN échec de paiement n'était journalisé. Chez Stripe si, chez Revolut
     non : deux niveaux de traçabilité selon le fournisseur, exactement ce que la
     couture existe pour empêcher. Rien ne l'aurait montré — pas un euro perdu,
     juste un journal muet le jour où on en aurait eu besoin.

     ⚠️ Les trois cas comptent ENSEMBLE. Sans le cas 2, on ne prouve pas que la
     garde protège encore ; sans le cas 3, on ne prouve pas qu'elle protège du
     BON danger — un ordre seulement autorisé, donc réversible. */
  var wh = null;
  try { wh = require(path.join(RACINE, 'api', 'webhook.js')); } catch (eWh) {
    ok(false, '⛔ api/webhook.js ne peut plus être chargé : ' + (eWh && eWh.message));
  }
  if (wh && typeof wh._objetPaiement === 'function') {
    var faux = function (etatRendu) {
      return {
        lirePaiement: function () {
          return Promise.resolve({
            id: 'ord_faux', etat: etatRendu, etatBrut: etatRendu,
            montantCents: 4200, devise: 'EUR',
            metadata: { source: 'pirates-tools' }, email: null, adresse: null
          });
        }
      };
    };
    // Charge utile RÉELLE de Revolut : un nom d'événement et un identifiant, rien d'autre.
    var evt = { event: 'PEU_IMPORTE', order_id: 'ord_faux' };

    // 1) Tentative ratée, ordre resté « en_attente » → l'objet DOIT exister.
    var r1 = await wh._objetPaiement(faux('en_attente'), evt, { genre: 'tentative_ratee' });
    ok(r1 && r1.id === 'ord_faux',
      '⛔⛔ `objetPaiement` rend `null` pour une TENTATIVE RATÉE dont l\'ordre est '
      + 'resté en attente. C\'est le cas NORMAL chez Revolut (le client peut réessayer '
      + 'sur le même ordre) : aucun échec de paiement ne serait journalisé, alors que '
      + 'chez Stripe ils le sont tous. La garde d\'état ne doit valoir que pour le '
      + 'genre qui encaisse.');

    // 2) Encaissement annoncé, ordre réellement payé → l'objet DOIT exister.
    var r2 = await wh._objetPaiement(faux('paye'), evt, { genre: 'encaisse' });
    ok(r2 && r2.amount === 4200,
      '⛔ `objetPaiement` refuse un encaissement pourtant confirmé par la commande : '
      + 'le paiement serait acquitté sans facture, sans journal et sans e-mail.');

    /* 3) Encaissement ANNONCÉ mais ordre seulement autorisé → l'objet doit être
       `null`. Ce cas fait journaliser le webhook : on met la console en veille
       le temps de l'appel, sinon la sortie de la CI porte une ligne de faux
       incident à chaque passage — et une CI qui crie pour rien finit par ne
       plus être lue. La preuve reste l'assertion, pas la ligne de journal. */
    var logVrai = console.log;
    console.log = function () {};
    var r3;
    try { r3 = await wh._objetPaiement(faux('autorise'), evt, { genre: 'encaisse' }); }
    finally { console.log = logVrai; }
    ok(r3 === null,
      '⛔⛔ `objetPaiement` accepte un ordre seulement AUTORISÉ comme s\'il était '
      + 'encaissé. L\'autorisation est RÉVERSIBLE — les fonds repartent chez le client '
      + 'si rien n\'est capturé sous 7 jours. On expédierait la marchandise contre de '
      + 'l\'argent qui n\'est jamais arrivé.');
  } else if (wh) {
    ok(false, '⛔ api/webhook.js n\'expose plus `_objetPaiement` : les trois preuves '
      + 'de la garde d\'état (tentative ratée journalisée, encaissement accepté, '
      + 'autorisation refusée) ne tournent plus. Aucune ne peut être remplacée par '
      + 'une lecture de source.');
  }

  /* ── 4 quater. La CSP autorise les DEUX fournisseurs ───────────────────
     Le piège maison numéro un, écrit dans l'entonnoir : « la clé publique vit
     dans un script inline autorisé par empreinte sha256 : la changer sans
     recalculer la CSP BLOQUE le script et tue le site ». Corollaire : basculer
     sur Revolut sans autoriser ses domaines donne un formulaire de paiement
     VIDE, sans message d'erreur exploitable pour le client.

     ⚠️ Les deux fournisseurs doivent rester autorisés PENDANT toute la
     transition — c'est ce qui permet de revenir en arrière sans redéployer une
     CSP dans l'urgence. */
  /* ⚠️ 1ʳᵉ VERSION TROP GROSSIÈRE : elle cherchait le domaine N'IMPORTE OÙ dans
     vercel.json. Le sabotage « retirer Stripe de la CSP » est passé au VERT,
     parce qu'une occurrence survivait dans un AUTRE en-tête
     (`Permissions-Policy`). Un domaine autorisé dans la mauvaise directive
     n'autorise rien. On vérifie donc DIRECTIVE PAR DIRECTIVE. */
  var VERCEL = path.join(RACINE, 'vercel.json');
  if (fs.existsSync(VERCEL)) {
    var brut = fs.readFileSync(VERCEL, 'utf8');
    var mCsp = brut.match(/"value"\s*:\s*"(default-src[^"]*)"/);
    ok(!!mCsp, 'check-paiement : impossible de retrouver la Content-Security-Policy '
      + 'dans vercel.json — le contrôle ne vérifierait plus rien.');
    if (mCsp) {
      var directives = {};
      mCsp[1].split(';').forEach(function (d) {
        var t = d.trim().split(/\s+/);
        if (t.length) directives[t[0]] = ' ' + t.slice(1).join(' ') + ' ';
      });
      [
        ['script-src', 'https://js.stripe.com', 'le widget Stripe — il encaisse ENCORE aujourd\'hui'],
        ['connect-src', 'https://api.stripe.com', 'les appels du widget Stripe'],
        ['frame-src', 'https://js.stripe.com', 'l\'iframe du formulaire Stripe'],
        ['script-src', 'https://merchant.revolut.com', 'le widget Revolut en production'],
        ['script-src', 'https://sandbox-merchant.revolut.com', 'le widget Revolut en bac à sable — sans lui, impossible de TESTER'],
        ['connect-src', 'https://merchant.revolut.com', 'les appels du widget Revolut'],
        ['connect-src', 'https://sandbox-merchant.revolut.com', 'les appels du widget Revolut en bac à sable'],
        ['frame-src', 'https://merchant.revolut.com', 'l\'iframe du champ carte Revolut'],
        ['frame-src', 'https://sandbox-merchant.revolut.com', 'l\'iframe du champ carte en bac à sable'],
        ['frame-src', 'https://checkout.revolut.com', 'la page hébergée et le 3-D Secure de Revolut']
      ].forEach(function (d) {
        var dir = directives[d[0]] || '';
        ok(dir.indexOf(' ' + d[1] + ' ') !== -1,
          '⛔ la directive CSP `' + d[0] + '` n\'autorise pas « ' + d[1] + '  » : ' + d[2]
          + '. Un domaine manquant donne un formulaire de paiement VIDE, sans erreur '
          + 'lisible — le client ne peut pas payer et ne sait pas pourquoi. '
          + '(Être présent AILLEURS dans le fichier ne compte pas : un domaine autorisé '
          + 'dans la mauvaise directive n\'autorise rien.)');
      });
    }

    /* La Payment Request API (Apple Pay / Google Pay) est bornée à part, par
       l'en-tête Permissions-Policy. Le SDK Revolut expose `paymentRequest` :
       si on l'active un jour sans ouvrir cette porte, les boutons Apple/Google
       Pay échoueront SANS message. */
    /* ⚠️ La valeur contient des guillemets ÉCHAPPÉS (`payment=(self \"…\")`).
       Un `[^"]*` s'arrête au premier `\"` et tronque la chaîne : la 1ʳᵉ version
       de cette ligne lisait donc une valeur amputée et rougissait alors que
       l'en-tête était correct. On accepte explicitement les échappements. */
    var mPP = brut.match(/"Permissions-Policy"\s*,\s*"value"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (mPP && /payment=/.test(mPP[1])) {
      ok(/merchant\.revolut\.com/.test(mPP[1]),
        '⚠️ Permissions-Policy `payment=()` n\'autorise pas Revolut. Sans lui, Apple Pay '
        + 'et Google Pay échoueront en silence le jour où on les activera.');
    }
  }

  /* ── 4 quinquies. Le serveur DIT quel widget monter ────────────────────
     TROU DÉCOUVERT PAR SABOTAGE : retirer `fournisseur: paiement.nom()` de la
     réponse ne faisait rougir aucun contrôle. Or c'est le seul moyen pour le
     front de savoir quel widget charger. Sans ce champ, il devinerait — et le
     jour de la bascule il monterait le widget Stripe sur un jeton Revolut :
     formulaire vide, message d'erreur inutile, client incapable de payer. */
  var CPI = path.join(RACINE, 'api', 'create-payment-intent.js');
  if (fs.existsSync(CPI)) {
    var cpiSrc = fs.readFileSync(CPI, 'utf8');
    ok(/fournisseur\s*:\s*paiement\.nom\(\)/.test(cpiSrc),
      '⛔ /api/create-payment-intent ne renvoie plus `fournisseur`. Le front ne peut '
      + 'plus savoir quel widget monter : il devinerait, et monterait un jour le '
      + 'formulaire Stripe sur un jeton Revolut.');
    ok(/urlHebergee\s*:/.test(cpiSrc),
      '⛔ la réponse ne porte plus `urlHebergee`. C\'est le repli quand le widget '
      + 'refuse de se charger : chez Revolut, la page de paiement existe dès la '
      + 'création de l\'ordre — s\'en priver, c\'est perdre une vente pour un script '
      + 'bloqué.');
  }

  /* ── 4 sexies. Le diagnostic Revolut ne fuit rien et ne touche pas la prod ─
     `?type=revolut-ping` fait un appel RÉEL. Deux façons dont il pourrait
     coûter cher :
       · renvoyer la clé secrète — cette réponse s'affiche, se copie, se colle
         dans une conversation. Même tronquée, un extrait de secret reste un
         secret ;
       · s'exécuter en PRODUCTION — un diagnostic qui tape sur l'API réelle
         n'est plus un diagnostic. */
  var ADM = path.join(RACINE, 'api', 'admin.js');
  if (fs.existsSync(ADM)) {
    var admSrc = fs.readFileSync(ADM, 'utf8');
    if (/revolut-ping/.test(admSrc)) {
      var bloc = admSrc.slice(admSrc.indexOf("type === 'revolut-ping'"),
        admSrc.indexOf("type === 'export-catalogue'"));
      ok(/_modeProd\(\)/.test(bloc),
        '⛔ le diagnostic revolut-ping ne vérifie pas le mode. Il pourrait taper sur '
        + 'l\'API de PRODUCTION — un appel non prévu sur le chemin de l\'argent réel.');
      ok(!/REVOLUT_SECRET_KEY_SANDBOX\s*\|\|\s*''\s*\)[^;]*\bcle\s*:/.test(bloc),
        'le diagnostic ne doit pas renvoyer la clé.');
      ok(/longueurCle/.test(bloc),
        'le diagnostic doit renvoyer la LONGUEUR de la clé : c\'est le seul indice '
        + 'qui révèle un copier-coller tronqué, et il ne révèle rien du secret.');
      /* ⛔ Aucune sous-chaîne de la clé ne doit sortir : ni slice, ni substring,
         ni les 4 derniers caractères « pour aider à identifier ». */
      ok(!/(REVOLUT_SECRET_KEY[A-Z_]*)[^;\n]*\.(slice|substr|substring)\(/.test(bloc),
        '⛔ le diagnostic extrait un MORCEAU de la clé secrète. Un extrait de secret '
        + 'reste un secret : cette réponse s\'affiche à l\'écran et finit copiée-collée.');

      /* ⛔ IL DOIT ÊTRE ATTEIGNABLE. Un diagnostic derrière `requireAdmin` ne
         se joint PAS en tapant son adresse dans le navigateur : l'autorisation
         passe par un jeton Firebase en EN-TÊTE, qu'une barre d'adresse n'envoie
         jamais. Constaté le 31/07/2026 — « Invalid admin credentials » sur une
         URL ouverte à la main. Il faut donc un bouton qui passe par `adminGet`. */
      var appSrc2 = fs.existsSync(path.join(RACINE, 'app.js'))
        ? fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8') : '';
      /* Le créateur de commande de test porte les MÊMES risques que le ping :
         il fait un appel réel et il ÉCRIT chez le fournisseur. */
      if (/revolut-commande-test/.test(admSrc)) {
        var blocT = admSrc.slice(admSrc.indexOf("type === 'revolut-commande-test'"),
          admSrc.indexOf("type === 'export-catalogue'"));
        ok(/_modeProd\(\)/.test(blocT),
          '⛔ le créateur de commande de test ne vérifie pas le mode. Il pourrait créer '
          + 'des ordres en PRODUCTION — des montants qui ne correspondent à aucune vente, '
          + 'au milieu de la comptabilité réelle.');
        ok(/adminGet\(\s*['"]revolut-commande-test['"]\s*\)/.test(appSrc2),
          '⛔ le créateur de commande de test n\'est appelé par aucun bouton de l\'admin : '
          + 'il serait injoignable (le jeton Firebase ne passe pas par la barre d\'adresse).');
      }
      ok(/adminGet\(\s*['"]revolut-ping['"]\s*\)/.test(appSrc2),
        '⛔ le diagnostic revolut-ping existe côté serveur mais AUCUN bouton de '
        + 'l\'admin ne l\'appelle via `adminGet`. Il serait donc injoignable : une '
        + 'adresse tapée dans le navigateur n\'envoie pas le jeton Firebase et se '
        + 'fait refuser. Un outil de diagnostic qu\'on ne peut pas déclencher ne '
        + 'diagnostique rien.');
    }
  }

  /* ── 5. Le paiement normalisé n'a aucun champ `undefined` ──────────────
     `undefined` disparaît d'un JSON et d'un document Firestore. Un champ
     manquant doit se VOIR, donc valoir null. */
  var vide = socle.paiementVide();
  Object.keys(vide).forEach(function (k) {
    ok(vide[k] !== undefined,
      'paiementVide().' + k + ' vaut undefined — il disparaîtrait silencieusement '
      + 'du journal des paiements au lieu d\'apparaître vide.');
  });
  ok(vide.etat === 'inconnu',
    'l\'état par défaut d\'un paiement vide doit être « inconnu », jamais un état '
    + 'qui déclencherait quelque chose.');
  ok(vide.commissionCents === null,
    'la commission par défaut doit être null, JAMAIS 0 : un zéro se confondrait avec '
    + 'une commission réellement nulle dans le compte de résultat.');

  /* ── 6. Aucun appel direct au SDK là où la couture est censée passer ───
     Cliquet : les fichiers déjà migrés ne doivent pas voir revenir un
     require('stripe') en douce. La liste grandit à chaque étape. */
  var MIGRES = ['api/create-payment-intent.js', 'api/webhook.js', 'api/checkout.js'];
  MIGRES.forEach(function (f) {
    var abs = path.join(RACINE, f);
    if (!fs.existsSync(abs)) { ok(false, 'check-paiement : ' + f + ' introuvable.'); return; }
    var src = fs.readFileSync(abs, 'utf8');
    ok(!/require\(\s*['"]stripe['"]\s*\)/.test(src),
      '⛔ ' + f + ' appelle encore `require("stripe")` en direct alors qu\'il est passé '
      + 'par la couture. Un appel direct qui repasse, c\'est un endroit de plus à '
      + 'réécrire le jour de la bascule — et celui qu\'on oubliera.');
  });

  /* ── 7. ⛔ La commission ne doit JAMAIS être forcée à 0 ────────────────
     TROU DÉCOUVERT PAR SABOTAGE le 31/07/2026 : remplacer
     `normalise.commissionCents` par `normalise.commissionCents || 0` ne faisait
     rougir AUCUN contrôle. Or c'est exactement le défaut le plus coûteux de
     toute la comptabilité : une commission inconnue devenue 0 se confond avec
     une commission réellement nulle, la marge paraît meilleure qu'elle n'est,
     et rien ne le signale. `null` se voit ; `0` ment. */
  MIGRES.concat(['api/_lib/paiement/stripe.js']).forEach(function (f) {
    var abs = path.join(RACINE, f);
    if (!fs.existsSync(abs)) return;
    var src = fs.readFileSync(abs, 'utf8');
    ok(!/commissionCents\s*(\|\|\s*0|\?\?\s*0)/.test(src),
      '⛔ ' + f + ' force la commission à 0 quand elle est inconnue. Un zéro se '
      + 'confond avec une commission réellement nulle dans le compte de résultat : '
      + 'la marge paraît meilleure qu\'elle n\'est, et rien ne le signale. '
      + 'Laisser `null` — une valeur absente doit se VOIR.');
    ok(!/stripeFeeCents\s*(\|\|\s*0|\?\?\s*0)/.test(src),
      '⛔ ' + f + ' force stripeFeeCents à 0 quand il est inconnu. Même défaut, '
      + 'même conséquence sur le compte de résultat.');
  });

  /* ── 8. ⛔⛔ LE FILET POSÉ AVANT LE CODE : billingAddress ───────────────
     La doc Revolut le dit explicitement :

       « Some sandbox payments MAY STILL SUCCEED WITHOUT billingAddress.
         DO NOT treat that as production-ready behaviour. »

     Autrement dit : le bac à sable passe au vert sans l'adresse de
     facturation, et la PRODUCTION refuse les cartes. C'est le mode de panne
     que ce projet combat depuis le début — un test vert pour la mauvaise
     raison. On validerait tout en sandbox, on basculerait, et les paiements
     commenceraient à échouer sans qu'aucun contrôle n'ait bougé.

     Ce contrôle DORT tant que `createCardField` n'existe pas dans app.js, et
     MORD à la seconde où quelqu'un l'écrit sans les trois champs obligatoires.
     Le poser maintenant, c'est le seul moment où l'on est sûr de ne pas
     l'oublier. */
  /* ── 9. CLIQUET sur contact.js : UN seul appel direct toléré ───────────
     contact.js garde un `require('stripe')` : `transfers.create`, le versement
     au livreur via Stripe Connect. La Merchant API de Revolut n'a AUCUN
     équivalent (son /api/payouts ne fait que consulter nos propres virements),
     le module livreur est inactif, et la décision du 27/07/2026 a de toute
     façon renversé le principe — la plateforme n'encaisse plus la course.

     On ne le supprime pas, on l'ENCADRE : un cliquet à exactement 1. Toute
     nouvelle dépendance directe au SDK dans ce fichier fera rougir la CI. */
  var CONTACT = path.join(RACINE, 'api', 'contact.js');
  if (fs.existsSync(CONTACT)) {
    var cSrc = fs.readFileSync(CONTACT, 'utf8');
    var directs = (cSrc.match(/require\(\s*['"]stripe['"]\s*\)/g) || []).length;
    ok(directs <= 1,
      '⛔ api/contact.js contient ' + directs + ' appels directs au SDK Stripe. '
      + 'UN SEUL est toléré (transfers.create — Stripe Connect, sans équivalent '
      + 'Revolut connu). Tout appel supplémentaire est un endroit de plus à '
      + 'réécrire le jour de la bascule.');
    if (directs === 1) {
      ok(/transfers\.create/.test(cSrc),
        'api/contact.js garde un appel direct au SDK, mais ce n\'est plus '
        + '`transfers.create` : le cliquet protégeait une exception précise, pas '
        + 'un droit général à appeler Stripe depuis ce fichier.');
    }
  }

  var APP = path.join(RACINE, 'app.js');
  if (fs.existsSync(APP)) {
    var appSrc = fs.readFileSync(APP, 'utf8');
    if (/createCardField/.test(appSrc)) {
      [
        ['billingAddress', 'l\'adresse de FACTURATION — sans elle, la production refuse '
          + 'les cartes alors que le bac à sable les accepte'],
        ['email', 'l\'e-mail du client'],
        ['name', 'le nom du porteur (il n\'existe PAS de champ cardholderName séparé '
          + 'pour le card field)']
      ].forEach(function (c) {
        ok(new RegExp('\\b' + c[0] + '\\b').test(appSrc),
          '⛔ app.js appelle createCardField mais ne mentionne nulle part `' + c[0] + '` : '
          + c[1] + '. Revolut l\'exige en production.');
      });

      /* ⛔⛔ TROU DÉCOUVERT PAR SABOTAGE le 31/07/2026 : vider `onSuccess` ne
         faisait rougir aucun contrôle.

         C'est LA différence entre les deux fournisseurs. Stripe REDIRIGE vers
         `return_url` ; Revolut rappelle `onSuccess` SANS quitter la page. Si
         `onSuccess` ne navigue pas, le client paie, reste devant le formulaire,
         croit que rien ne s'est passé — et repaie. Le paiement, lui, a
         parfaitement fonctionné : aucun test fonctionnel ne verrait le défaut. */
      var mSucces = appSrc.match(/onSuccess\s*:\s*function[^{]*\{([\s\S]{0,400}?)\}/);
      ok(mSucces && /lvRedirect|location\.hash|#\/merci/.test(mSucces[1]),
        '⛔⛔ le callback `onSuccess` du champ carte Revolut ne navigue nulle part. '
        + 'Contrairement à Stripe, Revolut NE REDIRIGE PAS : sans navigation, le client '
        + 'paie et reste bloqué sur le formulaire, persuadé que rien ne s\'est passé. '
        + 'Il repaiera. Et le paiement aura parfaitement fonctionné — aucun test ne le verra.');

      /* La commande doit être mémorisée AVANT le paiement, sur les DEUX chemins :
         sinon /merci ne sait pas quoi finaliser. */
      ok(/function sauverCommandeEnAttente/.test(appSrc)
         && (appSrc.match(/sauverCommandeEnAttente\(/g) || []).length >= 3,
        '⛔ `sauverCommandeEnAttente` n\'est pas appelée par les DEUX chemins de '
        + 'paiement (Stripe et Revolut). Un paiement abouti sans commande mémorisée : '
        + 'le client paie, /merci ne finalise rien, et seul le journal serveur garde '
        + 'la trace.');
    }

    /* ── LE FILET DOIT ÊTRE ATTEIGNABLE, ET NE JAMAIS RASSURER À TORT ──────
       Trois défauts distincts, chacun rendant le filet inutile SANS rien
       casser de visible. */

    /* a) Le bouton existe, et il est branché au démarrage du panneau.
       ⚠️ 1ʳᵉ VERSION FAUSSE, démasquée par sabotage le 31/07/2026 : elle
       cherchait `comptaBrancherReconciliation()` n'importe où — ce qui matche
       aussi la DÉFINITION `function comptaBrancherReconciliation()`. Retirer
       l'appel laissait donc le contrôle VERT : il certifiait qu'un bouton était
       branché alors que plus rien ne le branchait. On efface les définitions
       avant de chercher ; ce qui reste ne peut être qu'un appel. */
    var appelsRecon = appSrc.replace(/function\s+comptaBrancherReconciliation/g, '');
    ok(/id="reconLancer"/.test(appSrc) && /comptaBrancherReconciliation\s*\(\s*\)/.test(appelsRecon),
      '⛔ le contrôle des paiements encaissés n\'est plus atteignable depuis le panneau '
      + 'comptabilité (bouton absent, ou `comptaBrancherReconciliation` jamais appelée). '
      + 'Le code du filet peut être parfait : s\'il ne se déclenche jamais, il ne rattrape '
      + 'rien. Et /api/admin s\'autorise par un jeton en EN-TÊTE — l\'adresse tapée dans la '
      + 'barre du navigateur se fait refuser.');

    // b) ⛔ Un échec d'appel ne doit JAMAIS s'afficher comme « tout va bien ».
    var mRecon = appSrc.match(/function comptaBrancherReconciliation[\s\S]*?\n  \}/);
    ok(mRecon && /n'a pas tourné|n\\'a pas tourné/.test(mRecon[0]),
      '⛔⛔ le contrôle des paiements encaissés ne distingue plus « aucun orphelin » de '
      + '« le contrôle n\'a pas tourné ». Un appel en échec affiché comme rassurant, c\'est '
      + 'un filet qui certifie sans avoir regardé — pire que pas de filet, parce qu\'on le '
      + 'croit.');

    /* c) Le paramètre de fenêtre ne doit PAS être concaténé dans le type :
       `adminGet` fait `encodeURIComponent(type)`, donc « recon&jours=7 »
       part en « recon%26jours%3D7 ». Le serveur lit un type inconnu et répond
       à côté — sans erreur visible. Écrit puis corrigé le 31/07/2026. */
    ok(!/adminGet\(\s*'[^']*&/.test(appSrc) && !/adminGet\(\s*"[^"]*&/.test(appSrc),
      '⛔ un appel `adminGet` colle un paramètre dans le nom du type. `adminGet` passe ce '
      + 'nom par `encodeURIComponent` : le `&` devient `%26`, le serveur reçoit un type qui '
      + 'n\'existe pas et répond autre chose — sans la moindre erreur à l\'écran. Les '
      + 'paramètres passent par le 2ᵉ argument.');

    /* ── d) LE MODE DE RÈGLEMENT DU LIVREUR — trois modes, un seul libellé ──
       D-016 volet 2 a ajouté `lien` (le livreur émet son propre lien, il est
       payé tout de suite, rien ne transite par la plateforme).

       ⛔ Le danger n'est PAS qu'un écran plante : c'est qu'il MENTE. Chaque
       écran écrivait son propre `paiement === 'virement' ? … : …` — quatre
       copies. Un troisième mode retombe silencieusement dans le « sinon » :
       le livreur coche « lien de paiement », et l'accord annonce des ESPÈCES
       au client. Personne ne voit rien, jusqu'au litige sur la livraison.
       On interdit donc le ternaire à deux branches sur ce champ. */
    var ternairesPaiement = (appSrc.match(/paiement\s*===\s*'virement'\s*\?/g) || []).length;
    ok(ternairesPaiement === 0,
      '⛔⛔ app.js teste encore `paiement === \'virement\' ?` en ternaire ('
      + ternairesPaiement + ' fois). Un mode de règlement qui n\'est ni « virement » ni '
      + '« espèces » retombe alors dans le « sinon » : le livreur choisit le paiement par '
      + 'lien, et l\'accord annonce des ESPÈCES au client. Rien ne plante — ça ment. '
      + 'Passer par `lvPaiementLabel`, source unique.');
  }

  /* ── Le vocabulaire serveur doit couvrir CHAQUE mode ────────────────────
     Appel réel, pas lecture de source : pour chaque mode accepté par
     `sanitizePaiement`, le libellé doit être non vide ET distinct des autres.
     Un mode accepté à l'écriture mais sans libellé produit un accord, un e-mail
     et une facture qui décrivent le règlement de travers. */
  var crs = null;
  try { crs = require(path.join(RACINE, 'api', '_lib', 'courses.js')); } catch (eC) {
    ok(false, '⛔ api/_lib/courses.js illisible : ' + (eC && eC.message));
  }
  if (crs && typeof crs.accordPaiementLabel === 'function' && typeof crs.sanitizePaiement === 'function') {
    var modes = ['especes', 'virement', 'lien'];
    var vus = {};
    modes.forEach(function (m) {
      ok(crs.sanitizePaiement(m) === m,
        '⛔ le mode de règlement « ' + m + ' » est REFUSÉ par `sanitizePaiement` : le choix '
        + 'du livreur serait remplacé par « espèces » sans qu\'il le sache.');
      var lib = crs.accordPaiementLabel(m);
      ok(lib && lib.length > 5,
        '⛔ le mode « ' + m + ' » n\'a pas de libellé : l\'accord, l\'e-mail et le '
        + 'récapitulatif décriraient le règlement de travers.');
      ok(!vus[lib],
        '⛔⛔ le mode « ' + m + ' » partage son libellé avec un autre mode (« ' + lib + ' »). '
        + 'Deux modes indiscernables à l\'écran : le client croit qu\'il paiera autrement '
        + 'qu\'il ne paiera.');
      vus[lib] = m;
    });
    /* Et une valeur inventée doit être REFUSÉE, pas traduite. */
    ok(crs.sanitizePaiement('bitcoin') === '',
      '⛔ `sanitizePaiement` accepte un mode inventé. Un accord pourrait annoncer un '
      + 'règlement que rien n\'implémente.');
  }

  return errors;
};

if (require.main === module) {
  /* ⚠️ Le module est devenu ASYNCHRONE (une assertion appelle réellement
     `objetPaiement`). Sans ce `.then`, `e.length` serait lu sur une Promise —
     `undefined`, donc falsy : le contrôle sortirait VERT quoi qu'il arrive. */
  module.exports().then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-paiement OK');
  }, function (err) {
    console.error('  ❌ [check-paiement] a explosé : ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
}
