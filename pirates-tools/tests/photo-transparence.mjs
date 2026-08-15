/* photo-transparence.mjs — UN PNG DÉTOURÉ NE RESSORT JAMAIS SUR FOND NOIR.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ LA PANNE QUE CE HARNAIS FERME, remontée TROIS FOIS par l'user, la
   dernière le 15/08/2026 : « ça me met un carré noir autour du produit, ça ne
   garde pas mon PNG […] moi je n'envoie que des PNG ».

   La cause était entièrement de mon côté. `adminPreparerImage` demandait du
   WebP ; un navigateur qui ne sait pas encoder ce format rend du PNG SANS LE
   DIRE — le code le détectait au préfixe, ce qui était juste — puis basculait
   sur **JPEG**. Or JPEG n'a AUCUN canal alpha : le transparent est aplati sur
   du noir. Safari iOS, SON navigateur, est précisément le cas qui tombe
   toujours dans ce repli : d'où « ça marche chez moi » et pas chez lui.

   ⚠️ CE HARNAIS CHARGE LE VRAI `app.js`, pas une copie de la logique. Une
   copie divergerait au premier correctif et validerait un code mort.
   ⚠️ Il ne nomme aucune donnée du catalogue : les images sont fabriquées ici.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, RACINE, compteur } from './_socle.mjs';
import path from 'node:path';
import fs from 'node:fs';

const c = compteur('photo-transparence');
const { chromium } = await playwright();
const nav = await chromium.launch();
const page = await nav.newPage();

/* On n'ouvre pas le site : on injecte les fonctions à éprouver dans une page
   vierge. Le tunnel de paiement, Firebase et le service worker n'ont rien à
   voir avec l'encodage d'une image, et les charger ajouterait des causes de
   panne étrangères au sujet. */
const src = fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8');

/* ⛔ PRÉALABLE : les deux fonctions doivent EXISTER dans app.js. Sans ça, le
   harnais testerait le vide et verdirait pour la pire des raisons. */
