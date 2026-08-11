'use strict';
/* ══ RECONSTITUER UN PACK POUR EN TROUVER LE VRAI COÛT ═══════════════════════
   ⛔⛔⛔ ORDRE DE L'USER, 13/08/2026, mot pour mot :
   « 372 € à l'achat pour cinq batteries, c'est du grand n'importe quoi. […]
   Si un pack avec deux visseuses et deux batteries coûte plus cher qu'en
   achetant les produits séparément, ce pack n'est pas valable. On n'efface pas
   le pack dans les produits, mais on le RECONSTITUE avec des produits nus si
   ça coûte moins cher. […] Le parseur doit être un calculateur intelligent, il
   doit chercher à créer les meilleurs prix : ça c'est son travail le plus
   important. Et ça vaut pour n'importe quel pack / kit / lot. »

   ⛔ CE QUE ÇA CHANGE, MESURÉ SUR SON PROPRE RELEVÉ DU 13/08. Une seule
   référence de batterie y apparaît sous HUIT conditionnements :
     · carte unitaire la moins chère ............ 84,90 €  → 84,90 € l'unité
     · pack de 2 ............................... 118,88 €  → **59,44 €**
     · kit de 3 ................................ 214,70 €  → 71,57 €
     · lot de 5 ................................ 323,94 €  → 64,79 €
     · lot de 5 (autre vendeur) ................ 372,29 €  → 74,46 €
     · lot de 10 ............................... 638,45 €  → 63,85 €
   Le traqueur retenait 84,90 € — le prix de la carte unitaire. Le meilleur
   coût réellement atteignable est **59,44 €** : **25,46 € de moins par
   batterie, 30 % de coût en moins**, sans changer de fournisseur, juste en
   sachant lire.
   ⚠️ Et sa capture du comparateur confirme l'ordre de grandeur : la même
   batterie y démarre à 56,20 € l'unité — 56,20 × 5 = 281 €, contre 372,29 €
   le « lot de 5 ». Le lot était **91,29 € plus cher** que les cinq unités.

   ⛔⛔ CE QUE CE MODULE NE FAIT PAS, ET C'EST VOULU : il ne DÉCIDE rien. Il
   rend un coût reconstitué et le détail de son calcul. C'est l'appelant qui
   choisit, et le minimum de rafale qui tranche. Une décision d'argent prise
   dans un module de lecture serait invisible au moment où elle compte.

   ⚠️ IL N'INVENTE AUCUN PRIX. Un composant dont le prix n'est pas connu rend
   `complet: false` et le coût reconstitué est REFUSÉ. Reconstituer à partir
   d'une estimation, c'est fabriquer un coût — donc un prix de vente faux.

   ⚠️ Portes lues — J4 : le coût retenu reste un prix RÉELLEMENT payable, lu
   sur une offre du fournisseur ; rien ici ne fabrique un prix de référence ni
   n'annonce une réduction (D-004). J3 : des libellés d'outils, aucune donnée
   personnelle. J5 : aucune TVA, aucun octroi de mer.
   ═════════════════════════════════════════════════════════════════════════ */

/* ── CE QUE LE TITRE ET LA DESCRIPTION ANNONCENT COMME CONTENU ──────────────
   ⛔ LE TITRE DIT LA VÉRITÉ (M-48) : une annonce engage le vendeur. On le lit
   donc comme une source, pas comme une rumeur. On ne retient QUE ce qui est
   écrit — jamais ce qu'on suppose d'une référence. */
