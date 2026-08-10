/* generer-fiches-makita.js — FABRIQUE LES FICHES DEPUIS LE RELEVÉ DU TRAQUEUR.
 * ─────────────────────────────────────────────────────────────────────────
 * ⛔⛔ ORDRE DE L'USER, 10/08/2026 : « tu ajoutes tous les produits en trois
 * phases : d'abord les nus, ensuite les packs, après ça le filaire et ensuite
 * la quincaillerie et les accessoires. Tu fais ça proprement. » Et, sur le
 * poids : « tu ne les screen au hasard, tu lances des recherches Web pour
 * chercher le poids des produits ».
 *
 * ⛔⛔ CE QUE CE SCRIPT REFUSE DE FAIRE, ET C'EST SA RAISON D'ÊTRE.
 * Le relevé du traqueur donne la référence, le titre, la description et le
 * COÛT fournisseur. Il ne donne PAS le poids — mesuré : 4,8 % seulement, et
 * les nombres en kg qu'on y trouve sont parfois une charge utile (`DCU602Z`,
 * brouette, « charge max. 300 kg »), pas un poids d'expédition.
 * Or le poids fait le PORT, et le port fait le prix. Mesuré sur le calculateur
 * du site, à coût fournisseur identique de 500 € TTC :
 *      2 kg → 661,00 €      10 kg → 721,50 €      25 kg → 663,00 €
 * Vendre une machine de 10 kg au prix calculé pour 2 kg, c'est **60,50 € de
 * marge perdue à chaque vente**. Un poids supposé n'est donc pas une
 * approximation : c'est une vente à perte programmée.
 * ⇒ Toute racine absente de `data/poids-makita.json` est REFUSÉE, nommément,
 *   avec son type — pour qu'on sache quoi aller chercher. Jamais de repli
 *   silencieux sur une valeur par défaut.
 *
 * ⚠️ Le prix de vente n'est JAMAIS écrit à la main ici : il vient de
 * `pricing-model.recommend`, le même calculateur que l'import, le traqueur et
 * la page « Ajout de produits ». Une seconde formule divergerait au premier
 * correctif (règle d'argent : une formule n'a qu'une implémentation).
 *
 * Usage :
 *   node scripts/generer-fiches-makita.js --phase nu --releve <fichier.json>
 *   node scripts/generer-fiches-makita.js --phase nu --releve <f> --ecrire
 *   node scripts/generer-fiches-makita.js --phase nu --releve <f> --manquants <csv>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const nomen = require(path.join(RACINE, 'api/_lib/nomenclature.js'));
const pricing = require(path.join(RACINE, 'api/_lib/pricing-model.js'));

const PHASES = {
  nu: 'les machines seules — la phase 1',
  pack: 'les machines livrées avec batteries — la phase 2',
  filaire: 'les machines à câble — la phase 3',
  accessoire: 'quincaillerie, consommables, rangement, énergie, EPI — la phase 4'
};

function arg(nom, defaut) {
  const i = process.argv.indexOf('--' + nom);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : defaut;
}
const A_ECRIRE = process.argv.indexOf('--ecrire') !== -1;
const PHASE = String(arg('phase', '')).toLowerCase();
const RELEVE = arg('releve', '');
const CSV_MANQUANTS = arg('manquants', '');

/* ⛔ Un préalable non rempli ÉCHOUE — il ne se replie pas poliment. */
if (!PHASES[PHASE]) {
  console.error('phase inconnue. Phases : ' + Object.keys(PHASES).join(', '));
  process.exit(2);
}
if (!RELEVE || !fs.existsSync(RELEVE)) {
  console.error('relevé du traqueur introuvable : ' + (RELEVE || '(non fourni)'));
  process.exit(2);
}

/* ── LA PHASE D'UNE RÉFÉRENCE ────────────────────────────────────────────────
   Elle se lit sur ce que le parseur a typé ET sur la grammaire des suffixes —
   jamais sur un mot du titre seul, qui décrit souvent l'accessoire livré. */
function phaseDe(x) {
  const l = nomen.lireSuffixeMakita(x.sku);
  const f = nomen.formeReferenceMakita(x.sku);
  const c = l && l.config;
  if (x.fam && x.fam !== 'machine') return 'accessoire';
  if (!x.fam) return 'accessoire';
  if (c && (c.nbBatteries > 0 || c.avecEnergie)) return 'pack';
  if (c && c.nbBatteries === 0) return 'nu';
  if (f.forme === 'modele' && !f.sansFil) return 'filaire';
  if (!l || !l.suffixe) return 'nu';
  return 'filaire';
}

function racineDe(sku) {
  const l = nomen.lireSuffixeMakita(sku);
  return l ? l.racine : String(sku || '').toUpperCase();
}

