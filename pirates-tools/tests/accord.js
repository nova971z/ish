const { join, basename } = require('path');
const { RACINE } = require('./_socle.cjs');
/* « Je veux accepter l'accord et ça ne marche pas ».
   On appelle la VRAIE fonction serveur, avec le MÊME compte des deux côtés
   (c'est le cas de test réel de l'user). */
'use strict';
const path = require('path'); const Module = require('module');
const ROOT = RACINE;
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
  verifyUid: async(req)=> req.headers.authorization ? 'MOI' : null, verifyAdmin: async()=>false,
  // verifyIdentity ajoute le 28/07 (plan12 : adresse e-mail verifiee exigee).
  // Tout harnais qui stubbe _lib/firebase DOIT le fournir, sinon contact.js
  // plante avec « verifyIdentity is not a function ».
  verifyIdentity: async(req)=> req.headers.authorization
    ? { uid:'MOI', email:'moi@example.test', emailVerified:true } : null };
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
  let r = await call({ type:'course-accord-propose', id:'c1', role:'livreur',
    accord:{ prix:35, paiement:'especes', date:'', hour:'', lieu:'Portail bleu', notes:'' } });
  T('le livreur propose l\'accord', r.code===200, JSON.stringify(r.body&&r.body.accord||r.body));
  let a = STORE['courses/c1'].accord;
  T('  côté livreur signé, côté client PAS encore', a.okLivreur===true && a.okClient===false,
    'client='+a.okClient+' livreur='+a.okLivreur);
  T('  accord pas encore validé', a.valide===false);

  r = await call({ type:'course-accord-accept', id:'c1', role:'client' });
  T('LE CLIENT ACCEPTE (le bug du même compte était ICI)', r.code===200, JSON.stringify(r.body));
  a = STORE['courses/c1'].accord;
  T('  côté client signé à son tour', a.okClient===true, 'client='+a.okClient);
  T('  ACCORD VALIDÉ des deux côtés', a.valide===true, 'valide='+a.valide);

  console.log('\n━━ DEUX COMPTES DIFFÉRENTS : le comportement ne change PAS ━━');
  STORE['courses/c2'] = { artisanUid:'MOI', courierUid:'AUTRE', status:'acceptee', round:1, lines:[] };
  // ⚖️ RÈGLE RENVERSÉE LE 28/07 (v528) : le CLIENT ne propose JAMAIS de prix.
  // Ce harnais testait l'inverse. Plutôt que de le supprimer, on retourne
  // l'assertion : elle protège désormais la règle en vigueur.
  T('le CLIENT ne peut PAS proposer d\'accord (403 serveur, pas seulement l\'interface)',
    (await call({ type:'course-accord-propose', id:'c2', role:'client',
      accord:{ prix:60, paiement:'especes' } })).code === 403);

  // Le livreur (AUTRE) a proposé : on pose son accord tel que le serveur l'écrit.
  STORE['courses/c2'].accord = { prix:40, paiement:'virement', date:'', hour:'',
    when:'matin', lieu:'', notes:'', proposeBy:'AUTRE', proposeRole:'livreur',
    okClient:false, okLivreur:true, valide:false };
  // MOI est UNIQUEMENT le client de c2. Il déclare « livreur » pour tenter de
  // signer les deux côtés d'un coup : le rôle DÉCLARÉ doit être IGNORÉ,
  // puisqu'il n'est pas les deux parties (contrairement à c1).
  r = await call({ type:'course-accord-accept', id:'c2', role:'livreur' });
  a = STORE['courses/c2'].accord;
  T('le rôle DÉCLARÉ est ignoré : il signe côté client, pas côté livreur',
    a.okClient===true, 'client='+a.okClient);
  T('  et il n\'a donc pas signé À LA PLACE du livreur',
    a.proposeRole==='livreur' && a.okLivreur===true, 'livreur='+a.okLivreur);

  console.log('\n━━ Garde-fous conservés ━━');
  STORE['courses/c3'] = { artisanUid:'X', courierUid:'Y', status:'acceptee', round:1 };
  T('non-participant refusé', (await call({type:'course-accord-accept', id:'c3', role:'livreur'})).code===403);
  T('accord inexistant refusé', (await call({type:'course-accord-accept', id:'c2b', role:'client'})).code===404);
  // ⚠️ Sur une course NEUVE : l'accord de c1 est déjà validé à ce stade, et le
  // serveur refuse « déjà-validé » AVANT de regarder le prix — le test aurait
  // été vert pour la mauvaise raison.
  STORE['courses/c4'] = { artisanUid:'MOI', courierUid:'MOI', status:'acceptee', round:1, lines:[] };
  T('prix hors bornes refusé (garde-fou de frappe, pas un barème)',
    (await call({type:'course-accord-propose', id:'c4', role:'livreur', accord:{prix:99999,paiement:'especes'}})).code===400);

  console.log('\n'+pass+' OK / '+fail+' KO');
  process.exit(fail?1:0);
})();
