/* check-instance-froide.js — UNE HAUSSE DIFFÉRÉE SURVIT À LA MORT DE L'INSTANCE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ LA PANNE (mesurée sur le zip de l'user du 15/08/2026, analyse gravée
   dans docs/ANALYSE-RAFALE-INSTANCE-FROIDE.md) : 415 hausses différées, 14
   appliquées. La fin de rafale et la file des hausses vivaient en mémoire
   d'instance ; Vercel recycle, tout meurt, les prix ne remontent JAMAIS —
   DCF850N servi ~149 € pour un coût du jour de 118,86 €.

   CE QUE CETTE PORTE PROUVE, avec le VRAI handler et une VRAIE instance
   froide (le module est déchargé de require.cache puis rechargé) :
     ① page 1 d'une rafale de 67 : une tuile PLUS CHÈRE que le prix courant
        est DIFFÉRÉE, et l'annonce est écrite dans le document durable ;
     ② l'instance meurt (delete require.cache) — une instance NEUVE arrive,
        l'entrée durable a plus de 30 min (antidatée) : la page suivante doit
        APPLIQUER la hausse — écriture réelle sur l'override, document purgé ;
     ③ sans l'antidate, une page non finale ne doit RIEN appliquer (la hausse
        reste différée — c'est le comportement anti-sur-prix du 11/08).
   ⚠️ Fiche choisie À L'EXÉCUTION dans le catalogue (jamais nommée), prix
   synthétiques. Base factice au gabarit de check-price-watch. */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

