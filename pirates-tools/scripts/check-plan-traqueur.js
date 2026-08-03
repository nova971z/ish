/* check-plan-traqueur.js — LE BALAYAGE DES 67 PAGES.
 *
 * ⛔ MOTIF, dit et redit par l'user : « arrête de me demander de rajouter
 * quelque chose dans une URL ». Le raccourci iPad demande son PLAN au serveur
 * et boucle dessus ; plus une seule adresse tapée à la main. Ce qui se gagne
 * en confort se paie en confiance : si le plan est faux, ce sont 67 pages qui
 * partent à côté, et des coûts d'achat qui ne descendent pas.
 *
 * ⚠️ J4 — aucun prix ne transite par ce plan, mais tout ce qu'il commande en
 * produit : une page manquée est une source de prix manquée, donc un coût
 * d'achat retenu trop haut.
 * ⚠️ J3 — le plan ne rend que des adresses de pages PUBLIQUES. La clé du
 * traqueur vit dans un EN-TÊTE ; elle ne doit JAMAIS entrer dans une URL, et
 * une assertion ci-dessous le prouve.
 */

var path = require('path');
var pp = require(path.join(__dirname, '..', 'api', '_lib', 'price-parse.js'));
var plans = require(path.join(__dirname, '..', 'api', '_lib', 'traqueur-plans.js'));

/* ⛔ SECRET DE HARNAIS, jamais un vrai. Il sert à prouver deux choses : que la
   porte s'ouvre avec, et qu'il ne RESSORT nulle part. */
var SECRET_FICTIF = 'ZZSECRET-DE-HARNAIS-0123456789-NE-VAUT-RIEN';

