/* tableau-produits.js — UNE LIGNE PAR PRODUIT DU SITE, ET CHAQUE COLONNE DIT
   D'OÙ VIENT SON CHIFFRE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ ORDRE DE L'USER, 12/08/2026 : « le deuxième tableau que tu as fait, on
   comprend absolument rien, je sais pas à quoi correspond le prix, t'as fait
   ça à l'arrache. […] Tu vas revérifier produit par produit, un par un, et
   c'est TOUS les produits du site. »

   Il avait raison, et le défaut était double :
     ① le tableau listait des ANOMALIES, pas des PRODUITS — un produit sans
        anomalie n'y figurait pas, et un produit à trois anomalies y figurait
        trois fois. On ne pouvait donc pas le lire « produit par produit » ;
     ② la colonne « prix » ne disait pas LEQUEL — celui du fichier catalogue ou
        celui réellement servi. Or ce sont deux nombres différents, et seul le
        second décide d'une marge.

   ⇒ ICI : **une ligne par fiche, toutes les fiches**, et chaque prix porte son
   origine dans une colonne à part. Ce que je ne sais pas s'écrit « inconnu »,
   jamais zéro, jamais vide.

   ⚠️ CE QUE CE TABLEAU NE PEUT PAS SAVOIR, ET IL LE DIT COLONNE PAR COLONNE :
   le prix RÉELLEMENT servi vit chez l'hébergeur de données, que cette session
   ne peut pas lire. On ne le connaît que pour les fiches qu'un balayage a
   touchées — leur relevé le porte. Pour les autres, la colonne dit
   « inconnu (jamais touchée par un balayage) » et AUCUNE marge n'est calculée :
   une marge calculée sur le mauvais prix serait pire que pas de marge.

   Usage : node scripts/tableau-produits.js <dossier-releves...> --csv sortie.csv
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const model = require(path.join(RACINE, 'api/_lib/pricing-model.js'));
const priceParse = require(path.join(RACINE, 'api/_lib/price-parse.js'));
const nomen = priceParse.nomenclature;

const args = process.argv.slice(2);
const iCsv = args.indexOf('--csv');
const SORTIE = iCsv !== -1 ? args[iCsv + 1] : null;
const DOSSIERS = args.filter((a, i) => a !== '--csv' && i !== iCsv + 1);

if (!SORTIE) {
  console.error('usage : node scripts/tableau-produits.js <dossier-releves...> --csv sortie.csv');
  process.exit(2);
}

const fiches = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
const M = (b) => String(b || '').toUpperCase().replace(/[\s-]/g, '');

/* ── Ce que les relevés apportent ──────────────────────────────────────────
   `servi`  : le dernier prix ÉCRIT par un balayage — c'est le prix du site.
   `couts`  : le coût le plus bas VU pour chaque écriture de référence. */
const servi = Object.create(null);
const couts = new Map();
let nbPages = 0;
DOSSIERS.forEach((d) => {
  let fics;
  try { fics = fs.readdirSync(d).filter((f) => /^admin-\d+\.json$/.test(f)); }
  catch (e) { return; }
  fics.sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  fics.forEach((f) => {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { return; }
    nbPages += 1;
    const marque = M(j.brand);
    const noterCout = (sku, ttc) => {
      if (!sku || !(ttc > 0)) return;
      const k = marque + '|' + String(sku).toUpperCase();
      const e = couts.get(k);
      if (!e) couts.set(k, { min: ttc, max: ttc, n: 1 });
      else { e.min = Math.min(e.min, ttc); e.max = Math.max(e.max, ttc); e.n += 1; }
    };
    (j.unknown || j.inconnus || []).forEach((x) => noterCout(x.sku, x.srcTTC));
    (j.haussesDifferees || []).forEach((x) => noterCout(x.sku, x.srcTTC));
    (j.applied || []).forEach((x) => {
      noterCout(x.sku, x.srcTTC);
      servi[x.id] = { ht: x.newHt, ttc: x.newPrice, cout: x.srcTTC,
        titreCarte: x.titreCarte || '' };
    });
  });
});

/* Le coût qui s'applique VRAIMENT à une fiche : le moins cher de toutes les
   écritures qui la désignent — sa référence, sa racine, ses alias déclarés, et
   la forme sans préfixe de distributeur. Même chaîne que le traqueur. */
function coutDe(p) {
  const m = M(p.brand), s = String(p.sku || '').toUpperCase();
  const clefs = [s, priceParse.racineRef(s)].concat(
    Array.isArray(p.srcAltSkus) ? p.srcAltSkus : []);
  const nu = nomen.refSansPrefixeDistributeur(s, p.brand);
  if (nu) clefs.push(nu);
  let mn = Infinity, mx = 0, n = 0, vues = [];
  clefs.forEach((k) => {
    const e = couts.get(m + '|' + String(k).toUpperCase());
    if (!e) return;
    mn = Math.min(mn, e.min); mx = Math.max(mx, e.max); n += e.n;
    vues.push(String(k).toUpperCase());
  });
  return isFinite(mn) ? { min: mn, max: mx, n: n, vues: vues } : null;
}

