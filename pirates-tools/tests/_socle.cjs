/* tests/_socle.cjs — le pendant CommonJS de _socle.mjs.
   ─────────────────────────────────────────────────────────────────────────
   Une partie des harnais sauvés sont écrits en CommonJS (`require`), l'autre
   en modules ES (`import`). Réécrire les uns dans le style des autres serait
   une réécriture massive, donc une occasion massive de casser des tests qui
   marchent. On fournit donc les MÊMES services dans les deux dialectes, et la
   résolution des chemins vit à un seul endroit par dialecte.

   RÈGLE : aucun harnais ne contient de chemin absolu. Ce fichier et son jumeau
   `.mjs` sont les deux seules dispenses, et c'est leur unique raison d'être.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var zlib = require('zlib');

/** La racine du dépôt, calculée — jamais écrite en dur. */
var RACINE = path.join(__dirname, '..');

var CHEMINS_PLAYWRIGHT = [
  'playwright',
  process.env.PW ? path.join(process.env.PW, 'playwright') : null,
  '/opt/node22/lib/node_modules/playwright',
  '/usr/lib/node_modules/playwright'
].filter(Boolean);

/** Charge Playwright où qu'il soit, et explique clairement s'il manque. */
function playwright() {
  for (var i = 0; i < CHEMINS_PLAYWRIGHT.length; i++) {
    try { return require(CHEMINS_PLAYWRIGHT[i]); } catch (e) { /* suivant */ }
  }
  throw new Error(
    'Playwright est introuvable.\n' +
    '  Ces harnais pilotent un vrai navigateur : sans lui, ils ne peuvent pas tourner.\n' +
    '  Installation :  npm install -D playwright && npx playwright install chromium\n' +
    '  Chemins essayés : ' + CHEMINS_PLAYWRIGHT.join(', ')
  );
}

/** Ajoute le binaire pré-installé aux options de lancement, s'il existe. */
function optionsNavigateur(extra) {
  var o = Object.assign({}, extra || {});
  var prepose = '/opt/pw-browsers/chromium';
  if (!o.executablePath && fs.existsSync(prepose)) o.executablePath = prepose;
  return o;
}

var MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
var COMPRESSIBLE = /\.(html|css|js|mjs|json|svg|webmanifest)$/;

/** Sert le dépôt en statique, compressé comme chez Vercel. */
function serveur(opts) {
  var racine = (opts && opts.racine) || RACINE;
  var srv = http.createServer(function (req, res) {
    var p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p.slice(-1) === '/') p += 'index.html';
    var fp = path.normalize(path.join(racine, p));
    if (fp.indexOf(racine) !== 0) { res.writeHead(403); return res.end('hors racine'); }
    fs.readFile(fp, function (err, buf) {
      if (err) { res.writeHead(404); return res.end('introuvable'); }
      var gz = COMPRESSIBLE.test(fp) && /gzip/.test(req.headers['accept-encoding'] || '');
      var corps = gz ? zlib.gzipSync(buf, { level: 9 }) : buf;
      var h = { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' };
      if (gz) h['Content-Encoding'] = 'gzip';
      res.writeHead(200, h);
      res.end(corps);
    });
  });
  return new Promise(function (resolve) {
    srv.listen(0, '127.0.0.1', function () {
      resolve({
        base: 'http://127.0.0.1:' + srv.address().port,
        port: srv.address().port,
        fermer: function () { srv.close(); }
      });
    });
  });
}

/** Dossier de sortie temporaire, jamais versionné ni déployé. */
function sortie(nom) {
  var d = path.join(RACINE, 'tests', '_sortie', nom || 'divers');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

module.exports = { RACINE, playwright, optionsNavigateur, serveur, sortie };
