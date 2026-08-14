#!/usr/bin/env node
/* sabotage-campagne.mjs — SABOTER TOUT, MÉCANIQUEMENT, POUR TROUVER LES TROUS.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI. `outils/sabotage.mjs` sabote UN endroit que J'AI CHOISI. Or je
   choisis les endroits que je soupçonne — donc ceux que j'ai déjà en tête,
   donc ceux qui sont probablement déjà gardés. Les trous, par construction,
   sont là où je ne regarde pas.

   ⇒ Cette campagne ne choisit rien. Elle ÉNUMÈRE mécaniquement chaque décision
   du code (comparaison, seuil, conjonction, négation, alternative d'une
   expression régulière), en retourne UNE à la fois, relance les portes, et
   note ce qui se passe. Trois issues, et une seule est bonne :

     · TUÉE  — une porte rougit. La décision est protégée. ✅
     · SURVIVANTE — tout reste vert alors que le code a changé de sens.
       **C'est un trou** : ce comportement n'est vérifié par rien, et on peut
       le casser sans que personne ne s'en aperçoive. ⛔
     · INERTE — le code ne se charge plus, ou la mutation ne change rien
       d'observable. Ni preuve ni trou : à ignorer, mais compté.

   ⚠️ UNE SURVIVANTE N'EST PAS FORCÉMENT UN DÉFAUT DU PRODUIT. C'est un défaut
   du FILET. La suite du travail consiste à décider, une par une : soit la
   décision compte et il lui faut un témoin, soit elle ne compte pas et on le
   dit. On ne referme jamais une survivante en la supprimant du rapport.

   ⛔ CE QUI PROTÈGE CETTE CAMPAGNE ELLE-MÊME (une campagne qui ment est pire
   que pas de campagne) :
     ① empreinte du fichier relevée AVANT / APRÈS chaque mutation : si la
        substitution n'a rien changé, la mutation est déclarée INERTE, jamais
        « survivante » (sinon un motif qui n'accroche pas passe pour un trou) ;
     ② restauration systématique, VÉRIFIÉE par empreinte — et si elle échoue,
        la campagne s'ARRÊTE net plutôt que de continuer sur un fichier abîmé ;
     ③ un contrôle de référence est lancé AVANT tout : si les portes ne sont
        pas vertes au départ, aucune conclusion n'est possible et on refuse de
        commencer (préalable) ;
     ④ l'échec de LANCEMENT d'une commande n'est pas un échec de contrôle : on
        distingue « code 1 » (porte rouge) de « impossible à exécuter ».

   Usage :
     node outils/sabotage-campagne.mjs --cible <fichier> [--depuis N] [--max N]
                                       [--rapport <fichier.json>] [--lentes]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');

/* ── LES PORTES, ET CE QU'ELLES COÛTENT ────────────────────────────────────
   ⚠️ On sépare les portes RAPIDES des LENTES et on les joue en deux temps :
   la lente (~31 s) n'est payée que pour les mutations qui ont SURVÉCU aux
   rapides. Sans ça, la campagne durerait des heures et ne serait jamais
   lancée — une vérification qu'on ne lance pas ne vérifie rien. */
const PORTES_RAPIDES = [
  'scripts/check-traqueur.js',
  'scripts/check-separation-marques.js',
  'scripts/check-pricing.js',
  'scripts/check-reconstitution.js',
  'scripts/check-composants.js',
  'scripts/check-version-parseur.js',
  'scripts/check-alias-nomenclature.js',
  'scripts/check-nomenclature-milwaukee.js',
  'scripts/check-poids-dewalt.js',
  'scripts/check-fiches-persistees.js',
  'scripts/check-poids-expedie.js',
  'scripts/check-pricing-model.js'
].filter(function (p) { return fs.existsSync(path.join(RACINE, p)); });

const PORTES_LENTES = [
  'scripts/check-price-watch.js'
].filter(function (p) { return fs.existsSync(path.join(RACINE, p)); });

function empreinte(f) {
  return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}

/* Rend `true` si TOUTES les portes passent ; `null` si une porte n'a pas pu
   être LANCÉE (ce n'est pas un résultat). */
function portesVertes(liste) {
  for (const p of liste) {
    try {
      execFileSync(process.execPath, [path.join(RACINE, p)],
        { cwd: RACINE, stdio: 'pipe', timeout: 180000 });
    } catch (e) {
      /* ⛔ On distingue « la porte a dit non » de « la commande n'a pas
         tourné ». Confondre les deux, c'est lire un MODULE_NOT_FOUND comme
         une preuve — l'erreur exacte qui a fait mentir trois sabotages sur
         cinq le 01/08/2026. */
      if (typeof e.status === 'number' && e.status !== 0) return { vert: false, porte: p };
      return { vert: null, porte: p, lancement: String(e.message).slice(0, 120) };
    }
  }
  return { vert: true, porte: null };
}

