#!/usr/bin/env node
/* banc-edition-fiche.js — LE CYCLE COMPLET D'UNE ÉDITION, REJOUÉ HORS LIGNE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CE BANC, ET POURQUOI MAINTENANT. Deux fois de suite, l'user a
   photographié un écran d'échec que je n'avais pas su prévoir :
     · 14/08 : « ✅ » affiché, et tout disparaissait au rafraîchissement ;
     · 15/08 : « modifications écrites mais NON VISIBLES » — cette fois
       l'alarme était FAUSSE, l'écriture était parfaite.
   Les portes existantes éprouvaient les MORCEAUX (le shard, le budget, la
   dérivation) mais jamais la SÉQUENCE : écrire → relire le document →
   répercuter au snapshot → relire par le chemin public → conclure. Or c'est
   la séquence qui décide de ce que l'user voit.

   ⇒ Ce banc rejoue la séquence ENTIÈRE contre une base factice qui applique
   la vraie contrainte de taille, avec la vraie charge de production dans les
   shards, et il vérifie le VERDICT — pas les morceaux.

   ⚠️ Il n'écrit dans aucun service et ne nomme aucune donnée du catalogue :
   références et libellés sont des formes, pas des produits.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');
var RACINE = path.join(__dirname, '..');
var snap = require(path.join(RACINE, 'api/_lib/snapshot.js'));
var verifVis = require(path.join(RACINE, 'api/_lib/verif-visibilite.js'));
var limites = require(path.join(RACINE, 'api/_lib/limites.js'));

var PLAFOND_DOC = 1048576;

/* Base factice COHÉRENTE : ce qu'on écrit se relit, et un document trop gros
   JETTE — comme la vraie. Un simulacre incohérent rend des scénarios que la
   production ne produira jamais (leçon du 10/08/2026). */
function fusionner(existant, ajout) {
  var out = Object.assign({}, existant);
  Object.keys(ajout).forEach(function (k) {
    var v = ajout[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && !v.__delete && !v.__ts
        && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = fusionner(out[k], v);
    } else {
      out[k] = v;
    }
  });
  return out;
}

/* `profond` : la vraie base fusionne les tables imbriquées avec `merge:true`.
   On sait aussi jouer la version PESSIMISTE (fusion de surface) — si le cycle
   tient sous les DEUX, c'est qu'il ne dépend plus d'une subtilité de fusion.
   C'est la seule façon de prouver l'indépendance : la supposer ne suffit pas. */
/* ⛔ UNE BASE NE GARANTIT AUCUN ORDRE DE CLÉS AU RETOUR — et c'est l'un des
   deux pièges qui ont produit la fausse alarme du 15/08. Un simulacre qui
   rend les clés dans l'ordre d'écriture est plus GENTIL que la réalité : il
   laisserait passer une comparaison naïve par `JSON.stringify`. On désordonne
   donc à la lecture (ordre inversé, en profondeur) pour que le banc éprouve
   vraiment la forme canonique — mesuré : sans ça, saboter le tri des clés
   laissait le banc vert. */
function desordonner(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(desordonner);   /* l'ordre d'un tableau porte du sens */
  var out = {};
  Object.keys(v).reverse().forEach(function (k) { out[k] = desordonner(v[k]); });
  return out;
}

