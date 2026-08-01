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
// reversés au livreur (virement direct si branché, sinon virement manuel
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
// Comptes de TEST autorisés à dérouler la chaîne course (dépôt de demande,
// acceptation, paiement en mode test). Le 2e compte a été ajouté le 28/07/2026
// pour tester la discussion À DEUX : quand client et livreur sont le MÊME
// compte, aucune information ne permet de distinguer qui a écrit un message —
// c'est une impossibilité logique, pas une limite de code.
const TEST_EMAILS = ['justforwada@icloud.com', 'contact.piratestools@gmail.com'];

// ── DÉROGATION AUX PIÈCES JUSTIFICATIVES — strictement nominative ───────────
// Demande de l'user (27/07/2026) : pouvoir dérouler TOUTE la chaîne livreur
// (dépôt du dossier → validation admin → courses) sans posséder un vrai avis
// SIRET, une RC Pro ni une carte grise. La dérogation porte UNIQUEMENT sur les
// PIÈCES, uniquement pour les comptes listés ici, et sur rien d'autre :
// l'âge de 18 ans, le véhicule, la cylindrée, les consentements et surtout la
// VALIDATION PAR L'ADMIN restent exigés, pour lui comme pour tout le monde.
// Liste séparée de TEST_EMAILS À DESSEIN : le jour où l'un des deux usages
// disparaît, l'autre ne suit pas en silence.
const PIECES_BYPASS_EMAILS = ['justforwada@icloud.com', 'contact.piratestools@gmail.com'];

// Pièces exigées selon le véhicule — SOURCE DE VÉRITÉ SERVEUR.
// ⚠️ Avant le 27/07/2026 cette exigence n'existait QUE dans le navigateur
// (app.js) : elle se contournait donc entièrement. Elle est désormais
// appliquée ici, où le client ne peut rien changer.
const PIECES_BASE = ['id', 'siret', 'rcpro', 'rib'];
const PIECES_EXTRA = {
  vae: [],
  trottinette: ['rc'],
  scooter: ['permis', 'cg', 'assveh', 'assmarch', 'capacite', 'registre']
};
function piecesRequises(vehicle) {
  return PIECES_BASE.concat(PIECES_EXTRA[vehicle] || []);
}

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

// ── DEMANDE DE COURSE — SANS PAIEMENT (décision user 27/07/2026) ────────────
// Le client dépose une DEMANDE : rien n'est débité, rien n'est promis. Elle
// part en alerte à tous les livreurs. Le premier qui l'accepte ouvre un chat
// avec le client ; ils conviennent eux-mêmes des modalités et du prix (celui
// affiché sur la fiche du livreur). Si ça ne colle pas, l'un ou l'autre
// « remet en ligne » : la demande redevient visible de tous (round + 1, le fil
// précédent devient inaccessible aux deux côtés — voir firestore.rules).
// ⚖️ C'est ce qui nous sort de L7342-1 : la plateforme ne fixe pas le prix, ne
// détient pas les fonds, et n'attribue pas la course — elle met en relation.
function sanitizeLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).map((l) => ({
    key: String((l && l.key) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80),
    qty: Math.max(1, Math.min(99, parseInt(l && l.qty, 10) || 1))
  })).filter((l) => l.key);
}

// ── L'ACCORD — ce que les deux parties ont convenu, noir sur blanc ──────────
// Rédigé dans le chat par l'un, accepté par l'autre. Il fige : le prix de la
// course (convenu ENTRE EUX, jamais par nous), le mode de règlement du
// livreur, la date, l'heure et le point de dépôt.
// ⚖️ Le prix n'est ni proposé ni borné par la plateforme : le champ est libre,
// les bornes ci-dessous ne sont qu'un garde-fou anti-faute de frappe.
/* ⚖️ D-016 volet 2 (31/07/2026) — TROIS modes, et le troisième est le seul qui
   paie le livreur INSTANTANÉMENT. `lien` : le livreur émet lui-même son lien de
   paiement, le client le règle en direct, l'argent arrive sur SON compte. Rien
   ne transite par Pirates Tools — ce qui renforce D-009 (art. L7342-1) plutôt
   que de l'affaiblir : la plateforme ne fixe pas le prix ET ne touche pas
   l'argent de la course.
   ⛔ Le livreur n'est JAMAIS obligé d'ouvrir quoi que ce soit : c'est une
   option parmi trois, et « espèces » reste le défaut. */
