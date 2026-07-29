/* verifier.mjs — le harnais du moteur de détourage.
   ─────────────────────────────────────────────────────────────────────────
   Il ne se contente pas de « ça tourne » : chaque photo de référence porte
   des ATTENDUS mesurés, et le harnais rougit si l'un d'eux bouge. C'est ce
   qui distingue un contrôle d'une démonstration.

       node outils/detourage/verifier.mjs [dossier-des-images]

   Les images de référence ne sont pas versionnées (ce sont les visuels de
   l'user). Sans elles le harnais sort en code 2 — IGNORÉ, jamais « vert » :
   un contrôle non exécuté n'est pas un contrôle réussi.
   ───────────────────────────────────────────────────────────────────────── */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ICI = path.dirname(fileURLToPath(import.meta.url));
const PTDetourage = require(path.join(ICI, 'detourage.js'));

/* ── décodeur PNG minimal, pour le harnais seulement ──────────────────── */
function lirePNG(chemin) {
  const b = fs.readFileSync(chemin);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('pas un PNG : ' + chemin);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), prof = b[24], type = b[25];
  if (prof !== 8 || (type !== 2 && type !== 6)) throw new Error('PNG non géré (profondeur/type)');
  const canaux = type === 6 ? 4 : 3;
  const morceaux = []; let p = 8;
  while (p < b.length) {
    const len = b.readUInt32BE(p), nom = b.toString('ascii', p + 4, p + 8);
    if (nom === 'IDAT') morceaux.push(b.slice(p + 8, p + 8 + len));
    if (nom === 'IEND') break;
    p += 12 + len;
  }
  const brut = zlib.inflateSync(Buffer.concat(morceaux));
  const ligne = w * canaux, px = Buffer.alloc(w * h * canaux);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = brut[q++], deb = y * ligne, pre = (y - 1) * ligne;
    for (let i = 0; i < ligne; i++) {
      const xx = brut[q + i];
      const a = i >= canaux ? px[deb + i - canaux] : 0;
      const hh = y > 0 ? px[pre + i] : 0;
      const ha = (y > 0 && i >= canaux) ? px[pre + i - canaux] : 0;
      let v;
      if (f === 0) v = xx; else if (f === 1) v = xx + a; else if (f === 2) v = xx + hh;
      else if (f === 3) v = xx + ((a + hh) >> 1);
      else if (f === 4) {
        const pp = a + hh - ha, pa = Math.abs(pp - a), pb = Math.abs(pp - hh), pc = Math.abs(pp - ha);
        v = xx + (pa <= pb && pa <= pc ? a : pb <= pc ? hh : ha);
      } else throw new Error('filtre PNG ' + f + ' inconnu');
      px[deb + i] = v & 255;
    }
    q += ligne;
  }
  /* on rend du RGBA, comme un canvas */
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = px[i * canaux]; data[i * 4 + 1] = px[i * canaux + 1];
    data[i * 4 + 2] = px[i * canaux + 2]; data[i * 4 + 3] = canaux === 4 ? px[i * canaux + 3] : 255;
  }
  return { width: w, height: h, data };
}

/* ── les attendus, chacun MESURÉ sur la photo correspondante ──────────── */
const CAS = [
  {
    fichier: 'vis-damier.png',
    quoi: 'vis inox sur damier clair — métal proche du blanc',
    attendus: {
      critere: 'distance',
      satMax: 0.05,
      partOccupeeMin: 0.06, partOccupeeMax: 0.09,   // la vis occupe ~7,5 % de l'image
      composantesMax: 4,
      piquesMax: 12
    }
  },
  {
    fichier: 'coffret-blanc.png',
    quoi: 'coffret sur fond blanc — boîte blanche à 1 niveau du fond',
    attendus: {
      critere: 'distance',
      satMax: 0.05,
      partOccupeeMin: 0.35, partOccupeeMax: 0.50,
      composantesMax: 40,
      piquesMax: 40,
      percesMin: 1                                   // l'intérieur de la boucle de câble
    }
  },
  {
    fichier: 'coffret-vert.png',
    quoi: 'coffret sur fond vert photographié — dégradé et ombres portées',
    attendus: {
      critere: 'angle',
      satMin: 0.5,
      partOccupeeMin: 0.33, partOccupeeMax: 0.48,
      composantesMax: 60,
      piquesMax: 40,
      pelesMin: 1                                    // le liseré d'ombre sous le plateau
    }
  }
];

