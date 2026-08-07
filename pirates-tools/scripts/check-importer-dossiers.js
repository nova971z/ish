// scripts/check-importer-dossiers.js — LA PORTE DU DÉPARTAGE DES IMAGES.
//
// ⛔ CE QU'ELLE DÉFEND, ET POURQUOI C'EST DE L'ARGENT. `outils/importer-dossiers.mjs`
// reçoit un dossier par produit contenant PLUSIEURS images : la photo du
// produit, et des captures d'écran de fiche technique. Se tromper d'image
// pose une capture de TEXTE comme visuel de vente sur la carte produit.
// C'est arrivé : la règle « la plus lourde gagne » retenait la capture.
//
// ⛔⛔ ET LA PREMIÈRE CORRECTION ÉTAIT FAUSSE AUSSI. Elle lisait le `colorType`
// de l'en-tête PNG (4 et 6 = canal alpha) et concluait « détourée ». Or le
// colorType dit que l'image PEUT porter de la transparence, jamais qu'elle EN
// A : Chromium encode tout en type 6, opaque ou non. D'où le témoin ci-dessous
// `PNG_OPAQUE` — type 6, zéro pixel transparent. Une porte qui ne le contient
// pas ne verrait pas revenir le défaut.
//
// ⚠️ CETTE PORTE NE NOMME AUCUNE DONNÉE DU CATALOGUE. Les références des
// dossiers d'essai sont CHOISIES À L'EXÉCUTION dans products.json — dix-huit
// harnais sont morts pour avoir gravé une référence, un titre ou une marque.
//
// ⚠️ Elle n'écrit que dans `tests/_sortie/`, jamais à la racine du site.
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var pp = require('../api/_lib/price-parse');

var RACINE = path.join(__dirname, '..');

/* ── TROIS TÉMOINS, ENCODÉS UNE FOIS ET MESURÉS ────────────────────────────
   · PNG_DETOURE : colorType 6, des pixels d'alpha 0        → une VRAIE photo
   · PNG_OPAQUE  : colorType 6, AUCUN pixel transparent     → une capture
   · JPEG        : format qui ne peut pas porter d'alpha    → une capture   */
var PNG_DETOURE =
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAYAAABe3VzdAAAAi0lEQVR4AezS0QmAMBAD0NNpuoLT'
  + 'WadzhW6j/4VAICmIRLgPj/MMr93r408CqgcUwQiqAur39B28W+vOYoPTAbeq01n2gOxC9xwt6P4x'
  + 'uy8BWSk0F0Ekw/YjyEqhuQgiGbYfQVYKzf1H8Km6nIXE5j4teIzRnTUHQe90QLRgdd8UcF3MBFRt'
  + 'I6gKvgAAAP//Plo0fQAAAAZJREFUAwBGwng9JbiRTgAAAABJRU5ErkJggg==';
var PNG_OPAQUE =
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAYAAABe3VzdAAAAf0lEQVR4AeySwQ3AIAwDI9ZoN4Rx'
  + 'YMN2jvaVb7FkF/FwJCuPkGBdUp7No8TmYYPsgkzQBJPA1XsolXNnGb7Be4xQamYs67DBbFidbZAl'
  + 'boImyBJg+32DJsgSYPt9g8sIHrWGUqhxeMVna6GU3CA6UP0OJvj98X9VG2TZmiBL8AUAAP//NZLn'
  + 'fAAAAAZJREFUAwAhgReslPi51wAAAABJRU5ErkJggg==';
var JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdC'
  + 'IFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAA'
  + 'AADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlk'
  + 'ZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAA'
  + 'ABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAA'
  + 'AAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAA'
  + 'AABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEA'
  + 'AAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAA'
  + 'ACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwME'
  + 'BQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQME'
  + 'BAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU'
  + 'FBQUFBT/wAARCAAyADwDASIAAhEBAxEB/8QAGQABAAMBAQAAAAAAAAAAAAAAAAYICQcF/8QALhAA'
  + 'AQIFAQMNAQEAAAAAAAAAAAIDAQQFBgcRN3a0CAkSGBkhMUFUVpSV0ROB/8QAHAEAAQQDAQAAAAAA'
  + 'AAAAAAAAAAIDBAYFBwgB/8QALxEAAQMCAgYJBQAAAAAAAAAAAQACAwQRBSEGEhY0kbEUFTEyNVFx'
  + 'ctFSVGGSof/aAAwDAQACEQMRAD8A1TAPGvO5GrMs+u3A8yuZZpUg/PrZbjCCnEtNqXFMIx8IxgnQ'
  + '8JAFylsY6RwY0XJyC9kFPO0jtv2dVfktjtI7b9nVX5LZA6fTfXzVs2Sxv7Y8W/KuGCnnaR237Oqv'
  + 'yWzpOBeVtSM9XhOW/IUCdpT0tILn4vTLyFpUlLjaOjpDz1chH/BbKynkcGtdmVGqdGsWpIXTzwEN'
  + 'bmTcZf1d6ABNVZQg+dNiWQt3qhwzhOCD502JZC3eqHDODcvcd6FTaHeovc3mFjyADXa7IQtPzc+2'
  + '2t7vP8TLFWC0/Nz7ba3u8/xMsTaLeGeqq+lHg1T7VouAC9rlJCMZQoE3deNLtokhBCp6pUibk5eD'
  + 'iuimLjjK0J1j5Q1VDvJOBLhrAgp2KQxSNkb2gg8FmZ1CMsejpX2CfwdQjLHo6V9gn8NMwYjqqn/P'
  + 'FbE2/wAX8mfqflZmdQjLHo6V9gn8O58j/ky3vhjJdTrdysSTUjMUh2TRGWmoOq/op5lcO6EPDRtX'
  + 'eXAA7Fh0MTw9t7hQq7TPE8Qpn0swbqvFjYG/NAAZRUNAACEAAIQAAhAACF//2Q==';

