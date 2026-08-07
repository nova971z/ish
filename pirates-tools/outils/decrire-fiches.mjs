/* outils/decrire-fiches.mjs — DONNER UN DESCRIPTIF AUX FICHES QUI N'EN ONT PAS,
   SANS EN INVENTER UN SEUL MOT.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   Mesuré le 07/08/2026 : 590 des 1078 fiches DeWALT — 55 % — ont pour tout
   titre « DeWALT DWK1203T — DWK1203T », jusqu'à 12 311 € la carte. Elles sont
   publiées comme ça. Le traqueur les traite très bien : leur référence est
   bonne. Le problème n'est pas l'argent, c'est la vente — personne n'achète
   une carte qui ne dit pas ce qu'elle vend.

   ⛔ CE QU'IL EST FORMELLEMENT INTERDIT DE FAIRE ICI : écrire un descriptif
   plausible. Une puissance, un couple, une capacité de perçage inventés sont
   des mensonges au client, et ils survivent des mois. Cet outil n'écrit donc
   QUE ce qui vient d'une source, et il dit toujours laquelle.

   ─────────────────────────────────────────────────────────────────────────
   LES DEUX SEULES SOURCES, ET CE QUE CHACUNE PEUT DIRE

   ① LE TITRE DE L'ANNONCE, quand le balayage en a un. C'est du texte écrit
      par le marchand : on le reprend tel quel, sans le réécrire. Mesuré :
      35 fiches sur 590. Idealo transmet le plus souvent une référence et un
      prix, sans titre — d'où ce chiffre bas, et il n'est pas discutable.

   ② LA NOMENCLATURE DU FABRICANT, déjà vérifiée dans `nomenclature.js` :
      · le PRÉFIXE donne le rayon (DCG = meulage, DCH = perforation…), et
        seulement quand il est tranché — `incertain` ou rayon absent ⇒ on se
        tait. DCF couvre deux rayons : il ne dira rien.
      · le SUFFIXE donne la configuration livrée : nombre de batteries, leur
        capacité, le coffret, la mention « nue ».
      Ce ne sont pas des déductions : ce sont les codes du constructeur.

   ⛔ ET ON N'ÉCRIT PAS « MACHINE NUE » PARCE QUE LA RÉFÉRENCE SE TAIT. Défaut
   corrigé le même jour dans `lireSuffixeDewalt` : un suffixe vide rendait
   `nu: true`, ce qui aurait mis « sans batterie ni chargeur » sur des forets.
   Un silence reste un silence.

   ⚠️ CE QUI RESTE À FAIRE À LA MAIN EST DIT. Une fiche qui reçoit sa
   configuration mais pas son type d'outil garde `ficheAcompleter: true` : la
   trace de ce qui manque vaut mieux qu'un texte qui fait illusion.

   ⚠️ AUCUN PRIX N'EST TOUCHÉ. Cet outil n'écrit que du texte.

   USAGE
     node outils/decrire-fiches.mjs <dossier-balayage> [--marque DeWALT] [--essai]
   ───────────────────────────────────────────────────────────────────────── */
import { RACINE } from '../tests/_socle.mjs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const priceParse = require(join(RACINE, 'api/_lib/price-parse.js'));
const nomen = require(join(RACINE, 'api/_lib/nomenclature.js'));
const admin = require(join(RACINE, 'api/admin.js'))._internals;

const { decrit } = require(join(RACINE, 'scripts/completer-titres.js'));

const args = process.argv.slice(2);
const essai = args.includes('--essai');
const iM = args.indexOf('--marque');
const marque = iM !== -1 ? args[iM + 1] : 'DeWALT';
const dossier = args.find((a) => !a.startsWith('--') && a !== marque);
if (!dossier) {
  console.error('usage : node outils/decrire-fiches.mjs <dossier-balayage> [--marque DeWALT] [--essai]');
  process.exit(2);
}

/* ⛔ « MUETTE » SE MESURE, ne se devine pas : le titre, une fois la marque et
   la référence retirées, ne contient plus rien. */
function estMuette(p) {
  const t = String(p.title || p.name || '');
  const s = String(p.sku || '');
  if (/descriptif à compléter/i.test(t)) return true;
  const reste = t
    .replace(new RegExp(marque, 'ig'), '')
    .replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'), 'ig'), '')
    .replace(/[—\-\s]/g, '');
  return reste === '';
}

