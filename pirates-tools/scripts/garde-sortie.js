/* garde-sortie.js — LA PORTE QUI MANQUAIT À O1.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE
   `docs/ERREURS.md` disait, noir sur blanc : « O1 — affirmer avant de mesurer —
   n'a AUCUNE porte mécanique. Un hook ne peut pas vérifier ce que j'affirme en
   prose. C'est la limite dure du dispositif. »

   C'était vrai des hooks d'ÉCRITURE. Ce n'est pas vrai du hook `Stop`, qui
   reçoit `last_assistant_message` — ma réponse finale — et peut la REFUSER.
   O1 pèse 6 cas sur 21, la classe la plus grave. Elle n'est plus sans dent.

   CE QUE LA PORTE VÉRIFIE — quatre contrôles, tous décidables mécaniquement :
     S1  un fichier cité doit EXISTER sur le disque
     S2  une commande citée doit désigner un script qui EXISTE
     S3  un chiffre donné comme mesuré doit APPARAÎTRE dans une sortie d'outil
         de ce tour  (c'est exactement E-101 : « 55 règles » n'était nulle part)
     S4  « c'est fait / ça marche / tout est vert » exige au moins un outil lancé

   ⚠️ CE QU'ELLE NE PEUT PAS FAIRE. Elle ne juge pas un raisonnement, ne détecte
   pas une conclusion fausse tirée de chiffres justes, ne lit pas une intention.
   Elle attrape la forme la plus fréquente et la plus coûteuse d'O1 : le détail
   concret inventé. Le reste reste humain — et c'est écrit dans le registre.

   ⚠️ JAMAIS DE BLOCAGE PAR ACCIDENT, deux garanties :
     · le moindre doute (transcript illisible, en retard, format inattendu)
       laisse passer — un refus injustifié rendrait la session inutilisable ;
     · UN SEUL refus par message de l'user. Le témoin est posé avant de
       répondre, donc un défaut qu'on n'arrive pas à corriger ne peut pas
       enfermer la session dans une boucle.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

var RACINE = path.join(__dirname, '..');          // pirates-tools/
var DEPOT = path.join(RACINE, '..');              // racine du dépôt

/* ── S3 : ce qui compte comme un CHIFFRE MESURÉ ────────────────────────────
   Uniquement des unités qui ne peuvent venir que d'une mesure. Volontairement
   restrictif : « 8/10 » (une appréciation), « 3 questions » (un plan) ou une
   date ne sont pas des mesures et ne doivent jamais déclencher un refus. */
var UNITES = '(?:ms|s|Ko|Mo|octets?|%|assertions?|portes?|harnais|cas|'
  + 'fichiers?|lignes?|erreurs?|domaines?|origines?|contrôles?|occurrences?|'
  + 'marqueurs?|signaux)';
var CHIFFRE_MESURE = new RegExp('(\\d[\\d\\s  ]*)\\s*' + UNITES + '\\b', 'g');

/* ── S1/S2 : un chemin ou une commande cités ─────────────────────────────── */
var CHEMIN = /(?:^|[\s`'"(])((?:pirates-tools\/|scripts\/|tests\/|docs\/|api\/|\.claude\/)[\w./-]*\.(?:js|mjs|json|md|css|html|rules))/g;

/* Une phrase qui parle d'un fichier ABSENT, à CRÉER ou SUPPRIMÉ ne peut pas
   être jugée sur son existence. On ne devine pas : on s'abstient. */
var CONTEXTE_ABSENCE = /crée|créé|créer|création|à venir|futur|n'existe pas|inexistant|absent|supprim|renomm|manquant|proposer|il faudrait|serait/i;

/* ── S4 : les mots qui DÉCLARENT une chose faite ──────────────────────────
   ⚠️ Uniquement des formules qui ne peuvent pas être autre chose qu'une
   déclaration de travail accompli. Le premier jet listait aussi des
   participes isolés — « vérifié », « terminé » — et a REFUSÉ une réponse
   conversationnelle contenant « comment tu l'as vérifié ». Un participe vit
   dans n'importe quelle phrase ordinaire, y compris dans une question.
   Une porte qui refuse à tort finit désactivée, donc ne protège plus rien :
   au moindre doute sur la formulation, on n'inscrit pas le motif ici. */
var DECLARE_FAIT = /(c'est fait|c'est bon|ça marche|tout est vert|c'est déployé|c'est poussé|je l'ai (poussé|déployé|commité|committé))/i;

/* ── S5 : la CERTITUDE SUR CE QUI N'EST PAS ENCORE ARRIVÉ ──────────────────
   Troisième faiblesse reconnue : je calibre mal ma confiance. Elle a une
   signature étroite — la promesse sur l'avenir ou sur le risque. Par
   construction, elle ne peut PAS être mesurée au moment où on l'écrit : il
   n'existe aucune commande qui prouve qu'une chose est « sans risque ».

   E-103 est exactement cela : « D1 : du gain pur, sans risque » — l'analyse
   a ensuite trouvé 45 liaisons dont 7 pièges. La phrase était formulée avant
   la mesure, et elle a orienté toute la suite.

   Le remède n'est pas de se taire : c'est de dire CE QUI A ÉTÉ MESURÉ.
   « les 138 assertions passent » vaut mieux que « sans risque » — la première
   est vérifiable, la seconde est une humeur déguisée en fait. */
var CERTITUDE = /(sans risque|aucun risque|du gain pur|ça devrait (marcher|fonctionner|passer)|ne peut pas casser|c'est trivial|il suffit de)/i;

/* Une citation n'est pas une affirmation. Le registre CONTIENT « du gain pur,
   sans risque » : sans cette précaution, le citer se bloquerait lui-même —
   et une porte qui empêche de parler de ses propres erreurs est absurde. */
function horsCitations(txt) {
  return txt.replace(/«[^»]*»/g, ' ').replace(/`[^`]*`/g, ' ').replace(/"[^"]*"/g, ' ');
}

function lireEntree() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')) || {}; } catch (e) { return null; }
}

