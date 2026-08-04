#!/usr/bin/env node
'use strict';
/* ══ FUSIONNER NU ET COFFRET SUR UNE SEULE CARTE PRODUIT ═════════════════════
   `node scripts/fusionner-variantes.js [--marque DeWALT] [--confirmer]`

   ⛔ RÈGLE DE L'USER, 04/08/2026, MOT POUR MOT : « avec N / NT / NT-XJ, si la
   référence est la même au début, on a qu'UNE SEULE carte produit et la
   personne peut switcher version sans coffret et version avec coffret ; le
   dénominateur XJ c'est pour la putain de région. »

   ⛔⛔ LA CAUSE QUE CET OUTIL FERME, MESURÉE LE 04/08 :
       fiches DeWALT au catalogue .................. 1105
       fiches DeWALT reliées au switch coffret .....    0
   Le mécanisme existe et tourne — `variantGroup` / `variantRole` /
   `coffretSku` / `soloSku` / `variantSecondary`, 38 fiches Makita s'en
   servent — mais AUCUNE fiche DeWALT n'y était reliée. Chaque carte recevait
   donc son PROPRE coût d'achat depuis idealo ; or les annonces « NT » y sont
   rares et chères. Résultat mesuré : `DCH273NT-XJ` à 586,07 € contre 264,37 €
   pour la version nue — alors que le switch facture 15 € (25 € au-delà de
   3 kg, `pricing.coffretSurchargeCents`). 29 racines portaient 64 cartes.

   CE QUE FAIT L'OUTIL, ET RIEN D'AUTRE :
     · il GROUPE par racine de modèle + contenu de la boîte (batteries,
       chargeur, couleur) — le coffret étant exclu de l'identité ;
     · dans chaque groupe il désigne UNE carte principale : la version SOLO la
       MOINS CHÈRE (règle constante de l'user) ;
     · il pose `variantGroup`, `variantRole`, `coffretSku`/`soloSku`, et
       `variantSecondary: true` sur la carte coffret pour qu'elle sorte de la
       grille et ne vive plus que dans le switch.

   ⛔ IL NE TOUCHE À AUCUN PRIX. Le prix du coffret devient le prix du solo
   plus le supplément du switch, calculé à l'affichage et au paiement par
   `api/_lib/pricing.js`. Réécrire un prix ici doublerait le supplément.

   ⛔⛔ ESSAI PAR DÉFAUT. Sans `--confirmer`, l'outil compte et montre sans
   toucher un octet. Il écrit toujours une SAUVEGARDE horodatée avant d'agir.

   ⚠️ Portes lues : J3 — aucune donnée personnelle ; J4 — aucun prix n'est
   écrit ni recalculé ; J5 — aucune TVA, aucun octroi de mer. */

const fs = require('fs');
const path = require('path');
const priceParse = require('../api/_lib/price-parse.js');
const classer = require('./classer-idealo.js');

const RACINE = path.join(__dirname, '..');

/* ⛔ L'IDENTITÉ D'UN GROUPE : racine de modèle + CONTENU de la boîte. Le
   coffret n'en fait pas partie — c'est tout l'objet de cet outil. Deux
   machines qui ne diffèrent QUE par le coffret partagent donc ce groupe. */
function cleGroupe(fiche) {
  const sku = String(fiche.sku || '').toUpperCase();
  const titre = fiche.title || fiche.name || '';
  return priceParse.racineModele(sku) + '|' + classer.varianteProduit(titre, null);
}

/* ⛔ PURE : elle ne lit ni n'écrit rien, pour être éprouvable sans catalogue.
   Rend les groupes de DEUX faces ou plus qui mêlent solo et coffret. */
