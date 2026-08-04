#!/usr/bin/env node
'use strict';
/* ══ CLASSER TOUT CE QUE LE BALAYAGE IDEALO A RAMENÉ ═════════════════════════
   `node scripts/classer-idealo.js <dossier-des-reponses> [--sortie <dossier>]`

   ⛔ DEMANDE DE L'USER, 04/08, MOT POUR MOT : « d'abord tu vas classer
   absolument tout sur ces 67 pages, tout l'électro portatif avec l'électro
   portatif, la quincaillerie avec la quincaillerie et les vêtements avec les
   vêtements, et tu me mets ça dans un fichier que je peux télécharger. Tu
   ranges correctement les 4020 produits. Tu vires les doublons et tu prends
   les moins chers. Tu vas définir combien il y a d'outils seuls au total,
   combien il y a de packs au total, ensuite tu élimines les doublons en
   gardant les moins chers, et pareil tu me dis combien il en reste. Et tu
   respectes exactement la même action avec la quincaillerie et les vêtements. »

   ⛔⛔ PAS DE TABLEAU DANS LA RÉPONSE. Sa consigne : « je ne veux plus jamais
   que tu me refasses un putain de tableau comme ça — tu utilises des canevas
   comme pour le code, que je puisse sélectionner et copier-coller exactement
   ce que j'ai envie ». La sortie est donc un FICHIER : CSV pour être ouvert
   dans Numbers sur son iPad, JSON pour la reprise par le code.

   ⚠️ Le CSV part avec un BOM UTF-8 et le point-virgule en séparateur : sans
   BOM, Numbers et Excel lisent « Perçage » comme « PerÃ§age » ; avec la
   virgule, tout prix français (« 249,90 ») casse la colonne.

   ⛔ CE QUI FAIT FOI POUR LA FAMILLE. Le parseur rend déjà `car.famille` et
   `car.rayon`, mesurés sur l'annonce elle-même — c'est la source. Le titre
   n'est consulté QUE si la famille est absente, et le classement dit alors
   par quel signal il a été obtenu (`signal` dans le CSV). Un produit qu'aucun
   des deux signaux ne tranche part dans « À TRANCHER » et n'est PAS distribué
   au hasard dans une des trois familles : une ignorance ne vote pas.

   ⛔ LA CLÉ DE DOUBLON SUIT LA RÈGLE DE L'USER, 04/08 — seconde version, qui
   ANNULE la première (celle qui gardait les lettres après les chiffres) :
   « tu ne regardes plus les lettres après les numéros — tu te bases sur la
   description du produit et sur les premières lettres, ainsi que les numéros
   qui viennent après ». Racine de modèle (lettres + chiffres, `racineModele`)
   + VARIANTE lue dans la description (outil / pack / accessoire), doublons
   virés, le moins cher gagne. Voir `cleDoublon` plus bas.

   ⚠️ Portes lues : J3 — des annonces publiques d'outillage, aucune donnée
   personnelle ; J4 — aucun prix n'est recalculé ni écrit, on relève ceux des
   annonces tels quels ; J5 — aucune TVA, aucun octroi de mer. */

const fs = require('fs');
const path = require('path');
const priceParse = require('../api/_lib/price-parse.js');

/* ══ 1. LES TROIS FAMILLES COMMERCIALES ════════════════════════════════════
   ⛔ La table est écrite ICI, en clair, et pas enfouie dans une condition :
   déplacer une famille entière doit coûter UNE ligne. `energie` (batteries,
   chargeurs) va à l'électro portatif — c'est la plateforme d'alimentation des
   machines sans fil, jamais de la visserie. `rangement` (coffrets TSTAK,
   mobilier d'atelier, portage) va à la quincaillerie. */
const FAMILLE_VERS_RAYON = {
  machine: 'ELECTRO_PORTATIF',
  energie: 'ELECTRO_PORTATIF',
  consommable: 'QUINCAILLERIE',
  rangement: 'QUINCAILLERIE',
  epi: 'VETEMENTS'
};

const LIBELLE = {
  ELECTRO_PORTATIF: 'Électro portatif',
  QUINCAILLERIE: 'Quincaillerie',
  VETEMENTS: 'Vêtements & EPI',
  A_TRANCHER: 'À trancher'
};

/* Repêchage par le titre — UNIQUEMENT quand `car.famille` est vide. Chaque
   motif a été tiré des 104 annonces réellement restées sans famille au premier
   passage, jamais inventé, et les langues suivent ce qu'idealo publie : les
   fiches allemandes, polonaises et espagnoles sont dans le même flux.

   ⛔ L'ORDRE COMPTE, et il est délibéré : le vêtement d'abord (un « sac à dos
   pour outils » est un portage, pas une perceuse), la quincaillerie ensuite,
   l'électro en dernier — parce que « kit » et « batterie » apparaissent dans
   des titres de consommables et emporteraient tout s'ils passaient devant. */
