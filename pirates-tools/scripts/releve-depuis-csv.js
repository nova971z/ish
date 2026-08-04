#!/usr/bin/env node
'use strict';
/* ══ CSV DU CLASSEMENT IDEALO → RELEVÉ POUR L'IMPORTATEUR ════════════════════
   `node scripts/releve-depuis-csv.js <a.csv> [b.csv …] --sortie <releve.json>`

   ⛔ POURQUOI CET OUTIL ET PAS UN AUTRE IMPORT. `outils/importer-catalogue.mjs`
   est LA seule porte d'entrée du catalogue (voir CARTOGRAPHIE §7.1) : c'est lui
   qui appelle le calculateur, refuse les doublons, force les familles connues
   et met le coût d'achat à l'abri. Cet outil-ci ne fait QUE traduire les CSV du
   classement idealo dans le format qu'il attend — il n'écrit jamais le
   catalogue lui-même.

   ⛔⛔ LE PRIX IDEALO **EST** LE `srcTTC` — CONVENTION DU PROJET, LUE DANS LE
   CODE, PAS DEVINÉE. `api/admin.js:2799` fait
   `pwComputePrice(p, it.price, …)` où `it.price` est le prix relevé chez
   idealo, et `pwComputePrice` le passe en `costTTC` à
   `priceModel.recommend()`. Le traqueur travaille ainsi depuis toujours :
   idealo est la SOURCE FOURNISSEUR du projet, son prix est le coût d'entrée
   du calculateur.
   ⚠️ J'ai d'abord voulu exiger un « taux d'achat » de l'user pour convertir
   ce prix en coût. C'était une question inutile : la réponse était écrite
   dans le code depuis le premier traqueur. Chercher avant de demander.

   ⛔ LE TITRE DU CSV EST LE NOM DE LA FICHE. Demande de l'user, 04/08/2026 :
   « tous les fichiers que je t'ai donnés portent un titre, tu ajoutes ce
   titre ». On ne fabrique donc jamais de libellé : `name` = colonne « Titre »,
   nettoyée de la marque en tête (l'importateur la remet).

   ⚠️ Portes lues : J3 — des annonces publiques, aucune donnée personnelle ;
   J4 — aucun prix n'est écrit ici, seul le calculateur les établit ;
   J5 — aucune TVA, aucun octroi de mer. */

const fs = require('fs');
const path = require('path');

/* Analyseur CSV conforme au format écrit par `classer-idealo.js` :
   séparateur point-virgule, BOM UTF-8, guillemets doublés. */
function analyserCsv(texte) {
  const net = String(texte || '').replace(/^﻿/, '');
  const lignes = [];
  let cellules = [], cur = '', dansGuillemets = false;
  for (let i = 0; i < net.length; i++) {
    const c = net[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (net[i + 1] === '"') { cur += '"'; i++; } else dansGuillemets = false;
      } else cur += c;
      continue;
    }
    if (c === '"') { dansGuillemets = true; continue; }
    if (c === ';') { cellules.push(cur); cur = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { cellules.push(cur); lignes.push(cellules); cellules = []; cur = ''; continue; }
    cur += c;
  }
  if (cur !== '' || cellules.length) { cellules.push(cur); lignes.push(cellules); }
  if (!lignes.length) return [];
  const entete = lignes[0].map((h) => h.trim());
  return lignes.slice(1).filter((l) => l.length > 1).map((l) => {
    const o = {};
    entete.forEach((h, i) => { o[h] = l[i] == null ? '' : l[i]; });
    return o;
  });
}