/* ── LE POIDS EXPÉDIÉ ────────────────────────────────────────────────────────
   ⛔ Le poids de la table est celui de la MACHINE NUE. Un pack pèse plus : ses
   batteries et son coffret s'ajoutent. Les masses ci-dessous sont celles des
   blocs Makita, mesurées sur les fiches techniques publiques de la marque —
   elles ne sont PAS devinées, et elles ne servent qu'à MAJORER, jamais à
   minorer. Un pack dont on ignorerait ce supplément serait sous-facturé de
   port : c'est le sens dangereux. */
const MASSE_BATTERIE_KG = { 1.3: 0.4, 1.5: 0.4, 2: 0.4, 2.5: 0.5, 3: 0.65, 4: 0.65, 5: 0.65, 6: 0.9 };
const MASSE_COFFRET_KG = { MAKPAC: 2.2, MALLETTE: 1.5 };

function poidsExpedie(sku, table) {
  const r = racineDe(sku);
  const base = table[r];
  if (!base) return null;
  const l = nomen.lireSuffixeMakita(sku);
  const c = l && l.config;
  let kg = Number(base.kg);
  const detail = [base.kg + ' kg nu (' + base.source + ')'];
  if (c && typeof c.nbBatteries === 'number' && c.nbBatteries > 0) {
    const mb = MASSE_BATTERIE_KG[c.ah] != null ? MASSE_BATTERIE_KG[c.ah] : 0.9;
    kg += c.nbBatteries * mb;
    detail.push(c.nbBatteries + ' × ' + mb + ' kg de batterie');
  }
  if (c && c.coffret && MASSE_COFFRET_KG[c.coffret]) {
    kg += MASSE_COFFRET_KG[c.coffret];
    detail.push(MASSE_COFFRET_KG[c.coffret] + ' kg de coffret');
  }
  return { kg: Math.round(kg * 100) / 100, detail: detail.join(' + ') };
}

/* ── L'IDENTITÉ D'UNE FICHE ──────────────────────────────────────────────────
   ⛔ Le `slug` est une URL : deux fiches ne peuvent pas la partager. On la
   dérive de la référence, qui est unique par construction dans le relevé
   dédoublonné — jamais du titre, qui peut se répéter. */
