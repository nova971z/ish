// scripts/check-webhook-claim.js — Idempotence du webhook de paiement (chemin de l'argent).
// Vérifie la machine à états stripe_events (claimDecision, PURE), le caractère
// CRITIQUE du journal payments/ (throw → 500 → re-livraison l ancien fournisseur) et
// l'idempotence du numéro de facture en reprise (réutilisation, pas de trou).
'use strict';
var I = require('../api/webhook')._internals;

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-webhook-claim] ' + m); }
  var NOW = 1000000000, STALE = I.CLAIM_STALE_MS;

  // 1) Matrice claimDecision.
  ok(I.claimDecision({ status: 'done' }, NOW) === 'skip', 'done → skip (jamais retraité)');
  ok(I.claimDecision({ status: 'failed' }, NOW) === 'retry', 'failed → retry (la re-livraison du fournisseur est le mécanisme de retry)');
  ok(I.claimDecision({ status: 'processing', receivedAtMs: NOW - 1000 }, NOW) === 'skip', 'processing frais → skip (livraison concurrente)');
  ok(I.claimDecision({ status: 'processing', receivedAtMs: NOW - STALE - 1 }, NOW) === 'retry', 'processing figé > CLAIM_STALE_MS → retry (run tué)');
  ok(I.claimDecision({ status: 'processing' }, NOW) === 'retry', 'processing sans horodatage → retry (âge inconnu = Infinity)');
  ok(I.claimDecision({}, NOW) === 'retry', 'état inconnu → retry (effets idempotents)');
  ok(I.claimDecision(null, NOW) === 'retry', 'claim null → retry');
  ok(STALE === 10 * 60 * 1000, 'CLAIM_STALE_MS = 10 min');

  // 2) logPayment est CRITIQUE : un échec Firestore doit REMONTER (throw),
  //    plus jamais être avalé (c'était la perte d'événement silencieuse).
  var boom = { db: { collection: function () { return { doc: function () { return {
    set: function () { return Promise.reject(new Error('firestore down')); }
  }; } }; } }, admin: { firestore: { FieldValue: { serverTimestamp: function () { return 0; } } } } };
  var threw = false;
  try { await I.logPayment(boom, 'pi_test', { status: 'succeeded' }); }
  catch (e) { threw = true; }
  ok(threw, 'logPayment jette sur échec Firestore (critique → 500 → re-livraison)');

  // 3) logPayment sans Firestore configuré : no-op silencieux (inchangé).
  var noop = false;
  try { await I.logPayment({ db: null }, 'pi_test', {}); noop = true; } catch (e) {}
  ok(noop, 'logPayment no-op sans db (config absente ≠ panne)');

  // 4) assignInvoiceNumber : REPRISE → réutilise le numéro déjà attribué à ce
  //    paiement (payments/{id}.invoiceNumber), ne consomme PAS le compteur.
  var txRan = false;
  var fbReuse = {
    db: {
      collection: function (name) {
        return { doc: function () { return {
          get: function () {
            return Promise.resolve({ exists: true, data: function () { return { invoiceNumber: 'F2026-0042' }; } });
          }
        }; } };
      },
      runTransaction: function () { txRan = true; return Promise.resolve(99); }
    }
  };
  var reused = await I.assignInvoiceNumber(fbReuse, Date.now(), 'pi_reprise');
  ok(reused === 'F2026-0042', 'numéro de facture RÉUTILISÉ en reprise (' + reused + ')');
  ok(!txRan, 'compteur NON consommé en reprise (pas de trou dans la séquence)');

  // 5) Premier passage (pas de numéro existant) : transaction consommée, format Fyyyy-NNNN.
  var fbFresh = {
    db: {
      collection: function () { return { doc: function () { return {
        get: function () { return Promise.resolve({ exists: false }); }
      }; } }; },
      runTransaction: function () { return Promise.resolve(7); }
    }
  };
  var fresh = await I.assignInvoiceNumber(fbFresh, Date.UTC(2026, 6, 25), 'pi_new');
  ok(fresh === 'F2026-0007', 'premier passage : numéro F2026-0007 (' + fresh + ')');

  // 6) Échec du compteur = CRITIQUE (throw), plus de retour null silencieux.
  var fbDown = {
    db: {
      collection: function () { return { doc: function () { return {
        get: function () { return Promise.resolve({ exists: false }); }
      }; } }; },
      runTransaction: function () { return Promise.reject(new Error('tx failed')); }
    }
  };
  var threw2 = false;
  try { await I.assignInvoiceNumber(fbDown, Date.now(), 'pi_x'); } catch (e) { threw2 = true; }
  ok(threw2, 'échec compteur facture → throw (retry), plus de null silencieux');

  return errors;
};

if (require.main === module) {
  module.exports().then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-webhook-claim OK');
  });
}
