// audit/admin/verifier-exhaustivite.js — PORTE D'EXHAUSTIVITÉ DE LA CARTOGRAPHIE.
//
// Mission de cartographie (lecture seule). Ce script PROUVE que l'inventaire
// n'a rien échantillonné : il recompte le périmètre depuis le CODE et exige que
// chaque fonction/branche du périmètre apparaisse dans les CSV, avec un
// Fichier:Lignes non vide sur CHAQUE ligne. Le décompte est collé à la sortie.
//
//   node audit/admin/verifier-exhaustivite.js
'use strict';
var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..', '..');

function lire(f) { return fs.readFileSync(path.join(RACINE, f), 'utf8'); }
function existe(f) { try { fs.accessSync(path.join(RACINE, f)); return true; } catch (e) { return false; } }

// ── Périmètre RÉEL, recompté depuis le code ───────────────────────────────
// 1) admin.bundle.js : fonctions top-level (les 69 extraites).
var bundle = lire('admin.bundle.js');
var topLevel = (bundle.match(/^function [a-zA-Z][\w$]*\s*\(/gm) || [])
  .map(function (s) { return s.replace(/^function\s+/, '').replace(/\s*\(.*/, ''); });
// 2) app.visitor.js : helpers admin gardés + amorces.
var visitor = lire('app.visitor.js');
var GARDES = ['getAdminSecret', 'setAdminSecret', 'adminAuthHeaders', 'adminReadResponse',
  'adminNetworkError', 'adminGet', 'adminPostType', 'destroyAdminGlobe',
  'afficherPorteAdmin', 'porteAdmin', 'adminLoginTemplate', 'renderAdmin', 'renderAjoutProduit'];
var gardesPresents = GARDES.filter(function (n) {
  return new RegExp('function\\s+' + n + '\\s*\\(').test(visitor);
});
// 3) api/admin.js : branches de routage (type===...) + méthodes génériques.
var apiAdmin = lire('api/admin.js');
var typeBranches = {};
(apiAdmin.match(/type\s*===\s*'([^']+)'/g) || []).forEach(function (m) {
  typeBranches[m.replace(/.*'([^']+)'.*/, '$1')] = 1;
});
(apiAdmin.match(/typeDemande\s*===\s*'([^']+)'/g) || []).forEach(function (m) {
  typeBranches[m.replace(/.*'([^']+)'.*/, '$1')] = 1;
});
var branchesPerimetre = Object.keys(typeBranches).sort();

// ── Lecture des CSV livrés ────────────────────────────────────────────────
function lignesCsv(f) {
  if (!existe(f)) return null;
  var brut = lire(f).replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
  return brut.slice(1); // sans l'en-tête
}
function colonne(ligne, index) { return (ligne.split(';')[index] || '').trim(); }

var erreurs = [];
var ADMIN = 'audit/admin/inventaire_admin.csv';
var CALC = 'audit/admin/inventaire_calculs.csv';
var STATS = 'audit/admin/inventaire_stats.csv';
var TRAQ = 'audit/admin/traqueur_parseur.md';

// Chaque CSV : Fichier (col 2) et Lignes (col 3) non vides, Lignes ~ \d+(-\d+)?.
function verifFichierLignes(f, colFichier, colLignes) {
  var rows = lignesCsv(f);
  if (rows === null) { erreurs.push(f + ' : ABSENT'); return 0; }
  rows.forEach(function (l, i) {
    var fic = colonne(l, colFichier), lig = colonne(l, colLignes);
    if (!fic) erreurs.push(f + ' ligne ' + (i + 2) + ' : colonne Fichier VIDE');
    // Un intervalle `N` ou `N-M`, éventuellement suivi d'un renvoi vers le vrai
    // corps du handler « (handler N-M) » — les deux portent un Fichier:Lignes réel.
    if (!/^\d+(-\d+)?( \(handler \d+-\d+\))?$/.test(lig)) erreurs.push(f + ' ligne ' + (i + 2) + ' : Lignes « ' + lig + ' » n\'est pas un intervalle');
  });
  return rows.length;
}

// inventaire_admin.csv : ID;Ecran_ou_Fonction;Fichier;Lignes;...
var nAdmin = verifFichierLignes(ADMIN, 2, 3);
// inventaire_calculs.csv : ID;Calcul;Fichier;Lignes;...
var nCalc = verifFichierLignes(CALC, 2, 3);
// inventaire_stats.csv : ID;Statistique_affichee;Fichier;Lignes;...
var nStats = verifFichierLignes(STATS, 2, 3);

// ── Décompte collé : chaque fonction top-level du bundle apparaît dans l'admin CSV
var adminTexte = existe(ADMIN) ? lire(ADMIN) : '';
var manquantes = topLevel.filter(function (n) { return adminTexte.indexOf(n) === -1; });
if (manquantes.length) erreurs.push('inventaire_admin : ' + manquantes.length + ' fonction(s) top-level du bundle ABSENTE(S) : ' + manquantes.join(', '));
var gardesManquants = gardesPresents.filter(function (n) { return adminTexte.indexOf(n) === -1; });
if (gardesManquants.length) erreurs.push('inventaire_admin : helper(s) visiteur absent(s) : ' + gardesManquants.join(', '));
var branchesManquantes = branchesPerimetre.filter(function (t) { return adminTexte.indexOf(t) === -1; });
if (branchesManquantes.length) erreurs.push('inventaire_admin : branche(s) api/admin.js absente(s) : ' + branchesManquantes.join(', '));

if (!existe(TRAQ)) erreurs.push(TRAQ + ' : ABSENT');

// ── Bilan ─────────────────────────────────────────────────────────────────
console.log('── EXHAUSTIVITÉ CARTOGRAPHIE ADMIN ──────────────────────────────');
console.log('admin.bundle.js  : ' + topLevel.length + ' fonctions top-level (attendu 69)');
console.log('app.visitor.js   : ' + gardesPresents.length + ' helpers/amorces admin (attendu 13)');
console.log('api/admin.js     : ' + branchesPerimetre.length + ' branches type=== distinctes');
console.log('inventaire_admin : ' + nAdmin + ' lignes');
console.log('inventaire_calculs: ' + nCalc + ' lignes');
console.log('inventaire_stats : ' + nStats + ' lignes');
if (erreurs.length) {
  console.log('\n❌ ' + erreurs.length + ' problème(s) :');
  erreurs.forEach(function (e) { console.log('  - ' + e); });
  process.exit(1);
}
console.log('\n✅ décompte collé : tout le périmètre est inventorié, chaque ligne porte Fichier:Lignes.');
