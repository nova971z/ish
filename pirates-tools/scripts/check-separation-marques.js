/* check-separation-marques.js — CHAQUE MARQUE A SA TABLE, ET RIEN NE DÉBORDE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ ORDRE DE L'USER, 10/08/2026, mot pour mot :
   « Le parseur doit parfaitement reconnaître sur quelle marque il est en train
   de travailler. Une fois qu'il a détecté la marque, il utilise la BONNE table
   et les BONNES consignes. […] Il ne faut pas que tout soit regroupé, ce n'est
   pas parce qu'il y a des choses qui marchent pareil que c'est pour la
   totalité. Chaque marque a son mode de référencement, on doit les séparer
   correctement. »

   ⛔ CE QUE CETTE PORTE A DÉJÀ ATTRAPÉ, ET CE QUE ÇA COÛTAIT :
     · `refSansPrefixeDistributeur` s'appliquait à TOUTES les marques alors que
       `DEA`/`DEB`/`DEC` sont les préfixes du distributeur français d'UNE seule
       marque. Aucune fiche d'une autre marque n'était touchée ce jour-là —
       mais par CHANCE, pas par construction. Et ce rapprochement fait BAISSER
       le coût retenu : le jour où il déborde, il fait vendre à PERTE.
     · `audit/prix-multi-ecritures.js` découpait toutes les références avec la
       grammaire d'une seule marque : sur l'autre, `DWMT73803` et `DWMT73801` —
       deux coffrets DIFFÉRENTS — tombaient sur la même racine. **Neuf faux
       jumeaux fabriqués d'un coup**, dont un à 148,41 € d'écart.
     · Leçon plus ancienne, déjà payée : les préfixes d'une marque appliqués à
       une autre avaient fait chuter le typage de 70 fiches.

   ⚠️ CE QUE LA PORTE VÉRIFIE, MÉCANIQUEMENT :
   toute fonction dont le NOM porte une marque (`…Makita`, `…Dewalt`,
   `…Milwaukee`) ne peut être APPELÉE, hors de son propre module, que si la
   marque est vérifiée dans les parages — soit par un test explicite, soit
   parce que la marque est passée en paramètre.

   ⚠️ Ce qu'elle ne peut PAS voir : une table de marque cachée derrière un nom
   neutre. C'est dit, pas caché — d'où la règle de nommage ci-dessous.
   ⛔ RÈGLE DE NOMMAGE, opposable : toute table ou fonction propre à une marque
   PORTE le nom de la marque. Un nom neutre sur une règle de marque est un
   piège pour le prochain lecteur, et cette porte devient aveugle.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* Les marques qui ont leur propre nomenclature. Une marque qui s'ajoute ici
   s'ajoute AUSSI dans les fichiers — la porte ne devine pas. */
var MARQUES = ['Makita', 'Dewalt', 'Milwaukee', 'Festool'];

/* Les fichiers où une règle de marque peut vivre. `nomenclature.js` est le
   MODULE des tables : c'est chez lui, pas un débordement. */
var A_RELIRE = [
  'api/_lib/price-parse.js',
  'api/admin.js',
  'audit/prix-multi-ecritures.js',
  'audit/nomenclature-makita.js',
  'scripts/generer-fiches-makita.js'
];

/* ⛔⛔ CE QUI COMPTE COMME « LA MARQUE EST VÉRIFIÉE » — ET DEUX SABOTAGES ONT
   DÛ ME L'APPRENDRE, LE 10/08/2026.
   ① Premier jet : je cherchais le MOT « marque » dans le contexte. Mais chaque
      garde est précédée d'un commentaire qui l'explique — et qui contient le
      mot. J'ai retiré une vraie garde : la porte est restée VERTE, satisfaite
      par la prose décrivant la garde disparue.
   ② Deuxième jet, commentaires retirés : le mot survivait dans la SIGNATURE
      (`function f(titre, sku, marque)`). Un paramètre nommé `marque` ne prouve
      pas qu'on s'en sert. La porte est restée verte une seconde fois.
   ⇒ On exige désormais une VRAIE comparaison — un `===`, un `!==`, un
     `.test(…)`, un `indexOf` — ou que la marque soit PASSÉE à l'appel lui-même.
   ⚠️ La leçon dépasse cette porte : un détecteur qui se contente d'un mot
   détecte du vocabulaire, pas un comportement. */
