/* check-watch-auth.js — LA PORTE DU TRAQUEUR A-T-ELLE LA BONNE PORTÉE ?
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE CONTRÔLE EXISTE
   Le 31/07/2026, le traqueur de prix est tombé en `401 Invalid admin
   credentials` et **plus aucun prix fournisseur n'a été relevé**. Personne ne
   l'a vu : l'échec était silencieux, et il l'est resté jusqu'à ce que l'user
   compare un prix à la main.

   Cause : A5 avait retiré `ADMIN_SECRET` de Vercel (bonne décision — le claim
   Firebase est plus fort). Mais le raccourci iPad ne s'authentifie QUE par
   secret partagé : un jeton Firebase expire chaque heure, un raccourci ne sait
   pas en fabriquer. La porte s'est refermée sur un usage légitime.

   CE QUE CE CONTRÔLE VÉRIFIE — les deux sens, comme toujours ici :
     1. `WATCH_SECRET` ouvre le traqueur ;
     2. `WATCH_SECRET` n'ouvre RIEN D'AUTRE — surtout pas les commandes ni les
        clients. Une clé qui déborde de sa portée est pire que pas de clé :
        on la croit étroite, elle ne l'est pas ;
     3. une clé fausse est refusée ;
     4. le refus DIT quoi faire. Un « non autorisé » nu a coûté une journée.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');

module.exports = async function () {
  var errors = [];
  var AUTH = path.join(__dirname, '..', 'api', '_lib', 'auth.js');
  var auth;
  try { auth = require(AUTH); } catch (e) {
    return ['check-watch-auth : api/_lib/auth.js illisible — ' + e.message];
  }

  if (typeof auth.requireWatch !== 'function') {
    return ['check-watch-auth : `requireWatch` absent d\'api/_lib/auth.js. '
      + 'Le traqueur retomberait sur requireAdmin, donc sur le 401 qui l\'a '
      + 'fait taire le 31/07.'];
  }

  var avant = { admin: process.env.ADMIN_SECRET, watch: process.env.WATCH_SECRET };
  function req(headers) { return { headers: headers || {} }; }

  try {
    /* ── 1. WATCH_SECRET ouvre le traqueur ─────────────────────────────── */
    process.env.WATCH_SECRET = 'cle-de-controle-1234567890';
    delete process.env.ADMIN_SECRET;
    var ok = await auth.requireWatch(req({ 'x-watch-secret': 'cle-de-controle-1234567890' }));
    if (ok !== null) errors.push('check-watch-auth : la bonne clé x-watch-secret est REFUSÉE — le traqueur reste muet.');

    /* ── 2. une clé fausse est refusée ─────────────────────────────────── */
    var ko = await auth.requireWatch(req({ 'x-watch-secret': 'mauvaise-cle-aaaaaaaaaaa' }));
    if (!ko || ko.status !== 401) errors.push('check-watch-auth : une clé FAUSSE passe. La porte n\'en est pas une.');

    /* ── 3. sans en-tête : refus, et le refus dit quoi faire ───────────── */
    var nu = await auth.requireWatch(req({}));
    if (!nu || nu.status !== 401) errors.push('check-watch-auth : une requête SANS clé passe.');
    else if (!/ABSENT/.test(String(nu.error || ''))) {
      errors.push('check-watch-auth : le refus ne dit pas que l\'en-tête est ABSENT. '
        + '« clé invalide » ne distingue pas « en-tête manquant » de « valeur fausse » : '
        + 'deux causes, deux gestes, et on cherche à l\'aveugle.');
    }

    /* ── 3 bis. l'ancien nom d'en-tête doit être signalé nommément ──────── */
    var vieux = await auth.requireWatch(req({ 'x-admin-secret': 'peu-importe-la-valeur' }));
    if (!vieux || !/ANCIEN nom/.test(String(vieux.error || ''))) {
      errors.push('check-watch-auth : un raccourci resté sur x-admin-secret n\'est pas '
        + 'orienté vers le nouveau nom. C\'est LE cas de migration le plus probable.');
    }

    /* ── 3 ter. ⛔ le refus ne doit JAMAIS contenir le secret attendu ───── */
    var mauvais = await auth.requireWatch(req({ 'x-watch-secret': 'valeur-fausse-mais-longue' }));
    ['cle-de-controle-1234567890'].forEach(function (s) {
      [nu, vieux, mauvais].forEach(function (r) {
        if (r && String(r.error || '').indexOf(s) !== -1) {
          errors.push('check-watch-auth : ⛔ le message de refus CONTIENT le secret attendu. '
            + 'Un message d\'erreur part dans les journaux et sur l\'écran de l\'appelant.');
        }
      });
    });
    if (!mauvais || !/caractères/.test(String(mauvais.error || ''))) {
      errors.push('check-watch-auth : le refus sur valeur fausse ne donne pas la longueur '
        + 'reçue — c\'est le seul indice qui révèle un copier-coller tronqué.');
    }

    /* ── 4. la clé du traqueur n'ouvre PAS l'administration ──────────────
       ⚠️ PREMIER JET FAUSSEMENT VERT : il testait avec `ADMIN_SECRET` absent.
       La voie du secret partagé était alors sautée dans `requireAdmin`, qui
       refusait quoi qu'il arrive — le contrôle ne pouvait PAS voir une fuite.
       Prouvé en rendant `requireAdmin` sensible à `x-watch-secret` : le test
       restait vert. On active donc explicitement la voie admin, avec une clé
       DIFFÉRENTE, pour que le débordement soit visible. */
    process.env.ADMIN_SECRET = 'clef-admin-distincte-abcdefghij';
    var deborde = await auth.requireAdmin(req({ 'x-watch-secret': 'cle-de-controle-1234567890' }));
    if (deborde === null) {
      errors.push('check-watch-auth : ⛔ la clé du TRAQUEUR ouvre l\'ADMINISTRATION. '
        + 'Commandes et clients seraient accessibles avec une clé censée ne '
        + 'servir qu\'aux prix fournisseur.');
    }
    /* et réciproquement : la clé admin ne doit pas être exigée par le traqueur
       quand WATCH_SECRET existe — sinon on aurait rétabli le couplage. */
    var couple = await auth.requireWatch(req({ 'x-admin-secret': 'clef-admin-distincte-abcdefghij' }));
    if (couple === null) {
      errors.push('check-watch-auth : la clé ADMIN ouvre le traqueur alors que '
        + 'WATCH_SECRET est défini — les deux portes restent couplées.');
    }
    delete process.env.ADMIN_SECRET;

    /* ── 5. le message d'erreur nomme la variable à créer ──────────────── */
    delete process.env.WATCH_SECRET;
    delete process.env.ADMIN_SECRET;
    var muet = await auth.requireWatch(req({}));
    if (!muet || !/WATCH_SECRET/.test(String(muet.error || ''))) {
      errors.push('check-watch-auth : le refus ne nomme pas `WATCH_SECRET`. '
        + 'Un « non autorisé » nu a déjà coûté une journée de prix non relevés.');
    }

    /* ── 6. le repli hérité fonctionne tant qu'ADMIN_SECRET existe ─────── */
    process.env.ADMIN_SECRET = 'ancienne-cle-admin-987654321';
    var repli = await auth.requireWatch(req({ 'x-admin-secret': 'ancienne-cle-admin-987654321' }));
    if (repli !== null) {
      errors.push('check-watch-auth : le repli hérité ne marche pas. Un raccourci '
        + 'encore configuré sur x-admin-secret casserait alors qu\'il fonctionnait.');
    }
  } finally {
    if (avant.admin === undefined) delete process.env.ADMIN_SECRET; else process.env.ADMIN_SECRET = avant.admin;
    if (avant.watch === undefined) delete process.env.WATCH_SECRET; else process.env.WATCH_SECRET = avant.watch;
  }

  return errors;
};
