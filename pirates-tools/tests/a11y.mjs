// AUDIT P9 — accessibilité et robustesse, MESURÉ au navigateur.
// Rien n'est affirmé sans chiffre : contrastes calculés sur les styles
// RÉELLEMENT appliqués, cibles tactiles mesurées en pixels, débordement
// horizontal mesuré, comportement testé avec stockage plein et réseau coupé.
import { playwright, RACINE } from './_socle.mjs';
const pkg = await playwright();
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = RACINE;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
const server = http.createServer(async (req,res)=>{ try{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const fp=normalize(join(ROOT,p)); if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end();}
  const st=await stat(fp).catch(()=>null); if(!st||!st.isFile()){res.writeHead(404);return res.end('nf');}
  res.writeHead(200,{'Content-Type':MIME[extname(fp)]||'application/octet-stream'}); res.end(await readFile(fp));
} catch(e){res.writeHead(500);res.end(String(e));} });
await new Promise(r=>server.listen(0,r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:1194,height:834} });
await ctx.route('**/*', r => /googleapis|gstatic|jsdelivr|stripe|firebase|coingecko|unpkg|tile\.|api-adresse|osrm/.test(r.request().url()) ? r.abort() : r.continue());
const page = await ctx.newPage();
page.on('pageerror', e => console.log('💥 JS:', e.message));

let pass=0, fail=0, warn=0;
const T=(n,ok,x='')=>{ok?pass++:fail++;console.log((ok?'✅':'❌')+' '+n+(x?' — '+x:''));};
const W=(n,x='')=>{warn++;console.log('⚠️  '+n+(x?' — '+x:''));};
let bootN=0;
const boot=async h=>{ await page.goto(base+'/index.html?b='+(++bootN)+h,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(700); };

// ── Fonctions injectées : calcul de contraste WCAG sur les styles RÉELS ────
const A11Y = () => {
  window.__lum = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    const f = (v) => { v = parseFloat(v)/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return { L: 0.2126*f(m[1]) + 0.7152*f(m[2]) + 0.0722*f(m[3]), a,
             rgb: [parseFloat(m[1]),parseFloat(m[2]),parseFloat(m[3])] };
  };
  // Fond EFFECTIF : remonte les ancêtres jusqu'à un fond opaque.
  window.__bg = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const p = window.__lum(c);
      if (p && p.a >= 0.9) return p;
      n = n.parentElement;
    }
    return window.__lum(getComputedStyle(document.body).backgroundColor) || { L: 0, a: 1, rgb:[0,0,0] };
  };
  window.__ratio = (a, b) => (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05);
};

// ═══ 1. CONTRASTES (WCAG 2.1 AA : 4,5:1 texte normal, 3:1 grand texte) ════
console.log('\n━━ P9.1 — CONTRASTES, calculés sur les styles réellement appliqués ━━');
await boot('#/');
await page.evaluate(A11Y);
let r = await page.evaluate(() => {
  const out = [];
  const els = document.querySelectorAll('#view-home *, .site-footer *, .topbar *'   /* #view-accueil n'a jamais existé : la vue s'appelle #view-home */);
  els.forEach((el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!txt.length) return;
    const cs = getComputedStyle(el);
    const fg = window.__lum(cs.color);
    if (!fg || fg.a < 0.5) return;
    const bg = window.__bg(el);
    const ratio = window.__ratio(fg.L, bg.L);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const grand = size >= 24 || (size >= 18.66 && bold);
    const seuil = grand ? 3 : 4.5;
    if (ratio < seuil) {
      out.push({ t: el.textContent.trim().slice(0, 32), r: +ratio.toFixed(2), seuil,
                 px: Math.round(size), sel: el.className || el.tagName });
    }
  });
  return out;
});
console.log('  éléments textuels sous le seuil WCAG AA : ' + r.length);
r.slice(0, 10).forEach(x => console.log('     ' + String(x.r).padStart(5) + ':1  (seuil ' + x.seuil
  + ')  ' + String(x.px).padStart(2) + 'px  « ' + x.t + ' »'));
T('Accueil : aucun texte sous le seuil de contraste WCAG AA', r.length === 0, r.length + ' élément(s)');

