/* scripts/check-traqueur.js — CHAQUE MARQUE DU CATALOGUE A UNE SOURCE VIVANTE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE

   Le 01/08/2026, l'user constate 541 prix « estimés » sur son écran d'admin,
   et me le reproche en ces termes : *« c'est le travail du traqueur, c'est pas
   à moi de coller ça […] on a créé un automatisme, c'est pas pour se torcher
   le cul avec »*. Il a raison sur toute la ligne.

   Un prix « estimé » n'est pas une approximation bénigne : le coût d'achat est
   DEVINÉ À L'ENVERS depuis le prix de vente, puis sert à recalculer ce même
   prix. Un cercle qui confirme toujours ce qui existe déjà. La marge affichée
   n'est alors adossée à rien.

   Deux trous ont produit ces 541, et AUCUN ne se voyait :

   ① **Une marque sans source.** `Quincaillerie` — 304 fiches — n'a aucun
      raccourci : ce n'est pas une marque du fournisseur. Ces produits ne
      pouvaient PAS avoir de coût relevé, et rien ne le disait.

   ② **Un document qui MENT sur la configuration réelle.** `docs/TRAQUEUR-URLS.md`
      portait encore `dryRun=1` pour Festool — j'en ai déduit, et ANNONCÉ à
      l'user, que son raccourci tournait en simulation depuis des jours.
      Sa capture d'écran montrait `dryRun=0`. **Le document était en retard,
      pas son installation.** J'ai bâti un diagnostic entier, et cette porte,
      sur la lecture d'une COPIE prise pour la source.

      ⛔ C'est l'origine O6 du registre — « copie périmée au lieu de la source
      vivante » — commise le jour même où je consignais O7. Une configuration
      qui vit dans l'app Raccourcis d'un iPad n'est PAS lisible depuis le
      dépôt : elle se demande, ou elle se lit sur une capture.

   ⛔ Le point commun : dans les deux cas l'automatisme tournait, répondait
   `ok: true`, et ne couvrait pas. **Un automatisme qui échoue en silence est
   pire qu'une tâche manuelle** — on cesse de la surveiller.

   ─────────────────────────────────────────────────────────────────────────
   CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER

   ✅ Toute marque présente dans `products.json` est citée dans
      `docs/TRAQUEUR-URLS.md`, avec un raccourci en `dryRun=0`.
   ⛔ Elle ne sait PAS si le raccourci tourne vraiment, ni si la page
      fournisseur contient bien toutes les références : ça se mesure au
      passage suivant, dans `counts.absentsJamaisReleves` que le traqueur
      renvoie désormais. C'est un PLANCHER : « la source existe et écrit »,
      pas « la couverture est complète ».
   ───────────────────────────────────────────────────────────────────────── */
'use strict';
var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* Marques qui n'ont légitimement AUCUNE source fournisseur, avec leur motif.
   ⛔ Cette liste ne s'allonge pas pour faire taire la porte : une entrée sans
   motif vérifiable, c'est un trou qu'on se cache à soi-même. */
var SANS_SOURCE = {
  /* ⚠️ `Quincaillerie` a vécu ici du 01 au 02/08/2026 : 304 fiches maison sans
     page fournisseur à traquer. RETIRÉES du catalogue le 02/08 par décision de
     l'user (« on les rentrera à l'aide du traqueur, on aura des vraies
     références ») — sauvegarde complète dans l'historique git et
     scratchpad/retraits-quincaillerie-20260802.json. Une dispense sans fiches
     derrière serait un trou masqué : elle part avec elles. */
};

