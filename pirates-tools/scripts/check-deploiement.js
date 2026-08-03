/* check-deploiement.js — « QUEL CODE TOURNE EN PRODUCTION ? »
 *
 * ⛔ MOTIF (E-404, payé deux fois). Rien du côté du dépôt ne sait ce que
 * Vercel a réellement déployé : ni `git log`, ni GitHub, ni la CI. J'ai donc
 * répondu « c'est poussé » en laissant croire « c'est en ligne », et l'user a
 * relancé son traqueur DEUX FOIS contre un parseur déjà corrigé — recevant
 * deux fois la même sortie fausse, sans que rien ne puisse le lui dire.
 * La seule réponse honnête vient de la PRODUCTION elle-même : `/api/health`
 * rend désormais l'identifiant du commit que Vercel lui a mis. Son raccourci
 * appelle déjà ce point d'entrée en première étape — la réponse est sur son
 * écran avant même qu'il envoie la page.
 *
 * ⛔⛔ ET CE POINT D'ENTRÉE EST PUBLIC. Il n'a aucune authentification. Tout
 * ce qu'on y ajoute est lisible par n'importe qui. D'où la seconde moitié de
 * cette porte : prouver qu'AUCUNE VALEUR d'environnement n'en sort — ni
 * directement, ni par la bande dans un message d'erreur.
 */

var path = require('path');

