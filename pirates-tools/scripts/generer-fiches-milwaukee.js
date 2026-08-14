/* generer-fiches-milwaukee.js — FABRIQUE LES FICHES DEPUIS LE RELEVÉ DU TRAQUEUR.
 * ─────────────────────────────────────────────────────────────────────────
 * ⛔⛔ MÊME CONTRAT QUE LE GÉNÉRATEUR ÉPROUVÉ DE L'AUTRE MARQUE (l'ordre de
 * l'user du 10/08/2026 vaut pour toutes) : « tu ajoutes tous les produits en
 * trois phases : d'abord les nus, ensuite les packs, après ça le filaire et
 * ensuite la quincaillerie et les accessoires. Tu fais ça proprement. » Et sur
 * le poids : « tu ne les screen pas au hasard, tu lances des recherches Web ».
 *
 * ⛔⛔ CE QUE CE SCRIPT REFUSE DE FAIRE, ET C'EST SA RAISON D'ÊTRE.
 * Le poids fait le PORT, et le port fait le prix — mesuré sur le calculateur
 * du site, à coût identique de 500 € TTC : 2 kg → 661,00 €, 10 kg → 721,50 €.
 * Un poids supposé est une vente à perte programmée (60,50 € de marge par
 * vente dans la tranche mesurée). ⇒ Toute référence sans poids sourcé dans
 * `data/poids-milwaukee.json` est REFUSÉE, nommément, avec de quoi aller
 * chercher. Jamais de repli silencieux.
 *
 * ⛔ SPÉCIFICITÉS DE CETTE MARQUE, TOUTES MESURÉES SUR SON RELEVÉ :
 *  · le conditionnement se lit dans le SUFFIXE de plateforme
 *    (`lireSuffixeMilwaukee`) — et un suffixe AMBIGU (422X, 820…) fait REFUSER
 *    la fiche, jamais deviner : aucune source ne publie la légende ;
 *  · les numéros d'article à 10 et 8 chiffres sont des IDENTIFIANTS, pas des
 *    descriptions : phase accessoire, jamais un contenu déduit ;
 *  · le FILAIRE n'a pas encore de grammaire de référence chez cette marque :
 *    une machine sans référence de plateforme lisible est comptée ILLISIBLE et
 *    LISTÉE — pas rangée au hasard, pas passée sous silence ;
 *  · la lettre de caisse (X/C/B) change l'emballage, pas les batteries
 *    (recoupé sur 5 revendeurs) — mais sa MASSE n'est pas encore mesurée :
 *    une référence à caisse est refusée tant que son poids EXPÉDIÉ complet
 *    n'est pas dans la table (entrée par référence complète).
 *
 * ⚠️ Le prix de vente n'est JAMAIS écrit à la main : `pricing-model.recommend`,
 * la même formule que tout le reste du site.
 *
 * Usage :
 *   node scripts/generer-fiches-milwaukee.js --phase nu --releve <fichier.json>
 *   node scripts/generer-fiches-milwaukee.js --phase nu --releve <dossier-admin-N>
 *   … [--ecrire] [--manquants <csv>] [--poids <table.json>]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const nomen = require(path.join(RACINE, 'api/_lib/nomenclature.js'));
const pricing = require(path.join(RACINE, 'api/_lib/pricing-model.js'));

/* ⛔⛔ CE SCRIPT NE TRAVAILLE QUE POUR UNE MARQUE, ET IL LE DIT. Ordre de
   l'user, 10/08/2026 : une fois la marque détectée, la BONNE table — jamais
   celle d'une autre. Déclarée ici, revérifiée à chaque fiche. */
const MARQUE_DU_SCRIPT = 'MILWAUKEE';
function estDeLaMarque(x) {
  const b = String((x && (x.brand || x.marque)) || MARQUE_DU_SCRIPT).toUpperCase();
  return b === MARQUE_DU_SCRIPT;
}

