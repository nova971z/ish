// api/_lib/ratelimit.js — Fixed-window rate limiter backed by Firestore.
//
// Serverless functions are stateless, so an in-memory counter can't limit
// across invocations/instances — this uses Firestore as the shared store.
// Fails OPEN (allows the request) when Firestore is unavailable, since a
// contact/newsletter relay should not hard-break if the limiter store is down.

'use strict';

var getFirebase = require('./firebase').getFirebase;

// Returns true if the request is allowed, false if the limit is exceeded.
// bucket: logical name ('contact'); key: e.g. client IP; max per windowSec.
async function allow(bucket, key, max, windowSec) {
  var fb = getFirebase();
  if (!fb.db) return true; // no persistent store → cannot limit; allow

  var win = Math.floor(Date.now() / (windowSec * 1000));
  var safeKey = String(key).replace(/[^a-zA-Z0-9.:_-]/g, '').slice(0, 64) || 'unknown';
  var ref = fb.db.collection('rate_limits').doc(bucket + '_' + safeKey + '_' + win);

  try {
    var count = await fb.db.runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      var c = (snap.exists ? (snap.data().count || 0) : 0) + 1;
      // `expiresAt` lets an optional Firestore TTL policy prune old buckets.
      tx.set(ref, { count: c, expiresAt: new Date((win + 2) * windowSec * 1000) }, { merge: true });
      return c;
    });
    return count <= max;
  } catch (e) {
    console.error('[ratelimit]', e.message);
    return true; // fail open on transient error
  }
}

// IP client depuis les en-têtes proxy.
// SÉCURITÉ (H2) : on privilégie `x-real-ip`, que Vercel POSE lui-même à l'IP
// réelle de connexion et écrase — non falsifiable par le client. L'ancienne
// version prenait le PREMIER token de `x-forwarded-for`, c'est-à-dire la valeur
// la plus à gauche, potentiellement injectée par le client : un attaquant
// changeait d'`X-Forwarded-For` à chaque requête → clé de compteur différente
// → tous les plafonds (contact, newsletter, paiement) contournés.
// Repli si x-real-ip absent (autre hébergeur) : DERNIER token de XFF, celui
// ajouté par le proxy de confiance le plus proche du serveur — pas le premier.
function clientIp(req) {
  var h = (req && req.headers) || {};
  var realIp = String(h['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  var parts = String(h['x-forwarded-for'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (parts.length) return parts[parts.length - 1];
  return 'unknown';
}

module.exports = { allow: allow, clientIp: clientIp };
