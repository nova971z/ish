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

// Autorise UNIQUEMENT le traqueur de prix (POST ?type=price-watch).
//
// POURQUOI UN SECRET À PART, ET PAS `ADMIN_SECRET`
// A5 a retiré `ADMIN_SECRET` de Vercel : l'administration passe désormais par
// le claim Firebase, plus fort et révocable. Mais le raccourci iPad du traqueur
// ne peut PAS s'authentifier ainsi — un jeton Firebase expire chaque heure et
// un raccourci ne sait pas en fabriquer. Le traqueur est donc tombé en
// `401 Invalid admin credentials`, et les prix fournisseur ont cessé d'être
// relevés (constaté le 31/07/2026).
//
// Remettre `ADMIN_SECRET` rouvrirait TOUTE l'administration — commandes,
// clients, overrides — à un secret rejouable, et annulerait A5. On donne donc
// au traqueur sa propre clé, qui n'ouvre qu'une seule porte :
//   · portée : le seul point d'entrée `price-watch` ;
//   · pouvoir : écrire des prix fournisseur, rien d'autre ;
//   · révocable seule, sans toucher à l'accès administrateur.
//
// ⚠️ Le claim admin reste accepté ici : le propriétaire connecté peut toujours
// déclencher un relevé depuis l'interface.
async function requireWatch(req) {
  if (await fbLib.verifyAdmin(req)) return null;             // propriétaire connecté

  var expected = process.env.WATCH_SECRET;
  if (expected) {
    var provided = (req && req.headers && req.headers['x-watch-secret']) || '';
    if (timingSafeEqualStr(provided, expected)) return null;
    return { status: 401, error: 'Invalid watch credentials' };
  }

  // Repli : tant que WATCH_SECRET n'est pas posé sur Vercel, on accepte encore
  // l'ancien couple ADMIN_SECRET/x-admin-secret s'il existe — pour ne pas
  // casser un raccourci qui marcherait déjà. Aucun des deux : refus explicite,
  // avec le nom de la variable à créer (une erreur muette ferait perdre une
  // heure ; c'est exactement ce qui vient d'arriver).
  var legacy = process.env.ADMIN_SECRET;
  if (legacy) {
    var prov2 = (req && req.headers && req.headers['x-admin-secret']) || '';
    if (timingSafeEqualStr(prov2, legacy)) return null;
  }
  return {
    status: 401,
    error: 'Traqueur non autorisé. Définir WATCH_SECRET sur Vercel et envoyer '
      + 'l\'en-tête x-watch-secret (voir docs/TRAQUEUR-URLS.md).'
  };
}

module.exports = {
  timingSafeEqualStr: timingSafeEqualStr,
  requireAdmin: requireAdmin,
  requireWatch: requireWatch
};
