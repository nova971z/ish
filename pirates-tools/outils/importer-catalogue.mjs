/* outils/importer-catalogue.mjs — AJOUTER LES RÉFÉRENCES D'UNE LISTE FOURNISSEUR.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   L'user a fourni le 01/08/2026 un relevé fournisseur MAKITA de 719 références
   inconnues du catalogue, triées par prix DÉCROISSANT, avec pour chacune
   `{ sku, srcTTC, name }`. Consigne : « tu pars du premier et tu les ajoutes
   jusqu'à arriver à 600, en faisant attention aux doublons ».

   ─────────────────────────────────────────────────────────────────────────
   CE QUE L'OUTIL REFUSE D'INVENTER

   ⛔ AUCUN PRIX N'EST SAISI À LA MAIN. Chaque prix passe par le calculateur du
   projet (`api/_lib/pricing-model.js`), depuis le coût d'achat RELEVÉ
   (`srcTTC`). C'est la règle produits, et elle existe parce qu'un prix bâti
   sur une supposition finit par vendre à perte.

   ⚠️ LE POIDS EST INCONNU, ET LE POIDS FAIT LE PRIX. Le calculateur retombe
   sur **2 kg** quand `weight_kg` manque (`shipFor`, ligne « || 2 ») — ce n'est
   pas neutre : le port change le prix de vente. Chaque fiche importée porte
   donc `poidsSuppose: true`. Ce n'est pas un détail décoratif : c'est la
   trace qui dit quelles fiches ont un prix à revoir dès que le poids réel est
   connu, exactement comme le « coût estimé » existant.

   ⛔ REFUSÉES SANS DISCUSSION :
     · nom vide — une fiche sans nom n'est pas publiable ;
     · nom manifestement tronqué par l'analyse de la source (commence par un
       chiffre suivi de « Ah) », « V) », « mm) »…) ;
     · SKU déjà au catalogue — jamais de doublon ;
     · coût d'achat nul ou négatif.

   Les refusées sont ÉCRITES dans le rapport, jamais avalées en silence.

   USAGE
     node outils/importer-catalogue.mjs <releve.json> [combien] [--essai]
   ───────────────────────────────────────────────────────────────────────── */
import { RACINE } from '../tests/_socle.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const modele = require(join(RACINE, 'api/_lib/pricing-model.js'));

const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
const combien = Number(args.find((a) => /^\d+$/.test(a))) || 600;
const essai = args.includes('--essai');
if (!source) { console.error('usage : node outils/importer-catalogue.mjs <releve.json> [600] [--essai]'); process.exit(2); }

const releve = JSON.parse(await readFile(source, 'utf8'));
const liste = releve.unknown || releve.items || (Array.isArray(releve) ? releve : []);
const marque = String(releve.brand || 'Makita');
const MARQUE = marque.charAt(0) + marque.slice(1).toLowerCase();

const cat = JSON.parse(await readFile(join(RACINE, 'products.json'), 'utf8'));
const produits = Array.isArray(cat) ? cat : (cat.products || []);
const skusExistants = new Set(produits.map((p) => String(p.sku || '').toUpperCase()));
/* ⛔ UN DOUBLON NE SE LIT PAS QUE SUR LE SKU PRINCIPAL. Le traqueur de prix
   déclare des RÉFÉRENCES ALTERNATIVES (`srcAltSkus`) : une fiche « DBS180Z »
   couvre aussi « DBS180ZJ ». Importer la seconde crée deux fiches pour le même
   outil — c'est la porte `check-price-watch` qui l'a signalé, pas moi. */
produits.forEach((p) => {
  const alt = p.srcAltSkus;
  const liste = Array.isArray(alt) ? alt : (typeof alt === 'string' ? alt.split(/[\s,;]+/) : []);
  liste.forEach((a) => { const k = String(a || '').trim().toUpperCase(); if (k) skusExistants.add(k); });
});

/* ⛔⛔ LES CATÉGORIES VIENNENT DU CATALOGUE, ON N'EN INVENTE PAS.
   Faute commise au 1er import (01/08/2026) : j'avais écrit ma propre table et
   fabriqué `Perceuses visseuses` à côté de `Perceuses-visseuses`,
   `Defonceuses` à côté de `Défonceuses`, `Coffrets` au lieu de `Rangements`.
   Le menu du site se construit à partir des catégories PRÉSENTES dans
   products.json : douze familles fantômes sont donc apparues, chacune coupant
   en deux une famille existante. Le client cherchant une défonceuse n'en
   voyait plus que la moitié.

   Chaque motif pointe désormais vers un nom EXISTANT, vérifié plus bas : si
   la cible n'est pas au catalogue, l'outil REFUSE de tourner. */
