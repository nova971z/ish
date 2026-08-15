/* garde-entonnoir.js — LE PROTOCOLE CESSE D'ÊTRE UN VŒU.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE
   Le 29/07/2026, `scripts/ou.js` — l'entonnoir censé me donner, AVANT toute
   intervention, les règles, les pièges déjà payés et la définition de « fini » —
   a été construit le matin et utilisé **zéro fois** de la journée. Ni avant le
   Service Worker, ni avant l'administration, ni avant D1 où il aurait montré
   que le filet ne couvrait pas le mode de panne.

   Un protocole qu'on peut oublier est un vœu. Celui-ci **refuse l'édition**.

   MÉCANIQUE — quatre modes, appelés par les hooks de .claude/settings.json :
     --debut   (UserPromptSubmit) efface les témoins : chaque message rouvre le
               tour, l'entonnoir doit être reconsulté.
     --marque  (PostToolUse/Bash) pose le témoin si la commande a lancé ou.js,
               ou le témoin juridique si elle a lu une fiche.
     --liste   (PostToolUse/Write|Edit) remet sous les yeux le savoir du domaine.
     --garde   (PreToolUse/Write|Edit) REFUSE si un fichier SERVI est modifié
               sans témoin — et DEUX FOIS si ce fichier engage la responsabilité
               juridique sans que la fiche du domaine ait été lue.

   DEUX PORTES INDÉPENDANTES, jamais confondues :
     l'entonnoir protège du BOGUE       → savoir comment le projet est fait ;
     la porte juridique protège de l'INFRACTION → savoir ce qu'on risque.
   Un test vert ne dit rien de la seconde. C'est pourquoi elle existe à part.

   ⚠️ PORTÉE VOLONTAIREMENT ÉTROITE : uniquement ce que les visiteurs
   téléchargent ou ce qui garde leurs données. Documents, règles, tests et
   scripts restent libres — sinon la porte gênerait plus qu'elle ne protège,
   et une porte qui gêne finit désactivée.

   ⚠️ ÉCHEC SILENCIEUX INTERDIT DANS LES DEUX SENS : ce script ne doit jamais
   bloquer par accident (il laisse passer si quoi que ce soit cloche de son
   côté), ni laisser passer en silence ce qu'il doit refuser (le refus est
   explicite et dit quoi faire).
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

/* La table des domaines juridiques vit dans UN seul fichier. La porte et le
   registre lisent la même — donc elles ne peuvent pas diverger. Si ce module
   manque, `JUR` reste nul et la porte juridique s'efface : jamais de blocage
   par accident (voir l'avertissement en fin de fichier). */
var JUR = null;
try { JUR = require('./juridique.js'); } catch (e) { JUR = null; }

/* Fichiers SERVIS aux visiteurs, ou gardiens de leurs données. Toute
   modification ici exige d'avoir consulté l'entonnoir. */
var PROTEGES = [
  /(^|\/)pirates-tools\/app\.js$/,
  // SEO ordre 9 (D-120) : bundles GÉNÉRÉS depuis app.js et SERVIS. app.visitor.js
  // est chargé par chaque visiteur, admin.bundle.js à la demande sur #/admin —
  // les deux doivent rappeler de bumper sw.js quand ils changent.
  /(^|\/)pirates-tools\/app\.visitor\.js$/,
  /(^|\/)pirates-tools\/admin\.bundle\.js$/,
  /(^|\/)pirates-tools\/sw\.js$/,
  /(^|\/)pirates-tools\/index\.html$/,
  // Lot poids : source (index.src.html, styles.css) ET servi généré
  // (styles.min.css). Changer l'une doit rappeler de régénérer + bumper sw.js.
  /(^|\/)pirates-tools\/index\.src\.html$/,
  /(^|\/)pirates-tools\/styles\.css$/,
  /(^|\/)pirates-tools\/styles\.min\.css$/,
  /(^|\/)pirates-tools\/mfa\.js$/,
  /(^|\/)pirates-tools\/firebase-init\.js$/,
  /(^|\/)pirates-tools\/manifest\.webmanifest$/,
  /(^|\/)pirates-tools\/products\.json$/,
  /(^|\/)pirates-tools\/vercel\.json$/,
  /(^|\/)pirates-tools\/(firestore|storage)\.rules$/,
  /(^|\/)pirates-tools\/api\//
];

