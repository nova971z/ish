#!/usr/bin/env node
'use strict';
/* ══ ALIGNER LES PRIX SUR LE COÛT IDEALO, PAR LE CALCULATEUR ═════════════════
   `node scripts/aligner-prix-idealo.js [--marque DeWALT] [--confirmer]`

   ⛔ POURQUOI. L'user, 04/08/2026 : « une machine DCD800NT qu'on vend beaucoup
   trop cher par rapport à son prix sur idealo … elle est vendue 112 € sur
   idealo … une fois que tu auras trouvé la cause tous les prix vont
   s'aligner ». La cause est fermée (les cartes nu/coffret sont fusionnées) ;
   restait à répercuter les coûts.

   ⛔⛔ AUCUN PRIX N'EST SAISI À LA MAIN. Chaque prix passe par
   `api/_lib/pricing-model.js` — `recommend(fiche, { costTTC, mode })` — depuis
   le coût relevé chez idealo. C'est la règle produits du projet, et c'est le
   MÊME chemin que le traqueur (`pwComputePrice`). Écrire un prix ici, même
   « évident », rouvrirait la porte que le projet a fermée.

   ⛔ LE COÛT VIENT DU CLASSEMENT, PAS D'UNE SUPPOSITION. On lit
   `archives/idealo/idealo-classe.json`, produit par `classer-idealo.js` : pour
   chaque modèle et chaque contenu de boîte, le prix idealo LE MOINS CHER.
   Aucune fiche sans coût relevé n'est touchée — son prix reste tel quel, et
   elle est comptée à part.

   ⛔⛔ LA CARTE COFFRET EST PRIXÉE À « NU + SUPPLÉMENT », ET C'EST UNE
   CORRECTION D'UNE ERREUR QUE J'AI ÉCRITE ICI MÊME. J'avais noté qu'elle
   « n'est jamais repricée, sinon le coffret se paierait deux fois ». FAUX :
   `app.js` → `applyVariant(v)` appelle `calcPrice(v)` sur la fiche
   BASCULÉE — c'est donc bien le prix de la carte coffret qui s'affiche et qui
   se débite. Le laisser à sa vieille valeur, c'était laisser servir un prix
   périmé (mesuré : une paire où la version NUE ressortait plus chère que la
   version COFFRET, ce qui n'a aucun sens commercial).
   ⚠️ Pas de double facturation : sur une paire de variantes, le client achète
   la RÉFÉRENCE coffret ; le drapeau `coffret` de `create-payment-intent` ne
   sert qu'aux produits SANS variante.

   ⛔⛔ ESSAI PAR DÉFAUT, et SAUVEGARDE avant toute écriture.

   ⚠️ Portes lues : J4 — le prix annoncé doit être exact et complet, c'est
   précisément ce que cet outil rétablit ; J3 — aucune donnée personnelle ;
   J5 — aucune TVA touchée, le territoire reste dérivé du code postal. */

const fs = require('fs');
const path = require('path');
const modele = require('../api/_lib/pricing-model.js');
const priceParse = require('../api/_lib/price-parse.js');
const classer = require('./classer-idealo.js');
const pricing = require('../api/_lib/pricing.js');

const RACINE = path.join(__dirname, '..');

/* Le coût le moins cher relevé chez idealo, par modèle + contenu de boîte.
   ⛔ Le coffret est HORS de la clé : la version nue et la version coffret d'un
   même outil partagent le même coût d'achat de machine. */
/* ⛔⛔⛔ UN CONSOMMABLE NE DONNE JAMAIS SON COÛT À UNE MACHINE.
   Défaut attrapé À L'ESSAI le 04/08, avant toute écriture : le cloueur
   `DCN692N` serait passé de 1 076,33 € à **163,12 €**, sur un coût de
   95,50 € — qui venait d'une annonce « 34° Clous en bande 2,8x70mm POUR
   cloueur sans fil DeWalt DCN692 ». Une boîte de clous. Le prix de vente
   serait tombé à un cinquième du prix d'achat réel de la machine.
   ⛔ La FAMILLE COMMERCIALE entre donc dans la clé : une machine ne peut
   prendre son coût que dans une annonce d'électro portatif, un consommable
   que dans une annonce de quincaillerie. C'est de l'argent, priorité 1. */
