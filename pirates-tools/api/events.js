// POST /api/events — Ingestion de la mesure d'audience maison (première partie).
//
// Reçoit un petit lot d'événements déjà émis par track() côté client, les
// VALIDE strictement (allowlist, pas de PII), en dérive la géo depuis les
// en-têtes Vercel (l'IP n'est JAMAIS stockée) et incrémente des AGRÉGATS
// Firestore. Non autoritaire : ne touche jamais commandes/paiements/prix.
// Échoue en douceur (toujours 204) — la mesure d'audience ne doit jamais
// casser l'expérience. Écriture via Admin SDK (contourne les règles ; les
// collections analytics_* sont fermées au client, cf. firestore.rules).
//
// Corps : { events:[{event,id?,category?,t?,ms?,route?,src?}], visitorId?,
//           consent?:bool, device?:'mobile'|'desktop', source?:string }

'use strict';

var http = require('./_lib/http');
var rl = require('./_lib/ratelimit');
var firebase = require('./_lib/firebase');
var A = require('./_lib/analytics');

// Étend les clés en dot-path ("device.mobile") en objets imbriqués, avec
// FieldValue.increment pour les incréments → set({merge:true}) fusionne et crée
// le document au besoin (le dot-path littéral dans un set NE serait PAS imbriqué).
function buildData(op, admin) {
  var FV = admin.firestore.FieldValue;
  var data = {};
  function assign(path, value) {
    var parts = path.split('.');
    var o = data;
    for (var i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = value;
  }
  if (op.set) Object.keys(op.set).forEach(function (k) { assign(k, op.set[k]); });
  if (op.inc) Object.keys(op.inc).forEach(function (k) { assign(k, FV.increment(op.inc[k])); });
  return data;
}

module.exports = async function handler(req, res) {
  http.applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // FILTRAGE BOTS : robots/crawlers/scrapers/headless écartés AVANT toute
  // écriture (même pas de compteur anti-abus consommé) → les stats ne comptent
  // que des humains. 204 silencieux (aucun signal exploitable par un bot).
  if (A.isBot(req.headers && (req.headers['user-agent'] || req.headers['User-Agent']))) {
    return res.status(204).end();
  }

  // Anti-abus : un client honnête envoie quelques lots/min. 60/min/IP borne les
  // bots sans gêner un usage réel. Fail-open (ratelimit.js) si le store est down.
  if (!(await rl.allow('events', rl.clientIp(req), 60, 60))) {
    return res.status(204).end(); // silencieux : pas de signal exploitable
  }

  var body = req.body || {};
  // Honeypot optionnel + garde-fou taille.
  if (body.website || body.honeypot) return res.status(204).end();

  var rawEvents = Array.isArray(body.events) ? body.events.slice(0, A.MAX_EVENTS_PER_BATCH) : [];
  var events = [];
  for (var i = 0; i < rawEvents.length; i++) {
    var clean = A.sanitizeEvent(rawEvents[i]);
    if (clean) events.push(clean);
  }
  if (!events.length) return res.status(204).end();

  var fb = firebase.getFirebase();
  if (!fb.db) return res.status(204).end(); // pas de store → on ignore silencieusement

  try {
    // Construction du plan d'écriture DANS le try : deriveGeo/planWrites ne
    // doivent JAMAIS pouvoir faire planter le handler en 500 (sinon aucun
    // événement enregistré). En cas de pépin → 204, on n'écrit juste rien.
    var ops = A.planWrites({
      events: events,
      geo: A.deriveGeo(req.headers),
      device: body.device,
      source: body.source,
      consent: body.consent === true,
      visitorId: body.visitorId,
      nowMs: Date.now()
    });

    var batch = fb.db.batch();
    var visitorOps = [];
    ops.forEach(function (op) {
      if (op.firstSeenIfNew != null) { visitorOps.push(op); return; } // transaction séparée
      batch.set(fb.db.collection(op.coll).doc(op.doc), buildData(op, fb.admin), { merge: true });
    });
    await batch.commit();

    // Doc visiteur : firstSeen posé UNIQUEMENT à la création (transaction).
    for (var v = 0; v < visitorOps.length; v++) {
      var op = visitorOps[v];
      var ref = fb.db.collection(op.coll).doc(op.doc);
      /* eslint-disable no-loop-func */
      await fb.db.runTransaction(async function (tx) {
        var snap = await tx.get(ref);
        var data = buildData(op, fb.admin);
        if (!snap.exists) data.firstSeen = op.firstSeenIfNew;
        tx.set(ref, data, { merge: true });
      });
      /* eslint-enable no-loop-func */
    }
  } catch (e) {
    // Non autoritaire : on n'expose pas l'erreur, on ne casse rien.
    console.error('[api/events]', e && e.message);
  }
  return res.status(204).end();
};

// Exporté pour tests unitaires (conversion dot-path → objet imbriqué + increment).
module.exports._buildData = buildData;