const FAMILLES = [
  [/boulonneuse/i, 'Boulonneuses a chocs'],
  [/visseuse à chocs|visseuse a chocs|cliquet/i, 'Visseuses a chocs'],
  [/perceuse|visseuse/i, 'Perceuses-visseuses'],
  [/meuleuse/i, 'Meuleuses'],
  [/découpeuse|decoupeuse/i, 'Découpeuses'],
  [/scie|tronçonneuse|tronconneuse/i, 'Scies'],
  [/perfo|burineur|marteau|piqueur/i, 'Perforateurs'],
  [/ponceuse/i, 'Ponceuses'],
  [/rabot/i, 'Rabots'],
  [/défonceuse|defonceuse|affleureuse/i, 'Défonceuses'],
  [/souffleur/i, 'Souffleurs'],
  [/aspirateur/i, 'Aspirateurs'],
  [/batterie|chargeur|accu|adaptateur secteur/i, 'Batteries et chargeurs'],
  [/coffret|makpac|valise|mallette|sac|caisse/i, 'Rangements'],
  [/lamelleuse/i, 'Lamelleuses'],
  [/riveteuse/i, 'Riveteuses'],
  [/tarière|tariere/i, 'Tarières'],
  [/malaxeur|mélangeur|melangeur/i, 'Malaxeurs'],
  [/cloueur|agrafeuse/i, 'Cloueurs'],
  [/multifonction|oscillant/i, 'Outils multifonctions'],
  [/taille-haie|débroussailleuse|debroussailleuse|tondeuse|élagueuse|elagueuse|sécateur|secateur/i, 'Élagage'],
  [/combo|pack|kit/i, 'Combos'],
  /* Tout le reste — douilles, embouts, forets, lames, disques, lampes,
     pistolets, compresseurs — tombe dans « Accessoires », qui existe déjà.
     Mieux vaut une famille large et VISIBLE qu'une famille juste et fantôme. */
];
const famille = (n) => (FAMILLES.find(([re]) => re.test(n)) || [null, 'Accessoires'])[1];

/* ⛔ PRÉALABLE : chaque cible doit EXISTER au catalogue. Sans ce contrôle,
   une faute de frappe recréerait une famille fantôme sans que rien ne le dise. */
{
  const connues = new Set(produits.map((p) => p.category).filter(Boolean));
  const inconnues = [...new Set(FAMILLES.map(([, c]) => c).concat(['Accessoires']))]
    .filter((c) => !connues.has(c));
  if (inconnues.length) {
    console.error('⛔ REFUS : ces catégories cibles n\'existent PAS au catalogue — '
      + inconnues.join(', ') + '. Corrige la table avant d\'importer : une famille '
      + 'inventée coupe en deux une famille existante et devient invisible.');
    process.exit(1);
  }
}

const slugifier = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);

/* Un libellé tronqué par l'analyse de la source commence par une unité
   orpheline : « 0 Ah) dans Makpac », « 5 V) », « 18 mm) »… */
