#!/usr/bin/env node
'use strict';
/* ══ LE TOTAL D'UN BALAYAGE, CALCULÉ SUR LE FICHIER DES RÉPONSES ═════════════
   `node scripts/bilan-balayage.js <fichier> [pagesAttendues]`

   ⛔ POURQUOI CE SCRIPT EXISTE. Le cumul rendu par l'API vit dans la mémoire
   d'UNE instance serverless. Sur ses quatre balayages du 03/08 il a rendu 64,
   65 puis 53 pages sur 67 — sans qu'aucune page ne soit arrivée vide
   (`pagesRefusees: 0`). Une instance neuve au milieu du balayage suffit à
   produire ce chiffre : le compteur repart de zéro et rend le nombre de pages
   DE LA FIN. Un total qui dépend de l'instance qui l'a compté n'est pas un
   total, c'est un reliquat.

   ⛔ CE FICHIER-CI NE DÉPEND DE RIEN. Chaque réponse porte sa propre ligne
   `page: { empreinte, tuiles, lues }` — locale, sans mémoire. Le raccourci
   enregistre les 67 réponses dans un fichier ; on les additionne ici. Le
   résultat est le même quelles que soient les instances traversées.

   ⛔ ON COMPTE LES PAGES DIFFÉRENTES, PAS LES RÉPONSES. Deux réponses de même
   empreinte sont la même page envoyée deux fois : elle compte une fois dans
   les pages, et ses tuiles ne sont comptées qu'une fois — sinon le total des
   produits lus gonflerait sans qu'un seul produit de plus ait été vu.
   ⚠️ Les DOUBLONS DE PRODUIT à l'intérieur d'une page, eux, comptent : c'est
   sa règle, mot pour mot — « même si sur la même page il existe deux fois le
   même produit, on doit lire les 60 produits de chaque page ».

   ⚠️ Portes lues avant d'écrire : J3 — le script lit un fichier local de
   compteurs et d'empreintes, aucune donnée personnelle, rien n'est envoyé
   nulle part ; J4 — aucun prix n'entre dans ce calcul, il ne peut donc pas
   fabriquer un prix de référence ; J5 — aucune TVA, aucun octroi de mer. */

const fs = require('fs');
const path = require('path');

/* Extrait les objets JSON de premier niveau d'un texte, quelle qu'en soit la
   mise en forme : un tableau, des objets collés, un par ligne, ou séparés par
   n'importe quoi. Le raccourci de l'user écrit ce qu'il veut — on s'adapte à
   son fichier, on ne lui impose pas un format.
   ⚠️ On respecte les chaînes et les échappements : une accolade dans un titre
   ne doit pas ouvrir un objet. */
function objetsJson(texte) {
  const out = [];
  let i = 0;
  while (i < texte.length) {
    if (texte[i] !== '{') { i++; continue; }
    let prof = 0, dansChaine = false, echap = false, j = i;
    for (; j < texte.length; j++) {
      const c = texte[j];
      if (dansChaine) {
        if (echap) echap = false;
        else if (c === '\\') echap = true;
        else if (c === '"') dansChaine = false;
        continue;
      }
      if (c === '"') { dansChaine = true; continue; }
      if (c === '{') prof++;
      else if (c === '}') { prof--; if (!prof) break; }
    }
    if (prof !== 0) break;                 // accolade jamais refermée : on s'arrête
    try { out.push(JSON.parse(texte.slice(i, j + 1))); } catch (e) { /* pas du JSON */ }
    i = j + 1;
  }
  return out;
}

