#!/usr/bin/env node
'use strict';
/* ══ CE QUE LE TRAQUEUR SAURA FAIRE, ET CE QU'IL NE SAURA PAS ════════════════
   `node scripts/bilan-traqueur.js <dossier-balayage> [--sortie <dossier>]`

   ⛔ DEMANDE DE L'USER, 05/08/2026 : « je veux savoir combien de produits ne
   seront pas traités lorsque le traqueur sera déclenché en mode réel, et je
   veux que tu me donnes ces références, uniquement celles qui ne seront pas
   reconnues » — puis, le lendemain : « tu utilises des canevas que je puisse
   sélectionner et copier-coller », JAMAIS un tableau dans la réponse.

   ⛔ CE QUE « TRAITÉE » VEUT DIRE ICI, ET RIEN D'AUTRE : une fiche est traitée
   si le traqueur, en relisant le balayage, la RETROUVE — par son SKU exact,
   par sa racine commerciale, ou par sa racine de modèle + variante. C'est le
   même chemin d'appariement que `api/admin.js` emprunte en mode réel ; on ne
   simule pas, on rejoue les trois index qu'il construit.

   ⚠️ AUCUN PRIX N'EST ÉCRIT. Cet outil LIT le balayage et le catalogue, et
   écrit des CSV. Portes lues : J3 — annonces publiques, aucune donnée
   personnelle ; J4 — aucun prix calculé ni modifié ; J5 — aucune TVA. */

const fs = require('fs');
const path = require('path');
const priceParse = require('../api/_lib/price-parse.js');
const admin = require('../api/admin.js')._internals;

const RACINE = path.join(__dirname, '..');

