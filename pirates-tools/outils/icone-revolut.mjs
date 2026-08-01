/* outils/icone-revolut.mjs — FABRIQUE L'ICÔNE REVOLUT DU TUNNEL DE PAIEMENT.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   L'user veut le logo Revolut à côté de « Paiement sécurisé par Revolut ».
   Je ne peux PAS aller le chercher : `revolut.com` et `assets.revolut.com`
   répondent `000` depuis cet environnement, la passerelle refusant le CONNECT
   (politique réseau, mesuré le 01/08/2026). Et le paquet officiel
   `@revolut/checkout@1.1.25` ne contient AUCUNE image — vérifié :
   `tar tzf revolut-checkout-1.1.25.tgz | grep -icE '\.svg|\.png'` → 0.

   ⛔ Redessiner une marque de mémoire, c'est l'INVENTER. Un logo approximatif
   est pire que pas de logo : il fait amateur, exactement l'inverse du but.

   C'est donc l'user qui fournit le R authentique. Cet outil ne le redessine
   pas et ne le retouche pas : il le COMPOSE tel quel sur la tuile.

   ─────────────────────────────────────────────────────────────────────────
   ⛔ LE DÉTECTEUR — POURQUOI IL EXISTE, ET CE QU'IL A COÛTÉ

   Première tentative : j'ai reçu un fichier, j'ai supposé qu'il portait de la
   transparence, la boîte d'encre est sortie à 768×768 (soit l'image entière),
   et j'étais parti écrire un DÉTOURAGE PAR LUMINANCE — du travail qui n'aurait
   servi à rien.

   La cause : le fichier arrivé sur le disque était `52 49 46 46 … 57 45 42 50`
   — un RIFF/WEBP de 17 886 octets, damier de transparence APLATI en vrais
   pixels (`alphaMin: 255`). L'user, lui, avait envoyé un PNG. La conversion
   s'était faite dans le tuyau, en silence.

   D'où cette règle, demandée par l'user : **on CONSTATE le fichier, on ne le
   suppose jamais.** Deux constats, dans cet ordre :

     ① la SIGNATURE (octets magiques) — `89 50 4E 47` = PNG, `RIFF…WEBP` =
       WebP, `FF D8 FF` = JPEG. L'extension du nom ne prouve rien ;
     ② pour un PNG, le TYPE DE COULEUR de l'en-tête IHDR (octet 25) : 6 =
       RGBA, 4 = gris+alpha, 0/2/3 = **aucun** canal alpha ;
     ③ et le canal alpha RÉEL, mesuré pixel par pixel : un RGBA dont tous les
       alpha valent 255 est un fichier opaque déguisé.

   Si l'alpha est réel → on l'utilise, aucun détourage. Sinon → l'outil
   S'ARRÊTE et le dit, plutôt que de bricoler une clé de luminance sur une
   image que personne n'a regardée.

   ─────────────────────────────────────────────────────────────────────────
   CE QUI N'EST PAS DEVINÉ NON PLUS

   · Les couleurs du fond sont ÉCHANTILLONNÉES sur la capture de son écran
     d'accueil, jamais choisies : #313131 en haut, #141414 en bas.
     Points relevés sur `IMG_5538.jpeg` : (213,188), (160,244), (213,300).
   · Le R est placé d'après sa BOÎTE D'ENCRE réelle, calculée sur l'alpha —
     centrer sur les bords du fichier serait faux, la marge transparente
     n'ayant aucune raison d'être symétrique.

   ⚠️ `sharp` n'est pas installé (`MODULE_NOT_FOUND`). On passe par Chromium,
   déjà présent pour les harnais : règle « le bon outil existe-t-il déjà ? ».
   On ne réécrit pas un encodeur d'image à la main.

   USAGE
     node outils/icone-revolut.mjs <chemin-du-R.png>
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, RACINE } from '../tests/_socle.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/* Relevés sur la capture d'écran de l'user — pas des valeurs de goût. */
const HAUT = '#313131';
const BAS = '#141414';
/* Rayon des icônes d'application iOS : ~22,4 % du côté. Mesuré sur sa capture :
   tuile ≈ 130 px pour un rayon ≈ 30 px, soit 23 %. */
const RAYON_PCT = 0.23;
/* Part de la HAUTEUR de tuile occupée par l'encre du R, d'après sa capture. */
const ENCRE_PCT = 0.54;
const COTE = 128;

/* ── ① SIGNATURE : ce que le fichier EST, pas ce que son nom annonce ────── */
function signature(buf) {
  if (buf.length >= 8 && buf.slice(1, 4).toString('latin1') === 'PNG'
    && buf[0] === 0x89) return 'png';
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF'
    && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.slice(0, 5).toString('latin1').indexOf('<svg') !== -1
    || buf.slice(0, 200).toString('latin1').indexOf('<svg') !== -1) return 'svg';
  return 'inconnu';
}

/* ── ② EN-TÊTE PNG : le type de couleur dit si un canal alpha peut exister */
function entetePng(buf) {
  return {
    largeur: buf.readUInt32BE(16),
    hauteur: buf.readUInt32BE(20),
    profondeur: buf[24],
    typeCouleur: buf[25],
    alphaPossible: buf[25] === 4 || buf[25] === 6
  };
}

const NOMS_TYPE = { 0: 'gris', 2: 'RVB', 3: 'palette', 4: 'gris+alpha', 6: 'RVB+alpha (RGBA)' };
const MIME = { png: 'image/png', webp: 'image/webp', jpeg: 'image/jpeg', svg: 'image/svg+xml' };

