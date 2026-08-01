// scripts/check-price-watch.js — Règle « min des sources » du traqueur (25/07).
// Quand le fournisseur vend une déclinaison MOINS cher que la réf principale
// (ex. DBS180ZJ coffret < DBS180Z nu), on achète la moins chère → prix de
// référence = min. Vérifie la fonction pure pickCheapestSource, son
// branchement dans handlePriceWatch, et que chaque srcAltSkus du catalogue ne
// pointe PAS vers un SKU encore présent au catalogue (sinon doublon de fiche).
'use strict';
var fs = require('fs');
var path = require('path');
var pp = require('../api/_lib/price-parse');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-price-watch] ' + m); }

  var f = pp.pickCheapestSource;
  ok(typeof f === 'function', 'pickCheapestSource exportée');
  if (!f) return errors;

  var page = { 'DBS180Z': 220.00, 'DBS180ZJ': 219.04 };
  ok(f(220.00, ['DBS180ZJ'], page) === 219.04, 'alt moins chère → min pris (219,04)');
  ok(f(210.00, ['DBS180ZJ'], page) === 210.00, 'propre moins cher → conservé');
  ok(f(220.00, ['ABSENTE'], page) === 220.00, 'alt absente de la page → ignorée');
  ok(f(220.00, undefined, page) === 220.00, 'sans srcAltSkus → prix propre');
  ok(f(220.00, ['dbs180zj'], page) === 219.04, 'casse du SKU insensible');
  ok(f(220.00, ['DBS180ZJ'], { DBS180ZJ: 0 }) === 220.00, 'alt à 0 → ignorée (pas de prix nul)');

  /* ── PROMOS : le traqueur prend le prix SOLDÉ, jamais le « Prix de base » ──
     Décision produit confirmée par l'user le 31/07/2026 : si cotébrico solde,
     il achète soldé, donc il vend soldé — le relevé tourne 2×/jour et remonte
     le prix dès la fin de la promo.
     Ce contrôle existe parce que l'en-tête du parseur affirmait exactement
     l'INVERSE jusqu'à cette date (« HORS PROMO, on prend le Prix de base »).
     Un commentaire ne protège rien ; une porte, si.
     ⛔ Références volontairement synthétiques : un harnais ne nomme jamais une
     donnée du catalogue. */
  function bloc(avantApres) {
    var courant = '<span class="price">Prix 149,90 €</span>';
    var base    = '<span class="old">Prix de base 199,00 €</span>';
    return '<div>Outil de controle - MAKITA ZZTEST1</div>'
      + (avantApres ? courant + base : base + courant)
      + '<button>Ajouter au panier</button>';
  }
  var pA = pp.parseCotebrico(bloc(true), 'MAKITA')[0];
  var pB = pp.parseCotebrico(bloc(false), 'MAKITA')[0];
  ok(pA && pA.price === 149.90, 'promo : le prix SOLDÉ est retenu (149,90), pas le Prix de base');
  ok(pB && pB.price === 149.90,
    'promo : ordre inversé (Prix de base AVANT le prix courant) → toujours le soldé. '
    + 'Le parseur ne doit pas dépendre de l\'ordre du gabarit cotébrico.');
  ok(pA && pA.promo === true, 'promo : le drapeau `promo` est levé quand un Prix de base est présent');
  var pSans = pp.parseCotebrico(
    '<div>Outil de controle - MAKITA ZZTEST2</div><span>Prix 294,74 €</span>'
    + '<button>Ajouter au panier</button>', 'MAKITA')[0];
  ok(pSans && pSans.promo === false, 'sans Prix de base → `promo` faux');
  ok(pSans && pSans.price === 294.74, 'sans promo : le prix affiché est retenu tel quel');

  // L'ancien prix ne doit PAS être capturé : un tarif fournisseur barré n'est
  // pas un prix de référence opposable (registre J4, décision D-004). S'il
  // apparaissait dans la sortie, il finirait un jour affiché barré sur le site.
  ok(pA && !('oldPrice' in pA) && !('basePrice' in pA) && !('priceBase' in pA),
    '⛔ le parseur expose l\'ancien prix fournisseur. Un tarif barré du fournisseur '
    + 'n\'est PAS un prix de référence : l\'afficher serait une pratique commerciale '
    + 'trompeuse (J4). Ne pas le capturer est la seule garantie qu\'il ne fuite pas.');

  /* L'en-tête du fichier doit décrire ce que le code fait — il a annoncé
     l'inverse jusqu'au 31/07/2026.
     ⚠️ 1ʳᵉ VERSION FAUSSE : elle cherchait l'ABSENCE de « HORS PROMO ». Elle a
     viré au rouge sur l'en-tête CORRIGÉ, qui cite la formulation fautive pour
     expliquer qu'elle l'était. Un contrôle par absence de mot ne distingue pas
     « le fichier affirme X » de « le fichier explique que X était faux ».
     On vérifie donc une AFFIRMATION, pas un silence. */
  var parseSrc = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'price-parse.js'), 'utf8');
  var entete = parseSrc.slice(0, parseSrc.indexOf('function stripHtml'));
  ok(/PROMO\s+COMPRISE/i.test(entete),
    'l\'en-tête de price-parse.js n\'affirme pas que le prix retenu est « PROMO '
    + 'COMPRISE ». Il a annoncé le contraire pendant des jours : sur du calcul de '
    + 'prix, un commentaire se croit sans se vérifier.');

  // Branchement réel dans handlePriceWatch.
  var adminSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  ok(/pickCheapestSource\s*\(\s*item\.price\s*,\s*p\.srcAltSkus/.test(adminSrc),
    'handlePriceWatch applique pickCheapestSource(item.price, p.srcAltSkus, …)');

  // Cohérence catalogue : un srcAltSkus ne doit jamais référencer un SKU
  // encore AU catalogue (la déclinaison doit être fusionnée, pas dupliquée).
  var products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'products.json'), 'utf8'));
  var skus = {}; products.forEach(function (p) { skus[String(p.sku).toUpperCase()] = 1; });
  products.forEach(function (p) {
    (p.srcAltSkus || []).forEach(function (a) {
      ok(!skus[String(a).toUpperCase()],
        p.sku + ' : srcAltSkus "' + a + '" existe ENCORE au catalogue (fusionner la fiche)');
    });
  });

  /* ═══ MULTI-TRAQUEURS + RUPTURES (01/08/2026) ═══════════════════════════
     Demandes de l'user, le jour où dix produits EN RUPTURE chez le
     fournisseur allaient faire MONTER les prix du site :
       · un prix relevé là où l'on ne peut PAS acheter ne sert JAMAIS de coût ;
       · avec plusieurs traqueurs, le coût est TOUJOURS le moins cher des
         sources fraîches ET en stock ;
       · s'il ne reste AUCUNE source achetable, le prix est GELÉ — pas
         recalculé, pas estimé en douce. */
  var choisir = pp.choisirCoutSource;
  ok(typeof choisir === 'function', 'choisirCoutSource exportée');
  var NOW = 1700000000000, J = 24 * 3600 * 1000;
  if (choisir) {
    var deux = { cotebrico: { ttc: 200, at: NOW - J }, nouveau: { ttc: 180, at: NOW - J } };
    var c1 = choisir(deux, NOW);
    ok(c1 && c1.ttc === 180 && c1.source === 'nouveau',
      'deux traqueurs → le MOINS CHER gagne, quel que soit son nom (' + JSON.stringify(c1) + ')');
    var c2 = choisir({ cotebrico: { ttc: 150, at: NOW - J, enStock: false }, nouveau: { ttc: 180, at: NOW - J } }, NOW);
    ok(c2 && c2.ttc === 180,
      '⛔ une source EN RUPTURE ne compte pas, même moins chère : on ne peut pas y acheter (' + JSON.stringify(c2) + ')');
    var c3 = choisir({ cotebrico: { ttc: 150, at: NOW - 20 * J }, nouveau: { ttc: 180, at: NOW - J } }, NOW);
    ok(c3 && c3.ttc === 180,
      'une source PÉRIMÉE (> 14 j) ne compte pas : le produit a quitté sa page (' + JSON.stringify(c3) + ')');
    ok(choisir({ cotebrico: { ttc: 150, at: NOW - J, enStock: false } }, NOW) === null,
      'AUCUNE source achetable → null : le produit doit être GELÉ, jamais recalculé');
    ok(choisir(null, NOW) === null && choisir({}, NOW) === null, 'carte absente ou vide → null, sans planter');
  }

  /* La grille fournisseur : le badge de stock d'une carte vit APRÈS le bouton
     « Ajouter au panier », donc EN TÊTE DU BLOC SUIVANT (mesuré sur la capture
     de l'user du 01/08/2026 — la page est injoignable depuis le dépôt). */
  var page = 'MAKITA AAA111 Prix 100,00 € Ajouter au panier En stock ♥ '
    + 'MAKITA BBB222 Prix 200,00 € Ajouter au panier Rupture de stock ♥ '
    + 'MAKITA CCC333 Prix 300,00 € Ajouter au panier En stock';
  var lus = pp.parseCotebrico(page, 'MAKITA');
  var parSku = {}; lus.forEach(function (x) { parSku[x.sku] = x; });
  ok(lus.length === 3, 'les trois cartes sont lues, rupture comprise (' + lus.length + ')');
  ok(parSku.AAA111 && parSku.AAA111.enStock === true, 'carte en stock → enStock=true');
  ok(parSku.BBB222 && parSku.BBB222.enStock === false,
    '⛔ carte EN RUPTURE détectée par la tête du bloc SUIVANT — c\'est elle qui allait faire monter les prix');
  ok(parSku.CCC333 && parSku.CCC333.enStock === true,
    'la rupture de la carte précédente ne CONTAMINE pas la suivante (défaut du 1er jet, corrigé)');

  /* Le chemin de LECTURE réel (celui du recalcul), via les internes d'admin —
     jamais une copie de la logique (leçon O6). */
  var adm = require('../api/admin.js');
  var pw = adm._internals && adm._internals.pwSourceCost;
  ok(typeof pw === 'function', 'pwSourceCost exposée aux portes via _internals');
  if (pw) {
    var gel = pw({}, { priceSources: { cotebrico: { ttc: 200, at: Date.now(), enStock: false } } }, {}, null);
    ok(gel && gel.origin === 'rupture' && gel.srcTTC === null,
      '⛔ relevés présents mais AUCUN achetable → origin \'rupture\', prix GELÉ (' + JSON.stringify(gel) + ')');
    var deux2 = pw({}, { priceSources: { cotebrico: { ttc: 200, at: Date.now() }, nouveau: { ttc: 180, at: Date.now() } } }, {}, null);
    ok(deux2 && deux2.srcTTC === 180 && deux2.origin === 'traqueur',
      'le recalcul lit le MIN multi-sources (' + JSON.stringify(deux2) + ')');
    var her = pw({}, { priceSource: 'cotebrico', priceSrcTTC: 150 }, {}, null);
    ok(her && her.srcTTC === 150 && her.origin === 'traqueur',
      'ancien format (sans carte) toujours lu — aucun override existant ne casse');
  }

  /* ═══ FORMAT CLICKOUTIL (01/08/2026) ═════════════════════════════════════
     Mesuré sur la page réelle envoyée par le raccourci de l'user (554 titres,
     décompressés de son document Pages) : réf AVANT la marque, prix
     « X,XX € TTC » suivi du HT, prix barré APRÈS le TTC en promo, et 275
     PACKS montés par le site dont la réf adjacente est celle d'un COMPOSANT.
     ⛔ Gabarits synthétiques ici — un harnais ne nomme jamais une donnée
     réelle — mais chaque forme reproduit une carte mesurée. */
  var pc = pp.parseClickoutil;
  ok(typeof pc === 'function', 'parseClickoutil exportée');
  if (pc) {
    function carte(titre, prix, barre) {
      return 'Ajouter au panier Afficher plus ' + titre + ' MAKITA MAKITA '
        + prix + ' € TTC ' + (barre ? barre + ' € ' : '') + '833,25 € HT '
        + 'Description qui répète ' + titre + '. Livraison 24 h ';
    }
    var page = carte('Visseuse ZZT123-QW', '999,90')
      + carte('Scie pendulaire ZZT456-XJ lame 250 mm', '449,90', '599,00')
      + carte('Meuleuse ZZT789 + 2 batteries 5 Ah + 1 chargeur ZZTC99-QW', '333,00')
      + carte('Raboteuse de chantier 1800 W 317 mm', '111,00')
      + 'Ajouter au panier Afficher plus + Option disponible ';
    var rc = pc(page, 'MAKITA');
    var cSku = {}; rc.items.forEach(function (x) { cSku[x.sku] = x; });
    ok(rc.items.length === 2, 'deux titres simples lus, pack et sans-réf écartés (' + rc.items.length + ')');
    ok(cSku['ZZT123-QW'] && cSku['ZZT123-QW'].price === 999.90,
      'réf AVANT la marque lue, prix TTC pris — jamais le HT qui suit');
    ok(cSku['ZZT123-QW'] && cSku['ZZT123-QW'].promo === false,
      '⛔ RÉGRESSION 147/147 : le prix HT qui suit TOUJOURS le TTC n\'est PAS un prix barré');
    ok(cSku['ZZT456-XJ'] && cSku['ZZT456-XJ'].price === 449.90 && cSku['ZZT456-XJ'].promo === true,
      'promo : le prix courant est AVANT « € TTC », le barré après est détecté sans être pris '
      + '(réf au MILIEU du titre — 126 cas mesurés sur 554)');
    ok(cSku['ZZT456-XJ'] && !('oldPrice' in cSku['ZZT456-XJ']) && !('basePrice' in cSku['ZZT456-XJ']),
      '⛔ le prix barré fournisseur n\'est jamais capturé (J4, D-004)');
    ok(!cSku['ZZTC99-QW'] && !cSku['ZZT789'] && rc.packs.length === 1,
      '⛔ ARGENT : un PACK monté par le site est écarté ET listé — son prix ne s\'écrit '
      + 'ni sur la réf du composant ni sur celle de l\'outil nu (' + JSON.stringify(rc.packs) + ')');
    ok(rc.sansRef.length === 1 && /Raboteuse/.test(rc.sansRef[0]),
      'un titre SANS réf sûre est écarté et listé, jamais deviné (« 1800 » n\'est pas une réf)');
    ok(rc.items.every(function (x) { return x.enStock === null; }),
      'aucun badge de stock par carte sur cette grille (mesuré) → enStock reste inconnu, jamais inventé');
  }

  // L'aiguillage : chaque gabarit part vers son parseur, le vide est dit.
  var pa = pp.parseAuto;
  ok(typeof pa === 'function', 'parseAuto exportée');
  if (pa && pc) {
    var pageCote = 'Outil - MAKITA ZZT111 Prix 100,00 € Ajouter au panier En stock';
    var a1 = pa(pageCote, 'MAKITA');
    ok(a1.format === 'cotebrico' && a1.items.length === 1,
      'gabarit cotébrico → parseur cotébrico (' + a1.format + ', ' + a1.items.length + ')');
    var a2 = pa('Ajouter au panier Afficher plus Visseuse ZZT123-QW MAKITA MAKITA 999,90 € TTC 833,25 € HT', 'MAKITA');
    ok(a2.format === 'clickoutil' && a2.items.length === 1,
      'gabarit clickoutil → parseur clickoutil (' + a2.format + ', ' + a2.items.length + ')');
    var a3 = pa('<html>Chargement…</html>', 'MAKITA');
    ok(a3.format === 'aucun' && a3.items.length === 0,
      'rien de reconnu → format « aucun », jamais un mensonge');
  }
  // Branchement réel : handlePriceWatch passe par l'aiguillage, plus jamais
  // par un parseur unique en dur.
  ok(/const\s+auto\s*=\s*priceParse\.parseAuto\(text,\s*brand\)/.test(adminSrc)
    && /const\s+parsed\s*=\s*auto\.items/.test(adminSrc),
    '⛔ handlePriceWatch doit lire la page via parseAuto — un parseur unique en dur '
    + 'rend muet tout site au gabarit différent (clickoutil, 01/08/2026)');

  /* ═══ DIAGNOSTIC `parsed: 0` (01/08/2026) ════════════════════════════════
     Premier essai du traqueur clickoutil : `parsed: 0` et un JSON muet — ni
     la source qui tournait, ni ce que la page contenait. Or le serveur TENAIT
     le HTML complet, seule occasion de lire un format inconnu (sites
     fournisseurs injoignables du dépôt, CONNECT 403 mesuré). Le diagnostic
     mesure chaque hypothèse du parseur et rend un verdict + extraits.
     ⛔ Pages SYNTHÉTIQUES : un harnais ne nomme jamais une donnée réelle. */
  var diag = pp.diagnostiquerPage;
  ok(typeof diag === 'function', 'diagnostiquerPage exportée');
  if (diag) {
    var d1 = diag('<html>Chargement…</html>', 'MAKITA');
    ok(d1.occurrencesMarque === 0 && /apparaît nulle part/.test(d1.verdict),
      'marque absente → verdict « nulle part » (page vide ou construite en JS)');
    /* ⚠️ Le motif réf du parseur est INSENSIBLE À LA CASSE : « MAKITA propose »
       compte comme une réf (appris en écrivant ce test — le diagnostic doit
       refléter le parseur, pas une version idéalisée). D'où le « : » après la
       marque, qui bloque le motif. */
    var d2 = diag('la marque MAKITA : réf. ZZZ111 à 129,00 €', 'MAKITA');
    ok(d2.occurrencesMarque === 1 && d2.refsMarque === 0 && /titres autrement/.test(d2.verdict),
      'marque présente sans « MARQUE RÉF » → verdict « titres autrement » (' + d2.verdict + ')');
    var d3 = diag('MAKITA ZZZ111 visseuse 299,00 € Ajouter au panier', 'MAKITA');
    ok(d3.refsMarque === 1 && d3.prixAvecMot === 0 && d3.prixVirgule === 1
      && /sans le mot « Prix »/.test(d3.verdict),
      'prix écrit sans le mot « Prix » → compté dans prixVirgule et dit tel quel');
    ok(Array.isArray(d3.extraits) && d3.extraits.length >= 1
      && d3.extraits[0].indexOf('MAKITA ZZZ111') !== -1,
      'les extraits montrent le texte BRUT autour de la marque — c\'est eux qui apprennent le format');
    ok(typeof d1.octetsRecus === 'number' && typeof d1.boutonsPanier === 'number',
      'les comptes sont des NOMBRES mesurés, pas des impressions');
  }

  // Branchement réel : le retour `parsed: 0` d'admin.js porte source + diagnostic.
  ok(/parsed:\s*0,\s*format:[\s\S]{0,220}diagnostic:\s*priceParse\.diagnostiquerPage\(/.test(adminSrc)
    && /source:\s*sourceSlug,\s*parsed:\s*0/.test(adminSrc),
    '⛔ le retour `parsed: 0` de handlePriceWatch doit renvoyer `source` ET `diagnostic` — '
    + 'sans eux, un format inconnu est indiagnosticable (clickoutil, 01/08/2026)');

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-price-watch OK');
}
