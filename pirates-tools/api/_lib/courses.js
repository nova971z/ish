// api/_lib/courses.js — Courses de livraison quincaillerie : logique PARTAGÉE.
//
// Utilisé par :
//  - create-payment-intent.js : devis de course (zone/prix AUTORITAIRES serveur
//    depuis lat/lng — le client n'est jamais cru) ajouté au montant débité ;
//  - webhook.js : création de la course quand payment_intent.succeeded porte
//    la metadata course* (chemin principal quand STRIPE_WEBHOOK_SECRET est posé) ;
//  - contact.js : création de la course sur PREUVE de paiement (repli client
//    /merci — fonctionne SANS webhook configuré), + accept/livraison/confirm.
//
// IDEMPOTENCE : l'id du document courses/ = l'id du PaymentIntent. create()
// échoue si le doc existe → webhook et repli client peuvent tous deux appeler
// createFromIntent sans jamais créer de doublon (même garantie que
// stripe_events pour les emails de commande).
//
// ARGENT (décision user 26/07) : le client paie TOUT en une fois (produits +
// frais de livraison). Les frais de livraison sont GELÉS (escrow:'gele') sur
// notre solde jusqu'à la confirmation de réception par le client — puis
// reversés au livreur (Stripe Connect si branché, sinon virement manuel
// signalé par email à l'owner). Zéro bénéfice plateforme sur la course.

'use strict';

const crypto = require('crypto');

const DEPOT = { lat: 16.2260, lng: -61.3823 };   // Sainte-Anne (Guadeloupe)
const BAREME = [                                  // = LV_BAREME client (source croisée, CI check-products non concerné)
  { zone: 1, maxKm: 10, prix: 22 },
  { zone: 2, maxKm: 22, prix: 48 },
  { zone: 3, maxKm: 34, prix: 74 },
  { zone: 4, maxKm: 46, prix: 100 }
];
const TEST_EMAILS = ['justforwada@icloud.com'];   // comptes de test (user)

function haversineKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Devis serveur : { km, zone, prix } ou null (coordonnées invalides / hors zone).
function quote(lat, lng) {
  lat = Number(lat); lng = Number(lng);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const km = haversineKm(DEPOT, { lat, lng });
  const z = BAREME.find((b) => km <= b.maxKm);
  if (!z) return null;
  return { km: Math.round(km * 10) / 10, zone: z.zone, prix: z.prix, lat, lng };
}

// Crée la course depuis un PaymentIntent PAYÉ (metadata course* posée par
// create-payment-intent). Doc id = pi.id → idempotent (create() refuse le
// doublon). Retourne { created, id, course }.
async function createFromIntent(db, pi, fallback) {
  const md = (pi && pi.metadata) || {};
  if (!md.courseZone) return { created: false, id: null, course: null };
  const feeCents = parseInt(md.courseFeeCents, 10) || 0;
  const course = {
    status: 'en_attente', test: true,
    // CODE DE REMISE (6 chiffres, aléatoire crypto) : détenu par le CLIENT
    // seul (jamais montré aux livreurs dans les listes/emails). Le livreur ne
    // peut marquer « livrée » qu'en fournissant ce code — il ne l'obtient
    // qu'EN MAIN PROPRE, au moment de remettre le colis.
    code: String(crypto.randomInt(0, 1000000)).padStart(6, '0'),
    paid: true, escrow: 'gele',                       // frais livreur gelés jusqu'à confirmation client
    artisanUid: md.uid || (fallback && fallback.uid) || null,
    artisanEmail: pi.receipt_email || (fallback && fallback.email) || null,
    productKey: 'commande-payee',
    productTitle: String(pi.description || 'Commande quincaillerie').slice(0, 200),
    qty: parseInt(md.courseQty, 10) || 1,
    address: String(md.courseAddress || '').slice(0, 200),
    lat: Number(md.courseLat), lng: Number(md.courseLng),
    km: Number(md.courseKm) || 0,
    zone: parseInt(md.courseZone, 10) || 1,
    prix: Math.round(feeCents / 100),
    feeCents,
    productsCents: Math.max(0, (pi.amount || 0) - feeCents),
    amountCents: pi.amount || 0,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(md.courseDate || '')) ? md.courseDate : '',
    when: ['matin', 'apresmidi', 'heure'].includes(md.courseWhen) ? md.courseWhen : 'matin',
    hour: /^\d{2}:\d{2}$/.test(String(md.courseHour || '')) ? md.courseHour : '',
    paymentIntentId: pi.id,
    createdAt: new Date()
  };
  const ref = db.collection('courses').doc(pi.id);
  try {
    await ref.create(course);
    return { created: true, id: pi.id, course };
  } catch (e) {
    // ALREADY_EXISTS : déjà créée par l'autre chemin (webhook ↔ repli /merci).
    return { created: false, id: pi.id, course };
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendMail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Pirates Tools <onboarding@resend.dev>';
  if (!apiKey) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ from, to, subject, html })
    });
  } catch (e) { console.warn('[courses] email échoué:', e.message); }
}