/* « 1 234,56 » → 1234.56. Un prix français ne se lit pas avec parseFloat. */
function prixFr(v) {
  const n = Number(String(v || '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

/* ⛔ LE TITRE, TEL QU'IL EST DANS LE CSV — on retire seulement la marque de
   tête, que l'importateur remet lui-même (« DeWALT <sku> — <libellé> »).
   Rien d'autre n'est réécrit : un titre reformulé n'est plus le titre. */
function libelleDepuisTitre(titre) {
  return String(titre || '')
    .replace(/^\s*de\s*walt\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Un titre qui n'est QUE la référence ne décrit rien. On ne le jette pas —
   l'importateur sait entrer une fiche `ficheAcompleter` — mais on le COMPTE,
   pour que le rapport dise combien de fiches attendent leur descriptif. */
function titreEstNu(titre, ref) {
  const t = libelleDepuisTitre(titre).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const r = String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return r !== '' && t === r;
}

/* ⛔ APRÈS-MARCHÉ ET VENDEURS TIERS — jamais au catalogue. Mesuré sur le
   balayage : « Batterie de remplacement 100 % originale », « AKKU POWER RB336
   pour DEWALT », « compatible avec DW087K ». Ce ne sont pas des produits
   DeWALT vendus en direct ; les référencer, c'est vendre l'article d'un autre
   sous une marque qu'on n'a pas. */
const APRES_MARCHE = /(de remplacement|100\s*%?\s*(original|authentique|neuf)|compatible avec|akku ?power|ersatz|nachbau|f[üu]r dewalt\b|replacement (battery|for))/i;

function construireReleve(lignes) {
  const unknown = [], ecartes = [];
  const vus = new Set();
  let sansRefCount = 0, titresNus = 0;

  lignes.forEach((r) => {
    const titre = r['Titre'] || '';
    const ref = String(r['Référence'] || '').trim().toUpperCase();
    const prix = prixFr(r['Prix idealo (€)']);
    const variante = r['Variante'] || '';

    if (APRES_MARCHE.test(titre)) {
      ecartes.push({ ref: ref, titre: titre, motif: 'après-marché ou vendeur tiers' });
      return;
    }
    if (!prix) {
      ecartes.push({ ref: ref, titre: titre, motif: 'prix absent — coût impossible sans supposition' });
      return;
    }
    /* Sans référence lisible, l'annonce ne peut pas porter un SKU
       constructeur : elle passe par le chemin « accessoire suivi par son
       NOM » de l'importateur, qui lui donne un sku interne AC-<hash>. */
    if (!ref) {
      sansRefCount++;
      ecartes.push({ ref: '', titre: titre, motif: 'aucune référence lisible — suivi par nom non couvert par ce relevé' });
      return;
    }
    if (vus.has(ref)) {
      ecartes.push({ ref: ref, titre: titre, motif: 'référence en doublon dans les CSV' });
      return;
    }
    vus.add(ref);
    if (titreEstNu(titre, ref)) titresNus++;
    unknown.push({
      /* ⛔ `srcTTC` = le prix idealo TEL QUEL. C'est ce que fait déjà le
         traqueur (`api/admin.js` → `pwComputePrice(p, it.price)`), et le
         calculateur en tire le prix de vente avec la marge cible. */
      sku: ref,
      srcTTC: prix,
      name: libelleDepuisTitre(titre),
      varianteIdealo: variante
    });
  });

  return { unknown: unknown, ecartes: ecartes,
    sansRef: sansRefCount, titresNus: titresNus };
}

function principal(argv) {
  const fichiers = argv.filter((a) => /\.csv$/i.test(a));
  const iS = argv.indexOf('--sortie');
  const sortie = iS !== -1 ? argv[iS + 1] : null;
  const marqueI = argv.indexOf('--marque');
  const marque = marqueI !== -1 ? argv[marqueI + 1] : 'DeWALT';

  if (!fichiers.length || !sortie) {
    console.error('usage : node scripts/releve-depuis-csv.js <a.csv> [b.csv] '
      + '--sortie <releve.json> [--marque DeWALT]');
    return 2;
  }

  let lignes = [];
  fichiers.forEach((f) => {
    if (!fs.existsSync(f)) { console.error('⛔ fichier absent : ' + f); process.exit(2); }
    lignes = lignes.concat(analyserCsv(fs.readFileSync(f, 'utf8')));
  });

  const rel = construireReleve(lignes);
  const doc = { brand: marque,
    source: fichiers.map((f) => path.basename(f)), unknown: rel.unknown };
  fs.writeFileSync(sortie, JSON.stringify(doc, null, 1));

  const l = (s) => console.log(s);
  l('');
  l('═══ RELEVÉ DEPUIS LES CSV DU CLASSEMENT ═══');
  l('');
  l('  lignes CSV lues ............ ' + lignes.length);
  l('  RETENUES pour l\'import ..... ' + rel.unknown.length);
  l('  écartées ................... ' + rel.ecartes.length);
  const parMotif = {};
  rel.ecartes.forEach((e) => { parMotif[e.motif] = (parMotif[e.motif] || 0) + 1; });
  Object.keys(parMotif).forEach((m) => l('     · ' + parMotif[m] + '  ' + m));
  l('');
  l('  titres réduits à la référence : ' + rel.titresNus
    + '  (entrent avec ficheAcompleter)');
  l('  srcTTC = prix idealo TEL QUEL — convention du traqueur (admin.js:2799).');
  l('  Le calculateur (pricing-model) en tire le prix de vente, marge cible 15 % net.');
  l('');
  l('  écrit : ' + sortie);
  l('');
  return 0;
}

module.exports = { analyserCsv: analyserCsv, prixFr: prixFr,
  libelleDepuisTitre: libelleDepuisTitre, titreEstNu: titreEstNu,
  construireReleve: construireReleve, APRES_MARCHE: APRES_MARCHE };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