module.exports = function () {
  var errors = [];
  function ok(cond, msg) { if (!cond) errors.push(msg); }

  var connus = plans.plansConnus();
  ok(connus.length >= 1,
    '⛔ PRÉALABLE : aucun plan déclaré — tout ce qui suit vérifierait le vide');
  if (!connus.length) return errors;

  /* ─── ① CHAQUE PLAN DÉCLARÉ TIENT DEBOUT ────────────────────────────────
     On boucle sur ce qui EST déclaré, sans jamais recopier un nom ni un
     nombre : un seuil recopié se périme, et un harnais qui nomme une donnée
     du produit meurt au premier changement voulu par l'user. */
  connus.forEach(function (clef) {
    var p = plans.PLANS[clef];
    var etapes = pp.planBalayage(p);

    ok(etapes.length === p.pages,
      '⛔ ' + clef + ' : le plan rend autant d\'étapes que de pages déclarées ('
      + etapes.length + '/' + p.pages + ')');

    var vides = etapes.filter(function (e) { return !e.url; });
    ok(vides.length === 0,
      '⛔⛔ ' + clef + ' : AUCUNE étape sans adresse. Une étape vide, c\'est une page '
      + 'que le raccourci saute en silence — donc des prix qu\'on ne voit jamais ('
      + vides.length + ' vide(s))');

    var distinctes = {};
    etapes.forEach(function (e) { distinctes[e.url] = 1; });
    ok(Object.keys(distinctes).length === etapes.length,
      '⛔⛔ ' + clef + ' : les ' + etapes.length + ' adresses sont TOUTES DIFFÉRENTES. '
      + 'Deux étapes identiques, c\'est une page lue deux fois et une autre jamais — '
      + 'et le compteur de couverture le maquillerait en succès ('
      + Object.keys(distinctes).length + ' distinctes)');

    /* ⛔ L'ORDRE EST UNE DEMANDE DE L'USER, pas un détail : « commencer par la
       dernière page en ordre décroissant ». C'est là que sont les articles les
       moins chers, ceux dont le prix bouge le plus. */
    var descendant = String(p.ordre || 'desc').toLowerCase().indexOf('asc') !== 0;
    ok(etapes[0].page === (descendant ? p.pages : 1),
      '⛔ ' + clef + ' : en ordre ' + p.ordre + ', le balayage COMMENCE par la page '
      + (descendant ? p.pages : 1) + ' (obtenu ' + etapes[0].page + ')');
    ok(etapes[etapes.length - 1].page === (descendant ? 1 : p.pages),
      '⛔ ' + clef + ' : …et FINIT par l\'autre bout (obtenu '
      + etapes[etapes.length - 1].page + ')');

    /* ⛔ LA PREMIÈRE PAGE N'A PAS DE DÉCALAGE. Le site écrit `100I16oM…` pour
       la page 1, pas `100I16-0oM…` : fabriquer le second, c'est fabriquer une
       adresse qui peut ne pas exister — et on ne le saurait qu'en perdant 60
       articles. */
    var page1 = etapes.filter(function (e) { return e.page === 1; })[0];
    ok(page1 && p.patronPage1 && page1.url === p.patronPage1,
      '⛔ ' + clef + ' : la page 1 utilise son patron PROPRE, jamais un décalage à '
      + 'zéro fabriqué (' + JSON.stringify(page1 && page1.url) + ')');

    /* ⛔⛔ SÉCURITÉ — AUCUN SECRET DANS UNE ADRESSE. La clé du traqueur vit
       dans un en-tête ; une URL se journalise, se partage, se colle dans un
       message. Le harnais pose le secret dans l'environnement PUIS relit
       toutes les adresses. */
    var avant = process.env.WATCH_SECRET;
    process.env.WATCH_SECRET = SECRET_FICTIF;
    var toutes = etapes.map(function (e) { return e.url; }).join(' ');
    process.env.WATCH_SECRET = avant;
    ok(toutes.indexOf(SECRET_FICTIF) === -1 && !/secret|token|cl[ée]=/i.test(toutes),
      '⛔⛔ SÉCURITÉ : aucune adresse du plan ne porte de secret — il vit dans un '
      + 'EN-TÊTE, et une URL se journalise, se partage, se colle');

    /* ⛔⛔ CE QUI EST SUPPOSÉ RESTE ÉCRIT COMME SUPPOSÉ. E-112 a été payée pour
       ça : j'avais déduit « 15 produits par page » du pas de l'URL alors que la
       page en affiche 60 — deux points de données ne font pas une grammaire.
       Un plan déclare donc soit la PREUVE que son pas est mesuré
       (`pasConfirme`), soit ce qu'il reste à vérifier (`aVerifier`). Jamais ni
       l'un ni l'autre : une supposition qu'on cesse d'écrire devient un fait
       par usure. Jamais les deux : on ne vérifie pas ce qui est prouvé. */
    var aVerif = !!p.aVerifier, prouve = !!p.pasConfirme;
    ok(aVerif !== prouve,
      '⛔⛔ ' + clef + ' : un plan porte EXACTEMENT l\'un des deux — `pasConfirme` '
      + '(avec sa preuve) ou `aVerifier` (avec ce qui reste supposé). Ni les deux, '
      + 'ni aucun : une supposition qu\'on cesse d\'écrire devient un fait par usure '
      + '(aVerifier=' + aVerif + ', pasConfirme=' + prouve + ')');
  });

  /* ─── ② LE POINT D'ENTRÉE, POUR DE VRAI ─────────────────────────────────
     ⛔ Une fonction pure verte ne prouve rien de la porte qui l'expose. On
     appelle donc le VRAI gestionnaire, avec une vraie requête. */
  var handler = require(path.join(__dirname, '..', 'api', 'admin.js'));
  ok(typeof handler === 'function',
    '⛔ PRÉALABLE : api/admin.js n\'exporte pas de gestionnaire');
  if (typeof handler !== 'function') return errors;

  function fauxRes() {
    return { code: 0, out: null,
      status: function (c) { this.code = c; return this; },
      json: function (o) { this.out = o; return this; } };
  }
  function appeler(query, headers) {
    var r = fauxRes();
    return Promise.resolve(handler({ method: 'GET', query: query, headers: headers || {} }, r))
      .then(function () { return r; }, function () { return r; });
  }

  var avantSecret = process.env.WATCH_SECRET;
  process.env.WATCH_SECRET = SECRET_FICTIF;
  var premier = plans.PLANS[connus[0]];
  var marque = connus[0].split('@')[0], site = connus[0].split('@')[1];

  return Promise.all([
    appeler({ type: 'price-watch-plan', brand: marque, source: site },
      { 'x-watch-secret': SECRET_FICTIF }),
    appeler({ type: 'price-watch-plan', brand: marque, source: site }, {}),
    appeler({ type: 'price-watch-plan', brand: 'ZZMARQUEINCONNUE', source: site },
      { 'x-watch-secret': SECRET_FICTIF })
  ]).then(function (r) {
    process.env.WATCH_SECRET = avantSecret;
    var bon = r[0], sansCle = r[1], inconnu = r[2];

    ok(bon.code === 200 && bon.out && bon.out.urls && bon.out.urls.length === premier.pages,
      '⛔ le point d\'entrée rend les ' + premier.pages + ' adresses (code ' + bon.code
      + ', ' + ((bon.out && bon.out.urls) || []).length + ' adresses)');

    /* ⛔⛔ SÉCURITÉ — la porte du traqueur, pas celle de l'administration. Un
       raccourci iPad ne peut pas produire de jeton Firebase : le faire tomber
       sur `requireAdmin` le refuserait en silence, et les prix cesseraient
       d'être relevés sans un mot. C'est EXACTEMENT la panne du 31/07/2026. */
    ok(sansCle.code === 401 || sansCle.code === 403,
      '⛔⛔ SÉCURITÉ : sans la clé du traqueur, le plan est REFUSÉ (obtenu '
      + sansCle.code + ')');
    ok(bon.code === 200,
      '⛔ …et AVEC la clé du traqueur il passe — sinon le raccourci iPad, qui ne '
      + 'sait pas produire de jeton Firebase, serait refusé en silence (E-404 du '
      + 'traqueur, 31/07 : les prix ont cessé d\'être relevés sans un mot)');

    /* ⛔⛔ SÉCURITÉ — le secret ne ressort par AUCUN chemin. */
    ok(JSON.stringify(bon.out || {}).indexOf(SECRET_FICTIF) === -1,
      '⛔⛔ SÉCURITÉ : la clé du traqueur ne ressort NULLE PART dans la réponse');

    /* ⛔ UN REFUS QUI NE DIT PAS QUOI FAIRE EST UN MUR. */
    ok(inconnu.code === 404,
      '⛔ un plan non déclaré rend 404, pas un plan vide qui ferait tourner le '
      + 'raccourci à vide (obtenu ' + inconnu.code + ')');
    ok(inconnu.out && /ZZMARQUEINCONNUE/i.test(String(inconnu.out.error))
      && String(inconnu.out.error).indexOf(connus[0]) !== -1,
      '⛔ …et il NOMME ce qui a été demandé ET ce qui existe : l\'écart doit sauter '
      + 'aux yeux sans un aller-retour de plus ('
      + JSON.stringify(inconnu.out && inconnu.out.error).slice(0, 120) + ')');

    /* ⛔⛔ LE MODE RAFALE N'EST PAS FACULTATIF. Sans `scan=1`, 67 pages
       relisent la collection à chaque page — le quota Firestore a déjà sauté
       une fois (02/08 : « 8 RESOURCE_EXHAUSTED » sur son écran). L'adresse de
       relevé rendue par le plan le porte, pour qu'il n'ait rien à ajouter. */
    ok(bon.out && /[?&]scan=1(&|$)/.test(String(bon.out.postUrl)),
      '⛔⛔ l\'adresse de relevé rendue porte `scan=1` — sans le cache de balayage, '
      + '67 pages font exploser le quota Firestore ('
      + JSON.stringify(bon.out && bon.out.postUrl) + ')');
    ok(bon.out && /[?&]dryRun=0(&|$)/.test(String(bon.out.postUrl)),
      '⛔ …et `dryRun=0`, sinon le balayage tourne en simulation et n\'écrit RIEN — '
      + 'panne déjà vécue le 01/08, silencieuse de bout en bout');
    /* ⛔ Ce qui reste supposé doit ressortir JUSQUE DANS LA RÉPONSE : c'est
       elle que l'user lit, pas le code. */
    ok(!premier.aVerifier || (bon.out && bon.out.aVerifier),
      '⛔ ce que le plan suppose encore est rendu à l\'user, pas seulement écrit '
      + 'dans le code — c\'est la réponse qu\'il lit');

    return errors;
  }, function (err) {
    process.env.WATCH_SECRET = avantSecret;
    errors.push('⛔ [check-plan-traqueur] harnais mort : ' + (err && err.message));
    return errors;
  });
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-plan-traqueur OK');
  }, function (err) {
    console.error('  ❌ [check-plan-traqueur] harnais mort : ' + err.message);
    process.exit(1);
  });
}
