/* audit/prix-multi-ecritures.js — LE MÊME PRODUIT SOUS PLUSIEURS RÉFÉRENCES.
 * ─────────────────────────────────────────────────────────────────────────
 * ⛔⛔ ORDRE DE L'USER, 10/08/2026, après avoir vu une lampe vendue trop cher :
 * « il y a trop de produits pareils avec des prix différents et tu as pris le
 * plus cher, donc il faut que tu vérifies absolument tous les produits, on ne
 * sait jamais, tu ne t'arrêtes pas tant que tu n'as pas vérifié chaque
 * produit ».
 *
 * ⛔ LE DÉFAUT QU'IL A TROUVÉ, ET QUI SE GÉNÉRALISE. Le comparateur affiche la
 * MÊME machine plusieurs fois, sous des écritures différentes :
 *   · avec un préfixe de DISTRIBUTEUR (`DEA…`, `DEB…`, `DEC…`, `NLA…`) ;
 *   · avec ou sans le `Z` qui marque l'outil nu ;
 *   · avec ou sans le suffixe de coffret.
 * Le traqueur ne rapprochait que l'écriture EXACTE de la fiche — et retenait
 * donc le prix de cette tuile-là, même quand la même machine était affichée
 * 165 € moins cher deux cases plus loin.
 *
 * ⚠️⚠️ CE QUE CET AUDIT NE FAIT PAS, ET C'EST VOULU : il n'écrit RIEN. Ici,
 * rapprocher fait BAISSER le coût retenu, donc le prix de vente. Un mauvais
 * rapprochement ferait vendre à PERTE — le sens inverse de d'habitude. Il
 * MESURE, il NOMME, et il classe par degré de certitude :
 *   ① CERTAIN   — préfixe de distributeur, même type, même famille ;
 *   ② PROBABLE  — même racine et même type, écarts de conditionnement lus ;
 *   ③ À VÉRIFIER — même racine, mais type ou conditionnement différents.
 * Seul ① est appliqué automatiquement par le traqueur.
 *
 * Usage : node audit/prix-multi-ecritures.js <releve.json> [--csv sortie.csv]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const nomen = require(path.join(RACINE, 'api/_lib/nomenclature.js'));

const RELEVE = process.argv[2];
const iCsv = process.argv.indexOf('--csv');
const CSV = iCsv !== -1 ? process.argv[iCsv + 1] : null;
const iM = process.argv.indexOf('--marque');
const MARQUE = iM !== -1 ? String(process.argv[iM + 1] || '').toUpperCase() : '';

if (!RELEVE || !fs.existsSync(RELEVE) || !MARQUE) {
  console.error('usage : node audit/prix-multi-ecritures.js <releve.json> --marque <MARQUE> [--csv sortie.csv]');
  process.exit(2);
}
/* ⛔⛔ UNE NOMENCLATURE EST PROPRE À SA MARQUE — ET CET AUDIT L'AVAIT OUBLIÉ.
   Premier jet du 10/08/2026 : il découpait TOUTES les références avec la
   grammaire d'une seule marque. Sur une autre marque, `DWMT73803` et
   `DWMT73801` — deux coffrets d'outils DIFFÉRENTS — se retrouvaient sur la
   même racine `DWMT7380`, et l'audit proposait de retenir le prix du moins
   cher : **148,41 € d'écart** sur deux produits qui n'ont rien à voir.
   Neuf faux jumeaux fabriqués d'un coup. Appliquer la grammaire d'une marque
   à une autre, c'est inventer des rapprochements — exactement ce que cet
   audit sert à empêcher.
   ⇒ La marque est OBLIGATOIRE, et sans grammaire connue on ne regroupe RIEN. */