const aDetecteur = /function adminImageATransparence\s*\(/.test(src);
const aEncodeur = /function adminEncoderSansPerdreLeFond\s*\(/.test(src);
if (!c.prealable('les deux fonctions d\'encodage existent dans app.js', aDetecteur && aEncodeur)) {
  c.terminer(); process.exit(1);
}

/* Extraction des deux fonctions par équilibrage d'accolades — on n'exécute pas
   app.js en entier (il attend un DOM complet, Firebase, etc.). */
function extraire(nom) {
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) return '';
  let p = src.indexOf('{', i), n = 0, j = p;
  for (; j < src.length; j++) {
    if (src[j] === '{') n++;
    else if (src[j] === '}') { n--; if (n === 0) { j++; break; } }
  }
  return src.slice(i, j);
}
const code = extraire('adminImageATransparence') + '\n' + extraire('adminEncoderSansPerdreLeFond');

await page.goto('about:blank');
/* ⚠️ `page.evaluate` évalue une EXPRESSION : lui passer des déclarations de
   fonction jette « Unexpected token 'function' ». On les injecte par une balise
   de script, qui les pose bien dans la portée globale. */
await page.addScriptTag({ content: code
  + '\nwindow.__detecte = adminImageATransparence;'
  + '\nwindow.__encode = adminEncoderSansPerdreLeFond;' });
if (!c.prealable('les fonctions extraites sont bien injectées dans la page',
  await page.evaluate(() => typeof window.__detecte === 'function'
    && typeof window.__encode === 'function'))) {
  await nav.close(); c.terminer(); process.exit(1);
}

const r = await page.evaluate(async () => {
  function faire(transparent) {
    const s = document.createElement('canvas');
    s.width = 120; s.height = 120;
    const x = s.getContext('2d');
    if (!transparent) { x.fillStyle = '#1155cc'; x.fillRect(0, 0, 120, 120); }
    else x.clearRect(0, 0, 120, 120);
    x.fillStyle = '#ff0000'; x.fillRect(40, 40, 40, 40);   // le « produit »
    return s.toDataURL('image/png');
  }
  async function charger(url) {
    const i = new Image();
    await new Promise((ok) => { i.onload = ok; i.src = url; });
    return i;
  }
  async function coin(url) {
    const i = await charger(url);
    const c2 = document.createElement('canvas');
    c2.width = 120; c2.height = 120;
    const x = c2.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, 120, 120);
    x.drawImage(i, 0, 0, 120, 120);
    const d = x.getImageData(3, 3, 1, 1).data;
    return { r: d[0], v: d[1], b: d[2], a: d[3] };
  }
  function dessiner(img) {
    const c3 = document.createElement('canvas');
    c3.width = 120; c3.height = 120;
    c3.getContext('2d').drawImage(img, 0, 0, 120, 120);
    return c3;
  }

  const out = {};
  const imgT = await charger(faire(true));
  const imgO = await charger(faire(false));
  out.detecteTransparent = window.__detecte(imgT, 120, 120);
  out.detecteOpaque = window.__detecte(imgO, 120, 120);

  /* ⛔ LE CŒUR DU HARNAIS : on force le cas de Safari — le navigateur ne sait
     pas encoder en WebP. On neutralise l'encodage WebP pour que `toDataURL`
     retombe sur PNG, exactement comme là-bas. Sans ça on testerait Chromium,
     qui encode le WebP et ne rencontre JAMAIS le défaut. */
  const vrai = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (mime, q) {
    if (mime === 'image/webp') return vrai.call(this, 'image/png');
    return vrai.call(this, mime, q);
  };
  out.sansWebp = {
    transparent: await coin(window.__encode(dessiner(imgT), 0.9, true)),
    opaque: await coin(window.__encode(dessiner(imgO), 0.9, false))
  };
  HTMLCanvasElement.prototype.toDataURL = vrai;

  /* Et le cas normal, navigateur qui sait encoder le WebP. */
  out.avecWebp = {
    transparent: await coin(window.__encode(dessiner(imgT), 0.9, true))
  };
  return out;
});
await nav.close();

c.T('un PNG à fond transparent est reconnu comme transparent',
  r.detecteTransparent === true);
c.T('une image pleine n\'est PAS déclarée transparente (sinon on refuserait le JPEG partout)',
  r.detecteOpaque === false);

/* LA panne de sa capture : navigateur sans encodage WebP + image détourée. */
c.T('sans encodage WebP (le cas de son iPad), le fond d\'un PNG détouré reste TRANSPARENT '
  + '— relevé rgba(' + r.sansWebp.transparent.r + ',' + r.sansWebp.transparent.v + ','
  + r.sansWebp.transparent.b + ',' + r.sansWebp.transparent.a + ')',
  r.sansWebp.transparent.a === 0);
c.T('le fond n\'est PAS repeint en noir opaque (le carré noir de sa capture)',
  !(r.sansWebp.transparent.a === 255 && r.sansWebp.transparent.r === 0
  && r.sansWebp.transparent.v === 0 && r.sansWebp.transparent.b === 0));

/* Contre-épreuve : une image opaque doit encore pouvoir partir en JPEG, sinon
   on aurait « corrigé » en alourdissant toutes les photos du site. */
c.T('une image opaque reste opaque et garde le droit au JPEG',
  r.sansWebp.opaque.a === 255);

c.T('avec encodage WebP, la transparence est conservée aussi',
  r.avecWebp.transparent.a === 0);

/* ⛔ `bilan()` IMPRIME mais ne fixe AUCUN code de sortie : un harnais qui
   échoue sortirait alors en 0, et toute porte qui lit le code de sortie le
   compterait pour vert. C'est `terminer()` qui tranche. Constaté ici même au
   premier sabotage : « code 0, contrôle rouge ». */
c.terminer();