/** Un témoin par message de l'user : un seul refus, jamais de boucle. */
function temoin(d) {
  var id = String(d.prompt_id || d.session_id || 'sans-id').replace(/[^\w-]/g, '');
  return path.join(os.tmpdir(), 'pt-sortie-' + id);
}

/* ── Le tour courant, extrait du transcript ────────────────────────────────
   Un `tool_result` est enregistré comme une entrée « user » ET porte un
   promptId : le prendre pour un message de l'user découpe le tour en morceaux
   d'un seul appel. Mesuré, pas supposé. */
function tourCourant(chemin) {
  var brut;
  try {
    var fd = fs.openSync(chemin, 'r');
    var taille = fs.fstatSync(fd).size;
    var fenetre = Math.min(taille, 8 * 1024 * 1024);
    var buf = Buffer.alloc(fenetre);
    fs.readSync(fd, buf, 0, fenetre, taille - fenetre);
    fs.closeSync(fd);
    brut = buf.toString('utf8');
  } catch (e) { return null; }

  var lignes = brut.split('\n');
  if (taille > fenetre) lignes = lignes.slice(1);        // première ligne tronquée
  var L = [];
  lignes.forEach(function (l) {
    if (!l) return;
    try { L.push(JSON.parse(l)); } catch (e) { /* ligne partielle : ignorée */ }
  });
  if (!L.length) return null;

  var debut = -1;
  L.forEach(function (o, i) {
    if (o.type !== 'user') return;
    var c = o.message && o.message.content;
    if (Array.isArray(c) && c.some(function (x) { return x.type === 'tool_result'; })) return;
    debut = i;
  });
  if (debut === -1) return null;

  var appels = 0, resultats = 0, sorties = '';
  L.slice(debut).forEach(function (o) {
    var c = o.message && o.message.content;
    if (!Array.isArray(c)) return;
    c.forEach(function (x) {
      if (x.type === 'tool_use') appels++;
      if (x.type === 'tool_result') {
        resultats++;
        sorties += (typeof x.content === 'string' ? x.content : JSON.stringify(x.content));
      }
    });
  });
  return { appels: appels, resultats: resultats, sorties: sorties };
}

/** Le fichier existe-t-il, sous l'une des racines plausibles ? */
function existe(rel) {
  return [path.join(DEPOT, rel), path.join(RACINE, rel)].some(function (p) {
    try { return fs.existsSync(p); } catch (e) { return false; }
  });
}

/** La phrase qui entoure une occurrence — pour tester le contexte d'absence. */
function phraseAutour(txt, i) {
  var d = txt.lastIndexOf('\n', i), f = txt.indexOf('\n', i);
  return txt.slice(d === -1 ? 0 : d, f === -1 ? txt.length : f);
}