const ACCORD_PAIEMENTS = ['virement', 'especes', 'lien'];
const ACCORD_PRIX_MIN = 1;
const ACCORD_PRIX_MAX = 2000;

// Mode de règlement VOULU PAR LE LIVREUR (décision user 28/07/2026 : « c'est au
// livreur de dire comment il veut être payé »). Il vit dans SON profil, plus
// dans l'accord : on ne redemande pas à chaque course une préférence stable.
// Le client qui n'est pas d'accord négocie dans la discussion — le livreur
// change alors son réglage, comme pour ses tarifs.
function sanitizePaiement(v) {
  return ACCORD_PAIEMENTS.includes(v) ? v : '';
}

// L'ACCORD, NOUVELLE FORME (décision user 28/07/2026) — il ne se NÉGOCIE plus
// champ par champ, il ENTÉRINE :
//   • le PRIX vient du LIVREUR seul (le client ne propose jamais de montant ;
//     s'il trouve ça cher, il négocie dans la discussion et le livreur ajuste) ;
//   • le MODE DE RÈGLEMENT vient du PROFIL du livreur (« c'est au livreur de
//     dire comment il veut être payé ») ;
//   • la DATE, l'HEURE, le POINT DE DÉPÔT et les PRÉCISIONS viennent de la
//     COURSE, c'est-à-dire de ce que le client a posé À LA COMMANDE. Ils ne
//     sont plus jamais ressaisis, donc plus jamais contredits.
// ⚠️ `raw` n'apporte QUE le prix : aucune autre valeur du corps client n'est
// lue. C'est ce qui rend impossible qu'un accord raconte autre chose que la
// demande d'origine.
function sanitizeAccord(raw, course, paiementLivreur) {
  const src = raw || {};
  const c = course || {};
  const prix = Math.round(Number(src.prix));
  if (!isFinite(prix) || prix < ACCORD_PRIX_MIN || prix > ACCORD_PRIX_MAX) return null;
  return {
    prix,
    paiement: sanitizePaiement(paiementLivreur) || 'especes',
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')) ? c.date : '',
    hour: /^\d{2}:\d{2}$/.test(String(c.hour || '')) ? c.hour : '',
    when: ['matin', 'apresmidi', 'heure'].includes(c.when) ? c.when : 'matin',
    lieu: String(c.lieu || '').trim().slice(0, 200),
    notes: String(c.notes || '').trim().slice(0, 500)
  };
}

function accordPaiementLabel(p) {
  if (p === 'virement') return 'Facturation classique — virement au livreur';
  if (p === 'lien') return 'Lien de paiement envoyé par le livreur — réglé en direct';
  return 'Espèces, en main propre à la livraison';
}

// Résumé lisible de l'accord (chat, emails, récapitulatif).
function accordSummary(a) {
  if (!a) return '';
  return 'Prix proposé par le livreur : ' + a.prix + ' € · Règlement : ' + accordPaiementLabel(a.paiement)
    + (a.date ? ' · Date : ' + a.date : '')
    + (a.hour ? ' à ' + a.hour : '')
    + (a.lieu ? ' · Point de dépôt : ' + a.lieu : '')
    + (a.notes ? ' · Précisions : ' + a.notes : '');
}

