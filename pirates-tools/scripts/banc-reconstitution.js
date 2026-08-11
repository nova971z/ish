#!/usr/bin/env node
/* banc-reconstitution.js — CE QUE LE CALCULATEUR CHANGE, SUR SES VRAIS RELEVÉS.
   ─────────────────────────────────────────────────────────────────────────
   ⛔ ORDRE DE L'USER, 13/08/2026 : « Si un pack avec deux visseuses et deux
   batteries coûte plus cher qu'en achetant les produits séparément, ce pack
   n'est pas valable. […] Le parseur doit être un calculateur intelligent, il
   doit chercher à créer les meilleurs prix : ça c'est son travail le plus
   important. Et ça vaut pour n'importe quel pack / kit / lot. »

   Ce banc REJOUE chaque offre des archives à travers :
     ① `banc-composants.js`      → le prix réel de chaque pièce détachée
     ② `api/_lib/reconstitution.js` → le rôle du produit, puis le coût
     ③ et il compare au prix du pack.
   Rien n'est estimé : une pièce sans prix relevé fait REFUSER le calcul, et le
   refus est compté et affiché.

   ⛔⛔ J'AI DÉJÀ ANNONCÉ UN CHIFFRE FAUX SUR CE SUJET (13/08/2026 : « 51
   références gagnantes, 9 078 € d'économie »). Il venait d'une division
   appliquée à des MACHINES. D'où la discipline de ce banc : il n'imprime aucun
   total sans imprimer AUSSI le détail ligne à ligne qui le compose, pour que
   trois lignes puissent être vérifiées à la main avant d'annoncer quoi que ce
   soit (M-50).

   Usage :
     node scripts/banc-reconstitution.js <dossier-de-releves> [autre ...]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');
var B = require(path.join(__dirname, 'banc-composants.js'));
var R = require(path.join(__dirname, '..', 'api/_lib/reconstitution.js'));

/* ── LA PLATEFORME D'UN PRODUIT : SA TENSION ───────────────────────────────
   ⛔ Une batterie 12 V ne remplace pas une batterie 18 V. Sans tension lisible
   dans le libellé, on ne sait pas quelle pièce chercher — donc on ne conclut
   pas. Deviner « 18 V parce que c'est le plus fréquent » fabriquerait un coût. */
function tensionDuProduit(texte) {
  var v = B.valeursVolt(texte);
  return v.length === 1 ? v[0] : null;
}

function analyser(tuiles, table) {
  var lignes = [], refus = {};
  function noteRefus(k) { refus[k] = (refus[k] || 0) + 1; }

  tuiles.forEach(function (c) {
    var contenu = R.contenuDuPack(c.texte, c.descr);
    if (!contenu) return;                       /* pas un pack : rien à faire */
    var role = R.roleDuProduit({ type: c.typ, famille: c.fam }, contenu);
    if (role === 'autre' || role === 'chargeur') return;

    var mq = B.marqueDuTexte(c.texte, table.marques);
    if (!mq) return noteRefus('marque non determinee');
    var volt = tensionDuProduit(c.texte);
    if (!volt) return noteRefus('tension de plateforme non lisible');
    var prix = B.fonctionPrix(table, mq, volt);

    var res, comment;
    if (role === 'lot-de-batteries') {
      /* Le produit EST l'article compté : le coût unitaire se DIVISE. */
      var n = contenu.nbBatteries;
      if (!(n >= 2)) return noteRefus('lot annonce sans quantite exploitable');
      res = { complet: true, total: Math.round((c.prix / n) * 100) / 100,
        detail: [{ quoi: 'batterie', nb: n, unitaire: Math.round((c.prix / n) * 100) / 100 }] };
      comment = 'division du lot par ' + n;
      /* ⚠️ Ici on ne compare pas au « prix du pack » : on compare le coût
         unitaire obtenu au meilleur coût unitaire déjà connu dans la table. */
      var ah = contenu.batteries.length === 1 ? contenu.batteries[0].ah : null;
      var connu = ah ? prix({ quoi: 'batterie', ah: ah }) : null;
      lignes.push({ role: role, texte: c.texte, prixDuPack: c.prix, marque: mq, volt: volt,
        retenu: res.total, origine: 'unitaire du lot', economie: connu ? Math.round((connu - res.total) * 100) / 100 : null,
        detail: res.detail, comment: comment, source: c.source });
      return;
    }

    if (role === 'machine-avec-batteries') {
      res = R.coutMachineNue(c.prix, contenu, prix);
      comment = 'soustraction des accessoires';
    } else {                                    /* lot-de-batteries-avec-chargeur */
      res = R.coutReconstitue(contenu, prix);
      comment = 'somme des pieces nues';
    }
    if (!res.complet) return noteRefus('piece sans prix releve : ' + res.manquant);

    if (role === 'lot-de-batteries-avec-chargeur') {
      var m = R.meilleurCout(c.prix, res);
      lignes.push({ role: role, texte: c.texte, prixDuPack: c.prix, marque: mq, volt: volt,
        retenu: m.retenu, origine: m.origine, economie: m.economie,
        detail: res.detail, comment: comment, source: c.source });
      return;
    }
    /* Machine nue : le résultat n'est pas une économie sur le pack, c'est le
       COÛT DE LA MACHINE SEULE — une information neuve, pas une comparaison. */
    lignes.push({ role: role, texte: c.texte, prixDuPack: c.prix, marque: mq, volt: volt,
      retenu: res.total, origine: 'machine nue deduite', economie: null,
      detail: res.retire, comment: comment, source: c.source });
  });
  return { lignes: lignes, refus: refus };
}