/* ⛔⛔⛔ UNE GRAMMAIRE ÉCRITE N'EST PAS UNE GRAMMAIRE BRANCHÉE (M-32).
   Mesuré le 11/08/2026 : cet audit annonçait « aucune grammaire déclarée pour
   DeWALT » et sortait sans rien regarder — sur **1 047 fiches**, 61 % du
   catalogue. Or `lireSuffixeDewalt` existait depuis longtemps, elle était
   exportée, et le parseur s'en servait déjà. Elle n'était simplement pas
   INSCRITE ici. L'audit que l'user a demandé pour trouver « le même produit à
   plusieurs prix » était donc aveugle sur sa plus grosse marque, et il le
   disait d'une phrase qu'on pouvait lire comme « il n'y a rien à voir ».
   C'est la même panne que la nomenclature de la troisième marque, écrite,
   exportée, testée — et appelée par personne.

   ⚠️ LES DEUX GRAMMAIRES NE RENDENT PAS LA MÊME FORME, et les confondre
   fabriquerait exactement les faux jumeaux que cet audit traque. On les
   ADAPTE explicitement, chacune chez elle, vers la forme canonique
   `{ racine, config: { nbBatteries, ah, coffret, accessoires } }`.

   ⛔ VÉRIFIÉ AVANT D'INSCRIRE, parce que c'est cette marque-là qui avait déjà
   payé : `DWMT73803` et `DWMT73801` — deux coffrets d'outils DIFFÉRENTS —
   rendent des racines DIFFÉRENTES avec SA grammaire (la tête consomme tous
   les chiffres, il ne reste aucun suffixe). Les neuf faux jumeaux du 10/08
   venaient d'avoir appliqué la grammaire d'une AUTRE marque, pas d'un manque
   de grammaire ici. */
function adapterDewalt(sku, marque) {
  /* ⛔⛔ LA GARDE EST DANS LA FONCTION, PAS DANS L'INTENTION — et c'est
     `check-separation-marques` qui me l'a imposée en devenant ROUGE sur ce
     fichier même, quelques minutes après que je l'ai écrit. Elle avait raison :
     rien n'empêchait cet adaptateur d'être appelé un jour sur une autre marque,
     et la grammaire d'une marque appliquée à une autre est exactement ce que
     cet audit existe pour empêcher. On vérifie donc CHEZ SOI, comme
     `refSansPrefixeDistributeur` — jamais « en amont, normalement ». */
  if (String(marque || '').toUpperCase().replace(/[\s-]/g, '') !== 'DEWALT') return null;
  var s = String(sku || '').trim().toUpperCase();
  var l = nomen.lireSuffixeDewalt(s);
  if (!l) return null;
  /* La racine est ce qui reste une fois le marquage régional et le code
     d'ensemble retirés — reconstruite depuis le suffixe que la grammaire a lu,
     jamais recoupée à la main. */
  var sansRegion = s.replace(/-[A-Z0-9]{1,3}$/, '');
  var suf = String(l.suffixe || '');
  var racine = suf && sansRegion.slice(-suf.length) === suf
    ? sansRegion.slice(0, sansRegion.length - suf.length) : sansRegion;
  /* ⚠️ Un suffixe VIDE veut dire « cette écriture ne dit rien de sa boîte » —
     pas « boîte vide ». On rend `config: null`, et l'audit la classera
     « contenu non lu » au lieu de la comparer à tort. */
  if (!suf) return { racine: racine, suffixe: '', config: null };
  return {
    racine: racine,
    suffixe: suf,
    config: {
      nbBatteries: l.nbBatteries,
      ah: l.ah,
      coffret: l.coffret || null,
      accessoires: false,
      /* ⛔ CE QUE LA GRAMMAIRE N'A PAS SU LIRE VOYAGE AVEC — voir `contenu()`.
         Cette grammaire-ci lit code par code et RECONNAÎT son ignorance : on
         ne la jette pas, on la transporte jusqu'au classement. */
      inconnus: Array.isArray(l.inconnus) ? l.inconnus : []
    }
  };
}
/* ⛔ LA MARQUE DU BALAYAGE EST PASSÉE À L'ADAPTATEUR, qui la revérifie. Deux
   contrôles, comme partout ailleurs : celui de l'appel et celui de la fonction. */
