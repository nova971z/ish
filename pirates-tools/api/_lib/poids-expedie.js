// api/_lib/poids-expedie.js — LE POIDS EXPÉDIÉ SE COMPOSE, IL NE SE DEVINE PAS.
//
// ⛔⛔ ORDRE DE L'USER, 14/08/2026, mot pour mot : « tu recherches le poids des
// produits nus ainsi que des batteries et des chargeurs, car une fois qu'on a
// ces informations, l'algorithme de calcul des prix automatique devrait se
// servir de la table pour calculer le poids correctement, même pour un pack —
// toujours en ajoutant un surplus de 1 kg car il y a toujours un ou deux
// accessoires ainsi que les manuels d'utilisation et le carton. »
//
// ⛔ POURQUOI C'EST DE L'ARGENT : le poids fait le port, le port fait le prix.
// Mesuré sur le calculateur du site, à coût identique de 500 € TTC :
// 2 kg → 661,00 € et 10 kg → 721,50 €. Un pack pesé « 2 kg par défaut » perd
// jusqu'à 60,50 € de marge PAR VENTE.
//
// LA FORMULE — UNE SEULE IMPLÉMENTATION, ICI :
//   poids expédié = poids NU de la machine (table, 3 sources)
//                 + nb batteries × masse de LA batterie (par gamme ET capacité)
//                 + masse du chargeur (dès qu'une batterie est livrée)
//                 + masse du coffret (si le suffixe en annonce un)
//                 + SURPLUS_EMBALLAGE_KG (accessoires, manuels, carton)
//
// ⛔ CHAQUE masse vient d'une TABLE à trois sources recoupées — jamais d'une
// supposition. Une masse absente ⇒ REFUS nommé, jamais un repli silencieux :
// c'est le refus qui remplit la liste de courses des recherches suivantes.
//
// ⛔ SÉPARATION DES MARQUES (M-28) : ce module lit la grammaire de suffixes
// d'UNE marque pour composer. La garde est revérifiée à l'entrée.
'use strict';

var path = require('path');
var nomen = require(path.join(__dirname, 'nomenclature.js'));

/* Le forfait d'emballage, dicté par l'user le 14/08/2026 : accessoires,
   manuels, carton. Il s'ajoute TOUJOURS — machine nue comme pack : tout part
   dans un carton avec sa notice. */
var SURPLUS_EMBALLAGE_KG = 1;

/* Le chargeur d'un kit n'est pas toujours identifiable depuis le suffixe.
   ⚠️ RÈGLE DU SENS SÛR (M-11) : on prend la masse de chargeur la plus HAUTE de
   la table — surestimer le port protège la marge, le sous-estimer la mange.
   L'écart entre chargeurs mesurés reste petit devant le forfait d'emballage. */
function masseChargeurMajorante(composants) {
  var max = 0;
  Object.keys(composants || {}).forEach(function (k) {
    if (k.indexOf('CHARGEUR|') === 0 && Number(composants[k].kg) > max) {
      max = Number(composants[k].kg);
    }
  });
  return max > 0 ? max : null;
}

/* Compose le poids expédié d'une référence DeWALT.
   `tables` = { nu:        { RACINE:   { kg, sources } },
                composants:{ 'BATTERIE|GAMME|5AH': { kg }, 'CHARGEUR|…', 'COFFRET|TSTAK' } }
   Rend { kg, detail } ou { refus } — jamais une estimation muette. */
function composerDewalt(sku, tables) {
  var s = String(sku || '').toUpperCase().replace(/-(XJ|QW|XE|GB|LX|QS|B1|QZ)$/, '');
  if (!s) return { refus: 'référence vide' };
  var lu = nomen.lireSuffixeDewalt(s);
  if (!lu) return { refus: 'suffixe illisible pour cette marque' };
  var racine = lu.suffixe ? s.slice(0, s.length - lu.suffixe.length) : s;

  var nu = tables && tables.nu && tables.nu[racine];
  if (!nu || !(Number(nu.kg) > 0)) {
    return { refus: 'poids NU inconnu pour ' + racine + ' — à chercher (3 sources)' };
  }
  var kg = Number(nu.kg);
  var detail = [nu.kg + ' kg nu'];
  var composants = (tables && tables.composants) || {};

  if (lu.nbBatteries > 0) {
    /* la gamme vient du SUFFIXE (lettre de code batterie), jamais devinée */
    var gammes = (lu.batteries || []).map(function (b) { return b.gamme; });
    for (var i = 0; i < (lu.batteries || []).length; i++) {
      var b = lu.batteries[i];
      var cle = 'BATTERIE|' + String(b.gamme || 'XR').toUpperCase() + '|'
        + String(b.ah).replace('.', '.') + 'AH';
      var m = composants[cle];
      if (!m || !(Number(m.kg) > 0)) {
        return { refus: 'masse de batterie inconnue : ' + cle + ' — à chercher (3 sources)' };
      }
      kg += (b.nb || 1) * Number(m.kg);
      detail.push((b.nb || 1) + ' × ' + m.kg + ' kg (' + cle + ')');
    }
    var chg = masseChargeurMajorante(composants);
    if (chg === null) {
      return { refus: 'aucune masse de chargeur en table — à chercher (3 sources)' };
    }
    kg += chg;
    detail.push(chg + ' kg de chargeur (masse majorante de la table, M-11)');
    void gammes;
  }
  if (lu.coffret) {
    var cleC = 'COFFRET|' + String(lu.coffret).toUpperCase();
    var mc = composants[cleC];
    if (!mc || !(Number(mc.kg) > 0)) {
      return { refus: 'masse de coffret inconnue : ' + cleC + ' — à chercher (3 sources)' };
    }
    kg += Number(mc.kg);
    detail.push(mc.kg + ' kg de coffret (' + cleC + ')');
  }
  kg += SURPLUS_EMBALLAGE_KG;
  detail.push(SURPLUS_EMBALLAGE_KG + ' kg d\'emballage (accessoires, manuels, carton — ordre user 14/08/2026)');
  return { kg: Math.round(kg * 100) / 100, detail: detail.join(' + '), racine: racine };
}

module.exports = { SURPLUS_EMBALLAGE_KG: SURPLUS_EMBALLAGE_KG,
  composerDewalt: composerDewalt, masseChargeurMajorante: masseChargeurMajorante };
