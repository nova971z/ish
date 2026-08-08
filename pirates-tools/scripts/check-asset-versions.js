// scripts/check-asset-versions.js — Alignement du cache-busting, gardé par CI.
// Règle projet (CLAUDE.md) : VERSION (sw.js) + ASSET_VER + ?v= (index.html)
// doivent être ALIGNÉS à chaque changement d'asset. La dérive v387/v412 (icônes
// HTML restées sur un vieux ?v= pendant que le SW précachait un autre) faisait
// télécharger ~300 Ko en double à chaque install. Invariants vérifiés :
//  1) VERSION 'pt-vN' ⇔ ASSET_VER 'N' (sw.js interne) ;
//  2) index.html : styles.css?v= et app.js?v= == ASSET_VER ;
//  3) index.html : TOUTES les réfs icons/*.png?v= et manifest.webmanifest?v=
//     == ICON_VER (fingerprint stable des icônes, sw.js) ;
//  4) APP_SHELL : styles/app sur ASSET_VER, icônes/manifest sur ICON_VER,
//     pas d'entrée './' (clé morte = téléchargement double du shell).
'use strict';
var fs = require('fs');
var path = require('path');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-asset-versions] ' + m); }

  var sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  var mVer = sw.match(/VERSION\s*=\s*'pt-v(\d+)'/);
  var mAsset = sw.match(/ASSET_VER\s*=\s*'(\d+)'/);
  var mIcon = sw.match(/ICON_VER\s*=\s*'(\d+)'/);
  ok(mVer && mAsset && mIcon, 'VERSION / ASSET_VER / ICON_VER présents dans sw.js');
  if (!mVer || !mAsset || !mIcon) return errors;
  var VER = mVer[1], ASSET = mAsset[1], ICON = mIcon[1];

  // 1) VERSION ⇔ ASSET_VER
  ok(VER === ASSET, 'sw.js : VERSION pt-v' + VER + ' == ASSET_VER ' + ASSET);

  // 2) styles.css / app.visitor.js dans le HTML
  // Le bundle SERVI est app.visitor.js (SEO ordre 9 / D-120 : admin sorti du
  // bundle visiteur). app.js reste la source DEV complète, jamais servie.
  var mCss = html.match(/styles\.css\?v=(\d+)/);
  var mJs = html.match(/app\.visitor\.js\?v=(\d+)/);
  ok(mCss && mCss[1] === ASSET, 'index.html styles.css?v=' + (mCss && mCss[1]) + ' == ASSET_VER ' + ASSET);
  ok(mJs && mJs[1] === ASSET, 'index.html app.visitor.js?v=' + (mJs && mJs[1]) + ' == ASSET_VER ' + ASSET);

  // 3) Icônes + manifest dans le HTML → ICON_VER, sans exception
  // ≥ 4 : manifest + apple-touch + favicon + repli PNG du héros. (Le srcset du
  // héros est passé en WebP non versionné — 3 réfs PNG en moins, voulu.)
  var iconRefs = html.match(/(?:icons\/icon-\d+\.png|manifest\.webmanifest)\?v=(\d+)/g) || [];
  ok(iconRefs.length >= 4, 'au moins 4 réfs icônes/manifest versionnées trouvées (' + iconRefs.length + ')');
  iconRefs.forEach(function (ref) {
    var v = ref.match(/\?v=(\d+)/)[1];
    ok(v === ICON, 'index.html "' + ref + '" == ICON_VER ' + ICON);
  });

  // 4) APP_SHELL cohérent
  var shell = sw.match(/APP_SHELL\s*=\s*\[([\s\S]*?)\]/);
  ok(!!shell, 'APP_SHELL trouvé dans sw.js');
  if (shell) {
    var body = shell[1];
    ok(/styles\.css\?v=\$\{ASSET_VER\}/.test(body), 'APP_SHELL styles.css sur ASSET_VER');
    ok(/app\.visitor\.js\?v=\$\{ASSET_VER\}/.test(body), 'APP_SHELL app.visitor.js sur ASSET_VER');
    ok(/manifest\.webmanifest\?v=\$\{ICON_VER\}/.test(body), 'APP_SHELL manifest sur ICON_VER');
    ok(!/icon-\d+\.png\?v=\$\{ASSET_VER\}/.test(body), 'APP_SHELL : aucune icône sur ASSET_VER');
    ok(/icon-180\.png\?v=\$\{ICON_VER\}/.test(body), 'APP_SHELL icônes sur ICON_VER');
    ok(!/^\s*'\.\/'\s*,/m.test(body), 'APP_SHELL sans entrée \'./\' (clé morte)');
  }

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-asset-versions OK');
}
