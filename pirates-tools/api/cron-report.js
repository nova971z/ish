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

// ── Rappel mensuel VEILLE (email) ───────────────────────────────────────────
// Nudge simple et clair (dyspraxie) : quoi vérifier ce mois-ci + liens officiels.
// Pas de calcul ici : le vrai bilan chiffré est dans l'admin (page Comptabilité).
function veilleReminderHtml() {
  var items = [
    { t: 'Octroi de mer (douane)', d: 'Vérifier les taux d\'octroi de mer / octroi régional appliqués à tes produits (Guadeloupe 971). Une évolution des taux change ton prix de revient.', url: 'https://www.douane.gouv.fr/', link: 'douane.gouv.fr' },
    { t: 'TVA', d: 'Contrôler ton régime : franchise en base (pas de TVA facturée) tant que tu es sous les seuils. Si tu dépasses, tu bascules et tu dois déclarer/reverser.', url: 'https://www.impots.gouv.fr/', link: 'impots.gouv.fr' },
    { t: 'Impôt sur les sociétés (IS)', d: 'SASU à l\'IS : 15 % jusqu\'à 42 500 € de bénéfice, 25 % au-delà. Vérifier l\'acompte / la déclaration de résultat le moment venu.', url: 'https://www.impots.gouv.fr/professionnel', link: 'impots.gouv.fr/professionnel' },
    { t: 'Grille Colissimo / transport', d: 'Comparer la grille La Poste et le tarif container du mois. Si un prix a bougé, mets-le à jour dans l\'admin (Comptabilité → Calculateur) et relance le recalcul.', url: 'https://www.laposte.fr/professionnel/tarifs-colissimo', link: 'laposte.fr' }
  ];
  var rows = items.map(function (it) {
    return '<div style="margin:0 0 16px;padding:14px 16px;background:#faf7ef;border-radius:10px;border:1px solid #e8e0cc">'
      + '<div style="font-weight:700;color:#1a1a1a;font-size:15px">' + it.t + '</div>'
      + '<div style="color:#444;font-size:14px;line-height:1.5;margin:6px 0 8px">' + it.d + '</div>'
      + '<a href="' + it.url + '" style="color:#8a6d1a;font-weight:600;font-size:13px;text-decoration:none">→ ' + it.link + '</a>'
      + '</div>';
  }).join('');
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px">'
    + '<h2 style="color:#1a1a1a;font-size:20px;margin:0 0 6px">🗓️ Rappel du mois — taxes &amp; déclarations</h2>'
    + '<p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 18px">Petit point rapide pour ne rien oublier. Coche chaque ligne dans ton admin (page <strong>Comptabilité</strong>, bouton « C\'est vérifié ») une fois faite.</p>'
    + rows
    + '<p style="color:#888;font-size:12px;line-height:1.5;margin:18px 0 0">Le bilan chiffré exact (chiffre d\'affaires, TVA à récupérer, IS, résultat net) est toujours à jour dans ta partie administration. Ce mail n\'est qu\'un rappel.</p>'
    + '</div>';
}

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

  // ── 2b) Rappel mensuel VEILLE : taxes officielles + déclarations ──────────
  // Nudge simple pour ne rien oublier (dyspraxie) — envoyé chaque mois avec le rapport.
  if (apiKey && to) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: from, to: to,
          subject: 'Pirates Tools — Rappel du mois : taxes & déclarations',
          html: veilleReminderHtml()
        })
      });
    } catch (e) { console.error('[cron-report] veille mail:', e && e.message); }
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
