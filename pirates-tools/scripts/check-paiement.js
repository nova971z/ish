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

module.exports = function () {
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

  /* ── 4. Le module Revolut refuse FORT tant qu'il est vide ──────────────
     Un module qui rendrait des valeurs vides ferait croire qu'on encaisse. */
  ok(revolut.estConfigure() === false,
    'le module Revolut se déclare configuré alors qu\'il est vide — un point d\'entrée '
    + 'pourrait croire qu\'il peut encaisser.');
  ['creerPaiement', 'lirePaiement', 'rembourser'].forEach(function (op) {
    var aLeve = false;
    try { revolut[op]('x'); } catch (e) {
      aLeve = /pas encore|not implemented|étape/i.test(e.message);
    }
    ok(aLeve, 'revolut.' + op + '() ne lève pas d\'erreur explicite. Un module vide qui '
      + 'rend une valeur au lieu de refuser est pire que pas de module.');
  });
  var sig = revolut.verifierSignature(Buffer.from('{}'), {});
  ok(sig && sig.ok === false,
    'revolut.verifierSignature() doit REFUSER, pas lever : un webhook qui explose '
    + 'renvoie 500 et invite à re-livrer une requête qu\'on ne saura jamais traiter.');

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

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-paiement OK');
}
