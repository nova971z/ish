/* outils/importer-dossiers.mjs — REMPLIR LES FICHES DEPUIS LES DOSSIERS DE
   L'USER : un dossier par produit, avec sa photo, sa fiche technique et sa
   description.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   L'user, 08/08/2026 : « J'ai créé plein de dossiers où chaque dossier
   contient le PNG plus la fiche technique et la description. Comment je peux
   faire pour tout envoyer d'un coup ». Réponse : une archive ZIP, exactement
   comme pour les balayages. Cet outil lit l'archive décompressée.

   ─────────────────────────────────────────────────────────────────────────
   CE QU'IL ATTEND, ET CE QU'IL TOLÈRE

   Un dossier par produit. Son NOM porte la référence — « DCD796P2T »,
   « DCD796P2T - perceuse », « 12_DCD796P2T »… : on y cherche une référence
   lisible avec le MÊME lecteur que le traqueur, jamais une règle à part.

   Dedans, dans n'importe quel ordre et sous n'importe quel nom :
     · une image  .png .jpg .jpeg .webp   → la photo du produit
     · du texte   .txt .md               → description et caractéristiques

   Plusieurs images dans le même dossier : on départage dans cet ordre —
   ① celle qui a un FOND TRANSPARENT, ② le seul PNG face à des JPEG, ③ un nom
   qui dit « produit / photo / visuel / packshot ». Si aucun des trois ne
   tranche, le dossier est REFUSÉ et ses images listées. On ne devine pas.

   ⛔ LE TEXTE N'EST PAS DEVINÉ AU PIF. Une ligne « Puissance : 1700 W » est
   une CARACTÉRISTIQUE (elle a un séparateur et deux membres courts) ; un
   paragraphe est une DESCRIPTION. Quand un fichier s'appelle « description »
   ou « fiche technique », son nom tranche et on ne discute pas.

   ⛔⛔ CE QUI EST FORMELLEMENT INTERDIT : compléter, reformuler, « améliorer »
   le texte de l'user. Il est repris tel quel. Le jour où cet outil se met à
   écrire mieux que sa source, il écrit des choses que personne n'a vérifiées.

   ⛔ L'IMAGE N'EST PAS RECOMPRESSÉE — c'est la demande de l'user pour la page
   d'ajout, et elle vaut ici. Le plafond est physique : un document Firestore
   tient 1 Mio, une dataURL pèse ~4/3 de l'octet. Mesuré : 524 982 octets
   donnent 699 998 signes, trois octets de plus et c'est refusé. Soit 525 Ko.
   Au-delà, la fiche est REFUSÉE et dite — jamais dégradée en silence.

   ⛔ AUCUN PRIX N'EST TOUCHÉ. Cet outil n'écrit que du texte et une image.

   ⚠️ ESSAI PAR DÉFAUT, sauvegarde avant toute écriture.

   USAGE
     node outils/importer-dossiers.mjs <dossier-racine> [--marque DeWALT] [--confirmer]
   ───────────────────────────────────────────────────────────────────────── */
import { RACINE } from '../tests/_socle.mjs';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const priceParse = require(join(RACINE, 'api/_lib/price-parse.js'));

const args = process.argv.slice(2);
const racine = args.find((a) => !a.startsWith('--'));
const confirmer = args.includes('--confirmer');
const iM = args.indexOf('--marque');
const marque = iM !== -1 ? args[iM + 1] : 'DeWALT';
if (!racine) {
  console.error('usage : node outils/importer-dossiers.mjs <dossier-racine> [--marque DeWALT] [--confirmer]');
  process.exit(2);
}

const IMG_MAX = 700000;
const IMAGES = ['.png', '.jpg', '.jpeg', '.webp'];
const TEXTES = ['.txt', '.md'];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/* La référence se lit dans le nom du dossier avec le lecteur du traqueur —
   une seconde règle divergerait au premier correctif. Repli : le nom entier,
   nettoyé, quand il ressemble déjà à une référence. */
