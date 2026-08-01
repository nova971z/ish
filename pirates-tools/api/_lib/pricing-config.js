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
  /* ⚠️ LES DEUX NOMS DE LA COMMISSION, et il FAUT les deux.
     `stripePct`/`stripeFix` sont ceux déjà écrits dans `config/pricing` ;
     `commissionPct`/`commissionFix` sont ceux que lit le modèle depuis le
     01/08/2026. Sans le second couple ici, l'admin ne pouvait enregistrer que
     l'ancien nom — que le modèle ignore. Voir `load()` : le RÉGLAGE ENREGISTRÉ
     doit toujours l'emporter sur la valeur par défaut, quel que soit son nom. */
  'stripePct', 'stripeFix', 'commissionPct', 'commissionFix',
  'packaging', 'fixedAnnual', 'ordersPerYear',
  'colissimo', 'containerPerUnit', 'lettre', 'heavyKg', 'refTerritory', 'douanePerParcel',
  // Abonnement encaissement (Revolut) : le montant mensuel et, si on le
  // connaît, la date d'ouverture. Sans date, la compta part du premier
  // encaissement — jamais d'un mois inventé (voir accounting.moisAbonnes).
  'abonnementMensuel', 'abonnementDebutMs'
];

function defaults() {
  return Object.assign({}, model.DEFAULT_CONFIG, { autoPrice: true, mode: 'colissimo' });
}

/* ⛔ UN RÉGLAGE ENREGISTRÉ L'EMPORTE TOUJOURS SUR UN DÉFAUT.
   ─────────────────────────────────────────────────────────────────────────
   Défaut trouvé le 01/08/2026, sur le chemin de l'argent, et invisible.

   Le modèle lit `commissionPct` en priorité et `stripePct` en repli. Mais
   `DEFAULT_CONFIG` définit DÉJÀ `commissionPct` (2,8 %) : après fusion il
   n'est jamais nul, donc le repli ne servait JAMAIS — et le `stripePct` que
   l'admin venait d'enregistrer était ignoré en silence.
   Mesuré : 1,5 % saisi, **2,8 % appliqué**, soit 6,11 € de commission au lieu
   de 2,91 € sur un outil à 211 €. Le bouton existait et ne faisait rien.

   La priorité se rétablit ici, à la LECTURE : c'est le seul endroit qui sache
   distinguer « valeur par défaut » d'une « valeur choisie par l'exploitant ».

   ⚠️ FONCTION EXPORTÉE, ET C'EST DÉLIBÉRÉ. Mon premier contrôle réécrivait
   cette logique de son côté : il restait vert alors que le vrai chemin de
   production était sabordé. Une porte qui teste une COPIE ne protège que la
   copie (erreur O6 du registre). `check-pricing.js` appelle donc CETTE
   fonction-ci, pas une jumelle. */
function fusionner(base, enBase) {
  var cfg = Object.assign({}, base, enBase || {});
  enBase = enBase || {};
  if (enBase.stripePct != null && enBase.commissionPct == null) {
    cfg.commissionPct = Number(enBase.stripePct);
  }
  if (enBase.stripeFix != null && enBase.commissionFix == null) {
    cfg.commissionFix = Number(enBase.stripeFix);
  }
  return cfg;
}

async function load() {
  var now = Date.now();
  if (_cache && now - _cacheTime < TTL) return _cache;
  var cfg = defaults();
  try {
    var db = firebase.getFirebase().db;
    if (db) {
      var doc = await db.collection('config').doc('pricing').get();
      if (doc.exists) {
        cfg = fusionner(cfg, doc.data() || {});
      }
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

module.exports = { load: load, save: save, defaults: defaults, fusionner: fusionner, sanitize: sanitize, invalidate: function () { _cache = null; } };
