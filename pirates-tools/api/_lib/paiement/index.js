/* api/_lib/paiement/index.js — LA COUTURE : un seul contrat, deux fournisseurs.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE COUCHE EXISTE

   Le 31/07/2026, l'user décide de quitter Stripe pour Revolut : les fonds
   arrivent sur le compte Merchant sous 24 h au lieu de 7 jours ouvrés au
   premier virement, donc plus besoin d'avancer la trésorerie de chaque
   commande. (Voir docs/PLAN-REVOLUT.md.)

   Avant cette couche, `stripe` était appelé DIRECTEMENT depuis 5 fichiers, à
   10 endroits. Basculer aurait voulu dire réécrire les 10 en même temps, sans
   filet, sur le chemin de l'argent — et sans aucun moyen de revenir en arrière
   autrement qu'en redéployant du code de paiement dans l'urgence.

   ⚠️ CE N'EST PAS DE L'ÉLÉGANCE, C'EST LA QUESTION 2 DU PROTOCOLE :
   « comment on revient en arrière ? ». Avec cette couche, la réponse est une
   variable d'environnement. Sans elle, la réponse est « on ne revient pas ».

   ─────────────────────────────────────────────────────────────────────────
   LE VOCABULAIRE COMMUN — et pourquoi il est plus étroit que les deux API

   Chaque fournisseur a ses propres états. On les ramène à SIX, et un seul
   déclenche des effets. Une valeur inconnue ne devient JAMAIS `paye` par
   défaut : elle devient `inconnu`, se journalise, et ne déclenche rien.

     'en_attente' · le client n'a pas (encore) payé
     'autorise'   · ⛔ RÉVERSIBLE. Stripe : requires_capture. Revolut :
                    `authorised` — la doc dit que les fonds RETOURNENT au client
                    si l'ordre n'est pas capturé sous 7 jours. On n'expédie
                    RIEN sur cet état.
     'paye'       · ✅ l'argent est acquis. Stripe : succeeded. Revolut :
                    order `completed` (le seul état d'où un remboursement est
                    possible — donc le seul qui prouve l'encaissement).
     'echoue'     · refus définitif
     'annule'     · annulé avant paiement
     'rembourse'  · remboursé après coup
     'inconnu'    · ⚠️ état non cartographié : on journalise et on IGNORE.

   ⛔ RÈGLE ABSOLUE : seul 'paye' déclenche un effet (journal, facture, email,
   expédition). Tout le reste se trace et s'arrête là.

   ─────────────────────────────────────────────────────────────────────────
   CE QUE CETTE COUCHE NE FAIT PAS

   Elle ne calcule aucun prix, ne décide d'aucun territoire, ne touche à aucune
   remise. Le montant lui arrive DÉJÀ calculé par le serveur — la règle « le
   serveur est seul maître du montant » vit en amont et n'est pas déléguée ici.
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

/* Les six états, plus l'échappatoire. Exportés pour que les contrôles puissent
   vérifier qu'aucun fournisseur n'en invente un septième en douce. */
var ETATS = ['en_attente', 'autorise', 'paye', 'echoue', 'annule', 'rembourse', 'inconnu'];

/* Le seul état qui autorise un effet. Une constante, pas une chaîne recopiée :
   `if (etat === 'payé')` avec un accent est passé une fois et n'a rien fait. */
var ETAT_ACQUIS = 'paye';

/* ── LE GENRE D'UN ÉVÉNEMENT DE WEBHOOK ───────────────────────────────────
   Le webhook aiguillait sur les noms d'événements de Stripe
   (`payment_intent.succeeded`…). Revolut en a d'autres (`ORDER_COMPLETED`…), et
   surtout une SÉMANTIQUE différente. On aiguille donc sur un GENRE commun.

     'encaisse'        · l'argent est acquis → le SEUL genre qui déclenche des
                         effets (journal, facture, email, expédition).
     'autorise'        · autorisé mais RÉVERSIBLE → on journalise, on n'expédie pas.
     'tentative_ratee' · ⛔⛔ UNE TENTATIVE a échoué, PAS la commande.
                         Chez Revolut, le client peut réessayer sur le MÊME
                         ordre : ORDER_PAYMENT_DECLINED et ORDER_PAYMENT_FAILED
                         n'enterrent rien. Traduire ça en « commande morte » —
                         le réflexe hérité de `payment_intent.payment_failed` —
                         tuerait une vente en cours de sauvetage.
     'abandonne'       · la commande est morte pour de bon (annulée ou expirée).
     'autre'           · non traité : journalisé, ignoré.

   ⛔ Un événement inconnu vaut 'autre', JAMAIS 'encaisse'. Même règle que pour
   les états : l'inconnu ne déclenche rien. */
