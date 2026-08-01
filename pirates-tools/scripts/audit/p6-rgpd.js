/* =========================================================================
   AUDIT P6 — DONNÉES PERSONNELLES (RGPD)
   =========================================================================
   POURQUOI CE CONTRÔLE EXISTE
   Le module livraison a ajouté, au fil des jours, sept catégories de données
   personnelles (adresse de chantier et GPS, photos, vidéos, conversations,
   dossier KYC, fiche publique, avis). Ni la politique de confidentialité ni le
   bouton « supprimer mon compte » n'avaient suivi. Le bouton PROMETTAIT
   l'effacement de « ton historique » et laissait en base le nom et la photo
   PUBLICS du livreur, les adresses de chantier, les conversations, les photos
   et les vidéos. Une dérive silencieuse : chaque fonctionnalité élargit la
   surface de données, aucune ne pense à l'effacement.

   CONTRÔLE 1 — EFFACEMENT COMPLET (bloquant)
     Toute collection portant une donnée liée à une personne doit être traitée
     par la route `account-erase` (supprimée ou anonymisée), ou figurer dans la
     liste JUSTIFIÉE des conservations légales.

   CONTRÔLE 2 — INFORMATION (bloquant, art. 13 RGPD)
     Toute catégorie de donnée réellement collectée doit être ANNONCÉE dans la
     politique de confidentialité. On ne peut pas collecter en silence.

   CONTRÔLE 3 — MINIMISATION DE L'EXPOSITION PUBLIQUE (bloquant)
     `couriers_public` est lisible par le monde entier : aucun champ d'identité
     ou de dossier ne doit pouvoir y entrer.

   CONTRÔLE 4 — PII DANS LES JOURNAUX
     Aucun email, aucune adresse en clair dans les `console.log` serveur.

   Lancement : node scripts/audit/p6-rgpd.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };
const problems = [];

const CONTACT = read('api/contact.js');
const HTML = read('index.html');
const CONFID = HTML.slice(HTML.indexOf('id="view-confidentialite"'),
  HTML.indexOf('id="view-cgv"') > 0 ? HTML.indexOf('id="view-cgv"') : undefined);
const ERASE_START = CONTACT.indexOf("if (body.type === 'account-erase') {");
if (ERASE_START === -1) throw new Error('gestionnaire account-erase introuvable');
const ERASE = CONTACT.slice(ERASE_START, CONTACT.indexOf('// ══ DEMANDE DE LIVRAISON', ERASE_START));

// ═══ CONTRÔLE 1 — effacement ══════════════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P6.1 — DROIT À L\'EFFACEMENT : toute donnée personnelle est-elle traitée ?');
LOG('━'.repeat(74));

// Inventaire déclaré : chaque collection porteuse de données personnelles,
// et le sort qui lui est réservé. `legal` = conservation imposée par la loi.
const INVENTAIRE = [
  { coll: 'users',                quoi: 'profil client (nom, email, téléphone, adresse)', sort: 'supprimé' },
  { coll: 'orders',               quoi: 'commandes du client',                            sort: 'supprimé' },
  { coll: 'couriers_public',      quoi: 'fiche PUBLIQUE (nom, photo, commune, avis)',     sort: 'supprimé' },
  { coll: 'couriers',             quoi: 'dossier livreur (email, coordonnées bancaires)',        sort: 'supprimé' },
  { coll: 'courier_applications', quoi: 'pièces justificatives (identité, SIRET…)',       sort: 'supprimé' },
  { coll: 'courses',              quoi: 'adresse de chantier, GPS, emails, code',         sort: 'supprimé/anonymisé' },
  { coll: 'messages',             quoi: 'conversations client ↔ livreur',                 sort: 'supprimé' },
  { coll: 'photos',               quoi: 'photos de chantier et de remise',                sort: 'supprimé' },
  { coll: 'videos',               quoi: 'vidéos de remise (Storage)',                     sort: 'supprimé' },
  { coll: 'payments',             quoi: 'justificatifs de paiement',                      sort: 'conservé', legal: 'obligation comptable (10 ans)' }
];

INVENTAIRE.forEach((e) => {
  if (e.legal) { LOG('  ⚖️  ' + e.coll.padEnd(22) + e.quoi.padEnd(46) + 'CONSERVÉ — ' + e.legal); return; }
  const traite = new RegExp("'" + e.coll + "'").test(ERASE)
    || new RegExp('\\b' + e.coll + '\\b').test(ERASE);
  LOG('  ' + (traite ? '✅' : '❌') + ' ' + e.coll.padEnd(22) + e.quoi.padEnd(46) + e.sort);
  if (!traite) {
    problems.push('EFFACEMENT INCOMPLET : « ' + e.coll + ' » (' + e.quoi
      + ') n\'est pas traité par account-erase — la donnée survit à la suppression du compte.');
  }
});

// L'effacement doit s'ARRÊTER si un litige est ouvert (art. 17.3.e).
const litige = /litige[\s\S]{0,200}?17\.3\.e|17\.3\.e/.test(ERASE) || /litige/.test(ERASE);
LOG('  ' + (litige ? '✅' : '❌') + ' litige ouvert → effacement suspendu (art. 17.3.e RGPD)');
if (!litige) problems.push('account-erase ne suspend pas l\'effacement en cas de litige ouvert (art. 17.3.e)');

// ═══ CONTRÔLE 2 — information (art. 13) ═══════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P6.2 — INFORMATION : chaque donnée collectée est-elle annoncée ?');
LOG('━'.repeat(74));

// Catégorie → (preuve qu'elle est COLLECTÉE dans le code, mot attendu dans la politique)
const ANNONCES = [
  { cat: 'adresse de chantier + GPS', code: /courseLat|input\.lat/, mots: ['chantier', 'GPS'] },
  { cat: 'photo du chantier',         code: /course-scene/,          mots: ['photo'] },
  { cat: 'photos de preuve',          code: /photos\/remise|'remise'/, mots: ['colis'] },
  { cat: 'vidéos de remise',          code: /course-video/,           mots: ['vidéo'] },
  { cat: 'conversations',             code: /collection\('messages'\)|\.collection\('messages'\)|'messages'/, mots: ['message', 'discussion'] },
  { cat: 'fiche livreur publique',    code: /couriers_public/,        mots: ['livreur'] },
  { cat: 'dossier livreur (KYC)',     code: /courier_applications|kycStatus/, mots: ['identité', 'assurance'] },
  { cat: 'avis publiés',              code: /course-rate/,            mots: ['avis'] }
];
ANNONCES.forEach((a) => {
  const collecte = a.code.test(CONTACT) || a.code.test(read('api/_lib/courses.js'))
    || a.code.test(read('api/create-payment-intent.js'));
  if (!collecte) { LOG('  ·  ' + a.cat.padEnd(30) + 'non collectée — rien à annoncer'); return; }
  const annonce = a.mots.some((m) => new RegExp(m, 'i').test(CONFID));
  LOG('  ' + (annonce ? '✅' : '❌') + ' ' + a.cat.padEnd(30) + (annonce ? 'annoncée' : 'COLLECTÉE MAIS NON ANNONCÉE'));
  if (!annonce) {
    problems.push('ART. 13 RGPD : « ' + a.cat + ' » est collectée par le code mais n\'apparaît '
      + 'nulle part dans la politique de confidentialité.');
  }
});

// ═══ CONTRÔLE 3 — exposition publique ═════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P6.3 — MINIMISATION : la fiche PUBLIQUE ne doit porter aucune identité');
LOG('━'.repeat(74));
const saveBloc = CONTACT.slice(CONTACT.indexOf("body.type === 'courier-profile-save'"),
  CONTACT.indexOf("body.type === 'courier-available'"));
const INTERDITS = ['email', 'kyc', 'siret', 'iban', 'compteFournisseurId', 'phone', 'birth', 'piece'];
const fuites = INTERDITS.filter((f) => new RegExp('\\b' + f + '\\b', 'i').test(
  saveBloc.slice(saveBloc.indexOf('const pub ='), saveBloc.indexOf('mirrorCourierPublic'))));
LOG('  champs interdits recherchés : ' + INTERDITS.join(', '));
if (fuites.length) {
  problems.push('la fiche PUBLIQUE couriers_public peut recevoir des champs d\'identité : ' + fuites.join(', '));
  LOG('  ❌ FUITE POSSIBLE : ' + fuites.join(', '));
} else LOG('  ✅ Aucun champ d\'identité ne peut entrer dans la fiche publique.');

// Les avis publiés ne doivent porter ni nom ni email de leur auteur.
const rateBloc = CONTACT.slice(CONTACT.indexOf("body.type === 'course-rate'"));
const avisNu = /avis\.push\(\{ r: rating, c: comment, d:/.test(rateBloc);
LOG('  ' + (avisNu ? '✅' : '❌') + ' avis publiés : note + commentaire + date, sans identité de l\'auteur');
if (!avisNu) problems.push('les avis publiés pourraient porter l\'identité de leur auteur');

// ═══ CONTRÔLE 4 — PII dans les journaux ═══════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P6.4 — AUCUNE DONNÉE PERSONNELLE DANS LES JOURNAUX SERVEUR');
LOG('━'.repeat(74));
const apiFiles = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => /\.js$/.test(f)).map((f) => 'api/' + f)
  .concat(fs.readdirSync(path.join(ROOT, 'api/_lib')).filter((f) => /\.js$/.test(f)).map((f) => 'api/_lib/' + f));
let logs = 0;
const fuitesLog = [];
apiFiles.forEach((f) => {
  const src = read(f);
  [...src.matchAll(/console\.(log|warn|error)\(([^\n]*)\)/g)].forEach((m) => {
    logs++;
    const sansLitteraux = m[2].replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
    if (/\b(email|artisanEmail|courierEmail|receipt_email|address|adresse|displayName|phone)\b/.test(sansLitteraux)) {
      const line = src.slice(0, m.index).split('\n').length;
      fuitesLog.push(f + ':' + line + ' → variable journalisée : ' + sansLitteraux.trim().slice(0, 60));
    }
  });
});
LOG('  appels de journalisation inspectés : ' + logs);
if (fuitesLog.length) {
  fuitesLog.forEach((x) => problems.push('donnée personnelle journalisée — ' + x));
  LOG('  ❌ ' + fuitesLog.join('\n     '));
} else LOG('  ✅ Aucun email ni adresse en clair dans les journaux.');

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P6 : conformité RGPD constatée.' : '  ❌ P6 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P6 RGPD] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