/* ── ① LES TITRES QUE LE BALAYAGE PEUT FOURNIR ───────────────────────────── */
async function titresDuBalayage(fiches) {
  const index = {};
  fiches.forEach((p) => { index[String(p.sku).toUpperCase()] = p; });
  admin.pwIndexerRacines(fiches, index);
  admin.pwIndexerModeles(fiches, index);

  const trouves = new Map(), vues = new Set();
  const fichiers = (await readdir(dossier)).filter((f) => /\.json$/.test(f));
  for (const f of fichiers) {
    let j;
    try { j = JSON.parse(await readFile(join(dossier, f), 'utf8')); } catch (e) { continue; }
    const emp = j.page && j.page.empreinte;
    if (emp && vues.has(emp)) continue;
    if (emp) vues.add(emp);
    const prendre = (titre, car) => {
      if (!titre || titre.length < 15) return;
      /* ⛔ UN TITRE QUI VEND DEUX ARTICLES NE DÉCRIT PAS CETTE FICHE. Vu à
         l'essai : « Affleureuse Défonceuse XR 18V - Plongée 55mm & Coffret 22
         Fraises » allait devenir le descriptif du COFFRET DE FRAISES. Le
         client aurait lu « affleureuse » sur une carte qui vend des fraises.
         Le jointeur de premier niveau suffit à les écarter — c'est le même
         signe qui, côté prix, interdit d'attribuer le montant d'un lot. */
      if (/\s[+&]\s/.test(String(titre).replace(/\([^()]*\)/g, ''))) return;
      const lu = priceParse.lireReferenceDuTitre(titre, marque);
      if (!lu.ref) return;
      const cle = { sku: lu.ref, name: titre, car: car };
      const p = index[lu.ref] || index[priceParse.racineRef(lu.ref)] || index[admin.pwCleModele(cle)];
      if (!p) return;
      /* Le plus long porte le plus d'information. */
      const a = trouves.get(p.sku);
      if (!a || titre.length > a.length) trouves.set(p.sku, titre);
    };
    for (const cle of ['reconnus', 'inconnus']) {
      for (const it of (j[cle] || [])) prendre(it.titre || it.name, it.car);
    }
    for (const it of (j.sansRefDetail || [])) prendre(it.titre, it.car);
  }
  return trouves;
}

/* ── ② CE QUE LA NOMENCLATURE DU FABRICANT PEUT DIRE ─────────────────────── */
/* ⛔ LA NOMENCLATURE DES BATTERIES NE VAUT QUE POUR LE SANS-FIL. « DC » veut
   dire *DeWalt Cordless* ; FVK est le kit FLEXVOLT. Hors de là, les mêmes
   lettres disent autre chose, et l'essai du 07/08/2026 l'a montré en trois
   coups :
     · DWE4016D2 — meuleuse FILAIRE — se lisait « 2 batteries de 2 Ah » ;
     · DPSB2IN1 se lisait « machine nue » parce que le N de « 2IN1 » tombe où
       le marqueur N est attendu ;
     · DT70620T — un accessoire — héritait d'un « coffret TSTAK ».
   Trois descriptifs faux sur une carte produit, donc trois mensonges au
   client. La garde est étroite EXPRÈS : mieux vaut une fiche muette qu'une
   fiche qui raconte. */
var REFERENCE_SANS_FIL = /^(DC|FVK)/;
/* ⛔ LE RAYON S'ÉCRIT EN FRANÇAIS, ET SANS EN DIRE PLUS QU'IL N'EN SAIT.
   Première version : `r.replace('-', ' ')`, qui donnait « Outil de aspiration »
   et « Outil de batterie » — ni français, ni informatif. Chaque libellé
   ci-dessous reste au NIVEAU DU RAYON : « batterie » couvre la batterie ET le
   chargeur, on écrit donc les deux plutôt que de choisir. Nommer le modèle
   exact serait une invention. */
