/* banc-produits.js — CHAQUE PRODUIT DU SITE, PASSÉ AU PARSEUR, UN PAR UN.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ ORDRE DE L'USER, 12/08/2026 : « Tu revérifies tous les produits du site
   un par un et tu cherches absolument toutes les erreurs. […] S'il y a 5 000
   produits, tu revérifies les 5 000, c'est non négociable. […] Tu lis les
   descriptions, les titres, tu regardes le prix et tu vérifies comment le
   parseur réagit par rapport à ça. »
   Et, le même jour : « il est possible qu'il y ait la référence nue du style
   DTW700Z (+ jeu de clés 14 pièces) ! C'est pour ça que le titre ET la
   description doivent être lus et compris à 100 %. »

   ⚠️ CE QUE CE BANC FAIT, ET C'EST TOUT SAUF UN RÉSUMÉ : pour CHAQUE fiche, il
   fabrique la carte que le fournisseur en ferait — titre + description — et la
   fait passer par le CHEMIN RÉEL du parseur (`parseIdealo`), celui qui écrit
   les prix. Puis il compare, ligne à ligne :
     · la référence LUE contre la référence de la fiche ;
     · le conditionnement que la NOMENCLATURE lit dans la référence contre ce
       que le TITRE et la DESCRIPTION annoncent en toutes lettres ;
     · le prix retrouvé contre le prix envoyé.
   Un désaccord est nommé, jamais lissé.

   ⛔ POURQUOI PASSER PAR `parseIdealo` ET PAS PAR LA SEULE GRAMMAIRE : parce que
   c'est le chemin qui décide d'un prix. Une règle vérifiée hors de son chemin
   d'exécution est une règle vérifiée nulle part — leçon déjà payée deux fois
   (M-32, M-39).

   ⚠️ CE BANC NE MODIFIE RIEN et ne lit aucun service : il relit `products.json`
   et le code. On peut le rejouer n'importe quand.

   Usage : node scripts/banc-produits.js [--csv sortie.csv] [--marque X]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const pp = require(path.join(RACINE, 'api/_lib/price-parse.js'));
const nomen = pp.nomenclature;

const args = process.argv.slice(2);
const iCsv = args.indexOf('--csv');
const SORTIE = iCsv !== -1 ? args[iCsv + 1] : null;
const iM = args.indexOf('--marque');
const FILTRE = iM !== -1 ? String(args[iM + 1] || '').toUpperCase() : '';

const fiches = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
const M = (b) => String(b || '').toUpperCase().replace(/[\s-]/g, '');

/* ── CE QUE LE TEXTE ANNONCE, EN TOUTES LETTRES ────────────────────────────
   L'oracle, c'est le TEXTE de la fiche — jamais le code qu'on teste. */
