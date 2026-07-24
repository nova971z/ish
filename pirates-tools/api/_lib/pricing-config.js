// api/_lib/pricing-config.js — Charge/sauve la config de TARIFICATION (marge cible).
// Doc unique Firestore `config/pricing`. Fusionné avec les défauts du moteur.
// Écriture réservée à l'admin (Admin SDK) ; les clients n'y touchent jamais
// (firestore.rules default-deny). Cache court pour éviter les lectures répétées.

'use strict';

var model = require('./pricing-model');
var firebase = require('./firebase');

var _cache = null, _cacheTime = 0;
var TTL = 30000; // 30 s

// Champs autorisés à l'écriture (bloque toute clé arbitraire).
var ALLOWED = [
  'autoPrice', 'mode', 'targetNet', 'is', 'tvaFR',
  'stripePct', 'stripeFix', 'packaging', 'fixedAnnual', 'ordersPerYear',
  'colissimo', 'containerPerUnit', 'lettre', 'refTerritory'
];

function defaults() {
  return Object.assign({}, model.DEFAULT_CONFIG, { autoPrice: true, mode: 'colissimo' });
}

async function load() {
  var now = Date.now();
  if (_cache && now - _cacheTime < TTL) return _cache;
  var cfg = defaults();
  try {
    var db = firebase.getFirebase().db;
    if (db) {
      var doc = await db.collection('config').doc('pricing').get();
      if (doc.exists) cfg = Object.assign(cfg, doc.data());
    }
  } catch (e) { /* défauts si Firestore indisponible */ }
  _cache = cfg; _cacheTime = now;
  return cfg;
}

// Valide + sanitise un patch avant écriture.
function sanitize(patch) {
  var out = {};
  ALLOWED.forEach(function (k) {
    if (patch[k] === undefined) return;
    var v = patch[k];
    if (k === 'mode') { if (v === 'colissimo' || v === 'container') out[k] = v; return; }
    if (k === 'autoPrice') { out[k] = !!v; return; }
    if (k === 'refTerritory') { if (/^\d{3}$/.test(String(v))) out[k] = String(v); return; }
    if (k === 'colissimo') {
      if (Array.isArray(v) && v.every(function (r) { return Array.isArray(r) && r.length === 2 && isFinite(r[0]) && isFinite(r[1]); })) out[k] = v;
      return;
    }
    if (k === 'containerPerUnit') {
      if (v && isFinite(v.nu) && isFinite(v.coffret)) out[k] = { nu: Number(v.nu), coffret: Number(v.coffret) };
      return;
    }
    if (k === 'lettre') {
      if (v && isFinite(v.maxKg) && isFinite(v.price) && v.maxKg >= 0 && v.price >= 0) out[k] = { maxKg: Number(v.maxKg), price: Number(v.price) };
      return;
    }
    // numériques
    var n = Number(v);
    if (isFinite(n) && n >= 0) out[k] = n;
  });
  return out;
}

async function save(patch) {
  var db = firebase.getFirebase().db;
  if (!db) throw new Error('Firestore non configuré');
  var clean = sanitize(patch || {});
  if (Object.keys(clean).length === 0) throw new Error('Aucun champ valide');
  await db.collection('config').doc('pricing').set(clean, { merge: true });
  _cache = null;
  return load();
}

module.exports = { load: load, save: save, defaults: defaults, sanitize: sanitize, invalidate: function () { _cache = null; } };