const source = process.argv[2];
if (!source) {
  console.error('usage : node outils/icone-revolut.mjs <chemin-du-R.png>');
  process.exit(2);
}

const brut = await readFile(source);
const sig = signature(brut);
console.log('fichier         : ' + source);
console.log('taille          : ' + brut.length + ' octets');
console.log('signature       : ' + brut.slice(0, 8).toString('hex') + '  → ' + sig.toUpperCase());

if (sig === 'inconnu') {
  console.error('⛔ format non reconnu — on ne devine pas. Fournis un PNG, un WebP ou un JPEG.');
  process.exit(1);
}
if (sig === 'png') {
  const h = entetePng(brut);
  console.log('IHDR            : ' + h.largeur + '×' + h.hauteur + ', ' + h.profondeur
    + ' bits, type ' + h.typeCouleur + ' = ' + (NOMS_TYPE[h.typeCouleur] || '?'));
  if (!h.alphaPossible) {
    console.error('⛔ ce PNG n\'a AUCUN canal alpha (type ' + h.typeCouleur + '). Le R doit être '
      + 'fourni détouré : je ne devine pas où s\'arrête le glyphe.');
    process.exit(1);
  }
}

const { chromium } = await playwright();
const dataUrl = 'data:' + MIME[sig] + ';base64,' + brut.toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();

const res = await page.evaluate(async ([src, haut, bas, rayonPct, encrePct, cote]) => {
  const img = await new Promise((ok, ko) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src;
  });

  const m = document.createElement('canvas');
  m.width = img.width; m.height = img.height;
  const mx = m.getContext('2d');
  mx.drawImage(img, 0, 0);
  const px = mx.getImageData(0, 0, img.width, img.height).data;

  /* ── ③ LE CANAL ALPHA EST-IL RÉEL ? ───────────────────────────────────
     Un RGBA dont tous les alpha valent 255 est un fichier OPAQUE déguisé :
     l'en-tête dit « alpha possible », les pixels disent le contraire. Ce sont
     les pixels qui tranchent. */
  let alphaMin = 255, transparents = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < alphaMin) alphaMin = px[i];
    if (px[i] < 250) transparents++;
  }
  const total = px.length / 4;
  if (alphaMin === 255) {
    return { refus: 'alpha-plat', alphaMin: alphaMin, total: total };
  }

  /* Boîte d'encre, calculée sur l'alpha réel. */
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (px[(y * img.width + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const encreL = x1 - x0 + 1, encreH = y1 - y0 + 1;

  /* ── Composition ────────────────────────────────────────────────────────*/
  const c = document.createElement('canvas');
  c.width = cote; c.height = cote;
  const g = c.getContext('2d');

  const deg = g.createLinearGradient(0, 0, 0, cote);
  deg.addColorStop(0, haut);
  deg.addColorStop(1, bas);
  g.fillStyle = deg;
  const r = cote * rayonPct;
  g.beginPath();
  g.moveTo(r, 0);
  g.arcTo(cote, 0, cote, cote, r);
  g.arcTo(cote, cote, 0, cote, r);
  g.arcTo(0, cote, 0, 0, r);
  g.arcTo(0, 0, cote, 0, r);
  g.closePath();
  g.fill();

  /* Le R garde ses proportions : mise à l'échelle sur la HAUTEUR d'encre,
     puis centrage sur le centre de l'ENCRE — jamais sur celui du fichier. */
  const k = (cote * encrePct) / encreH;
  const destL = encreL * k, destH = encreH * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, x0, y0, encreL, encreH,
    (cote - destL) / 2, (cote - destH) / 2, destL, destH);

  return {
    source: [img.width, img.height], encre: [encreL, encreH],
    alphaMin: alphaMin, transparents: transparents, total: total,
    webp: c.toDataURL('image/webp', 0.95),
    png: c.toDataURL('image/png')
  };
}, [dataUrl, HAUT, BAS, RAYON_PCT, ENCRE_PCT, COTE]);

await browser.close();

if (res.refus === 'alpha-plat') {
  console.error('⛔ canal alpha ANNONCÉ mais PLAT : les ' + res.total + ' pixels sont à alpha 255.');
  console.error('   Le fichier est opaque (damier de transparence aplati par une conversion ?).');
  console.error('   Je ne détoure pas au jugé — refournis le R avec sa vraie transparence.');
  process.exit(1);
}

const octets = (u) => Buffer.from(u.split(',')[1], 'base64');
const webp = octets(res.webp);
const png = octets(res.png);
const gagnant = webp.length <= png.length ? { ext: 'webp', buf: webp } : { ext: 'png', buf: png };

const dossier = join(RACINE, 'images', 'brands');
await mkdir(dossier, { recursive: true });
const cible = join(dossier, 'revolut.' + gagnant.ext);
await writeFile(cible, gagnant.buf);

console.log('alpha           : min ' + res.alphaMin + ', ' + res.transparents
  + ' pixels non opaques sur ' + res.total + '  → transparence RÉELLE, aucun détourage');
console.log('R source        : ' + res.source.join('×'));
console.log('boîte d\'encre   : ' + res.encre.join('×'));
console.log('webp            : ' + webp.length + ' octets');
console.log('png             : ' + png.length + ' octets');
console.log('écrit           : ' + cible + '  (' + gagnant.buf.length + ' octets)');
