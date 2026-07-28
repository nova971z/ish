// Test du endpoint api/cron-report avec Firestore mocké + Resend intercepté.
const path = require('path');
const ROOT = '/home/user/ish/pirates-tools';

// ── Données Firestore simulées ──────────────────────────────────────────────
const NOW = Date.now();
const YEAR_MS = 365*24*3600*1000;
const store = {
  analytics_daily: {
    '2026-07-17': { sessions:7, pageViews:20, clicks:10, newVisitors:4, returningVisitors:3, device:{mobile:6,desktop:1}, source:{instagram:5,direct:2} },
    '2026-06-01': { sessions:5, pageViews:12, clicks:8 },
    '2024-01-01': { sessions:99, pageViews:99, clicks:99 } // > 14 mois → doit être purgé
  },
  analytics_products: { 'makita-dga504z': { productId:'makita-dga504z', views:30, addToCart:5, purchases:2, timeMsTotal:60000, timeSamples:20 } },
  analytics_clicks: { c1: { label:'chip:Meuleuses', count:14 } },
  analytics_geo: { FR: { country:'FR', count:12, lat:46, lng:2 } },
  analytics_visitors: {
    vFresh: { visits:3, lastSeen: NOW - 10*24*3600*1000 },
    vStale: { visits:1, lastSeen: NOW - 2*YEAR_MS } // inactif > 13 mois → purge
  }
};

const DOC_ID = { __docId:true };
function makeQuery(collName) {
  let filters = [];
  const q = {
    orderBy(){ return q; },
    limit(){ return q; },
    where(field, op, val){ filters.push({field, op, val}); return q; },
    async get(){
      let entries = Object.keys(store[collName]||{}).map(id => ({ id, data:store[collName][id] }));
      filters.forEach(f => {
        entries = entries.filter(e => {
          const v = (f.field === DOC_ID) ? e.id : e.data[f.field];
          if (f.op === '<') return v < f.val;
          return true;
        });
      });
      const docs = entries.map(e => ({ id:e.id, ref:{coll:collName, id:e.id}, data:()=>e.data }));
      return { docs, forEach:(cb)=>docs.forEach(cb) };
    }
  };
  return q;
}
const mockDb = {
  collection: (name) => makeQuery(name),
  batch: () => { const ops=[]; return { delete:(ref)=>ops.push(ref), commit: async ()=>{ ops.forEach(r=>{ delete store[r.coll][r.id]; }); } }; }
};
const mockAdmin = { firestore: { FieldPath: { documentId: () => DOC_ID }, FieldValue: { increment:(n)=>({__inc:n}) } } };

// Injecte les mocks dans les modules requis par le handler.
const firebase = require(path.join(ROOT,'api/_lib/firebase'));
firebase.getFirebase = () => ({ db: mockDb, admin: mockAdmin });

// Intercepte Resend.
let mail = null;
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).indexOf('api.resend.com') !== -1) { mail = JSON.parse(opts.body); return { ok:true, status:200, json: async()=>({id:'mock'}), text: async()=>'' }; }
  return realFetch(url, opts);
};

process.env.CRON_SECRET = 'topsecret';
process.env.RESEND_API_KEY = 'test';
process.env.RESEND_FROM = 'Pirates <x@y.z>';
process.env.OWNER_EMAIL = 'owner@example.com';

const handler = require(path.join(ROOT,'api/cron-report'));

function mockRes(){ const r={ _s:0,_j:null, status(s){this._s=s;return this;}, json(j){this._j=j;return this;}, end(){return this;} }; return r; }

(async ()=>{
  let pass=0,fail=0; const check=(n,ok,d)=>{console.log((ok?'✅':'❌')+' '+n+(d?' — '+d:'')); ok?pass++:fail++;};

  // 1) SANS auth → 401 (requireAdmin refuse, pas de secret) — on stub requireAdmin
  const auth = require(path.join(ROOT,'api/_lib/auth'));
  const realRequireAdmin = auth.requireAdmin;
  auth.requireAdmin = async () => ({ status:401, error:'Invalid admin credentials' });
  const resNo = mockRes();
  await handler({ method:'POST', headers:{} }, resNo);
  check('sans secret ni admin → 401', resNo._s===401, 'status='+resNo._s);
  auth.requireAdmin = realRequireAdmin;

  // 2) Avec CRON_SECRET → 200 + mail + purge
  const res = mockRes();
  await handler({ method:'POST', headers:{ authorization:'Bearer topsecret' } }, res);
  check('cron autorisé → 200', res._s===200, 'status='+res._s);
  check('réponse sent=true', res._j && res._j.sent===true, JSON.stringify(res._j));
  check('période = juillet '+new Date(NOW).getUTCFullYear(), res._j && /\d{4}/.test(res._j.period), res._j&&res._j.period);

  // Mail
  check('mail envoyé à OWNER_EMAIL', mail && mail.to==='owner@example.com');
  check('sujet contient la période', mail && /Rapport d'audience/.test(mail.subject));
  check('pièce jointe JSON présente', mail && mail.attachments && /\.json$/.test(mail.attachments[0].filename), mail&&mail.attachments&&mail.attachments[0].filename);
  let parsed=null; try { parsed = JSON.parse(Buffer.from(mail.attachments[0].content,'base64').toString('utf8')); } catch(_){}
  check('JSON joint valide + analysable (totaux + produits)', parsed && parsed.totals && Array.isArray(parsed.topProducts), parsed?('sessions='+parsed.totals.sessions):'illisible');
  check('HTML rapport contient les visites', mail && /Visites/.test(mail.html));

  // Purge
  check('purge daily > 14 mois (2024-01-01 supprimé)', !store.analytics_daily['2024-01-01'] && !!store.analytics_daily['2026-07-17'], 'reste='+Object.keys(store.analytics_daily).join(','));
  check('purge visiteur inactif > 13 mois (vStale supprimé, vFresh gardé)', !store.analytics_visitors.vStale && !!store.analytics_visitors.vFresh);
  check('compteurs de purge renvoyés', res._j.purged && res._j.purged.daily===1 && res._j.purged.visitors===1, JSON.stringify(res._j.purged));

  console.log(`\n${pass}/${pass+fail} assertions vertes`);
  process.exit(fail?1:0);
})();
