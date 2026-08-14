/* check-poids-dewalt.js — UN POIDS N'ENTRE QU'AVEC SES TROIS SOURCES.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CETTE PORTE EXISTE, ET POURQUOI AVANT QUE LA TABLE SE REMPLISSE.
   Le poids fait le PORT, et le port fait le prix : à coût identique de 500 €,
   2 kg → 661,00 € et 10 kg → 721,50 € (mesuré sur le calculateur du site).
   L'ordre de l'user (14/08/2026) est explicite : « l'information doit être
   recoupée au minimum trois fois ». Une table qui accepterait une entrée à une
   source redeviendrait exactement ce qu'on répare : un chiffre qui a l'air
   mesuré et qui ne l'est pas.
   « Le filet se pose AVANT, jamais après » : cette porte est née avec la table
   VIDE, pour qu'aucune entrée n'ait jamais existé sans elle.

   LES INVARIANTS, ET CE QUE CHACUN COÛTE :
   ① TROIS SOURCES AU MINIMUM par entrée, chacune avec adresse ET valeur.
      Moins, c'est un chiffre estimé présenté comme mesuré — un mensonge.
   ② LE KG RETENU EST DANS L'INTERVALLE DES SOURCES. Un kg hors intervalle n'a
      été lu nulle part : il est inventé, et le port calculé dessus est faux.
   ③ LES SOURCES SONT DES ADRESSES DISTINCTES (trois fois la même page ne
      recoupe rien) et leurs valeurs sont PLAUSIBLES entre elles : un écart de
      plus de 60 % entre la plus basse et la plus haute veut dire qu'on n'a pas
      pesé la même chose (nu contre expédié, autre variante) — l'entrée va dans
      `nonResolues`, jamais dans `poids`.
   ④ AUCUNE VALEUR ABSURDE : 0, négatif, ou plus de 200 kg pour de
      l'électroportatif — c'est une erreur de saisie, pas une mesure.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* Valide UNE table (injectable : les témoins d'en bas prouvent la porte
   faillible sans toucher au fichier réel). Rend la liste des fautes. */
function fautesDeLaTable(table) {
  var fautes = [];
  if (!table || typeof table !== 'object' || !table.poids || typeof table.poids !== 'object') {
    return ['table illisible : pas de champ `poids`'];
  }
  Object.keys(table.poids).forEach(function (r) {
    var e = table.poids[r] || {};
    var kg = Number(e.kg);
    var srcs = Array.isArray(e.sources) ? e.sources : [];
    if (srcs.length < 3) {
      fautes.push(r + ' : ' + srcs.length + ' source(s) — il en faut TROIS au minimum '
        + '(ordre de l\'user : « recoupée au minimum trois fois »)');
      return;
    }
    var urls = {};
    var vals = [];
    var mauvaise = false;
    srcs.forEach(function (s) {
      var u = String((s && s.url) || '').trim();
      var v = Number(s && s.kg);
      if (!/^https?:\/\/.+/.test(u)) { fautes.push(r + ' : une source sans adresse consultable'); mauvaise = true; return; }
      var hote = u.replace(/^https?:\/\//, '').split('/')[0];
      urls[hote] = (urls[hote] || 0) + 1;
      if (!(v > 0)) { fautes.push(r + ' : une source sans valeur relevée'); mauvaise = true; return; }
      vals.push(v);
    });
    if (mauvaise) return;
    if (Object.keys(urls).length < 3) {
      fautes.push(r + ' : les trois sources ne viennent pas de trois SITES distincts — '
        + 'trois lectures du même site ne recoupent rien');
      return;
    }
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max > min * 1.6) {
      fautes.push(r + ' : sources incohérentes entre elles (' + min + ' à ' + max + ' kg, plus de '
        + '60 % d\'écart) — on n\'a pas pesé la même chose ; cette référence va dans '
        + '`nonResolues`, jamais dans `poids`');
      return;
    }
    if (!(kg > 0) || kg > 200) {
      fautes.push(r + ' : kg retenu absurde (' + e.kg + ')');
      return;
    }
    if (kg < min || kg > max) {
      fautes.push(r + ' : kg retenu (' + kg + ') HORS de l\'intervalle des sources [' + min + ', '
        + max + '] — un chiffre lu nulle part est un chiffre inventé');
    }
  });
  return fautes;
}

