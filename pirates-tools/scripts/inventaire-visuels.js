#!/usr/bin/env node
'use strict';
/* ══ INVENTAIRE DES VISUELS — LA PREUVE QU'ILS N'ONT PAS BOUGÉ ═══════════════
   `node scripts/inventaire-visuels.js [--hors-combos] [--ecrire <fichier>]`

   ⛔ POURQUOI CET OUTIL EXISTE. Demande de l'user, 04/08 : « prépare les PNG
   correctement, sans modifier leur qualité ni leur taille, il faut qu'ils
   soient tels quels au pixel près ». Le chantier qui vient — rattacher ses
   fiches aux références du comparateur — peut déplacer ou réécrire des
   visuels. Ses mots, deux jours plus tôt : « ça a été un gros chantier quand
   même ».

   ⛔⛔ CET OUTIL NE MODIFIE RIEN. Pas une conversion, pas une compression, pas
   un octet. Il LIT, et il rend une empreinte. C'est le seul moyen de prouver
   APRÈS coup que rien n'a bougé : promettre « je n'ai pas touché aux images »
   ne vaut rien ; comparer deux empreintes, si.

   ⛔ CE QU'IL RELÈVE, ET POURQUOI CHACUN COMPTE :
   · SHA-256 du fichier — l'octet près. Deux fichiers de même taille et mêmes
     dimensions peuvent différer : seule l'empreinte le dit ;
   · LARGEUR × HAUTEUR lues DANS L'EN-TÊTE — c'est le « pixel près » qu'il
     demande. La taille en octets ne suffit pas : une recompression peut rendre
     un fichier plus petit à dimensions égales, et l'inverse ;
   · la taille en octets — c'est elle qui trahit une recompression à
     dimensions inchangées.

   ⚠️ LES DIMENSIONS SE LISENT À LA MAIN, sans dépendance. `sharp` n'est pas
   installé (vérifié), et ⛔ le protocole interdit de réécrire un décodeur
   d'images : on ne DÉCODE pas, on lit seulement les quelques octets d'en-tête
   que les formats PNG et WebP déclarent. Un format non reconnu est SIGNALÉ,
   jamais deviné — mieux vaut « je ne sais pas lire » qu'une dimension fausse.

   ⚠️ Portes lues : J3 — des chemins de fichiers et des empreintes, aucune
   donnée personnelle ; J4 — aucun prix ; J5 — aucune TVA. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');

/* ── DIMENSIONS, LUES DANS L'EN-TÊTE ────────────────────────────────────────
   PNG : signature de 8 octets, puis un chunk IHDR dont les octets 16..23
   portent largeur et hauteur en gros-boutiste.
   WebP : conteneur RIFF, puis un bloc VP8 / VP8L / VP8X dont l'encodage des
   dimensions DIFFÈRE selon la variante — les trois sont traitées séparément,
   parce qu'en confondre deux rendrait un nombre plausible et faux. */
function dimensions(buf) {
  if (buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { l: buf.readUInt32BE(16), h: buf.readUInt32BE(20), format: 'png' };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF'
      && buf.toString('ascii', 8, 12) === 'WEBP') {
    const type = buf.toString('ascii', 12, 16);
    if (type === 'VP8 ') {
      // Bitstream simple : dimensions sur 14 bits chacune, à l'offset 26.
      return { l: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, format: 'webp/vp8' };
    }
    if (type === 'VP8L') {
      // Sans perte : 14 bits chacune, empaquetés, et stockés MOINS UN.
      const b = buf.readUInt32LE(21);
      return { l: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, format: 'webp/vp8l' };
    }
    if (type === 'VP8X') {
      // Étendu : 24 bits chacune, petit-boutiste, stockés MOINS UN.
      const l = buf[24] | (buf[25] << 8) | (buf[26] << 16);
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
      return { l: l + 1, h: h + 1, format: 'webp/vp8x' };
    }
    return { l: null, h: null, format: 'webp/inconnu' };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    /* JPEG : les dimensions vivent dans un marqueur SOFn qu'il faut aller
       chercher en parcourant les segments. On le fait, mais on s'arrête net si
       la structure surprend — un octet mal interprété donnerait une dimension
       crédible et fausse, ce qui est pire que pas de dimension. */
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return { l: null, h: null, format: 'jpg/illisible' };
      const marq = buf[i + 1];
      const taille = buf.readUInt16BE(i + 2);
      if (marq >= 0xc0 && marq <= 0xcf && marq !== 0xc4 && marq !== 0xc8 && marq !== 0xcc) {
        return { l: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), format: 'jpg' };
      }
      i += 2 + taille;
    }
    return { l: null, h: null, format: 'jpg/illisible' };
  }
  return { l: null, h: null, format: 'inconnu' };
}

