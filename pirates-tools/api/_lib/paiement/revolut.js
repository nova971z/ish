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

   Bac à sable     https://sandbox-merchant.revolut.com/
                   RevolutCheckout(token, 'sandbox')

   ─────────────────────────────────────────────────────────────────────────
   LES SIX ÉTATS D'UN ORDRE — table officielle, obtenue le 31/07/2026

     pending     ordre créé, aucune tentative         — non final
     processing  tentative en cours                   — non final
     authorised  autorisé, capture manuelle attendue  — final SI capture manuelle
     completed   capturé et réglé                     — ✅ NOTRE DÉCLENCHEUR
     cancelled   annulé / autorisation expirée        — final, échec
     failed      expiré sans paiement                 — final, échec

   Notre `capture_mode` est `automatic` → on agit sur `completed`, et sur rien
   d'autre. Un état inconnu se journalise et s'IGNORE.

   ⛔⛔ PIÈGE N°1 — UN PAIEMENT RATÉ N'EST PAS UNE COMMANDE RATÉE.
   ORDER_PAYMENT_DECLINED et ORDER_PAYMENT_FAILED signalent l'échec d'UNE
   TENTATIVE ; le client peut réessayer sur le MÊME ordre. Les traiter comme un
   échec définitif — le réflexe hérité de `payment_intent.payment_failed` chez
   Stripe — enterrerait une commande en train d'être sauvée, et le
   ORDER_COMPLETED suivant arriverait sur un dossier déjà clos.
   On les JOURNALISE, point. Une commande ne meurt que sur ORDER_CANCELLED ou
   ORDER_FAILED.

   ⛔⛔ PIÈGE N°2 — `payments` EST UN TABLEAU, LUI AUSSI.
   Un ordre réessayé porte plusieurs paiements : des refusés, puis un réussi.
   Pour la commission RÉELLE : trouver le paiement à l'état completed/captured,
   PUIS sommer SES `fees`. Sommer tout le tableau facturerait des commissions
   jamais prélevées ; prendre payments[0] tomberait sur la tentative refusée.

   ⚠️ expire_pending_after vaut 30 JOURS par défaut. Trop long — un ordre
   jamais payé encombrerait le journal un mois. À régler court (ISO 8601).

   RESTE À OBTENIR avant de brancher pour de vrai :
     · limites du champ `metadata` — NON BLOQUANT : on garde des tranches de
       450 caractères, très en dessous de tout plafond plausible
     · politique de re-livraison des webhooks — NON BLOQUANT : le rattrapage
       par réconciliation se construit de toute façon
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
