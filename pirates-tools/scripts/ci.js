/* =========================================================
   Pirates Tools — CI runner
   - Agrège: audit/p1-static (intégrité statique AST), audit/p2-xss (injection HTML), audit/p3-* (securite serveur + aiguillage reel), audit/p4-firestore (regles + index), audit/p5-money (machine a etats + taux), audit/p6-rgpd (effacement + information), audit/p7-architecture (etat, fuites, cliquet), audit/p8-perf (budget de poids + SW), audit/p9-a11y (contraste + nom accessible), check-required-ids, check-paths, check-products-json
   - + Optionnel: lint-products.js (si présent) sur products.json
   - Robuste: safe require, rapports clairs, exitCode propre
========================================================= */
/* eslint-disable no-var */
'use strict';

var fs   = require('fs');
var path = require('path');
var cp   = require('child_process');

/* ⛔ UNE PORTE QUI REFUSE DE SE CHARGER FAIT ÉCHOUER LA CI — on ne l'ignore plus.
   ─────────────────────────────────────────────────────────────────────────
   Corrigé le 01/08/2026, après l'avoir PROUVÉ par sabotage : une syntaxe
   cassée dans `check-ancres.js`, et la CI annonçait « ✅ tous les contrôles
   sont passés ». Le fichier était là, la porte ne s'exécutait pas, et rien ne
   le disait au-delà d'un `ℹ️` noyé dans la sortie.

   Ce n'est pas une hypothèse : c'est déjà arrivé sur `check-paiement.js`,
   c'est-à-dire sur le chemin de l'argent. Le projet a une maxime pour ça —
   « non exécuté n'est PAS vert » — mais elle n'était écrite que pour les
   harnais. La CI, elle, continuait d'avaler ses propres portes en silence.

   On distingue donc DEUX situations que l'ancien code confondait :
     · le fichier N'EXISTE PAS → contrôle optionnel, on le signale, on passe ;
     · le fichier EXISTE mais refuse de se charger → PORTE MORTE. Elle est
       censée protéger quelque chose et ne protège plus rien. Échec net.

   ⚠️ La différence se mesure sur le DISQUE, jamais sur le message d'erreur :
   un `MODULE_NOT_FOUND` peut très bien venir d'un `require` interne au
   module, et se faire passer pour un fichier absent. */
var portesMortes = [];

