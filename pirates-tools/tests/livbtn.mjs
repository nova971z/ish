// « Mode livraison » : le bouton ne doit JAMAIS disparaître à cause d'un
// verdict raté. On rejoue les 4 situations réelles.
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 const fp=normalize(join(ROOT,p));if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end();}
 const st=await stat(fp).catch(()=>null);if(!st||!st.isFile()){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'});res.end(await readFile(fp));}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}`;

// Le code réel de lvGetRole/updateAccLivBtn est enfermé dans l'IIFE : on le
// RÉ-EXTRAIT du fichier source et on l'exécute tel quel, pour tester la VRAIE
// logique et pas une copie qui pourrait diverger.
const src = await readFile(ROOT+'/app.js','utf8');
const grab = (nom) => {
  const i = src.indexOf('function '+nom+'(');
  if (i<0) throw new Error('fonction '+nom+' introuvable');
  let d=0, j=src.indexOf('{',i);
  for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d)return src.slice(i,k+1);} }
  throw new Error('accolades');
};
// Les deux variables d'état vivent hors des fonctions : on les reprend AUSSI
// depuis la source, pour ne rien réinventer.
const etat = src.match(/var _lvRoleVerdict[^\n]*\n\s*var _lvRoleInflight[^\n]*\n\s*var _lvRoleAt[^\n]*/);
if(!etat) throw new Error('etat du role introuvable dans app.js');
const ttl = src.match(/var LV_ROLE_TTL = \d+;/);
if(!ttl) throw new Error('LV_ROLE_TTL introuvable');
const CODE = etat[0]+'\n'+ttl[0]+'\n'+grab('lvGetRole')+'\n'+grab('lvResetRole')+'\n'+grab('updateAccLivBtn');

const browser=await chromium.launch();
let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

async function scenario(nom, opts) {
  const ctx=await browser.newContext({viewport:{width:834,height:1194}});
  const page=await ctx.newPage();
  await page.goto(base+'/index.html?lb='+encodeURIComponent(nom),{waitUntil:'domcontentloaded'});
  const r = await page.evaluate(async ({CODE, o}) => {
    document.body.insertAdjacentHTML('beforeend',
      '<a id="accLivBtn" href="#/mode-livraison" hidden>Mode livraison</a>');
    // Décor : les variables dont dépend le code extrait.
    var _authReady=false, _currentUser=null;
    window.__setAuth=(u)=>{_currentUser=u;_authReady=true;};
    function whenAuthReady(){ if(_authReady) return Promise.resolve();
      return new Promise(res=>{const t=setInterval(()=>{if(_authReady){clearInterval(t);res();}},20);
        setTimeout(()=>{clearInterval(t);res();}, o.plafond||600);}); }
    function lvIsTester(){ try{return !!(_currentUser&&_currentUser.email&&
      ['justforwada@icloud.com'].indexOf(String(_currentUser.email).toLowerCase())!==-1);}catch(e){return false;} }
    function jsonAuthHeaders(){ return Promise.resolve({'Content-Type':'application/json'}); }
    function apiBaseUrl(){ return ''; }
    window.fetch = () => o.reseau==='ko' ? Promise.reject(new Error('offline'))
      : o.http===401 ? Promise.resolve({ok:false,status:401,json:()=>Promise.resolve({ok:false,error:'Connexion requise.'})})
      : Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({ok:true,courier:o.courier})});
    eval(CODE);
    const btn=document.getElementById('accLivBtn');
    const trace=[];
    const snap=(q)=>trace.push(q+':'+(btn.hidden?'masqué':'VISIBLE'));

    updateAccLivBtn();                       // rendu de la page compte
    snap('t0 (page peinte)');
    await new Promise(r=>setTimeout(r, o.authApres||0));
    if(o.user!==false){ window.__setAuth({email:'justforwada@icloud.com'});
      updateAccLivBtn(); }                   // ← ce que fait onAuthStateChanged
    await new Promise(r=>setTimeout(r,300));
    snap('t1 (identité connue)');
    // 2e visite de la page compte (l'user rebascule d'onglet)
    updateAccLivBtn();
    await new Promise(r=>setTimeout(r,300));
    snap('t2 (retour sur le compte)');
    return {trace, final:!btn.hidden};
  }, {CODE, o:opts});
  console.log('\n── '+nom);
  console.log('   '+r.trace.join('  →  '));
  await ctx.close();
  return r.final;
}

