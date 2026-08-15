/* check-fiches-persistees.js — CE QUE L'ADMIN ENREGISTRE SURVIT AU RAFRAÎCHISSEMENT.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ LA PANNE QUE CETTE PORTE FERME, CONSTATÉE PAR L'USER LE 14/08/2026 :
   « si je rafraîchis la page ça efface tout ce que j'ai fait ». Il avait
   raison, et le mensonge était structurel :
     ① l'admin crée/édite une fiche → écrite dans `product_overrides` ✅ ;
     ② la répercussion au snapshot recopiait la fiche ENTIÈRE — photos base64
        comprises, jusqu'à 6 × 700 Ko — dans un shard plafonné à 1 Mio :
        l'écriture du shard ÉCHOUAIT, et l'échec était AVALÉ (best-effort) ;
     ③ le serveur répondait « ok » depuis l'objet EN MÉMOIRE, sans relire ;
     ④ au rafraîchissement, le catalogue lit le SNAPSHOT D'ABORD et ne retombe
        sur la collection que si AUCUN shard n'existe → la fiche invisible,
        pour toujours.
   S'y ajoutait un second effaceur : le formulaire d'édition s'ouvrait même
   quand le détail n'était pas arrivé (réseau), donc VIDE — et « Enregistrer »
   écrasait la vraie description par du vide.

   CETTE PORTE REJOUE LA CHAÎNE ENTIÈRE sur une base factice qui applique la
   VRAIE contrainte de taille des documents, et vérifie :
     ① les champs lourds ne passent JAMAIS dans un shard (marqueur `_riche`) ;
     ② une fiche à photos ÉCRITE est RELUE COMPLÈTE par le chemin public
        (snapshot + lecture ciblée des documents riches) ;
     ③ même après RECONSTRUCTION des shards, la fiche reste complète ;
     ④ le serveur RELIT après écrire et répond `visible` (assertions sur la
        source d'api/admin.js — le motif exact, pas une paraphrase) ;
     ⑤ le client TRAITE `visible:false` comme un échec qui crie, et REFUSE
        d'ouvrir un formulaire d'édition sans le détail chargé (source app.js).
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* ── UNE BASE FACTICE QUI APPLIQUE LA CONTRAINTE RÉELLE ─────────────────────
   Le plafond d'un document est LU depuis la constante du produit ? Il n'y en a
   pas : 1 Mio est la limite de la plateforme Firestore, publique et stable —
   on l'applique ici comme elle s'applique là-bas : un set() trop gros JETTE.
   ⚠️ La base est COHÉRENTE (ce qu'on écrit se relit) : un simulacre incohérent
   rend des scénarios que la production ne produira jamais (leçon du 10/08). */
var PLAFOND_DOC = 1048576;

function baseFactice() {
  var docs = {};   /* 'collection/doc' -> objet */
  function taille(o) { return JSON.stringify(o).length; }
  function docRef(col, id) {
    var cle = col + '/' + id;
    return {
      id: id,
      set: function (corps, opts) {
        var fusion = (opts && opts.merge) ? Object.assign({}, docs[cle] || {}, corps) : Object.assign({}, corps);
        Object.keys(fusion).forEach(function (k) {
          if (fusion[k] && fusion[k].__delete) delete fusion[k];
        });
        if (taille(fusion) > PLAFOND_DOC) {
          return Promise.reject(new Error('INVALID_ARGUMENT: document exceeds maximum size'));
        }
        docs[cle] = fusion;
        return Promise.resolve();
      },
      get: function () {
        var d = docs[cle];
        return Promise.resolve({ exists: !!d, id: id, data: function () { return d ? Object.assign({}, d) : undefined; } });
      }
    };
  }
  return {
    _docs: docs,
    collection: function (col) {
      return {
        doc: function (id) { return docRef(col, id); },
        get: function () {
          var out = [];
          Object.keys(docs).forEach(function (cle) {
            if (cle.indexOf(col + '/') !== 0) return;
            var id = cle.slice(col.length + 1);
            out.push({ id: id, data: function () { return Object.assign({}, docs[cle]); } });
          });
          return Promise.resolve({ size: out.length, forEach: function (f) { out.forEach(f); } });
        }
      };
    },
    getAll: function () {
      var refs = Array.prototype.slice.call(arguments);
      return Promise.all(refs.map(function (r) { return r.get(); }));
    }
  };
}
var adminFactice = { firestore: {
  FieldValue: {
    serverTimestamp: function () { return { __ts: 1 }; },
    delete: function () { return { __delete: 1 }; }
  }
} };

