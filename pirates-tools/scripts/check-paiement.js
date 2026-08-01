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
  var socle, revolut;
  try {
    socle = require(path.join(RACINE, 'api', '_lib', 'paiement', 'index.js'));
    revolut = require(path.join(RACINE, 'api', '_lib', 'paiement', 'revolut.js'));
  } catch (e) {
    return ['check-paiement : la couche paiement est illisible — ' + e.message];
  }

  /* ── 1. Les deux fournisseurs exposent le MÊME contrat ─────────────────
     Sans ça, la bascule échoue au premier appel manquant, en production, sur
     le chemin de l'argent. */
  (socle.OPERATIONS || []).forEach(function (op) {
    ok(typeof revolut[op] !== 'undefined',
      'le fournisseur REVOLUT n\'expose pas « ' + op + ' » — on découvrirait le trou '
      + 'le jour de la bascule, pas avant.');
  });
  /* ── `modeTest` : le verdict « est-ce de l'argent ? », par APPEL RÉEL ───
     Faux positif vécu le 01/08/2026 : la réconciliation a annoncé
     « 317,79 € encaissés, un client attend » sur deux paiements de l'ancien fournisseur de TEST.
     Le constat était juste, la gravité fausse. Trois façons de re-casser ça,
     et aucune ne se voit en fonctionnement normal :
       · l'ancien fournisseur rend `true` sur une clé LIVE → de vraies ventes perdues
         s'afficheraient comme des essais sans importance. Le pire des deux ;
       · l'ancien fournisseur DEVINE sur une clé au format inattendu au lieu de rendre `null` ;
       · Revolut rend `true` en production. */
  var envAvant = {
    sk: process.env.STRIPE_SECRET_KEY,
    rm: process.env.REVOLUT_MODE
  };
  try {
    /* ⛔ LES TROIS CAS « PRÉFIXE DE CLÉ » ONT ÉTÉ RETIRÉS avec le module de
       l'ancien fournisseur, supprimé le 01/08/2026 sur décision de l'user
       (« éradiquer tout ce qu'il y a sur l'ancien fournisseur, c'est TOUT »). SUPPRIMÉS, pas
       neutralisés : une assertion qui tournerait sur un objet factice serait
       verte pour la mauvaise raison — et rassurerait à tort.
       Le mode de panne qu'ils couvraient — de la fausse monnaie prise pour de
       l'argent réel — reste couvert juste en dessous, sur le seul fournisseur
       dont l'argent dépend désormais. */
    process.env.REVOLUT_MODE = 'prod';
    ok(revolut.modeTest() === false,
      '⛔⛔ Revolut se déclare en TEST alors que REVOLUT_MODE vaut « prod ». Les vraies '
      + 'ventes orphelines passeraient pour des essais.');
    ['', 'sandbox', 'PROD_', 'production', undefined].forEach(function (v) {
      if (v === undefined) delete process.env.REVOLUT_MODE;
      else process.env.REVOLUT_MODE = v;
      ok(revolut.modeTest() === true,
        '⛔ Revolut ne se déclare pas en TEST pour REVOLUT_MODE = « ' + String(v) + ' ». '
        + 'Le bac à sable est le DÉFAUT : seul le mot `prod` en toutes lettres en sort.');
    });
  } finally {
    if (envAvant.sk === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = envAvant.sk;
    if (envAvant.rm === undefined) delete process.env.REVOLUT_MODE;
    else process.env.REVOLUT_MODE = envAvant.rm;
  }

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

  /* Aucune table de fournisseur ne doit produire un état hors vocabulaire.
     ⛔ Les deux blocs qui vérifiaient les tables de l'ANCIEN fournisseur ont été
     SUPPRIMÉS le 01/08/2026 avec son module — pas neutralisés : une assertion
     qui boucle sur un objet vide passe toujours, et fait croire à un contrôle. */
  Object.keys(revolut.ETATS_REVOLUT || {}).forEach(function (k) {
    var v = revolut.ETATS_REVOLUT[k];
    ok((socle.ETATS || []).indexOf(v) !== -1,
      'la table Revolut traduit « ' + k + ' » en « ' + v + ' », qui n\'est pas du '
      + 'vocabulaire commun. Un septième état inventé en douce ne serait traité nulle part.');
  });

  /* ── 3. UN SEUL FOURNISSEUR ENCAISSE, QUOI QU'ON METTE DANS L'ENVIRONNEMENT
     l'ancien fournisseur a été retiré du site le 01/08/2026 (demande de l'user). Le code
     client de l'ancien fournisseur n'existe plus : si `PAYMENT_PROVIDER` pouvait encore
     basculer dessus, le serveur fabriquerait un jeton que PLUS AUCUN widget ne
     sait monter — formulaire mort, ventes perdues, sans rien qui casse.
     On exige donc que TOUTES les valeurs, y compris « l'ancien fournisseur » écrit
     explicitement, donnent Revolut. */
  var avant = process.env.PAYMENT_PROVIDER;
  try {
    var cas = [
      [undefined, 'variable absente'],
      ['', 'variable vide'],
      ['revolute', 'faute de frappe'],
      ['REVOLUT_', 'faute de frappe'],
      ['stripe', 'nom de l\'ancien fournisseur, ecrit explicitement'],
      ['n\'importe quoi', 'valeur absurde'],
      ['revolut', 'valeur nominale'],
      ['REVOLUT', 'casse haute'],
      [' Revolut ', 'espaces autour']
    ];
    cas.forEach(function (c) {
      if (c[0] === undefined) delete process.env.PAYMENT_PROVIDER;
      else process.env.PAYMENT_PROVIDER = c[0];
      ok(socle.nomFournisseur() === 'revolut',
        '⛔⛔ PAYMENT_PROVIDER = « ' + String(c[0]) + ' » (' + c[1] + ') ne donne pas '
        + 'Revolut. Depuis le retrait de l\'ancien fournisseur, AUCUNE valeur d\'environnement ne doit '
        + 'pouvoir désigner un autre fournisseur : son code client n\'existe plus, le '
        + 'formulaire de carte serait mort et la vente perdue sans erreur visible.');
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
  [['revolut', revolut.GENRES_REVOLUT]].forEach(function (f) {
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
  /* Un événement inconnu ne devient JAMAIS « encaisse ». */
  ['inexistant', 'ORDER_', 'constructor', '__proto__', 'toString', '', null, undefined, 0, {}]
    .forEach(function (v) {
      [GR].forEach(function (t) {
        ok(socle.normaliserGenre(v, t) === 'autre',
          '⛔ l\'événement inconnu (' + String(v) + ') ne vaut pas « autre ». Un genre '
          + 'non cartographié qui déclencherait quelque chose, c\'est une commande '
          + 'expédiée sur une notification qu\'on n\'a pas comprise.');
      });
    });

  /* ── 4 ter. Le webhook aiguille bien sur le GENRE ─────────────────────
     TROU DÉCOUVERT PAR SABOTAGE le 31/07/2026 : remettre `switch (event.type)`
     dans le webhook ne faisait rougir AUCUN contrôle. Or c'est le retour
     exact à l'état d'avant — les noms d'événements du fournisseur en dur — et le jour
     de la bascule, Revolut n'émettant aucun de ces noms, TOUS les paiements
     tomberaient dans le `default` : encaissés, jamais traités. Le client
     paierait et ne recevrait rien. */
  var WH = path.join(RACINE, 'api', 'webhook.js');
  if (fs.existsSync(WH)) {
    var whSrc = fs.readFileSync(WH, 'utf8');
    ok(/switch\s*\(\s*verif\.genre\s*\)/.test(whSrc),
      '⛔ api/webhook.js n\'aiguille plus sur `verif.genre`. S\'il est revenu à '
      + '`switch (event.type)`, il attend les noms d\'événements de l\'ancien fournisseur : le jour de '
      + 'la bascule, Revolut n\'en émet aucun et TOUS les paiements tomberaient dans '
      + 'le cas par défaut — encaissés, jamais traités.');
    ok(!/case\s*'payment_intent\.succeeded'/.test(whSrc),
      '⛔ api/webhook.js contient encore un `case \'payment_intent.succeeded\'` : '
      + 'un nom d\'événement propre à l\'ancien fournisseur est redevenu une décision.');

    /* ⛔ UN SEUL ENDROIT LIT `event.data.object` — la bascule entre les deux
       formes de charge utile. Chaque autre lecture serait un chemin qui
       fonctionne chez l'ancien fournisseur et rend `undefined` chez Revolut : le handler ne
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
      + 'n\'existait QUE chez l\'ancien fournisseur : la charge utile de Revolut est `{ event, order_id }`. '
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
      + 'Toute lecture ailleurs est un chemin qui marchait chez l ancien fournisseur et rend `undefined` '
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

      /* ⛔ Le VERDICT « est-ce de l'argent » doit sortir de l'API. Sans lui,
         l'écran ne peut que supposer — et il supposera du côté rassurant. */
      /* ⚠️ 1ʳᵉ VERSION TROP LÂCHE, démasquée par sabotage : elle cherchait le
         mot « modeTest » n'importe où dans le bloc — ce que l'APPEL
         `paiement.modeTest()` satisfait à lui seul. Retirer le champ de la
         RÉPONSE laissait donc le contrôle vert. Même classe que E-210 : on
         cherchait une ressemblance, pas la règle. On exige le champ. */
      ok(/modeTest\s*:/.test(mRec[0]),
        '⛔⛔ la réponse de réconciliation ne PORTE plus le champ `modeTest` — le calculer '
        + 'sans l\'envoyer ne sert à rien. '
        + 'L\'écran ne peut alors que supposer, et il supposera du côté rassurant : de '
        + 'vraies ventes perdues passeraient pour des essais. C\'est le faux positif du '
        + '01/08/2026, retourné dans le sens qui coûte.');

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
     et AUCUN échec de paiement n'était journalisé. Chez l'ancien fournisseur si, chez Revolut
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
      + 'chez l ancien fournisseur ils l etaient tous. La garde d\'état ne doit valoir que pour le '
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
     vercel.json. Le sabotage « retirer l'ancien fournisseur de la CSP » est passé au VERT,
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
     jour de la bascule il monterait le widget du fournisseur sur un jeton Revolut :
     formulaire vide, message d'erreur inutile, client incapable de payer. */
  var CPI = path.join(RACINE, 'api', 'create-payment-intent.js');
  if (fs.existsSync(CPI)) {
    var cpiSrc = fs.readFileSync(CPI, 'utf8');
    ok(/fournisseur\s*:\s*paiement\.nom\(\)/.test(cpiSrc),
      '⛔ /api/create-payment-intent ne renvoie plus `fournisseur`. Le front ne peut '
      + 'plus savoir quel widget monter : il devinerait, et monterait un jour le '
      + 'formulaire de l ancien fournisseur sur un jeton Revolut.');
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
     require('l'ancien fournisseur') en douce. La liste grandit à chaque étape. */
  var MIGRES = ['api/create-payment-intent.js', 'api/webhook.js'];
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
  /* ── 9. CLIQUET sur contact.js : PLUS AUCUN appel direct toléré ─────────
     ⚠️ CLIQUET RESSERRÉ DE 1 À 0 LE 01/08/2026. Pourquoi, en une phrase :
     l'exception qu'il protégeait n'existe plus.

     Il tolérait UN appel direct — `transfers.create`, le versement au livreur,
     que la Merchant API de Revolut ne sait pas faire. L'exception était
     nommée, datée, justifiée. Le bloc a été SUPPRIMÉ le 01/08/2026 : la
     plateforme n'encaisse plus la course depuis le 27/07 (art. L7342-1,
     présomption de salariat), l'owner vire à la main.

     ⛔ Un cliquet dont l'exception disparaît ne se laisse PAS à sa valeur
     d'avant. `<= 1` sur un fichier qui en compte 0, ce n'est plus un cliquet,
     c'est une porte ouverte : il autoriserait en silence le prochain appel
     direct — exactement ce qu'il existait pour empêcher. Un plafond qu'on
     n'abaisse pas quand le besoin tombe se change en permission. */
  var CONTACT = path.join(RACINE, 'api', 'contact.js');
  if (fs.existsSync(CONTACT)) {
    var cSrc = fs.readFileSync(CONTACT, 'utf8');
    var directs = (cSrc.match(/require\(\s*['"]stripe['"]\s*\)/g) || []).length;
    ok(directs === 0,
      '⛔ api/contact.js contient ' + directs + ' appel(s) direct(s) au SDK de '
      + 'l\'ancien encaisseur. Il n\'en reste AUCUN depuis le 01/08/2026, et '
      + 'l\'exception qui en tolérait un (le versement au livreur) a été '
      + 'retirée avec le module. Un appel qui reparaît ici est une dépendance '
      + 'neuve à un fournisseur qu\'on a quitté.');
    ok(!/transfers\.create/.test(cSrc),
      '⛔ `transfers.create` est réapparu dans api/contact.js. Le versement '
      + 'automatique au livreur a été retiré le 01/08/2026 : la plateforme '
      + 'n\'encaisse plus la course (art. L7342-1). Le rebrancher change le '
      + 'modèle juridique, pas seulement le code.');
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

      /* ⛔⛔ ON NE PASSE AUCUNE OPTION D'APPARENCE AU SDK REVOLUT.
         Le 01/08/2026, ajouter `styles`, `classes` et `hidePostcodeField` à
         `createCardField` a fait CESSER DE SE CHARGER le champ carte : le
         client tombait sur « Le formulaire ne s'est pas chargé » et ne pouvait
         plus payer sur le site. Le suspect le plus net est `classes` — la doc
         annonce SIX clés par défaut et un objet partiel écrase les cinq autres.

         L'habillage se fait donc entièrement en CSS, sur les classes que
         Revolut pose lui-même (`rc-card-field*`). Styliser de l'extérieur ne
         peut pas casser ce qu'on ne touche pas.

         ⚠️ Cette règle n'est pas une préférence de style : c'est un paiement
         qui marche contre un paiement qui ne marche pas. */
      /* ⚠️ Défini ICI, avant le premier usage : placé plus bas, il rendait
         `undefined` et le contrôle EXPLOSAIT au lieu de rapporter — ce qui
         masque toutes les assertions suivantes. Un contrôle qui plante ne
         contrôle plus rien (leçon déjà payée : sabotage S5). */
      var appSansCom = appSrc.replace(/\/\*[\s\S]*?\*\//g, '');
      var mCard = appSansCom.match(/createCardField\(\{[\s\S]*?\n      \}\)/);
      ok(mCard && !/\bstyles\s*:/.test(mCard[0]) && !/\bclasses\s*:/.test(mCard[0]),
        '⛔⛔ `createCardField` reçoit à nouveau des options d\'apparence (`styles` ou '
        + '`classes`). Le 01/08/2026, exactement ça a empêché le champ carte de se '
        + 'charger : plus aucun client ne pouvait payer sur le site. L\'habillage passe '
        + 'par le CSS, sur les classes `rc-card-field*` que Revolut pose lui-même.');

      /* ⛔⛔ TROU DÉCOUVERT PAR SABOTAGE le 31/07/2026 : vider `onSuccess` ne
         faisait rougir aucun contrôle.

         C'est LA différence entre les deux fournisseurs. L'ancien fournisseur REDIRIGE vers
         `return_url` ; Revolut rappelle `onSuccess` SANS quitter la page. Si
         `onSuccess` ne navigue pas, le client paie, reste devant le formulaire,
         croit que rien ne s'est passé — et repaie. Le paiement, lui, a
         parfaitement fonctionné : aucun test fonctionnel ne verrait le défaut. */
      /* ⚠️ FENÊTRE FIXE = MESURE FRAGILE. La 1ʳᵉ version lisait les 400
         premiers caractères après `onSuccess` : documenter le callback l'a
         fait rougir sur du code strictement correct, le commentaire ayant
         poussé l'appel hors de la fenêtre. On retire les commentaires et on
         lit le corps réel — la règle est « onSuccess navigue », pas « onSuccess
         navigue dans les 400 premiers caractères ». */
      var mSucces = appSansCom.match(/onSuccess\s*:\s*function[^{]*\{([\s\S]{0,600}?)\n\s*\},/);
      ok(mSucces && /lvRedirect|location\.hash|#\/merci/.test(mSucces[1]),
        '⛔⛔ le callback `onSuccess` du champ carte Revolut ne navigue nulle part. '
        + 'Contrairement à l\'ancien encaisseur, Revolut NE REDIRIGE PAS : sans navigation, le client '
        + 'paie et reste bloqué sur le formulaire, persuadé que rien ne s\'est passé. '
        + 'Il repaiera. Et le paiement aura parfaitement fonctionné — aucun test ne le verra.');

      /* ⛔⛔ ET ELLE DOIT SE FERMER. Constaté le 01/08/2026 sur le premier
         vrai achat : le paiement passait, la page Merci s'affichait, mais la
         fenêtre de paiement restait OUVERTE par-dessus — formulaire de carte et
         bouton « Commander » encore visibles. Le client venait de payer et
         voyait un écran qui lui disait de payer. Il pouvait recliquer.

         Le chemin de l'ancien fournisseur, lui, appelait `closePayModal()`. La couture existe
         pour que les deux fournisseurs se comportent pareil : ici elle avait
         été oubliée d'un seul côté, et aucun test ne le voyait — le paiement,
         lui, avait parfaitement fonctionné. */
      ok(mSucces && /closePayModal\s*\(/.test(mSucces[1]),
        '⛔⛔ le callback `onSuccess` du champ carte Revolut ne FERME pas la fenêtre de '
        + 'paiement. Le client paie, arrive sur la page Merci, et voit encore le '
        + 'formulaire de carte et le bouton « Commander » par-dessus. Il peut recliquer. '
        + 'L\'autre chemin, lui, ferme — les deux doivent se comporter '
        + 'pareil, c\'est toute la raison d\'être de la couture.');

      /* La commande doit être mémorisée AVANT le paiement, sur les DEUX chemins
         Revolut — le champ carte ET le repli vers la page hébergée. Sinon
         /merci ne sait pas quoi finaliser.

         ⚠️ ON NE COMPTE PLUS LA DÉCLARATION. Le seuil était `>= 3` sur toutes
         les occurrences de `sauverCommandeEnAttente(`, déclaration comprise :
         un chiffre qui mélange « où c'est défini » et « où c'est appelé » ne
         veut rien dire, et le message parlait encore de deux fournisseurs
         alors qu'il n'en reste qu'un. On compte les APPELS, et on dit lequel. */
      var totalOcc = (appSrc.match(/sauverCommandeEnAttente\s*\(/g) || []).length;
      var declaree = /function\s+sauverCommandeEnAttente\s*\(/.test(appSrc);
      var appels = totalOcc - (declaree ? 1 : 0);
      ok(declaree && appels >= 2,
        '⛔ `sauverCommandeEnAttente` n\'est appelée que ' + appels + ' fois. Les '
        + 'DEUX chemins de paiement Revolut doivent la déclencher : le champ '
        + 'carte intégré ET le repli vers la page hébergée. Un paiement abouti '
        + 'sans commande mémorisée, c\'est un client qui paie, une page Merci '
        + 'qui ne finalise rien, et la trace seulement côté serveur.');
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

    /* b bis) ⛔ L'ÉCRAN DOIT LIRE LE VERDICT, pas seulement le recevoir.
       Le 01/08/2026, l'écran a annoncé « 317,79 € encaissés, un client attend »
       sur deux paiements de TEST. Le constat était juste, la gravité fausse —
       et une alerte qui crie sur de la fausse monnaie à chaque passage apprend
       à ne plus être regardée. Deux conditions, et il faut les DEUX :
         · l'écran consulte `modeTest` ;
         · il traite `null` comme du RÉEL (`=== true` et non « truthy »), sinon
           une clé au format inattendu ferait passer de l'argent véritable pour
           un essai. C'est le sens de l'erreur qui coûte. */
    /* ⚠️ Une assertion « l'écran mentionne modeTest » serait FAUSSE : le pied de
       tableau le mentionne déjà pour afficher le registre. Elle resterait verte
       alors que la DÉCISION ne s'en sert plus. On vérifie donc les deux choses
       qui décident vraiment : le test strict, et la branche qu'il commande. */
    ok(mRecon && /'\s*\+\s*'attend|Personne n/.test(mRecon[0]),
      '⛔⛔ l\'écran n\'a plus de message distinct pour un registre de TEST : il annonce '
      + '« un client a payé et attend » sur de la fausse monnaie. L\'alerte crie à chaque '
      + 'passage — et on apprend à ne plus la regarder, donc à la manquer le jour où elle '
      + 'est vraie.');
    ok(mRecon && /d\.modeTest\s*===\s*true/.test(mRecon[0]),
      '⛔⛔ l\'écran teste `modeTest` sans exiger `=== true`. Un verdict `null` — clé au '
      + 'format inattendu, donc mode INDÉTERMINABLE — passerait pour du test : de vraies '
      + 'ventes encaissées et jamais enregistrées s\'afficheraient comme des essais sans '
      + 'importance. Dans le doute, on traite comme RÉEL.');

    /* ── d) ⛔⛔ LES TROIS OUTILS REVOLUT DOIVENT ÊTRE ATTEIGNABLES ────────
       Constaté le 01/08/2026 : `?type=revolut-webhook` existait depuis la
       veille, et je l'ai annoncé à l'user comme « clique le bouton ». Il n'y
       avait AUCUN bouton. Récidive exacte du défaut du `revolut-ping` :
       /api/admin s'autorise par un jeton en EN-TÊTE, donc l'adresse tapée dans
       la barre du navigateur ne peut que se faire refuser.

       ⛔ Un point d'entrée sans bouton N'EXISTE PAS pour l'user. Et celui-là
       est le plus cher de tous : sans webhook enregistré, un paiement réussi
       ne produit ni commande, ni facture, ni e-mail. Le mode de panne le plus
       silencieux du site. */
    ['revolut-ping', 'revolut-commande-test', 'revolut-webhook', 'webhook-sante',
     'revolut-relire', 'reconciliation'].forEach(function (t) {
      ok(appSrc.indexOf("adminGet('" + t + "'") !== -1,
        '⛔⛔ aucun appel `adminGet(\'' + t + '\')` dans app.js : ce point d\'entrée admin '
        + 'n\'est atteignable par AUCUN bouton. Il peut être parfait côté serveur — pour '
        + 'l\'user il n\'existe pas, et /api/admin refuse une adresse tapée dans la barre '
        + 'du navigateur (jeton attendu en EN-TÊTE).');
    });

    /* ── d ter) ⛔⛔ C'EST L'ÉMETTEUR QUI VÉRIFIE, PAS LE FOURNISSEUR ACTIF ─
       Mesuré le 01/08/2026 : Revolut a envoyé deux notifications, l'ancien fournisseur (alors
       fournisseur actif) a tenté de les vérifier, et a répondu « secret
       absent ». Deux reçues, ZÉRO acceptée, avec une configuration Revolut
       parfaite. Le défaut est symétrique et le second sens coûte plus cher :
       après la bascule, une re-livraison notification tardive de l'ancien fournisseur (backoff ~3 jours)
       serait refusée par Revolut et l'encaissement perdu en silence. */
    ok(/fournisseurParEntetes\(req\.headers\)/.test(whSrc),
      '⛔⛔ le webhook ne choisit plus le vérificateur d\'après l\'en-tête de signature. '
      + 'Il demande à un fournisseur de reconnaître la signature de l\'autre : toutes les '
      + 'notifications sont refusées, aucune vente n\'est enregistrée, et la configuration '
      + 'a pourtant l\'air correcte des deux côtés.');
    ok(!/var paiement = paiementSocle\.fournisseur\(\)/.test(whSrc),
      '⛔⛔ le webhook est revenu au FOURNISSEUR ACTIF pour vérifier la signature. C\'est le '
      + 'défaut du 01/08/2026 : pendant la transition les deux fournisseurs écrivent à la '
      + 'même adresse, et celui qui n\'a pas émis ne saura jamais vérifier.');

    /* Preuve par APPEL : le routage doit choisir juste, et refuser l'inconnu. */
    ok(socle.fournisseurParEntetes({}) === null
       && socle.fournisseurParEntetes({ 'x-autre': '1' }) === null,
      '⛔⛔ une requête SANS en-tête de signature est routée vers un fournisseur. Elle doit '
      + 'être refusée d\'emblée : accepter de vérifier n\'importe quoi ouvre la porte à des '
      + 'notifications forgées.');

    /* ── d bis) ⛔⛔ UN REFUS DE SIGNATURE DOIT LAISSER UNE TRACE VISIBLE ──
       C'est le point le plus fragile de la migration : algorithme, fenêtre de
       rejeu, secret mal collé. Et c'est aussi le plus silencieux — le webhook
       répond 400, le fournisseur réessaie puis abandonne, la vente est
       encaissée et rien n'est enregistré. L'unique trace partait dans les
       journaux Vercel, que personne ne lit.

       ⛔ Le témoin doit être posé sur les DEUX chemins. N'écrire que sur le
       succès donnerait un tableau de bord qui ne montre jamais l'échec — le
       genre de rassurance qui coûte cher. */
    var mSig = whSrc.match(/if \(!verif \|\| !verif\.ok\) \{[\s\S]{0,900}?\}/);
    ok(mSig && /noterSante/.test(mSig[0]),
      '⛔⛔ un refus de signature ne laisse plus aucune trace lisible depuis '
      + 'l\'administration. Le fournisseur réessaie quelques fois puis abandonne : la vente '
      + 'est encaissée, rien n\'est enregistré, et personne ne l\'apprend avant la '
      + 'réconciliation. C\'est le mode de panne le plus silencieux de la migration.');
    /* ⚠️ Un `[^)]*` s'arrête au premier `)` — celui de `paiement.nom()` — et
       ratait donc l'appel légitime. Encore un motif qui décrit une forme au
       lieu d'énoncer la règle : on cherche l'appel, pas sa ponctuation. */
    ok(/noterSante\([\s\S]{0,80}?refus: false/.test(whSrc),
      '⛔ le témoin n\'est plus écrit sur les signatures ACCEPTÉES : le tableau de bord ne '
      + 'pourrait plus dire « le fournisseur nous parle », seulement « il ne nous parle '
      + 'pas ». Un témoin qui ne connaît que l\'échec ne prouve jamais que ça marche.');
    /* ⛔ Et il ne doit JAMAIS faire échouer un encaissement. */
    var mNote = whSrc.match(/async function noterSante[\s\S]*?\n\}/);
    /* ⚠️ Ne PAS se contenter de chercher `catch (_)` : `catch (_) { throw _; }`
       le satisfait et relance quand même — démasqué par sabotage. On fait donc
       RÉELLEMENT exploser Firestore et on regarde si quelque chose remonte. */
    /* ⛔ ON REMPLACE LE MODULE FIREBASE DANS LE CACHE, pas sa propriété.
       1ʳᵉ version : je réassignais `fbMod.getFirebase` après coup. Sans effet —
       `webhook.js` fait `var getFirebase = require(...).getFirebase` AU
       CHARGEMENT et garde la référence. Le vrai Firebase était donc appelé,
       `fb.db` valait `null` faute de compte de service, la fonction sortait
       avant toute écriture, et le test passait VERT sans avoir rien franchi.
       Deuxième fois ce soir (E-217) : un test qui ne traverse pas son chemin
       ne prouve rien, même quand il « passe ».

       D'où le PRÉALABLE : si le faux Firestore n'a pas été touché, le contrôle
       ÉCHOUE au lieu de verdir à vide. */
    var cheminFb = require.resolve(path.join(RACINE, 'api', '_lib', 'firebase.js'));
    var cheminWh = require.resolve(path.join(RACINE, 'api', 'webhook.js'));
    var sauveFb = require.cache[cheminFb];
    var sauveWh = require.cache[cheminWh];
    var touche = 0;
    require.cache[cheminFb] = {
      id: cheminFb, filename: cheminFb, loaded: true, exports: {
        getFirebase: function () {
          return {
            admin: { firestore: { FieldValue: { increment: function () { return 1; } } } },
            db: { collection: function () { touche++; throw new Error('Firestore indisponible (simulé)'); } }
          };
        }
      }
    };
    delete require.cache[cheminWh];
    var whTest = null, aExplose = false;
    try {
      whTest = require(cheminWh);
      if (typeof whTest._noterSante === 'function') {
        try { await whTest._noterSante('revolut', { refus: true, motif: 'test' }); }
        catch (e) { aExplose = true; }
      }
    } catch (e) { /* signalé par le préalable ci-dessous */ }
    if (sauveFb) require.cache[cheminFb] = sauveFb; else delete require.cache[cheminFb];
    if (sauveWh) require.cache[cheminWh] = sauveWh; else delete require.cache[cheminWh];

    ok(whTest && typeof whTest._noterSante === 'function',
      '⛔ api/webhook.js n\'expose plus `_noterSante` : impossible de prouver que le témoin '
      + 'avale les pannes. Une lecture de source ne suffit pas — `catch (_) { throw _; }` a '
      + 'l\'air correct et relance quand même.');
    ok(touche > 0,
      '⛔⛔ PRÉALABLE NON FRANCHI : `noterSante` n\'a même pas tenté d\'écrire dans '
      + 'Firestore. Le test ne prouve donc RIEN — il serait vert quoi qu\'il arrive. '
      + '(C\'est le piège qui a fait passer ce contrôle deux fois de suite.)');
    ok(!aExplose,
      '⛔⛔ `noterSante` propage une panne Firestore : elle ferait échouer le webhook, donc '
      + 'PERDRE un paiement, pour une simple écriture de diagnostic. Mieux vaut un paiement '
      + 'traité sans trace qu\'un paiement perdu à cause de la trace.');
    /* ⛔ RGPD (J3) : ce document s'affiche et se copie en capture d'écran. */
    ok(mNote && !/email|receipt_email|adresse|\bnom\b/i.test(mNote[0]),
      '⛔ `noterSante` écrit une donnée personnelle dans le témoin. Ce document s\'affiche '
      + 'à l\'écran et part en capture : horodatages, compteurs et motif technique '
      + 'seulement (règle J3, audit p6-rgpd).');

    /* ── d quater) ⛔ `null` N'EST PAS `0` POUR UNE COMMISSION ────────────
       Une commission inconnue rendue à zéro ferait croire à une vente sans
       frais : la marge de CHAQUE ligne du compte de résultat serait fausse, et
       rien ne le signalerait — les chiffres auraient l'air parfaitement
       plausibles. L'écran doit donc distinguer « lue » de « introuvable ». */
    var mRelire = appSrc.match(/function comptaBrancherRelire[\s\S]*?\n  \}/);
    ok(mRelire && /commissionLue/.test(mRelire[0]),
      '⛔⛔ l\'écran de relecture ne distingue plus « commission lue » de « commission '
      + 'introuvable ». Une commission absente affichée comme 0 € ferait croire à une '
      + 'vente sans frais : la marge de chaque ligne du compte de résultat serait fausse, '
      + 'et les chiffres auraient l\'air plausibles.');
    /* ⚠️ 1ʳᵉ VERSION INCOMPLÈTE : elle ne regardait que l'écran. Le sabotage
       « le serveur écrase null en 0 » est passé au VERT — or c'est le côté le
       plus dangereux, puisqu'il est EN AMONT : l'écran ne pourrait même plus
       distinguer les deux cas. La règle vaut partout où la commission
       transite, pas à l'endroit où je l'ai écrite. */
    var fichiersCom = [APP, path.join(RACINE, 'api', 'admin.js'),
      path.join(RACINE, 'api', 'webhook.js'),
      path.join(RACINE, 'api', '_lib', 'paiement', 'revolut.js'),
      path.join(RACINE, 'api', '_lib', 'paiement', 'stripe.js')];
    fichiersCom.forEach(function (f) {
      if (!fs.existsSync(f)) return;
      var src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      /* ⚠️ Un `commissionCents\s*\|\|` ratait `commissionCents(o.payments) || 0` —
         l'appel s'intercale. On accepte donc ce qui suit le mot jusqu'au `||`,
         sans traverser de fin d'instruction. */
      ok(!/commissionCents[^;\n]*\|\|\s*0/.test(src),
        '⛔⛔ ' + path.basename(f) + ' applique `|| 0` à la commission. C\'est le sabotage '
        + 'S10 qui avait démasqué ce trou : un zéro se confond avec une vraie commission '
        + 'nulle, la vente paraît sans frais, et la marge de chaque ligne du compte de '
        + 'résultat devient fausse — avec des chiffres parfaitement plausibles.');
    });

    /* ── d quinquies) ⛔⛔ L'ADRESSE FAIT VIVRE LE CONTRÔLE FISCAL ────────
       `taxCheck` compare le territoire déclaré au code postal RÉELLEMENT
       collecté. Sans code postal, `expected` vaut `null`, `mismatch` reste faux
       quoi qu'il arrive : la garde A1 est SILENCIEUSEMENT morte. Tout marche,
       rien ne casse, et une protection ne protège plus rien.

       La commande de diagnostic doit donc porter une adresse — sinon le test
       ne prouve pas l'aller-retour, et on ne découvrirait le trou qu'en
       production, sur une vraie vente au mauvais taux. */
    var mTestAdr = admSrc.match(/type === 'revolut-commande-test'[\s\S]{0,2600}?metadata:[^\n]*/);
    ok(mTestAdr && /livraison:\s*\{/.test(mTestAdr[0]),
      '⛔⛔ la commande de diagnostic n\'envoie plus d\'adresse. Le test ne prouve donc '
      + 'plus que le code postal fait l\'aller-retour — or c\'est LUI qui fait vivre le '
      + 'contrôle fiscal détectif. Sans lui, `taxCheck` ne compare rien, `mismatch` reste '
      + 'faux, et on n\'apprend l\'erreur de taxe qu\'au contrôle.');
    ok(mTestAdr && /CP_DIAGNOSTIC/.test(mTestAdr[0]),
      '⛔ le code postal du diagnostic est écrit en dur au lieu de passer par la constante. '
      + 'Deux valeurs recopiées divergeront, et c\'est leur ÉGALITÉ qui prouve l\'aller-retour.');
    ok(/codePostalRetrouve/.test(admSrc),
      '⛔⛔ la relecture ne vérifie plus que le code postal revient IDENTIQUE. Elle dirait '
      + '« adresse ✅ » sur une adresse tronquée ou mal lue, et la garde fiscale serait '
      + 'muette en production sans que rien ne l\'annonce.');

    /* ── e) ⛔⛔ REVOLUT ACTIF NE RETOMBE JAMAIS SUR UN CHEMIN L'ANCIEN FOURNISSEUR ──────
       Le clic sur « Commander » se perdait EN SILENCE quand le champ carte
       Revolut n'était pas monté (script bloqué, réseau) : aucun des tests
       l'ancien fournisseur qui suivent ne matchait, et le clic finissait au dernier repli,
       sur le message FAUX « Paiement carte non configuré » suivi d'une bascule
       vers la crypto, désactivée. Le client se retrouvait dans une impasse
       alors que la page de paiement Revolut était affichée juste au-dessus. */
    /* ⚠️ 1ʳᵉ VERSION FRAGILE, démasquée dans la minute : elle exigeait
       `_urlPaiementHebergee` DANS le corps de `confirmPayment`. Sortir ce bloc
       dans une fonction dédiée — ce que la barrière des fonctions gelées
       imposait — la faisait rougir sur un code strictement meilleur. Elle
       testait un EMPLACEMENT, pas une règle.
       La règle est : `confirmPayment` SORT dès que le fournisseur est Revolut,
       sans condition sur le champ carte, et ce qu'elle appelle propose la page
       hébergée. On suit donc le nom de la fonction appelée, quel qu'il soit. */
    /* ⚠️ RÈGLE RÉÉCRITE LE 01/08/2026, après le retrait de l'ancien fournisseur. Il n'y a
       plus de « branches de l'ancien fournisseur » à éviter : elles n'existent plus. Ce qui
       reste vrai, et qui compte, c'est qu'un clic sur Payer aboutisse TOUJOURS
       à l'un des deux chemins Revolut — le champ carte, ou la page hébergée —
       et jamais à une impasse silencieuse. */
    var mConfirm = appSrc.match(/function confirmPayment\(\)[\s\S]*?\n  \}/);
    var sortieRev = mConfirm
      && /return\s+(secoursRevolut)\(/.exec(mConfirm[0]);
    ok(!!(mConfirm && /confirmerPaiementRevolut\(/.test(mConfirm[0])) && !!sortieRev,
      '⛔⛔ `confirmPayment` n\'aboutit plus systématiquement à un chemin Revolut. Il doit '
      + 'appeler `confirmerPaiementRevolut` quand le champ carte est monté, et retomber sur '
      + '`secoursRevolut` sinon. Toute autre issue est une impasse : le client clique, rien '
      + 'n\'aboutit, la vente est perdue sans que rien ne casse.');
    if (sortieRev) {
      var mSecours = appSrc.match(new RegExp('function ' + sortieRev[1] + '\\([\\s\\S]*?\\n  \\}'));
      /* ⚠️ 1ʳᵉ VERSION FAIBLE, démasquée par sabotage : elle se contentait de
         trouver `_urlPaiementHebergee` quelque part dans la fonction. Un
         `if (false) { window.open(_urlPaiementHebergee…) }` la laissait VERTE —
         la variable était bien là, elle ne servait simplement plus à rien.
         On exige les DEUX : la garde porte sur l'URL, et c'est cette URL qui
         est ouverte. */
      ok(mSecours && /if \(_urlPaiementHebergee\)/.test(mSecours[0])
         && /window\.open\(_urlPaiementHebergee/.test(mSecours[0]),
        '⛔⛔ `' + sortieRev[1] + '` n\'ouvre plus la page de paiement hébergée sous la '
        + 'garde de son URL. C\'est le SEUL chemin qui reste au client quand le champ '
        + 'carte n\'a pas pu se monter : sans elle, il lit un message et repart sans '
        + 'avoir payé.');
    }

    /* L'écran doit distinguer les TROIS états, et surtout ne pas crier sur un
       refus déjà réglé : un vieux refus suivi de succès est de l'histoire
       ancienne, l'afficher en rouge ferait chercher une panne réparée. */
    var mSante = appSrc.match(/function comptaBrancherSante[\s\S]*?\n  \}/);
    ok(mSante && /jamaisRecu/.test(mSante[0]) && /dernierRefusMotif/.test(mSante[0]),
      '⛔⛔ l\'écran de santé ne distingue plus « rien reçu » de « reçu mais refusé ». Ces '
      + 'deux cas demandent des gestes OPPOSÉS : recréer le webhook dans un cas, refaire '
      + 'le secret dans l\'autre. Les confondre envoie chercher la panne du mauvais côté.');
    /* ⛔ Le conseil doit dépendre du MOTIF. Le 01/08/2026 l'écran a conseillé de
       supprimer et recréer le webhook alors que le problème était une clé
       absente — et supprimer un webhook fait perdre son secret POUR TOUJOURS.
       Un mauvais conseil ici coûte une manipulation irréversible. */
    ok(mSante && /absente\|absent/.test(mSante[0]),
      '⛔⛔ l\'écran de santé donne le MÊME conseil quel que soit le motif du refus. Sur une '
      + 'clé manquante, il enverrait supprimer le webhook — geste IRRÉVERSIBLE, le secret '
      + 'de signature ne se ré-obtient jamais — pour un problème qui n\'a rien à voir.');
    ok(mSante && /dernierRefusMs\s*>\s*d\.dernierAccepteMs/.test(mSante[0]),
      '⛔ l\'écran ne compare plus la date du dernier refus à celle du dernier succès : un '
      + 'refus déjà réglé s\'afficherait en alerte rouge à chaque passage, et on '
      + 'apprendrait à ne plus la regarder.');

    /* ── f) ⛔ L'ENVIRONNEMENT NE SE DEVINE PAS DEPUIS UNE URL ────────────
       Chercher « sandbox » dans `urlHebergee` : si ce champ est absent, on
       charge le SDK de PRODUCTION avec un jeton de bac à sable — formulaire
       mort — et le repli n'a pas d'URL non plus. Double panne muette. */
    ok(!/\/sandbox\/\.test\(_urlPaiementHebergee\)\s*\)\s*\?/.test(appSrc),
      '⛔ le front DÉDUIT l\'environnement Revolut en cherchant « sandbox » dans une URL, '
      + 'au lieu de lire ce que le serveur annonce (`modeTest`). Si `urlHebergee` manque, '
      + 'on charge le SDK de production avec un jeton de bac à sable : formulaire mort, '
      + 'et aucun repli.');

    /* ── i) ⛔⛔ LE LECTEUR DE RÉPONSE NE DOIT PAS JETER LE MODE D'EMPLOI ──
       Vécu le 01/08/2026, sur un vrai clic : le bouton du webhook a affiché
       « Erreur réseau : HTTP 400 ». Le serveur avait pourtant répondu quoi
       corriger, mot pour mot. Deux défauts empilés :
         · `adminReadResponse` ne lisait que `data.error` (anglais), alors que
           tous les diagnostics paiement répondent `erreur` (français) ;
         · du coup il JETAIT avant le `.then`, donc le code de mise en forme de
           `etape` et `indice` — écrit exprès pour ça — n'était jamais atteint.
       Un outil de diagnostic dont le diagnostic est mort. */
    var mLect = appSrc.match(/function adminReadResponse[\s\S]*?\n  \}/);
    ok(mLect && /data\.erreur/.test(mLect[0]),
      '⛔⛔ `adminReadResponse` ne lit plus `data.erreur` (français). Les diagnostics '
      + 'paiement répondent dans ce vocabulaire : leur message serait jeté et l\'écran '
      + 'n\'afficherait qu\'un numéro HTTP. C\'est ce qui a fait perdre du temps le '
      + '01/08/2026.');
    ok(mLect && /data\.indice/.test(mLect[0]),
      '⛔ `adminReadResponse` jette l\'`indice` renvoyé par le serveur. C\'est justement '
      + 'la phrase qui dit QUOI FAIRE — sans elle il reste un code d\'erreur nu.');
    /* ⚠️ Les deux lignes au-dessus lisent le SOURCE. On exécute maintenant la
       fonction pour de vrai : on lui sert la réponse exacte que le serveur a
       envoyée le 01/08/2026, et on regarde ce qu'elle produit. Une regex dit à
       quoi le code ressemble ; cet appel dit ce qu'il FAIT. */
    if (mLect) {
      var fabrique = new Function('return (' + mLect[0].replace(/^\s*function adminReadResponse/, 'function') + ')');
      var lecteur = fabrique();
      var fausseReponse = {
        ok: false, status: 400,
        headers: { get: function () { return 'application/json'; } },
        text: function () {
          return Promise.resolve(JSON.stringify({
            ok: false, etape: 'origine',
            erreur: 'Impossible de determiner l\'adresse publique du site.',
            indice: 'Poser ALLOWED_ORIGINS sur Vercel puis redeployer.'
          }));
        }
      };
      /* ⛔ `await` OBLIGATOIRE. Sans lui, ce bloc rendait la main avant que la
         promesse ne se résolve : les erreurs étaient poussées APRÈS le `return
         errors`, donc jamais lues. Vérifié par sabotage le 01/08/2026 — le
         lecteur cassé ne faisait rougir QUE l'assertion par regex, la preuve
         comportementale restait muette. Un harnais vert sans avoir rien
         franchi, exactement ce que la règle des harnais interdit. */
      await lecteur(fausseReponse, '/api/admin?type=revolut-webhook').then(function () {
        errors.push('[check-paiement] ⛔ `adminReadResponse` ACCEPTE une réponse 400 : '
          + 'une erreur serveur passerait pour un succès.');
      }, function (e) {
        var m = String((e && e.message) || '');
        if (m.indexOf('adresse publique') === -1) {
          errors.push('[check-paiement] ⛔⛔ le message produit par `adminReadResponse` ne '
            + 'contient PAS l\'erreur du serveur. Vu : « ' + m + ' ». C\'est exactement le '
            + '« HTTP 400 » qui a fait chercher la panne du mauvais côté le 01/08/2026.');
        }
        if (m.indexOf('ALLOWED_ORIGINS') === -1) {
          errors.push('[check-paiement] ⛔⛔ le message produit ne contient PAS l\'indice du '
            + 'serveur — la phrase qui dit QUOI FAIRE. Vu : « ' + m + ' ».');
        }
        if (!e || !e.reponse || e.reponse.etape !== 'origine') {
          errors.push('[check-paiement] ⛔ le corps de la réponse n\'est plus attaché à '
            + 'l\'erreur (`err.reponse`) : aucun appelant ne peut mettre en forme l\'étape.');
        }
      });
    }

    ok(!/Erreur réseau : ' \+ escapeHTML\(e\.message/.test(appSrc),
      '⛔ un bouton admin annonce « Erreur réseau » sur une réponse du serveur. Un 400 '
      + 'n\'est pas une coupure : ce libellé envoie chercher la panne du mauvais côté.');

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

  /* ── g) ⛔ L'ORIGINE PUBLIQUE NE SE RECOPIE PAS DEPUIS LE CLIENT ───────
     Deux URL sortent du site et reviennent de l'extérieur : l'adresse de
     retour après paiement, et l'adresse du webhook déclarée chez Revolut.
     Toutes deux étaient fabriquées en recopiant l'en-tête `Origin` — qui
     vient du navigateur. Deux conséquences distinctes :
       · sans `Origin` (il manque plus souvent qu'on ne croit), la cible valait
         « /api/webhook », une adresse relative que Revolut refuse ;
       · avec un `Origin` forgé, un tiers choisirait où atterrissent nos
         clients après avoir payé, et où partent les notifications.
     Test par APPEL réel, pas par lecture de source. */
  var httpLib = null;
  try { httpLib = require(path.join(RACINE, 'api', '_lib', 'http.js')); } catch (eH) {
    ok(false, '⛔ api/_lib/http.js illisible : ' + (eH && eH.message));
  }
  if (httpLib && typeof httpLib.origineSure === 'function') {
    var ao = process.env.ALLOWED_ORIGINS, pb = process.env.PUBLIC_BASE_URL;
    try {
      process.env.ALLOWED_ORIGINS = 'https://exemple-liste.test';
      delete process.env.PUBLIC_BASE_URL;

      ok(httpLib.origineSure({ headers: { origin: 'https://exemple-liste.test' } })
        === 'https://exemple-liste.test',
        '⛔ une origine POURTANT LISTÉE est refusée : ni l\'URL de retour après paiement '
        + 'ni l\'adresse du webhook ne pourraient plus être fabriquées.');

      [
        ['https://pirate.test', 'origine non listée'],
        ['http://exemple-liste.test', 'même hôte mais en clair (http)'],
        ['https://exemple-liste.test.pirate.test', 'suffixe trompeur'],
        ['null', 'origine « null » (iframe bac à sable)']
      ].forEach(function (c) {
        ok(httpLib.origineSure({ headers: { origin: c[0] } }) === null,
          '⛔⛔ `origineSure` accepte « ' + c[0] + ' » (' + c[1] + '). Un tiers choisirait '
          + 'alors où atterrissent nos clients après avoir payé, et où Revolut envoie ses '
          + 'notifications de paiement.');
      });

      ok(httpLib.origineSure({ headers: {} }) === null,
        '⛔ sans origine ET sans PUBLIC_BASE_URL, `origineSure` doit rendre `null`, pas une '
        + 'chaîne vide. Une chaîne vide fabrique « /api/webhook » — une adresse relative '
        + 'que le fournisseur refuse, avec un message qui ne dit pas pourquoi.');

      /* Le repli serveur-à-serveur est lui aussi vérifié : une variable mal
         collée ne doit pas devenir une adresse de redirection. */
      process.env.PUBLIC_BASE_URL = 'https://repli.test/';
      ok(httpLib.origineSure({ headers: {} }) === 'https://repli.test',
        'PUBLIC_BASE_URL doit servir de repli quand aucun navigateur n\'est en jeu '
        + '(tâche planifiée, appel serveur à serveur), barre finale retirée.');
      ['pirates-tools.com', 'http://repli.test', 'https://repli.test/chemin', 'n\'importe quoi'].forEach(function (v) {
        process.env.PUBLIC_BASE_URL = v;
        ok(httpLib.origineSure({ headers: {} }) === null,
          '⛔ PUBLIC_BASE_URL = « ' + v + ' » est accepté sans être une origine https valide. '
          + 'Une variable mal collée deviendrait une adresse de redirection.');
      });
    } finally {
      if (ao === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = ao;
      if (pb === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = pb;
    }
  }

  /* ── h) ⛔ LE CLIENT DOIT POUVOIR REVENIR APRÈS AVOIR PAYÉ ─────────────
     Aucune `urlRetour` n'était passée : le client qui paie sur la page
     hébergée restait sur checkout.revolut.com, ne voyait jamais /merci et sa
     commande n'était pas finalisée côté navigateur. Le webhook sauvait la
     vente ; le client, lui, repartait. */
  var CPI = path.join(RACINE, 'api', 'create-payment-intent.js');
  if (fs.existsSync(CPI)) {
    var cpiSrc = fs.readFileSync(CPI, 'utf8');
    ok(/urlRetour\s*:/.test(cpiSrc),
      '⛔⛔ `create-payment-intent.js` ne passe plus `urlRetour` : aucune adresse de '
      + 'retour n\'est déclarée chez le fournisseur. Le client qui paie sur la page '
      + 'hébergée reste chez lui, ne revient jamais sur le site et ne voit jamais sa '
      + 'confirmation. La vente est encaissée, le client croit qu\'elle a échoué.');
    ok(/origineSure/.test(cpiSrc),
      '⛔ l\'adresse de retour est fabriquée sans passer par `origineSure` : elle recopie '
      + 'donc une valeur venue du client. C\'est un tiers qui choisirait où atterrissent '
      + 'nos clients après avoir payé.');
    ok(/modeTest\s*:/.test(cpiSrc),
      '⛔ le serveur n\'annonce plus l\'environnement (`modeTest`) : le front est contraint '
      + 'de le deviner depuis une URL, et se trompe dès que `urlHebergee` manque.');
  }

  /* ── ⛔⛔ LE TERRITOIRE FISCAL NE VIENT QUE DU CODE POSTAL DE LIVRAISON ─
     Garde posée le 01/08/2026, AVANT d'ajouter un champ « département » au
     compte client. C'est l'ordre qui compte : le filet d'abord, la
     fonctionnalité ensuite.

     Le trou déjà payé (A1) : `body.territory` servait au calcul, donc un appel
     direct pouvait déclarer Mayotte — TVA 0 %, octroi 0 % — et payer ≈ 19 % de
     moins sur n'importe quelle livraison. Il a été fermé en dérivant le
     territoire du CODE POSTAL, côté serveur.

     ⛔ Un « département » stocké dans le profil est une donnée DÉCLARATIVE de
     plus. Pratique pour l'affichage et le contact ; mortelle si elle entre un
     jour dans le calcul du montant. Le client changerait son profil et
     paierait moins. Ce contrôle interdit à quoi que ce soit d'autre que le
     code postal de décider du territoire facturé. */
  var CPI2 = path.join(RACINE, 'api', 'create-payment-intent.js');
  if (fs.existsSync(CPI2)) {
    var src2 = fs.readFileSync(CPI2, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok(/var territory = postal\.territoryFromPostal\(postalCode\)/.test(src2),
      '⛔⛔ le territoire facturé ne vient plus de `postal.territoryFromPostal(postalCode)`. '
      + 'C\'est le trou A1 rouvert : une valeur déclarée par le client (corps de requête, '
      + 'profil, préférence d\'affichage) déciderait du taux de taxe, et une livraison '
      + 'déclarée à Mayotte paierait ≈ 19 % de moins.');
    ok(!/territory\s*=\s*[^;]*body\.territory/.test(src2),
      '⛔⛔ `body.territory` est réutilisé pour décider du territoire FACTURÉ. C\'est '
      + 'exactement le défaut A1 : le client choisit son taux de taxe.');
    /* Le profil ne doit pas non plus s'inviter dans ce calcul. */
    ok(!/territory\s*=\s*[^;]*(profil|profile|departement|département)/i.test(src2),
      '⛔⛔ un champ de PROFIL décide du territoire facturé. Le département du compte est '
      + 'déclaratif : le client le change, et il paie moins. Seul le code postal de '
      + 'LIVRAISON fait foi.');
  }

  /* ── ⛔ LES CHAMPS DU PROFIL DOIVENT ÊTRE AUTORISÉS PAR LES RÈGLES ──────
     `firestore.rules` impose une allowlist stricte sur users/{uid}. Un champ
     écrit par le front mais absent de cette liste fait refuser l'écriture
     ENTIÈRE — pas seulement ce champ. Le client voit « profil non enregistré »
     et perd aussi son nom et son téléphone, sans comprendre.
     ⚠️ Et une règle modifiée n'a d'effet qu'une fois DÉPLOYÉE. */
  var RULES = path.join(RACINE, 'firestore.rules');
  var APPSRC = fs.existsSync(APP) ? fs.readFileSync(APP, 'utf8') : '';
  if (fs.existsSync(RULES) && APPSRC) {
    var rulesSrc = fs.readFileSync(RULES, 'utf8');
    var mAllow = rulesSrc.match(/match \/users\/\{userId\}[\s\S]*?hasOnly\(\s*\[([^\]]*)\]/);
    var autorises = mAllow ? mAllow[1].replace(/['\s]/g, '').split(',').filter(Boolean) : [];
    ok(autorises.length > 0,
      '⛔ impossible de lire l\'allowlist des champs de profil dans firestore.rules : le '
      + 'contrôle ne peut plus vérifier qu\'un champ écrit est autorisé.');
    ['addrLine1', 'addrPostal', 'addrCity', 'territory'].forEach(function (champ) {
      ok(autorises.indexOf(champ) !== -1,
        '⛔⛔ le champ de profil « ' + champ + ' » n\'est pas dans l\'allowlist de '
        + 'firestore.rules. Firestore refusera l\'écriture ENTIÈRE du profil : le client '
        + 'perdra aussi son nom et son téléphone en enregistrant, sans comprendre pourquoi.');
    });
    /* ⛔ Le territoire du profil est BORNÉ. Une chaîne libre finit toujours par
       être imprimée quelque part. */
    ok(/territory in \['971', '972', '973', '974', '976'\]/.test(rulesSrc),
      '⛔ le `territory` du profil n\'est plus borné aux cinq codes livrés : n\'importe '
      + 'quelle chaîne pourrait y être écrite.');
  }

  /* ── ⛔ LE TÉLÉPHONE EST EXIGÉ À LA COMMANDE ────────────────────────────
     Il manquait entièrement du parcours (grep : 0 occurrence le 01/08/2026).
     Un livreur devant une porte fermée n'a alors AUCUN moyen de joindre le
     client : le colis repart, et la vente est à refaire. */
  if (APPSRC) {
    ok(/id="payAddrPhone"/.test(fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8')),
      '⛔⛔ le champ téléphone a disparu du formulaire de livraison. Un livreur devant une '
      + 'porte fermée ne peut plus joindre personne : le colis repart et la vente est à '
      + 'refaire.');
    var mValide = APPSRC.match(/function validatePayAddress[\s\S]*?\n  \}/);
    ok(mValide && /addr\.phone/.test(mValide[0]),
      '⛔⛔ le téléphone n\'est plus exigé pour valider l\'adresse de livraison. Le champ '
      + 'peut exister et rester vide : on croit l\'avoir demandé, on ne l\'a pas.');
    /* ── ⛔⛔ L'E-MAIL EST EXIGÉ, MÊME SANS COMPTE ────────────────────────
       On peut commander sans être connecté — mesuré : aucune garde n'exige un
       compte pour ouvrir le paiement. Or l'e-mail envoyé au fournisseur valait
       `(_currentUser && _currentUser.email) || ''`, donc VIDE pour un invité.

       Trois conséquences, toutes silencieuses :
         · Revolut exige l'e-mail en production → carte refusée ;
         · `customerEmail` restait indéfini côté serveur → aucune facture ;
         · aucune confirmation envoyée → le client a payé, et plus personne ne
           peut le joindre.
       Le bac à sable ne montrait rien : l'user était connecté à chaque test. */
    ok(/id="payAddrEmail"/.test(fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8')),
      '⛔⛔ le champ e-mail a disparu du formulaire de paiement. Un client sans compte '
      + 'paierait sans qu\'on puisse lui envoyer sa facture ni sa confirmation — et '
      + 'Revolut peut refuser la carte, faute d\'e-mail.');
    var mValid2 = APPSRC.match(/function validatePayAddress[\s\S]*?\n  \}/);
    /* ⚠️ Chercher `emailOk` ne suffit PAS : la variable reste définie même si
       on la retire de la condition. Démasqué par sabotage. On vérifie qu'elle
       entre RÉELLEMENT dans le calcul de `complete`. */
    ok(mValid2 && /var complete = [^;]*emailOk/.test(mValid2[0]),
      '⛔⛔ l\'e-mail n\'entre plus dans la validation de la commande : le champ peut '
      + 'exister, être vide, et la commande partir quand même. On croit l\'avoir demandé, '
      + 'on ne l\'a pas.');
    ok(/customerEmail:\s*ship\.addr\.email/.test(APPSRC),
      '⛔⛔ l\'e-mail du FORMULAIRE n\'est plus envoyé au serveur. Pour un client sans '
      + 'compte il redevient indéfini : ni facture, ni confirmation.');
    /* DEUX endroits l'envoient : au montage du champ carte et au submit. Les
       deux comptent — la doc autorise les deux, et un seul suffirait à ce que
       l'autre parte vide. */
    var envoisEmail = (APPSRC.match(/email:\s*adr\.email/g) || []).length;
    ok(envoisEmail === 2,
      '⛔ l\'e-mail du formulaire part au fournisseur à ' + envoisEmail + ' endroit(s) au '
      + 'lieu de 2 (montage du champ carte + submit). Revolut l\'exige en production : la '
      + 'carte serait refusée sans explication.');

    /* ── ⛔⛔ LE NOM DU TITULAIRE N'EST PAS LE NOM DE LIVRAISON ───────────
       Les types officiels de Revolut sont explicites : `name` est le
       « Cardholder name in form of 'FirstName LastName' ». On y envoyait
       `adr.name`, c'est-à-dire le nom du DESTINATAIRE de la livraison.

       Ce n'est pas la même personne : un artisan paie souvent avec la carte de
       son entreprise, ou fait livrer chez son client. La banque compare le nom
       transmis à celui du porteur — un écart peut faire refuser la carte, et le
       client n'a alors aucun moyen de comprendre pourquoi. Une vente perdue en
       silence, en production seulement.

       Le champ est donc saisi à part, et il conditionne le bouton : `required`
       hors d'un <form> n'empêche rien. */
    ok(/id="payCardName"/.test(fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8')),
      '⛔⛔ le champ « Nom inscrit sur la carte » a disparu. On renverrait le nom de '
      + 'LIVRAISON comme nom du porteur : la banque peut refuser la carte, et le client '
      + 'ne saura jamais pourquoi.');
    ok(/name:\s*nomTitulaireCarte\(/.test(APPSRC),
      '⛔⛔ le submit n\'envoie plus le nom du TITULAIRE mais autre chose. Les types '
      + 'Revolut disent « Cardholder name » : y mettre le nom de livraison expose à un '
      + 'refus bancaire silencieux.');
    ok(/phone:\s*adr\.phone/.test(APPSRC),
      '⛔ le téléphone n\'est plus transmis au fournisseur alors qu\'on l\'exige du '
      + 'client. `CustomerDetails.phone` l\'accepte, et c\'est une donnée de plus pour la '
      + 'vérification anti-fraude — une donnée collectée sans usage n\'aurait pas dû '
      + 'être demandée.');

    /* ── ⛔ LA CASE « LA CARTE EST À MON NOM » CHOISIT LA SOURCE ─────────
       Cochée, le nom du titulaire vient de l'adresse saisie : le client ne
       retape rien. Décochée, SEUL le champ dédié fait foi — sinon on renverrait
       le nom du destinataire à la banque, c'est-à-dire exactement le défaut
       qu'on venait de corriger, réintroduit par un raccourci de confort. */
    var mNomT = APPSRC.match(/function nomTitulaireCarte[\s\S]*?\n  \}/);
    ok(mNomT && /payCardSame/.test(mNomT[0]),
      '⛔ `nomTitulaireCarte` ne consulte plus la case « la carte est à mon nom » : soit '
      + 'le client doit retaper son nom pour rien, soit on envoie le nom du destinataire '
      + 'à la banque.');
    /* ⚠️ Chercher la garde ne suffit PAS : un repli ajouté APRÈS elle la laisse
       intacte et rétablit le défaut. Démasqué par sabotage. On exécute donc la
       vraie fonction sur les deux états de la case. */
    if (mNomT) {
      var fabNom = new Function('return (' + mNomT[0].replace(/^\s*function nomTitulaireCarte/, 'function') + ')');
      function nomAvec(coche, saisi) {
        var faux = { getElementById: function (id) {
          if (id === 'payCardSame') return { checked: coche };
          if (id === 'payCardName') return { value: saisi };
          return null;
        } };
        var vrai = global.document; global.document = faux;
        try { return fabNom()({ name: 'DESTINATAIRE Livraison' }); }
        finally { global.document = vrai; }
      }
      ok(nomAvec(true, '') === 'DESTINATAIRE Livraison',
        '⛔ case COCHÉE : le nom du titulaire devrait reprendre celui de l\'adresse. Le '
        + 'client aurait à retaper une information qu\'il vient de saisir.');
      ok(nomAvec(false, 'SOCIETE Martin') === 'SOCIETE Martin',
        '⛔ case DÉCOCHÉE : c\'est le champ dédié qui doit faire foi.');
      ok(nomAvec(false, '') === '',
        '⛔⛔ case DÉCOCHÉE et champ vide : le nom du DESTINATAIRE est renvoyé en repli. '
        + 'Le client a explicitement dit que la carte n\'est PAS à son nom — lui '
        + 'substituer l\'autre nom annule sa correction, en silence, et la banque peut '
        + 'refuser la carte.');
    }
    ok(/id="payCardSame"/.test(fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8')),
      '⛔ la case « la carte est à mon nom » a disparu : le client devra retaper son nom '
      + 'à chaque commande, alors qu\'il vient de le saisir juste au-dessus.');

    /* ── ⛔ LE BOUTON « COMMANDER » NE MENT PAS ───────────────────────────
       Il restait LUMINEUX même quand le clic ne pouvait rien faire :
       `confirmPayment` refusait poliment si les CGV n'étaient pas cochées. Un
       bouton qui a l'air actif et ne répond pas, c'est un client qui clique,
       ne comprend pas, et s'en va.

       Trois raisons de le désactiver, UNE seule propriété `disabled` : sans un
       endroit unique qui tranche, la dernière ligne exécutée gagne et le bouton
       se rallume au mauvais moment. On exécute donc la vraie fonction. */
    var mMaj = APPSRC.match(/function majBoutonPayer\(\)[\s\S]*?\n  \}/);
    ok(!!mMaj, '⛔ `majBoutonPayer` a disparu : plus rien ne décide de l\'état du bouton '
      + 'de paiement, et les conditions se contrediraient à nouveau.');
    if (mMaj) {
      var fab = new Function('doc', 'return (' + mMaj[0].replace(/^\s*function majBoutonPayer/, 'function') + ')');
      /* `_carteComplete` est une variable de module dans app.js ; `new Function`
         s'exécute au niveau global et l'y cherchera. On la pose donc là, et on
         la retire après — un test qui laisse traîner un global fausse le
         suivant. */
      function essai(cgvCoche, carteEnAttente, enCours, nomSaisi, memeNom, carteFinie) {
        var btn = { dataset: {}, disabled: false };
        if (carteEnAttente) btn.dataset.attenteCarte = '1';
        if (enCours) btn.dataset.enCours = '1';
        var cgv = { checked: cgvCoche };
        var nom = { value: (nomSaisi === undefined) ? 'Prenom Nom' : nomSaisi };
        var same = { checked: (memeNom === undefined) ? false : memeNom };
        var faux = { getElementById: function (id) {
          if (id === 'payModalConfirm') return btn;
          if (id === 'payCgvOk') return cgv;
          if (id === 'payCardName') return nom;
          if (id === 'payCardSame') return same;
          return null;
        } };
        var vraiDoc = global.document;
        global.document = faux;
        global._carteComplete = (carteFinie === undefined) ? true : carteFinie;
        try { fab()(); }
        finally { global.document = vraiDoc; delete global._carteComplete; }
        return btn.disabled;
      }
      ok(essai(false, false, false) === true,
        '⛔⛔ le bouton « Commander » reste ACTIF alors que les CGV ne sont pas cochées. '
        + 'Le clic sera refusé : le client clique, rien ne se passe, il ne comprend pas. '
        + 'Le consentement est aussi exigé AVANT tout débit en vente à distance.');
      ok(essai(true, false, false) === false,
        '⛔ le bouton reste ÉTEINT alors que tout est en ordre (CGV cochées, champ carte '
        + 'monté) : plus personne ne peut payer.');
      ok(essai(true, true, false) === true,
        '⛔ le bouton est actif alors que le champ carte n\'est pas monté : le clic ne peut '
        + 'rien envoyer.');
      ok(essai(true, false, true) === true,
        '⛔⛔ le bouton se rallume pendant un paiement EN COURS. Un second clic partirait '
        + 'sur un paiement déjà en vol — double débit.');
      ok(essai(true, false, false, '') === true,
        '⛔⛔ le bouton est actif alors que le nom du TITULAIRE est vide. Revolut le reçoit '
        + 'alors vide, et la banque peut refuser la carte sans que le client comprenne.');
      /* ⛔ Case « la carte est à mon nom » COCHÉE : le champ dédié est masqué et
         vide, et c'est NORMAL — le nom vient de l'adresse. Exiger le champ dans
         ce cas bloquerait tout le monde sur un champ qu'ils ne voient même pas. */
      ok(essai(true, false, false, '', true, false) === true,
        '⛔⛔ le bouton est ALLUMÉ alors que le champ carte n\'est pas complet. Le client '
        + 'clique avec un numéro incomplet ou faux, la banque refuse, et il croit sa carte '
        + 'en cause. Revolut lève `onStatusChange.completed` quand les trois parties sont '
        + 'valides — c\'est SA validation, la seule qui fasse foi.');
      ok(essai(true, false, false, '', true) === false,
        '⛔⛔ le bouton reste ÉTEINT alors que la case « la carte est à mon nom » est '
        + 'cochée. Le client ne voit AUCUN champ à remplir et ne peut pas commander : '
        + 'blocage total, sans explication possible.');
    }

    /* ── ⛔⛔ LE PANIER SE VIDE APRÈS UN ACHAT PAYÉ ────────────────────────
       Constaté le 01/08/2026 sur le premier achat mené de bout en bout : le
       client payait, arrivait sur la page Merci, et retrouvait son outil ENCORE
       AU PANIER. Rien ne l'empêchait de repayer la même chose.

       ⚠️ Le défaut était ANTÉRIEUR à Revolut : il a traversé toute la période
       l'ancien fournisseur sans être vu, parce qu'aucun achat n'avait jamais été mené
       jusqu'au bout. C'est le genre de trou qu'aucun test unitaire n'attrape —
       il ne se voit qu'en faisant vraiment le parcours.

       ⛔ Et il doit être vidé au BON endroit : dans la branche « paiement
       prouvé », jamais au clic sur « Commander ». Un client dont la carte est
       refusée doit retrouver son panier intact — sinon il devrait tout
       reprendre, et il ne le ferait pas. */
    var mVider = APPSRC.match(/function viderPanierApresAchat[\s\S]*?\n  \}/);
    ok(mVider && /clearCart\s*\(/.test(mVider[0]),
      '⛔⛔ le panier n\'est plus vidé après un achat payé. Le client paie, arrive sur la '
      + 'page Merci, et retrouve son outil au panier : rien ne l\'empêche de repayer la '
      + 'même chose.');
    /* Elle doit être APPELÉE, pas seulement exister — et depuis la branche qui
       crédite la fidélité, celle du paiement prouvé. */
    var appelsVider = APPSRC.replace(/function\s+viderPanierApresAchat/g, '');
    ok(/viderPanierApresAchat\s*\(\s*\)/.test(appelsVider),
      '⛔⛔ `viderPanierApresAchat` existe mais n\'est appelée nulle part. Le code peut '
      + 'être parfait : s\'il ne tourne jamais, le panier reste plein après paiement.');
    var mMerci = APPSRC.match(/addLoyaltyPurchase\(totalNum\)[\s\S]{0,400}?\n    \}/);
    ok(mMerci && /viderPanierApresAchat/.test(mMerci[0]),
      '⛔ le panier n\'est plus vidé DANS la branche du paiement prouvé. Vidé ailleurs — '
      + 'au clic sur « Commander », par exemple — un client dont la carte est refusée '
      + 'perdrait son panier et devrait tout reprendre.');

    ok(/phone: ship\.addr\.phone/.test(APPSRC),
      '⛔ le téléphone saisi n\'est plus transmis au serveur : il serait demandé au client '
      + 'puis jeté, ce qui est pire que ne pas le demander.');

    /* ⛔⛔ ET IL DOIT SERVIR. Le 01/08/2026 il était collecté, rendu
       OBLIGATOIRE, transporté jusqu'à la metadata… et jeté : `grep shipPhone`
       ne trouvait AUCUN usage en aval. Une donnée exigée sans usage fait perdre
       du temps au client, n'aide personne, et contrevient à la minimisation
       (J3). Son usage réel : le livreur devant une porte fermée. */
    var whSrc2 = fs.readFileSync(WH, 'utf8');
    ok(/customerPhone/.test(whSrc2),
      '⛔⛔ le téléphone n\'entre plus dans le journal des paiements : il est demandé au '
      + 'client, puis perdu. Une donnée obligatoire sans usage est une donnée qu\'il ne '
      + 'fallait pas collecter (minimisation, J3).');
    ok(/shipPhone: \(pi\.metadata/.test(whSrc2) && /model\.shipPhone/.test(whSrc2),
      '⛔⛔ l\'e-mail de commande ne porte plus le téléphone de livraison. Il faudrait '
      + 'rouvrir l\'administration pour chaque colis — et le champ qu\'on impose au client '
      + 'redeviendrait décoratif.');
    ok(/model\.shipAddress/.test(whSrc2),
      '⛔ l\'e-mail de commande ne dit plus OÙ livrer. Préparer un colis exigerait de '
      + 'rouvrir l\'administration à chaque fois.');

    /* ── ⛔ PRÉ-REMPLIR N'EST PAS IMPOSER ─────────────────────────────────
       On livre souvent ailleurs que chez soi : un chantier, un client, une
       famille. Les champs doivent rester modifiables, et le pré-remplissage
       suivre l'ordre voulu — dernière adresse livrée, puis compte, puis rien. */
    ok(/prof\.addrLine1 \|\| prof\.address/.test(APPSRC),
      '⛔ le pré-remplissage ne suit plus l\'ordre « dernière adresse livrée, sinon celle '
      + 'du compte, sinon rien ». Un client qui n\'a jamais commandé et n\'a pas d\'adresse '
      + 'au profil doit voir des champs VIDES, pas une valeur inventée.');
    ok(/function memoriserAdresseLivraison/.test(APPSRC),
      '⛔ l\'adresse validée n\'est plus mémorisée : le client retapera tout à chaque '
      + 'commande, alors qu\'il vient de nous la donner.');
    var mMem = APPSRC.match(/function memoriserAdresseLivraison[\s\S]*?\n  \}/);
    ok(mMem && /catch\s*\(/.test(mMem[0]),
      '⛔⛔ la mémorisation de l\'adresse peut interrompre un paiement en cours. Le confort '
      + 'ne passe JAMAIS devant l\'encaissement : un profil qui refuse l\'écriture doit '
      + 'échouer en silence.');
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