// ═══ 2. NOMS ACCESSIBLES ═════════════════════════════════════════════════
console.log('\n━━ P9.2 — NOMS ACCESSIBLES (lecteur d\'écran) ━━');
r = await page.evaluate(() => {
  const nu = [];
  document.querySelectorAll('button, a[href], input, select, textarea').forEach((el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
    if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) return;
    if (el.tabIndex < 0) return;
    // PIÈGE : el.textContent d'un <a> ne contenant qu'une <img> vaut "\n   "
    // — non vide mais BLANC. Un « || » naïf s'y arrête et n'atteint jamais
    // l'alt de l'image. On coupe CHAQUE candidat avant de choisir.
    const img = el.querySelector && el.querySelector('img[alt]');
    const cands = [el.getAttribute('aria-label'), el.getAttribute('title'),
      (el.labels && el.labels.length ? el.labels[0].textContent : ''),
      el.textContent, el.getAttribute('alt'), (img ? img.getAttribute('alt') : ''),
      el.getAttribute('placeholder')];
    const nom = cands.map(c => (c || '').trim()).find(c => c) || '';
    if (!nom) nu.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + (el.className||'').split(' ')[0]));
  });
  return nu;
});
console.log('  éléments interactifs sans nom accessible : ' + r.length);
r.slice(0, 8).forEach(x => console.log('     ' + x));
T('Tout élément interactif visible porte un nom accessible', r.length === 0, r.length + ' sans nom');

// ═══ 3. FOCUS VISIBLE ════════════════════════════════════════════════════
console.log('\n━━ P9.3 — FOCUS VISIBLE AU CLAVIER ━━');
const focusables = await page.evaluate(() => document.querySelectorAll('button, a[href], input').length);
let sansFocus = 0, testes = 0;
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Tab');
  const v = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
      || cs.boxShadow !== 'none' || cs.borderColor !== getComputedStyle(el.parentElement || document.body).borderColor;
    return { tag: el.tagName + (el.id ? '#' + el.id : ''), visible };
  });
  if (!v) continue;
  testes++;
  if (!v.visible) { sansFocus++; if (sansFocus <= 3) console.log('     sans indicateur : ' + v.tag); }
}
console.log('  ' + testes + ' éléments parcourus au clavier sur ' + focusables + ' focusables');
T('Chaque élément atteint au clavier montre un indicateur de focus', sansFocus === 0, sansFocus + ' sans indicateur');

// ═══ 4. iPad DANS LES DEUX ORIENTATIONS ══════════════════════════════════
console.log('\n━━ P9.4 — iPad : paysage 1194×834 et portrait 834×1194 ━━');
for (const [w, h, nom] of [[1194, 834, 'paysage'], [834, 1194, 'portrait']]) {
  await page.setViewportSize({ width: w, height: h });
  for (const route of ['#/', '#/catalogue', '#/livraison', '#/devis']) {
    await boot(route);
    const m = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      // WCAG 2.2 — 2.5.8 « Taille de cible (minimum) », niveau AA : 24×24 px
      // CSS, SAUF si l'espacement suffit (un disque de 24 px centré sur la
      // cible ne croise le disque d'aucune autre cible) ou si la cible est en
      // ligne dans du texte. On applique la règle COMPLÈTE, exception incluse
      // — sinon on compte des faux positifs (liens de phrase, etc.).
      cibles: (() => {
        const els = [...document.querySelectorAll('button, a[href], input, select')]
          .filter((el) => el.offsetParent && el.getBoundingClientRect().width > 0);
        const boxes = els.map((el) => {
          const b = el.getBoundingClientRect();
          return { el, cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height };
        });
        const enLigne = (el) => {
          if (el.tagName !== 'A') return false;
          const p = el.parentElement;
          if (!p) return false;
          return getComputedStyle(el).display === 'inline'
            && [...p.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
        };
        // Exception « Équivalent » (2.5.8) : la fonction est atteignable par un
        // AUTRE contrôle de la même page qui, lui, respecte le critère. Chaque
        // dérogation est NOMMÉE et son équivalent VÉRIFIÉ ici même — sinon
        // c'est une excuse, pas une exception.
        const EQUIV = [{
          cls: 'tools-3d-dot',
          par: '.tools-3d-prev, .tools-3d-next',
          quoi: 'pastilles du carrousel 3D — les flèches Précédent/Suivant font la même chose'
        }];
        const equivalent = (el) => EQUIV.some((e) => {
          if (!el.classList.contains(e.cls)) return false;
          return [...document.querySelectorAll(e.par)].some((c) => {
            const b = c.getBoundingClientRect();
            return c.offsetParent && b.width >= 24 && b.height >= 24;
          });
        });

        const ko = [];
        boxes.forEach((a) => {
          if (a.w >= 24 && a.h >= 24) return;
          if (enLigne(a.el)) return;
          if (equivalent(a.el)) return;
          // Exception d'espacement : aucun autre disque de 24 px ne chevauche.
          const serre = boxes.some((b) => b !== a
            && Math.hypot(a.cx - b.cx, a.cy - b.cy) < 24);
          if (!serre) return;
          ko.push(Math.round(a.w) + '×' + Math.round(a.h) + ' '
            + a.el.tagName.toLowerCase()
            + (a.el.id ? '#' + a.el.id : '.' + String(a.el.className || '').split(' ')[0])
            + ' « ' + (a.el.textContent || a.el.getAttribute('aria-label') || '').trim().slice(0, 20) + ' »');
        });
        return ko;
      })()
    }));
    m.petits = m.cibles.length;
    const deborde = m.docW > m.winW + 1;
    T('  ' + nom + ' ' + route.padEnd(12) + ' aucun débordement horizontal',
      !deborde, deborde ? m.docW + 'px > ' + m.winW + 'px' : m.docW + 'px');
    if (m.petits > 0) {
      W('  ' + nom + ' ' + route + ' : ' + m.petits
        + ' cible(s) sous 24×24 px SANS espacement suffisant (WCAG 2.5.8 AA)');
      m.cibles.forEach((c) => console.log('        ' + c));
    }
  }
}
await page.setViewportSize({ width: 1194, height: 834 });