function lireEntree() {
  var brut = '';
  try { brut = fs.readFileSync(0, 'utf8'); } catch (e) { return {}; }
  try { return JSON.parse(brut) || {}; } catch (e) { return {}; }
}

/* Un témoin PAR SESSION : deux sessions parallèles ne se déverrouillent pas
   l'une l'autre. */
function temoin(d) {
  return path.join(os.tmpdir(), 'pt-entonnoir-' + sessionDe(d));
}

function sessionDe(d) {
  return String((d && d.session_id) || process.env.CLAUDE_SESSION_ID
    || 'sans-session').replace(/[^\w-]/g, '');
}

/* Le témoin juridique est posé ICI, avec l'identifiant de session que voit le
   hook — et non celui que devine `juridique.js` depuis l'environnement. Les
   deux peuvent différer ; la porte ne lit que celui-ci. */
function temoinJur(d, dom) {
  return path.join(os.tmpdir(), 'pt-juridique-' + sessionDe(d) + '-' + dom);
}

/* ═══ LISTES DE CONTRÔLE MÉTIER ═══════════════════════════════════════════
   Le protocole seul est une MÉTHODE. Un expert applique en plus le savoir du
   domaine touché. Ces listes sont injectées dans le contexte APRÈS l'édition,
   au moment exact où elles servent : « tu viens de toucher au paiement, voici
   ce qui doit être vrai avant de dire que c'est fini ».
   Chaque point vient d'un défaut RÉELLEMENT constaté sur ce projet. */
var LISTES = [
  { nom: 'PAIEMENT',
    quand: /pirates-tools\/api\/((create-payment-intent|webhook|checkout)\.js|_lib\/(pricing|pricing-model|pricing-config|price-parse|reconstitution|barriere-achat|accounting|invoice|loyalty|paiement-meta|postal)\.js)$/,
    points: [
      'Le SERVEUR est autoritaire sur le montant : un prix venu du client est ignoré.',
      'Le webhook lit le corps BRUT — un corps parsé invalide la signature.',
      'Idempotence : le même événement rejoué deux fois ne débite pas deux fois.',
      'Le montant AFFICHÉ et le montant DÉBITÉ tombent au centime.',
      'Le territoire fiscal vient du CODE POSTAL, jamais d\'un champ déclaré.',
      'Aucune donnée personnelle dans les journaux (ni e-mail, ni adresse).',
      'Preuve exigée : scripts/check-pricing.js + audit/p5-money.js verts.'
    ] },
  { nom: 'IDENTITÉ ET DONNÉES',
    quand: /pirates-tools\/(firebase-init\.js|mfa\.js|firestore\.rules|storage\.rules|api\/(admin|newsletter|events|cron-report)\.js|api\/_lib\/(auth|firebase|analytics|ratelimit)\.js)$/,
    points: [
      'L\'uid vient UNIQUEMENT du jeton vérifié, jamais du corps de la requête.',
      'email_verified se lit dans la revendication signée, pas dans un champ transmis.',
      'Les règles sont en default-deny : toute collection nouvelle est fermée.',
      'where + orderBy sur deux champs ⇒ index composite. L\'ÉMULATEUR NE LE DIRA JAMAIS.',
      'Une règle modifiée doit être DÉPLOYÉE, sinon la protection est théorique.',
      'Second facteur : la porte de sortie (mfa-unlock) doit être essayée AVANT.',
      'Preuve exigée : test-rules.js contre l\'émulateur réel + audit/p4-firestore.js.'
    ] },
  { nom: 'FRONT SERVI AUX VISITEURS',
    quand: /pirates-tools\/(app\.js|sw\.js|index\.html|styles\.css)$/,
    points: [
      'Bumper sw.js (VERSION, ASSET_VER) ET les ?v= de index.html — la CI le vérifie.',
      'Script inline modifié ⇒ recalculer l\'empreinte CSP, sinon le site meurt.',
      'Service Worker : jamais de corps vide, jamais de redirection en dernier recours.',
      'Plafonds : on retire du poids, on ne relève pas la limite.',
      'L\'user navigue en privé : chaque octet est repayé à CHAQUE visite.',
      'Preuve exigée : ci.js + tests/lancer.mjs --noyau verts.'
    ] },
  { nom: 'CHAÎNE DE LIVRAISON',
    quand: /pirates-tools\/api\/(contact\.js|_lib\/courses\.js)$/,
    points: [
      'La plateforme ne fixe PAS le prix et n\'encaisse PAS la course (art. L7342-1).',
      'Le client pose ses conditions à la commande et ne les ressaisit jamais.',
      'Le tri de l\'annuaire ne dépend JAMAIS du prix.',
      'Cloisonnement par round : le livreur suivant ne lit pas la conversation d\'avant.',
      'Le code de remise n\'est JAMAIS visible d\'un livreur.',
      'Les prix viennent TOUJOURS du catalogue serveur.',
      'Preuve exigée : plan9, plan10, plan11, couriers verts.'
    ] },
  { nom: 'RENDU SERVEUR (SEO)',
    quand: /pirates-tools\/(api\/render\.js|sitemap\.xml)$/,
    points: [
      'MÊME HTML pour tous : aucun aiguillage robot/humain (cloaking rejeté, D-019).',
      'Canonical JAMAIS avec un fragment # — une URL par page, exactement.',
      'Fiche sans description_long ou au visuel placeholder ⇒ noindex,follow.',
      'Un slug inconnu répond HTTP 404 + noindex — jamais 200, jamais une redirection.',
      'Aucun prix rendu qui ne vienne pas du MÊME loadCatalog que le paiement (J4).',
      'Preuve exigée : scripts/check-render.js vert + sabotages rouges.'
    ] },
  { nom: 'CATALOGUE ET VISUELS',
    quand: /pirates-tools\/(products\.json|images\/|models\/|api\/products\.js$|api\/_lib\/(catalog|snapshot|limites|poids-expedie|verif-visibilite)\.js$)/,
    points: [
      'priceLocked: true ⇒ le prix n\'est JAMAIS recalculé.',
      'Un produit sans coût d\'achat relevé ne reste pas au catalogue.',
      'Posters : fond sombre obligatoire. Les visuels sont le travail de l\'user.',
      'Orientation de pack validée = GRAVÉE : on ne la re-dérive jamais à l\'œil.',
      'Aucune image servie au-dessus de 871 Ko (D-002).',
      'Une écriture de fiche se RELIT par le chemin public avant de dire « ✅ ».',
      'La garde de visibilité doit savoir dire NON : un cas négatif la prouve faillible.',
      'Preuve exigée : audit/p8-perf.js + check-fiches-persistees (banc, 6 cycles) verts.'
    ] }
];