function buildRequest(input, who) {
  const q = quote(input.lat, input.lng);
  if (!q) return null;
  return {
    status: 'en_attente',
    test: true,
    round: 1,                                   // n° de mise en relation (voir course-release)
    chatOpen: false,
    paid: false,                                // AUCUN paiement à la demande
    escrow: null,
    code: String(crypto.randomInt(0, 1000000)).padStart(6, '0'),
    artisanUid: who.uid,
    artisanEmail: who.email || null,
    productKey: 'demande-livraison',
    productTitle: String(input.productTitle || 'Quincaillerie à livrer').slice(0, 200),
    qty: Math.max(1, Math.min(999, parseInt(input.qty, 10) || 1)),
    // Lignes du panier au moment de la demande : {key, qty} SEULEMENT (aucun
    // prix client n'est jamais cru). Sert à reconstruire le paiement de la
    // MARCHANDISE plus tard, même si le panier a été vidé entre-temps —
    // create-payment-intent revalide chaque clé contre le catalogue serveur.
    lines: sanitizeLines(input.lines),
    address: String(input.address || '').slice(0, 200),
    // CONDITIONS POSÉES PAR LE CLIENT À LA COMMANDE (décision user 28/07/2026 :
    // « le client met absolument toutes ces conditions, sauf pour le prix »).
    // Elles vivaient jusqu'ici dans l'ACCORD, donc ressaisies APRÈS coup par
    // l'un ou l'autre : le client redonnait ce qu'il avait déjà dit. Elles
    // appartiennent à la demande — l'accord ne fera plus que les reprendre.
    lieu: String(input.lieu || '').trim().slice(0, 200),
    notes: String(input.notes || '').trim().slice(0, 500),
    lat: q.lat, lng: q.lng, km: q.km, zone: q.zone,
    // `prix` VOLONTAIREMENT ABSENT : le tarif est celui du livreur qui accepte.
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? input.date : '',
    when: ['matin', 'apresmidi', 'heure'].includes(input.when) ? input.when : 'matin',
    hour: /^\d{2}:\d{2}$/.test(String(input.hour || '')) ? input.hour : '',
    createdAt: new Date()
  };
}

// Alerte « demande remise en ligne » (après une annulation de mise en relation).
async function alertCourseAgain(course, id) {
  const subject = '🔁 Course de nouveau disponible — zone ' + course.zone + ' — ' + String(course.address || '').slice(0, 60);
  const html = '<p><strong>Une demande de livraison est de nouveau ouverte.</strong> '
    + 'Le client et le livreur précédent ne se sont pas mis d\'accord.</p>'
    + '<p>📍 ' + escapeHtml(course.address) + ' (' + course.km + ' km de Sainte-Anne — zone ' + course.zone + ')<br>'
    + '📅 ' + (course.date || 'au plus tôt') + '</p>'
    + '<p>Premier arrivé, premier servi : ouvre ton espace livreur sur pirates-tools.com.</p>';
  // DESTINATAIRES : les livreurs VALIDÉS (leur email de dossier), plus les
  // comptes de test et l'owner. Avant, seuls ces deux derniers recevaient
  // l'alerte : un vrai livreur n'était prévenu de RIEN (user 28/07/2026).
  const owner = process.env.OWNER_EMAIL;
  const livreurs = await destinatairesLivreurs(db, 50);
  const dests = Array.from(new Set(
    TEST_EMAILS
      .concat(owner ? [owner] : [])
      .concat(livreurs.map((l) => l.email).filter(Boolean))
  ));
  for (const to of dests) await sendMail(to, subject, html);
  // SMS : court, sans donnée sensible, et seulement si le canal est configuré.
  const sms = '🛵 Pirates Tools — nouvelle course zone ' + course.zone + ' · '
    + String(course.address || '').slice(0, 40) + ' (' + course.km + ' km). '
    + 'Ouvre ton espace livreur pour l\'accepter.';
  for (const l of livreurs) { if (l.phone) await sendSms(l.phone, sms); }
}

