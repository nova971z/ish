'use strict';
/* ══ POURQUOI UNE RAFALE REND MOINS DE PAGES QU'ELLE N'EN A ENVOYÉ ═══════════
   Mesuré sur ses quatre balayages du 03/08 : 64 sur 67, puis 65, puis 53.
   `pagesRefusees: 0` à chaque fois — donc aucune page n'est arrivée VIDE.
   J'en avais conclu « le POST n'atteint jamais le serveur ». C'était une
   conclusion de trop : elle ne tient QUE si les 67 requêtes tombent dans la
   MÊME instance serverless. Le cumul, lui, vit dans la mémoire d'UNE instance
   (`pwCouv` dans api/admin.js). Si Vercel en démarre une neuve au milieu du
   balayage, le compteur repart de zéro et rend le NOMBRE DE PAGES DE LA FIN —
   sans qu'une seule page ait été perdue.
   ⛔ 53 = 67 − 14, et 3 179 tuiles ÷ 53 = 59,98 : chaque page arrivée avait
   bien ses soixante tuiles. Un tel reliquat, exactement égal à la queue du
   balayage, ressemble beaucoup plus à un compteur qui redémarre qu'à quatorze
   requêtes qui se perdent — mais « ressemble » n'est pas « mesure ».

   ⛔⛔ CE QUI TRANCHE, ET C'EST ARITHMÉTIQUE. Une rafale a une CADENCE : le
   temps écoulé entre sa première et sa dernière page, divisé par le nombre
   d'intervalles. Elle donne la date à laquelle le balayage a commencé :
       début estimé = première page vue − pagesManquantes × cadence
   Deux cas, et un seul est vrai :
   · l'instance a DÉMARRÉ APRÈS ce début → le balayage tournait déjà quand
     elle est née ; les pages manquantes ont donc été traitées par une AUTRE
     instance. Elles ont été LUES, c'est le cumul qui est amputé.
   · l'instance existait AVANT ce début → elle aurait dû voir ces pages ;
     ne les ayant jamais vues, elles ne lui sont jamais parvenues.

   ⚠️ FONCTION PURE : elle ne lit ni horloge ni réseau, tout entre en argument.
   ⚠️ Portes juridiques lues avant d'écrire : J3 — n'entrent ici que des
   horodatages techniques et des compteurs, aucune donnée personnelle, rien
   n'est persisté ; J4 — aucun prix ne transite, rien ici ne peut servir de
   prix de référence ; J5 — aucune TVA, aucun octroi de mer. */

/* Marge de tolérance sur la comparaison des deux dates : une cadence estimée
   sur quelques dizaines de pages n'est pas une horloge atomique. En dessous
   d'une cadence d'écart, on ne tranche PAS — et on le dit. */
var MARGE_CADENCES = 1;

