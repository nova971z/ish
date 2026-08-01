/* check-fuites.js — QU'EST-CE QU'UN INCONNU PEUT LIRE DE NOUS ?
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE

   Demandée par l'user le 01/08/2026 : « cherche tout ce qui pourrait être
   compromettant pour nous ». Le balayage a trouvé, dans `app.js` — fichier
   servi à TOUS LES VISITEURS — l'adresse personnelle de l'user, écrite deux
   fois en dur :

       var LV_TEST_EMAILS   = ['<adresse personnelle>'];
       var LV_PIECES_BYPASS = ['<adresse personnelle>'];

   Deux dommages, et le second est le vrai :
     ① une adresse réelle, moissonnable par n'importe quel robot ;
     ② le code DÉSIGNAIT NOMMÉMENT le compte dispensé de pièces
        justificatives. Publier « cette adresse est exemptée », c'est publier
        la cible. Le serveur refusait quand même — mais on avait donné le nom.

   Corrigé : le serveur répond deux booléens pour le seul compte authentifié
   (`courier-status`), le front ne porte plus aucune liste.

   ─────────────────────────────────────────────────────────────────────────
   CE QUE CETTE PORTE VÉRIFIE — et sur QUOI

   Uniquement les fichiers RÉELLEMENT SERVIS. Un secret dans `api/` n'est pas
   une fuite : ce code ne quitte jamais le serveur. Confondre les deux fait
   crier au loup et finit par faire désactiver la porte.

   ⛔ ELLE NE PROUVE PAS QU'IL N'Y A PAS DE FUITE. Elle connaît les formes
   qu'on a déjà payées, plus quelques formes standard de secrets. Une fuite
   d'une forme inédite passera. C'est un plancher.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

/* Fichiers servis aux visiteurs. ⚠️ Cette liste est le PRÉALABLE de tout le
   contrôle : si elle se vide ou pointe à côté, la porte verdit sans rien
   avoir lu. Elle est donc vérifiée, pas supposée. */
var SERVIS = [
  'index.html', 'app.js', 'styles.css', 'sw.js',
  'firebase-init.js', 'mfa.js', 'qrcode.js', 'products.json'
];

/* Adresses e-mail LÉGITIMEMENT publiables : celles de l'entreprise, et les
   exemples de formulaire. Tout le reste est une personne réelle. */
var EMAILS_AUTORISES = /^(?:contact|bonjour|hello|support|noreply|no-reply)@pirates-tools\.com$/i;
var EMAILS_EXEMPLES = /(?:exemple|example|vous@|ton@|votre@|test@|artisan@email|prenom\.nom)/i;

