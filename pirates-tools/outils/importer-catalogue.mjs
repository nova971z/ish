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

/* Catégorie déduite du libellé fournisseur. Table EXPLICITE : un mot inconnu
   tombe dans « Outillage », il n'invente pas une famille. */
const FAMILLES = [
  [/boulonneuse/i, 'Boulonneuses a chocs'], [/visseuse à chocs|visseuse a chocs/i, 'Visseuses a chocs'],
  [/perceuse|perceuse-visseuse|visseuse/i, 'Perceuses visseuses'], [/meuleuse/i, 'Meuleuses'],
  [/scie circulaire/i, 'Scies circulaires'], [/scie sauteuse/i, 'Scies sauteuses'],
  [/scie|tronçonneuse|tronconneuse/i, 'Scies'], [/perfo|burineur|marteau/i, 'Perforateurs burineurs'],
  [/ponceuse/i, 'Ponceuses'], [/rabot/i, 'Rabots'], [/défonceuse|defonceuse|affleureuse/i, 'Defonceuses'],
  [/aspirateur|souffleur/i, 'Aspirateurs souffleurs'], [/batterie|chargeur|accu/i, 'Batteries et chargeurs'],
  [/coffret|makpac|valise|mallette/i, 'Coffrets'], [/douille|embout|foret|lame|disque|mèche|meche/i, 'Accessoires'],
  [/projecteur|lampe|éclairage|eclairage/i, 'Eclairage'], [/compresseur/i, 'Compresseurs'],
  [/malaxeur|mélangeur|melangeur/i, 'Malaxeurs'], [/cloueur|agrafeuse/i, 'Cloueurs'],
  [/taille-haie|débroussailleuse|debroussailleuse|tondeuse/i, 'Jardin'],
  [/multifonction|oscillant/i, 'Outils multifonctions'], [/pistolet|colle|mastic/i, 'Pistolets']
];
const famille = (n) => (FAMILLES.find(([re]) => re.test(n)) || [null, 'Outillage'])[1];

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
  if (!nom) { refuses.push({ sku, nom, motif: 'nom vide — une fiche sans nom n\'est pas publiable' }); continue; }
  if (tronque(nom)) { refuses.push({ sku, nom, motif: 'nom tronqué par l\'analyse de la source' }); continue; }
  if (!(cout > 0)) { refuses.push({ sku, nom, motif: 'coût d\'achat absent — prix impossible sans supposition' }); continue; }

  const titre = MARQUE + ' ' + sku + ' — ' + nom;
  const fiche = {
    id: MARQUE.toLowerCase() + '-' + sku.toLowerCase(),
    slug: slugifier(MARQUE + '-' + sku + '-' + nom),
    sku: sku,
    name: sku,
    brand: MARQUE,
    category: famille(nom),
    title: titre,
    tag: 'Nouveau',
    desc: nom + '. Fiche technique à compléter.',
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
    poidsSuppose: true
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
await writeFile(join(RACINE, 'docs', 'IMPORT-REFUSES.md'),
  '# Références REFUSÉES à l\'import du ' + MARQUE + '\n\n'
  + '> Écrites ici plutôt qu\'avalées en silence. Chacune a un motif.\n\n'
  + '| Référence | Libellé | Motif |\n|---|---|---|\n'
  + refuses.map((r) => '| `' + r.sku + '` | ' + (r.nom || '—').replace(/\|/g, '/') + ' | ' + r.motif + ' |').join('\n')
  + '\n');
l('\nécrit : products.json (' + fusion.length + ' fiches) et docs/IMPORT-REFUSES.md');