var GRAMMAIRES = {
  MAKITA: nomen.lireSuffixeMakita,
  DEWALT: function (sku) { return adapterDewalt(sku, MARQUE); }
};
if (!GRAMMAIRES[MARQUE]) {
  console.log('⚠️ aucune grammaire de référence déclarée pour ' + MARQUE + ' : '
    + 'aucun regroupement ne sera proposé. Écrire sa nomenclature d\'abord — '
    + 'regrouper sans grammaire fabriquerait de faux jumeaux (mesuré : 9 en un '
    + 'seul passage).');
  process.exit(0);
}
const lireSuffixe = GRAMMAIRES[MARQUE];
const releve = JSON.parse(fs.readFileSync(RELEVE, 'utf8'));
const catalogue = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));

/* ── LA CLÉ DE REGROUPEMENT ─────────────────────────────────────────────────
   Deux écritures désignent le même MODÈLE quand, une fois le préfixe de
   distributeur retiré et le code d'ensemble mis de côté, il reste la même
   racine. Le conditionnement (nu, batteries, coffret) reste lu à part : c'est
   lui qui décide si les deux tuiles sont vraiment comparables. */
function clefModele(sku) {
  const s = String(sku || '').toUpperCase().trim();
  const nu = nomen.refSansPrefixeDistributeur(s, MARQUE) || s;
  const l = lireSuffixe(nu);
  return l ? l.racine : nu;
}

function contenu(sku) {
  const nu = nomen.refSansPrefixeDistributeur(String(sku || '').toUpperCase(), MARQUE) || String(sku || '').toUpperCase();
  const l = lireSuffixe(nu);
  const c = l && l.config;
  if (!c) return null;
  /* ⛔⛔ LA CAPACITÉ COMPTE AUTANT QUE LE NOMBRE — ET MON PROPRE AUDIT L'AVAIT
     OUBLIÉE. Mesuré le 10/08/2026 : `RTJ` (2 batteries de 5,0 Ah) et `RAJ`
     (2 batteries de 2,0 Ah) sortaient « même conditionnement » parce que je ne
     comparais que le NOMBRE. L'audit proposait donc de retenir le prix du kit
     2×2,0 Ah — 87,91 € moins cher — pour la fiche du kit 2×5,0 Ah.
     C'est exactement l'erreur que cet audit existe pour trouver, faite par
     l'audit lui-même. Deux batteries de 5 Ah ne sont pas deux batteries de
     2 Ah : les confondre fait vendre le gros kit au prix du petit. */
  return {
    nb: (typeof c.nbBatteries === 'number') ? c.nbBatteries : null,
    ah: (typeof c.ah === 'number') ? c.ah : null,
    coffret: c.coffret || null,
    /* ⛔⛔ CE QUE LA GRAMMAIRE N'A PAS SU LIRE VOYAGE AVEC LE CONTENU — ET SANS
       ÇA L'AUDIT A REFAIT SON PROPRE DÉFAUT, UNE TROISIÈME FOIS.
       Mesuré le 11/08/2026, dès le premier passage sur la marque qu'on venait
       d'inscrire : « DCF887N » (outil nu, 126 €) et « DCF887NDS » (appareil
       seul **+ DS150**, 117 €) sortaient « même conditionnement ». La grammaire
       de cette marque rend pourtant `inconnus: ["D","S"]` sur la seconde — elle
       DIT qu'elle n'a pas tout lu. Je comparais des batteries et un coffret en
       ignorant le reste du code.
       ⛔ Et le sens est le mauvais : le paquet le PLUS complet était le MOINS
       cher. Retenir son coût sur la fiche de l'outil nu fait baisser le prix
       de vente — c'est-à-dire vendre à perte. Exactement le danger écrit en
       tête de ce fichier, produit par ce fichier.
       ⚠️ Une grammaire qui lit PARTIELLEMENT est plus dangereuse qu'une
       grammaire qui échoue : l'échec rend `null` et le classement le voit ;
       la lecture partielle rend un objet d'apparence complète. */
    inconnus: Array.isArray(l.config && l.config.inconnus) ? l.config.inconnus
      : (Array.isArray(l.inconnus) ? l.inconnus : [])
  };
}

