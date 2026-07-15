// api/_lib/http.js — CORS control for the serverless API.
//
// The app's own front-end calls the API SAME-ORIGIN (PT_API_BASE = ''), which
// needs no CORS headers at all. Cross-origin access is therefore DENIED by
// default and only granted to origins explicitly listed in the ALLOWED_ORIGINS
// env var (comma-separated). This replaces the previous blanket
// "Access-Control-Allow-Origin: *", which let any website call the
// secret-gated endpoints from a victim's browser.

'use strict';

function allowedOrigins() {
  var env = process.env.ALLOWED_ORIGINS || '';
  return env.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

// Emit CORS headers only when the request Origin is explicitly allowlisted.
// No Origin (same-origin / server-to-server) or a non-listed Origin → no
// headers emitted, so the browser blocks the cross-origin read.
function applyCors(req, res, methods) {
  var origin = req && req.headers && req.headers.origin;
  if (!origin) return;
  if (allowedOrigins().indexOf(origin) === -1) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret');
}

module.exports = {
  allowedOrigins: allowedOrigins,
  applyCors: applyCors
};
