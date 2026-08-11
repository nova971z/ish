#!/usr/bin/env node
/* banc-valeur-bundle.js — CE QUE VAUT VRAIMENT UN LOT D'ACCESSOIRES,
   MESURÉ SANS MA TABLE DE COMPOSANTS.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CE BANC EXISTE, ET C'EST UNE HISTOIRE D'ARGENT.
   `banc-reconstitution.js` déduisait le coût des machines nues en RETIRANT du
   prix du pack le prix des pièces relevées. Sur les trois relevés du
   13/08/2026, il sortait ceci :
       « Dewalt DCD708P1T-QW … 1x5.0Ah » : pack 184,71 € → machine nue 23,13 €
   Une perceuse-visseuse sans charbon à **23 €** n'existe pas. Le calcul est
   juste ; c'est une de ses ENTRÉES qui est fausse.
   Cause trouvée, mesurée : le seul chargeur d'outil vendu seul dans les trois
   relevés est un DCB116 6 A à **97,73 €**. Les relevés ne contiennent AUCUN
   chargeur de base vendu seul. La soustraction retirait donc le prix du
   chargeur le plus cher du catalogue à des packs qui embarquent le plus simple.

   ⇒ D'OÙ CE SECOND BANC, ET C'EST UN ORACLE INDÉPENDANT (règle des oracles,
   `.claude/rules/argent.md`) : il n'utilise NI ma table de composants, NI
   `reconstitution.js`. Il lit une seule chose, dans les données de l'user :
   **le même appareil vendu NU et vendu EN PACK.** L'écart entre les deux EST
   la valeur du lot d'accessoires, au prix où le fournisseur le vend
   réellement. Aucune modélisation, aucune estimation : une soustraction entre
   deux prix relevés.

   ⛔ La référence nue se reconnaît par la NOMENCLATURE DE PRODUCTION
   (`referenceEstNue`, séparée par marque), jamais par une expression écrite
   ici : un premier jet à coups d'expression maison appariait des couples
   absurdes (un pack MOINS cher que la machine nue de 250 €, donc un mauvais
   appariement).

   Usage :
     node scripts/banc-valeur-bundle.js <dossier-de-releves> [autre ...]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');
var B = require(path.join(__dirname, 'banc-composants.js'));
var P = require(path.join(__dirname, '..', 'api/_lib/price-parse.js'));

/* ── CE QUE LE TITRE ANNONCE COMME ACCESSOIRES ─────────────────────────────
   On ne cherche pas à tout comprendre : on veut savoir combien de batteries,
   de quelle capacité, et s'il y a un chargeur. Le reste (coffret) suit. */
function accessoiresDuTitre(t) {
  var a = { nBat: 0, ah: null, chargeur: false, coffret: false };
  var m = String(t).match(/(\d{1,2})\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*Ah/);
  if (m) { a.nBat = parseInt(m[1], 10); a.ah = parseFloat(m[2].replace(',', '.')); }
  else {
    var m2 = String(t).match(/(\d+(?:[.,]\d+)?)\s*Ah/);
    if (m2) { a.nBat = 1; a.ah = parseFloat(m2[1].replace(',', '.')); }
  }
  if (/\bchargeurs?\b|\bchargers?\b|\bladeger[äa]t/i.test(t)) a.chargeur = true;
  if (/\bmakpac\b|\btstak\b|\bcoffret\b|\bmallette\b|\bcase\b/i.test(t)) a.coffret = true;
  return a;
}

/* ── LE CONDITIONNEMENT SE LIT DANS LA RÉFÉRENCE, PAS DANS LE TITRE ────────
   ⛔⛔ C'EST LA RÉPARATION DU PREMIER JET. J'appariais sur `racineRef`, qui
   rend « DCF787N » tel quel — suffixe compris. La machine nue et son pack
   n'avaient donc JAMAIS la même clef, et le banc a rendu **zéro paire** en se
   croyant complet. Or la nomenclature de production sait déjà tout faire :
   `lireSuffixeDewalt('DCD708P1T-QW')` rend « 1 batterie 5 Ah + coffret TSTAK »,
   `lireSuffixeMakita('DHP482RFE')` rend « racine DHP482, 2 batteries 3 Ah ».
   C'est plus sûr qu'un titre : le suffixe est normalisé par le fabricant.

   ⛔ SÉPARATION DES MARQUES : chaque marque a SA lecture, jamais partagée.
   Une marque dont la nomenclature ne rend pas de conditionnement est ÉCARTÉE
   et comptée — pas devinée. */
