// POST /api/contact — Public contact form, forwards to OWNER_EMAIL via Resend.
// Body : { name, email, phone?, subject?, message, honeypot? }
//   OU  { type:'partner-application', ...champs pré-inscription artisan } (Phase 3a)
// Anti-spam : honeypot field + IP rate limiting + length/email validation.
//
// NB : la pré-inscription artisan est branchée ICI (et pas dans un endpoint
// dédié) car le plan Vercel Hobby est à 12/12 fonctions — aucune 13e possible.

const rl = require('./_lib/ratelimit');
const { getFirebase } = require('./_lib/firebase');

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

  // ── Branche : pré-inscription artisan (Phase 3a, sans paiement) ──────────
  if (body.type === 'partner-application') {
    // Rate limit dédié (bucket séparé du contact) : 3 candidatures / h / IP.
    if (!(await rl.allow('partner-app', rl.clientIp(req), 3, 3600))) {
      return res.status(429).json({ ok: false, error: 'Trop de demandes. Réessayez dans une heure.' });
    }
    return handlePartnerApplication(body, { apiKey, from, ownerEmail }, res);
  }

  // Rate limit: 5 messages / hour / IP.
  if (!(await rl.allow('contact', rl.clientIp(req), 5, 3600))) {
    return res.status(429).json({ ok: false, error: 'Trop de messages envoyés. Réessayez dans une heure.' });
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
      // Ne pas dumper l'objet complet (peut contenir des champs du message) :
      // status + message d'erreur Resend suffisent au diagnostic.
      console.error('[api/contact] Resend error:', r.status, (data && (data.message || data.name)) || '');
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

// ── Pré-inscription artisan (Phase 3a) ─────────────────────────────────────
// Validation STRICTE par allowlist (données affichées dans un email + stockées
// en base). AUCUN paiement ici : pure collecte + acceptation horodatée des
// règles. Le logo éventuel est une dataURL compressée côté client (comme les
// photos partenaires Phase 2), plafonnée. Persistée via l'Admin SDK dans
// `partner_applications` (serveur seul) ET notifiée par email au propriétaire.
const PARTNER_TIERS = ['basique', 'pro', 'gold', 'black'];
const PUB_CHOICES = ['google', 'meta', 'aucun'];
const SITE_OPTIONS = ['neuf', 'refonte', 'portfolio', 'pub-doublee', 'aucun'];
const DATAURL_MAX = 170000;

function sTrim(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function inSet(v, set, fallback) { return set.indexOf(v) !== -1 ? v : fallback; }

async function handlePartnerApplication(body, cfg, res) {
  const name = sTrim(body.name, 100);
  const metier = sTrim(body.metier, 40);
  const email = sTrim(body.email, 200);
  const commune = sTrim(body.commune, 60);
  const phone = sTrim(body.phone, 30);
  const tier = inSet(body.tier, PARTNER_TIERS, 'black');

  // Champs obligatoires minimaux + acceptation des règles OBLIGATOIRE.
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Nom / entreprise requis' });
  if (metier.length < 2) return res.status(400).json({ ok: false, error: 'Métier requis' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Email invalide' });
  if (body.rulesAccepted !== true) return res.status(400).json({ ok: false, error: 'Vous devez accepter les règles du programme.' });

  const sizes = body.sizes && typeof body.sizes === 'object' ? body.sizes : {};
  const application = {
    name, metier, email, commune, phone, tier,
    sizes: {
      tshirt: sTrim(sizes.tshirt, 12),
      pantalon: sTrim(sizes.pantalon, 12),
      pointure: sTrim(sizes.pointure, 6),
      gants: sTrim(sizes.gants, 12)
    },
    couleurs: sTrim(body.couleurs, 60),
    facebook: sTrim(body.facebook, 200),
    instagram: sTrim(body.instagram, 200),
    pubChoice: inSet(body.pubChoice, PUB_CHOICES, 'aucun'),
    hasWebsite: body.hasWebsite === true,
    websiteUrl: sTrim(body.websiteUrl, 200),
    siteOption: inSet(body.siteOption, SITE_OPTIONS, 'aucun'),
    message: sTrim(body.message, 2000),
    rulesAccepted: true,
    status: 'nouvelle'
  };
  const hasLogo = typeof body.logo === 'string'
    && /^data:image\/(jpeg|png|webp);base64,/.test(body.logo)
    && body.logo.length <= DATAURL_MAX;

  // Persistance Firestore (Admin SDK — contourne les règles ; la collection est
  // fermée au client). Dégrade proprement si FIREBASE_SERVICE_ACCOUNT absent :
  // l'email reste envoyé (le propriétaire ne perd JAMAIS la candidature).
  let stored = false;
  try {
    const fb = getFirebase();
    if (fb.db) {
      const doc = Object.assign({}, application, {
        logo: hasLogo ? body.logo : '',
        createdAt: fb.admin.firestore.FieldValue.serverTimestamp(),
        acceptedRulesAt: fb.admin.firestore.FieldValue.serverTimestamp()
      });
      await fb.db.collection('partner_applications').add(doc);
      stored = true;
    }
  } catch (err) {
    console.error('[api/contact] partner-application store failed:', err.message);
  }

  // Email récapitulatif au propriétaire.
  try {
    const html = partnerApplicationEmail(application, stored);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: cfg.from,
        to: cfg.ownerEmail,
        reply_to: email,
        subject: '[Partenaire] Pré-inscription ' + tier.toUpperCase() + ' — ' + name,
        html: html
      })
    });
    if (!r.ok) {
      const data = await r.json().catch(function () { return {}; });
      console.error('[api/contact] partner-application Resend error:', r.status, (data && (data.message || data.name)) || '');
      // Si stocké mais email KO : la candidature n'est PAS perdue → 200.
      if (stored) return res.status(200).json({ ok: true, stored: true, emailed: false });
      return res.status(502).json({ ok: false, error: 'Envoi impossible, réessaie plus tard' });
    }
    return res.status(200).json({ ok: true, stored: stored, emailed: true });
  } catch (err) {
    console.error('[api/contact] partner-application error:', err.message);
    if (stored) return res.status(200).json({ ok: true, stored: true, emailed: false });
    return res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
}

function partnerApplicationEmail(a, stored) {
  const row = (label, val) => val
    ? '<tr><td style="padding:6px 0;color:#9aa4b2;font-size:12px;width:150px;vertical-align:top">' + escapeHtml(label) + '</td>'
      + '<td style="padding:6px 0;color:#fff;font-size:13px">' + escapeHtml(val) + '</td></tr>'
    : '';
  const sizesStr = [
    a.sizes.tshirt ? 'T-shirt ' + a.sizes.tshirt : '',
    a.sizes.pantalon ? 'Pantalon ' + a.sizes.pantalon : '',
    a.sizes.pointure ? 'Pointure ' + a.sizes.pointure : '',
    a.sizes.gants ? 'Gants ' + a.sizes.gants : ''
  ].filter(Boolean).join(' · ');
  const pubLabel = { google: 'Google Ads', meta: 'Facebook / Instagram', aucun: 'Non précisé' }[a.pubChoice] || a.pubChoice;
  const siteLabel = {
    neuf: 'Site vitrine neuf', refonte: 'Refonte de son site', portfolio: 'Page portfolio complémentaire',
    'pub-doublee': 'Pas de site — budget pub doublé', aucun: 'Non précisé'
  }[a.siteOption] || a.siteOption;

  return '<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#0a0f14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf5">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f14;padding:32px 0"><tr><td align="center">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#0f1720;border:1px solid rgba(139,92,246,.3);border-radius:16px;overflow:hidden;max-width:600px">'
    + '<tr><td style="background:linear-gradient(135deg,#8B5CF6,#6d28d9);padding:28px 32px;text-align:center">'
    + '<h1 style="margin:0;font-size:22px;color:#fff">Nouvelle pré-inscription partenaire</h1>'
    + '<p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">Programme artisans — ' + escapeHtml(a.tier.toUpperCase()) + '</p></td></tr>'
    + '<tr><td style="padding:24px 32px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    + row('Entreprise', a.name)
    + row('Métier', a.metier)
    + row('Commune', a.commune)
    + row('Email', a.email)
    + row('Téléphone', a.phone)
    + row('Formule visée', a.tier)
    + row('Tailles ÉPI', sizesStr)
    + row('Couleurs flocage', a.couleurs)
    + row('Facebook', a.facebook)
    + row('Instagram', a.instagram)
    + row('Publicité', pubLabel)
    + row('Site web', a.hasWebsite ? ('Oui — ' + (a.websiteUrl || 'non précisé')) : 'Non')
    + row('Option site', siteLabel)
    + row('Message', a.message)
    + '<tr><td style="padding:6px 0;color:#9aa4b2;font-size:12px">Règles acceptées</td><td style="padding:6px 0;color:#34d399;font-size:13px;font-weight:700">✓ Oui (horodaté)</td></tr>'
    + '</table>'
    + '<p style="margin:18px 0 0;color:' + (stored ? '#6b7280' : '#fbbf24') + ';font-size:11px">'
    + (stored ? 'Enregistrée dans la base (onglet Admin → Candidatures).' : '⚠️ Non enregistrée en base (FIREBASE_SERVICE_ACCOUNT manquant) — cet email fait foi.')
    + '</p>'
    + '</td></tr></table></td></tr></table></body></html>';
}
