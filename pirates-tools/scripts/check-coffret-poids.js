// scripts/check-coffret-poids.js — LA RÈGLE COFFRET DE L'USER, ET SON MIROIR.
//
// ⛔ CE QU'ELLE DÉFEND, ET POURQUOI C'EST DE L'ARGENT. Le supplément coffret
// est FACTURÉ au client. Le montant affiché sur la fiche vient d'`app.js`, le
// montant débité vient d'`api/_lib/pricing.js`. Si les deux divergent d'un
// centime, le prix annoncé n'est plus le prix payé — c'est la porte J4, une
// pratique commerciale trompeuse, pas un écart d'arrondi.
//
// LA RÈGLE, mot pour mot (user, 08/08/2026) : « il y a deux formats de
// coffret, un gros et un petit ; le petit pèse environ 0,5 kg et le gros
// environ 1,3 kg ; dans les gros coffrets il n'y a que des circulaires ou des
// défonceuses avec accessoires (kit), ou alors s'il y a trois machines c'est
// un gros coffret ». Et : « sans la mallette il pèse bien ce poids-là, le
// poids doit augmenter si on utilise le switch avec coffret ».
//
// ⛔⛔ CE QUI TOURNAIT AVANT N'ÉTAIT PAS CETTE RÈGLE. Le palier se choisissait
// sur le POIDS de l'outil (≥ 3 kg) — un proxy qui ne venait d'aucune décision.
// Cette porte existe pour que le proxy ne revienne pas par la fenêtre.
//
// ⚠️ ELLE NE NOMME AUCUN PRODUIT DU CATALOGUE : les fiches d'essai sont
// fabriquées ici. Dix-huit harnais sont morts pour avoir gravé une référence.
'use strict';
var fs = require('fs');
var path = require('path');
var pricing = require('../api/_lib/pricing');