// Alerte « nouveau dossier livreur déposé » — l'owner doit le valider dans
// l'admin (onglet Candidatures) pour que le compte devienne livreur.
// Ne contient AUCUNE pièce justificative : uniquement de quoi savoir qu'un
// dossier attend, et de qui.
const VEH_LABEL = { vae: 'Vélo à assistance électrique', trottinette: 'Trottinette électrique', scooter: 'Scooter / Moto' };
async function alertCourierApplication(compte, uid) {
  const veh = VEH_LABEL[compte.vehicle] || compte.vehicle || '—';
  const subject = '🛵 Nouveau dossier livreur — ' + String(compte.displayName || '').slice(0, 60);
  const html = '<p><strong>Un dossier livreur vient d\'être déposé.</strong></p>'
    + '<p>👤 ' + escapeHtml(compte.displayName || '') + '<br>'
    + '✉️ ' + escapeHtml(compte.email || '') + (compte.phone ? '<br>📞 ' + escapeHtml(compte.phone) : '') + '<br>'
    + '🛵 ' + escapeHtml(veh) + (compte.cylindree ? ' — ' + escapeHtml(compte.cylindree) + ' cm³' : '') + '</p>'
    + '<p>À valider dans l\'administration, onglet <strong>Candidatures</strong>. '
    + 'Tant qu\'il n\'est pas validé, ce compte n\'a AUCUN accès livreur.</p>';
  // DESTINATAIRES : les livreurs VALIDÉS (leur email de dossier), plus les
  // comptes de test et l'owner. Avant, seuls ces deux derniers recevaient
  // l'alerte : un vrai livreur n'était prévenu de RIEN (user 28/07/2026).
  const owner = process.env.OWNER_EMAIL;
  const livreurs = await destinatairesLivreurs(db, 50);
  const dests = Array.from(new Set(
    TEST_EMAILS
      .concat(owner ? [owner] : [])
      .concat(livreurs.map((l) => l.email).filter(Boolean))
  ));
  for (const to of dests) await sendMail(to, subject, html);
  // SMS : court, sans donnée sensible, et seulement si le canal est configuré.
  const sms = '🛵 Pirates Tools — nouvelle course zone ' + course.zone + ' · '
    + String(course.address || '').slice(0, 40) + ' (' + course.km + ' km). '
    + 'Ouvre ton espace livreur pour l\'accepter.';
  for (const l of livreurs) { if (l.phone) await sendSms(l.phone, sms); }
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

// ── TARIFS PROPRES AU LIVREUR ───────────────────────────────────────────────
// ⚠️ CADRE JURIDIQUE (docs/METHODE-ENTREPRISE-FISCALITE.md § 5 bis) : la
// plateforme ne DOIT PAS fixer le prix de la course — sinon art. L7342-1
// (responsabilité sociale) et, à partir du 02/12/2026, critère de présomption
// de salariat de la directive (UE) 2024/2831. BAREME n'est donc qu'un REPÈRE
// INDICATIF pré-rempli : chaque livreur saisit SES prix, au-dessus comme en
// dessous, SANS AUCUNE SANCTION (aucun filtre, aucun déclassement, aucun
// retrait ne dépend de ce montant — ni ici ni dans l'affichage client).
// Les bornes ci-dessous ne sont pas un barème imposé : ce sont des garde-fous
// anti-erreur de saisie / anti-abus (0 €, 10 000 €…), volontairement très larges.
const TARIF_MIN = 1;
const TARIF_MAX = 500;

function defaultTarifs() {
  const t = {};
  BAREME.forEach((b) => { t[b.zone] = b.prix; });
  return t;
}

// Nettoie l'objet {1..4: prix} reçu du client. Toute zone absente/illisible
// retombe sur le repère indicatif. Retourne TOUJOURS les 4 zones.
function sanitizeTarifs(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  BAREME.forEach((b) => {
    const n = Math.round(Number(src[b.zone] != null ? src[b.zone] : src[String(b.zone)]));
    out[b.zone] = (isFinite(n) && n >= TARIF_MIN && n <= TARIF_MAX) ? n : b.prix;
  });
  return out;
}

// ── HORAIRES DE SERVICE DU LIVREUR ──────────────────────────────────────────
// Deux heures, début et fin, choisies par le livreur. Elles rendent son état
// AUTOMATIQUE : hors de sa plage, il n'est plus « en service », même s'il a
// oublié de couper son interrupteur.
//
// ⏰ FUSEAU — LE PIÈGE À NE PAS MANQUER. Ce serveur tourne en UTC ; la
// Guadeloupe est à UTC−4 et ne change JAMAIS d'heure (ni été ni hiver). Sans
// conversion explicite, un livreur « 08:00–18:00 » serait vu en service de
// 04:00 à 14:00 heure locale. On convertit donc ici, une fois, et le client
// fait le même calcul (parité vérifiée en CI par scripts/check-horaires.js).
const TZ_GP_OFFSET = -4;                       // heures par rapport à UTC

// 'HH:MM' → minutes depuis minuit, ou null si la valeur n'est pas une heure.
function hhmmEnMinutes(v) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(v || ''));
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59)) return null;
  return h * 60 + mi;
}

