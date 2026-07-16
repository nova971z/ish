// api/_lib/auth.js — Shared authentication helpers for the serverless API.
//
// Single source of truth for admin-secret verification so every protected
// endpoint uses the SAME constant-time comparison and the SAME error contract.

'use strict';

var crypto = require('crypto');
var fbLib = require('./firebase');

// Constant-time string comparison. crypto.timingSafeEqual throws if the two
// buffers differ in length, which would itself leak length via an early error,
// so we normalise: on a length mismatch we still run one comparison of equal
// length and return false. This keeps the timing independent of where the
// first differing byte is.
function timingSafeEqualStr(a, b) {
  var ba = Buffer.from(String(a == null ? '' : a));
  var bb = Buffer.from(String(b == null ? '' : b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(bb, bb); // dummy compare, constant work
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// Autorise une requête admin. Deux voies (H6) :
//   1. RECOMMANDÉE — jeton Firebase d'un compte à claim `admin:true`
//      (Authorization: Bearer). Identité forte, révocable, sans secret rejouable.
//   2. TRANSITOIRE — secret partagé `x-admin-secret` (comparaison temps constant).
//      À retirer (supprimer ADMIN_SECRET sur Vercel) une fois la voie 1 vérifiée.
// Retourne null si autorisé, sinon { status, error }. ASYNC (verifyIdToken).
async function requireAdmin(req) {
  // Voie 1 : claim admin.
  if (await fbLib.verifyAdmin(req)) return null;

  // Voie 2 : secret partagé (si configuré).
  var expected = process.env.ADMIN_SECRET;
  if (expected) {
    var provided = (req && req.headers && req.headers['x-admin-secret']) || '';
    if (timingSafeEqualStr(provided, expected)) return null;
    return { status: 401, error: 'Invalid admin credentials' };
  }

  // Ni claim valide, ni secret configuré.
  if (fbLib.getFirebase().admin) {
    // Firebase dispo → mode claim-only : requête simplement non autorisée.
    return { status: 401, error: 'Invalid admin credentials' };
  }
  return { status: 503, error: 'Admin not configured. Set ADMIN_SECRET or a Firebase admin claim.' };
}

module.exports = {
  timingSafeEqualStr: timingSafeEqualStr,
  requireAdmin: requireAdmin
};
