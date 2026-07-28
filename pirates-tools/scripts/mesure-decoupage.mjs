/* mesure-fiche.mjs — COMBIEN DE TEMPS pour afficher la fiche produit en bonne
   qualité, si l'ouverture du site ne télécharge plus que les cartes ?

   On mesure la SÉQUENCE RÉSEAU, qui est la seule chose que la découpe change.
   Trois scénarios, sur le MÊME produit (Makita DHS680Z, héros 282 Ko) :
     A — AUJOURD'HUI      : tout products.json est déjà là → seule l'image charge
     B — DÉCOUPÉ, naïf    : la carte ne connaît pas l'URL du héros
                            → il faut d'abord la fiche, PUIS l'image (en série)
     C — DÉCOUPÉ, correct : la carte porte l'URL du héros
                            → fiche et image partent EN MÊME TEMPS
   Chronomètre : du clic jusqu'à image complètement décodée et affichable. */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const APP = '/home/user/ish/pirates-tools';
const PROTO = '/tmp/claude-0/-home-user-ish/5fdd6ad4-f914-5559-9038-8318b9646f86/scratchpad/proto';
const MIME = { '.json': 'application/json', '.webp': 'image/webp', '.html': 'text/html' };

const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const racine = p.startsWith('/proto/') ? PROTO : APP;
  const rel = p.startsWith('/proto/') ? p.slice(6) : p;
  const fp = normalize(join(racine, rel));
  const st = await stat(fp).catch(() => null);
  if (!st || !st.isFile()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
  res.end(await readFile(fp));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const RESEAUX = [
  { nom: 'Wi-Fi / fibre', mbps: 30, latence: 25 },
  { nom: '4G correcte',   mbps: 8,  latence: 70 },
  { nom: '4G faible',     mbps: 2,  latence: 200 }
];

const HERO = '/images/posters/dhs680z-hero.webp';
const FICHE = '/proto/fiches/makita-dhs680z.json';
const CATALOGUE = '/products.json';
const INDEX = '/proto/catalogue-index.json';

const browser = await chromium.launch();

// mesure UNE séquence dans un contexte neuf (donc cache vide, comme en navigation privée)
async function mesure(reseau, scenario) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(base + '/proto/vide.html');
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: reseau.latence,
    downloadThroughput: (reseau.mbps * 1000 * 1000) / 8,
    uploadThroughput: (reseau.mbps * 1000 * 1000) / 8
  });

  const ms = await page.evaluate(async ({ scenario, HERO, FICHE }) => {
    const t0 = performance.now();
    const charger = (url) => fetch(url, { cache: 'no-store' }).then((r) => r.json());
    const image = (url) => new Promise((ok, ko) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url;
    });

    if (scenario === 'A') {
      // les données sont déjà en mémoire : seule l'image reste à charger
      await image(HERO);
    } else if (scenario === 'B') {
      // il faut la fiche AVANT de connaître l'URL de l'image
      const f = await charger(FICHE);
      await image('/' + f.heroImg);
    } else {
      // l'URL de l'image est déjà dans la carte → les deux partent ensemble
      await Promise.all([charger(FICHE), image(HERO)]);
    }
    return performance.now() - t0;
  }, { scenario, HERO, FICHE });

  await ctx.close();
  return ms;
}

// coût de l'OUVERTURE du site (ce qu'on télécharge avant de voir quoi que ce soit)
async function ouverture(reseau, url) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(base + '/proto/vide.html');
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: reseau.latence,
    downloadThroughput: (reseau.mbps * 1000 * 1000) / 8,
    uploadThroughput: (reseau.mbps * 1000 * 1000) / 8
  });
  const ms = await page.evaluate(async (u) => {
    const t = performance.now();
    await fetch(u, { cache: 'no-store' }).then((r) => r.json());
    return performance.now() - t;
  }, url);
  await ctx.close();
  return ms;
}

const moy = async (f, n = 3) => {
  const v = []; for (let i = 0; i < n; i++) v.push(await f());
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
};

console.log('\n╔' + '═'.repeat(72) + '╗');
console.log('║  OUVERTURE DU SITE — ce qu\'on télécharge avant de voir la boutique   ║');
console.log('╚' + '═'.repeat(72) + '╝');
console.log('  réseau'.padEnd(18) + 'AUJOURD\'HUI'.padStart(14) + 'DÉCOUPÉ'.padStart(12) + '   gain');
for (const r of RESEAUX) {
  const a = await moy(() => ouverture(r, CATALOGUE));
  const b = await moy(() => ouverture(r, INDEX));
  console.log('  ' + r.nom.padEnd(16) + (a + ' ms').padStart(14) + (b + ' ms').padStart(12)
    + '   −' + Math.round((1 - b / a) * 100) + ' %');
}

console.log('\n╔' + '═'.repeat(72) + '╗');
console.log('║  OUVERTURE D\'UNE FICHE — du clic à l\'image en bonne qualité (282 Ko) ║');
console.log('╚' + '═'.repeat(72) + '╝');
console.log('  réseau'.padEnd(18) + 'A aujourd\'hui'.padStart(15) + 'B naïf'.padStart(11) + 'C correct'.padStart(12));
for (const r of RESEAUX) {
  const a = await moy(() => mesure(r, 'A'));
  const b = await moy(() => mesure(r, 'B'));
  const c = await moy(() => mesure(r, 'C'));
  console.log('  ' + r.nom.padEnd(16) + (a + ' ms').padStart(15) + (b + ' ms').padStart(11)
    + (c + ' ms').padStart(12) + '     (C − A = ' + (c - a) + ' ms)');
}

await browser.close();
server.close();
console.log('');
