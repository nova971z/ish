/* =========================================================
   check-partner-application.js — Tests unitaires de la branche
   `type=partner-application` de api/contact.js (Phase 3a).

   Mocke le rate-limit, l'Admin SDK Firebase et Resend (fetch) via le cache
   require, exerce le handler complet, puis RESTAURE le cache/globals (sûr en
   CI : ne pollue pas les autres checks). Vérifie : validation stricte,
   acceptation des règles obligatoire, sanitisation des enums, plafond logo,
   persistance Firestore + email, dégradation propre. Retourne [] d'erreurs.
   ========================================================= */
'use strict';

module.exports = async function checkPartnerApplication() {
  const errors = [];
  const fail = (label) => errors.push(label);
  const check = (label, cond) => { if (!cond) fail(label); };

  const rlPath = require.resolve('../api/_lib/ratelimit');
  const fbPath = require.resolve('../api/_lib/firebase');
  const contactPath = require.resolve('../api/contact.js');

  // Sauvegarde de l'état à restaurer en fin de test.
  const savedRl = require.cache[rlPath];
  const savedFb = require.cache[fbPath];
  const savedContact = require.cache[contactPath];
  const savedFetch = global.fetch;
  const savedKey = process.env.RESEND_API_KEY;
  const savedOwner = process.env.OWNER_EMAIL;
  // Les cas de dégradation (email KO) loguent des erreurs ATTENDUES → on les
  // tait pour ne pas polluer la sortie CI (restauré en finally).
  const savedConsoleError = console.error;
  console.error = function () {};

  let rlAllowResult = true;
  let storedDocs = [];
  let fbConfigured = true;
  let lastEmail = null;
  let fetchOk = true;
  let mockUid = null;
  let inviteCodes = {};   // code -> data
  let privDocs = {};      // partnerId -> { uid, guest }
  let partnerDocs = {};   // partnerId -> carte
  let partnerUpdates = [];

  try {
    require.cache[rlPath] = { id: rlPath, filename: rlPath, loaded: true, exports: {
      allow: async () => rlAllowResult, clientIp: () => '127.0.0.1'
    } };
    const fakeAdmin = { firestore: { FieldValue: { serverTimestamp: () => '__TS__' } } };
    const mockDb = {
      collection: (name) => {
        if (name === 'partner_applications') {
          return { add: async (d) => { storedDocs.push(d); return { id: 'app_x' }; } };
        }
        if (name === 'invite_codes') {
          return { doc: (id) => ({
            get: async () => ({ exists: id in inviteCodes, data: () => inviteCodes[id] }),
            update: async (d) => { Object.assign(inviteCodes[id], d); }
          }) };
        }
        if (name === 'partners_private') {
          return { where: (f, op, v) => ({ limit: () => ({ get: async () => {
            const hits = Object.keys(privDocs).filter((k) => privDocs[k].uid === v);
            return { empty: hits.length === 0, docs: hits.map((k) => ({ id: k })) };
          } }) }) };
        }
        if (name === 'partners') {
          return { doc: (id) => ({
            get: async () => ({ exists: id in partnerDocs, data: () => partnerDocs[id] }),
            update: async (d) => { partnerUpdates.push({ id, d }); Object.assign(partnerDocs[id], d); }
          }) };
        }
        throw new Error('mock collection inconnue: ' + name);
      }
    };
    require.cache[fbPath] = { id: fbPath, filename: fbPath, loaded: true, exports: {
      getFirebase: () => fbConfigured
        ? { admin: fakeAdmin, db: mockDb }
        : { admin: null, db: null },
      verifyUid: async () => mockUid, verifyAdmin: async () => false
    } };
    global.fetch = async (url, opts) => {
      lastEmail = JSON.parse(opts.body);
      return { ok: fetchOk, status: fetchOk ? 200 : 502, json: async () => ({ id: 'email_x', message: 'err' }) };
    };
    process.env.RESEND_API_KEY = 'test';
    process.env.OWNER_EMAIL = 'owner@x.fr';

    delete require.cache[contactPath];
    const handler = require('../api/contact.js');

    const mockRes = () => ({
      _status: 0, _json: null,
      status(c) { this._status = c; return this; },
      json(j) { this._json = j; return this; },
      end() { return this; }
    });
    const call = async (body) => {
      const res = mockRes();
      await handler({ method: 'POST', headers: {}, body }, res);
      return res;
    };

    const base = {
      type: 'partner-application',
      name: 'Menuiserie Karayib', metier: 'Menuisier', email: 'jean@artisan.fr',
      tier: 'black', rulesAccepted: true
    };

    let r = await call(Object.assign({}, base, { rulesAccepted: false }));
    check('règles non acceptées → 400', r._status === 400 && !r._json.ok);

    r = await call(Object.assign({}, base, { email: 'pasunemail' }));
    check('email invalide → 400', r._status === 400);

    r = await call(Object.assign({}, base, { name: 'X' }));
    check('nom trop court → 400', r._status === 400);

    r = await call(Object.assign({}, base, { metier: '' }));
    check('métier manquant → 400', r._status === 400);

    storedDocs = []; lastEmail = null; fetchOk = true; fbConfigured = true;
    r = await call(Object.assign({}, base, {
      commune: 'Baie-Mahault', phone: '0690112233',
      sizes: { tshirt: 'L', pantalon: '42', pointure: '43', gants: 'M' },
      couleurs: 'Bleu et jaune', facebook: 'fb.com/menuiserie', instagram: '@menuiserie',
      pubChoice: 'meta', hasWebsite: true, websiteUrl: 'https://menuiserie.fr', siteOption: 'refonte',
      message: 'Très intéressé'
    }));
    check('valide → 200', r._status === 200 && r._json.ok);
    check('valide → stockée + emailée', r._json.stored === true && r._json.emailed === true);
    const doc = storedDocs[0] || {};
    check('doc : champs de base', doc.name === 'Menuiserie Karayib' && doc.metier === 'Menuisier' && doc.tier === 'black');
    check('doc : tailles collectées', doc.sizes && doc.sizes.tshirt === 'L' && doc.sizes.pointure === '43');
    check('doc : choix pub/site sanitisés', doc.pubChoice === 'meta' && doc.siteOption === 'refonte');
    check('doc : horodatage règles', doc.acceptedRulesAt === '__TS__' && doc.rulesAccepted === true);
    check('doc : status initial nouvelle', doc.status === 'nouvelle');
    check('email : sujet + destinataire', /Pré-inscription BLACK/.test(lastEmail.subject) && lastEmail.to === 'owner@x.fr');
    check('email : reply_to = candidat', lastEmail.reply_to === 'jean@artisan.fr');

    storedDocs = [];
    r = await call(Object.assign({}, base, { tier: 'platine', pubChoice: 'tiktok', siteOption: 'nimportequoi' }));
    const d2 = storedDocs[0] || {};
    check('enum tier invalide → black', d2.tier === 'black');
    check('enum pub invalide → aucun', d2.pubChoice === 'aucun');
    check('enum site invalide → aucun', d2.siteOption === 'aucun');

    storedDocs = [];
    const okLogo = 'data:image/webp;base64,' + 'A'.repeat(100);
    await call(Object.assign({}, base, { logo: okLogo }));
    check('logo dataURL valide conservé', (storedDocs[0] || {}).logo === okLogo);
    storedDocs = [];
    await call(Object.assign({}, base, { logo: 'https://evil.example/x.png' }));
    check('logo URL externe rejeté', (storedDocs[0] || {}).logo === '');
    storedDocs = [];
    await call(Object.assign({}, base, { logo: 'data:image/png;base64,' + 'A'.repeat(200000) }));
    check('logo trop lourd rejeté', (storedDocs[0] || {}).logo === '');

    fbConfigured = false; fetchOk = true; storedDocs = [];
    r = await call(base);
    check('Firebase absent + email OK → 200', r._status === 200 && r._json.stored === false && r._json.emailed === true);

    fbConfigured = true; fetchOk = false; storedDocs = [];
    r = await call(base);
    check('email KO mais stocké → 200', r._status === 200 && r._json.stored === true && r._json.emailed === false);

    fbConfigured = false; fetchOk = false;
    r = await call(base);
    check('Firebase absent + email KO → 502', r._status === 502 && !r._json.ok);

    rlAllowResult = false;
    r = await call(base);
    check('rate limit → 429', r._status === 429);
    rlAllowResult = true;

    r = await call(Object.assign({}, base, { honeypot: 'spam' }));
    check('honeypot → 200 filtré', r._status === 200 && r._json.filtered === true);

    // ── Codes d'invitation ──
    fbConfigured = true; fetchOk = true;
    inviteCodes = { 'PT-ABC123': { active: true, usedBy: '' } };
    storedDocs = [];
    r = await call(Object.assign({}, base, { inviteCode: 'pt-abc123' })); // minuscules → normalisé
    check('code valide → 200 + candidature invited + code enregistré',
      r._status === 200 && storedDocs[0] && storedDocs[0].invited === true && storedDocs[0].inviteCode === 'PT-ABC123');
    check('code valide → consommé (usedBy = email du candidat)', inviteCodes['PT-ABC123'].usedBy === 'jean@artisan.fr');
    check('email : sujet marqué INVITÉ', /INVITÉ/.test(lastEmail.subject));

    r = await call(Object.assign({}, base, { inviteCode: 'PT-ABC123' }));
    check('code DÉJÀ UTILISÉ → 400', r._status === 400 && /invalide|utilisé/i.test(r._json.error));

    r = await call(Object.assign({}, base, { inviteCode: 'INEXISTANT' }));
    check('code inexistant → 400', r._status === 400);

    inviteCodes['PT-OFF'] = { active: false, usedBy: '' };
    r = await call(Object.assign({}, base, { inviteCode: 'PT-OFF' }));
    check('code désactivé → 400', r._status === 400);

    fbConfigured = false;
    r = await call(Object.assign({}, base, { inviteCode: 'PT-ABC123' }));
    check('code fourni mais Firebase absent → 503 (jamais accordé sans vérif)', r._status === 503);
    fbConfigured = true;

    // ── uid vérifié rattaché à la candidature ──
    mockUid = 'uid_jean_123'; storedDocs = [];
    await call(base);
    check('uid vérifié (Bearer) stocké dans la candidature', storedDocs[0] && storedDocs[0].uid === 'uid_jean_123');
    mockUid = null; storedDocs = [];
    await call(base);
    check('sans session → uid vide', storedDocs[0] && storedDocs[0].uid === '');

    // ── Self-service carte artisan (partner-card-get / partner-card-media) ──
    mockUid = null;
    r = await call({ type: 'partner-card-get' });
    check('partner-card-get sans auth → 401', r._status === 401);

    mockUid = 'uid_wood_1';
    privDocs = {}; partnerDocs = {};
    r = await call({ type: 'partner-card-get' });
    check('partner-card-get sans carte liée → card:null', r._status === 200 && r._json.card === null);

    privDocs = { woodnova: { uid: 'uid_wood_1', guest: true } };
    partnerDocs = { woodnova: { name: 'WoodNova', metier: 'Charpentier', tier: 'black', logo: 'data:image/webp;base64,OLD', photos: ['data:image/webp;base64,P1'] } };
    r = await call({ type: 'partner-card-get' });
    check('partner-card-get avec carte liée → carte + plafond par tier',
      r._status === 200 && r._json.card && r._json.card.id === 'woodnova' && r._json.card.photosMax === 6 && r._json.card.photos.length === 1);

    const okImg = 'data:image/webp;base64,' + 'B'.repeat(50);
    partnerUpdates = [];
    r = await call({ type: 'partner-card-media', logo: okImg, photos: [okImg, 'https://evil.example/x.png', okImg] });
    const updD = (partnerUpdates[0] || {}).d || {};
    check('partner-card-media → photos/logo remplacés, URL externe REJETÉE',
      r._status === 200 && partnerUpdates.length === 1 && updD.logo === okImg && updD.photos.length === 2);
    check('partner-card-media → seuls photos/logo/updatedAt touchés',
      Object.keys(updD).sort().join(',') === 'logo,photos,updatedAt');

    // Un autre uid ne touche JAMAIS la carte d'autrui
    mockUid = 'uid_intrus';
    partnerUpdates = [];
    r = await call({ type: 'partner-card-media', logo: okImg, photos: [] });
    check('un AUTRE compte → card:null, aucune écriture', r._status === 200 && r._json.card === null && partnerUpdates.length === 0);
    mockUid = null;
  } finally {
    // Restauration stricte : la CI charge d'autres checks après celui-ci.
    if (savedRl) require.cache[rlPath] = savedRl; else delete require.cache[rlPath];
    if (savedFb) require.cache[fbPath] = savedFb; else delete require.cache[fbPath];
    if (savedContact) require.cache[contactPath] = savedContact; else delete require.cache[contactPath];
    if (savedFetch === undefined) delete global.fetch; else global.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedKey;
    if (savedOwner === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = savedOwner;
    console.error = savedConsoleError;
  }

  return errors;
};

if (require.main === module) {
  module.exports().then((e) => {
    if (e.length) { e.forEach((x) => console.error('  ❌ ' + x)); process.exit(1); }
    console.log('✅ check-partner-application OK');
  });
}