function bilan(objets, pagesAttendues) {
  const pages = Object.create(null);      // empreinte → { tuiles, lues, vues }
  let sansEmpreinte = 0, sansLignePage = 0, refus = 0;
  const instances = Object.create(null);

  objets.forEach((o) => {
    if (!o || typeof o !== 'object') return;
    if (o.ok === false) { refus++; return; }
    const c = o.couverture;
    if (c && c.instance) instances[String(c.instance)] = 1;
    const p = o.page;
    if (!p || typeof p !== 'object') { sansLignePage++; return; }
    const tuiles = Math.max(0, parseInt(p.tuiles, 10) || 0);
    const lues = Math.max(0, parseInt(p.lues, 10) || 0);
    /* ⛔ UNE PAGE SANS EMPREINTE N'EST PAS JETÉE — elle est comptée à part et
       ses tuiles entrent quand même. La jeter ferait DISPARAÎTRE des produits
       lus ; l'ignorer en silence serait pire encore. Elle porte une clé qui ne
       peut se confondre avec aucune empreinte. */
    const clef = p.empreinte ? String(p.empreinte) : ('sans-empreinte-' + (sansEmpreinte++));
    if (!pages[clef]) pages[clef] = { tuiles: 0, lues: 0, vues: 0 };
    pages[clef].vues++;
    // Une page revue n'apporte rien de neuf : on garde le relevé le plus complet.
    pages[clef].tuiles = Math.max(pages[clef].tuiles, tuiles);
    pages[clef].lues = Math.max(pages[clef].lues, lues);
  });

  const clefs = Object.keys(pages);
  let tuiles = 0, lues = 0, doublons = 0;
  clefs.forEach((k) => {
    tuiles += pages[k].tuiles; lues += pages[k].lues;
    doublons += pages[k].vues - 1;
  });
  const attendues = Math.max(0, parseInt(pagesAttendues, 10) || 0);

  return {
    reponsesLues: objets.length,
    reponsesEnErreur: refus,
    reponsesSansLignePage: sansLignePage,
    pagesDifferentes: clefs.length,
    pagesEnvoyeesDeuxFois: doublons,
    pagesSansEmpreinte: sansEmpreinte,
    pagesAttendues: attendues || null,
    pagesManquantes: attendues ? Math.max(0, attendues - clefs.length) : null,
    tuilesVues: tuiles,
    produitsLus: lues,
    /* ⛔ LE RATIO EST LA PREUVE, PAS LE TOTAL. 60 tuiles par page, c'est ce
       qu'il exige. Un total flatteur obtenu sur 53 pages ne vaut rien ; le
       ratio, lui, dit tout de suite si une page est arrivée tronquée. */
    tuilesParPage: clefs.length ? Math.round((tuiles / clefs.length) * 100) / 100 : null,
    partLue: tuiles ? Math.round((lues / tuiles) * 1000) / 10 : null,
    instances: Object.keys(instances)
  };
}

function principal(argv) {
  const fichier = argv[0];
  if (!fichier) {
    console.error('usage : node scripts/bilan-balayage.js <fichier> [pagesAttendues]');
    return 2;
  }
  let texte;
  try { texte = fs.readFileSync(path.resolve(fichier), 'utf8'); } catch (e) {
    console.error('❌ fichier illisible : ' + e.message);
    return 2;
  }
  const objets = objetsJson(texte);
  if (!objets.length) {
    console.error('❌ aucun objet JSON trouvé dans ' + fichier
      + ' — le raccourci a-t-il bien enregistré les RÉPONSES ?');
    return 1;
  }
  const b = bilan(objets, argv[1]);
  console.log('');
  console.log('═══ BILAN DU BALAYAGE — ' + path.basename(fichier) + ' ═══');
  console.log('');
  console.log('  réponses lues .................. ' + b.reponsesLues
    + (b.reponsesEnErreur ? '  (dont ' + b.reponsesEnErreur + ' en erreur)' : ''));
  if (b.reponsesSansLignePage) {
    console.log('  ⚠️ sans ligne `page` ........... ' + b.reponsesSansLignePage
      + '  — réponses ANTÉRIEURES au déploiement qui l\'ajoute : non comptées');
  }
  console.log('  pages DIFFÉRENTES .............. ' + b.pagesDifferentes
    + (b.pagesAttendues ? ' sur ' + b.pagesAttendues : ''));
  if (b.pagesEnvoyeesDeuxFois) console.log('  pages envoyées deux fois ....... ' + b.pagesEnvoyeesDeuxFois);
  if (b.pagesSansEmpreinte) console.log('  pages sans empreinte ........... ' + b.pagesSansEmpreinte);
  console.log('');
  console.log('  TUILES VUES (produits affichés) . ' + b.tuilesVues);
  console.log('  PRODUITS LUS ET CLASSÉS ......... ' + b.produitsLus
    + (b.partLue !== null ? '  (' + b.partLue + ' %)' : ''));
  console.log('  tuiles par page ................. ' + b.tuilesParPage);
  if (b.instances.length > 1) {
    console.log('');
    console.log('  ⚠️ ' + b.instances.length + ' INSTANCES ont répondu à ce balayage : le cumul');
    console.log('     rendu par l\'API est éclaté entre elles et NE FAIT PAS FOI.');
    console.log('     Le total ci-dessus, lui, est calculé sur les réponses.');
  }
  console.log('');
  if (b.pagesManquantes) {
    console.log('❌ ' + b.pagesManquantes + ' page(s) ne sont JAMAIS arrivées jusqu\'ici.');
    console.log('   Ce ne sont pas des pages tronquées : ce sont des pages absentes du');
    console.log('   fichier. À relancer.');
    return 1;
  }
  console.log('✅ Les ' + b.pagesDifferentes + ' pages du plan sont dans le fichier.');
  return 0;
}

module.exports = { objetsJson: objetsJson, bilan: bilan };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
