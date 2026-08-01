/* check-tunnel-paiement.js — LE TUNNEL DE PAIEMENT EST-IL LIVRABLE ?
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE

   Demandée par l'user le 01/08/2026, après une nuit où le tunnel de paiement a
   été livré SIX fois de suite avec un manque à chaque fois — et où c'est LUI
   qui les a trouvés, un par un :

     · le nom du TITULAIRE de la carte n'était pas demandé (on envoyait celui
       du destinataire à la banque) ;
     · l'e-mail n'était demandé NULLE PART pour un client sans compte ;
     · le téléphone n'existait pas ;
     · le panier ne se vidait pas après paiement ;
     · la fenêtre ne se fermait pas après un paiement réussi ;
     · le bouton restait allumé alors que le clic ne pouvait rien faire.

   Aucun de ces défauts n'était une panne : tout « marchait ». C'est exactement
   la catégorie que les tests unitaires ne voient pas, et que seul un inventaire
   explicite de ce qu'un tunnel DOIT contenir peut attraper.

   ─────────────────────────────────────────────────────────────────────────
   CE QUE CETTE PORTE N'EST PAS

   ⛔ Ce n'est pas un jugement esthétique. Elle ne dit pas si c'est « joli » :
   elle vérifie la présence de ce qui est FONCTIONNELLEMENT et LÉGALEMENT
   requis pour encaisser une carte en France.

   ⛔ Elle ne remplace pas de regarder l'écran. Un formulaire peut cocher les
   quinze cases et rester pénible à remplir. Elle empêche seulement de livrer
   un tunnel INCOMPLET — c'est un plancher, pas un plafond.

   ⚠️ Elle ne peut pas consulter les sites de référence : `stripe.com`,
   `legifrance.gouv.fr` et `economie.gouv.fr` répondent 403 depuis
   l'environnement de travail. Les exigences ci-dessous viennent donc du
   PROJET (docs/JURIDIQUE.md, harnais existants, décisions écrites) et des
   types du paquet officiel `@revolut/checkout`, pas d'une page lue en ligne.
   Ce qui n'a pas pu être vérifié à la source est dit comme tel, jamais
   présenté comme une norme.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-tunnel-paiement] ' + m); }

  var RACINE = path.join(__dirname, '..');
  var html, app, css;
  try {
    html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
    app = fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8');
    css = fs.readFileSync(path.join(RACINE, 'styles.css'), 'utf8');
  } catch (e) {
    return ['[check-tunnel-paiement] fichiers du front illisibles — ' + e.message];
  }

  /* Le tunnel n'existe que dans la modale de paiement : on y borne la lecture,
     sinon un champ homonyme ailleurs (compte, contact) ferait passer le
     contrôle au vert pour la mauvaise raison. */
  var iModale = html.indexOf('id="payModal"');
  var modale = iModale === -1 ? '' : html.slice(iModale, iModale + 20000);
  ok(!!modale, '⛔ la modale de paiement (`id="payModal"`) est introuvable : ce contrôle '
    + 'ne peut RIEN vérifier. Il serait vert à vide.');
  if (!modale) return errors;

  /* ── 1. LES DONNÉES SANS LESQUELLES UNE COMMANDE NE PEUT PAS ABOUTIR ────
     Chacune a coûté une livraison incomplète cette nuit-là. Le motif dit ce
     qu'on perd, pas « c'est mieux avec ». */
  [
    ['payAddrName', 'le nom du destinataire', 'sans lui, le colis n\'a personne à qui être remis'],
    ['payAddrEmail', 'l\'e-mail', 'sans lui : pas de facture, pas de confirmation, et un client '
      + 'injoignable après avoir payé — Revolut l\'exige de surcroît en production'],
    ['payAddrPhone', 'le téléphone', 'sans lui, un livreur devant une porte fermée ne peut '
      + 'joindre personne : le colis repart et la vente est à refaire'],
    ['payAddrLine1', 'la voie', 'sans elle, rien à livrer nulle part'],
    ['payAddrPostal', 'le code postal', 'il fixe le TERRITOIRE FISCAL côté serveur (garde A1) : '
      + 'sans lui, aucun taux de taxe ne peut être vérifié'],
    ['payAddrCity', 'la ville', 'une adresse sans ville n\'est pas distribuable'],
    ['payCardName', 'le nom du TITULAIRE de la carte', 'les types Revolut disent « Cardholder '
      + 'name » : y envoyer le nom du destinataire expose à un refus bancaire silencieux']
  ].forEach(function (c) {
    ok(modale.indexOf('id="' + c[0] + '"') !== -1,
      '⛔⛔ champ MANQUANT dans le tunnel : ' + c[1] + ' (`' + c[0] + '`). ' + c[2] + '.');
  });

  /* ── 2. CE QUI EST COLLECTÉ DOIT SERVIR ────────────────────────────────
     Une donnée exigée du client et jamais utilisée est pire qu'une donnée
     absente : elle fait perdre du temps, n'aide personne, et contrevient au
     principe de minimisation (J3). Chaque champ ci-dessus doit se retrouver
     en aval. */
  [
    ['payAddrEmail', /customerEmail:\s*ship\.addr\.email/, 'l\'e-mail n\'est pas envoyé au serveur'],
    ['payAddrEmail', /email:\s*adr\.email/, 'l\'e-mail n\'est pas transmis au fournisseur'],
    ['payAddrPhone', /phone:\s*ship\.addr\.phone/, 'le téléphone n\'est pas envoyé au serveur'],
    ['payAddrPhone', /phone:\s*adr\.phone/, 'le téléphone n\'est pas transmis au fournisseur'],
    ['payCardName', /name:\s*nomTitulaireCarte\(/, 'le nom du titulaire n\'est pas transmis']
  ].forEach(function (c) {
    ok(c[1].test(app),
      '⛔⛔ donnée collectée mais JETÉE : ' + c[2] + '. Un champ qu\'on impose au client sans '
      + 's\'en servir n\'aurait pas dû être demandé (minimisation, J3).');
  });

  /* ── 3. LE BOUTON DE PAIEMENT ──────────────────────────────────────────
     ⚠️ La mention « Commander avec obligation de paiement » est portée comme
     une OBLIGATION LÉGALE par le projet (docs/JURIDIQUE.md J1, harnais
     `course-pay`). Elle n'a PAS pu être vérifiée à la source depuis cet
     environnement — legifrance.gouv.fr répond 403. On ne l'affaiblit donc pas :
     un contrôle juridique qu'on ne peut pas vérifier ne se retire jamais « au
     jugé ». */
  ok(/Commander avec obligation de paiement/.test(app) || /Commander avec obligation de paiement/.test(modale),
    '⛔⛔ la mention « Commander avec obligation de paiement » a disparu du bouton. Le '
    + 'projet la porte comme une obligation légale de la vente à distance (J1). Elle n\'a '
    + 'pas pu être revérifiée à la source (legifrance : 403) — raison de plus pour ne pas '
    + 'la retirer sans preuve.');
  ok(/#payModalConfirm:disabled/.test(css),
    '⛔ le bouton de paiement n\'a plus d\'apparence « désactivé ». Il resterait lumineux '
    + 'alors que le clic ne peut rien faire : le client clique, rien ne se passe, il part.');
  ok(/function majBoutonPayer/.test(app),
    '⛔⛔ plus rien ne décide de l\'état du bouton en un seul endroit. Avec plusieurs '
    + 'conditions et une seule propriété `disabled`, la dernière ligne exécutée gagne — et '
    + 'le bouton se rallume au mauvais moment.');

  /* ── 4. LES QUATRE ISSUES D'UN PAIEMENT ────────────────────────────────
     Un tunnel n'est pas fini quand le cas nominal marche. Il l'est quand les
     trois autres issues sont traitées — et ce sont elles qui coûtent, parce
     qu'elles arrivent au moment où le client a déjà donné sa carte. */
  ok(/onSuccess/.test(app) && /closePayModal\s*\(/.test(app),
    '⛔⛔ SUCCÈS non traité : la fenêtre de paiement ne se ferme pas. Le client paie, '
    + 'arrive sur la page Merci, et voit encore le formulaire par-dessus. Il peut recliquer.');
  ok(/onError/.test(app),
    '⛔⛔ REFUS non traité : rien n\'affiche pourquoi la banque a dit non. Le client reste '
    + 'devant un écran figé sur un paiement qui n\'aboutira pas.');
  ok(/onCancel/.test(app),
    '⛔⛔ ABANDON non traité : un client qui ferme le 3-D Secure resterait bloqué sur '
    + '« Traitement en cours… » indéfiniment.');
  ok(/function viderPanierApresAchat/.test(app),
    '⛔⛔ APRÈS-VENTE non traité : le panier n\'est pas vidé. Le client retrouve son outil '
    + 'au panier après l\'avoir payé — rien ne l\'empêche de repayer.');

  /* ⛔⛔ LA PREUVE DE PAIEMENT DOIT ÊTRE POSÉE AU SUCCÈS, ET LÀ SEULEMENT.
     Revolut encaisse EN LIGNE, sans redirection : `/merci` ne reçoit ni
     `redirect_status`, ni `session_id`. Sans preuve écrite par `onSuccess`,
     `merciPaymentProof()` rend `no_proof` et `handleMerciPage()` sort AVANT
     tout — panier non vidé, fidélité non créditée, commande jamais écrite,
     historique vide. Trois symptômes signalés séparément par l'user le
     01/08/2026, pour une seule et même cause. */
  ok(/function marquerPreuvePaiement\(/.test(app),
    '⛔⛔ plus rien n\'écrit la PREUVE de paiement dans la commande en attente. Revolut '
    + 'n\'ajoute aucun paramètre d\'URL : sans elle, /merci sort en `no_proof` et n\'exécute '
    + 'RIEN — le client paie, garde son panier, ne voit aucune commande, et sa fidélité '
    + 'n\'est pas créditée.');
  ok(/_paiementId\s*=\s*data\.paymentIntentId/.test(app),
    '⛔⛔ l\'identifiant de commande renvoyé par le serveur (`paymentIntentId`) n\'est plus '
    + 'capté. C\'est lui qui relie ce que le client voit à ce que le webhook enregistre : '
    + 'sans lui, la preuve posée à /merci ne désigne aucune commande.');
  /* A5 : ne persister QUE sur paiement prouvé. Poser la preuve avant le
     paiement ferait passer un refus pour une réussite. */
  var iSauver = app.indexOf('function sauverCommandeEnAttente');
  var blocSauver = iSauver === -1 ? '' : app.slice(iSauver, iSauver + 900);
  ok(iSauver !== -1 && !/paymentIntentId\s*:/.test(blocSauver),
    '⛔⛔ `sauverCommandeEnAttente` écrit une preuve de paiement AVANT le paiement (ou la '
    + 'fonction a disparu). Un paiement refusé passerait alors pour abouti à /merci — '
    + 'exactement le défaut qu\'A5 a corrigé. La preuve s\'écrit dans `onSuccess`, jamais avant.');

  /* ── 5. CE QUI RASSURE AU MOMENT DE DONNER SA CARTE ────────────────────
     Le seul instant du parcours où le client se demande s'il a raison. */
  ok(/Paiement sécurisé par|mentionFournisseur/.test(app),
    '⛔ le tunnel ne dit plus QUI traite la carte. C\'est une information — elle figure '
    + 'aussi dans les CGV et la politique de confidentialité, où le sous-traitant doit '
    + 'être nommé (J3).');

  /* ⛔ AUCUNE MARQUE AVANT QUE LE SERVEUR AIT PARLÉ. `_paiementFournisseur`
     valait `'stripe'` au départ : la fenêtre s'ouvrait donc en annonçant
     « Paiement sécurisé par Stripe » pendant que Revolut encaissait. Vu en bac
     à sable le 01/08/2026, APRÈS avoir cru n'avoir corrigé qu'un texte
     statique — le mensonge avait deux sources. */
  ok(/var _paiementFournisseur\s*=\s*''/.test(app),
    '⛔⛔ `_paiementFournisseur` démarre sur un nom de fournisseur. La fenêtre de paiement '
    + 'annoncera CETTE marque avant que le serveur ait dit qui encaisse — et ce sera faux '
    + 'à chaque fois que l\'autre fournisseur est actif. La valeur de départ doit être vide.');
  ok(!/id="payModalPowered"[^>]*>\s*(?:[^<]*<strong>)?\s*(?:Propulsé par\s*)?<strong>\s*(?:Stripe|Revolut)/.test(html),
    '⛔⛔ le texte STATIQUE du pied de la modale nomme un fournisseur. Il s\'affiche avant '
    + 'toute réponse serveur : c\'est une marque potentiellement fausse montrée au client au '
    + 'moment précis où il décide de donner son numéro de carte.');

  /* ⛔ LE SDK STRIPE NE COMMANDE PLUS TOUT LE TUNNEL. `initStripePayment`
     commençait par `if (!stripe) { … return; }` AVANT l'appel serveur : un
     client dont le navigateur ne charge pas `js.stripe.com` (bloqueur, proxy
     d'entreprise) se voyait refuser la carte alors que REVOLUT encaisse. Une
     vente perdue pour l'absence d'un fournisseur qui n'encaisse plus. */
  /* ⚠️ DEUX PIÈGES ÉVITÉS ICI, tous deux déjà payés ailleurs :
     · le nom de la fonction est `initStripeElements` — la première version
       cherchait `initStripePayment`, qui n'existe pas : `indexOf` rendait −1 et
       l'assertion rougissait sur du code sain (E-210, ancrer sur un nom non
       vérifié). D'où le PRÉALABLE ci-dessous : si la fonction est introuvable,
       on le dit, on ne verdit pas à vide.
     · on lit le code SANS ses commentaires : la note explicative posée dans
       `app.js` cite `if (!stripe)` en toutes lettres et satisfaisait la regex
       (E-218, chercher une forme au lieu d'une règle). */
  var appSansCom = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  var iInit = appSansCom.indexOf('function monterChampCarte(');
  ok(iInit !== -1,
    '⛔ PRÉALABLE MANQUANT : `monterChampCarte(` est introuvable dans app.js — renommée ? '
    + 'Ce contrôle ne vérifie plus rien tant que ce nom n\'est pas remis à jour.');
  if (iInit !== -1) {
    var iFetch = appSansCom.indexOf('create-payment-intent', iInit);
    var avantFetch = appSansCom.slice(iInit, iFetch === -1 ? iInit : iFetch);
    ok(!/if\s*\(\s*!\s*stripe\s*\)/.test(avantFetch),
      '⛔⛔ le tunnel ABANDONNE quand le SDK Stripe est absent, AVANT même d\'appeler le '
      + 'serveur. Or c\'est le serveur qui dit qui encaisse : sous Revolut, un navigateur qui '
      + 'bloque `js.stripe.com` perd la vente sans raison — « paiement bientôt disponible » '
      + 'pour l\'absence d\'un fournisseur qui n\'encaisse plus. Le SDK Stripe ne s\'exige '
      + 'qu\'APRÈS une réponse serveur disant « stripe ».');
  }
  ok(/payCgvOk/.test(modale),
    '⛔⛔ la case d\'acceptation des CGV a disparu du tunnel. Le consentement doit être '
    + 'recueilli AVANT tout débit : c\'est sa preuve en vente à distance.');
  ok(/payCardSame/.test(modale),
    '⛔ la case « la carte est à mon nom » a disparu : le client doit retaper un nom qu\'il '
    + 'vient de saisir deux champs plus haut.');

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-tunnel-paiement OK');
}
