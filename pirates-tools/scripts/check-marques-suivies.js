/* check-marques-suivies.js — TOUTE MARQUE DU CATALOGUE EST SUIVIE, OU DÉCLARÉE.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔⛔ POURQUOI CETTE PORTE EXISTE — MESURÉ LE 16/08/2026, ET PERSONNE NE
   POUVAIT LE SAVOIR. Le catalogue tient 1 708 fiches : DEWALT 1 047,
   MAKITA 611, **FESTOOL 50**. Les plans du traqueur, eux, couvrent DEWALT,
   MAKITA et MILWAUKEE. Conséquences, les deux mesurées le même jour :
     · les **50 fiches FESTOOL n'ont JAMAIS été balayées** — aucun plan ne les
       désigne, donc aucun relevé, donc leur prix ne repose sur aucun coût
       fournisseur relu. Elles ne peuvent même pas être GELÉES : le gel se
       déclenche sur un relevé périmé, et il n'y a pas de relevé ;
     · un plan **MILWAUKEE** existe pour **0 fiche** — du travail entretenu
       pour une marque absente, et un chiffre de couverture qui paraît complet.
   Rien, nulle part, ne disait ni l'un ni l'autre. `check-plan-traqueur` vérifie
   la FORME des plans (pagination, adresses, refus d'une marque inconnue) et
   ne lit JAMAIS le catalogue — les deux moitiés de la question vivaient dans
   deux fichiers qui ne se parlaient pas.

   ⇒ Cette porte croise les deux, et refuse le silence. Une marque du catalogue
   sans plan est soit une marque à brancher, soit une marque **déclarée** —
   jamais un oubli invisible. Même doctrine qu'un repère désarmé : daté, motivé,
   écrit (D-021). Une marque déclarée reste comptée et affichée à chaque CI :
   on ne l'oublie pas, on la voit.

   ⚠️ CE QUE CETTE PORTE NE PRÉTEND PAS FAIRE : elle ne dit pas qu'un plan
   FONCTIONNE (c'est `check-plan-traqueur`), ni qu'une marque est LISIBLE par
   le parseur — les 50 références FESTOOL sont toutes numériques et le parseur
   rend `null` sur leurs titres (mesuré le 16/08). Brancher un plan ne suffirait
   donc pas. C'est dit ici, pas caché, et ça reste à traiter à part.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var path = require('path');
var RACINE = path.join(__dirname, '..');

/* ⛔ LA SEULE PORTE DE SORTIE — et elle coûte d'être écrite. Une marque ici
   est une marque dont l'user SAIT qu'elle n'est pas suivie, avec la raison et
   la date. Ajouter une ligne ici est un acte, pas un contournement : le
   compte reste affiché à chaque CI, et la porte redevient rouge le jour où
   la marque est retirée de cette liste sans avoir reçu de plan. */
var MARQUES_NON_SUIVIES_DECLAREES = {
  FESTOOL: {
    depuis: '16/08/2026',
    motif: 'aucun plan d\'adresses fournisseur n\'a jamais été écrit pour cette '
      + 'marque, et ses 50 références sont TOUTES numériques (577985, 578011…) : '
      + 'le parseur rend `null` sur leurs titres, un plan seul ne suffirait pas. '
      + 'Leur prix ne repose donc sur aucun coût fournisseur relu — fait mesuré, '
      + 'écrit, et à trancher par l\'user (brancher la marque, ou la retirer).'
  }
};

/* ⛔⛔ LE CŒUR EST PUR ET INJECTABLE — SINON DEUX DE SES QUATRE PROMESSES NE
   SONT PAS ÉPROUVABLES. Mesuré le 16/08/2026 en la sabotant : couper le
   contrôle « déclarée alors qu'elle A un plan » et couper le préalable
   « catalogue vide » laissaient la porte VERTE — non pas parce qu'ils
   marchent, mais parce qu'AUCUNE donnée réelle ne les déclenche. Une promesse
   qu'aucun état n'atteint est une décoration, et c'est la règle mère des
   harnais qui le dit.
   ⇒ La décision vit dans une fonction PURE à qui l'on peut présenter l'état ;
   les témoins d'en dessous rejouent les sept cas sur des marques SYNTHÉTIQUES
   (⛔ un harnais ne nomme jamais une donnée du catalogue). La production, elle,
   n'injecte RIEN : elle lit le vrai catalogue et les vrais plans. */