function contenuDuPack(titre, description) {
  var t = String(titre || '') + ' ' + String(description || '');
  if (!t.trim()) return null;
  var c = { batteries: [], chargeurs: 0, coffret: false, machines: 0, brut: t.trim().slice(0, 300) };

  /* « 2 x 5,0 Ah », « 2 batteries 5 Ah », « 5 X 5.0Ah » */
  var re = /(\d{1,2})\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*Ah/g, m;
  while ((m = re.exec(t)) !== null) {
    c.batteries.push({ nb: parseInt(m[1], 10), ah: parseFloat(m[2].replace(',', '.')) });
  }
  if (!c.batteries.length) {
    var m2 = t.match(/(\d{1,2})\s*batteries?\b/i);
    var m3 = t.match(/(\d+(?:[.,]\d+)?)\s*Ah/i);
    if (m2) c.batteries.push({ nb: parseInt(m2[1], 10), ah: m3 ? parseFloat(m3[1].replace(',', '.')) : null });
  }
  /* « Lot de 5 », « lot de batteries 5 x <réf> » — N exemplaires du MÊME
     article, la forme la plus fréquente et la plus rentable. */
  var mLot = t.match(/\b(?:lots?|packs?|sets?|kits?)\s+(?:de\s+)?(?:batteries?\s+)?(\d{1,2})\b/i);
  if (mLot && !c.batteries.length) c.batteries.push({ nb: parseInt(mLot[1], 10), ah: null });

  /* ⛔⛔ UN CHARGEUR NE SE DEVINE PAS À UNE RÉFÉRENCE — DÉFAUT DE MON PROPRE
     PREMIER JET, ATTRAPÉ EN LE TESTANT SUR SES TITRES RÉELS. Le motif visait
     aussi les références en `DCB1xx` « parce que les chargeurs y ressemblent ».
     Or les BATTERIES portent la même forme : sur « Lot de 5 Batteries »,
     `DCB184` matchait, et le contenu sortait avec un chargeur INEXISTANT.
     Conséquence : le coût reconstitué gonfle d'un chargeur fantôme, la
     reconstitution paraît trop chère, et on garde le pack à tort — on perd
     l'économie au lieu de la prendre.
     ⇒ On ne compte un chargeur que si le titre ou la description l'ÉCRIT.
     Le titre dit la vérité (M-48) ; une référence, elle, ne dit que sa forme. */
  if (/\bchargeurs?\b|\bcharger\b/i.test(t)) c.chargeurs = 1;
  if (/\bcoffret\b|\bmakpac\b|\btstak\b|\bmallette\b|\bt-?stak\b/i.test(t)) c.coffret = true;
  var mo = t.match(/(\d{1,2})\s*(?:machines?|outils?)\b/i);
  if (mo) c.machines = parseInt(mo[1], 10);

  var total = c.batteries.reduce(function (s, b) { return s + (b.nb || 0); }, 0);
  if (!total && !c.chargeurs && !c.coffret && !c.machines) return null;
  c.nbBatteries = total;
  return c;
}

/* ── LE PRODUIT EST-IL L'ARTICLE QU'ON COMPTE, OU LA MACHINE QUI LE CONTIENT ?
   ⛔⛔⛔ ERREUR QUE J'AI FAITE ET QUE JE RETIRE, LE 13/08/2026 — elle aurait
   coûté très cher. J'ai divisé le prix par le nombre de batteries annoncées,
   pour TOUT produit. Résultat mesuré sur son relevé : une clé à chocs vendue
   235 € « (2 x 2,0 Ah + DCB107 + TSTAK II) » ressortait à **117,50 €**, comme
   s'il y avait deux clés à chocs. Il n'y en a qu'UNE : les deux batteries sont
   son contenu, pas des exemplaires. J'avais annoncé « 51 références gagnantes,
   9 078 € d'économie » — un chiffre FAUX, bâti sur cette division.

   ⇒ DIVISER n'a de sens que si le produit EST l'article compté :
     · un LOT DE BATTERIES divisé par le nombre de batteries → le coût unitaire
       d'une batterie. Juste.
     · une MACHINE livrée avec deux batteries divisée par deux → un coût qui ne
       correspond à rien. Faux, et dans le sens qui fait vendre à perte.
   Pour une machine, ce n'est pas une division qu'il faut : c'est une
   SOUSTRACTION — retirer du prix du pack ce que valent les batteries et le
   chargeur pour obtenir le coût de la machine nue.

   ⚠️ Le type vient du parseur (`car.type`, `car.famille`), jamais d'une
   supposition sur la référence. */
