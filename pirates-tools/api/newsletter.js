// POST /api/newsletter — Public newsletter signup.
// If RESEND_AUDIENCE_ID is set, adds the contact to that Resend audience.
// Otherwise, forwards the email to OWNER_EMAIL so you can collect manually.
//
// Body : { email, name?, honeypot? }

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: 'RESEND_API_KEY not configured' });
  }

  const body = req.body || {};
  if (body.honeypot || body.website) {
    return res.status(200).json({ ok: true, filtered: true });
  }

  const email = String(body.email || '').trim();
  const name = String(body.name || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ ok: false, error: 'Email invalide' });
  }
  if (name && name.length > 100) {
    return res.status(400).json({ ok: false, error: 'Nom trop long' });
  }

  const audienceId = process.env.RESEND_AUDIENCE_ID || '';

  try {
    if (audienceId) {
      // Add to Resend audience (https://resend.com/docs/api-reference/contacts/create-contact)
      const r = await fetch('https://api.resend.com/audiences/' + encodeURIComponent(audienceId) + '/contacts', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          first_name: name || undefined,
          unsubscribed: false
        })
      });
      const data = await r.json().catch(function () { return {}; });
      // Resend returns 201 on create, but if the contact already exists it may 422.
      // We treat "already in audience" as a success from the user's perspective.
      if (!r.ok && r.status !== 409 && r.status !== 422) {
        console.error('[api/newsletter] Resend audience error:', data);
        return res.status(502).json({ ok: false, error: 'Inscription impossible' });
      }
      return res.status(200).json({ ok: true, audience: true });
    }

    // Fallback : email the owner directly so they can collect manually
    const from = process.env.RESEND_FROM || 'Pirates Tools <onboarding@resend.dev>';
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) {
      return res.status(503).json({ ok: false, error: 'OWNER_EMAIL not configured' });
    }

    const html = '<!doctype html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0f14;color:#e6edf5;padding:24px">'
      + '<h2 style="color:#8B5CF6;margin:0 0 12px">Nouvelle inscription newsletter</h2>'
      + '<p style="margin:0 0 8px"><strong>Email :</strong> ' + escapeHtml(email) + '</p>'
      + (name ? '<p style="margin:0 0 8px"><strong>Nom :</strong> ' + escapeHtml(name) + '</p>' : '')
      + '<p style="margin:16px 0 0;color:#6b7280;font-size:12px">Ajoute ce contact à ta liste manuellement (ou configure <code>RESEND_AUDIENCE_ID</code> pour l\'auto-ajout).</p>'
      + '</body>';

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
        subject: '[Newsletter] Nouvelle inscription : ' + email,
        html: html
      })
    });
    if (!r.ok) {
      const data = await r.json().catch(function () { return {}; });
      console.error('[api/newsletter] Fallback mail error:', data);
      return res.status(502).json({ ok: false, error: 'Inscription impossible' });
    }
    return res.status(200).json({ ok: true, audience: false });
  } catch (err) {
    console.error('[api/newsletter] Error:', err.message);
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