// Minutes écoulées depuis minuit, EN GUADELOUPE, pour un instant donné.
function minutesLocalesGP(now) {
  const t = now instanceof Date ? now : new Date(now || Date.now());
  const utc = t.getUTCHours() * 60 + t.getUTCMinutes();
  return ((utc + TZ_GP_OFFSET * 60) % 1440 + 1440) % 1440;
}

// Le livreur est-il DANS sa plage horaire à cet instant ?
// Pas d'horaires renseignés → on ne contraint rien (true).
// Plage à cheval sur minuit (22:00 → 02:00) : gérée explicitement.
function dansPlageHoraire(hDebut, hFin, now) {
  const d = hhmmEnMinutes(hDebut), f = hhmmEnMinutes(hFin);
  if (d === null || f === null) return true;
  if (d === f) return true;                    // 24 h/24
  const m = minutesLocalesGP(now);
  return (d < f) ? (m >= d && m < f) : (m >= d || m < f);
}

// ÉTAT « EN SERVICE » — SOURCE DE VÉRITÉ UNIQUE.
// Deux conditions cumulatives, et l'ordre du raisonnement compte :
//   1. le livreur a allumé son interrupteur (il décide, on ne décide pas
//      pour lui — c'est aussi ce qui le distingue d'un salarié planifié) ;
//   2. l'heure locale est dans sa plage — c'est la part automatique.
function enService(c, now) {
  if (!c || !c.available) return false;
  return dansPlageHoraire(c.hDebut, c.hFin, now);
}

// Normalise les horaires reçus du client. Les deux doivent être valides, sinon
// on considère qu'il n'y a pas d'horaires (et l'interrupteur seul décide).
function sanitizeHoraires(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const d = hhmmEnMinutes(src.hDebut), f = hhmmEnMinutes(src.hFin);
  if (d === null || f === null) return { hDebut: '', hFin: '' };
  return { hDebut: String(src.hDebut), hFin: String(src.hFin) };
}

// Miroir PUBLIC du profil livreur (couriers_public/{uid}) : la fiche que les
// clients voient dans l'annuaire. Écrit par l'Admin SDK UNIQUEMENT (règles
// Firestore : lecture publique, écriture interdite au client) — le KYC, les
// pièces et l'email restent dans couriers/{uid}, jamais publiés.
async function mirrorCourierPublic(db, uid, patch) {
  if (!db || !uid) return;
  await db.collection('couriers_public').doc(uid).set(
    Object.assign({ uid, updatedAt: new Date() }, patch || {}),
    { merge: true }
  );
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

// ── SMS (canal OPTIONNEL) ───────────────────────────────────────────────────
// Demande user 28/07/2026 : prévenir le livreur par SMS en plus de l'email.
// Aucun fournisseur n'était branché sur le projet : le canal est donc écrit
// ici mais reste TOTALEMENT INERTE tant que les variables d'environnement ne
// sont pas posées — exactement comme Resend au début (pas de clé, pas d'envoi,
// aucune erreur). Twilio est retenu : simple HTTP + Basic auth, zéro dépendance.
// Variables attendues sur Vercel : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_FROM (numéro émetteur au format +…).
// ⚠️ Le numéro n'est JAMAIS journalisé (RGPD) : on ne logue que l'échec.
function telE164(brut) {
  const t = String(brut || '').replace(/[^\d+]/g, '');
  if (!t) return '';
  if (t.startsWith('+')) return t.length >= 8 && t.length <= 16 ? t : '';
  // Guadeloupe : 0690…/0590… sur 10 chiffres → +590 sans le 0 initial.
  if (/^0\d{9}$/.test(t)) return '+590' + t.slice(1);
  return '';
}

async function sendSms(to, texte) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return false;      // canal non configuré : silence
  const num = telE164(to);
  if (!num) return false;
  try {
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: num, From: from, Body: String(texte).slice(0, 300) })
    });
    if (!r.ok) { console.warn('[courses] sms refusé:', r.status); return false; }
    return true;
  } catch (e) { console.warn('[courses] sms échoué:', e.message); return false; }
}

// Livreurs VALIDÉS à prévenir : { email, phone }. Jamais les dossiers en
// attente — un compte non validé ne peut de toute façon pas accepter.
// Plafonné : une alerte ne doit pas se transformer en campagne d'envoi.
async function destinatairesLivreurs(db, max) {
  if (!db) return [];
  try {
    const snap = await db.collection('couriers').where('kycStatus', '==', 'valide').limit(max || 50).get();
    const out = [];
    snap.forEach((d) => {
      const c = d.data() || {};
      if (c.email || c.phone) out.push({ email: c.email || '', phone: c.phone || '' });
    });
    return out;
  } catch (e) { console.warn('[courses] destinataires livreurs:', e.message); return []; }
}

// Alerte « nouvelle course » aux livreurs de test + owner.
async function alertNewCourse(course, id, db) {
  const whenTxt = course.when === 'heure' ? ('à ' + course.hour) : (course.when === 'matin' ? 'le matin' : "l'après-midi");
  // Deux régimes cohabitent : la DEMANDE sans paiement (nouveau flux, aucun
  // prix imposé — c'est le tarif du livreur qui s'appliquera) et l'ancienne
  // course payée d'avance (conservée pour les courses déjà en base).
  const paye = !!course.paid && course.prix;
  const subject = (paye ? '🛵 Nouvelle course zone ' : '🛵 Nouvelle demande de livraison — zone ')
    + course.zone + (paye ? ' — ' + course.prix + ' €' : '') + ' — ' + String(course.address || '').slice(0, 60);
  const html = '<p><strong>' + (paye ? 'Nouvelle course de livraison (TEST) — payée en ligne ✅' : 'Nouvelle demande de livraison (TEST)') + '</strong></p>'
    + '<p>' + escapeHtml(course.productTitle) + (course.qty > 1 ? ' × ' + course.qty : '') + '<br>'
    + '📍 ' + escapeHtml(course.address) + ' (' + course.km + ' km de Sainte-Anne — zone ' + course.zone + ')<br>'
    + '📅 ' + (course.date || 'au plus tôt') + ' ' + whenTxt + '<br>'
    + (paye
      ? '💶 <strong>' + course.prix + ' €</strong> pour le livreur — gelés, débloqués à la confirmation de livraison (photo à l\'appui).</p>'
      : '💶 <strong>Ton tarif zone ' + course.zone + '</strong> s\'applique — celui que TU as inscrit sur ta fiche. Rien n\'est imposé.</p>')
    + '<p>Ouvre ton espace livreur sur pirates-tools.com pour accepter la course (premier arrivé, premier servi). '
    + 'Accepter ouvre une discussion directe avec le client pour convenir des modalités.</p>';
  // DESTINATAIRES : les livreurs VALIDÉS (leur email de dossier), plus les
  // comptes de test et l'owner. Avant, seuls ces deux derniers recevaient
  // l'alerte : un vrai livreur n'était prévenu de RIEN (user 28/07/2026).
  const owner = process.env.OWNER_EMAIL;
  const livreurs = await destinatairesLivreurs(db, 50);
  const dests = Array.from(new Set(
    TEST_EMAILS
      .concat(owner ? [owner] : [])
      .concat(livreurs.map((l) => l.email).filter(Boolean))
  ));
  for (const to of dests) await sendMail(to, subject, html);
  // SMS : court, sans donnée sensible, et seulement si le canal est configuré.
  const sms = '🛵 Pirates Tools — nouvelle course zone ' + course.zone + ' · '
    + String(course.address || '').slice(0, 40) + ' (' + course.km + ' km). '
    + 'Ouvre ton espace livreur pour l\'accepter.';
  for (const l of livreurs) { if (l.phone) await sendSms(l.phone, sms); }
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

module.exports = {
  DEPOT, BAREME, TEST_EMAILS, PIECES_BYPASS_EMAILS, piecesRequises, TARIF_MIN, TARIF_MAX,
  haversineKm, quote, buildRequest, createFromIntent,
  alertNewCourse, alertCourseAgain, alertCourierApplication, confirmToClient, sendMail, escapeHtml,
  sendSms, telE164, destinatairesLivreurs,
  defaultTarifs, sanitizeTarifs, mirrorCourierPublic,
  TZ_GP_OFFSET, hhmmEnMinutes, minutesLocalesGP, dansPlageHoraire, enService, sanitizeHoraires,
  sanitizeLines, sanitizeAccord, sanitizePaiement, accordSummary, accordPaiementLabel, ACCORD_PAIEMENTS
};