function grouper(fiches) {
  const par = new Map();
  (fiches || []).forEach((p) => {
    const k = cleGroupe(p);
    if (!par.has(k)) par.set(k, []);
    par.get(k).push(p);
  });
  const fusionnables = [], seuls = [];
  par.forEach((liste, k) => {
    const solos = liste.filter((p) => classer.roleCoffret(p.title || p.name, p.sku) === 'solo');
    const coffrets = liste.filter((p) => classer.roleCoffret(p.title || p.name, p.sku) === 'coffret');
    /* ⛔ Il faut LES DEUX faces : un groupe qui n'a que des solos n'a rien à
       fusionner, et un groupe qui n'a QUE des coffrets n'a pas de version nue
       à afficher par défaut — on n'invente pas la face manquante. */
    if (!solos.length || !coffrets.length) { seuls.push({ cle: k, liste: liste }); return; }
    /* La carte principale est le SOLO LE MOINS CHER — règle constante de
       l'user, et c'est elle qui portera le coût d'achat du traqueur. */
    const prix = (p) => (typeof p.price === 'number' && p.price > 0) ? p.price : Infinity;
    const solo = solos.slice().sort((a, b) => prix(a) - prix(b))[0];
    const coffret = coffrets.slice().sort((a, b) => prix(a) - prix(b))[0];
    fusionnables.push({ cle: k, solo: solo, coffret: coffret,
      autresSolos: solos.filter((p) => p !== solo),
      autresCoffrets: coffrets.filter((p) => p !== coffret) });
  });
  return { fusionnables: fusionnables, seuls: seuls };
}

/* ⛔ Applique la liaison sur des OBJETS, sans écrire : le même code sert à
   l'essai et à la confirmation, donc l'essai montre exactement ce qui sera
   écrit. Un essai qui emprunte un autre chemin ne prouve rien. */
function lier(g) {
  const groupe = priceParse.racineModele(String(g.solo.sku || '').toUpperCase());
  g.solo.variantGroup = groupe;
  g.solo.variantRole = 'solo';
  g.solo.coffretSku = g.coffret.sku;
  delete g.solo.soloSku;
  delete g.solo.variantSecondary;
  g.coffret.variantGroup = groupe;
  g.coffret.variantRole = 'coffret';
  g.coffret.soloSku = g.solo.sku;
  delete g.coffret.coffretSku;
  /* ⛔ La carte coffret SORT de la grille : `app.js` l'exclut sur ce drapeau
     (ligne 1369). Sans lui, le client verrait toujours deux cartes. */
  g.coffret.variantSecondary = true;
  return groupe;
}

