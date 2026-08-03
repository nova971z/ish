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

module.exports = async function () {
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
  ok(/pickCheapestSource\(item\.price,\s*\n?\s*\[p\.sku\]\.concat\(/.test(adminSrc),
    'handlePriceWatch applique pickCheapestSource avec le PROPRE sku dans les candidats — '
    + 'une fiche atteinte par un alias doit quand même voir le prix du sku principal');
  /* ═══ ALIAS → FICHE (01/08/2026, demande de l'user) ═══════════════════════
     clickoutil n'affiche que la déclinaison (DCN930N-XJ) là où la fiche dit
     DCN930N — le -XJ est un marquage géographique, a tranché l'user. Sans
     l'index des alias, ces relevés tombaient dans `unknown` pour toujours. */
  ok(/srcAltSkus\)\s*\?\s*p\.srcAltSkus\s*:\s*\[\]\)\.forEach\(\(a\)\s*=>\s*\{\s*\n\s*const k = String\(a \|\| ''\)\.trim\(\)\.toUpperCase\(\);\s*\n\s*if \(k && !bySku\[k\]\) bySku\[k\] = p;/.test(adminSrc),
    '⛔ les srcAltSkus doivent être indexés vers leur fiche SANS écraser un sku principal — '
    + 'sans cet index, un site qui n\'affiche que la déclinaison ne met jamais la fiche à jour');
  ok(/const fichesVues = new Set\(\)/.test(adminSrc) && /fichesVues\.has\(p\.id\)/.test(adminSrc),
    'une fiche vue par son sku ET par un alias sur la même page ne s\'écrit qu\'une fois');

  /* ═══ SUIVI PAR NOM (02/08/2026, règle de l'user) ═════════════════════════
     Un accessoire sans réf se suit par son NOM EXACT (`srcNom`). Gardes
     mesurées sur la vraie page : nom en doublon sur la page (« Lame …
     Ø184 mm » ×3) → jamais apparié ; srcNom revendiqué par 2 fiches →
     conflit → jamais apparié. */
  var adm = require('../api/admin.js');
  var apparier = adm._internals && adm._internals.pwApparierParNom;
  ok(typeof apparier === 'function', 'pwApparierParNom exposée aux portes');
  if (apparier) {
    var fiches = [{ sku: 'ZZLAME1', srcNom: 'Lame de test Ø999 mm' }, { sku: 'ZZAUTRE' }];
    var a1n = apparier([{ titre: 'Lame de test Ø999 mm', prix: 49.90 }], fiches);
    ok(a1n.items.length === 1 && a1n.items[0].sku === 'ZZLAME1' && a1n.items[0].price === 49.90,
      'un nom UNIQUE sur la page + une fiche srcNom → relevé normal pour cette fiche');
    var a2n = apparier([{ titre: 'Lame de test Ø999 mm', prix: 49.90 },
      { titre: 'Lame de test Ø999 mm', prix: 89.90 }], fiches);
    ok(a2n.items.length === 0 && a2n.restants.length === 2,
      '⛔ un nom vu DEUX fois sur la page n\'identifie rien — aucun prix écrit, les deux listés '
      + '(mesuré : trois « Lame … Ø184 mm » à des prix différents sur la vraie page)');
    var a3n = apparier([{ titre: 'Lame de test Ø999 mm', prix: 49.90 }],
      [{ sku: 'A1', srcNom: 'Lame de test Ø999 mm' }, { sku: 'A2', srcNom: 'Lame de test Ø999 mm' }]);
    ok(a3n.items.length === 0 && a3n.restants.length === 1,
      '⛔ un srcNom revendiqué par DEUX fiches est un conflit — jamais apparié');
    ok(apparier([{ titre: '  lame   de test ø999 MM ', prix: 10 }],
      [{ sku: 'ZZLAME1', srcNom: 'Lame de test Ø999 mm' }]).items.length === 1,
      'l\'appariement tolère casse et espaces — jamais deux identités pour un même nom');
  }
  ok(/const apparie = pwApparierParNom\(auto\.sansRef, products\)/.test(adminSrc)
    && /apparie\.items\.forEach\(\(it\) => parsed\.push\(it\)\)/.test(adminSrc),
    '⛔ handlePriceWatch doit apparier les sansRef par nom AVANT la boucle — '
    + 'sans ça, les accessoires sans réf ne seront jamais suivis');
  ok(/const appariePacks = pwApparierParNom\(auto\.packs, products\)/.test(adminSrc)
    && /appariePacks\.items\.forEach\(\(it\) => parsed\.push\(it\)\)/.test(adminSrc),
    '⛔ les PACKS s\'apparient aussi par NOM (décision user 02/08 : ils entrent au '
    + 'catalogue) — sans ce branchement, leurs fiches Combos ne seraient jamais suivies');

  /* ═══ NOMENCLATURE DeWALT (02/08/2026, règle de l'user, vérifiée par lui
     jusqu'au fournisseur officiel) ══════════════════════════════════════════
     Réf courte = machine NUE (N = nu, -XJ = géo) ; NT = nu + coffret TSTAK,
     un AUTRE contenu ; ambiguïté = aucun rapprochement. */
  var nomen = adm._internals && adm._internals.pwAliasNomenclature;
  ok(typeof nomen === 'function', 'pwAliasNomenclature exposée aux portes');
  if (nomen) {
    function idx(fiches, marque) {
      var by = {};
      fiches.forEach(function (p) { if (p.sku) by[String(p.sku).toUpperCase()] = p; });
      nomen(fiches, marque, by);
      return by;
    }
    var nue = { sku: 'ZZD805N-XJ', brand: 'DeWALT' };
    var tstak = { sku: 'ZZD805NT-XJ', brand: 'DeWALT' };
    var b1 = idx([nue, tstak], 'DEWALT');
    ok(b1.ZZD805 === nue && b1['ZZD805N'] === nue && b1['ZZD805-XJ'] === nue,
      'réf courte, forme N et forme -XJ → LA MACHINE NUE (ZZD805 ≡ ZZD805N ≡ ZZD805N-XJ)');
    ok(b1.ZZD805NT === tstak && b1.ZZD805 !== tstak,
      '⛔ un NT (nu + coffret TSTAK) ne capte JAMAIS la réf courte — autre contenu, autre coût');
    var b2 = idx([{ sku: 'ZZD9N', brand: 'DeWALT' }, { sku: 'ZZD9N-XJ', brand: 'DeWALT' }], 'DEWALT');
    ok(!b2.ZZD9,
      '⛔ AMBIGUÏTÉ (deux fiches nues pour la même base) → aucun alias : écrire le coût '
      + 'sur la mauvaise fiche coûte plus cher que ne rien écrire');
    var principale = { sku: 'ZZD7', brand: 'DeWALT' };
    var b3 = idx([principale, { sku: 'ZZD7N-XJ', brand: 'DeWALT' }], 'DEWALT');
    ok(b3.ZZD7 === principale,
      'un sku PRINCIPAL existant n\'est jamais écrasé par un alias de nomenclature');
    var b4 = idx([{ sku: 'ZZD805N-XJ', brand: 'Makita' }], 'MAKITA');
    ok(!b4.ZZD805,
      'la nomenclature ne s\'applique qu\'à DeWALT — celle de Makita (Z, ZJ) n\'a pas été tranchée');
  }
  ok(/pwAliasNomenclature\(products, brand, bySku\);/.test(adminSrc),
    '⛔ handlePriceWatch doit indexer la nomenclature — sans elle, les réfs courtes '
    + 'd\'idealo (39 mesurées) restent inconnues pour toujours');

  /* ═══ CONFIG ILLISIBLE = AUCUN PRIX ÉCRIT (02/08/2026) ═══════════════════
     Crainte de l'user au lendemain du quota Firestore épuisé : « les prix
     baissent quasiment à ceux des fournisseurs ? ». Deux verrous, tous deux
     vérifiés ici :
       · le repli ×1,15 n'arrive JAMAIS par une panne : defaults() porte
         autoPrice: true, et pwComputePrice ne rétrograde que sur
         autoPrice === false EXPLICITE ;
       · une config marquée _sourceIllisible interdit TOUTE écriture de prix
         (traqueur ET recalcul), et ne s'installe jamais dans le cache. */
  var pcSrc = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'pricing-config.js'), 'utf8');
  var pcfg = require('../api/_lib/pricing-config.js');
  if (pcfg && typeof pcfg.defaults === 'function') {
    ok(pcfg.defaults().autoPrice === true,
      '⛔ defaults() doit porter autoPrice: true — sans lui, une config illisible ferait '
      + 'retomber les prix au repli ×1,15, quasiment au coût fournisseur');
  } else {
    ok(/autoPrice:\s*true/.test(pcSrc),
      'defaults() porte autoPrice: true (lu à la source, defaults non exportée)');
  }
  ok(/degrade\._sourceIllisible = true;\s*\n\s*return degrade;/.test(pcSrc),
    '⛔ une config illisible est MARQUÉE et rendue SANS passer par le cache — '
    + 'sinon l\'état dégradé survivrait au retour de Firestore pendant tout le TTL');
  var gardes = adminSrc.match(/cfg\._sourceIllisible && !dryRun/g) || [];
  ok(gardes.length >= 2,
    '⛔ les DEUX écrivains de prix (traqueur, recalcul) refusent d\'écrire quand la config '
    + 'est illisible (' + gardes.length + '/2 gardes trouvées) — des prix aux réglages par '
    + 'défaut au lieu des siens sont une écriture non voulue');

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

    /* ═══ HORODATAGES EN MILLISECONDES (E-228, 01/08/2026 au soir) ══════════
       En production, les `at` partaient en SENTINEL serverTimestamp
       (Number → NaN : l'entrée du passage EN COURS invisible au min —
       mesuré : D25033K-QS, clickoutil 119,90 € perdu contre cotébrico
       126,72 €) et revenaient en objet Timestamp (Number → des secondes
       d'une autre ère : tout paraissait périmé au recalcul → gel fantôme). */
    var em = pp.enMillis;
    ok(typeof em === 'function', 'enMillis exportée');
    if (em) {
      ok(em(1700000000000) === 1700000000000, 'un nombre en ms passe tel quel');
      ok(em({ toMillis: function () { return 1700000000000; } }) === 1700000000000,
        'un objet Timestamp est lu par son .toMillis() — les cartes relues de Firestore redeviennent datables');
      ok(em({}) === 0 && em(undefined) === 0 && em(NaN) === 0,
        'un sentinel ou n\'importe quoi d\'autre vaut 0 : écarté, jamais deviné');
    }
    var d25 = choisir({ cotebrico: { ttc: 126.72, at: NOW - J },
      clickoutil: { ttc: 119.90, at: NOW - J } }, NOW);
    ok(d25 && d25.ttc === 119.90 && d25.source === 'clickoutil',
      '⛔ RÉGRESSION D25033K : les deux sources datées en ms → le MOINS CHER gagne '
      + 'vraiment (' + JSON.stringify(d25) + ')');
    var d25b = choisir({ cotebrico: { ttc: 126.72, at: NOW - J },
      clickoutil: { ttc: 119.90, at: {} } }, NOW);
    ok(d25b && d25b.ttc === 126.72,
      'une entrée dont le `at` n\'est pas datable est ÉCARTÉE — c\'est le bogue sentinel rendu visible');
    ok(choisir({ cotebrico: { ttc: 126.72, at: NOW - J } }, {}) === null,
      'un « maintenant » non numérique ne date rien → null, jamais un choix au hasard');
    var d25c = choisir({ cotebrico: { ttc: 126.72,
      at: { toMillis: function () { return NOW - J; } } } }, NOW);
    ok(d25c && d25c.ttc === 126.72,
      'une carte RELUE de Firestore (at = Timestamp) reste fraîche — fin du gel fantôme au recalcul');
  }
  // Branchement réel : l'arithmétique de fraîcheur reçoit des NOMBRES.
  var adminSrcMs = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  ok(/srcsMaj\[sourceSlug\] = \{ ttc: src, at: nowMs, enStock: true \}/.test(adminSrcMs)
    && /choisirCoutSource\(srcsMaj, nowMs\)/.test(adminSrcMs)
    && /choisirCoutSource\(srcsR, nowMs\)/.test(adminSrcMs),
    '⛔ handlePriceWatch doit dater et juger `priceSources` en MILLISECONDES (nowMs) — '
    + 'un sentinel rendait le passage en cours invisible au min (E-228, D25033K-QS)');
  ok(!/priceSources: \{ \[sourceSlug\]: \{ ttc: [^}]*, at: now,/.test(adminSrcMs),
    '⛔ un sentinel serverTimestamp n\'entre plus JAMAIS dans un `at` de priceSources '
    + '(Number(sentinel) = NaN : l\'entrée devient invisible au choix du moins cher)');

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

    /* ═══ HÉRITAGE DANS LE MIN (01/08/2026, soir) ══════════════════════════
       Mesuré au premier dryRun clickoutil : 12 hausses proposées, dont
       +136 % — la carte née du seul passage clickoutil ignorait le relevé
       cotébrico moins cher, resté au format d'avant (sans carte). */
    var fus = adm._internals.pwSourcesConnues;
    ok(typeof fus === 'function', 'pwSourcesConnues exposée aux portes');
    if (fus) {
      var T = Date.now();
      var f1 = fus({ priceSource: 'cotebrico', priceSrcTTC: 200, priceCheckedAt: T });
      ok(f1.cotebrico && f1.cotebrico.ttc === 200 && f1.cotebrico.at === T,
        'l\'héritage cotébrico (marqué) entre dans la carte fusionnée');
      ok(!fus({ priceSrcTTC: 200, priceCheckedAt: T }).cotebrico,
        '⛔ un coût SANS la marque `cotebrico` (ex. estimé) ne se ressème JAMAIS');
      ok(fus({ priceSource: 'cotebrico', priceSrcTTC: 200, priceCheckedAt: T,
        priceSources: { cotebrico: { ttc: 180, at: T } } }).cotebrico.ttc === 180,
        'une entrée de carte existante n\'est jamais écrasée par l\'héritage');
      var minHer = pw({}, {
        priceSources: { clickoutil: { ttc: 389, at: T } },
        priceSource: 'cotebrico', priceSrcTTC: 200, priceCheckedAt: T
      }, {}, null);
      ok(minHer && minHer.srcTTC === 200 && minHer.source === 'cotebrico',
        '⛔ LA HAUSSE FANTÔME : carte {clickoutil: 389} + héritage cotébrico 200 frais '
        + '→ le min est 200, jamais 389 (' + JSON.stringify(minHer) + ')');
      var minVieux = pw({}, {
        priceSources: { clickoutil: { ttc: 389, at: T } },
        priceSource: 'cotebrico', priceSrcTTC: 200, priceCheckedAt: T - 20 * 24 * 3600 * 1000
      }, {}, null);
      ok(minVieux && minVieux.srcTTC === 389,
        'un héritage PÉRIMÉ (> 14 j) ne pèse rien : le produit a quitté la page cotébrico');
    }
    // Branchement réel : le relevé fusionne l'héritage avant de choisir.
    var adminSrc2 = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
    ok(/const\s+srcsMaj\s*=\s*pwSourcesConnues\(oW\)/.test(adminSrc2)
      && /const\s+srcsR\s*=\s*pwSourcesConnues\(/.test(adminSrc2),
      '⛔ handlePriceWatch doit construire ses cartes via pwSourcesConnues — sans l\'héritage, '
      + 'le premier passage d\'un nouveau site propose des hausses fantômes (mesuré : 12, dont +136 %)');
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
    /* ⛔ RÉGRESSION DU 01/08/2026 AU SOIR, gravée dans la forme même de ce
       gabarit : AUCUN « Ajouter au panier » n'y figure. Le flux de
       production n'en contient pas (`boutonsPanier: 0` mesuré par le
       diagnostic) — le 1er jet découpait sur ce bouton et rendait 0. La
       carte est une SUITE DE LIGNES : titre · marque seule · « € TTC ». */
    function carte(titre, prix, barre) {
      return titre + ' MAKITA\nMAKITA\n\n'
        + prix + ' € TTC' + (barre ? ' ' + barre + ' €' : '') + '\n833,25 € HT\n'
        + 'Livraison 24 / 48 Heures\n+ Option disponible\n';
    }
    var page = 'RECHERCHER\nMakita\n'
      + carte('Visseuse ZZT123-QW', '999,90')
      + carte('Scie pendulaire ZZT456-XJ lame 250 mm', '449,90', '599,00')
      + carte('Meuleuse ZZT789 + 2 batteries 5 Ah + 1 chargeur ZZTC99-QW', '333,00')
      + carte('Raboteuse de chantier 1800 W 317 mm', '111,00')
      /* Variante où le HT partage la LIGNE du TTC — c'est le seul cas où la
         garde `(?!HT)` travaille encore en mode lignes ; sans ce gabarit,
         elle serait invérifiable (sabotage resté vert le 01/08). */
      + 'Ponceuse ZZT654-QS MAKITA\nMAKITA\n222,00 € TTC 185,00 € HT\nLivraison 24 h\n';
    var rc = pc(page, 'MAKITA');
    var cSku = {}; rc.items.forEach(function (x) { cSku[x.sku] = x; });
    ok(rc.items.length === 3, 'trois titres simples lus, pack et sans-réf écartés (' + rc.items.length + ')');
    ok(cSku['ZZT654-QS'] && cSku['ZZT654-QS'].price === 222.00 && cSku['ZZT654-QS'].promo === false,
      '⛔ un HT sur la MÊME ligne que le TTC n\'est ni un prix pris ni une promo (garde `(?!HT)`)');
    ok(cSku['ZZT123-QW'] && cSku['ZZT123-QW'].price === 999.90,
      'réf AVANT la marque lue, prix TTC pris — jamais le HT qui suit');
    ok(cSku['ZZT123-QW'] && cSku['ZZT123-QW'].promo === false,
      '⛔ RÉGRESSION 147/147 : le prix HT qui suit TOUJOURS le TTC n\'est PAS un prix barré');
    ok(cSku['ZZT456-XJ'] && cSku['ZZT456-XJ'].price === 449.90 && cSku['ZZT456-XJ'].promo === true,
      'promo : le prix courant est AVANT « € TTC », le barré après est détecté sans être pris '
      + '(réf au MILIEU du titre — 126 cas mesurés sur 554)');
    ok(cSku['ZZT456-XJ'] && !('oldPrice' in cSku['ZZT456-XJ']) && !('basePrice' in cSku['ZZT456-XJ']),
      '⛔ le prix barré fournisseur n\'est jamais capturé (J4, D-004)');
    ok(!cSku['ZZTC99-QW'] && !cSku['ZZT789'] && rc.packs.length === 1
      && /ZZT789/.test(rc.packs[0].titre) && rc.packs[0].prix === 333.00,
      '⛔ ARGENT : le prix d\'un PACK ne s\'écrit JAMAIS sur la réf d\'un composant ni de '
      + 'l\'outil nu — il sort AVEC titre et prix pour être suivi PAR NOM (décision user '
      + '02/08 : les packs entrent au catalogue) (' + JSON.stringify(rc.packs) + ')');
    ok(rc.sansRef.length === 1 && /Raboteuse/.test(rc.sansRef[0].titre)
      && rc.sansRef[0].prix === 111.00,
      'un titre SANS réf sûre est écarté et listé AVEC SON PRIX — c\'est lui qui permet '
      + 'le suivi par nom (« 1800 » n\'est pas une réf)');
    /* Le filtre d'UNITÉS : « 18V-54V » et « 12Ah-4Ah » ressemblent à des réfs
       et n'en sont pas — mesuré sur la vraie page, 5 réfs réelles récupérées. */
    var rcU = pc('Batterie XR 18V-54V 12Ah-4Ah Flexvolt ZZB548-XJ MAKITA\nMAKITA\n219,90 € TTC\n183,25 € HT\n', 'MAKITA');
    ok(rcU.items.length === 1 && rcU.items[0].sku === 'ZZB548-XJ',
      'les suites d\'unités (18V-54V, 12AH-4AH) ne sont pas des candidats réf — la vraie réf reste seule');
    ok(rc.items.every(function (x) { return x.enStock === null; }),
      'aucun badge de stock par carte sur cette grille (mesuré) → enStock reste inconnu, jamais inventé');
  }

  /* ═══ FORMAT IDEALO (02/08/2026) ═════════════════════════════════════════
     Comparateur : « MARQUE RÉF » seuls sur leur ligne, puis description,
     note, « N offres », « à partir deX,XX € » (PARFOIS COLLÉ). Mesuré sur le
     diagnostic de SON dryRun — le site bloque tout accès non-navigateur.
     Pièges gravés : prix parfois collé à « de » ; blocs hors sujet
     (« Produits favoris » : téléphones) avec « à partir de » orphelin ;
     une carte SANS prix ne doit jamais voler celui de la suivante. */
  var pi = pp.parseIdealo;
  ok(typeof pi === 'function', 'parseIdealo exportée');
  if (pi) {
    /* ⛔ CORPUS REPRODUISANT LES FORMATS MESURÉS SUR LA PAGE RÉELLE (03/08).
       Le premier jet ne lisait qu'UN de ces cinq gabarits : 13 produits lus
       sur 57 présents. Chaque bloc ci-dessous EXISTE sur la vraie page ;
       seules les références sont synthétiques (un harnais ne nomme jamais
       une donnée réelle). */
    var pageI = [
      'Tronçonneuses',
      // ① réf seule + « à partir de » COLLÉ
      'MAKITA ZZI805', 'Perceuse-visseuse sans fil, Couple max. 90 Nm',
      '5', '94 offres', 'à partir de118,86 €', 'Détails du produit',
      // ② prix à espace de milliers
      'MAKITA ZZI922N-XJ', 'Visseuse à choc sans fil',
      '35', '14 offres', 'à partir de 1 132,43 €', 'Détails du produit',
      // ③ UNE SEULE OFFRE : prix nu, sans « à partir de » — raté par le 1er jet
      'MAKITA ZZI777P2', 'Scie circulaire portative, 1 batterie, 3,5 kg',
      '1 offre', '685,95 €', 'Détails du produit',
      // ④ TEXTE APRÈS LA RÉF (parenthèses) — raté par le 1er jet
      'MAKITA ZZI333 (1x Batterie 9 Ah + Chargeur ZZB118)',
      'Marteau perforateur combiné sans fil', '1 offre', '666,00 €', 'Détails du produit',
      // ⑤ carte SANS prix : ne doit voler celui de personne
      'MAKITA ZZISANSPRIX9', 'Carte sans prix (rupture de flux)', 'Détails du produit',
      'MAKITA ZZI850', 'Visseuse compacte', '12', '27 offres',
      'à partir de99,00 €', 'Détails du produit',
      // ⑥ OFFRE MARCHANDE : un LOT. Jamais captée comme produit.
      'Débroussailleuse 54V ZZIMST922N-XJ + 1 batterie + 1 chargeur MAKITA',
      'Vendu par : UnMarchand.fr', 'Détails de l’offre',
      '24/48 heures', 'Livraison gratuite', '694,90 € TVA incluse', 'Détails de l’offre',
      /* ⑧ RÉF ÉCLATÉE PAR DES ESPACES — gabarit mesuré sur sa page réelle
         (2 cartes sur 9). Elle ne donnera jamais un `sku` (on ne devine pas un
         recollage), mais elle OUVRE une carte : sans ça, et sans les ancres,
         elle était absorbée par sa voisine et disparaissait même des écartées.
         ⚠️ Ce gabarit manquait au corpus : la règle qui l'ouvre est restée
         NON GARDÉE jusqu'au 03/08 — un sabotage l'a prouvé en restant vert. */
      'MAKITA ZZI 579 T2T Cordless circular saw 54 V',
      'Scie circulaire portative, 2 batteries', '3 offres', 'à partir de628,37 €',
      'Détails du produit',
      // ⑦ bloc hors sujet : « à partir de » orphelin
      'Produits favoris', 'Smartphone 5G', 'Apple iPhone 17',
      '168', 'à partir de', '774,99 €'
    ].join('\n');
    var rid = pi(pageI, 'MAKITA');
    var ri = rid.items;
    var iSku = {}; ri.forEach(function (x) { iSku[x.sku] = x; });
    ok(ri.length === 5, 'les CINQ gabarits de carte produit sont lus (' + ri.length + '/5)');
    ok(iSku.ZZI805 && iSku.ZZI805.price === 118.86,
      'prix COLLÉ à « de » lu quand même (à partir de118,86)');
    ok(iSku['ZZI922N-XJ'] && iSku['ZZI922N-XJ'].price === 1132.43,
      'prix à espace de milliers lu (1 132,43)');
    ok(iSku.ZZI777P2 && iSku.ZZI777P2.price === 685.95,
      '⛔ « 1 offre » puis prix NU, sans « à partir de » — le gabarit le plus '
      + 'fréquent de la page, et le premier jet le ratait entièrement');
    ok(iSku.ZZI333 && iSku.ZZI333.price === 666.00,
      '⛔ réf suivie de TEXTE entre parenthèses : la réf est le premier mot, '
      + 'le reste ne doit pas faire échouer la lecture');
    ok(!iSku.ZZISANSPRIX9 && iSku.ZZI850 && iSku.ZZI850.price === 99.00,
      '⛔ une carte SANS prix ne vole JAMAIS le prix de la carte suivante');
    ok(ri.every(function (x) { return x.price !== 774.99; }),
      '⛔ un « à partir de » orphelin (bloc favoris, téléphones) n\'est attribué à rien');
    ok(ri.every(function (x) { return x.price !== 694.90; })
      && !ri.some(function (x) { return /MST922N/.test(x.sku); }),
      '⛔⛔ ARGENT : une OFFRE MARCHANDE (« Vendu par : ») est un LOT — batterie '
      + 'et chargeur inclus. Son prix ne devient JAMAIS un produit, sinon un coût '
      + 'de pack s\'écrirait sur la réf d\'un composant');
    ok(rid.sansRef.some(function (x) { return x.prix === 694.90 && /Débroussailleuse/.test(x.titre); }),
      'l\'offre marchande est ÉCARTÉE mais LISTÉE avec son vrai titre et son prix — '
      + 'rien n\'est silencieux, et l\'user peut en faire une fiche s\'il le veut');
    ok(!rid.sansRef.some(function (x) { return /^(24\/48|Livraison)/.test(x.titre); }),
      '⛔ jamais un titre FAUX : une ligne de délai ou de livraison n\'est pas un '
      + 'nom de produit (un titre faux est pire qu\'une absence)');
    ok(ri.every(function (x) { return x.promo === false && x.enStock === null; }),
      'comparateur : jamais de promo ni de stock inventés');

    /* ⛔⛔ PANNE DU 03/08/2026 — `parsed: 0` SUR UNE PAGE DE 57 RÉFÉRENCES.
       Le découpage s'ancrait sur « Détails du produit », une ÉTIQUETTE
       D'INTERFACE. Idealo ne l'a pas envoyée ce jour-là, et le relevé entier
       est tombé à zéro : `format: "aucun"`. Cause reproduite en retirant cette
       seule ligne du corpus réel (3 produits → 0).
       Ces trois assertions rejouent EXACTEMENT le même corpus privé de ses
       ancres, et exigent le MÊME résultat. Elles échouent dès que le parseur
       redevient dépendant d'un libellé d'affichage. */
    function sansAncres(txt, quoi) {
      return txt.split('\n').filter(function (l) {
        var t = l.trim();
        if (quoi === 'produit') return !/^d[ée]tails\s+du\s+produit$/i.test(t);
        return !/^d[ée]tails\s+(du\s+produit|de\s+l[’']?offre)$/i.test(t);
      }).join('\n');
    }
    var sansP = pi(sansAncres(pageI, 'produit'), 'MAKITA');
    ok(sansP.items.length === ri.length,
      '⛔⛔ SANS la ligne « Détails du produit », le MÊME nombre de produits est '
      + 'lu (' + sansP.items.length + '/' + ri.length + '). C\'est exactement la '
      + 'panne du 03/08 : un découpage ne dépend JAMAIS d\'une étiquette d\'interface');
    var mSansP = {}; sansP.items.forEach(function (x) { mSansP[x.sku] = x.price; });
    ok(ri.every(function (x) { return mSansP[x.sku] === x.price; }),
      '⛔ ARGENT : et ce sont les MÊMES prix sur les MÊMES réfs — un découpage de '
      + 'secours qui décale les prix serait pire que la panne qu\'il répare');
    /* ⛔ La carte à réf ÉCLATÉE doit être listée AVEC SON PRIX, ancres ou pas.
       Sans la règle qui la fait ouvrir un bloc, elle est avalée par sa
       voisine — et l'user perd une ligne sans jamais le savoir. */
    ok(rid.sansRef.some(function (x) { return x.prix === 628.37; }),
      'une réf éclatée par des espaces est ÉCARTÉE mais LISTÉE avec son prix');
    ok(!ri.some(function (x) { return /^ZZI$/.test(x.sku) || x.price === 628.37; }),
      '⛔ ARGENT : et elle ne devient JAMAIS un produit — « ZZI 579 T2T » ne se '
      + 'recolle pas, on ne sait pas si le vrai code s\'arrête au 579 ou au T2T');
    ok(sansP.sansRef.some(function (x) { return x.prix === 628.37; }),
      '⛔ …y compris SANS la ligne « Détails du produit » : c\'est le titre qui '
      + 'ouvre la carte, pas l\'étiquette');

    var sansTout = pi(sansAncres(pageI, 'tout'), 'MAKITA');
    ok(sansTout.items.length === ri.length
      && sansTout.sansRef.length === rid.sansRef.length,
      'sans AUCUNE des deux ancres, produits ET offres écartées restent au complet '
      + '(' + sansTout.items.length + ' + ' + sansTout.sansRef.length + ')');
    ok(sansTout.items.every(function (x) { return x.price !== 694.90; }),
      '⛔⛔ ARGENT : même sans ancre, le prix d\'une OFFRE MARCHANDE (un lot) ne '
      + 'devient jamais un produit. Un découpage plus tolérant ne doit surtout pas '
      + 'être plus tolérant SUR L\'ARGENT');

    /* ⛔ LE SOUS-TITRE FAIT PARTIE DE LA FICHE. Mesuré le 03/08 : idealo écrit
       la réf sur une ligne et « Scie circulaire portative, 1 batterie, 3,5 kg »
       sur la SUIVANTE. Un extracteur qui ne lit que la ligne de titre jette le
       type d'outil, le nombre de batteries et le poids — la moitié de ce que
       la page dit. Ces trois assertions échouent si on revient au titre seul. */
    ok(iSku.ZZI777P2 && iSku.ZZI777P2.car && iSku.ZZI777P2.car.type === 'scie circulaire',
      '⛔ le TYPE d\'outil est lu dans le SOUS-TITRE, pas seulement dans le titre');
    ok(iSku.ZZI777P2 && iSku.ZZI777P2.car && iSku.ZZI777P2.car.poidsKg === 3.5,
      'le poids annoncé au sous-titre est relevé (3,5 kg)');
    ok(iSku.ZZI777P2 && iSku.ZZI777P2.car && iSku.ZZI777P2.car.nbBatteries === 1,
      'le nombre de batteries du sous-titre est relevé');
    ok(iSku.ZZI333 && iSku.ZZI333.car && iSku.ZZI333.car.ah === 9
      && iSku.ZZI333.car.chargeur === true && iSku.ZZI333.car.pack === true,
      '⛔ ARGENT : « (1x Batterie 9 Ah + Chargeur) » est un LOT — le drapeau `pack` '
      + 'se lève, donc ce prix ne pourra jamais s\'écrire sur une machine nue');
    var offre = rid.sansRef.filter(function (x) { return x.prix === 694.90; })[0];
    ok(offre && offre.car && offre.car.type === 'débroussailleuse'
      && offre.car.voltage === 54 && offre.car.chargeur === true,
      'une offre marchande écartée est QUALIFIÉE (type, voltage, chargeur) — '
      + 'écartée ne veut plus dire perdue');
  }

  /* ═══ EXTRACTION DE CARACTÉRISTIQUES (03/08/2026) ═════════════════════════
     Reproche de l'user, mot pour mot : « il doit comparer le voltage, le nom
     propre d'un outil, la référence, si c'est un pack ou pas, si c'est avec
     fil ou à batterie, le nombre de batterie — absolument tout, ne recoupe pas
     avec deux ou trois informations ».
     Chaque assertion ci-dessous correspond à un défaut MESURÉ sur les titres
     réels de sa page, puis corrigé. ⛔ Références synthétiques. */
  var ec = pp.extraireCaracteristiques;
  ok(typeof ec === 'function', 'extraireCaracteristiques exportée');
  if (ec) {
    var cA = ec('Meuleuse compacte 125 mm XR 18V MAKITA ZZC405NT outil nu en coffret T-STAK', 'MAKITA');
    ok(cA.coffret === 'TSTAK',
      '⛔ « coffret T-STAK » rend TSTAK, pas GENERIQUE : le mot générique arrive '
      + 'AVANT la marque dans le titre, et une alternance unique élit le premier '
      + 'trouvé. La marque du coffret est facturée à part — la confondre coûte');
    ok(cA.nbBatteries === 0,
      '⛔ « outil nu » vaut ZÉRO batterie — une information, pas une absence');
    ok(cA.pack === true,
      'un outil nu EN COFFRET reste un lot : son prix inclut la boîte');
    ok(cA.serie === 'XR' && cA.voltage === 18 && cA.cotesMm === 125,
      '⛔ « 125 mm » SANS Ø n\'est pas déclaré diamètre : le titre ne dit pas ce '
      + 'que la cote mesure, et la nommer serait faux une fois sur deux (« Lame '
      + 'Alligator 430 mm » est une longueur). Elle est relevée, pas interprétée');
    ok(cA.diametreMm === null,
      'aucun diamètre affirmé là où le titre n\'écrit pas Ø');

    var cB = ec('MAKITA ZZPW 003 E\nNettoyeur haute pression électrique, 120 bars', 'MAKITA');
    ok(cB.sku === null && cB.skuEclate === 'ZZPW003E',
      '⛔ une réf ÉCLATÉE par des espaces ne devient JAMAIS `sku` : on ne sait pas '
      + 'si le vrai code s\'arrête au 003 ou au E. Elle part dans `skuEclate`, qui '
      + 'sert à RAPPROCHER deux annonces, jamais à écrire un prix');
    ok(cB.bars === 120 && cB.type === 'nettoyeur haute pression', 'pression et type relevés');
    ok(cB.sansFil === false,
      '⛔ « électrique » se lit malgré l\'accent : `\\b` est ASCII, « \\bélectrique » '
      + 'ne peut jamais accrocher — la borne ne va qu\'à droite');

    var cC = ec('Visseuse ZZF414D1-QW sans fil 18 V + chargeur 230 V - 1X2.0Ah Batterie', 'MAKITA');
    ok(cC.voltage === 18 && cC.voltageSecteur === 230,
      '⛔ un titre mélange DEUX voltages : celui de l\'outil et celui du secteur. '
      + 'Prendre le maximum ferait passer une visseuse 18 V pour du 230 V');
    ok(cC.nbBatteries === 1 && cC.ah === 2, '« 1X2.0Ah » : une batterie de 2 Ah');
    ok(cC.sansFil === true, '« sans fil » l\'emporte sur la présence d\'un 230 V (le chargeur)');

    /* ═══ QUINCAILLERIE — ni réf, ni voltage, ni batterie ═══════════════════
       Reproche de l'user, 03/08 : « pour la quincaillerie c'est pareil, il n'y
       aura pas de référence, il n'y aura pas de voltage ni rien de tout ça ; il
       y aura la taille, ou l'alésage des circulaires avec le diamètre. »
       ⛔ Titres SYNTHÉTIQUES bâtis sur les gabarits mesurés de son catalogue —
       un harnais ne nomme jamais une donnée réelle. */
    var q1 = ec('Coffret de 29 forets métal HSS-G', 'MAKITA');
    ok(q1.famille === 'consommable' && q1.type === 'foret métal',
      '⛔ « Coffret DE 29 forets » est un LOT DE FORETS, pas un coffret : le '
      + 'contenant ne vole pas la place du contenu (mesuré : 38 titres de sa '
      + 'Quincaillerie sur 69 commencent par cette forme)');
    ok(q1.nbPieces === 29 && q1.conditionnement === 'coffret' && q1.pack === true,
      'le nombre de pièces et son conditionnement sont relevés');
    ok(q1.coffret === null,
      '⛔ un LOT en coffret ne porte pas en plus un `coffret` facturable : ce '
      + 'serait compter deux fois le même emballage');
    ok(q1.nuance === 'HSS-G' && q1.matiere === 'métal',
      'la nuance de coupe est relevée — HSS-Co coûte le double d\'un HSS ordinaire');
    ok(q1.sku === null && q1.voltage === null && q1.nbBatteries === null,
      '⛔ aucune référence ni aucun voltage INVENTÉS là où le titre n\'en porte pas');

    var q2 = ec('Lot de 5 lames 30x43 mm pour multi-cutter Bois dur', 'MAKITA');
    ok(q2.type !== 'multi-cutter' && q2.famille === 'consommable',
      '⛔⛔ ARGENT : « lames POUR multi-cutter » désigne des LAMES, pas la '
      + 'machine. Mesuré sur son catalogue : ces titres étaient typés machine — '
      + 'un jeu de lames pouvait donc s\'apparier à la machine elle-même');
    ok(q2.pourMachine !== null && /multi/.test(q2.pourMachine),
      'la machine de destination est gardée à part, jamais confondue avec l\'article');
    ok(q2.dimensionsMm === '30x43' && q2.diametreMm === null,
      '⛔ « 30x43 mm » sont des COTES, pas un diamètre. Le premier jet annonçait '
      + 'un Ø de 30 mm sur une lame plate qui n\'a pas de diamètre');
    ok(q2.matiere === 'bois dur',
      'la matière est lue en entier : « bois dur » et « bois » ne se coupent pas pareil');

    var q3 = ec('Lame de scie circulaire Ø190 mm alésage 30 mm 40 dents', 'MAKITA');
    ok(q3.diametreMm === 190 && q3.alesageMm === 30 && q3.nbDents === 40,
      '⛔ Ø ET ALÉSAGE, mot de l\'user : deux lames de même diamètre et '
      + 'd\'alésage différent ne montent pas sur la même machine');
    var q3b = ec('Lame de scie circulaire Ø190 mm alésage 20 mm 40 dents', 'MAKITA');
    ok(cmpDispo() && pp.comparerCaracteristiques(q3, q3b).compatible === false,
      '⛔⛔ ARGENT : même Ø, même nombre de dents, même type — et REFUSÉ, parce '
      + 'que l\'alésage diffère. C\'est exactement le recoupement « sur deux ou '
      + 'trois informations » que l\'user refuse');
    function cmpDispo() { return typeof pp.comparerCaracteristiques === 'function'; }

    var f1 = ec('Recharge de fil pour débroussailleuses 2mm x 68,6m', 'MAKITA');
    var f2 = ec('Recharge de fil pour débroussailleuses 2,5mm x 68,6m', 'MAKITA');
    ok(f1.diametreMm === 2 && f2.diametreMm === 2.5 && f1.longueurM === 68.6,
      '⛔⛔ ARGENT : « 2,5mm x 68,6m » — l\'unité mm est AU MILIEU du titre. '
      + 'Aucune règle ne l\'accrochait, et la grosseur du fil disparaissait');
    ok(pp.comparerCaracteristiques(f1, f2).compatible === false,
      '⛔ deux bobines de MÊME longueur et de fil DIFFÉRENT sont deux articles : '
      + 'sans la grosseur du fil, elles ressortaient rigoureusement identiques');

    var q4 = ec('Elagueuse sur perche 18V ZZE567N-XJ', 'MAKITA');
    ok(q4.type === 'élagueuse sur perche',
      '⛔ « Elagueuse » SANS ACCENT doit accrocher « élagueuse » : un titre '
      + 'fournisseur n\'accentue pas de façon fiable (mesuré sur son catalogue)');

    /* ═══ EPI ET VÊTEMENT DE TRAVAIL ════════════════════════════════════════
       « Pour les chaussures de sécurité c'est pareil, les pantalons de travail
       c'est pareil. » ⚠️ Les codes de la norme EN ISO 20345 ont changé en
       2022 (S6, S7, suffixes S/L) — vérifiés en ligne, pas cités de mémoire. */
    var e1 = ec('Chaussures de sécurité S3S hautes pointure 43', 'MAKITA');
    ok(e1.famille === 'epi' && e1.type === 'chaussure de sécurité',
      'une chaussure de sécurité est typée comme telle, pas laissée sans famille');
    ok(e1.pointure === 43 && e1.normeEpi === 'S3S',
      '⛔ pointure ET norme relevées — « S3S » est un code de la révision 2022, '
      + 'que je n\'aurais pas su de mémoire');
    var e1b = ec('Chaussures de sécurité S3S hautes pointure 44', 'MAKITA');
    ok(pp.comparerCaracteristiques(e1, e1b).compatible === false,
      '⛔ ARGENT : une pointure 43 et une 44 sont DEUX articles. Les apparier '
      + 'écrirait le coût de l\'un sur la fiche de l\'autre');
    var e2 = ec('Pantalon de travail taille XL', 'MAKITA');
    ok(e2.famille === 'epi' && e2.type === 'pantalon de travail' && e2.taille === 'XL',
      'un pantalon de travail porte une TAILLE, ni voltage ni référence');
    ok(e2.voltage === null && e2.sku === null && e2.nbBatteries === null,
      '⛔ aucun champ de machine inventé sur un vêtement');
    var e3 = ec('Ceinture porte-outils en cuir 18 compartiments', 'MAKITA');
    ok(e3.famille !== 'epi',
      '⛔ une CEINTURE PORTE-OUTILS n\'est pas un équipement de protection : '
      + 'mesuré, 6 fiches de son catalogue étaient rangées en EPI et se seraient '
      + 'comparées à des vêtements de travail');

    /* ═══ DÉFAUTS VUS DANS SON RELEVÉ DU 03/08 ════════════════════════════
       Trois mesures fausses, relevées dans le JSON qu'il m'a renvoyé, chacune
       reproduite ici avant correction. ⛔ Réfs synthétiques. */
    var lot = ec('10 x MAKITA ZZB184 batteries 18v 5Ah Li-ion', 'MAKITA');
    ok(lot.nbBatteries !== 184,
      '⛔⛔ ARGENT : les chiffres d\'une RÉFÉRENCE ne sont pas un compte. Mesuré '
      + 'sur son relevé — « 10 x … ZZB184 batteries » rendait 184 BATTERIES. Un '
      + 'compte doit être précédé d\'autre chose qu\'une lettre ou un chiffre');
    ok(lot.nbPieces === 10 && lot.nbBatteries === 10,
      'un lot de dix batteries en contient dix — le multiplicateur de tête est lu');

    var deuxB = ec('MAKITA ZZF961H2T Clé à choc 18 V + 2x Powerstack batterie 5,0 Ah + chargeur', 'MAKITA');
    ok(deuxB.nbBatteries === 2,
      '⛔ « 2x Powerstack batterie » : le compte est séparé du mot par un nom de '
      + 'gamme. Mesuré sur son relevé — rendu 1 au lieu de 2, donc un lot pris '
      + 'pour la moitié de ce qu\'il contient');

    var kw = ec('MAKITA ZZ25899K Marteau de démolition SDS-Max 1 500 W', 'MAKITA');
    ok(kw.watts === 1500,
      '⛔ LE SÉPARATEUR DE MILLIERS COUPE LA PUISSANCE : « 1 500 W » rendait 500 W '
      + 'sur son relevé. Une machine annoncée trois fois moins puissante ne se '
      + 'compare plus à la bonne fiche');
    ok(ec('MAKITA ZZ586MT2 Aspirateur 0 W', 'MAKITA').watts === null,
      '⛔ une mesure à ZÉRO est une mesure fausse, pas une mesure : aucun outil ne '
      + 'consomme 0 W, et un zéro vient d\'un motif qui a mordu au mauvais endroit '
      + '(vu sur son relevé)');

    /* Préalables : sans eux, les gardes ci-dessus pourraient être de simples
       refus systématiques — ce qui ne vérifierait rien. */
    ok(ec('MAKITA ZZI333 (1x Batterie 9 Ah + Chargeur ZZB118)', 'MAKITA').nbBatteries === 1
      && ec('Meuleuse XR 18V MAKITA ZZC405NT outil nu', 'MAKITA').nbBatteries === 0
      && ec('MAKITA ZZ7104L Mortaiseuse 1140 W', 'MAKITA').watts === 1140,
      'préalable : les comptes et puissances LÉGITIMES passent toujours');

    /* ═══ PRÉFIXES DE RÉFÉRENCE ET LANGUES (03/08/2026) ═══════════════════
       Demande de l'user : « avant ça tu vas chercher comment fonctionnent les
       références de cette marque […] tant que tu ne sais pas catégoriser les
       lettres de début, tu ne commences pas », puis « ajoute l'espagnol et
       l'anglais ». ⚠️ Les NUMÉROS sont synthétiques ; seuls les PRÉFIXES sont
       réels — c'est eux qui sont testés, et ils appartiennent à la
       nomenclature du constructeur, pas au catalogue de l'user. */
    var pk = ec('DEWALT DCK999X9', 'DEWALT');
    ok(pk.prefixe === 'DCK' && pk.type === 'pack d\'outils',
      '⛔ « DCK » = combo kit : le préfixe EST le sens, il porte donc son type. '
      + 'Sans lui, une référence seule ne se catégorise pas du tout');
    ok(ec('DEWALT DCH999X9', 'DEWALT').rayon === 'perforation'
      && ec('DEWALT DXPW999', 'DEWALT').rayon === 'chantier'
      && ec('DEWALT DCB999', 'DEWALT').famille === 'energie',
      'le préfixe donne le RAYON quand il n\'en désigne qu\'un seul');
    ok(ec('DEWALT DCF999X9', 'DEWALT').rayon === null,
      '⛔ « DCF » couvre riveteuse ET clé à chocs : DEUX rayons, donc AUCUN. '
      + 'Un préfixe ambigu ne tranche pas — il rend la famille, rien de plus');
    ok(ec('DEWALT DCE999X9', 'DEWALT').type === null,
      '⛔ un préfixe n\'invente JAMAIS de type : un type est un nom précis, il '
      + 'vient des mots');

    /* ⛔⛔ LA TABLE EST CELLE DE DeWALT, ET D'ELLE SEULE. Défaut mesuré à la
       minute où je l'ai branchée : le catalogue est tombé de 1 119 fiches
       typées à 1 049, parce que « DTW… » (Makita) était lu « DT », accessoire
       DeWALT, ce qui effaçait le type de dizaines de boulonneuses. */
    var mk = ec('MAKITA DTW999Z Boulonneuse à chocs 18V', 'MAKITA');
    ok(mk.prefixe === null && mk.famille === 'machine' && mk.type !== null,
      '⛔⛔ une référence d\'une AUTRE marque n\'est jamais lue avec la table '
      + 'DeWALT — sinon « DTW… » passerait pour un accessoire, et le type de la '
      + 'machine serait effacé (préfixe=' + mk.prefixe + ', famille=' + mk.famille + ')');
    ok(ec('DEWALT DT99999 Foret béton', 'DEWALT').prefixe === 'DT',
      'préalable : le MÊME début de référence EST lu quand la marque est bien '
      + 'DeWALT — sans quoi l\'assertion ci-dessus passerait pour la mauvaise raison');

    // ── Espagnol et anglais
    var esp = ec('DEWALT Martillo Electroneumático sin escobillas XR 18V SDS plus 2,1J y maletín TSTAK', 'DEWALT');
    ok(esp.type === 'marteau perforateur',
      '⛔ ESPAGNOL : « martillo electroneumático … maletín TSTAK » était typé '
      + 'COFFRET — « TSTAK » était le seul mot que je savais lire. Un marteau '
      + 'rangé dans une boîte reste un marteau (' + esp.type + ')');
    ok(ec('DEWALT Riveter XR 18 V 4,8 mm', 'DEWALT').type === 'riveteuse',
      '⛔ ANGLAIS : « Riveter » se lit comme « riveteuse »');
    ok(ec('Cordless circular saw 54 V brushless', 'DEWALT').type === 'scie circulaire'
      && ec('Sierra de calar 18V', 'DEWALT').type === 'scie sauteuse',
      'anglais et espagnol rendent le MÊME type canonique que le français — '
      + 'sinon deux annonces du même outil ne se compareraient jamais');

    /* ⛔⛔ CE QUI SUIT UN « + » EST LE LOT, PAS L'ARTICLE. 13 fiches de son
       catalogue étaient typées CHARGEUR ou BATTERIE pour cette seule raison. */
    var lotT = ec('DEWALT Scie sauteuse 18V DCS999NT-XJ + 2 batteries 18V 5 Ah + 1 chargeur rapide', 'DEWALT');
    ok(lotT.type === 'scie sauteuse',
      '⛔⛔ « Scie sauteuse + 2 batteries + 1 chargeur » est une SCIE. Le mot le '
      + 'plus long gagnait, et il appartenait au lot (' + lotT.type + ')');
    ok(lotT.nbBatteries === 2 && lotT.chargeur === true,
      '⛔ PRÉALABLE D\'ARGENT : le lot reste compté ENTIER. Élaguer pour typer ne '
      + 'doit rien retirer de ce qui fait le prix — sinon on aurait échangé une '
      + 'erreur de type contre une erreur de coût');
    var par = ec('DEWALT DCH999X9 (1x Batterie 9 Ah + Chargeur DCB118) Marteau perforateur combiné', 'DEWALT');
    ok(par.type === 'marteau perforateur' && par.nbBatteries === 1 && par.chargeur === true,
      'une parenthèse joue le même rôle qu\'un « + » : elle décrit le lot, pas l\'article');

    /* ⚠️ Deux préfixes ne sont PAS fiables : DeWALT range sa radio sous DWST
       et son télémètre sous DWHT. Ils ne doivent donc jamais contredire un mot. */
    var rad = ec('DEWALT DWST9-99999 Radio de chantier Bluetooth 18V', 'DEWALT');
    ok(rad.type === 'radio de chantier',
      '⛔ un préfixe INCERTAIN ne contredit pas un mot explicite : DeWALT range '
      + 'sa RADIO sous DWST (rangement) — le mot du titre l\'emporte (' + rad.type + ')');

    var cD = ec('MAKITA ZZI850', 'MAKITA');
    ok(cD.type !== 'kit',
      '⛔ DÉFAUT MESURÉ PAR CETTE PORTE : « kit » se trouve DANS « maKITa ». Un '
      + '`indexOf` sans borne de mot typait « kit » toute machine de la marque. '
      + 'La borne ne peut pas être `\\b` non plus — il est ASCII, et les noms '
      + 'd\'outils sont accentués');
    ok(cD.voltage === null && cD.ah === null && cD.nbBatteries === null
      && cD.type === null && cD.sansFil === null,
      '⛔ tout champ non trouvé rend `null`, JAMAIS zéro : « voltage inconnu » et '
      + '« 0 V » ne se comparent pas pareil, et les confondre apparierait n\'importe quoi');
  }

  /* ═══ NOMENCLATURE ET ENTONNOIR (03/08/2026) ══════════════════════════════
     Demande de l'user : « une grosse recherche sur Internet de comment sont
     nommés les outillages, la quincaillerie et les équipements de protection
     […] un document massif et parfaitement rangé avec une chronologie en
     entonnoir pour que ton parseur ne se trompe pas. »
     ⛔ Ces assertions gardent la STRUCTURE, pas le contenu : elles ne citent
     aucun produit du catalogue, elles vérifient que l'entonnoir tient. */
  var nom = pp.nomenclature;
  ok(nom && typeof nom === 'object', 'la nomenclature est exposée par le parseur');
  if (nom) {
    ok(Object.keys(nom.FAMILLES).length === 5,
      'cinq familles, et pas une de plus : machine · consommable · energie · rangement · epi');
    ok(nom.INDEX.length > 600,
      'le vocabulaire est large — ' + nom.INDEX.length + ' écritures indexées');
    /* ⛔ PRÉALABLE : chaque rayon cité par un type DOIT exister, et chaque
       mesure citée par un rayon DOIT être déclarée. Sans ce contrôle, une
       faute de frappe ferait typer dans le vide sans que rien ne le dise. */
    var rayonsOrphelins = nom.TYPES.filter(function (t) { return !nom.RAYONS[t[0]]; });
    ok(rayonsOrphelins.length === 0,
      '⛔ aucun type ne cite un rayon inexistant (' + rayonsOrphelins.length + ')');
    var mesuresInconnues = [];
    Object.keys(nom.RAYONS).forEach(function (r) {
      nom.RAYONS[r].mesures.forEach(function (m) {
        if (!nom.MESURES[m] && mesuresInconnues.indexOf(m) === -1) mesuresInconnues.push(m);
      });
    });
    ok(mesuresInconnues.length === 0,
      '⛔ aucun rayon ne cite une mesure non déclarée (' + mesuresInconnues.join(', ') + ')');
    /* ⛔ LE VERROU LUI-MÊME. C'est LA raison d'être de l'entonnoir. */
    ok(nom.mesureAutorisee('chaussure', 'voltage') === false
      && nom.mesureAutorisee('vetement', 'ah') === false
      && nom.mesureAutorisee('lame-circulaire', 'nbBatteries') === false,
      '⛔⛔ une chaussure n\'a pas de voltage, un vêtement pas d\'ampères-heures, '
      + 'une lame pas de batterie — ce n\'est plus une espérance, c\'est une règle');
    ok(nom.mesureAutorisee('chaussure', 'pointure') === true
      && nom.mesureAutorisee('lame-circulaire', 'alesageMm') === true,
      'préalable : le verrou LAISSE PASSER ce qui a cours dans le rayon — sinon '
      + 'l\'assertion ci-dessus serait un refus systématique, donc sans valeur');
    ok(nom.mesureAutorisee('rayon-qui-n-existe-pas', 'voltage') === true,
      '⛔ rayon INCONNU ⇒ on n\'efface rien : un trou de vocabulaire ne doit pas '
      + 'faire perdre des mesures justes, il doit se voir');
  }
  if (ec && nom) {
    /* ⚠️ CE TITRE EST CHOISI POUR QUE LE VERROU AIT QUELQUE CHOSE À EFFACER.
       Un premier essai portait sur une chaussure sans « mm » ni « kg » : les
       champs étaient vides de toute façon, l'assertion passait verrou ou pas,
       et LE SABOTAGE EST RESTÉ VERT. Une vérification qu'on ne parvient pas à
       faire échouer ne vérifie rien — ici « 380 mm » et « 1,2 kg » SONT lus
       par les règles générales, et c'est le rayon qui doit les refuser. */
    var vr = ec('Chaussures de sécurité S3S hautes tige 380 mm 1,2 kg pointure 43', 'MAKITA');
    ok(vr.cotesMm === null && vr.poidsKg === null,
      '⛔⛔ VERROU EN ACTION : sur une chaussure, ni cote ni poids ne ressortent — '
      + 'ces mesures ne sont pas déclarées dans le rayon, donc elles sont effacées');
    ok(vr.pointure === 43 && vr.normeEpi === 'S3S',
      'préalable : les mesures qui ONT cours dans le rayon, elles, restent — sans '
      + 'quoi le verrou serait un effaceur aveugle');
    var vrLibre = ec('Tige 380 mm 1,2 kg', 'MAKITA');
    ok(vrLibre.cotesMm === 380 && vrLibre.poidsKg === 1.2,
      '⛔ PREUVE QUE LES DEUX MESURES SONT BIEN LUES hors rayon : sans elle, '
      + 'l\'assertion ci-dessus serait vraie même avec le verrou débranché');

    /* ⛔⛔ LA MESURE QUI RAPPORTE LE PLUS : le suffixe de référence. Table
       relevée sur support.dewalt.com le 03/08. Réfs SYNTHÉTIQUES. */
    var sN = ec('DEWALT ZZD805N-XJ', 'DEWALT');
    var sP2 = ec('DEWALT ZZD805P2', 'DEWALT');
    ok(sN.nbBatteries === 0 && sP2.nbBatteries === 2 && sP2.ah === 5,
      '⛔⛔ ARGENT : « …N » est la machine NUE, « …P2 » la MÊME machine avec deux '
      + 'batteries 5,0 Ah. Un comparateur n\'écrit souvent QUE la référence — sans '
      + 'cette lecture, le prix du lot s\'écrit sur la machine nue');
    ok(pp.comparerCaracteristiques(sN, sP2).compatible === false,
      'et les deux sont donc REFUSÉES l\'une pour l\'autre');
    var sP3T = ec('DEWALT ZZK368P3T', 'DEWALT');
    ok(sP3T.nbBatteries === 3 && sP3T.coffret === 'TSTAK',
      '⛔ « P3T » : TROIS batteries et un coffret TSTAK. Une table fermée à 1 et 2 '
      + 'lisait ce lot comme s\'il n\'en portait aucune — la lettre donne la '
      + 'capacité, le chiffre donne le nombre, ils se lisent séparément');
    var sXJ = ec('DEWALT ZZD805P2-XJ', 'DEWALT');
    ok(sXJ.nbBatteries === 2,
      'l\'extension régionale (-XJ) ne masque pas le suffixe : elle ne dit que le '
      + 'marché, jamais le contenu');

    var gant = ec('Gant anti-coupure taille 9 EN 388', 'MAKITA');
    ok(gant.tailleGant === 9 && gant.taille === null && gant.pointure === null,
      '⛔ « taille 9 » sur un GANT est une taille de gant — pas une pointure, pas '
      + 'une taille de vêtement. C\'est le RAYON qui tranche, le nombre ne suffit pas');
    ok(gant.skuEclate === null && gant.normeEpi === 'EN 388',
      '⛔ « EN 388 » est une NORME, pas une référence : elle sortait en sku « EN388 », '
      + 'et deux gants se seraient comparés par un code qu\'aucun fabricant n\'écrit');
    var pant = ec('Pantalon de travail taille 48', 'MAKITA');
    ok(pant.taille === '48' && pant.pointure === null,
      '⛔ « taille 48 » sur un PANTALON n\'est pas une pointure 48. Mesuré avant '
      + 'correction : le titre sortait avec `pointure: 48`, puis perdait tout au verrou');

    var lame = ec('Lame de scie circulaire Ø190 mm 40 dents ATB bois dur', 'MAKITA');
    ok(lame.rayon === 'lame-circulaire' && lame.denture === 'ATB' && lame.matiere === 'bois dur',
      'denture et matière relevées — « bois dur » l\'emporte sur « bois », deux prix');
    var fmax = ec('Foret béton SDS-max Ø 20 mm', 'MAKITA');
    ok(fmax.emmanchement === 'SDS-MAX',
      '⛔ « SDS-max » doit battre « SDS » : ils ne sont PAS interchangeables '
      + '(queue Ø 10 mm à 2 rainures contre Ø 18 mm à 3 rainures), et un `break` au '
      + 'premier trouvé rendait « SDS » selon l\'ordre de la table');
    var dsq = ec('Disque à tronçonner Inox Ø125 mm type 41', 'MAKITA');
    ok(dsq.formeDisque === 'TYPE 41' && dsq.rayon === 'disque',
      'la forme normalisée EN 12413 est relevée (type 27 / 41 / 42)');
    var emb = ec('Coffret de 30 embouts de vissage TX20 Torsion', 'MAKITA');
    ok(emb.empreinte === 'TX20' && emb.nbPieces === 30,
      'l\'empreinte porte sa TAILLE : un TX20 et un TX25 sont deux articles');
  }

  /* ═══ ORDRE DE BALAYAGE (03/08/2026) ══════════════════════════════════════
     Demande de l'user : « commencer à scanner toujours la DERNIÈRE page quand
     on lit dans un ordre décroissant, et la PREMIÈRE page en ordre croissant ».
     Les deux cas disent la même chose : on commence par le bout LE MOINS CHER,
     parce que c'est là que sont les outils qu'il vend. */
  var pb = pp.planBalayage;
  ok(typeof pb === 'function', 'planBalayage exportée');
  if (pb) {
    var PAT = 'https://exemple.test/liste-{offset}.html?tri=prix';
    var PAT1 = 'https://exemple.test/liste.html?tri=prix';
    var desc = pb({ pages: 67, pas: 15, ordre: 'desc', patron: PAT, patronPage1: PAT1 });
    var asc = pb({ pages: 67, pas: 15, ordre: 'asc', patron: PAT, patronPage1: PAT1 });
    ok(desc.length === 67 && asc.length === 67,
      'le plan couvre TOUTES les pages, quel que soit le sens (' + desc.length + ')');
    ok(desc[0].page === 67 && desc[desc.length - 1].page === 1,
      '⛔ TRI DÉCROISSANT : on commence par la DERNIÈRE page. C\'est là que sont '
      + 'les outils les moins chers — ceux qu\'il vend. Si le balayage casse en '
      + 'route, la partie déjà relevée est la partie utile');
    ok(asc[0].page === 1 && asc[asc.length - 1].page === 67,
      '⛔ TRI CROISSANT : on commence par la PREMIÈRE — même règle, autre bout');
    ok(desc[0].offset === 66 * 15 && asc[1].offset === 15,
      'la loi de pagination tient : page N → offset (N−1)×pas (mesurée sur SES '
      + 'pages 4, 5 et 67 le 02/08)');
    /* ⛔ La page 1 n'a PAS d'offset dans le chemin. Une page 1 reconstruite
       avec « -0 » est une AUTRE URL, et rien ne dit qu'elle réponde pareil. */
    ok(desc[desc.length - 1].url === PAT1 && asc[0].url === PAT1,
      '⛔ la PAGE 1 garde son URL courte, jamais une URL fabriquée avec « -0 »');
    // ⚠️ La page 1 est exclue : c'est justement celle qui n'a pas d'offset.
    var autresQue1 = desc.filter(function (x) { return x.page !== 1; });
    ok(autresQue1.length === 66
      && autresQue1.every(function (x) { return x.url.indexOf('-' + x.offset + '.') !== -1; }),
      'chacune des 66 AUTRES pages porte SON offset dans l\'URL');
    /* Préalable : les deux sens doivent visiter le MÊME ensemble de pages —
       sinon « commencer par la fin » aurait pu vouloir dire « en oublier ». */
    var vuD = desc.map(function (x) { return x.page; }).sort(function (a, b) { return a - b; });
    var vuA = asc.map(function (x) { return x.page; }).sort(function (a, b) { return a - b; });
    ok(JSON.stringify(vuD) === JSON.stringify(vuA),
      '⛔ PRÉALABLE : les deux sens couvrent EXACTEMENT les mêmes pages. Changer '
      + 'l\'ordre ne doit jamais changer la couverture');
    ok(pp.rangDansPlan(desc, 67) === 1 && pp.rangDansPlan(desc, 1) === 67
      && pp.rangDansPlan(desc, 999) === -1,
      'le rang dans le plan se lit sans compter, et une page hors plan rend -1');
  }

  /* ⛔ « NE RECOUPE PAS AVEC DEUX OU TROIS INFORMATIONS » — le cœur du reproche.
     Deux annonces peuvent partager réf, type, voltage ET gamme et désigner
     pourtant deux articles au prix très différent : la machine nue et le lot. */
  var cmp = pp.comparerCaracteristiques;
  ok(typeof cmp === 'function', 'comparerCaracteristiques exportée');
  if (cmp && pp.extraireCaracteristiques) {
    var nu  = pp.extraireCaracteristiques('Meuleuse 125 mm XR 18V MAKITA ZZC405NT outil nu', 'MAKITA');
    var lot = pp.extraireCaracteristiques('Meuleuse XR 18V MAKITA ZZC405NT + 2 batteries 5.0Ah + chargeur', 'MAKITA');
    var v = cmp(nu, lot);
    ok(v.compatible === false,
      '⛔⛔ ARGENT : même RÉFÉRENCE, même type, même voltage, même gamme — et '
      + 'REFUSÉ, parce que l\'un est nu et l\'autre porte deux batteries. Quatre '
      + 'concordances ne valent rien face à un seul conflit');
    ok(v.concordances.indexOf('reference') !== -1 && v.conflits.indexOf('nbBatteries') !== -1
      && v.conflits.indexOf('pack') !== -1,
      'le verdict NOMME ce qui concorde et ce qui sépare (' + JSON.stringify(v.conflits) + ')');
    ok(cmp(nu, nu).compatible === true && cmp(nu, nu).conflits.length === 0,
      'préalable : deux fois le même titre sont compatibles — sans quoi le refus '
      + 'ci-dessus serait un refus systématique, donc sans valeur');
    var flou = cmp(nu, { type: 'meuleuse', sku: null, voltage: null, nbBatteries: null, pack: null });
    ok(flou.concordances.indexOf('voltage') === -1 && flou.concordances.indexOf('nbBatteries') === -1,
      '⛔ un champ `null` d\'un côté n\'est PAS une concordance : c\'est une '
      + 'ignorance, et une ignorance ne vote pas');
  }

  // L'aiguillage : chaque gabarit part vers son parseur, le vide est dit.
  var pa = pp.parseAuto;
  ok(typeof pa === 'function', 'parseAuto exportée');
  if (pa && pc) {
    var pageCote = 'Outil - MAKITA ZZT111 Prix 100,00 € Ajouter au panier En stock';
    var a1 = pa(pageCote, 'MAKITA');
    ok(a1.format === 'cotebrico' && a1.items.length === 1,
      'gabarit cotébrico → parseur cotébrico (' + a1.format + ', ' + a1.items.length + ')');
    var a2 = pa('Visseuse ZZT123-QW MAKITA\nMAKITA\n999,90 € TTC\n833,25 € HT', 'MAKITA');
    ok(a2.format === 'clickoutil' && a2.items.length === 1,
      'gabarit clickoutil → parseur clickoutil (' + a2.format + ', ' + a2.items.length + ')');
    var a3 = pa('<html>Chargement…</html>', 'MAKITA');
    ok(a3.format === 'aucun' && a3.items.length === 0,
      'rien de reconnu → format « aucun », jamais un mensonge');
    var a4 = pa('MAKITA ZZI805\ndescription\n5\n94 offres\nà partir de118,86 €', 'MAKITA');
    ok(a4.format === 'idealo' && a4.items.length === 1 && a4.items[0].price === 118.86,
      'gabarit idealo → parseur idealo (' + a4.format + ', ' + a4.items.length + ') — '
      + 'sans cet aiguillage, un relevé comparateur rendrait « aucun »');
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

  /* ═══ MODE BALAYAGE (&scan=1) + FENÊTRE PROMO 30 J (02/08/2026) ═══════════
     La liste idealo DeWALT fait 67 pages, balayées par UN raccourci en
     rafale. Sans cache, chaque page relisait `product_overrides` en entier :
     ≈ 160 000 lectures Firestore par balayage — le quota GRATUIT (50 000/j)
     s'est épuisé le 01/08 et a fermé l'admin. On prouve en appelant le
     handler RÉEL avec une base factice qui compte lectures et écritures :
       · 2 pages scan=1 → la collection n'est lue qu'UNE fois ;
       · l'écriture de la page 1 est VISIBLE page 2 (aucune ré-écriture) ;
       · sans scan → relecture pleine à chaque appel (comportement historique) ;
       · J4 : promoAncienPrix = MINIMUM 30 j du journal, jamais le prix courant.
     ⛔ Fiche choisie À L'EXÉCUTION dans le catalogue, prix synthétiques —
     un harnais ne nomme jamais une donnée du catalogue. */
  var admFn = adm._internals && adm._internals.handlePriceWatch;
  var scanReset = adm._internals && adm._internals.pwScanReset;
  ok(typeof admFn === 'function' && typeof scanReset === 'function',
    'handlePriceWatch et pwScanReset exposés aux portes via _internals');
  ok(!process.env.FIREBASE_SERVICE_ACCOUNT,
    'préalable : FIREBASE_SERVICE_ACCOUNT ne doit pas être posé pendant ce harnais — '
    + 'la base est FACTICE, un vrai Firestore fausserait les comptes de lectures');
  if (admFn && scanReset && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    var catJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'products.json'), 'utf8'));
    var prods = catJson.products || catJson;
    var cible = null;
    for (var ci = 0; ci < prods.length; ci++) {
      var pc = prods[ci];
      if (String(pc.brand || '').toUpperCase() !== 'DEWALT') continue;
      if (!pc.sku || pc.priceLocked || pc.hidden || !(Number(pc.price) > 0)) continue;
      if (!/^[A-Z][A-Z0-9.\/-]{2,}[A-Z0-9]$/.test(String(pc.sku)) || !/\d/.test(pc.sku)) continue;
      cible = pc; break;
    }
    ok(!!cible, 'préalable : une fiche DeWALT à réf sûre existe au catalogue');

    var fauxAdmin = { firestore: { FieldValue: { serverTimestamp: function () { return { _sentinelle: true }; } } } };
    function fauxRes() {
      return { code: 0, out: null,
        status: function (c) { this.code = c; return this; },
        json: function (o) { this.out = o; return this; } };
    }
    /* La base factice émule DEUX réalités Firestore que l'émulateur officiel
       cache : (1) chaque get() sur la collection se COMPTE ; (2) chaîner un
       second where (id == + at >=) exigerait un index composite (règle E) —
       ici il JETTE, comme la production jette FAILED_PRECONDITION. */
    function fauxDb(seedOv, seedLog) {
      var compte = { lecturesOv: 0, ecrituresParId: {}, patchsParId: {} };
      return {
        _compte: compte,
        collection: function (nom) {
          if (nom === 'product_overrides') {
            return {
              get: function () {
                compte.lecturesOv++;
                return Promise.resolve({ forEach: function (fn) {
                  Object.keys(seedOv).forEach(function (id) {
                    fn({ id: id, data: function () { return JSON.parse(JSON.stringify(seedOv[id])); } });
                  });
                } });
              },
              doc: function (id) {
                return { set: function (patch) {
                  compte.ecrituresParId[id] = (compte.ecrituresParId[id] || 0) + 1;
                  compte.patchsParId[id] = patch;
                  return Promise.resolve();
                } };
              }
            };
          }
          if (nom === 'price_watch_log') {
            return {
              where: function (champ, op, val) {
                return {
                  get: function () {
                    return Promise.resolve({ forEach: function (fn) {
                      (seedLog || []).forEach(function (l) {
                        if (champ === 'id' && op === '==' && l.id !== val) return;
                        fn({ data: function () { return l; } });
                      });
                    } });
                  },
                  where: function () { throw new Error('index composite requis (id + at) — règle E'); }
                };
              },
              add: function () { return Promise.resolve(); }
            };
          }
          throw new Error('collection inattendue : ' + nom);
        }
      };
    }
    function pageIdealo(sku, prixTxt) {
      var lignes = ['DEWALT ' + sku, 'description outil', '5', '94 offres', 'à partir de ' + prixTxt + ' €'];
      while (lignes.join('\n').length < 220) lignes.push('ligne de bourrage sans marque ni prix pour le seuil du corps');
      return lignes.join('\n');
    }
    function reqPage(sku, extras) {
      var q = Object.assign({ type: 'price-watch', brand: 'DEWALT', source: 'idealo' }, extras || {});
      return { method: 'POST', query: q, body: { text: pageIdealo(sku, '450,00') } };
    }

    /* ── UN REFUS MUET EST UN MUR (02/08/2026) ───────────────────────────────
       Le balayage 67 pages a rendu « text manquant ou trop court » à chaque
       tour, sans rien d'autre : impossible de distinguer une variable mal
       pointée d'une page vide. Le serveur tient le corps → il le mesure.
       ⛔ ET IL NE REFLÈTE JAMAIS UN EN-TÊTE : la clé du traqueur y vit. */
    var refusVide = fauxRes();
    await admFn({ method: 'POST', query: { type: 'price-watch', source: 'idealo' }, body: {},
      headers: { 'x-watch-secret': 'ZZSECRET-TEMOIN-NE-DOIT-JAMAIS-SORTIR' } },
      refusVide, fauxAdmin, fauxDb({}, []));
    ok(refusVide.code === 400 && refusVide.out && refusVide.out.diagnostic
      && refusVide.out.diagnostic.caracteresRecus === 0
      && /VIDE ou absent/.test(refusVide.out.diagnostic.lecture)
      && refusVide.out.source === 'idealo',
      '⛔ corps sans `text` → le refus doit MESURER (0 caractère) et nommer la source, '
      + 'pas opposer un mur — obtenu : ' + JSON.stringify(refusVide.out && refusVide.out.diagnostic));

    var refusCourt = fauxRes();
    await admFn({ method: 'POST', query: { type: 'price-watch', source: 'idealo' }, body: { text: '15' },
      headers: { 'x-watch-secret': 'ZZSECRET-TEMOIN-NE-DOIT-JAMAIS-SORTIR' } },
      refusCourt, fauxAdmin, fauxDb({}, []));
    ok(refusCourt.out && refusCourt.out.diagnostic
      && refusCourt.out.diagnostic.caracteresRecus === 2
      && refusCourt.out.diagnostic.debutRecu === '15'
      && /TRÈS court/.test(refusCourt.out.diagnostic.lecture),
      '⛔ un corps de 2 caractères (la variable pointe sur un NOMBRE) doit se lire tel quel '
      + 'dans le diagnostic — c\'est ce qui distingue « mauvaise variable » de « page vide » '
      + '(obtenu : ' + JSON.stringify(refusCourt.out && refusCourt.out.diagnostic) + ')');

    var fuite = JSON.stringify(refusVide.out) + JSON.stringify(refusCourt.out);
    ok(fuite.indexOf('ZZSECRET-TEMOIN') === -1 && !/watch-secret/i.test(fuite),
      '⛔⛔ SECRET : le diagnostic d\'erreur ne reflète JAMAIS un en-tête — la clé du '
      + 'traqueur y vit, et un extrait de secret reste un secret');

    if (cible) {
      /* Le newPrice s'APPREND du modèle réel (dryRun) — un seuil recopié se
         périme (règle harnais) et le modèle de marge évolue avec la config. */
      var rApp = fauxRes();
      await admFn(reqPage(cible.sku, { dryRun: '1' }), rApp, fauxAdmin, fauxDb({}, []));
      var rec0 = rApp.out && rApp.out.applied && rApp.out.applied[0];
      if (!rec0) rec0 = rApp.out && rApp.out.unchanged && rApp.out.unchanged[0];
      ok(!!(rec0 && rec0.newPrice > 0), 'préalable : newPrice appris du modèle réel ('
        + JSON.stringify(rApp.out && rApp.out.counts) + ')');

      if (rec0 && rec0.newPrice > 0) {
        var courantHaut = Math.round((rec0.newPrice + 100) * 100) / 100;

        /* Espion sur catalog.loadCatalog : en production, cet appel relit LUI
           AUSSI la collection entière (via son propre Firestore, invisible à
           la base factice). Le mode balayage doit fusionner sur le relevé du
           cache (loadCatalogAvec) et ne JAMAIS passer par loadCatalog. */
        var catMod = require('../api/_lib/catalog.js');
        var vraiLoadCatalog = catMod.loadCatalog;
        var appelsLoadCatalog = 0;
        catMod.loadCatalog = function () { appelsLoadCatalog++; return vraiLoadCatalog.apply(this, arguments); };

        // ── Balayage : une seule lecture pour deux pages, écriture visible ──
        scanReset();
        var seedScan = {}; seedScan[cible.id] = { price: courantHaut };
        var dbS = fauxDb(seedScan, []);
        var rS1 = fauxRes();
        await admFn(reqPage(cible.sku, { scan: '1' }), rS1, fauxAdmin, dbS);
        ok(rS1.code === 200 && rS1.out && rS1.out.ok === true && rS1.out.scan === true,
          'préalable balayage : page 1 traitée et la réponse porte scan:true ('
          + rS1.code + ', ' + JSON.stringify(rS1.out && rS1.out.counts) + ')');
        ok(rS1.out && rS1.out.counts && rS1.out.counts.applied === 1,
          'préalable balayage : la baisse page 1 est APPLIQUÉE (écart forcé de 100 €)');
        var ecritsPage1 = (dbS._compte.ecrituresParId[cible.id] || 0);
        ok(ecritsPage1 >= 1, 'page 1 : le relevé s\'écrit');
        var rS2 = fauxRes();
        await admFn(reqPage(cible.sku, { scan: '1' }), rS2, fauxAdmin, dbS);
        ok(dbS._compte.lecturesOv === 1,
          '⛔ BALAYAGE : deux pages scan=1 = UNE lecture de product_overrides ('
          + dbS._compte.lecturesOv + ') — sans cache, 67 pages ≈ 160 000 lectures et le quota meurt');
        /* La réponse DIT si le relevé a été réutilisé. Sans ce champ, « le cache
           a servi » resterait une supposition : il vit dans la mémoire d'UNE
           instance serverless, et une instance froide relit tout sans que rien
           ne le signale — le raccourci de l'user doit pouvoir le lire. */
        ok(rS1.out && rS1.out.scanCache === false && rS2.out && rS2.out.scanCache === true,
          '⛔ chaque page de balayage doit RENDRE `scanCache` (page 1 false, page 2 true) — '
          + 'sinon la réutilisation du relevé est invérifiable depuis le raccourci (obtenu : '
          + JSON.stringify([rS1.out && rS1.out.scanCache, rS2.out && rS2.out.scanCache]) + ')');
        ok((dbS._compte.ecrituresParId[cible.id] || 0) === ecritsPage1
          && rS2.out && rS2.out.counts && rS2.out.counts.unchanged === 1,
          '⛔ BALAYAGE : l\'écriture de la page 1 est VISIBLE page 2 — même prix revu = '
          + 'aucune ré-écriture (écrits: ' + (dbS._compte.ecrituresParId[cible.id] || 0)
          + ', page 2: ' + JSON.stringify(rS2.out && rS2.out.counts) + ')');

        ok(appelsLoadCatalog === 0,
          '⛔ BALAYAGE : le catalogue se fusionne sur le relevé du cache (loadCatalogAvec) — '
          + 'loadCatalog appelé ' + appelsLoadCatalog + ' fois, or chaque appel relit la '
          + 'collection entière en production');

        // ── Sans scan : relecture pleine à chaque appel (comportement historique) ──
        scanReset();
        var dbN = fauxDb({}, []);
        await admFn(reqPage(cible.sku, {}), fauxRes(), fauxAdmin, dbN);
        await admFn(reqPage(cible.sku, {}), fauxRes(), fauxAdmin, dbN);
        ok(dbN._compte.lecturesOv === 2,
          'sans &scan=1, relecture pleine à CHAQUE appel (' + dbN._compte.lecturesOv
          + ') — un relevé isolé garde la fraîcheur maximale');
        ok(appelsLoadCatalog === 2,
          'sans &scan=1, le catalogue fusionné passe toujours par loadCatalog ('
          + appelsLoadCatalog + '/2) — le comportement historique ne change pas');
        catMod.loadCatalog = vraiLoadCatalog;

        /* ── MODE À SEC (&sec=1) : ZÉRO FIRESTORE, ZÉRO ÉCRITURE ─────────────
           ⛔ Écrit après une faute réelle : mettre au point le câblage d'un
           raccourci a épuisé le quota gratuit de l'user et refermé son
           administration, alors qu'aucun de ces essais n'avait besoin de
           Firestore. La promesse « ce mode ne coûte rien » ne se croit pas :
           on la PROUVE avec une base qui EXPLOSE au premier contact — si le
           mode y touche, la porte devient rouge. */
        var dbInterdite = { collection: function (nom) {
          throw new Error('MODE A SEC : Firestore touche (' + nom + ')');
        } };
        /* ⚠️ La base factice NE SUFFIT PAS, et un sabotage me l'a prouvé :
           `catalog.loadCatalog()` a son PROPRE accès Firestore, invisible au
           `db` passé en paramètre — et sans clé d'environnement il rend {}
           sans rien toucher. La porte restait donc verte alors qu'en
           production ce chemin lit la collection entière. On espionne donc
           AUSSI l'appel lui-même : en mode à sec, il doit valoir ZÉRO. */
        var vraiLC = catMod.loadCatalog;
        var appelsLCsec = 0;
        catMod.loadCatalog = function () { appelsLCsec++; return vraiLC.apply(this, arguments); };
        var rSec = fauxRes();
        await admFn(reqPage(cible.sku, { sec: '1' }), rSec, fauxAdmin, dbInterdite);
        ok(appelsLCsec === 0,
          '⛔ MODE À SEC : loadCatalog ne doit JAMAIS être appelé (' + appelsLCsec
          + ') — en production il relit toute la collection d\'overrides, et c\'est '
          + 'exactement le coût que ce mode existe pour supprimer');
        ok(rSec.code === 200 && rSec.out && rSec.out.ok === true && rSec.out.sec === true,
          '⛔ MODE À SEC : doit répondre 200 SANS toucher Firestore — une base qui '
          + 'explose au contact prouve qu\'il n\'y accède jamais (obtenu : '
          + rSec.code + ', ' + JSON.stringify(rSec.out && rSec.out.error) + ')');
        ok(rSec.out && rSec.out.counts && rSec.out.counts.parsed >= 1
          && rSec.out.counts.reconnus >= 1 && rSec.out.format === 'idealo',
          'MODE À SEC : rend ce que le câblage doit prouver — format lu et articles '
          + 'reconnus (' + JSON.stringify(rSec.out && rSec.out.counts) + ')');
        ok(rSec.out && typeof rSec.out.note === 'string' && /sec/i.test(rSec.out.note)
          && rSec.out.applied === undefined && rSec.out.scanCache === undefined,
          '⛔ MODE À SEC : la réponse DIT qu\'elle n\'a rien calculé, et ne rend aucun '
          + 'prix appliqué — un mode d\'essai ne doit jamais ressembler à un vrai relevé');
        /* ⛔ COMBIEN LA PAGE EN CONTIENT, COMBIEN J'EN LIS (03/08/2026) ──────
           L'user a mesuré qu'une page affichant ~60 produits n'en rend qu'une
           vingtaine au relevé, toujours ceux du MILIEU. Sans le compte des
           réfs PRÉSENTES dans le texte, impossible de dire si c'est idealo qui
           tronque ou mon parseur qui rate — et supposer coûterait un coût
           d'achat faux. La réponse du mode à sec porte donc les deux. */
        ok(rSec.out && rSec.out.diagnostic
          && typeof rSec.out.diagnostic.refsMarque === 'number',
          '⛔ MODE À SEC : la réponse doit porter le DIAGNOSTIC de page — sans lui, '
          + '« la page contient-elle plus que ce que je lis ? » reste une supposition');
        ok(rSec.out && rSec.out.diagnostic
          && rSec.out.diagnostic.refsMarque >= rSec.out.counts.parsed,
          'réfs vues dans le texte au moins égales aux réfs lues ('
          + (rSec.out && rSec.out.diagnostic && rSec.out.diagnostic.refsMarque)
          + ' vues / ' + (rSec.out && rSec.out.counts.parsed) + ' lues) — c\'est '
          + 'l\'écart entre ces deux nombres qui dira où est le défaut');

        var rSecInc = fauxRes();
        await admFn(reqPage('ZZQ9997', { sec: '1' }), rSecInc, fauxAdmin, dbInterdite);
        /* ⛔ Le mode à sec doit MONTRER ce que le parseur a compris, pas
           seulement combien il a lu. Un extracteur qui se tromperait de type
           sur tout resterait invisible tant que le prix, lui, est bon — et
           l'user n'a que cette réponse JSON pour voir depuis son iPad. */
        var toutSec = (rSec.out.reconnus || []).concat(rSec.out.inconnus || []);
        ok(toutSec.length > 0 && toutSec.every(function (x) { return x.car && typeof x.car === 'object'; }),
          '⛔ chaque ligne du relevé à sec porte ses CARACTÉRISTIQUES (car) — sans '
          + 'quoi une erreur d\'extraction est indétectable depuis l\'iPad');
        ok(Array.isArray(rSec.out.sansRefDetail),
          'les annonces sans réf sûre sortent QUALIFIÉES (sansRefDetail), plus seulement comptées');

        /* ═══ L'ÉCART SE NOMME, IL NE SE SOUSTRAIT PAS (03/08/2026) ════════
           ⛔ J'ai annoncé à l'user « 11 références non lues » en soustrayant
           deux compteurs, sans jamais pouvoir dire LESQUELLES. Pire : le
           compteur `refsMarque` attrapait « DEWALT Vendu » et les suggestions
           de recherche (« dewalt tstak »), parce que le drapeau `i` rendait le
           motif de RÉFÉRENCE insensible à la casse. Un instrument de mesure ne
           surestime jamais. */
        ok(Array.isArray(rSec.out.refsNonLues),
          '⛔ la réponse NOMME les références que la page écrit et que le relevé '
          + 'n\'a pas rendues — un écart chiffré se suppose, un écart nommé se corrige');
        ok(rSec.out.refsNonLues.length === 0,
          '⛔ sur une page dont TOUTES les réfs sont lues, la liste est VIDE ('
          + JSON.stringify(rSec.out.refsNonLues) + ')');
        /* ⛔ PRÉALABLE : une liste toujours vide ne vérifierait rien. On
           fabrique une page où une réf est écrite SANS prix — le parseur ne
           peut donc pas la rendre — et on exige qu'elle soit NOMMÉE. */
        /* ⚠️ Au moins 200 signes : en dessous, le serveur refuse le corps AVANT
           d'analyser quoi que ce soit, et l'assertion testerait un refus. */
        var pageTrou = 'Tronçonneuses et accessoires — comparateur\n'
          + 'MAKITA ZZT001A\nVisseuse sans fil, couple 90 Nm, 1 batterie\n'
          + '12\n47 offres\nà partir de100,00 €\nDétails du produit\n'
          + 'MAKITA ZZT002B\nCarte volontairement SANS prix — le parseur ne peut pas la rendre\n'
          /* ⚠️ CE BLOC DE SUGGESTIONS EST LE CŒUR DU TEST. « makita zzt777x »
             en MINUSCULES porte un chiffre et fait quatre signes : seule la
             sensibilité à la casse le rejette. Un premier essai n'utilisait que
             « Vendu » et « 18v », tous deux écartés par d'autres règles — le
             sabotage restait vert et ne prouvait rien. */
          + 'Détails du produit\nrecherches associées : makita zzt777x, pack makita, makita 18v\n';
        var rTrou = fauxRes();
        // ⚠️ La marque se lit dans la REQUÊTE, pas dans le corps (comme reqPage).
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'MAKITA', source: 'idealo', sec: '1' },
          body: { text: pageTrou } }, rTrou, fauxAdmin, dbInterdite);
        ok(rTrou.out && rTrou.out.refsNonLues.indexOf('ZZT002B') !== -1,
          '⛔⛔ PRÉALABLE : une réf que la page écrit et que le relevé ne rend PAS '
          + 'est nommée. Sans ce cas, l\'assertion « liste vide » passerait pour la '
          + 'mauvaise raison — une liste toujours vide ne vérifie rien ('
          + JSON.stringify(rTrou.out && rTrou.out.refsNonLues) + ')');
        ok(rTrou.out.refsNonLues.indexOf('ZZT001A') === -1,
          'et la réf LUE, elle, n\'est pas dans la liste');
        ok(rTrou.out.diagnostic.refsVues.indexOf('ZZT777X') === -1,
          '⛔⛔ UNE SUGGESTION DE RECHERCHE N\'EST PAS UNE RÉFÉRENCE. « makita '
          + 'zzt777x » en minuscules porte un chiffre et fait quatre signes : '
          + 'seule la CASSE le distingue d\'une vraie réf. Avec le drapeau `i`, '
          + 'ces suggestions gonflaient le compteur — et c\'est ce compteur '
          + 'gonflé qui m\'a fait annoncer « 11 références non lues » ('
          + JSON.stringify(rTrou.out.diagnostic.refsVues) + ')');
        ok(rTrou.out.diagnostic.refsVues.indexOf('ZZT001A') !== -1,
          'préalable : une VRAIE référence, elle, est bien comptée — sans quoi '
          + 'l\'assertion ci-dessus passerait sur un compteur toujours vide');

        /* ═══ COUVERTURE D'UN BALAYAGE (03/08/2026) ════════════════════════
           Demande de l'user : « il faut arriver à scanner tout le catalogue
           DeWALT ». ⛔ Un total obtenu en MULTIPLIANT les pages par le rendu
           d'une page ne vaut rien : les pages d'un comparateur peuvent se
           chevaucher. Seul le cumul des réfs DISTINCTES répond.
           On rejoue donc la MÊME page deux fois : le cumul doit compter deux
           pages mais PAS deux fois les mêmes articles. */
        ok(rSec.out.couverture && typeof rSec.out.couverture.refsDistinctes === 'number',
          'le mode à sec rend la COUVERTURE cumulée — c\'est ce qui permet de mesurer '
          + 'les 67 pages sans dépenser un seul quota');
        /* ⚠️ DEUX APPELS ADJACENTS, ici et pas ailleurs. Une première version
           comparait `rSec` à un appel plus loin — un troisième appel s'était
           glissé entre les deux, et l'assertion mesurait autre chose que ce
           qu'elle annonçait. Le cumul est un état partagé : on ne compare que
           des relevés qui se suivent VRAIMENT. */
        var rC1 = fauxRes();
        await admFn(reqPage(cible.sku, { sec: '1' }), rC1, fauxAdmin, dbInterdite);
        var rC2 = fauxRes();
        await admFn(reqPage(cible.sku, { sec: '1' }), rC2, fauxAdmin, dbInterdite);
        var couvAvant = rC1.out.couverture, couvApres = rC2.out.couverture;
        ok(couvApres.pagesDansLaRafale === couvAvant.pagesDansLaRafale + 1,
          '⚠️ le compte de PAGES avance à chaque appel — s\'il retombe à 1 en plein '
          + 'balayage, c\'est une instance froide, et ça doit SE VOIR');
        ok(couvApres.refsDistinctes === couvAvant.refsDistinctes,
          '⛔⛔ LA MÊME PAGE DEUX FOIS N\'AJOUTE AUCUNE RÉFÉRENCE : le cumul compte des '
          + 'articles DISTINCTS. Sans ça, « 67 pages balayées » pourrait annoncer 67 × 25 '
          + 'articles là où le comparateur en répète la moitié — et l\'user croirait avoir '
          + 'couvert un catalogue qu\'il n\'a pas couvert (' + couvApres.refsDistinctes + ')');
        ok(couvApres.refsDistinctes > 0,
          'préalable : le cumul compte VRAIMENT quelque chose — sans lui, l\'égalité '
          + 'ci-dessus serait vraie entre deux zéros');
        ok(rSecInc.out && rSecInc.out.counts.reconnus === 0 && rSecInc.out.counts.inconnus === 1,
          'MODE À SEC : une réf absente du catalogue est comptée INCONNUE, pas reconnue ('
          + JSON.stringify(rSecInc.out && rSecInc.out.counts) + ')');
        catMod.loadCatalog = vraiLC;

        /* ── BALAYAGE : LES COMPTEURS SANS LES LISTES ────────────────────────
           67 pages × listes détaillées ≈ un Mo dans le presse-papier du
           raccourci : incollable, donc invérifiable par l'user. En scan les
           listes sortent vides — mais ⛔ AUCUN chiffre ne disparaît, et la
           réponse DIT où retrouver le détail (`note`). Sans cette égalité des
           compteurs, alléger reviendrait à effacer des inconnues en silence.
           ⛔ Réf témoin SYNTHÉTIQUE, et son absence est un PRÉALABLE vérifié :
           un harnais ne nomme jamais une donnée du catalogue. */
        var refInconnue = 'ZZQ9998';
        ok(!prods.some(function (p) {
          return String(p.sku || '').toUpperCase().indexOf(refInconnue) !== -1;
        }), 'préalable : la réf témoin n\'est ni au catalogue ni racine d\'un alias');
        scanReset();
        var rL1 = fauxRes();
        await admFn(reqPage(refInconnue, {}), rL1, fauxAdmin, fauxDb({}, []));
        ok(rL1.out && rL1.out.counts.unknown === 1 && rL1.out.unknown.length === 1
          && rL1.out.note === undefined,
          'hors balayage, la liste `unknown` sort ENTIÈRE (c\'est elle qui nourrit '
          + 'l\'importateur) — obtenu : ' + JSON.stringify(rL1.out && rL1.out.unknown));
        scanReset();
        var rL2 = fauxRes();
        await admFn(reqPage(refInconnue, { scan: '1' }), rL2, fauxAdmin, fauxDb({}, []));
        ok(rL2.out && rL2.out.counts.unknown === 1 && rL2.out.unknown.length === 0
          && typeof rL2.out.note === 'string' && /sans\s+&scan=1/i.test(rL2.out.note),
          '⛔ en balayage, la liste part mais le COMPTEUR reste exact, et la réponse '
          + 'dit où retrouver le détail — sinon une réf inconnue disparaît en silence '
          + '(compteur: ' + (rL2.out && rL2.out.counts.unknown) + ', liste: '
          + (rL2.out && rL2.out.unknown.length) + ', note: ' + (rL2.out && !!rL2.out.note) + ')');
        ok(rL2.out && Array.isArray(rL2.out.applied),
          '⛔ `applied` reste rendu en balayage : c\'est la liste des prix qui bougent, '
          + 'donc de l\'argent — jamais masquée pour raccourcir une réponse');

        /* ── UN PLANTAGE MUET EST UN MUR (02/08/2026, 3ᵉ fois) ───────────────
           « price-watch failed » ne disait ni quelle opération, ni quel objet :
           un aller-retour entier avec l'user pour une information que le
           serveur tenait déjà. ⛔ Mais la PILE ne sort jamais vers le client :
           elle renseignerait sur la structure du serveur (compromis d'E-111).
           Réf témoin SYNTHÉTIQUE, base factice qui jette à la 1ʳᵉ lecture. */
        var dbBoom = { collection: function () { throw new Error('ZZBOOM-TEMOIN-DE-PORTE'); } };
        var rBoom = fauxRes();
        await admFn(reqPage(refInconnue, {}), rBoom, fauxAdmin, dbBoom);
        ok(rBoom.code === 500 && rBoom.out && /ZZBOOM-TEMOIN-DE-PORTE/.test(String(rBoom.out.error)),
          '⛔ un plantage du traqueur doit NOMMER son erreur — sinon le diagnostic '
          + 'passe par l\'user (obtenu : ' + JSON.stringify(rBoom.out) + ')');
        ok(rBoom.out && String(rBoom.out.error).length <= 220
          && !/\n/.test(String(rBoom.out.error))
          && !/\bat\s+\S+\s*\(/.test(String(rBoom.out.error)),
          '⛔ SÉCURITÉ : la réponse d\'erreur ne rend JAMAIS la pile d\'appels, et reste '
          + 'bornée — le journal serveur la garde, le client non');

        // ── J4 : l'ancien prix barré = MINIMUM 30 j du journal ──
        scanReset();
        var maintenant = Date.now();
        var minJournal = Math.round((rec0.newPrice + 10) * 100) / 100;
        var seedOvP = {}; seedOvP[cible.id] = { price: courantHaut };
        var dbP = fauxDb(seedOvP, [
          { id: cible.id, at: maintenant - 5 * 86400000, oldPrice: minJournal, newPrice: minJournal + 10 },
          { id: cible.id, at: maintenant - 40 * 86400000, oldPrice: rec0.newPrice - 50, newPrice: rec0.newPrice - 50 },
          { id: 'fiche-etrangere', at: maintenant - 2 * 86400000, oldPrice: 1, newPrice: 1 }
        ]);
        var rP = fauxRes();
        await admFn(reqPage(cible.sku, {}), rP, fauxAdmin, dbP);
        ok(rP.out && rP.out.ok === true && rP.out.counts.applied === 1, 'préalable promo : baisse appliquée');
        var patchP = dbP._compte.patchsParId[cible.id];
        ok(!!(patchP && patchP.promoAncienPrix != null
          && Math.abs(patchP.promoAncienPrix - minJournal) < 0.01),
          '⛔ J4 : promoAncienPrix doit être le MINIMUM 30 j du journal (' + minJournal
          + '), pas le prix courant (' + courantHaut + '), et JAMAIS une entrée hors fenêtre '
          + 'ou d\'une autre fiche — obtenu : ' + (patchP && patchP.promoAncienPrix)
          + '. L\'ancien calcul (sentinel - 30 j = NaN) ne trouvait jamais le journal.');

        // ── J4 : prix remonté puis rebaissé — rien de nouveau → PAS de promo ──
        var seedOvE = {}; seedOvE[cible.id] = { price: courantHaut };
        var dbE = fauxDb(seedOvE, [
          { id: cible.id, at: maintenant - 3 * 86400000, oldPrice: rec0.newPrice - 5, newPrice: rec0.newPrice - 5 }
        ]);
        var rE = fauxRes();
        await admFn(reqPage(cible.sku, {}), rE, fauxAdmin, dbE);
        var patchE = dbE._compte.patchsParId[cible.id];
        ok(rE.out && rE.out.counts.applied === 1 && !!patchE
          && patchE.promoDepuis == null && patchE.promoAncienPrix == null,
          'J4 : le journal 30 j contient déjà MOINS cher → pas de promo (rien de nouveau '
          + 'n\'est offert) — obtenu : ' + (patchE && JSON.stringify({ d: patchE.promoDepuis, a: patchE.promoAncienPrix })));
      }
    }

    // Les TROIS écrivains (rupture, inchangé, appliqué) répercutent leur patch
    // dans le relevé local — sans ça, un doublon inter-pages réécrit à l'infini.
    var nbMaj = (adminSrc.match(/if \(scanMode\) pwMajLocale\(ovW, p\.id, patch[RUA], nowMs\);/g) || []).length;
    ok(nbMaj === 3, 'les trois écrivains du traqueur répercutent leur patch en local (' + nbMaj + '/3)');

    // pwMajLocale = même sémantique que set(merge:true), carte comprise (E-227 local).
    var maj = adm._internals.pwMajLocale;
    ok(typeof maj === 'function', 'pwMajLocale exposée aux portes');
    if (maj) {
      var carte = { f1: { priceSources: { cotebrico: { ttc: 100, at: 5 } }, autre: 1 } };
      maj(carte, 'f1', { priceSources: { idealo: { ttc: 90, at: 6, enStock: true } }, priceSrcTTC: 90 }, 777);
      ok(carte.f1.priceSources.cotebrico && carte.f1.priceSources.cotebrico.ttc === 100
        && carte.f1.priceSources.idealo && carte.f1.priceSources.idealo.ttc === 90
        && carte.f1.priceCheckedAt === 777 && carte.f1.autre === 1 && carte.f1.priceSrcTTC === 90,
        'pwMajLocale fusionne comme set(merge:true) : les AUTRES sources de la carte survivent '
        + '(sinon E-227 en local) et priceCheckedAt devient un NOMBRE');
    }
  }

  /* ═══ PROMO AFFICHÉE : promoDepuis est un TIMESTAMP à la relecture ════════
     Écrit en serverTimestamp par le traqueur → relu de Firestore en objet
     Timestamp. `Number(Timestamp)` = NaN : `promoActive` restait FAUX pour
     toujours et l'étiquette promo ne s'est JAMAIS affichée (même mécanisme
     que E-228). L'expiration à 2 mois (J4) doit marcher dans les DEUX sens. */
  var cat = require('../api/_lib/catalog.js');
  var ap = cat._internals && cat._internals.applyOverrides;
  ok(typeof ap === 'function', 'applyOverrides exposée aux portes');
  if (ap) {
    var fichesT = [{ id: 'x1', price: 100 }];
    var m1 = ap(fichesT, { x1: { promoDepuis: { toMillis: function () { return Date.now() - 86400000; } }, promoAncienPrix: 120 } })[0];
    ok(!!(m1 && m1.promoActive === true),
      '⛔ promoDepuis relu de Firestore est un TIMESTAMP : sans enMillis, Number() = NaN '
      + 'et la promo ne s\'affiche JAMAIS (obtenu promoActive=' + (m1 && m1.promoActive) + ')');
    var m2 = ap(fichesT, { x1: { promoDepuis: { toMillis: function () { return Date.now() - 61 * 86400000; } }, promoAncienPrix: 120 } })[0];
    ok(!!(m2 && m2.promoActive === false && m2.promoAncienPrix == null),
      'au-delà de 2 mois au même prix, la promo EXPIRE à la lecture (J4), Timestamp compris');
  }

  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-price-watch OK');
  }, function (err) { console.error('  ❌ [check-price-watch] harnais mort : ' + err.message); process.exit(1); });
}