/* ═══ CE QUI N'A DÉLIBÉRÉMENT PAS DE LISTE ════════════════════════════════
   Une couverture partielle qui se croit complète est le pire état : la sonde
   de `scripts/couverture.js` EXIGE que chaque fichier serveur soit rattaché à
   une liste, ou nommé ici avec sa raison. Un fichier oublié devient bruyant.
   ⚠️ C'est E-106 généralisé : la table juridique visait 8 fichiers quand il en
   fallait 20, et seule une sonde l'a vu. */
var HORS_LISTE = {
  'pirates-tools/api/health.js': 'sonde de disponibilité — ne lit ni n\'écrit rien',
  'pirates-tools/api/test-email.js': 'outil de diagnostic, jamais atteint par un client',
  'pirates-tools/api/instagram.js': 'relais de médias publics, aucune règle métier',
  'pirates-tools/api/_lib/http.js': 'transport pur — statuts et en-têtes, aucune décision métier',
  /* Données pures : familles, rayons, noms d'outils, normes EPI, suffixes de
     référence. Aucune règle métier ne s'y exécute — la logique qui S'EN SERT
     est `price-parse.js`, rattachée au traqueur et couverte par
     `check-price-watch`. Écarté le 03/08/2026. */
  'pirates-tools/api/_lib/nomenclature.js': 'dictionnaire de vocabulaire — aucune règle exécutée, la logique vit dans price-parse.js',
  /* Même nature : des ADRESSES de pages publiques et un nombre de pages.
     Aucune règle ne s'y exécute — celle qui s'en sert est `planBalayage`, dans
     `price-parse.js`. Et ce fichier a sa PROPRE porte, `check-plan-traqueur`,
     qui exige entre autres qu'aucune adresse ne porte de secret et que ce qui
     reste supposé soit écrit comme tel. Écarté le 03/08/2026. */
  'pirates-tools/api/_lib/traqueur-plans.js': 'adresses de pages publiques — aucune règle exécutée, couvert par check-plan-traqueur',
  /* ⛔ Écarté SCIEMMENT, et voici pourquoi ce n'est pas un contournement.
     `diag-rafale.js` ne décide RIEN : il reçoit des compteurs et deux
     horodatages, et rend une phrase qui dit pourquoi un balayage a rendu moins
     de pages qu'il n'en a envoyé. Aucun prix n'y entre (J4), aucune donnée
     personnelle (J3), aucune TVA ni octroi de mer (J5) — le rattacher à la
     liste PAIEMENT ferait cocher sept points dont aucun ne le concerne, et une
     liste qui ne s'applique jamais apprend à ignorer les listes.
     ⚠️ Ce qu'il risque à la place — se tromper de cause et envoyer corriger au
     mauvais endroit — est gardé par `check-price-watch` : ses deux causes
     opposées y sont montées sur des données mesurées, et chacune sabotée.
     Écarté le 03/08/2026. */
  'pirates-tools/api/_lib/diag-rafale.js': 'fonction pure sur des compteurs et des horodatages — aucune règle métier, couvert par check-price-watch'
};

