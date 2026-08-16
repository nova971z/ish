/* check-cartographie.js — LA CARTE NE PEUT PLUS SE PÉRIMER EN SILENCE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔⛔ POURQUOI CETTE PORTE EXISTE. Mesuré le 16/08/2026 : `CARTOGRAPHIE.md`
   annonçait **207 produits** alors que le catalogue en tient **1 708** (×8,2),
   et **12 contrôles** alors que `scripts/` en compte **64**. Sa dernière mise à
   jour de fond datait du 09/08. Les 26 modules de `api/_lib/` n'y figuraient
   pas du tout, et rien n'y décrivait le traqueur.

   ⛔ CE QUE ÇA COÛTE, ET CE N'EST PAS THÉORIQUE. L'user a posé la règle le
   même jour : « aucun travail à l'aveugle n'est toléré ». Or **une carte
   périmée est un travail à l'aveugle qui s'ignore** — pire qu'une carte
   absente, parce qu'on lui fait confiance. Un chiffre faux dans la carte se
   propage : il devient une supposition dans un diagnostic, puis une
   affirmation dans un compte rendu.

   ⇒ Cette porte relit les chiffres SUR LE DISQUE et les compare à ce que la
   carte affirme. Un écart fait rougir la CI. La carte n'est plus un document
   qu'on met à jour quand on y pense : c'est un document que le dépôt vérifie.

   ⚠️ CE QU'ELLE NE PRÉTEND PAS FAIRE : elle ne juge pas la PROSE. Une carte
   peut être à jour sur ses chiffres et fausse sur ses explications. Elle
   vérifie ce qui est vérifiable mécaniquement — le reste reste un travail
   humain, et c'est dit.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* ⛔ CHAQUE ENTRÉE : un compteur RÉEL lu sur le disque, et le motif qui, dans
   la carte, doit porter ce nombre. Le motif capture le chiffre pour qu'on
   puisse dire l'écart, jamais juste « faux ». */
function compteurs() {
  var lireDossier = function (rel, filtre) {
    var abs = path.join(RACINE, rel);
    if (!fs.existsSync(abs)) return null;
    return fs.readdirSync(abs).filter(filtre).length;
  };
  var produits = null;
  try {
    /* ⚠️ Le catalogue vit à la RACINE, pas dans `data/` — vérifié dans
       `api/_lib/catalog.js` avant d'écrire ce chemin, jamais supposé. */
    var brut = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
    produits = Array.isArray(brut) ? brut.length
      : (Array.isArray(brut && brut.products) ? brut.products.length : null);
  } catch (e) { produits = null; }

  return [
    { clef: 'produits au catalogue', reel: produits,
      motif: /##\s*7\.\s*products\.json[^\n(]*\((\d[\d\s]*)\s*produits/,
      ou: 'docs/CARTOGRAPHIE.md, titre de la section 7' },
    { clef: 'contrôles de CI (scripts/check-*.js)',
      reel: lireDossier('scripts', function (f) { return /^check-.*\.js$/.test(f); }),
      motif: /##\s*6\.\s*scripts\/ci\.js\s*—\s*(\d+)\s*contr/,
      ou: 'docs/CARTOGRAPHIE.md, titre de la section 6' },
    { clef: 'points d\'entrée api/*.js',
      reel: lireDossier('api', function (f) { return /\.js$/.test(f); }),
      motif: /##\s*4\.\s*api\/\s*—\s*(\d+)\s*endpoints/,
      ou: 'docs/CARTOGRAPHIE.md, titre de la section 4' }
  ];
}