var COMPARE_MARQUE = /(marque|brand)[^\n]{0,60}(===|!==|\.test\(|indexOf\(|match\()|(===|!==|\.test\(|indexOf\()[^\n]{0,60}(marque|brand)/i;

module.exports = function checkSeparationMarques() {
  var errors = [];
  var relus = 0;

  var motif = new RegExp('\\b([A-Za-z_$][A-Za-z0-9_$]*(?:' + MARQUES.join('|') + '))\\s*\\(', 'g');

  A_RELIRE.forEach(function (rel) {
    var p = path.join(RACINE, rel);
    if (!fs.existsSync(p)) return;                 // fichier absent : pas une faute
    relus += 1;
    var lignes = fs.readFileSync(p, 'utf8').split('\n');
    lignes.forEach(function (l, i) {
      /* Un commentaire qui CITE un appel n'est pas un appel. */
      var nu = l.replace(/^\s*[*/]+.*$/, '');
      if (!nu.trim()) return;
      motif.lastIndex = 0;
      var m;
      while ((m = motif.exec(nu))) {
        /* La marque est-elle vérifiée dans les parages ? On regarde la ligne
           elle-même et les huit lignes qui précèdent — c'est la portée d'une
           garde lisible ; au-delà, le lecteur ne fait plus le lien. */
        /* ⛔⛔ LES COMMENTAIRES NE COMPTENT PAS — SABOTAGE DU 10/08/2026.
           Premier jet : je testais le mot « marque » sur le contexte BRUT. Or
           chacune de ces gardes est précédée d'un commentaire qui explique
           pourquoi elle existe… et qui contient le mot. Résultat : j'ai retiré
           une vraie garde, et la porte est restée VERTE — satisfaite par la
           prose qui décrivait la garde disparue.
           Une porte qu'un commentaire suffit à contenter ne vérifie rien : elle
           certifie une intention, pas un code. On ne lit donc que le CODE. */
        var contexte = lignes.slice(Math.max(0, i - 8), i + 1)
          .map(function (x) {
            return String(x)
              .replace(/\/\*[\s\S]*?\*\//g, ' ')      // commentaire fermé sur la ligne
              .replace(/^\s*\*.*$/, ' ')              // suite d'un bloc /* … */
              .replace(/^\s*\/\*.*$/, ' ')            // ouverture d'un bloc
              .replace(/\/\/.*$/, ' ');               // commentaire de fin de ligne
          })
          .join('\n');
        /* La marque passée À L'APPEL vaut vérification : la fonction appelée
           la revérifie chez elle (c'est le patron de `refSansPrefixeDistributeur`
           et de `roleCoffret`). */
        var passeeALAppel = /\((?:[^()]*[,\s])?(marque|brand|MARQUE_DU_SCRIPT|p\.brand|x\.brand)[^()]*\)/i.test(nu);
        if (passeeALAppel || COMPARE_MARQUE.test(contexte)) continue;
        errors.push('[check-separation-marques] ⛔⛔ ' + rel + ':' + (i + 1)
          + ' appelle `' + m[1] + '` SANS que la marque soit vérifiée dans les '
          + 'parages. Une règle de marque appliquée à une autre marque fabrique '
          + 'des rapprochements faux — et un rapprochement faux sur un prix fait '
          + 'vendre à perte. Passer la marque en paramètre, ou la tester avant. '
          + '→ ' + nu.trim().slice(0, 90));
      }
    });
  });

  /* ⚠️ PRÉALABLE — sans fichier relu, cette porte serait verte à vide. */
  if (!relus) {
    errors.push('[check-separation-marques] ⛔ PRÉALABLE : aucun fichier relu. '
      + 'Une porte qui ne lit rien ne vérifie rien.');
  }

  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-separation-marques : chaque règle de marque est gardée par sa marque');
}
