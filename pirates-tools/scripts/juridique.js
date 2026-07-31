/* juridique.js — LA PORTE QU'ON OUVRE AVANT DE TOUCHER À CE QUI ENGAGE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE
   Certains fichiers de ce dépôt n'exposent pas à un bogue : ils exposent à une
   infraction, à une requalification en salariat, à une sanction CNIL ou à un
   redressement. Un test vert n'y protège de rien.

   Lire une fiche AVANT d'éditer pose le témoin qui déverrouille l'édition
   (`garde-entonnoir.js --garde` le vérifie). Ce n'est pas une formalité :
   chaque fiche dit ce qu'on risque et OÙ le vérifier à la source.

     node scripts/juridique.js            le sommaire des cinq domaines
     node scripts/juridique.js J2         la fiche, et le témoin est posé
     node scripts/juridique.js --controle vérifie que la porte a bien des dents

   ⛔ Ce script n'est PAS une source de droit. Il désigne les sources
   officielles. Un numéro d'article cité de mémoire est une invention —
   exactement ce que le protocole §8 interdit.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

var FICHIER = path.join(__dirname, '..', 'docs', 'JURIDIQUE.md');

/* Quels fichiers relèvent de quel domaine. Sert au sommaire ET à la porte :
   les deux lisent la MÊME table, donc elles ne peuvent pas diverger. */
var DOMAINES = {
  J1: { titre: 'Information légale du site',
        motifs: [/pirates-tools\/index\.html$/] },
  J2: { titre: 'Statut des livreurs — requalification',
        motifs: [/pirates-tools\/api\/contact\.js$/, /pirates-tools\/api\/_lib\/courses\.js$/] },
  J3: { titre: 'Données personnelles — RGPD',
        motifs: [/pirates-tools\/(firestore|storage)\.rules$/,
                 /pirates-tools\/api\/(contact|newsletter|events|admin|cron-report|webhook|create-payment-intent)\.js$/,
                 /pirates-tools\/api\/_lib\/(analytics|courses|invoice|postal)\.js$/,
                 // Couture paiement : ces modules manipulent e-mail, nom et
                 // adresse du client pour les transmettre au fournisseur.
                 /pirates-tools\/api\/_lib\/paiement\/.+\.js$/] },
  J4: { titre: 'Prix et promotions',
        motifs: [/pirates-tools\/products\.json$/,
                 /pirates-tools\/api\/(contact|checkout|create-payment-intent|webhook|admin)\.js$/,
                 /pirates-tools\/api\/_lib\/(pricing|pricing-model|price-parse|courses)\.js$/,
                 // Couture paiement : c'est par là que passe le montant
                 // réellement débité — le prix opposable au client.
                 /pirates-tools\/api\/_lib\/paiement\/.+\.js$/] },
  J5: { titre: 'Fiscalité DOM — TVA et octroi de mer',
        motifs: [/pirates-tools\/api\/(checkout|create-payment-intent|webhook|admin|cron-report)\.js$/,
                 /pirates-tools\/api\/_lib\/(pricing|pricing-model|accounting|invoice)\.js$/] }
};

/* ═══ DÉTECTION DES ANGLES MORTS ══════════════════════════════════════════
   Une porte ne vaut que par sa couverture. La table ci-dessus est écrite à la
   main : elle peut oublier un fichier — c'est arrivé, huit fichiers couverts
   quand `newsletter.js` en collectait dix-sept signaux de données personnelles.
   Ces sondes relisent le code et EXIGENT qu'un fichier chargé juridiquement
   soit rattaché à un domaine, ou explicitement écarté ci-dessous. */
var SONDES = {
  J3: /\b(email|adresse|address|phone|telephone|consent|consentement)\b/gi,
  J4: /\b(amount|price|prix|remise|discount|promo)\b/gi,
  J5: /\b(tva|vat|octroi|taxe|hors ?taxe|ttc)\b/gi
};
var SEUIL = 5;

