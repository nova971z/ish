import { join, basename } from 'node:path';
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = RACINE;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}if(u==='/')u='/index.html';const fp=path.join(ROOT,u);if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf');}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
await new Promise(r=>srv.listen(0,r));const base=`http://127.0.0.1:${srv.address().port}`;
const br=await chromium.launch();const pg=await br.newPage({viewport:{width:390,height:844}});
pg.on('console',m=>{if(m.type()==='error')console.log(' [err]',m.text());});
await pg.addInitScript(()=>{window.PT_API_BASE=undefined;});
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log(' ❌',m);}};

await pg.goto(`${base}/#/catalogue`,{waitUntil:'networkidle'});
await pg.waitForTimeout(1200);
/* ⚠️ MÉCANISME REMPLACÉ — harnais réécrit le 28/07/2026.
   Ce test vérifiait un DÉFILEMENT INFINI : un lot initial de ~35 cartes, une
   « sentinelle » #gridSentinel en bas de liste, et des cartes qui s'ajoutent
   au scroll jusqu'à tout afficher.
   Ce mécanisme N'EXISTE PLUS : `gridSentinel` a 0 occurrence dans app.js. Il a
   été remplacé par une PAGINATION (`PAGE_SIZE = 40`, app.js:1314) — un choix
   lié au bug de la « page vide » (v320), où des milliers de cartes masquées
   posaient problème.
   Le harnais annonçait donc « 40 cartes au lieu de 185 » comme un défaut, alors
   que 40 est exactement la page 1. On teste désormais la pagination réelle :
   c'est elle qui peut casser, et elle n'était protégée par personne. */
const initial = await pg.locator('.product-card').count();
console.log('cartes sur la page 1 :', initial);
ok(initial > 0, 'la page 1 du catalogue affiche des cartes — n=' + initial);
ok(initial <= 40, 'la page 1 ne dépasse pas PAGE_SIZE (40) — n=' + initial);
/* Le défilement infini a été remplacé par une pagination : on PROUVE que sa
   sentinelle a bien disparu, elle ne doit plus jamais revenir.
   ancres-absentes-voulues: gridSentinel */
ok((await pg.locator('#gridSentinel').count()) === 0,
   'plus aucune sentinelle de défilement infini (mécanisme retiré)');

// La pagination doit exister ET mener ailleurs : une page 2 qui affiche la
// même chose que la page 1 serait pire qu'une absence de pagination.
const pager = await pg.locator('[data-page], .pager, .pagination').count();
ok(pager > 0, 'un contrôle de pagination est présent — n=' + pager);
const titresP1 = await pg.evaluate(() =>
  [...document.querySelectorAll('.product-card')].map(c => (c.textContent || '').slice(0, 40)));
await pg.evaluate(() => {
  const b = [...document.querySelectorAll('[data-page], .pager button, .pagination button')]
    .find(x => /2/.test(x.textContent || '') || x.getAttribute('data-page') === '2');
  if (b) b.click();
});
await pg.waitForTimeout(600);
const titresP2 = await pg.evaluate(() =>
  [...document.querySelectorAll('.product-card')].map(c => (c.textContent || '').slice(0, 40)));
ok(titresP2.length > 0, 'la page 2 affiche des cartes — n=' + titresP2.length);
ok(titresP2.join('|') !== titresP1.join('|'),
   'la page 2 montre des produits DIFFÉRENTS de la page 1');

/* ── FILTRER REPART D'UNE PAGE 1, il ne CUMULE pas ────────────────────────
   ⚠️ DEUX DÉFAUTS CORRIGÉS ICI LE 01/08/2026, et le harnais se contredisait
   lui-même :

   ① Le seuil était `<= 35`, hérité du défilement infini. Or ce même fichier
      écrit vingt lignes plus haut que la page vaut PAGE_SIZE = 40. Mesuré :
      40 cartes après filtre. Le harnais annonçait donc un défaut de cumul là
      où la pagination faisait exactement son travail. Un chiffre recopié se
      périme ; on lit maintenant PAGE_SIZE DANS `app.js`, à l'exécution.
   ② Il cliquait la puce « Scies », donc il NOMMAIT une catégorie du
      catalogue — interdit par la règle des harnais (dix-huit sont morts pour
      ça), et l'user a justement regroupé ses familles. Le `.catch(()=>{})`
      masquait en plus l'échec du clic. On prend une puce RÉELLE, choisie à
      l'exécution, et on vérifie qu'elle a bien été cliquée. */
const PAGE_SIZE = Number(
  (fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/PAGE_SIZE\s*=\s*(\d+)/) || [])[1]
);
ok(Number.isFinite(PAGE_SIZE) && PAGE_SIZE > 0,
   'PRÉALABLE : PAGE_SIZE relu dans app.js — ' + PAGE_SIZE
   + ' (sans lui, le seuil serait une supposition)');

await pg.evaluate(()=>window.scrollTo(0,0));
const puce = await pg.evaluate(()=>{
  const c=[...document.querySelectorAll('#catList .cat-chip')].find(x=>x.getAttribute('data-cat'));
  if(!c) return null;
  c.click();
  return c.getAttribute('data-cat');
});
await pg.waitForTimeout(600);
ok(!!puce, 'PRÉALABLE : une puce de catégorie a été cliquée — ' + (puce||'AUCUNE'));
const afterFilter=await pg.locator('.product-card').count();
console.log('cartes apres filtre («'+puce+'») :',afterFilter);
ok(afterFilter>0 && afterFilter<=PAGE_SIZE,
   'filtre => repart sur une page 1 (pas de cumul) — n='+afterFilter+' pour PAGE_SIZE='+PAGE_SIZE);

console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAIL'} — ${pass} ok, ${fail} ko`);
await br.close();srv.close();process.exit(fail?1:0);