function evaluer(etat) {
  var errors = [];
  var avis = [];
  var parMarque = (etat && etat.parMarque) || {};
  var marquesAvecPlan = (etat && etat.marquesAvecPlan) || {};
  var declarees = (etat && etat.declarees) || {};

  /* ⛔ PRÉALABLES — sans eux la porte serait verte sans avoir rien croisé. */
  if (!Object.keys(parMarque).length) {
    errors.push('[check-marques-suivies] ⛔ PRÉALABLE : le catalogue rend 0 marque — '
      + 'la porte serait verte sans avoir rien croisé.');
    return { errors: errors, avis: avis };
  }
  if (!Object.keys(marquesAvecPlan).length) {
    errors.push('[check-marques-suivies] ⛔ PRÉALABLE : aucun plan de traqueur lu — '
      + 'la comparaison n\'aurait aucun sens.');
    return { errors: errors, avis: avis };
  }

  /* ── ① UNE MARQUE VENDUE SANS PLAN EST UNE MARQUE JAMAIS RELEVÉE ────────── */
  Object.keys(parMarque).sort().forEach(function (b) {
    if (marquesAvecPlan[b]) return;
    var dec = declarees[b];
    if (dec) {
      /* Déclarée : on ne bloque pas, mais on la RÉPÈTE — un fait qu'on cesse
         d'afficher est un fait qu'on oublie. */
      avis.push('⚠️ ' + b + ' — ' + parMarque[b] + ' fiche(s) NON SUIVIES, déclaré '
        + 'depuis le ' + dec.depuis + ' : ' + dec.motif);
      return;
    }
    errors.push('[check-marques-suivies] ⛔⛔ ARGENT — la marque ' + b + ' compte '
      + parMarque[b] + ' fiche(s) au catalogue et AUCUN plan de traqueur ne la '
      + 'désigne : ces fiches ne sont jamais relevées, leur prix ne repose sur '
      + 'aucun coût fournisseur relu, et elles ne peuvent même pas être gelées '
      + '(le gel juge un relevé périmé — il n\'y a pas de relevé). Soit on écrit '
      + 'son plan dans api/_lib/traqueur-plans.js, soit on la déclare NON SUIVIE '
      + 'avec sa date et son motif dans MARQUES_NON_SUIVIES_DECLAREES.');
  });

  /* ── ② UN PLAN POUR UNE MARQUE ABSENTE DU CATALOGUE EST UN LEURRE ────────
     Il ne coûte pas d'argent, mais il fait paraître la couverture complète et
     s'entretient pour rien. On le signale ; on ne bloque pas la livraison. */
  Object.keys(marquesAvecPlan).sort().forEach(function (b) {
    if (parMarque[b]) return;
    avis.push('⚠️ un plan existe pour ' + b + ' alors que le catalogue n\'en tient '
      + 'AUCUNE fiche : entretenu pour rien, et il gonfle la couverture apparente '
      + 'du traqueur.');
  });

  /* ── ③ UNE DÉCLARATION QUI NE SERT PLUS DOIT PARTIR ──────────────────────
     Sinon la liste des exceptions grossit et finit par tout autoriser. */
  Object.keys(declarees).sort().forEach(function (b) {
    if (!parMarque[b]) {
      errors.push('[check-marques-suivies] ⛔ ' + b + ' est déclarée NON SUIVIE mais '
        + 'ne figure plus au catalogue : une exception périmée finit par couvrir '
        + 'autre chose — la retirer.');
      return;
    }
    if (marquesAvecPlan[b]) {
      errors.push('[check-marques-suivies] ⛔ ' + b + ' est déclarée NON SUIVIE alors '
        + 'qu\'elle A un plan de traqueur : deux vérités contradictoires en vigueur, '
        + 'la déclaration doit partir.');
    }
  });

  return { errors: errors, avis: avis };
}

/* Les sept cas, dont une CONTRE-ÉPREUVE : une porte qui crie toujours ne dit
   rien de plus qu'une porte qui se tait toujours. */