const LIBELLES_RAYON = {
  percage: 'Outil de perçage et de vissage', 'vissage-choc': 'Visseuse ou boulonneuse à chocs',
  perforation: 'Perforateur ou burineur', meulage: 'Outil de meulage, découpe ou polissage',
  sciage: 'Outil de sciage', bois: 'Outil de travail du bois',
  fixation: 'Outil de fixation', aspiration: 'Aspirateur de chantier',
  jardin: 'Outil de jardin', chantier: 'Équipement de chantier',
  mesure: 'Instrument de mesure', confort: 'Équipement de confort',
  combo: 'Ensemble de plusieurs outils',
  'lame-circulaire': 'Lame de scie circulaire', 'lame-alternative': 'Lame de scie alternative',
  'lame-oscillante': 'Lame pour outil oscillant', foret: 'Foret', fraise: 'Fraise',
  disque: 'Disque', abrasif: 'Abrasif', 'vissage-embout': 'Embout de vissage',
  burin: 'Burin', visserie: 'Visserie', chaine: 'Chaîne',
  filtration: 'Élément de filtration', accessoire: 'Accessoire',
  batterie: 'Batterie ou chargeur', chargeur: 'Chargeur',
  coffret: 'Coffret ou rangement', mobilier: 'Mobilier d\'atelier',
  portage: 'Sac ou solution de portage', chaussure: 'Chaussure de sécurité',
  vetement: 'Vêtement de travail', main: 'Protection des mains',
  tete: 'Protection de la tête', auditif: 'Protection auditive',
  respiratoire: 'Protection respiratoire', hauteur: 'Équipement antichute',
  genou: 'Protection des genoux'
};
const LIBELLE_RAYON = (r) => LIBELLES_RAYON[r] || null;

function depuisNomenclature(sku) {
  const dits = [];
  const suf = REFERENCE_SANS_FIL.test(sku) ? nomen.lireSuffixeDewalt(sku) : null;
  if (suf) {
    if (suf.nbBatteries > 0) {
      suf.batteries.forEach((b) => {
        dits.push(b.nb + ' batterie' + (b.nb > 1 ? 's' : '') + ' de '
          + String(b.ah).replace('.', ',') + ' Ah' + (b.gamme ? ' ' + b.gamme : ''));
      });
    } else if (suf.nu) {
      dits.push('machine nue, sans batterie ni chargeur');
    }
    if (suf.coffret) dits.push('coffret ' + suf.coffret);
    if (suf.editionLimitee) dits.push('édition limitée');
  }
  const pre = nomen.prefixeDeReference(sku);
  /* ⛔ Un rayon « incertain » ou absent ne dit RIEN. DCF couvre la visseuse à
     chocs ET la riveteuse : trancher serait deviner. */
  const rayon = (pre && !pre.incertain && pre.rayon) ? pre.rayon : null;
  return { dits: dits, rayon: rayon, prefixe: pre ? pre.prefixe : null };
}

const chemin = join(RACINE, 'products.json');
const brut = JSON.parse(await readFile(chemin, 'utf8'));
const enveloppe = !Array.isArray(brut);
const produits = enveloppe ? brut.products : brut;
const miennes = produits.filter(
  (p) => String(p.brand || '').toUpperCase() === marque.toUpperCase());
const muettes = miennes.filter(estMuette);

const titres = await titresDuBalayage(miennes);