function principal(argv) {
  const iM = argv.indexOf('--marque');
  const marque = iM !== -1 ? argv[iM + 1] : 'DeWALT';
  const confirmer = argv.indexOf('--confirmer') !== -1;

  const fCat = path.join(RACINE, 'products.json');
  const brut = JSON.parse(fs.readFileSync(fCat, 'utf8'));
  const tous = Array.isArray(brut) ? brut : (brut.products || []);
  /* ⛔ « on ne touche pas à ma Makita » : le filtre de marque est explicite et
     en amont. Aucune fiche d'une autre marque n'est même regardée. */
  const cibles = tous.filter(
    (p) => String(p.brand || '').toUpperCase() === marque.toUpperCase());

  const avantLies = cibles.filter((p) => p.variantGroup).length;
  const g = grouper(cibles);

  const l = (s) => console.log(s);
  l('');
  l('═══ FUSION NU / COFFRET — ' + marque.toUpperCase() + ' ═══');
  l('');
  l('  fiches ' + marque + ' ........................ ' + cibles.length);
  l('  déjà reliées au switch AVANT ......... ' + avantLies);
  l('  groupes à fusionner .................. ' + g.fusionnables.length);
  l('  cartes concernées .................... '
    + g.fusionnables.reduce((s, x) => s + 2 + x.autresSolos.length + x.autresCoffrets.length, 0));
  l('');
  l('  Aperçu (les 10 premiers) :');
  g.fusionnables.slice(0, 10).forEach((x) => {
    l('     ' + String(x.solo.sku).padEnd(15) + String(x.solo.price).padEnd(9)
      + '(carte gardée)   ⟷  ' + String(x.coffret.sku).padEnd(15)
      + String(x.coffret.price).padEnd(9) + '(passe dans le switch)');
  });
  const restants = g.fusionnables.reduce((s, x) => s + x.autresSolos.length + x.autresCoffrets.length, 0);
  if (restants) {
    l('');
    l('  ⚠️ ' + restants + ' carte(s) en TROP dans des groupes déjà pourvus des deux faces :');
    l('     elles ne sont NI liées NI supprimées — une troisième face ne se');
    l('     range pas toute seule, et l\'inventer serait pire que la laisser.');
    g.fusionnables.forEach((x) => x.autresSolos.concat(x.autresCoffrets)
      .slice(0, 3).forEach((p) => l('       · ' + p.sku + '  ' + p.price + ' €')));
  }

  if (!confirmer) {
    l('');
    l('  ⚠️ ESSAI — rien n\'a été écrit. --confirmer pour agir.');
    l('');
    return 0;
  }

  /* ⛔ SAUVEGARDE AVANT TOUT GESTE. Le catalogue est la source de vérité des
     prix : on ne le réécrit jamais sans un retour arrière d'une commande. */
  const sauve = path.join(RACINE, 'archives',
    'products-avant-fusion-variantes.json');
  fs.mkdirSync(path.dirname(sauve), { recursive: true });
  fs.writeFileSync(sauve, JSON.stringify(brut, null, 1));

  const groupes = g.fusionnables.map(lier);

  /* ⛔ ON RELIT CE QU'ON VIENT DE CONSTRUIRE AVANT D'ÉCRIRE. Un lien à sens
     unique (solo → coffret sans le retour) casserait le switch en silence. */
  const parSku = new Map(tous.map((p) => [String(p.sku).toUpperCase(), p]));
  const casses = [];
  tous.forEach((p) => {
    if (!p.variantGroup) return;
    const autre = p.variantRole === 'coffret' ? p.soloSku : p.coffretSku;
    const cible = parSku.get(String(autre || '').toUpperCase());
    if (!cible) { casses.push(p.sku + ' → ' + autre + ' (introuvable)'); return; }
    if (cible.variantGroup !== p.variantGroup) casses.push(p.sku + ' ↔ ' + autre + ' (groupes différents)');
    const retour = cible.variantRole === 'coffret' ? cible.soloSku : cible.coffretSku;
    if (String(retour || '').toUpperCase() !== String(p.sku).toUpperCase()) {
      casses.push(p.sku + ' ↔ ' + autre + ' (le lien retour ne revient pas)');
    }
  });
  if (casses.length) {
    console.error('');
    console.error('⛔ REFUS D\'ÉCRIRE : ' + casses.length + ' liaison(s) incohérente(s) —');
    casses.slice(0, 5).forEach((c) => console.error('     ' + c));
    console.error('   Le catalogue n\'a PAS été modifié (sauvegarde : '
      + path.relative(RACINE, sauve) + ').');
    return 1;
  }

  const sortie = Array.isArray(brut) ? tous : Object.assign({}, brut, { products: tous });
  fs.writeFileSync(fCat, JSON.stringify(sortie, null, 1));

  l('');
  l('  ✅ ' + groupes.length + ' groupe(s) fusionné(s) — ' + groupes.length
    + ' carte(s) coffret sortie(s) de la grille');
  l('  liaisons relues et cohérentes ........ ' + (tous.filter((p) => p.variantGroup).length / 2) + ' paires');
  l('  sauvegarde ........................... ' + path.relative(RACINE, sauve));
  l('');
  l('  ⛔ Aucun prix n\'a été touché : le coffret se facture par le switch');
  l('     (pricing.coffretSurchargeCents), 15 € ou 25 € au-delà de 3 kg.');
  l('');
  return 0;
}

module.exports = { cleGroupe: cleGroupe, grouper: grouper, lier: lier };

if (require.main === module) process.exit(principal(process.argv.slice(2)));
