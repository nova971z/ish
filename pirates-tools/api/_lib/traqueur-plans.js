/* traqueur-plans.js — LES PAGES À BALAYER, DÉCLARÉES UNE FOIS.
 *
 * ⛔ MOTIF, dit et redit par l'user : « arrête de me demander de rajouter
 * quelque chose dans une URL ». Une page fournisseur paginée demande 67 URL
 * différentes ; les lui faire taper une par une est une garantie d'erreur, et
 * une erreur d'URL, ici, c'est un prix qui ne descend pas.
 * Le raccourci demande donc son PLAN au serveur et boucle dessus. Rien à
 * éditer, jamais — et le jour où la pagination du site change, elle change
 * ICI, à un seul endroit, sous le contrôle de la CI.
 *
 * ⛔⛔ CE FICHIER NE DEVINE RIEN. Chaque champ vient d'une observation datée,
 * écrite à côté. E-112 a été payée pour ça : j'avais déduit « 15 produits par
 * page » du pas de l'URL, alors que la page en affiche 60. **Deux points de
 * données ne font pas une grammaire.** Ce qui est SUPPOSÉ est marqué comme
 * tel, et le balayage lui-même le vérifie (voir `aVerifier`).
 *
 * ⚠️ J4 : rien ici n'est un prix. Ce sont des adresses de pages publiques.
 * ⚠️ J3 : aucune donnée personnelle, aucun secret — le secret du traqueur vit
 * dans un EN-TÊTE, jamais dans une URL, et ne doit jamais entrer ici.
 */

var PLANS = {
  /* ── DeWALT chez idealo ────────────────────────────────────────────────
     OBSERVÉ le 03/08/2026, sur SA page et sur SES relevés :
     · l'URL qu'il a envoyée pour « la page sept » porte `100I16-90oM122663` ;
     · la pagination écrite en bas de cette page est « 1 … 6 7 8 … 67 », donc
       le site déclare lui-même 67 pages ;
     · le relevé compte `tuilesDansLaPage: 60` — soixante tuiles cliquables,
       confirmé par l'user (« il y a 60 cartes produits avec 60 prix »).
     SUPPOSÉ, et c'est le seul point qui l'est : que le nombre du chemin soit
     un DÉCALAGE de 15 par page (page 7 → 90 = 6 × 15). Deux points seulement,
     donc `aVerifier` — le balayage tranchera tout seul, voir plus bas. */
  'DEWALT@idealo': {
    site: 'idealo',
    pages: 67,
    pas: 15,
    parPage: 60,
    ordre: 'desc',
    patron: 'https://www.idealo.fr/prechcat/100I16-{offset}oM122663.html?q=dewalt&qr=false&sortKey=maxPrice',
    patronPage1: 'https://www.idealo.fr/prechcat/100I16oM122663.html?q=dewalt&qr=false&sortKey=maxPrice',
    aVerifier: 'le PAS de la pagination (15) est déduit de deux points : page 7 → 90. '
      + 'Le balayage le prouve seul — si le pas est juste, le nombre de références '
      + 'DISTINCTES cumulées croît d\'environ 60 par page ; s\'il est trop petit, les '
      + 'pages se recouvrent et il stagne. C\'est `couverture.refsDistinctes` qui '
      + 'tranche, sans rien avoir à supposer.',
    note: 'trié par prix DÉCROISSANT, donc le balayage part de la DERNIÈRE page — '
      + 'les articles les moins chers bougent le plus.'
  }
};

/* La clé d'un plan. Une marque et une source, rien d'autre : ce sont
   exactement les deux paramètres que le raccourci porte déjà. */
function clefPlan(brand, source) {
  return String(brand || '').toUpperCase() + '@' + String(source || '').toLowerCase();
}

/* ⛔ RENDRE `null` PLUTÔT QU'UN PLAN VIDE. Un plan vide se lit comme « rien à
   balayer » et le raccourci tournerait à vide sans que rien ne le dise ; un
   `null` fait dire au point d'entrée POURQUOI il n'y a pas de plan. */
function plan(brand, source) {
  return PLANS[clefPlan(brand, source)] || null;
}

/* Les clés déclarées — pour que le point d'entrée puisse dire ce qui EXISTE
   quand on lui demande un plan qui n'existe pas. */
function plansConnus() { return Object.keys(PLANS); }

module.exports = { PLANS: PLANS, plan: plan, clefPlan: clefPlan, plansConnus: plansConnus };
