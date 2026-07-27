/* =========================================================================
   check-horaires.js — HORAIRES DE SERVICE DES LIVREURS
   =========================================================================
   Deux calculs existent forcément : le SERVEUR décide (api/_lib/courses.js),
   le NAVIGATEUR affiche (app.js). S'ils divergent, un livreur est annoncé
   « en service » d'un côté et refusé de l'autre — le pire des états.

   Ce contrôle fait deux choses :
     1. il vérifie la LOGIQUE elle-même sur les cas limites (fuseau de la
        Guadeloupe, plage à cheval sur minuit, 24 h/24, horaires absents) ;
     2. il rejoue EXACTEMENT les mêmes cas contre le code CLIENT extrait
        d'app.js, et exige le même verdict.

   ⏰ Le piège central : ce serveur tourne en UTC, la Guadeloupe est à UTC−4
   et ne change JAMAIS d'heure. Sans conversion, un livreur « 08:00–18:00 »
   serait vu en service de 04:00 à 14:00.

   Lancement : node scripts/check-horaires.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };

module.exports = async function () {
  const problems = [];
  let srv;
  try {
    srv = require(path.join(ROOT, 'api', '_lib', 'courses.js'));
  } catch (e) {
    return ['[check-horaires] Impossible de charger api/_lib/courses.js : ' + (e && e.message)];
  }

  // ── Extraction du calcul CLIENT depuis app.js ───────────────────────────
  let app;
  try { app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'); }
  catch (e) { return ['[check-horaires] Impossible de lire app.js : ' + (e && e.message)]; }

  function extraire(nom) {
    const i = app.indexOf('function ' + nom + '(');
    if (i < 0) return null;
    let d = 0;
    const j = app.indexOf('{', i);
    for (let k = j; k < app.length; k++) {
      if (app[k] === '{') d++;
      else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
    }
    return null;
  }
  const offset = app.match(/var LV_TZ_GP_OFFSET = (-?\d+);/);
  const morceaux = ['lvHhmmEnMinutes', 'lvMinutesLocalesGP', 'lvDansPlageHoraire', 'lvEnService', 'lvHorairesTxt']
    .map((n) => ({ n, code: extraire(n) }));
  const manquants = morceaux.filter((m) => !m.code).map((m) => m.n);
  if (!offset || manquants.length) {
    problems.push('le calcul des horaires est introuvable dans app.js ('
      + (!offset ? 'LV_TZ_GP_OFFSET' : manquants.join(', ')) + ') : la parité avec le '
      + 'serveur ne peut plus être vérifiée.');
    return problems.map((m) => '[check-horaires] ' + m);
  }

  const bac = { resultat: null };
  vm.createContext(bac);
  vm.runInContext(offset[0] + '\n' + morceaux.map((m) => m.code).join('\n'), bac);
  const clientEnService = (c, now) => vm.runInContext(
    'lvEnService(' + JSON.stringify(c) + ', new Date(' + now.getTime() + '))', bac);

  // ── Les cas qui comptent ───────────────────────────────────────────────
  // Rappel : 14:00 UTC = 10:00 en Guadeloupe ; 02:00 UTC = 22:00 la veille.
  const CAS = [
    { t: '2026-07-27T14:00:00Z', c: { available: true, hDebut: '08:00', hFin: '18:00' }, attendu: true,
      quoi: '10 h locales, plage 08–18 → en service' },
    { t: '2026-07-27T14:00:00Z', c: { available: true, hDebut: '12:00', hFin: '18:00' }, attendu: false,
      quoi: '10 h locales, plage 12–18 → PAS encore en service' },
    { t: '2026-07-27T14:00:00Z', c: { available: false, hDebut: '08:00', hFin: '18:00' }, attendu: false,
      quoi: 'interrupteur coupé → jamais en service, même dans la plage' },
    { t: '2026-07-27T14:00:00Z', c: { available: true }, attendu: true,
      quoi: 'aucun horaire renseigné → l\'interrupteur seul décide' },
    { t: '2026-07-27T12:00:00Z', c: { available: true, hDebut: '08:00', hFin: '18:00' }, attendu: true,
      quoi: '08 h locales pile = début de plage → en service (borne incluse)' },
    { t: '2026-07-27T22:00:00Z', c: { available: true, hDebut: '08:00', hFin: '18:00' }, attendu: false,
      quoi: '18 h locales pile = fin de plage → PLUS en service (borne exclue)' },
    { t: '2026-07-28T02:00:00Z', c: { available: true, hDebut: '22:00', hFin: '02:00' }, attendu: true,
      quoi: '22 h locales, plage de nuit 22–02 → en service' },
    { t: '2026-07-28T05:00:00Z', c: { available: true, hDebut: '22:00', hFin: '02:00' }, attendu: true,
      quoi: '01 h locale, plage de nuit 22–02 → toujours en service' },
    { t: '2026-07-28T10:00:00Z', c: { available: true, hDebut: '22:00', hFin: '02:00' }, attendu: false,
      quoi: '06 h locales, plage de nuit 22–02 → hors service' },
    { t: '2026-07-27T14:00:00Z', c: { available: true, hDebut: '09:00', hFin: '09:00' }, attendu: true,
      quoi: 'début = fin → 24 h/24' },
    { t: '2026-07-27T14:00:00Z', c: { available: true, hDebut: '25:00', hFin: '18:00' }, attendu: true,
      quoi: 'heure invalide → traitée comme absente, pas comme un refus' },
    // ⚠️ LE CAS QUI PROUVE LE FUSEAU : sans conversion UTC−4, ce test passerait
    // au vert à tort (04:00 UTC serait lu « 04:00 » et non « 00:00 locales »).
    { t: '2026-07-27T04:00:00Z', c: { available: true, hDebut: '03:00', hFin: '06:00' }, attendu: false,
      quoi: 'minuit locales (04 h UTC), plage 03–06 → hors service (piège du fuseau)' },
    // ⚠️ « 00:00 » vaut 0 minute, et 0 est FAUX en JavaScript. Un test de
    // vérité au lieu d'une comparaison à null fait disparaître minuit.
    { t: '2026-07-27T14:00:00Z', c: { available: true, hDebut: '00:00', hFin: '23:30' }, attendu: true,
      quoi: 'plage 00:00–23:30 → en service (piège du zéro qui vaut faux)' },
    { t: '2026-07-27T14:00:00Z', c: { available: true, hDebut: '00:00', hFin: '06:00' }, attendu: false,
      quoi: 'plage 00:00–06:00 à 10 h locales → hors service' }
  ];

  LOG('\n' + '━'.repeat(74));
  LOG('  HORAIRES DE SERVICE — logique serveur et parité avec le navigateur');
  LOG('━'.repeat(74));

  CAS.forEach((cas) => {
    const now = new Date(cas.t);
    const s = srv.enService(cas.c, now);
    const cl = clientEnService(cas.c, now);
    const okLogique = (s === cas.attendu);
    const okParite = (s === cl);
    LOG('  ' + (okLogique && okParite ? '✅' : '❌') + ' ' + cas.quoi
      + '  [serveur ' + s + ' · navigateur ' + cl + ']');
    if (!okLogique) {
      problems.push('horaires — ' + cas.quoi + ' : le serveur répond ' + s
        + ', attendu ' + cas.attendu + '.');
    }
    if (!okParite) {
      problems.push('horaires — DIVERGENCE serveur/navigateur sur « ' + cas.quoi
        + ' » : serveur ' + s + ', navigateur ' + cl + '. Un livreur serait annoncé '
        + 'disponible d\'un côté et refusé de l\'autre.');
    }
  });

  // Le décalage doit être le MÊME des deux côtés.
  const offClient = parseInt(offset[1], 10);
  const okOffset = (offClient === srv.TZ_GP_OFFSET);
  LOG('  ' + (okOffset ? '✅' : '❌') + ' même décalage horaire des deux côtés (UTC'
    + (srv.TZ_GP_OFFSET >= 0 ? '+' : '') + srv.TZ_GP_OFFSET + ')');
  if (!okOffset) {
    problems.push('le décalage horaire diffère : serveur UTC' + srv.TZ_GP_OFFSET
      + ', navigateur UTC' + offClient + '.');
  }

  // Le libellé des horaires doit survivre à minuit (même piège du zéro).
  const libelle = (c) => vm.runInContext('lvHorairesTxt(' + JSON.stringify(c) + ')', bac);
  const okMinuit = libelle({ hDebut: '00:00', hFin: '23:30' }) === '00:00 – 23:30';
  const okVide = libelle({}) === '';
  LOG('  ' + (okMinuit && okVide ? '✅' : '❌')
    + ' les horaires commençant à MINUIT restent affichés (0 ne vaut pas « absent »)');
  if (!okMinuit) problems.push('lvHorairesTxt efface une plage commençant à 00:00 : le zéro '
    + 'est traité comme une absence d\'horaire.');
  if (!okVide) problems.push('lvHorairesTxt affiche quelque chose sans horaires.');

  // Normalisation : une heure invalide ne doit jamais être enregistrée.
  const n1 = srv.sanitizeHoraires({ hDebut: '08:00', hFin: '18:00' });
  const n2 = srv.sanitizeHoraires({ hDebut: '8h', hFin: '18:00' });
  const n3 = srv.sanitizeHoraires(null);
  const okNorm = n1.hDebut === '08:00' && n1.hFin === '18:00'
    && n2.hDebut === '' && n2.hFin === '' && n3.hDebut === '' && n3.hFin === '';
  LOG('  ' + (okNorm ? '✅' : '❌') + ' seules des heures valides sont enregistrées');
  if (!okNorm) problems.push('sanitizeHoraires laisse passer une heure invalide.');

  LOG('\n' + (problems.length ? '  ❌ ' + problems.length + ' défaut(s).' : '  ✅ Horaires conformes.'));
  LOG('');

  return problems.map((m) => '[check-horaires] ' + m);
};

if (VERBOSE) {
  module.exports().then((p) => process.exit(p.length ? 1 : 0));
}
