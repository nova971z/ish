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

/* ── S6 : les tournures qui affirment un fait sur SON environnement ───────
   On ne vise QUE l'affirmation catégorique au présent sur une chose qui vit
   hors du dépôt. Une question, un conditionnel ou une demande passent : le
   but est d'empêcher la déduction déguisée en constat, pas de bâillonner. */
var ENVIRONNEMENT_USER = new RegExp(
  '(?:^|[.!?]\\s+)[^.!?\\n]{0,80}\\b(?:ton|ta|tes|votre|vos)\\s+'
  + '(?:raccourcis?|shortcuts?|firestore|base|configuration|config|variables?|'
  + 'r[ée]glages?|automatisations?)\\b[^.!?\\n]{0,60}'
  + '\\b(?:tourne|tournent|est|sont|vaut|valent|contient|contiennent|porte|portent|'
  + 'n\'[ée]crit|n\'[ée]crivent|ne\\s+couvre|ne\\s+couvrent)\\b',
  'i');

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

/* ══ S7 — LES QUATRE INTERDICTIONS DU 03/08/2026 ═════════════════════════
   Posées par l'user après le cinquantième essai sur le même parseur, mot
   pour mot : « tu dois te corriger bordel de merde ». Elles étaient déjà
   écrites au protocole — et j'avais déjà enfreint la première. ⛔ Une règle
   qu'aucune porte n'applique n'est qu'un vœu : elles deviennent exécutables.

   ⚠️ Chaque motif est ÉTROIT, pour la raison écrite plus haut : une porte qui
   refuse à tort finit désactivée, et ne protège alors plus rien. On ne vise
   que des formulations qui ne peuvent pas être autre chose. */

/* I-1 — jamais un mot sur SON état. */
var ETAT_USER = new RegExp(
  '\\b(?:tu (?:es|as l\'air|dois être|sembles) (?:fatigu|crev|épuis)|'
  + 'va (?:te )?(?:dormir|coucher)|tu veux (?:aller )?(?:te coucher|dormir)|'
  + 'repose-toi|prends du repos|il est tard|à cette heure-ci|bonne nuit)\\b', 'i');

/* I-3 — on ne demande pas par où commencer quand tout est dans le périmètre. */
var DEMANDE_ORIENTATION = new RegExp(
  '(?:dis-moi (?:si|par quoi|lequel|laquelle)|tu (?:veux|préfères) que je (?:commence|attaque|fasse)|'
  + 'je (?:commence|attaque) par (?:quoi|lequel)|par (?:quoi|où) (?:je )?(?:commence|on commence)|'
  + 'lequel (?:je fais|on fait|veux-tu)|(?:ça|celui-ci) ou (?:ça|celui-là)\\s*\\?)', 'i');

/* I-2 et I-4 — un aveu d'échec ne vaut qu'APRÈS avoir cherché. On ne détecte
   pas l'intention : on détecte l'aveu NON accompagné d'une trace de recherche
   ou de reprise. Le remède est écrit dans le grief, pas deviné. */
var AVEU_ECHEC = new RegExp(
  '(?:je n\'?y arrive pas|je n\'?ai pas (?:réussi|pu) (?:à )?(?:le |la |les )?(?:faire|corriger|résoudre)|'
  + 'ça (?:ne )?marche (?:toujours )?pas et je (?:ne )?sais pas|'
  + 'je (?:ne )?vois pas (?:comment|pourquoi)|c\'est au-dessus de mes)', 'i');
var RECHERCHE_FAITE = new RegExp(
  '(?:j\'ai cherché|recherche (?:faite|en ligne)|j\'ai mesuré|mesuré (?:sur|le|la)|'
  + 'sources? consultée?s?|j\'ai lu (?:la doc|le code|la source)|hypothèse|'
  + 'reproduit|je reprends|je recommence|je corrige)', 'i');

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
/* ⚠️ E-209 — LA FENÊTRE DOIT COUVRIR LE TOUR, PAS UN NOMBRE D'OCTETS.
   Une fenêtre fixe de 8 Mo a produit un REFUS À TORT : dans un tour très
   long, les premières sorties d'outils tombaient hors de la fenêtre, et deux
   chiffres pourtant mesurés ont été déclarés inventés.
   On agrandit donc jusqu'à voir le message de l'user AVEC des entrées avant
   lui — c'est la seule preuve qu'on tient le tour ENTIER. Sans cette preuve,
   `tourCourant` rend `null` et S3 se désactive : mieux vaut ne pas contrôler
   que refuser à tort, une porte qui gêne finit désactivée. */
