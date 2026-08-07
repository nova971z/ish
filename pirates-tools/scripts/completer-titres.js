#!/usr/bin/env node
'use strict';
/* ══ DONNER UN VRAI TITRE AUX FICHES QUI N'EN ONT PAS ════════════════════════
   `node scripts/completer-titres.js [--marque DeWALT] [--confirmer]`

   ⛔ POURQUOI. L'user, 07/08/2026 : « le problème il vient de toi, tu n'as pas
   ajouté les titres correctement ». Mesuré sur le catalogue : une fiche DeWALT
   sur deux porte un titre qui ne décrit RIEN — « DeWALT DWK1203T — DWK1203T »,
   jusqu'à 12 311 € l'unité. Personne n'achète une carte pareille, et personne
   ne peut vérifier qu'elle correspond au bon produit.

   ⛔ D'OÙ VIENT LE TITRE, ET DE NULLE PART AILLEURS. Il est repris tel quel de
   l'annonce marchande relevée dans `archives/idealo/idealo-classe.json`. On
   n'invente pas une description : soit l'annonce en porte une, soit la fiche
   reste muette et elle est comptée à part.

   ⛔⛔ ET LA VARIANTE DOIT CORRESPONDRE. C'est la même leçon que pour les prix :
   `racineModele` rend DCS572 pour la scie NUE comme pour le pack 2×5 Ah. Coller
   le titre de l'un sur la fiche de l'autre écrirait « avec 2 batteries 5 Ah »
   sur une machine livrée nue — un mensonge sur ce qu'on vend, donc de l'argent.
   La clé d'appariement porte donc la variante ET le rayon, exactement comme
   `aligner-prix-idealo.js`.

   ⚠️ UN TITRE QUI NE DÉCRIT RIEN NE REMPLACE PAS UN TITRE QUI NE DÉCRIT RIEN.
   Beaucoup d'annonces s'appellent « DEWALT DCH334X2-QW » : reprendre celle-là
   ne changerait rien. On exige donc que le titre candidat porte de la LANGUE —
   des mots hors référence, hors marque, hors unités.

   ⛔ ESSAI PAR DÉFAUT. `--confirmer` pour écrire, sauvegarde avant.

   ⚠️ Portes lues : J3 — annonces publiques, aucune donnée personnelle ;
   J4 — aucun prix touché ; J5 — aucune TVA. */

const fs = require('fs');
const path = require('path');
const priceParse = require('../api/_lib/price-parse.js');
const aligner = require('./aligner-prix-idealo.js');

const RACINE = path.join(__dirname, '..');

/* Un titre DÉCRIT quand il reste des mots une fois retirés la marque, la
   référence, les nombres et les unités. Trois mots suffisent à reconnaître un
   produit ; deux ne suffisent pas — « Kit DeWALT » n'apprend rien. */
