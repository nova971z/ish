/* outils/corriger-fiches.mjs — RÉPARER LES FICHES QUI NE PORTENT PAS LA BONNE
   RÉFÉRENCE, ET RETIRER CELLES QUI N'EN PORTENT AUCUNE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   Les 931 fiches importées depuis idealo l'ont été avec un parseur qui lisait
   mal certains titres. Le parseur a été corrigé le 05/08/2026 ; les fiches,
   elles, gardent la référence qu'on leur a donnée ce jour-là. Mesuré en
   relisant le titre SOURCE de chacune avec le parseur corrigé : 34 fiches
   portent une référence que leur propre titre ne dit pas.

   ⛔ POURQUOI C'EST UN PROBLÈME D'ARGENT, ET PAS DE RANGEMENT. Le traqueur
   apparie une annonce à une fiche PAR LA RÉFÉRENCE. Une fiche dont la
   référence n'existe nulle part ne sera jamais réalignée : elle gardera pour
   toujours le prix qu'on lui a mis à l'import. Or plusieurs de ces prix
   viennent d'une annonce qui vendait DEUX produits — « Kit Premium 8 Outils
   XR 18V **&** Coffret de 100 Pièces » à 2 278 € s'est retrouvé sur une fiche
   nommée d'après le coffret de forets. Et « Kit de conversion du tube
   d'extrusion **pour** DCE560 » a donné la carte DCE560 à 198,13 €, alors que
   le pistolet nu se trouve à 244,86 € — c'est exactement ce que l'user avait
   signalé le 04/08 : « t'es en train d'inventer ».

   ─────────────────────────────────────────────────────────────────────────
   CE QUE L'OUTIL REFUSE

   ⛔ Il n'agit que sur les SKU écrits dans le fichier de décisions, un par un,
      chacun avec son motif. Aucune règle automatique ne supprime de fiche :
      supprimer est irréversible, ça se décide à la pièce.
   ⛔ Il refuse de renommer vers un SKU déjà pris — ce serait fabriquer le
      doublon qu'on cherche à éliminer.
   ⛔ Il refuse d'agir sur une fiche absente : une décision qui ne trouve pas
      sa cible est signalée, jamais avalée en silence.
   ⛔ Il ne touche JAMAIS à une fiche d'une autre marque que celle déclarée.
      « on ne touche pas à ma Makita ».
   ⚠️ `--essai` dit tout ce qu'il ferait sans rien écrire. C'est le mode par
      défaut de la prudence : on lit le rapport, puis on relance sans.

   USAGE
     node outils/corriger-fiches.mjs <decisions.json> [--essai]

   FORMAT DU FICHIER DE DÉCISIONS
     { "marque": "DeWALT",
       "retirer":  [ { "sku": "…", "motif": "…" } ],
       "renommer": [ { "sku": "…", "vers": "…", "motif": "…" } ] }
   ───────────────────────────────────────────────────────────────────────── */
import { RACINE } from '../tests/_socle.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
const essai = args.includes('--essai');
if (!source) {
  console.error('usage : node outils/corriger-fiches.mjs <decisions.json> [--essai]');
  process.exit(2);
}

const decisions = JSON.parse(await readFile(source, 'utf8'));
const marque = String(decisions.marque || '').toUpperCase();
if (!marque) { console.error('⛔ le fichier de décisions doit nommer la MARQUE'); process.exit(2); }

const chemin = join(RACINE, 'products.json');
const brut = JSON.parse(await readFile(chemin, 'utf8'));
const enveloppe = !Array.isArray(brut);
const produits = enveloppe ? brut.products : brut;

const parSku = new Map();
produits.forEach((p) => parSku.set(String(p.sku || '').toUpperCase(), p));

const faits = [], refus = [];
function estMaMarque(p) { return String(p.brand || '').toUpperCase() === marque; }

/* ── RENOMMAGES D'ABORD : un retrait pourrait libérer un SKU, et on ne veut
   pas que l'ordre des décisions change le résultat. ─────────────────────── */
const aRenommer = decisions.renommer || [];
const aRetirer = decisions.retirer || [];
const skusRetires = new Set(aRetirer.map((d) => String(d.sku || '').toUpperCase()));

aRenommer.forEach((d) => {
  const de = String(d.sku || '').toUpperCase(), vers = String(d.vers || '').toUpperCase();
  const p = parSku.get(de);
  if (!p) { refus.push([de, 'renommer', 'aucune fiche ne porte ce SKU']); return; }
  if (!estMaMarque(p)) { refus.push([de, 'renommer', 'fiche ' + p.brand + ' — hors marque déclarée']); return; }
  if (!vers) { refus.push([de, 'renommer', 'destination vide']); return; }
  if (parSku.has(vers) && !skusRetires.has(vers)) {
    refus.push([de, 'renommer', 'le SKU ' + vers + ' est DÉJÀ pris — renommer fabriquerait un doublon']);
    return;
  }
  p.sku = d.vers;
  parSku.delete(de); parSku.set(vers, p);
  faits.push([de, 'renommé en ' + d.vers, d.motif || '']);
});

const gardes = [];
produits.forEach((p) => {
  const s = String(p.sku || '').toUpperCase();
  if (!skusRetires.has(s)) { gardes.push(p); return; }
  if (!estMaMarque(p)) {
    refus.push([s, 'retirer', 'fiche ' + p.brand + ' — hors marque déclarée']);
    gardes.push(p); return;
  }
  const d = aRetirer.find((x) => String(x.sku || '').toUpperCase() === s);
  faits.push([s, 'retirée', (d && d.motif) || '']);
});
aRetirer.forEach((d) => {
  const s = String(d.sku || '').toUpperCase();
  if (!produits.some((p) => String(p.sku || '').toUpperCase() === s)) {
    refus.push([s, 'retirer', 'aucune fiche ne porte ce SKU']);
  }
});

const l = (x) => console.log(x);
l('');
l('═══ CORRECTION DES FICHES ' + marque + (essai ? '  — ESSAI, RIEN N\'EST ÉCRIT' : '') + ' ═══');
l('');
l('  fiches au catalogue .......... ' + produits.length);
l('  renommées .................... ' + faits.filter((f) => /^renommé/.test(f[1])).length);
l('  retirées ..................... ' + faits.filter((f) => f[1] === 'retirée').length);
l('  décisions REFUSÉES ........... ' + refus.length);
l('  fiches après correction ...... ' + gardes.length);
l('');
faits.forEach((f) => l('  · ' + f[0].padEnd(16) + f[1].padEnd(26) + f[2]));
if (refus.length) {
  l('');
  l('  ⛔ REFUSÉES — rien n\'a été fait pour celles-ci :');
  refus.forEach((r) => l('     ' + r[0].padEnd(16) + r[1].padEnd(12) + r[2]));
}
l('');

if (!essai) {
  const sortie = enveloppe ? Object.assign({}, brut, { products: gardes }) : gardes;
  await writeFile(chemin, JSON.stringify(sortie, null, 2) + '\n', 'utf8');
  l('  products.json réécrit.');
  l('');
}
process.exit(refus.length ? 1 : 0);
