/* outils/poser-visuel.mjs — POSER LA PHOTO D'UN PRODUIT SUR SA FICHE.
   ─────────────────────────────────────────────────────────────────────────
   USAGE
     node outils/poser-visuel.mjs --sku <REF> --image <fichier> [--confirmer]

   POURQUOI CET OUTIL EXISTE. L'user envoie ses visuels UN PAR UN dans la
   conversation : un PNG détouré du produit, et parfois une capture de la
   fiche technique. Le PNG doit finir sur la carte du catalogue. Fait à la
   main, ça se refait à chaque produit, et chaque répétition est une chance
   de se tromper de fiche, de format ou de poids.

   ⛔ CE QU'IL REFUSE — chacun de ces refus a une raison écrite ailleurs :
   ① UNE RÉFÉRENCE QUI N'EXISTE PAS AU CATALOGUE. Poser une photo sur rien,
      ou pire sur la fiche voisine, c'est montrer un outil pour un autre.
   ② UN VISUEL QUI N'EST PAS DÉTOURÉ. Règle produits : « fond sombre
      obligatoire, jamais blanc ; si un visuel fourni est sur fond clair, le
      signaler AVANT de le poser ». Les trois posters déjà en ligne ont tous
      un coin à alpha 0 — mesuré. Un fond blanc collé sur le fond sombre du
      site fait une vignette blanche au milieu de la page.
   ③ UN FICHIER TROP LOURD. `audit/p8-perf` refuse toute image servie
      au-dessus de 871 Ko (décision de l'user, 28/07/2026).
   ④ ÉCRASER UN VISUEL DÉJÀ POSÉ. Les visuels sont le travail de l'user :
      « ne jamais les modifier sans qu'il l'ait demandé explicitement ». Il
      faut `--remplacer`, en toutes lettres.

   ⚠️ IL NE RECOMPRESSE PAS N'IMPORTE COMMENT. Le format cible est celui des
   posters existants, MESURÉ et non supposé : 1000×1000, WebP, fond
   transparent. Une image plus petite que 1000 px n'est jamais agrandie —
   agrandir n'ajoute aucun détail, ça ne fait que du poids et du flou.

   ⚠️ ESSAI PAR DÉFAUT : sans `--confirmer`, rien n'est écrit. */
import { RACINE, playwright, optionsNavigateur } from './_socle.cjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { inflateSync } from 'node:zlib';

const COTE = 1000;                    // mesuré sur les posters en ligne
const PLAFOND_KO = 871;               // audit/p8-perf, décision user 28/07/2026
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const args = process.argv.slice(2);
function opt(nom) { const i = args.indexOf(nom); return i !== -1 ? args[i + 1] : null; }
const sku = (opt('--sku') || '').trim().toUpperCase();
const fichier = opt('--image');
const confirmer = args.includes('--confirmer');
const remplacer = args.includes('--remplacer');

if (!sku || !fichier) {
  console.error('usage : node outils/poser-visuel.mjs --sku <REF> --image <fichier> '
    + '[--remplacer] [--confirmer]');
  process.exit(2);
}
if (!existsSync(fichier)) { console.error('⛔ image introuvable : ' + fichier); process.exit(2); }

/* ⛔⛔ LA TRANSPARENCE SE LIT DANS LES PIXELS, PAS DANS L'EN-TÊTE. Même code,
   même raison que `importer-dossiers.mjs` : le `colorType` d'un PNG dit que
   l'image PEUT porter de l'alpha, jamais qu'elle EN A — Chromium encode tout
   en type 6, opaque ou non, et l'en-tête s'est trompé 2 fois sur 5 témoins. */