function decrit(titre, sku, marque) {
  const t = priceParse.sansAccentsTitre(String(titre || '')).toUpperCase();
  const sansRef = t
    .replace(new RegExp(String(sku || 'x').replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'), 'g'), ' ')
    .replace(new RegExp(String(marque || 'x').toUpperCase(), 'g'), ' ');
  const mots = sansRef.split(/[^A-Z]+/).filter((m) => m.length >= 3
    && !/^(XR|LOT|SET|KIT|MAX|NEW|PRO|LI|ION|AH|MM|CM|KG|VOLT|TSTAK|QW|XJ|QZ|QS|GB)$/.test(m));
  return mots.length >= 3;
}

function principal(argv) {
  const iM = argv.indexOf('--marque');
  const marque = iM !== -1 ? argv[iM + 1] : 'DeWALT';
  const confirmer = argv.indexOf('--confirmer') !== -1;

  const fClasse = path.join(RACINE, 'archives', 'idealo', 'idealo-classe.json');
  if (!fs.existsSync(fClasse)) {
    console.error('⛔ ' + fClasse + ' absent : lancer d\'abord scripts/classer-idealo.js');
    return 2;
  }
  const annonces = JSON.parse(fs.readFileSync(fClasse, 'utf8')).produits || [];

  /* Index des titres DESCRIPTIFS, par la même clé que les coûts. À clé égale,
     on garde le titre le plus riche : c'est celui qui apprend le plus. */
  const parCle = new Map();
  annonces.forEach((e) => {
    const ref = e.sku || (e.car && (e.car.sku || e.car.skuEclate)) || '';
    if (!ref || !e.titre) return;
    if (!decrit(e.titre, ref, marque)) return;
    const k = priceParse.racineModele(String(ref).toUpperCase())
      + '|' + (e.variante || '') + '|' + (e.rayonCommercial || '');
    const prec = parCle.get(k);
    if (!prec || String(e.titre).length > prec.length) parCle.set(k, String(e.titre));
  });

  const fCat = path.join(RACINE, 'products.json');
  const brut = JSON.parse(fs.readFileSync(fCat, 'utf8'));
  const tous = Array.isArray(brut) ? brut : (brut.products || []);
  const miennes = tous.filter(
    (p) => String(p.brand || '').toUpperCase() === marque.toUpperCase());

  const muettes = miennes.filter((p) => !decrit(p.title || p.name, p.sku, marque));
  const faits = [], restent = [], refuses = [];
  muettes.forEach((p) => {
    const cle = aligner.cleFiche(p);
    const titre = parCle.get(cle);
    if (!titre) { restent.push(p); return; }
    /* ⛔⛔ ARGENT ET HONNÊTETÉ : UN TITRE QUI NOMME UNE AUTRE RÉFÉRENCE MENT.
       Défaut attrapé sur ma propre sortie d'essai, le 07/08/2026 :
         · DPC10RC-QS allait recevoir « Compresseur de montage DPC10QTC-QS » —
           deux compresseurs différents, même racine DPC10 ;
         · DCS367NT-XJ, qui est la version EN COFFRET, allait recevoir
           « DCS367N-XJ — Scie sabre compacte (machine seule) ».
       La clé racine+variante ne suffit pas quand le titre de la fiche est
       muet : la variante ne peut alors se lire nulle part, et deux
       déclinaisons tombent dans le même panier. On relit donc la référence
       ÉCRITE dans le titre candidat, et on refuse dès qu'elle diffère de celle
       de la fiche — suffixe de région mis à part, lui seul ne compte pas. */
    const lue = priceParse.lireReferenceDuTitre(titre, marque).ref;
    if (lue && priceParse.racineRef(String(lue).toUpperCase())
      !== priceParse.racineRef(String(p.sku).toUpperCase())) {
      refuses.push({ p: p, titre: titre, lue: lue });
      return;
    }
    faits.push({ p: p, avant: p.title, apres: titre });
  });

  const l = (s) => console.log(s);
  l('');
  l('═══ TITRES — ' + marque.toUpperCase() + (confirmer ? '' : '   ESSAI, RIEN N\'EST ÉCRIT') + ' ═══');
  l('');
  l('  fiches ' + marque + ' ...................... ' + miennes.length);
  l('  · dont le titre NE DÉCRIT RIEN ....... ' + muettes.length);
  l('  titres descriptifs disponibles ....... ' + parCle.size + ' clés');
  l('');
  l('  REMPLISSABLES ........................ ' + faits.length);
  l('  REFUSÉS (le titre nomme une AUTRE réf) ' + refuses.length);
  l('  restent muettes (aucune annonce) ..... ' + restent.length);
  l('');
  refuses.forEach((r) => l('   ⛔ ' + String(r.p.sku).padEnd(16) + 'refusé : le titre dit '
    + r.lue + ' — « ' + String(r.titre).slice(0, 58) + ' »'));
  if (refuses.length) l('');
  faits.slice(0, 12).forEach((f) => l('   · ' + String(f.p.sku).padEnd(16)
    + String(f.apres).slice(0, 84)));
  l('');

  if (!confirmer) {
    l('  ⚠️ ESSAI — --confirmer pour écrire.');
    l('');
    return 0;
  }
  const sauve = path.join(RACINE, 'archives', 'products-avant-titres.json');
  fs.mkdirSync(path.dirname(sauve), { recursive: true });
  fs.writeFileSync(sauve, JSON.stringify(brut, null, 1));
  faits.forEach((f) => {
    f.p.title = f.apres;
    f.p.name = f.apres;
    if (f.p.ficheAcompleter) delete f.p.ficheAcompleter;
  });
  fs.writeFileSync(fCat, JSON.stringify(brut, null, 1));
  l('  ✅ ' + faits.length + ' titres repris de l\'annonce marchande');
  l('  sauvegarde : ' + path.relative(RACINE, sauve));
  l('');
  return 0;
}

module.exports = { decrit: decrit };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
