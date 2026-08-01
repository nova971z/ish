'use strict';
// Parseur des pages « marque » de cotébrico → [{ sku, price, name, promo }].
//
// price = le prix TTC **RÉELLEMENT AFFICHÉ, PROMO COMPRISE**.
// ⚠️ CE COMMENTAIRE DISAIT L'INVERSE JUSQU'AU 31/07/2026 (« HORS PROMO, on
// prend le Prix de base »). C'était faux, et prouvé faux en exécutant le
// parseur sur un bloc promo : il renvoie 149,90 là où « Prix de base
// 199,00 € » figure dans le même bloc. Un commentaire qui ment sur du calcul
// de prix est pire que pas de commentaire — on le croit sans le vérifier.
//
// Le comportement, lui, est VOULU (décision produit du traqueur) : si
// cotébrico solde, l'user achète soldé, donc il vend soldé. Le relevé tourne
// 2×/jour et se réajuste dès la fin de la promo.
//
// `promo` est un simple booléen « ce bloc contenait un Prix de base ».
// ⛔ L'ANCIEN PRIX N'EST PAS CAPTURÉ — seulement le fait qu'il existait. Il ne
// doit JAMAIS servir de prix de référence barré sur le site : un tarif
// fournisseur n'est pas notre prix de référence (registre J4, décision D-004).
//
// Robuste : accepte du texte propre OU du HTML brut (on nettoie les balises avant).
// Générique : la marque est paramétrable (DEWALT, MAKITA, BOSCH…) car sur cotébrico
// la réf est toujours préfixée par le nom de marque (« … - DEWALT DCF887P2 »).

