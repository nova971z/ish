/* api/_lib/paiement/reconciliation.js — LE FILET SOUS LE WEBHOOK.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE FICHIER EXISTE

   Tout le traitement d'une commande dépend d'UN webhook qui arrive. S'il
   n'arrive jamais — panne réseau, Firestore indisponible plus longtemps que
   les re-livraisons, endpoint momentanément cassé — alors :

     · l'argent est encaissé chez le fournisseur ;
     · rien n'est écrit dans `payments/` ;
     · aucune facture, aucun e-mail, aucune expédition ;
     · et PERSONNE NE LE SAIT. Le client a payé et attend.

   C'est le pire mode de panne du site : **silencieux et coûteux**.

   Chez Stripe, la re-livraison s'étale sur ~3 jours et sauve presque tous les
   cas. Chez Revolut, la politique de re-livraison n'est pas documentée — la
   page équivalente d'un autre produit Revolut annonce « 3 more times », ce qui
   serait BEAUCOUP plus court. On ne parie pas : on construit le rattrapage
   dans tous les cas. Il est strictement plus sûr, quelle que soit la réponse.

   ─────────────────────────────────────────────────────────────────────────
   CE QUE FAIT LA RÉCONCILIATION

   Elle compare deux listes :
     · ce que le FOURNISSEUR dit avoir encaissé ;
     · ce que NOTRE JOURNAL `payments/` contient.
   Tout ce qui est dans la première et pas dans la seconde est un paiement
   ORPHELIN : encaissé, jamais traité.

   ⛔ Ce module est PUR — aucune I/O. Il ne lit ni Firestore ni le réseau : on
   lui passe les deux listes, il rend l'écart. C'est ce qui permet de
   l'éprouver hors ligne, sur les cas qui comptent, sans attendre une vraie
   panne pour découvrir qu'il ne marche pas.
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

var socle = require('./index');

/* Compare l'état du fournisseur au journal local.

   ordresFournisseur : [{ id, etat, montantCents, devise, creeAMs }]
                       — déjà normalisés par le module du fournisseur.
   idsJournalises    : tableau ou Set des identifiants présents dans `payments/`.
   options.ageMinMs  : ⚠️ on IGNORE les paiements trop RÉCENTS. Un webhook a le
                       droit de mettre quelques minutes ; sans ce délai, la
                       réconciliation signalerait comme orphelin un paiement en
                       cours de traitement normal, et déclencherait un doublon.
                       Défaut : 15 minutes.
   options.maintenantMs : injecté pour que les contrôles soient reproductibles.

   Retourne :
     { orphelins, ignoresTropRecents, dejaTraites, nonEncaisses, total } */
function comparer(ordresFournisseur, idsJournalises, options) {
  var opts = options || {};
  var ageMin = (typeof opts.ageMinMs === 'number') ? opts.ageMinMs : 15 * 60 * 1000;
  var maintenant = (typeof opts.maintenantMs === 'number') ? opts.maintenantMs : Date.now();

  /* Index des identifiants déjà connus. On accepte un Set ou un tableau —
     l'appelant ne devrait pas avoir à convertir, et une conversion oubliée
     donnerait `indexOf` sur un Set, donc `-1` partout, donc TOUT en orphelin. */
  var connus = Object.create(null);
  var source = (idsJournalises && typeof idsJournalises.forEach === 'function')
    ? idsJournalises : [];
  source.forEach(function (id) { if (id != null) connus[String(id)] = true; });

  var res = {
    orphelins: [], ignoresTropRecents: [], dejaTraites: [], nonEncaisses: [],
    total: 0
  };

  (ordresFournisseur || []).forEach(function (o) {
    if (!o || o.id == null) return;
    res.total++;

    /* ⛔ Seul un paiement ACQUIS mérite d'être réconcilié. Un ordre `autorise`
       est réversible, un `en_attente` n'a rien encaissé : les traiter
       créerait des commandes pour de l'argent qu'on n'a pas. */
    if (o.etat !== socle.ETAT_ACQUIS) { res.nonEncaisses.push(o); return; }

    if (connus[String(o.id)]) { res.dejaTraites.push(o); return; }

    /* Trop récent = le webhook est probablement en route. */
    var age = maintenant - (typeof o.creeAMs === 'number' ? o.creeAMs : 0);
    if (typeof o.creeAMs === 'number' && age < ageMin) {
      res.ignoresTropRecents.push(o);
      return;
    }

    res.orphelins.push(o);
  });

  return res;
}

/* Message destiné à l'exploitant. Volontairement ALARMISTE quand il y a des
   orphelins : c'est de l'argent encaissé pour lequel un client attend une
   commande qui n'existe pas.
   ⛔ Aucune donnée personnelle ici (règle J3 / audit p6) : identifiants et
   montants seulement, jamais d'e-mail ni d'adresse. */
function resume(r) {
  if (!r) return 'Réconciliation : aucun résultat.';
  if (!r.orphelins.length) {
    return 'Réconciliation : ' + r.total + ' ordres examinés, AUCUN orphelin. '
      + '(' + r.dejaTraites.length + ' déjà traités, '
      + r.ignoresTropRecents.length + ' trop récents pour conclure, '
      + r.nonEncaisses.length + ' non encaissés.)';
  }
  var somme = r.orphelins.reduce(function (s, o) {
    return s + (typeof o.montantCents === 'number' ? o.montantCents : 0);
  }, 0);
  return '⛔ Réconciliation : ' + r.orphelins.length + ' PAIEMENT(S) ORPHELIN(S) — '
    + (somme / 100).toFixed(2) + ' € encaissés SANS commande enregistrée. '
    + 'Un client a payé et attend. Références : '
    + r.orphelins.map(function (o) { return o.id; }).join(', ');
}

module.exports = { comparer: comparer, resume: resume };
