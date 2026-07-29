/* interdits.js — CE QUI SE DÉCLENCHE SUR LA DEMANDE, PAS SUR MON AIGUILLAGE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE
   Mesuré le 29/07/2026, en épreuve : deux demandes formulées en langage
   commercial — « trier l'annuaire par prix croissant », « afficher un prix
   barré à partir du tarif conseillé » — routaient toutes deux vers D-012.
   Ni D-009, qui interdit le classement par le prix (lien de subordination),
   ni D-004, qui interdit le prix de référence jamais pratiqué.

   L'entonnoir répond à l'intention QU'ON NOMME. Une demande dangereuse est
   presque toujours formulée par son bénéfice commercial, jamais par le
   mécanisme qu'elle enfreint. Il fallait donc un filet qui morde sur les MOTS
   DE LA DEMANDE, avant tout aiguillage.

   ⚠️ Ce filet n'INTERDIT rien : il RAPPELLE, et il cite la source. La décision
   finale reste à l'user — c'est son entreprise. Ce qui n'est plus permis,
   c'est de commencer à coder sans avoir vu la règle.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

/* Chaque entrée exige les DEUX motifs : un seul suffirait à noyer la sortie
   sous des rappels hors sujet, et un rappel qu'on apprend à ignorer ne
   protège plus de rien. */
var INTERDITS = [
  {
    id: 'I-1',
    quoi: 'Classer, trier ou mettre en avant des livreurs selon leur prix',
    quand: [/trier|tri\b|class(er|ement)|ordonn|rang|meilleur prix|moins cher|moins-disant|premier/i,
            /livreur|coursier|annuaire|prestataire|transporteur/i],
    decision: 'D-009',
    domaine: 'J2',
    pourquoi: 'Une plateforme qui classe ses prestataires par le prix exerce une '
      + 'pression sur leurs tarifs. C\'est une sanction déguisée, donc un indice de '
      + 'lien de subordination — la porte ouverte à la requalification en salariat.',
    source: 'legifrance.gouv.fr → travailleurs des plateformes · directive (UE) 2024/2831'
  },
  {
    id: 'I-2',
    quoi: 'Afficher un prix de référence qui n\'a jamais été pratiqué',
    quand: [/prix barr|prix conseill|prix de référence|économie|remise|réduction|au lieu de|-\s*\d+\s*%/i,
            /affich|montrer|badge|étiquette|bandeau|fiche|produit|catalogue|barr|conseill/i],
    decision: 'D-004',
    domaine: 'J4',
    pourquoi: 'Une réduction annoncée se réfère au prix le plus bas RÉELLEMENT '
      + 'pratiqué sur les 30 jours précédents. Un tarif fournisseur ou un « prix '
      + 'conseillé » n\'est pas un prix de référence : l\'annoncer comme tel est une '
      + 'pratique commerciale trompeuse.',
    source: 'economie.gouv.fr → annonces de réduction de prix · Code de la consommation'
  },
  {
    id: 'I-3',
    quoi: 'Faire fixer, plafonner ou encaisser le prix de la course par la plateforme',
    quand: [/fixe|impose|plafon|encaiss|commission|prélève|tarif unique|grille/i,
            /course|livraison|livreur|coursier/i],
    decision: 'D-009',
    domaine: 'J2',
    pourquoi: 'Fixer le prix et encaisser la prestation sont deux des critères les '
      + 'plus lourds de la requalification. Le livreur doit rester libre de son tarif, '
      + 'et la plateforme hors du flux d\'argent de la course.',
    source: 'legifrance.gouv.fr → Code du travail, travailleurs des plateformes'
  },
  {
    id: 'I-4',
    quoi: 'Montrer le code de remise à un livreur, ou l\'inscrire dans ce qu\'il voit',
    quand: [/code de remise|code remise|code de livraison|preuve de livraison/i,
            /livreur|coursier|affich|transmet|envoi|montrer/i],
    decision: 'D-009',
    domaine: 'J2',
    pourquoi: 'Le code de remise prouve que le client a bien reçu sa commande. Un '
      + 'livreur qui le connaît peut clore une livraison qu\'il n\'a pas faite : la '
      + 'preuve ne prouve plus rien.',
    source: 'décision interne — voir docs/DECISIONS.md'
  },
  {
    id: 'I-5',
    quoi: 'Rendre le refus des traceurs plus difficile que l\'acceptation',
    quand: [/cookie|traceur|consentement|bandeau|analytics|pixel|mesure d.audience/i,
            /accept|refus|bouton|masqu|second|deuxième|plus tard|discret/i],
    decision: 'D-005',
    domaine: 'J3',
    pourquoi: 'Le refus doit être aussi simple que l\'acceptation, au même niveau et '
      + 'au même clic. Un refus enfoui vaut absence de consentement.',
    source: 'cnil.fr → cookies et traceurs'
  }
];

