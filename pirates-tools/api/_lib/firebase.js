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
  var id = await verifyIdentity(req);
  return id ? id.uid : null;
}

// Identité COMPLÈTE issue du jeton vérifié : uid + adresse + état de
// vérification de l'adresse (28/07/2026). `email_verified` est une revendication
// signée par Firebase — le client ne peut pas la falsifier, contrairement à un
// champ envoyé dans le corps de la requête.
// ⚠️ Cette revendication ne change dans le jeton QU'AU RENOUVELLEMENT (1 h) ou
// sur un `getIdToken(true)` explicite : après avoir cliqué le lien de
// vérification, le client DOIT rafraîchir son jeton, sinon il resterait bloqué
// alors qu'il vient de vérifier. C'est le piège classique de ce mécanisme.
async function verifyIdentity(req) {
  try {
    var h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    var m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
    if (!m) return null;
    var fb = getFirebase();
    if (!fb.admin) return null;
    var decoded = await fb.admin.auth().verifyIdToken(m[1]);
    if (!decoded || !decoded.uid) return null;
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      emailVerified: decoded.email_verified === true
    };
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

module.exports = { getFirebase: getFirebase, verifyUid: verifyUid, verifyIdentity: verifyIdentity, verifyAdmin: verifyAdmin };