module.exports = function () {
  var errors = [];
  var fProd = path.join(RACINE, 'products.json');
  var fDoc = path.join(RACINE, 'docs', 'TRAQUEUR-URLS.md');

  if (!fs.existsSync(fProd) || !fs.existsSync(fDoc)) {
    errors.push('[check-traqueur] ⛔ PRÉALABLE : products.json ou docs/TRAQUEUR-URLS.md '
      + 'introuvable — cette porte ne vérifierait RIEN.');
    return errors;
  }

  var produits;
  try { produits = JSON.parse(fs.readFileSync(fProd, 'utf8')); }
  catch (e) {
    errors.push('[check-traqueur] ⛔ products.json illisible : ' + e.message);
    return errors;
  }
  if (!Array.isArray(produits)) produits = produits.products || [];
  var doc = fs.readFileSync(fDoc, 'utf8');

  // Marques réellement présentes, avec leur nombre de fiches.
  var parMarque = {};
  produits.forEach(function (p) {
    var b = String(p.brand || '').trim();
    if (b) parMarque[b] = (parMarque[b] || 0) + 1;
  });

  // Préalable : sans marque relevée, la porte verdirait à vide.
  if (!Object.keys(parMarque).length) {
    errors.push('[check-traqueur] ⛔ PRÉALABLE : aucune marque relevée dans products.json. '
      + 'Vert ici voudrait dire « rien n\'a été contrôlé ».');
    return errors;
  }

  /* ⛔ LA COPIE DOIT SE DÉCLARER COMME TELLE.
     Sans cet avertissement en tête, le prochain qui lit ce fichier — moi
     compris — le prendra pour la configuration réelle et affirmera des faits
     sur l'installation de l'user. C'est exactement ce qui s'est passé le
     01/08/2026. La porte exige donc que la mise en garde y figure. */
  if (doc.indexOf('IL NE PROUVE RIEN') === -1) {
    errors.push('[check-traqueur] ⛔ `docs/TRAQUEUR-URLS.md` ne porte plus son avertissement '
      + '« CE FICHIER EST UNE COPIE DE SECOURS. IL NE PROUVE RIEN. » — sans lui, il sera relu '
      + 'comme la configuration réelle des raccourcis, et un diagnostic entier peut se bâtir '
      + 'sur une copie périmée (c\'est arrivé le 01/08/2026).');
  }

  Object.keys(parMarque).forEach(function (marque) {
    var n = parMarque[marque];
    if (SANS_SOURCE[marque]) return;   // trou assumé, motivé, documenté

    /* On cherche un raccourci `brand=MARQUE` dans la doc. La comparaison est
       insensible à la casse : la doc écrit MAKITA, le catalogue écrit Makita. */
    var re = new RegExp('brand=' + marque.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '&dryRun=(\\d)', 'i');
    var m = doc.match(re);

    if (!m) {
      errors.push('[check-traqueur] ⛔ la marque `' + marque + '` compte ' + n + ' fiche(s) '
        + 'au catalogue et AUCUN raccourci de traqueur dans docs/TRAQUEUR-URLS.md. '
        + 'Leur coût d\'achat ne sera jamais relevé : leur prix se calculera sur un coût '
        + 'DEVINÉ depuis le prix de vente — un cercle qui ne prouve rien. '
        + 'Soit on lui crée une source, soit on l\'inscrit dans SANS_SOURCE avec son motif.');
      return;
    }
    if (m[1] !== '0') {
      errors.push('[check-traqueur] ⛔ le raccourci de `' + marque + '` (' + n + ' fiche(s)) '
        + 'est DOCUMENTÉ en `dryRun=' + m[1] + '` : dans ce mode il LIT la page et n\'écrit '
        + 'RIEN. C\'est un mode d\'essai, pas un état de repos.\n      '
        + '⚠️ Cette porte lit le DOCUMENT, pas les raccourcis de l\'iPad — elle ne peut '
        + 'donc signaler qu\'une INCOHÉRENCE DE LA DOC. Vérifier auprès de l\'user avant '
        + 'd\'affirmer quoi que ce soit sur ce qui tourne vraiment chez lui.');
    }
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-traqueur : chaque marque a une source qui écrit');
}