function aDeLaTransparence(buf) {
  if (buf.length < 33 || buf.toString('hex', 0, 8) !== '89504e470d0a1a0a') return false;
  const larg = buf.readUInt32BE(16), haut = buf.readUInt32BE(20);
  const profondeur = buf[24], type = buf[25], entrelace = buf[28];
  if (type !== 3 && type !== 4 && type !== 6) return false;
  if (entrelace !== 0 || (profondeur !== 8 && profondeur !== 16)) return null;
  const morceaux = []; let trns = null, i = 8;
  while (i + 8 <= buf.length) {
    const n = buf.readUInt32BE(i), nom = buf.toString('latin1', i + 4, i + 8);
    if (nom === 'IDAT') morceaux.push(buf.subarray(i + 8, i + 8 + n));
    else if (nom === 'tRNS') trns = buf.subarray(i + 8, i + 8 + n);
    else if (nom === 'IEND') break;
    i += 12 + n;
  }
  if (!morceaux.length) return null;
  if (type === 3 && (!trns || !Array.from(trns).some((a) => a < 255))) return false;
  const canaux = type === 3 ? 1 : (type === 4 ? 2 : 4);
  const octetsPixel = Math.max(1, canaux * profondeur / 8);
  const parLigne = Math.ceil(larg * canaux * profondeur / 8);
  let d;
  try { d = inflateSync(Buffer.concat(morceaux)); } catch (e) { return null; }
  if (d.length < haut * (parLigne + 1)) return null;
  let prec = Buffer.alloc(parLigne), p = 0;
  for (let y = 0; y < haut; y++) {
    const filtre = d[p++];
    const ligne = Buffer.from(d.subarray(p, p + parLigne)); p += parLigne;
    for (let x = 0; x < parLigne; x++) {
      const a = x >= octetsPixel ? ligne[x - octetsPixel] : 0;
      const b = prec[x], c = x >= octetsPixel ? prec[x - octetsPixel] : 0;
      let v = ligne[x];
      if (filtre === 1) v += a;
      else if (filtre === 2) v += b;
      else if (filtre === 3) v += (a + b) >> 1;
      else if (filtre === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      ligne[x] = v & 255;
    }
    if (type === 3) {
      for (let x = 0; x < larg; x++) if (ligne[x] < trns.length && trns[ligne[x]] < 255) return true;
    } else {
      const pas = canaux * profondeur / 8;
      for (let x = pas - profondeur / 8; x < parLigne; x += pas) if (ligne[x] !== 255) return true;
    }
    prec = ligne;
  }
  return false;
}

/* ── ① LA FICHE DOIT EXISTER ─────────────────────────────────────────────── */
const cheminCat = join(RACINE, 'products.json');
const texteCat = await readFile(cheminCat, 'utf8');
const brut = JSON.parse(texteCat);

/* ⛔ L'INDENTATION SE LIT DANS LE FICHIER, ELLE NE SE DEVINE PAS. Défaut payé
   le 08/08/2026 : j'ai réécrit `products.json` avec une indentation de 1 alors
   qu'il vit en 2, et le diff a montré **57 795 lignes ajoutées, 57 772
   supprimées** pour UNE fiche modifiée. Un diff pareil est irrelisible : plus
   personne ne peut voir ce qui a vraiment changé, et l'historique de chaque
   ligne du catalogue est perdu. La deuxième ligne du fichier porte
   l'indentation du premier niveau — on la MESURE. */
const INDENT = ((texteCat.split('\n')[1] || '').match(/^ */) || [''])[0].length || 2;
const FIN_LIGNE = /\n$/.test(texteCat) ? '\n' : '';
const enveloppe = !Array.isArray(brut);
const produits = enveloppe ? brut.products : brut;
const fiche = produits.find((p) => String(p.sku || '').toUpperCase() === sku);
if (!fiche) {
  console.error('⛔ aucune fiche ne porte la référence ' + sku + '. Poser une photo '
    + 'sur une fiche voisine montrerait un outil pour un autre — rien n\'est écrit.');
  process.exit(1);
}

/* ── ② LE VISUEL DOIT ÊTRE DÉTOURÉ ───────────────────────────────────────── */
const source = await readFile(fichier);
const ext = extname(fichier).toLowerCase();
if (!MIME[ext]) { console.error('⛔ format non géré : ' + ext); process.exit(2); }
const detoure = aDeLaTransparence(source);
if (detoure !== true) {
  console.error('⛔ ' + basename(fichier) + (detoure === null
    ? ' : PNG que je ne sais pas lire (entrelacé, ou profondeur autre que 8/16 bits).'
    : ' n\'a PAS de fond transparent.'));
  console.error('   Règle produits : « fond sombre obligatoire, jamais blanc ; si un '
    + 'visuel fourni est sur fond clair, le SIGNALER avant de le poser ». Je le signale.');
  process.exit(1);
}

/* ── ③ CONVERSION, PUIS PESÉE ────────────────────────────────────────────── */
const { chromium } = playwright();
const navigateur = await chromium.launch(optionsNavigateur({ headless: true }));
const page = await (await navigateur.newContext()).newPage();
const sortie = await page.evaluate(async ({ b64, mime, cote }) => {
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = 'data:' + mime + ';base64,' + b64; });
  /* On n'AGRANDIT jamais : agrandir n'ajoute aucun détail, seulement du poids. */
  const k = Math.min(1, cote / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  const coin = Array.from(x.getImageData(0, 0, 1, 1).data);
  return { dim: [img.width, img.height], sortie: [w, h], coin: coin,
    webp: c.toDataURL('image/webp', 0.92) };
}, { b64: source.toString('base64'), mime: MIME[ext], cote: COTE });
await navigateur.close();

if (sortie.webp.indexOf('data:image/webp') !== 0) {
  console.error('⛔ le navigateur n\'a pas rendu de WebP — rien n\'est écrit.');
  process.exit(1);
}
const webp = Buffer.from(sortie.webp.split(',')[1], 'base64');
const ko = webp.length / 1024;
if (ko > PLAFOND_KO) {
  console.error('⛔ ' + ko.toFixed(0) + ' Ko : au-dessus du plafond de ' + PLAFOND_KO
    + ' Ko d\'`audit/p8-perf`. Rien n\'est écrit.');
  process.exit(1);
}
/* Le coin doit rester transparent APRÈS conversion : une conversion qui aplatit
   l'alpha rendrait un carré opaque, et le refus ② n'aurait servi à rien. */
