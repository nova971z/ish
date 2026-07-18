/* check-firestore-queries.js — Garde-fou anti « descending key scan ».
   Firestore REFUSE orderBy(FieldPath.documentId(), 'desc')
   (« does not support descending key scans ») → la requête plante en prod.
   Ce check scanne api/ et échoue si le motif réapparaît.
   Retourne un tableau d'erreurs (vide = OK), comme les autres checks. */
'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function checkFirestoreQueries() {
  var errors = [];
  var apiDir = path.resolve(__dirname, '../api');

  function walk(dir) {
    var out = [];
    fs.readdirSync(dir).forEach(function (name) {
      var p = path.join(dir, name);
      var st = fs.statSync(p);
      if (st.isDirectory()) out = out.concat(walk(p));
      else if (/\.js$/.test(name)) out.push(p);
    });
    return out;
  }

  walk(apiDir).forEach(function (file) {
    var src = fs.readFileSync(file, 'utf8');
    // Motif : orderBy( ... documentId() ... , 'desc' )  (tolère espaces/retours)
    var re = /orderBy\([^)]*documentId\(\)[^)]*,\s*['"]desc['"]/;
    if (re.test(src)) {
      errors.push('[firestore] ' + path.relative(apiDir, file)
        + ' : orderBy(documentId(), "desc") INTERDIT (Firestore ne supporte pas '
        + 'le tri décroissant par clé → la requête plante). Lire sans tri et trier en JS.');
    }
  });
  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('❌ ' + e); }); process.exit(1); }
  console.log('✅ check-firestore-queries : aucun tri décroissant par clé');
}
