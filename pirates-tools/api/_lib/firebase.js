// api/_lib/firebase.js — Single Firebase Admin initializer for the API.
//
// Returns a cached { admin, db } pair, or { admin: null, db: null } when
// FIREBASE_SERVICE_ACCOUNT is not configured (so callers degrade gracefully
// instead of crashing). Centralises the init that was previously duplicated
// across several endpoints.

'use strict';

var _admin = null;
var _db = null;

function getFirebase() {
  if (_db) return { admin: _admin, db: _db };

  var serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) return { admin: null, db: null };

  try {
    _admin = require('firebase-admin');
    if (!_admin.apps.length) {
      _admin.initializeApp({
        credential: _admin.credential.cert(JSON.parse(serviceAccount))
      });
    }
    _db = _admin.firestore();
    return { admin: _admin, db: _db };
  } catch (err) {
    console.error('[firebase] init failed:', err.message);
    _admin = null;
    _db = null;
    return { admin: null, db: null };
  }
}

// Vérifie un ID token Firebase présenté en `Authorization: Bearer <token>`.
// Retourne l'uid AUTHENTIFIÉ (signé par Firebase, infalsifiable) ou null si
// absent/invalide/expiré, ou si l'Admin SDK n'est pas configuré. Ne jette
// jamais → l'appelant dégrade proprement (pas de remise, pas de matching par
// uid). C'est la brique de S2 : on ne fait plus confiance à un uid déclaratif.
async function verifyUid(req) {
  try {
    var h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    var m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
    if (!m) return null;
    var fb = getFirebase();
    if (!fb.admin) return null;
    var decoded = await fb.admin.auth().verifyIdToken(m[1]);
    return (decoded && decoded.uid) || null;
  } catch (e) {
    // token invalide/expiré/révoqué → traité comme non authentifié
    return null;
  }
}

// Vérifie que la requête porte un ID token Firebase d'un compte ADMIN (custom
// claim `admin: true`, posé une fois via scripts/set-admin-claim.js). Base de
// H6 : remplacer le secret admin partagé (rejouable, stocké en sessionStorage)
// par une identité Firebase à privilège. Retourne true SEULEMENT si le token
// est valide ET porte le claim. Ne jette jamais → l'appelant retombe sur la
// voie secret (transition sans coupure).
async function verifyAdmin(req) {
  try {
    var h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    var m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
    if (!m) return false;
    var fb = getFirebase();
    if (!fb.admin) return false;
    var decoded = await fb.admin.auth().verifyIdToken(m[1]);
    return !!(decoded && decoded.admin === true);
  } catch (e) {
    return false;
  }
}

module.exports = { getFirebase: getFirebase, verifyUid: verifyUid, verifyAdmin: verifyAdmin };