const PHASES = {
  nu: 'les machines seules — la phase 1',
  pack: 'les machines livrées avec batteries — la phase 2',
  filaire: 'les machines à câble — la phase 3 (grammaire NON écrite : tout y est illisible pour l\'instant)',
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
const TABLE_POIDS_FICHIER = arg('poids', path.join(RACINE, 'data/poids-milwaukee.json'));

/* ⛔ Un préalable non rempli ÉCHOUE — il ne se replie pas poliment. */
if (!PHASES[PHASE]) {
  console.error('phase inconnue. Phases : ' + Object.keys(PHASES).join(', '));
  process.exit(2);
}
if (!RELEVE || !fs.existsSync(RELEVE)) {
  console.error('relevé du traqueur introuvable : ' + (RELEVE || '(non fourni)'));
  process.exit(2);
}

/* ── LIRE LE RELEVÉ — FICHIER PLAT OU DOSSIER DE PAGES ──────────────────────
   ⛔ Le balayage de cette marque tourne en MODE À SEC (D-018) et range ses
   cartes sous `inconnus` / `sansRefDetail`. Ne lire qu'une forme, c'est le
   trou qui m'a fait affirmer « aucun relevé Milwaukee » — leçon gravée. */
function lireReleve(chemin) {
  if (fs.statSync(chemin).isDirectory()) {
    const banc = require(path.join(RACINE, 'scripts/banc-milwaukee.js'));
    return banc.cartesDe(chemin).map((c) => ({
      brand: c.marque || MARQUE_DU_SCRIPT,
      sku: c.sku || null, titre: c.titre, descr: '',
      srcTTC: c.prix,
      typ: (c.car && (c.car.type || c.car.typ)) || null,
      fam: (c.car && (c.car.famille || c.car.fam)) || null
    }));
  }
  const j = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  if (!Array.isArray(j)) {
    console.error('relevé plat attendu : un TABLEAU de cartes (ou un dossier de pages admin-N.json).');
    process.exit(2);
  }
  return j;
}

/* ── LA RÉFÉRENCE ET SA PHASE ───────────────────────────────────────────────
   La phase se lit sur ce que le parseur a typé ET sur la grammaire des
   suffixes — jamais sur un mot du titre seul. */
function lectureDe(x) {
  const brut = x.sku || x.titre || '';
  let lu = null;
  try { lu = nomen.lireReferenceMilwaukee(String(x.titre || x.sku || '')); } catch (e) { lu = null; }
  if (!lu && x.sku) {
    try { lu = nomen.lireReferenceMilwaukee(String(x.sku)); } catch (e) { lu = null; }
  }
  return { lu: lu, brut: String(brut).toUpperCase() };
}

function phaseDe(x) {
  /* ⛔ Garde de marque rappelée là où les tables sont lues. */
  const marque = String((x && x.brand) || MARQUE_DU_SCRIPT).toUpperCase();
  if (marque !== MARQUE_DU_SCRIPT) return 'accessoire';
  const fam = String(x.fam || '').toLowerCase();
  if (fam && fam !== 'machine') return 'accessoire';
  const L = lectureDe(x);
  if (!L.lu) return fam === 'machine' ? 'illisible' : 'accessoire';
  if (L.lu.forme !== 'plateforme') return 'accessoire';   /* identifiant, pas description */
  const suf = nomen.lireSuffixeMilwaukee(L.lu.suffixe, MARQUE_DU_SCRIPT);
  if (L.lu.suffixe && !suf) return 'suffixe-ambigu';      /* on ne devine JAMAIS */
  if (suf && suf.nbBatteries > 0) return 'pack';
  return 'nu';                                            /* suffixe nu, ou pas de suffixe */
}

function referenceDe(x) {
  const L = lectureDe(x);
  return L.lu ? L.lu.ref : L.brut.replace(/[^A-Z0-9-]/g, '');
}

function racineDe(x) {
  const L = lectureDe(x);
  if (!L.lu || L.lu.forme !== 'plateforme') return referenceDe(x);
  const s = String(L.lu.suffixe || '').replace(/[\s-]/g, '');
  const ref = L.lu.ref;
  return s && ref.endsWith(s) ? ref.slice(0, ref.length - s.length) : ref;
}

/* ── LE POIDS EXPÉDIÉ ────────────────────────────────────────────────────────
   ⛔ Les masses de batterie ci-dessous sont MESURÉES sur les fiches publiques,
   recoupées à deux sources chacune le 14/08/2026 :
     · 2,0 Ah (M18 B2) : 0,40 kg   · 4,0 Ah (M18 B4) : 0,70 kg
     · 5,0 Ah (M18 B5) : 0,73 kg
   Toute capacité NON mesurée est majorée à 1,10 kg — un MAJORANT, dit comme
   tel : surestimer le port protège la marge, le sous-estimer la mange (M-11).
   ⛔ La masse des CAISSES (lettres X/C/B) n'est PAS mesurée — et elle varie
   par taille de caisse : une référence à caisse exige donc son poids EXPÉDIÉ
   complet dans la table, par référence complète. Sinon : REFUS nommé. */
const MASSE_BATTERIE_KG = { 2: 0.4, 4: 0.7, 5: 0.73 };
const MASSE_BATTERIE_MAJORANT_KG = 1.1;

function poidsExpedie(x, table) {
  const marque = String((x && x.brand) || MARQUE_DU_SCRIPT).toUpperCase();
  if (marque !== MARQUE_DU_SCRIPT) return null;
  const refC = referenceDe(x);
  /* ① le poids EXPÉDIÉ de la référence complète, s'il a été recherché : il
     prime sur toute composition — c'est une mesure, pas un calcul. */
  const direct = table[refC];
  if (direct && Number(direct.kg) > 0) {
    return { kg: Number(direct.kg), detail: direct.kg + ' kg expédié (' + direct.source + ')' };
  }
  /* ② sinon : poids de la machine NUE (par racine) + majorations mesurées. */
  const base = table[racineDe(x)];
  if (!base || !(Number(base.kg) > 0)) return null;
  const L = lectureDe(x);
  const suf = L.lu && L.lu.forme === 'plateforme'
    ? nomen.lireSuffixeMilwaukee(L.lu.suffixe, MARQUE_DU_SCRIPT) : null;
  let kg = Number(base.kg);
  const detail = [base.kg + ' kg nu (' + base.source + ')'];
  if (suf && suf.nbBatteries > 0) {
    const mb = MASSE_BATTERIE_KG[suf.ah] != null ? MASSE_BATTERIE_KG[suf.ah] : MASSE_BATTERIE_MAJORANT_KG;
    kg += suf.nbBatteries * mb;
    detail.push(suf.nbBatteries + ' × ' + mb + ' kg de batterie'
      + (MASSE_BATTERIE_KG[suf.ah] == null ? ' (MAJORANT, capacité non mesurée)' : ''));
  }
  if (suf && suf.coffret) {
    /* ⛔ masse de caisse inconnue ⇒ REFUS distinct. Composer sans elle
       sous-facturerait le port — le sens qui coûte. */
    return { refus: 'caisse' };
  }
  return { kg: Math.round(kg * 100) / 100, detail: detail.join(' + ') };
}

/* ── L'IDENTITÉ D'UNE FICHE ────────────────────────────────────────────────── */
function slugifier(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ⛔ LA FAMILLE SE LIT SUR SES PROPRES FICHES, PAS SUR MON JUGEMENT.
   La table des types est un dépouillement de votes PAR TYPE D'OUTIL sur tout
   son catalogue (≥ 3 fiches, ≥ 80 % d'accord) : « scie circulaire » va dans
   « Scies » quelle que soit la marque. Le nom du fichier est historique — le
   contenu, lui, n'appartient à aucune marque. Aucun secours par préfixe ici :
   cette marque n'a pas de table de préfixes, et un secours qui n'existe pas ne
   se simule pas. */
const TABLE_TYPES = JSON.parse(
  fs.readFileSync(path.join(RACINE, 'data/types-makita-categorie.json'), 'utf8')
).types;

function categorieDe(x, categoriesConnues) {
  const parType = x.typ && TABLE_TYPES[x.typ];
  if (parType && categoriesConnues.has(parType.categorie)) return parType.categorie;
  return null;
}

/* ══ LE TRAVAIL ═════════════════════════════════════════════════════════════ */
const releve = lireReleve(RELEVE);
const catalogue = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
if (!fs.existsSync(TABLE_POIDS_FICHIER)) {
  console.error('table des poids introuvable : ' + TABLE_POIDS_FICHIER);
  process.exit(2);
}
const tablePoids = JSON.parse(fs.readFileSync(TABLE_POIDS_FICHIER, 'utf8')).poids;

const dejaLa = new Set(catalogue.map((p) => String(p.sku || '').toUpperCase()));
const slugsPris = new Set(catalogue.map((p) => String(p.slug || '')));
const idsPris = new Set(catalogue.map((p) => String(p.id || '')));
const categoriesConnues = new Set(catalogue.map((p) => p.category));

/* ⛔ AUCUN ÉCART SILENCIEUX : ce qui n'entre pas dans la phase se COMPTE. */
const horsMarque = releve.filter((x) => !estDeLaMarque(x)).length;
if (horsMarque) {
  console.log('⚠️ ' + horsMarque + ' référence(s) d\'une AUTRE marque écartée(s) : '
    + 'ce générateur ne lit que la nomenclature ' + MARQUE_DU_SCRIPT + '.');
}
const deLaMarque = releve.filter(estDeLaMarque).filter((x) => x && (x.sku || x.titre));
const parPhase = {};
deLaMarque.forEach((x) => { const p = phaseDe(x); parPhase[p] = (parPhase[p] || 0) + 1; });
console.log('répartition du relevé par phase : ' + JSON.stringify(parPhase));
if (parPhase['illisible']) {
  console.log('⚠️ ' + parPhase['illisible'] + ' machine(s) SANS référence de plateforme lisible '
    + '(filaire non grammatisé compris) — LISTÉES dans le CSV des manquants, jamais rangées au hasard.');
}
if (parPhase['suffixe-ambigu']) {
  console.log('⚠️ ' + parPhase['suffixe-ambigu'] + ' référence(s) à SUFFIXE AMBIGU — refusées : '
    + 'aucune source ne publie la légende, on ne devine pas un contenu.');
}

const candidats = deLaMarque
  .filter((x) => !dejaLa.has(referenceDe(x)))
  .filter((x) => phaseDe(x) === PHASE);

const retenues = [];
const refusees = [];
/* Les illisibles et ambigus sortent aussi au CSV : c'est la liste de travail. */
deLaMarque.filter((x) => ['illisible', 'suffixe-ambigu'].indexOf(phaseDe(x)) !== -1)
  .forEach((x) => refusees.push({
    sku: lectureDe(x).lu ? referenceDe(x) : '(aucune)', motif: phaseDe(x) === 'illisible'
      ? 'référence de plateforme illisible (filaire non grammatisé ?)'
      : 'suffixe ambigu — aucune source ne dit le contenu',
    typ: x.typ || '', titre: x.titre || '', cout: Number(x.srcTTC) || ''
  }));

candidats.forEach((x) => {
  const cout = Number(x.srcTTC);
  if (!(cout > 0)) { refusees.push({ sku: referenceDe(x), motif: 'aucun coût fournisseur lu', typ: x.typ || '' }); return; }
  const p = poidsExpedie(x, tablePoids);
  if (!p || p.refus) {
    refusees.push({ sku: referenceDe(x), racine: racineDe(x),
      motif: p && p.refus === 'caisse'
        ? 'CAISSE : masse non mesurée — chercher le poids EXPÉDIÉ complet de la référence'
        : 'POIDS INCONNU — à chercher',
      typ: x.typ || '', titre: x.titre || '', cout: cout });
    return;
  }
  const categorie = categorieDe(x, categoriesConnues);
  if (!categorie) {
    refusees.push({ sku: referenceDe(x), motif: 'aucune famille sûre pour ce type',
      typ: x.typ || '', titre: x.titre || '', cout: cout });
    return;
  }
  const reco = pricing.recommend({ weight_kg: p.kg, ncCategory: 'power_tool' }, { costTTC: cout }, {});
  if (!reco || !(reco.priceHtFor && reco.priceHtFor.price > 0)) {
    refusees.push({ sku: referenceDe(x), motif: 'le calculateur n\'a pas rendu de prix', typ: x.typ || '' });
    return;
  }
  /* ⛔⛔ ARGENT — même refus que l'autre générateur : marge cible inatteignable
     = fiche refusée. Un article vendu à perte est pire que pas d'article. */
  if (reco.cibleAtteinte === false) {
    refusees.push({ sku: referenceDe(x), racine: racineDe(x),
      motif: 'coût trop bas : la marge cible est inatteignable, le prix serait à perte',
      typ: x.typ || '', titre: x.titre || '', cout: cout });
    return;
  }
  const sku = referenceDe(x);
  const id = 'milwaukee-' + slugifier(sku);
  const slug = id + '-' + slugifier(String(x.typ || x.titre || '').slice(0, 60));
  if (idsPris.has(id) || slugsPris.has(slug)) {
    refusees.push({ sku: sku, motif: 'identité déjà prise au catalogue', typ: x.typ || '' });
    return;
  }
  idsPris.add(id); slugsPris.add(slug);
  retenues.push({
    id: id, slug: slug, sku: sku, name: sku, brand: 'Milwaukee', category: categorie,
    title: 'Milwaukee ' + sku + ' — ' + (x.typ || 'outil'),
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
console.log('  · refusées (illisibles et ambigus compris)   : ' + refusees.length);
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
const propres = retenues.map((f) => {
  const c = Object.assign({}, f); delete c._poidsSource; delete c._coutSource; return c;
});
fs.writeFileSync(path.join(RACINE, 'products.json'),
  JSON.stringify(catalogue.concat(propres), null, 2) + '\n', 'utf8');
console.log('\nproducts.json : ' + catalogue.length + ' → ' + (catalogue.length + propres.length) + ' fiches');