function decrire(c) {
  if (!c) return 'contenu non lu';
  if (c.nb === null) return 'contenu inconnu';
  return c.nb + ' batterie(s)' + (c.ah ? ' de ' + String(c.ah).replace('.', ',') + ' Ah' : '')
    + (c.coffret ? ' + coffret' : '');
}

/* Regroupement */
const groupes = new Map();
releve.forEach((x) => {
  if (!x || !x.sku || !(x.srcTTC > 0)) return;
  const k = clefModele(x.sku);
  if (!groupes.has(k)) groupes.set(k, []);
  groupes.get(k).push(x);
});

const parSku = new Map(catalogue.map((p) => [String(p.sku || '').toUpperCase(), p]));

const trouvailles = [];
groupes.forEach((liste, racine) => {
  if (liste.length < 2) return;
  liste.forEach((x) => {
    const fiche = parSku.get(String(x.sku).toUpperCase());
    if (!fiche) return;                       // on n'audite que CE QU'IL VEND
    /* Les autres écritures de la même racine, MOINS CHÈRES que celle retenue. */
    const cx = contenu(x.sku);
    liste.forEach((y) => {
      if (y === x) return;
      if (!(y.srcTTC < x.srcTTC)) return;
      const cy = contenu(y.sku);
      /* Degré de certitude — jamais un rapprochement muet. */
      let degre, motif;
      const prefixe = nomen.refSansPrefixeDistributeur(String(x.sku).toUpperCase(), MARQUE) === String(y.sku).toUpperCase()
        || nomen.refSansPrefixeDistributeur(String(y.sku).toUpperCase(), MARQUE) === String(x.sku).toUpperCase();
      /* ⚠️ LE TYPE MANQUE D'UN CÔTÉ QUAND LA TUILE A DÉJÀ ÉTÉ APPLIQUÉE À UNE
         FICHE — la liste `applied` ne le porte pas. Sans cette nuance, TOUT
         tombait dans « à vérifier » et l'audit ne triait plus rien : un
         classement qui met tout dans le même bac ne classe pas.
         Quand un type manque, on ne conclut PAS « types différents » : on
         s'appuie sur le CONDITIONNEMENT, qui se lit sur la référence seule. */
      const typeConnu = !!(x.typ && y.typ);
      const memeType = typeConnu ? (x.typ === y.typ) : null;
      const famConnue = !!(x.fam && y.fam);
      const memeFam = famConnue ? (x.fam === y.fam) : null;
      /* ⛔⛔ UN CODE NON LU INTERDIT DE CONCLURE « MÊME CONTENU ». Défaut mesuré
         le 11/08/2026 : « + DS150 » se lit `inconnus: ["D","S"]`, et sans cette
         condition les deux écritures sortaient « même conditionnement » alors
         que l'une porte un accessoire de plus — 9 € moins cher, dans le sens
         qui fait vendre à perte. Ce n'est pas « prudent », c'est la seule
         lecture honnête : on ne sait pas ce que ce code ajoute à la boîte. */
      const codeNonLu = (cx && cx.inconnus.length > 0) || (cy && cy.inconnus.length > 0);
      const memeContenu = codeNonLu ? false
        : ((cx && cy) ? (cx.nb === cy.nb && cx.ah === cy.ah && cx.coffret === cy.coffret) : (!cx && !cy));
      if (prefixe && memeType !== false && memeFam !== false) {
        degre = '1 CERTAIN'; motif = 'préfixe de distributeur, rien ne contredit';
      } else if (memeContenu && memeType !== false && memeFam !== false) {
        degre = '2 PROBABLE'; motif = 'même racine, même conditionnement lu'
          + (typeConnu ? ', même type' : ' (type non lu d\'un côté)');
      } else if (!memeContenu) {
        /* ⛔ CE N'EST PAS LE MÊME PRODUIT, ET C'EST LE CAS LE PLUS FRÉQUENT.
           Un kit (batteries + chargeur + coffret) coûte légitimement plus cher
           que la machine nue de la même racine. Les confondre ferait vendre le
           kit au prix du nu — donc à perte. On les SÉPARE, on ne les corrige
           pas : c'est une information, pas une anomalie. */
        degre = '4 CONDITIONNEMENTS DIFFERENTS';
        motif = codeNonLu
          ? 'même machine, mais un code d\'ensemble N\'A PAS ÉTÉ LU ('
            + [].concat(cx ? cx.inconnus : [], cy ? cy.inconnus : []).join('') + ') : '
            + 'on ignore ce que ce code ajoute à la boîte, donc on ne rapproche PAS. '
            + decrire(cx) + '  contre  ' + decrire(cy)
          : 'même machine mais pas le même contenu : '
            + decrire(cx) + '  contre  ' + decrire(cy);
      } else {
        degre = '3 A VERIFIER';
        motif = 'même racine mais ' + (memeType === false ? 'type différent (' + x.typ + ' / ' + y.typ + ')' : 'famille différente');
      }
      trouvailles.push({
        degre: degre, racine: racine,
        sku: x.sku, titre: x.titre || '', coutRetenu: x.srcTTC,
        skuMoinsCher: y.sku, titreMoinsCher: y.titre || '', coutMoinsCher: y.srcTTC,
        ecart: x.srcTTC - y.srcTTC, prixServi: fiche.price, motif: motif
      });
    });
  });
});