let parAnnonce = 0, parNomenclature = 0, muettesEncore = 0;
const exemples = [];
muettes.forEach((p) => {
  const sku = String(p.sku).toUpperCase();
  const annonce = titres.get(p.sku);
  /* ⛔⛔ UN TITRE QUI NE DÉCRIT RIEN NE REMPLACE PAS UN TITRE QUI NE DÉCRIT
     RIEN. Défaut mesuré le 08/08/2026, sur la sortie d'essai de cet outil
     même : il reprenait « DEWALT DT1473-QZ » pour remplacer « DeWALT
     DT1473-QZ — DT1473-QZ ». Le compteur montait de 210, la carte n'apprenait
     toujours rien au client. On exige donc que le titre repris porte de la
     LANGUE — la même mesure que `completer-titres.js`, une seule définition
     pour les deux outils. */
  /* ⛔⛔ ET LE TITRE NE DOIT PAS NOMMER UNE AUTRE RÉFÉRENCE. Attrapé sur la
     sortie d'essai : « DWE492-QS » allait recevoir « Duo de meuleuses 125/230
     mm DEWALT DWE492TWIN2-QS » — un LOT DE DEUX machines, pas la meuleuse
     seule. Écrire ça sur la carte, c'est promettre au client deux outils pour
     le prix d'un. Même garde que `completer-titres.js` : on relit la référence
     ÉCRITE dans le titre candidat, et on refuse dès qu'elle diffère. */
  const luDansAnnonce = annonce
    ? priceParse.lireReferenceDuTitre(annonce, marque).ref : null;
  const memeProduit = !luDansAnnonce
    || priceParse.racineRef(String(luDansAnnonce).toUpperCase())
       === priceParse.racineRef(sku);
  if (annonce && decrit(annonce, p.sku, marque) && memeProduit) {
    /* ⛔ ON NE RÉÉCRIT PAS LE TITRE DU MARCHAND. On le reprend tel quel : le
       reformuler, c'est commencer à inventer. */
    p.title = marque + ' ' + p.sku + ' — ' + annonce;
    p.desc = annonce + ' (descriptif repris de l\'annonce fournisseur).';
    p.ficheAcompleter = true;
    p.sourceDescriptif = 'annonce';
    parAnnonce++;
    if (exemples.length < 6) exemples.push([p.sku, 'annonce', p.title.slice(0, 100)]);
    return;
  }
  const n = depuisNomenclature(sku);
  /* ⛔⛔ LE RAYON ÉTAIT CALCULÉ, RENVOYÉ, PUIS JETÉ. Défaut mesuré le
     08/08/2026 : `depuisNomenclature` rend `{ dits, rayon, prefixe }`, et la
     condition d'écriture ne regardait que `dits` — la CONFIGURATION livrée
     (batteries, coffret). Une fiche dont le préfixe dit « meulage » mais dont
     le suffixe se tait ne recevait donc rien. Sur 597 fiches muettes, 285 ont
     un rayon tranché par la nomenclature du fabricant : 285 descriptifs
     sourcés perdus parce qu'une variable n'était pas lue.
     ⚠️ Le rayon dit CE QUE FAIT l'outil, pas son modèle : « outil de
     meulage » est vrai et vérifiable, « meuleuse d'angle 125 mm » serait une
     invention. On écrit le premier, et `ficheAcompleter` reste posé. */
  const libelle = n.rayon ? LIBELLE_RAYON(n.rayon) : null;
  if (libelle) n.dits.unshift(libelle);
  if (n.dits.length) {
    const phrase = n.dits.join(', ');
    p.title = marque + ' ' + p.sku + ' — ' + phrase.charAt(0).toUpperCase() + phrase.slice(1);
    p.desc = 'Référence constructeur ' + p.sku + '. Configuration livrée d\'après '
      + 'la nomenclature ' + marque + ' : ' + phrase
      + '. Le descriptif détaillé de l\'outil reste à compléter.';
    p.ficheAcompleter = true;
    p.sourceDescriptif = 'nomenclature';
    parNomenclature++;
    if (exemples.length < 12) exemples.push([p.sku, 'nomenclature', p.title.slice(0, 100)]);
    return;
  }
  /* ⛔ Rien de sourcé : on ne touche pas. Une fiche laissée muette est
     honnête ; une fiche décorée ne l'est pas. */
  muettesEncore++;
});

const l = (s) => console.log(s);
l('');
l('═══ DESCRIPTIFS ' + marque.toUpperCase() + (essai ? '  — ESSAI, RIEN N\'EST ÉCRIT' : '') + ' ═══');
l('');
l('  fiches ' + marque + ' ......................... ' + miennes.length);
l('  sans aucun descriptif ................ ' + muettes.length);
l('');
l('  · descriptif repris d\'une ANNONCE .... ' + parAnnonce);
l('  · configuration lue à la NOMENCLATURE . ' + parNomenclature);
l('  · laissées muettes, faute de source ... ' + muettesEncore);
l('');
exemples.forEach((e) => l('   [' + e[1].padEnd(12) + '] ' + e[2]));
l('');

if (!essai) {
  const sortie = enveloppe ? Object.assign({}, brut, { products: produits }) : produits;
  await writeFile(chemin, JSON.stringify(sortie, null, 2) + '\n', 'utf8');
  l('  products.json réécrit.');
  l('');
}
