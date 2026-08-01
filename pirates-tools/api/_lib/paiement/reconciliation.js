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

   Chez l'ancien fournisseur, la re-livraison s'étale sur ~3 jours et sauve presque tous les
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
     { orphelins, ignoresTropRecents, dejaTraites, nonEncaisses, horsPerimetre, total } */

/* ⛔ QU'EST-CE QUI EST « À NOUS » — LA RÈGLE VIT ICI, UNE SEULE FOIS.
   C'est une règle MÉTIER, pas un détail de fournisseur : la mettre dans chaque
   module fournisseur, c'est deux copies qui divergeront au premier correctif
   appliqué à une seule. Deux cas à écarter, et ils ne sont pas du même genre :

     · `source !== 'pirates-tools'` — un ordre créé ailleurs (à la main dans le
       tableau de bord Revolut, par un autre outil). Le signaler en orphelin
       ferait crier la réconciliation sur de l'argent parfaitement en règle, et
       une alerte qui crie pour rien finit par ne plus être lue.
     · `test` — la commande de diagnostic à 30 €. Elle porte volontairement
       `source: pirates-tools`, et le webhook l'exclut déjà (api/webhook.js).
       Sans la même exclusion ici, le filet la rattraperait comme un paiement
       encaissé jamais traité — un faux orphelin à chaque passage, indélébile,
       puisqu'aucune commande ne lui correspondra jamais. */
function estANous(o) {
  var m = (o && o.metadata) || {};
  if (m.source !== 'pirates-tools') return false;
  if (m.test) return false;
  return true;
}

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
    horsPerimetre: [], total: 0
  };

  (ordresFournisseur || []).forEach(function (o) {
    if (!o || o.id == null) return;
    res.total++;

    /* Écarté AVANT tout le reste : ni orphelin, ni déjà traité, ni rien. Ce
       n'est pas une vente du site, il n'y a donc rien à réconcilier. */
    if (!estANous(o)) { res.horsPerimetre.push(o); return; }

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
      + r.nonEncaisses.length + ' non encaissés, '
      + (r.horsPerimetre ? r.horsPerimetre.length : 0) + ' hors périmètre.)';
  }
  var somme = r.orphelins.reduce(function (s, o) {
    return s + (typeof o.montantCents === 'number' ? o.montantCents : 0);
  }, 0);
  return '⛔ Réconciliation : ' + r.orphelins.length + ' PAIEMENT(S) ORPHELIN(S) — '
    + (somme / 100).toFixed(2) + ' € encaissés SANS commande enregistrée. '
    + 'Un client a payé et attend. Références : '
    + r.orphelins.map(function (o) { return o.id; }).join(', ');
}

module.exports = { comparer: comparer, resume: resume, estANous: estANous };