var SECRETS = [
  ['clé secrète Stripe', /sk_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['secret de webhook', /whsec_[A-Za-z0-9]{16,}/],
  ['clé privée PEM', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
  ['compte de service Google', /"type"\s*:\s*"service_account"/],
  ['clé AWS', /AKIA[0-9A-Z]{16}/],
  ['jeton porteur en dur', /Bearer\s+[A-Za-z0-9._-]{24,}/],
  ['secret admin en dur', /ADMIN_SECRET\s*[:=]\s*['"][^'"]{6,}['"]/],
  ['secret de surveillance en dur', /WATCH_SECRET\s*[:=]\s*['"][^'"]{6,}['"]/]
];

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-fuites] ' + m); }

  var RACINE = path.join(__dirname, '..');
  var lus = 0;
  var contenus = {};
  SERVIS.forEach(function (f) {
    try { contenus[f] = fs.readFileSync(path.join(RACINE, f), 'utf8'); lus++; }
    catch (_) { /* fichier absent : signalé par le préalable */ }
  });

  /* ── PRÉALABLE ─────────────────────────────────────────────────────────
     « Non exécuté n'est PAS vert. » Si les fichiers servis ne sont pas là où
     on croit, ce contrôle n'a rien vérifié et doit le DIRE. */
  ok(lus >= 6,
    '⛔ PRÉALABLE : seulement ' + lus + ' des ' + SERVIS.length + ' fichiers servis ont pu '
    + 'être lus. Ce contrôle n\'a donc rien vérifié — il ne doit pas être compté comme vert.');
  if (lus < 6) return errors;

  /* ── F1. AUCUN SECRET DANS UN FICHIER SERVI ────────────────────────────
     ⚠️ Les clés PUBLIABLES (`pk_…`) ne sont pas ici : elles sont publiques par
     conception. Les y mettre ferait crier au loup à chaque livraison. */
  Object.keys(contenus).forEach(function (f) {
    SECRETS.forEach(function (s) {
      var m = contenus[f].match(s[1]);
      ok(!m, '⛔⛔ SECRET dans un fichier SERVI : ' + f + ' contient ' + s[0]
        + '. Ce fichier est téléchargé par tous les visiteurs — considère ce secret '
        + 'comme COMPROMIS et fais-le tourner avant toute autre chose.');
    });
  });

  /* ── F2. AUCUNE ADRESSE E-MAIL PERSONNELLE ─────────────────────────────
     La faute exacte du 01/08/2026. Le motif dit ce qu'on perd. */
  Object.keys(contenus).forEach(function (f) {
    var trouves = contenus[f].match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    var perso = trouves.filter(function (e) {
      return !EMAILS_AUTORISES.test(e) && !EMAILS_EXEMPLES.test(e);
    });
    perso = perso.filter(function (e, i) { return perso.indexOf(e) === i; });
    ok(perso.length === 0,
      '⛔⛔ ADRESSE PERSONNELLE dans un fichier SERVI : ' + f + ' → ' + perso.join(', ')
      + '. Ce fichier est lisible par n\'importe qui. Une adresse en dur se moissonne, '
      + 'et si elle sert à accorder un privilège, elle DÉSIGNE LA CIBLE à attaquer. '
      + 'Le verdict doit venir du serveur, pour le seul compte authentifié.');
  });

  /* ── F3. AUCUNE LISTE DE PRIVILÈGE CÔTÉ CLIENT ─────────────────────────
     Même sans adresse lisible, une liste d'exemption dans le front annonce
     qu'une exemption existe et où la chercher. Le front ne doit porter aucune
     liste de ce genre — le serveur tranche, le front affiche. */
  var app = contenus['app.js'] || '';
  [
    ['LV_PIECES_BYPASS', 'la dispense de pièces justificatives'],
    ['LV_TEST_EMAILS', 'les comptes de test'],
    ['PIECES_BYPASS_EMAILS', 'la dispense de pièces justificatives'],
    ['ADMIN_EMAILS', 'les droits d\'administration']
  ].forEach(function (c) {
    ok(app.indexOf(c[0] + ' =') === -1 && app.indexOf(c[0] + '=') === -1,
      '⛔⛔ LISTE DE PRIVILÈGE dans le front : `' + c[0] + '` (' + c[1] + ') est déclarée '
      + 'dans app.js. Même vide, elle annonce qu\'une exemption existe. Le serveur seul '
      + 'décide, et ne répond que pour le compte authentifié.');
  });

  /* ── F4. AUCUN NUMÉRO DE TÉLÉPHONE PERSONNEL ───────────────────────────
     ⚠️ Le critère de gabarit a été FAUX d'abord : `^0[67]0{8}$` attendait les
     zéros juste après l'indicatif, alors que le gabarit du site est
     `06 90 00 00 00` — soit `0690000000`, où les zéros commencent au 5ᵉ
     chiffre. La porte refusait donc un gabarit parfaitement légitime, et un
     refus à tort finit par faire désactiver la porte (E-208).
     Ce qui distingue réellement un gabarit d'un vrai numéro, c'est une longue
     suite de chiffres identiques : aucun numéro attribué n'en porte six. */
  Object.keys(contenus).forEach(function (f) {
    var tels = contenus[f].match(/\b0[67](?:[ .-]?[0-9]{2}){4}\b/g) || [];
    var reels = tels.filter(function (t) {
      var chiffres = t.replace(/[^0-9]/g, '');
      if (/(\d)\1{5,}/.test(chiffres)) return false;      // gabarit : 000000, 111111…
      if (/0123456789|1234567890|12345678/.test(chiffres)) return false;
      return true;
    });
    reels = reels.filter(function (t, i) { return reels.indexOf(t) === i; });
    ok(reels.length === 0,
      '⛔ NUMÉRO PERSONNEL dans un fichier SERVI : ' + f + ' → ' + reels.join(', ')
      + '. S\'il s\'agit d\'un gabarit, mets des zéros ; sinon, sors-le du fichier.');
  });

  /* ── F5. AUCUNE PORTE DÉROBÉE NI CONTOURNEMENT ─────────────────────────
     On ne cherche pas « du code méchant » — indécidable. On cherche les
     formes qui n'ont AUCUNE raison d'exister dans ce projet. */
  Object.keys(contenus).forEach(function (f) {
    if (f === 'qrcode.js') return;   // bibliothèque tierce, non écrite ici
    [
      ['exécution de chaîne décodée', /\b(?:eval|Function)\s*\(\s*(?:atob|unescape|decodeURI(?:Component)?)\s*\(/],
      ['contournement d\'authentification', /(?:bypass|skip|disable)[_ -]?(?:auth|login|verif|check)/i],
      ['porte dérobée', /backdoor|porte[_ -]?derob/i]
    ].forEach(function (m) {
      ok(!m[1].test(contenus[f]),
        '⛔⛔ FORME INTERDITE dans ' + f + ' : ' + m[0] + '. Rien dans ce projet n\'en a '
        + 'besoin. Si ce n\'est pas toi qui l\'as écrit, considère le dépôt comme compromis.');
    });
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-fuites OK');
}
