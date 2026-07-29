/* regles-enfouies.js — REPÉRER LES RÈGLES NOYÉES DANS LE RÉCIT.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE
   CLAUDE.md a été écrit comme un JOURNAL : chaque session y a ajouté son récit.
   Or dans ces récits sont enfouies des CONSIGNES OPPOSABLES — « ne JAMAIS
   faire X », « TOUJOURS vérifier Y » — mélangées à de la narration pure.
   Personne ne peut appliquer une règle qui vit au paragraphe 700 d'un
   historique de 1500 lignes. Elles existent, mais elles ne gouvernent rien.

   Ce script les DÉBUSQUE mécaniquement. Il ne décide de rien : il produit une
   liste que l'on doit trancher ligne par ligne. Son rôle est de rendre l'oubli
   VISIBLE, pas de trier à ma place.

   ⚠️ CE QU'IL RATE, ET C'EST ASSUMÉ : les règles formulées sans mot-clé
   (« il faut… », « on ne peut pas… », « le bon réflexe est… »). La détection
   par marqueurs est un FILET, pas une garantie — d'où l'obligation, à l'étape
   3.3 du runbook, de relire les sections à la main et de DÉCLARER le nombre de
   lignes réellement relues.

   Usage :  node scripts/regles-enfouies.js [fichier]     (défaut : ../CLAUDE.md)
            node scripts/regles-enfouies.js --json        (sortie exploitable)
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

/* Marqueurs d'impératif. Volontairement LARGES : un faux positif se écarte en
   une seconde à la lecture, une règle ratée peut coûter une panne. */
var MARQUEURS = [
  { re: /\bRÈGLE\b/,                    nom: 'RÈGLE' },
  { re: /⛔/,                            nom: '⛔' },
  { re: /\bJAMAIS\b/,                   nom: 'JAMAIS' },
  { re: /\bTOUJOURS\b/,                 nom: 'TOUJOURS' },
  { re: /\bOBLIGATOIRES?\b/i,           nom: 'OBLIGATOIRE' },
  { re: /\bPIÈGES?\b/,                  nom: 'PIÈGE' },
  { re: /\bLEÇONS?\b/,                  nom: 'LEÇON' },
  { re: /\binterdi(t|te|ts|tes|re)\b/i, nom: 'interdit' },
  { re: /non négociable/i,              nom: 'non négociable' },
  { re: /\bGRAVÉE?S?\b/,                nom: 'GRAVÉ' }
];

function analyser(fichier) {
  var src = fs.readFileSync(fichier, 'utf8');
  var lignes = src.split('\n');
  var section = '(avant la première section)';
  var trouvees = [];

  lignes.forEach(function (l, i) {
    if (/^## /.test(l)) { section = l.replace(/^##\s*/, '').trim(); return; }

    // Un titre de section porte souvent un marqueur ; ce n'est pas une règle,
    // c'est une étiquette. On ne compte que le CORPS du texte.
    if (/^#{1,6} /.test(l)) return;

    var noms = MARQUEURS.filter(function (m) { return m.re.test(l); })
                        .map(function (m) { return m.nom; });
    if (!noms.length) return;

    trouvees.push({
      ligne: i + 1,
      section: section,
      marqueurs: noms,
      texte: l.trim()
    });
  });

  return trouvees;
}

module.exports = { analyser: analyser, MARQUEURS: MARQUEURS };

if (require.main === module) {
  var args = process.argv.slice(2);
  var json = args.indexOf('--json') !== -1;
  var cible = args.filter(function (a) { return a.charAt(0) !== '-'; })[0]
    || path.join(__dirname, '..', '..', 'CLAUDE.md');

  var r = analyser(cible);

  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

  var parSection = {};
  r.forEach(function (x) { (parSection[x.section] = parSection[x.section] || []).push(x); });

  console.log('Fichier analysé : ' + path.relative(process.cwd(), cible));
  console.log('Lignes porteuses d\'un marqueur d\'impératif : ' + r.length);
  console.log('Réparties sur ' + Object.keys(parSection).length + ' section(s).\n');

  Object.keys(parSection).forEach(function (s) {
    console.log('── ' + s + '  (' + parSection[s].length + ')');
    parSection[s].forEach(function (x) {
      console.log('   L' + String(x.ligne).padStart(4) + ' [' + x.marqueurs.join(',') + '] '
        + x.texte.slice(0, 96));
    });
    console.log('');
  });
}