/* ── LES MUTATIONS : CHAQUE DÉCISION DU CODE, RETOURNÉE UNE FOIS ────────────
   ⚠️ On ne mute que du CODE. Les lignes de commentaire sont exclues : muter
   un commentaire produit une mutation INERTE à coup sûr et noie le rapport.
   ⚠️ On ne mute pas non plus les messages d'erreur (texte entre guillemets) :
   changer un libellé n'est pas changer une décision. */
const OPERATEURS = [
  { nom: 'et-devient-ou', re: /&&/g, vers: '||' },
  { nom: 'ou-devient-et', re: /\|\|/g, vers: '&&' },
  { nom: 'egal-devient-different', re: /===/g, vers: '!==' },
  { nom: 'different-devient-egal', re: /!==/g, vers: '===' },
  { nom: 'superieur-ou-egal-devient-strict', re: />=/g, vers: '>' },
  { nom: 'inferieur-ou-egal-devient-strict', re: /<=/g, vers: '<' },
  { nom: 'negation-retiree', re: /!\(/g, vers: '(' }
];

function lignesDeCode(src) {
  const lignes = src.split('\n');
  const estCode = [];
  let dansBloc = false;
  for (const l of lignes) {
    const t = l.trim();
    let code = true;
    if (dansBloc) code = false;
    if (t.startsWith('/*')) { code = false; if (!t.includes('*/')) dansBloc = true; }
    else if (t.startsWith('*') || t.startsWith('//')) code = false;
    if (dansBloc && t.includes('*/')) dansBloc = false;
    estCode.push(code);
  }
  return estCode;
}

function enumererMutations(src) {
  const lignes = src.split('\n');
  const estCode = lignesDeCode(src);
  const out = [];
  lignes.forEach(function (ligne, i) {
    if (!estCode[i]) return;
    if (!ligne.trim()) return;
    for (const op of OPERATEURS) {
      op.re.lastIndex = 0;
      let m;
      while ((m = op.re.exec(ligne)) !== null) {
        out.push({ ligne: i, colonne: m.index, longueur: m[0].length,
          de: m[0], vers: op.vers, operateur: op.nom, texte: ligne.trim().slice(0, 110) });
      }
    }
    /* Les SEUILS NUMÉRIQUES : un seuil qu'on peut bouger sans conséquence
       n'est pas un seuil. On le décale d'un cran, jamais à zéro (zéro est
       souvent une valeur légitime et la mutation deviendrait inerte). */
    const reNum = /(?<![\w.$])(\d+(?:\.\d+)?)(?![\w.])/g;
    let mn;
    while ((mn = reNum.exec(ligne)) !== null) {
      const v = parseFloat(mn[1]);
      if (!isFinite(v)) continue;
      if (mn[1].length > 6) continue;              /* horodatages, empreintes */
      const nouveau = String(v === 0 ? 1 : (Number.isInteger(v) ? v + 1 : v * 2));
      out.push({ ligne: i, colonne: mn.index, longueur: mn[1].length,
        de: mn[1], vers: nouveau, operateur: 'seuil-decale',
        texte: ligne.trim().slice(0, 110) });
    }
  });
  return out;
}

function appliquer(src, mut) {
  const lignes = src.split('\n');
  const l = lignes[mut.ligne];
  lignes[mut.ligne] = l.slice(0, mut.colonne) + mut.vers + l.slice(mut.colonne + mut.longueur);
  return lignes.join('\n');
}

/* ── LA CAMPAGNE ───────────────────────────────────────────────────────────*/
function main() {
  const args = process.argv.slice(2);
  function opt(n, d) { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }
  const cible = opt('--cible', null);
  if (!cible) {
    console.error('usage: node outils/sabotage-campagne.mjs --cible <fichier> [--depuis N] [--max N] [--rapport f.json] [--lentes]');
    process.exit(2);
  }
  const chemin = path.join(RACINE, cible);
  if (!fs.existsSync(chemin)) {
    console.error('⛔ cible introuvable : ' + cible);
    process.exit(2);
  }
  const depuis = parseInt(opt('--depuis', '0'), 10) || 0;
  const max = parseInt(opt('--max', '100000'), 10);
  const rapport = opt('--rapport', null);
  const avecLentes = args.includes('--lentes');

  const original = fs.readFileSync(chemin, 'utf8');
  const empreinteOrigine = empreinte(chemin);
  const mutations = enumererMutations(original);

  console.log('cible : ' + cible);
  console.log('mutations énumérées : ' + mutations.length
    + ' (fenêtre : ' + depuis + ' → ' + Math.min(depuis + max, mutations.length) + ')');
  console.log('portes rapides : ' + PORTES_RAPIDES.length
    + (avecLentes ? ' · portes lentes : ' + PORTES_LENTES.length + ' (jouées sur les survivantes)' : ' · portes lentes DÉSARMÉES (--lentes pour les jouer)'));

  /* ⛔ PRÉALABLE ① — les portes doivent être VERTES au départ. Si elles sont
     déjà rouges, « rouge après mutation » ne prouverait rien. */
  const ref = portesVertes(PORTES_RAPIDES);
  if (ref.vert !== true) {
    console.error('⛔ PRÉALABLE : les portes ne sont pas vertes AVANT la campagne ('
      + (ref.vert === null ? 'lancement impossible : ' + ref.lancement : 'rouge : ' + ref.porte)
      + '). Aucune mutation ne peut être interprétée.');
    process.exit(2);
  }
  console.log('préalable : portes vertes avant campagne ✅');
  console.log('');

  const resultats = [];
  let tuees = 0, survivantes = 0, inertes = 0;
  const fenetre = mutations.slice(depuis, depuis + max);

  for (let i = 0; i < fenetre.length; i++) {
    const mut = fenetre[i];
    const mute = appliquer(original, mut);
    if (mute === original) {                    /* protection ① */
      inertes++; resultats.push(Object.assign({ issue: 'INERTE', motif: 'substitution sans effet' }, mut));
      continue;
    }
    fs.writeFileSync(chemin, mute);
    let issue, porte = null, motif = null;
    try {
      const r = portesVertes(PORTES_RAPIDES);
      if (r.vert === false) { issue = 'TUEE'; porte = r.porte; }
      else if (r.vert === null) { issue = 'INERTE'; motif = 'porte non lançable : ' + r.lancement; }
      else if (avecLentes && PORTES_LENTES.length) {
        const rl = portesVertes(PORTES_LENTES);
        if (rl.vert === false) { issue = 'TUEE'; porte = rl.porte; }
        else if (rl.vert === null) { issue = 'INERTE'; motif = 'porte lente non lançable'; }
        else issue = 'SURVIVANTE';
      } else issue = 'SURVIVANTE';
    } finally {
      /* protection ② — restauration TOUJOURS, et vérifiée */
      fs.writeFileSync(chemin, original);
      if (empreinte(chemin) !== empreinteOrigine) {
        console.error('⛔⛔ ARRÊT : la restauration de ' + cible + ' a ÉCHOUÉ. '
          + 'Le fichier est peut-être abîmé — vérifier avec git avant toute autre chose.');
        process.exit(3);
      }
    }
    if (issue === 'TUEE') tuees++;
    else if (issue === 'SURVIVANTE') survivantes++;
    else inertes++;
    resultats.push(Object.assign({ issue: issue, porte: porte, motif: motif, index: depuis + i }, mut));
    if (issue === 'SURVIVANTE') {
      console.log('  ⛔ SURVIVANTE  L' + (mut.ligne + 1) + '  ' + mut.operateur
        + ' (' + mut.de + ' → ' + mut.vers + ')  ' + mut.texte);
    }
    if ((i + 1) % 25 === 0) {
      console.log('  … ' + (i + 1) + '/' + fenetre.length + ' — tuées ' + tuees
        + ', survivantes ' + survivantes + ', inertes ' + inertes);
    }
  }

  console.log('');
  console.log('═══ BILAN ' + cible + ' ═══');
  console.log('  tuées       : ' + tuees + '   (décision protégée)');
  console.log('  SURVIVANTES : ' + survivantes + '   (⛔ décision que rien ne vérifie)');
  console.log('  inertes     : ' + inertes + '   (ni preuve ni trou)');
  const jugees = tuees + survivantes;
  if (jugees) {
    console.log('  taux de couverture : ' + Math.round((tuees / jugees) * 100) + '% des décisions jugeables');
  }
  if (rapport) {
    fs.writeFileSync(path.resolve(RACINE, rapport), JSON.stringify(resultats, null, 1));
    console.log('  rapport écrit : ' + rapport);
  }
  /* ⛔ La campagne ne « réussit » pas : elle constate. Le code de sortie dit
     seulement si elle a pu conclure. */
  process.exit(0);
}

main();