const eur = (v) => (v == null || !isFinite(v)) ? '' : String(v.toFixed(2)).replace('.', ',');
const cel = (v) => {
  const s = String(v == null ? '' : v);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const COLONNES = [
  'reference', 'marque', 'produit', 'famille',
  'prix_du_fichier_catalogue_TTC',
  'prix_REELLEMENT_servi_TTC', 'origine_du_prix_servi',
  'cout_fournisseur_le_moins_cher_TTC', 'nb_offres_vues', 'ecritures_qui_designent_la_fiche',
  'titre_de_l_offre_retenue',
  'prix_JUSTE_selon_le_calculateur_TTC', 'ecart_avec_le_prix_servi',
  'marge_nette_apres_IS_au_prix_servi', 'verdict_argent',
  'poids_kg', 'poids_est_une_valeur_par_defaut',
  'descriptif', 'image', 'titre_provisoire'
];

const lignes = [COLONNES.join(';')];
const bilan = { total: 0, servi: 0, cout: 0, perte: 0, tropCher: 0, tropBas: 0, sansCout: 0 };

fiches.slice().sort((a, b) => String(a.brand).localeCompare(String(b.brand))
  || String(a.sku).localeCompare(String(b.sku))).forEach((p) => {
  bilan.total += 1;
  const c = coutDe(p);
  const s = servi[p.id] || null;
  if (s) bilan.servi += 1;
  if (c) bilan.cout += 1; else bilan.sansCout += 1;

  const prixServi = s ? s.ttc : null;
  const htServi = s ? s.ht : null;
  const origine = s
    ? 'ecrit par un balayage (releve a l appui)'
    : 'inconnu (jamais touchee par un balayage) — le prix vivant n est pas lisible d ici';

  let reco = null, marge = null, verdict = 'non calcule : ' + (c ? 'prix servi inconnu' : 'aucun cout releve');
  if (c) reco = model.recommend(p, { costTTC: c.min });
  if (c && htServi > 0) {
    const mg = model.marginAt(p, { priceHt: htServi, costTTC: c.min });
    if (!mg) verdict = 'transport hors grille (poids ' + p.weight_kg + ' kg) : le modele refuse';
    else {
      marge = Number(mg.netAfterIS);
      if (marge < 0) { verdict = 'VENTE A PERTE'; bilan.perte += 1; }
      else if (reco && htServi > reco.priceHt * 1.02) { verdict = 'vendu trop cher'; bilan.tropCher += 1; }
      else if (reco && htServi < reco.priceHt * 0.98) { verdict = 'vendu trop bas'; bilan.tropBas += 1; }
      else verdict = 'conforme au calculateur';
    }
  }
  const recoTTC = reco ? reco.priceHt * 1.2 : null;

  lignes.push([
    cel(p.sku), cel(p.brand), cel(String(p.title || p.name || '').slice(0, 90)), cel(p.category),
    cel(eur(Number(p.price))),
    cel(prixServi != null ? eur(prixServi) : 'inconnu'), cel(origine),
    cel(c ? eur(c.min) : 'aucun'), cel(c ? c.n : 0), cel(c ? c.vues.join(' | ') : ''),
    cel(s && s.titreCarte ? s.titreCarte : (s ? 'non archive (releve anterieur au 12/08)' : '')),
    cel(recoTTC != null ? eur(recoTTC) : 'non calculable sans cout'),
    cel(recoTTC != null && prixServi != null ? eur(prixServi - recoTTC) : ''),
    cel(marge != null ? eur(marge) : ''), cel(verdict),
    cel(String(p.weight_kg).replace('.', ',')),
    cel(Number(p.weight_kg) === 2 ? 'OUI — 2 kg pile, jamais pese' : 'non'),
    cel(p.desc && String(p.desc).trim().length >= 10 ? 'present' : 'ABSENT'),
    cel(p.img && !/placeholder/i.test(p.img) ? 'presente' : 'ABSENTE'),
    cel(/descriptif à compléter/i.test(String(p.title || '')) ? 'OUI' : 'non')
  ].join(';'));
});

fs.writeFileSync(SORTIE, '﻿' + lignes.join('\r\n') + '\r\n', 'utf8');

console.log('══ TABLEAU PRODUIT PAR PRODUIT — ' + bilan.total + ' fiches, UNE LIGNE CHACUNE');
console.log('   pages de relevé lues                     : ' + nbPages);
console.log('   fiches dont je connais le PRIX SERVI     : ' + bilan.servi);
console.log('   fiches avec un COÛT fournisseur relevé   : ' + bilan.cout);
console.log('   fiches sans aucun coût relevé            : ' + bilan.sansCout);
console.log('   ─────────────────────────────────────────');
console.log('   ⛔ VENTE À PERTE                          : ' + bilan.perte);
console.log('   vendu trop cher                          : ' + bilan.tropCher);
console.log('   vendu trop bas                           : ' + bilan.tropBas);
console.log('\ntableau écrit : ' + SORTIE + ' (' + (lignes.length - 1) + ' lignes, '
  + COLONNES.length + ' colonnes)');
