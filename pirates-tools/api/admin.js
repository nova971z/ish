// POST /api/admin — Admin CRUD for product overrides.
// Auth : header "x-admin-secret" must match env ADMIN_SECRET.
// Storage : Firestore collection `product_overrides/{id}`.
// Without Firebase configured, returns 503 with a helpful message.

const auth = require('./_lib/auth');
const http = require('./_lib/http');
const firebase = require('./_lib/firebase');
const analytics = require('./_lib/analytics');
const catalog = require('./_lib/catalog');
const priceParse = require('./_lib/price-parse');
const priceModel = require('./_lib/pricing-model');
const priceConfig = require('./_lib/pricing-config');

module.exports = async function handler(req, res) {
  http.applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── Auth ──────────────────────────────────────────────────
  // ⚠️ Le traqueur de prix a sa PROPRE porte, traitée AVANT celle de
  // l'administration. Raison mesurée le 31/07/2026 : `requireAdmin` s'exécutait
  // ici, en tête, et refusait le raccourci iPad depuis le retrait
  // d'`ADMIN_SECRET` (A5). Le raccourci recevait « Invalid admin credentials »
  // et n'atteignait JAMAIS le reste du fichier — pas même le message « POST
  // uniquement ». Les prix fournisseur ont cessé d'être relevés EN SILENCE.
  //
  // ⚠️ J4 — ce point d'entrée décide de PRIX DE VENTE. Le prix relevé chez le
  // fournisseur est un COÛT, jamais un prix de référence affichable : rien ici
  // ne doit produire un prix barré ni une réduction annoncée (D-004).
  const estWatch = (req.query && req.query.type) === 'price-watch';
  const denied = estWatch ? await auth.requireWatch(req) : await auth.requireAdmin(req);
  if (denied) return res.status(denied.status).json({ ok: false, error: denied.error });

  // ── Firestore (shared initializer) ────────────────────────
  const { admin, db } = firebase.getFirebase();
  if (!db) {
    return res.status(503).json({
      ok: false,
      error: 'Firestore not configured. Set FIREBASE_SERVICE_ACCOUNT env var.'
    });
  }

  // ── GET : list overrides OR recent orders ────────────────
  if (req.method === 'GET') {
    const type = (req.query && req.query.type) || 'overrides';

    // ── GET ?type=export-catalogue : le catalogue FUSIONNÉ, prêt à remplacer
    //    products.json ───────────────────────────────────────────────────────
    // POURQUOI CE POINT D'ENTRÉE EXISTE
    // Le site a DEUX sources de prix : `products.json` (versionné, servi par le
    // CDN) et `product_overrides` (Firestore, écrit par le traqueur). Le client
    // peint d'abord le fichier statique, puis passe à /api/products sous 6 s —
    // si l'API traîne ou échoue, le visiteur GARDE le prix du fichier. Comme
    // rien ne renvoie jamais les overrides vers le fichier, l'écart ne fait que
    // croître : c'est la cause des « prix différents partout ».
    //
    // Cet export rend la fusion telle qu'elle doit être écrite dans le fichier.
    // On la récupère, on la commite, et le statique cesse de mentir.
    //
    // ⚠️ `loadPublicCatalog()` et non `loadCatalog()` : les champs internes
    // (coût d'achat fournisseur, marge appliquée) ne doivent JAMAIS entrer dans
    // un fichier servi publiquement. Publier `priceSrcTTC`, ce serait publier
    // le prix d'achat de chaque produit — et ce serait irréversible, le fichier
    // partant sur le CDN puis dans l'historique git.
    if (type === 'export-catalogue') {
      try {
        const fusion = await catalog.loadPublicCatalog();
        const INTERNES = ['priceSource', 'priceSrcTTC', 'priceCheckedAt', 'priceMarkup',
          'priceMode', 'priceRecomputedAt', 'priceCostOrigin', 'hidden'];
        const fuites = [];
        fusion.forEach(function (p) {
          INTERNES.forEach(function (k) { if (k in p && fuites.indexOf(k) === -1) fuites.push(k); });
        });
        if (fuites.length) {
          return res.status(500).json({
            ok: false,
            error: 'Export refusé : champs internes présents (' + fuites.join(', ')
              + '). Publier le prix d\'achat serait irréversible.'
          });
        }
        return res.status(200).json({ ok: true, count: fusion.length, products: fusion });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
    // FAIL-LOUD : price-watch est POST uniquement (corps JSON {text} + en-tête
    // x-admin-secret — voir docs/TRAQUEUR-URLS.md). Avant, un GET retombait
    // SILENCIEUSEMENT sur la liste des overrides → un raccourci iPad mal
    // configuré (méthode restée GET) « réussissait » sans jamais mettre à jour
    // un seul prix. Désormais l'erreur est explicite dans la réponse.
    if (type === 'price-watch') {
      return res.status(405).json({
        ok: false,
        error: 'price-watch = POST uniquement. Raccourci : Méthode POST, Corps JSON { text: <contenu cotébrico> }, en-tête x-admin-secret. Voir docs/TRAQUEUR-URLS.md.'
      });
    }
    try {
      if (type === 'orders') {
        // 50 dernières commandes, TOUS clients (collectionGroup).
        // Tri sur `date` : c'est LE champ horodatage que le client écrit
        // (serverTimestamp, app.js — la allowlist firestore.rules n'autorise
        // d'ailleurs que lui). L'ancien orderBy('createdAt') portait sur un
        // champ qu'aucune commande n'a jamais eu → Firestore excluait tous les
        // docs → liste structurellement vide. Nécessite le fieldOverride
        // COLLECTION_GROUP DESCENDING sur orders.date (firestore.indexes.json).
        const ordersSnap = await db.collectionGroup('orders')
          .orderBy('date', 'desc')
          .limit(50)
          .get();
        const orders = [];
        ordersSnap.forEach((doc) => {
          const d = doc.data();
          orders.push({
            id: doc.id,
            status: d.status || 'pending',
            customerEmail: d.customerEmail || d.email || '',
            total: typeof d.total === 'number' ? d.total : (typeof d.amount === 'number' ? d.amount : null),
            createdAt: d.date && d.date.toMillis ? d.date.toMillis() : (d.date || null),
            stripeSessionId: d.stripeSessionId || ''
          });
        });
        return res.status(200).json({ ok: true, orders: orders });
      }

      // ── Statistiques (dashboard analytics maison) ──────────────
      if (type === 'stats') {
        // Lecture simple sans tri : Firestore N'AUTORISE PAS orderBy(documentId,
        // 'desc') (« does not support descending key scans ») → ça faisait
        // planter la requête, et le dashboard affichait 0 alors que les données
        // existaient. summarize() somme et trie côté serveur ; toutes ces
        // collections sont naturellement bornées (analytics_daily = 1 doc/jour,
        // purgé > 14 mois ; le reste 1 doc/produit, /cible, /pays).
        const readAll = async (coll) => {
          const s = await db.collection(coll).get();
          const out = [];
          s.forEach((d) => out.push(Object.assign({ id: d.id }, d.data())));
          return out;
        };
        const daily = await readAll('analytics_daily');
        const products = await readAll('analytics_products');
        const clicks = await readAll('analytics_clicks');
        const geo = await readAll('analytics_geo');
        return res.status(200).json({ ok: true, stats: analytics.summarize(daily, products, clicks, geo) });
      }

      // ── Cartes client (comptes créés) ──────────────────────────
      if (type === 'clients') {
        const usersSnap = await db.collection('users').limit(200).get();
        const clients = [];
        for (const u of usersSnap.docs) {
          const d = u.data() || {};
          let orderCount = 0;
          try {
            const agg = await db.collection('users/' + u.id + '/orders').count().get();
            orderCount = agg.data().count;
          } catch (_) { orderCount = 0; }
          clients.push({
            uid: u.id,
            name: d.name || '',
            email: d.email || '',
            phone: d.phone || '',
            address: d.address || '',
            avatar: d.avatar || '',
            loyalty: (d.loyalty && typeof d.loyalty === 'object') ? d.loyalty : null,
            orderCount: orderCount,
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt || null)
          });
        }
        clients.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return res.status(200).json({ ok: true, clients: clients, total: clients.length });
      }

      // ── Config de tarification (marge cible) ───────────────────
      if (type === 'pricing-config') {
        const cfg = await priceConfig.load();
        return res.status(200).json({ ok: true, config: cfg });
      }

      // ── Synthèse comptable (compte de résultat) ────────────────
      // Revenus RÉELS lus du journal `payments` (Stripe) ; structure de résultat
      // ESTIMÉE par le modèle de marge (à valider par l'expert-comptable).
      if (type === 'accounting') {
        const accounting = require('./_lib/accounting');
        const cfg = await priceConfig.load();
        const paySnap = await db.collection('payments').get();
        const payments = [];
        paySnap.forEach((doc) => {
          const d = doc.data() || {};
          payments.push({
            amountCents: typeof d.amountCents === 'number' ? d.amountCents : 0,
            cogsHtCents: (typeof d.cogsHtCents === 'number') ? d.cogsHtCents : null,
            stripeFeeCents: (typeof d.stripeFeeCents === 'number') ? d.stripeFeeCents : null,
            status: d.status || '',
            territoryDeclared: d.territoryDeclared || d.territoryFromAddress || null,
            recordedAtMs: d.recordedAt && d.recordedAt.toMillis ? d.recordedAt.toMillis() : null,
            linesDetail: Array.isArray(d.linesDetail) ? d.linesDetail : []
          });
        });
        const chSnap = await db.collection('charges').get();
        const charges = [];
        chSnap.forEach((doc) => {
          const d = doc.data() || {};
          charges.push({ id: doc.id, amountHt: Number(d.amountHt) || 0, tvaDeductible: Number(d.tvaDeductible) || 0, category: d.category || 'autre', label: d.label || '', dateMs: d.dateMs || null });
        });
        return res.status(200).json({ ok: true, accounting: accounting.synthesize(payments, charges, cfg), charges: charges });
      }

      // ── Identité vendeur pour les factures ─────────────────────
      if (type === 'invoice-config') {
        const invoice = require('./_lib/invoice');
        const doc = await db.collection('config').doc('invoice').get();
        const seller = Object.assign({}, invoice.DEFAULT_SELLER, doc.exists ? doc.data() : {});
        return res.status(200).json({ ok: true, seller: seller });
      }

      // ── Liste des factures (paiements réussis) ─────────────────
      if (type === 'invoices') {
        const snap = await db.collection('payments').get();
        const list = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (d.status !== 'succeeded') return;
          list.push({
            id: doc.id, invoiceNumber: d.invoiceNumber || null,
            amountCents: d.amountCents || 0, customerEmail: d.customerEmail || '',
            customerName: d.customerName || '',
            recordedAtMs: d.recordedAt && d.recordedAt.toMillis ? d.recordedAt.toMillis() : (d.invoiceDateMs || null)
          });
        });
        list.sort((a, b) => (b.recordedAtMs || 0) - (a.recordedAtMs || 0));
        return res.status(200).json({ ok: true, invoices: list });
      }

      // ── Génère la facture (HTML imprimable) d'un paiement ──────
      if (type === 'invoice') {
        const invoice = require('./_lib/invoice');
        const id = (req.query && req.query.id) || '';
        if (!id) return res.status(400).json({ ok: false, error: 'id manquant' });
        const doc = await db.collection('payments').doc(String(id)).get();
        if (!doc.exists) return res.status(404).json({ ok: false, error: 'paiement introuvable' });
        const p = doc.data() || {};
        const cfgDoc = await db.collection('config').doc('invoice').get();
        const seller = Object.assign({}, invoice.DEFAULT_SELLER, cfgDoc.exists ? cfgDoc.data() : {});
        const payment = Object.assign({}, p, { recordedAtMs: p.recordedAt && p.recordedAt.toMillis ? p.recordedAt.toMillis() : (p.invoiceDateMs || null) });
        const built = invoice.buildInvoice(payment, seller);
        return res.status(200).json({ ok: true, html: invoice.renderHtml(built), number: built.number });
      }

      // ── Partenaires (annuaire artisans) : liste admin ──────────
      if (type === 'partners') {
        const snap = await db.collection('partners').orderBy('order').get()
          .catch(() => db.collection('partners').get());
        // Fusionne le marqueur invité (partners_private, serveur seul) pour
        // l'affichage ADMIN uniquement — jamais présent dans la collection
        // publique lue par les visiteurs.
        const privSnap = await db.collection('partners_private').get().catch(() => null);
        const priv = {};
        if (privSnap) privSnap.forEach((doc) => { priv[doc.id] = doc.data() || {}; });
        const partners = [];
        snap.forEach((doc) => {
          partners.push(Object.assign({
            id: doc.id,
            guest: !!(priv[doc.id] && priv[doc.id].guest),
            linkedEmail: (priv[doc.id] && priv[doc.id].linkedEmail) || ''
          }, doc.data()));
        });
        return res.status(200).json({ ok: true, partners });
      }

      // ── Codes d'invitation (Black offert) : liste admin ────────
      if (type === 'invite-codes') {
        const snap = await db.collection('invite_codes').get();
        const codes = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          codes.push({
            code: doc.id,
            active: d.active !== false,
            usedBy: d.usedBy || '',
            usedAt: d.usedAt && d.usedAt.toMillis ? d.usedAt.toMillis() : null,
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null
          });
        });
        codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return res.status(200).json({ ok: true, codes });
      }

      // ── Candidatures partenaires (pré-inscriptions Phase 3a) ────
      if (type === 'partner-applications') {
        // Tri par date desc si possible ; fallback sans tri (index auto).
        const snap = await db.collection('partner_applications').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('partner_applications').limit(200).get());
        const applications = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          applications.push({
            id: doc.id,
            name: d.name || '', metier: d.metier || '', commune: d.commune || '',
            email: d.email || '', phone: d.phone || '', tier: d.tier || '',
            sizes: d.sizes || {}, couleurs: d.couleurs || '',
            facebook: d.facebook || '', instagram: d.instagram || '',
            pubChoice: d.pubChoice || '', hasWebsite: !!d.hasWebsite,
            websiteUrl: d.websiteUrl || '', siteOption: d.siteOption || '',
            message: d.message || '', status: d.status || 'nouvelle',
            hasLogo: !!(d.logo && String(d.logo).length > 0),
            invited: d.invited === true, inviteCode: d.inviteCode || '',
            uid: d.uid || '',
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null
          });
        });
        return res.status(200).json({ ok: true, applications });
      }

      // ── Config coursier : prix du litre d'essence (réglementé, révisé chaque
      // mois) pour le barème livreurs. Lu/écrit UNIQUEMENT via l'admin. ──
      if (type === 'courier-config') {
        const doc = await db.collection('courier_config').doc('main').get().catch(() => null);
        const config = (doc && doc.exists) ? doc.data() : {};
        return res.status(200).json({ ok: true, config: { fuelPrice: config.fuelPrice || null } });
      }

      // ── Avis clients sur les livreurs (notes + commentaires des courses) ──
      if (type === 'course-ratings') {
        const snap = await db.collection('courses').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('courses').limit(200).get())
          .catch(() => null);
        const ratings = [];
        if (snap) snap.forEach((doc) => {
          const c = doc.data() || {};
          if (!c.rating) return;
          ratings.push({
            id: doc.id, rating: c.rating, comment: c.ratingComment || '',
            address: c.address || '', productTitle: c.productTitle || '', prix: c.prix || 0,
            zone: c.zone || 0, courierEmail: c.courierEmail || '', artisanEmail: c.artisanEmail || '',
            ratedAt: c.ratedAt && c.ratedAt.toMillis ? c.ratedAt.toMillis() : null
          });
        });
        return res.status(200).json({ ok: true, ratings });
      }

      // ── Toutes les courses (administration + ménage de la phase de test) ──
      if (type === 'courses') {
        const snap = await db.collection('courses').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('courses').limit(200).get())
          .catch(() => null);
        const courses = [];
        if (snap) snap.forEach((doc) => {
          const c = doc.data() || {};
          courses.push({
            id: doc.id,
            status: c.status || '',
            address: c.address || '',
            zone: c.zone || 0,
            prix: c.prix || 0,
            date: c.date || '',
            paid: !!c.paid,
            escrow: c.escrow || null,
            artisanEmail: c.artisanEmail || '',
            courierEmail: c.courierEmail || '',
            hasScene: !!c.hasScene,
            hasProof: !!c.proofPhoto || !!c.hasProof,
            videos: (c.videos || []).length,
            rating: c.rating || 0,
            createdAt: c.createdAt && c.createdAt.toMillis ? c.createdAt.toMillis() : null
          });
        });
        return res.status(200).json({ ok: true, courses });
      }

      // ── Litiges & vidéos de remise (admin SEUL — jamais de lecture client).
      // Vidéos servies en URL SIGNÉE temporaire (1 h) depuis Firebase Storage.
      // Engagement : privées, jamais divulguées, effacées à la clôture. ──
      if (type === 'course-disputes') {
        const snap = await db.collection('courses').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('courses').limit(200).get())
          .catch(() => null);
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'pirates-tools.firebasestorage.app';
        let bucket = null;
        try { bucket = admin.storage().bucket(bucketName); } catch (e) { console.warn('[admin] storage indisponible:', e.message); }
        const disputes = [];
        if (snap) {
          for (const doc of snap.docs) {
            const c = doc.data() || {};
            const hasVideos = (c.videos || []).length > 0;
            const hasDispute = !!(c.litige && (c.litige.open || c.litige.closedAt));
            if (!hasVideos && !hasDispute) continue;
            const videos = [];
            for (const v of (c.videos || [])) {
              let url = null;
              if (bucket) {
                try {
                  const [signed] = await bucket.file(v.path).getSignedUrl({ action: 'read', expires: Date.now() + 3600 * 1000 });
                  url = signed;
                } catch (e) { /* fichier absent / Storage non activé */ }
              }
              videos.push({ role: v.role, at: v.at && v.at.toMillis ? v.at.toMillis() : null, url });
            }
            disputes.push({
              id: doc.id, status: c.status, address: c.address || '', prix: c.prix || 0, zone: c.zone || 0,
              escrow: c.escrow || null, artisanEmail: c.artisanEmail || '', courierEmail: c.courierEmail || '',
              litige: c.litige ? {
                open: !!c.litige.open, role: c.litige.role || '', message: c.litige.message || '',
                at: c.litige.at && c.litige.at.toMillis ? c.litige.at.toMillis() : null
              } : null,
              videos
            });
          }
        }
        return res.status(200).json({ ok: true, disputes });
      }

      // ── Dossiers livreurs (service coursier — validation manuelle option B).
      // Vide tant que le service est inactif (aucune candidature écrite). ──
      if (type === 'courier-applications') {
        const snap = await db.collection('courier_applications').orderBy('createdAt', 'desc').limit(200).get()
          .catch(() => db.collection('courier_applications').limit(200).get())
          .catch(() => null);
        const applications = [];
        if (snap) snap.forEach((doc) => {
          const d = doc.data() || {};
          applications.push({
            uid: doc.id,
            name: d.name || '', email: d.email || '', phone: d.phone || '',
            vehicle: d.vehicle || '', cylindree: d.cylindree || '',
            status: d.status || 'en_attente',
            pieces: d.pieces || {},
            // Dérogation aux pièces (comptes de test) : l'admin doit la voir.
            piecesBypass: !!d.piecesBypass,
            piecesManquantes: Array.isArray(d.piecesManquantes) ? d.piecesManquantes : [],
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null
          });
        });
        // Un dossier VALIDÉ n'est plus une candidature : c'est un livreur. On
        // joint sa fiche publique (photo, commune, véhicule, tarifs, courses,
        // note) pour que l'administration affiche sa CARTE et non un formulaire
        // de validation déjà traité.
        const valides = applications.filter((a) => a.status === 'valide');
        if (valides.length) {
          const fiches = await Promise.all(valides.map((a) =>
            db.collection('couriers_public').doc(a.uid).get()
              .then((s) => (s.exists ? s.data() : null)).catch(() => null)));
          valides.forEach((a, i) => {
            const f = fiches[i];
            a.profile = f ? {
              uid: a.uid,
              displayName: f.displayName || a.name || '',
              photo: f.photo || '', commune: f.commune || '',
              vehicle: f.vehicle || a.vehicle || '', bio: f.bio || '',
              tarifs: f.tarifs || null, available: !!f.available,
              published: !!f.published,
              coursesDone: f.coursesDone || 0,
              ratingCount: f.ratingCount || 0, ratingSum: f.ratingSum || 0
            } : null;   // null = validé mais fiche pas encore remplie
          });
        }
        return res.status(200).json({ ok: true, applications });
      }

      // ── Liste des charges saisies ──────────────────────────────
      if (type === 'charges') {
        const chSnap = await db.collection('charges').orderBy('dateMs', 'desc').limit(500).get().catch(() => db.collection('charges').limit(500).get());
        const charges = [];
        chSnap.forEach((doc) => { charges.push(Object.assign({ id: doc.id }, doc.data())); });
        return res.status(200).json({ ok: true, charges: charges });
      }

      // ── Marges nettes LIVE : marge réelle au prix ACTUEL du site ────────
      // Branché sur le catalogue live (products.json + product_overrides) : donc
      // reflète les prix en temps réel, y compris après un scan du traqueur.
      if (type === 'margins') {
        const cfg = await priceConfig.load();
        const tvaFR = cfg.tvaFR || 0.20;
        const ovSnap = await db.collection('product_overrides').get();
        const ov = {};
        ovSnap.forEach((doc) => { ov[doc.id] = doc.data() || {}; });
        const catProducts = await catalog.loadCatalog();
        const variantCostsM = pwBuildVariantCosts(catProducts, ov);
        const rows = [];
        catProducts.forEach((p) => {
          const priceHt = Number(p.price_ht) || 0;
          if (!(priceHt > 0)) return;
          const o = ov[p.id] || {};
          // Même source de vérité que le recalcul de prix (pwSourceCost) :
          // traqueur > prix réel saisi en fiche > estimation dérivée.
          const ci = pwSourceCost(p, o, cfg, variantCostsM);
          const tracked = ci.origin && ci.origin !== 'estimé';
          const costTTC = (ci.srcTTC > 0) ? ci.srcTTC : (priceHt / PW.MARGIN) * (1 + tvaFR);
          const r = priceModel.marginAt(p, { priceHt: priceHt, costTTC: costTTC, mode: cfg.mode }, cfg);
          if (!r) return;
          const skuU = String(p.sku || '').toUpperCase();
          const isPack = p.variantRole === 'coffret'
            || String(p.category || '').toLowerCase().indexOf('combo') !== -1
            || /^DCK|^PPACK|P2T$|P3T$|D2K$/.test(skuU)
            || /set [ée]nergie|pack\b.*outil|multi-?outil/i.test(p.title || '');
          rows.push({
            id: p.id, sku: p.sku, brand: p.brand, title: p.title || p.name, category: p.category,
            weight: r.weight, shipKind: r.shipKind, ship: pwRound2(r.transport),
            // costTTC = TON prix d'achat fournisseur (TTC métropole). SENSIBLE :
            // ne sort QUE par cet endpoint admin (requireAdmin) — jamais par
            // /api/products (PRIVATE_FIELDS, gardé par check-catalog-public).
            costTTC: pwRound2(costTTC),
            priceHt: pwRound2(priceHt), ttc971: pwRound2(r.ttc), costSrc: ci.origin || 'estimé',
            netEur: pwRound2(r.netAfterIS), marginPct: Math.round(r.marginAfterIS * 1000) / 10, isPack: isPack
          });
        });
        rows.sort((a, b) => b.netEur - a.netEur);
        const totalNet = rows.reduce((s, r) => s + r.netEur, 0);
        const avg = rows.length ? rows.reduce((s, r) => s + r.marginPct, 0) / rows.length : 0;
        const packs = rows.filter((r) => r.isPack);
        return res.status(200).json({
          ok: true,
          config: { mode: cfg.mode, targetNet: cfg.targetNet, autoPrice: cfg.autoPrice !== false },
          summary: {
            count: rows.length, totalNet: pwRound2(totalNet), avgMarginPct: Math.round(avg * 10) / 10,
            packCount: packs.length, packNet: pwRound2(packs.reduce((s, r) => s + r.netEur, 0))
          },
          rows: rows
        });
      }

      // Default: list all overrides
      const snap = await db.collection('product_overrides').get();
      const overrides = {};
      snap.forEach((doc) => { overrides[doc.id] = doc.data(); });
      return res.status(200).json({ ok: true, overrides: overrides });
    } catch (err) {
      console.error('[api/admin] GET failed:', err.message);
      // Erreur d'index collectionGroup (FAILED_PRECONDITION) : au lieu d'un 500,
      // on renvoie une liste vide + le LIEN de création d'index que Firestore
      // fournit dans le message d'erreur (« ...requires an index. You can create
      // it here: https://console.firebase.google.com/... »). L'admin n'a qu'à
      // toucher le lien → l'index se crée en 1 tap (voie iPad sans CLI).
      if (String(err.message).indexOf('index') !== -1) {
        const m = String(err.message).match(/https:\/\/console\.firebase\.google\.com\/\S+/);
        const indexUrl = m ? m[0].replace(/[).,\s]+$/, '') : '';
        return res.status(200).json({ ok: true, orders: [], hint: 'Firestore index required — check console', indexUrl: indexUrl });
      }
      return res.status(500).json({ ok: false, error: 'Failed to load' });
    }
  }

  // ── POST ?type=price-watch : traqueur de prix fournisseur ──
  // Fusionné ici (et pas dans un endpoint dédié) pour rester sous le plafond
  // Vercel Hobby de 12 fonctions serverless.
  if (req.method === 'POST' && ((req.query && req.query.type) === 'price-watch')) {
    return handlePriceWatch(req, res, admin, db);
  }

  // ── POST ?type=pricing-config : sauver la config de tarification ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'pricing-config')) {
    try {
      const cfg = await priceConfig.save(req.body || {});
      return res.status(200).json({ ok: true, config: cfg });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

  // ── POST ?type=price-preview : aperçu du prix recommandé (calcul serveur) ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'price-preview')) {
    try {
      const body = req.body || {};
      const cfg = await priceConfig.load();
      const product = { weight_kg: Number(body.weight) || 2, ncCategory: body.ncCategory || 'power_tool', variantRole: body.variantRole || 'solo', title: body.title || '' };
      const opts = { mode: body.mode || cfg.mode };
      if (body.costHT != null) opts.costHT = Number(body.costHT);
      else opts.costTTC = Number(body.costTTC || 0);
      const r = priceModel.recommend(product, opts, cfg);
      return res.status(200).json({ ok: true, result: r });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

  // ── POST ?type=reprice-all : recalcule TOUS les prix depuis le modèle ──
  // Recompute intentionnel (bouton admin). Utilise le coût source connu de chaque
  // produit (override priceSrcTTC en priorité, sinon price_ht × VAT du produit).
  if (req.method === 'POST' && ((req.query && req.query.type) === 'reprice-all')) {
    return handleRepriceAll(req, res, admin, db);
  }

  // ── POST ?type=partner-save : carte artisan de l'annuaire (upsert) ──
  // Validation STRICTE par allowlist : la carte est affichée publiquement
  // (route #/artisans + strip accueil), rien d'arbitraire n'entre en base.
  // Photos/logo = dataURL compressées côté admin (≤ ~120 Ko chacune) ; le
  // nombre de photos est plafonné par le tier (annuaire dégressif).
  if (req.method === 'POST' && ((req.query && req.query.type) === 'partner-save')) {
    try {
      const b = req.body || {};
      const TIERS = ['basique', 'pro', 'gold', 'black'];
      const PHOTOS_MAX = { basique: 0, pro: 1, gold: 3, black: 6 };
      const DATAURL_MAX = 170000; // ~125 Ko base64 par image
      const tier = TIERS.indexOf(b.tier) !== -1 ? b.tier : 'basique';
      const name = String(b.name || '').trim().slice(0, 80);
      const metier = String(b.metier || '').trim().slice(0, 40);
      if (!name || !metier) return res.status(400).json({ ok: false, error: 'name et metier requis' });
      const isDataImg = (v) => typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= DATAURL_MAX;
      const link = String(b.link || '').trim().slice(0, 200);
      if (link && !/^https?:\/\//.test(link)) return res.status(400).json({ ok: false, error: 'link doit être http(s)' });
      const photos = Array.isArray(b.photos) ? b.photos.filter(isDataImg).slice(0, PHOTOS_MAX[tier]) : [];
      const doc = {
        name, metier, tier,
        commune: String(b.commune || '').trim().slice(0, 40),
        whatsapp: String(b.whatsapp || '').replace(/[^0-9+]/g, '').slice(0, 20),
        desc: String(b.desc || '').trim().slice(0, 240),
        link,
        logo: isDataImg(b.logo) ? b.logo : '',
        photos,
        active: b.active !== false,
        order: Number.isFinite(Number(b.order)) ? Number(b.order) : 999,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      const id = String(b.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)
        || (name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || ('p' + Math.abs(hashCodeStr(name + metier))));
      // Liaison compte client (self-service photos/logo) : l'admin saisit
      // l'EMAIL du compte → on résout l'uid via Firebase Auth (le compte doit
      // exister). L'uid vit dans partners_private (serveur seul) : c'est LA
      // preuve d'appartenance qu'exige l'endpoint self-service (contact.js).
      let linkedUid = '';
      const linkedEmail = String(b.linkedEmail || '').trim().slice(0, 200);
      if (linkedEmail) {
        try {
          const userRec = await admin.auth().getUserByEmail(linkedEmail);
          linkedUid = userRec.uid;
        } catch (err) {
          return res.status(400).json({ ok: false, error: 'Aucun compte Pirates Tools avec cet email — l\'artisan doit d\'abord créer son compte (Menu → Compte).' });
        }
      }
      await db.collection('partners').doc(id).set(doc, { merge: false });
      // Black INVITÉ (décision user 25/07) : 2 artisans choisis à la main +
      // la carte de test admin. Tous les avantages Black GRATUITS (ÉPI, site,
      // pub, entraide, remise 5 %) SAUF le bon de 38 €/mois (ils ne paient
      // pas). Le marqueur vit dans `partners_private` (SERVEUR SEUL, jamais
      // dans `partners` qui est PUBLIQUEMENT lisible — on n'expose pas qui
      // paie et qui ne paie pas). Sert aux compteurs (10 places PAYANTES,
      // Phase 3b) et au portefeuille (pas de bon, Phase 4).
      await db.collection('partners_private').doc(id).set({
        guest: b.guest === true,
        uid: linkedUid,
        linkedEmail: linkedUid ? linkedEmail : ''
      }, { merge: true });
      return res.status(200).json({ ok: true, id, partner: doc, guest: b.guest === true, linkedEmail: linkedUid ? linkedEmail : '' });
    } catch (err) {
      console.error('[api/admin] partner-save failed:', err.message);
      return res.status(500).json({ ok: false, error: 'partner-save échoué' });
    }
  }

  // ── POST ?type=invite-code-save : créer un code d'invitation ──
  // Code fourni (normalisé A-Z 0-9 tiret, 4-24) ou GÉNÉRÉ (PT-XXXXXX).
  // create() échoue si le code existe déjà → pas d'écrasement silencieux.
  if (req.method === 'POST' && ((req.query && req.query.type) === 'invite-code-save')) {
    try {
      let code = String((req.body || {}).code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
      if (!code) {
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans O/0/I/L/1 (lisible)
        code = 'PT-';
        for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      if (code.length < 4) return res.status(400).json({ ok: false, error: 'Code trop court (4 caractères minimum)' });
      await db.collection('invite_codes').doc(code).create({
        active: true, usedBy: '', usedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.status(200).json({ ok: true, code });
    } catch (err) {
      if (String(err.code) === '6' || /already.?exists/i.test(err.message)) {
        return res.status(409).json({ ok: false, error: 'Ce code existe déjà' });
      }
      console.error('[api/admin] invite-code-save failed:', err.message);
      return res.status(500).json({ ok: false, error: 'invite-code-save échoué' });
    }
  }

  // ── Sauvegarde config coursier (prix du litre) ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'courier-config')) {
    try {
      const v = Number((req.body || {}).fuelPrice);
      if (!(v > 0.5 && v < 5)) return res.status(400).json({ ok: false, error: 'fuelPrice invalide (0,5-5 €/L)' });
      await db.collection('courier_config').doc('main').set({
        fuelPrice: Math.round(v * 100) / 100, updatedAt: new Date()
      }, { merge: true });
      return res.status(200).json({ ok: true, fuelPrice: Math.round(v * 100) / 100 });
    } catch (err) {
      console.error('[api/admin] courier-config failed:', err.message);
      return res.status(500).json({ ok: false, error: 'courier-config échoué' });
    }
  }

  // ── Validation d'un dossier livreur (option B) : valide / refuse. ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'courier-review')) {
    try {
      const b = req.body || {};
      const uid = String(b.uid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
      const status = String(b.status || '');
      if (!uid) return res.status(400).json({ ok: false, error: 'uid requis' });
      if (status !== 'valide' && status !== 'refuse') return res.status(400).json({ ok: false, error: 'statut invalide' });
      await db.collection('courier_applications').doc(uid).set({
        status: status, reviewedAt: new Date()
      }, { merge: true });
      // ⚠️ C'EST CETTE ÉCRITURE QUI DONNE (OU RETIRE) L'ACCÈS LIVREUR.
      // couriers/{uid}.kycValide === 'valide' est la SEULE porte d'entrée
      // (contact.js). Elle portait un « .catch(() => {}) » : en cas d'échec,
      // l'administration répondait « ✅ ok », la candidature passait en
      // « valide »… et le compte n'avait toujours aucun accès. Panne vécue le
      // 27/07/2026 — « je valide et ça ne marche pas », sans le moindre
      // message. On ne masque plus rien.
      try {
        await db.collection('couriers').doc(uid).set({ kycStatus: status }, { merge: true });
      } catch (e) {
        console.error('[api/admin] courier-review kycStatus failed:', e.message);
        return res.status(500).json({
          ok: false,
          error: 'Le dossier est marqué « ' + status + ' », mais l\'accès livreur n\'a PAS pu être appliqué '
            + '(écriture couriers/' + uid + ' refusée). Réessaie ; si ça persiste, le compte de service '
            + 'Firebase est en cause.'
        });
      }
      // ET ON VÉRIFIE L'EFFET : on relit. Annoncer un succès sans l'avoir
      // constaté, c'est reproduire exactement la panne.
      const apres = await db.collection('couriers').doc(uid).get();
      const kycStatus = apres.exists ? (apres.data().kycStatus || '') : '';
      if (kycStatus !== status) {
        return res.status(500).json({
          ok: false,
          error: 'Le statut du dossier a été enregistré, mais l\'accès livreur n\'a PAS été appliqué '
            + '(couriers/' + uid + '.kycStatus = « ' + (kycStatus || 'absent') + ' »). Réessaie.'
        });
      }
      return res.status(200).json({ ok: true, uid, status, kycStatus, courierActif: kycStatus === 'valide' });
    } catch (err) {
      console.error('[api/admin] courier-review failed:', err.message);
      return res.status(500).json({ ok: false, error: 'courier-review échoué' });
    }
  }

  // Clôture d'un litige : les vidéos sont EFFACÉES de Storage (engagement :
  // privées, conservées le temps du litige seulement) et la trace du litige
  // passe en « clos » (qui/quand/décision restent dans le doc course).
  if (req.method === 'POST' && ((req.query && req.query.type) === 'course-dispute-close')) {
    try {
      const id = String((req.body || {}).id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      const decision = String((req.body || {}).decision || '').slice(0, 500);
      if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
      const ref = db.collection('courses').doc(id);
      const d = await ref.get();
      if (!d.exists) return res.status(404).json({ ok: false, error: 'course introuvable' });
      const c = d.data() || {};
      let videosDeleted = 0;
      try {
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'pirates-tools.firebasestorage.app';
        const bucket = admin.storage().bucket(bucketName);
        await bucket.deleteFiles({ prefix: 'courses/' + id + '/videos/' });
        videosDeleted = (c.videos || []).length;
      } catch (e) { console.warn('[admin] suppression vidéos:', e.message); }
      await ref.update({
        videos: [],
        litige: Object.assign({}, c.litige || {}, { open: false, closedAt: new Date(), decision: decision || '' })
      });
      return res.status(200).json({ ok: true, id, videosDeleted });
    } catch (err) {
      console.error('[api/admin] course-dispute-close failed:', err.message);
      return res.status(500).json({ ok: false, error: 'course-dispute-close échoué' });
    }
  }

  // Supprimer une course DÉFINITIVEMENT (ménage de la phase de test).
  // Emporte tout ce qui lui appartient : la sous-collection `photos` (scène,
  // colis remis, vue du chantier) et les vidéos dans Storage — sinon ces
  // documents et fichiers resteraient orphelins, invisibles et facturés.
  if (req.method === 'POST' && ((req.query && req.query.type) === 'course-delete')) {
    try {
      const id = String((req.body || {}).id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
      const ref = db.collection('courses').doc(id);
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ ok: false, error: 'course introuvable' });
      const data = doc.data() || {};

      // 1. Sous-collection photos
      let photosDeleted = 0;
      const photos = await ref.collection('photos').get();
      for (const p of photos.docs) { await p.ref.delete(); photosDeleted++; }

      // 1 bis. Sous-collection messages (le fil de discussion). Supprimer le
      //    document parent NE supprime PAS ses sous-collections dans Firestore :
      //    sans ça, la conversation survivait indéfiniment, inaccessible mais
      //    stockée — inacceptable pour des échanges entre deux personnes.
      let messagesDeleted = 0;
      const msgs = await ref.collection('messages').get();
      for (const m of msgs.docs) { await m.ref.delete(); messagesDeleted++; }

      // 2. Vidéos Storage (best-effort : Storage peut ne pas être activé)
      let videosDeleted = 0;
      if ((data.videos || []).length) {
        try {
          const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'pirates-tools.firebasestorage.app';
          await admin.storage().bucket(bucketName).deleteFiles({ prefix: 'courses/' + id + '/videos/' });
          videosDeleted = data.videos.length;
        } catch (e) { console.warn('[admin] course-delete vidéos:', e.message); }
      }

      // 3. La course elle-même, en DERNIER : si une étape échoue avant, le doc
      //    reste et l'opération est rejouable — jamais d'orphelin silencieux.
      await ref.delete();
      return res.status(200).json({ ok: true, id, photosDeleted, messagesDeleted, videosDeleted });
    } catch (err) {
      console.error('[api/admin] course-delete failed:', err.message);
      return res.status(500).json({ ok: false, error: 'course-delete échoué : ' + err.message });
    }
  }

  if (req.method === 'POST' && ((req.query && req.query.type) === 'invite-code-delete')) {
    try {
      const code = String((req.body || {}).code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (!code) return res.status(400).json({ ok: false, error: 'code requis' });
      await db.collection('invite_codes').doc(code).delete();
      return res.status(200).json({ ok: true, code });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'invite-code-delete échoué' });
    }
  }

  if (req.method === 'POST' && ((req.query && req.query.type) === 'partner-delete')) {
    try {
      const id = String((req.body || {}).id || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!id) return res.status(400).json({ ok: false, error: 'id requis' });
      await db.collection('partners').doc(id).delete();
      await db.collection('partners_private').doc(id).delete().catch(() => {});
      return res.status(200).json({ ok: true, id });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'partner-delete échoué' });
    }
  }

  // ── POST ?type=charge : enregistrer une charge réelle (compta) ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'charge')) {
    try {
      const b = req.body || {};
      const CATS = ['transport', 'octroi', 'cfe', 'assurance', 'achat', 'banque', 'autre'];
      const amountHt = Number(b.amountHt);
      if (!(amountHt > 0)) return res.status(400).json({ ok: false, error: 'Montant HT invalide' });
      const doc = {
        category: CATS.indexOf(b.category) !== -1 ? b.category : 'autre',
        label: String(b.label || '').slice(0, 120),
        amountHt: pwRound2(amountHt),
        tvaDeductible: Number(b.tvaDeductible) > 0 ? pwRound2(Number(b.tvaDeductible)) : 0,
        dateMs: Number(b.dateMs) || Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      const ref = await db.collection('charges').add(doc);
      return res.status(200).json({ ok: true, id: ref.id, charge: doc });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Enregistrement charge échoué' });
    }
  }

  // ── POST ?type=invoice-config : identité vendeur (factures) ──
  if (req.method === 'POST' && ((req.query && req.query.type) === 'invoice-config')) {
    try {
      const b = req.body || {};
      const FIELDS = ['raisonSociale', 'formeJuridique', 'capital', 'adresse', 'siret', 'rcs', 'tvaIntra', 'email', 'tel', 'mediateur'];
      const patch = {};
      FIELDS.forEach((k) => { if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 200); });
      if (b.franchise !== undefined) patch.franchise = !!b.franchise;
      if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: 'Aucun champ' });
      await db.collection('config').doc('invoice').set(patch, { merge: true });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Sauvegarde échouée' });
    }
  }

  // ── DELETE ?type=charge&id=… : supprimer une charge ──
  if (req.method === 'DELETE' && ((req.query && req.query.type) === 'charge')) {
    try {
      const id = (req.query && req.query.id) || (req.body && req.body.id) || '';
      if (!id) return res.status(400).json({ ok: false, error: 'id manquant' });
      await db.collection('charges').doc(String(id)).delete();
      return res.status(200).json({ ok: true, id: String(id) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Suppression échouée' });
    }
  }

  // ── POST : update or create an override ───────────────────
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const productId = String(body.id || '').trim();
      if (!productId) {
        return res.status(400).json({ ok: false, error: 'Missing product id' });
      }

      // Allowed fields — block arbitrary writes
      const allowed = [
        'stock_status', 'stock_label',
        'price', 'price_ht', 'vat', 'currency',
        'title', 'desc', 'description',
        'tag', 'paymentLink',
        'hidden'
      ];
      const patch = {};
      allowed.forEach((k) => {
        if (body[k] !== undefined) patch[k] = body[k];
      });

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ ok: false, error: 'No valid fields to update' });
      }

      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('product_overrides').doc(productId).set(patch, { merge: true });

      console.log('[api/admin] Updated override for', productId, Object.keys(patch).join(','));
      return res.status(200).json({ ok: true, id: productId, patch: patch });
    } catch (err) {
      console.error('[api/admin] POST failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Update failed' });
    }
  }

  // ── DELETE : remove an override ───────────────────────────
  if (req.method === 'DELETE') {
    try {
      const id = (req.query && req.query.id) || (req.body && req.body.id) || '';
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });
      await db.collection('product_overrides').doc(String(id)).delete();
      return res.status(200).json({ ok: true, id: String(id) });
    } catch (err) {
      console.error('[api/admin] DELETE failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Delete failed' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};

// ── Traqueur de prix fournisseur (cotébrico) ────────────────────────────────
// Le raccourci iPad récupère le TEXTE/HTML d'une page marque cotébrico DEPUIS
// L'IP DE L'USER (le serveur est bloqué en 403) et le POST ici. On extrait
// réf + prix HORS PROMO, et on met à jour les prix (product_overrides) — avec
// GARDE-FOUS pour que l'auto-application soit sûre. dryRun=true → aucun écrit.
// MAX_TTC volontairement TRÈS haut (packs multi-outils = chers) : la réf exacte
// identifie le bon produit et son bloc ne contient que son prix → on fait confiance.
// Le vrai filet reste MAX_MOVE (variation %), qui rattrape un éventuel découpage
// de bloc raté sans jamais bloquer un pack cher légitime.
const PW = { MARGIN: 1.15, VAT: 1.20, MIN_TTC: 5, MAX_TTC: 8000, MAX_MOVE: 0.25 };
function pwRound2(n) { return Math.round(n * 100) / 100; }

// Prix à partir du coût source TTC (src) : MODÈLE de marge cible si cfg.autoPrice,
// sinon repli historique ×1,15. Retourne { newPrice (TTC métropole), newHt, markup, mode }.
// GARDE-FOU COFFRET (décision user 26/07/2026) : chez le fournisseur, la même
// machine en coffret MAKPAC/TSTAK coûte ~20 € TTC de plus que la version nue.
// Quand le traqueur ne connaît qu'UNE des deux variantes, on dérive l'autre
// avec cet écart au lieu de partir d'une estimation en l'air — c'est ce qui
// évitait au calculateur de « se perdre » (ex. DJV185ZJ était estimé à
// 240,79 € alors que la version nue coûte 149,90 € → coût réel ~169,90 €).
var COFFRET_COST_DELTA = 20;

// Index des coûts RÉELS connus (traqueur ou fiche), par groupe de variante.
// { [variantGroup]: { solo: srcTTC, coffret: srcTTC } }
function pwBuildVariantCosts(products, ov) {
  var byGroup = {};
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    if (!p.variantGroup || (p.variantRole !== 'solo' && p.variantRole !== 'coffret')) continue;
    var o = (ov && ov[p.id]) || {};
    // Même exigence que pwSourceCost : seul un coût RELEVÉ (traqueur) ou saisi
    // en fiche sert de base à la dérivation ± 20 € — jamais une estimation.
    var ovHasCost = (typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0);
    var real = (o.priceSource === 'cotebrico' && ovHasCost)
      ? o.priceSrcTTC
      : ((!ovHasCost && typeof p.priceSrcTTC === 'number' && p.priceSrcTTC > 0) ? p.priceSrcTTC : null);
    if (!(real > 0)) continue;
    if (!byGroup[p.variantGroup]) byGroup[p.variantGroup] = {};
    byGroup[p.variantGroup][p.variantRole] = real;
  }
  return byGroup;
}