// ═══ 5. ROBUSTESSE : STOCKAGE PLEIN ══════════════════════════════════════
console.log('\n━━ P9.5 — ROBUSTESSE : stockage local saturé (Safari privé) ━━');
await page.goto(base + '/index.html?b=99#/catalogue', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  // Simule le quota atteint : toute écriture lève, comme en navigation privée
  // Safari quand la limite est franchie.
  const vrai = Storage.prototype.setItem;
  Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError'); };
  window.__restore = () => { Storage.prototype.setItem = vrai; };
});
let erreurs = 0;
page.on('pageerror', () => erreurs++);
await page.waitForFunction(()=>window.PT_BOOTED===true,{timeout:15000}).catch(()=>{});
await page.waitForTimeout(600);
r = await page.evaluate(() => {
  // Actions qui écrivent dans le stockage : panier, favoris, territoire.
  let plante = 0;
  try { const b = document.querySelector('[data-wishlist-id]'); if (b) b.click(); } catch (e) { plante++; }
  try { const c = document.querySelector('[data-action="add-to-cart"], #pdpQuote'); if (c) c.click(); } catch (e) { plante++; }
  return { plante, visible: !!document.querySelector('#list .product-card'), booted: window.PT_BOOTED === true };
});
T('Stockage saturé : l\'application démarre quand même', r.booted === true);
T('Stockage saturé : le catalogue reste affiché', r.visible === true);
T('Stockage saturé : aucune action ne lève d\'exception non gérée', r.plante === 0 && erreurs === 0,
  'exceptions=' + erreurs);
await page.evaluate(() => window.__restore && window.__restore());

// ═══ 6. ROBUSTESSE : RÉSEAU COUPÉ ════════════════════════════════════════
console.log('\n━━ P9.6 — ROBUSTESSE : réseau coupé après chargement ━━');
await boot('#/catalogue');
await ctx.setOffline(true);
r = await page.evaluate(async () => {
  const avant = document.querySelectorAll('#list .product-card').length;
  location.hash = '#/devis';
  await new Promise(r => setTimeout(r, 400));
  location.hash = '#/catalogue';
  await new Promise(r => setTimeout(r, 600));
  return { avant, apres: document.querySelectorAll('#list .product-card').length,
           vueVide: document.querySelector('#view-catalogue').offsetHeight < 50 };
});
await ctx.setOffline(false);
T('Réseau coupé : la navigation entre vues continue de fonctionner', r.apres === r.avant,
  r.avant + ' → ' + r.apres + ' cartes');
T('Réseau coupé : aucune vue ne devient vide', r.vueVide === false);

console.log('\n' + '═'.repeat(64));
console.log('  ' + pass + ' OK / ' + fail + ' KO / ' + warn + ' avertissement(s)');
console.log('═'.repeat(64));
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