/* ⛔⛔ LES ACCENTS SE RETIRENT AVANT DE CHERCHER, ET C'EST UN DÉFAUT PAYÉ.
   Premier jet : `/\b[ée]couteurs?/i` sur « Écouteurs True Wireless » — jamais
   trouvé. `\b` est une frontière ASCII : entre le début de chaîne et `É`, qui
   n'est pas un caractère de mot ASCII, il n'y a AUCUNE frontière. Le motif
   avait l'air juste, il ne mordait rien, et les écouteurs partaient en
   « à trancher » sans que rien ne le dise.
   ⚠️ Même piège pour l'allemand : `\bnagel` ne trouve pas « StreifenNAGEL »,
   parce qu'un composé n'a pas de frontière au milieu. D'où deux jeux de
   motifs — MOT (frontière exigée) et FRAGMENT (n'importe où). */
function sansAccents(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* MOT — la frontière est exigée : « vis » ne doit pas attraper « visseuse ». */
const MOTS = [
  ['VETEMENTS', /\b(vestes?|pantalons?|blousons?|sweats?|t-?shirts?|polos?|casquettes?|bonnets?|gants?|chaussures?|bottes?|bottines?|genouilleres?|salopettes?|parkas?|softshell|gilets?|combinaisons?|harnais|hats?|caps?|jackets?|trousers|boots?|gloves?|sac a dos)\b/],
  ['QUINCAILLERIE', /\b(forets?|meches?|lames?|disques?|embouts?|douilles?|vis|chevilles?|fraises?|burins?|ciseaux?|abrasifs?|mallettes?|assortiment|rangement|servante|etablis?|cadenas|equerres?|clous?|ongles|taloches?|spatules?|truelles?|enclume|pietements?|legstand|supports?|treteaux?|ebrancheurs?|wrench|couronnes?|corona|nozzle|buses?|tuyaux?|raccords?|dents?|denture|jerricane|caisse|boite|tige telescopique|sac a outils|scies? cloche|papier de verre|jeu de|set de|coffrets? de|kit d.accessoires|niveau a bulle|cabeza|core bit|forage bit|griff)\b/],
  ['ELECTRO_PORTATIF', /\b(perceuses?|visseuses?|meuleuses?|scies?|perforateurs?|marteaux?|ponceuses?|rabots?|defonceuses?|cloueurs?|agrafeuses?|aspirateurs?|souffleurs?|tronconneuses?|tondeuses?|debroussailleuses?|compresseurs?|lasers?|projecteurs?|lampes?|radios?|chargeurs?|batteries?|accus?|kits?|combo|multitool|routeurs?|decoupeurs?|nettoyeurs?|pompes?|ventilateurs?|surfaceuses?|riveteuses?|pistolets?|pilonneuses?|enrouleurs?|ecouteurs?|earphones?|headphones?|bluetooth|cables?|grzechotka|zszywacz|vacuum|cleaner|reservoir|taille-?haies?|outil multifonctions?|poste a souder|regle vibrante|sous vide|casques? audio)\b/]
];

/* FRAGMENT — sans frontière, pour les composés allemands et les marques
   collées. Chaque entrée vient d'un titre réellement vu dans le balayage. */
const FRAGMENTS = [
  ['QUINCAILLERIE', /(nagel|nagle|spachtel|bohrkrone|lochsage|lochsaege|werkzeugset|schrauben|klingen|stauchkopf|einsatz)/],
  ['ELECTRO_PORTATIF', /(schrauber|bohrhammer|saege|schleifer|akkupack|staubsauger)/]
];

/* ⛔ FONCTION PURE — aucune lecture disque, pour être éprouvable sans balayage.
   Rend TOUJOURS `{ rayon, signal }` : le signal dit d'où vient le verdict, et
   c'est lui qui permet de contester un classement sans relire tout le code. */
function classer(car, titre) {
  const c = car || {};
  const t = sansAccents(titre);
  /* ⛔⛔⛔ CE QUE L'ARTICLE **EST** PRIME SUR CE POUR QUOI IL SERT.
     Défaut attrapé à l'essai le 04/08, avant écriture : « 34° Clous en bande
     2,8x70mm … Cloueur sans fil DeWalt DCN930P2 » était rangé en ÉLECTRO
     PORTATIF — le parseur avait vu « cloueur » et conclu « machine ». Ce sont
     des CLOUS. Leur coût de 87,19 € allait devenir celui du cloueur, vendu
     465,30 €.
     ⛔ La règle : un mot de quincaillerie dans la TÊTE du titre (les 45
     premiers signes, là où un titre dit ce qu'il vend) l'emporte sur la
     famille devinée. La queue du titre, elle, nomme souvent la machine
     compatible — c'est ce qui trompait la mesure. */
  const tete = t.slice(0, 45);
  const motQuinc = MOTS.find((m) => m[0] === 'QUINCAILLERIE');
  if (motQuinc && motQuinc[1].test(tete)) {
    return { rayon: 'QUINCAILLERIE', signal: 'tête du titre (consommable)' };
  }
  const parFamille = FAMILLE_VERS_RAYON[String(c.famille || '')];
  if (parFamille) return { rayon: parFamille, signal: 'famille:' + c.famille };
  for (let i = 0; i < MOTS.length; i++) {
    if (MOTS[i][1].test(t)) return { rayon: MOTS[i][0], signal: 'titre' };
  }
  for (let i = 0; i < FRAGMENTS.length; i++) {
    if (FRAGMENTS[i][1].test(t)) return { rayon: FRAGMENTS[i][0], signal: 'titre-fragment' };
  }
  /* ⛔ Aucun signal : on le DIT. Le ranger d'office en électro portatif
     gonflerait la famille la plus grosse d'un chiffre invérifiable. */
  return { rayon: 'A_TRANCHER', signal: 'aucun' };
}

/* ══ 2. LA CLÉ DE DOUBLON ══════════════════════════════════════════════════
   Trois niveaux, du plus sûr au moins sûr, et le niveau retenu est écrit dans
   le CSV : un dédoublonnage par titre normalisé n'a pas la même force qu'un
   dédoublonnage par référence, et le cacher serait mentir sur la précision. */
function normaliserTitre(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(dewalt|de\s*walt)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ⛔⛔⛔ LA RÈGLE DE L'USER, 04/08/2026, MOT POUR MOT — elle REMPLACE ma
   première clé, qui gardait les lettres après les chiffres et qui a produit
   des paires fantômes (DCM200 / DCM200N comptés comme deux produits) :
   « tu ne regardes plus les lettres après les numéros !!! tu te bases sur la
   description du produit et sur les premières lettres, ainsi que les numéros
   qui viennent après !!! et tu me vires les doublons, tu prends le moins cher »

   Donc DEUX ingrédients, et seulement deux :
   ① la RACINE DE MODÈLE — lettres de tête + chiffres (`racineModele`) :
     DCE560N-XJ, DCE560D1-QW et « DCE 560 » sont le même modèle ;
   ② la DESCRIPTION, qui dit CE QU'ON ACHÈTE pour ce modèle : la machine
     seule, la machine en pack (batteries/chargeur/coffret), ou un ACCESSOIRE
     fait pour elle. C'est lui qui me l'a appris sur le DCE560 : « Kit de
     conversion du tube d'extrusion … pour DCE 560 » à 123,99 € n'est pas le
     pistolet à 244,86 € — la référence est la même, la description tranche.

   La clé est donc racine + variante lue dans la description. À l'intérieur
   d'une même clé : doublons virés, LE MOINS CHER gagne. */

/* Les mots d'accessoire, tirés des annonces réellement vues dans le balayage
   (raccords DCE5801, supports DCE5601, kit de conversion DCE560, dust box
   DWH302DH, piètements DE7033…). Un accessoire cite la référence de SA
   machine : sans cette variante, il écraserait le prix de la machine. */
const ACCESSOIRE = /(kit de conversion|raccord|couplage|support|pi[eè]tement|adaptateur|rechange|remplacement|replacement|dust box|sac d.aspirat|filtre|batterie de remplacement|moulage|insert|tube d.extrusion|ensemble de supports|legstand|coiffe|embase|semelle|carter|charbons?|courroie|mandrin de rechange|ersatz|zubeh[öo]r)/i;

/* ⛔⛔⛔ CE QUI CHANGE LE PRIX SÉPARE LES PRODUITS — LU DANS LA DESCRIPTION.
   Défaut trouvé par l'user le 04/08/2026, sur son propre catalogue :
   « le laser rotatif DCE079D1G est à 1312,09 € et nous on le vend plus de
   2100 € … il n'est pas dans le tableau ». Il n'y était pas parce que ma clé
   l'avait FUSIONNÉ avec le DCE079D1R : même racine `DCE079`, même variante
   PACK, et le moins cher gagne — le laser à faisceau ROUGE (1098,88 €) a
   effacé le VERT (1312,09 €). Deux produits, deux prix, une seule ligne.
   MESURÉ : 299 groupes fusionnaient ainsi des annonces aux titres réellement
   différents avec plus de 25 % d'écart de prix.

   ⛔ Le parseur ne pouvait pas trancher : sur ces deux lasers il rend des
   caractéristiques IDENTIQUES (pack, batteries, Ah, coffret, type). Seule la
   DESCRIPTION les distingue — c'est exactement ce que l'user demandait :
   « tu te bases sur la description du produit ».

   ⚠️ ARBITRAGE ASSUMÉ : un discriminant de trop SÉPARE deux annonces du même
   produit (deux lignes à l'œil, gênant) ; un discriminant de moins CONFOND
   deux produits et écrit un prix pour un autre (de l'argent perdu). On penche
   du côté qui ne coûte pas d'argent. */
/* ⛔ Faisceau de laser : le vert vaut plusieurs centaines d'euros de plus. */
const DISCRIMINANTS = [
  ['VERT', /\b(vert|verte|green)\b/],
  ['ROUGE', /\b(rouge|red)\b/]
];

/* ⛔⛔⛔ LE COFFRET N'EST PAS UNE IDENTITÉ, C'EST UN INTERRUPTEUR.
   RÈGLE DE L'USER, 04/08/2026, mot pour mot : « quand il y a N ou un T à la
   fin, le N correspond à nu et le T correspond à la MÊME machine avec le
   coffret ; si le début de la référence est pareil, et s'il n'y a rien de plus
   dans le titre à part ce putain de coffret, on est censé avoir ce même
   produit avec coffret et sans coffret sur la MÊME CARTE PRODUIT. »
   Mesuré : DCD800N-XJ et DCD800NT-XJ font deux cartes séparées, DCF850N /
   DCF850NT-XJ aussi — l'interrupteur de variante du site (`variantGroup`,
   `variantRole`, `coffretSku`, déjà utilisé par 38 fiches) ne servait à rien.
   ⛔ Le coffret sort donc de la clé d'identité et devient un RÔLE. */
const COFFRET = /\b(coffret|tstak|t-?stak|toughsystem|mallette|kitbox|case|koffer)\b/;

/* ⛔⛔⛔ LE COFFRET SE LIT D'ABORD DANS LA RÉFÉRENCE — RÈGLE DE L'USER :
   « N correspond à nu et T correspond à la MÊME machine avec le coffret ».
   Défaut mesuré le 04/08 : je ne cherchais le coffret que dans le TITRE, or
   les titres du catalogue sont du genre « DeWALT DCD800NT-XJ — Perceuse-
   visseuse 18V DCD800NT-XJ » : pas un mot sur le coffret. Résultat, 1 seul
   groupe fusionnable détecté sur 29. La lettre finale de la référence, elle,
   le dit toujours.
   ⚠️ On retire d'abord le marquage géographique (`-XJ`, `-QW`…) : c'est la
   région, jamais le produit. Ce qui reste après la racine est le suffixe
   commercial ; s'il finit par T, c'est la version coffret.
   ⚠️ Le titre reste consulté en RENFORT — une annonce marchande qui écrit
   « coffret TSTAK » sans le T dans la référence est bien un coffret. */
function roleCoffret(titre, sku) {
  const s = String(sku || '').toUpperCase().replace(/-[A-Z]{2,3}$/, '');
  const racine = priceParse.racineModele(s);
  const suffixe = s.indexOf(racine) === 0 ? s.slice(racine.length) : '';
  if (/T$/.test(suffixe)) return 'coffret';
  return COFFRET.test(sansAccents(titre)) ? 'coffret' : 'solo';
}

/* ⛔⛔ « SANS BATTERIE NI CHARGEUR » N'EST PAS « AVEC CHARGEUR ».
   Défaut mesuré le 04/08 : `DCD800N-XJ — sans batterie ni chargeur` sortait en
   `PACK+CHARGEUR`, parce que je cherchais le MOT « chargeur » sans regarder ce
   qui le nie. Lire un mot n'est pas comprendre une phrase — c'est exactement
   ce que l'user reprochait : « réfléchir à ce que ça veut dire, pas juste le
   lire, sinon ça ne sert à rien ». */
const NEGATION = /\b(sans|ni|ohne|without|excl\.?|non fourni|non inclus|nu|nue|solo|body only|bare tool|machine seule|outil seul|appareil seul)\b/;

function nieApres(t, motif) {
  const m = t.match(motif);
  if (!m) return false;
  /* La négation porte sur ce qui SUIT : on regarde les 34 signes qui précèdent
     le mot, bornés à la ponctuation forte qui fermerait la proposition. */
  const avant = t.slice(Math.max(0, m.index - 34), m.index).split(/[.;(]/).pop();
  return NEGATION.test(avant);
}

/* ⛔⛔ « 2x batterie 2,0 Ah » VAUT DEUX BATTERIES, PAS UNE.
   Défaut mesuré : ma signature exigeait « 2x2,0Ah » collés ; dès qu'un mot
   s'intercale (« 2x **batterie** 2,0 Ah », « 2x **Batterie Powerstack** 1,7 Ah »)
   elle retombait sur la branche « une seule batterie » et écrivait 1X2.0 pour
   un pack de deux. Deux batteries de 5 Ah, ce n'est pas le même prix qu'une. */
function signatureBatteries(t) {
  if (nieApres(t, /batter/)) return 'SANSBAT';
  const m = t.match(/(\d)\s*[x×]\s*(?:[a-zà-ÿ\s]{0,24}?)?(\d+(?:[.,]\d)?)\s*ah\b/);
  if (m) return m[1] + 'X' + m[2].replace(',', '.');
  const seul = t.match(/(\d+(?:[.,]\d)?)\s*ah\b/);
  return seul ? '1X' + seul[1].replace(',', '.') : '';
}

/* ⛔ L'IDENTITÉ DU PRODUIT : la racine de modèle + CE QUE CONTIENT LA BOÎTE,
   lu dans le titre. Le coffret en est EXCLU (c'est un rôle, pas un produit). */
/* ⛔⛔⛔ « POUR <RÉFÉRENCE> » — L'ANNONCE PORTE LA RÉFÉRENCE D'UNE AUTRE
   MACHINE. L'user me l'avait corrigé le 04/08 : « bien sûr que c'est une
   référence produit, mais il faut LIRE LA DESCRIPTION avant ». La référence se
   GARDE — elle dit pour quelle machine l'article est fait — mais l'article
   n'est PAS cette machine.
   ⛔ ARGENT, attrapé à l'essai avant toute écriture : « 34° Clous en bande
   2,8x70mm POUR cloueur sans fil DeWalt DCN692 » à 95,50 € allait devenir le
   coût du cloueur DCN692N, vendu 1 076,33 € — le prix de vente serait tombé à
   163,12 €, un cinquième du coût réel de la machine. Idem « Rail de guidage
   1,5 m POUR DWS520KR » à 115,59 € pour une scie plongeante à 819,59 €.
   ⚠️ La garde ne mord QUE si la référence trouvée derrière « pour » est celle
   de l'article lui-même : sans ça, « batterie compatible avec tous les XR »
   ferait sortir des machines légitimes. */
function estPourAutreMachine(t, ref) {
  const r = String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (r.length < 5) return false;
  const nu = t.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ');
  const re = new RegExp('\\b(POUR|FUR|FOR|COMPATIBLE(?:\\s+AVEC)?|PASSEND)\\s+(?:[A-Z\\s]{0,34}?)?'
    + r.slice(0, 6), 'i');
  return re.test(nu.replace(/\s+/g, ' '));
}

function varianteProduit(titre, car, ref) {
  const c = car || {};
  const t = sansAccents(titre);
  if (ref && estPourAutreMachine(titre, ref)) return 'ACCESSOIRE';
  const m = t.match(ACCESSOIRE);
  if (m) {
    const avant = t.slice(Math.max(0, m.index - 8), m.index);
    if (!/(avec|with|mit|inkl\.?|\+)\s*$/.test(avant)) return 'ACCESSOIRE';
  }
  const bat = signatureBatteries(t);
  const chargeur = /\bchargeurs?\b|\bcharger\b|\blader\b/.test(t) && !nieApres(t, /chargeur|charger|lader/);
  const parts = [];
  /* Ni batterie ni chargeur ⇒ machine seule, quelle que soit la lettre finale
     de la référence. C'est le titre qui fait foi, comme l'a demandé l'user. */
  if ((!bat || bat === 'SANSBAT') && !chargeur) parts.push('NU');
  else {
    if (bat && bat !== 'SANSBAT') parts.push(bat);
    if (chargeur) parts.push('CHARGEUR');
  }
  /* ⛔⛔ LES DISCRIMINANTS S'APPLIQUENT AUSSI À UNE MACHINE NUE. Régression
     attrapée par la porte le 04/08 : un `return 'NU'` anticipé les sautait, et
     les deux lasers — rouge et vert, 430 € d'écart — redevenaient identiques.
     Ce qui distingue deux produits ne dépend pas de ce qu'il y a dans la
     boîte. */
  DISCRIMINANTS.forEach(function (d) { if (d[1].test(t)) parts.push(d[0]); });
  return parts.length ? parts.join('+') : 'NU';
}

function cleDoublon(e) {
  const c = e.car || {};
  const ref = e.sku || c.sku || c.skuEclate || null;
  const variante = varianteProduit(e.titre, c, e.sku || c.sku || c.skuEclate);
  const role = roleCoffret(e.titre, ref);
  if (ref) {
    const racine = priceParse.racineModele(String(ref).toUpperCase());
    return { cle: 'REF:' + racine + '|' + variante, niveau: 'référence',
      variante: variante, roleCoffret: role };
  }
  const n = normaliserTitre(e.titre);
  if (n) return { cle: 'TIT:' + n, niveau: 'titre', variante: variante, roleCoffret: role };
  return { cle: 'BRUT:' + JSON.stringify(e).slice(0, 120), niveau: 'aucun',
    variante: variante, roleCoffret: role };
}

/* ⛔ « LES MOINS CHERS » — la consigne, appliquée telle quelle. Un prix absent
   ou nul ne gagne JAMAIS contre un prix réel : sinon le doublon retenu serait
   celui dont on ne connaît pas le prix, et le classement recommanderait un
   produit sans tarif. */
function dedoublonner(liste) {
  const par = new Map();
  (liste || []).forEach((e) => {
    const k = e.cleDoublon;
    const prec = par.get(k);
    if (!prec) { par.set(k, e); return; }
    const pn = (typeof e.prix === 'number' && e.prix > 0) ? e.prix : Infinity;
    const pp = (typeof prec.prix === 'number' && prec.prix > 0) ? prec.prix : Infinity;
    if (pn < pp) par.set(k, e);
  });
  return Array.from(par.values());
}

/* ══ 3. LECTURE DES RÉPONSES ═══════════════════════════════════════════════ */
function fichiersDe(dossier) {
  return fs.readdirSync(dossier)
    .filter((n) => /\.json$/i.test(n))
    .map((n) => path.join(dossier, n))
    .filter((f) => fs.statSync(f).isFile());
}

/* Les trois listes rendues par le mode à sec, ramenées à UNE forme. Chacune
   apporte ce qu'elle a : `reconnus` la fiche du catalogue, `inconnus` la
   référence lue chez le marchand, `sansRefDetail` le titre complet. */
function aplatir(rep) {
  const out = [];
  (rep.reconnus || []).forEach((e) => out.push({
    origine: 'reconnu', sku: e.sku || null, ficheSku: e.ficheSku || null,
    titre: e.fiche || e.sku || '', prix: e.srcTTC, car: e.car || null,
    prixSiteActuel: e.ancien, prixSiteCalcule: e.nouveau
  }));
  (rep.inconnus || []).forEach((e) => out.push({
    origine: 'inconnu', sku: e.sku || null, ficheSku: null,
    titre: e.name || e.sku || '', prix: e.srcTTC, car: e.car || null,
    prixSiteActuel: null, prixSiteCalcule: null
  }));
  (rep.sansRefDetail || []).forEach((e) => out.push({
    origine: 'sans-ref', sku: null, ficheSku: null,
    titre: e.titre || '', prix: e.prix, car: e.car || null,
    prixSiteActuel: null, prixSiteCalcule: null
  }));
  return out;
}

/* ⛔⛔ LE COMPTE DES PAGES ET DES TUILES NE SE RÉÉCRIT PAS ICI. Il vit dans
   `scripts/bilan-balayage.js`, écrit après E-113 précisément pour ça : une
   page s'identifie par l'EMPREINTE de son contenu (`page.empreinte`), jamais
   par son rang, et une page envoyée deux fois ne doit compter ses tuiles
   qu'une fois. Recopier cette logique ici en ferait une seconde vérité qui
   divergerait au premier correctif — c'est O6, la copie périmée. */
const bilanBalayage = require('./bilan-balayage.js');

function collecter(dossier, pagesAttendues) {
  const fichiers = fichiersDe(dossier);
  const lignes = [];
  const vues = new Set();
  const objets = [];
  let illisibles = 0, pagesPlafonnees = 0, pagesEnDouble = 0;
  fichiers.forEach((f) => {
    let j;
    try { j = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { illisibles++; return; }
    objets.push(j);
    /* ⛔ UNE PAGE ENVOYÉE DEUX FOIS N'APPORTE PAS DE PRODUITS EN PLUS. Sans
       cette garde, un renvoi du raccourci gonflerait le total AVANT
       dédoublonnage — et le nombre de « doublons supprimés » compterait des
       doublons que j'aurais fabriqués moi-même. */
    const emp = (j.page && j.page.empreinte) ? String(j.page.empreinte) : null;
    if (emp && vues.has(emp)) { pagesEnDouble++; return; }
    if (emp) vues.add(emp);
    /* ⛔ LE PLAFOND SE COMPTE, IL NE SE TAIT PAS. `sansRefDetail` est tronqué
       à 40 entrées par page côté serveur ; une page qui en rend exactement 40
       a probablement perdu la suite, et un total qui ne le dirait pas se
       ferait passer pour exhaustif. */
    if ((j.sansRefDetail || []).length >= 40) pagesPlafonnees++;
    aplatir(j).forEach((l) => lignes.push(l));
  });
  const b = bilanBalayage.bilan(objets, pagesAttendues);
  return { lignes: lignes, pages: b.pagesDifferentes, tuiles: b.tuilesVues,
    produitsLus: b.produitsLus, pagesManquantes: b.pagesManquantes,
    fichiers: fichiers.length, illisibles: illisibles,
    pagesPlafonnees: pagesPlafonnees, pagesEnDouble: pagesEnDouble };
}


/* ══ 4. LE BILAN — AVANT ET APRÈS, PAR FAMILLE ═════════════════════════════ */
function compter(liste) {
  let packs = 0, seuls = 0;
  liste.forEach((e) => { if (e.pack) packs++; else seuls++; });
  return { total: liste.length, seuls: seuls, packs: packs };
}

/* ⛔⛔ LE DÉDOUBLONNAGE EST GLOBAL, PAS PAR FAMILLE. Mesuré : « DEWALT D24000 »
   — un titre réduit à sa référence — partait en « À trancher » pendant que
   « D24000 Wet Tile Saw … » était classé en électro. Même clé, deux lignes
   survivantes, parce que chaque famille dédoublonnait dans son coin. Même
   clé = même produit : on fusionne D'ABORD, et la ligne qui a une VRAIE
   famille la donne au groupe — l'annonce muette hérite du classement de
   l'annonce bavarde, jamais l'inverse. */
function bilanParRayon(lignes) {
  /* La famille résolue par groupe : la première non-« À trancher » du groupe. */
  const rayonParCle = new Map();
  lignes.forEach((e) => {
    if (e.rayonCommercial !== 'A_TRANCHER' && !rayonParCle.has(e.cleDoublon)) {
      rayonParCle.set(e.cleDoublon, e.rayonCommercial);
    }
  });
  lignes.forEach((e) => {
    if (e.rayonCommercial === 'A_TRANCHER' && rayonParCle.has(e.cleDoublon)) {
      e.rayonCommercial = rayonParCle.get(e.cleDoublon);
      e.signalClassement = 'hérité du doublon classé';
    }
  });
  let apresGlobal = dedoublonner(lignes);
  /* ⛔⛔ SECONDE PASSE : LE TITRE TRANCHE CE QUE LA VARIANTE A MAL SÉPARÉ.
     Mesuré après la première passe : 11 groupes portaient un titre
     STRICTEMENT identique sous deux clés (OUTIL et PACK), parce que le
     parseur avait lu `pack` différemment selon la page — pour la MÊME
     annonce. Deux lignes au même titre décrivent le même produit : c'est la
     règle de l'user (« tu te bases sur la description »), donc on fusionne,
     et le moins cher gagne, comme partout. */
  const parTitre = new Map();
  apresGlobal.forEach((e) => {
    const t = normaliserTitre(e.titre);
    if (!t) { parTitre.set('∅' + parTitre.size, e); return; }
    const prec = parTitre.get(t);
    if (!prec) { parTitre.set(t, e); return; }
    const pn = (typeof e.prix === 'number' && e.prix > 0) ? e.prix : Infinity;
    const pp = (typeof prec.prix === 'number' && prec.prix > 0) ? prec.prix : Infinity;
    parTitre.set(t, pn < pp ? e : prec);
  });
  apresGlobal = Array.from(parTitre.values());
  const par = {}, parApres = {};
  lignes.forEach((e) => { (par[e.rayonCommercial] = par[e.rayonCommercial] || []).push(e); });
  apresGlobal.forEach((e) => { (parApres[e.rayonCommercial] = parApres[e.rayonCommercial] || []).push(e); });
  const res = {};
  Object.keys(par).forEach((r) => {
    const avant = par[r];
    const apres = parApres[r] || [];
    res[r] = { avant: compter(avant), apres: compter(apres), lignes: apres, brutes: avant };
  });
  return res;
}

/* ══ 5. ÉCRITURE ═══════════════════════════════════════════════════════════ */
function csvChamp(v) {
  const s = (v == null) ? '' : String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function prixFr(v) {
  return (typeof v === 'number' && isFinite(v)) ? v.toFixed(2).replace('.', ',') : '';
}

const COLONNES = ['Famille', 'Rayon', 'Référence', 'Titre', 'Prix idealo (€)',
  'Pack', 'Type', 'Voltage', 'Coffret', 'Ah', 'Nb outils', 'Nb batteries',
  'Nb pièces', 'Édition limitée', 'Origine', 'Signal de classement',
  'Clé de doublon', 'Niveau de clé', 'Variante', 'Doublons fusionnés',
  'Réf. fiche du site', 'Prix actuel du site (€)'];

function ligneCsv(e) {
  const c = e.car || {};
  return [
    LIBELLE[e.rayonCommercial] || e.rayonCommercial,
    c.rayon || '', e.sku || c.sku || c.skuEclate || '', e.titre || '',
    prixFr(e.prix), e.pack ? 'pack' : 'seul', c.type || '',
    c.voltage == null ? '' : c.voltage, c.coffret || '',
    c.ah == null ? '' : c.ah, c.nbOutils == null ? '' : c.nbOutils,
    c.nbBatteries == null ? '' : c.nbBatteries, c.nbPieces == null ? '' : c.nbPieces,
    c.editionLimitee ? 'oui' : '', e.origine, e.signalClassement,
    e.cleDoublon, e.niveauCle, e.variante || '',
    e.doublonsFusionnes == null ? '' : e.doublonsFusionnes,
    e.ficheSku || '', prixFr(e.prixSiteActuel)
  ].map(csvChamp).join(';');
}

function ecrireCsv(fichier, lignes) {
  const corps = [COLONNES.join(';')].concat(lignes.map(ligneCsv)).join('\r\n');
  fs.writeFileSync(fichier, '﻿' + corps + '\r\n', 'utf8');
}

const ORDRE = ['ELECTRO_PORTATIF', 'QUINCAILLERIE', 'VETEMENTS', 'A_TRANCHER'];

function principal(argv) {
  const dossier = argv[0];
  const iS = argv.indexOf('--sortie');
  const sortie = iS !== -1 ? argv[iS + 1] : path.join(__dirname, '..', 'archives', 'idealo');
  if (!dossier || !fs.existsSync(dossier)) {
    console.error('usage : node scripts/classer-idealo.js <dossier-des-reponses> [--sortie <dossier>]');
    return 2;
  }

  const iP = argv.indexOf('--pages');
  const pagesAttendues = iP !== -1 ? parseInt(argv[iP + 1], 10) : 67;
  const rec = collecter(dossier, pagesAttendues);
  if (!rec.lignes.length) {
    console.error('❌ aucune ligne lue : le dossier ne contient pas de réponses exploitables.');
    return 2;
  }

  rec.lignes.forEach((e) => {
    const cl = classer(e.car, e.titre);
    e.rayonCommercial = cl.rayon;
    e.signalClassement = cl.signal;
    const k = cleDoublon(e);
    e.cleDoublon = k.cle;
    e.niveauCle = k.niveau;
    e.variante = k.variante;
    /* ⛔ `pack` VIENT DU PARSEUR, il ne se redevine pas ici. Une seconde
       définition du mot « pack » divergerait de celle du traqueur au premier
       correctif, et les deux chiffres se contrediraient sans qu'on sache
       lequel croire. */
    e.pack = !!(e.car && e.car.pack);
  });

  const bilan = bilanParRayon(rec.lignes);

  /* Combien d'annonces chaque ligne retenue représente — c'est ce qui prouve
     que « le moins cher » a bien eu des concurrents à battre. */
  ORDRE.forEach((r) => {
    if (!bilan[r]) return;
    const compte = new Map();
    bilan[r].brutes.forEach((e) => compte.set(e.cleDoublon, (compte.get(e.cleDoublon) || 0) + 1));
    bilan[r].lignes.forEach((e) => { e.doublonsFusionnes = compte.get(e.cleDoublon) || 1; });
  });

  fs.mkdirSync(sortie, { recursive: true });
  const ecrits = [];
  ORDRE.forEach((r) => {
    if (!bilan[r] || !bilan[r].lignes.length) return;
    const nom = 'idealo-' + r.toLowerCase().replace(/_/g, '-') + '.csv';
    const f = path.join(sortie, nom);
    ecrireCsv(f, bilan[r].lignes.slice().sort((a, b) => (a.prix || 0) - (b.prix || 0)));
    ecrits.push({ fichier: f, lignes: bilan[r].lignes.length });
  });

  const toutes = ORDRE.filter((r) => bilan[r]).reduce((acc, r) => acc.concat(bilan[r].lignes), []);
  const fTout = path.join(sortie, 'idealo-tout.csv');
  ecrireCsv(fTout, toutes);
  ecrits.push({ fichier: fTout, lignes: toutes.length });

  const fJson = path.join(sortie, 'idealo-classe.json');
  fs.writeFileSync(fJson, JSON.stringify({
    balayage: { fichiers: rec.fichiers, pages: rec.pages, tuiles: rec.tuiles,
      lignesLues: rec.lignes.length, pagesPlafonnees: rec.pagesPlafonnees },
    familles: ORDRE.filter((r) => bilan[r]).map((r) => ({
      cle: r, libelle: LIBELLE[r], avant: bilan[r].avant, apres: bilan[r].apres
    })),
    produits: toutes
  }, null, 2));
  ecrits.push({ fichier: fJson, lignes: toutes.length });

  /* ══ LE RELEVÉ ═══════════════════════════════════════════════════════════ */
  const l = (s) => console.log(s);
  l('');
  l('═══ CLASSEMENT DU BALAYAGE IDEALO ═══');
  l('');
  l('  réponses lues .............. ' + rec.fichiers + (rec.illisibles ? '  (' + rec.illisibles + ' illisibles, NON comptées)' : ''));
  l('  pages différentes .......... ' + rec.pages + ' / ' + pagesAttendues
    + (rec.pagesManquantes ? '   ⚠️ ' + rec.pagesManquantes + ' MANQUANTE(S)' : '')
    + (rec.pagesEnDouble ? '   (' + rec.pagesEnDouble + ' page(s) envoyée(s) deux fois, comptée(s) une seule)' : ''));
  l('  tuiles vues sur les pages .. ' + rec.tuiles);
  l('  produits lus par le parseur  ' + rec.produitsLus);
  l('  lignes de produit reçues ... ' + rec.lignes.length
    + '  (' + (rec.tuiles ? (rec.lignes.length * 100 / rec.tuiles).toFixed(1) : '—') + ' % des tuiles)');
  if (rec.pagesPlafonnees) {
    l('  ⚠️ ' + rec.pagesPlafonnees + ' page(s) au PLAFOND de 40 annonces sans référence :');
    l('     leur suite n\'a pas été renvoyée. Le total ci-dessus est donc un PLANCHER.');
  }
  l('');
  ORDRE.forEach((r) => {
    if (!bilan[r]) return;
    const b = bilan[r];
    l('  ── ' + LIBELLE[r] + ' ' + '─'.repeat(Math.max(2, 44 - LIBELLE[r].length)));
    l('     AVANT dédoublonnage : ' + b.avant.total + '   dont outils seuls : '
      + b.avant.seuls + '   packs : ' + b.avant.packs);
    l('     APRÈS dédoublonnage : ' + b.apres.total + '   dont outils seuls : '
      + b.apres.seuls + '   packs : ' + b.apres.packs);
    l('     doublons supprimés .. ' + (b.avant.total - b.apres.total));
    l('');
  });
  const tA = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].avant.total, 0);
  const tP = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].apres.total, 0);
  const sA = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].avant.seuls, 0);
  const kA = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].avant.packs, 0);
  const sP = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].apres.seuls, 0);
  const kP = ORDRE.filter((r) => bilan[r]).reduce((s, r) => s + bilan[r].apres.packs, 0);
  l('  ── TOUTES FAMILLES ' + '─'.repeat(28));
  l('     AVANT : ' + tA + '   outils seuls : ' + sA + '   packs : ' + kA);
  l('     APRÈS : ' + tP + '   outils seuls : ' + sP + '   packs : ' + kP);
  l('');
  l('  Fichiers écrits :');
  ecrits.forEach((e) => l('     · ' + path.relative(path.join(__dirname, '..'), e.fichier)
    + '   (' + e.lignes + ' lignes)'));
  l('');
  l('  ⛔ archives/ est dans .vercelignore : ces fichiers ne sont jamais servis.');
  l('');
  return 0;
}

module.exports = {
  classer: classer, cleDoublon: cleDoublon, dedoublonner: dedoublonner,
  normaliserTitre: normaliserTitre, compter: compter, aplatir: aplatir,
  ligneCsv: ligneCsv, COLONNES: COLONNES, FAMILLE_VERS_RAYON: FAMILLE_VERS_RAYON,
  sansAccents: sansAccents, varianteProduit: varianteProduit,
  roleCoffret: roleCoffret, signatureBatteries: signatureBatteries,
  estPourAutreMachine: estPourAutreMachine,
  bilanParRayon: bilanParRayon
};

if (require.main === module) process.exit(principal(process.argv.slice(2)));