// Décode les quelques entités HTML utiles + retire les balises → texte plat.
function stripHtml(input) {
  var s = String(input || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
       .replace(/<style[\s\S]*?<\/style>/gi, ' ')
       .replace(/<[^>]+>/g, ' ');                 // toutes les balises
  s = s.replace(/&nbsp;|&#160;|&#0*160;|&#8239;|&#0*8239;|&#8201;/gi, ' ')
       .replace(/&euro;|&#8364;|&#0*8364;/gi, '€')
       .replace(/&amp;/gi, '&')
       .replace(/&quot;/gi, '"')
       .replace(/&#0*39;|&apos;/gi, "'")
       .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
       .replace(/&eacute;/gi, 'é').replace(/&egrave;/gi, 'è').replace(/&agrave;/gi, 'à');
  return s;
}

// « 1 190,00 » / « 240,89 » (espaces fines/insécables inclus) → nombre.
function parsePriceFR(str) {
  if (str == null) return null;
  var n = parseFloat(String(str).replace(/[\s   ]/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function parseCotebrico(rawText, brand) {
  var out = [];
  if (!rawText) return out;
  brand = (brand || 'DEWALT');
  var text = stripHtml(rawText).replace(/[ \t   ]+/g, ' ');
  var brandRe = new RegExp(escapeRe(brand) + '\\s+([A-Z0-9][A-Z0-9.\\/\\-]*[A-Z0-9])', 'gi');
  // Chaque fiche produit de la grille se termine par « Ajouter au panier ».
  var blocks = text.split(/Ajouter au panier/);
  var seen = {};
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    /* ── ÉTAT DE STOCK DE CETTE CARTE ──────────────────────────────────────
       Demandé par l'user le 01/08/2026 : dix produits EN RUPTURE chez le
       fournisseur allaient faire MONTER les prix du site — un prix affiché
       chez un vendeur où l'on ne peut pas acheter n'est pas un coût
       d'approvisionnement.

       ⚠️ D'OÙ VIENT CE DÉCOUPAGE — mesuré sur SA capture de la grille
       (01/08/2026), la page étant injoignable depuis le dépôt : le badge
       « ✔ En stock » est affiché SOUS le bouton « Ajouter au panier ».
       Comme on découpe les blocs SUR ce bouton, le badge d'une carte tombe
       AU DÉBUT DU BLOC SUIVANT. On lit donc la tête du bloc i+1.

       Trois états, et l'inconnu est assumé :
         true  → « En stock » lu en tête du bloc suivant, sans mot de rupture
         false → un mot de rupture dans la carte ou en tête du bloc suivant
         null  → aucun signal : comportement d'avant, on ne casse rien.
       ⛔ Si cotébrico écrit la rupture autrement, une capture d'une carte en
       rupture suffit à ajuster RUPTURE_RE — le motif est CE constant-ci. */
    /* ⚠️ ON NE LIT QUE LA TÊTE DU BLOC SUIVANT — premier jet corrigé sur
       preuve : tester aussi la fin du bloc COURANT faisait hériter la rupture
       de la carte précédente (son badge vit en tête de NOTRE bloc). Une carte
       n'a JAMAIS son propre badge dans son bloc : il est après le bouton. */
    var teteSuivante = (blocks[i + 1] || '').slice(0, 160);
    var enStock = null;
    if (RUPTURE_RE.test(teteSuivante)) enStock = false;
    else if (/en\s+stock/i.test(teteSuivante)) enStock = true;
    var skus = [], m;
    brandRe.lastIndex = 0;
    while ((m = brandRe.exec(b)) !== null) skus.push(m[1].toUpperCase());
    if (!skus.length) continue;
    var sku = skus[skus.length - 1];              // le TITRE (dernière réf) = vraie réf produit
    // Prix = le PRIX REELLEMENT AFFICHE (promo COMPRISE) = « Prix X € ».
    // Decision produit (traqueur) : on PREND la promo pour etre competitif. Sur car
    // le traqueur tourne 2x/jour et se reajuste des que la promo se termine → marge
    // 15% calee sur le cout REEL du jour (si cotebrico solde, l'user achete soldé aussi).
    // Le « Prix de base » barre est volontairement ignore. Le prix courant apparait
    // AVANT « Prix de base » sur la grille → le 1er match = le prix courant.
    var pm = b.match(/Prix\s+([\d\s\u00a0\u202f\u2009]+,\d{2})\s*€/);
    if (!pm) continue;
    var price = parsePriceFR(pm[1]);
    if (price == null || price <= 0) continue;
    var promo = /Prix de base/.test(b); // info seulement (rapport)
    if (seen[sku]) continue;                        // dédoublonnage
    seen[sku] = true;
    // Nom (best-effort) : le segment « … - BRAND SKU » le plus proche du prix.
    var name = '';
    var nm = b.match(new RegExp('([^\\n.]{4,120}?)\\s*-\\s*' + escapeRe(brand) + '\\s+' + escapeRe(sku), 'i'));
    if (nm) name = nm[1].trim();
    out.push({ sku: sku, price: price, name: name, promo: promo, enStock: enStock });
  }
  return out;
}

// Règle user 25/07 : quand le fournisseur vend une DÉCLINAISON moins cher que
// la réf principale (ex. DBS180ZJ avec coffret < DBS180Z nu), ON ACHÈTE la
// moins chère → le prix de référence est le MIN des sources. Le produit porte
// `srcAltSkus: [...]` ; le traqueur prend min(prix propre, prix des alt
// PRÉSENTES sur la page). Une alt absente de la page est ignorée. PURE (testée
// par check-price-watch).
function pickCheapestSource(ownPrice, altSkus, parsedBySku) {
  var best = ownPrice;
  if (Array.isArray(altSkus)) {
    for (var i = 0; i < altSkus.length; i++) {
      var alt = parsedBySku && parsedBySku[String(altSkus[i]).toUpperCase()];
      if (typeof alt === 'number' && alt > 0 && alt < best) best = alt;
    }
  }
  return best;
}

/* Mots qui signalent une RUPTURE sur la grille fournisseur. Centralisé ici :
   c'est LE motif à ajuster si une capture montre un autre libellé. */
var RUPTURE_RE = /rupture|indisponible|\u00e9puis\u00e9|hors\s+stock|non\s+disponible/i;

/* \u2500\u2500 QUAND RIEN N'EST RECONNU, LA PAGE DOIT PARLER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   N\u00e9 le 01/08/2026 : le premier essai du traqueur clickoutil a rendu
   `parsed: 0` avec pour seule explication \u00ab mauvaise page ou format
   chang\u00e9 ? \u00bb. Or \u00e0 cet instant le serveur TENAIT le HTML complet de la page \u2014
   et il l'a jet\u00e9 sans rien mesurer. Les sites fournisseurs sont injoignables
   depuis le d\u00e9p\u00f4t (CONNECT 403, mesur\u00e9 le jour m\u00eame) : ce texte-l\u00e0 est la
   SEULE occasion d'apprendre comment un nouveau site \u00e9crit ses cartes.
   Deviner le format \u00e0 la place, c'est l'origine O6 du registre (inventer ce
   qu'on ne peut pas lire).

   Cette fonction mesure donc, sur le texte re\u00e7u, chaque hypoth\u00e8se du
   parseur \u2014 s\u00e9parateur de cartes, motif \u00ab MARQUE R\u00c9F \u00bb, motif \u00ab Prix
   X,XX \u20ac \u00bb \u2014 et rapporte des COMPTES plus trois extraits bruts autour de la
   marque. Un `dryRun=1` suffit alors \u00e0 diagnostiquer un format inconnu, sans
   rien demander d'autre \u00e0 l'user que le geste qu'il fait d\u00e9j\u00e0.

   PURE (texte \u2192 objet), test\u00e9e par check-price-watch, sabotage compris.
   \u26d4 Elle ne renvoie que des morceaux de la page fournisseur re\u00e7ue \u2014 jamais
   un en-t\u00eate, un secret ou une donn\u00e9e du site. */
function diagnostiquerPage(rawText, brand) {
  brand = brand || 'DEWALT';
  var texte = stripHtml(rawText).replace(/[ \t   ]+/g, ' ');
  function compter(re) { var m = texte.match(re); return m ? m.length : 0; }
  var d = {
    octetsRecus: String(rawText || '').length,
    texteNettoye: texte.length,
    boutonsPanier: compter(/Ajouter au panier/gi),
    occurrencesMarque: compter(new RegExp(escapeRe(brand), 'gi')),
    refsMarque: compter(new RegExp(escapeRe(brand) + '\\s+[A-Z0-9][A-Z0-9.\\/\\-]*[A-Z0-9]', 'gi')),
    prixAvecMot: compter(/Prix\s+[\d\s   ]+,\d{2}\s*\u20ac/g),
    prixVirgule: compter(/\d[\d\s   ]*,\d{2}\s*\u20ac/g),
    prixPoint: compter(/\d+\.\d{2}\s*\u20ac/g),
    extraits: []
  };
  /* Trois fen\u00eatres de texte brut autour de la marque \u2014 d\u00e9but, milieu, fin de
     page \u2014 pour VOIR comment le site \u00e9crit titre, r\u00e9f et prix. */
  var pos = [], re = new RegExp(escapeRe(brand), 'gi'), m;
  while ((m = re.exec(texte)) !== null) pos.push(m.index);
  [0, Math.floor(pos.length / 2), pos.length - 1].forEach(function (i) {
    if (i < 0 || i >= pos.length) return;
    var ext = texte.slice(Math.max(0, pos[i] - 60), pos[i] + 140).trim();
    if (d.extraits.indexOf(ext) === -1) d.extraits.push(ext);
  });
  /* Verdict MESUR\u00c9 \u2014 chaque phrase d\u00e9coule d'un compte ci-dessus, dans
     l'ordre o\u00f9 le parseur \u00e9choue. */
  if (!d.occurrencesMarque) {
    d.verdict = 'la marque \u00ab ' + brand + ' \u00bb n\'appara\u00eet nulle part dans le texte re\u00e7u \u2014 '
      + 'mauvaise page, ou contenu construit par JavaScript (le raccourci ne re\u00e7oit que le HTML brut)';
  } else if (!d.refsMarque) {
    d.verdict = 'la marque appara\u00eet (' + d.occurrencesMarque + '\u00d7) mais JAMAIS suivie d\'une '
      + 'r\u00e9f\u00e9rence \u00ab ' + brand + ' XXX \u00bb \u2014 ce site \u00e9crit ses titres autrement (les extraits le montrent)';
  } else if (!d.prixAvecMot) {
    d.verdict = 'des r\u00e9f\u00e9rences sont l\u00e0 (' + d.refsMarque + '), mais aucun \u00ab Prix X,XX \u20ac \u00bb \u2014 '
      + 'ce site \u00e9crit ses prix sans le mot \u00ab Prix \u00bb (' + d.prixVirgule + ' prix \u00e0 virgule, '
      + d.prixPoint + ' \u00e0 point, dans le texte)';
  } else if (!d.boutonsPanier) {
    d.verdict = 'r\u00e9f\u00e9rences et prix pr\u00e9sents, mais aucun \u00ab Ajouter au panier \u00bb \u2014 '
      + 'le d\u00e9coupage en cartes ne peut pas fonctionner sur ce site';
  } else {
    d.verdict = 'tous les motifs existent s\u00e9par\u00e9ment mais aucune carte ne les r\u00e9unit \u2014 '
      + 'les extraits montrent l\'agencement r\u00e9el';
  }
  return d;
}

/* ── PLUSIEURS TRAQUEURS, UN SEUL COÛT : LE MOINS CHER DES SOURCES VALIDES ──
   Demandé par l'user le 01/08/2026 : un deuxième site va être traqué, puis
   d'autres. Le calculateur doit TOUJOURS s'appuyer sur le moins cher — mais
   seulement parmi les sources où l'on peut RÉELLEMENT acheter :

     · une source EN RUPTURE (enStock === false) ne compte pas — on ne peut
       pas s'approvisionner à ce prix ;
     · une source PÉRIMÉE ne compte pas non plus : les traqueurs passent
       2×/jour ; un relevé plus vieux que SOURCE_FRESH_MS veut dire que le
       produit a quitté la page (souvent : rupture retirée de la grille).

   `sources` : { slug: { ttc, at, enStock } } — la carte `priceSources` d'un
   override. Rend { ttc, source } ou null s'il n'existe AUCUNE source achetable.
   PURE — testée par check-price-watch, sabotage compris. */
var SOURCE_FRESH_MS = 14 * 24 * 3600 * 1000;   // 14 jours ≈ 28 passages manqués

function choisirCoutSource(sources, nowMs, maxAgeMs) {
  if (!sources || typeof sources !== 'object') return null;
  var age = (typeof maxAgeMs === 'number' && maxAgeMs > 0) ? maxAgeMs : SOURCE_FRESH_MS;
  var best = null;
  Object.keys(sources).forEach(function (slug) {
    var e = sources[slug] || {};
    var ttc = Number(e.ttc);
    if (!(ttc > 0)) return;
    if (e.enStock === false) return;                    // en rupture : inachetable
    if (!(Number(e.at) > 0) || (nowMs - Number(e.at)) > age) return;  // périmée
    if (!best || ttc < best.ttc) best = { ttc: ttc, source: slug };
  });
  return best;
}

module.exports = { parseCotebrico: parseCotebrico, parsePriceFR: parsePriceFR, stripHtml: stripHtml, pickCheapestSource: pickCheapestSource, choisirCoutSource: choisirCoutSource, SOURCE_FRESH_MS: SOURCE_FRESH_MS, RUPTURE_RE: RUPTURE_RE, diagnostiquerPage: diagnostiquerPage };