/** Les interdits que le texte d'une demande déclenche. */
function verifier(texte) {
  var t = String(texte || '');
  return INTERDITS.filter(function (i) {
    return i.quand.every(function (re) { return re.test(t); });
  });
}

/** Le rappel, mis en forme pour être injecté dans le contexte. */
function rendu(liste) {
  return liste.map(function (i) {
    return '⛔ ' + i.id + ' — ' + i.quoi
      + '\n   Décision en vigueur : ' + i.decision + '  ·  fiche juridique : ' + i.domaine
      + '\n   Pourquoi : ' + i.pourquoi
      + '\n   À vérifier à la source : ' + i.source;
  }).join('\n\n');
}

/* ═══ CONTRÔLE — un rappel qui cite une décision inexistante ne vaut rien ══ */
function controle() {
  var errors = [];
  var dec = '';
  try { dec = fs.readFileSync(path.join(__dirname, '..', 'docs', 'DECISIONS.md'), 'utf8'); }
  catch (e) { return ['interdits : docs/DECISIONS.md illisible.']; }

  var jur = null;
  try { jur = require('./juridique.js'); } catch (e) {}

  INTERDITS.forEach(function (i) {
    if (dec.indexOf(i.decision) === -1) {
      errors.push('interdits : ' + i.id + ' cite ' + i.decision
        + ' qui n\'est pas dans docs/DECISIONS.md — un rappel sans décision derrière '
        + 'est une opinion, pas une règle.');
    }
    if (jur && jur.DOMAINES && !jur.DOMAINES[i.domaine]) {
      errors.push('interdits : ' + i.id + ' renvoie au domaine ' + i.domaine
        + ' qui n\'existe pas dans le registre juridique.');
    }
    if (i.quand.length < 2) {
      errors.push('interdits : ' + i.id + ' n\'a qu\'un motif. Un seul mot-clé noie la '
        + 'sortie sous des rappels hors sujet, et un rappel qu\'on apprend à ignorer '
        + 'ne protège plus de rien.');
    }
  });

  /* La preuve que le filet mord : chaque interdit doit être déclenché par sa
     propre phrase d'épreuve, et AUCUN ne doit se déclencher sur une demande
     anodine. Les deux sens, comme partout ici. */
  var EPREUVES = [
    ['I-1', 'trier l\'annuaire des livreurs par prix croissant, moins cher en premier'],
    ['I-2', 'afficher un prix barré à partir du prix conseillé sur la fiche produit'],
    ['I-3', 'la plateforme fixe le tarif unique de la course et encaisse la livraison'],
    ['I-4', 'afficher le code de remise au livreur dans son écran'],
    ['I-5', 'masquer le bouton refus des cookies derrière un second écran']
  ];
  EPREUVES.forEach(function (e) {
    var r = verifier(e[1]).map(function (x) { return x.id; });
    if (r.indexOf(e[0]) === -1) {
      errors.push('interdits : ' + e[0] + ' ne se déclenche pas sur sa propre phrase '
        + 'd\'épreuve — le filet ne mord pas. (déclenchés : ' + (r.join(' ') || 'aucun') + ')');
    }
  });
  var ANODINES = [
    'corriger la faute de frappe dans le pied de page',
    'accélérer le chargement des images du catalogue',
    'ajouter un test sur le service worker'
  ];
  ANODINES.forEach(function (t) {
    var r = verifier(t);
    if (r.length) {
      errors.push('interdits : une demande anodine déclenche ' + r.map(function (x) { return x.id; }).join(' ')
        + ' — « ' + t + ' ». Un filet qui crie tout le temps finit ignoré.');
    }
  });

  return errors;
}

module.exports = controle;
module.exports.controle = controle;
module.exports.verifier = verifier;
module.exports.rendu = rendu;
module.exports.INTERDITS = INTERDITS;

if (require.main === module) {
  var a = process.argv[2];
  if (a === '--controle') {
    var e = controle();
    if (e.length) { e.forEach(function (x) { console.error('❌ ' + x); }); process.exit(1); }
    console.log('✅ check-interdits : ' + INTERDITS.length + ' interdits, chacun prouvé '
      + 'mordant sur sa phrase et muet sur les demandes anodines');
    process.exit(0);
  }
  var texte = process.argv.slice(2).join(' ');
  if (!texte) {
    console.log('\nInterdits surveillés — ils se déclenchent sur les MOTS DE LA DEMANDE :\n');
    INTERDITS.forEach(function (i) { console.log('  ' + i.id + ' — ' + i.quoi + '   (' + i.decision + ')'); });
    console.log('');
    process.exit(0);
  }
  var l = verifier(texte);
  console.log(l.length ? '\n' + rendu(l) + '\n' : '\n  Aucun interdit déclenché par cette demande.\n');
}
