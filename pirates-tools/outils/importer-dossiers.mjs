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
      res.images.push({ nom: n, octets: st.size, ext: ext, chemin: complet });
    } else if (TEXTES.includes(ext)) {
      const txt = await readFile(complet, 'utf8');
      res.fichiersTexte.push(n);
      res.lignes.push({ nom: n.toLowerCase(), texte: txt });
    }
  }
  return res;
}

const brut = JSON.parse(await readFile(join(RACINE, 'products.json'), 'utf8'));
const enveloppe = !Array.isArray(brut);
const produits = enveloppe ? brut.products : brut;
const parSku = new Map();
produits.forEach((p) => parSku.set(String(p.sku || '').toUpperCase(), p));

const dossiers = (await readdir(racine, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name !== '__MACOSX')
  .map((d) => d.name);

const faits = [], refus = [], aRelire = [];
for (const nom of dossiers) {
  const sku = referenceDuNom(nom);
  if (!sku) { refus.push([nom, 'aucune référence lisible dans le nom du dossier']); continue; }
  const fiche = parSku.get(sku);
  if (!fiche) { refus.push([nom, 'la référence ' + sku + ' n\'est pas au catalogue']); continue; }
  if (String(fiche.brand || '').toUpperCase() !== marque.toUpperCase()) {
    refus.push([nom, 'fiche ' + fiche.brand + ' — hors marque déclarée']); continue;
  }
  const d = await lireDossier(join(racine, nom));
  /* Une seule image : aucune ambiguïté, c'est la photo. Plusieurs : le nom
     doit trancher, sinon on refuse et on liste ce qu'on a vu. */
  if (d.images.length === 1) d.retenue = d.images[0];
  else if (d.images.length > 1) {
    const claires = d.images.filter((i) => /produit|photo|visuel|packshot/i.test(i.nom));
    const captures = d.images.filter((i) => /techni|caract|spec|descri|fiche/i.test(i.nom));
    if (claires.length === 1) d.retenue = claires[0];
    else if (captures.length === d.images.length - 1) {
      d.retenue = d.images.find((i) => captures.indexOf(i) === -1);
    }
  }
  if (d.images.length > 1 && !d.retenue) {
    refus.push([nom, d.images.length + ' images et aucun nom qui dise laquelle est le '
      + 'PRODUIT : ' + d.images.map((i) => i.nom).join(', ')
      + '. Nomme-la « produit » ou « photo », ou laisse-la seule dans le dossier']);
    continue;
  }
  if (d.retenue) {
    const buf = await readFile(d.retenue.chemin);
    d.image = 'data:' + MIME[d.retenue.ext] + ';base64,' + buf.toString('base64');
    d.imageNom = d.retenue.nom;
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
  /* Une fiche qui a reçu SA description et SES caractéristiques n'est plus à
     compléter. Tant qu'il manque l'un des deux, la trace reste. */
  if (phrases.length && Object.keys(specs).length) delete fiche.ficheAcompleter;
  faits.push([sku, majs.join(', ')]);
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
await writeFile(sauve, JSON.stringify(brut, null, 1));
await writeFile(join(RACINE, 'products.json'), JSON.stringify(brut, null, 1));
l('  ✅ ' + faits.length + ' fiche(s) enrichie(s)');
l('  sauvegarde : archives/products-avant-dossiers.json');
l('');
