/* check-revolut.js — LE MODULE REVOLUT DIT-IL LA VÉRITÉ, HORS LIGNE ?
   ─────────────────────────────────────────────────────────────────────────
   Le module Revolut a été écrit AVANT qu'un seul appel réseau ait été possible
   (le compte bac à sable n'existait pas encore). Tout ce qui est PUR doit donc
   être éprouvé ici, sinon la première vérification aurait lieu sur un vrai
   paiement — c'est-à-dire trop tard.

   Trois choses sont vérifiées, et ce sont les trois qui coûtent de l'argent :

     1. la SIGNATURE, contre le vecteur de test officiel de Revolut ;
     2. la COMMISSION, sur un ordre réessayé — le piège du double tableau ;
     3. les ÉTATS, dont le fait qu'un paiement raté n'est pas une commande
        ratée.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-revolut] ' + m); }
  function pres(a, b, t, m) { ok(Math.abs(a - b) <= t, m + ' (attendu ' + b + ', obtenu ' + a + ')'); }

  var R, socle;
  try {
    R = require(path.join(__dirname, '..', 'api', '_lib', 'paiement', 'revolut.js'));
    socle = require(path.join(__dirname, '..', 'api', '_lib', 'paiement', 'index.js'));
  } catch (e) {
    return ['check-revolut : module illisible — ' + e.message];
  }

  /* ── 1. SIGNATURE — vecteur de test OFFICIEL de la documentation ───────
     Si cette assertion tombe, l'implémentation ne correspond plus à ce que
     Revolut signe : tous les webhooks seraient rejetés (panne bruyante), ou —
     pire si on assouplissait — acceptés à tort. */
  var SECRET = 'wsk_r59a4HfWVAKycbCaNO1RvgCJec02gRd8';
  var TS = '1683650202360';
  var RAW = '{"data":{"id":"645a7696-22f3-aa47-9c74-cbae0449cc46","new_state":"completed",'
    + '"old_state":"pending","request_id":"app_charges-9f5d5eb3-1e06-46c5-b1c0-3914763e0bcb"},'
    + '"event":"TransactionStateChanged","timestamp":"2023-05-09T16:36:38.028960Z"}';
  var ATTENDU = 'v1=bca326fb378d0da7f7c490ad584a8106bab9723d8d9cdd0d50b4c5b3be3837c0';

  ok(R.calculerSignature(SECRET, TS, Buffer.from(RAW, 'utf8')) === ATTENDU,
    '⛔ la signature ne correspond plus au VECTEUR DE TEST OFFICIEL de Revolut. '
    + 'Soit l\'algorithme a été modifié, soit le corps est altéré avant hachage.');

  ok(R.calculerSignature(SECRET, TS, RAW) === ATTENDU,
    'la signature doit être identique que le corps arrive en Buffer ou en chaîne.');

  ok(R.calculerSignature(SECRET, TS, Buffer.from(RAW.replace('completed', 'completeD'), 'utf8')) !== ATTENDU,
    '⛔ un seul octet modifié dans le corps produit LA MÊME signature. La '
    + 'vérification ne vérifie rien.');
  ok(R.calculerSignature(SECRET, '1683650202361', Buffer.from(RAW, 'utf8')) !== ATTENDU,
    '⛔ l\'horodatage ne participe pas à la signature — un rejeu passerait.');

  /* ── 1 bis. L'en-tête peut porter PLUSIEURS signatures (rotation) ─────── */
  var faux = 'v1=' + '0'.repeat(64);
  ok(R.comparerSignatures(ATTENDU, ATTENDU), 'signature seule et correcte : acceptée');
  ok(R.comparerSignatures(ATTENDU + ',' + faux, ATTENDU), 'la bonne signature en 1ʳᵉ position : acceptée');
  ok(R.comparerSignatures(faux + ',' + ATTENDU, ATTENDU), 'la bonne signature en 2ᵉ position : acceptée '
    + '(c\'est le cas pendant une rotation de secret)');
  ok(!R.comparerSignatures(faux, ATTENDU), '⛔ une signature FAUSSE est acceptée.');
  ok(!R.comparerSignatures('', ATTENDU), '⛔ un en-tête VIDE est accepté.');
  ok(!R.comparerSignatures(ATTENDU.slice(0, -2), ATTENDU), '⛔ une signature TRONQUÉE est acceptée.');

  /* ── 2. ⛔ COMMISSION — le piège des deux tableaux imbriqués ───────────
     Un ordre réessayé porte des tentatives REFUSÉES puis une réussie.
     Sommer tout le tableau facturerait des commissions jamais prélevées ;
     prendre payments[0] tomberait sur la tentative refusée. */
  var ordreReessaye = [
    { id: 'p1', state: 'declined', amount: 10000, fees: [{ type: 'acquiring', amount: 999 }] },
    { id: 'p2', state: 'failed',   amount: 10000, fees: [{ type: 'acquiring', amount: 888 }] },
    { id: 'p3', state: 'captured', amount: 10000, fees: [{ type: 'acquiring', amount: 300 }] }
  ];
  pres(R.commissionCents(ordreReessaye), 300, 0,
    '⛔ la commission d\'un ordre RÉESSAYÉ est fausse. Attendu : les frais du seul '
    + 'paiement ABOUTI (300). Obtenir 2187 = on a sommé tout le tableau, y compris '
    + 'des tentatives refusées. Obtenir 999 = on a pris payments[0], la refusée.');

  pres(R.commissionCents([{ state: 'captured', fees: [
    { type: 'acquiring', amount: 250 }, { type: 'other', amount: 50 }
  ] }]), 300, 0, 'plusieurs types de frais sur UN paiement : on les somme');

  ok(R.commissionCents([{ state: 'declined', fees: [{ amount: 999 }] }]) === null,
    '⛔ aucun paiement abouti → la commission doit valoir null, pas 0 ni la '
    + 'commission d\'une tentative refusée.');
  ok(R.commissionCents([]) === null, 'tableau vide → null');
  ok(R.commissionCents(null) === null, 'absent → null');
  ok(R.commissionCents([{ state: 'captured' }]) === null,
    'paiement abouti SANS tableau de frais → null (inconnu), jamais 0');
  ok(R.commissionCents([{ state: 'captured', fees: [] }]) === null,
    '⛔ frais VIDES → null. Un 0 se confondrait avec une commission réellement '
    + 'nulle dans le compte de résultat.');

  /* ── 3. ÉTATS — dont le piège « paiement raté ≠ commande ratée » ──────── */
  var attendus = {
    'pending': 'en_attente', 'processing': 'en_attente',
    'authorised': 'autorise', 'completed': 'paye',
    'cancelled': 'annule', 'failed': 'echoue'
  };
  Object.keys(attendus).forEach(function (k) {
    ok(socle.normaliserEtat(k, R.ETATS_ORDRE) === attendus[k],
      'l\'état d\'ordre « ' + k + ' » doit valoir « ' + attendus[k] + ' »');
  });
  ok(socle.normaliserEtat('authorised', R.ETATS_ORDRE) !== socle.ETAT_ACQUIS,
    '⛔ `authorised` est traduit en « payé ». Il est RÉVERSIBLE : les fonds '
    + 'retournent au client si l\'ordre n\'est pas capturé. Expédier dessus, '
    + 'c\'est expédier sur de l\'argent qui peut repartir.');
  Object.keys(R.ETATS_ORDRE).forEach(function (k) {
    if (R.ETATS_ORDRE[k] === socle.ETAT_ACQUIS) {
      ok(k === 'completed',
        '⛔ l\'état d\'ordre « ' + k + ' » vaut « payé ». Seul `completed` prouve '
        + 'l\'encaissement chez Revolut.');
    }
  });
  ['inexistant', 'constructor', '__proto__', '', null, undefined, 0, {}].forEach(function (v) {
    ok(socle.normaliserEtat(v, R.ETATS_ORDRE) === 'inconnu',
      '⛔ un état non cartographié (' + String(v) + ') ne vaut pas « inconnu ».');
  });
  ok(socle.normaliserEtat('declined', R.ETATS_PAIEMENT) === 'echoue',
    'un PAIEMENT refusé vaut bien « echoue » (c\'est la TENTATIVE qui échoue)');
  ok(socle.normaliserEtat('declined', R.ETATS_ORDRE) === 'inconnu',
    '⛔ « declined » est un état de PAIEMENT, pas d\'ORDRE. Le mélanger ferait '
    + 'passer une tentative refusée pour une commande morte, alors que le client '
    + 'peut réessayer sur le même ordre.');

  /* ── 4. Conversion complète d'un ordre ────────────────────────────────── */
  var o = R.depuisOrdre({
    id: 'ord-1', state: 'completed', amount: 34228, currency: 'EUR',
    metadata: { source: 'pirates-tools' },
    customer: { email: 'a@b.fr', full_name: 'Prénom Nom' },
    payments: [
      { state: 'declined', fees: [{ amount: 999 }] },
      { state: 'captured', fees: [{ type: 'acquiring', amount: 978 }],
        billing_address: { street_line_1: '1 rue X', city: 'Sainte-Anne', postcode: '97180', country_code: 'GP' },
        payment_method: { card_country_code: 'FR', card_brand: 'visa' } }
    ]
  });
  ok(o.etat === 'paye', 'un ordre `completed` vaut « paye »');
  ok(o.montantCents === 34228 && o.devise === 'EUR', 'montant et devise repris tels quels');
  pres(o.commissionCents, 978, 0, 'commission lue sur le paiement abouti');
  ok(o.adresse && o.adresse.codePostal === '97180',
    'l\'adresse de FACTURATION du paiement abouti est reprise — c\'est la donnée '
    + 'non déclarative qui sert au contrôle fiscal détectif');
  ok(o.paysCarte === 'FR' && o.marqueCarte === 'visa', 'pays et marque de carte repris');
  ok(o.fournisseur === 'revolut', 'le fournisseur est nommé dans le journal');

  var vide = R.depuisOrdre(null);
  ok(vide.etat === 'inconnu' && vide.commissionCents === null,
    'un ordre absent donne un paiement « inconnu » à commission nulle-inconnue, '
    + 'jamais quelque chose qui déclencherait un effet');

  /* ── 5. Le défaut est le BAC À SABLE ──────────────────────────────────
     Même principe que le routeur : le défaut doit être celui qui ne peut pas
     coûter d'argent. Une variable oubliée envoie vers de la fausse monnaie. */
  var avant = process.env.REVOLUT_MODE;
  try {
    [undefined, '', 'production', 'PROD_', 'sandbox', 'nawak'].forEach(function (v) {
      if (v === undefined) delete process.env.REVOLUT_MODE; else process.env.REVOLUT_MODE = v;
      if (v === 'prod') return;
      ok(R._modeProd() === false,
        '⛔ REVOLUT_MODE = « ' + String(v) + ' » bascule en PRODUCTION. Le défaut doit '
        + 'toujours être le bac à sable : une variable oubliée ne doit pas débiter '
        + 'de vraies cartes.');
      ok(/sandbox-merchant/.test(R._base()),
        '⛔ l\'URL de base n\'est pas celle du bac à sable alors que le mode ne dit pas « prod ».');
    });
    ['prod', 'PROD', ' Prod '].forEach(function (v) {
      process.env.REVOLUT_MODE = v;
      ok(R._modeProd() === true, 'REVOLUT_MODE = « ' + v + ' » doit bien passer en production '
        + '(sinon la bascule serait impossible).');
      ok(R._base() === 'https://merchant.revolut.com/api', 'URL de production exacte');
    });
  } finally {
    if (avant === undefined) delete process.env.REVOLUT_MODE; else process.env.REVOLUT_MODE = avant;
  }

  /* ── 6. La fenêtre anti-rejeu existe et est bornée ────────────────────── */
  ok(typeof R.FENETRE_MS === 'number' && R.FENETRE_MS > 0 && R.FENETRE_MS <= 15 * 60 * 1000,
    'la fenêtre anti-rejeu doit exister et rester courte (≤ 15 min). Sans contrôle '
    + 'd\'âge, une requête signée capturée se rejoue indéfiniment.');

  var avantW = process.env.REVOLUT_WEBHOOK_SECRET_SANDBOX;
  try {
    process.env.REVOLUT_WEBHOOK_SECRET_SANDBOX = SECRET;
    delete process.env.REVOLUT_MODE;
    var corps = Buffer.from('{"event":"ORDER_COMPLETED","order_id":"o-1"}', 'utf8');
    var ts = '1700000000000';
    var sig = R.calculerSignature(SECRET, ts, corps);
    var ent = { 'revolut-request-timestamp': ts, 'revolut-signature': sig };

    var bon = R.verifierSignature(corps, ent, Number(ts) + 1000);
    ok(bon && bon.ok === true, 'une requête fraîche et bien signée est acceptée');
    ok(bon && bon.cle === 'ORDER_COMPLETED:o-1',
      '⛔ la clé d\'idempotence doit combiner event ET order_id : Revolut ne fournit '
      + 'aucun identifiant d\'événement, et deux événements du même ordre se '
      + 'marcheraient dessus.');

    var vieux = R.verifierSignature(corps, ent, Number(ts) + 6 * 60 * 1000);
    ok(vieux && vieux.ok === false,
      '⛔ une requête signée VIEILLE de 6 minutes est acceptée. Une requête capturée '
      + 'se rejouerait indéfiniment.');

    var futur = R.verifierSignature(corps, ent, Number(ts) - 6 * 60 * 1000);
    ok(futur && futur.ok === false, 'un horodatage dans le FUTUR lointain est refusé aussi');

    ok(R.verifierSignature(corps, { 'revolut-signature': sig }, Number(ts)).ok === false,
      'sans horodatage : refus');
    ok(R.verifierSignature(corps, { 'revolut-request-timestamp': ts }, Number(ts)).ok === false,
      'sans signature : refus');
    ok(R.verifierSignature(Buffer.from('{"event":"X"}'), ent, Number(ts)).ok === false,
      'corps modifié : refus');

    var sansOrdre = Buffer.from('{"event":"ORDER_COMPLETED"}', 'utf8');
    var sigSans = R.calculerSignature(SECRET, ts, sansOrdre);
    ok(R.verifierSignature(sansOrdre, { 'revolut-request-timestamp': ts, 'revolut-signature': sigSans },
      Number(ts)).ok === false,
      'une charge utile bien signée mais SANS order_id est refusée : on ne saurait '
      + 'ni quoi relire, ni comment dédupliquer.');

    /* ⛔ Le refus ne doit jamais révéler le secret attendu. */
    [vieux, futur, R.verifierSignature(corps, { 'revolut-signature': faux,
      'revolut-request-timestamp': ts }, Number(ts))].forEach(function (r) {
      ok(!r || String(r.erreur || '').indexOf(SECRET) === -1,
        '⛔ un message de refus CONTIENT le secret de signature. Il part dans les journaux.');
    });
  } finally {
    if (avantW === undefined) delete process.env.REVOLUT_WEBHOOK_SECRET_SANDBOX;
    else process.env.REVOLUT_WEBHOOK_SECRET_SANDBOX = avantW;
  }

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-revolut OK');
}
