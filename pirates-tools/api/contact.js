// POST /api/contact — Public contact form, forwards to OWNER_EMAIL via Resend.
// Body : { name, email, phone?, subject?, message, honeypot? }
// Anti-spam : simple honeypot field + basic length/email validation.

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Pirates Tools <onboarding@resend.dev>';
  const ownerEmail = process.env.OWNER_EMAIL || '';

  if (!apiKey || !ownerEmail) {
    return res.status(503).json({
      ok: false,
      error: 'Contact form not configured (RESEND_API_KEY + OWNER_EMAIL required)'
    });
  }

  const body = req.body || {};

  // Honeypot — if filled, it's a bot. Return 200 silently so the bot thinks it worked.
  if (body.honeypot || body.website) {
    return res.status(200).json({ ok: true, filtered: true });
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const subject = String(body.subject || 'Message depuis le site').trim();
  const message = String(body.message || '').trim();

  // Validation
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ ok: false, error: 'Nom invalide (2–100 caractères)' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ ok: false, error: 'Email invalide' });
  }
  if (message.length < 10 || message.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Message invalide (10–5000 caractères)' });
  }
  if (phone && phone.length > 30) {
    return res.status(400).json({ ok: false, error: 'Téléphone invalide' });
  }
  if (subject.length > 200) {
    return res.status(400).json({ ok: false, error: 'Sujet trop long' });
  }

  const messageHtml = escapeHtml(message).replace(/\n/g, '<br>');

  const html = '<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#0a0f14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf5">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f14;padding:32px 0">'
    + '<tr><td align="center">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#0f1720;border:1px solid rgba(139,92,246,.3);border-radius:16px;overflow:hidden;max-width:600px">'
    + '<tr><td style="background:linear-gradient(135deg,#8B5CF6,#6d28d9);padding:28px 32px;text-align:center">'
    + '<h1 style="margin:0;font-size:22px;color:#fff;letter-spacing:.5px">Nouveau message</h1>'
    + '<p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">Formulaire de contact — Pirates Tools</p>'
    + '</td></tr>'
    + '<tr><td style="padding:28px 32px">'
    + '<div style="background:#0a0f14;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin:0 0 16px">'
    + '<p style="margin:0 0 4px;color:#9aa4b2;font-size:11px;text-transform:uppercase;letter-spacing:.06em">De</p>'
    + '<p style="margin:0;color:#fff;font-size:14px;font-weight:600">' + escapeHtml(name) + '</p>'
    + '<p style="margin:2px 0 0;color:#c4b5fd;font-size:13px">' + escapeHtml(email) + '</p>'
    + (phone ? '<p style="margin:2px 0 0;color:#9aa4b2;font-size:13px">📞 ' + escapeHtml(phone) + '</p>' : '')
    + '</div>'
    + '<div style="background:#0a0f14;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin:0 0 16px">'
    + '<p style="margin:0 0 4px;color:#9aa4b2;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Sujet</p>'
    + '<p style="margin:0;color:#fff;font-size:14px">' + escapeHtml(subject) + '</p>'
    + '</div>'
    + '<div style="background:#0a0f14;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px">'
    + '<p style="margin:0 0 8px;color:#9aa4b2;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Message</p>'
    + '<div style="color:#e6edf5;font-size:14px;line-height:1.6">' + messageHtml + '</div>'
    + '</div>'
    + '</td></tr>'
    + '<tr><td style="background:#0a0f14;padding:12px 32px;text-align:center;border-top:1px solid rgba(255,255,255,.06)">'
    + '<p style="margin:0;color:#6b7280;font-size:11px">Répondre directement à cet email</p>'
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
        to: ownerEmail,
        reply_to: email,
        subject: '[Contact] ' + subject,
        html: html
      })
    });
    const data = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      console.error('[api/contact] Resend error:', data);
      return res.status(502).json({ ok: false, error: 'Envoi impossible, réessaie plus tard' });
    }
    return res.status(200).json({ ok: true, id: data.id || null });
  } catch (err) {
    console.error('[api/contact] Error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