function roleDuProduit(car, contenu) {
  var type = String((car && (car.type || car.rayon)) || '').toLowerCase();
  var famille = String((car && car.famille) || '').toLowerCase();
  var estBatterie = /batterie/.test(type) || (famille === 'energie' && /batterie/.test(type));
  var estChargeur = /chargeur/.test(type);
  var nb = contenu ? (contenu.nbBatteries || 0) : 0;

  if (estBatterie && nb > 1 && !(contenu && contenu.chargeurs)) return 'lot-de-batteries';
  /* ⚠️ Un lot de batteries VENDU AVEC un chargeur n'est pas divisible tel
     quel : le chargeur est dans le prix. On le traite comme un pack, à
     reconstituer, jamais à diviser. */
  if (estBatterie && nb > 1) return 'lot-de-batteries-avec-chargeur';
  if (estChargeur) return 'chargeur';
  if (!estBatterie && nb > 0) return 'machine-avec-batteries';
  return 'autre';
}

/* ── LE COÛT DE LA MACHINE NUE, DÉDUIT D'UN PACK ────────────────────────────
   C'est la demande de l'user : « on reconstitue avec des produits nus si ça
   coûte moins cher ». Ici on fait l'inverse du pack : on RETIRE du prix ce que
   valent les accessoires, et il reste la machine.
   ⛔ Un accessoire dont le prix est inconnu ⇒ REFUS. Retirer moins que la
   réalité laisse un coût de machine trop HAUT (on vend trop cher, on perd des
   ventes) ; en retirer trop laisse un coût trop BAS (on vend à perte). Aucun
   des deux ne se devine : sans prix, on ne conclut pas. */
function coutMachineNue(prixDuPack, contenu, prix) {
  var p = Number(prixDuPack);
  if (!(p > 0) || !contenu || typeof prix !== 'function') {
    return { complet: false, total: null, retire: [], manquant: 'donnees insuffisantes' };
  }
  var retire = [], reste = p, manquant = null;
  contenu.batteries.forEach(function (b) {
    if (manquant) return;
    var u = prix({ quoi: 'batterie', ah: b.ah });
    if (!(u > 0)) { manquant = 'batterie' + (b.ah ? ' ' + b.ah + ' Ah' : ''); return; }
    reste -= u * (b.nb || 1);
    retire.push({ quoi: 'batterie' + (b.ah ? ' ' + b.ah + ' Ah' : ''), nb: b.nb || 1, unitaire: u });
  });
  if (!manquant && contenu.chargeurs) {
    var uc = prix({ quoi: 'chargeur' });
    if (!(uc > 0)) manquant = 'chargeur';
    else { reste -= uc * contenu.chargeurs; retire.push({ quoi: 'chargeur', nb: contenu.chargeurs, unitaire: uc }); }
  }
  if (manquant) return { complet: false, total: null, retire: retire, manquant: manquant };
  /* ⛔ UN RESTE NÉGATIF OU DÉRISOIRE EST UN REFUS, PAS UN RÉSULTAT. Il veut
     dire que les accessoires « valent » plus que le pack entier : soit un prix
     d'accessoire est faux, soit le pack est une promotion. Dans les deux cas
     on ne sait pas, et un coût de machine à 3 € ferait vendre à perte. */
  if (!(reste > 0) || reste < p * 0.1) {
    return { complet: false, total: null, retire: retire,
      manquant: 'reste invraisemblable (' + Math.round(reste * 100) / 100 + ' EUR sur ' + p + ' EUR)' };
  }
  return { complet: true, total: Math.round(reste * 100) / 100, retire: retire, manquant: null };
}

/* ── LE COÛT RECONSTITUÉ ────────────────────────────────────────────────────
   `prix` est une fonction fournie par l'appelant : `prix(quoi)` rend le
   meilleur prix connu pour un composant, ou null. On ne va rien chercher
   nous-mêmes : ce module ne lit ni fichier ni service, il calcule.
   ⛔ UN SEUL COMPOSANT SANS PRIX ⇒ REFUS. Un total amputé d'une pièce est plus
   bas que la vérité, et un coût trop bas fait vendre à perte. */
