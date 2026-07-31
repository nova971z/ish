/* check-reconciliation.js — LE FILET SOUS LE WEBHOOK TIENT-IL ?
   ─────────────────────────────────────────────────────────────────────────
   La réconciliation existe pour un seul cas : un paiement encaissé dont le
   webhook n'est JAMAIS arrivé. Le client a payé, rien n'est enregistré,
   personne ne le sait. C'est le pire mode de panne du site — silencieux.

   Ce contrôle vérifie les trois façons dont ce filet pourrait mentir :

     1. LAISSER PASSER un orphelin (le filet ne sert à rien) ;
     2. INVENTER un orphelin — signaler comme non traité un paiement qui l'est,
        ce qui conduirait à créer une commande EN DOUBLE et à facturer deux
        fois ;
     3. RÉCONCILIER de l'argent qu'on n'a pas — un ordre autorisé mais non
        capturé, ou en attente.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-reconciliation] ' + m); }

  var R, socle;
  try {
    R = require(path.join(__dirname, '..', 'api', '_lib', 'paiement', 'reconciliation.js'));
    socle = require(path.join(__dirname, '..', 'api', '_lib', 'paiement', 'index.js'));
  } catch (e) {
    return ['check-reconciliation : module illisible — ' + e.message];
  }

  var T0 = 1700000000000;              // horloge injectée : contrôle reproductible
  var VIEUX = T0 - 60 * 60 * 1000;     // 1 h — largement au-delà du délai de grâce
  var RECENT = T0 - 60 * 1000;         // 1 min — le webhook est peut-être en route
  var opts = { maintenantMs: T0 };

  /* ⚠️ `metadata.source` est OBLIGATOIRE sur un jeu d'essai : la réconciliation
     écarte du périmètre tout ordre qui n'est pas une vente du site. Un fixture
     sans metadata ne tomberait plus dans aucune des catégories testées ici —
     et le contrôle rougirait sur un module parfaitement correct. */
  var NOTRE = { source: 'pirates-tools' };
  function ordre(id, etat, ms, montant) {
    return { id: id, etat: etat, creeAMs: ms, montantCents: montant || 10000,
      devise: 'EUR', metadata: NOTRE };
  }

  /* ── 1. ⛔ L'ORPHELIN EST TROUVÉ ──────────────────────────────────────── */
  var r = R.comparer([
    ordre('o-paye-connu', 'paye', VIEUX),
    ordre('o-ORPHELIN', 'paye', VIEUX, 34228)
  ], ['o-paye-connu'], opts);

  ok(r.orphelins.length === 1 && r.orphelins[0].id === 'o-ORPHELIN',
    '⛔ un paiement ENCAISSÉ absent du journal n\'est pas signalé comme orphelin. '
    + 'C\'est exactement le cas pour lequel ce module existe : le client a payé, '
    + 'rien n\'est enregistré, et sans ce filet personne ne le saurait jamais.');
  ok(r.dejaTraites.length === 1, 'un paiement déjà journalisé est classé « déjà traité »');

  /* ── 2. ⛔ AUCUN ORPHELIN INVENTÉ — le défaut symétrique, et il coûte ────
     Signaler comme orphelin un paiement DÉJÀ traité conduirait à recréer la
     commande : deuxième facture, deuxième e-mail, éventuellement deuxième
     expédition. Un filet trop zélé est aussi cher qu'un filet troué. */
  var r2 = R.comparer([
    ordre('a', 'paye', VIEUX), ordre('b', 'paye', VIEUX), ordre('c', 'paye', VIEUX)
  ], ['a', 'b', 'c'], opts);
  ok(r2.orphelins.length === 0,
    '⛔ des paiements TOUS déjà journalisés sont signalés comme orphelins ('
    + r2.orphelins.length + '). Les retraiter créerait des commandes en double, '
    + 'des factures en double et des e-mails en double.');

  /* Le journal peut arriver en Set autant qu'en tableau. Une conversion
     oubliée donnerait `indexOf` sur un Set → -1 partout → TOUT en orphelin. */
  var r3 = R.comparer([ordre('a', 'paye', VIEUX)], new Set(['a']), opts);
  ok(r3.orphelins.length === 0,
    '⛔ le journal fourni en Set n\'est pas reconnu : TOUS les paiements '
    + 'passeraient pour orphelins et seraient retraités.');

  /* Comparaison par CHAÎNE : un identifiant numérique ne doit pas échapper. */
  var r4 = R.comparer([{ id: 123, etat: 'paye', creeAMs: VIEUX, metadata: NOTRE }], ['123'], opts);
  ok(r4.orphelins.length === 0,
    'un identifiant numérique côté fournisseur et texte côté journal doit se '
    + 'reconnaître — sinon on retraiterait un paiement déjà traité.');

  /* ── 3. ⛔ ON NE RÉCONCILIE QUE DE L'ARGENT ACQUIS ────────────────────── */
  var r5 = R.comparer([
    ordre('en-attente', 'en_attente', VIEUX),
    ordre('autorise', 'autorise', VIEUX),
    ordre('echoue', 'echoue', VIEUX),
    ordre('annule', 'annule', VIEUX),
    ordre('inconnu', 'inconnu', VIEUX)
  ], [], opts);
  ok(r5.orphelins.length === 0,
    '⛔ un ordre NON ENCAISSÉ est traité comme orphelin (' + r5.orphelins.length + '). '
    + 'On créerait une commande pour de l\'argent qu\'on n\'a pas — et `autorise` est '
    + 'réversible : les fonds peuvent repartir chez le client.');
  ok(r5.nonEncaisses.length === 5, 'les cinq états non acquis sont classés à part');

  /* ── 4. Le délai de grâce protège du faux positif ──────────────────────
     Sans lui, un paiement dont le webhook est en route serait déclaré orphelin
     et retraité en parallèle : double traitement garanti. */
  var r6 = R.comparer([ordre('tout-frais', 'paye', RECENT)], [], opts);
  ok(r6.orphelins.length === 0 && r6.ignoresTropRecents.length === 1,
    '⛔ un paiement encaissé il y a UNE MINUTE est déjà déclaré orphelin. Son '
    + 'webhook est probablement en route : le retraiter en parallèle produit un '
    + 'double traitement.');

  var r7 = R.comparer([ordre('vieux', 'paye', VIEUX)], [], opts);
  ok(r7.orphelins.length === 1,
    'passé le délai de grâce, l\'orphelin DOIT sortir — sinon le filet ne prend '
    + 'jamais rien et se contente de rassurer.');

  /* La borne exacte : à l'instant pile du seuil, on n'est plus « trop récent ». */
  var seuil = R.comparer([ordre('pile', 'paye', T0 - 15 * 60 * 1000)], [], opts);
  ok(seuil.orphelins.length === 1,
    'à la borne exacte du délai de grâce (15 min), le paiement bascule en orphelin');

  /* Un ordre SANS date ne doit pas être protégé par le délai : on ne peut pas
     prouver qu'il est récent, et un orphelin silencieux coûte plus cher qu'une
     alerte de trop. */
  var sansDate = R.comparer([{ id: 'x', etat: 'paye', metadata: NOTRE }], [], opts);
  ok(sansDate.orphelins.length === 1,
    'un ordre sans date de création est signalé : faute de pouvoir prouver qu\'il '
    + 'est récent, on préfère alerter à tort que taire un paiement perdu.');

  /* ── 4 bis. ⛔ LE PÉRIMÈTRE — deux faux orphelins qui crieraient à vie ───
     Le filet ne compare pas « tout ce que le fournisseur a encaissé » à notre
     journal : il compare NOS VENTES. Deux ordres n'en sont pas, et chacun
     produirait une alerte que rien ne pourrait jamais éteindre — puisque
     aucune commande ne leur correspondra jamais :

       · un ordre créé HORS du site (à la main dans le tableau de bord) ;
       · la commande de DIAGNOSTIC à 30 €, qui porte volontairement
         `source: pirates-tools` et que le webhook exclut déjà.

     Une alerte permanente est pire qu'aucune alerte : elle apprend à ne plus
     regarder, et le jour où un vrai orphelin sort, il se noie dedans. */
  var hors = R.comparer([
    { id: 'externe', etat: 'paye', creeAMs: VIEUX, montantCents: 5000, metadata: { source: 'autre-outil' } },
    { id: 'sans-meta', etat: 'paye', creeAMs: VIEUX, montantCents: 5000 },
    { id: 'diagnostic', etat: 'paye', creeAMs: VIEUX, montantCents: 3000, metadata: { source: 'pirates-tools', test: '1' } }
  ], [], opts);
  ok(hors.orphelins.length === 0,
    '⛔⛔ la réconciliation signale comme orphelins des ordres qui ne sont PAS des '
    + 'ventes du site (' + hors.orphelins.map(function (o) { return o.id; }).join(', ')
    + '). Aucune commande ne leur correspondra jamais : l\'alerte serait permanente, '
    + 'et on apprendrait à ne plus la regarder — jusqu\'au jour où un vrai orphelin '
    + 'se noie dedans.');
  ok(hors.horsPerimetre.length === 3,
    'les trois ordres hors périmètre doivent être COMPTÉS à part, pas effacés : un '
    + 'chiffre qui disparaît est un chiffre qu\'on ne peut plus recouper.');

  /* Et le symétrique, sans quoi l'exclusion pourrait tout avaler : une vraie
     vente orpheline, elle, DOIT continuer à sortir. */
  var vraie = R.comparer([
    ordre('vraie-vente', 'paye', VIEUX, 12900),
    { id: 'diagnostic', etat: 'paye', creeAMs: VIEUX, montantCents: 3000, metadata: { source: 'pirates-tools', test: '1' } }
  ], [], opts);
  var idsVraie = vraie.orphelins.map(function (o) { return o.id; });
  ok(idsVraie.indexOf('vraie-vente') !== -1,
    '⛔⛔ l\'exclusion du périmètre a MANGÉ une vraie vente orpheline. Le filet ne '
    + 'prend plus rien et se contente de rassurer — le mode de panne exact que ce '
    + 'module existe pour empêcher.');
  ok(idsVraie.indexOf('diagnostic') === -1,
    '⛔ la commande de diagnostic ressort en orphelin à côté d\'une vraie vente : '
    + 'l\'exclusion ne s\'applique pas quand il y a du vrai trafic. Elle serait donc '
    + 'inutile exactement le jour où elle compte. Orphelins vus : ' + idsVraie.join(', '));

  /* ── 5. Entrées aberrantes : ne jamais planter ───────────────────────── */
  [null, undefined, [], [null], [{}], [{ etat: 'paye' }]].forEach(function (v) {
    var out;
    try { out = R.comparer(v, [], opts); } catch (e) {
      ok(false, 'comparer(' + JSON.stringify(v) + ') lève « ' + e.message + ' ». Un '
        + 'contrôle de sécurité qui plante ne tourne plus du tout.');
      return;
    }
    ok(out && Array.isArray(out.orphelins), 'comparer() rend toujours une structure lisible');
  });

  /* ── 6. Le résumé DIT le montant et NE FUIT AUCUNE donnée personnelle ── */
  var msg = R.resume(R.comparer([ordre('o-1', 'paye', VIEUX, 34228)], [], opts));
  ok(/ORPHELIN/i.test(msg), 'le résumé alerte clairement quand il y a un orphelin');
  ok(msg.indexOf('342.28') !== -1, 'le résumé chiffre le montant en jeu (342,28 €)');
  ok(msg.indexOf('o-1') !== -1, 'le résumé nomme la référence à aller vérifier');
  /* ⚠️ 1ʳᵉ VERSION FAUSSE : elle testait l'ABSENCE du mot « orphelin ». Or le
     message rassurant dit « AUCUN orphelin » — il contient donc le mot, et
     l'assertion rougissait sur un comportement correct. Chercher un mot ne
     distingue pas « il y en a » de « il n'y en a aucun ». On teste le
     MARQUEUR D'ALERTE, qui lui ne ment pas. */
  var msgOk = R.resume(R.comparer([ordre('a', 'paye', VIEUX)], ['a'], opts));
  ok(msgOk.indexOf('⛔') === -1 && /AUCUN orphelin/i.test(msgOk),
    'aucun orphelin → le résumé ne doit pas porter le marqueur d\'alerte. Un filet '
    + 'qui crie au loup à chaque passage finit par être ignoré le jour où il a raison.');

  /* ⛔ RGPD (J3) : le résumé part par e-mail et dans les journaux serveur.
     Il ne doit contenir ni e-mail, ni nom, ni adresse. */
  var msgPerso = R.resume(R.comparer([{
    id: 'o-2', etat: 'paye', creeAMs: VIEUX, montantCents: 1000, metadata: NOTRE,
    email: 'client@example.com', nom: 'Prénom Nom',
    adresse: { ligne1: '1 rue X', ville: 'Sainte-Anne' }
  }], [], opts));
  ['client@example.com', 'Prénom Nom', '1 rue X', 'Sainte-Anne'].forEach(function (p) {
    ok(msgPerso.indexOf(p) === -1,
      '⛔ le résumé de réconciliation contient une donnée personnelle (« ' + p + ' »). '
      + 'Il part dans les journaux serveur et par e-mail : identifiants et montants '
      + 'seulement (règle J3, audit p6-rgpd).');
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-reconciliation OK');
}