// Alerte « nouvelle course » aux livreurs de test + owner.
async function alertNewCourse(course, id) {
  const whenTxt = course.when === 'heure' ? ('à ' + course.hour) : (course.when === 'matin' ? 'le matin' : "l'après-midi");
  const subject = '🛵 Nouvelle course zone ' + course.zone + ' — ' + course.prix + ' € — ' + String(course.address || '').slice(0, 60);
  const html = '<p><strong>Nouvelle course de livraison (TEST)</strong> — payée en ligne ✅</p>'
    + '<p>' + escapeHtml(course.productTitle) + (course.qty > 1 ? ' × ' + course.qty : '') + '<br>'
    + '📍 ' + escapeHtml(course.address) + ' (' + course.km + ' km de Sainte-Anne — zone ' + course.zone + ')<br>'
    + '📅 ' + (course.date || 'au plus tôt') + ' ' + whenTxt + '<br>'
    + '💶 <strong>' + course.prix + ' €</strong> pour le livreur — gelés, débloqués à la confirmation de livraison (photo à l\'appui).</p>'
    + '<p>Ouvre ton espace livreur sur pirates-tools.com pour accepter la course (premier arrivé, premier servi).</p>';
  const owner = process.env.OWNER_EMAIL;
  const dests = Array.from(new Set(TEST_EMAILS.concat(owner ? [owner] : [])));
  for (const to of dests) await sendMail(to, subject, html);
}

// Confirmation de PAIEMENT au client. Envoyée une seule fois, au moment où la
// course est réellement créée (createFromIntent → created === true), donc
// jamais en double même si le webhook et le repli /merci passent tous les deux.
// ⚠️ Le CODE DE REMISE n'est volontairement PAS dans cet email : il se lit
// dans « Mes livraisons » et se donne en main propre. Un email transite et se
// transfère — la preuve de remise ne doit pas circuler.
async function confirmToClient(course, id) {
  if (!course || !course.artisanEmail) return false;
  const eur = (cents) => (Number(cents || 0) / 100).toFixed(2).replace('.', ',') + ' €';
  const whenTxt = course.when === 'heure' ? ('à ' + course.hour)
    : (course.when === 'matin' ? 'le matin' : "l'après-midi");
  const html =
    '<p><strong>Paiement confirmé ✅</strong> — merci pour ta commande.</p>'
    + '<table style="border-collapse:collapse">'
    + '<tr><td style="padding:4px 12px 4px 0">Marchandise</td><td><strong>' + eur(course.productsCents) + '</strong></td></tr>'
    + '<tr><td style="padding:4px 12px 4px 0">Livraison sur chantier (zone ' + course.zone + ')</td><td><strong>' + eur(course.feeCents) + '</strong></td></tr>'
    + '<tr><td style="padding:8px 12px 4px 0;border-top:1px solid #ddd">Total payé</td><td style="border-top:1px solid #ddd"><strong>' + eur(course.amountCents) + '</strong></td></tr>'
    + '</table>'
    + '<p>📍 ' + escapeHtml(course.address) + '<br>'
    + '📅 ' + (course.date || 'au plus tôt') + ' ' + whenTxt + '</p>'
    + '<p>Les ' + course.prix + ' € de livraison sont <strong>gelés</strong> : ils ne seront versés au livreur '
    + 'qu\'après <strong>ta confirmation de réception</strong>. C\'est toi qui débloques le paiement, pas nous.</p>'
    + '<p><strong>La suite :</strong></p>'
    + '<ol>'
    + '<li>Un livreur accepte ta course (tu reçois un email).</li>'
    + '<li>À son arrivée, tu lui donnes ton <strong>code de remise à 6 chiffres</strong> — il est dans '
    + '<strong>Mes livraisons</strong> sur pirates-tools.com, avec son QR code. Ne le communique qu\'en main propre, contre le colis.</li>'
    + '<li>Tu vérifies ses photos, tu confirmes la réception, et son paiement part.</li>'
    + '</ol>'
    + '<p style="color:#666;font-size:13px">Référence de la course : ' + escapeHtml(id) + '</p>';
  await sendMail(course.artisanEmail, '✅ Paiement confirmé — ta livraison est en préparation', html);
  return true;
}

module.exports = { DEPOT, BAREME, TEST_EMAILS, haversineKm, quote, createFromIntent, alertNewCourse, confirmToClient, sendMail, escapeHtml };
