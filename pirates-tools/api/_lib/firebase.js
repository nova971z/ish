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

module.exports = { getFirebase: getFirebase };
