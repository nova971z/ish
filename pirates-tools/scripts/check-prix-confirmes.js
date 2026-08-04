#!/usr/bin/env node
'use strict';
/* ══ PORTE — ON NE VEND PAS À UN PRIX QU'ON NE PEUT PAS CONFIRMER ════════════
   `node scripts/check-prix-confirmes.js`

   ⛔⛔ LA PANNE QUE CETTE PORTE INTERDIT, dans les mots de l'user (04/08/2026) :
   « lorsque Firebase n'est plus disponible, car on a explosé la limite
   gratuite, les prix des produits baissent considérablement, c'est n'importe
   quoi. »

   CE QUI SE PASSAIT. `catalog.loadOverrides()` rendait `{}` dans DEUX cas que
   rien ne distinguait : « il n'y a aucun override » et « je n'ai PAS PU les
   lire ». `applyOverrides` sort immédiatement sur une carte vide, le catalogue
   redevenait `products.json` brut — un fichier que le traqueur ne réécrit
   JAMAIS, donc dont l'écart avec la vérité ne fait que croître.

   COMBIEN. Mesuré sur le balayage idealo du 04/08, 141 fiches comparables :
   49 ont un prix de fichier EN DESSOUS du prix recalculé, de 23,9 % en
   moyenne, jusqu'à −70,7 % (DCF887N à 94,48 € au lieu de 322,07 €).

   POURQUOI C'EST DE L'ARGENT ET PAS DE L'AFFICHAGE. `create-payment-intent`
   résolvait ses prix par le MÊME `loadCatalog()`. Le site VENDAIT à ces
   prix-là. Un prix 70 % sous le vrai peut passer SOUS le coût d'achat, et la
   porte J4 exige un prix « exact et complet ». Un paiement refusé se rattrape ;
   une vente à perte, non.

   ⚠️ Cette porte est PURE : elle n'ouvre aucune connexion, ne lit pas
   Firestore, ne dépense aucun quota. Elle éprouve la logique de décision et
   RELIT le code du chemin de paiement. D-018 est en vigueur.

   ⚠️ Portes lues : J3 — aucune donnée personnelle ; J4 — c'est justement ce
   qu'elle défend ; J5 — aucune TVA touchée, le refus tombe avant. */

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');