module.exports = async function checkFichesPersistees() {
  var errors = [];
  var snap;
  try { snap = require(path.join(RACINE, 'api/_lib/snapshot.js')); }
  catch (e) { return ['[check-fiches-persistees] ⛔ snapshot.js inchargeable : ' + e.message]; }

  /* Une fiche comme l'admin en crée : UNE photo en base64 (450 000 signes —
     compressée par le client), recopiée dans la vignette `img` comme le fait
     l'édition (api/admin.js) : elle compte DEUX fois. Le tout TIENT dans le
     budget du document principal — c'est le cas RÉEL qui passait l'écriture
     durable puis mourait en silence au shard. Aucun libellé du catalogue. */
  var GROS = 'data:image/webp;base64,' + new Array(450001 - 23).join('A');
  var fiche = { sku: 'ZZP1', title: 'Fiche temoin', price: 199, price_ht: 165.83,
    creeALaMain: true, slug: 'zz-fiche-temoin', img: GROS, images: [GROS],
    description_long: new Array(6001).join('d'), desc: 'courte', category: 'ZZCAT' };

  /* ⓪ — LE BUDGET DU DOCUMENT PRINCIPAL (api/_lib/limites.js). Une photo de
     700 Ko recopiée en vignette fait ~1,4 Mo : c'est PHYSIQUEMENT au-dessus du
     plafond d'un document — le serveur doit refuser AVANT d'écrire, avec les
     chiffres, jamais laisser un 500 sec ou un shard muet. */
  var limites;
  try { limites = require(path.join(RACINE, 'api/_lib/limites.js')); }
  catch (eL) { return ['[check-fiches-persistees] ⛔ limites.js inchargeable : ' + eL.message]; }
  var TROP = 'data:image/webp;base64,' + new Array(700001 - 23).join('A');
  var verdictTrop = limites.docDansLeBudget({ img: TROP, images: [TROP] });
  if (verdictTrop.ok || !(verdictTrop.depassement > 0)) {
    errors.push('[check-fiches-persistees] ⛔⛔ ARGENT : un assemblage à ~1,4 Mo (photo 700 Ko '
      + 'comptée deux fois) PASSE le budget de document (' + JSON.stringify(verdictTrop)
      + ') — l\'écriture partirait vers un plafond de plateforme et échouerait, en 500 sec '
      + 'ou en silence.');
  }
  if (!limites.docDansLeBudget(fiche).ok) {
    errors.push('[check-fiches-persistees] ⛔ …et la fiche réaliste du banc (une photo '
      + 'compressée) doit PASSER le budget — sinon plus aucune fiche à photo n\'est possible '
      + 'et « tout refuser » satisferait le contrôle précédent.');
  }
  /* ⓪ bis — LA VIGNETTE NE SE STOCKE PLUS EN DOUBLE (15/08/2026).
     Mesuré sur l'écran de l'user : sa fiche était refusée à 1 395 441 octets
     pour un budget de 950 000. Sa photo n'était pas trop lourde — elle était
     écrite DEUX FOIS dans le même document (`images[0]` et `img`). Le doublon
     mangeait la moitié du budget et rendait toute fiche à photo impossible. */
  var catalogSrc = fs.readFileSync(path.join(RACINE, 'api/_lib/catalog.js'), 'utf8');
  var adminSrcImg = fs.readFileSync(path.join(RACINE, 'api/admin.js'), 'utf8');
  if (/patch\.img\s*=\s*images\[0\]/.test(adminSrcImg)) {
    errors.push('[check-fiches-persistees] ⛔⛔ ARGENT : la vignette RECOPIE de nouveau le '
      + 'premier visuel dans le même document. Une photo compte alors DEUX fois : la moitié du '
      + 'budget part en doublon pur, et une fiche à photo redevient impossible à enregistrer.');
  }
  if (!/fusion\.img\s*=\s*fusion\.images\[0\]/.test(catalogSrc)) {
    errors.push('[check-fiches-persistees] ⛔ …et la vignette doit être DÉRIVÉE à la lecture '
      + '(api/_lib/catalog.js). Sans la dérivation, ne plus la stocker laisserait les cartes du '
      + 'catalogue sans visuel — on aurait échangé un blocage contre une grille vide.');
  }
  /* Et la preuve chiffrée : le poids réel de sa fiche, avec et sans doublon. */
  var PHOTO = 'data:image/webp;base64,' + new Array(697701 - 23).join('A');
  var avecDoublon = limites.docDansLeBudget({ sku: 'ZZP2', title: 't', price: 1,
    images: [PHOTO], img: PHOTO });
  var sansDoublon = limites.docDansLeBudget({ sku: 'ZZP2', title: 't', price: 1,
    images: [PHOTO], img: null });
  if (avecDoublon.ok) {
    errors.push('[check-fiches-persistees] ⛔ PRÉALABLE : le témoin du doublon doit DÉPASSER le '
      + 'budget (obtenu ' + JSON.stringify(avecDoublon) + ') — sinon il ne prouve rien.');
  }
  if (!sansDoublon.ok) {
    errors.push('[check-fiches-persistees] ⛔⛔ ARGENT : une photo de ~700 Ko stockée UNE SEULE '
      + 'fois doit PASSER le budget (obtenu ' + JSON.stringify(sansDoublon) + '). Si elle ne '
      + 'passe pas, l\'user ne peut toujours pas mettre de photo — le blocage qu\'il a '
      + 'photographié le 15/08/2026.');
  }

  /* ⓪ ter — LA DÉRIVATION COMBLE UN VIDE, ELLE N'ÉCRASE JAMAIS.
     Les fiches du fichier portent un chemin d'image (`images/posters/…`) qui
     doit rester maître : une dérivation gourmande remplacerait le poster de
     l'user par un visuel importé, sur TOUT le catalogue d'un coup. */
  var appliquer = null;
  try { appliquer = require(path.join(RACINE, 'api/_lib/catalog.js'))._internals.applyOverrides; }
  catch (eA) { /* signalé juste après */ }
  if (typeof appliquer !== 'function') {
    errors.push('[check-fiches-persistees] ⛔ PRÉALABLE : `applyOverrides` n\'est pas atteignable '
      + '— la dérivation de vignette n\'a pas pu être éprouvée sur le vrai chemin.');
  } else {
    var POSTER = 'images/posters/zz-temoin.webp';
    var VISUEL = 'data:image/webp;base64,AAAA';
    var avecPoster = appliquer([{ id: 'zz-a', img: POSTER }],
      { 'zz-a': { images: [VISUEL] } })[0];
    if (!avecPoster || avecPoster.img !== POSTER) {
      errors.push('[check-fiches-persistees] ⛔⛔ la dérivation ÉCRASE une vignette existante '
        + '(obtenu « ' + (avecPoster && avecPoster.img) + ' » au lieu du poster). Les visuels '
        + 'sont le travail de l\'user : un poster remplacé sans qu\'il l\'ait demandé, c\'est '
        + 'tout le catalogue qui change d\'apparence d\'un coup.');
    }
    var sansVignette = appliquer([{ id: 'zz-b', img: null }],
      { 'zz-b': { images: [VISUEL] } })[0];
    if (!sansVignette || sansVignette.img !== VISUEL) {
      errors.push('[check-fiches-persistees] ⛔⛔ …et quand la vignette MANQUE, elle DOIT se '
        + 'dériver du premier visuel (obtenu « ' + (sansVignette && sansVignette.img) + ' »). '
        + 'Sans ça, les fiches enregistrées avec photo apparaîtraient sans visuel au catalogue.');
    }
  }

  var adminSrcBudget = fs.readFileSync(path.join(RACINE, 'api/admin.js'), 'utf8');
  if ((adminSrcBudget.match(/docDansLeBudget/g) || []).length < 2) {
    errors.push('[check-fiches-persistees] ⛔ le budget de document n\'est plus vérifié aux DEUX '
      + 'points d\'écriture (création + édition fusionnée) d\'api/admin.js.');
  }

  /* ① et ② — LA CHAÎNE ÉCRITURE → RAFRAÎCHISSEMENT, REJOUÉE.
     ⚠️ Le shard visé est PRÉCHARGÉ avec la charge réelle qu'il porte en
     production : ~425 relevés de prix (1 708 fiches ÷ 4 shards), ~700 octets
     chacun. C'est CETTE charge qui, ajoutée à une photo recopiée telle quelle,
     faisait déborder le shard — un shard vide n'aurait rien prouvé. */
  var db = baseFactice();
  var chargePrix = { _maj: { __ts: 1 } };
  for (var zi = 0; zi < 425; zi++) {
    chargePrix['zz-prix-' + zi] = { price: 100 + zi, priceSrcTTC: 90 + zi,
      priceSource: 'zz-source', priceSources: { zz: { ttc: 90 + zi, vuLe: 1 } },
      note: new Array(560).join('p') };
  }
  var shardCible = snap.shardDe('zz-fiche-temoin');
  await db.collection('config').doc(snap.PREFIXE + shardCible).set(chargePrix, { merge: false });
  var okEcrit = await db.collection('product_overrides').doc('zz-fiche-temoin').set(fiche, { merge: false })
    .then(function () { return true; }, function () { return false; });
  if (!okEcrit) {
    errors.push('[check-fiches-persistees] ⛔ PRÉALABLE : le document principal lui-même ne '
      + 's\'écrit pas — le témoin dépasse le plafond, il est mal construit.');
    return errors;
  }
  var snapOk = await snap.majSnapshot(db, adminFactice, 'zz-fiche-temoin', fiche);
  if (!snapOk) {
    errors.push('[check-fiches-persistees] ⛔⛔ ARGENT : la répercussion au snapshot d\'une fiche '
      + 'à DEUX photos base64 ÉCHOUE encore — c\'est exactement la panne du 14/08/2026 : le '
      + 'shard déborde de son plafond et la fiche disparaît au rafraîchissement.');
  }
  var shard = db._docs['config/' + snap.PREFIXE + snap.shardDe('zz-fiche-temoin')] || {};
  var entree = shard['zz-fiche-temoin'];
  if (!entree) {
    errors.push('[check-fiches-persistees] ⛔ l\'entrée de shard n\'existe pas après majSnapshot.');
  } else {
    ['img', 'images', 'description_long'].forEach(function (c) {
      if (c in entree) {
        errors.push('[check-fiches-persistees] ⛔⛔ ARGENT : le champ LOURD « ' + c + ' » est '
          + 'entré dans le shard. Quelques fiches à photos et le shard dépasse 1 Mio : toutes '
          + 'ses écritures échouent en silence, et tout ce que l\'admin fait « disparaît ».');
      }
    });
    if (!entree._riche) {
      errors.push('[check-fiches-persistees] ⛔ l\'entrée allégée ne porte pas `_riche` : le '
        + 'lecteur ne saurait pas qu\'il doit aller chercher le document complet, et la fiche '
        + 'serait servie sans photo ni description pour toujours.');
    }
    if (Number(entree.price) !== 199) {
      errors.push('[check-fiches-persistees] ⛔⛔ ARGENT (J4) : le PRIX doit rester ENTIER dans '
        + 'le shard (obtenu ' + entree.price + ') — le snapshot est la source des prix servis.');
    }
  }

  /* Le « rafraîchissement » : lireSnapshot + lecture ciblée des riches — le
     même enchaînement que catalog.js. On vérifie le RÉSULTAT servi. */
  var carte = await snap.lireSnapshot(db);
  if (!carte || !carte['zz-fiche-temoin']) {
    errors.push('[check-fiches-persistees] ⛔ la fiche est absente du snapshot relu.');
  } else {
    var riches = Object.keys(carte).filter(function (k) { return carte[k] && carte[k]._riche; });
    var docsR = await db.getAll.apply(db, riches.map(function (k) {
      return db.collection('product_overrides').doc(k);
    }));
    docsR.forEach(function (d) { if (d.exists) carte[d.id] = d.data(); });
    var servie = carte['zz-fiche-temoin'];
    if (!servie || servie.img !== GROS || !Array.isArray(servie.images) || servie.images.length !== 1
        || String(servie.description_long || '').length !== 6000 || !servie.creeALaMain) {
      errors.push('[check-fiches-persistees] ⛔⛔ ARGENT : après le rafraîchissement simulé, la '
        + 'fiche servie n\'est PAS complète (photos ou description manquantes). C\'est le '
        + 'symptôme exact rapporté par l\'user : « ça efface tout ce que j\'ai fait ».');
    }
  }

  /* ③ — LA RECONSTRUCTION NE REGONFLE PAS LES SHARDS. */
  await snap.reconstruire(db, adminFactice);
  var shard2 = db._docs['config/' + snap.PREFIXE + snap.shardDe('zz-fiche-temoin')] || {};
  var entree2 = shard2['zz-fiche-temoin'];
  if (!entree2 || ('img' in entree2) || ('images' in entree2) || !entree2._riche) {
    errors.push('[check-fiches-persistees] ⛔⛔ la RECONSTRUCTION des shards recopie les champs '
      + 'lourds (ou perd `_riche`) : elle referait déborder les shards — et elle tourne '
      + 'précisément quand on essaie de se rattraper d\'une maj manquée.');
  }

  /* ④ — LE SERVEUR RELIT ET RÉPOND `visible` (le motif exact dans la source). */
  var adminSrc = fs.readFileSync(path.join(RACINE, 'api/admin.js'), 'utf8');
  if (!/product_overrides'\)\.doc\(id\)\.get\(\)/.test(adminSrc.replace(/\s+/g, ' '))
      && !/doc\(id\)\.get\(\)/.test(adminSrc)) {
    errors.push('[check-fiches-persistees] ⛔ api/admin.js ne RELIT plus le document après '
      + 'l\'écriture : la réponse redeviendrait une promesse en l\'air.');
  }
  ['product-create', 'product-edit'].forEach(function (typ) {
    var i = adminSrc.indexOf("'" + typ + "'");
    var bloc = i >= 0 ? adminSrc.slice(i, i + 12000) : '';
    if (!/visible/.test(bloc) || !/majSnapshot/.test(bloc)) {
      errors.push('[check-fiches-persistees] ⛔ le bloc « ' + typ + ' » ne prouve plus la '
        + 'VISIBILITÉ par le chemin public (drapeau `visible` absent) : « ✅ » redeviendrait '
        + 'un mensonge possible.');
    }
  });

  /* ⑤ — LE CLIENT CRIE SUR visible:false ET BLOQUE L'ÉDITION SANS DÉTAIL. */
  var appSrc = fs.readFileSync(path.join(RACINE, 'app.js'), 'utf8');
  var nVisible = (appSrc.match(/visible === false/g) || []).length;
  if (nVisible < 2) {
    errors.push('[check-fiches-persistees] ⛔ le client ne traite plus `visible:false` comme un '
      + 'échec sur les DEUX chemins (création + fiche) — trouvé ' + nVisible + ' sur 2. Un '
      + 'succès affiché sur une fiche invisible est le mensonge d\'origine.');
  }
  if (!/édition bloquée/.test(appSrc)) {
    errors.push('[check-fiches-persistees] ⛔ l\'ouverture du formulaire n\'est plus BLOQUÉE '
      + 'quand le détail n\'a pas pu être chargé : un formulaire vide écraserait la vraie '
      + 'description au premier « Enregistrer ».');
  }
  /* …et le bundle réellement servi doit porter les mêmes gardes que la source. */
  var bundleSrc = fs.readFileSync(path.join(RACINE, 'admin.bundle.js'), 'utf8');
  if (!/édition bloquée/.test(bundleSrc)) {
    errors.push('[check-fiches-persistees] ⛔ admin.bundle.js (le fichier SERVI) ne porte pas la '
      + 'garde d\'édition — app.js corrigé mais bundle non régénéré : le client réel garde le '
      + 'défaut. Relancer scripts/extraire-admin.js.');
  }
  return errors;
};

if (require.main === module) {
  module.exports().then(function (errs) {
    if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
    console.log('✅ check-fiches-persistees : ce que l\'admin enregistre survit au rafraîchissement');
  });
}
