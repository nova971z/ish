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

  // ── Auth (constant-time admin secret) ─────────────────────
  const denied = await auth.requireAdmin(req);
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
    try {
      if (type === 'orders') {
        // Read last 50 orders from collectionGroup('orders')
        const ordersSnap = await db.collectionGroup('orders')
          .orderBy('createdAt', 'desc')
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
            createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt || null),
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

      // ── Liste des charges saisies ──────────────────────────────
      if (type === 'charges') {
        const chSnap = await db.collection('charges').orderBy('dateMs', 'desc').limit(500).get().catch(() => db.collection('charges').limit(500).get());
        const charges = [];
        chSnap.forEach((doc) => { charges.push(Object.assign({ id: doc.id }, doc.data())); });
        return res.status(200).json({ ok: true, charges: charges });
      }

      // Default: list all overrides
      const snap = await db.collection('product_overrides').get();
      const overrides = {};
      snap.forEach((doc) => { overrides[doc.id] = doc.data(); });
      return res.status(200).json({ ok: true, overrides: overrides });
    } catch (err) {
      console.error('[api/admin] GET failed:', err.message);
      // collectionGroup index errors: return an empty list instead of 500
      if (String(err.message).indexOf('index') !== -1) {
        return res.status(200).json({ ok: true, orders: [], hint: 'Firestore index required — check console' });
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
function pwComputePrice(product, srcTTC, cfg) {
  if (cfg && cfg.autoPrice) {
    const r = priceModel.recommend(product, { costTTC: srcTTC, mode: cfg.mode }, cfg);
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
    const now = admin.firestore.FieldValue.serverTimestamp();
    const changed = [], skipped = [];

    for (const p of products) {
      const o = ov[p.id] || {};
      // Coût source TTC : priorité au coût réel enregistré par le traqueur.
      // Sinon, on suppose que le price_ht actuel = ancien coût × 1,15 → on
      // remonte au coût TTC : srcTTC = (price_ht / 1,15) × (1 + TVA FR).
      let srcTTC = (typeof o.priceSrcTTC === 'number' && o.priceSrcTTC > 0)
        ? o.priceSrcTTC
        : (typeof p.price_ht === 'number' && p.price_ht > 0
            ? pwRound2((p.price_ht / PW.MARGIN) * (1 + (cfg.tvaFR || 0.20)))
            : null);
      if (!(srcTTC > 0)) { skipped.push({ id: p.id, sku: p.sku, reason: 'coût source inconnu' }); continue; }
      if (srcTTC < PW.MIN_TTC || srcTTC > PW.MAX_TTC) { skipped.push({ id: p.id, sku: p.sku, reason: 'hors fourchette' }); continue; }

      const priced = pwComputePrice(p, srcTTC, cfg);
      const cur = typeof p.price === 'number' ? p.price : null;
      if (cur != null && Math.abs(priced.newPrice - cur) < 0.02) continue; // déjà bon
      const rec = { id: p.id, sku: p.sku, name: p.title || p.name, oldPrice: cur, newPrice: priced.newPrice, newHt: priced.newHt, markup: priced.markup, srcTTC };
      if (!dryRun) {
        await db.collection('product_overrides').doc(p.id).set({
          price: priced.newPrice, price_ht: priced.newHt,
          // Mémorise le coût source utilisé → un recalcul ultérieur repart du VRAI
          // coût (et non d'une dérivation ×1,15 qui deviendrait fausse).
          priceSrcTTC: srcTTC,
          priceMarkup: priced.markup, priceMode: priced.mode, priceRecomputedAt: now
        }, { merge: true });
      }
      changed.push(rec);
    }

    return res.status(200).json({
      ok: true, dryRun: !!dryRun, mode: cfg.mode, autoPrice: !!cfg.autoPrice,
      counts: { total: products.length, changed: changed.length, skipped: skipped.length },
      changed: changed.slice(0, 500), skipped: skipped.slice(0, 100)
    });
  } catch (err) {
    console.error('[api/admin] reprice-all failed:', err.message);
    return res.status(500).json({ ok: false, error: 'reprice-all failed' });
  }
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

    // Config de tarification : si autoPrice, on applique le MODÈLE de marge cible
    // (markup adaptatif poids/mode pour 15 % net après IS) ; sinon repli ×1,15.
    const cfg = await priceConfig.load();

    const applied = [], flagged = [], unchanged = [], unknown = [];
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const item of parsed) {
      const p = bySku[item.sku];
      if (!p) { unknown.push({ sku: item.sku, srcTTC: item.price, name: item.name }); continue; }
      const src = item.price;
      const priced = pwComputePrice(p, src, cfg);
      const newPrice = priced.newPrice, newHt = priced.newHt;
      const cur = typeof p.price === 'number' ? p.price : null;
      const rec = { sku: item.sku, id: p.id, name: p.title || p.name, srcTTC: src, newPrice, newHt, markup: priced.markup, oldPrice: cur };

      if (cur != null && Math.abs(newPrice - cur) < 0.02) { unchanged.push(rec); continue; }

      let reason = null;
      if (src < PW.MIN_TTC || src > PW.MAX_TTC) reason = 'prix source hors fourchette (' + src + ' €)';
      else if (cur != null && cur > 0 && Math.abs(newPrice - cur) / cur > PW.MAX_MOVE) {
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

    return res.status(200).json({
      ok: true, brand, dryRun: !!dryRun,
      counts: { parsed: parsed.length, applied: applied.length, flagged: flagged.length, unchanged: unchanged.length, unknown: unknown.length },
      applied, flagged, unknown: unknown.slice(0, 800)
    });
  } catch (err) {
    console.error('[api/admin] price-watch failed:', err.message);
    return res.status(500).json({ ok: false, error: 'price-watch failed' });
  }
}

// Corps volumineux (3 pages cotébrico) → augmente la limite du body parser.
module.exports.config = { api: { bodyParser: { sizeLimit: '4mb' } } };