function contenuAnnonceParLeTexte(texte) {
  const s = String(texte || '');
  const out = { batteries: null, ah: null, coffret: null, nu: null };
  const mb = s.match(/(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*Ah/);
  if (mb) { out.batteries = parseInt(mb[1], 10); out.ah = parseFloat(mb[2].replace(',', '.')); }
  else if (/\b(\d+)\s*batteries?\b/i.test(s)) out.batteries = parseInt(RegExp.$1, 10);
  if (/machine seule|outil nu|produit seul|\bsolo\b|sans batterie(?!\s*\+)/i.test(s)) out.nu = true;
  if (/\bcoffret\b|\bmakpac\b|\btstak\b|\bmallette\b/i.test(s)) out.coffret = true;
  if (/sans coffret/i.test(s)) out.coffret = false;
  return out;
}

/* La carte que le fournisseur ferait de cette fiche : titre puis description,
   puis le prix — exactement le gabarit que `parseIdealo` sait lire. */
function carteDe(p, prixTTC) {
  const lignes = [];
  lignes.push(String(p.title || p.name || '').slice(0, 200));
  const d = String(p.desc || p.description_long || '').replace(/\s+/g, ' ').trim();
  if (d) lignes.push(d.slice(0, 300));
  lignes.push('En stock');
  lignes.push('12 offres');
  lignes.push('à partir de ' + String(prixTTC.toFixed(2)).replace('.', ',') + ' €');
  return lignes.join('\n');
}

const R = { total: 0, luJuste: 0, luAutre: 0, nonLu: 0, packEcarte: 0,
  prixJuste: 0, prixPerdu: 0, desaccord: 0 };
const lignes = [];
const compteurs = Object.create(null);
function ajouter(code) { compteurs[code] = (compteurs[code] || 0) + 1; }

fiches.forEach((p) => {
  const marque = M(p.brand);
  if (FILTRE && marque !== FILTRE) return;
  if (!p.sku) return;
  R.total += 1;

  const prix = Number(p.price) > 0 ? Number(p.price) : 100;
  const texte = String(p.title || '') + ' ' + String(p.desc || '');
  const carte = carteDe(p, prix);

  let res;
  try { res = pp.parseIdealo(carte, p.brand); }
  catch (e) { res = { items: [], packs: [], sansRef: [], erreur: e.message }; }

  const item = (res.items || [])[0] || null;
  const pack = (res.packs || [])[0] || null;
  const skuFiche = String(p.sku).toUpperCase();
  const skuLu = item ? String(item.sku).toUpperCase() : (pack ? String(pack.skuRefuse || '').toUpperCase() : '');

  /* ① LA RÉFÉRENCE EST-ELLE RETROUVÉE ? */
  let verdictRef;
  if (pack) { verdictRef = 'ECARTE COMME PACK'; R.packEcarte += 1; ajouter('ecarte-comme-pack'); }
  else if (!item) { verdictRef = 'AUCUNE REFERENCE LUE'; R.nonLu += 1; ajouter('aucune-reference-lue'); }
  else if (skuLu === skuFiche) { verdictRef = 'reference retrouvee'; R.luJuste += 1; }
  else { verdictRef = 'AUTRE REFERENCE LUE : ' + skuLu; R.luAutre += 1; ajouter('autre-reference-lue'); }

  /* ② LE PRIX EST-IL RETROUVÉ ? Un prix perdu, c'est une fiche que le traqueur
     ne pourra jamais mettre à jour depuis une carte de cette forme. */
  let verdictPrix = 'non applicable';
  if (item) {
    const ecart = Math.abs(Number(item.price) - prix);
    if (ecart < 0.01) { verdictPrix = 'prix retrouve'; R.prixJuste += 1; }
    else { verdictPrix = 'PRIX DIFFERENT : ' + item.price; R.prixPerdu += 1; ajouter('prix-different'); }
  } else if (!pack) { verdictPrix = 'PRIX PERDU'; R.prixPerdu += 1; ajouter('prix-perdu'); }

  /* ③ LA RÉFÉRENCE ET LE TEXTE DISENT-ILS LA MÊME CHOSE ? C'est la question
     d'argent : une référence qui dit « nue » sur une fiche dont le texte
     annonce deux batteries, c'est un coût qui partira sur le mauvais produit. */
  const dit = contenuAnnonceParLeTexte(texte);
  let lu = null;
  if (marque === 'MAKITA') {
    const l = nomen.lireSuffixeMakita(skuFiche); const c = l && l.config;
    if (c) lu = { batteries: c.nbBatteries, ah: c.ah || null, coffret: !!c.coffret };
  } else if (marque === 'DEWALT') {
    const l = nomen.lireSuffixeDewalt(skuFiche);
    if (l && l.suffixe) lu = { batteries: l.nbBatteries, ah: l.ah || null, coffret: !!l.coffret };
  }
  const desaccords = [];
  if (lu) {
    if (dit.batteries != null && dit.batteries !== lu.batteries) {
      desaccords.push('batteries : reference ' + lu.batteries + ', texte ' + dit.batteries);
      ajouter(lu.batteries < dit.batteries ? 'SOUS-ESTIME-batteries' : 'surestime-batteries');
    }
    if (dit.ah != null && lu.ah && Math.abs(dit.ah - lu.ah) > 0.05) {
      desaccords.push('capacite : reference ' + lu.ah + ' Ah, texte ' + dit.ah + ' Ah');
      ajouter('capacite-differente');
    }
    if (dit.coffret === true && !lu.coffret) {
      desaccords.push('coffret : le texte en annonce un, la reference n en dit rien');
      ajouter('coffret-au-texte-absent-de-la-reference');
    }
    if (dit.nu === true && lu.batteries > 0) {
      desaccords.push('le texte dit MACHINE SEULE, la reference annonce ' + lu.batteries + ' batterie(s)');
      ajouter('SOUS-ESTIME-texte-dit-nu');
    }
  }
  if (desaccords.length) R.desaccord += 1;

  /* ④ LE TITRE OU LA DESCRIPTION ANNONCENT-ILS UN AJOUT ? */
  const ajout = pp.titreAjouteDuContenu(texte);
  const refNue = pp.referenceEstNue(skuFiche, p.brand);
  if (ajout && refNue && !pack) ajouter('ajout-annonce-mais-non-ecarte');

  lignes.push({
    sku: p.sku, marque: p.brand, titre: String(p.title || '').slice(0, 90),
    descriptif: String(p.desc || '').slice(0, 120),
    prixEnvoye: prix, verdictRef: verdictRef, skuLu: skuLu,
    verdictPrix: verdictPrix,
    conditionnementLuDansLaReference: lu
      ? (lu.batteries + ' batterie(s)' + (lu.ah ? ' de ' + lu.ah + ' Ah' : '') + (lu.coffret ? ' + coffret' : ''))
      : 'la reference ne dit rien de son contenu',
    conditionnementAnnonceParLeTexte: (dit.batteries != null ? dit.batteries + ' batterie(s)' : '')
      + (dit.ah != null ? ' de ' + dit.ah + ' Ah' : '')
      + (dit.coffret === true ? ' + coffret' : '') + (dit.nu === true ? ' machine seule' : '')
      || 'le texte ne dit rien',
    desaccords: desaccords.join(' ; '),
    titreOuDescriptifAnnonceUnAjout: ajout ? 'OUI' : 'non',
    referenceEstNue: refNue ? 'OUI' : 'non'
  });
});

console.log('══ BANC PRODUIT PAR PRODUIT — ' + R.total + ' fiches passées au parseur');
console.log('');
console.log('  référence RETROUVÉE par le parseur     : ' + R.luJuste
  + '  (' + (R.luJuste / R.total * 100).toFixed(1) + ' %)');
console.log('  AUTRE référence lue                    : ' + R.luAutre);
console.log('  aucune référence lue                   : ' + R.nonLu);
console.log('  écartée comme PACK                     : ' + R.packEcarte);
console.log('  prix retrouvé au centime               : ' + R.prixJuste);
console.log('  prix perdu ou différent                : ' + R.prixPerdu);
console.log('  ⛔ désaccord référence ↔ texte          : ' + R.desaccord);
console.log('');
Object.keys(compteurs).sort().forEach((k) => {
  console.log('   ' + String(compteurs[k]).padStart(5) + '  ' + k);
});

if (SORTIE) {
  const cel = (v) => {
    const s = String(v == null ? '' : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const COL = Object.keys(lignes[0] || { sku: 1 });
  const L = [COL.join(';')];
  lignes.forEach((r) => L.push(COL.map((k) => cel(r[k])).join(';')));
  fs.writeFileSync(SORTIE, '﻿' + L.join('\r\n') + '\r\n', 'utf8');
  console.log('\ntableau écrit : ' + SORTIE + ' (' + (L.length - 1) + ' lignes)');
}