function controler(msg, tour) {
  var griefs = [];

  /* ── S1 + S2 : chemins et commandes ───────────────────────────────────── */
  var vus = {}, m;
  CHEMIN.lastIndex = 0;
  while ((m = CHEMIN.exec(msg))) {
    var rel = m[1];
    if (vus[rel]) continue;
    vus[rel] = true;
    if (existe(rel)) continue;
    if (CONTEXTE_ABSENCE.test(phraseAutour(msg, m.index))) continue;   // on ne devine pas
    griefs.push('« ' + rel +' » est cité comme existant : ce fichier n\'est '
      + 'nulle part sur le disque. Le vérifier, ou dire qu\'il reste à créer.');
  }

  /* ── S3 : chiffres présentés comme mesurés ────────────────────────────── */
  if (tour && tour.sorties && tour.resultats >= tour.appels - 1) {
    /* ⚠️ Comparer par SOUS-CHAÎNE ne vérifie rien : « 55 » se trouve dans
       n'importe quel identifiant, « 1234 » dans n'importe quel horodatage —
       le premier jet laissait tout passer, mesuré. On compare des JETONS
       entiers : le nombre doit avoir été IMPRIMÉ tel quel. */
    var jetons = Object.create(null);
    (tour.sorties.match(/\d[\d\s,  ]*/g) || []).forEach(function (x) {
      jetons[x.replace(/[\s,  ]/g, '')] = true;
      (x.match(/\d+/g) || []).forEach(function (y) { jetons[y] = true; });
    });
    var chiffres = {};
    CHIFFRE_MESURE.lastIndex = 0;
    while ((m = CHIFFRE_MESURE.exec(msg))) {
      var n = m[1].replace(/[\s  ]/g, '');
      if (n.length < 2) continue;              // 0 à 9 : trop banal pour trancher
      if (chiffres[n]) continue;
      chiffres[n] = true;
      if (jetons[n]) continue;
      griefs.push('le chiffre ' + n + ' est donné comme mesuré, mais il n\'apparaît '
        + 'dans AUCUNE sortie d\'outil de ce tour. C\'est exactement E-101 — '
        + '« 55 règles enfouies » quand il y en avait 79. Lancer la commande, ou '
        + 'ne pas donner le chiffre.');
    }
  }

  /* ── S4 : déclarer fait sans avoir rien lancé ─────────────────────────── */
  if (tour && tour.appels === 0 && DECLARE_FAIT.test(msg)) {
    griefs.push('« c\'est fait / ça marche / tout est vert » est affirmé alors '
      + 'qu\'AUCUN outil n\'a été lancé de tout le tour. Protocole §8, interdit '
      + 'n°2 : rien n\'est fait sans preuve produite et montrée.');
  }

  /* ── S5 : certitude sur ce qui n'est pas encore arrivé ────────────────── */
  var nu = horsCitations(msg);
  var c5 = nu.match(CERTITUDE);
  if (c5) {
    griefs.push('« ' + c5[0] + ' » est une promesse sur l\'avenir : aucune commande '
      + 'ne peut la prouver au moment où elle est écrite. C\'est E-103 — « du gain '
      + 'pur, sans risque » avant que l\'analyse ne trouve 45 liaisons dont 7 pièges. '
      + 'Dire ce qui a été MESURÉ à la place : un résultat vérifiable vaut mieux '
      + 'qu\'une humeur déguisée en fait.');
  }

  return griefs;
}

/* ═══ AUTO-CONTRÔLE — la porte se prouve faillible à chaque CI ════════════
   Une vérification qu'on ne parvient pas à faire échouer ne vérifie rien.
   Ce contrôle exige les DEUX directions : refuser ce qui doit l'être, ET
   laisser passer ce qui est légitime. Un détecteur qui refuse tout est aussi
   inutile qu'un détecteur qui ne refuse rien — il finit désactivé.
   Le faux tour est fabriqué ici, sans transcript : reproductible partout. */
var TOUR_FICTIF = {
  appels: 2, resultats: 2,
  sorties: 'CI OK 33 portes 152 ms\n138/138 assertions\n20 fichiers'
};