trouvailles.sort((a, b) => (a.degre < b.degre ? -1 : a.degre > b.degre ? 1 : b.ecart - a.ecart));

const parDegre = {};
trouvailles.forEach((t) => { parDegre[t.degre] = (parDegre[t.degre] || 0) + 1; });

console.log('══ LE MÊME PRODUIT SOUS PLUSIEURS ÉCRITURES — ' + path.basename(RELEVE));
console.log('références du relevé            : ' + releve.length);
console.log('modèles vus sous ≥ 2 écritures  : ' + [...groupes.values()].filter((l) => l.length > 1).length);
console.log('fiches de SON site concernées   : ' + new Set(trouvailles.map((t) => t.sku)).size);
console.log('');
Object.keys(parDegre).sort().forEach((d) => console.log('  ' + String(parDegre[d]).padStart(4) + '  ' + d));
console.log('');
trouvailles.slice(0, 15).forEach((t) => {
  console.log('  [' + t.degre + '] ' + t.sku.padEnd(14) + String(t.coutRetenu).padStart(9) + ' €'
    + '  ->  ' + t.skuMoinsCher.padEnd(14) + String(t.coutMoinsCher).padStart(9) + ' €'
    + '   ÉCART ' + t.ecart.toFixed(2).padStart(8) + ' €   (' + t.motif + ')');
});

if (CSV) {
  const cel = (v) => {
    const s = String(v == null ? '' : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const eur = (n) => String(Number(n).toFixed(2)).replace('.', ',');
  const L = ['certitude;reference_de_ta_fiche;titre_lu;cout_retenu_eur;reference_moins_chere;titre_moins_cher;cout_moins_cher_eur;ecart_eur;prix_servi_eur;motif'];
  trouvailles.forEach((t) => L.push([cel(t.degre), cel(t.sku), cel(t.titre), cel(eur(t.coutRetenu)),
    cel(t.skuMoinsCher), cel(t.titreMoinsCher), cel(eur(t.coutMoinsCher)), cel(eur(t.ecart)),
    cel(eur(t.prixServi)), cel(t.motif)].join(';')));
  fs.writeFileSync(CSV, '﻿' + L.join('\r\n') + '\r\n', 'utf8');
  console.log('\ntableau écrit : ' + CSV + ' (' + (L.length - 1) + ' lignes)');
}