var FENETRES = [8, 32, 128, 512].map(function (m) { return m * 1024 * 1024; });

function tourCourant(chemin) {
  for (var k = 0; k < FENETRES.length; k++) {
    var r = tourDansFenetre(chemin, FENETRES[k]);
    if (r === null) return null;                 // illisible : on passe
    if (r.complet || FENETRES[k] >= r.taille) return r.tour;
  }
  return null;                                   // tour non prouvé entier
}

function tourDansFenetre(chemin, fenetreVoulue) {
  var brut;
  try {
    var fd = fs.openSync(chemin, 'r');
    var taille = fs.fstatSync(fd).size;
    var fenetre = Math.min(taille, fenetreVoulue);
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
  if (!L.length) return { tour: null, complet: false, taille: taille };

  var debut = -1;
  L.forEach(function (o, i) {
    if (o.type !== 'user') return;
    var c = o.message && o.message.content;
    if (Array.isArray(c) && c.some(function (x) { return x.type === 'tool_result'; })) return;
    debut = i;
  });
  if (debut === -1) return { tour: null, complet: false, taille: taille };

  /* Le tour n'est PROUVÉ entier que si des entrées précèdent le message de
     l'user dans la fenêtre — ou si la fenêtre couvre tout le fichier. Sinon
     elle a pu couper le début du tour, et un chiffre mesuré passerait pour
     inventé (E-209). */
  var complet = debut > 0 || fenetre >= taille;

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
  return {
    tour: { appels: appels, resultats: resultats, sorties: sorties },
    complet: complet, taille: taille
  };
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

  /* ── S6 : AFFIRMER UN FAIT SUR L'ENVIRONNEMENT DE L'USER ──────────────
     ⛔ LA FAUTE DU 01/08/2026, COMMISE TROIS FOIS DANS LA MÊME SOIRÉE.

     J'ai affirmé, comme des faits :
       · que son raccourci Festool tournait en simulation — sa capture montrait
         `dryRun=0` ; c'est le document du dépôt qui était périmé ;
       · qu'il devait coller 541 coûts à la main — le traqueur les écrivait
         déjà tout seul ;
       · que les produits Festool n'existaient pas chez le fournisseur — sa
         page en affiche 50, et l'analyseur les reconnaît.

     Les trois ont la MÊME forme : j'ai lu un fichier du DÉPÔT et j'en ai
     déduit l'état de SON installation. Or ces choses-là vivent ailleurs —
     l'app Raccourcis de son iPad, sa base Firestore, la page du fournisseur.
     Le dépôt n'en contient que des copies, et une copie ne prouve rien.

     ⛔ AUCUNE des trente portes ne pouvait attraper ça : elles vérifient
     toutes le dépôt contre lui-même. Celle-ci vérifie MA PAROLE.

     Règle : une affirmation sur son environnement exige une source venue de
     SON côté dans le tour — une capture, un relevé qu'il a collé. Sans ça,
     on demande. On ne déduit pas. */
  /* La preuve ne peut venir que de SON côté : une capture qu'il a envoyée
     (lue depuis `uploads/`), ou un relevé qu'il a collé et qu'on a relu.
     Sans cette trace dans le tour, toute affirmation sur son installation est
     une déduction — et c'est exactement ce qui a produit E-603. */
  var preuveVenueDeLUser = !!(tour && tour.sorties
    && /\/uploads\/|uploads\/[0-9a-f-]{8}/i.test(tour.sorties));
  var nuEnv = horsCitations(msg);
  var mEnv = nuEnv.match(ENVIRONNEMENT_USER);
  /* ⚠️ UNE QUESTION N'EST PAS UNE AFFIRMATION — corrigé sur-le-champ, le
     premier essai bloquait « Est-ce que ton raccourci tourne en dryRun 0 ? ».
     C'est E-208 : une porte qui refuse le légitime se fait désactiver, donc
     ne protège plus rien. Demander est exactement le comportement voulu ici :
     on ne peut pas le punir. */
  if (mEnv) {
    var apres = nuEnv.slice(nuEnv.indexOf(mEnv[0]));
    var finPhrase = apres.search(/[.!?\n]/);
    var estQuestion = finPhrase !== -1 && apres.charAt(finPhrase) === '?';
    if (estQuestion || /^(?:est-ce|peux-tu|pourrais-tu|quel|quelle|combien|as-tu|sais-tu)\b/i
        .test(mEnv[0].replace(/^[^A-Za-zÀ-ÿ]+/, ''))) mEnv = null;
  }
  if (mEnv && !preuveVenueDeLUser) {
    griefs.push('« ' + mEnv[0].trim() + ' » affirme un fait sur l\'environnement de '
      + 'l\'user — raccourci, Firestore, page fournisseur, variable Vercel — sans '
      + 'qu\'aucune capture ni relevé venu de LUI n\'ait été fourni dans ce tour. '
      + 'Le dépôt n\'en contient que des COPIES, et une copie périmée se lit comme '
      + 'la réalité (E-603). Demander, ou attendre une capture. Jamais déduire.');
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

  /* ── S7 : LES QUATRE INTERDICTIONS (03/08/2026) ───────────────────────── */
  var c71 = nu.match(ETAT_USER);
  if (c71) {
    griefs.push('« ' + c71[0] + ' » parle de l\'état de l\'user, pas du travail. '
      + 'I-1 : ni fatigue, ni sommeil, ni heure chez lui, ni ce qu\'il devrait faire '
      + 'de son temps. Retirer la phrase — elle n\'ajoute rien, et il l\'a interdit '
      + 'deux fois.');
  }
  var c73 = nu.match(DEMANDE_ORIENTATION);
  if (c73) {
    griefs.push('« ' + c73[0] + ' » demande à l\'user de choisir par où commencer. '
      + 'I-3 : tant que sa demande n\'est pas remplie, on CONTINUE — et si deux '
      + 'chantiers sont dans le périmètre, on fait LES DEUX. Une question ne se pose '
      + 'que dans les cas de §7 : mesure contredisant la demande, geste irréversible, '
      + 'filet manquant, décision tracée contraire, ou deux hypothèses à égalité '
      + 'APRÈS mesure.');
  }
  var c72 = nu.match(AVEU_ECHEC);
  if (c72 && !RECHERCHE_FAITE.test(nu)) {
    griefs.push('« ' + c72[0] + ' » constate un échec sans dire ce qui a été CHERCHÉ '
      + 'pour le lever. I-2 et I-4 : bloqué ⇒ on cherche (Web, doc constructeur, '
      + 'source officielle, code existant), on corrige, on remesure. « Je n\'y arrive '
      + 'pas » n\'est une réponse qu\'APRÈS la recherche — et alors elle dit ce qui a '
      + 'été cherché et ce qui manque exactement.');
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
    msg: 'Les 138 assertions passent et la CI est verte : rien ne régresse.' },

  /* ── S7 : les quatre interdictions du 03/08/2026 ─────────────────────────
     Chacune dans LES DEUX directions : ce qui doit être refusé, et ce qui
     doit passer. Une porte qui refuse à tort finit désactivée. */
  { nom: 'I-1 — un mot sur son état', bloque: true,
    msg: 'Il est tard, on reprendra ça demain.' },
  { nom: 'I-1 — variante sommeil', bloque: true,
    msg: 'Tu veux aller te coucher ? On continue demain.' },
  { nom: 'I-1 — « tard » qui parle du CODE, pas de lui', bloque: false,
    msg: 'Le contrôle arrive trop tard dans la chaîne : il lit après l\'écriture.' },
  { nom: 'I-3 — demander par où commencer', bloque: true,
    msg: 'Dis-moi si j\'attaque les 3 non lues ou les 2 sans type.' },
  { nom: 'I-3 — variante « tu veux que je »', bloque: true,
    msg: 'Tu veux que je commence par le parseur ?' },
  { nom: 'I-3 — une question LÉGITIME de §7 passe', bloque: false,
    msg: 'La mesure contredit la demande : le catalogue tombe de 1119 à 1049. '
      + 'Je ne peux pas trancher seul, la décision t\'appartient.' },
  { nom: 'I-2/I-4 — aveu d\'échec SANS recherche', bloque: true,
    msg: 'Je ne vois pas pourquoi ces trois références manquent.' },
  { nom: 'I-2/I-4 — le même aveu APRÈS avoir cherché', bloque: false,
    msg: 'J\'ai cherché la cause : reproduit sur le corpus, hypothèse tuée. '
      + 'Je ne vois pas pourquoi ces trois références manquent — il me faut le '
      + 'texte brut de la page pour trancher.' }
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
