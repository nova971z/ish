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
  /* () → true (test) | false (argent réel) | null (indéterminable)
     ⚠️ Entré au contrat le 01/08/2026, après un faux positif RÉEL : la
     réconciliation a crié « 317,79 € encaissés, un client attend » sur deux
     paiements Stripe en mode TEST. Le filet disait vrai — ils ne sont pas dans
     le journal — et mentait sur la GRAVITÉ : ce n'est pas de l'argent, et
     personne n'attend. Une alerte qui crie sur de la fausse monnaie apprend à
     ne plus être regardée, donc à être manquée le jour où elle est vraie.
     Savoir si le registre est réel n'est donc pas un détail de fournisseur :
     c'est ce qui sépare une alerte d'une information. */
  'modeTest',
  'creerPaiement',     // (params) → { id, jetonClient, urlHebergee }
  'lirePaiement',      // (id) → paiement normalisé
  'verifierSignature', // (corpsBrut, entetes) → { ok, evenement, cle, erreur, genre }
  'rembourser',        // (id, montantCents, devise, cleIdempotence) → { id, etat }
  /* (depuisMs, jusquaMs) → [paiements normalisés, avec `creeAMs`]
     ⚠️ Indispensable au RATTRAPAGE. Sans la liste de ce que le fournisseur dit
     avoir encaissé, la réconciliation n'a rien à comparer et le filet sous le
     webhook n'existe pas. C'est la seule opération dont l'absence ne se voit
     JAMAIS en fonctionnement normal : elle ne sert que le jour de la panne. */
  'listerPaiements'
];

/* ⛔ UN SEUL FOURNISSEUR ENCAISSE : REVOLUT (01/08/2026, demande de l'user —
   « toute la partie Stripe ne doit plus être présente »).

   `PAYMENT_PROVIDER` n'est plus lu : quelle que soit sa valeur, y compris
   absente ou mal orthographiée, le site encaisse par Revolut. C'est le
   contraire d'une régression — une variable d'environnement ne peut plus
   basculer l'encaissement sur un fournisseur dont le code n'existe plus côté
   client, ce qui donnerait un formulaire mort et des ventes perdues. */
function nomFournisseur() {
  return 'revolut';
}

/* Retourne le module du fournisseur actif.
   ⚠️ `require` paresseux : charger le module Revolut alors qu'on tourne sur
   Stripe (ou l'inverse) coûte du démarrage à froid sur chaque appel de
   fonction serverless, pour rien. */
function fournisseur() {
  return require('./revolut');
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

/* ⛔⛔ QUI A ENVOYÉ CETTE NOTIFICATION ? — trouvé le 01/08/2026 sur un test réel.
   ─────────────────────────────────────────────────────────────────────────
   Le webhook faisait vérifier la signature par le fournisseur ACTIF. Revolut a
   envoyé ses notifications, Stripe a tenté de les vérifier, et a répondu
   « STRIPE_WEBHOOK_SECRET absente ». Deux notifications reçues, zéro acceptée.

   Le défaut n'est pas la configuration : c'est de demander à A de reconnaître
   la signature de B. Et il est SYMÉTRIQUE — après la bascule, une re-livraison
   Stripe tardive (son backoff s'étale sur ~3 jours) serait refusée par Revolut,
   et l'encaissement correspondant perdu.

   On identifie donc l'ÉMETTEUR par son en-tête, et on lui applique SA
   vérification. Pendant toute la transition, les deux fonctionnent en parallèle
   sur la même adresse.

   ⛔ Ceci n'affaiblit RIEN. L'en-tête choisit l'ALGORITHME, jamais le droit
   d'entrer : la vérification cryptographique reste faite ensuite, avec le
   secret correspondant. Poser un en-tête `revolut-signature` sans savoir signer
   avec le secret Revolut ne mène nulle part. */
function fournisseurParEntetes(entetes) {
  var h = entetes || {};
  if (h['revolut-signature'] || h['Revolut-Signature']) return require('./revolut');
  /* ⚠️ SEUL VESTIGE DE STRIPE, ET IL EST DÉLIBÉRÉ. Ce n'est PAS un chemin
     d'encaissement : c'est le vérificateur de signature des notifications
     TARDIVES. Le backoff de re-livraison s'étale sur ~3 jours ; refuser une
     re-livraison d'un paiement DÉJÀ ENCAISSÉ, c'est perdre la trace comptable
     d'un argent réellement reçu. Priorité : argent d'abord.
     Ce fichier n'est jamais servi au navigateur et ne peut créer aucune
     commande. À supprimer quand plus aucune notification tardive n'est
     possible — voir la liste d'actions remise à l'user le 01/08/2026. */
  if (h['stripe-signature'] || h['Stripe-Signature']) return require('./stripe');
  return null;
}

module.exports = {
  fournisseurParEntetes: fournisseurParEntetes,
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