var CAS = [
  { nom: 'fichier inventé', bloque: true,
    msg: 'Le correctif vit dans scripts/ceci-nexiste-pas.js.' },
  { nom: 'fichier réel', bloque: false,
    msg: 'Le correctif vit dans scripts/garde-entonnoir.js.' },
  { nom: 'chiffre jamais imprimé', bloque: true,
    msg: 'La CI passe 4711 portes.' },
  { nom: 'chiffre réellement imprimé', bloque: false,
    msg: 'La CI passe 33 portes en 152 ms, et 138 assertions sont vertes.' },
  { nom: 'fichier annoncé comme à créer', bloque: false,
    msg: 'Il reste à créer scripts/pas-encore-la.js.' },
  { nom: 'appréciation, pas mesure', bloque: false,
    msg: 'Je mets 8/10 avec 3 réserves.' },
  { nom: 'fait sans preuve, aucun outil lancé', bloque: true,
    msg: 'C\'est fait, tout est vert.', tour: { appels: 0, resultats: 0, sorties: '' } },
  { nom: 'chiffre non vérifiable, transcript en retard', bloque: false,
    msg: 'La CI passe 4711 portes.', tour: { appels: 9, resultats: 2, sorties: 'x' } },
  /* ⚠️ RÉGRESSION E-208 — refus à tort en production. Une réponse purement
     conversationnelle, sans aucun outil lancé, est LÉGITIME : répondre à une
     question n'est pas déclarer un travail fait. Le participe « vérifié »
     dans une question l'avait fait refuser. */
  { nom: 'question contenant « vérifié », aucun outil — conversation', bloque: false,
    msg: 'Demande-moi toujours ce qui manque et comment je l\'ai vérifié.',
    tour: { appels: 0, resultats: 0, sorties: '' } },
  { nom: 'réponse conversationnelle ordinaire, aucun outil', bloque: false,
    msg: 'Sur ce qui se mesure je suis fiable ; sur le jugement, non. '
       + 'Le travail a été poussé hier, mais je ne le réaffirme pas ici.',
    tour: { appels: 0, resultats: 0, sorties: '' } },

  /* ── S5 ── la promesse sur l'avenir, et ce qui NE doit pas la déclencher */
  { nom: 'promesse d\'absence de risque', bloque: true,
    msg: 'On peut appliquer ce correctif sans risque.' },
  { nom: 'minimisation d\'un travail à venir', bloque: true,
    msg: 'Pour corriger, il suffit de changer la ligne.' },
  { nom: 'pronostic sur un correctif non essayé', bloque: true,
    msg: 'Avec cette modification, ça devrait marcher.' },
  { nom: 'la MÊME formule, mais CITÉE — le registre doit rester citable',
    bloque: false,
    msg: 'E-103 disait « du gain pur, sans risque », et c\'était faux.' },
  { nom: 'la même formule dans un extrait de code', bloque: false,
    msg: 'Le motif `sans risque` figure dans la liste des formules interdites.' },
  { nom: 'un constat MESURÉ à la place de la promesse', bloque: false,
    msg: 'Les 138 assertions passent et la CI est verte : rien ne régresse.' }
];

function autoControle() {
  var errors = [];
  CAS.forEach(function (c) {
    var g;
    try { g = controler(c.msg, c.tour || TOUR_FICTIF); }
    catch (e) {
      errors.push('garde-sortie : le cas « ' + c.nom + ' » a fait planter le contrôle : '
        + (e && e.message));
      return;
    }
    var aBloque = g.length > 0;
    if (aBloque !== c.bloque) {
      errors.push('garde-sortie : « ' + c.nom + ' » devrait '
        + (c.bloque ? 'ÊTRE REFUSÉ' : 'PASSER') + ' et ' + (aBloque ? 'a été refusé' : 'est passé')
        + '. La porte d\'O1 ne vaut que si elle refuse le faux ET laisse passer le vrai.');
    }
  });
  return errors;
}

module.exports = autoControle;
module.exports.controler = controler;
module.exports.tourCourant = tourCourant;
module.exports.existe = existe;
module.exports.autoControle = autoControle;

if (require.main === module) {
  if (process.argv[2] === '--controle') {
    var e = autoControle();
    if (e.length) { e.forEach(function (x) { console.error('❌ ' + x); }); process.exit(1); }
    console.log('✅ check-sortie : ' + CAS.length + ' cas, refus et laissez-passer '
      + 'conformes — la porte d\'O1 a des dents');
    process.exit(0);
  }

  var d = lireEntree();
  if (!d) process.exit(0);                                   // illisible : on passe

  var t = temoin(d);
  if (fs.existsSync(t)) process.exit(0);                     // déjà refusé une fois

  var msg = String(d.last_assistant_message || '');
  if (!msg) process.exit(0);

  var tour = d.transcript_path ? tourCourant(d.transcript_path) : null;

  var griefs;
  try { griefs = controler(msg, tour); }
  catch (e) { process.exit(0); }                             // pépin interne : on passe
  if (!griefs.length) process.exit(0);

  try { fs.writeFileSync(t, String(griefs.length)); } catch (e) {}

  console.log(JSON.stringify({
    decision: 'block',
    reason: '⛔ PORTE DE SORTIE — O1, affirmer avant de mesurer.\n\n'
      + griefs.map(function (g, i) { return '  ' + (i + 1) + '. ' + g; }).join('\n')
      + '\n\n  Corriger la réponse : mesurer et montrer la commande, ou retirer '
      + 'l\'affirmation. Le doute se dit — « je n\'ai pas pu mesurer » est une '
      + 'réponse complète, une invention polie ne l\'est pas.\n'
      + '  (Un seul refus par message : ce contrôle ne se represente pas.)'
  }));
  process.exit(0);
}
