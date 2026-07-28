// LES TROIS DÉFAUTS DU 27/07/2026, mesurés :
//  1. une commande ne doit JAMAIS ressembler à « aucune commande » quand le
//     serveur a refusé (429/401/503/réseau) ;
//  2. un verdict de rôle indéterminé ne doit PAS éjecter de l'espace livreur ;
//  3. une redirection de garde ne doit PAS piéger le bouton Retour.
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
const src = await readFile(ROOT+'/app.js','utf8');
const grab = (nom) => { const i=src.indexOf('function '+nom+'(');
  if(i<0) throw new Error(nom+' introuvable'); let d=0,j=src.indexOf('{',i);
  for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}
  throw new Error('accolades '+nom); };
const CODE = grab('lvFetchCourses')+'\n'+grab('lvErrTxt')+'\n'+grab('lvRenderErr');

const browser=await chromium.launch();
let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

// ═══ 1. Refus serveur → message explicite, JAMAIS « aucune livraison » ═══
console.log('\n━━ 1. Un refus du serveur ne doit pas ressembler à un vide ━━');
for (const [code, corps, attendu] of [
  [429, '{"ok":false,"error":"Trop de requêtes. Réessaie dans quelques minutes."}', 'Trop de requêtes'],
  [401, '{"ok":false,"error":"Connexion requise."}', 'session a expiré'],
  [503, '{"ok":false,"error":"Service momentanément indisponible."}', 'momentanément indisponible'],
  [502, '<html>Bad Gateway</html>', 'Erreur technique'],
  [0,   null, 'Connexion au serveur impossible']
]) {
  const ctx=await browser.newContext({viewport:{width:834,height:1194}});
  const page=await ctx.newPage();
  await page.goto(base+'/index.html?f='+code,{waitUntil:'domcontentloaded'});
  const r = await page.evaluate(async ({CODE, code, corps}) => {
    function jsonAuthHeaders(){return Promise.resolve({'Content-Type':'application/json'});}
    function apiBaseUrl(){return '';}
    function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    window.fetch = () => code===0 ? Promise.reject(new Error('offline'))
      : Promise.resolve({status:code, ok:code===200, text:()=>Promise.resolve(corps)});
    eval(CODE);
    const res = await lvFetchCourses();
    const el = document.createElement('div'); document.body.appendChild(el);
    let relance = 0;
    if(!res.ok) lvRenderErr(el, res.erreur, ()=>{relance++;});
    const b = el.querySelector('.lv-retry'); if(b) b.click();
    return { ok:res.ok, txt:el.textContent, relance, aBouton: !!b };
  }, {CODE, code, corps});
  T('  code ' + (code||'réseau coupé') + ' : message explicite',
    !r.ok && r.txt.indexOf(attendu)!==-1, r.txt.slice(0,58));
  T('  code ' + (code||'réseau coupé') + ' : jamais « aucune livraison »',
    r.txt.toLowerCase().indexOf('aucune livraison')===-1);
  T('  code ' + (code||'réseau coupé') + ' : bouton Réessayer qui relance', r.aBouton && r.relance===1);
  await ctx.close();
}
// réponse valide → ok
{
  const ctx=await browser.newContext(); const page=await ctx.newPage();
  await page.goto(base+'/index.html?f=ok',{waitUntil:'domcontentloaded'});
  const r = await page.evaluate(async (CODE) => {
    function jsonAuthHeaders(){return Promise.resolve({});} function apiBaseUrl(){return '';}
    function escapeHTML(s){return String(s);}
    window.fetch = () => Promise.resolve({status:200, ok:true,
      text:()=>Promise.resolve('{"ok":true,"mine":[{"id":"a","mine":true}],"dispo":[]}')});
    eval(CODE);
    const res = await lvFetchCourses();
    return {ok:res.ok, n:(res.data&&res.data.mine||[]).length};
  }, CODE);
  T('  réponse valide : la liste passe bien (1 course)', r.ok && r.n===1);
  await ctx.close();
}

// ═══ 2 & 3. Redirections de garde : elles ne doivent pas piéger le Retour ═══
console.log('\n━━ 2 & 3. Redirection de garde et bouton Retour ━━');
{
  const ctx=await browser.newContext({viewport:{width:834,height:1194}});
  const page=await ctx.newPage();
  await page.goto(base+'/index.html?g=1',{waitUntil:'domcontentloaded'});
  // On mesure la VRAIE fonction de redirection extraite d'app.js.
  const RED = grab('lvRedirect');
  const r = await page.evaluate(async ({RED}) => {
    eval(RED);
    location.hash = '#/catalogue';
    await new Promise(r=>setTimeout(r,60));
    const depart = { n: history.length, hash: location.hash };
    for (let i=0;i<5;i++){ lvRedirect('#/mes-livraisons'); await new Promise(r=>setTimeout(r,60)); }
    const apres = { n: history.length, hash: location.hash };
    history.back();
    await new Promise(r=>setTimeout(r,200));
    return { depart, apres, retour: location.hash, methode: String(lvRedirect) };
  }, {RED});
  T('  la redirection utilise location.replace (elle REMPLACE, elle n\'empile pas)',
    /location\.replace/.test(r.methode));
  T('  5 redirections de garde : ZÉRO entrée ajoutée à l\'historique',
    r.apres.n === r.depart.n, 'historique ' + r.depart.n + ' → ' + r.apres.n);
  T('  la redirection a bien eu lieu', r.apres.hash === '#/mes-livraisons', r.apres.hash);
  T('  le bouton Retour SORT de la page gardée (piège levé)',
    r.retour !== '#/mes-livraisons', 'retour → ' + r.retour);
  await ctx.close();
}
console.log('\n'+pass+' OK / '+fail+' KO');
await browser.close();server.close();
process.exit(fail?1:0);
