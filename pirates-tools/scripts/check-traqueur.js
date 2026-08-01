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

   ② **Un raccourci resté en simulation.** `dryRun=1` n'écrit RIEN. Festool y
      est resté après la création de ses 50 fiches, parce que la note qui
      justifiait ce mode s'était périmée sans que personne la relise. Le
      raccourci tournait deux fois par jour, pour rien.

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
  Quincaillerie: 'catégorie maison, pas une marque du fournisseur — ces fiches '
    + 'n\'ont pas de page à traquer. Leur coût doit venir d\'ailleurs (relevé saisi), '
    + 'sinon leur prix reste une supposition.'
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
        + 'tourne en `dryRun=' + m[1] + '` : il LIT la page et n\'écrit RIEN. '
        + 'C\'est un mode d\'essai, pas un état de repos — Festool y est resté après la '
        + 'création de ses fiches, et ses prix sont restés des suppositions pendant des jours.');
    }
  });

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-traqueur : chaque marque a une source qui écrit');
}