module.exports = function () {
  var errors = [];
  function ok(cond, msg) { if (!cond) errors.push(msg); }

  var chemin = path.join(__dirname, '..', 'api', 'health.js');

  /* Le module lit `process.env` À CHAQUE APPEL (jamais au chargement) : on peut
     donc le charger une fois et faire varier l'environnement autour de lui.
     ⚠️ Si un jour il capturait l'environnement au chargement, ce préalable
     tomberait — d'où la double lecture ci-dessous, qui l'exercerait. */
  var handler = require(chemin);
  ok(typeof handler === 'function',
    '⛔ PRÉALABLE : api/health.js n\'exporte pas de gestionnaire — la porte n\'a rien vérifié');
  if (typeof handler !== 'function') return errors;

  function appeler(env) {
    var avant = {};
    Object.keys(env).forEach(function (k) {
      avant[k] = process.env[k];
      if (env[k] === null) delete process.env[k]; else process.env[k] = env[k];
    });
    var recu = null;
    var res = {
      status: function () { return res; },
      json: function (o) { recu = o; return res; }
    };
    try { handler({ method: 'GET', headers: {} }, res); }
    finally {
      Object.keys(avant).forEach(function (k) {
        if (avant[k] === undefined) delete process.env[k]; else process.env[k] = avant[k];
      });
    }
    return recu;
  }

  /* ─── ① LE COMMIT DÉPLOYÉ EST DIT, ET IL EST DIT JUSTE ─────────────────── */

  var SHA = 'abcdef0123456789abcdef0123456789abcdef01';   // 40 signes, synthétique
  var r = appeler({ VERCEL_GIT_COMMIT_SHA: SHA, VERCEL_GIT_COMMIT_REF: 'master', VERCEL_ENV: 'production' });
  ok(r && r.build && r.build.commit === SHA.slice(0, 7),
    '⛔ /api/health doit rendre le commit déployé, en 7 signes — c\'est la SEULE '
    + 'réponse possible à « est-ce que c\'est déployé ? » (obtenu '
    + JSON.stringify(r && r.build && r.build.commit) + ')');
  ok(r && r.build && r.build.branch === 'master',
    '⛔ …et la BRANCHE : Vercel ne déploie que `master`, et j\'ai déjà cru livrer '
    + 'en poussant ailleurs (E-404). Sans elle, un commit juste sur la mauvaise '
    + 'branche se lirait comme une livraison');
  ok(JSON.stringify(r || {}).indexOf(SHA) === -1,
    '⛔ le SHA COMPLET ne sort pas : ce qui sort d\'un point d\'entrée public est '
    + 'CHOISI, jamais recopié tel quel');

  /* ⛔ « JE NE SAIS PAS » EST UNE RÉPONSE, « PROBABLEMENT » N'EN EST PAS.
     Hors Vercel la variable n'existe pas. Rendre '' ou 'inconnu' ferait croire
     à une réponse ; `null` dit l'ignorance, et c'est ce qu'il faut. */
  var rLocal = appeler({ VERCEL_GIT_COMMIT_SHA: null, VERCEL_GIT_COMMIT_REF: null, VERCEL_ENV: null });
  ok(rLocal && rLocal.build && rLocal.build.commit === null && rLocal.build.branch === null,
    '⛔ sans les variables de Vercel, le commit vaut null — jamais une valeur '
    + 'inventée qui se lirait comme une réponse (obtenu '
    + JSON.stringify(rLocal && rLocal.build) + ')');

  /* ─── ② AUCUNE VALEUR D'ENVIRONNEMENT NE SORT D'UN POINT D'ENTRÉE PUBLIC ── */

  /* Témoins : des chaînes qui n'existent nulle part ailleurs dans le projet.
     Si l'une d'elles reparaît dans la réponse, une valeur a fui. */
  var TEMOIN = 'ZZTEMOIN7f3a9c1e5b2d8046ZZ';
  var secrets = {
    ADMIN_SECRET: TEMOIN + 'ADM',
    REVOLUT_SECRET_KEY: TEMOIN + 'REV',
    REVOLUT_WEBHOOK_SECRET: TEMOIN + 'WHK',
    RESEND_API_KEY: TEMOIN + 'RSD',
    META_APP_SECRET: TEMOIN + 'MET',
    META_ACCESS_TOKEN: TEMOIN + 'TOK'
  };
  var rSec = appeler(secrets);
  var fuite = Object.keys(secrets).filter(function (k) {
    return JSON.stringify(rSec || {}).indexOf(secrets[k]) !== -1;
  });
  ok(fuite.length === 0,
    '⛔⛔ SÉCURITÉ : /api/health est PUBLIC et sans authentification. Aucune '
    + 'VALEUR d\'environnement n\'en sort — que des booléens (fuite : '
    + JSON.stringify(fuite) + ')');
  /* PRÉALABLE : sans lui, un health qui ne rendrait plus rien passerait. */
  ok(rSec && rSec.env && rSec.env.adminSecret === true && rSec.env.revolut === true,
    '⛔ PRÉALABLE : le diagnostic rend bien PRÉSENT/ABSENT — sinon l\'assertion '
    + 'ci-dessus serait verte sur une réponse vide');

  /* ⛔⛔ LA FUITE PAR LE MESSAGE D'ERREUR — mesurée, pas supposée.
     Node v22.22.2 : `JSON.parse('ZZSECRET_TEMOIN…')` rend « Unexpected token
     'Z', "ZZSECRET_T"... is not valid JSON » — les DIX PREMIERS SIGNES de
     l'entrée. Or l'entrée est le compte de service Firebase, et le cas où ce
     message sort est précisément celui d'un copier-coller raté : donc
     possiblement décalé sur la clé privée, sur un point d'entrée public.
     ⚠️ Le harnais ne recopie pas le message attendu — la formulation change
     d'une version de Node à l'autre. Il vérifie l'INVARIANT : le témoin donné
     en entrée ne ressort pas. */
  var rMal = appeler({ FIREBASE_SERVICE_ACCOUNT: TEMOIN + 'PASDUJSON' });
  var brut = JSON.stringify(rMal || {});
  ok(brut.indexOf(TEMOIN) === -1 && brut.indexOf(TEMOIN.slice(0, 10)) === -1,
    '⛔⛔ SÉCURITÉ : le message d\'erreur de JSON.parse RECOPIE son entrée — ici '
    + 'le compte de service. Rien de l\'entrée ne doit ressortir, même tronqué ('
    + brut.slice(0, 200) + ')');
  /* PRÉALABLE : l'information utile doit survivre au filtrage. Une garde qui
     vide le diagnostic protège en le rendant inutile — ce n'est pas le but. */
  ok(rMal && rMal.firebaseCheck && rMal.firebaseCheck.parses === false
    && typeof rMal.firebaseCheck.parseError === 'string'
    && rMal.firebaseCheck.parseError.length > 0,
    '⛔ PRÉALABLE : le diagnostic reste UTILE — il dit toujours que ça ne parse '
    + 'pas, et où. Filtrer ne veut pas dire taire (obtenu '
    + JSON.stringify(rMal && rMal.firebaseCheck && rMal.firebaseCheck.parseError) + ')');
  ok(rMal && rMal.firebaseCheck && rMal.firebaseCheck.length === (TEMOIN + 'PASDUJSON').length,
    '⛔ PRÉALABLE : la LONGUEUR reste rendue — c\'est elle qui démasque une '
    + 'troncature de copier-coller, et une longueur ne recopie rien');

  /* ⛔ L'AUTRE PORTEUR DU MÊME DANGER : `initError`, le message rendu par la
     bibliothèque Firebase à qui on vient de passer la clé privée. Son chemin
     demande que le compte de service PARSE et que l'initialisation échoue —
     inatteignable d'ici. Un premier jet le laissait donc sans garde : sabotage
     appliqué, porte restée VERTE. La fonction est exposée pour être prouvée. */
  var msg = handler.messageSansSecret;
  ok(typeof msg === 'function',
    '⛔ PRÉALABLE : messageSansSecret doit être exposée, sinon rien ci-dessous '
    + 'n\'est vérifié');
  if (typeof msg === 'function') {
    var CLE = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ' + TEMOIN;
    var filtre = msg({ message: 'Failed to parse private key: ' + CLE });
    ok(filtre.indexOf(TEMOIN) === -1 && filtre.indexOf(CLE.slice(0, 20)) === -1,
      '⛔⛔ SÉCURITÉ : aucun fragment de clé ne sort par un message d\'erreur, '
      + 'même venu d\'une bibliothèque tierce (obtenu ' + JSON.stringify(filtre) + ')');
    /* PRÉALABLE — filtrer ne veut pas dire taire : les MOTS restent. */
    ok(/Failed to parse private key/.test(filtre),
      '⛔ PRÉALABLE : la phrase d\'erreur survit au filtrage — une garde qui vide '
      + 'le diagnostic protège en le rendant inutile (obtenu '
      + JSON.stringify(filtre) + ')');
    /* ⚠️ Et TRONQUER NE SUFFIT PAS : un secret court passerait entier sous un
       simple `.slice()`. C'est la forme — une suite sans espace — qui est
       refusée, pas la longueur de la phrase. */
    ok(msg({ message: TEMOIN }).indexOf(TEMOIN) === -1,
      '⛔ un secret placé SEUL dans le message, sans phrase autour, ne sort pas '
      + 'non plus — sinon la garde ne tiendrait qu\'aux messages bavards');
  }

  /* ⛔⛔ ET LE FILTRE DOIT ÊTRE BRANCHÉ, pas seulement correct. Mesuré : le
     sabotage qui remplaçait l'appel par `String(e.message)` laissait la porte
     VERTE — parce que ce chemin est INATTEIGNABLE depuis un test. Vérifié à
     l'instant : `getFirebase()` AVALE l'erreur (elle est journalisée, pas
     levée), donc le `catch` de `initError` ne se déclenche jamais. Le filtre
     y reste par défense — le jour où cette fonction lèvera, il sera là — mais
     aucune exécution ne peut le prouver.
     ⛔ Ce qu'aucune exécution n'atteint se garde à la SOURCE, sur l'invariant
     et non sur une formulation : dans ce fichier, tout `.message` d'une
     erreur passe par l'un des deux filtres, sans exception. */
  var src = require('fs').readFileSync(chemin, 'utf8');
  var horsFiltres = src;
  ['messageSansSecret', 'positionErreurJson'].forEach(function (nom) {
    var i = horsFiltres.indexOf('function ' + nom + '(');
    if (i === -1) return;
    var j = horsFiltres.indexOf('\n}', i);
    if (j === -1) return;
    horsFiltres = horsFiltres.slice(0, i) + horsFiltres.slice(j + 2);
  });
  var nus = (horsFiltres.match(/\.message\b/g) || []).length;
  ok(nus === 0,
    '⛔⛔ SÉCURITÉ : hors des deux filtres, api/health.js ne touche JAMAIS au '
    + '`.message` d\'une erreur — c\'est par là que dix signes du compte de '
    + 'service sortaient sur un point d\'entrée public (' + nus + ' occurrence(s))');
  /* PRÉALABLE : si les deux filtres disparaissaient du fichier, le découpage
     ci-dessus ne retirerait rien et l'assertion resterait verte à vide. */
  ok(/function messageSansSecret\(/.test(src) && /function positionErreurJson\(/.test(src),
    '⛔ PRÉALABLE : les deux filtres existent bien dans le fichier — sans eux, '
    + 'le découpage ne retire rien et l\'assertion ci-dessus ne vérifie rien');

  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-deploiement OK');
  }, function (err) {
    console.error('  ❌ [check-deploiement] harnais mort : ' + err.message);
    process.exit(1);
  });
}