/* Écartés en connaissance de cause — chacun justifié, jamais « oublié ». */
var HORS_PORTEE = {
  'pirates-tools/api/health.js': 'sonde de disponibilité, aucune donnée',
  'pirates-tools/api/test-email.js': 'outil de diagnostic, jamais servi aux clients',
  'pirates-tools/api/instagram.js': 'relais de médias publics, aucune donnée personnelle',
  'pirates-tools/api/products.js': 'lecture du catalogue, les prix sont fixés ailleurs',
  /* auth.js ne décide d'aucun prix : il authentifie. Ses mentions de « prix »
     sont les commentaires qui expliquent pourquoi le traqueur a sa propre clé
     (31/07/2026). L'écarter NOMMÉMENT vaut mieux que le rattacher à J4 : un
     rappel qui se déclenche à tort finit ignoré, et emporte les vrais avec lui. */
  'pirates-tools/api/_lib/auth.js': 'authentification seule — aucune décision de prix ni de TVA'
};

/** Les domaines qu'un fichier engage. Vide = aucune obligation juridique. */
function domainesDe(fichier) {
  return Object.keys(DOMAINES).filter(function (k) {
    return DOMAINES[k].motifs.some(function (re) { return re.test(fichier); });
  });
}

function temoinJuridique(sid, dom) {
  var s = String(sid || 'sans-session').replace(/[^\w-]/g, '');
  return path.join(os.tmpdir(), 'pt-juridique-' + s + '-' + dom);
}

/** La fiche d'un domaine : de son titre au séparateur suivant. */
function fiche(id) {
  if (!fs.existsSync(FICHIER)) return null;
  var L = fs.readFileSync(FICHIER, 'utf8').split('\n');
  var re = new RegExp('^## ' + id + ' —');
  var d = L.findIndex(function (l) { return re.test(l); });
  if (d === -1) return null;
  var out = [];
  for (var i = d; i < L.length; i++) {
    if (i > d && /^---\s*$/.test(L[i])) break;
    out.push(L[i]);
  }
  return out.join('\n').trim();
}

/* Tous les fichiers du projet, en chemins relatifs à la racine du dépôt —
   la forme que les motifs attendent. Sert à prouver qu'aucun motif ne vise
   du vide. */