var ROOT = path.join(__dirname, '..');

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-coffret-poids] ' + m); }

  var petit = pricing.COFFRET_KG && pricing.COFFRET_KG.petit;
  var gros = pricing.COFFRET_KG && pricing.COFFRET_KG.gros;
  ok(petit === 0.5, 'le petit coffret pèse 0,5 kg (lu : ' + petit + ')');
  ok(gros === 1.3, 'le gros coffret pèse 1,3 kg (lu : ' + gros + ')');
  ok(gros > petit, 'le gros coffret pèse PLUS que le petit');

  /* ── Les trois cas de « gros », et leurs contre-exemples ────────────────
     ⚠️ Chaque cas VRAI est doublé d'un cas FAUX : une règle qui rend « gros »
     pour tout serait verte sur les seuls cas positifs. */
  function fiche(titre, cat, poids) {
    return { title: titre, category: cat || 'Scies', ncCategory: 'power_tool', weight_kg: poids || 2 };
  }
  var cas = [
    // ① circulaires
    [fiche('Scie circulaire 190 mm (machine nue)'), true, 'une scie CIRCULAIRE → gros'],
    [fiche('Scie sauteuse pendulaire 18V'), false, 'une scie SAUTEUSE n\'est pas une circulaire → petit'],
    [fiche('Scie sabre 18V XR'), false, 'une scie SABRE n\'est pas une circulaire → petit'],
    // ② défonceuses AVEC accessoires
    [fiche('Défonceuse 1010 W Set', 'Défonceuses'), true, 'une DÉFONCEUSE en SET → gros'],
    [fiche('Défonceuse 1010 W avec accessoires', 'Défonceuses'), true, 'une DÉFONCEUSE avec accessoires → gros'],
    [fiche('Défonceuse 18V (machine nue)', 'Défonceuses'), false, 'une défonceuse NUE n\'est pas un kit → petit'],
    [fiche('Affleureuse 18V brushless', 'Défonceuses'), false, 'une affleureuse nue → petit'],
    // ③ trois machines et plus
    [fiche('Pack 3 outils 18V', 'Combos'), true, 'un pack de 3 machines → gros'],
    [fiche('Pack 5 outils 18V', 'Combos'), true, 'un pack de 5 machines → gros'],
    [fiche('Pack 2 outils 18V', 'Combos'), false, 'DEUX machines tiennent dans un coffret → petit'],
    // ⛔ et surtout : le POIDS ne décide plus
    [fiche('Perforateur burineur SDS-Plus', 'Perforateurs', 12), false,
      '⛔ un outil de 12 kg reste en PETIT coffret — le poids ne décide plus du format'],
    [fiche('Scie circulaire compacte', 'Scies', 0.4), true,
      '⛔ une circulaire légère reste en GROS coffret — c\'est le TYPE qui décide']
  ];
  cas.forEach(function (t) {
    var vu = pricing.coffretGros(t[0]);
    ok(vu === t[1], t[2] + ' (obtenu : ' + (vu ? 'gros' : 'petit') + ')');
  });

  /* ── Le poids expédié augmente, et de la bonne quantité ─────────────── */
  var outil = fiche('Perceuse visseuse 18V', 'Perçage, vissage et boulonnage', 1.6);
  var scie = fiche('Scie circulaire 190 mm', 'Scies', 3.7);
  ok(pricing.poidsExpedieKg(outil, false) === 1.6, 'sans coffret : le poids est celui de l\'outil seul');
  ok(pricing.poidsExpedieKg(outil, true) === 2.1,
    'avec un PETIT coffret : 1,6 + 0,5 = 2,1 kg (obtenu : ' + pricing.poidsExpedieKg(outil, true) + ')');
  ok(pricing.poidsExpedieKg(scie, true) === 5,
    'avec un GROS coffret : 3,7 + 1,3 = 5 kg (obtenu : ' + pricing.poidsExpedieKg(scie, true) + ')');
  ok(pricing.poidsExpedieKg(outil, true) > pricing.poidsExpedieKg(outil, false),
    '⛔ le poids AUGMENTE quand on prend le coffret — c\'est la demande de l\'user');

  /* Un produit NON éligible n'a pas de coffret, donc pas de poids en plus. */
  var accessoire = { title: 'Jeu de forets', category: 'Accessoires', ncCategory: 'accessory', weight_kg: 0.3 };
  ok(pricing.coffretGros(accessoire) === false, 'un accessoire n\'a pas de coffret');
  ok(pricing.poidsExpedieKg(accessoire, true) === 0.3,
    'un accessoire ne gagne pas le poids d\'un coffret qu\'il n\'a pas');

  /* ── Le supplément suit le format ──────────────────────────────────── */
  ok(pricing.coffretSurchargeCents(scie) === Math.round(pricing.COFFRET.gros * 100),
    'une circulaire est facturée au tarif GROS');
  ok(pricing.coffretSurchargeCents(outil) === Math.round(pricing.COFFRET.petit * 100),
    'une perceuse est facturée au tarif PETIT');

  /* ══ LE MIROIR ══════════════════════════════════════════════════════════
     ⛔ `app.js` recalcule le supplément pour l'AFFICHAGE. Les deux copies
     doivent porter les mêmes constantes et les mêmes motifs, sinon le prix
     montré n'est plus celui débité. On compare les SOURCES : c'est la seule
     manière de le voir sans lancer un navigateur. */
  var appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  var srvSrc = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'pricing.js'), 'utf8');
  [
    ['COFFRET_KG', /COFFRET_KG\s*=\s*\{[^}]*\}/],
    ['COFFRET_CIRCULAIRE', /COFFRET_CIRCULAIRE\s*=\s*\/[^\n]*\/i/],
    ['COFFRET_DEFONCEUSE', /COFFRET_DEFONCEUSE\s*=\s*\/[^\n]*\/i/],
    ['COFFRET_KIT', /COFFRET_KIT\s*=\s*\/[^\n]*\/i/],
    ['COFFRET_NB_OUTILS', /COFFRET_NB_OUTILS\s*=\s*\/[^\n]*\/i/]
  ].forEach(function (p) {
    var a = appSrc.match(p[1]);
    var s = srvSrc.match(p[1]);
    ok(!!a, 'app.js doit définir ' + p[0]);
    ok(!!s, 'api/_lib/pricing.js doit définir ' + p[0]);
    if (a && s) {
      ok(a[0].replace(/\s+/g, ' ') === s[0].replace(/\s+/g, ' '),
        '⛔ MIROIR ROMPU sur ' + p[0] + ' — le prix AFFICHÉ divergerait du prix DÉBITÉ.\n'
        + '        app.js : ' + a[0].replace(/\s+/g, ' ') + '\n'
        + '        serveur : ' + s[0].replace(/\s+/g, ' '));
    }
  });

  /* ⛔ LE PROXY NE DOIT PAS REVENIR. `heavyKg` reste défini (compatibilité)
     mais plus AUCUN choix de palier ne doit s'y accrocher. */
  [['app.js', appSrc], ['api/_lib/pricing.js', srvSrc]].forEach(function (f) {
    var bloc = f[1].slice(f[1].indexOf('function coffretSurchargeCents'));
    bloc = bloc.slice(0, bloc.indexOf('\n}') + 2);
    ok(!/heavyKg/.test(bloc),
      '⛔ ' + f[0] + ' : le supplément coffret s\'appuie de nouveau sur `heavyKg`, '
      + 'donc sur le POIDS de l\'outil. La règle de l\'user porte sur son TYPE.');
    ok(/coffretGros\s*\(/.test(bloc),
      f[0] + ' : le supplément doit passer par `coffretGros`');
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-coffret-poids OK');
}