module.exports = { analyser: analyser, tensionDuProduit: tensionDuProduit };

if (require.main === module) {
  var racines = process.argv.slice(2);
  if (!racines.length) {
    console.error('usage: node scripts/banc-reconstitution.js <dossier-de-releves> [...]');
    process.exit(2);
  }
  var toutes = [];
  racines.forEach(function (r) { toutes = toutes.concat(B.tuilesDe(r)); });
  if (!toutes.length) {
    console.error('⛔ PRÉALABLE : aucune tuile lue — le banc n\'a rien vérifié.');
    process.exit(2);
  }
  var table = B.construire(toutes);
  if (!table.marques.length) {
    console.error('⛔ PRÉALABLE : aucune marque lue dans les plans du traqueur.');
    process.exit(2);
  }
  var A = analyser(toutes, table);

  console.log(toutes.length + ' offres lues, '
    + Object.keys(table.batteries).length + ' batteries et '
    + Object.keys(table.chargeurs).length + ' chargeurs au tarif piece.');
  console.log('');
  var gagnantes = A.lignes.filter(function (l) { return l.economie > 0; });
  console.log('── CE QUE LA RECONSTITUTION FAIT GAGNER, LIGNE PAR LIGNE ──');
  if (!gagnantes.length) console.log('  (aucune ligne gagnante)');
  gagnantes.sort(function (a, b) { return b.economie - a.economie; }).forEach(function (l) {
    console.log('  ' + String(l.economie).padStart(9) + ' EUR  | pack ' + String(l.prixDuPack).padStart(8)
      + ' -> ' + String(l.retenu).padStart(8) + ' | ' + l.comment);
    console.log('        ' + l.texte.slice(0, 100));
    l.detail.forEach(function (d) {
      console.log('          . ' + String(d.nb) + ' x ' + d.quoi + ' a ' + d.unitaire + ' EUR'
        + (d.note ? ' (' + d.note + ')' : ''));
    });
  });
  var totalEco = Math.round(gagnantes.reduce(function (s, l) { return s + l.economie; }, 0) * 100) / 100;
  console.log('');
  console.log('TOTAL : ' + gagnantes.length + ' lignes gagnantes, ' + totalEco + ' EUR');
  console.log('');
  console.log('── MACHINES NUES DEDUITES (information neuve, pas une economie) ──');
  var nues = A.lignes.filter(function (l) { return l.origine === 'machine nue deduite'; });
  console.log('  ' + nues.length + ' machines dont le cout nu a pu etre deduit');
  nues.slice(0, 10).forEach(function (l) {
    console.log('    pack ' + String(l.prixDuPack).padStart(8) + ' -> nue ' + String(l.retenu).padStart(8)
      + ' | ' + l.texte.slice(0, 78));
  });
  console.log('');
  console.log('── CE QUE LE CALCULATEUR A REFUSE DE CHIFFRER (aucun refus silencieux) ──');
  Object.keys(A.refus).sort(function (a, b) { return A.refus[b] - A.refus[a]; })
    .slice(0, 15).forEach(function (k) { console.log('  ' + String(A.refus[k]).padStart(5) + '  ' + k); });
}