function corps(ok) {
  /* ── ① LA LOGIQUE DE DÉCISION ─────────────────────────────────────────────
     On recharge le module à neuf : son cache d'overrides est un état de
     module, et une porte qui hérite du cache d'un test précédent mesure
     l'histoire au lieu du code. */
  delete require.cache[require.resolve('../api/_lib/catalog.js')];
  const catalog = require('../api/_lib/catalog.js');

  const envAvant = process.env.FIREBASE_SERVICE_ACCOUNT;

  return (async function () {
    /* Firebase NON CONFIGURÉ : le fichier est la source par construction. Rien
       ne manque, donc les prix sont confirmés — sinon un déploiement sans
       Firebase ne pourrait plus rien vendre. */
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const sansFb = await catalog.loadOverridesEtat();
    ok(sansFb.disponible === true && sansFb.raison === 'firebase-non-configure',
      'Firebase non configuré = mode fichier DÉLIBÉRÉ : les prix sont confirmés, '
      + 'sinon un déploiement sans Firebase ne vendrait plus rien ('
      + JSON.stringify(sansFb.raison) + ')');

    /* Firebase CONFIGURÉ mais injoignable : c'est la panne. Aucun cache en
       mémoire (module fraîchement chargé) → on ne sait pas, et on le dit. */
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"projet":"zz-porte"}';
    const enPanne = await catalog.loadOverridesEtat();
    ok(enPanne.disponible === false,
      '⛔⛔ ARGENT : Firebase configuré mais illisible ⇒ prix NON confirmés. '
      + 'C\'est la distinction qui manquait : `{}` voulait dire à la fois '
      + '« aucun override » et « je n\'ai pas pu lire » (' + JSON.stringify(enPanne.raison) + ')');
    ok(Object.keys(enPanne.overrides).length === 0,
      '⛔ …et la carte rendue est VIDE : on ne fabrique pas d\'overrides '
      + 'plausibles pour boucher le trou');

    const etatCat = await catalog.loadCatalogEtat();
    ok(etatCat.prixConfirmes === false,
      '⛔ la panne remonte jusqu\'au catalogue : `loadCatalogEtat().prixConfirmes` '
      + 'est FAUX, c\'est ce drapeau que lit le paiement');
    ok(Array.isArray(etatCat.produits) && etatCat.produits.length > 0,
      '⛔ …et le catalogue est quand même RENDU : on refuse de VENDRE, pas '
      + 'd\'exister. Vider le catalogue casserait le site au lieu de le protéger');

    const pub = await catalog.loadPublicCatalogEtat();
    ok(pub.prixConfirmes === false,
      '⛔ l\'endpoint public porte le même drapeau — une garde posée sur un seul '
      + 'chemin ne garde rien (E-405)');

    if (envAvant === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = envAvant;
    /* ⛔ Le module a servi avec une fausse variable d'environnement : on le
       jette pour que le reste de la CI reparte propre. */
    delete require.cache[require.resolve('../api/_lib/catalog.js')];

    /* ── ② LE CHEMIN DE PAIEMENT REFUSE, ET ON LE RELIT DANS LE CODE ───────
       On ne peut pas exécuter `create-payment-intent` sans clés de paiement —
       et un point d'entrée qui répond 503 AVANT tout contrôle rendrait cette
       porte verte pour la mauvaise raison. On vérifie donc sur le TEXTE que le
       refus existe, qu'il est placé AVANT la résolution des prix, et qu'il ne
       laisse aucun chemin de repli. */
    const src = fs.readFileSync(path.join(RACINE, 'api', 'create-payment-intent.js'), 'utf8');

    const iEtat = src.indexOf('loadCatalogEtat');
    const iRefus = src.indexOf('PRIX_NON_CONFIRMES');
    const iResolution = src.indexOf('catalog.findByKey');
    ok(iEtat !== -1,
      '⛔⛔ create-payment-intent DOIT passer par `loadCatalogEtat()` : '
      + '`loadCatalog()` rend un tableau sans dire si les prix sont confirmés');
    ok(iRefus !== -1,
      '⛔⛔ …et REFUSER explicitement (code PRIX_NON_CONFIRMES)');
    ok(iEtat !== -1 && iRefus !== -1 && iResolution !== -1 && iRefus < iResolution,
      '⛔⛔ ORDRE : le refus tombe AVANT la résolution des lignes. Placé après, '
      + 'il laisserait calculer un montant faux puis le jetterait — et une '
      + 'refonte le déplacerait sans que rien ne proteste ('
      + iRefus + ' vs ' + iResolution + ')');
    ok(!/catalog\.loadCatalog\s*\(/.test(src),
      '⛔⛔ create-payment-intent n\'appelle PLUS `loadCatalog()` nulle part : '
      + 'un second appel rouvrirait exactement le trou qu\'on vient de fermer');

    /* Le message rendu au client ne doit pas laisser croire à un débit. */
    /* ⚠️ L'apostrophe est ÉCHAPPÉE dans la source (`n\'a`) : chercher `n'a`
       ne trouverait rien et l'assertion serait rouge pour une raison fausse. */
    ok(/(été|ete)\s+d[ée]bit[ée]/i.test(src) && /rien|aucun/i.test(src),
      '⛔ le refus DIT au client que rien n\'a été débité : un 503 muet sur un '
      + 'tunnel de paiement fait croire à un prélèvement fantôme');

    /* ⛔ J3 : le journal du refus ne porte qu'un motif fixe. */
    const ligneLog = (src.match(/console\.error\('\[create-payment-intent\][^\n]*/) || [''])[0];
    ok(ligneLog !== '' && !/items|panier|email|uid|body/i.test(ligneLog),
      '⛔ J3 : le journal du refus ne porte qu\'un motif technique — ni panier, '
      + 'ni identifiant client (' + ligneLog.slice(0, 80) + ')');

    /* ── ③ L'ENDPOINT PUBLIC LE DIT ────────────────────────────────────────── */
    const srcProd = fs.readFileSync(path.join(RACINE, 'api', 'products.js'), 'utf8');
    ok(/prixConfirmes\s*:/.test(srcProd),
      '⛔ /api/products rend `prixConfirmes` : sans ce drapeau le client range '
      + 'un prix de repli dans son cache comme s\'il était frais');

    /* ── ④ LE FILET DU CACHE EN PANNE ─────────────────────────────────────── */
    ok(typeof catalog._internals.CACHE_PANNE_MAX === 'number'
      && catalog._internals.CACHE_PANNE_MAX > 60000,
      'une carte d\'overrides déjà en mémoire reste utilisable pendant une panne '
      + 'passagère — refuser toute vente au premier hoquet serait pire que le mal ('
      + catalog._internals.CACHE_PANNE_MAX + ' ms)');
    ok(catalog._internals.CACHE_PANNE_MAX < 24 * 3600 * 1000,
      '⛔ …mais BORNÉE : un cache sans limite d\'âge finit par mentir autant que '
      + 'le fichier, en se donnant l\'air d\'être la vérité');
  })();
}

const ASSERTIONS_ATTENDUES = 14;

module.exports = async function () {
  const errors = [];
  let n = 0;
  const ok = function (cond, quoi) {
    n++;
    if (!cond) errors.push(quoi);
  };
  try { await corps(ok); }
  catch (e) { errors.push('⛔ corps du contrôle mort : ' + (e && e.message ? e.message : e)); }
  /* ⛔ PRÉALABLE, dans l'enveloppe et jamais dans le corps : un `return` égaré
     ou une exception à mi-parcours laisserait sinon la porte verte avec trois
     assertions rendues. « Non exécuté n'est PAS vert » vaut aussi pour elle. */
  if (n < ASSERTIONS_ATTENDUES) {
    errors.push('⛔ check-prix-confirmes n\'a rendu que ' + n + ' assertions sur '
      + ASSERTIONS_ATTENDUES + ' attendues : contrôle amputé.');
  }
  return errors;
};

if (require.main === module) {
  Promise.resolve(module.exports()).then(function (e) {
    if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
    console.log('✅ check-prix-confirmes OK');
  }, function (err) {
    console.error('  ❌ [check-prix-confirmes] harnais mort : ' + err.message);
    process.exit(1);
  });
}
