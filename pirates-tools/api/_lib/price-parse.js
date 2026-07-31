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
    out.push({ sku: sku, price: price, name: name, promo: promo });
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

module.exports = { parseCotebrico: parseCotebrico, parsePriceFR: parsePriceFR, stripHtml: stripHtml, pickCheapestSource: pickCheapestSource };
