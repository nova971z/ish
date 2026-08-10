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

/* ⛔⛔ UNE OFFRE SE CHERCHE DANS LES DEUX SEAUX, DEPUIS LE 04/08/2026.
   Le parseur PROMEUT désormais une offre marchande dont le titre nomme une
   seule référence sûre : elle part alors dans `items` au lieu de `sansRef`.
   L'INVARIANT DÉFENDU N'A PAS CHANGÉ — chaque prix reste attaché à SON propre
   titre, et aucune annonce ne disparaît. Ce qui change, c'est le seau
   d'arrivée. Chercher dans un seul revenait à tester l'ancien aiguillage
   plutôt que la propriété : douze assertions ont rougi pour cette seule
   raison, et elles avaient raison de rougir.
   ⚠️ On ne relâche RIEN : les deux listes sont réunies sous une forme commune
   {titre, prix}, donc une annonce réellement perdue reste introuvable. */
function toutesOffres(r) {
  var a = (r && r.sansRef ? r.sansRef : []).map(function (x) {
    return { titre: x.titre, prix: x.prix, ou: 'sansRef' };
  });
  var b = (r && r.items ? r.items : []).map(function (x) {
    return { titre: x.name, prix: x.price, ou: 'items' };
  });
  return a.concat(b);
}

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
  /* ⛔ LE SLUG DE LA SOURCE EN SERVICE SE LIT À L'EXÉCUTION, JAMAIS RECOPIÉ
     (règle des harnais : un seuil recopié se périme). Il vit dans
     `SOURCES_ACTIVES` (D-022) : le jour où l'user change de traqueur, tout ce
     fichier suit au lieu de rougir pour une raison qui n'est pas la sienne. */
  var SRC_ACT = Object.keys(pp.SOURCES_ACTIVES || {})[0];
  var SRC_RETIRE = 'zz-traqueur-retire';     // synthétique : jamais un slug réel
  var choisir = pp.choisirCoutSource;
  ok(typeof choisir === 'function', 'choisirCoutSource exportée');
  var NOW = 1700000000000, J = 24 * 3600 * 1000;
  if (choisir) {
    /* ⚠️ LOGIQUE PURE DU MINIMUM — CONFIG INJECTÉE (D-022, 09/08/2026).
       Ces assertions éprouvent le CHOIX (moins cher · rupture · péremption),
       pas la liste des traqueurs en service. Elles nommaient deux sources
       aujourd'hui retirées : elles seraient devenues rouges pour une raison
       qui n'est pas la leur. On leur injecte donc leurs propres sources —
       exactement comme le modèle de prix reçoit sa config. La règle de
       production, elle, est éprouvée juste en dessous, SANS injection. */
    var ACTIFS = Object.keys(pp.SOURCES_ACTIVES || {});
    ok(ACTIFS.length >= 1,
      '⛔ PRÉALABLE : au moins une source de coût est ACTIVE — sinon aucun prix ne '
      + 'pourrait se calculer, et rien de ce qui suit ne prouverait quoi que ce soit');
    var ACT = SRC_ACT;
    var DEUX = { unSite: 1, autreSite: 1 };     // synthétiques, jamais des slugs réels
    var deux = { unSite: { ttc: 200, at: NOW - J }, autreSite: { ttc: 180, at: NOW - J } };
    var c1 = choisir(deux, NOW, null, DEUX);
    ok(c1 && c1.ttc === 180 && c1.source === 'autreSite',
      'deux traqueurs → le MOINS CHER gagne, quel que soit son nom (' + JSON.stringify(c1) + ')');
    var c2 = choisir({ unSite: { ttc: 150, at: NOW - J, enStock: false }, autreSite: { ttc: 180, at: NOW - J } }, NOW, null, DEUX);
    ok(c2 && c2.ttc === 180,
      '⛔ une source EN RUPTURE ne compte pas, même moins chère : on ne peut pas y acheter (' + JSON.stringify(c2) + ')');
    var c3 = choisir({ unSite: { ttc: 150, at: NOW - 20 * J }, autreSite: { ttc: 180, at: NOW - J } }, NOW, null, DEUX);
    ok(c3 && c3.ttc === 180,
      'une source PÉRIMÉE (> 14 j) ne compte pas : le produit a quitté sa page (' + JSON.stringify(c3) + ')');
    ok(choisir({ unSite: { ttc: 150, at: NOW - J, enStock: false } }, NOW, null, DEUX) === null,
      'AUCUNE source achetable → null : le produit doit être GELÉ, jamais recalculé');
    ok(choisir(null, NOW) === null && choisir({}, NOW) === null, 'carte absente ou vide → null, sans planter');

    /* ⛔⛔ ARGENT — UNE SOURCE RETIRÉE NE FIXE PLUS AUCUN PRIX (D-022,
       09/08/2026). Décision de l'user, ses mots du 03/08 : « au final on ne
       gardera qu'un seul traqueur, celui d'idealo, et ça pour toutes les
       marques ». Elle n'était appliquée NULLE PART dans le calcul du coût : le
       coût étant le MINIMUM des sources fraîches, le relevé d'un traqueur
       abandonné restait GAGNANT jusqu'à sa péremption — c'est le défaut exact
       signalé en D-58 (44,00 € contre 119,32 € sur le même article). */
    var RETIRE = SRC_RETIRE;
    var dMixte = {}; dMixte[RETIRE] = { ttc: 44, at: NOW - J }; dMixte[ACT] = { ttc: 119.32, at: NOW - J };
    var cRet = choisir(dMixte, NOW);
    ok(cRet && cRet.source === ACT && cRet.ttc === 119.32,
      '⛔⛔ ARGENT : le relevé d\'un traqueur RETIRÉ ne devient jamais le coût, même '
      + 'moins cher — un coût faux fabrique un prix faux (' + JSON.stringify(cRet) + ')');
    var dSeul = {}; dSeul[RETIRE] = { ttc: 44, at: NOW - J };
    ok(choisir(dSeul, NOW) === null,
      '⛔ et quand la source retirée est la SEULE, il n\'y a pas de coût : le produit '
      + 'est GELÉ, jamais tarifé sur une source hors service');
    /* ⛔ …ET LA RAISON DU GEL DOIT ÊTRE VRAIE. « rupture » enverrait chercher
       chez le fournisseur un problème qui n'existe pas (défaut déjà payé une
       fois, sur « rupture » vs « perime »). */
    ok(pp.raisonAucuneSource(dSeul, NOW) === 'source-retiree',
      '⛔ la raison du gel nomme le VRAI motif — ni rupture, ni péremption ('
      + JSON.stringify(pp.raisonAucuneSource(dSeul, NOW)) + ')');
    /* ⚠️ PRÉALABLE — les deux autres raisons continuent de se dire, sinon la
       nouvelle aurait pu toutes les avaler sans qu'on le voie. */
    var dRup2 = {}; dRup2[ACT] = { ttc: 150, at: NOW - J, enStock: false };
    var dPer2 = {}; dPer2[ACT] = { ttc: 150, at: NOW - 20 * J };
    ok(pp.raisonAucuneSource(dRup2, NOW) === 'rupture'
      && pp.raisonAucuneSource(dPer2, NOW) === 'perime',
      '⚠️ PRÉALABLE : « rupture » et « perime » restent distinctes ('
      + pp.raisonAucuneSource(dRup2, NOW) + ' / ' + pp.raisonAucuneSource(dPer2, NOW) + ')');

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
    /* ⚠️ CES QUATRE-LÀ NOMMAIENT DEUX TRAQUEURS AUJOURD'HUI RETIRÉS (D-022) :
       elles seraient devenues rouges pour une raison qui n'est pas la leur.
       Elles gardent leur sujet — la FRAÎCHEUR et le format d'horodatage — sur
       la source en service, lue à l'exécution. */
    var ACT2 = ACT, SEC = ACTIFS[1] || (ACT + '-bis');
    var d25 = {}; d25[ACT2] = { ttc: 126.72, at: NOW - J }; d25[SEC] = { ttc: 119.90, at: NOW - J };
    var r25 = choisir(d25, NOW);
    ok(r25 && r25.ttc === (ACTIFS.length > 1 ? 119.90 : 126.72),
      '⛔ RÉGRESSION D25033K : des sources datées en ms → le MOINS CHER des sources '
      + 'EN SERVICE gagne vraiment (' + JSON.stringify(r25) + ')');
    var d25b = {}; d25b[ACT2] = { ttc: 126.72, at: NOW - J }; d25b[SEC] = { ttc: 119.90, at: {} };
    var r25b = choisir(d25b, NOW);
    ok(r25b && r25b.ttc === 126.72,
      'une entrée dont le `at` n\'est pas datable est ÉCARTÉE — c\'est le bogue sentinel rendu visible');
    var d25n = {}; d25n[ACT2] = { ttc: 126.72, at: NOW - J };
    ok(choisir(d25n, {}) === null,
      'un « maintenant » non numérique ne date rien → null, jamais un choix au hasard');
    var d25c = {}; d25c[ACT2] = { ttc: 126.72, at: { toMillis: function () { return NOW - J; } } };
    var r25c = choisir(d25c, NOW);
    ok(r25c && r25c.ttc === 126.72,
      'une carte RELUE de Firestore (at = Timestamp) reste fraîche — fin du gel fantôme au recalcul');
  }
  // Branchement réel : l'arithmétique de fraîcheur reçoit des NOMBRES.
  var adminSrcMs = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  /* ⚠️ Le NOM de la variable de coût n'est pas le sujet — il a changé le 03/08
     quand le minimum de rafale est arrivé (`src` → `srcRetenu`), et ce contrôle
     est devenu rouge pour une raison qui n'était pas la sienne. Ce qu'il garde,
     c'est la DATATION EN MILLISECONDES. Un harnais ne s'ancre pas sur une
     écriture exacte quand l'invariant est ailleurs. */
  ok(/srcsMaj\[sourceSlug\] = \{ ttc: \w+, at: nowMs, enStock: true \}/.test(adminSrcMs)
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
  /* ⛔ TÊTES DE RÉFÉRENCES MULTI-MARQUES (09/08/2026, plan Makita) : l'union
     TETES_CONNUES doit couvrir CHAQUE marque traquée — une marque absente, et
     ses réfs à tiret sans chiffre sont perdues en silence. On vérifie une tête
     de chaque table (DCB = DeWALT batteries ; DTW = Makita boulonneuses,
     32 fiches mesurées au catalogue). */
  /* ⛔ PERFORMANCE DU BALAYAGE (09/08/2026, remonté par l'user) : le snapshot
     NE s'écrit PAS produit par produit dans la boucle — 60 écritures sur 4
     documents contendaient et ralentissaient le traqueur. La boucle accumule
     (snapPage.push) et une SEULE maj groupée (majSnapshotBatch) suit. On lit la
     source d'admin.js : aucune ligne du corps de boucle ne doit contenir la
     forme mono `snapshotLib.majSnapshot(` — seulement `majSnapshotBatch`. */
  var admSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  var boucle = admSrc.slice(admSrc.indexOf('for (const item of parsed) {'),
    admSrc.indexOf('if (!dryRun && applied.length) catalog.invalidateOverrides();'));
  ok(boucle && boucle.indexOf('for (const item of parsed) {') !== -1,
    'préalable : la boucle de balayage est repérée dans admin.js');
  ok(boucle.indexOf('snapshotLib.majSnapshot(') === -1 && /snapPage\.push\(/.test(boucle),
    '⛔ le balayage n\'écrit PLUS le snapshot par produit (contention 4 docs) — il accumule (snapPage.push) '
    + 'et une seule maj groupée suit la boucle');
  ok(/snapshotLib\.majSnapshotBatch\(db, admin, snapPage\)/.test(admSrc),
    '⛔ …et la maj groupée (≤4 écritures/page) est bien appelée après la boucle');

  var tetes = pp.nomenclature && pp.nomenclature.TETES_CONNUES;
  ok(!!(tetes && tetes.DCB && tetes.DTW),
    '⛔ TETES_CONNUES couvre DeWALT (DCB) ET Makita (DTW) — obtenu : '
    + JSON.stringify(tetes ? { DCB: !!tetes.DCB, DTW: !!tetes.DTW } : null));

  var pw = adm._internals && adm._internals.pwSourceCost;
  ok(typeof pw === 'function', 'pwSourceCost exposée aux portes via _internals');
  if (pw) {
    /* ⛔ TR-007 (mise en réel idealo, 08/08/2026) : un coût relevé sur idealo —
       la source LIVE — doit être reconnu comme RÉEL, exactement comme cotebrico.
       Sans ça, `estSourceRelevee` le requalifierait en estimation : le coût idealo
       ne sèmerait pas la variante jumelle et le prix affiché dériverait. Format
       hérité (priceSource/priceSrcTTC/priceCheckedAt sans carte priceSources). */
    var idealoReel = pw({}, { priceSource: 'idealo', priceSrcTTC: 150, priceCheckedAt: Date.now() }, {}, null);
    ok(idealoReel && idealoReel.origin === 'traqueur' && idealoReel.srcTTC === 150,
      '⛔ un coût relevé sur idealo est un coût RÉEL (origin traqueur), pas une estimation (' + JSON.stringify(idealoReel) + ')');
    var gelSrc = {}; gelSrc[SRC_ACT] = { ttc: 200, at: Date.now(), enStock: false };
    var gel = pw({}, { priceSources: gelSrc }, {}, null);
    ok(gel && gel.origin === 'rupture' && gel.srcTTC === null,
      '⛔ relevés présents mais AUCUN achetable → origin \'rupture\', prix GELÉ (' + JSON.stringify(gel) + ')');
    /* ═══ RUPTURE ≠ PÉRIMÉ (03/08/2026) ═══════════════════════════════════
       ⛔ Défaut nommé par l'user : « les articles sur ces pages peuvent
       changer chaque jour, mais l'URL reste la bonne ». Sa liste est triée
       par prix ; les prix bougent ; un article sort de la fenêtre balayée
       sans que le fournisseur ait cessé de le vendre. Au bout de 14 jours
       son relevé se périme et le produit est GELÉ — c'est juste. Mais on
       l'appelait « rupture », ce qui envoie chercher un problème de stock
       là où il n'y en a pas. Le gel ne change PAS ; la raison devient vraie. */
    var vieux = Date.now() - (pp.SOURCE_FRESH_MS + 24 * 3600 * 1000);
    var perSrc = {}; perSrc[SRC_ACT] = { ttc: 200, at: vieux, enStock: true };
    var per = pw({}, { priceSources: perSrc }, {}, null);
    ok(per && per.srcTTC === null,
      '⛔ ARGENT INCHANGÉ : un relevé plus vieux que la fenêtre de fraîcheur ne '
      + 'sert plus de coût — le produit reste GELÉ (' + JSON.stringify(per) + ')');
    ok(per && per.origin === 'perime' && per.raisonGel === 'perime',
      '⛔ …mais la raison dit « perime », PAS « rupture » : l\'article a quitté la '
      + 'fenêtre de prix balayée, le fournisseur le vend peut-être toujours. Un '
      + 'diagnostic faux fait chercher au mauvais endroit');
    ok(gel && gel.raisonGel === 'rupture',
      'préalable : une VRAIE rupture (hors stock explicite) dit toujours « rupture » '
      + '— sans quoi la distinction ci-dessus n\'en serait pas une');
    /* ⛔ LES DEUX RAISONS GÈLENT, ET LE RECALCUL DOIT LES ATTRAPER TOUTES LES
       DEUX. Tant que la condition vivait en ligne dans le recalcul, oublier
       « perime » faisait tomber le produit dans « coût source inconnu » : gelé
       quand même, mais DISPARU du rapport — et aucun sabotage ne mordait. */
    var estGel = adm._internals && adm._internals.pwEstGel;
    ok(typeof estGel === 'function', 'la décision de gel est une fonction UNIQUE, testable');
    if (estGel) {
      ok(estGel('rupture') === true && estGel('perime') === true,
        '⛔ les DEUX raisons de gel sont attrapées par le recalcul');
      ok(estGel('traqueur') === false && estGel('estimé') === false && estGel(undefined) === false,
        'préalable : un coût normal n\'est PAS gelé — sinon plus rien ne serait recalculé');
    }

    /* ⚠️ « mixte » exige DEUX entrées en service : avec une seule source
       active, les deux causes se portent sur la même carte à des dates
       différentes — impossible. On éprouve donc la fonction PURE, qui est
       l'endroit où la règle vit (l'admin ne fait que la relayer). */
    var mixteCarte = { unSite: { ttc: 200, at: Date.now(), enStock: false },
      autreSite: { ttc: 180, at: vieux, enStock: true } };
    var mixte = { raisonGel: pp.raisonAucuneSource(mixteCarte, Date.now(), null, { unSite: 1, autreSite: 1 }),
      srcTTC: pp.choisirCoutSource(mixteCarte, Date.now(), null, { unSite: 1, autreSite: 1 }) };
    ok(mixte && mixte.srcTTC === null && mixte.raisonGel === 'mixte',
      'les deux causes à la fois se disent « mixte », jamais l\'une des deux au hasard');

    var d2Src = {}; d2Src[SRC_ACT] = { ttc: 180, at: Date.now() }; d2Src[SRC_RETIRE] = { ttc: 200, at: Date.now() };
    var deux2 = pw({}, { priceSources: d2Src }, {}, null);
    ok(deux2 && deux2.srcTTC === 180 && deux2.origin === 'traqueur',
      'le recalcul lit le MIN multi-sources (' + JSON.stringify(deux2) + ')');
    var her = pw({}, { priceSource: SRC_ACT, priceSrcTTC: 150 }, {}, null);
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
      var f1 = fus({ priceSource: SRC_ACT, priceSrcTTC: 200, priceCheckedAt: T });
      ok(f1[SRC_ACT] && f1[SRC_ACT].ttc === 200 && f1[SRC_ACT].at === T,
        'l\'héritage MARQUÉ d\'une source entre dans la carte fusionnée');
      ok(!fus({ priceSrcTTC: 200, priceCheckedAt: T })[SRC_ACT],
        '⛔ un coût SANS marque de source (ex. estimé) ne se ressème JAMAIS');
      var carteExistante = {}; carteExistante[SRC_ACT] = { ttc: 180, at: T };
      ok(fus({ priceSource: SRC_ACT, priceSrcTTC: 200, priceCheckedAt: T,
        priceSources: carteExistante })[SRC_ACT].ttc === 180,
        'une entrée de carte existante n\'est jamais écrasée par l\'héritage');
      /* ⚠️ REBASÉ SUR LA SOURCE EN SERVICE (D-022) : l'ancienne version opposait
         deux traqueurs aujourd'hui retirés, dont plus AUCUN ne peut fixer un
         coût — elle serait rouge pour une raison qui n'est pas la sienne. Le
         défaut qu'elle garde est intact : une carte fraîche PLUS CHÈRE ne doit
         pas effacer un héritage MOINS CHER de la même source, sinon on
         fabrique une hausse qui n'a jamais eu lieu (E-227). */
      /* ⚠️ REBASÉ (D-022) — et le scénario a CHANGÉ DE SENS, il faut le dire.
         E-227 opposait la carte d'un traqueur à l'héritage d'un AUTRE : le min
         des deux évitait une hausse fantôme. Aujourd'hui l'autre est RETIRÉ,
         donc son relevé ne compte plus — la « hausse » n'en est plus une, c'est
         l'abandon d'un coût auquel on ne peut plus s'approvisionner.
         ⛔ Ce qui reste à garder, et qui est éprouvé ici : (1) le RESSEMAGE de
         l'héritage marche toujours, (2) le min se prend bien sur les sources
         EN SERVICE. On l'éprouve sur les fonctions pures, avec deux sources
         injectées — l'admin ne fait que les relayer. */
      /* ⚠️ E-227 A CHANGÉ DE FORME, ET ON LE DIT PLUTÔT QUE DE LE MIMER.
         Le défaut opposait la carte d'un traqueur à l'héritage d'un AUTRE : le
         min des deux évitait une hausse fantôme (+136 % mesurés le 01/08). Le
         ressemage exige une source RECONNUE (`estSourceRelevee`), et depuis
         D-022 une seule est EN SERVICE : le scénario à deux traqueurs ne peut
         plus se produire en production. Ce qui doit rester vrai se teste donc
         en trois invariants séparés — le ressemage (ci-dessus), le minimum
         (fonction pure, config injectée, plus haut), et la règle d'argent
         ci-dessous. Fabriquer un faux scénario à deux traqueurs pour garder
         l'assertion « telle quelle » aurait été un harnais qui se rassure. */
      var carteAct2 = {}; carteAct2[SRC_ACT] = { ttc: 389, at: T };
      var herFrais = pw({}, { priceSources: carteAct2,
        priceSource: SRC_ACT, priceSrcTTC: 200, priceCheckedAt: T }, {}, null);
      ok(herFrais && herFrais.srcTTC === 389,
        '⛔ carte et héritage de la MÊME source : la carte (relevé le plus récent) '
        + 'fait foi, l\'héritage ne l\'écrase pas (' + JSON.stringify(herFrais) + ')');
      /* ⛔⛔ ET LA RÈGLE DE PRODUCTION, SANS INJECTION : un héritage venu d'une
         source RETIRÉE ne tire plus le prix vers le bas, même moins cher. */
      var carteAct = {}; carteAct[SRC_ACT] = { ttc: 389, at: T };
      var herRetire = pw({}, { priceSources: carteAct,
        priceSource: SRC_RETIRE, priceSrcTTC: 200, priceCheckedAt: T }, {}, null);
      ok(herRetire && herRetire.srcTTC === 389,
        '⛔⛔ ARGENT : l\'héritage d\'un traqueur RETIRÉ ne fixe plus le coût, même '
        + 'moins cher — on ne peut plus s\'y approvisionner ('
        + JSON.stringify(herRetire) + ')');
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
    ok(toutesOffres(rid).some(function (x) { return x.prix === 694.90 && /Débroussailleuse/.test(x.titre); }),
      'l\'offre marchande est ÉCARTÉE mais LISTÉE avec son vrai titre et son prix — '
      + 'rien n\'est silencieux, et l\'user peut en faire une fiche s\'il le veut');
    ok(!toutesOffres(rid).some(function (x) { return /^(24\/48|Livraison)/.test(x.titre); }),
      '⛔ jamais un titre FAUX : une ligne de délai ou de livraison n\'est pas un '
      + 'nom de produit (un titre faux est pire qu\'une absence)');

    /* ⛔⛔ LA RÉFÉRENCE N'EST PAS TOUJOURS LE PREMIER MOT APRÈS LA MARQUE
       (09/08/2026). Mesuré sur le balayage réel de l'user, 67 pages : les 45
       tuiles LUES avaient toutes leur référence au mot 1, mais sur les 1 094
       ÉCARTÉES, 517 en portaient une AILLEURS dans le titre — le site écrit les
       machines « <marque> <réf> <description> » et les accessoires
       « <marque> <description> <réf> ». Tout le rayon accessoires tombait donc
       en `sansRef`, PRIX COMPRIS : 124 fiches du catalogue restaient sur un coût
       SUPPOSÉ alors que leur coût réel était dans la page.
       ⚠️ Réfs synthétiques (un harnais ne nomme jamais une donnée du catalogue) ;
       le gabarit, lui, est celui qui a été mesuré. */
    var pageRefFin = [
      'MAKITA ZZQ700P2', 'Machine test, 2 batteries', '3 offres', 'à partir de 450,00 €',
      'Détails du produit',
      'MAKITA emmanchement 25x920x790 mm ZZQ611-QZ', 'Accessoire test', '2 offres',
      'à partir de 79,99 €', 'Détails du produit',
      'MAKITA Batterie de rechange pour machine ZZQ700P2', 'Accessoire test', '1 offre',
      '77,00 €', 'Détails du produit'
    ].join('\n');
    var rFin = pi(pageRefFin, 'MAKITA');
    var fSku = {}; rFin.items.forEach(function (x) { fSku[x.sku] = x; });
    ok(fSku['ZZQ611-QZ'] && fSku['ZZQ611-QZ'].price === 79.99,
      '⛔ une carte dont la référence est écrite À LA FIN du titre est LUE — sinon '
      + 'tout un rayon reste sur un coût supposé alors que son prix est dans la page '
      + '(obtenu : ' + JSON.stringify(Object.keys(fSku)) + ')');
    /* ⚠️ PRÉALABLE 1 — la réf en TÊTE continue de se lire : le repli ne remplace
       rien, il complète. Sans ce cas, une régression du chemin principal
       resterait invisible. */
    ok(fSku.ZZQ700P2 && fSku.ZZQ700P2.price === 450,
      '⚠️ PRÉALABLE : la référence en TÊTE de titre se lit toujours — le repli '
      + 'complète le chemin principal, il ne le remplace pas');
    /* ⛔⛔ ARGENT, LE GARDE-FOU QUI COMPTE — la seule référence d'un titre peut
       être la MACHINE DE DESTINATION. « Batterie de rechange POUR machine
       <réf> » ne doit JAMAIS écrire le prix de la batterie sur la fiche de la
       machine : le coût serait divisé et la vente se ferait à perte. */
    ok(!fSku.ZZQ700P2 || fSku.ZZQ700P2.price !== 77,
      '⛔⛔ ARGENT : le prix d\'un accessoire « pour <machine> » ne s\'écrit JAMAIS '
      + 'sur la fiche de cette machine (obtenu ' + JSON.stringify(fSku.ZZQ700P2 && fSku.ZZQ700P2.price) + ')');
    ok(toutesOffres(rFin).some(function (x) { return x.prix === 77; })
       || (rFin.sansRef || []).some(function (x) { return x.prix === 77; }),
      '⛔ et l\'accessoire écarté reste LISTÉ avec son prix — une barrière écarte, '
      + 'elle n\'efface pas');

    /* ⛔⛔ ARGENT — TITRE FAUX AVEC PRIX DESSUS (03/08/2026, SON RELEVÉ).
       L'annonce « 3 à 6 jours ouvrés » est sortie avec un prix de 674 €. La
       garde d'alors listait des FORMULATIONS (« 24/48 », « Livraison ») — un
       site en écrit dix autres, et celle-là passait. On exige désormais qu'un
       titre soit PLAUSIBLE : la marque, OU un type reconnu, OU une référence
       crédible. Ces quatre-là n'ont rien de tout ça. */
    function offreAvec(titre) {
      return pi('MAKITA ZZX999X9\nMachine\n1 offre\n50,00 €\nDétails du produit\n'
        + titre + '\nVendu par : UnMarchand.fr\nDétails de l’offre\n'
        + '674,00 € TVA incluse\nDétails de l’offre\n', 'MAKITA');
    }
    var fauxTitres = ['3 à 6 jours ouvrés', 'Frais de port : 9,95 €', 'En stock', '1-2 jours ouvrables'];
    var passes = fauxTitres.filter(function (t) {
      return toutesOffres(offreAvec(t)).some(function (x) { return x.titre === t; });
    });
    ok(passes.length === 0,
      '⛔⛔ ARGENT : aucun délai, frais de port ou état de stock ne devient une '
      + 'annonce avec un prix. Mesuré sur SON relevé : « 3 à 6 jours ouvrés » '
      + 'sortait à 674 € (' + JSON.stringify(passes) + ')');
    /* PRÉALABLE — sans lui, la garde pourrait tout refuser et rester verte. */
    var vraisTitres = ['MAKITA ZZG404S2T-QW Meuleuse compacte 125 mm',
      'Borne de recharge murale véhicule électrique 7,4 kW',
      'Kit MAKITA ZZS570 + ZZS334 (2 x 5.0 Ah)'];
    var gardes = vraisTitres.filter(function (t) {
      return toutesOffres(offreAvec(t)).some(function (x) { return x.titre === t; });
    });
    ok(gardes.length === vraisTitres.length,
      '⛔ PRÉALABLE : les VRAIES annonces passent toujours — y compris celle qui '
      + 'n\'a ni marque ni référence mais dont le TYPE est reconnu (' + gardes.length
      + '/' + vraisTitres.length + ')');
    /* ⛔⛔ ARGENT — LA MÊME GARDE, SUR L'AUTRE CHEMIN (03/08/2026, SON RELEVÉ).
       Le délai « 3 à 6 jours ouvrés » ressortait ENCORE à 674 € alors que la
       garde ci-dessus était déjà en place : elle ne couvrait que la branche
       ANNONCE (« Vendu par »). Ce bloc-là n'en avait pas — il passait par la
       branche CARTE, où le titre était `b[0]`, la première ligne quelle
       qu'elle soit. Signature qui l'a démasqué dans son JSON : le `car`
       portait `sku: DCE800H1-SK`, une référence que la chaîne « 3 à 6 jours
       ouvrés » ne peut pas contenir — donc le titre et la description ne
       venaient PAS de la même ligne.
       ⚠️ Une garde posée sur un seul chemin ne garde rien : le défaut prend
       l'autre. Ces assertions rejouent le chemin CARTE, sans « Vendu par ». */
    var queueCarte = pi([
      '3 à 6 jours ouvrés', 'Livraison gratuite', '674,00 €',
      'Ponceuse à plâtre 18V sans fil - MAKITA - ZZE800H1-SK',
      'Détails du produit'
    ].join('\n'), 'MAKITA');
    ok(!toutesOffres(queueCarte).some(function (x) { return /jours\s+ouvr/i.test(x.titre); }),
      '⛔⛔ ARGENT : un délai de livraison ne devient pas une annonce à 674 € par '
      + 'la branche CARTE non plus — c\'est le trou resté ouvert après la garde '
      + 'de la branche ANNONCE (' + JSON.stringify(queueCarte.sansRef.map(function (x) {
        return x.titre; })) + ')');
    ok(!toutesOffres(queueCarte).some(function (x) { return x.prix === 674; }),
      '⛔⛔ ARGENT : et ce prix ne se recolle PAS sur la ponceuse d\'en dessous — '
      + 'il appartient à l\'offre précédente. Le prix d\'une carte se lit APRÈS son '
      + 'titre, jamais avant. Un prix décalé a l\'air juste, c\'est pire qu\'absent');
    ok((queueCarte.perdus || []).some(function (x) { return /ZZE800H1-SK/.test(x.raison); }),
      '⛔ …et le refus est CONSIGNÉ en nommant le titre réellement retenu. Premier '
      + 'jet : le registre disait « sans la marque » alors que la marque était '
      + 'écrite trois lignes plus bas — un registre qui ment sur la cause ne '
      + 'm\'apprendra jamais le prochain gabarit ('
      + JSON.stringify((queueCarte.perdus || []).map(function (x) { return x.raison; })) + ')');
    /* PRÉALABLE — sans lui, la garde pourrait tout refuser et rester verte.
       Et elle vérifie plus que « une entrée sort » : que le titre est la ligne
       PRODUIT et non le bandeau « Meilleure vente » qui la précède. Avant la
       correction, `b[0]` faisait de ce badge le nom de l'article. */
    var badgeAvant = pi([
      'Meilleure vente',
      'Ponceuse à plâtre 18V sans fil - MAKITA - ZZE800H1-SK',
      'Livraison gratuite', '674,00 €',
      'Détails du produit'
    ].join('\n'), 'MAKITA');
    /* ⚠️ ASSERTION REFORMULÉE LE 09/08/2026, ET ELLE SE DURCIT. Elle exigeait
       que ce bloc sorte en `sansRef` — c'était décrire le manque : la référence
       étant écrite à la FIN du titre, le parseur ne savait pas la lire. Depuis
       le repli de lecture, la carte est LUE. Ce qu'elle protège n'a pas changé
       d'un pouce : le titre retenu est la ligne PRODUIT, jamais le bandeau
       « Meilleure vente », et le prix est celui de la carte. On l'exprime donc
       en INVARIANT, valable que la carte soit lue ou écartée. */
    var vuBadge = toutesOffres(badgeAvant);
    ok(vuBadge.length === 1 && vuBadge[0].prix === 674
      && !/Meilleure vente/i.test(vuBadge[0].titre || ''),
      '⛔ PRÉALABLE : une VRAIE carte précédée d\'un bandeau est retenue avec SON '
      + 'prix, et jamais sous le nom du bandeau ('
      + JSON.stringify(vuBadge) + ')');
    var refBadge = (badgeAvant.items[0] || {}).sku
      || ((badgeAvant.sansRef[0] || {}).car || {}).sku;
    ok(refBadge === 'ZZE800H1-SK',
      '⛔ …et la référence vient de CETTE ligne-là — celle du produit, pas du '
      + 'bandeau (' + JSON.stringify(refBadge) + ')');

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
    ok(toutesOffres(rid).some(function (x) { return x.prix === 628.37; }),
      'une réf éclatée par des espaces est ÉCARTÉE mais LISTÉE avec son prix');
    ok(!ri.some(function (x) { return /^ZZI$/.test(x.sku) || x.price === 628.37; }),
      '⛔ ARGENT : et elle ne devient JAMAIS un produit — « ZZI 579 T2T » ne se '
      + 'recolle pas, on ne sait pas si le vrai code s\'arrête au 579 ou au T2T');
    ok(toutesOffres(sansP).some(function (x) { return x.prix === 628.37; }),
      '⛔ …y compris SANS la ligne « Détails du produit » : c\'est le titre qui '
      + 'ouvre la carte, pas l\'étiquette');

    /* ⛔⛔ ARGENT — CINQ ANNONCES PERDUES PAR RELEVÉ, AVEC LEUR PRIX (03/08).
       Gabarit RÉEL de sa page, lu dans `refsNonLuesDetail` et reproduit à
       l'identique : idealo n'écrit plus qu'UNE ancre par offre, juste après
       « Vendu par ». La queue d'une offre — délai · livraison · prix — traîne
       donc jusqu'au titre suivant. Quand ce titre ne commence PAS par la
       marque (« Meuleuse … - MAKITA - ZZG404 »), la seule coupe possible est
       celle de « Vendu par » — et elle envoyait cette queue dans le chemin
       des CARTES, où elle n'a ni référence ni prix lisible. */
    var deuxOffres = pi([
      'MAKITA ZZP111X1 - Nettoyeur haute pression 190 bars',
      'Vendu par : UnMarchand.fr', 'Détails de l’offre',
      '3 à 6 jours ouvrés', 'Livraison gratuite', '695,00 € TVA incluse',
      'Meuleuse compacte 125 mm ZZ 18V - MAKITA - ZZG404S2T-QW',
      'Vendu par : AutreMarchand.fr', 'Détails de l’offre',
      '1-2 jours ouvrables', 'Livraison gratuite', '693,49 € TVA incluse'
    ].join('\n'), 'MAKITA');
    ok(toutesOffres(deuxOffres).length === 2,
      '⛔⛔ DEUX offres qui se suivent sans ancre de fin sont lues TOUTES LES DEUX '
      + '(' + toutesOffres(deuxOffres).length + '/2) — c\'est la perte mesurée sur SA page');
    /* ⛔⛔ LE PRIX DOIT ÊTRE SUR LE BON TITRE, pas seulement présent. Un
       premier jet vérifiait que les deux prix EXISTENT : un sabotage qui
       rendait la queue au MAUVAIS titre laissait donc tout vert, alors qu'il
       écrivait 695 € sur l'annonce d'à côté. Un prix présent mais décalé est
       pire qu'un prix absent : il a l'air juste. */
    function prixDe(motTitre) {
      var e = toutesOffres(deuxOffres).filter(function (x) { return x.titre && x.titre.indexOf(motTitre) !== -1; })[0];
      return e ? e.prix : null;
    }
    ok(prixDe('Nettoyeur') === 695.00 && prixDe('Meuleuse') === 693.49,
      '⛔⛔ ARGENT : chaque prix est APPARIÉ à SON annonce — 695 € au nettoyeur, '
      + '693,49 € à la meuleuse (' + prixDe('Nettoyeur') + ' / ' + prixDe('Meuleuse') + ')');
    ok((deuxOffres.perdus || []).length === 0,
      'et plus rien n\'est consigné comme perdu : le registre des pertes doit '
      + 'redevenir VIDE quand le défaut est corrigé ('
      + JSON.stringify((deuxOffres.perdus || []).map(function (x) { return x.raison; })) + ')');

    /* ⛔⛔ LA DERNIÈRE CARTE DE CHAQUE PAGE ÉTAIT MANGÉE PAR LE GARDE-FOU.
       Trouvé dans SON relevé du 03/08 : `D25899K` — un marteau de démolition à
       633,59 € — ressortait « vue mais non lue ». Cause isolée en ne faisant
       varier QUE la longueur du pied de page : 36 lignes après le titre → lu ;
       37 → plus rien. Le bloc glissait de 40 lignes en éjectant bloc[0], donc
       LE TITRE. Une carte suivie d'une autre ne le voit jamais — son bloc se
       ferme tôt ; la DERNIÈRE n'est fermée par rien et avale tout le pied de
       page.
       ⚠️ J4 : sans son titre, le bloc part dans le chemin sans référence et va
       chercher un prix plus bas — celui du bandeau « Produits favoris », un
       TÉLÉPHONE. Un prix d'iPhone sur un marteau fausse le coût d'achat.
       ⚠️ Le harnais ne recopie PAS le seuil de 40 : il balaie de part et
       d'autre. Un seuil recopié se périme, et un seuil posé pile là où la
       valeur se trouve n'est pas un seuil. */
    function pageAvecQueue(n) {
      var q = [];
      for (var i = 0; i < n; i++) q.push('pied de page ligne ' + i);
      return pi([
        'MAKITA ZZ25899K',
        'Marteau de démolition, SDS-Max, 1 500 W',
        '10 offres',
        'à partir de633,59 €'
      ].concat(q).join('\n'), 'MAKITA');
    }
    var queues = [0, 5, 20, 39, 40, 41, 80, 200];
    var lues = queues.filter(function (n) {
      var r = pageAvecQueue(n);
      return r.items.length === 1 && r.items[0].sku === 'ZZ25899K' && r.items[0].price === 633.59;
    });
    ok(lues.length === queues.length,
      '⛔⛔ la DERNIÈRE carte d\'une page est lue quelle que soit la longueur du '
      + 'pied de page qui la suit — c\'est la réf que SA page perdait à chaque '
      + 'relevé (lues pour les queues ' + JSON.stringify(lues) + ' sur '
      + JSON.stringify(queues) + ')');
    ok(pageAvecQueue(200).items.every(function (x) { return x.price === 633.59; }),
      '⛔⛔ ARGENT : et jamais un autre prix. Titre éjecté, le bloc allait chercher '
      + 'le prix du bandeau « Produits favoris » — un téléphone sur un marteau');
    /* PRÉALABLE : sans lui, un parseur qui ne lirait plus RIEN passerait, et le
       filtre ci-dessus serait vert sur une liste vide des deux côtés. */
    ok(queues.length >= 4 && pageAvecQueue(0).items.length === 1,
      '⛔ PRÉALABLE : le cas sans queue est lu — sinon les assertions ci-dessus '
      + 'ne compareraient que des vides');

    /* ⛔⛔ UN KIT QUI DIT SON NOMBRE D'OUTILS EST UN LOT, MÊME S'IL NOMME CE
       QU'IL CONTIENT. Mesuré sur SA page : « Kit 2 Outils Perceuse Visseuse et
       Perforateur SDS-Plus » sortait `perceuse-visseuse` — le premier CONTENU
       pris pour le CONTENANT. J4 : comparer un lot de deux machines à une
       fiche de machine seule fausse le coût d'achat. */
    function typeDe(t) {
      var c = pp.extraireCaracteristiques(t, 'MAKITA');
      return c.famille + '/' + c.rayon + '/' + c.type;
    }
    ok(typeDe('- Kit 2 Outils Perceuse Visseuse et Perforateur SDS-Plus 18V 5AH - ZZK220P2T')
      === 'machine/combo/pack d\'outils',
      '⛔⛔ un « Kit N Outils » est un pack, pas la première machine qu\'il nomme ('
      + typeDe('- Kit 2 Outils Perceuse Visseuse et Perforateur SDS-Plus 18V 5AH - ZZK220P2T') + ')');
    /* PRÉALABLES — la règle exige les DEUX conditions, et chacune se prouve
       insuffisante seule. Sans ça, une règle qui typerait « pack » tout ce qui
       contient un chiffre resterait verte. */
    ok(typeDe('Perceuse compatible avec 3 outils de la gamme') === 'machine/percage/perceuse',
      '⛔ PRÉALABLE : un DÉCOMPTE sans mot de lot n\'est pas un pack — sinon '
      + '« compatible avec 3 outils » deviendrait un pack d\'outils');
    ok(/vibrateur$/.test(typeDe('Vibrateur à béton ZZE531N-XJ + 2 batteries 18V 5 Ah + 1 Chargeur ZZB1104')),
      '⛔ PRÉALABLE : un MOT DE LOT sans décompte d\'outils n\'est pas un pack — '
      + 'un nom écrit l\'emporte toujours sur un comptage');
    ok(typeDe('Pack 3 outils 18V (ZZP458 + ZZD154 + ZZG460)') === 'machine/combo/pack d\'outils',
      '⛔ et le RAYON est rempli comme sur les deux autres chemins vers ce type — '
      + 'un type juste dans un rayon vide se range mal et se compare mal');

    /* ⛔⛔ MES DEUX INSTRUMENTS DISAIENT « RIEN NE MANQUE » — ET IL MANQUAIT
       UNE LIGNE SUR SOIXANTE. Relevé du 03/08 : `refsNonLues: []`,
       `perdus: []`, et pourtant 59 lignes lues là où la page en portait 60.
       Ni l'un ni l'autre ne pouvait la voir : `refsNonLues` ne regarde que les
       CARTES — celles qui portent une référence —, `perdus` que les blocs
       écartés en le sachant. Une ANNONCE MARCHANDE avalée par sa voisine n'a
       ni référence ni trace : elle sort des deux filets.
       ⛔ Un instrument qui compte ses réussites ne mesure pas ses échecs.
       `titresAttendus` compte les ANCRES de la page — « Vendu par : », écrit
       une fois par annonce — et rend le titre qui précède chacune. C'est le
       seul compteur du lot qui ne dépende PAS de la réussite du parseur.
       ⚠️ J4 : une annonce perdue est un prix perdu. Le coût d'achat retenu est
       le MINIMUM des sources ; en manquer une, c'est retenir un coût trop
       haut, donc vendre trop cher. */
    var pageAncres = [
      'MAKITA ZZP111X1 - Nettoyeur haute pression 190 bars',
      'Vendu par : UnMarchand.fr', 'Détails de l’offre',
      '3 à 6 jours ouvrés', 'Livraison gratuite', '695,00 € TVA incluse',
      'Meuleuse compacte 125 mm ZZ 18V - MAKITA - ZZG404S2T-QW',
      '',
      'Vendu par : AutreMarchand.fr', 'Détails de l’offre',
      '1-2 jours ouvrables', 'Livraison gratuite', '693,49 € TVA incluse',
      'Scie plongeante ZZS520T1-QW 54V FLEXVOLT',
      'Vendu par : TroisiemeMarchand.fr', 'Détails de l’offre',
      '24/48 heures', 'Livraison gratuite', '611,00 € TVA incluse'
    ].join('\n');
    var att = pp.titresAttendus(pageAncres);
    ok(att.length === 3,
      '⛔⛔ le compteur d\'ANCRES voit les 3 annonces que la page contient, sans '
      + 'rien devoir au parseur (' + att.length + '/3)');
    ok(att[1] === 'Meuleuse compacte 125 mm ZZ 18V - MAKITA - ZZG404S2T-QW',
      '⛔ et il SAUTE LES LIGNES VIDES pour retrouver le titre : idealo en '
      + 'intercale, et un titre vide ne se rapproche de rien (' + JSON.stringify(att[1]) + ')');
    /* ⛔ LE COMPTEUR DOIT VOIR CE QUE LE PARSEUR RATE — c'est toute sa raison
       d'être. On lui donne donc une page où une annonce EST perdue, et on
       exige que l'écart soit visible. Sans ce cas, il resterait vert en
       comptant exactement ce que le parseur a déjà su lire, et il ne
       servirait à rien. */
    /* ⚠️ « Lues » = TOUT ce que le parseur a rendu, les deux seaux confondus.
       Depuis la promotion des offres à référence unique, une annonce lue peut
       arriver dans `items` ; ne compter que `sansRef` ferait croire à une
       perte qui n'existe pas. */
    var lues = toutesOffres(pi(pageAncres, 'MAKITA')).map(function (x) { return x.titre; });
    var clef = function (s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60).toUpperCase(); };
    var vus = {}; lues.forEach(function (t) { vus[clef(t)] = 1; });
    ok(att.filter(function (t) { return !vus[clef(t)]; }).length === 0,
      '⛔⛔ ARGENT : sur cette page, aucune annonce attendue ne manque à l\'appel — '
      + 'attendues ' + att.length + ', lues ' + lues.length);
    ok(pp.annoncesManquantes(pageAncres, lues).length === 0,
      '⛔⛔ ARGENT : le rapprochement ne signale RIEN quand tout est lu — sinon il '
      + 'crierait au loup et finirait ignoré ('
      + JSON.stringify(pp.annoncesManquantes(pageAncres, lues)) + ')');
    /* ⛔ ET IL DOIT VOIR CE QUE LE PARSEUR RATE — c'est toute sa raison d'être.
       Sans ce cas, il resterait vert en comptant exactement ce que le parseur
       a déjà su lire, et ne servirait à rien. */
    ok(pp.annoncesManquantes(pageAncres, lues.slice(1)).length === 1,
      '⛔ PRÉALABLE : quand une annonce manque à l\'appel, le compteur la NOMME. '
      + 'Un instrument qui ne sait pas voir un trou n\'est pas un instrument');
    /* ⛔⛔ ON COMPTE, ON NE COCHE PAS. Deux marchands vendant le MÊME article
       écrivent le même titre — le cas NORMAL d'un comparateur, et sa page en
       portait déjà (31 annonces pour 30 noms distincts). Cocher « ce titre
       est-il ressorti ? » déclarerait la paire complète alors qu'une des deux
       manque : le trou deviendrait invisible, et c'est le défaut qu'on répare. */
    var pageJumelles = [
      'Meuleuse compacte 125 mm ZZ 18V - MAKITA - ZZG404S2T-QW',
      'Vendu par : PremierMarchand.fr', 'Détails de l’offre',
      '24/48 heures', 'Livraison gratuite', '693,49 € TVA incluse',
      'Meuleuse compacte 125 mm ZZ 18V - MAKITA - ZZG404S2T-QW',
      'Vendu par : SecondMarchand.fr', 'Détails de l’offre',
      '3 à 6 jours ouvrés', 'Livraison gratuite', '679,00 € TVA incluse'
    ].join('\n');
    var deuxTitres = pp.titresAttendus(pageJumelles);
    ok(deuxTitres.length === 2,
      '⛔ deux annonces du MÊME article comptent DEUX fois : ce sont deux prix '
      + 'différents chez deux marchands (' + deuxTitres.length + '/2)');
    ok(pp.annoncesManquantes(pageJumelles, [deuxTitres[0]]).length === 1,
      '⛔⛔ ARGENT : une seule des deux jumelles lue ⇒ il en MANQUE une. Cocher au '
      + 'lieu de compter rendrait ce trou invisible — et le coût d\'achat retenu '
      + 'est le MINIMUM des sources : en manquer une, c\'est acheter trop cher');

    /* ⛔ UNE BALISE DE BLOC EST UNE FIN DE LIGNE, PAS UNE ESPACE. Mesuré en
       éprouvant les pages limites : le MÊME contenu envoyé en HTML rendait
       `items: 0` là où le texte rendait 1. Toutes les balises devenaient des
       espaces, donc titre, sous-titre et prix se retrouvaient collés sur UNE
       ligne — et ce parseur travaille par lignes. Son raccourci envoie du
       texte aujourd'hui ; le jour où il enverra du HTML, il aurait eu un zéro
       sans cause visible.
       ⚠️ Le harnais compare les DEUX formes du même contenu au lieu de fixer
       un attendu : ce qui doit être vrai, c'est l'égalité, pas un chiffre. */
    var memeContenuTexte = [
      'MAKITA ZZS572P2', 'Scie circulaire portative, 1 batterie, 3,5 kg',
      '1 offre', 'à partir de649,00 €'
    ].join('\n');
    var memeContenuHtml = '<div class="carte"><h2>MAKITA ZZS572P2</h2>'
      + '<p>Scie circulaire portative, 1 batterie, 3,5 kg</p>'
      + '<li>1 offre</li><span>à partir de649,00 €</span></div>';
    var rTexte = pi(memeContenuTexte, 'MAKITA');
    var rHtml = pi(memeContenuHtml, 'MAKITA');
    ok(rHtml.items.length === rTexte.items.length && rTexte.items.length === 1,
      '⛔ le même contenu en HTML et en texte donne le MÊME nombre de lignes ('
      + rHtml.items.length + ' vs ' + rTexte.items.length + ')');
    ok(rHtml.items[0] && rTexte.items[0] && rHtml.items[0].sku === rTexte.items[0].sku
      && rHtml.items[0].price === rTexte.items[0].price,
      '⛔⛔ ARGENT : et la MÊME référence au MÊME prix — un format d\'envoi ne '
      + 'change pas ce qu\'on achète (' + JSON.stringify(rHtml.items[0]) + ')');
    /* ⛔ Mais on ne coupe QUE sur les balises de bloc : couper sur un `<b>` au
       milieu d'un titre le briserait en deux, et le titre est ce qui porte le
       type ET la référence. */
    var titreEnrichi = pi('<p>MAKITA <b>ZZS572P2</b> Scie circulaire</p><li>1 offre</li>'
      + '<span>à partir de649,00 €</span>', 'MAKITA');
    ok(titreEnrichi.items.length === 1 && titreEnrichi.items[0].sku === 'ZZS572P2',
      '⛔ une balise INLINE au milieu d\'un titre ne le coupe pas en deux — sinon '
      + 'la référence se détacherait de la marque ('
      + JSON.stringify(titreEnrichi.items.map(function (x) { return x.sku; })) + ')');

    /* ⛔⛔ DWK EST UN KIT DE MACHINES, PAS LE COFFRET QUI LES PORTE. Trouvé en
       auditant son relevé du 03/08 : DWK301, DWK300 et DWK223 sortaient tous
       les trois `rangement / coffret` — TROIS lignes sur cinquante-neuf —
       parce que le sous-titre de la carte nomme les TSTAK du lot. Le contenant
       volait la place du contenu, exactement comme « Coffret DE 29 forets ».
       Vérifié chez cinq revendeurs (todotaladros, leroymerlin, tecnomat,
       cdiscount, manomano) : DWK301 = DCD796 + DCS334 + DCS570, DWK300 =
       DCD796 + DCS331 + DCS391, DWK223 = DCD996 + DCH273.
       ⚠️ J4 : le prix d'un lot de trois machines écrit sur un coffret de
       rangement fausse tout ce qui en découle.
       ⚠️ La marque est ici DEWALT et pas le témoin habituel : la table des
       préfixes n'existe QUE pour elle, et c'est précisément ce qu'on éprouve.
       Les références restent synthétiques partout ailleurs. */
    function typeDewalt(t) {
      var c = pp.extraireCaracteristiques(t, 'DEWALT');
      return c.famille + '/' + c.rayon + '/' + c.type;
    }
    var kits = ['DEWALT DWK301 Coffret modulaire', 'DEWALT DWK300 Kit, 2 x TSTAK VI',
      'DEWALT DWK223 Coffret TSTAK VI'];
    var kitsOk = kits.filter(function (t) { return typeDewalt(t) === 'machine/combo/pack d\'outils'; });
    ok(kitsOk.length === kits.length,
      '⛔⛔ un DWK est un LOT DE MACHINES, même quand son sous-titre ne parle que '
      + 'du coffret (' + kitsOk.length + '/' + kits.length + ' — obtenu '
      + JSON.stringify(kits.map(typeDewalt)) + ')');
    ok(pp.extraireCaracteristiques(kits[0], 'DEWALT').typeRejete === 'coffret',
      '⛔ et le type écarté est CONSERVÉ à part : une correction qu\'on ne peut pas '
      + 'relire n\'est pas vérifiable');
    /* ⛔ PRÉALABLE — le vrai coffret reste un coffret. Sans ce cas, une règle qui
       typerait « pack d'outils » tout ce qui commence par DW resterait verte. */
    ok(typeDewalt('DEWALT DWST83345-1 Coffret TOUGHSYSTEM') === 'rangement/coffret/coffret modulaire',
      '⛔ PRÉALABLE : DWST reste du RANGEMENT — sinon la règle ne distingue plus '
      + 'un lot de machines d\'une caisse vide (' + typeDewalt('DEWALT DWST83345-1 Coffret TOUGHSYSTEM') + ')');

    /* ⛔⛔ FVK EST LE MÊME PIÈGE QUE DWK, EN GAMME FLEXVOLT. Mesuré le
       09/08/2026 sur le relevé idealo Quincaillerie de l'user : deux kits
       FVK…T2-QW dont le titre énumère le contenu (« DCH… + DCG… + 2 x 6.0 Ah
       + … + TSTAK II + TSTAK VI ») sortaient `rangement / coffret modulaire` —
       un lot de deux machines 54 V pris pour sa caisse. Réfs synthétiques ici
       (règle d'ancrage) : c'est le PRÉFIXE qu'on éprouve. */
    var kitsFvk = ['DeWALT Kit FVK999T2-QW 54V/18V (DCH999 + DCG999 + 2 x 6.0 Ah + TSTAK II + TSTAK VI)',
      'DEWALT FVK998X3HD-QW'];
    var kitsFvkOk = kitsFvk.filter(function (t) { return typeDewalt(t) === 'machine/combo/pack d\'outils'; });
    ok(kitsFvkOk.length === kitsFvk.length,
      '⛔⛔ un FVK est un LOT DE MACHINES FlexVolt, même quand son titre finit par '
      + 'les TSTAK du lot, et même réduit à sa seule référence ('
      + kitsFvkOk.length + '/' + kitsFvk.length + ' — obtenu '
      + JSON.stringify(kitsFvk.map(typeDewalt)) + ')');

    /* ⛔ LE « & » EST UN « + » ÉCRIT AUTREMENT. Mesuré le 09/08/2026 sur le même
       relevé : « Affleureuse … & Coffret 22 Fraises » sortait
       `consommable/fraise` (la machine typée par les fraises de son lot) et
       « Souffleur … & Recharge de Fil Coupe Bordure » sortait
       `fil de débroussailleuse`. Ce qui suit l'esperluette est le lot. */
    ok(typeDewalt('DEWALT - Affleureuse Brushless XR 18V - Plongée 55mm & Coffret 22 Fraises de Défonceuse')
        === 'machine/bois/affleureuse',
      '⛔ ce qui suit un « & » est le LOT, pas l\'article : l\'affleureuse ne se '
      + 'type plus par les fraises de son coffret ('
      + typeDewalt('DEWALT - Affleureuse Brushless XR 18V - Plongée 55mm & Coffret 22 Fraises de Défonceuse') + ')');
    /* ⚠️ PRÉALABLE 1 — l'élagage ne vaut que pour le TYPAGE : le coffret du lot
       continue de se lire sur le titre ENTIER, c'est lui qui fait le prix. */
    ok(pp.extraireCaracteristiques('DEWALT Perceuse Brushless 18V & Coffret TSTAK II', 'DEWALT').coffret === 'TSTAK',
      '⚠️ PRÉALABLE : le coffret cité APRÈS le « & » se lit toujours — l\'élagage '
      + 'ne vaut que pour le typage, jamais pour ce qui fait le prix');
    /* ⚠️ PRÉALABLE 2 — un kit d'ACCESSOIRES à « & » reste un consommable : sans
       ce cas, une règle qui typerait « machine » tout titre à « & » resterait
       verte. */
    ok(/^consommable\//.test(typeDewalt('DEWALT Jeu de douilles 13-24mm & cliquet, 9 pièces')),
      '⚠️ PRÉALABLE : un jeu de douilles à « & » reste un CONSOMMABLE ('
      + typeDewalt('DEWALT Jeu de douilles 13-24mm & cliquet, 9 pièces') + ')');

    /* ⛔ « ET/AVEC COFFRET DE TRANSPORT » DÉCRIT L'EMBALLAGE, PAS L'ARTICLE.
       Mesuré le 09/08/2026 : « Scie Sabre Électrique avec Vitesse Variable et
       Coffret de Transport » sortait `rangement/coffret` — « coffret de
       transport » est une entrée plus LONGUE que « scie sabre », et la plus
       longue gagne. */
    ok(typeDewalt('DEWALT Scie Sabre Électrique avec Vitesse Variable et Coffret de Transport + Lame, Set de 3')
        === 'machine/sciage/scie sabre',
      '⛔ « et Coffret de Transport » ne vole plus le type de la machine qu\'il '
      + 'accompagne (' + typeDewalt('DEWALT Scie Sabre Électrique avec Vitesse Variable et Coffret de Transport + Lame, Set de 3') + ')');
    /* ⚠️ PRÉALABLE — le coffret de transport vendu SEUL reste un coffret. */
    ok(/^rangement\//.test(typeDewalt('DEWALT Coffret de transport TSTAK profond')),
      '⚠️ PRÉALABLE : un coffret de transport vendu SEUL reste du RANGEMENT ('
      + typeDewalt('DEWALT Coffret de transport TSTAK profond') + ')');

    /* ⛔⛔ UN TITRE DE MARCHAND PEUT ÊTRE FAUX ; UNE RÉFÉRENCE, NON. Trouvé le
       03/08 en faisant auditer ses 59 lignes contre la réalité DeWALT, source
       par source. DEUX lignes vendaient une « Dégauchisseuse sans fil DCW 620 »
       — une machine d'atelier — pour une DÉFONCEUSE plongeante, mauvaise
       traduction de l'allemand « Oberfräse » ; une TROISIÈME, même référence,
       disait « Défonceuse » et avait raison. Une même réf donnait donc deux
       outils différents. Idem pour « Coupe-bordures … DCMBC723N, avec
       guidon » : DeWALT le vend comme « 54V Clearing Saw with Bull Handle »,
       lame forestière de 25 cm, arbres jusqu'à 10 cm — une débroussailleuse.
       ⚠️ J'ai d'abord cherché une règle générale — « une dégauchisseuse est
       stationnaire, il n'en existe pas sur batterie » — et je l'ai TUÉE en
       mesurant : il en existe. Une hypothèse morte se déclare morte.
       ⛔ Le remède est une entrée `precis` : elle nomme UN produit exact, avec
       sa source et sa date, et renverse le mot du titre. Les trois préalables
       ci-dessous prouvent qu'une entrée de FAMILLE ne le fait jamais — sinon
       DCS, DCF ou DCW écraseraient des types justes par dizaines. */
    var faussesTraductions = [
      ['DeWalt DCW 620 P2T Dégauchisseuse sans fil 18 V 12 mm Brushless + 2 batteries', 'machine/bois/défonceuse'],
      ['DeWalt DCW 620 M2T Dégauchisseuse sans fil 18 V 12 mm Brushless + 2 batteries', 'machine/bois/défonceuse'],
      ['Défonceuse sans fil DeWalt DCW 620 H1T 18 V 12 mm Brushless + 1 batterie', 'machine/bois/défonceuse'],
      ['DEWALT Coupe-bordures sans fil 54V, modèle DCMBC723N, avec guidon', 'machine/jardin/débroussailleuse']
    ];
    var redressees = faussesTraductions.filter(function (c) { return typeDewalt(c[0]) === c[1]; });
    ok(redressees.length === faussesTraductions.length,
      '⛔⛔ la RÉFÉRENCE l\'emporte sur un mot de titre faux ('
      + redressees.length + '/' + faussesTraductions.length + ' — obtenu '
      + JSON.stringify(faussesTraductions.map(function (c) { return typeDewalt(c[0]); })) + ')');
    ok(pp.extraireCaracteristiques(faussesTraductions[0][0], 'DEWALT').typeRejete === 'dégauchisseuse',
      '⛔ …et le mot écarté reste consultable : une correction qu\'on ne peut pas '
      + 'relire n\'est pas vérifiable');
    /* PRÉALABLES — une entrée de FAMILLE ne renverse rien. Sans eux, poser
       `precis` partout resterait vert tout en écrasant des types justes. */
    var famillesIntactes = [
      ['DEWALT DCS389X2-QW Scie sabre', 'machine/sciage/scie sabre'],
      ['DEWALT DCW210D2 Ponceuse excentrique 18V', 'machine/bois/ponceuse'],
      ['DEWALT DCF887 Visseuse à chocs 18V', 'machine/vissage-choc/visseuse à chocs']
    ];
    var intactes = famillesIntactes.filter(function (c) { return typeDewalt(c[0]) === c[1]; });
    ok(intactes.length === famillesIntactes.length,
      '⛔ PRÉALABLE : un préfixe de FAMILLE laisse le nom écrit gagner — DCW couvre '
      + 'défonceuse ET ponceuse, DCF riveteuse ET clé à chocs ('
      + intactes.length + '/' + famillesIntactes.length + ' — obtenu '
      + JSON.stringify(famillesIntactes.map(function (c) { return typeDewalt(c[0]); })) + ')');
    ok(pp.extraireCaracteristiques('DEWALT DCW210D2 Ponceuse excentrique 18V', 'DEWALT').typeRejete === null,
      '⛔ PRÉALABLE : et rien n\'est écarté quand rien n\'est contredit — un '
      + '`typeRejete` qui se remplit tout seul rendrait la trace illisible');

    /* ⛔⛔ UNE TUILE PAR PAGE DISPARAISSAIT SANS LAISSER DE TRACE — ni dans les
       fiches, ni dans les écartées, ni dans les perdues, ni dans les réfs vues.
       L'user, mot pour mot : « il y a 60 cartes produits avec 60 prix et les 60
       sont cliquables ». J'en lisais 59 et mes DEUX compteurs disaient « rien
       ne manque » : ils ne regardaient que « Vendu par : » et les titres
       commençant par « MARQUE RÉF ».
       Cause : une tuile-fiche ne s'ouvrait que sur « MARQUE RÉF ». Quand
       idealo écrit « Meuleuse compacte 125 mm - MARQUE - RÉF », la tuile
       entière est avalée par sa voisine — et son prix avec.
       ⛔ Remède : chaque tuile s'annonce elle-même. Une fiche écrit « N offres »
       puis son prix ; une annonce écrit « Vendu par : » puis son prix. On ferme
       sur le PRIX, parce que c'est lui qu'on est venu chercher.
       ⚠️ Le harnais donne TROIS tuiles dont la deuxième a un titre sans marque
       en tête : c'est exactement le gabarit qui la faisait disparaître. */
    var troisTuiles = [
      'MAKITA ZZK368P3T', 'Pack outillage sans fil, 18 V, Li-Ion', '12 offres', 'à partir de649,68 €', '',
      'Meuleuse compacte 125 mm - MAKITA - ZZG404S2T-QW', 'Meuleuse d’angle, 1 batterie', '3 offres', 'à partir de693,49 €', '',
      'MAKITA ZZS572P2', 'Scie circulaire portative, 1 batterie', '5 offres', 'à partir de299,00 €'
    ].join('\n');
    var rTuiles = pi(troisTuiles, 'MAKITA');
    ok(rTuiles.items.length + rTuiles.sansRef.length === 3,
      '⛔⛔ TROIS tuiles sur la page, TROIS lignes lues — celle dont le titre ne '
      + 'commence pas par la marque comprise (' + rTuiles.items.length + ' + '
      + rTuiles.sansRef.length + ')');
    ok(toutesOffres(rTuiles).some(function (x) { return x.prix === 693.49; }),
      '⛔⛔ ARGENT : et elle sort AVEC SON PRIX. Avant, la tuile entière était '
      + 'avalée par sa voisine et 693,49 € disparaissaient sans une trace ('
      + JSON.stringify(rTuiles.sansRef.map(function (x) { return x.prix; })) + ')');
    /* ⚠️ ASSERTION REFORMULÉE LE 09/08/2026 — en INVARIANT, et elle se durcit.
       Elle figeait la RÉPARTITION du moment (2 lues + 1 écartée) parce que la
       tuile du milieu, référence en fin de titre, n'était pas lisible. Elle est
       lue maintenant. Ce qui compte n'a pas bougé et se dit mieux : CHAQUE
       référence porte le prix de SA tuile, aucun prix ne migre chez la voisine.
       ⛔ Un seuil recopié se périme (règle des harnais) : on n'écrit plus « 2 »,
       on vérifie l'appariement réf ↔ prix. */
    var parRefTuile = {};
    rTuiles.items.forEach(function (x) { parRefTuile[x.sku] = x.price; });
    ok(parRefTuile.ZZK368P3T === 649.68 && parRefTuile.ZZS572P2 === 299.00,
      '⛔⛔ ARGENT : chaque voisine garde LE SIEN — une tuile qu\'on ouvre ne '
      + 'décale pas les prix d\'à côté (' + JSON.stringify(parRefTuile) + ')');
    /* ⛔ Et le prix du milieu ne se retrouve JAMAIS sur une voisine — c'est la
       forme exacte du défaut qu'on redoute : un prix qui migre d'une réf à
       l'autre. */
    ok(parRefTuile.ZZK368P3T !== 693.49 && parRefTuile.ZZS572P2 !== 693.49,
      '⛔⛔ ARGENT : le prix de la tuile du milieu ne migre sur AUCUNE voisine ('
      + JSON.stringify(parRefTuile) + ')');

    /* ⛔ LE COMPTE BRUT DES TUILES — c'est LUI qui répond à « la page en a-t-elle
       60 ? ». Il ne dépend d'aucun titre, d'aucun repli, d'aucun vocabulaire :
       seulement des deux ancres que la page ne peut pas ne pas écrire. */
    var tui = pp.compterTuiles(troisTuiles);
    ok(tui.total === 3 && tui.fiches === 3 && tui.annonces === 0,
      '⛔ le compte brut voit les 3 tuiles-fiches sans rien devoir au parseur ('
      + JSON.stringify(tui) + ')');
    /* ⛔ PRÉALABLE — le bandeau « Produits favoris » écrit lui aussi « à partir
       de » et un prix, mais JAMAIS « N offres ». Sans ce cas, un compteur qui
       gonflerait de deux tuiles par page resterait vert, et l'user chercherait
       un trou qui n'existe pas. */
    var avecBandeau = troisTuiles + '\n\nProduits favoris\n\nSmartphone 5G\nApple iPhone 17\n\n168\nNote ∅ 18/20\nà partir de\n784,99 €';
    var tuiB = pp.compterTuiles(avecBandeau);
    ok(tuiB.total === 3,
      '⛔ PRÉALABLE : le bandeau de produits favoris ne compte pas comme une tuile '
      + '— il écrit « à partir de » mais jamais « N offres » (' + tuiB.total + '/3)');
    /* ⛔ ET LE TITRE ATTENDU D'UNE FICHE EST SON TITRE, PAS SON SOUS-TITRE.
       Une fiche écrit titre PUIS sous-titre PUIS « N offres » : s'arrêter à la
       ligne du dessus rend « Pack outillage sans fil, 18 V, Li-Ion », qui ne
       se rapproche d'AUCUN titre rendu — et le compteur crierait au loup à
       chaque fiche. Un sabotage était resté vert faute de ce cas : la règle
       existait, rien ne la mesurait. */
    var attTuiles = pp.titresAttendus(troisTuiles);
    ok(attTuiles.indexOf('MAKITA ZZK368P3T') !== -1
      && attTuiles.indexOf('MAKITA ZZS572P2') !== -1,
      '⛔ le titre attendu d\'une fiche est SON TITRE, pas le sous-titre qui le '
      + 'suit (' + JSON.stringify(attTuiles) + ')');
    /* ⚠️ LE HARNAIS APPELAIT LE RAPPROCHEMENT AUTREMENT QUE LA PRODUCTION —
       corrigé le 09/08/2026. `api/admin.js` lui passe TROIS arguments : le
       texte, les titres rendus, ET LES RÉFÉRENCES LUES. Ici on n'en passait que
       deux. Tant que toute tuile s'appelait « MARQUE RÉF », les deux chemins se
       confondaient ; depuis qu'une carte peut porter un titre libre (référence
       en fin de ligne), ils divergent — et c'est le harnais qui était infidèle,
       pas le code. On appelle désormais comme la production appelle.
       ⛔ Un harnais qui n'exerce pas le vrai chemin ne garantit rien. */
    var titresRendus = rTuiles.items.map(function (x) { return x.name; })
      .concat(rTuiles.sansRef.map(function (x) { return x.titre; }));
    var refsRendues = rTuiles.items.map(function (x) { return x.sku; })
      .concat(rTuiles.sansRef.map(function (x) { return (x.car || {}).sku; }))
      .filter(Boolean);
    ok(pp.annoncesManquantes(troisTuiles, titresRendus, refsRendues).length === 0,
      '⛔ …et le rapprochement retombe donc à ZÉRO manquante sur une page dont '
      + 'tout est lu — un compteur qui crie au loup finit ignoré ('
      + JSON.stringify(pp.annoncesManquantes(troisTuiles, titresRendus, refsRendues)) + ')');
    /* ⚠️ PRÉALABLE — le rapprochement doit encore SAVOIR CRIER. Sans ce cas, un
       rapprochement qui rendrait toujours zéro passerait pour parfait. */
    ok(pp.annoncesManquantes(troisTuiles, [], []).length > 0,
      '⚠️ PRÉALABLE : le rapprochement signale bien les tuiles quand RIEN n\'a été '
      + 'lu — sinon « zéro manquante » ne veut rien dire');
    /* ⛔⛔ ARGENT — ET SON PRIX NE DOIT PAS ATTERRIR SUR LA DERNIÈRE ANNONCE.
       Trouvé en éprouvant une page mixte : la dernière annonce, que rien ne
       fermait, avalait ce bandeau et ressortait à 784,99 € — LE PRIX DE
       L'iPHONE — au lieu de ses 695,00 €. Même défaut que le téléphone posé
       sur une scie (E-309), resté vivant sur le chemin des annonces. */
    var derniereAnnonce = [
      'Nettoyeur haute pression 190 bars - MAKITA - ZZP111X1',
      'Vendu par : UnMarchand.fr', 'Détails de l’offre',
      '3 à 6 jours ouvrés', 'Livraison gratuite', '695,00 € TVA incluse',
      '', 'Produits favoris', '', 'Smartphone 5G', 'Apple iPhone 17',
      '', '168', 'Note ∅ 18/20', 'à partir de', '784,99 €'
    ].join('\n');
    var rDer = pi(derniereAnnonce, 'MAKITA');
    ok(toutesOffres(rDer).length === 1 && toutesOffres(rDer)[0].prix === 695.00,
      '⛔⛔ ARGENT : la DERNIÈRE annonce garde son prix (695,00 €) et n\'attrape '
      + 'pas celui du bandeau qui la suit — un prix d\'iPhone sur un nettoyeur ('
      + JSON.stringify(toutesOffres(rDer).map(function (x) { return x.prix; })) + ')');
    ok(!rDer.items.some(function (x) { return x.price === 784.99; })
      && !rDer.sansRef.some(function (x) { return x.prix === 784.99; }),
      '⛔⛔ ARGENT : et 784,99 € n\'apparaît NULLE PART — un prix qui n\'est celui '
      + 'd\'aucun outil de la marque ne doit devenir aucun coût d\'achat');

    /* ⛔⛔ ARGENT — LES FRAIS DE PORT PRIS POUR LE PRIX DE L'ARTICLE.
       Défaut que J'AI INTRODUIT en fermant la tuile sur « le premier prix
       rencontré ». Mesuré sur SON relevé suivant : DOUZE annonces sur
       trente-deux sont ressorties à 3,23 €, 9,95 €, 8,00 €, 18,50 € — le
       port. Idealo écrit « Frais de port : 3,23 € » AVANT « 691,53 € TVA
       incluse ». Un coût d'achat de 3 € au lieu de 691 € ne fausse pas un
       prix de vente, il le détruit.
       ⛔ Le remède n'est pas une liste de formulations (E-309 : on ne s'ancre
       jamais sur un libellé) mais une règle STRUCTURELLE — un total commence
       par son montant, des frais commencent par leur étiquette. Elle tient
       dans les trois langues de ses pages.
       ⚠️ Le harnais rejoue le gabarit EXACT de sa page, port compris. */
    var avecPort = [
      'Défonceuse sans fil MAKITA ZZW 620 H1T 18 V 12 mm Brushless + 1 batterie',
      'Vendu par : UnMarchand.fr', 'Détails de l’offre',
      '3 à 6 jours ouvrés', 'Frais de port : 3,23 €', '691,53 € TVA incluse',
      '',
      'Cloueuse sans fil MAKITA ZZN 930 P2 18 V 50 - 90 mm sans balais',
      'Vendu par : AutreMarchand.fr', 'Détails de l’offre',
      '24/48 heures', 'Frais de port : 9,95 €', '677,57 € TVA incluse'
    ].join('\n');
    var rPort = pi(avecPort, 'MAKITA');
    var prixPort = toutesOffres(rPort).map(function (x) { return x.prix; });
    ok(prixPort.length === 2 && prixPort.indexOf(691.53) !== -1 && prixPort.indexOf(677.57) !== -1,
      '⛔⛔ ARGENT : le prix retenu est celui de L\'ARTICLE, jamais les frais de '
      + 'port écrits juste au-dessus (' + JSON.stringify(prixPort) + ')');
    ok(prixPort.indexOf(3.23) === -1 && prixPort.indexOf(9.95) === -1,
      '⛔⛔ ARGENT : et aucun montant de port ne devient un coût d\'achat — 3 € au '
      + 'lieu de 691 € ne fausse pas un prix de vente, il le détruit');
    ok((rPort.perdus || []).length === 0,
      '⛔ et rien ne part au registre des pertes : le total ferme la tuile, donc '
      + 'aucun morceau d\'annonce ne traîne derrière ('
      + JSON.stringify((rPort.perdus || []).map(function (x) { return x.raison; })) + ')');
    /* ⛔ PRÉALABLE — une annonce SANS ligne de port reste lue. Sans lui, une
       règle qui exigerait un port avant le total passerait inaperçue. */
    var sansPort = pi([
      'Meuleuse compacte 125 mm - MAKITA - ZZG404S2T-QW',
      'Vendu par : UnMarchand.fr', 'Détails de l’offre',
      '24/48 heures', 'Livraison gratuite', '694,80 € TVA incluse'
    ].join('\n'), 'MAKITA');
    ok(toutesOffres(sansPort).length === 1 && toutesOffres(sansPort)[0].prix === 694.80,
      '⛔ PRÉALABLE : une annonce à livraison gratuite garde son prix ('
      + JSON.stringify(toutesOffres(sansPort).map(function (x) { return x.prix; })) + ')');
    /* ⛔⛔ ET QUAND IL N'Y A QUE DES FRAIS, IL N'Y A PAS DE PRIX. Cas
       discriminant : une annonce en rupture affiche son port et jamais son
       total. Un premier sabotage est resté VERT sans lui — la tuile étant
       déjà bornée, relâcher la recherche à rebours ne changeait rien sur les
       autres corpus. Ici, elle ramasserait 3,23 € et l'écrirait comme coût
       d'achat. ⛔ Aucun repli : sans montant en tête, pas de prix, et le bloc
       part au registre avec sa raison. Un vide se voit, un prix faux se
       propage. */
    var quePort = pi([
      'Perforateur SDS-Plus - MAKITA - ZZH273P2',
      'Vendu par : UnMarchand.fr', 'Détails de l’offre',
      'Frais de port : 3,23 €', 'Rupture de stock'
    ].join('\n'), 'MAKITA');
    ok(!quePort.sansRef.some(function (x) { return x.prix === 3.23; }),
      '⛔⛔ ARGENT : une annonce qui n\'affiche QUE ses frais de port n\'a pas de '
      + 'prix — on ne se rabat pas sur le port ('
      + JSON.stringify(quePort.sansRef.map(function (x) { return x.prix; })) + ')');
    ok((quePort.perdus || []).length >= 1,
      '⛔ …et elle est CONSIGNÉE plutôt que jetée : un vide se voit, un prix faux '
      + 'se propage');

    /* ⛔⛔ UN INSTRUMENT QUI CRIE AU LOUP FINIT IGNORÉ — et le jour où il a
       raison, personne ne l'écoute. Son relevé du 03/08 : 60 tuiles sur 60
       lues, tout juste, et le rapprochement en annonçait DIX « non lues ».
       Toutes fausses. Une FICHE ne se rapproche pas par son titre : la page
       écrit « DeWalt DWK301 (2 x 5,0 Ah + 2 x TSTAK VI) », le relevé rend
       « DEWALT DWK301 ». Même article, deux écritures — ce qui est stable
       entre les deux, c'est la RÉFÉRENCE.
       ⚠️ Le harnais rejoue ce gabarit exact et compare AVEC et SANS les réfs :
       ce qui doit être vrai, c'est l'écart entre les deux, pas un chiffre. */
    var pageEnrichie = [
      'MAKITA ZZK301 (2 x 5,0 Ah + 2 x TSTAK VI)', 'Pack outillage sans fil, 18 V',
      '12 offres', 'à partir de689,00 €', '',
      'MAKITA ZZH333 (1x Batterie 9 Ah + Chargeur ZZB118 + T-Stak VI)', 'Marteau perforateur',
      '7 offres', 'à partir de655,00 €', '',
      '35', '', '2 offres', 'à partir de640,00 €'
    ].join('\n');
    var rendusCourts = ['MAKITA ZZK301', 'MAKITA ZZH333'];
    var sansRefs = pp.annoncesManquantes(pageEnrichie, rendusCourts, []);
    var avecRefs = pp.annoncesManquantes(pageEnrichie, rendusCourts, ['ZZK301', 'ZZH333']);
    ok(avecRefs.length === 0,
      '⛔⛔ deux écritures du MÊME article se rapprochent par leur RÉFÉRENCE — '
      + 'sinon le compteur annonce des pertes qui n\'existent pas ('
      + JSON.stringify(avecRefs) + ')');
    /* PRÉALABLE — sans lui, une fonction qui ne signalerait plus JAMAIS rien
       passerait : c'est l'écart entre les deux appels qui prouve la règle. */
    ok(sansRefs.length === 2,
      '⛔ PRÉALABLE : sans les références, ces deux-là RESSORTENT — c\'est bien '
      + 'le rapprochement par réf qui les ferme, pas un silence général ('
      + sansRefs.length + '/2)');
    ok(avecRefs.sansTitreExploitable === 1,
      '⛔ et l\'ancre dont aucun titre exploitable n\'a pu être tiré (« 35 ») est '
      + 'comptée À PART : ce n\'est pas un produit perdu, c\'est mon extraction '
      + 'qui a raté — la ranger dans les pertes enverrait chercher au mauvais '
      + 'endroit (' + avecRefs.sansTitreExploitable + ')');
    /* ⛔ ET UNE TUILE RÉELLEMENT MANQUANTE DOIT ENCORE ÊTRE NOMMÉE. Sans ce
       cas, rapprocher par réf pourrait tout absorber et l'instrument
       redeviendrait muet — ce qu'on répare est le bruit, pas la vigilance. */
    var vraiTrou = pp.annoncesManquantes(pageEnrichie, ['MAKITA ZZK301'], ['ZZK301']);
    ok(vraiTrou.length === 1 && /ZZH333/.test(vraiTrou[0]),
      '⛔⛔ une tuile réellement non lue est TOUJOURS nommée — on supprime le '
      + 'bruit, jamais la vigilance (' + JSON.stringify(vraiTrou) + ')');

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
    /* ══ SÉRIE LIMITÉE — MÊME RÉFÉRENCE, AUTRE PRODUIT, AUTRE PRIX ═══════════
       ⛔⛔ Règle de l'user, 03/08 : « chez DeWALT il y a des outils en édition
       limitée et même des packs ; quand il y a écrit édition limitée, 99,9 %
       du temps c'est un pack McLaren, il faut faire très attention car la
       différence de prix est notable ».
       ⛔ C'est de l'argent : deux annonces portant la MÊME référence
       constructeur ne sont pas le même produit. Écrire le coût de la série
       limitée sur la fiche ordinaire affiche un prix qui ne correspond à rien ;
       l'inverse fait vendre à perte.
       ⚠️ Référence volontairement synthétique — un harnais ne nomme jamais une
       donnée du catalogue. */
    /* ══ LE SUFFIXE COMMERCIAL NE FAIT PAS L'IDENTITÉ ═══════════════════════
       ⛔⛔ Décision de l'user, 03/08 : « DCE079D1G-QW = DCE079D1G, ce sont
       exactement les mêmes produits […] sur idealo on n'a pas besoin de
       regarder le suffixe, tous les sites qui y sont sont européens ». Mesuré
       le même jour : 150 de ses 177 vraies références DeWALT portent un
       suffixe. Exiger le suffixe exact, c'est rater l'article dès que le
       marchand écrit la référence nue — le cas le plus courant. */
    var rr = pp.racineRef;
    ok(typeof rr === 'function', 'racineRef exportée');
    if (rr) {
      ok(rr('ZZE12345-QW') === 'ZZE12345' && rr('ZZE12345-QS') === 'ZZE12345'
        && rr('ZZE12345-XJ') === 'ZZE12345',
        '⛔ les marquages commerciaux tombent, la racine reste (obtenu '
        + JSON.stringify([rr('ZZE12345-QW'), rr('ZZE12345-QS'), rr('ZZE12345-XJ')]) + ')');
      ok(rr('zze12345-qw') === 'ZZE12345', 'la casse n\'entre pas en ligne de compte');
      /* ⛔⛔ TROIS PIÈGES, TOUS PRÉSENTS DANS SON CATALOGUE. */
      ok(rr('ZZD709NT-XJ') !== rr('ZZD709N-XJ'),
        '⛔⛔ ARGENT : « NT » et « N » diffèrent AVANT le tiret — NT désigne la version '
        + 'coffret. Couper au premier tiret les confondrait et écrirait un prix d\'outil '
        + 'nu sur une fiche à coffret (obtenu ' + rr('ZZD709NT-XJ') + ' contre '
        + rr('ZZD709N-XJ') + ')');
      ok(rr('ZZST1-81078') === 'ZZST1-81078',
        '⛔ un segment final de CHIFFRES est un numéro d\'article, pas un marquage : on '
        + 'ne le coupe jamais (obtenu ' + rr('ZZST1-81078') + ')');
      ok(rr('ZZLE14361GB-XJ') === 'ZZLE14361GB',
        '⛔ seul le DERNIER segment part : un « GB » à l\'intérieur reste (obtenu '
        + rr('ZZLE14361GB-XJ') + ')');
      ok(rr('AB-XJ') === 'AB-XJ',
        '⛔ une racine de moins de cinq signes n\'identifie plus rien : on garde '
        + 'l\'écriture complète plutôt que d\'accrocher n\'importe quoi');
      /* ⛔ PRÉALABLE MESURÉ SUR SON CATALOGUE, pas supposé : neutraliser le
         suffixe ne doit confondre AUCUNE de ses fiches. Le jour où deux fiches
         partagent une racine, l'index doit l'écarter — jamais l'arbitrer. */
      var vues = Object.create(null), collisions = 0;
      require('../api/_lib/catalog.js').loadCatalogAvec({}).forEach(function (p) {
        if (!p.sku) return;
        var r = rr(p.sku);
        if (r === String(p.sku).toUpperCase()) return;
        if (vues[r] && vues[r] !== p.id) collisions++;
        vues[r] = p.id;
      });
      ok(collisions === 0,
        '⛔⛔ aucune racine réclamée par deux fiches différentes dans le catalogue réel — '
        + 'sinon le rapprochement souple écrirait le coût d\'un article sur la fiche d\'un '
        + 'autre (obtenu ' + collisions + ' collision(s))');
    }

    /* ⛔⛔ LES DEUX GARDES DE L'INDEX DE RACINES, SUR DES DONNÉES FABRIQUÉES.
       Le catalogue réel n'en contient aucun cas — c'est une bonne nouvelle,
       mais un contrôle qui ne peut pas se déclencher ne vérifie rien. On monte
       donc les deux situations à la main.
       ⚠️ Références synthétiques : un harnais ne nomme jamais une donnée du
       catalogue. */
    var idxR = adm._internals && adm._internals.pwIndexerRacines;
    ok(typeof idxR === 'function', 'pwIndexerRacines exposée aux portes');
    if (idxR) {
      /* Cas 1 — la racine tombe sur une RÉFÉRENCE PRINCIPALE existante. */
      var fA = { id: 'a', sku: 'ZZR12345' }, fB = { id: 'b', sku: 'ZZR12345-QW' };
      var ix1 = Object.create(null);
      ix1[fA.sku] = fA; ix1[fB.sku] = fB;
      idxR([fA, fB], ix1);
      ok(ix1['ZZR12345'] === fA,
        '⛔⛔ ARGENT : une racine n\'écrase JAMAIS une référence principale. La fiche '
        + 'écrite en toutes lettres l\'emporte, sinon le coût de la variante s\'écrirait '
        + 'sur elle (obtenu ' + JSON.stringify(ix1['ZZR12345'] && ix1['ZZR12345'].id) + ')');
      /* Cas 2 — DEUX fiches réclament la même racine. */
      var fC = { id: 'c', sku: 'ZZR77777-QW' }, fD = { id: 'd', sku: 'ZZR77777-XJ' };
      var ix2 = Object.create(null);
      ix2[fC.sku] = fC; ix2[fD.sku] = fD;
      var bilanR = idxR([fC, fD], ix2);
      ok(ix2['ZZR77777'] === undefined && bilanR.ecartes === 1,
        '⛔⛔ ARGENT : une racine réclamée par DEUX fiches est ÉCARTÉE, jamais arbitrée. '
        + 'Trancher au hasard écrirait le coût d\'un article sur la fiche d\'un autre '
        + '(obtenu ' + JSON.stringify(ix2['ZZR77777'] && ix2['ZZR77777'].id) + ', écartées '
        + bilanR.ecartes + ')');
      /* Cas 3 — le cas utile marche vraiment. */
      var fE = { id: 'e', sku: 'ZZR99999-QS' };
      var ix3 = Object.create(null); ix3[fE.sku] = fE;
      idxR([fE], ix3);
      ok(ix3['ZZR99999'] === fE,
        '⛔ PRÉALABLE : une racine libre est bien posée — sans ça les deux gardes '
        + 'ci-dessus seraient vertes sur un index vide');
    }

    /* ══ APPARIER PAR LE NOM — SOUPLE SUR LES MOTS, DUR SUR LES MESURES ═════
       ⛔⛔ 379 fiches de son catalogue (30,9 %, 166 485,89 € de prix affichés)
       n'ont AUCUNE référence constructeur : elles se suivaient par leur nom
       MOT POUR MOT, et le balayage en retrouvait TROIS. L'user a posé le
       choix — réparer ou supprimer les 379. Supprimer effacerait un tiers du
       catalogue pour une limite d'appariement, pas pour une absence de
       produit.
       ⛔ Sa consigne encadre le remède : « crée une certaine souplesse […]
       mais il faut qu'ils soient précis toujours, c'est le plus important,
       car sinon le traqueur ne marchera pas bien. » Les assertions qui
       suivent gardent LES DEUX bouts : ce qui doit s'apparier, et surtout ce
       qui ne doit JAMAIS s'apparier.
       ⚠️ Références et libellés synthétiques — un harnais ne nomme jamais une
       donnée du catalogue. */
    /* ⛔⛔ RÉFÉRENCE ÉCRITE AVEC DES ESPACES — DÉFAUT D'ARGENT DU 09/08/2026.
       Sa capture et son balayage, mesurés : le comparateur écrit certaines
       cartes « <marque> DCG 405 N » (référence éclatée). Le parseur refuse de
       recoller — à raison —, la carte partait donc aux rejets ALORS QU'ELLE
       PORTAIT LE PRIX LE PLUS BAS, et le traqueur retenait une tuile plus
       chère : 225,42 € au lieu de 204,23 € sur la meuleuse, 244,13 € au lieu
       de 145,48 € sur le souffleur (98,65 € de trop, à chaque vente).
       ⛔ Le remède n'est PAS de recoller : c'est d'exiger que le recollage
       tombe EXACTEMENT sur une référence du catalogue. Le catalogue tranche,
       la forme ne tranche jamais.
       ⚠️ Références et libellés synthétiques (un harnais ne nomme jamais une
       donnée du catalogue) ; c'est le GABARIT qui vient de sa page. */
    var arr = pp.apparierParRefRecollee;
    ok(typeof arr === 'function', 'apparierParRefRecollee exportée');
    if (arr) {
      var fichesR = [{ sku: 'ZZQ405N', price: 200 }, { sku: 'ZZV100-XJ', price: 150 }];
      var lot = [
        { titre: 'MarqueZZ ZZQ 405 N', prix: 116.90 },              // ← la moins chère
        { titre: 'MarqueZZ ZZQ 405 N + 1x 4,0Ah', prix: 216.96 },   // ← un LOT
        { titre: 'MarqueZZ ZZQ 405 N (1x 5,0 Ah)', prix: 224.59 },  // ← un LOT
        { titre: 'MarqueZZ ZZV 100 XJ', prix: 81.18 },              // ← réf à tirets
        { titre: 'MarqueZZ ZZZ 999 X', prix: 50 },                  // ← aucune fiche
        { titre: 'bidon 600ML de graisse', prix: 12 }                // ← un mot, pas une réf
      ];
      var rr = arr(lot, fichesR, 'MARQUEZZ');
      var parSkuR = {}; rr.items.forEach(function (x) { parSkuR[x.sku] = x.price; });
      ok(parSkuR.ZZQ405N === 116.90,
        '⛔⛔ ARGENT : une carte dont la référence est écrite AVEC DES ESPACES est '
        + 'rapprochée quand le recollage tombe sur une fiche — sinon la tuile la MOINS '
        + 'CHÈRE est ignorée et le prix de vente monte à tort ('
        + JSON.stringify(parSkuR) + ')');
      ok(parSkuR['ZZV100-XJ'] === 81.18,
        '⛔ et la référence rendue est celle du CATALOGUE (avec ses tirets), jamais '
        + 'notre recollage (' + JSON.stringify(rr.items.map(function (x) { return x.sku; })) + ')');
      /* ⛔⛔ LA GARDE INVERSE, ET C'EST ELLE QUI COÛTERAIT LE PLUS CHER. Sur la
         MÊME page, deux lots recollent vers la même racine. Écrire leur prix
         sur l'outil nu, c'est le défaut que le projet interdit depuis le
         premier jour — un coût de pack sur la réf d'un composant. */
      ok(parSkuR.ZZQ405N !== 216.96 && parSkuR.ZZQ405N !== 224.59,
        '⛔⛔ ARGENT : un titre qui annonce un CONTENU (batterie, « + », capacité) est '
        + 'un LOT — son prix ne s\'écrit JAMAIS sur la référence nue');
      /* ⚠️ PRÉALABLE 1 — sans fiche correspondante, on ne devine pas. Sans ce
         cas, une règle qui recollerait TOUT resterait verte. */
      ok(!rr.items.some(function (x) { return /ZZZ999/.test(x.sku); }),
        '⚠️ PRÉALABLE : un recollage qui ne tombe sur AUCUNE fiche n\'est pas rapproché');
      /* ⚠️ PRÉALABLE 2 — un mot ordinaire suivi d'un nombre n'est pas une
         référence (défaut déjà payé : « bidon 600ML » donnait « BIDON600 »). */
      ok(rr.restants.some(function (x) { return /bidon/i.test(x.titre); }),
        '⚠️ PRÉALABLE : un mot en minuscules suivi d\'un nombre n\'est jamais une '
        + 'référence — et il reste LISTÉ, jamais effacé');
      ok(rr.items.length + rr.restants.length === lot.length,
        '⛔ rien ne disparaît : chaque entrée est soit rapprochée, soit rendue ('
        + rr.items.length + ' + ' + rr.restants.length + ' / ' + lot.length + ')');

      /* ⛔⛔ UNE RÉFÉRENCE PEUT COMMENCER PAR UN CHIFFRE — mesuré le 09/08/2026
         sur le catalogue : 59 fiches d'une des marques suivies portent une
         référence de cette forme (« 198458-6 », « 7104L », « 2012NB »). Le
         lecteur exigeait une LETTRE en tête : ces produits ne pouvaient donc
         JAMAIS recevoir de coût, quoi que le comparateur affiche.
         ⛔ Et c'est sûr ICI et nulle part ailleurs : un nombre nu ressemble à
         tout — un prix, une cote, une année. Il n'est retenu que s'il est ÉGAL
         à une référence du catalogue. Le préalable ci-dessous le prouve. */
      var fichesN = [{ sku: '997462-2', price: 30 }, { sku: '7994L', price: 1400 }];
      var lotN = [
        { titre: 'MarqueZZ Adaptateur de rail (997462-2)', prix: 25.23 },
        { titre: 'MarqueZZ 7994L', prix: 1365.41 },
        { titre: 'prix 2026 sur 1250 pieces', prix: 99 }        // ← aucun produit
      ];
      var rn = arr(lotN, fichesN, 'MARQUEZZ');
      var parN = {}; rn.items.forEach(function (x) { parN[x.sku] = x.price; });
      ok(parN['997462-2'] === 25.23 && parN['7994L'] === 1365.41,
        '⛔⛔ ARGENT : une référence qui commence par un CHIFFRE est lue quand le '
        + 'catalogue la reconnaît — sinon ces fiches ne reçoivent JAMAIS de coût ('
        + JSON.stringify(parN) + ')');
      /* ⚠️ PRÉALABLE — et un nombre qui n'est pas une référence n'en devient
         jamais une. Sans ce cas, la règle pourrait avaler n'importe quel chiffre
         de la page et rester verte. */
      ok(rn.restants.some(function (x) { return /2026/.test(x.titre); })
        && !rn.items.some(function (x) { return /2026|1250/.test(String(x.sku)); }),
        '⚠️ PRÉALABLE : un nombre quelconque du titre (année, quantité) ne devient '
        + 'JAMAIS une référence — seul le catalogue en décide');

      /* ══ LA RÉFÉRENCE ENTRE PARENTHÈSES EN FIN DE TITRE ═══════════════════
         ⛔⛔ MESURÉ EN VASE CLOS LE 10/08/2026 sur son balayage de 112 pages :
         DIX fiches — des kits « … (198458-6) » — étaient écartées parce que
         leur titre annonce un contenu. Or ces fiches SONT le kit : la
         référence finale nomme l'article vendu, les autres n'en sont que les
         composants.
         ⛔⛔ ET C'EST AUSSI UNE GARDE D'ARGENT : sur un titre du type
         « Patin pour ponceuse REF-A/REF-B (REF-PATIN) », l'ancienne lecture
         pouvait retenir la PONCEUSE citée en compatibilité — 9,10 € écrits sur
         une machine vendue 332,68 €. En ne lisant QUE la parenthèse finale, le
         composant cesse d'être confondu avec l'article. */
      var fichesP = [{ sku: 'ZZK-198458-6' }, { sku: 'ZZB1830B' }, { sku: 'ZZP9403J' },
        { sku: 'ZZPATIN-421648' }];
      var lotP = [
        { titre: 'MarqueZZ Power Source Kit 5,0Ah (ZZK-198458-6)', prix: 329.18 },
        { titre: 'MarqueZZ Power Source Kit (2x ZZB1830B + ZZC18RC)', prix: 114.26 },
        { titre: 'MarqueZZ Patin graphite pour ponceuse ZZP9403J (ZZPATIN-421648)', prix: 9.1 }
      ];
      var rp = arr(lotP, fichesP, 'MARQUEZZ');
      var parP = {}; rp.items.forEach(function (x) { parP[x.sku] = x.price; });
      ok(parP['ZZK-198458-6'] === 329.18,
        '⛔⛔ la référence ENTRE PARENTHÈSES en fin de titre désigne L\'ARTICLE — sans '
        + 'elle, dix kits du relevé mesuré restaient sans coût (obtenu '
        + JSON.stringify(parP) + ')');
      ok(parP['ZZPATIN-421648'] === 9.1 && parP['ZZP9403J'] === undefined,
        '⛔⛔ ARGENT : la machine citée en COMPATIBILITÉ ne reçoit pas le prix de '
        + 'l\'accessoire — c\'est la parenthèse finale qui nomme l\'article, jamais '
        + 'une référence du corps du titre');
      /* ⚠️ PRÉALABLE — un composant listé dans un lot reste écarté : la
         parenthèse doit être la DERNIÈRE chose du titre, pas n'importe où. */
      ok(parP['ZZB1830B'] === undefined,
        '⚠️ PRÉALABLE : un composant énuméré dans un lot n\'est JAMAIS rapproché — '
        + 'sinon un prix de pack tomberait sur une batterie seule');

      /* ══ LE « + » QUI ÉNUMÈRE LE CONTENU DE LA RÉFÉRENCE NOMMÉE ═══════════
         ⛔⛔ Mesuré au même endroit : un titre « <réf conditionnée> 18 V + 2x
         3,0 Ah + chargeur et coffret » était écarté, alors que le suffixe de
         CETTE référence décrit exactement ce contenu. Le « + » y détaille le
         kit nommé, il n'annonce pas un lot de deux produits.
         ⛔ ET LE DÉFAUT QUI L'EMPÊCHAIT ÉTAIT AILLEURS : le contenu se lisait
         par la qualification complète, dont le VERROU DE L'ENTONNOIR efface
         les ampères-heures dès que le titre est typé dans le rayon énergie —
         ce que « chargeur » et « Ah » provoquent justement. Le contenu se lit
         donc sur le TEXTE, avant tout classement.
         ⚠️ Suffixes choisis À L'EXÉCUTION dans la nomenclature : un harnais ne
         grave pas une grammaire qui vit dans le produit. */
      var tblSuf = pp.nomenclature && pp.nomenclature.SUFFIXES_MAKITA;
      var sufOk = null, sufAutre = null;
      Object.keys(tblSuf || {}).forEach(function (s) {
        var c = tblSuf[s];
        if (!c || typeof c.nbBatteries !== 'number') return;
        if (!sufOk && c.nbBatteries === 2 && c.ah) sufOk = { s: s, c: c };
        if (!sufAutre && c.nbBatteries === 0) sufAutre = { s: s, c: c };
      });
      ok(!!sufOk && !!sufAutre,
        '⚠️ PRÉALABLE : la nomenclature déclare un suffixe « 2 batteries + Ah » ET un '
        + 'suffixe « machine seule » — sans les deux, le cas ne prouve rien');
      if (sufOk && sufAutre) {
        var ahTxt = String(sufOk.c.ah).replace('.', ',');
        /* ⚠️ Référence ÉCLATÉE par des espaces — c'est la forme réelle du
           relevé, et c'est justement celle que le recollage traite. */
        var fichesC2 = [{ sku: 'ZZR450' + sufOk.s }, { sku: 'ZZR450' + sufAutre.s }];
        var rc2 = arr([
          { titre: 'MarqueZZ ZZR 450 ' + sufOk.s + ' 18 V + 2x ' + ahTxt + ' Ah + chargeur et coffret',
            prix: 278.04 },
          { titre: 'MarqueZZ ZZR 450 ' + sufAutre.s + ' 18 V + 2x ' + ahTxt + ' Ah + chargeur',
            prix: 111.11 }
        ], fichesC2, 'MARQUEZZ');
        var parC2 = {}; rc2.items.forEach(function (x) { parC2[x.sku] = x.price; });
        ok(parC2['ZZR450' + sufOk.s] === 278.04,
          '⛔⛔ un « + » qui ÉNUMÈRE le contenu de la référence nommée ne la disqualifie '
          + 'pas : le suffixe dit la même chose que le titre (obtenu '
          + JSON.stringify(parC2) + ')');
        /* ⛔⛔ ARGENT, LE PRÉALABLE QUI COMPTE : si le suffixe dit « machine
           seule » et que le titre annonce deux batteries, ils se CONTREDISENT.
           Rapprocher là écrirait un prix de kit sur un outil nu. */
        ok(parC2['ZZR450' + sufAutre.s] === undefined,
          '⛔⛔ ARGENT : un suffixe qui CONTREDIT le contenu annoncé fait refuser le '
          + 'rapprochement — sinon un prix de kit tomberait sur une machine seule');
      }
    }

    /* ⛔⛔ RACINE NUE ↔ FICHE CONDITIONNÉE — LE PLUS GROS POSTE, ET LE PLUS
       DANGEREUX (09/08/2026). Mesuré sur son balayage de 112 pages : 180 fiches
       sur 611 ne sont pas reconnues parce que le comparateur écrit la référence
       NUE là où la fiche porte son conditionnement.
       ⛔ Et la racine ne suffit JAMAIS à trancher : chez lui, une même racine
       désigne jusqu'à CINQ fiches (machine seule, en coffret, avec 2 batteries
       3 / 5 / 6 Ah). Cas mesuré : une fiche vendue 754,13 € et une annonce à
       352,18 € portant la même racine — les rapprocher ferait vendre à perte.
       ⚠️ Références synthétiques ; c'est la GRAMMAIRE qui vient de son catalogue. */
    var apc = pp.apparierParConfiguration;
    ok(typeof apc === 'function', 'apparierParConfiguration exportée');
    if (apc) {
      var fichesC = [{ sku: 'ZZH680Z' }, { sku: 'ZZH680RTJ' }, { sku: 'ZZH680RFJ' }];
      var nu   = { titre: 'MARQUEZZ ZZH680', prix: 192, sku: 'ZZH680',
        car: { sku: 'ZZH680', nbBatteries: 0 } };
      var kit5 = { titre: 'MARQUEZZ ZZH680', prix: 400, sku: 'ZZH680',
        car: { sku: 'ZZH680', nbBatteries: 2, ah: 5 } };
      var muet = { titre: 'MARQUEZZ ZZH680', prix: 350, sku: 'ZZH680',
        car: { sku: 'ZZH680' } };
      var flou = { titre: 'MARQUEZZ ZZH680', prix: 380, sku: 'ZZH680',
        car: { sku: 'ZZH680', nbBatteries: 2 } };
      var rc = apc([nu, kit5, muet, flou], fichesC, 'MAKITA');
      var parC = {}; rc.items.forEach(function (x) { parC[x.sku] = x.price; });
      ok(parC.ZZH680Z === 192 && parC.ZZH680RTJ === 400,
        '⛔⛔ ARGENT : une annonce qui ANNONCE sa configuration va sur la fiche qui '
        + 'porte la MÊME — l\'outil nu sur la fiche nue, le kit 2×5 Ah sur la fiche '
        + 'correspondante (' + JSON.stringify(parC) + ')');
      /* ⚠️ PRÉALABLE 1 — une annonce MUETTE n'est jamais rapprochée. C'est
         l'essentiel : sur le balayage mesuré, 2 254 annonces sur 2 254 étaient
         muettes. Sans ce refus, on écrirait un prix au hasard sur cinq fiches. */
      ok(rc.restants.some(function (x) { return x.prix === 350; })
        && !rc.items.some(function (x) { return x.price === 350; }),
        '⛔⛔ ARGENT : une annonce MUETTE sur son contenu n\'est JAMAIS rapprochée — '
        + 'rien ne permet de choisir entre l\'outil nu et le kit');
      /* ⚠️ PRÉALABLE 2 — l'ambiguïté ne s'arbitre pas : « 2 batteries » sans
         capacité laisse deux fiches candidates (5 Ah et 3 Ah). */
      ok(rc.restants.some(function (x) { return x.prix === 380; }),
        '⛔ deux fiches compatibles ⇒ on ne rapproche rien (l\'ambiguïté ne '
        + 's\'arbitre jamais)');
      /* ⚠️ PRÉALABLE 3 — la table est celle d'UNE marque. Appliquée à une
         autre, elle ferait le défaut qui avait fait chuter le typage de 70
         fiches quand la table des préfixes DeWALT a mordu du Makita. */
      ok(apc([nu], fichesC, 'DEWALT').items.length === 0,
        '⛔ la grammaire des suffixes ne vaut que pour SA marque');
      ok(rc.items.length + rc.restants.length === 4,
        '⛔ rien ne disparaît : chaque annonce est soit rapprochée, soit rendue');
    }

    /* ══ LE RATTRAPAGE — UNE RECHERCHE PAR RÉFÉRENCE MANQUANTE ════════════════
       ⛔⛔ POURQUOI IL EXISTE, ET C'EST MESURÉ (10/08/2026, sur son balayage de
       112 pages) : la grille de catégorie NE PEUT PAS atteindre 100 %. Sur les
       145 racines nues qu'elle montre et que le catalogue décline, **134 sont
       MUETTES** sur leur contenu, et les 11 qui parlent ne désignent aucune
       fiche unique — zéro rapprochement possible, quel que soit le code.
       ⛔ Ce que la porte défend : le compte de « ce qui reste » doit être JUSTE.
       Trop large, l'user rebalaie des références déjà couvertes ; trop étroit,
       il croit avoir fini alors qu'il manque des coûts — et un coût manquant
       laisse un prix ESTIMÉ, c'est-à-dire deviné à l'envers depuis le prix de
       vente. C'est de l'argent.
       ⚠️ Fiches et relevés SYNTHÉTIQUES, seuil de fraîcheur RELU dans le module
       (un seuil recopié se périme). */
    var rat = adm._internals && adm._internals.pwRattrapageEtapes;
    ok(typeof rat === 'function', 'pwRattrapageEtapes exposée aux portes');
    if (rat) {
      var planR = { patronRecherche: 'https://exemple.test/rech?q={ref}' };
      var maintenantR = 1700000000000;
      var fraisR = maintenantR - Math.floor(pp.SOURCE_FRESH_MS / 2);
      var perimeR = maintenantR - pp.SOURCE_FRESH_MS - 60000;
      var fichesR = [
        { id: 'f-couvert', sku: 'ZZR-COUVERT' },
        { id: 'f-jamais', sku: 'ZZR-JAMAIS' },
        { id: 'f-perime', sku: 'ZZR-PERIME' },
        { id: 'f-rupture', sku: 'ZZR-RUPTURE' },
        { id: 'f-autresource', sku: 'ZZR-AUTRESOURCE' }
      ];
      var ovR = {
        'f-couvert': { priceSources: { zzsrc: { ttc: 100, at: fraisR, enStock: true } } },
        'f-perime': { priceSources: { zzsrc: { ttc: 100, at: perimeR, enStock: true } } },
        'f-rupture': { priceSources: { zzsrc: { ttc: 100, at: fraisR, enStock: false } } },
        'f-autresource': { priceSources: { zzautre: { ttc: 100, at: fraisR, enStock: true } } }
      };
      var etR = rat(planR, fichesR, ovR, 'zzsrc', maintenantR);
      var skusR = etR.map(function (e) { return e.sku; }).sort();
      /* ⛔⛔ CHAQUE LIGNE DIT POURQUOI. « Il en manque 178 » sans motif ne se
         vérifie pas : l'user ne peut ni corriger, ni décider de supprimer. */
      var motifs = {}; etR.forEach(function (e) { motifs[e.sku] = e.motif; });
      ok(/jamais/.test(motifs['ZZR-JAMAIS'] || '')
        && /perime/.test(motifs['ZZR-PERIME'] || '')
        && /rupture/.test(motifs['ZZR-RUPTURE'] || '')
        && /autre source/.test(motifs['ZZR-AUTRESOURCE'] || ''),
        '⛔ chaque référence sort avec SON motif — jamais relevé, périmé, en rupture, '
        + 'autre source : quatre causes, quatre remèdes différents (obtenu '
        + JSON.stringify(motifs) + ')');
      /* ⛔⛔ E-227 : les overrides d'AVANT le format carte portent leur relevé
         dans `priceSrcTTC`/`priceSource`. Les ignorer déclarerait « jamais
         relevée » une fiche qui a un coût — et l'user irait rechercher ce qu'il
         possède déjà, sur une liste qu'il croit exacte. */
      /* ⚠️ Le slug se LIT à l'exécution : l'héritage n'est ressemé que pour une
         source DÉCLARÉE, et un slug inventé ferait passer ce cas à côté du
         chemin réel — vert sans avoir rien franchi. */
      var slugR = Object.keys(pp.SOURCES_ACTIVES || {})[0];
      ok(!!slugR, '⚠️ PRÉALABLE : au moins une source de relevé est déclarée active');
      var ovHeritage = { 'f-heritage': {} };
      ovHeritage['f-heritage'].priceSource = slugR;
      ovHeritage['f-heritage'].priceSrcTTC = 100;
      ovHeritage['f-heritage'].priceCheckedAt = fraisR;
      var etH = rat(planR, [{ id: 'f-heritage', sku: 'ZZR-HERITAGE' }],
        ovHeritage, slugR, maintenantR);
      ok(etH.length === 0,
        '⛔⛔ un relevé au FORMAT ANCIEN compte comme un relevé : sans ça la liste '
        + 'réclamerait des fiches déjà couvertes (obtenu ' + etH.length + ' à rechercher)');
      ok(JSON.stringify(skusR) === JSON.stringify(
        ['ZZR-AUTRESOURCE', 'ZZR-JAMAIS', 'ZZR-PERIME', 'ZZR-RUPTURE']),
        '⛔⛔ ARGENT : « il en reste » = jamais relevé · relevé PÉRIMÉ · relevé en RUPTURE · '
        + 'relevé d\'une AUTRE source. Une fiche déjà couverte par un relevé frais et '
        + 'achetable n\'y est PAS — sinon on rebalaie pour rien (obtenu '
        + JSON.stringify(skusR) + ')');
      /* ⚠️ PRÉALABLE — la fiche couverte est bien dans le lot de départ : sans ce
         cas, une fonction qui rend TOUT passerait l'assertion ci-dessus si elle
         était mal écrite. */
      ok(fichesR.length === etR.length + 1,
        '⚠️ PRÉALABLE : exactement une fiche sur cinq est couverte, les quatre autres '
        + 'restent à chercher (' + etR.length + '/' + fichesR.length + ')');
      ok(etR.every(function (e) { return e.url.indexOf('{ref}') === -1
        && e.url.indexOf(encodeURIComponent(e.sku)) !== -1; }),
        '⛔ chaque adresse porte SA référence, et le gabarit est bien remplacé — une '
        + 'adresse qui garderait `{ref}` enverrait 188 fois sur la même page ('
        + JSON.stringify(etR[0] && etR[0].url) + ')');
      /* ⚠️ PRÉALABLE — sans adresse de recherche déclarée, on ne fabrique RIEN.
         Une URL fournisseur inventée est la faute que la mémoire du projet
         interdit explicitement : elle se lit sur son écran, jamais d'imagination. */
      ok(rat({}, fichesR, {}, 'zzsrc', maintenantR).length === 0,
        '⛔ pas d\'adresse de recherche déclarée ⇒ aucune adresse fabriquée');
      /* La déclaration elle-même : chaque plan qui balaie une grille doit
         porter son adresse de recherche, sinon le rattrapage n'existe que pour
         une marque et l'autre reste plafonnée sans que rien ne le dise. */
      var plansMod = require('../api/_lib/traqueur-plans.js');
      var sansRech = plansMod.plansConnus().filter(function (c) {
        return !plansMod.PLANS[c].patronRecherche;
      });
      ok(sansRech.length === 0,
        '⛔ chaque plan de balayage déclare son adresse de recherche par référence — '
        + 'sans elle, sa marque est plafonnée par la grille et rien ne le dit ('
        + JSON.stringify(sansRech) + ')');

      /* ══ LE TABLEAU TÉLÉCHARGEABLE ════════════════════════════════════════
         ⛔⛔ DEMANDE DE L'USER, 10/08/2026 : « donne-moi une liste dans un
         tableau que je peux télécharger sur mon iPad […] absolument TOUTES
         celles qui n'ont pas été trouvées ». Je lui avais rendu un extrait de
         60 lignes : inutilisable, et il l'a dit. Ce qui se défend ici : la
         liste est ENTIÈRE, et chaque ligne reste lisible par un tableur. */
      var csv = adm._internals && adm._internals.pwRattrapageCsv;
      ok(typeof csv === 'function', 'pwRattrapageCsv exposée aux portes');
      if (csv) {
        /* Un titre qui contient le séparateur ET un guillemet : c'est le seul
           cas qui décale les colonnes, donc le seul qui vaille d'être testé. */
        var etCsv = etR.concat([{ sku: 'ZZR-PIEGE', motif: 'jamais releve',
          titre: 'Outil 3/4" ; modele "long"', prix: 1234.5,
          url: 'https://exemple.test/rech?q=ZZR-PIEGE' }]);
        var txt = csv(etCsv);
        var lg = txt.replace(/^﻿/, '').split('\r\n').filter(Boolean);
        ok(lg.length === etCsv.length + 1,
          '⛔⛔ TOUTES les lignes sortent, jamais un extrait — un tableau tronqué ne '
          + 'répond pas à « lesquelles exactement » (obtenu ' + (lg.length - 1)
          + ' pour ' + etCsv.length + ' références)');
        ok(txt.charCodeAt(0) === 0xFEFF && /\r\n/.test(txt),
          '⛔ marque d\'encodage en tête et fins de ligne CRLF — sans elles, un tableur '
          + 'rend les accents en charabia ou colle tout sur une ligne');
        /* ⛔ On RELIT la ligne comme un tableur le ferait — guillemets compris.
           Un `split(';')` naïf couperait à l'intérieur du champ cité : il
           accuserait un fichier correct, ou laisserait passer un fichier
           cassé. Le seul juge valable est un lecteur de CSV. */
        var lireCsv = function (ligne) {
          var champs = [], cur = '', dansCite = false;
          for (var i = 0; i < ligne.length; i++) {
            var ch = ligne[i];
            if (dansCite) {
              if (ch === '"') {
                if (ligne[i + 1] === '"') { cur += '"'; i++; } else dansCite = false;
              } else cur += ch;
            } else if (ch === '"') dansCite = true;
            else if (ch === ';') { champs.push(cur); cur = ''; }
            else cur += ch;
          }
          champs.push(cur);
          return champs;
        };
        var enTete = lireCsv(lg[0]);
        var piege = lireCsv(lg[lg.length - 1]);
        ok(piege.length === enTete.length
          && piege[1] === 'Outil 3/4" ; modele "long"',
          '⛔⛔ un titre qui contient le SÉPARATEUR et un guillemet se relit À '
          + 'L\'IDENTIQUE : une ligne décalée ferait lire un prix dans la colonne du '
          + 'motif (obtenu ' + piege.length + ' champs pour ' + enTete.length
          + ', titre ' + JSON.stringify(piege[1]) + ')');
        ok(piege[2] === '1234,5',
          '⛔ le prix porte la VIRGULE décimale — avec un point, le tableur français le '
          + 'lit comme du texte et aucun tri par prix ne marche (obtenu '
          + JSON.stringify(piege[2]) + ')');
        ok(csv([]).replace(/^﻿/, '').split('\r\n').filter(Boolean).length === 1,
          '⚠️ PRÉALABLE : plus rien à chercher ⇒ le tableau garde son en-tête et reste '
          + 'un fichier valide, il ne se vide pas');
      }
    }

    var apn = pp.apparierParNomSouple;
    ok(typeof apn === 'function', 'apparierParNomSouple exportée');
    if (apn) {
      var fchs = [
        { sku: 'ZZ-A1', srcNom: 'Raboteuse de chantier 1800 W 317 mm MARQUEZZ' },
        { sku: 'ZZ-A2', srcNom: 'Raboteuse de chantier 2000 W 317 mm MARQUEZZ' },
        { sku: 'ZZ-B1', srcNom: 'Lot de 5 lames 30x43 mm pour multi-cutter Métal MARQUEZZ' },
        { sku: 'ZZ-B2', srcNom: 'Lame 30x43 mm pour multi-cutter Métal MARQUEZZ' }
      ];
      var dit = function (t) { return { titre: t, prix: 199 }; };

      /* ⛔ CE QUI DOIT S'APPARIER : la même machine, écrite autrement. */
      var s1 = apn([dit('MarqueZZ raboteuse dégauchisseuse 1800W 317 mm')], fchs, 'MARQUEZZ');
      ok(s1.items.length === 1 && s1.items[0].sku === 'ZZ-A1',
        '⛔⛔ une reformulation du même outil est RETROUVÉE — c\'est tout l\'objet : '
        + 'idealo n\'écrit pas ses titres comme le fournisseur d\'origine (obtenu '
        + JSON.stringify(s1.items.map(function (i) { return i.sku; })) + ')');

      /* ⛔⛔ CE QUI NE DOIT JAMAIS S'APPARIER — une mesure qui diverge. */
      var s2 = apn([dit('MarqueZZ raboteuse dégauchisseuse 2000W 317 mm')], fchs, 'MARQUEZZ');
      ok(s2.items.length === 1 && s2.items[0].sku === 'ZZ-A2',
        '⛔⛔ ARGENT : la 2000 W va sur la fiche 2000 W, jamais sur la 1800 W. La '
        + 'souplesse porte sur les MOTS, jamais sur les mesures (obtenu '
        + JSON.stringify(s2.items.map(function (i) { return i.sku; })) + ')');

      /* ⛔⛔ L'AMBIGUÏTÉ NE S'ARBITRE PAS. Sans la puissance, les deux
         raboteuses sont également plausibles : on ne rapproche RIEN. */
      var s3 = apn([dit('MarqueZZ raboteuse dégauchisseuse 317 mm')], fchs, 'MARQUEZZ');
      ok(s3.items.length === 0 && s3.ambigus.length === 1,
        '⛔⛔ deux fiches également plausibles ⇒ AUCUN rapprochement. Trancher au '
        + 'hasard écrirait le coût d\'un article sur la fiche d\'un autre (obtenu '
        + s3.items.length + ' apparié(s), ' + s3.ambigus.length + ' ambigu(s))');

      /* ⛔⛔ UN LOT DE CINQ N'EST PAS UNE PIÈCE À L'UNITÉ — le défaut mesuré
         le 03/08, qui produisait les deux seuls faux positifs du corpus. */
      var s4 = apn([dit('MarqueZZ de 5 lames 30x43 mm pour multi-cutter Métal lot')],
        fchs, 'MARQUEZZ');
      ok(s4.items.length === 1 && s4.items[0].sku === 'ZZ-B1',
        '⛔⛔ ARGENT : « 5 lames » va sur le LOT DE 5, pas sur la lame à l\'unité. '
        + 'L\'inverse diviserait le coût par cinq et ferait vendre à perte (obtenu '
        + JSON.stringify(s4.items.map(function (i) { return i.sku; })) + ')');
      var s5 = apn([dit('MarqueZZ lame 30x43 mm pour multi-cutter Métal')], fchs, 'MARQUEZZ');
      ok(s5.items.length === 1 && s5.items[0].sku === 'ZZ-B2',
        '⛔ …et la pièce à l\'unité va sur la fiche à l\'unité (obtenu '
        + JSON.stringify(s5.items.map(function (i) { return i.sku; })) + ')');

      /* ⛔ UNE FICHE RÉCLAMÉE PAR DEUX ANNONCES EST ÉCARTÉE DES DEUX : sinon
         l'ORDRE des annonces déciderait, ce qui est un hasard. */
      var s6 = apn([dit('MarqueZZ raboteuse dégauchisseuse 1800W 317 mm'),
        dit('MarqueZZ raboteuse de chantier 1800 W 317 mm')], fchs, 'MARQUEZZ');
      ok(s6.items.length === 0 && s6.ambigus.length === 2,
        '⛔⛔ deux annonces qui réclament la MÊME fiche : aucune ne l\'obtient. Laisser '
        + 'l\'ordre trancher, c\'est tirer au sort quel prix on écrit (obtenu '
        + s6.items.length + ' apparié(s))');

      /* ⛔ UN TYPE DIFFÉRENT NE S'APPARIE JAMAIS, même si tout le reste colle. */
      var s7 = apn([dit('MarqueZZ scie circulaire 1800 W 317 mm')], fchs, 'MARQUEZZ');
      ok(s7.items.length === 0,
        '⛔⛔ une scie ne s\'apparie pas à une raboteuse, quelles que soient les mesures '
        + 'communes — le type est le premier verrou (obtenu '
        + JSON.stringify(s7.items.map(function (i) { return i.sku; })) + ')');

      /* ⛔ ET LE SEUIL DE CONCORDANCES : un titre trop pauvre ne suffit pas.
         Le seuil se RELIT dans le produit — un seuil recopié se périme. */
      ok(pp.CONCORDANCES_MIN >= 2,
        '⛔ il faut au moins deux mesures concordantes EN PLUS du type : sinon '
        + '« perceuse 18V » rapprocherait des dizaines de fiches (seuil lu : '
        + pp.CONCORDANCES_MIN + ')');
      ok(apn([dit('MarqueZZ raboteuse')], fchs, 'MARQUEZZ').items.length === 0,
        '⛔⛔ un titre sans aucune mesure n\'apparie RIEN — c\'est la porte qui empêche '
        + 'la souplesse de devenir de l\'à-peu-près');
    }

    /* ══ SUR UNE MACHINE, « PAS DE COFFRET ÉCRIT » VEUT DIRE NUE ════════════
       ⛔⛔ Règle de l'user, 03/08 : « il faut qu'on favorise les outils sans
       coffret, toujours ». Mesuré sur `DCM200N` : idealo affiche trois
       variantes de 226,88 € à 348,99 €, et le traqueur a retenu 249,99 € —
       une variante à coffret rapprochée d'une fiche d'outil nu. */
    var mNu = ec('MARQUEZZ ZZC8888 lime a bande 18V sans batterie', 'MARQUEZZ');
    var mCof = ec('MARQUEZZ ZZC8888 lime a bande 18V avec coffret TSTAK', 'MARQUEZZ');
    ok(mNu.coffret === 'AUCUN' && mCof.coffret && mCof.coffret !== 'AUCUN',
      '⛔ sur une MACHINE, l\'absence de coffret écrit vaut « AUCUN », pas `null` : un '
      + 'champ absent est une ignorance et une ignorance NE VOTE PAS (obtenu '
      + JSON.stringify([mNu.coffret, mCof.coffret]) + ')');
    var duelCof = pp.comparerCaracteristiques(mNu, mCof);
    ok(duelCof.compatible === false && duelCof.conflits.indexOf('coffret') !== -1,
      '⛔⛔ ARGENT : une annonce À COFFRET ne s\'apparie plus à une fiche d\'outil NU. '
      + 'Un prix de coffret sur une fiche nue gonfle le prix de vente d\'un article '
      + 'qu\'il n\'a pas acheté (obtenu ' + JSON.stringify(duelCof) + ')');
    ok(pp.comparerCaracteristiques(mNu,
      ec('MARQUEZZ ZZC8888 lime a bande 18V', 'MARQUEZZ')).compatible === true,
      '⛔ …et deux annonces NUES restent compatibles : la garde ne doit pas bloquer le '
      + 'cas normal, sinon plus aucun prix ne s\'écrit');
    ok(ec('Lame de scie circulaire 190 mm 24 dents', 'MARQUEZZ').coffret === null,
      '⛔ une LAME n\'a pas de coffret : l\'affirmer inventerait une caractéristique, et '
      + 'un champ inventé fait conflit avec du vide');

    var lim1 = ec('MARQUEZZ ZZL7777 perceuse 18V', 'MARQUEZZ');
    var lim2 = ec('MARQUEZZ ZZL7777 perceuse 18V edition limitee McLaren', 'MARQUEZZ');
    ok(lim1.editionLimitee === false && lim2.editionLimitee === true,
      '⛔ « édition limitée » est RELEVÉE, et son absence vaut FAUX — pas `undefined` : '
      + 'un champ absent est une ignorance, et une ignorance ne vote pas (obtenu '
      + JSON.stringify([lim1.editionLimitee, lim2.editionLimitee]) + ')');
    var duel = pp.comparerCaracteristiques(lim1, lim2);
    ok(duel.compatible === false && duel.conflits.indexOf('editionLimitee') !== -1,
      '⛔⛔ ARGENT : une SÉRIE LIMITÉE et sa version courante portent la même référence '
      + 'et ne valent pas le même prix. Les apparier écrirait le coût de l\'une sur la '
      + 'fiche de l\'autre — et dans un sens, ça fait vendre à perte (obtenu '
      + JSON.stringify(duel) + ')');
    ok(pp.comparerCaracteristiques(lim2,
      ec('MARQUEZZ ZZL7777 perceuse 18V McLaren', 'MARQUEZZ')).compatible === true,
      '⛔ …mais deux séries limitées restent compatibles entre elles : « McLaren » seul '
      + 'suffit à nommer la série, elle n\'écrit pas toujours « édition limitée »');
    ok(ec('MARQUEZZ ZZL7777 batterie unlimited runtime', 'MARQUEZZ').editionLimitee === false,
      '⛔ « unlimited » ne contient PAS « limited » au sens des bornes de mot — sans '
      + 'elles, la garde marquerait des machines ordinaires et bloquerait de vrais '
      + 'rapprochements');
    ok(ec('MARQUEZZ ZZL7777 Bohrschrauber 18V Sonderedition', 'MARQUEZZ').editionLimitee === true
      && ec('MARQUEZZ ZZL7777 drill 18V Limited Edition', 'MARQUEZZ').editionLimitee === true,
      '⛔ idealo mélange les langues sur une même page : une garde qui ne tient qu\'en '
      + 'français ne tient pas');

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

    /* ═══ DEUX TITRES SANS TYPE, RELEVÉS SUR SA PAGE (03/08) ══════════════
       Aucun mot du vocabulaire ne les nomme — il a fallu deux règles neuves. */
    var kit2 = ec('Kit DEWALT DCS999X9 + DCS888X8 (2 x 5.0 Ah + DCB115 + TSTAK II)', 'DEWALT');
    ok(kit2.type === 'pack d\'outils' && kit2.rayon === 'combo',
      '⛔ DEUX RÉFÉRENCES DE MACHINE = UN LOT DE MACHINES. « Kit … DCS999X9 + '
      + 'DCS888X8 » ne porte aucun mot qui le nomme, et le préfixe ne dit que '
      + '« sciage » : il sortait SANS TYPE (' + kit2.type + ')');
    var vib = ec('Vibrateur à béton DCE999X9-XJ + 2 batteries 18V 5 Ah + 1 Chargeur DCB999-QW DEWALT', 'DEWALT');
    ok(vib.type === 'vibrateur',
      '⛔ PRÉALABLE : un titre qui porte DEUX références mais dont le NOM est '
      + 'écrit reste ce que son nom dit. Un nom écrit l\'emporte toujours sur un '
      + 'comptage de références (' + vib.type + ')');
    /* ⛔ UNE MACHINE LIVRÉE AVEC SA BATTERIE ET SON COFFRET N'EST PAS UN LOT
       DE MACHINES. Le titre porte trois références — mais deux sont de
       l'énergie et du rangement. ⚠️ Un premier essai testait « Lot de
       batteries 10 x DCB999 » : une SEULE référence, donc la règle des deux
       ne s'exerçait pas et le sabotage restait vert. */
    var uneSeule = ec('DEWALT DCS999X9-XJ DCB999-QW DWST999', 'DEWALT');
    ok(uneSeule.type !== 'pack d\'outils',
      '⛔ trois références dont une batterie et un coffret = UNE machine avec ses '
      + 'accessoires, pas un lot de machines (' + uneSeule.type + ')');
    ok(ec('Lot de batteries 10 x DCB999 18V Li-Ion XR - 10 X 5.0Ah', 'DEWALT').type === 'batterie',
      'préalable : un lot de batteries reste des batteries');
    ok(ec('DEWALT DCD999X9 Diamètre de l\'hélice 160 mm, M14', 'DEWALT').type === 'malaxeur',
      '⛔ idealo décrit le malaxeur par son OUTIL — « diamètre de l\'hélice » — et '
      + 'jamais par son nom : la fiche sortait sans type pour cette seule raison');

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

    var fauxAdmin = { firestore: { FieldValue: {
      serverTimestamp: function () { return { _sentinelle: true }; },
      delete: function () { return { _supprime: true }; } } } };
    function fauxRes() {
      return { code: 0, out: null,
        status: function (c) { this.code = c; return this; },
        json: function (o) { this.out = o; return this; } };
    }
    /* La base factice émule DEUX réalités Firestore que l'émulateur officiel
       cache : (1) chaque get() sur la collection se COMPTE ; (2) chaîner un
       second where (id == + at >=) exigerait un index composite (règle E) —
       ici il JETTE, comme la production jette FAILED_PRECONDITION. */
    function fauxDb(seedOv, seedLog, seedConfig, options) {
      var snapLib = require('../api/_lib/snapshot.js');
      var compte = { lecturesOv: 0, lecturesSnapshot: 0, lecturesDocs: 0,
        ecrituresParId: {}, patchsParId: {},
        configDocs: Object.assign({}, seedConfig || {}) };
      /* ⛔ LE SNAPSHOT EXISTE, comme en production depuis le 09/08 : les 4
         documents agrégés sont SEMÉS depuis `seedOv`. Sans eux, `lireSnapshot`
         rendrait null, le traqueur retomberait TOUJOURS sur la collection, et
         l'assertion « une instance froide coûte 4 lectures » serait verte pour
         la mauvaise raison — le repli. `options.sansSnapshot` rejoue la
         PREMIÈRE VIE (aucun shard) pour prouver ce repli-là séparément. */
      if (!(options && options.sansSnapshot)) {
        for (var ns = 0; ns < snapLib.NB_SHARDS; ns++) {
          compte.configDocs[snapLib.PREFIXE + ns] = { _maj: { _sentinelle: true } };
        }
        Object.keys(seedOv || {}).forEach(function (id) {
          compte.configDocs[snapLib.PREFIXE + snapLib.shardDe(id)][id] =
            JSON.parse(JSON.stringify(seedOv[id]));
        });
      }
      return {
        _compte: compte,
        /* `getAll` est CE QUE LIT le snapshot : 4 références, 4 lectures — le
           compteur est l'instrument, pas une décoration. */
        getAll: function () {
          var refs = Array.prototype.slice.call(arguments);
          compte.lecturesSnapshot++;
          compte.lecturesDocs += refs.length;
          return Promise.resolve(refs.map(function (r) {
            var id = r && r._id;
            var present = compte.configDocs[id] !== undefined;
            return { id: id, exists: present,
              data: function () { return compte.configDocs[id] || {}; } };
          }));
        },
        /* ⛔ LE LOT D'ÉCRITURES, ET IL SE MESURE (09/08/2026). Sans lui, la base
           factice ne saurait pas exécuter le chemin réel — et « non exécuté
           n'est pas vert ». `commits` est ce qui prouve le groupage : une page
           qui applique N prix doit rendre 1 lot, pas 2N écritures isolées. */
        batch: function () {
          var ops = [];
          return {
            set: function (ref, donnees) { ops.push({ ref: ref, donnees: donnees }); return this; },
            commit: function () {
              compte.commits = (compte.commits || 0) + 1;
              compte.opsParCommit = (compte.opsParCommit || []).concat([ops.length]);
              ops.forEach(function (o) {
                if (o.ref && o.ref.set) o.ref.set(o.donnees);
              });
              ops = [];
              return Promise.resolve();
            }
          };
        },
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
                /* ⚠️ La référence porte son identifiant : un LOT reçoit des
                   références, pas des chemins — sans ça il ne saurait pas quoi
                   compter, et l'assertion du groupage ne prouverait rien. */
                return { _coll: 'product_overrides', _id: id,
                  set: function (patch) {
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
              add: function () { compte.journal = (compte.journal || 0) + 1; return Promise.resolve(); },
              /* Un lot ne peut pas appeler `add()` (il n'attend pas de réponse) :
                 il demande une référence neuve par `doc()` sans argument. */
              doc: function () {
                return { _coll: 'price_watch_log', _id: '(auto)',
                  set: function () { compte.journal = (compte.journal || 0) + 1; return Promise.resolve(); } };
              }
            };
          }
          if (nom === 'config') {
            return { doc: function (id) { return {
              _coll: 'config', _id: id,
              get: function () {
                return Promise.resolve({ exists: compte.configDocs[id] !== undefined,
                  data: function () { return compte.configDocs[id] || {}; } });
              },
              /* ⛔ `merge:true` fusionne AUSSI les cartes imbriquées (un shard de
                 snapshot est une carte {id: override}) : une fusion à plat
                 écraserait tout l'override à chaque écriture partielle, et le
                 harnais mentirait dans le sens rassurant. `merge:false` (la
                 reconstruction) remplace, lui, le document entier. */
              set: function (patch, opts) {
                var cible = (opts && opts.merge === false)
                  ? {} : Object.assign({}, compte.configDocs[id] || {});
                Object.keys(patch || {}).forEach(function (k) {
                  var v = patch[k];
                  if (v && v._supprime) { delete cible[k]; return; }
                  if (v && typeof v === 'object' && !Array.isArray(v) && !v._sentinelle
                      && cible[k] && typeof cible[k] === 'object' && !Array.isArray(cible[k])) {
                    cible[k] = Object.assign({}, cible[k], v);
                  } else { cible[k] = v; }
                });
                compte.configDocs[id] = cible;
                return Promise.resolve();
              }
            }; } };
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
        ok(dbS._compte.lecturesSnapshot === 1,
          '⛔ BALAYAGE : deux pages scan=1 = UN chargement des overrides ('
          + dbS._compte.lecturesSnapshot + ') — sans cache, 67 pages ≈ 160 000 lectures et le quota meurt');
        /* ⛔ 4 LECTURES, PAS 1 708 (10/08/2026 — capture Firestore de l'user :
           4 400 lectures pour 3 écritures en 2 minutes). Le cache de rafale ne
           protège QUE l'instance qui l'a rempli : sur son balayage Makita, 2
           pages sur 112 sont parties froides et ont chacune relu la collection
           entière. La collection ne doit plus être touchée tant que le snapshot
           existe — c'est la seule mesure qui rende ce coût BORNÉ. */
        ok(dbS._compte.lecturesOv === 0 && dbS._compte.lecturesDocs === 4,
          '⛔ BALAYAGE : une instance FROIDE lit les 4 documents du snapshot, JAMAIS la '
          + 'collection product_overrides (~1 708 documents) — obtenu : '
          + dbS._compte.lecturesOv + ' lecture(s) de collection, '
          + dbS._compte.lecturesDocs + ' document(s) de snapshot');
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
        ok(dbN._compte.lecturesSnapshot === 2 && dbN._compte.lecturesOv === 0,
          'sans &scan=1, rechargement à CHAQUE appel (' + dbN._compte.lecturesSnapshot
          + ') — un relevé isolé garde la fraîcheur maximale, et il coûte 4 documents, '
          + 'pas la collection (' + dbN._compte.lecturesOv + ' lecture(s) de collection)');
        ok(appelsLoadCatalog === 2,
          'sans &scan=1, le catalogue fusionné passe toujours par loadCatalog ('
          + appelsLoadCatalog + '/2) — le comportement historique ne change pas');
        catMod.loadCatalog = vraiLoadCatalog;

        /* ⛔ PREMIÈRE VIE : aucun shard n'existe → le traqueur DOIT retomber sur
           la collection (sinon il travaillerait sur une carte vide et écraserait
           des prix — J4), et RECONSTRUIRE le snapshot pour que l'appel suivant
           ne repaie pas 1 708 lectures. Sans ce cas, le repli serait du code
           jamais exécuté, donc jamais vert. */
        scanReset();
        var seedVierge = {}; seedVierge[cible.id] = { price: courantHaut };
        var dbV = fauxDb(seedVierge, [], null, { sansSnapshot: true });
        var rV1 = fauxRes();
        await admFn(reqPage(cible.sku, { scan: '1' }), rV1, fauxAdmin, dbV);
        ok(rV1.code === 200 && dbV._compte.lecturesOv === 1,
          '⛔ SNAPSHOT ABSENT : le traqueur relit la collection UNE fois au lieu de '
          + 'travailler à vide (obtenu : ' + dbV._compte.lecturesOv + ' lecture(s), code '
          + rV1.code + ')');
        ok(rV1.out && rV1.out.counts && rV1.out.counts.applied === 1,
          '⛔ SNAPSHOT ABSENT : le prix vu par le repli est le MÊME (la baisse forcée de '
          + '100 € s\'applique) — un repli qui perdrait les overrides referait des hausses '
          + 'fantômes (obtenu : ' + JSON.stringify(rV1.out && rV1.out.counts) + ')');
        /* Le semis est volontairement NON attendu (il ne doit pas retarder la
           réponse) : on laisse la file des micro-tâches se vider avant de le
           mesurer, sinon l'assertion testerait une course, pas un fait. */
        await new Promise(function (r) { setTimeout(r, 0); });
        /* ⛔ ET LA PREUVE QUE LE SEMIS SERT : une SECONDE instance froide (cache
           vidé) ne doit plus toucher la collection. Compter les documents semés
           ne prouverait rien — c'est la lecture suivante qui paie ou ne paie
           pas. Sans ce tour, une page froide sur deux repaierait 1 708 lectures
           et le quota mourrait exactement comme le 10/08. */
        scanReset();                                   // instance froide suivante
        var rV2 = fauxRes();
        await admFn(reqPage(cible.sku, { scan: '1' }), rV2, fauxAdmin, dbV);
        ok(rV2.code === 200 && dbV._compte.lecturesOv === 1 && dbV._compte.lecturesDocs >= 4,
          '⛔ SNAPSHOT SEMÉ : la 2e instance FROIDE lit les documents agrégés, plus jamais '
          + 'la collection (obtenu : ' + dbV._compte.lecturesOv + ' lecture(s) de collection '
          + 'au total pour 2 instances froides, ' + dbV._compte.lecturesDocs
          + ' document(s) de snapshot, code ' + rV2.code + ')');
        ok(rV2.out && rV2.out.counts && rV2.out.counts.unchanged === 1,
          '⛔ SNAPSHOT SEMÉ : et il porte le MÊME prix — la 2e instance ne réapplique rien '
          + '(J4 : un semis qui perdrait les overrides referait des hausses fantômes ; '
          + 'obtenu : ' + JSON.stringify(rV2.out && rV2.out.counts) + ')');

        /* ══ LE RAPPROCHEMENT PAR CONFIGURATION DOIT RECEVOIR QUELQUE CHOSE ═══
           ⛔⛔ DÉFAUT MESURÉ SUR SON BALAYAGE DU 10/08/2026 : `parConfiguration`
           valait **0 sur 112 pages** alors que le relevé portait 886 annonces
           énonçant leur nombre de batteries. La règle était juste — ses
           assertions unitaires passaient — mais le point d'entrée lui donnait
           `unknown`, une liste ENCORE VIDE à cet endroit du fichier.
           ⛔ Les assertions unitaires ne pouvaient PAS le voir : elles appellent
           la fonction directement. Seul un passage par le point d'entrée le
           démasque — c'est le branchement qui était mort, pas la règle.
           ⛔ Fiche choisie À L'EXÉCUTION : on cherche une racine que le
           catalogue décline en plusieurs conditionnements, dont UN SEUL porte
           la configuration annoncée. Rien n'est nommé en dur. */
        var nomenT = pp.nomenclature;
        var racinesT = Object.create(null), skusT = Object.create(null);
        prods.forEach(function (p) {
          if (!p || !p.sku) return;
          skusT[String(p.sku).toUpperCase()] = p;
          var l = nomenT && nomenT.lireSuffixeMakita ? nomenT.lireSuffixeMakita(p.sku) : null;
          if (!l || !l.config) return;
          (racinesT[l.racine] = racinesT[l.racine] || []).push({ p: p, cfg: l.config });
        });
        var casCfg = null;
        Object.keys(racinesT).forEach(function (r) {
          if (casCfg || skusT[r]) return;              // la racine nue ne doit PAS être une fiche
          var v = racinesT[r];
          if (v.length < 2) return;                    // sans variantes, la règle ne tranche rien
          var conc = v.filter(function (c) {
            return c.cfg.nbBatteries === 2 && Number(c.cfg.ah) === 5;
          });
          if (conc.length !== 1) return;
          if (!(Number(conc[0].p.price) > 0) || conc[0].p.priceLocked || conc[0].p.hidden) return;
          casCfg = { racine: r, fiche: conc[0].p, variantes: v.length,
            marque: String(conc[0].p.brand || '') };
        });
        ok(!!casCfg,
          '⚠️ PRÉALABLE : le catalogue décline au moins une racine en plusieurs '
          + 'conditionnements dont UN SEUL porte « 2 batteries 5 Ah » — sans ce cas, '
          + 'le branchement du rapprochement par configuration n\'est pas exercé');
        if (casCfg) {
          function pageNue(suffixeTexte) {
            var l = [casCfg.marque.toUpperCase() + ' ' + casCfg.racine + suffixeTexte,
              'description outil', '5', '94 offres', 'à partir de 450,00 €'];
            while (l.join('\n').length < 260) {
              l.push('ligne de bourrage sans marque ni prix pour le seuil du corps');
            }
            return l.join('\n');
          }
          function reqNue(txt) {
            return { method: 'POST',
              query: { type: 'price-watch', brand: casCfg.marque.toUpperCase(),
                source: 'idealo', dryRun: '1', inconnus: '1' },
              body: { text: txt } };
          }
          scanReset();
          var rCfg = fauxRes();
          await admFn(reqNue(pageNue(', 2 batteries 5 Ah')), rCfg, fauxAdmin, fauxDb({}, []));
          var recusCfg = ((rCfg.out && rCfg.out.applied) || [])
            .concat((rCfg.out && rCfg.out.flagged) || []);
          ok(rCfg.out && rCfg.out.counts && rCfg.out.counts.parConfiguration === 1
            && recusCfg.length === 1
            && String(recusCfg[0].sku).toUpperCase() === String(casCfg.fiche.sku).toUpperCase(),
            '⛔⛔ ARGENT — une annonce à RACINE NUE qui énonce sa configuration doit '
            + 'atteindre la fiche qui porte le MÊME conditionnement, en passant par le '
            + 'point d\'entrée (racine déclinée en ' + casCfg.variantes + ' fiches ; '
            + 'obtenu parConfiguration=' + JSON.stringify(rCfg.out && rCfg.out.counts
              && rCfg.out.counts.parConfiguration) + ', reçus '
            + JSON.stringify(recusCfg.map(function (x) { return x.sku; })) + ')');
          ok(rCfg.out && rCfg.out.counts && rCfg.out.counts.unknown === 0,
            '⛔ …et elle ne compte PLUS comme inconnue : une même annonce ne peut pas être '
            + 'à la fois reconnue et rendue « jamais vue » (obtenu unknown='
            + JSON.stringify(rCfg.out && rCfg.out.counts && rCfg.out.counts.unknown) + ')');
          /* ⚠️ PRÉALABLE INVERSE — la même annonce MUETTE sur son contenu reste
             écartée. Sans lui, l'assertion ci-dessus serait satisfaite par un
             rapprochement au jugé, qui écrirait un coût d'outil nu sur un kit. */
          scanReset();
          var rMuet = fauxRes();
          await admFn(reqNue(pageNue('')), rMuet, fauxAdmin, fauxDb({}, []));
          ok(rMuet.out && rMuet.out.counts && rMuet.out.counts.parConfiguration === 0
            && rMuet.out.counts.unknown === 1,
            '⛔⛔ ARGENT — la MÊME annonce sans sa configuration n\'est JAMAIS rapprochée : '
            + 'elle repart en inconnue (obtenu parConfiguration='
            + JSON.stringify(rMuet.out && rMuet.out.counts && rMuet.out.counts.parConfiguration)
            + ', unknown=' + JSON.stringify(rMuet.out && rMuet.out.counts
              && rMuet.out.counts.unknown) + ')');
          scanReset();
        }

        /* ══ CE QUE LE SERVEUR CLASSE DOIT SORTIR CLASSÉ ═══════════════════════
           ⛔⛔ QUESTION DE L'USER, 10/08/2026 : « est-ce que sur les 112 pages tu
           arrives à classer correctement les produits ? ». MESURÉ sur son
           balayage du jour : `name` vaut « MARQUE RÉF » pour **3 168 annonces
           sur 3 168** — donc, depuis la réponse, RIEN à classer. Or le serveur
           TYPE chaque tuile à partir de la ligne de description qui suit le
           titre : la famille était calculée à l'intérieur, puis jetée. Même
           défaut que le contenu (batteries / chargeur / coffret) la veille.
           ⛔ Le type est choisi À L'EXÉCUTION dans la nomenclature — un harnais
           ne nomme jamais une donnée du catalogue. */
        var idxT = (pp.nomenclature && pp.nomenclature.INDEX) || [];
        var libT = null;
        for (var li = 0; li < idxT.length; li++) {
          if (idxT[li].famille === 'machine' && /^[a-zà-ÿ -]{6,}$/.test(idxT[li].libelle)) {
            libT = idxT[li]; break;
          }
        }
        ok(!!libT, '⚠️ PRÉALABLE : la nomenclature déclare au moins un type de machine '
          + 'utilisable pour ce cas');
        if (libT) {
          var pageClassee = function (descr) {
            var l = ['DEWALT ZZKLASSE1', descr, '7', '31 offres', 'à partir de 250,00 €'];
            while (l.join('\n').length < 260) {
              l.push('ligne de bourrage sans marque ni prix pour le seuil du corps');
            }
            return l.join('\n');
          };
          var reqClasse = function (txt) {
            return { method: 'POST',
              query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo',
                dryRun: '1', inconnus: '1' },
              body: { text: txt } };
          };
          scanReset();
          var rCl = fauxRes();
          await admFn(reqClasse(pageClassee(libT.libelle + ' sans fil 18 V')),
            rCl, fauxAdmin, fauxDb({}, []));
          var incCl = ((rCl.out || {}).unknown || [])[0] || {};
          ok(incCl.typ === libT.libelle && incCl.fam === libT.famille,
            '⛔⛔ CLASSEMENT : une annonce que le catalogue ne connaît pas doit sortir avec '
            + 'sa FAMILLE et son TYPE — c\'est cette information qui permet de créer la '
            + 'fiche, et le serveur la calculait déjà sans la rendre (attendu '
            + JSON.stringify([libT.famille, libT.libelle]) + ', obtenu '
            + JSON.stringify([incCl.fam, incCl.typ]) + ')');
          /* ⚠️ PRÉALABLE INVERSE — on ne fabrique JAMAIS un classement. Une tuile
             qui ne dit rien de ce qu'elle est sort sans famille : un type inventé
             enverrait une fiche dans le mauvais rayon, et c'est l'user qui le
             découvrirait sur son site. */
          scanReset();
          var rCl0 = fauxRes();
          await admFn(reqClasse(pageClassee('article divers')), rCl0, fauxAdmin, fauxDb({}, []));
          var incCl0 = ((rCl0.out || {}).unknown || [])[0] || {};
          ok(incCl0.sku && incCl0.fam === null && incCl0.typ === null,
            '⛔ …et une annonce qui ne dit RIEN de ce qu\'elle est sort SANS famille : '
            + 'un classement inventé est pire que pas de classement (obtenu '
            + JSON.stringify([incCl0.sku, incCl0.fam, incCl0.typ]) + ')');
          scanReset();
        }

        /* ⛔ EN BALAYAGE, LES REJETS DOIVENT POUVOIR SE LIRE (09/08/2026). Le
           balayage réel du jour comptait 1 093 `sansRef` sur 67 pages — comptés
           mais jamais montrés : impossible de dire si un produit « estimé » du
           catalogue s'y cachait ou n'était simplement pas sur les pages. Même
           drapeau que `unknown` (&inconnus=1, que le Raccourci envoie déjà), et
           forme COMPACTE (titre tronqué + prix) pour ne pas faire déborder le
           presse-papier du raccourci sur 67 pages. */
        scanReset();
        var pageAvecRejet = pageIdealo(cible.sku, '450,00')
          + '\nDEWALT Soufflerie de chantier thermique grand format\n'
          + 'Vendu par : UnMarchand.fr\nDétails de l’offre\n'
          + '24/48 heures\n89,99 € TVA incluse\nDétails de l’offre';
        var rRej = fauxRes();
        await admFn({ method: 'POST', query: { type: 'price-watch', brand: 'DEWALT',
          source: 'idealo', scan: '1', inconnus: '1' }, body: { text: pageAvecRejet } },
          rRej, fauxAdmin, fauxDb({}, []));
        var lRej = (rRej.out && rRej.out.sansRef) || [];
        ok(rRej.out && rRej.out.scan === true && lRej.length >= 1
          && typeof (lRej[0] && lRej[0].titre) === 'string' && lRej[0].titre.length <= 90
          && !('car' in (lRej[0] || {})),
          '⛔ balayage + &inconnus=1 : les rejets `sansRef` SORTENT, compacts (titre '
          + 'tronqué + prix, jamais l\'objet entier) — obtenu ' + JSON.stringify(lRej.slice(0, 2)));
        /* ⚠️ PRÉALABLE — sans le drapeau, le balayage reste léger et le compteur
           reste exact : la donnée n'est pas perdue, elle est repliée. */
        scanReset();
        var rRej0 = fauxRes();
        await admFn({ method: 'POST', query: { type: 'price-watch', brand: 'DEWALT',
          source: 'idealo', scan: '1' }, body: { text: pageAvecRejet } },
          rRej0, fauxAdmin, fauxDb({}, []));
        /* ⛔⛔ LA LISTE DES FICHES JAMAIS VUES NE PART QU'À LA DERNIÈRE PAGE
           (09/08/2026). L'user : « j'ai l'impression que c'est encore plus
           long ». MESURÉ sur son balayage : la réponse fait 63 Ko dont 55 Ko
           pour cette seule liste (605 fiches), renvoyée à CHAQUE page — 5,7 Mo
           sur 112 pages. Cadence : 11,24 s/page sur ce balayage contre 3,51 s
           sur celui de 67 pages. Ce n'est pas le calcul (2,38 ms/page mesurés),
           c'est le TRANSFERT.
           ⚠️ Le mode balayage se reconnaît à `scan=1` ; le plan de la marque
           dit combien de pages sont attendues. Tant qu'il en manque, seul le
           COMPTE part — le détail attend. */
        scanReset();
        var rMi = fauxRes();
        await admFn(reqPage(cible.sku, { scan: '1', manquants: '1' }),
          rMi, fauxAdmin, fauxDb({}, []));
        var couvMi = (rMi.out || {}).couverture || {};
        ok(couvMi.fichesJamaisVuesDetail === undefined && couvMi.fichesJamaisVuesDetailDiffere === true,
          '⛔⛔ VITESSE : en cours de balayage, la liste complète des fiches jamais vues '
          + 'ne part PAS — et son absence est DITE, pas laissée croire vide ('
          + JSON.stringify({ detail: couvMi.fichesJamaisVuesDetail !== undefined,
            differe: couvMi.fichesJamaisVuesDetailDiffere }) + ')');
        /* ⚠️ PRÉALABLE 1 — le COMPTE, lui, part à chaque page : c'est lui qui
           dit où on en est. Sans ce cas, on aurait pu tout supprimer. */
        ok(typeof couvMi.fichesJamaisVues === 'number',
          '⚠️ PRÉALABLE : le COMPTE des fiches jamais vues part quand même — rien '
          + 'n\'est perdu, seul le détail attend ('
          + JSON.stringify(couvMi.fichesJamaisVues) + ')');
        /* ⛔⛔ PRÉALABLE 2, LE PLUS IMPORTANT : la liste doit ARRIVER quand le
           balayage est fini. Sans ce cas, « différer » serait indistinguable de
           « perdre » — et l'user n'aurait plus jamais la liste. Hors balayage,
           il n'y a qu'une page : c'est la dernière. */
        scanReset();
        var rFin = fauxRes();
        await admFn(reqPage(cible.sku, { manquants: '1' }), rFin, fauxAdmin, fauxDb({}, []));
        var couvFin = (rFin.out || {}).couverture || {};
        ok(Array.isArray(couvFin.fichesJamaisVuesDetail),
          '⛔⛔ PRÉALABLE : la liste ARRIVE bien quand le balayage est terminé — '
          + 'différer n\'est pas perdre (' + (Array.isArray(couvFin.fichesJamaisVuesDetail)
            ? couvFin.fichesJamaisVuesDetail.length + ' entrées' : 'ABSENTE') + ')');

        /* ⛔⛔ ET EN BALAYAGE RÉEL, ELLE N'ARRIVAIT JAMAIS (mesuré le 10/08/2026
           sur SES DEUX zips). Le balayage se répartit sur PLUSIEURS instances
           sans serveur — 110 pages + 2, puis 111 + 1 — et le cumul vit dans la
           mémoire d'UNE instance. Aucune n'a donc jamais vu « toutes les
           pages » : `pagesManquantes` valait 2 chez l'une, 110 chez l'autre, et
           la condition « il n'en manque plus AUCUNE » n'a pu être vraie nulle
           part. Résultat : 0 page sur 112 portait la liste.
           ⛔ Le cas précédent ne pouvait pas le voir : il passe HORS balayage,
           là où il n'y a qu'une page. Celui-ci rejoue une VRAIE rafale, page
           après page, et regarde à quel moment la liste part.
           ⚠️ Pages synthétiques toutes DIFFÉRENTES : c'est le nombre de pages
           DISTINCTES qui fait avancer la rafale, deux pages identiques ne
           comptent que pour une. */
        scanReset();
        var dbRaf = fauxDb({}, []);
        var vuAvecReste = null, vuSansListe = null, dernierReste = null;
        for (var pg = 0; pg < 66; pg++) {
          var rPg = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo',
              scan: '1', manquants: '1', dryRun: '1' },
            body: { text: pageIdealo(cible.sku, '450,00') + '\nrepere de page unique ' + pg } },
            rPg, fauxAdmin, dbRaf);
          var cPg = (rPg.out || {}).couverture || {};
          dernierReste = cPg.pagesManquantes;
          if (cPg.pagesManquantes > 2 && Array.isArray(cPg.fichesJamaisVuesDetail) === false) {
            vuSansListe = cPg.pagesManquantes;
          }
          if (cPg.pagesManquantes > 0 && cPg.pagesManquantes <= 2
              && Array.isArray(cPg.fichesJamaisVuesDetail)) {
            vuAvecReste = cPg;
          }
        }
        ok(vuSansListe !== null,
          '⚠️ PRÉALABLE : en plein balayage, tant qu\'il manque plus que la tolérance, '
          + 'la liste ne part PAS (reste observé : ' + JSON.stringify(vuSansListe) + ')');
        ok(vuAvecReste !== null,
          '⛔⛔ LA LISTE PART MÊME S\'IL RESTE QUELQUES PAGES — sans cette tolérance, un '
          + 'balayage réparti sur plusieurs instances ne la rend JAMAIS : mesuré 0 page sur '
          + '112 le 10/08 (dernier reste observé : ' + JSON.stringify(dernierReste) + ')');
        ok(vuAvecReste && vuAvecReste.fichesJamaisVuesPagesVues > 0
          && vuAvecReste.fichesJamaisVuesPagesVues < vuAvecReste.fichesJamaisVuesPagesAttendues,
          '⛔ …et elle DIT sur combien de pages elle est calculée : une liste établie sur '
          + 'moins que le plan entier peut porter un faux absent, et l\'écart doit se LIRE '
          + '(obtenu ' + JSON.stringify(vuAvecReste && [vuAvecReste.fichesJamaisVuesPagesVues,
            vuAvecReste.fichesJamaisVuesPagesAttendues]) + ')');
        scanReset();

        /* ⛔⛔ ET LE FOURNISSEUR RESSERT LA MÊME PAGE (mesuré le 10/08/2026 sur
           SON relevé) : une instance a traité **110 pages dont 43 EN DOUBLE** —
           67 contenus distincts seulement. Au-delà d'un certain rang, la
           pagination du site rend toujours la même page.
           ⛔ Conséquence, et c'est le défaut : « il manque 45 pages » restait
           vrai alors que le raccourci avait FINI sa boucle. La liste des fiches
           jamais vues n'attend pas la couverture, elle attend la FIN — les deux
           comptes ne mesurent pas la même chose, et les confondre l'a supprimée
           une seconde fois.
           ⚠️ Ici, TOUTES les pages portent le même contenu : les distinctes
           restent à 1 pendant que les traitées montent jusqu'au plan. */
        scanReset();
        var dbDbl = fauxDb({}, []);
        /* ⚠️ L'empreinte d'une page se calcule sur ses MONTANTS et exige d'en
           trouver au moins quatre : une page à un seul prix n'a pas d'identité,
           et le compte des distinctes retomberait sur celui des requêtes — le
           cas ne prouverait alors plus rien. On fabrique donc une vraie grille. */
        var lignesDbl = [];
        [cible.sku, 'ZZDBL1', 'ZZDBL2', 'ZZDBL3', 'ZZDBL4'].forEach(function (s, n) {
          lignesDbl.push('DEWALT ' + s, 'description outil', '5', '94 offres',
            'à partir de ' + (410 + n * 10) + ',00 €');
        });
        while (lignesDbl.join('\n').length < 260) {
          lignesDbl.push('ligne de bourrage sans marque ni prix pour le seuil du corps');
        }
        var pageIdentique = lignesDbl.join('\n');
        var rDbl = null, resteDbl = null;
        for (var pd = 0; pd < 67; pd++) {
          var rD = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo',
              scan: '1', manquants: '1', dryRun: '1' },
            body: { text: pageIdentique } }, rD, fauxAdmin, dbDbl);
          rDbl = (rD.out || {}).couverture || {};
          resteDbl = rDbl.pagesManquantes;
        }
        ok(rDbl && rDbl.pagesEnDouble > 0 && resteDbl > 3,
          '⚠️ PRÉALABLE : des pages resservies à l\'identique laissent la COUVERTURE '
          + 'incomplète (' + JSON.stringify([rDbl && rDbl.pagesEnDouble, resteDbl])
          + ') — sans ce cas, les deux comptes seraient indistinguables');
        ok(rDbl && rDbl.fichesJamaisVuesPagesTraitees >= 67
          && Array.isArray(rDbl.fichesJamaisVuesDetail),
          '⛔⛔ LA LISTE PART QUAND LA BOUCLE EST FINIE, pas quand la couverture est '
          + 'complète : un fournisseur qui ressert la même page ne doit pas supprimer '
          + 'la seule liste qui dise QUOI aller chercher (traitées : '
          + JSON.stringify(rDbl && rDbl.fichesJamaisVuesPagesTraitees) + ', distinctes : '
          + JSON.stringify(rDbl && rDbl.fichesJamaisVuesPagesVues) + ', liste : '
          + (Array.isArray(rDbl && rDbl.fichesJamaisVuesDetail) ? 'présente' : 'ABSENTE') + ')');
        scanReset();

        /* ⛔⛔ LES ÉCRITURES PARTENT EN UN SEUL LOT (09/08/2026, demande de
           l'user : « est-ce que les traqueurs peuvent être beaucoup plus
           rapides ? »). MESURÉ sur SES deux balayages du soir : chaque produit
           dont le prix bouge déclenchait DEUX écritures qui attendaient chacune
           leur réponse — 216 allers-retours sur DeWALT (67 pages), 650 sur
           Makita (112 pages). Le lot les envoie en une fois.
           ⛔ Ce qui se vérifie ici est un INVARIANT, pas un chiffre : quel que
           soit le nombre de prix appliqués, la page ne doit produire QU'UN lot
           tant qu'elle reste sous la borne de Firestore. */
        scanReset();
        var seedLot = {}; seedLot[cible.id] = { price: courantHaut };
        var dbLot = fauxDb(seedLot, []);
        var rLot = fauxRes();
        await admFn(reqPage(cible.sku, {}), rLot, fauxAdmin, dbLot);
        ok((dbLot._compte.commits || 0) === 1,
          '⛔⛔ VITESSE : une page d\'écriture ne produit QU\'UN lot, quel que soit le '
          + 'nombre de prix appliqués — sinon chaque produit rouvre une connexion et '
          + 'attend sa réponse (obtenu : ' + (dbLot._compte.commits || 0) + ' lot(s), '
          + JSON.stringify(dbLot._compte.opsParCommit) + ' opérations)');
        /* ⚠️ PRÉALABLE 1 — le lot doit contenir QUELQUE CHOSE. Un lot vide
           commité une fois passerait l'assertion ci-dessus sans rien écrire :
           c'est exactement la forme « vert sans avoir rien franchi ». */
        ok((dbLot._compte.opsParCommit || [])[0] >= 2,
          '⚠️ PRÉALABLE : le lot porte au moins l\'override ET le journal — un lot vide '
          + 'commité une fois passerait pour un groupage réussi ('
          + JSON.stringify(dbLot._compte.opsParCommit) + ')');
        /* ⚠️ PRÉALABLE 2 — et les écritures ARRIVENT vraiment. Grouper ne doit
           pas faire disparaître ce qu'on écrit : le prix doit avoir bougé. */
        ok((dbLot._compte.ecrituresParId[cible.id] || 0) >= 1
          && rLot.out && rLot.out.counts && rLot.out.counts.applied === 1,
          '⛔⛔ ARGENT : grouper ne fait RIEN disparaître — l\'override est bien écrit et '
          + 'le prix appliqué (écritures ' + (dbLot._compte.ecrituresParId[cible.id] || 0)
          + ', appliqués ' + JSON.stringify(rLot.out && rLot.out.counts && rLot.out.counts.applied) + ')');
        /* ⛔ Et le compte de lots est RENDU : une optimisation qu'on ne mesure
           pas depuis le raccourci finit par se faire défaire sans qu'on le voie. */
        ok((rLot.out.counts || {}).lotsEcriture === 1,
          '⛔ le nombre de lots est rendu dans la réponse ('
          + JSON.stringify((rLot.out.counts || {}).lotsEcriture) + ')');

        /* ⛔⛔ CE QUI DÉCIDE DU PRIX NE DOIT PAS ÊTRE JETÉ (09/08/2026).
           Mesuré sur son balayage : 2 254 annonces portent une référence SANS
           suffixe de conditionnement — impossible de dire si c'est la machine
           NUE ou un kit avec batteries, alors que l'écart de prix va du simple
           au double. Le serveur LIT pourtant ce contenu dans le sous-titre de
           la tuile, et `unknown` ne rendait que référence + prix : la donnée
           qui tranche était produite puis perdue. Sans elle, apparier ces
           annonces reviendrait à DEVINER sur un prix. */
        scanReset();
        var lignesContenu = ['DEWALT ZZW680', 'Scie circulaire sans fil, 2 batteries, 3,5 kg',
          '5', '94 offres', 'à partir de 192,76 €', 'Détails du produit'];
        /* Le serveur refuse un corps trop court (garde légitime) : on bourre
           jusqu'au seuil, sans marque ni prix, comme le gabarit voisin. */
        while (lignesContenu.join('\n').length < 260) {
          lignesContenu.push('ligne de bourrage sans marque ni prix pour atteindre le seuil du corps');
        }
        var pageContenu = lignesContenu.join('\n');
        var rCont = fauxRes();
        await admFn({ method: 'POST', query: { type: 'price-watch', brand: 'DEWALT',
          source: 'idealo', inconnus: '1' }, body: { text: pageContenu } },
          rCont, fauxAdmin, fauxDb({}, []));
        var inc = ((rCont.out || {}).unknown || []).filter(function (u) { return /ZZW680/.test(u.sku || ''); })[0];
        ok(inc && inc.nBat === 2,
          '⛔⛔ ARGENT : une annonce sans fiche rend le CONTENU lu (batteries), pas '
          + 'seulement sa référence et son prix — sans lui, on ne peut pas distinguer '
          + 'une machine nue d\'un kit, et apparier deviendrait deviner ('
          + JSON.stringify(inc) + ')');
        /* ⚠️ PRÉALABLE — la forme reste COMPACTE : 112 pages passent par le
           presse-papier d'un raccourci, et une réponse illisible n'est pas
           vérifiable.
           ⛔ L'INVARIANT, PAS UN COMPTE RECOPIÉ (recentré le 10/08/2026). La
           borne « au plus 6 clés » a rougi le jour où le CLASSEMENT est venu
           s'ajouter au contenu — pour une raison qui n'est pas la sienne : elle
           défendait un chiffre, pas une propriété. Ce qu'on veut vraiment :
           aucune valeur imbriquée, et une empreinte franchement plus petite que
           l'objet de qualification complet, relu À L'EXÉCUTION. */
        var carPlein = pp.extraireCaracteristiques(lignesContenu[1], 'DEWALT') || {};
        ok(inc && !('car' in inc)
          && Object.keys(inc).every(function (k) {
            return inc[k] === null || typeof inc[k] !== 'object';
          })
          && JSON.stringify(inc).length * 2 < JSON.stringify(carPlein).length,
          '⚠️ PRÉALABLE : la forme reste compacte — que des valeurs simples, et une '
          + 'empreinte deux fois moindre que l\'objet de qualification entier (obtenu '
          + JSON.stringify(inc && Object.keys(inc)) + ' = ' + JSON.stringify(inc).length
          + ' signes contre ' + JSON.stringify(carPlein).length + ')');

        /* ⛔⛔ UNE FICHE QUI PLANTE NE DOIT JAMAIS EMPORTER LA PAGE (09/08/2026).
           Mesuré sur SON balayage : la page 494 sur 67 est revenue en erreur
           entière — « documentPath must point to a document » — parce qu'UN
           produit porte une barre oblique dans son identifiant (la référence
           constructeur en contient une). La base lit la barre comme un
           séparateur de chemin, l'exception est remontée jusqu'au point
           d'entrée, et les ~60 relevés de la page sont partis avec, sans trace.
           UN produit en a fait perdre SOIXANTE.
           ⛔ Deux garanties à tenir, et les DEUX sont éprouvées ici : la page
           répond quand même (200), et ce qui n'a pas pu s'écrire est LISTÉ.
           ⚠️ La base factice n'a pas le comportement de la vraie : c'est la
           GARDE (identifiant refusé avant écriture) qu'on éprouve, pas le
           message d'erreur du fournisseur — on ne recopie pas ce qu'on ne
           contrôle pas. */
        var cibleBarre = null;
        for (var cb = 0; cb < prods.length; cb++) {
          if (String(prods[cb].id || '').indexOf('/') !== -1) { cibleBarre = prods[cb]; break; }
        }
        ok(!!cibleBarre,
          '⚠️ PRÉALABLE : le catalogue porte au moins une fiche dont l\'identifiant '
          + 'contient une barre oblique — sans elle, ce cas ne serait pas éprouvé '
          + 'et la garde pourrait mourir sans qu\'on le voie');
        if (cibleBarre) {
          scanReset();
          var rBarre = fauxRes();
          await admFn({ method: 'POST', query: { type: 'price-watch', brand: 'DEWALT',
            source: 'idealo' }, body: { text: pageIdealo(cibleBarre.sku, '450,00') } },
            rBarre, fauxAdmin, fauxDb({}, []));
          ok(rBarre.code === 200 && rBarre.out && rBarre.out.ok === true,
            '⛔⛔ ARGENT : une fiche dont l\'identifiant est inécrivable ne fait PAS '
            + 'tomber la page — les autres relevés doivent survivre (code '
            + rBarre.code + ')');
          var refuses = (rBarre.out && rBarre.out.idsRefuses) || [];
          ok(refuses.length >= 1 && /\//.test(String(refuses[0].id || ''))
            && String(refuses[0].motif || '').length > 10,
            '⛔ …et elle est LISTÉE avec son motif : écarté n\'est pas effacé ('
            + JSON.stringify(refuses.slice(0, 1)) + ')');
          ok((rBarre.out.counts || {}).idsRefuses >= 1,
            '⛔ …et COMPTÉE dans le rapport — un incident lisible vaut mieux qu\'un '
            + 'incident silencieux (' + JSON.stringify((rBarre.out.counts || {}).idsRefuses) + ')');
        }

        ok(rRej0.out && Array.isArray(rRej0.out.sansRef) && rRej0.out.sansRef.length === 0
          && rRej0.out.counts && rRej0.out.counts.sansRef >= 1,
          '⚠️ PRÉALABLE : sans &inconnus=1, `sansRef` sort VIDE mais son COMPTEUR reste '
          + 'exact (obtenu : ' + JSON.stringify(rRej0.out && rRej0.out.counts
          && rRej0.out.counts.sansRef) + ')');

        /* ══ LA MOYENNE DE BAISSE, ET LES DIX À VÉRIFIER AVANT D'ÉCRIRE ═════
           ⛔⛔ Demande de l'user, 03/08 : « la moyenne de baisse qu'on a pu
           faire pour tous ces produits », et « dix produits qui auront une
           baisse la plus élevée, je vais aller les vérifier AVANT de modifier
           les prix ». Aucune de ces deux réponses n'existait : son raccourci
           ne lui rend que la DERNIÈRE des 67 réponses, et les dix plus fortes
           baisses du balayage ne sont pas celles de la dernière page.
           ⚠️ Deux fiches CHOISIES À L'EXÉCUTION, jamais nommées ; leurs prix
           courants sont fabriqués à partir du newPrice que le modèle réel
           vient de rendre — un seuil recopié se périme. */
        var cible2 = null;
        for (var c2 = 0; c2 < prods.length; c2++) {
          var pc2 = prods[c2];
          if (pc2 === cible || String(pc2.brand || '').toUpperCase() !== 'DEWALT') continue;
          if (!pc2.sku || pc2.priceLocked || pc2.hidden || !(Number(pc2.price) > 0)) continue;
          if (!/^[A-Z][A-Z0-9.\/-]{2,}[A-Z0-9]$/.test(String(pc2.sku)) || !/\d/.test(pc2.sku)) continue;
          cible2 = pc2; break;
        }
        ok(!!cible2 && cible2.sku !== cible.sku,
          '⛔ PRÉALABLE : deux fiches DeWALT distinctes à réf sûre — sans deux produits, '
          + 'une moyenne et un classement ne vérifient rien');
        if (cible2) {
          // Le newPrice de la 2ᵉ fiche s'apprend lui aussi du modèle réel.
          scanReset();
          var rApp2 = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', dryRun: '1' },
            body: { text: pageIdealo(cible2.sku, '450,00') } }, rApp2, fauxAdmin, fauxDb({}, []));
          var rec2 = (rApp2.out && rApp2.out.applied && rApp2.out.applied[0])
            || (rApp2.out && rApp2.out.unchanged && rApp2.out.unchanged[0]);
          ok(!!(rec2 && rec2.newPrice > 0),
            '⛔ PRÉALABLE : newPrice de la 2ᵉ fiche appris du modèle réel ('
            + JSON.stringify(rApp2.out && rApp2.out.counts) + ')');

          if (rec2 && rec2.newPrice > 0) {
            /* Fiche A : prix courant = 2 × le nouveau → baisse de 50 %.
               Fiche B : prix courant = 1,25 × le nouveau → baisse de 20 %. */
            /* ⛔ ET UNE TROISIÈME FICHE QUI MONTE. Sans elle, « produits vus »
               et « produits en baisse » sont le même nombre : la moyenne
               pourrait être divisée par le mauvais dénominateur sans que rien
               ne le montre — et elle paraîtrait alors plus douce qu'elle
               n'est. Elle prouve aussi que les HAUSSES sont comptées : ne
               montrer que les baisses ferait d'un rapport un argumentaire. */
            var cible3 = null;
            for (var c3 = 0; c3 < prods.length; c3++) {
              var pc3 = prods[c3];
              if (pc3 === cible || pc3 === cible2) continue;
              if (String(pc3.brand || '').toUpperCase() !== 'DEWALT') continue;
              if (!pc3.sku || pc3.priceLocked || pc3.hidden || !(Number(pc3.price) > 0)) continue;
              if (!/^[A-Z][A-Z0-9.\/-]{2,}[A-Z0-9]$/.test(String(pc3.sku)) || !/\d/.test(pc3.sku)) continue;
              cible3 = pc3; break;
            }
            /* Une QUATRIÈME fiche, jamais vue par les pages précédentes : le
               contrôle du prix écarté doit porter sur un produit ABSENT du
               cumul, sinon il ne ferait qu'écraser une entrée existante et le
               nombre de produits comparés ne bougerait pas — la porte
               resterait verte pour la mauvaise raison. */
            var cible4 = null;
            for (var c4 = 0; c4 < prods.length; c4++) {
              var pc4 = prods[c4];
              if (pc4 === cible || pc4 === cible2 || pc4 === cible3) continue;
              if (String(pc4.brand || '').toUpperCase() !== 'DEWALT') continue;
              if (!pc4.sku || pc4.priceLocked || pc4.hidden || !(Number(pc4.price) > 0)) continue;
              if (!/^[A-Z][A-Z0-9.\/-]{2,}[A-Z0-9]$/.test(String(pc4.sku)) || !/\d/.test(pc4.sku)) continue;
              cible4 = pc4; break;
            }
            var seedB = {};
            seedB[cible.id] = { price: Math.round(rec0.newPrice * 2 * 100) / 100 };
            seedB[cible2.id] = { price: Math.round(rec2.newPrice * 1.25 * 100) / 100 };
            if (cible3) seedB[cible3.id] = { price: Math.round(rec0.newPrice * 0.5 * 100) / 100 };
            var dbB = fauxDb(seedB, []);
            scanReset();
            var rB1 = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', scan: '1', dryRun: '1' },
              body: { text: pageIdealo(cible.sku, '450,00') } }, rB1, fauxAdmin, dbB);
            var rB2 = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', scan: '1', dryRun: '1' },
              body: { text: pageIdealo(cible2.sku, '450,00') } }, rB2, fauxAdmin, dbB);
            if (cible3) {
              var rBh = fauxRes();
              await admFn({ method: 'POST',
                query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', scan: '1', dryRun: '1' },
                body: { text: pageIdealo(cible3.sku, '450,00') } }, rBh, fauxAdmin, dbB);
              var bilH = rBh.out && rBh.out.couverture && rBh.out.couverture.baisses;
              ok(bilH && bilH.enHausse === 1 && bilH.produitsCompares === 3,
                '⛔⛔ une HAUSSE est comptée et rendue : ne montrer que les baisses ferait '
                + 'd\'un rapport un argumentaire (obtenu ' + JSON.stringify(bilH
                  && bilH.enHausse) + ' hausse(s) sur ' + JSON.stringify(bilH
                  && bilH.produitsCompares) + ' comparés)');
              ok(bilH && (bilH.plusFortesBaisses || []).every(function (x) { return x.euros > 0; }),
                '⛔ …et elle n\'entre PAS dans la liste des plus fortes BAISSES');
            }
            /* ⛔⛔ UN PRIX ÉCARTÉ N'EST PAS UNE BAISSE. Une source hors des
               bornes absolues part en `flagged` : le traqueur REFUSE de
               l'écrire. La faire entrer dans la moyenne ferait mentir le
               rapport dans le sens qui plaît — et c'est de l'argent : il
               irait vérifier dix produits dont un que le traqueur a déjà
               rejeté. La borne haute se relit dans le produit, jamais
               recopiée : un seuil recopié se périme. */
            var bornes = /MAX_TTC:\s*(\d+)/.exec(adminSrc);
            ok(!!bornes, '⛔ PRÉALABLE : la borne haute se relit dans api/admin.js');
            if (bornes && cible4) {
              var horsBorne = (parseInt(bornes[1], 10) + 500) + ',00';
              var rBf = fauxRes();
              await admFn({ method: 'POST',
                query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', scan: '1', dryRun: '1' },
                body: { text: pageIdealo(cible4.sku, horsBorne) } }, rBf, fauxAdmin, dbB);
              ok(rBf.out && rBf.out.counts && rBf.out.counts.flagged === 1,
                '⛔ PRÉALABLE : un prix hors fourchette est bien ÉCARTÉ (obtenu '
                + JSON.stringify(rBf.out && rBf.out.counts) + ')');
              var bilF = rBf.out && rBf.out.couverture && rBf.out.couverture.baisses;
              ok(bilF && bilF.produitsCompares === 3,
                '⛔⛔ …et il n\'entre PAS dans le bilan : le traqueur a refusé de l\'écrire, '
                + 'le compter reviendrait à envoyer vérifier un produit déjà rejeté '
                + '(obtenu ' + JSON.stringify(bilF && bilF.produitsCompares) + ', attendu 3)');
            }
            var rB2b = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', scan: '1', dryRun: '1' },
              body: { text: pageIdealo(cible2.sku, '450,00') } }, rB2b, fauxAdmin, dbB);
            var bil = rB2b.out && rB2b.out.couverture && rB2b.out.couverture.baisses;

            ok(!!bil && bil.enBaisse === 2,
              '⛔⛔ les baisses des DEUX pages sont CUMULÉES — sans cumul, la dernière '
              + 'réponse ne connaît que sa propre page et la question n\'a pas de réponse '
              + '(obtenu ' + JSON.stringify(bil && bil.enBaisse) + '/2)');
            var top = (bil && bil.plusFortesBaisses) || [];
            ok(top.length === 2 && top[0].pct > top[1].pct,
              '⛔⛔ classées de la PLUS FORTE à la moins forte, en pourcentage : c\'est '
              + 'l\'ordre dans lequel il ira vérifier (obtenu '
              + JSON.stringify(top.map(function (x) { return x.pct; })) + ')');
            ok(top[0] && Math.abs(top[0].pct - 50) < 1.5,
              '⛔ la plus forte est bien celle dont le prix courant valait DEUX FOIS le '
              + 'nouveau — 50 % (obtenu ' + JSON.stringify(top[0] && top[0].pct) + ')');
            ok(top[0] && top[0].ancien > top[0].nouveau && top[0].euros > 0 && !!top[0].nom,
              '⛔ chaque ligne porte l\'ancien prix, le nouveau, l\'écart en euros et le '
              + 'NOM — une référence seule ne se vérifie pas sur une boutique (obtenu '
              + JSON.stringify(top[0]) + ')');
            ok(bil && Math.abs(bil.baisseMoyennePct - (top[0].pct + top[1].pct) / 2) < 0.06,
              '⛔⛔ la moyenne porte sur les produits EN BAISSE, pas sur les produits vus : '
              + 'diviser par les seconds la ferait paraître plus douce qu\'elle n\'est '
              + '(obtenu ' + JSON.stringify(bil && bil.baisseMoyennePct) + ')');

            /* ⛔ LA MÊME FICHE REVUE SUR UNE AUTRE PAGE NE COMPTE QU'UNE FOIS.
               Sinon un article présent sur deux pages pèserait double dans la
               moyenne, au hasard de la pagination du fournisseur. */
            var rB3 = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', scan: '1', dryRun: '1' },
              body: { text: pageIdealo(cible.sku, '450,00') } }, rB3, fauxAdmin, dbB);
            var bil3 = rB3.out && rB3.out.couverture && rB3.out.couverture.baisses;
            var comparesAttendus = cible3 ? 3 : 2;
            ok(bil3 && bil3.enBaisse === 2 && bil3.produitsCompares === comparesAttendus,
              '⛔⛔ une fiche revue sur une autre page ne compte qu\'UNE fois : deux fois '
              + 'la pondérerait au hasard de la pagination (obtenu '
              + JSON.stringify(bil3 && bil3.enBaisse) + ' en baisse, '
              + JSON.stringify(bil3 && bil3.produitsCompares) + ' comparés)');

            /* ⛔⛔ CETTE ASSERTION A CHANGÉ DE SENS LE 04/08, ET C'EST VOULU.
               Elle exigeait qu'À SEC le bilan vaille `null` — « aucun prix
               calculé ». C'était vrai, et c'est précisément ce qui m'a fait
               conseiller `&dryRun=1` pour obtenir ses baisses… mode qui LIT
               toute la collection Firestore. Son quota a sauté.
               ⛔ Le mode à sec calcule désormais les prix sur `products.json`,
               lu sur disque. L'invariant gardé n'est plus « pas de bilan »,
               c'est « un bilan SANS accès Firestore » — la vraie promesse.
               ⚠️ La base du harnais explose au premier contact : un résultat
               prouve donc qu'aucune lecture n'a eu lieu. */
            scanReset();
            var rBsec = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', sec: '1', scan: '1' },
              body: { text: pageIdealo(cible.sku, '450,00') } }, rBsec, fauxAdmin,
              { collection: function (n) { throw new Error('MODE A SEC : Firestore touche (' + n + ')'); } });
            var bilSec = rBsec.out && rBsec.out.couverture && rBsec.out.couverture.baisses;
            ok(rBsec.code === 200 && bilSec && bilSec.produitsCompares >= 1,
              '⛔⛔ à sec, le bilan des baisses EXISTE et aucune lecture Firestore n\'a eu '
              + 'lieu — c\'est ce qui lui évite de passer en `dryRun` et de brûler son '
              + 'quota (obtenu code ' + rBsec.code + ', bilan '
              + JSON.stringify(bilSec && bilSec.produitsCompares) + ')');
            scanReset();
          }
        }

        /* ══ UN COMPTEUR NE SURESTIME JAMAIS ════════════════════════════════
           ⛔⛔ Mesuré le 03/08 sur son balayage : `lues: 4033` pour
           `tuiles: 4018` — **100,4 %**, sur 31 pages des 67. Une annonce
           appariée par le nom entrait dans `parsed` tout en restant dans
           `auto.sansRef` ; additionner les deux listes la comptait deux fois.
           Le défaut est né de l'appariement souple livré le matin même : un
           correctif qui casse un compteur, c'est E-406 à nouveau.
           ⛔ La porte ne recopie AUCUN chiffre du produit : elle vérifie
           l'invariant — on ne peut pas lire plus de lignes qu'il n'y a de
           tuiles sur la page. */
        /* ⚠️ LA PAGE DOIT PORTER UNE ANNONCE SANS RÉFÉRENCE, sinon le
           double comptage ne peut pas se produire et le contrôle serait vert
           pour la mauvaise raison — un sabotage me l'a montré. La fiche à
           `srcNom` est choisie à l'exécution, jamais nommée. */
        /* ⚠️ CE PRÉALABLE A CHANGÉ LE 04/08, ET IL FAUT DIRE POURQUOI.
           Il cherchait une fiche du catalogue suivie par son NOM (`srcNom`)
           pour provoquer le double comptage. L'user a archivé les 110 fiches
           qui en portaient un : le cas n'est plus atteignable en production
           NON PLUS, donc le chercher ferait échouer une porte sur une donnée
           qui n'a plus lieu d'exister.
           ⛔ Ce qui reste gardé, et qui suffit : l'invariant `lues <= tuiles`
           sur une page ORDINAIRE, plus la borne elle-même éprouvée sur des
           valeurs (`pwBornerLues`, plus bas). Le cas du double comptage n'a pas
           disparu du code — il est gardé là où il se décide, pas là où il se
           manifestait. */
        scanReset();
        var rCpt = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', dryRun: '1' },
          body: { text: pageIdealo(cible.sku, '450,00') } }, rCpt, fauxAdmin, fauxDb({}, []));
        var pgCpt = rCpt.out && rCpt.out.page;
        ok(pgCpt && pgCpt.tuiles === 1 && (rCpt.out.counts.parsed + rCpt.out.counts.sansRef) >= 1,
          '⛔ PRÉALABLE : la page porte UNE tuile sans référence (obtenu tuiles='
          + JSON.stringify(pgCpt && pgCpt.tuiles) + ', parsed='
          + JSON.stringify(rCpt.out && rCpt.out.counts && rCpt.out.counts.parsed)
          + ', sansRef=' + JSON.stringify(rCpt.out && rCpt.out.counts && rCpt.out.counts.sansRef) + ')');
        /* ⛔ ET LE DIAGNOSTIC DE L'APPARIEMENT PAR NOM : sans lui, « 10 fiches
           sur 379 » ne dit pas s'il faut baisser une exigence ou enrichir les
           fiches — deux remèdes inverses. Un écart qu'on ne sait pas ventiler
           se termine en supposition, et une supposition ne se corrige pas. */
        /* ⛔⛔ LA BORNE, ÉPROUVÉE SEULE. Le cas ne se produit qu'une fois sur
           67 pages réelles : une garde qu'on ne peut pas déclencher ne garde
           rien, donc on la monte sur des valeurs. */
        var bl = adm._internals && adm._internals.pwBornerLues;
        ok(typeof bl === 'function', 'pwBornerLues exposée aux portes');
        if (bl) {
          ok(bl(60, 59).lues === 59,
            '⛔⛔ un instrument de mesure ne SURESTIME jamais : 60 lignes pour 59 tuiles '
            + 'ressort borné à 59 (obtenu ' + JSON.stringify(bl(60, 59)) + ')');
          ok(bl(60, 59).ecart === 1,
            '⛔⛔ …et l\'écart est RENDU, pas efface : borner en silence effacerait le '
            + 'symptôme et laisserait le sous-comptage d\'ancres vivre (obtenu écart='
            + JSON.stringify(bl(60, 59).ecart) + ')');
          ok(bl(59, 60).lues === 59 && bl(59, 60).ecart === 0,
            '⛔ le cas NORMAL n\'invente aucun écart : lire moins que les tuiles est '
            + 'attendu, ce n\'est pas un défaut');
          ok(bl(7, 0).lues === 7 && bl(7, 0).ecart === 0,
            '⛔ sans tuiles comptées, on ne borne PAS : borner sur zéro effacerait tout '
            + 'ce que la page a rendu');
        }
        /* ══ LE MODE À SEC CALCULE LES PRIX, ET NE LIT RIEN ════════════
           ⛔⛔ Faute du 04/08, et elle est de moi : je lui ai fait remplacer
           `&sec=1` par `&dryRun=1` pour obtenir ses baisses, sans dire que
           `dryRun` LIT la collection entière. Mesuré : ~945 documents par
           instance, jusqu'à 4 instances, soit ~3 780 lectures par balayage là
           où le mode à sec en consommait ZÉRO. Son quota a sauté.
           ⛔ Le mode à sec existait justement pour ça. La porte vérifie
           maintenant les DEUX promesses ensemble : il calcule les baisses, ET
           il ne touche pas à Firestore. Vérifier l'une sans l'autre laisserait
           revenir exactement la faute d'aujourd'hui. */
        var dbExplose = { collection: function (n) {
          throw new Error('MODE A SEC : Firestore touche (' + n + ')');
        } };
        adm._internals.pwScanReset();
        var rSecPrix = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', sec: '1', scan: '1' },
          body: { text: pageIdealo(cible.sku, '80,00') } }, rSecPrix, fauxAdmin, dbExplose);
        ok(rSecPrix.code === 200,
          '⛔⛔ le mode à sec ne touche PAS Firestore — la base du harnais EXPLOSE au '
          + 'premier contact, donc un 200 prouve qu\'il n\'y a eu aucun accès (obtenu '
          + rSecPrix.code + ')');
        var bSec = rSecPrix.out && rSecPrix.out.couverture && rSecPrix.out.couverture.baisses;
        ok(bSec && bSec.produitsCompares >= 1,
          '⛔⛔ …et il CALCULE quand même les baisses : c\'est ce qui lui évite de passer '
          + 'en `dryRun` pour les obtenir, et donc de brûler son quota (obtenu '
          + JSON.stringify(bSec && bSec.produitsCompares) + ' produit(s) comparé(s))');
        ok(bSec && Array.isArray(bSec.plusFortesBaisses),
          '⛔ …y compris les plus fortes baisses, nommées');
        adm._internals.pwScanReset();

        /* ══ POURQUOI UNE RÉFÉRENCE N'EST PAS RECONNUE ═════════════════
           ⛔⛔ Buté dessus le 04/08 : il demande pourquoi 12 de ses fiches à
           visuel ne sont pas reconnues, et la réponse était introuvable — le
           mode balayage vide `unknown`, compteur à 1 456 et liste à 0. Une
           donnée comptée mais jamais nommée ne permet aucun diagnostic.
           ⛔ `&inconnus=1` la rend, avec le TITRE : une référence seule ne dit
           pas pourquoi elle n'a pas été rattachée. */
        scanReset();
        var rInc = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo',
            dryRun: '1', scan: '1', inconnus: '1' },
          body: { text: pageIdealo('ZZINCONNU9999', '450,00') } },
          rInc, fauxAdmin, fauxDb({}, []));
        ok(rInc.out && rInc.out.counts && rInc.out.counts.unknown >= 1,
          '⛔ PRÉALABLE : la page porte une référence qu\'aucune fiche ne réclame '
          + '(obtenu ' + JSON.stringify(rInc.out && rInc.out.counts && rInc.out.counts.unknown) + ')');
        ok(rInc.out && (rInc.out.unknown || []).length >= 1,
          '⛔⛔ avec `&inconnus=1`, la liste est RENDUE même en balayage : sans elle, '
          + '« pourquoi cette référence n\'est pas reconnue » n\'a aucune réponse — '
          + 'compteur à 1 456 et liste à 0, c\'est le mur du 04/08 (obtenu '
          + JSON.stringify((rInc.out && rInc.out.unknown || []).length) + ' ligne(s))');
        ok((rInc.out && rInc.out.unknown || []).every(function (u) {
          return u && u.sku && typeof u.name === 'string';
        }), '⛔ chaque ligne porte la RÉFÉRENCE et le TITRE — une référence seule ne dit '
          + 'pas pourquoi elle n\'a pas été rattachée');
        scanReset();
        var rSansInc = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', dryRun: '1', scan: '1' },
          body: { text: pageIdealo('ZZINCONNU9999', '450,00') } },
          rSansInc, fauxAdmin, fauxDb({}, []));
        ok(rSansInc.out && (rSansInc.out.unknown || []).length === 0,
          '⛔ sans le drapeau, la liste reste VIDE en balayage : 67 pages de détail ne '
          + 'se chargent pas sans qu\'on l\'ait voulu');
        scanReset();
        /* ══ `&inconnus=1` PRIME SUR `bref`, SUR LES DEUX CHEMINS ══════
           ⛔⛔ Mesuré le 04/08, deux fois de suite : il lance son balayage
           complet en `sec=1&bref=1&inconnus=1`, 4 018 tuiles lues, et reçoit
           ZÉRO produit nommé. Le drapeau que j'avais posé n'agissait que sur
           le chemin réel ; sur le chemin À SEC — le seul qu'il utilise, parce
           que c'est le seul qui ne coûte pas de quota — `bref` coupait tout.
           ⛔ E-405 encore : une garde posée sur un seul chemin ne garde rien.
           La porte vérifie donc LES DEUX chemins, dans le même contrôle. */
        scanReset();
        var rSecInc = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo',
            sec: '1', scan: '1', bref: '1', inconnus: '1' },
          body: { text: pageIdealo(cible.sku, '450,00') } }, rSecInc, fauxAdmin,
          { collection: function (n) { throw new Error('MODE A SEC : Firestore touche (' + n + ')'); } });
        ok(rSecInc.code === 200 && Array.isArray(rSecInc.out && rSecInc.out.reconnus),
          '⛔⛔ À SEC et en `bref`, `&inconnus=1` rend quand même les listes de produits : '
          + 'sans ça il lit 4 018 tuiles et reçoit zéro nom — deux balayages complets '
          + 'perdus le 04/08 (obtenu reconnus='
          + JSON.stringify(rSecInc.out && rSecInc.out.reconnus && rSecInc.out.reconnus.length) + ')');
        ok(rSecInc.out && Array.isArray(rSecInc.out.inconnus)
          && Array.isArray(rSecInc.out.sansRefDetail),
          '⛔⛔ …les TROIS listes, pas une seule : `inconnus` (ce qu\'idealo vend et '
          + 'qu\'il n\'a pas), `reconnus` (ce qu\'il a déjà, pour ne pas le rajouter en '
          + 'double) et `sansRefDetail`. Classer 4 018 produits exige les trois');
        scanReset();
        var rSecBref = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo',
            sec: '1', scan: '1', bref: '1' },
          body: { text: pageIdealo(cible.sku, '450,00') } }, rSecBref, fauxAdmin,
          { collection: function (n) { throw new Error('MODE A SEC : Firestore touche (' + n + ')'); } });
        ok(rSecBref.out && rSecBref.out.reconnus === undefined
          && rSecBref.out.inconnus === undefined,
          '⛔ …et SANS le drapeau, `bref` coupe toujours : 67 pages de détail ne se '
          + 'chargent pas sans qu\'on l\'ait voulu');
        scanReset();

        var apnDiag = rCpt.out && rCpt.out.appariementNom;
        ok(apnDiag && typeof apnDiag.apparies === 'number'
          && typeof apnDiag.ambigus === 'number' && typeof apnDiag.sansCandidat === 'number',
          '⛔⛔ l\'appariement par nom dit ce qui l\'a ARRÊTÉ : trop ambigu, ou aucun '
          + 'candidat. Les deux remèdes sont inverses — sans ces compteurs on ne peut que '
          + 'supposer (obtenu ' + JSON.stringify(apnDiag) + ')');
        ok(pgCpt && pgCpt.lues <= pgCpt.tuiles,
          '⛔⛔ un compteur ne SURESTIME jamais : on ne peut pas lire plus de lignes '
          + 'qu\'il n\'y a de tuiles sur la page (obtenu lues=' + JSON.stringify(pgCpt && pgCpt.lues)
          + ' pour tuiles=' + JSON.stringify(pgCpt && pgCpt.tuiles) + ')');
        scanReset();

        /* ══ L'ALIAS COMPTE POUR SA FICHE — AUSSI SUR LE CHEMIN QUI ÉCRIT ═══
           ⛔⛔ La même garde existe en mode à sec ; un sabotage a montré qu'elle
           ne couvrait QUE lui. Or c'est le chemin réel qui écrit les prix : y
           laisser le défaut, c'est le laisser là où il coûte. Deux chemins, deux
           contrôles — « une règle vraie appliquée à un seul endroit ne protège
           que cet endroit ».
           ⚠️ La fiche à alias est choisie À L'EXÉCUTION, jamais nommée. */
        var alReel = null;
        for (var ar = 0; ar < prods.length; ar++) {
          var pa = prods[ar];
          if (!pa.sku || !Array.isArray(pa.srcAltSkus) || !pa.srcAltSkus.length) continue;
          if (String(pa.brand || '').toUpperCase() !== 'DEWALT') continue;
          alReel = pa; break;
        }
        ok(!!alReel,
          '⛔ PRÉALABLE : une fiche DeWALT déclare un `srcAltSkus` — sans elle, le '
          + 'chemin réel ne peut pas être vérifié sur l\'appariement par alias');
        if (alReel) {
          scanReset();
          var rAlR = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo',
              dryRun: '1', scan: '1', manquants: '1' },
            // La page n'écrit QUE l'alias, jamais la référence de la fiche.
            body: { text: pageIdealo(String(alReel.srcAltSkus[0]), '450,00') } },
            rAlR, fauxAdmin, fauxDb({}, []));
          var cAlR = rAlR.out && rAlR.out.couverture;
          ok(cAlR && cAlR.fichesRetrouvees === 1,
            '⛔ PRÉALABLE : sur le chemin réel aussi, la fiche est retrouvée par son '
            + 'alias (obtenu ' + JSON.stringify(cAlR && cAlR.fichesRetrouvees) + ')');
          var fantomeR = (cAlR && cAlR.fichesJamaisVuesDetail || []).filter(function (f) {
            return String(f.sku).toUpperCase() === String(alReel.sku).toUpperCase();
          });
          ok(fantomeR.length === 0,
            '⛔⛔ …et elle ne figure PAS dans les jamais vues du chemin réel. Compter '
            + 'sous la référence VUE et lister sous celle du CATALOGUE, c\'est envoyer '
            + 'chercher un produit déjà trouvé (obtenu ' + fantomeR.length + ')');
          scanReset();
        }

        /* ══ MÊME FICHE, DEUX PAGES : ON GARDE LE MOINS CHER ════════════════
           ⛔⛔ DÉCISION DE L'USER, 03/08, mot pour mot : « c'est totalement
           normal qu'il y ait le même produit plusieurs fois, on peut même le
           retrouver jusqu'à 10 fois car ils comparent plus de 15 sites
           différents […] on récupère TOUJOURS le moins cher ».
           ⛔ Mesuré sur son balayage du même jour : CINQ fiches atteintes deux
           fois avec des coûts très écartés (226,04 € puis 341,22 € sur la même
           fiche). La carte des sources était ÉCRASÉE à chaque page : le prix
           final dépendait de quelle page était passée en dernier — 323,92 € ou
           465,77 € au tirage au sort de la pagination.
           ⚠️ LES DEUX ORDRES SONT TESTÉS. Le seul qui démasque le défaut est
           « moins cher d'abord, plus cher ensuite » : dans l'autre sens, le
           dernier vu se trouve être le bon et le contrôle passerait pour la
           mauvaise raison. */
        async function pageAuPrix(sku, prixTxt, db) {
          var r = fauxRes();
          await admFn({ method: 'POST',
            /* ⚠️ SANS `scan=1` : le mode balayage VIDE les listes de la réponse
               (c'est voulu, 67 pages de détail sont incollables), et ce
               contrôle a besoin de LIRE le coût retenu ligne par ligne. La
               mémoire de rafale, elle, ne dépend pas de ce drapeau. */
            query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo' },
            body: { text: pageIdealo(sku, prixTxt) } }, r, fauxAdmin, db);
          return r.out;
        }
        var CHER = '600,00', MOINS = '300,00';
        scanReset();
        var dbM1 = fauxDb({}, []);
        await pageAuPrix(cible.sku, CHER, dbM1);
        var apresBaisse = await pageAuPrix(cible.sku, MOINS, dbM1);
        var recBaisse = (apresBaisse.applied || []).concat(apresBaisse.unchanged || [])[0];
        ok(!!recBaisse && Math.abs(recBaisse.srcTTC - 300) < 0.01,
          '⛔ PRÉALABLE : cher puis moins cher → le coût retenu est le moins cher (obtenu '
          + JSON.stringify(recBaisse && recBaisse.srcTTC) + ')');

        scanReset();
        var dbM2 = fauxDb({}, []);
        await pageAuPrix(cible.sku, MOINS, dbM2);
        var apresHausse = await pageAuPrix(cible.sku, CHER, dbM2);
        /* ⚠️ On mesure ici CE QUI EST ÉCRIT, pas ce qui est rapporté. Depuis que
           la base factice porte le snapshot (10/08/2026), la page 2 relit
           VRAIMENT l'override écrit par la page 1 — le prix est déjà bon, la
           fiche tombe donc en `unchanged`, une liste que la réponse ne rend
           pas. Le coût PERSISTÉ, lui, est la donnée d'argent : c'est lui qui
           décide du prix de vente, et un écrasement par la page chère s'y
           verrait immédiatement. */
        var patchHausse = dbM2._compte.patchsParId[cible.id] || {};
        var srcHausse = (patchHausse.priceSources || {}).idealo || {};
        ok(Math.abs(patchHausse.priceSrcTTC - 300) < 0.01
          && Math.abs(srcHausse.ttc - 300) < 0.01
          && apresHausse.counts && apresHausse.counts.applied === 0,
          '⛔⛔ ARGENT — moins cher d\'abord, plus cher ensuite : le coût ÉCRIT reste le '
          + 'MOINS CHER et aucune hausse ne s\'applique. Sans ça le prix final dépend de '
          + 'l\'ordre des pages, et l\'user vend 465,77 € un outil qu\'il pouvait acheter '
          + 'pour 323,92 € (obtenu coût ' + JSON.stringify(patchHausse.priceSrcTTC)
          + ', source ' + JSON.stringify(srcHausse.ttc) + ', appliqués '
          + JSON.stringify(apresHausse.counts && apresHausse.counts.applied)
          + ' — attendu 300 / 300 / 0)');
        scanReset();

        /* ⛔ ET LE MINIMUM NE VAUT QUE DANS LA RAFALE. Hors rafale, une hausse
           réelle du fournisseur DOIT pouvoir remonter le coût — sinon le prix
           ne descendrait plus jamais que vers le bas, et ce serait contraire à
           D-015 : le traqueur lit ce que la page AFFICHE, c'est ce que l'user
           paiera. `scanReset()` ferme la rafale ; la hausse doit passer. */
        var dbM3 = fauxDb({}, []);
        await pageAuPrix(cible.sku, MOINS, dbM3);
        scanReset();                                   // la rafale se termine
        var horsRafale = await pageAuPrix(cible.sku, CHER, dbM3);
        var recHors = (horsRafale.applied || []).concat(horsRafale.unchanged || [])[0];
        ok(!!recHors && Math.abs(recHors.srcTTC - 600) < 0.01,
          '⛔⛔ …mais HORS rafale, une hausse réelle du fournisseur remonte bien le coût : '
          + 'un minimum éternel ferait vendre à perte le jour où le fournisseur augmente '
          + '(obtenu ' + JSON.stringify(recHors && recHors.srcTTC) + ', attendu 600)');
        scanReset();

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
        /* ⛔ NOMMER NE SUFFIT PAS. Trois réfs sont ressorties non lues sur SA
           page le 03/08, et je n'ai PAS pu reproduire la cause — la page vit
           chez lui. La réponse porte donc le MORCEAU DE PAGE autour de chaque
           réf manquante : c'est lui qui tranche, pas une supposition. */
        var det = (rTrou.out.refsNonLuesDetail || []).filter(function (x) { return x.ref === 'ZZT002B'; })[0];
        ok(det && typeof det.contexte === 'string' && det.contexte.indexOf('ZZT002B') !== -1,
          '⛔ chaque réf non lue vient AVEC son contexte de page — sans lui, la '
          + 'cause reste une supposition, et une supposition ne se corrige pas');
        ok(det && det.contexte.length <= 230,
          'la fenêtre reste bornée : on montre de quoi diagnostiquer, pas la page');
        ok(!/x-watch-secret/i.test(JSON.stringify(rTrou.out)),
          '⛔ et JAMAIS un en-tête dans la réponse : la clé du traqueur y vit');

        /* ⛔⛔ « COMBIEN DE PRODUITS ONT ÉTÉ LUS AU TOTAL ? » — la question la
           plus simple, et aucun compteur n'y répondait. Le 03/08, après son
           balayage complet des 67 pages, je n'ai pas pu la lui dire : le cumul
           ne portait que des IDENTITÉS DISTINCTES. Or il demande des TUILES,
           mot pour mot : « même si sur la même page il existe deux fois le
           même produit, on doit lire les 60 produits de chaque page ».
           ⛔ Son raccourci ne garde que la DERNIÈRE des 67 réponses — le
           détail des 66 autres est déjà perdu quand il me la colle. Le total
           doit donc VIVRE DANS LE CUMUL, pas dans un calcul que je ferais
           après coup. Ces assertions rejouent une rafale de trois pages. */
        /* ⛔⛔ MODE BILAN — LE DÉTAIL PÈSE 93 % DE LA RÉPONSE. Mesuré le 03/08
           sur SA réponse : 50 480 signes, dont 37 107 pour `inconnus` et
           10 064 pour `sansRefDetail`. Sur 67 pages ça fait 3,4 MILLIONS de
           signes — ses mots : « je ne pourrai pas te coller 10 000 produits,
           tu vas me faire planter l'iPad ».
           ⛔ Ce qui doit SURVIVRE au raccourcissement, ce sont les ÉCARTS :
           non lues, perdues, écartées, compteurs. Les couper rendrait le mode
           bref RASSURANT au lieu d'être court — et un rapport rassurant qui
           cache un trou est pire que pas de rapport. */
        adm._internals.pwScanReset();
        var piedB = [];
        for (var pb = 0; pb < 40; pb++) piedB.push('pied de page ' + pb);
        var pageBref = ['MAKITA ZZD4444', 'Machine', '2 offres', 'à partir de100,00 €']
          .concat(piedB).join('\n');
        async function envoiBref(drapeaux) {
          var rr = fauxRes();
          await admFn({ method: 'POST',
            query: Object.assign({ type: 'price-watch', brand: 'MAKITA', source: 'idealo',
              sec: '1', scan: '1' }, drapeaux),
            body: { text: pageBref } }, rr, fauxAdmin, dbInterdite);
          return rr.out;
        }
        var repPleine = await envoiBref({});
        var repBreve = await envoiBref({ bref: '1' });
        ok(JSON.stringify(repBreve).length < JSON.stringify(repPleine).length,
          '⛔⛔ `bref=1` raccourcit vraiment la réponse ('
          + JSON.stringify(repBreve).length + ' contre '
          + JSON.stringify(repPleine).length + ' signes)');
        ok(repBreve && repBreve.inconnus === undefined && repBreve.sansRefDetail === undefined
          && repBreve.diagnostic === undefined,
          '⛔ …en retirant le DÉTAIL produit par produit, qui est ce qui pèse');
        var ecartsGardes = repBreve && repBreve.counts && repBreve.couverture
          && repBreve.refsNonLues !== undefined && repBreve.annoncesNonLues !== undefined
          && repBreve.perdus !== undefined && repBreve.barriere !== undefined;
        ok(ecartsGardes,
          '⛔⛔ …et JAMAIS les écarts : compteurs, non lues, perdues, écartées restent. '
          + 'Un mode bref qui les couperait serait RASSURANT au lieu d\'être court — '
          + 'et un rapport qui cache un trou est pire que pas de rapport');

        /* ⛔⛔ UNE NOUVELLE RAFALE REPART DE ZÉRO. Mesuré sur son deuxième
           balayage : `pagesDansLaRafale: 120` au lieu de 67 — les deux
           lancements sont tombés dans la même fenêtre de vingt minutes et se
           sont additionnés. Le chiffre par page restait juste, le TOTAL ne
           voulait plus rien dire. Et c'est le total qu'il lit.
           ⚠️ Le harnais ne recopie AUCUN nombre de pages : il le relit dans le
           plan. Un seuil recopié se périme. */
        adm._internals.pwScanReset();
        /* ⛔ LE PLAN LU ET LA MARQUE REJOUÉE DOIVENT ÊTRE LES MÊMES. Quand le
           plan MAKITA est arrivé (09/08), ce bloc lisait SES 112 pages tout en
           rejouant des requêtes DEWALT (67 pages) — trois assertions rouges
           pour un code juste. Le harnais rejoue DEWALT : il lit le plan DEWALT. */
        var planT = require('../api/_lib/traqueur-plans.js').plan('DEWALT', 'idealo');
        var nbPages = planT && planT.pages;
        ok(nbPages > 1, '⛔ PRÉALABLE : un plan déclare bien un nombre de pages');
        if (nbPages > 1) {
          var derCouv = null;
          for (var kp = 0; kp < nbPages + 1; kp++) {
            var rk = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', sec: '1', scan: '1' },
              body: { text: pageBref.replace(/MAKITA/g, 'DEWALT') } }, rk, fauxAdmin, dbInterdite);
            derCouv = rk.out && rk.out.couverture;
          }
          ok(derCouv && derCouv.pagesDansLaRafale === 1,
            '⛔⛔ passé les ' + nbPages + ' pages du plan, la suivante ouvre une rafale '
            + 'NEUVE — sinon deux lancements s\'additionnent et le total devient faux '
            + 'tout en ayant l\'air juste (obtenu '
            + JSON.stringify(derCouv && derCouv.pagesDansLaRafale) + ')');
          ok(derCouv && derCouv.tuilesVues < nbPages,
            '⛔ …et les tuiles repartent de zéro avec elle ('
            + JSON.stringify(derCouv && derCouv.tuilesVues) + ')');

          /* ⛔⛔ UN BALAYAGE INCOMPLET DOIT SE DÉNONCER LUI-MÊME. Mesuré le
             03/08 : `pagesDansLaRafale: 64` pour un plan de 67, et les tuiles
             par page étaient PARFAITES (3 838 ÷ 64 = 59,97). Rien ne disait
             que trois pages n'avaient jamais atteint le serveur — requête
             échouée chez le fournisseur, ou POST refusé avant d'entrer dans le
             cumul. Un compteur qui ne dit pas ce qu'il ATTENDAIT ne peut pas
             dire qu'il manque quelque chose, et « 64 » a l'air d'un succès.
             ⚠️ J4 : trois pages absentes, ce sont ~180 sources de prix jamais
             vues — donc des coûts d'achat qui restent au niveau précédent
             sans qu'aucun fait ne le justifie. */
          adm._internals.pwScanReset();
          var couvPartielle = null;
          for (var kq = 0; kq < 3; kq++) {
            var rq = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', sec: '1', scan: '1' },
              body: { text: pageBref.replace(/MAKITA/g, 'DEWALT') } }, rq, fauxAdmin, dbInterdite);
            couvPartielle = rq.out && rq.out.couverture;
          }
          ok(couvPartielle && couvPartielle.pagesAttendues === nbPages,
            '⛔⛔ le cumul dit combien de pages le PLAN en attendait — sans ça, un '
            + 'balayage tronqué a l\'air d\'un succès (obtenu '
            + JSON.stringify(couvPartielle && couvPartielle.pagesAttendues)
            + ', attendu ' + nbPages + ')');
          ok(couvPartielle && couvPartielle.pagesManquantes === nbPages - 3,
            '⛔⛔ …et combien il en MANQUE, en clair. C\'est le seul chiffre qui '
            + 'distingue « tout est lu » de « trois pages ne sont jamais arrivées » '
            + '(obtenu ' + JSON.stringify(couvPartielle && couvPartielle.pagesManquantes)
            + ', attendu ' + (nbPages - 3) + ')');
          /* ⛔⛔ UNE PAGE QUI ARRIVE VIDE N'EST PAS UNE PAGE QUI N'ARRIVE
             JAMAIS — et les deux appellent des remèdes OPPOSÉS. Mesuré sur
             ses deux balayages : 64 pages sur 67, puis 65 sur 67. Le nombre
             VARIE, donc c'est intermittent. Mais une page vide repart en 400
             sans toucher au cumul : elle était indiscernable d'une page
             perdue en route. `pagesRefusees > 0` ⇒ le fournisseur n'a rien
             rendu, on corrige la lecture ; `= 0` avec des manquantes ⇒ le
             POST se perd avant nous, on corrige le réseau.
             ⚠️ Une page vide n'incrémente PAS `pages` : la compter comme lue
             gonflerait le total et masquerait le trou. */
          adm._internals.pwScanReset();
          var rPleine = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', sec: '1', scan: '1' },
            body: { text: pageBref.replace(/MAKITA/g, 'DEWALT') } }, rPleine, fauxAdmin, dbInterdite);
          var rVide = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', sec: '1', scan: '1' },
            body: { text: '' } }, rVide, fauxAdmin, dbInterdite);
          var rApres = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', sec: '1', scan: '1' },
            body: { text: pageBref.replace(/MAKITA/g, 'DEWALT') } }, rApres, fauxAdmin, dbInterdite);
          var cv = rApres.out && rApres.out.couverture;
          ok(rVide.code === 400,
            '⛔ PRÉALABLE : une page vide est bien REFUSÉE (obtenu ' + rVide.code + ')');
          ok(cv && cv.pagesRefusees === 1,
            '⛔⛔ …et COMPTÉE : c\'est le seul chiffre qui distingue « la page est '
            + 'arrivée vide » de « la page n\'est jamais arrivée » — deux remèdes '
            + 'opposés (obtenu ' + JSON.stringify(cv && cv.pagesRefusees) + ')');
          ok(cv && cv.pagesDansLaRafale === 2,
            '⛔⛔ …sans gonfler le total des pages LUES : compter une page vide comme '
            + 'lue masquerait le trou au lieu de le montrer (obtenu '
            + JSON.stringify(cv && cv.pagesDansLaRafale) + ', attendu 2)');
          adm._internals.pwScanReset();
        }
        adm._internals.pwScanReset();

        /* ⚠️ Le point d'entrée refuse un corps trop court — un texte de
           cinquante signes n'est pas une page, et ce refus est voulu. On
           allonge donc avec du pied de page, comme une vraie page en porte. */
        var pied = [];
        for (var f = 0; f < 40; f++) pied.push('pied de page ligne ' + f);
        var pageA = ['MAKITA ZZA1111', 'Machine', '2 offres', 'à partir de100,00 €']
          .concat(pied).join('\n');
        var pageB = ['MAKITA ZZB2222', 'Machine', '2 offres', 'à partir de200,00 €', '',
          'MAKITA ZZC3333', 'Machine', '2 offres', 'à partir de300,00 €']
          .concat(pied).join('\n');
        var dernierCumul = null;
        for (var pg = 0; pg < 3; pg++) {
          var rPg = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'MAKITA', source: 'idealo', sec: '1', scan: '1' },
            body: { text: pg === 1 ? pageB : pageA } }, rPg, fauxAdmin, dbInterdite);
          dernierCumul = rPg.out && rPg.out.couverture;
        }
        ok(dernierCumul && dernierCumul.pagesDansLaRafale === 3,
          '⛔ PRÉALABLE : les trois pages sont bien cumulées ('
          + JSON.stringify(dernierCumul && dernierCumul.pagesDansLaRafale) + '/3)');
        /* 1 tuile + 2 tuiles + 1 tuile = 4, et autant de lignes lues. */
        ok(dernierCumul && dernierCumul.tuilesVues === 4,
          '⛔⛔ le cumul dit combien de TUILES les pages contenaient au total — c\'est '
          + 'LA réponse à « combien de produits sur les 60 de chaque page » (obtenu '
          + JSON.stringify(dernierCumul && dernierCumul.tuilesVues) + ', attendu 4)');
        ok(dernierCumul && dernierCumul.lignesLues === 4,
          '⛔⛔ …et combien on en a LU, doublons compris. L\'écart entre les deux est '
          + 'le seul chiffre qui dise si le balayage a tout ramené (obtenu '
          + JSON.stringify(dernierCumul && dernierCumul.lignesLues) + ', attendu 4)');
        /* ⛔ PRÉALABLE — les DOUBLONS comptent. C'est sa demande explicite :
           deux fois le même produit sur une page font deux lignes. Un cumul
           qui dédoublonne rendrait un total plus bas que la réalité, et
           ferait chercher des pages manquantes qui n'existent pas. */
        ok(dernierCumul && dernierCumul.refsDistinctes === 3
          && dernierCumul.lignesLues > dernierCumul.refsDistinctes,
          '⛔⛔ les DOUBLONS comptent dans `lignesLues` mais pas dans '
          + '`refsDistinctes` : la même page vue deux fois ajoute des lignes, pas des '
          + 'identités — confondre les deux ferait chercher des pages qui ne manquent '
          + 'pas (' + JSON.stringify({ lues: dernierCumul && dernierCumul.lignesLues,
            distinctes: dernierCumul && dernierCumul.refsDistinctes }) + ')');
        adm._internals.pwScanReset();

        /* ══ UNE PAGE ENVOYÉE DEUX FOIS N'EST PAS DEUX PAGES ═══════════════
           ⛔⛔ Le cumul ne comptait que des REQUÊTES ACCEPTÉES. Le raccourci,
           lui, ne dit jamais QUELLE page il envoie : si un tour rejoue la
           même URL, le compteur avançait quand même et le trou correspondant
           disparaissait du rapport — « 67 sur 67 » avec une page jamais vue.
           Depuis `empreintePage`, une page porte une identité tirée de son
           contenu, et c'est elle qui compte.
           ⚠️ Pages du harnais volontairement synthétiques, avec assez de
           montants pour qu'une empreinte existe (moins de quatre, la fonction
           rend `null` — et c'est voulu). */
        function pageEmpreinte(base) {
          var l = [];
          for (var z = 0; z < 6; z++) {
            l.push('MARQUEZZ ZZE' + (5000 + z), 'Machine', '2 offres',
              'à partir de' + (base + z) + ',00 €');
          }
          for (var w = 0; w < 40; w++) l.push('pied de page ligne ' + w);
          return l.join('\n');
        }
        async function envoiPage(txt) {
          var rp = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: 'MARQUEZZ', source: 'idealo', sec: '1', scan: '1' },
            body: { text: txt } }, rp, fauxAdmin, dbInterdite);
          return rp.out;
        }
        adm._internals.pwScanReset();
        var pE1 = pageEmpreinte(100), pE2 = pageEmpreinte(900);
        var rE1 = await envoiPage(pE1);
        ok(rE1 && rE1.page && typeof rE1.page.empreinte === 'string'
          && rE1.page.tuiles === 6,
          '⛔⛔ chaque réponse porte SA PROPRE ligne `page` — empreinte, tuiles, lues. '
          + 'C\'est elle qui permet de totaliser un balayage sur le FICHIER des '
          + 'réponses, sans dépendre de la mémoire d\'une instance serverless (obtenu '
          + JSON.stringify(rE1 && rE1.page) + ')');
        var rE2 = await envoiPage(pE1);               // LA MÊME page, rejouée
        var cE2 = rE2 && rE2.couverture;
        ok(cE2 && cE2.pagesDistinctes === 1 && cE2.pagesEnDouble === 1,
          '⛔⛔ la MÊME page envoyée deux fois compte pour UNE : sinon un raccourci qui '
          + 'rejoue une URL comble un trou qui existe toujours (obtenu distinctes='
          + JSON.stringify(cE2 && cE2.pagesDistinctes) + ', doubles='
          + JSON.stringify(cE2 && cE2.pagesEnDouble) + ')');
        var rE3 = await envoiPage(pE2);               // une AUTRE page
        var cE3 = rE3 && rE3.couverture;
        ok(cE3 && cE3.pagesDistinctes === 2,
          '⛔ …et une page DIFFÉRENTE compte pour une de plus (obtenu '
          + JSON.stringify(cE3 && cE3.pagesDistinctes) + ', attendu 2)');
        /* ⛔⛔ QUI A COMPTÉ. Sans l'identifiant d'instance, un cumul amputé par
           une instance neuve est indiscernable d'un cumul amputé par des pages
           perdues — j'ai écrit la mauvaise conclusion le 03/08 faute de ce
           chiffre. Il doit être présent, et STABLE tant qu'on ne change pas
           d'instance : un identifiant qui bouge à chaque requête ne dirait
           plus rien. */
        ok(cE3 && typeof cE3.instance === 'string' && cE3.instance.length >= 4,
          '⛔⛔ le cumul dit QUELLE INSTANCE l\'a compté — sans lui, « 53 pages sur 67 » '
          + 'ne distingue pas un compteur redémarré de quatorze pages perdues (obtenu '
          + JSON.stringify(cE3 && cE3.instance) + ')');
        ok(cE2 && cE3 && cE2.instance === cE3.instance,
          '⛔ …et il ne change pas d\'une requête à l\'autre dans le même processus : '
          + 'sinon il désignerait un changement d\'instance à chaque page');
        /* ══ « OÙ SONT LES PRODUITS ? » ════════════════════════════════════
           ⛔⛔ Sa question du 03/08, après 24 h de travail sur ce balayage. Le
           cumul comptait les tuiles de la page et les références VUES chez le
           fournisseur — jamais les RAPPROCHEMENTS avec son catalogue. Or c'est
           le seul chiffre qui dise si un balayage sert à quelque chose : une
           référence vue chez idealo mais absente de ses fiches ne fera JAMAIS
           bouger un prix d'achat. `reconnus` existait page par page, et une
           page peut légitimement n'en avoir aucun ; sur 67 pages, l'absence de
           cumul rendait la question **sans réponse possible**.
           ⚠️ Le harnais ne nomme AUCUNE référence du catalogue : il envoie une
           page bâtie sur les vraies fiches de la marque la plus fournie,
           choisies à l'exécution. */
        var catT = require('../api/_lib/catalog.js').loadCatalogAvec({});
        var parMarque = Object.create(null);
        catT.forEach(function (p) {
          var b = String(p.brand || '').toUpperCase();
          if (b && p.sku) (parMarque[b] = parMarque[b] || []).push(String(p.sku).toUpperCase());
        });
        var marqueT = Object.keys(parMarque).sort(function (a, b) {
          return parMarque[b].length - parMarque[a].length;
        })[0];
        ok(!!marqueT && parMarque[marqueT].length >= 3,
          '⛔ PRÉALABLE : le catalogue porte au moins 3 fiches pour la marque la plus '
          + 'fournie — sans ça ce contrôle ne vérifie rien (marque ' + marqueT + ', '
          + (marqueT ? parMarque[marqueT].length : 0) + ' fiches)');
        if (marqueT && parMarque[marqueT].length >= 3) {
          var troisRefs = parMarque[marqueT].slice(0, 3);
          function pageDeFiches(refs, base) {
            var l = [];
            refs.forEach(function (r, idx) {
              l.push(marqueT + ' ' + r, 'Machine', '2 offres',
                'à partir de' + (base + idx) + ',00 €');
            });
            for (var w = 0; w < 40; w++) l.push('pied de page ligne ' + w);
            return l.join('\n');
          }
          adm._internals.pwScanReset();
          var rF1 = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: marqueT, source: 'idealo', sec: '1', scan: '1' },
            /* ⛔ LA PAGE MÉLANGE DEUX DE SES FICHES ET UNE RÉFÉRENCE QU'IL NE
               VEND PAS — c'est le cas réel : idealo liste tout le marché, pas
               son catalogue. Sans cette intruse, « rapproché » et « vu » sont
               le même nombre et le contrôle ne distingue rien. */
            body: { text: pageDeFiches(troisRefs.slice(0, 2).concat(['ZZINTRUS9999']), 100) } },
            rF1, fauxAdmin, dbInterdite);
          ok(rF1.out && rF1.out.counts && rF1.out.counts.parsed === 3,
            '⛔ PRÉALABLE : les trois références de la page sont bien LUES, dont '
            + 'l\'intruse (obtenu ' + JSON.stringify(rF1.out && rF1.out.counts
              && rF1.out.counts.parsed) + '/3)');
          var cF1 = rF1.out && rF1.out.couverture;
          ok(cF1 && cF1.fichesDeLaMarque === parMarque[marqueT].length,
            '⛔⛔ le cumul dit ce que SON CATALOGUE contient pour la marque — sans ce '
            + 'dénominateur, « 84 fiches retrouvées » ne veut rien dire (obtenu '
            + JSON.stringify(cF1 && cF1.fichesDeLaMarque) + ', attendu '
            + parMarque[marqueT].length + ')');
          ok(cF1 && cF1.fichesRetrouvees === 2,
            '⛔⛔ …et combien le balayage en a RAPPROCHÉES. C\'est le seul chiffre qui '
            + 'réponde à « où sont les produits » : une référence vue chez le '
            + 'fournisseur mais absente de ses fiches ne fera jamais bouger un prix '
            + '(obtenu ' + JSON.stringify(cF1 && cF1.fichesRetrouvees) + ', attendu 2)');
          /* ⛔ LE RAPPROCHEMENT SE CUMULE D'UNE PAGE À L'AUTRE, ET NE COMPTE
             QU'UNE FOIS. Une fiche vue sur deux pages du même balayage reste
             une seule fiche retrouvée — sinon le total dépasserait le
             catalogue et `fichesJamaisVues` tomberait à zéro à tort. */
          var rF2 = fauxRes();
          await admFn({ method: 'POST',
            query: { type: 'price-watch', brand: marqueT, source: 'idealo', sec: '1', scan: '1' },
            body: { text: pageDeFiches([troisRefs[1], troisRefs[2]], 900) } }, rF2, fauxAdmin, dbInterdite);
          var cF2 = rF2.out && rF2.out.couverture;
          ok(cF2 && cF2.fichesRetrouvees === 3,
            '⛔⛔ deux pages, une fiche COMMUNE aux deux : 3 retrouvées, pas 4. Compter '
            + 'deux fois la même ferait dépasser le catalogue et annoncerait une '
            + 'couverture qui n\'existe pas (obtenu '
            + JSON.stringify(cF2 && cF2.fichesRetrouvees) + ')');
          ok(cF2 && cF2.fichesJamaisVues === parMarque[marqueT].length - 3,
            '⛔⛔ …et ce qui RESTE sans coût d\'achat relevé, en clair. C\'est de '
            + 'l\'argent : une fiche jamais vue garde un coût supposé (obtenu '
            + JSON.stringify(cF2 && cF2.fichesJamaisVues) + ', attendu '
            + (parMarque[marqueT].length - 3) + ')');
          /* ⛔⛔ LE COMPTE ET LA LISTE DOIVENT PARLER DE LA MÊME IDENTITÉ.
             Mesuré le 03/08 sur son balayage : `fichesJamaisVues: 333` face à
             une liste nommée de 419 entrées. Cause : une fiche atteinte par un
             ALIAS était comptée trouvée sous la référence VUE chez le
             fournisseur, alors que la liste la cherchait sous celle du
             CATALOGUE. Deux vérités pour un seul fait — et une liste qui nomme
             des produits déjà trouvés envoie chercher pour rien.
             ⚠️ Le harnais choisit l'alias À L'EXÉCUTION : une fiche du catalogue
             qui déclare un `srcAltSkus`. Sans elle, le contrôle ne vérifie
             rien, donc c'est un PRÉALABLE, pas un repli poli. */
          var ficheAlias = null;
          for (var fa = 0; fa < catT.length; fa++) {
            if (catT[fa].sku && Array.isArray(catT[fa].srcAltSkus) && catT[fa].srcAltSkus.length
                && String(catT[fa].brand || '').toUpperCase() === marqueT) {
              ficheAlias = catT[fa]; break;
            }
          }
          ok(!!ficheAlias,
            '⛔ PRÉALABLE : une fiche de la marque déclare un `srcAltSkus` — sans elle, '
            + 'l\'accord entre le compte et la liste ne peut pas être vérifié');
          if (ficheAlias) {
            adm._internals.pwScanReset();
            var rAl = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: marqueT, source: 'idealo', sec: '1',
                /* ⚠️ SANS `scan` : ces assertions jugent la QUALITÉ de la liste
                   (compte == liste, troncature déclarée), pas le moment de son
                   envoi. Depuis le 09/08/2026 le détail est différé à la dernière
                   page du balayage — les garder en balayage les ferait juger une
                   liste volontairement absente. */
                manquants: '1' },
              // La page n'écrit QUE l'alias, jamais la référence de la fiche.
              body: { text: pageDeFiches([String(ficheAlias.srcAltSkus[0]).toUpperCase()], 800) } },
              rAl, fauxAdmin, dbInterdite);
            var cAl = rAl.out && rAl.out.couverture;
            ok(cAl && cAl.fichesRetrouvees === 1,
              '⛔ PRÉALABLE : la fiche est bien retrouvée par son alias (obtenu '
              + JSON.stringify(cAl && cAl.fichesRetrouvees) + ')');
            var encoreListee = (cAl && cAl.fichesJamaisVuesDetail || []).filter(function (f) {
              return String(f.sku).toUpperCase() === String(ficheAlias.sku).toUpperCase();
            });
            ok(encoreListee.length === 0,
              '⛔⛔ …et elle DISPARAÎT de la liste des jamais vues. Compter sous la '
              + 'référence vue et lister sous celle du catalogue donnait deux vérités '
              + 'pour un seul fait — 333 contre 419 sur son balayage du 03/08 (obtenu '
              + encoreListee.length + ' entrée(s) fantômes)');
            /* ⛔⛔ LE COMPTE ET LA LISTE TOMBENT AU MÊME CHIFFRE — ou la
               troncature est DÉCLARÉE. Un plafond silencieux ment exactement
               comme un compteur faux : la liste se lit « voici tout ce qui
               manque » alors qu'elle en a tu une partie. Le plafond se RELIT
               dans le produit, jamais recopié — un seuil recopié se périme. */
            var plafond = /const PW_MANQUANTS_MAX = (\d+)/.exec(adminSrc);
            ok(!!plafond, '⛔ PRÉALABLE : le plafond de la liste se relit dans api/admin.js');
            var nLis = (cAl && cAl.fichesJamaisVuesDetail || []).length;
            var nCpt = cAl && cAl.fichesJamaisVues;
            var cap = plafond ? parseInt(plafond[1], 10) : 0;
            ok(cap > 0 && nLis === Math.min(nCpt, cap),
              '⛔⛔ la LISTE porte exactement ce que le COMPTE annonce, à concurrence du '
              + 'plafond — un écart muet, c\'est l\'un des deux qui ment sans qu\'on sache '
              + 'lequel (obtenu compte=' + JSON.stringify(nCpt) + ', liste=' + nLis
              + ', plafond=' + cap + ')');
            ok(cAl && cAl.fichesJamaisVuesListeTronquee === (nCpt > cap),
              '⛔ …et le drapeau de troncature dit la vérité dans les DEUX sens : un '
              + 'plafond silencieux ment comme un compteur faux (obtenu '
              + JSON.stringify(cAl && cAl.fichesJamaisVuesListeTronquee)
              + ', attendu ' + (nCpt > cap) + ')');
            /* ⚠️ CE QUE CETTE PORTE NE COUVRE PAS, et il faut le dire : avec le
               catalogue actuel (mesuré le 03/08 : 619 fiches manquantes pour un
               plafond de 1200), la branche TRONQUÉE n'est jamais atteinte. Les
               deux assertions ci-dessus gardent l'invariant — liste = min(compte,
               plafond), drapeau = (compte > plafond) — et elles mordront le jour
               où le catalogue dépassera le plafond. Aucun sabotage ne peut les
               faire rougir sur la branche tronquée aujourd'hui : ce n'est pas un
               oubli, c'est une limite de ce que les données permettent. */
            adm._internals.pwScanReset();
          }

          /* ══ NOMMER LES FICHES QUI ONT FAILLI ÊTRE RAPPROCHÉES ═══════════
             ⛔⛔ « 14 vraies références introuvables » n'est pas actionnable :
             un écart chiffré se suppose, un écart NOMMÉ se corrige. Deux
             causes opposées derrière une fiche introuvable — le fournisseur
             écrit la même référence autrement (réparable par `srcAltSkus`,
             donc un coût d'achat réel de plus), ou il ne vend pas l'article
             (rien à chercher). Le voisinage par préfixe normalisé les sépare.
             ⚠️ La référence de travail est CHOISIE À L'EXÉCUTION sur un
             critère — une fiche à suffixe — jamais nommée dans le harnais. */
          /* ⛔⛔ LE SUJET DOIT ÊTRE INTROUVABLE PAR SA FORME NUE — sinon ce
             contrôle ne teste PAS le quasi-rapprochement.
             Défaut trouvé le 04/08/2026, après un import qui a fait passer une
             marque devant l'autre : le harnais a changé de sujet et a pris une
             fiche en `-XJ`. Or `racineRef` RETIRE le marquage géographique :
             la forme nue s'apparie alors EXACTEMENT, la fiche est trouvée — le
             bon résultat — et n'apparaît donc jamais dans la liste des
             quasi-rapprochements que l'assertion inspecte. Le harnais rougissait
             sur un comportement JUSTE.
             ⚠️ Le critère manquant : la forme nue ne doit pas être la racine.
             `199483-0X` la satisfait (suffixe numérique, non retiré) ;
             `DCF922N-XJ` non. On l'exige, au lieu de le supposer. */
          var refSuffixee = null;
          for (var rs = 0; rs < parMarque[marqueT].length; rs++) {
            var cand = parMarque[marqueT][rs];
            if (!/^[A-Z0-9]{5,}-[A-Z0-9]{2,3}$/.test(cand)) continue;
            if (pp.racineRef(cand) === cand.split('-')[0]) continue;   // trouvable exactement
            refSuffixee = cand; break;
          }
          ok(!!refSuffixee,
            '⛔ PRÉALABLE : le catalogue porte au moins une référence à suffixe '
            + '(forme RÉF-XX) dont la forme NUE ne suffit pas à la retrouver — '
            + 'sans elle ce contrôle ne vérifie rien');
          if (refSuffixee) {
            var refNue = refSuffixee.split('-')[0];
            adm._internals.pwScanReset();
            var rQ = fauxRes();
            await admFn({ method: 'POST',
              query: { type: 'price-watch', brand: marqueT, source: 'idealo', sec: '1', scan: '1' },
              /* Le fournisseur écrit la version NUE ; le catalogue porte la
                 suffixée. C'est exactement le cas `-XJ` du projet. */
              body: { text: pageDeFiches([refNue, troisRefs[0], 'ZZINTRUS9999'], 400) } },
              rQ, fauxAdmin, dbInterdite);
            var cQ = rQ.out && rQ.out.couverture;
            var vise = (cQ && cQ.fichesQuasiRapprocheesDetail || []).filter(function (e) {
              return e.fiche === refSuffixee;
            });
            ok(vise.length === 1 && String(vise[0].refVue).toUpperCase().indexOf(refNue) === 0,
              '⛔⛔ une fiche que le fournisseur écrit SANS son suffixe est NOMMÉE, avec '
              + 'la référence vue en face : c\'est ce qui rend les 14 réparables au lieu '
              + 'd\'être un chiffre (obtenu '
              + JSON.stringify((cQ && cQ.fichesQuasiRapprocheesDetail || []).slice(0, 3)) + ')');
            /* ⛔ ET SURTOUT : LA LISTE NE DÉVERSE PAS TOUT LE CATALOGUE. Une
               fiche sans aucun voisin chez le fournisseur ne remonte PAS —
               sinon on enverrait chercher 393 réparations dont 379 n'existent
               pas, et la liste deviendrait du bruit qu'on cesse de lire. */
            ok(cQ && cQ.fichesQuasiRapprochees < cQ.fichesJamaisVues,
              '⛔⛔ les fiches SANS voisin chez le fournisseur ne remontent pas : '
              + JSON.stringify(cQ && cQ.fichesQuasiRapprochees) + ' quasi sur '
              + JSON.stringify(cQ && cQ.fichesJamaisVues) + ' jamais vues');
            /* ⛔ Une fiche DÉJÀ rapprochée n'a rien à faire dans les quasi :
               elle est trouvée, il n'y a rien à réparer. */
            ok(cQ && cQ.fichesRetrouvees >= 1,
              '⛔ PRÉALABLE : la page porte une référence EXACTE du catalogue, elle est '
              + 'donc rapprochée (obtenu ' + JSON.stringify(cQ && cQ.fichesRetrouvees) + ')');
            var dejaVues = (cQ && cQ.fichesQuasiRapprocheesDetail || []).filter(function (e) {
              return String(e.fiche).toUpperCase() === String(troisRefs[0]).toUpperCase();
            });
            ok(dejaVues.length === 0,
              '⛔⛔ une fiche déjà RAPPROCHÉE ne figure PAS dans les quasi — elle est '
              + 'trouvée, il n\'y a rien à réparer sur elle, et l\'y laisser gonflerait la '
              + 'liste de faux chantiers (obtenu ' + dejaVues.length + ' entrée(s))');
            adm._internals.pwScanReset();
          }
        /* ══ LA LISTE NOMMÉE DE CE QUI N'A PAS ÉTÉ TROUVÉ ══════════════════
           ⛔⛔ Sa demande du 03/08 : « je veux la liste des produits qui n'ont
           pas été trouvés, je vais aller chercher sur idealo pour vérifier
           s'ils n'y sont pas vraiment ». Le compteur disait 333 ; il ne disait
           PAS lesquelles — donc il ne permettait aucune vérification. */
        adm._internals.pwScanReset();
        var rMq = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: marqueT, source: 'idealo', sec: '1',
            /* ⚠️ Idem : le sujet est le CONTENU de la liste (référence + libellé). */
            manquants: '1' },
          body: { text: pageDeFiches(troisRefs.slice(0, 2), 700) } },
          rMq, fauxAdmin, dbInterdite);
        var cMq = rMq.out && rMq.out.couverture;
        var listeMq = cMq && cMq.fichesJamaisVuesDetail;
        ok(Array.isArray(listeMq) && listeMq.length > 0,
          '⛔⛔ `&manquants=1` rend la LISTE NOMMÉE, pas seulement le compte : un écart '
          + 'chiffré se suppose, un écart nommé se va chercher (obtenu '
          + JSON.stringify(Array.isArray(listeMq) ? listeMq.length : listeMq) + ')');
        if (Array.isArray(listeMq)) {
          ok(listeMq.every(function (f) { return f && f.sku && typeof f.nom === 'string'; }),
            '⛔ chaque ligne porte la RÉFÉRENCE et le LIBELLÉ — une référence seule ne se '
            + 'cherche pas sur un comparateur');
          var trouvees = listeMq.filter(function (f) {
            return troisRefs.slice(0, 2).indexOf(String(f.sku).toUpperCase()) !== -1;
          });
          ok(trouvees.length === 0,
            '⛔⛔ les fiches que le balayage A RETROUVÉES ne figurent PAS dans la liste : '
            + 'l\'y laisser l\'enverrait chercher des produits déjà trouvés (obtenu '
            + trouvees.length + ')');
        }
        /* ⛔ ET SANS LE DRAPEAU, RIEN. 333 lignes rendues 67 fois seraient
           incollables sur son iPad — c'est le problème que `bref` a réglé. */
        adm._internals.pwScanReset();
        var rSansMq = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: marqueT, source: 'idealo', sec: '1', scan: '1' },
          body: { text: pageDeFiches(troisRefs.slice(0, 2), 700) } },
          rSansMq, fauxAdmin, dbInterdite);
        ok(rSansMq.out && rSansMq.out.couverture
          && rSansMq.out.couverture.fichesJamaisVuesDetail === undefined,
          '⛔ sans `&manquants=1`, la liste ne sort PAS — sinon chaque page du balayage '
          + 'la traînerait, et le mode bref ne servirait plus à rien');
        adm._internals.pwScanReset();
        }

        ok(cE3 && typeof cE3.cause === 'string' && !!cE3.lecture,
          '⛔⛔ un cumul incomplet dit sa CAUSE en clair, pas seulement son écart : '
          + 'un « il manque 14 pages » sans cause se termine toujours en supposition — '
          + 'et j\'en ai déjà écrit une fausse (obtenu cause='
          + JSON.stringify(cE3 && cE3.cause) + ')');
        adm._internals.pwScanReset();

        /* ⛔⛔ LE RACCOURCI PEUT ME RENVOYER MA PROPRE RÉPONSE — et le
           diagnostic générique désignait alors le mauvais coupable. Mesuré le
           03/08 sur son premier balayage des 67 pages : `octetsRecus: 1195`
           là où une page en fait treize mille, et les extraits étaient du
           JSON `{"ok":true,…}` ré-échappé à chaque tour. Dans son raccourci,
           le champ `text` du POST pointait sur « Contenu de l'URL » — une
           variable qui, au tour suivant, désigne la sortie du POST PRÉCÉDENT.
           ⛔ Le diagnostic répondait « la marque apparaît 5× mais jamais
           suivie d'une référence : ce site écrit ses titres autrement ».
           Exact sur le texte reçu, et une piste TOTALEMENT fausse — elle
           envoie chercher dans le parseur un défaut qui est dans le câblage
           du raccourci. Un diagnostic qui désigne le mauvais coupable coûte
           plus cher que pas de diagnostic.
           ⚠️ Le harnais fabrique la boucle comme elle se produit VRAIMENT :
           on prend une réponse du point d'entrée et on la renvoie. */
        var rBoucle1 = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'MAKITA', source: 'idealo', sec: '1' },
          body: { text: 'MAKITA ZZQ1234\nMachine\n1 offre\nà partir de100,00 €' } },
          rBoucle1, fauxAdmin, dbInterdite);
        var rBoucle2 = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'MAKITA', source: 'idealo', sec: '1' },
          body: { text: JSON.stringify(rBoucle1.out) } }, rBoucle2, fauxAdmin, dbInterdite);
        ok(rBoucle2.out && rBoucle2.out.format === 'boucle',
          '⛔⛔ renvoyer MA PROPRE RÉPONSE au lieu de la page est reconnu et NOMMÉ — '
          + 'sinon le diagnostic accuse le parseur d\'un défaut de câblage (format '
          + JSON.stringify(rBoucle2.out && rBoucle2.out.format) + ')');
        ok(rBoucle2.out && /Définir une variable/.test(String(rBoucle2.out.note)),
          '⛔ …et la réponse dit QUOI FAIRE, avec le nom exact de l\'action. Un refus '
          + 'qui ne dit pas quoi faire est un mur');
        /* ⛔⛔ PRÉALABLE — une VRAIE page ne doit jamais être prise pour une
           boucle. Sans lui, une détection qui répondrait « boucle » à tout
           resterait verte en rendant le traqueur inutilisable. */
        ok(rBoucle1.out && rBoucle1.out.format !== 'boucle',
          '⛔ PRÉALABLE : une vraie page n\'est JAMAIS prise pour une boucle — sinon '
          + 'le traqueur refuserait tout en croyant se protéger');
        /* ⛔ Et rien du corps reçu ne ressort : c'est une longueur et un mode
           d'emploi, jamais un extrait de ce qu'on nous a envoyé (J3). */
        ok(rBoucle2.out && typeof rBoucle2.out.octetsRecus === 'number'
          && !rBoucle2.out.diagnostic,
          '⛔ la réponse de boucle rend une LONGUEUR, pas d\'extraits du corps reçu');
        /* ⛔⛔ ET UNE VRAIE PAGE, LONGUE, QUI CONTIENDRAIT CES MOTS PAR HASARD
           NE DOIT PAS ÊTRE PRISE POUR UNE BOUCLE. Un comparateur affiche des
           forums, des FAQ, du code : « "ok": » et « "diagnostic": » peuvent
           s'y trouver. Sans la borne de taille, une page entière serait
           refusée et le traqueur mourrait sur une page parfaitement valide —
           en annonçant un défaut de câblage qui n'existe pas.
           ⚠️ Le cas se construit AUTOUR de la borne, sans la recopier : on
           prend une vraie page et on l'allonge jusqu'à la dépasser largement. */
        /* ⚠️ La page NE DOIT RIEN DONNER au parseur : la détection de boucle
           ne s'atteint que là. Un premier jet mettait un produit reconnaissable
           dedans — l'assertion passait sans jamais franchir la branche, verte
           pour la mauvaise raison. C'est le cas RÉEL d'un site au gabarit
           inconnu, long, dont on ne tire encore rien. */
        var bruit = [];
        for (var q = 0; q < 900; q++) bruit.push('avis client ' + q + ' : "ok": tres bon outil');
        var pageLongue = ['foire aux questions : le champ "diagnostic": explique tout']
          .concat(bruit).join('\n');
        var rLongue = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'MAKITA', source: 'idealo', sec: '1' },
          body: { text: pageLongue } }, rLongue, fauxAdmin, dbInterdite);
        /* ⛔⛔ ET UNE PAGE COURTE DONT ON NE TIRE RIEN N'EST PAS UNE BOUCLE
           NON PLUS : c'est le cas d'un SITE INCONNU, celui pour lequel le
           diagnostic existe. Le confondre avec un raccourci mal câblé ferait
           perdre la seule voie d'apprentissage d'un nouveau gabarit — ces
           sites sont injoignables depuis le dépôt, ce texte est tout ce qu'on
           aura jamais. */
        var rInconnue = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'MAKITA', source: 'idealo', sec: '1' },
          body: { text: 'Bienvenue sur notre boutique\nNos rayons\nContactez-nous' } },
          rInconnue, fauxAdmin, dbInterdite);
        /* ⛔ ET DU JSON QUI N'EST PAS LE MIEN N'EST PAS UNE BOUCLE. Un site
           peut renvoyer une erreur d'API, un flux, un objet quelconque : le
           signe d'une boucle n'est pas « c'est du JSON », c'est « ce sont MES
           champs de sortie ». Sans ce cas, la seconde condition ne serait
           gardée par rien. */
        ok(pp.estMaPropreReponse('{"ok":true,"produits":[],"message":"rien"}') === false,
          '⛔ du JSON étranger n\'est pas une boucle — ce qui la signe, ce sont MES '
          + 'champs de sortie, pas la forme JSON');
        ok(pp.estMaPropreReponse(JSON.stringify(rBoucle1.out)) === true,
          '⛔ PRÉALABLE : et MA réponse, elle, est bien reconnue — sinon la ligne '
          + 'ci-dessus passerait sur une fonction qui dit toujours non');
        /* ⛔⛔ ET LA RÉPONSE « BOUCLE » DOIT SE RECONNAÎTRE ELLE-MÊME. Défaut
           mesuré le 03/08 : elle ne portait AUCUN des champs cherchés. Donc au
           tour suivant, quand le raccourci me la renvoyait à son tour, je ne
           la voyais plus — le message d'aide sortait UNE fois, puis le tour
           d'après retombait sur le diagnostic générique qui accuse le parseur.
           L'user recevait la mauvaise piste juste après la bonne.
           ⛔ Une réponse qui décrit un défaut doit survivre à son propre
           aller-retour, sinon elle s'efface au moment où elle sert le plus. */
        ok(pp.estMaPropreReponse(JSON.stringify(rBoucle2.out)) === true,
          '⛔⛔ la réponse « boucle » se reconnaît ELLE-MÊME quand elle revient — '
          + 'sinon le diagnostic juste s\'efface au deuxième tour et laisse la place '
          + 'à celui qui accuse le mauvais coupable');
        var rBoucle3 = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'MAKITA', source: 'idealo', sec: '1' },
          body: { text: JSON.stringify(rBoucle2.out) } }, rBoucle3, fauxAdmin, dbInterdite);
        ok(rBoucle3.out && rBoucle3.out.format === 'boucle',
          '⛔⛔ …et au TROISIÈME tour aussi : le message d\'aide ne doit pas '
          + 'disparaître au bout d\'un aller-retour (format '
          + JSON.stringify(rBoucle3.out && rBoucle3.out.format) + ')');
        ok(rInconnue.out && rInconnue.out.format !== 'boucle' && rInconnue.out.diagnostic,
          '⛔⛔ une page d\'un site INCONNU garde son diagnostic — la confondre avec '
          + 'une boucle ferait perdre la seule voie d\'apprentissage d\'un gabarit '
          + 'neuf (format ' + JSON.stringify(rInconnue.out && rInconnue.out.format) + ')');
        ok(rLongue.out && rLongue.out.format !== 'boucle',
          '⛔⛔ une VRAIE page, longue, qui contient ces mots par hasard n\'est PAS '
          + 'une boucle — sinon le traqueur meurt sur une page valide en accusant le '
          + 'raccourci (format ' + JSON.stringify(rLongue.out && rLongue.out.format)
          + ', ' + pageLongue.length + ' signes)');

        /* ⛔⛔ LA BARRIÈRE D'ACHAT — ELLE ÉCARTE, ELLE N'EFFACE PAS.
           Demande de l'user du 03/08 : « tous les articles qui dépassent un
           délai de livraison de 8 jours devront être écartés MAIS
           temporairement […] il faut créer une barrière mais facile à enlever
           ou à modifier ». Et une fourchette de prix, 50 € – 50 000 €.
           ⚠️ J4 : le coût retenu est le MINIMUM des sources valables. Écarter
           à tort le remonte ; laisser passer à tort adosse un prix de vente à
           une offre qui ne peut pas l'honorer.
           ⚠️ Le harnais ne recopie AUCUN seuil : il les relit dans le module,
           et fabrique ses cas AUTOUR de la valeur en vigueur. Un seuil recopié
           se périme, et celui-ci est fait pour changer. */
        var brr = require('../api/_lib/barriere-achat.js');
        var seuilJ = brr.SEUILS.delaiMaxJours;
        var pageBarriere = [
          'Défonceuse sans fil MAKITA ZZW620H1T 18 V',
          'Vendu par : UnMarchand.fr', 'Détails de l’offre',
          seuilJ + ' jours ouvrés', 'Livraison gratuite', '691,53 € TVA incluse',
          '',
          'Cloueuse sans fil MAKITA ZZN930P2 18 V',
          'Vendu par : AutreMarchand.fr', 'Détails de l’offre',
          (seuilJ + 1) + ' jours ouvrés', 'Livraison gratuite', '677,57 € TVA incluse'
        ].join('\n');
        var rBar = fauxRes();
        await admFn({ method: 'POST',
          query: { type: 'price-watch', brand: 'MAKITA', source: 'idealo', sec: '1' },
          body: { text: pageBarriere } }, rBar, fauxAdmin, dbInterdite);
        var bar = (rBar.out && rBar.out.barriere) || {};
        var ecar = bar.ecartes || [];
        ok(ecar.length === 1 && ecar[0].delaiJours === seuilJ + 1,
          '⛔⛔ ARGENT : l\'offre à ' + (seuilJ + 1) + ' jours est ÉCARTÉE, celle à '
          + seuilJ + ' jours PASSE — la barrière mord juste au-dessus du seuil, pas '
          + 'à côté (' + JSON.stringify(ecar.map(function (x) { return x.delaiJours; })) + ')');
        ok(ecar.length === 1 && /jours/.test(String(ecar[0].motif))
          && /barriere-achat/.test(String(ecar[0].motif)),
          '⛔ …et l\'écartée dit POURQUOI et OÙ se lève la barrière — sans ça, l\'user '
          + 'ne sait pas laquelle des deux règles l\'a retenue ('
          + JSON.stringify(ecar[0] && ecar[0].motif) + ')');
        /* ⛔⛔ ÉCARTER N'EST PAS EFFACER. Le jour où il lève la barrière, il doit
           retrouver EXACTEMENT ce qu'elle retenait — donc la ligne reste dans
           le relevé, avec son prix. */
        /* ⚠️ L'offre RETENUE part désormais dans les lues (`inconnus`), la
           REFUSÉE reste dans `sansRefDetail`. L'invariant tient toujours :
           AUCUNE des deux ne disparaît. On compte donc les deux seaux — ne
           compter que `sansRefDetail` testerait l'aiguillage, pas la
           conservation. */
        var luesBar = (rBar.out.sansRefDetail || []).length
          + (rBar.out.inconnus || []).length + (rBar.out.reconnus || []).length;
        ok(luesBar === 2 && (rBar.out.sansRefDetail || []).length >= 1,
          '⛔⛔ la ligne écartée RESTE listée avec son prix : une barrière écarte, '
          + 'elle n\'efface pas — sinon on ne peut plus la lever ('
          + luesBar + '/2, dont ' + (rBar.out.sansRefDetail || []).length + ' écartée(s))');
        ok(bar.seuils && bar.seuils.delaiMaxJours === seuilJ,
          '⛔ les seuils EN VIGUEUR sont rendus avec le verdict : lire un refus sans '
          + 'connaître la règle qui l\'a produit ne sert à rien');
        /* PRÉALABLE — sans lui, une barrière qui refuserait TOUT resterait verte. */
        ok(ecar.length < luesBar,
          '⛔ PRÉALABLE : la barrière ne refuse pas tout — sinon elle serait verte en '
          + 'écartant le catalogue entier (' + ecar.length + ' refusée(s) sur ' + luesBar + ')');

        /* ⛔⛔ UNE FOURCHETTE SE LIT PAR SON PIRE BOUT. « 3 à 9 jours ouvrés »,
           c'est neuf jours pour qui attend le colis. Lire « 3 » laisserait
           passer une offre que l'user veut écarter, en croyant compter trois.
           Un premier sabotage — min à la place de max — est resté VERT : mon
           corpus n'avait que des valeurs simples, jamais de fourchette. Le
           cas qui discrimine, c'est celui-là.
           ⚠️ Les deux bornes s'écrivent AUTOUR du seuil en vigueur : un seuil
           recopié se périme, et celui-ci est fait pour changer. */
        var basSeuil = Math.max(1, seuilJ - 5);
        ok(brr.delaiEnJours(basSeuil + ' à ' + (seuilJ + 1) + ' jours ouvrés') === seuilJ + 1,
          '⛔⛔ ARGENT : « ' + basSeuil + ' à ' + (seuilJ + 1) + ' jours » vaut '
          + (seuilJ + 1) + ', le PIRE bout — c\'est ce qu\'on subit (obtenu '
          + brr.delaiEnJours(basSeuil + ' à ' + (seuilJ + 1) + ' jours ouvrés') + ')');
        ok(brr.juger({ prix: 500, delaiJours: brr.delaiEnJours(basSeuil + '-' + (seuilJ + 1) + ' jours') }).retenu === false,
          '⛔ …et une offre annoncée « ' + basSeuil + '-' + (seuilJ + 1) + ' jours » est '
          + 'donc ÉCARTÉE, pas retenue sur la foi de son meilleur bout');
        /* ⛔ UNE IGNORANCE NE REFUSE PAS. Sans délai écrit, la barrière du
           délai ne tranche pas : écarter faute d'information viderait le
           relevé des sites avares en détails, et remonterait le coût d'achat
           sans qu'aucun fait ne le justifie. */
        ok(brr.juger({ prix: 500, delaiJours: null }).retenu === true,
          '⛔ un délai INCONNU ne fait pas écarter : une ignorance ne vote pas');
        /* ⛔ La fourchette de prix, aux DEUX bouts, avec de la marge — un
           seuil testé pile sur sa valeur n'est pas un seuil. */
        var pMin = brr.SEUILS.prixMinEuros, pMax = brr.SEUILS.prixMaxEuros;
        ok(brr.juger({ prix: pMin - 1, delaiJours: 1 }).retenu === false
          && brr.juger({ prix: pMax + 1, delaiJours: 1 }).retenu === false
          && brr.juger({ prix: (pMin + pMax) / 2, delaiJours: 1 }).retenu === true,
          '⛔⛔ ARGENT : la fourchette de prix mord aux DEUX bouts et laisse passer '
          + 'le milieu — c\'est elle qui a écarté les frais de port pris pour des '
          + 'prix d\'article (plancher ' + pMin + ' €, plafond ' + pMax + ' €)');

        /* ⛔⛔ AUCUN BLOC NE DISPARAÎT EN SILENCE (03/08/2026). Cinq réfs sont
           ressorties « non lues » sur SA page sans qu'aucune trace n'explique
           pourquoi. Le parseur les écartait sans rien dire — même défaut que
           le `parsed: 0` muet du 01/08. Chaque écart porte désormais SA
           RAISON. Ici la carte ZZT002B n'a pas de prix : elle doit être
           NOMMÉE, avec la cause. */
        var pd = rTrou.out.perdus || [];
        var pdRef = pd.filter(function (x) { return /ZZT002B/.test(x.raison); })[0];
        ok(pdRef && /prix/i.test(pdRef.raison),
          '⛔ une carte écartée faute de prix est CONSIGNÉE avec sa raison — sans '
          + 'ça sa référence ressort « non lue » et rien n\'explique pourquoi ('
          + JSON.stringify(pd.map(function (x) { return x.raison; })) + ')');
        ok(pdRef && Array.isArray(pdRef.lignes) && pdRef.lignes.length > 0
          && pdRef.lignes.join(' ').indexOf('ZZT002B') !== -1,
          'et avec les LIGNES de page qui l\'entourent : une raison sans le texte '
          + 'ne se vérifie pas');
        /* PRÉALABLE — sans lui, un registre qui consigne TOUT serait aussi
           inutile qu'un registre vide : il faut que le normal ne bruite pas. */
        ok(pd.length <= 3,
          'préalable : une page dont presque tout est lu ne produit qu\'une poignée '
          + 'd\'écarts — un registre qui consigne tout ne se lit plus (' + pd.length + ')');
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
        /* ⛔ SNAPSHOT DES DERNIERS PRIX (09/08/2026, exigé par l'user) : CHAQUE
           prix appliqué doit se replier dans son shard config/prix_snapshot_N —
           c'est LUI que le rendu lit (4 lectures au lieu de ~1 700). Un prix
           écrit dans la collection mais pas dans le snapshot = un site qui
           continue d'afficher l'ANCIEN prix. */
        var snapLib = require('../api/_lib/snapshot.js');
        var shardAttendu = 'prix_snapshot_' + snapLib.shardDe(cible.id);
        var shardDoc = dbP._compte.configDocs[shardAttendu];
        var entreeSnap = shardDoc && shardDoc[cible.id];
        ok(!!(entreeSnap && typeof entreeSnap.price === 'number'
          && dbP._compte.patchsParId[cible.id]
          && entreeSnap.price === dbP._compte.patchsParId[cible.id].price),
          '⛔ le prix APPLIQUÉ est replié dans son shard snapshot (' + shardAttendu
          + ') avec LE MÊME prix — obtenu : ' + JSON.stringify(entreeSnap && entreeSnap.price)
          + ' vs collection ' + JSON.stringify(dbP._compte.patchsParId[cible.id]
            && dbP._compte.patchsParId[cible.id].price));

        var patchP = dbP._compte.patchsParId[cible.id];
        ok(!!(patchP && patchP.promoAncienPrix != null
          && Math.abs(patchP.promoAncienPrix - minJournal) < 0.01),
          '⛔ J4 : promoAncienPrix doit être le MINIMUM 30 j du journal (' + minJournal
          + '), pas le prix courant (' + courantHaut + '), et JAMAIS une entrée hors fenêtre '
          + 'ou d\'une autre fiche — obtenu : ' + (patchP && patchP.promoAncienPrix)
          + '. L\'ancien calcul (sentinel - 30 j = NaN) ne trouvait jamais le journal.');

        /* ⛔ TR-001 KILL-SWITCH (mise en réel 08/08/2026) : TRAQUEUR_ECRIRE='0'
           gèle TOUTE écriture sans redéploiement — l'arrêt d'urgence de
           l'automatisation iPad. Même page reconnue, même base : ZÉRO écriture. */
        scanReset();
        var seedOvK = {}; seedOvK[cible.id] = { price: courantHaut };
        var dbK = fauxDb(seedOvK, []);
        var rK = fauxRes();
        process.env.TRAQUEUR_ECRIRE = '0';
        await admFn(reqPage(cible.sku, {}), rK, fauxAdmin, dbK);
        delete process.env.TRAQUEUR_ECRIRE;
        ok(rK.out && rK.out.gelEcriture === true
          && Object.keys(dbK._compte.ecrituresParId).length === 0,
          '⛔ TRAQUEUR_ECRIRE=0 gèle l\'écriture : 0 override écrit ('
          + JSON.stringify({ gel: rK.out && rK.out.gelEcriture, ecritures: dbK._compte.ecrituresParId }) + ')');

        /* ── ANTI RATE-LIMIT : BLOCAGE DU COMPARATEUR (08/08/2026) ────────────
           Cloudflare a rate-limité en essai. detecterBlocage est PURE : on la
           teste seule (challenge vs vraie page), puis de bout en bout — une page
           bloquée n'écrit RIEN + pose l'alerte + arme le backoff. */
        var detB = pp.detecterBlocage;
        ok(typeof detB === 'function', 'detecterBlocage exportée');
        var pageChallenge = 'Just a moment...\ncf-browser-verification\nChecking your browser before accessing idealo.\n'
          + 'DDoS protection by Cloudflare\nRay ID: abc123\n' + 'x'.repeat(300);
        ok(!!detB(pageChallenge, 0), 'une page de challenge Cloudflare est détectée (' + detB(pageChallenge, 0) + ')');
        ok(detB('', 403) === 'statut-http-403' && detB('', 429) === 'statut-http-429' && detB('', 1015) === 'statut-http-1015',
          'un statut HTTP de blocage (403/429/1015) fait autorité, sans regarder le contenu');
        ok(detB(pageIdealo(cible.sku, '450,00'), 200) === null,
          '⛔ FAUX POSITIF INTERDIT : une vraie page produit idealo n\'est JAMAIS prise pour un blocage — sinon le traqueur se gèle seul');
        scanReset();
        var dbBlo = fauxDb({}, [], {});
        var rBlo = fauxRes();
        await admFn({ method: 'POST', query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo' },
          body: { text: pageChallenge } }, rBlo, fauxAdmin, dbBlo);
        ok(rBlo.out && rBlo.out.bloque === true
          && Object.keys(dbBlo._compte.ecrituresParId).length === 0
          && dbBlo._compte.configDocs.traqueur_etat && Number(dbBlo._compte.configDocs.traqueur_etat.bloqueDepuis) > 0,
          '⛔ page bloquée → ZÉRO override écrit + alerte traqueur_etat posée ('
          + JSON.stringify({ bloque: rBlo.out && rBlo.out.bloque, ecr: Object.keys(dbBlo._compte.ecrituresParId).length,
            alerte: !!(dbBlo._compte.configDocs.traqueur_etat) }) + ')');
        scanReset();
        var dbBackoff = fauxDb({}, [], { traqueur_etat: { backoffJusqu: Date.now() + 3600000, raisonBlocage: 'cloudflare-just-a-moment' } });
        var rBk = fauxRes();
        await admFn(reqPage(cible.sku, {}), rBk, fauxAdmin, dbBackoff);
        ok(rBk.out && rBk.out.backoff === true && Object.keys(dbBackoff._compte.ecrituresParId).length === 0,
          '⛔ en backoff après un blocage : la page suivante n\'écrit RIEN, même reconnue ('
          + JSON.stringify({ backoff: rBk.out && rBk.out.backoff, ecr: Object.keys(dbBackoff._compte.ecrituresParId).length }) + ')');

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

  /* ═══ MOUVEMENT DES PRIX : LA DATE DOIT SURVIVRE À LA RELECTURE ══════════
     ⛔⛔ Signalé par l'user le 03/08 : « la section mouvement des prix, il ne
     marche pas ». Cause trouvée dans le code, pas devinée : le traqueur
     écrivait `at: serverTimestamp()`, et la page fait `Number(v.at)` puis
     `where('at','>=', <nombre>)`. À la relecture, un sentinel devient un OBJET
     Timestamp — `Number()` rend NaN, donc la date s'affiche vide ; et dans
     l'ordre des types Firestore, TOUT timestamp est supérieur à N'IMPORTE
     QUEL nombre, donc le choix « sur combien de jours » ne filtrait plus rien.
     La page paraissait fonctionner et mentait sur ses deux seules colonnes
     utiles.
     ⛔ C'est E-228 pour la TROISIÈME fois, après `priceCheckedAt` et
     `promoDepuis`. Et cette page n'avait AUCUNE porte — c'est pour ça que le
     défaut a survécu. Elle en a une maintenant.
     ⚠️ Le contrôle porte sur l'invariant, pas sur une écriture exacte : ce qui
     sera lu en arithmétique doit être un NOMBRE au moment de l'écriture. */
  var srcMoves = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  /* ⚠️ L'ANCRE NE DÉPEND PLUS DE LA FAÇON D'ÉCRIRE (09/08/2026). Elle visait
     `collection('price_watch_log').add({` — le passage des écritures en LOT a
     remplacé `add()` par `doc()`, et cette porte est tombée pour une raison qui
     n'était pas la sienne. Ce qu'elle garde, c'est le FORMAT DE LA DATE : elle
     s'ancre donc sur le nom de la collection, quelle que soit la mécanique
     d'écriture. */
  /* ⛔ On vise l'ÉCRITURE, pas une lecture : le fichier contient aussi des
     requêtes sur cette collection, et s'ancrer sur la première occurrence
     ferait juger le format de date sur un bloc de lecture. */
  var iLog = srcMoves.search(/collection\('price_watch_log'\)\s*\.doc\(\)|collection\('price_watch_log'\)\.add\(/);
  var blocLog = iLog === -1 ? null : [srcMoves.slice(iLog, iLog + 1400)];
  ok(!!blocLog, '⛔ PRÉALABLE : le bloc d\'écriture du journal des prix est lisible');
  if (blocLog) {
    ok(/\bat:\s*nowMs\b/.test(blocLog[0]),
      '⛔⛔ le journal des prix date en MILLISECONDES : un serverTimestamp relu devient un '
      + 'objet, `Number()` rend NaN, la date s\'affiche vide et le filtre « sur combien de '
      + 'jours » cesse de filtrer (E-228, 3ᵉ récidive)');
    ok(!/\bat:\s*now\b/.test(blocLog[0]),
      '⛔ …et surtout PAS le sentinel `now` : c\'est lui qui a cassé la page');
  }
  /* ⛔ ET LA LECTURE DOIT TOLÉRER LES DEUX. Les entrées écrites AVANT la
     correction portent un Timestamp ; les jeter effacerait l'historique, les
     laisser passer sans les dater afficherait l'historique entier quel que
     soit le nombre de jours demandé. `enMillis` lit les deux. */
  var blocMoves = srcMoves.match(/if \(type === 'price-moves'\)[\s\S]{0,2600}?\n      \}/);
  ok(!!blocMoves, '⛔ PRÉALABLE : le bloc `price-moves` est lisible');
  if (blocMoves) {
    ok(/enMillis\(v\.at\)/.test(blocMoves[0]),
      '⛔⛔ la lecture passe par `enMillis` : sans elle, une entrée ancienne (Timestamp) '
      + 'ressort à NaN et échappe au filtre de période');
    ok(/quand >= depuis/.test(blocMoves[0]),
      '⛔⛔ …et la période est REFILTRÉE en mémoire : le `where` Firestore laisse passer '
      + 'tous les Timestamps face à un nombre, donc « 7 jours » afficherait tout');
    ok(/moves\.sort\(/.test(blocMoves[0]),
      '⛔ …et le tri se refait en mémoire, pour la même raison : l\'ordre Firestore mêle '
      + 'deux types et place tous les timestamps avant tous les nombres');
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

  /* ═══ IDENTITÉ D'UNE PAGE, CAUSE D'UNE RAFALE AMPUTÉE, TOTAL SUR FICHIER ══
     Trois briques nées du même défaut, 03/08/2026 : le cumul de couverture
     rendait 53 pages sur 67 avec `pagesRefusees: 0`, et j'en ai conclu « les
     POST n'atteignent jamais le serveur ». Conclusion non mesurée : le cumul
     vit dans la mémoire d'UNE instance serverless, et une instance neuve au
     milieu du balayage produit exactement ce chiffre sans perdre une page.
     ⛔ Ce qui suit garde les trois remèdes : une page a une IDENTITÉ tirée de
     son contenu, une rafale amputée dit sa CAUSE, et le total se calcule sur
     le FICHIER des réponses — sans dépendre d'aucune instance. */
  var emp = pp.empreintePage;
  ok(typeof emp === 'function', 'empreintePage exportée');
  if (emp) {
    var pageSynth = function (base, n) {
      var l = [];
      for (var i = 0; i < (n || 60); i++) {
        l.push('Outil de controle - MARQUEZZ ZZTEST' + (100 + i));
        l.push('3 offres', 'à partir de', (base + i) + ',99 €');
      }
      return l.join('\n');
    };
    var pA = pageSynth(100), pB = pageSynth(900);
    ok(emp(pA) === emp(pA), 'la même page rend deux fois la même empreinte');
    ok(!!emp(pA) && emp(pA) !== emp(pB),
      '⛔ deux pages DIFFÉRENTES ne peuvent pas rendre la même empreinte : sinon le '
      + 'balayage croit avoir vu une page alors qu\'il en a vu deux');
    ok(emp('bonjour, aucune tuile ici') === null,
      'un texte sans montants ne fabrique PAS une identité (null, pas une empreinte creuse)');
    /* ⛔ CE QUI SÉPARE DEUX PAGES EST AU MILIEU, PAS EN TÊTE. L'user l'a dit :
       « il y a des produits en tête de page et au pied de page, mais cela ne
       compte pas ». Deux pages qui partagent leur en-tête et leur pied doivent
       rester distinctes — une empreinte prise sur les premiers montants seuls
       les confondrait. */
    var entete = ['Nos suggestions', '19,99 €', '29,99 €', '39,99 €', '49,99 €'].join('\n');
    var pied = ['Vus récemment', '9,99 €', '8,99 €', '7,99 €'].join('\n');
    ok(emp(entete + '\n' + pA + '\n' + pied) !== emp(entete + '\n' + pB + '\n' + pied),
      '⛔ même en-tête et même pied : deux pages restent distinctes (l\'échantillon '
      + 'court toute la hauteur, il ne s\'arrête pas aux premiers montants)');
  }

  var dr = require('../api/_lib/diag-rafale.js');
  ok(typeof dr.expliquerRafale === 'function', 'expliquerRafale exportée');
  if (dr.expliquerRafale) {
    var T = 1754200000000, cad = 4000;   // 4 s par page, comme ses balayages
    // 53 pages vues, 14 manquantes, instance née APRÈS le début du balayage.
    var froid = dr.expliquerRafale({
      pagesDansLaRafale: 53, pagesManquantes: 14, pagesRefusees: 0,
      debutRafale: T, finRafale: T + 52 * cad, demarrageInstance: T - 1000
    });
    ok(froid.cause === 'instance-froide',
      '⛔ instance née APRÈS le début estimé du balayage ⇒ les pages absentes ont été '
      + 'traitées ailleurs, elles ont été LUES (obtenu : ' + froid.cause + ')');
    // Même rafale, mais l'instance existait bien avant : les pages se sont perdues.
    var perdu = dr.expliquerRafale({
      pagesDansLaRafale: 53, pagesManquantes: 14, pagesRefusees: 0,
      debutRafale: T, finRafale: T + 52 * cad, demarrageInstance: T - 14 * cad - 60000
    });
    ok(perdu.cause === 'jamais-arrivees',
      '⛔ instance plus VIEILLE que le début du balayage ⇒ elle aurait dû voir ces pages : '
      + 'elles ne sont jamais arrivées (obtenu : ' + perdu.cause + ')');
    ok(froid.lecture !== perdu.lecture && !!froid.lecture && !!perdu.lecture,
      'les deux causes ne rendent PAS la même phrase — sinon le diagnostic ne diagnostique rien');
    // Une page arrivée VIDE est mesurée : elle prime sur toute estimation.
    ok(dr.expliquerRafale({
      pagesDansLaRafale: 60, pagesManquantes: 7, pagesRefusees: 7,
      debutRafale: T, finRafale: T + 59 * cad, demarrageInstance: T - 1000
    }).cause === 'pages-vides',
      '⛔ une page ARRIVÉE VIDE est mesurée : elle prime sur la date estimée');
    ok(dr.expliquerRafale({
      pagesDansLaRafale: 67, pagesManquantes: 0, pagesRefusees: 0,
      debutRafale: T, finRafale: T + 66 * cad, demarrageInstance: T - 1000
    }).cause === 'complet', 'rien ne manque → cause « complet »');
    ok(dr.expliquerRafale({
      pagesDansLaRafale: 1, pagesManquantes: 66, pagesRefusees: 0,
      debutRafale: T, finRafale: T, demarrageInstance: T
    }).cause === 'indeterminable',
      '⛔ une seule page : aucune cadence, donc AUCUNE conclusion — on le dit au lieu '
      + 'de trancher au hasard');
  }

  var bb = require('./bilan-balayage.js');
  ok(typeof bb.bilan === 'function' && typeof bb.objetsJson === 'function',
    'bilan-balayage expose bilan et objetsJson');
  if (bb.bilan) {
    var rep = function (e, t, l) { return { ok: true, page: { empreinte: e, tuiles: t, lues: l } }; };
    var b1 = bb.bilan([rep('aaa', 60, 59), rep('bbb', 60, 60), rep('ccc', 60, 58)], 3);
    ok(b1.pagesDifferentes === 3 && b1.tuilesVues === 180 && b1.produitsLus === 177,
      'trois pages différentes → 180 tuiles, 177 lues (obtenu ' + b1.tuilesVues + '/' + b1.produitsLus + ')');
    ok(b1.pagesManquantes === 0, 'les 3 pages attendues sont là');
    /* ⛔ LA MÊME PAGE ENVOYÉE DEUX FOIS N'AJOUTE AUCUN PRODUIT. Sans ça, un
       raccourci qui rejoue une page gonflerait le total et masquerait un trou :
       le rapport annoncerait « tout est là » avec une page manquante. */
    var b2 = bb.bilan([rep('aaa', 60, 60), rep('aaa', 60, 60), rep('bbb', 60, 60)], 3);
    ok(b2.pagesDifferentes === 2 && b2.tuilesVues === 120 && b2.pagesEnvoyeesDeuxFois === 1,
      '⛔ page rejouée : 2 pages différentes et 120 tuiles, pas 3 et 180 (obtenu '
      + b2.pagesDifferentes + ' et ' + b2.tuilesVues + ')');
    ok(b2.pagesManquantes === 1,
      '⛔ un doublon ne comble PAS un trou : il manque toujours une page');
    /* ⛔ UNE RÉPONSE SANS EMPREINTE NE DISPARAÎT PAS — ses produits ont été lus. */
    var b3 = bb.bilan([rep(null, 60, 60), rep(null, 60, 60)], 2);
    ok(b3.pagesDifferentes === 2 && b3.tuilesVues === 120 && b3.pagesSansEmpreinte === 2,
      'deux réponses sans empreinte comptent quand même leurs 120 tuiles');
    // Le total ne dépend PAS de l'instance : deux instances, même total.
    var b4 = bb.bilan([
      Object.assign(rep('aaa', 60, 60), { couverture: { instance: 'i1' } }),
      Object.assign(rep('bbb', 60, 60), { couverture: { instance: 'i2' } })
    ], 2);
    ok(b4.tuilesVues === 120 && b4.instances.length === 2,
      '⛔ deux instances ont répondu et le total reste juste — c\'est TOUT l\'intérêt : '
      + 'il se calcule sur le fichier, pas sur la mémoire d\'un serveur');
    ok(bb.objetsJson('[' + JSON.stringify(rep('a', 1, 1)) + ',' + JSON.stringify(rep('b', 1, 1)) + ']').length === 2,
      'un tableau JSON est lu comme deux réponses');
    ok(bb.objetsJson(JSON.stringify(rep('a', 1, 1)) + '\n' + JSON.stringify(rep('b', 1, 1))).length === 2,
      'deux objets collés bout à bout sont lus comme deux réponses');
    /* ⛔ UNE ACCOLADE SEULE DANS UN TITRE. Une paire équilibrée ne prouve rien
       — elle se referme toute seule. Ce qui casse un découpage naïf, c'est
       l'accolade DÉSÉQUILIBRÉE : sans respect des chaînes, l'objet se ferme
       trop tôt, le JSON devient invalide, et la réponse DISPARAÎT du total. */
    var avecAccolade = '{"titre":"perceuse } 20V","page":{"empreinte":"z","tuiles":60,"lues":60}}';
    ok(bb.objetsJson(avecAccolade).length === 1
      && bb.bilan(bb.objetsJson(avecAccolade), 1).tuilesVues === 60,
      '⛔ une accolade DÉSÉQUILIBRÉE dans un titre ne découpe pas l\'objet — sinon la '
      + 'réponse est illisible et ses 60 produits disparaissent du total (obtenu '
      + bb.objetsJson(avecAccolade).length + ' objet(s))');
    /* ⛔⛔ 67 RÉPONSES, 67 FICHIERS. C'est ce que son iPad a produit le 03/08 :
       le bloc « Enregistrer » de Raccourcis, quand il reçoit une LISTE, écrit
       un fichier par élément — il ne concatène pas. Exiger un fichier unique
       reviendrait à lui faire refaire son raccourci pour une contrainte qui
       est la NÔTRE. L'outil accepte donc un DOSSIER.
       ⚠️ Lecteur injecté : le harnais ne touche pas au disque, et il n'écrit
       jamais à la racine du site. */
    var lecteurFactice = {
      estDossier: function (p) { return p === 'dossier'; },
      lister: function () { return ['admin-2.json', '.DS_Store', 'admin-1.json']; },
      joindre: function (a, b) { return a + '/' + b; }
    };
    var listes = bb.fichiersDe(['dossier'], lecteurFactice);
    ok(listes.length === 2 && listes[0] === 'dossier/admin-1.json',
      '⛔⛔ un DOSSIER se déploie en ses fichiers, triés — sinon il lui faudrait '
      + 'passer 67 chemins à la main (obtenu ' + JSON.stringify(listes) + ')');
    ok(listes.indexOf('dossier/.DS_Store') === -1,
      '⛔ …et les entrées système sont écartées : un `.DS_Store` n\'est pas du JSON, '
      + 'il ferait un faux « fichier illisible » à chaque balayage');
    ok(bb.fichiersDe(['a.json', 'b.json'], lecteurFactice).length === 2,
      '⛔ plusieurs fichiers nommés un par un restent acceptés');

    var avecGuillemet = '{"titre":"lame 8\\" dents","page":{"empreinte":"y","tuiles":60,"lues":60}}';
    ok(bb.objetsJson(avecGuillemet).length === 1
      && bb.bilan(bb.objetsJson(avecGuillemet), 1).tuilesVues === 60,
      '⛔ un guillemet ÉCHAPPÉ ne referme pas la chaîne — les titres d\'outils en pouces '
      + 'en portent (obtenu ' + bb.objetsJson(avecGuillemet).length + ' objet(s))');
  }


  /* ══ N / NT / T / -XJ / -QS : UN SEUL PRODUIT ═════════════════════════════
     ⛔⛔ RÈGLE DE L'USER, 04/08/2026 : « si la référence c'est DCD800, le même
     produit peut avoir N / NT / T / NT-XJ mais c'est le MÊME PRODUIT — chaque
     site nomme comme il veut. Le XJ peut changer, c'est la région ; sur
     certains outils on trouve QW ou QS. On ne les regarde JAMAIS. »
     MESURÉ avant correctif : `racineRef` rendait QUATRE clés pour un seul
     produit, le traqueur n'appariait pas, et les prix ne pouvaient pas
     s'aligner en mode réel. */
  {
    var fichesM = [{ sku: 'ZZD800N-XJ', title: 'ZZ perceuse-visseuse 18V sans batterie ni chargeur' }];
    var idxM = {}; fichesM.forEach(function (f) { idxM[f.sku] = f; });
    var poseM = adm._internals.pwIndexerModeles(fichesM, idxM);
    ok(poseM && poseM.poses === 1,
      '⛔ PRÉALABLE : l\'index de modèle pose bien la fiche nue ('
      + JSON.stringify(poseM) + ')');

    ['ZZD800NT-QS', 'ZZD800T', 'ZZD800', 'ZZD800N-QW'].forEach(function (ecriture) {
      var cle = adm._internals.pwCleModele({ sku: ecriture,
        name: 'ZZ perceuse-visseuse 18V sans batterie ni chargeur' });
      ok(idxM[cle] === fichesM[0],
        '⛔⛔ ARGENT : « ' + ecriture +' » doit retrouver la fiche nue du catalogue — '
        + 'N / NT / T et le marquage de région désignent le MÊME produit (clé '
        + cle + ')');
    });

    /* ⛔ …mais un KIT n'est pas la machine nue : sa boîte contient autre chose,
       et lui coller le coût du nu écrirait un prix faux sur une vraie vente. */
    var cleKit = adm._internals.pwCleModele({ sku: 'ZZD800D2',
      name: 'ZZ perceuse-visseuse 18V + 2x batterie 2,0 Ah + chargeur' });
    ok(idxM[cleKit] === undefined,
      '⛔⛔ ARGENT : un KIT (2 batteries + chargeur) ne tombe PAS sur la fiche '
      + 'nue — la variante lue dans le titre les sépare (clé ' + cleKit + ')');

    /* Une racine que plusieurs fiches se disputent n'est jamais arbitrée. */
    var ambigu = [{ sku: 'ZZD900N-XJ', title: 'ZZ scie nue' },
      { sku: 'ZZD900T-QW', title: 'ZZ scie nue' }];
    var idxA = {}; ambigu.forEach(function (f) { idxA[f.sku] = f; });
    var poseA = adm._internals.pwIndexerModeles(ambigu, idxA);
    ok(poseA.poses === 0 && poseA.ecartes === 1,
      '⛔ deux fiches pour la même clé de modèle : on n\'ARBITRE PAS, on écarte — '
      + 'écrire un coût sur l\'une des deux au hasard serait pire que ne rien '
      + 'écrire (' + JSON.stringify(poseA) + ')');

    /* ⛔⛔ UN RELEVÉ QUI NE GARDE PAS LE TITRE DE L'ANNONCE N'EST PAS
       REJOUABLE. Défaut mesuré le 08/08/2026 : `reconnus` archivait `fiche` —
       le titre de NOTRE carte — sans jamais garder `name`, celui du MARCHAND.
       Or c'est de ce texte-là que la référence est tirée. Conséquence réelle :
       une annonce à 229,00 € en 1-2 jours, la meilleure du lot, dormait dans
       le relevé sous un SKU soudé de travers, et rien ne permettait de le
       voir — 1533 tuiles sur 2319 sans titre. On a cherché pendant des jours
       une annonce absente qui ne l'était pas.
       ⚠️ Le contrôle lit la SOURCE parce que ce chemin n'est atteignable
       qu'avec Firestore : ce qu'on vérifie, c'est que le champ est bien poussé.
       `inconnus` le gardait déjà — les deux doivent le garder. */
    var srcAdmin = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
    var blocRec = srcAdmin.slice(srcAdmin.indexOf('reconnusSec.push({'));
    blocRec = blocRec.slice(0, blocRec.indexOf('});') + 3);
    ok(/\bname:\s*it\.name\b/.test(blocRec),
      '⛔⛔ `reconnus` doit archiver `name: it.name` — le titre de l\'ANNONCE, '
      + 'pas seulement celui de notre fiche. Sans lui, aucun relevé ne peut '
      + 'être rejoué et une référence lue de travers reste invisible');
    var blocInc = srcAdmin.slice(srcAdmin.indexOf('inconnusSec.push({'));
    blocInc = blocInc.slice(0, blocInc.indexOf('});') + 3);
    ok(/\bname:\s*it\.name\b/.test(blocInc),
      '⛔ …et `inconnus` aussi, qui le gardait déjà');
  }

  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-price-watch OK');
  }, function (err) { console.error('  ❌ [check-price-watch] harnais mort : ' + err.message); process.exit(1); });
}
