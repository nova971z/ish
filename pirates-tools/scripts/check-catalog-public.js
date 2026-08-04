// scripts/check-catalog-public.js — Garde-fou anti-fuite des coûts fournisseur.
// L'endpoint public /api/products doit servir loadPublicCatalog() : les champs
// écrits par le traqueur de prix (priceSrcTTC = coût d'achat réel, priceMarkup…)
// ne doivent JAMAIS sortir. Ce check échoue si :
//  1) toPublic laisse passer un champ privé (test sur fonctions pures) ;
//  2) api/products.js n'utilise plus loadPublicCatalog ;
//  3) un nouveau champ 'price*' apparaît dans les écritures d'overrides
//     (api/admin.js) sans être couvert par PRIVATE_FIELDS.
'use strict';
var fs = require('fs');
var path = require('path');
var catalog = require('../api/_lib/catalog');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-catalog-public] ' + m); }

  var I = catalog._internals;
  ok(I && typeof I.toPublic === 'function' && Array.isArray(I.PRIVATE_FIELDS),
    '_internals (toPublic/PRIVATE_FIELDS) exposés');
  if (!I || !I.toPublic) return errors;

  // 1) Fonctions pures : un produit fusionné avec un override traqueur complet
  //    doit ressortir SANS aucun champ privé, mais AVEC ses champs publics.
  var base = [{ id: 'x1', slug: 'x1-slug', sku: 'X1', title: 'T', price: 120, price_ht: 100, brand: 'B' }];
  var overrides = {
    x1: {
      price: 115, price_ht: 95.83,
      priceSource: 'cotebrico', priceSrcTTC: 83.29, priceCheckedAt: 1,
      priceMarkup: 0.15, priceMode: 'colissimo', priceRecomputedAt: 2,
      hidden: false
    }
  };
  var merged = I.applyOverrides(base, overrides);
  ok(merged.length === 1 && merged[0].price === 115, 'applyOverrides fusionne le patch');
  var pub = merged.map(I.toPublic)[0];
  I.PRIVATE_FIELDS.forEach(function (k) {
    ok(!(k in pub), 'champ privé "' + k + '" absent de la sortie publique');
  });
  ok(pub.price === 115 && pub.price_ht === 95.83 && pub.title === 'T' && pub.sku === 'X1',
    'champs publics conservés (price/price_ht/title/sku)');

  // 2) L'endpoint public utilise bien une forme PUBLIQUE (pas loadCatalog).
  /* ⛔ DEUX FORMES SONT ADMISES depuis le 04/08/2026 : `loadPublicCatalog()` et
     `loadPublicCatalogEtat()`, cette dernière rendant en plus `prixConfirmes`
     (le drapeau qui empêche de vendre à un prix de repli — voir
     check-prix-confirmes.js).
     ⛔⛔ MAIS LE NOM NE SUFFIT PAS. Autoriser un identifiant parce qu'il
     commence pareil, c'est autoriser n'importe quoi qui commence pareil : une
     `loadPublicCatalogEtatBrut()` qui oublierait `toPublic` passerait, et le
     coût d'achat de chaque outil partirait sur le CDN — irréversiblement. On
     EXÉCUTE donc la forme utilisée et on regarde ce qu'elle rend. */
  var productsSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'products.js'), 'utf8');
  var formesPubliques = (productsSrc.match(/catalog\.(loadPublicCatalog\w*)\s*\(/g) || [])
    .map(function (m) { return m.replace(/^catalog\./, '').replace(/\s*\($/, ''); });
  ok(formesPubliques.length > 0,
    'api/products.js appelle une forme publique du catalogue (loadPublicCatalog / loadPublicCatalogEtat)');
  ok(!/catalog\.loadCatalog\s*\(/.test(productsSrc), 'api/products.js n\'appelle plus loadCatalog() brut');

  /* ⛔⛔ CE QUE L'EXÉCUTION PEUT PROUVER, ET CE QU'ELLE NE PEUT PAS.
     Mesuré en écrivant cette porte : retirer `toPublic` de `loadPublicCatalogEtat`
     laisse le contrôle VERT. Ce n'est pas un défaut de la porte, c'est la
     réalité — les champs privés (`priceSrcTTC`…) sont écrits par le traqueur
     dans `product_overrides`, jamais dans `products.json`. Sans Firestore, il
     n'y a rien à faire fuir, donc rien à attraper.
     ⛔ On ne fait donc pas semblant. L'exécution garde ce qu'elle PEUT garder
     (la forme existe, elle rend une vraie liste, et le fichier lui-même ne
     porte aucun champ privé) ; c'est l'assertion TEXTUELLE juste après qui
     porte le poids de « la forme applique bien toPublic ». Chacune dit ce
     qu'elle couvre — un périmètre d'affirmation trop large, c'est E-704. */
  var aEprouver = formesPubliques.filter(function (f, i) { return formesPubliques.indexOf(f) === i; });
  var verifs = aEprouver.map(function (nom) {
    if (typeof catalog[nom] !== 'function') {
      ok(false, 'api/products.js appelle catalog.' + nom + '() qui N\'EXISTE PAS');
      return Promise.resolve();
    }
    return Promise.resolve(catalog[nom]()).then(function (res) {
      var liste = Array.isArray(res) ? res : (res && res.produits);
      ok(Array.isArray(liste) && liste.length > 0,
        'catalog.' + nom + '() rend bien une liste de produits');
      var fuites = [];
      (liste || []).forEach(function (p) {
        I.PRIVATE_FIELDS.forEach(function (k) { if (k in p && fuites.indexOf(k) === -1) fuites.push(k); });
      });
      ok(fuites.length === 0,
        '⛔⛔ catalog.' + nom + '() — la forme réellement servie par /api/products — '
        + 'laisse sortir ' + fuites.length + ' champ(s) privé(s) : ' + fuites.join(', ')
        + '. C\'est le coût d\'achat de chaque outil sur le CDN, et c\'est irréversible.');
    }, function (err) {
      ok(false, 'catalog.' + nom + '() a jeté : ' + (err && err.message ? err.message : err));
    });
  });

  /* ⛔⛔ L'ASSERTION QUI PORTE LE POIDS. Chaque forme publique de catalog.js
     doit appliquer `toPublic` DANS SON PROPRE CORPS. C'est le seul contrôle
     capable d'attraper une forme qui oublierait le masquage — l'exécution ne
     le peut pas, faute d'override à faire fuir hors de Firestore. */
  var catalogSrc = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'catalog.js'), 'utf8');
  aEprouver.forEach(function (nom) {
    var re = new RegExp('function\\s+' + nom + '\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}', 'm');
    var m = catalogSrc.match(re);
    ok(!!m, 'catalog.js définit ' + nom + '() sous une forme relisible');
    ok(!!m && /toPublic/.test(m[1]),
      '⛔⛔ FUITE : ' + nom + '() est servie par /api/products et n\'applique PAS '
      + '`toPublic` — le coût d\'achat fournisseur de chaque outil partirait sur '
      + 'le CDN, puis dans l\'historique git. Irréversible.');
  });

  // 3) Dérive : toute CLÉ d'objet price* posée dans admin.js (écritures
  //    product_overrides du traqueur/reprice) doit être couverte par
  //    PRIVATE_FIELDS. Allowlist : priceHt = argument interne de marginAt
  //    (jamais écrit en override) ; price/price_ht = prix de VENTE, publics.
  var ALLOW = ['priceHt'];
  var adminSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8');
  var written = {};
  (adminSrc.match(/\bprice[A-Z][A-Za-z]*(?=\s*:)/g) || []).forEach(function (f) { written[f] = true; });
  Object.keys(written).forEach(function (f) {
    if (ALLOW.indexOf(f) !== -1) return;
    ok(I.PRIVATE_FIELDS.indexOf(f) !== -1,
      'clé traqueur "' + f + '" posée par admin.js doit être listée dans PRIVATE_FIELDS (catalog.js)');
  });

  /* ⛔ Le contrôle rend une PROMESSE : les vérifications d'exécution du point 2
     sont asynchrones, et rendre `errors` avant leur résolution laisserait une
     fuite de coût d'achat passer pour un contrôle vert. `runOne` de ci.js fait
     déjà `await` sur le retour. */
  return Promise.all(verifs).then(function () { return errors; });
};

if (require.main === module) {
  /* ⛔ Le contrôle est devenu asynchrone : `if (e.length)` sur une PROMESSE est
     toujours faux (`undefined`), et le lancement direct annoncerait « OK » quoi
     qu'il arrive — une porte verte par construction. */
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-catalog-public OK');
  }, function (err) {
    console.error('  ❌ [check-catalog-public] harnais mort : ' + err.message);
    process.exit(1);
  });
}