function lireConditionnement(sku, marque) {
  var n = P.nomenclature;
  var s = String(sku || '').toUpperCase().replace(/-(?:XJ|QW|XE|GB|FR)$/i, '');
  if (!s) return null;
  var marqueUp = String(marque || '').toUpperCase();

  if (marqueUp === 'DEWALT') {
    var d = n.lireSuffixeDewalt(s);
    if (!d) return null;
    var racineD = d.suffixe ? s.slice(0, s.length - d.suffixe.length) : s;
    if (!racineD) return null;
    return { racine: racineD, nBat: d.nbBatteries || 0, ah: d.ah,
      coffret: !!d.coffret, nu: !!d.nu };
  }
  if (marqueUp === 'MAKITA') {
    var mk = n.lireSuffixeMakita(s);
    if (!mk || !mk.racine || !mk.config) return null;
    return { racine: mk.racine, nBat: mk.config.nbBatteries || 0, ah: mk.config.ah || null,
      coffret: !!mk.config.coffret, nu: (mk.config.nbBatteries || 0) === 0 };
  }
  /* ⚠️ MILWAUKEE : `lireReferenceMilwaukee` lit la référence, pas le
     conditionnement livré. Tant que la nomenclature ne le rend pas, cette
     marque est HORS de ce banc — et c'est compté, pas passé sous silence. */
  return null;
}

function apparier(tuiles) {
  var marques = B.marquesConnues();
  var nues = {}, packs = {};
  var vus = { machine: 0, avecSku: 0, nue: 0, pack: 0, sansNomenclature: 0, sansMarque: 0 };

  tuiles.forEach(function (c) {
    if (String(c.fam || '').toLowerCase() !== 'machine') return;
    vus.machine++;
    /* ⛔ On ne travaille QUE sur une référence lue par la nomenclature de
       production. Une référence devinée apparierait deux appareils différents,
       et l'écart mesuré ne voudrait plus rien dire. */
    var sku = c.sku || P.refUniqueDuTitre(c.texte);
    if (!sku) return;
    vus.avecSku++;
    var mq = B.marqueDuTexte(c.texte, marques);
    if (!mq) { vus.sansMarque++; return; }
    var cond;
    try { cond = lireConditionnement(sku, mq); } catch (e) { cond = null; }
    if (!cond) { vus.sansNomenclature++; return; }

    var k = mq + '|' + cond.racine;
    if (cond.nu && !cond.nBat) {
      vus.nue++;
      if (!nues[k] || c.prix < nues[k].prix) nues[k] = { prix: c.prix, texte: c.texte, sku: sku };
    } else if (cond.nBat > 0) {
      vus.pack++;
      if (!packs[k]) packs[k] = [];
      /* le chargeur ne se lit pas dans le suffixe : on le prend au titre, qui
         engage le vendeur (M-48). */
      var acc = accessoiresDuTitre(c.texte);
      packs[k].push({ prix: c.prix, texte: c.texte, sku: sku,
        acc: { nBat: cond.nBat, ah: cond.ah, coffret: cond.coffret, chargeur: acc.chargeur } });
    }
  });

  var paires = [];
  Object.keys(nues).forEach(function (k) {
    if (!packs[k]) return;
    /* le pack le MOINS cher : c'est celui qu'on achèterait */
    var p = packs[k].reduce(function (a, b) { return b.prix < a.prix ? b : a; });
    var ecart = Math.round((p.prix - nues[k].prix) * 100) / 100;
    /* ⛔ UN ÉCART NÉGATIF N'EST PAS UNE AFFAIRE : c'est un appariement raté ou
       un prix aberrant. Un pack complet moins cher que la machine seule veut
       dire qu'on ne compare pas les mêmes appareils. On l'écarte ET on le dit. */
    paires.push({ clef: k, ecart: ecart, prixNue: nues[k].prix, prixPack: p.prix,
      acc: p.acc, titreNue: nues[k].texte, titrePack: p.texte, valide: ecart > 0 });
  });
  return { paires: paires, vus: vus };
}

