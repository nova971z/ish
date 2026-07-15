// api/_lib/stripe-meta.js — Lignes de commande {key, qty} dans la metadata Stripe.
//
// Un PaymentIntent (flux Elements) n'a pas de line_items : sans ça, le webhook
// ne peut ni reconstruire la commande, ni envoyer un email détaillé, ni la
// réconcilier. On sérialise donc les lignes dans la metadata à la création.
//
// Contraintes Stripe : ≤50 clés, clé ≤40 car., valeur ≤500 car. On sérialise
// en JSON compact [{"k":"slug","q":2},…] découpé en tranches ≤450 car.
// (items_0, items_1, …) + items_chunks (nombre de tranches). 50 lignes × slug
// ~50 car. ≈ 3000 car. ≈ 7 tranches — loin des 50 clés.

'use strict';

var CHUNK_SIZE = 450;
var MAX_CHUNKS = 40; // garde-fou : au-delà, metadata refusée par Stripe de toute façon

// items : [{ key, qty }] (déjà validés par l'endpoint) → objet metadata à
// fusionner. Retourne null si la sérialisation ne tient pas dans les limites.
function chunkItems(items) {
  var compact = (items || []).map(function (it) {
    return { k: String(it.key), q: it.qty };
  });
  var json = JSON.stringify(compact);
  var chunks = [];
  for (var i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push(json.slice(i, i + CHUNK_SIZE));
  }
  if (chunks.length > MAX_CHUNKS) return null;
  var meta = { items_chunks: String(chunks.length) };
  for (var c = 0; c < chunks.length; c++) meta['items_' + c] = chunks[c];
  return meta;
}

// metadata Stripe → [{ k, q }] ou null si absent/corrompu. Ne jette jamais :
// le webhook doit dégrader proprement (email sans détail de lignes) plutôt
// qu'échouer.
function readItems(metadata) {
  if (!metadata || !metadata.items_chunks) return null;
  var n = parseInt(metadata.items_chunks, 10);
  if (!isFinite(n) || n < 1 || n > MAX_CHUNKS) return null;
  var json = '';
  for (var i = 0; i < n; i++) {
    var part = metadata['items_' + i];
    if (typeof part !== 'string') return null;
    json += part;
  }
  try {
    var parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(function (it) {
      return it && typeof it.k === 'string' && isFinite(parseInt(it.q, 10));
    });
  } catch (_) {
    return null;
  }
}

module.exports = { chunkItems: chunkItems, readItems: readItems };