function baseFactice(profond) {
  var enProfondeur = profond !== false;
  var docs = {};
  function ref(col, id) {
    var cle = col + '/' + id;
    return {
      id: id,
      set: function (corps, opts) {
        /* ⛔ FUSION EN PROFONDEUR pour les tables imbriquées — c'est ce que
           fait la vraie base avec `merge:true`, et un simulacre qui fusionne
           à plat inventerait des pannes qui n'existent pas (mon premier jet
           annonçait la photo « PERDUE » à la 2e édition : c'était le SIMULACRE
           qui perdait le marqueur, pas la production). */
        var f = (opts && opts.merge)
          ? (enProfondeur ? fusionner(docs[cle] || {}, corps)
            : Object.assign({}, docs[cle] || {}, corps))
          : Object.assign({}, corps);
        Object.keys(f).forEach(function (k) { if (f[k] && f[k].__delete) delete f[k]; });
        if (JSON.stringify(f).length > PLAFOND_DOC) {
          return Promise.reject(new Error('INVALID_ARGUMENT: document exceeds maximum size'));
        }
        docs[cle] = f;
        return Promise.resolve();
      },
      get: function () {
        var d = docs[cle];
        return Promise.resolve({ exists: !!d, id: id,
          data: function () {
            return d ? desordonner(JSON.parse(JSON.stringify(d))) : undefined;
          } });
      }
    };
  }
  return {
    _docs: docs,
    collection: function (col) {
      return { doc: function (id) { return ref(col, id); },
        get: function () {
          var out = [];
          Object.keys(docs).forEach(function (c) {
            if (c.indexOf(col + '/') !== 0) return;
            out.push({ id: c.slice(col.length + 1),
              data: function () { return JSON.parse(JSON.stringify(docs[c])); } });
          });
          return Promise.resolve({ size: out.length, forEach: function (f) { out.forEach(f); } });
        } };
    },
    getAll: function () {
      return Promise.all(Array.prototype.slice.call(arguments).map(function (r) { return r.get(); }));
    }
  };
}
var adminFactice = { firestore: { FieldValue: {
  serverTimestamp: function () { return { __ts: 1 }; },
  delete: function () { return { __delete: 1 }; } } } };

/* ── LA DÉRIVATION DU CATALOGUE, TELLE QU'ELLE EST ÉCRITE EN PRODUCTION ─────
   ⛔ On ne la RÉÉCRIT pas : on la LIT dans api/_lib/catalog.js et on refuse de
   continuer si elle a disparu. Une copie divergerait au premier correctif, et
   le banc validerait alors un comportement qui n'existe plus. */
