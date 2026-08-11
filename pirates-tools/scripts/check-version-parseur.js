/* check-version-parseur.js — LE RELEVÉ DIT QUELLE VERSION L'A PRODUIT.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔⛔ POURQUOI CETTE PORTE EXISTE — ELLE A COÛTÉ DEUX TOURS ENTIERS.
   Les 11 et 12/08/2026, sur QUATRE relevés successifs de l'user, j'ai mesuré
   deux faits contradictoires et je n'ai pas pu trancher :
     · le plan servi portait ma correction du 11/08 (67 pages au lieu de 112) ;
     · le parseur servi ne lisait PAS un numéro d'article que le code local lit
       par le chemin de production complet — 160 titres, à l'identique sur deux
       relevés successifs.
   Les deux corrections sont dans la MÊME lignée de commits. Ma session ne voit
   ni le site ni l'API de l'hébergeur (CONNECT 403, mesuré et DÉFINITIF) : la
   question « quelle version a servi cette page ? » était donc INDÉCIDABLE, et
   j'ai passé deux tours à en débattre au lieu de la mesurer.

   ⇒ Depuis, chaque relevé porte `versionParseur`. Cette porte garantit trois
   choses, et chacune a son sabotage :
     ① le champ EXISTE dans les DEUX réponses — mode réel ET mode à sec. Une
       version rendue dans un seul mode laisse l'autre indécidable, et c'est
       justement le mode à sec qui sert à vérifier une correction sans quota.
     ② l'empreinte CHANGE quand le code du parseur change. Une version figée
       ment, et une version qui ment est pire que pas de version.
     ③ elle est STABLE à code constant — sinon deux relevés du même déploiement
       paraîtraient venir de deux versions, et on chercherait un fantôme.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

module.exports = function checkVersionParseur() {
  var errors = [];
  var fPP = path.join(RACINE, 'api/_lib/price-parse.js');
  var fAdmin = path.join(RACINE, 'api/admin.js');
  if (!fs.existsSync(fPP) || !fs.existsSync(fAdmin)) {
    errors.push('[check-version-parseur] ⛔ PRÉALABLE : parseur ou admin absent — '
      + 'une porte qui ne lit rien ne vérifie rien.');
    return errors;
  }

  var pp;
  try { pp = require(fPP); } catch (e) {
    errors.push('[check-version-parseur] ⛔ le parseur refuse de se charger : ' + e.message);
    return errors;
  }

  /* ③ STABLE à code constant, et NON VIDE. */
  var a = pp.EMPREINTE_PARSEUR;
  var b = typeof pp.empreinteParseur === 'function' ? pp.empreinteParseur() : null;
  if (!a || a === 'indisponible' || !/^[0-9a-f]{16}-\d+$/.test(String(a))) {
    errors.push('[check-version-parseur] ⛔ `EMPREINTE_PARSEUR` absente ou illisible ('
      + JSON.stringify(a) + ') : le relevé ne pourra pas dire quelle version l\'a produit.');
  }
  if (a !== b) {
    errors.push('[check-version-parseur] ⛔ l\'empreinte n\'est PAS stable à code constant ('
      + JSON.stringify(a) + ' puis ' + JSON.stringify(b) + ') : deux relevés du MÊME '
      + 'déploiement paraîtraient venir de deux versions, et on chercherait un fantôme.');
  }

  /* ② DISCRIMINANTE : un octet de plus dans une source suivie doit la bouger.
     ⚠️ On ne touche AUCUN fichier : on recalcule sur une copie en mémoire du
     même algorithme. Une porte qui écrit sur le disque pour se tester est une
     porte qui peut laisser le dépôt sale. */
  var textes = ['price-parse.js', 'nomenclature.js'].map(function (f) {
    try { return fs.readFileSync(path.join(RACINE, 'api/_lib', f), 'utf8'); }
    catch (e) { return 'ABSENT:' + f; }
  });
  function somme(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      h1 = ((h1 ^ s.charCodeAt(i)) * 0x01000193) >>> 0;
      h2 = ((h2 + s.charCodeAt(i) * (i % 31 + 1)) * 0x85ebca6b) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8)
      + ('00000000' + h2.toString(16)).slice(-8) + '-' + s.length;
  }
  var joint = textes.join('\n');
  if (somme(joint) !== a) {
    errors.push('[check-version-parseur] ⛔ l\'empreinte rendue ne correspond PAS au texte '
      + 'source des fichiers suivis : elle ne mesure donc pas le code qui s\'exécute.');
  }
  if (somme(joint + ' ') === somme(joint)) {
    errors.push('[check-version-parseur] ⛔⛔ l\'empreinte NE CHANGE PAS quand le source '
      + 'change d\'un seul caractère : elle ment. Une version figée est pire que pas de '
      + 'version — c\'est exactement le doute qui a coûté deux tours entiers.');
  }

  /* ① PRÉSENTE DANS LES DEUX RÉPONSES. Le mode à sec est celui qui sert à
     vérifier une correction sans consommer de quota : l'oublier là serait
     oublier le seul mode qu'on peut relancer librement. */
  var srcAdmin = fs.readFileSync(fAdmin, 'utf8');
  /* On ne compte que le CODE : un commentaire qui cite le champ n'est pas le
     champ. Leçon M-29 — un détecteur qui cherche un mot détecte du vocabulaire. */
  var codeSeul = srcAdmin
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\n)\s*\/\/.*/g, '$1 ');
  var occurrences = (codeSeul.match(/versionParseur\s*:/g) || []).length;
  if (occurrences < 2) {
    errors.push('[check-version-parseur] ⛔⛔ `versionParseur` n\'apparaît que ' + occurrences
      + ' fois dans le CODE de api/admin.js : il en faut une par réponse du traqueur — '
      + 'le mode RÉEL et le mode À SEC. Une version rendue dans un seul mode laisse '
      + 'l\'autre indécidable, et c\'est le mode à sec qu\'on peut relancer sans quota.');
  }

  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-version-parseur : chaque relevé dira quelle version l\'a produit');
}
