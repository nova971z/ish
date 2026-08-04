#!/usr/bin/env node
'use strict';
/* ══ TRIER LES ARCHIVES — CE QUI VAUT D'ÊTRE GARDÉ, ET CE QUI NE VAUT RIEN ═══
   `node scripts/trier-archives.js [--confirmer]`

   ⛔ RÈGLE DE L'USER, 04/08, après clarification de son message précédent :
   « les outils de clickoutil qui n'ont pas de fiche technique NI de PNG, on
   les supprime ; ceux qui ont l'un des deux, on les met dans un environnement
   que le site ne cherche pas au démarrage ni jamais. Tu crées un fichier
   isolé. »

   ⛔⛔ CE QUI COMPTE COMME « FICHE TECHNIQUE », ET CE QUI N'EN EST PAS UNE.
   Mesuré le 04/08 : `specs` est renseigné sur **391 fiches sur 391** — de quoi
   croire qu'elles sont toutes documentées. Elles ne le sont pas : la plupart ne
   portent que `{"Marque":"DeWALT"}`, et neuf autres seulement `{"Référence"}`.
   Marque et référence sont des IDENTIFIANTS, pas des caractéristiques. Les
   compter faisait passer 12 fiches vides pour documentées, contre 3 réellement
   renseignées. Un champ rempli n'est pas un champ qui dit quelque chose.

   ⚠️ De même pour l'image : `img` est renseigné 391 fois, mais **388 pointent
   le placeholder**. Un placeholder n'est pas un visuel — le prendre pour tel
   sauverait des fiches qui n'ont rien.

   ⛔ ESSAI PAR DÉFAUT. Sans `--confirmer`, on compte et on montre. La
   suppression est le seul geste de cette session qui ne se rattrape pas par
   `archives/` : ce qui part d'ici part pour de bon (git le garde, mais plus
   aucun fichier du dépôt ne le porte).

   ⚠️ Portes lues : J3 — des fiches produit, aucune donnée personnelle ;
   J4 — aucun prix recalculé ; J5 — aucune TVA. */

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const ARCHIVES = path.join(RACINE, 'archives');

function vide(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

/* ⛔ Les identifiants ne documentent rien. « Marque » et « Référence » disent
   QUI et LEQUEL, jamais COMMENT c'est fait. */
const IDENTIFIANTS = /^(marque|r[ée]f[ée]rence|brand|sku)$/i;

function aFicheTechnique(p) {
  if (!vide(p && p.features)) return true;
  if (!vide(p && p.description_long)) return true;
  const cles = Object.keys((p && p.specs) || {}).filter((k) => !IDENTIFIANTS.test(k));
  return cles.length > 0;
}

function aVisuel(p) {
  if (!vide(p && p.heroImg)) return true;
  const img = String((p && p.img) || '');
  return img !== '' && !/placeholder/i.test(img);
}

/* La règle de l'user, en une ligne : l'UN des deux suffit à sauver la fiche. */
function aGarder(p) { return aFicheTechnique(p) || aVisuel(p); }

function trierArchives(fiches) {
  const garde = [], jete = [];
  (fiches || []).forEach((p) => { (aGarder(p) ? garde : jete).push(p); });
  return { garde: garde, jete: jete };
}

function principal(argv) {
  const confirmer = argv.indexOf('--confirmer') !== -1;
  if (!fs.existsSync(ARCHIVES)) {
    console.error('❌ aucun dossier archives/ : rien à trier.');
    return 2;
  }
  const sources = fs.readdirSync(ARCHIVES)
    .filter((n) => /^fiches-.*\.json$/.test(n))
    .map((n) => path.join(ARCHIVES, n));
  if (!sources.length) {
    console.error('❌ aucun fichier d\'archives à trier.');
    return 2;
  }

  let toutes = [];
  sources.forEach((f) => { toutes = toutes.concat(JSON.parse(fs.readFileSync(f, 'utf8'))); });
  const tri = trierArchives(toutes);

  console.log('');
  console.log('═══ TRIER LES ARCHIVES ═══');
  console.log('');
  console.log('  fiches archivées ........... ' + toutes.length);
  console.log('  gardées (fiche technique OU visuel) ... ' + tri.garde.length);
  tri.garde.forEach((p) => console.log('       · ' + p.sku
    + '   fiche technique : ' + (aFicheTechnique(p) ? 'oui' : 'non')
    + '   visuel : ' + (aVisuel(p) ? 'oui' : 'non')));
  console.log('  supprimées (ni l\'un ni l\'autre) ....... ' + tri.jete.length);

  if (!confirmer) {
    console.log('');
    console.log('  ⚠️ ESSAI — rien n\'a été écrit ni supprimé. --confirmer pour agir.');
    console.log('');
    return 0;
  }

  /* ⛔ LE FICHIER ISOLÉ. Un seul, nommé pour ce qu'il est, hors du site :
     `archives/` est déjà dans `.vercelignore`. Le site ne le charge ni au
     démarrage ni jamais — aucun code ne le référence. */
  const dest = path.join(ARCHIVES, 'fiches-conservees.json');
  fs.writeFileSync(dest, JSON.stringify(tri.garde, null, 2));

  /* Les fichiers d'origine partent : ce qui devait être gardé l'est dans le
     fichier isolé, le reste n'avait ni fiche technique ni visuel. */
  sources.forEach((f) => fs.unlinkSync(f));

  console.log('');
  console.log('  ' + tri.garde.length + ' fiche(s) conservées dans ' + path.relative(RACINE, dest));
  console.log('  ' + tri.jete.length + ' fiche(s) supprimées définitivement');
  console.log('');
  console.log('  ⛔ archives/ est dans .vercelignore : le site ne le charge jamais.');
  console.log('');
  return 0;
}

module.exports = {
  aFicheTechnique: aFicheTechnique, aVisuel: aVisuel, trierArchives: trierArchives
};

if (require.main === module) process.exit(principal(process.argv.slice(2)));