var GENRES = ['encaisse', 'autorise', 'tentative_ratee', 'abandonne', 'autre'];
var GENRE_ACQUIS = 'encaisse';

function normaliserGenre(brut, table) {
  var k = String(brut == null ? '' : brut).trim();
  if (!k) return 'autre';
  var v = table && Object.prototype.hasOwnProperty.call(table, k) ? table[k] : null;
  return (v && GENRES.indexOf(v) !== -1) ? v : 'autre';
}

/* Les opérations que TOUT fournisseur doit exposer. `check-paiement.js` vérifie
   que chaque module les fournit toutes — un fournisseur incomplet échouerait
   au premier paiement réel, pas au déploiement. */
var OPERATIONS = [
  'nom',               // string — identifiant du fournisseur, pour les journaux
  'estConfigure',      // () → bool — les variables d'environnement sont-elles là ?
  'creerPaiement',     // (params) → { id, jetonClient, urlHebergee }
  'lirePaiement',      // (id) → paiement normalisé
  'verifierSignature', // (corpsBrut, entetes) → { ok, evenement, cle, erreur }
  'rembourser'         // (id, montantCents, devise, cleIdempotence) → { id, etat }
];

/* Choix du fournisseur. Par défaut STRIPE — c'est ce qui encaisse aujourd'hui.
   ⚠️ Le défaut n'est pas neutre : il doit toujours désigner le fournisseur qui
   FONCTIONNE. Une variable mal orthographiée sur Vercel ne doit pas basculer le
   site sur un fournisseur non validé, elle doit le laisser où il est. */
function nomFournisseur() {
  var v = String(process.env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  return (v === 'revolut') ? 'revolut' : 'stripe';
}

/* Retourne le module du fournisseur actif.
   ⚠️ `require` paresseux : charger le module Revolut alors qu'on tourne sur
   Stripe (ou l'inverse) coûte du démarrage à froid sur chaque appel de
   fonction serverless, pour rien. */
function fournisseur(nom) {
  var n = nom || nomFournisseur();
  if (n === 'revolut') return require('./revolut');
  return require('./stripe');
}

/* Normalise un état brut en l'un des six. Table EXPLICITE, jamais de repli
   optimiste : un état absent de la table renvoie 'inconnu'.
   C'est volontairement rigide — le jour où un fournisseur ajoute un état, on
   veut une ligne « état inconnu » dans les journaux, pas une commande expédiée
   sur un paiement qu'on n'a pas compris. */
function normaliserEtat(brut, table) {
  var k = String(brut == null ? '' : brut).trim().toLowerCase();
  if (!k) return 'inconnu';
  var v = table && Object.prototype.hasOwnProperty.call(table, k) ? table[k] : null;
  return (v && ETATS.indexOf(v) !== -1) ? v : 'inconnu';
}

/* Un paiement normalisé, tous champs présents. Les absents valent null — jamais
   `undefined`, qui disparaît silencieusement d'un JSON et d'un document
   Firestore. Un champ manquant doit se VOIR. */
function paiementVide() {
  return {
    id: null,               // identifiant fournisseur
    etat: 'inconnu',        // l'un des ETATS
    etatBrut: null,         // l'état tel que le fournisseur l'a dit (journal)
    montantCents: null,     // montant DÉBITÉ, en centimes
    devise: null,
    email: null,
    nom: null,
    adresse: null,          // { ligne1, ville, codePostal, pays }
    metadata: {},           // nos propres données rattachées
    commissionCents: null,  // ⚠️ commission RÉELLE, jamais estimée. null si inconnue.
    paysCarte: null,        // code pays d'émission (connu APRÈS paiement seulement)
    marqueCarte: null,
    fournisseur: null
  };
}

module.exports = {
  ETATS: ETATS,
  ETAT_ACQUIS: ETAT_ACQUIS,
  GENRES: GENRES,
  GENRE_ACQUIS: GENRE_ACQUIS,
  normaliserGenre: normaliserGenre,
  OPERATIONS: OPERATIONS,
  nomFournisseur: nomFournisseur,
  fournisseur: fournisseur,
  normaliserEtat: normaliserEtat,
  paiementVide: paiementVide
};
