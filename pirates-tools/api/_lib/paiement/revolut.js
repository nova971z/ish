/* api/_lib/paiement/revolut.js — Revolut Merchant API. ⚠️ PAS ENCORE ÉCRIT.
   ─────────────────────────────────────────────────────────────────────────
   Ce module existe pour que la couture soit COMPLÈTE dès maintenant : le
   routeur peut le charger, les contrôles peuvent vérifier qu'il expose le même
   contrat que Stripe, et personne ne découvrira son absence un jour de bascule.

   ⛔ Il ne fait rien, et il le dit FORT. Chaque opération lève une erreur qui
   nomme l'étape manquante. Un module qui renverrait des valeurs vides serait
   pire que pas de module : on croirait encaisser.

   Le défaut du routeur est `stripe` : ce fichier ne peut être atteint que si
   quelqu'un pose délibérément PAYMENT_PROVIDER=revolut.

   ─────────────────────────────────────────────────────────────────────────
   CE QUI EST DÉJÀ ÉTABLI ET VÉRIFIÉ (docs/PLAN-REVOLUT.md)

   Base            https://merchant.revolut.com/api
   En-têtes        Authorization: Bearer <clé secrète>
                   Revolut-Api-Version: 2026-04-20
   Créer           POST /api/orders          → { id, token, state, checkout_url }
   Relire          GET  /api/orders/{id}     → …, payments[]
   Commission      GET  /api/payments/{id}   → fees[] (TABLEAU : on SOMME),
                                               settled_amount, card_country_code
   Rembourser      POST /api/orders/{id}/refund  + en-tête Idempotency-Key
   Webhook         en-têtes Revolut-Request-Timestamp + Revolut-Signature
                   payload_to_sign = "v1." + timestamp + "." + corps BRUT
                   signature       = "v1=" + HMAC_SHA256(secret, payload).hex()
                   ✅ algorithme vérifié contre le vecteur de test officiel
                   ⚠️ l'en-tête peut porter PLUSIEURS signatures (rotation) :
                      découper et comparer à chacune, en temps constant
                   ⚠️ la charge utile ne contient QUE { event, order_id } :
                      tout se relit ensuite
                   ⚠️ AUCUN identifiant d'événement → clé d'idempotence à
                      dériver de event + order_id

   États           on agit sur ORDER_COMPLETED / order `completed` UNIQUEMENT.
                   `authorised` est RÉVERSIBLE (fonds rendus sous 7 jours).

   RESTE À OBTENIR avant de brancher pour de vrai :
     · limites du champ `metadata` (nombre de clés, longueur d'une valeur)
     · adresse de l'API en bac à sable + génération des clés
     · politique de re-livraison des webhooks (informatif : le rattrapage par
       réconciliation se construit de toute façon)
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

var ETAPE = 'étape 2 du plan (docs/PLAN-REVOLUT.md)';

function pasEncore(operation) {
  throw new Error(
    'Revolut : « ' + operation + ' » n\'est pas encore implémentée — ' + ETAPE + '. '
    + 'Le site encaisse toujours par Stripe : retirer PAYMENT_PROVIDER des '
    + 'variables Vercel (ou le remettre à « stripe ») rétablit le paiement.'
  );
}

module.exports = {
  nom: function () { return 'revolut'; },

  /* ⛔ FAUX TANT QUE LE MODULE EST VIDE — et ce n'est pas une formalité.
     C'est ce qui permet aux points d'entrée de répondre « paiement non
     configuré » proprement au lieu de planter en plein tunnel d'achat. */
  estConfigure: function () { return false; },

  creerPaiement: function () { return pasEncore('créer un paiement'); },
  lirePaiement: function () { return pasEncore('relire un paiement'); },
  rembourser: function () { return pasEncore('rembourser'); },

  /* La signature ne LÈVE pas : elle renvoie un refus. Un webhook qui explose
     renvoie 500, donc invite le fournisseur à re-livrer indéfiniment une
     requête qu'on ne saura jamais traiter. Un refus net vaut mieux. */
  verifierSignature: function () {
    return { ok: false, erreur: 'Revolut : vérification de signature non implémentée — ' + ETAPE };
  }
};
