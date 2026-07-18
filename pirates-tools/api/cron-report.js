// /api/cron-report — Rapport d'audience mensuel + purge de rétention.
//
// Déclenché par Vercel Cron (voir vercel.json → crons, 1er du mois). Compile les
// agrégats analytics, envoie à OWNER_EMAIL un mail (résumé HTML + pièce jointe
// JSON analysable), puis purge les données de plus de 14 mois (visiteurs
// inactifs > 13 mois). Peut aussi être déclenché manuellement par l'admin
// (bouton « recevoir le rapport maintenant ») pour tester.
//
// SÉCURITÉ : accès réservé soit au Cron Vercel (Authorization: Bearer
// CRON_SECRET — à définir sur Vercel), soit à l'admin (requireAdmin). Sans l'un
// des deux → 401. Ne jamais exposer ces données au public.

'use strict';

var auth = require('./_lib/auth');
var firebase = require('./_lib/firebase');
var A = require('./_lib/analytics');

async function deleteSnapshot(db, snap) {
  var docs = snap.docs || [];
  var n = 0;
  for (var i = 0; i < docs.length; i += 400) {
    var batch = db.batch();
    docs.slice(i, i + 400).forEach(function (d) { batch.delete(d.ref); });
    await batch.commit();
    n += Math.min(400, docs.length - i);
  }
  return n;
}

module.exports = async function handler(req, res) {
  // ── Auth : Cron Vercel (Bearer CRON_SECRET) OU admin ──────────────────────
  var cronSecret = process.env.CRON_SECRET;
  var authz = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  var cronOk = !!cronSecret && authz === 'Bearer ' + cronSecret;
  if (!cronOk) {
    var denied = await auth.requireAdmin(req);
    if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });
  }

  var fb = firebase.getFirebase();
  var db = fb.db, admin = fb.admin;
  if (!db) return res.status(503).json({ ok: false, error: 'Firestore not configured' });

  // ── 1) Synthèse ───────────────────────────────────────────────────────────
  // Lecture simple sans tri : Firestore refuse orderBy(documentId, 'desc').
  // summarize() trie ; les collections sont bornées (purge > 14 mois).
  var readAll = async function (coll) {
    var s = await db.collection(coll).get();
    var out = [];
    s.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); });
    return out;
  };

  var summary, report, json;
  try {
    var daily = await readAll('analytics_daily');
    var products = await readAll('analytics_products');
    var clicks = await readAll('analytics_clicks');
    var geo = await readAll('analytics_geo');
    summary = A.summarize(daily, products, clicks, geo);
    report = A.buildReport(summary, Date.now());
    json = JSON.stringify(report, null, 2);
  } catch (e) {
    console.error('[cron-report] summary failed:', e && e.message);
    return res.status(500).json({ ok: false, error: 'summary failed' });
  }

  // ── 2) Envoi mail (Resend) avec pièce jointe JSON ─────────────────────────
  var sent = false, mailError = null;
  var apiKey = process.env.RESEND_API_KEY;
  var from = process.env.RESEND_FROM || 'Pirates Tools <onboarding@resend.dev>';
  var to = process.env.OWNER_EMAIL || '';
  if (apiKey && to) {
    try {
      var r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: from,
          to: to,
          subject: 'Pirates Tools — Rapport d\'audience ' + report.period,
          html: A.renderReportHtml(report),
          attachments: [{
            filename: A.reportFilename(report),
            content: Buffer.from(json, 'utf8').toString('base64')
          }]
        })
      });
      sent = r.ok;
      if (!r.ok) { mailError = 'Resend ' + r.status; console.error('[cron-report]', mailError, await r.text()); }
    } catch (e) { mailError = e && e.message; console.error('[cron-report] mail:', mailError); }
  } else {
    mailError = 'RESEND_API_KEY / OWNER_EMAIL manquant';
  }

  // ── 3) Purge (rétention) — jamais bloquante pour la réponse ───────────────
  var purged = { daily: 0, visitors: 0 };
  var cut = A.purgeCutoffs(Date.now());
  try {
    var oldDaily = await db.collection('analytics_daily')
      .where(admin.firestore.FieldPath.documentId(), '<', cut.dailyBefore).get();
    purged.daily = await deleteSnapshot(db, oldDaily);
  } catch (e) { console.error('[cron-report] purge daily:', e && e.message); }
  try {
    var oldVis = await db.collection('analytics_visitors')
      .where('lastSeen', '<', cut.visitorLastSeenBefore).limit(2000).get();
    purged.visitors = await deleteSnapshot(db, oldVis);
  } catch (e) { console.error('[cron-report] purge visitors:', e && e.message); }

  return res.status(200).json({
    ok: true, sent: sent, mailError: sent ? undefined : mailError,
    period: report.period, purged: purged
  });
};
