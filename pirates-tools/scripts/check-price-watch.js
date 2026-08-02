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
    var pageI = [
      'Tronçonneuses',
      'MAKITA ZZI805',
      'Perceuse-visseuse à percussion sans fil, Couple max. 90 Nm',
      '5', '94 offres', 'à partir de118,86 €',
      'MAKITA ZZI922N-XJ',
      'Visseuse à choc sans fil', '35', '14 offres', 'à partir de 1 132,43 €',
      'MAKITA ZZISANSPRIX9',
      'Carte sans prix (rupture de flux)',
      'MAKITA ZZI850',
      'Visseuse compacte', '12', '27 offres', 'à partir de99,00 €',
      'Produits favoris', 'Smartphone 5G', 'Apple iPhone 17',
      '168', 'à partir de', '774,99 €'
    ].join('\n');
    var ri = pi(pageI, 'MAKITA');
    var iSku = {}; ri.forEach(function (x) { iSku[x.sku] = x; });
    ok(ri.length === 3, 'trois cartes à prix lues (' + ri.length + ')');
    ok(iSku.ZZI805 && iSku.ZZI805.price === 118.86,
      'prix COLLÉ à « de » lu quand même (à partir de118,86)');
    ok(iSku['ZZI922N-XJ'] && iSku['ZZI922N-XJ'].price === 1132.43,
      'prix à espace de milliers lu (1 132,43)');
    ok(!iSku.ZZISANSPRIX9 && iSku.ZZI850 && iSku.ZZI850.price === 99.00,
      '⛔ une carte SANS prix ne vole JAMAIS le prix de la carte suivante '
      + '(la fenêtre s\'arrête au titre suivant)');
    ok(ri.every(function (x) { return x.price !== 774.99; }),
      '⛔ un « à partir de » orphelin (bloc favoris, téléphones) n\'est attribué à rien');
    ok(ri.every(function (x) { return x.promo === false && x.enStock === null; }),
      'comparateur : jamais de promo ni de stock inventés');
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
