// scripts/check-visuels.js — L'INVENTAIRE DES VISUELS DOIT DIRE VRAI.
//
// ⛔⛔ POURQUOI CETTE PORTE. Demande de l'user, 04/08 : « prépare les PNG
// correctement, sans modifier leur qualité ni leur taille, il faut qu'ils
// soient tels quels au pixel près ». L'outil qui le prouve est
// `scripts/inventaire-visuels.js` — mais un instrument de mesure qu'on ne
// vérifie pas est exactement le piège que ce projet a déjà payé vingt-huit
// fois (origine O2). Une dimension lue de travers rendrait un nombre
// plausible et faux, et « au pixel près » ne voudrait plus rien dire.
//
// ⚠️ Les images de test sont FABRIQUÉES ici, octet par octet : un harnais ne
// nomme jamais une donnée du catalogue, et il n'écrit jamais à la racine du
// site. Rien n'est lu sur le disque, rien n'y est écrit.
'use strict';

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-visuels] ' + m); }

  var inv = require('./inventaire-visuels.js');
  ok(typeof inv.dimensions === 'function' && typeof inv.inventaire === 'function',
    'inventaire-visuels expose dimensions et inventaire');
  if (!inv.dimensions) return errors;

  /* ── PNG : signature 8 octets, puis IHDR (largeur et hauteur en 16..23) ── */
  function pngFabrique(l, h) {
    var b = Buffer.alloc(24);
    b[0] = 0x89; b.write('PNG', 1, 'ascii');
    b.writeUInt32BE(l, 16); b.writeUInt32BE(h, 20);
    return b;
  }
  var p1 = inv.dimensions(pngFabrique(1080, 720));
  ok(p1.l === 1080 && p1.h === 720 && p1.format === 'png',
    '⛔ un PNG rend ses dimensions exactes, dans le bon ORDRE — largeur puis hauteur. '
    + 'Les inverser donnerait un nombre plausible et faux (obtenu ' + JSON.stringify(p1) + ')');

  /* ── WebP VP8X : 24 bits chacune, petit-boutiste, stockés MOINS UN ─────── */
  function webpX(l, h) {
    var b = Buffer.alloc(30);
    b.write('RIFF', 0, 'ascii'); b.write('WEBP', 8, 'ascii'); b.write('VP8X', 12, 'ascii');
    var lm = l - 1, hm = h - 1;
    b[24] = lm & 0xff; b[25] = (lm >> 8) & 0xff; b[26] = (lm >> 16) & 0xff;
    b[27] = hm & 0xff; b[28] = (hm >> 8) & 0xff; b[29] = (hm >> 16) & 0xff;
    return b;
  }
  var w1 = inv.dimensions(webpX(1024, 1024));
  ok(w1.l === 1024 && w1.h === 1024,
    '⛔⛔ WebP étendu : les dimensions sont stockées MOINS UN. Oublier le +1 rendrait '
    + '1023 pour une image de 1024 — un pixel d\'écart, donc « au pixel près » faux '
    + '(obtenu ' + JSON.stringify(w1) + ')');
  var w2 = inv.dimensions(webpX(1, 1));
  ok(w2.l === 1 && w2.h === 1,
    '⛔ le plus petit cas possible tient aussi : 1×1, là où un décalage se voit le mieux');

  /* ── WebP VP8L : 14 bits chacune, empaquetés, stockés MOINS UN ─────────── */
  function webpL(l, h) {
    var b = Buffer.alloc(30);
    b.write('RIFF', 0, 'ascii'); b.write('WEBP', 8, 'ascii'); b.write('VP8L', 12, 'ascii');
    b.writeUInt32LE(((l - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21);
    return b;
  }
  var w3 = inv.dimensions(webpL(800, 600));
  ok(w3.l === 800 && w3.h === 600,
    '⛔ WebP sans perte : un autre empaquetage, une autre lecture. Confondre les deux '
    + 'variantes rendrait un nombre crédible et faux (obtenu ' + JSON.stringify(w3) + ')');

  /* ⛔⛔ ET CE QU'ON NE SAIT PAS LIRE SE DIT. Une dimension devinée est pire
     qu'une dimension absente : elle passerait le contrôle « au pixel près »
     sans rien avoir mesuré. */
  var inconnu = inv.dimensions(Buffer.from('ceci n\'est pas une image du tout', 'ascii'));
  ok(inconnu.l === null && inconnu.h === null && inconnu.format === 'inconnu',
    '⛔⛔ un format non reconnu rend `null`, JAMAIS un nombre : deviner une dimension '
    + 'ferait passer le contrôle sans rien avoir mesuré (obtenu ' + JSON.stringify(inconnu) + ')');

  /* ── Les combos s'écartent SUR DEMANDE, et seulement leur visuel ───────── */
  var faux = [
    { sku: 'ZZ1', id: 'zz1', heroImg: 'images/absent-zz1.webp', category: 'Scies' },
    { sku: 'ZZ2', id: 'zz2', heroImg: 'images/absent-zz2.webp', category: 'Combos' },
    { sku: 'ZZ3', id: 'zz3', category: 'Scies' }
  ];
  var sansOpt = inv.inventaire(faux, {});
  ok(sansOpt.lignes.length === 2 && sansOpt.ecartes.length === 0,
    '⛔ par défaut RIEN n\'est écarté, et une fiche sans visuel n\'entre pas dans '
    + 'l\'inventaire (obtenu ' + sansOpt.lignes.length + ' ligne(s))');
  var avecOpt = inv.inventaire(faux, { horsCombos: true });
  ok(avecOpt.lignes.length === 1 && avecOpt.ecartes.length === 1
    && avecOpt.ecartes[0].sku === 'ZZ2',
    '⛔⛔ `--hors-combos` écarte le VISUEL du combo, et lui seul — la fiche technique '
    + 'reste au catalogue, l\'outil ne la touche pas (obtenu '
    + JSON.stringify(avecOpt.ecartes.map(function (e) { return e.sku; })) + ')');

  /* ⛔ UN FICHIER ABSENT EST SIGNALÉ, PAS SAUTÉ EN SILENCE : un visuel qui
     disparaît pendant le chantier est exactement ce que cet outil doit voir. */
  ok(avecOpt.illisibles.length === 1,
    '⛔⛔ un visuel référencé mais ABSENT du disque remonte dans `illisibles` — le '
    + 'sauter en silence laisserait une image perdue passer pour intacte (obtenu '
    + avecOpt.illisibles.length + ')');

  /* ══ ARCHIVER, PAS DÉTRUIRE ═══════════════════════════════════════════
     ⛔ Décision de l'user, 04/08 : « au lieu de les supprimer, les ranger dans
     un fichier externe qui ne pollue pas le site, comme ça si on a besoin de
     récupérer quelque chose ce sera facile ». Le tri est la seule partie qui
     décide QUI part : elle s'éprouve seule, sur des fiches fabriquées. */
  var arch = require('./archiver-fiches.js');
  ok(typeof arch.trier === 'function' && typeof arch.visuelsDe === 'function',
    'archiver-fiches expose trier et visuelsDe');
  if (arch.trier) {
    var lot = [
      { sku: 'ZZ1', category: 'Scies' },
      { sku: 'ZZ2', category: 'Combos' },
      { sku: 'ZZ3', category: 'combos multi-outils' },
      { sku: 'ZZ4' }
    ];
    var t = arch.trier(lot, function (x) { return /combo/i.test(String(x.category || '')); });
    ok(t.archive.length === 2 && t.garde.length === 2,
      '⛔⛔ le tri sépare exactement ce qui part de ce qui reste — un critère trop large '
      + 'emporterait des fiches que l\'user n\'a pas désignées (obtenu '
      + t.archive.length + ' archivée(s), ' + t.garde.length + ' gardée(s))');
    ok(t.garde.concat(t.archive).length === lot.length,
      '⛔⛔ AUCUNE fiche ne se perd entre les deux tas : leur somme fait le catalogue '
      + 'd\'origine. Une fiche qui disparaîtrait des deux côtés serait détruite en '
      + 'silence (obtenu ' + (t.garde.length + t.archive.length) + '/' + lot.length + ')');
    ok(t.archive.every(function (x) { return /combo/i.test(String(x.category || '')); }),
      '⛔ rien d\'autre que le critère ne part');
    /* ⛔ Un visuel cité DEUX fois ne se déplace qu'une fois : le second
       déplacement échouerait, et l'outil s'arrêterait sans raison. */
    var v = arch.visuelsDe({ heroImg: 'images/a.webp', img: 'images/a.webp' });
    ok(v.length === 1,
      '⛔ un visuel cité deux fois (heroImg et img) ne compte qu\'une fois (obtenu '
      + JSON.stringify(v) + ')');
    /* ⛔ LE PRÉFIXE DE RÉFÉRENCE : « vire tous les produits de clickoutil,
       déplace-les dans un environnement qui ne pollue pas le site » (04/08).
       Ces fiches ne se reconnaissent pas à leur catégorie — elles sont
       éparpillées sur huit rayons — mais à leur RÉFÉRENCE. Le critère doit
       mordre au DÉBUT, jamais n'importe où : une référence qui contiendrait
       le motif au milieu partirait avec, et ce serait une fiche détruite par
       erreur. */
    ok(typeof arch.critereSkuPrefixe === 'function',
      '⛔ le critère par référence vient du PRODUIT, pas d\'une copie écrite ici : une '
      + 'porte qui teste sa propre copie est verte sans rien vérifier');
    var parPrefixe = arch.critereSkuPrefixe;
    var lotPre = [
      { sku: 'ZZ-001' }, { sku: 'ZZ-002' },
      { sku: 'DCB-ZZ-003' },       // contient le motif, mais PAS au début
      { sku: 'DCD709N' }
    ];
    var tp = arch.trier(lotPre, parPrefixe('ZZ-'));
    ok(tp.archive.length === 2,
      '⛔⛔ le préfixe mord au DÉBUT de la référence, jamais au milieu : sinon une '
      + 'fiche qui contient le motif ailleurs serait archivée par erreur (obtenu '
      + JSON.stringify(tp.archive.map(function (x) { return x.sku; })) + ')');
    ok(tp.garde.length === 2 && tp.garde.some(function (x) { return x.sku === 'DCB-ZZ-003'; }),
      '⛔ …et celle qui le porte au milieu RESTE au catalogue');

    ok(arch.visuelsDe({ img: 'images/placeholder.svg' }).length === 0,
      '⛔ le placeholder n\'est PAS un visuel de fiche : le déplacer casserait toutes '
      + 'les autres fiches qui s\'en servent');
  }

  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-visuels OK');
  }, function (err) {
    console.error('  ❌ [check-visuels] harnais mort : ' + err.message); process.exit(1);
  });
}
