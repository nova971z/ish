/* check-alias-nomenclature.js — UN ALIAS DÉSIGNE LE MÊME CONTENU DE BOÎTE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ CE QUE CETTE PORTE A ATTRAPÉ, ET CE QUE ÇA COÛTAIT.
   Mesuré le 10/08/2026 sur le relevé réel de l'user (112 pages, mode réel,
   fiche `makita-dbs180z`) : la fiche de la ponceuse à bande NUE déclarait
   `DBS180ZJ` dans ses `srcAltSkus`. Or la nomenclature de cette marque est
   formelle et le parseur la lit déjà correctement :
     · `DBS180Z`  → machine seule, PAS de coffret ;
     · `DBS180ZJ` → machine seule EN COFFRET MAKPAC.
   Deux produits différents, 59,30 € d'écart de coût mesurés sur la même page.
   Le traqueur a donc écrit le coût du coffret (256,56 €) sur la fiche nue et
   l'a affichée **361,49 € au lieu de 288,40 €** — 73,09 € trop cher, le temps
   que la tuile la moins chère arrive quinze pages plus loin.

   ⛔⛔ ET LE SENS INVERSE EST CELUI QUI FAIT MAL. Ce jour-là l'alias a rendu la
   fiche TROP CHÈRE, ce qui ne coûte qu'une vente. Mais le minimum de rafale
   retient le coût le PLUS BAS : le jour où c'est le coffret qui est en promo,
   la fiche du coffret hérite du prix de l'outil nu — et là, on vend à PERTE.
   Un alias faux est un défaut d'argent, pas une approximation de catalogue.

   ⚠️ CE QUE LA PORTE VÉRIFIE, MÉCANIQUEMENT : pour chaque fiche qui déclare des
   `srcAltSkus`, la grammaire DE SA MARQUE décode la référence de la fiche ET
   celle de l'alias ; si les deux énoncent un conditionnement et qu'il DIFFÈRE
   (nombre de batteries, capacité, coffret, accessoires), l'alias est refusé.

   ⚠️ CE QU'ELLE NE PEUT PAS VOIR, et c'est dit : une marque sans grammaire
   déclarée. Le marquage géographique `-XJ` de l'autre marque est un choix de
   l'user (« le XJ peut changer, c'est la région ; on ne le regarde jamais ») —
   il ne dit rien du contenu de la boîte, donc rien à comparer. Le jour où sa
   nomenclature s'écrit, elle s'ajoute dans GRAMMAIRES et la porte voit plus.
   Une porte qui déclare son angle mort vaut mieux qu'une porte qui rassure.

   ⛔ CHAQUE MARQUE A SA TABLE. La grammaire se choisit SUR la marque de la
   fiche, jamais « celle qu'on a sous la main » — appliquer la nomenclature
   d'une marque à une autre fabrique de faux jumeaux (9 en un seul passage,
   mesuré le 10/08/2026 sur `audit/prix-multi-ecritures.js`).
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');
var nomen = require(path.join(RACINE, 'api/_lib/nomenclature.js'));

/* La table est indexée PAR MARQUE : c'est la garde de séparation elle-même. */
var GRAMMAIRES = { MAKITA: nomen.lireSuffixeMakita };

/* Le conditionnement lu, réduit à ce qui décide d'un prix d'achat. */
function conditionnement(lireSuffixeDeLaMarque, sku) {
  var l = lireSuffixeDeLaMarque(String(sku || '').toUpperCase().trim());
  var c = l && l.config;
  if (!c) return null;                       // muet : on ne compare pas du vide
  return {
    batteries: typeof c.nbBatteries === 'number' ? c.nbBatteries : null,
    ah: c.ah || null,
    coffret: c.coffret || null,
    accessoires: !!c.accessoires
  };
}

function memeContenu(a, b) {
  return a.batteries === b.batteries
    && (a.ah || 0) === (b.ah || 0)
    && String(a.coffret) === String(b.coffret)
    && a.accessoires === b.accessoires;
}

function dire(c) {
  return (c.batteries === 0 ? 'machine seule' : c.batteries + ' batterie(s)'
    + (c.ah ? ' de ' + String(c.ah).replace('.', ',') + ' Ah' : ''))
    + (c.coffret ? ' + coffret ' + c.coffret : ' sans coffret')
    + (c.accessoires ? ' + accessoires' : '');
}

module.exports = function checkAliasNomenclature() {
  var errors = [];
  var fichier = path.join(RACINE, 'products.json');
  if (!fs.existsSync(fichier)) {
    errors.push('[check-alias-nomenclature] ⛔ PRÉALABLE : products.json absent — '
      + 'une porte qui ne lit rien ne vérifie rien.');
    return errors;
  }
  var fiches;
  try { fiches = JSON.parse(fs.readFileSync(fichier, 'utf8')); }
  catch (e) {
    errors.push('[check-alias-nomenclature] ⛔ products.json illisible : ' + e.message);
    return errors;
  }

  var aliasLus = 0, fichesAvecAlias = 0;
  fiches.forEach(function (p) {
    var alias = Array.isArray(p && p.srcAltSkus) ? p.srcAltSkus : [];
    if (!alias.length || !p.sku) return;
    fichesAvecAlias += 1;
    /* ⛔ LA MARQUE DE LA FICHE CHOISIT LA GRAMMAIRE — pas l'inverse. */
    var marque = String(p.brand || '').toUpperCase().replace(/[\s-]/g, '');
    var lire = GRAMMAIRES[marque];
    if (!lire) return;                       // marque sans grammaire : angle mort DIT
    var cFiche = conditionnement(lire, p.sku);
    if (!cFiche) return;
    alias.forEach(function (a) {
      aliasLus += 1;
      var cAlias = conditionnement(lire, a);
      if (!cAlias || memeContenu(cFiche, cAlias)) return;
      errors.push('[check-alias-nomenclature] ⛔⛔ ' + p.id + ' (' + p.sku + ') déclare '
        + 'l\'alias `' + a + '`, mais la nomenclature ' + marque + ' dit DEUX CONTENUS '
        + 'DIFFÉRENTS : la fiche = ' + dire(cFiche) + ' ; l\'alias = ' + dire(cAlias)
        + '. Un alias fait hériter le COÛT D\'ACHAT de l\'autre écriture — sur un '
        + 'contenu différent, c\'est un prix faux, et dans le sens du coffret le moins '
        + 'cher c\'est une VENTE À PERTE. Retirer l\'alias, ou créer sa propre fiche.');
    });
  });

  /* ⚠️ PRÉALABLE — sans alias lu, cette porte serait verte à vide. */
  if (!fichesAvecAlias) {
    errors.push('[check-alias-nomenclature] ⛔ PRÉALABLE : aucune fiche ne déclare '
      + 'de `srcAltSkus`. La porte n\'a donc rien vérifié — si les alias ont été '
      + 'retirés volontairement, retirer aussi cette porte ; sinon, l\'index est cassé.');
  }
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-alias-nomenclature : tout alias désigne le même contenu de boîte que sa fiche');
}