function expliquerRafale(o) {
  o = o || {};
  var pages = Math.max(0, parseInt(o.pagesDansLaRafale, 10) || 0);
  var manquantes = Math.max(0, parseInt(o.pagesManquantes, 10) || 0);
  var refusees = Math.max(0, parseInt(o.pagesRefusees, 10) || 0);
  var enDouble = Math.max(0, parseInt(o.pagesEnDouble, 10) || 0);
  var debutRafale = Number(o.debutRafale);      // 1re page vue par CETTE instance
  var finRafale = Number(o.finRafale);          // dernière page vue
  var demarrageInstance = Number(o.demarrageInstance);

  var res = {
    cadenceSecondes: null,
    debutEstimeBalayage: null,
    instanceNeeApresLeDebut: null,
    cause: null,
    lecture: ''
  };

  if (!manquantes) {
    res.cause = 'complet';
    res.lecture = 'Le cumul porte les ' + pages + ' pages attendues : rien ne manque.';
    return res;
  }

  /* ⛔ UNE PAGE ARRIVÉE VIDE EST UNE CAUSE CONNUE — elle prime, parce qu'elle
     est MESURÉE et non déduite. On ne va pas estimer une date quand le
     serveur a déjà vu le problème de ses propres yeux. */
  if (refusees > 0) {
    res.cause = 'pages-vides';
    res.lecture = refusees + ' page(s) sont ARRIVÉES VIDES : le fournisseur n\'a rien '
      + 'rendu et le POST est parti quand même. Le remède est côté lecture de la page, '
      + 'pas côté réseau.';
    return res;
  }

  /* ⛔⛔ LE PLAN DEMANDE PLUS DE PAGES QUE LE SITE N'EN SERT — ET J'AI RENDU
     LA MAUVAISE CAUSE PENDANT UN BALAYAGE ENTIER.
     Mesuré sur son relevé du 10/08/2026 : `pagesDistinctes: 67`,
     `pagesEnDouble: 45`, `pagesManquantes: 45`, et la cause rendue était
     **`jamais-arrivees`** — « le remède est côté réseau ». C'était faux, et
     doublement : les 45 pages sont bel et bien ARRIVÉES (elles sont comptées
     dans les doublons), et le remède n'a rien à voir avec le réseau. Le
     fournisseur ressert simplement sa PAGE 1 pour tout rang au-delà du dernier
     vrai — 60 tuiles pleines, une réponse d'aspect parfaitement normal.
     ⛔ Les deux compteurs décrivaient LE MÊME incident sous deux étiquettes
     opposées, et l'estimation de cadence tranchait entre deux hypothèses dont
     AUCUNE n'était la bonne. Une déduction bien menée sur un cas absent du
     catalogue des causes rend une réponse fausse avec assurance.
     ⇒ Le doublon est MESURÉ, pas déduit : il passe donc AVANT l'estimation de
     cadence, au même titre que la page vide.
     ⚠️ Portes lues — J3 : des compteurs de pages, aucune donnée personnelle ;
     J4 : aucun prix ; J5 : aucune fiscalité. */
  if (enDouble > 0 && enDouble >= manquantes) {
    res.cause = 'plan-trop-long';
    res.lecture = 'Les ' + manquantes + ' page(s) « absentes » sont ARRIVÉES : le '
      + 'fournisseur a resservi ' + enDouble + ' page(s) au contenu IDENTIQUE, parce '
      + 'que le plan demande plus de pages que le site n\'en sert. Rien à réparer côté '
      + 'réseau. Ramener `pages` du plan à ' + pages + ' dans api/_lib/traqueur-plans.js : '
      + 'les requêtes en trop ne rapportent aucune information ET réécrivent des prix '
      + 'déjà écrits.';
    return res;
  }
  if (enDouble > 0) {
    /* Une partie s'explique, l'autre non — on ne fond pas les deux en une cause. */
    res.cause = 'doublons-partiels';
    res.lecture = 'Le fournisseur a resservi ' + enDouble + ' page(s) identique(s) sur '
      + manquantes + ' manquante(s) : le plan est trop long d\'au moins ' + enDouble
      + ' page(s), et il reste ' + (manquantes - enDouble) + ' page(s) sans explication. '
      + 'Corriger `pages` du plan d\'abord, puis relire ce compteur — deux causes '
      + 'mêlées ne se soignent pas ensemble.';
    return res;
  }

  if (!isFinite(debutRafale) || !isFinite(finRafale) || !isFinite(demarrageInstance)
      || pages < 2 || finRafale <= debutRafale) {
    res.cause = 'indeterminable';
    res.lecture = 'Trop peu de pages dans ce cumul pour estimer une cadence : '
      + 'la cause des ' + manquantes + ' page(s) absentes ne peut pas être tranchée ici.';
    return res;
  }

  var cadence = (finRafale - debutRafale) / 1000 / (pages - 1);
  res.cadenceSecondes = Math.round(cadence * 10) / 10;
  var debutEstime = debutRafale - manquantes * cadence * 1000;
  res.debutEstimeBalayage = Math.round(debutEstime);

  var ecart = (demarrageInstance - debutEstime) / 1000;   // > 0 : instance née après
  if (ecart > cadence * MARGE_CADENCES) {
    res.instanceNeeApresLeDebut = true;
    res.cause = 'instance-froide';
    res.lecture = 'Le balayage avait commencé ' + Math.round(ecart) + ' s AVANT que cette '
      + 'instance ne démarre : les ' + manquantes + ' page(s) absentes ont été traitées par '
      + 'une instance précédente. Elles ont été LUES — c\'est le cumul qui est amputé, pas '
      + 'le balayage. Le total juste se calcule sur le fichier des réponses '
      + '(scripts/bilan-balayage.js), pas sur ce compteur.';
    return res;
  }
  if (ecart < -cadence * MARGE_CADENCES) {
    res.instanceNeeApresLeDebut = false;
    res.cause = 'jamais-arrivees';
    res.lecture = 'Cette instance existait déjà ' + Math.round(-ecart) + ' s avant le début '
      + 'estimé du balayage : elle aurait dû voir les ' + manquantes + ' page(s) absentes. '
      + 'Ne les ayant jamais reçues, elles ne lui sont jamais parvenues — le remède est côté '
      + 'réseau (requête fournisseur échouée, ou POST perdu).';
    return res;
  }
  res.instanceNeeApresLeDebut = null;
  res.cause = 'indecis';
  res.lecture = 'Démarrage de l\'instance et début estimé du balayage tombent à moins d\'une '
    + 'cadence l\'un de l\'autre (' + Math.round(ecart) + ' s pour une cadence de '
    + res.cadenceSecondes + ' s) : on ne tranche pas.';
  return res;
}

module.exports = { expliquerRafale: expliquerRafale, MARGE_CADENCES: MARGE_CADENCES };
