// api/_lib/auth.js — Shared authentication helpers for the serverless API.
//
// Single source of truth for admin-secret verification so every protected
// endpoint uses the SAME constant-time comparison and the SAME error contract.

'use strict';

var crypto = require('crypto');

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

// Verify the admin secret from the "x-admin-secret" request header.
// Returns null when authorized, or { status, error } to return to the client.
function requireAdmin(req) {
  var expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return { status: 503, error: 'Admin not configured. Set ADMIN_SECRET env var on Vercel.' };
  }
  var provided = (req && req.headers && req.headers['x-admin-secret']) || '';
  if (!timingSafeEqualStr(provided, expected)) {
    return { status: 401, error: 'Invalid admin secret' };
  }
  return null;
}

module.exports = {
  timingSafeEqualStr: timingSafeEqualStr,
  requireAdmin: requireAdmin
};