module.exports = { apparier: apparier, accessoiresDuTitre: accessoiresDuTitre,
  lireConditionnement: lireConditionnement };

if (require.main === module) {
  var racines = process.argv.slice(2);
  if (!racines.length) {
    console.error('usage: node scripts/banc-valeur-bundle.js <dossier-de-releves> [...]');
    process.exit(2);
  }
  var toutes = [];
  racines.forEach(function (r) { toutes = toutes.concat(B.tuilesDe(r)); });
  if (!toutes.length) { console.error('⛔ PRÉALABLE : aucune tuile lue.'); process.exit(2); }
  var A = apparier(toutes);
  var bonnes = A.paires.filter(function (p) { return p.valide; });
  /* ⛔ PRÉALABLE : sans paire, le banc n'a rien mesuré. */
  if (!bonnes.length) {
    console.error('⛔ PRÉALABLE : aucune paire nue/pack — rien n\'a été mesuré.');
    process.exit(2);
  }

  console.log(toutes.length + ' offres lues · ' + A.vus.machine + ' machines, '
    + A.vus.avecSku + ' avec reference lisible');
  console.log('  ' + A.vus.nue + ' cartes de machine NUE, ' + A.vus.pack + ' cartes de PACK · '
    + bonnes.length + ' paires exploitables (' + (A.paires.length - bonnes.length)
    + ' ecartees pour ecart negatif = appariement douteux)');
  console.log('  ecartees en amont : ' + A.vus.sansNomenclature
    + ' references que la nomenclature ne sait pas conditionner, '
    + A.vus.sansMarque + ' sans marque unique');
  console.log('');

  /* Le cas qui répond à la question de l'user : 1 batterie + 1 chargeur. */
  var simples = bonnes.filter(function (p) { return p.acc.nBat === 1 && p.acc.chargeur; });
  console.log('── COMBIEN COUTE « 1 BATTERIE + 1 CHARGEUR » QUAND ON L\'ACHETE DANS LE PACK ──');
  simples.sort(function (a, b) { return a.ecart - b.ecart; }).forEach(function (p) {
    console.log('  ' + String(p.ecart).padStart(8) + ' EUR  = pack ' + String(p.prixPack).padStart(8)
      + ' - nue ' + String(p.prixNue).padStart(8) + '  | ' + (p.acc.ah ? p.acc.ah + ' Ah' : '? Ah')
      + (p.acc.coffret ? ' + coffret' : '') + '  | ' + p.titrePack.slice(0, 56));
  });
  if (simples.length) {
    var ecarts = simples.map(function (p) { return p.ecart; }).sort(function (a, b) { return a - b; });
    var med = ecarts[Math.floor(ecarts.length / 2)];
    console.log('  → mediane sur ' + simples.length + ' paires : ' + med + ' EUR');
  }
  console.log('');
  console.log('── TOUTES LES PAIRES, PAR ECART CROISSANT (les 25 plus basses) ──');
  bonnes.sort(function (a, b) { return a.ecart - b.ecart; }).slice(0, 25).forEach(function (p) {
    console.log('  ' + String(p.ecart).padStart(8) + ' EUR  | ' + String(p.acc.nBat) + ' x '
      + (p.acc.ah || '?') + ' Ah' + (p.acc.chargeur ? ' + chargeur' : '')
      + (p.acc.coffret ? ' + coffret' : '') + '  | ' + p.titrePack.slice(0, 62));
  });
}
