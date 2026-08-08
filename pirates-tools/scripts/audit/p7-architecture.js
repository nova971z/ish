/* =========================================================================
   AUDIT P7 — ARCHITECTURE ET QUALITÉ
   =========================================================================
   Trois maladies chroniques d'un fichier de 13 000 lignes, et le contrôle qui
   les empêche d'empirer.

   CONTRÔLE 1 — ÉTAT GLOBAL LIÉ À L'IDENTITÉ (bloquant)
     app.js porte 182 variables de niveau module. Celles qui contiennent les
     données d'UNE personne doivent tomber au changement de compte. Deux
     défauts de cette famille ont déjà été trouvés : le rôle livreur mis en
     cache à vie (P3) et la fiche artisan qui survivait à la déconnexion (P7).
     Le contrôle exige que chaque variable « d'identité » soit soit RÉINITIALISÉE
     dans onAuthStateChanged, soit CLASSÉE explicitement comme non personnelle.

   CONTRÔLE 2 — FUITES
     Tout ce qui s'abonne doit se désabonner : setInterval, observateurs,
     abonnements Firestore temps réel.

   CONTRÔLE 3 — CLIQUET DES FONCTIONS DÉMESURÉES
     17 fonctions dépassent 150 lignes. Le projet a DÉLIBÉRÉMENT reporté leur
     découpe (étape 10d : « refactor cosmétique risqué, pas de valeur
     fonctionnelle »). On ne revient pas sur cette décision — mais on gèle
     l'existant : aucune ne peut grossir, aucune nouvelle ne peut apparaître.

   CONTRÔLE 4 — DUPLICATION DE BALISAGE
     Un même bloc HTML écrit à N endroits dérive toujours. C'est arrivé : la
     carte produit existait en 4 exemplaires, et 2 avaient perdu la mention
     « TTC » du prix.

   Lancement : node scripts/audit/p7-architecture.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const esprima = require('esprima');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const AST = esprima.parseScript(APP, { loc: true });
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };
const problems = [];

function walk(n, visit) {
  if (!n || typeof n.type !== 'string') return;
  visit(n);
  for (const k of Object.keys(n)) {
    if (k === 'loc' || k === 'range') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}

// ═══ CONTRÔLE 1 — état lié à l'identité ═══════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P7.1 — ÉTAT GLOBAL : ce qui appartient à UNE personne doit tomber');
LOG('━'.repeat(74));

const iife = AST.body[0] && AST.body[0].expression && AST.body[0].expression.callee
  ? AST.body[0].expression.callee.body.body : [];
const moduleVars = [];
iife.forEach((n) => {
  if (n.type !== 'VariableDeclaration') return;
  n.declarations.forEach((d) => { if (d.id.type === 'Identifier') moduleVars.push(d.id.name); });
});

let resetBloc = APP.slice(APP.indexOf('if (changed) {'), APP.indexOf('if (user) {'));

// Une remise à zéro peut être DÉLÉGUÉE à une fonction dédiée (lvResetRole()…).
// On ne la croit pas sur parole : on va chercher son CORPS et on l'ajoute au
// bloc analysé. Si la fonction n'existe pas ou ne remet rien à zéro, les
// variables concernées ressortiront comme nues, exactement comme avant.
(resetBloc.match(/\b([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;/g) || []).forEach((appel) => {
  const nom = appel.replace(/\s*\(\s*\)\s*;/, '').trim();
  const i = APP.indexOf('function ' + nom + '(');
  if (i < 0) return;
  let d = 0;
  const j = APP.indexOf('{', i);
  for (let k = j; k < APP.length; k++) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (!d) { resetBloc += '\n' + APP.slice(i, k + 1); break; } }
  }
});

// Variables dont le nom évoque l'identité mais qui NE portent PAS de données
// personnelles — classées ici, avec leur raison, une par une.
const NON_PERSONNEL = {
  _currentTerritory: 'préférence d\'affichage (territoire fiscal), pas une identité',
  _partnersPromise:  'cache de l\'annuaire PUBLIC des artisans',
  _couriersPromise:  'cache de l\'annuaire PUBLIC des livreurs',
  // Filets « échec ≠ vide » : dernière liste RÉUSSIE des deux annuaires
  // PUBLICS. Aucune donnée de compte — ce sont les mêmes fiches que voit un
  // visiteur non connecté. Les resservir après un hoquet réseau évite que la
  // section disparaisse de l'accueil (défaut vécu le 28/07/2026).
  _couriersDernier:  'dernier succès de l\'annuaire PUBLIC des livreurs',
  _partnersDernier:  'dernier succès de l\'annuaire PUBLIC des artisans',
  _partnerJoinBound: 'drapeau de liaison unique du formulaire, sans donnée',
  _currentUser:      'l\'utilisateur lui-même — écrasé à chaque verdict d\'auth',
  _userProfile:      'remis à null dans la branche « pas d\'utilisateur »',
  _authReady:        'machinerie d\'authentification',
  _authInited:       'machinerie d\'authentification',
  _authUnsub:        'machinerie d\'authentification',
  _payTrapRelease:   'piège de focus de la modale, sans donnée',
  _payCloseTimer:    'minuterie de fermeture, sans donnée',
  _payAddressBound:  'drapeau de liaison unique, sans donnée',
  _payAddrDebounce:  'minuterie anti-rebond, sans donnée',
  _adminGlobe:       'contexte WebGL, libéré par destroyAdminGlobe au changement de route',
  _adminLogoBusy:    'drapeau d\'occupation, sans donnée',
  _adminPhotosBusy:  'drapeau d\'occupation, sans donnée',
  _adminProdQ:       'le texte tapé dans la recherche de produits — un critère de filtrage '
                     + 'du catalogue public, jamais une donnée de compte',
  _lvAdminFuel:      'paramètre public (prix du carburant), pas une identité',
  _lvChatUnsub:      'fonction de désabonnement — coupée dans le bloc de remise à zéro',
  _lvVueParams:      'quel écran de l\'espace livreur est affiché (travail ou paramètres) — '
                     + 'aucune donnée personnelle, et remis à false à chaque rendu de l\'espace'
};

const IDENT = /^_(?:current|user|auth|lv|pay|admin|partner|my|acc|loyal|courier)/i;
const candidates = moduleVars.filter((v) => IDENT.test(v));
let couverts = 0;
const nus = [];
candidates.forEach((v) => {
  if (NON_PERSONNEL[v]) { couverts++; return; }
  if (new RegExp('\\b' + v + '\\b').test(resetBloc)) { couverts++; return; }
  nus.push(v);
});
LOG('  variables de niveau module : ' + moduleVars.length
  + ' · candidates « identité » : ' + candidates.length
  + ' · traitées : ' + couverts);
if (nus.length) {
  nus.forEach((v) => problems.push('la variable d\'état « ' + v + ' » peut contenir les données '
    + 'd\'un utilisateur et n\'est NI réinitialisée au changement de compte, NI classée comme '
    + 'non personnelle — les données du compte précédent survivraient.'));
  LOG('  ❌ NI RÉINITIALISÉES NI CLASSÉES : ' + nus.join(', '));
} else LOG('  ✅ Chaque variable d\'identité est réinitialisée ou justifiée nommément.');

// ═══ CONTRÔLE 2 — fuites ══════════════════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P7.2 — FUITES : tout ce qui s\'abonne se désabonne-t-il ?');
LOG('━'.repeat(74));
const paires = [
  ['setInterval',           /setInterval\(/g,           /clearInterval\(/g],
  ['IntersectionObserver',  /new IntersectionObserver/g, /\.disconnect\(\)/g],
  ['abonnement Firestore',  /onSnapshot\(/g,             /_lvChatUnsub\(\)/g]
];
paires.forEach(([nom, ouvre, ferme]) => {
  const a = (APP.match(ouvre) || []).length;
  const b = (APP.match(ferme) || []).length;
  const ok = b >= a;
  LOG('  ' + (ok ? '✅' : '❌') + ' ' + nom.padEnd(24) + a + ' ouverture(s) · ' + b + ' fermeture(s)');
  if (!ok) problems.push(nom + ' : ' + a + ' ouverture(s) pour seulement ' + b + ' fermeture(s) — fuite probable');
});

// ═══ CONTRÔLE 3 — cliquet des fonctions démesurées ════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P7.3 — CLIQUET : les fonctions démesurées ne doivent plus grossir');
LOG('━'.repeat(74));
// Taille MAXIMALE tolérée, figée à l'audit du 27/07/2026. Baisser une valeur
// après une découpe est encouragé ; l'augmenter demande une décision explicite.
const PLAFONDS = {
  renderPDP: 416, initPdpScrollAnimations: 397, renderAdmin: 364,
  renderLivreur: 293, renderClientDeliveries: 293, renderCourierSpaceInner: 266,
  tick: 252, initAdminInstagram: 236, renderDynamic: 227, onRouteChange: 214,
  initDeliveryWidget: 211, showDetail: 195, bindEvents: 191, wireChat: 188,
  comptaRenderCalc: 172, confirmPayment: 171, setupPartnerJoinForm: 163
};
const SEUIL = 150;
const tailles = new Map();
walk(AST, (n) => {
  if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') && n.id && n.loc) {
    tailles.set(n.id.name, Math.max(tailles.get(n.id.name) || 0, n.loc.end.line - n.loc.start.line + 1));
  }
});
let depassements = 0;
[...tailles.entries()].filter(([, l]) => l > SEUIL).sort((a, b) => b[1] - a[1]).forEach(([nom, len]) => {
  const plafond = PLAFONDS[nom];
  if (plafond === undefined) {
    /* ⛔ PLAFOND RETIRÉ — décision de l'user, 01/08/2026 (« vire-moi tous ces
       plafonds »). On MESURE et on AFFICHE toujours : une fonction de 300
       lignes reste visible à chaque CI. C'est le REFUS qui disparaît. */
    LOG('  ⚠️ ' + String(len).padStart(4) + ' l.  ' + nom + '  ⟵ NOUVELLE (au-dessus de ' + SEUIL + ')');
  } else if (len > plafond) {
    LOG('  ⚠️ ' + String(len).padStart(4) + ' l.  ' + nom + '  ⟵ +' + (len - plafond) + ' (information)');
  } else {
    LOG('  ' + (len < plafond ? '🔽' : '✅') + ' ' + String(len).padStart(4) + ' l.  ' + nom
      + (len < plafond ? '  (−' + (plafond - len) + ', plafond ' + plafond + ')' : ''));
  }
});
if (!depassements) LOG('  ✅ Aucune croissance : la dette est gelée à ' + Object.keys(PLAFONDS).length + ' fonctions.');

// ═══ CONTRÔLE 4 — duplication de balisage ═════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P7.4 — BALISAGE DUPLIQUÉ (source unique par composant)');
LOG('━'.repeat(74));
// Marqueurs de composants qui NE doivent exister qu'à un seul endroit.
const UNIQUES = [
  ['carte produit',  'product-card__img-wrap'],
  ['carte livreur',  'courier-card__dispo'],
  ['carte artisan',  'partner-card__body']
];
UNIQUES.forEach(([nom, marqueur]) => {
  // Ne compter que les occurrences dans un attribut class="…" : une mention en
  // COMMENTAIRE n'est pas une implémentation (faux positif constaté à P8).
  const n = (APP.match(new RegExp('class="[^"]*' + marqueur, 'g')) || []).length;
  const ok = n <= 1;
  LOG('  ' + (ok ? '✅' : '❌') + ' ' + nom.padEnd(18) + n + ' occurrence(s) du balisage');
  if (!ok) problems.push('le balisage « ' + nom + ' » est écrit ' + n + ' fois (marqueur '
    + marqueur + ') : les copies dérivent toujours. Extraire une source unique.');
});

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P7 : architecture conforme.' : '  ❌ P7 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P7 architecture] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