function releverFichier(rel) {
  const abs = path.join(RACINE, String(rel).replace(/^\//, ''));
  if (!fs.existsSync(abs)) return { fichier: rel, present: false };
  const buf = fs.readFileSync(abs);
  const d = dimensions(buf);
  return {
    fichier: rel, present: true, octets: buf.length,
    largeur: d.l, hauteur: d.h, format: d.format,
    sha256: crypto.createHash('sha256').update(buf).digest('hex')
  };
}

/* ⛔ LES COMBOS S'ÉCARTENT SUR DEMANDE, ET SEULEMENT LEURS VISUELS. Décision
   de l'user, 04/08 : « il faut écarter les packs, ce que tu appelles les
   combos — il y en a trois, je pourrai te renvoyer les bons PNG facilement.
   En revanche il faut GARDER la fiche technique. »
   ⚠️ Écarter ici veut dire « ne pas inventorier son visuel », JAMAIS « retirer
   la fiche ». L'outil ne touche pas au catalogue — il ne fait que lire. */
function inventaire(produits, opts) {
  const o = opts || {};
  const lignes = [], ecartes = [], illisibles = [];
  (produits || []).forEach((p) => {
    if (!p || !p.heroImg) return;
    const combo = /combo/i.test(String(p.category || ''));
    if (o.horsCombos && combo) {
      ecartes.push({ sku: p.sku, categorie: p.category, motif: 'combo — visuel à refaire' });
      return;
    }
    const rel = releverFichier(p.heroImg);
    if (!rel.present || rel.largeur == null) illisibles.push({ sku: p.sku, ...rel });
    lignes.push({ sku: p.sku, id: p.id, categorie: p.category || null, combo: combo, ...rel });
  });
  return { lignes, ecartes, illisibles };
}

function principal(argv) {
  const horsCombos = argv.indexOf('--hors-combos') !== -1;
  const iEcrire = argv.indexOf('--ecrire');
  const catalog = require(path.join(RACINE, 'api', '_lib', 'catalog.js'));
  const produits = catalog.loadCatalogAvec({});
  const inv = inventaire(produits, { horsCombos: horsCombos });

  console.log('');
  console.log('═══ INVENTAIRE DES VISUELS — aucun fichier modifié ═══');
  console.log('');
  console.log('  fiches avec visuel inventoriées : ' + inv.lignes.length);
  if (inv.ecartes.length) {
    console.log('  écartées (combos, visuel à refaire) : ' + inv.ecartes.length);
    inv.ecartes.forEach((e) => console.log('     · ' + e.sku + '  ' + e.categorie));
  }
  const octets = inv.lignes.reduce((s, l) => s + (l.octets || 0), 0);
  console.log('  poids total ................... ' + octets + ' octets');
  const parFormat = {};
  inv.lignes.forEach((l) => { parFormat[l.format] = (parFormat[l.format] || 0) + 1; });
  console.log('  formats ....................... ' + JSON.stringify(parFormat));
  if (inv.illisibles.length) {
    console.log('');
    console.log('  ⚠️ ' + inv.illisibles.length + ' visuel(s) dont les dimensions n\'ont PAS pu être lues :');
    inv.illisibles.slice(0, 10).forEach((x) => console.log('     · ' + x.sku + '  ' + x.fichier + '  (' + x.format + ')'));
    console.log('  Une dimension non lue est SIGNALÉE, jamais devinée.');
  }
  if (iEcrire !== -1 && argv[iEcrire + 1]) {
    const dest = path.resolve(argv[iEcrire + 1]);
    fs.writeFileSync(dest, JSON.stringify(inv.lignes, null, 2));
    console.log('');
    console.log('  empreintes écrites dans ' + dest);
    console.log('  ⛔ C\'est ce fichier qui prouvera, après le chantier, que rien n\'a bougé.');
  }
  console.log('');
  return inv.illisibles.length ? 1 : 0;
}

module.exports = { dimensions: dimensions, inventaire: inventaire, releverFichier: releverFichier };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
