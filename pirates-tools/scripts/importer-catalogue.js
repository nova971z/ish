/* importer-catalogue.js — REFERME LA BOUCLE ENTRE LE TRAQUEUR ET LE FICHIER.
   ─────────────────────────────────────────────────────────────────────────
   LE PROBLÈME QU'IL RÉSOUT
   Le site a deux sources de prix :
     · `products.json`      — versionné, servi par le CDN, peint l'écran TOUT DE
                              SUITE ;
     · `product_overrides`  — Firestore, écrit par le traqueur, appliqué ensuite
                              via /api/products, borné à 6 secondes.
   Le client affiche donc le statique d'abord. Si l'API traîne ou échoue, le
   visiteur GARDE ce prix-là. Et comme rien ne renvoyait jamais les overrides
   vers le fichier, l'écart ne faisait que croître — d'où des prix différents
   selon le moment, l'appareil et la chance.

   LA BOUCLE, EN TROIS GESTES
     1. l'admin exporte la fusion :  GET /api/admin?type=export-catalogue
     2. `node scripts/importer-catalogue.js <fichier.json>`
     3. on relit le diff, on commite. Le statique redevient vrai.

   ⛔ CE SCRIPT NE FIXE AUCUN PRIX. Il recopie ce que le serveur sert déjà.
   Il ne contourne donc pas la règle « plus aucun prix saisi à la main ».

   GARDE-FOUS — chacun répond à une façon précise de tout casser :
     · un export plus court que le catalogue ⇒ REFUS (suppression silencieuse) ;
     · un champ interne présent ⇒ REFUS (publier le prix d'achat est
       irréversible : CDN puis historique git) ;
     · un écart de prix supérieur au plafond ⇒ REFUS, sauf --force explicite
       (un traqueur qui déraille ne doit pas repeindre le catalogue) ;
     · on RELIT après écriture — un message de succès ne prouve rien.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

var FICHIER = path.join(__dirname, '..', 'products.json');
var INTERNES = ['priceSource', 'priceSrcTTC', 'priceCheckedAt', 'priceMarkup',
  'priceMode', 'priceRecomputedAt', 'priceCostOrigin', 'hidden'];
var ECART_MAX = 0.35;      // 35 % : au-delà, on suspecte le traqueur, pas le prix

function liste(x) { return Array.isArray(x) ? x : (x && (x.products || x.items)) || []; }
function cle(p) { return String(p.id || p.sku || '').toUpperCase(); }

function main() {
  var src = process.argv[2];
  if (!src) {
    console.error('  usage : node scripts/importer-catalogue.js <export.json> [--ecrire] [--force]');
    console.error('  l\'export s\'obtient par GET /api/admin?type=export-catalogue');
    return 2;
  }
  var ecrire = process.argv.indexOf('--ecrire') !== -1;
  var force = process.argv.indexOf('--force') !== -1;

  var neuf;
  try { neuf = liste(JSON.parse(fs.readFileSync(src, 'utf8'))); }
  catch (e) { console.error('  ❌ export illisible : ' + e.message); return 1; }

  var texte = fs.readFileSync(FICHIER, 'utf8');
  var brut = JSON.parse(texte);
  var actuel = liste(brut);

  if (!neuf.length) { console.error('  ❌ export VIDE — refus.'); return 1; }

  /* ── garde 1 : jamais de rétrécissement silencieux ─────────────────────── */
  if (neuf.length < actuel.length) {
    console.error('  ❌ l\'export contient ' + neuf.length + ' fiches, le catalogue en a '
      + actuel.length + '. Importer supprimerait ' + (actuel.length - neuf.length)
      + ' produit(s) SANS le dire. Refus.');
    return 1;
  }

  /* ── garde 2 : aucun champ interne ne doit sortir ──────────────────────── */
  var fuites = [];
  neuf.forEach(function (p) {
    INTERNES.forEach(function (k) { if (k in p && fuites.indexOf(k) === -1) fuites.push(k); });
  });
  if (fuites.length) {
    console.error('  ❌ l\'export contient des champs INTERNES : ' + fuites.join(', ')
      + '\n     Les écrire dans products.json publierait le prix d\'achat et la marge.'
      + '\n     Irréversible : le fichier part sur le CDN puis dans l\'historique git.');
    return 1;
  }

  /* ── comparaison, fiche par fiche ──────────────────────────────────────── */
  var parCle = {};
  actuel.forEach(function (p) { parCle[cle(p)] = p; });

  var modifs = [], nouveaux = [], suspects = [];
  neuf.forEach(function (n) {
    var a = parCle[cle(n)];
    if (!a) { nouveaux.push(n); return; }
    if (typeof n.price === 'number' && typeof a.price === 'number'
        && Math.abs(n.price - a.price) > 0.005) {
      var rel = a.price > 0 ? Math.abs(n.price - a.price) / a.price : 1;
      modifs.push({ ref: cle(n), avant: a.price, apres: n.price, rel: rel });
      if (rel > ECART_MAX) suspects.push(cle(n) + ' : ' + a.price.toFixed(2) + ' → '
        + n.price.toFixed(2) + ' € (' + (rel * 100).toFixed(0) + ' %)');
    }
  });

  console.log('  export      : ' + neuf.length + ' fiches');
  console.log('  catalogue   : ' + actuel.length + ' fiches');
  console.log('  prix changés: ' + modifs.length + '   nouveaux produits : ' + nouveaux.length);
  modifs.slice(0, 20).forEach(function (m) {
    console.log('    ' + m.ref.padEnd(16) + m.avant.toFixed(2) + ' → ' + m.apres.toFixed(2)
      + ' €   (' + (m.rel * 100).toFixed(1) + ' %)');
  });
  if (modifs.length > 20) console.log('    … et ' + (modifs.length - 20) + ' autres');

  /* ── garde 3 : un écart énorme sent le traqueur qui déraille ───────────── */
  if (suspects.length && !force) {
    console.error('\n  ❌ ' + suspects.length + ' prix varient de plus de '
      + (ECART_MAX * 100) + ' % :');
    suspects.slice(0, 10).forEach(function (s) { console.error('     ' + s); });
    console.error('     Un traqueur qui a mal lu une page produirait exactement ça.');
    console.error('     Vérifier À LA SOURCE, puis relancer avec --force si c\'est juste.');
    return 1;
  }

  if (!ecrire) { console.log('\n  (aperçu — relancer avec --ecrire pour appliquer)'); return 0; }

  var sortie = Array.isArray(brut) ? neuf : Object.assign({}, brut, { products: neuf });
  fs.writeFileSync(FICHIER, JSON.stringify(sortie, null, 2) + '\n');

  /* ── on RELIT : un retour d'écriture ne prouve rien (E-206) ────────────── */
  var relu = liste(JSON.parse(fs.readFileSync(FICHIER, 'utf8')));
  var restants = 0;
  var parCleNeuf = {};
  neuf.forEach(function (p) { parCleNeuf[cle(p)] = p; });
  relu.forEach(function (p) {
    var n = parCleNeuf[cle(p)];
    if (n && typeof n.price === 'number' && Math.abs(n.price - p.price) > 0.005) restants++;
  });
  console.log('\n  écrit puis RELU : ' + relu.length + ' fiches, ' + restants
    + ' écart(s) restant(s)' + (restants ? '  ❌' : '  ✅'));
  console.log('  ⚠️ Lancer maintenant : node scripts/ci.js  (le prix affiché doit rester '
    + 'égal au débité), puis relire `git diff` avant de commiter.');
  return restants ? 1 : 0;
}

process.exit(main());