module.exports = { PROTEGES: PROTEGES, LISTES: LISTES, HORS_LISTE: HORS_LISTE };

/* ⚠️ Tout ce qui suit ne doit tourner QUE si le script est lancé par un hook.
   Sans cette garde, un simple `require` de ce module lisait l'entrée standard
   et se terminait par `process.exit(0)` — le programme appelant mourait en
   silence, sans une ligne d'erreur. C'est ainsi que `couverture.js` n'a rien
   affiché à son premier lancement. */
if (require.main !== module) return;

var mode = process.argv[2];
var d = lireEntree();
var t = temoin(d);

try {
  if (mode === '--interdits') {
    /* Se déclenche sur les MOTS DE L'USER, avant tout aiguillage. Mesuré en
       épreuve : « trier l'annuaire par prix » et « prix barré » routaient tous
       deux vers D-012, jamais vers D-009 ni D-004 qui les interdisent. Une
       demande dangereuse se formule par son bénéfice, jamais par le mécanisme
       qu'elle enfreint — l'entonnoir seul ne pouvait donc pas la voir. */
    var INT = null;
    try { INT = require('./interdits.js'); } catch (e) { process.exit(0); }
    var li = INT.verifier(String(d.prompt || ''));
    if (!li.length) process.exit(0);
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'Cette demande touche une règle déjà tranchée. Elle n\'est '
          + 'PAS interdite — c\'est l\'entreprise de l\'user. Mais elle ne se code pas '
          + 'avant de lui avoir dit ce qu\'elle engage, et d\'avoir eu sa réponse :\n\n'
          + INT.rendu(li)
          + '\n\n⚠️ Aucun test ne rougit si on l\'implémente. Ce rappel est le seul filet.'
      }
    }));
    process.exit(0);
  }

  if (mode === '--debut') {
    // Nouveau message de l'user : le tour recommence, les témoins tombent.
    try { fs.unlinkSync(t); } catch (e) { /* absent = déjà bon */ }
    /* Les portes juridiques retombent AUSSI. Une fiche lue ce matin ne couvre
       pas ce qu'on édite ce soir : c'est exactement la panne E-403 — l'outil
       construit puis jamais rouvert. */
    if (JUR) Object.keys(JUR.DOMAINES).forEach(function (k) {
      try { fs.unlinkSync(temoinJur(d, k)); } catch (e) {}
    });
    process.exit(0);
  }

  if (mode === '--marque') {
    var cmd = String((d.tool_input && d.tool_input.command) || '');
    if (/\bou\.js\b/.test(cmd)) fs.writeFileSync(t, String(Date.now()));
    /* `node scripts/juridique.js J2` ⇒ la fiche J2 a été AFFICHÉE, donc lue.
       On ne pose le témoin que pour les domaines effectivement demandés.
       ⚠️ TOUTES les occurrences, pas la première : une commande composée
       (`… J3 && … J5`) n'en posait qu'un seul, et la porte refusait ensuite
       une écriture pourtant préparée. Défaut constaté DEUX FOIS le 31/07 —
       la seconde a suffi à le corriger. */
    var j, re = /juridique\.js\s+(J\d+)/gi;
    while ((j = re.exec(cmd)) !== null) {
      var dom = j[1].toUpperCase();
      if (JUR && JUR.DOMAINES[dom]) fs.writeFileSync(temoinJur(d, dom), String(Date.now()));
    }
    process.exit(0);
  }

  if (mode === '--liste') {
    /* Après une édition : on remet sous les yeux le savoir du domaine touché.
       Injecté en contexte — donc lu, pas rangé dans un fichier qu'on n'ouvre pas. */
    var fe = String((d.tool_input && d.tool_input.file_path)
                 || (d.tool_response && d.tool_response.filePath) || '');
    var L = LISTES.filter(function (x) { return x.quand.test(fe); });
    if (!L.length) process.exit(0);
    var txt = L.map(function (x) {
      return '⚠️ LISTE DE CONTRÔLE — ' + x.nom + '\n'
        + x.points.map(function (p, i) { return '  ' + (i + 1) + '. ' + p; }).join('\n');
    }).join('\n\n');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'Tu viens de modifier un fichier sensible. Rien n\'est '
          + '« fait » tant que CHACUN de ces points n\'est pas vrai ET prouvé :\n\n' + txt
      }
    }));
    process.exit(0);
  }

  if (mode === '--garde') {
    var f = String((d.tool_input && d.tool_input.file_path) || '');

    /* ═══ PORTE 1 — JURIDIQUE ═══════════════════════════════════════════════
       Passée en PREMIER, et c'est délibéré : un bogue se corrige, une clause
       illicite mise en ligne a déjà produit ses effets quand on s'en aperçoit.
       L'ordre de priorité du projet le dit — argent, sécurité, fonctionnel. */
    var doms = JUR ? JUR.domainesDe(f.replace(/\\/g, '/')) : [];
    var manquants = doms.filter(function (k) { return !fs.existsSync(temoinJur(d, k)); });
    if (manquants.length) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            '⛔ PORTE JURIDIQUE — ce fichier n\'expose pas à un bogue, il expose '
            + 'à une INFRACTION.\n\n  Fichier : ' + f + '\n'
            + manquants.map(function (k) {
                return '  Domaine engagé : ' + k + ' — ' + JUR.DOMAINES[k].titre;
              }).join('\n')
            + '\n\n  Lis la fiche AVANT d\'écrire — elle dit ce qu\'on risque et '
            + 'à quelle source officielle le vérifier :\n'
            + manquants.map(function (k) {
                return '      cd pirates-tools && node scripts/juridique.js ' + k;
              }).join('\n')
            + '\n\n  ⚠️ Aucun test vert ne couvre ce mode de panne : requalification '
            + 'en salariat, sanction CNIL, pratique commerciale trompeuse ou '
            + 'redressement ne se détectent pas à l\'exécution.\n'
            + '  ⛔ Et rien ici n\'est une source de droit : un article cité de '
            + 'mémoire est une invention (protocole §8, registre O1).'
        }
      }));
      process.exit(0);
    }

    /* ═══ PORTE 2 — ENTONNOIR ═════════════════════════════════════════════ */
    var vise = PROTEGES.some(function (re) { return re.test(f); });
    if (!vise || fs.existsSync(t)) process.exit(0);   // hors portée, ou entonnoir consulté

    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          '⛔ PROTOCOLE §1 — fichier SERVI aux visiteurs modifié sans avoir '
          + 'consulté l\'entonnoir.\n\n  Fichier : ' + f + '\n\n'
          + '  Lance d\'abord, et LIS la sortie :\n'
          + '      cd pirates-tools && node scripts/ou.js "<ce que je vais faire>"\n\n'
          + '  Elle donne les règles applicables, les pièges déjà payés, les '
          + 'décisions en vigueur et ce que « fini » veut dire ici.\n'
          + '  Motif de cette porte : l\'entonnoir a été construit le 29/07 et '
          + 'utilisé zéro fois le jour même. Un protocole qu\'on peut oublier '
          + 'est un vœu.'
      }
    }));
    process.exit(0);
  }
} catch (e) {
  /* ⚠️ En cas de pépin interne, on LAISSE PASSER. Une porte qui bloque par
     accident rend le dépôt inutilisable et finit désactivée — donc ne protège
     plus rien du tout. */
  process.exit(0);
}
process.exit(0);
