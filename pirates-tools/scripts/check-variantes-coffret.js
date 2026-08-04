#!/usr/bin/env node
'use strict';
/* ══ PORTE — LE SWITCH COFFRET, ET L'ARGENT QU'IL PORTE ══════════════════════
   `node scripts/check-variantes-coffret.js`

   ⛔⛔ CE QU'ELLE DÉFEND, dans les mots de l'user (04/08/2026) :
   « avec N / NT / NT-XJ, si la référence est la même au début, on a qu'UNE
   SEULE carte produit et la personne peut switcher version sans coffret et
   version avec coffret ; le dénominateur XJ c'est pour la région. »

   LA PANNE QU'ELLE INTERDIT, mesurée le même jour : **0 fiche DeWALT sur
   1105** était reliée au switch, alors que le mécanisme tournait déjà pour
   d'autres marques. Chaque carte recevait donc son PROPRE coût d'achat, et la
   carte coffret — dont les annonces sont rares et chères — dérivait seule :
   `DCH273NT-XJ` à 586,07 € contre 264,37 € pour la version nue, quand le
   switch facture 15 €. Le client payait 296 € de trop pour une boîte.

   ⛔ Cette porte n'ancre AUCUNE référence : elle CHOISIT ses sujets à
   l'exécution sur un critère, et elle ÉCHOUE si le catalogue n'en offre pas
   — non exécuté n'est pas vert.

   ⚠️ Portes lues : J3 — aucune donnée personnelle ; J4 — aucun prix n'est
   écrit, la porte VÉRIFIE que personne n'en écrit ; J5 — aucune TVA. */

const fs = require('fs');
const path = require('path');
const classer = require('./classer-idealo.js');
const pricing = require('../api/_lib/pricing.js');

const RACINE = path.join(__dirname, '..');