const tronque = (n) => /^[\d.,]+\s*(ah|v|mm|cm|nm|w|kg|j|l)\b/i.test(n.trim())
  || /^\)|^\(|^-|^,/.test(n.trim());

const retenus = [];
const refuses = [];
const couts = {};   // SKU → coût d'achat, jamais servi
for (const it of liste) {
  if (retenus.length >= combien) break;
  const sku = String(it.sku || '').trim().toUpperCase();
  const nom = String(it.name || '').trim();
  const cout = Number(it.srcTTC || 0);
  if (!sku) { refuses.push({ sku, nom, motif: 'référence absente' }); continue; }
  if (skusExistants.has(sku)) { refuses.push({ sku, nom, motif: 'DOUBLON — SKU ou référence alternative déjà au catalogue' }); continue; }
  /* ⚠️ NOM ABSENT OU TRONQUÉ : ON N'ÉCARTE PLUS (décision de l'user,
     01/08/2026 — « lorsque l'on va ajouter les photos, je te donnerai la fiche
     technique à chaque fois »). Le motif de refus reposait sur l'idée qu'on ne
     pourrait jamais compléter la fiche ; il ne tient plus.
     La fiche entre avec un libellé EXPLICITEMENT provisoire — jamais un nom
     inventé — et le drapeau `ficheAcompleter` dit exactement lesquelles
     attendent leur descriptif. */
  const nomManquant = !nom || tronque(nom);
  const libelle = nomManquant ? ('Référence ' + sku + ' — descriptif à compléter') : nom;
  if (!(cout > 0)) { refuses.push({ sku, nom, motif: 'coût d\'achat absent — prix impossible sans supposition' }); continue; }

  const titre = MARQUE + ' ' + sku + ' — ' + libelle;
  const fiche = {
    id: MARQUE.toLowerCase() + '-' + sku.toLowerCase(),
    slug: slugifier(MARQUE + '-' + sku + '-' + libelle),
    sku: sku,
    name: sku,
    brand: MARQUE,
    category: famille(libelle),
    title: titre,
    tag: 'Nouveau',
    desc: libelle + '.',
    img: 'images/placeholder.svg',
    currency: 'EUR',
    vat: 0.2,
    stock_status: 'in_stock',
    stock_label: 'En stock',
    model: '',
    ncCategory: 'power_tool',
    productType: 'pro',
    tags: ['cordless'],
    features: [],
    specs: { Marque: MARQUE, Référence: sku },
    /* ⚠️ POIDS SUPPOSÉ, ÉCRIT EXPLICITEMENT. 2 kg est le repli du calculateur
       (`shipFor` : « Number(product.weight_kg) || 2 ») ; on l'inscrit au lieu
       de le laisser deviner, parce qu'un contrôle du projet exige un poids
       valide et parce qu'une valeur implicite ne se corrige jamais.
       `poidsSuppose` dit que ce n'est PAS un relevé : le prix qui en découle
       est à revoir dès que le poids réel est connu. */
    weight_kg: 2,
    poidsSuppose: true,
    ficheAcompleter: nomManquant
  };
  /* ⛔ LE COÛT D'ACHAT NE VA PAS DANS LE FICHIER SERVI. `products.json` est
     téléchargé par tout le monde ; y publier un prix fournisseur est
     IRRÉVERSIBLE — CDN, puis historique git. La porte `check-prix-fuite`
     l'interdit, et elle a refusé cet import à sa première version.
     Le coût part donc dans un relevé NON DÉPLOYÉ, à côté. */
  const coutPrive = cout;
  const reco = modele.recommend(fiche, { costTTC: cout, mode: 'colissimo' });
  if (!reco) { refuses.push({ sku, nom, motif: 'le calculateur n\'a pas pu établir de prix' }); continue; }
  fiche.price_ht = reco.priceHt;
  fiche.price = reco.priceHtFor.price;
  couts[sku] = coutPrive;
  skusExistants.add(sku);
  retenus.push(fiche);
}

const l = (s) => console.log(s);
l('relevé            : ' + liste.length + ' références, marque ' + MARQUE);
l('demandé           : ' + combien);
l('RETENUES          : ' + retenus.length);
l('refusées          : ' + refuses.length);
const parMotif = {};
refuses.forEach((r) => { parMotif[r.motif] = (parMotif[r.motif] || 0) + 1; });
Object.keys(parMotif).forEach((m) => l('   · ' + parMotif[m] + '  ' + m));
l('');
l('catalogue         : ' + produits.length + ' → ' + (produits.length + retenus.length) + ' fiches');
if (retenus.length) {
  l('exemple (1ʳᵉ)     : ' + retenus[0].sku + ' · coût ' + couts[retenus[0].sku]
    + ' € TTC → prix ' + retenus[0].price + ' € TTC (' + retenus[0].price_ht + ' € HT)');
  l('exemple (dernière): ' + retenus[retenus.length - 1].sku + ' · coût '
    + couts[retenus[retenus.length - 1].sku] + ' € → prix ' + retenus[retenus.length - 1].price + ' €');
}

if (essai) { l('\n(--essai : rien n\'a été écrit)'); process.exit(0); }

const fusion = produits.concat(retenus);
/* ⛔ GARDE-FOU : aucun doublon de SKU dans le résultat final. On ne se fie pas
   au fait qu'on ait bien filtré — on le VÉRIFIE avant d'écrire. */
const vus = new Set(); const doublons = [];
fusion.forEach((p) => { const k = String(p.sku || '').toUpperCase();
  if (k && vus.has(k)) doublons.push(k); vus.add(k); });
if (doublons.length) {
  console.error('⛔ REFUS D\'ÉCRIRE : ' + doublons.length + ' doublon(s) de SKU — ' + doublons.slice(0, 5).join(', '));
  process.exit(1);
}
const sortie = Array.isArray(cat) ? fusion : Object.assign({}, cat, { products: fusion });
await writeFile(join(RACINE, 'products.json'), JSON.stringify(sortie, null, 1));
/* Relevé des coûts : hors du site, hors du déploiement (`scratchpad/` est
   dans .gitignore ET dans .vercelignore par construction — il n'est pas suivi). */
await writeFile(join(RACINE, 'scratchpad', 'couts-import-' + MARQUE.toLowerCase() + '.json'),
  JSON.stringify(couts, null, 1));

/* ⛔⛔ LA MOITIÉ QUI MANQUAIT — corrigé le 01/08/2026, après que l'user l'a vu
   avant moi sur son écran d'admin.
   ─────────────────────────────────────────────────────────────────────────
   Cet outil relevait bien les coûts d'achat et les rangeait à l'abri. Ce
   qu'il ne faisait PAS : les rendre INJECTABLES. Le fichier JSON restait là,
   personne ne le chargeait, et le catalogue vivait avec des prix dont le coût
   d'origine était perdu.

   Conséquence mesurée sur l'écran de recalcul : **541 prix « estimés »** —
   c'est-à-dire un coût REMONTÉ À L'ENVERS depuis le prix affiché, puis servant
   à recalculer ce même prix. Un raisonnement circulaire qui confirme toujours
   ce qui existe déjà, et 250 fiches signalées « absentes du traqueur ».

   ⚠️ Et la règle produits est explicite : « un produit dont le coût d'achat
   n'est pas relevé ne reste pas au catalogue ». On avait donc importé en
   violation d'une règle, sans que rien ne le dise.

   On écrit maintenant, À CÔTÉ, un fichier au FORMAT EXACT que le traqueur sait
   avaler (`parseCotebrico`) : il suffit de le coller dans l'écran admin pour
   que chaque coût redevienne un RELEVÉ, et non une supposition.
   ⛔ Ce fichier ne part JAMAIS au dépôt : il porte des prix fournisseur, et
   les publier est irréversible (CDN + historique git). `scratchpad/` n'est ni
   suivi ni déployé. */
const lignesTraqueur = Object.entries(couts)
  .filter(([, c]) => Number(c) > 0)
  .map(([sku, c]) => MARQUE.toUpperCase() + ' ' + String(sku).toUpperCase()
    + ' Prix ' + Number(c).toFixed(2).replace('.', ',') + ' € Ajouter au panier');
const cheminTraqueur = join(RACINE, 'scratchpad',
  'coller-traqueur-' + MARQUE.toLowerCase() + '.txt');
await writeFile(cheminTraqueur, lignesTraqueur.join('\n'));

/* ⚠️ PREUVE AVANT DE LE DIRE : on repasse le texte produit dans le VRAI
   analyseur du traqueur. Annoncer « collez ce fichier » sans avoir vérifié
   qu'il se relit serait exactement le genre de consigne qui fait perdre une
   heure à l'user. */
const { parseCotebrico } = await import('file://' + join(RACINE, 'api/_lib/price-parse.js'))
  .then((m) => m.default || m).catch(() => ({ parseCotebrico: null }));
let relus = null;
if (typeof parseCotebrico === 'function') {
  try { relus = parseCotebrico(lignesTraqueur.join('\n'), MARQUE.toUpperCase()).length; }
  catch (e) { relus = null; }
}
await writeFile(join(RACINE, 'docs', 'IMPORT-REFUSES.md'),
  '# Références REFUSÉES à l\'import du ' + MARQUE + '\n\n'
  + '> Écrites ici plutôt qu\'avalées en silence. Chacune a un motif.\n\n'
  + '| Référence | Libellé | Motif |\n|---|---|---|\n'
  + refuses.map((r) => '| `' + r.sku + '` | ' + (r.nom || '—').replace(/\|/g, '/') + ' | ' + r.motif + ' |').join('\n')
  + '\n');
l('\nécrit : products.json (' + fusion.length + ' fiches) et docs/IMPORT-REFUSES.md');
l('');
l('⛔ CE N\'EST PAS FINI — LES PRIX REPOSENT SUR UNE SUPPOSITION TANT QUE CECI');
l('   N\'EST PAS FAIT. Le catalogue vient de recevoir ' + retenus.length + ' fiches dont le');
l('   coût d\'achat n\'existe QUE dans le fichier ci-dessous. Sans injection, le');
l('   recalcul de prix devine un coût à partir du prix — un cercle qui confirme');
l('   toujours ce qui existe déjà.');
l('');
l('   1. ouvrir  : ' + cheminTraqueur.replace(RACINE + '/', ''));
l('   2. copier tout le contenu');
l('   3. Admin → Traqueur de prix → marque ' + MARQUE.toUpperCase() + ' → coller → lancer');
l('');
l('   lignes prêtes à coller : ' + lignesTraqueur.length
  + (relus === null ? '  (analyseur non vérifiable ici)'
     : relus === lignesTraqueur.length ? '  · ' + relus + ' relues par le VRAI analyseur ✅'
     : '  ⛔ SEULEMENT ' + relus + ' relues — le format ne passe pas, NE PAS COLLER'));
if (relus !== null && relus !== lignesTraqueur.length) process.exitCode = 1;