function referenceDuNom(nom) {
  const lu = priceParse.lireReferenceDuTitre(marque + ' ' + nom, marque).ref;
  if (lu) return lu;
  const brut = nom.trim().toUpperCase().replace(/[^A-Z0-9./-]/g, '');
  return /^[A-Z]{1,5}[0-9]/.test(brut) && brut.length >= 4 ? brut : null;
}

/* ⛔ UNE LIGNE « clé : valeur » EST UNE CARACTÉRISTIQUE, UNE PHRASE EST UNE
   DESCRIPTION. Le séparateur ne suffit pas : « Livré avec : 2 batteries, un
   chargeur et un coffret TSTAK » a un deux-points et reste une phrase. On
   borne donc les deux membres — une caractéristique est courte des deux
   côtés. */
function estCaracteristique(ligne) {
  const m = String(ligne).match(/^\s*([^:\t|]{2,40})\s*[:\t|]\s*(.{1,80})\s*$/);
  if (!m) return null;
  const cle = m[1].trim(), val = m[2].trim();
  if (!cle || !val) return null;
  if (val.split(/\s+/).length > 12) return null;       // une phrase, pas une valeur
  return { cle, val };
}

/* ⛔⛔ CE QUI SÉPARE LA PHOTO DE LA CAPTURE : LE FOND TRANSPARENT.
   Trouvé par l'user le 08/08/2026, après que je lui aie proposé de renommer
   ses images une par une — « tu t'imagines même pas le temps que ça me
   prendrait, c'est inacceptable ». Il avait raison, et sa solution est
   meilleure que les deux miennes : « le PNG n'a pas de fond, alors que les
   descriptions ou les fiches techniques ont des formes rectangulaires ».
   Un visuel produit détouré porte un canal ALPHA ; une capture d'écran est
   opaque, et un JPEG ne peut pas être transparent du tout.
   ⛔⛔ ET L'EN-TÊTE NE SUFFIT PAS — DÉFAUT DE MA PREMIÈRE VERSION, MESURÉ LE
   08/08/2026. Je lisais le `colorType` du 25e octet (4 et 6 = canal alpha) et
   j'annonçais « détourée ». Or le `colorType` dit que l'image PEUT porter de
   la transparence, jamais qu'elle EN A. Chromium — donc tout ce qui sort d'un
   navigateur — encode SYSTÉMATIQUEMENT en type 6, opaque ou non. Mesuré sur
   cinq témoins : l'en-tête s'est trompé DEUX fois sur cinq, toujours dans le
   sens dangereux (une capture opaque déclarée détourée). On décompresse donc
   les pixels et on cherche un octet d'alpha ≠ 255 : cinq témoins sur cinq
   corrects. Coût : quelques millisecondes par image, une fois.
   ⚠️ Ce que je ne sais pas lire — entrelacé Adam7, ou autre profondeur que 8
   et 16 bits — rend `null`, et `null` n'est PAS « détourée ». Ne pas savoir
   n'a jamais été une réponse.
   ⚠️ MES DEUX PISTES PRÉCÉDENTES SONT MORTES, et il faut le dire : « la plus
   lourde gagne » retenait la capture de fiche technique ; « les captures ont
   toutes la taille de l'écran » a été démentie par l'user — ses captures
   n'ont pas toutes la même taille. */
