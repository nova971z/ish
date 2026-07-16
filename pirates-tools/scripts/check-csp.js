/* =========================================================
   check-csp.js — Garde l'intégrité de la CSP (H1).

   La Content-Security-Policy (vercel.json) autorise les 3 scripts inline de
   index.html par leur EMPREINTE sha256 (script-src 'sha256-…'), pas par
   'unsafe-inline'. Si un script inline est modifié sans mettre à jour son
   hash dans la CSP, le navigateur le BLOQUE → l'app casse en prod. Ce contrôle
   recalcule les hashes depuis index.html et vérifie que chacun est présent
   dans la CSP. Toute dérive fait échouer la CI.
   ========================================================= */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

module.exports = function checkCsp() {
  var errors = [];
  var root = path.resolve(__dirname, '..');
  var html, vercel;
  try { html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); }
  catch (e) { return ['[check-csp] index.html illisible : ' + e.message]; }
  try { vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'); }
  catch (e) { return ['[check-csp] vercel.json illisible : ' + e.message]; }

  var config;
  try { config = JSON.parse(vercel); }
  catch (e) { return ['[check-csp] vercel.json JSON invalide : ' + e.message]; }

  // Récupère la valeur de l'en-tête Content-Security-Policy.
  var csp = '';
  (config.headers || []).forEach(function (h) {
    (h.headers || []).forEach(function (x) {
      if (x.key === 'Content-Security-Policy') csp = x.value;
    });
  });
  if (!csp) return ['[check-csp] En-tête Content-Security-Policy absent de vercel.json'];

  // Hashes des scripts inline (sans attribut src).
  var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  var m, n = 0;
  while ((m = re.exec(html))) {
    n++;
    var hash = 'sha256-' + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
    if (csp.indexOf("'" + hash + "'") === -1) {
      errors.push('[check-csp] Script inline #' + n + ' : hash ' + hash
        + " ABSENT de la CSP (script-src). Ajoute-le dans vercel.json ou la page cassera en prod.");
    }
  }
  if (n === 0) errors.push('[check-csp] Aucun script inline trouvé dans index.html (extraction cassée ?)');

  // Garde-fous : pas de 'unsafe-inline' NI 'unsafe-eval' dans script-src.
  var scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
  if (/'unsafe-inline'/.test(scriptSrc)) errors.push("[check-csp] script-src contient 'unsafe-inline' — la protection XSS de la CSP est neutralisée.");
  if (/'unsafe-eval'/.test(scriptSrc)) errors.push("[check-csp] script-src contient 'unsafe-eval'.");

  return errors;
};
