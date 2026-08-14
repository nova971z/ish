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

/* ⛔⛔ LES CHAMPS LOURDS N'ENTRENT JAMAIS DANS UN SHARD — LA PANNE QUI EFFAÇAIT
   LES FICHES DE L'USER (chaîne relue de bout en bout le 14/08/2026).
   L'admin crée une fiche avec ses photos : elles sont stockées EN BASE64 dans
   le document (jusqu'à 6 × 700 000 signes — api/admin.js). `majSnapshot`
   recopiait ce document ENTIER dans son shard… qui plafonne à 1 Mio — le motif
   même des 4 shards, écrit en tête de ce fichier. Résultat : l'écriture du
   shard ÉCHOUE, l'échec est avalé (best-effort), l'admin voit « ✅ » — et au
   rafraîchissement, le catalogue, qui lit le SNAPSHOT D'ABORD et ne retombe
   sur la collection que si AUCUN shard n'existe, ne voit jamais la fiche.
   Tout ce qu'il venait de faire avait « disparu ». Reproché à raison :
   un travail annoncé fini sans jamais RELIRE ce qui était réellement servi.
   ⇒ Un shard ne porte que les champs LÉGERS — les prix restent ENTIERS (J4 :
   le snapshot porte les mêmes prix que les overrides, rien d'inventé). Les
   champs lourds restent dans le document `product_overrides` (leur vraie
   maison), et l'entrée de shard porte `_riche: 1` : le lecteur (catalog.js) va
   chercher CES documents-là, nommément — quelques lectures ciblées, jamais la
   collection entière. */
var CHAMPS_LOURDS = ['img', 'images', 'description_long', 'specs', 'features'];

function valeurPourShard(patch) {
  var v = Object.assign({}, patch);
  // updatedAt/createdAt ne servent qu'à l'audit de la collection : le
  // lecteur du snapshot (rendu, paiement, webhook) ne les lit jamais.
  delete v.updatedAt; delete v.createdAt;
  var riche = false;
  CHAMPS_LOURDS.forEach(function (c) {
    if (c in v) { delete v[c]; riche = true; }
  });
  if (riche) v._riche = 1;
  return v;
}

/* Répercute UNE écriture d'override dans son shard. `patch` = ce qui vient
   d'être écrit dans product_overrides/{id}, MOINS les champs lourds (le webhook
   lit le COGS, le rendu lit les prix : rien de LÉGER ne doit manquer) ;
   null = suppression.
   Best-effort : une panne du snapshot ne doit JAMAIS faire échouer l'écriture
   principale — mais l'appelant DOIT lire la valeur de retour et la dire :
   `false` veut dire « la fiche est durable mais PAS visible au catalogue », et
   un « ✅ » affiché là-dessus est un mensonge (payé le 14/08/2026). */
async function majSnapshot(db, admin, id, patch) {
  try {
    var valeur = patch === null
      ? admin.firestore.FieldValue.delete()
      : valeurPourShard(patch);
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
        /* ⛔ Même dénudage que majSnapshot : un chemin qui garderait les champs
           lourds referait déborder les shards par le balayage. */
        parShard[n][String(e.id)] = valeurPourShard(e.patch);
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
    /* ⛔ Même dénudage qu'à l'écriture : une reconstruction qui recopierait les
       photos base64 referait déborder les shards — et elle tourne justement
       quand on essaie de se rattraper. */
    parShard[shardDe(doc.id)][doc.id] = valeurPourShard(doc.data() || {});
  });
  for (var m = 0; m < NB_SHARDS; m++) {
    await docShard(db, m).set(parShard[m], { merge: false });
  }
  return snap.size;
}

module.exports = { majSnapshot: majSnapshot, majSnapshotBatch: majSnapshotBatch,
  valeurPourShard: valeurPourShard, CHAMPS_LOURDS: CHAMPS_LOURDS,
  lireSnapshot: lireSnapshot, reconstruire: reconstruire, shardDe: shardDe,
  NB_SHARDS: NB_SHARDS, PREFIXE: PREFIXE };