function aDeLaTransparence(buf) {
  if (buf.length < 33 || buf.toString('hex', 0, 8) !== '89504e470d0a1a0a') return false;
  const larg = buf.readUInt32BE(16), haut = buf.readUInt32BE(20);
  const profondeur = buf[24], type = buf[25], entrelace = buf[28];
  if (type !== 3 && type !== 4 && type !== 6) return false;   // types 0 et 2 : alpha impossible
  if (entrelace !== 0 || (profondeur !== 8 && profondeur !== 16)) return null;

  const morceaux = [];
  let trns = null, i = 8;
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

  /* Reconstruction des filtres PNG, ligne par ligne : sans elle les octets
     d'alpha sont des DIFFÉRENCES, pas des valeurs — les lire crus donnerait
     des « ≠ 255 » qui n'existent pas. */
  let prec = Buffer.alloc(parLigne), p = 0;
  for (let y = 0; y < haut; y++) {
    const filtre = d[p++];
    const ligne = Buffer.from(d.subarray(p, p + parLigne)); p += parLigne;
    for (let x = 0; x < parLigne; x++) {
      const a = x >= octetsPixel ? ligne[x - octetsPixel] : 0;
      const b = prec[x];
      const c = x >= octetsPixel ? prec[x - octetsPixel] : 0;
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

async function lireDossier(chemin) {
  const noms = await readdir(chemin);
  const res = { image: null, imageOctets: 0, images: [], lignes: [], fichiersTexte: [] };
  for (const n of noms) {
    const ext = extname(n).toLowerCase();
    const complet = join(chemin, n);
    const st = await stat(complet);
    if (!st.isFile()) continue;
    if (IMAGES.includes(ext)) {
      /* ⛔⛔ ON NE CHOISIT PLUS LA PHOTO AU POIDS. Défaut mesuré le
         08/08/2026, sur un dossier ne contenant QUE des images — le cas de
         l'user : « il n'y a que des images ». La règle « la plus lourde
         gagne » a retenu `fiche-technique.png`, une CAPTURE DE TEXTE, et
         l'aurait posée comme photo du produit sur la carte de vente.
         Une image ne dit pas ce qu'elle montre. Quand plusieurs se
         présentent, on ne devine pas : on les relève toutes et on le dit. */
      const buf = await readFile(complet);
      res.images.push({ nom: n, octets: st.size, ext: ext, chemin: complet,
        buf: buf, detoure: aDeLaTransparence(buf) });
    } else if (TEXTES.includes(ext)) {
      const txt = await readFile(complet, 'utf8');
      res.fichiersTexte.push(n);
      res.lignes.push({ nom: n.toLowerCase(), texte: txt });
    }
  }
  return res;
}

const texteCat = await readFile(join(RACINE, 'products.json'), 'utf8');
const brut = JSON.parse(texteCat);

/* ⛔ L'INDENTATION SE LIT DANS LE FICHIER, ELLE NE SE DEVINE PAS. Cet outil
   écrivait en indentation 1 alors que `products.json` vit en 2 : mesuré le
   08/08/2026 sur une modification d'UNE SEULE fiche, le diff annonçait
   **57 795 lignes ajoutées et 57 772 supprimées**. Un diff pareil est
   irrelisible — plus personne ne voit ce qui a changé. */
const INDENT = ((texteCat.split('\n')[1] || '').match(/^ */) || [''])[0].length || 2;
const FIN_LIGNE = /\n$/.test(texteCat) ? '\n' : '';
const enveloppe = !Array.isArray(brut);
const produits = enveloppe ? brut.products : brut;
const parSku = new Map();
produits.forEach((p) => parSku.set(String(p.sku || '').toUpperCase(), p));

const dossiers = (await readdir(racine, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name !== '__MACOSX')
  .map((d) => d.name);

const faits = [], refus = [], aRelire = [], detail = [];
for (const nom of dossiers) {
  const sku = referenceDuNom(nom);
  if (!sku) { refus.push([nom, 'aucune référence lisible dans le nom du dossier']); continue; }
  const fiche = parSku.get(sku);
  if (!fiche) { refus.push([nom, 'la référence ' + sku + ' n\'est pas au catalogue']); continue; }
  if (String(fiche.brand || '').toUpperCase() !== marque.toUpperCase()) {
    refus.push([nom, 'fiche ' + fiche.brand + ' — hors marque déclarée']); continue;
  }
  const d = await lireDossier(join(racine, nom));
  /* Une seule image : aucune ambiguïté, c'est la photo. Plusieurs : trois
     critères dans cet ordre, du plus sûr au moins sûr, et on renonce plutôt
     que de deviner. */
  if (d.images.length === 1) { d.retenue = d.images[0]; d.pourquoi = 'seule image du dossier'; }
  else if (d.images.length > 1) {
    /* ① Le fond transparent tranche seul, et c'est le critère de l'user. */
    const detourees = d.images.filter((i) => i.detoure);
    /* ② LE FORMAT, quand le détourage ne dit rien. L'user, 08/08/2026 : « il y
       en a un c'est un PNG et l'autre c'est une image JPEG, techniquement la
       dissociation est censée être facile ». Elle l'est — mais seulement dans
       ce sens-là : un JPEG ne peut PAS porter de transparence, donc un JPEG
       n'est jamais un visuel détouré. L'inverse est faux, une capture d'écran
       est très souvent un PNG opaque ; c'est pourquoi ce critère passe APRÈS
       le détourage et exige qu'il n'y ait qu'UN SEUL PNG face à des JPEG. */
    const pngs = d.images.filter((i) => i.ext === '.png');
    const jpegs = d.images.filter((i) => i.ext === '.jpg' || i.ext === '.jpeg');
    /* ③ Le nom du fichier, en dernier recours. */
    const claires = d.images.filter((i) => /produit|photo|visuel|packshot/i.test(i.nom));
    if (detourees.length === 1) { d.retenue = detourees[0]; d.pourquoi = 'fond transparent'; }
    else if (detourees.length > 1) {
      /* Plusieurs visuels détourés : ce sont tous des photos produit. On prend
         la plus grande — entre deux VRAIES photos, le poids est un critère
         acceptable ; entre une photo et une capture, il ne l'était pas. */
      d.retenue = detourees.slice().sort((a, b) => b.octets - a.octets)[0];
      d.pourquoi = 'fond transparent, la plus grande de ' + detourees.length;
    } else if (pngs.length === 1 && jpegs.length === d.images.length - 1) {
      d.retenue = pngs[0];
      d.pourquoi = 'seul PNG face à ' + jpegs.length + ' JPEG';
    } else if (claires.length === 1) {
      d.retenue = claires[0];
      d.pourquoi = 'son nom dit que c\'est le produit';
    }
  }
  if (d.images.length > 1 && !d.retenue) {
    refus.push([nom, d.images.length + ' images, et aucun départage : ni fond '
      + 'transparent, ni un seul PNG face à des JPEG, ni un nom qui tranche — '
      + d.images.map((i) => i.nom).join(', ')
      + '. Impossible de dire laquelle est le produit — je les regarderai']);
    continue;
  }
  if (d.retenue) {
    d.image = 'data:' + MIME[d.retenue.ext] + ';base64,' + d.retenue.buf.toString('base64');
    d.imageNom = d.retenue.nom + ' — ' + d.pourquoi;
  }
  /* Les captures de fiche technique sont RELEVÉES, pas lues : un outil ne
     sait pas lire une image. Elles sont listées pour être ouvertes à la main. */
  const aLire = d.images.filter((i) => i !== d.retenue).map((i) => i.nom);
  if (aLire.length && !d.lignes.length) {
    aRelire.push([sku, nom, aLire.join(', ')]);
  }
  if (d.image && d.image.length > IMG_MAX) {
    refus.push([nom, 'image de ' + Math.round(d.image.length * 0.75 / 1000)
      + ' Ko : au-delà des 525 Ko qu\'un document peut porter. Réduis-la, '
      + 'elle ne sera pas dégradée automatiquement']);
    continue;
  }

  const specs = {}, phrases = [];
  d.lignes.forEach((f) => {
    const estTechnique = /techni|caract|spec/i.test(f.nom);
    const estDescription = /descri|présent|presenta/i.test(f.nom);
    f.texte.split(/\r?\n/).forEach((ligne) => {
      const t = ligne.trim();
      if (!t) return;
      const c = estCaracteristique(t);
      if (c && !estDescription) { specs[c.cle] = c.val; return; }
      if (!estTechnique || !c) phrases.push(t);
    });
  });

  const majs = [];
  if (d.image) { fiche.img = d.image; majs.push('photo (' + d.imageNom + ')'); }
  if (phrases.length) { fiche.desc = phrases.join('\n'); majs.push(phrases.length + ' ligne(s) de description'); }
  if (Object.keys(specs).length) {
    fiche.specs = Object.assign({}, fiche.specs || {}, specs);
    majs.push(Object.keys(specs).length + ' caractéristique(s)');
  }
  if (!majs.length) { refus.push([nom, 'dossier vide : ni image ni texte exploitable']); continue; }
  detail.push({ sku: sku, image: d.retenue ? d.retenue.nom : null, pourquoi: d.pourquoi || null,
    lignes: phrases.length, specs: Object.keys(specs).length });
  /* Une fiche qui a reçu SA description et SES caractéristiques n'est plus à
     compléter. Tant qu'il manque l'un des deux, la trace reste. */
  if (phrases.length && Object.keys(specs).length) delete fiche.ficheAcompleter;
  faits.push([sku, majs.join(', ')]);
}

/* ⚠️ SORTIE LISIBLE PAR UNE MACHINE. La porte qui prouve que le départage des
   images fonctionne doit s'ancrer sur le RÉSULTAT — quelle image a été
   retenue — jamais sur la formulation du rapport : « un harnais ne s'ancre
   jamais sur une formulation exacte », et celles-ci changent. */
if (args.includes('--json')) {
  if (confirmer) {                       // sinon `--json --confirmer` n'écrirait rien EN SILENCE
    console.error('⛔ --json est un mode de LECTURE : il ne s\'accompagne pas de --confirmer');
    process.exit(2);
  }
  console.log(JSON.stringify({ detail: detail,
    refus: refus.map((r) => ({ dossier: r[0], motif: r[1] })) }));
  process.exit(0);
}

const l = (s) => console.log(s);
l('');
l('═══ IMPORT DES DOSSIERS ' + marque.toUpperCase()
  + (confirmer ? '' : '   — ESSAI, RIEN N\'EST ÉCRIT') + ' ═══');
l('');
l('  dossiers lus ................ ' + dossiers.length);
l('  fiches enrichies ............ ' + faits.length);
l('  dossiers REFUSÉS ............ ' + refus.length);
l('');
faits.slice(0, 15).forEach((f) => l('   · ' + String(f[0]).padEnd(16) + f[1]));
if (aRelire.length) {
  l('');
  l('  📷 CAPTURES À LIRE À LA MAIN — un outil ne lit pas une image :');
  aRelire.slice(0, 20).forEach((r) => l('     ' + String(r[0]).padEnd(16) + r[2]));
}
if (refus.length) {
  l('');
  l('  ⛔ REFUSÉS — rien n\'a été écrit pour ceux-là :');
  refus.slice(0, 20).forEach((r) => l('     ' + String(r[0]).slice(0, 30).padEnd(32) + r[1]));
}
l('');

if (!confirmer) {
  l('  ⚠️ ESSAI — --confirmer pour écrire.');
  l('');
  process.exit(0);
}
const sauve = join(RACINE, 'archives', 'products-avant-dossiers.json');
await writeFile(sauve, JSON.stringify(brut, null, INDENT) + FIN_LIGNE);
await writeFile(join(RACINE, 'products.json'), JSON.stringify(brut, null, INDENT) + FIN_LIGNE);
l('  ✅ ' + faits.length + ' fiche(s) enrichie(s)');
l('  sauvegarde : archives/products-avant-dossiers.json');
l('');