function derivationPresente() {
  var src = require('fs').readFileSync(path.join(RACINE, 'api/_lib/catalog.js'), 'utf8');
  return /fusion\.img\s*=\s*fusion\.images\[0\]/.test(src)
    && /if\s*\(!fusion\.img\s*&&\s*Array\.isArray\(fusion\.images\)/.test(src)
    /* le filtre des fiches masquées fait partie du chemin public rejoué ici :
       s'il disparaît, le cycle 4 ne prouverait plus rien (il serait vert par
       absence de la contrainte, pas par correction du code). */
    && /\.filter\(function \(p\) \{ return !p\.hidden; \}\)/.test(src);
}
/* ⛔ LE CHEMIN PUBLIC REJOUÉ, FILTRE COMPRIS. `applyOverrides` écarte les
   fiches masquées (`catalog.js`, `.filter(… !p.hidden)`) : une fiche masquée
   n'est PAS servie, et rendre `null` ici est la vérité, pas une commodité.
   C'est précisément ce que la garde doit savoir interpréter — « absente parce
   que masquée » n'est pas « absente parce que l'écriture a échoué ». */
function servirCommeLeCatalogue(fiche, override) {
  var fusion = Object.assign({}, fiche, override);
  if (!fusion.img && Array.isArray(fusion.images) && fusion.images.length) {
    fusion.img = fusion.images[0];
  }
  if (fusion.hidden) return null;
  return fusion;
}

/* ── LA SÉQUENCE RÉELLE D'UNE ÉDITION ──────────────────────────────────────
   L'ordre est celui d'api/admin.js, et il compte : le budget AVANT l'écriture,
   la relecture APRÈS, le snapshot, puis le verdict sur le chemin public. */
async function rejouerEdition(opts) {
  var db = opts.db, id = opts.id, ficheBase = opts.ficheBase, patch = opts.patch;
  var trace = {};
  /* ⛔ `casserSnapshot` REJOUE LA PANNE DU 14/08 : l'écriture du shard échoue
     (document au-delà du plafond), `majSnapshot` avale l'échec — il est
     best-effort — et le catalogue ne voit jamais la fiche. C'est la seule
     façon d'éprouver que la garde sait dire NON : sans un cas où le verdict
     DOIT être « non visible », une garde bloquée sur « visible » traverse le
     banc sans une égratignure (mesuré : sabotage n° 6, resté vert). */
  if (opts.casserSnapshot) {
    var vraie = db;
    db = Object.create(vraie);
    db.collection = function (col) {
      var c = vraie.collection(col);
      if (col !== 'config') return c;
      return Object.assign({}, c, { doc: function (n) {
        return Object.assign({}, c.doc(n), { set: function () {
          return Promise.reject(new Error('INVALID_ARGUMENT: document exceeds maximum size'));
        } });
      } });
    };
    db.getAll = function () { return vraie.getAll.apply(vraie, arguments); };
  }

  /* ① budget — refus AVANT d'écrire, avec les chiffres */
  var avant = await db.collection('product_overrides').doc(id).get();
  var fusionCandidate = Object.assign({}, avant.exists ? avant.data() : {}, patch);
  var budget = limites.docDansLeBudget(fusionCandidate);
  trace.budget = budget;
  if (!budget.ok) return Object.assign({ etape: 'budget', refuse: true }, trace);

  /* ② écriture */
  try { await db.collection('product_overrides').doc(id).set(patch, { merge: true }); }
  catch (e) { return Object.assign({ etape: 'ecriture', refuse: true, erreur: e.message }, trace); }

  /* ③ relecture du document — les champs dérivés n'y sont pas calculés */
  var relu = await db.collection('product_overrides').doc(id).get();
  trace.relu = relu.exists;
  if (!relu.exists) return Object.assign({ etape: 'relecture', refuse: true }, trace);
  var champs = Object.keys(patch).filter(function (k) { return k !== 'updatedAt'; });
  var ecartsDoc = champs.filter(function (k) { return !verifVis.DERIVES[k]; })
    .filter(function (k) {
      return verifVis.canonique(relu.data()[k]) !== verifVis.canonique(patch[k]);
    });
  trace.ecartsDocument = ecartsDoc;
  if (ecartsDoc.length) return Object.assign({ etape: 'relecture', refuse: true }, trace);

  /* ④ répercussion au snapshot — best-effort, mais la valeur est LUE */
  /* ⛔ LE MÊME GESTE QUE LA PRODUCTION : on répercute le DOCUMENT RELU, pas
     le patch (api/admin.js). Un banc qui rejoue autre chose que le code réel
     valide un comportement qui n'existe pas. */
  trace.snapshotOk = await snap.majSnapshot(db, adminFactice, id, relu.data());

  /* ⑤ le chemin public : snapshot d'abord, documents riches ensuite */
  var carte = await snap.lireSnapshot(db);
  if (carte) {
    var riches = Object.keys(carte).filter(function (k) { return carte[k] && carte[k]._riche; });
    if (riches.length) {
      var docsR = await db.getAll.apply(db, riches.map(function (k) {
        return db.collection('product_overrides').doc(k); }));
      docsR.forEach(function (d) { if (d.exists) carte[d.id] = d.data(); });
    }
  }
  /* ⛔ `absenteDuCatalogue` : le cas où `cat.find(...)` ne trouve RIEN alors
     que la fiche n'est PAS masquée — une fiche réellement perdue. Sans ce cas,
     une exemption « masquée » trop large (qui excuserait toute absence)
     traverserait le banc en silence. */
  var servi = opts.absenteDuCatalogue
    ? null
    : servirCommeLeCatalogue(ficheBase, (carte && carte[id]) || null);
  /* ⛔ LE VERDICT VIENT DU MODULE PARTAGÉ, PAS D'UNE COPIE LOCALE. Si le banc
     décidait lui-même, il validerait sa propre logique et non celle que sert
     `api/admin.js` — un banc qui s'auto-approuve ne prouve rien. */
  var v = verifVis.verdictVisibilite(patch, servi, champs, relu.data());
  trace.absents = v.absents;
  trace.visible = v.visible;
  trace.masquee = v.masquee;
  trace.servi = servi;
  return Object.assign({ etape: 'verdict', refuse: false }, trace);
}

module.exports = { baseFactice: baseFactice, adminFactice: adminFactice,
  rejouerEdition: rejouerEdition, servirCommeLeCatalogue: servirCommeLeCatalogue,
  derivationPresente: derivationPresente, PLAFOND_DOC: PLAFOND_DOC };

/* ⛔ LE CYCLE SE REJOUE SOUS LES DEUX FUSIONS, ET C'EST LE CŒUR DU BANC.
   Mon premier jet annonçait la photo « PERDUE » à la 2e édition. La cause
   était le SIMULACRE — il fusionnait à plat — pas la production. J'ai corrigé
   le simulacre ; mais « le banc est vert parce que je l'ai rendu indulgent »
   est exactement le piège que ce projet paie depuis des semaines. Alors on
   joue les DEUX : en profondeur (ce que fait réellement `merge:true`) ET à
   plat (l'hypothèse pessimiste). Vert des deux côtés, la séquence ne dépend
   plus d'une subtilité de fusion — démontré, pas supposé. */
async function jouerCycles(profond) {
    var db = baseFactice(profond);
    /* la charge réelle d'un shard en production : ~425 relevés de prix */
    var charge = { _maj: { __ts: 1 } };
    for (var i = 0; i < 425; i++) {
      charge['zz-prix-' + i] = { price: 100 + i, priceSrcTTC: 90 + i, priceSource: 'zz',
        priceSources: { zz: { ttc: 90 + i, vuLe: 1 } }, note: new Array(560).join('p') };
    }
    var ID = 'zz-fiche-banc';
    await db.collection('config').doc(snap.PREFIXE + snap.shardDe(ID)).set(charge, { merge: false });

    var PHOTO = 'data:image/webp;base64,' + new Array(450001 - 23).join('A');
    var base = { id: ID, sku: 'ZZB1', title: 'Fiche de banc', price: 199,
      img: 'images/posters/zz-ancien.webp', category: 'ZZCAT' };

    console.log('══ CYCLE 1 — ajouter une photo, une description et des caractéristiques');
    var r1 = await rejouerEdition({ db: db, id: ID, ficheBase: base, patch: {
      images: [PHOTO], img: null, desc: 'courte', description_long: new Array(3001).join('d'),
      specs: { poids: '2,4 kg', tension: '18 V' },
      features: ['Moteur brushless sans charbon'] } });
    console.log('   budget ................ ' + r1.budget.octets + ' / ' + r1.budget.budget
      + ' -> ' + (r1.budget.ok ? 'accepté' : 'REFUSÉ'));
    console.log('   document relu ......... ' + (r1.relu ? 'oui' : 'NON')
      + ', écarts : ' + JSON.stringify(r1.ecartsDocument || []));
    console.log('   snapshot répercuté .... ' + r1.snapshotOk);
    console.log('   VERDICT ............... ' + (r1.visible ? 'VISIBLE ✅' : 'NON VISIBLE ⛔')
      + '  absents : ' + JSON.stringify(r1.absents || []));
    console.log('   vignette servie ....... '
      + (r1.servi && r1.servi.img === PHOTO ? 'la photo (dérivée) ✅'
        : 'INATTENDUE : ' + String(r1.servi && r1.servi.img).slice(0, 40)));
    console.log('   description servie .... '
      + (r1.servi && String(r1.servi.description_long || '').length === 3000 ? 'entière ✅' : 'PERDUE ⛔'));

    console.log('');
    console.log('══ CYCLE 2 — une SECONDE édition sur la même fiche (le rafraîchissement)');
    var r2 = await rejouerEdition({ db: db, id: ID, ficheBase: base,
      patch: { desc: 'modifiée une seconde fois' } });
    console.log('   VERDICT ............... ' + (r2.visible ? 'VISIBLE ✅' : 'NON VISIBLE ⛔')
      + '  absents : ' + JSON.stringify(r2.absents || []));
    console.log('   la photo du cycle 1 ... '
      + (r2.servi && r2.servi.img === PHOTO ? 'toujours là ✅' : 'PERDUE ⛔'));

    console.log('');
    console.log('══ CYCLE 3 — une photo TROP LOURDE doit être refusée AVANT d\'écrire');
    var ENORME = 'data:image/webp;base64,' + new Array(1000001 - 23).join('A');
    var r3 = await rejouerEdition({ db: db, id: ID, ficheBase: base,
      patch: { images: [ENORME], img: null } });
    console.log('   étape ................. ' + r3.etape
      + '  -> ' + (r3.refuse ? 'REFUSÉ ✅' : 'accepté ⛔')
      + (r3.budget ? ' (' + r3.budget.octets + ' octets, dépassement ' + r3.budget.depassement + ')' : ''));

    console.log('');
    console.log('══ CYCLE 4 — éditer une fiche MASQUÉE ne doit pas crier à la panne');
    var IDM = 'zz-fiche-masquee';
    await db.collection('product_overrides').doc(IDM).set(
      { sku: 'ZZB2', title: 'Fiche masquée', price: 149, hidden: true }, { merge: true });
    var r4 = await rejouerEdition({ db: db, id: IDM,
      ficheBase: { id: IDM, sku: 'ZZB2', title: 'Fiche masquée', price: 149, category: 'ZZCAT' },
      patch: { desc: 'une description sur une fiche masquée' } });
    console.log('   masquée reconnue ...... ' + (r4.masquee ? 'oui ✅' : 'NON ⛔'));
    console.log('   VERDICT ............... ' + (r4.visible ? 'pas d\'alarme ✅' : 'FAUSSE ALARME ⛔')
      + '  absents : ' + JSON.stringify(r4.absents || []));

    console.log('');
    console.log('══ CYCLE 5 — LA GARDE DOIT SAVOIR DIRE NON (la panne du 14/08 rejouée)');
    var IDP = 'zz-fiche-panne';
    var r5 = await rejouerEdition({ db: db, id: IDP, casserSnapshot: true,
      ficheBase: { id: IDP, sku: 'ZZB3', title: 'Fiche en panne', price: 129, category: 'ZZCAT' },
      patch: { images: [PHOTO], img: null, desc: 'photo ajoutée pendant la panne' } });
    console.log('   snapshot répercuté .... ' + r5.snapshotOk + ' (échec attendu)');
    console.log('   VERDICT ............... ' + (r5.visible === false ? 'NON VISIBLE ✅ (la garde alerte)'
      : 'VISIBLE ⛔ — LA GARDE NE SAIT PAS DIRE NON')
      + '  absents : ' + JSON.stringify(r5.absents || []));

    console.log('');
    console.log('══ CYCLE 6 — une fiche VRAIMENT perdue n\'est pas excusable');
    var IDA = 'zz-fiche-perdue';
    var r6 = await rejouerEdition({ db: db, id: IDA, absenteDuCatalogue: true,
      ficheBase: { id: IDA, sku: 'ZZB4', title: 'Fiche perdue', price: 89, category: 'ZZCAT' },
      patch: { desc: 'une description qui n\'arrivera jamais au public' } });
    console.log('   masquée ? ............. ' + (r6.masquee ? 'oui ⛔ (elle ne l\'est pas)' : 'non ✅'));
    console.log('   VERDICT ............... ' + (r6.visible === false
      ? 'NON VISIBLE ✅ (l\'absence n\'est pas excusée)'
      : 'VISIBLE ⛔ — UNE FICHE PERDUE PASSE POUR SERVIE')
      + '  absents : ' + JSON.stringify(r6.absents || []));

    var ok = r1.visible && r2.visible && r3.refuse && r3.etape === 'budget'
      && r4.visible && r4.masquee
      && r5.visible === false && r5.snapshotOk === false
      && r6.visible === false && r6.masquee === false;
    console.log('');
    console.log(ok ? '   ✅ le cycle tient : on écrit, on relit, le public voit.'
      : '   ⛔ le cycle NE tient pas — voir les verdicts ci-dessus.');
    return ok;
}

if (require.main === module) {
  (async function () {
    if (!derivationPresente()) {
      console.error('⛔ PRÉALABLE : la dérivation de vignette a disparu de api/_lib/catalog.js — '
        + 'le banc rejouerait un comportement qui n\'existe plus.');
      process.exit(2);
    }
    var bilan = [];
    var MODES = [
      { profond: true, nom: 'fusion EN PROFONDEUR (ce que fait la vraie base)' },
      { profond: false, nom: 'fusion À PLAT (hypothèse pessimiste)' }
    ];
    for (var m = 0; m < MODES.length; m++) {
      console.log('');
      console.log('████ ' + MODES[m].nom);
      console.log('');
      bilan.push(await jouerCycles(MODES[m].profond));
    }
    var tout = bilan.every(Boolean);
    console.log('');
    console.log(tout
      ? '✅ LES DEUX FUSIONS TIENNENT — la séquence ne dépend pas de la sémantique de fusion.'
      : '⛔ ÉCHEC : ' + bilan.map(function (b, i) {
        return MODES[i].nom + ' -> ' + (b ? 'ok' : 'ROUGE'); }).join(' · '));
    process.exit(tout ? 0 : 1);
  })();
}
