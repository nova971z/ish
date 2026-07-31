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

/* ⛔ L'ORIGINE PUBLIQUE DU SITE — pour fabriquer une URL qu'un TIERS appellera.
   ─────────────────────────────────────────────────────────────────────────
   Deux besoins, une seule règle : l'adresse de retour après paiement
   (`redirect_url` chez Revolut) et l'adresse du webhook à déclarer chez le
   fournisseur. Les deux sortent du site et reviennent de l'extérieur.

   ⛔ L'en-tête `Origin` vient du CLIENT. On ne le recopie donc jamais tel
   quel : ce serait laisser un tiers décider où nos clients atterrissent après
   avoir payé, et où le fournisseur enverra ses notifications. On le VALIDE
   contre `ALLOWED_ORIGINS`, la liste blanche qui existe déjà pour le CORS.

   ⚠️ Rend `null` quand rien n'est sûr — jamais une valeur « au mieux ». Un
   appelant qui reçoit `null` doit se dégrader proprement ou refuser en
   expliquant quoi poser : une URL fabriquée à partir d'une chaîne vide donne
   « /api/webhook », que le fournisseur rejette avec un message qui ne dit rien.

   `PUBLIC_BASE_URL` sert de repli pour les appels SANS navigateur (tâche
   planifiée, appel serveur à serveur) : il n'y a alors aucun `Origin` à lire.
   Il est lui aussi vérifié — une variable mal collée ne doit pas devenir une
   adresse de redirection. */
function origineSure(req) {
  var listee = allowedOrigins();
  var brute = (req && req.headers && (req.headers.origin
    || String(req.headers.referer || '').replace(/^(https?:\/\/[^/]+).*$/, '$1'))) || '';
  brute = String(brute).replace(/\/+$/, '');
  if (brute && listee.indexOf(brute) !== -1) return brute;

  var repli = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (repli && /^https:\/\/[^/\s]+$/.test(repli)) return repli;

  return null;
}

module.exports = {
  allowedOrigins: allowedOrigins,
  applyCors: applyCors,
  origineSure: origineSure
};
