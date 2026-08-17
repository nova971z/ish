/* check-depot-de-reference.js — ON NE CODE QUE DANS LE DÉPÔT DE RÉFÉRENCE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔⛔ RÈGLE DE L'USER, GRAVÉE LE 17/08/2026, MOT POUR MOT :
   « ne jamais rien coder dans ish ! Toujours pousser en master sur
   PIRATES-TOOLS-COM. »

   POURQUOI ELLE EXISTE, ET CE QU'ELLE A COÛTÉ. Le 16/08 on a mesuré que
   `github.com/nova971z/ish` est **PUBLIC** — 12 459 lignes de moteur,
   15 498 lignes de méthode et 57 998 lignes de catalogue avec les coûts,
   lisibles par n'importe qui. Et c'est un **fork** : GitHub interdit d'en
   changer la visibilité. Le code a donc été importé vers un dépôt neuf,
   privé et indépendant. Tout commit poussé dans l'ancien après cet import
   est un commit **republié en clair**, et un commit qui n'arrive pas là où
   l'hébergeur déploie.

   ⚠️ L'ANCIEN DÉPÔT RESTE UTILE, ET C'EST VOULU. L'user l'a délibérément
   laissé accessible à la session pour qu'on puisse VÉRIFIER que le nouveau
   dépôt possède bien tout, et rapatrier ce que l'import n'a pas emporté.
   La règle n'est donc pas « ignorer ish » : c'est **le lire, jamais y écrire**.

   ⇒ Cette porte lit l'adresse de `origin` et refuse tout autre dépôt que celui
   de référence. Tant que la session tourne sur l'ancien, la CI est ROUGE — et
   c'est le comportement juste : un rappel qu'on travaille au mauvais endroit.
   Elle redevient verte d'elle-même dans le bon dépôt, sans qu'on touche à rien.

   ⚠️ CE QU'ELLE NE PRÉTEND PAS FAIRE : elle ne peut pas empêcher un `git push`
   — une porte de CI n'intercepte pas une commande. Elle rend l'erreur VISIBLE
   à chaque exécution, ce qui est le seul levier dont on dispose ici, et c'est dit.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var cp = require('child_process');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* ⛔ LE DÉPÔT DE RÉFÉRENCE, NOMMÉ UNE SEULE FOIS. Le changer est un acte : il
   faut venir ici, donc y penser, donc l'assumer. */
var REFERENCE = 'PIRATES-TOOLS-COM';
var BRANCHE = 'master';
/* L'ancien, nommé pour que le message soit précis plutôt que vague. */
var ANCIEN = 'ish';

/* Pur, donc éprouvable sans dépôt : on lui présente une adresse. */
function evaluer(urlOrigin, branche) {
  var errors = [];
  var avis = [];
  var u = String(urlOrigin || '');

  if (!u) {
    errors.push('[check-depot-de-reference] ⛔ PRÉALABLE : impossible de lire '
      + 'l\'adresse de `origin` — la porte ne peut rien affirmer, et une porte '
      + 'qui ne mesure rien ne garde rien.');
    return { errors: errors, avis: avis };
  }

  /* On compare le NOM du dépôt, pas l'adresse entière : https, ssh, avec ou
     sans `.git`, le nom est le seul invariant. */
  var nom = u.replace(/\.git$/, '').split(/[/:]/).pop();

  if (nom !== REFERENCE) {
    errors.push('[check-depot-de-reference] ⛔⛔ MAUVAIS DÉPÔT — `origin` pointe '
      + 'sur « ' + nom + ' », or le dépôt de référence est « ' + REFERENCE + ' ». '
      + (nom === ANCIEN
        ? 'C\'est l\'ANCIEN dépôt, et il est PUBLIC : tout commit poussé ici est '
          + 'republié en clair, et n\'arrive pas là où l\'hébergeur déploie. '
        : '')
      + '⛔ Règle de l\'user (17/08/2026) : « ne jamais rien coder dans ' + ANCIEN
      + ', toujours pousser en ' + BRANCHE + ' sur ' + REFERENCE + ' ». '
      + '⚠️ Le LIRE reste permis et utile — c\'est ainsi qu\'on rapatrie ce que '
      + 'l\'import n\'a pas emporté. Ce qui est interdit, c\'est d\'y ÉCRIRE.');
  }

  if (branche && branche !== BRANCHE) {
    avis.push('⚠️ branche courante « ' + branche + ' » — la production ne déploie '
      + 'que « ' + BRANCHE + ' ». Un lot fini doit y arriver.');
  }

  return { errors: errors, avis: avis };
}

/* Les témoins de la porte : chaque forme d'adresse, et les deux verdicts. */
function temoins() {
  var errs = [];
  function ok(cond, quoi) {
    if (!cond) errs.push('[check-depot-de-reference] ⛔ TÉMOIN — ' + quoi);
  }
  ok(evaluer('https://github.com/zz/' + REFERENCE, BRANCHE).errors.length === 0,
    'le dépôt de référence en https ne doit rien signaler');
  ok(evaluer('https://github.com/zz/' + REFERENCE + '.git', BRANCHE).errors.length === 0,
    'le suffixe .git ne doit pas changer le verdict');
  ok(evaluer('git@github.com:zz/' + REFERENCE + '.git', BRANCHE).errors.length === 0,
    'la forme SSH ne doit pas changer le verdict');
  ok(evaluer('https://github.com/zz/' + ANCIEN, BRANCHE).errors.length === 1,
    'l\'ANCIEN dépôt doit faire ÉCHOUER');
  ok(/PUBLIC/.test(evaluer('https://github.com/zz/' + ANCIEN, BRANCHE).errors[0] || ''),
    'le message doit DIRE pourquoi l\'ancien est dangereux, pas seulement refuser');
  ok(evaluer('https://github.com/zz/autre-chose', BRANCHE).errors.length === 1,
    'un dépôt inconnu doit ÉCHOUER aussi — la règle vise le bon dépôt, pas seulement l\'ancien');
  ok(evaluer('', BRANCHE).errors.length === 1
    && /PRÉALABLE/.test(evaluer('', BRANCHE).errors[0]),
    'sans adresse lisible, la porte doit ÉCHOUER, jamais verdir à vide');
  ok(evaluer('https://github.com/zz/' + REFERENCE, 'une-autre').avis.length === 1,
    'une branche autre que celle de production doit être SIGNALÉE, sans bloquer');
  return errs;
}

module.exports = function checkDepotDeReference() {
  var errors = temoins();
  var url = '', branche = '';
  try {
    url = cp.execFileSync('git', ['remote', 'get-url', 'origin'],
      { cwd: RACINE, encoding: 'utf8' }).trim();
  } catch (e) { url = ''; }
  try {
    branche = cp.execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: RACINE, encoding: 'utf8' }).trim();
  } catch (e) { branche = ''; }

  var v = evaluer(url, branche);
  v.avis.forEach(function (a) { console.log('[check-depot-de-reference] ' + a); });
  v.errors.forEach(function (e) { errors.push(e); });
  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-depot-de-reference : on travaille bien dans ' + REFERENCE);
  }, function (err) {
    console.error('  ❌ [check-depot-de-reference] harnais mort : ' + err.message);
    process.exit(1);
  });
}