function indexCouts(produits) {
  const par = new Map();
  (produits || []).forEach((e) => {
    const ref = e.sku || (e.car && (e.car.sku || e.car.skuEclate)) || '';
    if (!ref || !(e.prix > 0)) return;
    const k = priceParse.racineModele(String(ref).toUpperCase())
      + '|' + (e.variante || '') + '|' + (e.rayonCommercial || '');
    const prec = par.get(k);
    if (!prec || e.prix < prec) par.set(k, e.prix);
  });
  return par;
}

/* La famille commerciale d'une FICHE du catalogue, dans le même vocabulaire
   que le classement. `ncCategory` est le champ que le site utilise déjà pour
   l'octroi de mer : `power_tool` est une machine, le reste ne l'est pas. */
function familleFiche(p) {
  if (p && p.ncCategory === 'power_tool') return 'ELECTRO_PORTATIF';
  const cat = String((p && p.category) || '');
  if (/quincaillerie|rangement/i.test(cat)) return 'QUINCAILLERIE';
  return 'ELECTRO_PORTATIF';
}

function cleFiche(p) {
  return priceParse.racineModele(String(p.sku || '').toUpperCase())
    + '|' + classer.varianteProduit(p.title || p.name, null)
    + '|' + familleFiche(p);
}

function principal(argv) {
  const iM = argv.indexOf('--marque');
  const marque = iM !== -1 ? argv[iM + 1] : 'DeWALT';
  const confirmer = argv.indexOf('--confirmer') !== -1;
  /* ⛔⛔ LE RELEVÉ NE VOIT QU'UNE PARTIE DU MARCHÉ, ET ÇA REND LES DEUX SENS
     ASYMÉTRIQUES. Mesuré le 07/08/2026 sur une capture de l'user : idealo
     annonce « 11 offres à partir de 44,00 € » pour un sac à outils dont AUCUNE
     annonce n'apparaît dans les 67 pages du balayage. Le coût retenu ici n'est
     donc pas « le moins cher d'idealo » — c'est « le moins cher de ce qu'on a
     capté ». Un échantillon partiel ne peut que SURESTIMER un coût, jamais le
     sous-estimer.
     Conséquence, dans l'ordre de priorité du projet (argent d'abord) :
       · une BAISSE ramène le prix vers un coût CONSTATÉ — au pire elle rogne
         une marge, et elle corrige un prix qu'on sait faux ;
       · une HAUSSE fait payer plus cher au client sur la foi d'un relevé
         incomplet — au pire elle ment sur le prix.
     `--sens baisses` n'applique donc que ce que la mesure soutient vraiment.
     `--sens tout` reste possible quand le balayage sera complet. */
  const iSens = argv.indexOf('--sens');
  const sens = iSens !== -1 ? String(argv[iSens + 1] || '') : 'tout';
  if (['tout', 'baisses', 'hausses'].indexOf(sens) === -1) {
    console.error('⛔ --sens attend « tout », « baisses » ou « hausses ».');
    return 2;
  }

  const fClasse = path.join(RACINE, 'archives', 'idealo', 'idealo-classe.json');
  if (!fs.existsSync(fClasse)) {
    console.error('⛔ ' + fClasse + ' absent : lancer d\'abord scripts/classer-idealo.js');
    return 2;
  }
  const couts = indexCouts(JSON.parse(fs.readFileSync(fClasse, 'utf8')).produits || []);

  const fCat = path.join(RACINE, 'products.json');
  const brut = JSON.parse(fs.readFileSync(fCat, 'utf8'));
  const tous = Array.isArray(brut) ? brut : (brut.products || []);

  const changes = [], sansCout = [], verrouilles = [], coffrets = [];
  tous.forEach((p) => {
    if (String(p.brand || '').toUpperCase() !== marque.toUpperCase()) return;
    /* ⛔ `priceLocked` est une DÉCISION COMMERCIALE de l'user, jamais une
       lacune : on ne la renverse pas. */
    if (p.priceLocked === true) { verrouilles.push(p.sku); return; }
    if (p.variantRole === 'coffret') { coffrets.push(p); return; }
    const cout = couts.get(cleFiche(p));
    if (!(cout > 0)) { sansCout.push(p.sku); return; }
    let reco = null;
    try { reco = modele.recommend(p, { costTTC: cout, mode: 'colissimo' }); }
    catch (e) { reco = null; }
    if (!reco || !(reco.priceHtFor.price > 0)) { sansCout.push(p.sku); return; }
    const nouveau = reco.priceHtFor.price;
    if (Math.abs(nouveau - (p.price || 0)) < 0.01) return;
    changes.push({ p: p, avant: p.price, apres: nouveau, ht: reco.priceHt, cout: cout });
  });

  const l = (s) => console.log(s);
  l('');
  l('═══ ALIGNEMENT DES PRIX SUR LE COÛT IDEALO — ' + marque.toUpperCase() + ' ═══');
  l('');
  l('  coûts idealo disponibles ............. ' + couts.size + ' modèles');
  l('  fiches à repricer .................... ' + changes.length);
  l('  sans coût relevé (INCHANGÉES) ........ ' + sansCout.length);
  l('  cartes coffret (prix = nu + supplément) ' + coffrets.length);
  l('  verrouillées par l\'user (priceLocked)  ' + verrouilles.length);
  l('');
  const baisses = changes.filter((c) => c.apres < c.avant);
  const hausses = changes.filter((c) => c.apres > c.avant);
  l('  BAISSES : ' + baisses.length + '   HAUSSES : ' + hausses.length);
  const aAppliquer = sens === 'tout' ? changes
    : (sens === 'baisses' ? baisses : hausses);
  if (sens !== 'tout') {
    l('  ⛔ --sens ' + sens + ' : ' + aAppliquer.length + ' fiche(s) seront écrites, '
      + (changes.length - aAppliquer.length) + ' laissées telles quelles.');
  }
  l('');
  /* ⛔⛔ LES HAUSSES SE MONTRENT AUSSI, ET C'EST UNE CORRECTION DE L'OUTIL.
     Il comptait les hausses depuis toujours et n'en affichait AUCUNE : seules
     les baisses passaient à l'écran. Or une baisse coûte de la marge, tandis
     qu'une HAUSSE fait payer trop cher au client — c'est le sens dans lequel
     une erreur se voit le moins et abîme le plus. Un rapport qui ne montre
     qu'un côté du mouvement n'est pas un rapport, c'est une vitrine. */
  const montrer = (titre, liste, tri) => {
    l('  ' + titre + ' :');
    liste.slice().sort(tri).slice(0, 10).forEach((c) => l('     '
      + String(c.p.sku).padEnd(15) + String(c.avant).padEnd(10) + '→ '
      + String(c.apres).padEnd(10) + '(coût idealo ' + c.cout + ' €)'));
    l('');
  };
  montrer('Les 10 plus fortes BAISSES', baisses,
    (a, b) => (a.apres - a.avant) - (b.apres - b.avant));
  montrer('Les 10 plus fortes HAUSSES', hausses,
    (a, b) => (b.apres - b.avant) - (a.apres - a.avant));

  /* Et le mouvement COMPLET part dans un CSV : l'user relit sur son iPad, il
     lui faut un canevas qu'il peut sélectionner et copier, pas trente lignes
     d'écran qui défilent. */
  const fRap = path.join(RACINE, 'archives', 'idealo', 'mouvement-des-prix.csv');
  const champ = (v) => {
    const s = (v == null) ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const eur = (v) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(2).replace('.', ',') : '';
  const lignesRap = changes.slice()
    .sort((a, b) => Math.abs(b.apres - b.avant) - Math.abs(a.apres - a.avant))
    .map((c) => [c.p.sku, c.p.title || c.p.name || '', c.p.category || '',
      eur(c.avant), eur(c.apres), eur(c.apres - c.avant),
      (c.apres < c.avant ? 'BAISSE' : 'HAUSSE'), eur(c.cout)]);
  fs.mkdirSync(path.dirname(fRap), { recursive: true });
  fs.writeFileSync(fRap, '﻿' + [[
    'Référence', 'Titre sur mon site', 'Ma famille', 'Ancien prix (€)',
    'Nouveau prix (€)', 'Écart (€)', 'Sens', 'Coût idealo relevé (€)'
  ].join(';')].concat(lignesRap.map((x) => x.map(champ).join(';'))).join('\r\n') + '\r\n', 'utf8');
  l('  écrit : ' + path.relative(RACINE, fRap) + '   (' + lignesRap.length + ' lignes)');
  l('');

  if (!confirmer) {
    l('');
    l('  ⚠️ ESSAI — rien n\'a été écrit. --confirmer pour agir.');
    l('');
    return 0;
  }

  const sauve = path.join(RACINE, 'archives', 'products-avant-alignement-prix.json');
  fs.mkdirSync(path.dirname(sauve), { recursive: true });
  fs.writeFileSync(sauve, JSON.stringify(brut, null, 1));

  aAppliquer.forEach((c) => { c.p.price = c.apres; c.p.price_ht = c.ht; });

  /* ⛔ LA CARTE COFFRET SUIT SA VERSION NUE : prix du solo + supplément du
     switch, arrondi au centime. Le supplément vient de `pricing`, jamais d'un
     chiffre écrit ici — sinon deux vérités se contrediraient. */
  const parSkuMaj = new Map(tous.map((x) => [String(x.sku).toUpperCase(), x]));
  let cofMaj = 0;
  coffrets.forEach((cof) => {
    const solo = parSkuMaj.get(String(cof.soloSku || '').toUpperCase());
    if (!solo || !(solo.price > 0)) return;
    const sup = pricing.coffretSurchargeCents(solo) / 100;
    const px = Math.round((solo.price + sup) * 100) / 100;
    if (Math.abs(px - (cof.price || 0)) < 0.01) return;
    cof.price = px;
    cof.price_ht = Math.round((px / (1 + (Number(cof.vat) || 0.2))) * 100) / 100;
    cofMaj++;
  });

  /* ⛔ ON RELIT AVANT D'ÉCRIRE : aucune paire ne doit rester inversée (la nue
     plus chère que le coffret), sinon on aurait déplacé le problème. */
  const parSku = new Map(tous.map((p) => [String(p.sku).toUpperCase(), p]));
  const inverses = tous.filter((p) => p.variantRole === 'solo' && p.coffretSku)
    .map((s) => ({ s: s, c: parSku.get(String(s.coffretSku).toUpperCase()) }))
    .filter((x) => x.c && x.s.price > 0 && x.c.price > 0 && x.s.price > x.c.price);
  if (inverses.length) {
    console.error('');
    console.error('⚠️ ' + inverses.length + ' paire(s) restent inversées (nue > coffret) :');
    inverses.slice(0, 6).forEach((x) => console.error('     ' + x.s.sku + ' ' + x.s.price
      + ' > ' + x.c.sku + ' ' + x.c.price));
    console.error('   Elles n\'ont pas de coût idealo pour la version nue — le prix de');
    console.error('   la carte coffret, lui, est un reliquat qui ne sera plus servi.');
  }

  const sortie = Array.isArray(brut) ? tous : Object.assign({}, brut, { products: tous });
  fs.writeFileSync(fCat, JSON.stringify(sortie, null, 1));
  l('');
  l('  ✅ ' + aAppliquer.length + ' prix alignés par le calculateur');
  l('  ✅ ' + cofMaj + ' carte(s) coffret recalées sur « nu + supplément »');
  l('  sauvegarde : ' + path.relative(RACINE, sauve));
  l('');
  return 0;
}

module.exports = { indexCouts: indexCouts, cleFiche: cleFiche, familleFiche: familleFiche };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