function temoins() {
  var errs = [];
  function ok(cond, quoi) {
    if (!cond) errs.push('[check-marques-suivies] ⛔ TÉMOIN — ' + quoi);
  }
  var DEC = { depuis: '01/01/2026', motif: 'motif d\'essai' };

  var r1 = evaluer({ parMarque: { ZZMARQUEA: 7 }, marquesAvecPlan: { ZZMARQUEB: 1 }, declarees: {} });
  ok(r1.errors.length === 1 && /ARGENT/.test(r1.errors[0]),
    'une marque vendue SANS plan ni déclaration doit faire ÉCHOUER la CI (obtenu '
    + JSON.stringify(r1.errors) + ')');

  var r2 = evaluer({ parMarque: { ZZMARQUEA: 7 }, marquesAvecPlan: { ZZMARQUEB: 1 },
    declarees: { ZZMARQUEA: DEC } });
  ok(r2.errors.length === 0 && r2.avis.some(function (a) { return /ZZMARQUEA/.test(a); }),
    'une marque DÉCLARÉE ne bloque pas mais reste AFFICHÉE à chaque CI — sinon le '
    + 'fait cesse d\'exister (obtenu ' + JSON.stringify(r2) + ')');

  var r3 = evaluer({ parMarque: { ZZMARQUEA: 7 }, marquesAvecPlan: { ZZMARQUEA: 1 },
    declarees: { ZZMARQUEA: DEC } });
  ok(r3.errors.length === 1 && /contradictoires/.test(r3.errors[0]),
    'une marque déclarée NON SUIVIE qui A un plan est une contradiction en vigueur '
    + 'et doit rougir (obtenu ' + JSON.stringify(r3.errors) + ')');

  var r4 = evaluer({ parMarque: { ZZMARQUEA: 7 }, marquesAvecPlan: { ZZMARQUEA: 1 },
    declarees: { ZZMARQUEC: DEC } });
  ok(r4.errors.length === 1 && /ne figure plus au catalogue/.test(r4.errors[0]),
    'une déclaration pour une marque absente du catalogue est périmée et doit '
    + 'rougir (obtenu ' + JSON.stringify(r4.errors) + ')');

  var r5 = evaluer({ parMarque: {}, marquesAvecPlan: { ZZMARQUEA: 1 }, declarees: {} });
  ok(r5.errors.length === 1 && /PRÉALABLE/.test(r5.errors[0]),
    'un catalogue vide doit ÉCHOUER, jamais verdir à vide (obtenu '
    + JSON.stringify(r5.errors) + ')');

  var r6 = evaluer({ parMarque: { ZZMARQUEA: 7 }, marquesAvecPlan: {}, declarees: {} });
  ok(r6.errors.length === 1 && /PRÉALABLE/.test(r6.errors[0]),
    'aucun plan lu doit ÉCHOUER, jamais verdir à vide (obtenu '
    + JSON.stringify(r6.errors) + ')');

  var r7 = evaluer({ parMarque: { ZZMARQUEA: 7 }, marquesAvecPlan: { ZZMARQUEA: 1 }, declarees: {} });
  ok(r7.errors.length === 0 && r7.avis.length === 0,
    'CONTRE-ÉPREUVE : une marque vendue AVEC son plan ne produit ni erreur ni avis — '
    + 'sinon la porte crie pour rien (obtenu ' + JSON.stringify(r7) + ')');

  return errs;
}

module.exports = async function checkMarquesSuivies() {
  var errors = temoins();

  var plans, catalog;
  try { plans = require(path.join(RACINE, 'api/_lib/traqueur-plans.js')); } catch (e) {
    errors.push('[check-marques-suivies] ⛔ les plans du traqueur refusent de se '
      + 'charger (' + e.message + ') : porte morte, on ne conclut rien.');
    return errors;
  }
  try { catalog = require(path.join(RACINE, 'api/_lib/catalog.js')); } catch (e) {
    errors.push('[check-marques-suivies] ⛔ le catalogue refuse de se charger ('
      + e.message + ') : porte morte, on ne conclut rien.');
    return errors;
  }

  var fiches;
  try { fiches = await catalog.loadCatalog(); } catch (e) {
    errors.push('[check-marques-suivies] ⛔ le catalogue est illisible ('
      + e.message + ') : porte morte, on ne conclut rien.');
    return errors;
  }

  var parMarque = Object.create(null);
  (Array.isArray(fiches) ? fiches : []).forEach(function (p) {
    var b = String((p && p.brand) || '').toUpperCase().trim();
    if (!b) return;
    parMarque[b] = (parMarque[b] || 0) + 1;
  });

  var marquesAvecPlan = Object.create(null);
  Object.keys(plans.PLANS || {}).forEach(function (clef) {
    marquesAvecPlan[String(clef).split('@')[0].toUpperCase()] = 1;
  });

  /* ⛔ LA PRODUCTION N'INJECTE RIEN : l'état réel, tel qu'il est sur le disque. */
  var verdict = evaluer({ parMarque: parMarque, marquesAvecPlan: marquesAvecPlan,
    declarees: MARQUES_NON_SUIVIES_DECLAREES });
  verdict.avis.forEach(function (a) { console.log('[check-marques-suivies] ' + a); });
  verdict.errors.forEach(function (e) { errors.push(e); });

  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-marques-suivies OK');
  }, function (err) {
    console.error('  ❌ [check-marques-suivies] harnais mort : ' + err.message);
    process.exit(1);
  });
}