function rugosite(alpha, w, h) {
  let aire = 0, piques = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (alpha[i] <= 0.5) continue;
    aire++;
    let bg = 0;
    if (alpha[i - 1] <= 0.5) bg++; if (alpha[i + 1] <= 0.5) bg++;
    if (alpha[i - w] <= 0.5) bg++; if (alpha[i + w] <= 0.5) bg++;
    if (bg >= 3) piques++;
  }
  return { aire, piques };
}

const dossier = process.argv[2] || path.join(ICI, 'references');
if (!fs.existsSync(dossier)) {
  console.error('⚠️  images de référence absentes : ' + dossier);
  console.error('    Le harnais est IGNORÉ, pas réussi. Passe le dossier en argument.');
  process.exit(2);
}

let echecs = 0, lances = 0;
for (const cas of CAS) {
  const chemin = path.join(dossier, cas.fichier);
  if (!fs.existsSync(chemin)) {
    console.error('⚠️  manquante : ' + cas.fichier + '  → cas IGNORÉ');
    continue;
  }
  lances++;
  const t0 = Date.now();
  const im = lirePNG(chemin);
  const r = PTDetourage.analyser(im);
  const ms = Date.now() - t0;
  const N = r.largeur * r.hauteur;
  let occupe = 0;
  for (let i = 0; i < N; i++) if (r.alpha[i] > 0.5) occupe++;
  const part = occupe / N;
  const ru = rugosite(r.alpha, r.largeur, r.hauteur);
  const a = cas.attendus, faute = [];

  if (a.critere && r.diag.critere !== a.critere) faute.push('critère ' + r.diag.critere + ' au lieu de ' + a.critere);
  if (a.satMax !== undefined && r.diag.saturationFond > a.satMax) faute.push('saturation ' + r.diag.saturationFond.toFixed(3));
  if (a.satMin !== undefined && r.diag.saturationFond < a.satMin) faute.push('saturation ' + r.diag.saturationFond.toFixed(3));
  if (part < a.partOccupeeMin || part > a.partOccupeeMax) faute.push('occupation ' + (part * 100).toFixed(1) + ' %');
  if (ru.piques > a.piquesMax) faute.push(ru.piques + ' piques (max ' + a.piquesMax + ')');
  if (r.diag.composantes > a.composantesMax) faute.push(r.diag.composantes + ' composantes');
  if (a.percesMin !== undefined && r.diag.perces < a.percesMin) faute.push('aucun trou percé');
  if (a.pelesMin !== undefined && r.diag.peles < a.pelesMin) faute.push('aucun liseré pelé');

  console.log((faute.length ? '❌ ' : '✅ ') + cas.fichier.padEnd(20)
    + r.diag.critere.padEnd(9) + 'sat ' + r.diag.saturationFond.toFixed(3)
    + '  occupe ' + (part * 100).toFixed(1) + '%'
    + '  piques ' + String(ru.piques).padStart(3)
    + '  comp ' + String(r.diag.composantes).padStart(3)
    + '  ' + String(ms).padStart(5) + ' ms');
  if (faute.length) { echecs++; faute.forEach(f => console.log('     → ' + f)); }
}

if (!lances) { console.error('⚠️  aucun cas exécuté — IGNORÉ, pas réussi.'); process.exit(2); }
console.log('\n' + (echecs ? '❌ ' + echecs + ' cas en échec sur ' + lances
  : '✅ ' + lances + ' cas conformes'));
process.exit(echecs ? 1 : 0);
