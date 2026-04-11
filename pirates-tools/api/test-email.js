// POST /api/test-email — Send a test email via Resend (admin-gated).
// Used to verify that RESEND_API_KEY, RESEND_FROM and OWNER_EMAIL are set
// correctly without needing a real Stripe checkout.
//
// Auth : header "x-admin-secret" must match env ADMIN_SECRET.
// Body : { to?: "email@example.com" }  — defaults to OWNER_EMAIL.

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return res.status(503).json({ ok: false, error: 'ADMIN_SECRET not set' });
  }
  if ((req.headers['x-admin-secret'] || '') !== expected) {
    return res.status(401).json({ ok: false, error: 'Invalid admin secret' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Pirates Tools <onboarding@resend.dev>';
  const defaultTo = process.env.OWNER_EMAIL || '';

  if (!apiKey) {
    return res.status(503).json({ ok: false, error: 'RESEND_API_KEY not set on Vercel' });
  }

  const body = req.body || {};
  const to = (body.to && String(body.to).trim()) || defaultTo;
  if (!to) {
    return res.status(400).json({ ok: false, error: 'Missing recipient (set OWNER_EMAIL or pass {to})' });
  }

  const html = '<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#0a0f14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf5">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f14;padding:32px 0">'
    + '<tr><td align="center">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#0f1720;border:1px solid rgba(139,92,246,.3);border-radius:16px;overflow:hidden;max-width:600px">'
    + '<tr><td style="background:linear-gradient(135deg,#8B5CF6,#6d28d9);padding:28px 32px;text-align:center">'
    + '<h1 style="margin:0;font-size:24px;color:#fff;letter-spacing:.5px">PIRATES TOOLS</h1>'
    + '<p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">Test de configuration email</p>'
    + '</td></tr>'
    + '<tr><td style="padding:32px">'
    + '<h2 style="margin:0 0 8px;font-size:20px;color:#fff">✅ Resend fonctionne</h2>'
    + '<p style="margin:0 0 20px;color:#9aa4b2;font-size:14px;line-height:1.6">'
    + 'Si tu vois cet email, ça veut dire que Resend est correctement configuré sur Vercel. '
    + 'Les confirmations de commande Stripe seront envoyées automatiquement après chaque paiement.'
    + '</p>'
    + '<div style="background:#0a0f14;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin:16px 0">'
    + '<p style="margin:0;color:#9aa4b2;font-size:12px;text-transform:uppercase;letter-spacing:.06em">Environnement</p>'
    + '<p style="margin:8px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#c4b5fd;line-height:1.6">'
    + 'FROM : ' + escapeHtml(from) + '<br>'
    + 'TO   : ' + escapeHtml(to) + '<br>'
    + 'TIME : ' + new Date().toISOString()
    + '</p>'
    + '</div>'
    + '</td></tr>'
    + '<tr><td style="background:#0a0f14;padding:16px 32px;text-align:center;border-top:1px solid rgba(255,255,255,.06)">'
    + '<p style="margin:0;color:#6b7280;font-size:11px">© Pirates Tools — Test email</p>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: from,
        to: to,
        subject: '[Test] Pirates Tools — Resend OK',
        html: html
      })
    });
    const data = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: 'Resend ' + r.status, details: data });
    }
    return res.status(200).json({ ok: true, id: data.id || null, to: to, from: from });
  } catch (err) {
    console.error('[api/test-email] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