// Coût d'achat source (TTC métropole) d'un produit, par ordre de fiabilité :
//  1. override.priceSrcTTC  → relevé RÉEL du traqueur (scan cotébrico) ;
//  2. produit.priceSrcTTC   → prix fournisseur RÉEL saisi dans products.json
//     (produits que le traqueur ne voit pas : variantes « machine seule »…) ;
//  3. variante jumelle      → coût RÉEL de l'autre variante ± 20 € (coffret) ;
//  4. dérivé de price_ht    → ESTIMATION (le prix catalogue est supposé être
//     l'ancien coût ×1,15). À remplacer par un vrai prix dès que possible.
// Retourne { srcTTC, origin } — origin est affiché dans l'aperçu admin.
function pwSourceCost(p, o, cfg, byGroup) {
  // ⚠️ Un coût n'est « relevé » que s'il porte priceSource='cotebrico', la
  // marque du traqueur. Sans ce contrôle, un coût ESTIMÉ écrit par un ancien
  // « Appliquer » se faisait passer pour un relevé réel : la supposition
  // devenait définitive et neutralisait le garde-fou coffret.
  if (o && o.priceSource === 'cotebrico' && typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0) {
    return { srcTTC: o.priceSrcTTC, origin: 'traqueur' };
  }
  // ⚠️ `p` est le produit FUSIONNÉ : si l'override porte un priceSrcTTC, alors
  // p.priceSrcTTC EST cette valeur, pas le prix saisi dans products.json. On ne
  // lit donc la fiche que si l'override est muet — sinon un coût blanchi se
  // ferait passer pour un « prix fournisseur saisi ».
  var overrideHasCost = !!(o && typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0);
  if (!overrideHasCost && p && typeof p.priceSrcTTC === 'number' && p.priceSrcTTC > 0) {
    return { srcTTC: p.priceSrcTTC, origin: 'fiche' };
  }
  // Garde-fou coffret : dériver de la variante jumelle au coût RÉEL connu.
  if (byGroup && p && p.variantGroup && byGroup[p.variantGroup]) {
    var g = byGroup[p.variantGroup];
    if (p.variantRole === 'coffret' && g.solo > 0) {
      return { srcTTC: pwRound2(g.solo + COFFRET_COST_DELTA), origin: 'variante' };
    }
    if (p.variantRole === 'solo' && g.coffret > 0) {
      // Jamais en dessous de zéro (garde-fou sur les très petits prix).
      return { srcTTC: pwRound2(Math.max(0.01, g.coffret - COFFRET_COST_DELTA)), origin: 'variante' };
    }
  }
  if (p && typeof p.price_ht === 'number' && p.price_ht > 0) {
    return { srcTTC: pwRound2((p.price_ht / PW.MARGIN) * (1 + ((cfg && cfg.tvaFR) || 0.20))), origin: 'estimé' };
  }
  return { srcTTC: null, origin: null };
}

