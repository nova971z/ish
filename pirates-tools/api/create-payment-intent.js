// POST /api/create-payment-intent — Creates a Stripe PaymentIntent for Elements.
// Requires STRIPE_SECRET_KEY on Vercel.
//
// SECURITY: prices are resolved SERVER-SIDE from the catalogue. The client sends
// only { key, qty } per line (+ territory); any price sent by the client is
// ignored. This closes the "pay 1 cent for anything" hole — the amount charged
// can never be influenced by the browser.

'use strict';

var catalog = require('./_lib/catalog');
var pricing = require('./_lib/pricing');
var paiementSocle = require('./_lib/paiement');
var paiementMeta = require('./_lib/paiement-meta');
var rl = require('./_lib/ratelimit');
var loyalty = require('./_lib/loyalty');
var postal = require('./_lib/postal');
var coursesLib = require('./_lib/courses');
var fbLib = require('./_lib/firebase');
var http = require('./_lib/http');   // origineSure : d'où revient le client après paiement
var getFirebase = fbLib.getFirebase;

var MAX_QTY_PER_LINE = 99;
var MAX_LINES = 50;

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ⚠️ COUTURE PAIEMENT (31/07/2026) — on ne parle plus à Stripe directement.
  // Le fournisseur actif est choisi par PAYMENT_PROVIDER (défaut : stripe).
  // Voir api/_lib/paiement/index.js et docs/PLAN-REVOLUT.md.
  //
  // ⛔ Cette couche ne touche NI au prix, NI au territoire fiscal, NI à la
  // remise. Tout cela reste calculé plus bas, côté serveur, à l'identique :
  // le fournisseur de paiement reçoit un montant déjà arrêté et ne le discute
  // pas. Changer de fournisseur ne peut donc pas changer ce qu'un client paie.
  var paiement = paiementSocle.fournisseur();
  if (!paiement.estConfigure()) {
    return res.status(503).json({
      ok: false,
      error: 'Paiement non configuré (fournisseur : ' + paiement.nom() + ').'
    });
  }

  // A4 — endpoint public : borne la création d'objets Stripe (pollution
  // dashboard, alertes fraude). 20/h/IP = généreux pour un client légitime
  // qui re-essaie sa carte ; fail-open si Firestore indisponible (documenté).
  if (!(await rl.allow('payment', rl.clientIp(req), 20, 3600))) {
    return res.status(429).json({ ok: false, error: 'Trop de tentatives. Réessayez dans une heure.' });
  }

  try {
    var body = req.body || {};
    var items = body.items;
    var customerEmail = body.customerEmail;

    // uid AUTHENTIFIÉ (S2) : vérifié depuis l'ID token Firebase du header
    // Authorization, jamais depuis le corps de la requête. C'est ce qui empêche
    // un attaquant de réclamer la remise fidélité d'autrui ou de polluer son
    // historique en envoyant un uid arbitraire. Absent/invalide → null (aucune
    // remise, aucun matching par uid). Le body.uid éventuel est IGNORÉ.
    var uid = await fbLib.verifyUid(req);

    // Territoire fiscal (H3) : le code postal de livraison est OBLIGATOIRE et
    // constitue la SEULE source du territoire de taxation, re-dérivé côté
    // serveur (postal.territoryFromPostal). Fini le mode « déclaratif » :
    // auparavant, un appel API direct sans postalCode retombait sur
    // body.territory, permettant de payer au taux Mayotte (TVA 0 %, octroi 0 %)
    // ≈ −19 % pour n'importe quelle livraison. Le client (modale adresse-
    // d'abord) envoie toujours le CP. body.territory est désormais IGNORÉ pour
    // le montant débité.
    var postalCode = typeof body.postalCode === 'string' ? body.postalCode.trim().slice(0, 12) : '';
    if (!postalCode) {
      return res.status(400).json({ ok: false, error: 'Code postal de livraison requis.' });
    }
    var territory = postal.territoryFromPostal(postalCode);
    if (!territory) {
      return res.status(400).json({
        ok: false,
        error: 'Livraison uniquement en Guadeloupe, Martinique, Guyane, La Réunion et Mayotte (code postal 971xx–976xx).'
      });
    }
    var territorySource = 'postal';

    // Adresse de livraison (facultative côté API, envoyée par la modale) :
    // attachée au PaymentIntent (visible Stripe/antifraude, relue par le
    // webhook pour le contrôle détectif). Chaînes bornées, jamais bloquant.
    function cleanStr(s, max) { return typeof s === 'string' ? s.trim().slice(0, max) : ''; }
    var shipIn = body.shipping || {};
    /* ⛔ TÉLÉPHONE DE LIVRAISON (01/08/2026). Il manquait entièrement du
       parcours : un livreur devant une porte fermée n'avait aucun moyen de
       joindre le client, le colis repartait, et la vente était à refaire.
       ⚠️ Donnée personnelle (J3) : elle voyage avec la COMMANDE parce que
       l'exécution du contrat l'exige, et nulle part ailleurs — surtout pas
       dans un journal serveur. Bornée à 24 caractères. */
    var shipPhone = cleanStr(shipIn.phone, 24);
    var shipping = null;
    if (postalCode && cleanStr(shipIn.line1, 200)) {
      shipping = {
        name: cleanStr(shipIn.name, 120) || 'Client Pirates Tools',
        address: {
          line1: cleanStr(shipIn.line1, 200),
          city: cleanStr(shipIn.city, 120),
          postal_code: postalCode,
          country: 'FR'
        }
      };
    }

    // Course de livraison quincaillerie (facultative) : zone et PRIX recalculés
    // SERVEUR depuis lat/lng — jamais depuis un montant client. Les frais sont
    // reversés à 100 % au livreur après confirmation (voir _lib/courses.js).
    var courseIn = body.course || null;
    var courseQuote = null;
    if (courseIn) {
      if (territory !== '971') {
        return res.status(400).json({ ok: false, error: 'Livraison sur chantier disponible en Guadeloupe uniquement pour le moment.' });
      }
      courseQuote = coursesLib.quote(courseIn.lat, courseIn.lng);
      if (!courseQuote) {
        return res.status(400).json({ ok: false, error: 'Adresse hors zone de livraison (max 46 km depuis Sainte-Anne).' });
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Cart is empty' });
    }
    if (items.length > MAX_LINES) {
      return res.status(400).json({ ok: false, error: 'Too many items' });
    }

    // Resolve every line against the server catalogue.
    var products = await catalog.loadCatalog();
    var totalCents = 0;
    var description = [];
    var validatedLines = []; // lignes {key, qty} VALIDÉES (clé résolue, qty bornée)

    for (var i = 0; i < items.length; i++) {
      var raw = items[i] || {};
      var key = raw.key || raw.id || raw.slug;
      var qty = parseInt(raw.qty, 10);
      if (!isFinite(qty) || qty < 1) qty = 1;
      if (qty > MAX_QTY_PER_LINE) qty = MAX_QTY_PER_LINE;

      var product = catalog.findByKey(products, key);
      if (!product) {
        return res.status(400).json({ ok: false, error: 'Produit introuvable', key: String(key || '') });
      }

      // Option coffret TSTAK : surcoût calculé SERVEUR (jamais le client), 0 si
      // produit non éligible même si le client force le flag.
      var coffret = (raw.coffret === true || raw.coffret === 'true' || raw.coffret === 1) && pricing.coffretEligible(product);
      var unit = pricing.unitCents(product, territory) + (coffret ? pricing.coffretSurchargeCents(product) : 0);
      totalCents += unit * qty;
      description.push((product.title || 'Produit') + (coffret ? ' (coffret)' : '') + ' x' + qty);
      validatedLines.push({ key: product.slug || product.id || String(key), qty: qty, coffret: coffret });
    }

    if (totalCents < 50) {
      return res.status(400).json({ ok: false, error: 'Montant minimum : 0,50 €' });
    }

    // Remise fidélité SERVEUR : calculée depuis le journal payments/ (écrit
    // uniquement par le webhook — infalsifiable côté client), jamais depuis un
    // état client. Fail-open 0 % (un souci de fidélité ne bloque pas la vente).
    var fb = getFirebase();
    var loyaltyQuote = uid && fb.db
      ? await loyalty.quote(fb.db, uid, totalCents)
      : { pct: 0, discountCents: 0, verifiedSpendCents: 0, tierKey: 'bronze', tierLabel: 'Bronze' };
    var amountCents = totalCents - loyaltyQuote.discountCents;
    if (amountCents < 50) {
      // Remise ramenant sous le minimum Stripe : on la tronque plutôt que
      // d'échouer un paiement légitime.
      loyaltyQuote = { pct: 0, discountCents: 0, verifiedSpendCents: loyaltyQuote.verifiedSpendCents, tierKey: loyaltyQuote.tierKey, tierLabel: loyaltyQuote.tierLabel };
      amountCents = totalCents;
    }

    // Frais de livraison chantier : ajoutés APRÈS la remise fidélité — la
    // remise ne porte que sur les produits, les frais partent à 100 % au
    // livreur (gelés jusqu'à confirmation de réception par le client).
    var deliveryCents = courseQuote ? courseQuote.prix * 100 : 0;
    amountCents += deliveryCents;
    var courseMeta = {};
    if (courseQuote) {
      var totalQty = validatedLines.reduce(function (s, l) { return s + l.qty; }, 0);
      description.push('Livraison chantier zone ' + courseQuote.zone);
      courseMeta = {
        courseZone: String(courseQuote.zone),
        courseKm: String(courseQuote.km),
        courseFeeCents: String(deliveryCents),
        courseAddress: cleanStr(courseIn.address, 200),
        courseLat: String(courseQuote.lat),
        courseLng: String(courseQuote.lng),
        courseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(courseIn.date || '')) ? courseIn.date : '',
        courseWhen: ['matin', 'apresmidi', 'heure'].indexOf(courseIn.when) !== -1 ? courseIn.when : 'matin',
        courseHour: /^\d{2}:\d{2}$/.test(String(courseIn.hour || '')) ? courseIn.hour : '',
        courseQty: String(totalQty)
      };
    }

    // Paiement de la MARCHANDISE rattaché à une demande de livraison (flux
    // « demande de course », 27/07/2026) : on ne fait que MARQUER le lien.
    // ⚠️ Aucun frais de livraison n'est ajouté ici — le prix de la course est
    // convenu entre le client et le livreur et ne transite PAS par nous.
    // contact.js (course-goods-paid) relit ce marqueur pour vérifier que le
    // paiement correspond bien à CETTE course avant de la confirmer.
    var courseRefMeta = {};
    var courseRefIn = cleanStr(body.courseId, 64).replace(/[^A-Za-z0-9_-]/g, '');
    if (courseRefIn) courseRefMeta = { courseRef: courseRefIn };

    // A2 : les lignes {key, qty} voyagent dans la metadata (chunkées — limite
    // Stripe 500 car./valeur). Le webhook payment_intent.succeeded les relit
    // pour reconstruire la commande côté serveur (email détaillé + journal),
    // ce qu'un PaymentIntent ne permet pas nativement (pas de line_items).
    var itemsMeta = paiementMeta.chunkItems(validatedLines) || {};

    // Contrat NEUTRE (couture) : le fournisseur reçoit un montant déjà arrêté
    // et des données à transporter. Il ne décide de rien.
    /* ⛔ OÙ LE CLIENT ATTERRIT APRÈS AVOIR PAYÉ — le trou du 01/08/2026.
       Personne ne passait `urlRetour`, donc aucun `redirect_url` ne partait
       chez Revolut. Conséquence : le client qui paie sur la PAGE HÉBERGÉE
       (le repli quand le champ carte ne charge pas, et le seul chemin sur
       certains navigateurs) restait sur checkout.revolut.com. Il ne revenait
       jamais, ne voyait jamais /merci, et sa commande n'était pas finalisée
       côté navigateur. Le webhook sauvait la vente côté serveur — le client,
       lui, voyait une page qui n'était pas la nôtre et repartait.

       ⚠️ Sans origine sûre, on n'invente rien : pas de `redirect_url`. Le
       paiement fonctionne toujours, seul le retour manque — dégradation, pas
       panne. Stripe ignore ce paramètre (sa redirection passe par
       `return_url`, posé côté navigateur) : la couture l'absorbe. */
    var origineRetour = http.origineSure(req);

    var cree = await paiement.creerPaiement({
      montantCents: amountCents,
      devise: 'eur',
      urlRetour: origineRetour ? (origineRetour + '/#/merci') : null,
      description: description.join(', ').substring(0, 500),
      email: customerEmail || null,
      livraison: shipping ? {
        nom: shipping.name,
        ligne1: shipping.address.line1,
        ville: shipping.address.city,
        codePostal: shipping.address.postal_code,
        pays: shipping.address.country
      } : null,
      metadata: Object.assign({
        source: 'pirates-tools',
        territory: String(territory),
        territorySource: territorySource,
        postalCode: postalCode,
        itemCount: String(validatedLines.length),
        serverTotalEur: (amountCents / 100).toFixed(2),
        grossTotalEur: (totalCents / 100).toFixed(2),
        loyaltyPct: String(loyaltyQuote.pct),
        loyaltyDiscountCents: String(loyaltyQuote.discountCents)
      }, uid ? { uid: uid } : {}, shipPhone ? { shipPhone: shipPhone } : {},
         courseMeta, courseRefMeta, itemsMeta)
    });

    return res.status(200).json({
      ok: true,
      // Nom historique conservé : le front l'attend, et renommer un champ de
      // l'API publique pendant une migration de paiement, c'est deux risques
      // au lieu d'un. Le renommage se fera à l'étape 4, avec le front.
      clientSecret: cree.jetonClient,
      paymentIntentId: cree.id,
      /* ⚠️ QUEL WIDGET MONTER — ajouté le 31/07/2026 (étape 4).
         Le front ne doit PAS deviner le fournisseur : c'est le serveur qui
         décide (PAYMENT_PROVIDER), et lui seul sait quel jeton il vient de
         fabriquer. Un front qui choisirait tout seul monterait un jour le
         widget Stripe sur un jeton Revolut : le formulaire ne s'afficherait
         pas, et le message d'erreur ne dirait pas pourquoi.
         `urlHebergee` : Revolut fournit une page de paiement dès la création de
         l'ordre ; Stripe Elements n'en a pas (null). Repli utile si le widget
         refuse de se charger. */
      fournisseur: paiement.nom(),
      urlHebergee: cree.urlHebergee || null,
      /* ⛔ QUEL ENVIRONNEMENT — le front le DEVINAIT, en cherchant la
         sous-chaîne « sandbox » dans `urlHebergee`. Deux façons de se tromper,
         aucune visible : si `urlHebergee` est absente (le fournisseur ne la
         renvoie pas, ou le champ change de nom), on chargeait le SDK de
         PRODUCTION avec un jeton de bac à sable — formulaire mort — et le
         repli n'avait pas d'URL non plus, donc double panne muette.
         Le serveur sait ; il le dit. Ce n'est pas un secret : le domaine du
         script le révèle de toute façon au premier coup d'œil. */
      modeTest: paiement.modeTest(),
      amount: amountCents,   // montant DÉBITÉ (remise déduite + livraison) — le client DOIT afficher celui-ci
      gross: totalCents,     // total plein tarif avant remise (produits seuls)
      deliveryCents: deliveryCents,
      course: courseQuote ? { zone: courseQuote.zone, km: courseQuote.km, prix: courseQuote.prix } : null,
      loyalty: {
        pct: loyaltyQuote.pct,
        discountCents: loyaltyQuote.discountCents,
        verifiedSpendCents: loyaltyQuote.verifiedSpendCents,
        tierKey: loyaltyQuote.tierKey,
        tierLabel: loyaltyQuote.tierLabel
      }
    });
  } catch (err) {
    console.error('[api/create-payment-intent] Stripe error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur création du paiement' });
  }
};