/* Pur, donc éprouvable : on lui présente un texte et des compteurs. */
function evaluer(texte, liste) {
  var errors = [];
  var vus = 0;
  (liste || []).forEach(function (c) {
    if (c.reel === null || c.reel === undefined) {
      errors.push('[check-cartographie] ⛔ impossible de COMPTER « ' + c.clef
        + ' » sur le disque : la porte ne peut rien affirmer, et une porte qui '
        + 'ne mesure rien ne garde rien.');
      return;
    }
    var m = String(texte || '').match(c.motif);
    if (!m) {
      errors.push('[check-cartographie] ⛔ la carte ne dit plus combien de « '
        + c.clef + ' » il y a (' + c.ou + '). Un chiffre retiré n\'est pas un '
        + 'chiffre juste : soit on l\'écrit, soit on retire aussi cette porte.');
      return;
    }
    vus += 1;
    var annonce = parseInt(String(m[1]).replace(/\s/g, ''), 10);
    if (annonce !== c.reel) {
      errors.push('[check-cartographie] ⛔ CARTE PÉRIMÉE — « ' + c.clef
        + ' » : la carte annonce ' + annonce + ', le disque en compte '
        + c.reel + ' (' + c.ou + '). Une carte périmée est un travail à '
        + 'l\'aveugle qui s\'ignore : on lui fait confiance.');
    }
  });
  /* ⛔ PRÉALABLE — si aucun motif n'a accroché, la porte est verte sans avoir
     rien comparé. C'est le « repli poli » que la règle mère interdit. */
  if (vus === 0 && (liste || []).length > 0 && errors.length === 0) {
    errors.push('[check-cartographie] ⛔ PRÉALABLE : aucun chiffre de la carte '
      + 'n\'a été retrouvé — la porte serait verte sans avoir rien comparé.');
  }
  return errors;
}

/* Les témoins de la porte elle-même : chaque branche, sur un texte construit. */
function temoins() {
  var errs = [];
  function ok(cond, quoi) { if (!cond) errs.push('[check-cartographie] ⛔ TÉMOIN — ' + quoi); }
  var m = [{ clef: 'zz', reel: 7, motif: /ZZCOMPTE\s*=\s*(\d+)/, ou: 'essai' }];
  ok(evaluer('ZZCOMPTE = 7', m).length === 0,
    'un chiffre JUSTE ne doit rien signaler');
  ok(evaluer('ZZCOMPTE = 9', m).length === 1
    && /PÉRIMÉE/.test(evaluer('ZZCOMPTE = 9', m)[0]),
    'un chiffre FAUX doit rougir');
  ok(evaluer('rien ici', m).length === 1
    && /ne dit plus combien/.test(evaluer('rien ici', m)[0]),
    'un chiffre RETIRÉ doit rougir — sinon il suffirait de l\'effacer pour verdir');
  ok(evaluer('ZZCOMPTE = 7', [{ clef: 'zz', reel: null, motif: /x/, ou: 'essai' }]).length === 1,
    'un compteur qu\'on ne sait pas lire sur le disque doit rougir, jamais passer');
  ok(evaluer('ZZCOMPTE = 7 000', [{ clef: 'zz', reel: 7000, motif: /ZZCOMPTE\s*=\s*([\d\s]+)/, ou: 'e' }]).length === 0,
    'un nombre écrit avec une espace fine (7 000) doit être lu comme 7000');
  return errs;
}

module.exports = function checkCartographie() {
  var errors = temoins();
  var f = path.join(RACINE, 'docs/CARTOGRAPHIE.md');
  if (!fs.existsSync(f)) {
    errors.push('[check-cartographie] ⛔ `docs/CARTOGRAPHIE.md` a disparu — '
      + 'c\'est la carte de vol du dépôt, et le protocole §0 impose de la lire.');
    return errors;
  }
  var chaine = path.join(RACINE, 'docs/CHAINE-TRAQUEUR.md');
  if (!fs.existsSync(chaine)) {
    errors.push('[check-cartographie] ⛔ `docs/CHAINE-TRAQUEUR.md` a disparu — '
      + 'c\'est la description de la chaîne traqueur/parseur/calculateur que le '
      + 'protocole §0 impose de lire avant d\'y toucher.');
  }
  var texte = fs.readFileSync(f, 'utf8');
  evaluer(texte, compteurs()).forEach(function (e) { errors.push(e); });
  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-cartographie : les chiffres de la carte tiennent face au disque');
  }, function (err) {
    console.error('  ❌ [check-cartographie] harnais mort : ' + err.message);
    process.exit(1);
  });
}
