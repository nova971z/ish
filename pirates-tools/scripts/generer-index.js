// scripts/generer-index.js — HTML SERVI SANS COMMENTAIRES (lot poids, levier 3).
//
// index.src.html = SOURCE de développement (commentée + gabarit SSR lu par
// api/render.js). Ce script en génère index.html = le HTML SERVI (accueil `/`,
// coquille du Service Worker), débarrassé de ses commentaires HTML.
//
// ⛔ LES SCRIPTS INLINE SONT INTOUCHÉS. On ne retire QUE les commentaires
// `<!-- -->` situés HORS des balises <script>/<style>. Les 3 scripts inline
// gardent donc leur contenu octet pour octet — leurs empreintes sha256 (CSP,
// vercel.json) restent identiques. --verifie le PROUVE.
//
//   node scripts/generer-index.js            écrit index.html
//   node scripts/generer-index.js --verifie  porte CI (à jour + hashes CSP stables + zéro commentaire)
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var RACINE = path.join(__dirname, '..');
var SRC = path.join(RACINE, 'index.src.html');
var OUT = path.join(RACINE, 'index.html');
var VERCEL = path.join(RACINE, 'vercel.json');

// Repère les intervalles couverts par <script>…</script> et <style>…</style>
// pour ne JAMAIS toucher à leur contenu (empreintes CSP, CSS inline).
function zonesProtegees(html) {
  var zones = [];
  var re = /<(script|style)\b[\s\S]*?<\/\1>/gi, m;
  while ((m = re.exec(html))) zones.push([m.index, m.index + m[0].length]);
  return zones;
}
function dansZone(i, zones) {
  for (var k = 0; k < zones.length; k++) if (i >= zones[k][0] && i < zones[k][1]) return true;
  return false;
}

// Retire les commentaires HTML hors zones protégées.
function generer() {
  var src = fs.readFileSync(SRC, 'utf8');
  var zones = zonesProtegees(src);
  var out = '', last = 0, re = /<!--[\s\S]*?-->/g, m;
  while ((m = re.exec(src))) {
    if (dansZone(m.index, zones)) continue;
    out += src.slice(last, m.index);
    last = m.index + m[0].length;
  }
  out += src.slice(last);
  // Comprime les lignes vides laissées par les commentaires retirés (cosmétique,
  // sans toucher aux zones protégées : on ne fusionne que des sauts de ligne).
  out = out.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n');
  return out;
}

function scriptsInline(html) {
  return (html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [])
    .map(function (s) { return s.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''); });
}
function sha256(s) { return 'sha256-' + crypto.createHash('sha256').update(s).digest('base64'); }

function commentairesHtmlHorsZone(html) {
  var zones = zonesProtegees(html), re = /<!--[\s\S]*?-->/g, m, n = 0;
  while ((m = re.exec(html))) if (!dansZone(m.index, zones)) n++;
  return n;
}

module.exports = { generer: generer, scriptsInline: scriptsInline, sha256: sha256 };

if (require.main === module) {
  var attendu = generer();
  if (process.argv[2] === '--verifie') {
    var errs = [];
    var surDisque;
    try { surDisque = fs.readFileSync(OUT, 'utf8'); }
    catch (e) { console.error('  ❌ [generer-index] index.html manquant — relancer sans --verifie'); process.exit(1); }
    if (surDisque !== attendu) errs.push('index.html pas à jour vs index.src.html — relancer sans --verifie');
    // ⛔ CRITÈRE CSP : les scripts inline sont identiques source ↔ servi, et
    // leur sha256 est bien autorisé dans vercel.json.
    var sSrc = scriptsInline(fs.readFileSync(SRC, 'utf8'));
    var sOut = scriptsInline(surDisque);
    if (JSON.stringify(sSrc) !== JSON.stringify(sOut)) {
      errs.push('les scripts inline DIFFÈRENT entre index.src.html et index.html — empreintes CSP cassées');
    } else {
      var csp = fs.readFileSync(VERCEL, 'utf8');
      sOut.forEach(function (code, i) {
        var h = sha256(code);
        if (csp.indexOf(h) === -1) errs.push('script inline #' + i + ' : empreinte ' + h + ' absente de vercel.json (CSP bloquerait)');
      });
    }
    var nc = commentairesHtmlHorsZone(surDisque);
    if (nc !== 0) errs.push(nc + ' commentaire(s) HTML SUBSISTENT dans index.html');
    if (errs.length) { errs.forEach(function (e) { console.error('  ❌ [generer-index] ' + e); }); process.exit(1); }
    console.log('✅ generer-index : index.html à jour, ' + sOut.length + ' scripts inline intacts (hashes CSP stables), 0 commentaire HTML');
    process.exit(0);
  }
  fs.writeFileSync(OUT, attendu);
  var s = fs.statSync(SRC).size, o = fs.statSync(OUT).size;
  console.log('index.html écrit : ' + (s / 1024).toFixed(0) + ' Ko → ' + (o / 1024).toFixed(0) + ' Ko, '
    + scriptsInline(attendu).length + ' scripts inline préservés.');
}