function pwComputePrice(product, srcTTC, cfg) {
  // Verrou de sécurité : le MODÈLE de marge cible (15 % net) s'applique par
  // défaut. On ne retombe au ×1,15 QUE si autoPrice est EXPLICITEMENT désactivé
  // (autoPrice === false). Ainsi un scan traqueur ne peut jamais casser les
  // marges à cause d'une config partielle où autoPrice serait absent.
  if (!cfg || cfg.autoPrice !== false) {
    const r = priceModel.recommend(product, { costTTC: srcTTC, mode: (cfg && cfg.mode) || 'colissimo' }, cfg);
    if (r && r.priceHt > 0) {
      return { newHt: r.priceHt, newPrice: pwRound2(r.priceHt * (1 + (cfg.tvaFR || 0.20))), markup: r.markup, mode: r.mode };
    }
  }
  const newPrice = pwRound2(srcTTC * PW.MARGIN);
  return { newPrice, newHt: pwRound2(newPrice / PW.VAT), markup: 0.15, mode: 'legacy' };
}

// Recalcule TOUS les prix depuis le modèle (bouton admin, recompute intentionnel).
// Coût source = override.priceSrcTTC en priorité, sinon dérivé de price_ht × VAT.
// Garde-fous de fourchette (MIN/MAX) mais PAS de plafond de variation (le grand
// saut lors du 1er passage au modèle est voulu). dryRun renvoie l'aperçu sans écrire.
async function handleRepriceAll(req, res, admin, db) {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const dryRun = body.dryRun === true || (req.query && (req.query.dryRun === '1' || req.query.dryRun === 'true'));
    const cfg = await priceConfig.load();

    // Overrides existants (pour le coût source connu).
    const ovSnap = await db.collection('product_overrides').get();
    const ov = {};
    ovSnap.forEach((d) => { ov[d.id] = d.data() || {}; });

    const products = await catalog.loadCatalog();
    // Garde-fou coffret : coûts RÉELS connus par groupe de variante, pour
    // dériver la variante manquante (± 20 €) au lieu de l'estimer.
    const variantCosts = pwBuildVariantCosts(products, ov);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const changed = [], skipped = [];
    // Santé des coûts d'achat : sur quoi reposent RÉELLEMENT les prix du site.
    // Affiché même quand rien ne change — « 0 à changer » ne veut rien dire si
    // les prix sont bâtis sur des estimations.
    const origins = { traqueur: 0, fiche: 0, variante: 0, 'estimé': 0 };
    const estimes = [];
    let lockedCount = 0;   // produits à prix verrouillé (jamais recalculés)

    for (const p of products) {
      // 🔒 PRIX VERROUILLÉ : décision commerciale de l'owner, le calculateur
      // n'y touche JAMAIS (produit dont le coût fournisseur n'est pas relevable
      // — prix constaté variable selon les revendeurs). Sorti du décompte des
      // « estimés » : ce n'est pas une lacune à combler, c'est un choix.
      if (p.priceLocked === true) { lockedCount++; continue; }

      const o = ov[p.id] || {};
      // Coût source TTC : traqueur > fiche > variante jumelle ±20 € > estimation.
      const srcInfo = pwSourceCost(p, o, cfg, variantCosts);
      const srcTTC = srcInfo.srcTTC;
      if (!(srcTTC > 0)) { skipped.push({ id: p.id, sku: p.sku, reason: 'coût source inconnu' }); continue; }
      if (srcTTC < PW.MIN_TTC || srcTTC > PW.MAX_TTC) { skipped.push({ id: p.id, sku: p.sku, reason: 'hors fourchette' }); continue; }
      if (origins[srcInfo.origin] !== undefined) origins[srcInfo.origin]++;
      // Liste EXHAUSTIVE des produits sans coût réel : c'est la réponse à
      // « quels produits n'apparaissent pas dans le traqueur ? ». Plafond haut
      // (250) pour ne jamais tronquer silencieusement le catalogue réel.
      if (srcInfo.origin === 'estimé' && estimes.length < 250) {
        estimes.push({ sku: p.sku, brand: p.brand || '', name: p.title || p.name, srcTTC: srcTTC });
      }

      const priced = pwComputePrice(p, srcTTC, cfg);
      // Prix ACTUEL : l'override fraîchement relu fait foi. `p` vient du
      // catalogue fusionné, dont le cache d'overrides peut avoir jusqu'à 30 s
      // de retard : juste après un « Appliquer », il renvoyait encore l'ancien
      // prix → les mêmes produits étaient re-signalés comme « à changer »
      // alors qu'ils venaient d'être corrigés (fausse impression de bug).
      const cur = (typeof o.price === 'number') ? o.price
        : (typeof p.price === 'number' ? p.price : null);
      if (cur != null && Math.abs(priced.newPrice - cur) < 0.02) continue; // déjà bon
      const rec = { id: p.id, sku: p.sku, name: p.title || p.name, oldPrice: cur, newPrice: priced.newPrice, newHt: priced.newHt, markup: priced.markup, srcTTC,
        costSrc: srcInfo.origin };
      if (!dryRun) {
        // ⚠️ N'ÉCRIT PLUS priceSrcTTC. Le coût d'achat n'appartient qu'à ses
        // sources RÉELLES : le traqueur (scan cotébrico) ou la fiche produit.
        // L'écrire ici « blanchissait » une estimation en coût réel, la figeait
        // définitivement et empêchait toute correction ultérieure (garde-fou
        // coffret, nouveau relevé). Le coût est désormais re-résolu à chaque
        // passage ; on ne mémorise que son ORIGINE, pour la transparence.
        await db.collection('product_overrides').doc(p.id).set({
          price: priced.newPrice, price_ht: priced.newHt,
          priceMarkup: priced.markup, priceMode: priced.mode,
          priceCostOrigin: srcInfo.origin, priceRecomputedAt: now
        }, { merge: true });
      }
      changed.push(rec);
    }

    // Écritures faites : purge le cache pour que le prochain contrôle (et le
    // site public) reparte des prix réels, sans attendre l'expiration.
    if (!dryRun && changed.length) catalog.invalidateOverrides();

    return res.status(200).json({
      ok: true, dryRun: !!dryRun, mode: cfg.mode, autoPrice: !!cfg.autoPrice,
      counts: { total: products.length, changed: changed.length, skipped: skipped.length, locked: lockedCount },
      origins: origins, estimes: estimes,
      changed: changed.slice(0, 500), skipped: skipped.slice(0, 100)
    });
  } catch (err) {
    console.error('[api/admin] reprice-all failed:', err.message);
    return res.status(500).json({ ok: false, error: 'reprice-all failed' });
  }
}

function hashCodeStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return h;
}

async function handlePriceWatch(req, res, admin, db) {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    let text = (typeof req.body === 'string') ? req.body : (body.text || '');
    const brand = String(body.brand || (req.query && req.query.brand) || 'DEWALT').toUpperCase();
    const dryRun = body.dryRun === true || (req.query && (req.query.dryRun === '1' || req.query.dryRun === 'true'));
    if (!text || text.length < 200) return res.status(400).json({ ok: false, error: 'text manquant ou trop court' });

    const parsed = priceParse.parseCotebrico(text, brand);
    if (!parsed.length) return res.status(200).json({ ok: true, brand, parsed: 0, note: 'aucun produit reconnu (mauvaise page ou format changé ?)' });

    const products = await catalog.loadCatalog();
    const bySku = {};
    products.forEach((p) => { if (p.sku) bySku[String(p.sku).toUpperCase()] = p; });

    // Overrides relus À LA SOURCE : le catalogue fusionné peut avoir jusqu'à
    // 30 s de retard, et ici un prix actuel périmé fausserait AUSSI la garde
    // « variation > 25 % » (produit bloqué à tort, ou laissé passer à tort).
    const ovSnapW = await db.collection('product_overrides').get();
    const ovW = {};
    ovSnapW.forEach((d) => { ovW[d.id] = d.data() || {}; });

    // Config de tarification : si autoPrice, on applique le MODÈLE de marge cible
    // (markup adaptatif poids/mode pour 15 % net après IS) ; sinon repli ×1,15.
    const cfg = await priceConfig.load();

    const applied = [], flagged = [], unchanged = [], unknown = [], lockedW = [];
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Prix parsés indexés par SKU (pour la règle « min des sources » srcAltSkus).
    const parsedBySku = {};
    parsed.forEach((it) => { parsedBySku[String(it.sku).toUpperCase()] = it.price; });

    for (const item of parsed) {
      const p = bySku[item.sku];
      if (!p) { unknown.push({ sku: item.sku, srcTTC: item.price, name: item.name }); continue; }
      // Règle 25/07 : si le produit référence des déclinaisons fournisseur
      // (srcAltSkus, ex. DBS180Z ← DBS180ZJ), on achète TOUJOURS la moins
      // chère → source effective = min des prix présents sur la page.
      // 🔒 Prix verrouillé : le traqueur relève, mais n'écrit JAMAIS.
      if (p.priceLocked === true) { lockedW.push({ sku: item.sku, id: p.id, name: p.title || p.name }); continue; }
      const src = priceParse.pickCheapestSource(item.price, p.srcAltSkus, parsedBySku);
      const priced = pwComputePrice(p, src, cfg);
      const newPrice = priced.newPrice, newHt = priced.newHt;
      const oW = ovW[p.id] || {};
      const cur = (typeof oW.price === 'number') ? oW.price
        : (typeof p.price === 'number' ? p.price : null);
      const rec = { sku: item.sku, id: p.id, name: p.title || p.name, srcTTC: src, newPrice, newHt, markup: priced.markup, oldPrice: cur };

      // Le produit a-t-il DÉJÀ un coût réel relevé ? (marque du traqueur)
      const dejaReleve = (oW.priceSource === 'cotebrico' && typeof oW.priceSrcTTC === 'number' && oW.priceSrcTTC > 0);

      if (cur != null && Math.abs(newPrice - cur) < 0.02) {
        unchanged.push(rec);
        // Le prix est déjà bon — mais le COÛT RELEVÉ doit quand même être
        // enregistré. Sans ça, un produit parfaitement suivi n'a JAMAIS de coût
        // réel en base : il compte comme « estimé », le garde-fou coffret ne
        // peut pas s'appuyer dessus, et la marge affichée repose sur une
        // supposition alors que le vrai prix fournisseur est connu.
        if (!dryRun && (!dejaReleve || Math.abs((oW.priceSrcTTC || 0) - src) >= 0.01)) {
          await db.collection('product_overrides').doc(p.id).set({
            priceSource: 'cotebrico', priceSrcTTC: src, priceCheckedAt: now
          }, { merge: true });
        }
        continue;
      }

      let reason = null;
      if (src < PW.MIN_TTC || src > PW.MAX_TTC) reason = 'prix source hors fourchette (' + src + ' €)';
      // Plafond de variation : il protège d'une LECTURE ABERRANTE sur un produit
      // dont on suivait déjà le coût réel. Au PREMIER relevé réel, le grand saut
      // est au contraire attendu (le prix venait d'une estimation) — le bloquer
      // reviendrait à figer définitivement un prix faux. Les bornes MIN/MAX_TTC
      // restent actives dans tous les cas.
      else if (dejaReleve && cur != null && cur > 0 && Math.abs(newPrice - cur) / cur > PW.MAX_MOVE) {
        reason = 'variation ' + Math.round(Math.abs(newPrice - cur) / cur * 100) + ' % > ' + Math.round(PW.MAX_MOVE * 100) + ' %';
      }
      if (reason) { rec.reason = reason; flagged.push(rec); continue; }

      if (!dryRun) {
        await db.collection('product_overrides').doc(p.id).set({
          price: newPrice, price_ht: newHt,
          priceSource: 'cotebrico', priceSrcTTC: src, priceCheckedAt: now,
          priceMarkup: priced.markup, priceMode: priced.mode
        }, { merge: true });
        await db.collection('price_watch_log').add({
          sku: item.sku, id: p.id, oldPrice: cur, newPrice, srcTTC: src, brand, at: now,
          markup: priced.markup, mode: priced.mode
        });
      }
      applied.push(rec);
    }

    if (!dryRun && applied.length) catalog.invalidateOverrides();

    return res.status(200).json({
      ok: true, brand, dryRun: !!dryRun,
      counts: { parsed: parsed.length, applied: applied.length, flagged: flagged.length, unchanged: unchanged.length, unknown: unknown.length, locked: lockedW.length },
      applied, flagged, unknown: unknown.slice(0, 800)
    });
  } catch (err) {
    console.error('[api/admin] price-watch failed:', err.message);
    return res.status(500).json({ ok: false, error: 'price-watch failed' });
  }
}

// Corps volumineux (3 pages cotébrico) → augmente la limite du body parser.
// Corps volumineux : le traqueur reçoit le HTML BRUT d'une page cotébrico
// entière. Une page « toute la marque » (resultsPerPage=800) pèse plusieurs Mo.
// 4,5 Mo = plafond de Vercel pour le corps d'une requête serverless — on s'y
// cale. Au-delà, découper la marque en 2 pages (voir docs/TRAQUEUR-URLS.md).
module.exports.config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };
