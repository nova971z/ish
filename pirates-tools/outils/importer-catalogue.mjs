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
/* La racine de modèle vit dans le parseur du traqueur : une seconde copie ici
   divergerait au premier correctif (O6, la copie périmée). */
const priceParse = require(join(RACINE, 'api/_lib/price-parse.js'));

const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
const combien = Number(args.find((a) => /^\d+$/.test(a))) || 600;
const essai = args.includes('--essai');
if (!source) { console.error('usage : node outils/importer-catalogue.mjs <releve.json> [600] [--essai]'); process.exit(2); }

const releve = JSON.parse(await readFile(source, 'utf8'));
const liste = releve.unknown || releve.items || (Array.isArray(releve) ? releve : []);
const marque = String(releve.brand || 'Makita');

/* ── ACCESSOIRES SANS RÉF : ILS ENTRENT PAR LEUR NOM (règle user, 02/08) ──
   « Ce qui est important, c'est les références exactes et comment sont
   NOMMÉS les produits s'il n'y a pas de référence. » Le relevé porte
   `sansRef: [{ titre, prix }]` : l'identité de ces fiches est le TITRE
   EXACT du site, posé en `srcNom` — c'est lui que le traqueur appariera à
   chaque passage. ⛔ Un titre vu PLUSIEURS fois sur la page (trois « Lame …
   Ø184 mm » mesurées) n'identifie rien : refusé, avec motif. */
const sansRefBruts = (Array.isArray(releve.sansRef) ? releve.sansRef : [])
  /* Les PACKS entrent par la même porte depuis le 02/08/2026 (décision de
     l'user : il les VEUT au catalogue). Leur identité est le titre exact —
     jamais la réf d'un composant. Les vieux relevés portaient des CHAÎNES
     sans prix : filtrées, un import sans coût est interdit plus bas. */
  .concat(Array.isArray(releve.packsIgnores) ? releve.packsIgnores : [])
  .filter((e) => e && typeof e === 'object' && e.titre)
  .map((e) => ({ _nom: true, titre: String((e && e.titre) || '').trim(), srcTTC: Number((e && e.prix) || 0) }));
const freqTitres = {};
sansRefBruts.forEach((e) => { if (e.titre) freqTitres[e.titre] = (freqTitres[e.titre] || 0) + 1; });
/* Empreinte stable d'un nom → pseudo-sku interne (jamais montré comme réf). */
const hash8 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, '0'); };

const cat = JSON.parse(await readFile(join(RACINE, 'products.json'), 'utf8'));
const produits = Array.isArray(cat) ? cat : (cat.products || []);
/* ⚠️ LA GRAPHIE DE LA MARQUE VIENT DU CATALOGUE, PAS D'UN CALCUL — attrapé
   avant le 1er import DEWALT (01/08/2026) : « DEWALT » se serait écrit
   « Dewalt » là où 43 fiches disent « DeWALT ». Deux graphies = deux
   familles dans les filtres du site, et la moitié du catalogue invisible
   pour le client qui filtre par marque. Si une fiche porte déjà la marque,
   sa graphie fait foi ; sinon seulement, repli sur la forme calculée. */
const grapheePortee = produits.map((p) => String(p.brand || ''))
  .find((b) => b.toUpperCase() === marque.toUpperCase());
const MARQUE = grapheePortee || (marque.charAt(0) + marque.slice(1).toLowerCase());
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

/* ⛔⛔ LE DOUBLON SE LIT SUR LA RACINE DE MODÈLE, PAS SUR L'ÉCRITURE EXACTE.
   RÈGLE DE L'USER, 04/08/2026 : « tu ne regardes plus les lettres après les
   numéros — tu te bases sur la description du produit et sur les premières
   lettres, ainsi que les numéros qui viennent après. »
   MESURÉ sur l'import DeWALT du jour : le contrôle par SKU exact voyait
   67 doublons ; il en RATAIT 133. Passaient à travers `DE7035` alors que
   `DE7035-XJ` est au catalogue, `DCD709N-XJ` face à `DCD709NT-XJ`,
   `DCV100XJ` face à `DCV100-XJ`. Chacune aurait créé une seconde fiche pour
   le même outil — deux prix, deux stocks, un client qui ne sait plus laquelle
   acheter, et le traqueur qui écrit sur l'une pendant que l'autre dérive.
   ⚠️ La racine seule ne suffit pas à trancher : elle réunit le nu, le coffret
   et le kit. C'est pourquoi le refus ci-dessous NOMME la fiche déjà présente,
   pour qu'un rapprochement discutable se voie au lieu de disparaître. */
const racinesExistantes = new Map();   // racine de modèle → sku de la fiche
[...skusExistants].forEach((s) => {
  const r = priceParse.racineModele(s);
  if (r && !racinesExistantes.has(r)) racinesExistantes.set(r, s);
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
/* ⚠️ TABLE RÉALIGNÉE le 01/08/2026 au soir : les familles ont été REGROUPÉES
   depuis le 1er import (demande D-45 de l'user — 20 familles). L'ancienne
   table visait « Meuleuses », « Ponceuses », « Élagage »… qui n'existent
   plus : la porte d'entrée de cet outil a refusé de tourner — c'est son
   rôle. Chaque cible ci-dessous est MESURÉE dans products.json. */
const FAMILLES = [
  /* ⛔ RÈGLE DE L'USER (02/08/2026), et son ordre compte : « tout ce qui
     relève de la quincaillerie — lames, mèches, fraises… — on garde, et ça
     va dans la partie Quincaillerie ». AVANT /scie/ sinon « Lame de scie
     circulaire » tomberait dans les Scies. */
  [/lame|mèche|meche|fraise de|fraises de|foret|douille|embout|scie[- ]cloche|burin|taillant|plateau de surfaçage|disque|chaîne|chaine|\bvis\b|recharge de fil|bobine avec fil|toughcase|pi[èe]ces de vissage|pi[èe]ces de per[çc]age/i, 'Quincaillerie'],
  [/boulonneuse|visseuse|perceuse|cliquet/i, 'Perçage, vissage et boulonnage'],
  [/meuleuse|découpeuse|decoupeuse|ponceuse|polisseuse|lime à bande|lime a bande/i, 'Meulage, découpe et polissage'],
  [/tronçonneuse|tronconneuse|taille[- ]haie|débroussailleuse|debroussailleuse|tondeuse|élagueuse|elagueuse|sécateur|secateur|souffleur/i, 'Tronçonnage et élagage'],
  [/scie|multicutter/i, 'Scies'],
  [/perfo|burineur|marteau|piqueur/i, 'Perforateurs'],
  [/rabot/i, 'Rabots'],
  [/défonceuse|defonceuse|affleureuse|fraiseuse/i, 'Défonceuses'],
  [/aspirateur/i, 'Aspirateurs'],
  [/batterie|chargeur|accu|adaptateur secteur/i, 'Batteries et chargeurs'],
  [/coffret|makpac|tstak|toughsystem|valise|mallette|sac|caisse/i, 'Rangements'],
  [/lamelleuse/i, 'Lamelleuses'],
  [/riveteuse/i, 'Riveteuses'],
  [/tarière|tariere/i, 'Tarières'],
  [/malaxeur|mélangeur|melangeur/i, 'Malaxeurs'],
  [/cloueur|agrafeuse/i, 'Cloueurs'],
  [/multifonction|oscillant/i, 'Outils multifonctions'],
  [/combo|pack |kit /i, 'Combos'],
  /* Tout le reste — lasers, télémètres, radios, projecteurs, compresseurs,
     nettoyeurs, ventouses… — tombe dans « Accessoires », qui existe déjà.
     Mieux vaut une famille large et VISIBLE qu'une famille juste et fantôme. */
];
const famille = (n) => (FAMILLES.find(([re]) => re.test(n)) || [null, 'Accessoires'])[1];

/* ⛔⛔ LE RAYON MESURÉ PAR LE CLASSEMENT PRIME SUR LE TITRE — gravé le
   04/08/2026 après une faute chiffrée. L'import DeWALT a rangé **779 fiches
   sur 931 dans « Accessoires »**, le fourre-tout : des clous, des forets
   SDS-max, des agrafes, des jeux de tournevis. Cause : la table FAMILLES
   ci-dessus lit le LIBELLÉ, or 725 titres sur 1254 ne sont que la référence —
   aucun motif ne pouvait mordre.
   ⛔ Le classement, lui, avait déjà tranché : chaque ligne du CSV porte sa
   famille et son rayon, mesurés sur l'annonce et validés par l'user. Les jeter
   pour les redeviner moins bien, c'est O5 — l'outil artisanal à la place de
   l'outil existant.
   ⚠️ Une famille « Quincaillerie » l'emporte quel que soit le rayon : c'est la
   demande de l'user (« la quincaillerie avec la quincaillerie »). Un rayon
   inconnu ne tombe PAS en silence dans Accessoires — il est compté et dit. */
const RAYON_VERS_FAMILLE = {
  percage: 'Perçage, vissage et boulonnage',
  'vissage-choc': 'Perçage, vissage et boulonnage',
  fixation: 'Perçage, vissage et boulonnage',
  sciage: 'Scies',
  bois: 'Scies',
  meulage: 'Meulage, découpe et polissage',
  perforation: 'Perforateurs',
  jardin: 'Tronçonnage et élagage',
  aspiration: 'Aspirateurs',
  batterie: 'Batteries et chargeurs',
  chargeur: 'Batteries et chargeurs',
  combo: 'Combos',
  /* `mesure` (lasers, télémètres), `chantier` (règle vibrante, pilonneuse) et
     `confort` n'ont pas de famille dédiée au catalogue : Accessoires est ici
     un choix, pas un repli — et il est écrit. */
  mesure: 'Accessoires',
  chantier: 'Accessoires',
  confort: 'Accessoires'
};

let rayonsInconnus = {};
function familleDepuisClassement(it) {
  if (!it) return null;
  const fam = String(it.familleIdealo || '');
  if (/quincaillerie/i.test(fam)) return 'Quincaillerie';
  if (/v[êe]tement/i.test(fam)) return null;      // pas de famille vêtements au catalogue
  const r = String(it.rayonIdealo || '').toLowerCase();
  if (!r) return null;
  if (RAYON_VERS_FAMILLE[r]) return RAYON_VERS_FAMILLE[r];
  rayonsInconnus[r] = (rayonsInconnus[r] || 0) + 1;
  return null;
}


/* ⛔⛔ FAMILLES DÉLIBÉRÉMENT ROUVERTES — déclarées ICI, une par une, avec la
   raison. Rien d'autre ne passe.
   Le 04/08/2026, la porte ci-dessous a refusé l'import DeWALT sur
   « Quincaillerie » et « Combos ». Elle avait raison de parler, mais pas de
   conclure : ces deux familles ne sont PAS des fautes de frappe. Elles sont à
   ZÉRO fiche parce qu'on les a vidées le jour même — la Quincaillerie en
   supprimant les fiches clickoutil, les Combos en archivant les 281 packs
   (`archives/packs-archives.json`, tout est récupérable).
   ⛔ Une famille vidée n'est pas une famille inexistante : la première se
   rouvre, la seconde est un bug d'orthographe. La porte ne savait pas les
   distinguer — maintenant si, et seulement sur déclaration explicite.
   ⚠️ Demande de l'user, 04/08/2026 : « fais attention à … créer les bonnes
   catégories », et pour la quincaillerie : « la quincaillerie avec la
   quincaillerie … on vendra des packs de cinq ou de 10 ». */
const FAMILLES_ROUVERTES = {
  'Quincaillerie': 'vidée le 04/08 avec les fiches clickoutil ; l\'user la veut explicitement',
  'Combos': 'vidée le 04/08 par l\'archivage des 281 packs (récupérables) ; les packs idealo y retournent'
};

/* ⛔ PRÉALABLE : chaque cible doit EXISTER au catalogue, ou être déclarée
   rouverte ci-dessus. Sans ce contrôle, une faute de frappe recréerait une
   famille fantôme sans que rien ne le dise. */
{
  const connues = new Set(produits.map((p) => p.category).filter(Boolean));
  const inconnues = [...new Set(FAMILLES.map(([, c]) => c).concat(['Accessoires']))]
    .filter((c) => !connues.has(c) && !FAMILLES_ROUVERTES[c]);
  if (inconnues.length) {
    console.error('⛔ REFUS : ces catégories cibles n\'existent PAS au catalogue — '
      + inconnues.join(', ') + '. Corrige la table avant d\'importer : une famille '
      + 'inventée coupe en deux une famille existante et devient invisible.\n'
      + '   (Si elle a été VIDÉE et doit rouvrir, déclare-la dans FAMILLES_ROUVERTES '
      + 'avec sa raison — jamais en silence.)');
    process.exit(1);
  }
  const rouvertes = Object.keys(FAMILLES_ROUVERTES).filter((c) => !connues.has(c));
  rouvertes.forEach((c) => console.log('⚠️  famille ROUVERTE : ' + c + ' — ' + FAMILLES_ROUVERTES[c]));
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
for (const it of liste.concat(sansRefBruts)) {
  if (retenus.length >= combien) break;
  let sku, nom;
  if (it._nom) {
    nom = it.titre;
    /* Une entrée par NOM doit finir par la marque — « GRABO », « BOSCH » ou
       un titre orphelin ne sont pas des fiches de cette marque. */
    if (!new RegExp(marque.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i').test(nom)) {
      refuses.push({ sku: '(nom)', nom, motif: 'titre sans la marque en fin — pas une fiche ' + MARQUE }); continue;
    }
    if (freqTitres[nom] > 1) {
      refuses.push({ sku: '(nom)', nom, motif: 'nom en DOUBLON sur la page — n\'identifie aucun produit précis' }); continue;
    }
    sku = 'AC-' + hash8(nom.toUpperCase()).toUpperCase();
  } else {
    sku = String(it.sku || '').trim().toUpperCase();
    nom = String(it.name || '').trim();
  }
  const cout = Number(it.srcTTC || 0);
  if (!sku) { refuses.push({ sku, nom, motif: 'référence absente' }); continue; }
  if (skusExistants.has(sku)) { refuses.push({ sku, nom, motif: 'DOUBLON — SKU ou référence alternative déjà au catalogue' }); continue; }
  /* ⛔ ARGENT : même racine de modèle ⇒ même outil. Le refus NOMME la fiche
     déjà au catalogue, pour qu'un rapprochement discutable reste visible. */
  const racineSku = priceParse.racineModele(sku);
  if (racinesExistantes.has(racineSku)) {
    refuses.push({ sku, nom, motif: 'DOUBLON par racine de modèle — le catalogue porte déjà ' + racinesExistantes.get(racineSku) });
    continue;
  }
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
  /* ⛔ RÈGLE DE L'USER (02/08/2026) : « les moulages de coffrets, il ne faut
     absolument pas les ajouter en produits ». Un moulage/insert est une pièce
     interne de rangement, pas un produit du magasin — et sa réf, quand il en
     cite une, est souvent celle de L'OUTIL qu'il épouse (vu : « Moulage
     TSTAK II pour meuleuse DCG405 »). */
  if (/moulage|insert\b/i.test(libelle)) { refuses.push({ sku, nom, motif: 'moulage/insert de coffret — jamais un produit (règle user 02/08)' }); continue; }
  /* ⛔ RÈGLE DE L'USER (02/08/2026) : « il ne faut absolument pas mettre en
     ligne les coffrets TSTAK » — les boîtes de rangement vides (« Coffret
     TSTAK … », « Coffret de transport TSTAK »…). Les coffrets GARNIS de
     quincaillerie (« Coffret de 29 forets », Toughcase) restent : c'est du
     consommable, pas du rangement. */
  if (/coffret/i.test(libelle) && /tstak|toughsystem|t[- ]stak/i.test(libelle)) {
    refuses.push({ sku, nom, motif: 'coffret TSTAK/TOUGHSYSTEM — jamais mis en ligne (règle user 02/08)' }); continue;
  }

  /* Entrée par NOM : le libellé est le titre du site SANS la marque finale,
     et le pseudo-sku interne n'apparaît jamais comme une référence. */
  const libelleNet = it._nom
    ? libelle.replace(new RegExp('\\s*' + marque.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim()
    : libelle;
  const titre = it._nom ? (MARQUE + ' — ' + libelleNet) : (MARQUE + ' ' + sku + ' — ' + libelleNet);
  const fiche = {
    id: MARQUE.toLowerCase() + '-' + sku.toLowerCase(),
    slug: slugifier(MARQUE + '-' + sku + '-' + libelle),
    sku: sku,
    name: sku,
    brand: MARQUE,
    /* Le rayon mesuré d'abord ; la table de libellés seulement s'il manque. */
    category: familleDepuisClassement(it) || famille(libelle),
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
  fiche.desc = libelleNet + '.';
  /* Entrée par NOM : `srcNom` est l'identité de suivi (le titre EXACT du
     site), et le pseudo-sku ne s'affiche jamais comme référence. */
  if (it._nom) { fiche.srcNom = nom; fiche.specs = { Marque: MARQUE }; }
  /* Un PACK (titre à « + ») va TOUJOURS en Combos — la famille dédiée aux
     lots. Sans ce forçage, « Scie … + 2 batteries » partait dans les Scies
     et le lot se mélangeait aux machines seules. */
  if (it._nom && /\s\+\s/.test(nom)) fiche.category = 'Combos';
  /* ⚠️ QUINCAILLERIE (règle user, 02/08) : envoi en LETTRE, 6 à 8 € —
     le modèle facture 8 € (borne haute, la marge ne se sous-estime pas)
     dès que le poids passe sous son seuil lettre. Délai annoncé : 7 à
     14 jours. Poids supposé, comme le reste, à revoir au réel. */
  if (fiche.category === 'Quincaillerie') {
    fiche.weight_kg = 0.4;
    fiche.desc += ' Envoi en lettre suivie — livraison 7 à 14 jours.';
  }
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
  racinesExistantes.set(racineSku, sku);   // deux entrées du MÊME relevé ne passent pas deux fois
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
{
  const inc = Object.keys(rayonsInconnus);
  if (inc.length) {
    l('⚠️  rayons du classement NON mappés (repli sur le libellé) :');
    inc.sort((a, b) => rayonsInconnus[b] - rayonsInconnus[a])
      .forEach((r) => l('     · ' + rayonsInconnus[r] + '  ' + r));
  }
}
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
