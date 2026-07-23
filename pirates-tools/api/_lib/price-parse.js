'use strict';
// Parseur des pages « marque » de cotébrico → [{ sku, price, name }].
// price = prix TTC **HORS PROMO** (si « Prix de base X € » présent, on prend X).
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
    // Prix : « Prix de base X € » (promo) prioritaire → base hors promo ; sinon « Prix X € ».
    var pm = b.match(/Prix de base\s+([\d\s   ]+,\d{2})\s*€/);
    var promo = !!pm;
    if (!pm) pm = b.match(/Prix\s+([\d\s   ]+,\d{2})\s*€/);
    if (!pm) continue;
    var price = parsePriceFR(pm[1]);
    if (price == null || price <= 0) continue;
    // Cohérence promo : le prix de base doit dépasser le prix soldé, sinon on saute.
    if (promo) {
      var sold = b.match(/Prix\s+([\d\s   ]+,\d{2})\s*€/);
      var soldN = sold ? parsePriceFR(sold[1]) : null;
      if (soldN != null && soldN > price) continue; // format douteux → on ignore ce bloc
    }
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

module.exports = { parseCotebrico: parseCotebrico, parsePriceFR: parsePriceFR, stripHtml: stripHtml };
