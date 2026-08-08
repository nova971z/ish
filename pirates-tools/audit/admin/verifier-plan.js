// audit/admin/verifier-plan.js — DÉCOMPTE COLLÉ DE LA COUVERTURE DU PLAN.
//
// Le plan d'action doit référencer CHAQUE constat P0/P1/P2 de l'audit (les P3
// sont des finitions, hors plan). Ce script recompte depuis audit_admin.csv et
// exige que chaque ID P0/P1/P2 apparaisse dans la colonne Refs_audit du plan.
//
//   node audit/admin/verifier-plan.js
'use strict';
var fs = require('fs');
var path = require('path');
var ICI = __dirname;

function lignes(f) {
  return fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r/g, '').split('\n')
    .filter(function (l) { return l.trim() !== ''; }).slice(1);
}

// IDs P0/P1/P2 de l'audit (colonnes : ID;Fichier;Lignes;Axe;Severite;…).
var cibles = [];
lignes('audit_admin.csv').forEach(function (l) {
  var c = l.split(';');
  if (['P0', 'P1', 'P2'].indexOf((c[4] || '').trim()) !== -1) cibles.push((c[0] || '').trim());
});

// Refs référencés par le plan (colonne 4 : Refs_audit, valeurs séparées par ',').
var refs = {};
lignes('plan_action_admin.csv').forEach(function (l) {
  var c = l.split(';');
  (c[3] || '').split(',').forEach(function (r) { r = r.trim(); if (r) refs[r] = 1; });
});

var manquants = cibles.filter(function (id) { return !refs[id]; });
var orphelins = Object.keys(refs).filter(function (id) { return cibles.indexOf(id) === -1; });

console.log('── COUVERTURE DU PLAN D\'ACTION ADMIN ────────────────────────────');
console.log('constats P0/P1/P2 à couvrir : ' + cibles.length);
console.log('IDs référencés par le plan  : ' + Object.keys(refs).length);
var erreurs = [];
if (manquants.length) erreurs.push(manquants.length + ' constat(s) P0/P1/P2 NON planifié(s) : ' + manquants.join(', '));
if (orphelins.length) erreurs.push(orphelins.length + ' réf(s) du plan sans constat P0/P1/P2 : ' + orphelins.join(', '));
if (erreurs.length) {
  console.log('\n❌ ' + erreurs.length + ' problème(s) :');
  erreurs.forEach(function (e) { console.log('  - ' + e); });
  process.exit(1);
}
console.log('\n✅ décompte collé : les ' + cibles.length + ' constats P0/P1/P2 sont TOUS planifiés, aucune réf orpheline.');