// Verdict SÛR (livreur) puis panne réseau : l'état acquis ne doit pas tomber.
async function scenarioPanneApres() {
  const ctx = await browser.newContext({viewport:{width:834,height:1194}});
  const page = await ctx.newPage();
  await page.goto(base+'/index.html?lb=panne-apres', {waitUntil:'domcontentloaded'});
  const r = await page.evaluate(async ({CODE}) => {
    document.body.insertAdjacentHTML('beforeend', '<a id="accLivBtn" hidden>Mode livraison</a>');
    var _authReady = true, _currentUser = {email:'x@y.z'};
    function whenAuthReady(){ return Promise.resolve(); }
    function lvIsTester(){ return false; }
    function jsonAuthHeaders(){ return Promise.resolve({}); }
    function apiBaseUrl(){ return ''; }
    let mode = 'ok';
    window.fetch = () => mode === 'ok'
      ? Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({ok:true,courier:true})})
      : Promise.reject(new Error('offline'));
    eval(CODE);
    const btn = document.getElementById('accLivBtn');
    updateAccLivBtn();
    await new Promise(r=>setTimeout(r,200));
    const apresOk = !btn.hidden;
    // Le réseau tombe. On NE remet PAS le rôle à zéro : lvResetRole() veut
    // dire « change de compte, oublie tout », et refermer le bouton y est
    // alors LÉGITIME. Ici on rejoue simplement un changement de page.
    mode = 'ko';
    updateAccLivBtn();
    await new Promise(r=>setTimeout(r,200));
    return { apresOk, apresPanne: !btn.hidden };
  }, {CODE});
  await ctx.close();
  console.log('\n── verdict sûr puis panne');
  console.log('   verdict sûr:' + (r.apresOk ? 'VISIBLE' : 'masqué')
    + '  →  panne réseau:' + (r.apresPanne ? 'VISIBLE' : 'masqué'));
  return r.apresOk && r.apresPanne;
}

// L'administration valide le dossier PENDANT que la personne est connectée.
// Sans durée de vie sur le verdict, elle resterait dehors jusqu'à la fermeture
// complète du site — panne vécue le 27/07/2026.
async function scenarioValideEnCours() {
  const ctx = await browser.newContext({viewport:{width:834,height:1194}});
  const page = await ctx.newPage();
  await page.goto(base+'/index.html?lb=valide-pendant', {waitUntil:'domcontentloaded'});
  const r = await page.evaluate(async ({CODE}) => {
    document.body.insertAdjacentHTML('beforeend', '<a id="accLivBtn" hidden>Mode livraison</a>');
    var _authReady = true, _currentUser = {email:'x@y.z'};
    function whenAuthReady(){ return Promise.resolve(); }
    function lvIsTester(){ return false; }
    function jsonAuthHeaders(){ return Promise.resolve({}); }
    function apiBaseUrl(){ return ''; }
    let estLivreur = false;                       // pas encore validé
    let appels = 0;
    window.fetch = () => { appels++; return Promise.resolve({ok:true,status:200,
      json:()=>Promise.resolve({ok:true,courier:estLivreur})}); };
    eval(CODE);
    const btn = document.getElementById('accLivBtn');
    updateAccLivBtn();
    await new Promise(r=>setTimeout(r,150));
    const avant = !btn.hidden;
    estLivreur = true;                            // ← l'admin vient de valider
    // Dans la minute qui suit, le verdict est encore en cache : normal.
    updateAccLivBtn();
    await new Promise(r=>setTimeout(r,150));
    const pendantCache = !btn.hidden;
    const appelsCache = appels;
    // Passé le délai, il DOIT se revérifier tout seul.
    LV_ROLE_TTL = 0;
    updateAccLivBtn();
    await new Promise(r=>setTimeout(r,150));
    return { avant, pendantCache, apres: !btn.hidden, cacheEfficace: appelsCache === 1 };
  }, {CODE});
  await ctx.close();
  console.log('\n── validation admin pendant la session');
  console.log('   avant:' + (r.avant?'VISIBLE':'masqué')
    + '  →  juste après (cache):' + (r.pendantCache?'VISIBLE':'masqué')
    + '  →  après expiration:' + (r.apres?'VISIBLE':'masqué'));
  return !r.avant && r.cacheEfficace && r.apres;
}

T('cas normal (livreur, réseau OK) : bouton visible',
  await scenario('normal', {courier:true, authApres:0}));
T('identité qui arrive APRÈS le plafond (Safari privé à froid) : bouton visible',
  await scenario('auth tardive', {courier:true, authApres:800, plafond:300}));
// Depuis le 27/07/2026, plus AUCUN compte n'est livreur « d'office » : le
// bouton reste fermé tant que le serveur n'a pas dit oui. La règle qui compte
// devient donc : un verdict INDÉTERMINÉ ne doit RIEN changer — ni ouvrir le
// bouton à tort, ni le refermer alors qu'on savait déjà que c'est un livreur.
T('verdict indéterminé (réseau coupé) : le bouton n\'est PAS ouvert à tort',
  (await scenario('reseau ko', {courier:true, reseau:'ko'})) === false);
T('verdict indéterminé (401) : le bouton n\'est PAS ouvert à tort',
  (await scenario('http 401', {courier:true, http:401})) === false);
T('livreur CONFIRMÉ puis panne : le bouton reste OUVERT (on ne le referme pas)',
  await scenarioPanneApres());
const pasLivreur = await scenario('vrai non-livreur', {courier:false});
T('vrai NON-livreur : le bouton reste bien masqué', pasLivreur===false);
T('dossier validé PENDANT la session : l\'accès s\'ouvre sans fermer le site',
  await scenarioValideEnCours());

console.log('\n'+pass+' OK / '+fail+' KO');
await browser.close();server.close();
process.exit(fail?1:0);