function safeRequire(p, label){
  var base = path.join(__dirname, String(p).replace(/^\.\//, ''));
  var present = fs.existsSync(base) || fs.existsSync(base + '.js')
    || fs.existsSync(path.join(base, 'index.js'));
  try { return require(p); }
  catch(e){
    if (present) {
      portesMortes.push((label || p) + ' — ' + String((e && e.message) || e).split('\n')[0]);
      console.error('⛔ PORTE MORTE :', label || p, '— le fichier existe et ne se charge PAS.');
      return null;
    }
    console.warn('ℹ️  Contrôle optionnel absent (fichier introuvable) :', label || p);
    return null;
  }
}
function asArray(x){
  if (!x) return [];
  if (Array.isArray(x)) return x;
  return [String(x)];
}

var reqIds      = safeRequire('./check-required-ids', 'check-required-ids');
var p1Static    = safeRequire('./audit/p1-static', 'audit/p1-static');
var p2Xss       = safeRequire('./audit/p2-xss', 'audit/p2-xss');
var p3Endpoints = safeRequire('./audit/p3-endpoints', 'audit/p3-endpoints');
var p3Dispatch  = safeRequire('./audit/p3-dispatch-live', 'audit/p3-dispatch-live');
var p4Firestore = safeRequire('./audit/p4-firestore', 'audit/p4-firestore');
var p5Money     = safeRequire('./audit/p5-money', 'audit/p5-money');
var p6Rgpd      = safeRequire('./audit/p6-rgpd', 'audit/p6-rgpd');
var p7Archi     = safeRequire('./audit/p7-architecture', 'audit/p7-architecture');
var p8Perf      = safeRequire('./audit/p8-perf', 'audit/p8-perf');
var p9A11y      = safeRequire('./audit/p9-a11y', 'audit/p9-a11y');
var reqPaths    = safeRequire('./check-paths',       'check-paths');
var reqProducts = safeRequire('./check-products-json','check-products-json');
var reqPricing  = safeRequire('./check-pricing',     'check-pricing');
var reqPriceModel = safeRequire('./check-pricing-model','check-pricing-model');
var reqAccount = safeRequire('./check-accounting','check-accounting');
var reqInvoice = safeRequire('./check-invoice','check-invoice');
var reqLoyalty  = safeRequire('./check-loyalty',     'check-loyalty');
var reqHoraires = safeRequire('./check-horaires',    'check-horaires');
var reqCoffret  = safeRequire('./check-coffret',     'check-coffret');
// La regle coffret de l'user (poids + format) et son MIROIR client/serveur :
// une divergence d'un centime entre prix affiche et prix debite est J4.
var reqCofPoids = safeRequire('./check-coffret-poids','check-coffret-poids');
// Les alertes du module courses S'EXECUTENT (trois ReferenceError morts le 08/08).
var reqCoursesAl= safeRequire('./check-courses-alertes','check-courses-alertes');
// Chacun voit SES courses (filtre dans la requete) + raz-compta vivante (POST).
var reqCoursesP1= safeRequire('./check-courses-p1','check-courses-p1');
// Le rendu serveur des pages publiques (SEO ordre 1) : 200 produit, vrai 404,
// canonical sans #, noindex progressif (D-019).
var reqRender   = safeRequire('./check-render','check-render');
// Le sitemap ne declare que des URLs indexables (SEO ordre 3). La porte
// rejoue le generateur en mode --verifie : le sitemap sur le disque doit
// declarer EXACTEMENT les URLs indexables mesurees (ni fiche noindex de trop,
// ni eligible oubliee). Fichier present mais casse -> porte morte (safeRequire).
var reqSitemap  = safeRequire('./generer-sitemap','generer-sitemap');
function reqSitemapPorte(){
  if (!reqSitemap) return [];   // absent : optionnel (meme regle que safeRequire)
  try {
    cp.execFileSync(process.execPath, [path.join(__dirname,'generer-sitemap.js'),'--verifie'],
      { stdio:['ignore','ignore','pipe'] });
    return [];
  } catch(e){
    var m = (e.stderr ? e.stderr.toString() : '') || (e.message||'');
    return ['[generer-sitemap] ' + m.split('\n').filter(Boolean).join(' · ')];
  }
}
var reqCatPub   = safeRequire('./check-catalog-public','check-catalog-public');
var reqAssetVer = safeRequire('./check-asset-versions','check-asset-versions');
var reqWhClaim  = safeRequire('./check-webhook-claim','check-webhook-claim');
var reqPwMin    = safeRequire('./check-price-watch','check-price-watch');
// Le depart entre la PHOTO du produit et la CAPTURE de fiche technique. Se
// tromper pose une capture de texte comme visuel de vente sur la carte.
var reqImpDos   = safeRequire('./check-importer-dossiers','check-importer-dossiers');
var reqCsp      = safeRequire('./check-csp',         'check-csp');
var reqAnalytics= safeRequire('./check-analytics',   'check-analytics');
var reqFns      = safeRequire('./check-functions',   'check-functions');
var reqFsQ      = safeRequire('./check-firestore-queries','check-firestore-queries');
var reqPartApp  = safeRequire('./check-partner-application','check-partner-application');
var reqHarnais  = safeRequire('./check-harnais',      'check-harnais');
// Portes de la MÉMOIRE (29/07/2026) : CLAUDE.md avait atteint 1557 lignes parce
// que rien n'empêchait d'y écrire. Une mémoire ne tient pas par discipline,
// elle tient par des portes.
var reqMemoire  = safeRequire('./check-memoire',     'check-memoire');
var reqOu       = safeRequire('./check-ou',          'check-ou');
// Une panne doit produire une PORTE, pas un souvenir (boucle d'apprentissage).
var reqLecons   = safeRequire('./check-lecons',      'check-lecons');
// Le registre des erreurs est injecté à CHAQUE message : s'il se déforme ou
// s'il enfle, il finit ignoré — et un registre ignoré ne trace plus rien.
var reqErreurs  = safeRequire('./erreurs',           'check-erreurs');
// La porte juridique : on vérifie qu'elle a des dents. Un motif qui ne vise
// plus aucun fichier ne refuse plus rien ET ne le dit pas.
var modJur      = safeRequire('./juridique',         'check-juridique');
var reqJur      = modJur && modJur.controle ? modJur.controle : null;
// La porte d'O1 (hook Stop). Elle doit refuser le faux ET laisser passer le
// vrai : une porte hystérique finit désactivée, donc ne protège plus rien.
var reqSortie   = safeRequire('./garde-sortie',      'check-sortie');
// On n'écrit pas sur un fichier dont l'état a changé depuis qu'on l'a lu.
var modFrais    = safeRequire('./garde-fraicheur',   'check-fraicheur');
var reqFrais    = modFrais && modFrais.controle ? modFrais.controle : null;
// La sonde d'oublis : une table écrite à la main, confrontée au code réel.
var reqCouv     = safeRequire('./couverture',        'check-couverture');
// Le filet qui mord sur les MOTS DE LA DEMANDE, pas sur l'aiguillage.
var reqInterd   = safeRequire('./interdits',         'check-interdits');
// La porte du traqueur : elle doit ouvrir price-watch, et RIEN d'autre.
// Le 31/07 elle s'est refermee en silence et les prix ont cesse d'etre releves.
var reqWatchAu  = safeRequire('./check-watch-auth',  'check-watch-auth');
// Le prix AFFICHE doit etre celui qui sera DEBITE. Le serveur calcule depuis
// price_ht ; `price` n'est qu'un affichage. 27 fiches divergeaient le 31/07.
var reqPrixAff  = safeRequire('./check-prix-affiches','check-prix-affiches');
// products.json est SERVI PUBLIQUEMENT : le prix d'achat fournisseur ne doit
// jamais s'y trouver. 3 fiches l'exposaient le 31/07 — irreversible une fois
// sur le CDN et dans l'historique git.
var reqPrixFui  = safeRequire('./check-prix-fuite',  'check-prix-fuite');
// La couture paiement : deux fournisseurs, un seul contrat. Le defaut doit
// toujours designer celui qui ENCAISSE, et aucun etat inconnu ne doit pouvoir
// passer pour « paye » — c'est le seul defaut ici qui couterait de la marchandise.
var reqPaiement = safeRequire('./check-paiement',    'check-paiement');
/* ⛔ PORTE DEMANDÉE PAR L'USER le 01/08/2026 : le tunnel de paiement a été livré
   six fois de suite avec un manque, et c'est LUI qui les a trouvés à chaque fois.
   Elle vérifie la PRÉSENCE de ce qu'un tunnel doit contenir — pas l'esthétique. */
var reqTunnel = safeRequire('./check-tunnel-paiement', 'check-tunnel-paiement');
/* ⛔ LA MÊME PORTE, ÉTENDUE À TOUT L'ÉCRAN — demandée le 01/08/2026 : « à chaque
   fois qu'on va créer quelque chose sur le site, on se réfère à ce qui existe
   déjà sur les plus grandes institutions et notre CSS doit être en accord ».
   Dès sa pose elle a trouvé deux boutons étirés DÉJÀ présents dans le dépôt. */
var reqEcrans = safeRequire('./check-ecrans', 'check-ecrans');
/* ⛔ PORTE DE FUITE — demandée le 01/08/2026 (« cherche tout ce qui pourrait
   être compromettant pour nous »). Elle a trouvé, dès sa pose, l'adresse
   personnelle de l'user écrite DEUX FOIS dans app.js — et cette adresse
   désignait le compte dispensé de pièces justificatives. */
var reqFuites = safeRequire('./check-fuites', 'check-fuites');
// Ancres des harnais : un harnais qui vise un identifiant mort meurt sur un
// délai, sans rendre d'assertion — ou accuse le produit à tort (01/08/2026).
var reqAncres = safeRequire('./check-ancres', 'check-ancres');
// Registre des demandes : on ne livre pas tant qu'une ligne est OUVERTE.
// Angle mort de tout le dispositif jusqu'au 01/08/2026 — aucune autre porte
// ne sait ce qui a été DEMANDÉ, elles ne vérifient que la cohérence du code.
var reqDemandes = safeRequire('./check-demandes', 'check-demandes');
// Le traqueur est un AUTOMATISME : s'il ne couvre pas une marque, ou s'il
// tourne en simulation, il répond ok:true et ne relève rien. 541 prix ont
// vécu sur une supposition à cause de ça (01/08/2026).
var reqTraqueur = safeRequire('./check-traqueur', 'check-traqueur');
// « Est-ce que c'est deploye ? » : la question a coute deux releves a l'user,
// qui a teste un parseur deja corrige (E-404). /api/health rend desormais le
// commit que Vercel fait tourner — et comme ce point d'entree est PUBLIC,
// cette porte prouve AUSSI qu'aucune valeur d'environnement n'en sort, pas
// meme dix signes du compte de service par un message d'erreur de JSON.parse.
var reqDeploi   = safeRequire('./check-deploiement', 'check-deploiement');
// Le balayage des 67 pages : 67 adresses fabriquees par le serveur, plus une
// seule tapee a la main. Si le plan est faux, ce sont 67 pages qui partent a
// cote — et des couts d'achat qui ne descendent pas.
var reqPlanTrq  = safeRequire('./check-plan-traqueur', 'check-plan-traqueur');
var reqVisuels  = safeRequire('./check-visuels', 'check-visuels');
var reqEssai    = safeRequire('./check-mode-essai', 'check-mode-essai');
var reqClasser  = safeRequire('./check-classer-idealo', 'check-classer-idealo');
var reqPrixConf = safeRequire('./check-prix-confirmes', 'check-prix-confirmes');
var reqVarCof   = safeRequire('./check-variantes-coffret', 'check-variantes-coffret');
// Le module Revolut est ecrit AVANT d'avoir pu appeler le reseau : tout ce qui
// est PUR (signature contre le vecteur officiel, commission d'un ordre
// reessaye, table des etats) s'eprouve ici, sinon la 1re verification aurait
// lieu sur un vrai paiement — c'est-a-dire trop tard.
var reqRevolut  = safeRequire('./check-revolut',     'check-revolut');
// Le filet SOUS le webhook : un paiement encaisse dont la notification n'arrive
// jamais est le pire mode de panne du site — silencieux et couteux. La
// reconciliation le rattrape ; ce controle verifie qu'elle ne laisse rien
// passer ET qu'elle n'invente rien (un doublon coute aussi cher qu'un oubli).
var reqReconc   = safeRequire('./check-reconciliation', 'check-reconciliation');

// NOTE 25/07/2026 : l'étape lint-products.js (fichier jamais versionné,
// silencieusement sautée à chaque run) est SUPPRIMÉE — ses invariants réels
// vivent désormais dans check-products-json.js (schéma 2026).

(async function run(){
  var started = Date.now();
  var errors = [];

  async function runOne(fn, label){
    if (!fn) return;
    try {
      var out = await fn();                 // chaque check retourne [] d’erreurs
      errors = errors.concat(asArray(out)); // concatène
    } catch(e){
      errors.push('['+label+'] ' + (e && e.message ? e.message : e));
    }
  }

  await runOne(reqIds,      'check-required-ids');
  await runOne(p1Static,    'audit/p1-static');
  await runOne(p2Xss,       'audit/p2-xss');
  await runOne(p3Endpoints, 'audit/p3-endpoints');
  await runOne(p3Dispatch,  'audit/p3-dispatch-live');
  await runOne(p4Firestore, 'audit/p4-firestore');
  await runOne(p5Money,     'audit/p5-money');
  await runOne(p6Rgpd,      'audit/p6-rgpd');
  await runOne(p7Archi,     'audit/p7-architecture');
  await runOne(p8Perf,      'audit/p8-perf');
  await runOne(p9A11y,      'audit/p9-a11y');
  await runOne(reqPaths,    'check-paths');
  await runOne(reqProducts, 'check-products-json');
  await runOne(reqPricing,  'check-pricing');
  await runOne(reqPriceModel,'check-pricing-model');
  await runOne(reqAccount, 'check-accounting');
  await runOne(reqInvoice, 'check-invoice');
  await runOne(reqLoyalty,  'check-loyalty');
  await runOne(reqHoraires, 'check-horaires');
  await runOne(reqCoffret,  'check-coffret');
  await runOne(reqCofPoids, 'check-coffret-poids');
  await runOne(reqCoursesAl,'check-courses-alertes');
  await runOne(reqCoursesP1,'check-courses-p1');
  await runOne(reqRender,   'check-render');
  await runOne(reqSitemapPorte, 'generer-sitemap');
  await runOne(reqCatPub,   'check-catalog-public');
  await runOne(reqAssetVer, 'check-asset-versions');
  await runOne(reqWhClaim,  'check-webhook-claim');
  await runOne(reqPwMin,    'check-price-watch');
  await runOne(reqImpDos,   'check-importer-dossiers');
  await runOne(reqCsp,      'check-csp');
  await runOne(reqAnalytics,'check-analytics');
  await runOne(reqFns,      'check-functions');
  await runOne(reqFsQ,      'check-firestore-queries');
  await runOne(reqPartApp,  'check-partner-application');
  await runOne(reqHarnais,  'check-harnais');
  await runOne(reqMemoire,  'check-memoire');
  await runOne(reqOu,       'check-ou');
  await runOne(reqLecons,   'check-lecons');
  await runOne(reqErreurs,  'check-erreurs');
  await runOne(reqJur,      'check-juridique');
  await runOne(reqSortie,   'check-sortie');
  await runOne(reqFrais,    'check-fraicheur');
  await runOne(reqCouv,     'check-couverture');
  await runOne(reqInterd,   'check-interdits');
  await runOne(reqWatchAu,  'check-watch-auth');
  await runOne(reqPrixAff,  'check-prix-affiches');
  await runOne(reqPrixFui,  'check-prix-fuite');
  await runOne(reqPaiement, 'check-paiement');
  await runOne(reqTunnel,   'check-tunnel-paiement');
  await runOne(reqEcrans,   'check-ecrans');
  await runOne(reqFuites,   'check-fuites');
  await runOne(reqAncres,   'check-ancres');
  await runOne(reqDemandes, 'check-demandes');
  await runOne(reqTraqueur, 'check-traqueur');
  await runOne(reqDeploi,   'check-deploiement');
  await runOne(reqVisuels,  'check-visuels');
  await runOne(reqEssai,    'check-mode-essai');
  await runOne(reqClasser,  'check-classer-idealo');
  await runOne(reqPrixConf, 'check-prix-confirmes');
  await runOne(reqVarCof,   'check-variantes-coffret');
  await runOne(reqPlanTrq,  'check-plan-traqueur');
  await runOne(reqRevolut,  'check-revolut');
  await runOne(reqReconc,   'check-reconciliation');

  var dur = Math.max(1, Date.now() - started);

  /* Une porte présente mais illisible n'est pas un détail de confort : c'est
     une protection qu'on croit avoir. On la remonte AVANT tout le reste. */
  if (portesMortes.length){
    console.error('\n⛔ ' + portesMortes.length + ' PORTE(S) MORTE(S) — présentes sur le disque, incapables de se charger :');
    portesMortes.forEach(function(x, i){ console.error('   ' + (i+1) + '. ' + x); });
    console.error('   Ces contrôles n\'ont RIEN vérifié. Non exécuté n\'est pas vert.');
    process.exit(1);
  }

  if (errors.length){
    console.error('\n❌ CI FAILED — problèmes détectés ('+errors.length+'):\n');
    errors.forEach(function(e, i){ console.error((i+1)+'. '+e); });
    console.error('\nRésumé: '+errors.length+' erreur(s) • durée: '+dur+'ms');
    process.exit(1);
  } else {
    console.log('\n✅ CI OK — tous les contrôles sont passés. ('+dur+'ms)');
  }
})();