function csvChamp(v) {
  const s = (v == null) ? '' : String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function ecrireCsv(fichier, entete, lignes) {
  const corps = [entete.join(';')].concat(lignes.map((l) => l.map(csvChamp).join(';'))).join('\r\n');
  fs.writeFileSync(fichier, '﻿' + corps + '\r\n', 'utf8');
}
function prixFr(v) {
  return (typeof v === 'number' && isFinite(v) && v > 0) ? v.toFixed(2).replace('.', ',') : '';
}

/* Relit toutes les pages d'un balayage : les annonces reconnues, les inconnues,
   et les OFFRES sans référence — c'est dans ces dernières que se cachent la
   plupart des titres lisibles. */
function lireBalayage(dossier, marque) {
  const vues = new Set(), parRef = new Map(), offres = [];
  fs.readdirSync(dossier).filter((f) => /\.json$/.test(f)).forEach((f) => {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')); } catch (e) { return; }
    const e = j.page && j.page.empreinte;
    if (e && vues.has(e)) return;                       // page rejouée : une seule fois
    if (e) vues.add(e);
    ['reconnus', 'inconnus'].forEach((cle) => {
      (j[cle] || []).forEach((it) => {
        if (!it.sku || typeof it.srcTTC !== 'number' || it.srcTTC <= 0) return;
        const sku = String(it.sku).toUpperCase();
        if (!parRef.has(sku)) {
          parRef.set(sku, { titre: it.titre || it.name || '', car: it.car });
        }
        /* ⛔⛔ LE TITRE D'UNE TUILE RECONNUE COMPTE AUSSI DANS LA FOUILLE.
           Défaut de CET OUTIL, mesuré le 08/08/2026 : il ne cherchait la
           référence que dans les OFFRES sans référence, jamais dans les titres
           des tuiles reconnues. Il annonçait donc « aucune annonce ne nomme
           cette référence » pour des produits que le balayage citait en toutes
           lettres — un instrument qui se trompe est pire qu'une absence
           d'instrument, il ferme la piste. */
        if (it.name) offres.push({ titre: it.name, car: it.car, ou: cle });
      });
    });
    (j.sansRefDetail || []).forEach((it) => {
      if (!it.titre) return;
      offres.push({ titre: it.titre, car: it.car, ou: 'offre' });
      const lu = priceParse.lireReferenceDuTitre(it.titre, marque);
      if (lu.ref && !parRef.has(lu.ref)) parRef.set(lu.ref, { titre: it.titre, car: it.car });
    });
  });
  return { parRef: parRef, offres: offres, pages: vues.size };
}

function principal(argv) {
  const dossier = argv.find((a) => !a.startsWith('--'));
  const iS = argv.indexOf('--sortie');
  const sortie = iS !== -1 ? argv[iS + 1] : path.join(RACINE, 'archives', 'idealo');
  const iM = argv.indexOf('--marque');
  const marque = iM !== -1 ? argv[iM + 1] : 'DEWALT';
  if (!dossier || !fs.existsSync(dossier)) {
    console.error('⛔ dossier de balayage introuvable. '
      + 'usage : node scripts/bilan-traqueur.js <dossier> [--marque DEWALT] [--sortie <dossier>]');
    return 2;
  }

  const brut = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
  const catalogue = Array.isArray(brut) ? brut : (brut.products || []);
  const miennes = catalogue.filter(
    (p) => String(p.brand || '').toUpperCase() === marque.toUpperCase());

  /* ⛔ LES TROIS INDEX DU TRAQUEUR, DANS SON ORDRE À LUI. Les reconstruire
     autrement mesurerait autre chose que ce qui se passera en mode réel. */
  const index = {};
  miennes.forEach((p) => { index[String(p.sku).toUpperCase()] = p; });
  admin.pwIndexerRacines(miennes, index);
  admin.pwIndexerModeles(miennes, index);

  const balayage = lireBalayage(dossier, marque);
  const atteintes = new Set();
  balayage.parRef.forEach((info, sku) => {
    const cle = { sku: sku, name: info.titre, car: info.car };
    const p = index[sku] || index[priceParse.racineRef(sku)] || index[admin.pwCleModele(cle)];
    if (p) atteintes.add(p.sku);
  });

  const traitees = miennes.filter((p) => atteintes.has(p.sku));
  const non = miennes.filter((p) => !atteintes.has(p.sku));

  /* ── POUR CHAQUE NON TRAITÉE, POURQUOI — en français, pas en jargon ─────── */
  const lignes = non.map((p) => {
    const sku = String(p.sku).toUpperCase();
    const citee = balayage.offres.find((o) => o.titre.toUpperCase().indexOf(sku) !== -1);
    let cause, titre = '';
    if (!citee) {
      cause = 'aucune annonce de ce balayage ne nomme cette référence — '
        + 'elle sera traitée dès qu\'une annonce reparaîtra';
    } else {
      titre = citee.titre;
      const lu = priceParse.lireReferenceDuTitre(citee.titre, marque);
      if (!lu.ref && lu.pourMachines.indexOf(sku) !== -1) {
        cause = 'l\'annonce ne cite cette référence que comme MACHINE COMPATIBLE : '
          + 'lui écrire ce prix serait écrire le prix d\'un accessoire sur une machine';
      } else if (!lu.ref) {
        cause = 'l\'annonce vend plusieurs produits à la fois, ou en nomme trop '
          + 'pour qu\'on sache lequel elle vend — son prix ne peut pas être attribué';
      } else if (lu.ref !== sku) {
        cause = 'l\'annonce nomme une AUTRE référence (' + lu.ref + ')';
      } else {
        cause = 'la référence est bien lue, mais aucune fiche du catalogue ne la porte';
      }
    }
    return [p.sku, p.title || p.name || '', prixFr(p.price), p.category || '', cause, titre];
  }).sort((a, b) => String(a[4]).localeCompare(String(b[4])) || String(a[0]).localeCompare(String(b[0])));

  fs.mkdirSync(sortie, { recursive: true });
  const f = path.join(sortie, 'non-traitees-par-le-traqueur.csv');
  ecrireCsv(f, ['Référence sur mon site', 'Titre sur mon site', 'Mon prix de vente (€)',
    'Ma famille', 'POURQUOI le traqueur ne la traitera pas',
    'Le titre de l\'annonce, quand il y en a une'], lignes);

  const l = (s) => console.log(s);
  l('');
  l('═══ BILAN ' + marque.toUpperCase() + ' — CE QUE LE TRAQUEUR SAURA TRAITER ═══');
  l('');
  l('  pages de balayage lues .......... ' + balayage.pages);
  l('  références distinctes relevées ... ' + balayage.parRef.size);
  l('');
  l('  fiches ' + marque + ' au catalogue ..... ' + miennes.length);
  l('  · TRAITÉES en mode réel ......... ' + traitees.length
    + '  (' + (miennes.length ? (traitees.length / miennes.length * 100).toFixed(1) : '0') + ' %)');
  l('  · NON traitées .................. ' + non.length);
  l('');
  l('  écrit : ' + path.relative(RACINE, f));
  l('');
  return 0;
}

module.exports = { lireBalayage: lireBalayage };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
