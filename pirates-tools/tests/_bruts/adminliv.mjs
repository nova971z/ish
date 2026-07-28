// L'administration doit distinguer un DOSSIER à traiter d'un LIVREUR ACTIF.
// On extrait les vraies fabriques de balisage d'app.js et on les exécute.
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT='/home/user/ish/pirates-tools';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 const fp=normalize(join(ROOT,p));if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end();}
 const st=await stat(fp).catch(()=>null);if(!st||!st.isFile()){res.writeHead(404);return res.end('nf');}
 res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'});res.end(await readFile(fp));}catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}`;
const src = await readFile(ROOT+'/app.js','utf8');
const grab = (n) => { const i=src.indexOf('function '+n+'(');
  if(i<0) throw new Error(n+' introuvable'); let d=0,j=src.indexOf('{',i);
  for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}
  throw new Error('accolades '+n); };
const cst = (re) => { const m = src.match(re); if(!m) throw new Error('constante introuvable: '+re); return m[0]; };
const CODE = [
  cst(/var LV_LINKS = \{[\s\S]*?\n  \};/),
  cst(/var LV_PIECES_BASE = \[[\s\S]*?\n  \];/),
  cst(/var LV_PIECES_EXTRA = \{[\s\S]*?\n  \};/),
  cst(/var LV_VEHICLES = \{[\s\S]*?\n  \};/),
  cst(/var LV_BAREME = \[[\s\S]*?\n  \];/),
  cst(/var _HTML_ESCAPES = \{[\s\S]*?\};/),
  grab('escapeHTML'), grab('lvVehLabel'), grab('isSafePartnerImg'),
  grab('adminCourierSection'), grab('adminCourierDossierHTML'), grab('adminCourierFicheHTML')
].join('\n');

const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:900,height:1200},deviceScaleFactor:2});
const page=await ctx.newPage();
await page.goto(base+'/index.html?adm=1',{waitUntil:'domcontentloaded'});
let pass=0,fail=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};

const PHOTO='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const r = await page.evaluate(({CODE, PHOTO}) => {
  eval(CODE);
  const attente = { uid:'U1', name:'Kevin Lambert', email:'k@ex.fr', phone:'0690112233',
    vehicle:'scooter', cylindree:'125', status:'en_attente', pieces:{ id:{name:'cni.jpg'} },
    piecesBypass:false, createdAt: 1750000000000 };
  const valideAvecFiche = { uid:'U2', name:'Nova', email:'n@ex.fr', phone:'0690445566',
    vehicle:'scooter', cylindree:'125', status:'valide', pieces:{}, piecesBypass:true,
    piecesManquantes:['id','siret'], createdAt: 1750000000000,
    profile:{ uid:'U2', displayName:'Nova', photo:PHOTO, commune:'Sainte-Anne',
      vehicle:'scooter', bio:'Rapide et soigneux.', tarifs:{1:22,2:48,3:74,4:120},
      available:true, published:true, coursesDone:7, ratingCount:4, ratingSum:19 } };
  const valideSansFiche = { uid:'U3', name:'Sans Fiche', email:'s@ex.fr', status:'valide',
    vehicle:'vae', pieces:{}, profile:null, createdAt: 1750000000000 };
  const refuse = { uid:'U4', name:'Refusé', email:'r@ex.fr', status:'refuse', vehicle:'vae', pieces:{} };

  const host = document.createElement('div');
  host.style.cssText='position:fixed;left:0;top:0;width:860px;background:#0a0f14;padding:16px;z-index:99999';
  host.className='admin-wrap'; host.id='__admLiv';
  host.innerHTML =
      adminCourierSection('📥 À traiter', [attente], adminCourierDossierHTML, 'Aucun dossier en attente.')
    + adminCourierSection('🛵 Livreurs actifs', [valideAvecFiche, valideSansFiche], adminCourierFicheHTML, '')
    + adminCourierSection('🚫 Refusés', [refuse], adminCourierDossierHTML, '');
  document.body.appendChild(host);

  const txt = host.textContent;
  const cartes = [...host.querySelectorAll('.admin-app')];
  const fiche = host.querySelector('.admin-courier-fiche');
  const photoImg = host.querySelector('.admin-courier-fiche__ph');
  // Le dossier VALIDÉ ne doit plus proposer « Valider » ni lister « manquante »
  const cartesValides = cartes.filter(c => /Nova|Sans Fiche/.test(c.textContent));
  return {
    nbCartes: cartes.length,
    aSectionATraiter: /À traiter/.test(txt),
    aSectionActifs: /Livreurs actifs/.test(txt),
    validesSansBoutonValider: cartesValides.every(c => !/✅ Valider/.test(c.textContent)),
    validesSansManquante: cartesValides.every(c => !/manquante/.test(c.textContent)),
    attenteAValider: cartes.some(c => /Kevin Lambert/.test(c.textContent) && /✅ Valider/.test(c.textContent)),
    attenteMontrePieces: cartes.some(c => /Kevin Lambert/.test(c.textContent) && /manquante/.test(c.textContent)),
    refuseAReactiver: cartes.some(c => /Refusé/.test(c.textContent) && /Réactiver/.test(c.textContent)),
    photoAffichee: !!photoImg && photoImg.tagName === 'IMG' && photoImg.getBoundingClientRect().width > 40,
    ficheMontreCommune: /Sainte-Anne/.test(txt),
    ficheMontreTarifs: /120 €/.test(txt),
    ficheMontreActivite: /7 courses livrées/.test(txt),
    ficheMontreNote: /4.8\/5|4,8\/5|⭐/.test(txt),
    ficheMontreDispo: /Disponible/.test(txt),
    sansFicheExplique: /pas encore rempli sa fiche publique/.test(txt),
    retraitAcces: (txt.match(/Retirer l'accès livreur/g) || []).length
  };
}, {CODE, PHOTO});

T('les 3 sections existent', r.aSectionATraiter && r.aSectionActifs, JSON.stringify({t:r.aSectionATraiter,a:r.aSectionActifs}));
T('4 cartes rendues', r.nbCartes === 4, 'n=' + r.nbCartes);
console.log('\n— dossier À TRAITER —');
T('  il propose « Valider »', r.attenteAValider);
T('  il liste les pièces manquantes', r.attenteMontrePieces);
console.log('\n— LIVREUR ACTIF (le défaut signalé) —');
T('  plus AUCUN bouton « Valider » sur un dossier validé', r.validesSansBoutonValider);
T('  plus AUCUNE ligne « manquante » sur un dossier validé', r.validesSansManquante);
T('  sa PHOTO DE PROFIL est affichée', r.photoAffichee);
T('  sa commune apparaît', r.ficheMontreCommune);
T('  ses tarifs apparaissent (dont son 120 € personnalisé)', r.ficheMontreTarifs);
T('  son activité apparaît (7 courses livrées)', r.ficheMontreActivite);
T('  sa note apparaît', r.ficheMontreNote);
T('  sa disponibilité apparaît', r.ficheMontreDispo);
T('  validé SANS fiche remplie : c\'est expliqué, pas vide', r.sansFicheExplique);
T('  chaque livreur actif peut voir son accès retiré', r.retraitAcces === 2, 'n=' + r.retraitAcces);
console.log('\n— dossier REFUSÉ —');
T('  il propose « Réactiver »', r.refuseAReactiver);

await page.locator('#__admLiv').screenshot({path:'/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/admin-livreurs.png'});
console.log('\n'+pass+' OK / '+fail+' KO   → capture : admin-livreurs.png');
await browser.close();server.close();
process.exit(fail?1:0);
