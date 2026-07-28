/* « Je veux accepter l'accord et ça ne marche pas ».
   On appelle la VRAIE fonction serveur, avec le MÊME compte des deux côtés
   (c'est le cas de test réel de l'user). */
'use strict';
const path = require('path'); const Module = require('module');
const ROOT = '/home/user/ish/pirates-tools';
process.env.RESEND_API_KEY='t'; process.env.OWNER_EMAIL='o@x.invalid';

const STORE = {};
function ref(coll, id) {
  const k = coll + '/' + id;
  const r = {
    get: async () => ({ exists: !!STORE[k], data: () => STORE[k] || {}, id }),
    set: async (v,o) => { STORE[k] = (o&&o.merge) ? Object.assign({},STORE[k]||{},v) : v; },
    update: async (v) => { STORE[k] = Object.assign({}, STORE[k]||{}, v); },
    collection: () => ({ add: async () => ({id:'m'}) })
  };
  return r;
}
const db = {
  collection: (c) => ({ doc: (id) => ref(c,id), add: async () => ({id:'x'}),
    where: () => ({ limit: () => ({ get: async () => ({ forEach: () => {} }) }) }),
    orderBy: () => ({ limit: () => ({ get: async () => ({ forEach: () => {} }) }) }),
    limit: () => ({ get: async () => ({ forEach: () => {} }) }) }),
  runTransaction: async (fn) => fn({
    get: (r) => r.get(),
    update: (r, v) => r.update(v),
    set: (r, v, o) => r.set(v, o)
  })
};
let EMAIL='justforwada@icloud.com';
const admin = { auth:()=>({ getUser: async()=>({email:EMAIL}) }),
  firestore:{ FieldValue:{ serverTimestamp:()=>new Date() } } };
const vraiResolve=Module._resolveFilename, vraiLoad=Module._load, FAUX={};
FAUX[path.join(ROOT,'api/_lib/firebase.js')]={ getFirebase:()=>({admin,db}),
  verifyUid: async(req)=> req.headers.authorization ? 'MOI' : null, verifyAdmin: async()=>false };
FAUX[path.join(ROOT,'api/_lib/ratelimit.js')]={ allow: async()=>true, clientIp:()=>'1.2.3.4' };
Module._load=function(r,p,m){ try{const f=vraiResolve.call(Module,r,p,m); if(FAUX[f])return FAUX[f];}catch(_){} return vraiLoad.apply(this,arguments); };
const courses=require(path.join(ROOT,'api/_lib/courses.js')); courses.sendMail=async()=>true;
const handler=require(path.join(ROOT,'api/contact.js'));

function res(){const r={code:0,body:null};r.status=c=>{r.code=c;return r;};r.json=o=>{r.body=o;return r;};r.end=()=>r;r.setHeader=()=>{};return r;}
async function call(body){const rr=res();await handler({method:'POST',headers:{authorization:'Bearer t'},body},rr);return rr;}

let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

(async()=>{
  // LE CAS RÉEL DE L'USER : le même compte est client ET livreur.
  STORE['courses/c1'] = { artisanUid:'MOI', courierUid:'MOI', status:'acceptee', round:1,
    artisanEmail:EMAIL, courierEmail:EMAIL, chatOpen:true, lines:[] };

  console.log('\n━━ MÊME COMPTE DES DEUX CÔTÉS (le cas de test de l\'user) ━━');
  let r = await call({ type:'course-accord-propose', id:'c1', role:'client',
    accord:{ prix:35, paiement:'especes', date:'', hour:'', lieu:'Portail bleu', notes:'' } });
  T('le client propose l\'accord', r.code===200, JSON.stringify(r.body&&r.body.accord||r.body));
  let a = STORE['courses/c1'].accord;
  T('  côté client signé, côté livreur PAS encore', a.okClient===true && a.okLivreur===false,
    'client='+a.okClient+' livreur='+a.okLivreur);
  T('  accord pas encore validé', a.valide===false);

  r = await call({ type:'course-accord-accept', id:'c1', role:'livreur' });
  T('LE LIVREUR ACCEPTE (le bug était ICI)', r.code===200, JSON.stringify(r.body));
  a = STORE['courses/c1'].accord;
  T('  côté livreur signé', a.okLivreur===true, 'livreur='+a.okLivreur);
  T('  ACCORD VALIDÉ des deux côtés', a.valide===true, 'valide='+a.valide);

  console.log('\n━━ DEUX COMPTES DIFFÉRENTS : le comportement ne change PAS ━━');
  STORE['courses/c2'] = { artisanUid:'MOI', courierUid:'AUTRE', status:'acceptee', round:1, lines:[] };
  r = await call({ type:'course-accord-propose', id:'c2', role:'client',
    accord:{ prix:40, paiement:'virement' } });
  T('le client propose', r.code===200);
  a = STORE['courses/c2'].accord;
  T('  seul le client a signé', a.okClient===true && a.okLivreur===false);
  // Le client tente de se faire passer pour le livreur : le rôle DÉCLARÉ doit
  // être IGNORÉ, puisqu'il n'est pas les deux parties.
  r = await call({ type:'course-accord-accept', id:'c2', role:'livreur' });
  a = STORE['courses/c2'].accord;
  T('un client NE PEUT PAS signer à la place du livreur en le déclarant',
    a.okLivreur===false && a.valide===false, 'livreur='+a.okLivreur+' valide='+a.valide);

  console.log('\n━━ Garde-fous conservés ━━');
  STORE['courses/c3'] = { artisanUid:'X', courierUid:'Y', status:'acceptee', round:1 };
  T('non-participant refusé', (await call({type:'course-accord-accept', id:'c3', role:'livreur'})).code===403);
  T('accord inexistant refusé', (await call({type:'course-accord-accept', id:'c2b', role:'client'})).code===404);
  T('prix hors bornes refusé',
    (await call({type:'course-accord-propose', id:'c1', role:'client', accord:{prix:99999,paiement:'especes'}})).code===400);

  console.log('\n'+pass+' OK / '+fail+' KO');
  process.exit(fail?1:0);
})();
