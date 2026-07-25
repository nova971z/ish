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

  try {
    require.cache[rlPath] = { id: rlPath, filename: rlPath, loaded: true, exports: {
      allow: async () => rlAllowResult, clientIp: () => '127.0.0.1'
    } };
    const fakeAdmin = { firestore: { FieldValue: { serverTimestamp: () => '__TS__' } } };
    require.cache[fbPath] = { id: fbPath, filename: fbPath, loaded: true, exports: {
      getFirebase: () => fbConfigured
        ? { admin: fakeAdmin, db: { collection: () => ({ add: async (d) => { storedDocs.push(d); return { id: 'app_x' }; } }) } }
        : { admin: null, db: null },
      verifyUid: async () => null, verifyAdmin: async () => false
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
