// POST /api/contact — Public contact form, forwards to OWNER_EMAIL via Resend.
// Body : { name, email, phone?, subject?, message, honeypot? }
//   OU  { type:'partner-application', ...champs pré-inscription artisan } (Phase 3a)
// Anti-spam : honeypot field + IP rate limiting + length/email validation.
//
// NB : la pré-inscription artisan est branchée ICI (et pas dans un endpoint
// dédié) car le plan Vercel Hobby est à 12/12 fonctions — aucune 13e possible.

const rl = require('./_lib/ratelimit');
const { getFirebase, verifyUid } = require('./_lib/firebase');

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
    // uid VÉRIFIÉ (Bearer Firebase) si connecté — rattache la candidature au
    // compte (obligatoire côté client quand un code d'invitation est saisi).
    const uid = await verifyUid(req);
    return handlePartnerApplication(body, { apiKey, from, ownerEmail, uid }, res);
  }

  // ── Branche : self-service carte artisan (photos/logo depuis Mon compte) ──
  // Authentifié par ID token Firebase (Bearer) : l'utilisateur ne peut toucher
  // QUE la carte liée à SON uid (liaison posée par l'admin dans
  // partners_private). Champs modifiables : photos + logo, RIEN d'autre.
  if (body.type === 'partner-card-get' || body.type === 'partner-card-media') {
    return handlePartnerCardSelf(req, body, res);
  }

  // ── Branche : COURSES livraison quincaillerie (MODE TEST) ─────────────────
  // Service coursier INACTIF pour le public : seuls les comptes de TEST
  // (allowlist ci-dessous) peuvent créer/accepter des courses, le temps de
  // valider toute la chaîne de bout en bout. Auth Bearer OBLIGATOIRE.
  if (body.type === 'course-create' || body.type === 'course-list' || body.type === 'course-accept') {
    return handleCourses(req, body, { apiKey, from, ownerEmail }, res);
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

  // ── Code d'invitation (Black offert, décision user 25/07) ────────────────
  // Validé SERVEUR (jamais confiance au client), usage unique. On valide en
  // lecture d'abord et on ne marque « utilisé » qu'APRÈS enregistrement réussi
  // de la candidature : un échec plus loin ne brûle pas le code de l'invité
  // (le double-usage concurrent est théorique — 2 invités — et l'admin garde
  // la main sur la création des cartes de toute façon).
  const inviteCode = String(body.inviteCode || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
  let invited = false;
  let inviteRef = null;
  if (inviteCode) {
    const fb = getFirebase();
    if (!fb.db) {
      return res.status(503).json({ ok: false, error: 'Vérification du code impossible pour le moment, réessaie dans quelques minutes.' });
    }
    try {
      inviteRef = fb.db.collection('invite_codes').doc(inviteCode);
      const snap = await inviteRef.get();
      const d = snap.exists ? (snap.data() || {}) : null;
      if (!d || d.active === false || d.usedBy) {
        return res.status(400).json({ ok: false, error: 'Code d\'invitation invalide ou déjà utilisé.' });
      }
      invited = true;
    } catch (err) {
      console.error('[api/contact] invite code check failed:', err.message);
      return res.status(503).json({ ok: false, error: 'Vérification du code impossible pour le moment, réessaie dans quelques minutes.' });
    }
  }

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
    invited: invited,
    inviteCode: invited ? inviteCode : '',
    uid: sTrim(cfg.uid, 128),
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

  // Candidature enregistrée avec un code valide → le code est consommé
  // (usage unique). Best-effort : un échec ici est logué, jamais bloquant.
  if (invited && stored && inviteRef) {
    try {
      const fb = getFirebase();
      await inviteRef.update({ usedBy: email, usedAt: fb.admin.firestore.FieldValue.serverTimestamp() });
    } catch (err) {
      console.error('[api/contact] invite code mark-used failed:', err.message);
    }
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
        subject: '[Partenaire] Pré-inscription ' + tier.toUpperCase() + (invited ? ' 🎟️ INVITÉ' : '') + ' — ' + name,
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

// ── Self-service carte artisan (photos/logo depuis Mon compte) ─────────────
// Sécurité : uid VÉRIFIÉ (Bearer) → la liaison uid→carte vit dans
// partners_private (posée par l'admin, jamais par le client). Seuls photos et
// logo sont modifiables, avec EXACTEMENT les mêmes règles que l'admin
// (dataURL image only, plafond par tier, taille max).
const SELF_PHOTOS_MAX = { basique: 0, pro: 1, gold: 3, black: 6 };

async function handlePartnerCardSelf(req, body, res) {
  if (!(await rl.allow('partner-self', rl.clientIp(req), 30, 3600))) {
    return res.status(429).json({ ok: false, error: 'Trop de requêtes. Réessaie dans une heure.' });
  }
  const uid = await verifyUid(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'Connecte-toi pour gérer ta carte.' });
  const fb = getFirebase();
  if (!fb.db) return res.status(503).json({ ok: false, error: 'Service indisponible pour le moment.' });

  try {
    const privSnap = await fb.db.collection('partners_private').where('uid', '==', uid).limit(1).get();
    if (privSnap.empty) return res.status(200).json({ ok: true, card: null });
    const partnerId = privSnap.docs[0].id;
    const cardSnap = await fb.db.collection('partners').doc(partnerId).get();
    if (!cardSnap.exists) return res.status(200).json({ ok: true, card: null });
    const card = cardSnap.data() || {};
    const tier = SELF_PHOTOS_MAX[card.tier] !== undefined ? card.tier : 'basique';

    if (body.type === 'partner-card-get') {
      return res.status(200).json({
        ok: true,
        card: {
          id: partnerId, name: card.name || '', metier: card.metier || '',
          tier: tier, logo: card.logo || '',
          photos: Array.isArray(card.photos) ? card.photos : [],
          photosMax: SELF_PHOTOS_MAX[tier]
        }
      });
    }

    // partner-card-media : remplace photos + logo (et rien d'autre).
    const isDataImg = (v) => typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= 170000;
    const photos = Array.isArray(body.photos) ? body.photos.filter(isDataImg).slice(0, SELF_PHOTOS_MAX[tier]) : [];
    const logo = isDataImg(body.logo) ? body.logo : '';
    await fb.db.collection('partners').doc(partnerId).update({
      photos: photos,
      logo: logo,
      updatedAt: fb.admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(200).json({ ok: true, saved: true, photos: photos.length, logo: !!logo });
  } catch (err) {
    console.error('[api/contact] partner-card-self failed:', err.message);
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
    + (a.invited ? '<tr><td style="padding:6px 0;color:#9aa4b2;font-size:12px">Invitation</td><td style="padding:6px 0;color:#fbbf24;font-size:13px;font-weight:700">🎟️ INVITÉ — code ' + escapeHtml(a.inviteCode) + ' (abonnement offert, pas de bon 38 €)</td></tr>' : '')
    + (a.uid ? '<tr><td style="padding:6px 0;color:#9aa4b2;font-size:12px">Compte lié</td><td style="padding:6px 0;color:#c4b5fd;font-size:13px">uid ' + escapeHtml(a.uid) + '</td></tr>' : '')
    + '</table>'
    + '<p style="margin:18px 0 0;color:' + (stored ? '#6b7280' : '#fbbf24') + ';font-size:11px">'
    + (stored ? 'Enregistrée dans la base (onglet Admin → Candidatures).' : '⚠️ Non enregistrée en base (FIREBASE_SERVICE_ACCOUNT manquant) — cet email fait foi.')
    + '</p>'
    + '</td></tr></table></td></tr></table></body></html>';
}

// ═══════════════════════════════════════════════════════════════════════════
// COURSES livraison quincaillerie — MODE TEST (chaîne complète de bout en bout)
// Créer (artisan) → alerte email (livreurs de test) → accepter (1er gagnant).
// Seuls les comptes de l'allowlist peuvent agir tant que le service est
// inactif. Le serveur RECALCULE zone/prix depuis lat/lng (client jamais cru).
// ═══════════════════════════════════════════════════════════════════════════
const COURSE_TEST_EMAILS = ['justforwada@icloud.com'];   // comptes de test (user)
const COURSE_DEPOT = { lat: 16.2260, lng: -61.3823 };    // Sainte-Anne
const COURSE_BAREME = [                                   // = LV_BAREME client
  { zone: 1, maxKm: 10, prix: 22 },
  { zone: 2, maxKm: 22, prix: 48 },
  { zone: 3, maxKm: 34, prix: 74 },
  { zone: 4, maxKm: 46, prix: 100 }
];
function courseHaversineKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function handleCourses(req, body, cfg, res) {
  const rlOk = await rl.allow('courses', rl.clientIp(req), 30, 3600);
  if (!rlOk) return res.status(429).json({ ok: false, error: 'Trop de requêtes. Réessaie plus tard.' });

  const uid = await verifyUid(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'Connexion requise.' });
  const { admin, db } = getFirebase();
  if (!db) return res.status(503).json({ ok: false, error: 'Base non configurée.' });

  let email = '';
  try { email = String((await admin.auth().getUser(uid)).email || '').toLowerCase(); } catch (_) {}
  const isTester = COURSE_TEST_EMAILS.includes(email);

  // ── Créer une course (artisan) ──
  if (body.type === 'course-create') {
    if (!isTester) return res.status(403).json({ ok: false, error: 'Service en test — ouverture le 1er janvier.' });
    const address = String(body.address || '').trim().slice(0, 200);
    const lat = Number(body.lat), lng = Number(body.lng);
    const qty = Math.max(1, Math.min(99, parseInt(body.qty, 10) || 1));
    const productKey = String(body.productKey || '').slice(0, 80);
    const productTitle = String(body.productTitle || '').slice(0, 160);
    const when = ['matin', 'apresmidi', 'heure'].includes(body.when) ? body.when : 'matin';
    const hour = /^\d{2}:\d{2}$/.test(String(body.hour || '')) ? body.hour : '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? body.date : '';
    if (address.length < 4) return res.status(400).json({ ok: false, error: 'Adresse trop courte.' });
    if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ ok: false, error: 'Position manquante — tape ton adresse et valide-la sur la carte.' });
    // Zone/prix AUTORITAIRES serveur (le client n'est jamais cru).
    const km = courseHaversineKm(COURSE_DEPOT, { lat, lng });
    const z = COURSE_BAREME.find((b2) => km <= b2.maxKm);
    if (!z) return res.status(400).json({ ok: false, error: 'Hors zone de livraison (max 46 km depuis Sainte-Anne).' });
    const doc = {
      status: 'en_attente', test: true,
      artisanUid: uid, artisanEmail: email,
      productKey, productTitle, qty, address, lat, lng,
      km: Math.round(km * 10) / 10, zone: z.zone, prix: z.prix,
      date, when, hour,
      createdAt: new Date()
    };
    const ref = await db.collection('courses').add(doc);
    // Alerte email aux livreurs de test + owner (Resend).
    const whenTxt = when === 'heure' ? ('à ' + hour) : (when === 'matin' ? 'le matin' : "l'après-midi");
    const subject = '🛵 Nouvelle course zone ' + z.zone + ' — ' + z.prix + ' € — ' + address.slice(0, 60);
    const html = '<p><strong>Nouvelle course de livraison (TEST)</strong></p>'
      + '<p>' + escapeHtml(productTitle || productKey) + ' × ' + qty + '<br>'
      + '📍 ' + escapeHtml(address) + ' (' + doc.km + ' km de Sainte-Anne — zone ' + z.zone + ')<br>'
      + '📅 ' + (date || 'au plus tôt') + ' ' + whenTxt + '<br>'
      + '💶 <strong>' + z.prix + ' €</strong> pour le livreur</p>'
      + '<p>Ouvre ton espace livreur sur pirates-tools.com pour accepter la course (premier arrivé, premier servi).</p>';
    const dests = Array.from(new Set(COURSE_TEST_EMAILS.concat([cfg.ownerEmail])));
    for (const to of dests) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
          body: JSON.stringify({ from: cfg.from, to, subject, html })
        });
      } catch (e) { console.warn('[courses] alerte email échouée:', e.message); }
    }
    return res.status(200).json({ ok: true, course: { id: ref.id, km: doc.km, zone: z.zone, prix: z.prix } });
  }

  // ── Lister (livreur de test : dispo + les miennes ; artisan : les miennes) ──
  if (body.type === 'course-list') {
    const snap = await db.collection('courses').orderBy('createdAt', 'desc').limit(50).get()
      .catch(() => db.collection('courses').limit(50).get());
    const mine = [], dispo = [];
    snap.forEach((d) => {
      const c = Object.assign({ id: d.id }, d.data());
      const out = {
        id: c.id, status: c.status, productTitle: c.productTitle, qty: c.qty,
        address: c.address, km: c.km, zone: c.zone, prix: c.prix,
        date: c.date, when: c.when, hour: c.hour,
        mine: c.artisanUid === uid, acceptedByMe: c.courierUid === uid,
        createdAt: c.createdAt && c.createdAt.toMillis ? c.createdAt.toMillis() : null
      };
      if (c.artisanUid === uid || c.courierUid === uid) mine.push(out);
      if (isTester && c.status === 'en_attente' && c.artisanUid !== uid) dispo.push(out);
      else if (isTester && c.status === 'en_attente' && c.artisanUid === uid) dispo.push(out); // test : même compte des 2 côtés
    });
    return res.status(200).json({ ok: true, courier: isTester, dispo, mine });
  }

  // ── Accepter (livreur de test — 1er arrivé, transaction atomique) ──
  if (body.type === 'course-accept') {
    if (!isTester) return res.status(403).json({ ok: false, error: 'Réservé aux livreurs validés (service en test).' });
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    const ref = db.collection('courses').doc(id);
    try {
      const result = await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        if (d.data().status !== 'en_attente') throw new Error('deja-prise');
        tx.update(ref, { status: 'acceptee', courierUid: uid, courierEmail: email, acceptedAt: new Date() });
        return d.data();
      });
      // Alerte l'artisan : sa course est prise.
      try {
        if (result.artisanEmail) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
            body: JSON.stringify({
              from: cfg.from, to: result.artisanEmail,
              subject: '✅ Ta livraison est prise en charge — ' + String(result.address || '').slice(0, 60),
              html: '<p>Un livreur a accepté ta course (TEST).</p><p>📍 ' + escapeHtml(result.address || '')
                + '<br>💶 ' + result.prix + ' € à régler au livreur à la réception.</p>'
            })
          });
        }
      } catch (e) { console.warn('[courses] email accept échoué:', e.message); }
      return res.status(200).json({ ok: true, id, status: 'acceptee' });
    } catch (e) {
      if (e.message === 'deja-prise') return res.status(409).json({ ok: false, error: 'Trop tard — un autre livreur a déjà pris cette course.' });
      if (e.message === 'introuvable') return res.status(404).json({ ok: false, error: 'Course introuvable.' });
      console.error('[courses] accept failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Acceptation échouée.' });
    }
  }

  return res.status(400).json({ ok: false, error: 'type inconnu' });
}