module.exports = async function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-instance-froide] ' + m); }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    errors.push('[check-instance-froide] ⛔ préalable : FIREBASE_SERVICE_ACCOUNT posé — '
      + 'la base est factice, un vrai Firestore fausserait la preuve.');
    return errors;
  }

  var CHEMIN_ADMIN = require.resolve(path.join(RACINE, 'api/admin.js'));
  function instanceNeuve() {
    /* ⛔ LA VRAIE INSTANCE FROIDE : on décharge le module. Tout état de module
       (pwCouv, pwHaussesEnAttente) meurt — exactement ce que fait Vercel. */
    delete require.cache[CHEMIN_ADMIN];
    var adm = require(CHEMIN_ADMIN);
    return adm._internals && adm._internals.handlePriceWatch;
  }

  var catJson = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
  var prods = catJson.products || catJson;
  var cible = null;
  for (var i = 0; i < prods.length; i++) {
    var pc = prods[i];
    if (String(pc.brand || '').toUpperCase() !== 'DEWALT') continue;
    if (!pc.sku || pc.priceLocked || pc.hidden || !(Number(pc.price) > 0)) continue;
    if (!/^[A-Z][A-Z0-9.\/-]{2,}[A-Z0-9]$/.test(String(pc.sku)) || !/\d/.test(pc.sku)) continue;
    cible = pc; break;
  }
  ok(!!cible, 'préalable : une fiche DeWALT à réf sûre existe au catalogue');
  if (!cible) return errors;

  var fauxAdmin = { firestore: { FieldValue: {
    serverTimestamp: function () { return { _sentinelle: true }; },
    delete: function () { return { _supprime: true }; } } } };
  function fauxRes() {
    return { code: 0, out: null,
      status: function (c) { this.code = c; return this; },
      json: function (o) { this.out = o; return this; } };
  }
  /* Base factice : mêmes conventions que check-price-watch (config avec
     merge en profondeur, snapshot semé), PLUS `delete()` sur les documents
     config — le rejeu purge la file, la base doit savoir le faire. */
  function fauxDb(seedOv) {
    var snapLib = require(path.join(RACINE, 'api/_lib/snapshot.js'));
    var compte = { configDocs: {}, ecrituresParId: {}, patchsParId: {} };
    for (var ns = 0; ns < snapLib.NB_SHARDS; ns++) {
      compte.configDocs[snapLib.PREFIXE + ns] = { _maj: { _sentinelle: true } };
    }
    Object.keys(seedOv || {}).forEach(function (id) {
      compte.configDocs[snapLib.PREFIXE + snapLib.shardDe(id)][id] =
        JSON.parse(JSON.stringify(seedOv[id]));
    });
    return {
      _compte: compte,
      getAll: function () {
        var refs = Array.prototype.slice.call(arguments);
        return Promise.resolve(refs.map(function (r) {
          var id = r && r._id;
          return { id: id, exists: compte.configDocs[id] !== undefined,
            data: function () { return compte.configDocs[id] || {}; } };
        }));
      },
      batch: function () {
        var ops = [];
        return {
          set: function (ref, donnees) { ops.push({ ref: ref, donnees: donnees }); return this; },
          commit: function () {
            ops.forEach(function (o) { if (o.ref && o.ref.set) o.ref.set(o.donnees); });
            ops = []; return Promise.resolve();
          }
        };
      },
      collection: function (nom) {
        if (nom === 'product_overrides') {
          return {
            get: function () {
              return Promise.resolve({ forEach: function (fn) {
                Object.keys(seedOv).forEach(function (id) {
                  fn({ id: id, data: function () { return JSON.parse(JSON.stringify(seedOv[id])); } });
                });
              } });
            },
            doc: function (id) {
              return { _coll: 'product_overrides', _id: id,
                set: function (patch) {
                  compte.ecrituresParId[id] = (compte.ecrituresParId[id] || 0) + 1;
                  compte.patchsParId[id] = patch;
                  return Promise.resolve();
                } };
            }
          };
        }
        if (nom === 'price_watch_log') {
          return {
            where: function () { return { get: function () {
              return Promise.resolve({ forEach: function () {} });
            }, where: function () { throw new Error('index composite requis'); } }; },
            add: function () { return Promise.resolve(); },
            doc: function () { return { _coll: 'price_watch_log', _id: '(auto)',
              set: function () { return Promise.resolve(); } }; }
          };
        }
        if (nom === 'config') {
          return { doc: function (id) { return {
            _coll: 'config', _id: id,
            get: function () {
              return Promise.resolve({ exists: compte.configDocs[id] !== undefined,
                data: function () { return compte.configDocs[id] || {}; } });
            },
            set: function (patch, opts) {
              var cibleDoc = (opts && opts.merge === false)
                ? {} : Object.assign({}, compte.configDocs[id] || {});
              Object.keys(patch || {}).forEach(function (k) {
                var v = patch[k];
                if (v && v._supprime) { delete cibleDoc[k]; return; }
                if (v && typeof v === 'object' && !Array.isArray(v) && !v._sentinelle
                    && cibleDoc[k] && typeof cibleDoc[k] === 'object' && !Array.isArray(cibleDoc[k])) {
                  cibleDoc[k] = Object.assign({}, cibleDoc[k], v);
                } else { cibleDoc[k] = v; }
              });
              compte.configDocs[id] = cibleDoc;
              return Promise.resolve();
            },
            delete: function () { delete compte.configDocs[id]; return Promise.resolve(); }
          }; } };
        }
        throw new Error('collection inattendue : ' + nom);
      }
    };
  }
  function pageIdealo(sku, prixTxt) {
    var lignes = ['DEWALT ' + sku, 'description outil', '5', '94 offres',
      'à partir de ' + prixTxt + ' €'];
    while (lignes.join('\n').length < 220) {
      lignes.push('ligne de bourrage sans marque ni prix pour le seuil du corps');
    }
    return lignes.join('\n');
  }
  function reqPage(sku, prixTxt) {
    return { method: 'POST',
      query: { type: 'price-watch', brand: 'DEWALT', source: 'idealo', scan: '1' },
      body: { text: pageIdealo(sku, prixTxt) } };
  }

  /* Prix synthétiques : la tuile vaut 4 × le prix courant — la hausse est
     certaine quel que soit le taux de marge du modèle. */
  var cur = Number(cible.price);
  var prixTuile = (Math.round(cur * 4 * 100) / 100).toFixed(2).replace('.', ',');
  var idFiche = String(cible.id);
  var seed = {}; seed[idFiche] = { price: cur };
  var db = fauxDb(seed);
  var DOC = 'pw_hausses_dewalt';

  /* ── ① PAGE 1 : la hausse se diffère ET s'écrit dans le durable ────────── */
  var adm1 = instanceNeuve();
  ok(typeof adm1 === 'function', 'handlePriceWatch exposé via _internals');
  if (typeof adm1 !== 'function') return errors;
  var r1 = fauxRes();
  await adm1(reqPage(cible.sku, prixTuile), r1, fauxAdmin, db);
  var doc1 = db._compte.configDocs[DOC] || {};
  var clesH = Object.keys(doc1).filter(function (k) { return doc1[k] && doc1[k].sku; });
  ok(clesH.length === 1,
    '⛔ page 1 : la hausse différée doit être ÉCRITE dans le document durable — '
    + 'trouvées : ' + clesH.length + ' (415 hausses sont mortes en mémoire le 15/08)');
  ok(!(db._compte.ecrituresParId[idFiche] > 0)
    || !(Number((db._compte.patchsParId[idFiche] || {}).price) > cur),
    '⛔ page 1 (non finale) : la hausse ne doit PAS être appliquée tout de suite — '
    + 'le sur-prix de milieu de rafale du 11/08 reviendrait');

  /* ── ③ page suivante SANS antidate : toujours différée ─────────────────── */
  var adm2 = instanceNeuve();
  var r2 = fauxRes();
  await adm2(reqPage('ZZREFINCONNUE123', '450,00'), r2, fauxAdmin, db);
  ok(!(db._compte.ecrituresParId[idFiche] > 0)
    || !(Number((db._compte.patchsParId[idFiche] || {}).price) > cur),
    '⛔ une entrée FRAÎCHE ne se rejoue pas sur une page non finale — sans le TTL, '
    + 'rejouer trop tôt referait le sur-prix de milieu de rafale');

  /* ── ② ANTIDATE + INSTANCE FROIDE : la hausse DOIT s'appliquer ─────────── */
  var doc2 = db._compte.configDocs[DOC] || {};
  Object.keys(doc2).forEach(function (k) {
    if (doc2[k] && typeof doc2[k] === 'object' && doc2[k].at) {
      doc2[k] = Object.assign({}, doc2[k], { at: doc2[k].at - 31 * 60 * 1000 });
    }
  });
  var adm3 = instanceNeuve();
  var r3 = fauxRes();
  await adm3(reqPage('ZZREFINCONNUE456', '450,00'), r3, fauxAdmin, db);
  var patchFinal = db._compte.patchsParId[idFiche] || {};
  ok(db._compte.ecrituresParId[idFiche] > 0 && Number(patchFinal.price) > cur,
    '⛔ APRÈS la mort de l\'instance, une entrée de plus de 30 min DOIT être '
    + 'appliquée — obtenu : écritures=' + (db._compte.ecrituresParId[idFiche] || 0)
    + ', prix écrit=' + patchFinal.price + ' (courant ' + cur + '). C\'est LA panne '
    + 'des 415/14 : si ceci échoue, les prix ne remontent jamais.');
  var docApres = db._compte.configDocs[DOC];
  ok(!docApres || !Object.keys(docApres).some(function (k) { return docApres[k] && docApres[k].sku; }),
    '⛔ rejouées = retirées : la file durable doit être PURGÉE après le rejeu — '
    + 'sinon chaque page rejouerait les mêmes hausses');

  return errors;
};

if (require.main === module) {
  module.exports().then(function (errs) {
    if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
    console.log('✅ check-instance-froide : une hausse différée survit à la mort de '
      + 'l\'instance — différée page 1, rejouée et APPLIQUÉE après recyclage + TTL, file purgée');
  }).catch(function (e) { console.error('  ❌ [check-instance-froide] plantage : ' + e.message); process.exit(1); });
}