function corps(ok) {
  const brut = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8'));
  const tous = Array.isArray(brut) ? brut : (brut.products || []);
  const parSku = new Map(tous.map((p) => [String(p.sku).toUpperCase(), p]));

  /* ── ① LA LETTRE FINALE DE LA RÉFÉRENCE DIT LE COFFRET ─────────────────── */
  ok(classer.roleCoffret('libellé sans le mot', 'ZZD800N-XJ') === 'solo'
    && classer.roleCoffret('libellé sans le mot', 'ZZD800NT-XJ') === 'coffret',
    '⛔⛔ RÈGLE USER : N = nu, T = coffret, LU DANS LA RÉFÉRENCE. Les titres du '
    + 'catalogue ne disent pas « coffret » — ne chercher que dans le titre n\'a '
    + 'trouvé qu\'1 groupe sur 20 ('
    + classer.roleCoffret('x', 'ZZD800N-XJ') + ' / ' + classer.roleCoffret('x', 'ZZD800NT-XJ') + ')');
  ok(classer.roleCoffret('x', 'ZZD800NT') === 'coffret'
    && classer.roleCoffret('x', 'ZZD800NT-QW') === 'coffret',
    '⛔ …et le marquage géographique ne change RIEN : -XJ, -QW, ou rien du tout, '
    + 'c\'est la même version coffret (l\'user : « XJ c\'est pour la région »)');
  ok(classer.roleCoffret('coffret TSTAK inclus', 'ZZD800N-XJ') === 'coffret',
    '⛔ …et un titre qui annonce explicitement le coffret l\'emporte quand la '
    + 'référence ne porte pas le T — une annonce marchande écrit les deux façons');

  /* ── ② LE COFFRET NE CRÉE PAS DE SECONDE IDENTITÉ ──────────────────────── */
  const g = classer.cleDoublon({ sku: 'ZZD800N-XJ', titre: 'ZZ perceuse 18V sans batterie ni chargeur', prix: 112, car: {} });
  const c = classer.cleDoublon({ sku: 'ZZD800NT-XJ', titre: 'ZZ perceuse 18V sans batterie ni chargeur', prix: 145, car: {} });
  ok(g.cle === c.cle,
    '⛔⛔ ARGENT : nu et coffret du même modèle = UNE clé, donc UNE carte ('
    + g.cle + ' vs ' + c.cle + ')');

  /* ── ③ LE CATALOGUE : CHAQUE LIAISON REVIENT ──────────────────────────── */
  const lies = tous.filter((p) => p.variantGroup);
  /* ⛔ PRÉALABLE : sans une seule paire au catalogue, ce contrôle ne vérifie
     rien et doit ÉCHOUER plutôt que verdir à vide. */
  ok(lies.length >= 2,
    '⛔ PRÉALABLE : le catalogue porte au moins une paire reliée au switch — '
    + 'sans elle ce contrôle ne vérifie rien (' + lies.length + ' fiches liées)');

  const casses = [], sansRole = [], grilleSale = [];
  lies.forEach((p) => {
    if (p.variantRole !== 'solo' && p.variantRole !== 'coffret') { sansRole.push(p.sku); return; }
    const autreSku = p.variantRole === 'coffret' ? p.soloSku : p.coffretSku;
    const autre = parSku.get(String(autreSku || '').toUpperCase());
    if (!autre) { casses.push(p.sku + ' → ' + autreSku + ' introuvable'); return; }
    if (autre.variantGroup !== p.variantGroup) { casses.push(p.sku + ' ↔ ' + autreSku + ' groupes différents'); return; }
    const retour = autre.variantRole === 'coffret' ? autre.soloSku : autre.coffretSku;
    if (String(retour || '').toUpperCase() !== String(p.sku).toUpperCase()) {
      casses.push(p.sku + ' ↔ ' + autreSku + ' le lien retour ne revient pas');
    }
    /* La carte COFFRET doit sortir de la grille, sinon le client voit encore
       deux cartes — c'est exactement le doublon qu'on ferme. */
    if (p.variantRole === 'coffret' && !p.variantSecondary) grilleSale.push(p.sku);
    if (p.variantRole === 'solo' && p.variantSecondary) grilleSale.push(p.sku + ' (solo masqué !)');
  });

  ok(casses.length === 0,
    '⛔⛔ ' + casses.length + ' liaison(s) de switch CASSÉE(S) — un lien à sens '
    + 'unique fait un switch qui ne bascule pas, et le client ne peut plus '
    + 'acheter la version qu\'il voit : ' + casses.slice(0, 4).join(' · '));
  ok(sansRole.length === 0,
    '⛔ une fiche reliée SANS rôle solo/coffret ne sait pas quoi afficher : '
    + sansRole.slice(0, 4).join(' · '));
  ok(grilleSale.length === 0,
    '⛔⛔ ' + grilleSale.length + ' carte(s) coffret encore VISIBLES dans la '
    + 'grille (ou solo masqué) — c\'est le doublon que le switch doit supprimer : '
    + grilleSale.slice(0, 4).join(' · '));

  /* ── ④ LE PRIX DU COFFRET NE SE RÉÉCRIT PAS DANS LA FICHE ─────────────── */
  /* ⛔ ARGENT. Le supplément coffret est calculé par `pricing`, à l'affichage
     ET au paiement. Si en plus la fiche coffret portait un prix gonflé, le
     client paierait le supplément DEUX fois. On vérifie donc que la paire
     reste cohérente avec ce que le switch facture réellement. */
  const paires = lies.filter((p) => p.variantRole === 'solo')
    .map((s) => ({ solo: s, cof: parSku.get(String(s.coffretSku || '').toUpperCase()) }))
    .filter((x) => x.cof && x.solo.price > 0 && x.cof.price > 0);
  ok(paires.length >= 1,
    '⛔ PRÉALABLE : au moins une paire avec les deux prix, sinon rien n\'est vérifié');
  const sup = paires.length ? pricing.coffretSurchargeCents(paires[0].solo) : 0;
  ok(sup > 0,
    '⛔ le switch facture bien un supplément coffret sur une machine éligible ('
    + (sup / 100) + ' €) — à zéro, le coffret serait offert');

  /* ⛔ Ce qui est SERVI au client, c'est le prix du SOLO plus le supplément :
     `app.js` affiche `activeProduct = variantSolo` par défaut. La fiche
     coffret peut garder son ancien prix sans nuire — mais si le solo lui-même
     était plus cher que le coffret, le switch afficherait une remise en
     basculant vers le coffret, ce qui n'a aucun sens commercial. */
  const inverses = paires.filter((x) => x.solo.price > x.cof.price);
  ok(inverses.length === 0,
    '⛔⛔ ARGENT : ' + inverses.length + ' paire(s) où la version NUE coûte plus '
    + 'cher que la version COFFRET — le switch proposerait alors le coffret '
    + 'comme moins cher, ce qui est absurde et se vend à perte : '
    + inverses.slice(0, 4).map((x) => x.solo.sku + ' ' + x.solo.price + ' > '
      + x.cof.sku + ' ' + x.cof.price).join(' · '));
}

const ASSERTIONS_ATTENDUES = 10;

module.exports = function () {
  const errors = [];
  let n = 0;
  const ok = function (cond, quoi) { n++; if (!cond) errors.push(quoi); };
  try { corps(ok); }
  catch (e) { errors.push('⛔ corps du contrôle mort : ' + (e && e.message ? e.message : e)); }
  if (n < ASSERTIONS_ATTENDUES) {
    errors.push('⛔ check-variantes-coffret n\'a rendu que ' + n + ' assertions sur '
      + ASSERTIONS_ATTENDUES + ' attendues : contrôle amputé.');
  }
  return errors;
};

if (require.main === module) {
  const e = module.exports();
  if (e.length) { e.forEach((x) => console.error('  ❌ ' + x)); process.exit(1); }
  console.log('✅ check-variantes-coffret OK');
}
