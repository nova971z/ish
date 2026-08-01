// POST /api/contact — Public contact form, forwards to OWNER_EMAIL via Resend.
// Body : { name, email, phone?, subject?, message, honeypot? }
//   OU  { type:'partner-application', ...champs pré-inscription artisan } (Phase 3a)
// Anti-spam : honeypot field + IP rate limiting + length/email validation.
//
// NB : la pré-inscription artisan est branchée ICI (et pas dans un endpoint
// dédié) car le plan Vercel Hobby est à 12/12 fonctions — aucune 13e possible.

const rl = require('./_lib/ratelimit');
const { getFirebase, verifyUid, verifyIdentity } = require('./_lib/firebase');
const coursesLib = require('./_lib/courses');
const paiementSocle = require('./_lib/paiement');   // couture : fournisseur actif

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
  if (body.type === 'course-create' || body.type === 'course-list' || body.type === 'course-accept'
      || body.type === 'courier-status' || body.type === 'mes-commandes' || body.type === 'raz-mon-historique' || body.type === 'course-rate'
      || body.type === 'course-deliver' || body.type === 'course-confirm' || body.type === 'course-proof'
      || body.type === 'course-scene' || body.type === 'course-video' || body.type === 'course-dispute'
      || body.type === 'courier-profile' || body.type === 'courier-profile-save'
      || body.type === 'courier-available' || body.type === 'courier-apply'
      || body.type === 'conv-open' || body.type === 'conv-list'
      || body.type === 'course-request' || body.type === 'course-release'
      || body.type === 'course-cancel'
      || body.type === 'course-accord-propose' || body.type === 'course-accord-accept'
      || body.type === 'course-accord-reject' || body.type === 'course-goods-paid'
      || body.type === 'account-erase') {
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
// Barème, dépôt, allowlist de test, création depuis paiement : _lib/courses.js
// (source UNIQUE partagée avec create-payment-intent.js et webhook.js).
const COURSE_TEST_EMAILS = coursesLib.TEST_EMAILS;

// Opérations de LECTURE seule : elles ne changent rien, elles sont appelées à
// chaque affichage de page, et elles doivent donc avoir leur propre quota,
// bien plus large que celui des opérations qui écrivent.
const COURSE_READS = new Set([
  'course-list', 'courier-status', 'mes-commandes', 'courier-profile', 'course-proof', 'conv-list'
]);

// ── ADRESSE E-MAIL VÉRIFIÉE EXIGÉE (28/07/2026, décision user) ──────────────
// Uniquement sur les actions ENGAGEANTES : déposer une demande de livraison,
// candidater comme livreur. Volontairement PAS sur la lecture ni sur les
// actions d'une course DÉJÀ engagée — bloquer un parcours en cours ne
// protégerait personne et laisserait l'utilisateur coincé au milieu du gué.
// L'état vient de la revendication SIGNÉE `email_verified` du jeton : le
// client ne peut pas la falsifier.
const EXIGE_EMAIL_VERIFIE = new Set(['course-request', 'courier-apply']);

async function handleCourses(req, body, cfg, res) {
  const ident = await verifyIdentity(req);
  const uid = ident ? ident.uid : null;
  if (!uid) return res.status(401).json({ ok: false, error: 'Connexion requise.' });
  if (EXIGE_EMAIL_VERIFIE.has(body.type) && !ident.emailVerified) {
    // `code` permet à l'écran de proposer le renvoi du lien plutôt que
    // d'afficher un refus sec dont l'utilisateur ne sait que faire.
    return res.status(403).json({
      ok: false, code: 'email-non-verifie',
      error: 'Vérifie ton adresse e-mail avant de continuer : ouvre le lien que nous t\'avons envoyé, puis reviens sur cette page.'
    });
  }

  // ── LIMITEUR DE DÉBIT ─────────────────────────────────────────────────────
  // 🐛 PANNE VÉCUE (27/07/2026) : un seul seau « courses » de 30 requêtes/heure
  // par ADRESSE IP couvrait les 22 opérations. Or un simple affichage de page
  // en coûte 2 à 3 (courier-status + courier-profile + course-list). En
  // navigation privée, rien n'est mis en cache : le quota tombait en une
  // dizaine de visites, puis le serveur répondait 429 à TOUT. Le client
  // prenait ce refus pour une réponse : « pas livreur » (bouton disparu,
  // éjection de l'espace livreur) et « aucune course » (la commande semblait
  // effacée des deux côtés). La fenêtre étant FIXE, tout revenait au changement
  // d'heure — d'où l'intermittence.
  // 🌐 DÉFAUT DE PRODUCTION, en plus : derrière un opérateur mobile, des
  // CENTAINES de clients partagent une même IP publique. Un seul utilisateur
  // actif aurait bloqué tous les autres.
  // Conception retenue :
  //   • la clé est le COMPTE (uid vérifié), pas l'IP — chacun son quota ;
  //   • lectures et écritures dans des seaux SÉPARÉS ;
  //   • un garde-fou par IP reste, mais assez haut pour ne jamais gêner un
  //     usage réel (il ne sert qu'à arrêter un abus massif).
  const estLecture = COURSE_READS.has(body.type);
  const quotaOk = await rl.allow(
    estLecture ? 'courses-lecture' : 'courses-ecriture',
    uid, estLecture ? 400 : 120, 3600
  );
  if (!quotaOk) {
    return res.status(429).json({ ok: false, error: 'Trop de requêtes. Réessaie dans quelques minutes.' });
  }
  if (!(await rl.allow('courses-ip', rl.clientIp(req), 2000, 3600))) {
    return res.status(429).json({ ok: false, error: 'Trop de requêtes. Réessaie dans quelques minutes.' });
  }

  const { admin, db } = getFirebase();
  if (!db) return res.status(503).json({ ok: false, error: 'Base non configurée.' });

  // ⚠️ L'identité NE DOIT PAS échouer en silence. Avant, un incident réseau sur
  // getUser() laissait `email` vide → isTester faux → isCourier faux : le
  // livreur devenait un inconnu, sans qu'aucune erreur ne le dise. On répond
  // désormais 503 : le client sait que c'est une panne, pas un refus.
  let email = '';
  try {
    email = String((await admin.auth().getUser(uid)).email || '').toLowerCase();
  } catch (e) {
    return res.status(503).json({ ok: false, error: 'Service momentanément indisponible. Réessaie dans un instant.' });
  }
  const isTester = COURSE_TEST_EMAILS.includes(email);
  // ⚖️ ÊTRE LIVREUR SE MÉRITE, MÊME POUR LE COMPTE DE TEST.
  // Jusqu'au 27/07/2026, `isCourier = isTester` : le compte de l'user était
  // livreur d'office, sans dossier ni validation. Impossible, dans ces
  // conditions, de dérouler la vraie chaîne (inscription → dossier → validation
  // admin → courses) ni de voir ce qui s'y casse. À sa demande, cette
  // dérogation est SUPPRIMÉE : la seule porte d'entrée est désormais
  // couriers/{uid}.kycStatus === 'valide', posé par l'admin, pour TOUS.
  // (Le compte de test garde son accès CLIENT au service en avant-première —
  // c'est `isTester`, plus bas, qui autorise à déposer une demande de course.)
  let isCourier = false;
  {
    try {
      const cd = await db.collection('couriers').doc(uid).get();
      isCourier = cd.exists && cd.data().kycStatus === 'valide';
    } catch (e) {
      // Même principe : « je n'ai pas pu lire » ≠ « ce n'est pas un livreur ».
      return res.status(503).json({ ok: false, error: 'Service momentanément indisponible. Réessaie dans un instant.' });
    }
  }

  /* ── Statut de rôle (léger — pilote le bouton du compte) ──
     ⛔ FUITE CORRIGÉE LE 01/08/2026. Le front portait `LV_TEST_EMAILS` et
     `LV_PIECES_BYPASS` EN DUR dans `app.js` : l'adresse personnelle de l'user
     était lisible par quiconque ouvrait le fichier, et surtout le code
     DÉSIGNAIT NOMMÉMENT le compte dispensé de pièces justificatives. Publier
     « cette adresse est exemptée », c'est désigner la cible.

     Le serveur répond désormais pour LE SEUL COMPTE AUTHENTIFIÉ : deux
     booléens, aucun nom. Il n'énumère rien — un autre compte reçoit `false` et
     n'apprend l'existence de personne. C'est aussi la minimisation attendue par
     J3 : on ne publie pas une donnée personnelle dont on n'a pas l'usage.
     ⚠️ Ces booléens restent un CONFORT D'AFFICHAGE. La décision se reprend
     ici, à chaque action engageante : un client qui les forcerait à `true` ne
     gagnerait rien. */
  /* ── MES COMMANDES — LA MÊME SOURCE QUE L'ADMINISTRATION ──────────────
     ⛔⛔ DÉFAUT DE FOND CORRIGÉ LE 01/08/2026. L'historique du compte était
     écrit PAR LE NAVIGATEUR dans `users/{uid}/orders`, tandis que
     l'administration lit le journal serveur `payments/`. Deux sources pour un
     même fait : elles ne pouvaient que diverger, et elles ont divergé — l'user
     voyait ses achats côté admin et un compte vide côté client.

     Et l'écriture par le navigateur ne pouvait PAS être fiable : il navigue en
     privé, l'onglet peut se fermer avant /merci, la navigation peut échouer,
     les règles Firestore peuvent refuser. Chacun de ces cas perd la commande,
     silencieusement.

     Le journal `payments/` est écrit par le WEBHOOK — donc par le fournisseur
     lui-même — et c'est la trace comptable autoritaire. On le lit ici, filtré
     sur l'uid du jeton VÉRIFIÉ, jamais sur un uid transmis par le client
     (J3 : chacun ne voit que ses propres commandes). Le compte affiche
     désormais exactement ce que l'administration compte.

     ⚠️ Rien ici ne touche à la livraison : ni prix de course, ni statut de
     livreur. C'est l'achat de marchandise, et lui seul. */
  /* ── VIDER SON HISTORIQUE, CÔTÉ CLIENT ────────────────────────────────
     ⛔⛔ ON NE SUPPRIME AUCUNE ÉCRITURE. `payments/` est la trace des recettes
     de l'ENTREPRISE : si un client pouvait l'effacer depuis son compte,
     n'importe lequel d'entre eux pourrait détruire les livres du marchand, et
     celui-ci ne s'en apercevrait qu'en fin d'exercice.

     On pose donc une DATE DE MASQUAGE sur SON profil, et `mes-commandes` ne
     rend plus que ce qui lui est postérieur. Le client repart d'un écran vide,
     la comptabilité est intacte, et rien n'est irréversible côté marchand.

     ⚠️ L'uid vient du jeton VÉRIFIÉ : personne ne peut masquer l'historique
     d'un autre. */
  if (body.type === 'raz-mon-historique') {
    try {
      await db.collection('users').doc(uid).set(
        { historiqueMasqueAvant: Date.now() }, { merge: true });
    } catch (e) {
      return res.status(503).json({ ok: false, error: 'Historique non vidé, réessaie.' });
    }
    return res.status(200).json({ ok: true });
  }

  if (body.type === 'mes-commandes') {
    let snap;
    try {
      snap = await db.collection('payments').where('uid', '==', uid).limit(100).get();
    } catch (e) {
      return res.status(503).json({ ok: false, error: 'Historique momentanément indisponible.' });
    }
    /* Date de masquage posée par le client lui-même. Sans elle, 0 : rien
       n'est caché. */
    let masqueAvant = 0;
    try {
      const u = await db.collection('users').doc(uid).get();
      masqueAvant = Number((u.exists && u.data().historiqueMasqueAvant) || 0);
    } catch (e) { /* profil illisible : on n'invente pas de masquage */ }

    const commandes = [];
    snap.forEach((d) => {
      const p = d.data() || {};
      /* Seul un paiement ACQUIS entre dans l'historique. Un refus ou une
         tentative abandonnée n'est pas une commande. */
      if (p.status !== 'succeeded' && p.status !== 'paid') return;
      const quand = Number(p.invoiceDateMs)
        || (p.recordedAt && p.recordedAt.toMillis ? p.recordedAt.toMillis() : 0);
      if (masqueAvant && quand && quand <= masqueAvant) return;
      commandes.push({
        id: d.id,
        date: Number(p.invoiceDateMs)
          || (p.recordedAt && p.recordedAt.toMillis ? p.recordedAt.toMillis() : 0),
        totalCents: Number(p.amountCents) || 0,
        facture: p.invoiceNumber || null,
        lignes: (p.linesDetail || []).map((l) => ({
          nom: l.name || '', qty: Number(l.qty) || 1,
          prix: (Number(l.unitCents) || 0) / 100, marque: l.brand || ''
        }))
      });
    });
    commandes.sort((a, b) => b.date - a.date);
    const totalCents = commandes.reduce((s, c) => s + c.totalCents, 0);
    return res.status(200).json({ ok: true, commandes: commandes, totalCents: totalCents });
  }

  if (body.type === 'courier-status') {
    return res.status(200).json({
      ok: true,
      courier: isCourier,
      compteTest: isTester,
      piecesDispense: coursesLib.PIECES_BYPASS_EMAILS.includes(email)
    });
  }

  // ══ PROFIL LIVREUR ════════════════════════════════════════════════════════
  // Deux documents, deux niveaux de confidentialité :
  //   couriers/{uid}        → PRIVÉ (KYC, email, virement direct) — jamais lu par le client
  //   couriers_public/{uid} → PUBLIC (fiche annuaire : nom, photo, tarifs, note,
  //                           disponibilité) — lecture ouverte, écriture serveur seule
  // ⚠️ Les TARIFS appartiennent au LIVREUR (voir _lib/courses.js § TARIFS) :
  // la plateforme ne les impose pas et ne sanctionne jamais un montant.

  // ══ DÉPÔT DU DOSSIER LIVREUR ══════════════════════════════════════════════
  // 🐛 DÉFAUT VÉCU (27/07/2026) : l'espace livreur redemandait « Ton véhicule »
  // alors qu'il est choisi à l'inscription. Cause : le formulaire d'inscription
  // ne l'envoyait NULLE PART — il finissait par `state.submitted = true`, une
  // simple variable JavaScript effacée au changement de page. Rien n'était donc
  // jamais enregistré : ni le véhicule, ni la cylindrée, ni le contact, et
  // l'onglet « Candidatures » de l'admin lisait une collection que rien
  // n'alimentait. Cet endpoint enregistre le dossier pour de bon.
  //
  // ⚠️ LES CONTRÔLES SONT REFAITS ICI. Le formulaire vérifie déjà l'âge et la
  // cylindrée, mais un contrôle côté navigateur n'est qu'un confort : il se
  // contourne. L'âge minimum de 18 ans est une obligation légale — il se
  // vérifie sur le serveur, à partir de la date de naissance.
  if (body.type === 'courier-apply') {
    const VEHICULES = ['vae', 'trottinette', 'scooter'];
    const CYLINDREES = ['50', '125', '300-500', '600+'];
    const vehicle = VEHICULES.includes(body.vehicle) ? body.vehicle : '';
    if (!vehicle) return res.status(400).json({ ok: false, error: 'Choisis ton véhicule.' });

    const naissance = String(body.birth || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(naissance)) {
      return res.status(400).json({ ok: false, error: 'Indique ta date de naissance.' });
    }
    const d = new Date(naissance + 'T00:00:00Z');
    if (isNaN(d.getTime())) return res.status(400).json({ ok: false, error: 'Date de naissance invalide.' });
    const now = new Date();
    let age = now.getUTCFullYear() - d.getUTCFullYear();
    const m = now.getUTCMonth() - d.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
    if (!(age >= 18 && age < 120)) {
      return res.status(400).json({ ok: false, error: 'Il faut avoir 18 ans révolus pour devenir livreur.' });
    }

    const cylindree = CYLINDREES.includes(body.cylindree) ? body.cylindree : '';
    if (vehicle === 'scooter' && !cylindree) {
      return res.status(400).json({ ok: false, error: 'Indique la cylindrée de ton véhicule.' });
    }
    const nom = String(body.name || '').trim().slice(0, 100);
    if (nom.length < 2) return res.status(400).json({ ok: false, error: 'Indique ton nom.' });
    const mail = String(body.email || '').trim().slice(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      return res.status(400).json({ ok: false, error: 'Adresse email invalide.' });
    }
    const tel = String(body.phone || '').trim().slice(0, 30);
    if (body.consent !== true) return res.status(400).json({ ok: false, error: 'Le consentement est obligatoire.' });
    if (body.filmConsent !== true) return res.status(400).json({ ok: false, error: 'L\'accord de remise filmée est obligatoire.' });

    // Pièces DÉCLARÉES (nom de fichier seulement — le téléversement des
    // documents eux-mêmes reste à faire, il demande Firebase Storage).
    const pieces = {};
    if (body.pieces && typeof body.pieces === 'object') {
      Object.keys(body.pieces).slice(0, 20).forEach((k) => {
        const cle = String(k).replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
        const nomFichier = String(body.pieces[k] || '').slice(0, 160);
        if (cle && nomFichier) pieces[cle] = { name: nomFichier, uploaded: false };
      });
    }

    // ── PIÈCES OBLIGATOIRES ───────────────────────────────────────────────
    // Cette exigence n'existait QUE dans le navigateur : elle se contournait
    // donc entièrement. Elle est appliquée ici, où le client ne peut rien
    // changer. Seule exception : les comptes de PIECES_BYPASS_EMAILS, pour
    // permettre de dérouler la chaîne complète en test (demande de l'user du
    // 27/07/2026). La dérogation est TRACÉE dans le dossier — l'admin voit
    // noir sur blanc qu'il valide un dossier sans pièces.
    const bypassPieces = coursesLib.PIECES_BYPASS_EMAILS.includes(email);
    const manquantes = coursesLib.piecesRequises(vehicle).filter((k) => !pieces[k]);
    if (manquantes.length && !bypassPieces) {
      return res.status(400).json({
        ok: false,
        error: 'Il manque ' + manquantes.length + ' pièce(s) justificative(s) pour ce véhicule.'
      });
    }

    // Un dossier DÉJÀ VALIDÉ ne doit pas être renvoyé au statut « en attente »
    // par un nouvel envoi : ce serait une régression de droits silencieuse.
    const dejaValide = (await db.collection('couriers').doc(uid).get()
      .then((s) => s.exists && s.data().kycStatus === 'valide').catch(() => false));

    await db.collection('courier_applications').doc(uid).set({
      uid, name: nom, email: mail, phone: tel, vehicle, cylindree,
      birth: naissance, age, pieces,
      // Trace de la dérogation : l'admin doit SAVOIR qu'il valide un dossier
      // incomplet. Une exception silencieuse est une exception dangereuse.
      piecesBypass: bypassPieces && manquantes.length > 0,
      piecesManquantes: bypassPieces ? manquantes : [],
      consent: true, filmConsent: true,
      status: dejaValide ? 'valide' : 'en_attente',
      createdAt: new Date()
    }, { merge: true });

    // Le compte livreur porte les informations RÉUTILISABLES (véhicule,
    // cylindrée, contact) : c'est de là que l'espace livreur les relit, au lieu
    // de les redemander.
    const compte = {
      displayName: nom, email: mail, phone: tel,
      vehicle, cylindree, updatedAt: new Date()
    };
    if (!dejaValide) compte.kycStatus = 'en_attente';
    await db.collection('couriers').doc(uid).set(compte, { merge: true });

    try { await coursesLib.alertCourierApplication(compte, uid, cfg); } catch (_) {}
    return res.status(200).json({ ok: true, status: dejaValide ? 'valide' : 'en_attente' });
  }

  // Lire SON propre profil (formulaire de l'espace livreur).
  if (body.type === 'courier-profile') {
    const [priv, pub] = await Promise.all([
      db.collection('couriers').doc(uid).get(),
      db.collection('couriers_public').doc(uid).get()
    ]);
    const p = pub.exists ? pub.data() : {};
    const v = priv.exists ? priv.data() : {};
    return res.status(200).json({
      ok: true, courier: isCourier,
      profile: {
        uid,
        // Le véhicule et la commune sont HÉRITÉS du dossier d'inscription
        // (couriers/{uid}) tant que la fiche publique ne les porte pas : le
        // livreur les a déjà renseignés, on ne les redemande pas.
        displayName: p.displayName || v.displayName || '',
        commune: p.commune || v.commune || '',
        vehicle: p.vehicle || v.vehicle || '',
        // Origine de la valeur : sert à l'expliquer dans le formulaire.
        vehicleFromDossier: !p.vehicle && !!v.vehicle,
        cylindree: v.cylindree || '',
        bio: p.bio || '',
        photo: p.photo || '',
        tarifs: coursesLib.sanitizeTarifs(p.tarifs),
        // Mode de règlement voulu par le livreur. Défaut = espèces : c'est le
        // plus simple pour une remise en main propre, et surtout jamais vide —
        // l'accord doit toujours pouvoir dire comment le livreur sera payé.
        paiement: coursesLib.sanitizePaiement(p.paiement) || 'especes',
        // Horaires de service : rendent l'état AUTOMATIQUE hors de la plage.
        hDebut: p.hDebut || '', hFin: p.hFin || '',
        available: !!p.available,
        // État réellement vu par les clients à cet instant (interrupteur ET
        // horaires) — calculé SERVEUR, jamais déduit du client.
        enService: coursesLib.enService(p, new Date()),
        published: !!p.published,
        coursesDone: p.coursesDone || 0,
        ratingCount: p.ratingCount || 0,
        ratingSum: p.ratingSum || 0
      },
      repere: coursesLib.defaultTarifs()
    });
  }

  // Enregistrer son profil + SES tarifs. Réservé aux livreurs validés.
  if (body.type === 'courier-profile-save') {
    if (!isCourier) return res.status(403).json({ ok: false, error: 'Réservé aux livreurs validés.' });
    const displayName = String(body.displayName || '').trim().slice(0, 60);
    const commune = String(body.commune || '').trim().slice(0, 60);
    const bio = String(body.bio || '').trim().slice(0, 400);
    const vehicle = ['vae', 'trottinette', 'scooter'].includes(body.vehicle) ? body.vehicle : '';
    const photo = String(body.photo || '');
    if (!displayName) return res.status(400).json({ ok: false, error: 'Ton nom affiché est obligatoire.' });
    if (photo && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 300000)) {
      return res.status(400).json({ ok: false, error: 'Photo de profil invalide (JPEG/PNG/WebP, 300 Ko max).' });
    }
    const tarifs = coursesLib.sanitizeTarifs(body.tarifs);
    // Mode de règlement du livreur : conservé tel quel s'il n'est pas fourni
    // (un enregistrement partiel ne doit jamais effacer un réglage existant).
    const paiement = coursesLib.sanitizePaiement(body.paiement);
    // Horaires : les deux heures doivent être valides, sinon on considère
    // qu'il n'y en a pas (et l'interrupteur seul décide). Jamais d'à-peu-près.
    const horaires = coursesLib.sanitizeHoraires(body);
    const pub = {
      displayName, commune, bio, vehicle, tarifs,
      hDebut: horaires.hDebut, hFin: horaires.hFin,
      published: true,
      available: body.available === true ? true : (body.available === false ? false : undefined)
    };
    if (photo) pub.photo = photo;
    if (paiement) pub.paiement = paiement;
    if (pub.available === undefined) delete pub.available;
    await coursesLib.mirrorCourierPublic(db, uid, pub);
    await db.collection('couriers').doc(uid).set(
      { displayName, email, updatedAt: new Date() }, { merge: true }
    );
    const apres = await db.collection('couriers_public').doc(uid).get();
    const pd = apres.exists ? apres.data() : {};
    return res.status(200).json({
      ok: true, tarifs,
      hDebut: horaires.hDebut, hFin: horaires.hFin,
      paiement: pd.paiement || 'especes',
      enService: coursesLib.enService(pd, new Date())
    });
  }

  // Interrupteur « je suis disponible » (bandeau vert de la carte publique).
  // Tant qu'il n'a pas cliqué, aucun bandeau ne s'allume côté client.
  if (body.type === 'courier-available') {
    if (!isCourier) return res.status(403).json({ ok: false, error: 'Réservé aux livreurs validés.' });
    const available = body.available === true;
    const pub = await db.collection('couriers_public').doc(uid).get();
    if (!pub.exists || !pub.data().displayName) {
      return res.status(409).json({ ok: false, error: 'Complète d\'abord ta fiche (nom + tarifs) avant de te déclarer disponible.' });
    }
    await coursesLib.mirrorCourierPublic(db, uid, {
      available, availableAt: available ? new Date() : null
    });
    // L'interrupteur ne suffit pas : hors de sa plage horaire, le livreur
    // n'est PAS en service. On renvoie l'état réel pour que l'écran ne
    // promette pas l'inverse de ce que voient les clients.
    const d = pub.exists ? pub.data() : {};
    return res.status(200).json({
      ok: true, available,
      enService: coursesLib.enService(Object.assign({}, d, { available }), new Date())
    });
  }

  // ── Créer une course (artisan) — sur PREUVE DE PAIEMENT ──
  // Le client PAIE d'abord (produits + frais de livraison, modale carte —
  // create-payment-intent pose la metadata course*). Il envoie ensuite son
  // paymentIntentId : le serveur VÉRIFIE chez l'ancien fournisseur que le paiement est
  // abouti, qu'il porte bien une course, et qu'il appartient à cet uid, puis
  // crée la course depuis la METADATA (jamais depuis le corps client). Doc id
  // = pi.id → idempotent avec le webhook (aucun doublon, aucune double alerte).
  if (body.type === 'course-create') {
    if (!isTester) return res.status(403).json({ ok: false, error: 'Service en test — ouverture le 1er janvier.' });
    const piId = String(body.paymentIntentId || '').trim().slice(0, 80);
    // ⚠️ COUTURE PAIEMENT : on ne parle plus au SDK. `etat === 'paye'` remplace
    // `status === 'succeeded'` — la traduction vit dans le module du
    // fournisseur, pas ici, et un etat inconnu ne vaut JAMAIS « paye ».
    const paiement = paiementSocle.fournisseur();
    if (!piId) return res.status(400).json({ ok: false, error: 'Paiement requis — la course est créée après le paiement de la commande.' });
    if (!paiement.estConfigure()) return res.status(503).json({ ok: false, error: 'Paiement non configuré.' });
    let paye = null;
    try { paye = await paiement.lirePaiement(piId); }
    catch (e) { return res.status(404).json({ ok: false, error: 'Paiement introuvable.' }); }
    if (!paye || paye.etat !== paiementSocle.ETAT_ACQUIS) return res.status(400).json({ ok: false, error: 'Paiement non abouti.' });
    const pi = { id: paye.id, amount: paye.montantCents, metadata: paye.metadata || {} };
    if (!pi.metadata || pi.metadata.source !== 'pirates-tools' || !pi.metadata.courseZone) {
      return res.status(400).json({ ok: false, error: 'Ce paiement ne correspond pas à une commande avec livraison.' });
    }
    if (pi.metadata.uid && pi.metadata.uid !== uid) {
      return res.status(403).json({ ok: false, error: 'Ce paiement ne t\'appartient pas.' });
    }
    const cc = await coursesLib.createFromIntent(db, pi, { uid, email });
    if (cc.created) {
      await coursesLib.alertNewCourse(cc.course, cc.id, db);
      // Confirmation de paiement au CLIENT — gardée par cc.created, donc
      // jamais envoyée deux fois si le webhook a déjà créé la course.
      await coursesLib.confirmToClient(cc.course, cc.id);
    }
    return res.status(200).json({
      ok: true, created: cc.created,
      course: { id: cc.id, km: cc.course.km, zone: cc.course.zone, prix: cc.course.prix }
    });
  }

  // ══ DROIT À L'EFFACEMENT (art. 17 RGPD) — purge SERVEUR ══════════════════
  // Le client seul ne peut effacer que users/{uid} et ses commandes : les
  // règles Firestore lui interdisent (à raison) de toucher aux courses, au
  // fil de discussion, aux photos, à sa fiche livreur publique et à son
  // dossier KYC. Sans cette route, le bouton « supprimer mon compte » laissait
  // donc en base : le NOM et la PHOTO publiquement lisibles du livreur,
  // l'adresse des chantiers, les emails, les conversations, les photos et les
  // vidéos. Il promettait un effacement qu'il ne faisait pas (audit P6).
  //
  // POLITIQUE, écrite et assumée :
  //   • SUPPRIMÉ    profil, commandes, fiche publique, dossier livreur + KYC,
  //                 photos, messages, vidéos, courses non exécutées.
  //   • ANONYMISÉ   courses déjà livrées/terminées — montants et dates restent
  //                 (obligation comptable, et le LIVREUR est un tiers dont
  //                 l'historique de travail ne peut pas être effacé par l'autre
  //                 partie). Identité, email, adresse et code sont retirés.
  //   • CONSERVÉ    payments/ — obligation légale de conservation comptable.
  //   • BLOQUÉ      si un litige est OUVERT : art. 17.3.e RGPD (constatation ou
  //                 exercice d'un droit en justice). L'utilisateur en est informé.
  if (body.type === 'account-erase') {
    const purge = { courses: 0, anonymisees: 0, messages: 0, photos: 0, videos: 0, fiches: 0 };
    // 1. Litige ouvert → on ne touche à rien et on l'explique.
    const [asClient, asCourier] = await Promise.all([
      db.collection('courses').where('artisanUid', '==', uid).get(),
      db.collection('courses').where('courierUid', '==', uid).get()
    ]);
    const toutes = [];
    const vus = new Set();
    [...asClient.docs, ...asCourier.docs].forEach((d) => { if (!vus.has(d.id)) { vus.add(d.id); toutes.push(d); } });
    const litige = toutes.find((d) => (d.data().litige || {}).open);
    if (litige) {
      return res.status(409).json({
        ok: false,
        error: 'Un litige est en cours sur une de tes livraisons. La loi nous oblige à conserver '
          + 'les éléments tant qu\'il n\'est pas clos (RGPD art. 17.3.e). Ton compte sera effaçable '
          + 'dès la clôture — écris-nous si tu veux qu\'on la traite en priorité.'
      });
    }

    // 2. Courses : suppression ou anonymisation, sous-collections d'abord.
    const EXECUTEES = ['livree', 'terminee'];
    for (const d of toutes) {
      const c = d.data();
      const ref = d.ref;
      for (const sub of ['photos', 'messages']) {
        const snap = await ref.collection(sub).get();
        for (const doc of snap.docs) { await doc.ref.delete(); purge[sub]++; }
      }
      if ((c.videos || []).length) {
        try {
          const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'pirates-tools.firebasestorage.app';
          await admin.storage().bucket(bucketName).deleteFiles({ prefix: 'courses/' + d.id + '/videos/' });
          purge.videos += c.videos.length;
        } catch (e) { console.warn('[erase] vidéos:', e.message); }
      }
      if (EXECUTEES.includes(c.status)) {
        // Anonymisation : on garde la trace économique, on retire l'identité.
        const patch = { videos: admin.firestore.FieldValue.delete() };
        if (c.artisanUid === uid) {
          Object.assign(patch, {
            artisanUid: 'compte-supprime', artisanEmail: null,
            address: '(adresse effacée à la demande du client)',
            code: null, lines: [], hasScene: false, hasProof: false
          });
        }
        if (c.courierUid === uid) {
          Object.assign(patch, { courierUid: 'compte-supprime', courierEmail: null, courierName: '' });
        }
        await ref.update(patch);
        purge.anonymisees++;
      } else {
        await ref.delete();
        purge.courses++;
      }
    }

    // 3. Fiches et dossiers strictement personnels : suppression pure.
    for (const coll of ['couriers_public', 'couriers', 'courier_applications']) {
      const doc = await db.collection(coll).doc(uid).get();
      if (doc.exists) { await doc.ref.delete(); purge.fiches++; }
    }

    // 4. Profil et commandes (l'Admin SDK les efface sans dépendre des règles).
    const orders = await db.collection('users').doc(uid).collection('orders').get();
    for (const o of orders.docs) await o.ref.delete();
    await db.collection('users').doc(uid).delete().catch(() => {});

    console.log('[erase] compte purgé', JSON.stringify(purge));   // aucun uid, aucune PII
    return res.status(200).json({ ok: true, purge });
  }

  // ══ DEMANDE DE LIVRAISON — SANS PAIEMENT (flux courant, 27/07/2026) ═══════
  // Le client dépose une demande : rien n'est débité. Elle devient visible de
  // TOUS les livreurs. Le premier qui accepte ouvre le chat ; l'alerte s'arrête
  // (la course quitte la liste « disponibles »). Si l'accord ne se fait pas,
  // course-release la remet en ligne pour tout le monde.
  if (body.type === 'course-request') {
    if (!isTester) return res.status(403).json({ ok: false, error: 'Service en test — ouverture le 1er janvier.' });
    // Anti-spam : 10 demandes / h / compte (au-delà, c'est du bruit pour les livreurs).
    if (!(await rl.allow('course-req', uid, 10, 3600))) {
      return res.status(429).json({ ok: false, error: 'Trop de demandes envoyées. Réessaie dans une heure.' });
    }
    const course = coursesLib.buildRequest(body, { uid, email });
    if (!course) {
      return res.status(400).json({ ok: false, error: 'Adresse hors zone de livraison (46 km max depuis Sainte-Anne).' });
    }
    if (!course.address) return res.status(400).json({ ok: false, error: 'Adresse du chantier requise.' });
    const ref = await db.collection('courses').add(course);
    await coursesLib.alertNewCourse(course, ref.id, db);   // db → alerte les livreurs VALIDÉS
    return res.status(200).json({
      ok: true, id: ref.id,
      course: { id: ref.id, km: course.km, zone: course.zone, code: course.code }
    });
  }

  // ══ L'ACCORD — ce que les deux ont convenu, noir sur blanc ════════════════
  // Rédigé par l'un dans le chat, accepté par l'autre. Fige le prix de la
  // course (convenu ENTRE EUX), le mode de règlement du livreur (virement ou
  // espèces), la date, l'heure et le point de dépôt. Un message système trace
  // chaque étape dans le fil — le fil fait foi en cas de litige.
  // ⚠️ La course n'est RÉELLEMENT commandée qu'après : accord accepté des deux
  // côtés ET marchandise payée par le client (course-goods-paid).
  if (body.type === 'course-accord-propose' || body.type === 'course-accord-accept'
      || body.type === 'course-accord-reject') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    const ref = db.collection('courses').doc(id);
    const propose = body.type === 'course-accord-propose';
    const accept = body.type === 'course-accord-accept';
    // Mode de règlement du livreur, lu sur SA fiche (hors transaction : il ne
    // participe à aucune règle d'atomicité, il ne fait qu'alimenter l'accord).
    let paiementLivreur = '';
    if (propose) {
      const mp = await db.collection('couriers_public').doc(uid).get().catch(() => null);
      paiementLivreur = (mp && mp.exists && mp.data().paiement) || '';
    }
    let out = null;
    try {
      out = await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        const c = d.data();
        let role = c.artisanUid === uid ? 'client' : (c.courierUid === uid ? 'livreur' : null);
        if (!role) throw new Error('pas-participant');
        // 🐛 BUG VÉCU (27/07/2026) : « je veux accepter l'accord et ça ne marche
        // pas ». Sur un compte de TEST qui joue les DEUX rôles (l'user déroule
        // seul toute la chaîne), artisanUid === courierUid === uid : le
        // serveur le prenait donc TOUJOURS pour le client. Il proposait
        // l'accord (okClient=true), puis « acceptait » côté livreur — le
        // serveur remettait okClient=true, okLivreur restait faux, et l'accord
        // ne pouvait JAMAIS se valider.
        // Quand, et SEULEMENT quand, l'uid est des deux côtés, on retient le
        // rôle déclaré par l'écran d'où vient l'action. Aucun risque
        // d'usurpation : il faut déjà être les deux parties pour y accéder.
        if (c.artisanUid === uid && c.courierUid === uid) {
          role = (body.role === 'livreur') ? 'livreur' : 'client';
        }
        if (c.status !== 'acceptee') throw new Error('pas-en-negociation');
        if (body.type === 'course-accord-reject') {
          if (!c.accord) throw new Error('pas-d-accord');
          if (c.accord.valide) throw new Error('deja-valide');
          tx.update(ref, { accord: null });
          return { role, action: 'reject', round: c.round || 1, course: c };
        }
        if (propose) {
          if (c.accord && c.accord.valide) throw new Error('deja-valide');
          // ⚖️ SEUL LE LIVREUR PROPOSE (décision user 28/07/2026). Le client ne
          // met jamais de prix : s'il trouve trop cher, il négocie dans la
          // discussion et le livreur ajuste. Contrôle SERVEUR, pas seulement
          // d'interface — sans lui, un client pourrait poster un prix à la main.
          if (role !== 'livreur') throw new Error('propose-livreur-seul');
          // Le prix vient du corps ; TOUT le reste vient de la course (ce que
          // le client a posé à la commande) et du profil du livreur.
          const clean = coursesLib.sanitizeAccord(body.accord, c, paiementLivreur);
          if (!clean) throw new Error('prix-invalide');
          const accord = Object.assign({}, clean, {
            proposeBy: uid, proposeRole: role, proposeAt: new Date(),
            okClient: false, okLivreur: true, valide: false
          });
          tx.update(ref, { accord });
          return { role, action: 'propose', accord, round: c.round || 1, course: c };
        }
        // accept
        if (!c.accord) throw new Error('pas-d-accord');
        if (c.accord.valide) throw new Error('deja-valide');
        const a = Object.assign({}, c.accord);
        if (role === 'client') a.okClient = true; else a.okLivreur = true;
        a.valide = !!(a.okClient && a.okLivreur);
        if (a.valide) a.valideAt = new Date();
        // Course remise en ligne APRÈS paiement de la marchandise : dès que le
        // nouvel accord est validé, elle repasse « confirmée » sans second
        // paiement. Le client ne paie sa marchandise QU'UNE FOIS (audit P5).
        const patch = { accord: a };
        if (a.valide && c.goodsPaid) { patch.status = 'confirmee'; patch.confirmedOrderAt = new Date(); }
        tx.update(ref, patch);
        return { role, action: a.valide ? 'valide' : 'accept', accord: a, round: c.round || 1, course: c };
      });
    } catch (e) {
      const map = {
        'introuvable': [404, 'Course introuvable.'],
        'pas-participant': [403, 'Tu n\'es pas concerné par cette course.'],
        'pas-en-negociation': [409, 'Cette course n\'est plus au stade de la mise en relation.'],
        'pas-d-accord': [409, 'Aucun accord n\'a encore été proposé.'],
        'deja-valide': [409, 'L\'accord est déjà validé par les deux parties.'],
        // ⚠️ Un refus doit TOUJOURS se lire en clair (leçon des échecs muets) :
        // sans entrée ici, ces deux cas tomberaient dans le 500 générique.
        'propose-livreur-seul': [403, 'C\'est au livreur de proposer son prix — indique dans la discussion ce qui ne te convient pas.'],
        'prix-invalide': [400, 'Indique un prix entre 1 et 2000 €.']
      };
      const m = map[e.message];
      if (m) return res.status(m[0]).json({ ok: false, error: m[1] });
      console.error('[courses] accord failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Opération échouée.' });
    }
    // Trace systématique dans le fil (message immuable).
    const txt = out.action === 'propose'
      ? '📝 Accord proposé par le ' + out.role + ' — ' + coursesLib.accordSummary(out.accord)
        + '. L\'autre partie doit l\'accepter.'
      : out.action === 'accept'
        ? '👍 Le ' + out.role + ' a accepté l\'accord. En attente de l\'autre partie.'
        : out.action === 'valide'
          ? '✅ Accord validé par les DEUX parties — ' + coursesLib.accordSummary(out.accord)
            + '. Le client doit maintenant régler sa marchandise à Pirates Tools : la course sera alors réellement commandée.'
          : '❌ Accord refusé par le ' + out.role + '. Reprenez la discussion.';
    try {
      await ref.collection('messages').add({
        uid: 'systeme', role: 'systeme', round: out.round, text: txt, at: new Date()
      });
    } catch (e) { console.warn('[courses] message accord échoué:', e.message); }
    if (out.action === 'valide') {
      const dests = [out.course.artisanEmail, out.course.courierEmail].filter(Boolean);
      for (const to of dests) {
        await coursesLib.sendMail(to, '✅ Accord validé — ' + String(out.course.address || '').slice(0, 60),
          '<p><strong>Vous êtes d\'accord tous les deux.</strong></p>'
          + '<p>' + coursesLib.escapeHtml(coursesLib.accordSummary(out.accord)) + '</p>'
          + '<p>Dernière étape : le client règle sa marchandise à Pirates Tools. '
          + 'La course est alors <strong>réellement commandée</strong>.</p>'
          + '<p style="color:#666;font-size:13px">Le prix de la course a été convenu directement entre vous : '
          + 'Pirates Tools ne le fixe pas et n\'encaisse rien dessus.</p>');
      }
    }
    return res.status(200).json({ ok: true, id, accord: out.accord || null, valide: out.action === 'valide' });
  }

  // ── MARCHANDISE PAYÉE → la course est réellement commandée ────────────────
  // Le client règle SES ARTICLES à Pirates Tools (c'est notre vente). Le prix
  // de la course, lui, ne passe pas par nous. On vérifie le paiement chez
  // l'ancien fournisseur : abouti, à ce compte, et marqué pour CETTE course (courseRef).
  if (body.type === 'course-goods-paid') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    const piId = String(body.paymentIntentId || '').trim().slice(0, 80);
    if (!id || !piId) return res.status(400).json({ ok: false, error: 'id et paiement requis' });
    // ⚠️ COUTURE PAIEMENT — voir le bloc course-create ci-dessus.
    const paiement = paiementSocle.fournisseur();
    if (!paiement.estConfigure()) return res.status(503).json({ ok: false, error: 'Paiement non configuré.' });
    let paye = null;
    try { paye = await paiement.lirePaiement(piId); }
    catch (e) { return res.status(404).json({ ok: false, error: 'Paiement introuvable.' }); }
    if (!paye || paye.etat !== paiementSocle.ETAT_ACQUIS) return res.status(400).json({ ok: false, error: 'Paiement non abouti.' });
    const md = paye.metadata || {};
    if (md.source !== 'pirates-tools' || md.courseRef !== id) {
      return res.status(400).json({ ok: false, error: 'Ce paiement ne correspond pas à cette livraison.' });
    }
    if (md.uid && md.uid !== uid) return res.status(403).json({ ok: false, error: 'Ce paiement ne t\'appartient pas.' });
    const ref = db.collection('courses').doc(id);
    let course = null;
    try {
      course = await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        const c = d.data();
        if (c.artisanUid !== uid) throw new Error('pas-ta-course');
        if (c.goodsPaid) return c;                     // idempotent (double clic / retour /merci)
        if (!c.accord || !c.accord.valide) throw new Error('accord-manquant');
        // GARDE DE STATUT (audit P5) : une route qui écrit un statut ne doit
        // jamais le faire depuis n'importe quel état. Sans elle, `confirmee`
        // pouvait être écrit par-dessus un état plus avancé.
        if (c.status !== 'acceptee') throw new Error('pas-en-negociation');
        tx.update(ref, {
          goodsPaid: true, goodsPaymentIntentId: pi.id,
          goodsAmountCents: pi.amount || 0,
          status: 'confirmee', confirmedOrderAt: new Date()
        });
        return c;
      });
    } catch (e) {
      const map = {
        'introuvable': [404, 'Course introuvable.'],
        'pas-ta-course': [403, 'Cette livraison n\'est pas la tienne.'],
        'accord-manquant': [409, 'L\'accord doit être validé par les deux parties avant le paiement.'],
        'pas-en-negociation': [409, 'Cette course n\'est plus au stade de la mise en relation.']
      };
      const m = map[e.message];
      if (m) return res.status(m[0]).json({ ok: false, error: m[1] });
      console.error('[courses] goods-paid failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Confirmation échouée.' });
    }
    try {
      await ref.collection('messages').add({
        uid: 'systeme', role: 'systeme', round: course.round || 1,
        text: '💳 Marchandise réglée par le client — la course est officiellement commandée. Bonne livraison !',
        at: new Date()
      });
    } catch (_) {}
    if (course.courierEmail) {
      await coursesLib.sendMail(course.courierEmail,
        '🚀 Course confirmée — la marchandise est payée',
        '<p>Le client a réglé sa marchandise : <strong>la course est officiellement commandée</strong>.</p>'
        + '<p>' + coursesLib.escapeHtml(coursesLib.accordSummary(course.accord)) + '</p>'
        + '<p>📍 ' + coursesLib.escapeHtml(course.address || '') + '</p>');
    }
    return res.status(200).json({ ok: true, id, status: 'confirmee' });
  }

  // ── Remettre la demande EN LIGNE (client OU livreur, depuis le chat) ──────
  // « Ça ne colle pas » : on annule la mise en relation, pas la demande. La
  // course redevient visible de tous les livreurs et l'alerte repart.
  // round + 1 → le fil de discussion précédent devient inaccessible aux DEUX
  // (règles Firestore) : le livreur suivant ne lira jamais la conversation
  // d'avant, et l'ancien livreur perd l'accès à la course.
  if (body.type === 'course-release') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    const ref = db.collection('courses').doc(id);
    let out = null;
    try {
      out = await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        const c = d.data();
        if (c.artisanUid !== uid && c.courierUid !== uid) throw new Error('pas-participant');
        // 'confirmee' est AUTORISÉ ici (audit P5) : sans ça, un client qui a
        // réglé sa marchandise et dont le livreur ne se présente jamais n'avait
        // AUCUNE sortie autonome — seul un litige, donc une intervention
        // humaine, débloquait la situation alors que son argent était engagé.
        // `goodsPaid` est CONSERVÉ : il ne repaiera jamais deux fois.
        if (c.status !== 'acceptee' && c.status !== 'confirmee') throw new Error('pas-acceptee');
        if (c.paid) throw new Error('deja-payee');
        tx.update(ref, {
          status: 'en_attente', chatOpen: false,
          courierUid: null, courierEmail: null, courierName: '',
          accord: null,                       // l'accord appartenait à CETTE mise en relation
          round: (c.round || 1) + 1,
          releasedAt: new Date(), releasedBy: c.artisanUid === uid ? 'client' : 'livreur'
        });
        return { course: c, par: c.artisanUid === uid ? 'client' : 'livreur' };
      });
    } catch (e) {
      const map = {
        'introuvable': [404, 'Course introuvable.'],
        'pas-participant': [403, 'Tu n\'es pas concerné par cette course.'],
        'pas-acceptee': [409, 'Cette course n\'est pas en cours de mise en relation.'],
        'deja-payee': [409, 'Cette course a déjà été payée — ouvre un litige plutôt qu\'une remise en ligne.']
      };
      const m = map[e.message];
      if (m) return res.status(m[0]).json({ ok: false, error: m[1] });
      console.error('[courses] release failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Remise en ligne échouée.' });
    }
    // L'alerte repart vers tous les livreurs + on prévient l'autre partie.
    await coursesLib.alertCourseAgain(out.course, id);
    const autre = out.par === 'client' ? out.course.courierEmail : out.course.artisanEmail;
    if (autre) {
      await coursesLib.sendMail(autre,
        '🔁 Mise en relation annulée — la course repart chez les livreurs',
        '<p>Le ' + out.par + ' a mis fin à la mise en relation sur cette course.</p>'
        + '<p>📍 ' + coursesLib.escapeHtml(out.course.address || '') + '</p>'
        + '<p>La demande est de nouveau ouverte à tous les livreurs. Rien n\'a été débité.</p>');
    }
    return res.status(200).json({ ok: true, id, status: 'en_attente' });
  }

  // ── ANNULER sa demande (le CLIENT a changé d'avis) ────────────────────────
  if (body.type === 'course-cancel') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    const ref = db.collection('courses').doc(id);
    let course = null;
    try {
      course = await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        const c = d.data();
        if (c.artisanUid !== uid) throw new Error('pas-ta-course');
        if (!['en_attente', 'acceptee'].includes(c.status)) throw new Error('trop-tard');
        if (c.paid) throw new Error('deja-payee');
        // Marchandise déjà réglée : l'annulation n'est plus un simple bouton,
        // c'est une décision commerciale (remboursement, retrait des articles).
        // Elle passe par la discussion ou le litige, pas par un clic.
        if (c.goodsPaid) throw new Error('marchandise-payee');
        tx.update(ref, { status: 'annulee', chatOpen: false, canceledAt: new Date() });
        return c;
      });
    } catch (e) {
      const map = {
        'introuvable': [404, 'Demande introuvable.'],
        'pas-ta-course': [403, 'Tu ne peux annuler que tes propres demandes.'],
        'trop-tard': [409, 'Trop tard : cette livraison est déjà en cours ou terminée.'],
        'deja-payee': [409, 'Cette course a été payée — contacte-nous plutôt que de l\'annuler.'],
        'marchandise-payee': [409, 'Ta marchandise est déjà réglée : passe par la discussion pour convenir de la suite (ou remets la demande en ligne pour trouver un autre livreur).']
      };
      const m = map[e.message];
      if (m) return res.status(m[0]).json({ ok: false, error: m[1] });
      console.error('[courses] cancel failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Annulation échouée.' });
    }
    if (course.courierEmail) {
      await coursesLib.sendMail(course.courierEmail,
        '❌ Demande de livraison annulée par le client',
        '<p>Le client a annulé sa demande de livraison.</p>'
        + '<p>📍 ' + coursesLib.escapeHtml(course.address || '') + '</p>'
        + '<p>Rien n\'a été débité, rien ne t\'est dû. La course disparaît de ton espace.</p>');
    }
    return res.status(200).json({ ok: true, id, status: 'annulee' });
  }

  // ── Lister (livreur de test : dispo + les miennes ; artisan : les miennes) ──
  // ══ DISCUSSION DIRECTE CLIENT ↔ LIVREUR ═══════════════════════════════════
  // Ouverte depuis la carte d'un livreur, SANS passer par une course.
  // ⚖️ Elle ne crée aucun engagement : c'est une mise en relation, rien de
  // plus. Le prix, les modalités et l'éventuelle course restent entre eux.
  //
  // 🔒 POURQUOI CETTE ROUTE EXISTE au lieu d'une écriture directe : c'est ICI,
  // et seulement ici, qu'on vérifie que le livreur est réellement EN SERVICE.
  // Les règles Firestore interdisent au client de créer le document lui-même —
  // sinon il forgerait le fil sans ce contrôle, et pourrait même y inscrire
  // l'uid de quelqu'un d'autre comme participant.
  if (body.type === 'conv-open') {
    const courierUid = String(body.courierUid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
    if (!courierUid) return res.status(400).json({ ok: false, error: 'Livreur introuvable.' });
    if (courierUid === uid) {
      return res.status(400).json({ ok: false, error: 'Tu ne peux pas t\'écrire à toi-même.' });
    }
    const fiche = await db.collection('couriers_public').doc(courierUid).get();
    if (!fiche.exists || !fiche.data().published) {
      return res.status(404).json({ ok: false, error: 'Ce livreur n\'a pas de fiche publique.' });
    }
    const f = fiche.data();
    // LE CONTRÔLE CENTRAL, refait serveur : interrupteur ET plage horaire.
    if (!coursesLib.enService(f, new Date())) {
      return res.status(409).json({
        ok: false, code: 'hors-service',
        error: 'Ce livreur n\'est pas en service actuellement. Tu pourras le contacter '
          + 'dès qu\'il sera de nouveau disponible.'
      });
    }
    // Identifiant DÉTERMINISTE : un même client ne peut pas ouvrir dix fils
    // avec le même livreur, et rejouer la requête ne crée jamais de doublon.
    const convId = uid + '_' + courierUid;
    const ref = db.collection('conversations').doc(convId);
    const deja = await ref.get();
    if (!deja.exists) {
      await ref.set({
        clientUid: uid, clientEmail: email,
        courierUid, courierName: String(f.displayName || '').slice(0, 60),
        createdAt: new Date(), lastAt: new Date()
      });
      // Amorce écrite par le serveur : le fil n'est jamais vide, et les deux
      // savent d'emblée ce que cette discussion est — et ce qu'elle n'est pas.
      await ref.collection('messages').add({
        uid: 'systeme', role: 'systeme', at: new Date(),
        text: 'Discussion ouverte avec ' + (f.displayName || 'ce livreur')
          + '. Vous pouvez convenir librement de ce que vous voulez : Pirates Tools '
          + 'ne fixe aucun prix et ne prend rien sur la course.'
      });
    } else {
      await ref.set({ lastAt: new Date() }, { merge: true });
    }
    return res.status(200).json({ ok: true, id: convId, courierName: f.displayName || '' });
  }

  // Mes discussions directes — que je sois le client ou le livreur.
  if (body.type === 'conv-list') {
    // ⚠️ AUCUN orderBy ici, volontairement : « where » + « orderBy » sur deux
    // champs différents exigerait un INDEX COMPOSITE, et la requête échouerait
    // en production alors que l'émulateur crée les index à la volée (panne
    // vécue le 27/07/2026 sur le chat des courses). On trie en JS.
    const [cotClient, cotLivreur] = await Promise.all([
      db.collection('conversations').where('clientUid', '==', uid).limit(50).get(),
      db.collection('conversations').where('courierUid', '==', uid).limit(50).get()
    ]);
    const vues = {};
    [cotClient, cotLivreur].forEach((snap) => snap.forEach((d) => {
      const c = d.data() || {};
      vues[d.id] = {
        id: d.id,
        role: c.clientUid === uid ? 'client' : 'livreur',
        courierUid: c.courierUid || '', courierName: c.courierName || '',
        clientEmail: c.courierUid === uid ? (c.clientEmail || '') : '',
        lastAt: c.lastAt && c.lastAt.toMillis ? c.lastAt.toMillis() : 0
      };
    }));
    const conversations = Object.keys(vues).map((k) => vues[k])
      .sort((a, b) => b.lastAt - a.lastAt);
    return res.status(200).json({ ok: true, conversations });
  }

  if (body.type === 'course-list') {
    const snap = await db.collection('courses').orderBy('createdAt', 'desc').limit(50).get()
      .catch(() => db.collection('courses').limit(50).get());
    const mine = [], dispo = [];
    snap.forEach((d) => {
      const c = Object.assign({ id: d.id }, d.data());
      const out = {
        id: c.id, status: c.status, productTitle: c.productTitle, qty: c.qty,
        address: c.address, km: c.km, zone: c.zone, prix: c.prix,
        lat: c.lat, lng: c.lng,
        date: c.date, when: c.when, hour: c.hour,
        lieu: c.lieu || '', notes: c.notes || '',
        mine: c.artisanUid === uid, acceptedByMe: c.courierUid === uid,
        courierUid: c.courierUid || null, courierName: c.courierName || '',
        chatOpen: !!c.chatOpen, round: c.round || 1,
        accord: c.accord || null, goodsPaid: !!c.goodsPaid,
        goodsAmountCents: c.goodsAmountCents || 0,
        lines: Array.isArray(c.lines) ? c.lines : [],
        rating: c.rating || 0, ratingComment: c.ratingComment || '',
        paid: !!c.paid, escrow: c.escrow || null,
        feeCents: c.feeCents || 0, amountCents: c.amountCents || 0,
        hasProof: !!c.proofPhoto || !!c.hasProof,
        hasScene: !!c.hasScene,
        videosCount: (c.videos || []).length,
        litige: c.litige ? { open: !!c.litige.open, role: c.litige.role || '' } : null,
        createdAt: c.createdAt && c.createdAt.toMillis ? c.createdAt.toMillis() : null
      };
      // CODE DE REMISE : visible UNIQUEMENT par le client qui a commandé —
      // jamais dans la liste dispo des livreurs (il se donne en main propre).
      if (c.artisanUid === uid) out.code = c.code || null;
      if (c.artisanUid === uid || c.courierUid === uid) mine.push(out);
      if (isCourier && c.status === 'en_attente') dispo.push(out); // (test : même compte des 2 côtés accepté)
    });
    return res.status(200).json({ ok: true, courier: isCourier, dispo, mine });
  }

  // ── Accepter (livreur de test — 1er arrivé, transaction atomique) ──
  if (body.type === 'course-accept') {
    if (!isCourier) return res.status(403).json({ ok: false, error: 'Réservé aux livreurs validés (service en test).' });
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    const ref = db.collection('courses').doc(id);
    // Nom affiché du livreur : lu AVANT la transaction (aucune lecture hors
    // transaction ne doit s'y glisser) — sert au fil de discussion et à la
    // fiche publique côté client.
    let courierName = '';
    let tarifZone = null;
    try {
      const cp = await db.collection('couriers_public').doc(uid).get();
      if (cp.exists) {
        courierName = String(cp.data().displayName || '').slice(0, 60);
        tarifZone = coursesLib.sanitizeTarifs(cp.data().tarifs);
      }
    } catch (_) {}
    let round = 1;
    try {
      const result = await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        if (d.data().status !== 'en_attente') throw new Error('deja-prise');
        round = d.data().round || 1;
        tx.update(ref, {
          status: 'acceptee', courierUid: uid, courierEmail: email,
          courierName, chatOpen: true, acceptedAt: new Date()
        });
        return d.data();
      });
      // Ouvre le fil de discussion : 1er arrivé = mise en relation immédiate.
      // Message d'amorce écrit par le serveur (rôle 'systeme') — les deux
      // participants écrivent ensuite directement via le SDK, sous les règles
      // Firestore (courses/{id}/messages, participants seuls).
      try {
        const zone = (result && result.zone) || 1;
        const tarif = tarifZone ? tarifZone[zone] : null;
        await ref.collection('messages').add({
          uid: 'systeme', role: 'systeme', round,
          text: 'Course acceptée par ' + (courierName || 'un livreur')
            + (tarif ? ' — son tarif zone ' + zone + ' : ' + tarif + ' €' : '')
            + '. Mettez-vous d\'accord ici sur le prix, l\'heure exacte, le point de dépôt et l\'accès au chantier. '
            + 'Si ça ne convient pas, chacun peut remettre la demande en ligne.',
          at: new Date()
        });
      } catch (e) { console.warn('[courses] amorce chat échouée:', e.message); }
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

  // ── Marquer livrée (livreur qui a accepté, PHOTO OBLIGATOIRE) ──
  // La photo (colis remis, prise sur place) est la PREUVE anti-arnaque des
  // deux côtés : le livreur ne peut pas réclamer sans avoir livré, le client
  // ne peut pas nier une livraison photographiée. Stockée dans le doc course
  // (JPEG compressé client ≤ ~500 Ko base64, limite doc Firestore 1 Mio).
  if (body.type === 'course-deliver') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
    const photo = String(body.photo || '');      // colis remis (gros plan)
    const photo2 = String(body.photo2 || '');    // vue du chantier, colis posés
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    const okImg = (p) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) && p.length <= 700000;
    if (!okImg(photo)) return res.status(400).json({ ok: false, error: 'Photo du colis remis requise (prise sur place).' });
    if (!okImg(photo2)) return res.status(400).json({ ok: false, error: 'Photo du chantier requise (colis posés, vue large).' });
    const ref = db.collection('courses').doc(id);
    try {
      const result = await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        const c = d.data();
        if (c.courierUid !== uid) throw new Error('pas-ta-course');
        // 'confirmee' = accord validé PAR LES DEUX + marchandise réglée (flux
        // courant). 'acceptee' n'est livrable que pour les anciennes courses
        // PRÉ-PAYÉES : sans ça, un livreur pouvait clore une course dont rien
        // n'avait été convenu ni payé.
        if (!(c.status === 'confirmee' || (c.status === 'acceptee' && c.paid))) throw new Error('pas-acceptee');
        // CODE DE REMISE : le client le détient dans « Mes livraisons » et le
        // donne EN MAIN PROPRE contre le colis. Sans le bon code, impossible
        // de marquer livrée. (Courses legacy sans code : pas de contrôle.)
        if (c.code && code !== c.code) throw new Error('code-invalide');
        // Photos en SOUS-COLLECTION (limite 1 Mio par doc Firestore : 2 photos
        // dans le doc course la crèveraient). Accès serveur uniquement (rules
        // default-deny sur les sous-chemins, Admin SDK seul).
        tx.set(ref.collection('photos').doc('remise'), { data: photo, at: new Date(), by: uid });
        tx.set(ref.collection('photos').doc('chantier'), { data: photo2, at: new Date(), by: uid });
        tx.update(ref, { status: 'livree', deliveredAt: new Date(), hasProof: true, codeVerified: !!c.code });
        return c;
      });
      // Prévenir l'artisan : à lui de confirmer pour débloquer le livreur.
      if (result.artisanEmail) {
        await coursesLib.sendMail(result.artisanEmail,
          '📦 Ta livraison est arrivée — confirme la réception',
          '<p>Ton livreur a marqué ta commande comme <strong>livrée</strong> (photo à l\'appui).</p>'
          + '<p>📍 ' + coursesLib.escapeHtml(result.address || '') + '</p>'
          + '<p>Ouvre <strong>Mes livraisons</strong> sur pirates-tools.com : vérifie la photo puis '
          + '<strong>confirme la réception</strong> — c\'est ce qui débloque le paiement du livreur'
          + (result.paid ? ' (' + result.prix + ' € gelés en attente)' : '') + '.</p>');
      }
      return res.status(200).json({ ok: true, id, status: 'livree' });
    } catch (e) {
      const map = { 'introuvable': [404, 'Course introuvable.'], 'pas-ta-course': [403, 'Seul le livreur qui a accepté peut marquer la livraison.'],
        'pas-acceptee': [409, 'Cette course n\'est pas (ou plus) en cours de livraison.'],
        'code-invalide': [403, 'Code de remise incorrect — demande-le au client (il l\'a dans « Mes livraisons »), il te le donne contre le colis.'] };
      const m = map[e.message];
      if (m) return res.status(m[0]).json({ ok: false, error: m[1] });
      console.error('[courses] deliver failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Enregistrement échoué.' });
    }
  }

  // ── Confirmer la réception (client) → DÉGEL des frais livreur ──
  // Escrow : 'gele' → 'libere' si virement direct du livreur est branché
  // (transfer automatique), sinon 'liberable' + email owner (virement manuel
  // en attendant l'onboarding Connect — activation au lancement).
  if (body.type === 'course-confirm') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    const ref = db.collection('courses').doc(id);
    let course = null;
    try {
      course = await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        const c = d.data();
        if (c.artisanUid !== uid) throw new Error('pas-ta-course');
        if (c.status !== 'livree') throw new Error('pas-livree');
        tx.update(ref, { status: 'terminee', confirmedAt: new Date(), escrow: c.paid ? 'liberable' : null });
        return c;
      });
    } catch (e) {
      const map = { 'introuvable': [404, 'Course introuvable.'], 'pas-ta-course': [403, 'Tu ne peux confirmer que tes propres livraisons.'],
        'pas-livree': [409, 'Le livreur n\'a pas encore marqué cette course comme livrée.'] };
      const m = map[e.message];
      if (m) return res.status(m[0]).json({ ok: false, error: m[1] });
      console.error('[courses] confirm failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Confirmation échouée.' });
    }
    // Compteur PUBLIC de courses terminées (visible des clients sur sa fiche).
    // Incrémenté seulement à la confirmation du client — donc jamais gonflable
    // par le livreur seul.
    if (course.courierUid) {
      try {
        await db.collection('couriers_public').doc(course.courierUid).set({
          uid: course.courierUid,
          coursesDone: admin.firestore.FieldValue.increment(1),
          updatedAt: new Date()
        }, { merge: true });
      } catch (e) { console.warn('[courses] compteur public échoué:', e.message); }
    }
    let escrow = course.paid ? 'liberable' : null;
    if (course.paid && course.feeCents > 0) {
      /* ⛔ VIREMENT AUTOMATIQUE SUPPRIMÉ (01/08/2026, demande de l'user :
         « éradiquer tout ce qui porte le nom de l'ancien fournisseur, c'est
         TOUT »). Ce bloc appelait son SDK pour virer sa course au livreur.

         Il était DÉJÀ mort, et le commentaire d'origine le disait : depuis le
         27/07/2026 la plateforme n'encaisse plus la course — le client règle
         le livreur en direct (art. L7342-1, présomption de salariat). Sa clé
         d'environnement n'existe plus non plus : la condition ne pouvait donc
         jamais être vraie, et c'est le repli ci-dessous qui s'exécutait à tous
         les coups.

         Le repli EST le modèle actuel : l'owner reçoit un e-mail et vire à la
         main. Rien n'est perdu, une dépendance de moins. */
      let released = false;
      if (!released && cfg.ownerEmail) {
        // Pas de Connect : l'owner verse à la main (trace email + doc course).
        await coursesLib.sendMail(cfg.ownerEmail,
          '💰 ' + course.prix + ' € à verser au livreur — course confirmée',
          '<p>Le client a confirmé la réception de sa livraison.</p>'
          + '<p>Livreur : ' + coursesLib.escapeHtml(course.courierEmail || course.courierUid || '?')
          + '<br>Montant gelé à verser : <strong>' + course.prix + ' €</strong>'
          + '<br>Course : ' + coursesLib.escapeHtml(id) + '<br>📍 ' + coursesLib.escapeHtml(course.address || '') + '</p>'
          + '<p>Coordonnées bancaires du livreur non branchées → virement manuel, puis marquer versé.</p>');
      }
      if (course.courierEmail) {
        await coursesLib.sendMail(course.courierEmail,
          '✅ Livraison confirmée — tes ' + course.prix + ' € sont débloqués',
          '<p>Le client a confirmé la réception (photo validée).</p>'
          + '<p>💶 <strong>' + course.prix + ' €</strong> — '
          + (escrow === 'libere' ? 'virement envoyé vers ton compte.' : 'versement en cours de traitement.') + '</p>');
      }
    }
    return res.status(200).json({ ok: true, id, status: 'terminee', escrow });
  }

  // ── Photo du chantier par le CLIENT (à la commande) ──
  // Sert de référence : le livreur la voit pour retrouver le chantier, et à
  // la livraison on compare avec SA photo — tout doit matcher.
  if (body.type === 'course-scene') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    const photo = String(body.photo || '');
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 700000) {
      return res.status(400).json({ ok: false, error: 'Photo du chantier invalide.' });
    }
    const ref = db.collection('courses').doc(id);
    const d = await ref.get();
    if (!d.exists) return res.status(404).json({ ok: false, error: 'Course introuvable.' });
    const c = d.data();
    if (c.artisanUid !== uid) return res.status(403).json({ ok: false, error: 'Tu ne peux joindre une photo qu\'à tes propres commandes.' });
    if (!['en_attente', 'acceptee', 'confirmee'].includes(c.status)) return res.status(409).json({ ok: false, error: 'Course déjà livrée.' });
    await ref.collection('photos').doc('scene').set({ data: photo, at: new Date(), by: uid });
    await ref.update({ hasScene: true });
    return res.status(200).json({ ok: true, id });
  }

  // ── Photos de la course (uniquement l'artisan ou le livreur de la course) ──
  // scene = chantier vu par le client (commande) ; remise = colis remis ;
  // chantier = vue large du livreur, colis posés. Comparaison anti-arnaque.
  if (body.type === 'course-proof') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    const ref = db.collection('courses').doc(id);
    const d = await ref.get();
    if (!d.exists) return res.status(404).json({ ok: false, error: 'Course introuvable.' });
    const c = d.data();
    if (c.artisanUid !== uid && c.courierUid !== uid) {
      return res.status(403).json({ ok: false, error: 'Accès refusé.' });
    }
    const photos = { scene: null, remise: null, chantier: null };
    const snap = await ref.collection('photos').get();
    snap.forEach((p) => { if (photos.hasOwnProperty(p.id)) photos[p.id] = (p.data() || {}).data || null; });
    if (!photos.remise && c.proofPhoto) photos.remise = c.proofPhoto;   // courses d'avant le passage en sous-collection
    return res.status(200).json({ ok: true, id, photos, photo: photos.remise });
  }

  // ── Vidéo déposée (remise/litige) : enregistrer la référence ──
  // Le FICHIER part directement dans Firebase Storage (SDK client, gouverné
  // par storage.rules : participants de la course seulement, ≤120 Mo, video/*).
  // Ici on ne journalise que le CHEMIN dans le doc course — l'admin liste et
  // lit via URL signée (jamais de lecture publique), et supprime tout à la
  // clôture du litige.
  if (body.type === 'course-video') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    const path = String(body.path || '').slice(0, 300);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    if (path.indexOf('courses/' + id + '/videos/') !== 0) {
      return res.status(400).json({ ok: false, error: 'Chemin vidéo invalide.' });
    }
    const ref = db.collection('courses').doc(id);
    const d = await ref.get();
    if (!d.exists) return res.status(404).json({ ok: false, error: 'Course introuvable.' });
    const c = d.data();
    const role = c.artisanUid === uid ? 'client' : (c.courierUid === uid ? 'livreur' : null);
    if (!role) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
    if ((c.videos || []).length >= 6) return res.status(409).json({ ok: false, error: 'Limite de 6 vidéos atteinte sur cette course.' });
    await ref.update({
      videos: admin.firestore.FieldValue.arrayUnion({ path, by: uid, role, at: new Date() })
    });
    return res.status(200).json({ ok: true, id });
  }

  // ── Ouvrir un LITIGE (client OU livreur de la course) ──
  // Gèle la situation, alerte l'owner, ouvre le dépôt de vidéos des deux
  // côtés. Clôture par l'admin uniquement (les vidéos sont alors effacées).
  if (body.type === 'course-dispute') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    const message = String(body.message || '').trim().slice(0, 1000);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    if (message.length < 10) return res.status(400).json({ ok: false, error: 'Décris le problème (au moins 10 caractères).' });
    const ref = db.collection('courses').doc(id);
    const d = await ref.get();
    if (!d.exists) return res.status(404).json({ ok: false, error: 'Course introuvable.' });
    const c = d.data();
    const role = c.artisanUid === uid ? 'client' : (c.courierUid === uid ? 'livreur' : null);
    if (!role) return res.status(403).json({ ok: false, error: 'Accès refusé.' });
    if (c.litige && c.litige.open) return res.status(409).json({ ok: false, error: 'Un litige est déjà ouvert sur cette course.' });
    await ref.update({ litige: { open: true, by: uid, role, message, at: new Date() } });
    if (cfg.ownerEmail) {
      await coursesLib.sendMail(cfg.ownerEmail,
        '⚠️ LITIGE ouvert sur une course — ' + id,
        '<p>Un litige vient d\'être ouvert par le <strong>' + role + '</strong>.</p>'
        + '<p>Course : ' + coursesLib.escapeHtml(id) + '<br>📍 ' + coursesLib.escapeHtml(c.address || '')
        + '<br>💶 ' + (c.prix || '?') + ' € — escrow : ' + coursesLib.escapeHtml(c.escrow || 'n/a') + '</p>'
        + '<p>Message : « ' + coursesLib.escapeHtml(message) + ' »</p>'
        + '<p>Ouvre l\'admin → Livreurs → Litiges pour voir les photos/vidéos et trancher. '
        + 'Les vidéos restent privées et seront effacées à la clôture.</p>');
    }
    return res.status(200).json({ ok: true, id });
  }

  // ── Noter le livreur (client UNIQUEMENT, sa propre course, une seule fois) ──
  if (body.type === 'course-rate') {
    const id = String(body.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    const rating = parseInt(body.rating, 10);
    const comment = String(body.comment || '').trim().slice(0, 500);
    if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ ok: false, error: 'note 1 à 5 requise' });
    const ref = db.collection('courses').doc(id);
    try {
      await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        if (!d.exists) throw new Error('introuvable');
        const c = d.data();
        if (c.artisanUid !== uid) throw new Error('pas-ta-course');
        // La note est PUBLIQUE (fiche du livreur) : elle ne peut exister
        // qu'après une livraison réellement effectuée. Avant, une note était
        // possible dès l'acceptation — un client pouvait noter un livreur qui
        // n'avait encore rien fait.
        if (!['livree', 'terminee'].includes(c.status)) throw new Error('pas-encore');
        if (c.rating) throw new Error('deja-note');
        tx.update(ref, { rating, ratingComment: comment, ratedAt: new Date(), ratedBy: uid });
        return c;
      });
      // Report sur la fiche PUBLIQUE du livreur (note moyenne + derniers avis).
      // ⚠️ RGPD : aucun nom, aucun email de client dans l'avis publié — la note,
      // le commentaire et la date suffisent. Fait hors transaction (autre doc,
      // échec non bloquant : la note reste enregistrée sur la course).
      try {
        const cu = await ref.get();
        const courierUid = cu.exists ? cu.data().courierUid : null;
        if (courierUid) {
          const pref = db.collection('couriers_public').doc(courierUid);
          await db.runTransaction(async (tx) => {
            const p = await tx.get(pref);
            const d = p.exists ? p.data() : {};
            const avis = Array.isArray(d.avis) ? d.avis.slice(-19) : [];
            avis.push({ r: rating, c: comment, d: new Date().toISOString().slice(0, 10) });
            tx.set(pref, {
              uid: courierUid,
              ratingCount: (d.ratingCount || 0) + 1,
              ratingSum: (d.ratingSum || 0) + rating,
              avis, updatedAt: new Date()
            }, { merge: true });
          });
        }
      } catch (e) { console.warn('[courses] agrégation note échouée:', e.message); }
      return res.status(200).json({ ok: true, id, rating });
    } catch (e) {
      const map = { 'introuvable': [404, 'Course introuvable.'], 'pas-ta-course': [403, 'Tu ne peux noter que tes propres livraisons.'],
        'pas-encore': [400, 'Tu pourras noter une fois la livraison effectuée.'], 'deja-note': [409, 'Tu as déjà noté cette livraison.'] };
      const m = map[e.message];
      if (m) return res.status(m[0]).json({ ok: false, error: m[1] });
      console.error('[courses] rate failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Notation échouée.' });
    }
  }

  return res.status(400).json({ ok: false, error: 'type inconnu' });
}
