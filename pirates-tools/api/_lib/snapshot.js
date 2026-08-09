// api/_lib/snapshot.js — LES DERNIERS PRIX VIVANTS, EN 4 DOCUMENTS.
//
// ⛔ MOTIF (09/08/2026, exigé par l'user) : quand le quota Firestore est épuisé,
// le site retombait sur les prix du FICHIER de base — périmés — parce que lire
// les prix vivants coûtait UNE LECTURE PAR PRODUIT (~1 700 par rendu à froid).
// C'est cette dépense qui épuisait le quota, et c'est le quota épuisé qui
// faisait disparaître les prix. On casse le cercle : les overrides sont
// REPLIÉS en 4 documents agrégés (« shards »), maintenus à CHAQUE écriture.
//   · un rendu à froid lit 4 documents au lieu de ~1 700 (÷425) ;
//   · le quota gratuit passe de ~28 rendus/jour à ~12 000 — l'épuisement
//     cesse d'être un événement plausible ;
//   · et si tout Firestore tombe quand même, le cache de panne (catalog.js)
//     ressert les derniers prix lus — le fichier de base ne redevient la
//     source qu'en tout dernier recours, et l'écran le dit (bandeau).
//
// ⛔ POURQUOI 4 documents et pas 1 : un document Firestore plafonne à 1 Mio.
// ~1 700 overrides avec leurs cartes priceSources s'en approcheraient ; coupés
// en 4 par empreinte de l'id, chaque shard reste loin du plafond.
//
// ⛔ TOUJOURS set(..., { merge:true }), JAMAIS update() : update() interprète
// les POINTS des clés comme des séparateurs de chemin — un id de produit en
// contient (mesuré : 1 sur 1 708). set() garde les clés LITTÉRALES.
'use strict';

var NB_SHARDS = 4;
var PREFIXE = 'prix_snapshot_';

function shardDe(id) {
  var s = String(id), h = 0;
  for (var i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % NB_SHARDS;
  return h;
}

function docShard(db, n) {
  return db.collection('config').doc(PREFIXE + n);
}

/* Répercute UNE écriture d'override dans son shard. `patch` = exactement ce qui
   vient d'être écrit dans product_overrides/{id} (mêmes champs — le webhook lit
   le COGS, le rendu lit les prix : rien ne doit manquer) ; null = suppression.
   Best-effort : une panne du snapshot ne doit JAMAIS faire échouer l'écriture
   principale — le shard se rattrapera à la prochaine reconstruction. */
async function majSnapshot(db, admin, id, patch) {
  try {
    var valeur;
    if (patch === null) {
      valeur = admin.firestore.FieldValue.delete();
    } else {
      // updatedAt/createdAt ne servent qu'à l'audit de la collection : le
      // lecteur du snapshot (rendu, paiement, webhook) ne les lit jamais.
      valeur = Object.assign({}, patch);
      delete valeur.updatedAt; delete valeur.createdAt;
    }
    var corps = { _maj: admin.firestore.FieldValue.serverTimestamp() };
    corps[String(id)] = valeur;
    await docShard(db, shardDe(id)).set(corps, { merge: true });
    return true;
  } catch (e) {
    console.error('[snapshot] maj échouée (non bloquant):', e.message);
    return false;
  }
}

/* Répercute PLUSIEURS écritures d'un COUP (un balayage applique jusqu'à ~60
   prix par page). ⛔ PERFORMANCE (09/08/2026) : appeler majSnapshot par produit
   faisait 60 écritures sérialisées sur seulement 4 documents — Firestore
   sérialise les écritures d'UN même document, d'où une contention qui a
   ralenti le traqueur. Ici on regroupe par shard : au plus 4 écritures pour
   toute la page, chacune fusionnant tous ses produits en un seul appel.
   `entries` = [{ id, patch }] ; patch null = suppression. Best-effort.
   J4 : même contenu que produit-par-produit, mêmes prix, clés littérales. */
async function majSnapshotBatch(db, admin, entries) {
  if (!entries || !entries.length) return true;
  try {
    var parShard = {};
    entries.forEach(function (e) {
      var n = shardDe(e.id);
      if (!parShard[n]) parShard[n] = { _maj: admin.firestore.FieldValue.serverTimestamp() };
      if (e.patch === null) {
        parShard[n][String(e.id)] = admin.firestore.FieldValue.delete();
      } else {
        var v = Object.assign({}, e.patch);
        delete v.updatedAt; delete v.createdAt;
        parShard[n][String(e.id)] = v;
      }
    });
    var ecritures = Object.keys(parShard).map(function (n) {
      return docShard(db, Number(n)).set(parShard[n], { merge: true });
    });
    await Promise.all(ecritures);
    return true;
  } catch (e) {
    console.error('[snapshot] maj groupée échouée (non bloquant):', e.message);
    return false;
  }
}

/* Lit les 4 shards → carte {id: override} fusionnée, ou null si AUCUN shard
   n'existe encore (première vie : le lecteur retombe sur la collection et
   reconstruit). Les clés techniques (_maj) sont retirées. */
async function lireSnapshot(db) {
  var refs = [];
  for (var n = 0; n < NB_SHARDS; n++) refs.push(docShard(db, n));
  var docs = await db.getAll.apply(db, refs);
  var carte = {}, vus = 0;
  docs.forEach(function (d) {
    if (!d.exists) return;
    vus++;
    var data = d.data() || {};
    Object.keys(data).forEach(function (k) {
      if (k.charAt(0) === '_') return;
      carte[k] = data[k];
    });
  });
  return vus === 0 ? null : carte;
}

/* Reconstruit les 4 shards depuis la collection complète (migration, ou
   rattrapage après une maj manquée). Coût : N lectures + 4 écritures — à
   n'appeler que quand le snapshot est ABSENT ou explicitement demandé. */
async function reconstruire(db, admin) {
  var snap = await db.collection('product_overrides').get();
  var parShard = [];
  for (var n = 0; n < NB_SHARDS; n++) parShard.push({ _maj: admin.firestore.FieldValue.serverTimestamp() });
  snap.forEach(function (doc) {
    var data = doc.data() || {};
    delete data.updatedAt;
    parShard[shardDe(doc.id)][doc.id] = data;
  });
  for (var m = 0; m < NB_SHARDS; m++) {
    await docShard(db, m).set(parShard[m], { merge: false });
  }
  return snap.size;
}

module.exports = { majSnapshot: majSnapshot, majSnapshotBatch: majSnapshotBatch,
  lireSnapshot: lireSnapshot, reconstruire: reconstruire, shardDe: shardDe,
  NB_SHARDS: NB_SHARDS, PREFIXE: PREFIXE };