module.exports = function checkPoidsDewalt() {
  var errors = [];

  /* ══ D'ABORD : LA PORTE SE PROUVE FAILLIBLE SUR DES TÉMOINS ═══════════════
     Chaque invariant a son entrée-piège, qui DOIT être refusée. Sans ces
     témoins, une table vide rendrait la porte verte à vie sans avoir jamais
     rien vérifié. Aucun témoin ne nomme une vraie référence du catalogue. */
  var temoins = [
    { t: { poids: { ZZW1: { kg: 3, sources: [{ url: 'https://a.example/x', kg: 3 },
      { url: 'https://b.example/x', kg: 3 }] } } },
      attendu: /TROIS au minimum/,
      nom: 'deux sources seulement' },
    { t: { poids: { ZZW2: { kg: 9, sources: [{ url: 'https://a.example/x', kg: 3 },
      { url: 'https://b.example/x', kg: 3.1 }, { url: 'https://c.example/x', kg: 3.2 }] } } },
      attendu: /HORS de l'intervalle/,
      nom: 'kg retenu hors des sources' },
    { t: { poids: { ZZW3: { kg: 3, sources: [{ url: 'https://a.example/1', kg: 3 },
      { url: 'https://a.example/2', kg: 3 }, { url: 'https://a.example/3', kg: 3 }] } } },
      attendu: /trois SITES distincts/,
      nom: 'trois pages du même site' },
    { t: { poids: { ZZW4: { kg: 3, sources: [{ url: 'https://a.example/x', kg: 1.2 },
      { url: 'https://b.example/x', kg: 3 }, { url: 'https://c.example/x', kg: 3.1 }] } } },
      attendu: /incohérentes/,
      nom: 'sources qui ne pèsent pas la même chose' },
    { t: { poids: { ZZW5: { kg: 250, sources: [{ url: 'https://a.example/x', kg: 250 },
      { url: 'https://b.example/x', kg: 251 }, { url: 'https://c.example/x', kg: 249 }] } } },
      attendu: /absurde/,
      nom: 'valeur absurde' }
  ];
  temoins.forEach(function (c) {
    var f = fautesDeLaTable(c.t);
    if (!f.length || !c.attendu.test(f.join(' '))) {
      errors.push('[check-poids-dewalt] ⛔⛔ ARGENT : l\'entrée-piège « ' + c.nom + ' » PASSE la '
        + 'validation (fautes rendues : ' + JSON.stringify(f) + '). La porte laisserait entrer '
        + 'un poids non recoupé — un chiffre estimé présenté comme mesuré.');
    }
  });
  /* …et le témoin inverse : une entrée CONFORME passe. Sans lui, « tout
     refuser » satisferait les pièges. */
  var bonne = fautesDeLaTable({ poids: { ZZW9: { kg: 3.1, sources: [
    { url: 'https://a.example/x', kg: 3 }, { url: 'https://b.example/x', kg: 3.1 },
    { url: 'https://c.example/x', kg: 3.2 }] } } });
  if (bonne.length) {
    errors.push('[check-poids-dewalt] ⛔ une entrée à trois sources cohérentes est REFUSÉE ('
      + JSON.stringify(bonne) + ') : la table ne pourrait jamais se remplir.');
  }

  /* ══ PUIS : LES VRAIES TABLES — racines nues ET composants ═══════════════
     Les composants (batteries, chargeurs, coffrets) nourrissent la COMPOSITION
     du poids expédié (api/_lib/poids-expedie.js) : une masse de composant non
     recoupée contaminerait TOUS les packs qui l'utilisent. Mêmes règles. */
  ['data/poids-dewalt.json', 'data/poids-composants-dewalt.json'].forEach(function (fch) {
    var table;
    try { table = JSON.parse(fs.readFileSync(path.join(RACINE, fch), 'utf8')); }
    catch (e) {
      errors.push('[check-poids-dewalt] ⛔ ' + fch + ' illisible : ' + e.message);
      return;
    }
    fautesDeLaTable(table).forEach(function (f) {
      errors.push('[check-poids-dewalt] ⛔⛔ ARGENT (' + fch + ') : ' + f);
    });
  });
  return errors;
};

module.exports.fautesDeLaTable = fautesDeLaTable;

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  var n = 0;
  try { n = Object.keys(JSON.parse(fs.readFileSync(path.join(RACINE, 'data/poids-dewalt.json'), 'utf8')).poids).length; } catch (e) { /* déjà signalé */ }
  console.log('✅ check-poids-dewalt : ' + n + ' entrée(s), toutes à trois sources cohérentes');
}