if (sortie.coin[3] !== 0) {
  console.error('⛔ la conversion a APLATI la transparence (coin alpha='
    + sortie.coin[3] + ') — rien n\'est écrit.');
  process.exit(1);
}

/* ── ④ RANG DANS LA GALERIE, ET JAMAIS D'ÉCRASEMENT SILENCIEUX ────────────
   Un produit peut porter PLUSIEURS visuels depuis le 08/08/2026 (demande de
   l'user : « il y a deux PNG à ajouter »). `--rang 1` est la photo principale —
   celle de la carte du catalogue, donc `img` ; les rangs suivants ne vivent que
   dans `images`. Le rang 1 est le défaut : le cas le plus courant reste un seul
   visuel, et il ne doit demander aucune option. */
const base = sku.toLowerCase().replace(/[^a-z0-9-]/g, '-');
const rang = Math.max(1, parseInt(opt('--rang') || '1', 10) || 1);
const nom = base + (rang > 1 ? '-' + rang : '') + '.webp';
const cible = join(RACINE, 'images', 'posters', nom);
const galerieAvant = Array.isArray(fiche.images) ? fiche.images.slice() : [];
const ancien = rang === 1 ? String(fiche.img || '') : (galerieAvant[rang - 1] || '');
const dejaPose = ancien && !/placeholder/.test(ancien);
if (dejaPose && !remplacer) {
  console.error('⛔ ' + sku + ' porte déjà un visuel au rang ' + rang + ' : ' + ancien);
  console.error('   Les visuels sont le travail de l\'user. `--remplacer` pour passer outre.');
  process.exit(1);
}
/* ⛔ PAS DE TROU DANS LA GALERIE. Poser le rang 3 quand le 2 n'existe pas
   fabriquerait un `images` à trous, que la piste rendrait en vignettes vides. */
const rangsExistants = galerieAvant.length || (String(fiche.img || '') && !/placeholder/.test(String(fiche.img || '')) ? 1 : 0);
if (rang > rangsExistants + 1) {
  console.error('⛔ rang ' + rang + ' demandé alors que ' + sku + ' n\'a que '
    + rangsExistants + ' visuel(s) : il manquerait le rang ' + (rangsExistants + 1)
    + ', et la galerie afficherait une vignette vide.');
  process.exit(1);
}

const l = (s) => console.log(s);
l('');
l('═══ VISUEL ' + sku + (confirmer ? '' : '   — ESSAI, RIEN N\'EST ÉCRIT') + ' ═══');
l('');
l('  source ................. ' + basename(fichier) + '  '
  + sortie.dim.join('×') + '  ' + (source.length / 1024).toFixed(0) + ' Ko');
l('  fond transparent ....... oui (mesuré sur les pixels, pas sur l\'en-tête)');
l('  sortie ................. ' + nom + '  ' + sortie.sortie.join('×')
  + '  ' + ko.toFixed(0) + ' Ko   (plafond ' + PLAFOND_KO + ')');
l('  transparence conservée . oui (coin alpha 0)');
l('  fiche .................. ' + (fiche.title || fiche.name));
l('  rang dans la galerie ... ' + rang + (rang === 1 ? '  (photo principale, celle de la carte)' : ''));
l('  ' + (rang === 1 ? 'img' : 'images[' + (rang - 1) + ']') + ' : '
  + (ancien || '(aucun)') + '  →  images/posters/' + nom);
l('');

if (!confirmer) { l('  ⚠️ ESSAI — --confirmer pour écrire.'); l(''); process.exit(0); }

await mkdir(join(RACINE, 'images', 'posters'), { recursive: true });
await writeFile(cible, webp);
const chemin = 'images/posters/' + nom;
const galerie = galerieAvant.length ? galerieAvant
  : (String(fiche.img || '') && !/placeholder/.test(String(fiche.img || '')) ? [String(fiche.img)] : []);
galerie[rang - 1] = chemin;
fiche.images = galerie;
fiche.img = galerie[0];              // la carte du catalogue montre TOUJOURS le rang 1
await writeFile(cheminCat, JSON.stringify(brut, null, INDENT) + FIN_LIGNE, 'utf8');

/* ⛔ ON NE SE FIE JAMAIS AU RETOUR D'UNE ÉCRITURE : ON RELIT. */
const relu = JSON.parse(await readFile(cheminCat, 'utf8'));
const relus = Array.isArray(relu) ? relu : relu.products;
const verif = relus.find((p) => String(p.sku || '').toUpperCase() === sku);
const surDisque = existsSync(cible) ? statSync(cible).size : 0;
if (!verif || !verif.images || verif.images[rang - 1] !== chemin
  || verif.img !== galerie[0] || surDisque !== webp.length) {
  console.error('⛔ RELECTURE EN DÉSACCORD avec ce qui vient d\'être écrit — '
    + 'images=' + JSON.stringify(verif && verif.images) + ', fichier=' + surDisque + ' octets');
  process.exit(1);
}
l('  ✅ écrit et RELU : ' + surDisque + ' octets sur le disque, `img` en place.');
l('');