/* ⛔ LES RÉFÉRENCES SE CHOISISSENT DANS LE CATALOGUE, PAS DANS CE FICHIER.
   On retient celles que le lecteur du traqueur SAIT relire depuis un nom de
   dossier : si l'outil ne reconnaît pas la référence, l'essai ne mesurerait
   pas le départage des images mais la lecture des noms. */
function choisirSujets(n) {
  var brut = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
  var tous = Array.isArray(brut) ? brut : (brut.products || []);
  var parMarque = new Map();
  tous.forEach(function (p) {
    var m = String(p.brand || '').trim();
    var s = String(p.sku || '').trim();
    if (!m || !s || /[\/\\:*?"<>|\s]/.test(s)) return;
    var lu = pp.lireReferenceDuTitre(m + ' ' + s, m).ref;
    if (!lu || lu !== s.toUpperCase()) return;   // nom de dossier non relisible
    if (!parMarque.has(m)) parMarque.set(m, []);
    parMarque.get(m).push(s);
  });
  var meilleure = null;
  parMarque.forEach(function (liste, m) {
    if (liste.length >= n && (!meilleure || liste.length > parMarque.get(meilleure).length)) meilleure = m;
  });
  if (!meilleure) return null;
  return { marque: meilleure, skus: parMarque.get(meilleure).slice(0, n) };
}

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-importer-dossiers] ' + m); }

  var outil = path.join(RACINE, 'outils', 'importer-dossiers.mjs');
  if (!fs.existsSync(outil)) { return ['[check-importer-dossiers] outils/importer-dossiers.mjs absent']; }

  /* ⛔ PRÉALABLE : sans quatre sujets, cette porte ne vérifie RIEN. Une
     condition sans laquelle le harnais ne mesure rien ÉCHOUE, elle ne se
     contente pas d'un message poli. */
  var sujets = choisirSujets(4);
  if (!sujets) {
    return ['[check-importer-dossiers] PRÉALABLE NON REMPLI : aucune marque du '
      + 'catalogue n\'offre 4 références relisibles depuis un nom de dossier — '
      + 'la porte n\'a rien pu mesurer, elle n\'est donc pas verte'];
  }

  var banc = path.join(RACINE, 'tests', '_sortie', 'banc-dossiers');
  fs.rmSync(banc, { recursive: true, force: true });

  /* Quatre situations, une par dossier. Les noms de fichiers ne disent RIEN :
     c'est tout l'intérêt — ce sont ceux d'un appareil photo. */
  var cas = [
    { sku: sujets.skus[0], f: [['IMG_1.png', PNG_DETOURE], ['IMG_2.png', PNG_OPAQUE]],
      attendu: 'IMG_1.png', quoi: 'le fond transparent départage deux PNG' },
    { sku: sujets.skus[1], f: [['IMG_3.png', PNG_OPAQUE], ['IMG_4.jpg', JPEG]],
      attendu: 'IMG_3.png', quoi: 'le seul PNG face à un JPEG est la photo' },
    { sku: sujets.skus[2], f: [['IMG_5.png', PNG_OPAQUE], ['IMG_6.png', PNG_OPAQUE]],
      attendu: null, quoi: 'deux PNG opaques : rien ne départage, donc REFUS' },
    { sku: sujets.skus[3], f: [['IMG_7.jpg', JPEG], ['IMG_8.jpg', JPEG]],
      attendu: null, quoi: 'deux JPEG : rien ne départage, donc REFUS' }
  ];
  cas.forEach(function (c) {
    var d = path.join(banc, c.sku);
    fs.mkdirSync(d, { recursive: true });
    c.f.forEach(function (x) { fs.writeFileSync(path.join(d, x[0]), Buffer.from(x[1], 'base64')); });
  });

  var r = cp.spawnSync(process.execPath,
    [outil, banc, '--marque', sujets.marque, '--json'],
    { cwd: RACINE, encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0 || !r.stdout) {
    return ['[check-importer-dossiers] l\'outil n\'a pas rendu de rapport (code '
      + r.status + ') — ' + String(r.stderr || '').split('\n')[0]];
  }
  var rap;
  try { rap = JSON.parse(r.stdout); }
  catch (e) { return ['[check-importer-dossiers] rapport --json illisible : ' + e.message]; }

  var parSku = new Map();
  (rap.detail || []).forEach(function (x) { parSku.set(String(x.sku).toUpperCase(), x); });
  var refuses = new Set((rap.refus || []).map(function (x) { return String(x.dossier).toUpperCase(); }));

  cas.forEach(function (c) {
    var k = String(c.sku).toUpperCase();
    var vu = parSku.get(k);
    if (c.attendu) {
      ok(!!vu, c.quoi + ' — aucune image retenue, le dossier a été écarté');
      ok(!vu || vu.image === c.attendu, c.quoi + ' — image retenue : '
        + (vu ? vu.image : '(aucune)') + ', attendue : ' + c.attendu);
      ok(!refuses.has(k), c.quoi + ' — le dossier a été REFUSÉ alors qu\'il se départage');
    } else {
      ok(!vu, c.quoi + ' — une image a POURTANT été retenue ('
        + (vu ? vu.image : '') + ') : l\'outil a deviné');
      ok(refuses.has(k), c.quoi + ' — le refus n\'a pas été prononcé, '
        + 'donc l\'ambiguïté est passée en silence');
    }
  });

  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-importer-dossiers OK');
  }, function (err) {
    console.error('  ❌ [check-importer-dossiers] harnais mort : ' + err.message);
    process.exit(1);
  });
}