function fichiersDuProjet() {
  var racine = path.join(__dirname, '..');
  var ignore = ['node_modules', '.git', 'tests', 'docs', 'scripts', '_sortie'];
  var out = [];
  (function walk(dir) {
    var entrees;
    try { entrees = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entrees.forEach(function (e) {
      if (ignore.indexOf(e.name) !== -1) return;
      var p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push('pirates-tools/' + path.relative(racine, p).split(path.sep).join('/'));
    });
  })(racine);
  return out;
}

/* ═══ CONTRÔLE D'INTÉGRITÉ — appelé par la CI ═════════════════════════════
   Une porte dont le motif ne vise plus aucun fichier réel ne refuse plus rien
   et ne dit rien : c'est un trou silencieux, exactement le mode de panne du
   registre O2 (l'instrument est faux). On le rend bruyant. */
function controle() {
  var errors = [];
  if (!fs.existsSync(FICHIER)) {
    return ['docs/JURIDIQUE.md est absent : la porte juridique n\'a plus de contenu à ouvrir.'];
  }
  var src = fs.readFileSync(FICHIER, 'utf8');
  var declares = Object.keys(DOMAINES);
  var rediges = (src.match(/^## (J\d+) —/gm) || []).map(function (l) { return l.match(/J\d+/)[0]; });

  declares.forEach(function (k) {
    if (rediges.indexOf(k) === -1) {
      errors.push('juridique : ' + k + ' verrouille des fichiers mais n\'a aucune fiche '
        + 'dans docs/JURIDIQUE.md — la porte se fermerait sans rien à lire pour l\'ouvrir.');
    }
    if (src.indexOf('**' + k + '**') === -1) {
      errors.push('juridique : ' + k + ' n\'apparaît pas au sommaire de docs/JURIDIQUE.md.');
    }
  });
  rediges.forEach(function (k) {
    if (declares.indexOf(k) === -1) {
      errors.push('juridique : la fiche ' + k + ' existe mais aucun fichier ne la déclenche '
        + '— elle ne sera jamais lue au bon moment.');
    }
  });

  var tous = fichiersDuProjet();
  declares.forEach(function (k) {
    DOMAINES[k].motifs.forEach(function (re) {
      if (!tous.some(function (f) { return re.test(f); })) {
        errors.push('juridique : le motif ' + re + ' de ' + k + ' ne vise plus aucun '
          + 'fichier existant. La porte est un trou : elle laisse tout passer en silence.');
      }
    });
  });

  /* Angles morts : un fichier chargé juridiquement mais rattaché à rien.
     C'est le seul contrôle qui puisse rattraper un OUBLI de ma part — les
     autres ne vérifient que la cohérence de ce que j'ai déjà écrit. */
  var racine = path.join(__dirname, '..');
  tous.filter(function (f) { return /^pirates-tools\/api\/.*\.js$/.test(f); })
    .forEach(function (f) {
      if (HORS_PORTEE[f]) return;
      var couvert = domainesDe(f);
      var src;
      try { src = fs.readFileSync(path.join(racine, f.replace(/^pirates-tools\//, '')), 'utf8'); }
      catch (e) { return; }
      Object.keys(SONDES).forEach(function (dom) {
        if (couvert.indexOf(dom) !== -1) return;
        var n = (src.match(SONDES[dom]) || []).length;
        if (n >= SEUIL) {
          errors.push('juridique : ' + f + ' porte ' + n + ' signaux de ' + dom + ' ('
            + DOMAINES[dom].titre + ') et n\'y est rattaché par aucun motif. '
            + 'On l\'ajoute à ' + dom + ', ou on l\'écarte NOMMÉMENT dans HORS_PORTEE '
            + 'avec la raison. Un oubli silencieux est le seul défaut que les '
            + 'autres contrôles ne peuvent pas voir.');
        }
      });
    });
  return errors;
}

module.exports = { DOMAINES: DOMAINES, domainesDe: domainesDe, fiche: fiche,
                   temoinJuridique: temoinJuridique, controle: controle };

if (require.main === module) {
  var id = String(process.argv[2] || '').toUpperCase();

  if (id === '--CONTROLE') {
    var e = controle();
    if (e.length) { e.forEach(function (x) { console.error('❌ ' + x); }); process.exit(1); }
    console.log('✅ check-juridique : ' + Object.keys(DOMAINES).length
      + ' domaines, fiches et motifs concordants');
    process.exit(0);
  }

  if (!id) {
    console.log('\nDomaines qui engagent la responsabilité :\n');
    Object.keys(DOMAINES).forEach(function (k) {
      console.log('  ' + k + ' — ' + DOMAINES[k].titre);
    });
    console.log('\n  node scripts/juridique.js J2   (lit la fiche et ouvre la porte)\n');
    process.exit(0);
  }

  var f = fiche(id);
  if (!f) {
    console.error('Domaine « ' + id + ' » inconnu. Disponibles : '
      + Object.keys(DOMAINES).join(' '));
    process.exit(1);
  }

  console.log('\n' + f + '\n');
  console.log('─'.repeat(70));
  console.log('⚠️  Ce registre N\'EST PAS une source de droit. Il désigne où vérifier.');
  console.log('   Un article cité de mémoire est une invention (protocole §8).');

  /* Le témoin n'est posé qu'ICI : on ne déverrouille pas sans avoir affiché
     la fiche. Il vit le temps de la session. */
  var sid = process.env.CLAUDE_SESSION_ID || 'sans-session';
  try { fs.writeFileSync(temoinJuridique(sid, id), String(Date.now())); } catch (e) {}
  console.log('   Porte ' + id + ' ouverte pour cette session.');
}