function coutReconstitue(contenu, prix) {
  if (!contenu || typeof prix !== 'function') return { complet: false, total: null, detail: [], manquant: 'contenu illisible' };
  var detail = [], total = 0, manquant = null;

  contenu.batteries.forEach(function (b) {
    if (manquant) return;
    var u = prix({ quoi: 'batterie', ah: b.ah });
    if (!(u > 0)) { manquant = 'batterie' + (b.ah ? ' ' + b.ah + ' Ah' : ''); return; }
    total += u * (b.nb || 1);
    detail.push({ quoi: 'batterie' + (b.ah ? ' ' + b.ah + ' Ah' : ''), nb: b.nb || 1, unitaire: u });
  });
  if (!manquant && contenu.chargeurs) {
    var uc = prix({ quoi: 'chargeur' });
    if (!(uc > 0)) manquant = 'chargeur';
    else { total += uc * contenu.chargeurs; detail.push({ quoi: 'chargeur', nb: contenu.chargeurs, unitaire: uc }); }
  }
  if (!manquant && contenu.coffret) {
    var uf = prix({ quoi: 'coffret' });
    /* ⚠️ LE COFFRET EST LA SEULE PIÈCE QU'ON ACCEPTE À ZÉRO, et c'est dit :
       il est presque toujours fourni AVEC la machine, jamais vendu seul au
       relevé. L'ignorer SOUS-ESTIME le pack reconstitué — donc pousse à
       préférer le pack, jamais à vendre à perte. C'est le sens sûr (M-11). */
    if (uf > 0) { total += uf; detail.push({ quoi: 'coffret', nb: 1, unitaire: uf }); }
    else detail.push({ quoi: 'coffret', nb: 1, unitaire: 0, note: 'non vendu seul : compte pour zero' });
  }
  if (manquant) return { complet: false, total: null, detail: detail, manquant: manquant };
  if (!detail.length) return { complet: false, total: null, detail: [], manquant: 'aucun composant chiffrable' };
  return { complet: true, total: Math.round(total * 100) / 100, detail: detail, manquant: null };
}

/* ── LE MEILLEUR DES DEUX ───────────────────────────────────────────────────
   « On n'efface pas le pack, on le reconstitue si ça coûte moins cher. »
   ⚠️ Égalité ⇒ on garde le PACK : à prix identique, une seule commande vaut
   mieux que trois, et c'est ce que l'user paierait réellement. */
function meilleurCout(prixDuPack, reconstitue) {
  var p = Number(prixDuPack);
  if (!(p > 0)) {
    if (reconstitue && reconstitue.complet) return { retenu: reconstitue.total, origine: 'reconstitue', economie: null };
    return { retenu: null, origine: 'aucun', economie: null };
  }
  if (!reconstitue || !reconstitue.complet) return { retenu: p, origine: 'pack', economie: null };
  if (reconstitue.total < p) {
    return { retenu: reconstitue.total, origine: 'reconstitue',
      economie: Math.round((p - reconstitue.total) * 100) / 100 };
  }
  return { retenu: p, origine: 'pack', economie: 0 };
}

/* ── LE CAS LE PLUS FRÉQUENT ET LE PLUS RENTABLE : N FOIS LE MÊME ARTICLE ───
   Un lot de N exemplaires d'une même référence donne directement le coût
   unitaire. Mesuré sur son relevé : c'est ce qui fait passer une batterie de
   84,90 € à 59,44 €. */
function meilleurCoutUnitaire(offres) {
  var best = null;
  (offres || []).forEach(function (o) {
    if (!o) return;
    var n = Math.max(1, parseInt(o.quantite, 10) || 1);
    var p = Number(o.prix);
    if (!(p > 0)) return;
    var u = Math.round((p / n) * 100) / 100;
    if (!best || u < best.unitaire) {
      best = { unitaire: u, quantite: n, prixDuLot: p, titre: o.titre || '' };
    }
  });
  return best;
}

module.exports = {
  contenuDuPack: contenuDuPack,
  roleDuProduit: roleDuProduit,
  coutMachineNue: coutMachineNue,
  coutReconstitue: coutReconstitue,
  meilleurCout: meilleurCout,
  meilleurCoutUnitaire: meilleurCoutUnitaire
};