function slugifier(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const RAYON_VERS_CATEGORIE = {
  percage: 'Perçage, vissage et boulonnage',
  meulage: 'Meulage, découpe et polissage',
  sciage: 'Scies',
  perforation: 'Perforateurs',
  jardin: 'Tronçonnage et élagage',
  aspiration: 'Aspirateurs',
  bois: 'Rabots',
  fixation: 'Cloueurs',
  mesure: 'Mesure et détection',
  batterie: 'Batteries et chargeurs',
  combo: 'Packs machines'
};

/* ⛔ LA FAMILLE SE LIT SUR SES PROPRES FICHES, PAS SUR MON JUGEMENT.
   `data/types-makita-categorie.json` est un dépouillement de VOTES : pour
   chaque type d'outil que le parseur sait nommer, la famille que l'user a
   lui-même donnée aux produits de ce type dans son catalogue. Retenu à partir
   de 3 fiches ET 80 % d'accord — en dessous ce n'est pas une preuve, c'est une
   coïncidence (mesuré : « nettoyeur haute pression » n'avait qu'UNE fiche, et
   elle était rangée dans Accessoires ; la propager aurait recopié un
   classement isolé sur toute une gamme).
   Le préfixe ne sert qu'en SECOURS, et seulement quand il ne désigne qu'un
   seul rayon — jamais pour contredire un type qui, lui, a parlé. */
const TABLE_TYPES = JSON.parse(
  fs.readFileSync(path.join(RACINE, 'data/types-makita-categorie.json'), 'utf8')
).types;

function categorieDe(x, categoriesConnues) {
  const parType = x.typ && TABLE_TYPES[x.typ];
  if (parType && categoriesConnues.has(parType.categorie)) return parType.categorie;
  const p = nomen.prefixeDeReference ? nomen.prefixeDeReference(x.sku, 'MAKITA') : null;
  const rayon = p && p.rayon;
  const c = rayon && RAYON_VERS_CATEGORIE[rayon];
  if (c && categoriesConnues.has(c)) return c;
  return null;
}

/* ══ LE TRAVAIL ═════════════════════════════════════════════════════════════ */
const releve = JSON.parse(fs.readFileSync(RELEVE, 'utf8'));
const catalogue = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
const tablePoids = JSON.parse(fs.readFileSync(path.join(RACINE, 'data/poids-makita.json'), 'utf8')).poids;

const dejaLa = new Set(catalogue.map((p) => String(p.sku || '').toUpperCase()));
const slugsPris = new Set(catalogue.map((p) => String(p.slug || '')));
const idsPris = new Set(catalogue.map((p) => String(p.id || '')));
const categoriesConnues = new Set(catalogue.map((p) => p.category));

const candidats = releve
  .filter((x) => x && x.sku && !dejaLa.has(String(x.sku).toUpperCase()))
  .filter((x) => phaseDe(x) === PHASE);

const retenues = [];
const refusees = [];

candidats.forEach((x) => {
  const cout = Number(x.srcTTC);
  if (!(cout > 0)) { refusees.push({ sku: x.sku, motif: 'aucun coût fournisseur lu', typ: x.typ || '' }); return; }
  const p = poidsExpedie(x.sku, tablePoids);
  if (!p) {
    refusees.push({ sku: x.sku, racine: racineDe(x.sku), motif: 'POIDS INCONNU — à chercher',
      typ: x.typ || '', titre: x.titre || '', cout: cout });
    return;
  }
  const categorie = categorieDe(x, categoriesConnues);
  if (!categorie) {
    refusees.push({ sku: x.sku, motif: 'aucune famille sûre — le préfixe n\'en désigne pas une seule',
      typ: x.typ || '', titre: x.titre || '', cout: cout });
    return;
  }
  const reco = pricing.recommend({ weight_kg: p.kg, ncCategory: 'power_tool' }, { costTTC: cout }, {});
  if (!reco || !(reco.priceHtFor && reco.priceHtFor.price > 0)) {
    refusees.push({ sku: x.sku, motif: 'le calculateur n\'a pas rendu de prix', typ: x.typ || '' });
    return;
  }
  const sku = String(x.sku).toUpperCase();
  const id = 'makita-' + slugifier(sku);
  const slug = id + '-' + slugifier(String(x.typ || x.titre || '').slice(0, 60));
  if (idsPris.has(id) || slugsPris.has(slug)) {
    refusees.push({ sku: sku, motif: 'identité déjà prise au catalogue', typ: x.typ || '' });
    return;
  }
  idsPris.add(id); slugsPris.add(slug);
  retenues.push({
    id: id, slug: slug, sku: sku, name: sku, brand: 'Makita', category: categorie,
    title: 'Makita ' + sku + ' — ' + (x.typ || 'outil'),
    tag: 'Nouveau',
    desc: String(x.descr || x.titre || '').slice(0, 300),
    img: '', price: reco.priceHtFor.price, currency: 'EUR', vat: 0.2,
    price_ht: reco.priceHt, stock_status: 'in_stock', stock_label: 'En stock',
    model: '', paymentLink: '', weight_kg: p.kg, ncCategory: 'power_tool',
    productType: 'pro', tags: [], features: [], specs: {},
    description_long: '', _poidsSource: p.detail, _coutSource: cout
  });
});

console.log('══ PHASE « ' + PHASE + ' » — ' + PHASES[PHASE]);
console.log('relevé : ' + path.basename(RELEVE));
console.log('candidats de cette phase absents du catalogue : ' + candidats.length);
console.log('  · fiches PRÊTES (poids sourcé, prix calculé) : ' + retenues.length);
console.log('  · refusées                                   : ' + refusees.length);
const parMotif = {};
refusees.forEach((r) => { parMotif[r.motif] = (parMotif[r.motif] || 0) + 1; });
Object.keys(parMotif).sort((a, b) => parMotif[b] - parMotif[a])
  .forEach((m) => console.log('      ' + String(parMotif[m]).padStart(5) + '  ' + m));

if (CSV_MANQUANTS) {
  const cel = (v) => {
    const s = String(v == null ? '' : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const vus = new Set();
  const L = ['racine;reference;type;titre;cout_fournisseur_ttc_eur;ce_qui_manque'];
  refusees.forEach((r) => {
    const c = (r.racine || r.sku) + '|' + r.motif;
    if (vus.has(c)) return; vus.add(c);
    L.push([cel(r.racine || ''), cel(r.sku), cel(r.typ), cel(r.titre || ''),
      cel(String(r.cout == null ? '' : r.cout).replace('.', ',')), cel(r.motif)].join(';'));
  });
  fs.writeFileSync(CSV_MANQUANTS, '﻿' + L.join('\r\n') + '\r\n', 'utf8');
  console.log('\nce qui manque, écrit : ' + CSV_MANQUANTS + ' (' + (L.length - 1) + ' lignes)');
}

if (!A_ECRIRE) {
  console.log('\n(aperçu seul — rien n\'a été écrit. Ajouter --ecrire pour verser au catalogue.)');
  process.exit(0);
}
if (!retenues.length) {
  console.error('\nrien à verser : aucune fiche prête.');
  process.exit(1);
}
/* Les champs de travail ne partent pas au catalogue : ils ont servi à tracer. */
const propres = retenues.map((f) => {
  const c = Object.assign({}, f); delete c._poidsSource; delete c._coutSource; return c;
});
fs.writeFileSync(path.join(RACINE, 'products.json'),
  JSON.stringify(catalogue.concat(propres), null, 2) + '\n', 'utf8');
console.log('\nproducts.json : ' + catalogue.length + ' → ' + (catalogue.length + propres.length) + ' fiches');
